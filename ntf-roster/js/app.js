// NTF Roster: app shell. Loads the state (practice department with ?demo), draws the header, the tabs and the
// bottom bar on phones, routes between views (#roster, #day, #people, #rules, #check, #more) and gives every view
// the same small `app` toolkit: store, month, toasts, sheets, the cached rule check and a DOM helper.
// Views are separate modules loaded on demand; a view that fails to load shows a friendly placeholder instead.

let M = null;      // model.js
let R = null;      // rules.js (may be missing while it is being built)

const TABS = {
  roster: { label: 'Roster', icon: 'grid', mod: './ui-roster.js' },
  day: { label: 'Day', icon: 'day', mod: './ui-day.js' },
  people: { label: 'People', icon: 'people', mod: './ui-people.js' },
  rules: { label: 'Rules', icon: 'rules', mod: './ui-rules.js' },
  check: { label: 'Check', icon: 'check', mod: './ui-check.js' },
  more: { label: 'More', icon: 'more', mod: './ui-more.js' },
};
const DESKTOP_TABS = ['roster', 'day', 'people', 'rules', 'check', 'more'];
const PHONE_TABS = ['roster', 'day', 'check', 'rules', 'more'];
const PHONE_MQ = '(max-width: 720px)';

// Line icons (24 px grid, stroke = currentColor). Views get them through app.icon(name).
const ICON_PATHS = {
  grid: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9.5h18M3 15h18M9 4v17M15 4v17"/>',
  day: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><rect x="7" y="12" width="4" height="4" rx=".5"/>',
  check: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  rules: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  spark: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  brush: '<path d="M18.4 2.6a2 2 0 012.8 2.8L11 15.6 8.4 13z"/><path d="M8.4 13C6 13 4.5 14.6 4.5 17c0 1.6-1 2.6-2.5 3 1 .7 2.6 1 4 1 3 0 5-2 5-5.4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M9 12h6M9 16h6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eraser: '<path d="M20 20H9l-5.5-5.5a2 2 0 010-2.8l9.2-9.2a2 2 0 012.8 0l5 5a2 2 0 010 2.8L12 18.8"/><path d="M7 10l7 7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
};
function icon(name, cls = '') {
  const p = ICON_PATHS[name] || '';
  const fill = name === 'more' ? ' fill="currentColor"' : ' fill="none"';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" width="20" height="20"${fill} stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Tiny DOM helper: h('button', { class: 'btn', onclick: fn, 'aria-label': 'x' }, 'Text', otherNode)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'indeterminate') el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  const add = (c) => {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

const $ = (sel) => document.querySelector(sel);

// ---------- app object ----------
const app = {
  store: null,
  month: '',
  params: {},
  tab: '',
  selectedCell: null,
  h, icon, esc,
  isDemo: false,
  setMonth, go, toast, sheet, confirm: confirmBox, evaluation, isPhone,
  selectCell(date, staffId) { app.selectedCell = date && staffId ? { date, staffId } : null; },
  model: null,
  rules: null,
};

function isPhone() { return window.matchMedia(PHONE_MQ).matches; }

function thisMonth() { return M.monthOf(M.iso(new Date())); }
function validMonth(m) { return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m); }

function setMonth(m) {
  if (!validMonth(m) || m === app.month) return;
  app.month = m;
  evalCache = null;
  try { localStorage.setItem('ntf-roster-ui-month', JSON.stringify({ m, at: M.iso(new Date()) })); } catch (e) { /* ignore */ }
  renderHeader();
  if (current.view && typeof current.view.update === 'function') {
    try { current.view.update(app.store.get(), { month: true }); } catch (e) { console.error(e); }
  }
}

// ---------- rule check cache ----------
let evalCache = null;
const EMPTY_EVAL = () => ({ violations: [], hard: 0, soft: 0, score: 0, byCell: new Map(), byDay: new Map(), byRule: new Map() });
function evaluation() {
  const state = app.store.get();
  if (evalCache && evalCache.state === state && evalCache.month === app.month) return evalCache.res;
  let res = EMPTY_EVAL();
  if (R && typeof R.evaluate === 'function') {
    const days = M.monthDays(app.month);
    try { res = R.evaluate(state, { from: days[0], to: days[days.length - 1] }) || res; } catch (e) { console.error('evaluate failed', e); }
  }
  evalCache = { state, month: app.month, res };
  return res;
}

// ---------- toasts ----------
function toast(msg, { action, kind = 'ok', ms } = {}) {
  const box = $('#toasts');
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-msg' }, msg));
  let timer;
  const close = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 180); };
  if (action) {
    el.append(h('button', { type: 'button', class: 'toast-act', onclick: () => { close(); action.fn(); } }, action.label));
  }
  el.append(h('button', { type: 'button', class: 'toast-x', 'aria-label': 'Dismiss', html: icon('close'), onclick: close }));
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  timer = setTimeout(close, ms || (action ? 6000 : 3500));
  return close;
}

// ---------- sheets (modal on desktop, bottom sheet on phone) ----------
let sheetCount = 0;
function sheet({ title = '', body, actions = [], wide = false, onClose, className = '' } = {}) {
  const prevFocus = document.activeElement;
  const id = 'sheet-title-' + (++sheetCount);
  const back = h('div', { class: 'sheet-back' });
  const footer = actions.length ? h('div', { class: 'sheet-foot' }) : null;
  const dlg = h('div', { class: `sheet${wide ? ' wide' : ''} ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' },
      h('h2', { id, class: 'sheet-title' }, title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', html: icon('close'), onclick: () => close() })),
    h('div', { class: 'sheet-body' }, body || null),
    footer);
  let closed = false;
  function close(reason) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    back.classList.add('out');
    setTimeout(() => back.remove(), 160);
    if (typeof onClose === 'function') onClose(reason);
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  }
  for (const a of actions) {
    const b = h('button', { type: 'button', class: `btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost'}` }, a.label);
    b.addEventListener('click', async () => {
      let keep = false;
      try { keep = (await (a.fn ? a.fn(close) : undefined)) === false; } catch (e) { console.error(e); toast(String(e.message || e), { kind: 'error' }); keep = true; }
      if (!keep) close('action');
    });
    footer.append(b);
  }
  function onKey(e) {
    if (!document.contains(dlg)) return;
    const top = [...document.querySelectorAll('.sheet-back')].pop();
    if (top !== back) return;   // only the top sheet reacts
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('escape'); }
    if (e.key === 'Tab') {   // keep focus inside the dialog
      const f = [...dlg.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }
  back.addEventListener('mousedown', (e) => { if (e.target === back) close('backdrop'); });
  back.append(dlg);
  document.body.append(back);
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => {
    const first = dlg.querySelector('.sheet-body [autofocus], .sheet-body input, .sheet-body select, .sheet-body textarea, .sheet-body button, .sheet-foot .btn-primary') || dlg.querySelector('.sheet-head .icon-btn');
    if (first) first.focus({ preventScroll: true });
  });
  close.el = dlg;
  return close;
}

function confirmBox(msg, { ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    sheet({
      title: 'Please confirm',
      body: h('p', { class: 'confirm-msg' }, msg),
      actions: [
        { label: 'Cancel', fn: () => { answered = true; resolve(false); } },
        { label: ok, primary: !danger, danger, fn: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// ---------- header ----------
function renderNav() {
  const tabs = $('#tabs');
  tabs.innerHTML = DESKTOP_TABS.map(t => `<a href="#${t}" class="tab" data-tab="${t}">${icon(TABS[t].icon)}<span>${TABS[t].label}</span></a>`).join('');
  const bb = $('#bottombar');
  bb.innerHTML = PHONE_TABS.map(t => `<a href="#${t}" class="bb-tab" data-tab="${t}">${icon(TABS[t].icon)}<span class="bb-label">${TABS[t].label}</span>${t === 'check' ? '<span class="bb-badge" hidden></span>' : ''}</a>`).join('');
  $('#undo').innerHTML = icon('undo');
  $('#redo').innerHTML = icon('redo');
  $('#help').innerHTML = icon('keyboard');
  $('#prevm').innerHTML = icon('left');
  $('#nextm').innerHTML = icon('right');
  $('#autofill').innerHTML = `${icon('spark')}<span class="lbl">Auto-fill</span>`;
}

function markTabs() {
  const active = app.tab === 'people' && isPhone() ? 'more' : app.tab;
  document.querySelectorAll('[data-tab]').forEach(a => {
    if (a.dataset.tab === active || (a.classList.contains('tab') && a.dataset.tab === app.tab)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function renderHeader() {
  const state = app.store.get();
  $('#dept').textContent = state.settings?.dept || '';
  $('#month').textContent = M.fmtMonth(app.month);
  const isNow = app.month === thisMonth();
  $('#today').disabled = isNow;
  const u = $('#undo'), r = $('#redo');
  u.disabled = !app.store.canUndo();
  r.disabled = !app.store.canRedo();
  u.title = app.store.canUndo() ? `Undo ${app.store.undoLabel()} (Ctrl+Z)` : 'Nothing to undo';
  r.title = app.store.canRedo() ? `Redo ${app.store.redoLabel()} (Ctrl+Shift+Z)` : 'Nothing to redo';
  u.setAttribute('aria-label', app.store.canUndo() ? `Undo ${app.store.undoLabel()}` : 'Undo');
  r.setAttribute('aria-label', app.store.canRedo() ? `Redo ${app.store.redoLabel()}` : 'Redo');
  const ev = (state.staff || []).length ? evaluation() : EMPTY_EVAL();
  const p = $('#problems');
  p.className = 'problems ' + (ev.hard ? 'has-hard' : 'is-ok');
  const hardTxt = ev.hard ? `${ev.hard} problem${ev.hard === 1 ? '' : 's'}` : 'No problems';
  p.innerHTML = `${icon(ev.hard ? 'alert' : 'ok')}<span class="p-hard">${hardTxt}</span>${ev.soft ? `<span class="p-soft">${ev.soft} to improve</span>` : ''}`;
  p.setAttribute('aria-label', `${hardTxt}${ev.soft ? `, ${ev.soft} to improve` : ''}. Open Check`);
  p.title = 'Rule check for ' + M.fmtMonth(app.month) + ': must-fix problems (hard rules) and things to improve (soft rules)';
  const bb = document.querySelector('.bb-badge');
  if (bb) { bb.hidden = !ev.hard; bb.textContent = ev.hard > 99 ? '99+' : String(ev.hard); }
  const bbTab = document.querySelector('.bb-tab[data-tab="check"]');
  if (bbTab) bbTab.setAttribute('aria-label', ev.hard ? `Check, ${ev.hard} problems` : 'Check');
  markTabs();
}

// ---------- router ----------
const current = { tab: '', key: '', view: null, el: null };
let routing = Promise.resolve();

function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [t, q] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(q || ''));
  const tab = TABS[t] ? t : (isPhone() ? 'day' : 'roster');
  return { tab, params, key: raw };
}

function go(tab, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const hash = '#' + tab + (q ? '?' + q : '');
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  routing = routing.then(doRoute).catch(e => console.error(e));
  return routing;
}

async function doRoute() {
  const { tab, params, key } = parseHash();
  app.params = params;
  if (validMonth(params.m) && params.m !== app.month) { app.month = params.m; evalCache = null; }
  const sameTab = tab === current.tab && current.view;
  app.tab = tab;
  renderHeader();
  if (sameTab && typeof current.view.route === 'function') {   // my views take new params without remounting
    current.key = key;
    try { current.view.route(params); } catch (e) { console.error(e); }
    return;
  }
  unmountView();
  current.tab = tab; current.key = key;
  const main = $('#main');
  main.innerHTML = '';
  main.dataset.tab = tab;
  document.body.dataset.tab = tab;
  const state = app.store.get();
  if (!(state.staff || []).length && (tab === 'roster' || tab === 'day' || tab === 'check')) {
    main.append(welcomeCard());
    current.view = { welcome: true };
    return;
  }
  const el = h('div', { class: `view view-${tab}` });
  if (tab === 'more' && isPhone()) el.append(phoneMoreLinks());
  const host = h('div', { class: 'view-host' });
  el.append(host);
  main.append(el);
  current.el = el;
  let mod;
  try {
    mod = await import(TABS[tab].mod);
  } catch (e) {
    console.warn(`Could not load ${TABS[tab].mod}`, e);
    if (current.tab !== tab) return;
    host.append(placeholder(tab));
    current.view = { placeholder: true };
    return;
  }
  if (current.tab !== tab || current.el !== el) return;   // the person moved on while it loaded
  const mount = mod.mount || mod.default?.mount;
  if (typeof mount !== 'function') { host.append(placeholder(tab)); current.view = { placeholder: true }; return; }
  try {
    current.view = (await mount(host, app)) || {};
  } catch (e) {
    console.error(`${tab} failed to mount`, e);
    host.innerHTML = '';
    host.append(placeholder(tab, e));
    current.view = { placeholder: true };
  }
}

function unmountView() {
  if (current.view && typeof current.view.unmount === 'function') {
    try { current.view.unmount(); } catch (e) { console.error(e); }
  }
  current.view = null; current.el = null;
}

function placeholder(tab, err) {
  return h('div', { class: 'card empty-card' },
    h('div', { class: 'empty-ic', html: icon(TABS[tab].icon) }),
    h('h2', null, `${TABS[tab].label} isn't ready yet`),
    h('p', null, err ? 'Something went wrong while opening this screen. Your roster is safe; try reloading the page.'
      : 'This part of NTF Roster is still being built. Your roster is safe; the other screens work.'),
    h('p', null, h('a', { href: '#roster', class: 'btn btn-ghost' }, 'Back to the roster')));
}

function phoneMoreLinks() {
  return h('a', { href: '#people', class: 'card link-card' },
    h('span', { class: 'lc-ic', html: icon('people') }),
    h('span', { class: 'lc-text' }, h('strong', null, 'People'), h('span', null, 'Staff, groups, tags and duty codes')),
    h('span', { class: 'lc-go', html: icon('right') }));
}

function welcomeCard() {
  return h('div', { class: 'welcome' },
    h('div', { class: 'card welcome-card' },
      h('div', { class: 'empty-ic', html: icon('grid') }),
      h('h2', null, 'Welcome to NTF Roster'),
      h('p', null, 'Plan the monthly calls, PM shifts and clinics together with leave and requests, check them against your rules, and fill the gaps automatically.'),
      h('p', { class: 'muted' }, 'Start by bringing in the department list. Everything stays in this browser until team sync is set up.'),
      h('div', { class: 'welcome-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go('more'), html: `${icon('upload')}<span>Import Excel sheet</span>` }),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go('people'), html: `${icon('plus')}<span>Add staff</span>` }),
        h('a', { class: 'btn btn-ghost', href: './?demo', target: '_blank', rel: 'noopener', html: `${icon('eye')}<span>Try the practice department</span>` }))));
}

// ---------- bars ----------
function renderDemoBar() {
  const bar = $('#demobar');
  if (!app.isDemo) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = '';
  bar.append(
    h('span', { class: 'demo-pill' }, 'Practice'),
    h('span', { class: 'demo-text' }, 'Practice (made-up department). Changes stay in this browser.'),
    h('button', { type: 'button', class: 'linkish', onclick: resetDemo }, 'Reset'),
    h('a', { class: 'linkish', href: './' }, 'Leave practice'));
}

async function resetDemo() {
  if (!(await confirmBox('Start the practice department again? Your practice changes will be replaced.', { ok: 'Reset practice' }))) return;
  let fresh = M.defaultState();
  try { const d = await import('./demo.js'); fresh = d.demoState(M.iso(new Date())); } catch (e) { /* default state */ }
  app.store.replace(fresh, 'Reset practice');
  toast('Practice department reset', { action: { label: 'Undo', fn: () => app.store.undo() } });
}

function showSaveError() {
  const bar = $('#savebar');
  bar.hidden = false;
  bar.innerHTML = '';
  bar.append(
    h('span', null, 'This browser is out of storage space, so the last change was not saved.'),
    h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: downloadBackup }, 'Download backup'),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Dismiss', html: icon('close'), onclick: () => { bar.hidden = true; } }));
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify({ kind: 'ntf-roster-backup', v: 1, state: app.store.get() }, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `ntf-roster-backup-${M.iso(new Date())}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- shortcuts ----------
function shortcutsSheet() {
  const rows = [
    ['Ctrl/⌘ + Z', 'Undo'], ['Ctrl/⌘ + Shift + Z, Ctrl + Y', 'Redo'], ['[ and ]', 'Previous / next month'],
    ['Arrow keys', 'Move around the roster'], ['Type a code, then Enter', 'Add or remove that code (e.g. AL ⏎)'],
    ['Enter', 'Open the cell editor'], ['Delete', 'Clear the cell'], ['Esc', 'Close the editor, forget a typed code'], ['?', 'This list'],
  ];
  const tbl = h('table', { class: 'kbd-table' }, h('tbody', null, rows.map(([k, v]) => h('tr', null, h('th', { scope: 'row' }, h('kbd', null, k)), h('td', null, v)))));
  sheet({ title: 'Keyboard shortcuts', body: tbl, actions: [{ label: 'Close', primary: true }] });
}

function isTyping(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function onKeydown(e) {
  const mod = e.ctrlKey || e.metaKey;
  if (document.querySelector('.sheet-back') && !mod) return;
  if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
    if (isTyping(e.target)) return;
    e.preventDefault();
    if (e.shiftKey) doRedo(); else doUndo();
    return;
  }
  if (mod && (e.key === 'y' || e.key === 'Y')) { if (isTyping(e.target)) return; e.preventDefault(); doRedo(); return; }
  if (mod || e.altKey || isTyping(e.target)) return;
  if (e.key === '[') { e.preventDefault(); setMonth(M.addMonths(app.month, -1)); }
  else if (e.key === ']') { e.preventDefault(); setMonth(M.addMonths(app.month, 1)); }
  else if (e.key === '?') { e.preventDefault(); shortcutsSheet(); }
}

function doUndo() {
  const label = app.store.undo();
  if (label) toast(`Undone: ${label}`, { action: { label: 'Redo', fn: doRedo }, ms: 3000 });
}
function doRedo() {
  const label = app.store.redo();
  if (label) toast(`Redone: ${label}`, { ms: 2500 });
}

async function openAutofill() {
  try {
    const mod = await import('./ui-roster.js');
    mod.openAutofill(app);
  } catch (e) {
    console.error(e);
    toast('Auto-fill could not start. Try reloading the page.', { kind: 'error' });
  }
}

// ---------- start ----------
function fatal(msg) {
  const main = $('#main');
  main.innerHTML = '';
  main.append(h('div', { class: 'card empty-card' }, h('h2', null, 'NTF Roster could not start'), h('p', null, msg)));
}

async function start() {
  try {
    M = await import('./model.js');
  } catch (e) {
    console.error(e);
    fatal('A part of the app did not load. Check your connection and reload the page.');
    return;
  }
  try { R = await import('./rules.js'); } catch (e) { console.warn('rules.js not loaded; rule checks are off', e); }
  app.model = M; app.rules = R;
  const demo = new URLSearchParams(location.search).has('demo');
  app.isDemo = demo;
  let demoState = null;
  if (demo) {
    try { ({ demoState } = await import('./demo.js')); } catch (e) { console.warn('demo.js not loaded; starting empty', e); }
  }
  const { createStore } = await import('./store.js');
  app.store = createStore({
    demo,
    fallback: () => (demo && typeof demoState === 'function' ? demoState(M.iso(new Date())) : M.defaultState()),
  });
  app.store.onSaveError = showSaveError;
  if (demo) document.title = 'NTF Roster (practice)';

  // Month on screen: the hash (?m=), else this month.
  const hp = parseHash().params;
  app.month = validMonth(hp.m) ? hp.m : thisMonth();

  renderNav();
  renderDemoBar();
  renderHeader();

  $('#undo').addEventListener('click', doUndo);
  $('#redo').addEventListener('click', doRedo);
  $('#help').addEventListener('click', shortcutsSheet);
  $('#prevm').addEventListener('click', () => setMonth(M.addMonths(app.month, -1)));
  $('#nextm').addEventListener('click', () => setMonth(M.addMonths(app.month, 1)));
  $('#today').addEventListener('click', () => setMonth(thisMonth()));
  $('#autofill').addEventListener('click', openAutofill);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', route);

  let wasPhone = isPhone();
  window.matchMedia(PHONE_MQ).addEventListener('change', () => {
    const now = isPhone();
    if (now === wasPhone) return;
    wasPhone = now;
    markTabs();
    if (current.view && typeof current.view.update === 'function') current.view.update(app.store.get(), { resize: true });
  });

  app.store.subscribe((state, info) => {
    evalCache = null;
    renderHeader();
    if (current.view?.welcome && (state.staff || []).length) { route(); return; }
    if (current.view && typeof current.view.update === 'function') {
      try { current.view.update(state, info); } catch (e) { console.error(e); }
    }
  });

  await route();
  document.body.classList.add('ready');
  window.ntfApp = app;   // handy in the console and for browser tests
}

start();
