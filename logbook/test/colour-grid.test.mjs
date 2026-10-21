// Fake data only. The colour sheet's grid (colour-grid.js; TE S2): every cell snapped and named, snapping invisible
// (at most 2/255 a channel) and safe for every bundled theme, Recent colours.
import assert from 'node:assert/strict';
import { GRID, HUES, SHADES, gridIndex, snap, isSnapped, bits18, fromBits18, pushRecent, MAX_RECENT } from '../js/colour-grid.js';
import { THEMES, checkTheme } from '../js/themes.js';

assert.equal(GRID.length, HUES.length * SHADES);
assert.equal(new Set(GRID.map(x => x.c)).size, GRID.length, 'no colour twice');
for (const x of GRID) assert.ok(isSnapped(x.c), x.name + ' ' + x.c);
assert.equal(GRID[gridIndex('#00A292')].name, 'Teal, shade 5');
assert.deepEqual([GRID.at(-SHADES).name, GRID.at(-1).name], ['White', 'Black']);
assert.equal(gridIndex('#123456'), -1);

// snapping: 64 levels a channel, never more than 2 off, the same twice, and back from 18 bits
for (let v = 0; v < 256; v++) {
  const c = '#' + [v, 255 - v, (v * 7) % 256].map(x => x.toString(16).padStart(2, '0')).join('');
  const s = snap(c);
  for (const i of [1, 3, 5]) assert.ok(Math.abs(parseInt(c.slice(i, i + 2), 16) - parseInt(s.slice(i, i + 2), 16)) <= 2, c + ' ' + s);
  assert.equal(snap(s), s); assert.equal(fromBits18(bits18(s)), s);
}
assert.equal(snap('#FFFFFF'), '#ffffff'); assert.equal(snap('#000000'), '#000000'); assert.equal(snap('nope'), null);
assert.ok(!isSnapped('#556677') && isSnapped(snap('#556677')));

// a bundled theme with every colour snapped still passes its checks (so snapping a pick never makes a look fail)
const snapLook = look => ({ ...look, ...(look.accent ? { accent: snap(look.accent) } : {}), ...(look.iconTint ? { iconTint: snap(look.iconTint) } : {}),
  ...(look.colours ? { colours: Object.fromEntries(Object.entries(look.colours).map(([s, t]) => [s, Object.fromEntries(Object.entries(t).map(([k, c]) => [k, snap(c)]))])) } : {}) });
for (const t of THEMES) assert.deepEqual(checkTheme({ ...t, look: snapLook(t.look) }), [], t.id);

// Recent: newest first, no repeats, at most 8, junk dropped
let r = [];
for (const c of ['#111111', '#222222', '#111111', 'bad']) r = pushRecent(r, c);
assert.deepEqual(r, ['#111111', '#222222']);
for (let i = 0; i < 12; i++) r = pushRecent(r, '#0000' + String(i).padStart(2, '0'));
assert.equal(r.length, MAX_RECENT); assert.equal(r[0], '#000011');
assert.deepEqual(pushRecent('junk', null), []);
console.log('colour-grid: ok');
