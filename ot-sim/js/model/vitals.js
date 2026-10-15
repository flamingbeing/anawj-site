// Placeholder (DESIGN.md M0.1): core temperature with small seeded noise. Heart rate and blood pressure moved to
// rhythm.js and cardio.js (M2.1), breathing, SpO2 and CO2 to resp.js and gas.js (M2.4); temperature goes to temp.js
// (M2.6).

export const BASE = { temp: 36.8 };
const NOISE = { temp: [0.02, 120] }; // standard deviation and time constant (s) [D]

export const vitals = {
  name: 'vit',
  init() { return { ...BASE, n: { temp: 0 } }; },
  step(prev, ctx) {
    const v = prev.vit, dt = ctx.dt, n = { ...v.n }, out = { ...v, n };
    for (const k in NOISE) {
      const [sd, tau] = NOISE[k];
      n[k] = n[k] * (1 - dt / tau) + sd * Math.sqrt((2 * dt) / tau) * ctx.normal('vitals');
      out[k] = BASE[k] + n[k];
    }
    return out;
  },
  trend(v) { return { temp: v.temp }; },
};
