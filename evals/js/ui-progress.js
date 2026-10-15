// Progress (#progress, resident): each EPA (collapsible) with its guidebook groups, done/min and a
// state colour for my year (done, on track, due this year, overdue, later). Tap an item → Request this.

import { S, h, icon, go, toolLabel, toMs, modal, hooks, fmtDate, download, toast } from './ui-core.js';
import { progress, dueItems, todayISO } from './engine.js';
import { EPAS } from './catalogue.js';
import { residentCSS, itemTags, myYear } from './ui-request.js';

residentCSS();

const STATE = {
  done: ['Done', 'var(--e-go)'],
  overdue: ['Overdue', 'var(--n-red)'],
  'due-soon': ['Due this year', 'var(--e-due)'],
  'on-track': ['On track', 'var(--n-blue)'],
  later: ['Later', 'var(--n-muted)'],
};
const RANK = { overdue: 0, 'due-soon': 1, 'on-track': 2, later: 3, done: 4 };
const YEAR_MS = 365 * 864e5;
const open = new Set();   // EPAs the resident opened (kept across repaints)
let view = 'all';         // filter: all | year (overdue + due this year) | overdue
const VIEWS = [['all', 'All'], ['year', 'This year'], ['overdue', 'Overdue']];
const shown = st => view === 'all' || (view === 'overdue' ? st === 'overdue' : st === 'overdue' || st === 'due-soon');

// The next items to ask for: due by now (overdue first), not already requested; one tap to request.
function nextCard(yr, pending) {
  const items = [...new Map(dueItems(S.mine, yr, todayISO()).filter(i => !pending.has(i.id)).map(i => [i.id, i])).values()].slice(0, 3);
  if (!items.length) return null;
  return h('section', { class: 'e-card e-next' },
    h('h2', { class: 'e-h3', style: 'margin:0 0 8px' }, 'Ask for next'),
    h('div', { class: 'e-list' }, items.map(item => h('a', { class: 'e-row', href: '#new/' + encodeURIComponent(item.id) },
      h('span', { class: 'e-row__body' },
        h('span', { class: 'e-row__title' }, item.text),
        h('span', { class: 'e-row__meta' }, itemTags(item), item.completeBy ? ` · by ${item.completeBy}` : '')),
      h('span', { class: 'e-next__go' }, icon('plus'), 'Request')))));
}

function itemSheet(item, p) {
  const m = modal(item.text, h('div', { class: 'e-stack' },
    h('p', { class: 'e-rq-tags', style: 'margin:0' }, itemTags(item), item.completeBy ? h('span', {}, '· by ' + item.completeBy) : null),
    h('p', { style: 'margin:0' }, `${p.group.label}: `, h('b', {}, `${p.done} of ${p.min}`), ' done', p.group.each && p.items.length > 1 ? ' (each item at least once)' : ''),
    item.note ? h('p', { class: 'e-note', style: 'margin:0' }, item.note) : null,
    item.entrustQs && item.entrustQs.length ? h('details', { class: 'e-q__more' }, h('summary', {}, `Entrustment questions (${item.entrustQs.length})`),
      h('ul', { class: 'e-small' }, item.entrustQs.map(q => h('li', {}, q)))) : null,
    h('div', { class: 'e-actions' },
      h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', onclick: () => m.close() }, 'Close'),
      h('button', { class: 'a-btn e-go', onclick: () => { m.close(); go('new/' + item.id); } }, icon('plus'), 'Request this'))));
}

export function renderProgress() {
  const yr = myYear();
  const rows = progress(S.mine, yr, todayISO());
  const count = st => rows.filter(p => p.state === st).length;
  const lastByEpa = {};
  for (const ev of S.mine) if (ev.status === 'submitted' && ev.epa) lastByEpa[ev.epa] = Math.max(lastByEpa[ev.epa] || 0, toMs(ev.submittedAt) || 0);
  const pending = new Set(S.mine.filter(ev => ['requested', 'draft'].includes(ev.status)).map(ev => ev.itemId));

  const epaBlocks = EPAS.map(e => {
    const groups = rows.filter(p => p.group.epa === e.epa && shown(p.state));
    if (!groups.length) return null;
    const done = groups.reduce((n, p) => n + p.done, 0), min = groups.reduce((n, p) => n + p.min, 0);
    const worst = groups.reduce((w, p) => (RANK[p.state] < RANK[w] ? p.state : w), 'done');
    const stale = lastByEpa[e.epa] && Date.now() - lastByEpa[e.epa] > YEAR_MS;
    const det = h('details', { class: 'e-rq-epa', open: open.has(e.epa) ? true : null },
      h('summary', {},
        h('span', { class: 'e-rq-epa__n' }, e.epa),
        h('span', { class: 'e-rq-epa__t' }, e.title,
          h('span', { class: 'e-rq-tags' },
            h('span', { class: `e-rq-state e-rq-state--${worst}` }, STATE[worst][0]), h('span', {}, `· ${done}/${min}`),
            stale ? h('span', { class: 'e-tag' }, 'Not assessed >1 year') : null)),
        h('span', { class: 'e-rq-epa__bar' }, bar(done, min, worst))),
      groups.sort((a, b) => a.group.byYear - b.group.byYear).map(p => h('div', {},
        h('div', { class: 'e-prow' },
          h('div', { class: 'e-prow__top' },
            h('b', {}, p.group.label.includes(toolLabel(p.group.tool)) ? p.group.label : `${toolLabel(p.group.tool)} · ${p.group.label}`),
            h('span', { class: `e-rq-state e-rq-state--${p.state}` }, `${p.done}/${p.min} · ${STATE[p.state][0]}`)),
          bar(p.done, p.min, p.state),
          h('p', { class: 'e-small e-muted', style: 'margin:4px 0 0' }, `By ${p.group.completeBy || 'R' + p.group.byYear}${p.group.level ? ` · level ${p.group.level}` : ''}${p.group.each && p.items.length > 1 ? ' · each item at least once' : ''}`)),
        p.items.map(({ item, done: n }) => h('button', { type: 'button', class: 'e-rq-gitem', onclick: () => itemSheet(item, p) },
          h('span', { class: 'e-rq-gitem__n' + (n ? '' : ' is-zero') }, n ? '✓' + (n > 1 ? n : '') : '0'),
          h('span', { class: 'e-rq-gitem__t' }, item.text, pending.has(item.id) ? h('span', { class: 'e-chip e-chip--sent', style: 'margin-left:6px' }, 'Requested') : null),
          icon('chevron', 'e-row__chev'))))));
    det.addEventListener('toggle', () => { if (det.open) open.add(e.epa); else open.delete(e.epa); });
    return det;
  });

  return h('div', { class: 'e-stack e-progress-page' },
    h('section', { class: 'e-card' },
      h('p', { style: 'margin:0 0 8px' }, h('b', {}, `R${yr}`), ` · ${count('done')} of ${rows.length} requirements done`),
      h('div', { class: 'e-rq-sum' },
        count('overdue') ? h('span', { class: 'e-chip e-chip--overdue' }, `${count('overdue')} overdue`) : null,
        count('due-soon') ? h('span', { class: 'e-chip e-chip--in-progress' }, `${count('due-soon')} due this year`) : null,
        h('span', { class: 'e-chip e-chip--submitted' }, `${count('done')} done`)),
      bar(count('done'), rows.length, count('overdue') ? 'overdue' : 'on-track'),
      h('p', { class: 'e-small e-muted', style: 'margin:8px 0 0' }, 'Counts submitted evaluations. Repeats of an item count towards its group.')),
    nextCard(yr, pending),
    h('div', { class: 'e-chips e-progress-filter', role: 'group', 'aria-label': 'Show' }, VIEWS.map(([id, label]) =>
      h('button', { type: 'button', class: 'e-chip-btn', 'aria-pressed': String(view === id), onclick: () => { view = id; hooks.render(); } }, label))),
    h('div', { class: 'e-rq-legend', 'aria-hidden': 'true' }, Object.entries(STATE).map(([, [l, c]]) => h('span', { style: `--c:${c}` }, l))),
    epaBlocks.some(Boolean) ? h('div', { class: 'e-list' }, epaBlocks)
      : h('p', { class: 'e-small e-center' }, view === 'overdue' ? 'Nothing overdue.' : 'Nothing due this year.'),
    h('a', { class: 'a-btn a-btn--tinted a-btn--block e-btn-quiet e-btn-big', href: '#summary' }, 'My record: print or download'));
}

function bar(done, min, state) {
  const pct = min ? Math.min(100, Math.round(done / min * 100)) : 0;
  return h('div', { class: 'e-progress', role: 'progressbar', 'aria-label': `${done} of ${min} done`, 'aria-valuemin': '0', 'aria-valuemax': String(min), 'aria-valuenow': String(done) },
    h('div', { class: `e-progress__bar e-progress__bar--${state}`, style: `width:${Math.max(pct, done ? 4 : 0)}%` }));
}

// ---------- My record (#summary): one printable page, and a CSV ----------
// Progress against each EPA's groups, and every submitted evaluation (for a portfolio or a review).

export function renderSummary() {
  const yr = myYear();
  const rows = progress(S.mine, yr, todayISO());
  const res = S.roles.resident || {};
  const subs = S.mine.filter(ev => ev.status === 'submitted')
    .sort((a, b) => String(a.request?.date || a.date || '').localeCompare(String(b.request?.date || b.date || '')) || (toMs(a.submittedAt) || 0) - (toMs(b.submittedAt) || 0));
  const csv = async () => {
    const { toCSV } = await import('./ui-admin.js');
    download(`apmes-my-evaluations-${todayISO()}.csv`, new Blob([toCSV(subs, res.rid ? [res] : [])], { type: 'text/csv;charset=utf-8' }));
    toast(`Downloaded ${subs.length} evaluations`);
  };
  const epaTables = EPAS.map(e => {
    const groups = rows.filter(p => p.group.epa === e.epa);
    if (!groups.length) return null;
    return h('section', { class: 'e-sum-epa' },
      h('h3', { class: 'e-h3' }, `EPA ${e.epa}: ${e.title}`),
      h('table', { class: 'e-table e-sum-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Requirement'), h('th', { scope: 'col' }, 'By'), h('th', { scope: 'col', class: 'e-num' }, 'Done'), h('th', { scope: 'col' }, 'Status'))),
        h('tbody', {}, groups.sort((a, b) => a.group.byYear - b.group.byYear).map(p => h('tr', {},
          h('td', {}, p.group.label.includes(toolLabel(p.group.tool)) ? p.group.label : `${toolLabel(p.group.tool)} · ${p.group.label}`),
          h('td', {}, p.group.completeBy || 'R' + p.group.byYear),
          h('td', { class: 'e-num' }, `${p.done}/${p.min}`),
          h('td', {}, STATE[p.state][0]))))));
  });
  return h('div', { class: 'e-stack e-summary' },
    h('div', { class: 'e-actions e-noprint' },
      h('button', { class: 'a-btn', type: 'button', onclick: () => window.print() }, 'Print or save as PDF'),
      h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: csv }, 'Download CSV')),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin:0' }, res.name || S.user?.name || ''),
      h('p', { class: 'e-small', style: 'margin:4px 0 0' }, [res.rid, 'R' + yr, `${rows.filter(p => p.state === 'done').length} of ${rows.length} requirements done`, `printed ${fmtDate(todayISO())}`].filter(Boolean).join(' · ')),
      h('p', { class: 'e-small e-muted', style: 'margin:4px 0 0' }, 'APMES workplace-based assessments: submitted evaluations counted against the EPA requirements. Unofficial; it does not replace the official record.')),
    h('section', { class: 'e-card' }, epaTables),
    h('section', { class: 'e-card' },
      h('h3', { class: 'e-h3' }, `Submitted evaluations (${subs.length})`),
      subs.length ? h('table', { class: 'e-table e-sum-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Case date'), h('th', { scope: 'col' }, 'Form'), h('th', { scope: 'col' }, 'EPA'), h('th', { scope: 'col' }, 'Item'), h('th', { scope: 'col' }, 'Assessor'))),
        h('tbody', {}, subs.map(ev => h('tr', {},
          h('td', {}, fmtDate(ev.request?.date || ev.date || ev.submittedAt)),
          h('td', {}, toolLabel(ev.tool)),
          h('td', {}, ev.epa || ''),
          h('td', {}, ev.itemText || ev.itemId),
          h('td', {}, ev.assessorName || ev.assessorEmail))))) : h('p', { class: 'e-small' }, 'None yet.')));
}
