// Analytics (my targets, reflections and trends; the #progress tab) and Totals (everyone's counts, for
// benchmarking; counts only, never details).

import { R_YEARS, BY_CODE, CATEGORIES, appYear, yearName } from './categories.js';
import { splitAge, splitInitials, progress, todayISO, rYearDefault, weekLead, weekdayNames, fmtDate, finalTarget, towardsMinimum, tagTotal, MINIMUM_TOTAL } from './engine.js';
import { display, setDisplay } from './display.js';
import { exportTotals } from './xlsxio.js';
import { reflectionProgress, HEADING_BY_ID, suggestHeadings } from './reflections.js';
import { logbookGlance, reflectionGlance, cohortGlance } from './glance.js';
import { paceForecast, paceText, goneQuiet, reflectionTodos, arrangeCards, moveCard, hideCard, finishLine, monthSummary, milestones, ageMix, caseMix, loggingHabits, shortNames } from './analytics.js';
import { reflectOnCase, openReflection } from './ui-reflect.js';
import { gripDrag } from './drag-list.js';
import { S, h, ic, toast, cloud, rYear, myYearName, settings, subcatsOf, patchLogbook, needExcel, download, displayName, hooks, add, resetters, info, catName, catShort, tagName, summaryOf, basicHides } from './ui-core.js';

const STATUS_TEXT = { late: 'Behind', due: 'Due this year', ontrack: 'On track', done: 'Done', none: 'No target' };
// Advanced mode only (not Basic): pace forecast, Gone quiet, Reflection to-dos, and numbers that open their cases
const advanced = () => !basicHides('analytics');
// a tag name that opens the Logbook on its cases (Advanced); plain text in Basic mode
const casesLink = (label, opts, title) => advanced()
  ? h('a', { class: 'an-link', href: '#logbook', title: title || 'Show these cases in the Logbook', onclick: () => hooks.showCases?.(opts) }, label)
  : label;
// open: the sections you have expanded (they start folded, showing a one-line summary)
const pview = { open: new Set() };

export const legend = () => h('div', { class: 'legend' },
  ['late', 'due', 'ontrack', 'done'].map(s => h('span', {}, h('i', { class: `dot ${s}` }), STATUS_TEXT[s])));

// ---------- Progress ----------

export function renderProgress() {
  // Profile → APMES: targets, the residency year and the programme totals each have a switch (off in Personal)
  if (basicHides('targets')) return renderCounts();
  const yearOn = !basicHides('year'), totalsOn = !basicHides('totals');
  const yr = rYear();
  const rows = progress(S.counts, yr);
  const tally = s => rows.filter(r => r.status === s).length;
  const yearCtl = h('span', { class: 'big' }, myYearName());

  const [infoBtn, infoText] = info('Targets are cumulative: every case counts towards the R3 and SR2 numbers whenever it was done.');
  const head = h('section', { class: 'card' },
    h('div', { class: 'ry' },
      yearOn ? yearCtl : null,
      yearOn ? h('span', {}, S.resident && S.resident.status === 'SMO' ? 'SMO: cases count as R3' : yr <= 3 ? 'Junior residency (R1–R3)' : 'Senior residency (SR1–SR2)') : null,
      h('span', { class: 'muted' }, `${S.cases.length} cases logged`)),
    // the counts double as the legend: one line of coloured dots
    h('p', { class: 'legend tally', style: 'margin:8px 0 0' },
      [['late', 'behind'], ['due', 'due this year'], ['ontrack', 'on track'], ['done', 'done']].map(([k, t], i) => [h('span', { style: 'white-space:nowrap' }, h('i', { class: `dot ${k}` }), ` ${tally(k)} ${t}`, i < 3 ? '\u00a0·' : ''), i < 3 ? ' ' : '']).flat(),   // a wrap never starts a line with ·
      ' ', infoBtn),
    infoText,
    S.resident || !yearOn ? null : h('p', { class: 'hint', style: 'margin:4px 0 0' }, 'Not on the programme list, so your year is set in ', h('a', { href: '#account' }, 'Account'), '.'));
  // Advanced: your pace over the last 6 months; tags on track whose next target won't be reached in time are "off pace"
  const fc = advanced() ? paceForecast(rows, S.cases, yr, todayISO()) : {};
  const offPace = r => r.status === 'ontrack' && fc[r.code] && fc[r.code].offPace;
  // what needs doing: behind, then due this year, then off pace
  const rank = { late: 0, due: 1, offpace: 2 };
  const rankOf = r => (r.status in rank ? rank[r.status] : offPace(r) ? rank.offpace : -1);
  const urgent = rows.filter(r => rankOf(r) >= 0).sort((a, b) => rankOf(a) - rankOf(b));
  const nOff = urgent.filter(offPace).length;
  const urgentSec = section('urgent', urgent.length ? `Needs attention (${urgent.length})` : 'Needs attention',
    urgent.length ? `${tally('late')} behind · ${tally('due')} due this year${nOff ? ` · ${nOff} off pace` : ''}` : 'Nothing behind or due this year ✓',
    urgent.length ? progList(urgent, fc) : h('p', { class: 'empty' }, 'Nothing behind or due this year ✓'),
    nOff ? h('p', { class: 'hint help', style: 'margin:6px 0 0' }, 'Off pace: on track for now, but at the pace of your last 6 months the next target won’t be reached by the end of its year.') : null);
  // Advanced: tags still needed that haven't been logged for 60 days or more
  const quiet = advanced() ? goneQuiet(rows, S.cases, todayISO()) : [];
  const quietSec = quiet.length ? section('quiet', `Gone quiet (${quiet.length})`, 'Still needed, nothing logged in 60 days or more',
    h('ul', { class: 'an-list' }, quiet.map(x => h('li', {}, casesLink(catName(x.code), { tag: 'c:' + x.code }),
      h('small', { class: 'muted' }, ` · last ${fmtDate(x.last)} (${x.days} days ago)`)))),
    h('p', { class: 'hint help', style: 'margin:6px 0 0' }, 'Worth asking for these lists. Tags you haven’t logged yet are under Logbook.')) : null;
  const shown = pview.hideDone ? rows.filter(r => r.status !== 'done') : rows;
  const withTarget = rows.filter(r => r.status !== 'none');
  // at a glance (before the card is opened): the summary line and one bar by status with this year's goal; where
  // you sit in your year is inside the card (owner's Apple-apps review: one number and one bar, the detail inside)
  const lg = logbookGlance(rows);
  const cohort = totalsOn ? cohortNow() : null;
  const logGlance = h('div', { class: 'glance' }, statusBar(lg));
  const targets = section('targets', 'Logbook', `${tally('done')} of ${withTarget.length} tags done · ${S.cases.length} cases`, logGlance,
    cohort ? h('div', { class: 'glance an-year' }, h('h3', {}, 'You and your year'),
      strip('Tags done', lg.done, cohort.tags, lg.total), strip('Cases logged', S.cases.length, cohort.cases)) : null,
    h('label', { class: 'check', style: 'margin:0 0 4px' }, h('input', { type: 'checkbox', checked: !!pview.hideDone, onchange: e => { pview.hideDone = e.target.checked; hooks.render(); } }), 'Hide done'),
    progList(shown, fc));
  // everyone's counts are on their own tab, Totals (owner, 15 Oct 2026), not linked from here
  return layoutPage(head, { urgent: urgentSec, finish: advanced() ? finishCard(fc) : null, month: monthCard(true), quiet: quietSec, targets,
    refl: reflectionsOn() ? reflCard() : null, material: reflectionsOn() ? materialCard() : null, todo: advanced() ? todoCard() : null,
    milestones: milestonesCard(true), trends: advanced() ? trendsCard() : null, ...extraCards() });
}
const reflectionsOn = () => !basicHides('reflect') && !basicHides('reflHeadings');

// Analytics without the targets (Profile → APMES off; the Personal profile): how many cases each tag has, your own
// tags too, most first; then the trends
function renderCounts() {
  const n = new Map();
  for (const c of S.cases) {
    for (const k of c.cats || []) n.set('c:' + k, (n.get('c:' + k) || 0) + 1);
    for (const k of c.tags || []) n.set(k, (n.get(k) || 0) + 1);
  }
  const rows = [...n].sort((a, b) => b[1] - a[1]);
  const name = k => (k.startsWith('c:') ? catName(k.slice(2)) : tagName(k));
  const head = h('section', { class: 'card' }, h('div', { class: 'ry' }, h('span', { class: 'big' }, String(S.cases.length)), h('span', {}, `case${S.cases.length === 1 ? '' : 's'} logged`)));
  const counts = section('counts', 'Tags', `${rows.length} tag${rows.length === 1 ? '' : 's'} used · ${S.cases.length} cases`,
    rows.length ? h('ul', { class: 'an-list' }, rows.map(([k, x]) => h('li', {}, casesLink(name(k), { tag: k }), h('small', { class: 'muted' }, ` · ${x} case${x === 1 ? '' : 's'}`))))
      : h('p', { class: 'empty' }, 'No cases yet.'));
  return layoutPage(head, { counts, month: monthCard(false), refl: reflectionsOn() ? reflCard() : null, material: reflectionsOn() ? materialCard() : null,
    todo: advanced() ? todoCard() : null, milestones: milestonesCard(false), trends: advanced() ? trendsCard() : null, ...extraCards() });
}

// ---------- more cards (5b; owner, 15 Oct 2026). Estimates from the case text say so, with how many cases they read ----------

const monthName = iso => new Date(iso + 'T00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
const tagTarget = targetsOn => (targetsOn ? code => finalTarget(code) : () => null);
function finishCard(fc) {
  const rows = finishLine(fc, todayISO());
  if (!rows.length) return null;
  const late = rows.filter(r => r.late).length;
  return section('finish', 'Finish line', late ? `${late} tag${late === 1 ? '' : 's'} won’t reach the next target in time at your pace` : 'Every tag reaches its next target in time at your pace ✓',
    h('ul', { class: 'an-list' }, rows.map(r => h('li', {}, casesLink(catName(r.code), { tag: 'c:' + r.code }),
      h('small', { class: r.late ? 'warn' : 'muted' }, ` · ${r.eta ? 'about ' + monthName(r.eta) : 'no recent cases'} · due by ${monthName(r.deadline)}`)))),
    h('p', { class: 'hint help', style: 'margin:6px 0 0' }, 'At the pace of your last 6 months, when each tag reaches its next target, and the end of the year it is due in.'));
}
function monthCard(targetsOn) {
  const m = monthSummary(S.cases, todayISO(), tagTarget(targetsOn));
  const name = new Date(m.month + '-01T00:00').toLocaleDateString(undefined, { month: 'long' });
  return section('month', `This month (${name})`, `${m.n} case${m.n === 1 ? '' : 's'}${m.first.length ? ` · ${m.first.length} new tag${m.first.length === 1 ? '' : 's'}` : ''}${m.met.length ? ` · ${m.met.length} target${m.met.length === 1 ? '' : 's'} met` : ''}`,
    m.n ? h('ul', { class: 'an-list' },
      m.top.length ? h('li', {}, 'Most logged: ', m.top.map(([code, n], i) => [i ? ', ' : '', casesLink(catName(code), { tag: 'c:' + code }), ` (${n})`])) : null,
      m.first.length ? h('li', {}, 'First time: ', m.first.map(c => catName(c)).join(', ')) : null,
      m.met.length ? h('li', {}, 'Final target reached: ', m.met.map(c => catName(c)).join(', '), ' ✓') : null) : h('p', { class: 'empty' }, 'No cases yet this month.'));
}
function materialCard() {
  const short = new Set(reflectionProgress(S.reflections).headings.filter(x => !x.met).map(x => x.id));
  const linked = new Set((S.reflections || []).map(r => r.caseId).filter(Boolean));
  const by = new Map();
  for (const c of S.cases.filter(c => c.reflectTag && !linked.has(c.id))) {
    const hd = suggestHeadings(c, S.reflections).find(x => short.has(x.headingId));
    if (hd) (by.get(hd.headingId) || by.set(hd.headingId, []).get(hd.headingId)).push(c);
  }
  const n = [...by.values()].reduce((a, l) => a + l.length, 0);
  return section('material', 'Reflection material', n ? `${n} ☆ case${n === 1 ? '' : 's'} for ${by.size} heading${by.size === 1 ? '' : 's'} still short` : 'No ☆ Interesting cases for the headings still short',
    by.size ? h('ul', { class: 'an-list' }, [...by].map(([id, list]) => h('li', {}, h('b', {}, HEADING_BY_ID[id].name), ': ',
      list.slice(0, 5).map((c, i) => [i ? ', ' : '', h('a', { href: '#reflect', class: 'an-link', onclick: e => { e.preventDefault(); reflectOnCase(c); } }, `${c.initials || 'Case'} ${fmtDate(c.date)}`)]),
      list.length > 5 ? ` and ${list.length - 5} more` : ''))) : h('p', { class: 'empty' }, 'Star cases with ☆ Interesting on the Add tab; the ones that fit a heading you still need show here.'));
}
function milestonesCard(targetsOn) {
  const list = milestones(S.cases, tagTarget(targetsOn));
  if (!list.length) return null;
  const say = x => (x.kind === 'first' ? 'Your first case' : x.kind === 'cases' ? `${x.n} cases` : `${catName(x.code)}: final target (${x.n}) reached`);
  return section('milestones', 'Milestones', `${list.length} so far · latest: ${say(list[0])}`,
    h('ul', { class: 'an-list' }, list.slice(0, 15).map(x => h('li', {}, say(x), h('small', { class: 'muted' }, ` · ${fmtDate(x.date)}`)))));
}
// an age read from the case text as years ("72M", "5yo", "3/12", "2/52", "10 d/o"), or null
const ageOf = t => {
  const a = splitAge(splitInitials(t).details).age; if (!a) return null;
  const m = a.match(/^(\d+)(mo|m\/o|\/12|\/52|d\/o)?/i); if (!m) return null;
  const n = Number(m[1]), u = (m[2] || '').toLowerCase();
  return ['mo', 'm/o', '/12'].includes(u) ? n / 12 : u === '/52' ? n / 52 : u === 'd/o' ? n / 365 : n;
};
const share = (n, of) => (of ? Math.round(100 * n / of) + '%' : '–');
const estFrom = (n, of) => h('p', { class: 'hint help', style: 'margin:6px 0 0' }, `Estimated from the words in ${n} of ${of} cases.`);
function extraCards() {
  if (!S.cases.length) return {};
  const ages = ageMix(S.cases, ageOf), mix = caseMix(S.cases), hb = loggingHabits(S.cases, todayISO());
  const bars = rows => h('ul', { class: 'an-list' }, rows.map(([label, n, of]) => h('li', {}, label, h('small', { class: 'muted' }, ` · ${n} (${share(n, of)})`))));
  return {
    ages: section('ages', 'Patient ages (estimated)', `from ${ages.known} of ${ages.total} cases`, bars(ages.bands.map(([l, n]) => [l, n, ages.known])), estFrom(ages.known, ages.total)),
    mix: section('mix', 'Case mix (estimated)', `${mix.ga} GA · ${mix.regional} regional · ${mix.emergency} emergency`,
      h('h3', {}, 'ASA'), bars(mix.asa.filter(([, n]) => n).map(([a, n]) => [`ASA ${a}`, n, mix.known.asa])), estFrom(mix.known.asa, mix.total),
      h('h3', {}, 'Elective or emergency'), bars([['Elective', mix.elective, mix.known.urgency], ['Emergency', mix.emergency, mix.known.urgency]]), estFrom(mix.known.urgency, mix.total),
      h('h3', {}, 'GA or regional'), bars([['GA', mix.ga, mix.known.technique], ['Regional', mix.regional, mix.known.technique]]), estFrom(mix.known.technique, mix.total)),
    habits: section('habits', 'Logging habits', hb.median == null ? 'Not enough cases yet' : `${share(Math.round(hb.sameDay * hb.logged), hb.logged)} logged on the day · streak ${hb.now} day${hb.now === 1 ? '' : 's'}`,
      h('ul', { class: 'an-list' },
        h('li', {}, `Logged on the day of the case: ${share(Math.round((hb.sameDay || 0) * hb.logged), hb.logged)}`),
        h('li', {}, `Usually logged: ${hb.median == null ? '–' : hb.median === 0 ? 'the same day' : hb.median + ' day' + (hb.median === 1 ? '' : 's') + ' after'}`),
        h('li', {}, `Days in a row with a case: ${hb.now} now, ${hb.best} at most`))),
  };
}

// ---------- Edit mode (owner, 15 Oct 2026): the cards in your order, some hidden; saved for the account ----------

const CARD_NAMES = { urgent: 'Needs attention', finish: 'Finish line', month: 'This month', quiet: 'Gone quiet', targets: 'Logbook', counts: 'Tags', refl: 'Reflections',
  material: 'Reflection material', todo: 'Reflection to-dos', milestones: 'Milestones', trends: 'Trends', ages: 'Patient ages', mix: 'Case mix', habits: 'Logging habits' };
// the less important cards start hidden: Edit → Hidden cards → Show (owner, 15 Oct 2026)
const OFF_CARDS = ['ages', 'mix', 'habits'];
// cards: id -> its card, or null when this profile (or the data) has none; the cards a profile can't use aren't listed
function layoutPage(head, cards) {
  const ids = Object.keys(cards).filter(k => cards[k]);
  const layout = settings().anLayout;
  const { shown, hidden } = arrangeCards(ids, layout, OFF_CARDS);
  if (pview.edit) return h('div', {}, head, editCard(ids, layout));
  const edit = () => { pview.edit = true; hooks.render(); };
  return h('div', {}, head,
    h('div', { class: 'bar an-editbar' }, hidden.length ? h('span', { class: 'hint' }, `${hidden.length} card${hidden.length === 1 ? '' : 's'} hidden`) : null,
      h('span', { style: 'flex:1' }), h('button', { type: 'button', class: 'small', onclick: edit }, 'Edit')),
    ...shown.map(id => cards[id]));
}
function editCard(ids, layout) {
  const { shown, hidden } = arrangeCards(ids, layout, OFF_CARDS);
  const save = l => { patchLogbook({ settings: { anLayout: l } }); hooks.render(); };
  const list = h('ul', { class: 'an-edit-list', role: 'list' }, shown.map((id, i) => h('li', { 'data-card': id },
    h('span', { class: 'an-grip', 'aria-hidden': 'true', title: 'Drag to move', onpointerdown: e => drag(e, id) }, '⠿'),
    h('span', { class: 'an-edit-name' }, CARD_NAMES[id] || id),
    h('button', { type: 'button', class: 'small icon-btn', 'aria-label': `Move ${CARD_NAMES[id]} up`, disabled: i === 0, onclick: () => save(moveCard(ids, layout, id, -1, OFF_CARDS)) }, '↑'),
    h('button', { type: 'button', class: 'small icon-btn', 'aria-label': `Move ${CARD_NAMES[id]} down`, disabled: i === shown.length - 1, onclick: () => save(moveCard(ids, layout, id, 1, OFF_CARDS)) }, '↓'),
    h('button', { type: 'button', class: 'small', 'aria-label': `Hide ${CARD_NAMES[id]}`, onclick: () => save(hideCard(ids, layout, id, true, OFF_CARDS)) }, 'Hide'))));
  const drag = (e, id) => gripDrag(e, list, (from, to) => save(moveCard(ids, layout, id, to - from, OFF_CARDS)));
  return h('section', { class: 'card an-edit' },
    h('h2', {}, 'Arrange Analytics'),
    h('p', { class: 'hint help' }, 'Drag a card by ⠿, or use the arrows. Hidden cards wait below. Saved for your account.'),
    list,
    hidden.length ? [h('h3', {}, 'Hidden cards'), h('ul', { class: 'an-edit-list', role: 'list' }, hidden.map(id => h('li', {},
      h('span', { class: 'an-edit-name' }, CARD_NAMES[id] || id),
      h('button', { type: 'button', class: 'small', 'aria-label': `Show ${CARD_NAMES[id]}`, onclick: () => save(hideCard(ids, layout, id, false, OFF_CARDS)) }, 'Show'))))] : null,
    h('div', { class: 'bar', style: 'margin:12px 0 0' },
      h('button', { type: 'button', class: 'linkish', onclick: () => save(null) }, 'Reset layout'),
      h('span', { style: 'flex:1' }),
      h('button', { type: 'button', class: 'primary', onclick: () => { pview.edit = false; hooks.render(); } }, 'Done')));
}
resetters.push(() => { pview.edit = false; });

// A folded card: the title and a one-line summary; tap to open the full section (kept open while you stay).
// glance (optional, a .glance element): shown under the summary whether open or not.
function section(id, title, summary, ...content) {
  const open = pview.open.has(id);
  const glance = content[0] && content[0].classList && content[0].classList.contains('glance') ? content.shift() : null;
  return h('details', { class: 'card fold-card an-sec', open, ontoggle: e => { if (e.target.open) pview.open.add(id); else pview.open.delete(id); } },
    h('summary', {}, h('span', { class: 'an-t' }, title), h('small', { class: 'an-s' }, summary), glance),
    h('div', { class: 'an-body' }, ...content));
}

// ---------- at a glance: a progress bar with the year's goal, and where you sit in your year ----------

// your residency year's spread, from the Totals summaries (programme residents only; loaded once)
function cohortNow() {
  if (!S.resident) return null;
  if (!tview.summaries && !tview.loading) loadSummaries().then(() => { if (S.tab === 'progress') hooks.render(); });
  if (!tview.summaries) return null;
  // you, as you are right now (your saved summary may be a few minutes old)
  const me = { rYear: rYear(), counts: S.counts, total: S.cases.length, reflectionsTotal: reflectionProgress(S.reflections || []).totals.counted };
  return cohortGlance([...tview.summaries.filter(x => String(x.rid) !== String(S.resident.rid)), me], rYear());
}
const pct = (v, max) => `${Math.max(0, Math.min(100, max ? (v / max) * 100 : 0)).toFixed(1)}%`;
// Logbook: done | on track | due | behind, out of the tags with a target; the tick is this year's goal
function statusBar(g) {
  const seg = (k, n) => n ? h('i', { class: `seg-${k}`, style: `width:${pct(n, g.total)}` }) : null;
  return h('div', { class: 'gl-row' },
    h('div', { class: 'gl-bar', role: 'img', 'aria-label': `${g.done} of ${g.total} tags done; ${g.goal} should be done by the end of this year` },
      seg('done', g.done), seg('due', g.due), seg('late', g.late), seg('ontrack', g.ontrack),
      h('b', { class: 'gl-goal', style: `left:${pct(g.goal, g.total)}`, title: 'Goal for the end of this year' })),
    h('small', { class: 'gl-cap' }, g.goal > g.done ? `${g.goal - g.done} more to reach this year’s goal (the tick)` : 'This year’s goal reached ✓'));
}
// Reflections: counted out of 96; the tick is where steady progress over five years would be by now
function meterBar(g) {
  return h('div', { class: 'gl-row' },
    h('div', { class: 'gl-bar', role: 'img', 'aria-label': `${g.counted} of ${g.total} reflections counted; about ${g.goal} by the end of this year keeps pace` },
      h('i', { class: 'seg-done', style: `width:${pct(g.counted, g.total)}` }),
      h('b', { class: 'gl-goal', style: `left:${pct(g.goal, g.total)}`, title: 'On pace for the end of this year' })),
    h('small', { class: 'gl-cap' }, g.counted >= g.goal ? 'On pace for this year ✓' : `${g.goal - g.counted} more to be on pace by the end of this year (the tick)`));
}
// You against your year: the line runs lowest to highest, the box is the middle half, the bar in it the
// median, the dot is you
function strip(label, you, d, scaleMax) {
  const max = Math.max(scaleMax || 0, d.max, you, 1);
  const r = v => Math.round(v * 10) / 10;
  return h('div', { class: 'gl-row' },
    h('div', { class: 'gl-strip', role: 'img', 'aria-label': `${label}: you ${you}; your year: lowest ${d.min}, median ${r(d.median)}, highest ${d.max}` },
      h('i', { class: 'st-range', style: `left:${pct(d.min, max)};width:${pct(d.max - d.min, max)}` }),
      h('i', { class: 'st-box', style: `left:${pct(d.p25, max)};width:${pct(d.p75 - d.p25, max)}` }),
      h('i', { class: 'st-med', style: `left:${pct(d.median, max)}` }),
      h('b', { class: 'st-you', style: `left:${pct(you, max)}` })),
    h('small', { class: 'gl-cap' }, `${label}: you ${you} · your year ${d.min}–${d.max}, median ${r(d.median)} (${d.n} residents)`));
}

// ---------- trends (your cases over time; only you see these) ----------

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function trendsCard() {
  const cases = (S.cases || []).filter(c => c.date);
  const today = todayISO();
  const back = n => { const d = new Date(); d.setDate(d.getDate() - n); return todayISO(d); };
  const last30 = cases.filter(c => c.date > back(30) && c.date <= today).length;
  // cases per month, the last 12 months
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MON[d.getMonth()], n: 0 }; });
  const byMonth = new Map(months.map(m => [m.key, m]));
  for (const c of cases) { const m = byMonth.get(c.date.slice(0, 7)); if (m) m.n++; }
  const max = Math.max(1, ...months.map(m => m.n));
  const bars = h('div', { class: 'an-bars', role: 'img', 'aria-label': 'Cases per month: ' + months.map(m => `${m.label} ${m.n}`).join(', ') },
    months.map(m => h('a', { class: 'an-bar', href: '#logbook', title: `${m.label}: ${m.n} (show these cases)`, 'aria-label': `${m.label}: ${m.n} cases`,
      onclick: () => hooks.showCases?.({ from: m.key + '-01', to: m.key + '-31' }) }, h('small', {}, m.n || ''), h('i', { style: `height:${Math.round(m.n / max * 100)}%` }), h('span', {}, m.label[0]))));
  // a year of days, a square per day (darker = more cases), weeks as columns
  const perDay = new Map();
  for (const c of cases) perDay.set(c.date, (perDay.get(c.date) || 0) + 1);
  const ws = settings().weekStart;
  const start = new Date(); start.setDate(start.getDate() - 364 - weekLead(start, ws));
  const cols = [];
  for (let w = 0; w < 53; w++) {
    const col = h('div', { class: 'an-wk' });
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      const iso = todayISO(day);
      if (iso > today) { add(col, h('i', { class: 'an-day off' })); continue; }
      const n = perDay.get(iso) || 0;
      add(col, h('i', { class: `an-day l${Math.min(4, n)}`, title: `${iso}: ${n} case${n === 1 ? '' : 's'}` }));
    }
    cols.push(col);
  }
  // weekdays
  const wd = [0, 0, 0, 0, 0, 0, 0];
  for (const c of cases) { const [y, m, d] = c.date.split('-').map(Number); wd[weekLead(new Date(y, m - 1, d), ws)]++; }
  const wdMax = Math.max(1, ...wd);
  // most used tags in the last 12 months (APMES and your own)
  const from = months[0].key + '-01';
  const tagN = new Map();
  for (const c of cases) if (c.date >= from) {
    for (const k of c.cats || []) tagN.set('c:' + k, (tagN.get('c:' + k) || 0) + 1);
    for (const k of c.tags || []) tagN.set(k, (tagN.get(k) || 0) + 1);
  }
  const top = [...tagN].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const name = k => (k.startsWith('c:') ? catShort(k.slice(2)) : tagName(k));
  return section('trends', 'Trends', `${last30} case${last30 === 1 ? '' : 's'} in the last 30 days · ${months[11].n} this month`,
    h('h3', {}, 'Cases per month'), bars,
    h('h3', {}, 'The last year'), h('div', { class: 'an-heat' }, cols),
    h('h3', {}, 'By day of the week'),
    h('div', { class: 'an-wd' }, weekdayNames(ws).map((d, i) => h('div', {}, h('span', {}, d), h('span', { class: 'meter' }, h('i', { class: 'ontrack', style: `width:${Math.round(wd[i] / wdMax * 100)}%` })), h('b', {}, String(wd[i]))))),
    h('h3', {}, 'Most used tags (12 months)'),
    top.length ? h('div', { class: 'an-wd' }, top.map(([k, n]) => h('div', {}, h('span', {}, casesLink(name(k), { tag: k, from })), h('span', { class: 'meter' }, h('i', { class: 'done', style: `width:${Math.round(n / top[0][1] * 100)}%` })), h('b', {}, String(n))))) : h('p', { class: 'empty' }, 'No cases yet.'),
    h('p', { class: 'hint help' }, 'Only you see these.'));
}


// Reflections, laid out like the logbook list: each portfolio heading against its minimum.
// The full list and editor are on the Reflections tab (#reflect).
function reflCard() {
  const all = S.reflections || [];
  const p = reflectionProgress(all);
  const met = p.headings.filter(x => x.met).length;
  const drafts = id => all.filter(r => r.headingId === id && r.status !== 'complete').length;
  const shown = pview.hideDone ? p.headings.filter(x => !x.met) : p.headings;
  const [rulesBtn, rulesText] = info(h('span', {}, `${p.totals.min} reflections across ${p.headings.length} headings, each at least its minimum. `),
    h('ul', { style: 'margin:4px 0 0;padding-left:18px' },
      h('li', {}, 'Each reflection is a different patient, under one heading only.'),
      h('li', {}, 'At most one Junior Residency (JR, R1–R3) reflection counts per heading, except Paediatrics, which allows two. Extra JR reflections stay saved but do not add progress.'),
      h('li', {}, 'Some headings require JR reflections or certain sub-types: tap ⓘ by a heading to see them. These required types remain yours to track.')));
  const rg = reflectionGlance(p.totals.counted, rYear());
  const cohort = cohortNow();
  const glance = h('div', { class: 'glance' }, meterBar(rg));
  return section('refl', 'Reflections', `${p.totals.counted} / ${p.totals.min} counted · ${met} of ${p.headings.length} headings met`, glance,
    cohort ? h('div', { class: 'glance an-year' }, h('h3', {}, 'You and your year'), strip('Reflections counted', rg.counted, cohort.reflections, rg.total)) : null,
    h('div', { class: 'bar', style: 'margin:0 0 4px' },
      h('span', { class: 'hint' }, 'The rules'), rulesBtn,
      h('span', { class: 'grow' }),
      h('a', { class: 'btn small primary', href: '#reflect' }, 'Open reflections')),
    rulesText,
    h('p', { class: 'hint', style: 'margin:0 0 6px' },
      `${p.totals.counted} / ${p.totals.min} counted · ${met} of ${p.headings.length} headings met`,
      p.totals.drafts ? ` · ${p.totals.drafts} draft${p.totals.drafts === 1 ? '' : 's'}` : ''),
    shown.length ? h('ul', { class: 'prog' }, shown.map(x => {
      const st = x.met ? 'done' : x.done ? 'ontrack' : 'none';
      const d = drafts(x.id);
      // Required types remain reminders; excess JR credit is excluded from the bar.
      const [ib, it] = needs(x);
      const extra = [d ? `${d} draft${d === 1 ? '' : 's'}` : '', ...x.issues].filter(Boolean);
      return h('li', {},
        h('i', { class: `dot ${st}`, title: x.met ? 'Done' : 'Not yet' }),
        h('span', { class: 'nm', title: x.name }, x.label || x.name, ib ? ' ' : '', ib),
        h('span', { class: 'ct' }, x.met ? `${x.counted} ✓` : `${x.counted} / ${x.min}`),
        h('span', { class: 'meter' }, h('i', { class: st, style: `width:${Math.min(100, Math.round(x.counted / Math.max(1, x.min) * 100))}%` })),
        extra.length ? h('span', { class: 'ms' }, extra.join(' · ')) : null,
        it);
    })) : h('p', { class: 'empty' }, 'All headings met ✓'));
}

// Reflection to-dos (Advanced): ☆ Interesting cases with no reflection yet, and drafts not touched for 30 days
function todoCard() {
  const { interesting, stale } = reflectionTodos(S.cases, S.reflections);
  if (!interesting.length && !stale.length) return null;
  const caseLine = c => [c.date ? fmtDate(c.date) : '', [c.initials, String(c.details || '').split('\n').join(' ')].filter(Boolean).join(' ').slice(0, 60)].filter(Boolean).join(' · ');
  const days = r => Math.floor((Date.now() - (r.updatedAt || r.createdAt || 0)) / 864e5);
  const n = interesting.length + stale.length;
  return section('todo', `Reflection to-dos (${n})`,
    [interesting.length ? `${interesting.length} interesting to write up` : '', stale.length ? `${stale.length} draft${stale.length === 1 ? '' : 's'} untouched 30+ days` : ''].filter(Boolean).join(' · '),
    interesting.length ? [h('h3', {}, ic('star'), 'Interesting cases to write up'),
      h('ul', { class: 'an-list an-todo' }, interesting.slice(0, 20).map(c => h('li', {}, h('span', { class: 'grow' }, caseLine(c)),
        h('button', { class: 'small primary', onclick: () => reflectOnCase(c) }, 'Write'))))] : null,
    stale.length ? [h('h3', {}, 'Drafts untouched for 30 days or more'),
      h('ul', { class: 'an-list an-todo' }, stale.slice(0, 20).map(r => h('li', {}, h('span', { class: 'grow' }, [r.initials, r.diagnosis || 'no diagnosis yet'].filter(Boolean).join(' · '), h('small', { class: 'muted' }, ` · ${days(r)} days`)),
        h('button', { class: 'small', onclick: () => openReflection(r) }, 'Finish'))))] : null);
}

// a heading's note (sub-types, JR, examples), behind its ⓘ; none for headings without one
function needs(x) {
  const hd = HEADING_BY_ID[x.id] || {};
  // the heading's note (categories.js: rules, examples, JR), as in the Reflections list
  const t = [hd.note || ''].filter(Boolean);
  return t.length ? info(t.join(' ')) : [null, null];
}

// your own tags under a category (Tag editor): "Interscalene 3 · Femoral 2"
function subcatLine(code) {
  const tags = subcatsOf(code);
  if (!tags.length) return null;
  const n = k => (S.cases || []).filter(c => (c.tags || []).includes(k)).length;
  return h('span', { class: 'ms sc-line' }, tags.map(e => `${e.n} ${n(e.k)}`).join(' · '));
}

function progList(items, fc = {}) {
  return h('ul', { class: 'prog' }, items.map(p => {
    const f = fc[p.code], off = p.status === 'ontrack' && f && f.offPace;
    const c = BY_CODE[p.code];
    const max = Math.max(1, ...p.milestones.map(m => m.n));
    const pct = Math.min(100, Math.round((p.count / max) * 100));
    return h('li', { class: c.parent ? 'sub' : '', title: c.full || c.name },
      h('i', { class: `dot ${p.status}`, title: STATUS_TEXT[p.status] }),
      h('span', { class: 'nm' }, casesLink(catName(p.code), { tag: 'c:' + p.code })),
      h('span', { class: 'ct' }, (p.status === 'late' || p.status === 'due') ? h('span', { class: `stw ${p.status}` }, STATUS_TEXT[p.status]) : off ? h('span', { class: 'stw due' }, 'Off pace') : null,
        p.status === 'none' ? String(p.count) : p.next ? `${p.count} / ${p.next.n}` : `${p.count} ✓`),
      p.milestones.length ? h('span', { class: 'meter' }, h('i', { class: p.status, style: `width:${pct}%` })) : null,
      p.milestones.length ? h('span', { class: 'ms' }, p.milestones.map(m => `${appYear(m.by)}: ${m.n}${m.met ? ' ✓' : ''}`).join(' · ')
        + (p.next ? ` — ${p.next.n - p.count} more by end of ${appYear(p.next.by)}` : '') + (f ? `, ${paceText(f)}` : '')) : null,
      subcatLine(p.code));
  }));
}


// ---------- Totals ----------

const tview = { summaries: null, loading: false, year: null, error: '' };
// "R3 / SMO" when the R3 group has SMOs in it; residents with no year known are "Year unknown"
const groupName = (y, all) => !y ? 'Year unknown' : y === 3 && all.some(s => s.smo) ? 'R3 / SMO' : yearName(y);
// gen: bumped on sign-out, so a load still running for the last person is dropped
resetters.push(() => { Object.assign(tview, { summaries: null, year: null, error: '', loading: false }); tview.gen = (tview.gen || 0) + 1; });
// the Analytics screen's own state starts fresh for the next person too
resetters.push(() => { pview.open.clear(); Object.assign(pview, { hideDone: false }); });
// reload the totals next time they're shown (an admin took a row off)
export const forgetTotals = () => { tview.summaries = null; };
// the programme's summaries for Case logs (ui-caselogs.js): { summaries, loading, error, year }, loading them once
export function programme() { if (!tview.summaries && !tview.loading) loadSummaries(); return tview; }
export const groupYearName = groupName;

export function renderTotals() {
  const card = h('section', { class: 'card' });
  if (!tview.summaries && !tview.loading) loadSummaries();
  if (tview.loading && !tview.summaries) { add(card, h('p', { class: 'empty' }, 'Loading totals…')); return card; }
  if (tview.error) add(card, h('p', { class: 'tip' }, tview.error));
  // your own column is live (like the Analytics comparison), not the copy loaded when the page opened
  const meRid = S.resident && S.resident.rid && S.casesSynced ? String(S.resident.rid) : null;
  const all = (tview.summaries || []).map(x => meRid && String(x.rid) === meRid ? (m => ({ ...x, ...m, smo: !!m.smo, rYear: m.smo ? 3 : m.rYear }))(summaryOf()) : x);
  if (!all.length) { add(card, h('p', { class: 'empty' }, 'No programme totals yet.')); return card; }

  // grouped by this year's residency year; SMOs count as R3, so they sit with the R3s
  const years = [...new Set(all.map(s => s.rYear || 0))].sort((a, b) => (a || 9) - (b || 9));
  const mine = rYear();
  if (tview.year == null || !years.includes(tview.year)) tview.year = years.includes(mine) ? mine : years[0];
  const people = all.filter(s => (s.rYear || 0) === tview.year).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  // Compact (on by default, this device): initials across the top (a tap names the person), short category names, a
  // key under the table; Show targets (on by default) at the bottom. The Excel downloads keep the full names.
  const compact = display().totalsCompact !== false, targets = display().totalsTargets !== false;
  const nameBar = h('p', { class: 'hint tname', 'aria-live': 'polite', style: 'margin:6px 0 0;min-height:1.2em' });
  const table = totalsTable(people, { compact, targets, onName: (p, short) => { nameBar.textContent = `${short} = ${p.name} · ${p.smo ? 'SMO' : p.rYear ? yearName(p.rYear) : '?'}`; } });
  const flip = (k, on) => () => { setDisplay({ [k]: on ? null : false }); hooks.render(); };

  add(card, 
    h('div', { class: 'bar' },
      h('h2', { style: 'margin:0' }, 'Programme totals'),
      h('select', { 'aria-label': 'Residency year', onchange: e => { tview.year = Number(e.target.value); hooks.render(); } },
        years.map(y => h('option', { value: String(y), selected: y === tview.year }, groupName(y, all)))),
      h('button', { type: 'button', class: 'small', 'aria-pressed': String(compact), onclick: flip('totalsCompact', !compact) }, 'Compact'),
      h('span', { class: 'grow' }),
      h('button', { class: 'small', onclick: () => { tview.summaries = null; hooks.render(); } }, 'Refresh'),
      h('button', { class: 'small', onclick: () => downloadTotals(table.data) }, 'Download Excel'),
      h('button', { class: 'small', onclick: () => downloadAllYears(all) }, 'Download all years (zip)')),
    legend(),
    // scrolls both ways inside the card (focusable and named so the keyboard can reach it), so the names row and the
    // category column stay put (owner, 15 Oct 2026)
    compact ? nameBar : null,
    h('div', { class: 'scroll tscroll', style: 'margin-top:8px', tabindex: '0', role: 'region', 'aria-label': 'Totals table' }, table.el),
    table.key ? h('p', { class: 'hint tkey', style: 'margin:6px 0 0' }, table.key.map(([sh, n]) => `${sh} = ${n}`).join(' · ')) : null,
    // how the counts add up, below the table (owner, 15 Oct 2026); and the target lines
    h('div', { class: 'bar', style: 'margin-top:10px;align-items:center' }, countSwitch(),
      h('label', { class: 'check', style: 'margin:0' }, h('input', { type: 'checkbox', checked: targets, onchange: flip('totalsTargets', !targets) }), 'Show targets')),
    h('p', { class: 'hint help' }, countMode() === 'min'
      ? 'Towards minimums: each category counts up to its last target, so extra cases past it don’t add (categories without a target show –).'
      : 'All tags: every case with that category, all years added up. A case with 3 tags adds 3 to Total tags.'));
  return card;
}

async function loadSummaries() {
  tview.loading = true; tview.error = '';
  const gen = tview.gen;
  // counts are written by each resident's device: anything that isn't a whole number counts as 0
  const clean = c => Object.fromEntries(Object.entries(c && typeof c === 'object' ? c : {}).map(([k, v]) => [k, Number.isFinite(v) && v > 0 ? Math.floor(v) : 0]));
  const whole = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  // the academic year (from 1 July) a time falls in; a summary last written in an earlier one moves
  // its year on, so a resident who hasn't opened the app since 30 June isn't coloured as last year
  const ay = t => { const d = new Date(t); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; };
  const nowAy = ay(Date.now());
  const yearOf = x => {
    if (x.smo) return 3;   // an SMO stays put, counted as R3
    const base = Number(x.rYear) || (x.intake && rYearDefault(x.intake)) || null;
    if (!base) return null;
    return Math.min(5, base + (x.updatedAt ? Math.max(0, nowAy - ay(x.updatedAt)) : 0));
  };
  try {
    const [list, hidden] = await Promise.all([cloud.listSummaries(), cloud.loadTotalsHidden()]);
    if (gen !== tview.gen) return;
    const off = new Set(hidden);   // attrited residents (Admin)
    tview.summaries = list.filter(x => !off.has(String(x.rid))).map(x => {
      const ridYear = Number(String(x.rid || '').slice(0, 4));
      const intake = Number(x.intake) || (ridYear > 2000 && ridYear < 2100 ? ridYear : null);   // no intake: the rid starts with it
      return { ...x, intake, rYear: yearOf({ ...x, intake }), counts: clean(x.counts), total: whole(x.total), reflectionsTotal: whole(x.reflectionsTotal) };
    });
  }
  catch (err) { if (gen !== tview.gen) return; tview.summaries = []; tview.error = 'Could not load totals: ' + err.message; }
  tview.loading = false;
  if (['totals', 'admintotals', 'caselogs', 'caselog', 'progress'].includes(S.tab)) hooks.render();
}

// Totals' counts (this device): every tag logged, all years (default), or only what counts towards the minimums
export const countMode = () => (display().totalsCount === 'min' ? 'min' : 'all');
export function countSwitch() {
  const set = v => () => { setDisplay({ totalsCount: v === 'min' ? 'min' : null }); hooks.render(); };
  return h('span', { class: 'seg', role: 'group', 'aria-label': 'Count' },
    [['all', 'All tags'], ['min', 'Towards minimums']].map(([v, t]) => h('button', { type: 'button', class: 'small', 'aria-pressed': String(countMode() === v), onclick: set(v) }, t)));
}

// a Category cell: at most a third of the width; long names wrap, and a word too wide for it scrolls sideways inside
// the cell (owner, 15 Oct 2026). No tooltips (tap and hold clashed with selecting text).
const catCell = (...kids) => h('td', { class: 'cat' }, h('div', { class: 'cat-in' }, ...kids));
export function totalsTable(people, { compact = false, targets = true, onName = null } = {}) {
  const shorts = compact ? shortNames(people.map(p => p.name)) : null;
  const prog = people.map(p => Object.fromEntries(progress(p.counts || {}, p.rYear || 1).map(x => [x.code, x])));
  const codes = CATEGORIES.filter(c => !c.retired || people.some(p => (p.counts || {})[c.code])).map(c => c.code);
  const meId = S.resident && S.resident.rid;
  const data = { columns: people.map(p => `${p.name} (${p.smo ? 'SMO' : 'R' + (p.rYear || '?')})`), rows: [] };   // the download keeps R4/R5
  const tbody = h('tbody');
  const min = countMode() === 'min';
  for (const code of codes) {
    const all = people.map(p => (p.counts || {})[code] || 0);
    // towards the minimums: up to the tag's last target; a tag without one counts towards none (–)
    const vals = min ? all.map(v => (finalTarget(code) == null ? null : towardsMinimum(code, v))) : all;
    const sts = prog.map(pr => (pr[code] ? pr[code].status : 'none'));
    // the targets under the name: "10 by R3 | 15 by R5"
    const t = BY_CODE[code].targets || {};
    const tgt = R_YEARS.filter(y => t[y] != null).map(y => `${t[y]} by ${appYear(y)}`).join(' | ');
    const tgtR = R_YEARS.filter(y => t[y] != null).map(y => `${t[y]} by ${y}`).join(' | ');   // the download keeps R4/R5
    data.rows.push({ label: catName(code) + (tgtR ? ` [${tgtR}]` : ''), values: vals, statuses: sts });
    add(tbody, h('tr', {}, catCell(compact ? catShort(code) : catName(code), tgt && targets ? h('small', { class: 'tgt' }, tgt) : null),
      vals.map((v, i) => h('td', { class: `n ${sts[i]}` }, v == null ? '–' : String(v)))));   // no tooltips: tap and hold clashed with selecting text (owner)
  }
  const totals = people.map(p => p.total || 0);
  const tags = people.map(p => tagTotal(p.counts, min ? 'min' : 'all'));
  const refl = people.map(p => p.reflectionsTotal || 0);
  const tagLabel = min ? `Total towards the minimums (of ${MINIMUM_TOTAL})` : 'Total tags (all cases, every year)';
  data.rows.push({ label: tagLabel, values: tags }, { label: 'Total cases', values: totals }, { label: 'Reflections (towards the 96 needed)', values: refl });
  add(tbody, 
    h('tr', { class: 'total' }, catCell(
      min ? 'Towards minimums' : 'Total tags', h('small', { class: 'tgt' }, min ? `of the ${MINIMUM_TOTAL} needed` : 'every tag on every case')), tags.map(v => h('td', { class: 'n' }, String(v)))),
    h('tr', { class: 'total' }, catCell('Total cases'), totals.map(v => h('td', { class: 'n' }, String(v)))),
    h('tr', {}, catCell('Reflections', h('small', { class: 'tgt' }, 'towards the 96 needed')), refl.map(v => h('td', { class: 'n' }, String(v)))));
  const thead = h('thead', {}, h('tr', {}, h('th', {}, 'Category'),
    people.map((p, i) => compact
      ? h('th', { class: `ini-h ${p.rid === meId ? 'me' : ''}` }, h('button', { type: 'button', class: 'linkish ini-btn', 'aria-label': p.name, onclick: () => onName?.(p, shorts[i]) }, shorts[i]))
      : h('th', { class: `rot ${p.rid === meId ? 'me' : ''}` }, `${p.name} · ${p.smo ? 'SMO' : p.rYear ? yearName(p.rYear) : '?'}`))));
  data.title = `${tview.year ? (tview.year === 3 && people.some(p => p.smo) ? 'R3 / SMO' : 'R' + tview.year) : 'Year unknown'} totals${min ? ' (towards the minimums)' : ''} — ${todayISO()}`;
  return { el: h('table', { class: `totals${compact ? ' compact' : ''}` }, thead, tbody), data, key: compact ? people.map((p, i) => [shorts[i], p.name]) : null };
}

// every residency year's table, one Excel file each, in one zip (the count mode as shown)
async function downloadAllYears(all) {
  const was = tview.year;
  try {
    const [{ needZip }] = await Promise.all([import('./portfolio.js'), needExcel()]);
    const zip = new (await needZip())();
    for (const y of [...new Set(all.map(s => s.rYear || 0))].sort((a, b) => (a || 9) - (b || 9))) {
      tview.year = y;   // totalsTable names the year from it
      const people = all.filter(s => (s.rYear || 0) === y).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      zip.file(`totals-${y ? groupName(y, all).replace(/[^A-Za-z0-9]+/g, '-') : 'year-unknown'}-${todayISO()}.xlsx`, await exportTotals(totalsTable(people).data));
    }
    download(`totals-all-years-${todayISO()}.zip`, await zip.generateAsync({ type: 'blob' }));
  } catch (err) { toast('Could not export: ' + err.message); }
  finally { tview.year = was; }
}
export async function downloadTotals(data, name = `totals-${tview.year ? 'R' + tview.year : 'year-unknown'}-${todayISO()}.xlsx`) {
  try {
    await needExcel();
    download(name, await exportTotals(data));
  } catch (err) { toast('Could not export: ' + err.message); }
}

