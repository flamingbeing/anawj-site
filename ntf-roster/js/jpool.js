// NTF Roster: the junior pool. Who is on the call list (MO2 = the senior MO on call, MO1 = the junior MO on call,
// each strong or weak), the default junior rules, and the one-time install of them. Plain functions over plain data.
// The rules use the same rule types as every other rule (see rules.js); only tags and numbers are junior-specific.

export const MO2_TAGS = ['mo2', 'mo2strong', 'mo2weak'];
export const MO1_TAGS = ['mo1', 'mo1strong', 'mo1weak'];
export const CALL_TAGS = [...MO2_TAGS, ...MO1_TAGS];
export const POOL_TAGS = [...CALL_TAGS, 'nocall'];   // may take PM shifts (nocall: only as a last-resort half call)

export const LEVELS = [['', 'Not on the call list'], ['mo2', 'MO2 (senior MO on call)'], ['mo1', 'MO1 (junior MO on call)'], ['nocall', 'No calls']];
export const STRENGTHS = [['', 'Not set'], ['strong', 'Strong'], ['weak', 'Weak']];

export function levelOf(p) {
  const t = (p && p.tags) || [];
  if (t.some(x => MO2_TAGS.includes(x))) return 'mo2';
  if (t.some(x => MO1_TAGS.includes(x))) return 'mo1';
  return t.includes('nocall') ? 'nocall' : '';
}
export function strengthOf(p) {
  const t = (p && p.tags) || [];
  if (t.includes('mo2strong') || t.includes('mo1strong')) return 'strong';
  if (t.includes('mo2weak') || t.includes('mo1weak')) return 'weak';
  return '';
}
// The tag list for a level and a strength; other tags (Baby MO, pool tags...) are kept.
export function tagsFor(tags, level, strength) {
  const keep = (tags || []).filter(t => !POOL_TAGS.includes(t));
  if (level === 'mo2' || level === 'mo1') return [...keep, strength === 'strong' || strength === 'weak' ? level + strength : level];
  if (level === 'nocall') return [...keep, 'nocall'];
  return keep;
}

// ---------- the junior rules ----------

const TO_CONFIRM = 'Predicted from the drafted rules: confirm or change.';
const R = (id, type, name, params, o = {}) => ({
  id, type, name, enabled: true, hard: o.hard !== false, weight: o.weight ?? 10,
  who: { groups: [], tags: [], staff: [], exclude: [], ...(o.who || {}) },
  when: { from: '', to: '', days: [], holidays: 'any', ...(o.when || {}) },
  params, note: o.note || '',
});
const soft = (weight, more = {}) => ({ hard: false, weight, ...more });
const lim = (codes, max, extra = {}) => ({ codes, period: 'month', window: 7, min: null, max, fte: false, prorate: false, ...extra });
const oth = tags => ({ groups: [], tags, staff: [], exclude: [] });
const SUN_FRI = [0, 1, 2, 3, 4, 5];

export const JUNIOR_RULES = [
  // cover each day (rules.txt: weekdays 2 on call + a PM shift; Saturday 3; Sunday and public holidays 2 + a half call)
  R('r-jp-mo2', 'cover', 'One MO2 on call (Sunday to Friday)', { codes: ['C'], min: 1, max: 1 }, { who: { tags: MO2_TAGS }, when: { days: SUN_FRI } }),
  R('r-jp-mo2-sat', 'cover', 'At least one MO2 on call on Saturday', { codes: ['C'], min: 1, max: null }, { who: { tags: MO2_TAGS }, when: { days: [6] } }),
  R('r-jp-mo2-sat1', 'cover', 'Aim for one MO2 on Saturday, so the MO2s are not overloaded', { codes: ['C'], min: null, max: 1 }, soft(30, { who: { tags: MO2_TAGS }, when: { days: [6] } })),
  R('r-jp-mo1', 'cover', 'At least one MO1 on call every day', { codes: ['C'], min: 1, max: null }, { who: { tags: MO1_TAGS } }),
  R('r-jp-sat', 'cover', 'Three on call on Saturday', { codes: ['C'], min: 3, max: 3 }, { who: { tags: CALL_TAGS }, when: { days: [6] } }),
  R('r-jp-hc', 'cover', 'One half call on Sundays', { codes: ['HC'], min: 1, max: 1 }, { who: { tags: POOL_TAGS }, when: { days: [0] } }),
  R('r-jp-hc-ph', 'cover', 'One half call on public holidays', { codes: ['HC'], min: 1, max: 1 }, { who: { tags: POOL_TAGS }, when: { holidays: 'only' } }),
  // people who never call
  R('r-jp-nocall', 'limit', 'No calls for people marked No calls', lim(['C'], 0), { who: { tags: ['nocall'] } }),
  R('r-jp-nocall-hc', 'limit', 'No calls people: at most one half call a month', lim(['HC'], 1), { who: { tags: ['nocall'] } }),
  R('r-jp-nocall-hc0', 'limit', 'No calls people: a half call only if the day cannot be filled any other way', lim(['HC'], 0), soft(90, { who: { tags: ['nocall'] } })),
  // rest and spacing
  R('r-jp-pm-call', 'sequence', 'No call or half call the day after a PM shift (it ends at 9pm)', { ifCodes: ['P'], thenCodes: ['C', 'HC'], mode: 'forbid', from: 1, to: 1 }, { who: { tags: POOL_TAGS } }),
  R('r-jp-call-pm', 'sequence', 'No PM shift the day after a call', { ifCodes: ['C'], thenCodes: ['P'], mode: 'forbid', from: 1, to: 1 }, { who: { tags: POOL_TAGS } }),
  R('r-jp-jr', 'sameDay', 'Junior residency teaching: no call, PM or half call (away from 12pm)', { codesA: ['JR'], codesB: ['C', 'P', 'HC'], mode: 'forbid' }, { who: { tags: POOL_TAGS } }),
  // leave
  R('r-jp-al', 'cover', 'At most 3 juniors on annual leave at once (pointed out, leave is not moved)', { codes: ['AL', 'AAL'], min: null, max: 3 }, soft(50, { who: { tags: POOL_TAGS } })),
  // pain service week (APS): on duty all week, then the PM shift on the Monday
  R('r-jp-aps', 'sameDay', 'Pain service week: no call, PM or half call', { codesA: ['APS'], codesB: ['C', 'P', 'HC'], mode: 'forbid' }, { who: { tags: POOL_TAGS } }),
  R('r-jp-aps-mon', 'sequence', 'The Monday PM shift after the pain service week goes to the person who just finished it', { ifCodes: ['APS'], thenCodes: ['P'], mode: 'require', from: 1, to: 1 }, { who: { tags: POOL_TAGS }, when: { days: [0] } }),
  // strong and weak: a weak MO2 is never on call with a weak MO1; two strong ones waste manpower
  R('r-jp-weak', 'together', 'A weak MO2 never on call with a weak MO1', { codes: ['C'], other: oth(['mo1weak']), otherCodes: ['C'], mode: 'never', min: 1 }, { who: { tags: ['mo2weak'] } }),
  R('r-jp-strong', 'together', 'Avoid a strong MO2 with a strong MO1 (waste of manpower)', { codes: ['C'], other: oth(['mo1strong']), otherCodes: ['C'], mode: 'never', min: 1 }, soft(15, { who: { tags: ['mo2strong'] } })),
  // numbers the drafted rules assumed: confirm or change
  R('r-jp-gap', 'sequence', 'At least 3 days between calls (counting last month)', { ifCodes: ['C'], thenCodes: ['C'], mode: 'forbid', from: 1, to: 2 }, { who: { tags: CALL_TAGS }, note: TO_CONFIRM }),
  R('r-jp-wkend', 'limit', 'At most 2 weekend duties (calls and half calls) a month', lim(['C', 'HC'], 2), soft(60, { who: { tags: POOL_TAGS }, when: { days: [0, 6] }, note: TO_CONFIRM })),
  R('r-jp-aps-pre', 'sequence', 'No call the day before the pain service week starts', { ifCodes: ['C'], thenCodes: ['APS'], mode: 'forbid', from: 1, to: 1 }, { who: { tags: POOL_TAGS }, note: TO_CONFIRM }),
  R('r-jp-fair2', 'spread', 'Share MO2 calls fairly', { codes: ['C'], period: 'month', weekendWeight: 2, holidayWeight: 2, tolerance: 1 }, soft(10, { who: { tags: MO2_TAGS }, note: TO_CONFIRM })),
  R('r-jp-fair1', 'spread', 'Share MO1 calls fairly', { codes: ['C'], period: 'month', weekendWeight: 2, holidayWeight: 2, tolerance: 1 }, soft(10, { who: { tags: MO1_TAGS }, note: TO_CONFIRM })),
  R('r-jp-nc-hc', 'requests', 'A no call request also means no half call that day', { request: 'Nc', codes: ['HC'], mode: 'avoid', span: 'day' }, { who: { tags: POOL_TAGS }, note: TO_CONFIRM }),
  R('r-jp-nc-pm', 'requests', 'A no call request also means no PM shift that day', { request: 'Nc', codes: ['P'], mode: 'avoid', span: 'day' }, { who: { tags: POOL_TAGS }, note: TO_CONFIRM }),
];

const clone = o => JSON.parse(JSON.stringify(o));
const SWITCHED = ['r-phd'];   // the drafted rules use half calls on public holidays instead

// One-time install into a state draft: the junior rules are added (never over a rule the owner already has), and
// the department-wide call rules that name sections are pointed at the call list tags instead. Returns how many were added.
export function installJuniorPool(draft) {
  if (!draft.settings) draft.settings = {};
  if (!Array.isArray(draft.rules)) draft.rules = [];
  if (!Array.isArray(draft.rulesLog)) draft.rulesLog = [];
  let n = 0;
  const have = new Set(draft.rules.map(r => r.id));
  for (const r of JUNIOR_RULES) {
    if (have.has(r.id)) continue;
    draft.rules.push(clone(r));
    draft.rulesLog.push({ at: new Date().toISOString(), by: '', action: 'add', ruleId: r.id, name: r.name });
    n++;
  }
  if (!draft.settings.jpRules) {
    const set = (id, fn) => { const r = draft.rules.find(x => x.id === id); if (r) fn(r); };
    set('r-jcall', r => { r.who = { groups: [], tags: [...CALL_TAGS], staff: [], exclude: [] }; r.when = { ...(r.when || {}), days: SUN_FRI }; r.name = 'Two on call (Sunday to Friday)'; });
    set('r-maxcall', r => { r.who = { groups: [], tags: [...CALL_TAGS], staff: [], exclude: [] }; });
    set('r-pm', r => { r.who = { groups: [], tags: [...POOL_TAGS], staff: [], exclude: [] }; });
    set('r-fair-j', r => { r.enabled = false; });
    for (const id of SWITCHED) set(id, r => { r.enabled = false; });
    draft.settings.jpRules = 1;
  }
  return n;
}

// Is the pool set up well enough to fill? Lists what is missing, for the setup screen.
export function poolProblems(state, staff) {
  const out = [];
  const lv = l => staff.filter(p => levelOf(p) === l).length;
  if (!lv('mo2')) out.push('Nobody is MO2 yet.');
  if (!lv('mo1')) out.push('Nobody is MO1 yet.');
  const unrated = staff.filter(p => ['mo2', 'mo1'].includes(levelOf(p)) && !strengthOf(p)).length;
  if (unrated) out.push(`${unrated} on the call list ${unrated === 1 ? 'has' : 'have'} no strong or weak mark (the pairing rules skip them).`);
  return out;
}

// ---------- pool views ----------

// Does this person match a rule's `who`? (the same test the rules use, for working out which rules a pool can fill)
function whoHas(who, p) {
  const w = { groups: [], tags: [], staff: [], exclude: [], ...(who || {}) };
  if (w.exclude.includes(p.id)) return false;
  if (!w.groups.length && !w.tags.length && !w.staff.length) return true;
  return w.groups.includes(p.group) || w.staff.includes(p.id) || (p.tags || []).some(t => w.tags.includes(t));
}

// A copy of the state for checking or auto-filling one pool: the other pool's people are left out, and a rule that
// is only about them (the consultants' call, say) is switched off, so it is not reported as a gap or filled.
// 'all' (or anything else) returns the state itself. The copy is read-only: never commit it.
export function scopeToPool(state, pool, poolOf) {
  if (pool !== 'junior' && pool !== 'senior') return state;
  const staff = (state.staff || []).filter(p => poolOf(state, p) === pool);
  const rules = (state.rules || []).map(r => {
    if (r.enabled === false) return r;
    const t = r.type;
    const aboutWho = [r.who];
    if (t === 'together') aboutWho.push(r.params && r.params.other);
    const gone = aboutWho.some(w => w && (state.staff || []).some(p => whoHas(w, p)) && !staff.some(p => whoHas(w, p)));
    return gone ? { ...r, enabled: false } : r;
  });
  return { ...state, staff, rules };
}
