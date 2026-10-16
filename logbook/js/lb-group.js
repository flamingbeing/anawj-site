// Group by and Sort in the Logbook List (log2 14; as Reflections has): Month (default) / Day / Week / Residency year /
// APMES tag (a case under each of its tags; the heading has the count against the target) / Your tags / Flags (No tag
// yet, ☆ Interesting, Plan for later) / None; Sort Newest / Oldest / Initials A–Z / Most tags. Pure
// (test/lb-group.test.mjs); the page draws the headings, folds and pages (ui-logbook.js).
export const GROUPS = [['month', 'Month'], ['day', 'Day'], ['week', 'Week'], ['year', 'Residency year'], ['tag', 'APMES tag'], ['mine', 'Your tags'], ['flag', 'Flags'], ['none', 'None']];
export const SORTS = [['newest', 'Newest'], ['oldest', 'Oldest'], ['initials', 'Initials A–Z'], ['tags', 'Most tags']];
export const groupBy = v => (GROUPS.some(([k]) => k === v) ? v : 'month');
export const sortBy = v => (SORTS.some(([k]) => k === v) ? v : 'newest');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ctx: { month(yyyy-mm) -> label (optional), initials(c), tagCount(c), weekStart (0 Sun / 1 Mon / 6 Sat), year(date) -> n | null, yearName(n), day(iso) -> label,
//        catName(code), order(code) -> number, target(code) -> n | null, count(code) -> n, tagName(key), plan: [] }
export function sortCases(rows, sort, ctx) {
  const by = {
    newest: (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0),
    oldest: (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.createdAt || 0) - (b.createdAt || 0),
    initials: (a, b) => ctx.initials(a).localeCompare(ctx.initials(b), undefined, { sensitivity: 'base' }) || (b.date || '').localeCompare(a.date || ''),
    tags: (a, b) => ctx.tagCount(b) - ctx.tagCount(a) || (b.date || '').localeCompare(a.date || ''),
  }[sortBy(sort)];
  return [...rows].sort(by);
}

const weekOf = (iso, ws = 1) => {
  const [y, m, d] = iso.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() - ws + 7) % 7));
  return t.toISOString().slice(0, 10);
};

// rows (already sorted) -> [{ key, label, items, note }] in the order to draw. A case can be in several groups (tags).
export function groupCases(rows, by, sort, ctx) {
  by = groupBy(by);
  const desc = sortBy(sort) !== 'oldest';
  const groups = new Map();
  const put = (key, label, c, extra = {}) => { if (!groups.has(key)) groups.set(key, { key, label, items: [], ...extra }); if (c) groups.get(key).items.push(c); };
  const dated = (key, label) => ({ key, label });
  for (const c of rows) {
    if (by === 'none') put('all', 'All cases', c);
    else if (by === 'month') { const k = c.date ? c.date.slice(0, 7) : ''; put(k, k ? (ctx.month ? ctx.month(k) : `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`) : 'No date', c); }
    else if (by === 'day') put(c.date || '', c.date ? ctx.day(c.date) : 'No date', c);
    else if (by === 'week') { const k = c.date ? weekOf(c.date, ctx.weekStart) : ''; put(k, k ? `Week of ${ctx.day(k)}` : 'No date', c); }
    else if (by === 'year') { const y = c.date ? ctx.year(c.date) : null; put(y ? String(y).padStart(2, '0') : '', y ? ctx.yearName(y) : 'Year unknown', c); }
    else if (by === 'tag') {
      const cats = c.cats || [];
      if (!cats.length) put('~none', 'No tag yet', c);
      for (const code of cats) put(code, ctx.catName(code), c, { code });
    } else if (by === 'mine') {
      const tags = c.tags || [];
      if (!tags.length) put('~none', 'None of your tags', c);
      for (const k of tags) put(k, ctx.tagName(k), c);
    } else if (by === 'flag') {
      if (!(c.cats || []).length) put('1', 'No tag yet', c);
      if (c.reflectTag) put('2', '☆ Interesting', c);
    }
  }
  if (by === 'flag' && (ctx.plan || []).length) put('3', 'Plan for later', null, { planned: [...ctx.plan] });
  let out = [...groups.values()];
  if (['month', 'day', 'week', 'year'].includes(by)) out.sort((a, b) => (a.key === '') - (b.key === '') || (desc ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)));
  else if (by === 'tag') out.sort((a, b) => (a.key === '~none') - (b.key === '~none') || ctx.order(a.key) - ctx.order(b.key));
  else if (by === 'mine') out.sort((a, b) => (a.key === '~none') - (b.key === '~none') || a.label.localeCompare(b.label));
  else if (by === 'flag') out.sort((a, b) => a.key.localeCompare(b.key));
  // APMES tag headings: the count against the target ("12 of 20 for the target"; nothing without a target)
  if (by === 'tag') for (const g of out) if (g.code) { const t = ctx.target(g.code); g.note = t ? `${ctx.count(g.code)} of ${t} for the target` : ''; }
  return out;
}

// the groups as one run of entries to page through: [{ g, c, first }] (first: the group's first case)
export const entriesOf = groups => groups.flatMap(g => (g.planned ? [{ g, c: null, first: true }] : g.items.map((c, i) => ({ g, c, first: i === 0 }))));
