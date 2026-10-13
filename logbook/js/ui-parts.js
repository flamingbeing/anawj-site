// Labelled parts on screen (the pure rules are in parts.js): the settings for them and the case template (Settings →
// Advanced logging), and the Learning points page (#points, under the Logbook; Logbook → Filter → All learning
// points): every learning point (or any other labelled part, picked at the top) with its case's date and initials,
// newest first, to read back in one place. Tap one to open its case.

import { S, h, add, fill, settings, emptyState, debounce, info, toast, patchLogbook } from './ui-core.js';
import { fmtDate, caseParts } from './engine.js';
import { labelsOn, parseParts, cleanLabels, labelWordOk, cleanCaseTemplate, DEFAULT_LABELS, MAX_LABELS, MAX_TEMPLATE } from './parts.js';
import { editCaseDialog } from './ui-log.js';
import { copyText } from './share.js';

const view = { k: 'lp', q: '', limit: 200 };
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);

// [{ c, part }] for one label, newest case first (a case's points in the order written)
function collect(k, q) {
  const labels = labelsOn(settings()), words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  const list = [...(S.cases || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.createdAt || 0) - (a.createdAt || 0));
  for (const c of list) {
    const { main, parts } = parseParts(caseParts(c).details, labels);
    for (const part of parts) {
      if (part.k !== k || !part.text.trim()) continue;
      const hay = `${part.text} ${main} ${caseParts(c).initials}`.toLowerCase();
      if (words.every(w => hay.includes(w))) out.push({ c, part, main });
    }
  }
  return out;
}

export function renderPoints() {
  const labels = labelsOn(settings());
  if (!labels) {
    return h('section', { class: 'card' }, h('h2', {}, 'Learning points'),
      h('p', { class: 'hint help' }, 'Turn on Labelled parts to collect lines like “lp: check the cuff” from your cases here.'),
      h('a', { class: 'btn', href: '#loggingadv' }, 'Advanced logging settings'));
  }
  if (!labels.some(l => l.k === view.k)) view.k = labels.some(l => l.k === 'lp') ? 'lp' : (labels[0] || {}).k || '';
  const label = () => labels.find(l => l.k === view.k);
  const list = h('ul', { class: 'points-list' });
  const count = h('p', { class: 'hint', 'aria-live': 'polite', style: 'margin:6px 0 0' });
  const more = h('div', { class: 'bar', style: 'justify-content:center;margin-top:12px' });
  let rows = [];
  const paint = () => {
    rows = collect(view.k, view.q);
    const n = new Set(rows.map(r => r.c.id)).size;
    count.textContent = rows.length ? `${rows.length} found in ${n} case${n === 1 ? '' : 's'}` : '';
    fill(list, ...rows.slice(0, view.limit).map(({ c, part, main }) => {
      const p = caseParts(c), first = (main.split('\n').find(l => l.trim()) || '').trim();
      // the whole row is one button that opens the case
      return h('li', { class: 'point-row' }, h('button', { type: 'button', class: 'point-btn', title: 'Open the case', onclick: () => editCaseDialog(c) },
        h('span', { class: 'pt-head' }, h('span', { class: 'dt' }, c.date ? fmtDate(c.date) : (c.dateText || 'No date')),
          p.initials ? h('b', { class: 'ini' }, p.initials) : null, first ? h('span', { class: 'muted' }, clip(first, 60)) : null),
        h('span', { class: 't' }, h('b', { class: 'part-l' }, part.name + ':'), ' ' + part.text)));
    }));
    if (!rows.length) fill(list, h('li', { class: 'empty-li' }, emptyState('search', view.q ? 'Nothing matches' : `No ${((label() || {}).n || 'part').toLowerCase()} yet`,
      view.q ? 'Try fewer words.' : `Write “${view.k}: …” on a line of its own in a case.`)));
    fill(more, rows.length > view.limit ? h('button', { onclick: () => { view.limit += 300; paint(); } }, `Show more (${rows.length - view.limit} left)`) : null);
  };
  const paintSoon = debounce(() => { view.limit = 200; paint(); }, 150);
  const which = h('select', { 'aria-label': 'Which part', onchange: e => { view.k = e.target.value; view.limit = 200; paint(); } },
    labels.map(l => h('option', { value: l.k, selected: l.k === view.k }, l.n)));
  const search = h('input', { type: 'search', placeholder: 'Search these', 'aria-label': 'Search these', value: view.q, oninput: e => { view.q = e.target.value; paintSoon(); } });
  // the list as Markdown, to paste into a note or a reflection
  const copy = h('button', { class: 'small', onclick: () => {
    if (!rows.length) return;
    copyText(rows.map(({ c, part }) => `- ${c.date || 'No date'}${caseParts(c).initials ? ' ' + caseParts(c).initials : ''}: ${part.text.replace(/\n+/g, ' ')}`).join('\n'), 'Copied');
  } }, 'Copy all');
  const wrap = h('div', {},
    h('section', { class: 'card' },
      h('h2', { style: 'margin-bottom:4px' }, 'Learning points'),
      h('p', { class: 'hint help', style: 'margin:0 0 8px' }, 'Every labelled line of this kind in your cases, newest first. Tap one to open its case.'),
      h('div', { class: 'bar', style: 'align-items:flex-end;flex-wrap:nowrap' }, h('label', { class: 'field', style: 'margin:0;flex:1 1 auto;min-width:0' }, 'Show', which), copy),
      h('div', { class: 'bar', style: 'margin-top:8px' }, h('div', { class: 'search-wrap grow' }, search)),
      count),
    h('section', { class: 'card' }, list, more));
  paint();
  return wrap;
}

// ---------- Settings → Advanced logging: Labelled parts and Case template (account settings, both off by default) ----------

const helpLine = (line, ...more) => {
  if (!more.length) return h('p', { class: 'hint help' }, line);
  const [b, p] = info(...more);
  return [h('p', { class: 'hint help' }, line, '\u00a0', b), p];
};
const sw = (label, on, set) => h('label', { class: 'check' }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked: !!on, onchange: e => set(e.target.checked) }), label);
const saveSettings = (patch, note = 'Saved') => patchLogbook({ settings: patch }).then(() => { if (note) toast(note); }, err => toast('Not saved: ' + err.message));

export function partsSettings() {
  const st = settings();
  const editor = labelEditor();
  editor.hidden = !st.labelParts;
  const tpl = h('textarea', { rows: '4', maxlength: String(MAX_TEMPLATE), spellcheck: 'false', 'aria-label': 'Case template', placeholder: 'ASA :\nPE :\nPlan :',
    onchange: e => { const v = cleanCaseTemplate(e.target.value); saveSettings({ caseTpl: v.trim() ? v : null }); } }, st.caseTpl || '');
  const tplBox = h('label', { class: 'field tpl-field', hidden: !st.caseTplOn }, 'Template', tpl);
  return [
    h('h3', {}, 'Labelled parts and template'),
    sw('Labelled parts in the case summary', st.labelParts, v => { editor.hidden = !v; saveSettings({ labelParts: v || null }, v ? 'Labelled parts on' : 'Labelled parts off'); }),
    helpLine('Off by default. A line that starts “lp:” is a learning point.',
      'A line that starts with a label and a colon (lp: …, Plan: …, ASA 2: …) begins a part, which runs to the next label. Logbook rows show the labels in bold; the Logbook filter finds cases by part (has:lp in the search does too) and lists all your learning points. “LP” without a colon (lumbar puncture) is never a label. Learning points never suggest tags. Bold labels in Copy and the export: Settings → Markdown.'),
    editor,
    sw('Start each case from a template', st.caseTplOn, v => { tplBox.hidden = !v; saveSettings({ caseTplOn: v || null }); }),
    helpLine('Off by default. Put into an empty case box when you tap it.',
      'The cursor goes after the first label (or on an empty first line). Lines you leave as they were aren’t saved, so a template with nothing added saves nothing.'),
    tplBox,
  ];
}

// the labels, one small card each: what you type, the name shown in bold, other words for it, hidden in lists
function labelEditor() {
  const body = h('div', { class: 'label-list' });
  const wrap = h('div', { class: 'label-editor' }, body);
  let list = cleanLabels(settings().partLabels);
  const store = next => {
    const clean = cleanLabels(next);
    if (clean.length < next.length) toast('That label is already in the list');
    list = clean; paint();
    return saveSettings({ partLabels: clean });
  };
  const paint = () => fill(body, ...list.map((l, i) => {
    const kIn = h('input', { type: 'text', value: l.k, maxlength: '24', autocapitalize: 'off', spellcheck: 'false', 'aria-label': `Label ${i + 1}: what you type`,
      onchange: e => {
        const v = e.target.value.replace(/\s+/g, ' ').trim();
        if (!labelWordOk(v)) { toast('A label is a word or two: letters first, no number or colon at the end'); e.target.value = l.k; return; }
        store(list.map((x, j) => (j === i ? { ...x, k: v, n: x.n === x.k ? v : x.n } : x)));
      } });
    const nIn = h('input', { type: 'text', value: l.n, maxlength: '40', 'aria-label': `Label ${i + 1}: shown as`,
      onchange: e => store(list.map((x, j) => (j === i ? { ...x, n: e.target.value.trim() || x.k } : x))) });
    const alsoIn = h('input', { type: 'text', value: (l.also || []).join(', '), maxlength: '120', autocapitalize: 'off', spellcheck: 'false', placeholder: 'other words, with commas', 'aria-label': `Label ${i + 1}: also matches`,
      onchange: e => store(list.map((x, j) => (j === i ? { ...x, also: e.target.value.split(',').map(w => w.trim()).filter(Boolean) } : x))) });
    return h('div', { class: 'label-card' },
      h('div', { class: 'label-top' },
        h('label', { class: 'field' }, 'Type', kIn), h('label', { class: 'field' }, 'Shown as', nIn),
        h('button', { type: 'button', class: 'small danger icon-btn', title: 'Remove this label', 'aria-label': `Remove the label ${l.k}`, onclick: () => store(list.filter((_, j) => j !== i)) }, '×')),
      h('div', { class: 'label-bottom' },
        h('label', { class: 'field' }, 'Also matches', alsoIn),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!l.hide, onchange: e => store(list.map((x, j) => (j === i ? { ...x, hide: e.target.checked || undefined } : x))) }), 'Hide in lists')));
  }), list.length ? null : h('p', { class: 'hint' }, 'No labels: add one below.'));
  const addIn = h('input', { type: 'text', maxlength: '24', autocapitalize: 'off', spellcheck: 'false', placeholder: 'e.g. ASA, PE, Ix, Plan', 'aria-label': 'New label',
    onkeydown: e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addOne(); } } });
  const addOne = () => {
    const v = addIn.value.replace(/\s+/g, ' ').trim();
    if (!v) return addIn.focus();
    if (!labelWordOk(v)) return toast('A label is a word or two: letters first, no number or colon at the end');
    if (list.length >= MAX_LABELS) return toast(`${MAX_LABELS} labels at most`);
    addIn.value = '';
    store([...list, { k: v, n: v }]);
  };
  paint();
  add(wrap,
    h('div', { class: 'bar label-add' }, h('div', { class: 'grow' }, addIn), h('button', { type: 'button', class: 'small', onclick: addOne }, '+ Add label')),
    h('p', { class: 'hint help' }, 'Type: what starts the line (“plan” finds “Plan:”). Hidden in lists: left out of Logbook rows, still saved, searched and exported. ',
      h('button', { type: 'button', class: 'small linkish', onclick: () => { list = cleanLabels(undefined); paint(); saveSettings({ partLabels: null }, 'Back to lp and dt'); } }, `Back to ${DEFAULT_LABELS.map(l => l.k).join(' and ')}`)));
  return wrap;
}
