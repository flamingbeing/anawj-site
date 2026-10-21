// Themes (Settings → Themes; owner, 15 Oct 2026): a theme is a bundle of this device's look settings (display.js),
// set in one tap; every setting stays editable afterwards, and the page then says "Custom (based on …)". Classic
// themes are cards; Inspired ones (the look of other apps: colours, corners and type only, never their logos or
// fonts) sit in a searchable list. Pure, unit-tested; the CSS for the new look settings (background tint, spacing,
// tab bar style, heading font, the top band) is made here too, cached for the first paint (index.html).

import { coloursCss, checkColours } from './colors.js';
import { STACKS } from './fonts.js';
import { FACETS, FACET_KEYS, facetCss, cleanFacet, TUNE_KEYS, cleanTune, tuneCss, iconTintCss, cleanTintStrength, cleanTabIcons } from './theme-engine.js';
import { patternCss, cleanPattern, cleanDim } from './wallpaper.js';

// the display keys a theme sets; anything a theme doesn't list goes back to its default (null), unless it keeps it
export const THEME_KEYS = ['colours', 'accent', 'colourful', 'borders', 'flat', 'round', 'shadows', 'fontUi', 'fontLog', 'headFont', 'lineHeight',
  'btnStyle', 'iconBtns', 'tabIcons', 'pageTitles', 'calPlain', 'rowShort', 'navStyle', 'rowLayout', 'formLayout', 'contrast', 'bgTint', 'band',
  ...FACET_KEYS,   // the theme engine's facets (theme-engine.js): spacing, tab style, header, icons, motion, pop-ups, controls…
  ...TUNE_KEYS,   // Fine-tune values (theme-engine.js): numbers, unset by default
  'wallpaper', 'wallDim', 'iconTint', 'iconTintStrength', 'tabIcon'];   // wallpaper.js (a pattern, never a photo), icon tint, a tab's icon
// A photo wallpaper is this device's own (wallpaper.js): a theme or a saved theme that sets no wallpaper keeps it
export function keepPhoto(patch, current = {}) {
  return current.wallpaper === 'photo' && patch.wallpaper == null ? { ...patch, wallpaper: 'photo', wallDim: current.wallDim ?? null } : patch;
}

// Background tints: the page ground (and for some the cards and text) in light and dark
export const TINTS = {
  auto: { label: 'From the colour (default)' },
  white: { label: 'White', light: { bg: '#ffffff', line: '#e3e3e3' }, dark: { bg: '#111111', panel: '#191919' } },
  grey: { label: 'Light grey', light: { bg: '#f3f2f1' }, dark: { bg: '#161616', panel: '#202020' } },
  cream: { label: 'Cream', light: { bg: '#f7f3ec', panel: '#fffdf9', line: '#e6dfd3' }, dark: { bg: '#1b1916', panel: '#24211d', line: '#3a352e' } },
  sepia: { label: 'Sepia (eye comfort)', light: { bg: '#efe6d2', panel: '#faf4e6', ink: '#3b352c', muted: '#6b6152', line: '#ddd1b8' }, dark: { bg: '#1d1915', panel: '#26211b', ink: '#e8dfcf', muted: '#b5a993', line: '#3d362c' } },
  beige: { label: 'Beige', light: { bg: '#efeae2', line: '#ddd6cb' }, dark: { bg: '#0b141a', panel: '#111b21', line: '#26343d' } },
  bluegrey: { label: 'Blue-grey', light: { bg: '#e7ebf0', line: '#d5dce4' }, dark: { bg: '#0e1621', panel: '#17212b', line: '#2b3846' } },
  iosgrey: { label: 'Grouped grey', light: { bg: '#f2f2f7', line: '#d8d8dc' }, dark: { bg: '#000000', panel: '#1c1c1e', line: '#38383a' } },
  graphite: { label: 'Graphite', light: { bg: '#f2f2f2' }, dark: { bg: '#1e1e1e', panel: '#262626', line: '#363636' } },
  navy: { label: 'Navy night', light: { bg: '#eef2f8' }, dark: { bg: '#0a1628', panel: '#10223b', line: '#22385a' } },
  obsidian: { label: 'Obsidian-style', light: { bg: '#ffffff', panel: '#f6f6f6', line: '#e3e3e3' }, dark: { bg: '#1e1e1e', panel: '#262626', line: '#363636' } },
  notion: { label: 'Notion-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#37352f', muted: '#6b6a67', line: '#e9e9e7' }, dark: { bg: '#191919', panel: '#252525', ink: '#ebebea', muted: '#9b9b9b', line: '#373737' } },
  instagram: { label: 'Instagram-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#262626', muted: '#737373', line: '#dbdbdb' }, dark: { bg: '#000000', panel: '#121212', ink: '#f5f5f5', muted: '#a8a8a8', line: '#262626' } },
  xblack: { label: 'X-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#0f1419', muted: '#536471', line: '#eff3f4' }, dark: { bg: '#000000', panel: '#000000', ink: '#e7e9ea', muted: '#71767b', line: '#2f3336' } },
  spotify: { label: 'Spotify-style', light: { bg: '#ffffff', panel: '#f6f6f6', line: '#e5e5e5' }, dark: { bg: '#121212', panel: '#1f1f1f', ink: '#ffffff', muted: '#b3b3b3', line: '#2a2a2a' } },
  youtube: { label: 'YouTube-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#0f0f0f', muted: '#606060', line: '#e5e5e5' }, dark: { bg: '#0f0f0f', panel: '#212121', ink: '#f1f1f1', muted: '#aaaaaa', line: '#303030' } },
  gmail: { label: 'Gmail-style', light: { bg: '#f6f8fc', panel: '#ffffff', ink: '#202124', muted: '#5f6368', line: '#dadce0' }, dark: { bg: '#131314', panel: '#1e1f20', ink: '#e3e3e3', muted: '#c4c7c5', line: '#444746' } },
  materialgrey: { label: 'Material grey', light: { bg: '#fafafa', panel: '#ffffff', line: '#e0e0e0' }, dark: { bg: '#121212', panel: '#1e1e1e', line: '#333333' } },
  tiktok: { label: 'TikTok-style', light: { bg: '#ffffff', panel: '#ffffff', ink: '#161823', muted: '#6a6b7e', line: '#e3e3e4' }, dark: { bg: '#000000', panel: '#121212', ink: '#ffffff', muted: '#a6a6ab', line: '#2f2f2f' } },
  black: { label: 'Black', light: { bg: '#f4f4f4' }, dark: { bg: '#000000', panel: '#121212', line: '#2a2a2a' } },
};
export const BANDS = [['theme', 'The theme’s colours (default)'], ['shades', 'Shades of my colour'], ['nuh', 'The NUH stripe'], ['none', 'None']];
export const HEAD_FONTS = [['same', 'Same as the interface (default)'], ['serif', 'Serif'], ['system', 'This device’s font'], ['inter', 'Inter'], ['lexend', 'Lexend'], ['atkinson', 'Atkinson Hyperlegible'], ['mono', 'Monospace']];
export const NUH_BAND = ['#e57200', '#e4002b', '#178fd7', '#002f6c'];

// round is a Corners level (0 square … 3 very round; 2, the default, is left out). group: classic | inspired. look: the keys it sets (the rest go back to their defaults). keep: keys it leaves as
// they are (for themes that follow a device setting). themes never change light, dark or auto (the Light or dark setting is the user's); band: four colours for
// the top band (none: the usual behaviour, NUH with the default colour, shades of another)
export const THEMES = [
  { id: 'nuhs', name: 'NUHS', group: 'classic', desc: 'The default: navy, the NUH stripe, soft cards', look: {} },
  { id: 'flat', name: 'Flat', group: 'classic', desc: 'No lines, no cards, tinted buttons', look: { flat: true, borders: 0, shadows: false, round: 1, btnStyle: 'tinted' } },
  { id: 'soft', name: 'Soft', group: 'classic', desc: 'Very round, roomy, gentle grey', look: { round: 3, bgTint: 'grey', btnStyle: 'tinted', spacing: 'roomy', tabStyle: 'pill' } },
  { id: 'paper', name: 'Paper', group: 'classic', desc: 'Cream pages, serif headings, fine lines', look: { bgTint: 'cream', shadows: false, borders: 2, round: 1, headFont: 'serif', accent: '#5b4636' }, band: ['#d9c7a7', '#b89d74', '#8c6f4c', '#5b4636'] },
  { id: 'darknavy', name: 'Navy', group: 'classic', desc: 'Deep navy in dark mode', look: { bgTint: 'navy', accent: '#4a7fd0', shadows: false, borders: 3 } },
  { id: 'oled', name: 'OLED', group: 'classic', desc: 'Pure black in dark mode, saves battery', look: { bgTint: 'black', shadows: false, borders: 2 } },
  { id: 'contrast', name: 'High contrast', group: 'classic', desc: 'Strong lines, clear type', look: { contrast: 'high', shadows: false, fontUi: 'atkinson', btnStyle: 'filled' } },
  { id: 'eye', name: 'Eye comfort', group: 'classic', desc: 'Warm sepia, soft text, less blue', look: { bgTint: 'sepia', accent: '#8a6a4a', lineHeight: '1.15', shadows: false, borders: 3 }, band: ['#e3cfa8', '#c9a77a', '#a7845b', '#8a6a4a'] },
  { id: 'obsidian', name: 'Obsidian-style', group: 'inspired',
    desc: 'Violet tools, compact neutral panes and fine separators',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'sharp', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1,
      borders: 2, shadows: false, btnStyle: 'tinted', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'rail', spacing: 'compact', headingTone: 'ink',
      tabTone: 'ink', accent: '#7f6df2',
      colours: {
        light: { bg: '#ffffff', panel: '#f6f6f6', ink: '#222222', muted: '#666666', line: '#e3e3e3', accent: '#7f6df2', accentInk: '#000000' },
        dark: { bg: '#1e1e1e', panel: '#262626', ink: '#dadada', muted: '#ababab', line: '#363636', accent: '#a88bfa', accentInk: '#000000' },
      },
    } },
  { id: 'bear', name: 'Bear-style', group: 'inspired',
    desc: 'Warm paper, red tools, quiet lists and spacious writing',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', round: 1, borders: 1, shadows: false,
      btnStyle: 'plain', fontUi: 'system', fontLog: 'serif', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', barBlur: true, titleAlign: 'centre', iconWeight: 'thin',
      spacing: 'roomy', headingTone: 'ink', accent: '#d44444',
      colours: {
        light: { bg: '#fbfbf9', panel: '#ffffff', ink: '#333333', muted: '#74746f', line: '#e6e6e1', accent: '#d44444', accentInk: '#000000' },
        dark: { bg: '#1e1e1e', panel: '#282828', ink: '#e5e5e5', muted: '#a2a2a2', line: '#3b3b3b', accent: '#ed6969', accentInk: '#000000' },
      },
    } },
  { id: 'evernote', name: 'Evernote-style', group: 'inspired',
    desc: 'White notes, green actions and clean outlined controls',
    look: {
      statusBar: 'page', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 1,
      borders: 1, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'tabs', headingTone: 'ink', accent: '#008f26',
      colours: {
        light: { bg: '#f8f8f8', panel: '#ffffff', ink: '#202020', muted: '#666666', line: '#e5e5e5', accent: '#008f26', accentInk: '#000000' },
        dark: { bg: '#1a1a1a', panel: '#262626', ink: '#eeeeee', muted: '#a8a8a8', line: '#3a3a3a', accent: '#00c344', accentInk: '#000000' },
      },
    } },
  { id: 'notion', name: 'Notion-style', group: 'inspired',
    desc: 'Paper-white blocks, warm black text and subtle grey rules',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'sharp', pageMotion: 'fade', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', round: 1, borders: 0, shadows: false,
      btnStyle: 'plain', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'timeline', navStyle: 'tabs', titleAlign: 'centre', iconWeight: 'thin', spacing: 'tight',
      headingTone: 'ink', tabTone: 'ink', accent: '#37352f',
      colours: {
        light: { bg: '#ffffff', panel: '#ffffff', ink: '#37352f', muted: '#6b6a67', line: '#e9e9e7', accent: '#37352f', accentInk: '#ffffff' },
        dark: { bg: '#191919', panel: '#202020', ink: '#ebebea', muted: '#9b9b9b', line: '#373737', accent: '#ebebea', accentInk: '#000000' },
      },
    } },
  { id: 'telegram', name: 'Telegram-style', group: 'inspired',
    desc: 'Blue actions, pale chat ground and translucent centred bars',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', round: 3, borders: 1, shadows: false,
      btnStyle: 'tinted', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'chat', navStyle: 'tabs', barBlur: true, titleAlign: 'centre', iconWeight: 'thin',
      headingTone: 'ink', accent: '#2481cc',
      colours: {
        light: { bg: '#efeff4', panel: '#ffffff', ink: '#000000', muted: '#686d71', line: '#d9dce0', accent: '#2481cc', accentInk: '#000000' },
        dark: { bg: '#17212b', panel: '#232e3c', ink: '#f5f5f5', muted: '#a8b4c0', line: '#344250', accent: '#6ab2f2', accentInk: '#000000' },
      },
    } },
  { id: 'office', name: 'Office-style', group: 'inspired',
    desc: 'Cool grey workspace, blue actions and square office panels',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 0,
      borders: 2, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'rail', spacing: 'tight', headerStyle: 'filled',
      headingTone: 'ink', accent: '#185abd',
      colours: {
        light: { bg: '#f3f2f1', panel: '#ffffff', ink: '#323130', muted: '#605e5c', line: '#edebe9', accent: '#185abd', accentInk: '#ffffff' },
        dark: { bg: '#1b1a19', panel: '#292827', ink: '#f3f2f1', muted: '#b3b0ad', line: '#484644', accent: '#6ea4ef', accentInk: '#000000' },
      },
    } },
  { id: 'whatsapp', name: 'WhatsApp-style', group: 'inspired',
    desc: 'Green controls, warm chat ground and rounded message rows',
    look: {
      statusBar: 'header', tabStyle: 'indicator', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'ios', checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 3,
      borders: 1, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'chat', navStyle: 'tabs', headerStyle: 'filled', headingTone: 'ink',
      accent: '#008069',
      colours: {
        light: { bg: '#efeae2', panel: '#ffffff', ink: '#111b21', muted: '#54656f', line: '#e9edef', accent: '#008069', accentInk: '#ffffff' },
        dark: { bg: '#0b141a', panel: '#111b21', ink: '#e9edef', muted: '#8696a0', line: '#26343d', accent: '#00a884', accentInk: '#000000' },
      },
    } },
  { id: 'pixel', name: 'Pixel-style', group: 'inspired',
    desc: 'Soft lavender surfaces, rounded controls and icon-pill tabs',
    look: {
      statusBar: 'page', tabStyle: 'indicator', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'filled', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3,
      borders: 1, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'tabs', headingTone: 'ink', accent: '#6750a4',
      colours: {
        light: { bg: '#fffbfe', panel: '#f3edf7', ink: '#1c1b1f', muted: '#49454f', line: '#cac4d0', accent: '#6750a4', accentInk: '#ffffff' },
        dark: { bg: '#141218', panel: '#211f26', ink: '#e6e1e5', muted: '#cac4d0', line: '#49454f', accent: '#d0bcff', accentInk: '#000000' },
      },
    } },
  { id: 'apple', name: 'Apple-style', group: 'inspired',
    desc: 'Grouped grey lists, blue actions and frosted large-title bars',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'inset', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', borders: 1, shadows: false,
      btnStyle: 'plain', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', barBlur: true, iconWeight: 'thin', headerStyle: 'large',
      headingTone: 'ink', accent: '#007aff',
      colours: {
        light: { bg: '#f2f2f7', panel: '#ffffff', ink: '#000000', muted: '#6c6c70', line: '#c6c6c8', accent: '#007aff', accentInk: '#000000' },
        dark: { bg: '#000000', panel: '#1c1c1e', ink: '#ffffff', muted: '#98989d', line: '#38383a', accent: '#0a84ff', accentInk: '#000000' },
      },
    } },
  { id: 'material', name: 'Material-style', group: 'inspired',
    desc: 'Indigo header, raised cards and square tick boxes',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'filled', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1,
      borders: 1, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', headerStyle: 'filled', headingTone: 'ink', accent: '#3f51b5',
      colours: {
        light: { bg: '#fafafa', panel: '#ffffff', ink: '#212121', muted: '#616161', line: '#e0e0e0', accent: '#3f51b5', accentInk: '#ffffff' },
        dark: { bg: '#121212', panel: '#1e1e1e', ink: '#ffffff', muted: '#b3b3b3', line: '#373737', accent: '#9fa8da', accentInk: '#000000' },
      },
    } },
  { id: 'instagram', name: 'Instagram-style', group: 'inspired',
    desc: 'White or black feed, blue actions and bold icon-only tabs',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'bold', tabIcons: true, barBlur: true,
      headingTone: 'ink', tabTone: 'ink', accent: '#0095f6',
      colours: {
        light: { bg: '#ffffff', panel: '#ffffff', ink: '#262626', muted: '#737373', line: '#dbdbdb', accent: '#0095f6', accentInk: '#000000' },
        dark: { bg: '#000000', panel: '#121212', ink: '#f5f5f5', muted: '#a8a8a8', line: '#262626', accent: '#4cb5f9', accentInk: '#000000' },
      },
    } },
  { id: 'acgme', name: 'ACGME-style', group: 'inspired',
    desc: 'Red actions, white forms and square outlined fields',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'none', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 0,
      borders: 3, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'tabs', spacing: 'tight', headingTone: 'ink',
      accent: '#d32f2f',
      colours: {
        light: { bg: '#f2f2f2', panel: '#ffffff', ink: '#292929', muted: '#666666', line: '#cccccc', accent: '#d32f2f', accentInk: '#ffffff' },
        dark: { bg: '#181818', panel: '#242424', ink: '#f2f2f2', muted: '#b0b0b0', line: '#484848', accent: '#ef7777', accentInk: '#000000' },
      },
    } },
  { id: 'x', name: 'X-style', group: 'inspired',
    desc: 'Edge-to-edge white or black feed, blue actions and bold tabs',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'fade', sheetStyle: 'ios', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 2,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'bold', tabIcons: true, barBlur: true,
      headingTone: 'ink', tabTone: 'ink', accent: '#1d9bf0',
      colours: {
        light: { bg: '#ffffff', panel: '#ffffff', ink: '#0f1419', muted: '#536471', line: '#eff3f4', accent: '#1d9bf0', accentInk: '#000000' },
        dark: { bg: '#000000', panel: '#000000', ink: '#e7e9ea', muted: '#71767b', line: '#2f3336', accent: '#1d9bf0', accentInk: '#000000' },
      },
    } },
  { id: 'spotify', name: 'Spotify-style', group: 'inspired',
    desc: 'Green actions, charcoal cards and bold spacious titles',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'soft',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', iconWeight: 'bold', headingTone: 'ink', tabTone: 'ink', accent: '#1ed760',
      colours: {
        light: { bg: '#ffffff', panel: '#f6f6f6', ink: '#191414', muted: '#6a6a6a', line: '#e5e5e5', accent: '#1ed760', accentInk: '#000000' },
        dark: { bg: '#121212', panel: '#1f1f1f', ink: '#ffffff', muted: '#b3b3b3', line: '#2a2a2a', accent: '#1ed760', accentInk: '#000000' },
      },
    } },
  { id: 'youtube', name: 'YouTube-style', group: 'inspired',
    desc: 'Neutral feed, red actions, rounded buttons and plain tabs',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1, shadows: false,
      btnStyle: 'tinted', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'bold', headingTone: 'ink', tabTone: 'ink',
      accent: '#ff0000',
      colours: {
        light: { bg: '#ffffff', panel: '#ffffff', ink: '#0f0f0f', muted: '#606060', line: '#e5e5e5', accent: '#ff0000', accentInk: '#000000' },
        dark: { bg: '#0f0f0f', panel: '#212121', ink: '#f1f1f1', muted: '#aaaaaa', line: '#303030', accent: '#ff4444', accentInk: '#000000' },
      },
    } },
  { id: 'gmail', name: 'Gmail-style', group: 'inspired',
    desc: 'Pale blue mail surfaces, red actions and Material navigation',
    look: {
      statusBar: 'page', tabStyle: 'indicator', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3,
      borders: 1, shadows: false, btnStyle: 'tinted', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'tabs', headingTone: 'ink', accent: '#b3261e',
      colours: {
        light: { bg: '#f6f8fc', panel: '#ffffff', ink: '#202124', muted: '#5f6368', line: '#dadce0', accent: '#b3261e', accentInk: '#ffffff' },
        dark: { bg: '#131314', panel: '#1e1f20', ink: '#e3e3e3', muted: '#c4c7c5', line: '#444746', accent: '#f2b8b5', accentInk: '#000000' },
      },
    } },
  { id: 'tiktok', name: 'TikTok-style', group: 'inspired',
    desc: 'Black or white feed, pink-red actions and strong icon tabs',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'bold', tabIcons: true, headingTone: 'ink',
      tabTone: 'ink', accent: '#fe2c55',
      colours: {
        light: { bg: '#ffffff', panel: '#ffffff', ink: '#161823', muted: '#6a6b7e', line: '#e3e3e4', accent: '#fe2c55', accentInk: '#000000' },
        dark: { bg: '#000000', panel: '#121212', ink: '#ffffff', muted: '#a6a6ab', line: '#2f2f2f', accent: '#fe2c55', accentInk: '#000000' },
      },
    } },
  { id: 'facebook', name: 'Facebook-style', group: 'inspired',
    desc: 'Blue actions, grey feed ground and rounded white cards',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 0,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'tabs', iconWeight: 'bold', headingTone: 'ink', accent: '#0866ff',
      colours: {
        light: { bg: '#f0f2f5', panel: '#ffffff', ink: '#050505', muted: '#65676b', line: '#ced0d4', accent: '#0866ff', accentInk: '#ffffff' },
        dark: { bg: '#18191a', panel: '#242526', ink: '#e4e6eb', muted: '#b0b3b8', line: '#3e4042', accent: '#4599ff', accentInk: '#000000' },
      },
    } },
  { id: 'messenger', name: 'Messenger-style', group: 'inspired',
    desc: 'Blue chat actions, round fields and clean conversation rows',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', round: 3, borders: 1, shadows: false,
      btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'chat', navStyle: 'tabs', headingTone: 'ink', tabTone: 'ink', accent: '#006aff',
      colours: {
        light: { bg: '#ffffff', panel: '#f5f5f5', ink: '#050505', muted: '#65676b', line: '#e4e6eb', accent: '#006aff', accentInk: '#ffffff' },
        dark: { bg: '#000000', panel: '#242526', ink: '#e4e6eb', muted: '#b0b3b8', line: '#3e4042', accent: '#0a7cff', accentInk: '#000000' },
      },
    } },
  { id: 'threads', name: 'Threads-style', group: 'inspired',
    desc: 'Monochrome feed, hairline dividers and bold icon-only tabs',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'bold', tabIcons: true, headingTone: 'ink',
      tabTone: 'ink', accent: '#101010',
      colours: {
        light: { bg: '#ffffff', panel: '#fafafa', ink: '#101010', muted: '#737373', line: '#e0e0e0', accent: '#101010', accentInk: '#ffffff' },
        dark: { bg: '#101010', panel: '#181818', ink: '#f3f5f7', muted: '#999999', line: '#323232', accent: '#f3f5f7', accentInk: '#000000' },
      },
    } },
  { id: 'linkedin', name: 'LinkedIn-style', group: 'inspired',
    desc: 'Professional blue, warm grey ground and fine card borders',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 2,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'tabs', iconWeight: 'bold', headingTone: 'ink', tabTone: 'ink',
      accent: '#0a66c2',
      colours: {
        light: { bg: '#f4f2ee', panel: '#ffffff', ink: '#191919', muted: '#666666', line: '#e0dfdc', accent: '#0a66c2', accentInk: '#ffffff' },
        dark: { bg: '#000000', panel: '#1b1f23', ink: '#ffffff', muted: '#b0b4b8', line: '#38434f', accent: '#71b7fb', accentInk: '#000000' },
      },
    } },
  { id: 'reddit', name: 'Reddit-style', group: 'inspired',
    desc: 'Orange actions, compact discussions and grey feed cards',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'tabs', iconWeight: 'bold', tabActiveLabel: true, headingTone: 'ink',
      tabTone: 'ink', accent: '#d93900',
      colours: {
        light: { bg: '#dae0e6', panel: '#ffffff', ink: '#1a1a1b', muted: '#5c6267', line: '#cccfd2', accent: '#d93900', accentInk: '#ffffff' },
        dark: { bg: '#0b1416', panel: '#1a282d', ink: '#eef1f3', muted: '#a7b0b5', line: '#34464e', accent: '#ff683b', accentInk: '#000000' },
      },
    } },
  { id: 'discord', name: 'Discord-style', group: 'inspired',
    desc: 'Blurple actions, dense chat rows and layered charcoal panes',
    look: {
      statusBar: 'header', tabStyle: 'pill', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'chat', navStyle: 'rail', iconWeight: 'bold', spacing: 'tight', headingTone: 'ink',
      tabTone: 'ink', accent: '#5865f2',
      colours: {
        light: { bg: '#f2f3f5', panel: '#ffffff', ink: '#313338', muted: '#5c5e66', line: '#dcdde1', accent: '#5865f2', accentInk: '#ffffff' },
        dark: { bg: '#313338', panel: '#2b2d31', ink: '#f2f3f5', muted: '#b5bac1', line: '#3f4147', accent: '#8991ff', accentInk: '#000000' },
      },
    } },
  { id: 'slack', name: 'Slack-style', group: 'inspired',
    desc: 'Aubergine actions, white channels and compact conversation rows',
    look: {
      statusBar: 'header', tabStyle: 'pill', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 1,
      borders: 1, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'chat', navStyle: 'rail', spacing: 'tight', headingTone: 'ink', tabTone: 'ink',
      accent: '#611f69',
      colours: {
        light: { bg: '#f8f8f8', panel: '#ffffff', ink: '#1d1c1d', muted: '#616061', line: '#dddddd', accent: '#611f69', accentInk: '#ffffff' },
        dark: { bg: '#1a1d21', panel: '#222529', ink: '#d1d2d3', muted: '#ababad', line: '#35383c', accent: '#d5a5db', accentInk: '#000000' },
      },
    } },
  { id: 'microsoftteams', name: 'Microsoft Teams-style', group: 'inspired',
    desc: 'Violet controls, cool grey panels and dense workplace lists',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'chat', navStyle: 'rail', spacing: 'tight', headingTone: 'ink', accent: '#5b5fc7',
      colours: {
        light: { bg: '#f5f5f5', panel: '#ffffff', ink: '#242424', muted: '#616161', line: '#e0e0e0', accent: '#5b5fc7', accentInk: '#ffffff' },
        dark: { bg: '#1f1f1f', panel: '#292929', ink: '#ffffff', muted: '#adadad', line: '#424242', accent: '#a6a7dc', accentInk: '#000000' },
      },
    } },
  { id: 'zoom', name: 'Zoom-style', group: 'inspired',
    desc: 'Clear blue actions, rounded white panels and restrained tabs',
    look: {
      statusBar: 'page', tabStyle: 'plain', tabIconFill: true, listStyle: 'inset', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', headingTone: 'ink', tabTone: 'ink', accent: '#0b5cff',
      colours: {
        light: { bg: '#f7f9fa', panel: '#ffffff', ink: '#232333', muted: '#6b737d', line: '#dfe3e8', accent: '#0b5cff', accentInk: '#ffffff' },
        dark: { bg: '#101014', panel: '#232329', ink: '#f5f5f5', muted: '#a6a8b1', line: '#393941', accent: '#6b9bff', accentInk: '#000000' },
      },
    } },
  { id: 'signal', name: 'Signal-style', group: 'inspired',
    desc: 'Blue controls, quiet conversation rows and rounded message fields',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1, shadows: false,
      btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'chat', navStyle: 'tabs', headingTone: 'ink', accent: '#3a76f0',
      colours: {
        light: { bg: '#ffffff', panel: '#f6f6f6', ink: '#1b1b1b', muted: '#5e5e5e', line: '#e9e9e9', accent: '#3a76f0', accentInk: '#000000' },
        dark: { bg: '#121212', panel: '#242424', ink: '#e9e9e9', muted: '#b9b9b9', line: '#3b3b3b', accent: '#7aa7ff', accentInk: '#000000' },
      },
    } },
  { id: 'line', name: 'LINE-style', group: 'inspired',
    desc: 'Green actions, pale grey surfaces and simple round controls',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1, shadows: false,
      btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'chat', navStyle: 'tabs', titleAlign: 'centre', headingTone: 'ink', accent: '#06c755',
      colours: {
        light: { bg: '#f7f7f7', panel: '#ffffff', ink: '#111111', muted: '#717171', line: '#e5e5e5', accent: '#06c755', accentInk: '#000000' },
        dark: { bg: '#111111', panel: '#202020', ink: '#f5f5f5', muted: '#aaaaaa', line: '#353535', accent: '#06c755', accentInk: '#000000' },
      },
    } },
  { id: 'wechat', name: 'WeChat-style', group: 'inspired',
    desc: 'Green actions, grey grouped rows and solid understated bars',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'inset', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', round: 1, borders: 1, shadows: false,
      btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', titleAlign: 'centre', headingTone: 'ink', accent: '#07c160',
      colours: {
        light: { bg: '#ededed', panel: '#ffffff', ink: '#191919', muted: '#666666', line: '#d9d9d9', accent: '#07c160', accentInk: '#000000' },
        dark: { bg: '#111111', panel: '#191919', ink: '#e5e5e5', muted: '#a6a6a6', line: '#303030', accent: '#07c160', accentInk: '#000000' },
      },
    } },
  { id: 'snapchat', name: 'Snapchat-style', group: 'inspired',
    desc: 'Yellow actions, black text, rounded panels and bold tabs',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1, shadows: false,
      btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'bold', tabIcons: true, titleAlign: 'centre',
      headingTone: 'ink', tabTone: 'ink', accent: '#fffc00',
      colours: {
        light: { bg: '#ffffff', panel: '#f5f5f5', ink: '#16191c', muted: '#656b73', line: '#e6e8eb', accent: '#fffc00', accentInk: '#000000' },
        dark: { bg: '#121212', panel: '#1e1e1e', ink: '#ffffff', muted: '#b2b2b2', line: '#333333', accent: '#fffc00', accentInk: '#000000' },
      },
    } },
  { id: 'pinterest', name: 'Pinterest-style', group: 'inspired',
    desc: 'Red actions, soft grey pills and spacious borderless cards',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'ios',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', iconWeight: 'bold', tabIcons: true, headingTone: 'ink', tabTone: 'ink', accent: '#e60023',
      colours: {
        light: { bg: '#ffffff', panel: '#f0f0f0', ink: '#111111', muted: '#5f5f5f', line: '#dedede', accent: '#e60023', accentInk: '#ffffff' },
        dark: { bg: '#101010', panel: '#262626', ink: '#efefef', muted: '#b0b0b0', line: '#3b3b3b', accent: '#ff4b68', accentInk: '#000000' },
      },
    } },
  { id: 'tumblr', name: 'Tumblr-style', group: 'inspired',
    desc: 'Navy ground, white cards, blue actions and bold feed tabs',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'filled', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 0,
      borders: 1, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'bold', tabIcons: true,
      headerStyle: 'filled', headingTone: 'ink', tabTone: 'ink', accent: '#001935',
      colours: {
        light: { bg: '#f2f6fa', panel: '#ffffff', ink: '#001935', muted: '#536471', line: '#d9e0e8', accent: '#001935', accentInk: '#ffffff' },
        dark: { bg: '#001935', panel: '#122943', ink: '#ffffff', muted: '#b5c5d6', line: '#2b405a', accent: '#00b8ff', accentInk: '#000000' },
      },
    } },
  { id: 'netflix', name: 'Netflix-style', group: 'inspired',
    desc: 'Red actions, bold headings and flat cinematic cards',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'material',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', iconWeight: 'bold', headingTone: 'ink', tabTone: 'ink', accent: '#e50914',
      colours: {
        light: { bg: '#ffffff', panel: '#f3f3f3', ink: '#141414', muted: '#666666', line: '#dedede', accent: '#e50914', accentInk: '#ffffff' },
        dark: { bg: '#141414', panel: '#232323', ink: '#ffffff', muted: '#b3b3b3', line: '#3b3b3b', accent: '#e50914', accentInk: '#ffffff' },
      },
    } },
  { id: 'disneyplus', name: 'Disney+-style', group: 'inspired',
    desc: 'Deep blue cinema surfaces, pale blue actions and soft cards',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'material',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', iconWeight: 'thin', headingTone: 'ink', tabTone: 'ink', accent: '#0063e5',
      colours: {
        light: { bg: '#f5f6fa', panel: '#ffffff', ink: '#25283b', muted: '#62667b', line: '#d7d9e3', accent: '#0063e5', accentInk: '#ffffff' },
        dark: { bg: '#040714', panel: '#161a2b', ink: '#f9f9f9', muted: '#b5b8c5', line: '#34394e', accent: '#69b6ff', accentInk: '#000000' },
      },
    } },
  { id: 'primevideo', name: 'Prime Video-style', group: 'inspired',
    desc: 'Blue actions, navy panels and clean spacious media cards',
    look: {
      statusBar: 'header', tabStyle: 'pill', tabIconFill: true, typeStyle: 'ios', iconSet: 'material',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', iconWeight: 'bold', headingTone: 'ink', tabTone: 'ink', accent: '#007cad',
      colours: {
        light: { bg: '#ffffff', panel: '#f1f4f8', ink: '#0f171e', muted: '#536575', line: '#d5dde5', accent: '#007cad', accentInk: '#ffffff' },
        dark: { bg: '#0f171e', panel: '#1b2530', ink: '#ffffff', muted: '#b6c3ce', line: '#334352', accent: '#00a8e1', accentInk: '#000000' },
      },
    } },
  { id: 'applemusic', name: 'Apple Music-style', group: 'inspired',
    desc: 'Pink-red controls, large titles and translucent library bars',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', borders: 1, shadows: false,
      btnStyle: 'tinted', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', barBlur: true, iconWeight: 'thin', headerStyle: 'large', round: 1,
      headingTone: 'ink', accent: '#fa233b',
      colours: {
        light: { bg: '#f2f2f7', panel: '#ffffff', ink: '#1d1d1f', muted: '#6c6c70', line: '#d1d1d6', accent: '#fa233b', accentInk: '#000000' },
        dark: { bg: '#000000', panel: '#1c1c1e', ink: '#f5f5f7', muted: '#98989d', line: '#38383a', accent: '#ff375f', accentInk: '#000000' },
      },
    } },
  { id: 'soundcloud', name: 'SoundCloud-style', group: 'inspired',
    desc: 'Orange actions, grey cards and bold straightforward lists',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'material',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      listStyle: 'edge', headingTone: 'ink', tabTone: 'ink', accent: '#ff5500',
      colours: {
        light: { bg: '#f2f2f2', panel: '#ffffff', ink: '#333333', muted: '#666666', line: '#e5e5e5', accent: '#ff5500', accentInk: '#000000' },
        dark: { bg: '#111111', panel: '#222222', ink: '#f2f2f2', muted: '#b2b2b2', line: '#383838', accent: '#ff7700', accentInk: '#000000' },
      },
    } },
  { id: 'duolingo', name: 'Duolingo-style', group: 'inspired',
    desc: 'Bright green actions, thick outlines and very round controls',
    look: {
      statusBar: 'page', tabStyle: 'plain', tabIconFill: true, listStyle: 'inset', typeStyle: 'ios',
      iconSet: 'soft', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 3,
      borders: 3, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'bold', spacing: 'roomy',
      headingTone: 'ink', accent: '#58cc02',
      colours: {
        light: { bg: '#ffffff', panel: '#ffffff', ink: '#3c3c3c', muted: '#767676', line: '#e5e5e5', accent: '#58cc02', accentInk: '#000000' },
        dark: { bg: '#131f24', panel: '#202f36', ink: '#f1f7fb', muted: '#afbec5', line: '#37464f', accent: '#58cc02', accentInk: '#000000' },
      },
    } },
  { id: 'airbnb', name: 'Airbnb-style', group: 'inspired',
    desc: 'Rose actions, warm black text and spacious rounded cards',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'ios',
      pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'ios', pressStyle: 'highlight', round: 3, borders: 1, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      barBlur: true, spacing: 'roomy', headerStyle: 'large', headingTone: 'ink', tabTone: 'ink',
      accent: '#ff385c',
      colours: {
        light: { bg: '#ffffff', panel: '#f7f7f7', ink: '#222222', muted: '#6a6a6a', line: '#dddddd', accent: '#ff385c', accentInk: '#000000' },
        dark: { bg: '#121212', panel: '#222222', ink: '#f7f7f7', muted: '#b0b0b0', line: '#444444', accent: '#ff6682', accentInk: '#000000' },
      },
    } },
  { id: 'uber', name: 'Uber-style', group: 'inspired',
    desc: 'Black actions, strong typography and simple grey panels',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'sharp',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 1, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      iconWeight: 'bold', spacing: 'roomy', headingTone: 'ink', tabTone: 'ink', accent: '#000000',
      colours: {
        light: { bg: '#ffffff', panel: '#f3f3f3', ink: '#000000', muted: '#545454', line: '#e2e2e2', accent: '#000000', accentInk: '#ffffff' },
        dark: { bg: '#000000', panel: '#1f1f1f', ink: '#ffffff', muted: '#afafaf', line: '#333333', accent: '#ffffff', accentInk: '#000000' },
      },
    } },
  { id: 'grab', name: 'Grab-style', group: 'inspired',
    desc: 'Green actions, soft grey cards and friendly round controls',
    look: {
      statusBar: 'page', tabStyle: 'plain', tabIconFill: true, typeStyle: 'material', iconSet: 'material',
      pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'filled',
      checkStyle: 'round', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1, shadows: false,
      btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'tabs', spacing: 'roomy', headingTone: 'ink', accent: '#00804a',
      colours: {
        light: { bg: '#f7f7f7', panel: '#ffffff', ink: '#1c1c1c', muted: '#676767', line: '#e5e5e5', accent: '#00804a', accentInk: '#ffffff' },
        dark: { bg: '#101c17', panel: '#1b2b23', ink: '#f1f8f4', muted: '#adc0b4', line: '#35483c', accent: '#00b14f', accentInk: '#000000' },
      },
    } },
  { id: 'googlemaps', name: 'Google Maps-style', group: 'inspired',
    desc: 'Blue actions, pale map-grey panels and Material icon pills',
    look: {
      statusBar: 'page', tabStyle: 'indicator', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'filled', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3,
      borders: 1, shadows: false, btnStyle: 'tinted', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'tabs', headingTone: 'ink', accent: '#1a73e8',
      colours: {
        light: { bg: '#f8f9fa', panel: '#ffffff', ink: '#202124', muted: '#5f6368', line: '#dadce0', accent: '#1a73e8', accentInk: '#000000' },
        dark: { bg: '#202124', panel: '#303134', ink: '#e8eaed', muted: '#bdc1c6', line: '#5f6368', accent: '#8ab4f8', accentInk: '#000000' },
      },
    } },
  { id: 'googlecalendar', name: 'Google Calendar-style', group: 'inspired',
    desc: 'Blue actions, crisp white grid panels and fine grey rules',
    look: {
      statusBar: 'page', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1,
      borders: 2, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'timeline', navStyle: 'tabs', headingTone: 'ink', accent: '#1a73e8',
      colours: {
        light: { bg: '#ffffff', panel: '#f8fafd', ink: '#3c4043', muted: '#5f6368', line: '#dadce0', accent: '#1a73e8', accentInk: '#000000' },
        dark: { bg: '#131314', panel: '#1e1f20', ink: '#e3e3e3', muted: '#c4c7c5', line: '#444746', accent: '#a8c7fa', accentInk: '#000000' },
      },
    } },
  { id: 'googlekeep', name: 'Google Keep-style', group: 'inspired',
    desc: 'Yellow actions, paper cards and softly outlined notes',
    look: {
      statusBar: 'page', tabStyle: 'plain', tabIconFill: true, typeStyle: 'material', iconSet: 'material',
      pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'outlined',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 2,
      shadows: false, btnStyle: 'tinted', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'tabs', headingTone: 'ink', tabTone: 'ink', accent: '#fbbc04',
      colours: {
        light: { bg: '#ffffff', panel: '#ffffff', ink: '#202124', muted: '#5f6368', line: '#e0e0e0', accent: '#fbbc04', accentInk: '#000000' },
        dark: { bg: '#202124', panel: '#28292a', ink: '#e8eaed', muted: '#bdc1c6', line: '#5f6368', accent: '#fbbc04', accentInk: '#000000' },
      },
    } },
  { id: 'googledrive', name: 'Google Drive-style', group: 'inspired',
    desc: 'Blue controls, pale blue-grey workspace and rounded panels',
    look: {
      statusBar: 'page', tabStyle: 'indicator', tabIconFill: true, typeStyle: 'material', iconSet: 'material',
      pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'filled',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1,
      shadows: false, btnStyle: 'tinted', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'rail', headingTone: 'ink', accent: '#0b57d0',
      colours: {
        light: { bg: '#f8fafd', panel: '#ffffff', ink: '#1f1f1f', muted: '#444746', line: '#c4c7c5', accent: '#0b57d0', accentInk: '#ffffff' },
        dark: { bg: '#131314', panel: '#1e1f20', ink: '#e3e3e3', muted: '#c4c7c5', line: '#444746', accent: '#a8c7fa', accentInk: '#000000' },
      },
    } },
  { id: 'dropbox', name: 'Dropbox-style', group: 'inspired',
    desc: 'Cobalt actions, cool white workspace and precise square fields',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'sharp', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 0,
      borders: 2, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'rail', spacing: 'tight', headingTone: 'ink', tabTone: 'ink',
      accent: '#0061ff',
      colours: {
        light: { bg: '#f7f5f2', panel: '#ffffff', ink: '#1e1919', muted: '#627280', line: '#d8d3cc', accent: '#0061ff', accentInk: '#ffffff' },
        dark: { bg: '#1e1919', panel: '#2b2929', ink: '#f7f5f2', muted: '#b8b1a9', line: '#484444', accent: '#7daaff', accentInk: '#000000' },
      },
    } },
  { id: 'trello', name: 'Trello-style', group: 'inspired',
    desc: 'Blue board ground, light list panels and compact rounded cards',
    look: {
      statusBar: 'header', tabStyle: 'pill', tabIconFill: true, typeStyle: 'material', iconSet: 'material',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'outlined',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 1,
      btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'rail', spacing: 'tight', headingTone: 'ink', accent: '#0c66e4',
      colours: {
        light: { bg: '#f1f2f4', panel: '#ffffff', ink: '#172b4d', muted: '#44546f', line: '#dcdfe4', accent: '#0c66e4', accentInk: '#ffffff' },
        dark: { bg: '#1d2125', panel: '#282e33', ink: '#b6c2cf', muted: '#9fadbc', line: '#454f59', accent: '#579dff', accentInk: '#000000' },
      },
    } },
  { id: 'asana', name: 'Asana-style', group: 'inspired',
    desc: 'Coral actions, soft grey cards and clear compact task rows',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'material', iconSet: 'material',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'compact',
      navStyle: 'rail', spacing: 'tight', headingTone: 'ink', accent: '#f06a6a',
      colours: {
        light: { bg: '#f9f8f8', panel: '#ffffff', ink: '#1e1f21', muted: '#6d6e6f', line: '#edeae9', accent: '#f06a6a', accentInk: '#000000' },
        dark: { bg: '#1e1f21', panel: '#252628', ink: '#f5f4f3', muted: '#a2a0a2', line: '#424244', accent: '#f58a8a', accentInk: '#000000' },
      },
    } },
  { id: 'todoist', name: 'Todoist-style', group: 'inspired',
    desc: 'Red actions, quiet warm-grey task lists and circular checks',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', round: 1, borders: 1, shadows: false,
      btnStyle: 'plain', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', iconWeight: 'thin', headerStyle: 'large', spacing: 'tight',
      headingTone: 'ink', accent: '#dc4c3e',
      colours: {
        light: { bg: '#fafafa', panel: '#ffffff', ink: '#202020', muted: '#666666', line: '#eeeeee', accent: '#dc4c3e', accentInk: '#000000' },
        dark: { bg: '#1f1f1f', panel: '#282828', ink: '#eeeeee', muted: '#a0a0a0', line: '#3d3d3d', accent: '#ff786b', accentInk: '#000000' },
      },
    } },
  { id: 'things', name: 'Things-style', group: 'inspired',
    desc: 'Blue controls, warm grouped lists and generous task spacing',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'inset', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'square', switchStyle: 'ios', pressStyle: 'highlight', borders: 1, shadows: false,
      btnStyle: 'plain', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', barBlur: true, iconWeight: 'thin', headerStyle: 'large',
      spacing: 'roomy', headingTone: 'ink', accent: '#147efb',
      colours: {
        light: { bg: '#f7f7f5', panel: '#ffffff', ink: '#242424', muted: '#71716e', line: '#e5e5e2', accent: '#147efb', accentInk: '#000000' },
        dark: { bg: '#1c1c1e', panel: '#2c2c2e', ink: '#f2f2f7', muted: '#aeaeb2', line: '#48484a', accent: '#5aa5ff', accentInk: '#000000' },
      },
    } },
  { id: 'craft', name: 'Craft-style', group: 'inspired',
    desc: 'Warm white documents, blue actions and rounded quiet panels',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'ios',
      pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'ios', pressStyle: 'highlight', borders: 1, shadows: false, btnStyle: 'tinted',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      barBlur: true, iconWeight: 'thin', headerStyle: 'large', spacing: 'roomy', headingTone: 'ink',
      tabTone: 'ink', accent: '#2a6df4',
      colours: {
        light: { bg: '#faf9f6', panel: '#ffffff', ink: '#292929', muted: '#6d6d6a', line: '#e7e5e0', accent: '#2a6df4', accentInk: '#000000' },
        dark: { bg: '#1b1b1c', panel: '#262627', ink: '#f3f2ef', muted: '#aaa9a5', line: '#3b3b3d', accent: '#7ba9ff', accentInk: '#000000' },
      },
    } },
  { id: 'onenote', name: 'OneNote-style', group: 'inspired',
    desc: 'Purple tools, clean white note panes and compact sections',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'sharp', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 0,
      borders: 1, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'rail', spacing: 'tight', headerStyle: 'filled',
      headingTone: 'ink', accent: '#7719aa',
      colours: {
        light: { bg: '#f5f5f5', panel: '#ffffff', ink: '#242424', muted: '#616161', line: '#e1dfdd', accent: '#7719aa', accentInk: '#ffffff' },
        dark: { bg: '#1f1f1f', panel: '#292929', ink: '#f5f5f5', muted: '#b3b0ad', line: '#484644', accent: '#c49be8', accentInk: '#000000' },
      },
    } },
  { id: 'outlook', name: 'Outlook-style', group: 'inspired',
    desc: 'Blue tools, cool grey mail panels and compact message lists',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'material', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1,
      borders: 1, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'tabs', spacing: 'tight', headerStyle: 'filled',
      headingTone: 'ink', accent: '#0078d4',
      colours: {
        light: { bg: '#f3f6fc', panel: '#ffffff', ink: '#242424', muted: '#616161', line: '#e1dfdd', accent: '#0078d4', accentInk: '#000000' },
        dark: { bg: '#1f1f1f', panel: '#292929', ink: '#f5f5f5', muted: '#b3b0ad', line: '#484644', accent: '#75b6e7', accentInk: '#000000' },
      },
    } },
  { id: 'applenotes', name: 'Apple Notes-style', group: 'inspired',
    desc: 'Yellow controls, warm paper notes and frosted large-title bars',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'inset', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', borders: 1, shadows: false,
      btnStyle: 'plain', fontUi: 'system', fontLog: 'serif', headFont: 'system', band: 'none',
      rowLayout: 'compact', navStyle: 'tabs', barBlur: true, iconWeight: 'thin', headerStyle: 'large',
      headingTone: 'ink', accent: '#ac7900',
      colours: {
        light: { bg: '#f2f2f7', panel: '#ffffff', ink: '#1c1c1e', muted: '#6c6c70', line: '#d1d1d6', accent: '#ac7900', accentInk: '#000000' },
        dark: { bg: '#000000', panel: '#1c1c1e', ink: '#ffffff', muted: '#98989d', line: '#38383a', accent: '#ffd60a', accentInk: '#000000' },
      },
    } },
  { id: 'applehealth', name: 'Apple Health-style', group: 'inspired',
    desc: 'Coral controls, grouped white cards and large bold titles',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'inset', typeStyle: 'ios',
      iconSet: 'ios', pageMotion: 'ios', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios',
      checkStyle: 'round', switchStyle: 'ios', pressStyle: 'highlight', borders: 1, shadows: false,
      btnStyle: 'plain', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card',
      navStyle: 'tabs', barBlur: true, iconWeight: 'thin', headerStyle: 'large', spacing: 'roomy',
      headingTone: 'ink', accent: '#e93651',
      colours: {
        light: { bg: '#f2f2f7', panel: '#ffffff', ink: '#1c1c1e', muted: '#6c6c70', line: '#d1d1d6', accent: '#e93651', accentInk: '#000000' },
        dark: { bg: '#000000', panel: '#1c1c1e', ink: '#ffffff', muted: '#98989d', line: '#38383a', accent: '#ff6482', accentInk: '#000000' },
      },
    } },
  { id: 'strava', name: 'Strava-style', group: 'inspired',
    desc: 'Orange actions, crisp feed cards and strong activity titles',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'material',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 1, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      iconWeight: 'bold', headingTone: 'ink', accent: '#fc4c02',
      colours: {
        light: { bg: '#f7f7fa', panel: '#ffffff', ink: '#242428', muted: '#66666b', line: '#dedee3', accent: '#fc4c02', accentInk: '#000000' },
        dark: { bg: '#090909', panel: '#1c1c1c', ink: '#f5f5fa', muted: '#aaaab0', line: '#38383d', accent: '#ff763b', accentInk: '#000000' },
      },
    } },
  { id: 'nikerunclub', name: 'Nike Run Club-style', group: 'inspired',
    desc: 'Black-and-white activity panels with electric lime actions',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'sharp',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 0, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', iconWeight: 'bold', tabIcons: true, headingTone: 'ink', tabTone: 'ink', accent: '#c8ff00',
      colours: {
        light: { bg: '#ffffff', panel: '#f5f5f5', ink: '#111111', muted: '#656565', line: '#e5e5e5', accent: '#c8ff00', accentInk: '#000000' },
        dark: { bg: '#000000', panel: '#1a1a1a', ink: '#ffffff', muted: '#b0b0b0', line: '#333333', accent: '#c8ff00', accentInk: '#000000' },
      },
    } },
  { id: 'headspace', name: 'Headspace-style', group: 'inspired',
    desc: 'Warm cream, orange actions and soft spacious rounded cards',
    look: {
      statusBar: 'header', tabStyle: 'pill', tabIconFill: true, typeStyle: 'ios', iconSet: 'soft',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', headingTone: 'ink', tabTone: 'ink', accent: '#f47c20',
      colours: {
        light: { bg: '#fff9f1', panel: '#ffffff', ink: '#413d45', muted: '#6b6570', line: '#e8dfd4', accent: '#f47c20', accentInk: '#000000' },
        dark: { bg: '#211f2b', panel: '#302c3e', ink: '#f6f0e9', muted: '#c1b8cb', line: '#494257', accent: '#ffad66', accentInk: '#000000' },
      },
    } },
  { id: 'calm', name: 'Calm-style', group: 'inspired',
    desc: 'Blue actions, airy rounded panels and serene navy surfaces',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'ios',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'square',
      switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 0, shadows: false, btnStyle: 'tinted',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', iconWeight: 'thin', barBlur: true, tabActiveLabel: true, headingTone: 'ink',
      tabTone: 'ink', accent: '#2869b2',
      colours: {
        light: { bg: '#eef6fc', panel: '#ffffff', ink: '#20334e', muted: '#576b80', line: '#d4e3ef', accent: '#2869b2', accentInk: '#ffffff' },
        dark: { bg: '#10233f', panel: '#1b3454', ink: '#f3f7fc', muted: '#b0c5dc', line: '#365274', accent: '#92c4ff', accentInk: '#000000' },
      },
    } },
  { id: 'medium', name: 'Medium-style', group: 'inspired',
    desc: 'Warm white reading pages, serif headings and green actions',
    look: {
      statusBar: 'header', tabStyle: 'plain', listStyle: 'edge', typeStyle: 'ios', iconSet: 'ios',
      pageMotion: 'fade', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'ios', pressStyle: 'highlight', borders: 0, shadows: false, btnStyle: 'plain',
      fontUi: 'system', fontLog: 'serif', headFont: 'serif', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      iconWeight: 'thin', spacing: 'roomy', round: 0, headingTone: 'ink', tabTone: 'ink', accent: '#1a8917',
      colours: {
        light: { bg: '#ffffff', panel: '#faf9f6', ink: '#242424', muted: '#6b6b6b', line: '#f2f2f2', accent: '#1a8917', accentInk: '#000000' },
        dark: { bg: '#121212', panel: '#1c1c1c', ink: '#e6e6e6', muted: '#a3a3a3', line: '#333333', accent: '#6cce69', accentInk: '#000000' },
      },
    } },
  { id: 'substack', name: 'Substack-style', group: 'inspired',
    desc: 'Warm paper, orange actions and spacious serif reading panels',
    look: {
      statusBar: 'header', tabStyle: 'plain', listStyle: 'edge', typeStyle: 'ios', iconSet: 'ios',
      pageMotion: 'fade', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'ios', pressStyle: 'highlight', borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'serif', headFont: 'serif', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', round: 1, headingTone: 'ink', tabTone: 'ink', accent: '#ff6719',
      colours: {
        light: { bg: '#faf9f6', panel: '#ffffff', ink: '#363737', muted: '#717171', line: '#e3e2de', accent: '#ff6719', accentInk: '#000000' },
        dark: { bg: '#161616', panel: '#222222', ink: '#eeeeee', muted: '#ababab', line: '#383838', accent: '#ff853d', accentInk: '#000000' },
      },
    } },
  { id: 'kindle', name: 'Kindle-style', group: 'inspired',
    desc: 'Cream reading paper, quiet serif type and restrained blue tools',
    look: {
      statusBar: 'header', tabStyle: 'plain', listStyle: 'edge', typeStyle: 'ios', iconSet: 'sharp',
      pageMotion: 'fade', sheetStyle: 'ios', toastStyle: 'ios', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'ios', pressStyle: 'highlight', borders: 0, shadows: false, btnStyle: 'plain',
      fontUi: 'system', fontLog: 'serif', headFont: 'serif', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      iconWeight: 'thin', spacing: 'roomy', round: 0, headingTone: 'ink', tabTone: 'ink', accent: '#0073bb',
      colours: {
        light: { bg: '#fbf5e9', panel: '#fffaf0', ink: '#29251f', muted: '#6b6256', line: '#ded5c5', accent: '#0073bb', accentInk: '#ffffff' },
        dark: { bg: '#121212', panel: '#202020', ink: '#dfdfdf', muted: '#a6a6a6', line: '#3a3a3a', accent: '#76bce8', accentInk: '#000000' },
      },
    } },
  { id: 'github', name: 'GitHub-style', group: 'inspired',
    desc: 'Fine borders, blue links and compact neutral repository panels',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'sharp', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1,
      borders: 2, shadows: false, btnStyle: 'outlined', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'rail', spacing: 'tight', headingTone: 'ink',
      accent: '#0969da',
      colours: {
        light: { bg: '#f6f8fa', panel: '#ffffff', ink: '#1f2328', muted: '#59636e', line: '#d1d9e0', accent: '#0969da', accentInk: '#ffffff' },
        dark: { bg: '#0d1117', panel: '#151b23', ink: '#f0f6fc', muted: '#9198a1', line: '#3d444d', accent: '#4493f8', accentInk: '#000000' },
      },
    } },
  { id: 'figma', name: 'Figma-style', group: 'inspired',
    desc: 'Neutral canvas, blue tools and precise square workspace panels',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, listStyle: 'edge', typeStyle: 'material',
      iconSet: 'sharp', pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material',
      fieldStyle: 'outlined', checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 0,
      borders: 2, shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system',
      band: 'none', rowLayout: 'compact', navStyle: 'rail', spacing: 'tight', headingTone: 'ink', tabTone: 'ink',
      accent: '#0d99ff',
      colours: {
        light: { bg: '#f5f5f5', panel: '#ffffff', ink: '#1e1e1e', muted: '#666666', line: '#e6e6e6', accent: '#0d99ff', accentInk: '#000000' },
        dark: { bg: '#1e1e1e', panel: '#2c2c2c', ink: '#ffffff', muted: '#b3b3b3', line: '#444444', accent: '#80caff', accentInk: '#000000' },
      },
    } },
  { id: 'canva', name: 'Canva-style', group: 'inspired',
    desc: 'Violet actions, soft grey canvas and friendly rounded panels',
    look: {
      statusBar: 'page', tabStyle: 'pill', tabIconFill: true, typeStyle: 'material', iconSet: 'soft',
      pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'filled',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'tabs', spacing: 'roomy', headingTone: 'ink', tabTone: 'ink',
      accent: '#8b3dff',
      colours: {
        light: { bg: '#f6f7f8', panel: '#ffffff', ink: '#0d1216', muted: '#596066', line: '#e1e4e7', accent: '#8b3dff', accentInk: '#ffffff' },
        dark: { bg: '#18191b', panel: '#252627', ink: '#f5f5f5', muted: '#a6abb0', line: '#414447', accent: '#be95ff', accentInk: '#000000' },
      },
    } },
  { id: 'shopee', name: 'Shopee-style', group: 'inspired',
    desc: 'Orange actions, pale grey shopping cards and compact rounded rows',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'material', iconSet: 'material',
      pageMotion: 'material', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'filled',
      checkStyle: 'square', switchStyle: 'material', pressStyle: 'highlight', round: 1, borders: 1,
      shadows: false, btnStyle: 'filled', fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none',
      rowLayout: 'card', navStyle: 'tabs', headerStyle: 'filled', spacing: 'tight', headingTone: 'ink',
      accent: '#ee4d2d',
      colours: {
        light: { bg: '#f5f5f5', panel: '#ffffff', ink: '#222222', muted: '#666666', line: '#e8e8e8', accent: '#ee4d2d', accentInk: '#000000' },
        dark: { bg: '#141414', panel: '#242424', ink: '#f5f5f5', muted: '#b0b0b0', line: '#3b3b3b', accent: '#ff8065', accentInk: '#000000' },
      },
    } },
  { id: 'starbucks', name: 'Starbucks-style', group: 'inspired',
    desc: 'Deep green actions, warm white cards and generous rounded panels',
    look: {
      statusBar: 'header', tabStyle: 'plain', tabIconFill: true, typeStyle: 'ios', iconSet: 'ios',
      pageMotion: 'fade', sheetStyle: 'material', toastStyle: 'material', fieldStyle: 'ios', checkStyle: 'round',
      switchStyle: 'material', pressStyle: 'highlight', round: 3, borders: 0, shadows: false, btnStyle: 'filled',
      fontUi: 'system', fontLog: 'system', headFont: 'system', band: 'none', rowLayout: 'card', navStyle: 'tabs',
      spacing: 'roomy', headingTone: 'ink', tabTone: 'ink', accent: '#00754a',
      colours: {
        light: { bg: '#f7f7f7', panel: '#ffffff', ink: '#1e3932', muted: '#59655f', line: '#d4ddd8', accent: '#00754a', accentInk: '#ffffff' },
        dark: { bg: '#12251f', panel: '#1e3932', ink: '#f1f8f4', muted: '#b4c8be', line: '#38564b', accent: '#5fcba0', accentInk: '#000000' },
      },
    } },
];
// the Inspired themes shown on the Themes page; the rest are under Browse all themes (owner, 19 Oct 2026)
export const FEATURED = ['apple', 'pixel', 'evernote', 'obsidian', 'notion', 'whatsapp', 'office', 'acgme'];
export const themeById = id => THEMES.find(t => t.id === id) || THEMES[0];

// the look keys to save when a theme is picked: its own values, the defaults (null) for the rest, kept keys as now
export function themePatch(theme, current = {}) {
  const patch = { theme: theme.id === 'nuhs' ? null : theme.id };
  for (const k of THEME_KEYS) patch[k] = (theme.keep || []).includes(k) ? current[k] ?? null : theme.look[k] ?? null;
  return keepPhoto(patch, current);
}
// does the device's look still match its theme? -> { theme, custom }
export function themeState(d = {}) {
  const theme = themeById(d.theme || 'nuhs');
  // off switches save as false or null alike (Soft shadows aside: false there means off, null on)
  // (colours is an object: compared by its contents)
  const val = (o, k) => (o[k] === false && k !== 'shadows' ? null : o[k] && typeof o[k] === 'object' ? JSON.stringify(o[k]) : o[k] ?? null);
  const photo = d.wallpaper === 'photo' && !theme.look.wallpaper;   // (kept by keepPhoto: not a change)
  const custom = THEME_KEYS.some(k => !(theme.keep || []).includes(k) && val(d, k) !== val(theme.look, k)
    && !(k === 'borders' && d.flat && theme.look.flat) && !(photo && (k === 'wallpaper' || k === 'wallDim')));
  return { theme, custom };
}
// The problems with a theme (an empty list when it is fine): run over every theme by the tests, so a new one can't
// set an unknown key or value, leave text hard to read, or use a brand name without "-style" (docs/theme-engine.md)
export function checkTheme(t) {
  const bad = [];
  if (!/^[a-z0-9]{1,20}$/.test(t.id || '')) bad.push('id: lower-case letters and digits');
  if (!t.name || (t.group === 'inspired' && !/-style$/.test(t.name))) bad.push('name: Inspired themes end in "-style"');
  if (!['classic', 'inspired'].includes(t.group)) bad.push('group: classic or inspired');
  if (!t.desc || t.desc.length > 90) bad.push('desc: one short line');
  if (t.mode) bad.push('mode: themes never set light or dark');
  for (const [k, v] of Object.entries(t.look || {})) {
    if (!THEME_KEYS.includes(k)) bad.push(`look.${k}: not a look setting`);
    else if (FACETS.some(f => f.key === k) && cleanFacet(k, v) === null) bad.push(`look.${k}: ${JSON.stringify(v)} is not one of its choices`);
    else if (TUNE_KEYS.includes(k) && cleanTune(k, v) === null) bad.push(`look.${k}: ${JSON.stringify(v)} is out of range`);
  }
  if (t.look?.bgTint && !TINTS[t.look.bgTint]) bad.push(`look.bgTint: no tint ${t.look.bgTint}`);
  const lk = t.look || {};
  if (lk.wallpaper != null && !cleanPattern(lk.wallpaper)) bad.push('look.wallpaper: a pattern (never a photo)');
  if (lk.wallDim != null && cleanDim(lk.wallDim) === null) bad.push('look.wallDim: 0 to 90 in steps of 5');
  if (lk.iconTint != null && !/^#[0-9a-f]{6}$/.test(lk.iconTint)) bad.push('look.iconTint: #rrggbb');
  if (lk.iconTintStrength != null && cleanTintStrength(lk.iconTintStrength) === null) bad.push('look.iconTintStrength: 10 to 100 in steps of 10');
  if (lk.tabIcon != null && JSON.stringify(cleanTabIcons(lk.tabIcon)) !== JSON.stringify(lk.tabIcon)) bad.push('look.tabIcon: tab ids to icons in TAB_ICONS, in order');
  if (t.band && !(t.band.length === 4 && t.band.every(c => /^#[0-9a-f]{6}$/.test(c)))) bad.push('band: four #rrggbb colours');
  try { checkColours(t.look || {}, TINTS[t.look?.bgTint] || {}); } catch (err) { bad.push('colours: ' + err.message); }
  return bad;
}
export const themeLabel = d => { const { theme, custom } = themeState(d); return custom ? `Custom (based on ${theme.name})` : theme.name; };

// the four top-band colours, or null for the usual behaviour (NUH stripe with the default colour, else shades),
// or 'none' for no band
export function bandColours(d = {}) {
  const b = d.band || 'theme';
  if (b === 'none') return 'none';
  if (b === 'nuh') return NUH_BAND;
  if (b === 'shades') return 'shades';
  const t = themeById(d.theme || 'nuhs');
  return t.band || null;
}

// The CSS for the look settings that aren't classes: the tint, the band, the heading font, spacing and tab style.
// shades: the four band colours worked out from the accent (colors.js lightPalette), used when the band says so.
// Cascade layers (index.html: base, facets, theme, custom): the colours go in the theme layer, after the accent's
// (display.js applyAccent), so they win over style.css's palettes without :root stacking; the band and the facets
// say their own layer (facetCss). Browsers without layers skip it all and keep the default look.
export function lookCss(d = {}, shades = null) {
  const colours = [], rules = [];
  const tint = TINTS[d.bgTint] && d.bgTint !== 'auto' ? TINTS[d.bgTint] : null;
  const vars = o => Object.entries(o).map(([k, v]) => `--${k}: ${v};`).join(' ');
  if (tint) {
    if (tint.light) colours.push(`:root:not([data-theme="dark"]) { ${vars(tint.light)} }`);
    if (tint.dark) {
      colours.push(`:root[data-theme="dark"] { ${vars(tint.dark)} }`);
      colours.push(`@media (prefers-color-scheme: dark) { :root[data-theme="auto"] { ${vars(tint.dark)} } }`);
    }
  }
  const band = bandColours(d);
  const four = band === 'shades' ? shades : Array.isArray(band) ? band : null;
  if (band === 'none') rules.push('@layer base { .top { background: var(--panel); } .top, .top[class] { padding-top: max(12px, env(safe-area-inset-top, 0px)); } }');
  else if (four && four.length === 4) colours.push(`:root, :root[data-theme="dark"] { --s1: ${four[0]}; --s2: ${four[1]}; --s3: ${four[2]}; --s4: ${four[3]}; }`);
  if (d.headFont && d.headFont !== 'same' && STACKS[d.headFont]) colours.push(`:root { --font-head: ${STACKS[d.headFont]}; }`);
  // the theme engine's facets (theme-engine.js): App-style details, spacing, tab style; nothing unless chosen
  rules.push(...facetCss(d));
  colours.push(coloursCss(d.colours));
  // after the colours, so they follow the palette: a wallpaper pattern (wallpaper.js) and the icon tint (theme-engine.js)
  colours.push(patternCss(d), iconTintCss(d));
  const layer = (name, css) => (css.filter(Boolean).length ? `@layer ${name} {\n${css.filter(Boolean).join('\n')}\n}` : '');
  return [...rules, layer('theme', colours), tuneCss(d)].filter(Boolean).join('\n');
}
