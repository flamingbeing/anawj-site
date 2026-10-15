// What the monitor reports (DESIGN.md, "Monitor and alarms"; MODEL.md section 9): the model's values turned into
// displayed numbers, in simulated time so the display behaves the same at every speed. M0.2: averaging and the NIBP
// cycle; M1.3: the TOF module. Sensor delays come with gas.js (M2.4); limits and alarms with M3.3.
//
// Like every subsystem it reads the previous step (Jacobi), so it sees a beat or breath one step (0.1 s) after the
// model has it: the same lag as a real monitor's beat detector, and far below its averaging.

const HR_BEATS = 4;     // HR: mean of the last 4 beat-to-beat intervals [D]
const RR_BREATHS = 4;   // respiratory rate: mean of the last 4 breaths [D]
const SPO2_TAU = 4;     // s: exponential average, about an 8 s window [D] (monitors average over 8-10 s)
const SAT_HIST = 91;    // s of arterial saturation kept for the finger probe's delay
const PROBE_DELAY = 25; // s finger transport delay at the resting cardiac output, longer when output falls (MODEL.md 8) [S/D]
const NO_BREATH = 30;   // s without a breath before the rate and EtCO2 show nothing [D]
const TEMP_TAU = 10;    // s [D]
export const NIBP_TAKES = 30;  // s from cuff start to a reading [D] (about 30 s on real monitors)
export const NIBP_CYCLES = [0, 1, 2, 2.5, 3, 5, 10, 15]; // minutes, 0 = manual
export const TOF_EVERY = 15;   // s between automatic trains of four [D] (monitors offer 15 s to 15 min)
const PTC_LOCK = 120;          // s: a post-tetanic count potentiates the twitches, so wait before the next [D]

const push = (arr, x, n) => { const a = arr.concat([x]); return a.length > n ? a.slice(a.length - n) : a; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

export const monitor = {
  name: 'mon',
  init(state) {
    const v = state.vit;
    return {
      hr: state.cv ? state.cv.hr : 72, spo2: state.gas ? state.gas.sao2 : 98, etco2: state.gas ? state.gas.etco2 : 38,
      rr: state.resp ? state.resp.rr : 14, temp: v.temp,
      rrs: [], cycles: [], seenBeat: state.rh ? state.rh.next : 0, seenBreath: state.resp ? state.resp.breathT : 0,
      // SpO2 history, one sample a second, for the oximeter's transport delay
      sat: new Array(SAT_HIST).fill(state.gas ? state.gas.sao2 : 98), satT: 0,
      // NIBP: cycle in minutes (0 = manual); start = when the running measurement began (null when idle)
      nibp: { cycle: 5, start: null, next: 0, last: null },
      // TOF at the adductor pollicis: count, ratio (count 4 only), when; a PTC on request when the count is 0
      tof: { count: 4, ratio: 1, t: 0, next: 0, ptc: null, ptcT: null },
    };
  },
  step(prev, ctx) {
    const v = prev.vit, m = prev.mon, dt = ctx.dt, t = ctx.t;
    const out = { ...m };
    // a beat or breath happened when the model's next event time moved on
    const rh = prev.rh;
    if (rh && rh.next !== m.seenBeat) {
      out.rrs = push(m.rrs, rh.next - m.seenBeat, HR_BEATS);
      out.hr = 60 / mean(out.rrs);
      out.seenBeat = rh.next;
    }
    const rs = prev.resp, g = prev.gas;
    if (rs && rs.breathT !== m.seenBreath) {
      out.cycles = push(m.cycles, rs.breathT - m.seenBreath, RR_BREATHS);
      out.rr = 60 / mean(out.cycles);
      out.etco2 = g.etco2; // end-tidal: the value at the end of the breath just finished
      out.seenBreath = rs.breathT;
    }
    if (rs && t - rs.breathT > NO_BREATH) { out.rr = 0; out.etco2 = 0; out.cycles = []; }
    // SpO2: arterial saturation delayed by the transport to the finger (longer with low output), then averaged
    let sat = m.sat, satT = m.satT;
    if (g && t - satT >= 1) { sat = sat.slice(1); sat.push(g.sao2); satT = t; }
    const delay = Math.min(SAT_HIST - 1, Math.round(PROBE_DELAY * Math.min(3, 5.4 / Math.max(0.5, prev.cv ? prev.cv.co : 5.4))));
    const seen = sat[SAT_HIST - 1 - delay];
    out.sat = sat; out.satT = satT;
    out.spo2 = m.spo2 + (seen - m.spo2) * (dt / SPO2_TAU);
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
      const cv = prev.cv;
      n = { ...n, start: null, last: { sys: cv.sbp, dia: cv.dbp, map: cv.map, t } };
      ctx.log({ kind: 'nibp', sys: Math.round(cv.sbp), dia: Math.round(cv.dbp), map: Math.round(cv.map) });
    }
    if (n !== m.nibp) out.nibp = n;

    // TOF every 15 s, or now on request; PTC on request (meaningful only with no TOF response)
    const nb = prev.pd ? prev.pd.nmb : null;
    if (nb) {
      let tof = m.tof;
      const now = ctx.actions.some(a => a.type === 'tof' && a.do === 'now'), ptcAsk = ctx.actions.some(a => a.type === 'tof' && a.do === 'ptc');
      if (now || t >= tof.next) tof = { ...tof, count: nb.tofCount, ratio: nb.tofr, t, next: t + TOF_EVERY };
      if (ptcAsk && (tof.ptcT == null || t - tof.ptcT >= PTC_LOCK)) {
        tof = { ...tof, ptc: nb.tofCount === 0 ? nb.ptc : null, ptcT: t };
        ctx.log({ kind: 'ptc', ptc: nb.tofCount === 0 ? nb.ptc : null });
      }
      if (tof !== m.tof) out.tof = tof;
    }
    return out;
  },
  rebase(m, off) {
    const n = m.nibp;
    return {
      ...m, seenBeat: m.seenBeat - off, seenBreath: m.seenBreath - off, satT: m.satT - off,
      nibp: { ...n, start: n.start == null ? null : n.start - off, next: Math.max(0, n.next - off), last: n.last && { ...n.last, t: n.last.t - off } },
      tof: { ...m.tof, t: m.tof.t - off, next: Math.max(0, m.tof.next - off), ptcT: m.tof.ptcT == null ? null : m.tof.ptcT - off },
    };
  },
};
