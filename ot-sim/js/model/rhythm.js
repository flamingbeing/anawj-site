// Rhythm (MODEL.md section 6). M2.1: sinus rhythm only. Beat times are exact numbers (not rounded to steps): each
// beat follows the last by the heart period the baroreflex sets (cardio.js, previous step), with a little seeded
// beat-to-beat variation. M2.7 adds the AV node, blocks, AF, ectopics, VT, VF, asystole and pacing.
//
// Contract: rh.rhythm, rh.events (the beats inside this step: { t, rr }), rh.next (the next beat's time, known ahead,
// so the monitor can draw a P wave before its QRS).

const JITTER = 0.015; // beat-to-beat SD as a fraction of the period [D] (resting heart-rate variability is a few %)

export const rhythm = {
  name: 'rh',
  init(state) {
    const hp = state.cv ? state.cv.hp : 60 / 72;
    return { rhythm: 'sinus', events: [], next: hp, last: 0 };
  },
  step(prev, ctx) {
    const r = prev.rh, hp = prev.cv ? prev.cv.hp : 60 / 72;
    const events = [];
    let next = r.next, last = r.last;
    while (next <= ctx.t) {
      events.push({ t: next, rr: next - last });
      last = next;
      next = next + hp * (1 + JITTER * ctx.normal('rhythm'));
    }
    return events.length || r.events.length ? { ...r, events, next, last } : r;
  },
  rebase(r, off) { return { ...r, next: r.next - off, last: r.last - off, events: r.events.map(e => ({ ...e, t: e.t - off })) }; },
};
