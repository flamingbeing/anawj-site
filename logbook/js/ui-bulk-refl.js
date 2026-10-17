// Bulk edit… for Reflections (Reflections → Select): the shared popup (ui-bulk.js) with the reflections' fields:
// heading, status (complete only when nothing is missing, as one at a time), in the portfolio export, JR, date.
// Actions: copy / share / send just these as Markdown (Settings → Markdown), move them to the bin. Saves as the editor
// does (cloud.saveReflection); Undo puts back the ones nobody has changed since.
import { bulkDialog, exportButtons, field, plural } from './ui-bulk.js';
import { applyReflChange, reflOverwrites, reflChangeLines, reflMissing, reflNone, reflEmpty } from './refl-bulk.js';
import { HEADING_BY_ID, completeProblems } from './reflections.js';
import { REFLECTION_HEADINGS } from './categories.js';
import { reflectionNote } from './markdown.js';
import { mdFormat } from './share.js';
import { S, h, toast, cloud, hooks } from './ui-core.js';
import { fmtDate } from './engine.js';
import { moveToBin } from './bin.js';

const word = 'reflection';
const T = { headings: HEADING_BY_ID, problems: completeProblems };
const nameOf = id => { const hd = HEADING_BY_ID[id]; return hd ? hd.label || hd.name : 'Uncategorised'; };
const summary = r => [r.date ? fmtDate(r.date) : 'No date', r.initials || '??', String(r.diagnosis || '').slice(0, 50), nameOf(r.headingId),
  r.status === 'complete' ? 'complete' : 'draft', r.export === false ? 'not exported' : '', r.jr ? 'JR' : ''].filter(Boolean).join(' · ');
const same = (a, b) => ['headingId', 'subId', 'status', 'export', 'jr', 'date'].every(k => JSON.stringify(a?.[k] ?? null) === JSON.stringify(b?.[k] ?? null));

export async function saveAll(list) {
  const me = S.user && S.user.email;
  let saved = 0, error = null;
  for (const r of list) {
    if (S.user?.email !== me) break;
    try { await cloud.saveReflection(me, r); saved++; } catch (err) { error = err; break; }
  }
  hooks.render();
  return { saved, failed: list.length - saved, error };
}
const said = (r, text) => (r.failed ? `${text}; ${r.failed} not saved (${r.error?.message || 'error'})` : text);

export function reflBulkDialog(refls, { onDone = () => {} } = {}) {
  if (!refls.length) return toast('Select some reflections first');
  const ch = reflNone();
  const these = () => refls.map(r => (S.reflections || []).find(x => x.id === r.id)).filter(Boolean);
  const pick = (label, options, set) => h('select', { 'aria-label': label, onchange: e => set(e.target.value) }, options.map(([v, t]) => h('option', { value: v }, t)));
  return bulkDialog({
    title: `Bulk edit ${plural(refls.length, word)}`, word, ch, count: refls.length,
    rows: row => [
      row('Heading', [['move', 'Move to…']], v => {
        ch.heading = v ? { id: null } : null;
        return v ? pick('Move to heading', [['', 'Choose a heading…'], ...REFLECTION_HEADINGS.map(hd => [hd.id, hd.label || hd.name]), ['-', 'Uncategorised (not exported)']],
          x => { ch.heading.id = x === '-' ? '' : x || null; }) : null;
      }),
      row('Status', [['complete', 'Complete'], ['draft', 'Draft']], v => { ch.status = v || null; }),
      row('Portfolio export', [['in', 'In the export'], ['out', 'Left out']], v => { ch.exp = v === 'in' ? true : v === 'out' ? false : null; }),
      row('JR', [['on', 'JR'], ['off', 'Not JR']], v => { ch.jr = v === 'on' ? true : v === 'off' ? false : null; }),
      row('Date', [['set', 'Set to…']], v => {
        ch.date = v ? { set: '' } : null;
        return v ? field({ type: 'date', 'aria-label': 'New date' }, x => { ch.date.set = x; }) : null;
      })],
    empty: reflEmpty, missing: reflMissing,
    plan: now => {
      const pairs = [], list = these(), blocked = [];
      for (const r of list) {
        const next = applyReflChange(r, ch, T, now);
        if (next && next.blocked) blocked.push(...next.blocked); else if (next) pairs.push({ base: r, next });
      }
      const skipped = list.length - pairs.length;
      const need = [...new Set(blocked)].slice(0, 3).join(', ');
      return { pairs, skipped, why: blocked.length ? `still missing ${need}` : skipped ? 'already as chosen' : '' };
    },
    lines: c => reflChangeLines(c, { heading: nameOf, day: fmtDate }), overwrites: reflOverwrites, summary,
    actions: close => exportButtons(close, {
      count: () => these().length, word,
      text: () => { const f = mdFormat(); return these().map(r => reflectionNote(r, f)).join('\n\n---\n\n'); },
      bin: async () => {
        const list = these(); if (!list.length) return;
        let n = 0;
        for (const r of list) { try { await moveToBin('reflection', r); n++; } catch (err) { if (!/changed elsewhere/.test(err.message)) toast('Could not delete: ' + err.message); break; } }
        onDone();
        hooks.render();
        if (n) toast(`${plural(n, word)} moved to the recycle bin`, { action: 'Recycle bin', onaction: () => { location.hash = '#recovery'; } });
      } }),
    save: async pairs => {
      const r = await saveAll(pairs.map(p => p.next));
      onDone();
      toast(said(r, `${plural(r.saved, word)} updated`), r.saved ? { action: 'Undo', onaction: () => undo(pairs) } : {});
    },
  });
}

export async function undo(pairs) {
  const now = Date.now(), back = [];
  let moved = 0;
  for (const p of pairs) {
    const cur = (S.reflections || []).find(x => x.id === p.next.id);
    if (cur && same(cur, p.next)) back.push({ ...cur, headingId: p.base.headingId, subId: p.base.subId ?? null, status: p.base.status, export: p.base.export, jr: p.base.jr, date: p.base.date, updatedAt: now });
    else moved++;
  }
  if (!back.length) return toast('Nothing to undo: they have all changed since');
  const r = await saveAll(back);
  toast(said(r, `${plural(r.saved, word)} put back${moved ? ` (${moved} changed since, left as ${moved === 1 ? 'it is' : 'they are'})` : ''}`));
}
