// Reflections tab sub-view: upload reflections from a Word portfolio (.docx). The file is read in the
// browser (reflect-import.js); a review page lists what was found, grouped by heading, each with a checkbox,
// an editable heading, the matched logbook case and warnings; checked ones are added as drafts.

import { REFLECTION_HEADINGS } from './categories.js';
import { HEADING_BY_ID, splitDetails, wordCount, IMAGE_MAX_B64 } from './reflections.js';
import { fmtDate } from './engine.js';
import { S, h, toast, cloud, fill } from './ui-core.js';
import { needZip } from './portfolio.js';
import { parseDocx, sameKey } from './reflect-import.js';

const short = n => n.replace(/\s*\(.*$/, '').replace(/\s+e\.g\..*$/i, '');
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Cases with the same initials (case-insensitive) and date; reflections that look like the same one.
const casesFor = r => (r.initials && r.date ? (S.cases || []).filter(c => c.date === r.date && sameKey(splitDetails(c.details).initials, r.initials)) : []);
const dupOf = r => (S.reflections || []).find(x => x.headingId === r.headingId && x.date === r.date && sameKey(x.initials, r.initials));

// Picture (base64) -> JPEG, longest side ≤ 1400 px, under IMAGE_MAX_B64 (as ui-reflect.js does for photos).
async function compress(img) {
  const bytes = Uint8Array.from(atob(img.data), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: img.mime });
  let src = null;
  try { src = await createImageBitmap(blob); } catch { src = null; }
  if (!src) {
    const url = URL.createObjectURL(blob);
    try { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('picture not readable')); i.src = url; }); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
  if (!W || !H) throw new Error('picture not readable');
  let max = 1400, q = 0.75;
  for (let i = 0; i < 8; i++) {
    const k = Math.min(1, max / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
    ctx.drawImage(src, 0, 0, w, hh);
    const data = c.toDataURL('image/jpeg', q).split(',')[1] || '';
    if (data && data.length < IMAGE_MAX_B64) { if (src.close) src.close(); return { data, mime: 'image/jpeg', w, h: hh }; }
    max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.08);
  }
  throw new Error('picture too large');
}

// The whole upload flow as one view. onDone(): back to the Reflections list.
export function renderImport(onDone) {
  const st = { step: 'pick', file: '', items: [], images: {}, busy: false, added: 0, failed: [] };
  const root = h('div', { class: 'rimp' });
  const back = () => onDone && onDone();
  const draw = () => fill(root, ...(st.step === 'pick' ? pickView() : st.step === 'review' ? reviewView() : doneView()));

  async function onFile(f) {
    st.busy = true; st.file = f.name; draw();
    try {
      if (!/\.docx$/i.test(f.name)) throw new Error('please choose a Word .docx file (in Word: File → Save As → .docx)');
      const Z = await needZip();
      const res = await parseDocx(new Uint8Array(await f.arrayBuffer()), Z);
      if (!res.items.length) throw new Error('no filled reflection tables found (tables with a “Patient’s Initials” header row)');
      st.images = res.images;
      st.items = res.items.map(r => {
        const m = casesFor(r);
        const dup = dupOf(r);
        return { r, on: !dup, dup: !!dup, caseId: m.length === 1 ? m[0].id : null };
      });
      st.step = 'review';
    } catch (err) { toast('Could not read the file: ' + err.message); }
    st.busy = false; draw();
  }

  function pickView() {
    return [h('section', { class: 'card' },
      h('div', { class: 'bar' }, h('button', { onclick: back }, '← Reflections'), h('span', { class: 'grow' })),
      h('h2', {}, 'Upload reflections from Word'),
      h('p', {}, 'Choose your portfolio (.docx). The reflection tables (Section 2: Patient’s Initials, Date, Diagnosis, Case details) are read and you can check what will be added before anything is saved.'),
      h('p', { class: 'hint' }, 'The file stays on this device: it is read in the browser and is not uploaded. Only the reflections you add are saved, as drafts.'),
      h('label', { class: 'btn primary' + (st.busy ? ' disabled' : '') }, st.busy ? `Reading ${st.file}…` : 'Choose Word file (.docx)',
        h('input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: true, disabled: st.busy,
          onchange: e => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); } })))];
  }

  const checked = () => st.items.filter(x => x.on);
  function reviewView() {
    const n = st.items.length;
    const heads = new Set(st.items.map(x => x.r.headingId).filter(Boolean)).size;
    const addLabel = () => (st.busy ? 'Adding…' : `Add ${checked().length} reflection${checked().length === 1 ? '' : 's'}`);
    const addBtn = h('button', { class: 'primary', disabled: st.busy || !checked().length, onclick: doImport }, addLabel());
    const addBtn2 = h('button', { class: 'primary', disabled: st.busy || !checked().length, onclick: doImport }, addLabel());
    const countEl = h('span', { class: 'grow muted' }, `${checked().length} of ${n} ticked`);
    // ticking a box updates the counts in place (a full redraw would jump the scroll position)
    st.refresh = () => { for (const b of [addBtn, addBtn2]) { b.textContent = addLabel(); b.disabled = st.busy || !checked().length; } countEl.textContent = `${checked().length} of ${n} ticked`; };
    const setAll = v => { for (const x of st.items) x.on = v; draw(); };
    const top = h('section', { class: 'card' },
      h('div', { class: 'bar' }, h('button', { onclick: back }, '← Reflections'), h('button', { onclick: () => { st.step = 'pick'; draw(); } }, 'Choose another file'), h('span', { class: 'grow' })),
      h('h2', {}, `Found ${n} reflection${n === 1 ? '' : 's'} in ${heads} heading${heads === 1 ? '' : 's'}`),
      h('p', { class: 'hint' }, `From ${st.file}. Ticked ones are added as drafts. Check the heading and the linked case; possible duplicates of reflections you already have are unticked.`),
      h('div', { class: 'bar' }, h('button', { onclick: () => setAll(true) }, 'Select all'), h('button', { onclick: () => setAll(false) }, 'Select none'), h('span', { class: 'grow' }), addBtn));
    // group by heading, in portfolio order (unrecognised headings last)
    const order = [...REFLECTION_HEADINGS.map(hd => hd.id), ''];
    const groups = order.map(id => [id, st.items.filter(x => x.r.headingId === id)]).filter(([, l]) => l.length);
    const cards = groups.map(([id, l]) => h('section', { class: 'card' },
      h('h3', { class: 'rimp-h' }, id ? short(HEADING_BY_ID[id].name) : 'Heading not recognised', h('span', { class: 'muted' }, ` · ${l.length}`)),
      h('ul', { class: 'rimp-list' }, l.map(item))));
    const bottom = h('section', { class: 'card' }, h('div', { class: 'bar' }, countEl, addBtn2));
    return [top, ...cards, bottom];
  }

  function item(x) {
    const r = x.r;
    const hd = HEADING_BY_ID[r.headingId];
    const words = wordCount(r);
    const first = r.title || (r.summary || Object.values(r.sections || {}).join(' ')).split(/\s+/).slice(0, 12).join(' ');
    const sel = h('select', { class: 'rimp-sel', 'aria-label': 'Heading', onchange: e => {
      r.headingId = e.target.value;
      const nh = HEADING_BY_ID[r.headingId];
      if (!(nh && nh.subs && nh.subs.some(s => s.id === r.subId))) r.subId = null;
      const d = dupOf(r);
      x.dup = !!d;
      draw();
    } }, h('option', { value: '' }, '— choose heading —'), REFLECTION_HEADINGS.map(hd2 => h('option', { value: hd2.id, selected: hd2.id === r.headingId }, short(hd2.name))));
    const subSel = hd && hd.subs ? h('select', { class: 'rimp-sel', 'aria-label': 'Sub-type', onchange: e => { r.subId = e.target.value || null; } },
      h('option', { value: '' }, '— sub-type —'), hd.subs.map(s => h('option', { value: s.id, selected: s.id === r.subId }, s.name))) : null;
    const matches = casesFor(r);
    let caseEl;
    if (matches.length === 1) caseEl = h('span', { class: 'rimp-ok' }, '✓ Linked to case: ' + matches[0].details.slice(0, 60));
    else if (matches.length > 1) caseEl = h('select', { class: 'rimp-sel', 'aria-label': 'Linked case', onchange: e => { x.caseId = e.target.value || null; } },
      h('option', { value: '' }, `${matches.length} matching cases — choose…`), matches.map(c => h('option', { value: c.id, selected: c.id === x.caseId }, c.details.slice(0, 70))));
    else caseEl = h('span', { class: 'muted' }, 'No matching case — link later');
    const warns = [...r.warnings.filter(w => !/sub-type/.test(w) || !r.subId)];
    if (!r.headingId) warns.unshift('choose a heading');
    return h('li', { class: 'rimp-item' + (x.on ? '' : ' off') },
      h('label', { class: 'rimp-check' }, h('input', { type: 'checkbox', checked: x.on, 'aria-label': 'Add this reflection', onchange: e => { x.on = e.target.checked; e.target.closest('li').classList.toggle('off', !x.on); st.refresh(); } })),
      h('div', { class: 'rimp-body' },
        h('div', { class: 'rimp-top' }, h('b', {}, r.initials || '?'), ' · ',
          r.date ? fmtDate(r.date) : h('span', { class: 'rimp-warn' }, r.dateText ? `“${r.dateText}”` : 'no date'), r.jr ? h('span', { class: 'rimp-tag' }, 'JR') : null,
          r.diagnosis ? h('span', { class: 'muted' }, ' · ' + r.diagnosis.split('\n')[0].slice(0, 60)) : null),
        h('div', { class: 'rimp-title' }, first ? (first.length > 90 ? first.slice(0, 90) + '…' : first) : h('span', { class: 'muted' }, '(no text)')),
        h('div', { class: 'muted rimp-meta' }, `${words} words · ${r.sections ? 'older section layout' : `${r.points.length} learning point${r.points.length === 1 ? '' : 's'}`}${r.figures.length ? ` · ${r.figures.length} figure${r.figures.length === 1 ? '' : 's'}` : ''}${r.references.length ? ` · ${r.references.length} ref${r.references.length === 1 ? '' : 's'}` : ''}`),
        h('div', { class: 'rimp-row' }, sel, subSel),
        h('div', { class: 'rimp-case' }, caseEl),
        x.dup ? h('div', { class: 'rimp-warn' }, 'Possible duplicate: you already have a reflection with these initials and date under this heading.') : null,
        warns.length ? h('div', { class: 'rimp-warn' }, warns.join(' · ')) : null));
  }

  async function doImport() {
    const list = checked();
    if (!list.length || st.busy) return;
    st.busy = true; draw();
    st.added = 0; st.failed = [];
    const email = S.user.email;
    const saved = {};   // docx picture rid -> stored image id (a picture used twice is stored once)
    for (const x of list) {
      const r = x.r;
      try {
        const figures = [];
        for (const f of r.figures) {
          try {
            if (!saved[f.rid]) {
              const img = await compress(st.images[f.rid]);
              const id = uid('img');
              await cloud.saveImage(email, { id, ...img, createdAt: Date.now() });
              saved[f.rid] = id;
            }
            figures.push({ id: saved[f.rid], caption: f.caption, point: f.point });
          } catch (err) { console.warn('figure skipped', err); if (f.caption) r.summary = [r.summary, 'Figure (not imported): ' + f.caption].filter(Boolean).join('\n'); }
        }
        const now = Date.now();
        const out = { id: uid('r'), headingId: r.headingId, subId: r.subId, initials: r.initials, date: r.date, jr: r.jr, diagnosis: r.diagnosis,
          title: r.title, summary: r.summary, points: r.points, figures, references: r.references,
          caseId: x.caseId || null, status: 'draft', createdAt: now, updatedAt: now };
        if (r.sections) out.sections = r.sections;
        if (!r.date && r.dateText) out.summary = [`(Date in the Word file: ${r.dateText})`, out.summary].filter(Boolean).join('\n');
        await cloud.saveReflection(email, out);
        st.added++;
      } catch (err) { console.warn(err); st.failed.push(`${r.initials || '?'} ${r.date || r.dateText || ''}: ${err.message}`); }
    }
    st.busy = false; st.step = 'done'; draw();
  }

  function doneView() {
    return [h('section', { class: 'card' },
      h('h2', {}, `Added ${st.added} reflection${st.added === 1 ? '' : 's'} as drafts`),
      h('p', { class: 'hint' }, 'Open each one to check it, link it to its case if it isn’t linked, and mark it complete.'),
      st.failed.length ? h('div', {}, h('p', { class: 'rimp-warn' }, `${st.failed.length} could not be added:`), h('ul', {}, st.failed.map(t => h('li', {}, t)))) : null,
      h('div', { class: 'bar' }, h('button', { class: 'primary', onclick: back }, 'Back to reflections'), h('button', { onclick: () => { st.step = 'pick'; draw(); } }, 'Upload another file')))];
  }

  draw();
  return root;
}
