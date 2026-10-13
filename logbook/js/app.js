// APMES Logbook: boot, sign-in, tabs and offline support. Each screen lives in its own ui-*.js file;
// shared state and helpers are in ui-core.js. Case data comes from cloud.js (Firestore, or the
// in-browser demo backend with ?demo).

import { replaceShow } from './profiles.js';
import { S, hooks, h, toast, basicHides, basicMode, logbookOnly, facultyMode, facultyRole, clearToast, cloud, writes, transients, setCases, scheduleSummary, fill, resetCaches, patchLogbook, confirmBox, fileButton, modal, download, todayISO, settings, setCategoryNames, categoryNames as categoryNamesNow, watchMyReflections } from './ui-core.js';
import { renderLog, focusLog, logCasesChanged, clearDrafts } from './ui-log.js';
import { applyCompact, cachedCompact, applyTheme, cachedTheme, applyTextSize, cachedTextSize, applyZoom, cachedZoom, stepZoom, applyAccent, adoptDisplay, applyDisplay, applyCustomCss, display, setDisplay, resetDisplay, DISPLAY_KEYS, IPHONE_APP, setPageLabel, START_TABS, arrangeTabs } from './display.js';
import { createNavigation } from './navigation.js';
import { renderNotes, leaveNotes, openDayNote, renderNoteSettings } from './ui-notepad.js';
import { fromQuery, keepShared, readInbox } from './share-in.js';
import { purgeExpired, openBin } from './bin.js';
import { profile } from './ui-core.js';
import { deviceOn, barAtBottom } from './device-presets.js';
import { notesChanged } from './ui-notepad.js';
import { privacyCard, creditsCard, signOutCard } from './more-cards.js';
import { wipeSyncDevice } from './sync-forget.js';

// ---------- pages that load on first use ----------

// Only the Case tab's code loads with the app (index.html preloads it); every other page's module loads the first
// time it is opened, or in idle time soon after the first paint (warmUp), so a phone shows the case box sooner. The
// service worker keeps them all (sw.js SHELL), so this works offline too.
const MODS = {
  logbook: () => import('./ui-logbook.js'), reflect: () => import('./ui-reflect.js'), progress: () => import('./ui-progress.js'),
  caselogs: () => import('./ui-caselogs.js'), settings: () => import('./ui-settings.js'), send: () => import('./ui-send.js'),
  sync: () => import('./ui-sync.js'), settingsFile: () => import('./settings-file.js'), account: () => import('./ui-account.js'),
  admin: () => import('./ui-admin.js'), recovery: () => import('./ui-recovery.js'), notesExport: () => import('./ui-notes.js'),
  cloudSave: () => import('./cloud-save.js'), backup: () => import('./backup.js'), shareIn: () => import('./ui-share-in.js'),
  parts: () => import('./ui-parts.js'),
};
const mod = {}, loading = {};   // name → the module once loaded; → its promise while loading
function need(name) {
  if (mod[name]) return Promise.resolve(mod[name]);
  return (loading[name] ||= MODS[name]().then(m => (mod[name] = m), err => { delete loading[name]; throw err; }));
}
// call a loaded module now (so the order of things stays as it was), or once it has loaded
const withMod = (name, fn) => (mod[name] ? Promise.resolve(fn(mod[name])) : need(name).then(fn));
// sign-out, an account switch, a demo reset: sync's run and sign-ins stop (when its code is loaded) and what it keeps
// on the device goes, at once either way
const forgetSync = () => {
  if (mod.sync) return mod.sync.forgetSync();
  mod.cloudSave?.forgetCloudToken('drive'); mod.cloudSave?.forgetCloudToken('dropbox');   // (Save to Drive / Dropbox's sign-ins)
  wipeSyncDevice();
};
// a page drawn from modules: at once when they are loaded; else the loading outline, and the page draws again when
// they arrive (if it is still the one on screen). If one fails, only a reload helps: the browser keeps a failed module
// import for the life of the page, so importing it again fails at once without asking the network.
const page = (names, draw) => () => {
  const missing = names.filter(n => !mod[n]);
  if (!missing.length) return draw(mod);
  const wait = h('div', { class: 'lazy-wait' });
  wait.innerHTML = SKELETON;
  Promise.all(missing.map(need)).then(() => { if (wait.isConnected) render(); },
    err => { console.warn(err); if (wait.isConnected) fill(wait, h('section', { class: 'card' }, h('p', {}, 'This page didn’t load. Check the connection, then reload.'), h('div', { class: 'bar', style: 'margin-bottom:0' }, h('button', { onclick: () => location.reload() }, 'Reload')))); });
  return wait;
};
// the rest, one module at a time in idle moments once the Case tab is up, so changing tab stays instant
let warmed = false;
function warmUp() {
  if (warmed) return; warmed = true;
  const names = ['logbook', 'reflect', 'progress', 'settings', 'send', 'sync', 'settingsFile', 'recovery', 'account', 'caselogs', 'notesExport', 'cloudSave', 'backup', 'shareIn', 'parts', 'admin'];
  const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200));
  // a failure stops the warm-up (the network is likely down); the page that failed says so when it is opened
  const next = () => { const n = names.shift(); if (n) need(n).then(() => idle(next), err => console.warn(err)); };
  setTimeout(() => idle(next), 1500);
}
// The Logbook's and Analytics' links set the Logbook's view first (ui-logbook.js replaces these once it loads)
hooks.showDay = iso => { need('logbook').then(() => hooks.showDay(iso)).catch(() => {}); };
hooks.showCases = opts => { need('logbook').then(() => hooks.showCases(opts)).catch(() => {}); };

// Tab icons: tiny inline SVG paths (24x24, stroked), so they look the same on every phone.
const ICONS = {
  caselogs: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M18 14a6 6 0 0 1 4 7',   // people
  caselog: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0',
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
  access: 'M12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 8l7 1.5L19 8M12 9.5V14M12 14l-3 7M12 14l3 7',   // a figure, arms out
  logging: 'M12 5v14M5 12h14',
  showhide: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  tags: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
  reflset: 'M4 19.5V5a2 2 0 0 1 2-2h12v14H6a2 2 0 0 0-2 2.5zM6 21h12v-4',
  sharefmt: 'M9 9h10v12H9zM5 15V3h10',
  sendto: 'M4 12l16-8-6 16-3-7z',
  sync: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  bin: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
  notesset: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5',
  more: 'M5 12h.01M12 12h.01M19 12h.01M4 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0M18 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
};
// the Advanced pages (Settings menu) use their parent page's icon
ICONS.displayadv = ICONS.display; ICONS.loggingadv = ICONS.logging;
const icon = id => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'ico'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[id]);
  svg.append(path);
  return svg;
};

const TABS = [
  // Faculty / PCs profile (faculty, PDs and admins): residents' compiled case logs, from the counts summaries
  { id: 'caselogs', label: 'Case logs', render: page(['caselogs'], m => m.caselogs.renderCaseLogs()), faculty: true, desc: 'Residents’ case logs: counts per tag against the targets' },
  { id: 'log', label: 'Case', render: renderLog },
  { id: 'logbook', label: 'Logbook', render: page(['logbook'], m => m.logbook.renderLogbook()) },
  { id: 'reflect', label: 'Reflections', render: page(['reflect'], m => m.reflect.renderReflect()), desc: 'Your reflections' },
  // Faculty / PCs: programme analytics instead of your own
  { id: 'progress', label: 'Analytics', render: page(['progress', 'caselogs'], m => (facultyMode() ? m.caselogs.renderProgramme() : m.progress.renderProgress())), desc: 'Your progress against the APMES targets' },
  // a personal notepad: on the bar only if chosen (Arrange tabs); otherwise first in More
  { id: 'notes', label: 'Notes', moreLabel: 'Notes (beta)', render: renderNotes, desc: 'Your own notes: private, never in your portfolio' },
  // five tabs on the bar; the rest live under More (still reachable by #totals, #account, #settings)
  { id: 'more', label: 'More', render: () => renderMore() },
  { id: 'caselog', label: 'Case log', render: page(['caselogs'], m => m.caselogs.renderCaseLog()), faculty: true, hidden: true, under: 'caselogs', unlisted: true },
  // under Analytics: how your counts compare with your intake
  { id: 'totals', label: 'Totals', render: page(['progress'], m => m.progress.renderTotals()), hidden: true, under: 'progress', unlisted: true },
  // under the Logbook: every learning point (or other labelled part), from Filter (Labelled parts on)
  { id: 'points', label: 'Learning points', render: page(['parts'], m => m.parts.renderPoints()), hidden: true, under: 'logbook', unlisted: true },
  { id: 'account', bar: true, label: 'Account', render: page(['account', 'settings'], m => m.account.renderAccount()), hidden: true, under: 'more', desc: 'Your name and portfolio details (Section 1); delete account' },
  { id: 'settings', bar: true, label: 'Settings', render: page(['settings', 'send', 'sync', 'settingsFile'], () => renderSettingsMenu()), hidden: true, under: 'more', desc: 'Profile, look, logging, reflections, notes and sharing, data' },
  { id: 'recovery', bar: true, short: 'Recover', label: 'Recent changes / Recover drafts', render: page(['recovery'], m => m.recovery.renderRecovery()), hidden: true, under: 'more', desc: 'Retry sync, recover unfinished drafts and restore recent versions on this device' },
  { id: 'data', bar: true, short: 'Export', label: 'Export / Import', render: page(['logbook', 'notesExport', 'cloudSave', 'backup'], () => renderDataPage()), hidden: true, under: 'more', desc: 'Export the portfolio (Word); import reflections from Word; backup file, Excel and Markdown export' },
  { id: 'reflimport', label: 'Import reflections from Word', render: () => renderReflImport(), hidden: true, under: 'data', unlisted: true },
  // Settings' own pages (not in the More list)
  { id: 'display', label: 'Display', render: page(['settings'], m => m.settings.renderDisplay()), hidden: true, under: 'settings', unlisted: true, desc: 'Light or dark, colour, compact, borders; fonts and more under Advanced' },
  { id: 'access', label: 'Accessibility', render: page(['settings'], m => m.settings.renderAccessibility()), hidden: true, under: 'settings', unlisted: true, desc: 'Zoom, text size, bigger taps, contrast, motion, swipe gestures' },
  { id: 'displayadv', label: 'Advanced display', render: page(['settings'], m => m.settings.renderDisplayAdvanced()), hidden: true, under: 'display', unlisted: true, desc: 'The header and tab bar, Logbook rows, fonts, custom CSS' },
  { id: 'loggingadv', label: 'Advanced logging', render: page(['settings'], m => m.settings.renderLoggingAdvanced()), hidden: true, under: 'logging', unlisted: true, desc: 'Case tab parts, labelled parts and a case template, the keyboard, search, the week, undo, tips' },
  { id: 'sendto', label: 'Send to', render: page(['send'], m => m.send.renderSendSettings()), hidden: true, under: 'settings', unlisted: true, desc: 'Obsidian, WhatsApp, UpNote or any app with a link' },
  { id: 'sync', label: 'Sync', render: page(['sync'], m => m.sync.renderSyncSettings()), hidden: true, under: 'settings', unlisted: true, desc: 'One Markdown file per day in Google Drive, Dropbox or GitHub' },
  { id: 'sharefmt', label: 'Markdown', render: page(['settings'], m => m.settings.renderMarkdownSettings()), hidden: true, under: 'settings', unlisted: true, desc: 'How Copy, Share and the notes export read' },
  { id: 'showhide', label: 'Profile', render: page(['settings'], m => m.settings.renderShowHide()), hidden: true, under: 'settings', unlisted: true, desc: 'Basic, Advanced, Personal…, and everything you can show or hide' },
  { id: 'logging', label: 'Logging', render: page(['settings'], m => m.settings.renderLogging()), hidden: true, under: 'settings', unlisted: true, desc: 'Suggestions, the Enter key, dates, after Save; more under Advanced' },
  { id: 'notesset', label: 'Notes', render: renderNoteSettings, hidden: true, under: 'settings', unlisted: true, desc: 'Daily note on the Case tab, pasting, formatting buttons, shared text' },
  // something shared to the installed app: where it goes (ui-share-in.js); no back link, it's a step of its own
  { id: 'share', label: 'Shared with the app', render: page(['shareIn'], m => m.shareIn.renderShare()), hidden: true, unlisted: true },
  // from Reflections → More tools
  { id: 'reflset', label: 'Reflections', render: page(['settings'], m => m.settings.renderReflectionSettings()), hidden: true, under: 'settings', unlisted: true, desc: 'The export, learning points, formatting, spelling, photo sizes' },
  // opened from More → Export / Import (not in the More list)
  { id: 'export', label: 'Export portfolio', render: page(['reflect'], m => m.reflect.renderExportPage()), hidden: true, under: 'data', unlisted: true },
  { id: 'choose', label: 'Export portfolio', render: page(['reflect'], m => m.reflect.renderChoosePage()), hidden: true, under: 'export', unlisted: true },
  // admins open it from More
  { id: 'admin', bar: true, short: 'Admin', label: 'Admin portal', render: page(['admin'], m => m.admin.renderAdmin()), admin: true, hidden: true, under: 'more', desc: 'Admins only: ready portfolios, programme totals, residents, settings' },
  { id: 'admintotals', label: 'Programme totals', render: page(['progress'], m => m.progress.renderTotals()), admin: true, hidden: true, under: 'admin', unlisted: true },
  { id: 'adminresidents', label: 'Residents', render: page(['admin'], m => m.admin.renderAdminResidents()), admin: true, hidden: true, under: 'admin', unlisted: true },
  { id: 'adminadv', label: 'Advanced admin settings', render: page(['admin'], m => m.admin.renderAdminAdvanced()), admin: true, hidden: true, under: 'admin', unlisted: true },
  // opened from Settings
  { id: 'tags', label: 'Tag editor', render: page(['settings'], m => m.settings.renderTagEditor()), hidden: true, under: 'settings', unlisted: true, desc: 'APMES and personal tags, shorthand, tag groups' },
];

// A list of pages, like the More list: icon, name, one line, ›.
const menuItem = (id, label, desc, onclick) => h('li', {}, h('a', { href: '#' + id, 'data-go': id, onclick: e => { e.preventDefault(); onclick ? onclick() : go(id); } },
  icon(id), h('span', { class: 'mt' }, h('b', {}, label), h('small', {}, desc)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));

function renderMore() {
  const items = visibleTabs().filter(t => t.under === 'more' && !t.unlisted);
  // tabs hidden from the bar (Advanced display) come first, so they are one tap away
  // (Case logs, for faculty, PDs and admins outside their own profile, after the person's own tabs)
  const hidden = arrangeTabs(barCandidates(), display()).hidden.filter(id => !TABS.find(t => t.id === id).hidden)
    .sort((a, b) => (a === 'caselogs') - (b === 'caselogs'));
  return h('div', {},
    h('section', { class: 'card more-list' }, h('h2', {}, 'More'),
      h('ul', {}, hidden.map(id => TABS.find(t => t.id === id)).map(t => menuItem(t.id, t.moreLabel || t.label, t.desc || 'Hidden from the tab bar')), items.map(t => menuItem(t.id, t.moreLabel || t.label, t.desc)))),
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

// Search in Settings (owner): the options of every settings page and its Advanced page, read from the pages
// themselves (each is drawn once, off screen, the first time someone types), so the index never goes stale.
// A result opens its page and scrolls to the option, which flashes.
const SEARCH_PAGES = ['showhide', 'display', 'displayadv', 'access', 'logging', 'loggingadv', 'tags', 'reflset', 'notesset', 'sharefmt', 'sendto', 'sync'];
let settingsIndex = null, findAfterRender = '';
const optionText = n => {
  if (n.matches('label.field')) return [...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join(' ').trim();
  if (n.matches('label.profile-opt')) return n.querySelector('b').textContent.trim();   // (a profile: its name, not its hint run on)
  if (n.matches('label.check')) return n.textContent.trim();
  return n.textContent.trim();
};
function buildSettingsIndex() {
  const out = [], seen = new Set();
  for (const id of SEARCH_PAGES) {
    const t = TABS.find(x => x.id === id);
    let el; try { el = t.render(); } catch { continue; }
    for (const n of el.querySelectorAll('h2, h3, label.field, label.check, legend, summary, .more-list b')) {
      const text = optionText(n).replace(/\s+/g, ' ').slice(0, 90);
      if (!text || text.length < 3 || seen.has(id + text)) continue;
      seen.add(id + text);
      // the help line under it; a ✓ list (legend) also finds its choices
      const hint = n.matches('legend') ? [...n.parentElement.querySelectorAll(':scope > p.hint, .pick-l')].map(x => x.textContent).join(' · ')
        : (x => (x && x.matches('p.hint') ? x.textContent : ''))(n.closest('label') && n.closest('label').nextElementSibling);
      out.push({ id, page: t.label, text, hint: hint.replace(/ⓘ/g, '').trim().slice(0, 160) });
    }
  }
  return out;
}
const searchSettings = (index, q) => {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index.filter(x => { const hay = (x.text + ' ' + x.hint + ' ' + x.page).toLowerCase(); return words.every(w => hay.includes(w)); }).slice(0, 12);
};
function showFound() {
  const want = findAfterRender; findAfterRender = '';
  // two frames on: changeScreen puts the new page at its top in the next frame, which would undo the scroll
  // and while the new page slides in it is pinned in place (position: fixed), so the scroll waits for the slide's end
  requestAnimationFrame(() => requestAnimationFrame(function find() {
    if (sliding) { afterSlide = find; return; }
    const n = [...app.querySelectorAll('h2, h3, label.field, label.check, legend, summary')].find(x => optionText(x).replace(/\s+/g, ' ').startsWith(want.slice(0, 60)));
    if (!n) return;
    // a heading inside a card (h3) is found itself, not the whole card from its top
    const target = n.matches('h3') ? n : n.closest('fieldset, label, details, section') || n;
    if (target.matches('details')) target.open = true;
    target.scrollIntoView({ block: 'center' });
    target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
  }));
}
// the query lives here, not only in the box: the menu can be drawn again while someone types (the logbook arriving
// from the device's store a moment after the first paint), and the new box gets the text, the results, the focus and
// the caret back. A visit to another page starts it empty again.
let settingsQuery = '';
function settingsSearch() {
  const results = h('ul', {});
  const old = document.activeElement?.closest?.('.settings-search') ? document.activeElement : null;
  const caret = old && typeof old.selectionStart === 'number' ? [old.selectionStart, old.selectionEnd] : null;
  const box = h('input', { type: 'search', placeholder: 'Search settings, e.g. font, undo, initials', 'aria-label': 'Search settings', autocomplete: 'off', enterkeyhint: 'search',
    value: settingsQuery, oninput: () => search() });
  const search = () => {
    settingsQuery = box.value;
    settingsIndex ||= buildSettingsIndex();
    const found = searchSettings(settingsIndex, box.value);
    fill(results, ...found.map(x => h('li', {}, h('a', { href: '#' + x.id, 'data-go': x.id, onclick: e => { e.preventDefault(); findAfterRender = x.text; go(x.id); } },
      h('span', { class: 'mt' }, h('b', {}, x.text), h('small', {}, x.page)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')))),
      box.value.trim() && !found.length ? h('li', { class: 'hint', style: 'padding:10px 4px' }, 'No setting matches. Try another word.') : null);
  };
  if (settingsQuery) search();
  // (after render() has put the new menu in place)
  if (old) queueMicrotask(() => { if (!box.isConnected) return; box.focus({ preventScroll: true }); if (caret) box.setSelectionRange(...caret); });
  return h('section', { class: 'card more-list settings-search' }, box, results);
}

// Settings: its pages in groups (owner, 13 Oct 2026: every setting kept, grouped so each is easy to find): Profile, Look,
// Logging, Reflections, Notes and sharing, Data, Advanced. Search finds any option on any page.
const SETTINGS_GROUPS = [
  ['Profile', ['showhide']],
  ['Look', ['display', 'access']],
  ['Logging', ['logging', 'tags']],
  ['Reflections', ['reflset']],
  ['Notes and sharing', ['notesset', 'sharefmt', 'sendto', 'sync']],
  ['Data', ['bin']],
  ['Advanced', ['displayadv', 'loggingadv']],
];
// the groups, then any Settings page none of them names (so a new page is never left out of the menu)
function settingsGroups() {
  const named = new Set(SETTINGS_GROUPS.flatMap(([, ids]) => ids));
  const rest = TABS.filter(t => t.under === 'settings' && !named.has(t.id)).map(t => t.id);
  return rest.length ? [...SETTINGS_GROUPS, ['Other', rest]] : SETTINGS_GROUPS;
}
function renderSettingsMenu() {
  if (lastRendered !== 'settings') { settingsIndex = null; settingsQuery = ''; }   // drawn again on the first search of this visit
  const item = id => (id === 'bin' ? menuItem('bin', 'Recycle bin', 'Deleted cases and reflections, kept for 30 days', () => openBin())
    : (t => menuItem(t.id, t.label, t.desc))(TABS.find(t => t.id === id)));
  return h('div', {},
    settingsSearch(),
    h('section', { class: 'card more-list settings-menu' }, h('h2', {}, 'Settings'),
      settingsGroups().map(([name, ids]) => [h('h3', {}, name), h('ul', {}, ids.map(item))])),
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
    const f = mod.settingsFile.settingsFile({ ...S.logbook, settings: { ...plain, ...dev } }, { theme: cachedTheme() });
    download(`logbook-settings-${todayISO()}.json`, new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' }));
  };
  const importIt = async file => {
    const text = await file.text();
    // a file of this browser's choices from the old address (anawj.com/logbook): look, text size, tab layout, drafts
    if (mod.settingsFile.isDeviceFile(text)) {
      let dev;
      try { dev = mod.settingsFile.readDeviceFile(text); } catch (err) { return toast(err.message); }
      const n = Object.keys(dev.items).length;
      if (!(await confirmBox('Load this device’s choices', `Put ${n} saved choice${n === 1 ? '' : 's'} from the old address back on this device? The page reloads.`, 'Load'))) return;
      try { for (const [k, v] of Object.entries(dev.items)) localStorage.setItem(k, v); } catch (err) { return toast('Could not save on this device: ' + err.message); }
      location.reload();
      return;
    }
    let d;
    try { d = mod.settingsFile.readSettingsFile(text); } catch (err) { return toast(err.message); }
    const mine = (S.logbook && S.logbook.templates) || [];
    const same = (a, b) => a.name === b.name && [...a.cats].sort().join() === [...b.cats].sort().join();
    const newGroups = (d.templates || []).filter(t => !mine.some(m => m.id === t.id || same(m, t)));
    const n = Object.keys(d.settings).length;
    if (!(await confirmBox('Import settings', `Use the ${n} setting${n === 1 ? '' : 's'} in this file${newGroups.length ? ` and add ${newGroups.length} tag group${newGroups.length === 1 ? '' : 's'}` : ''}? Settings in the file replace yours (your tags and shorthand too, if the file has them); anything not in it stays. Cases, reflections and portfolio details are never touched.${(d.settings.destinations || []).length ? ` The file also sets places to send your cases to, and sending goes only when you tap: ${mod.send.destinationHosts(d.settings.destinations).join('; ')}. Import only if you trust them.` : ''}${mod.sync.syncPlaces(d.settings.sync).length ? ` It also sets places to sync your days to (only when you tap Sync): ${mod.sync.syncPlaces(d.settings.sync).join('; ')}.` : ''}`, 'Import'))) return;
    // display settings in the file go to this device, the rest to the account
    const fileDisplay = Object.fromEntries(DISPLAY_KEYS.filter(k => k in d.settings).map(k => [k, d.settings[k]]));
    const forAccount = Object.fromEntries(Object.entries(d.settings).filter(([k]) => !DISPLAY_KEYS.includes(k)));
    // the file's switches replace the account's (the cloud merges `show` key by key, so the ones it lacks go as null)
    if (forAccount.show) forAccount.show = replaceShow(settings().show, forAccount.show);
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
  const portfolio = !basicHides('portfolio');   // (Profile → APMES; off in Personal)
  return h('div', {},
    // Export is the portfolio only (it holds everything APMES needs); every other copy is a backup
    !portfolio ? null : h('section', { class: 'card export-sync' }, h('h2', {}, 'Export'),
      h('h3', {}, 'Portfolio (Word)'),
      h('p', { class: 'hint help' }, 'The APMES portfolio: choose which complete reflections go in, then export it with Section 1 and the Section 4 case numbers filled in. This is what APMES needs.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, h('a', { class: 'btn primary', href: '#export' }, 'Choose reflections and export ›'))),
    h('section', { class: 'card' }, h('h2', {}, 'Import'),
      !portfolio ? null : [h('h3', {}, 'Reflections from Word'),
        h('p', { class: 'hint help' }, 'Already wrote reflections in the APMES Word portfolio? Upload the .docx to add them here. You check each one before it is saved.'),
        h('div', { class: 'bar', style: 'margin-bottom:0' }, h('a', { class: 'btn', href: '#reflimport' }, 'Upload from Word ›'))],
      h('h3', { style: portfolio ? 'margin-top:16px' : '' }, 'Logbook from Excel or CSV'),
      h('p', { class: 'hint help' }, 'Edit your cases in a spreadsheet (Download Excel under Backup), then upload it back; or bring in a list from elsewhere. You match the columns and see every change before anything is saved.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, fileButton('Upload Excel/CSV…', '.xlsx,.csv,text/csv', mod.logbook.uploadExcel))),
    mod.backup.backupCard(
      h('h3', { style: 'margin-top:16px' }, 'Spreadsheet (Excel)'),
      h('p', { class: 'hint help' }, 'Your cases, your reflections or both as a spreadsheet: choose the dates and the columns. To edit cases and upload them back, use Import above.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, h('button', { onclick: mod.logbook.downloadExcel }, 'Download Excel…')),
      h('h3', { style: 'margin-top:16px' }, 'Markdown export (Obsidian and notes apps)'),
      h('p', { class: 'hint help' }, 'Your cases, reflections and notes as Markdown files for Obsidian and other notes apps, with Progress.md and, if you like, the figures. Laid out as you set in Settings → Markdown.'),
      h('p', { class: 'hint' }, 'The files hold your case details: keep them private, and check hospital policy before putting them into cloud notes or AI tools.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, h('button', { onclick: mod.notesExport.downloadNotes }, 'Download Markdown export…')),
      ...mod.cloudSave.cloudSaveSection()));
}

const app = document.getElementById('app');
const tabsEl = document.getElementById('tabs');
const whoEl = document.getElementById('who');
const subEl = document.getElementById('sub');
const banner = document.getElementById('banner');

// ---------- tabs and routing (#log, #logbook, ...) ----------

// Totals (names and counts of programme residents) is for the programme only; the rules agree.
const visibleTabs = () => TABS.filter(t => (!t.admin || S.admin) && (!t.faculty || facultyRole()) && (t.id !== 'totals' || S.admin || S.pd || S.resident));
// the tabs that can sit on the bar: the main ones, and the pages in the More list (bar: true), when put there
const barCandidates = () => visibleTabs().filter(t => !t.hidden || t.bar).map(t => t.id);
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
  document.body.dataset.bar = cur ? cur.id : S.tab;   // Settings → Display → Colourful: the page takes its tab's colour
  // Advanced display → the tab bar's order and hidden tabs (this device); a page on the bar (Settings) is selected
  // for its own pages too, and anything else off the bar under More
  const bar = visibleTabs(), { shown, sel } = barTabOf(S.tab);
  // same tabs as before: only move the selection, so the bar never blinks while changing tab (swipe included)
  const key = shown.map(id => id + ':' + bar.find(t => t.id === id).label).join('|');
  tabsEl.classList.toggle('many', shown.length > 5);
  if (tabsEl.dataset.key === key && tabsEl.children.length) {
    for (const b of tabsEl.children) b.setAttribute('aria-selected', String(b.dataset.tab === sel));
    tabsEl.hidden = false;
    return;
  }
  tabsEl.dataset.key = key;
  fill(tabsEl, ...shown.map(id => bar.find(t => t.id === id)).map(t => h('button', {
    role: 'tab', 'aria-selected': String(sel === t.id), 'data-tab': t.id, 'aria-label': t.label, title: t.label,   // named even with icons only
    onclick: () => go(t.id),
  }, icon(t.id), h('span', { class: 'lbl' }, t.short || t.label))));
  tabsEl.hidden = false;
}

function changeScreen(id, scroll = 0) {
  snapPage();   // for swiping back to it (a still copy)
  if (S.tab === 'account') mod.account?.flush();
  if (S.tab === 'notes' && id !== 'notes') leaveNotes();
  if (/^admin/.test(S.tab || '') && !/^admin/.test(id)) mod.admin?.leaveAdmin();
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
async function go(id) {
  await transients.dismissAll();
  if (S.tab === id) { if (id === 'log') focusLog(); return; }
  navigation.go(id);
}
hooks.navigate = go;
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

// Where a page's back link goes: nowhere for a page on the tab bar (Settings or Notes too, when put there); More for a
// bar page kept off the bar (Notes, Analytics…), where it's listed; otherwise the page it sits under
function parentOf(tab) {
  const cands = barCandidates();
  if (cands.includes(tab.id)) return arrangeTabs(cands, display()).shown.includes(tab.id) ? null : 'more';
  return tab.under || null;
}

// a live update waiting to draw the page again (hooks.casesChanged, below). Any full draw satisfies it: a page drawn
// since the change already shows it, so a postponed draw is dropped (one left over from another tab, held back while
// the note editor was open, never draws the Notes list again after Done; nor wipes a form opened meanwhile)
let pendingRender = false;
function render() {
  if (!S.user) return;
  pendingRender = false;
  // Settings → Logging → Show tips and help text: off hides every .help explanation (an experienced-user mode)
  document.body.classList.toggle('no-help', !!(S.logbook && S.logbook.settings && S.logbook.settings.hideTips));
  document.body.classList.toggle('basic', basicMode());
  document.body.classList.toggle('logbook-only', logbookOnly());
  document.body.classList.toggle('faculty-profile', facultyMode());
  paintTabs();
  const tab = visibleTabs().find(t => t.id === S.tab) || TABS[0];
  S.tab = tab.id;
  applyCustomCss();   // never on the Display page, so a bad rule can always be fixed there
  const y = window.scrollY;
  // every page without its own place on the tab bar gets a way back (owner, 13 Oct 2026): "‹ Settings" in the
  // header, in place of the app's name, or at the top of the page when the header is hidden (Advanced display)
  const parent = parentOf(tab);
  const backTo = parent && navigation.backTarget(parent);
  const back = backTo ? h('p', { class: 'back-row' }, h('a', { class: 'back-link', href: '#' + backTo,
    onclick: e => { e.preventDefault(); navigation.back(parent); } }, h('span', { class: 'back-chev', 'aria-hidden': 'true' }, '‹'), (TABS.find(t => t.id === backTo) || {}).label || 'Back')) : null;
  const brand = document.querySelector('.top .brand');
  brand?.querySelector('.back-row')?.remove();
  const inHeader = back && brand && !document.documentElement.classList.contains('no-header');
  if (inHeader) brand.prepend(back);
  document.body.classList.toggle('header-back', !!inHeader);
  // Advanced display → Page titles in the header: the page's name ("Logbook") instead of the app's
  setPageLabel(tab.label);
  const dir = slideDirection(lastRendered, tab.id);
  fill(app, inHeader ? null : back, tab.render());
  if (tab.id !== 'log') window.scrollTo(0, y);
  // the page on screen, once drawn (not while its code loads); read by tests
  const drawn = !app.querySelector('.lazy-wait');
  if (drawn) app.dataset.page = tab.id; else delete app.dataset.page;
  if (findAfterRender) { if (drawn) showFound(); }   // (kept until the page is drawn)
  // the inverted Case tab (Settings → Display, phones) opens at the bottom, where the case box is
  else if (lastRendered !== 'log' && invertedCase()) requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));
  lastRendered = tab.id;
  if (dir) slidePages(dir);
}
let lastRendered = '';

// Going into a page under a tab slides it in from the right as it fades in; going back, from the left (owner's
// Apple-apps review). Only the new page moves (no copy of the old one, so nothing on the screen is there twice); it
// is pinned while it moves, so nothing widens the screen. Only within one bar tab (switching tabs never slides) and
// not while swiping or with Reduce motion.
const depthOf = id => { let n = 0; for (let t = TABS.find(x => x.id === id); t && t.under; t = TABS.find(x => x.id === t.under)) n++; return n; };
function slideDirection(from, to) {
  if (!from || from === to || reduceMotion() || document.documentElement.classList.contains('swiping') || !app.firstChild) return 0;
  if (barTabOf(from).sel !== barTabOf(to).sel) return 0;
  const a = depthOf(from), b = depthOf(to);
  return b > a ? 1 : b < a ? -1 : 0;
}
let sliding = null, afterSlide = null;   // afterSlide: Settings search scrolling to its find once the page stops sliding
function slidePages(dir) {
  sliding?.();   // a slide still running ends now
  pin();
  const x = Math.round(innerWidth * 0.3) * dir;
  const a = app.animate([{ transform: `translateX(${x}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  const done = () => { if (sliding !== done) return; sliding = null; a.cancel(); unpin(); const then = afterSlide; afterSlide = null; then?.(); };
  sliding = done;
  a.finished.then(done, done);
}

// Swipe from the left edge to go back (Accessibility; only in the app on an iPhone or iPad home screen, where the
// phone has no Back gesture of its own; on unless switched off): the page follows the finger, and letting go past a
// third of the screen (or after a quick flick) goes back.
let edge = null;
document.addEventListener('touchstart', e => {
  edge = null;
  if (!S.user || display().edgeBack === false || !IPHONE_APP() || e.touches.length !== 1 || e.touches[0].clientX > 20) return;
  const tab = TABS.find(t => t.id === S.tab);
  if (!tab || !parentOf(tab) || e.target.closest('dialog, #tabs')) return;
  edge = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now(), lock: false, dx: 0, under: parentOf(tab) };
}, { passive: true });
document.addEventListener('touchmove', e => {
  const s = edge;
  if (!s || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
  if (!s.lock) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { edge = null; return; }
    if (dx > 10) { s.lock = true; if (!reduceMotion()) pin(); } else return;
  }
  e.preventDefault();
  s.dx = Math.max(0, dx);
  if (!reduceMotion()) move(app, s.dx);
}, { passive: false });
const edgeEnd = (e, cancel) => {
  const s = edge; edge = null;
  if (!s || !s.lock) return;
  const go = !cancel && (s.dx > innerWidth / 3 || (s.dx > 60 && Date.now() - s.at < 500));
  if (!go) {
    const a = app.animate([{ transform: `translateX(${s.dx}px)` }, { transform: 'translateX(0)' }], { duration: 160, easing: 'ease-out' });
    move(app, 0); a.finished.catch(() => {}).then(unpin);
    return;
  }
  move(app, 0); unpin();
  navigation.back(s.under);
};
document.addEventListener('touchend', e => edgeEnd(e, false), { passive: true });
document.addEventListener('touchcancel', e => edgeEnd(e, true), { passive: true });
hooks.render = render;
hooks.paintTabs = () => paintTabs();

// Folds open and close smoothly (owner's Apple-apps review): every <details> grows to its height or shrinks to its
// title row, with the chevron turning (style.css). The height is held for a moment first, so content a fold draws
// when it opens (its toggle handler) is in place before it is measured. Not menus (Quick actions), not while
// another handler took the click, and not with Reduce motion: then it just opens.
const FOLD_MS = 220, FOLD_EASE = 'cubic-bezier(.2, .7, .2, 1)';
document.addEventListener('click', e => {
  const sum = e.target.closest('summary');
  const d = sum && sum.parentElement;
  if (!d || d.tagName !== 'DETAILS' || sum !== d.querySelector(':scope > summary') || e.defaultPrevented || d.classList.contains('quick-actions') || d._folding || reduceMotion()) return;
  const inner = e.target.closest('a, button, input, select, textarea, label');   // a control inside the title row
  if (inner && inner !== sum && sum.contains(inner)) return;
  e.preventDefault();
  const opening = !d.open;
  const from = d.getBoundingClientRect().height;
  d._folding = true;
  d.style.height = from + 'px'; d.style.overflow = 'clip';
  if (opening) d.open = true;
  setTimeout(() => requestAnimationFrame(() => {
    d.style.height = '';
    let to;
    if (opening) to = d.getBoundingClientRect().height;
    else { const cs = getComputedStyle(d); to = sum.getBoundingClientRect().bottom - d.getBoundingClientRect().top + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth); }
    const done = () => { if (!opening) d.open = false; d.style.height = ''; d.style.overflow = ''; d._folding = false; };
    if (Math.abs(to - from) < 2 || !d.animate) return done();
    const a = d.animate({ height: [from + 'px', to + 'px'] }, { duration: FOLD_MS, easing: FOLD_EASE });
    a.onfinish = a.oncancel = done;
  }));
});

// Swipe left or right to change tab (Advanced display, and Show or hide → Header and tabs; on unless switched off on
// this device: html.swipe-tabs). Like a deck of cards: the page follows the finger and the next tab's page comes in
// beside it as you drag (a still copy of that page from when it was last left, `snaps`; a plain loading card for a
// tab not opened yet). Letting go after a quick swipe (≥ 70 px, mostly sideways, < 0.7 s) or past a third of the
// screen finishes the slide, then the real page takes the copy's place underneath (same spot, same scroll), so
// nothing pops. Otherwise both spring back. A sub-page counts as the bar tab it sits under. Never from fields,
// dialogs, drag handles, the tag pills being dragged, anything that scrolls sideways (tables, the date chips) or the
// screen's edges (the phone's own Back gesture). Works anywhere on the screen, including the empty background under a
// short page (owner). Reduce motion: no sliding, it just switches.
let swipe = null;
const snaps = new Map();   // bar tab → still copy of its page (inert, no ids), taken when leaving it
const scrollsSideways = el => { for (let n = el; n && n !== document.body; n = n.parentElement) if (n.scrollWidth > n.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(n).overflowX)) return true; return false; };
const reduceMotion = () => { const c = document.documentElement.classList; return c.contains('rm') || (c.contains('rm-auto') && matchMedia('(prefers-reduced-motion: reduce)').matches); };
// the bar tab a page sits under, however deep; a tab kept off the bar (Notes) counts as More
function barTabOf(id) {
  const { shown } = arrangeTabs(barCandidates(), display());
  let cur = TABS.find(t => t.id === id);
  while (cur && cur.under && !shown.includes(cur.id)) cur = TABS.find(t => t.id === cur.under);
  const sel = cur ? cur.id : id;
  return { shown, sel: shown.includes(sel) ? sel : 'more' };
}
const swipeTarget = dx => { const { shown, sel } = barTabOf(S.tab), i = shown.indexOf(sel); return i < 0 ? null : shown[i + (dx < 0 ? 1 : -1)] || null; };
function snapPage() {
  if (!document.documentElement.classList.contains('swipe-tabs') || !matchMedia('(pointer: coarse)').matches || !S.tab || !barTabOf(S.tab).shown.includes(S.tab)) return;   // touch screens only
  const c = app.cloneNode(true);
  c.removeAttribute('id'); c.removeAttribute('style');
  c.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  snaps.set(S.tab, c);
}
// the incoming page: its copy, or a loading card, fixed where the page's top sits when scrolled to the top
function makePeek(id, top) {
  const c = (snaps.get(id) || h('main', {}, h('section', { class: 'card skeleton' }, h('div', { class: 'sk-row' }, h('i'), h('i'), h('i')), h('div', { class: 'sk-box' }), h('div', { class: 'sk-line' })))).cloneNode(true);
  c.className = 'swipe-peek'; c.inert = true; c.setAttribute('aria-hidden', 'true');
  const r = app.getBoundingClientRect();
  Object.assign(c.style, { top: top + 'px', left: (r.left - (parseFloat(app.style.transform.slice(11)) || 0)) + 'px', width: r.width + 'px' });
  document.body.append(c);
  return c;
}
const move = (el, x) => { el.style.transform = x ? `translateX(${x}px)` : ''; };
// While swiping, the page is pinned where it is (position: fixed over a spacer of its height, so the scroll stays):
// a fixed page sliding past the screen's edge doesn't widen the phone's layout viewport, which moved the tab bar.
// (Clipping overflow on html/body instead stopped Chrome on Android scrolling to the very bottom.)
let spacer = null;
function pin() {
  const r = app.getBoundingClientRect();
  spacer = h('div', { 'aria-hidden': 'true', style: `height:${app.offsetHeight}px` });
  app.before(spacer);
  Object.assign(app.style, { position: 'fixed', top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', margin: '0', zIndex: '4' });
}
function unpin() {
  if (spacer) { spacer.remove(); spacer = null; }
  Object.assign(app.style, { position: '', top: '', left: '', width: '', margin: '', zIndex: '' });
}
function endSwipe(s) {
  if (s.peek) s.peek.remove();
  document.documentElement.classList.remove('swiping');
  move(app, 0); unpin();
}
document.addEventListener('touchstart', e => {
  swipe = null;
  if (!S.user || !document.documentElement.classList.contains('swipe-tabs') || e.touches.length !== 1) return;
  const t = e.target, x = e.touches[0].clientX;
  if (x < 20 || x > innerWidth - 20) return;
  // anywhere on the screen, the background under a short page included; not on the tab bar or a banner
  if (t.closest('#tabs, .banner, input, textarea, select, dialog, [contenteditable], .dragging, .te-pillitem, .te-handle, .refl-handle, li.refl-row.edit') || scrollsSideways(t)) return;
  swipe = { x, y: e.touches[0].clientY, at: Date.now(), lock: '', dx: 0, target: null, peek: null };
}, { passive: true });
document.addEventListener('touchmove', e => {
  const s = swipe;
  if (!s || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
  if (!s.lock) {
    if (Math.abs(dy) > 10 && Math.abs(dy) * 2 > Math.abs(dx)) { swipe = null; return; }   // scrolling: leave it alone
    if (Math.abs(dx) > 10 && Math.abs(dx) > 2 * Math.abs(dy)) {
      s.lock = 'x';
      s.top = app.getBoundingClientRect().top + window.scrollY;   // the page's top when scrolled to the top
      s.peekTop = Math.max(0, s.top - window.scrollY);   // where the new page will sit: no higher than the screen's top
      document.documentElement.classList.add('swiping');
      if (!reduceMotion()) pin();
    } else return;
  }
  e.preventDefault();   // sideways now: the page follows the finger (held back where there's no tab to go to)
  s.dx = dx;
  if (reduceMotion()) return;
  const target = swipeTarget(dx);
  if (target !== s.target) { if (s.peek) s.peek.remove(); s.target = target; s.peek = target ? makePeek(target, s.peekTop) : null; }
  move(app, target ? dx : dx / 4);
  if (s.peek) move(s.peek, dx - (dx < 0 ? -innerWidth : innerWidth));
}, { passive: false });
const springBack = s => {
  const opts = { duration: 160, easing: 'ease-out' }, from = parseFloat(app.style.transform.slice(11)) || 0;
  const anims = [app.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], opts)];
  if (s.peek) anims.push(s.peek.animate([{ transform: s.peek.style.transform }, { transform: `translateX(${from < 0 ? innerWidth : -innerWidth}px)` }], opts));
  move(app, 0); if (s.peek) move(s.peek, from < 0 ? innerWidth : -innerWidth);
  anims[0].finished.catch(() => {}).then(() => endSwipe(s));
};
document.addEventListener('touchcancel', () => { const s = swipe; swipe = null; if (s && s.lock) springBack(s); }, { passive: true });
document.addEventListener('touchend', async e => {
  const s = swipe; swipe = null;
  if (!s || !e.changedTouches.length) return;
  const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
  const quick = Date.now() - s.at <= 700 && Math.abs(dx) >= 70 && Math.abs(dx) >= 2 * Math.abs(dy);
  const far = s.lock === 'x' && Math.abs(dx) > innerWidth / 3;
  const next = (quick || far) && swipeTarget(dx);
  if (!next) { if (s.lock) springBack(s); return; }
  if (reduceMotion() || !s.peek || s.target !== next) { endSwipe(s); go(next); return; }
  // finish the slide: both cards on one clock, so they stay joined
  const w = dx < 0 ? -innerWidth : innerWidth, ms = Math.max(120, Math.min(240, 240 * (1 - Math.abs(dx) / innerWidth)));
  const opts = { duration: ms, easing: 'ease-out', fill: 'forwards' };
  const anims = [app.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${w}px)` }], opts),
    s.peek.animate([{ transform: `translateX(${dx - w}px)` }, { transform: 'translateX(0)' }], opts)];
  const t0 = document.timeline.currentTime;
  anims.forEach(an => { an.startTime = t0; });
  await anims[1].finished.catch(() => {});
  // the real page goes in underneath the copy, at the copy's height on the screen, then the copy goes
  const peek = s.peek, y = s.top - s.peekTop;
  move(app, w); anims[0].cancel();
  await go(next);
  requestAnimationFrame(() => {
    unpin(); move(app, 0);
    window.scrollTo(0, y);   // after the screen change's own scroll
    peek.remove(); anims[1].cancel();
    document.documentElement.classList.remove('swiping');
  });
}, { passive: true });

// A live case update shouldn't yank the screen from under someone typing: the Log screen refreshes
// its counts in place; other screens re-render when nothing is being edited (pendingRender: declared above render()).
// Settings pages that show no case data: drawing them again would only throw away what is half filled in there (a
// sync place being added, a search being typed)
const CASE_FREE = new Set(['settings', 'showhide', 'display', 'displayadv', 'access', 'logging', 'loggingadv', 'reflset', 'sendto', 'sync']);
hooks.casesChanged = () => {
  paintWho();
  if (S.tab === 'log') return logCasesChanged();
  // the Notes list repaints its rows in place (every note save comes through here too: drawing the page again 250 ms
  // after Done could swallow the next tap, or leave the list undrawn in Firefox)
  if (S.tab === 'notes') return notesChanged();
  if (S.tab === 'account' || /^admin/.test(S.tab || '') || S.tab === 'totals' || CASE_FREE.has(S.tab)) return;
  pendingRender = true;
  setTimeout(flushRender, 250);
};
// someone is typing in the page or has a dialog open (the note editor shows no case data: drawing it again would only
// close its ⋯ menu mid-tap)
function editingNow() {
  const a = document.activeElement;
  return !!(document.querySelector('dialog[open]') || (a && app.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || app.querySelector('.note-editor'));
}
function flushRender() {
  if (!pendingRender) return;
  if (editingNow()) { setTimeout(flushRender, 1000); return; }
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
  document.documentElement.classList.toggle('who-alert', !S.user || !navigator.onLine || !!S.pending);
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
    const before = JSON.stringify([S.admin, S.owner, S.pd, S.faculty, S.resident, S.sharedTemplates, categoryNamesNow()]);
    Object.assign(S, { admin: !!w.admin, owner: !!w.owner, pd: !!w.pd, faculty: !!w.faculty, resident: w.resident || null, sharedTemplates: w.sharedTemplates || [] });
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
    if (!lbChanged && before === JSON.stringify([S.admin, S.owner, S.pd, S.faculty, S.resident, S.sharedTemplates, categoryNamesNow()])) return;
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
  const previousUser = S.user;
  S.user = user;
  if (previousUser && user && previousUser.email !== user.email) {
    // the new account's own store stays (another tab may already be using it)
    const cleanup = Promise.all([writes.forget(), cloud.forgetLocal(() => true, user.email)]);
    Object.assign(S, { cases: [], reflections: [], counts: {}, casesLoaded: false, casesSynced: false, logbook: null });
    clearDrafts(); resetCaches(); forgetWho(); forgetSync(); clearToast(); transients.reset();
    document.querySelectorAll('dialog[open]').forEach(el => el.close());
    app.innerHTML = SKELETON;
    try { await cleanup; } catch (err) { if (S.user === user) toast(err.message); }
    if (S.user !== user) return;
  }
  if (!user) {
    Object.assign(S, { admin: false, owner: false, pd: false, faculty: false, resident: null, logbook: null, cases: [], reflections: [], counts: {}, casesLoaded: false, casesSynced: false, sharedTemplates: [] });
    // this device's copies of the last account go (the local store always: a shared PC keeps nothing)
    const cleanup = Promise.all([signedInOnce ? writes.forget() : null, cloud.forgetLocal(() => !S.user)]);
    if (signedInOnce) { clearDrafts(); resetCaches(); forgetWho(); forgetSync(); }
    transients.reset();
    document.querySelectorAll('dialog[open]').forEach(el => el.close());
    clearToast(); paintWho(); renderLanding();
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
    cloud.isFaculty(user.email).catch(() => false),
  ]).then(([admin, resident, shared, pd, names, owner, faculty]) => ({ admin, resident, sharedTemplates: shared || [], pd, names: names || {}, owner, faculty }));
  try {
    const known = readWho(user.email);
    const [logbook, w] = await Promise.all([cloud.loadLogbook(user.email, { cached: true }), known ? Promise.resolve(known) : who()]);
    if (S.user !== user) return; // signed out meanwhile
    reloadFlag('');
    Object.assign(S, { admin: !!w.admin, owner: !!w.owner, pd: !!w.pd, faculty: !!w.faculty, resident: w.resident || null, logbook, sharedTemplates: w.sharedTemplates || [] });
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
  // a start tab hidden from the bar gives way to the first tab on it
  const onBar = arrangeTabs(barCandidates(), display()).shown;
  S.tab = tabFromHash() || (START_TABS.some(([v]) => v === start) && onBar.includes(start) ? start : onBar.find(id => id !== 'more') || 'log');
  navigation.initialize(S.tab);
  if (wantToday) { wantToday = false; setTimeout(() => { if (S.user === user) openDayNote(); }, 0); }
  // a POST share: the Case tab (or the chooser it forwards to) draws again once the service worker's copy is read
  if (sharedIn) sharedIn.then(() => { if (S.user === user && (S.tab === 'log' || S.tab === 'share')) render(); });
  // Settings → Backup: a one-tap reminder when the last Drive / Dropbox backup is over a week old (if asked for)
  // (their code loads only when one is asked for)
  setTimeout(() => {
    if (S.user !== user) return;
    if (settings().cloudBackup?.remind) withMod('cloudSave', m => m.remindBackup()).catch(() => {});
    if (settings().sync?.remind) withMod('sync', m => m.remindSync()).catch(() => {});
  }, 3000);
  // back from a Drive / Dropbox sign-in: finish that save
  // (index.html keeps the sign-in's answer in sessionStorage; cloud-save.js loads only when there is one)
  if ((() => { try { return sessionStorage.getItem('apmes-logbook-cloud-return'); } catch { return null; } })()) withMod('cloudSave', m => m.resumeCloudSave()).catch(err => console.warn(err));
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
    // the cases arrive a moment after the first paint (the device's store is read in the background): a page that shows
    // none stays as it is, and one someone is already typing in or has a dialog open on waits like any later change
    if (!first) hooks.casesChanged();
    else if (CASE_FREE.has(S.tab)) paintWho();
    else if (S.tab !== 'log' && editingNow()) { paintWho(); pendingRender = true; setTimeout(flushRender, 250); }
    else { paintWho(); render(); }
    scheduleSummary();
  });
  render();
  warmUp();
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
  // Accessibility → Hide the tab bar while typing (this device; off unless switched on, on in the Personal profile):
  // the bar at the bottom goes while the keyboard is up, so the box and its Save bar keep that room
  document.body.classList.toggle('typing-nobar', typing && barAtBottom({ width: window.innerWidth, tabBar: display().tabBar }) && deviceOn(display(), S.logbook ? profile() : '', 'hideTabsTyping'));
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

// shared to the installed app (Android share sheet; share-in.js): the text waits for the Case tab, as it always did
// (its paste-a-list), whether it came the old GET way or as a POST (text or files, received by sw.js). The Case tab
// sends it on to the chooser only when Settings → Notes → Ask is on or files came (ui-log.js takeShared). Tidy the
// address.
const sharedIn = (() => {
  const { has, text, rest } = fromQuery(location.search);
  const posted = new URLSearchParams(location.search).has('shared');
  if (!has && !posted) return null;
  if (has) keepShared(text);
  history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + '#log');
  return posted ? readInbox(location.href) : Promise.resolve(text);
})();
// "Today's note" (the app's shortcut, ./#today): open today's daily note once signed in
let wantToday = location.hash === '#today';
if (wantToday) history.replaceState(null, '', location.pathname + location.search + '#notes');
addEventListener('hashchange', () => { if (location.hash === '#today' && S.user) { history.replaceState(history.state, '', location.pathname + location.search + '#notes'); openDayNote(); } });
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
// Reset demo (the demo badge's menu, and the link by Sign out on More): asks first, then starts again
async function resetDemo() {
  if (!(await confirmBox('Reset demo', 'Delete everything you added in the demo (cases, reflections, images, settings) and start again with the made-up data? The uploaded portfolio template is kept.', 'Reset', true))) return;
  clearDrafts(); resetCaches(); forgetWho(); forgetSync(); resetDisplay(); applyCompact(false); applyTextSize('1'); applyAccent(null);
  cloud.resetDemo();
  location.reload();
}
hooks.resetDemo = resetDemo;
function demoMenu() {
  const m = modal('Demo', [
    h('p', {}, 'Made-up data, stored only in this browser. Try anything: nothing is sent anywhere.'),
    h('div', { class: 'bar', style: 'margin-top:12px;flex-wrap:wrap' },
      h('button', { class: 'danger', onclick: async () => { await m.close(); resetDemo(); } }, 'Reset demo'),
      h('a', { href: location.pathname, class: 'btn' }, 'Leave demo'),
      h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Close'))]);
}
if (window.LOGBOOK_MOVED_TO) { tabsEl.hidden = true; import('./moved.js').then(m => fill(app, m.movedPage(window.LOGBOOK_MOVED_TO))); }   // the old address with this browser's choices saved: offer them, don't sign in here
else if (!cloud.enabled) renderLanding();
else cloud.watchUser(onUser).catch(err => renderLanding('Could not start sign-in: ' + err.message));
registerSW();
