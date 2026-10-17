// Year comparison (log2 5b; Faculty / PCs Analytics): for the residency year picked, each tag with a target: the year's
// median count, the target due next, and the residents well behind the median (at most half of it, from a median of
// 4). Pure (test/year-compare.test.mjs); ui-caselogs.js draws it.
import { CATEGORIES, R_YEARS } from './categories.js';

export const median = xs => { const s = [...xs].sort((a, b) => a - b), n = s.length; return !n ? 0 : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const yearNum = by => Number(String(by).replace(/\D/g, ''));
// the target due by the end of this year or the next one after it: { by: 'R3', n } | null
export function targetFor(code, year) {
  const t = (CATEGORIES.find(c => c.code === code) || {}).targets || {};
  const by = R_YEARS.find(k => t[k] != null && yearNum(k) >= year) || R_YEARS.filter(k => t[k] != null).pop();
  return by ? { by, n: t[by] } : null;
}
// people: [{ rid, name, rYear, counts }] (Totals summaries) -> [{ code, median, target, behind: [{ rid, name, count }] }]
export function yearComparison(people, year) {
  const these = people.filter(p => (p.rYear || 0) === year);
  if (!these.length) return [];
  return CATEGORIES.filter(c => !c.retired && c.targets && Object.keys(c.targets).length).map(c => {
    const counts = these.map(p => (p.counts || {})[c.code] || 0), med = median(counts);
    const behind = med >= 4 ? these.filter(p => ((p.counts || {})[c.code] || 0) <= med / 2).map(p => ({ rid: p.rid, name: p.name || 'No name', count: (p.counts || {})[c.code] || 0 })).sort((a, b) => a.count - b.count) : [];
    return { code: c.code, median: med, target: targetFor(c.code, year), behind };
  });
}
