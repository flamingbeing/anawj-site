// Boot (DESIGN.md, "Files" and "URL and deep links"): reads the URL, builds the sim and the theatre screen, runs the
// frame loop. The UI reads sim.state and writes only through sim.act().

import { createSim } from './model/sim.js';
import { NIBP_CYCLES } from './model/monitor.js';
import { Loop, SPEEDS } from './ui/loop.js';
import { Lane } from './ui/lanes.js';
import { ecg, pleth, co2, modelSource, FastSource } from './ui/synth.js';
import { Numerics } from './ui/numerics.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TEST = params.has('test');
const seedParam = parseInt(params.get('seed'), 10);
const SEED = Number.isFinite(seedParam) && seedParam >= 0 ? seedParam : 1; // fixed by default so first frames repeat
const DELAY = 0.2; // s: at 1x the lanes draw this far behind model time, so each event is known before the sweep

// per-device settings (DESIGN.md, "Per-device settings"); storage may be blocked
const store = {
  get(k, d) { try { const v = localStorage.getItem('otsim.' + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('otsim.' + k, String(v)); } catch { /* private mode */ } },
};

const sim = createSim({ seed: SEED });
const lanes = [
  new Lane($('c-ecg'), { window: 6, sample: ecg, lo: -0.5, hi: 1.3, color: '#4be36a' }),
  new Lane($('c-pleth'), { window: 6, sample: pleth, lo: -0.05, hi: 1.2, color: '#3fd6ff' }),
  new Lane($('c-co2'), { window: 15, sample: co2, lo: 0, hi: 50, color: '#ffd23f' }),
];
const nums = new Numerics();

// the display clock: at 1x the model's time (smoothed within a step) minus DELAY; at 5x and 20x real pace from the
// moment of the switch, with a FastSource making the beats and breaths
let fast = null, tDisp = -DELAY;
const modelT = frac => sim.state.t + frac * sim.state.dt - DELAY;
const source = () => (fast || modelSource(sim.state));
function refill() { const src = source(); for (const l of lanes) l.refill(src, tDisp); }

function frame({ frac, wallDt }) {
  if (fast) { tDisp += wallDt; fast.advance(sim.state, tDisp); } else tDisp = Math.max(tDisp, modelT(frac));
  const src = source();
  for (const l of lanes) l.draw(src, tDisp);
  nums.update(sim.state, performance.now());
}
const loop = new Loop(sim, frame);

// speed and pause
function setSpeed(s, save = true) {
  if (!SPEEDS.includes(s)) s = 1;
  const wasFast = loop.speed > 1;
  loop.speed = s;
  for (const b of document.querySelectorAll('[data-speed]')) b.setAttribute('aria-pressed', String(+b.dataset.speed === s));
  const note = $('fastnote');
  note.hidden = s === 1;
  note.textContent = `${s}x: waveforms at real pace`;
  if (s > 1) fast = new FastSource(sim.state, tDisp, SEED + s);
  else if (wasFast) { fast = null; tDisp = modelT(loop.acc); }
  if (save) store.set('speed', s);
  refill();
}
function setPaused(p) {
  loop.paused = p;
  const b = $('pause');
  b.setAttribute('aria-label', p ? 'Resume' : 'Pause');
  b.firstElementChild.textContent = p ? '▶' : '❚❚';
  refill();
}
for (const b of document.querySelectorAll('[data-speed]')) b.addEventListener('click', () => setSpeed(+b.dataset.speed));
$('pause').addEventListener('click', () => setPaused(!loop.paused));

// NIBP
const cyc = $('nibp-cycle');
cyc.innerHTML = NIBP_CYCLES.map(c => `<option value="${c}">${c ? c + ' min' : 'Manual'}</option>`).join('');
cyc.value = String(sim.state.mon.nibp.cycle);
cyc.addEventListener('change', () => { sim.act({ type: 'nibp', cycle: +cyc.value }); });
$('nibp-go').addEventListener('click', () => {
  sim.act({ type: 'nibp', do: sim.state.mon.nibp.start != null ? 'stop' : 'start' });
  if (loop.paused) sim.step(1);
  nums.update(sim.state, performance.now(), true);
});

// screens by hash
function route() {
  const id = location.hash.slice(1);
  const screen = id === 'theatre' ? 'theatre' : 'library';
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== screen;
  if (screen === 'theatre') { loop.start(); requestAnimationFrame(() => { refill(); nums.update(sim.state, performance.now(), true); }); }
  else loop.stop();
}
addEventListener('hashchange', route);
// refill a lane only when its canvas really changed size (numbers changing must not wipe the sweep)
new ResizeObserver(() => {
  if ($('theatre').hidden) return;
  const src = source();
  for (const l of lanes) if (l.fit()) l.refill(src, tDisp);
}).observe($('monitor'));

setSpeed(+store.get('speed', 1), false);
route();

// tests drive the model directly instead of waiting in real time (DESIGN.md, "URL and deep links")
if (TEST) {
  window.otsim = {
    sim,
    get state() { return sim.state; },
    step(n = 1) { sim.step(n); if (!fast) tDisp = modelT(loop.acc); refill(); nums.update(sim.state, performance.now(), true); return sim.state.t; },
    pause(p = true) { setPaused(p); },
    speed: s => setSpeed(s),
    lanes,
    get tDisp() { return tDisp; },
  };
}
