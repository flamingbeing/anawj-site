// Bulk edit… (Logbook → Select): one popup for the selected cases. Change: a row per field, each "Unchanged" until
// chosen; Actions: copy, share or send just these, or move them to the bin. Review changes says what gets replaced
// (with up to three samples, before → after; from 20 cases the button names how many), then Save goes through updateMany (a case changed on another
// device meanwhile keeps that version) and the toast's Undo puts back the cases nobody has changed since.
import { applyChange, overwrites, changeLines, missing, none, isEmpty, BIG } from './bulk-change.js';
import { fmtDate, sortCodes, withParents, cleanInitials, caseParts, caseText } from './engine.js';
import { S, h, fill, modal, toast, cat, catShort, updateMany, updatedToast, keepTags, tagLinks, basicHides } from './ui-core.js';
import { moveToBin } from './bin.js';
import { copyText, shareText, caseText as shareCaseText } from './share.js';
import { destinations, openSend } from './ui-send.js';

const TAGS = { parts: caseParts, cleanInitials, sortCodes, withParents, parentOf: code => cat(code).parent || null, keepTags, tagLinks };
const plural = (n, w = 'case') => `${n} ${w}${n === 1 ? '' : 's'}`;
const sameContent = (a, b) => ['date', 'initials', 'details', 'cats', 'tags', 'reflectTag'].every(k => JSON.stringify(a?.[k] ?? null) === JSON.stringify(b?.[k] ?? null));

// cases: the selected ones; tags: [{ k, depth, label }] (every tag, as the filters list them); name(k) -> a tag's name;
// onDone({ binned }) after a save or a move to the bin
export function bulkEditDialog(cases, { tags = [], name = k => k, onDone = () => {} } = {}) {
  if (!cases.length) return toast('Select some cases first');
  const ch = none();
  const body = h('div', { class: 'bulk' });
  const m = modal(`Bulk edit ${plural(cases.length)}`, body, { cls: 'full bulk-dlg' });
  const tagOpts = (first = 'Choose a tag…') => [h('option', { value: '' }, first), ...tags.map(n => h('option', { value: n.k }, `${'  '.repeat(Math.min(n.depth, 3))}${n.label}`))];
  const input = (attrs, set) => h('input', { ...attrs, oninput: e => set(e.target.value), onchange: e => set(e.target.value) });

  // one row: the field's name, a choice starting at "Unchanged", and the inputs the choice needs
  function row(label, options, onPick) {
    const extra = h('div', { class: 'bulk-extra' });
    const sel = h('select', { 'aria-label': label, onchange: e => { fill(extra, ...[onPick(e.target.value)].flat().filter(Boolean)); paintNote(); } },
      [['', 'Unchanged'], ...options].map(([v, t]) => h('option', { value: v }, t)));
    return h('div', { class: 'bulk-row' }, h('label', { class: 'bulk-l' }, label), h('div', { class: 'bulk-c' }, sel, extra));
  }
  const dateRow = row('Date', [['set', 'Set to…']], v => {
    ch.date = v ? { set: '' } : null;
    return v ? input({ type: 'date', 'aria-label': 'New date' }, x => { ch.date.set = x; }) : null;
  });
  const iniRow = row('Initials', [['set', 'Replace with…'], ['clear', 'Clear']], v => {
    ch.initials = v === 'set' ? { set: '' } : v === 'clear' ? { set: '' } : null;
    return v === 'set' ? input({ type: 'text', 'aria-label': 'New initials', autocapitalize: 'characters', maxlength: 20 }, x => { ch.initials.set = x; }) : null;
  });
  const detRow = row('Case summary', [['replace', 'Replace with…'], ['append', 'Add to the end…'], ['find', 'Find and replace…']], v => {
    ch.details = v ? { mode: v, text: '', find: '', with: '' } : null;
    if (!v) return null;
    if (v !== 'find') return input({ type: 'text', 'aria-label': v === 'replace' ? 'New case summary' : 'Text to add' }, x => { ch.details.text = x; });
    return [input({ type: 'text', 'aria-label': 'Find', placeholder: 'Find (exact capitals)' }, x => { ch.details.find = x; }),
      input({ type: 'text', 'aria-label': 'Replace with', placeholder: 'Replace with (empty takes it out)' }, x => { ch.details.with = x; })];
  });
  const tagRow = row('Tags', [['add', 'Add…'], ['remove', 'Remove…'], ['replace', 'Replace…']], v => {
    ch.tags = v ? { mode: v, k: '', to: '' } : null;
    if (!v) return null;
    const one = h('select', { 'aria-label': v === 'replace' ? 'Tag to replace' : v === 'add' ? 'Tag to add' : 'Tag to remove', onchange: e => { ch.tags.k = e.target.value; } }, tagOpts());
    if (v !== 'replace') return one;
    return [one, h('span', { class: 'muted' }, 'with'), h('select', { 'aria-label': 'Replace with tag', onchange: e => { ch.tags.to = e.target.value; } }, tagOpts())];
  });
  const starRow = basicHides('reflect') ? null : row('Interesting', [['on', 'Mark interesting'], ['off', 'Not interesting']], v => { ch.star = v === 'on' ? true : v === 'off' ? false : null; });

  const note = h('p', { class: 'hint bulk-note' });
  const paintNote = () => { note.textContent = isEmpty(ch) ? 'Choose what to change. Every field stays as it is until you choose.' : 'You’ll see what changes before anything is saved.'; };
  paintNote();

  // Actions: just these cases
  const these = () => cases.map(c => S.cases.find(x => x.id === c.id)).filter(Boolean);
  const text = () => these().map(shareCaseText).join('\n\n');
  const actions = h('div', { class: 'bar bulk-acts' },
    h('button', { class: 'small', onclick: async () => { await m.close(); copyText(text(), `${plural(these().length)} copied`); } }, 'Copy'),
    navigator.share ? h('button', { class: 'small', onclick: async () => { await m.close(); shareText(text(), plural(these().length)); } }, 'Share') : null,
    destinations().length ? h('button', { class: 'small', onclick: async () => { await m.close(); openSend({ text: text(), title: plural(these().length), fileDate: '' }); } }, 'Send to…') : null,
    h('button', { class: 'small danger', onclick: async () => {
      const list = these(); await m.close();
      if (!list.length) return;
      await moveToBin('case', list, { toast: true });
      onDone({ binned: true });
    } }, 'Move to the bin'));

  const step1 = () => fill(body,
    h('h3', { class: 'bulk-h' }, 'Change'),
    dateRow, iniRow, detRow, tagRow, starRow, note,
    h('h3', { class: 'bulk-h' }, 'Actions'),
    h('p', { class: 'hint' }, `For just these ${plural(cases.length)}.`), actions,
    h('div', { class: 'bar bulk-btns' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: review }, 'Review changes')));

  function review() {
    if (isEmpty(ch)) return toast('Choose what to change first');
    const gap = missing(ch); if (gap) return toast(gap);
    const now = Date.now(), pairs = [], long = [];
    for (const c of these()) {
      const next = applyChange(c, ch, TAGS, now);
      if (next && next.tooLong) long.push(c); else if (next) pairs.push({ base: c, next });
    }
    if (!pairs.length) return toast(long.length ? `That would make ${plural(long.length)} longer than a case can hold` : 'None of them would change');
    const lines = changeLines(ch, { name, day: fmtDate });
    const big = pairs.length >= BIG && overwrites(ch);
    const sample = p => h('li', {}, h('div', { class: 'muted' }, summary(p.base)), h('div', {}, '→ ', summary(p.next)));
    fill(body,
      h('h3', { class: 'bulk-h' }, `Change ${plural(pairs.length)}`),
      h('ul', { class: 'bulk-lines' }, lines.map(l => h('li', {}, l))),
      pairs.length < cases.length ? h('p', { class: 'hint' }, `${plural(cases.length - pairs.length)} already ${cases.length - pairs.length === 1 ? 'matches' : 'match'}${long.length ? ` or would be too long (${long.length})` : ''}: left as ${cases.length - pairs.length === 1 ? 'it is' : 'they are'}.`) : null,
      overwrites(ch) ? h('p', { class: 'bulk-warn', role: 'note' }, '⚠ This replaces what these cases have now. Undo stays in the message after saving.') : null,
      h('p', { class: 'hint' }, pairs.length > 3 ? 'For example:' : 'Before → after:'), h('ul', { class: 'bulk-samples' }, pairs.slice(0, 3).map(sample)),
      h('div', { class: 'bar bulk-btns' }, h('span', { class: 'grow' }),
        h('button', { onclick: step1 }, 'Back'),
        h('button', { class: overwrites(ch) ? 'danger' : 'primary', onclick: () => save(pairs) }, big ? `Change ${plural(pairs.length)}` : 'Save')));
  }

  async function save(pairs) {
    await m.close();
    const r = await updateMany(pairs);
    if (r.stopped) return;
    onDone({ binned: false });
    const done = `${plural(r.saved)} updated`;
    if (r.kept || r.failed) return updatedToast(done, r, 'edit them again');
    toast(done, { action: 'Undo', onaction: () => undo(pairs) });
  }
  step1();
  return m;
}

// a case on one line for the samples: date, initials, summary, tags
const summary = c => [c.date ? fmtDate(c.date) : '', caseText(c).slice(0, 80), (c.cats || []).map(catShort).join(' '), c.reflectTag ? '☆' : ''].filter(Boolean).join(' · ');

// Undo: each case back as it was, unless it has changed since the bulk edit (on this device or another)
async function undo(pairs) {
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
