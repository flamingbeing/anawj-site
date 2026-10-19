// Bulk edit… (Select on the Logbook, Notes and, later, Reflections): one popup for the selected items. Change: a row per
// field, each "Unchanged" until chosen; Actions: copy, share or send just these, or move them to the bin. Review
// changes says what gets replaced (with up to three samples, before → after; from 20 items the button names how many),
// then Save; the toast's Undo puts back the items nobody has changed since. bulkDialog is the shared shell;
// bulkEditDialog (cases) is below, the notes one in ui-notepad.js.
import { applyChange, overwrites, changeLines, missing, none, isEmpty, BIG } from './bulk-change.js';
import { fmtDate, sortCodes, withParents, cleanInitials, caseParts, caseText } from './engine.js';
import { S, h, fill, modal, toast, cat, catShort, updateMany, updatedToast, keepTags, tagLinks, basicHides } from './ui-core.js';
import { moveToBin } from './bin.js';
import { copyText, shareText, caseText as shareCaseText } from './share.js';
import { destinations, openSend } from './ui-send.js';

const TAGS = { parts: caseParts, cleanInitials, sortCodes, withParents, parentOf: code => cat(code).parent || null, keepTags, tagLinks };
export const plural = (n, w = 'case') => `${n} ${w}${n === 1 ? '' : 's'}`;
const sameContent = (a, b) => ['date', 'initials', 'details', 'cats', 'tags', 'reflectTag'].every(k => JSON.stringify(a?.[k] ?? null) === JSON.stringify(b?.[k] ?? null));
export const field = (attrs, set) => h('input', { ...attrs, oninput: e => set(e.target.value), onchange: e => set(e.target.value) });
// a text change's inputs: one box (replace / add) or two (find and replace)
export const textFields = (mode, x, { what }) => (mode === 'find'
  ? [field({ type: 'text', 'aria-label': 'Find', placeholder: 'Find (exact capitals)' }, v => { x.find = v; }),
    field({ type: 'text', 'aria-label': 'Replace with', placeholder: 'Replace with (empty takes it out)' }, v => { x.with = v; })]
  : field({ type: 'text', 'aria-label': what }, v => { x.text = v; }));

// The shell. spec: {
//   title, word ('case' / 'note'), ch (the change, fields null), rows(row) -> the Change rows (row(label, options, onPick)),
//   empty(ch), missing(ch) -> '' or what to fill in, plan(now) -> { pairs: [{ base, next }], skipped: n, why },
//   lines(ch), overwrites(ch), summary(item) -> one line, actions(close) -> buttons, save(pairs) }
export function bulkDialog(spec) {
  const { word, ch } = spec;
  const body = h('div', { class: 'bulk' });
  const m = modal(spec.title, body, { cls: 'full bulk-dlg' });
  function row(label, options, onPick) {
    const extra = h('div', { class: 'bulk-extra' });
    const sel = h('select', { 'aria-label': label, onchange: e => { fill(extra, ...[onPick(e.target.value)].flat().filter(Boolean)); paintNote(); } },
      [['', 'Unchanged'], ...options].map(([v, t]) => h('option', { value: v }, t)));
    return h('div', { class: 'bulk-row' }, h('label', { class: 'bulk-l' }, label), h('div', { class: 'bulk-c' }, sel, extra));
  }
  const rows = spec.rows(row);
  const note = h('p', { class: 'hint bulk-note' });
  const paintNote = () => { note.textContent = spec.empty(ch) ? 'Choose what to change. Every field stays as it is until you choose.' : 'You’ll see what changes before anything is saved.'; };
  paintNote();
  const close = () => m.close();
  const actions = h('div', { class: 'bar bulk-acts' }, spec.actions(close));
  const step1 = () => fill(body,
    h('h3', { class: 'bulk-h' }, 'Change'), rows, note,
    h('h3', { class: 'bulk-h' }, 'Actions'),
    h('p', { class: 'hint' }, `For just these ${plural(spec.count, word)}.`), actions,
    h('div', { class: 'bar bulk-btns' }, h('span', { class: 'grow' }),
      h('button', { onclick: close }, 'Cancel'),
      h('button', { class: 'primary', onclick: review }, 'Review changes')));
  function review() {
    if (spec.empty(ch)) return toast('Choose what to change first');
    const gap = spec.missing(ch); if (gap) return toast(gap);
    const { pairs, skipped = 0, why = '' } = spec.plan(Date.now());
    if (!pairs.length) return toast(why || `None of them would change`);
    const over = spec.overwrites(ch), big = pairs.length >= BIG && over;
    const sample = p => h('li', {}, h('div', { class: 'muted' }, spec.summary(p.base)), h('div', {}, '→ ', spec.summary(p.next)));
    fill(body,
      h('h3', { class: 'bulk-h' }, `Change ${plural(pairs.length, word)}`),
      h('ul', { class: 'bulk-lines' }, spec.lines(ch).map(l => h('li', {}, l))),
      skipped ? h('p', { class: 'hint' }, `${plural(skipped, word)} left as ${skipped === 1 ? 'it is' : 'they are'}${why ? ` (${why})` : ''}.`) : null,
      over ? h('p', { class: 'bulk-warn', role: 'note' }, `This replaces what these ${word}s have now. Undo stays in the message after saving.`) : null,
      h('p', { class: 'hint' }, pairs.length > 3 ? 'For example:' : 'Before → after:'), h('ul', { class: 'bulk-samples' }, pairs.slice(0, 3).map(sample)),
      h('div', { class: 'bar bulk-btns' }, h('span', { class: 'grow' }),
        h('button', { onclick: step1 }, 'Back'),
        h('button', { class: over ? 'danger' : 'primary', onclick: async () => { await m.close(); spec.save(pairs); } }, big ? `Change ${plural(pairs.length, word)}` : 'Save')));
  }
  step1();
  return m;
}

// The Copy / Share / Send to / Move to the bin buttons. text() -> the items as text; bin() moves them
export function exportButtons(close, { count, text, word, bin, extra = [] }) {
  return [
    h('button', { class: 'small', onclick: async () => { await close(); copyText(text(), `${plural(count(), word)} copied`); } }, 'Copy'),
    navigator.share ? h('button', { class: 'small', onclick: async () => { await close(); shareText(text(), plural(count(), word)); } }, 'Share') : null,
    destinations().length ? h('button', { class: 'small', onclick: async () => { await close(); openSend({ text: text(), title: plural(count(), word), fileDate: '' }); } }, 'Send to…') : null,
    ...extra,
    h('button', { class: 'small danger', onclick: async () => { await close(); await bin(); } }, 'Move to the bin')];
}

// ---------- cases (Logbook) ----------

// cases: the selected ones; tags: [{ k, depth, label }] (every tag, as the filters list them); name(k) -> a tag's name;
// onDone({ binned }) after a save or a move to the bin
export function bulkEditDialog(cases, { tags = [], name = k => k, onDone = () => {} } = {}) {
  if (!cases.length) return toast('Select some cases first');
  const ch = none();
  const tagOpts = () => [h('option', { value: '' }, 'Choose a tag…'), ...tags.map(n => h('option', { value: n.k }, `${'  '.repeat(Math.min(n.depth, 3))}${n.label}`))];
  const these = () => cases.map(c => S.cases.find(x => x.id === c.id)).filter(Boolean);
  return bulkDialog({
    title: `Bulk edit ${plural(cases.length)}`, word: 'case', ch, count: cases.length,
    rows: row => [
      row('Date', [['set', 'Set to…']], v => {
        ch.date = v ? { set: '' } : null;
        return v ? field({ type: 'date', 'aria-label': 'New date' }, x => { ch.date.set = x; }) : null;
      }),
      row('Initials', [['set', 'Replace with…'], ['clear', 'Clear']], v => {
        ch.initials = v ? { set: '' } : null;
        return v === 'set' ? field({ type: 'text', 'aria-label': 'New initials', autocapitalize: 'characters', maxlength: 20 }, x => { ch.initials.set = x; }) : null;
      }),
      row('Case summary', [['replace', 'Replace with…'], ['append', 'Add to the end…'], ['find', 'Find and replace…']], v => {
        ch.details = v ? { mode: v, text: '', find: '', with: '' } : null;
        return v ? textFields(v, ch.details, { what: v === 'replace' ? 'New case summary' : 'Text to add' }) : null;
      }),
      row('Tags', [['add', 'Add…'], ['remove', 'Remove…'], ['replace', 'Replace…']], v => {
        ch.tags = v ? { mode: v, k: '', to: '' } : null;
        if (!v) return null;
        const one = h('select', { 'aria-label': v === 'replace' ? 'Tag to replace' : v === 'add' ? 'Tag to add' : 'Tag to remove', onchange: e => { ch.tags.k = e.target.value; } }, tagOpts());
        if (v !== 'replace') return one;
        return [one, h('span', { class: 'muted' }, 'with'), h('select', { 'aria-label': 'Replace with tag', onchange: e => { ch.tags.to = e.target.value; } }, tagOpts())];
      }),
      basicHides('reflect') ? null : row('Interesting', [['on', 'Mark interesting'], ['off', 'Not interesting']], v => { ch.star = v === 'on' ? true : v === 'off' ? false : null; })],
    empty: isEmpty, missing,
    plan: now => {
      const pairs = [], list = these();
      let long = 0;
      for (const c of list) {
        const next = applyChange(c, ch, TAGS, now);
        if (next && next.tooLong) long++; else if (next) pairs.push({ base: c, next });
      }
      const skipped = list.length - pairs.length;
      return { pairs, skipped, why: long ? (pairs.length ? `${long} would be longer than a case can hold` : `That would make ${plural(long)} longer than a case can hold`) : skipped ? 'already as chosen' : '' };
    },
    lines: c => changeLines(c, { name, day: fmtDate }), overwrites, summary,
    actions: close => exportButtons(close, { count: () => these().length, text: () => these().map(shareCaseText).join('\n\n'), word: 'case',
      bin: async () => { const list = these(); if (!list.length) return; await moveToBin('case', list, { toast: true }); onDone({ binned: true }); } }),
    save: async pairs => {
      const r = await updateMany(pairs);
      if (r.stopped) return;
      onDone({ binned: false });
      const done = `${plural(r.saved)} updated`;
      if (r.kept || r.failed) return updatedToast(done, r, 'edit them again');
      toast(done, { action: 'Undo', onaction: () => undo(pairs) });
    },
  });
}

// a case on one line for the samples: date, initials, summary, tags
const summary = c => [c.date ? fmtDate(c.date) : '', caseText(c).slice(0, 80), (c.cats || []).map(catShort).join(' '), c.reflectTag ? '☆' : ''].filter(Boolean).join(' · ');

// Undo: each case back as it was, unless it has changed since the bulk edit (on this device or another)
export async function undo(pairs) {
  const now = Date.now(), back = [];
  let moved = 0;
  for (const p of pairs) {
    const cur = S.cases.find(x => x.id === p.next.id);
    if (cur && sameContent(cur, p.next)) back.push({ base: cur, next: { ...p.base, updatedAt: now } }); else moved++;
  }
  if (!back.length) return toast('Nothing to undo: they have all changed since');
  const r = await updateMany(back);
  if (r.stopped) return;
  updatedToast(`${plural(r.saved)} put back${moved ? ` (${moved} changed since, left as ${moved === 1 ? 'it is' : 'they are'})` : ''}`, r);
}
