// NTF Roster: app shell. Loads the state (practice department with ?demo), draws the top bar, the screen head (large
// title, month, Auto-fill) and the tab bar (bottom on phones, a left rail from 1024 px), routes between views (#roster,
// #day, #people, #rules, #check, #more) and gives every view the same small `app` toolkit: store, month, toasts,
// sheets, the cached rule check and a DOM helper. Looks: the NTF app kit (css/app.css, anantf-site DESIGN-APP.md).
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
// One tab bar of five tabs (the kit's limit), at the bottom on phones and a left rail from 1024 px; People sits under
// More (a pushed screen with a back button).
const NAV_TABS = ['roster', 'day', 'check', 'rules', 'more'];
const PHONE_MQ = '(max-width: 720px)';
// Screens that show the month (and the Auto-fill button on some of them)
const MONTH_TABS = ['roster', 'day', 'check', 'rules'];
const AUTOFILL_TABS = ['roster', 'day', 'check'];

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
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  sheet: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M12 11v8"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>',
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
      else if (k === 'style' && typeof v === 'object') {
        for (const [prop, val] of Object.entries(v)) {
          if (val == null) continue;
          if (prop.startsWith('--') || prop.includes('-')) el.style.setProperty(prop, String(val));   // custom properties need setProperty
          else el.style[prop] = val;
        }
      }
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
  setMonth, go, toast, sheet, confirm: confirmBox, evaluation, isPhone, setHead,
  selectCell(date, staffId) { app.selectedCell = date && staffId ? { date, staffId } : null; },
  model: null,
  rules: null,
  head: null,   // a view's own screen head: { title, back: { label, fn }, noAutofill } (setHead)
};

function isPhone() { return window.matchMedia(PHONE_MQ).matches; }

function thisMonth() { return M.monthOf(M.iso(new Date())); }
function validMonth(m) { return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m); }
function validDay(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && M.iso(M.parseISO(d)) === d; }
// the month a link asks for: ?m=, else the month of ?d= (a Day link), else none
function monthFromParams(p) { return validMonth(p.m) ? p.m : validDay(p.d) ? p.d.slice(0, 7) : ''; }

function setMonth(m) {
  if (!validMonth(m) || m === app.month) return;
  app.month = m;
  evalCache = null;
  try { localStorage.setItem('ntf-roster-ui-month', JSON.stringify({ m, at: M.iso(new Date()) })); } catch (e) { /* ignore */ }
  // keep the month in the link, so a reload or a relaunch of the installed app comes back to it
  try {
    const { tab, params } = parseHash();
    const next = { ...params, m };
    if (next.d && !String(next.d).startsWith(m + '-')) delete next.d;
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v != null && v !== '')).toString();
    history.replaceState(history.state, '', '#' + tab + (q ? '?' + q : ''));
    app.params = next;
    current.key = tab + (q ? '?' + q : '');
  } catch (e) { /* ignore */ }
  renderHeader();
  if (current.view && typeof current.view.update === 'function') {
    try { current.view.update(app.store.get(), { month: true }); } catch (e) { console.error(e); }
  }
}

// ---------- rule check cache ----------
let evalCache = null;
const EMPTY_EVAL = () => ({ violations: [], hard: 0, soft: 0, score: 0, failed: [], byCell: new Map(), byDay: new Map(), byRule: new Map() });
function evaluation() {
  const state = app.store.get();
  if (evalCache && evalCache.state === state && evalCache.month === app.month) return evalCache.res;
  let res = EMPTY_EVAL();
  if (R && typeof R.evaluate === 'function') {
    const days = M.monthDays(app.month);
    // a failed check must never look like "No problems": the header and Check say so (error / failed)
    try { res = R.evaluate(state, { from: days[0], to: days[days.length - 1] }) || res; } catch (e) { console.error('evaluate failed', e); res = { ...EMPTY_EVAL(), error: true }; }
  }
  evalCache = { state, month: app.month, res };
  return res;
}

// ---------- toasts ----------
// The kit's toast (ink, with an Undo-style action), stacked up to three. While a sheet is open the toast shows inside
// it (a modal sheet covers everything else); when the sheet closes, its toasts move back to the page.
// An error toast ("Not saved: …") goes as soon as something else happens: it must not linger over the fix.
function clearErrorToasts() { document.querySelectorAll('.toasts .toast-error').forEach(el => el.remove()); }
function topSheet() { return [...document.querySelectorAll('dialog.app-sheet[open]')].pop() || null; }
function toastBox() {
  const dlg = topSheet();
  if (!dlg) return $('#toasts');
  let box = dlg.querySelector(':scope > .toasts');
  if (!box) { box = h('div', { class: 'toasts in-sheet', 'aria-live': 'polite' }); dlg.append(box); }
  return box;
}
function toast(msg, { action, kind = 'ok', ms } = {}) {
  const box = toastBox();
  clearErrorToasts();
  const el = h('div', { class: `toast app-toast is-visible toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('span', { class: 'app-toast-text toast-msg' }, msg));
  let timer;
  const close = () => { clearTimeout(timer); el.classList.remove('is-visible'); setTimeout(() => el.remove(), 260); };
  if (action) {
    el.append(h('button', { type: 'button', class: 'app-toast-action toast-act', onclick: () => { close(); action.fn(); } }, action.label));
  }
  el.append(h('button', { type: 'button', class: 'app-toast-action toast-x', 'aria-label': 'Dismiss', html: icon('close'), onclick: close }));
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  if (ms !== 0) timer = setTimeout(close, ms || (action ? 6000 : 4000));   // ms: 0 stays until dismissed
  return close;
}

// ---------- sheets: the kit's bottom sheet (<dialog>), a centred dialog from 768 px ----------
// Each open sheet adds a history entry, so the phone's Back button closes the sheet instead of leaving the screen
// underneath. beforeClose(reason) can ask first ("Discard changes?") when a sheet is closed by Back, Esc, the X,
// a tap outside or a drag down; buttons in the sheet's footer close it without asking.
let sheetCount = 0;
let sheetSeq = 0;
const sheetStack = [];       // [{ seq, pushed, push, onBack }] open sheets, oldest first
let backPending = null;      // a history.back() from closing a sheet that hasn't landed yet
let backDone = null;
window.addEventListener('popstate', (e) => {
  if (backDone) { const r = backDone; backDone = null; backPending = null; r(); }
  const seq = (e.state && e.state.ntfSheet) || 0;
  for (const s of [...sheetStack].reverse()) if (s.pushed && s.seq > seq) s.onBack();
  // sheets opened while that back was on its way get their history entry now
  for (const s of sheetStack) if (!s.pushed) s.push();
});
function sheet({ title = '', body, actions = [], wide = false, onClose, beforeClose, className = '', closeLabel = '' } = {}) {
  const prevFocus = document.activeElement;
  const id = 'sheet-title-' + (++sheetCount);
  const seq = ++sheetSeq;
  let popped = false;
  const entry = { seq, pushed: false, onBack: () => { popped = true; requestClose('back'); } };
  const pushEntry = () => { try { history.pushState({ ...(history.state || {}), ntfSheet: seq }, ''); } catch (e) { /* ignore */ } popped = false; entry.pushed = true; };
  entry.push = pushEntry;
  if (!backPending) pushEntry();   // else once the pending back has landed (popstate)
  sheetStack.push(entry);
  const btnRow = actions.length ? h('div', { class: 'app-btn-row' }) : null;
  const footer = btnRow ? h('div', { class: 'app-sheet-foot' }, btnRow) : null;
  const head = h('div', { class: 'app-sheet-head' },
    h('span'),
    h('h2', { id, class: 'app-sheet-title' }, title),
    // the head's close: an X, or a word (closeLabel: 'Done') for a sheet that saves as you go
    closeLabel ? h('button', { type: 'button', class: 'app-bar-btn sheet-x sheet-done', onclick: () => requestClose('x') }, closeLabel)
      : h('button', { type: 'button', class: 'app-bar-btn sheet-x', 'aria-label': 'Close', html: icon('close'), onclick: () => requestClose('x') }));
  const grabber = h('span', { class: 'app-sheet-grabber', 'aria-hidden': 'true' });
  // Over the roster grid a sheet opens non-modal, with its own scrim and Tab loop, and looks and works the same. A
  // modal dialog makes everything behind it inert, and the browser then restyles every element on the page: with the
  // grid's ~5,000 elements that is about 0.25 s to open and again to close on a slowed phone (speed, Oct 2026).
  const modal = !(app.tab === 'roster' && document.querySelector('#view table.grid'));
  const dlg = h('dialog', { class: `app-sheet${wide ? ' is-wide' : ''}${modal ? '' : ' is-nonmodal'} ${className}`, 'aria-labelledby': id, 'aria-modal': modal ? null : 'true' },
    grabber, head, h('div', { class: 'app-sheet-body' }, body || null), footer);
  const scrim = modal ? null : h('div', { class: 'sheet-scrim', 'aria-hidden': 'true', onclick: () => requestClose('backdrop') });
  let closed = false, asking = false;
  async function requestClose(reason) {
    if (closed || asking) return;
    if (typeof beforeClose === 'function') {
      asking = true;
      let ok = true;
      try { ok = await beforeClose(reason); } catch (e) { ok = true; }
      asking = false;
      if (!ok) { if (reason === 'back') pushEntry(); return; }
    }
    close(reason);
  }
  function close(reason) {
    if (closed) return;
    closed = true;
    const at = sheetStack.indexOf(entry);
    if (at >= 0) sheetStack.splice(at, 1);
    if (entry.pushed && !popped && history.state && history.state.ntfSheet === seq) {
      popped = true;
      backPending = new Promise(res => { backDone = res; });
      history.back();
    }
    document.removeEventListener('keydown', onKey, true);
    const page = $('#toasts');
    dlg.querySelectorAll('.toasts > .toast').forEach(t => page.append(t));   // "Rule added" outlives its sheet
    if (dlg.open) dlg.close();
    if (scrim) scrim.classList.remove('is-on');
    setTimeout(() => { dlg.remove(); scrim?.remove(); }, 450);   // after the slide down
    if (typeof onClose === 'function') onClose(reason);
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  }
  for (const a of actions) {
    // one primary (wine) per sheet; Cancel and the like are plain, removals red
    const kind = a.primary ? 'app-btn--primary' : a.danger ? 'app-btn--danger' : 'app-btn--plain';
    const b = h('button', { type: 'button', class: `app-btn ${kind}` }, a.label);
    b.addEventListener('click', async () => {
      let keep = false;
      try { keep = (await (a.fn ? a.fn(close) : undefined)) === false; } catch (e) { console.error(e); toast(String(e.message || e), { kind: 'error' }); keep = true; }
      if (!keep) close('action');
    });
    btnRow.append(b);
  }
  // Esc: only the top sheet reacts, and it may ask first (the browser's own Esc would close without asking)
  function onKey(e) {
    if (e.key !== 'Escape' || topSheet() !== dlg) return;
    e.preventDefault(); e.stopPropagation(); requestClose('escape');
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); requestClose('escape'); });
  dlg.addEventListener('close', () => { if (!closed) close('escape'); });   // closed by the browser itself
  // a tap on the backdrop (outside the sheet's box) closes it
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) requestClose('backdrop');
  });
  // phones: drag the head down past 120 px (or flick it) to close
  let drag = null;
  const dragStart = (e) => {
    if (window.innerWidth >= 768 || e.button > 0 || e.target.closest('button')) return;
    drag = { y: e.clientY, t: e.timeStamp, dy: 0 };
    dlg.classList.add('is-dragging');
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  };
  const dragMove = (e) => { if (!drag) return; drag.dy = Math.max(0, e.clientY - drag.y); dlg.style.transform = `translateY(${drag.dy}px)`; };
  const dragEnd = (e) => {
    if (!drag) return;
    const far = drag.dy > 120 || drag.dy / Math.max(1, e.timeStamp - drag.t) > 0.6;
    drag = null;
    dlg.classList.remove('is-dragging');
    dlg.style.transform = '';
    if (far) requestClose('drag');
  };
  for (const el of [head, grabber]) {
    el.addEventListener('pointerdown', dragStart);
    el.addEventListener('pointermove', dragMove);
    el.addEventListener('pointerup', dragEnd);
    el.addEventListener('pointercancel', dragEnd);
  }
  if (modal) {
    document.body.append(dlg);
    dlg.showModal();
  } else {
    // keep Tab inside the sheet (a modal dialog's page is inert; this one's isn't)
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const f = [...dlg.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    });
    scrim.classList.add('is-on');
    document.body.append(scrim, dlg);
    dlg.show();
  }
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => {
    const first = dlg.querySelector('.app-sheet-body [autofocus], .app-sheet-body input, .app-sheet-body select, .app-sheet-body textarea, .app-sheet-body button, .app-sheet-foot .app-btn--primary') || dlg.querySelector('.sheet-x');
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
  // the kit's tab bar: a line icon in a pill (blush when active) over its label
  $('#bottombar').innerHTML = '<div class="app-tabbar-inner">' + NAV_TABS.map(t => `<a href="#${t}" class="app-tab" data-tab="${t}"><span class="app-tab-icon" aria-hidden="true">${icon(TABS[t].icon, t === 'more' ? 'ic-dots' : '')}${t === 'check' ? '<span class="app-tab-badge" hidden></span>' : ''}</span><span class="app-tab-label">${TABS[t].label}</span></a>`).join('') + '</div>';
  $('#undo').innerHTML = icon('undo');
  $('#redo').innerHTML = icon('redo');
  $('#help').innerHTML = icon('keyboard');
  $('#prevm').innerHTML = icon('left');
  $('#nextm').innerHTML = icon('right');
  $('#autofill').innerHTML = `${icon('spark')}<span class="lbl">Auto-fill</span>`;
}

function markTabs() {
  const active = app.tab === 'people' ? 'more' : app.tab;
  document.querySelectorAll('#bottombar [data-tab]').forEach(a => {
    if (a.dataset.tab === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// Header parts are rewritten only when their text changes: it is redrawn after every edit, and rewriting the same
// markup still makes the browser restyle it (speed).
const headerSeen = new WeakMap();
function setHTML(el, html) { if (headerSeen.get(el) !== html) { el.innerHTML = html; headerSeen.set(el, html); } }
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

function renderHeader() {
  const state = app.store.get();
  const longM = M.fmtMonth(app.month);   // 'October 2026'; phones show 'Oct 2026'
  // the month is also a button to today (phones have no Today button); its own live region announces a new month
  setHTML($('#month'), `<span class="m-long">${esc(longM)}</span><span class="m-short" aria-hidden="true">${esc(longM.slice(0, 3) + ' ' + app.month.slice(0, 4))}</span><span class="sr-only">, go to today</span>`);
  setText($('#month-live'), longM);
  $('#today').title = 'Go to today (' + M.fmtDay(M.iso(new Date())) + ')';
  const u = $('#undo'), r = $('#redo');
  u.disabled = !app.store.canUndo();
  r.disabled = !app.store.canRedo();
  u.title = app.store.canUndo() ? `Undo ${app.store.undoLabel()} (Ctrl+Z)` : 'Nothing to undo';
  r.title = app.store.canRedo() ? `Redo ${app.store.redoLabel()} (Ctrl+Shift+Z)` : 'Nothing to redo';
  u.setAttribute('aria-label', app.store.canUndo() ? `Undo ${app.store.undoLabel()}` : 'Undo');
  r.setAttribute('aria-label', app.store.canRedo() ? `Redo ${app.store.redoLabel()}` : 'Redo');
  const hasStaff = !!(state.staff || []).length;
  const ev = hasStaff ? evaluation() : EMPTY_EVAL();
  const p = $('#problems');
  // nothing to check or fill before there are staff (a fresh install): no green "No problems", no Auto-fill
  // (the problems pill also hides on tabs without a month)
  p.hidden = !hasStaff || !MONTH_TABS.includes(app.tab);
  $('#autofill').disabled = !hasStaff;
  $('#autofill').title = hasStaff ? 'Auto-fill this month from the rules' : 'Add staff first (People)';
  const nFailed = (ev.failed || []).length;
  const bad = ev.hard || ev.error;
  p.className = 'problems ' + (bad ? 'has-hard' : 'is-ok');
  const hardTxt = ev.error ? 'Rule check failed' : ev.hard ? `${ev.hard} problem${ev.hard === 1 ? '' : 's'}` : 'No problems';
  const extra = nFailed ? `${nFailed} rule${nFailed === 1 ? '' : 's'} can't be checked` : ev.soft ? `${ev.soft} to improve` : '';
  setHTML(p, `${icon(bad ? 'alert' : 'ok')}<span class="p-hard">${hardTxt}</span>${extra ? `<span class="p-soft">${extra}</span>` : ''}`);
  p.setAttribute('aria-label', `${hardTxt}${extra ? `, ${extra}` : ''}. Open Check`);
  p.title = 'Rule check for ' + M.fmtMonth(app.month) + ': must-fix problems (hard rules) and things to improve (soft rules)';
  const bb = document.querySelector('#bottombar .app-tab-badge');
  if (bb) { bb.hidden = !ev.hard; setText(bb, ev.hard > 99 ? '99+' : String(ev.hard)); }
  const bbTab = document.querySelector('#bottombar .app-tab[data-tab="check"]');
  if (bbTab) bbTab.setAttribute('aria-label', ev.hard ? `Check, ${ev.hard} problems` : 'Check');
  // the screen head: the tab's large title (the bar shows it once it scrolls away), and the month where it matters
  // (not before there are staff: nothing to plan yet). A view may set its own title and a back button (setHead).
  const head = app.head && app.head.tab === app.tab ? app.head : null;
  const label = head?.title || TABS[app.tab]?.label || 'NTF Roster';
  const showMonth = hasStaff && MONTH_TABS.includes(app.tab);
  setText($('#large-title'), label);
  setText($('#bartitle'), showMonth && !head?.title ? `${label} · ${longM.slice(0, 3)} ${app.month.slice(0, 4)}` : label);
  $('.monthnav').hidden = !showMonth;
  $('#today').hidden = !showMonth;
  $('#autofill').hidden = !hasStaff || !AUTOFILL_TABS.includes(app.tab) || !!head?.noAutofill;
  // pushed screens (one person's month; People, under More) have a back button at the left of the bar
  const back = head?.back || (app.tab === 'people' ? { label: 'More', fn: () => go('more') } : null);
  const backBtn = $('#back');
  backBtn.hidden = !back;
  if (back) { setText(backBtn, back.label); backBtn.setAttribute('aria-label', `Back to ${back.label}`); backBtn.onclick = back.fn; }
  // phones, on the roster grid: the month moves into the top bar (always solid) and the screen head folds away, so
  // the grid gets the room (the grid itself never scrolls the page, so the large title could never collapse)
  const inBar = isPhone() && app.tab === 'roster' && showMonth && !head && document.body.classList.contains('roster-grid');
  const nav = $('.monthnav'), top = $('#top');
  if (inBar !== (nav.parentElement !== $('#screenhead'))) {
    if (inBar) $('#bartitle').after(nav);
    else $('#large-title').after(nav);
  }
  top.classList.toggle('bar-month', inBar);
  top.classList.toggle('app-bar--solid', inBar);
  markTabs();
  headKey = headState();
}

// A view's own screen head (null: the tab's): { title, back: { label, fn }, noAutofill }. Views call it on every
// render: the header is redrawn only when it changes (or the roster grid came or went: the month's place on phones).
let headKey = '';
const headState = () => JSON.stringify([app.tab, app.head?.title, app.head?.back?.label, !!app.head?.noAutofill, document.body.classList.contains('roster-grid'), isPhone()]);
function setHead(head) {
  app.head = head ? { ...head, tab: app.tab } : null;
  if (headState() !== headKey) renderHeader();
}

// ---------- router ----------
const current = { tab: '', key: '', view: null, el: null };
let routing = Promise.resolve();

function parseHash() {
  const h = location.hash.replace(/^#/, '');
  let raw;
  try { raw = decodeURIComponent(h); } catch (e) { raw = h; }   // a stray % in a link must not stop the app
  const [t, q] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(q || ''));
  const tab = TABS[t] ? t : (isPhone() ? 'day' : 'roster');
  return { tab, params, key: raw };
}

function go(tab, params = {}) {
  // a sheet just closed and its history entry is still being taken back: navigate once that has landed
  if (backPending) { const p = backPending; backPending = null; p.then(() => go(tab, params)); setTimeout(() => { if (backDone) { const r = backDone; backDone = null; r(); } }, 400); return; }
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
  const pm = monthFromParams(params);
  if (pm && pm !== app.month) { app.month = pm; evalCache = null; }
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
  const main = $('#view');
  main.innerHTML = '';
  main.dataset.tab = tab;
  document.body.dataset.tab = tab;
  document.body.classList.remove('is-welcome');
  if (window.scrollY) window.scrollTo(0, 0);   // a new tab starts at its large title
  const state = app.store.get();
  if (!(state.staff || []).length && (tab === 'roster' || tab === 'day' || tab === 'check')) {
    main.append(welcomeCard());
    document.body.classList.add('is-welcome');   // (a centred column, also on the roster's full-width screen)
    current.view = { welcome: true };
    return;
  }
  const el = h('div', { class: `view view-${tab}` });
  if (tab === 'more') el.append(phoneMoreLinks());
  const host = h('div', { class: 'view-host' });
  el.append(host);
  main.append(el);
  current.el = el;
  host.append(skeleton());   // the kit's loading rows (no spinner) while the screen's code loads the first time
  let mod;
  try {
    mod = await import(TABS[tab].mod);
  } catch (e) {
    console.warn(`Could not load ${TABS[tab].mod}`, e);
    if (current.tab !== tab) return;
    host.innerHTML = '';
    host.append(placeholder(tab));
    current.view = { placeholder: true };
    return;
  }
  if (current.tab !== tab || current.el !== el) return;   // the person moved on while it loaded
  host.innerHTML = '';
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
  if (app.head) { app.head = null; renderHeader(); }
}

function placeholder(tab, err) {
  return h('div', { class: 'app-card app-empty' },
    h('span', { class: 'app-empty-icon', html: icon(TABS[tab].icon) }),
    h('h2', { class: 'app-empty-title' }, `${TABS[tab].label} isn't ready yet`),
    h('p', { class: 'app-empty-text' }, err ? 'Something went wrong while opening this screen. Your roster is safe; try reloading the page.'
      : 'This part of NTF Roster is still being built. Your roster is safe; the other screens work.'),
    h('a', { href: '#roster', class: 'app-btn app-btn--secondary' }, 'Back to the roster'));
}

// Loading: rows in the shape of the real list, shimmering (the kit's skeleton), never a spinner.
function skeleton() {
  const row = () => h('li', null, h('div', { class: 'app-row' }, h('span', { class: 'app-skeleton app-skeleton--tile' }),
    h('span', { class: 'app-row-body' }, h('span', { class: 'app-skeleton app-skeleton--line' }), h('span', { class: 'app-skeleton app-skeleton--short' }))));
  return h('div', { class: 'app-section' }, h('ul', { class: 'app-list', 'aria-busy': 'true', 'aria-label': 'Loading' }, row(), row(), row()));
}

// People lives under More (five tabs at most): a grouped row at the top of More.
function phoneMoreLinks() {
  return h('div', { class: 'app-section' }, h('ul', { class: 'app-list' }, h('li', null,
    h('a', { href: '#people', class: 'app-row link-card' },
      h('span', { class: 'app-row-icon', html: icon('people') }),
      h('span', { class: 'app-row-body' }, h('span', { class: 'app-row-title' }, 'People'), h('span', { class: 'app-row-sub' }, 'Staff, groups, tags and duty codes')),
      h('span', { class: 'app-row-chevron', 'aria-hidden': 'true' })))));
}

function welcomeCard() {
  return h('div', { class: 'welcome' },
    h('section', { class: 'app-card app-empty welcome-card', 'aria-labelledby': 'welcome-h' },
      h('span', { class: 'app-empty-icon', html: icon('grid') }),
      h('h2', { class: 'app-empty-title', id: 'welcome-h' }, 'Welcome to NTF Roster'),
      h('p', { class: 'app-empty-text' }, 'Plan the monthly calls, PM shifts and clinics together with leave and requests, check them against your rules, and fill the gaps automatically.'),
      h('p', { class: 'app-empty-text' }, 'Start by bringing in the department list. Everything stays in this browser until team sync is set up.'),
      // the first step's buttons straight away (on a phone the list below would push them under the tab bar)
      h('div', { class: 'app-btn-stack welcome-actions' },
        h('button', { type: 'button', class: 'app-btn app-btn--primary', onclick: () => go('more'), html: `${icon('upload')}<span>Import Excel sheet</span>` }),
        h('button', { type: 'button', class: 'app-btn app-btn--secondary', onclick: () => go('people'), html: `${icon('plus')}<span>Add staff</span>` }),
        h('a', { class: 'app-btn app-btn--plain', href: './?demo', target: '_blank', rel: 'noopener', html: `${icon('eye')}<span>Try the practice department</span>` })),
      // the next steps, in order; the default rules are already on, with numbers that are guesses
      h('h3', { class: 'welcome-h' }, 'How it works'),
      h('ol', { class: 'welcome-steps' },
        h('li', null, 'Add your staff (import the Excel sheet, or add them under People).'),
        h('li', null, 'Enter leave and requests on the roster (the Excel import brings them in too).'),
        h('li', null, `Check the rules: ${(app.store.get().rules || []).filter(r => r.enabled !== false).length} default rules are already on, and their numbers (calls a month, people on call each night) are guesses.`),
        h('li', null, 'Press Auto-fill, look at the preview, then Apply.'))));
}

// ---------- bars ----------
// Practice: a badge at the left of the top bar on every screen; it opens a small sheet with Reset and Leave.
function renderDemoBar() {
  const bar = $('#demobar');
  if (!app.isDemo) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = '';
  bar.append(h('button', { type: 'button', class: 'demo-pill', 'aria-label': 'Practice: a made-up department. Reset or leave practice', onclick: practiceSheet },
    h('span', { class: 'app-badge app-badge--warn' }, 'Practice')));
}

function practiceSheet() {
  sheet({
    title: 'Practice department',
    body: h('p', { class: 'confirm-msg' }, 'A made-up department for trying things out, with invented people, leave, requests and rules. Changes stay in this browser and never reach your own roster.'),
    actions: [
      { label: 'Reset practice', fn: () => { setTimeout(resetDemo, 0); } },
      { label: 'Leave practice', primary: true, fn: () => { location.href = './'; } },
    ],
  });
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
    h('button', { type: 'button', class: 'app-btn app-btn--danger app-btn--compact', onclick: downloadBackup }, 'Download backup'),
    h('button', { type: 'button', class: 'app-bar-btn', 'aria-label': 'Dismiss', html: icon('close'), onclick: () => { bar.hidden = true; } }));
}

// The saved roster couldn't be read: it is kept aside, and nothing is saved over it until the person chooses.
function showDamaged() {
  const bar = $('#savebar');
  const dmg = app.store.damaged;
  bar.hidden = false;
  bar.innerHTML = '';
  const download = () => {
    const blob = new Blob([dmg.raw], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `ntf-roster-damaged-${M.iso(new Date())}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  bar.append(
    h('span', null, 'The roster saved in this browser is damaged and could not be opened. Nothing will be saved over it until you choose.'),
    h('button', { type: 'button', class: 'app-btn app-btn--outline app-btn--compact', onclick: download }, 'Download damaged copy'),
    h('button', {
      type: 'button', class: 'app-btn app-btn--danger app-btn--compact', onclick: async () => {
        const ok = await confirmBox('Start again here? The damaged copy is replaced by what you see now. Download it first if you may need it.', { ok: 'Start again' });
        if (!ok) return;
        app.store.clearDamaged();
        bar.hidden = true;
      },
    }, 'Start again'));
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
  sheet({ title: 'Keyboard shortcuts', body: tbl });   // read only: the X closes it
}

function isTyping(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function onKeydown(e) {
  const mod = e.ctrlKey || e.metaKey;
  if (topSheet() && !mod) return;
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

// Today: this month, with today's column (roster) or today (day view) in view.
function goToday() {
  const today = M.iso(new Date());
  app.selectedCell = { date: today, staffId: null };
  if (app.month !== thisMonth()) { setMonth(thisMonth()); return; }
  if (current.view && typeof current.view.update === 'function') {
    try { current.view.update(app.store.get(), { month: true }); } catch (e) { console.error(e); }
  }
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
  const main = $('#view');
  main.innerHTML = '';
  main.append(h('div', { class: 'app-card app-empty' }, h('h2', { class: 'app-empty-title' }, 'NTF Roster could not start'), h('p', { class: 'app-empty-text' }, msg)));
}

// The large title collapses into the top bar once it scrolls under it (the kit's IntersectionObserver).
function watchLargeTitle() {
  const bar = $('#top'), title = $('#large-title');
  if (!('IntersectionObserver' in window)) { bar.classList.add('is-collapsed'); return; }
  let io = null;
  const observe = () => {
    if (io) io.disconnect();
    io = new IntersectionObserver(e => bar.classList.toggle('is-collapsed', !e[0].isIntersecting),
      { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px`, threshold: 0 });
    io.observe(title);
  };
  observe();
  return observe;   // call again when the bar's height changes (the practice band)
}

async function start() {
  const demo = new URLSearchParams(location.search).has('demo');
  // Ask for every module the first screen needs at once, not one after another (each is a round trip on a slow
  // line): the model, rules, store, the practice department and the first screen's own view (from the link; phones
  // open on Day). Each is still awaited, and handled, where it was before.
  const quiet = p => { p.catch(() => {}); return p; };
  const pM = quiet(import('./model.js')), pR = quiet(import('./rules.js')), pS = quiet(import('./store.js'));
  const pD = demo ? quiet(import('./demo.js')) : null;
  quiet(import((TABS[location.hash.replace(/^#/, '').split('?')[0]] || TABS[isPhone() ? 'day' : 'roster']).mod));
  try {
    M = await pM;
  } catch (e) {
    console.error(e);
    fatal('A part of the app did not load. Check your connection and reload the page.');
    return;
  }
  try { R = await pR; } catch (e) { console.warn('rules.js not loaded; rule checks are off', e); }
  app.model = M; app.rules = R;
  app.isDemo = demo;
  let demoState = null;
  if (demo) {
    try { ({ demoState } = await pD); } catch (e) { console.warn('demo.js not loaded; starting empty', e); }
  }
  const { createStore } = await pS;
  app.store = createStore({
    demo,
    fallback: () => (demo && typeof demoState === 'function' ? demoState(M.iso(new Date())) : M.defaultState()),
  });
  app.store.onSaveError = showSaveError;
  if (app.store.damaged) showDamaged();
  if (demo) document.title = 'NTF Roster (practice)';

  // Month on screen: the hash (?m=), else this month.
  const hp = parseHash().params;
  app.month = monthFromParams(hp) || thisMonth();

  renderNav();
  renderDemoBar();
  renderHeader();
  const rewatchTitle = watchLargeTitle();
  document.addEventListener('touchstart', () => {}, { passive: true });   // iOS shows :active press states only with this

  $('#undo').addEventListener('click', doUndo);
  $('#redo').addEventListener('click', doRedo);
  $('#help').addEventListener('click', shortcutsSheet);
  $('#prevm').addEventListener('click', () => setMonth(M.addMonths(app.month, -1)));
  $('#nextm').addEventListener('click', () => setMonth(M.addMonths(app.month, 1)));
  $('#today').addEventListener('click', goToday);
  $('#month').addEventListener('click', goToday);
  $('#autofill').addEventListener('click', openAutofill);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', route);

  let wasPhone = isPhone();
  window.matchMedia(PHONE_MQ).addEventListener('change', () => {
    const now = isPhone();
    if (now === wasPhone) return;
    wasPhone = now;
    renderHeader();
    if (rewatchTitle) rewatchTitle();
    if (current.view && typeof current.view.update === 'function') current.view.update(app.store.get(), { resize: true });
  });

  app.store.subscribe((state, info) => {
    evalCache = null;
    clearErrorToasts();
    if (info && info.source === 'external') toast(info.label, { kind: /^Not saved/.test(info.label) ? 'error' : 'ok' });
    renderHeader();
    if (current.view?.welcome && (state.staff || []).length) { route(); return; }
    if (current.view && typeof current.view.update === 'function') {
      try { current.view.update(state, info); } catch (e) { console.error(e); }
    }
  });

  await route();
  document.body.classList.add('ready');
  window.ntfApp = app;   // handy in the console and for browser tests

  // Offline app shell (sw.js): offer the new version when one has downloaded.
  import('./version.js')
    .then(m => m.registerSW({ onUpdate: apply => toast('Update available', { action: { label: 'Reload', fn: apply }, ms: 0 }) }))
    .catch(e => console.warn('version.js not loaded', e));
}

start();
