// The colour sheet's grid (TE S2, 21 Oct 2026; the phone's own picker offers only a few colours): 12 hues × 8 shades
// (OKLCH lightness 0.96 to 0.35, as much colour as fits) and a grey row, every colour already at 6 bits a channel
// (snap) so a theme link carries it in 18 bits, or as its place in this grid. Written out once (not worked out on
// the phone) so a link made on one phone reads the same on any other; the list only ever grows at the end
// (test/fixtures/theme-links.json). Pure, unit-tested (test/colour-grid.test.mjs).

import { cleanAccent } from './colors.js';

export const HUES = ['Red', 'Orange', 'Amber', 'Yellow', 'Lime', 'Green', 'Teal', 'Cyan', 'Blue', 'Indigo', 'Purple', 'Pink', 'Grey'];
export const SHADES = 8;
const PACKED = 'ffefebffd2caffaaa2ff796dff2428d70018a20010710008ffefe3ffd2b6ffae79fb8200d26d00aa59008241005d2d00ffefd7fbdba2efba59db9a00b68200966900714d004d3500'
  + 'f7f3d2ebdfa2d7c659beaa009e8e00827100615500453d00ebf7d7ceebaeaad27586be006d9e005982004161002d4100dffbe3baefc286db9224c65900aa45008a35006924004918'
  + 'd2fbf3a2efe345dfca00c2ae00a29200867500655900453ddbf7ff9eebff41dbf700badb009eb6007d9600617100414debf3ffcadfff9ec6ff6daaff358aff0069e70051ae00357d'
  + 'efefffd7dbffb6beff969eff7975ff6149fb4931ca311c92f7efffe7d7ffd7b2ffc286ffae55ff962de37114b2510082ffebf3ffcee3ffa2ceff69baef24a2ca00869a00656d0045'
  + 'ffffffe7e7e7cececeaaaaaa8686866161613d3d3d000000';
// every cell in order (row by row, lightest first): its colour and the name a screen reader says
export const GRID = Array.from({ length: PACKED.length / 6 }, (_, i) => {
  const hue = HUES[Math.floor(i / SHADES)], shade = (i % SHADES) + 1;
  const name = hue === 'Grey' && shade === 1 ? 'White' : hue === 'Grey' && shade === SHADES ? 'Black' : `${hue}, shade ${shade}`;
  return { c: '#' + PACKED.slice(i * 6, i * 6 + 6), name, hue, shade };
});
export const gridIndex = c => GRID.findIndex(x => x.c === cleanAccent(c));

// 6 bits a channel (64 levels): at most 2/255 off, too little to see (ΔE2000 under 1). A colour from the grid, the
// phone's picker or Recent is snapped as it is picked, so what is saved, checked and sent is the same; a hex typed in
// the box stays exactly as typed.
const level = v => Math.round(v * 63 / 255);
export const snap = c => {
  const x = cleanAccent(c);
  return x && '#' + [1, 3, 5].map(i => Math.round(level(parseInt(x.slice(i, i + 2), 16)) * 255 / 63).toString(16).padStart(2, '0')).join('');
};
export const isSnapped = c => !!cleanAccent(c) && snap(c) === cleanAccent(c);
// the 18 bits of a snapped colour, and back
export const bits18 = c => [1, 3, 5].reduce((n, i) => n * 64 + level(parseInt(c.slice(i, i + 2), 16)), 0);
export const fromBits18 = n => '#' + [12, 6, 0].map(s => Math.round(((n >> s) & 63) * 255 / 63).toString(16).padStart(2, '0')).join('');

// Recent colours (this device only): newest first, no repeats, at most 8
export const MAX_RECENT = 8;
export const pushRecent = (list, c) => {
  const x = cleanAccent(c);
  const old = Array.isArray(list) ? list.map(cleanAccent).filter(Boolean) : [];
  return x ? [x, ...old.filter(y => y !== x)].slice(0, MAX_RECENT) : old.slice(0, MAX_RECENT);
};
