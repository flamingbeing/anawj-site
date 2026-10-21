// Small pure helpers for the Add tab (ui-log.js): which suggestions count as confident, ticking them
// automatically, the Add tab parts people hide, and the recent cases for "Same as last". Tested in
// test/logging.test.mjs.

import { withParents, sortCodes, STRONG } from './engine.js';

// A suggestion this sure is "confident": shown as a strong chip, counted in "+ All", ticked in a pasted
// list, offered by Save with nothing picked, and ticked by "Tick confident suggestions automatically".
export { STRONG };
export const confident = list => (list || []).filter(s => s.score >= STRONG).map(s => s.code);

// Settings → Logging → Tick confident suggestions automatically (settings.autoTick). The ticks follow
// the text: a code ticked automatically goes again when the text no longer suggests it, and one the user took
// off (rejected) stays off for this case. Codes the user ticked are never touched.
// draft { cats, auto, rejected }, want: the confident codes now -> { cats, auto } (unchanged arrays when
// nothing changes, so the caller can skip a repaint)
export function autoTick({ cats = [], auto = [], rejected = [] }, want) {
  const autoSet = new Set(auto), no = new Set(rejected);
  const manual = cats.filter(c => !autoSet.has(c));
  const add = (want || []).filter(c => !no.has(c));
  const next = sortCodes(withParents([...manual, ...add]));
  const mine = new Set(manual);
  const nextAuto = next.filter(c => !mine.has(c));
  const same = next.length === cats.length && next.every((c, i) => c === cats[i]) && nextAuto.length === auto.length && nextAuto.every((c, i) => c === auto[i]);
  return same ? { cats, auto } : { cats: next, auto: nextAuto };
}
// The user took these codes off: no longer automatic, and not ticked again for this case.
export function rejectCodes({ auto = [], rejected = [] }, codes) {
  const gone = new Set(codes);
  return { auto: auto.filter(c => !gone.has(c)), rejected: [...new Set([...rejected, ...codes])] };
}

// Add tab parts (settings.caseHide; Basic re-enables them in settings.basicOn as 'case:<part>'). 'quick' once
// hid all the quick picks; it was split into 'sugg' (the suggestion row) and 'recent' (Same as last and tag
// groups), so a profile can keep the suggestions. An older 'quick' still means both, and is rewritten as the
// two on the next change.
const SPLIT = { quick: ['sugg', 'recent'] };
export function expandParts(list, prefix = '') {
  const out = [];
  for (const x of list || []) {
    const part = typeof x === 'string' && x.startsWith(prefix) ? x.slice(prefix.length) : null;
    for (const y of (part && SPLIT[part]) ? SPLIT[part].map(p => prefix + p) : [x]) if (!out.includes(y)) out.push(y);
  }
  return out;
}
// item: the part as stored ('sugg', or 'case:sugg' with prefix 'case:')
export const hasPart = (list, item, prefix = '') => expandParts(list, prefix).includes(item);

// Settings → Advanced logging → Same as last: how many recent cases (settings.recentCount). The picker offers
// these; any other stored value (an imported settings file) snaps to the nearest, the lower on a tie.
export const RECENT_CHOICES = [1, 2, 3, 5];
export function recentCount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return 1;
  return RECENT_CHOICES.reduce((best, c) => (Math.abs(c - n) < Math.abs(best - n) ? c : best), RECENT_CHOICES[0]);
}

// "Same as last": the n most recent cases with tags (by when they were logged), one per procedure and tag set.
// keyOf(c) -> the procedure key (costly, so only worked out for the newest few). One pass over the list
// instead of sorting it all; falls back to a full sort only when the newest few repeat themselves.
export function recentCases(cases, n, keyOf) {
  const list = (cases || []).filter(c => c && c.cats && c.cats.length);
  const pickFrom = sorted => {
    const out = [], keys = new Set();
    for (const c of sorted) {
      const key = keyOf(c);
      if (keys.has(key)) continue;
      keys.add(key); out.push(c);
      if (out.length >= n) break;
    }
    return out;
  };
  const room = Math.max(n * 4, 8);
  const top = [];
  for (const c of list) {
    const t = c.createdAt || 0;
    if (top.length >= room && t <= (top[top.length - 1].createdAt || 0)) continue;
    let i = top.length;
    while (i > 0 && (top[i - 1].createdAt || 0) < t) i--;
    top.splice(i, 0, c);
    if (top.length > room) top.pop();
  }
  const got = pickFrom(top);
  if (got.length >= n || top.length === list.length) return got;
  return pickFrom([...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
}
