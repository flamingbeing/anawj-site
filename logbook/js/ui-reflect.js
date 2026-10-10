// Reflections tab (#reflect; also opened by the Logbook's Reflect buttons): list grouped by section
// and heading with progress, a case picker (every reflection is linked to a logged case: "+ New
// reflection" picks the case first and pre-fills from it), and an editor laid out like a
// portfolio Section 2 row: title, case summary, learning points (heading + text), figures with
// captions, references. Drafts autosave (to the cloud and to this device) as you type; images are
// compressed on the phone and saved to their own docs straight away (cloud.saveImage).

import { REFLECTION_HEADINGS, REFLECTION_SECTIONS } from './categories.js';
import { reflectionProgress, reflectionCounts, HEADING_BY_ID, splitDetails, completeProblems, isLegacy, LIMITS, IMAGE_MAX_B64, wordCount, MIN_WORDS } from './reflections.js';
export { completeProblems };
import { fmtDate } from './engine.js';
import { S, h, toast, cloud, debounce, hooks, rYear, todayISO, confirmBox, add, resetters, scheduleSummary, displayName, byNewest, catName } from './ui-core.js';
import { renderExportButton } from './portfolio.js';

const DRAFT_KEY = 'apmes-logbook-reflection-draft';
const rv = { editing: null, thumbs: {}, picking: null };   // the reflection open in the editor (or null for the list); figure previews by image id; case picker state { q, relink }

const mine = () => S.user.email;
const lsGet = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
const lsSet = r => { try { r ? localStorage.setItem(DRAFT_KEY, JSON.stringify(r)) : localStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ } };
resetters.push(() => { rv.editing = null; rv.picking = null; lsSet(null); });

// Live reflections for the signed-in user (app.js calls this after sign-in).
export function watchMyReflections(email) {
  S.reflections = [];
  return cloud.watchReflections(email, list => {
    S.reflections = list;
    scheduleSummary();
    // don't re-render under someone typing in the editor
    if (S.tab === 'reflect' && !rv.editing && !rv.picking) hooks.render();
  });
}
export const summaryReflections = () => reflectionCounts(S.reflections || []);

const blank = (over = {}) => ({
  id: null, headingId: '', subId: null, initials: '', date: todayISO(), jr: rYear() <= 3, diagnosis: '',
  title: '', summary: '', points: [{ heading: '', text: '' }], figures: [], references: [], caseId: null, status: 'draft', ...over,
});

// From a logged case: initials = leading capitals, diagnosis = the rest.
const fromCase = c => { const { initials, diagnosis } = splitDetails(c.details); return { initials, diagnosis, date: c.date || null, caseId: c.id }; };
export function reflectOnCase(c) {
  rv.picking = null;
  const existing = (S.reflections || []).find(r => r.caseId === c.id);
  if (existing) return openEditor(existing);
  openEditor(blank(fromCase(c)));
}

const showTab = () => { if (location.hash !== '#reflect') location.hash = '#reflect'; else hooks.render(); };
function openEditor(r) {
  rv.editing = JSON.parse(JSON.stringify(r));
  showTab();
}
const caseById = id => (id && (S.cases || []).find(c => c.id === id)) || null;
const caseDate = c => (c.date ? fmtDate(c.date) : c.dateText || '—');

export function renderReflect() {
  if (rv.picking) return picker();
  if (!rv.editing) {
    const d = lsGet();
    if (d && d.restore) { rv.editing = d; delete rv.editing.restore; }
  }
  return rv.editing ? editor() : list();
}

// ---------- case picker ----------

// relink: change the case of the reflection open in the editor (keeps what has been written).
function openPicker(relink = false) { rv.picking = { q: '', relink }; showTab(); }

function pickCase(c) {
  const p = rv.picking;
  const other = (S.reflections || []).find(r => r.caseId === c.id && (!p.relink || r.id !== rv.editing.id));
  if (p.relink) {
    if (other) return toast('That case already has a reflection. Each reflection must be a different patient.');
    const r = rv.editing, old = caseById(r.caseId), oldFill = old ? fromCase(old) : null, f = fromCase(c);
    r.caseId = c.id; r.initials = f.initials || r.initials; r.date = f.date || r.date;
    if (!String(r.diagnosis || '').trim() || (oldFill && r.diagnosis === oldFill.diagnosis)) r.diagnosis = f.diagnosis;
    lsSet({ ...r, restore: true });
    rv.picking = null; rv.relinked = true; hooks.render();
    return;
  }
  reflectOnCase(c);
}

function picker() {
  const p = rv.picking;
  const linked = new Set((S.reflections || []).map(r => r.caseId).filter(Boolean));
  const cases = [...(S.cases || [])].sort(byNewest);
  const ul = h('ul', { class: 'cases refl-pick' });
  const count = h('p', { class: 'hint', style: 'margin:6px 0 0' });
  const paint = () => {
    const words = p.q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = cases.filter(c => {
      if (!words.length) return true;
      const hay = `${c.details || ''} ${c.date || ''} ${c.dateText || ''} ${c.date ? fmtDate(c.date) : ''} ${(c.cats || []).map(k => k + ' ' + catName(k)).join(' ')}`.toLowerCase();
      return words.every(w => hay.includes(w));
    });
    const shown = hits.slice(0, 200);
    count.textContent = cases.length ? `${hits.length} case${hits.length === 1 ? '' : 's'}${hits.length > shown.length ? ', showing the newest ' + shown.length + ' (search to narrow)' : ''}` : '';
    ul.replaceChildren(...shown.map(c => {
      const has = linked.has(c.id) && !(p.relink && rv.editing && rv.editing.caseId === c.id);
      const cur = p.relink && rv.editing && rv.editing.caseId === c.id;
      const names = (c.cats || []).map(catName).join(', ');
      return h('li', { tabindex: '0', role: 'button', onclick: () => pickCase(c), onkeydown: e => { if (e.key === 'Enter') pickCase(c); } },
        h('span', { class: 'd' }, caseDate(c)),
        h('span', { class: 't' }, c.details || '(no details)', names ? h('span', { class: 'muted', style: 'display:block;font-size:13px' }, names) : null),
        h('span', { class: 'c' }, cur ? h('span', { class: 'flag' }, 'current') : has ? h('span', { class: 'flag' }, 'has reflection') : null));
    }));
    if (!shown.length) ul.replaceChildren(h('li', { class: 'empty' }, cases.length ? 'No cases match.' : 'No cases logged yet. Log the case first, then reflect on it.'));
  };
  paint();
  const search = h('input', { type: 'search', value: p.q, placeholder: 'Search initials, details, date or procedure', style: 'font-size:16px;width:100%;box-sizing:border-box',
    'aria-label': 'Search cases', oninput: e => { p.q = e.target.value; paint(); } });
  setTimeout(() => search.focus(), 0);
  return h('div', {}, h('section', { class: 'card' },
    h('div', { class: 'bar' },
      h('button', { onclick: () => { rv.picking = null; hooks.render(); } }, p.relink ? '← Back to reflection' : '← Reflections'),
      h('span', { class: 'grow' })),
    h('h2', { style: 'margin:8px 0 4px' }, p.relink ? 'Change the linked case' : 'Which case is this reflection on?'),
    h('p', { class: 'hint', style: 'margin:0 0 8px' }, p.relink ? 'Pick the logged case this reflection is about.' : 'Pick a logged case: the reflection starts with its initials, date and diagnosis filled in.'),
    search, count), h('section', { class: 'card' }, ul));
}

// ---------- list ----------

function list() {
  const all = S.reflections || [];
  const p = reflectionProgress(all);
  const head = h('section', { class: 'card' },
    h('div', { class: 'bar' },
      h('h2', { style: 'margin:0' }, 'Reflections'), h('span', { class: 'grow' }),
      h('button', { class: 'primary', onclick: () => openPicker() }, '+ New reflection')),
    h('p', { class: 'hint' }, `${p.totals.counted} / ${p.totals.min} counted · ${p.totals.done} complete · ${p.totals.drafts} draft${p.totals.drafts === 1 ? '' : 's'}. `,
      'Each reflection is a different patient, under one heading only. JR = done in R1–R3.'),
    h('p', { class: 'hint' }, 'Generative AI use must follow the NUS guidelines on the use of AI tools in academic work.'),
    h('div', { class: 'bar' }, renderExportButton(() => (S.reflections || []).filter(r => r.status === 'complete'), displayName,
      async () => ({ cases: S.cases || [], intake: (S.resident && (S.resident.intake || Number(String(S.resident.rid || '').slice(0, 4)))) || null, rYear: rYear(),
        images: await loadImagesFor((S.reflections || []).filter(r => r.status === 'complete')) }))),
    all.some(r => !r.caseId) ? h('p', { class: 'hint', style: 'color:var(--warn, #b45309)' }, `${all.filter(r => !r.caseId).length} reflection${all.filter(r => !r.caseId).length === 1 ? ' is' : 's are'} not linked to a case yet: open and link before marking complete.`) : null);

  const body = h('section', { class: 'card' });
  let section = '';
  for (const hp of p.headings) {
    if (hp.section !== section) { section = hp.section; add(body, h('h3', { style: 'margin-top:14px' }, section)); }
    const jrTxt = hp.jrNeeded ? ` · JR ${hp.jrDone}/${hp.jrNeeded}${hp.jrDone >= hp.jrNeeded ? ' ✓' : ''}` : '';
    const subsTxt = hp.subs.length ? ' · ' + hp.subs.map(s => `${s.name} ${s.done >= s.min ? '✓' : '✗'}`).join(', ') : '';
    const items = all.filter(r => r.headingId === hp.id);
    add(body, h('div', { class: 'refl-h', style: 'margin:8px 0 4px' },
      h('div', {}, h('i', { class: `dot ${hp.met ? 'done' : hp.done ? 'ontrack' : 'due'}` }), ' ', h('b', {}, `${hp.done}/${hp.min}`), ' ', hp.name, h('span', { class: 'muted' }, jrTxt + subsTxt)),
      hp.issues.length ? h('div', { class: 'hint', style: 'color:var(--warn, #b45309)' }, hp.issues.join(' · ')) : null,
      items.length ? h('ul', { class: 'cases' }, items.map(r => h('li', { tabindex: '0', onclick: () => openEditor(r), onkeydown: e => { if (e.key === 'Enter') openEditor(r); } },
        h('span', { class: 'd' }, (r.jr ? 'JR ' : '') + (r.date ? fmtDate(r.date) : '—')),
        h('span', { class: 't' }, `${r.initials || '??'} ${r.diagnosis || ''}`),
        h('span', { class: 'c' }, r.status === 'complete' ? h('span', { class: 'flag' }, 'complete') : h('span', { class: 'flag err' }, 'draft'), r.caseId ? null : h('span', { class: 'flag err' }, 'not linked'), h('span', { class: 'flag' + (wordCount(r) < MIN_WORDS ? ' err' : '') }, `${wordCount(r)} words`))))) : null));
  }
  const orphans = all.filter(r => !HEADING_BY_ID[r.headingId]);
  if (orphans.length) add(body, h('h3', {}, 'No heading yet'), h('ul', { class: 'cases' }, orphans.map(r => h('li', { onclick: () => openEditor(r) },
    h('span', { class: 'd' }, r.date ? fmtDate(r.date) : '—'), h('span', { class: 't' }, `${r.initials || '??'} ${r.diagnosis || ''}`), h('span', { class: 'c' }, h('span', { class: 'flag err' }, 'draft'), r.caseId ? null : h('span', { class: 'flag err' }, 'not linked'))))));
  return h('div', {}, head, body);
}

// ---------- images ----------

// Images of the given reflections' figures, for the Word export: { id: { data, mime, w, h } }. Missing ones are skipped.
export async function loadImagesFor(reflections) {
  const ids = [...new Set((reflections || []).flatMap(r => (r.figures || []).map(f => f.id)).filter(Boolean))];
  const out = {};
  await Promise.all(ids.map(async id => {
    try {
      const img = await cloud.loadImage(mine(), id);
      if (img && img.data) out[id] = { data: img.data, mime: img.mime || 'image/jpeg', w: img.w, h: img.h };
    } catch { /* skip */ }
  }));
  return out;
}

// Phone photo -> JPEG base64 (no data: prefix), longest side ≤ 1400 px, under IMAGE_MAX_B64.
async function compressImage(file) {
  let src = null;
  try { if (typeof createImageBitmap === 'function') src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { src = null; }
  if (!src) {
    // fallback: <img> (browsers apply EXIF orientation to images by default)
    const url = URL.createObjectURL(file);
    try {
      src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('not an image this browser can read')); i.src = url; });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  const W = src.width || src.naturalWidth, H = src.height || src.naturalHeight;
  if (!W || !H) throw new Error('could not read the image');
  let max = 1400, q = 0.75;
  for (let i = 0; i < 8; i++) {
    const k = Math.min(1, max / Math.max(W, H));
    const w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);   // transparent PNGs -> white, not black
    ctx.drawImage(src, 0, 0, w, hh);
    const data = c.toDataURL('image/jpeg', q).split(',')[1] || '';
    if (data && data.length < IMAGE_MAX_B64) { if (src.close) src.close(); return { data, mime: 'image/jpeg', w, h: hh }; }
    max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.08);
  }
  throw new Error('image is too large even after compressing');
}

const newId = () => 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- editor ----------

const TA = 'font-size:16px;width:100%;box-sizing:border-box;line-height:1.4';
const IN = 'font-size:16px;width:100%;box-sizing:border-box';
const boxCard = (label, hint, ...kids) => h('section', { class: 'card' },
  h('h3', { style: 'margin:0 0 4px' }, label), hint ? h('p', { class: 'hint', style: 'margin:0 0 8px' }, hint) : null, ...kids);
const nonEmpty = s => !!String(s || '').trim();

// Move figures along with their learning points when points are removed or reordered.
function remapFigures(r, map) { for (const f of r.figures || []) if (f.point != null) f.point = map(f.point); }

function editor() {
  const r = rv.editing;
  r.points ||= []; r.figures ||= []; r.references ||= [];
  const legacy = isLegacy(r);
  const status = h('span', { class: 'muted', style: 'font-size:13px' }, r.id ? 'Saved' : 'Not saved yet');
  const persist = async () => {
    lsSet({ ...r, restore: true });
    try {
      r.id ||= Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      r.createdAt ||= Date.now();
      await cloud.saveReflection(mine(), r);
      status.textContent = 'Saved';
    } catch (err) { status.textContent = 'Saved on this device only'; toast('Could not save: ' + err.message); }
  };
  const autosave = debounce(persist, 1200);
  const words = h('span', { 'aria-live': 'polite' });
  const paintWords = () => {
    const n = wordCount(r), ok = n >= MIN_WORDS;
    words.textContent = ok ? `${n} words ✓ meets the ${MIN_WORDS}-word guide` : `${n} / ${MIN_WORDS} words (suggested minimum)`;
    words.style.cssText = `font-size:13px;font-weight:600;color:${ok ? 'var(--ok, #15803d)' : 'var(--warn, #b45309)'}`;
  };
  paintWords();
  const changed = () => { status.textContent = 'Editing…'; paintWords(); lsSet({ ...r, restore: true }); autosave(); };
  const restructure = () => { changed(); hooks.render(); };   // list changed: save and redraw
  const close = async () => { autosave.cancel(); if (hasContent(r)) await persist(); rv.editing = null; rv.thumbs = {}; lsSet(null); hooks.render(); };

  const subWrap = h('div');
  const paintSubs = () => {
    const hd = HEADING_BY_ID[r.headingId];
    subWrap.replaceChildren(...[
      hd && hd.hint ? h('p', { class: 'hint' }, hd.hint) : null,
      hd && hd.subs ? h('label', { class: 'field' }, 'Sub-type',
        h('select', { style: 'font-size:16px', onchange: e => { r.subId = e.target.value || null; changed(); } },
          h('option', { value: '' }, '—'), hd.subs.map(s => h('option', { value: s.id, selected: r.subId === s.id }, s.name)))) : null,
      hd && !hd.jr ? h('p', { class: 'hint' }, 'At most one JR reflection counts under this heading.') : null,
      hd && hd.jr ? h('p', { class: 'hint' }, `${hd.jr} of these must be JR (R1–R3) case${hd.jr > 1 ? 's' : ''}.`) : null,
    ].filter(Boolean));
  };
  paintSubs();

  let sec = '';
  const headingSelect = h('select', { style: 'font-size:16px;max-width:100%', onchange: e => { r.headingId = e.target.value; r.subId = null; paintSubs(); changed(); } },
    h('option', { value: '' }, 'Choose a heading…'),
    REFLECTION_HEADINGS.map(hd => {
      const g = hd.section !== sec ? (sec = hd.section) : null;
      return [g ? h('option', { disabled: true }, `— ${g} —`) : null, h('option', { value: hd.id, selected: r.headingId === hd.id }, hd.name.length > 70 ? hd.name.slice(0, 68) + '…' : hd.name)];
    }));

  const lc = caseById(r.caseId);
  const linkBox = r.caseId
    ? h('div', { class: 'refl-case', style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:8px 10px;margin:8px 0' },
      h('div', { class: 'bar', style: 'gap:8px;align-items:center' },
        h('b', { style: 'font-size:13px' }, 'Linked case'), h('span', { class: 'grow' }),
        h('button', { class: 'small', onclick: () => openPicker(true) }, 'Change case')),
      lc ? h('div', {}, h('span', { class: 'muted' }, caseDate(lc) + ' · '), lc.details || '(no details)',
        (lc.cats || []).length ? h('div', { class: 'muted', style: 'font-size:13px' }, lc.cats.map(catName).join(', ')) : null)
        : h('div', { class: 'hint' }, S.casesLoaded === false ? 'Loading case…' : 'The linked case is no longer in your logbook. Change case to link another.'))
    : h('div', { style: 'border:1px solid var(--warn, #b45309);border-radius:10px;padding:8px 10px;margin:8px 0' },
      h('p', { style: 'margin:0 0 6px' }, h('b', {}, 'Not linked to a case. '), 'Every reflection must be on a logged case; link one before marking complete.'),
      h('button', { class: 'primary', onclick: () => openPicker(true) }, 'Link to a case'));
  if (rv.relinked) { rv.relinked = false; setTimeout(() => { status.textContent = 'Editing…'; autosave(); }, 0); }

  const input = (key, attrs = {}) => h('input', { style: 'font-size:16px', value: r[key] ?? '', ...attrs, oninput: e => { r[key] = e.target.value || (key === 'date' ? null : ''); changed(); } });
  const fields = h('section', { class: 'card' },
    h('div', { class: 'bar' }, h('button', { onclick: close }, '← Reflections'), h('span', { class: 'grow' }), status),
    linkBox,
    h('label', { class: 'field' }, 'Heading', headingSelect),
    subWrap,
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
      h('label', { class: 'field' }, 'Patient initials', input('initials', { maxlength: '20', autocapitalize: 'characters', style: 'font-size:16px;width:7em' })),
      h('label', { class: 'field' }, 'Date', input('date', { type: 'date' })),
      h('label', { class: 'field', style: 'display:flex;align-items:center;gap:6px' },
        h('input', { type: 'checkbox', checked: r.jr, style: 'width:22px;height:22px', onchange: e => { r.jr = e.target.checked; changed(); hooks.render(); } }), 'JR case (R1–R3)')),
    h('label', { class: 'field' }, 'Diagnosis / operation', input('diagnosis', { maxlength: '2000' })),
    h('p', { class: 'hint' }, 'De-identified only: initials, no names or NRIC. Generative AI use must follow the NUS guidelines on the use of AI tools in academic work.'));

  // What APMES wants covered (from the portfolio's reflection elements)
  const guide = h('details', { class: 'card', style: 'padding:12px 16px' },
    h('summary', { style: 'cursor:pointer;font-weight:600' }, 'What APMES wants covered'),
    h('p', { class: 'hint' }, 'Write a case summary, then learning points. Between them, the learning points should cover:'),
    h('ul', { style: 'margin:4px 0 0;padding-left:20px' }, REFLECTION_SECTIONS.filter(s => s.id !== 'description' && (s.id !== 'further' || r.jr))
      .map(s => h('li', { style: 'margin-bottom:4px' }, h('b', {}, s.name), ': ', s.hint))));

  let body;
  if (legacy) {
    body = [h('section', { class: 'card' },
      h('p', { class: 'hint' }, 'This reflection uses the older one-box-per-section layout. It still exports as it is, or convert it to the portfolio layout (case summary + learning points).'),
      h('button', { onclick: () => {
        const sx = r.sections || {};
        r.summary = sx.description || '';
        r.points = REFLECTION_SECTIONS.filter(s => s.id !== 'description' && nonEmpty(sx[s.id])).map(s => ({ heading: s.name, text: sx[s.id] }));
        if (!r.points.length) r.points = [{ heading: '', text: '' }];
        delete r.sections;
        restructure();
      } }, 'Convert to portfolio layout')),
    h('section', { class: 'card' }, REFLECTION_SECTIONS.map(s =>
      s.id === 'further' && !r.jr ? null : h('label', { class: 'field', style: 'display:block;margin-bottom:12px' },
        h('b', {}, s.name + (s.optional ? ' (optional)' : '')),
        h('textarea', { rows: '5', maxlength: '20000', placeholder: s.hint, style: TA,
          value: r.sections[s.id] || '', oninput: e => { r.sections[s.id] = e.target.value; changed(); } }))))];
  } else {
    const title = boxCard('Title', 'Bold heading of the reflection, e.g. “Airway management in a patient with trismus”.',
      h('input', { style: IN, maxlength: String(LIMITS.title), value: r.title || '', placeholder: 'Title', oninput: e => { r.title = e.target.value; changed(); } }));
    const summary = boxCard('Case summary', null,
      h('textarea', { rows: '10', maxlength: String(LIMITS.summary), style: TA, value: r.summary || '',
        placeholder: 'Demographics, history, examination, investigations, anaesthetic plan, events, outcome.',
        oninput: e => { r.summary = e.target.value; changed(); } }));

    const n = r.points.length;
    const points = boxCard('Learning points', 'Each point gets a short underlined heading and your discussion: thoughts and feelings, what went well or badly, analysis with evidence, conclusions, action plan.',
      r.points.map((p, i) => h('div', { style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:10px;margin:0 0 10px' },
        h('div', { class: 'bar', style: 'gap:6px;align-items:center;margin-bottom:6px' },
          h('b', { style: 'font-size:16px' }, `${i + 1}.`),
          h('input', { style: IN + ';flex:1', maxlength: String(LIMITS.pointHeading), value: p.heading || '', placeholder: 'Heading, e.g. Choice of airway management in trismus',
            'aria-label': `Learning point ${i + 1} heading`, oninput: e => { p.heading = e.target.value; changed(); } })),
        h('textarea', { rows: '6', maxlength: String(LIMITS.pointText), style: TA, value: p.text || '', placeholder: 'Discussion',
          'aria-label': `Learning point ${i + 1} text`, oninput: e => { p.text = e.target.value; changed(); } }),
        h('div', { class: 'bar', style: 'gap:6px;margin-top:6px' },
          h('button', { disabled: i === 0, 'aria-label': 'Move up', onclick: () => {
            [r.points[i - 1], r.points[i]] = [r.points[i], r.points[i - 1]];
            remapFigures(r, k => (k === i ? i - 1 : k === i - 1 ? i : k)); restructure();
          } }, '↑'),
          h('button', { disabled: i === n - 1, 'aria-label': 'Move down', onclick: () => {
            [r.points[i + 1], r.points[i]] = [r.points[i], r.points[i + 1]];
            remapFigures(r, k => (k === i ? i + 1 : k === i + 1 ? i : k)); restructure();
          } }, '↓'),
          h('span', { class: 'grow' }),
          h('button', { class: 'danger', onclick: async () => {
            if ((nonEmpty(p.heading) || nonEmpty(p.text)) && !await confirmBox('Remove learning point?', `Learning point ${i + 1} will be removed.`, 'Remove', true)) return;
            r.points.splice(i, 1);
            remapFigures(r, k => (k === i ? (i > 0 ? i - 1 : null) : k > i ? k - 1 : k)); restructure();
          } }, 'Remove')))),
      n < LIMITS.points ? h('button', { onclick: () => { r.points.push({ heading: '', text: '' }); restructure(); } }, '+ Add learning point') : null);

    // figures
    const fileIn = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async e => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (r.figures.length >= LIMITS.figures) return toast(`At most ${LIMITS.figures} images per reflection.`);
      status.textContent = 'Adding image…';
      try {
        const img = await compressImage(file);
        const id = newId();
        await cloud.saveImage(mine(), { id, ...img, createdAt: Date.now() });
        rv.thumbs[id] = 'data:image/jpeg;base64,' + img.data;
        r.figures.push({ id, caption: '', point: r.points.length ? r.points.length - 1 : null });
        autosave.cancel(); await persist(); hooks.render();
      } catch (err) { status.textContent = 'Image not added'; toast('Could not add image: ' + err.message); }
    } });
    const figures = boxCard('Figures (optional)', null,
      h('p', { class: 'hint', style: 'margin:0 0 4px;color:var(--warn, #b45309)' }, 'No faces, names, NRIC, MRN or anything identifying on monitors, labels or screens. Crop before adding.'),
      h('p', { class: 'hint', style: 'margin:0 0 8px;color:var(--warn, #b45309)' }, 'Use your own photos or diagrams. Don’t copy copyrighted figures from papers, books or websites without permission; if you adapt one, cite it under References.'),
      r.figures.map((f, i) => {
        const im = h('img', { alt: f.caption || `Figure ${i + 1}`, style: 'max-width:100%;max-height:220px;display:block;border-radius:6px;background:#eee;min-height:60px' });
        if (rv.thumbs[f.id]) im.src = rv.thumbs[f.id];
        else cloud.loadImage(mine(), f.id).then(d => {
          if (d && d.data) { rv.thumbs[f.id] = `data:${d.mime || 'image/jpeg'};base64,${d.data}`; im.src = rv.thumbs[f.id]; }
          else im.alt = 'Image not found';
        }).catch(() => { im.alt = 'Image not available offline'; });
        return h('div', { style: 'border:1px solid var(--line, #ddd);border-radius:10px;padding:10px;margin:0 0 10px' },
          im,
          h('label', { class: 'field', style: 'display:block;margin-top:6px' }, `Caption (Figure ${i + 1}: …)`,
            h('input', { style: IN, maxlength: String(LIMITS.caption), value: f.caption || '', placeholder: 'e.g. Apnoeic oxygenation', oninput: e => { f.caption = e.target.value; changed(); } })),
          h('label', { class: 'field', style: 'display:block' }, 'Place after',
            h('select', { style: 'font-size:16px;max-width:100%', onchange: e => { f.point = e.target.value === '' ? null : Number(e.target.value); changed(); } },
              r.points.map((p, k) => h('option', { value: String(k), selected: f.point === k }, `Learning point ${k + 1}${nonEmpty(p.heading) ? ': ' + p.heading.slice(0, 40) : ''}`)),
              h('option', { value: '', selected: f.point == null }, 'End (after all learning points)'))),
          h('div', { class: 'bar' }, h('span', { class: 'grow' }), h('button', { class: 'danger', onclick: async () => {
            if (!await confirmBox('Remove image?', 'The image will be deleted.', 'Remove', true)) return;
            r.figures.splice(i, 1); delete rv.thumbs[f.id];
            cloud.deleteImage(mine(), f.id).catch(err => toast('Could not delete image: ' + err.message));
            restructure();
          } }, 'Remove image')));
      }),
      r.figures.length < LIMITS.figures ? h('button', { onclick: () => fileIn.click() }, '+ Add image') : h('p', { class: 'hint' }, `At most ${LIMITS.figures} images.`),
      fileIn);

    // references (optional, collapsed unless there are some)
    const refs = h('details', { class: 'card', style: 'padding:12px 16px', open: r.references.length > 0 },
      h('summary', { style: 'cursor:pointer;font-weight:600' }, `References (optional)${r.references.length ? ' · ' + r.references.length : ''}`),
      r.references.map((x, i) => h('div', { class: 'bar', style: 'gap:6px;margin:6px 0;align-items:center' },
        h('span', {}, `${i + 1}.`),
        h('input', { style: IN + ';flex:1', maxlength: String(LIMITS.reference), value: x, placeholder: 'Author. Title. Journal. Year;vol:pages.', oninput: e => { r.references[i] = e.target.value; changed(); } }),
        h('button', { 'aria-label': 'Remove reference', onclick: () => { r.references.splice(i, 1); restructure(); } }, '✕'))),
      r.references.length < LIMITS.references ? h('button', { style: 'margin-top:6px', onclick: () => { r.references.push(''); restructure(); } }, '+ Add reference') : null);

    body = [title, summary, points, figures, refs];
  }

  const actions = h('section', { class: 'card' }, h('p', { style: 'margin:0 0 8px' }, words), h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
    r.status === 'complete'
      ? h('button', { onclick: async () => { r.status = 'draft'; await persist(); hooks.render(); } }, 'Back to draft')
      : h('button', { class: 'primary', onclick: async () => {
        const missing = completeProblems(r);
        if (missing.length) return toast('Before marking complete: ' + missing.join(', '));
        r.status = 'complete'; autosave.cancel(); await persist(); toast('Reflection complete'); rv.editing = null; rv.thumbs = {}; lsSet(null); hooks.render();
      } }, 'Mark complete'),
    h('span', { class: 'grow' }),
    r.id || r.figures.length ? h('button', { class: 'danger', onclick: async () => {
      if (!await confirmBox('Delete reflection?', 'This cannot be undone. Its images are deleted too.', 'Delete', true)) return;
      autosave.cancel();
      try {
        await Promise.all((r.figures || []).map(f => cloud.deleteImage(mine(), f.id).catch(() => {})));
        if (r.id) await cloud.deleteReflection(mine(), r.id);
      } catch (err) { toast('Could not delete: ' + err.message); }
      rv.editing = null; rv.thumbs = {}; lsSet(null); hooks.render();
    } }, 'Delete') : null));

  return h('div', {}, fields, legacy ? null : guide, body, actions);
}

const hasContent = r => !!(r.headingId || r.initials || r.diagnosis || r.title || r.summary
  || (r.points || []).some(p => p.heading || p.text) || (r.figures || []).length || (r.references || []).some(Boolean)
  || Object.values(r.sections || {}).some(Boolean));
