// Progress (#progress, resident): each EPA (collapsible) with its guidebook groups, done/min and a
// state colour for my year (done, on track, due this year, overdue, later). Tap an item → Request this.

import { S, h, icon, go, toolLabel, toMs, modal } from './ui-core.js';
import { progress } from './engine.js';
import { EPAS } from './catalogue.js';
import { residentCSS, itemTags, myYear } from './ui-request.js';

residentCSS();

const STATE = {
  done: ['Done', 'var(--e-go)'],
  overdue: ['Overdue', 'var(--n-red)'],
  'due-soon': ['Due this year', '#b7791f'],
  'on-track': ['On track', 'var(--n-blue)'],
  later: ['Later', 'var(--n-muted)'],
};
const RANK = { overdue: 0, 'due-soon': 1, 'on-track': 2, later: 3, done: 4 };
const YEAR_MS = 365 * 864e5;
const open = new Set();   // EPAs the resident opened (kept across repaints)

function itemSheet(item, p) {
  const m = modal(item.text, h('div', { class: 'e-stack' },
    h('p', { class: 'e-rq-tags', style: 'margin:0' }, itemTags(item), item.completeBy ? h('span', {}, '· by ' + item.completeBy) : null),
    h('p', { style: 'margin:0' }, `${p.group.label}: `, h('b', {}, `${p.done} of ${p.min}`), ' done', p.group.each && p.items.length > 1 ? ' (each item at least once)' : ''),
    item.note ? h('p', { class: 'e-note', style: 'margin:0' }, item.note) : null,
    item.entrustQs && item.entrustQs.length ? h('details', { class: 'e-q__more' }, h('summary', {}, `Entrustment questions (${item.entrustQs.length})`),
      h('ul', { class: 'e-small' }, item.entrustQs.map(q => h('li', {}, q)))) : null,
    h('div', { class: 'e-actions' },
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => m.close() }, 'Close'),
      h('button', { class: 'n-btn e-go', onclick: () => { m.close(); go('new/' + item.id); } }, icon('plus'), 'Request this'))));
}

export function renderProgress() {
  const yr = myYear();
  const rows = progress(S.mine, yr);
  const count = st => rows.filter(p => p.state === st).length;
  const lastByEpa = {};
  for (const ev of S.mine) if (ev.status === 'submitted' && ev.epa) lastByEpa[ev.epa] = Math.max(lastByEpa[ev.epa] || 0, toMs(ev.submittedAt) || 0);
  const pending = new Set(S.mine.filter(ev => ['requested', 'draft'].includes(ev.status)).map(ev => ev.itemId));

  const epaBlocks = EPAS.map(e => {
    const groups = rows.filter(p => p.group.epa === e.epa);
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
    h('div', { class: 'e-rq-legend', 'aria-hidden': 'true' }, Object.entries(STATE).map(([, [l, c]]) => h('span', { style: `--c:${c}` }, l))),
    h('div', { class: 'e-list' }, epaBlocks));
}

function bar(done, min, state) {
  const pct = min ? Math.min(100, Math.round(done / min * 100)) : 0;
  return h('div', { class: 'e-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(min), 'aria-valuenow': String(done) },
    h('div', { class: `e-progress__bar e-progress__bar--${state}`, style: `width:${Math.max(pct, done ? 4 : 0)}%` }));
}
