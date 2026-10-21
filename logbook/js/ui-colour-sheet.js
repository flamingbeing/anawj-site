// The colour sheet (TE S2, 21 Oct 2026; owner: the phone's own picker shows only a few colours): a grid of shades
// (colour-grid.js), a hex box, Recent (this device) and the phone's own picker last. Used for the Colour (accent), the
// icon tint and Edit colours. The grid is one group of radio buttons ("Teal, shade 5"): arrows left and right move
// along a row, up and down to the shade above or below. With `shade`, each cell also shows the deeper shade the
// palette uses for text and buttons (a pastel shows as a soft tint with a deeper dot). Resolves the colour, or null.

import { h, modal } from './ui-core.js';
import { cleanAccent, lightPalette, darkPalette, contrast } from './colors.js';
import { GRID, SHADES, HUES, snap, pushRecent } from './colour-grid.js';

const RECENT_KEY = 'apmes-logbook-recent-colours';
export const recentColours = () => { try { return pushRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')); } catch { return []; } };
const keepRecent = c => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(recentColours(), c))); } catch { /* private mode: no Recent */ } };
const darkNow = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); };
// what the palette makes of a colour for text and buttons (colors.js), and how well it reads
export const accentNote = c => {
  const L = lightPalette(c).accent, D = darkPalette(c).accent;
  return `Text and buttons: ${L} in light (${contrast(L, '#ffffff').toFixed(1)}:1 on white), ${D} in dark (${contrast(D, '#1b1e23').toFixed(1)}:1 on the cards).`;
};

export function colourSheet({ title = 'Colour', value, shade = false, note = accentNote, onPreview } = {}) {
  const start = cleanAccent(value);
  let cur = start, done = false;
  const dark = shade && darkNow();
  const deep = c => (dark ? darkPalette(c).accent : lightPalette(c).accent);
  const big = h('span', { class: 'cs-big', 'aria-hidden': 'true' });
  const hexOut = h('b', { class: 'cs-hex' });
  const say = h('p', { class: 'hint cs-note', role: 'status', 'aria-live': 'polite' });
  const hexBox = h('input', { type: 'text', class: 'cs-hexbox', maxlength: '7', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Hex colour', placeholder: '#1f6f5c',
    oninput: e => { const v = e.target.value.trim(); const c = cleanAccent(v.startsWith('#') ? v : '#' + v); if (c) choose(c, 'hex'); } });
  const radios = [];
  const grid = h('fieldset', { class: 'cs-grid', style: `--cols:${SHADES}` }, h('legend', {}, 'Colours'),
    HUES.map((hue, row) => h('div', { class: 'cs-row', role: 'group', 'aria-label': hue }, GRID.slice(row * SHADES, row * SHADES + SHADES).map(x => {
      const d = shade ? deep(x.c) : x.c;
      const r = h('input', { type: 'radio', name: 'cs-grid', value: x.c, 'aria-label': x.name, onchange: () => choose(x.c, 'grid') });
      radios.push(r);
      return h('label', { class: 'cs-cell' + (d !== x.c && contrast(d, x.c) > 1.6 ? ' deep' : ''), style: `--c:${x.c};--d:${d}`, title: x.name }, r, h('i', { 'aria-hidden': 'true' }));
    }))));
  // up and down: the same shade one hue up or down (the browser's own arrows only go along the list)
  grid.addEventListener('keydown', e => {
    const i = radios.indexOf(e.target), by = e.key === 'ArrowDown' ? SHADES : e.key === 'ArrowUp' ? -SHADES : 0;
    if (i < 0 || !by || !radios[i + by]) return;
    e.preventDefault(); radios[i + by].focus(); radios[i + by].click();
  });
  const recent = recentColours();
  const recentRow = recent.length ? h('div', { class: 'cs-recent', role: 'group', 'aria-label': 'Recent colours' }, h('span', { class: 'hint', style: 'margin:0' }, 'Recent'),
    recent.map(c => h('button', { type: 'button', class: 'swatch', style: `--sw:${c}`, 'aria-label': 'Recent ' + c, title: c, onclick: () => choose(c, 'recent') }))) : null;
  const phone = h('input', { type: 'color', value: start || '#1f6f5c', 'aria-label': 'The phone’s own colour picker', oninput: e => choose(snap(e.target.value), 'phone') });
  function choose(c, from) {
    cur = c;
    big.style.background = c; hexOut.textContent = c;
    if (from !== 'hex') hexBox.value = c;
    for (const r of radios) r.checked = r.value === c;
    say.textContent = note ? note(c) : '';
    if (from !== 'start') onPreview?.(c);
  }
  return new Promise(resolve => {
    const m = modal(title, [
      h('div', { class: 'cs-now' }, big, h('span', {}, hexOut, say)),
      grid,
      recentRow,
      h('label', { class: 'field cs-hexrow' }, 'Hex', hexBox),
      h('label', { class: 'btn small cs-phone' }, phone, 'Use the phone’s own picker…'),
      // (kept in view at the bottom while the grid scrolls)
      h('div', { class: 'bar dlg-actions' }, h('span', { class: 'grow' }),
        h('button', { type: 'button', onclick: () => m.close() }, 'Cancel'),
        h('button', { type: 'button', class: 'primary', onclick: () => { done = true; m.close(); } }, 'Use this colour')),
    ], { cls: 'colour-sheet', onclose: () => {
      if (done && cur) { keepRecent(cur); resolve(cur); return; }
      if (start && cur !== start) onPreview?.(start);
      resolve(null);
    } });
    if (start) choose(start, 'start'); else say.textContent = 'Pick a colour.';
    m.el.querySelector('.cs-cell input:checked')?.scrollIntoView?.({ block: 'nearest' });
  });
}
