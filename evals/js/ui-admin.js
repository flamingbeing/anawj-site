// Admin / PD screens: Overview (#overview: counts, overdue by assessor, cohort grid, flags, CSV) and
// People (#people, #people/faculty, #people/residents: applications, faculty list, resident list).
// Never deletes anyone: residents and faculty change status instead.

import { S, h, fill, cloud, toast, modal, confirmBox, download, go, avatar, icon, empty, segment,
  fmtDate, fmtAgo, toMs, toolLabel, statusChip, hooks } from './ui-core.js';
import { progress, statusOf, residentYear, todayISO, OVERDUE_HOURS } from './engine.js';
import { EPAS, GROUPS, itemById } from './catalogue.js';
import { FORMS, questionsOf } from './forms.js';

const CSS = `
.e-admin .e-table-wrap { overflow-x: auto; background: #fff; border: 1px solid var(--n-line); -webkit-overflow-scrolling: touch; }
.e-table { width: 100%; border-collapse: collapse; font-size: var(--n-text-sm); }
.e-table th { position: sticky; top: 0; background: var(--n-navy); color: #fff; font-weight: var(--n-semibold); text-align: left; padding: 8px; white-space: nowrap; }
.e-table td { padding: 6px 8px; border-top: 1px solid var(--n-line); vertical-align: middle; }
.e-table th:first-child, .e-table td:first-child { position: sticky; left: 0; z-index: 1; }
.e-table td:first-child { background: #fff; }
.e-table th:first-child { z-index: 2; }
.e-table td.e-num { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
.e-cg-name { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0; border: 0; background: none; color: var(--n-navy); font-weight: var(--n-semibold); text-align: left; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.e-cg-cell { display: inline-block; min-width: 44px; padding: 2px 6px; border-radius: var(--n-radius-sm); font-weight: var(--n-semibold); }
.e-cg--done { background: var(--e-ok-bg); color: var(--e-ok); }
.e-cg--short { background: var(--n-alert-bg); color: var(--n-alert-ink); }
.e-cg--part { background: var(--e-warn-bg); color: var(--e-warn); }
.e-cg--none { color: var(--e-muted-on-grey); }
.e-stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
@media (min-width: 720px) { .e-stats { grid-template-columns: repeat(4, 1fr); } }
.e-stat { background: #fff; border: 1px solid var(--n-line); border-top: 4px solid var(--n-navy); border-radius: 14px; padding: 10px 12px; }
.e-stat b { display: block; font-size: var(--n-text-2xl); font-weight: var(--n-light); color: var(--n-navy); line-height: 1.2; }
.e-stat span { font-size: var(--n-text-sm); color: var(--n-muted); }
.e-stat--alert { border-top-color: var(--n-red); }
.e-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 8px; }
.e-toolbar .e-input { flex: 1 1 180px; width: auto; }
.e-toolbar label { display: inline-flex; align-items: center; gap: 6px; font-size: var(--n-text-sm); min-height: 44px; }
.e-pg { display: grid; gap: 4px 12px; grid-template-columns: 1fr 1fr; }
.e-pg > .e-full { grid-column: 1 / -1; }
.e-pg .e-label { margin-top: 8px; }
.e-paste-res { margin: 8px 0 0; padding: 0; list-style: none; font-size: var(--n-text-sm); max-height: 40vh; overflow: auto; }
.e-paste-res li { padding: 4px 0; border-top: 1px solid var(--n-line); overflow-wrap: anywhere; }
.e-paste-res .is-bad { color: var(--n-alert-ink); }
.e-paste-res .is-dup { color: var(--e-warn); }
.e-row--static { cursor: default; }
.e-appl { display: flex; flex-direction: column; gap: 4px; padding: 12px 16px; border-top: 1px solid var(--n-line); background: #fff; }
.e-appl:first-child { border-top: 0; }
.e-appl .e-actions { margin-top: 4px; }
.e-admin .e-row__meta { white-space: normal; overflow-wrap: break-word; }
.e-admin .e-row .n-btn { flex: none; }
.e-flag-why { color: var(--n-alert-ink); font-weight: var(--n-semibold); }
`;
function adminCSS() {
  if (typeof document === 'undefined' || document.getElementById('e-admin-css')) return;
  document.head.append(h('style', { id: 'e-admin-css' }, CSS));
}
adminCSS();

// ---------- shared ----------

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const cleanEmail = e => String(e || '').trim().replace(/^<|>$/g, '').toLowerCase();
export const validEmail = e => EMAIL_RE.test(cleanEmail(e));
const RES_STATUSES = ['ACTIVE', 'ON LEAVE', 'GRADUATED', 'ATTRITED'];
const SUPERVISION_KEY = { dops: 'q16', minicex: 'q18', ebd: 'q9' };
const COMMENTS_KEY = { dops: 'q17', minicex: 'q19', ebd: 'q10' };
const OVERALL_KEY = { dops: 'q14', minicex: 'q12' };   // the 9-point "overall" question (EBD has none)
const DECLINE_LABEL = { 'not-observed': 'Did not observe', 'not-co-managed': 'Did not co-manage', conflict: 'Conflict of interest', 'wrong-item': 'Wrong item or form', other: 'Other' };
const sentAt = ev => toMs(ev.requestedAt) || toMs(ev.createdAt) || 0;
const nameOf = ev => ev.residentName || ev.residentEmail || ev.rid || '';
const err = e => (e && e.message) || String(e);

// residents are cached for the session; People refreshes the cache
let residentsCache = null;
async function residents(force = false) {
  if (!residentsCache || force) residentsCache = await cloud.listResidents();
  return residentsCache;
}

function field(label, input, cls = '') {
  const id = input.id || ('f-' + Math.random().toString(36).slice(2, 8));
  input.id = id;
  return h('div', { class: cls }, h('label', { class: 'e-label', for: id }, label), input);
}
const input = (attrs = {}) => h('input', { class: 'e-input', autocomplete: 'off', ...attrs });
const select = (opts, cur) => h('select', { class: 'e-select' }, opts.map(o => {
  const [v, l] = Array.isArray(o) ? o : [o, o];
  const op = h('option', { value: v }, l);
  if (String(v) === String(cur ?? '')) op.selected = true;
  return op;
}));

// ---------- Overview ----------

export async function renderOverview() {
  const root = h('div', { class: 'e-stack e-wide e-admin' });
  if (!S.loaded.all) { root.append(h('p', { class: 'e-loading' }, 'Loading…')); return root; }
  let res = [];
  try { res = await residents(); } catch (e) { root.append(h('p', { class: 'e-alert' }, 'Could not load residents: ' + err(e))); }
  const now = Date.now();
  const all = S.all || [];
  const thisMonth = todayISO().slice(0, 7);
  const monthOf = ms => (ms ? todayISO('Asia/Singapore', new Date(ms)).slice(0, 7) : '');
  const open = all.filter(ev => ev.status === 'requested');
  const overdue = open.filter(ev => statusOf(ev, now).key === 'overdue');
  const submittedMonth = all.filter(ev => ev.status === 'submitted' && monthOf(toMs(ev.submittedAt)) === thisMonth);
  const declined = all.filter(ev => ev.status === 'declined');

  const stat = (n, label, alert) => h('div', { class: `e-stat ${alert && n ? 'e-stat--alert' : ''}` }, h('b', {}, String(n)), h('span', {}, label));
  root.append(h('div', { class: 'e-stats' },
    stat(open.length, 'Waiting for assessor'),
    stat(overdue.length, `Overdue (>${OVERDUE_HOURS} h)`, true),
    stat(submittedMonth.length, 'Submitted this month'),
    stat(declined.length, 'Declined', true)));

  root.append(overdueByAssessor(overdue, now));
  root.append(cohortGrid(res, all));
  root.append(flagsCard(all, res));
  root.append(h('section', { class: 'e-card' },
    h('h2', { class: 'e-h3' }, 'Export'),
    h('p', { class: 'e-small' }, `All ${all.length} evaluations as a CSV file (opens in Excel). Private notes are not included.`),
    h('div', { class: 'e-actions e-actions--start' },
      h('button', { class: 'n-btn', type: 'button', onclick: () => exportCSV(all, res) }, 'Download CSV'))));
  return root;
}

function overdueByAssessor(overdue, now) {
  const by = new Map();
  for (const ev of overdue) {
    const k = ev.assessorEmail || '?';
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(ev);
  }
  const groups = [...by.entries()].map(([email, evs]) => ({ email, evs: evs.sort((a, b) => sentAt(a) - sentAt(b)) }))
    .sort((a, b) => b.evs.length - a.evs.length || sentAt(a.evs[0]) - sentAt(b.evs[0]));
  const facName = email => (S.faculty.find(f => f.email === email) || {}).name || groups.find(g => g.email === email)?.evs[0]?.assessorName || email;
  const card = h('section', { class: 'e-card e-card--flush' }, h('h2', { class: 'e-section' }, 'Overdue by assessor'));
  if (!groups.length) { card.append(h('p', { class: 'e-small', style: 'padding:12px 16px;margin:0' }, 'Nothing overdue.')); return card; }
  card.append(h('div', { class: 'e-list' }, groups.map(g => h('div', { class: 'e-row e-row--static' },
    avatar(facName(g.email)),
    h('span', { class: 'e-row__body' },
      h('span', { class: 'e-row__title' }, facName(g.email)),
      h('span', { class: 'e-row__meta' }, `${g.evs.length} waiting · oldest ${fmtAgo(sentAt(g.evs[0]), now)}`),
      h('span', { class: 'e-row__meta' }, g.evs.map(nameOf).filter((v, i, a) => a.indexOf(v) === i).join(', '))),
    h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-small', type: 'button', onclick: () => copyReminder(facName(g.email), g.evs, now) }, 'Copy reminder')))));
  return card;
}

export function reminderText(name, evs, now = Date.now(), url = location.origin + location.pathname + '#pending') {
  const lines = evs.map(ev => `- ${toolLabel(ev.tool)}: ${ev.itemText || ev.itemId} for ${nameOf(ev)} (sent ${fmtAgo(sentAt(ev), now)})`);
  return `Dear ${name},\n\nYou have ${evs.length} evaluation${evs.length === 1 ? '' : 's'} waiting in APMES Evals:\n${lines.join('\n')}\n\n`
    + `Please complete them, or tap “I can’t assess this”, here: ${url}\n\nThank you.`;
}
async function copyReminder(name, evs, now) {
  const text = reminderText(name, evs, now);
  try { await navigator.clipboard.writeText(text); toast('Reminder copied'); }
  catch {
    // no clipboard permission: show it to copy by hand
    const ta = h('textarea', { class: 'e-textarea', rows: 8, readonly: true }, text);
    const m = modal('Reminder', [ta, h('div', { class: 'e-actions' }, h('button', { class: 'n-btn', onclick: () => m.close() }, 'Done'))]);
    ta.select();
  }
}

// Per resident and EPA: submitted toward groups due by now / required by now (groups due by their year).
export function cohortRow(evals, rYear) {
  const yr = Number(rYear) || 1;
  const cells = {};
  for (const p of progress(evals, yr)) {
    const e = p.group.epa;
    const c = cells[e] || (cells[e] = { done: 0, req: 0, all: 0 });
    c.all += Math.min(p.done, p.min);
    if (p.group.byYear != null && p.group.byYear <= yr) { c.req += p.min; c.done += Math.min(p.done, p.min); }
  }
  return cells;
}
const evalsOf = (r, all) => all.filter(ev => (ev.rid && ev.rid === r.rid) || (r.email && ev.residentEmail === r.email));

const GRID_EPAS = EPAS.filter(e => GROUPS.some(g => g.epa === e.epa));
let showLeavers = false;
function cohortGrid(res, all) {
  const card = h('section', { class: 'e-card e-card--flush' }, h('h2', { class: 'e-section' }, 'Cohort'));
  const body = h('div', { style: 'padding:12px 16px' });
  card.append(body);
  const paint = () => {
    const list = res.filter(r => showLeavers || r.status === 'ACTIVE' || r.status === 'ON LEAVE')
      .map(r => ({ r, yr: residentYear(r) || 1 })).sort((a, b) => a.yr - b.yr || String(a.r.name).localeCompare(String(b.r.name)));
    const hidden = res.length - res.filter(r => r.status === 'ACTIVE' || r.status === 'ON LEAVE').length;
    fill(body,
      h('p', { class: 'e-small', style: 'margin:0 0 8px' }, 'Done / required by now for each EPA (submitted forms, requirements due by the resident’s year). Tap a name for their evaluations.'),
      hidden ? h('div', { class: 'e-toolbar' }, h('label', {}, h('input', { type: 'checkbox', checked: showLeavers, onchange: e => { showLeavers = e.target.checked; paint(); } }), `Show graduated and attrited (${hidden})`)) : null,
      !list.length ? empty('No residents', 'Add residents in People.', h('a', { class: 'n-btn', href: '#people/residents' }, 'People')) :
        h('div', { class: 'e-table-wrap' }, h('table', { class: 'e-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Resident'), h('th', { scope: 'col' }, 'Year'), GRID_EPAS.map(e => h('th', { scope: 'col', title: e.title }, 'EPA ' + e.epa)))),
          h('tbody', {}, list.map(({ r, yr }) => {
            const evs = evalsOf(r, all);
            const cells = cohortRow(evs, yr);
            return h('tr', {},
              h('td', {}, h('button', { class: 'e-cg-name', type: 'button', onclick: () => residentSheet(r, evs) }, r.name || r.email,
                r.status !== 'ACTIVE' ? h('span', { class: 'e-tag' }, r.status) : null)),
              h('td', { class: 'e-num' }, 'R' + yr),
              GRID_EPAS.map(e => {
                const c = cells[e.epa] || { done: 0, req: 0, all: 0 };
                if (!c.req) return h('td', { class: 'e-num' }, h('span', { class: 'e-cg-cell e-cg--none', title: 'Nothing due yet' }, c.all ? `${c.all}` : '–'));
                const cls = c.done >= c.req ? 'e-cg--done' : c.done ? 'e-cg--part' : 'e-cg--short';
                return h('td', { class: 'e-num' }, h('span', { class: `e-cg-cell ${cls}` }, `${c.done}/${c.req}`));
              }));
          })))));
  };
  paint();
  return card;
}

function residentSheet(r, evs) {
  const sorted = [...evs].sort((a, b) => (toMs(b.submittedAt) || sentAt(b)) - (toMs(a.submittedAt) || sentAt(a)));
  const m = modal(r.name || r.email, [
    h('p', { class: 'e-small' }, `${r.rid} · ${r.email} · R${residentYear(r) || '?'} · ${r.status}`),
    sorted.length ? h('div', { class: 'e-list' }, sorted.map(ev => h('a', { class: 'e-row', href: '#r/' + encodeURIComponent(ev.id), onclick: () => m.close() },
      h('span', { class: 'e-row__body' },
        h('span', { class: 'e-row__title', style: 'white-space:normal' }, ev.itemText || ev.itemId),
        h('span', { class: 'e-row__meta' }, h('span', { class: 'e-tag e-tag--tool' }, toolLabel(ev.tool)), ` EPA ${ev.epa || '?'} · ${ev.assessorName || ev.assessorEmail} · ${fmtDate(ev.submittedAt || ev.request?.date || ev.date || sentAt(ev))}`)),
      statusChip(ev), icon('chevron', 'e-row__chev'))))
      : h('p', {}, 'No evaluations yet.'),
    h('div', { class: 'e-actions' }, h('button', { class: 'n-btn', onclick: () => m.close() }, 'Close')),
  ]);
}

// Flags for review: low overall, not receptive/reflective, declined (conflict of interest called out).
export function flagsOf(ev, residentEmails = new Set()) {
  const out = [];
  const a = ev.assessment || {};
  const lvl = ev.level ?? itemById(ev.itemId)?.level ?? null;
  if (ev.status === 'submitted') {
    const ok = OVERALL_KEY[ev.formId];
    const v = ok ? Number(a[ok]) : NaN;
    if (ok && a[ok] !== 'NA' && v < 5 && lvl !== 4) out.push(`Overall ${v}/9${lvl === 3 ? ' on a level 3 item' : ''}`);
    const f = FORMS[ev.formId];
    if (f) for (const q of questionsOf(f)) {
      if ((q.scaleKey === 'receptive' || q.scaleKey === 'reflective') && a[q.key] === 'No') out.push(q.scaleKey === 'receptive' ? 'Not receptive to feedback' : 'No reflective learning');
    }
  }
  if (ev.status === 'declined') {
    const c = ev.declineReason?.code;
    out.push(c === 'conflict' ? 'Declined: conflict of interest' : `Declined: ${DECLINE_LABEL[c] || 'reason not given'}${ev.declineReason?.text ? ' (' + ev.declineReason.text + ')' : ''}`);
  }
  if (ev.assessorEmail && residentEmails.has(ev.assessorEmail)) out.push('Assessor is on the resident list');
  return out;
}

function flagsCard(all, res) {
  const remails = new Set(res.filter(r => r.status === 'ACTIVE').map(r => r.email));
  const flagged = all.map(ev => ({ ev, why: flagsOf(ev, remails) })).filter(x => x.why.length)
    .sort((a, b) => (toMs(b.ev.submittedAt) || toMs(b.ev.declinedAt) || sentAt(b.ev)) - (toMs(a.ev.submittedAt) || toMs(a.ev.declinedAt) || sentAt(a.ev)));
  const card = h('section', { class: 'e-card e-card--flush' }, h('h2', { class: 'e-section' }, `Flags (${flagged.length})`));
  if (!flagged.length) { card.append(h('p', { class: 'e-small', style: 'padding:12px 16px;margin:0' }, 'No flags.')); return card; }
  card.append(h('div', { class: 'e-list' }, flagged.slice(0, 100).map(({ ev, why }) => h('a', { class: 'e-row', href: '#r/' + encodeURIComponent(ev.id) },
    avatar(nameOf(ev)),
    h('span', { class: 'e-row__body' },
      h('span', { class: 'e-row__title' }, nameOf(ev)),
      h('span', { class: 'e-row__meta e-flag-why' }, why.join(' · ')),
      h('span', { class: 'e-row__meta' }, `${toolLabel(ev.tool)} · ${ev.itemText || ev.itemId} · ${ev.assessorName || ev.assessorEmail}`)),
    statusChip(ev), icon('chevron', 'e-row__chev')))));
  return card;
}

// ---------- CSV ----------

const Q_MAX = Math.max(...Object.values(FORMS).map(f => questionsOf(f).length));
export const CSV_COLUMNS = ['id', 'rid', 'residentName', 'residentEmail', 'itemId', 'itemText', 'tool', 'formId', 'epa', 'level', 'date',
  'assessorEmail', 'assessorName', ...Array.from({ length: Q_MAX }, (_, i) => 'q' + (i + 1)), 'supervision', 'comments', 'status',
  'declineReason', 'requestedTs', 'submittedTs', 'declinedTs', 'seenTs', 'mirroredToMedHub'];

const iso = v => { const ms = toMs(v); return ms ? new Date(ms).toISOString() : ''; };
function cell(v) {
  if (v == null) return '';
  let s = Array.isArray(v) ? v.join('; ') : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;   // no spreadsheet formulas
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCSV(evals, res = []) {
  const ridByEmail = new Map(res.map(r => [r.email, r.rid]));
  const rows = [...evals].sort((a, b) => sentAt(a) - sentAt(b)).map(ev => {
    const a = ev.assessment || {};
    const d = ev.declineReason;
    const rec = {
      id: ev.id, rid: ev.rid || ridByEmail.get(ev.residentEmail) || '', residentName: ev.residentName, residentEmail: ev.residentEmail,
      itemId: ev.itemId, itemText: ev.itemText || itemById(ev.itemId)?.text, tool: toolLabel(ev.tool), formId: ev.formId, epa: ev.epa,
      level: ev.level ?? itemById(ev.itemId)?.level ?? '', date: ev.request?.date || ev.date, assessorEmail: ev.assessorEmail, assessorName: ev.assessorName,
      supervision: a[SUPERVISION_KEY[ev.formId]], comments: a[COMMENTS_KEY[ev.formId]], status: ev.status,
      declineReason: d ? [DECLINE_LABEL[d.code] || d.code, d.text].filter(Boolean).join(': ') : '',
      requestedTs: iso(ev.requestedAt || ev.createdAt), submittedTs: iso(ev.submittedAt), declinedTs: iso(ev.declinedAt), seenTs: iso(ev.seenAt),
      mirroredToMedHub: ev.mirroredToMedHub ? 'yes' : '',
    };
    for (let i = 1; i <= Q_MAX; i++) rec['q' + i] = a['q' + i];
    return CSV_COLUMNS.map(c => cell(rec[c])).join(',');
  });
  return '﻿' + [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
function exportCSV(all, res) {
  download(`apmes-evaluations-${todayISO()}.csv`, new Blob([toCSV(all, res)], { type: 'text/csv;charset=utf-8' }));
  toast(`Exported ${all.length} evaluations`);
}

// ---------- People ----------

export async function renderPeople(sub) {
  const tab = ['faculty', 'residents'].includes(sub) ? sub : 'applications';
  const root = h('div', { class: 'e-admin e-wide' });
  let apps = [], fac = [], res = [];
  try {
    [apps, fac, res] = await Promise.all([cloud.listApplications(), cloud.listFaculty(), residents(true)]);
  } catch (e) {
    root.append(h('p', { class: 'e-alert' }, 'Could not load the people lists: ' + err(e)), h('button', { class: 'n-btn', onclick: () => hooks.render() }, 'Try again'));
    return root;
  }
  S.faculty = fac;
  const pending = apps.filter(a => a.status === 'pending');
  root.append(segment([
    { id: 'applications', label: 'Applications', count: pending.length },
    { id: 'faculty', label: `Faculty` },
    { id: 'residents', label: `Residents` },
  ], tab, id => go(id === 'applications' ? 'people' : 'people/' + id)));
  const ctx = { apps, fac, res, reload: () => hooks.render() };
  root.append(tab === 'faculty' ? facultyPane(ctx) : tab === 'residents' ? residentsPane(ctx) : applicationsPane(ctx));
  return root;
}

// next free rid: same prefix and padding as the most common existing pattern, number + 1
export function nextRid(res) {
  const pats = {};
  for (const r of res) {
    const m = /^(.*?)(\d+)$/.exec(String(r.rid || ''));
    if (!m) continue;
    const k = m[1] + '|' + m[2].length;
    const p = pats[k] || (pats[k] = { prefix: m[1], width: m[2].length, max: 0, n: 0 });
    p.n++; p.max = Math.max(p.max, Number(m[2]));
  }
  const best = Object.values(pats).sort((a, b) => b.n - a.n)[0];
  if (!best) return 'R001';
  const taken = new Set(res.map(r => String(r.rid)));
  let n = best.max + 1, rid;
  do { rid = best.prefix + String(n++).padStart(best.width, '0'); } while (taken.has(rid));
  return rid;
}

function applicationsPane({ apps, fac, res, reload }) {
  const wrap = h('div', { class: 'e-stack' });
  if (!apps.length) { wrap.append(empty('No applications', 'People who sign in and aren’t on a list can apply here as faculty or a resident.')); return wrap; }
  const pending = apps.filter(a => a.status === 'pending');
  const done = apps.filter(a => a.status !== 'pending');
  const facEmails = new Set(fac.map(f => f.email));
  const resEmails = new Set(res.map(r => r.email));
  const one = a => h('div', { class: 'e-appl' },
    h('div', { style: 'display:flex;gap:12px;align-items:center' }, avatar(a.name || a.email),
      h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'e-row__title' }, a.name || '(no name)', ' ', h('span', { class: 'e-tag' }, a.role === 'faculty' ? 'Faculty' : 'Resident')),
        h('div', { class: 'e-small', style: 'overflow-wrap:anywhere' }, a.email, ' · ', fmtAgo(a.createdAt))),
      a.status !== 'pending' ? h('span', { class: `e-chip ${a.status === 'approved' ? 'e-chip--submitted' : 'e-chip--declined'}` }, a.status === 'approved' ? 'Approved' : 'Rejected') : null),
    a.note ? h('p', { class: 'e-small', style: 'margin:0' }, '“', a.note, '”') : null,
    (a.role === 'faculty' ? facEmails : resEmails).has(a.email) ? h('p', { class: 'e-small', style: 'margin:0;color:var(--e-warn)' }, `Already on the ${a.role === 'faculty' ? 'faculty' : 'resident'} list.`) : null,
    a.status === 'pending' ? h('div', { class: 'e-actions e-actions--start' },
      h('button', { class: 'n-btn e-go e-btn-small', type: 'button', onclick: () => approve(a, res, reload) }, 'Approve'),
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-small', type: 'button', onclick: () => reject(a, reload) }, 'Reject')) : null);
  wrap.append(h('p', { class: 'e-listhead' }, h('span', {}, `Waiting (${pending.length})`)),
    pending.length ? h('div', { class: 'e-card e-card--flush' }, pending.map(one)) : h('p', { class: 'e-small' }, 'Nothing waiting.'));
  if (done.length) wrap.append(h('p', { class: 'e-listhead' }, h('span', {}, 'Decided')), h('div', { class: 'e-card e-card--flush' }, done.slice(0, 50).map(one)));
  return wrap;
}

async function approve(a, res, reload) {
  if (a.role === 'faculty') {
    if (!await confirmBox('Approve as faculty?', `${a.name} (${a.email}) will be added to the faculty list and can assess residents.`, 'Approve')) return;
    try { await cloud.decideApplication(a.uid, { approve: true }); toast(`${a.name} added to faculty`); reload(); }
    catch (e) { toast('Could not approve: ' + err(e)); }
    return;
  }
  const old = res.find(r => r.email === a.email);
  const year = Number(todayISO().slice(0, 4)), month = Number(todayISO().slice(5, 7));
  const academic = month >= 7 ? year : year - 1;
  const rid = input({ value: old?.rid || nextRid(res), readonly: !!old || null, required: true });
  const intake = input({ type: 'number', inputmode: 'numeric', min: 2000, max: 2100, value: old?.intake ?? academic });
  const ry = select([['', 'From intake'], 1, 2, 3, 4, 5].map(v => Array.isArray(v) ? v : [v, 'R' + v]), old?.rYear ?? '');
  const msg = h('p', { class: 'e-alert', hidden: true, role: 'alert' });
  const m = modal('Approve resident', h('form', { onsubmit: async e => {
    e.preventDefault();
    const r = rid.value.trim();
    if (!r) { msg.hidden = false; msg.textContent = 'Enter a resident ID.'; return; }
    if (!old && res.some(x => String(x.rid) === r)) { msg.hidden = false; msg.textContent = `${r} is already used.`; return; }
    try {
      await cloud.decideApplication(a.uid, { approve: true, rid: r, intake: intake.value ? Number(intake.value) : null, rYear: ry.value ? Number(ry.value) : null });
      m.close(); toast(`${a.name} added as ${r}`); residentsCache = null; reload();
    } catch (e2) { msg.hidden = false; msg.textContent = 'Could not approve: ' + err(e2); }
  } },
    h('p', { class: 'e-small' }, `${a.name} · ${a.email}`, old ? ' · already listed, keeps their ID' : ''),
    h('div', { class: 'e-pg' }, field('Resident ID', rid, 'e-full'), field('Intake year', intake), field('Residency year', ry)),
    msg,
    h('div', { class: 'e-actions' },
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'n-btn e-go', type: 'submit' }, 'Approve'))));
}

async function reject(a, reload) {
  if (!await confirmBox('Reject application?', `${a.name} (${a.email}) will see that their application was not approved.`, 'Reject', true)) return;
  try { await cloud.decideApplication(a.uid, { approve: false }); toast('Application rejected'); reload(); }
  catch (e) { toast('Could not reject: ' + err(e)); }
}

// Paste parser: one person per line, fields split by comma or tab. Returns [{ line, rec, problem, dup }]
export function parseFacultyLines(text, existing = []) {
  const have = new Set(existing.map(f => f.email));
  const seen = new Set();
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
    const parts = line.split(/\t|,/).map(s => s.trim()).filter(Boolean);
    const ei = parts.findIndex(p => p.includes('@'));
    if (ei < 0) return { line, problem: 'No email' };
    const email = cleanEmail(parts[ei]);
    const name = parts.filter((_, i) => i !== ei).join(' ').trim();
    if (!validEmail(email)) return { line, problem: 'Email not valid' };
    if (!name) return { line, problem: 'No name' };
    if (seen.has(email)) return { line, rec: { name, email }, dup: 'Repeated in this list' };
    seen.add(email);
    if (have.has(email)) return { line, rec: { name, email }, dup: 'Already on the faculty list' };
    return { line, rec: { name, email, status: 'ACTIVE' } };
  });
}

export function parseResidentLines(text, existing = []) {
  const rids = new Set(existing.map(r => String(r.rid)));
  const emails = new Set(existing.map(r => r.email));
  const seenR = new Set(), seenE = new Set();
  return String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
    const p = line.split(/\t|,/).map(s => s.trim());
    if (/^rid$/i.test(p[0])) return null;   // a header row
    const [rid, name, em, intake, ry] = p;
    const email = cleanEmail(em);
    if (!rid) return { line, problem: 'No resident ID' };
    if (!name) return { line, problem: 'No name' };
    if (!validEmail(email)) return { line, problem: 'Email not valid' };
    const yr = ry ? Number(String(ry).replace(/^r/i, '')) : null;
    if (ry && !(yr >= 1 && yr <= 5)) return { line, problem: 'Year must be 1 to 5' };
    if (intake && !/^\d{4}$/.test(intake)) return { line, problem: 'Intake must be a year, e.g. 2025' };
    const rec = { rid, name, email, intake: intake ? Number(intake) : null, rYear: yr, status: 'ACTIVE' };
    if (seenR.has(rid) || seenE.has(email)) return { line, rec, dup: 'Repeated in this list' };
    seenR.add(rid); seenE.add(email);
    if (rids.has(rid)) return { line, rec, dup: `ID ${rid} already used` };
    if (emails.has(email)) return { line, rec, dup: 'Email already on the resident list' };
    return { line, rec };
  }).filter(Boolean);
}

function pasteDialog({ title, help, placeholder, parse, save, done }) {
  const ta = h('textarea', { class: 'e-textarea', rows: 6, placeholder, spellcheck: 'false', autocapitalize: 'off' });
  const out = h('ul', { class: 'e-paste-res', 'aria-live': 'polite' });
  const btn = h('button', { class: 'n-btn e-go', type: 'button', disabled: true }, 'Add');
  let parsed = [];
  const check = () => {
    parsed = parse(ta.value);
    const good = parsed.filter(p => p.rec && !p.dup && !p.problem);
    fill(out, parsed.map(p => h('li', { class: p.problem ? 'is-bad' : p.dup ? 'is-dup' : '' },
      p.problem ? `✗ ${p.line} — ${p.problem}` : p.dup ? `• ${p.line} — ${p.dup}, skipped` : `✓ ${p.rec.name} · ${p.rec.email}${p.rec.rid ? ' · ' + p.rec.rid : ''}`)));
    btn.disabled = !good.length;
    btn.textContent = good.length ? `Add ${good.length}` : 'Add';
  };
  ta.addEventListener('input', check);
  btn.addEventListener('click', async () => {
    const good = parsed.filter(p => p.rec && !p.dup && !p.problem);
    btn.disabled = true;
    let ok = 0; const fails = [];
    for (const p of good) {
      try { await save(p.rec); ok++; } catch (e) { fails.push(`${p.rec.email}: ${err(e)}`); }
    }
    m.close();
    toast(fails.length ? `Added ${ok}; ${fails.length} failed (${fails[0]})` : `Added ${ok}`);
    done();
  });
  const m = modal(title, [h('p', { class: 'e-small' }, help), ta, out,
    h('div', { class: 'e-actions' }, h('button', { class: 'n-btn n-btn--outline e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'), btn)]);
  return m;
}

const searchBox = (ph, onq) => h('input', { class: 'e-input', type: 'search', placeholder: ph, 'aria-label': ph, oninput: e => onq(e.target.value) });
const matches = (q, ...vals) => !q || vals.some(v => String(v || '').toLowerCase().includes(q.toLowerCase()));

function facultyPane({ fac, reload }) {
  const list = h('div', { class: 'e-list' });
  let q = '';
  const paint = () => {
    const rows = fac.filter(f => matches(q, f.name, f.email))
      .sort((a, b) => (a.status === 'INACTIVE') - (b.status === 'INACTIVE') || String(a.name).localeCompare(String(b.name)));
    fill(list, rows.length ? rows.map(f => h('button', { type: 'button', class: 'e-row', onclick: () => editFaculty(f, fac, reload) },
      avatar(f.name || f.email),
      h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, f.name || '(no name)'), h('span', { class: 'e-row__meta' }, f.email)),
      f.status === 'INACTIVE' ? h('span', { class: 'e-chip e-chip--cancelled' }, 'Inactive') : null,
      icon('edit', 'e-row__chev'))) : h('p', { class: 'e-small', style: 'padding:12px 16px;margin:0' }, q ? 'No match.' : 'No faculty yet.'));
  };
  paint();
  const active = fac.filter(f => f.status !== 'INACTIVE').length;
  return h('div', { class: 'e-stack' },
    h('div', { class: 'e-toolbar' },
      searchBox('Search faculty', v => { q = v; paint(); }),
      h('button', { class: 'n-btn e-btn-small', type: 'button', onclick: () => editFaculty(null, fac, reload) }, icon('plus'), 'Add'),
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-small', type: 'button', onclick: () => pasteDialog({
        title: 'Paste faculty list',
        help: 'One per line: Name, email (or paste two columns from a spreadsheet). Emails are lower-cased; people already listed are skipped.',
        placeholder: 'Dr Alex Example, alex.example@example.com',
        parse: t => parseFacultyLines(t, fac), save: rec => cloud.saveFaculty(rec), done: reload,
      }) }, 'Paste list')),
    h('p', { class: 'e-listhead' }, h('span', {}, `${active} active · ${fac.length - active} inactive`)),
    h('p', { class: 'e-small', style: 'margin:-12px 4px 0' }, 'Only active faculty can be chosen as assessors. Set someone inactive rather than removing them.'),
    h('div', { class: 'e-card e-card--flush' }, list));
}

function editFaculty(f, fac, reload) {
  const name = input({ value: f?.name || '', autocomplete: 'name', required: true });
  const email = input({ type: 'email', value: f?.email || '', readonly: f ? true : null, required: true, autocapitalize: 'off', spellcheck: 'false' });
  const status = select([['ACTIVE', 'Active'], ['INACTIVE', 'Inactive (can’t be chosen as assessor)']], f?.status || 'ACTIVE');
  const msg = h('p', { class: 'e-alert', hidden: true, role: 'alert' });
  const m = modal(f ? 'Edit faculty' : 'Add faculty', h('form', { onsubmit: async e => {
    e.preventDefault();
    const em = cleanEmail(email.value), nm = name.value.trim();
    const bad = !nm ? 'Enter a name.' : !validEmail(em) ? 'Enter a valid email.' : !f && fac.some(x => x.email === em) ? `${em} is already on the list.` : null;
    if (bad) { msg.hidden = false; msg.textContent = bad; return; }
    try { await cloud.saveFaculty({ ...(f || {}), email: em, name: nm, status: status.value }); m.close(); toast(f ? 'Saved' : `${nm} added`); reload(); }
    catch (e2) { msg.hidden = false; msg.textContent = 'Could not save: ' + err(e2); }
  } },
    field('Name', name), field('Google account email', email), f ? null : h('p', { class: 'e-hint' }, 'The email they sign in with.'),
    field('Status', status), msg,
    h('div', { class: 'e-actions' },
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'n-btn', type: 'submit' }, f ? 'Save' : 'Add'))));
}

let resStatusFilter = 'current';
function residentsPane({ res, reload }) {
  const list = h('div', { class: 'e-list' });
  let q = '';
  const chipCls = { ACTIVE: 'e-chip--submitted', 'ON LEAVE': 'e-chip--info', GRADUATED: 'e-chip--draft', ATTRITED: 'e-chip--cancelled' };
  const paint = () => {
    const rows = res.filter(r => (resStatusFilter === 'all' || r.status === 'ACTIVE' || r.status === 'ON LEAVE') && matches(q, r.name, r.email, r.rid))
      .sort((a, b) => (residentYear(a) || 9) - (residentYear(b) || 9) || String(a.name).localeCompare(String(b.name)));
    fill(list, rows.length ? rows.map(r => h('button', { type: 'button', class: 'e-row', onclick: () => editResident(r, res, reload) },
      avatar(r.name || r.email),
      h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, r.name || '(no name)'),
        h('span', { class: 'e-row__meta' }, `${r.rid} · R${residentYear(r) || '?'}${r.intake ? ' · intake ' + r.intake : ''}`),
        h('span', { class: 'e-row__meta' }, r.email)),
      r.status !== 'ACTIVE' ? h('span', { class: `e-chip ${chipCls[r.status] || ''}` }, r.status) : null,
      icon('edit', 'e-row__chev'))) : h('p', { class: 'e-small', style: 'padding:12px 16px;margin:0' }, q ? 'No match.' : 'No residents.'));
  };
  paint();
  const leavers = res.filter(r => r.status === 'GRADUATED' || r.status === 'ATTRITED').length;
  return h('div', { class: 'e-stack' },
    h('div', { class: 'e-toolbar' },
      searchBox('Search residents', v => { q = v; paint(); }),
      h('button', { class: 'n-btn e-btn-small', type: 'button', onclick: () => editResident(null, res, reload) }, icon('plus'), 'Add'),
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-small', type: 'button', onclick: () => pasteDialog({
        title: 'Paste resident list',
        help: 'One per line: rid, name, email, intake year, residency year (the last two optional). Duplicate IDs or emails are skipped.',
        placeholder: `${nextRid(res)}, Sam Example, sam.example@example.com, ${todayISO().slice(0, 4)}, 1`,
        parse: t => parseResidentLines(t, res), save: rec => cloud.saveResident(rec), done: () => { residentsCache = null; reload(); },
      }) }, 'Paste list'),
      leavers ? h('label', {}, h('input', { type: 'checkbox', checked: resStatusFilter === 'all', onchange: e => { resStatusFilter = e.target.checked ? 'all' : 'current'; paint(); } }), `Show graduated/attrited (${leavers})`) : null),
    h('p', { class: 'e-listhead' }, h('span', {}, `${res.filter(r => r.status === 'ACTIVE').length} active of ${res.length}`)),
    h('p', { class: 'e-small', style: 'margin:-12px 4px 0' }, 'Residents are never deleted: change their status instead.'),
    h('div', { class: 'e-card e-card--flush' }, list));
}

function editResident(r, res, reload) {
  const rid = input({ value: r?.rid || nextRid(res), readonly: r ? true : null, required: true });
  const name = input({ value: r?.name || '', autocomplete: 'name', required: true });
  const email = input({ type: 'email', value: r?.email || '', required: true, autocapitalize: 'off', spellcheck: 'false' });
  const intake = input({ type: 'number', inputmode: 'numeric', min: 2000, max: 2100, value: r?.intake ?? '' });
  const ry = select([['', 'From intake'], ...[1, 2, 3, 4, 5].map(v => [v, 'R' + v])], r?.rYear ?? '');
  const status = select(RES_STATUSES, r?.status || 'ACTIVE');
  const msg = h('p', { class: 'e-alert', hidden: true, role: 'alert' });
  const m = modal(r ? 'Edit resident' : 'Add resident', h('form', { onsubmit: async e => {
    e.preventDefault();
    const d = { ...(r || {}), rid: rid.value.trim(), name: name.value.trim(), email: cleanEmail(email.value), status: status.value,
      intake: intake.value ? Number(intake.value) : null, rYear: ry.value ? Number(ry.value) : null };
    const clash = res.find(x => x.email === d.email && String(x.rid) !== d.rid);
    const bad = !d.rid ? 'Enter a resident ID.' : !d.name ? 'Enter a name.' : !validEmail(d.email) ? 'Enter a valid email.'
      : !r && res.some(x => String(x.rid) === d.rid) ? `${d.rid} is already used.`
      : clash ? `${d.email} is already used by ${clash.name} (${clash.rid}).`
      : d.intake && !(d.intake >= 2000 && d.intake <= 2100) ? 'Intake should be a year, e.g. 2025.' : null;
    if (bad) { msg.hidden = false; msg.textContent = bad; return; }
    try { await cloud.saveResident(d); m.close(); toast(r ? 'Saved' : `${d.name} added`); residentsCache = null; reload(); }
    catch (e2) { msg.hidden = false; msg.textContent = 'Could not save: ' + err(e2); }
  } },
    h('div', { class: 'e-pg' },
      field('Resident ID', rid), field('Status', status),
      field('Name', name, 'e-full'), field('Google account email', email, 'e-full'),
      field('Intake year', intake), field('Residency year', ry)),
    h('p', { class: 'e-hint' }, r ? 'Residents are kept for the record. Use status for leave, graduation or attrition.' : 'Residency year is worked out from intake (from 1 July) unless set.'),
    msg,
    h('div', { class: 'e-actions' },
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'n-btn', type: 'submit' }, r ? 'Save' : 'Add'))));
}
