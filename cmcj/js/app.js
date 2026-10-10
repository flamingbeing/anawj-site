// Thumb CMC trainer: normal anatomy, simulated OA, simulated arthroscopy & debridement.
// Units are millimetres. Model axes (right hand, anatomical position):
//   +X ulnar / -X radial, +Y proximal / -Y distal, +Z palmar / -Z dorsal.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// bounding-volume hierarchies make raycasts (aiming, contact, exposure, picking) fast enough for phones
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;
import { STAGES, NOTES, INFO, GROUP_LABEL, VIVA, VIVA_TOPICS } from './content.js';

const $ = (s) => document.querySelector(s);
const COARSE = matchMedia('(pointer: coarse)').matches;
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
const params = new URLSearchParams(location.search);

// Problems on a phone are otherwise invisible: show them over the viewport with GPU details.
let fatal = false;
let renderer;
function gpuInfo() {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${name} · WebGL${renderer.capabilities.isWebGL2 ? '2' : '1'} · ${renderer.capabilities.precision} precision`;
  } catch (_) { return 'WebGL unavailable'; }
}
function showError(msg) {
  if (fatal) return;
  fatal = true;
  const el = $('#loading');
  el.hidden = false;
  el.innerHTML = `<div class="err"><b>Something went wrong displaying the model.</b><p>${String(msg).replace(/</g, '&lt;')}</p><p class="muted">${renderer ? gpuInfo() : ''}<br>${navigator.userAgent.replace(/</g, '&lt;')}</p><p>Try reloading. If it keeps happening, send a screenshot of this message.</p></div>`;
}
window.addEventListener('error', (e) => showError(e.message || e.error));
window.addEventListener('unhandledrejection', (e) => showError(e.reason?.message || e.reason));

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', precision: params.get('precision') || 'highp' });
} catch (err) {
  showError(`WebGL could not start in this browser (${err.message}). Check that hardware acceleration is enabled in Chrome settings.`);
  throw err;
}
renderer.debug.onShaderError = (gl, program, vs, fs) => {
  const log = (sh) => (gl.getShaderInfoLog(sh) || '').trim();
  showError(`Shader compile error: ${log(fs) || log(vs) || gl.getProgramInfoLog(program)}`);
};
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showError('The graphics context was lost (the GPU ran out of memory or was reset). Reload the page.'); });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.localClippingEnabled = false;
renderer.autoClear = false;

const scene = new THREE.Scene();
// The generated environment map renders materials black on some mobile GPUs, so touch devices
// use plain lights unless ?env=1 is given (?env=0 turns it off everywhere).
const USE_ENV = params.has('env') ? params.get('env') !== '0' : !COARSE;
if (USE_ENV) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
}
// fog only matters inside the scope; outside it is pushed beyond the model. Keep the values below
// ~65000 so they survive GPUs that run fragment shaders at medium precision.
const FOG_OFF = [5000, 9000];
scene.fog = new THREE.Fog(0x2a0c0a, FOG_OFF[0], FOG_OFF[1]);
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
const LIGHTS = USE_ENV
  ? { ext: { key: 1.25, fill: 0.4, hemi: 0.2, scope: 0, env: 0.28 }, scope: { key: 0, fill: 0, hemi: 0.06, scope: 7, env: 0.04 } }
  : { ext: { key: 1.6, fill: 0.6, hemi: 0.95, scope: 0, env: 0 }, scope: { key: 0, fill: 0, hemi: 0.1, scope: 7, env: 0 } };
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
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define NP highp
#else
#define NP mediump
#endif
NP float h3(NP vec3 p){ p = mod(p, 251.0); p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(NP vec3 x){ NP vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
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
    this.coff = new Float32Array(n * 3); // burr carving offset (any direction); resect[i] holds its length
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('scl', new THREE.BufferAttribute(new Float32Array(n), 1));
    for (let i = 0; i < n; i++) this.fibN[i] = fbm(this.base[i * 3] * 3.1, this.base[i * 3 + 1] * 3.1, this.base[i * 3 + 2] * 3.1, 3) * 2 - 1;
    this.cart = null; this.dirty = true;
  }
  P(i) { return V(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]); }
  N(i) { return V(this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]); }
  resetTools() { this.osteoRemain.fill(1); this.resect.fill(0); this.coff.fill(0); this.fibRemain.fill(1); this.cartLost.fill(0); this.dirty = true; }
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
      const d = P.osteo * this.osteoMask[i] * this.osteoRemain[i] + P.stt * this.sttMask[i] * this.osteoRemain[i];
      this.disp[i] = d;
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = this.base[i * 3 + k] + this.nrm[i * 3 + k] * d + this.coff[i * 3 + k];
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
    this.g.userData.ver = (this.g.userData.ver || 0) + 1;
    if (this.g.boundsTree) this.g.boundsTree.refit();
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
    cg.userData.ver = (cg.userData.ver || 0) + 1;
    if (cg.boundsTree) cg.boundsTree.refit();
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
  for (const m of Object.values(meshes)) m.geometry.computeBoundsTree();
  for (const jb of [JB.T, JB.F]) jb.cart.geometry.computeBoundsTree();
  capsule.geometry.computeBoundsTree();
  for (const m of looseBodies) m.geometry.computeBoundsTree();
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
  if (state.mode === 'arthro') ensureScopeFree();
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
  for (let k = 0; k < 4000 && frondData.length < 520; k++) {
    const u = V(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); if (u.lengthSq() > 1 || u.lengthSq() < 0.05) continue;
    u.normalize();
    // keep candidates near the capsule equator (the joint line); the axis is fixed later in layoutFronds
    if (Math.min(Math.abs(u.x), Math.abs(u.y), Math.abs(u.z)) > 0.35) continue;
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
// In the simulator, synovitis is only placed where an instrument can reach it from at least one portal
// (the recesses at the articular margin); villi hidden behind the saddle could never be treated.
function frondReachable(f, base) {
  if (state.mode !== 'arthro' || !geo.portals || !geo.collide) return true;
  const n0 = geo.capCentre.clone().sub(base).normalize();
  const inward = n0.clone().add(f.tilt.clone().addScaledVector(n0, -f.tilt.dot(n0)).clampLength(0, 0.9)).normalize();
  const q = base.clone().addScaledVector(inward, Math.min(1.6, f.len * 0.6));
  for (const k in geo.portals) {
    const e = geo.portals[k].entry, d = q.clone().sub(e), len = d.length();
    d.divideScalar(len);
    if (lineClear(e, d, len - 1.0, 0.7, INST_SHAFT_CLEAR)) return true;
  }
  return false;
}
function layoutFronds() {
  const P = STAGE_P[state.stage];
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const nAxis = geo.capAxes[geo.capNi];
  let active = 0;
  frondData.forEach((f, k) => {
    const base = f.u.clone().applyMatrix4(geo.capM);
    // synovitis concentrates at the capsular reflections around the articular margins
    const eq = Math.abs(f.u.dot(new THREE.Vector3().setComponent(geo.capNi, 1)));
    f.ok = k < P.fronds && eq < 0.6 && !insideBones(base) && frondReachable(f, base);
    const show = f.ok && !f.removed;
    if (f.ok) active++;
    // villi lean randomly but always point into the joint, never out through the capsule
    const n0 = geo.capCentre.clone().sub(base).normalize();
    const lean = f.tilt.clone().addScaledVector(n0, -f.tilt.dot(n0)).clampLength(0, 0.9);
    const inward = n0.clone().add(lean).normalize();
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
  geo.collide = [...COLLIDE_NAMES.map((n) => meshes[n]).filter(Boolean), JB.T.cart, JB.F.cart];
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
  sh.scale.set(INST_R / 0.95, 1, INST_R / 0.95); instrument.add(sh); instrument.userData.shaft = sh;
  // tip shapes: origin at the instrument tip, +Y back up the shaft. Each fits inside TOOL_CLEAR of the tip
  // plus the shaft radius, so what collides is what is drawn.
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.5 });
  const tips = {
    probe: (() => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.2, 10), sh.material); c.position.y = 0.6; g.add(c); const hk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 8), sh.material); hk.rotation.z = Math.PI / 2; hk.position.set(0.3, 0.1, 0); g.add(hk); const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), sh.material); b.position.set(0.55, 0.1, 0); g.add(b); return g; })(),
    shaver: (() => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.5, 18), sh.material); c.position.y = 0.75; g.add(c); const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.2), dark); w.position.set(0, 0.5, 0.52); g.add(w); return g; })(),
    burr: (() => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.35, flatShading: true })); g.add(b); return g; })(),
    grasper: (() => { const g = new THREE.Group(); for (const sg of [-1, 1]) { const j = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.6), sh.material); j.position.set(sg * 0.3, 0.7, 0); j.rotation.z = -sg * 0.15; g.add(j); } return g; })(),
  };
  for (const k in tips) { tips[k].visible = false; instrument.add(tips[k]); }
  instrument.userData.tips = tips;
  instrument.traverse((o) => { o.layers.set(1); o.layers.enable(2); });
  scene.add(instrument);
}
// ---------- collision for scope and instruments ----------
// Neither scope nor instruments may enter bone or articular cartilage. Clearance is a signed distance to
// the nearest vertex along its normal (negative = inside); moves are also rejected if the tip's path
// crosses a surface, so nothing can tunnel through a thin edge in one step.
// clearances equal the drawn radii: 1.9 mm scope; instruments have a 1.1 mm shaft
const SCOPE_CLEAR = 0.95, SHAFT_CLEAR = 0.95;
const TOOL_CLEAR = { probe: 0.7, shaver: 0.65, burr: 0.78, grasper: 0.7 };
const INST_R = 0.55, INST_SHAFT_CLEAR = 0.6;
const COLLIDE_NAMES = ['Trapezium bone', 'First metacarpal bone', 'Scaphoid bone', 'Trapezoid bone', 'Second metacarpal bone', 'Proximal phalanx of first finger of hand'];
const _cv = new THREE.Vector3();
// Nearest-vertex queries use a per-mesh uniform grid (cells of GRID_CS mm, searched 3x3x3), so they only see
// surfaces within ~GRID_CS mm; anything further away reports FAR. All clearance thresholds are below that.
// Grids are rebuilt when a joint bone's geometry changes (burring, stage changes).
const GRID_CS = 1.6, FAR = 2.5;
function meshGrid(m) {
  const g = m.geometry;
  if (m.userData.grid && m.userData.gridVer === g.userData.ver) return m.userData.grid;
  const pos = g.attributes.position.array, map = new Map();
  for (let i = 0, n = pos.length / 3; i < n; i++) {
    const k = gridKey(Math.floor(pos[i * 3] / GRID_CS), Math.floor(pos[i * 3 + 1] / GRID_CS), Math.floor(pos[i * 3 + 2] / GRID_CS));
    const c = map.get(k); if (c) c.push(i); else map.set(k, [i]);
  }
  g.computeBoundingBox();
  m.userData.grid = map; m.userData.gridVer = g.userData.ver;
  return map;
}
function gridKey(x, y, z) { return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512); }
const _gp = new THREE.Vector3();
// nearest vertex of mesh m to world point p: { i, d2 } or null if none within the search cells
function nearestVertex(m, p) {
  const map = meshGrid(m), bb = m.geometry.boundingBox;
  const lp = m.worldToLocal(_gp.copy(p));
  if (lp.x < bb.min.x - GRID_CS || lp.y < bb.min.y - GRID_CS || lp.z < bb.min.z - GRID_CS || lp.x > bb.max.x + GRID_CS || lp.y > bb.max.y + GRID_CS || lp.z > bb.max.z + GRID_CS) return null;
  const pos = m.geometry.attributes.position.array;
  const cx = Math.floor(lp.x / GRID_CS), cy = Math.floor(lp.y / GRID_CS), cz = Math.floor(lp.z / GRID_CS);
  let bi = -1, bd = Infinity;
  for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
    const cell = map.get(gridKey(x, y, z)); if (!cell) continue;
    for (const i of cell) {
      const dx = lp.x - pos[i * 3], dy = lp.y - pos[i * 3 + 1], dz = lp.z - pos[i * 3 + 2], d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
  }
  return bi < 0 ? null : { i: bi, d2: bd, lp: lp.clone() };
}
// nearest collider surface point to p (world), as a raycast-like hit for applyTool
function nearestSurface(p) {
  let best = null;
  for (const m of geo.collide) {
    const nv = nearestVertex(m, p); if (!nv) continue;
    // cartilage that has been worn away sits just under the bone; prefer the bone there
    if (m.userData.zname === '__cartilage' && m.userData.jb.thick[m.userData.jb.cartSrc[nv.i]] < 0.03) continue;
    const d = Math.sqrt(nv.d2), pos = m.geometry.attributes.position.array;
    if (!best || d < best.distance) best = { object: m, distance: d, point: V(pos[nv.i * 3], pos[nv.i * 3 + 1], pos[nv.i * 3 + 2]).applyMatrix4(m.matrixWorld) };
  }
  return best;
}
function boneClearance(p) {
  let best = FAR;
  for (const m of geo.collide) {
    const nv = nearestVertex(m, p); if (!nv) continue;
    if (m.userData.zname === '__cartilage' && m.userData.jb.thick[m.userData.jb.cartSrc[nv.i]] < 0.03) continue; // sunk under bone
    const pos = m.geometry.attributes.position.array, nrm = m.geometry.attributes.normal.array, i = nv.i * 3;
    const sd = (nv.lp.x - pos[i]) * nrm[i] + (nv.lp.y - pos[i + 1]) * nrm[i + 1] + (nv.lp.z - pos[i + 2]) * nrm[i + 2];
    best = Math.min(best, sd < 0 ? -Math.sqrt(nv.d2) : Math.sqrt(nv.d2));
  }
  return best;
}
const segRay = new THREE.Raycaster();
segRay.firstHitOnly = true;
function crossesSurface(a, b) {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-6) return false;
  segRay.set(a, d.divideScalar(len)); segRay.near = 0; segRay.far = len;
  return segRay.intersectObjects(geo.collide, false).length > 0;
}
// line from entry e along dir is free: tip clearance, and the whole shaft back to the portal
const _lp = new THREE.Vector3();
function lineClear(e, dir, depth, tipClear, shaftClear) {
  if (boneClearance(_lp.copy(e).addScaledVector(dir, depth)) <= tipClear) return false;
  for (let d = depth - 0.6; d > 0; d -= 0.6) if (boneClearance(_lp.copy(e).addScaledVector(dir, d)) <= shaftClear) return false;
  return true;
}
// furthest depth reachable by advancing along dir from `from` towards `to` without touching a surface
function reach(e, dir, from, to, tipClear) {
  let d = from;
  while (d < to) {
    const n = Math.min(to, d + 0.1);
    if (boneClearance(e.clone().addScaledVector(dir, n)) <= tipClear) return d;
    d = n;
  }
  return d;
}
const scopeEntry = () => geo.portals[scope.portal].entry;
function tipAt(dir, depth) { return scopeEntry().clone().addScaledVector(dir, depth); }
function tipFree(dir, depth) { return boneClearance(tipAt(dir, depth)) > SCOPE_CLEAR; }
function lineFree(dir, depth) { return lineClear(scopeEntry(), dir, depth, SCOPE_CLEAR, SHAFT_CLEAR); }
function reachDepth(dir, from, to) { return reach(scopeEntry(), dir, from, to, SCOPE_CLEAR); }
let bumpTime = 0;
function bump() { const n = performance.now(); if (n - bumpTime > 1500) { toast('Scope tip against bone'); bumpTime = n; } scope.bumped = n; }
function setDepth(d) {
  d = clamp(d, 0, scope.maxDepth);
  if (d > scope.depth) { const r = reachDepth(scope.dir, scope.depth, d); if (r < d - 1e-3) bump(); d = r; }
  scope.depth = d; syncScopeUI();
}
function rollLens(deg) { scope.roll = ((scope.roll + deg + 540) % 360) - 180; syncScopeUI(); }
// after the joint moves (stage, traction, burring) back the scope out until it is clear again
function ensureScopeFree() {
  if (!geo.portals || scope.dir.lengthSq() === 0) return;
  for (const k in JB) JB[k].update(); // pick up new osteophytes / cartilage before testing
  ensureInstFree();
  let d = scope.depth, moved = false;
  while (d > 0 && !lineFree(scope.dir, d)) { d = Math.max(0, d - 0.25); moved = true; }
  if (moved) { scope.depth = d; syncScopeUI(); toast('Scope withdrawn to clear bone'); }
}
function resetScope() {
  const e = geo.portals[scope.portal].entry;
  const target = geo.J.clone();
  const base = target.clone().sub(e).normalize();
  const want = e.distanceTo(target) - 1.5;
  scope.maxDepth = e.distanceTo(target) + 9;
  // aim at the joint centre; if bone blocks the straight path, try nearby directions and keep the deepest
  const up = perp(geo.nJ, base), right = base.clone().cross(up).normalize();
  let best = { dir: base, d: -1 };
  for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    const dir = base.clone().addScaledVector(up, a * 0.07).addScaledVector(right, b * 0.07).normalize();
    const d = reachDepth(dir, 0, want);
    if (d > best.d + 0.3) best = { dir, d };
    if (d >= want) break;
  }
  scope.dir = best.dir.clone();
  scope.home = best.dir.clone();
  scope.depth = Math.max(0, best.d - 0.3);
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
// The instrument is a rigid rod through the working portal. Touching the scope view sets an aim point;
// the instrument pivots and advances towards it at a finite speed, stops at bone/cartilage, and only
// acts on tissue that its own tip is touching.
const inst = { dir: V(), depth: 0, contact: null, aim: null, probeT: 0, hold: 0, holdAt: null };
const workEntry = () => geo.portals[scope.work].entry;
const instTip = (dir = inst.dir, depth = inst.depth) => workEntry().clone().addScaledVector(dir, depth);
function resetInstrument() {
  if (!geo.portals) return;
  const e = workEntry(), base = geo.J.clone().sub(e).normalize();
  inst.dir = base; inst.depth = reach(e, base, 0, e.distanceTo(geo.J) - 3, 0.9);
  ensureInstFree();
  inst.contact = null;
}
function ensureInstFree() {
  if (inst.dir.lengthSq() === 0) return;
  const c = TOOL_CLEAR[state.tool] || 0.5;
  while (inst.depth > 0 && !lineClear(workEntry(), inst.dir, inst.depth, c, INST_SHAFT_CLEAR)) inst.depth = Math.max(0, inst.depth - 0.25);
}
function aimRay(px) {
  const r = rect.scope;
  const nx = ((px.x - r.x) / r.w) * 2 - 1, ny = -((px.y - r.y) / r.h) * 2 + 1;
  if (nx * nx + ny * ny > 0.97) return null;
  raycaster.setFromCamera({ x: nx, y: ny }, scopeCam);
  raycaster.layers.set(2); raycaster.layers.enable(0);
  const hits = raycaster.intersectObjects(toolTargets(), false).filter((h) => !(h.object === fronds && h.instanceId != null && frondData[h.instanceId]?.removed));
  let hit = hits[0] || null;
  // villi are thin: aiming close to one (within ~1.2 mm of the ray, in front of what the ray hit) snaps to it
  if (hit && hit.object !== fronds) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(), pos = V();
    let best = null;
    frondData.forEach((f, k) => {
      if (!f.ok || f.removed) return;
      fronds.getMatrixAt(k, m); m.decompose(pos, q, sc);
      const mid = pos.clone().add(V(0, sc.y * 0.5, 0).applyQuaternion(q));
      const t = mid.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction);
      if (t <= 0 || t > hit.distance + 0.5) return;
      const d = raycaster.ray.distanceToPoint(mid);
      if (d < 1.2 && (!best || t < best.t)) best = { t, mid, k };
    });
    if (best) hit = { object: fronds, instanceId: best.k, point: best.mid, distance: best.t };
  }
  return { hit, point: hit ? hit.point.clone() : raycaster.ray.at(8, V()) };
}
function updateInstrument(dt, now) {
  const tool = state.tool;
  inst.contact = null;
  if (tool === 'scope' || !geo.portals) { inst.aim = null; return; }
  if (inst.dir.lengthSq() === 0) resetInstrument();
  const e = workEntry(), clr = TOOL_CLEAR[tool];
  // aim point: under the mouse, or offset above a finger so the finger does not hide the target
  const px = pointIn(rect.scope) && (pointer.down || !pointer.touch) ? { x: pointer.x, y: pointer.y - (pointer.touch ? AIM_OFFSET : 0) } : null;
  const active = pointer.down && pointer.inScope && !pointer.aim;
  inst.aim = px ? { px, ...(aimRay(px) || {}) } : null;
  // holding a running burr on one spot keeps feeding it into the bone (up to 3 mm past the aimed surface)
  if (active && tool === 'burr' && inst.atAim && inst.contact0 && inst.aim && inst.holdAt && inst.aim.px && Math.hypot(inst.aim.px.x - inst.holdAt.x, inst.aim.px.y - inst.holdAt.y) < 25) inst.hold = Math.min(4, inst.hold + dt);
  else { inst.hold = 0; inst.holdAt = inst.aim && inst.aim.px ? { ...inst.aim.px } : null; }
  if (active && inst.aim && inst.aim.point) {
    const want = inst.aim.point.clone().sub(e);
    const goal = want.length() + 0.3 + inst.hold;
    const wantDir = want.normalize();
    const ang = inst.dir.angleTo(wantDir);
    if (ang > 1e-4) {
      // try the full step, then a smaller one, then sliding along each axis; if all are blocked back off
      const full = Math.min(1, (1.6 * dt) / ang);
      const axisA = inst.dir.clone().cross(wantDir).normalize();
      const cands = [inst.dir.clone().lerp(wantDir, full), inst.dir.clone().lerp(wantDir, full / 3)];
      const side = wantDir.clone().sub(inst.dir).normalize();
      const sideB = axisA.clone().cross(inst.dir).normalize();
      for (const sgn of [1, -1]) cands.push(inst.dir.clone().addScaledVector(side.clone().addScaledVector(sideB, sgn).normalize(), 1.6 * dt));
      let moved = false;
      for (const c of cands) {
        const nd = c.normalize();
        if (lineClear(e, nd, inst.depth, clr, INST_SHAFT_CLEAR) && !crossesSurface(instTip(), instTip(nd))) { inst.dir.copy(nd); moved = true; break; }
      }
      if (!moved) inst.depth = Math.max(0, inst.depth - 3 * dt); // back off to get round the obstacle
    }
    if (goal > inst.depth) {
      const before = inst.depth;
      inst.depth = reach(e, inst.dir, inst.depth, Math.min(goal, inst.depth + 10 * dt), clr);
      // a running burr feeds into trapezium / MC1 at a cutting rate, carving as it goes
      if (tool === 'burr' && inst.depth < goal - 1e-3 && inst.depth - before < 1e-3 && inst.contact0 && (inst.contact0 === JB.T || inst.contact0 === JB.F)) {
        const nd = Math.min(goal, inst.depth + BURR_FEED * dt);
        if (lineClear(e, inst.dir, nd, -1, INST_SHAFT_CLEAR)) {
          const keep = inst.depth;
          inst.depth = nd; carve(inst.contact0, instTip(), BURR_CUT, dt);
          if (boneClearance(instTip()) < clr - 0.12) { inst.dbg = 'revert'; inst.depth = keep; } else inst.dbg = 'fed'; // something else (another bone) is in the way
        }
      }
    } else inst.depth = Math.max(goal, inst.depth - 10 * dt);
  }
  // what is the tip touching?
  const tip = instTip();
  raycaster.set(tip.clone().addScaledVector(inst.dir, -0.4), inst.dir); raycaster.near = 0; raycaster.far = 0.4 + clr + 0.45;
  raycaster.layers.set(2); raycaster.layers.enable(0);
  let hit = raycaster.intersectObjects(toolTargets(), false).find((h) => !(h.object === fronds && h.instanceId != null && frondData[h.instanceId]?.removed));
  raycaster.far = Infinity;
  // the sides of the tip count too (a burr cuts with its whole head)
  if (!hit && tool === 'burr') { const n = nearestSurface(tip); if (n && n.distance < clr + 0.35) hit = n; }
  if (hit) inst.contact = hit;
  const o = hit && hit.object;
  inst.contact0 = o === JB.T.mesh || o === JB.T.cart ? JB.T : o === JB.F.mesh || o === JB.F.cart ? JB.F : null;
  // the instrument only works on what you aimed at: brushing past other tissue on the way does nothing
  const kind = (o) => (!o ? null : o === fronds || o.userData.zname === '__synovium' ? 'syn' : o === JB.T.mesh || o === JB.T.cart ? 'T' : o === JB.F.mesh || o === JB.F.cart ? 'F' : o.userData.zname);
  const aimed = inst.aim && inst.aim.hit;
  const atAim = hit && aimed && kind(hit.object) === kind(aimed.object) && hit.point.distanceTo(inst.aim.point) < (tool === 'burr' ? 4 : 2.5);
  inst.atAim = !!atAim;
  // a running shaver draws nearby villi into its window
  if (active && tool === 'shaver' && frondsNear(tip, 1.8)) renderTasksThrottled();
  // a running burr is pressed towards the aimed point in any direction (not just along its axis):
  // bone between the head and the target is cut at the feed rate and the instrument follows next frame
  if (active && tool === 'burr' && atAim && inst.contact0 && inst.aim.point) {
    const toP = inst.aim.point.clone().sub(tip), dist = toP.length();
    if (dist > 0.25) carve(inst.contact0, tip.clone().addScaledVector(toP.normalize(), Math.min(BURR_FEED * dt, dist - 0.2)), BURR_CUT, dt);
  }
  if (active && atAim) {
    if (tool === 'probe') { if (now - inst.probeT > 700) { applyTool(hit, 0); inst.probeT = now; } }
    else applyTool(hit, dt, tool === 'burr' ? tip : undefined);
  }
}
function updateAimMarker() {
  const el = $('#aim');
  const a = state.mode === 'arthro' && state.tool !== 'scope' ? inst.aim : null;
  el.hidden = !a;
  if (!a) return;
  el.style.left = `${a.px.x}px`; el.style.top = `${a.px.y}px`;
  el.classList.toggle('touching', !!inst.atAim);
}
function placeInstrument() {
  const tool = state.tool;
  const vis = state.mode === 'arthro' && tool !== 'scope';
  instrument.visible = vis;
  if (!vis) return;
  const e = workEntry();
  const tip = instTip();
  const d = tip.clone().sub(e).normalize();
  const backoff = { burr: 0.6, shaver: 1.4, grasper: 1.3, probe: 1.1 }[tool];
  const end = tip.clone().addScaledVector(d, -backoff);
  const start = e.clone().addScaledVector(d, -25);
  const sh = instrument.userData.shaft;
  instrument.position.set(0, 0, 0); instrument.quaternion.identity();
  sh.position.copy(start); sh.quaternion.setFromUnitVectors(V(0, 1, 0), d); sh.scale.set(INST_R / 0.95, Math.max(0.1, start.distanceTo(end)), INST_R / 0.95);
  for (const [k, t] of Object.entries(instrument.userData.tips)) {
    t.visible = k === tool;
    if (!t.visible) continue;
    t.position.copy(tip);
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
  geo.reachStage = -1;
  applyThumb();
  if (state.mode === 'arthro' && scope.dir.lengthSq() === 0) resetScope();
  renderStageUI(); renderTasks();
}

// ---------- tools ----------
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
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
// Remove bone (osteophyte first, then subchondral bone) and cartilage inside a sphere of radius r at centre.
// Each vertex moves inward along its normal to the sphere surface, so nothing is left inside the burr head.
// the burr head is drawn (and collides) at BURR_R; when pressed against bone it cuts out to BURR_CUT, so
// space opens ahead of the head and it can follow without ever overlapping bone
const BURR_R = 0.78, BURR_CUT = 1.2, BURR_FEED = 2.5;
function carve(jb, centreW, r, dt) {
  const P = STAGE_P[state.stage];
  const c = jb.mesh.worldToLocal(centreW.clone());
  const out = { healthy: false, bone: false };
  const pos = jb.g.attributes.position.array;
  for (let i = 0; i < jb.n; i++) {
    const wx = pos[i * 3] - c.x, wy = pos[i * 3 + 1] - c.y, wz = pos[i * 3 + 2] - c.z;
    const d2 = wx * wx + wy * wy + wz * wz;
    // cartilage lying over the burr is shaved off first
    if (jb.w[i] > 0.05 && jb.thick[i] > 0.03 && d2 < (r + jb.thick[i] + 0.1) ** 2) {
      if (jb.loss[i] < 0.05 && jb.fibA[i] < 0.09) out.healthy = true;
      jb.cartLost[i] = Math.min(1, jb.cartLost[i] + dt * 4);
      jb.dirty = true;
    }
    if (d2 >= r * r) continue;
    // osteophyte is removed first (the vertex sinks back along its normal) ...
    const nx = jb.nrm[i * 3], ny = jb.nrm[i * 3 + 1], nz = jb.nrm[i * 3 + 2];
    let px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    const ost = P.osteo * jb.osteoMask[i] * jb.osteoRemain[i] + P.stt * jb.sttMask[i] * jb.osteoRemain[i];
    if (ost > 0.01) {
      const wn = wx * nx + wy * ny + wz * nz, disc = wn * wn - d2 + r * r;
      const take = Math.min(ost, Math.max(0, wn + Math.sqrt(Math.max(0, disc))));
      const amp = P.osteo * jb.osteoMask[i] + P.stt * jb.sttMask[i];
      jb.osteoRemain[i] = Math.max(0, jb.osteoRemain[i] - take / amp);
      px -= nx * take; py -= ny * take; pz -= nz * take;
      jb.dirty = true;
    }
    // ... then bone is pushed radially out of the burr head; rays from one centre never cross, so the
    // surface cannot fold over itself the way pushing along converging normals would
    const qx = px - c.x, qy = py - c.y, qz = pz - c.z, ql = Math.hypot(qx, qy, qz);
    if (ql >= r) continue;
    const k = ql > 1e-6 ? r / ql : 0;
    const tx = ql > 1e-6 ? c.x + qx * k : px - nx * r, ty = ql > 1e-6 ? c.y + qy * k : py - ny * r, tz = ql > 1e-6 ? c.z + qz * k : pz - nz * r;
    const o = i * 3;
    jb.coff[o] += tx - px; jb.coff[o + 1] += ty - py; jb.coff[o + 2] += tz - pz;
    jb.resect[i] = Math.hypot(jb.coff[o], jb.coff[o + 1], jb.coff[o + 2]);
    if (jb.resect[i] > 1.0) out.bone = true;
    jb.dirty = true;
  }
  if (jb.dirty) jb.update();
  return out;
}
function applyTool(hit, dt, center) {
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
      // carve away everything inside the burr head (a sphere at the instrument tip)
      const centre = center || hit.point.clone().addScaledVector(raycaster.ray.direction, -BURR_R * 0.6);
      const r = carve(jb, centre, BURR_CUT, dt);
      if (r.healthy) { stats.iatro.cart += dt; warn('Burring healthy cartilage'); }
      if (r.bone && jb === JB.F) { stats.iatro.mc1 += dt; warn('Resecting the MC1 base: in hemitrapeziectomy the trapezium is resected'); }
      renderTasksThrottled();
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
  const R = reachSets();
  // osteophyte excision is measured on the osteophytes reachable from the portals
  let ostTot = 0, ostLeft = 0;
  for (const [jb, list] of [[JB.T, R.osteoT], [JB.F, R.osteoF]]) for (const i of list) { ostTot += jb.osteoMask[i]; ostLeft += jb.osteoMask[i] * jb.osteoRemain[i]; }
  const ostPct = ostTot > 0 ? 1 - ostLeft / ostTot : 1;
  const hemi = geo.patchT.length ? geo.patchT.filter((i) => JB.T.resect[i] >= 2).length / geo.patchT.length : 0;
  return [
    { t: 'Enter the joint with the scope', done: scope.everInJoint, na: false },
    { t: 'Probe the cartilage of trapezium and MC1 base', done: stats.probedT && stats.probedF, na: false, prog: `${+stats.probedT + +stats.probedF}/2 surfaces` },
    { t: 'Synovectomy: remove ≥ 75% of the synovitis', done: synTot > 0 && synRem / synTot >= 0.75, na: synTot === 0, prog: synTot ? `${Math.round((100 * synRem) / synTot)}%` : '' },
    { t: 'Remove all loose bodies', done: lbTot > 0 && lbRem === lbTot, na: lbTot === 0, prog: lbTot ? `${lbRem}/${lbTot}` : '' },
    { t: 'Excise intra-articular osteophytes (≥ 50% of those reachable from the portals)', done: P.osteo > 0 && ostPct >= 0.5, na: P.osteo === 0, prog: P.osteo ? `${Math.round(ostPct * 100)}%` : '' },
    { t: 'Hemitrapeziectomy: burr ≥ 2 mm off ≥ 30% of the distal trapezial articular surface', done: s >= 3 && hemi >= 0.3, na: s < 3, prog: s >= 3 ? `${Math.min(100, Math.round((100 * hemi) / 0.3))}% of target` : '' },
  ];
}
// vertices of jb (from list) whose surface a burr can reach in a straight line from at least one portal
function reachableVerts(jb, list) {
  const pos = jb.g.attributes.position.array, nrm = jb.g.attributes.normal.array, out = [];
  for (const i of list) {
    const q = V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(jb.mesh.matrixWorld).addScaledVector(V(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]), BURR_R + 0.07);
    for (const k in geo.portals) {
      const e = geo.portals[k].entry, d = q.clone().sub(e), len = d.length();
      if (lineClear(e, d.divideScalar(len), len, TOOL_CLEAR.burr - 0.08, INST_SHAFT_CLEAR)) { out.push(i); break; }
    }
  }
  return out;
}
// computed once per stage, at the start of the stage (before any burring)
function reachSets() {
  if (geo.reachStage === state.stage && geo.reach) return geo.reach;
  for (const k in JB) JB[k].update();
  const P = STAGE_P[state.stage];
  const ost = (jb) => { const l = []; for (let i = 0; i < jb.n; i++) if (P.osteo * jb.osteoMask[i] > 0.3) l.push(i); return l; };
  geo.reach = { osteoT: P.osteo ? reachableVerts(JB.T, ost(JB.T)) : [], osteoF: P.osteo ? reachableVerts(JB.F, ost(JB.F)) : [] };
  geo.reachStage = state.stage;
  return geo.reach;
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
  if (location.hash.slice(1) !== m) history.replaceState(null, '', `#${m}`);
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  $$('[data-show]').forEach((el) => { el.hidden = !el.dataset.show.split(' ').includes(m); });
  $('#notes').innerHTML = NOTES[m === 'oa' ? 'oa' : m];
  if (!geo.portals) return;
  if (m === 'anatomy' && state.stage !== 0) applyStage(0);
  if (m !== 'oa') { state.xray = false; $('#xrayOn').checked = false; state.heat = false; $('#heatOn').checked = false; }
  if (m === 'oa' && state.stage === 0) applyStage(2);
  const small = matchMedia('(max-width: 820px), (max-height: 500px)').matches;
  if (small) {
    const collapse = m === 'arthro';
    if (collapse && !document.body.classList.contains('panel-collapsed')) toast('Tap ☰ for stage, portals and tasks');
    document.body.classList.toggle('panel-collapsed', collapse);
  }
  if (m === 'arthro') {
    if (state.stage === 0) applyStage(2);
    state.section = false; $('#sectionOn').checked = false; $('#sectionCtl').hidden = true;
    state.layers.hideT = state.layers.hideF = false;
    applyThumb(); resetScope(); resetInstrument();
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
  frame.hidden = !arth; $('#hud').hidden = !arth; $('#scopeCtl').hidden = !arth || state.swapped;
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
  scene.fog.near = FOG_OFF[0]; scene.fog.far = FOG_OFF[1];
  const xr = state.xray && state.mode === 'oa';
  scene.background = xr ? new THREE.Color(0x050608) : BG_EXT;
  renderer.setClearColor(scene.background);
  renderer.clippingPlanes = state.section && state.mode !== 'arthro' ? [clipPlane] : [];
  renderer.clear();
  renderer.render(scene, extCam);
}
// arthroscopy cameras auto-expose: dim the light source as the lens nears a surface
let exposure = { t: 0, gain: 1 };
function autoExposure() {
  const n = performance.now(); if (n - exposure.t < 100) return exposure.gain; exposure.t = n;
  raycaster.setFromCamera({ x: 0, y: 0 }, scopeCam); raycaster.layers.set(2); raycaster.layers.enable(0);
  const near = [];
  for (const [x, y] of [[0, 0], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]]) {
    raycaster.setFromCamera({ x, y }, scopeCam);
    const h = raycaster.intersectObjects(toolTargets(), false)[0];
    near.push(h ? h.distance : 12);
  }
  near.sort((a, b) => a - b);
  const d = (near[1] + near[2]) / 2;
  const target = clamp(Math.pow(d / 4, 1.7), 0.06, 1.6);
  exposure.gain = lerp(exposure.gain, target, 0.5);
  return exposure.gain;
}
function renderScope(r) {
  setVP(r);
  scopeCam.aspect = r.w / r.h; scopeCam.updateProjectionMatrix();
  lightPass(LIGHTS.scope);
  scopeLight.intensity = LIGHTS.scope.scope * autoExposure();
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
const AIM_OFFSET = 70; // px above a touching finger
function pointIn(r) { return r && pointer.x >= r.x && pointer.x <= r.x + r.w && pointer.y >= r.y && pointer.y <= r.y + r.h; }

let last = performance.now();
function frame(now) {
  if (fatal) return;
  try { frameBody(now); } catch (err) { console.error(err); showError(`Render error: ${err.message}`); return; }
  requestAnimationFrame(frame);
}
function frameBody(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 0.6); const k = sstep(0, 1, tween.t);
    extCam.position.lerpVectors(tween.p0, tween.p1, k); controls.target.lerpVectors(tween.t0, tween.t1, k); extCam.up.lerpVectors(tween.u0, tween.u1, k).normalize();
    if (tween.t >= 1) tween = null;
  }
  controls.update();
  if (state.mode === 'arthro' && geo.portals) {
    updateScope();
    updateInstrument(dt, now);
    placeInstrument();
    updateAimMarker();
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
  if (performance.now() - (scope.bumped || 0) < 800) html += '<div class="warn">Against bone</div>';
  if (scope.inBone) html += '<div class="bad">Scope tip inside bone. Withdraw.</div>';
  else if (!scope.inJoint) html += '<div class="warn">Outside the joint capsule: advance the scope</div>';
  if (state.tool !== 'scope') html += `<div>${state.tool[0].toUpperCase() + state.tool.slice(1)} via ${scope.work} · ${inst.atAim ? `working on ${hitLabel(inst.contact)}` : inst.contact ? `blocked by ${hitLabel(inst.contact)}` : pointer.down ? 'moving to target' : 'not in contact'}</div>`;
  const toolHint = state.tool === 'scope' ? 'drag: aim scope' : `${COARSE ? 'touch' : 'press'} and hold: steer the ${state.tool} to the ring`;
  html += `<div class="hint">${toolHint} · ${COARSE ? 'pinch: in–out · two fingers: aim scope' : 'right-drag: aim scope · scroll or W/S: in–out · Q/E: lens'}</div>`;
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

// ---------- exam viva ----------
const viva = { queue: [], cur: null, got: 0, n: 0 };
function vivaDeck() {
  const t = $('#vivaTopic').value;
  return VIVA.map((_, i) => i).filter((i) => !t || VIVA[i].topic === t).sort(() => Math.random() - 0.5);
}
function vivaScore() { $('#vivaScore').textContent = `${viva.got} / ${viva.n}`; }
function vivaAsk() {
  if (!viva.queue.length) viva.queue = vivaDeck();
  viva.cur = viva.queue.shift();
  const v = VIVA[viva.cur];
  $('#vivaBody').innerHTML = `<div class="lbl">${VIVA_TOPICS[v.topic]}</div><p class="viva-q">${v.q}</p>
    <p class="muted">Answer aloud, then reveal.</p>
    <div class="row"><button data-v="reveal" class="primary">Show answer</button>${v.show ? '<button data-v="show">Show me</button>' : ''}</div>`;
  $('#vivaNext').textContent = 'Skip';
}
function vivaReveal() {
  const v = VIVA[viva.cur];
  $('#vivaBody').innerHTML = `<div class="lbl">${VIVA_TOPICS[v.topic]}</div><p class="viva-q">${v.q}</p>
    <div class="viva-a">${v.a}</div>
    <div class="row">${v.show ? '<button data-v="show">Show me</button>' : ''}<span style="flex:1"></span>
    <button data-v="got" class="ok">Got it</button><button data-v="missed">Missed it</button></div>`;
  $('#vivaNext').textContent = 'Next question';
}
function vivaShow() {
  const sh = VIVA[viva.cur].show;
  if (!sh || !geo.portals) return;
  if (sh.mode && sh.mode !== state.mode) setMode(sh.mode);
  if (sh.stage != null && sh.stage !== state.stage) { applyStage(sh.stage); [JB.T, JB.F, JB.S].forEach((j) => { j.dirty = true; }); }
  if (sh.layers) {
    for (const [k, on] of Object.entries(sh.layers)) { state.layers[k] = on; const cb = $(`#layerChecks [data-layer="${k}"]`); if (cb) cb.checked = on; }
    applyVisibility();
  }
  if (sh.heat != null && state.mode === 'oa') { state.heat = sh.heat; $('#heatOn').checked = sh.heat; [JB.T, JB.F, JB.S].forEach((j) => { j.dirty = true; }); }
  if (sh.view && state.mode !== 'arthro') setView(sh.view);
  if (matchMedia('(max-width: 820px), (max-height: 500px)').matches) { document.body.classList.add('panel-collapsed'); setTimeout(resize, 0); toast('Tap ☰ to return to the question'); }
}
function vivaMark(ok) {
  viva.n++; if (ok) viva.got++; else viva.queue.splice(Math.min(3, viva.queue.length), 0, viva.cur); // missed: ask again soon
  vivaScore(); vivaAsk();
}

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
  $('#vivaTopic').insertAdjacentHTML('beforeend', Object.entries(VIVA_TOPICS).map(([k, t]) => `<option value="${k}">${t} (${VIVA.filter((v) => v.topic === k).length})</option>`).join(''));
  $('#vivaTopic').onchange = () => { viva.queue = []; viva.got = viva.n = 0; vivaScore(); vivaAsk(); };
  $('#vivaNext').onclick = vivaAsk;
  $('#vivaBody').addEventListener('click', (e) => {
    const a = e.target.closest('[data-v]')?.dataset.v;
    if (a === 'reveal') vivaReveal(); else if (a === 'show') vivaShow(); else if (a === 'got' || a === 'missed') vivaMark(a === 'got');
  });
  $('#scopePortal').onchange = (e) => { scope.portal = e.target.value; if (scope.work === scope.portal) { scope.work = Object.keys(geo.portals).find((k) => k !== scope.portal); $('#workPortal').value = scope.work; } resetScope(); resetInstrument(); };
  $('#workPortal').onchange = (e) => { scope.work = e.target.value; if (scope.work === scope.portal) toast('Use a different portal for the instrument'); resetInstrument(); };
  $('#tractionOn').onchange = (e) => { state.traction = e.target.checked; applyThumb(); if (!state.traction) toast('Without traction the joint space is too tight to work in'); };
  $('#toolSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  $('#depth').oninput = (e) => { setDepth(+e.target.value); };
  $('#roll').oninput = (e) => { scope.roll = +e.target.value; syncScopeUI(); };
  $('#resetScope').onclick = resetScope;
  $('#swapViews').onclick = () => { state.swapped = !state.swapped; resize(); };
  $('#resetJoint').onclick = () => { applyStage(state.stage); toast('Joint restored'); };
  $('#aboutBtn').onclick = () => { $('#diag').textContent = `Graphics: ${gpuInfo()}${USE_ENV ? '' : ' · basic lighting'}`; $('#about').showModal(); };
  $('#panelToggle').onclick = () => { document.body.classList.toggle('panel-collapsed'); setTimeout(resize, 0); };

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'Escape') { closeQuiz(); $('#info').hidden = true; }
    if (state.mode === 'arthro') {
      const tools = ['scope', 'probe', 'shaver', 'burr', 'grasper'];
      if (e.key >= '1' && e.key <= '5') setTool(tools[+e.key - 1]);
      if (e.key === 'q' || e.key === 'Q') rollLens(-10);
      if (e.key === 'e' || e.key === 'E') rollLens(10);
      if (e.key === 'w' || e.key === 'ArrowUp') { e.preventDefault(); setDepth(scope.depth + 0.5); }
      if (e.key === 's' || e.key === 'ArrowDown') { e.preventDefault(); setDepth(scope.depth - 0.5); }
    }
  });

  // Pointer input. In the scope view: one finger / left button uses the selected tool (the Scope tool aims);
  // right button always aims; two fingers pinch to advance/withdraw and drag to aim.
  const touches = new Map();
  let gesture = null;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const twoFinger = () => { const [p, q] = [...touches.values()]; return { dist: Math.hypot(p.x - q.x, p.y - q.y), mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; };
  canvas.addEventListener('contextmenu', (e) => { if (state.mode === 'arthro') e.preventDefault(); });
  canvas.addEventListener('pointerdown', (e) => {
    const p = local(e);
    touches.set(e.pointerId, p);
    const inScope = state.mode === 'arthro' && pointIn(rect.scope);
    if (inScope) { try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic event */ } }
    if (touches.size === 2 && state.mode === 'arthro') {
      // second finger: switch from tool use to pinch/aim
      gesture = twoFinger(); pointer.down = false; pointer.inScope = false;
      return;
    }
    if (touches.size > 2) return;
    pointer.x = p.x; pointer.y = p.y; pointer.lastX = p.x; pointer.lastY = p.y;
    pointer.down = true; pointer.moved = 0; pointer.button = e.button;
    pointer.inScope = inScope;
    pointer.aim = state.tool === 'scope' || e.button === 2;
    pointer.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!pointer.down && !gesture) pointer.touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (touches.has(e.pointerId)) touches.set(e.pointerId, p);
    if (gesture && touches.size >= 2) {
      const g = twoFinger();
      setDepth(scope.depth + (g.dist - gesture.dist) * 0.035);
      pivotScope(g.mx - gesture.mx, g.my - gesture.my);
      gesture = g;
      return;
    }
    if (gesture) return;
    pointer.x = p.x; pointer.y = p.y;
    const dx = pointer.x - pointer.lastX, dy = pointer.y - pointer.lastY; pointer.lastX = pointer.x; pointer.lastY = pointer.y;
    if (pointer.down) pointer.moved += Math.abs(dx) + Math.abs(dy);
    if (pointer.down && pointer.inScope && pointer.aim) pivotScope(dx, dy);
  });
  const up = (e) => {
    touches.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* not captured */ }
    if (gesture) { if (touches.size < 2) gesture = null; if (touches.size === 0) pointer.down = false; return; }
    if (!pointer.down) return;
    pointer.down = false;
    if (pointer.moved < 5 && state.mode !== 'arthro' && pointIn(rect.ext)) { if ($('#quiz').hidden) pick(); }
    pointer.inScope = false; renderTasks();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (state.mode === 'arthro' && pointIn(rect.scope)) {
      e.preventDefault(); e.stopImmediatePropagation();
      setDepth(scope.depth - Math.sign(e.deltaY) * 0.4);
    }
  }, { passive: false, capture: true });

  // on-screen scope controls (touch friendly): hold +/- or the lens buttons to repeat
  const ctl = $('#scopeCtl');
  ctl.addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  const acts = { in: () => setDepth(scope.depth + 0.3), out: () => setDepth(scope.depth - 0.3), rotL: () => rollLens(-6), rotR: () => rollLens(6), centre: resetScope };
  let rep = null;
  const stopRep = () => { clearTimeout(rep); clearInterval(rep); rep = null; };
  ctl.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); stopRep();
      const f = acts[b.dataset.act]; f();
      if (b.dataset.act !== 'centre') rep = setTimeout(() => { rep = setInterval(f, 60); }, 300);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stopRep);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  new ResizeObserver(resize).observe(viewportEl);
}
function pivotScope(dx, dy) {
  const f = scopeFrame();
  const k = 0.0035;
  // split big drags into small steps so the scope slides along bone instead of jumping through it
  const steps = Math.max(1, Math.ceil((Math.abs(dx) + Math.abs(dy)) * k / 0.02));
  for (let i = 0; i < steps; i++) {
    let moved = false;
    for (const [ax, ay] of [[dx, dy], [dx, 0], [0, dy]]) {
      if (!ax && !ay) continue;
      const q1 = new THREE.Quaternion().setFromAxisAngle(f.up, (-ax * k) / steps);
      const q2 = new THREE.Quaternion().setFromAxisAngle(f.right, (-ay * k) / steps);
      const nd = scope.dir.clone().applyQuaternion(q1).applyQuaternion(q2).normalize();
      if (nd.angleTo(scope.home) >= THREE.MathUtils.degToRad(55)) continue;
      if (!lineFree(nd, scope.depth) || crossesSurface(tipAt(scope.dir, scope.depth), tipAt(nd, scope.depth))) continue;
      scope.dir.copy(nd); moved = true; break;
    }
    if (!moved) { bump(); break; }
  }
}
function setTool(t) {
  state.tool = t;
  $$('[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  canvas.style.cursor = t === 'scope' ? 'grab' : 'crosshair';
  applyVisibility();
  if (t !== 'scope' && state.swapped) { state.swapped = false; resize(); }
  if (t !== 'scope' && geo.portals) { if (inst.dir.lengthSq() === 0) resetInstrument(); else ensureInstFree(); }
}

// handle for debugging and automated checks in the browser console
window.__cmcj = {
  state, scope, JB, geo: () => geo, applyStage, setTool, taskList, stats, setView, inst, instTip, pointer, rect: () => rect, lineClear, workEntry, aimRay, updateInstrument, ensureScopeFree, scopeCam, frondData, fronds,
  frondScreen(k) { const m = new THREE.Matrix4(); fronds.getMatrixAt(k, m); const v = new THREE.Vector3().setFromMatrixPosition(m); const q = new THREE.Quaternion(), sc = new THREE.Vector3(); m.decompose(new THREE.Vector3(), q, sc); v.add(new THREE.Vector3(0, sc.y * 0.6, 0).applyQuaternion(q)); const p = v.clone().project(scopeCam); const r = rect.scope; return p.z < 1 && Math.hypot(p.x, p.y) < 0.95 ? { x: r.x + (p.x + 1) / 2 * r.w, y: r.y + (1 - p.y) / 2 * r.h } : null; },
  updateScope, patchT: () => geo.patchT, reachSets, reachableVerts, autoExposure, exposure: () => exposure, portals: () => geo.portals,
  nearestDist(p) { const n = nearestSurface(p); return n ? n.distance : 9; },
  diag(p) { const n = nearestSurface(p); const bones = geo.collide.filter((m) => m.userData.zname !== '__cartilage'); const saved = geo.collide; geo.collide = bones; const bc = boneClearance(p); geo.collide = saved; let th = null; if (n && n.object.userData.zname === '__cartilage') { const jb = n.object.userData.jb; const nv = nearestVertex(n.object, p); th = jb.thick[jb.cartSrc[nv.i]]; } return { near: n && n.object.userData.zname, boneClr: bc, cartThick: th }; },
  insideTruth(p) { const bones = geo.collide.filter((m) => m.userData.zname !== '__cartilage'); let votes = 0; for (const d of [V(0.3, 1, 0.2), V(-0.7, -0.2, 0.6), V(0.1, -0.5, -1)]) { const r = new THREE.Raycaster(p, d.normalize()); const n = r.intersectObjects(bones, false).length; votes += n % 2; } return votes >= 2; }, setDepth, pivotScope, resetScope, boneClearance, tip: () => scopeFrame().tip, inCap: () => insideCapsule(scopeFrame().tip),
  apply(nx, ny, secs) { raycaster.setFromCamera({ x: nx, y: ny }, scopeCam); raycaster.layers.set(2); raycaster.layers.enable(0); for (let t = 0; t < secs; t += 0.05) { const h = raycaster.intersectObjects(toolTargets(), false)[0]; if (h) applyTool(h, 0.05); for (const k in JB) JB[k].update(); } },
  probe(nx, ny) { raycaster.setFromCamera({ x: nx, y: ny }, scopeCam); raycaster.layers.set(2); raycaster.layers.enable(0); const h = raycaster.intersectObjects(toolTargets(), false)[0]; return h ? `${hitLabel(h)}:${h.object.userData.zname.slice(0,6)} @ ${h.distance.toFixed(1)}` : "none"; },
};

// ---------- boot ----------
bindUI();
const startMode = ['anatomy', 'oa', 'arthro'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'anatomy';
setMode(startMode);
load().then(() => { setMode(startMode); resize(); requestAnimationFrame(frame); }).catch((err) => {
  console.error(err);
  showError(`Could not load the model: ${err.message}`);
});
