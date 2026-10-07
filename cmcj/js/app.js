// Thumb CMC trainer: normal anatomy, simulated OA, simulated arthroscopy & debridement.
// Units are millimetres. Model axes (right hand, anatomical position):
//   +X ulnar / -X radial, +Y proximal / -Y distal, +Z palmar / -Z dorsal.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { STAGES, NOTES, INFO, GROUP_LABEL } from './content.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

const AX = {
  radial: V(-1, 0, 0), ulnar: V(1, 0, 0), proximal: V(0, 1, 0), distal: V(0, -1, 0), palmar: V(0, 0, 1), dorsal: V(0, 0, -1),
};

const T0 = 0.7;            // healthy cartilage thickness (mm)
const BASE_GAP = 1.4;      // bone-to-bone gap at the contact zone, filled by cartilage
const TRACTION = 2.6;      // finger-trap distraction (mm)
const THUMB_NAMES = ['First metacarpal bone', 'Proximal phalanx of first finger of hand', 'Distal phalanx of first finger of hand'];

// Simulation parameters per stage (index = STAGES id)
const STAGE_P = [
  { loss: 0.00, fib: 0.00, soft: 0.0, osteo: 0.0, sublux: 0.0, narrow: 0.0, fronds: 0, loose: 0, stt: 0, hyper: 0.0 },
  { loss: 0.00, fib: 0.07, soft: 0.4, osteo: 0.0, sublux: 0.4, narrow: 0.0, fronds: 420, loose: 0, stt: 0, hyper: 0.7 },
  { loss: 0.42, fib: 0.12, soft: 0.7, osteo: 1.3, sublux: 1.1, narrow: 0.35, fronds: 380, loose: 1, stt: 0, hyper: 0.8 },
  { loss: 0.95, fib: 0.16, soft: 1.0, osteo: 2.6, sublux: 2.2, narrow: 0.8, fronds: 460, loose: 3, stt: 0, hyper: 0.9 },
  { loss: 1.35, fib: 0.18, soft: 1.0, osteo: 3.0, sublux: 2.8, narrow: 1.0, fronds: 460, loose: 3, stt: 1, hyper: 0.9 },
];

// ---------- small math helpers ----------
function hash3(i, j, k) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z, oct = 3) {
  let a = 0.5, s = 0, f = 1;
  for (let o = 0; o < oct; o++) { s += a * noise3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Jacobi eigen-decomposition of a symmetric 3x3 matrix (array of 9). Returns {values, vectors:[V3,V3,V3]} sorted desc.
function eig3(m) {
  const a = [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (Math.abs(a[p][q]) < 1e-12) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  const out = [0, 1, 2].map((i) => ({ val: a[i][i], vec: V(v[0][i], v[1][i], v[2][i]).normalize() }));
  out.sort((x, y) => y.val - x.val);
  return { values: out.map((o) => o.val), vectors: out.map((o) => o.vec) };
}
function pca(points) {
  const c = V(); points.forEach((p) => c.add(p)); c.divideScalar(points.length);
  const m = new Array(9).fill(0);
  for (const p of points) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] += d[i] * d[j];
  }
  return { center: c, ...eig3(m.map((x) => x / points.length)) };
}
function perp(v, n) { return v.clone().addScaledVector(n, -v.dot(n)).normalize(); }
function segDist(p, a, b) {
  const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

// ---------- renderer / scene ----------
const canvas = $('#c');
const viewportEl = $('#viewport');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.localClippingEnabled = false;
renderer.autoClear = false;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.fog = new THREE.Fog(0x2a0c0a, 1e5, 1e6);
const BG_EXT = new THREE.Color(0x23262d);

const extCam = new THREE.PerspectiveCamera(35, 1, 0.5, 2000);
extCam.layers.enable(1);
const scopeCam = new THREE.PerspectiveCamera(80, 1, 0.03, 120);
scopeCam.layers.disableAll(); scopeCam.layers.enable(0); scopeCam.layers.enable(2);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.6); keyLight.position.set(-60, 80, 120);
const fillLight = new THREE.DirectionalLight(0xdfe8ff, 0.6); fillLight.position.set(80, -40, -90);
const hemi = new THREE.HemisphereLight(0xffffff, 0x404858, 0.5);
const scopeLight = new THREE.SpotLight(0xf4f7ff, 0, 60, 1.0, 0.6, 1.0);
scene.add(keyLight, fillLight, hemi, scopeLight, scopeLight.target);
// keep the light count constant between passes so shaders are not recompiled; only intensities change
const LIGHTS = { ext: { key: 1.25, fill: 0.4, hemi: 0.2, scope: 0, env: 0.28 }, scope: { key: 0, fill: 0, hemi: 0.06, scope: 7, env: 0.04 } };
function lightPass(p) {
  keyLight.intensity = p.key; fillLight.intensity = p.fill; hemi.intensity = p.hemi; scopeLight.intensity = p.scope; scene.environmentIntensity = p.env;
}

// circular arthroscope vignette, drawn in WebGL so the inset view can sit on top of it
const maskScene = new THREE.Scene();
const maskCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
maskScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'varying vec2 vUv; void main(){ float r = length(vUv * 2.0 - 1.0); gl_FragColor = vec4(0.0, 0.0, 0.0, smoothstep(0.90, 0.985, r)); }',
  transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
})));

const controls = new OrbitControls(extCam, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.minDistance = 8; controls.maxDistance = 400;

// ---------- materials ----------
function capMaterial(mat, cap) {
  mat.side = THREE.DoubleSide;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.capColor = { value: new THREE.Color(cap) };
    sh.fragmentShader = 'uniform vec3 capColor;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n if (!gl_FrontFacing) gl_FragColor.rgb = capColor * 0.8;');
  };
  return mat;
}
const COL = {
  bone: 0xe9dfc9, context: 0xcdc6b6, ligament: 0xcfd2c2, tendon: 0xeee6d2, muscle: 0xb5524f,
  artery: 0xc8322f, nerve: 0xf0c548, sheath: 0x9fc4d8, retinac: 0xd8d0bc,
};
const TENDONS = ['Abductor pollicis longus', 'Extensor pollicis brevis', 'Extensor pollicis longus', 'Flexor carpi radialis', 'Flexor pollicis longus'];
function materialFor(name, group) {
  if (group === 'bone') {
    const isJoint = name === 'Trapezium bone' || THUMB_NAMES[0] === name || name === 'Scaphoid bone';
    return capMaterial(new THREE.MeshStandardMaterial({ color: isJoint ? 0xffffff : COL.context, roughness: 0.62, metalness: 0, vertexColors: isJoint }), 0xd99482);
  }
  if (group === 'ligament') return capMaterial(new THREE.MeshStandardMaterial({ color: COL.ligament, roughness: 0.45, metalness: 0.05 }), 0xbfbfa8);
  if (group === 'nv') {
    const art = /artery|arter|anastomosis/i.test(name);
    return capMaterial(new THREE.MeshStandardMaterial({ color: art ? COL.artery : COL.nerve, roughness: 0.45 }), art ? 0x801010 : 0xc0a020);
  }
  if (/sheath/i.test(name)) return new THREE.MeshStandardMaterial({ color: COL.sheath, roughness: 0.4, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  if (/retinaculum/i.test(name)) return new THREE.MeshStandardMaterial({ color: COL.retinac, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  if (TENDONS.includes(name)) return capMaterial(new THREE.MeshStandardMaterial({ color: COL.tendon, roughness: 0.4, metalness: 0.05 }), 0xd8ceb4);
  return capMaterial(new THREE.MeshStandardMaterial({ color: COL.muscle, roughness: 0.7 }), 0x8a2e2c);
}
const GLSL_NOISE = `
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fib(vec3 p){ return vnoise(p) * 0.6 + vnoise(p * 2.7 + 3.1) * 0.3 + vnoise(p * 6.3 + 7.7) * 0.1; }
`;
// Articular cartilage: per-vertex colour plus a procedural bump driven by the "rough" attribute so
// fibrillation reads at arthroscopic distances, and a flat cut colour for section views.
const cartMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, vertexColors: true, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.2,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide,
});
cartMat.onBeforeCompile = (sh) => {
  sh.uniforms.capColor = { value: new THREE.Color(0x9fc2dc) };
  sh.vertexShader = 'attribute float rough;\nvarying float vRough;\nvarying vec3 vWPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>',
    '#include <worldpos_vertex>\n vRough = rough; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = 'uniform vec3 capColor;\nvarying float vRough;\nvarying vec3 vWPos;\n' + GLSL_NOISE + sh.fragmentShader
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.8, clamp(vRough * 1.4, 0.0, 1.0));')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (vRough > 0.01) {
        vec3 p = vWPos * vec3(3.6, 6.0, 3.6); float e = 0.06; float n0 = fib(p);
        vec3 g = vec3(fib(p + vec3(e, 0, 0)) - n0, fib(p + vec3(0, e, 0)) - n0, fib(p + vec3(0, 0, e)) - n0) / e;
        normal = normalize(normal - clamp(vRough, 0.0, 1.0) * 0.3 * (viewMatrix * vec4(g, 0.0)).xyz);
      }`)
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n if (!gl_FrontFacing) gl_FragColor.rgb = capColor * 0.8;');
};
const xrayMat = new THREE.ShaderMaterial({
  vertexShader: `attribute float scl; varying vec3 vN; varying vec3 vV; varying float vS;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vS = scl; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vS;
    void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float I = 0.05 + 0.30*pow(f,2.5) + 0.22*vS; gl_FragColor = vec4(vec3(I*0.95, I, I*1.04), 1.0); }`,
  blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide, transparent: true,
});

// ---------- state ----------
const state = {
  mode: 'anatomy', stage: 0, swapped: false, tool: 'scope', traction: true, distract: 0,
  section: false, sectionAxis: 'dp', sectionOffset: 0, heat: false, xray: false,
  layers: { bone: true, context: true, cartilage: true, ligament: true, muscle: false, nv: false, capsule: false, hideT: false, hideF: false },
  selected: null,
};
const meshes = {};          // zname -> mesh
const byGroup = { bone: [], ligament: [], muscle: [], nv: [] };
let JB = {};                // JointBone instances: T, F, S
let geo = {};               // derived joint geometry (centres, axes, portals...)
const hyperU = { value: 0 };
let capsule, capsuleInner, capsuleScope, fronds, frondData = [], looseBodies = [];
let scopeMesh, instrument;
let scope = { portal: '1-R', work: '1-U', dir: V(), depth: 10, roll: 0, maxDepth: 30, inBone: false, everInJoint: false };
const stats = { probedT: false, probedF: false, iatro: { cart: 0, mc1: 0, lig: 0, bone: 0 }, lastWarn: 0 };

// ---------- joint bone (dynamic geometry) ----------
class JointBone {
  constructor(mesh) {
    this.mesh = mesh;
    const g = mesh.geometry;
    this.g = g;
    this.n = g.attributes.position.count;
    this.base = g.attributes.position.array.slice();
    this.nrm = g.attributes.normal.array.slice();
    this.jd = g.attributes._jd ? g.attributes._jd.array : new Float32Array(this.n).fill(50);
    this.js = g.attributes._js ? g.attributes._js.array : null;
    const n = this.n;
    this.w = new Float32Array(n); this.osteoMask = new Float32Array(n); this.sttMask = new Float32Array(n);
    this.loss = new Float32Array(n); this.soft = new Float32Array(n); this.fibA = new Float32Array(n);
    this.fibN = new Float32Array(n);
    this.osteoRemain = new Float32Array(n).fill(1); this.resect = new Float32Array(n);
    this.fibRemain = new Float32Array(n).fill(1); this.cartLost = new Float32Array(n);
    this.disp = new Float32Array(n); this.thick = new Float32Array(n);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('scl', new THREE.BufferAttribute(new Float32Array(n), 1));
    for (let i = 0; i < n; i++) this.fibN[i] = fbm(this.base[i * 3] * 3.1, this.base[i * 3 + 1] * 3.1, this.base[i * 3 + 2] * 3.1, 3) * 2 - 1;
    this.cart = null; this.dirty = true;
  }
  P(i) { return V(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]); }
  N(i) { return V(this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]); }
  resetTools() { this.osteoRemain.fill(1); this.resect.fill(0); this.fibRemain.fill(1); this.cartLost.fill(0); this.dirty = true; }
  buildCartilage() {
    const idx = this.g.index.array, keep = [];
    for (let f = 0; f < idx.length; f += 3) {
      if (this.w[idx[f]] > 0.004 && this.w[idx[f + 1]] > 0.004 && this.w[idx[f + 2]] > 0.004) keep.push(idx[f], idx[f + 1], idx[f + 2]);
    }
    const map = new Int32Array(this.n).fill(-1), src = [];
    const nidx = keep.map((i) => { if (map[i] < 0) { map[i] = src.length; src.push(i); } return map[i]; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(src.length * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(src.length * 3), 3));
    g.setAttribute('rough', new THREE.BufferAttribute(new Float32Array(src.length), 1));
    g.setIndex(nidx);
    this.cartSrc = Int32Array.from(src);
    this.cart = new THREE.Mesh(g, cartMat);
    this.cart.name = '__cartilage'; this.cart.userData = { zname: '__cartilage', group: 'cartilage', jb: this };
    return this.cart;
  }
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const P = STAGE_P[state.stage];
    const pos = this.g.attributes.position.array, col = this.g.attributes.color.array, scl = this.g.attributes.scl.array;
    const heat = state.heat && state.mode === 'oa';
    for (let i = 0; i < this.n; i++) {
      const d = P.osteo * this.osteoMask[i] * this.osteoRemain[i] + P.stt * this.sttMask[i] * this.osteoRemain[i] - this.resect[i];
      this.disp[i] = d;
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = this.base[i * 3 + k] + this.nrm[i * 3 + k] * d;
      // cartilage thickness
      const lost = Math.max(this.loss[i], this.cartLost[i], this.resect[i] > 0.05 ? 1 : 0);
      const th = T0 * this.w[i] * (1 - lost) * (1 - 0.22 * this.soft[i]);
      this.thick[i] = th;
      // bone colour
      let r = 0.86, g = 0.81, b = 0.71;
      const osteoH = d > 0 ? d : 0;
      if (osteoH > 0.15) { const t = clamp(osteoH / 2.5, 0, 1); r = lerp(r, 0.86, t); g = lerp(g, 0.79, t); b = lerp(b, 0.62, t); }
      const exposed = this.w[i] * clamp((0.12 - th) / 0.12, 0, 1);
      let s = 0;
      if (exposed > 0.01) {
        const t = exposed;
        if (heat) { r = lerp(r, 0.75, t); g = lerp(g, 0.12, t); b = lerp(b, 0.12, t); }
        else { r = lerp(r, 0.66, t); g = lerp(g, 0.50, t); b = lerp(b, 0.33, t); }
        s = t;
      }
      if (P.stt && this.sttMask[i] > 0.05) s = Math.max(s, this.sttMask[i] * 0.6);
      s = Math.max(s, this.w[i] * this.loss[i] * 0.4);
      if (this.resect[i] > 0.15) { const t = clamp(this.resect[i] / 0.8, 0, 1); r = lerp(r, 0.74, t); g = lerp(g, 0.40, t); b = lerp(b, 0.36, t); s *= 1 - t; }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; scl[i] = s;
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.color.needsUpdate = true; this.g.attributes.scl.needsUpdate = true;
    this.g.computeVertexNormals(); this.g.computeBoundingSphere(); this.g.computeBoundingBox();
    if (!this.cart) return;
    const cg = this.cart.geometry, cp = cg.attributes.position.array, cc = cg.attributes.color.array, cr = cg.attributes.rough.array;
    const healthy = [0.72, 0.82, 0.96], worn = [0.92, 0.85, 0.64];
    for (let k = 0; k < this.cartSrc.length; k++) {
      const i = this.cartSrc[k], th = this.thick[i];
      const fa = this.fibA[i] * this.fibRemain[i];
      const off = th > 0.03 ? Math.max(0.02, th + fa * this.fibN[i] * Math.min(1, th / 0.25)) + 0.01 : -0.08;
      for (let j = 0; j < 3; j++) cp[k * 3 + j] = pos[i * 3 + j] + this.nrm[i * 3 + j] * off;
      let c;
      if (heat) {
        const ratio = this.w[i] > 0.05 ? clamp(th / (T0 * this.w[i]), 0, 1) : 1;
        c = ratio > 0.5 ? [lerp(0.95, 0.15, (ratio - 0.5) * 2), lerp(0.85, 0.70, (ratio - 0.5) * 2), lerp(0.15, 0.35, (ratio - 0.5) * 2)]
          : [lerp(0.85, 0.95, ratio * 2), lerp(0.10, 0.85, ratio * 2), lerp(0.10, 0.15, ratio * 2)];
      } else {
        const t = clamp(fa / 0.2 + this.soft[i] * 0.25, 0, 1);
        c = [lerp(healthy[0], worn[0], t), lerp(healthy[1], worn[1], t), lerp(healthy[2], worn[2], t)];
        const sh = 1 - 0.18 * clamp(fa * this.fibN[i] / 0.1, -1, 1);
        c = c.map((x) => x * sh);
      }
      cc[k * 3] = c[0]; cc[k * 3 + 1] = c[1]; cc[k * 3 + 2] = c[2];
      cr[k] = clamp(fa / 0.16, 0, 1.1) * (th > 0.03 ? 1 : 0);
    }
    cg.attributes.position.needsUpdate = true; cg.attributes.color.needsUpdate = true; cg.attributes.rough.needsUpdate = true;
    cg.computeVertexNormals(); cg.computeBoundingSphere(); cg.computeBoundingBox();
  }
  nearest(localP) {
    let best = -1, bd = Infinity;
    const pos = this.g.attributes.position.array;
    for (let i = 0; i < this.n; i++) {
      const dx = pos[i * 3] - localP.x, dy = pos[i * 3 + 1] - localP.y, dz = pos[i * 3 + 2] - localP.z, d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  forEachNear(localP, r, fn) {
    const pos = this.g.attributes.position.array, r2 = r * r;
    for (let i = 0; i < this.n; i++) {
      const dx = pos[i * 3] - localP.x, dy = pos[i * 3 + 1] - localP.y, dz = pos[i * 3 + 2] - localP.z, d = dx * dx + dy * dy + dz * dz;
      if (d < r2) fn(i, 1 - Math.sqrt(d) / r);
    }
  }
}

// ---------- loading ----------
async function load() {
  const gltf = await new GLTFLoader().loadAsync('models/cmcj.glb');
  gltf.scene.updateMatrixWorld(true);
  const raw = [];
  gltf.scene.traverse((o) => { if (o.isMesh) raw.push(o); });
  for (const o of raw) {
    const g = o.geometry; g.applyMatrix4(o.matrixWorld);
    const zname = o.userData.zname || o.parent?.userData?.zname || o.name;
    const group = o.userData.group || o.parent?.userData?.group || 'bone';
    const m = new THREE.Mesh(g, materialFor(zname, group));
    m.name = zname; m.userData = { zname, group };
    if (group === 'bone' && !g.attributes.scl) g.setAttribute('scl', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    meshes[zname] = m; byGroup[group].push(m); scene.add(m);
  }
  setupJoint();
  buildCapsule();
  buildPortals();
  buildInstruments();
  applyStage(0);
  setView('dorsal', true);
  $('#loading').hidden = true;
}

function setupJoint() {
  JB.T = new JointBone(meshes['Trapezium bone']);
  JB.F = new JointBone(meshes['First metacarpal bone']);
  JB.S = new JointBone(meshes['Scaphoid bone']);
  const { T, F, S } = JB;
  for (const jb of [T, F]) for (let i = 0; i < jb.n; i++) jb.w[i] = sstep(2.6, 0.6, jb.jd[i]);
  const centroid = (jb) => { const c = V(); let s = 0; for (let i = 0; i < jb.n; i++) if (jb.w[i] > 0.5) { c.addScaledVector(jb.P(i), jb.w[i]); s += jb.w[i]; } return c.divideScalar(s); };
  const cT = centroid(T), cF = centroid(F);
  const nJ = V(); for (let i = 0; i < T.n; i++) if (T.w[i] > 0.3) nJ.addScaledVector(T.N(i), T.w[i]);
  nJ.normalize();
  const nF = V(); for (let i = 0; i < F.n; i++) if (F.w[i] > 0.3) nF.addScaledVector(F.N(i), -F.w[i]);
  nJ.add(nF.normalize()).normalize();
  const radius = (jb, c) => { let s = 0, m = 0; for (let i = 0; i < jb.n; i++) if (jb.w[i] > 0.3) { s += jb.P(i).distanceToSquared(c) * jb.w[i]; m += jb.w[i]; } return Math.sqrt(s / m) * 1.25; };
  const RT = radius(T, cT), RF = radius(F, cF);
  // MC1 long axis (distal)
  const fp = []; for (let i = 0; i < F.n; i += 3) fp.push(F.P(i));
  const fpca = pca(fp);
  const a1 = fpca.vectors[0].clone(); if (a1.dot(fpca.center.clone().sub(cT)) < 0) a1.negate();
  const subluxDir = perp(AX.radial.clone().add(AX.dorsal), nJ);
  geo = { cT, cF, nJ, RT, RF, a1, subluxDir, mc1Centre: fpca.center };
  // wear centres: palmar compartment of trapezium, palmar-ulnar MC1 base
  geo.wearT = cT.clone().addScaledVector(perp(AX.palmar, nJ), 0.38 * RT);
  geo.wearF = cF.clone().addScaledVector(perp(AX.palmar.clone().add(AX.ulnar.clone().multiplyScalar(0.8)), nJ), 0.32 * RF);

  // osteophyte masks: ring just outside the articular surface, biased to typical sites
  const ring = (jb, c, R, bias) => {
    for (let i = 0; i < jb.n; i++) {
      const jd = jb.jd[i];
      const band = Math.exp(-(((jd - 3.0) / 1.15) ** 2));
      if (band < 0.02) continue;
      const p = jb.P(i), nrm = jb.N(i);
      const facing = sstep(-0.45, 0.1, nrm.dot(jb === T ? nJ : nJ.clone().negate()));
      const radial = p.clone().sub(c); const dist = radial.length(); radial.addScaledVector(nJ, -radial.dot(nJ)).normalize();
      const near = sstep(R * 2.2, R * 1.2, dist);
      const lump = 0.35 + 0.65 * fbm(p.x * 0.38 + 7, p.y * 0.38, p.z * 0.38, 3);
      jb.osteoMask[i] = band * facing * near * bias(radial) * lump * 1.25;
    }
  };
  ring(T, cT, RT, (d) => 0.45 + 0.75 * Math.max(0, d.dot(AX.ulnar)) + 0.45 * Math.max(0, d.dot(AX.palmar)));
  ring(F, cF, RF, (d) => 0.35 + 0.8 * Math.max(0, d.dot(AX.palmar)) + 0.35 * Math.max(0, d.dot(AX.ulnar)) + 0.25 * Math.max(0, d.dot(AX.dorsal)));
  // STT (stage IV)
  if (T.js) for (let i = 0; i < T.n; i++) { const b = Math.exp(-(((T.js[i] - 2.4) / 1.0) ** 2)); T.sttMask[i] = b * (0.4 + 0.6 * fbm(T.base[i * 3] * 0.5, T.base[i * 3 + 1] * 0.5, T.base[i * 3 + 2] * 0.5)) * 1.3; }
  for (let i = 0; i < S.n; i++) { const b = Math.exp(-(((S.jd[i] - 2.4) / 1.0) ** 2)); S.sttMask[i] = b * (0.4 + 0.6 * fbm(S.base[i * 3] * 0.5 + 3, S.base[i * 3 + 1] * 0.5, S.base[i * 3 + 2] * 0.5)) * 1.3; }

  scene.add(T.buildCartilage(), F.buildCartilage());
  JB.F.cart.userData.thumb = true;
  for (const n of THUMB_NAMES) meshes[n].userData.thumb = true;
}

function thumbOffset() {
  const P = STAGE_P[state.stage];
  const off = geo.nJ.clone().multiplyScalar(BASE_GAP - P.narrow).addScaledVector(geo.subluxDir, P.sublux);
  const trac = (state.mode === 'arthro' && state.traction ? TRACTION : 0) + (state.mode !== 'arthro' ? state.distract : 0);
  return off.addScaledVector(geo.a1, trac);
}
function thumbMeshes() { return [...THUMB_NAMES.map((n) => meshes[n]), JB.F.cart]; }
function applyThumb() {
  const off = thumbOffset();
  for (const m of thumbMeshes()) { m.position.copy(off); m.updateMatrixWorld(true); }
  geo.thumbOff = off;
  geo.J = geo.cT.clone().add(geo.cF.clone().add(off)).multiplyScalar(0.5);
  fitCapsule();
}

// ---------- capsule, synovium, loose bodies ----------
function buildCapsule() {
  const g = new THREE.SphereGeometry(1, 96, 64);
  capsule = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xe8c9c0, roughness: 0.5, transparent: true, opacity: 0.28, depthWrite: false }));
  capsule.layers.set(1); capsule.userData = { zname: '__synovium', group: 'capsule' };
  const synMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, side: THREE.BackSide });
  synMat.onBeforeCompile = (sh) => {
    sh.uniforms.hyper = hyperU;
    sh.vertexShader = 'varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP = position;');
    sh.fragmentShader = 'uniform float hyper;\nvarying vec3 vOP;\n' + GLSL_NOISE + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 q = vOP * 9.0;
      float n = fib(q);
      float v1 = 1.0 - smoothstep(0.0, 0.045, abs(fib(q * 0.8 + 11.0) - 0.5));
      float v2 = 1.0 - smoothstep(0.0, 0.03, abs(fib(q * 1.9 + 23.0) - 0.5));
      vec3 base = mix(vec3(0.93, 0.80, 0.74), vec3(0.86, 0.58 - 0.2 * hyper, 0.55 - 0.15 * hyper), n);
      base = mix(base, vec3(0.6, 0.1, 0.12), max(v1, v2 * 0.6) * (0.45 + 0.5 * hyper));
      diffuseColor.rgb *= base;`);
  };
  capsuleInner = new THREE.Mesh(g, synMat);
  capsuleInner.layers.set(2); capsuleInner.userData = { zname: '__synovium', group: 'capsule' };
  capsuleScope = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd9b0a6, roughness: 0.6 }));
  capsuleScope.layers.set(2);
  for (const m of [capsule, capsuleInner, capsuleScope]) { m.matrixAutoUpdate = false; scene.add(m); }

  const prof = [[0.30, 0], [0.31, 0.2], [0.28, 0.45], [0.24, 0.7], [0.18, 0.86], [0.1, 0.96], [0, 1]].map(([x, y]) => new THREE.Vector2(x, y));
  const coneG = new THREE.LatheGeometry(prof, 8);
  // bend the fronds slightly
  const cp = coneG.attributes.position;
  for (let i = 0; i < cp.count; i++) { const y = cp.getY(i); cp.setX(i, cp.getX(i) + 0.45 * y * y); }
  coneG.computeVertexNormals();
  fronds = new THREE.InstancedMesh(coneG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), 520);
  fronds.userData = { zname: '__synovium', group: 'capsule' };
  fronds.layers.set(1); fronds.layers.enable(2);
  fronds.frustumCulled = false;
  scene.add(fronds);
  const rnd = mulberry(7);
  for (let k = 0; k < 2000 && frondData.length < 520; k++) {
    const u = V(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); if (u.lengthSq() > 1 || u.lengthSq() < 0.05) continue;
    u.normalize();
    frondData.push({ u, len: 1.2 + rnd() * 2.2, tilt: V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(2.2), hue: rnd(), removed: false, ok: true });
  }
  const lbG = (seed) => {
    const g2 = new THREE.IcosahedronGeometry(1, 3), p = g2.attributes.position, r2 = mulberry(seed);
    const s = V(0.55 + r2() * 0.4, 0.45 + r2() * 0.3, 0.6 + r2() * 0.5);
    for (let i = 0; i < p.count; i++) { const v = V(p.getX(i), p.getY(i), p.getZ(i)); const f = 0.8 + 0.4 * fbm(v.x * 2 + seed, v.y * 2, v.z * 2); p.setXYZ(i, v.x * s.x * f, v.y * s.y * f, v.z * s.z * f); }
    g2.computeVertexNormals(); return g2;
  };
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(lbG(11 + k * 5), new THREE.MeshPhysicalMaterial({ color: 0xe6dcc0, roughness: 0.4, clearcoat: 0.4 }));
    m.userData = { zname: '__loose', group: 'capsule', u: [V(-0.55, 0.2, -0.6), V(0.6, -0.1, 0.55), V(-0.2, -0.35, 0.75)][k].normalize(), removed: false };
    m.layers.set(1); m.layers.enable(2); scene.add(m); looseBodies.push(m);
  }
}
function insideBones(p) {
  // approximate inside test against trapezium / MC1 using nearest vertex and its normal
  for (const jb of [JB.T, JB.F]) {
    const lp = jb.mesh.worldToLocal(p.clone());
    const i = jb.nearest(lp);
    const pos = jb.g.attributes.position.array, nrm = jb.g.attributes.normal.array;
    const dx = lp.x - pos[i * 3], dy = lp.y - pos[i * 3 + 1], dz = lp.z - pos[i * 3 + 2];
    if (dx * nrm[i * 3] + dy * nrm[i * 3 + 1] + dz * nrm[i * 3 + 2] < 0.15) return true;
  }
  return false;
}
function fitCapsule() {
  const pts = [];
  for (const jb of [JB.T, JB.F]) {
    const off = jb === JB.F ? geo.thumbOff : V();
    for (let i = 0; i < jb.n; i += 2) if (jb.w[i] > 0.05) pts.push(jb.P(i).add(off));
  }
  const p = pca(pts);
  const ext = [0, 0, 0];
  for (const q of pts) { const d = q.clone().sub(p.center); for (let k = 0; k < 3; k++) ext[k] = Math.max(ext[k], Math.abs(d.dot(p.vectors[k]))); }
  // axis most aligned with the joint normal gets extra room for the joint space
  const ni = [0, 1, 2].reduce((b, k) => (Math.abs(p.vectors[k].dot(geo.nJ)) > Math.abs(p.vectors[b].dot(geo.nJ)) ? k : b), 0);
  const r = ext.map((e, k) => (k === ni ? e * 1.15 + 2.2 : e * 1.08 + 1.6));
  const m = new THREE.Matrix4().makeBasis(p.vectors[0].clone().multiplyScalar(r[0]), p.vectors[1].clone().multiplyScalar(r[1]), p.vectors[2].clone().multiplyScalar(r[2]));
  m.setPosition(p.center);
  geo.capM = m; geo.capInv = m.clone().invert(); geo.capCentre = p.center; geo.capNi = ni; geo.capAxes = p.vectors; geo.capR = r;
  for (const c of [capsule, capsuleInner, capsuleScope]) { c.matrix.copy(m); c.matrixWorldNeedsUpdate = true; }
  layoutFronds(); layoutLoose();
}
function insideCapsule(p) { return p.clone().applyMatrix4(geo.capInv).length() < 1; }
function layoutFronds() {
  const P = STAGE_P[state.stage];
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const nAxis = geo.capAxes[geo.capNi];
  let active = 0;
  frondData.forEach((f, k) => {
    const base = f.u.clone().applyMatrix4(geo.capM);
    // synovitis concentrates at the capsular reflections around the articular margins
    const eq = Math.abs(f.u.dot(new THREE.Vector3().setComponent(geo.capNi, 1)));
    f.ok = k < P.fronds && eq < 0.6 && !insideBones(base);
    const show = f.ok && !f.removed;
    if (f.ok) active++;
    const inward = geo.capCentre.clone().sub(base).normalize().add(f.tilt).normalize();
    q.setFromUnitVectors(V(0, 1, 0), inward);
    const s = show ? f.len * (0.7 + 0.5 * P.hyper) : 0;
    mtx.compose(base.addScaledVector(inward, -0.15), q, V(show ? 1 : 0, s, show ? 1 : 0));
    fronds.setMatrixAt(k, mtx);
    col.setRGB(lerp(0.82, 0.92, f.hue), lerp(0.42, 0.28, f.hue * P.hyper), lerp(0.42, 0.3, f.hue));
    fronds.setColorAt(k, col);
  });
  fronds.instanceMatrix.needsUpdate = true; if (fronds.instanceColor) fronds.instanceColor.needsUpdate = true;
  fronds.computeBoundingSphere();
  geo.frondTotal = active; void nAxis;
  colorSynovium();
}
function layoutLoose() {
  const P = STAGE_P[state.stage];
  looseBodies.forEach((m, k) => {
    const p = m.userData.u.clone().multiplyScalar(0.72).applyMatrix4(geo.capM);
    m.position.copy(p); m.rotation.set(k, k * 2, k * 0.5);
    m.visible = k < P.loose && !m.userData.removed;
    m.updateMatrixWorld(true);
  });
}
function colorSynovium() { hyperU.value = STAGE_P[state.stage].hyper; }

// ---------- portals & instruments ----------
function nearPlane(mesh, J, n, tol) {
  const pos = mesh.geometry.attributes.position, c = V(); let k = 0;
  for (let i = 0; i < pos.count; i++) { const p = V(pos.getX(i), pos.getY(i), pos.getZ(i)); if (Math.abs(p.clone().sub(J).dot(n)) < tol && p.distanceTo(J) < 30) { c.add(p); k++; } }
  return k ? c.divideScalar(k) : null;
}
function buildPortals() {
  state.traction = true;
  const J0 = geo.cT.clone().add(geo.cF.clone().addScaledVector(geo.nJ, BASE_GAP)).multiplyScalar(0.5);
  const n = geo.nJ;
  const A = nearPlane(meshes['Abductor pollicis longus'], J0, n, 3) || J0.clone().addScaledVector(AX.radial, 14);
  const E = nearPlane(meshes['Extensor pollicis brevis'], J0, n, 3) || J0.clone().addScaledVector(AX.dorsal, 12);
  const L = nearPlane(meshes['Extensor pollicis longus'], J0, n, 4) || J0.clone().addScaledVector(AX.dorsal, 14).addScaledVector(AX.ulnar, 6);
  const out = (p, from, dist) => { const d = perp(p.clone().sub(J0), n); return J0.clone().addScaledVector(d, clamp(p.distanceTo(J0) + dist, 11, 22)); };
  const shift = (p, away, mm) => p.clone().addScaledVector(perp(p.clone().sub(away), n), mm);
  geo.portals = {
    '1-R': { label: '1-R (radial to APL)', entry: out(shift(A, E, 3), J0, 3) },
    '1-U': { label: '1-U (ulnar to EPB)', entry: out(shift(E, A, 3), J0, 3) },
    'D-2': { label: 'D-2 (ulnar to EPL)', entry: out(shift(L, E, 3), J0, 3) },
    'Thenar': { label: 'Thenar', entry: J0.clone().addScaledVector(perp(AX.palmar.clone().addScaledVector(AX.radial, 0.45), n), 17) },
  };
  for (const k in geo.portals) geo.portals[k].entry.addScaledVector(n, 0.4);
  const fill = (sel, val) => { sel.innerHTML = Object.entries(geo.portals).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join(''); sel.value = val; };
  fill($('#scopePortal'), scope.portal); fill($('#workPortal'), scope.work);
  // danger structures, world-space vertex lists
  const vlist = (names) => names.flatMap((nm) => { const m = meshes[nm]; if (!m) return []; const p = m.geometry.attributes.position, a = []; for (let i = 0; i < p.count; i += 2) a.push(V(p.getX(i), p.getY(i), p.getZ(i))); return a; });
  geo.artery = vlist(['Radial artery', 'Dorsal carpal anastomosis', 'Palmar carpal branch of radial artery']);
  geo.nerve = vlist(['Superficial branch of radial nerve', 'Dorsal digital branches of radial nerve']);
}
function buildInstruments() {
  const shaft = new THREE.CylinderGeometry(0.95, 0.95, 1, 20, 1, false); shaft.translate(0, 0.5, 0);
  scopeMesh = new THREE.Mesh(shaft, new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.9, roughness: 0.3 }));
  scopeMesh.layers.set(1); scene.add(scopeMesh);
  const marker = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 8, 24), new THREE.MeshBasicMaterial({ color: 0x5b8cff }));
  marker.layers.set(1); scopeMesh.userData.marker = marker; scene.add(marker);
  instrument = new THREE.Group();
  const sh = new THREE.Mesh(shaft.clone(), new THREE.MeshStandardMaterial({ color: 0xb8bfc7, metalness: 0.95, roughness: 0.22 }));
  sh.scale.set(0.8, 1, 0.8); instrument.add(sh); instrument.userData.shaft = sh;
  const tips = {
    probe: (() => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 10), sh.material); c.rotation.z = Math.PI / 2; c.position.x = 0.8; g.add(c); const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), sh.material); b.position.x = 1.6; g.add(b); return g; })(),
    shaver: (() => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 18), sh.material); c.position.y = -0.4; g.add(c); const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.5 })); w.position.set(0, -0.6, 0.6); g.add(w); return g; })(),
    burr: (() => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.35, flatShading: true })); g.add(b); return g; })(),
    grasper: (() => { const g = new THREE.Group(); for (const s of [-1, 1]) { const j = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.8, 0.9), sh.material); j.position.set(s * 0.45, 0.2, 0); j.rotation.z = s * 0.25; g.add(j); } return g; })(),
  };
  for (const k in tips) { tips[k].visible = false; instrument.add(tips[k]); }
  instrument.userData.tips = tips;
  instrument.traverse((o) => { o.layers.set(1); o.layers.enable(2); });
  scene.add(instrument);
}
function resetScope() {
  const e = geo.portals[scope.portal].entry;
  const target = geo.J.clone();
  scope.dir = target.clone().sub(e).normalize();
  scope.home = scope.dir.clone();
  scope.maxDepth = e.distanceTo(target) + 9;
  scope.depth = e.distanceTo(target) - 2.5;
  scope.roll = 0;
  $('#depth').max = scope.maxDepth.toFixed(1);
  syncScopeUI();
}
function syncScopeUI() {
  $('#depth').value = scope.depth; $('#depthOut').textContent = `${scope.depth.toFixed(1)} mm`;
  $('#roll').value = scope.roll; $('#rollOut').textContent = `${Math.round(scope.roll)}°`;
}
function scopeFrame() {
  const e = geo.portals[scope.portal].entry;
  const d = scope.dir;
  const tip = e.clone().addScaledVector(d, scope.depth);
  const up = perp(geo.nJ, d);
  const right = d.clone().cross(up).normalize();
  const ang = THREE.MathUtils.degToRad(scope.roll);
  const lensOff = up.clone().multiplyScalar(-Math.cos(ang)).addScaledVector(right, Math.sin(ang));
  const view = d.clone().multiplyScalar(Math.cos(Math.PI / 6)).addScaledVector(lensOff, Math.sin(Math.PI / 6)).normalize();
  return { e, tip, d, up, right, view };
}
function updateScope() {
  const f = scopeFrame();
  scopeCam.position.copy(f.tip);
  scopeCam.up.copy(f.up);
  scopeCam.lookAt(f.tip.clone().add(f.view));
  scopeLight.position.copy(f.tip); scopeLight.target.position.copy(f.tip.clone().addScaledVector(f.view, 5)); scopeLight.target.updateMatrixWorld();
  // shaft from 25 mm outside the portal to the tip
  const start = f.e.clone().addScaledVector(f.d, -25);
  scopeMesh.position.copy(start);
  scopeMesh.quaternion.setFromUnitVectors(V(0, 1, 0), f.d);
  scopeMesh.scale.set(1, start.distanceTo(f.tip), 1);
  const mk = scopeMesh.userData.marker; mk.position.copy(f.e); mk.quaternion.setFromUnitVectors(V(0, 0, 1), f.d);
  const inJ = insideCapsule(f.tip);
  if (inJ) scope.everInJoint = true;
  scope.inJoint = inJ;
  scope.inBone = insideBones(f.tip);
}
function placeInstrument(tipPoint) {
  const tool = state.tool;
  const vis = state.mode === 'arthro' && tool !== 'scope';
  instrument.visible = vis;
  if (!vis) return;
  const e = geo.portals[scope.work].entry;
  const tip = tipPoint ? tipPoint.clone() : e.clone().lerp(geo.J, 0.85);
  const d = tip.clone().sub(e).normalize();
  const backoff = tool === 'burr' ? 0.9 : tool === 'shaver' ? 0.3 : tool === 'grasper' ? 1.2 : 1.4;
  const end = tip.clone().addScaledVector(d, -backoff);
  const start = e.clone().addScaledVector(d, -25);
  const sh = instrument.userData.shaft;
  instrument.position.set(0, 0, 0); instrument.quaternion.identity();
  sh.position.copy(start); sh.quaternion.setFromUnitVectors(V(0, 1, 0), d); sh.scale.set(0.8, Math.max(0.1, start.distanceTo(end)), 0.8);
  for (const [k, t] of Object.entries(instrument.userData.tips)) {
    t.visible = k === tool;
    if (!t.visible) continue;
    t.position.copy(end.clone().addScaledVector(d, tool === 'burr' ? 0.9 : 0.6));
    t.quaternion.setFromUnitVectors(V(0, -1, 0), d);
  }
  instrument.userData.seg = [e, tip];
}

// ---------- stage / pathology ----------
function applyStage(s) {
  state.stage = s;
  const P = STAGE_P[s];
  for (const [jb, wc, R] of [[JB.T, geo.wearT, geo.RT], [JB.F, geo.wearF, geo.RF]]) {
    for (let i = 0; i < jb.n; i++) {
      if (jb.w[i] <= 0) { jb.loss[i] = 0; jb.soft[i] = 0; jb.fibA[i] = 0; continue; }
      const dW = jb.P(i).distanceTo(wc) / R;
      const wob = (fbm(jb.base[i * 3] * 0.6, jb.base[i * 3 + 1] * 0.6, jb.base[i * 3 + 2] * 0.6) - 0.5) * 0.35;
      jb.loss[i] = P.loss > 0 ? clamp((P.loss + wob - dW) / 0.22, 0, 1) : 0;
      jb.soft[i] = P.soft * clamp(1.3 - dW * 0.6, 0, 1);
      const nearLesion = P.loss > 0 ? Math.exp(-(((dW - P.loss) / 0.35) ** 2)) : 0.6;
      jb.fibA[i] = P.fib * (0.35 + 0.65 * nearLesion);
    }
    jb.resetTools();
  }
  JB.S.resetTools();
  frondData.forEach((f) => { f.removed = false; });
  looseBodies.forEach((m) => { m.userData.removed = false; });
  stats.probedT = stats.probedF = false; stats.iatro = { cart: 0, mc1: 0, lig: 0, bone: 0 };
  scope.everInJoint = false;
  // capture baseline osteophyte volume for task progress
  geo.osteoTotal = [JB.T, JB.F].reduce((a, jb) => a + jb.osteoMask.reduce((x, y) => x + y, 0), 0) * P.osteo;
  geo.patchT = []; for (let i = 0; i < JB.T.n; i++) if (JB.T.w[i] > 0.6) geo.patchT.push(i);
  applyThumb();
  if (state.mode === 'arthro' && scope.dir.lengthSq() === 0) resetScope();
  renderStageUI(); renderTasks();
}

// ---------- tools ----------
const raycaster = new THREE.Raycaster();
function toolTargets() {
  const t = [JB.T.mesh, JB.F.mesh, JB.T.cart, JB.F.cart, fronds, capsuleInner, ...looseBodies.filter((m) => m.visible)];
  for (const n of ['Dorsal carpometacarpal ligaments', 'Palmar carpometacarpal ligaments', 'Scaphoid bone', 'Second metacarpal bone', 'Trapezoid bone']) if (meshes[n]) t.push(meshes[n]);
  return t;
}
function warn(msg) { const now = performance.now(); if (now - stats.lastWarn > 1500) { toast(msg, 'warn'); stats.lastWarn = now; } }
function frondsNear(p, r) {
  const m = new THREE.Matrix4(), v = V(); let n = 0;
  frondData.forEach((f, k) => {
    if (!f.ok || f.removed) return;
    fronds.getMatrixAt(k, m); v.setFromMatrixPosition(m);
    if (v.distanceTo(p) < r) { f.removed = true; n++; }
  });
  if (n) layoutFronds();
  return n;
}
function cartInfoAt(jb, i) {
  const ratio = jb.w[i] > 0.05 ? jb.thick[i] / (T0 * jb.w[i]) : 1;
  const fa = jb.fibA[i] * jb.fibRemain[i];
  if (ratio < 0.15) return { grade: 'ICRS 4', txt: 'Full-thickness loss: eburnated subchondral bone' };
  if (ratio < 0.55) return { grade: 'ICRS 3', txt: 'Deep fissuring, > 50% depth' };
  if (fa > 0.05 || jb.soft[i] > 0.3) return { grade: 'ICRS 1–2', txt: 'Softening and superficial fibrillation' };
  return { grade: 'Normal', txt: 'Firm, smooth hyaline cartilage' };
}
function applyTool(hit, dt) {
  const tool = state.tool, obj = hit.object, z = obj.userData.zname;
  const P = STAGE_P[state.stage];
  const which = (o) => (o === JB.T.mesh || o === JB.T.cart ? JB.T : o === JB.F.mesh || o === JB.F.cart ? JB.F : null);
  const jb = which(obj);
  if (tool === 'probe') {
    let txt;
    if (jb) {
      const lp = jb.mesh.worldToLocal(hit.point.clone()); const i = jb.nearest(lp);
      if (jb === JB.T) stats.probedT = true; else stats.probedF = true;
      const name = jb === JB.T ? 'Trapezium' : 'MC1 base';
      if (jb.disp[i] > 0.4) txt = `${name}: osteophyte ≈ ${jb.disp[i].toFixed(1)} mm`;
      else if (jb.resect[i] > 0.2) txt = `${name}: resected bone, depth ${jb.resect[i].toFixed(1)} mm`;
      else if (jb.w[i] > 0.15) { const c = cartInfoAt(jb, i); txt = `${name}: ${c.txt} (${c.grade}) · ${jb.thick[i].toFixed(2)} mm`; }
      else txt = `${name}: non-articular cortex`;
    } else if (obj === fronds) txt = 'Synovitis: hypertrophic villous synovium';
    else if (z === '__loose') txt = 'Loose body: remove with the grasper';
    else if (z === '__synovium') txt = 'Capsule / synovium';
    else txt = z;
    toast(txt);
    return;
  }
  if (tool === 'grasper') {
    if (z === '__loose') { obj.userData.removed = true; obj.visible = false; toast('Loose body removed'); renderTasks(); }
    else if (obj === fronds) { const n = frondsNear(hit.point, 0.6); if (n) toast('Grasper: synovium avulsed. The shaver is more efficient.'); }
    return;
  }
  if (tool === 'shaver') {
    if (obj === fronds || z === '__synovium') { frondsNear(hit.point, 1.6); renderTasks(); return; }
    if (z === '__loose') { obj.userData.removed = true; obj.visible = false; toast('Loose body shaved out'); renderTasks(); return; }
    if (jb) {
      const lp = jb.mesh.worldToLocal(hit.point.clone());
      const iN = jb.nearest(lp);
      if (jb.w[iN] < 0.15 || jb.thick[iN] < 0.03) { warn('Shaver is ineffective on bone: use the burr'); frondsNear(hit.point, 1.2); return; }
      let healthyHit = false;
      jb.forEachNear(lp, 1.4, (i, f) => {
        if (jb.w[i] < 0.05) return;
        const before = jb.fibRemain[i];
        jb.fibRemain[i] = Math.max(0, before - dt * 2.4 * f);
        if (jb.fibA[i] * before < 0.02 && jb.loss[i] < 0.05) { jb.cartLost[i] = Math.min(1, jb.cartLost[i] + dt * 0.5 * f); healthyHit = true; }
      });
      if (healthyHit) { stats.iatro.cart += dt; warn('Careful: shaving healthy cartilage'); }
      jb.dirty = true; frondsNear(hit.point, 1.0);
      return;
    }
    if (/ligament/i.test(z)) { stats.iatro.lig += dt; warn('Shaving a capsular ligament: preserve the DRL / AOL'); }
    return;
  }
  if (tool === 'burr') {
    if (obj === fronds || z === '__synovium') { frondsNear(hit.point, 1.2); if (z === '__synovium') warn('Burr on capsule: risk to capsule and tendons'); renderTasks(); return; }
    if (z === '__loose') { obj.userData.removed = true; obj.visible = false; renderTasks(); return; }
    if (jb) {
      const lp = jb.mesh.worldToLocal(hit.point.clone());
      let healthy = false, mc1 = false;
      jb.forEachNear(lp, 1.5, (i, f) => {
        const ost = P.osteo * jb.osteoMask[i] * jb.osteoRemain[i] + P.stt * jb.sttMask[i] * jb.osteoRemain[i];
        if (ost > 0.05) {
          const amp = Math.max(0.2, P.osteo * jb.osteoMask[i] + P.stt * jb.sttMask[i]);
          jb.osteoRemain[i] = Math.max(0, jb.osteoRemain[i] - dt * 1.6 * f / amp);
        } else if (jb.thick[i] > 0.05 && jb.w[i] > 0.05) {
          if (jb.loss[i] < 0.05 && jb.fibA[i] < 0.09) healthy = true;
          jb.cartLost[i] = Math.min(1, jb.cartLost[i] + dt * 3.0 * f);
        } else {
          jb.resect[i] = Math.min(6, jb.resect[i] + dt * 1.5 * f);
          if (jb === JB.F) mc1 = true;
        }
      });
      if (healthy) { stats.iatro.cart += dt; warn('Burring healthy cartilage'); }
      if (mc1) { stats.iatro.mc1 += dt; warn('Resecting the MC1 base: in hemitrapeziectomy the trapezium is resected'); }
      jb.dirty = true; renderTasksThrottled();
      return;
    }
    if (/ligament/i.test(z)) { stats.iatro.lig += dt; warn('Burr on a capsular ligament'); }
    else if (/bone/i.test(z)) { stats.iatro.bone += dt; warn(`Burr on ${z.replace(' bone', '')}: outside the target joint`); }
  }
}

// ---------- tasks ----------
function taskList() {
  const s = state.stage, P = STAGE_P[s];
  const synTot = frondData.filter((f) => f.ok).length;
  const synRem = frondData.filter((f) => f.ok && f.removed).length;
  const lbTot = Math.min(P.loose, looseBodies.length), lbRem = looseBodies.slice(0, lbTot).filter((m) => m.userData.removed).length;
  let ostLeft = 0; for (const jb of [JB.T, JB.F]) for (let i = 0; i < jb.n; i++) ostLeft += jb.osteoMask[i] * jb.osteoRemain[i] * P.osteo;
  const ostPct = geo.osteoTotal > 0 ? 1 - ostLeft / geo.osteoTotal : 1;
  const hemi = geo.patchT.length ? geo.patchT.filter((i) => JB.T.resect[i] >= 2.5).length / geo.patchT.length : 0;
  return [
    { t: 'Enter the joint with the scope', done: scope.everInJoint, na: false },
    { t: 'Probe the cartilage of trapezium and MC1 base', done: stats.probedT && stats.probedF, na: false, prog: `${+stats.probedT + +stats.probedF}/2 surfaces` },
    { t: 'Synovectomy: remove ≥ 90% of the synovitis', done: synTot > 0 && synRem / synTot >= 0.9, na: synTot === 0, prog: synTot ? `${Math.round((100 * synRem) / synTot)}%` : '' },
    { t: 'Remove all loose bodies', done: lbTot > 0 && lbRem === lbTot, na: lbTot === 0, prog: lbTot ? `${lbRem}/${lbTot}` : '' },
    { t: 'Excise marginal osteophytes (≥ 80%)', done: P.osteo > 0 && ostPct >= 0.8, na: P.osteo === 0, prog: P.osteo ? `${Math.round(ostPct * 100)}%` : '' },
    { t: 'Hemitrapeziectomy: burr ≥ 2.5 mm off the distal trapezial surface (≥ 70% of it)', done: s >= 3 && hemi >= 0.7, na: s < 3, prog: s >= 3 ? `${Math.round(hemi * 100)}%` : '' },
  ];
}
function renderTasks() {
  if (state.mode !== 'arthro' || !geo.patchT) return;
  const items = taskList();
  const io = stats.iatro;
  const iat = [io.cart > 0.2 && 'healthy cartilage damaged', io.mc1 > 0.2 && 'MC1 base resected', io.lig > 0.2 && 'ligament damaged', io.bone > 0.2 && 'adjacent bone burred'].filter(Boolean);
  $('#tasks').innerHTML = items.map((x) => `<li class="${x.done ? 'done' : ''} ${x.na ? 'na' : ''}"><span class="tick"></span><span>${x.t}${x.na ? ' <span class="prog">not needed at this stage</span>' : x.prog ? `<span class="prog">${x.prog}</span>` : ''}</span></li>`).join('') +
    `<li class="${iat.length ? '' : 'done'}"><span class="tick" style="${iat.length ? 'border-color:var(--danger)' : ''}"></span><span>No iatrogenic damage${iat.length ? `<span class="prog lvl-bad">${iat.join(' · ')}</span>` : ''}</span></li>`;
}
let taskTimer = 0;
function renderTasksThrottled() { const n = performance.now(); if (n - taskTimer > 300) { taskTimer = n; renderTasks(); } }

// ---------- UI ----------
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; t.style.background = kind === 'warn' ? 'rgba(160,50,10,.9)' : '';
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2600);
}
function renderStageUI() {
  $('#stageSeg').innerHTML = STAGES.map((s) => `<button data-stage="${s.id}" class="${s.id === state.stage ? 'active' : ''}">${s.short}</button>`).join('');
  const s = STAGES[state.stage];
  const arth = state.mode === 'arthro';
  $('#stageInfo').innerHTML = `<b>${s.title}</b>
    <div class="lbl">${arth ? 'Arthroscopic (Badia)' : 'Radiographic (Eaton–Littler)'}</div><div>${arth ? s.badia : s.eaton}</div>
    <div class="lbl">Shown in the model</div><ul>${s.findings.map((f) => `<li>${f}</li>`).join('')}</ul>
    <div class="lbl">Management</div><div>${s.treatment}</div>
    ${arth && state.stage === 4 ? '<p class="lvl-bad"><b>STT involvement:</b> isolated CMC arthroscopy is not indicated. Practice only.</p>' : ''}`;
}
function setMode(m) {
  state.mode = m;
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  $$('[data-show]').forEach((el) => { el.hidden = !el.dataset.show.split(' ').includes(m); });
  $('#notes').innerHTML = NOTES[m === 'oa' ? 'oa' : m];
  if (!geo.portals) return;
  if (m === 'anatomy' && state.stage !== 0) applyStage(0);
  if (m !== 'oa') { state.xray = false; $('#xrayOn').checked = false; state.heat = false; $('#heatOn').checked = false; }
  if (m === 'oa' && state.stage === 0) applyStage(2);
  if (m === 'arthro') {
    if (state.stage === 0) applyStage(2);
    state.section = false; $('#sectionOn').checked = false; $('#sectionCtl').hidden = true;
    state.layers.hideT = state.layers.hideF = false;
    applyThumb(); resetScope();
    setView('arthro', true);
  } else { applyThumb(); }
  closeQuiz();
  [JB.T, JB.F, JB.S].forEach((jb) => { jb.dirty = true; });
  renderStageUI(); renderTasks(); applyVisibility(); applyXray(); resize();
}
function applyVisibility() {
  const L = state.layers, arth = state.mode === 'arthro';
  for (const m of byGroup.bone) {
    const isT = m.name === 'Trapezium bone', isF = m.name === THUMB_NAMES[0];
    if (isT || isF) m.visible = L.bone && !(isT ? L.hideT : L.hideF);
    else m.visible = arth ? true : L.context && !(L.hideF && THUMB_NAMES.includes(m.name));
  }
  JB.T.cart.visible = (arth || L.cartilage) && !L.hideT;
  JB.F.cart.visible = (arth || L.cartilage) && !L.hideF;
  for (const g of ['ligament', 'muscle', 'nv']) for (const m of byGroup[g]) m.visible = arth ? g !== 'muscle' || TENDONS.includes(m.name) || /sheath/i.test(m.name) : L[g];
  if (arth) extCam.layers.enable(1); else if (L.capsule) extCam.layers.enable(1); else extCam.layers.disable(1);
  scopeMesh.visible = scopeMesh.userData.marker.visible = arth;
  instrument.visible = arth && state.tool !== 'scope';
}
function applyXray() {
  const on = state.xray && state.mode === 'oa';
  for (const m of byGroup.bone) {
    if (!m.userData.mat0) m.userData.mat0 = m.material;
    m.material = on ? xrayMat : m.userData.mat0;
  }
  const hide = on;
  for (const g of ['ligament', 'muscle', 'nv']) for (const m of byGroup[g]) if (hide) m.visible = false;
  if (hide) { JB.T.cart.visible = JB.F.cart.visible = false; extCam.layers.disable(1); } else applyVisibility();
}

// camera presets
let tween = null;
function setView(v, instant) {
  const J = geo.J || V();
  let dir, up = AX.proximal.clone(), dist = 210, target = J.clone();
  const thumbDorsal = perp(AX.radial.clone().addScaledVector(AX.dorsal, 0.6), geo.a1);
  state.layers.hideT = state.layers.hideF = false;
  if (v !== 'trapezium' && v !== 'mc1' && !state.layers.context && geo.lastFace) state.layers.context = true;
  geo.lastFace = v === 'trapezium' || v === 'mc1';
  switch (v) {
    case 'dorsal': dir = AX.dorsal.clone(); break;
    case 'palmar': dir = AX.palmar.clone(); break;
    case 'radial': dir = AX.radial.clone().addScaledVector(AX.dorsal, 0.25).normalize(); break;
    case 'ulnar': dir = AX.ulnar.clone().addScaledVector(AX.palmar, 0.3).normalize(); dist = 180; break;
    case 'trapezium': dir = geo.nJ.clone(); up = perp(AX.palmar, dir); dist = 70; target = geo.cT.clone(); state.layers.hideF = true; state.layers.context = false; break;
    case 'mc1': dir = geo.nJ.clone().negate(); up = perp(AX.palmar, dir); dist = 70; target = geo.cF.clone().add(geo.thumbOff); state.layers.hideT = true; state.layers.context = false; break;
    case 'xap': dir = thumbDorsal; up = geo.a1.clone().negate(); dist = 190; break;
    case 'xlat': dir = geo.a1.clone().cross(thumbDorsal).normalize(); up = geo.a1.clone().negate(); dist = 190; break;
    case 'arthro': dir = AX.radial.clone().addScaledVector(AX.dorsal, 0.9).addScaledVector(AX.proximal, 0.3).normalize(); dist = 120; break;
    default: dir = AX.dorsal.clone();
  }
  $$('[data-layer="hideT"]').forEach((c) => { c.checked = state.layers.hideT; });
  $$('[data-layer="hideF"]').forEach((c) => { c.checked = state.layers.hideF; });
  $$('[data-layer="context"]').forEach((c) => { c.checked = state.layers.context; });
  applyVisibility(); if (state.xray) applyXray();
  const pos = target.clone().addScaledVector(dir, dist);
  if (instant) { extCam.position.copy(pos); extCam.up.copy(up); controls.target.copy(target); extCam.lookAt(target); controls.update(); tween = null; return; }
  tween = { t: 0, p0: extCam.position.clone(), p1: pos, t0: controls.target.clone(), t1: target, u0: extCam.up.clone(), u1: up };
}

// ---------- section plane ----------
const clipPlane = new THREE.Plane();
function updateClip() {
  const n = state.sectionAxis === 'dp' ? geo.nJ.clone().cross(AX.palmar).normalize() : geo.nJ.clone().cross(AX.radial).normalize();
  clipPlane.setFromNormalAndCoplanarPoint(n, geo.J.clone().addScaledVector(n, state.sectionOffset));
}

function faceSection() {
  // look at the cut face from the clipped-away side
  updateClip();
  const n = clipPlane.normal.clone().negate();
  const target = geo.J.clone();
  const up = perp(AX.proximal, n);
  tween = { t: 0, p0: extCam.position.clone(), p1: target.clone().addScaledVector(n, 120), t0: controls.target.clone(), t1: target, u0: extCam.up.clone(), u1: up };
}

// ---------- layout / rects ----------
let W = 1, H = 1;
const rect = { main: null, inset: null };
function resize() {
  const r = viewportEl.getBoundingClientRect();
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  renderer.setSize(W, H, false);
  const arth = state.mode === 'arthro';
  rect.main = { x: 0, y: 0, w: W, h: H };
  rect.inset = null;
  if (arth) {
    const s = Math.min(W, H) * 0.97;
    const scopeR = { x: (W - s) / 2, y: (H - s) / 2, w: s, h: s };
    const iw = Math.min(W * 0.34, 380), ih = iw * 0.72;
    const extR = { x: W - iw - 10, y: H - ih - 10, w: iw, h: ih };
    if (!state.swapped) { rect.scope = scopeR; rect.ext = extR; }
    else { const ss = Math.min(W * 0.34, 300); rect.ext = { x: 0, y: 0, w: W, h: H }; rect.scope = { x: W - ss - 10, y: H - ss - 10, w: ss, h: ss }; }
  } else { rect.ext = { x: 0, y: 0, w: W, h: H }; rect.scope = null; }
  const frame = $('#insetFrame');
  frame.hidden = !arth; $('#hud').hidden = !arth;
  if (arth) {
    const sR = rect.scope;
    const iR = state.swapped ? sR : rect.ext;
    Object.assign(frame.style, { left: `${iR.x}px`, top: `${iR.y}px`, width: `${iR.w}px`, height: `${iR.h}px`, borderRadius: state.swapped ? '50%' : '10px' });
    $('#insetLabel').textContent = state.swapped ? '' : 'External view';
  }
  controls.enabled = !arth || state.swapped;
}
function setVP(r) {
  renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setScissor(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setScissorTest(true);
}

// ---------- rendering ----------
function renderExt(r) {
  setVP(r);
  extCam.aspect = r.w / r.h; extCam.updateProjectionMatrix();
  lightPass(LIGHTS.ext);
  scene.fog.near = 1e5; scene.fog.far = 1e6;
  const xr = state.xray && state.mode === 'oa';
  scene.background = xr ? new THREE.Color(0x050608) : BG_EXT;
  renderer.setClearColor(scene.background);
  renderer.clippingPlanes = state.section && state.mode !== 'arthro' ? [clipPlane] : [];
  renderer.clear();
  renderer.render(scene, extCam);
}
function renderScope(r) {
  setVP(r);
  scopeCam.aspect = r.w / r.h; scopeCam.updateProjectionMatrix();
  lightPass(LIGHTS.scope);
  scene.fog.color.setHex(0x1e0907); scene.fog.near = 6; scene.fog.far = 38;
  scene.background = new THREE.Color(0x000000);
  renderer.setClearColor(0x000000);
  renderer.clippingPlanes = [];
  // in the scope everything near the joint is visible regardless of layer toggles
  const saved = [];
  for (const m of [JB.T.mesh, JB.F.mesh, JB.T.cart, JB.F.cart, ...byGroup.ligament]) { saved.push([m, m.visible]); m.visible = true; }
  renderer.clear();
  renderer.render(scene, scopeCam);
  for (const [m, v] of saved) m.visible = v;
  renderer.render(maskScene, maskCam);
}

let pointer = { x: 0, y: 0, down: false, inScope: false, moved: 0, lastX: 0, lastY: 0, button: 0 };
let hoverHit = null;
function scopeRaycast() {
  const r = rect.scope;
  const nx = ((pointer.x - r.x) / r.w) * 2 - 1, ny = -((pointer.y - r.y) / r.h) * 2 + 1;
  if (nx * nx + ny * ny > 1) return null;
  raycaster.setFromCamera({ x: nx, y: ny }, scopeCam);
  raycaster.layers.set(2); raycaster.layers.enable(0);
  const hits = raycaster.intersectObjects(toolTargets(), false).filter((h) => !(h.object === fronds && h.instanceId != null && frondData[h.instanceId]?.removed));
  return hits[0] || null;
}
function pointIn(r) { return r && pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h; }

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 0.6); const k = sstep(0, 1, tween.t);
    extCam.position.lerpVectors(tween.p0, tween.p1, k); controls.target.lerpVectors(tween.t0, tween.t1, k); extCam.up.lerpVectors(tween.u0, tween.u1, k).normalize();
    if (tween.t >= 1) tween = null;
  }
  controls.update();
  if (state.mode === 'arthro' && geo.portals) {
    updateScope();
    hoverHit = null;
    if (state.tool !== 'scope' && pointIn(rect.scope)) {
      hoverHit = scopeRaycast();
      if (pointer.down && pointer.inScope && hoverHit) applyTool(hoverHit, dt);
    }
    placeInstrument(hoverHit ? hoverHit.point : null);
    updateHud();
  }
  for (const k in JB) JB[k].update();
  if (state.selected) {
    const e = state.selected.material.emissive; if (e) e.setRGB(0.45 + 0.25 * Math.sin(now / 250), 0.28, 0.0);
  }
  renderer.setScissorTest(false); renderer.setClearColor(0x000000); renderer.clear();
  if (state.mode === 'arthro') {
    if (state.swapped) { renderExt(rect.ext); renderScope(rect.scope); } else { renderScope(rect.scope); renderExt(rect.ext); }
  } else { if (state.section) updateClip(); renderExt(rect.ext); }
  updateOrient();
  requestAnimationFrame(frame);
}

function dirName(v) {
  const c = [['palmar', v.z], ['dorsal', -v.z], ['ulnar', v.x], ['radial', -v.x], ['proximal', v.y], ['distal', -v.y]].sort((a, b) => b[1] - a[1]);
  return c[1][1] > 0.38 ? `${c[0][0]}-${c[1][0]}` : c[0][0];
}
let hudTimer = 0;
function updateHud() {
  const n = performance.now(); if (n - hudTimer < 120) return; hudTimer = n;
  const f = scopeFrame();
  const segs = [['Scope', f.e, f.tip]];
  if (instrument.visible && instrument.userData.seg) segs.push(['Instrument', ...instrument.userData.seg]);
  const md = (pts, a, b) => pts.reduce((m, p) => Math.min(m, segDist(p, a, b)), Infinity);
  const lvl = (d) => (d < 2 ? 'lvl-bad' : d < 4 ? 'lvl-warn' : 'lvl-ok');
  $('#safety').innerHTML = segs.map(([nm, a, b]) => {
    const da = md(geo.artery, a, b), dn = md(geo.nerve, a, b);
    return `<div class="d"><span>${nm} tract → radial artery</span><b class="${lvl(da)}">${da.toFixed(1)} mm</b></div><div class="d"><span>${nm} tract → superficial radial n.</span><b class="${lvl(dn)}">${dn.toFixed(1)} mm</b></div>`;
  }).join('') + '<div class="muted" style="font-size:12px">Distances from the instrument tract to the nearest Z-Anatomy vessel/nerve vertex. Skin is not modelled.</div>';
  const look = dirName(f.view);
  let html = `<div><b>${geo.portals[scope.portal].label}</b> · 30° lens looking ${look}</div><div>Depth ${scope.depth.toFixed(1)} mm${state.traction ? ' · traction on' : ''}</div>`;
  if (scope.inBone) html += '<div class="bad">Scope tip inside bone. Withdraw.</div>';
  else if (!scope.inJoint) html += '<div class="warn">Outside the joint capsule: advance the scope</div>';
  if (state.tool !== 'scope') html += `<div>${state.tool[0].toUpperCase() + state.tool.slice(1)} via ${scope.work}${hoverHit ? ` · on ${hitLabel(hoverHit)}` : ''}</div>`;
  $('#hud').innerHTML = html;
  if (scope.everInJoint) renderTasksThrottled();
}
function hitLabel(h) {
  const o = h.object;
  if (o === JB.T.mesh || o === JB.T.cart) return 'trapezium';
  if (o === JB.F.mesh || o === JB.F.cart) return 'MC1 base';
  if (o === fronds) return 'synovitis';
  const z = o.userData.zname;
  return z === '__synovium' ? 'capsule' : z === '__loose' ? 'loose body' : z;
}
let orientTimer = 0;
function updateOrient() {
  const n = performance.now(); if (n - orientTimer < 200) return; orientTimer = n;
  const el = $('#orient');
  if (state.mode === 'arthro' && !state.swapped) { el.textContent = ''; return; }
  const d = extCam.position.clone().sub(controls.target).normalize();
  el.innerHTML = `Viewing from ${dirName(d)}<br>Right hand · mm scale`;
}

// ---------- picking (anatomy / OA) ----------
function pick() {
  const r = rect.ext;
  const nx = ((pointer.x - r.x) / r.w) * 2 - 1, ny = -((pointer.y - r.y) / r.h) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, extCam);
  raycaster.layers.set(0); if (extCam.layers.isEnabled(1)) raycaster.layers.enable(1);
  const cands = [];
  scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible && o.userData.zname && o !== capsule) cands.push(o); });
  let hits = raycaster.intersectObjects(cands, false);
  if (state.section && state.mode !== 'arthro') hits = hits.filter((h) => clipPlane.distanceToPoint(h.point) >= 0);
  select(hits[0] || null);
}
function select(hit) {
  if (state.selected) { state.selected.material.emissive?.setRGB(0, 0, 0); state.selected = null; }
  const info = $('#info');
  if (!hit) { info.hidden = true; return; }
  const o = hit.object, z = o.userData.zname;
  let title = z, group = GROUP_LABEL[o.userData.group] || '', body = INFO[z] || '';
  const jb = o === JB.T.mesh || o === JB.T.cart ? JB.T : o === JB.F.mesh || o === JB.F.cart ? JB.F : null;
  if (z === '__cartilage') { title = `Articular cartilage (${jb === JB.T ? 'trapezium' : 'MC1 base'})`; group = 'Cartilage'; body = INFO.__cartilage; }
  if (z === '__synovium') { title = 'Synovium / capsule'; group = 'Capsule'; body = INFO.__synovium; }
  if (z === '__loose') { title = 'Loose body'; group = 'Pathology'; body = INFO.__loose; }
  let extra = '';
  if (jb) {
    const lp = jb.mesh.worldToLocal(hit.point.clone()); const i = jb.nearest(lp);
    if (jb.disp[i] > 0.4) { extra = `<p><b>Osteophyte</b> here, about ${jb.disp[i].toFixed(1)} mm. ${INFO.__osteophyte}</p>`; }
    if (jb.w[i] > 0.15) { const c = cartInfoAt(jb, i); extra += `<p><b>Cartilage:</b> ${c.txt} (${c.grade}), ${jb.thick[i].toFixed(2)} mm.</p>`; }
  }
  if (o.material && o.material.emissive && o !== fronds) { state.selected = o; if (o.material === cartMat) state.selected = null; }
  info.innerHTML = `<button class="x" aria-label="Close">×</button><div class="g">${group}</div><div class="t">${title}</div><p>${body}</p>${extra}`;
  info.hidden = false;
  info.querySelector('.x').onclick = () => select(null);
}

// ---------- quiz ----------
const quiz = { score: 0, n: 0, cur: null };
function quizPool() { return Object.keys(INFO).filter((k) => !k.startsWith('__') && meshes[k]); }
function nextQuestion() {
  const pool = quizPool();
  const ans = pool[Math.floor(Math.random() * pool.length)];
  const opts = new Set([ans]); while (opts.size < 4) opts.add(pool[Math.floor(Math.random() * pool.length)]);
  const m = meshes[ans];
  const g = m.userData.group;
  if (g !== 'bone') { state.layers[g] = true; $(`[data-layer="${g}"]`).checked = true; }
  state.layers.hideT = state.layers.hideF = false; applyVisibility(); m.visible = true;
  select(null); state.selected = m;
  $('#info').hidden = true;
  m.geometry.computeBoundingSphere();
  const c = m.geometry.boundingSphere.center.clone().add(m.position);
  tween = { t: 0, p0: extCam.position.clone(), p1: c.clone().add(extCam.position.clone().sub(controls.target).normalize().multiplyScalar(80)), t0: controls.target.clone(), t1: c, u0: extCam.up.clone(), u1: extCam.up.clone() };
  quiz.cur = ans;
  const q = $('#quiz');
  q.innerHTML = `<b>Which structure is highlighted?</b><div class="opts">${[...opts].sort(() => Math.random() - 0.5).map((o) => `<button data-a="${o}">${o}</button>`).join('')}</div><div class="row"><span class="muted">Score ${quiz.score}/${quiz.n}</span><span style="flex:1"></span><button id="qNext">Skip</button><button id="qEnd">End</button></div>`;
  q.hidden = false;
  q.querySelectorAll('.opts button').forEach((b) => { b.onclick = () => {
    if (quiz.cur == null) return;
    quiz.n++; const ok = b.dataset.a === quiz.cur; if (ok) quiz.score++;
    b.classList.add(ok ? 'right' : 'wrong');
    q.querySelector(`[data-a="${CSS.escape(quiz.cur)}"]`).classList.add('right');
    quiz.cur = null; q.querySelector('#qNext').textContent = 'Next';
    q.querySelector('.muted').textContent = `Score ${quiz.score}/${quiz.n}`;
  }; });
  q.querySelector('#qNext').onclick = nextQuestion;
  q.querySelector('#qEnd').onclick = closeQuiz;
}
function closeQuiz() { $('#quiz').hidden = true; if (state.selected) { state.selected.material.emissive?.setRGB(0, 0, 0); state.selected = null; } }

// ---------- events ----------
function bindUI() {
  $$('.tabs button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
  $('#stageSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-stage]'); if (b) { applyStage(+b.dataset.stage); [JB.T, JB.F, JB.S].forEach((j) => { j.dirty = true; }); } });
  $('#viewBtns').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  $('#layerChecks').addEventListener('change', (e) => { const l = e.target.dataset.layer; if (!l) return; state.layers[l] = e.target.checked; applyVisibility(); if (state.xray) applyXray(); });
  $('#distract').oninput = (e) => { state.distract = +e.target.value; $('#distractOut').textContent = `${state.distract.toFixed(1)} mm`; applyThumb(); };
  $('#sectionOn').onchange = (e) => { state.section = e.target.checked; $('#sectionCtl').hidden = !state.section; if (state.section) faceSection(); };
  $('#sectionAxis').onchange = (e) => { state.sectionAxis = e.target.value; faceSection(); };
  $('#sectionOffset').oninput = (e) => { state.sectionOffset = +e.target.value; $('#sectionOut').textContent = `${state.sectionOffset.toFixed(1)} mm`; };
  $('#heatOn').onchange = (e) => { state.heat = e.target.checked; [JB.T, JB.F, JB.S].forEach((j) => { j.dirty = true; }); };
  $('#xrayOn').onchange = (e) => { state.xray = e.target.checked; applyXray(); };
  $('#quizBtn').onclick = () => { quiz.score = 0; quiz.n = 0; nextQuestion(); };
  $('#scopePortal').onchange = (e) => { scope.portal = e.target.value; if (scope.work === scope.portal) { scope.work = Object.keys(geo.portals).find((k) => k !== scope.portal); $('#workPortal').value = scope.work; } resetScope(); };
  $('#workPortal').onchange = (e) => { scope.work = e.target.value; if (scope.work === scope.portal) toast('Use a different portal for the instrument'); };
  $('#tractionOn').onchange = (e) => { state.traction = e.target.checked; applyThumb(); if (!state.traction) toast('Without traction the joint space is too tight to work in'); };
  $('#toolSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  $('#depth').oninput = (e) => { scope.depth = +e.target.value; syncScopeUI(); };
  $('#roll').oninput = (e) => { scope.roll = +e.target.value; syncScopeUI(); };
  $('#resetScope').onclick = resetScope;
  $('#swapViews').onclick = () => { state.swapped = !state.swapped; resize(); };
  $('#resetJoint').onclick = () => { applyStage(state.stage); toast('Joint restored'); };
  $('#aboutBtn').onclick = () => $('#about').showModal();
  $('#panelToggle').onclick = () => { document.body.classList.toggle('panel-collapsed'); setTimeout(resize, 0); };

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (state.mode === 'arthro') {
      const tools = ['scope', 'probe', 'shaver', 'burr', 'grasper'];
      if (e.key >= '1' && e.key <= '5') setTool(tools[+e.key - 1]);
      if (e.key === 'q' || e.key === 'Q') { scope.roll = ((scope.roll - 10 + 540) % 360) - 180; syncScopeUI(); }
      if (e.key === 'e' || e.key === 'E') { scope.roll = ((scope.roll + 10 + 540) % 360) - 180; syncScopeUI(); }
      if (e.key === 'w' || e.key === 'ArrowUp') { scope.depth = clamp(scope.depth + 0.5, 0, scope.maxDepth); syncScopeUI(); }
      if (e.key === 's' || e.key === 'ArrowDown') { scope.depth = clamp(scope.depth - 0.5, 0, scope.maxDepth); syncScopeUI(); }
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.lastX = pointer.x; pointer.lastY = pointer.y;
    pointer.down = true; pointer.moved = 0; pointer.button = e.button;
    pointer.inScope = state.mode === 'arthro' && pointIn(rect.scope);
    if (pointer.inScope) canvas.setPointerCapture(e.pointerId);
    if (pointer.inScope && state.tool === 'probe') { const h = scopeRaycast(); if (h) applyTool(h, 0); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    const dx = pointer.x - pointer.lastX, dy = pointer.y - pointer.lastY; pointer.lastX = pointer.x; pointer.lastY = pointer.y;
    if (pointer.down) pointer.moved += Math.abs(dx) + Math.abs(dy);
    if (pointer.down && pointer.inScope && state.tool === 'scope') pivotScope(dx, dy);
  });
  const up = (e) => {
    if (!pointer.down) return;
    pointer.down = false;
    if (pointer.moved < 5 && state.mode !== 'arthro' && pointIn(rect.ext)) { if ($('#quiz').hidden) pick(); }
    if (pointer.inScope) { try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* not captured */ } }
    pointer.inScope = false; renderTasks();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (state.mode === 'arthro' && pointIn(rect.scope)) {
      e.preventDefault(); e.stopImmediatePropagation();
      scope.depth = clamp(scope.depth - Math.sign(e.deltaY) * 0.4, 0, scope.maxDepth); syncScopeUI();
    }
  }, { passive: false, capture: true });
  new ResizeObserver(resize).observe(viewportEl);
}
function pivotScope(dx, dy) {
  const f = scopeFrame();
  const k = 0.0035;
  const q1 = new THREE.Quaternion().setFromAxisAngle(f.up, -dx * k);
  const q2 = new THREE.Quaternion().setFromAxisAngle(f.right, -dy * k);
  const nd = scope.dir.clone().applyQuaternion(q1).applyQuaternion(q2).normalize();
  if (nd.angleTo(scope.home) < THREE.MathUtils.degToRad(55)) scope.dir.copy(nd);
}
function setTool(t) {
  state.tool = t;
  $$('#toolSeg button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  canvas.style.cursor = t === 'scope' ? 'grab' : 'crosshair';
  applyVisibility();
  if (t !== 'scope' && state.swapped) { state.swapped = false; resize(); }
}

// handle for debugging and automated checks in the browser console
window.__cmcj = {
  state, scope, JB, geo: () => geo, applyStage, setTool, taskList, stats, setView,
  apply(nx, ny, secs) { raycaster.setFromCamera({ x: nx, y: ny }, scopeCam); raycaster.layers.set(2); raycaster.layers.enable(0); for (let t = 0; t < secs; t += 0.05) { const h = raycaster.intersectObjects(toolTargets(), false)[0]; if (h) applyTool(h, 0.05); for (const k in JB) JB[k].update(); } },
  probe(nx, ny) { raycaster.setFromCamera({ x: nx, y: ny }, scopeCam); raycaster.layers.set(2); raycaster.layers.enable(0); const h = raycaster.intersectObjects(toolTargets(), false)[0]; return h ? `${hitLabel(h)}:${h.object.userData.zname.slice(0,6)} @ ${h.distance.toFixed(1)}` : "none"; },
};

// ---------- boot ----------
bindUI();
setMode('anatomy');
load().then(() => { setMode('anatomy'); resize(); requestAnimationFrame(frame); }).catch((err) => {
  console.error(err);
  $('#loading').textContent = `Could not load the model: ${err.message}`;
});
