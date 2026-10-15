// Drug effects (MODEL.md section 4 and the TOF readout in section 2). M1.3: neuromuscular block. M1.4 adds hypnosis,
// the stimulus response, the BIS-like index and the autonomic drive.
//
// TOF readout [V for the anchors, D for the fit]: T1 = 1/(1 + (Ce/Ce50)^γ); each later twitch is more sensitive and
// steeper (Tn uses Ce50 x fn and γ x hn), fitted to two anchors: T4 disappears at T1 about 25% (Lee 1975) and TOFR 0.9
// comes at T1 about 86% (acceleromyography, Kopman 2002), which gives f4 0.75 and h4 1.51; T2 and T3 lie between.
// (One slope with f4 0.59 puts TOFR 0.9 at T1 99%, as on mechanomyography, and made recovery to TOFR 0.9 far too slow.)
// A twitch counts above 4% of control; TOFR = T4/T1, at most 1.
// Suxamethonium (phase I) has no fade; phase II (3-5 mg/kg total) fades like a non-depolarising block. Rocuronium and
// suxamethonium combine as independent blocks (their twitch fractions multiply) [D].

import { ROC, SITES, SUX, NEO } from './nmb.js';
import { pow } from './fmath.js';

export const FADE = [{ f: 1, h: 1 }, { f: 0.917, h: 1.17 }, { f: 0.835, h: 1.34 }, { f: 0.752, h: 1.51 }];
export const COUNTS = 0.04;
// post-tetanic count [D]: post-tetanic twitch n responds as if Ce50 were higher by g_n, from PTC_G for the first to
// 1 (a TOF twitch) for the 11th; PTC_G tuned so the first post-tetanic response comes about 16 min before the first TOF
// response after rocuronium 1 mg/kg (Baykara 2002 [V])
export const PTC_G = 2.7;

const frac = (ce, c50, h) => (ce > 0 ? 1 / (1 + pow(ce / c50, h)) : 1);

// the readout from pk.nm. opts: { sevo: true } multiplies rocuronium's Ce50 by 0.605 (Kleijn) once volatiles exist
export function readNmb(nm, weightKg, opts = {}) {
  if (!nm) return { t1: 1, tofCount: 4, tofr: 1, ptc: 15, diaphragm: 1, upperAirway: 1, larynx: 1, neoFactor: 1, phase2: 0 };
  const neoCe = nm.neo.ce, neoFactor = 1 + ((NEO.max - 1) * neoCe) / (neoCe + NEO.ec50);
  const c50 = ROC.ce50 * neoFactor * (opts.sevo ? 0.605 : 1);
  const perKg = nm.sux.total / weightKg, phase2 = perKg <= 3 ? 0 : perKg >= 5 ? 1 : (perKg - 3) / 2;
  const tw = (site, { f, h }) => {
    // suxamethonium fades only in phase II
    const sf = 1 - phase2 * (1 - f), sh = 1 + phase2 * (h - 1);
    return frac(nm.roc.ce[site], c50 * SITES[site].ce50 * f, ROC.hill * h) * frac(nm.sux.ce, SUX.ce50 * SITES[site].ce50 * sf, SUX.hill * sh);
  };
  const T = FADE.map(x => tw('thumb', x));
  for (let i = 1; i < 4; i++) if (T[i] > T[i - 1]) T[i] = T[i - 1]; // a later twitch is never stronger
  let tofCount = 0;
  for (const x of T) if (x > COUNTS) tofCount++;
  let ptc = 0;
  for (let n = 1; n <= 15; n++) {
    const g = n > 11 ? 1 : PTC_G - ((PTC_G - 1) * (n - 1)) / 10;
    if (frac(nm.roc.ce.thumb, c50 * g, ROC.hill) * frac(nm.sux.ce, SUX.ce50 * g, SUX.hill) > COUNTS) ptc++;
  }
  return {
    t1: T[0], tofCount, tofr: tofCount === 4 ? T[3] / T[0] : null, ptc,
    diaphragm: tw('diaphragm', FADE[0]), upperAirway: tw('upperAirway', FADE[0]), larynx: tw('larynx', FADE[0]), neoFactor, phase2,
  };
}

export const pd = {
  name: 'pd',
  init(state) { return { nmb: readNmb(state.pk && state.pk.nm, state.patient.weightKg) }; },
  step(prev) { return { ...prev.pd, nmb: readNmb(prev.pk.nm, prev.patient.weightKg) }; },
  trend(s) { return { t1: s.nmb.t1 }; },
};
