// Shared UI state and helpers for the evals screens (ui-*.js). app.js owns boot, auth, tabs and routing.
// Helpers are copied from logbook/js/ui-core.js; class names are listed at the top of style.css.

import * as cloud from './cloud.js';
import { statusOf } from './engine.js';

export { cloud };

// ---------- state ----------

export const S = {
  user: null,          // { email, name, uid }
  roles: { admin: false, pd: false, resident: null, faculty: null, application: null },
  mine: [],            // evaluations where residentEmail == me (resident)
  assigned: [],        // evaluations where assessorEmail == me (faculty)
  all: [],             // every evaluation (pd/admin)
  faculty: [],         // faculty list, for the assessor picker
  loaded: { mine: false, assigned: false, all: false },
  route: 'home',       // first part of the hash, e.g. 'e' for #e/{id}
  arg: null,           // the rest, e.g. the id
  demoRole: null,      // 'resident' | 'assessor' | 'admin' in the demo
};

// Set by app.js: render() repaints the current screen; dataChanged() schedules a repaint
// that waits while someone is typing; refreshRoles() reloads the roles (after approvals etc.).
export const hooks = { render() {}, dataChanged() {}, refreshRoles: async () => {} };

// Role helpers (S.roles.resident / faculty are the list docs, or null)
export const isResident = () => !!S.roles.resident;
export const isFaculty = () => !!(S.roles.faculty && S.roles.faculty.status !== 'INACTIVE');
export const isStaff = () => !!(S.roles.admin || S.roles.pd);
export const EDIT_MS = 15 * 60e3;   // the assessor may change a submitted form for 15 min
// faculty set INACTIVE keep access while requests sent to them are still open, or still editable
export const hasRole = () => isResident() || isFaculty() || isStaff()
  || (!!S.roles.faculty && (S.assigned || []).some(ev => ev.status === 'requested'
    || (ev.status === 'submitted' && Date.now() < (toMs(ev.submittedAt) || 0) + EDIT_MS)));

// The assessor's answers on this device (ui-form), kept until the server holds the outcome
// (submitted, declined, cancelled) with no write of ours pending, so an offline submit that the
// server later refuses loses nothing. app.js calls pruneDrafts from the assigned watcher.
export const draftKey = id => `evals-draft-${id}`;
// A draft saved after the server's last change (an edit in the 15-minute window that hasn't reached
// the server, or that it refused) is kept; both times come from this phone's clock.
export function pruneDrafts(list, meta) {
  if (meta && (meta.hasPendingWrites || meta.fromCache)) return;
  for (const ev of list || []) {
    if (ev.status === 'requested') continue;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey(ev.id)) || 'null');
      if (d && ev.status === 'submitted' && (d.at || 0) > (toMs(ev.updatedAt) || 0) && Date.now() - d.at < 7 * 864e5) continue;
      localStorage.removeItem(draftKey(ev.id));
    } catch {}
  }
}

// Sign out, but first warn when answers on this phone haven't reached the server: signing out
// deletes this device's offline copy, unsent forms included.
export async function signOutSafely() {
  if (await cloud.hasUnsentWrites()) {
    const ok = await confirmBox('Not sent yet',
      'Some answers on this phone haven’t reached the server yet (no signal?). Signing out now deletes them. Wait until you have signal, then sign out.',
      'Sign out anyway', true);
    if (!ok) return;
  }
  try { await cloud.signOut(); }
  catch (err) { console.warn(err); toast('Couldn’t sign out. Check your signal and try again.'); }
}

// A request that needs the resident: declined, new feedback, or waiting 20 h or more (nudge).
export const NUDGE_HOURS = 20;
export const ageHours = (ev, now = Date.now()) => {
  const t = toMs(ev.chasedAt) || toMs(ev.requestedAt) || toMs(ev.createdAt);
  return t ? (now - t) / 36e5 : 0;
};
export const needsAction = (ev, now = Date.now()) => ev.status === 'declined'
  || (ev.status === 'submitted' && !ev.seenAt)
  || (ev.status === 'requested' && ageHours(ev, now) >= NUDGE_HOURS);

// ---------- theme ----------
// Light (default), dark, or auto (follows the phone). Kept on this device; index.html applies it
// before the first paint, and More → Settings changes it.
export const THEME_KEY = 'evals-theme';
export const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']];
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
export function themePref() {
  try { const t = localStorage.getItem(THEME_KEY); return THEMES.some(([v]) => v === t) ? t : 'light'; } catch { return 'light'; }
}
export function applyTheme(pref = themePref()) {
  if (typeof document === 'undefined') return;
  const dark = pref === 'dark' || (pref === 'auto' && !!darkQuery?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#161618' : '#f9f9fb');
}
export function setTheme(pref) {
  try { pref === 'light' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, pref); } catch { /* storage blocked */ }
  applyTheme(pref);
}
darkQuery?.addEventListener?.('change', () => { if (themePref() === 'auto') applyTheme('auto'); });

// ---------- tiny DOM helper (as in nuh-roster / logbook) ----------

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'ref') v(el);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

// replaceChildren, skipping null/false (replaceChildren would print them as text)
export const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));

export const add = (el, ...kids) => { el.append(...kids.flat(Infinity).filter(k => k != null && k !== false)); return el; };

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

// toast('Saved', { action: 'Undo', onaction }) — one at a time, the newest wins.
// The app kit's toast (nuhsdesign/app.js aToast) once it has loaded, else the page's own #toast.
export function toast(msg, { action, onaction, ms = 4500 } = {}) {
  if (typeof window !== 'undefined' && window.aToast) { window.aToast(msg, { action, onAction: onaction, ms }); return; }
  const t = document.getElementById('toast');
  if (!t) return;
  fill(t, h('span', {}, msg), action ? h('button', { onclick: () => { t.classList.remove('show', 'is-shown'); onaction(); } }, action) : null);
  t.classList.add('show', 'is-shown');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show', 'is-shown'), ms);
}

export function download(name, blob) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// A modal dialog: the app kit's bottom sheet (nuhsdesign/app.js aSheet: slides up; drag down, tap outside or
// Esc closes it; a centred card on wide screens). Returns { el, close }.
const kitSheet = () => (typeof window !== 'undefined' && window.aSheet) || null;
export function modal(title, body, { onclose, cls = '' } = {}) {
  // the title takes the initial focus, so phones don't pop a keyboard on open
  const el = h('dialog', { class: `a-sheet e-dialog ${cls}` },
    h('div', { class: 'a-sheet-head' }, h('span'), h('h2', { tabindex: '-1', autofocus: true }, title), h('span')),
    h('div', { class: 'a-sheet-body e-dialog__body' }, body));
  el.addEventListener('close', () => { el.remove(); onclose && onclose(); });
  document.body.append(el);
  const kit = kitSheet();
  if (kit) kit.open(el);
  else { el.addEventListener('click', e => { if (e.target === el) el.close(); }); el.showModal(); }
  return { el, close: () => (kit ? kit.close(el) : el.close()) };
}

// The phone's Back button closes any open sheet or full-screen overlay (rather than leaving it over
// the page it went back to).
if (typeof window !== 'undefined') window.addEventListener('popstate', () => {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  for (const o of document.querySelectorAll('.e-qr--full')) o.remove();
});

// A yes/no question: the app kit's centred alert (Cancel, then the answer; red when it destroys something).
export function confirmBox(title, text, okLabel = 'OK', danger = false) {
  return new Promise(resolve => {
    let ok = false;
    const kit = kitSheet();
    const close = () => (kit ? kit.close(el) : el.close());
    const el = h('dialog', { class: 'a-alert e-confirm', 'aria-labelledby': 'e-confirm-title' },
      h('h2', { id: 'e-confirm-title', tabindex: '-1', autofocus: true }, title),
      h('p', {}, text),
      h('div', { class: 'a-alert-actions' },
        h('button', { type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', { type: 'button', class: danger ? 'is-default is-danger' : 'is-default', onclick: () => { ok = true; close(); } }, okLabel)));
    el.addEventListener('close', () => { el.remove(); resolve(ok); });
    document.body.append(el);
    if (kit) kit.open(el); else el.showModal();
  });
}

// The email an assessor link was sent to (?as=), or ''.
export function linkAccount() {
  try { return (new URLSearchParams(location.search).get('as') || '').trim().toLowerCase(); } catch { return ''; }
}
// Apps that open links in their own built-in browser, where Google refuses to sign in
// ("disallowed_useragent"): WhatsApp, Facebook, Instagram, LINE, WeChat, Telegram, and Android web views.
export const inAppBrowser = () => typeof navigator !== 'undefined'
  && /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|Telegram|; wv\)/i.test(navigator.userAgent || '');
// A card telling people to open the page in Chrome or Safari, with a Copy link button (and, on
// Android, a button that opens Chrome directly).
export function openInBrowserCard() {
  const url = location.href;
  const android = /Android/i.test(navigator.userAgent || '');
  const chrome = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied: paste it into Chrome or Safari'); }
    catch { toast(url, { ms: 9000 }); }
  };
  return h('section', { class: 'e-card e-inapp', role: 'alert' },
    h('h2', { class: 'e-h3' }, 'Open this in Chrome or Safari'),
    h('p', {}, 'Google doesn’t allow signing in inside WhatsApp’s (or Facebook’s, Instagram’s…) own browser. ',
      android ? 'Tap Open in Chrome, or ' : 'Tap ⋯ or the share button and choose “Open in Safari”, or ', 'copy the link and paste it into your browser.'),
    h('div', { class: 'e-actions' },
      android ? h('a', { class: 'a-btn', href: chrome }, 'Open in Chrome') : null,
      h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: copy }, 'Copy link')));
}

// Signed in with an account that isn't the one an assessor link was sent to (often a personal Gmail
// instead of the hospital one): say so first, with Switch account, before offering to apply.
export function wrongAccountCard() {
  const as = linkAccount();
  return h('section', { class: 'e-card e-wrongacct', role: 'alert' },
    h('h2', { class: 'e-h3' }, 'This evaluation was sent to another account'),
    h('p', {}, 'You’re signed in as ', h('b', {}, S.user?.email || ''), '.',
      as ? [' The request went to ', h('b', {}, as), '.'] : ' Sign in with the account the resident chose.'),
    h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--block e-btn-big', type: 'button', onclick: switchAccount }, 'Switch account')));
}
export async function switchAccount() {
  try { await cloud.signOut(); await cloud.signIn(linkAccount() || undefined); }
  catch (err) { toast('Couldn’t switch account. ' + errText(err)); }
}

// Plain words for the errors people actually meet; the code stays in brackets for support.
export function errText(e) {
  const code = String(e?.code || '').replace(/^firestore\//, '');
  const msg = {
    'permission-denied': 'You can’t change this any more (it may have been cancelled, reassigned or closed).',
    'unavailable': 'No connection. Check your signal and try again.',
    'auth/network-request-failed': 'No connection. Check your signal and try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before it finished. Try again.',
    'auth/cancelled-popup-request': 'The sign-in window was closed before it finished. Try again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Try again, or allow pop-ups for this site.',
    'auth/unauthorized-domain': 'Sign-in doesn’t work from this address. Open apmes.anawj.com/evals/ instead.',
    'auth/web-storage-unsupported': 'This browser blocks sign-in (private mode or blocked cookies). Open the link in Chrome or Safari.',
  }[code];
  if (msg) return msg;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'No connection. Check your signal and try again.';
  return `Something went wrong. Try again${code ? ` (${code})` : ''}.`;
}

// ---------- routing ----------

// go('pending/history'), go('#e/abc') — app.js listens for hashchange.
export function go(route) {
  const r = String(route || '').replace(/^#/, '');
  if (location.hash.replace(/^#/, '') === r) { hooks.render(); return; }
  location.hash = r;
}

// ---------- formatting ----------

// Accepts ms, Date, 'YYYY-MM-DD', ISO strings or a Firestore Timestamp.
export function toMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'object' && 'seconds' in v) return v.seconds * 1000;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

// '12 Oct 2026' (or '12 Oct 2026, 14:05' with { time: true })
export function fmtDate(v, { time = false } = {}) {
  const ms = toMs(v);
  if (ms == null) return '';
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  if (time) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
  return new Date(ms).toLocaleString('en-GB', opts);
}

// '5 min ago', '3 h ago', '2 d ago'
export function fmtAgo(v, now = Date.now()) {
  const ms = toMs(v);
  if (ms == null) return '';
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.floor(m / 60);
  if (hrs < 48) return `${hrs} h ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

// 'Dr Demo Faculty' -> 'DF'; an email falls back to its first letters.
export function initials(name) {
  const s = String(name || '').split('@')[0].replace(/[._-]+/g, ' ');
  const words = s.split(/\s+/).filter(w => w && !/^(dr|prof|mr|mrs|ms|miss|a\/prof|assoc)\.?$/i.test(w));
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// Status chip for an evaluation: <span class="e-chip e-chip--overdue">Overdue</span>
export function statusChip(ev, now = Date.now()) {
  const s = statusOf(ev, now);
  return h('span', { class: `a-pill ${PILL[s.key] || ''} e-chip e-chip--${s.key}` }, s.label);
}
// the app kit's pill colour for each status (engine.statusOf keys); grey for the rest
export const PILL = { submitted: 'a-pill--ok', declined: 'a-pill--danger', overdue: 'a-pill--danger', sent: 'a-pill--tint', opened: 'a-pill--tint', 'in-progress': 'a-pill--warn', info: 'a-pill--tint' };

export const toolLabel = t => ({ DOPS: 'DOPS', MiniCEX: 'Mini-CEX', EBD: 'EBD' }[t] || t || '');

// ---------- small building blocks (optional, keep the screens consistent) ----------

export const avatar = (name, cls = '') => h('span', { class: `a-avatar e-avatar ${cls}`, 'aria-hidden': 'true' }, initials(name));

// A list row: row({ name, title, meta, chip, dot, href | onclick })
// stacked: the chip goes under the title (full-width titles on phones), meta may wrap to 2 lines
export function row({ name, title, meta, chip, dot, href, onclick, cls = '', stacked = false }) {
  const kids = [
    name != null ? avatar(name) : null,
    h('span', { class: 'e-row__body' },
      h('span', { class: 'e-row__title' }, title),
      meta ? h('span', { class: 'e-row__meta' }, meta) : null,
      stacked && chip ? h('span', { class: 'e-row__chips' }, chip) : null),
    dot ? h('span', { class: 'e-dot', title: 'Partly complete' }) : null,
    stacked ? null : chip || null,
    chev(),
  ];
  if (stacked) cls += ' e-row--stacked';
  return href ? h('a', { class: `a-row e-row ${cls}`, href }, kids) : h('button', { type: 'button', class: `a-row e-row ${cls}`, onclick }, kids);
}
// the app kit's chevron at the end of a row that opens something
export const chev = () => h('span', { class: 'a-chev e-row__chev', 'aria-hidden': 'true' });

export const empty = (title, text, action) => h('div', { class: 'a-empty e-empty' },
  icon('clipboard', 'e-empty__icon'), h('p', { class: 'e-empty__title' }, title), text ? h('p', {}, text) : null, action || null);

// Segment control: segment([{ id, label, count }], current, onpick)
export function segment(items, current, onpick) {
  return h('div', { class: 'a-seg e-segment', role: 'tablist' }, items.map(it => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(it.id === current), onclick: () => onpick(it.id),
  }, it.label, it.count ? h('span', { class: 'a-badge e-badge' }, it.count) : null)));
}

// ---------- icons (inline SVG, 24x24, stroked) ----------

const ICONS = {
  home: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  chart: 'M4 20V12M10 20V5M16 20v-9M22 20H2',
  clipboard: 'M9 4h6v3H9zM9 5.5H6v15h12v-15h-3M9 12h6M9 16h4',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M18 15a6 6 0 0 1 4 5.5V21',
  more: 'M3.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0zM10.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0zM17.5 12a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2z',
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M6 6l12 12M18 6L6 18',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L21 21',
  chevron: 'M9 5l7 7-7 7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3',
};
export function icon(name, cls = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', `e-ico ${cls}`.trim()); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] || ICONS.info);
  svg.append(path);
  return svg;
}
