// Progress (my targets) and Totals (everyone's counts, for benchmarking; counts only, never details).

import { R_YEARS, BY_CODE, CATEGORIES } from './categories.js';
import { progress, epaProgress, todayISO } from './engine.js';
import { exportTotals } from './xlsxio.js';
import { reflectionProgress, needsCase } from './reflections.js';
import { S, h, toast, cloud, rYear, settings, patchLogbook, needExcel, download, displayName, hooks, add, resetters } from './ui-core.js';

const STATUS_TEXT = { late: 'Behind', due: 'Due this year', ontrack: 'On track', done: 'Done', none: 'No target' };
const pview = { by: 'cat' };

const legend = () => h('div', { class: 'legend' },
  ['late', 'due', 'ontrack', 'done'].map(s => h('span', {}, h('i', { class: `dot ${s}` }), STATUS_TEXT[s])));

// ---------- Progress ----------

export function renderProgress() {
  const yr = rYear();
  const rows = progress(S.counts, yr);
  const tally = s => rows.filter(r => r.status === s).length;
  const yearCtl = S.resident
    ? h('span', { class: 'big' }, R_YEARS[yr - 1])
    : h('select', { 'aria-label': 'Residency year', onchange: e => { patchLogbook({ settings: { rYear: Number(e.target.value) } }).then(() => hooks.render()); } },
      R_YEARS.map((r, i) => h('option', { value: String(i + 1), selected: i + 1 === yr }, r)));

  const head = h('section', { class: 'card' },
    h('div', { class: 'ry' },
      yearCtl,
      h('span', {}, yr <= 3 ? 'Junior residency (R1–R3)' : 'Senior residency (R4–R5)'),
      h('span', { class: 'muted' }, `${S.cases.length} cases logged`)),
    h('p', { class: 'hint', style: 'margin-top:8px' },
      `${tally('done')} done · ${tally('late')} behind · ${tally('due')} due this year · ${tally('ontrack')} on track. `,
      'Targets are cumulative: every case counts towards the R3 and R5 numbers whenever it was done.',
      S.resident ? '' : ' Not on the programme list, so pick your year here.'),
    legend(),
    h('div', { class: 'bar', style: 'margin:12px 0 0' },
      h('div', { class: 'seg' },
        h('button', { 'aria-pressed': String(pview.by === 'cat'), onclick: () => { pview.by = 'cat'; hooks.render(); } }, 'By category'),
        h('button', { 'aria-pressed': String(pview.by === 'epa'), onclick: () => { pview.by = 'epa'; hooks.render(); } }, 'By EPA')),
      h('span', { class: 'grow' }),
      h('button', { class: 'small', onclick: () => downloadSummary(rows, yr) }, 'Download summary')));

  const body = h('section', { class: 'card' });
  if (pview.by === 'epa') {
    for (const g of epaProgress(S.counts, yr)) {
      add(body, h('div', { class: 'epa' }, h('h3', {}, h('i', { class: `dot ${g.status}` }), `EPA ${g.epa}`), progList(g.items)));
    }
  } else {
    // what needs doing comes first: behind, then due this year
    const rank = { late: 0, due: 1 };
    const urgent = rows.filter(r => r.status in rank).sort((a, b) => rank[a.status] - rank[b.status]);
    if (urgent.length) add(body, h('h3', {}, 'Needs attention'), progList(urgent), h('h3', { style: 'margin-top:16px' }, 'All categories'));
    add(body, progList(rows));
  }
  return h('div', {}, head, reflCard(), body);
}

// Reflections at a glance; the full list and editor are on the Reflections tab (#reflect).
function reflCard() {
  const p = reflectionProgress(S.reflections || []);
  const met = p.headings.filter(x => x.met).length;
  const issues = p.headings.reduce((n, x) => n + x.issues.length, 0);
  return h('section', { class: 'card' },
    h('div', { class: 'bar' },
      h('h3', { style: 'margin:0' }, 'Reflections'),
      h('span', { class: 'grow' }),
      h('a', { class: 'btn small primary', href: '#reflect' }, 'Open reflections')),
    h('p', { class: 'hint', style: 'margin-top:8px' },
      `${p.totals.counted} / ${p.totals.min} counted · ${met} of ${p.headings.length} headings met · ${p.totals.drafts} draft${p.totals.drafts === 1 ? '' : 's'}`,
      issues ? ` · ${issues} to sort out` : '',
      (S.reflections || []).some(needsCase) ? ` · ${(S.reflections || []).filter(needsCase).length} not linked to a case` : ''),
    h('span', { class: 'meter' }, h('i', { class: met === p.headings.length ? 'done' : 'ontrack', style: `width:${Math.min(100, Math.round(p.totals.counted / p.totals.min * 100))}%` })));
}

function progList(items) {
  return h('ul', { class: 'prog' }, items.map(p => {
    const c = BY_CODE[p.code];
    const max = Math.max(1, ...p.milestones.map(m => m.n));
    const pct = Math.min(100, Math.round((p.count / max) * 100));
    return h('li', { class: c.parent ? 'sub' : '', title: c.full || c.name },
      h('i', { class: `dot ${p.status}`, title: STATUS_TEXT[p.status] }),
      h('span', { class: 'nm' }, h('b', {}, p.code), p.name),
      h('span', { class: 'ct' }, p.status === 'none' ? String(p.count) : p.next ? `${p.count} / ${p.next.n}` : `${p.count} ✓`),
      p.milestones.length ? h('span', { class: 'meter' }, h('i', { class: p.status, style: `width:${pct}%` })) : null,
      p.milestones.length ? h('span', { class: 'ms' }, p.milestones.map(m => `${m.by}: ${m.n}${m.met ? ' ✓' : ''}`).join(' · ')
        + (p.next ? ` — ${p.next.n - p.count} more by end of ${p.next.by}` : '')) : null);
  }));
}

async function downloadSummary(rows, yr) {
  try {
    await needExcel();
    const blob = await exportTotals({
      title: `${displayName() || 'Logbook'} — ${R_YEARS[yr - 1]} — ${todayISO()}`, sheet: 'Summary',
      columns: ['Count', 'Next target', 'Status'],
      rows: rows.map(p => ({
        label: BY_CODE[p.code].label, values: [p.count, p.next ? `${p.next.n} by ${p.next.by}` : '', STATUS_TEXT[p.status]],
        statuses: [p.status, '', ''],
      })),
    });
    download(`logbook-summary-${todayISO()}.xlsx`, blob);
  } catch (err) { toast('Could not export: ' + err.message); }
}

// ---------- Totals ----------

const tview = { summaries: null, loading: false, intake: null, error: '' };
resetters.push(() => Object.assign(tview, { summaries: null, intake: null, error: '' }));

export function renderTotals() {
  const card = h('section', { class: 'card' });
  if (!tview.summaries && !tview.loading) loadSummaries();
  if (tview.loading && !tview.summaries) { add(card, h('p', { class: 'empty' }, 'Loading totals…')); return card; }
  if (tview.error) add(card, h('p', { class: 'tip' }, tview.error));
  const all = tview.summaries || [];
  if (!all.length) { add(card, h('p', { class: 'empty' }, 'No programme totals yet.')); return card; }

  const intakes = [...new Set(all.map(s => s.intake).filter(Boolean))].sort((a, b) => b - a);
  const mine = S.resident && S.resident.intake;
  if (!tview.intake || !intakes.includes(tview.intake)) tview.intake = intakes.includes(mine) ? mine : intakes[0];
  const people = all.filter(s => s.intake === tview.intake).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const table = totalsTable(people);

  add(card, 
    h('div', { class: 'bar' },
      h('h2', { style: 'margin:0' }, 'Programme totals'),
      h('select', { 'aria-label': 'Intake year', onchange: e => { tview.intake = Number(e.target.value); hooks.render(); } },
        intakes.map(y => h('option', { value: String(y), selected: y === tview.intake }, `AY${y} intake`))),
      h('span', { class: 'grow' }),
      h('button', { class: 'small', onclick: () => { tview.summaries = null; hooks.render(); } }, 'Refresh'),
      h('button', { class: 'small', onclick: () => downloadTotals(table.data) }, 'Download Excel')),
    h('p', { class: 'hint' }, 'Case counts only, so residents can see how they compare. Colours use each resident’s own year.'),
    legend(),
    h('div', { class: 'scroll', style: 'margin-top:8px' }, table.el));
  return card;
}

async function loadSummaries() {
  tview.loading = true; tview.error = '';
  // counts are written by each resident's device: anything that isn't a whole number counts as 0
  const clean = c => Object.fromEntries(Object.entries(c && typeof c === 'object' ? c : {}).map(([k, v]) => [k, Number.isFinite(v) && v > 0 ? Math.floor(v) : 0]));
  try { tview.summaries = (await cloud.listSummaries()).map(x => ({ ...x, counts: clean(x.counts) })); }
  catch (err) { tview.summaries = []; tview.error = 'Could not load totals: ' + err.message; }
  tview.loading = false;
  if (S.tab === 'totals') hooks.render();
}

function totalsTable(people) {
  const prog = people.map(p => Object.fromEntries(progress(p.counts || {}, p.rYear || 1).map(x => [x.code, x])));
  const codes = CATEGORIES.filter(c => !c.retired || people.some(p => (p.counts || {})[c.code])).map(c => c.code);
  const meId = S.resident && S.resident.rid;
  const data = { columns: people.map(p => `${p.name} (R${p.rYear || '?'})`), rows: [] };
  const tbody = h('tbody');
  for (const code of codes) {
    const vals = people.map(p => (p.counts || {})[code] || 0);
    const sts = prog.map(pr => (pr[code] ? pr[code].status : 'none'));
    data.rows.push({ label: BY_CODE[code].label, values: vals, statuses: sts });
    add(tbody, h('tr', {}, h('td', { class: 'cat', title: BY_CODE[code].full }, `${code} ${BY_CODE[code].name}`),
      vals.map((v, i) => h('td', { class: `n ${sts[i]}` }, String(v)))));
  }
  const totals = people.map(p => p.total || 0);
  const refl = people.map(p => p.reflectionsTotal || 0);
  data.rows.push({ label: 'Total cases', values: totals }, { label: 'Reflections', values: refl });
  add(tbody, 
    h('tr', { class: 'total' }, h('td', { class: 'cat' }, 'Total cases'), totals.map(v => h('td', { class: 'n' }, String(v)))),
    h('tr', {}, h('td', { class: 'cat' }, 'Reflections'), refl.map(v => h('td', { class: 'n' }, String(v)))));
  const thead = h('thead', {}, h('tr', {}, h('th', {}, 'Category'),
    people.map(p => h('th', { class: `rot ${p.rid === meId ? 'me' : ''}`, title: p.name }, `${p.name} · R${p.rYear || '?'}`))));
  data.title = `AY${tview.intake} intake totals — ${todayISO()}`;
  return { el: h('table', { class: 'totals' }, thead, tbody), data };
}

async function downloadTotals(data) {
  try {
    await needExcel();
    download(`totals-AY${tview.intake}-${todayISO()}.xlsx`, await exportTotals(data));
  } catch (err) { toast('Could not export: ' + err.message); }
}

