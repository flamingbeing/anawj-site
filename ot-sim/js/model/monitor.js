// What the monitor reports (DESIGN.md, "Monitor and alarms"; MODEL.md section 9): the model's values turned into
// displayed numbers, in simulated time so the display behaves the same at every speed. M0.2: averaging and the NIBP
// cycle. Sensor delays come with gas.js (M2.4); limits and alarms with M3.3.
//
// Like every subsystem it reads the previous step (Jacobi), so it sees a beat or breath one step (0.1 s) after the
// model has it: the same lag as a real monitor's beat detector, and far below its averaging.

const HR_BEATS = 4;     // HR: mean of the last 4 beat-to-beat intervals [D]
const RR_BREATHS = 4;   // respiratory rate: mean of the last 4 breaths [D]
const SPO2_TAU = 4;     // s: exponential average, about an 8 s window [D] (monitors average over 8-10 s)
const TEMP_TAU = 10;    // s [D]
export const NIBP_TAKES = 30;  // s from cuff start to a reading [D] (about 30 s on real monitors)
export const NIBP_CYCLES = [0, 1, 2, 2.5, 3, 5, 10, 15]; // minutes, 0 = manual

const push = (arr, x, n) => { const a = arr.concat([x]); return a.length > n ? a.slice(a.length - n) : a; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

export const monitor = {
  name: 'mon',
  init(state) {
    const v = state.vit;
    return {
      hr: v.hr, spo2: v.spo2, etco2: v.etco2, rr: v.rr, temp: v.temp,
      rrs: [], cycles: [], seenBeat: v.nextBeat, seenBreath: v.nextBreath,
      // NIBP: cycle in minutes (0 = manual); start = when the running measurement began (null when idle)
      nibp: { cycle: 5, start: null, next: 0, last: null },
    };
  },
  step(prev, ctx) {
    const v = prev.vit, m = prev.mon, dt = ctx.dt, t = ctx.t;
    const out = { ...m };
    // a beat or breath happened when the model's next event time moved on
    if (v.nextBeat !== m.seenBeat) {
      out.rrs = push(m.rrs, v.nextBeat - m.seenBeat, HR_BEATS);
      out.hr = 60 / mean(out.rrs);
      out.seenBeat = v.nextBeat;
    }
    if (v.nextBreath !== m.seenBreath) {
      out.cycles = push(m.cycles, v.nextBreath - m.seenBreath, RR_BREATHS);
      out.rr = 60 / mean(out.cycles);
      out.etco2 = v.etco2; // end-tidal: the value at the end of the breath just finished
      out.seenBreath = v.nextBreath;
    }
    out.spo2 = m.spo2 + (v.spo2 - m.spo2) * (dt / SPO2_TAU);
    out.temp = m.temp + (v.temp - m.temp) * (dt / TEMP_TAU);

    // NIBP: actions first, then the cycle, then a running measurement finishing
    let n = m.nibp;
    for (const a of ctx.actions) {
      if (a.type !== 'nibp') continue;
      // a manual start restarts the cycle timer, as on most monitors [D]
      if (a.do === 'start' && n.start == null) n = { ...n, start: t, next: n.cycle ? t + n.cycle * 60 : 0 };
      else if (a.do === 'stop') n = { ...n, start: null };
      if (a.cycle != null && NIBP_CYCLES.includes(a.cycle)) n = { ...n, cycle: a.cycle, next: a.cycle ? t + a.cycle * 60 : 0 };
    }
    if (n.cycle && n.start == null && t >= n.next) n = { ...n, start: t, next: t + n.cycle * 60 };
    if (n.start != null && t - n.start >= NIBP_TAKES) {
      n = { ...n, start: null, last: { sys: v.sbp, dia: v.dbp, map: v.map, t } };
      ctx.log({ kind: 'nibp', sys: Math.round(v.sbp), dia: Math.round(v.dbp), map: Math.round(v.map) });
    }
    if (n !== m.nibp) out.nibp = n;
    return out;
  },
  rebase(m, off) {
    const n = m.nibp;
    return {
      ...m, seenBeat: m.seenBeat - off, seenBreath: m.seenBreath - off,
      nibp: { ...n, start: n.start == null ? null : n.start - off, next: Math.max(0, n.next - off), last: n.last && { ...n.last, t: n.last.t - off } },
    };
  },
};
