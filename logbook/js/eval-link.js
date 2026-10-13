// "Request an evaluation" (Settings → Profiles or hide items → APMES; account, off by default): a case's ⋯ menu and its
// edit page open the evaluations app's new request with the case's date and initials filled in. Only those two go in
// the link, checked, never the case's details (the evals app checks them again: evals/js/ui-request.js caseFromLink).
// Pure: tested in eval-link.test.mjs.
export const EVALS_URL = 'https://apmes.anawj.com/evals/';
// the evals app beside this logbook (same origin, ../evals/), so a PR preview or a local server opens its own copy
// rather than the live one; EVALS_URL when there's no page address to go by
export const evalsBase = href => { try { return new URL('../evals/', href).href; } catch { return EVALS_URL; } };

const realDate = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

// date: a real day, not after today, else left out; initials: 1–3 capital letters (as typed, letters only), else left
// out (never shortened: "ABCD" cut to "ABC" would name someone else); demo: the evals demo, so made-up cases stay there
export function evalRequestUrl({ date, initials } = {}, { today, demo = false, base = EVALS_URL } = {}) {
  const q = [];
  if (demo) q.push('demo');
  if (realDate(date) && (!today || date <= today)) q.push('date=' + date);
  const ini = String(initials || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (ini.length >= 1 && ini.length <= 3) q.push('initials=' + ini);
  return base + (q.length ? '?' + q.join('&') : '') + '#new';
}
