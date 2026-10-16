// Bulk edit… for a Search selection of more than one kind (cases with notes, reflections…): the one field they share,
// the date, plus Copy / Share / Send and Move to the bin. One kind alone opens that kind's own popup (ui-search.js).
// Each kind saves its own way (cases through updateMany, notes and reflections as their popups do), and Undo puts back
// each kind's items that nobody has changed since.
import { bulkDialog, exportButtons, field, plural, undo as undoCases } from './ui-bulk.js';
import { applyChange, none } from './bulk-change.js';
import { applyNoteChange, noteNone } from './note-bulk.js';
import { applyReflChange, reflNone } from './refl-bulk.js';
import { saveNotes, undo as undoNotes } from './ui-bulk-notes.js';
import { saveAll as saveRefls, undo as undoRefls } from './ui-bulk-refl.js';
import { S, toast, updateMany, cat, keepTags, tagLinks } from './ui-core.js';
import { fmtDate, sortCodes, withParents, cleanInitials, caseParts, caseText } from './engine.js';
import { HEADING_BY_ID, completeProblems } from './reflections.js';
import { noteMd, noteTitle } from './notepad.js';
import { reflectionNote } from './markdown.js';
import { mdFormat, caseText as shareCaseText } from './share.js';
import { moveToBin } from './bin.js';

const TAGS = { parts: caseParts, cleanInitials, sortCodes, withParents, parentOf: code => cat(code).parent || null, keepTags, tagLinks };
const LIST = { case: () => S.cases || [], note: () => S.notes || [], reflection: () => S.reflections || [] };
const summary = x => (x.type === 'case' ? `Case · ${x.it.date ? fmtDate(x.it.date) : 'No date'} · ${caseText(x.it).slice(0, 60)}`
  : x.type === 'note' ? `Note · ${x.it.date ? fmtDate(x.it.date) : 'No date'} · ${noteTitle(x.it).slice(0, 60)}`
    : `Reflection · ${x.it.date ? fmtDate(x.it.date) : 'No date'} · ${x.it.diagnosis || x.it.title || ''}`.slice(0, 80));

// picks: [{ type: 'case' | 'note' | 'reflection', id }]
export function mixedBulkDialog(picks, { onDone = () => {} } = {}) {
  const ch = { date: null };
  const these = () => picks.map(p => ({ type: p.type, it: LIST[p.type]().find(x => x.id === p.id) })).filter(x => x.it);
  return bulkDialog({
    title: `Bulk edit ${plural(picks.length, 'item')}`, word: 'item', ch, count: picks.length,
    rows: row => [row('Date', [['set', 'Set to…']], v => {
      ch.date = v ? { set: '' } : null;
      return v ? field({ type: 'date', 'aria-label': 'New date' }, x => { ch.date.set = x; }) : null;
    })],
    empty: c => !c.date, missing: c => (c.date && !/^\d{4}-\d{2}-\d{2}$/.test(c.date.set || '') ? 'Choose the date' : ''),
    plan: now => {
      const pairs = [];
      for (const x of these()) {
        const next = x.type === 'case' ? applyChange(x.it, { ...none(), date: ch.date }, TAGS, now)
          : x.type === 'note' ? applyNoteChange(x.it, { ...noteNone(), date: ch.date }, now)
            : applyReflChange(x.it, { ...reflNone(), date: ch.date }, { headings: HEADING_BY_ID, problems: completeProblems }, now);
        if (next && !next.tooLong && !next.blocked) pairs.push({ base: { ...x.it, type: x.type }, next: { ...next, type: x.type } });
      }
      const n = these().length;
      return { pairs, skipped: n - pairs.length, why: n - pairs.length ? 'already that date, or daily notes keeping their day' : '' };
    },
    lines: c => [`Date: set to ${fmtDate(c.date.set)} (daily notes keep their day)`], overwrites: () => true,
    summary: x => summary({ type: x.type, it: x }),
    actions: close => exportButtons(close, {
      count: () => these().length, word: 'item',
      text: () => these().map(x => (x.type === 'case' ? shareCaseText(x.it) : x.type === 'note' ? noteMd(x.it) : reflectionNote(x.it, mdFormat()))).join('\n\n---\n\n'),
      bin: async () => {
        const all = these();
        for (const kind of ['case', 'note', 'reflection']) {
          const list = all.filter(x => x.type === kind).map(x => x.it);
          if (!list.length) continue;
          try { if (kind === 'reflection') { for (const r of list) await moveToBin('reflection', r); } else await moveToBin(kind, list); }
          catch (err) { if (!/changed elsewhere/.test(err.message)) toast('Could not delete: ' + err.message); }
        }
        onDone();
        toast(`${plural(all.length, 'item')} moved to the recycle bin`, { action: 'Recycle bin', onaction: () => { location.hash = '#recovery'; } });
      } }),
    save: async pairs => {
      const strip = o => { const { type, ...rest } = o; return rest; };
      const by = k => pairs.filter(p => p.next.type === k).map(p => ({ base: strip(p.base), next: strip(p.next) }));
      const cases = by('case'), notes = by('note'), refls = by('reflection');
      let saved = 0;
      if (cases.length) saved += (await updateMany(cases)).saved || 0;
      if (notes.length) saved += (await saveNotes(notes)).saved || 0;
      if (refls.length) saved += (await saveRefls(refls.map(p => p.next))).saved || 0;
      onDone();
      toast(`${plural(saved, 'item')} updated`, saved ? { action: 'Undo', onaction: async () => {
        if (cases.length) await undoCases(cases);
        if (notes.length) await undoNotes(notes);
        if (refls.length) await undoRefls(refls);
      } } : {});
    },
  });
}
