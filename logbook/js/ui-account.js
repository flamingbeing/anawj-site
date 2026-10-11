// Account tab (#account): who you are, "Portfolio details (Section 1)" (the profile that fills
// Section 1 of the exported portfolio), and sign out. Settings are on their own tab (ui-settings.js).
// Profile shape and cleaning: js/profile.js (cleanProfile, SECTIONS, parseSection1).

import { S, h, toast, cloud, fill, debounce, modal, hooks } from './ui-core.js';
import { youCard, signOutCard } from './ui-settings.js';
import { needZip } from './portfolio.js';
import { SECTIONS, emptyProfile, cleanProfile, parseSection1 } from './profile.js';

export function renderAccount() {
  return h('div', {}, youCard(), profileCard(), signOutCard());
}

// SECTIONS entries are { key, title, cols: [{ key, label }] }; tolerate small naming differences.
const secs = () => (SECTIONS || []).map(s => ({
  key: s.key || s.id,
  title: s.title || s.label || s.heading || s.key,
  cols: (s.cols || s.columns || s.fields || []).map(c => typeof c === 'string' ? { key: c, label: c } : { key: c.key || c.id, label: c.label || c.title || c.key, long: !!c.long }),
}));

const current = () => cleanProfile({ ...emptyProfile(), ...((S.logbook && S.logbook.profile) || {}) });

// ---------- autosave ----------

let draft = null;          // the profile being edited (lives across re-renders of the tab)
let status = null;         // the "Saved" / "Saving…" indicator of the card on screen
const setStatus = t => { if (status) status.textContent = t; };
let pending = false;     // a change waits for the debounced save
const saveNow = async () => {
  pending = false;
  if (!draft || !S.user) return;
  const profile = cleanProfile(draft);
  S.logbook = { ...S.logbook, profile };
  try {
    await cloud.saveLogbook(S.user.email, { profile });   // queued locally when offline
    setStatus('Saved');
  } catch (err) { setStatus('Not saved'); toast('Could not save your portfolio details: ' + err.message); }
};
const saveSoon = debounce(saveNow, 800);
const changed = () => { pending = true; setStatus('Saving…'); saveSoon(); };
export const flush = () => { if (pending) { saveSoon.cancel(); saveNow(); } };
// don't lose the last keystrokes when the page is hidden or closed
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('hashchange', flush);

// ---------- the card ----------

function profileCard() {
  if (!pending || !draft) draft = current();   // a re-render mid-edit keeps the unsaved changes
  const p = draft;
  status = h('span', { class: 'acct-status muted', 'aria-live': 'polite' }, '');

  const text = (key, label, attrs = {}) => h('label', { class: 'field' }, label,
    h('input', { type: 'text', value: p[key] || '', maxlength: 2000, oninput: e => { p[key] = e.target.value; changed(); }, ...attrs }));
  const date = (key, label) => h('label', { class: 'field' }, label,
    h('input', { type: 'date', value: p[key] || '', onchange: e => { p[key] = e.target.value; changed(); } }));
  const area = (key, label, hint) => h('label', { class: 'field' }, label, hint ? h('span', { class: 'hint' }, ' (' + hint + ')') : null,
    h('textarea', { rows: 3, maxlength: 4000, oninput: e => { p[key] = e.target.value; changed(); } }, p[key] || ''));
  const sexRadio = (v, label) => h('label', { class: 'check' },
    h('input', { type: 'radio', name: 'acct-sex', value: v, checked: p.sex === v, onchange: () => { p.sex = v; changed(); } }), label);

  const personal = ['familyName', 'givenName', 'sex', 'dob', 'graduation', 'postgrad', 'program', 'programDirector', 'residencyStart', 'seniorStart'];
  const nDone = personal.filter(k => String(p[k] || '').trim()).length;
  const pCount = h('span', { class: 'acct-badge' + (nDone === personal.length ? ' done' : '') }, `${nDone}/${personal.length}`);
  const pair = (...kids) => h('div', { class: 'acct-pair' }, ...kids);

  return h('section', { class: 'card acct' },
    h('div', { class: 'bar', style: 'margin:0' }, h('h2', { style: 'margin:0' }, 'Portfolio details (Section 1)'), h('span', { class: 'grow' }), status),
    h('p', { class: 'hint' }, 'Fills Section 1 of the exported portfolio. Only you (and the programme admins) can see it. Tap a heading to open it.'),
    h('div', { class: 'acct-import' }, h('label', { class: 'btn small' }, 'Fill from my Word portfolio',
      h('input', { type: 'file', accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: true,
        onchange: e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importDocx(f); } }))),

    h('details', { class: 'acct-group', open: nDone < personal.length },
      h('summary', {}, h('span', { class: 'acct-title' }, 'Personal details'), pCount),
      h('div', { class: 'acct-body' },
        pair(text('familyName', 'Family name', { autocomplete: 'family-name' }), text('givenName', 'Given name', { autocomplete: 'given-name' })),
        h('div', { class: 'field' }, 'Sex', h('div', { class: 'row acct-radios' }, sexRadio('M', 'Male'), sexRadio('F', 'Female'))),
        pair(date('dob', 'Date of birth'), h('span')),
        text('graduation', 'Date and place of graduation', { placeholder: 'e.g. 12/06/2018, University of Bristol' }),
        area('postgrad', 'Postgraduate qualifications', 'with dates'),
        pair(text('program', 'Program', { placeholder: 'e.g. NUHS Anaesthesia' }), text('programDirector', 'Program Director')),
        pair(date('residencyStart', 'Residency started'), date('seniorStart', 'Senior residency started')))),

    secs().map(sec => listCard(p, sec)));
}

// Short names for the list headings (the export keeps the portfolio's own titles), and which
// field leads each entry's one-line summary.
const SHORT = { memberships: 'Memberships & activities', awards: 'Awards & prizes', scholarships: 'Scholarships', electives: 'Overseas electives',
  projects: 'Formal project', papers: 'Papers published', courses: 'Courses, seminars & conferences', teaching: 'Teaching experience' };
const LEAD = { memberships: 'org', awards: 'title', scholarships: 'title', electives: 'institution', projects: 'title', papers: 'title', courses: 'details', teaching: 'summary' };

function listCard(p, sec) {
  if (!Array.isArray(p[sec.key])) p[sec.key] = [];
  const rows = p[sec.key];
  const badge = h('span', { class: 'acct-badge' });
  const body = h('div', { class: 'acct-rows' });
  const paintCount = () => { badge.textContent = String(rows.length); badge.hidden = !rows.length; };
  const lead = LEAD[sec.key] || sec.cols[0].key;
  const summary = row => {
    const main = String(row[lead] || '').trim() || sec.cols.map(c => String(row[c.key] || '').trim()).find(Boolean) || '(empty)';
    const rest = sec.cols.filter(c => c.key !== lead).map(c => String(row[c.key] || '').trim()).filter(v => v && v !== main);
    return [h('span', { class: 'acct-item-main' }, main), rest.length ? h('span', { class: 'acct-item-sub' }, rest.join(' · ')) : null];
  };
  const edit = i => {
    const isNew = i == null;
    const row = isNew ? Object.fromEntries(sec.cols.map(c => [c.key, ''])) : { ...rows[i] };
    const fields = sec.cols.map(c => h('label', { class: 'field' }, c.label,
      c.long
        ? h('textarea', { rows: 3, maxlength: 2000, oninput: e => { row[c.key] = e.target.value; } }, row[c.key] || '')
        : h('input', { type: 'text', value: row[c.key] || '', maxlength: 2000, oninput: e => { row[c.key] = e.target.value; } })));
    const m = modal((isNew ? 'Add: ' : 'Edit: ') + (SHORT[sec.key] || sec.title), [
      h('div', { class: 'acct-edit' }, fields),
      h('div', { class: 'bar acct-edit-bar', style: 'margin-top:12px' },
        isNew ? null : h('button', { class: 'danger', onclick: () => { rows.splice(i, 1); m.close(); paint(); paintCount(); changed(); } }, 'Remove'),
        h('span', { class: 'grow' }),
        h('button', { onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'primary', onclick: () => {
          if (!Object.values(row).some(v => String(v).trim())) return toast('Fill in at least one field');
          if (isNew) rows.push(row); else rows[i] = row;
          m.close(); paint(); paintCount(); changed();
        } }, 'Save')),
    ], { sticky: true });
  };
  const paint = () => {
    fill(body,
      rows.length ? h('ul', { class: 'acct-items' }, rows.map((row, i) => h('li', {},
        h('button', { type: 'button', class: 'acct-item', onclick: () => edit(i) }, ...summary(row))))) : null,
      h('div', { class: 'bar', style: 'margin:6px 0 0' },
        h('button', { class: 'small', disabled: rows.length >= 40, onclick: () => edit(null) }, '+ Add')),
      sec.key === 'projects' ? h('label', { class: 'field', style: 'margin-top:10px' }, 'Remarks',
        h('textarea', { rows: 2, maxlength: 4000, oninput: e => { p.projectRemarks = e.target.value; changed(); } }, p.projectRemarks || '')) : null);
  };
  paint(); paintCount();
  return h('details', { class: 'acct-group' },
    h('summary', { title: sec.title }, h('span', { class: 'acct-title' }, SHORT[sec.key] || sec.title), badge),
    h('div', { class: 'acct-body' }, body));
}

// ---------- fill from a Word portfolio ----------

const isBlank = v => v == null || String(v).trim() === '';
const rowKey = r => JSON.stringify(Object.keys(r).sort().map(k => String(r[k] || '').trim().toLowerCase()));

// fills empty fields and appends list rows not already present
export function mergeProfile(base, found) {
  const out = cleanProfile({ ...emptyProfile(), ...base });
  const f = cleanProfile({ ...emptyProfile(), ...found });
  for (const [k, v] of Object.entries(f)) {
    if (Array.isArray(v)) {
      const have = new Set((out[k] || []).map(rowKey));
      for (const r of v) if (!have.has(rowKey(r)) && Object.values(r).some(x => !isBlank(x))) { out[k].push(r); have.add(rowKey(r)); }
    } else if (isBlank(out[k]) && !isBlank(v)) out[k] = v;
  }
  return cleanProfile(out);
}

function summarise(found) {
  const bits = [];
  if (found.familyName || found.givenName) bits.push('name');
  for (const [k, l] of [['sex', 'sex'], ['dob', 'date of birth'], ['graduation', 'graduation'], ['postgrad', 'postgraduate qualifications'], ['program', 'program'], ['programDirector', 'program director'], ['residencyStart', 'residency start'], ['seniorStart', 'senior residency start']])
    if (!isBlank(found[k])) bits.push(l);
  for (const s of secs()) { const n = (found[s.key] || []).length; if (n) bits.push(`${n} ${s.title.toLowerCase()}`); }
  if (!isBlank(found.projectRemarks)) bits.push('project remarks');
  return bits;
}

async function importDocx(file) {
  let found;
  try {
    const Z = await needZip();
    const zip = await Z.loadAsync(file);
    const doc = zip.file('word/document.xml');
    if (!doc) throw new Error('this is not a Word document');
    found = cleanProfile({ ...emptyProfile(), ...(parseSection1(await doc.async('string')) || {}) });
  } catch (err) { toast('Could not read the file: ' + err.message); return; }
  const bits = summarise(found);
  if (!bits.length) { toast('No Section 1 details found in that file.'); return; }
  const m = modal('Fill from Word', [
    h('p', {}, 'Found: ' + bits.join(', ') + '.'),
    h('p', { class: 'hint' }, 'Only empty fields are filled; rows you already have are kept and new ones are added.'),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        m.close();
        saveSoon.cancel();
        draft = mergeProfile(draft || current(), found);
        await saveNow();
        toast('Portfolio details filled in.');
        hooks.render();
      } }, 'Use these details')),
  ]);
}
