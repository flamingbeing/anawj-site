// Analytics at a glance (the folded Logbook and Reflections cards): where you stand against this year's
// goal and against the other residents in your year (counts only, from summaries/). Pure, unit-tested.

import { progress } from './engine.js';
import { REFLECTION_TOTAL } from './reflections.js';

// fewer than this many residents in the year: no comparison (too few to say much, and too easy to
// work out who is who)
export const MIN_COHORT = 4;

// { n, min, p25, median, p75, max } of a list of numbers (linear interpolation), or null when empty
export function spread(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = p => { const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  return { n: v.length, min: v[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: v[v.length - 1] };
}

// Logbook: tags done, the goal for the end of this residency year (tags due by then), and the bar's parts
export function logbookGlance(rows) {
  const t = s => rows.filter(r => r.status === s).length;
  const withTarget = rows.filter(r => r.status !== 'none').length;
  return { done: t('done'), ontrack: t('ontrack'), due: t('due'), late: t('late'), total: withTarget, goal: t('done') + t('due') + t('late') };
}

// Reflections: counted out of 96, and where steady progress over the five years would be by the end of this one
export function reflectionGlance(counted, rYear) {
  const yr = Math.max(1, Math.min(5, Number(rYear) || 1));
  return { counted, total: REFLECTION_TOTAL, goal: Math.round(REFLECTION_TOTAL * yr / 5) };
}

// The same three numbers for everyone in your residency year: { tags, cases, reflections } spreads, or
// null when there are fewer than MIN_COHORT. summaries: as loaded for Totals ({ rYear, counts, total,
// reflectionsTotal }).
export function cohortGlance(summaries, rYear) {
  const peers = (summaries || []).filter(s => (s.rYear || 0) === rYear);
  if (peers.length < MIN_COHORT) return null;
  return {
    n: peers.length,
    tags: spread(peers.map(s => progress(s.counts || {}, s.rYear || 1).filter(r => r.status === 'done').length)),
    cases: spread(peers.map(s => Number(s.total) || 0)),
    reflections: spread(peers.map(s => Number(s.reflectionsTotal) || 0)),
  };
}
