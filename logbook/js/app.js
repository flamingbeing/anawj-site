// APMES Logbook: boot, sign-in, tabs and offline support. Each screen lives in its own ui-*.js file;
// shared state and helpers are in ui-core.js. Case data comes from cloud.js (Firestore, or the
// in-browser demo backend with ?demo).

import { S, hooks, h, toast, cloud, writes, setCases, scheduleSummary, fill, resetCaches, patchLogbook, confirmBox, fileButton, modal, download, todayISO, settings, setCategoryNames, categoryNames as categoryNamesNow } from './ui-core.js';
import { renderLog, focusLog, logCasesChanged, clearDrafts, SHARED_KEY } from './ui-log.js';
import { renderRecovery } from './ui-recovery.js';
import { renderLogbook } from './ui-logbook.js';
import { renderProgress, renderTotals } from './ui-progress.js';
import { applyCompact, cachedCompact, applyTheme, cachedTheme, applyTextSize, cachedTextSize, applyZoom, cachedZoom, stepZoom, applyAccent, adoptDisplay, applyDisplay, applyCustomCss, display, setDisplay, resetDisplay, DISPLAY_KEYS, renderTagEditor, renderDisplay, renderDisplayAdvanced, renderLogging, renderLoggingAdvanced, renderReflectionSettings, renderMarkdownSettings, START_TABS, privacyCard, creditsCard, signOutCard } from './ui-settings.js';
import { renderAccount, flush as flushProfile } from './ui-account.js';
import { renderAdmin, leaveAdmin } from './ui-admin.js';
import { renderReflect, watchMyReflections, renderExportPage, renderChoosePage } from './ui-reflect.js';
import { downloadExcel, uploadExcel } from './ui-logbook.js';
import { downloadNotes } from './ui-notes.js';
import { cloudSaveSection, remindBackup } from './cloud-save.js';
import { backupCard } from './backup.js';
import { createNavigation } from './navigation.js';
import { settingsFile, readSettingsFile } from './settings-file.js';
import { purgeExpired, openBin } from './bin.js';

// Tab icons: tiny inline SVG paths (24x24, stroked), so they look the same on every phone.
const ICONS = {
  log: 'M12 5v14M5 12h14',
  logbook: 'M4 5h16M4 10h16M4 15h16M4 20h10',
  progress: 'M5 20V12M10 20V6M15 20v-9M20 20V9',
  totals: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  reflect: 'M4 19.5V5a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2.5zM6 21h12v-4M8 7h6M8 11h4',
  admin: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',   // a lock: admins only
  recovery: 'M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2',
  data: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  display: 'M3 5h18v12H3zM8 21h8M12 17v4',
  logging: 'M12 5v14M5 12h14',
  tags: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
  reflset: 'M4 19.5V5a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2.5zM6 21h12v-4',
  sharefmt: 'M9 9h10v12H9zM5 15V3h10',
  bin: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  more: 'M5 12h.01M12 12h.01M19 12h.01M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M18 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
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
  { id: 'log', label: 'Case', render: renderLog },
  { id: 'logbook', label: 'Logbook', render: renderLogbook },
  { id: 'reflect', label: 'Reflections', render: renderReflect },
  { id: 'progress', label: 'Analytics', render: renderProgress },
  // five tabs on the bar; the rest live under More (still reachable by #totals, #account, #settings)
  { id: 'more', label: 'More', render: () => renderMore() },
  // under Analytics: how your counts compare with your intake
  { id: 'totals', label: 'Totals', render: renderTotals, hidden: true, under: 'progress', unlisted: true },
  { id: 'account', label: 'Account', render: renderAccount, hidden: true, under: 'more', desc: 'Your name and portfolio details (Section 1); delete account' },
  { id: 'settings', label: 'Settings', render: () => renderSettingsMenu(), hidden: true, under: 'more', desc: 'Display, logging, tag editor, Markdown, recycle bin' },
  { id: 'recovery', label: 'Recent changes / Recover drafts', render: renderRecovery, hidden: true, under: 'more', desc: 'Retry sync, recover unfinished drafts and restore recent versions on this device' },
  { id: 'data', label: 'Export / Import', render: () => renderDataPage(), hidden: true, under: 'more', desc: 'Export the portfolio (Word); import reflections from Word; backup file, Excel and notes apps' },
  { id: 'reflimport', label: 'Import reflections from Word', render: () => renderReflImport(), hidden: true, under: 'data', unlisted: true },
  // Settings' own pages (not in the More list)
  { id: 'display', label: 'Display', render: renderDisplay, hidden: true, under: 'settings', unlisted: true, desc: 'Light or dark, colour, zoom, text size, borders; fonts and more under Advanced' },
  { id: 'displayadv', label: 'Advanced display', render: renderDisplayAdvanced, hidden: true, under: 'display', unlisted: true },
  { id: 'loggingadv', label: 'Advanced logging', render: renderLoggingAdvanced, hidden: true, under: 'logging', unlisted: true },
  { id: 'sharefmt', label: 'Markdown', render: renderMarkdownSettings, hidden: true, under: 'settings', unlisted: true, desc: 'How Copy, Share and the notes export read' },
  { id: 'logging', label: 'Logging', render: renderLogging, hidden: true, under: 'settings', unlisted: true, desc: 'Suggestions, first field, the Enter key, dates, after Save; more under Advanced' },
  // from Reflections → More tools
  { id: 'reflset', label: 'Reflections', render: renderReflectionSettings, hidden: true, under: 'settings', unlisted: true, desc: 'New reflections in the export, photo sizes' },
  // opened from More → Export / Import (not in the More list)
  { id: 'export', label: 'Export portfolio', render: () => renderExportPage(), hidden: true, under: 'data', unlisted: true },
  { id: 'choose', label: 'Export portfolio', render: renderChoosePage, hidden: true, under: 'export', unlisted: true },
  // admins open it from More
  { id: 'admin', label: 'Admin portal', render: renderAdmin, admin: true, hidden: true, under: 'more', desc: 'Admins only: residents, ready portfolios, portfolio template, default tag names' },
  // opened from Settings
  { id: 'tags', label: 'Tag editor', render: renderTagEditor, hidden: true, under: 'settings', unlisted: true, desc: 'APMES and personal tags, shorthand, tag groups' },
];

// A list of pages, like the More list: icon, name, one line, ›.
const menuItem = (id, label, desc, onclick) => h('li', {}, h('a', { href: '#' + id, 'data-go': id, onclick: e => { e.preventDefault(); onclick ? onclick() : go(id); } },
  icon(id), h('span', { class: 'mt' }, h('b', {}, label), h('small', {}, desc)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));

function renderMore() {
  const items = visibleTabs().filter(t => t.under === 'more' && !t.unlisted);
  return h('div', {},
    h('section', { class: 'card more-list' }, h('h2', {}, 'More'),
      h('ul', {}, items.map(t => menuItem(t.id, t.label, t.desc)))),
    privacyCard(),
    creditsCard(),
    installCard(),
    signOutCard());
}

// "Install the app" (More): Android and desktop Chrome/Edge offer their own install prompt, which we
// keep from beforeinstallprompt; iPhone/iPad Safari has none, so it gets the Share → Add to Home Screen
// steps. Hidden once installed (running standalone), or after "Not now" on this device.
let installPrompt = null;
const INSTALL_KEY = 'apmes-logbook-install-dismissed';
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (S.tab === 'more') render(); });
addEventListener('appinstalled', () => { installPrompt = null; if (S.tab === 'more') render(); });
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
function installCard() {
  let dismissed = false;
  try { dismissed = !!localStorage.getItem(INSTALL_KEY); } catch { /* storage blocked */ }
  if (standalone() || dismissed || (!installPrompt && !isIOS())) return null;
  const notNow = h('button', { class: 'small linkish', onclick: e => { try { localStorage.setItem(INSTALL_KEY, '1'); } catch { /* ignore */ } e.target.closest('section').remove(); } }, 'Not now');
  return h('section', { class: 'card install-card' },
    h('h2', {}, 'Install the app'),
    h('p', { class: 'hint' }, 'Open the logbook from your home screen like any other app: full screen, quicker to reach, and it works with no signal.'),
    installPrompt
      ? h('div', { class: 'bar', style: 'margin-bottom:0' },
        h('button', { class: 'primary', onclick: async () => {
          const ev = installPrompt; installPrompt = null;
          try { ev.prompt(); const r = await ev.userChoice; if (r && r.outcome === 'accepted') toast('Installing…'); } catch { /* the browser said no */ }
          render();
        } }, 'Install'), h('span', { class: 'grow' }), notNow)
      : [h('ol', { class: 'install-steps' },
        h('li', {}, 'Open this page in ', h('b', {}, 'Safari'), ' (not Chrome).'),
        h('li', {}, 'Tap ', h('b', {}, 'Share'), ' (the square with an arrow: at the bottom, or the top on iPad).'),
        h('li', {}, 'Choose ', h('b', {}, 'Add to Home Screen'), ', then ', h('b', {}, 'Add'), '.')),
        h('div', { class: 'bar', style: 'margin-bottom:0' }, h('span', { class: 'grow' }), notNow)]);
}

// Settings: a short menu of its pages (residency year on top for people not on the programme list)
function renderSettingsMenu() {
  const order = ['display', 'logging', 'tags', 'reflset', 'sharefmt'];
  const pages = TABS.filter(t => t.under === 'settings').sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return h('div', {},
    h('section', { class: 'card more-list' }, h('h2', {}, 'Settings'),
      h('ul', {}, pages.map(t => menuItem(t.id, t.label, t.desc)),
        menuItem('bin', 'Recycle bin', 'Deleted cases and reflections, kept for 30 days', () => openBin()))),
    settingsFileCard(),
    connectClaudeCard());
}

// Connect Claude (advanced): the read-only MCP server residents run on their own computer (logbook/mcp/README.md)
const MCP_README = 'https://github.com/flamingbeing/anawj-site/tree/main/logbook/mcp#readme';
function connectClaudeCard() {
  return h('section', { class: 'card' },
    h('h2', {}, 'Connect Claude (advanced)'),
    h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'Ask Claude Desktop or Claude Code about your own logbook ("which tags am I behind on?"). A small read-only program on your computer signs in as you; it can\u2019t change anything.'),
    h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'What it reads is sent to Claude: check hospital policy before using it, and keep cases de-identified.'),
    h('div', { class: 'bar', style: 'margin-bottom:0' }, h('a', { class: 'btn', href: MCP_README, target: '_blank', rel: 'noopener' }, 'How to set it up ›')));
}

// Settings export / import: preferences, tags, shorthand, tag groups, formats as one small file
// (settings-file.js). Never cases, reflections or portfolio details.
function settingsFileCard() {
  const exportIt = () => {
    // this device's display settings travel in the file (in place of any old ones in the account)
    const dev = Object.fromEntries(DISPLAY_KEYS.filter(k => !/^customCss/.test(k)).map(k => [k, display()[k]]).filter(([, v]) => v != null));   // custom CSS never goes in a file to share
    const plain = Object.fromEntries(Object.entries((S.logbook && S.logbook.settings) || {}).filter(([k]) => !DISPLAY_KEYS.includes(k)));
    const f = settingsFile({ ...S.logbook, settings: { ...plain, ...dev } }, { theme: cachedTheme() });
    download(`logbook-settings-${todayISO()}.json`, new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' }));
  };
  const importIt = async file => {
    let d;
    try { d = readSettingsFile(await file.text()); } catch (err) { return toast(err.message); }
    const mine = (S.logbook && S.logbook.templates) || [];
    const same = (a, b) => a.name === b.name && [...a.cats].sort().join() === [...b.cats].sort().join();
    const newGroups = (d.templates || []).filter(t => !mine.some(m => m.id === t.id || same(m, t)));
    const n = Object.keys(d.settings).length;
    if (!(await confirmBox('Import settings', `Use the ${n} setting${n === 1 ? '' : 's'} in this file${newGroups.length ? ` and add ${newGroups.length} tag group${newGroups.length === 1 ? '' : 's'}` : ''}? Settings in the file replace yours (your tags and shorthand too, if the file has them); anything not in it stays. Cases, reflections and portfolio details are never touched.`, 'Import'))) return;
    // display settings in the file go to this device, the rest to the account
    const fileDisplay = Object.fromEntries(DISPLAY_KEYS.filter(k => k in d.settings).map(k => [k, d.settings[k]]));
    const forAccount = Object.fromEntries(Object.entries(d.settings).filter(([k]) => !DISPLAY_KEYS.includes(k)));
    await patchLogbook({ settings: forAccount, ...(newGroups.length ? { templates: [...mine, ...newGroups].slice(0, 100) } : {}) });
    if (d.theme) applyTheme(d.theme);
    applyDisplay(setDisplay(Object.fromEntries(DISPLAY_KEYS.filter(k => k in fileDisplay).map(k => [k, fileDisplay[k]]))));
    toast('Settings imported'); render();
  };
  return h('section', { class: 'card' },
    h('h2', {}, 'Settings file'),
    h('p', { class: 'hint help' }, 'Your settings, tags and shorthand, tag groups, Markdown format and saved searches as one small file: to move them to another account or share your setup with a colleague. No cases, reflections or portfolio details.'),
    // a saved search can hold patient initials ("AB"): say so before it is shared (shown with tips off too)
    ((S.logbook?.settings?.savedSearches) || []).some(x => x && x.q) ? h('p', { class: 'hint' }, 'Your saved searches go in the file with their search words: delete any that name a patient before you share it.') : null,
    h('div', { class: 'bar', style: 'margin-bottom:0' },
      h('button', { onclick: exportIt }, 'Export settings'),
      fileButton('Import settings…', '.json,application/json', importIt)));
}

// The Word upload for reflections (its module loads on first use); when done, on to Reflections
function renderReflImport() {
  const wrap = h('div', {}, h('section', { class: 'card' }, h('p', { class: 'hint' }, 'Loading…')));
  import('./ui-reflect-import.js').then(m => Promise.resolve(m.renderImport(() => { location.hash = 'reflect'; })))
    .then(node => { if (S.tab === 'reflimport') wrap.replaceChildren(node); })
    .catch(() => wrap.replaceChildren(h('section', { class: 'card' }, h('p', {}, 'Upload from Word isn’t available yet. Try again after the app updates.'))));
  return wrap;
}

// Export / Import: the portfolio export, the Word upload for reflections, and backups
function renderDataPage() {
  return h('div', {},
    // Export is the portfolio only (it holds everything APMES needs); every other copy is a backup
    h('section', { class: 'card export-sync' }, h('h2', {}, 'Export'),
      h('h3', {}, 'Portfolio (Word)'),
      h('p', { class: 'hint help' }, 'The APMES portfolio: choose which complete reflections go in, then export it with Section 1 and the Section 4 case numbers filled in. This is what APMES needs.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, h('a', { class: 'btn primary', href: '#export' }, 'Choose reflections and export ›'))),
    h('section', { class: 'card' }, h('h2', {}, 'Import'),
      h('h3', {}, 'Reflections from Word'),
      h('p', { class: 'hint help' }, 'Already wrote reflections in the APMES Word portfolio? Upload the .docx to add them here. You check each one before it is saved.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, h('a', { class: 'btn', href: '#reflimport' }, 'Upload from Word ›')),
      h('h3', { style: 'margin-top:16px' }, 'Logbook from Excel or CSV'),
      h('p', { class: 'hint help' }, 'Edit your cases in a spreadsheet (Download Excel under Backup), then upload it back; or bring in a list from elsewhere. You match the columns and see every change before anything is saved.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, fileButton('Upload Excel/CSV…', '.xlsx,.csv,text/csv', uploadExcel))),
    backupCard(
      h('h3', { style: 'margin-top:16px' }, 'Spreadsheet (Excel)'),
      h('p', { class: 'hint help' }, 'Your cases, your reflections or both as a spreadsheet: choose the dates and the columns. To edit cases and upload them back, use Import above.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, h('button', { onclick: downloadExcel }, 'Download Excel…')),
      h('h3', { style: 'margin-top:16px' }, 'Notes apps (Markdown)'),
      h('p', { class: 'hint help' }, 'Your cases and reflections as Markdown notes for Obsidian and other notes apps, with Progress.md and, if you like, the figures. Laid out as you set in Settings → Markdown.'),
      h('p', { class: 'hint' }, 'The files hold your case details: keep them private, and check hospital policy before putting them into cloud notes or AI tools.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, h('button', { onclick: downloadNotes }, 'Download for notes apps…')),
      ...cloudSaveSection()));
}

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
  if (id !== raw) history.replaceState(history.state, '', location.pathname + location.search + '#' + id);   // old links: #reflections → #reflect
  return id;
};

function paintTabs() {
  // the bar's tab this page sits under, however deep (Settings → Display is under More)
  let cur = TABS.find(t => t.id === S.tab);
  while (cur && cur.under) cur = TABS.find(t => t.id === cur.under);
  const sel = cur ? cur.id : S.tab;
  document.body.dataset.bar = sel;   // Settings → Display → Colourful: the page takes its tab's colour
  fill(tabsEl, ...visibleTabs().filter(t => !t.hidden).map(t => h('button', {
    role: 'tab', 'aria-selected': String(sel === t.id), 'data-tab': t.id, 'aria-label': t.label, title: t.label,   // named even with icons only
    onclick: () => go(t.id),
  }, icon(t.id), h('span', { class: 'lbl' }, t.label))));
  tabsEl.hidden = false;
}

function changeScreen(id, scroll = 0) {
  if (S.tab === 'account') flushProfile();
  if (S.tab === 'admin') leaveAdmin();
  S.tab = id;
  window.scrollTo(0, 0);
  render();
  // the inverted Case tab always opens at the bottom, where the case box is (not where it was left)
  requestAnimationFrame(() => { if (S.tab === id) window.scrollTo(0, id === 'log' && invertedCase() ? document.documentElement.scrollHeight : scroll); });
}
// Settings → Display: the Case tab upside down, on a phone-width screen
const invertedCase = () => document.documentElement.classList.contains('case-inverted') && matchMedia('(max-width: 600px)').matches;
const navigation = createNavigation({ history, location,
  parents: Object.fromEntries(TABS.filter(t => t.under).map(t => [t.id, t.under])),
  allowed: id => visibleTabs().some(t => t.id === id),
  onNavigate: changeScreen, getScroll: () => window.scrollY });
function go(id) {
  if (S.tab === id) { if (id === 'log') focusLog(); return; }
  navigation.go(id);
}
// Native links, menu links and tab buttons use the same history policy. Modified
// clicks can still open a new tab, and Leave demo remains a normal document link.
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !S.user) return;
  const a = e.target.closest?.('a[href]');
  if (!a || a.target || a.hasAttribute('download')) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || u.pathname !== location.pathname || u.search !== location.search) return;
  const id = TAB_ALIASES[u.hash.slice(1)] || u.hash.slice(1);
  if (!visibleTabs().some(t => t.id === id)) return;
  e.preventDefault(); go(id);
});
// Keep scroll restoration without hitting mobile browsers' history-write limits.
let scrollTimer = null;
window.addEventListener('scroll', () => {
  if (scrollTimer !== null) return;
  scrollTimer = setTimeout(() => { scrollTimer = null; navigation.remember(); }, 500);
}, { passive: true });
// Enter/Space on a span chip with role=button acts like a tap (real buttons and catChip handle their own)
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || (e.key !== 'Enter' && e.key !== ' ')) return;
  const t = e.target;
  if (t && t.getAttribute && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON') { e.preventDefault(); t.click(); }
});
const syncNavigation = () => { if (S.user) { const t = tabFromHash(); if (t) navigation.sync(t); } };
window.addEventListener('popstate', syncNavigation);
window.addEventListener('hashchange', syncNavigation);

function render() {
  if (!S.user) return;
  // Settings → Logging → Show tips and help text: off hides every .help explanation (an experienced-user mode)
  document.body.classList.toggle('no-help', !!(S.logbook && S.logbook.settings && S.logbook.settings.hideTips));
  paintTabs();
  const tab = visibleTabs().find(t => t.id === S.tab) || TABS[0];
  S.tab = tab.id;
  applyCustomCss();   // never on the Display page, so a bad rule can always be fixed there
  const y = window.scrollY;
  // pages opened from More get a way back to the list
  const backTo = tab.under && navigation.backTarget(tab.under);
  fill(app, backTo ? h('p', { class: 'back-row' }, h('a', { class: 'btn small', href: '#' + backTo,
    onclick: e => { e.preventDefault(); navigation.back(tab.under); } }, '← ' + ((TABS.find(t => t.id === backTo) || {}).label || 'Back'))) : null, tab.render());
  if (tab.id !== 'log') window.scrollTo(0, y);
  // the inverted Case tab (Settings → Display, phones) opens at the bottom, where the case box is
  else if (lastRendered !== 'log' && invertedCase()) requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));
  lastRendered = tab.id;
}
let lastRendered = '';
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
  // the demo is a small badge in the header (tap for Reset / Leave), so the app looks as it does for real
  const flag = cloud.demo ? h('button', { type: 'button', class: 'demo-flag', title: 'Demo: tap to reset or leave', onclick: demoMenu }, h('span', { class: 'who-flag' }, navigator.onLine ? 'demo ▾' : 'demo · offline ▾'))
    : flags ? h('span', { class: 'who-flag' }, flags) : null;
  // sync: cases saved on this phone but not yet on the server (no signal), or all synced
  const sync = !S.user ? null : writes.pending()
    ? h('a', { href: '#recovery', class: 'sync wait' }, writes.entries().some(x => x.state === 'failed' || x.state === 'conflict') ? 'Save needs attention' : 'Saved locally · pending sync')
    : cloud.demo ? null : S.pending
    ? h('span', { class: 'sync wait', title: navigator.onLine ? 'Saving to the server…' : 'Saved on this phone; will sync when there is signal' }, navigator.onLine ? '⟳ Saving' : '⏳ Will sync')
    : S.casesSynced ? h('span', { class: 'sync ok', title: 'All your cases are saved to the server' }, '✓ Synced') : null;
  subEl.textContent = flags;   // kept (hidden) for tests
  // a hidden header (Settings → Display) shows again while there is something to say: not synced, offline, demo, signed out
  document.documentElement.classList.toggle('who-alert', !S.user || cloud.demo || !navigator.onLine || !!S.pending);
  if (!S.user) { fill(whoEl, flag); return; }
  document.body.dataset.cases = String(S.cases.length);   // not shown; read by tests
  fill(whoEl, sync, flag, h('span', { class: 'email', title: S.user.email }, S.user.name || S.user.email));
}
hooks.writesChanged = () => { paintWho(); if (S.tab === 'recovery') render(); };
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
    h('p', {}, 'Type the initials and case, tap the suggested tags, save. Your progress against the APMES targets updates as you go.'),
    h('ul', {},
      h('li', {}, 'Tag suggestions from what you type (age, BMI, procedure).'),
      h('li', {}, 'Works offline on your phone; syncs when you are back online.'),
      h('li', {}, 'Analytics: progress by tag, reflections and trends; Excel download any time.'),
      h('li', {}, 'Private: only you and the programme admins can see your cases.')),
    error ? h('p', { class: 'tip' }, error) : null,
    cloud.enabled ? h('div', { class: 'cta' },
      h('button', { class: 'primary big', onclick: signIn }, 'Sign in with Google'),
      cloud.demo ? null : h('a', { class: 'btn', href: demoHref }, 'Try the demo')) : h('p', { class: 'tip' }, 'Sign-in is not configured.'),
    h('p', { style: 'font-size:calc(13px * var(--fs, 1))' }, 'Anyone with a Google account can keep a private logbook. APMES residents on the programme list also appear on the shared totals (counts only), which only the programme can see.')));
}

async function signIn() {
  try { await cloud.signIn(); }
  catch (err) { renderLanding('Sign-in failed: ' + (err && err.message || err)); }
}

// The programme's tag groups (Admin portal) are only a starting set: each one is copied once into the
// resident's own tag groups, where it can be edited or deleted like any other. `settings.sharedSeen`
// remembers which were offered, so a deleted one doesn't come back; the copy's id is fixed so two
// devices adopting at once don't make two.
function adoptShared() {
  const lb = S.logbook, shared = S.sharedTemplates || [];
  if (!lb || !shared.length) return false;
  const seen = new Set((lb.settings && lb.settings.sharedSeen) || []);
  const fresh = shared.filter(t => t && t.id && !seen.has(String(t.id)));
  if (!fresh.length) return false;
  const mine = lb.templates || [];
  const have = new Set(mine.map(t => t.id));
  const same = t => mine.some(m => m.name === t.name && [...(m.cats || [])].sort().join() === [...(t.cats || [])].sort().join());
  const add = fresh.filter(t => (t.cats || []).length && !have.has('sh-' + t.id) && !same(t))
    .map(t => ({ id: 'sh-' + t.id, name: t.name || '', cats: [...t.cats], ...(t.details ? { details: t.details } : {}) }));
  const templates = [...mine, ...add].slice(0, 100);
  patchLogbook({ templates, settings: { sharedSeen: [...seen, ...fresh.map(t => String(t.id))].slice(-200) } });
  return true;
}

// ---------- signed in ----------

let unwatch = null, unwatchRefl = null, signedInOnce = false;
const SKELETON = '<section class="card skeleton" aria-label="Loading"><div class="sk-row"><i></i><i></i><i></i></div><div class="sk-box"></div><div class="sk-line"></div><div class="sk-row"><i></i><i></i></div><div class="sk-btn"></div></section>';

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
    const before = JSON.stringify([S.admin, S.owner, S.pd, S.resident, S.sharedTemplates, categoryNamesNow()]);
    Object.assign(S, { admin: !!w.admin, owner: !!w.owner, pd: !!w.pd, resident: w.resident || null, sharedTemplates: w.sharedTemplates || [] });
    setCategoryNames(w.names || {});
    // the logbook (templates, settings) from the server, unless it was changed here meanwhile
    const lb = await cloud.loadLogbook(user.email).catch(() => null);
    if (S.user !== user) return;
    let lbChanged = false;
    if (lb && S.logbook === firstLogbook && JSON.stringify(lb) !== JSON.stringify(firstLogbook)) {
      S.logbook = lb; lbChanged = true;
      applyDisplay(adoptDisplay(lb.settings, { fresh: true }));   // a first look made from a stale offline copy is corrected
    }
    if (lb && adoptShared()) lbChanged = true;   // never from a cached copy alone
    if (!lbChanged && before === JSON.stringify([S.admin, S.owner, S.pd, S.resident, S.sharedTemplates, categoryNamesNow()])) return;
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
    Object.assign(S, { admin: false, owner: false, pd: false, resident: null, logbook: null, cases: [], reflections: [], counts: {}, casesLoaded: false, casesSynced: false, sharedTemplates: [] });
    const cleanup = signedInOnce ? writes.forget() : Promise.resolve();
    if (signedInOnce) { clearDrafts(); resetCaches(); forgetWho(); }
    document.querySelectorAll('dialog[open]').forEach(el => el.close());
    paintWho(); renderLanding();
    try { await cleanup; } catch (err) { if (!S.user) renderLanding('Could not clear device recovery: ' + err.message); }
    return;
  }
  signedInOnce = true;
  await writes.activate(user.email);
  if (S.user !== user) return;
  paintWho();
  // an outline of the Log screen while the logbook loads (index.html starts with the same)
  if (!app.querySelector('.skeleton')) app.innerHTML = SKELETON;
  // Fast start: the Log screen opens from this device's copies (the logbook from the offline cache;
  // admin / PD / programme entry / shared templates as last seen, in localStorage) and the server's
  // answers replace them in the background. Only a first sign-in on a device waits for the server.
  const who = () => Promise.all([
    cloud.isAdmin(user.email).catch(() => false),
    cloud.myResident(user.email).catch(() => null),
    cloud.listSharedTemplates().catch(() => []),
    cloud.isPD(user.email).catch(() => false),
    cloud.loadCategoryNames().catch(() => ({})),
    cloud.isAppOwner(user.email).catch(() => false),
  ]).then(([admin, resident, shared, pd, names, owner]) => ({ admin, resident, sharedTemplates: shared || [], pd, names: names || {}, owner }));
  try {
    const known = readWho(user.email);
    const [logbook, w] = await Promise.all([cloud.loadLogbook(user.email, { cached: true }), known ? Promise.resolve(known) : who()]);
    if (S.user !== user) return; // signed out meanwhile
    reloadFlag('');
    Object.assign(S, { admin: !!w.admin, owner: !!w.owner, pd: !!w.pd, resident: w.resident || null, logbook, sharedTemplates: w.sharedTemplates || [] });
    setCategoryNames(w.names || {});
    if (!known) saveWho(user.email, w);
    // the server's logbook replaces the cached one there, and only then are the programme's tag groups
    // copied in (a stale cache would overwrite tag groups changed on another device)
    refreshWho(user, known ? who : () => Promise.resolve(w), logbook);
    applyDisplay(adoptDisplay(logbook.settings));   // this device's display settings (from the account the first time)
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
  // the tab chosen in Settings → Display, unless the address names one (a link, a shortcut, a reload)
  const start = display().startTab || 'log';
  S.tab = tabFromHash() || (START_TABS.some(([v]) => v === start) ? start : 'log');
  navigation.initialize(S.tab);
  // Settings → Backup: a one-tap reminder when the last Drive / Dropbox backup is over a week old (if asked for)
  setTimeout(() => { if (S.user === user) remindBackup(); }, 3000);
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
    const wasSynced = S.casesSynced;
    if (!meta.fromCache) S.casesSynced = true;
    if (S.pending !== !!meta.hasPendingWrites || wasSynced !== S.casesSynced) { S.pending = !!meta.hasPendingWrites; paintWho(); }
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
  const vv = window.visualViewport;
  const vh = vv ? vv.height : window.innerHeight;
  if (window.innerWidth !== fullW) { fullW = window.innerWidth; fullH = 0; }   // rotated
  fullH = Math.max(fullH, vh, window.innerHeight);
  // a keyboard takes at least ~120px (also small and landscape keyboards, where 25% was too much to ask)
  const typing = !!typingEl(document.activeElement) && fullH - vh > 120;
  document.body.classList.toggle('typing', typing);
  // how far the keyboard covers the bottom of the layout viewport (iOS also scrolls the visible area
  // inside it: offsetTop), and the visible area itself, for dialogs (style.css: --kb, --vvh, --vvt)
  const kb = typing && vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  const root = document.documentElement.style;
  root.setProperty('--kb', kb + 'px');
  root.setProperty('--vvh', Math.round(vh) + 'px');
  root.setProperty('--vvt', Math.round(vv && typing ? vv.offsetTop : 0) + 'px');
}
// once per frame at most, and again when scrolling settles (iOS reports the keyboard late)
let kbFrame = 0;
const kbSoon = () => { if (!kbFrame) kbFrame = requestAnimationFrame(() => { kbFrame = 0; keyboardCheck(); }); };
keyboardCheck();
document.addEventListener('focusin', () => { kbSoon(); setTimeout(keyboardCheck, 350); });
document.addEventListener('focusout', () => setTimeout(keyboardCheck, 0));
(window.visualViewport || window).addEventListener('resize', kbSoon);
if (window.visualViewport) window.visualViewport.addEventListener('scroll', kbSoon);
window.addEventListener('scroll', kbSoon, { passive: true });

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

// shared to the installed app (Android share sheet): keep the text for the Log page, tidy the address
{
  const q = new URLSearchParams(location.search);
  const shared = [q.get('share_title'), q.get('share_text'), q.get('share_url')].filter(Boolean).join('\n').trim();
  if (q.has('share_text') || q.has('share_title') || q.has('share_url')) {
    try { if (shared) sessionStorage.setItem(SHARED_KEY, shared); } catch { /* ignore */ }
    for (const k of ['share_title', 'share_text', 'share_url']) q.delete(k);
    const rest = q.toString().replace(/=(&|$)/g, '$1');
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + '#log');
  }
}
applyTheme(cachedTheme());   // this device's choice (Settings → Display → Theme)
applyTextSize(cachedTextSize());
applyZoom(cachedZoom());
// Interface zoom from the keyboard, like a notes app or a browser: Ctrl/Cmd + (or =), Ctrl/Cmd −, Ctrl/Cmd 0
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const dir = e.key === '+' || e.key === '=' ? 1 : e.key === '-' || e.key === '_' ? -1 : e.key === '0' ? 0 : null;
  if (dir === null) return;
  e.preventDefault();   // instead of the browser's own zoom, so the setting and the screen agree
  const v = stepZoom(dir);
  toast(`Zoom ${Math.round(v * 100)}%`, { ms: 1200 });
  if (S.tab === 'display') render();
});
if (cachedCompact()) document.body.classList.add('compact');   // first paint; corrected once the logbook loads
paintWho();
// Demo: what it is, Reset and Leave (from the header badge)
function demoMenu() {
  const m = modal('Demo', [
    h('p', {}, 'Made-up data, stored only in this browser. Try anything: nothing is sent anywhere.'),
    h('div', { class: 'bar', style: 'margin-top:12px;flex-wrap:wrap' },
      h('button', { class: 'danger', onclick: async () => {
        m.close();
        if (!(await confirmBox('Reset demo', 'Delete everything you added in the demo (cases, reflections, images, settings) and start again with the made-up data? The uploaded portfolio template is kept.', 'Reset', true))) return;
        clearDrafts(); resetCaches(); forgetWho(); resetDisplay(); applyCompact(false); applyTextSize('1'); applyAccent(null);
        cloud.resetDemo();
        location.reload();
      } }, 'Reset demo'),
      h('a', { href: location.pathname, class: 'btn' }, 'Leave demo'),
      h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Close'))]);
}
if (window.__dbxReturn) fill(app, h('p', { class: 'empty' }, 'Signed in to Dropbox. You can close this window.'));   // the Dropbox popup (index.html)
else if (!cloud.enabled) renderLanding();
else cloud.watchUser(onUser).catch(err => renderLanding('Could not start sign-in: ' + err.message));
if (!window.__dbxReturn) registerSW();
