// Settings tab (#settings): the Admin entry (admins only), display, logging, templates, recycle bin, privacy. Also the Account tab's
// "You" and sign-out cards (youCard, signOutCard), used by ui-account.js.

import { YEAR_NAMES, DEFAULT_NAMES, BY_CODE } from './categories.js';
import { sortCodes, uid, academicYear, withParents } from './engine.js';
import { S, h, toast, modal, confirmBox, cloud, catChip, catName, catShort, PICKER_ORDER, pickerOrder, settings, patchLogbook, displayName, hooks, rYear, myYearName, fill, categoryNames, setCategoryNames, catPills, tagSet, download, fileButton, todayISO, saveMany } from './ui-core.js';
import { MAX_TAGS, tagLinks as tagLinksIn, learnShorthand, cleanShorthand, shorthandOf, DEFAULT_SHORTHAND, cleanTagSet, defaultTagSet, tagTree, flatTree, moveTag, reparentTag, removeTag, newKey, tagSetToCsv, tagSetFromCsv, dropTag, canPlace } from './tags.js';
import { pickDialog } from './ui-log.js';
import { OPERATOR_HELP } from './search-ops.js';
import { PRESETS, DEFAULT_ACCENT, cleanAccent, schemeCss, lightPalette } from './colors.js';
import { cleanMarkdown, storedMarkdown, mdCase, mdDay, reflectionPath, reflectionNote, CASE_FILLINS, REFL_FILLINS, FM_FIELDS } from './markdown.js';
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
export const DISPLAY_KEYS = ['compact', 'textSize', 'zoom', 'accent', 'startTab', 'fontUi', 'fontUiName', 'fontLog', 'fontLogName'];
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
export function applyDisplay(d = display()) { applyCompact(!!d.compact); applyTextSize(d.textSize || '1'); applyZoom(d.zoom || '1'); applyAccent(d.accent); applyFonts(d); }

export function renderDisplay() {
  const st = display();
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Display'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', role: 'switch', checked: !!st.compact, onchange: e => {
        applyCompact(e.target.checked); setDisplay({ compact: e.target.checked });
      } }), 'Compact mode'),
      h('p', { class: 'hint help', style: 'margin:2px 0 0' }, 'Smaller chips, rows and spacing so more tags fit on screen.'),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Interface zoom',
        h('select', { 'aria-label': 'Interface zoom', onchange: e => { applyZoom(e.target.value); setDisplay({ zoom: e.target.value }); } },
          ZOOMS.map(v => h('option', { value: v, selected: String(st.zoom || '1') === v }, `${Math.round(v * 100)}%${v === '1' ? ' (default)' : ''}`)))),
      h('p', { class: 'hint help', style: 'margin:2px 0 0' }, 'Everything bigger or smaller, the header and tabs too. On a computer: Ctrl + and Ctrl − (⌘ on a Mac), Ctrl 0 for 100%.'),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Text size',
        h('select', { 'aria-label': 'Text size', onchange: e => { applyTextSize(e.target.value); setDisplay({ textSize: e.target.value }); } },
          TEXT_SIZES.map(([v, l]) => h('option', { value: v, selected: String(st.textSize || '1') === v }, l)))),
      h('p', { class: 'hint help', style: 'margin:2px 0 0' }, 'Only the words: buttons and spacing stay as they are.'),
      fontPicker('ui'),
      fontPicker('log'),
      h('div', { class: 'field', style: 'margin-top:10px' }, 'Colour', accentPicker()),
      h('p', { class: 'hint', style: 'margin:2px 0 0' }, 'Light and dark versions are worked out to stay easy to read.'),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Light or dark',
        h('select', { onchange: e => applyTheme(e.target.value) },
          [['light', 'Light'], ['dark', 'Dark'], ['oled', 'OLED (pure black)'], ['auto', 'Auto (match the phone)']].map(([v, l]) => h('option', { value: v, selected: cachedTheme() === v }, l)))),
      // the tab the app opens on (a link or shortcut to a tab still opens that tab)
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Open the app on',
        h('select', { onchange: e => { setDisplay({ startTab: e.target.value }); toast('Saved'); } },
          START_TABS.map(([v, l]) => h('option', { value: v, selected: (st.startTab || 'log') === v }, l)))),
      h('p', { class: 'hint', style: 'margin:10px 0 0' }, 'Everything on this page is saved on this device only, so a phone and a computer can each look the way that suits them.')));
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

// suggested colours, then any colour (a custom pick shows as the last swatch)
function accentPicker() {
  const cur = () => cleanAccent(display().accent) || DEFAULT_ACCENT;
  const wrap = h('div', { class: 'accent-pick', role: 'group', 'aria-label': 'Colour' });
  const pick = c => { applyAccent(c); setDisplay({ accent: c === DEFAULT_ACCENT ? null : c }); paint(); };
  const paint = () => {
    const c = cur(), custom = !PRESETS.some(([x]) => x === c);
    const input = h('input', { type: 'color', value: c, 'aria-label': 'Any colour', oninput: e => applyAccent(e.target.value), onchange: e => pick(e.target.value) });
    fill(wrap,
      ...PRESETS.map(([x, name]) => h('button', { type: 'button', class: 'swatch', title: name, 'aria-label': name, 'aria-pressed': String(c === x), style: `--sw:${x}`, onclick: () => pick(x) }, h('span', { class: 'sr' }, name))),
      h('label', { class: 'swatch custom' + (custom ? ' on' : ''), title: 'Any colour', style: custom ? `--sw:${c}` : '' }, h('span', { 'aria-hidden': 'true' }, custom ? '' : '+'), input));
  };
  paint();
  return wrap;
}
export const START_TABS = [['log', 'Log'], ['logbook', 'Logbook'], ['reflect', 'Reflections'], ['progress', 'Analytics']];

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
  const pre = () => h('pre', { class: 'fmt-preview' });
  const dayOut = pre(), oneOut = pre(), reflOut = h('pre', { class: 'fmt-preview', style: 'max-height:24em;overflow:auto' }), pathOut = h('div', { class: 'hint', style: 'margin:8px 0 2px' });
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
      h('p', { class: 'hint help', style: 'margin:0' }, 'One format for Copy and Share on the Logbook tab and for Download for notes apps (More → Export / Import). The default copies the date, initials and case, never the tags.'),
      h('h3', { style: 'margin:14px 0 0' }, 'Copy and share'),
      lbl('Day heading', area('dayHead', 'Day heading', 1), 'For example ## {{date}} or ## [[{{date}}]].'),
      lbl('Each case in a day', area('dayCase', 'Each case in a day', 3), 'A blank line goes between cases when each takes more than one line.'),
      fillins(CASE_FILLINS),
      h('div', { class: 'hint', style: 'margin:8px 0 2px' }, latest ? 'Preview (your latest day)' : 'Preview'), dayOut,
      lbl('One case', area('oneCase', 'One case', 3)),
      h('div', { class: 'hint', style: 'margin:8px 0 2px' }, 'Preview'), oneOut,
      h('h3', { style: 'margin:14px 0 0' }, 'Dates, tags and links'),
      pick('dateFormat', 'Dates ({{date}})', [['iso', '2026-10-10'], ['long', '10 Oct 2026'], ['dmy', '10/10/2026']]),
      pick('cats', 'Tags ({{categories}})', [['names', 'Names (Lower Segment Caesarean Section)'], ['codes', 'Codes (16)'], ['tags', '#tags (#LSCS)']]),
      pick('links', 'Links between notes', [['wiki', 'Wiki links [[note]] (Obsidian)'], ['md', 'Markdown links [note](note.md)']])),
    h('section', { class: 'card' },
      h('h2', {}, 'Notes export'),
      h('p', { class: 'hint help', style: 'margin:0' }, 'How Download for notes apps lays out the zip: case notes, one note per reflection, Progress.md and the figures in images/.'),
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

export function renderLogging() {
  const st = settings();
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Logging'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.suggestions !== false, onchange: e => patchLogbook({ settings: { suggestions: e.target.checked } }) }),
        'Suggest tags as I type'),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Enter key in the case box',
        h('select', { onchange: e => patchLogbook({ settings: { enterMode: e.target.value, enterSaves: null } }).then(() => toast('Saved')) },
          [['newline', 'New line (default)'], ['double', 'Press Enter twice to save'], ['single', 'Enter saves (Shift+Enter for a new line)']].map(([v, l]) =>
            h('option', { value: v, selected: (st.enterMode || (st.enterSaves ? 'single' : 'newline')) === v }, l)))),
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'Twice: Enter on an empty line saves, so a case can still take several lines. Ctrl+Enter (Cmd+Enter on a Mac) always saves.'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.weeklyDigest, onchange: e => patchLogbook({ settings: { weeklyDigest: e.target.checked } }) }),
        'Show last week’s summary on the Case tab (once a week)'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !st.hideTips, onchange: e => patchLogbook({ settings: { hideTips: !e.target.checked } }) }),
        'Show tips and help text'),
      h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'Off for experienced users: hides the explanations around the app (like the one at the top of the tag editor), the privacy and photo reminders, and the tips for the tags you pick.'),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Case box height on the Case tab',
        h('select', { onchange: e => patchLogbook({ settings: { boxLines: Number(e.target.value) } }).then(() => toast('Saved')) },
          Array.from({ length: 19 }, (_, i) => i + 2).map(n => h('option', { value: String(n), selected: n === (Math.min(20, Math.max(2, Number(st.boxLines) || 3))) }, `${n} lines${n === 3 ? ' (default)' : ''}`)))),
      h('p', { class: 'hint help', style: 'margin:8px 0 6px' }, 'How the Logbook search works (everything, initials or procedure; fuzzy) is under Filter on the Logbook tab, and is remembered.'),
      // operators in the Logbook search box (search-ops.js); off by default, so plain searches never change meaning
      h('label', { class: 'check', style: 'margin-top:8px' }, h('input', { type: 'checkbox', role: 'switch', checked: !!st.searchOps, onchange: e => patchLogbook({ settings: { searchOps: e.target.checked } }).then(() => toast(e.target.checked ? 'Advanced search on' : 'Advanced search off')) }),
        'Advanced search'),
      h('div', { class: 'hint', style: 'margin:0 0 6px' },
        h('p', { style: 'margin:0 0 4px' }, 'Lets you type operators in the Logbook and Reflections search boxes (a ? next to each lists them; tap one to add it):'),
        h('ul', { class: 'ops-list' }, OPERATOR_HELP.map(([op, what]) => h('li', {}, h('code', {}, op), ' ', what))),
        h('p', { style: 'margin:4px 0 0' }, 'Reflections have their own: heading:, title:, diagnosis:, case: and initials:.'),
        h('p', { style: 'margin:4px 0 0' }, 'Off by default because a few plain searches change meaning when it’s on: a word starting with “-” leaves cases out, and OR in capitals means either.')),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Date for a new case',
        h('select', { onchange: e => patchLogbook({ settings: { defaultDate: e.target.value } }) },
          h('option', { value: 'today', selected: st.defaultDate !== 'last' }, 'Today'),
          h('option', { value: 'last', selected: st.defaultDate === 'last' }, 'The date I used last')))));
}

export function renderReflectionSettings() {
  const st = settings();
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Reflections'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.reflExport !== false, onchange: e => patchLogbook({ settings: { reflExport: e.target.checked } }) }),
        'New reflections are included in the portfolio export'),
      h('p', { class: 'hint help', style: 'margin:0' }, 'Untick if you write many and would rather choose which go in. Reflections already written keep their own tick.')),
    h('section', { class: 'card' },
      h('h2', {}, 'Photos'),
      (() => { const kb = photoUsageKb(S.reflections), pct = Math.min(100, Math.round(kb / PHOTO_BUDGET_KB * 100));
        return [h('p', { style: 'margin:0 0 6px' }, `${fmtMb(kb)} of ${fmtMb(PHOTO_BUDGET_KB)} used by your reflection figures`),
          h('div', { style: 'height:8px;border-radius:4px;background:var(--line, #ddd);overflow:hidden' }, h('div', { style: `height:100%;width:${pct}%;background:${pct >= 90 ? 'var(--err, #b91c1c)' : 'var(--accent, #002f6c)'}` }))]; })(),
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
        const ok = await cloud.synced();
        btn.disabled = false;
        if (!ok && !(await confirmBox('Not synced yet', 'Some cases or changes on this device have not reached the server yet (no signal?). Signing out now deletes them. Wait for signal and try again, or sign out anyway?', 'Sign out anyway', true))) return;
        cloud.signOut();
      } }, 'Sign out'),
      cloud.demo ? h('span', { class: 'muted' }, 'Demo mode: data stays in this browser.') : null));
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
    h('summary', {}, 'Default tag names'),
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
    h('button', { type: 'button', class: 'te-name', onclick: () => editTag(n) },
      h('span', { class: 'te-pill' }, nameOf(n)),
      n.kind === 'head' ? null : h('small', { class: 'muted te-sub' },
        [n.kind === 'cat' ? 'APMES · ' + catName(n.code) : linkText(n), count(n), n.e.hide ? 'hidden' : ''].filter(Boolean).join(' · '))),
    h('button', { class: 'small icon-btn', 'aria-label': 'Move up', onclick: () => saveTags(moveTag(set, n.e.k, -1)) }, '↑'),
    h('button', { class: 'small icon-btn', 'aria-label': 'Move down', onclick: () => saveTags(moveTag(set, n.e.k, 1)) }, '↓'));
  // pills: tap to edit, drag (press and hold on a phone) onto the left or right of another to go
  // before or after it, onto its middle to go inside
  const pill = n => h('li', { 'data-k': n.e.k, class: `te-pillitem te-${n.kind} d${Math.min(n.depth, 3)}${n.e.hide ? ' te-hidden' : ''}${tev.last === n.e.k ? ' te-last' : ''}`, tabindex: '0', role: 'button',
    title: n.kind === 'cat' ? catName(n.code) : n.kind === 'head' ? 'Section header' : linkText(n),
    onpointerdown: e => pillDown(e, n.e.k, e.currentTarget), onclick: () => { if (!pillDragged) editTag(n); }, onkeydown: e => { if (e.key === 'Enter') editTag(n); } },
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
      ? [h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'Tap a pill to edit it. Drag one (press and hold on a phone) onto the left or right of another to move it, or onto its middle to put it inside. The number is how many cases have it.'),
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
  const set = tagSet();
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
  const under = h('select', { disabled: !!sub || kind === 'head' },
    h('option', { value: '' }, sub ? catShort(sub) : 'Top level'),
    places.map(x => h('option', { value: x.e.k, selected: e.p === x.e.k }, `${'  '.repeat(Math.min(x.depth, 4))}${x.kind === 'cat' ? catShort(x.code) : x.e.n}${x.kind === 'head' ? ' (header)' : ''}`)));
  const pill = h('input', { value: e.n || '', maxlength: kind === 'head' ? '60' : '40', placeholder: code ? dflt.pill : kind === 'head' ? 'e.g. Regional' : 'e.g. Interscalene' });
  const long = h('input', { value: e.l || '', maxlength: '100', placeholder: code ? ((DEFAULT_NAMES[code] || [])[0] || BY_CODE[code].name) : 'optional' });
  const hide = h('input', { type: 'checkbox', checked: !!e.hide });
  const placeNote = anchor ? h('p', { class: 'hint', style: 'margin:0 0 6px' }, `Goes after “${anchor.n || (anchor.k.startsWith('c:') ? catShort(anchor.k.slice(2)) : '')}” (${anchor === last ? 'the last one you tapped' : 'the section of the last one you tapped'}).`) : null;
  const kw = h('textarea', { rows: '3', value: shorthandOf(e).join(', '), maxlength: '1000', placeholder: kind === 'cat' ? 'e.g. flap, free flap' : 'e.g. appy, lap appy', autocapitalize: 'off', spellcheck: 'false' });
  const linkBox = h('div', { class: 'te-links' }, PICKER_ORDER.map(c => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: e.links.includes(c.code), onchange: ev => { e.links = ev.target.checked ? [...e.links, c.code] : e.links.filter(x => x !== c.code); } }),
    `${c.parent ? '\u00a0\u00a0' : ''}${catName(c.code)}`)));
  const m = modal(n ? (kind === 'cat' ? 'Edit APMES tag' : kind === 'head' ? 'Edit header' : 'Edit personal tag') : (kind === 'head' ? 'New section header' : 'New personal tag'), [
    code ? h('p', { class: 'hint' }, `APMES: ${BY_CODE[code].full}. It always counts towards this APMES tag; renaming is just for you.`) : null,
    placeNote,
    h('label', { class: 'field' }, kind === 'head' ? 'Header' : 'Name (pill)', pill),
    kind !== 'head' ? h('label', { class: 'field' }, 'Long name (lists)', long) : null,
    kind !== 'head' ? h('label', { class: 'field' }, 'Sits under', under) : null,
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
      n && kind !== 'cat' ? h('button', { class: 'danger', onclick: async () => { m.close(); await saveTags(removeTag(set, e.k)); toast('Removed (cases keep the tag)'); } }, 'Remove') : null,
      n && kind === 'tag' ? h('button', { onclick: () => { m.close(); mergeTag(n); } }, 'Merge…') : null,
      h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        const nm = pill.value.trim();
        if (kind !== 'cat' && !nm) return toast('Give it a name');
        const out = { ...e, n: nm, l: long.value.trim(), hide: hide.checked, kw: kind === 'head' ? [] : cleanShorthand(kw.value) };
        if (!out.l) delete out.l; if (!out.hide) delete out.hide;
        // an APMES tag left on the built-in list keeps following it (and gets later additions)
        if (code ? out.kw.join() === (DEFAULT_SHORTHAND[code] || []).join() : !out.kw.length) delete out.kw; if (!out.n && kind === 'cat') delete out.n;
        if (kind !== 'tag') delete out.links;
        if (!n && set.filter(x => !x.k.startsWith('c:')).length >= MAX_TAGS) return toast(`You have ${MAX_TAGS} personal tags and headers, the most there can be. Remove one first.`);
        let next = n ? set.map(x => (x.k === e.k ? out : x)) : [...set, out];
        const p = sub ? 'c:' + sub : under.value;
        if ((e.p || '') !== p || !n) next = reparentTag(next, e.k, p);
        // new, beside the same parent as the last tapped: right after it
        if (!n && anchor && (anchor.p || '') === p) { const placed = dropTag(next, e.k, anchor.k, 'after'); if (placed !== next) next = placed; }
        if (!n) tev.last = e.k;   // the next new one follows this one
        m.close(); await saveTags(next);
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
