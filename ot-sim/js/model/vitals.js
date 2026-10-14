// Placeholder patient (DESIGN.md M0.1): steady awake vitals with small seeded noise, plus beat and breath events at
// exact times, so the loop, the event ring and the monitor can be built and tested before the real subsystems exist.
// Replaced piece by piece: rhythm.js and cardio.js (M2.1), gas.js and resp.js (M2.4), temp.js (M2.6).

// default awake values for the default patient (MODEL.md section 1) [D]
export const BASE = { hr: 72, sbp: 120, dbp: 75, spo2: 98, rr: 14, etco2: 38, temp: 36.8 };
// noise: Ornstein-Uhlenbeck, standard deviation and time constant (s) per value [D]
const NOISE = { hr: [1, 20], sbp: [2, 30], dbp: [1.5, 30], spo2: [0.3, 15], rr: [0.5, 30], etco2: [0.7, 30], temp: [0.02, 120] };

export const vitals = {
  name: 'vit',
  init(state) {
    const n = {};
    for (const k in NOISE) n[k] = 0;
    return { ...BASE, map: (BASE.sbp + 2 * BASE.dbp) / 3, n, nextBeat: 60 / BASE.hr, nextBreath: 60 / BASE.rr };
  },
  step(prev, ctx) {
    const v = prev.vit, dt = ctx.dt, n = { ...v.n }, out = { ...v, n };
    for (const k in NOISE) {
      const [sd, tau] = NOISE[k];
      n[k] = n[k] * (1 - dt / tau) + sd * Math.sqrt((2 * dt) / tau) * ctx.normal('vitals');
      out[k] = BASE[k] + n[k];
    }
    out.spo2 = Math.min(100, out.spo2);
    out.map = (out.sbp + 2 * out.dbp) / 3;
    // events whose exact time falls inside this step (t - dt, t]
    while (out.nextBeat <= ctx.t) {
      const rr = 60 / out.hr;
      ctx.emit({ kind: 'beat', t: out.nextBeat, rr, sbp: out.sbp, dbp: out.dbp });
      out.nextBeat += rr;
    }
    while (out.nextBreath <= ctx.t) {
      const cycle = 60 / out.rr;
      ctx.emit({ kind: 'breath', t: out.nextBreath, cycle, ti: cycle / 3, etco2: out.etco2 });
      out.nextBreath += cycle;
    }
    return out;
  },
  rebase(v, offset) { return { ...v, nextBeat: v.nextBeat - offset, nextBreath: v.nextBreath - offset }; },
  trend(v) { return { hr: v.hr, sbp: v.sbp, dbp: v.dbp, map: v.map, spo2: v.spo2, etco2: v.etco2, rr: v.rr, temp: v.temp }; },
};
