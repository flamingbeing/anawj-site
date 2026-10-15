// APMES Evals: boot, sign-in, roles, tabs, hash routing and offline support. Each screen lives in its
// own ui-*.js file and is loaded on first use; shared state and helpers are in ui-core.js.
// Data comes from cloud.js (Firestore, or the in-browser demo backend with ?demo).

import { S, hooks, h, fill, toast, cloud, icon, initials, go, isResident, isFaculty, isStaff, hasRole, pruneDrafts, signOutSafely, confirmBox, needsAction, applyTheme, errText, linkAccount, inAppBrowser, openInBrowserCard, wrongAccountCard } from './ui-core.js';

applyTheme();   // also keeps the browser's theme-color in step with the page

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const backEl = document.getElementById('back');
const meEl = document.getElementById('me');
const banner = document.getElementById('banner');

// ---------- routes ----------
// mod: screen module (lazy); fn: its render function, called with the hash argument.

const ROUTES = {
  home: { mod: 'ui-home', fn: 'renderHome', title: 'Home', ok: isResident },
  new: { mod: 'ui-request', fn: 'renderNew', title: 'New request', ok: isResident, bare: true },
  requests: { mod: 'ui-requests', fn: 'renderRequests', title: 'Requests', ok: isResident },
  r: { mod: 'ui-result', fn: 'renderResult', title: 'Evaluation', back: true },
  progress: { mod: 'ui-progress', fn: 'renderProgress', title: 'Progress', ok: isResident },
  summary: { mod: 'ui-progress', fn: 'renderSummary', title: 'My record', back: true, ok: isResident },
  pending: { mod: 'ui-pending', fn: 'renderPending', title: 'Evaluations', ok: () => isFaculty() || S.assigned.length > 0 },
  e: { mod: 'ui-form', fn: 'renderForm', title: 'Evaluation', back: true, bare: true },
  overview: { mod: 'ui-admin', fn: 'renderOverview', title: 'Overview', ok: isStaff },
  people: { mod: 'ui-admin', fn: 'renderPeople', title: 'People', ok: isStaff },
  more: { mod: 'ui-more', fn: 'renderMore', title: 'More' },
  how: { mod: 'ui-more', fn: 'renderHow', title: 'How evals work', back: true },
};

// Tabs = union of roles, fixed order. Requests/Evaluations carry a count badge.
const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'requests', label: 'Requests', icon: 'list', badge: () => S.mine.filter(ev => needsAction(ev)).length },
  { id: 'progress', label: 'Progress', icon: 'chart' },
  { id: 'pending', label: 'Evaluations', icon: 'clipboard', badge: () => pendingForMe().length },
  { id: 'overview', label: 'Overview', icon: 'chart' },
  { id: 'people', label: 'People', icon: 'users' },
  { id: 'more', label: 'More', icon: 'more' },
];
const pendingForMe = () => S.assigned.filter(ev => ev.status === 'requested' && ev.residentEmail !== S.user?.email);
const allowed = id => { const r = ROUTES[id]; return !!r && (!r.ok || r.ok()); };
const visibleTabs = () => TABS.filter(t => allowed(t.id));

function defaultRoute() {
  if (isResident()) return 'home';
  if (isFaculty() || S.assigned.length) return 'pending';
  if (isStaff()) return 'overview';
  return 'more';
}

function parseHash() {
  let raw = location.hash.replace(/^#\/?/, '');
  try { raw = decodeURIComponent(raw); } catch { /* a malformed link: use it as typed */ }
  const i = raw.indexOf('/');
  return i < 0 ? { route: raw, arg: null } : { route: raw.slice(0, i), arg: raw.slice(i + 1) || null };
}

// ---------- tabs ----------

function paintTabs() {
  const sel = S.route === 'new' ? 'home' : S.route === 'summary' ? 'progress' : S.route === 'r' ? (isResident() ? 'requests' : 'pending') : S.route === 'e' ? 'pending' : S.route;
  const tabs = visibleTabs();
  fill(tabsEl, tabs.map(t => {
    const n = t.badge ? t.badge() : 0;
    // the app kit's tab bar: icon, short label, red count badge
    return h('a', {
      href: '#' + t.id, class: 'e-tab', 'aria-current': sel === t.id ? 'page' : null,
      'aria-label': n ? `${t.label}, ${n} need${n === 1 ? 's' : ''} action` : null,
    }, icon(t.icon), h('span', { class: 'e-tab__label' }, t.label),
      n ? h('span', { class: 'a-badge e-badge' }, n > 99 ? '99+' : n) : null);
  }));
  tabsEl.hidden = !S.user || !hasRole() || tabs.length < 2;
  // the home-screen icon's badge (installed app, where supported): what needs you, as on the tabs
  try {
    const total = tabs.reduce((n, t) => n + (t.badge ? t.badge() : 0), 0);
    if (navigator.setAppBadge) (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {});
  } catch {}
  document.body.classList.toggle('e-nonav', tabsEl.hidden || !!(ROUTES[S.route] && ROUTES[S.route].bare));
}

// ---------- header ----------

function paintHeader(title) {
  titleEl.textContent = title || 'APMES Evals';
  // the browser tab / app switcher / screen reader name the screen too (WCAG 2.4.2)
  document.title = title && title !== 'APMES Evals' ? `${title} · APMES Evals` : 'APMES Evals';
  const bits = [];
  if (cloud.demo) bits.push('Demo');
  if (!navigator.onLine) bits.push('Offline');
  subEl.textContent = bits.join(' · ');
  subEl.hidden = !bits.length;
  syncSub();
  backEl.hidden = !(S.user && ROUTES[S.route] && (ROUTES[S.route].back || ROUTES[S.route].bare));
  if (S.user) fill(meEl, h('a', { href: '#more', class: 'a-bar-btn e-appbar__me', title: S.user.email, 'aria-label': 'Account and settings' }, h('span', { class: 'a-avatar', 'aria-hidden': 'true' }, initials(S.user.name || S.user.email))));
  else fill(meEl);
}
// Offline under the screen's large title too (the demo has its banner)
function syncSub() {
  const big = app.querySelector(':scope > .e-titlebox .a-subtitle');
  if (big) { big.textContent = 'Offline'; big.hidden = navigator.onLine !== false; }
}
// Back: the previous in-app screen, or the role's default screen when the link was opened directly.
let navCount = 0;
backEl.addEventListener('click', () => { if (navCount > 0) history.back(); else go(defaultRoute()); });
window.addEventListener('online', () => paintHeader(titleEl.textContent));
window.addEventListener('offline', () => paintHeader(titleEl.textContent));

// ---------- rendering ----------

const mods = {};
async function loadModule(name) {
  if (!mods[name]) mods[name] = import(`./${name}.js`).catch(err => { delete mods[name]; throw err; });
  return mods[name];
}

let renderSeq = 0, lastKey = '';
async function render() {
  const seq = ++renderSeq;
  if (!S.user) return;
  if (!S.rolesLoaded) return;
  const { route, arg } = parseHash();
  let id = route;
  if (!hasRole()) {
    // signed in with no role yet: apply as resident or faculty (More stays reachable for sign-out)
    S.route = id === 'more' ? 'more' : 'apply'; S.arg = null;
    paintTabs();
    if (S.route === 'apply') { paintHeader('Welcome'); fill(app, titleBox('Welcome'), renderApply()); window.aRefreshBar?.(); return; }
  } else if (!ROUTES[id] || !allowed(id)) {
    id = defaultRoute();
    history.replaceState(history.state, '', location.pathname + location.search + '#' + id);
    S.route = id; S.arg = null;
  } else { S.route = id; S.arg = arg; }
  const r = ROUTES[S.route];
  paintTabs();
  paintHeader(r.title);
  const key = S.route + '/' + (S.arg || '');
  const sameScreen = key === lastKey;
  const y = window.scrollY;
  let node;
  try {
    const mod = await loadModule(r.mod);
    if (seq !== renderSeq) return;
    if (typeof mod[r.fn] !== 'function') throw new Error(`${r.mod}.${r.fn} missing`);
    node = await mod[r.fn](S.arg);
  } catch (err) {
    console.warn('Screen not available', err);
    node = placeholder(r.title, err);
  }
  if (seq !== renderSeq) return;
  const wasKey = lastKey;
  lastKey = key;
  // the app kit's large title starts each screen (the form has its own heading)
  const big = S.route === 'e' ? null : titleBox(r.title);
  const paint = () => {
    if (seq !== renderSeq) return;   // a newer screen was asked for while this one slid in
    fill(app, big, node);
    syncSub();
    if (sameScreen) window.scrollTo(0, y); else window.scrollTo(0, 0);
    // a new screen: move focus to its heading (or the title), so keyboard and screen-reader users
    // start there rather than at the top of the page
    if (!sameScreen && wasKey) {
      const t = app.querySelector('h1, .e-h1, .e-h2') || titleEl;
      if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
      t.focus({ preventScroll: true });
    }
  };
  // screens opened from a list slide in from the right, and back from the left (a native navigation stack);
  // tab changes and repaints don't move. A CSS animation on the new content rather than the kit's aGo() (a view
  // transition), which leaves the page deaf to taps while it runs.
  const pushed = !!(r.back || r.bare);
  const slide = !sameScreen && wasKey && pushed !== lastPushed;
  lastPushed = pushed;
  paint();
  window.aRefreshBar?.();
  if (slide) {
    app.classList.remove('e-push', 'e-pop');
    void app.offsetWidth;   // restart the animation
    app.classList.add(pushed ? 'e-push' : 'e-pop');
  }
}
app.addEventListener('animationend', e => { if (e.target === app) app.classList.remove('e-push', 'e-pop'); });
let lastPushed = false;
function titleBox(title) {
  return h('div', { class: 'e-titlebox' }, h('h1', { class: 'a-title' }, title || 'APMES Evals'), h('p', { class: 'a-subtitle', hidden: true }));
}
hooks.render = () => { pendingRender = false; return render(); };

function placeholder(title, err) {
  return h('div', { class: 'e-empty' },
    icon('info', 'e-empty__icon'),
    h('p', { class: 'e-empty__title' }, `${title} is not ready yet`),
    h('p', {}, navigator.onLine ? 'This part of the app is still being built.' : 'Opens when you have signal.'),
    h('button', { class: 'a-btn', onclick: () => render() }, 'Try again'),
    err && /Failed to fetch|import/i.test(String(err.message)) ? null : h('p', { class: 'e-small' }, String(err && err.message || '')));
}

window.addEventListener('hashchange', () => { navCount++; pendingRender = false; render(); });

// A live update shouldn't yank the screen from under someone typing: the form and the request flow
// keep their own state (no repaint); other screens repaint once nothing is being edited.
let pendingRender = false;
hooks.dataChanged = () => {
  paintTabs();   // badges
  if (S.route === 'apply' && hasRole()) { render(); return; }   // e.g. inactive faculty with open requests
  if (S.route === 'e' || S.route === 'new' || S.route === 'apply') return;
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

// ---------- signed out ----------

function renderLanding(error) {
  tabsEl.hidden = true;
  document.body.classList.add('e-nonav');
  paintHeader('APMES Evals');
  const base = location.pathname;
  const forAssessor = /^#e\//.test(location.hash) && !cloud.demo;
  const as = linkAccount();
  if (forAssessor) {
    fill(app, h('div', { class: 'e-landing' },
      h('img', { src: 'icons/icon-192.png', alt: '', class: 'e-landing__icon', width: 72, height: 72 }),
      h('h1', { class: 'e-h1' }, 'A resident asked you for an evaluation'),
      h('p', { class: 'e-lead' }, 'Sign in to open the form. It takes a few minutes and saves as you go.'),
      inAppBrowser() ? openInBrowserCard() : null,
      error ? h('p', { class: 'e-alert', role: 'alert' }, error) : null,
      cloud.enabled ? h('button', { class: 'a-btn a-btn--block e-btn-big', onclick: signIn }, googleMark(), 'Sign in with Google')
        : h('p', { class: 'e-alert' }, 'Sign-in is not configured.'),
      h('p', { class: 'e-small e-center' }, as ? ['Use the Google account ', h('b', {}, as), ': the request was sent there.']
        : 'Use the Google account your programme has on file for you.'),
      h('p', { class: 'e-small e-center' }, 'Unofficial tool for the APMES programme. Please don’t enter patient identifiers.')));
    return;
  }
  fill(app, h('div', { class: 'e-landing' },
    h('img', { src: 'icons/icon-192.png', alt: '', class: 'e-landing__icon', width: 72, height: 72 }),
    h('h1', { class: 'e-h1' }, 'Workplace-based assessments'),
    inAppBrowser() && !cloud.demo ? openInBrowserCard() : null,
    h('p', { class: 'e-lead' }, 'Request and complete DOPS, Mini-CEX and EBD evaluations on your phone.'),
    h('ul', { class: 'e-ticks' },
      h('li', {}, icon('check'), 'Residents pick the item, the assessor and send a link or QR code.'),
      h('li', {}, icon('check'), 'Faculty fill the official form in a few taps, saved as they go.'),
      h('li', {}, icon('check'), 'Progress against the APMES EPA requirements.')),
    error ? h('p', { class: 'e-alert', role: 'alert' }, error) : null,
    cloud.enabled && !cloud.demo ? h('button', { class: 'a-btn a-btn--block e-btn-big', onclick: signIn }, googleMark(), 'Sign in with Google')
      : cloud.demo ? h('button', { class: 'a-btn a-btn--block e-btn-big', onclick: signIn }, 'Sign in to the demo')
      : h('p', { class: 'e-alert' }, 'Sign-in is not configured.'),
    h('section', { class: 'e-card e-landing__demo' },
      h('h2', { class: 'e-h3' }, 'Try the demo'),
      h('p', { class: 'e-small' }, 'Made-up people and data, kept only in this browser.'),
      h('div', { class: 'e-demo-links' },
        h('a', { class: 'a-btn a-btn--tinted', href: base + '?demo' }, 'As a resident'),
        h('a', { class: 'a-btn a-btn--tinted', href: base + '?demo=assessor' }, 'As an assessor'),
        h('a', { class: 'a-btn a-btn--tinted', href: base + '?demo=admin' }, 'As an admin'))),
    h('p', { class: 'e-small e-center' }, 'Unofficial tool for the APMES programme. Please don’t enter patient identifiers.')));
}

function googleMark() {
  return h('span', { class: 'e-gmark', 'aria-hidden': 'true' }, 'G');
}

async function signIn() {
  try { await cloud.signIn(linkAccount() || undefined); }
  catch (err) { renderLanding('Sign-in didn’t finish. ' + errText(err)); }
}

// ---------- signed in, no role: apply ----------

function renderApply() {
  const appl = S.roles.application;
  const wrap = h('div', { class: 'e-stack' });
  const fromLink = /^#e\//.test(location.hash) && !cloud.demo;
  if (appl && appl.status === 'pending') {
    fill(wrap,
      h('section', { class: 'e-card' },
        h('h2', { class: 'e-h3' }, 'Application sent'),
        h('p', {}, `You asked to join as ${appl.role === 'faculty' ? 'faculty' : 'a resident'}. An admin or programme director will approve it; this page updates when they do.`),
        h('p', { class: 'e-small' }, `Signed in as ${S.user.email}`),
        h('div', { class: 'e-actions' },
          h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', onclick: () => fill(wrap, applyForm(appl)) }, 'Change'),
          h('button', { class: 'a-btn', onclick: () => refreshRoles() }, 'Check again'))),
      signOutCard());
    return wrap;
  }
  fill(wrap,
    fromLink ? wrongAccountCard() : null,
    fromLink ? h('p', { class: 'e-small' }, 'New to APMES Evals and this is your account? Apply below.') : null,
    appl && appl.status === 'rejected' ? h('p', { class: 'e-alert' }, 'Your last application was not approved. You can apply again, or contact the programme office.') : null,
    applyForm(appl), signOutCard());
  return wrap;
}

function applyForm(prev) {
  let role = prev?.role || 'resident';
  const name = h('input', { class: 'e-input', id: 'apply-name', value: prev?.name || S.user.name || '', autocomplete: 'name', required: true });
  const note = h('textarea', { class: 'e-textarea', id: 'apply-note', rows: 3, placeholder: 'e.g. intake year, department' }, prev?.note || '');
  const radios = h('div', { class: 'e-radios', role: 'radiogroup' }, [['resident', 'Resident', 'Request evaluations and track progress'], ['faculty', 'Faculty', 'Assess residents']].map(([v, l, d]) =>
    h('label', { class: 'e-radio' }, h('input', { type: 'radio', name: 'apply-role', value: v, checked: v === role, onchange: () => { role = v; } }),
      h('span', { class: 'e-radio__text' }, h('b', {}, l), h('span', { class: 'e-small' }, d)))));
  const btn = h('button', { class: 'a-btn a-btn--block e-go e-btn-big', type: 'submit' }, 'Apply');
  return h('form', { class: 'e-card', onsubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()) { name.focus(); return; }
    btn.disabled = true;
    try {
      await cloud.applyForRole({ role, name: name.value.trim(), note: note.value.trim() });
      toast('Application sent');
      await refreshRoles();
    } catch (err) { toast('Couldn’t send your application. ' + errText(err)); btn.disabled = false; }
  } },
  h('h2', { class: 'e-h3' }, 'Join APMES Evals'),
  h('p', {}, `${S.user.email} isn’t on the resident or faculty list yet. Apply below and an admin or programme director will approve you.`),
  h('fieldset', { class: 'e-fieldset' }, h('legend', { class: 'e-label' }, 'I am'), radios),
  h('label', { class: 'e-label', for: 'apply-name' }, 'Full name'), name,
  h('label', { class: 'e-label', for: 'apply-note' }, 'Note (optional)'), note,
  h('div', { class: 'e-actions' }, btn));
}

const signOutCard = () => h('p', { class: 'e-center' }, h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', onclick: () => signOutSafely() }, 'Sign out'));

// ---------- signed in ----------

let unwatchers = [];
const stopWatchers = () => { unwatchers.forEach(f => { try { f && f(); } catch {} }); unwatchers = []; };

async function refreshRoles() {
  const user = S.user;
  if (!user) return;
  let roles;
  try { roles = await cloud.getRoles(user.email); }
  catch (err) {
    fill(app, h('div', { class: 'e-empty' }, h('p', { class: 'e-empty__title' }, 'Couldn’t load your account'), h('p', {}, errText(err)),
      h('button', { class: 'a-btn', onclick: () => refreshRoles() }, 'Try again')));
    return;
  }
  if (S.user !== user) return;   // signed out meanwhile
  const before = JSON.stringify(rolesKey(S.roles));
  S.roles = { admin: false, pd: false, resident: null, faculty: null, application: null, ...roles };
  S.rolesLoaded = true;
  if (JSON.stringify(rolesKey(S.roles)) !== before || !unwatchers.length) startWatchers();
  render();
}
hooks.refreshRoles = refreshRoles;
const rolesKey = r => [!!r.admin, !!r.pd, !!r.resident, !!(r.faculty && r.faculty.status !== 'INACTIVE')];

function startWatchers() {
  stopWatchers();
  const email = S.user.email;
  const watch = (kind, start) => {
    let sig = '';
    unwatchers.push(start((list, meta) => {
      if (kind === 'assigned') pruneDrafts(list, meta);
      const next = (list || []).map(ev => ev.id + ':' + (ev.updatedAt?.seconds ?? ev.updatedAt ?? '') + ':' + ev.status).join();
      const first = !S.loaded[kind];
      S[kind] = list || [];
      S.loaded[kind] = true;
      if (!first && next === sig) return;   // metadata-only update
      sig = next;
      hooks.dataChanged(kind);
    }));
  };
  S.mine = []; S.assigned = []; S.all = [];
  S.loaded = { mine: false, assigned: false, all: false };
  if (isResident()) watch('mine', cb => cloud.watchMine(email, cb));
  if (S.roles.faculty || isStaff()) watch('assigned', cb => cloud.watchAssigned(email, cb));
  if (isStaff()) watch('all', cb => cloud.watchAll(cb));
  // faculty list for the assessor picker (and admin pages)
  if (isResident() || isStaff()) cloud.listFaculty().then(list => { S.faculty = list || []; }).catch(err => console.warn('Faculty list', err));
  // pending applications: an approval shows up without a reload
  if (!hasRole()) pollApproval();
}

let pollT = null;
function pollApproval() {
  clearTimeout(pollT);
  if (!S.user || hasRole() || S.roles.application?.status !== 'pending') return;
  pollT = setTimeout(async () => { if (document.visibilityState === 'visible') await refreshRoles(); pollApproval(); }, 30000);
}

async function onUser(user) {
  stopWatchers();
  clearTimeout(pollT);
  S.user = user;
  S.rolesLoaded = false;
  if (cloud.demo && cloud.demoRole) S.demoRole = cloud.demoRole();
  S.roles = { admin: false, pd: false, resident: null, faculty: null, application: null };
  Object.assign(S, { mine: [], assigned: [], all: [], faculty: [], loaded: { mine: false, assigned: false, all: false } });
  lastKey = '';
  if (!user) { renderLanding(); return; }
  paintHeader('APMES Evals');
  fill(app, h('p', { class: 'e-loading' }, 'Loading…'));
  await refreshRoles();
}

// Phones: while the keyboard is up (a text box has focus and the visible area has shrunk), the bottom
// nav stays on screen just above the keyboard and the submit bar unsticks (style.css, body.typing).
// Where the keyboard doesn't resize the page (iOS), --e-kb lifts the nav by the keyboard's height, and
// the box being typed in is kept clear of the nav.
const typingEl = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|number|tel|url|)$/.test(el.type)));
let fullH = 0, fullW = 0;   // the tallest visible area seen at this width (keyboard down)
function keyboardCheck() {
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (window.innerWidth !== fullW) { fullW = window.innerWidth; fullH = 0; }   // rotated
  fullH = Math.max(fullH, vh);
  const typing = !!typingEl(document.activeElement) && vh < fullH * 0.75;
  document.body.classList.toggle('typing', typing);
  const vv = window.visualViewport;
  const kb = typing && vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  document.documentElement.style.setProperty('--e-kb', kb + 'px');
  if (typing) setTimeout(keepFocusClear, 50);
}
// scroll so the focused box isn't hidden under the nav that now sits above the keyboard
function keepFocusClear() {
  const el = document.activeElement, nav = document.getElementById('tabs');
  if (!typingEl(el) || !nav || !nav.getClientRects().length) return;   // no nav on this screen
  const r = el.getBoundingClientRect();
  const top = (window.visualViewport?.offsetTop || 0) + 64;              // below the header
  const over = Math.min(r.bottom + 8 - nav.getBoundingClientRect().top, r.top - top);   // a tall box keeps its top
  if (over > 0) window.scrollBy(0, over);
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
      const b = h('div', { class: 'a-banner e-banner e-banner--info' }, h('span', {}, 'Update available'),
        h('button', { class: 'a-btn a-btn--sm e-btn-small', onclick: () => { b.remove(); w.postMessage('skipWaiting'); } }, 'Reload'));
      banner.append(b);
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

// Demo only: wipe the demo store (and any half-filled demo forms) and reload in the same role.
export async function resetDemoData() {
  if (!(await confirmBox('Reset the demo?', 'All demo changes in this browser are wiped and the made-up data is loaded again. You stay in the same demo role.', 'Reset', true))) return;
  const { resetDemo } = await import('./demo-backend.js');
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('evals-draft-')) localStorage.removeItem(k); } catch {}
  resetDemo();
  location.replace(location.pathname + location.search);
}

// ---------- boot ----------

if (cloud.onSyncError) cloud.onSyncError(err => toast('A change didn’t reach the server. ' + errText(err)));

if (cloud.demo) {
  S.demoRole = cloud.demoRole ? cloud.demoRole() : 'resident';
  banner.append(h('div', { class: 'a-banner a-banner--warn e-banner e-banner--warn' },
    h('span', {}, 'Demo: made-up data, kept in this browser.'),
    h('button', { type: 'button', class: 'a-btn a-btn--plain a-btn--sm e-btn-small', onclick: resetDemoData }, 'Reset'),
    h('a', { href: location.pathname, class: 'a-btn a-btn--plain a-btn--sm e-btn-small' }, 'Leave demo')));
  banner.hidden = false;
}
paintHeader('APMES Evals');
if (!cloud.enabled) renderLanding();
else Promise.resolve(cloud.watchUser(onUser)).catch(err => renderLanding('Couldn’t start sign-in. ' + errText(err)));
// after the first screen has loaded, so the offline download doesn't compete with it
if (document.readyState === 'complete') registerSW(); else window.addEventListener('load', registerSW, { once: true });
