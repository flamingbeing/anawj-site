// Settings tab (#settings): the Admin entry (admins only), display, logging, templates, recycle bin, privacy. Also the Account tab's
// "You" and sign-out cards (youCard, signOutCard), used by ui-account.js.

import { YEAR_NAMES, DEFAULT_NAMES, BY_CODE } from './categories.js';
import { sortCodes, uid, academicYear, withParents, weekStart, humanAge } from './engine.js';
import { S, h, info, toast, modal, confirmBox, cloud, writes, catChip, catName, catShort, PICKER_ORDER, pickerOrder, settings, patchLogbook, displayName, hooks, rYear, myYearName, fill, PROFILES, profile, basicMode, facultyRole, BASIC_ITEMS, basicHides, setBasicOn, caseShown, setCaseShown, categoryNames, setCategoryNames, catPills, tagSet, resetters, download, fileButton, todayISO, saveMany, UNDO_SECS, rowIcon } from './ui-core.js';
import { MAX_TAGS, tagLinks as tagLinksIn, learnShorthand, cleanShorthand, shorthandOf, DEFAULT_SHORTHAND, cleanTagSet, defaultTagSet, tagTree, flatTree, moveTag, reparentTag, removeTag, newKey, tagSetToCsv, tagSetFromCsv, dropTag, canPlace, placeNewTag } from './tags.js';
import { pickDialog, CASE_PARTS, AFTER_SAVE } from './ui-log.js';
import { OPERATOR_HELP } from './search-ops.js';
import { DEFAULT_ACCENT, cleanAccent, schemeCss, lightPalette, tabSchemeCss, tabVarsCss } from './colors.js';
import { cleanMarkdown, storedMarkdown, mdCase, mdDay, reflectionPath, reflectionNote, CASE_FILLINS, REFL_FILLINS, FM_FIELDS } from './markdown.js';
import { checkCss } from './custom-css.js';
import { FONTS, applyFonts, fontStack, fontAvailable, cleanFontName, logChoice, saveUserFont, getUserFont, deleteUserFont } from './fonts.js';
import { PHOTO_BUDGET_KB, PHOTO_NOTE, photoUsageKb, fmtMb } from './reflections.js';

// Compact mode (this device's display settings, below): body.compact (style.css, "compact mode" block). Cached in
// localStorage so the first paint after a reload is already compact, before the logbook loads.
const COMPACT_KEY = 'apmes-logbook-compact';
export function applyCompact(on) {
  document.body.classList.toggle('compact', !!on);
  try { on ? localStorage.setItem(COMPACT_KEY, '1') : localStorage.removeItem(COMPACT_KEY); } catch { /* storage blocked */ }
}
// Theme: 'light' (default), 'dark', or 'auto' (follows the phone) as <html data-theme>, styled at
// the end of style.css. Saved on this device only (Auto is a device setting, and a ward PC can stay
// light while a phone is dark); sign-out keeps it. index.html applies it before the first paint.
const THEME_KEY = 'apmes-logbook-theme';
// light | dark | oled (dark with pure black: data-oled) | auto (follows the phone)
export function applyTheme(t) {
  const theme = ['dark', 'oled', 'auto'].includes(t) ? t : 'light';
  document.documentElement.dataset.theme = theme === 'oled' ? 'dark' : theme;
  if (theme === 'oled') document.documentElement.dataset.oled = ''; else delete document.documentElement.dataset.oled;
  try { theme === 'light' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
}
export function cachedTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
}
// Text size (this device's display settings): the words only (style.css font sizes × --fs); the layout stays.
// Interface zoom: everything, header and tab bar too (body zoom, --ui-zoom), like a notes app's zoom level;
// Ctrl/Cmd + / − / 0 on a computer (app.js). Both cached on the device for the first paint (index.html).
const SIZE_KEY = 'apmes-logbook-textsize', ZOOM_KEY = 'apmes-logbook-zoom';
export const TEXT_SIZES = [['0.85', 'Smallest'], ['0.92', 'Smaller'], ['1', 'Normal'], ['1.1', 'Larger'], ['1.2', 'Largest']];
export const ZOOMS = ['0.8', '0.9', '1', '1.1', '1.25', '1.5'];
export function applyTextSize(z) {
  const v = TEXT_SIZES.some(([k]) => k === String(z)) ? String(z) : '1';
  document.documentElement.style.setProperty('--fs', v);
  try { v === '1' ? localStorage.removeItem(SIZE_KEY) : localStorage.setItem(SIZE_KEY, v); } catch { /* storage blocked */ }
}
export function applyZoom(z) {
  const v = ZOOMS.includes(String(z)) ? String(z) : '1';
  document.documentElement.style.setProperty('--ui-zoom', v);
  try { v === '1' ? localStorage.removeItem(ZOOM_KEY) : localStorage.setItem(ZOOM_KEY, v); } catch { /* storage blocked */ }
}
// one step in or out (or back to 100%), saved on this device
export function stepZoom(dir) {
  const i = ZOOMS.indexOf(String(display().zoom || '1'));
  const v = dir === 0 ? '1' : ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + dir))];
  applyZoom(v); setDisplay({ zoom: v });
  return v;
}
// Colour (this device's display settings): one accent colour; colors.js works out the
// light, dark and OLED palettes. The CSS is cached on the device so the first paint has it (index.html).
const ACCENT_CSS_KEY = 'apmes-logbook-accent-css';
export function applyAccent(c) {
  const accent = cleanAccent(c) || DEFAULT_ACCENT;
  const css = schemeCss(accent);
  let el = document.getElementById('accent-css');
  if (!el) { el = document.createElement('style'); el.id = 'accent-css'; document.head.append(el); }
  el.textContent = css;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', lightPalette(accent).accent);
  try { accent === DEFAULT_ACCENT ? localStorage.removeItem(ACCENT_CSS_KEY) : localStorage.setItem(ACCENT_CSS_KEY, css); } catch { /* storage blocked */ }
}
export function cachedTextSize() {
  try { return localStorage.getItem(SIZE_KEY) || '1'; } catch { return '1'; }
}
export function cachedZoom() {
  try { return localStorage.getItem(ZOOM_KEY) || '1'; } catch { return '1'; }
}
export function cachedCompact() {
  try { return localStorage.getItem(COMPACT_KEY) === '1'; } catch { return false; }
}

// Settings is a short menu (app.js) of these pages: Display, Logging, the Tag editor and the Recycle bin.
// Residency year (for people not on the programme list) is on Account; reflection settings on the
// Reflections tab (#reflset).
export function residencyCard() {
  return (
    S.resident ? null : h('section', { class: 'card' },
      h('h2', {}, 'Residency year'),
      h('label', { class: 'field' }, 'Year used for the targets on Analytics',
        h('select', { onchange: e => patchLogbook({ settings: { rYear: Number(e.target.value), rYearAY: academicYear() } }).then(() => toast('Saved')) },
          YEAR_NAMES.map((r, i) => h('option', { value: String(i + 1), selected: i + 1 === rYear() }, r)))),
      h('p', { class: 'hint', style: 'margin:4px 0 0' }, 'Programme residents get their year from the programme list automatically. If you are an APMES resident, ask the programme admins to add your email.')));
}

// Display settings belong to the device, not the account (owner: people use the logbook on different devices with
// different needs): compact mode, text size, colour and the tab the app opens on, in localStorage DISPLAY_KEY, next to
// the light / dark choice. The first time a device opens the app it starts from what the account had (these used to
// follow the account), so nobody's look changes. Kept at sign-out: they are the device's, and nothing private.
const DISPLAY_KEY = 'apmes-logbook-display';
export const DISPLAY_KEYS = ['compact', 'textSize', 'zoom', 'accent', 'startTab', 'fontUi', 'fontUiName', 'fontLog', 'fontLogName', 'lineWidth', 'lineHeight', 'contrast', 'motion', 'tabIcons', 'tabBar', 'hideHeader', 'caseInverted', 'colourful', 'customCss', 'customCssOn', 'autoFocus', 'appTitle', 'boxCaps', 'boxCorrect', 'boxSpell', 'reflSpell', 'pinBox', 'pinSearch', 'firstField', 'compactTags', 'borders', 'round', 'shadows', 'bigTaps', 'tabOrder', 'tabHidden', 'swipeTabs', 'rowMenu', 'rowCopy', 'reflToolbar', 'edgeBack', 'hideWords', 'flat', 'btnStyle', 'iconBtns', 'calPlain', 'pageTitles', 'rowShort', 'rowHold', 'dayCopy'];
export function deviceDisplay() {
  try { const d = JSON.parse(localStorage.getItem(DISPLAY_KEY) || 'null'); return d && typeof d === 'object' && !Array.isArray(d) ? d : null; } catch { return null; }
}
export const display = () => migrateDisplay(deviceDisplay()) || {};
// before Interface zoom, "Text size" zoomed the page content: carry it over as the zoom (closest step) once
const OLD_SIZES = { '0.8': '0.8', '0.9': '0.9', '1.12': '1.1', '1.25': '1.25' };
function migrateDisplay(d) {
  if (!d || d.v === 2) return d;
  const out = { ...d, v: 2 };
  if (OLD_SIZES[String(d.textSize)] && !d.zoom) { out.zoom = OLD_SIZES[String(d.textSize)]; out.textSize = '1'; }
  try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(out)); } catch { /* storage blocked */ }
  return out;
}
export function setDisplay(patch) {
  const d = { ...display(), ...patch };
  try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(d)); } catch { /* storage blocked: this visit only */ }
  return d;
}
let adoptedNow = false;
// this device's display settings, made from the account's the first time (fresh: the server's copy replaces a
// first guess made from a stale offline copy earlier in the same visit)
export function adoptDisplay(accountSettings, { fresh = false } = {}) {
  if (deviceDisplay() && !(fresh && adoptedNow)) return display();
  adoptedNow = !fresh;
  try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(Object.fromEntries(DISPLAY_KEYS.map(k => [k, (accountSettings || {})[k] ?? null])))); } catch { /* storage blocked */ }
  return display();   // (an old account text size becomes the zoom here too)
}
export function resetDisplay() { adoptedNow = false; try { localStorage.removeItem(DISPLAY_KEY); } catch { /* storage blocked */ } }
export function applyDisplay(d = display()) { applyCompact(!!d.compact); applyTextSize(d.textSize || '1'); applyZoom(d.zoom || '1'); applyAccent(d.accent); applyFonts(d); applyLook(d); }
// page width (lineWidth), line spacing, contrast, motion, icons-only tabs: classes on <html> and --lh (style.css, end); also set at
// first paint from the same localStorage entry (index.html)
export const LINE_WIDTHS = [['narrow', 'Narrow (easier to read on a big screen)'], ['normal', 'Normal (default)'], ['wide', 'Wide'], ['full', 'Full (no limit)']];
export const LINE_HEIGHTS = [['0.9', 'Tight'], ['1', 'Normal (default)'], ['1.15', 'Relaxed'], ['1.3', 'Loose']];
export const CONTRASTS = [['auto', 'Follow the device (default)'], ['normal', 'Normal'], ['high', 'Higher contrast']];
export const MOTIONS = [['auto', 'Follow the device (default)'], ['full', 'Animations on'], ['reduce', 'Reduce motion']];
export function applyLook(d = {}) {
  const c = document.documentElement.classList;
  c.toggle('lw-narrow', d.lineWidth === 'narrow'); c.toggle('lw-wide', d.lineWidth === 'wide'); c.toggle('lw-full', d.lineWidth === 'full');
  document.documentElement.style.setProperty('--lh', LINE_HEIGHTS.some(([v]) => v === String(d.lineHeight)) ? String(d.lineHeight) : '1');
  const ct = d.contrast || 'auto'; c.toggle('hc', ct === 'high'); c.toggle('hc-auto', ct === 'auto');
  const mo = d.motion || 'auto'; c.toggle('rm', mo === 'reduce'); c.toggle('rm-auto', mo === 'auto');
  c.toggle('tab-icons', !!d.tabIcons);
  c.toggle('tabs-top', d.tabBar === 'top'); c.toggle('tabs-bottom', d.tabBar === 'bottom');
  c.toggle('no-header', !!d.hideHeader);
  c.toggle('case-inverted', !!d.caseInverted);
  const col = d.colourful === true ? 'tabs' : d.colourful;   // (a plain on/off before "everything in the tab")
  c.toggle('colourful', col === 'tabs' || col === 'all'); c.toggle('colour-all', col === 'all');
  if (col === 'tabs' || col === 'all') {
    // with the default colour the tabs follow the NUH stripe at the top; with another colour, the brighter set
    const set = (cleanAccent(d.accent) || DEFAULT_ACCENT) === DEFAULT_ACCENT ? NUH_TAB_COLOURS : TAB_COLOURS;
    const css = tabVarsCss(set) + '\n' + (col === 'all' ? Object.entries(set).map(([t, hex]) => tabSchemeCss(hex, `body[data-bar="${t}"]`)).join('\n') : '');
    let el = document.getElementById('tab-colours');
    if (!el) { el = document.createElement('style'); el.id = 'tab-colours'; document.head.append(el); }
    if (el.textContent !== css) el.textContent = css;
  }
  c.toggle('no-autofocus', d.autoFocus === false);
  // the case box's keyboard and the reflection editor's spelling (Logging / Reflections pages; read by ui-log.js, ui-reflect.js)
  c.toggle('box-caps-off', d.boxCaps === false); c.toggle('box-correct', d.boxCorrect === true); c.toggle('box-spell-off', d.boxSpell === false);
  c.toggle('refl-spell-off', d.reflSpell === false);
  // pinned while scrolling: the case box (Case tab) and the search card (Logbook)
  c.toggle('pin-box', !!d.pinBox); c.toggle('pin-search', !!d.pinSearch);
  // Borders: softer lines (--edge, style.css); at Borderless / Faint fields, buttons and chips get a light fill instead
  // Flat (the slider's far end, owner 13 Oct 2026): borderless, and the page cards melt into the page
  const bl = d.flat ? 0 : borderLevel(d), soft = bl < BORDERS.length - 1;
  c.toggle('flat', !!d.flat);
  c.toggle('edges', soft); c.toggle('edges-fill', bl <= 1);
  if (soft) document.documentElement.style.setProperty('--edge-mix', BORDER_MIX[bl] + '%'); else document.documentElement.style.removeProperty('--edge-mix');
  // corners, card shadows instead of lines, bigger tap targets on the Case tab
  const rl = roundLevel(d);
  if (rl !== 2) document.documentElement.style.setProperty('--round', String(ROUNDS[rl][1])); else document.documentElement.style.removeProperty('--round');
  c.toggle('shadows', d.shadows !== false);   // soft shadows by default (owner, 12 Oct 2026); false = lines
  c.toggle('big-taps', !!d.bigTaps);
  // swipe between the bar's tabs (app.js; on unless switched off: swipeTabs false); one ⋯ menu on Logbook rows
  // instead of Copy and Reflect (ui-logbook.js)
  c.toggle('swipe-tabs', d.swipeTabs !== false); c.toggle('row-menu', !!d.rowMenu); c.toggle('refl-toolbar', !!d.reflToolbar);
  // Copy on each Logbook row: off by default (owner, 13 Oct 2026); the ⋯ menu, Share for a day and the case itself still copy
  c.toggle('row-copy', !!d.rowCopy);
  // Copy beside Share for a day in the Logbook calendar: off by default too (owner, 13 Oct 2026)
  c.toggle('day-copy', !!d.dayCopy);
  // word counts on the Reflections list: on unless switched off (Settings → Reflections; owner, 13 Oct 2026)
  c.toggle('no-wc', !!d.hideWords);
  // the seven Clean looks (owner, 13 Oct 2026; Advanced display and Accessibility, all off by default): button style,
  // icons instead of words, the plain calendar, page titles in the header, shorter Logbook rows, press and hold
  for (const b of BUTTON_STYLES.slice(1)) c.toggle('btn-' + b[0], d.btnStyle === b[0]);
  c.toggle('icon-btns', !!d.iconBtns); c.toggle('cal-plain', !!d.calPlain); c.toggle('page-titles', !!d.pageTitles);
  c.toggle('rows-short', !!d.rowShort); c.toggle('row-hold', !!d.rowHold);
  // the name in the header and the browser tab (plain text, at most 40 characters)
  const title = cleanTitle(d.appTitle) || APP_TITLE;
  paintTitle(d);
  if (document.title !== title) document.title = title;   // ui-log.js: don't open the keyboard on the Case tab
  applyCustomCss(d);
}
export const BUTTON_STYLES = [['outlined', 'Outlined (default)'], ['filled', 'Filled'], ['tinted', 'Tinted'], ['plain', 'Plain']];
// the header's words: the app's name, or with Page titles the page's ("Logbook"); render() in app.js says which page
let pageLabel = '';
export function setPageLabel(l) { pageLabel = l || ''; paintTitle(); }
function paintTitle(d = display()) {
  const t = (d.pageTitles && pageLabel) || cleanTitle(d.appTitle) || APP_TITLE;
  const h1 = document.querySelector('.top h1'); if (h1 && h1.textContent !== t) h1.textContent = t;
}
// one colour per tab (Colourful); style.css has the same shades for the tabs-and-headings version
export const TAB_COLOURS = { log: '#c2410c', logbook: '#0e7490', reflect: '#be123c', progress: '#1d4ed8', more: '#6d28d9' };
// the NUH stripe (orange, red, blue, navy) for the default colour; More keeps the app's navy
export const NUH_TAB_COLOURS = { log: '#e57200', logbook: '#e4002b', reflect: '#178fd7', progress: '#002f6c', more: '#002f6c' };
export const APP_TITLE = 'APMES Logbook';
// Borders (Display, per device): how strong the lines around cards, fields, buttons and chips are; the last is the default
export const BORDERS = ['Borderless', 'Faint', 'Light', 'Soft', 'Normal (default)'];
export const BORDER_MIX = [0, 25, 50, 75];
// Corners (Display, per device): every border-radius in style.css is multiplied by --round; Normal is the default
export const ROUNDS = [['Square', 0], ['Slightly rounded', 0.5], ['Normal (default)', 1], ['Very round', 1.7]];
export const roundLevel = d => (Number.isInteger(d.round) && d.round >= 0 && d.round < ROUNDS.length ? d.round : 2);
// The tab bar (Advanced display, per device): the order of its tabs and which are hidden. More always stays
// (Settings live there), at least two and at most seven (MAX_BAR, More included) stay on the bar; hidden main tabs
// are listed first on the More page. Every page in the More list can go on the bar too (Admin portal: admins only).
export const BAR_TABS = [['caselogs', 'Case logs'], ['log', 'Case'], ['logbook', 'Logbook'], ['reflect', 'Reflections'], ['progress', 'Analytics'], ['notes', 'Notes'],
  ['account', 'Account'], ['settings', 'Settings'], ['recovery', 'Recover drafts'], ['data', 'Export / Import'], ['admin', 'Admin portal'], ['more', 'More']];
export const barTabs = () => BAR_TABS.filter(([id]) => (id !== 'admin' || S.admin) && (id !== 'caselogs' || facultyRole()));
// tabs off the bar until someone puts them there (they live in More by default); the Basic profiles keep Analytics
// in More too, and Basic: logbook only Reflections. Case logs is on the bar only in Faculty / PCs, which keeps the
// person's own Case, Logbook and Reflections in More instead.
const OFF_BAR = ['caselogs', 'notes', 'account', 'settings', 'recovery', 'data', 'admin'];
const PROFILE_OFF = { advanced: [], basic: ['progress'], logbook: ['progress', 'reflect'], faculty: ['log', 'logbook', 'reflect'] };
// (Faculty / PCs also puts the Admin portal on the bar, for admins: the tab is theirs only)
const offBar = mode => [...OFF_BAR.filter(id => mode !== 'faculty' || (id !== 'caselogs' && id !== 'admin')), ...(PROFILE_OFF[mode] || [])];
export const MAX_BAR = 7;
export function arrangeTabs(ids, d = {}, mode = profile()) {
  const order = Array.isArray(d.tabOrder) ? d.tabOrder : [];
  // a tab not in the saved order goes just before More (More stays last unless moved)
  const before = order.includes('more') ? order.indexOf('more') - 0.5 : order.length;
  const at = id => (order.includes(id) ? order.indexOf(id) : id === 'more' ? order.length + 1e3 : before + ids.indexOf(id) / 1e3);
  const sorted = [...ids].sort((a, b) => at(a) - at(b));
  // an OFF_BAR tab stays off until someone shows it in Arrange tabs (which saves the order with it in)
  const hidden = new Set([...(Array.isArray(d.tabHidden) ? d.tabHidden : []), ...offBar(mode).filter(id => !order.includes(id) || !Array.isArray(d.tabHidden))].filter(id => id !== 'more'));
  // over the limit (saved by hand, or an old settings file): the last ones in the order go to More
  for (const id of [...sorted].reverse()) if (sorted.filter(k => !hidden.has(k)).length > MAX_BAR && id !== 'more' && !hidden.has(id)) hidden.add(id);
  const shown = sorted.filter(id => !hidden.has(id));
  return shown.length >= 2 ? { sorted, shown, hidden: sorted.filter(id => hidden.has(id)) } : { sorted, shown: sorted, hidden: [] };
}
// Show or hide one tab on the bar (Arrange tabs, Show or hide, the Notes page); then() runs after a change.
// Fewer than two tabs: a toast. More than seven: asks which tab it replaces (taking that tab's place).
export function setTabOnBar(id, show, then = () => {}) {
  const all = barTabs();
  const { sorted, shown, hidden } = arrangeTabs(all.map(([k]) => k), display());
  const next = new Set(hidden); if (show) next.delete(id); else next.add(id);
  const n = all.length - next.size;
  const label = k => BAR_TABS.find(([x]) => x === k)[1];
  if (n < 2) { toast('Keep at least two tabs on the bar'); then(); return; }
  if (n > MAX_BAR) {
    const m = modal(`The tab bar holds ${MAX_BAR} tabs`, [
      h('p', {}, `Put ${label(id)} in place of:`),
      h('div', { class: 'bar' }, shown.filter(k => k !== 'more').map(k => h('button', { onclick: () => {
        const order = sorted.filter(x => x !== id); order.splice(order.indexOf(k), 0, id);
        applyDisplay(setDisplay({ tabHidden: [...next, k], tabOrder: order })); hooks.paintTabs?.(); m.close();
      } }, label(k)))),
      h('div', { class: 'bar' }, h('span', { class: 'grow' }), h('button', { onclick: () => m.close() }, 'Cancel')),
    ], { onclose: () => then() });
    return;
  }
  // an empty list (not null) means "everything on the bar", so Notes doesn't drop back into More
  applyDisplay(setDisplay({ tabHidden: [...next], tabOrder: sorted })); hooks.paintTabs?.(); then();
}
export const borderLevel = d => (Number.isInteger(d.borders) && d.borders >= 0 && d.borders < BORDERS.length - 1 ? d.borders : BORDERS.length - 1);
// Display preview (owner): a made-up case row, chips and buttons drawn with the app's own classes, so colour,
// borders, fonts, text size and compact show at once; it stays in view while the page scrolls
export const displayPreview = () => h('div', { class: 'display-preview', 'aria-hidden': 'true' },
  h('div', { class: 'dp-label' }, 'Preview only: not a real case'),
  h('ul', { class: 'cases' }, h('li', { tabindex: '-1' },
    h('span', { class: 'd' }, h('span', { class: 'wd' }, 'Sun'), ' 11th Oct'),
    h('span', { class: 't' }, h('b', {}, 'AB'), ' 34F LSCS under spinal'),
    h('span', { class: 'c' }, h('span', { class: 'c-tags' }, h('span', { class: 'lb-tags' }, ['LSCS', 'CNB(Obs)', 'Spinal'].map(t => h('span', { class: 'lb-tag' }, t)))),
      h('span', { class: 'acts' }, document.documentElement.classList.contains('row-copy') ? h('button', { class: 'small row-btn', tabindex: '-1', type: 'button' }, rowIcon('copy'), h('span', { class: 'lbl' }, 'Copy')) : null,
        h('button', { class: 'small row-btn has-refl', tabindex: '-1', type: 'button' }, rowIcon('done'), h('span', { class: 'lbl' }, 'Reflect')))))),
  h('div', { class: 'chips' }, h('span', { class: 'chip on' }, 'Spinal'), h('span', { class: 'chip' }, 'LSCS'), h('span', { class: 'chip' }, 'GA'),
    h('span', { class: 'grow' }), h('button', { class: 'small primary', tabindex: '-1', type: 'button' }, 'Save')));
// "Reset this page" (owner): puts only this page's choices back to their defaults, after asking
export const resetLink = (what, run) => h('p', { class: 'reset-row' }, h('button', { class: 'small linkish', type: 'button', onclick: async () => {
  if (!await confirmBox('Reset this page', `Put ${what} back to the defaults?`, 'Reset')) return;
  await run(); hooks.render(); toast('Back to the defaults');
} }, 'Reset this page'));

// a link to a settings page's own Advanced page, like a row of the More list (never hidden: profiles hide interface
// items, not settings)
export const advancedLink = (id, label, desc) => h('section', { class: 'card more-list more-settings' },
  h('ul', {}, h('li', {}, h('a', { href: '#' + id, 'data-go': id },
    h('span', { class: 'mt' }, h('b', {}, label), h('small', {}, desc)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')))));
export const cleanTitle = s => String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
export const COLOURFUL = [['off', 'Off (default)'], ['tabs', 'One colour per tab: the tabs and headings'], ['all', 'One colour per tab: everything in the tab']];
// Custom CSS (custom-css.js): only CSS that passes checkCss, never on the Display pages (basic and advanced), and off with ?nocss
export function applyCustomCss(d = display()) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('user-css');
  const res = checkCss(d.customCss);
  const on = !!d.customCssOn && res.ok && !!res.css && !/[?&]nocss\b/.test(location.search) && S.tab !== 'display' && S.tab !== 'displayadv';
  if (!on) { if (el) el.textContent = ''; return; }
  if (!el) { el = document.createElement('style'); el.id = 'user-css'; document.head.append(el); }
  if (el.textContent !== res.css) el.textContent = res.css;
}
export const TAB_BARS = [['auto', 'Bottom on phones, top on bigger screens (default)'], ['top', 'Always at the top'], ['bottom', 'Always at the bottom']];

// Settings rows (owner, 13 Oct 2026): a switch for on or off, a ✓ list for two to five choices, help in one line
// with ⓘ for the rest. The pages carry class set-page (style.css, "settings rows").
const help = (line, ...more) => {
  if (!more.length) return h('p', { class: 'hint help' }, line);
  const [b, p] = info(...more);
  return [h('p', { class: 'hint help' }, line, '\u00a0', b), p];
};
// label: the words, or [words, a shorter name for screen readers and tests]
const toggle = (label, on, set, line, ...more) => {
  const [text, name] = Array.isArray(label) ? label : [label, label];
  return [h('label', { class: 'check' }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': name, checked: !!on, onchange: e => set(e.target.checked) }), text),
    line ? help(line, ...more) : null];
};
function pick(label, opts, cur, set, line, ...more) {
  const name = 'pick-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return h('fieldset', { class: 'pick' }, h('legend', {}, label),
    h('div', { class: 'pick-list' }, opts.map(([v, l]) => h('label', { class: 'pick-opt' },
      h('input', { type: 'radio', name, value: String(v), checked: String(cur) === String(v), onchange: () => set(v) }),
      h('span', { class: 'pick-l' }, l), h('span', { class: 'tick', 'aria-hidden': 'true' }, '✓')))),
    line ? help(line, ...more) : null);
}
// a display key as a ✓ list; the default is saved as nothing
const lookPick = (k, label, opts, dflt, line, ...more) =>
  pick(label, opts, display()[k] ?? dflt, v => applyDisplay(setDisplay({ [k]: v === dflt ? null : v })), line, ...more);
const DEVICE_NOTE = () => h('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Everything on this page is saved on this device only, so a phone and a computer can each look the way that suits them.');
const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['oled', 'OLED (pure black)'], ['auto', 'Auto (match the phone)']];
const slider = (label, names, level, dflt, onLevel) => {
  const note = h('span', { class: 'hint', style: 'margin:0' }, names[level]);
  return h('div', { class: 'field', style: 'margin-top:10px' }, h('label', { class: 'field', style: 'margin:0' }, label,
    h('input', { type: 'range', min: '0', max: String(names.length - 1), step: '1', value: String(level), 'aria-label': label, 'aria-valuetext': names[level],
      oninput: e => { const n = Number(e.target.value); e.target.setAttribute('aria-valuetext', names[n]); note.textContent = names[n]; onLevel(n === dflt ? null : n); } })), note);
};

export function renderDisplay() {
  const st = display();
  return h('div', { class: 'set-page' },
    displayPreview(),
    h('section', { class: 'card' },
      h('h2', {}, 'Display'),
      pick('Light or dark', THEMES, cachedTheme(), v => applyTheme(v)),
      h('div', { class: 'field', style: 'margin-top:10px' }, 'Colour', accentPicker()),
      help('Tap to pick any colour. Light and dark versions stay easy to read.'),
      pick('Colourful', COLOURFUL, st.colourful === true ? 'tabs' : st.colourful || 'off', v => applyDisplay(setDisplay({ colourful: v === 'off' ? null : v })),
        'A colour for each tab.', 'With the default colour, the tabs follow the NUH stripe at the top: Case orange, Logbook red, Reflections cyan, Analytics navy. With another colour: orange, teal, red, blue, purple. “Everything” also colours the buttons, chips and links on that tab’s pages, in shades that stay easy to read.'),
      toggle('Compact mode', st.compact, v => { applyCompact(v); setDisplay({ compact: v }); }, 'Smaller chips, rows and spacing, so more tags fit.'),
      // Flat first: no lines and no page cards (its own key, so the saved border levels keep their meaning)
      slider('Borders', ['Flat (no lines, no cards)', ...BORDERS], st.flat ? 0 : borderLevel(st) + 1, BORDERS.length,
        n => applyDisplay(setDisplay(n === 0 ? { flat: true, borders: 0 } : { flat: null, borders: n === null ? null : n - 1 }))),
      slider('Corners', ROUNDS.map(([n]) => n), roundLevel(st), 2, n => applyDisplay(setDisplay({ round: n }))),
      toggle('Soft shadows instead of lines around cards (default)', st.shadows !== false, v => applyDisplay(setDisplay({ shadows: v ? null : false }))),
      // the tab the app opens on (a link or shortcut to a tab still opens that tab)
      pick('Open the app on', START_TABS, st.startTab || 'log', v => { setDisplay({ startTab: v }); toast('Saved'); }),
      DEVICE_NOTE()),
    resetLink('light or dark, colour, Colourful, compact, borders, corners, shadows and the start tab on this device', () => {
      applyTheme('light'); applyDisplay(setDisplay({ accent: null, colourful: null, compact: null, borders: null, flat: null, round: null, shadows: null, startTab: null }));
    }),
    advancedLink('displayadv', 'Advanced display settings', 'The header and tab bar, Logbook rows, fonts and spacing, the Case tab layout, custom CSS'));
}
// Settings → Display → Advanced display settings (#displayadv), under headings (owner, 13 Oct 2026): the header and
// tab bar, Logbook rows, text, the Case tab layout, then custom CSS
export function renderDisplayAdvanced() {
  const st = display();
  const set = (k, off = null) => v => applyDisplay(setDisplay({ [k]: v || off }));
  return h('div', { class: 'set-page' },
    displayPreview(),
    h('section', { class: 'card' },
      h('h2', {}, 'Advanced display'),
      h('h3', {}, 'Look'),
      lookPick('btnStyle', 'Button style', BUTTON_STYLES, 'outlined', 'The buttons that aren’t the main one on a screen.'),
      toggle('Icons instead of words on common buttons', st.iconBtns, set('iconBtns'), 'Share, Copy, Notes and Filter.', 'Each still says its name to screen readers, and on a computer when you point at it.'),
      toggle('Plain calendar', st.calPlain, set('calPlain'), 'Numbers with the count under them, no tiles.', 'Today in a coloured circle, the day you picked in a dark one.'),
      h('h3', {}, 'Header and tab bar'),
      h('label', { class: 'field' }, 'Name in the header',
        h('input', { type: 'text', value: st.appTitle || '', placeholder: APP_TITLE, maxlength: '40', 'aria-label': 'Name in the header',
          onchange: e => { const t = cleanTitle(e.target.value); e.target.value = t; applyDisplay(setDisplay({ appTitle: t && t !== APP_TITLE ? t : null })); } })),
      help('Also the name in the browser tab. Empty: APMES Logbook.'),
      toggle('Page titles in the header', st.pageTitles, set('pageTitles'), '“Logbook”, “Reflections”… instead of the app’s name.'),
      toggle('Hide the header (the app name bar)', st.hideHeader, v => applyDisplay(setDisplay({ hideHeader: v })),
        'It comes back when something needs you.', 'It comes back by itself when something isn’t synced yet, when there’s no signal, and in the demo.'),
      lookPick('tabBar', 'Tab bar', TAB_BARS, 'auto'),
      toggle('Icons only in the tab bar', st.tabIcons, v => applyDisplay(setDisplay({ tabIcons: v }))),
      tabArranger(),
      h('h3', {}, 'Logbook rows'),
      toggle('Fewer buttons on Logbook rows (a ⋯ menu)', st.rowMenu, set('rowMenu'), 'Copy and Reflect move into one ⋯ button.', 'A ✓ still shows cases with a reflection.'),
      toggle('Shorter Logbook rows', st.rowShort, set('rowShort'), 'One line for the case, one grey line of tags, no buttons.', 'The initials and case in bold, the short date at the right. Tap a row to open it; press and hold (Accessibility) for Copy and Reflect.'),
      toggle('Copy button on each Logbook row', st.rowCopy, set('rowCopy'), 'Off unless you switch it on.', 'The ⋯ menu, if you use it, still copies one case.'),
      toggle('Copy button for each day', st.dayCopy, set('dayCopy'), 'Beside Share when you pick a day in the calendar.', 'Off unless you switch it on. Share already sends the whole day (or copies it, where sharing isn’t possible).'),
      h('h3', {}, 'Text'),
      fontPicker('ui'),
      fontPicker('log'),
      lookPick('lineHeight', 'Line spacing', LINE_HEIGHTS, '1'),
      lookPick('lineWidth', 'Page width', LINE_WIDTHS, 'normal', 'How wide the app gets on a computer or tablet.', 'Was “Line width”. Phones always use the full screen. The Case tab keeps its two panes.'),
      h('h3', {}, 'Case tab layout'),
      toggle('Case tab upside down (phones)', st.caseInverted, v => applyDisplay(setDisplay({ caseInverted: v })),
        'The case box at the bottom, by the keyboard, like a chat app.', 'Save sits beside it and the suggestions just above it; scroll up for all the tags.'),
      toggle('Pin the case box at the top of the Case tab', st.pinBox, set('pinBox')),
      toggle('Pin the search box at the top of the Logbook and Reflections', st.pinSearch, set('pinSearch'), 'They stay in view while the list scrolls under them.'),
      DEVICE_NOTE()),
    customCssCard(),
    resetLink('the name in the header, fonts, line spacing and width, the tab bar (order and hidden tabs) and header options, the Logbook row buttons, upside down, pinning and custom CSS (switched off; your CSS is kept), and the button style, icons, plain calendar, page titles and shorter rows on this device', () =>
      applyDisplay(setDisplay({ appTitle: null, fontUi: null, fontUiName: null, fontLog: null, fontLogName: null, lineWidth: null, lineHeight: null, tabBar: null, tabIcons: null, hideHeader: null, caseInverted: null, pinBox: null, pinSearch: null, customCssOn: null, tabOrder: null, tabHidden: null, rowMenu: null, rowCopy: null, dayCopy: null, btnStyle: null, iconBtns: null, calPlain: null, pageTitles: null, rowShort: null }))));
}
// Settings → Accessibility (#access; owner, 13 Oct 2026): size, contrast, motion and the gestures, gathered from
// Display and Advanced display. All this device's.
export const IPHONE_APP = () => (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);
export function renderAccessibility() {
  const st = display();
  return h('div', { class: 'set-page' },
    displayPreview(),
    h('section', { class: 'card' },
      h('h2', {}, 'Accessibility'),
      h('h3', {}, 'Size'),
      h('label', { class: 'field', style: 'margin-top:4px' }, 'Interface zoom',
        h('select', { 'aria-label': 'Interface zoom', onchange: e => { applyZoom(e.target.value); setDisplay({ zoom: e.target.value }); } },
          ZOOMS.map(v => h('option', { value: v, selected: String(st.zoom || '1') === v }, `${Math.round(v * 100)}%${v === '1' ? ' (default)' : ''}`)))),
      help('Everything bigger or smaller, the header and tabs too.', 'On a computer: Ctrl + and Ctrl − (⌘ on a Mac), Ctrl 0 for 100%.'),
      pick('Text size', TEXT_SIZES, String(st.textSize || '1'), v => { applyTextSize(v); setDisplay({ textSize: v }); }, 'Only the words: buttons and spacing stay as they are.'),
      toggle('Bigger tap targets on the Case tab', st.bigTaps, v => applyDisplay(setDisplay({ bigTaps: v || null })), 'Larger chips, tag rows, tick boxes and Save buttons.'),
      h('h3', {}, 'Contrast and motion'),
      lookPick('contrast', 'Contrast', CONTRASTS, 'auto', 'Higher: darker text and stronger lines (lighter in dark mode).'),
      lookPick('motion', 'Motion', MOTIONS, 'auto', 'Reduce: pages, folds and swipes switch at once instead of sliding.'),
      h('h3', {}, 'Gestures'),
      toggle('Swipe left or right to change tab', st.swipeTabs !== false, v => applyDisplay(setDisplay({ swipeTabs: v ? null : false })),
        'The page follows your finger to the next tab.', 'On unless you switch it off. Also from pages under a tab. Not while typing, from the screen’s edges, or on tables and lists that scroll sideways.'),
      toggle('Swipe from the left edge to go back (iPhone app)', st.edgeBack !== false, v => applyDisplay(setDisplay({ edgeBack: v ? null : false })),
        IPHONE_APP() ? 'From a page under a tab, drag from the left edge.' : 'Only in the app added to an iPhone or iPad home screen.',
        IPHONE_APP() ? 'On unless you switch it off.' : 'Android phones use their own Back gesture from the edges.'),
      toggle('Press and hold a Logbook row for its menu', st.rowHold, v => applyDisplay(setDisplay({ rowHold: v || null })), 'Copy, Reflect and Edit, without the row’s buttons.', 'Hold for half a second without moving. A right-click does the same on a computer.'),
      h('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Everything on this page is saved on this device only.')),
    resetLink('zoom, text size, bigger tap targets, swiping, contrast, motion, edge swipe and press and hold on this device', () =>
      applyDisplay(setDisplay({ zoom: null, textSize: null, bigTaps: null, swipeTabs: null, contrast: null, motion: null, edgeBack: null, rowHold: null }))));
}
// Advanced display → the tab bar's order and hidden tabs (arrangeTabs): ↑ ↓ to move, a switch to show or hide
function tabArranger() {
  const wrap = h('div', { class: 'tab-arranger field', style: 'margin-top:10px' });
  const paint = () => {
    const { sorted: order, hidden } = arrangeTabs(barTabs().map(([id]) => id), display());
    const move = (id, by) => { const o = [...order], i = o.indexOf(id), j = i + by; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; applyDisplay(setDisplay({ tabOrder: o })); hooks.paintTabs?.(); paint(); };
    const hideSet = new Set(hidden);
    const toggle = (id, show) => setTabOnBar(id, show, paint);
    fill(wrap, h('span', {}, 'Tabs on the bar'),
      h('ul', { class: 'tab-order' }, order.map((id, i) => h('li', {},
        h('label', { class: 'check', style: 'flex:1;min-height:40px' }, h('input', { type: 'checkbox', checked: !hideSet.has(id), disabled: id === 'more', 'aria-label': 'Show ' + BAR_TABS.find(([k]) => k === id)[1], onchange: e => toggle(id, e.target.checked) }), BAR_TABS.find(([k]) => k === id)[1]),
        h('button', { class: 'small icon-btn', type: 'button', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(id, -1) }, '↑'),
        h('button', { class: 'small icon-btn', type: 'button', disabled: i === order.length - 1, 'aria-label': 'Move down', onclick: () => move(id, 1) }, '↓')))),
      h('p', { class: 'hint help', style: 'margin:0' }, `Up to ${MAX_BAR} tabs fit on the bar. Hidden tabs are listed at the top of More. More always stays (Settings live there).`));
  };
  paint();
  return wrap;
}

// Interface font and logging font (fonts.js): a list, a box for a font installed on this device, or a font file
// kept on this device; a sample line shows the result (Il1 O0: easy to mix up in initials)
function fontPicker(slot) {
  const k = slot === 'ui' ? 'fontUi' : 'fontLog', nk = k + 'Name';
  const cur = () => (slot === 'ui' ? display().fontUi || 'default' : logChoice(display()) || 'same');
  const sample = h('div', { class: 'font-sample' }, 'AB 34F LSCS under spinal · Il1 O0');
  const nameIn = h('input', { type: 'text', value: display()[nk] || '', placeholder: 'e.g. Calibri', 'aria-label': slot === 'ui' ? 'Interface font name' : 'Logging font name', maxlength: '60',
    onchange: e => { const n = cleanFontName(e.target.value); e.target.value = n; applyDisplay(setDisplay({ [nk]: n })); paint(); } });
  const nameNote = h('span', { class: 'hint' });
  const fileNote = h('span', { class: 'hint' });
  const fileBtn = fileButton('Choose a font file…', '.woff2,.woff,.ttf,.otf', async file => {
    try { const n = await saveUserFont(slot, file); applyDisplay(setDisplay({ [k]: 'file' })); fileNote.textContent = n; toast('Font added on this device'); }
    catch (err) { toast(err.message); }
    paint();
  }, 'btn small');
  const removeBtn = h('button', { class: 'small linkish', onclick: async () => { await deleteUserFont(slot).catch(() => {}); applyDisplay(setDisplay({ [k]: slot === 'ui' ? 'default' : null })); hooks.render(); } }, 'Remove');
  const nameRow = h('label', { class: 'field', style: 'margin:4px 0 0' }, 'Font name', nameIn, nameNote);
  const fileRow = h('div', { style: 'margin:4px 0 0' }, h('div', { class: 'bar', style: 'margin:0' }, fileBtn, removeBtn), fileNote,
    h('p', { class: 'hint', style: 'margin:2px 0 0' }, 'Kept on this device only (never uploaded or synced). Use a font you are allowed to use.'));
  const sel = h('select', { 'aria-label': slot === 'ui' ? 'Interface font' : 'Logging font', onchange: e => {
    const v = e.target.value;
    applyDisplay(setDisplay({ [k]: slot === 'log' && v === 'same' ? null : v })); paint();
  } },
    slot === 'log' ? h('option', { value: 'same', selected: cur() === 'same' }, 'Same as the interface') : null,
    FONTS.map(([v, l]) => h('option', { value: v, selected: cur() === v }, l)));
  const paint = () => {
    const c = cur();
    nameRow.hidden = c !== 'named'; fileRow.hidden = c !== 'file';
    sample.style.fontFamily = c === 'same' ? 'var(--font-ui)' : fontStack(c, display()[nk], slot);
    if (c === 'named') nameNote.textContent = !display()[nk] ? 'Type the name exactly as your computer shows it.' : fontAvailable(display()[nk]) ? 'Found on this device.' : 'Not found on this device (or this browser doesn’t allow it): the default font is used.';
    if (c === 'file') getUserFont(slot).then(f => { fileNote.textContent = f ? 'Using ' + f.name : 'No file chosen yet.'; removeBtn.hidden = !f; });
  };
  paint();
  return h('div', { class: 'field', style: 'margin-top:10px' },
    h('label', { class: 'field', style: 'margin:0' }, slot === 'ui' ? 'Interface font' : 'Logging font', sel),
    slot === 'log' ? h('span', { class: 'hint help' }, 'The case box, case text in the Logbook and the reflection editor.') : null,
    nameRow, fileRow, sample);
}

// Custom CSS (advanced): checked by checkCss before it is kept; the switch turns it on and off
function customCssCard() {
  const d = display();
  const box = h('textarea', { rows: '6', spellcheck: 'false', 'aria-label': 'Custom CSS', placeholder: '.chip { border-radius: 6px; }', style: 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:calc(14px * var(--fs, 1));width:100%' }, d.customCss || '');
  const note = h('p', { class: 'hint', 'aria-live': 'polite', style: 'margin:6px 0 0' });
  const sw = h('input', { type: 'checkbox', role: 'switch', checked: !!d.customCssOn, onchange: e => { applyDisplay(setDisplay({ customCssOn: e.target.checked })); toast(e.target.checked ? 'Custom CSS on (not on this page)' : 'Custom CSS off'); } });
  const save = () => {
    const res = checkCss(box.value);
    if (!res.ok) { note.textContent = 'Not saved: ' + res.problems.join(', ') + '.'; note.style.color = 'var(--err)'; return; }
    applyDisplay(setDisplay({ customCss: res.css || null, customCssOn: !!res.css }));
    sw.checked = !!res.css; note.style.color = ''; note.textContent = res.css ? 'Saved and on. It shows on every page except this one.' : 'Cleared.';
  };
  return h('section', { class: 'card' },
    h('details', { open: !!d.customCss },
      h('summary', {}, h('strong', {}, 'Custom CSS (advanced)')),
      h('p', { class: 'tip', style: 'margin:8px 0' }, 'Only paste CSS you understand, never from someone you don’t trust. It can change what you see and hide things, like the privacy notes. Anything that loads from another address is refused, so it can’t send what’s on screen anywhere.'),
      box,
      h('div', { class: 'bar', style: 'margin:8px 0 0' }, h('button', { class: 'primary small', onclick: save }, 'Save'),
        h('label', { class: 'check', style: 'margin:0' }, sw, 'On'),
        h('span', { class: 'grow' }),
        h('button', { class: 'small linkish', onclick: () => { box.value = ''; save(); } }, 'Clear')),
      note,
      h('p', { class: 'hint help', style: 'margin:6px 0 0' }, 'It never applies on this page, so you can always come back and fix it. If something goes wrong elsewhere, open the app with ?nocss at the end of the address. Saved on this device only; app updates can change the class names it relies on.')));
}

// any colour, straight from the device's own colour picker (owner, 13 Oct 2026: no preset swatches); Default goes
// back to the app's navy
function accentPicker() {
  const cur = () => cleanAccent(display().accent) || DEFAULT_ACCENT;
  const wrap = h('div', { class: 'accent-pick' });
  const pick = c => { applyDisplay(setDisplay({ accent: c === DEFAULT_ACCENT ? null : c })); paint(); };   // (also redoes the Colourful shades)
  const paint = () => {
    const c = cur();
    fill(wrap,
      h('input', { type: 'color', class: 'accent-input', value: c, 'aria-label': 'Colour', oninput: e => applyAccent(e.target.value), onchange: e => pick(e.target.value) }),
      c === DEFAULT_ACCENT ? null : h('button', { type: 'button', class: 'small linkish', onclick: () => pick(DEFAULT_ACCENT) }, 'Default colour'));
  };
  paint();
  return wrap;
}
export const START_TABS = [['log', 'Case'], ['logbook', 'Logbook'], ['reflect', 'Reflections'], ['progress', 'Analytics']];

// ---------- Markdown (Logbook: Copy on a case or a day, Share day; the notes export) ----------

// a made-up day to preview with (never real cases: the page may be shown to others)
const SAMPLE = [{ id: 's1', date: '2026-10-10', initials: 'AB', details: '34F LSCS under spinal', cats: ['16', '17', '28'], createdAt: 1 }, { id: 's2', date: '2026-10-10', initials: 'CD', details: '72M TKR, adductor canal block', cats: ['18', '26'], createdAt: 2 }];
const SAMPLE_REFL = { id: 'sr', headingId: 'lscs', initials: 'AB', date: '2026-10-10', diagnosis: 'LSCS under spinal', title: 'High spinal block', status: 'complete', summary: 'Made-up example: a high block after the spinal.', points: [{ heading: 'Recognising it early', text: 'Hand weakness and bradycardia came first.' }], figures: [], references: ['Made-up reference. 2026.'] };
// Settings → Markdown: one format for Copy / Share (Logbook tab) and the notes export (More → Export / Import),
// saved as settings.markdown (only what differs from the default; markdown.js). Previews use your own latest
// case, day and reflection, so you see what you'll get.
export function renderMarkdownSettings() {
  let m = cleanMarkdown(settings().markdown, settings().shareFormat);
  const mono = 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:calc(15px * var(--fs, 1))';
  const area = (k, label, rows) => h('textarea', { rows, 'aria-label': label, spellcheck: 'false', style: mono, oninput: e => { m[k] = e.target.value; paint(); } }, m[k]);
  const pick = (k, label, opts) => h('label', { class: 'field', style: 'margin-top:8px' }, label,
    h('select', { 'aria-label': label, onchange: e => { m[k] = e.target.value; paint(); } }, opts.map(([v, t]) => h('option', { value: v, selected: m[k] === v }, t))));
  const lbl = (t, el, hint) => h('label', { class: 'field', style: 'margin-top:8px' }, t, el, hint ? h('span', { class: 'hint help' }, hint) : null);
  // previews can scroll, so each is focusable and named for the keyboard
  const pre = name => h('pre', { class: 'fmt-preview', tabindex: '0', 'aria-label': name });
  const dayOut = pre('Preview of a day'), oneOut = pre('Preview of one case'), reflOut = h('pre', { class: 'fmt-preview', style: 'max-height:24em;overflow:auto', tabindex: '0', 'aria-label': 'Preview of a reflection note' }), pathOut = h('div', { class: 'hint', style: 'margin:8px 0 2px' });
  // your latest day and reflection, else made-up ones
  const latest = [...(S.cases || [])].filter(c => c.date).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))[0];
  const dayList = latest ? S.cases.filter(c => c.date === latest.date).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : SAMPLE;
  const refl = [...(S.reflections || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || SAMPLE_REFL;
  const ctx = { catName, catShort };
  const paint = () => {
    const f = cleanMarkdown(m);
    dayOut.textContent = mdDay(dayList[0].date, dayList, f, ctx);
    oneOut.textContent = mdCase(dayList[dayList.length - 1], f, ctx);
    const path = reflectionPath(refl, f);
    pathOut.textContent = 'File: ' + path;
    reflOut.textContent = reflectionNote(refl, f, { path, images: Object.fromEntries((refl.figures || []).map(x => [x.id, `images/${x.id}.jpg`])) });
  };
  const fmBox = k => h('label', { class: 'check', style: 'margin:0 12px 0 0;display:inline-flex' }, h('input', { type: 'checkbox', checked: m.fmFields.includes(k), onchange: e => { m.fmFields = e.target.checked ? [...m.fmFields, k] : m.fmFields.filter(x => x !== k); paint(); } }), k);
  const save = async () => {
    let v;
    try { v = storedMarkdown(m); } catch (err) { return toast(err.message); }
    await patchLogbook({ settings: { markdown: v, shareFormat: null } }); toast('Saved');
  };
  const reset = async () => {
    if (!(await confirmBox('Reset the Markdown format', 'Go back to the default format for Copy, Share and the notes export?', 'Reset'))) return;
    await patchLogbook({ settings: { markdown: null, shareFormat: null } }); hooks.render();
  };
  const fillins = list => h('p', { class: 'hint help', style: 'margin:4px 0 0' }, 'Fill-ins: ', ...list.flatMap((k, i) => [i ? ' ' : '', h('code', {}, `{{${k}}}`)]), '. A line whose fill-ins are all empty is left out.');
  const fmRow = h('div', { hidden: !m.frontMatter, style: 'margin:0 0 6px' }, ...FM_FIELDS.map(fmBox));
  paint();
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Markdown'),
      h('p', { class: 'hint help', style: 'margin:0' }, 'One format for Copy and Share on the Logbook tab and for the Markdown export (More → Export / Import). The default copies the date, initials and case, never the tags.'),
      h('h3', { style: 'margin:14px 0 0' }, 'Copy and share'),
      lbl('Day heading', area('dayHead', 'Day heading', 1), 'For example ## {{date}} or ## [[{{date}}]].'),
      lbl('Each case in a day', area('dayCase', 'Each case in a day', 3), 'A blank line goes between cases when each takes more than one line.'),
      fillins(CASE_FILLINS),
      lbl('A day’s notes (More → Notes)', area('dayNotes', 'A day’s notes', 2), 'Follows the cases when the day has notes. {{notes}} is each note (### title, then its text). Or put {{notes}} in the day heading to place them there.'),
      h('div', { class: 'hint', style: 'margin:8px 0 2px' }, latest ? 'Preview (your latest day)' : 'Preview'), dayOut,
      lbl('One case', area('oneCase', 'One case', 3)),
      h('div', { class: 'hint', style: 'margin:8px 0 2px' }, 'Preview'), oneOut,
      h('h3', { style: 'margin:14px 0 0' }, 'Dates, tags and links'),
      pick('dateFormat', 'Dates ({{date}})', [['iso', '2026-10-10'], ['long', '10 Oct 2026'], ['dmy', '10/10/2026']]),
      pick('cats', 'Tags ({{categories}})', [['names', 'Names (Lower Segment Caesarean Section)'], ['codes', 'Codes (16)'], ['tags', '#tags (#LSCS)']]),
      pick('links', 'Links between notes', [['wiki', 'Wiki links [[note]] (Obsidian)'], ['md', 'Markdown links [note](note.md)']])),
    h('section', { class: 'card' },
      h('h2', {}, 'Markdown export'),
      h('p', { class: 'hint help', style: 'margin:0' }, 'How the Markdown export lays out the zip: case notes (with each day’s notes), one note per reflection, Notes.md for undated notes, Progress.md and the figures in images/.'),
      pick('caseNotes', 'Case notes', [['month', 'One note per month'], ['day', 'One note per day']]),
      pick('folders', 'Reflection folders', [['month', 'By month (Reflections/2026-10/)'], ['heading', 'By heading'], ['flat', 'All in Reflections/']]),
      lbl('Reflection file name', h('input', { type: 'text', value: m.fileName, 'aria-label': 'Reflection file name', spellcheck: 'false', style: mono, oninput: e => { m.fileName = e.target.value; paint(); } }), 'Fill-ins: {{date}} {{initials}} {{heading}} {{title}} {{diagnosis}}. .md is added.'),
      h('label', { class: 'check', style: 'margin-top:10px' }, h('input', { type: 'checkbox', checked: m.frontMatter, onchange: e => { m.frontMatter = e.target.checked; fmRow.hidden = !m.frontMatter; paint(); } }), 'Front matter (properties at the top of each note)'),
      fmRow,
      h('h3', { style: 'margin:14px 0 0' }, 'Reflection notes'),
      lbl('Title', area('reflTitle', 'Reflection title', 1)),
      lbl('Summary', area('reflSummary', 'Reflection summary', 3)),
      lbl('Each learning point', area('reflPoint', 'Each learning point', 3), '{{point}} is its heading, {{text}} what you wrote, {{n}} its number.'),
      lbl('Each figure', area('reflFigure', 'Each figure', 2), '{{image}} shows the picture, {{caption}} its caption.'),
      lbl('References', area('reflRefs', 'References', 3), '{{references}} is the numbered list.'),
      fillins(REFL_FILLINS),
      pathOut, reflOut,
      h('div', { class: 'bar', style: 'margin:12px 0 0' },
        h('button', { class: 'primary', onclick: save }, 'Save'),
        h('span', { class: 'grow' }),
        h('button', { class: 'small linkish', onclick: reset }, 'Reset to default'))));
}

const ENTER_MODES = [['newline', 'New line (default)'], ['double', 'Press Enter twice to save'], ['single', 'Enter saves (Shift+Enter for a new line)']];
export function renderLogging() {
  const st = settings();
  const preview = h('div', { class: 'logging-preview', 'aria-live': 'polite' });
  const paintPreview = () => {
    const current = settings(), separate = display().firstField === 'initials';
    fill(preview, h('b', {}, 'Example of your logging style'),
      h('p', {}, (separate ? 'Initials in their own box. ' : 'Initials at the start of the case box. ') + (current.detectAgeSex !== false ? 'AB 6m lap chole → AB · ' + humanAge('6m') + ' · lap chole' : 'AB lap chole → initials and case details; age and gender detection off.')),
      h('p', {}, 'Enter: ' + ({ newline: 'new line', single: 'save', double: 'save on an empty line (double Enter)' }[current.enterMode || (current.enterSaves ? 'single' : 'newline')]) + '. After Save: ' + (AFTER_SAVE.find(([v]) => v === (current.afterSave || 'next'))?.[1] || 'Next case') + '.'));
  };
  paintPreview();
  const save = (patch, note) => patchLogbook({ settings: patch }).then(() => { if (note) toast(note); paintPreview(); });
  return h('div', { class: 'set-page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Logging'),
      h('h3', {}, 'Recognise details'), h('p', { class: 'hint' }, 'Account settings · on by default; follows you between devices.'),
      toggle('Suggest tags as I type', st.suggestions !== false, v => save({ suggestions: v })),
      toggle('Autodetect age and gender', st.detectAgeSex !== false, v => save({ detectAgeSex: v }),
        'Optional for APMES.', 'Turning this off stops age-based Paediatrics and Geriatric suggestions. Choose those tags yourself when needed; explicit words can still suggest them.'),
      h('h3', {}, 'Start a case'), h('p', { class: 'hint' }, 'Device setting · other devices keep their own style.'),
      toggle('Show common tags first', display().compactTags, v => { setDisplay({ compactTags: v }); paintPreview(); },
        'A shortlist from your recent cases.', 'Off by default. All tags stay searchable and can be expanded.'),
      h('h3', {}, 'Save and continue'), h('p', { class: 'hint' }, 'Account settings · defaults: Enter adds a line, Today, next case.'),
      pick('Enter key in the case box', ENTER_MODES, st.enterMode || (st.enterSaves ? 'single' : 'newline'), v => save({ enterMode: v, enterSaves: null }, 'Saved'),
        'Ctrl+Enter (Cmd+Enter on a Mac) always saves.', 'Twice: Enter on an empty line saves, so a case can still take several lines.'),
      pick('Date for a new case', [['today', 'Today'], ['last', 'The date I used last']], st.defaultDate === 'last' ? 'last' : 'today', v => save({ defaultDate: v })),
      pick('After Save', AFTER_SAVE, st.afterSave || 'next', v => save({ afterSave: v === 'next' ? null : v }, 'Saved'),
        '“Save, keep date” keeps the date either way.', 'Keeping the tags helps with a run of the same kind of case.')),
    h('section', { class: 'card' }, preview, h('button', { onclick: async () => {
      try { await patchLogbook({ settings: { suggestions: true, detectAgeSex: true, enterMode: 'newline', enterSaves: null, defaultDate: 'today', afterSave: null } }); setDisplay({ compactTags: null }); hooks.render(); toast('Everyday logging defaults restored'); } catch (err) { toast(err.message); }
    } }, 'Reset these logging defaults'), h('p', { class: 'hint' }, 'Resets only the choices on this page. Advanced logging settings keep their current values.')),
    advancedLink('loggingadv', 'Advanced logging settings', 'The Case tab, the keyboard, search, dates and undo, tips'));
}

// Settings → Logging → Advanced logging settings (#loggingadv), under headings (owner, 13 Oct 2026): the Case tab,
// the keyboard in the case box, search, dates and undo, help
export function renderLoggingAdvanced() {
  const st = settings();
  const save = (patch, note = 'Saved') => patchLogbook({ settings: patch }).then(() => note && toast(note));
  return h('div', { class: 'set-page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Advanced logging'),
      h('h3', {}, 'Case tab'),
      help('Switch off what you don’t use. The case box, All tags and Save always stay.'),
      CASE_PARTS.map(([part, label]) => toggle(label, caseShown(part), v => setCaseShown(part, v, CASE_PARTS.map(([p]) => p)))),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Case box height on the Case tab',
        h('select', { onchange: e => save({ boxLines: Number(e.target.value) }) },
          Array.from({ length: 19 }, (_, i) => i + 2).map(n => h('option', { value: String(n), selected: n === (Math.min(20, Math.max(2, Number(st.boxLines) || 3))) }, `${n} lines${n === 3 ? ' (default)' : ''}`)))),
      // a separate Initials box above the case box, where the Case tab starts (device; was "First field for a new case")
      toggle(['Separate initials box (this device)', 'Separate initials box'], display().firstField === 'initials', v => { setDisplay({ firstField: v ? 'initials' : null }); toast('Saved on this device'); },
        'An Initials box above the case box.', 'The Case tab starts there and Enter moves on to the case. Off: type the initials at the start of the case, e.g. “AB 72M lap chole”.'),
      toggle('Open the keyboard when the Case tab opens (this device)', display().autoFocus !== false, v => applyDisplay(setDisplay({ autoFocus: v ? null : false }))),
      h('h3', {}, 'Keyboard in the case box (this device)'),
      toggle('Capital letter at the start', display().boxCaps !== false, v => applyDisplay(setDisplay({ boxCaps: v ? null : false }))),
      toggle('Autocorrect', display().boxCorrect === true, v => applyDisplay(setDisplay({ boxCorrect: v ? true : null })), 'Off by default, so initials and drug names stay as typed.'),
      toggle('Underline spelling mistakes', display().boxSpell !== false, v => applyDisplay(setDisplay({ boxSpell: v ? null : false })), 'Some keyboards ignore these.'),
      h('h3', {}, 'Search'),
      help('How the Logbook search works (everything, initials or procedure; fuzzy) is under Filter on the Logbook tab.'),
      // operators in the Logbook search box (search-ops.js); off by default, so plain searches never change meaning
      toggle('Advanced search', st.searchOps, v => save({ searchOps: v }, v ? 'Advanced search on' : 'Advanced search off'),
        'Operators in the Logbook and Reflections search boxes.',
        'A ? next to each box lists them; tap one to add it: ', h('ul', { class: 'ops-list' }, OPERATOR_HELP.map(([op, what]) => h('li', {}, h('code', {}, op), ' ', what))),
        'Reflections have their own: heading:, title:, diagnosis:, case: and initials:. Off by default because a few plain searches change meaning when it’s on: a word starting with “-” leaves cases out, and OR in capitals means either.'),
      h('h3', {}, 'Dates and Undo'),
      pick('First day of the week', [[1, 'Monday (default)'], [0, 'Sunday'], [6, 'Saturday']], weekStart(st.weekStart), n => save({ weekStart: n === 1 ? null : n }),
        'For the calendar, Analytics and “this week” in search.', 'Also “last week” in search, and last week’s summary.'),
      pick('Undo window', UNDO_SECS, Number(st.undoSecs) || 5, n => save({ undoSecs: n === 5 ? null : n }), 'How long Undo stays after you save, clear or delete.'),
      h('h3', {}, 'Help'),
      toggle('Show tips and help text', !st.hideTips, v => save({ hideTips: !v }, null),
        'Off for experienced users.', 'Hides the explanations around the app (like the one at the top of the tag editor), the privacy and photo reminders, and the tips for the tags you pick.'),
      toggle('Show last week’s summary on the Case tab (once a week)', st.weeklyDigest, v => save({ weeklyDigest: v }, null))),
    resetLink('everything on this page (the Case tab parts, box height, the initials box, keyboard, advanced search, the week, undo, tips and the weekly summary)', async () => {
      await patchLogbook({ settings: { boxLines: null, undoSecs: null, weekStart: null, weeklyDigest: null, hideTips: null, searchOps: null, caseHide: null } });
      applyDisplay(setDisplay({ autoFocus: null, firstField: null, boxCaps: null, boxCorrect: null, boxSpell: null }));
    }));
}

// Profiles (settings.mode, the whole account; PROFILES in ui-core.js): one place only, at the top of Profiles or hide
// items (owner, Oct 2026: two Basic mode switches confused). Picking one starts from its defaults (settings.basicOn
// cleared) and moves this device's tabs (Analytics, and Reflections for logbook only, into More; back for Advanced);
// other devices follow the profile's defaults. In a Basic profile every hidden item has a switch to bring it back.
export function profileCard() {
  const cur = profile();
  const pick = async mode => {
    const was = profile();
    if (mode === was) return;
    // saved even for Basic: with nothing saved, faculty, PDs and admins get Faculty / PCs
    await patchLogbook({ settings: { mode, basic: null, basicOn: null } });
    const d = display();
    if (Array.isArray(d.tabHidden)) {
      // this device's saved tabs: the old profile's hidden tabs back, the new one's away
      const hid = new Set(d.tabHidden);
      for (const id of PROFILE_OFF[was] || []) hid.delete(id);
      if (was === 'faculty') { hid.add('caselogs'); hid.add('admin'); }
      for (const id of PROFILE_OFF[mode] || []) hid.add(id);
      if (mode === 'faculty') { hid.delete('caselogs'); hid.delete('admin'); }
      applyDisplay(setDisplay({ tabHidden: [...hid] }));
    }
    hooks.paintTabs?.(); hooks.render(); toast(`Profile: ${PROFILES.find(([k]) => k === mode)[1]}`);
  };
  const items = BASIC_ITEMS.filter(([, , only]) => !only || only === cur);
  return h('section', { class: 'card profile-card' },
    h('h2', {}, 'Profile'),
    h('div', { role: 'radiogroup', 'aria-label': 'Profile' }, PROFILES.filter(([k]) => k !== 'faculty' || facultyRole() || k === cur).map(([k, label, hint]) => h('label', { class: 'check profile-opt' },
      h('input', { type: 'radio', name: 'profile', value: k, checked: k === cur, onchange: () => pick(k) }),
      h('span', {}, h('b', {}, label), h('small', { class: 'hint' }, hint))))),
    basicMode() ? h('div', { class: 'profile-items' },
      h('h3', {}, 'Hidden in this profile'),
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'Turn any back on. The Case tab parts and the tabs are below (Case tab, Header and tabs).'),
      items.map(([k, label]) => sw(label, !basicHides(k), v => setBasicOn(k, v).then(() => hooks.render())))) : null,
    h('p', { class: 'hint help', style: 'margin:6px 0 0' }, 'For your whole account. Profiles only show or hide parts of the screen: your settings, cases and reflections never change. Picking a profile starts from its defaults.'));
}

// Settings → Profiles or hide items: the profile, then every switch that hides part of the app, grouped by area, each group with its own
// reset. The same settings as on their own pages (Logging, Display, Reflections), gathered in one place.
const groupReset = (what, run) => h('p', { class: 'reset-row' }, h('button', { class: 'small linkish', type: 'button', onclick: async () => {
  if (!await confirmBox('Reset this group', `Show ${what} again?`, 'Reset')) return;
  await run(); hooks.render(); toast('Back to the defaults');
} }, 'Reset this group'));
const sw = (label, on, set, hint) => [h('label', { class: 'check' }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked: !!on, onchange: e => set(e.target.checked) }), label), hint ? h('p', { class: 'hint help' }, hint) : null];
export function renderShowHide() {
  const st = settings(), d = display();
  const save = patch => patchLogbook({ settings: patch });
  const caseOn = caseShown;
  const setCase = (part, show) => setCaseShown(part, show, CASE_PARTS.map(([p]) => p));
  const { hidden } = arrangeTabs(barTabs().map(([id]) => id), d);
  return h('div', { class: 'showhide set-page' },
    profileCard(),
    h('section', { class: 'card' },
      h('h2', {}, 'Hide items'),
      h('p', { class: 'hint help', style: 'margin:0' }, 'Everything you can hide, by area. Each group has its own reset, so you can bring one area back without touching the rest. The same switches are on their own pages too.'),
      ),
    h('section', { class: 'card', 'data-group': 'tips' },
      h('h3', { style: 'margin-top:0' }, 'Tips and help'),
      sw('Show tips and help text', !st.hideTips, v => save({ hideTips: !v }).then(() => hooks.render()), 'Explanations around the app, the privacy and photo reminders, and the tips for the tags you pick.'),
      sw('Show last week’s summary on the Case tab', !!st.weeklyDigest, v => save({ weeklyDigest: v })),
      groupReset('the tips and the weekly summary', () => save({ hideTips: null, weeklyDigest: null }))),
    h('section', { class: 'card', 'data-group': 'case' },
      h('h3', { style: 'margin-top:0' }, 'Case tab'),
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'The case box, All tags and Save always stay.'),
      CASE_PARTS.map(([part, label]) => sw(label, caseOn(part), v => setCase(part, v))),
      groupReset('every part of the Case tab', () => save({ caseHide: null }))),
    h('section', { class: 'card', 'data-group': 'reflections' },
      h('h3', { style: 'margin-top:0' }, 'Reflections'),
      sw('Formatting buttons (this device)', !!d.reflToolbar, v => applyDisplay(setDisplay({ reflToolbar: v || null })), 'Bold, bullet and numbered lists above each box.'),
      sw('Show notes under each heading', st.reflNotes !== false, v => save({ reflNotes: v })),
      sw('Word counts in the list (this device)', !d.hideWords, v => applyDisplay(setDisplay({ hideWords: v ? null : true }))),
      groupReset('the reflection defaults (no formatting buttons, heading notes and word counts on)', () => { applyDisplay(setDisplay({ reflToolbar: null, hideWords: null })); return save({ reflNotes: null }); })),
    h('section', { class: 'card', 'data-group': 'logbook' },
      h('h3', { style: 'margin-top:0' }, 'Logbook (this device)'),
      sw('Copy and Reflect buttons on each case', !d.rowMenu, v => applyDisplay(setDisplay({ rowMenu: v ? null : true })), 'Off: one ⋯ button on each row instead.'),
      sw('Copy button on each case', !!d.rowCopy, v => applyDisplay(setDisplay({ rowCopy: v || null })), 'Off by default.'),
      sw('Copy button for each day', !!d.dayCopy, v => applyDisplay(setDisplay({ dayCopy: v || null })), 'Off by default: Share sends the whole day.'),
      groupReset('the row and day buttons', () => applyDisplay(setDisplay({ rowMenu: null, rowCopy: null, dayCopy: null })))),
    h('section', { class: 'card', 'data-group': 'bar' },
      h('h3', { style: 'margin-top:0' }, 'Header and tabs (this device)'),
      sw('Show the header (the app’s name and your name)', !d.hideHeader, v => applyDisplay(setDisplay({ hideHeader: !v }))),
      sw('Swipe left or right to change tab', d.swipeTabs !== false, v => applyDisplay(setDisplay({ swipeTabs: v ? null : false }))),
      barTabs().filter(([id]) => id !== 'more').map(([id, label]) => sw(`${label} on the tab bar`, !hidden.includes(id), v => setTabOnBar(id, v, () => hooks.render()))),
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, `Up to ${MAX_BAR} tabs fit, More included. Hidden tabs are first in More. The order is in Display → Advanced.`),
      groupReset('the header, swiping and the usual tabs (Notes and the More pages go back into More)', () => { applyDisplay(setDisplay({ hideHeader: null, swipeTabs: null, tabHidden: null, tabOrder: null })); hooks.paintTabs?.(); })));
}

export function renderReflectionSettings() {
  const st = settings();
  return h('div', { class: 'set-page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Reflections'),
      toggle('New reflections are included in the portfolio export', st.reflExport !== false, v => patchLogbook({ settings: { reflExport: v } }),
        'Each reflection keeps its own tick.', 'Switch off if you write many and would rather choose which go in. Reflections already written keep their own tick.'),
      pick('Learning points in new reflections', [['numbered', 'Numbered points with headings (default)'], ['free', 'Free text (one box)']], st.reflPoints === 'free' ? 'free' : 'numbered',
        v => patchLogbook({ settings: { reflPoints: v === 'free' ? 'free' : null } }).then(() => toast('Saved')), 'Each reflection can still be switched at the top of its Learning points.'),
      toggle('Formatting buttons (this device)', display().reflToolbar, v => applyDisplay(setDisplay({ reflToolbar: v || null })),
        'Bold, bullet and numbered lists above each box.', 'The Word export shows them as real bold and bullets.'),
      toggle('Underline spelling mistakes in reflections (this device)', display().reflSpell !== false, v => applyDisplay(setDisplay({ reflSpell: v ? null : false }))),
      toggle('Word counts in the Reflections list (this device)', !display().hideWords, v => applyDisplay(setDisplay({ hideWords: v ? null : true }))),
      resetLink('new reflections in the export, learning points, formatting buttons, spelling and word counts', async () => { await patchLogbook({ settings: { reflExport: null, reflPoints: null } }); applyDisplay(setDisplay({ reflSpell: null, reflToolbar: null, hideWords: null })); })),
    h('section', { class: 'card' },
      h('h2', {}, 'Photos'),
      (() => { const kb = photoUsageKb(S.reflections), pct = Math.min(100, Math.round(kb / PHOTO_BUDGET_KB * 100));
        return [h('p', { style: 'margin:0 0 6px' }, `${fmtMb(kb)} of ${fmtMb(PHOTO_BUDGET_KB)} used by your reflection figures`),
          h('div', { style: 'height:8px;border-radius:calc(4px * var(--round, 1));background:var(--line, #ddd);overflow:hidden' }, h('div', { style: `height:100%;width:${pct}%;background:${pct >= 90 ? 'var(--err, #b91c1c)' : 'var(--accent, #002f6c)'}` }))]; })(),
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, PHOTO_NOTE + ' They are shrunk on your phone before saving. To free space, remove figures you no longer need; deleted reflections free theirs when they leave the recycle bin (30 days).')));
}

// On the More page
export const privacyCard = () => (
    h('section', { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('p', { class: 'hint', style: 'margin:0' },
        'Your cases are stored in your own logbook in Google Cloud Firestore. Only you can read them (and the app owner, who runs the import from the old Google Form); programme admins cannot. ',
        'Log patient initials only — no names, NRIC or hospital numbers. Programme residents share case counts per tag (Analytics → Compare with your intake); details are never shared. ',
        'This device keeps an offline copy of your cases until you sign out — sign out on shared computers.')));
export const creditsCard = () => (
    h('section', { class: 'card credits' },
      h('h2', {}, 'Credits'),
      h('p', { style: 'margin:0' }, 'Code by ', h('b', {}, 'Abigail Sim')),
      h('p', { style: 'margin:4px 0 0' }, 'Design and UX/UI by ', h('b', {}, 'Koh Wenjun'))));

// ---------- Account-tab cards: who you are, sign out ----------

export function youCard() {
  const r = S.resident;
  return h('section', { class: 'card' },
    h('h2', {}, 'You'),
    h('p', { class: 'hint' }, 'Signed in as ', h('b', {}, S.user.email), S.admin ? ' (admin)' : '', '.'),
    h('label', { class: 'field' }, 'Name (shown on your exports; the Totals table uses the name on the programme list)',
      h('input', { value: displayName(), autocomplete: 'name', onchange: e => patchLogbook({ name: e.target.value.trim() }).then(() => toast('Saved')) })),
    r
      ? h('p', { class: 'hint' }, `On the programme list: ${r.rid}, AY${r.intake || '?'} intake, ${myYearName()}${r.status && r.status !== 'ACTIVE' ? ', ' + r.status.toLowerCase() : ''}. Your case counts (never your case details) are shared on Totals (Analytics → Compare with your intake).`)
      : h('p', { class: 'hint' }, 'Not on the programme resident list, so your logbook is private and not on Totals. If you are an APMES resident, ask the programme admins to add your email.'));
}

export function signOutCard() {
  return h('section', { class: 'card' },
    h('div', { class: 'bar', style: 'margin:0' },
      h('button', { onclick: async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const ok = await writes.flush() && await cloud.synced();
        btn.disabled = false;
        if (!ok && !(await confirmBox('Not synced yet', 'Some cases or changes on this device have not reached the server yet (no signal?). Signing out now deletes them. Wait for signal and try again, or sign out anyway?', 'Sign out anyway', true))) return;
        cloud.signOut();
      } }, 'Sign out'),
      // the demo: Leave demo beside Sign out (the header badge can be hidden now), Reset as a link that asks first
      cloud.demo ? h('a', { href: location.pathname, class: 'btn' }, 'Leave demo') : null,
      cloud.demo ? h('button', { type: 'button', class: 'link', style: 'margin-left:auto;padding:10px 4px;min-height:44px', onclick: () => hooks.resetDemo?.() }, 'Reset demo') : null),
    cloud.demo ? h('p', { class: 'muted', style: 'margin:8px 0 0' }, 'Demo mode: data stays in this browser.') : null);
}

// ---------- tag groups (stored as logbook.templates) ----------

function tagGroupsCard() {
  const list = (S.logbook && S.logbook.templates) || [];
  return h('section', { class: 'card', id: 'tag-groups' },
    h('h2', {}, 'Tag groups'),
    h('p', { class: 'hint help' }, 'Tags you often pick together, one tap in Quick picks on the Case tab, e.g. “LSCS spinal” = LSCS + CNB(Obs) + Spinal.'),
    list.length ? h('ul', { class: 'prog' }, list.map(t => h('li', { style: 'grid-template-columns:1fr auto', class: tev.lastGroup === t.id ? 'te-last' : '' },
      h('span', {}, h('b', {}, t.name), ' ', h('span', { class: 'muted' }, catPills(t.cats)), t.details ? h('span', { class: 'muted' }, ` · “${t.details}”`) : null),
      h('span', { class: 'row' },
        h('button', { class: 'small', onclick: () => editTemplate(t) }, 'Edit'),
        h('button', { class: 'small danger', onclick: async () => {
          if (!(await confirmBox('Delete tag group', `Delete “${t.name}”?`, 'Delete', true))) return;
          await patchLogbook({ templates: list.filter(x => x.id !== t.id) }); hooks.render();
          toast(`Tag group “${t.name}” deleted`, { action: 'Undo', onaction: async () => { await patchLogbook({ templates: list }); hooks.render(); } });
        } }, 'Delete'))))) : null,
    h('div', { class: 'bar', style: 'margin:12px 0 0' }, h('button', { onclick: () => editTemplate(null) }, '+ New tag group')));
}

// Tag group editor, shared with the admin screen (shared tag groups). save(t) persists it.
export function templateDialog(t, save, title = null) {
  const e = t ? { ...t, cats: [...t.cats] } : { id: uid(), name: '', cats: [], details: '' };
  const chips = h('div', { class: 'chips selected' });
  const paint = () => fill(chips, ...(e.cats.length ? e.cats.map(c => catChip(c, { on: true })) : [h('span', { class: 'none' }, 'No tags yet')]),
    h('button', { class: 'small', onclick: () => pickDialog(e.cats, cats => { e.cats = cats; paint(); }) }, 'Choose…'));
  paint();
  const m = modal(title || (t ? 'Edit tag group' : 'New tag group'), [
    h('label', { class: 'field' }, 'Name', h('input', { value: e.name, placeholder: 'e.g. LSCS spinal', oninput: ev => { e.name = ev.target.value; } })),
    h('div', { class: 'chiplabel' }, 'Tags'), chips,
    h('label', { class: 'field', style: 'margin-top:10px' }, 'Starting text for details (optional)', h('input', { value: e.details || '', placeholder: 'e.g. spinal, GA if converted', oninput: ev => { e.details = ev.target.value; } })),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        if (!e.name.trim() || !e.cats.length) return toast('Give it a name and at least one tag');
        const out = { id: e.id, name: e.name.trim(), cats: sortCodes(e.cats) };
        if (e.details && e.details.trim()) out.details = e.details.trim();
        m.close();
        await save(out);
      } }, 'Save')),
  ]);
}

function editTemplate(t) {
  if (t) tev.lastGroup = t.id;
  templateDialog(t, async out => {
    const all = (S.logbook && S.logbook.templates) || [];
    const list = all.filter(x => x.id !== out.id);
    const i = all.findIndex(x => x.id === out.id);
    // a new group goes after the one you last edited (else at the end)
    const after = !t && tev.lastGroup ? list.findIndex(x => x.id === tev.lastGroup) : -1;
    list.splice(i >= 0 ? i : after >= 0 ? after + 1 : list.length, 0, out);
    tev.lastGroup = out.id;
    await patchLogbook({ templates: list });
    hooks.render();
  });
}

// ---------- default category names (Admin portal: the programme's names for everyone) ----------

const CN = { open: false, edit: false };
// the programme's names (an admin's, else the built-in defaults), not anyone's own tag-editor names
const progName = code => (categoryNames()[code] && categoryNames()[code].name) || (DEFAULT_NAMES[code] || [])[0] || BY_CODE[code].name;
const progShort = code => (categoryNames()[code] && categoryNames()[code].short) || (DEFAULT_NAMES[code] || [])[1] || progName(code);
export function categoryNamesCard() {
  const cur = categoryNames();
  const edits = JSON.parse(JSON.stringify(cur));
  const set = (code, k, v) => { edits[code] = { ...(edits[code] || {}), [k]: v }; };
  const ed = CN.edit && S.admin;
  return h('section', { class: 'card cat-names-card' }, h('details', { class: 'more-tools', open: CN.open || ed, ontoggle: e => { CN.open = e.target.open; } },
    h('summary', {}, 'Default tag names', (n => n ? h('span', { class: 'muted', style: 'font-weight:400' }, ` · ${n} renamed`) : null)(Object.keys(categoryNames() || {}).length)),
    h('p', { class: 'hint' }, 'The programme’s names for everyone: a display name for lists and Analytics, and a short name for the pills. Each resident can still rename them for themselves in the Tag editor. Exports (portfolio, Excel) always use the official APMES names.'),
    S.admin ? h('div', { class: 'bar', style: 'margin:0 0 8px' }, ed
      ? [h('button', { class: 'primary small', onclick: async () => {
          try { const n = await cloud.saveCategoryNames(edits); setCategoryNames(n); CN.edit = false; toast('Tag names saved for everyone'); hooks.render(); }
          catch (err) { toast('Could not save: ' + err.message); }
        } }, 'Save names'), h('button', { class: 'small', onclick: () => { CN.edit = false; hooks.render(); } }, 'Cancel')]
      : h('button', { class: 'small', onclick: () => { CN.edit = true; CN.open = true; hooks.render(); } }, 'Edit')) : null,
    ed ? h('p', { class: 'hint' }, 'Leave a box blank for the programme default (shown faintly).') : null,
    h('div', { class: 'scroll' }, h('table', { class: 'cat-names' },
      h('thead', {}, h('tr', {}, ['Official', 'Display name', 'Pill name'].map(t => h('th', {}, t)))),
      h('tbody', {}, PICKER_ORDER.map(c => h('tr', {},
        h('td', { class: 'muted' }, c.name),
        ed ? h('td', {}, h('input', { value: (cur[c.code] && cur[c.code].name) || '', placeholder: (DEFAULT_NAMES[c.code] || [])[0] || c.name, maxlength: '80', 'aria-label': `Display name for ${c.name}`, oninput: e => set(c.code, 'name', e.target.value) })) : h('td', {}, progName(c.code)),
        ed ? h('td', {}, h('input', { value: (cur[c.code] && cur[c.code].short) || '', placeholder: (DEFAULT_NAMES[c.code] || [])[1] || c.name, maxlength: '30', 'aria-label': `Pill name for ${c.name}`, oninput: e => set(c.code, 'short', e.target.value) })) : h('td', {}, progShort(c.code)))))))));
}

// ---------- tag editor (this account; js/tags.js) ----------

// Your layout of the Log page's list: rename categories for yourself, hide them, reorder them, put them
// under section headers, and add your own tags (linked to APMES categories, or personal labels).
// Share it as a CSV file (opens in Excel) or load someone else's.
const saveTags = set => patchLogbook({ settings: { tagSet: cleanTagSet(set) } }).then(() => hooks.render());
// view: the list (details, up/down) or pills (as on the Case tab, drag to reorder); a search narrows both
// (List or Pills is remembered with your account, like the Log page's switch)
// last: the tag or header you last tapped (list or pills) — a new one goes right after it;
// lastGroup: the tag group you last edited — a new group goes after it
const tev = { q: '', last: null, lastGroup: null };
resetters.push(() => { tev.q = ''; tev.last = null; tev.lastGroup = null; });
const teMode = () => (settings().tagEditorView === 'pills' ? 'pills' : 'list');
// cases per tag: APMES tags from the counts, your own tags by key
function tagUsage() {
  const n = new Map();
  for (const c of S.cases || []) for (const k of c.tags || []) n.set(k, (n.get(k) || 0) + 1);
  return k => (k.startsWith('c:') ? (S.counts[k.slice(2)] || 0) : n.get(k) || 0);
}
export function renderTagEditor() {
  const set = tagSet();
  const all = flatTree(tagTree(set));
  const used = tagUsage();
  const def = code => ({ pill: (DEFAULT_NAMES[code] || [])[1] || BY_CODE[code].name, long: (DEFAULT_NAMES[code] || [])[0] || BY_CODE[code].name });
  const nameOf = n => (n.kind === 'head' ? n.e.n : n.kind === 'cat' ? catShort(n.code) : n.e.n);
  const words = (tev.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const hay = n => [nameOf(n), n.kind === 'cat' ? catName(n.code) + ' ' + n.code : n.e.l || '', ...shorthandOf(n.e)].join(' ').toLowerCase();
  const nodes = words.length ? all.filter(n => words.every(w => hay(n).includes(w))) : all;
  const linkText = n => n.kind === 'head' ? 'section header'
    : 'Personal · ' + ((n.e.links || []).length ? 'counts as ' + n.e.links.map(catShort).join(', ') : (n.e.p && n.e.p.startsWith('c:') ? 'counts under ' + catShort(n.e.p.slice(2)) : 'label only'));
  const count = n => (n.kind === 'head' ? '' : `${used(n.e.k)} case${used(n.e.k) === 1 ? '' : 's'}`);
  const row = n => h('li', { 'data-k': n.e.k, style: `padding-left:${8 + Math.min(n.depth, 4) * 18}px`, class: `te-${n.kind}${n.e.hide ? ' te-hidden' : ''}${tev.last === n.e.k ? ' te-last' : ''}` },
    // drag by the handle: onto the top or bottom of a row to go before or after it, the middle to go inside
    h('span', { class: 'te-handle', title: 'Drag to move or nest', 'aria-label': 'Drag to move or nest', onpointerdown: e => startTagDrag(e, n.e.k) }, '⠿'),
    h('button', { type: 'button', class: 'te-name', 'aria-pressed': String(tev.last === n.e.k), onclick: () => selectTag(n) },
      h('span', { class: 'te-pill' }, nameOf(n)),
      n.kind === 'head' ? null : h('small', { class: 'muted te-sub' },
        [n.kind === 'cat' ? 'APMES · ' + catName(n.code) : linkText(n), count(n), n.e.hide ? 'hidden' : ''].filter(Boolean).join(' · '))),
    h('button', { class: 'small icon-btn', 'aria-label': 'Move up', onclick: () => saveTags(moveTag(set, n.e.k, -1)) }, '↑'),
    h('button', { class: 'small icon-btn', 'aria-label': 'Move down', onclick: () => saveTags(moveTag(set, n.e.k, 1)) }, '↓'));
  // pills: tap to select, drag (press and hold on a phone) onto the left or right of another to go
  // before or after it, onto its middle to go inside
  const pill = n => h('li', { 'data-k': n.e.k, class: `te-pillitem te-${n.kind} d${Math.min(n.depth, 3)}${n.e.hide ? ' te-hidden' : ''}${tev.last === n.e.k ? ' te-last' : ''}`, tabindex: '0', role: 'button', 'aria-pressed': String(tev.last === n.e.k),
    title: n.kind === 'cat' ? catName(n.code) : n.kind === 'head' ? 'Section header' : linkText(n),
    onpointerdown: e => pillDown(e, n.e.k, e.currentTarget), onclick: () => { if (!pillDragged) selectTag(n); }, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTag(n); } } },
    h('span', { class: 'te-pill' }, nameOf(n)), n.kind === 'head' ? null : h('small', { class: 'te-n' }, String(used(n.e.k))));
  const search = h('input', { type: 'search', class: 'grow', value: tev.q, placeholder: 'Search tags, names or shorthand', 'aria-label': 'Search tags',
    oninput: e => { tev.q = e.target.value; const pos = e.target.selectionStart; hooks.render(); const el = document.querySelector('.tag-editor input[type=search]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } } });
  const modeSeg = h('span', { class: 'seg', role: 'group', 'aria-label': 'Show tags as' },
    [['list', 'List'], ['pills', 'Pills']].map(([m, l]) => h('button', { class: 'small', 'aria-pressed': String(teMode() === m), onclick: () => { if (teMode() !== m) patchLogbook({ settings: { tagEditorView: m } }).then(() => hooks.render()); } }, l)));
  return h('div', {}, h('section', { class: 'card tag-editor' },
    h('h2', {}, 'Tag editor'),
    h('p', { class: 'hint help' }, 'Lay out the Case tab’s list your way. APMES tags are the programme’s categories: rename (just for you), hide, move them or put them under section headers. Personal tags are your own: link one to APMES categories and choosing it ticks them, or leave it as a label only. A personal tag under an APMES one counts towards it. Totals and exports always use APMES.'),
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px;margin:0 0 8px' },
      h('button', { class: 'small primary', onclick: () => editTag(null, 'tag') }, '+ Personal tag'),
      h('button', { class: 'small', onclick: () => editTag(null, 'head') }, '+ Section header'),
      h('button', { class: 'small', onclick: () => document.getElementById('tag-groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Tag groups ↓')),
    h('div', { class: 'bar', style: 'gap:8px;margin:0 0 8px' }, search, modeSeg),
    words.length ? h('p', { class: 'hint', style: 'margin:0 0 6px' }, `${nodes.length} of ${all.length} shown`) : null,
    teMode() === 'pills'
      ? [h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'Tap a pill to select it and see its details. Drag one (press and hold on a phone) onto the left or right of another to move it, or onto its middle to put it inside. The number is how many cases have it.'),
        h('ul', { class: 'te-list te-pills' }, nodes.map(pill))]
      : h('ul', { class: 'te-list' }, nodes.map(row))),
    tagGroupsCard(),
    // the whole layout as a file, and starting over: rarely needed, so at the very bottom
    h('section', { class: 'card' },
      h('h2', {}, 'Tag list file'),
      h('p', { class: 'hint help' }, 'Download your tags as a spreadsheet (CSV) to edit on a computer or share, load one back, or reset to the APMES tags.'),
      h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px;margin:0' },
        h('button', { class: 'small', onclick: () => download(`tags-${todayISO()}.csv`, new Blob([tagSetToCsv(set, def)], { type: 'text/csv' })) }, 'Download as CSV'),
        fileButton('Load a CSV…', '.csv,text/csv', file => loadTagCsv(file, def), 'btn small'),
        h('button', { class: 'small linkish', style: 'margin-left:auto', onclick: async () => {
          if (!(await confirmBox('Reset tags?', 'Go back to the APMES tags in the official order, with the programme’s names? Your own tags are removed from the list (cases keep them).', 'Reset', true))) return;
          await patchLogbook({ settings: { tagSet: defaultTagSet({}), catOrder: [], subcats: {} } }); hooks.render();
        } }, 'Reset'))));
}

// Selecting is read-only. The small floating card is a transient view, so Back /
// Escape dismiss it and restore focus without losing the insertion anchor.
function selectTag(n) {
  const owner = S.user?.email;
  tev.last = n.e.k;
  document.querySelectorAll('.tag-editor li[data-k]').forEach(li => {
    const selected = li.dataset.k === tev.last;
    li.classList.toggle('te-last', selected);
    (li.matches('[role=button]') ? li : li.querySelector('.te-name'))?.setAttribute('aria-pressed', String(selected));
  });
  const name = n.kind === 'cat' ? catShort(n.code) : n.e.n;
  const parent = n.e.p ? tagSet().find(e => e.k === n.e.p) : null;
  const nameOf = e => e.k.startsWith('c:') ? catShort(e.k.slice(2)) : e.n;
  const links = tagLinksIn(tagSet(), n.e.k);
  const next = async action => {
    await m.close();
    if (S.user?.email !== owner) return;
    const selected = flatTree(tagTree(tagSet())).find(x => x.e.k === n.e.k);
    if (!selected) return toast('This tag was removed. Select another tag.');
    action(selected);
  };
  const m = modal(name, [
    h('p', { class: 'hint' }, n.kind === 'head' ? 'Section header' : n.kind === 'cat' ? 'APMES · ' + catName(n.code) : 'Personal tag'),
    parent ? h('p', {}, 'Under ', nameOf(parent)) : null,
    n.kind !== 'head' ? [h('p', {}, `${tagUsage()(n.e.k)} cases · ${n.e.hide ? 'Hidden (search still finds it)' : 'Shown on Case'}`),
      h('p', {}, links.length ? 'Counts towards: ' + links.map(catName).join(', ') : 'Label only; no APMES credit'),
      shorthandOf(n.e).length ? h('p', { class: 'hint' }, 'Shorthand: ' + shorthandOf(n.e).join(', ')) : null] : null,
    h('div', { class: 'bar', style: 'flex-wrap:wrap;margin-bottom:0' },
      h('button', { onclick: () => next(selected => editTag(selected)) }, 'Edit'),
      h('button', { class: 'primary', onclick: () => next(() => editTag(null, 'tag')) }, 'Add after'),
      h('button', { onclick: () => m.close() }, 'Close')),
  ], { cls: 'tag-info' });
}

// Pills: a mouse drags once it moves; a finger drags after a short hold (a quick swipe still scrolls).
let pillDragged = false;
function pillDown(e, key, li) {
  if (tdrag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  pillDragged = false;
  const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== 'mouse';
  let timer = null;
  const stop = () => { clearTimeout(timer); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
  const go = ev => { stop(); pillDragged = true; startTagDrag(ev, key, true, li); };
  const mv = ev => {
    const far = Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 8;
    if (!far) return;
    if (touch) stop(); else go(ev);   // a finger that moves before the hold is scrolling
  };
  if (touch) timer = setTimeout(() => go(e), 280);
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
}

// ---------- drag and drop (pointer events, so touch works) ----------
let tdrag = null;
// a short vibration (Android; iPhones don't allow web pages to vibrate, so nothing happens there)
const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not allowed */ } };
function startTagDrag(e, key, horiz = false, liArg = null) {
  // (a pills drag starts from a pointermove, where button is -1)
  if (tdrag || (e.type === 'pointerdown' && e.pointerType === 'mouse' && e.button !== 0)) return;
  if (e.cancelable) e.preventDefault();
  // (a pills drag starts after the pointer moved: use the pill that was pressed, not what's under it now)
  const li = liArg || e.target.closest('li');
  if (!li) return;
  const box = li.getBoundingClientRect();
  // the copy that follows the finger sits in a list of the same kind, so the list's styles still apply
  // (a bare row in <body> wrapped onto two lines)
  const ghost = h('ul', { class: li.parentElement.className + ' te-ghostlist', 'aria-hidden': 'true' }, li.cloneNode(true));
  ghost.firstChild.classList.add('te-ghost');
  Object.assign(ghost.style, { position: 'fixed', left: box.left + 'px', top: box.top + 'px', width: horiz ? 'auto' : box.width + 'px', margin: 0, pointerEvents: 'none', zIndex: 50 });
  document.body.append(ghost);
  li.classList.add('te-dragging');
  // a finger hides what it holds: lift the copy above the finger
  const lift = e.pointerType === 'touch' ? box.height + 18 : 0;
  // where it will land, in words, at the top of the screen (visible even under a finger)
  const hint = h('div', { class: 'te-drop-hint', role: 'status' });
  document.body.append(hint);
  tdrag = { key, ghost, li, hint, dx: e.clientX - box.left, dy: e.clientY - box.top + lift, target: null, where: null, y: e.clientY };
  buzz(15);   // picked up
  // while dragging, a finger must not scroll the page
  const noScroll = ev => { if (tdrag) ev.preventDefault(); };
  window.addEventListener('touchmove', noScroll, { passive: false });
  const clear = () => document.querySelectorAll('.te-list li.drop-before, .te-list li.drop-after, .te-list li.drop-inside').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-inside'));
  const move = ev => {
    tdrag.y = ev.clientY;
    ghost.style.top = (ev.clientY - tdrag.dy) + 'px';
    if (horiz) ghost.style.left = (ev.clientX - tdrag.dx) + 'px';
    clear();
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const t = under && under.closest('.te-list li[data-k]');
    tdrag.target = null;
    hint.textContent = '';
    if (!t || t.dataset.k === key) return;
    const r = t.getBoundingClientRect();
    // pills sit side by side: left / middle / right; rows (and header lines) stack: top / middle / bottom
    const f = horiz && !t.classList.contains('te-head') ? (ev.clientX - r.left) / r.width : (ev.clientY - r.top) / r.height;
    const set = tagSet();
    const tk = t.dataset.k, te = set.find(x => x.k === tk);
    let where = f < 0.3 ? 'before' : f > 0.7 ? 'after' : 'inside';
    const ok = w => canPlace(set, key, w === 'inside' ? tk : (te.p || '')) && dropTag(set, key, tk, w) !== set;
    if (!ok(where)) where = ['before', 'after', 'inside'].find(ok);
    if (!where) return;
    if (tdrag.lastSpot !== tk + where) { tdrag.lastSpot = tk + where; buzz(6); }   // a tick each time the drop spot changes
    tdrag.target = tk; tdrag.where = where;
    t.classList.add('drop-' + where);
    const nm = (t.querySelector('.te-pill') || t).textContent.trim().slice(0, 40);
    hint.textContent = where === 'inside' ? `Under “${nm}”` : `${where === 'before' ? 'Before' : 'After'} “${nm}”`;
  };
  // scroll when near the top or bottom of the screen
  const tick = () => {
    if (!tdrag) return;
    const edge = 70, h0 = window.innerHeight;
    if (tdrag.y < edge) window.scrollBy(0, -10); else if (tdrag.y > h0 - edge - 60) window.scrollBy(0, 10);
    tdrag.raf = requestAnimationFrame(tick);
  };
  tdrag.raf = requestAnimationFrame(tick);
  const end = ev => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
    window.removeEventListener('touchmove', noScroll);
    cancelAnimationFrame(tdrag.raf);
    setTimeout(() => { pillDragged = false; }, 0);   // the click that ends a drag doesn't open the editor
    ghost.remove(); hint.remove(); li.classList.remove('te-dragging'); clear();
    const { target, where } = tdrag;
    tdrag = null;
    if (ev.type === 'pointerup' && target) { buzz(20); saveTags(dropTag(tagSet(), key, target, where)); }
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
}

// Edit one item (or add a tag / header when n is null).
function editTag(n, kind = n ? n.kind : 'tag') {
  const set = tagSet(), owner = S.user?.email;
  const current = () => {
    if (S.user?.email !== owner) { toast('Account changed; nothing was saved'); return false; }
    if (JSON.stringify(tagSet()) !== JSON.stringify(set)) { toast('Your tag layout changed while this was open. Close and reopen to use the latest layout.'); return false; }
    return true;
  };
  if (n) tev.last = n.e.k;   // remembered: a new tag or header goes right after it
  const e = n ? { ...n.e, links: [...(n.e.links || [])] } : { k: newKey(kind === 'head' ? 'h' : 'u'), n: '', links: [], ...(kind === 'head' ? { hd: true } : {}) };
  // a new one sits beside the last tapped: a tag under the same parent, a header after its top-level item
  const last = !n && tev.last ? set.find(x => x.k === tev.last) : null;
  const topOf = k => { let x = set.find(y => y.k === k); while (x && x.p) x = set.find(y => y.k === x.p); return x; };
  const anchor = last ? (kind === 'head' ? topOf(last.k) : last) : null;
  if (anchor && kind === 'tag' && anchor.p) e.p = anchor.p;
  const code = kind === 'cat' ? e.k.slice(2) : null;
  const sub = code && BY_CODE[code].parent;
  const dflt = code ? { pill: (DEFAULT_NAMES[code] || [])[1] || BY_CODE[code].name } : null;
  // where it can sit: headers (anything), categories and tags (tags only); not under itself
  const own = new Set([e.k]);
  if (n) { let grew = true; while (grew) { grew = false; for (const x of set) if (x.p && own.has(x.p) && !own.has(x.k)) { own.add(x.k); grew = true; } } }
  const places = flatTree(tagTree(set)).filter(x => !own.has(x.e.k) && (kind === 'tag' ? true : kind === 'cat' ? x.kind === 'head' : false));
  const under = h('select', { 'aria-label': 'Sits under', disabled: !!sub || kind === 'head' },
    h('option', { value: '' }, sub ? catShort(sub) : 'Top level'),
    places.map(x => h('option', { value: x.e.k, selected: e.p === x.e.k }, `${'  '.repeat(Math.min(x.depth, 4))}${x.kind === 'cat' ? catShort(x.code) : x.e.n}${x.kind === 'head' ? ' (header)' : ''}`)));
  const pill = h('input', { value: e.n || '', maxlength: kind === 'head' ? '60' : '40', placeholder: code ? dflt.pill : kind === 'head' ? 'e.g. Regional' : 'e.g. Interscalene' });
  const long = h('input', { value: e.l || '', maxlength: '100', placeholder: code ? ((DEFAULT_NAMES[code] || [])[0] || BY_CODE[code].name) : 'optional' });
  const hide = h('input', { type: 'checkbox', checked: !!e.hide });
  const nameOf = x => x.k.startsWith('c:') ? catShort(x.k.slice(2)) : x.n;
  const parentValue = () => sub ? 'c:' + sub : under.value;
  const after = h('select', { 'aria-label': 'Place after' });
  const placement = h('p', { class: 'hint', role: 'status' });
  const findAnchor = h('input', { type: 'search', placeholder: 'Find a placement tag', 'aria-label': 'Find a placement tag' });
  let selectedAfter = anchor && (anchor.p || '') === parentValue() ? anchor.k : '$end';
  const preview = () => {
    const parent = set.find(x => x.k === parentValue());
    const sibling = set.find(x => x.k === selectedAfter);
    placement.textContent = `${parent ? 'Under “' + nameOf(parent) + '”' : 'Top level'} · ${selectedAfter === '$start' ? 'at the beginning' : selectedAfter === '$end' ? 'at the end' : 'after “' + nameOf(sibling) + '” (including its children)'}`;
  };
  const anchorLabel = x => [nameOf(x), x.k.startsWith('c:') ? catName(x.k.slice(2)) : x.l || '', x.hd ? 'section header' : ''].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ');
  const paintAfter = () => {
    const q = findAnchor.value.trim().toLowerCase();
    const siblings = set.filter(x => (x.p || '') === parentValue() && x.k !== e.k);
    fill(after, h('option', { value: '$start' }, 'Beginning'), h('option', { value: '$end' }, 'End'),
      siblings.filter(x => x.k === selectedAfter || !q || (anchorLabel(x) + ' ' + shorthandOf(x).join(' ')).toLowerCase().includes(q)).map(x => h('option', { value: x.k }, anchorLabel(x))));
    if (!siblings.some(x => x.k === selectedAfter)) selectedAfter = selectedAfter === '$start' ? '$start' : '$end';
    after.value = selectedAfter; preview();
  };
  after.addEventListener('change', () => { selectedAfter = after.value; preview(); });
  findAnchor.addEventListener('input', paintAfter);
  under.addEventListener('change', () => { selectedAfter = '$end'; findAnchor.value = ''; paintAfter(); });
  paintAfter();
  const kw = h('textarea', { rows: '3', value: shorthandOf(e).join(', '), maxlength: '1000', placeholder: kind === 'cat' ? 'e.g. flap, free flap' : 'e.g. appy, lap appy', autocapitalize: 'off', spellcheck: 'false' });
  const linkBox = h('div', { class: 'te-links' }, PICKER_ORDER.map(c => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: e.links.includes(c.code), onchange: ev => { e.links = ev.target.checked ? [...e.links, c.code] : e.links.filter(x => x !== c.code); } }),
    `${c.parent ? '\u00a0\u00a0' : ''}${catName(c.code)}`)));
  const m = modal(n ? (kind === 'cat' ? 'Edit APMES tag' : kind === 'head' ? 'Edit header' : 'Edit personal tag') : (kind === 'head' ? 'New section header' : 'New personal tag'), [
    code ? h('p', { class: 'hint' }, `APMES: ${BY_CODE[code].full}. It always counts towards this APMES tag; renaming is just for you.`) : null,
    h('label', { class: 'field' }, kind === 'head' ? 'Header' : 'Name (pill)', pill),
    kind !== 'head' ? h('label', { class: 'field' }, 'Long name (lists)', long) : null,
    kind !== 'head' ? h('label', { class: 'field' }, 'Sits under', under) : null,
    !n ? [h('label', { class: 'field' }, 'Find a placement tag', findAnchor), h('label', { class: 'field' }, 'Place after', after), placement] : null,
    kind === 'tag' ? [h('div', { class: 'chiplabel' }, 'Counts towards (optional)'),
      h('p', { class: 'hint', style: 'margin:0 0 4px' }, 'Choosing this tag ticks these APMES tags. Leave all unticked for a label only.'), linkBox] : null,
    kind !== 'head' ? h('label', { class: 'field', style: 'margin-top:8px' }, 'Shorthand (optional)', kw,
      h('small', { class: 'hint', style: 'display:block' }, code ? 'Words you type for this, separated by commas. Typing one in a case suggests this tag. Starts with the built-in list: add, change or remove words.' : 'Words you type for this, separated by commas. Typing one in a case suggests this tag.')) : null,
    // a plain text link (harder to hit by accident), with a confirmation
    code && (DEFAULT_SHORTHAND[code] || []).length ? h('p', { style: 'margin:2px 0 0;font-size:calc(13px * var(--fs, 1))' }, h('a', { href: '#', class: 'subtle-link', onclick: async ev => {
      ev.preventDefault();
      if (!(await confirmBox('Reset shorthand?', 'Replace the words above with the built-in shorthand for this tag? Your changes to them are lost when you save.', 'Reset', true))) return;
      kw.value = DEFAULT_SHORTHAND[code].join(', ');
    } }, 'Reset to the built-in shorthand')) : null,
    // words from your own cases with this tag: tap one to add it to the shorthand (you choose)
    kind !== 'head' && n ? (() => {
      const box = h('div', { class: 'chips', style: 'margin-top:6px' });
      const paint = () => {
        const have = cleanShorthand(kw.value);
        const sug = learnShorthand(S.cases || [], e.k, { have });
        fill(box, ...(sug.length ? [h('small', { class: 'hint', style: 'flex-basis:100%' }, 'From your logbook:'),
          ...sug.map(x => h('span', { class: 'chip sugg', role: 'button', tabindex: '0', title: `In ${x.n} of your cases with this tag`,
            onclick: () => { kw.value = [...cleanShorthand(kw.value), x.w].join(', '); paint(); } }, '+ ' + x.w))] : []));
      };
      kw.addEventListener('input', debounceLocal(paint));
      paint();
      return box;
    })() : null,
    kind !== 'head' ? h('label', { class: 'check', style: 'margin-top:8px' }, hide, 'Hide from the Case tab (still found by search)') : null,
    h('div', { class: 'bar', style: 'margin-top:12px' },
      n && kind !== 'cat' ? h('button', { class: 'danger', onclick: async () => { if (!current()) return; await m.close(); if (S.user?.email !== owner) return; await saveTags(removeTag(set, e.k)); toast('Removed (cases keep the tag)'); } }, 'Remove') : null,
      n && kind === 'tag' ? h('button', { onclick: async () => { if (!current()) return; await m.close(); if (S.user?.email === owner) mergeTag(n); } }, 'Merge…') : null,
      h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        if (!current()) return;
        const nm = pill.value.trim();
        if (kind !== 'cat' && !nm) return toast('Give it a name');
        const out = { ...e, n: nm, l: long.value.trim(), hide: hide.checked, kw: kind === 'head' ? [] : cleanShorthand(kw.value) };
        if (!out.l) delete out.l; if (!out.hide) delete out.hide;
        // an APMES tag left on the built-in list keeps following it (and gets later additions)
        if (code ? out.kw.join() === (DEFAULT_SHORTHAND[code] || []).join() : !out.kw.length) delete out.kw; if (!out.n && kind === 'cat') delete out.n;
        if (kind !== 'tag') delete out.links;
        if (!n && set.filter(x => !x.k.startsWith('c:')).length >= MAX_TAGS) return toast(`You have ${MAX_TAGS} personal tags and headers, the most there can be. Remove one first.`);
        const p = parentValue();
        let next;
        try {
          next = n ? set.map(x => (x.k === e.k ? out : x)) : placeNewTag(set, out, p, selectedAfter);
          if (n && (e.p || '') !== p) next = reparentTag(next, e.k, p);
        } catch (err) { return toast(err.message); }
        try {
          await patchLogbook({ settings: { tagSet: cleanTagSet(next) } });
          if (S.user?.email !== owner) return;
          if (!n) tev.last = e.k;
          await m.close(); hooks.render();
        } catch (err) { toast('Could not save: ' + err.message); }
      } }, 'Save'))], { sticky: true });
}

const debounceLocal = fn => { let t; return () => { clearTimeout(t); t = setTimeout(fn, 200); }; };

// Merge a personal tag into another tag: its cases get the other tag instead (an APMES tag adds that
// category), and it comes off the list.
function mergeTag(n) {
  const set = tagSet();
  const from = n.e.k;
  const targets = flatTree(tagTree(set)).filter(x => x.kind !== 'head' && x.e.k !== from);
  const cases = (S.cases || []).filter(c => (c.tags || []).includes(from));
  const sel = h('select', {}, h('option', { value: '' }, 'Choose a tag…'),
    targets.map(x => h('option', { value: x.e.k }, `${'  '.repeat(Math.min(x.depth, 3))}${x.kind === 'cat' ? catShort(x.code) + ' (APMES)' : x.e.n}`)));
  const m = modal(`Merge “${n.e.n}”`, [
    h('p', {}, `${cases.length} case${cases.length === 1 ? '' : 's'} have “${n.e.n}”. They get the tag you choose instead, and “${n.e.n}” comes off your list.`),
    h('label', { class: 'field' }, 'Merge into', sel),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        const to = sel.value;
        if (!to) return toast('Choose a tag to merge into');
        m.close();
        const code = to.startsWith('c:') ? to.slice(2) : null;
        // what the target counts towards: an APMES tag itself, or a personal tag's links (as choosing it does)
        const adds = code ? [code] : tagLinksIn(set, to);
        const next = cases.map(c => {
          const tags = (c.tags || []).filter(k => k !== from);
          const out = { ...c, tags: code ? tags : [...new Set([...tags, to])], updatedAt: Date.now() };
          if (adds.length) out.cats = sortCodes(withParents([...(c.cats || []), ...adds]));
          if (!out.tags.length) delete out.tags;
          return out;
        });
        try { if (next.length) await saveMany(next); } catch (err) { return toast('Could not merge: ' + err.message); }
        await saveTags(removeTag(set, from));
        toast(`Merged into ${code ? catShort(code) : (set.find(x => x.k === to) || {}).n}: ${next.length} case${next.length === 1 ? '' : 's'} updated`);
      } }, 'Merge'))]);
}

// Load a CSV: show what's in it and what didn't line up, then replace your layout.
async function loadTagCsv(file, def) {
  const { set, errors, notes, counts } = tagSetFromCsv(await file.text(), def, tagSet());
  if (!set) return toast(errors[0] || 'Could not read that file');
  const m = modal('Load tags', [
    h('p', {}, `${counts.cats} APMES, ${counts.tags} personal tag${counts.tags === 1 ? '' : 's'} and ${counts.heads} header${counts.heads === 1 ? '' : 's'}.`),
    notes.length ? h('ul', { class: 'hint' }, notes.map(x => h('li', {}, x))) : null,
    errors.length ? [h('p', { style: 'margin:8px 0 2px' }, h('b', {}, `${errors.length} thing${errors.length === 1 ? '' : 's'} didn’t line up`)),
      h('ul', { class: 'warnings', style: 'max-height:40dvh;overflow:auto' }, errors.map(x => h('li', {}, x)))] : null,
    h('p', { class: 'hint' }, 'This replaces your tag layout. Your cases are not changed.'),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => { m.close(); await saveTags(set); toast('Tags loaded'); } }, 'Replace my tags'))]);
}
