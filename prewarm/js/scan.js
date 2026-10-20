// Scan pages (owner, 20 Oct 2026): take photos of the paper form's pages, tidy them on the phone, label each page.
// Pages are kept on this phone (IndexedDB), the original photo beside the tidied copy. "Send to the study computer" uploads
// the tidied copies through the Worker's /scan-api/ (behind Cloudflare Access; worker/scan.js) to the study computer, only on
// prewarmstudy.anawj.com. Nothing here touches patient records or sync. Alignment and reading stay on the study computer.
export const MAX_EDGE = 2400;
export const PAGE_LABELS = Array.from({ length: 9 }, (_, i) => String(i + 1));

// Stretch the contrast so the paper is white and the pen is dark: one gain and offset for all channels (keeps colour),
// from the 1st percentile of brightness (ink) to the 70th (paper is most of a page). Changes `data` (RGBA) in place.
// A nearly flat image (blank or very dark) is left alone. Returns the levels used.
export function autoLevels(data) {
  const hist = new Uint32Array(256), n = data.length >> 2;
  for (let i = 0; i < data.length; i += 4) hist[(data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8]++;
  const at = q => { let s = 0; for (let v = 0; v < 256; v++) { s += hist[v]; if (s >= q * n) return v; } return 255; };
  const lo = at(0.01), hi = at(0.7);
  if (hi - lo < 30) return { lo, hi, changed: false };
  const gain = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, (data[i + c] - lo) * gain));
  return { lo, hi, changed: true };
}

// size after scaling the long edge down to MAX_EDGE (never up)
export function fitSize(w, h, max = MAX_EDGE) { const k = Math.min(1, max / Math.max(w, h)); return [Math.round(w * k), Math.round(h * k)]; }

export async function tidy(blob) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const [w, h] = fitSize(bmp.width, bmp.height);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const img = cx.getImageData(0, 0, w, h);
  autoLevels(img.data);
  cx.putImageData(img, 0, 0);
  return new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('Could not make the tidied copy.')), 'image/jpeg', 0.9));
}

// ---------- pages kept on this phone
const DB = 'prewarm-scan';
const open = () => new Promise((ok, no) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { const s = r.result.createObjectStore('pages', { keyPath: 'id' }); s.createIndex('subject', 'subject'); };
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const tx = async (mode, f) => { const db = await open(); return new Promise((ok, no) => { const t = db.transaction('pages', mode); const out = f(t.objectStore('pages')); t.oncomplete = () => { db.close(); ok(out.result); }; t.onerror = () => no(t.error); t.onabort = () => no(t.error); }); };
export const listPages = subject => tx('readonly', s => s.index('subject').getAll(subject)).then(a => a.sort((x, y) => x.at - y.at));
export const putPage = p => tx('readwrite', s => s.put(p));
export const delPage = id => tx('readwrite', s => s.delete(id));

// uploading works only on the real address (Access and the Worker's /scan-api/ are there), not in demo mode or on previews
// (the browser tests try it on localhost with ?scantest)
export const CAN_SEND = typeof location !== 'undefined' && (location.hostname === 'prewarmstudy.anawj.com' && !/[?&]demo\b/.test(location.search)
  || location.hostname === 'localhost' && /[?&]scantest\b/.test(location.search));
const API = '/scan-api/';
const signedIn = async () => {
  try { const r = await fetch(API + 'whoami', { redirect: 'manual', cache: 'no-store' }); return r.ok && (await r.json()).email; } catch { return false; }
};

const fileName = (p, orig) => `${p.subject.replace(/[^\w-]+/g, '_')}-page-${p.label || 'x'}${orig ? '-original' : ''}.jpg`;

// ---------- screen
// deps: { view, esc, toast, subjects: () => [Subject IDs on this phone] }
export function mount({ view, esc, toast, subjects }) {
  let subject = '', urls = [];
  const url = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  const free = () => { urls.forEach(URL.revokeObjectURL); urls = []; };
  view.innerHTML = `<div class="stack scan">
    <p class="muted small">Photograph each page flat on a plain surface, whole sheet in frame, even light. Pages stay on this phone for now; the original photo is kept beside the tidied copy.</p>
    <label class="lab" for="scsub">Subject ID</label>
    <input id="scsub" list="scsubs" autocomplete="off" autocapitalize="characters" placeholder="e.g. DEMO-01"><datalist id="scsubs">${subjects().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div id="scact" hidden>
      <label class="primary filebtn">Take a photo<input id="scshot" type="file" accept="image/*" capture="environment" hidden></label>
      <label class="secondary filebtn">Choose from photos<input id="scpick" type="file" accept="image/*" multiple hidden></label>
    </div>
    <div id="scbusy" class="muted small" hidden>Tidying…</div>
    <div id="sclist" class="scgrid"></div>
    <div id="scsend" hidden><button class="primary" id="scup">Send to the study computer</button><p id="scmsg" class="muted small" role="status"></p></div>
    <div id="scsave" hidden><button class="secondary" id="scdl">Save tidied pages to this phone</button></div>
    <dialog id="scdlg" class="scdlg"><img alt="Scanned page" id="scimg"><div class="row"><button class="secondary" id="scorig">Show original</button><button class="primary" id="scclose">Close</button></div></dialog>
  </div>`;
  const $$ = s => view.querySelector(s);

  async function draw() {
    free();
    const ok = !!subject;
    $$('#scact').hidden = !ok;
    const pages = ok ? await listPages(subject) : [];
    $$('#scsave').hidden = !pages.length;
    $$('#scsend').hidden = !pages.length || !CAN_SEND;
    $$('#sclist').innerHTML = pages.map(p => `<figure data-id="${p.id}">
      <img src="${url(p.clean)}" alt="Page ${esc(p.label || 'not labelled')}" data-open="${p.id}">${p.sentAt ? '<span class="scsent">Sent ✓</span>' : ''}
      <figcaption><select data-label="${p.id}" aria-label="Page number"><option value="">Which page?</option>${PAGE_LABELS.map(l => `<option ${p.label === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="iconbtn" data-del="${p.id}" aria-label="Delete this photo">🗑</button></figcaption></figure>`).join('') || (ok ? '<p class="muted small">No pages yet for this Subject ID.</p>' : '');
    view._pages = pages;
  }

  async function add(files) {
    if (!subject || !files.length) return;
    $$('#scbusy').hidden = false;
    for (const f of files) {
      try { await putPage({ id: crypto.randomUUID(), subject, label: '', at: Date.now(), original: f, clean: await tidy(f) }); }
      catch (e) { toast('Could not use that photo: ' + e.message); }
    }
    $$('#scbusy').hidden = true;
    await draw();
  }

  $$('#scsub').oninput = e => { subject = e.target.value.trim().toUpperCase(); draw(); };
  $$('#scshot').onchange = e => { add([...e.target.files]); e.target.value = ''; };
  $$('#scpick').onchange = e => { add([...e.target.files]); e.target.value = ''; };
  $$('#sclist').onchange = async e => {
    const id = e.target.dataset.label; if (!id) return;
    const p = view._pages.find(x => x.id === id); if (p) { p.label = e.target.value; await putPage(p); toast(p.label ? `Page ${p.label}` : 'Label cleared'); }
  };
  $$('#sclist').onclick = async e => {
    const d = e.target.closest('[data-del]');
    if (d) { if (confirm('Delete this photo (original and tidied copy)?')) { await delPage(d.dataset.del); draw(); } return; }
    const o = e.target.closest('[data-open]');
    if (o) {
      const p = view._pages.find(x => x.id === o.dataset.open); let orig = false;
      const show = () => { $$('#scimg').src = url(orig ? p.original : p.clean); $$('#scorig').textContent = orig ? 'Show tidied' : 'Show original'; };
      $$('#scorig').onclick = () => { orig = !orig; show(); }; show(); $$('#scdlg').showModal();
    }
  };
  $$('#scup').onclick = async e => {
    const msg = t => { $$('#scmsg').innerHTML = t; };
    const todo = view._pages.filter(p => !p.sentAt);
    if (!todo.length) return msg('Everything is already sent.');
    if (todo.some(p => !p.label)) return msg('Choose a page number for every photo first.');
    const labels = todo.map(p => p.label), dup = labels.find((l, i) => labels.indexOf(l) !== i);
    if (dup) return msg(`Two photos are labelled page ${esc(dup)}: delete one, or fix its number.`);
    e.target.disabled = true; msg('Checking sign-in…');
    try {
      if (!await signedIn()) return msg(`Sign in once: <a href="${API}whoami" target="_blank" rel="noopener">open the sign-in page</a>, enter your email, then the code it sends, then come back here and tap Send again.`);
      const scan = view._pages.find(p => p.scan)?.scan || crypto.randomUUID();
      let n = 0;
      for (const p of todo) {
        msg(`Sending page ${esc(p.label)} (${++n} of ${todo.length})…`);
        const r = await fetch(`${API}upload/${scan}/${p.label}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: p.clean, redirect: 'manual' });
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `error ${r.status}`); }
        p.scan = scan; p.sentAt = Date.now(); await putPage(p);
      }
      msg(`${todo.length} page${todo.length > 1 ? 's' : ''} sent. They stay on this phone too.`);
      await draw();
    } catch (err) { msg('Not sent: ' + esc(err.message) + '. Your photos are still on this phone; try again.'); }
    finally { e.target.disabled = false; }
  };
  $$('#scclose').onclick = () => $$('#scdlg').close();
  $$('#scdl').onclick = () => {
    for (const p of view._pages) { const a = document.createElement('a'); a.href = url(p.clean); a.download = fileName(p); a.click(); }
    toast('Saved to this phone’s downloads');
  };
  draw();
  return free;
}
