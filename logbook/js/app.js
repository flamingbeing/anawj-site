// APMES Logbook: boot, sign-in, tabs and offline support. Each screen lives in its own ui-*.js file;
// shared state and helpers are in ui-core.js. Case data comes from cloud.js (Firestore, or the
// in-browser demo backend with ?demo).

import { S, hooks, h, toast, cloud, setCases, scheduleSummary, fill, resetCaches, confirmBox } from './ui-core.js';
import { renderLog, logCasesChanged, clearDrafts } from './ui-log.js';
import { renderLogbook } from './ui-logbook.js';
import { renderProgress, renderTotals } from './ui-progress.js';
import { applyCompact, cachedCompact, applyTheme, cachedTheme, applyTextSize, cachedTextSize, renderSettings } from './ui-settings.js';
import { renderAccount, flush as flushProfile } from './ui-account.js';
import { renderAdmin, leaveAdmin } from './ui-admin.js';
import { renderReflect, watchMyReflections } from './ui-reflect.js';
import { purgeExpired } from './bin.js';

// Tab icons: tiny inline SVG paths (24x24, stroked), so they look the same on every phone.
const ICONS = {
  log: 'M12 5v14M5 12h14',
  logbook: 'M4 5h16M4 10h16M4 15h16M4 20h10',
  progress: 'M5 20V12M10 20V6M15 20v-9M20 20V9',
  totals: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
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
  { id: 'settings', label: 'Settings', render: renderSettings },
  // not in the bar: admins open it from Settings → Admin
  { id: 'admin', label: 'Admin', render: renderAdmin, admin: true, hidden: true, under: 'settings' },
];

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const whoEl = document.getElementById('who');
const subEl = document.getElementById('sub');
const banner = document.getElementById('banner');

// ---------- tabs and routing (#log, #logbook, ...) ----------

// Totals (names and counts of programme residents) is for the programme only; the rules agree.
const visibleTabs = () => TABS.filter(t => (!t.admin || S.admin) && (t.id !== 'totals' || S.admin || S.pd || S.resident));
const TAB_ALIASES = { reflections: 'reflect' };
const tabFromHash = () => {
  const raw = location.hash.replace(/^#/, '');
  const id = TAB_ALIASES[raw] || raw;
  if (!visibleTabs().some(t => t.id === id)) return null;
  if (id !== raw) history.replaceState(null, '', location.pathname + location.search + '#' + id);   // old links: #reflections → #reflect
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
  if (S.tab === 'admin') leaveAdmin();
  S.tab = id;
  history.replaceState(null, '', location.pathname + location.search + '#' + id);
  window.scrollTo(0, 0);
  render();
}
// Enter/Space on a span chip with role=button acts like a tap (real buttons and catChip handle their own)
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || (e.key !== 'Enter' && e.key !== ' ')) return;
  const t = e.target;
  if (t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') { e.preventDefault(); t.click(); }
});
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

// The header is always one line (title left, name right), so it never changes height between
// loading, signed out and signed in. Demo / offline show as a small tag beside the name.
function paintWho() {
  const flags = [cloud.demo ? 'demo' : '', navigator.onLine ? '' : 'offline'].filter(Boolean).join(' · ');
  subEl.textContent = flags;   // kept (hidden) for tests
  if (!S.user) { fill(whoEl, flags ? h('span', { class: 'who-flag' }, flags) : null); return; }
  document.body.dataset.cases = String(S.cases.length);   // not shown; read by tests
  fill(whoEl, flags ? h('span', { class: 'who-flag' }, flags) : null, h('span', { class: 'email', title: S.user.email }, S.user.name || S.user.email));
}
window.addEventListener('online', paintWho);
window.addEventListener('offline', paintWho);

// ---------- signed out ----------

function renderLanding(error) {
  tabsEl.hidden = true;
  const demoHref = location.pathname + '?demo';
  fill(app, h('div', { class: 'landing' },
    h('img', { src: 'icons/icon-192.png', alt: '' }),
    h('p', { class: 'muted', style: 'margin:0' }, 'Case log for APMES anaesthesia residents'),
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

// Last-seen admin / PD / programme entry / shared templates per account, so the next start needn't wait
// for the server. Wiped at sign-out (a shared device keeps nothing of the last person).
const WHO_KEY = 'apmes-logbook-who:';
const whoKey = email => WHO_KEY + (cloud.demo ? 'demo:' : '') + String(email || '').toLowerCase();
function readWho(email) { try { return JSON.parse(localStorage.getItem(whoKey(email)) || 'null'); } catch { return null; } }
function saveWho(email, w) { try { localStorage.setItem(whoKey(email), JSON.stringify(w)); } catch { /* storage blocked */ } }
function forgetWho() { try { for (const k of Object.keys(localStorage)) if (k.startsWith(WHO_KEY)) localStorage.removeItem(k); } catch { /* ignore */ } }
// the server's answers after a fast start: update what changed without disturbing someone typing
function refreshWho(user, who, firstLogbook) {
  who().then(async w => {
    if (S.user !== user) return;
    saveWho(user.email, w);
    const before = JSON.stringify([S.admin, S.pd, S.resident, S.sharedTemplates]);
    Object.assign(S, { admin: !!w.admin, pd: !!w.pd, resident: w.resident || null, sharedTemplates: w.sharedTemplates || [] });
    // the logbook (templates, settings) from the server, unless it was changed here meanwhile
    const lb = await cloud.loadLogbook(user.email).catch(() => null);
    if (S.user !== user) return;
    let lbChanged = false;
    if (lb && S.logbook === firstLogbook && JSON.stringify(lb) !== JSON.stringify(firstLogbook)) {
      S.logbook = lb; lbChanged = true;
      applyCompact(lb.settings && lb.settings.compact); applyTheme(lb.settings && lb.settings.theme); applyTextSize(lb.settings && lb.settings.textSize);
    }
    if (!lbChanged && before === JSON.stringify([S.admin, S.pd, S.resident, S.sharedTemplates])) return;
    const typing = document.activeElement && /^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement.tagName);
    if (!typing && !document.querySelector('dialog[open]')) render(); else paintTabs();
  }).catch(err => console.warn('Refresh failed', err));
}
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
    Object.assign(S, { admin: false, pd: false, resident: null, logbook: null, cases: [], reflections: [], counts: {}, casesLoaded: false, casesSynced: false, sharedTemplates: [] });
    if (signedInOnce) { clearDrafts(); resetCaches(); forgetWho(); applyCompact(false); applyTheme('light'); applyTextSize('1'); }   // a shared device starts plain for the next person
    paintWho();
    renderLanding();
    return;
  }
  signedInOnce = true;
  paintWho();
  fill(app, h('p', { class: 'empty' }, 'Loading your logbook…'));
  // Fast start: the Log screen opens from this device's copies (the logbook from the offline cache;
  // admin / PD / programme entry / shared templates as last seen, in localStorage) and the server's
  // answers replace them in the background. Only a first sign-in on a device waits for the server.
  const who = () => Promise.all([
    cloud.isAdmin(user.email).catch(() => false),
    cloud.myResident(user.email).catch(() => null),
    cloud.listSharedTemplates().catch(() => []),
    cloud.isPD(user.email).catch(() => false),
  ]).then(([admin, resident, shared, pd]) => ({ admin, resident, sharedTemplates: shared || [], pd }));
  try {
    const known = readWho(user.email);
    const [logbook, w] = await Promise.all([cloud.loadLogbook(user.email, { cached: true }), known ? Promise.resolve(known) : who()]);
    if (S.user !== user) return; // signed out meanwhile
    reloadFlag('');
    Object.assign(S, { admin: !!w.admin, pd: !!w.pd, resident: w.resident || null, logbook, sharedTemplates: w.sharedTemplates || [] });
    if (!known) saveWho(user.email, w);
    else refreshWho(user, who, logbook);
    applyCompact(logbook.settings && logbook.settings.compact);   // per-user display settings
    applyTheme(logbook.settings && logbook.settings.theme);
    applyTextSize(logbook.settings && logbook.settings.textSize);
    const resident = S.resident;
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

// Phones: while the keyboard is up (a text box has focus and the visible area has shrunk), the bottom
// tab bar rides on top of the keyboard instead of being hidden behind it (iOS, and Android by default,
// leave fixed bars at the bottom of the layout, under the keyboard), and the Save bar unsticks so the
// suggestions show (style.css, body.typing, --kb).
const typingEl = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|number|)$/.test(el.type)));
let fullH = 0, fullW = 0;   // the tallest visible area seen at this width (keyboard down)
function keyboardCheck() {
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (window.innerWidth !== fullW) { fullW = window.innerWidth; fullH = 0; }   // rotated
  fullH = Math.max(fullH, vh);
  const typing = !!typingEl(document.activeElement) && vh < fullH * 0.75;
  document.body.classList.toggle('typing', typing);
  // how far the keyboard covers the bottom of the layout viewport
  const vv = window.visualViewport;
  const kb = typing && vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  document.documentElement.style.setProperty('--kb', kb + 'px');
}
keyboardCheck();
document.addEventListener('focusin', keyboardCheck);
document.addEventListener('focusout', () => setTimeout(keyboardCheck, 0));
(window.visualViewport || window).addEventListener('resize', keyboardCheck);
if (window.visualViewport) window.visualViewport.addEventListener('scroll', keyboardCheck);

// ---------- offline: service worker and "update available" ----------

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let reloading = false;
  // the first install also takes control (clients.claim): no reload then, only after an update
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !hadController) return; reloading = true; location.reload(); });
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

applyTheme(cachedTheme());   // first paint; corrected once the logbook loads
applyTextSize(cachedTextSize());
if (cachedCompact()) document.body.classList.add('compact');   // first paint; corrected once the logbook loads
paintWho();
if (cloud.demo) {
  banner.className = 'banner warn';
  fill(banner, h('span', {}, 'Demo: made-up data, stored only in this browser.'),
    h('button', { class: 'small', onclick: async () => {
      if (!(await confirmBox('Reset demo', 'Delete everything you added in the demo (cases, reflections, images, settings) and start again with the made-up data? The uploaded portfolio template is kept.', 'Reset', true))) return;
      clearDrafts(); resetCaches(); forgetWho(); applyCompact(false); applyTheme('light'); applyTextSize('1');
      cloud.resetDemo();
      location.reload();
    } }, 'Reset demo'),
    h('a', { href: location.pathname, class: 'btn small' }, 'Leave demo'));
  banner.hidden = false;
}
if (!cloud.enabled) renderLanding();
else cloud.watchUser(onUser).catch(err => renderLanding('Could not start sign-in: ' + err.message));
registerSW();
