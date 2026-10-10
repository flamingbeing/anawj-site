// Reflections screen (#reflect, reached from Progress → Reflections and the Logbook's Reflect
// buttons): list grouped by section and heading with progress, and an editor with one box per
// REFLECTION_SECTIONS item. Drafts autosave (to the cloud and to this device) as you type.

import { REFLECTION_HEADINGS, REFLECTION_SECTIONS } from './categories.js';
import { reflectionProgress, reflectionCounts, HEADING_BY_ID, splitDetails } from './reflections.js';
import { fmtDate } from './engine.js';
import { S, h, toast, cloud, debounce, hooks, rYear, todayISO, confirmBox, add, resetters, scheduleSummary, displayName } from './ui-core.js';
import { renderExportButton } from './portfolio.js';

const DRAFT_KEY = 'apmes-logbook-reflection-draft';
const rv = { editing: null };   // the reflection open in the editor, or null for the list

const mine = () => S.user.email;
const lsGet = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
const lsSet = r => { try { r ? localStorage.setItem(DRAFT_KEY, JSON.stringify(r)) : localStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ } };
resetters.push(() => { rv.editing = null; lsSet(null); });

// Live reflections for the signed-in user (app.js calls this after sign-in).
export function watchMyReflections(email) {
  S.reflections = [];
  return cloud.watchReflections(email, list => {
    S.reflections = list;
    scheduleSummary();
    // don't re-render under someone typing in the editor
    if (S.tab === 'reflect' && !rv.editing) hooks.render();
  });
}
export const summaryReflections = () => reflectionCounts(S.reflections || []);

const blank = (over = {}) => ({
  id: null, headingId: '', subId: null, initials: '', date: todayISO(), jr: rYear() <= 3, diagnosis: '',
  sections: Object.fromEntries(REFLECTION_SECTIONS.map(s => [s.id, ''])), caseId: null, status: 'draft', ...over,
});

// From a logged case: initials = leading capitals, diagnosis = the rest.
export function reflectOnCase(c) {
  const existing = (S.reflections || []).find(r => r.caseId === c.id);
  if (existing) return openEditor(existing);
  const { initials, diagnosis } = splitDetails(c.details);
  openEditor(blank({ initials, diagnosis, date: c.date || null, caseId: c.id }));
}

function openEditor(r) {
  rv.editing = JSON.parse(JSON.stringify(r));
  if (location.hash !== '#reflect') location.hash = '#reflect';
  else hooks.render();
}

export function renderReflect() {
  if (!rv.editing) {
    const d = lsGet();
    if (d && d.restore) { rv.editing = d; delete rv.editing.restore; }
  }
  return rv.editing ? editor() : list();
}

// ---------- list ----------

function list() {
  const all = S.reflections || [];
  const p = reflectionProgress(all);
  const head = h('section', { class: 'card' },
    h('div', { class: 'bar' },
      h('h2', { style: 'margin:0' }, 'Reflections'), h('span', { class: 'grow' }),
      h('button', { class: 'primary', onclick: () => openEditor(blank()) }, '+ New reflection')),
    h('p', { class: 'hint' }, `${p.totals.counted} / ${p.totals.min} counted · ${p.totals.done} complete · ${p.totals.drafts} draft${p.totals.drafts === 1 ? '' : 's'}. `,
      'Each reflection is a different patient, under one heading only. JR = done in R1–R3.'),
    h('p', { class: 'hint' }, 'Generative AI use must follow the NUS guidelines on the use of AI tools in academic work.'),
    h('div', { class: 'bar' }, renderExportButton(() => (S.reflections || []).filter(r => r.status === 'complete'), displayName,
      () => ({ cases: S.cases || [], intake: (S.resident && (S.resident.intake || Number(String(S.resident.rid || '').slice(0, 4)))) || null, rYear: rYear() }))),
    h('p', {}, h('a', { href: '#progress' }, '← Back to case progress')));

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
        h('span', { class: 'c' }, r.status === 'complete' ? h('span', { class: 'flag' }, 'complete') : h('span', { class: 'flag err' }, 'draft'))))) : null));
  }
  const orphans = all.filter(r => !HEADING_BY_ID[r.headingId]);
  if (orphans.length) add(body, h('h3', {}, 'No heading yet'), h('ul', { class: 'cases' }, orphans.map(r => h('li', { onclick: () => openEditor(r) },
    h('span', { class: 'd' }, r.date ? fmtDate(r.date) : '—'), h('span', { class: 't' }, `${r.initials || '??'} ${r.diagnosis || ''}`), h('span', { class: 'c' }, h('span', { class: 'flag err' }, 'draft'))))));
  return h('div', {}, head, body);
}

// ---------- editor ----------

function editor() {
  const r = rv.editing;
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
  const changed = () => { status.textContent = 'Editing…'; lsSet({ ...r, restore: true }); autosave(); };
  const close = async () => { autosave.cancel(); if (hasContent(r)) await persist(); rv.editing = null; lsSet(null); hooks.render(); };

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

  const input = (key, attrs = {}) => h('input', { style: 'font-size:16px', value: r[key] ?? '', ...attrs, oninput: e => { r[key] = e.target.value || (key === 'date' ? null : ''); changed(); } });
  const fields = h('section', { class: 'card' },
    h('div', { class: 'bar' }, h('button', { onclick: close }, '← Reflections'), h('span', { class: 'grow' }), status),
    h('label', { class: 'field' }, 'Heading', headingSelect),
    subWrap,
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
      h('label', { class: 'field' }, 'Patient initials', input('initials', { maxlength: '20', autocapitalize: 'characters', style: 'font-size:16px;width:7em' })),
      h('label', { class: 'field' }, 'Date', input('date', { type: 'date' })),
      h('label', { class: 'field', style: 'display:flex;align-items:center;gap:6px' },
        h('input', { type: 'checkbox', checked: r.jr, style: 'width:22px;height:22px', onchange: e => { r.jr = e.target.checked; changed(); hooks.render(); } }), 'JR case (R1–R3)')),
    h('label', { class: 'field' }, 'Diagnosis / operation', input('diagnosis', { maxlength: '2000' })),
    h('p', { class: 'hint' }, 'De-identified only: initials, no names or NRIC. Generative AI use must follow the NUS guidelines on the use of AI tools in academic work.'));

  const sections = h('section', { class: 'card' }, REFLECTION_SECTIONS.map(s =>
    s.id === 'further' && !r.jr ? null : h('label', { class: 'field', style: 'display:block;margin-bottom:12px' },
      h('b', {}, s.name + (s.optional ? ' (optional)' : '')),
      h('textarea', { rows: '5', maxlength: '20000', placeholder: s.hint, style: 'font-size:16px;width:100%;box-sizing:border-box',
        value: r.sections[s.id] || '', oninput: e => { r.sections[s.id] = e.target.value; changed(); } }))));

  const actions = h('section', { class: 'card' }, h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px' },
    r.status === 'complete'
      ? h('button', { onclick: async () => { r.status = 'draft'; await persist(); hooks.render(); } }, 'Back to draft')
      : h('button', { class: 'primary', onclick: async () => {
        const missing = completeProblems(r);
        if (missing.length) return toast('Before marking complete: ' + missing.join(', '));
        r.status = 'complete'; autosave.cancel(); await persist(); toast('Reflection complete'); rv.editing = null; lsSet(null); hooks.render();
      } }, 'Mark complete'),
    h('span', { class: 'grow' }),
    r.id ? h('button', { class: 'danger', onclick: async () => {
      if (!await confirmBox('Delete reflection?', 'This cannot be undone.', 'Delete', true)) return;
      autosave.cancel();
      try { await cloud.deleteReflection(mine(), r.id); } catch (err) { toast('Could not delete: ' + err.message); }
      rv.editing = null; lsSet(null); hooks.render();
    } }, 'Delete') : null));

  return h('div', {}, fields, sections, actions);
}

const hasContent = r => !!(r.headingId || r.initials || r.diagnosis || Object.values(r.sections || {}).some(Boolean));

export function completeProblems(r) {
  const out = [];
  const hd = HEADING_BY_ID[r.headingId];
  if (!hd) out.push('heading');
  if (hd && hd.subs && !r.subId) out.push('sub-type');
  if (!r.initials) out.push('initials');
  if (!r.date) out.push('date');
  if (!r.diagnosis) out.push('diagnosis');
  for (const s of REFLECTION_SECTIONS) if (!s.optional && !String(r.sections[s.id] || '').trim()) out.push(s.name.toLowerCase());
  return out;
}
