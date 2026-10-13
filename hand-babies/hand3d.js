// 3D figures for the hand page: a simple lit 3D hand (capsules for the bones, a slab for the palm, nails so the back
// of the hand is obvious) posed over time for each tendon test. One WebGL renderer draws every figure in turn and
// copies the picture into the figure's own canvas, then 2D labels go on top. Drag sideways to turn the hand.
// Registers with the figure player in app.js (window.handFigs.add): same Play/Pause, still frame and GIF export.
import * as THREE from './vendor/three.module.min.js';

const D = Math.PI / 180;
const cl = v => Math.max(0, Math.min(1, v));
const ease = v => v < .5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2;
const ph = (s, a, b) => ease(cl((s - a) / (b - a)));
const win = (s, a, b, r = .3) => ph(s, a, a + r) * (1 - ph(s, b - r, b));

// ---------- renderer (one for all figures)
let renderer = null;
function gl() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xffffff, 1);
  return renderer;
}

// ---------- materials
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .62, metalness: 0, ...o });
const SKIN = mat(0xefc3a4), NAIL = mat(0xf8e0d6, { roughness: .3 }), GLOVE = mat(0x6d9fd8, { roughness: .45 });
const TABLE = mat(0xe8ecf1, { roughness: .9 });
const TABLE_GLASS = mat(0xdfe5ec, { roughness: .9, transparent: true, opacity: .62, depthWrite: false });
const TENDON = {
  fdp: mat(0xe07b00, { emissive: 0xe07b00, emissiveIntensity: .35 }),
  fds: mat(0x8a4fc4, { emissive: 0x8a4fc4, emissiveIntensity: .35 }),
  fpl: mat(0xd7263d, { emissive: 0xd7263d, emissiveIntensity: .3 }),
  ext: mat(0x1f6fb5, { emissive: 0x1f6fb5, emissiveIntensity: .35 }),
  epl: mat(0x1a8a3a, { emissive: 0x1a8a3a, emissiveIntensity: .35 }),
};

const geoCache = new Map();
function capsule(r, L) {
  const k = r.toFixed(3) + ':' + L.toFixed(3);
  if (!geoCache.has(k)) {
    const g = new THREE.CapsuleGeometry(r, L, 8, 20);
    g.rotateX(Math.PI / 2); g.translate(0, 0, -L / 2); // along -Z from the joint
    geoCache.set(k, g);
  }
  return geoCache.get(k);
}
function mesh(geo, m) { const x = new THREE.Mesh(geo, m); x.castShadow = true; x.receiveShadow = true; return x; }
// a stick from a to b, in the local coordinates of `parent`
function stick(parent, a, b, r, m) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), L = d.length();
  const x = mesh(capsule(r, L), m); x.castShadow = false;
  x.position.copy(A); x.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.normalize());
  parent.add(x); return x;
}

// ---------- the hand
// A LEFT hand in its own frame: palm surface faces +Y, fingers point to -Z, thumb on -X, wrist at z = 0.
// Bending a joint (flexion) is a positive rotation about its local X axis: the finger curls towards the palm.
const FY = .9; // height of the finger bones
const FING = {
  index: { x: -2.85, z: -8.8, r: .9, L: [4.3, 2.5, 1.9], spread: 5 * D },
  middle: { x: -.95, z: -9.1, r: .93, L: [4.7, 2.9, 2.0], spread: 0 },
  ring: { x: .95, z: -8.85, r: .88, L: [4.4, 2.8, 2.0], spread: -4 * D },
  little: { x: 2.75, z: -8.25, r: .78, L: [3.5, 2.1, 1.8], spread: -10 * D },
};
function segment(parent, L, r, m = SKIN) {
  const joint = new THREE.Group(); parent.add(joint);
  const body = mesh(capsule(r, L), m); joint.add(body);
  const end = new THREE.Group(); end.position.z = -L; joint.add(end);
  return { joint, end, body, L, r };
}
function nail(seg) {
  const n = mesh(new THREE.BoxGeometry(seg.r * 1.15, .14, seg.L * .78), NAIL);
  n.position.set(0, -seg.r * .9, -seg.L * .6); seg.joint.add(n);
}
function makeHand(skin = SKIN) {
  const root = new THREE.Group(), hand = new THREE.Group(); root.add(hand);
  // palm: a rounded slab
  const shape = new THREE.Shape(), x0 = -3.8, x1 = 3.6, y0 = .4, y1 = 8.7, rr = 1.4;
  shape.moveTo(x0 + rr, y0); shape.lineTo(x1 - rr, y0); shape.quadraticCurveTo(x1, y0, x1, y0 + rr);
  shape.lineTo(x1, y1 - rr); shape.quadraticCurveTo(x1, y1, x1 - rr, y1); shape.lineTo(x0 + rr, y1);
  shape.quadraticCurveTo(x0, y1, x0, y1 - rr); shape.lineTo(x0, y0 + rr); shape.quadraticCurveTo(x0, y0, x0 + rr, y0);
  const pg = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: true, bevelThickness: .55, bevelSize: .55, bevelSegments: 5, curveSegments: 10 });
  pg.rotateX(-Math.PI / 2); pg.translate(0, .3, 0); // palm spans y ≈ -0.25 … 2.05, z 0 … -9.2
  hand.add(mesh(pg, skin));
  // forearm
  const fa = mesh(capsule(2.3, 8), skin); fa.scale.set(1.45, .62, 1); fa.rotation.y = Math.PI; fa.position.set(-.1, .9, -.6); hand.add(fa);
  const fingers = {};
  for (const [name, f] of Object.entries(FING)) {
    const base = new THREE.Group(); base.position.set(f.x, FY, f.z); base.rotation.y = f.spread; hand.add(base);
    const knuckle = mesh(new THREE.SphereGeometry(f.r * 1.08, 20, 14), skin); base.add(knuckle);
    const p = segment(base, f.L[0], f.r, skin), m = segment(p.end, f.L[1], f.r * .94, skin), d = segment(m.end, f.L[2], f.r * .88, skin);
    nail(d);
    fingers[name] = { name, base, mcp: p.joint, pip: m.joint, dip: d.joint, segs: [p, m, d], r: f.r,
      set(a, b, c) { this.mcp.rotation.x = a * D; this.pip.rotation.x = b * D; this.dip.rotation.x = c * D; } };
  }
  // thumb: `lift` turns it about the hand's long axis (positive = up off the back of the hand, as in EPL
  // retropulsion), then it is angled out and rolled so its pad faces the fingers
  const tLift = new THREE.Group(); tLift.position.set(-3.0, .7, -2.0); hand.add(tLift);
  const tYaw = new THREE.Group(); tYaw.rotation.y = 34 * D; tLift.add(tYaw);
  const tRoll = new THREE.Group(); tRoll.rotation.z = -50 * D; tYaw.add(tRoll);
  const meta = segment(tRoll, 3.9, 1.35, skin), tp = segment(meta.end, 3.0, 1.0, skin), td = segment(tp.end, 2.5, .93, skin);
  nail(td);
  const thumb = { lift: tLift, yaw: tYaw, roll: tRoll, cmc: meta.joint, mcp: tp.joint, ip: td.joint, segs: [meta, tp, td],
    set(cmc, mcp, ip) { this.cmc.rotation.x = cmc * D; this.mcp.rotation.x = mcp * D; this.ip.rotation.x = ip * D; } };
  return { root, hand, fingers, thumb };
}
// a coloured tendon line lying on the skin of a segment: side +1 palm side, -1 back; from/to are fractions of its length
function tendon(seg, side, m, from = 0, to = 1) {
  const y = side * seg.r * .97, L = seg.L * (to - from);
  const t = mesh(capsule(.17, Math.max(.01, L - .1)), m); t.castShadow = false;
  t.position.set(0, y, -seg.L * from - .05); seg.joint.add(t); return t;
}
// examiner's gloved fingertip resting across a segment (side +1 palm side, -1 back), at fraction `at` of its length
function pad(seg, side, at = .5, len = 2.4) {
  const g = new THREE.Group(); g.position.set(0, side * (seg.r + .55), -seg.L * at); seg.joint.add(g);
  const c = mesh(capsule(.6, len), GLOVE); c.rotation.y = Math.PI / 2; c.position.x = len / 2; g.add(c); return g;
}

// ---------- scene, camera, labels
function makeScene({ tableY = 0, edgeZ = null } = {}) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaab4c0, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(-8, 18, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  sun.shadow.radius = 4; sun.shadow.bias = -.0005; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, .5); fill.position.set(10, 6, -8); scene.add(fill);
  if (edgeZ == null) {
    const t = mesh(new THREE.PlaneGeometry(80, 80), TABLE); t.rotation.x = -Math.PI / 2; t.position.y = tableY; t.castShadow = false; scene.add(t);
  } else { // a table that ends at z = edgeZ (fingers hang over the edge)
    // see-through, so the fingers stay visible when the view is turned to look past the edge
    const t = mesh(new THREE.BoxGeometry(60, 4, 40), TABLE_GLASS); t.position.set(0, tableY - 2, edgeZ + 20); t.castShadow = false; scene.add(t);
  }
  return scene;
}
const tmp = new THREE.Vector3();
function project(obj, local, camera, w, h) {
  tmp.set(...local); obj.localToWorld(tmp); tmp.project(camera);
  return [(tmp.x + 1) / 2 * w, (1 - tmp.y) / 2 * h, tmp.z < 1];
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function labels(c, w, h, L, camera) {
  const fs = Math.max(12, Math.min(15, w / 30));
  c.textBaseline = 'middle';
  if (L.title) { c.font = `700 ${fs + 2}px system-ui, sans-serif`; c.fillStyle = '#002f6c'; c.fillText(L.title, 10, fs + 4); }
  if (L.sub) {
    c.font = `400 ${fs}px system-ui, sans-serif`; c.fillStyle = '#333';
    let line = '', y = fs * 2 + 10;
    for (const word of L.sub.split(' ')) {
      if (line && c.measureText(line + ' ' + word).width > w - (L.hint ? 20 : 20)) { c.fillText(line, 10, y); line = word; y += fs + 4; } else line = line ? line + ' ' + word : word;
    }
    c.fillText(line, 10, y);
  }
  for (const tag of L.tags || []) {
    if (tag.k != null && tag.k <= .01) continue;
    const [x, y, ok] = project(tag.obj, tag.at || [0, 0, 0], camera, w, h); if (!ok) continue;
    c.globalAlpha = tag.k == null ? 1 : tag.k;
    c.font = `600 ${fs - 1}px system-ui, sans-serif`;
    const tw = c.measureText(tag.text).width + 12, dx = tag.dx ?? 30, dy = tag.dy ?? -26;
    const bx = Math.max(4, Math.min(w - tw - 4, x + dx - (dx < 0 ? tw : 0))), by = Math.max(4, Math.min(h - 26, y + dy - 11));
    c.strokeStyle = tag.color || '#222'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(bx + (dx < 0 ? tw : 0), by + 11); c.stroke();
    c.fillStyle = tag.color || '#222'; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill();
    roundRect(c, bx, by, tw, 22, 11); c.fillStyle = 'rgba(255,255,255,.93)'; c.fill(); c.stroke();
    c.fillStyle = tag.color || '#222'; c.fillText(tag.text, bx + 6, by + 11.5);
    c.globalAlpha = 1;
  }
  for (const [i, cap] of (Array.isArray(L.caption) ? L.caption : [L.caption]).filter(Boolean).entries()) {
    const k = cap.k == null ? 1 : cap.k; if (k <= .01) continue;
    c.globalAlpha = k;
    let size = fs + 1; do { c.font = `700 ${size}px system-ui, sans-serif`; } while (c.measureText(cap.text).width + 20 > w - 8 && --size > 10);
    const tw = c.measureText(cap.text).width + 20, bx = (w - tw) / 2, by = h - 34 - i * 30;
    roundRect(c, bx, by, tw, 26, 13); c.fillStyle = cap.bg || '#e8f4ec'; c.fill();
    c.fillStyle = cap.color || '#146c2e'; c.fillText(cap.text, bx + 10, by + 13.5); c.globalAlpha = 1;
  }
  if (L.hint && !globalThis.HAND_GIF) { c.font = `400 ${fs - 3}px system-ui, sans-serif`; c.fillStyle = '#777'; c.textAlign = 'right'; c.fillText('drag to turn', w - 8, fs + 2); c.textAlign = 'left'; }
}

// ---------- figure definitions: build(scene) once, then pose(state, s) each frame -> labels
const FIGS3D = {
  // relaxed hand palm up: the fingers settle into the cascade; then the middle finger lies straight (flexors cut)
  cascade: {
    dur: 8, cam: { target: [0, 2, -10], dist: 34, yaw: 66, pitch: 20 },
    build(scene) { const H = makeHand(); H.root.position.y = .3; scene.add(H.root); return H; },
    pose(H, s) {
      const k = ph(s, .3, 2), cut = ph(s, 4.2, 5);
      const A = { index: 8, middle: 13, ring: 18, little: 24 };
      for (const [n, f] of Object.entries(H.fingers)) { const a = A[n] * k * (n === 'middle' ? 1 - cut : 1); f.set(a, a * 1.3, a * .8); }
      H.thumb.set(10 * k, 10 * k, 10 * k);
      return {
        title: 'Resting posture (the cascade)', sub: 'Hand relaxed, palm up, seen from the side', hint: true,
        tags: [{ obj: H.fingers.middle.segs[2].end, text: 'middle', color: '#b3001f', k: cut, dx: -30 }],
        caption: [
          { text: 'Normal: each finger a bit more bent, index → little', k: ph(s, 1.6, 2) * (1 - ph(s, 3.9, 4.2)) },
          { text: 'Flexors cut: that finger lies straight', k: ph(s, 4.8, 5.2), color: '#b3001f', bg: '#fdecee' },
        ],
      };
    },
  },

  fdp: {
    dur: 5.5, cam: { target: [-1, 2.5, -12], dist: 30, yaw: -62, pitch: 22 },
    build(scene) {
      const H = makeHand(); H.root.position.y = .3; scene.add(H.root);
      const m = H.fingers.middle;
      H.hold = [pad(m.segs[1], 1, .5), pad(m.segs[1], -1, .5)];
      for (const s of m.segs) tendon(s, 1, TENDON.fdp);
      return H;
    },
    pose(H, s) {
      const k = ph(s, .2, .7), dip = 70 * (ph(s, 1, 1.8) - ph(s, 2.4, 3) + ph(s, 3.4, 4.2));
      for (const f of Object.values(H.fingers)) f.set(4, 4, 4);
      H.fingers.middle.set(4, 0, dip); H.hold.forEach(g => g.scale.setScalar(Math.max(.01, k)));
      return {
        title: 'FDP: bends the fingertip', sub: 'Hold the middle phalanx so the middle joint stays straight', hint: true,
        tags: [{ obj: H.hold[0], text: 'hold here', color: '#1f5fa8', k }, { obj: H.fingers.middle.segs[2].end, text: 'tip bends (DIP)', color: '#b35c00', k: ph(s, 1.4, 1.8), dx: -30, dy: -30 }],
        caption: { text: 'Tip bends = FDP working', k: ph(s, 1.6, 2) },
      };
    },
  },

  fds: {
    dur: 6.5, cam: { target: [-.6, 3, -12], dist: 31, yaw: -58, pitch: 22 },
    build(scene) {
      const H = makeHand(); H.root.position.y = .3; scene.add(H.root);
      H.pads = ['index', 'ring', 'little'].map(n => pad(H.fingers[n].segs[1], 1, .5, 1.6));
      const m = H.fingers.middle; tendon(m.segs[0], 1, TENDON.fds); tendon(m.segs[1], 1, TENDON.fds, 0, .5);
      return H;
    },
    pose(H, s) {
      const k = ph(s, .2, .7), pip = 85 * ph(s, 1, 2);
      const wig = win(s, 2.5, 4.6, .2) * 28 * Math.sin((s - 2.5) * 2 * Math.PI / .8);
      for (const n of ['index', 'ring', 'little']) H.fingers[n].set(0, 0, 0);
      H.fingers.middle.set(8 * ph(s, 1, 2), pip, Math.max(-5, 8 + wig));
      H.pads.forEach(g => g.scale.setScalar(Math.max(.01, k)));
      return {
        title: 'FDS: bends the middle joint', sub: 'Hold the other fingers flat, then ask them to bend this one', hint: true,
        tags: [{ obj: H.pads[1], text: 'keep these flat', color: '#1f5fa8', k, dx: 24, dy: 30 },
          { obj: H.fingers.middle.segs[2].end, text: 'tip stays floppy', color: '#555', k: ph(s, 2.5, 2.9), dx: 34, dy: 4 }],
        caption: { text: 'Middle joint bends, tip floppy = FDS working', k: ph(s, 1.8, 2.2) },
      };
    },
  },

  fpl: {
    dur: 5.5, cam: { target: [-4.5, 2, -7], dist: 27, yaw: -40, pitch: 30 },
    build(scene) {
      const H = makeHand(); H.root.position.y = .3; scene.add(H.root);
      const t = H.thumb; H.hold = [pad(t.segs[1], 1, .5, 2.2), pad(t.segs[1], -1, .5, 2.2)];
      for (const s of t.segs.slice(1)) tendon(s, 1, TENDON.fpl);
      return H;
    },
    pose(H, s) {
      const k = ph(s, .2, .7), ip = 70 * (ph(s, 1, 1.8) - ph(s, 2.4, 3) + ph(s, 3.4, 4.2));
      for (const f of Object.values(H.fingers)) f.set(6, 6, 6);
      H.thumb.set(0, 5, ip); H.hold.forEach(g => g.scale.setScalar(Math.max(.01, k)));
      return {
        title: 'FPL: bends the thumb tip', sub: 'Hold the base of the thumb still', hint: true,
        tags: [{ obj: H.hold[0], text: 'hold here', color: '#1f5fa8', k, dx: 30, dy: 26 }],
        caption: { text: 'Thumb tip bends = FPL working', k: ph(s, 1.6, 2) },
      };
    },
  },

  // EIP and EDM: from a fist, point the index alone (EIP), then the little finger alone (EDM), each against resistance
  eipedm: {
    dur: 8, cam: { target: [0, 5, -11], dist: 36, yaw: 200, pitch: 28 },
    build(scene) {
      const H = makeHand(); H.root.rotation.z = Math.PI; H.root.position.y = 6.5; scene.add(H.root);
      H.lines = {}; H.press = {};
      for (const n of ['index', 'little']) {
        H.lines[n] = [...H.fingers[n].segs.map(sg => tendon(sg, -1, TENDON.ext)),
          stick(H.hand, [FING[n].x, -.2, FING[n].z], [FING[n].x * .45, -.2, -.5], .17, TENDON.ext)];
        H.press[n] = pad(H.fingers[n].segs[0], -1, .6, 1.8);
      }
      return H;
    },
    pose(H, s) {
      const fist = [85, 95, 55];
      const x = { index: win(s, .6, 3.6, .6), little: win(s, 4.2, 7.2, .6) };   // finger points out
      const p = { index: win(s, 1.5, 3.2, .3), little: win(s, 5.1, 6.8, .3) }; // your finger resists
      for (const n of ['middle', 'ring']) H.fingers[n].set(...fist);
      for (const n of ['index', 'little']) {
        H.fingers[n].set(...fist.map(a => a * (1 - x[n])));
        H.lines[n].forEach(l => { l.visible = x[n] > .2; });
        H.press[n].scale.setScalar(Math.max(.01, p[n]));
      }
      H.thumb.set(10, 30, 30);
      const n = s < 3.9 ? 'index' : 'little';
      return {
        title: n === 'index' ? 'EIP: index points on its own' : 'EDM: little finger points on its own',
        sub: 'From a fist, point one finger and hold it up against your finger', hint: true,
        tags: [{ obj: H.fingers[n].segs[2].end, text: n === 'index' ? 'EIP (index)' : 'EDM (little)', color: '#1f5fa8', k: x[n], dx: n === 'index' ? -30 : 30, dy: 30 },
          { obj: H.press[n], text: 'resist here', color: '#1f5fa8', k: p[n], dx: n === 'index' ? -30 : 30, dy: -40 }],
        caption: { text: 'Points and holds against you = ' + (n === 'index' ? 'EIP' : 'EDM') + ' working', k: Math.max(p.index, p.little) },
      };
    },
  },
  // EDC: from a fist, straighten all the fingers at the knuckles, then press on the back of each first bone in turn
  edc: {
    dur: 9, cam: { target: [0, 5, -11], dist: 36, yaw: -96, pitch: 10 },
    build(scene) {
      const H = makeHand(); H.root.rotation.z = Math.PI; H.root.position.y = 6.5; scene.add(H.root);
      H.lines = {}; H.press = {};
      for (const [n, f] of Object.entries(H.fingers)) {
        H.lines[n] = [...f.segs.map(sg => tendon(sg, -1, TENDON.ext)),
          stick(H.hand, [FING[n].x, -.2, FING[n].z], [FING[n].x * .35, -.2, -.5], .17, TENDON.ext)];
        H.press[n] = pad(f.segs[0], -1, .55, 1.6);
      }
      return H;
    },
    pose(H, s) {
      const order = ['index', 'middle', 'ring', 'little'];
      const x = ph(s, .6, 1.6) * (1 - ph(s, 8.2, 8.8));
      let active = null;
      for (const [i, n] of order.entries()) {
        H.fingers[n].set(85 * (1 - x), 95 * (1 - x), 55 * (1 - x));
        H.lines[n].forEach(l => { l.visible = x > .15; });
        const t0 = 2 + i * 1.5, p = win(s, t0, t0 + 1.3, .3);
        H.press[n].scale.setScalar(Math.max(.01, p));
        if (p > .5) active = n;
      }
      H.thumb.set(10, 30, 30);
      return {
        title: 'Finger extensors (EDC)', sub: 'From a fist, straighten all the fingers; press on each one in turn', hint: true,
        tags: [{ obj: H.fingers.index.base, text: 'watch the knuckles (MCP)', color: '#1f5fa8', k: ph(s, .8, 1.2) * (1 - ph(s, 1.8, 2)), dx: -30, dy: -34 },
          { obj: H.press[active || 'index'], text: 'press here', color: '#1f5fa8', k: active ? 1 : 0, dx: -24, dy: -34 }],
        caption: { text: 'Each knuckle straightens and holds = extensor working', k: ph(s, 2.2, 2.6) },
      };
    },
  },

  // EPL: hand flat, palm down; lift the thumb off the table
  epl: {
    dur: 6, cam: { target: [4, 2.5, -6], dist: 30, yaw: 128, pitch: 16 },
    build(scene) {
      const H = makeHand(); H.root.rotation.z = Math.PI; H.root.position.y = 2.05; scene.add(H.root);
      const t = H.thumb; H.line = [...t.segs.map(sg => tendon(sg, -1, TENDON.epl)), stick(H.hand, [-3.0, -.25, -2.0], [-1.4, -.25, .2], .17, TENDON.epl)];
      return H;
    },
    pose(H, s) {
      const x = ph(s, .8, 1.6) - ph(s, 3, 3.6) + ph(s, 4.1, 4.9);
      for (const f of Object.values(H.fingers)) f.set(0, 0, 0);
      H.thumb.lift.rotation.z = 50 * x * D; H.thumb.set(0, -8 * x, -10 * x);
      H.line.forEach(l => { l.visible = x > .2; });
      return {
        title: 'EPL: lifts the thumb off the table', sub: 'Palm flat on the table, lift the thumb up', hint: true,
        tags: [{ obj: H.thumb.segs[0].joint, at: [0, -1.4, 0], text: 'EPL tightens here', color: '#146c2e', k: x, dx: 30, dy: -30 }],
        caption: { text: 'Thumb lifts off the table = EPL working', k: ph(s, 1.4, 1.8) },
      };
    },
  },

  // Elson test for the central slip: the finger lies on the table with the middle joint just past the edge, bent 90°
  // so the middle bone hangs down; they straighten it against resistance. The other fingers rest flat on the table.
  elson: {
    dur: 9, cam: { target: [0, -2, -2], dist: 28, yaw: -118, pitch: 16 }, scene: { edgeZ: 0 },
    build(scene) {
      // palm down (hand turned over); middle finger's PIP (9.1 + 4.7 from the wrist) sits 0.9 past the edge;
      // lifted .3 so the forearm doesn't dip into the table
      const H = makeHand(); H.root.rotation.z = Math.PI; H.root.position.set(0, 2.35, 9.1 + 4.7 - .9); scene.add(H.root);
      H.press = pad(H.fingers.middle.segs[1], -1, .55, 2.2);
      return H;
    },
    pose(H, s) {
      const cut = ph(s, 4.6, 5.1);
      for (const n of ['index', 'ring', 'little']) H.fingers[n].set(0, 0, 0);
      const floppy = 28 + 14 * Math.sin(s * 2 * Math.PI / .9);
      H.fingers.middle.set(0, 90, (1 - cut) * floppy + cut * -4);
      H.thumb.set(15, 25, 25);
      return {
        title: 'Elson test (central slip)', sub: 'Middle joint bent 90° over the table edge; they push to straighten it against you', hint: true,
        tags: [{ obj: H.press, text: 'resist here', color: '#1f5fa8', dx: 34, dy: -18 },
          { obj: H.fingers.middle.segs[2].end, text: cut > .5 ? 'tip stiff and straight' : 'tip floppy', color: cut > .5 ? '#b3001f' : '#146c2e', dx: 34, dy: 18 }],
        caption: [
          { text: 'Tip stays floppy = central slip intact', k: ph(s, .6, 1) * (1 - ph(s, 4.2, 4.6)) },
          { text: 'Tip goes stiff and straight = central slip cut', k: ph(s, 5, 5.4), color: '#b3001f', bg: '#fdecee' },
        ],
      };
    },
  },

  // nerve territories on a hand that turns from palm side to back
  nerves: {
    dur: 11, cam: { target: [0, 5, -11], dist: 44, yaw: 0, pitch: 62 }, still: 2,
    build(scene) {
      const H = makeHand(); colourNerves(H); H.root.position.y = 5; scene.add(H.root);
      const ring = (obj, at) => { const r = new THREE.Mesh(new THREE.TorusGeometry(.75, .14, 10, 28), new THREE.MeshBasicMaterial({ color: 0x111111 })); r.position.set(...at); r.rotation.x = Math.PI / 2; obj.add(r); return r; };
      H.spots = [ring(H.fingers.index.segs[2].joint, [0, .95, -1.1]), ring(H.fingers.little.segs[2].joint, [0, .8, -1.0]), ring(H.hand, [-3.6, -.35, -6.4])];
      return H;
    },
    pose(H, s) {
      const flip = ph(s, 3.6, 5) * (1 - ph(s, 9.2, 10.6));
      H.root.rotation.z = flip * Math.PI; H.updateNerves();
      for (const f of Object.values(H.fingers)) f.set(4, 4, 4);
      H.thumb.set(0, 0, 0);
      const palm = flip < .5;
      H.spots[0].visible = H.spots[1].visible = palm; H.spots[2].visible = !palm;
      return {
        title: palm ? 'Palm side (left hand)' : 'Back of the hand (left hand)', sub: 'Blue median · orange ulnar · green radial', hint: true,
        tags: palm ? [
          { obj: H.spots[0], text: 'median: index tip', color: '#1f5fa8', k: 1 - ph(s, 3.4, 3.7), dx: -24, dy: 44 },
          { obj: H.spots[1], text: 'ulnar: little tip', color: '#b35c00', k: 1 - ph(s, 3.4, 3.7), dx: 24, dy: 44 },
        ] : [{ obj: H.spots[2], text: 'radial: back of 1st web', color: '#146c2e', k: ph(s, 5, 5.4) * (1 - ph(s, 8.9, 9.2)), dx: 30, dy: 26 }],
        caption: { text: 'Rings = best place to test each nerve', k: 1 },
      };
    },
  },
};

// colour the skin by nerve territory, worked out per pixel from the position on the (straight) hand
function colourNerves(H) {
  const handInv = { value: new THREE.Matrix4() };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .65 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uHandInv = handInv;
    sh.vertexShader = 'uniform mat4 uHandInv;\nvarying vec3 vHP;\nvarying vec3 vHN;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvHP = (uHandInv * modelMatrix * vec4(transformed, 1.0)).xyz;\nvHN = normalize(mat3(uHandInv * modelMatrix) * objectNormal);');
    sh.fragmentShader = 'varying vec3 vHP;\nvarying vec3 vHN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 c = vec3(0.937, 0.765, 0.643);
      if (vHP.z < -0.9) {
        if (vHN.y >= 0.0) c = vHP.x < ${FING.ring.x.toFixed(2)} ? vec3(0.42, 0.62, 0.86) : vec3(0.95, 0.66, 0.36);
        else c = vHP.x >= ${FING.ring.x.toFixed(2)} ? vec3(0.95, 0.66, 0.36) : (vHP.z < -12.4 ? vec3(0.42, 0.62, 0.86) : vec3(0.47, 0.76, 0.53));
      }
      diffuseColor.rgb = c;`);
  };
  H.hand.traverse(o => { if (o.isMesh && o.material !== NAIL) o.material = m; });
  H.updateNerves = () => { H.hand.updateMatrixWorld(true); handInv.value.copy(H.hand.matrixWorld).invert(); };
}

// ---------- player hook
function mount(def) {
  return art => {
    let ok = true; try { gl(); } catch (e) { ok = false; }
    if (!ok) { art.innerHTML = '<p class="small">This 3D animation needs WebGL, which this browser has turned off.</p>'; return { draw() {} }; }
    const canvas = document.createElement('canvas'); canvas.className = 'fig3d'; art.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const scene = makeScene(def.scene || {}), state = def.build(scene);
    const camera = new THREE.PerspectiveCamera(30, 4 / 3, .1, 300);
    let dragYaw = 0, last = def.dur, dragging = null;
    function draw(s) {
      last = s;
      const w = Math.max(200, art.clientWidth || 360), h = Math.round(w * .78), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const L = def.pose(state, s);
      const sway = globalThis.HAND_GIF ? 0 : 9; // GIFs keep the camera still (much smaller files)
      const c = def.cam, yaw = (c.yaw + sway * Math.sin(2 * Math.PI * s / def.dur)) * D + dragYaw, pitch = c.pitch * D;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      camera.position.set(c.target[0] + c.dist * Math.cos(pitch) * Math.sin(yaw), c.target[1] + c.dist * Math.sin(pitch), c.target[2] + c.dist * Math.cos(pitch) * Math.cos(yaw));
      camera.lookAt(...c.target);
      const r = gl(); r.setSize(canvas.width, canvas.height, false); r.render(scene, camera);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(r.domElement, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); labels(ctx, w, h, L, camera);
    }
    canvas.addEventListener('pointerdown', e => { dragging = { x: e.clientX, yaw: dragYaw }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!dragging) return; dragYaw = dragging.yaw + (e.clientX - dragging.x) * .012; draw(last); });
    const up = e => { if (dragging && Math.abs(e.clientX - dragging.x) > 4) canvas.dataset.dragged = '1'; dragging = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    // a drag shouldn't count as a tap (tap pauses the animation)
    canvas.addEventListener('click', e => { if (canvas.dataset.dragged) { e.stopPropagation(); delete canvas.dataset.dragged; } }, true);
    canvas.turn = deg => { dragYaw = deg * D; draw(last); }; // also used by the tests
    return { draw };
  };
}
// No WebGL (blocked or no GPU, seen in Firefox): show the saved GIF of each figure instead of a blank box.
const canGL = (() => { try { return !!gl(); } catch { return false; } })();
const gifFig = name => ({ dur: 1, gif: true, mount: art => { art.innerHTML = `<img src="gifs/${name}.gif" alt="" style="display:block;width:100%">`; return { draw() {} }; } });
for (const [name, def] of Object.entries(FIGS3D)) globalThis.window?.handFigs?.add(name, canGL ? { dur: def.dur, still: def.still, mount: mount(def) } : gifFig(name));
export { makeHand, FIGS3D }; // for tests
