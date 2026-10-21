// Settings tab (#settings): the Admin entry (admins only), display, logging, templates, recycle bin, privacy. Also the Account tab's
// "You" card (youCard), used by ui-account.js; the More page's cards are in more-cards.js.

import { YEAR_NAMES, DEFAULT_NAMES, BY_CODE } from './categories.js';
import { sortCodes, uid, academicYear, withParents, weekStart, humanAge, cleanSkip, parseBulk } from './engine.js';
import { cleanListFormat, startUsable, learnFormat } from './list-format.js';
import { S, h, toast, modal, confirmBox, cloud, catChip, catName, catShort, PICKER_ORDER, settings, patchLogbook, displayName, hooks, rYear, myYearName, fill, PROFILES, profile, facultyRole, shows, setShown, caseShown, setCaseShown, categoryNames, setCategoryNames, catPills, tagSet, resetters, download, fileButton, todayISO, updateMany, updatedToast, UNDO_SECS, rowIcon } from './ui-core.js';
import { MAX_TAGS, tagLinks as tagLinksIn, learnShorthand, cleanShorthand, shorthandOf, DEFAULT_SHORTHAND, cleanTagSet, defaultTagSet, tagTree, flatTree, moveTag, reparentTag, removeTag, newKey, tagSetToCsv, tagSetFromCsv, dropTag, canPlace, placeNewTag } from './tags.js';
import { pickDialog, CASE_PARTS, AFTER_SAVE, RECENT_COUNTS } from './ui-log.js';
import { recentCount as snapRecent } from './logging.js';
import { OPERATOR_HELP } from './search-ops.js';
import { DEFAULT_ACCENT, cleanAccent, SWATCHES, EDIT_TOKENS, cleanColours, colourPalette, colourChecks, checkColours, resolvePalette } from './colors.js';
import { THEMES, FEATURED, THEME_KEYS, themePatch, themeState, themeLabel, TINTS, BANDS, HEAD_FONTS } from './themes.js';
import { COLOURFUL, KEEP_GROUPS, keepGroups, cardsOn } from './look-schema.js';
import { FACETS, FACET_GROUPS, facetDefault, FINE_TUNE, TUNE_KEYS, cleanTune, TAB_ICONS, cleanTabIcons, cleanTintStrength } from './theme-engine.js';
import { WALLPAPERS, cleanWall, dimOf, DIM_MAX, inkOf, INK_MIN, INK_MAX, INK_STEP, savePhoto, getPhoto, deletePhoto, mainColour, colourAt } from './wallpaper.js';
import { cleanMarkdown, storedMarkdown, mdCase, mdDay, reflectionPath, reflectionNote, CASE_FILLINS, REFL_FILLINS, FM_FIELDS, HEAD_STYLES, mdDate, fileDate } from './markdown.js';
import { checkCss } from './custom-css.js';
import { cleanMine, saveMine, minePatch, matchMine, exportText, importText, lookOf, nightRef } from './my-themes.js';
import { FONTS, fontStack, fontAvailable, cleanFontName, logChoice, saveUserFont, getUserFont, deleteUserFont, keepThemeFonts, themeFonts, putThemeFonts, useThemeFonts, dropThemeFonts } from './fonts.js';
import { SWITCHES, switchLabel, switchChanges, applyPatch, resetPatch, tabsAfter } from './profiles.js';
import { PHOTO_BUDGET_KB, PHOTO_NOTE, photoUsageKb, fmtMb } from './reflections.js';
import { partsSettings } from './ui-parts.js';
import { labelsOn } from './parts.js';
import { NAV_STYLES, ROW_LAYOUTS, FORM_LAYOUTS, rowLayoutOf, deviceOn, deviceChanges, deviceReset, DEVICE_SWITCHES } from './device-presets.js';
import { applyThemeLook, applyTheme, cachedTheme, nightShowing, CASE_SIZES, applyCaseSize, TEXT_SIZES, ZOOMS, applyTextSize, applyZoom, applyAccent, display, setDisplay, applyDisplay, LINE_WIDTHS, LINE_HEIGHTS, CONTRASTS, MOTIONS, BUTTON_STYLES, defaultTitle, BORDERS, ROUNDS, roundLevel, BAR_TABS, barTabs, MAX_BAR, arrangeTabs, applyWallpaper, photoChanged, wallDim, setTabOnBar, borderLevel, cleanTitle, IPHONE_APP, START_TABS, CARD_STYLES, cardStyle, cardPatch } from './display.js';
import { resetLink, help, toggle } from './settings-rows.js';
// (the display helpers are still exported from here: the e2e tests import them from this file)
export * from './display.js';

// Settings is a short menu (app.js) of these pages: Themes, Layout, Accessibility, Logging, the Tag editor and more.
// Residency year (for people not on the programme list) is on Account; reflection settings on the
// Reflections tab (#reflset).
export function residencyCard() {
  return (
    S.resident || !shows('year') ? null : h('section', { class: 'card' },
      h('h2', {}, 'Residency year'),
      h('label', { class: 'field' }, 'Year used for the targets on Analytics',
        h('select', { onchange: e => patchLogbook({ settings: { rYear: Number(e.target.value), rYearAY: academicYear() } }).then(() => toast('Saved')) },
          YEAR_NAMES.map((r, i) => h('option', { value: String(i + 1), selected: i + 1 === rYear() }, r)))),
      h('p', { class: 'hint', style: 'margin:4px 0 0' }, 'Programme residents get their year from the programme list automatically. If you are an APMES resident, ask the programme admins to add your email.')));
}

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

// a link to a settings page's own Advanced page, like a row of the More list (never hidden: profiles hide interface
// items, not settings)
export const advancedLink = (id, label, desc) => h('section', { class: 'card more-list more-settings' },
  h('ul', {}, h('li', {}, h('a', { href: '#' + id, 'data-go': id },
    h('span', { class: 'mt' }, h('b', {}, label), h('small', {}, desc)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')))));
export const TAB_BARS = [['auto', 'Bottom on phones, top on bigger screens (default)'], ['top', 'Always at the top'], ['bottom', 'Always at the bottom']];

// a ✓ list for two to five choices (settings rows: settings-rows.js); the pages carry class set-page (style.css)
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
  pick(label, opts, k === 'rowLayout' ? rowLayoutOf(display()) : display()[k] ?? dflt, v => {
    applyDisplay(setDisplay({ [k]: v === dflt ? null : v, ...(k === 'rowLayout' ? { rowShort: null } : {}) }));
    if (['navStyle', 'rowLayout', 'formLayout'].includes(k)) hooks.render();
  }, line, ...more);
const DEVICE_NOTE = () => h('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Everything on this page is saved on this device only, so a phone and a computer can each look the way that suits them.');
const THEME_MODES = [['light', 'Light'], ['dark', 'Dark'], ['oled', 'OLED (pure black)'], ['auto', 'Auto (match the phone)']];
const slider = (label, names, level, dflt, onLevel) => {
  const note = h('span', { class: 'hint', style: 'margin:0' }, names[level]);
  return h('div', { class: 'field', style: 'margin-top:10px' }, h('label', { class: 'field', style: 'margin:0' }, label,
    h('input', { type: 'range', min: '0', max: String(names.length - 1), step: '1', value: String(level), 'aria-label': label, 'aria-valuetext': names[level],
      oninput: e => { const n = Number(e.target.value); e.target.setAttribute('aria-valuetext', names[n]); note.textContent = names[n]; onLevel(n === dflt ? null : n); } })), note);
};

// Settings → Themes (#themes; owner, 15 Oct 2026): ready-made looks (themes.js) and the look settings themselves,
// moved here from Display. Picking a theme sets its bundle of settings at once (Undo in the toast); changing any
// of them afterwards makes it "Custom (based on …)". Everything on this device only.
const themeSwatch = t => {
  const band = t.band || (t.look.band === 'none' ? null : ['#e57200', '#e4002b', '#178fd7', '#002f6c']);
  const dark = !!t.mode && t.mode !== 'auto';
  // (the theme's palette as it will show: colors.js resolvePalette; a theme that keeps the colour shows this device's)
  const look = t.keep && !t.look.accent ? { ...t.look, accent: display().accent } : t.look;
  const { bg, panel, accent } = resolvePalette(look, dark ? 'dark' : 'light', TINTS[t.look.bgTint] || {});
  return h('span', { class: 'theme-sw', 'aria-hidden': 'true', style: `--tb:${bg};--tp:${panel};--ta:${accent}` },
    h('span', { class: 'theme-band' }, (band || [panel, panel, panel, panel]).map(c => h('i', { style: `background:${c}` }))),
    h('span', { class: 'theme-card-in' }, h('i', { class: 'theme-dot' }), h('i', { class: 'theme-line' })));
};
function pickTheme(t) {
  const before = display();
  const patch = themePatch(t, before);
  patch.themeMode = null;   // a theme never changes Light or dark
  applyDisplay(setDisplay(patch));
  hooks.render();
  toast(`Theme: ${t.name}`, { action: 'Undo', onaction: () => {
    applyDisplay(setDisplay(Object.fromEntries([...THEME_KEYS, 'theme', 'themeMode'].map(k => [k, before[k] ?? null]))));
    hooks.render();
  } });
}
let themeQuery = '';
resetters.push(() => { themeQuery = ''; });
const themeCard = (t, theme, custom) => h('button', { type: 'button', class: 'theme-card', 'aria-pressed': String(t.id === theme.id && !custom), onclick: () => pickTheme(t) },
  themeSwatch(t), h('b', {}, t.name));   // (the descriptions are on Browse all themes)
// Settings → Themes → Browse all themes (#themesall): every theme, searchable, and Suggest a theme
function themeFinder() {
  const st = display(), { theme, custom } = themeState(st);
  const list = h('ul', { class: 'theme-list all', role: 'list' });
  const paint = () => {
    const q = themeQuery.trim().toLowerCase();
    const found = THEMES.filter(t => !q || (t.name + ' ' + t.desc).toLowerCase().includes(q));
    fill(list, found.length ? found.map(t => h('li', {}, h('button', { type: 'button', class: 'theme-row', 'aria-pressed': String(t.id === theme.id && !custom), onclick: () => pickTheme(t) },
      themeSwatch(t), h('span', { class: 'mt' }, h('b', {}, t.name), h('small', {}, t.desc))))) : h('li', { class: 'empty' }, 'No theme matches. Suggest one below.'));
  };
  paint();
  return h('div', { class: 'theme-inspired' },
    h('input', { type: 'search', class: 'theme-find', placeholder: 'Find a theme (WhatsApp, Notion, dark…)', 'aria-label': 'Find a theme', value: themeQuery, oninput: e => { themeQuery = e.target.value; paint(); } }),
    list);
}
export function renderThemesAll() {
  const st = display();
  return h('div', { class: 'set-page themes-page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Browse all themes'),
      h('p', { class: 'theme-now' }, 'Now: ', h('b', {}, themeLabel(st))),
      themeFinder(),
      h('div', { class: 'bar', style: 'margin:8px 0 0' }, h('button', { type: 'button', class: 'small', onclick: async () => {
        const m = await import('./ui-feedback.js'); m.setFeedbackDraft?.('Theme suggestion: '); location.hash = '#feedback';
      } }, 'Suggest a theme')),
      help('Inspired by apps, brands and visual traditions: colours, surfaces, shapes and type.')));
}
// Themes (#themes) keeps the essentials; Advanced theme settings (#themesadv) the rest (TE S2, owner 21 Oct 2026).
// Which card is on which page, in what order, is look-schema.js THEME_CARDS (each look setting names its card).
function themeCards(st) {
  const { theme, custom } = themeState(st);
  const set = (k, off = null) => v => applyDisplay(setDisplay({ [k]: v || off }));
  const look = (k, label, opts, dflt, line) => pick(label, opts, st[k] ?? dflt, v => applyDisplay(setDisplay({ [k]: v === dflt ? null : v })) || hooks.render(), line);
  // one theme-engine facet (theme-engine.js): a switch or a ✓ list; the default saves as null
  const facetRow = f => (f.bool ? toggle(f.label, st[f.key], v => { applyDisplay(setDisplay({ [f.key]: v || null })); hooks.render(); }, f.line)
    : look(f.key, f.label, f.choices, facetDefault(f), f.line));
  const facetsOf = g => FACETS.filter(f => f.group === g).map(facetRow);
  return {
    themes: () => h('section', { class: 'card' },
      h('h2', {}, 'Themes'),
      h('p', { class: 'theme-now' }, 'Now: ', h('b', {}, matchMine(st.myThemes, st) && custom ? `${matchMine(st.myThemes, st).name} (yours)` : themeLabel(st))),
      help('A theme sets the colours, light or dark, corners, lines, fonts and spacing in one go. Change anything below afterwards; your changes stay.'),
      h('h3', {}, 'Classic'),
      h('div', { class: 'theme-grid' }, THEMES.filter(t => t.group === 'classic').map(t => themeCard(t, theme, custom))),
      h('h3', {}, 'Inspired'),
      help('Inspired by apps, brands and visual traditions: colours, surfaces, shapes and type.'),
      h('div', { class: 'theme-grid' }, FEATURED.map(id => themeCard(THEMES.find(t => t.id === id), theme, custom))),
      h('div', { class: 'bar', style: 'margin:8px 0 0' }, h('a', { class: 'btn small', href: '#themesall' }, 'Browse all themes')),
      keepCard(st)),
    mine: () => myThemesCard(st, custom),
    colour: () => h('section', { class: 'card' },
      h('h2', {}, 'Colour and light'),
      pick('Light or dark', THEME_MODES, cachedTheme(), v => { applyTheme(v); setDisplay({ themeMode: null }); hooks.render(); }),
      nightPick(st),
      h('div', { class: 'field', style: 'margin-top:10px' }, 'Colour', accentPicker()),
      help('Pastels show as a soft tint, with a deeper shade for text and buttons so everything stays easy to read.'),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Background',
        h('select', { 'aria-label': 'Background', onchange: e => { applyDisplay(setDisplay({ bgTint: e.target.value === 'auto' ? null : e.target.value })); hooks.render(); } },
          Object.entries(TINTS).map(([k, t]) => h('option', { value: k, selected: (st.bgTint || 'auto') === k }, t.label))))),
    wallpaper: () => wallpaperCard(st),
    shape: () => h('section', { class: 'card' },
      h('h2', {}, 'Shape and type'),
      pick('Card style', CARD_STYLES, cardStyle(st), v => { applyDisplay(setDisplay(cardPatch(v))); hooks.render(); }, 'How cards and lists stand off the page. How strong the lines are: Line strength, just below.'),
      // the strength of the lines around cards, fields, buttons and chips (Flat, in Card style, hides them all)
      slider('Line strength', BORDERS, borderLevel(st), BORDERS.length - 1, n => applyDisplay(setDisplay({ borders: n }))),
      slider('Corners', ROUNDS.map(([n]) => n), roundLevel(st), 2, n => applyDisplay(setDisplay({ round: n }))),
      facetsOf('shape'),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Heading font',
        h('select', { 'aria-label': 'Heading font', onchange: e => { applyDisplay(setDisplay({ headFont: e.target.value === 'same' ? null : e.target.value })); hooks.render(); } },
          HEAD_FONTS.map(([k, t]) => h('option', { value: k, selected: (st.headFont || 'same') === k }, t)))),
      fontPicker('ui'),
      fontPicker('log'),
      lookPick('lineHeight', 'Line spacing', LINE_HEIGHTS, '1'),
      h('h3', {}, 'Buttons'),
      lookPick('btnStyle', 'Button style', BUTTON_STYLES, 'outlined', 'The buttons that aren’t the main one on a screen.'),
      toggle('Icons instead of words on common buttons', st.iconBtns, set('iconBtns'), 'Share, Copy, Notes and Filter.', 'Each still says its name to screen readers, and on a computer when you point at it.'),
      toggle('Plain calendar', st.calPlain, set('calPlain'), 'Numbers with the count under them, no tiles.', 'Today in a coloured circle, the day you picked in a dark one.'),
      DEVICE_NOTE()),
    tune: () => fineTuneCard(st),
    header: () => h('section', { class: 'card' },
      h('h2', {}, 'Header and tab bar'),
      h('label', { class: 'field' }, 'Name in the header',
        h('input', { type: 'text', value: st.appTitle || '', placeholder: defaultTitle(), maxlength: '40', 'aria-label': 'Name in the header',
          onchange: e => { const t = cleanTitle(e.target.value); e.target.value = t; applyDisplay(setDisplay({ appTitle: t && t !== defaultTitle() ? t : null })); } })),
      help(`Also the name in the browser tab. Empty: ${defaultTitle()}.`),
      toggle('Page titles in the header', st.pageTitles, set('pageTitles'), '“Logbook”, “Reflections”… instead of the app’s name.'),
      toggle('Hide the header (the app name bar)', st.hideHeader, v => applyDisplay(setDisplay({ hideHeader: v })),
        'It comes back when something needs you.', 'It comes back by itself when something isn’t synced yet, when there’s no signal, and in the demo.'),
      toggle('Icons only in the tab bar', st.tabIcons, v => applyDisplay(setDisplay({ tabIcons: v }))),
      help('Where the tab bar sits and which tabs it shows: ', h('a', { href: '#layout' }, 'Layout'), '.'),
      DEVICE_NOTE()),
    rows: () => h('section', { class: 'card' },
      h('h2', {}, 'Rows and forms'),
      lookPick('navStyle', 'Navigation layout', NAV_STYLES, 'tabs', 'The rail appears above 900 px; smaller windows keep tabs.'),
      lookPick('rowLayout', 'Logbook row layout', ROW_LAYOUTS, 'card'),
      toggle('Shorter Logbook rows', rowLayoutOf(st) === 'compact', v => { applyDisplay(setDisplay({ rowShort: v, rowLayout: null })); hooks.render(); }, 'One line for the case, one grey line of tags, no buttons.', 'The initials and case in bold, the short date at the right. Tap a row to open it; press and hold (Layout) for Copy and Reflect.'),
      lookPick('formLayout', 'Case form layout', FORM_LAYOUTS, 'page'),
      DEVICE_NOTE()),
    details: () => h('section', { class: 'card' },
      h('h2', {}, 'App-style details'),
      help('Finer touches that make the logbook feel like other phone apps. Each is its own setting and off until you choose it.'),
      FACET_GROUPS.filter(([g, title]) => title).map(([g, title]) => [h('h3', {}, title), facetsOf(g), g === 'icons' ? iconExtras(st) : null]),
      DEVICE_NOTE()),
    colours: () => h('section', { class: 'card' },
      h('h2', {}, 'More colour'),
      pick('Colourful', COLOURFUL, st.colourful === true ? 'tabs' : st.colourful || 'off', v => { applyDisplay(setDisplay({ colourful: v === 'off' ? null : v })); hooks.render(); },
        'A colour for each tab.', 'With the default colour, the tabs follow the NUH stripe at the top: Add orange, Logbook red, Reflections cyan, Analytics navy. With another colour: orange, teal, red, blue, purple. “Everything” also colours the buttons, chips and links on that tab’s pages, in shades that stay easy to read.'),
      look('band', 'Top band', BANDS, 'theme', 'The four-colour strip along the top. NUHS keeps the NUH stripe; other themes bring their own.')),
    edit: () => editColours(st),
    css: () => customCssCard(),
  };
}
const themesReset = () => resetLink('the theme and every look setting on Themes and Advanced theme settings (light, the NUHS colours, lines, corners, fonts, spacing, the header and custom CSS: switched off, your CSS is kept) on this device', () => {
  applyTheme('light'); applyDisplay(setDisplay({ ...Object.fromEntries([...THEME_KEYS, 'theme', 'themeMode', 'nightTheme', 'fontUiName', 'fontLogName', 'appTitle', 'hideHeader', 'customCssOn'].map(k => [k, null])) }));
});
export function renderThemes() {
  const cards = themeCards(display());
  return h('div', { class: 'set-page themes-page' },
    displayPreview(),
    // themes live in this browser only (owner, 20 Oct 2026): say so first, with Export to move them
    h('p', { class: 'tip device-only', role: 'note', style: 'display:flex;align-items:center;gap:8px' }, h('span', { class: 'grow' }, 'Themes are kept on this device only.'),
      h('button', { type: 'button', class: 'small', onclick: () => exportThemes(display()) }, 'Export…')),
    cardsOn('themes').map(id => cards[id]()),
    advancedLink('themesadv', 'Advanced theme settings', 'Shape and type, fine-tune, the header and tab bar, rows and forms, app-style details, more colour, edit colours, custom CSS'),
    themesReset());
}
// Settings → Themes → Advanced theme settings (#themesadv)
export function renderThemesAdv() {
  const cards = themeCards(display());
  return h('div', { class: 'set-page themes-page' },
    displayPreview(),
    h('p', { class: 'theme-now' }, 'Now: ', h('b', {}, themeLabel(display()))),
    h('p', { class: 'hint', style: 'margin:0 0 10px' }, 'The finer parts of the look. A theme sets these too; a change here makes it Custom, to save under Your themes on ', h('a', { href: '#themes' }, 'Themes'), '.'),
    cardsOn('themesadv').map(id => cards[id]()),
    themesReset());
}
// Keep when changing theme (owner, 21 Oct 2026; look-schema.js KEEP_GROUPS): the settings that stay yours whichever
// theme you pick, Your themes and the night theme included
function keepCard(st) {
  const on = keepGroups(st);
  return [
    h('h3', {}, 'Keep when changing theme'),
    KEEP_GROUPS.map(([g, label, line]) => toggle(label, on.includes(g), v => {
      setDisplay({ themeKeep: KEEP_GROUPS.map(([k]) => k).filter(k => (k === g ? v : on.includes(k))) }); hooks.render();
    }, line)),
    help('Light or dark, text size and zoom always stay: themes never change them.'),
  ];
}
// Day and night (theme-revamp S5; my-themes.js lookNow): on Auto, a theme of its own for when the phone is dark. The
// rest of this page is the day look; at night it says so, as what's on screen then is the night theme.
function nightPick(st) {
  if (cachedTheme() !== 'auto') return help('Choose Auto to have a different theme when the phone is dark.');
  const mine = cleanMine(st.myThemes), cur = nightRef(st) ? st.nightTheme : '';
  return [
    h('label', { class: 'field', style: 'margin-top:10px' }, 'Theme when the phone is dark',
      h('select', { 'aria-label': 'Theme when the phone is dark', onchange: e => { applyDisplay(setDisplay({ nightTheme: e.target.value || null })); hooks.render(); } },
        h('option', { value: '', selected: !cur }, 'The same as by day (default)'),
        mine.length ? h('optgroup', { label: 'Your themes' }, mine.map(t => h('option', { value: 'mine:' + t.id, selected: cur === 'mine:' + t.id }, t.name))) : null,
        h('optgroup', { label: 'Themes' }, THEMES.map(t => h('option', { value: t.id, selected: cur === t.id }, t.name))))),
    nightShowing() ? h('p', { class: 'tip', role: 'note' }, `The phone is dark, so you’re seeing ${nightRef(st).name}. Changes on this page are to your day look.`)
      : help('By day, the look set on this page; when the phone turns dark, this theme.'),
  ];
}
// Wallpaper (theme-revamp S4; wallpaper.js): a pattern or your own photo behind every page, how much the page colour
// dims it, how strong a pattern is and see-through cards (TE S3). The photo stays on this device; tap it to take a
// colour from it (or its main colour) for the accent.
function wallpaperCard(st) {
  const w = cleanWall(st.wallpaper) || 'none';
  const say = () => { const { dim, scrim } = wallDim(); const n = Math.round(dim * 100), raised = n > dimOf(display());
    return raised ? `${n}% (raised so text stays easy to read: Flat cards put text on the picture)` : `${n}%${scrim > 0 ? '. Text between cards gets a soft backing.' : ''}`; };
  const note = h('span', { class: 'hint', style: 'margin:0', 'aria-live': 'polite' }, say());
  const dim = h('input', { type: 'range', min: '0', max: String(DIM_MAX), step: '5', value: String(dimOf(st)), 'aria-label': 'Dim the wallpaper', 'aria-valuetext': `${dimOf(st)}%`,
    oninput: e => { const v = Number(e.target.value); e.target.setAttribute('aria-valuetext', `${v}%`); applyWallpaper(setDisplay({ wallDim: v })); note.textContent = say(); } });
  const inkSay = v => `${Math.round((v - INK_MIN) / INK_STEP) + 1} of ${(INK_MAX - INK_MIN) / INK_STEP + 1}`;
  const inkNote = h('span', { class: 'hint', style: 'margin:0', 'aria-live': 'polite' }, inkSay(inkOf(st)));
  const ink = h('input', { type: 'range', min: String(INK_MIN), max: String(INK_MAX), step: String(INK_STEP), value: String(inkOf(st)), 'aria-label': 'Pattern strength', 'aria-valuetext': inkSay(inkOf(st)),
    oninput: e => { const v = Number(e.target.value); e.target.setAttribute('aria-valuetext', inkSay(v)); inkNote.textContent = inkSay(v); applyThemeLook(setDisplay({ wallInk: v === INK_MIN ? null : v })); applyWallpaper(); note.textContent = say(); } });
  const thumb = h('img', { class: 'wall-thumb', alt: 'Your wallpaper photo. Tap it to use a colour from it.', hidden: true });
  const fileNote = h('span', { class: 'hint' });
  const useColour = (c, how) => { if (!c) return toast('No clear colour there'); applyDisplay(setDisplay({ accent: c === DEFAULT_ACCENT ? null : c })); toast(`Colour ${how}: ${c}`); hooks.render(); };
  thumb.onclick = e => { const r = thumb.getBoundingClientRect(); useColour(colourAt(thumb, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height), 'from the photo'); };
  const mainBtn = h('button', { type: 'button', class: 'small', hidden: true }, 'Use its main colour');
  const removeBtn = h('button', { type: 'button', class: 'small linkish', hidden: true, onclick: async () => {
    await deletePhoto(); photoChanged(null); applyDisplay(setDisplay({ wallpaper: null, wallDim: null })); hooks.render(); toast('Photo removed from this device');
  } }, 'Remove');
  const showRec = rec => {
    for (const el of [thumb, mainBtn, removeBtn]) el.hidden = !rec;
    fileNote.textContent = rec ? rec.name : 'No photo chosen yet.';
    if (rec) { if (thumb.src) URL.revokeObjectURL(thumb.src); thumb.src = URL.createObjectURL(rec.blob); mainBtn.onclick = () => useColour(mainColour(rec.samples), 'from the photo'); }
  };
  const fileBtn = fileButton('Choose a photo…', 'image/*', async file => {
    try { const rec = await savePhoto(file); photoChanged(rec); applyDisplay(setDisplay({ wallpaper: 'photo' })); showRec(rec); note.textContent = say(); toast('Wallpaper kept on this device'); }
    catch (err) { toast(err.message); }
  }, 'btn small');
  const photoRow = h('div', { hidden: w !== 'photo', style: 'margin:6px 0 0' }, h('div', { class: 'bar', style: 'margin:0' }, fileBtn, mainBtn, removeBtn), fileNote, thumb,
    h('p', { class: 'hint', style: 'margin:2px 0 0' }, 'Kept on this device only, made smaller first, never uploaded or synced. Tap the photo to make the colour you tap your colour.'));
  if (w === 'photo') getPhoto().then(showRec);
  return h('section', { class: 'card wallpaper' },
    h('h2', {}, 'Wallpaper'),
    pick('Wallpaper', WALLPAPERS, w, v => { applyDisplay(setDisplay({ wallpaper: v === 'none' ? null : v })); hooks.render(); },
      'Behind every page. Cards stay solid unless you make them see-through below.'),
    photoRow,
    h('div', { class: 'field', style: 'margin-top:10px', hidden: w === 'none' }, h('label', { class: 'field', style: 'margin:0' }, 'Dim', dim), note,
      help('The page colour laid over the wallpaper. Text between cards gets its own soft backing when the picture would make it hard to read.')),
    h('div', { class: 'field', style: 'margin-top:10px', hidden: w === 'none' || w === 'photo' }, h('label', { class: 'field', style: 'margin:0' }, 'Pattern strength', ink), inkNote),
    h('div', { hidden: w === 'none' }, toggle('See-through cards', st.wallFrost, on => { applyWallpaper(setDisplay({ wallFrost: on || null })); note.textContent = say(); },
      'Cards let the wallpaper show through, softly blurred. They stay solid enough to read, and solid on phones that can’t blur.')),
    DEVICE_NOTE());
}
// Icons (App-style details; theme-revamp S4): a tint for every icon and an icon of your choice for each tab
function iconExtras(st) {
  const tint = cleanAccent(st.iconTint);
  const strength = cleanTintStrength(st.iconTintStrength) ?? 100;
  const sNote = h('span', { class: 'hint', style: 'margin:0' }, `${strength}%`);
  const chosen = cleanTabIcons(st.tabIcon);
  const setIcon = (id, v) => { const t = { ...chosen }; if (v === 'default') delete t[id]; else t[id] = v; applyDisplay(setDisplay({ tabIcon: Object.keys(t).length ? cleanTabIcons(t) : null })); hooks.paintTabs?.(); hooks.render(); };
  const svg = d => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('class', 'ico'); el.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d || ''); el.append(p); return el; };
  const tabPath = id => (chosen[id] ? TAB_ICONS[chosen[id]][1] : document.querySelector(`.tabs [data-tab="${id}"] path`)?.getAttribute('d'));
  const { shown } = arrangeTabs(barTabs().map(([k]) => k), st);
  return [
    h('div', { class: 'field', style: 'margin-top:10px' }, 'Icon tint',
      h('div', { class: 'bar', style: 'margin:4px 0 0' },
        h('button', { type: 'button', class: 'swatch' + (tint ? ' on' : ''), style: `--sw:${tint || '#6d4fc2'}`, 'aria-label': 'Icon tint colour', title: tint || 'Off',
          onclick: async () => { const c = await sheet({ title: 'Icon tint', value: tint || '#6d4fc2', shade: true, note: null }); if (c) { applyDisplay(setDisplay({ iconTint: c })); hooks.render(); } } }),
        tint ? h('button', { type: 'button', class: 'small linkish', onclick: () => { applyDisplay(setDisplay({ iconTint: null, iconTintStrength: null })); hooks.render(); } }, 'Off') : h('span', { class: 'hint', style: 'margin:0' }, 'Off')),
      help('One colour mixed into every icon (not the tab you’re on), as iPhone’s tinted icons. It is made deep or light enough to show in light and dark.')),
    tint ? h('div', { class: 'field', style: 'margin-top:6px' }, h('label', { class: 'field', style: 'margin:0' }, 'Tint strength',
      h('input', { type: 'range', min: '10', max: '100', step: '10', value: String(strength), 'aria-label': 'Tint strength', 'aria-valuetext': `${strength}%`,
        oninput: e => { const v = Number(e.target.value); e.target.setAttribute('aria-valuetext', `${v}%`); sNote.textContent = `${v}%`; applyThemeLook(setDisplay({ iconTintStrength: v === 100 ? null : v })); } })), sNote) : null,
    h('details', { class: 'tab-icons', style: 'margin-top:10px', open: Object.keys(chosen).length > 0 }, h('summary', {}, 'An icon for each tab'),
      shown.map(id => h('div', { class: 'tab-icon-row', 'data-tab-icon': id }, svg(tabPath(id)),
        h('label', { class: 'field' }, BAR_TABS.find(([k]) => k === id)?.[1] || id,
          h('select', { 'aria-label': `Icon for ${BAR_TABS.find(([k]) => k === id)?.[1] || id}`, onchange: e => setIcon(id, e.target.value) },
            h('option', { value: 'default', selected: !chosen[id] }, 'Its own (default)'),
            Object.entries(TAB_ICONS).map(([k, [label]]) => h('option', { value: k, selected: chosen[id] === k }, label)))))),
      help('The tabs on your bar; a theme can choose them too.')),
  ];
}
// Fine-tune (theme-revamp S2): a slider for each single size (theme-engine.js FINE_TUNE), unset until moved; the
// page changes as it moves (the tune layer of the look's style sheet). Reset puts them all back to unset.
function fineTuneCard(st) {
  const row = t => {
    const v0 = cleanTune(t.key, st[t.key]);
    const say = v => (v == null ? 'Not set' : `${v}${t.unit}`);
    const note = h('span', { class: 'hint', style: 'margin:0' }, say(v0));
    const input = h('input', { type: 'range', min: String(t.min), max: String(t.max), step: String(t.step), value: String(v0 ?? t.from), 'aria-label': t.label, 'aria-valuetext': say(v0),
      oninput: e => { const v = cleanTune(t.key, Number(e.target.value)); note.textContent = say(v); e.target.setAttribute('aria-valuetext', say(v)); applyThemeLook(setDisplay({ [t.key]: v })); } });
    return h('div', { class: 'field tune-row', style: 'margin-top:10px', 'data-tune': t.key }, h('label', { class: 'field', style: 'margin:0' }, t.label, input), note, t.line ? help(t.line) : null);
  };
  return h('section', { class: 'card fine-tune' },
    h('h2', {}, 'Fine-tune'),
    help('Single sizes over the spacing above. Each is off until you move its slider; a theme can set them too. Bigger tap targets (Accessibility) keep Add tab buttons at 44 px or more.'),
    FINE_TUNE.map(row),
    h('div', { class: 'bar', style: 'margin:10px 0 0' }, h('button', { type: 'button', class: 'small', onclick: () => { applyThemeLook(setDisplay(Object.fromEntries(TUNE_KEYS.map(k => [k, null])))); hooks.render(); } }, 'Reset Fine-tune')),
    DEVICE_NOTE());
}
// Draft both palettes together, so a foreground and background can be changed before checking Save.
function editColours(st) {
  let side = 'light', draft = cleanColours(st.colours);
  const body = h('div', {}), report = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const buttons = {};
  const state = () => ({ ...st, colours: draft });
  const tint = TINTS[st.bgTint] || {};
  const paintReport = () => {
    const checks = colourChecks(state(), tint).filter(p => p.side === side);
    report.textContent = checks.map(p => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)}:1${p.ratio < p.need ? ` (needs ${p.need}:1)` : ''}`).join('; ');
  };
  const paint = () => {
    for (const mode of ['light', 'dark']) buttons[mode].setAttribute('aria-pressed', String(mode === side));
    const palette = colourPalette(state(), side, tint);
    const sayFor = k => c => colourChecks({ ...st, colours: { ...draft, [side]: { ...draft[side], [k]: c } } }, tint).filter(p => p.side === side && (p.fg === k || p.bg === k))
      .map(p => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)}:1${p.ratio < p.need ? ` (needs ${p.need}:1)` : ''}`).join('; ') || 'Not checked for contrast.';
    fill(body, EDIT_TOKENS.map(k => {
      const name = `${side === 'light' ? 'Light' : 'Dark'} ${k}`;
      const picker = h('button', { type: 'button', class: 'swatch token-swatch', style: `--sw:${palette[k]}`, 'aria-label': name, title: palette[k], onclick: async () => {
        const c = await sheet({ title: name, value: palette[k], note: sayFor(k) });
        if (!c) return;
        draft[side] = { ...draft[side], [k]: c }; paint();
      } });
      const reset = h('button', { type: 'button', class: 'small', disabled: !draft[side]?.[k], 'aria-label': `Reset ${k}`, onclick: () => {
        delete draft[side][k]; draft = cleanColours(draft); paint();
      } }, 'Reset');
      return h('div', { class: 'bar', style: 'margin:8px 0;justify-content:space-between' }, h('span', { class: 'bar' }, picker, k, h('small', { class: 'hint', style: 'margin:0' }, palette[k])), reset);
    }));
    paintReport();
  };
  const modes = h('div', { class: 'seg', 'aria-label': 'Palette to edit' }, ['light', 'dark'].map(mode => {
    buttons[mode] = h('button', { type: 'button', onclick: () => { side = mode; paint(); } }, mode === 'light' ? 'Light' : 'Dark');
    return buttons[mode];
  }));
  const save = () => {
    try {
      checkColours(state(), tint);
      const colours = cleanColours(draft);
      applyDisplay(setDisplay({ colours: Object.keys(colours).length ? colours : null })); hooks.render(); toast('Colours saved');
    } catch (err) { report.textContent = `Colours not saved. ${err.message}`; }
  };
  paint();
  return h('section', { class: 'card' }, h('h2', {}, 'Edit colours'),
    help('Edit light and dark separately. Reset uses the accent and background again. Text needs 4.5:1 contrast; existing colours stay as they are until you save. fill and onFill are filled buttons and their words, link the links, focus the ring round what the keyboard is on (3:1), selection selected text: each follows the accent until you set it.'),
    modes, body, report, h('button', { type: 'button', onclick: save }, 'Save colours'));
}

// Your themes (owner, 16 Oct 2026; my-themes.js): once anything on this page changes the look is Custom, and this card
// offers to keep it under a name. Saved themes are picked like any other; Export and Import move them as a file.
// Export: your themes, or with none saved the look you have now, as a file (also at the top of Themes)
async function exportThemes(st) {
  const mine = cleanMine(st.myThemes), list = mine.length ? mine : [{ id: 'now', name: themeLabel(st).slice(0, 40), look: lookOf(st) }];
  // an uploaded font goes in the file with its theme (theme-revamp S5), so the theme looks the same on the other phone
  const fonts = {};
  for (const t of list) { const f = await themeFonts(t).catch(() => ({})); if (Object.keys(f).length) fonts[t.id] = f; }
  download('my-logbook-themes.json', new Blob([exportText(list, fonts)], { type: 'application/json' }));
  toast(mine.length ? 'Themes saved as a file' : 'This look saved as a file');
}
function myThemesCard(st, custom) {
  const mine = cleanMine(st.myThemes), now = matchMine(mine, st);
  const put = list => { setDisplay({ myThemes: list.length ? list : null }); hooks.render(); };
  const name = h('input', { type: 'text', maxlength: '40', 'aria-label': 'Name for this look', placeholder: 'e.g. Night shift', value: now ? now.name : '' });
  const save = () => {
    try {
      const list = saveMine(display().myThemes, name.value, display(), cachedTheme());
      put(list); keepThemeFonts(list[0]).catch(() => {}); toast(`Saved as “${name.value.trim()}”`);
    }
    catch (err) { toast(err.message); }
  };
  const use = t => {
    const before = display();
    applyDisplay(setDisplay(minePatch(t, display()))); hooks.render();
    useThemeFonts(t).catch(() => {});   // its own uploaded font, if it has one
    toast(`Theme: ${t.name}`, { action: 'Undo', onaction: () => { applyDisplay(setDisplay(Object.fromEntries([...THEME_KEYS, 'theme'].map(k => [k, before[k] ?? null])))); hooks.render(); } });
  };
  const drop = t => {
    const before = display().myThemes;
    put(cleanMine(before).filter(x => x.id !== t.id));
    toast(`Deleted “${t.name}”`, { action: 'Undo', onaction: () => put(cleanMine(before)) });
    setTimeout(() => { if (!cleanMine(display().myThemes).some(x => x.id === t.id)) dropThemeFonts(t.id); }, 35000);   // its font copy, once Undo has gone
  };
  const importBtn = fileButton('Import…', '.json,application/json', async file => {
    try {
      const r = importText(await file.text(), display().myThemes);
      for (const [id, f] of Object.entries(r.fonts)) await putThemeFonts(id, f).catch(() => {});
      put(r.list); toast(`${r.added} theme${r.added === 1 ? '' : 's'} added`);
    }
    catch (err) { toast(err.message); }
  }, 'btn small');
  return h('section', { class: 'card my-themes' },
    h('h2', {}, 'Your themes'),
    custom && !now ? h('p', { class: 'tip', role: 'note' }, 'You’ve changed this theme: it’s now Custom. Save it to pick it again later.')
      : help('Change anything on this page, then save the look here under a name of your own.'),
    h('div', { class: 'bar', style: 'margin:6px 0 0' }, name, h('button', { type: 'button', class: custom && !now ? 'primary' : '', onclick: save }, now ? 'Save changes' : 'Save this look')),
    mine.length ? h('ul', { class: 'theme-list', role: 'list', style: 'margin-top:10px' }, mine.map(t => h('li', { class: 'my-theme' },
      h('button', { type: 'button', class: 'theme-row', 'aria-pressed': String(!!now && now.id === t.id), onclick: () => use(t) },
        themeSwatch({ look: t.look, mode: t.mode === 'dark' || t.mode === 'oled' ? t.mode : null }), h('span', { class: 'mt' }, h('b', {}, t.name), h('small', {}, t.mode ? `Yours · ${t.mode}` : 'Yours'))),
      h('button', { type: 'button', class: 'small icon-btn', 'aria-label': `Delete ${t.name}`, title: 'Delete', onclick: () => drop(t) }, '×')))) : null,
    h('div', { class: 'bar', style: 'margin:10px 0 0' },
      h('button', { type: 'button', class: 'small', onclick: () => import('./ui-theme-link.js').then(m => m.shareThemeDialog(now ? { ...now, look: lookOf(st) } : { name: themeLabel(st).slice(0, 40), look: lookOf(st), mode: cachedTheme() })) }, 'Share as a link…'),
      h('button', { type: 'button', class: 'small', onclick: () => exportThemes(st) }, 'Export…'), importBtn),
    help('Share as a link: send the look you have now in WhatsApp or an email; whoever opens it sees it and taps Use. Export saves your themes (or, with none saved, the look you have now) as a file to keep or send to someone; Import adds themes from such a file. Only look settings travel, never cases or names.'));
}

// Settings → Layout (#layout; theme-revamp S3, 21 Oct 2026): how the app works on this device, where Themes is how it
// looks. Took over Display and Advanced display with Themes (old links land on the new page: navigation.js MOVED_SETTINGS), and the
// gestures and keyboard from Accessibility.
export function renderLayout() {
  const st = display();
  const set = (k, off = null) => v => applyDisplay(setDisplay({ [k]: v || off }));
  return h('div', { class: 'set-page' },
    displayPreview(),
    h('section', { class: 'card' },
      h('h2', {}, 'Layout'),
      help('How the app works on this device. How it looks (colours, fonts, spacing, the header) is in ', h('a', { href: '#themes' }, 'Themes'), '.'),
      // the tab the app opens on (a link or shortcut to a tab still opens that tab)
      pick('Open the app on', START_TABS, st.startTab || 'log', v => { setDisplay({ startTab: v }); toast('Saved'); }),
      h('h3', {}, 'Tab bar'),
      lookPick('tabBar', 'Tab bar', TAB_BARS, 'auto'),
      tabArranger(),
      h('h3', {}, 'Logbook rows'),
      toggle('Fewer buttons on Logbook rows (a ⋯ menu)', st.rowMenu, set('rowMenu'), 'Copy and Reflect move into one ⋯ button.', 'A ✓ still shows cases with a reflection.'),
      toggle('Copy button on each Logbook row', st.rowCopy, set('rowCopy'), 'Off unless you switch it on.', 'The ⋯ menu, if you use it, still copies one case.'),
      toggle('Copy button for each day', st.dayCopy, set('dayCopy'), 'Beside Share when you pick a day in the calendar.', 'Off unless you switch it on. Share already sends the whole day (or copies it, where sharing isn’t possible).'),
      h('h3', {}, 'Page'),
      lookPick('lineWidth', 'Page width', LINE_WIDTHS, 'normal', 'How wide the app gets on a computer or tablet.', 'Was “Line width”. Phones always use the full screen. The Add tab keeps its two panes.'),
      h('h3', {}, 'Add tab layout'),
      toggle('Add tab upside down (phones)', st.caseInverted, v => applyDisplay(setDisplay({ caseInverted: v })),
        'The case box at the bottom, by the keyboard, like a chat app.', 'Save sits beside it and the suggestions just above it; scroll up for all the tags.'),
      toggle('Pin the case box at the top of the Add tab', st.pinBox, set('pinBox')),
      toggle('Pin the search box at the top of the Logbook and Reflections', st.pinSearch, set('pinSearch'), 'They stay in view while the list scrolls under them.'),
      h('h3', {}, 'Gestures'),
      toggle('Swipe left or right to change tab', st.swipeTabs !== false, v => applyDisplay(setDisplay({ swipeTabs: v ? null : false })),
        'The page follows your finger to the next tab.', 'On unless you switch it off. Also from pages under a tab. Not while typing, from the screen’s edges, or on tables and lists that scroll sideways.'),
      toggle('Swipe from the left edge to go back (iPhone app)', st.edgeBack !== false, v => applyDisplay(setDisplay({ edgeBack: v ? null : false })),
        IPHONE_APP() ? 'From a page under a tab, drag from the left edge.' : 'Only in the app added to an iPhone or iPad home screen.',
        IPHONE_APP() ? 'On unless you switch it off.' : 'Android phones use their own Back gesture from the edges.'),
      toggle('Press and hold a Logbook row for its menu', st.rowHold, v => applyDisplay(setDisplay({ rowHold: v || null })), 'Copy, Reflect and Edit, without the row’s buttons.', 'Hold for half a second without moving. A right-click does the same on a computer.'),
      h('h3', {}, 'Keyboard'),
      // the device's own value, else the profile's default (device-presets.js: on in the Personal profile)
      toggle('Hide the tab bar while typing', deviceOn(st, profile(), 'hideTabsTyping'), v => { applyDisplay(setDisplay({ hideTabsTyping: v })); toast('Saved on this device'); },
        'Phones: more room above the keyboard for the box you’re typing in and its Save button.', 'The tab bar comes back when the keyboard goes down. Off unless you switch it on (on in the Personal profile).'),
      DEVICE_NOTE()),
    resetLink('the start tab, the tab bar (place, order and hidden tabs), the Logbook row buttons, the page width, upside down, pinning, the gestures and the tab bar while typing on this device', () =>
      applyDisplay(setDisplay({ startTab: null, tabBar: null, tabOrder: null, tabHidden: null, rowMenu: null, rowCopy: null, dayCopy: null, lineWidth: null, caseInverted: null, pinBox: null, pinSearch: null, swipeTabs: null, edgeBack: null, rowHold: null, hideTabsTyping: null }))));
}
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
      pick('Case text size', CASE_SIZES, String(st.caseSize || '1'), v => { applyCaseSize(v); setDisplay({ caseSize: v === '1' ? null : v }); }, 'The case box and the cases in the Logbook, apart from the rest.'),
      toggle('Bigger tap targets on the Add tab', st.bigTaps, v => applyDisplay(setDisplay({ bigTaps: v || null })), 'Larger chips, tag rows, tick boxes and Save buttons.'),
      h('h3', {}, 'Contrast and motion'),
      lookPick('contrast', 'Contrast', CONTRASTS, 'auto', 'Higher: darker text and stronger lines (lighter in dark mode).'),
      lookPick('motion', 'Motion', MOTIONS, 'auto', 'Reduce: pages, folds and swipes switch at once instead of sliding.'),
      help('Swiping, press and hold, and the tab bar while typing are in ', h('a', { href: '#layout' }, 'Layout'), '.'),
      h('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Everything on this page is saved on this device only.')),
    resetLink('zoom, text size, case text size, bigger tap targets, contrast and motion on this device', () =>
      applyDisplay(setDisplay({ zoom: null, textSize: null, caseSize: null, bigTaps: null, contrast: null, motion: null }))));
}
// Layout → the tab bar's order and hidden tabs (arrangeTabs): ↑ ↓ to move, a switch to show or hide
function tabArranger() {
  const wrap = h('div', { class: 'tab-arranger field', style: 'margin-top:10px' });
  const paint = () => {
    const { sorted: order, hidden } = arrangeTabs(barTabs().map(([id]) => id), display());
    const move = (id, by) => { const o = [...order], i = o.indexOf(id), j = i + by; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; applyDisplay(setDisplay({ tabOrder: o })); hooks.paintTabs?.(); paint(); };
    const hideSet = new Set(hidden);
    const toggle = (id, show) => setTabOnBar(id, show, paint);
    fill(wrap, h('span', {}, 'Tabs on the bar'),
      h('p', { class: 'hint', style: 'margin:2px 0 6px' }, 'Also on the More page: Edit, to drag the bar and More’s own list. ', h('a', { href: '#more' }, 'Open More')),
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

// suggested colours, then More colours… (TE S2: the colour sheet, ui-colour-sheet.js, instead of the phone's own picker,
// which shows only a few); Default goes back to the app's navy
const sheet = opts => import('./ui-colour-sheet.js').then(m => m.colourSheet(opts));
function accentPicker() {
  const cur = cleanAccent(display().accent) || DEFAULT_ACCENT;
  const set = c => { applyDisplay(setDisplay({ accent: c === DEFAULT_ACCENT ? null : c })); hooks.render(); };   // (also redoes the Colourful shades)
  const known = SWATCHES.some(([, list]) => list.some(([c]) => c === cur));
  return h('div', { class: 'swatches' },
    SWATCHES.map(([group, list]) => h('div', { class: 'swatch-row', role: 'group', 'aria-label': group }, h('span', { class: 'swatch-group' }, group),
      list.map(([c, name]) => h('button', { type: 'button', class: 'swatch', style: `--sw:${c}`, title: name, 'aria-label': name, 'aria-pressed': String(c === cur), onclick: () => set(c) })))),
    h('div', { class: 'swatch-row' }, h('span', { class: 'swatch-group' }, 'Your own'),
      h('button', { type: 'button', class: 'swatch custom' + (known ? '' : ' on'), style: known ? '' : `--sw:${cur}`, title: 'Any colour', 'aria-label': known ? 'More colours' : `More colours (now ${cur})`,
        onclick: async () => { const c = await sheet({ title: 'Colour', value: cur, shade: true, onPreview: applyAccent }); if (c) set(c); } }),
      h('span', { class: 'hint', style: 'margin:0' }, 'More colours…')));
}

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
  // the preview's reflections and linked notes: yours, or the made-up one on the made-up day; Link and Embed show the
  // reflection's note as the export and Sync name it
  const reflsOf = c => { const mine = (S.reflections || []).filter(r => r.caseId === c.id); return mine.length ? mine : c.id === 's1' ? [{ ...SAMPLE_REFL, caseId: 's1' }] : []; };
  const ctx = { catName, catShort, labels: labelsOn(settings()), reflectionsOf: reflsOf, notesOf: c => (Array.isArray(S.notes) ? S.notes : []).filter(n => n.caseId === c.id) };
  // the day heading's style (Plain by default); Custom shows the heading's box. The date formats: presets or a pattern,
  // each with a live example
  const headBox = area('dayHead', 'Your day heading', 1), oneBox = area('oneCase', 'One case', 3);
  const headWrap = h('div', { hidden: m.dayHeadStyle !== 'custom' }, lbl('Your heading', headBox, 'For example ## {{date}} or ## [[{{date}}]].'));
  const headPick = pick('dayHeadStyle', 'Day heading', [['plain', 'Plain (2026-10-10)'], ['heading', 'Heading (# 2026-10-10)'], ['link', 'Link to the day’s note ([[2026-10-10]])'], ['custom', 'Custom…']]);
  headPick.querySelector('select').addEventListener('change', () => {
    if (m.dayHeadStyle !== 'custom') { m.dayHead = HEAD_STYLES[m.dayHeadStyle]; const one = cleanMarkdown({ ...m, oneCase: '' }).oneCase; if (!oneTyped) { m.oneCase = one; oneBox.value = one; } }
    headBox.value = m.dayHead; headWrap.hidden = m.dayHeadStyle !== 'custom'; paint();
  });
  let oneTyped = !Object.values(HEAD_STYLES).some(t => m.oneCase === `${t}\n{{initials}}\n{{details}}`);
  oneBox.addEventListener('input', () => { oneTyped = true; });
  const patternBox = (k, label) => h('input', { type: 'text', value: m[k] || '', 'aria-label': label, spellcheck: 'false', placeholder: 'ddd D MMM YYYY', style: mono, oninput: e => { m[k] = e.target.value; paint(); } });
  const datePat = h('div', { hidden: m.dateFormat !== 'custom' }, lbl('Date pattern', patternBox('datePattern', 'Date pattern'), 'YYYY 2026 · YY 26 · MMMM October · MMM Oct · MM 10 · M 10 · DD 05 · D 5 · dddd Saturday · ddd Sat · [text] as typed.'));
  const filePat = h('div', { hidden: m.fileDate !== 'custom' }, lbl('File date pattern', patternBox('fileDatePattern', 'File date pattern')));
  const dateEx = h('p', { class: 'hint', style: 'margin:4px 0 0', 'aria-live': 'polite' });
  const datePick = pick('dateFormat', 'Dates ({{date}})', [['iso', '2026-10-10'], ['compact', '20261010'], ['long', '10 Oct 2026'], ['wlong', 'Sat 10 Oct 2026'], ['dmy', '10/10/2026'], ['custom', 'Custom pattern…']]);
  const filePick = pick('fileDate', 'File names and link targets', [['same', 'As the dates'], ['iso', '2026-10-10'], ['compact', '20261010'], ['long', '10 Oct 2026'], ['wlong', 'Sat 10 Oct 2026'], ['custom', 'Custom pattern…']]);
  datePick.querySelector('select').addEventListener('change', () => { datePat.hidden = m.dateFormat !== 'custom'; });
  filePick.querySelector('select').addEventListener('change', () => { filePat.hidden = m.fileDate !== 'custom'; });
  const paint = () => {
    const f = cleanMarkdown(m);
    ctx.reflPath = r => reflectionPath(r, f);
    dateEx.textContent = `10 Oct 2026 is written ${mdDate('2026-10-10', f)}; its day note is named ${fileDate('2026-10-10', f)}.md.`;
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
      headPick, h('p', { class: 'hint help', style: 'margin:4px 0 0' }, 'Plain by default. Sync (Settings → Sync) writes a new heading into each synced day the next time it runs; your own edits there stay.'), headWrap,
      lbl('Each case in a day', area('dayCase', 'Each case in a day', 3), 'A blank line goes between cases when each takes more than one line.'),
      fillins(CASE_FILLINS),
      lbl('A day’s notes (More → Notes)', area('dayNotes', 'A day’s notes', 2), 'Follows the cases when the day has notes. {{notes}} is each note (### title, then its text). Or put {{notes}} in the day heading to place them there.'),
      pick('reflInDay', 'Reflections under their case', [['none', 'None (default)'], ['link', 'Link to the reflection note'], ['embed', 'Embed it (Obsidian ![[…]])'], ['full', 'Full text']]),
      h('p', { class: 'hint help', style: 'margin:4px 0 0' }, 'Link and Embed point to the reflection’s own note: in the Markdown export, and in Sync where “Also sync reflection notes” is on. Copy, Share and Send to have no such note, so they give the full text.'),
      pick('notesInDay', 'Linked notes under their case', [['none', 'None (default)'], ['full', 'Full text']]),
      h('div', { class: 'hint', style: 'margin:8px 0 2px' }, latest ? 'Preview (your latest day)' : 'Preview'), dayOut,
      lbl('One case', oneBox),
      h('div', { class: 'hint', style: 'margin:8px 0 2px' }, 'Preview'), oneOut,
      h('h3', { style: 'margin:14px 0 0' }, 'Dates, tags and links'),
      datePick, datePat, filePick, filePat, dateEx,
      pick('cats', 'Tags ({{categories}})', [['names', 'Names (Lower Segment Caesarean Section)'], ['codes', 'Codes (16)'], ['tags', '#tags (#LSCS)']]),
      pick('links', 'Links between notes', [['wiki', 'Wiki links [[note]] (Obsidian)'], ['md', 'Markdown links [note](note.md)']]),
      // labelled parts (Settings → Advanced logging): "Plan: GA" written as "**Plan:** GA" in {{details}}; off by default
      h('label', { class: 'check', style: 'margin-top:10px' }, h('input', { type: 'checkbox', checked: m.boldLabels, onchange: e => { m.boldLabels = e.target.checked; paint(); } }), 'Bold labels (**Plan:** GA)'),
      h('p', { class: 'hint help', style: 'margin:0' }, settings().labelParts ? 'Labelled parts in your cases (lp:, Plan: …) come out as **Label:** text.' : 'For labelled parts (Settings → Advanced logging), which are off.')),
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

// Pasted list format (owner, 19 Oct 2026): for a list that has no empty lines between cases. The start text says where a
// case begins ({n} a number, {initials}, {date}, {any}); skip and end texts trim each case. "Try it" shows what a pasted
// sample would become, using the same parser as the List box. Nothing typed in the sample is saved.
function listFormatCard(st, save) {
  const fmt = () => cleanListFormat(settings().listFormat) || {};
  const out = h('div', { class: 'list-format-try', 'aria-live': 'polite' });
  let sample = '';
  const paint = () => {
    const f = cleanListFormat(settings().listFormat);
    if (!sample.trim()) { fill(out); return; }
    const rows = parseBulk(sample, null, undefined, { format: f });
    fill(out, h('p', { class: 'hint' }, rows.length + (rows.length === 1 ? ' case' : ' cases') + ' found.'),
      rows.slice(0, 20).map((r, i) => h('p', { class: 'hint', style: 'margin:2px 0' }, (i + 1) + '. ' + (r.date ? r.date + ' · ' : '') + (r.initials ? r.initials + ' · ' : '') + r.details.replace(/\s+/g, ' ').slice(0, 70) + (r.details.length > 70 ? '…' : ''))),
      rows.length > 20 ? h('p', { class: 'hint' }, '…and ' + (rows.length - 20) + ' more.') : null);
  };
  const store = (patch, note) => { const f = cleanListFormat({ ...fmt(), ...patch }); return save({ listFormat: f }, note).then(paint); };
  const warn = h('p', { class: 'hint', style: 'color:var(--err)' });
  const startIn = h('input', { type: 'text', value: fmt().start || '', placeholder: 'e.g. {n}. === {initials} (', maxlength: '80', autocomplete: 'off', 'aria-describedby': 'lf-help',
    onchange: e => { warn.textContent = e.target.value.trim() && !startUsable(e.target.value) ? 'Add some fixed text too, such as "===" or "Case"; the start text can’t be only {…} parts.' : ''; if (warn.textContent) return; store({ start: e.target.value }, 'Saved'); } });
  return h('div', {},
    h('h3', {}, 'Pasted list format'),
    h('p', { class: 'hint' }, 'Account settings · follow you between devices.'),
    help('Only if your list has no empty line between cases. Say how a case starts and the List box splits it there. Leave empty to keep the usual way.'),
    h('label', { class: 'field' }, 'A case starts with', startIn),
    h('p', { class: 'hint help', id: 'lf-help' }, '{n} is a number, {initials} and {date} are read into those boxes, {any} is anything else on the same line. Example: "1. === AAB (60/M …" starts with {n}. === {initials} ( . Text before the first start is left out.'),
    warn,
    h('label', { class: 'field' }, 'Skip this many characters at the start of each case',
      h('input', { type: 'number', min: '0', max: '200', inputmode: 'numeric', value: String(fmt().skip || 0), onchange: e => store({ skip: e.target.value }, 'Saved') })),
    h('label', { class: 'field' }, 'Drop these from the end of each case',
      h('input', { type: 'text', value: fmt().dropEnd || '', placeholder: 'e.g. ===, --', maxlength: '120', autocomplete: 'off', onchange: e => store({ dropEnd: e.target.value }, 'Saved') })),
    h('label', { class: 'field' }, 'Remove these wherever they appear in a case',
      h('input', { type: 'text', value: fmt().remove || '', placeholder: 'e.g. ) ===', maxlength: '120', autocomplete: 'off', onchange: e => store({ remove: e.target.value }, 'Saved') })),
    h('p', { class: 'hint help' }, 'A date above the first case (such as “OR06 - 20 Oct 2026”) is used for every case with no date of its own; otherwise the date is read from the case’s first line as before (or {date} in the start text).'),
    h('label', { class: 'field' }, 'Try it: paste a sample list',
      h('textarea', { rows: '4', placeholder: 'Use made-up text, not real patients. Nothing here is saved.', oninput: e => { sample = e.target.value; paint(); } })),
    out);
}

// Teach it from an example (owner, 19 Oct 2026): paste a sample, select a piece of it and tap what it is (where a case
// starts, initials, date, characters to skip, what ends a case). learnFormat() turns the marks into the same
// listFormat the fields above hold; it is shown on the sample first and saved only on "Use this format".
const TEACH_ROLES = [['start', 'Case starts here'], ['initials', 'Initials'], ['date', 'Date'], ['skip', 'Skip'], ['end', 'Case ends with'], ['remove', 'Remove everywhere']];
function listTeach(save) {
  let marks = [], learned = null;
  const ta = h('textarea', { rows: '5', placeholder: 'Paste one or two cases (made-up text is fine). Then select a piece and tap what it is.', 'aria-label': 'Sample list',
    oninput: () => { marks = []; paint(); } });
  const out = h('div', { 'aria-live': 'polite' }), chips = h('div', { class: 'bar', style: 'flex-wrap:wrap;margin:6px 0' });
  const mark = role => {
    const s = ta.selectionStart, e = ta.selectionEnd;
    if (!(e > s)) { toast('Select the text in the sample first'); return; }
    marks = [...marks.filter(m => role === 'end' ? !(m.role === 'end' && m.s === s && m.e === e) : m.role !== role), { role, s, e }];
    paint();
  };
  function paint() {
    const text = ta.value;
    fill(chips, marks.map((m, i) => h('button', { type: 'button', class: 'chip', title: 'Remove this mark', onclick: () => { marks.splice(i, 1); paint(); } },
      (TEACH_ROLES.find(r => r[0] === m.role) || [])[1] + ': “' + text.slice(m.s, m.e).replace(/\s+/g, ' ').slice(0, 24) + '” ✕')));
    const r = marks.length ? learnFormat(text, marks) : null;
    learned = r && r.format ? r.format : null;
    if (!r) { fill(out); return; }
    if (!learned) { fill(out, h('p', { class: 'hint', style: 'color:var(--err)' }, r.error)); return; }
    const rows = parseBulk(text, null, undefined, { format: learned });
    fill(out,
      h('p', { class: 'hint' }, 'Learned: starts with ', h('b', {}, learned.start), learned.skip ? ', skips ' + learned.skip + ' characters' : '', learned.dropEnd ? ', ends with ' + learned.dropEnd : '', learned.remove ? ', removes ' + learned.remove : '', ' · ' + rows.length + (rows.length === 1 ? ' case' : ' cases') + ' found in the sample.'),
      rows.slice(0, 5).map((c, i) => h('p', { class: 'hint', style: 'margin:2px 0' }, (i + 1) + '. ' + (c.date ? c.date + ' · ' : '') + (c.initials ? c.initials + ' · ' : '') + c.details.replace(/\s+/g, ' ').slice(0, 60))),
      h('div', { class: 'bar' }, h('button', { type: 'button', class: 'primary', onclick: () => save({ listFormat: learned }, 'Format saved').then(() => hooks.render()) }, 'Use this format')));
  }
  return h('details', { class: 'list-teach', style: 'margin:8px 0' },
    h('summary', {}, 'Teach it from an example'),
    h('p', { class: 'hint help' }, 'Paste a sample, select the text where a case starts (for example “1. === AB (”) and tap Case starts here. Inside it, select the initials and the date and tap those. Select text that ends a case and tap Case ends with, or text to delete wherever it appears (such as a closing “) ===”) and tap Remove everywhere. Numbers are matched for you.'),
    ta,
    h('div', { class: 'bar', style: 'flex-wrap:wrap;margin-top:6px' }, TEACH_ROLES.map(([role, label]) => h('button', { type: 'button', class: 'small', onclick: () => mark(role) }, label))),
    chips, out);
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
      h('h3', {}, 'Recognise details'), h('p', { class: 'hint' }, 'Account settings · follow you between devices.'),
      toggle('Suggest tags as I type', st.suggestions !== false, v => save({ suggestions: v }), 'On by default.'),
      // off by default: tags count towards targets, so by default each one is picked on purpose
      toggle('Tick confident suggestions automatically', !!st.autoTick, v => save({ autoTick: v || null }),
        'Off by default. Untick any you don’t want.', 'The surest suggestions are ticked as you type and follow your words. One you untick stays off for that case. Check the ticks before you save: they count towards your targets.'),
      toggle('Autodetect age and gender', st.detectAgeSex !== false, v => save({ detectAgeSex: v }),
        'On by default. Optional for APMES.', 'Turning this off stops age-based Paediatrics and Geriatric suggestions. Choose those tags yourself when needed; explicit words can still suggest them.'),
      // Detection (owner, 15 Oct 2026): what the box reads as initials. The line under the box shows what was read;
      // a tap there keeps it as text for that case
      h('h3', {}, 'Detection'),
      help('The line under the case box shows what was read (AB = initials, 72M = 72 years · male). Tap one there to keep it as text for that case.'),
      toggle('Read initials from the start of the case box', st.detectInitials !== false, v => save({ detectInitials: v ? null : false }),
        'On by default.', 'Off: everything you type stays in the case text; use the Initials box (Advanced logging) if you want initials.'),
      toggle('Allow one-letter initials', !!st.oneLetterInitials, v => save({ oneLetterInitials: v || null }),
        'Off by default: one letter needs an age or "/" after it.', 'On: a capital letter on its own is initials (J lap chole). I and A still need an age, "/" or "(" after them, as they are words too.'),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Skip these at the start',
        h('input', { type: 'text', value: cleanSkip(st.skipStarts).join(', '), placeholder: 'e.g. ===, Pt:', maxlength: '200', autocomplete: 'off', 'aria-describedby': 'skip-help',
          onchange: e => { const list = cleanSkip(e.target.value); e.target.value = list.join(', '); save({ skipStarts: list.length ? list.join(', ') : null }, 'Saved'); } })),
      h('p', { class: 'hint help', id: 'skip-help' }, 'Separated by commas. Dropped from the start of a case before the initials are read, e.g. "=== AB 45F" saves AB and 45F. Not when there are no initials after them.'),
      listFormatCard(st, save),
      listTeach(save),
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
      try { await patchLogbook({ settings: { suggestions: true, autoTick: null, detectAgeSex: true, detectInitials: null, oneLetterInitials: null, skipStarts: null, listFormat: null, enterMode: 'newline', enterSaves: null, defaultDate: 'today', afterSave: null } }); setDisplay({ compactTags: null }); hooks.render(); toast('Everyday logging defaults restored'); } catch (err) { toast(err.message); }
    } }, 'Reset these logging defaults'), h('p', { class: 'hint' }, 'Resets only the choices on this page. Advanced logging settings keep their current values.')),
    advancedLink('loggingadv', 'Advanced logging settings', 'The Add tab, the keyboard, search, dates and undo, tips'));
}

// Settings → Logging → Advanced logging settings (#loggingadv), under headings (owner, 13 Oct 2026): the Add tab,
// the keyboard in the case box, search, dates and undo, help
export function renderLoggingAdvanced() {
  const st = settings();
  const save = (patch, note = 'Saved') => patchLogbook({ settings: patch }).then(() => note && toast(note));
  return h('div', { class: 'set-page' },
    h('section', { class: 'card' },
      h('h2', {}, 'Advanced logging'),
      h('h3', {}, 'Add tab'),
      help('Switch off what you don’t use. The case box, All tags and Save always stay.'),
      CASE_PARTS.map(([part, label]) => toggle(label, caseShown(part), v => setCaseShown(part, v, partIds()))),
      pick('Same as last: how many recent cases', RECENT_COUNTS, snapRecent(st.recentCount), n => save({ recentCount: n === 1 ? null : n }),
        'Chips under the case box that copy a recent case’s procedure and tags.'),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Case box height on the Add tab',
        h('select', { onchange: e => save({ boxLines: Number(e.target.value) }) },
          Array.from({ length: 19 }, (_, i) => i + 2).map(n => h('option', { value: String(n), selected: n === (Math.min(20, Math.max(2, Number(st.boxLines) || 3))) }, `${n} lines${n === 3 ? ' (default)' : ''}`)))),
      // the height dragged with the grab bar under the box (this device), and Grow as I type (on by default)
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'Dragged height (this device): ', h('b', {}, display().boxHeight ? `${Math.round(display().boxHeight)} px` : 'none'),
        display().boxHeight ? [' · ', h('button', { type: 'button', class: 'linkish', onclick: () => { setDisplay({ boxHeight: null }); hooks.render(); } }, 'Reset')] : null),
      toggle('Grow as I type (this device)', display().boxGrow !== false, v => { setDisplay({ boxGrow: v ? null : false }); },
        'On by default: the box grows with the text, up to two thirds of the screen.', 'Drag the bar under the box to set its starting height; double-tap the bar to reset it.'),
      // a separate Initials box above the case box, where the Add tab starts (device; was "First field for a new case")
      toggle(['Separate initials box (this device)', 'Separate initials box'], display().firstField === 'initials', v => { setDisplay({ firstField: v ? 'initials' : null }); toast('Saved on this device'); },
        'An Initials box above the case box.', 'The Add tab starts there and Enter moves on to the case. Off: type the initials at the start of the case, e.g. “AB 72M lap chole”.'),
      toggle('Open the keyboard when the Add tab opens (this device)', display().autoFocus !== false, v => { applyDisplay(setDisplay({ autoFocus: v ? null : false })); hooks.render(); }),
      // phones and tablets: not when the app first opens (the keyboard would cover the page before anything was
      // tapped), only on going to the Add tab, unless this asks for it (autoFocus true; ui-log.js wantFocus)
      display().autoFocus === false ? null : toggle('Also when the app opens on a phone or tablet (this device)', display().autoFocus === true, v => applyDisplay(setDisplay({ autoFocus: v ? true : null })),
        'Off by default: on a touch screen the keyboard opens once you go to the Add tab, not as the app starts.'),
      // lp: / dt: parts in the case summary, and a template for the case box (ui-parts.js; both off by default)
      partsSettings(),
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
      toggle('Show last week’s summary on the Add tab (once a week)', st.weeklyDigest, v => save({ weeklyDigest: v }, null))),
    resetLink('everything on this page (the Add tab parts, Same as last, box height, the initials box, labelled parts and the template (switched off; your labels and template are kept), keyboard, advanced search, the week, undo, tips and the weekly summary)', async () => {
      await patchLogbook({ settings: { boxLines: null, undoSecs: null, weekStart: null, weeklyDigest: null, hideTips: null, searchOps: null, recentCount: null, labelParts: null, caseTplOn: null, ...resetPatch(settings(), partIds().map(p => 'case:' + p)) } });
      applyDisplay(setDisplay({ autoFocus: null, firstField: null, boxCaps: null, boxCorrect: null, boxSpell: null }));
    }));
}

// Profiles (settings.mode, the whole account; PROFILES in ui-core.js, presets in profiles.js): one place only, at the
// top of Settings → Profile (owner, Oct 2026: two Basic mode switches confused). A profile is a preset of switches: picking
// one first lists what it turns on and off (and the tabs it moves on this device), then Apply sets them. Every switch
// stays free after that (the cards below); the profile then reads "Custom (based on …)". Other devices follow the
// profile's tab defaults unless their tabs were arranged by hand.
const tabName = id => (BAR_TABS.find(([k]) => k === id) || [id, id])[1];
const partIds = () => CASE_PARTS.map(([p]) => p);
// the tabs that would move on this device: { bar: [...], more: [...] }
function tabMoves(to) {
  const ids = barTabs().map(([id]) => id), d = display();
  const now = new Set(arrangeTabs(ids, d).hidden);
  const next = tabsAfter(d.tabHidden, profile(), to);
  const after = new Set(arrangeTabs(ids, next ? { ...d, tabHidden: next } : d, to).hidden);
  return { bar: ids.filter(id => now.has(id) && !after.has(id)), more: ids.filter(id => !now.has(id) && after.has(id)) };
}
// what picking a profile changes, as [heading, names] lines (empty: nothing on screen changes); the device options a
// profile governs (device-presets.js, like Hide the tab bar while typing in Personal) are listed for this device
const deviceName = k => (DEVICE_SWITCHES.find(([x]) => x === k) || [k, k])[1];
export function profileChanges(to) {
  const { on, off } = switchChanges(settings(), profile(), to), t = tabMoves(to), dv = deviceChanges(display(), profile(), to);
  return [['Turns on', on.map(switchLabel)], ['Turns off', off.map(switchLabel)],
    ['Turns on (this device)', dv.on.map(deviceName)], ['Turns off (this device)', dv.off.map(deviceName)],
    ['Onto the tab bar (this device)', t.bar.map(tabName)], ['Into More (this device)', t.more.map(tabName)]].filter(([, l]) => l.length);
}
const changeList = lines => h('ul', { class: 'profile-changes' }, lines.map(([what, names]) => h('li', {}, h('b', {}, what + ': '), names.join(', '))));
const profileName = k => (PROFILES.find(([x]) => x === k) || [k, k])[1];
export async function applyProfile(mode) {
  const from = profile();
  await patchLogbook({ settings: applyPatch(settings(), mode) });
  const next = tabsAfter(display().tabHidden, from, mode);
  // this device's options the profile governs follow it again (their saved values go)
  applyDisplay(setDisplay({ ...deviceReset(), ...(next ? { tabHidden: next } : {}) }));
  hooks.paintTabs?.(); hooks.render(); toast(`Profile: ${profileName(mode)}`);
}
// the short list of what changes, then Apply (or Cancel: nothing changes)
// Cancel: the radio goes back at once and keeps the focus. The dialog's own close waits for its history step (Back), which
// some browsers (Safari) give a moment later, so the page isn't left showing the radio that was cancelled meanwhile.
function radioBack() {
  const cur = profile();
  for (const r of document.querySelectorAll('input[name=profile]')) r.checked = r.value === cur;
  document.querySelector('input[name=profile]:checked')?.focus({ preventScroll: true });
}
function confirmProfile(mode) {
  const lines = profileChanges(mode);
  let done = false;
  const cancel = () => { m.close(); radioBack(); };
  const m = modal(mode === profile() ? `Back to ${profileName(mode)}` : `Use ${profileName(mode)}`, [
    lines.length ? changeList(lines) : h('p', {}, 'Nothing on screen changes: only the profile’s name.'),
    h('p', { class: 'hint' }, 'Your cases, reflections, notes, tags and other settings stay as they are. Any switch can be changed again after.'),
    h('div', { class: 'bar' }, h('span', { class: 'grow' }),
      h('button', { onclick: cancel }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => { done = true; await m.close(); applyProfile(mode); } }, 'Apply')),
  ], { onclose: () => { if (!done) { hooks.render(); radioBack(); } } });
  // Escape and a tap outside close it too
  m.el.addEventListener('cancel', () => { if (!done) setTimeout(radioBack, 0); });
  m.el.addEventListener('click', e => { if (e.target === m.el && !done) setTimeout(radioBack, 0); });
}
export function profileCard() {
  const cur = profile();
  const diffs = profileChanges(cur);
  const now = diffs.length ? `Custom (based on ${profileName(cur)})` : profileName(cur);
  return h('section', { class: 'card profile-card' },
    h('h2', {}, 'Profile'),
    h('p', { class: 'profile-now', style: 'margin:0 0 6px' }, 'Now: ', h('b', {}, now)),
    diffs.length ? [h('p', { class: 'hint', style: 'margin:0' }, `Back to ${profileName(cur)}:`), changeList(diffs),
      h('div', { class: 'bar', style: 'margin:4px 0 8px' }, h('button', { class: 'small', onclick: () => confirmProfile(cur) }, `Back to ${profileName(cur)}`))] : null,
    h('div', { role: 'radiogroup', 'aria-label': 'Profile' }, PROFILES.filter(([k]) => k !== 'faculty' || facultyRole() || k === cur).map(([k, label, hint]) => h('label', { class: 'check profile-opt' },
      h('input', { type: 'radio', name: 'profile', value: k, checked: k === cur, onchange: () => confirmProfile(k) }),
      h('span', {}, h('b', {}, label), h('small', { class: 'hint' }, hint))))),
    h('p', { class: 'hint help', style: 'margin:6px 0 0' }, 'For your whole account. A profile is a set of the switches below: picking one shows what it turns on and off first. Your cases, reflections and tags never change.'));
}

// Settings → Profile: the profile, then every switch that shows or hides part of the app, grouped by area, each group
// with its own reset. The same settings as on their own pages (Logging, Themes, Layout, Reflections), gathered in one place.
// question: for a group whose reset turns something off (an opt-in extra), not "back to the defaults?"
const groupReset = (what, run, question = `Put ${what} back to the profile’s defaults?`) => h('p', { class: 'reset-row' }, h('button', { class: 'small linkish', type: 'button', onclick: async () => {
  if (!await confirmBox('Reset this group', question, 'Reset')) return;
  await run(); hooks.render(); toast('Back to the defaults');
} }, 'Reset this group'));
const sw = (label, on, set, hint, attrs = {}) => [h('label', { class: 'check' }, h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked: !!on, onchange: e => set(e.target.checked), ...attrs }), label), hint ? h('p', { class: 'hint help' }, hint) : null];
// a profile switch (profiles.js), saved for the account. These show only with the targets' counts: while that is off,
// one switched on says so (rather than seeming to do nothing)
const NEEDS_TARGETS = ['case:still', 'totals', 'year', 'saveToast'];
// (data-switch names it; the extras, which the Basic profiles leave out, also carry data-extra)
const presetSwitch = ([k, label, g]) => sw(label, shows(k), v => setShown(k, v, partIds()).then(() => hooks.render()),
  NEEDS_TARGETS.includes(k) && shows(k) && !shows('targets') ? 'Shows only with Counts against the APMES targets on.' : undefined,
  { 'data-switch': k, ...(g === 'extras' ? { 'data-extra': '' } : {}) });
const extra = k => presetSwitch(SWITCHES.find(x => x[0] === k));
const switchGroup = g => SWITCHES.filter(x => x[2] === g);
export function renderShowHide() {
  const st = settings(), d = display();
  const save = patch => patchLogbook({ settings: patch });
  const caseParts = CASE_PARTS.filter(([p]) => p !== 'still');   // (Still needed is with the APMES parts)
  const { hidden } = arrangeTabs(barTabs().map(([id]) => id), d);
  const extrasReset = keys => resetPatch(settings(), keys);
  // in the order of the tabs (owner, 15 Oct 2026): Add tab, Logbook, Reflections, Analytics, Header and tabs, Tips and
  // help, APMES last; the extras sit with the area they belong to (no Extras card)
  return h('div', { class: 'showhide set-page' },
    profileCard(),
    h('h2', { class: 'set-heading' }, 'Show or hide'),
    h('p', { class: 'hint help', style: 'margin:0 6px 10px' }, 'Everything you can show or hide, by area, in the order of the tabs. Each group has its own reset. The same switches are on their own pages too. Off in the Basic profiles: the Logbook grid, figures and references, and (in Basic: logbook only) the reflections.'),
    h('section', { class: 'card', 'data-group': 'case' },
      h('h3', { style: 'margin-top:0' }, 'Add tab'),
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'The case box, All tags and Save always stay. Still needed is under APMES.'),
      caseParts.map(([part, label]) => sw(label, caseShown(part), v => setCaseShown(part, v, partIds()).then(() => hooks.render()))),
      groupReset('every part of the Add tab', () => save(resetPatch(settings(), caseParts.map(([p]) => 'case:' + p))))),
    h('section', { class: 'card', 'data-group': 'logbook' },
      h('h3', { style: 'margin-top:0' }, 'Logbook'),
      extra('grid'),
      sw('Copy and Reflect buttons on each case (this device)', !d.rowMenu, v => applyDisplay(setDisplay({ rowMenu: v ? null : true })), 'Off: one ⋯ button on each row instead.'),
      sw('Copy button on each case (this device)', !!d.rowCopy, v => applyDisplay(setDisplay({ rowCopy: v || null })), 'Off by default.'),
      sw('Copy button for each day (this device)', !!d.dayCopy, v => applyDisplay(setDisplay({ dayCopy: v || null })), 'Off by default: Share sends the whole day.'),
      groupReset('the grid view and the row and day buttons', () => { applyDisplay(setDisplay({ rowMenu: null, rowCopy: null, dayCopy: null })); return save(extrasReset(['grid'])); })),
    h('section', { class: 'card', 'data-group': 'reflections' },
      h('h3', { style: 'margin-top:0' }, 'Reflections'),
      extra('reflect'),
      extra('reflExtras'),
      sw('Formatting buttons (this device)', !!d.reflToolbar, v => applyDisplay(setDisplay({ reflToolbar: v || null })), 'Bold, bullet and numbered lists above each box.'),
      sw('Show notes under each heading', st.reflNotes !== false, v => save({ reflNotes: v })),
      sw('Word counts in the list (this device)', !d.hideWords, v => applyDisplay(setDisplay({ hideWords: v ? null : true }))),
      groupReset('the reflection parts and defaults (no formatting buttons, heading notes and word counts on)', () => { applyDisplay(setDisplay({ reflToolbar: null, hideWords: null })); return save({ ...extrasReset(['reflect', 'reflExtras']), reflNotes: null }); })),
    h('section', { class: 'card', 'data-group': 'analytics' },
      h('h3', { style: 'margin-top:0' }, 'Analytics'),
      extra('analytics'),
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'Arrange or hide its cards with Edit on the Analytics page.'),
      groupReset('Analytics', () => save(extrasReset(['analytics'])))),
    h('section', { class: 'card', 'data-group': 'bar' },
      h('h3', { style: 'margin-top:0' }, 'Header and tabs (this device)'),
      sw('Show the header (the app’s name and your name)', !d.hideHeader, v => applyDisplay(setDisplay({ hideHeader: !v }))),
      sw('Swipe left or right to change tab', d.swipeTabs !== false, v => applyDisplay(setDisplay({ swipeTabs: v ? null : false }))),
      barTabs().filter(([id]) => id !== 'more').map(([id, label]) => sw(`${label} on the tab bar`, !hidden.includes(id), v => setTabOnBar(id, v, () => hooks.render()))),
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, `Up to ${MAX_BAR} tabs fit, More included. Hidden tabs are first in More. The order is in Layout, and Edit on More.`),
      groupReset('the header, swiping and the profile’s tabs (Notes and the More pages go back into More, unless the profile puts them on the bar)', () => { applyDisplay(setDisplay({ hideHeader: null, swipeTabs: null, tabHidden: null, tabOrder: null })); hooks.paintTabs?.(); })),
    h('section', { class: 'card', 'data-group': 'tips' },
      h('h3', { style: 'margin-top:0' }, 'Tips and help'),
      sw('Show tips and help text', !st.hideTips, v => save({ hideTips: !v }).then(() => hooks.render()), 'Explanations around the app, the privacy and photo reminders, and the tips for the tags you pick.'),
      sw('Show last week’s summary on the Add tab', !!st.weeklyDigest, v => save({ weeklyDigest: v })),
      groupReset('the tips and the weekly summary', () => save({ hideTips: null, weeklyDigest: null }))),
    h('section', { class: 'card', 'data-group': 'apmes' },
      h('h3', { style: 'margin-top:0' }, 'APMES'),
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'The programme’s parts. Off in the Personal profile, for logging outside APMES. Request an evaluation (in a case’s ⋯ menu and its edit page: a new evaluation request with the case’s date and initials, never its details) is off unless you switch it on.'),
      switchGroup('apmes').map(presetSwitch),
      // (Request an evaluation is opt-in: the reset turns it off, and says so)
      groupReset('the APMES parts', () => save(resetPatch(settings(), switchGroup('apmes').map(([k]) => k))),
        'Put the APMES parts back to the profile’s defaults? This also turns off Request an evaluation.')));
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
// ---------- Account-tab cards: who you are, sign out ----------

export function youCard() {
  const r = S.resident;
  return h('section', { class: 'card' },
    h('h2', {}, 'You'),
    h('p', { class: 'hint' }, 'Signed in as ', h('b', {}, S.user.email), S.admin ? ' (admin)' : '', '.'),
    h('label', { class: 'field' }, 'Name (shown on your exports; the Totals table uses the name on the programme list)',
      h('input', { value: displayName(), autocomplete: 'name', onchange: e => patchLogbook({ name: e.target.value.trim() }).then(() => toast('Saved')) })),
    r
      ? h('p', { class: 'hint' }, `On the programme list: ${r.rid}, AY${r.intake || '?'} intake, ${myYearName()}${r.status && r.status !== 'ACTIVE' ? ', ' + r.status.toLowerCase() : ''}. Your case counts (never your case details) are shared on the Totals tab.`)
      : h('p', { class: 'hint' }, 'Not on the programme resident list, so your logbook is private and not on Totals. If you are an APMES resident, ask the programme admins to add your email.'));
}


// ---------- tag groups (stored as logbook.templates) ----------

function tagGroupsCard() {
  const list = (S.logbook && S.logbook.templates) || [];
  return h('section', { class: 'card', id: 'tag-groups' },
    h('h2', {}, 'Tag groups'),
    h('p', { class: 'hint help' }, 'Tags you often pick together, one tap in Quick picks on the Add tab, e.g. “LSCS spinal” = LSCS + CNB(Obs) + Spinal.'),
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
// view: the list (details, up/down) or pills (as on the Add tab, drag to reorder); a search narrows both
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
    h('p', { class: 'hint help' }, 'Lay out the Add tab’s list your way. APMES tags are the programme’s categories: rename (just for you), hide, move them or put them under section headers. Personal tags are your own: link one to APMES categories and choosing it ticks them, or leave it as a label only. A personal tag under an APMES one counts towards it. Totals and exports always use APMES.'),
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
    n.kind !== 'head' ? [h('p', {}, `${tagUsage()(n.e.k)} cases · ${n.e.hide ? 'Hidden (search still finds it)' : 'Shown on Add'}`),
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
    kind !== 'head' ? h('label', { class: 'check', style: 'margin-top:8px' }, hide, 'Hide from the Add tab (still found by search)') : null,
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
        // each case through the write queue with the version it was made from: one changed on another device meanwhile
        // is kept, not overwritten. The cases as this device has them now, not when the dialog opened (a newer copy that
        // arrived since is no conflict)
        const pairs = (S.cases || []).filter(c => (c.tags || []).includes(from)).map(c => {
          const tags = (c.tags || []).filter(k => k !== from);
          const out = { ...c, tags: code ? tags : [...new Set([...tags, to])], updatedAt: Date.now() };
          if (adds.length) out.cats = sortCodes(withParents([...(c.cats || []), ...adds]));
          if (!out.tags.length) delete out.tags;
          return { base: c, next: out };
        });
        const r = await updateMany(pairs), into = code ? catShort(code) : (set.find(x => x.k === to) || {}).n;
        if (r.stopped) return;   // (signed out or switched meanwhile: never this list onto the next account)
        // the old tag comes off the list only once no case carries it (a kept one still would: merge again later)
        if (r.saved < pairs.length) return updatedToast(`Merged into ${into}: ${r.saved} of ${pairs.length} case${pairs.length === 1 ? '' : 's'}; “${n.e.n}” stays on your list`, r, 'merge again');
        await saveTags(removeTag(set, from));
        toast(`Merged into ${into}: ${r.saved} case${r.saved === 1 ? '' : 's'} updated`);
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
