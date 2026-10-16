// Search (🔍 in the header on every tab, or / on a computer; log2 9e): one box over your cases (and planned ones),
// reflections and notes, with the Logbook's search language and a few more operators (global-search.js; ⓘ lists them).
// Results come grouped by kind with counts, Best match or Newest, the words marked in a short piece of each; a tap opens
// the item where it lives (a case's edit page, the reflection editor, the note). A case found also links its
// reflection and notes. Works offline on what is on this device; notes are loaded the first time Search opens.
import { S, h, fill, hooks, resetters, debounce, catName, tagName, emptyState } from './ui-core.js';
import { buildIndex, search, snippet, GS_HELP } from './global-search.js';
import { insertOperator } from './search-ops.js';
import { HEADING_BY_ID } from './reflections.js';
import { fmtDate } from './engine.js';
import { ensureNotes, openNote, openNotes } from './ui-notepad.js';

const SV0 = () => ({ q: '', sort: 'best', more: {} });
const sv = SV0();
resetters.push(() => Object.assign(sv, SV0()));
const KIND = { case: ['Cases', 'case'], reflection: ['Reflections', 'reflection'], note: ['Notes', 'note'] };
const PER = 20;   // shown per kind before "Show all"

let memo = { key: null, index: null };
function indexNow() {
  const notes = Array.isArray(S.notes) ? S.notes : [];
  const plan = (S.logbook && S.logbook.plan) || [];
  const key = [S.cases, S.reflections, notes, plan];
  if (memo.key && memo.key.every((x, i) => x === key[i])) return memo.index;
  const headingName = id => { const hd = HEADING_BY_ID[id]; return hd ? `${hd.name} ${hd.label || ''}` : ''; };
  memo = { key, index: buildIndex({ cases: S.cases || [], plan, reflections: S.reflections || [], notes }, { catName, tagName, headingName }) };
  return memo.index;
}

export function renderSearch() {
  const wrap = h('section', { class: 'card gsearch' });
  const notesLoading = !Array.isArray(S.notes);
  if (notesLoading) ensureNotes()?.then?.(() => { if (S.tab === 'search') paint(); });
  const box = h('input', { type: 'search', class: 'grow', value: sv.q, placeholder: 'Search cases, reflections and notes', 'aria-label': 'Search everything', enterkeyhint: 'search',
    oninput: e => { sv.q = e.target.value; sv.more = {}; paintSoon(); } });
  const helpList = h('ul', { class: 'gs-help', hidden: true }, GS_HELP.map(([ex, what, ins, at]) => h('li', {},
    h('button', { type: 'button', class: 'small linkish', title: 'Add to the search', onclick: () => {
      const r = insertOperator(box.value, box.selectionStart, ins, at);
      box.value = r.text; sv.q = r.text; box.focus(); box.setSelectionRange(r.caret, r.caret); paint();
    } }, h('code', {}, ex)), ' ', what)));
  const helpBtn = h('button', { type: 'button', class: 'small icon-btn', 'aria-label': 'Search operators', 'aria-expanded': 'false', title: 'Search operators',
    onclick: () => { helpList.hidden = !helpList.hidden; helpBtn.setAttribute('aria-expanded', String(!helpList.hidden)); } }, 'ⓘ');
  const sortSel = h('select', { 'aria-label': 'Sort', onchange: e => { sv.sort = e.target.value; paint(); } },
    [['best', 'Best match'], ['newest', 'Newest']].map(([v, t]) => h('option', { value: v, selected: sv.sort === v }, t)));
  const note = h('p', { class: 'hint gs-note', hidden: true });
  const out = h('div', { class: 'gs-results', 'aria-live': 'polite' });

  function paint() {
    const q = sv.q.trim();
    if (!q) { note.hidden = true; return fill(out, h('p', { class: 'hint' }, 'Type to search your cases, reflections and notes. ⓘ lists the operators (in:notes, status:draft, has:reflection…).')); }
    const r = search(indexNow(), q, { sort: sv.sort, limit: 1e9 });
    note.hidden = !r.unknown.length && !(notesLoading && !Array.isArray(S.notes));
    note.textContent = [...r.unknown.map(x => `“${x.op}” isn’t an operator (searched as text): did you mean ${x.suggest}?`),
      !Array.isArray(S.notes) ? 'Loading your notes…' : ''].filter(Boolean).join(' ');
    const total = r.counts.case + r.counts.reflection + r.counts.note;
    if (!total) return fill(out, emptyState('search', 'Nothing found', 'Try fewer words, or ⓘ for the operators.'));
    fill(out, ['case', 'reflection', 'note'].filter(k => r.counts[k]).map(k => {
      const list = r.results[k], n = r.counts[k], shown = sv.more[k] ? list : list.slice(0, PER);
      return h('div', { class: 'gs-group' },
        h('h3', { class: 'gs-h' }, `${KIND[k][0]} `, h('span', { class: 'muted' }, `(${n})`)),
        h('ul', { class: 'gs-list' }, shown.map(d => row(d, r.words))),
        n > shown.length ? h('button', { class: 'small', onclick: () => { sv.more[k] = true; paint(); } }, `Show all ${n}`) : null);
    }));
  }
  const paintSoon = debounce(paint, 150);
  fill(wrap,
    h('h2', { style: 'margin:0 0 8px' }, 'Search'),
    h('div', { class: 'bar', style: 'gap:8px;flex-wrap:nowrap;margin:0' }, box, helpBtn),
    helpList, note,
    h('div', { class: 'bar gs-sortbar' }, h('label', { class: 'refl-view' }, h('span', { class: 'hint' }, 'Sort '), sortSel)),
    out);
  paint();
  requestAnimationFrame(() => { if (box.isConnected && matchMedia('(pointer: fine)').matches) box.focus(); });
  return wrap;
}

const marks = (text, words) => snippet(text, words).map(([t, on]) => (on ? h('mark', {}, t) : t));
function row(d, words) {
  const it = d.item;
  const date = d.date ? fmtDate(d.date) : d.type === 'case' && d.flags.planned ? 'Planned' : 'No date';
  const tagLine = d.type === 'reflection' ? [HEADING_BY_ID[it.headingId] ? HEADING_BY_ID[it.headingId].label || HEADING_BY_ID[it.headingId].name : 'Uncategorised', it.status === 'complete' ? 'complete' : 'draft'].join(' · ')
    : d.type === 'case' ? [d.flags.planned ? 'planned' : '', d.flags.interesting ? '☆ interesting' : ''].filter(Boolean).join(' · ') : '';
  const refl = d.type === 'case' && d.flags.reflection ? (S.reflections || []).find(r => r.caseId === it.id) : null;
  return h('li', {},
    h('button', { type: 'button', class: 'gs-item', onclick: () => open(d) },
      h('span', { class: 'gs-top' }, h('b', { class: 'gs-title' }, ...marks(d.title, words)), h('span', { class: 'muted gs-date' }, date)),
      d.text && d.text !== d.title ? h('span', { class: 'gs-snip' }, ...marks(d.text, words)) : null,
      tagLine ? h('span', { class: 'muted gs-meta' }, tagLine) : null),
    refl || (d.type === 'case' && d.flags.note) ? h('span', { class: 'gs-links' },
      refl ? h('button', { type: 'button', class: 'small linkish', onclick: () => openRefl(refl) }, '↗ Its reflection') : null,
      d.type === 'case' && d.flags.note ? h('button', { type: 'button', class: 'small linkish', onclick: () => openNotes({ caseId: it.id }) }, '↗ Its notes') : null) : null);
}
async function openRefl(r) { const { openReflection } = await import('./ui-reflect.js'); openReflection(r); }
async function open(d) {
  if (d.type === 'note') return openNote(d.item, 'search');
  if (d.type === 'reflection') return openRefl(d.item);
  if (d.flags.planned) return hooks.navigate('log');   // planned cases are confirmed from the Case tab's plan
  const { editCaseDialog } = await import('./ui-log.js');
  editCaseDialog(d.item);
}
