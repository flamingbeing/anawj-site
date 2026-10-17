// Faculty / PCs profile (faculty, PDs and admins; ui-core.js PROFILES): Case logs (#caselogs) lists the programme's
// residents by residency year with their counts at a glance, and one resident's compiled case log (#caselog: counts
// per tag against the targets, reflection headings met; Excel download). Built from the counts summaries only
// (summaries/, the same data as Programme totals), never case details. Programme analytics (Analytics in this
// profile) is renderProgramme: who's behind. Programme totals have their own tab (#totals; owner, 15 Oct 2026).

import { REFLECTION_HEADINGS, yearName } from './categories.js';
import { yearComparison } from './year-compare.js';
import { progress, todayISO, fmtDate } from './engine.js';
import { h, hooks, resetters, catName } from './ui-core.js';
import { programme, groupYearName, totalsTable, downloadTotals, legend, countSwitch } from './ui-progress.js';

// q: the name search; rid: the resident open in #caselog
const cv = { q: '', rid: null };
resetters.push(() => Object.assign(cv, { q: '', rid: null }));

const statusOf = p => {
  const n = { late: 0, due: 0, ontrack: 0, done: 0 };
  for (const x of progress(p.counts || {}, p.rYear || 1)) if (x.status in n) n[x.status]++;
  return n;
};
const headingsMet = p => Object.keys(p.reflections || {}).filter(id => REFLECTION_HEADINGS.some(x => x.id === id)).length;
const yearLabel = p => (p.smo ? 'SMO' : p.rYear ? 'R' + p.rYear : 'Year unknown');

// the year picker shared with Programme totals (tview.year)
function yearPick(t, all) {
  const years = [...new Set(all.map(s => s.rYear || 0))].sort((a, b) => (a || 9) - (b || 9));
  if (t.year == null || !years.includes(t.year)) t.year = years[0];
  return h('select', { 'aria-label': 'Residency year', onchange: e => { t.year = Number(e.target.value); hooks.render(); } },
    years.map(y => h('option', { value: String(y), selected: y === t.year }, groupYearName(y, all))));
}
const loadingCard = (t, title) => h('section', { class: 'card' }, h('h2', {}, title),
  h('p', { class: t.error ? 'tip' : 'empty' }, t.error || (t.loading ? 'Loading…' : 'No residents yet.')));

export function renderCaseLogs() {
  const t = programme();
  const all = t.summaries || [];
  if (!all.length) return loadingCard(t, 'Case logs');
  const ypick = yearPick(t, all);
  const q = cv.q.trim().toLowerCase();
  const people = all.filter(p => (p.rYear || 0) === t.year && (!q || String(p.name || '').toLowerCase().includes(q)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const list = h('ul', { class: 'caselog-list' }, people.map(p => {
    const n = statusOf(p);
    return h('li', {}, h('a', { href: '#caselog', 'data-rid': String(p.rid), onclick: e => { e.preventDefault(); cv.rid = String(p.rid); location.hash = '#caselog'; } },
      h('span', { class: 'mt' }, h('b', {}, p.name || 'No name', h('small', { class: 'muted' }, ' · ' + yearLabel(p))),
        h('small', {}, `${p.total || 0} cases · `,
          n.late ? h('span', { class: 'cl-n' }, h('i', { class: 'dot late' }), `${n.late} behind`) : null, n.late ? ' · ' : null,
          n.due ? h('span', { class: 'cl-n' }, h('i', { class: 'dot due' }), `${n.due} due`) : null, n.due ? ' · ' : null,
          `${n.ontrack + n.done} on track or done · reflections ${p.reflectionsTotal || 0}/96`)),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
  }));
  return h('div', {},
    h('section', { class: 'card more-list' },
      h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Case logs'), ypick, h('span', { class: 'grow' }),
        h('button', { class: 'small', onclick: () => { t.summaries = null; hooks.render(); } }, 'Refresh')),
      h('p', { class: 'hint help' }, 'Each resident’s compiled case log: counts per tag against the targets, and reflection headings met. Counts only, never case details. Tap a resident to see theirs.'),
      h('input', { type: 'search', placeholder: 'Find a resident', 'aria-label': 'Find a resident', value: cv.q, style: 'width:100%;margin:6px 0',
        oninput: e => { cv.q = e.target.value; const at = e.target.selectionStart; hooks.render(); const box = document.querySelector('input[aria-label="Find a resident"]'); if (box) { box.focus(); box.setSelectionRange(at, at); } } }),
      people.length ? list : h('p', { class: 'empty' }, q ? 'No resident matches.' : 'No residents in this year.')));
}

export function renderCaseLog() {
  const t = programme();
  const p = (t.summaries || []).find(x => String(x.rid) === String(cv.rid));
  if (!p) return t.summaries ? h('section', { class: 'card' }, h('p', { class: 'empty' }, 'Choose a resident in Case logs.'), h('p', {}, h('a', { href: '#caselogs' }, '‹ Case logs'))) : loadingCard(t, 'Case log');
  const n = statusOf(p);
  const table = totalsTable([p]);
  table.data.title = `${p.name} (${yearLabel(p)}) case log — ${todayISO()}`;
  // one resident: a plain "Cases" column instead of the totals' turned names
  const th = table.el.querySelector('th.rot'); if (th) { th.textContent = 'Cases'; th.className = 'cl-col'; }
  const met = new Set(Object.keys(p.reflections || {}));
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', { style: 'margin:0' }, p.name || 'No name'),
      h('p', { class: 'muted', style: 'margin:2px 0 8px' }, `${yearLabel(p)}${p.intake ? ' · intake ' + p.intake : ''}${p.updatedAt ? ' · updated ' + fmtDate(new Date(p.updatedAt).toISOString().slice(0, 10)) : ''}`),
      h('p', { class: 'cl-sum' }, h('b', {}, `${p.total || 0} cases`), ` · ${n.late} behind · ${n.due} due this year · ${n.ontrack} on track · ${n.done} done`),
      h('div', { class: 'bar' }, h('button', { class: 'small', onclick: () => downloadTotals(table.data, `case-log-${String(p.name || p.rid).replace(/[^A-Za-z0-9]+/g, '-')}-${todayISO()}.xlsx`) }, 'Download Excel'), countSwitch()),
      legend(),
      h('div', { class: 'scroll', style: 'margin-top:8px', tabindex: '0', role: 'region', 'aria-label': 'Case log table' }, table.el)),
    h('section', { class: 'card' },
      h('h2', {}, `Reflections · ${headingsMet(p)} of ${REFLECTION_HEADINGS.length} headings met`),
      h('p', { class: 'hint help' }, `${p.reflectionsTotal || 0} of the 96 needed, counted towards each heading’s minimum. The reflections themselves stay private to the resident.`),
      h('ul', { class: 'cl-heads' }, REFLECTION_HEADINGS.map(x => h('li', { class: met.has(x.id) ? 'met' : '' },
        h('span', { 'aria-hidden': 'true' }, met.has(x.id) ? '✓ ' : '○ '), x.label, h('small', { class: 'muted' }, met.has(x.id) ? ` · ${x.min} of ${x.min}` : ` · needs ${x.min}`))))));
}

// Analytics in Faculty / PCs: who's behind in the year picked (Programme totals are on their own tab)
export function renderProgramme() {
  const t = programme();
  const all = t.summaries || [];
  if (!all.length) return loadingCard(t, 'Programme analytics');
  const ypick = yearPick(t, all);
  const people = all.filter(p => (p.rYear || 0) === t.year);
  // residents with tags behind (most first), and the tags most residents are behind on
  const behind = people.map(p => ({ p, late: progress(p.counts || {}, p.rYear || 1).filter(x => x.status === 'late') })).filter(x => x.late.length)
    .sort((a, b) => b.late.length - a.late.length);
  const byTag = new Map();
  for (const { late } of behind) for (const x of late) byTag.set(x.code, (byTag.get(x.code) || 0) + 1);
  const tags = [...byTag].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const open = rid => () => { cv.rid = String(rid); location.hash = '#caselog'; };
  return h('div', {}, h('section', { class: 'card' },
    h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Programme analytics'), ypick),
    h('p', { class: 'hint help' }, `${people.length} residents · ${behind.length} behind on at least one tag (a target from an earlier year not met).`),
    behind.length ? [
      h('h3', {}, 'Who’s behind'),
      h('ul', { class: 'cl-behind' }, behind.slice(0, 15).map(({ p, late }) => h('li', {},
        h('a', { class: 'an-link', href: '#caselog', onclick: e => { e.preventDefault(); open(p.rid)(); } }, p.name || 'No name'),
        ` · ${late.length} behind: `, h('span', { class: 'muted' }, late.slice(0, 4).map(x => catName(x.code)).join(', ') + (late.length > 4 ? '…' : ''))))),
      h('h3', {}, 'Tags most residents are behind on'),
      h('ul', { class: 'cl-behind' }, tags.map(([code, k]) => h('li', {}, catName(code), h('span', { class: 'muted' }, ` · ${k} of ${people.length}`)))),
    ] : h('p', { class: 'empty' }, 'Nobody in this year is behind.')),
    yearCompareCard(all, t.year, open));
}

// Year comparison (log2 5b): each target tag's median in the year picked, the target due next, and who is well
// behind the median (half of it or less, from a median of 4)
function yearCompareCard(all, year, open) {
  const rows = yearComparison(all, year);
  if (!rows.length) return null;
  const flagged = new Set(rows.flatMap(r => r.behind.map(b => b.rid))).size;
  return h('section', { class: 'card' },
    h('h2', {}, 'Year comparison'),
    h('p', { class: 'hint help' }, `${groupYearName(year, all)}: the middle resident’s count for each tag (the median), the target due next, and who has half of it or less (from a median of 4). ${flagged ? `${flagged} resident${flagged === 1 ? '' : 's'} well behind on at least one tag.` : 'Nobody well behind.'}`),
    h('div', { class: 'scroll', tabindex: '0', role: 'region', 'aria-label': 'Year comparison table' },
      h('table', { class: 'yc-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Tag'), h('th', {}, 'Median'), h('th', {}, 'Target'), h('th', {}, 'Well behind'))),
        h('tbody', {}, rows.map(r => h('tr', { class: r.behind.length ? 'yc-behind' : null },
          h('td', {}, catName(r.code)), h('td', {}, String(r.median)), h('td', { class: 'muted' }, r.target ? `${r.target.n} by ${yearName(Number(r.target.by.slice(1)))}` : ''),
          h('td', {}, r.behind.length ? r.behind.map((b, i) => [i ? ', ' : '', h('a', { class: 'an-link', href: '#caselog', onclick: e => { e.preventDefault(); open(b.rid)(); } }, b.name), h('span', { class: 'muted' }, ` (${b.count})`)]).flat() : h('span', { class: 'muted' }, '—'))))))));
}
