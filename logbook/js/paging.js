// Paging (Logbook List and Grid; log2 11): a page of cases at a time, 100 by default (25 / 50 / 100 / 300 / All, this
// device). Pure (test/paging.test.mjs).
export const PAGE_SIZES = [25, 50, 100, 300, 0];   // 0: All
export const DEFAULT_PAGE = 100;
export const pageSize = v => (v != null && v !== '' && PAGE_SIZES.includes(Number(v)) ? Number(v) : DEFAULT_PAGE);   // (unset is 100, not 0 = All)

// rows (newest first, as listed) -> [{ start, end (exclusive), from, to }]: each page's slice and its dates (the
// newest and oldest dated case on it; '' when none is dated)
export function pagesOf(rows, size) {
  const n = rows.length, per = size > 0 ? size : n || 1, out = [];
  for (let start = 0; start < n || (start === 0 && !out.length); start += per) {
    const end = Math.min(n, start + per);
    const dates = rows.slice(start, end).map(c => c && c.date).filter(Boolean).sort();
    out.push({ start, end, from: dates.length ? dates[dates.length - 1] : '', to: dates.length ? dates[0] : '' });
    if (!n) break;
  }
  return out;
}
// the page kept in range (a search that finds fewer cases goes back to a page that exists)
export const clampPage = (page, count) => Math.max(0, Math.min(count - 1, Number(page) || 0));
