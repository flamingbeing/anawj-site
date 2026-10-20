// Scan pages (owner, 20 Oct 2026): scanner-style capture of the paper form's pages. Photo, then crop (four corners, magnifier),
// flatten to a portrait page, take out shadows, set the contrast, accept, next page. Everything runs on the phone in plain canvas
// code (js/scan-geom.js). Pages are kept on this phone (IndexedDB), the original photo beside the tidied copy. "Send" uploads
// the tidied copies through the Worker's /scan-api/ (behind Cloudflare Access; worker/scan.js) to the study computer, only on
// prewarmstudy.anawj.com. Nothing here touches patient records or sync. Alignment and reading stay on the study computer.
import { MAX_EDGE, PAGE_W, PAGE_H, fitSize, autoLevels, guessCorners, isConvex, rotateCorners, flattenPage, setContrast, coachFor, quadMove, photoCheck } from './scan-geom.js';
export { MAX_EDGE, fitSize, autoLevels };
export const PAGE_LABELS = Array.from({ length: 14 }, (_, i) => String(i + 1));
const SRC_EDGE = 3200; // the photo is kept at up to this long edge for the flattening (a page fills most of it)
const STEADY = 7, GIVE_UP = 20000; // live camera: frames (about 120 ms apart) held still before the auto photo; auto stops after 20 s

// per-phone choices (this phone only, not synced): the phone's own camera app instead of the live camera, auto photo on or off
const pref = (k, d) => { try { const v = localStorage.getItem('prewarm-scan-' + k); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('prewarm-scan-' + k, v ? '1' : '0'); } catch { /* private window: this visit only */ } };

// the page number to offer next: the first free number after the one just saved, else the first free one; none free: the last
export function nextLabel(taken, after = '') {
  const free = PAGE_LABELS.filter(l => !taken.includes(l)), a = Number(after) || 0;
  return free.find(l => Number(l) > a) || free[0] || PAGE_LABELS[PAGE_LABELS.length - 1];
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
const MODES = [['auto', 'Auto'], ['bw', 'Black and white'], ['color', 'Colour']];
const tick = () => new Promise(r => setTimeout(r, 30)); // let the screen repaint between the heavy steps

// deps: { view, esc, toast, subjects: () => [Subject IDs on this phone] }
export function mount({ view, esc, toast, subjects }) {
  let subject = '', sel = null, urls = [], num = '1', ed = null, queue = [], saving = Promise.resolve(), scanId = '';
  const failed = new Map(); // page id -> why it was not sent (until the next try)
  const url = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
  const free = () => { urls.forEach(URL.revokeObjectURL); urls = []; };
  view.innerHTML = `<div class="stack scan">
    <p class="muted small">Lay the sheet on a darker surface and hold the phone over it, whole page in view: the camera takes the photo by itself once the page is found and still. Then nudge the four corners onto the page if needed; it is flattened and the shadows taken out. Pages stay on this phone; the original photo is kept beside the tidied copy.</p>
    <label class="lab" for="scsub">Subject ID</label>
    <input id="scsub" list="scsubs" autocomplete="off" autocapitalize="characters" placeholder="e.g. DEMO-01"><datalist id="scsubs">${subjects().map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div id="scact" hidden>
      <label class="lab" for="scnum">Page number <small class="muted">(moves on by itself; change it to skip a page)</small></label>
      <select id="scnum" aria-label="Page number"></select>
      <label class="primary filebtn scbig" id="scshotlbl"><span id="scshottxt">📷 Take page 1</span><input id="scshot" type="file" accept="image/*" capture="environment" hidden></label>
      <label class="secondary filebtn">Choose from photos<input id="scpick" type="file" accept="image/*" multiple hidden></label>
      <label class="tog"><input type="checkbox" id="sccamapp"><span>Use phone camera app<small>Instead of the live camera here, on this phone only. For a phone where the live camera is poor.</small></span></label>
    </div>
    <div id="scselbar" class="scselbar" hidden><strong id="scselcount" role="status"></strong><button class="secondary" id="scselall">All</button><button class="secondary" id="scselnone">None</button><button class="secondary scseldel" id="scseldel">Delete</button><button class="secondary" id="scselcancel">Cancel</button></div>
    <div id="sclist" class="scstrip"></div>
    <div id="scsend" hidden><button class="primary" id="scup">Send to the study computer</button><p id="scmsg" class="muted small" role="status"></p></div>
    <div id="scsave" hidden><button class="secondary" id="scdl">Save tidied pages to this phone</button></div>
    <dialog id="scdlg" class="scdlg"><img alt="Scanned page" id="scimg">
      <div class="row"><button class="secondary" id="scorig">Show original</button><button class="primary" id="scclose">Close</button></div>
      <div class="row"><select id="scdlgnum" aria-label="Page number for this photo"></select><button class="secondary" id="scretake">Retake</button><button class="secondary" id="scdel">Delete</button></div>
    </dialog>
    <div id="sclive" class="scedit sclive" hidden role="dialog" aria-label="Live camera">
      <div class="schead"><strong id="sclivetitle">Page</strong><span id="sclivesize" class="small"></span></div>
      <div id="sclivestage" class="scstage"><div id="sclivebox" class="sclivebox"><video id="scvideo" playsinline muted autoplay></video><canvas id="scover" aria-hidden="true"></canvas></div></div>
      <p id="sccoach" class="sccoach" role="status" aria-live="polite">Opening the camera…</p>
      <div id="sclivefail" class="sclivefail" hidden><p id="sclivewhy"></p><button class="primary" id="scfallback">Use phone camera app</button></div>
      <div class="scbar"><button class="secondary" id="sclivedone">Close</button><button class="secondary" id="scauto" aria-pressed="true">Auto photo on</button><button class="secondary" id="sctorch" aria-pressed="false" hidden>Torch off</button></div>
      <button class="primary scbig" id="scsnap" aria-label="Take the photo now">Take photo</button>
    </div>
    <div id="scedit" class="scedit" hidden role="dialog" aria-label="Scan a page">
      <div class="schead"><strong id="sctitle">Page</strong><span id="scstep" class="small"></span></div>
      <div id="scstage" class="scstage"><canvas id="sccrop" aria-label="Page photo with four corner handles"></canvas><canvas id="screv" aria-label="Flattened page" hidden></canvas><canvas id="scloupe" class="scloupe" width="120" height="120" hidden></canvas><div id="scwork" class="scwork" hidden>Flattening…</div></div>
      <p id="schint" class="small scedithint"></p>
      <div id="scmodes" class="scmodes" hidden>${MODES.map(([k, t]) => `<button class="secondary" data-mode="${k}" aria-pressed="false">${t}</button>`).join('')}</div>
      <div class="scbar" id="scbar0" hidden><button class="primary" id="scretake0">Retake</button><button class="secondary" id="scanyway">Use it anyway</button></div>
      <div class="scbar" id="scbar1"><button class="secondary" id="scretake1">Retake</button><button class="secondary" id="scrot">Rotate</button><button class="primary" id="scflat">Flatten</button></div>
      <div class="scbar" id="scbar2" hidden><button class="secondary" id="scback">Adjust corners</button><button class="secondary" id="scretake2">Retake</button><button class="primary" id="scok">Accept and next</button></div>
    </div>
  </div>`;
  const $$ = s => view.querySelector(s);
  const taken = () => (view._pages || []).map(p => p.label).filter(Boolean);

  function setNum(l) {
    num = l;
    $$('#scnum').innerHTML = PAGE_LABELS.map(x => `<option value="${x}" ${x === l ? 'selected' : ''}>${x}${taken().includes(x) ? ' (has a photo: will replace)' : ''}</option>`).join('');
    $$('#scshottxt').textContent = `📷 Take page ${l}`;
  }

  async function draw() {
    free();
    const ok = !!subject;
    $$('#scact').hidden = !ok;
    const pages = ok ? (await listPages(subject)).sort((a, b) => (Number(a.label) || 99) - (Number(b.label) || 99) || a.at - b.at) : [];
    view._pages = pages;
    if (!scanId) scanId = pages.find(p => p.scan)?.scan || '';
    $$('#scsave').hidden = !pages.length;
    $$('#scsend').hidden = !pages.length || !CAN_SEND;
    $$('#sclist').innerHTML = pages.map(p => `<figure data-id="${p.id}">
      <img src="${url(p.clean)}" alt="Page ${esc(p.label || 'not labelled')}" data-open="${p.id}" draggable="false"><b class="scnum">${esc(p.label || '?')}</b><span class="sccheck" aria-hidden="true">✓</span>
      ${p.sentAt ? '<span class="scsent">✓</span>' : failed.has(p.id) ? `<button class="scretry" data-retry="${p.id}" title="${esc(failed.get(p.id))}">Retry</button>` : ''}</figure>`).join('') || (ok ? '<p class="muted small">No pages yet for this Subject ID.</p>' : '');
    setNum(num);
    paintSel();
  }

  // ---------- the capture editor: crop, then flatten and light
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  async function startFile(file, camera, replace, how = '') {
    $$('#scedit').hidden = false; setStep('load');
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }), bw = bmp.width, bh = bmp.height;
      const [sw, sh] = fitSize(bmp.width, bmp.height, SRC_EDGE);
      const work = document.createElement('canvas'); work.width = sw; work.height = sh;
      work.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0, sw, sh); bmp.close?.();
      const [gw, gh] = fitSize(sw, sh, 300), sm = document.createElement('canvas'); sm.width = gw; sm.height = gh;
      const sx = sm.getContext('2d', { willReadFrequently: true }); sx.drawImage(work, 0, 0, gw, gh);
      const g = guessCorners(sx.getImageData(0, 0, gw, gh).data, gw, gh);
      let quad = g.corners.map(p => ({ x: p.x * sw / gw, y: p.y * sh / gh }));
      const wide = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) > Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
      if (wide) quad = rotateCorners(quad); // a sheet photographed sideways: turn it upright
      ed = { file, camera, replace, work, sw, sh, quad, found: g.found, label: num, mode: 'auto', lit: null, used: 'bw', still: { w: bw, h: bh, how: how || (camera ? 'app' : 'file') } };
      if (camera) { // blur and darkness cannot be fixed later: offer a retake now (only after a camera shot)
        const [cw, ch] = fitSize(sw, sh, 1000), cc = document.createElement('canvas'); cc.width = cw; cc.height = ch;
        const cx = cc.getContext('2d', { willReadFrequently: true }); cx.drawImage(work, 0, 0, cw, ch);
        const q = photoCheck(cx.getImageData(0, 0, cw, ch).data, cw, ch, quad.map(p => ({ x: p.x * cw / sw, y: p.y * ch / sh })));
        ed.check = q;
        ed.warn = q.blurry && q.dark ? 'Looks blurry and dark' : q.blurry ? 'Looks blurry: the writing may not read' : q.dark ? 'Looks dark: turn on the torch or more light' : '';
      }
      setStep(ed.warn ? 'check' : 'crop');
    } catch (e) { toast('Could not use that photo: ' + e.message); closeEditor(); nextInQueue(); }
  }
  const closeEditor = () => { $$('#scedit').hidden = true; ed = null; };

  function setStep(step) {
    const chk = step === 'check', crop = step === 'crop' || chk, rev = step === 'review';
    if (ed) ed.step = step;
    $$('#sctitle').textContent = `Page ${ed?.label || num}`;
    $$('#scstep').textContent = chk ? 'Check the photo' : crop ? 'Step 1 of 2: corners' : rev ? 'Step 2 of 2: check the page' : '';
    $$('#sccrop').hidden = !crop; $$('#screv').hidden = !rev; $$('#scbar0').hidden = !chk; $$('#scbar1').hidden = !crop || chk; $$('#scbar2').hidden = !rev; $$('#scmodes').hidden = !rev;
    $$('#scwork').hidden = step !== 'load' && step !== 'work';
    $$('#scwork').textContent = step === 'load' ? 'Opening photo…' : 'Flattening…';
    $$('#schint').textContent = chk ? ed.warn + '. Retake?' : crop ? (ed.found ? 'Drag each corner onto the corner of the paper.' : 'Could not spot the page: drag each corner onto the paper’s corner.') : rev ? 'Shadows taken out. Pick a lighting style if the page looks off.' : '';
    if (crop) { layoutCrop(); if (!chk) checkQuad(); }
  }

  let k = 1; // screen px per photo px in the crop view
  function layoutCrop() {
    const st = $$('#scstage'), c = $$('#sccrop'), d = dpr();
    k = Math.min(st.clientWidth / ed.sw, st.clientHeight / ed.sh);
    const w = Math.round(ed.sw * k), h = Math.round(ed.sh * k);
    c.style.width = w + 'px'; c.style.height = h + 'px'; c.width = Math.round(w * d); c.height = Math.round(h * d);
    drawCrop();
  }
  function drawCrop() {
    const c = $$('#sccrop'), x = c.getContext('2d'), d = dpr();
    x.setTransform(d, 0, 0, d, 0, 0); x.drawImage(ed.work, 0, 0, ed.sw * k, ed.sh * k);
    x.beginPath(); ed.quad.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p.x * k, p.y * k)); x.closePath();
    x.fillStyle = 'rgba(255,212,0,.12)'; x.fill(); x.lineWidth = 2; x.strokeStyle = isConvex(ed.quad) ? '#ffd400' : '#ff4040'; x.stroke();
    ed.quad.forEach((p, i) => {
      x.beginPath(); x.arc(p.x * k, p.y * k, i === ed.drag ? 16 : 13, 0, 7); x.fillStyle = 'rgba(255,212,0,.3)'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke();
    });
  }
  const checkQuad = () => { const ok = isConvex(ed.quad); $$('#scflat').disabled = !ok; if (!ok) $$('#schint').textContent = 'The corners cross over: drag them back round the paper.'; };

  function loupe(i, show) {
    const l = $$('#scloupe'); l.hidden = !show; if (!show) return;
    const p = ed.quad[i], x = l.getContext('2d'), z = Math.min(1, k * 5), half = 60 / z; // window of 120/z photo px around the corner
    x.clearRect(0, 0, 120, 120); x.drawImage(ed.work, p.x - half, p.y - half, half * 2, half * 2, 0, 0, 120, 120);
    x.strokeStyle = '#ff2d55'; x.lineWidth = 1; x.beginPath(); x.moveTo(60, 48); x.lineTo(60, 72); x.moveTo(48, 60); x.lineTo(72, 60); x.stroke();
    const sx = p.x * k, sy = p.y * k, cv = $$('#sccrop'), st = $$('#scstage');
    const left = cv.offsetLeft + sx, top = cv.offsetTop + sy;
    l.style.left = Math.max(0, Math.min(st.clientWidth - 120, left - 60)) + 'px';
    l.style.top = (top < 170 ? top + 50 : top - 170) + 'px';
  }

  function dragSetup() {
    const c = $$('#sccrop'); let at = null;
    const pt = e => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };
    c.onpointerdown = e => {
      const q = pt(e); let best = -1, bd = 48 / k;
      ed.quad.forEach((p, i) => { const dd = Math.hypot(p.x - q.x, p.y - q.y); if (dd < bd) { bd = dd; best = i; } });
      if (best < 0) return;
      at = { i: best, dx: ed.quad[best].x - q.x, dy: ed.quad[best].y - q.y }; ed.drag = best; c.setPointerCapture(e.pointerId); e.preventDefault(); drawCrop(); loupe(best, true);
    };
    c.onpointermove = e => {
      if (!at) return; const q = pt(e), p = ed.quad[at.i];
      p.x = Math.max(0, Math.min(ed.sw, q.x + at.dx)); p.y = Math.max(0, Math.min(ed.sh, q.y + at.dy));
      drawCrop(); loupe(at.i, true); e.preventDefault();
    };
    const up = () => { if (!at) return; at = null; ed.drag = -1; loupe(0, false); drawCrop(); checkQuad(); };
    c.onpointerup = up; c.onpointercancel = up;
  }

  async function flatten() {
    setStep('work'); await tick();
    try {
      const { sw, sh } = ed, src = ed.work.getContext('2d').getImageData(0, 0, sw, sh).data;
      const lit = flattenPage(src, sw, sh, ed.quad);
      if (!lit) throw new Error('the corners do not make a page');
      ed.lit = lit; setStep('review'); renderMode();
    } catch (e) { toast('Could not flatten: ' + e.message); setStep('crop'); }
  }
  function renderMode() {
    const cv = $$('#screv'); cv.width = PAGE_W; cv.height = PAGE_H;
    const img = new ImageData(new Uint8ClampedArray(ed.lit), PAGE_W, PAGE_H);
    ed.used = setContrast(img.data, ed.mode);
    cv.getContext('2d').putImageData(img, 0, 0);
    view.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === ed.mode)));
    $$('[data-mode="auto"]').textContent = ed.mode === 'auto' ? `Auto (${ed.used === 'bw' ? 'black and white' : 'colour'})` : 'Auto';
  }

  // the camera opens again from a button tap (a phone only opens it from a tap), and the save carries on beside it
  function accept() {
    const e = ed, label = e.label, cv = $$('#screv');
    const done = new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('Could not make the tidied copy.')), 'image/jpeg', 0.9)).then(async clean => {
      const old = e.replace ? (view._pages || []).find(p => p.id === e.replace) : (view._pages || []).find(p => p.label === label);
      if (old) await delPage(old.id);
      const nx = (e.sw && e.quad.map(p => ({ x: +(p.x / e.sw).toFixed(4), y: +(p.y / e.sh).toFixed(4) })));
      await putPage({ id: crypto.randomUUID(), subject, label, at: Date.now(), original: e.file, clean, corners: nx, mode: e.mode, still: e.still, check: e.check, scan: old?.scan });
    });
    saving = saving.then(() => done).catch(err => toast('Could not save the page: ' + err.message)).then(draw);
    const after = nextLabel(taken().concat(label), label);
    closeEditor(); setNum(after);
    if (queue.length) nextInQueue(); else if (e.camera) shoot();
  }
  function nextInQueue() { const f = queue.shift(); if (f) startFile(f.file, f.camera, null); }
  function retake() { const e = ed; closeEditor(); $$('#scshot').dataset.replace = e.replace || ''; num = e.label; queue = []; shoot(); }

  const startNext = async () => { await saving; await draw(); };

  $$('#scsub').oninput = e => { subject = e.target.value.trim().toUpperCase(); scanId = ''; num = '1'; draw().then(() => setNum(nextLabel(taken()))); };
  $$('#scnum').onchange = e => setNum(e.target.value);
  $$('#scshot').onchange = async e => {
    const f = [...e.target.files], r = e.target.dataset.replace || null; e.target.dataset.replace = ''; e.target.value = '';
    if (!subject || !f.length) return;
    await startNext(); queue = []; startFile(f[0], true, r);
  };
  $$('#scpick').onchange = async e => {
    const f = [...e.target.files]; e.target.value = '';
    if (!subject || !f.length) return;
    await startNext(); queue = f.slice(1).map(file => ({ file, camera: false })); startFile(f[0], false, null);
  };
  $$('#scflat').onclick = flatten;
  $$('#scrot').onclick = () => { ed.quad = rotateCorners(ed.quad); drawCrop(); checkQuad(); };
  $$('#scback').onclick = () => setStep('crop');
  $$('#scok').onclick = accept;
  $$('#scretake0').onclick = retake; $$('#scretake1').onclick = retake; $$('#scretake2').onclick = retake;
  $$('#scanyway').onclick = () => setStep('crop');
  $$('#scmodes').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) { ed.mode = b.dataset.mode; renderMode(); } };
  addEventListener('resize', () => { if (ed?.step === 'crop' || ed?.step === 'check') layoutCrop(); if (live) layoutLive(); });
  dragSetup();

  // ---------- live camera (owner, 20 Oct 2026): the page outline drawn on the video from guessCorners on a small copy of
  // each frame, a coach line, a photo by itself once the page is found and held still (or the shutter button), torch where
  // the phone has one. The photo is the camera's full-resolution still (ImageCapture) where the browser has it, else the
  // biggest video frame; its size shows at the top and is kept with the page. "Use phone camera app" goes back to the
  // phone's own camera (this phone only), and so does a camera that will not open.
  let live = null;
  const canLive = () => !pref('camapp', false) && !!navigator.mediaDevices?.getUserMedia;
  function shoot() { if (canLive()) openLive(); else $$('#scshot').click(); }
  const say = t => { const c = $$('#sccoach'); if (c.textContent !== t) c.textContent = t; };
  const paintAuto = () => { const on = live?.auto; $$('#scauto').setAttribute('aria-pressed', String(!!on)); $$('#scauto').textContent = on ? 'Auto photo on' : 'Auto photo off'; };

  async function openLive() {
    closeLive();
    const L = live = { auto: pref('auto', true), steady: 0, since: Date.now(), busy: false, torch: false, sm: document.createElement('canvas') };
    $$('#sclive').hidden = false; $$('#sclivefail').hidden = true; $$('#sctorch').hidden = true; $$('#scsnap').disabled = true;
    $$('#sclivetitle').textContent = `Page ${num}`; $$('#sclivesize').textContent = ''; say('Opening the camera…'); paintAuto();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } } });
      if (live !== L) { stream.getTracks().forEach(t => t.stop()); return; }
      L.stream = stream; L.track = stream.getVideoTracks()[0];
      const v = $$('#scvideo'); v.srcObject = stream; await v.play();
      if (live !== L) return;
      if (!v.videoWidth) await new Promise(r => v.addEventListener('loadedmetadata', r, { once: true }));
      $$('#sctorch').hidden = !L.track.getCapabilities?.().torch;
      if ('ImageCapture' in window) {
        try { L.cap = new ImageCapture(L.track); L.photo = await L.cap.getPhotoCapabilities(); } catch { L.cap = null; }
      }
      const pw = L.photo?.imageWidth?.max, ph = L.photo?.imageHeight?.max;
      $$('#sclivesize').textContent = `Camera ${v.videoWidth}×${v.videoHeight}` + (pw ? ` · photo ${pw}×${ph}` : '');
      $$('#scsnap').disabled = false; layoutLive(); look();
    } catch (e) {
      if (live !== L) return;
      $$('#sclivewhy').textContent = `Could not open the live camera (${e.name || e.message}). Use the phone’s camera app for this page, or turn on “Use phone camera app” below the camera button.`;
      $$('#sclivefail').hidden = false; say('');
    }
  }
  function closeLive() {
    const L = live; live = null; if (!L) return;
    clearTimeout(L.timer); L.stream?.getTracks().forEach(t => t.stop());
    const v = $$('#scvideo'); v.pause(); v.srcObject = null; $$('#sclive').hidden = true;
  }
  function layoutLive() {
    const v = $$('#scvideo'), st = $$('#sclivestage'), vw = v.videoWidth, vh = v.videoHeight; if (!vw) return;
    const kk = Math.min(st.clientWidth / vw, st.clientHeight / vh), w = Math.round(vw * kk), h = Math.round(vh * kk), d = dpr(), o = $$('#scover');
    $$('#sclivebox').style.width = w + 'px'; $$('#sclivebox').style.height = h + 'px';
    o.width = Math.round(w * d); o.height = Math.round(h * d); live.k = kk;
  }
  function drawLive(quad, ok) {
    const o = $$('#scover'), x = o.getContext('2d'), d = dpr(), kk = live.k || 1;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, o.width, o.height); if (!quad) return;
    x.setTransform(d * kk, 0, 0, d * kk, 0, 0);
    x.beginPath(); quad.forEach((p, i) => x[i ? 'lineTo' : 'moveTo'](p.x, p.y)); x.closePath();
    x.fillStyle = ok ? 'rgba(47,128,255,.18)' : 'rgba(255,212,0,.12)'; x.fill();
    x.lineWidth = 3 / kk; x.strokeStyle = ok ? '#2f80ff' : '#ffd400'; x.stroke();
    quad.forEach(p => { x.beginPath(); x.arc(p.x, p.y, 9 / kk, 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 3 / kk; x.stroke(); });
  }
  // one look at the video: find the page, coach, count the frames it is held still, take the photo
  function look() {
    const L = live; if (!L || L.busy) return;
    const v = $$('#scvideo'), vw = v.videoWidth, vh = v.videoHeight;
    if (vw) {
      const [gw, gh] = fitSize(vw, vh, 240), sm = L.sm; if (sm.width !== gw) { sm.width = gw; sm.height = gh; }
      const sx = sm.getContext('2d', { willReadFrequently: true }); sx.drawImage(v, 0, 0, gw, gh);
      const g = guessCorners(sx.getImageData(0, 0, gw, gh).data, gw, gh), c = coachFor(g, gw, gh);
      L.steady = c.ok && L.prev && quadMove(L.prev, g.corners, gw, gh) < 0.012 ? L.steady + 1 : 0;
      L.prev = c.ok ? g.corners : null;
      drawLive(g.found ? g.corners.map(p => ({ x: p.x * vw / gw, y: p.y * vh / gh })) : null, c.ok);
      if (L.auto && Date.now() - L.since > GIVE_UP) { L.auto = false; L.gaveUp = true; paintAuto(); }
      if (L.auto && L.steady >= STEADY) return capture();
      say(c.ok ? (L.auto ? 'Hold steady…' : 'Page found: tap Take photo') : c.say + (L.gaveUp ? '. Or tap Take photo' : ''));
    }
    L.timer = setTimeout(look, 120);
  }
  async function capture() {
    const L = live; if (!L || L.busy) return;
    L.busy = true; clearTimeout(L.timer); $$('#scsnap').disabled = true; say('Capturing… hold steady');
    let blob = null, how = 'frame';
    if (L.cap) { // full-resolution still; the torch stays as it is, otherwise no flash
      const opt = {}; if (L.photo?.imageWidth?.max) opt.imageWidth = L.photo.imageWidth.max;
      if (!L.torch && L.photo?.fillLightMode?.includes('off')) opt.fillLightMode = 'off';
      try { blob = await L.cap.takePhoto(opt); how = 'photo'; } catch { try { blob = await L.cap.takePhoto(); how = 'photo'; } catch { blob = null; } }
    }
    if (live !== L) return;
    if (!blob) {
      const v = $$('#scvideo'), c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    }
    if (live !== L) return;
    navigator.vibrate?.(40);
    const r = $$('#scshot').dataset.replace || null; $$('#scshot').dataset.replace = '';
    closeLive();
    if (!blob) return toast('Could not take the photo: try again.');
    await startNext(); queue = []; startFile(blob, true, r, how);
  }
  $$('#scsnap').onclick = capture;
  $$('#sclivedone').onclick = () => { $$('#scshot').dataset.replace = ''; closeLive(); };
  $$('#scauto').onclick = () => { if (!live) return; live.auto = !live.auto; live.since = Date.now(); live.gaveUp = false; live.steady = 0; setPref('auto', live.auto); paintAuto(); };
  $$('#sctorch').onclick = async () => {
    const L = live; if (!L?.track) return;
    try { await L.track.applyConstraints({ advanced: [{ torch: !L.torch }] }); L.torch = !L.torch; }
    catch { $$('#sctorch').hidden = true; return toast('This phone’s torch cannot be used from here.'); }
    $$('#sctorch').setAttribute('aria-pressed', String(L.torch)); $$('#sctorch').textContent = L.torch ? 'Torch on' : 'Torch off';
  };
  $$('#scfallback').onclick = () => { closeLive(); $$('#scshot').click(); };
  // the camera button opens the live camera; with the camera app switch on (or no live camera) the label opens the file picker
  $$('#scshotlbl').addEventListener('click', e => { if (e.target !== $$('#scshot') && canLive()) { e.preventDefault(); openLive(); } });
  $$('#sccamapp').checked = pref('camapp', false);
  $$('#sccamapp').onchange = e => setPref('camapp', e.target.checked);

  // ---------- thumbnails, a page's own dialog, saving to the phone
  const show = id => view._pages.find(p => p.id === id);
  // Press and hold a photo to start selecting; then tap to add or remove, and use the bar to select all, none, delete or cancel.
  function paintSel() {
    if (sel) { const ids = new Set((view._pages || []).map(p => p.id)); sel = new Set([...sel].filter(id => ids.has(id))); }
    const on = !!sel;
    $$('#sclist').classList.toggle('selecting', on);
    $$('#scselbar').hidden = !on;
    $$('#sclist').querySelectorAll('figure').forEach(f => f.classList.toggle('picked', on && sel.has(f.dataset.id)));
    if (on) {
      $$('#scselcount').textContent = `${sel.size} selected`;
      $$('#scseldel').disabled = !sel.size;
    }
  }
  let holdTimer = 0, held = false, holdAt = null;
  const stopHold = () => { clearTimeout(holdTimer); holdTimer = 0; };
  $$('#sclist').addEventListener('pointerdown', e => {
    held = false; stopHold();
    const f = e.target.closest('figure');
    if (!f || e.target.closest('[data-retry]')) return;
    holdAt = [e.clientX, e.clientY];
    holdTimer = setTimeout(() => {
      held = true; sel = sel || new Set(); sel.add(f.dataset.id); navigator.vibrate?.(30); paintSel();
    }, 500);
  });
  $$('#sclist').addEventListener('pointermove', e => { if (holdTimer && Math.hypot(e.clientX - holdAt[0], e.clientY - holdAt[1]) > 10) stopHold(); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) $$('#sclist').addEventListener(t, stopHold);
  $$('#sclist').addEventListener('contextmenu', e => e.preventDefault());
  $$('#scselall').onclick = () => { sel = new Set((view._pages || []).map(p => p.id)); paintSel(); };
  $$('#scselnone').onclick = () => { sel = new Set(); paintSel(); };
  $$('#scselcancel').onclick = () => { sel = null; paintSel(); };
  $$('#scseldel').onclick = async () => {
    const ids = [...(sel || [])]; if (!ids.length || !confirm(`Delete ${ids.length} photo${ids.length > 1 ? 's' : ''} (originals and tidied copies)?`)) return;
    for (const id of ids) await delPage(id);
    sel = null; toast(`Deleted ${ids.length}`); await draw();
  };
  $$('#sclist').onclick = async e => {
    if (held) { held = false; return; }
    if (sel) {
      const f = e.target.closest('figure'); if (!f) return;
      sel.has(f.dataset.id) ? sel.delete(f.dataset.id) : sel.add(f.dataset.id); return paintSel();
    }
    const r = e.target.closest('[data-retry]');
    if (r) return send([show(r.dataset.retry)]);
    const o = e.target.closest('[data-open]');
    if (o) {
      const p = show(o.dataset.open); let orig = false; view._open = p;
      const sh = () => { $$('#scimg').src = url(orig ? p.original : p.clean); $$('#scorig').textContent = orig ? 'Show tidied' : 'Show original'; };
      $$('#scdlgnum').innerHTML = `<option value="">Which page?</option>` + PAGE_LABELS.map(l => `<option ${p.label === l ? 'selected' : ''}>${l}</option>`).join('');
      $$('#scorig').onclick = () => { orig = !orig; sh(); }; sh(); $$('#scdlg').showModal();
    }
  };
  $$('#scdlgnum').onchange = async e => {
    const p = view._open; if (!p) return; p.label = e.target.value; await putPage(p); toast(p.label ? `Page ${p.label}` : 'Label cleared'); await draw();
  };
  $$('#scdel').onclick = async () => {
    const p = view._open; if (!p || !confirm('Delete this photo (original and tidied copy)?')) return;
    await delPage(p.id); $$('#scdlg').close(); await draw();
  };
  $$('#scretake').onclick = () => { const p = view._open; $$('#scdlg').close(); if (!p) return; $$('#scshot').dataset.replace = p.id; num = p.label || num; setNum(num); shoot(); };
  $$('#scclose').onclick = () => $$('#scdlg').close();

  // ---------- sending: all pages not yet sent at once; a page that fails shows Retry on its own
  async function send(todo) {
    const msg = t => { $$('#scmsg').innerHTML = t; };
    todo = todo.filter(p => p && !p.sentAt);
    if (!todo.length) return msg('Everything is already sent.');
    if (todo.some(p => !p.label)) return msg('Choose a page number for every photo first.');
    const labels = (view._pages || []).filter(p => !p.sentAt || todo.includes(p)).map(p => p.label), dup = labels.find((l, i) => labels.indexOf(l) !== i);
    if (dup) return msg(`Two photos are labelled page ${esc(dup)}: delete one, or fix its number.`);
    $$('#scup').disabled = true; msg('Checking sign-in…');
    try {
      if (!await signedIn()) return msg(`Sign in once: <a href="${API}whoami" target="_blank" rel="noopener">open the sign-in page</a>, enter your email, then the code it sends, then come back here and tap Send again.`);
      const scan = view._pages.find(p => p.scan)?.scan || scanId || (scanId = crypto.randomUUID());
      let n = 0, good = 0; const bad = [];
      for (const p of todo) {
        msg(`Sending page ${esc(p.label)} (${++n} of ${todo.length})…`);
        try {
          const r = await fetch(`${API}upload/${scan}/${p.label}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: p.clean, redirect: 'manual' });
          if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `error ${r.status}`); }
          p.scan = scan; p.sentAt = Date.now(); failed.delete(p.id); await putPage(p); good++;
        } catch (err) { failed.set(p.id, err.message); bad.push(`page ${esc(p.label)}: ${esc(err.message)}`); }
      }
      msg(bad.length ? `${good ? good + ' sent. ' : ''}Not sent: ${bad.join('; ')}. Your photos are still on this phone; tap Retry on the page.`
        : `${good} page${good > 1 ? 's' : ''} sent. They stay on this phone too.`);
      await draw();
    } catch (err) { msg('Not sent: ' + esc(err.message) + '. Your photos are still on this phone; try again.'); }
    finally { $$('#scup').disabled = false; }
  }
  $$('#scup').onclick = () => send(view._pages.filter(p => !p.sentAt));
  $$('#scdl').onclick = () => {
    for (const p of view._pages) { const a = document.createElement('a'); a.href = url(p.clean); a.download = fileName(p); a.click(); }
    toast('Saved to this phone’s downloads');
  };
  const hide = () => { if (document.hidden) closeLive(); }; // the phone locked or another app opened: camera off
  document.addEventListener('visibilitychange', hide);
  draw();
  return () => { document.removeEventListener('visibilitychange', hide); closeLive(); free(); };
}
