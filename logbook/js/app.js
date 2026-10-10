// APMES Logbook: boot, sign-in, tabs and offline support. Each screen lives in its own ui-*.js file;
// shared state and helpers are in ui-core.js. Case data comes from cloud.js (Firestore, or the
// in-browser demo backend with ?demo).

import { S, hooks, h, toast, cloud, setCases, scheduleSummary, fill, resetCaches } from './ui-core.js';
import { renderLog, logCasesChanged, clearDrafts } from './ui-log.js';
import { renderLogbook } from './ui-logbook.js';
import { renderProgress, renderTotals } from './ui-progress.js';
import { applyCompact, cachedCompact } from './ui-settings.js';
import { renderAccount, flush as flushProfile } from './ui-account.js';
import { renderAdmin } from './ui-admin.js';
import { renderReflect, watchMyReflections } from './ui-reflect.js';
import { purgeExpired } from './bin.js';

// Tab icons: tiny inline SVG paths (24x24, stroked), so they look the same on every phone.
const ICONS = {
  log: 'M12 5v14M5 12h14',
  logbook: 'M4 5h16M4 10h16M4 15h16M4 20h10',
  progress: 'M5 20V12M10 20V6M15 20v-9M20 20V9',
  totals: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  reflect: 'M4 19.5V5a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2.5zM6 21h12v-4M8 7h6M8 11h4',
  admin: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
};
const icon = id => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ico'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[id]);
  svg.append(path);
  return svg;
};

const TABS = [
  { id: 'log', label: 'Log', render: renderLog },
  { id: 'logbook', label: 'Logbook', render: renderLogbook },
  { id: 'reflect', label: 'Reflections', render: renderReflect },
  { id: 'progress', label: 'Progress', render: renderProgress },
  { id: 'totals', label: 'Totals', render: renderTotals },
  { id: 'account', label: 'Account', render: renderAccount },
  // not in the bar (keeps it at 6 on phones): admins reach it from Account → Admin
  { id: 'admin', label: 'Admin', render: renderAdmin, admin: true, hidden: true, under: 'account' },
];

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const whoEl = document.getElementById('who');
const subEl = document.getElementById('sub');
const banner = document.getElementById('banner');

// ---------- tabs and routing (#log, #logbook, ...) ----------

// Totals (names and counts of programme residents) is for the programme only; the rules agree.
const visibleTabs = () => TABS.filter(t => (!t.admin || S.admin) && (t.id !== 'totals' || S.admin || S.resident));
const TAB_ALIASES = { reflections: 'reflect', settings: 'account' };
const tabFromHash = () => {
  const raw = location.hash.replace(/^#/, '');
  const id = TAB_ALIASES[raw] || raw;
  if (!visibleTabs().some(t => t.id === id)) return null;
  if (id !== raw) history.replaceState(null, '', location.pathname + location.search + '#' + id);   // old links: #settings → #account
  return id;
};

function paintTabs() {
  const cur = TABS.find(t => t.id === S.tab);
  const sel = (cur && cur.under) || S.tab;
  fill(tabsEl, ...visibleTabs().filter(t => !t.hidden).map(t => h('button', {
    role: 'tab', 'aria-selected': String(sel === t.id), 'data-tab': t.id,
    onclick: () => go(t.id),
  }, icon(t.id), h('span', { class: 'lbl' }, t.label))));
  tabsEl.hidden = false;
}

function go(id) {
  if (S.tab === id) { if (id === 'log') document.querySelector('textarea.details')?.focus(); return; }
  if (S.tab === 'account') flushProfile();
  S.tab = id;
  history.replaceState(null, '', location.pathname + location.search + '#' + id);
  window.scrollTo(0, 0);
  render();
}
window.addEventListener('hashchange', () => { const t = tabFromHash(); if (t && t !== S.tab) { S.tab = t; render(); } });

function render() {
  if (!S.user) return;
  paintTabs();
  const tab = visibleTabs().find(t => t.id === S.tab) || TABS[0];
  S.tab = tab.id;
  const y = window.scrollY;
  fill(app, tab.render());
  if (tab.id !== 'log') window.scrollTo(0, y);
}
hooks.render = render;

// A live case update shouldn't yank the screen from under someone typing: the Log screen refreshes
// its counts in place; other screens re-render when nothing is being edited.
let pendingRender = false;
hooks.casesChanged = () => {
  paintWho();
  if (S.tab === 'log') return logCasesChanged();
  if (S.tab === 'account' || S.tab === 'admin' || S.tab === 'totals') return;
  pendingRender = true;
  setTimeout(flushRender, 250);
};
function flushRender() {
  if (!pendingRender) return;
  const a = document.activeElement;
  const editing = document.querySelector('dialog[open]') || (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  if (editing) { setTimeout(flushRender, 1000); return; }
  pendingRender = false;
  render();
}

// ---------- header ----------

function paintWho() {
  if (!S.user) { fill(whoEl); subEl.hidden = false; subEl.textContent = 'Case log for APMES anaesthesia residents'; return; }
  // signed in: no case count (keeps the header compact); only flag demo / offline, and hide the line otherwise
  subEl.textContent = [cloud.demo ? 'demo' : '', navigator.onLine ? '' : 'offline'].filter(Boolean).join(' · ');
  subEl.hidden = !subEl.textContent;
  document.body.dataset.cases = String(S.cases.length);   // not shown; read by tests
  fill(whoEl, h('span', { class: 'email', title: S.user.email }, S.user.name || S.user.email));
}
window.addEventListener('online', paintWho);
window.addEventListener('offline', paintWho);

// ---------- signed out ----------

function renderLanding(error) {
  tabsEl.hidden = true;
  const demoHref = location.pathname + '?demo';
  fill(app, h('div', { class: 'landing' },
    h('img', { src: 'icons/icon-192.png', alt: '' }),
    h('h2', {}, 'Log a case in seconds'),
    h('p', {}, 'Type the initials and case, tap the suggested categories, save. Your progress against the APMES targets updates as you go.'),
    h('ul', {},
      h('li', {}, 'Category suggestions from what you type (age, BMI, procedure).'),
      h('li', {}, 'Works offline on your phone; syncs when you are back online.'),
      h('li', {}, 'Progress by category and EPA; Excel download any time.'),
      h('li', {}, 'Private: only you and the programme admins can see your cases.')),
    error ? h('p', { class: 'tip' }, error) : null,
    cloud.enabled ? h('div', { class: 'cta' },
      h('button', { class: 'primary big', onclick: signIn }, 'Sign in with Google'),
      cloud.demo ? null : h('a', { class: 'btn', href: demoHref }, 'Try the demo')) : h('p', { class: 'tip' }, 'Sign-in is not configured.'),
    h('p', { style: 'font-size:13px' }, 'Anyone with a Google account can keep a private logbook. APMES residents on the programme list also appear on the shared totals (counts only), which only the programme can see.')));
}

async function signIn() {
  try { await cloud.signIn(); }
  catch (err) { renderLanding('Sign-in failed: ' + (err && err.message || err)); }
}

// ---------- signed in ----------

let unwatch = null, unwatchRefl = null, signedInOnce = false;
// set before reloading for a closed Firestore client, so a persistent failure can't loop
function reloadFlag(v) {
  try { if (v === undefined) return sessionStorage.getItem('reloadedAfterTerminate'); if (v) sessionStorage.setItem('reloadedAfterTerminate', v); else sessionStorage.removeItem('reloadedAfterTerminate'); }
  catch (e) { return v === undefined ? '1' : undefined; }   // storage blocked: never auto-reload
}

async function onUser(user) {
  if (unwatch) { unwatch(); unwatch = null; }
  if (unwatchRefl) { unwatchRefl(); unwatchRefl = null; }
  S.user = user;
  if (!user) {
    Object.assign(S, { admin: false, resident: null, logbook: null, cases: [], reflections: [], counts: {}, casesLoaded: false, casesSynced: false, sharedTemplates: [] });
    if (signedInOnce) { clearDrafts(); resetCaches(); applyCompact(false); }   // a shared device starts plain for the next person
    paintWho();
    renderLanding();
    return;
  }
  signedInOnce = true;
  paintWho();
  fill(app, h('p', { class: 'empty' }, 'Loading your logbook…'));
  try {
    const [admin, resident, logbook, shared] = await Promise.all([
      cloud.isAdmin(user.email).catch(() => false),
      cloud.myResident(user.email).catch(() => null),
      cloud.loadLogbook(user.email),
      cloud.listSharedTemplates().catch(() => []),
    ]);
    if (S.user !== user) return; // signed out meanwhile
    reloadFlag('');
    Object.assign(S, { admin, resident, logbook, sharedTemplates: shared || [] });
    applyCompact(logbook.settings && logbook.settings.compact);   // per-user display setting
    if (!logbook.name && (resident?.name || user.name)) S.logbook.name = resident?.name || user.name;
    // a programme resident's logbook remembers their rid (used by admins and the rules)
    if (resident && logbook.rid !== resident.rid) cloud.saveLogbook(user.email, { rid: resident.rid }).catch(() => {});
  } catch (err) {
    // a Firestore client closed by an earlier sign-out can't be reused: start the page afresh (once)
    if (/terminated/i.test(err.message) && !reloadFlag()) { reloadFlag('1'); location.reload(); return; }
    fill(app, h('p', { class: 'empty' }, 'Could not load your logbook: ' + err.message), h('p', { class: 'empty' }, h('button', { onclick: () => onUser(user) }, 'Try again')));
    return;
  }
  S.tab = tabFromHash() || 'log';
  // recycle bin: drop entries older than 30 days, but only once the reflections are loaded, so an
  // image still used by a live (e.g. restored) reflection is never deleted with an old bin entry
  { let done = false, stop = null;
    stop = cloud.watchReflections(user.email, (list, meta = {}) => {
      if (done || meta.fromCache) return;   // wait for the server's copy, not a possibly stale offline cache
      done = true; if (stop) stop();
      S.reflections = list; purgeExpired().catch(err => console.warn('Recycle bin purge failed', err));
    }); if (done && stop) stop(); }
  unwatchRefl = watchMyReflections(user.email);
  let sig = '';
  unwatch = cloud.watchCases(user.email, (cases, meta = {}) => {
    const first = !S.casesLoaded;
    if (!meta.fromCache) S.casesSynced = true;
    // metadata-only updates (write acknowledged, cache -> server) need no re-render
    const next = cases.map(c => c.id + ':' + (c.updatedAt || 0)).join();
    if (!first && next === sig) { scheduleSummary(); return; }
    sig = next;
    setCases(cases);
    if (first) { paintWho(); render(); scheduleSummary(); } else { hooks.casesChanged(); scheduleSummary(); }
  });
  render();
}

// Phones: while the keyboard is up (a text box has focus and the visible area has shrunk), hide the
// bottom tab bar and unstick the Save bar so the suggestions show (style.css, body.typing).
const typingEl = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|number|)$/.test(el.type)));
let fullH = 0, fullW = 0;   // the tallest visible area seen at this width (keyboard down)
function keyboardCheck() {
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (window.innerWidth !== fullW) { fullW = window.innerWidth; fullH = 0; }   // rotated
  fullH = Math.max(fullH, vh);
  document.body.classList.toggle('typing', !!typingEl(document.activeElement) && vh < fullH * 0.75);
}
keyboardCheck();
document.addEventListener('focusin', keyboardCheck);
document.addEventListener('focusout', () => setTimeout(keyboardCheck, 0));
(window.visualViewport || window).addEventListener('resize', keyboardCheck);

// ---------- offline: service worker and "update available" ----------

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => {
      banner.className = 'banner';
      fill(banner, h('span', {}, 'Update available'), h('button', { class: 'small primary', onclick: () => { banner.hidden = true; w.postMessage('skipWaiting'); } }, 'Reload'));
      banner.hidden = false;
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    // check for a new version when the app comes back to the foreground
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(err => console.warn('Service worker not registered', err));
}

// ---------- boot ----------

if (cloud.onSyncError) cloud.onSyncError(err => toast('A change could not be synced: ' + (err.message || err)));

if (cachedCompact()) document.body.classList.add('compact');   // first paint; corrected once the logbook loads
paintWho();
if (cloud.demo) {
  banner.className = 'banner warn';
  fill(banner, h('span', {}, 'Demo: made-up data, stored only in this browser.'), h('a', { href: location.pathname, class: 'btn small' }, 'Leave demo'));
  banner.hidden = false;
}
if (!cloud.enabled) renderLanding();
else cloud.watchUser(onUser).catch(err => renderLanding('Could not start sign-in: ' + err.message));
registerSW();
