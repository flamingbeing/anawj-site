// New request flow (#new, #new/{itemId}): 1 item → 2 assessor → 3 case card → Send → 4 share (QR).
// Also exports the pieces the other resident screens reuse: the assessor picker, the share sheet,
// the QR code, item rows and the resident styles.

import { S, hooks, h, fill, toast, cloud, icon, go, toolLabel, fmtDate, modal, debounce, avatar } from './ui-core.js';
import { EPAS, ITEMS, itemById, searchItems, CATALOGUE_VERSION } from './catalogue.js';
import { progress, dueItems, caseKey, sameCaseCount, identifierWarning, todayISO, residentYear } from './engine.js';
import qrcode from './vendor/qrcode.js';

export const AGE_BANDS = ['<16', '16-40', '41-64', '65-79', '80+'];
export const GENDERS = [['F', 'Female'], ['M', 'Male']];
const LOCATIONS = ['Operating theatre', 'Preop Clinic', 'ICU', 'Delivery suite', 'Ward', 'Recovery/PACU'];

// ---------- styles for the resident screens (kept here so style.css stays the shell's) ----------

const CSS = `
.e-rq-steps { display:flex; align-items:center; gap:8px; margin:0 0 12px; font-size:var(--n-text-sm); color:var(--e-muted-on-grey); }
.e-rq-steps b { color:var(--n-navy); }
.e-rq-steps .e-rq-bar { flex:1; height:4px; background:#dfe3e8; }
.e-rq-steps .e-rq-bar > span { display:block; height:100%; background:var(--n-navy); }
.e-rq-search { position:relative; margin:0 0 8px; }
.e-rq-search .e-ico { position:absolute; left:12px; top:50%; transform:translateY(-50%); width:20px; height:20px; color:var(--n-muted); pointer-events:none; }
.e-rq-search input { padding-left:40px; }
.e-rq-item .e-row__title { -webkit-line-clamp:3; }
.e-rq-tags { display:flex; flex-wrap:wrap; align-items:center; gap:4px 6px; margin-top:4px; font-size:12px; color:var(--n-muted); }
.e-rq-done { font-weight:var(--n-semibold); color:var(--n-ink); }
.e-rq-done.is-met { color:var(--e-ok); }
.e-rq-epa { background:var(--n-bg); border-bottom:1px solid var(--n-line); }
.e-rq-epa > summary { display:flex; align-items:center; gap:10px; min-height:56px; padding:8px 16px; cursor:pointer; list-style:none; font-weight:var(--n-semibold); }
.e-rq-epa > summary::-webkit-details-marker { display:none; }
.e-rq-epa > summary::after { content:""; flex:none; width:10px; height:10px; margin-left:auto; border-right:2px solid var(--n-muted); border-bottom:2px solid var(--n-muted); transform:rotate(45deg); transition:transform .15s; }
.e-rq-epa[open] > summary::after { transform:rotate(-135deg); }
.e-rq-epa > summary .e-rq-epa__n { flex:none; min-width:44px; padding:2px 6px; background:var(--n-navy); color:#fff; font-size:12px; text-align:center; border-radius:var(--n-radius-sm); }
.e-rq-epa > summary .e-rq-epa__t { font-size:var(--n-text-sm); line-height:1.3; }
.e-rq-epa .e-list { border-bottom:0; }
.e-rq-chosen { display:flex; align-items:flex-start; gap:12px; padding:12px 16px; background:var(--n-bg); border:1px solid var(--n-line); margin:0 0 8px; }
.e-rq-chosen__body { flex:1; min-width:0; }
.e-rq-chosen__body p { margin:0; line-height:1.35; }
.e-rq-chosen .e-btn-link { flex:none; min-height:40px; }
.e-rq-field { margin:0 0 16px; }
.e-rq-field > .e-label { display:block; margin:0 0 6px; }
.e-rq-field .e-chips { margin-bottom:8px; }
.e-rq-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.e-rq-initials { text-transform:uppercase; letter-spacing:.15em; font-weight:var(--n-semibold); }
.e-rq-err { margin:4px 0 0; font-size:var(--n-text-sm); color:var(--n-red); }
.e-rq-sendbar { position:sticky; bottom:0; z-index:5; margin:16px -16px -16px; padding:12px 16px calc(12px + var(--e-safe-b)); background:#fff; border-top:1px solid var(--n-line); }
.e-rq-sendbar .n-btn { width:100%; }
.e-rq-done-head { display:flex; align-items:center; gap:12px; }
.e-rq-done-head .e-ico { flex:none; width:36px; height:36px; padding:6px; border-radius:50%; background:var(--e-go); color:#fff; stroke-width:3; }
.e-rq-qrbtn { display:block; padding:0; border:0; background:none; cursor:zoom-in; }
.e-rq-btns { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.e-rq-btns > .e-btn-big { grid-column:1 / -1; }
.e-qr--full { cursor:zoom-out; }
.e-qr--full svg { width:min(92vw, 92vh - 120px, 520px); }
.e-rq-hint { margin:8px 16px; font-size:var(--n-text-sm); color:var(--e-muted-on-grey); }
.e-rq-strip { display:flex; flex-direction:column; gap:0; }
.e-rq-big { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; min-height:64px; font-size:var(--n-text-lg); }
.e-rq-big .e-ico { width:26px; height:26px; stroke-width:2.5; }
.e-rq-ans { width:100%; text-align:left; display:grid; grid-template-columns:1fr auto; gap:4px 12px; align-items:start; padding:12px 16px; border:0; border-bottom:1px solid var(--n-line); background:var(--n-bg); color:var(--n-ink); cursor:pointer; font:inherit; }
.e-rq-ans.is-stack { grid-template-columns:1fr; }
.e-rq-ans.is-stack .e-rq-ans__v { text-align:left; white-space:normal; }
.e-rq-ans:last-child { border-bottom:0; }
.e-rq-ans__q { font-size:var(--n-text-sm); line-height:1.35; }
.e-rq-ans__v { font-weight:var(--n-bold); color:var(--n-navy); white-space:nowrap; text-align:right; }
.e-rq-ans__d { grid-column:1 / -1; margin:0; padding:8px 10px; background:var(--n-bg-blue); font-size:var(--n-text-sm); line-height:1.4; }
.e-rq-ans:not(.is-open) .e-rq-ans__d { display:none; }
.e-rq-quote { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.5; }
.e-rq-big-level { display:flex; align-items:center; gap:14px; }
.e-rq-big-level__n { flex:none; display:grid; place-items:center; width:56px; height:56px; border-radius:50%; background:var(--n-navy); color:#fff; font-size:26px; font-weight:var(--n-bold); }
.e-rq-big-level__n.is-band-1 { background:var(--n-red); } .e-rq-big-level__n.is-band-3 { background:var(--e-go); }
.e-rq-sum { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }
.e-rq-sum .e-chip { font-size:var(--n-text-sm); padding:4px 10px; }
.e-rq-legend { display:flex; flex-wrap:wrap; gap:6px 14px; margin:0 4px 12px; font-size:12px; color:var(--e-muted-on-grey); }
.e-rq-legend span::before { content:""; display:inline-block; width:10px; height:10px; margin-right:5px; vertical-align:-1px; background:var(--c); }
.e-rq-state { font-size:12px; font-weight:var(--n-semibold); }
.e-rq-state--done { color:var(--e-ok); } .e-rq-state--overdue { color:var(--n-red); } .e-rq-state--due-soon { color:#8a5a00; }
.e-rq-state--on-track { color:var(--n-navy); } .e-rq-state--later { color:var(--n-muted); }
.e-rq-gitem { display:flex; align-items:center; gap:10px; width:100%; min-height:48px; padding:8px 16px 8px 28px; border:0; border-top:1px solid #eef0f2; background:#fff; color:var(--n-ink); text-align:left; font:inherit; font-size:var(--n-text-sm); cursor:pointer; }
.e-rq-gitem:hover { background:#f5f8fb; }
.e-rq-gitem__t { flex:1; min-width:0; line-height:1.35; }
.e-rq-gitem__n { flex:none; min-width:28px; text-align:center; font-weight:var(--n-semibold); }
.e-rq-gitem__n.is-zero { color:var(--n-muted); font-weight:var(--n-regular); }
.e-rq-epa .e-prow { border-bottom:0; border-top:1px solid var(--n-line); padding-bottom:8px; }
.e-rq-epa__bar { flex:none; width:64px; }
@media print {
  .e-rq-ans .e-rq-ans__d { display:block !important; }
  .e-rq-ans { break-inside:avoid; }
  .e-card { break-inside:avoid; border-color:#999; }
}
`;
export function residentCSS() {
  if (typeof document === 'undefined' || document.getElementById('e-rq-css')) return;
  document.head.append(h('style', { id: 'e-rq-css' }, CSS));
}
residentCSS();

// ---------- shared helpers ----------

export const me = () => S.user?.email || '';
export const myYear = () => residentYear(S.roles.resident) || 1;
const byNew = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

// Active faculty, not me, sorted by name. Loads the list if app.js hasn't yet.
export const activeFaculty = () => (S.faculty || []).filter(f => f.status !== 'INACTIVE' && f.email !== me())
  .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
let facultyLoading = null;
export function ensureFaculty(then) {
  if ((S.faculty || []).length || facultyLoading) return;
  facultyLoading = cloud.listFaculty().then(list => { S.faculty = list || []; then && then(); })
    .catch(err => console.warn('Faculty list', err)).finally(() => { facultyLoading = null; });
}
const facultyByEmail = email => (S.faculty || []).find(f => f.email === email) || null;

// Group progress (done/min) for every item, from my submitted evaluations.
export function itemProgress() {
  const map = new Map();
  for (const p of progress(S.mine, myYear())) for (const { item } of p.items) map.set(item.id, p);
  return map;
}

export const tag = (text, cls = '') => h('span', { class: `e-tag ${cls}` }, text);
export const itemTags = item => [tag(toolLabel(item.tool), 'e-tag--tool'), tag('EPA ' + item.epa), item.level ? tag('L' + item.level) : null];

// One item as a list row: text, tool, EPA, level and done n/min.
export function itemRow(item, prog, onclick, extra) {
  const p = prog && prog.get(item.id);
  return h('button', { type: 'button', class: 'e-row e-rq-item', onclick, 'data-item': item.id },
    h('span', { class: 'e-row__body' },
      h('span', { class: 'e-row__title' }, item.text),
      h('span', { class: 'e-rq-tags' }, itemTags(item),
        p ? h('span', { class: 'e-rq-done' + (p.done >= p.min ? ' is-met' : '') }, `done ${p.done}/${p.min}`) : null,
        item.completeBy ? h('span', {}, '· by ' + item.completeBy) : null, extra || null)),
    icon('chevron', 'e-row__chev'));
}

// The assessor's link. In the demo it opens as the demo assessor.
export function evalLink(id) {
  const base = location.origin + location.pathname;
  return base + (cloud.demo ? '?demo=assessor' : '') + '#e/' + encodeURIComponent(id);
}
export const shareText = ev => `Please complete this ${toolLabel(ev.tool)} for me: ${ev.itemText || ''}`.trim();

// QR code as an SVG (generated on the phone, so it works offline).
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), q = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q},${r + q}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + 2 * q} ${n + 2 * q}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code of the link to the form');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', '#000');
  svg.append(bg, p);
  return svg;
}

// Full-screen QR for the assessor to scan; tap or Esc closes.
export function fullQR(link, caption) {
  const el = h('div', { class: 'e-qr e-qr--full', role: 'dialog', 'aria-label': 'QR code', tabindex: '-1' },
    qrSvg(link), h('p', { class: 'e-qr__caption' }, caption || 'Scan to open the form'),
    h('button', { type: 'button', class: 'n-btn n-btn--outline e-btn-quiet' }, 'Close'));
  const close = () => { el.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', close);
  document.addEventListener('keydown', esc);
  document.body.append(el);
  el.focus();
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Link copied'); }
  catch {
    const t = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(t); t.select();
    try { document.execCommand('copy'); toast('Link copied'); } catch { toast('Copy failed: press and hold the link'); }
    t.remove();
  }
}

// Share via the phone's share sheet (form type, item and link only: no patient details).
export async function shareEval(ev) {
  const url = evalLink(ev.id);
  if (navigator.share) {
    try { await navigator.share({ title: `${toolLabel(ev.tool)} request`, text: shareText(ev), url }); return true; }
    catch (err) { if (err && err.name === 'AbortError') return false; }
  }
  await copyText(shareText(ev) + '\n' + url);
  return true;
}

// QR + Share + Copy link, as a block (share step) or inside a sheet (Nudge, re-share).
export function sharePanel(ev) {
  const url = evalLink(ev.id);
  const who = ev.assessorName || ev.assessorEmail;
  return h('div', { class: 'e-stack' },
    h('div', { class: 'e-qr' },
      h('button', { type: 'button', class: 'e-rq-qrbtn', 'aria-label': 'Show the QR code full screen', onclick: () => fullQR(url, `${toolLabel(ev.tool)} for ${who}`) }, qrSvg(url)),
      h('p', { class: 'e-qr__caption' }, `Ask ${who} to scan this, or send the link.`),
      h('p', { class: 'e-qr__caption' }, h('a', { href: url, 'data-link': '' }, url))),
    h('div', { class: 'e-rq-btns' },
      h('button', { type: 'button', class: 'n-btn e-btn-big', onclick: () => shareEval(ev) }, icon('share'), navigator.share ? 'Share link' : 'Copy message'),
      h('button', { type: 'button', class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => fullQR(url, `${toolLabel(ev.tool)} for ${who}`) }, icon('qr'), 'Full screen'),
      h('button', { type: 'button', class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => copyText(url) }, 'Copy link')));
}
export function shareSheet(ev, title = 'Send the link') {
  return modal(title, sharePanel(ev));
}

// Assessor picker: Recent | All, listed faculty only. onpick({ email, name }).
export function assessorPicker({ onpick, exclude = [], current = null } = {}) {
  const wrap = h('div', { class: 'e-rq-picker' });
  const recents = () => {
    const seen = new Set(), out = [];
    for (const ev of [...S.mine].sort(byNew)) {
      const e = ev.assessorEmail;
      if (!e || seen.has(e)) continue;
      seen.add(e);
      const f = facultyByEmail(e);
      if ((S.faculty || []).length && (!f || f.status === 'INACTIVE')) continue;   // no longer listed
      out.push(f || { email: e, name: ev.assessorName || e });
    }
    return out.filter(f => !exclude.includes(f.email) && f.email !== me()).slice(0, 8);
  };
  let tab = recents().length ? 'recent' : 'all', q = '';
  const listEl = h('div', { class: 'e-list' });
  const search = h('input', { class: 'e-input', type: 'search', placeholder: 'Search name or email', autocomplete: 'off', 'aria-label': 'Search faculty',
    oninput: debounce(() => { q = search.value.trim().toLowerCase(); paintList(); }, 100) });
  const searchWrap = h('div', { class: 'e-rq-search' }, icon('search'), search);
  const pick = f => onpick({ email: f.email, name: f.name || f.email });
  function paintList() {
    let list = tab === 'recent' ? recents() : activeFaculty().filter(f => !exclude.includes(f.email));
    if (tab === 'all' && q) list = list.filter(f => (f.name + ' ' + f.email).toLowerCase().includes(q));
    if (!list.length) {
      fill(listEl, h('p', { class: 'e-rq-hint' }, tab === 'recent' ? 'No recent assessors yet.' : (S.faculty || []).length ? 'No one matches.' : 'Loading the faculty list…'));
      return;
    }
    fill(listEl, list.map(f => h('button', { type: 'button', class: 'e-row', onclick: () => pick(f), 'aria-current': current === f.email ? 'true' : null },
      avatar(f.name || f.email),
      h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, f.name || f.email), h('span', { class: 'e-row__meta' }, f.email)),
      current === f.email ? h('span', { class: 'e-chip e-chip--info' }, 'Current') : null,
      icon('chevron', 'e-row__chev'))));
  }
  function paint() {
    fill(wrap,
      segment2([{ id: 'recent', label: 'Recent' }, { id: 'all', label: 'All faculty' }], tab, id => { tab = id; paint(); if (id === 'all') search.focus(); }),
      tab === 'all' ? searchWrap : null,
      listEl,
      h('p', { class: 'e-rq-hint' }, 'Not listed? Ask an admin to add them to the faculty list.'));
    paintList();
  }
  ensureFaculty(() => paintList());
  paint();
  return wrap;
}
// segment without the edge-to-edge margins (it sits inside cards and sheets)
function segment2(items, cur, onpick) {
  return h('div', { class: 'e-segment', role: 'tablist', style: 'margin:0 0 8px' }, items.map(it => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(it.id === cur), onclick: () => onpick(it.id) }, it.label)));
}

// The last request I made (for "Repeat last").
export function lastRequest() {
  return [...S.mine].filter(ev => !['cancelled', 'draft'].includes(ev.status) && ev.assessorEmail && itemById(ev.itemId)).sort(byNew)[0] || null;
}

// ---------- the flow ----------

let F = null;   // flow state; reset when leaving #new
let root = null;

// The flow survives a reload or the phone killing the tab (this tab only, for 2 hours).
const FLOW_KEY = 'evals-request-flow';
const FLOW_MAX_AGE = 2 * 36e5;
function keepFlow() {
  try {
    if (F && F.step < 4 && !F.sending) sessionStorage.setItem(FLOW_KEY, JSON.stringify({ F, at: Date.now(), user: S.user?.email || null }));
    else sessionStorage.removeItem(FLOW_KEY);
  } catch {}
}
function dropFlow() { try { sessionStorage.removeItem(FLOW_KEY); } catch {} }
function restoreFlow() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FLOW_KEY) || 'null');
    if (!saved || saved.user !== (S.user?.email || null) || Date.now() - saved.at > FLOW_MAX_AGE) return null;
    return { ...saved.F, sending: false, error: '' };
  } catch { return null; }
}

function startFlow({ itemId = null, step = 1 } = {}) {
  const last = lastRequest();
  F = {
    id: cloud.newEvaluationId(), step, firstStep: step, itemId, assessor: null, sending: false, sent: null, error: '',
    card: { date: todayISO(), location: last?.request?.location || '', initials: '', ageBand: '', gender: '', coManaged: false, notes: '' },
  };
}

// Repeat last from Home: item and assessor of the last request, straight to the case card.
export function repeatLast() {
  const last = lastRequest();
  if (!last) { go('new'); return; }
  repeatFrom = last;
  go('new');
}
let repeatFrom = null;

function setStep(n, { push = true } = {}) {
  F.step = n;
  if (push) history.pushState({ evStep: n }, '', location.href);
  paint();
  window.scrollTo(0, 0);
}

// leave the flow without leaving a stale #new behind in history
function leave(route) {
  F = null;
  dropFlow();
  history.replaceState(null, '', location.pathname + location.search + '#' + route);
  hooks.render();
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { if (!/^#new\b/.test(location.hash)) { F = null; dropFlow(); } });
  // typing in the case card doesn't repaint, so save the flow when the page is hidden too
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && /^#new\b/.test(location.hash)) keepFlow(); });
  window.addEventListener('pagehide', () => { if (/^#new\b/.test(location.hash)) keepFlow(); });
  window.addEventListener('popstate', e => {
    if (!F || !/^#new\b/.test(location.hash)) return;
    if (F.step === 4) { leave('requests'); return; }
    F.step = (e.state && e.state.evStep) || F.firstStep;
    paint();
  });
  // the app bar's back button steps back inside the flow
  document.addEventListener('click', e => {
    if (!F || S.route !== 'new' || !e.target.closest || !e.target.closest('#back')) return;
    if (F.step === 4) { e.stopPropagation(); leave('home'); return; }
    if (F.step > F.firstStep) { e.stopPropagation(); history.back(); }
  }, true);
}

export function renderNew(arg) {
  if (!S.roles.resident) return h('div', { class: 'e-empty' }, h('p', { class: 'e-empty__title' }, 'Only residents can request evaluations.'));
  const item = arg && itemById(arg);
  if (!F) {
    if (repeatFrom) {
      const last = repeatFrom; repeatFrom = null;
      startFlow({ itemId: last.itemId, step: 3 });
      const f = facultyByEmail(last.assessorEmail);
      if (!f || f.status !== 'INACTIVE') F.assessor = { email: last.assessorEmail, name: f?.name || last.assessorName || last.assessorEmail };
      else F.step = F.firstStep = 2;
    } else {
      const kept = !item && restoreFlow();
      if (kept) F = kept; else startFlow(item ? { itemId: item.id, step: 2 } : {});
    }
  } else if (item && F.itemId !== item.id && F.step < 4) { F.itemId = item.id; }
  ensureFaculty(() => { if (F && F.step === 2) paint(); });
  root = h('div', { class: 'e-stack e-rq' });
  paint();
  return root;
}

function paint() {
  if (!root || !F) return;
  const views = { 1: stepItem, 2: stepAssessor, 3: stepCase, 4: stepShare };
  fill(root, views[F.step]());
  keepFlow();
}

function stepHead(n, label) {
  return h('div', { class: 'e-rq-steps' },
    h('span', {}, h('b', {}, `Step ${n} of 3`), ' · ', label),
    h('span', { class: 'e-rq-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.round(n / 3 * 100)}%` })));
}

// Step 1: the item.
function stepItem() {
  const prog = itemProgress();
  const choose = id => {
    F.itemId = id;
    if (F.assessor) setStep(3); else setStep(2);
  };
  const results = h('div', {});
  const browse = h('div', {});
  const search = h('input', { class: 'e-input', type: 'search', id: 'rq-search', placeholder: 'Search: art line, TAP, epa 3, DOPS…', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'Search items',
    value: F.query || '', oninput: debounce(() => { F.query = search.value; paintResults(); }, 120) });
  function paintResults() {
    const q = search.value.trim();
    browse.hidden = !!q;
    if (!q) { fill(results); return; }
    const found = searchItems(q, { rYear: myYear() }).slice(0, 30);
    fill(results,
      h('h2', { class: 'e-listhead' }, `${found.length} match${found.length === 1 ? '' : 'es'}`),
      found.length ? h('div', { class: 'e-list' }, found.map(it => itemRow(it, prog, () => choose(it.id))))
        : h('p', { class: 'e-rq-hint' }, 'Nothing matches. Try another word, or browse by EPA below.'));
  }
  const last = lastRequest();
  const due = [...new Set(dueItems(S.mine, myYear()).map(i => i.id))].slice(0, 5).map(itemById);
  const recentIds = [...new Set([...S.mine].sort(byNew).map(ev => ev.itemId).filter(id => itemById(id)))].slice(0, 5);
  const repeat = last && !F.assessor ? h('button', { type: 'button', class: 'e-row', onclick: () => {
    F.itemId = last.itemId;
    const f = facultyByEmail(last.assessorEmail);
    if (!f || f.status !== 'INACTIVE') { F.assessor = { email: last.assessorEmail, name: f?.name || last.assessorName || last.assessorEmail }; setStep(3); }
    else setStep(2);
  } }, h('span', { class: 'e-avatar', 'aria-hidden': 'true' }, icon('plus')),
  h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, 'Repeat last: ' + (itemById(last.itemId)?.text || last.itemText)),
    h('span', { class: 'e-row__meta' }, `${toolLabel(last.tool)} · ${last.assessorName || last.assessorEmail}`)), icon('chevron', 'e-row__chev')) : null;

  fill(browse,
    repeat ? [h('h2', { class: 'e-listhead' }, 'Quick'), h('div', { class: 'e-list' }, repeat)] : null,
    due.length ? [h('h2', { class: 'e-listhead' }, `Due for you (R${myYear()})`), h('div', { class: 'e-list' }, due.map(it => itemRow(it, prog, () => choose(it.id))))] : null,
    recentIds.length ? [h('h2', { class: 'e-listhead' }, 'Recent'), h('div', { class: 'e-list' }, recentIds.map(id => itemRow(itemById(id), prog, () => choose(id))))] : null,
    h('h2', { class: 'e-listhead' }, 'Browse by EPA'),
    h('div', { class: 'e-list' }, EPAS.map(e => {
      const items = ITEMS.filter(i => i.epa === e.epa && !i.retired);
      if (!items.length) return null;
      const det = h('details', { class: 'e-rq-epa' },
        h('summary', {}, h('span', { class: 'e-rq-epa__n' }, e.epa), h('span', { class: 'e-rq-epa__t' }, e.title)));
      det.addEventListener('toggle', () => {
        if (det.open && det.children.length === 1) det.append(h('div', { class: 'e-list' }, items.map(it => itemRow(it, prog, () => choose(it.id)))));
      });
      return det;
    })));

  if (F.query) paintResults();
  return [
    stepHead(1, 'What should be assessed?'),
    F.assessor ? chosenAssessor() : null,
    h('div', { class: 'e-rq-search' }, icon('search'), search),
    results, browse,
  ];
}

function chosenItem() {
  const it = itemById(F.itemId);
  if (!it) return null;
  return h('div', { class: 'e-rq-chosen' },
    h('div', { class: 'e-rq-chosen__body' }, h('p', {}, h('b', {}, it.text)), h('p', { class: 'e-rq-tags' }, itemTags(it))),
    h('button', { type: 'button', class: 'e-btn-link', onclick: () => { F.firstStep = 1; setStep(1); }, 'aria-label': 'Change item' }, 'Change'));
}
function chosenAssessor() {
  const a = F.assessor;
  return h('div', { class: 'e-rq-chosen' },
    avatar(a.name),
    h('div', { class: 'e-rq-chosen__body' }, h('p', {}, h('b', {}, a.name)), h('p', { class: 'e-small e-muted' }, a.email)),
    h('button', { type: 'button', class: 'e-btn-link', onclick: () => { F.firstStep = Math.min(F.firstStep, 2); setStep(2); }, 'aria-label': 'Change assessor' }, 'Change'));
}

// Step 2: the assessor (listed faculty only).
function stepAssessor() {
  if (!itemById(F.itemId)) { F.step = 1; return stepItem(); }
  return [
    stepHead(2, 'Who will assess you?'),
    chosenItem(),
    h('div', { class: 'e-card e-card--flush' }, assessorPicker({ current: F.assessor?.email, onpick: a => { F.assessor = a; setStep(3); } })),
  ];
}

// Step 3: the case card. No names, record numbers or diagnoses (PLAN §8).
function stepCase() {
  const it = itemById(F.itemId);
  if (!it) { F.step = 1; return stepItem(); }
  if (!F.assessor) { F.step = 2; return stepAssessor(); }
  const c = F.card;
  const warnEl = h('div', { 'aria-live': 'polite' });
  const errs = {};
  // each error has an id; its field (or chip group) points at it with aria-describedby and is
  // marked aria-invalid while it shows
  const errId = k => `rq-err-${k}`;
  const err = k => (errs[k] = h('p', { class: 'e-rq-err', id: errId(k), hidden: true }));
  const fields = {};
  const showErr = (k, msg) => {
    errs[k].textContent = msg || ''; errs[k].hidden = !msg;
    if (fields[k]) { if (msg) fields[k].setAttribute('aria-invalid', 'true'); else fields[k].removeAttribute('aria-invalid'); }
  };

  const chips = (name, options, key, { onchange, label } = {}) => (fields[key] = h('div', { class: 'e-chips', role: 'radiogroup', 'aria-labelledby': label, 'aria-describedby': errId(key) }, options.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return h('label', { class: 'e-choice' },
      h('input', { type: 'radio', name, value: v, checked: c[key] === v, class: 'e-sr',
        onchange: () => { c[key] = v; showErr(key, ''); onchange && onchange(); checkWarnings(); } }),
      h('span', {}, l));
  })));

  const date = fields.date = h('input', { class: 'e-input', type: 'date', id: 'rq-date', value: c.date, max: todayISO(), required: true, 'aria-describedby': errId('date'),
    onchange: () => { c.date = date.value; showErr('date', ''); checkWarnings(); } });

  const recentLocs = [...new Set([...S.mine].sort(byNew).map(ev => ev.request?.location).filter(Boolean))];
  const locs = [...new Set([...recentLocs.slice(0, 4), ...LOCATIONS])].slice(0, 6);
  const locInput = fields.location = h('input', { class: 'e-input', id: 'rq-loc', value: c.location, maxlength: 80, placeholder: 'Or type a location', autocomplete: 'off',
    'aria-label': 'Location (type your own)', 'aria-describedby': errId('location'),
    oninput: () => { c.location = locInput.value.trim(); showErr('location', ''); syncLoc(); } });
  const locChips = h('div', { class: 'e-chips', role: 'radiogroup', 'aria-labelledby': 'rq-loc-l' }, locs.map(l => h('label', { class: 'e-choice' },
    h('input', { type: 'radio', name: 'rq-loc', value: l, class: 'e-sr', checked: c.location === l,
      onchange: () => { c.location = l; locInput.value = l; showErr('location', ''); } }), h('span', {}, l))));
  const syncLoc = () => locChips.querySelectorAll('input').forEach(i => { i.checked = i.value === c.location; });

  const initials = fields.initials = h('input', { class: 'e-input e-rq-initials', id: 'rq-initials', value: c.initials, maxlength: 3, autocapitalize: 'characters', autocomplete: 'off',
    autocorrect: 'off', spellcheck: 'false', inputmode: 'text', placeholder: 'e.g. AB', 'aria-describedby': `rq-initials-hint ${errId('initials')}`,
    oninput: () => {
      const v = initials.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      if (v !== initials.value) initials.value = v;
      c.initials = v; showErr('initials', ''); checkWarnings();
    } });

  const notes = h('textarea', { class: 'e-textarea', id: 'rq-notes', rows: 2, maxlength: 300, placeholder: 'e.g. the LMA on Tuesday morning list',
    oninput: () => { c.notes = notes.value; checkWarnings(); } }, c.notes);
  const noteWarn = h('p', { class: 'e-rq-err', hidden: true });

  const co = it.tool === 'EBD' ? h('label', { class: 'e-check' },
    fields.coManaged = h('input', { type: 'checkbox', checked: c.coManaged, 'aria-describedby': errId('coManaged'), onchange: e => { c.coManaged = e.target.checked; showErr('coManaged', ''); } }),
    h('span', {}, `I confirm ${F.assessor.name} co-managed this case`)) : null;

  function checkWarnings() {
    const msgs = [];
    const same = c.date && c.initials ? sameCaseCount(S.mine.filter(ev => ev.id !== F.id), c.date, c.initials) : 0;
    if (same >= 2) msgs.push(`${c.initials} on ${fmtDate(c.date)} is already on ${same} of your requests. A patient can be used for at most 2 assessments.`);
    const dup = S.mine.find(ev => ev.id !== F.id && ev.status !== 'cancelled' && ev.itemId === F.itemId && ev.assessorEmail === F.assessor.email && (ev.request?.date || ev.date) === c.date);
    if (dup) msgs.push('You already sent this item to this assessor for the same date.');
    fill(warnEl, msgs.map(m => h('p', { class: 'e-warn-note' }, m)));
    const w = identifierWarning(c.notes);
    noteWarn.textContent = w || ''; noteWarn.hidden = !w;
  }

  const sendBtn = h('button', { type: 'submit', class: 'n-btn e-go e-btn-big', disabled: F.sending }, F.sending ? 'Sending…' : 'Send request');
  const form = h('form', { class: 'e-card', novalidate: true, onsubmit: e => { e.preventDefault(); send(); } },
    h('div', { class: 'e-rq-field' }, h('label', { class: 'e-label', for: 'rq-date' }, 'Date of case'), date, err('date')),
    h('div', { class: 'e-rq-field' }, h('span', { class: 'e-label', id: 'rq-loc-l' }, 'Location'), locChips, locInput, err('location')),
    h('div', { class: 'e-rq-field' }, h('label', { class: 'e-label', for: 'rq-initials' }, 'Patient initials'), initials,
      h('p', { class: 'e-hint', id: 'rq-initials-hint' }, 'Initials only (max 3 letters). No names or record numbers.'), err('initials')),
    h('div', { class: 'e-rq-field' }, h('span', { class: 'e-label', id: 'rq-age-l' }, 'Age'), chips('rq-age', AGE_BANDS, 'ageBand', { label: 'rq-age-l' }), err('ageBand')),
    h('div', { class: 'e-rq-field' }, h('span', { class: 'e-label', id: 'rq-gender-l' }, 'Gender'), chips('rq-gender', GENDERS, 'gender', { label: 'rq-gender-l' }), err('gender')),
    co ? h('div', { class: 'e-rq-field' }, co, err('coManaged')) : null,
    h('div', { class: 'e-rq-field' }, h('label', { class: 'e-label', for: 'rq-notes' }, 'Note to assessor (optional)'), notes, noteWarn),
    warnEl,
    F.error ? h('p', { class: 'e-alert', role: 'alert' }, F.error) : null,
    h('div', { class: 'e-rq-sendbar' }, sendBtn));

  async function send() {
    if (F.sending) return;
    const miss = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date)) { showErr('date', 'Choose the date'); miss.push(date); }
    else if (c.date > todayISO()) { showErr('date', 'The date can’t be in the future'); miss.push(date); }
    if (!c.location) { showErr('location', 'Choose or type a location'); miss.push(locInput); }
    if (!c.initials) { showErr('initials', 'Enter the patient’s initials'); miss.push(initials); }
    if (!c.ageBand) { showErr('ageBand', 'Choose an age band'); miss.push(form.querySelector('[name=rq-age]')); }
    if (!c.gender) { showErr('gender', 'Choose one'); miss.push(form.querySelector('[name=rq-gender]')); }
    if (it.tool === 'EBD' && !c.coManaged) { showErr('coManaged', 'Only an assessor who co-managed the case can do an EBD'); miss.push(co.querySelector('input')); }
    if (identifierWarning(c.notes)) miss.push(notes);
    if (miss.length) { miss[0].focus(); miss[0].scrollIntoView({ block: 'center' }); return; }
    F.sending = true; F.error = '';
    sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
    const res = S.roles.resident;
    const request = { date: c.date, location: c.location, initials: c.initials, ageBand: c.ageBand, gender: c.gender };
    if (it.tool === 'EBD') request.coManaged = true;
    if (c.notes.trim()) request.notes = c.notes.trim();
    const ev = {
      id: F.id, rid: String(res.rid), residentEmail: me(), residentName: res.name || S.user.name || me(),
      assessorEmail: F.assessor.email, assessorName: F.assessor.name,
      formId: it.formId, formVersion: 1, catalogueVersion: CATALOGUE_VERSION,
      itemId: it.id, itemText: it.text, tool: it.tool, epa: it.epa, level: it.level ?? null,
      caseKey: caseKey(c.date, c.initials), date: c.date, status: 'requested', request, createdAt: Date.now(),
    };
    try {
      F.sent = await cloud.createEvaluation(ev);
      if (!S.mine.some(x => x.id === ev.id)) S.mine = [F.sent, ...S.mine];
      F.sending = false;
      F.offline = !navigator.onLine;
      history.replaceState({ evStep: 4 }, '', location.href);
      setStep(4, { push: false });
    } catch (e) {
      F.sending = false;
      F.error = e?.code === 'permission-denied'
        ? `Not sent: ${F.assessor?.name || 'this assessor'} is not on the active faculty list. Choose another assessor, or ask the PD to add them.`
        : 'Not sent: ' + (e.message || e) + '. Check your signal and try again.';
      paint();
    }
  }

  setTimeout(checkWarnings, 0);
  return [stepHead(3, 'The case'), chosenItem(), chosenAssessor(), form];
}

// Step 4: share (QR, share sheet, copy) and "another EPA on the same case".
function stepShare() {
  const ev = F.sent;
  return [
    h('div', { class: 'e-card' },
      h('div', { class: 'e-rq-done-head' }, icon('check'),
        h('div', {}, h('h2', { class: 'e-h3', style: 'margin:0' }, F.offline ? 'Saved: sends when online' : 'Request sent'),
          h('p', { class: 'e-small e-muted', style: 'margin:0' }, `${toolLabel(ev.tool)} · ${ev.assessorName}`)))),
    sharePanel(ev),
    h('div', { class: 'e-stack' },
      h('button', { type: 'button', class: 'n-btn n-btn--secondary e-btn-big', onclick: anotherEPA }, 'Assess this case for another EPA'),
      h('div', { class: 'e-actions' },
        h('a', { class: 'n-btn n-btn--outline e-btn-quiet', href: '#r/' + encodeURIComponent(ev.id), onclick: e => { e.preventDefault(); leave('r/' + ev.id); } }, 'View request'),
        h('button', { type: 'button', class: 'n-btn', onclick: () => leave('home') }, 'Done'))),
  ];
}

// Same case card (date, place, initials, age, gender), same assessor; pick another item.
function anotherEPA() {
  const keep = { ...F.card, coManaged: false, notes: '' };
  const assessor = F.assessor;
  startFlow({ step: 1 });
  F.card = keep;
  F.assessor = assessor;
  history.replaceState({ evStep: 1 }, '', location.href);
  paint();
  window.scrollTo(0, 0);
}
