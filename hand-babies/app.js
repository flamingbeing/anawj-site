// Hand assessment: draws the teaching figures (inline SVG), offline worker. No data leaves the phone.
'use strict';

const SKIN = '#f6dcc8', EDGE = '#8a6450', CREASE = '#c49a82';
const RED = '#d7263d', GREEN = '#1a8a3a', BLUE = '#1f6fb5', ORANGE = '#e07b00', PURPLE = '#7b4fb0', INK = '#222';
const MED = 'rgba(31,111,181,.38)', ULN = 'rgba(224,123,0,.42)', RAD = 'rgba(26,138,58,.38)';

// Stylised LEFT hand, palm side (thumb on the left = radial). viewBox 0 0 200 270.
const FINGERS = [
  { n: 'index', x: 52, w: 22, top: 42, dip: 60, pip: 82 },
  { n: 'middle', x: 77, w: 23, top: 28, dip: 49, pip: 76 },
  { n: 'ring', x: 103, w: 22, top: 40, dip: 59, pip: 82 },
  { n: 'little', x: 128, w: 19, top: 64, dip: 77, pip: 93 },
];
const THUMB_T = 'translate(56 196) rotate(-38)';
const shapes = () => [
  `<rect x="66" y="218" width="66" height="52"/>`,
  `<rect x="-13" y="-82" width="26" height="94" rx="13" transform="${THUMB_T}"/>`,
  ...FINGERS.map(f => `<rect x="${f.x}" y="${f.top}" width="${f.w}" height="${140 - f.top}" rx="${f.w / 2}"/>`),
  `<rect x="48" y="116" width="102" height="118" rx="20"/>`,
].join('');
const fingerShapes = () => FINGERS.map(f => `<rect x="${f.x}" y="${f.top}" width="${f.w}" height="${140 - f.top}" rx="${f.w / 2}"/>`).join('')
  + `<rect x="48" y="116" width="102" height="118" rx="20"/><rect x="66" y="218" width="66" height="52"/>`;
const creases = () => FINGERS.map(f => [f.dip, f.pip].map(y => `<line x1="${f.x + 3}" y1="${y}" x2="${f.x + f.w - 3}" y2="${y}"/>`).join('')).join('')
  + `<line x1="-9" y1="-40" x2="9" y2="-40" transform="${THUMB_T}"/>`
  + `<path d="M150 134 Q112 124 80 132" fill="none"/><path d="M62 130 Q70 180 84 222" fill="none"/><line x1="70" y1="222" x2="128" y2="222"/>`;
let uid = 0;
// base hand; `over(clipId)` draws coloured regions clipped to the hand outline
function hand(over = () => '', { fingersOnly = false } = {}) {
  const id = 'hc' + (++uid);
  return `<defs><clipPath id="${id}">${fingersOnly ? fingerShapes() : shapes()}</clipPath></defs>
  <g fill="${SKIN}" stroke="${EDGE}" stroke-width="1.5">${shapes()}</g>
  <g clip-path="url(#${id})">${over()}</g>
  <g stroke="${CREASE}" stroke-width="1" fill="none">${creases()}</g>`;
}
const svg = (vb, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 11}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'start'}" font-weight="${o.bold ? 700 : 400}">${s}</text>`;
const arrowDef = (id, c) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
const line = (x1, y1, x2, y2, c, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${o.w || 1.5}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.arrow ? `marker-end="url(#${o.arrow})"` : ''}/>`;

// Animation helpers. Every figure is a function of time s (seconds) and loops every `dur` seconds; its last
// second(s) hold the complete diagram, which is also the still frame (reduced motion, print, GIF poster).
const cl = v => Math.max(0, Math.min(1, v));
const ease = v => v < .5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2;
const ph = (s, a, b) => ease(cl((s - a) / (b - a)));             // 0 before a, 1 after b
const win = (s, a, b, r = .3) => ph(s, a, a + r) * (1 - ph(s, b - r, b)); // 1 inside [a, b]
const lerp = (a, b, k) => a + (b - a) * k;
const op = (k, body) => k <= .001 ? '' : k >= .999 ? body : `<g opacity="${k.toFixed(3)}">${body}</g>`;
const rgba = (c, a) => `rgba(${c},${a.toFixed(3)})`;
const C_MED = '31,111,181', C_ULN = '224,123,0', C_RAD = '26,138,58', C_RED = '215,38,61';
function bubble(x, y, s, c) {
  const w = s.length * 6.4 + 14;
  return `<rect x="${x - w / 2}" y="${y - 12}" width="${w}" height="20" rx="10" fill="#fff" stroke="${c}" stroke-width="1.5"/>${t(x, y + 2, s, { anchor: 'middle', fill: c, bold: true, size: 11 })}`;
}
// a cotton bud tip touching the skin, with a ripple while it touches
function probe(x, y, s, touching) {
  const r = touching ? 7 + 8 * ((s * 1.6) % 1) : 0;
  return `${touching ? `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="none" stroke="${BLUE}" stroke-width="2" opacity="${(1 - (s * 1.6) % 1).toFixed(2)}"/>` : ''}
    <line x1="${x + 4}" y1="${y - 4}" x2="${x + 34}" y2="${y - 34}" stroke="#bbb" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${x}" cy="${y}" r="7" fill="#fff" stroke="${BLUE}" stroke-width="2"/>`;
}
// piecewise path through keyframes [[time, x, y], ...]
function along(s, keys) {
  if (s <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) if (s <= keys[i][0]) {
    const [t0, x0, y0] = keys[i - 1], [t1, x1, y1] = keys[i], k = ease((s - t0) / (t1 - t0));
    return [lerp(x0, x1, k), lerp(y0, y1, k)];
  }
  return keys[keys.length - 1].slice(1);
}

const FIGS = {
  // one finger, palm side, cut over the radial side of the proximal phalanx; a probe tests three places
  distal: Object.assign(s => {
    const x0 = 130, x1 = 210, cx = 170;
    const cut = ph(s, .3, 1), numb = ph(s, 1, 1.8);
    const [px, py] = along(s, [[1.9, 150, 330], [2.5, 150, 268], [3.8, 150, 268], [4.4, 150, 58], [5.8, 150, 58], [6.3, 190, 58]]);
    const probeOn = win(s, 1.9, 8, .3);
    const at = (a, b) => s >= a && s <= b;
    return svg('0 0 380 340', `<defs>${arrowDef('ag', GREEN)}${arrowDef('ar', RED)}</defs>
      <rect x="${x0}" y="20" width="${x1 - x0}" height="300" rx="40" fill="${SKIN}" stroke="${EDGE}" stroke-width="2"/>
      ${op(numb, `<path d="M${x0 + 2} 60 Q${x0 + 2} 20 ${cx} 20 L${cx} 218 L${x0 + 2} 218 Z" fill="rgba(215,38,61,.22)"/>`)}
      <g stroke="${CREASE}" stroke-width="1.5"><line x1="${x0 + 6}" y1="92" x2="${x1 - 6}" y2="92"/><line x1="${x0 + 6}" y1="170" x2="${x1 - 6}" y2="170"/><line x1="${x0 + 6}" y1="300" x2="${x1 - 6}" y2="300"/></g>
      <line x1="${cx}" y1="24" x2="${cx}" y2="316" stroke="#999" stroke-dasharray="3 4"/>
      <path d="M${x0 + 12} 316 L${x0 + 12} 226" stroke="#e6b800" stroke-width="4" fill="none"/>
      ${op(1 - numb, `<path d="M${x0 + 12} 226 L${x0 + 12} 60 Q${x0 + 14} 40 ${x0 + 26} 32" stroke="#e6b800" stroke-width="4" fill="none"/>`)}
      ${op(numb, `<path d="M${x0 + 12} 210 L${x0 + 12} 60 Q${x0 + 14} 40 ${x0 + 26} 32" stroke="#e6b800" stroke-width="4" stroke-dasharray="6 4" fill="none"/>`)}
      <path d="M${x1 - 12} 316 L${x1 - 12} 60 Q${x1 - 14} 40 ${x1 - 26} 32" stroke="#e6b800" stroke-width="4" fill="none"/>
      ${cut > 0 ? `<path d="M${x0 - 6} 226 L${(x0 - 6 + (cx - 8 - x0 + 6) * cut).toFixed(1)} ${(226 - 20 * cut).toFixed(1)}" stroke="${RED}" stroke-width="5" stroke-linecap="round"/>` : ''}
      ${t(cx, 14, 'fingertip (pulp) · LEFT index, palm side', { anchor: 'middle', size: 11 })}
      ${t(x0 + 4, 104, 'DIP', { size: 9, fill: '#7a5a48' })}${t(x0 + 4, 182, 'PIP', { size: 9, fill: '#7a5a48' })}
      ${op(ph(s, 4.5, 4.9), `${t(4, 52, '✓ TEST HERE', { fill: GREEN, bold: true, size: 13 })}${t(4, 67, 'radial half of pulp', { fill: GREEN, size: 11 })}${line(112, 58, 136, 58, GREEN, { w: 2, arrow: 'ag' })}`)}
      ${op(ph(s, 6.4, 6.8), `${t(376, 52, '✓ AND HERE', { fill: GREEN, bold: true, size: 13, anchor: 'end' })}${t(376, 67, 'ulnar half (compare)', { fill: GREEN, size: 11, anchor: 'end' })}${line(268, 58, 204, 58, GREEN, { w: 2, arrow: 'ag' })}`)}
      ${op(numb, `${t(4, 140, 'Numb if the radial', { fill: RED, size: 11 })}${t(4, 154, 'digital nerve is cut', { fill: RED, size: 11 })}`)}
      ${op(cut, `${t(4, 214, 'CUT', { fill: RED, bold: true, size: 13 })}${line(34, 210, 120, 216, RED, { w: 1.5, arrow: 'ar' })}`)}
      ${op(ph(s, 2.8, 3.2), `${t(4, 262, '✗ Testing here', { fill: RED, bold: true, size: 13 })}${t(4, 277, 'proves nothing', { fill: RED, size: 11 })}${t(4, 291, '(nerve not yet cut)', { fill: RED, size: 11 })}${line(104, 268, 136, 268, RED, { w: 2, arrow: 'ar' })}`)}
      ${t(376, 236, 'yellow = digital', { size: 10, anchor: 'end', fill: '#7a6400' })}${t(376, 249, 'nerves (one each side)', { size: 10, anchor: 'end', fill: '#7a6400' })}
      ${t(x0 - 4, 334, '← RADIAL side', { size: 10, fill: '#555', anchor: 'end' })}${t(x1 + 4, 334, 'ULNAR side →', { size: 10, fill: '#555' })}
      ${op(probeOn, probe(px, py, s, at(2.5, 3.8) || at(4.4, 5.8) || at(6.3, 7.6)))}
      ${at(2.6, 3.8) ? bubble(150, 300, '"feels normal"', '#555') : ''}
      ${at(4.5, 5.8) ? bubble(150, 92, '"numb"', RED) : ''}
      ${at(6.4, 7.6) ? bubble(196, 92, '"normal"', GREEN) : ''}`);
  }, { dur: 9.5 }),

  // palm cut through a common digital nerve -> facing halves of middle and ring numb
  palmcut: Object.assign(s => {
    const mid = FINGERS[1], ring = FINGERS[2];
    const midC = mid.x + mid.w / 2, ringC = ring.x + ring.w / 2;
    const cut = ph(s, .5, 1.2), numb = ph(s, 1.3, 2.3);
    const distal = `M101 146 L101 130 L${mid.x + mid.w - 3} 110 L${mid.x + mid.w - 3} 40 M101 130 L${ring.x + 3} 110 L${ring.x + 3} 50`;
    return svg('0 0 380 270', `<defs>${arrowDef('ar2', RED)}</defs><g transform="translate(90 0)">${hand(() => `
        <rect x="${midC}" y="0" width="${mid.x + mid.w - midC}" height="140" fill="${rgba(C_RED, .45 * numb)}"/>
        <rect x="${ring.x}" y="0" width="${ringC - ring.x}" height="140" fill="${rgba(C_RED, .45 * numb)}"/>`, { fingersOnly: true })}
      <path d="M101 168 L101 146" stroke="#e6b800" stroke-width="2.5" fill="none"/>
      ${op(1 - numb, `<path d="${distal}" stroke="#e6b800" stroke-width="2.5" fill="none"/>`)}
      ${op(numb, `<path d="${distal}" stroke="#e6b800" stroke-width="2.5" stroke-dasharray="4 3" fill="none"/>`)}
      ${cut > 0 ? `<path d="M88 150 L${(88 + 26 * cut).toFixed(1)} ${(150 - 10 * cut).toFixed(1)}" stroke="${RED}" stroke-width="5" stroke-linecap="round"/>` : ''}</g>
      ${op(cut, `${t(4, 150, 'CUT in palm', { fill: RED, bold: true, size: 13 })}${t(4, 165, 'divides a common', { fill: RED })}${t(4, 179, 'digital nerve', { fill: RED })}${line(80, 150, 172, 146, RED, { w: 1.5, arrow: 'ar2' })}`)}
      ${op(ph(s, 2, 2.6), `${t(376, 40, 'Numb: ulnar half', { fill: RED, bold: true, anchor: 'end' })}${t(376, 54, 'of MIDDLE and', { fill: RED, bold: true, anchor: 'end' })}${t(376, 68, 'radial half of RING', { fill: RED, bold: true, anchor: 'end' })}`)}
      ${op(ph(s, 2.8, 3.4), `${t(376, 96, 'Test both fingers', { anchor: 'end' })}${t(376, 110, 'either side of a', { anchor: 'end' })}${t(376, 124, 'palm wound', { anchor: 'end' })}`)}
      ${t(190, 266, 'LEFT hand, palm side', { anchor: 'middle', size: 10, fill: '#555' })}`);
  }, { dur: 6.5 }),

  // 2PD: left, random one or two points along the finger; right, two points across the midline land on both nerves
  twopd: Object.assign(s => {
    const END = 6.6, done = s >= END;
    const touches = [[.5, true], [1.8, false], [3.1, true]];
    const tip = (ox, ok) => {
      const cx = ox + 85;
      let dots = [], k = 0, label = '';
      if (ok) {
        for (const [t0, two] of touches) {
          const w = win(s, t0, t0 + 1, .15);
          if (w > 0) { k = w; dots = two ? [[cx - 22, 52], [cx - 22, 82]] : [[cx - 22, 67]]; label = two ? '"two"' : '"one"'; }
        }
        if (s > 4.3) { k = Math.max(k, ph(s, 4.3, 4.6)); if (!label) dots = [[cx - 22, 52], [cx - 22, 82]]; }
      } else {
        k = win(s, 4.9, 6.2, .15) + (s > 6.2 ? ph(s, 6.2, 6.5) : 0);
        dots = [[cx - 16, 68], [cx + 16, 68]];
      }
      k = cl(k);
      const nerveHot = !ok && win(s, 4.9, 6.2, .15) > 0.5;
      const dim = ok ? 1 : (s < 4.6 ? .35 : 1);
      return `<g opacity="${dim}"><path d="M${ox + 30} 170 L${ox + 30} 70 Q${ox + 30} 18 ${cx} 18 Q${ox + 140} 18 ${ox + 140} 70 L${ox + 140} 170" fill="${SKIN}" stroke="${EDGE}" stroke-width="2"/>
        <line x1="${ox + 36}" y1="138" x2="${ox + 134}" y2="138" stroke="${CREASE}" stroke-width="1.5"/>
        <line x1="${cx}" y1="22" x2="${cx}" y2="168" stroke="#999" stroke-dasharray="3 4"/>
        <path d="M${ox + 40} 170 L${ox + 40} 60" stroke="${nerveHot ? RED : '#e6b800'}" stroke-width="${nerveHot ? 5 : 3}" opacity=".8"/><path d="M${ox + 130} 170 L${ox + 130} 60" stroke="${nerveHot ? RED : '#e6b800'}" stroke-width="${nerveHot ? 5 : 3}" opacity=".8"/>
        ${nerveHot ? `${line(cx - 18, 76, ox + 42, 104, RED, { w: 1.2, dash: '2 2' })}${line(cx + 18, 76, ox + 128, 104, RED, { w: 1.2, dash: '2 2' })}${t(cx, 122, '1 point per nerve', { anchor: 'middle', size: 9.5, fill: RED, bold: true })}` : ''}
        ${k > 0 ? dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${(11 * k).toFixed(1)}" fill="#fff" opacity=".55"/><circle cx="${x}" cy="${y}" r="${(6 * k).toFixed(1)}" fill="${ok ? GREEN : RED}" stroke="#fff" stroke-width="2"/>`).join('') : ''}
        ${ok && label && k > .5 ? t(cx + 4, 72, label, { size: 13, bold: true, fill: INK }) : ''}
        ${ok && (done || (s > 4.3 && !label)) ? line(cx - 34, 52, cx - 34, 82, GREEN, { w: 1.5 }) + t(cx - 38, 71, '5mm', { size: 9, anchor: 'end', fill: GREEN }) : ''}
        ${t(cx, 156, 'DIP crease', { size: 9, anchor: 'middle', fill: '#7a5a48' })}</g>
        ${op(ok ? 1 : ph(s, 5.1, 5.5), `${t(cx, 192, ok ? '✓ Along the finger,' : '✗ Across the midline', { anchor: 'middle', fill: ok ? GREEN : RED, bold: true, size: 13 })}
        ${t(cx, 208, ok ? 'one half of the pulp;' : 'each point = a different', { anchor: 'middle', fill: ok ? GREEN : RED, size: 11 })}
        ${t(cx, 222, ok ? 'mix 1 and 2 at random' : 'nerve: a cut nerve "passes"', { anchor: 'middle', fill: ok ? GREEN : RED, size: 11 })}`)}`;
    };
    return svg('0 0 380 230', tip(0, true) + tip(190, false));
  }, { dur: 9 }),

  // nerve territories, one nerve at a time, then all
  nerves: Object.assign(s => {
    const split = 114, all = ph(s, 7.6, 8);
    const act = [win(s, 0, 2.6, .4), win(s, 2.6, 5.2, .4), win(s, 5.2, 7.8, .4)];
    const base = [.38, .42, .38], C = [C_MED, C_ULN, C_RAD];
    const al = i => base[i] * all + (1 - all) * (.07 + .55 * act[i]);
    const MED_ = rgba(C[0], al(0)), ULN_ = rgba(C[1], al(1)), RAD_ = rgba(C[2], al(2));
    const volar = () => `<rect x="0" y="0" width="${split}" height="270" fill="${MED_}"/><rect x="${split}" y="0" width="100" height="270" fill="${ULN_}"/>`;
    const dorsal = () => `<rect x="0" y="0" width="${split}" height="80" fill="${MED_}"/><rect x="0" y="80" width="${split}" height="190" fill="${RAD_}"/><rect x="${split}" y="0" width="100" height="270" fill="${ULN_}"/>`;
    const dot = (x, y, i) => {
      const pulse = act[i] * (1 - all) * (.5 + .5 * Math.sin(s * 8));
      return `<circle cx="${x}" cy="${y}" r="${(6 + 4 * pulse).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="${(2.5 + pulse).toFixed(1)}"/><circle cx="${x}" cy="${y}" r="2" fill="${INK}"/>`;
    };
    const caps = [['MEDIAN', 'test the index fingertip pulp', BLUE], ['ULNAR', 'test the little fingertip pulp', ORANGE], ['RADIAL', 'test the back of the 1st web space', GREEN]];
    return svg('0 0 400 330', `
      <g transform="translate(0 6)">${hand(volar)}${dot(63, 50, 0)}${dot(137.5, 72, 1)}</g>
      <g transform="translate(400 6) scale(-1 1)">${hand(dorsal)}${dot(48, 134, 2)}</g>
      ${t(100, 292, 'PALM side', { anchor: 'middle', bold: true })}${t(300, 292, 'BACK of hand', { anchor: 'middle', bold: true })}
      ${t(100, 306, '(LEFT hand)', { anchor: 'middle', size: 10, fill: '#555' })}${t(300, 306, '(LEFT hand)', { anchor: 'middle', size: 10, fill: '#555' })}
      ${caps.map(([n, d, c], i) => op(act[i] * (1 - all), `${t(200, 325, `${n}: ${d}`, { anchor: 'middle', bold: true, fill: c, size: 13 })}`)).join('')}
      ${op(all, `<rect x="8" y="314" width="14" height="12" fill="${rgba(C_MED, .38)}"/>${t(26, 324, 'Median')}
      <rect x="86" y="314" width="14" height="12" fill="${rgba(C_ULN, .42)}"/>${t(104, 324, 'Ulnar')}
      <rect x="156" y="314" width="14" height="12" fill="${rgba(C_RAD, .38)}"/>${t(174, 324, 'Radial')}
      <circle cx="240" cy="320" r="5" fill="none" stroke="${INK}" stroke-width="2"/>${t(250, 324, '= best spot to test')}`)}`);
  }, { dur: 10 }),

  // fingers relax into the cascade; the cut middle finger stays straight
  cascade: Object.assign(s => {
    const k = ph(s, .4, 2.2), flag = ph(s, 2.3, 2.8);
    const row = (oy, broken) => ['Index', 'Middle', 'Ring', 'Little'].map((n, i) => {
      const x = 22 + i * 92, cut = broken && i === 1, a = cut ? 0 : [8, 14, 20, 26][i] * k;
      const pink = cut && flag > .5;
      return finger(chain(x, oy, [a, a, a], [36, 22, 17]), { color: pink ? '#f7b3bd' : SKIN, w: 12, base: false })
        + t(x + 34, oy + 72, n, { anchor: 'middle', size: 11, fill: pink ? RED : INK, bold: pink });
    }).join('');
    return svg('0 0 380 250', `
      ${t(4, 16, 'Normal cascade: each finger more bent, index → little', { bold: true, fill: GREEN, size: 12 })}
      ${row(36, false)}
      ${t(4, 136, 'Middle finger flexors cut: it lies straight', { bold: true, fill: RED, size: 12 })}
      ${row(156, true)}
      ${t(190, 246, 'side view, hand relaxing; dots = MCP, PIP, DIP joints', { anchor: 'middle', size: 10, fill: '#555' })}`);
  }, { dur: 6 }),

  fdp: Object.assign(s => sideTest('fdp', s), { dur: 5.5 }),
  fds: Object.assign(s => sideTest('fds', s), { dur: 6.5 }),

  // zones light up one by one, then all
  zones: Object.assign(s => {
    const all = ph(s, 6.4, 6.9);
    const act = [0, 1, 2, 3, 4].map(i => win(s, .3 + i * 1.2, 1.5 + i * 1.2, .25));
    const Z = [[C_RED, .40], [C_MED, .35], [C_RAD, .35], [C_ULN, .40], ['123,79,176', .35]];
    const zc = i => rgba(Z[i][0], Z[i][1] * all + (1 - all) * (.06 + .5 * act[i]));
    const bands = [[0, 140, 1], [140, 192, 2], [192, 222, 3], [222, 270, 4]];
    const over = () => bands.map(([y0, y1, i]) => `<rect x="0" y="${y0}" width="200" height="${y1 - y0}" fill="${zc(i)}"/>`).join('')
      + FINGERS.map(f => `<rect x="${f.x}" y="0" width="${f.w}" height="${(f.dip + f.pip) / 2}" fill="${zc(0)}"/>`).join('');
    const lbl = (i, y, s2, sub, c) => op(all + (1 - all) * (.25 + .75 * act[i]), `${line(152, y, 214, y, c, { w: 1.2 })}${t(218, y + 4, s2, { bold: true, fill: c, size: 12 })}${sub ? t(218, y + 18, sub, { size: 10, fill: '#444' }) : ''}`);
    return svg('0 0 380 290', `<g>${hand(over, { fingersOnly: true })}</g>
      ${lbl(0, 40, 'Zone I', 'distal to FDS insertion: FDP only', RED)}
      ${lbl(1, 100, 'Zone II', '"no man\'s land": both in sheath', BLUE)}
      ${lbl(2, 166, 'Zone III', 'palm', GREEN)}
      ${lbl(3, 206, 'Zone IV', 'carpal tunnel', ORANGE)}
      ${lbl(4, 246, 'Zone V', 'wrist / forearm', PURPLE)}
      ${t(4, 14, 'Thumb:', { bold: true, size: 10 })}${t(4, 27, 'T1 distal to IP', { size: 10 })}${t(4, 40, 'T2 IP to MCP', { size: 10 })}${t(4, 53, 'T3 thenar', { size: 10 })}
      ${t(100, 284, 'LEFT hand, palm side', { anchor: 'middle', size: 10, fill: '#555' })}`);
  }, { dur: 9 }),

  // bad close-up, bad far shot, then wide -> zoom -> close-up
  photo: Object.assign(s => {
    const phone = (x, w, h, inner, y = 10) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#222"/><svg x="${x + 5}" y="${y + 12}" width="${w - 10}" height="${h - 24}" viewBox="0 0 100 160" preserveAspectRatio="xMidYMid slice"><rect width="100" height="160" fill="#ddd"/>${inner}</svg>`;
    const closeOnly = `<rect width="100" height="160" fill="${SKIN}"/><ellipse cx="50" cy="80" rx="36" ry="22" fill="#c0392b" opacity=".75"/><path d="M28 84 L72 74" stroke="#7a0010" stroke-width="5" stroke-linecap="round"/><circle cx="20" cy="40" r="6" fill="#a82a2a" opacity=".6"/>`;
    const farOnly = `<rect width="100" height="160" fill="#c9c3b5"/><rect x="5" y="10" width="40" height="30" fill="#8c9aa6"/><rect x="60" y="110" width="35" height="40" fill="#a08670"/><rect x="10" y="120" width="30" height="8" fill="#6d6d6d"/>
      <svg x="52" y="40" width="22" height="30" viewBox="0 0 200 270">${shapesOnly()}<path d="M118 70 L132 64" stroke="#b0001a" stroke-width="5"/></svg>`;
    const ring = 16 + (s > 5 && s < 6.4 ? 4 * Math.sin((s - 5) * 9) : 0);
    const wide = `<rect width="100" height="160" fill="#4a8fb3"/><svg x="4" y="8" width="92" height="150" viewBox="0 0 200 270">${shapesOnly()}<path d="M106 66 L124 58" stroke="#b0001a" stroke-width="5" stroke-linecap="round"/><circle cx="115" cy="62" r="${ring.toFixed(1)}" fill="none" stroke="#ffeb3b" stroke-width="3"/></svg>`;
    const close = `<rect width="100" height="160" fill="#4a8fb3"/><rect x="18" y="-10" width="64" height="180" rx="30" fill="${SKIN}" stroke="${EDGE}"/><line x1="22" y1="60" x2="78" y2="60" stroke="${CREASE}"/><path d="M34 98 L66 86" stroke="#b0001a" stroke-width="4" stroke-linecap="round"/>
      <rect x="18" y="128" width="64" height="10" fill="#fff8c4" stroke="#999" stroke-width=".5"/>${[0, 1, 2, 3, 4, 5, 6].map(i => `<line x1="${22 + i * 9}" y1="128" x2="${22 + i * 9}" y2="${i % 2 ? 132 : 135}" stroke="#333" stroke-width=".6"/>`).join('')}`;
    const a1 = .2 + .8 * ph(s, .2, .6), a2 = .2 + .8 * ph(s, 2.4, 2.8), a3 = .2 + .8 * ph(s, 4.6, 5), a4 = .2 + .8 * ph(s, 7.2, 7.6);
    const stamp = (x, k) => op(k, t(x, 100, '✗', { anchor: 'middle', fill: RED, bold: true, size: 70 }));
    const z = ph(s, 6.2, 7.4), zo = win(s, 6.2, 7.9, .3);
    const zr = [lerp(247.6, 309, z), lerp(52.4, 22, z), lerp(10.8, 70, z), lerp(10.8, 116, z)];
    return svg('0 0 400 250', `
      <g opacity="${a1.toFixed(2)}">${phone(8, 80, 140, closeOnly)}${t(48, 172, '✗ Close-up only', { anchor: 'middle', fill: RED, bold: true })}${t(48, 187, 'Which hand?', { anchor: 'middle', size: 10 })}${t(48, 200, 'Which finger?', { anchor: 'middle', size: 10 })}${t(48, 213, 'Which side?', { anchor: 'middle', size: 10 })}${t(48, 226, 'Blood hides it', { anchor: 'middle', size: 10 })}</g>
      <g opacity="${a2.toFixed(2)}">${phone(104, 80, 140, farOnly)}${t(144, 172, '✗ Far only', { anchor: 'middle', fill: RED, bold: true })}${t(144, 187, "Can't see", { anchor: 'middle', size: 10 })}${t(144, 200, 'the wound;', { anchor: 'middle', size: 10 })}${t(144, 213, 'cluttered', { anchor: 'middle', size: 10 })}</g>
      ${stamp(48, win(s, 1, 2.2, .2))}${stamp(144, win(s, 3.2, 4.4, .2))}
      ${op(ph(s, 7.8, 8.3), `<rect x="198" y="4" width="198" height="236" rx="8" fill="none" stroke="${GREEN}" stroke-width="2"/>${t(297, 226, '✓ Send BOTH', { anchor: 'middle', fill: GREEN, bold: true, size: 14 })}`)}
      <g opacity="${a3.toFixed(2)}">${phone(208, 80, 140, wide)}${t(248, 172, '1. WIDE', { anchor: 'middle', fill: GREEN, bold: true })}${t(248, 187, 'whole hand + wrist,', { anchor: 'middle', size: 10 })}${t(248, 200, 'plain background', { anchor: 'middle', size: 10 })}</g>
      <g opacity="${a4.toFixed(2)}">${phone(304, 80, 140, close)}${t(344, 172, '2. CLOSE', { anchor: 'middle', fill: GREEN, bold: true })}${t(344, 187, 'cleaned, sharp,', { anchor: 'middle', size: 10 })}${t(344, 200, 'ruler for scale', { anchor: 'middle', size: 10 })}</g>
      ${op(zo, `<rect x="${zr[0].toFixed(1)}" y="${zr[1].toFixed(1)}" width="${zr[2].toFixed(1)}" height="${zr[3].toFixed(1)}" fill="none" stroke="#ffeb3b" stroke-width="3"/>`)}`);
  }, { dur: 11 }),
};
function shapesOnly() { return `<g fill="${SKIN}" stroke="${EDGE}" stroke-width="3">${shapes()}</g>`; }

// side-view finger: start at (x,y) pointing right, each joint bends by angs[i] degrees towards the palm (down)
function chain(x, y, angs, L = [70, 42, 32]) {
  const pts = [[x, y]]; let a = 0, px = x, py = y;
  angs.forEach((d, i) => { a += d; px += L[i] * Math.cos(a * Math.PI / 180); py += L[i] * Math.sin(a * Math.PI / 180); pts.push([px, py]); });
  return pts; // [MCP, PIP, DIP, tip]
}
function finger(pts, { color = SKIN, w = 15, base = true } = {}) {
  const all = base ? [[pts[0][0] - 50, pts[0][1]], ...pts] : pts;
  const d = 'M' + all.map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L');
  return `<path d="${d}" fill="none" stroke="${EDGE}" stroke-width="${w + 3}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
    + pts.slice(0, 3).map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="${EDGE}"/>`).join('');
}
const jl = (p, s, dy = -14) => t(p[0], p[1] + dy, s, { anchor: 'middle', size: 9, fill: '#555' });

// FDP / FDS test drawings: side view, palm side down, examiner's hold in grey; s = time in the loop
function sideTest(kind, s) {
  const defs = `<defs>${arrowDef('ag' + kind, GREEN)}</defs>`;
  const hold = ph(s, .2, .7);
  if (kind === 'fdp') {
    const dip = 60 * (ph(s, 1, 1.8) - ph(s, 2.4, 3) + ph(s, 3.4, 4.2));
    const p = chain(70, 56, [0, 0, dip]), pf = chain(70, 56, [0, 0, 60]);
    return svg('0 0 260 160', `${defs}${finger(p)}
      ${op(hold, `<rect x="${p[1][0] + 4}" y="36" width="${p[2][0] - p[1][0] - 8}" height="40" rx="9" fill="rgba(90,90,90,.5)"/>${t((p[1][0] + p[2][0]) / 2, 28, 'hold here', { anchor: 'middle', size: 10, bold: true })}`)}
      ${jl(p[0], 'MCP')}${jl(p[1], 'PIP', 30)}${jl(p[2], 'DIP', 30)}
      ${op(ph(s, 1, 1.4), `<path d="M${pf[2][0] + 22} ${pf[2][1] - 8} A28 28 0 0 1 ${pf[3][0] + 14} ${pf[3][1] + 4}" fill="none" stroke="${GREEN}" stroke-width="2.5" marker-end="url(#ag${kind})"/>`)}
      ${op(ph(s, 1.6, 2), `${t(130, 132, 'Tip bends at DIP = FDP ✓', { anchor: 'middle', fill: GREEN, bold: true, size: 12 })}${t(130, 148, 'you keep the PIP straight', { anchor: 'middle', size: 10 })}`)}
      ${t(8, 90, 'palm side ↓', { size: 9, fill: '#555' })}`);
  }
  const pip = 75 * ph(s, 1, 2);
  const wig = win(s, 2.5, 4.6, .2) * 20 * Math.sin((s - 2.5) * 2 * Math.PI / .8);
  const ghost = chain(70, 30, [0, 0, 0]);
  const p = chain(70, 60, [0, pip, wig]), pf = chain(70, 60, [0, 75, 0]);
  return svg('0 0 260 170', `${defs}${finger(ghost, { color: '#eee' })}
    ${op(hold, `<rect x="${ghost[1][0] - 30}" y="14" width="${ghost[3][0] - ghost[1][0] + 40}" height="32" rx="8" fill="rgba(90,90,90,.45)"/>${t(150, 10, 'other fingers held fully straight', { anchor: 'middle', size: 10, bold: true })}`)}
    ${finger(p)}${jl(p[0], 'MCP', 24)}${op(ph(s, 1.8, 2.2), t(pf[1][0] - 12, pf[1][1] + 22, 'PIP', { size: 9, fill: '#555', anchor: 'end' }) + t(pf[2][0] - 12, pf[2][1] + 4, 'DIP', { size: 9, fill: '#555', anchor: 'end' }))}
    ${op(ph(s, 1.8, 2.2), `<path d="M${pf[1][0] + 16} ${pf[1][1] - 4} A26 26 0 0 1 ${pf[1][0] + 18} ${pf[1][1] + 30}" fill="none" stroke="${GREEN}" stroke-width="2.5" marker-end="url(#ag${kind})"/>`)}
    ${op(ph(s, 2.5, 2.9), `${t(pf[2][0] + 22, pf[2][1] + 2, 'DIP floppy', { size: 10, fill: '#555' })}${t(pf[2][0] + 22, pf[2][1] + 15, '(you can wiggle it)', { size: 10, fill: '#555' })}`)}
    ${op(ph(s, 1.8, 2.2), t(8, 152, 'Bends at PIP, tip floppy = FDS ✓', { fill: GREEN, bold: true, size: 12 }))}`);
}

// Figures: draw the still frame, then play the loop while on screen. Tap the button (or the figure) to pause.
const still = f => f(f.dur);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const figs = [];
let raf = 0, last = 0;
for (const el of document.querySelectorAll('[data-fig]')) {
  const f = FIGS[el.dataset.fig];
  if (!f) continue;
  el.innerHTML = `<div class="fig-art">${still(f)}</div><div class="fig-bar"><button type="button" class="fig-btn" aria-label="Play animation">Play</button><a class="fig-gif" href="gifs/${el.dataset.fig}.gif" download>Save GIF to share</a></div>`;
  // the picture keeps the text description; the buttons beside it stay reachable
  const art0 = el.querySelector('.fig-art');
  for (const a of ['role', 'aria-label']) if (el.hasAttribute(a)) { art0.setAttribute(a, el.getAttribute(a)); el.removeAttribute(a); }
  const st = { el, f, art: el.querySelector('.fig-art'), btn: el.querySelector('.fig-btn'), playing: false, visible: false, start: 0, at: 0 };
  figs.push(st);
  const toggle = () => setPlaying(st, !st.playing);
  st.btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  st.art.addEventListener('click', toggle);
  if (!reduce) setPlaying(st, true);
}
function setPlaying(st, on) {
  st.playing = on;
  st.btn.textContent = on ? 'Pause' : 'Play';
  st.btn.setAttribute('aria-label', on ? 'Pause animation' : 'Play animation');
  if (on) st.start = performance.now() - st.at * 1000; // resume where it stopped
  else st.art.innerHTML = still(st.f);                  // paused: show the complete diagram
  if (on) tick();
}
if ('IntersectionObserver' in window) {
  const vis = new IntersectionObserver(es => { for (const e of es) { const st = figs.find(f => f.el === e.target); if (st) st.visible = e.isIntersecting; } tick(); });
  figs.forEach(st => vis.observe(st.el));
} else figs.forEach(st => { st.visible = true; });
function tick() {
  if (raf) return;
  raf = requestAnimationFrame(function frame(now) {
    raf = 0;
    const live = figs.filter(st => st.playing && st.visible);
    if (!live.length) return;
    if (now - last > 40) { // ~25 frames a second is plenty
      last = now;
      for (const st of live) { st.at = ((now - st.start) / 1000) % st.f.dur; st.art.innerHTML = st.f(st.at); }
    }
    raf = requestAnimationFrame(frame);
  });
}
// used by tools/make-gifs.mjs, and by edit.html to stop the figures so they can be selected
window.handFigs = { FIGS, still, pauseAll: () => figs.forEach(st => { if (st.playing) setPlaying(st, false); }) };


// opening a scenario from a link (#pic-cut etc.) opens it
function openFromHash() {
  const el = location.hash && document.getElementById(location.hash.slice(1));
  if (el && el.tagName === 'DETAILS') el.open = true;
}
addEventListener('hashchange', openFromHash);
openFromHash();

// print everything, including closed sections
addEventListener('beforeprint', () => document.querySelectorAll('details').forEach(d => { d.dataset.wasOpen = d.open; d.open = true; }));
addEventListener('afterprint', () => document.querySelectorAll('details').forEach(d => { d.open = d.dataset.wasOpen === 'true'; }));

// highlight the section in view in the top bar
const links = [...document.querySelectorAll('.bar nav a')];
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {
      links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
      const on = links.find(a => a.classList.contains('on')), nav = on?.parentElement;
      if (on && (on.offsetLeft < nav.scrollLeft || on.offsetLeft + on.offsetWidth > nav.scrollLeft + nav.clientWidth)) nav.scrollLeft = on.offsetLeft - 16;
    }
  }, { rootMargin: '-100px 0px -70% 0px' });
  document.querySelectorAll('main > section').forEach(s => io.observe(s));
}

// offline: cache the page; offer a reload when a new version is ready
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller; // first visit: nothing to update
  navigator.serviceWorker.register('sw.js').then(reg => {
    const show = w => {
      const b = document.getElementById('update'); b.hidden = false;
      b.onclick = () => w.postMessage('skipWaiting');
    };
    if (reg.waiting && hadController) show(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && hadController) show(w); });
    });
  }).catch(() => {});
  // reload only when a new version takes over, not when the first worker claims this page
  let reloaded = !hadController;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
