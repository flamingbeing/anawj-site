// NTF Roster: the rule engine. Rules are plain data (SPEC.md "Rules"); this file knows how to describe, validate
// and check them, fast enough to re-check a whole month on every edit, and incrementally for the solver.
//
// ---------------------------------------------------------------------------------------------------------------
// HOW TO ADD A NEW RULE TYPE (the owner asks for a kind of rule none of the types below can express):
//
//   1. Add one entry to RULE_TYPES below. An entry is self-contained:
//        label, icon, help, example         words for the rule builder (ui-rules.js builds its form from `params`)
//        params: [ParamSpec]                { key, label, kind: 'codes'|'code'|'number'|'select'|'who'|'bool', ... }
//        defaults() -> params               a fresh params object
//        scope: 'day'|'person'|'global'     what one evaluation covers (the solver re-checks only what a change touches)
//        soft_only?: true                   always soft (penalty only)
//        describe(rule, T) -> string        short English; T has helpers: T.codes(list), T.who(who), T.when(when)...
//        validate?(rule, state) -> string[] extra problems beyond the generic param checks
//        compile(rule, X) -> evaluator      X is the compile kit (see compileRule): matchers, who/when filters, ctx.
//      The evaluator is an object with any of:
//        day(d, out)     -> penalty for day index d           (scope 'day')
//        person(p, out)  -> penalty for person index p         (scope 'person')
//        global(out)     -> penalty for everything             (scope 'global'; with touch(p) to refresh one person
//                           incrementally and init() to refresh everyone)
//      Each violation adds to the penalty (X.u per unit), bumps X.ctx.n2 (the violation count), and when `out` is an array pushes
//      X.V(pen, msg, { date, staffId, dates?, staffIds? }) (only build messages when out is given: it keeps the
//      solver fast).
//   2. Add positive and negative cases to test/rules.test.mjs, plus a describeRule check.
//   Nothing else changes: the checker, the rule builder and the solver all read RULE_TYPES.
// ---------------------------------------------------------------------------------------------------------------

import {
  DEFAULT_RULES, dutyMap, addDays, monthDays, monthOf, fmtDay, fmtMonth, uid, isHoliday, getCell, TOKENS,
} from './model.js';

export { DEFAULT_RULES };

// ---------- context: the grid of effective codes for a date range, built once per evaluate ----------

// Flags per person-day (bit mask), so token tests are one AND.
export const F = { SHIFT: 1, LEAVE: 2, OTHER: 4, REQ: 8, X: 16, ANY: 32, PRESENT: 64 };
const KIND_BIT = { shift: F.SHIFT, leave: F.LEAVE, other: F.OTHER, request: F.REQ };
const NONE = Object.freeze([]);

// Days from..to plus at least 7 days either side, widened to whole months (so month limits count every day).
export function buildContext(state, { from, to }) {
  const dm = dutyMap(state);
  const start = minS(addDays(from, -7), monthOf(from) + '-01');
  const endM = monthDays(monthOf(to));
  const end = maxS(addDays(to, 7), endM[endM.length - 1]);
  const days = [];
  for (let s = start; s <= end; s = addDays(s, 1)) days.push(s);
  const n = days.length;
  const people = (state.staff || []).filter(p => p && p.active !== false);
  const P = people.length;
  const ctx = {
    state, dm, days, n, people, P, from, to,
    lo: days.indexOf(from), hi: days.indexOf(to),
    index: new Map(people.map((p, i) => [p.id, i])),
    wd: new Int8Array(n), hol: new Uint8Array(n),
    act: new Uint8Array(P * n), codes: new Array(P * n), req: new Array(P * n),
    post: new Uint8Array(P * n), flags: new Uint8Array(P * n), prePost: new Uint8Array(P),
    kindBit: new Map(), overnight: new Set(), n2: 0,
    month: [], weekStart: new Int32Array(n),
  };
  for (const d of dm.values()) {
    if (KIND_BIT[d.kind]) ctx.kindBit.set(d.code, KIND_BIT[d.kind]);
    if (d.overnight) ctx.overnight.add(d.code);
  }
  ctx.kindBit.set('x', F.X);
  for (let d = 0; d < n; d++) {
    const [y, m, dd] = days[d].split('-').map(Number);
    ctx.wd[d] = new Date(y, m - 1, dd).getDay();
    ctx.hol[d] = isHoliday(state, days[d]) ? 1 : 0;
    ctx.month[d] = days[d].slice(0, 7);
    ctx.weekStart[d] = d - ((ctx.wd[d] + 6) % 7);   // index of that week's Monday (may be < 0)
  }
  const before = addDays(start, -1);
  for (let p = 0; p < P; p++) {
    const per = people[p];
    const prev = getCell(state, before, per.id);
    ctx.prePost[p] = prev && prev.a.some(c => ctx.overnight.has(c)) ? 1 : 0;
    for (let d = 0; d < n; d++) {
      const i = p * n + d, s = days[d];
      ctx.act[i] = (!per.start || s >= per.start) && (!per.end || s <= per.end) ? 1 : 0;
      const cell = state.cells && state.cells[s] && state.cells[s][per.id];
      ctx.codes[i] = cell && cell.a ? cell.a : NONE;
      ctx.req[i] = cell && cell.r ? cell.r : NONE;
    }
    for (let d = 0; d < n; d++) refresh(ctx, p * n + d);
  }
  ctx.periods = { month: monthPeriods(ctx), week: weekPeriods(ctx), range: [{ key: 'range', a: ctx.lo, b: ctx.hi }] };
  return ctx;
}

const minS = (a, b) => (a < b ? a : b);
const maxS = (a, b) => (a > b ? a : b);

// Recompute post call and flags for one person-day (the solver calls this for i and i+1 after a change).
export function refresh(ctx, i) {
  const d = i % ctx.n;
  const prevCodes = d > 0 ? ctx.codes[i - 1] : null;
  let post = d > 0 ? 0 : ctx.prePost[(i / ctx.n) | 0];
  if (prevCodes) for (let k = 0; k < prevCodes.length; k++) if (ctx.overnight.has(prevCodes[k])) { post = 1; break; }
  ctx.post[i] = post;
  let f = 0;
  const a = ctx.codes[i], r = ctx.req[i];
  for (let k = 0; k < a.length; k++) f |= ctx.kindBit.get(a[k]) || 0;
  for (let k = 0; k < r.length; k++) f |= ctx.kindBit.get(r[k]) || 0;
  if (post) f |= F.X;
  if (a.length || r.length || post) f |= F.ANY;
  if (ctx.act[i]) {
    const wd = ctx.wd[d];
    if ((f & F.SHIFT) || (wd !== 0 && wd !== 6 && !ctx.hol[d] && !(f & (F.LEAVE | F.OTHER | F.X)))) f |= F.PRESENT;
  }
  ctx.flags[i] = f;
}

function monthPeriods(ctx) {
  const out = [];
  const seen = new Set();
  for (let d = ctx.lo; d <= ctx.hi; d++) {
    const m = ctx.month[d];
    if (seen.has(m)) continue;
    seen.add(m);
    let a = d, b = d;
    while (a > 0 && ctx.month[a - 1] === m) a--;
    while (b < ctx.n - 1 && ctx.month[b + 1] === m) b++;
    out.push({ key: m, a, b });
  }
  return out;
}
function weekPeriods(ctx) {
  const out = [];
  for (let ws = ctx.weekStart[ctx.lo]; ws <= ctx.hi; ws += 7) {
    out.push({ key: ws, a: Math.max(0, ws), b: Math.min(ctx.n - 1, ws + 6) });
  }
  return out;
}

// ---------- compile kit: matchers and filters ----------

// A code list (codes and tokens) -> matcher(i) for a person-day, plus elem(code) for one code.
export function compileCodes(ctx, codes) {
  let mask = 0;
  const set = new Set();
  for (const c of codes || []) {
    if (c === '@shift') mask |= F.SHIFT;
    else if (c === '@leave') mask |= F.LEAVE;
    else if (c === '@other') mask |= F.OTHER;
    else if (c === '@request') mask |= F.REQ;
    else if (c === '@away') mask |= F.LEAVE | F.OTHER | F.X;
    else if (c === '@any') mask |= F.ANY;
    else if (c === '@present') mask |= F.PRESENT;
    else if (c === 'x') mask |= F.X;
    else if (c) set.add(c);
  }
  const has = set.size > 0;
  const flags = ctx.flags, cs = ctx.codes, rs = ctx.req;
  const m = has
    ? i => {
      if (flags[i] & mask) return true;
      const a = cs[i];
      for (let k = 0; k < a.length; k++) if (set.has(a[k])) return true;
      const r = rs[i];
      for (let k = 0; k < r.length; k++) if (set.has(r[k])) return true;
      return false;
    }
    : i => (flags[i] & mask) !== 0;
  const elemMask = mask & ~F.PRESENT;
  // one code (not a day): does it match? (x, kinds, @any)
  m.elem = code => set.has(code) || (elemMask & F.ANY) !== 0 || (elemMask & (ctx.kindBit.get(code) || 0)) !== 0;
  m.present = (mask & F.PRESENT) !== 0;
  m.empty = !mask && !has;
  m.set = set;
  return m;
}

const blankWho = () => ({ groups: [], tags: [], staff: [], exclude: [] });
export function compileWho(ctx, who) {
  who = { ...blankWho(), ...(who || {}) };
  const everyone = !who.groups.length && !who.tags.length && !who.staff.length;
  const inWho = new Uint8Array(ctx.P);
  const list = [];
  ctx.people.forEach((p, i) => {
    let ok = everyone || who.groups.includes(p.group) || who.staff.includes(p.id) || (p.tags || []).some(t => who.tags.includes(t));
    if (who.exclude.includes(p.id)) ok = false;
    if (ok) { inWho[i] = 1; list.push(i); }
  });
  return { inWho, list };
}

export function compileWhen(ctx, when) {
  when = { from: '', to: '', days: [], holidays: 'any', ...(when || {}) };
  const ok = new Uint8Array(ctx.n);
  const days = (when.days || []).map(Number);
  for (let d = 0; d < ctx.n; d++) {
    const s = ctx.days[d];
    if (when.from && s < when.from) continue;
    if (when.to && s > when.to) continue;
    if (days.length && !days.includes(ctx.wd[d])) continue;
    if (when.holidays === 'only' && !ctx.hol[d]) continue;
    if (when.holidays === 'exclude' && ctx.hol[d]) continue;
    ok[d] = 1;
  }
  return ok;
}

const unset = v => v === '' || v == null || Number.isNaN(Number(v));
const num = (v, dflt = null) => (unset(v) ? dflt : Number(v));

// Rule with every field present (params merged over the type's defaults).
export function normalizeRule(rule) {
  const t = RULE_TYPES[rule && rule.type];
  return {
    id: '', name: '', enabled: true, hard: true, weight: 10, note: '', ...rule,
    who: { ...blankWho(), ...((rule && rule.who) || {}) },
    when: { from: '', to: '', days: [], holidays: 'any', ...((rule && rule.when) || {}) },
    params: { ...(t ? t.defaults() : {}), ...((rule && rule.params) || {}) },
  };
}

// Compile one rule into an evaluator for this context (null if the rule can't be checked).
export function compileRule(ctx, raw) {
  const t = RULE_TYPES[raw && raw.type];
  if (!t) return null;
  const rule = normalizeRule(raw);
  const hard = !!rule.hard && !t.soft_only;
  const u = hard ? 1000 : Math.min(100, Math.max(1, num(rule.weight, 10)));
  const T = textKit(ctx.state);
  const X = {
    ctx, rule, hard, u, T,
    codes: list => compileCodes(ctx, list),
    who: w => compileWho(ctx, w),
    when: compileWhen(ctx, rule.when),
    name: p => { const per = ctx.people[p]; return (per && (per.short || per.name)) || '?'; },
    day: d => fmtDay(ctx.days[d]),
    inRange: d => d >= ctx.lo && d <= ctx.hi,
    V: (penalty, msg, o = {}) => ({ ruleId: rule.id, type: rule.type, hard, penalty, msg, ...o }),
    iso: d => ctx.days[d],
    num,
  };
  X.W = X.who(rule.who);
  let ev = null;
  try { ev = t.compile(rule, X); } catch (e) { ev = null; }
  if (!ev) return null;
  return { rule, type: t, hard, u, ...ev };
}

export function compileRules(ctx, rules) {
  return (rules || []).map(r => compileRule(ctx, r)).filter(Boolean);
}

// ---------- words ----------

const TOKEN_WORDS = { '@shift': 'any shift', '@leave': 'leave', '@other': 'other duty', '@request': 'a request', '@away': 'away', '@present': 'at work', '@any': 'anything', x: 'post call' };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const listOr = (a, word = 'or') => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} ${word} ${a[a.length - 1]}`);
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

function textKit(state) {
  const dm = dutyMap(state);
  const groups = state.groups || [], tags = state.tags || [], staff = state.staff || [];
  const kindIds = k => groups.filter(g => g.kind === k).map(g => g.id);
  const codeName = c => TOKEN_WORDS[c] || (dm.get(c) && dm.get(c).name) || c;
  const T = {
    code: codeName,
    codes: list => listOr((list || []).map(codeName)) || 'nothing',
    // "juniors", "seniors", "everyone", or names
    who(who) {
      who = { ...blankWho(), ...(who || {}) };
      const parts = [];
      if (who.groups.length) {
        if (sameSet(who.groups, kindIds('junior'))) parts.push('juniors');
        else if (sameSet(who.groups, kindIds('senior'))) parts.push('seniors');
        else parts.push(...who.groups.map(id => (groups.find(g => g.id === id) || { name: id }).name));
      }
      parts.push(...who.tags.map(id => (tags.find(g => g.id === id) || { name: id }).name));
      parts.push(...who.staff.map(id => { const p = staff.find(x => x.id === id); return p ? (p.short || p.name) : id; }));
      let text = parts.length ? listOr(parts.length > 4 ? [...parts.slice(0, 3), `${parts.length - 3} more`] : parts) : 'everyone';
      if (who.exclude.length) text += ` except ${listOr(who.exclude.map(id => { const p = staff.find(x => x.id === id); return p ? (p.short || p.name) : id; }), 'and')}`;
      return text;
    },
    // a noun for counts: junior(s), senior(s), Baby MO(s), person/people
    noun(who, count) {
      who = { ...blankWho(), ...(who || {}) };
      const one = count === 1;
      const g = who.groups;
      if (g.length && !who.tags.length && !who.staff.length) {
        const kinds = new Set(g.map(id => (groups.find(x => x.id === id) || {}).kind));
        if (kinds.size === 1 && kinds.has('junior')) return one ? 'junior' : 'juniors';
        if (kinds.size === 1 && kinds.has('senior')) return one ? 'senior' : 'seniors';
      }
      if (!g.length && who.tags.length === 1 && !who.staff.length) {
        const name = (tags.find(x => x.id === who.tags[0]) || { name: who.tags[0] }).name;
        return one ? name : name + 's';
      }
      return one ? 'person' : 'people';
    },
    // "weekends", "weekdays except public holidays", "public holidays", "Mon, Wed, from 3 Nov"
    when(when) {
      when = { from: '', to: '', days: [], holidays: 'any', ...(when || {}) };
      const days = [...(when.days || [])].map(Number).sort();
      const parts = [];
      if (days.length && days.length < 7) {
        if (sameSet(days, [0, 6])) parts.push('weekends');
        else if (sameSet(days, [1, 2, 3, 4, 5])) parts.push('weekdays');
        else parts.push(days.map(d => DAY_NAMES[d]).join(', '));
      }
      if (when.holidays === 'only') parts.push(parts.length ? 'on public holidays' : 'public holidays');
      if (when.holidays === 'exclude') parts.push('except public holidays');
      const short = s => fmtDay(s).replace(/^\w+ /, '');
      if (when.from && when.to) parts.push(`${short(when.from)} to ${short(when.to)}`);
      else if (when.from) parts.push(`from ${short(when.from)}`);
      else if (when.to) parts.push(`until ${short(when.to)}`);
      return parts.join(' ');
    },
    amount(min, max) {
      min = num(min); max = num(max);
      if (min != null && max != null) return min === max ? `exactly ${min}` : `${min} to ${max}`;
      if (min != null) return `at least ${min}`;
      if (max != null) return `at most ${max}`;
      return 'any number of';
    },
  };
  return T;
}

const isEveryone = who => !who || (!(who.groups || []).length && !(who.tags || []).length && !(who.staff || []).length && !(who.exclude || []).length);
const withWhen = (text, rule, T) => { const w = T.when(rule.when); return w ? `${text} (${w})` : text; };
const whoPrefix = (rule, T) => (isEveryone(rule.who) ? '' : `${cap(T.who(rule.who))}: `);

// ---------- the rule types ----------

const P = {
  codes: (key = 'codes', label = 'Codes', help) => ({ key, label, kind: 'codes', help }),
  num: (key, label, o = {}) => ({ key, label, kind: 'number', ...o }),
  sel: (key, label, options, help) => ({ key, label, kind: 'select', options, help }),
};

export const RULE_TYPES = {
  // Each day, how many people (in who) have the codes.
  cover: {
    label: 'Cover each day', icon: '👥', scope: 'day',
    help: 'How many people must (or may) be on a duty each day.',
    example: 'Each day: exactly 2 juniors on Call',
    params: [P.codes('codes', 'Duty'), P.num('min', 'At least', { min: 0, optional: true }), P.num('max', 'At most', { min: 0, optional: true })],
    defaults: () => ({ codes: [], min: 1, max: null }),
    describe(r, T) {
      const p = r.params, w = T.when(r.when);
      const amt = T.amount(p.min, p.max);
      const n = num(p.max, num(p.min, 2));
      let noun = T.noun(r.who, n);
      if (!isEveryone(r.who) && (noun === 'person' || noun === 'people')) noun += ` from ${T.who(r.who)}`;
      return `${w ? cap(w) : 'Each day'}: ${amt} ${noun} on ${T.codes(p.codes)}`;
    },
    validate(r) { return unset(r.params.min) && unset(r.params.max) ? ['Set at least or at most'] : []; },
    compile(r, X) {
      const m = X.codes(r.params.codes);
      if (m.empty) return null;
      const min = num(r.params.min), max = num(r.params.max);
      const { list } = X.W, ok = X.when, { ctx, u } = X, n = ctx.n, act = ctx.act;
      return {
        info: { m, list, ok, min, max },
        day(d, out) {
          if (!ok[d]) return 0;
          let cnt = 0;
          for (let k = 0; k < list.length; k++) { const i = list[k] * n + d; if (act[i] && m(i)) cnt++; }
          let pen = 0;
          if (min != null && cnt < min) {
            pen += u * (min - cnt); ctx.n2++;
            if (out) out.push(X.V(u * (min - cnt), `${X.day(d)}: ${cnt} ${X.T.noun(r.who, cnt)} on ${X.T.codes(r.params.codes)}, needs ${min}`, { date: X.iso(d) }));
          }
          if (max != null && cnt > max) {
            pen += u * (cnt - max); ctx.n2++;
            if (out) {
              const ids = list.filter(p => act[p * n + d] && m(p * n + d)).map(p => ctx.people[p].id);
              out.push(X.V(u * (cnt - max), `${X.day(d)}: ${cnt} ${X.T.noun(r.who, cnt)} on ${X.T.codes(r.params.codes)}, at most ${max}`, { date: X.iso(d), staffIds: ids }));
            }
          }
          return pen;
        },
      };
    },
  },

  // Each person's count per week / month / rolling window.
  limit: {
    label: 'Limit per person', icon: '🔢', scope: 'person',
    help: 'How many times each person may (or must) do a duty per week, month or any run of days.',
    example: 'Juniors: at most 7 Call a month (scaled by FTE)',
    params: [
      P.codes('codes', 'Duty'),
      P.sel('period', 'Per', [['week', 'Week (Mon to Sun)'], ['month', 'Month'], ['rolling', 'Any run of days']]),
      P.num('window', 'Days in the run', { min: 1, max: 62, optional: true, help: 'Only for "any run of days"' }),
      P.num('min', 'At least', { min: 0, optional: true }),
      P.num('max', 'At most', { min: 0, optional: true }),
      { key: 'fte', label: 'Scale by FTE', kind: 'bool', help: 'Part-timers get a smaller share' },
      { key: 'prorate', label: 'Scale by days in post', kind: 'bool', help: 'People joining or leaving mid-period get a smaller share' },
    ],
    defaults: () => ({ codes: [], period: 'month', window: 7, min: null, max: 4, fte: false, prorate: false }),
    describe(r, T) {
      const p = r.params;
      const per = p.period === 'week' ? 'a week' : p.period === 'rolling' ? `in any ${num(p.window, 7)} days` : 'a month';
      const w = T.when(r.when);
      let s = `${cap(T.who(r.who))}: ${T.amount(p.min, p.max)} ${T.codes(p.codes)} ${per}${w ? ` on ${w}` : ''}`;
      const sc = [p.fte && 'scaled by FTE', p.prorate && 'pro rata'].filter(Boolean);
      if (sc.length) s += ` (${sc.join(', ')})`;
      return s;
    },
    validate(r) {
      const out = [];
      if (unset(r.params.min) && unset(r.params.max)) out.push('Set at least or at most');
      if (r.params.period === 'rolling' && !(num(r.params.window, 0) >= 1)) out.push('Set how many days in the run');
      return out;
    },
    compile(r, X) {
      const p = r.params, m = X.codes(p.codes);
      if (m.empty) return null;
      const min = num(p.min), max = num(p.max);
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, inWho = X.W.inWho;
      const codesTxt = X.T.codes(p.codes);
      const factorOf = (pi, act_, tot) => (p.fte ? (Number(ctx.people[pi].fte) > 0 ? Number(ctx.people[pi].fte) : 1) : 1) * (p.prorate ? (tot ? act_ / tot : 0) : 1);
      const check = (pi, cnt, f, hits, label, a, out) => {
        let pen = 0;
        if (max != null) {
          const capN = Math.floor(max * f + 1e-9);
          if (cnt > capN) {
            pen += u * (cnt - capN); ctx.n2++;
            if (out) {
              const dates = hits.filter(X.inRange).map(X.iso);
              out.push(X.V(u * (cnt - capN), `${X.name(pi)}: ${cnt} ${codesTxt} ${label}, at most ${capN}`, { staffId: ctx.people[pi].id, date: dates[0] || X.iso(Math.max(a, ctx.lo)), dates }));
            }
          }
        }
        if (min != null) {
          const need = Math.ceil(min * f - 1e-9);
          if (cnt < need) {
            pen += u * (need - cnt); ctx.n2++;
            if (out) out.push(X.V(u * (need - cnt), `${X.name(pi)}: ${cnt} ${codesTxt} ${label}, needs ${need}`, { staffId: ctx.people[pi].id, date: X.iso(Math.min(Math.max(a, ctx.lo), ctx.hi)) }));
          }
        }
        return pen;
      };
      if (p.period === 'rolling') {
        const W = Math.max(1, num(p.window, 7));
        return {
          person(pi, out) {
            if (!inWho[pi]) return 0;
            const base = pi * n;
            let pen = 0;
            const s0 = Math.max(0, ctx.lo - W + 1), s1 = Math.min(ctx.hi, n - W);
            let prevBad = false;
            for (let s = s0; s <= s1; s++) {
              let cnt = 0, a_ = 0, tot = 0;
              const hits = out ? [] : null;
              for (let d = s; d < s + W; d++) {
                if (!ok[d]) continue; tot++;
                if (!act[base + d]) continue; a_++;
                if (m(base + d)) { cnt++; if (hits) hits.push(d); }
              }
              const before = ctx.n2;
              const pp = check(pi, cnt, factorOf(pi, a_, tot), hits || [], `in ${W} days from ${X.day(s)}`, s, prevBad ? null : out);
              // report one violation per run of overlapping bad windows (penalty still counts each window)
              if (prevBad && pp) ctx.n2 = before;
              prevBad = pp > 0;
              pen += pp;
            }
            return pen;
          },
        };
      }
      const periods = ctx.periods[p.period === 'week' ? 'week' : 'month'];
      return {
        person(pi, out) {
          if (!inWho[pi]) return 0;
          const base = pi * n;
          let pen = 0;
          for (const per of periods) {
            let cnt = 0, a_ = 0, tot = 0;
            const hits = out ? [] : null;
            for (let d = per.a; d <= per.b; d++) {
              if (!ok[d]) continue; tot++;
              if (!act[base + d]) continue; a_++;
              if (m(base + d)) { cnt++; if (hits) hits.push(d); }
            }
            if (!a_) continue;
            const label = p.period === 'week' ? `in the week of ${fmtDay(addDays(ctx.days[0], per.key))}` : `in ${fmtMonth(per.key)}`;
            pen += check(pi, cnt, factorOf(pi, a_, tot), hits || [], label, per.a, out);
          }
          return pen;
        },
      };
    },
  },

  // If a person has A on day d, then on d+from..d+to they must not / must have B.
  sequence: {
    label: 'Day-after rules', icon: '⏭️', scope: 'person',
    help: 'What may or must follow (or come before) a duty: gaps between calls, no call before leave.',
    example: 'After Call: no Call for the next 2 days',
    params: [
      P.codes('ifCodes', 'If someone has'),
      P.sel('mode', 'Then they', [['forbid', 'must not have'], ['require', 'must have']]),
      P.codes('thenCodes', 'Codes'),
      P.num('from', 'From day', { min: -14, max: 14, help: '1 = the next day, -1 = the day before' }),
      P.num('to', 'To day', { min: -14, max: 14 }),
    ],
    defaults: () => ({ ifCodes: [], thenCodes: [], mode: 'forbid', from: 1, to: 1 }),
    describe(r, T) {
      const p = r.params, a = num(p.from, 1), b = num(p.to, a);
      const no = p.mode === 'require' ? '' : 'no ';
      let off;
      if (a === 1 && b === 1) off = 'the next day';
      else if (a === 1 && b > 1) off = `for the next ${b} days`;
      else if (a === -1 && b === -1) off = 'the day before';
      else if (b === -1 && a < -1) off = `in the ${-a} days before`;
      else if (a === b) off = a > 0 ? `${a} days later` : a < 0 ? `${-a} days before` : 'the same day';
      else off = `from day ${a} to day ${b}`;
      const lead = a > 0 ? `After ${T.codes(p.ifCodes)}` : cap(T.codes(p.ifCodes));
      return withWhen(`${whoPrefix(r, T)}${whoPrefix(r, T) ? lead.toLowerCase() : lead}: ${no}${T.codes(p.thenCodes)} ${off}`, r, T);
    },
    validate(r) { return num(r.params.from, 1) > num(r.params.to, 1) ? ['From day is after To day'] : []; },
    compile(r, X) {
      const p = r.params, mi = X.codes(p.ifCodes), mt = X.codes(p.thenCodes);
      if (mi.empty || mt.empty) return null;
      const a = num(p.from, 1), b = num(p.to, a), forbid = p.mode !== 'require';
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, inWho = X.W.inWho;
      const d0 = Math.max(0, ctx.lo - Math.max(b, 0)), d1 = Math.min(n - 1, ctx.hi - Math.min(a, 0));
      return {
        person(pi, out) {
          if (!inWho[pi]) return 0;
          const base = pi * n;
          let pen = 0;
          for (let d = d0; d <= d1; d++) {
            if (!ok[d] || !act[base + d] || !mi(base + d)) continue;
            for (let k = a; k <= b; k++) {
              if (k === 0 && forbid) continue;
              const e = d + k;
              if (e < 0 || e >= n || !act[base + e]) continue;
              const dIn = d >= ctx.lo && d <= ctx.hi, eIn = e >= ctx.lo && e <= ctx.hi;
              if (!dIn && !eIn) continue;
              const hit = mt(base + e);
              if (forbid ? hit : !hit) {
                pen += u; ctx.n2++;
                if (out) {
                  const msg = forbid
                    ? `${X.name(pi)}: ${X.T.codes(p.ifCodes)} on ${X.day(d)}, then ${X.T.codes(p.thenCodes)} on ${X.day(e)}`
                    : `${X.name(pi)}: ${X.T.codes(p.ifCodes)} on ${X.day(d)} needs ${X.T.codes(p.thenCodes)} on ${X.day(e)}`;
                  out.push(X.V(u, msg, { staffId: ctx.people[pi].id, date: X.iso(dIn ? d : e), dates: [d, e].filter(X.inRange).map(X.iso) }));
                }
              }
            }
          }
          return pen;
        },
      };
    },
  },

  // A and B on the same day: forbidden, or A needs B.
  sameDay: {
    label: 'Same-day combinations', icon: '🚫', scope: 'person',
    help: 'Codes that can\'t go together on one day (leave and a shift), or one that needs another.',
    example: 'Never leave and any shift on the same day',
    params: [
      P.codes('codesA', 'Codes A'),
      P.sel('mode', 'Rule', [['forbid', 'can\'t be on the same day as'], ['require', 'needs on the same day']]),
      P.codes('codesB', 'Codes B'),
    ],
    defaults: () => ({ codesA: [], codesB: [], mode: 'forbid' }),
    describe(r, T) {
      const p = r.params;
      const s = p.mode === 'require'
        ? `${cap(T.codes(p.codesA))} only with ${T.codes(p.codesB)} on the same day`
        : `Never ${T.codes(p.codesA)} and ${T.codes(p.codesB)} on the same day`;
      return withWhen(whoPrefix(r, T) + (whoPrefix(r, T) ? s[0].toLowerCase() + s.slice(1) : s), r, T);
    },
    compile(r, X) {
      const p = r.params, mA = X.codes(p.codesA), mB = X.codes(p.codesB);
      if (mA.empty || mB.empty) return null;
      const forbid = p.mode !== 'require';
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, inWho = X.W.inWho;
      // two different codes of the day, one matching A and the other B (so "@shift + @shift" means two shifts)
      const pair = i => {
        const els = ctx.post[i] ? [...ctx.codes[i], ...ctx.req[i], 'x'] : [...ctx.codes[i], ...ctx.req[i]];
        const pres = (ctx.flags[i] & F.PRESENT) !== 0;
        const pa = mA.present && pres, pb = mB.present && pres;
        if (pa && pb) return ['at work', 'at work'];
        if (pa) { const c = els.find(mB.elem); return c ? ['at work', c] : null; }
        if (pb) { const c = els.find(mA.elem); return c ? [c, 'at work'] : null; }
        for (let x = 0; x < els.length; x++) {
          if (!mA.elem(els[x])) continue;
          for (let y = 0; y < els.length; y++) if (y !== x && mB.elem(els[y])) return [els[x], els[y]];
        }
        return null;
      };
      return {
        info: { mA, mB, forbid, ok, inWho },
        person(pi, out) {
          if (!inWho[pi]) return 0;
          const base = pi * n;
          let pen = 0;
          for (let d = ctx.lo; d <= ctx.hi; d++) {
            const i = base + d;
            if (!ok[d] || !act[i] || !mA(i)) continue;
            if (forbid) {
              if (!mB(i)) continue;
              const pr = pair(i);
              if (!pr) continue;
              pen += u; ctx.n2++;
              if (out) out.push(X.V(u, `${X.day(d)}: ${X.name(pi)} has ${X.T.code(pr[0])} and ${X.T.code(pr[1])}`, { staffId: ctx.people[pi].id, date: X.iso(d) }));
            } else if (!mB(i)) {
              pen += u; ctx.n2++;
              if (out) out.push(X.V(u, `${X.day(d)}: ${X.name(pi)} has ${X.T.codes(p.codesA)} without ${X.T.codes(p.codesB)}`, { staffId: ctx.people[pi].id, date: X.iso(d) }));
            }
          }
          return pen;
        },
      };
    },
  },

  // Between people on the same day: never together, or needs someone else on.
  together: {
    label: 'Pairing between people', icon: '🤝', scope: 'day',
    help: 'Who can\'t be on together (two Baby MOs), or who needs someone else on with them.',
    example: 'Baby MO on Call: at least 1 of senior residents or ACs on Call too',
    params: [
      P.codes('codes', 'When someone in "Who" has'),
      P.sel('mode', 'Then', [['needs', 'they need someone else'], ['never', 'nobody else may be']]),
      { key: 'other', label: 'Other people', kind: 'who' },
      P.codes('otherCodes', 'On'),
      P.num('min', 'How many others (needs)', { min: 1, optional: true }),
    ],
    defaults: () => ({ codes: [], other: blankWho(), otherCodes: [], mode: 'needs', min: 1 }),
    describe(r, T) {
      const p = r.params;
      const same = JSON.stringify({ ...blankWho(), ...(p.other || {}) }) === JSON.stringify({ ...blankWho(), ...(r.who || {}) });
      const other = same ? `another ${T.who(p.other)}` : T.who(p.other);
      const s = p.mode === 'never'
        ? `${cap(T.who(r.who))} on ${T.codes(p.codes)}: never with ${other} on ${T.codes(p.otherCodes)}`
        : `${cap(T.who(r.who))} on ${T.codes(p.codes)}: at least ${num(p.min, 1)} of ${other} on ${T.codes(p.otherCodes)} too`;
      return withWhen(s, r, T);
    },
    validate(r) { return r.params.mode === 'needs' && !(num(r.params.min, 1) >= 1) ? ['How many others must be 1 or more'] : []; },
    compile(r, X) {
      const p = r.params, m = X.codes(p.codes), mo = X.codes(p.otherCodes);
      if (m.empty || mo.empty) return null;
      const O = X.who(p.other);
      const min = num(p.min, 1), never = p.mode === 'never';
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, list = X.W.list, inS = X.W.inWho;
      const S = [], Os = [];
      return {
        day(d, out) {
          if (!ok[d]) return 0;
          S.length = 0;
          for (let k = 0; k < list.length; k++) { const i = list[k] * n + d; if (act[i] && m(i)) S.push(list[k]); }
          if (!S.length) return 0;
          Os.length = 0;
          for (let k = 0; k < O.list.length; k++) { const i = O.list[k] * n + d; if (act[i] && mo(i)) Os.push(O.list[k]); }
          let pen = 0;
          for (const s of S) {
            if (never) {
              // count each unordered pair once
              const bad = Os.filter(o => o !== s && !(inS[o] && O.inWho[s] && S.includes(o) && o < s));
              if (!bad.length) continue;
              pen += u * bad.length; ctx.n2++;
              if (out) out.push(X.V(u * bad.length, `${X.day(d)}: ${X.name(s)} (${X.T.codes(p.codes)}) with ${bad.map(X.name).join(', ')} (${X.T.codes(p.otherCodes)})`, { date: X.iso(d), staffId: ctx.people[s].id, staffIds: [s, ...bad].map(i => ctx.people[i].id) }));
            } else {
              const cnt = Os.length - (Os.includes(s) ? 1 : 0);
              if (cnt >= min) continue;
              pen += u * (min - cnt); ctx.n2++;
              if (out) out.push(X.V(u * (min - cnt), `${X.day(d)}: ${X.name(s)} on ${X.T.codes(p.codes)} needs ${min === 1 ? 'someone' : min} from ${X.T.who(p.other)} on ${X.T.codes(p.otherCodes)}`, { date: X.iso(d), staffId: ctx.people[s].id }));
            }
          }
          return pen;
        },
      };
    },
  },

  // No more than max consecutive days with codes.
  maxRun: {
    label: 'Consecutive days', icon: '📅', scope: 'person',
    help: 'The longest run of days in a row someone may have a duty.',
    example: 'Everyone: at most 5 days in a row of any shift',
    params: [P.codes('codes', 'Codes'), P.num('max', 'At most days in a row', { min: 1 })],
    defaults: () => ({ codes: [], max: 5 }),
    describe(r, T) { return withWhen(`${cap(T.who(r.who))}: at most ${num(r.params.max, 5)} days in a row of ${T.codes(r.params.codes)}`, r, T); },
    validate(r) { return !(num(r.params.max, 0) >= 1) ? ['At most must be 1 or more'] : []; },
    compile(r, X) {
      const m = X.codes(r.params.codes);
      if (m.empty) return null;
      const max = Math.max(1, num(r.params.max, 5));
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, inWho = X.W.inWho;
      return {
        person(pi, out) {
          if (!inWho[pi]) return 0;
          const base = pi * n;
          let pen = 0, run = 0;
          for (let d = 0; d <= n; d++) {
            const hit = d < n && ok[d] && act[base + d] && m(base + d);
            if (hit) { run++; continue; }
            if (run > max) {
              const a = d - run, b = d - 1;
              if (b >= ctx.lo && a <= ctx.hi) {
                pen += u * (run - max); ctx.n2++;
                if (out) {
                  const dates = []; for (let k = Math.max(a, ctx.lo); k <= Math.min(b, ctx.hi); k++) dates.push(X.iso(k));
                  out.push(X.V(u * (run - max), `${X.name(pi)}: ${run} days in a row of ${X.T.codes(r.params.codes)} from ${X.day(a)}, at most ${max}`, { staffId: ctx.people[pi].id, date: dates[0], dates }));
                }
              }
            }
            run = 0;
          }
          return pen;
        },
      };
    },
  },

  // Someone with request R on d wants / doesn't want codes on d (or that weekend).
  requests: {
    label: 'Honour requests', icon: '🙋', scope: 'person',
    help: 'Give people what they asked for (Cr, Pr, Wr) and keep them off what they asked not to do (Nc, NP, Nw).',
    example: 'No call (Nc): no Call that day',
    params: [
      { key: 'request', label: 'Request', kind: 'code' },
      P.sel('mode', 'They', [['want', 'want'], ['avoid', 'don\'t want']]),
      P.codes('codes', 'Codes'),
      P.sel('span', 'On', [['day', 'that day'], ['weekend', 'that weekend (Sat or Sun)']]),
    ],
    defaults: () => ({ request: 'Cr', codes: ['C'], mode: 'want', span: 'day' }),
    describe(r, T) {
      const p = r.params;
      const span = p.span === 'weekend' ? 'that weekend' : 'that day';
      const s = p.mode === 'avoid' ? `no ${T.codes(p.codes).replace(/^any /, '')} ${span}` : `give ${T.codes(p.codes)} ${span}`;
      return withWhen(`${whoPrefix(r, T)}${T.code(p.request)} (${p.request}): ${s}`, r, T);
    },
    validate(r, state) {
      const d = dutyMap(state).get(r.params.request);
      if (!r.params.request) return ['Choose the request code'];
      return d && d.kind !== 'request' ? [`${r.params.request} is not a request code`] : [];
    },
    compile(r, X) {
      const p = r.params, m = X.codes(p.codes), code = p.request;
      if (m.empty || !code) return null;
      const want = p.mode !== 'avoid', weekend = p.span === 'weekend';
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, inWho = X.W.inWho;
      const has = i => ctx.req[i].includes(code) || ctx.codes[i].includes(code);
      const reqTxt = `${X.T.code(code)} (${code})`;
      return {
        info: { m, code, want, weekend, ok, inWho },
        person(pi, out) {
          if (!inWho[pi]) return 0;
          const base = pi * n;
          let pen = 0, lastSat = -99;
          for (let d = ctx.lo; d <= ctx.hi; d++) {
            const i = base + d;
            if (!ok[d] || !act[i] || !has(i)) continue;
            if (!weekend) {
              const hit = m(i);
              if (want ? hit : !hit) continue;
              pen += u; ctx.n2++;
              if (out) out.push(X.V(u, want ? `${X.day(d)}: ${X.name(pi)} asked for ${X.T.codes(p.codes)} (${code})` : `${X.day(d)}: ${X.name(pi)} has ${X.T.codes(p.codes)} despite ${reqTxt}`, { staffId: ctx.people[pi].id, date: X.iso(d) }));
              continue;
            }
            const wd = ctx.wd[d];
            const sat = wd === 6 ? d : wd === 0 ? d - 1 : d + (6 - wd);
            if (sat === lastSat) continue;
            lastSat = sat;
            let hits = 0;
            const wk = [];
            for (const e of [sat, sat + 1]) if (e >= 0 && e < n && act[base + e]) { wk.push(e); if (m(base + e)) hits++; }
            if (!wk.length) continue;
            if (want && hits === 0) {
              pen += u; ctx.n2++;
              if (out) out.push(X.V(u, `Weekend of ${X.day(Math.max(sat, 0))}: ${X.name(pi)} asked for ${X.T.codes(p.codes)} (${code})`, { staffId: ctx.people[pi].id, date: X.iso(d), dates: wk.filter(X.inRange).map(X.iso) }));
            } else if (!want && hits > 0) {
              pen += u * hits; ctx.n2++;
              if (out) out.push(X.V(u * hits, `Weekend of ${X.day(Math.max(sat, 0))}: ${X.name(pi)} has ${X.T.codes(p.codes)} despite ${reqTxt}`, { staffId: ctx.people[pi].id, date: X.iso(d), dates: wk.filter(e => X.inRange(e) && m(base + e)).map(X.iso) }));
            }
          }
          return pen;
        },
      };
    },
  },

  // Penalty for people whose weighted count (per FTE) is far from the group average.
  spread: {
    label: 'Share fairly', icon: '⚖️', scope: 'global', soft_only: true,
    help: 'Spread a duty evenly: weekends and public holidays count extra. Always soft.',
    example: 'Share Call fairly among juniors (weekends x2, holidays x2)',
    params: [
      P.codes('codes', 'Duty'),
      P.sel('period', 'Over', [['month', 'Each month'], ['range', 'The dates checked']]),
      P.num('weekendWeight', 'Weekend counts as', { min: 0, max: 10 }),
      P.num('holidayWeight', 'Public holiday counts as', { min: 0, max: 10 }),
      P.num('tolerance', 'Allowed difference from average', { min: 0, max: 10 }),
    ],
    defaults: () => ({ codes: [], period: 'month', weekendWeight: 2, holidayWeight: 2, tolerance: 1 }),
    describe(r, T) {
      const p = r.params;
      return withWhen(`Share ${T.codes(p.codes)} fairly among ${T.who(r.who)} (weekends x${num(p.weekendWeight, 2)}, holidays x${num(p.holidayWeight, 2)})`, r, T);
    },
    compile(r, X) {
      const p = r.params, m = X.codes(p.codes);
      if (m.empty) return null;
      const ww = num(p.weekendWeight, 2), hw = num(p.holidayWeight, 2), tol = num(p.tolerance, 1);
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, list = X.W.list, inWho = X.W.inWho;
      const periods = p.period === 'range' ? ctx.periods.range : ctx.periods.month;
      const K = periods.length;
      const val = new Float64Array(ctx.P * K).fill(NaN);   // weighted count per FTE, NaN = not in this period
      const raw = new Float64Array(ctx.P * K);
      const wOf = d => (ctx.hol[d] ? hw : (ctx.wd[d] === 0 || ctx.wd[d] === 6) ? ww : 1);
      const touch = pi => {
        if (!inWho[pi]) return;
        const base = pi * n, fte = Number(ctx.people[pi].fte) > 0 ? Number(ctx.people[pi].fte) : 1;
        for (let k = 0; k < K; k++) {
          const per = periods[k];
          let sum = 0, a_ = 0, tot = 0;
          for (let d = per.a; d <= per.b; d++) {
            if (!ok[d]) continue; tot++;
            if (!act[base + d]) continue; a_++;
            if (m(base + d)) sum += wOf(d);
          }
          const frac = tot ? a_ / tot : 0;
          raw[pi * K + k] = sum;
          val[pi * K + k] = frac >= 0.25 ? sum / (fte * frac) : NaN;
        }
      };
      return {
        touch,
        init() { for (const pi of list) touch(pi); },
        global(out) {
          let pen = 0;
          for (let k = 0; k < K; k++) {
            let s = 0, c = 0;
            for (const pi of list) { const v = val[pi * K + k]; if (v === v) { s += v; c++; } }
            if (c < 2) continue;
            const mean = s / c;
            for (const pi of list) {
              const v = val[pi * K + k];
              if (v !== v) continue;
              const dev = Math.abs(v - mean) - tol;
              if (dev <= 1e-9) continue;
              const pp = Math.round(u * dev * 10) / 10;
              pen += pp; ctx.n2++;
              if (out) {
                const lab = p.period === 'range' ? 'in these dates' : `in ${fmtMonth(periods[k].key)}`;
                out.push(X.V(pp, `${X.name(pi)}: ${X.T.codes(p.codes)} share ${round1(v)} ${lab} (weighted), group average ${round1(mean)}`, { staffId: ctx.people[pi].id, date: X.iso(Math.max(periods[k].a, ctx.lo)) }));
              }
            }
          }
          return pen;
        },
      };
    },
  },

  // Only people in who may have codes.
  eligible: {
    label: 'Only these people', icon: '🎫', scope: 'person',
    help: 'Restrict a duty to some people (OT consultant: seniors only).',
    example: 'Only seniors may do OT consultant',
    params: [P.codes('codes', 'Duty')],
    defaults: () => ({ codes: [] }),
    describe(r, T) { return withWhen(`Only ${T.who(r.who)} may do ${T.codes(r.params.codes)}`, r, T); },
    compile(r, X) {
      const m = X.codes(r.params.codes);
      if (m.empty) return null;
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, inWho = X.W.inWho;
      return {
        info: { m, ok, inWho },
        person(pi, out) {
          if (inWho[pi]) return 0;
          const base = pi * n;
          let pen = 0;
          for (let d = ctx.lo; d <= ctx.hi; d++) {
            const i = base + d;
            if (!ok[d] || !act[i] || !m(i)) continue;
            pen += u; ctx.n2++;
            if (out) out.push(X.V(u, `${X.day(d)}: ${X.name(pi)} has ${X.T.codes(r.params.codes)}, only ${X.T.who(r.who)} may`, { staffId: ctx.people[pi].id, date: X.iso(d) }));
          }
          return pen;
        },
      };
    },
  },

  // Each person in who has codes every day in when (unless away).
  standing: {
    label: 'Standing duty', icon: '📌', scope: 'person',
    help: 'Someone always does a duty on certain days unless they are away (APS every weekday).',
    example: 'Pain (APS): Acute pain service every day (weekdays)',
    params: [P.codes('codes', 'Duty')],
    defaults: () => ({ codes: [] }),
    describe(r, T) { return withWhen(`${cap(T.who(r.who))}: ${T.codes(r.params.codes)} every day unless away`, r, T); },
    compile(r, X) {
      const m = X.codes(r.params.codes);
      if (m.empty) return null;
      const { ctx, u } = X, n = ctx.n, ok = X.when, act = ctx.act, inWho = X.W.inWho;
      return {
        person(pi, out) {
          if (!inWho[pi]) return 0;
          const base = pi * n;
          let pen = 0;
          for (let d = ctx.lo; d <= ctx.hi; d++) {
            const i = base + d;
            if (!ok[d] || !act[i] || (ctx.flags[i] & (F.LEAVE | F.OTHER | F.X)) || m(i)) continue;
            pen += u; ctx.n2++;
            if (out) out.push(X.V(u, `${X.day(d)}: ${X.name(pi)} has no ${X.T.codes(r.params.codes)}`, { staffId: ctx.people[pi].id, date: X.iso(d) }));
          }
          return pen;
        },
      };
    },
  },
};

const round1 = x => Math.round(x * 10) / 10;

// ---------- public API ----------

export function newRule(type, state) {
  const t = RULE_TYPES[type];
  if (!t) throw new Error(`Unknown rule type: ${type}`);
  const params = t.defaults();
  if (type === 'requests' && state) {
    const req = (state.duties || []).find(d => d.kind === 'request');
    if (req) params.request = req.code;
  }
  return {
    id: uid('r'), type, name: '', enabled: true, hard: !t.soft_only, weight: 10,
    who: blankWho(), when: { from: '', to: '', days: [], holidays: 'any' }, params, note: '',
  };
}

export function describeRule(rule, state) {
  const t = RULE_TYPES[rule && rule.type];
  if (!t) return `Unknown rule type "${rule && rule.type}"`;
  try { return t.describe(normalizeRule(rule), textKit(state)); } catch (e) { return t.label; }
}

export function validateRule(rule, state) {
  const out = [];
  const t = RULE_TYPES[rule && rule.type];
  if (!t) return [`Unknown rule type "${rule && rule.type}"`];
  const r = normalizeRule(rule);
  const dm = dutyMap(state);
  const known = c => dm.has(c) || c === 'x' || TOKENS.includes(c);
  for (const spec of t.params) {
    const v = r.params[spec.key];
    if (spec.kind === 'codes') {
      const list = Array.isArray(v) ? v : [];
      if (!list.length && !spec.optional) out.push(t.params.filter(s => s.kind === 'codes').length > 1 ? `No codes chosen for "${spec.label}"` : 'No codes chosen');
      for (const c of list) if (!known(c)) out.push(`Unknown code "${c}"`);
    } else if (spec.kind === 'code') {
      if (v && !known(v)) out.push(`Unknown code "${v}"`);
    } else if (spec.kind === 'number') {
      if (unset(v)) { if (!spec.optional) out.push(`Set "${spec.label}"`); continue; }
      const x = Number(v);
      if (spec.min != null && x < spec.min) out.push(`"${spec.label}" must be at least ${spec.min}`);
      if (spec.max != null && x > spec.max) out.push(`"${spec.label}" must be at most ${spec.max}`);
    } else if (spec.kind === 'select') {
      if (spec.options && !spec.options.some(([val]) => val === v)) out.push(`Choose "${spec.label}"`);
    }
  }
  if (!unset(r.params.min) && !unset(r.params.max) && Number(r.params.min) > Number(r.params.max)) out.push('At least is more than at most');
  if (r.when.from && r.when.to && r.when.from > r.when.to) out.push('Start date is after end date');
  if (!r.hard || t.soft_only) {
    const w = Number(r.weight);
    if (!(w >= 1 && w <= 100)) out.push('Weight must be 1 to 100');
  }
  const gids = new Set((state.groups || []).map(g => g.id)), tids = new Set((state.tags || []).map(g => g.id));
  for (const g of r.who.groups) if (!gids.has(g)) out.push(`Unknown group "${g}"`);
  for (const g of r.who.tags) if (!tids.has(g)) out.push(`Unknown tag "${g}"`);
  if (t.validate) out.push(...t.validate(r, state));
  return [...new Set(out)];
}

function rangeOf(opts) {
  let { from, to } = opts || {};
  if (!from && !to) {
    const d = new Date();
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const days = monthDays(m);
    from = days[0]; to = days[days.length - 1];
  }
  if (!from) from = to;
  if (!to) to = from;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

// Run one compiled rule over the whole range (violations into out when given). Returns { pen, n }.
export function runRule(ctx, cr, out) {
  ctx.n2 = 0;
  let pen = 0;
  if (cr.day) for (let d = ctx.lo; d <= ctx.hi; d++) pen += cr.day(d, out);
  if (cr.person) for (let p = 0; p < ctx.P; p++) pen += cr.person(p, out);
  if (cr.global) { if (cr.init) cr.init(); pen += cr.global(out); }
  return { pen, n: ctx.n2 };
}

function indexViolations(violations) {
  const byCell = new Map(), byDay = new Map(), byRule = new Map();
  const add = (map, k, v) => { const a = map.get(k); if (a) a.push(v); else map.set(k, [v]); };
  for (const v of violations) {
    add(byRule, v.ruleId, v);
    const dates = v.dates && v.dates.length ? v.dates : (v.date ? [v.date] : []);
    const ids = v.staffIds && v.staffIds.length ? v.staffIds : (v.staffId ? [v.staffId] : []);
    for (const d of dates) {
      add(byDay, d, v);
      for (const id of ids) add(byCell, `${d}|${id}`, v);
    }
  }
  return { byCell, byDay, byRule };
}

export function evaluate(state, opts = {}) {
  const range = rangeOf(opts);
  const ctx = buildContext(state, range);
  const rules = (opts.rules || state.rules || []).filter(r => r && r.enabled !== false);
  const compiled = compileRules(ctx, rules);
  const violations = [];
  let score = 0;
  for (const cr of compiled) score += runRule(ctx, cr, violations).pen;
  let hard = 0, soft = 0;
  for (const v of violations) if (v.hard) hard++; else soft++;
  return { violations, hard, soft, score: Math.round(score * 10) / 10, from: range.from, to: range.to, ...indexViolations(violations) };
}

// One rule, even when disabled (the builder's live "check now").
export function evaluateRule(state, rule, opts = {}) {
  const range = rangeOf(opts);
  const ctx = buildContext(state, range);
  const cr = compileRule(ctx, rule);
  if (!cr) return [];
  const out = [];
  runRule(ctx, cr, out);
  return out;
}
