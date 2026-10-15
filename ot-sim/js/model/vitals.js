// Placeholder patient (DESIGN.md M0.1): steady awake values with small seeded noise, plus breath events at exact
// times. Replaced piece by piece: heart rate and blood pressure by rhythm.js and cardio.js (M2.1, done); breathing,
// SpO2 and CO2 by gas.js and resp.js (M2.4); temperature by temp.js (M2.6).

// default awake values for the default patient (MODEL.md section 1) [D]
export const BASE = { spo2: 98, rr: 14, etco2: 38, temp: 36.8 };
// noise: Ornstein-Uhlenbeck, standard deviation and time constant (s) per value [D]
const NOISE = { spo2: [0.3, 15], rr: [0.5, 30], etco2: [0.7, 30], temp: [0.02, 120] };

export const vitals = {
  name: 'vit',
  init(state) {
    const n = {};
    for (const k in NOISE) n[k] = 0;
    return { ...BASE, n, nextBreath: 60 / BASE.rr };
  },
  step(prev, ctx) {
    const v = prev.vit, dt = ctx.dt, n = { ...v.n }, out = { ...v, n };
    for (const k in NOISE) {
      const [sd, tau] = NOISE[k];
      n[k] = n[k] * (1 - dt / tau) + sd * Math.sqrt((2 * dt) / tau) * ctx.normal('vitals');
      out[k] = BASE[k] + n[k];
    }
    out.spo2 = Math.min(100, out.spo2);
    // breaths whose exact time falls inside this step (t - dt, t]
    while (out.nextBreath <= ctx.t) {
      const cycle = 60 / out.rr;
      ctx.emit({ kind: 'breath', t: out.nextBreath, cycle, ti: cycle / 3, etco2: out.etco2 });
      out.nextBreath += cycle;
    }
    return out;
  },
  rebase(v, offset) { return { ...v, nextBreath: v.nextBreath - offset }; },
  trend(v) { return { spo2: v.spo2, etco2: v.etco2, rr: v.rr, temp: v.temp }; },
};
