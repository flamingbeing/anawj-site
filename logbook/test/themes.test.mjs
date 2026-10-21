// Themes (js/themes.js): a theme is a bundle of look settings; changing one makes it "Custom (based on …)".
import assert from 'node:assert/strict';
import { THEMES, THEME_KEYS, TINTS, themePatch, themeState, themeLabel, bandColours, lookCss, NUH_BAND, themeById } from '../js/themes.js';
import { THEME_FONTS } from '../js/fonts.js';
import { contrast, colourChecks, lightPalette, darkPalette, mix } from '../js/colors.js';
import { FEATURED, checkTheme } from '../js/themes.js';
import { lookOf, exportText, importText } from '../js/my-themes.js';

// The Inspired catalogue is complete, accessible in both appearances, and portable through Your themes.
const additions = ['Facebook', 'Messenger', 'Threads', 'LinkedIn', 'Reddit', 'Discord', 'Slack',
  'Microsoft Teams', 'Zoom', 'Signal', 'LINE', 'WeChat', 'Snapchat', 'Pinterest', 'Tumblr', 'Netflix',
  'Disney+', 'Prime Video', 'Apple Music', 'SoundCloud', 'Duolingo', 'Airbnb', 'Uber', 'Grab',
  'Google Maps', 'Google Calendar', 'Google Keep', 'Google Drive', 'Dropbox', 'Trello', 'Asana',
  'Todoist', 'Things', 'Craft', 'OneNote', 'Outlook', 'Apple Notes', 'Apple Health', 'Strava',
  'Nike Run Club', 'Headspace', 'Calm', 'Medium', 'Substack', 'Kindle', 'GitHub', 'Figma', 'Canva',
  'Shopee', 'Starbucks'];
const inspired = THEMES.filter(t => t.group === 'inspired');
assert.equal(additions.length, 50);
assert.equal(inspired.length, 92);
assert.equal(THEMES.length, 100);
assert.deepEqual(FEATURED, ['apple', 'pixel', 'evernote', 'obsidian', 'notion', 'whatsapp', 'office', 'acgme']);
for (const app of additions) assert.equal(inspired.filter(t => t.name === app).length, 1, app);
assert.equal(new Set(inspired.map(t => JSON.stringify(t.look))).size, inspired.length, 'distinct looks');
for (const t of inspired) {
  assert.deepEqual(checkTheme(t), [], t.id);
  for (const side of ['light', 'dark']) {
    for (const k of ['bg', 'panel', 'ink', 'muted', 'line', 'accent', 'accentInk']) {
      assert.match(t.look.colours[side][k], /^#[0-9a-f]{6}$/, `${t.id} ${side} ${k}`);
    }
  }
  for (const oled of [false, true]) for (const c of colourChecks(t.look, {}, oled)) {
    assert.ok(c.ratio >= 4.5, `${t.id} ${c.side} ${c.fg} on ${c.bg}`);
  }
  assert.ok(THEME_FONTS.includes(t.look.fontUi), `${t.id}: supported UI font`);
  assert.ok(THEME_FONTS.includes(t.look.fontLog), `${t.id}: system logging stack`);
  assert.ok(THEME_FONTS.includes(t.look.headFont), `${t.id}: system heading stack`);
  for (const side of ['light', 'dark']) for (const bg of ['bg', 'panel']) {
    assert.ok(contrast(t.look.colours[side].accent, t.look.colours[side][bg]) >= 4.5, `${t.id} ${side}: readable action text on ${bg}`);
  }
  // Derived tints and the 75%-opacity keyboard shortcut also need readable text.
  for (const side of ['light', 'dark']) {
    const c = t.look.colours[side], p = side === 'light' ? lightPalette(t.look.accent) : darkPalette(t.look.accent);
    for (const bg of [p['accent-soft'], p.chip]) assert.ok(contrast(c.accent, bg) >= 4.5, `${t.id} ${side}: tinted control`);
    assert.ok(contrast(mix(c.accent, c.accentInk, .75), c.accent) >= 4.5, `${t.id} ${side}: keyboard hint`);
  }
  const look = lookOf(t.look);
  assert.deepEqual(look, t.look, `${t.id}: every setting survives sanitisation`);
  const imported = importText(exportText([{ id: 'saved', name: t.name, look }]), []).list;
  assert.deepEqual(imported[0].look, look, `${t.id}: palette and facets survive export/import`);
}

const newIds = ["swissgrid", "bauhaus", "brutalist", "letterpress", "broadsheet", "terminal", "blueprint", "fieldnotes", "artdeco", "memphis", "y2k", "solarized", "nord", "dracula", "gruvbox", "synthwave", "rosepine", "tokyonight", "eink", "riso", "candyshop", "botanical", "terracotta", "marine", "museum"];
assert.equal(newIds.length, 25);
for (const id of newIds) assert.ok(inspired.some(t => t.id === id), id);
assert.ok(THEMES.every(t => !t.name.includes('-style')), 'clean display names');
// The eight classic themes, especially NUHS, retain their definitions.
assert.deepEqual(themeById('nuhs'), { id: 'nuhs', name: 'NUHS', group: 'classic', desc: 'The default: navy, the NUH stripe, soft cards', look: {} });

assert.deepEqual(THEMES.slice(0, 75).map(t => t.id), ["nuhs","flat","soft","paper","darknavy","oled","contrast","eye","obsidian","bear","evernote","notion","telegram","office","whatsapp","pixel","apple","material","instagram","acgme","x","spotify","youtube","gmail","tiktok","facebook","messenger","threads","linkedin","reddit","discord","slack","microsoftteams","zoom","signal","line","wechat","snapchat","pinterest","tumblr","netflix","disneyplus","primevideo","applemusic","soundcloud","duolingo","airbnb","uber","grab","googlemaps","googlecalendar","googlekeep","googledrive","dropbox","trello","asana","todoist","things","craft","onenote","outlook","applenotes","applehealth","strava","nikerunclub","headspace","calm","medium","substack","kindle","github","figma","canva","shopee","starbucks"], 'original saved IDs stay in place');


// ids are unique, every theme only sets known keys, and every theme round-trips
assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
for (const t of THEMES) {
  for (const k of Object.keys(t.look)) assert.ok(THEME_KEYS.includes(k), `${t.id}: unknown key ${k}`);
  assert.ok(t.look.round === undefined || [0, 1, 3].includes(t.look.round), `${t.id}: round is a Corners level other than the default`);
  if (t.band) { assert.equal(t.band.length, 4, t.id); for (const c of t.band) assert.match(c, /^#[0-9a-f]{6}$/, t.id); }
  const d = themePatch(t, { accent: '#123456' });
  assert.deepEqual(themeState(d), { theme: t, custom: false }, t.id);
  assert.equal(themeLabel(d), t.name);
}
// a theme resets what it doesn't set
const flat = themePatch(themeById('flat'), { spacing: 'compact', ftGap: 4, accent: '#123456' });
assert.equal(flat.spacing, null);
assert.equal(flat.ftGap, null);
assert.equal(flat.accent, null);
assert.equal(flat.theme, 'flat');
assert.equal(themePatch(themeById('nuhs')).theme, null);
// A theme can still keep device settings; Pixel now has a complete fixed reference palette.
assert.equal(themePatch({ id: 'kept', look: {}, keep: ['accent'] }, { accent: '#123456' }).accent, '#123456');
assert.equal(themePatch(themeById('pixel'), { accent: '#123456' }).accent, '#654ea1');
// a change afterwards makes it custom; an off switch saved as false is still the theme
const tg = themePatch(themeById('telegram'));
assert.equal(themeLabel({ ...tg, round: 1 }), 'Custom (based on Telegram)');
assert.equal(themeLabel({ ...tg, compact: false }), 'Telegram');
assert.equal(themeLabel({}), 'NUHS');
assert.equal(themeLabel({ accent: '#123456' }), 'Custom (based on NUHS)');
// Flat's borders level is ignored once flat is on
assert.equal(themeLabel({ ...flat, borders: 2 }), 'Flat');

// the top band: NUHS keeps the usual stripe (null), others bring their own, the setting can override
assert.equal(bandColours({}), null);
assert.equal(bandColours(themePatch(themeById('whatsapp'))), 'none');
assert.deepEqual(bandColours({ theme: 'whatsapp', band: 'nuh' }), NUH_BAND);
assert.equal(bandColours({ theme: 'whatsapp', band: 'none' }), 'none');
assert.equal(bandColours({ band: 'shades' }), 'shades');

// the CSS: nothing for the default look; the band, none, tint, fonts, spacing, tabs
assert.equal(lookCss({}), '');
assert.equal(themeById('whatsapp').look.headerStyle, undefined, 'modern WhatsApp keeps neutral chrome');
assert.match(lookCss({ band: 'shades' }, ['#111111', '#222222', '#333333', '#444444']), /--s4: #444444/);
assert.equal(lookCss({ band: 'shades' }), '');   // no shades worked out: the usual band
assert.match(lookCss({ band: 'none' }), /\.top \{ background: var\(--panel\); \}/);
assert.equal(lookCss({ bgTint: 'cream' }), '', 'the tint is in the palette (colors.js resolvePalette), not here');
assert.equal(lookCss({ bgTint: 'auto' }), '');
assert.match(lookCss({ headFont: 'serif' }), /--font-head: ui-serif/);
assert.equal(lookCss({ headFont: 'nonsense' }), '');
assert.match(lookCss({ spacing: 'roomy' }), /padding: 20px/);
assert.match(lookCss({ tabStyle: 'pill' }), /border-radius: 999px/);
assert.ok(!/[<>]/.test(lookCss({ theme: 'tiktok', bgTint: 'black', headFont: 'mono', spacing: 'tight', tabStyle: 'plain' })));

// tints that set their own text stay readable
for (const [k, t] of Object.entries(TINTS)) for (const side of ['light', 'dark']) {
  const v = t[side]; if (!v || !v.ink) continue;
  const panel = v.panel || (side === 'light' ? '#ffffff' : '#1b1e23');
  assert.ok(contrast(v.ink, panel) >= 7, `${k} ${side} ink`);
  assert.ok(contrast(v.muted, panel) >= 4.5, `${k} ${side} muted`);
  assert.ok(contrast(v.muted, v.bg) >= 4.5, `${k} ${side} muted on the page`);
}
console.log('themes tests passed');

// Card style (16 Oct 2026): one choice over flat / shadows; the line strength stays as it was
{
  const { cardStyle, cardPatch, CARD_STYLES } = await import('../js/display.js');
  assert.deepEqual(CARD_STYLES.map(([k]) => k), ['raised', 'outlined', 'flat']);
  assert.equal(cardStyle({}), 'raised', 'soft shadows by default');
  assert.equal(cardStyle({ shadows: false }), 'outlined');
  assert.equal(cardStyle({ flat: true, shadows: false, borders: 2 }), 'flat', 'Flat wins');
  for (const [k] of CARD_STYLES) assert.equal(cardStyle({ borders: 2, ...cardPatch(k) }), k, k + ' round-trips');
  assert.equal('borders' in cardPatch('flat'), false, 'Flat keeps the line strength for later');
  for (const t of THEMES) assert.ok(CARD_STYLES.some(([k]) => k === cardStyle(t.look)), t.id);
  console.log('card style: ok');
}

// App-style details (19 Oct 2026): each its own setting, nothing in the CSS until chosen
for (const [k, v, re] of [['barBlur', true, /backdrop-filter/], ['tabActiveLabel', true, /\.lbl \{ display: none/], ['tabStyle', 'indicator', /padding: 4px 18px/],
  ['listStyle', 'inset', /overflow: hidden/], ['listStyle', 'edge', /margin-left: -12px/], ['titleAlign', 'centre', /text-align: center/],
  ['switchStyle', 'ios', /#34c759/], ['switchStyle', 'material', /width: 52px/], ['pressStyle', 'highlight', /opacity: 1/], ['pressStyle', 'none', /transparent/],
  ['iconWeight', 'thin', /1\.4/], ['iconWeight', 'bold', /2\.6/], ['typeStyle', 'ios', /-0\.02em/], ['typeStyle', 'material', /font-weight: 500/]]) {
  assert.match(lookCss({ [k]: v }), re, `${k}=${v}`);
  assert.equal(lookCss({ [k]: null }), '', `${k} off`);
}
for (const k of ['barBlur', 'tabActiveLabel', 'listStyle', 'titleAlign', 'switchStyle', 'pressStyle', 'iconWeight', 'typeStyle']) assert.ok(THEME_KEYS.includes(k), k);
assert.equal(lookCss({ listStyle: 'default', switchStyle: 'default', pressStyle: 'default', iconWeight: 'default', typeStyle: 'default', titleAlign: 'default' }), '');
