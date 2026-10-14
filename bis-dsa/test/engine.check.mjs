// Node check of the BIS to DSA engine against the tuning targets (bis-dsa/NOTES.md, "Tuning targets").
// Runs the page's engine without a browser: node bis-dsa/test/engine.check.mjs. Prints a table; exits 1 on a miss.
import fs from 'node:fs';

const SRC = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const CUT = SRC.indexOf('// ===== drawing: monitor');
if (CUT < 0) throw new Error('app.js: drawing marker not found');
const BODY = SRC.slice(0, CUT);
const FS_ = 128, BASE = +process.env.SEED || 12345; // SEED=n tries another random run

// seeded random so runs repeat (mulberry32)
let seed = 1;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const M = Object.create(Math); M.random = rnd;
const load = () => new Function('Math', 'matchMedia', 'window',
  `var onColumn=null;${BODY};return {Engine,target,features,bisRaw,step,COLS,SIG,eng,mods,mixTarget,monMsg,mon,FS,DF,NB};`)(M, () => ({ matches: false }), {});

// one state: snap to it, run, then measure over the last 30 s (or run a script of phases). Spectral shapes are noisy
// over 30 s, so rows that compare peaks or bands pool several runs (nSeeds).
const MF = []; // [state, mean MF, mean SEF] for every run
function run(drug, d, mods = {}, secs = 120, phases, nSeeds = 1, monSet, base = BASE) {
  let S, last = [], rms2 = [];
  for (let r = 0; r < nSeeds; r++) {
    seed = base + 7919 * r;
    S = load(); Object.assign(S.mon, monSet); const ms = Object.assign(S.mods, mods);
    S.eng.setTarget(drug, d, ms); S.eng.snap();
    const rr = [];
    const go = n => { for (let s = 0; s < n; s++) { S.step(FS_); const w = S.SIG.slice(-FS_); rr.push(w.reduce((a, v) => a + v * v, 0) / FS_); } };
    go(secs);
    for (const [n, ch, fn] of phases || []) { Object.assign(ms, ch); fn && fn(S); S.eng.setTarget(drug, d, ms); go(n); }
    last = last.concat(S.COLS.slice(-30)); rms2 = rms2.concat(rr.slice(-30));
  }
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  const P = Array.from({ length: S.NB }, (_, k) => mean(last.map(c => 10 ** (c.db[k] / 10))));
  const band = (lo, hi) => { let s = 0; for (let k = Math.round(lo / S.DF); k <= Math.round(hi / S.DF); k++) s += P[k]; return 10 * Math.log10(s); };
  // peak: largest local maximum of the spectrum smoothed over ±0.5 Hz, times f (so a band shows above the 1/f background)
  const Q = P.map((_, k) => k * S.DF * (P[Math.max(0, k - 1)] + P[k] + P[Math.min(S.NB - 1, k + 1)]));
  const peak = (lo, hi) => { let b = null; for (let k = Math.round(lo / S.DF); k <= Math.round(hi / S.DF); k++) if (Q[k] > Q[k - 1] && Q[k] >= Q[k + 1] && (b == null || Q[k] > Q[b])) b = k; if (b == null) return NaN; const [l, c, r] = [Q[b - 1], Q[b], Q[b + 1]]; return (b + 0.5 * (l - r) / (l - 2 * c + r)) * S.DF; }; // parabolic, sub-bin
  const mf = mean(last.filter(c => c.mf != null).map(c => c.mf)), sefm = mean(last.filter(c => c.sef != null).map(c => c.sef));
  if (Number.isFinite(mf)) MF.push([`${drug} ${typeof d === 'object' ? JSON.stringify(d) : d}${Object.keys(mods).length ? ' ' + Object.keys(mods).join('+') : ''}`, mf, sefm]);
  return {
    S, mf, msg: S.monMsg(),
    bis: mean(last.filter(c => c.bis != null).map(c => c.bis)), sr: mean(last.map(c => c.bsr)), sef: mean(last.filter(c => c.sef != null).map(c => c.sef)),
    rms: Math.sqrt(mean(rms2)), emg: mean(last.map(c => c.emg)), sqi: mean(last.map(c => c.sqi)),
    band, peak, bisNow: S.COLS[S.COLS.length - 1].bis,
  };
}

const rows = []; let fails = 0;
const chk = (state, what, v, lo, hi, later) => {
  const ok = v >= lo && v <= hi; if (!ok && !later) fails++;
  rows.push([state, what, Number.isFinite(v) ? v.toFixed(1) : String(v), `${lo}..${hi}`, ok ? 'ok' : later ? 'later' : 'FAIL']);
};

const awake = run('propofol', 0, {}, 120, null, 4);
chk('Propofol 0 (awake)', 'BIS', awake.bis, 90, 97); chk('Propofol 0 (awake)', 'SR', awake.sr, 0, 0);
chk('Propofol 0 (awake)', 'RMS uV', awake.rms, 8, 12); chk('Propofol 0 (awake)', 'EMG dB', awake.emg, 35, 45);
const p17 = run('propofol', 0.17);
chk('Propofol 0.17', 'BIS', p17.bis, 80, 95); chk('Propofol 0.17', 'beta 13-25 dB vs awake', p17.band(13, 25) - awake.band(13, 25), 0.01, 99);
const p57 = run('propofol', 0.57, {}, 120, null, 4);
chk('Propofol 0.57', 'BIS', p57.bis, 40, 55); chk('Propofol 0.57', 'SEF95', p57.sef, 12, 17);
chk('Propofol 0.57', 'RMS uV', p57.rms, 25, 40); chk('Propofol 0.57', 'RMS GA/awake', p57.rms / awake.rms, 3, 99);
const p76 = run('propofol', 0.76);
chk('Propofol 0.76', 'BIS', p76.bis, 30, 42); chk('Propofol 0.76', 'SR', p76.sr, 0, 4.99);
const p90 = run('propofol', 0.9);
chk('Propofol 0.90', 'BIS', p90.bis, 25, 36); chk('Propofol 0.90', 'BIS minus propofol 0.76', p90.bis - p76.bis, -99, 0); chk('Propofol 0.90', 'SR', p90.sr, 15, 55);
{ // Bruhn rule: below SR 40 the features set BIS (no cap); from 40 BIS is at most 50 - SR/2
  const S = load(), f = { sef: 20, fast: -0.6, hi: -1.5, slowFrac: 0.5, alphaFrac: 0.2 };
  chk('Bruhn rule', 'BIS at SR 0 minus SR 30 (pulled towards 30, not capped)', S.bisRaw(f, 0) - S.bisRaw(f, 30), 0.01, 99);
  chk('Bruhn rule', 'BIS at SR 30 (not under the 50-SR/2 line)', S.bisRaw(f, 30), 27, 99);
  chk('Bruhn rule', 'jump in BIS across SR 40', Math.abs(S.bisRaw(f, 39.9) - S.bisRaw(f, 40.1)), 0, 1);
  chk('Bruhn rule', 'BIS at SR 60 (capped at 20)', S.bisRaw(f, 60), 0, 20);
}
{ // BIS falls with depth through the start of suppression (0.57 > 0.76 > 0.88 > 0.95), on 3 seeds each
  const b = d => [0, 1, 2].map(r => run('propofol', d, {}, 120, null, 1, undefined, BASE + 104729 * r).bis);
  const v = [0.57, 0.76, 0.88, 0.95].map(b), worst = Math.min(...[0, 1, 2].flatMap(r => [v[0][r] - v[1][r], v[1][r] - v[2][r], v[2][r] - v[3][r]]));
  chk('Propofol 0.57/0.76/0.88/0.95', 'smallest BIS fall between steps', worst, 0.01, 99);
}
const p100 = run('propofol', 1);
chk('Propofol 1.0', 'BIS', p100.bis, 0, 12); chk('Propofol 1.0', 'SR', p100.sr, 80, 100);
const p55 = run('propofol', 0.55, {}, 120, null, 4), s55 = run('sevo', 0.55, {}, 120, null, 4);
chk('Sevo 0.55', 'BIS', s55.bis, 40, 55); chk('Sevo 0.55', 'theta peak Hz', s55.peak(3.5, 7.5), 4, 6); // sevo theta 4-6 Hz (Akeju 2014); 4.5-5.5 sat on a seed edge
chk('Sevo 0.55', 'alpha 8-12 dB vs propofol 0.55', s55.band(8, 12) - p55.band(8, 12), 1, 3);
const s100 = run('sevo', 1);
chk('Sevo 1.0', 'BIS', s100.bis, 15, 40); chk('Sevo 1.0', 'SR', s100.sr, 0, 60);
const k65 = run('ketamine', 0.65, {}, 120, null, 4), awN = run('propofol', 0, { nmb: true }, 600);
chk('Ketamine 0.65', 'BIS', k65.bis, 65, 82); chk('Ketamine 0.65', 'SEF95', k65.sef, 25, 99);
chk('Ketamine 0.65', 'EMG minus awake-paralysed', Math.abs(k65.emg - awN.emg), 0, 3);
chk('Ketamine 0.65', '13-24 Hz dB vs awake', k65.band(13, 24) - awake.band(13, 24), -99, 0.5);
const k1 = run('ketamine', 1), mk1 = run('mix', { ketamine: 1 });
chk('Mix ketamine 1.0 vs single', 'BIS diff', Math.abs(mk1.bis - k1.bis), 0, 6);
const pk = run('mix', { propofol: 3.5, ketamine: 0.4 });
chk('Mix propket preset', 'BIS', pk.bis, 58, 70);
const x4 = run('dex', 0.4, {}, 120, null, 4);
chk('Dex 0.4', 'BIS', x4.bis, 55, 72); chk('Dex 0.4', '0.5-1 Hz dB vs propofol 0.57', x4.band(0.5, 1) - p57.band(0.5, 1), -99, -10);
const x1 = run('dex', 1); chk('Dex 1.0', 'BIS', x1.bis, 40, 58);
const e57 = run('propofol', 0.57, { elderly: true }, 120, null, 4);
chk('Elderly propofol 0.57', 'BIS minus young', e57.bis - p57.bis, 6, 12);
chk('Elderly propofol 0.57', '8-12 Hz dB vs young', e57.band(8, 12) - p57.band(8, 12), -10, -8);
chk('Elderly propofol 0.57', 'alpha peak shift Hz', e57.peak(7, 14) - p57.peak(7, 14), -1.4, -0.6);
const e80 = run('propofol', 0.8, { elderly: true }), y80 = run('propofol', 0.8), e90 = run('propofol', 0.9, { elderly: true });
chk('Elderly propofol 0.90', 'SR (heavy, not isoelectric)', e90.sr, 40, 95);
chk('Elderly propofol 0.80', 'SR', e80.sr, 0.01, 100); chk('Young propofol 0.80', 'SR (about 0)', y80.sr, 0, 5);
// relaxant in an awake patient: from awake steady state, then relaxant on (and off again)
const n60 = run('propofol', 0, {}, 120, [[60, { nmb: true }]]);
chk('Awake + nmb, 60 s', 'BIS', n60.bisNow, 75, 85); chk('Awake + nmb, 60 s', 'EMG dB', n60.emg, 0, 30);
const n300 = run('propofol', 0, {}, 120, [[300, { nmb: true }]]);
chk('Awake + nmb, 300 s', 'BIS', n300.bisNow, 45, 62);
const nOff = run('propofol', 0, {}, 120, [[300, { nmb: true }], [120, { nmb: false }]]);
chk('nmb off again, 120 s', 'BIS', nOff.bisNow, 85.01, 100);
const tiva = run('mix', { propofol: 3, remi: 4 }), prop3 = run('mix', { propofol: 3 });
chk('Propofol 3 + remi 4 vs propofol 3', 'BIS diff', Math.abs(tiva.bis - prop3.bis), 0, 3);
const sn = run('mix', { sevo: 0.8, n2o: 0.6 }), s8 = run('mix', { sevo: 0.8 });
chk('Sevo 0.8 + N2O 0.6 vs sevo 0.8', 'BIS diff', sn.bis - s8.bis, -2, 3);
const pe = run('propofol', 0.55, { emg: true });
chk('Propofol 0.55 + emg', 'BIS', pe.bis, 62, 85); chk('Propofol 0.55 + emg', 'EMG dB', pe.emg, 48, 58);
const pn = run('propofol', 0.55, { nmb: true });
chk('Propofol 0.55 + nmb', 'BIS', pn.bis, 40, 55); chk('Propofol 0.55 + nmb', 'BIS minus no relaxant', pn.bis - run('propofol', 0.55).bis, -3, 3);
chk('Propofol 0.45 + nmb', 'BIS minus no relaxant', run('propofol', 0.45, { nmb: true }).bis - run('propofol', 0.45).bis, -3, 3); chk('Propofol 0.55 + nmb', 'EMG dB', pn.emg, 25, 30);
chk('Clean signal', 'SQI', awake.sqi, 90, 100);
const dia = run('propofol', 0.55, { diathermy: true }, 60);
chk('Diathermy on, 60 s', 'SQI', dia.sqi, 0, 49.99);
{ // diathermy for 120 s after 120 s clean: SQI under 50, EMG during bursts 10 dB or more over the clean baseline
  seed = BASE; const S = load(); S.eng.setTarget('propofol', 0.55, S.mods); S.eng.snap(); S.step(120 * FS_);
  const base = S.COLS.slice(-30).reduce((a, c) => a + c.emg, 0) / 30;
  // then 120 s of diathermy, one sample at a time; a burst second is one with diathermy on for 90% of it or more
  S.mods.diathermy = true; const bursts = [];
  for (let s = 0; s < 120; s++) { let n = 0; for (let i = 0; i < FS_; i++) { S.step(1); if (S.eng.diOn) n++; } if (n > 0.9 * FS_) bursts.push(S.COLS[S.COLS.length - 1].emg); }
  const c = S.COLS[S.COLS.length - 1];
  chk('Diathermy on, 120+ s', 'SQI', c.sqi, 0, 49.99);
  chk('Diathermy on', 'EMG in bursts minus clean dB', bursts.reduce((a, b) => a + b, 0) / bursts.length - base, 10, 30);
  chk('Diathermy on', 'monitor message', /Artifact|unavailable/.test((S.monMsg() || [])[1]) ? 1 : 0, 1, 1);
}
const iso = run('propofol', 1, {}, 120);
chk('Isoelectric (propofol 1.0, 120 s)', 'SR', iso.sr, 99.5, 100);
chk('Isoelectric (propofol 1.0, 120 s)', 'message "Isoelectric EEG Detected"', iso.msg && iso.msg[1] === 'Isoelectric EEG Detected' ? 1 : 0, 1, 1);
chk('GA, clean (propofol 0.57)', 'no message', p57.msg == null ? 1 : 0, 1, 1);
// share of the last 60 s (after 120 s) with a given message
const msgShare = (drug, d, re) => { seed = BASE; const S = load(); S.eng.setTarget(drug, d, S.mods); S.eng.snap(); S.step(120 * FS_);
  let n = 0; for (let s = 0; s < 60; s++) { S.step(FS_); if (re.test((S.monMsg() || [])[1] || '')) n++; } return 100 * n / 60; };
chk('Deep (propofol 0.84), 60 s', '% of seconds with "BIS Out of Target Range – Low"', msgShare('propofol', 0.84, /Target Range . Low/), 80, 100);
for (const [dr, d] of [['propofol', 0.35], ['dex', 0.4], ['ketamine', 0.3]])
  chk(`Sedation (${dr} ${d}), 60 s`, '% of seconds with "Out of Target Range"', msgShare(dr, d, /Target Range/), 0, 0);
// WS4: median frequency (SEF50) under SEF95 in every state; propofol GA MF 2-8 Hz
chk('MF < SEF95 in every state', 'states where MF >= SEF95', MF.filter(([, m, s]) => !(m < s)).length, 0, 0);
chk('Propofol 0.57', 'MF (SEF50) Hz', p57.mf, 2, 8);
{ // smoothing: after an awake -> 0.57 step, BIS is within 5 of its final value at least 5 s sooner with 10 s than 30 s
  const fin = p57.bis, reach = n => { seed = BASE; const S = load(); S.mon.smooth = n; S.eng.setTarget('propofol', 0, S.mods); S.eng.snap(); S.step(120 * FS_);
    S.eng.setTarget('propofol', 0.57, S.mods); for (let s = 1; s <= 240; s++) { S.step(FS_); if (Math.abs(S.COLS[S.COLS.length - 1].bis - fin) <= 5) return s; } return 999; };
  const r10 = reach(10), r30 = reach(30);
  rows.push(['Smoothing 10 s vs 30 s', `seconds to within 5 of final (10 s: ${r10}, 30 s: ${r30})`, String(r30 - r10), '5..', r30 - r10 >= 5 ? 'ok' : 'FAIL']); if (r30 - r10 < 5) fails++;
}

// effect site and the relaxant mode: induction is quick (tau 12 s), emergence slow (tau 120 s); 'auto' gives the relaxant at induction
{ seed = BASE; const S = load(), ms = S.mods; ms.nmbMode = 'auto'; S.eng.setTarget('propofol', 0, ms); S.eng.snap(); S.step(120 * FS_);
  const bisNow = () => S.COLS[S.COLS.length - 1].bis;
  chk('Relaxant auto, awake 120 s', 'BIS (not paralysed)', bisNow(), 85, 100); chk('Relaxant auto, awake 120 s', 'relaxant on (0/1)', +ms.nmb, 0, 0);
  S.eng.setTarget('propofol', 0.57, ms); S.step(20 * FS_);
  chk('Induction step to 0.57, 20 s', 'share of target reached (tau 12 s)', S.eng.de / 0.57, 0.74, 0.88); chk('Induction step, 20 s', 'relaxant given (0/1)', +ms.nmb, 1, 1);
  S.step(60 * FS_); chk('Induction step to 0.57, 80 s', 'BIS (fast: already in GA range)', bisNow(), 38, 62);
  S.step(300 * FS_); chk('Induction step to 0.57, 6 min', 'share of target reached', S.eng.de / 0.57, 0.99, 1.01); chk('Induction step to 0.57, 6 min', 'BIS', bisNow(), 38, 56);
  S.eng.setTarget('propofol', 0, ms); S.step(75 * FS_);
  chk('Emergence, 75 s after stopping', 'effect site share left (tau 120 s: 0.54)', S.eng.de / 0.57, 0.46, 0.62); chk('Emergence, 75 s', 'BIS still low (slow wake-up)', bisNow(), 0, 78);
  S.step(45 * FS_); chk('Emergence, 120 s', 'relaxant reversed (0/1)', +ms.nmb, 0, 0); chk('Emergence, 120 s', 'BIS still below 85', bisNow(), 0, 85);
  S.step(180 * FS_); chk('Emergence, 5 min', 'BIS back above 80', bisNow(), 80, 100);
  ms.nmbMode = 'on'; S.eng.setTarget('propofol', 0, ms); S.step(5 * FS_); chk('Relaxant On now', 'on (0/1)', +ms.nmb, 1, 1); ms.nmbMode = 'off'; ms.nmb = false; }

// WS5: blinks, surgical stimulus
const bl = run('propofol', 0, { blink: true }, 120, null, 4);
chk('Blinks, awake', 'SQI', bl.sqi, 85, 100); chk('Blinks, awake', 'BIS', bl.bis, 80, 100);
chk('Blinks, awake', '0.5-2 Hz dB vs no blinks', bl.band(0.5, 2) - awake.band(0.5, 2), 3, 99);
const stim = S => S.eng.stimulus(''), st = (drug, d, f) => run(drug, d, {}, 120, [[60, {}, f]], 4);
const s57 = st('propofol', 0.57, stim), q57 = st('propofol', 0.57);
chk('Stimulus at 0.57, no remi', '8-12 Hz dB change', s57.band(8, 12) - q57.band(8, 12), -4.5, -2.5);
const s30 = st('propofol', 0.3, stim), q30 = st('propofol', 0.3);
chk('Stimulus at 0.3, no remi', 'BIS rise', s30.bis - q30.bis, 10, 99);
const P30 = { propofol: 0.3 / 0.155 }, R30 = { propofol: 0.3 / 0.155, remi: 4 };
const sm = st('mix', P30, stim), qm = st('mix', P30), sr4 = st('mix', R30, stim), qr4 = st('mix', R30);
chk('Stimulus, mix remi 4 vs no remi', 'BIS rise ratio', (sr4.bis - qr4.bis) / (sm.bis - qm.bis), -1, 0.33);
const sd = st('propofol', 0.57, S => S.eng.stimulus('delta'));
chk('Stimulus at 0.57, delta arousal', 'BIS change (falls)', sd.bis - q57.bis, -99, -0.01);

const wid = rows[0].map((_, i) => Math.max(...rows.map(r => r[i].length)));
for (const r of rows) console.log(r.map((c, i) => c.padEnd(wid[i])).join('  '));
if (fails) { console.error(`bis-dsa engine: ${fails} check(s) failed`); process.exit(1); }
console.log('bis-dsa engine: ok');
