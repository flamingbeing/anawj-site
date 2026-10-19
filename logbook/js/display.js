// This device's display settings (Settings → Display, Accessibility, Advanced display): stored, applied to the page
// and the tab bar's arrangement. Split from ui-settings.js so the Case tab (ui-log.js, ui-notepad.js) and app.js can
// start without loading the settings pages (they load on first use).

import { S, h, toast, modal, hooks, profile, facultyRole, shows } from './ui-core.js';
import { DEFAULT_ACCENT, cleanAccent, schemeCss, lightPalette, tabSchemeCss, tabVarsCss } from './colors.js';
import { lookCss } from './themes.js';
import { checkCss } from './custom-css.js';
import { applyFonts } from './fonts.js';
import { offBar } from './profiles.js';


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

// Display settings belong to the device, not the account (owner: people use the logbook on different devices with
// different needs): compact mode, text size, colour and the tab the app opens on, in localStorage DISPLAY_KEY, next to
// the light / dark choice. The first time a device opens the app it starts from what the account had (these used to
// follow the account), so nobody's look changes. Kept at sign-out: they are the device's, and nothing private.
const DISPLAY_KEY = 'apmes-logbook-display';
export const DISPLAY_KEYS = ['listHeight', 'myThemes', 'pageSize', 'lbGroup', 'lbSort', 'gridLines', 'gridCols', 'calRefl', 'totalsCompact', 'totalsTargets', 'boxHeight', 'boxGrow', 'moreOrder', 'noteToolbar', 'compact', 'textSize', 'zoom', 'accent', 'startTab', 'fontUi', 'fontUiName', 'fontLog', 'fontLogName', 'lineWidth', 'lineHeight', 'contrast', 'motion', 'tabIcons', 'tabBar', 'hideHeader', 'caseInverted', 'colourful', 'customCss', 'customCssOn', 'autoFocus', 'appTitle', 'boxCaps', 'boxCorrect', 'boxSpell', 'reflSpell', 'pinBox', 'pinSearch', 'firstField', 'compactTags', 'borders', 'round', 'shadows', 'bigTaps', 'tabOrder', 'tabHidden', 'swipeTabs', 'rowMenu', 'rowCopy', 'reflToolbar', 'edgeBack', 'hideWords', 'flat', 'btnStyle', 'iconBtns', 'calPlain', 'pageTitles', 'rowShort', 'rowHold', 'dayCopy', 'hideTabsTyping',
  'theme', 'themeMode', 'headFont', 'bgTint', 'spacing', 'tabStyle', 'band', 'barBlur', 'tabActiveLabel', 'listStyle', 'titleAlign', 'switchStyle', 'pressStyle', 'iconWeight', 'typeStyle'];
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
export function applyDisplay(d = display()) { applyCompact(!!d.compact); applyTextSize(d.textSize || '1'); applyZoom(d.zoom || '1'); applyAccent(d.accent); applyFonts(d); applyLook(d); applyThemeLook(d); }
// Themes (themes.js): the background tint, the top band, the heading font, spacing and tab style as one style sheet
// after the colour's (so it wins), cached on the device for the first paint (index.html) like the colour's
const LOOK_CSS_KEY = 'apmes-logbook-look-css';
export function applyThemeLook(d = display()) {
  const p = lightPalette(cleanAccent(d.accent) || DEFAULT_ACCENT);
  const css = lookCss(d, [p.s1, p.s2, p.s3, p.s4]);
  let el = document.getElementById('look-css');
  if (!el) { el = document.createElement('style'); el.id = 'look-css'; }
  if (el.textContent !== css) el.textContent = css;
  if (el.nextElementSibling || el.parentNode !== document.head) document.head.append(el);   // last, after the colour's
  try { css ? localStorage.setItem(LOOK_CSS_KEY, css) : localStorage.removeItem(LOOK_CSS_KEY); } catch { /* storage blocked */ }
}
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
  paintTitle(d);
  applyCustomCss(d);
}
export const BUTTON_STYLES = [['outlined', 'Outlined (default)'], ['filled', 'Filled'], ['tinted', 'Tinted'], ['plain', 'Plain']];
// the header's words: the app's name, or with Page titles the page's ("Logbook"); render() in app.js says which page
let pageLabel = '';
export function setPageLabel(l) { pageLabel = l || ''; paintTitle(); }
// (also on every render, so the APMES switch, an account setting, shows as soon as the logbook loads)
function paintTitle(d = display()) {
  const name = cleanTitle(d.appTitle) || defaultTitle();
  const t = (d.pageTitles && pageLabel) || name;
  const h1 = document.querySelector('.top h1'); if (h1 && h1.textContent !== t) h1.textContent = t;
  if (document.title !== name) document.title = name;
}
// one colour per tab (Colourful); style.css has the same shades for the tabs-and-headings version
export const TAB_COLOURS = { log: '#c2410c', logbook: '#0e7490', reflect: '#be123c', progress: '#1d4ed8', more: '#6d28d9' };
// the NUH stripe (orange, red, blue, navy) for the default colour; More keeps the app's navy
export const NUH_TAB_COLOURS = { log: '#e57200', logbook: '#e4002b', reflect: '#178fd7', progress: '#002f6c', more: '#002f6c' };
export const APP_TITLE = 'APMES Logbook';
// without APMES in the name (Profile → APMES; the Personal profile)
export const defaultTitle = () => (shows('apmesTitle') ? APP_TITLE : 'Logbook');
// Borders (Display, per device): how strong the lines around cards, fields, buttons and chips are; the last is the default
export const BORDERS = ['Borderless', 'Faint', 'Light', 'Soft', 'Normal (default)'];
export const BORDER_MIX = [0, 25, 50, 75];
// Corners (Display, per device): every border-radius in style.css is multiplied by --round; Normal is the default
export const ROUNDS = [['Square', 0], ['Slightly rounded', 0.5], ['Normal (default)', 1], ['Very round', 1.7]];
export const roundLevel = d => (Number.isInteger(d.round) && d.round >= 0 && d.round < ROUNDS.length ? d.round : 2);
// The tab bar (Advanced display, per device): the order of its tabs and which are hidden. More always stays
// (Settings live there), at least two and at most seven (MAX_BAR, More included) stay on the bar; hidden main tabs
// are listed first on the More page. Every page in the More list can go on the bar too (Admin portal: admins only).
export const BAR_TABS = [['caselogs', 'Case logs'], ['log', 'Case'], ['logbook', 'Logbook'], ['totals', 'Totals'], ['notes', 'Notes'], ['reflect', 'Reflections'], ['progress', 'Analytics'],
  ['account', 'Account'], ['settings', 'Settings'], ['recovery', 'Recover'], ['data', 'Export / Import'], ['admin', 'Admin portal'], ['more', 'More']];
// Totals: programme residents, faculty, PDs and admins, with the totals switch on (off in Personal)
export const barTabs = () => BAR_TABS.filter(([id]) => (id !== 'admin' || S.admin) && (id !== 'caselogs' || facultyRole()) && (id !== 'totals' || ((facultyRole() || S.resident) && shows('totals'))));
// tabs off the bar until someone puts them there (they live in More by default), and the ones each profile moves:
// profiles.js (OFF_BAR, PROFILE_OFF, PROFILE_ON)
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
// Card style (Themes; owner, 16 Oct 2026): one choice over the switches it sets. Raised = soft shadows (the default),
// Outlined = lines around cards, Flat = no lines and no page cards. The line strength stays its own slider
// (Advanced display), kept while Flat is on.
export const CARD_STYLES = [['raised', 'Raised: soft shadows (default)'], ['outlined', 'Outlined: thin lines'], ['flat', 'Flat: no lines, no cards']];
export const cardStyle = d => (d.flat ? 'flat' : d.shadows === false ? 'outlined' : 'raised');
export const cardPatch = v => (v === 'flat' ? { flat: true } : v === 'outlined' ? { flat: null, shadows: false } : { flat: null, shadows: null });
export const borderLevel = d => (Number.isInteger(d.borders) && d.borders >= 0 && d.borders < BORDERS.length - 1 ? d.borders : BORDERS.length - 1);
export const cleanTitle = s => String(s || '').replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
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
// Settings → Accessibility (#access; owner, 13 Oct 2026): size, contrast, motion and the gestures, gathered from
// Display and Advanced display. All this device's.
export const IPHONE_APP = () => (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);
export const START_TABS = [['log', 'Case'], ['logbook', 'Logbook'], ['reflect', 'Reflections'], ['progress', 'Analytics']];
