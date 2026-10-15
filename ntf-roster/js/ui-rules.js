// NTF Roster: the Rules screen. The owner adds and changes rules here at any time, so the screen is built for speed:
// a searchable list of rule cards (hard rules first), '+ Add rule' with quick templates, and one rule builder that is
// generated from RULE_TYPES (rules.js). A new rule type added there shows up here with no change to this file.
// Also: the rules log (who changed what, newest first) and rules-only JSON export / import with a review step.
// A few small helpers at the bottom are exported for the People and Check screens (same author, same styles).
// Looks: the NTF app kit (grouped rows, chips, segmented controls, switches, sheets); line icons, never emoji.

import * as M from './model.js';
import { RULE_TYPES, describeRule, validateRule, evaluateRule, newRule } from './rules.js';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_TINY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const TOKEN_LABELS = [
  ['@shift', 'Any shift'], ['@leave', 'Any leave'], ['@away', 'Away'], ['@present', 'At work'],
  ['x', 'Post call'], ['@other', 'Other duty'], ['@request', 'Any request'], ['@any', 'Anything'],
];
const TOKEN_HELP = {
  '@away': 'On leave, at another posting or post call', '@present': 'Has a shift, or a normal weekday and not away',
  x: 'The day after an overnight shift', '@any': 'Any code at all',
};
const KIND_LABEL = { shift: 'Shifts', leave: 'Leave', request: 'Requests', other: 'Other', derived: 'Worked out' };
const LOG_WORDS = { add: 'Added', edit: 'Changed', delete: 'Deleted', enable: 'Turned on', disable: 'Turned off' };

// Line icons for the rule types and templates (the kit's 24 px line style). RULE_TYPES.icon (an emoji) isn't shown:
// the design language has no emoji. A new rule type without an entry here gets the generic one.
const ICON_PATHS = {
  cover: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  limit: '<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>',
  sequence: '<path d="M4 7l5 5-5 5M12 7l5 5-5 5"/>',
  sameDay: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9.5 12.5l5 5M14.5 12.5l-5 5"/>',
  together: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5M13 14.6c.9-.1 2-.1 3 0 2.9.3 4.9 1.8 5.5 4.4"/>',
  maxRun: '<rect x="2.5" y="9" width="5" height="6" rx="1"/><rect x="9.5" y="9" width="5" height="6" rx="1"/><rect x="16.5" y="9" width="5" height="6" rx="1"/>',
  requests: '<path d="M4 5h16v11H10l-5 4v-4H4z"/><path d="M8 10h8"/>',
  spread: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 6.5a3 3 0 006 0zM19 7l-3 6.5a3 3 0 006 0z"/>',
  eligible: '<circle cx="10" cy="8" r="4"/><path d="M3 21c.7-3.8 3.4-6 7-6"/><path d="M14.5 17.5l2 2 4.5-4.5"/>',
  standing: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
  leave: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3M4 12h16"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>',
  day: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  rule: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
};
export function ruleIcon(name) {
  return `<svg class="ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ICON_PATHS.rule}</svg>`;
}

// Params shown only when they matter (a ParamSpec.showIf in rules.js, if one is ever added, wins).
const SHOW_IF = {
  'limit.window': p => p.period === 'rolling',
  'together.min': p => p.mode === 'needs',
};

// Common restrictions, pre-filled. Each makes a fresh rule the owner checks and saves.
const W = (o = {}) => ({ groups: [], tags: [], staff: [], exclude: [], ...o });
const WHEN = (o = {}) => ({ from: '', to: '', days: [], holidays: 'any', ...o });
const kindIds = (state, k) => (state.groups || []).filter(g => g.kind === k).map(g => g.id);
const TEMPLATES = [
  { id: 'preleave', icon: 'leave', label: 'No call the night before leave', sub: 'After Call, no leave the next day (soft)',
    make: s => ({ type: 'sequence', name: 'No call the night before leave', hard: false, weight: 10, params: { ifCodes: ['C'], thenCodes: ['@leave'], mode: 'forbid', from: 1, to: 1 } }) },
  { id: 'pair', icon: 'together', label: 'Two people never on call together', sub: 'Pick the two people in Who and Other people',
    pick: 'Choose one person under Who and the other under Other people.',
    make: s => ({ type: 'together', name: '', hard: true, params: { codes: ['C'], other: W(), otherCodes: ['C'], mode: 'never', min: 1 } }) },
  { id: 'maxcalls', icon: 'limit', label: 'At most N calls a month', sub: 'Per person, scaled by FTE',
    make: s => ({ type: 'limit', name: '', hard: true, params: { codes: ['C'], period: 'month', window: 7, min: null, max: 6, fte: true, prorate: false } }) },
  { id: 'gap', icon: 'sequence', label: 'At least N days between calls', sub: 'After Call, no Call for the next 2 days = 3 days apart',
    make: s => ({ type: 'sequence', name: 'At least 3 days between calls', hard: false, weight: 20, params: { ifCodes: ['C'], thenCodes: ['C'], mode: 'forbid', from: 1, to: 2 } }) },
  { id: 'wkpair', icon: 'day', label: 'Weekend calls together (Sat + Sun)', sub: 'Saturday call means Sunday call too',
    make: s => ({ type: 'sequence', name: 'Saturday call means Sunday call too', hard: false, weight: 20, when: WHEN({ days: [6] }), params: { ifCodes: ['C'], thenCodes: ['C'], mode: 'require', from: 1, to: 1 } }) },
  { id: 'noday', icon: 'sameDay', label: 'Someone can\'t work on a weekday', sub: 'No shifts on Fridays for one person',
    pick: 'Choose the person under Who and the weekday under When.',
    make: s => ({ type: 'limit', name: '', hard: true, when: WHEN({ days: [5] }), params: { codes: ['@shift'], period: 'week', window: 7, min: null, max: 0, fte: false, prorate: false } }) },
  { id: 'baby', icon: 'person', label: 'Baby MO on call needs a senior', sub: 'A senior resident, RP or AC on call too',
    make: s => ({ type: 'together', name: 'A Baby MO on call needs a senior on call', hard: true, who: W({ tags: (s.tags || []).some(t => t.id === 'babymo') ? ['babymo'] : [] }),
      params: { codes: ['C'], other: W({ groups: ['sr', 'srp', 'rp', 'ac'].filter(id => (s.groups || []).some(g => g.id === id)) }), otherCodes: ['C'], mode: 'needs', min: 1 } }) },
  { id: 'seniors', icon: 'cover', label: 'Minimum seniors at work each weekday', sub: 'Counts seniors who are at work (@present)',
    make: s => ({ type: 'cover', name: '', hard: true, who: W({ groups: kindIds(s, 'senior') }), when: WHEN({ days: [1, 2, 3, 4, 5], holidays: 'exclude' }), params: { codes: ['@present'], min: 8, max: null } }) },
  { id: 'request', icon: 'requests', label: 'Honour a new request code', sub: 'Add the code under People > Duty codes first',
    make: s => ({ type: 'requests', name: '', hard: false, weight: 10, params: { request: ((s.duties || []).filter(d => d.kind === 'request').pop() || { code: '' }).code, codes: ['C'], mode: 'avoid', span: 'day' } }) },
  { id: 'run', icon: 'maxRun', label: 'At most N days in a row', sub: 'Of any shift',
    make: s => ({ type: 'maxRun', name: '', hard: false, weight: 20, params: { codes: ['@shift'], max: 5 } }) },
];

// "Combination restriction" (the owner's words): which kind, then common ones ready-made. First in Add a rule.
const COMBO_KINDS = [
  { type: 'sameDay', icon: 'sameDay', label: 'On the same day', sub: 'Two codes that can\'t go together on one day (Call and Clinic), or one that needs another' },
  { type: 'sequence', icon: 'sequence', label: 'On following days', sub: 'What may not (or must) come the day after, or the day before (no call before leave)' },
  { type: 'together', icon: 'together', label: 'Between two people', sub: 'Two people never on together, or someone who needs another person on with them' },
];
const has = (s, c) => (s.duties || []).some(d => d.code === c);
const COMBO_TEMPLATES = [
  { icon: 'sameDay', label: 'No clinic on a call day', sub: 'Call and Clinic never on the same day', ok: s => has(s, 'C') && has(s, 'Clinic'),
    make: () => ({ type: 'sameDay', name: 'No clinic on a call day', hard: true, params: { codesA: ['C'], codesB: ['Clinic'], mode: 'forbid' } }) },
  { icon: 'sameDay', label: 'No PM shift on a call day', sub: 'Call and PM shift never on the same day', ok: s => has(s, 'C') && has(s, 'P'),
    make: () => ({ type: 'sameDay', name: 'No PM shift on a call day', hard: true, params: { codesA: ['C'], codesB: ['P'], mode: 'forbid' } }) },
  { icon: 'sequence', label: 'No call the day before…', sub: 'Pick the code under Codes (a clinic, a course, leave)', ok: s => has(s, 'C'),
    pick: 'Choose the code that must not follow a call under Codes.',
    make: () => ({ type: 'sequence', name: '', hard: true, params: { ifCodes: ['C'], thenCodes: [], mode: 'forbid', from: 1, to: 1 } }) },
];

let nid = 0;
const fid = p => `${p}-${++nid}`;

export function mount(el, app) {
  const { h } = app;
  let q = '';
  let filter = 'all';

  const root = h('div', { class: 'rv' });
  const head = h('div', { class: 'bx-head' },
    h('p', { class: 'bx-sub' }, 'Hard rules must hold; preferences are weighed. Every change is checked straight away and can be undone.'),
    h('button', { type: 'button', class: 'app-btn app-btn--primary rv-add', onclick: () => openPicker(), html: `${app.icon('plus')}<span>Add rule</span>` }));
  const search = h('input', { type: 'search', class: 'app-input bx-search', placeholder: 'Search rules', 'aria-label': 'Search rules',
    oninput: () => { q = search.value.trim().toLowerCase(); renderList(); } });
  // filters: the kit's chips (one row that scrolls sideways), one of them on
  const filters = chipFilter(h, {
    label: 'Show', value: filter,
    options: [['all', 'All'], ['hard', 'Must hold'], ['soft', 'Preferences'], ['bad', 'Problems'], ['off', 'Off']],
    onChange: v => { filter = v; renderList(); },
  });
  const tools = h('div', { class: 'rv-tools' },
    h('button', { type: 'button', class: 'app-btn app-btn--plain app-btn--compact', onclick: () => openLog(), html: `${app.icon('list')}<span>Rules log</span>` }),
    h('button', { type: 'button', class: 'app-btn app-btn--plain app-btn--compact', onclick: () => exportRules(), html: `${dlIcon()}<span>Export</span>` }),
    h('button', { type: 'button', class: 'app-btn app-btn--plain app-btn--compact', onclick: () => importRules(), html: `${app.icon('upload')}<span>Import</span>` }));
  const bar = h('div', { class: 'rv-bar' }, h('div', { class: 'rv-search' }, h('span', { class: 'bx-search-ic', html: app.icon('search') }), search), filters, tools);
  const list = h('div', { class: 'rv-list' });
  root.append(head, bar, list);
  el.append(root);

  // ---------- list ----------
  function renderList() {
    const state = app.store.get();
    const ev = app.evaluation();
    list.innerHTML = '';
    const rules = state.rules || [];
    const count = r => (r.enabled === false ? 0 : ((ev.byRule && ev.byRule.get(r.id)) || []).length);
    const shown = rules.filter(r => {
      const t = RULE_TYPES[r.type];
      const hard = r.hard && !(t && t.soft_only);
      if (filter === 'hard' && !hard) return false;
      if (filter === 'soft' && hard) return false;
      if (filter === 'off' && r.enabled !== false) return false;
      if (filter === 'bad' && !count(r)) return false;
      if (!q) return true;
      const hay = [r.name, describeRule(r, state), t && t.label, r.note, JSON.stringify(r.params || {})].join(' ').toLowerCase();
      return hay.includes(q);
    });
    if (!rules.length) {
      list.append(h('div', { class: 'app-card app-empty' }, h('span', { class: 'app-empty-icon', html: ruleIcon('rule') }),
        h('p', { class: 'app-empty-title' }, 'No rules yet'), h('p', { class: 'app-empty-text' }, 'Add one, or start from a quick template.'),
        h('button', { type: 'button', class: 'app-btn app-btn--secondary', onclick: () => openPicker() }, 'Add a rule')));
      return;
    }
    if (!shown.length) {
      list.append(h('p', { class: 'bx-none' }, 'No rules match. ', h('button', { type: 'button', class: 'linkish', onclick: () => { q = ''; search.value = ''; filter = 'all'; filters.set('all'); renderList(); } }, 'Show all rules')));
      return;
    }
    const isHard = r => r.hard && !(RULE_TYPES[r.type] && RULE_TYPES[r.type].soft_only);
    const groups = [
      ['Must hold', 'Hard rules: auto-fill never breaks them if it can help it.', shown.filter(isHard)],
      ['Preferences', 'Soft rules: weighed against each other; a higher weight matters more.', shown.filter(r => !isHard(r))],
    ];
    for (const [title, sub, rs] of groups) {
      if (!rs.length) continue;
      const sec = h('section', { class: 'app-section rv-sec', 'aria-label': title },
        h('h3', { class: 'app-section-header' }, title, h('span', { class: 'bx-count' }, String(rs.length))));
      const ul = h('ul', { class: 'app-list rv-cards' });
      for (const r of rs) ul.append(h('li', null, ruleCard(r, state, count(r))));
      sec.append(ul, h('p', { class: 'app-section-footer' }, sub));
      list.append(sec);
    }
  }

  function ruleCard(r, state, n) {
    const t = RULE_TYPES[r.type];
    const off = r.enabled === false;
    const hard = r.hard && !(t && t.soft_only);
    const sentence = describeRule(r, state);
    const title = r.name || sentence;
    const meta = [whoText(r.who, state), whenText(r.when)].filter(Boolean).join(' · ');
    // the rule on or off: the kit's switch at the end of the row
    const sw = h('input', { type: 'checkbox', class: 'app-switch rv-sw', role: 'switch', checked: !off, 'aria-label': `Rule on: ${title}`, title: off ? 'Turn on' : 'Turn off', onchange: () => toggleRule(r.id, sw.checked) });
    let countEl;
    if (off) countEl = h('span', { class: 'app-badge app-badge--ink' }, 'Off');
    else if (!t) countEl = h('span', { class: 'app-badge app-badge--bad' }, 'Unknown type');
    else if (n) countEl = h('button', { type: 'button', class: `app-badge app-badge--${hard ? 'bad' : 'warn'} rv-n`, title: 'See them in Check', onclick: () => app.go('check', { rule: r.id }) }, `${n} ${n === 1 ? 'problem' : 'problems'}`);
    else countEl = h('span', { class: 'app-badge app-badge--ok' }, 'OK', h('span', { class: 'rv-long' }, '\u00a0this month'));
    // a grouped row: the title button covers the whole row (tap anywhere to open it; Copy and Delete are in there);
    // the switch (in a 44 px tap area) and the problems badge sit above it
    return h('article', { class: `app-row rv-card ${hard ? 'is-hard' : 'is-soft'}${off ? ' is-off' : ''}`, 'data-rule': r.id },
      h('span', { class: 'app-row-icon', html: ruleIcon(r.type) }),
      h('div', { class: 'rv-main' },
        h('h4', { class: 'rv-title' }, h('button', { type: 'button', class: 'rv-open', onclick: () => openBuilder(r) }, title)),
        r.name ? h('p', { class: 'rv-sent' }, sentence) : null,
        h('p', { class: 'rv-meta' },
          h('span', { class: `rv-strength ${hard ? 'hard' : 'soft'}` }, hard ? 'Must hold' : `Preference · ${clampW(r.weight)}`),
          t ? h('span', { class: 'rv-type' }, t.label) : null,
          meta ? h('span', { class: 'rv-who' }, meta) : null),
        r.note ? h('p', { class: 'rv-note' }, r.note) : null,
        h('div', { class: 'rv-acts' }, countEl)),
      h('label', { class: 'rv-swl' }, sw));
  }

  // ---------- changes ----------
  function log(d, action, rule) {
    if (!Array.isArray(d.rulesLog)) d.rulesLog = [];
    d.rulesLog.push({ at: new Date().toISOString(), by: (app.user && app.user.email) || '', action, ruleId: rule.id, name: rule.name || describeRule(rule, d) });
    if (d.rulesLog.length > 200) d.rulesLog.splice(0, d.rulesLog.length - 200);
  }
  const undoAct = { label: 'Undo', fn: () => app.store.undo() };

  function toggleRule(id, on) {
    app.store.commit(on ? 'Turn rule on' : 'Turn rule off', d => {
      const r = d.rules.find(x => x.id === id);
      if (!r) return false;
      r.enabled = on;
      log(d, on ? 'enable' : 'disable', r);
    });
    app.toast(on ? 'Rule on' : 'Rule off', { action: undoAct, ms: 3000 });
  }

  async function removeRule(r) {
    const name = r.name || describeRule(r, app.store.get());
    if (!(await app.confirm(`Delete the rule "${name}"? Undo brings it back. To pause it instead, switch it off.`, { ok: 'Delete', danger: true }))) return false;
    app.store.commit('Delete rule', d => {
      const i = d.rules.findIndex(x => x.id === r.id);
      if (i < 0) return false;
      d.rules.splice(i, 1);
      log(d, 'delete', r);
    });
    app.toast(`Deleted: ${name}`, { action: undoAct });
  }

  function duplicate(r) {
    const copy = structuredClone(r);
    copy.id = M.uid('r');
    if (copy.name) copy.name = `${copy.name} (copy)`;
    openBuilder(copy, { isNew: true, after: r.id, title: 'Copy of a rule' });
  }

  function saveRule(rule, isNew, after) {
    app.store.commit(isNew ? 'Add rule' : 'Edit rule', d => {
      const i = d.rules.findIndex(x => x.id === rule.id);
      if (i >= 0) d.rules[i] = rule;
      else {
        const j = after ? d.rules.findIndex(x => x.id === after) : -1;
        if (j >= 0) d.rules.splice(j + 1, 0, rule); else d.rules.push(rule);
      }
      log(d, isNew ? 'add' : 'edit', rule);
    });
    const n = rule.enabled === false ? 0 : ((app.evaluation().byRule || new Map()).get(rule.id) || []).length;
    app.toast(`${isNew ? 'Rule added' : 'Rule saved'}${rule.enabled === false ? ' (off)' : n ? `: ${n} ${n === 1 ? 'problem' : 'problems'} this month` : ': no problems this month'}`,
      { action: undoAct, kind: n && rule.hard ? 'warn' : 'ok' });
    requestAnimationFrame(() => {
      const card = list.querySelector(`[data-rule="${CSS.escape(rule.id)}"]`);
      if (card) { card.scrollIntoView({ block: 'nearest' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1600); }
    });
  }

  // ---------- add: type picker + quick templates ----------
  function openPicker() {
    const state = app.store.get();
    let close;
    const pick = rule => { close(); openBuilder(rule, { isNew: true }); };
    // each choice is one of the kit's rows: an icon tile, the label and a line of help
    const choice = (cls, ic, label, sub, onclick, example) => h('li', null, h('button', { type: 'button', class: `app-row ${cls}`, onclick },
      h('span', { class: 'app-row-icon', html: ruleIcon(ic) }),
      h('span', { class: 'app-row-body' }, h('span', { class: 'app-row-title' }, label), h('span', { class: 'app-row-sub' }, sub),
        example ? h('span', { class: 'app-row-sub rp-eg' }, `e.g. ${example}`) : null),
      h('span', { class: 'app-row-chevron', 'aria-hidden': 'true' })));
    const tpl = h('ul', { class: 'app-list rp-tpls' }, TEMPLATES.map(tp => choice('rp-tpl', tp.icon, tp.label, tp.sub, () => {
      const base = newRule(tp.make(state).type, state);
      const made = tp.make(state);
      const rule = { ...base, ...made, who: { ...base.who, ...(made.who || {}) }, when: { ...base.when, ...(made.when || {}) }, params: { ...base.params, ...made.params } };
      close(); openBuilder(rule, { isNew: true, hint: tp.pick });
    })));
    const fromTemplate = (tp, made) => {
      const base = newRule(made.type, state);
      const rule = { ...base, ...made, who: { ...base.who, ...(made.who || {}) }, when: { ...base.when, ...(made.when || {}) }, params: { ...base.params, ...made.params } };
      close(); openBuilder(rule, { isNew: true, hint: tp.pick });
    };
    const combo = h('ul', { class: 'app-list rp-tpls rp-combo' },
      COMBO_KINDS.filter(k => RULE_TYPES[k.type]).map(k => choice('rp-tpl', k.icon, k.label, k.sub, () => pick(newRule(k.type, state)))),
      COMBO_TEMPLATES.filter(tp => tp.ok(state)).map(tp => choice('rp-tpl', tp.icon, tp.label, tp.sub, () => fromTemplate(tp, tp.make(state)))));
    const types = h('ul', { class: 'app-list rp-types' }, Object.entries(RULE_TYPES).map(([type, t]) =>
      choice('rp-type', type, t.label, t.help, () => pick(newRule(type, state)), t.example)));
    const part = (title, sub, ul) => h('section', { class: 'app-section' }, h('h3', { class: 'app-section-header' }, title), ul, sub ? h('p', { class: 'app-section-footer' }, sub) : null);
    close = app.sheet({
      title: 'Add a rule', wide: true, className: 'rp-sheet is-grouped',
      body: h('div', { class: 'rp' },
        part('Combination restriction', 'Codes or people that can\'t (or must) go together.', combo),
        part('Quick templates', null, tpl),
        part('Or start from a rule type', null, types)),
      actions: [{ label: 'Cancel' }],
    });
  }

  // ---------- the rule builder ----------
  function openBuilder(src, { isNew = false, after = null, hint = '', title } = {}) {
    const state = app.store.get();
    const t = RULE_TYPES[src.type];
    if (!t) { app.toast(`This app doesn't know the rule type "${src.type}"`, { kind: 'error' }); return; }
    const draft = structuredClone(src);
    draft.who = W(draft.who);
    draft.when = WHEN(draft.when);
    draft.params = { ...t.defaults(), ...(draft.params || {}) };
    for (const spec of t.params) if (spec.kind === 'who') draft.params[spec.key] = W(draft.params[spec.key]);
    if (draft.enabled == null) draft.enabled = true;
    if (t.soft_only) draft.hard = false;
    if (!(Number(draft.weight) >= 1)) draft.weight = 10;
    const startJSON = JSON.stringify(draft);   // closing with changes asks first (Back, Esc, X, tap outside)
    const sheetTitle = title || (isNew ? `New rule: ${t.label}` : 'Edit rule');

    // the live check runs at most once a frame, straight after a change (it takes a few milliseconds), instead of
    // waiting for a pause in typing (speed: it used to wait 120 ms)
    let raf = 0;
    // a new rule starts with a hint, not red errors: they show after the first change or on Add rule
    let touched = !isNew;
    const changed = () => { touched = true; if (!raf) raf = requestAnimationFrame(() => { raf = 0; preview(); }); };

    // live preview: sentence, problems with the rule as written, and what it finds this month (the type's name only
    // when the sheet's title doesn't already say it)
    const pvSentence = h('p', { class: 'rb-sentence' });
    const pvErrors = h('ul', { class: 'rb-errors' });
    const pvCheck = h('div', { class: 'rb-check' });
    const pv = h('div', { class: 'rb-preview', 'aria-live': 'polite' },
      sheetTitle.includes(t.label) ? null : h('p', { class: 'rb-pv-label' }, h('span', { class: 'rb-pv-ic', html: ruleIcon(src.type) }), t.label),
      pvSentence, pvErrors, pvCheck);

    // an error about one field goes under that field (the kit's field error); the rest stay in the preview
    function fieldFor(e) {
      for (const [spec, f] of paramFields) {
        if (f.hidden) continue;
        if (e.includes(`"${spec.label}"`) || e === `No codes chosen for ${spec.label}` || (e === 'No codes chosen' && spec.kind === 'codes')
          || (e === 'At least is more than at most' && spec.key === 'max')) return f;
      }
      return null;
    }
    function markFields(errs) {
      const byField = new Map();
      const rest = [];
      for (const e of errs) { const f = fieldFor(e); if (f) byField.set(f, [...(byField.get(f) || []), e]); else rest.push(e); }
      for (const [, f] of paramFields) {
        const msgs = byField.get(f) || [];
        let p = f.querySelector(':scope > .app-field-error');
        // (under a code list's label: the list itself is long)
        if (msgs.length && !p) { p = h('p', { class: 'app-field-error', id: fid('err') }); const lab = f.querySelector(':scope > .bx-label'); if (lab && f.querySelector('.bx-codes')) lab.after(p); else f.append(p); }
        if (p) { if (msgs.length) p.textContent = msgs.join('. '); else { p.remove(); p = null; } }
        for (const el of f.querySelectorAll('input.app-input, select.app-input, .bx-codes')) {
          const inp = !el.classList.contains('bx-codes');
          if (p) { if (inp) el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', p.id); }
          else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
        }
      }
      return rest;
    }

    function preview() {
      const st = app.store.get();
      pvSentence.textContent = describeRule(draft, st);
      const errs = validateRule(draft, st);
      const warns = warnings(draft, st);
      pvErrors.innerHTML = '';
      pvCheck.innerHTML = '';
      if (!touched && errs.length) {
        markFields([]);
        pvCheck.append(h('p', { class: 'rb-ck-h rb-ck-hint muted' }, `Choose the codes and people below; this checks the rule against ${M.fmtMonth(app.month)} as you go.`));
        return;
      }
      for (const e of markFields(errs)) pvErrors.append(h('li', { class: 'err' }, e));
      for (const w of warns) pvErrors.append(h('li', { class: 'warn' }, w));
      if (errs.length) { pvCheck.append(h('p', { class: 'rb-ck-h muted' }, 'Fix what is marked to check this rule.')); return; }
      const days = M.monthDays(app.month);
      let found = [];
      try { found = evaluateRule(st, draft, { from: days[0], to: days[days.length - 1] }); } catch (e) { console.error(e); }
      const mName = M.fmtMonth(app.month);
      if (!found.length) pvCheck.append(h('p', { class: 'rb-ck-h ok' }, app.icon ? h('span', { html: app.icon('ok') }) : null, `No problems in ${mName}`));
      else {
        pvCheck.append(h('p', { class: `rb-ck-h ${draft.hard && !t.soft_only ? 'bad' : 'warn'}` }, `${found.length} ${found.length === 1 ? 'problem' : 'problems'} in ${mName}`));
        const ul = h('ul', { class: 'rb-ck-list' });
        found.slice(0, 5).forEach(v => ul.append(h('li', null, v.msg)));
        if (found.length > 5) ul.append(h('li', { class: 'muted' }, `and ${found.length - 5} more`));
        pvCheck.append(ul);
      }
    }

    // What: the type's own params
    const paramFields = [];
    const what = h('div', { class: 'rb-fields' });
    for (const spec of t.params) {
      const f = paramField(app, state, spec, draft.params, () => { refreshVisible(); changed(); }, src.type);
      f.dataset.key = spec.key;
      paramFields.push([spec, f]);
      what.append(f);
    }
    function refreshVisible() {
      for (const [spec, f] of paramFields) {
        const fn = typeof spec.showIf === 'function' ? spec.showIf : SHOW_IF[`${src.type}.${spec.key}`];
        f.hidden = fn ? !fn(draft.params) : false;
      }
    }
    refreshVisible();

    // Strength: hard / soft + weight
    const wOut = h('output', { class: 'rb-wout' }, String(clampW(draft.weight)));
    const wRange = h('input', { type: 'range', class: 'rb-range', min: '1', max: '100', step: '1', value: String(clampW(draft.weight)), 'aria-label': 'Weight (1 to 100)',
      oninput: () => { draft.weight = Number(wRange.value); wOut.textContent = wRange.value; changed(); } });
    const wRow = h('div', { class: 'rb-weight' }, h('span', { class: 'muted' }, 'Weight'), wRange, wOut);
    const strength = seg(h, {
      name: fid('hard'), label: 'Strength', value: draft.hard ? 'hard' : 'soft',
      options: t.soft_only ? [['soft', 'Preference (soft)']] : [['hard', 'Must hold (hard)'], ['soft', 'Preference (soft)']],
      onChange: v => { draft.hard = v === 'hard'; wRow.hidden = draft.hard; changed(); },
    });
    wRow.hidden = !!draft.hard;

    // Name, note, on/off
    const nameId = fid('rname'), noteId = fid('rnote');
    const nameIn = h('input', { type: 'text', id: nameId, class: 'app-input', value: draft.name || '', placeholder: 'Leave blank to use the sentence', maxlength: '120',
      oninput: () => { draft.name = nameIn.value; } });
    const noteIn = h('textarea', { id: noteId, class: 'app-input', rows: '2', placeholder: 'Why this rule exists, who asked for it', oninput: () => { draft.note = noteIn.value; } }, draft.note || '');
    const onIn = h('input', { type: 'checkbox', class: 'app-switch', role: 'switch', checked: draft.enabled !== false, onchange: () => { draft.enabled = onIn.checked; } });

    const form = h('div', { class: 'rb-form' },
      hint ? h('p', { class: 'rb-hint' }, hint) : null,
      section('What', what),
      section('Who', whoPicker(app, state, draft.who, changed, { everyoneNote: 'Nobody chosen = everyone' })),
      section('When', whenPicker(app, draft.when, changed)),
      section('How strict', h('div', { class: 'rb-fields' }, strength, wRow,
        h('p', { class: 'bx-help' }, 'Must hold: auto-fill keeps to it whenever it can, and Check lists it as a problem. Preference: weighed; higher weight matters more.'))),
      section('Name and note', h('div', { class: 'rb-fields' },
        h('div', { class: 'bx-field' }, h('label', { for: nameId }, 'Name (optional)'), nameIn),
        h('div', { class: 'bx-field' }, h('label', { for: noteId }, 'Note (optional)'), noteIn),
        h('label', { class: 'sw-line' }, h('span', null, 'Rule on'), onIn))));

    const body = h('div', { class: 'rb' }, pv, form);
    // a saved rule: Delete (red) and Copy here, not on the list's rows; Copy starts a new rule from what is on screen
    // (the X closes without saving, asking first if anything changed)
    const actions = isNew ? [{ label: 'Cancel' }] : [
      { label: 'Delete', danger: true, fn: () => removeRule(src) },
      { label: 'Copy', fn: () => { setTimeout(() => duplicate({ ...structuredClone(draft), name: (draft.name || '').trim() }), 0); } },
    ];
    actions.push({
      label: isNew ? 'Add rule' : 'Save rule', primary: true,
      fn: () => {
        const st = app.store.get();
        draft.name = (draft.name || '').trim();
        draft.note = (draft.note || '').trim();
        const errs = validateRule(draft, st);
        if (errs.length) {
          touched = true; preview();
          body.querySelector('.app-field-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          app.toast(`Not saved: ${errs[0]}`, { kind: 'error' });
          return false;
        }
        saveRule(structuredClone(draft), isNew, after);
      },
    });
    app.sheet({
      title: sheetTitle, body, actions, wide: true, className: 'rb-sheet is-grouped', onClose: () => cancelAnimationFrame(raf),
      beforeClose: () => JSON.stringify(draft) === startJSON || app.confirm(isNew ? 'Close without adding this rule?' : 'Close without saving your changes to this rule?', { ok: 'Discard', danger: true }),
    });
    preview();
  }

  // a builder section: the kit's caption header over a raised card
  function section(title, content) {
    return h('section', { class: 'app-section rb-sec' }, h('h3', { class: 'app-section-header' }, title), h('div', { class: 'rb-card' }, content));
  }

  // ---------- rules log ----------
  function openLog() {
    const state = app.store.get();
    const items = [...(state.rulesLog || [])].reverse();
    const ids = new Set((state.rules || []).map(r => r.id));
    const body = items.length
      ? h('ol', { class: 'app-list rl-log' }, items.map(e => h('li', null, h('div', { class: 'app-row' },
        h('span', { class: 'app-row-body' },
          h('span', { class: 'app-row-title rl-name' }, ids.has(e.ruleId)
            ? h('button', { type: 'button', class: 'linkish', onclick: () => { close(); const r = app.store.get().rules.find(x => x.id === e.ruleId); if (r) openBuilder(r); } }, e.name || e.ruleId)
            : (e.name || e.ruleId)),
          h('time', { class: 'app-row-sub', datetime: e.at }, fmtWhen(e.at) + (e.by ? ` · ${e.by}` : ''))),
        h('span', { class: `app-badge app-badge--${e.action === 'delete' ? 'bad' : e.action === 'add' ? 'ok' : 'ink'}` }, LOG_WORDS[e.action] || e.action)))))
      : h('p', { class: 'muted' }, 'No rule changes yet. Adding, changing, turning off or deleting a rule is listed here.');
    const close = app.sheet({ title: 'Rules log', body, className: 'is-grouped' });   // read only: the X closes it
  }

  // ---------- export / import ----------
  function exportRules() {
    const state = app.store.get();
    const used = new Set();
    for (const r of state.rules || []) for (const v of Object.values(r.params || {})) {
      if (Array.isArray(v)) v.forEach(c => used.add(c)); else if (typeof v === 'string') used.add(v);
    }
    const duties = (state.duties || []).filter(d => used.has(d.code));
    downloadJSON(`ntf-roster-rules-${M.iso(new Date())}.json`, { kind: 'ntf-roster-rules', v: 1, exportedAt: new Date().toISOString(), rules: state.rules || [], duties });
    app.toast(`Exported ${(state.rules || []).length} rules`);
  }

  async function importRules() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { app.toast('That file is not a rules file (not JSON).', { kind: 'error' }); return; }
    let rules = null, duties = [];
    if (data && data.kind === 'ntf-roster-rules' && Array.isArray(data.rules)) { rules = data.rules; duties = Array.isArray(data.duties) ? data.duties : []; }
    else if (data && data.kind === 'ntf-roster-backup' && data.state && Array.isArray(data.state.rules)) { rules = data.state.rules; duties = data.state.duties || []; }
    if (!rules) { app.toast('That file has no NTF Roster rules in it.', { kind: 'error' }); return; }
    // cleaned like a backup (lists that are really lists, duty kinds and colours from the fixed set), so one odd rule
    // or code in a file can't break every check or the grid
    rules = rules.filter(r => r && typeof r === 'object' && !Array.isArray(r) && typeof r.type === 'string').map(M.cleanRule);
    duties = (Array.isArray(duties) ? duties : []).filter(d => d && typeof d === 'object' && typeof d.code === 'string' && d.code).map(M.cleanDuty);
    const state = app.store.get();
    const cur = new Map((state.rules || []).map(r => [r.id, r]));
    const unknown = rules.filter(r => !r || !RULE_TYPES[r.type]).length;
    const items = rules.filter(r => r && RULE_TYPES[r.type]).map(r => {
      const rule = { ...r, id: r.id || M.uid('r') };
      const old = cur.get(rule.id);
      return { rule, status: !old ? 'new' : stable(old) === stable(rule) ? 'same' : 'changed', on: true };
    });
    const dm = M.dutyMap(state);
    const missing = duties.filter(d => d && d.code && !dm.has(d.code));
    let addCodes = true;
    const row = it => {
      const cb = h('input', { type: 'checkbox', class: 'app-switch', role: 'switch', checked: it.on, onchange: () => { it.on = cb.checked; } });
      return h('li', null, h('label', { class: 'app-row ri-row' },
        h('span', { class: 'app-row-body' }, h('span', { class: 'app-row-title' }, it.rule.name || describeRule(it.rule, state))),
        h('span', { class: `app-badge app-badge--${it.status === 'new' ? 'ok' : 'warn'}` }, it.status === 'new' ? 'New' : 'Changed'), cb));
    };
    const fresh = items.filter(i => i.status === 'new'), changedItems = items.filter(i => i.status === 'changed'), same = items.filter(i => i.status === 'same');
    const body = h('div', { class: 'ri' },
      h('p', null, `${file.name}: ${items.length} rules. ${fresh.length} new, ${changedItems.length} changed, ${same.length} the same as here.`),
      fresh.length || changedItems.length ? h('ul', { class: 'app-list ri-list' }, [...fresh, ...changedItems].map(row)) : h('p', { class: 'ok-box' }, 'Nothing new: every rule in the file is already here.'),
      missing.length ? h('ul', { class: 'app-list' }, h('li', null, h('label', { class: 'app-row ri-codes' },
        h('span', { class: 'app-row-body' }, h('span', { class: 'app-row-title' }, `Also add ${missing.length} duty ${missing.length === 1 ? 'code' : 'codes'} these rules use`), h('span', { class: 'app-row-sub' }, missing.map(d => d.code).join(', '))),
        h('input', { type: 'checkbox', class: 'app-switch', role: 'switch', checked: true, onchange: e => { addCodes = e.target.checked; } })))) : null,
      unknown ? h('p', { class: 'warn-box' }, `${unknown} ${unknown === 1 ? 'rule has a type' : 'rules have types'} this version doesn't know; skipped.`) : null,
      h('p', { class: 'bx-help' }, 'Rules you have here and the file doesn\'t are kept. Import is one step you can undo.'));
    app.sheet({
      title: 'Import rules', body, className: 'is-grouped',
      actions: [{ label: 'Cancel' }, {
        label: 'Import', primary: true,
        fn: () => {
          const pick = items.filter(i => i.status !== 'same' && i.on);
          if (!pick.length && !(addCodes && missing.length)) { app.toast('Nothing chosen to import'); return; }
          app.store.commit('Import rules', d => {
            if (addCodes) for (const du of missing) if (!d.duties.some(x => x.code === du.code)) d.duties.push({ ...du });
            for (const it of pick) {
              const i = d.rules.findIndex(x => x.id === it.rule.id);
              if (i >= 0) d.rules[i] = structuredClone(it.rule); else d.rules.push(structuredClone(it.rule));
              log(d, i >= 0 ? 'edit' : 'add', it.rule);
            }
          });
          app.toast(`Imported ${pick.length} ${pick.length === 1 ? 'rule' : 'rules'}`, { action: undoAct });
        },
      }],
    });
  }

  renderList();
  if (app.params && app.params.edit) openFromParams(app.params);
  function openFromParams(p) {
    const r = (app.store.get().rules || []).find(x => x.id === p.edit);
    if (r) openBuilder(r);
    else if (p.edit === 'new') openPicker();
  }

  return {
    update() { renderList(); },
    route(params) { renderList(); if (params && params.edit) openFromParams(params); },
  };
}

// Warnings that don't stop saving but usually mean a slip.
function warnings(r, state) {
  const out = [];
  const everyone = w => !w || (!(w.groups || []).length && !(w.tags || []).length && !(w.staff || []).length);
  if (r.type === 'together' && r.params.mode === 'never' && everyone(r.who) && everyone(r.params.other)) out.push('Who and Other people are both everyone: nobody could be on together. Choose the people.');
  if (r.type === 'limit' && Number(r.params.max) === 0 && r.params.max !== null && r.params.max !== '' && everyone(r.who)) out.push('Who is everyone, so nobody could do this. Choose the person.');
  if (r.type === 'limit' && r.params.period === 'rolling' && !(Number(r.params.window) >= 1)) out.push('Set how many days the run is');
  const staff = (state.staff || []).filter(p => p.active !== false);
  if (staff.length && !everyone(r.who) && !staff.some(p => whoMatches(r.who, p))) out.push('Nobody on the staff list matches Who');
  return out;
}

// ---------- form pieces (exported for the People screen) ----------

// One field for a ParamSpec. Mutates params[spec.key] and calls onChange.
function paramField(app, state, spec, params, onChange, type) {
  const { h } = app;
  const id = fid('p');
  const help = spec.help ? h('p', { class: 'bx-help' }, spec.help) : null;
  if (spec.kind === 'codes') {
    return h('div', { class: 'bx-field' }, h('p', { class: 'bx-label', id }, spec.label), help,
      codePicker(app, state, params[spec.key] || [], v => { params[spec.key] = v; onChange(); }, { labelledby: id }));
  }
  if (spec.kind === 'code') {
    const onlyReq = spec.key === 'request';
    const sel = h('select', { id, class: 'app-input', onchange: () => { params[spec.key] = sel.value; onChange(); } });
    const duties = (state.duties || []).filter(d => d.kind !== 'derived' && (!onlyReq || d.kind === 'request'));
    if (!duties.some(d => d.code === params[spec.key])) sel.append(h('option', { value: params[spec.key] || '' }, params[spec.key] ? `${params[spec.key]} (unknown)` : 'Choose…'));
    const kinds = [...new Set(duties.map(d => d.kind))];
    for (const k of kinds) sel.append(h('optgroup', { label: KIND_LABEL[k] || k }, duties.filter(d => d.kind === k).map(d => h('option', { value: d.code }, `${d.code}: ${d.name}`))));
    sel.value = params[spec.key] || '';
    return h('div', { class: 'bx-field' }, h('label', { for: id }, spec.label), sel, help);
  }
  if (spec.kind === 'number') {
    const v = params[spec.key];
    const inp = h('input', {
      type: 'number', id, inputmode: 'numeric', class: 'app-input bx-num', value: v == null ? '' : String(v),
      min: spec.min != null ? String(spec.min) : null, max: spec.max != null ? String(spec.max) : null, step: 'any',
      placeholder: spec.optional ? 'No limit' : '',
      oninput: () => { params[spec.key] = inp.value === '' ? (spec.optional ? null : '') : Number(inp.value); onChange(); },
    });
    const minus = h('button', { type: 'button', class: 'bx-step', 'aria-label': `${spec.label}: one less`, onclick: () => bump(-1) }, '−');
    const plus = h('button', { type: 'button', class: 'bx-step', 'aria-label': `${spec.label}: one more`, onclick: () => bump(1) }, '+');
    function bump(n) {
      let x = inp.value === '' ? (spec.min != null && spec.min > 0 ? spec.min - n : 0) : Number(inp.value);
      x += n;
      if (spec.min != null) x = Math.max(spec.min, x);
      if (spec.max != null) x = Math.min(spec.max, x);
      inp.value = String(x); params[spec.key] = x; onChange();
    }
    return h('div', { class: 'bx-field' }, h('label', { for: id }, spec.label + (spec.optional ? ' (optional)' : '')),
      h('div', { class: 'bx-numrow' }, minus, inp, plus), help);
  }
  if (spec.kind === 'select') {
    const opts = spec.options || [];
    if (opts.length <= 3) {
      return h('div', { class: 'bx-field' }, seg(h, { name: id, label: spec.label, value: params[spec.key], options: opts, onChange: v => { params[spec.key] = v; onChange(); } }), help);
    }
    const sel = h('select', { id, class: 'app-input', onchange: () => { params[spec.key] = sel.value; onChange(); } }, opts.map(([v, l]) => h('option', { value: v }, l)));
    sel.value = params[spec.key];
    return h('div', { class: 'bx-field' }, h('label', { for: id }, spec.label), sel, help);
  }
  if (spec.kind === 'bool') {
    const cb = h('input', { type: 'checkbox', class: 'app-switch', role: 'switch', checked: !!params[spec.key], onchange: () => { params[spec.key] = cb.checked; onChange(); } });
    return h('div', { class: 'bx-field' }, h('label', { class: 'sw-line' }, h('span', null, spec.label), cb), help);
  }
  if (spec.kind === 'who') {
    params[spec.key] = W(params[spec.key]);
    return h('div', { class: 'bx-field' }, h('p', { class: 'bx-label' }, spec.label), help,
      whoPicker(app, state, params[spec.key], onChange, { everyoneNote: 'Nobody chosen = everyone' }));
  }
  return h('p', { class: 'warn-box' }, `This app can't edit "${spec.label}" (${spec.kind}) yet.`);
}

// Multi-select of duty codes and tokens. Leave, requests and other sit behind "more" unless one is chosen.
export function codePicker(app, state, selected, onChange, { labelledby } = {}) {
  const { h } = app;
  let cur = [...selected];
  const wrap = h('div', { class: 'bx-codes', role: 'group', 'aria-labelledby': labelledby || null });
  const btn = (code, label, du, title) => {
    const b = h('button', { type: 'button', class: `app-chip bx-tok${du ? '' : ' is-token'}`, 'aria-pressed': cur.includes(code) ? 'true' : 'false', title: title || '', 'data-code': code,
      onclick: () => {
        cur = cur.includes(code) ? cur.filter(c => c !== code) : [...cur, code];
        b.setAttribute('aria-pressed', cur.includes(code) ? 'true' : 'false');
        onChange([...cur]);
      } },
    du ? h('span', { class: `chip${du.kind === 'request' ? ' rq' : ''}`, style: chipStyle(du) }, code) : null,
    h('span', { class: 'bx-tok-l' }, label));
    return b;
  };
  const duties = (state.duties || []).filter(d => d.kind !== 'derived');
  wrap.append(h('div', { class: 'bx-codes-row' }, h('span', { class: 'bx-codes-k' }, 'General'),
    TOKEN_LABELS.map(([c, l]) => btn(c, l, null, TOKEN_HELP[c] || ''))));
  const byKind = k => duties.filter(d => d.kind === k);
  wrap.append(h('div', { class: 'bx-codes-row' }, h('span', { class: 'bx-codes-k' }, 'Shifts'), byKind('shift').map(d => btn(d.code, d.name, d, d.name))));
  for (const k of ['leave', 'request', 'other']) {
    const ds = byKind(k);
    if (!ds.length) continue;
    const det = h('details', { class: 'bx-codes-more', open: ds.some(d => cur.includes(d.code)) || null },
      h('summary', null, `${KIND_LABEL[k]} (${ds.length})`),
      h('div', { class: 'bx-codes-row' }, ds.map(d => btn(d.code, d.name, d, d.name))));
    wrap.append(det);
  }
  const unknown = cur.filter(c => !duties.some(d => d.code === c) && !TOKEN_LABELS.some(([t]) => t === c));
  if (unknown.length) wrap.append(h('div', { class: 'bx-codes-row' }, h('span', { class: 'bx-codes-k' }, 'Unknown'), unknown.map(c => btn(c, 'not a code here', null, 'Not in Duty codes'))));
  return wrap;
}

// Who: everyone / juniors / seniors, groups, tags, specific people, except. Mutates `who`.
export function whoPicker(app, state, who, onChange, { everyoneNote = '' } = {}) {
  const { h } = app;
  const wrap = h('div', { class: 'bx-who' });
  const staff = (state.staff || []).filter(p => p.active !== false);
  const summary = h('p', { class: 'bx-who-sum' });
  const gm = M.groupMap(state);
  const name = id => { const p = (state.staff || []).find(x => x.id === id); return p ? (p.short || p.name) : id; };

  function render() {
    wrap.innerHTML = '';
    const set = arr => { who.groups = arr; who.tags = []; who.staff = []; render(); onChange(); };
    const jr = kindIds(state, 'junior'), sr = kindIds(state, 'senior');
    const isAll = !who.groups.length && !who.tags.length && !who.staff.length;
    const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    wrap.append(h('div', { class: 'bx-quick', role: 'group', 'aria-label': 'Quick choice' },
      h('button', { type: 'button', class: 'app-chip', 'aria-pressed': String(isAll), onclick: () => set([]) }, 'Everyone'),
      jr.length ? h('button', { type: 'button', class: 'app-chip', 'aria-pressed': String(!who.tags.length && !who.staff.length && same(who.groups, jr)), onclick: () => set([...jr]) }, 'Juniors') : null,
      sr.length ? h('button', { type: 'button', class: 'app-chip', 'aria-pressed': String(!who.tags.length && !who.staff.length && same(who.groups, sr)), onclick: () => set([...sr]) }, 'Seniors') : null));
    const toggles = (label, items, key) => h('div', { class: 'bx-who-row' }, h('span', { class: 'bx-codes-k' }, label),
      h('div', { class: 'bx-pills', role: 'group', 'aria-label': label }, items.map(([id, text, title]) => h('button', {
        type: 'button', class: 'app-chip', 'aria-pressed': String(who[key].includes(id)), title: title || null,
        onclick: () => { who[key] = who[key].includes(id) ? who[key].filter(x => x !== id) : [...who[key], id]; render(); onChange(); },
      }, text))));
    wrap.append(toggles('Groups', (state.groups || []).map(g => [g.id, g.name, g.kind === 'senior' ? 'Senior group' : 'Junior group']), 'groups'));
    if ((state.tags || []).length) wrap.append(toggles('Tags', state.tags.map(t => [t.id, t.name, t.help]), 'tags'));
    wrap.append(personRow('People', 'staff', 'Add a person…'));
    wrap.append(personRow('Except', 'exclude', 'Leave someone out…'));
    const n = staff.filter(p => whoMatches(who, p)).length;
    summary.textContent = `${isAll ? (everyoneNote ? everyoneNote + ': ' : 'Everyone: ') : ''}${n} of ${staff.length} people on the staff list`;
    wrap.append(summary);
  }

  function personRow(label, key, placeholder) {
    const id = fid('who');
    const sel = h('select', { id, class: 'app-input bx-who-sel', onchange: () => { if (sel.value) { who[key] = [...who[key], sel.value]; render(); onChange(); } } },
      h('option', { value: '' }, placeholder));
    for (const g of state.groups || []) {
      const ps = staff.filter(p => p.group === g.id && !who[key].includes(p.id));
      if (ps.length) sel.append(h('optgroup', { label: g.name }, ps.map(p => h('option', { value: p.id }, p.name + (p.short ? ` (${p.short})` : '')))));
    }
    const chosen = who[key].map(pid => h('span', { class: 'bx-picked' }, name(pid),
      h('button', { type: 'button', class: 'bx-x', 'aria-label': `Remove ${name(pid)}`, onclick: () => { who[key] = who[key].filter(x => x !== pid); render(); onChange(); } }, '×')));
    return h('div', { class: 'bx-who-row' }, h('label', { class: 'bx-codes-k', for: id }, label), h('div', { class: 'bx-pills' }, chosen, sel));
  }
  void gm;
  render();
  return wrap;
}

// When: weekdays, public holidays, from / to. Mutates `when`.
export function whenPicker(app, when, onChange) {
  const { h } = app;
  const wrap = h('div', { class: 'bx-when' });
  const fromId = fid('from'), toId = fid('to');
  const dayBtns = DAY_TINY.map((d, i) => h('button', { type: 'button', class: 'bx-day', 'aria-pressed': String((when.days || []).includes(i)), 'aria-label': DAY_SHORT[i],
    onclick: () => { const s = new Set(when.days || []); s.has(i) ? s.delete(i) : s.add(i); when.days = [...s].sort(); paint(); onChange(); } }, d));
  const setDays = arr => { when.days = arr; paint(); onChange(); };
  const quick = [
    ['Every day', []], ['Weekdays', [1, 2, 3, 4, 5]], ['Weekends', [0, 6]],
  ].map(([l, arr]) => h('button', { type: 'button', class: 'app-chip', onclick: () => setDays(arr) }, l));
  function paint() {
    dayBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((when.days || []).includes(i))));
    const d = when.days || [];
    quick[0].setAttribute('aria-pressed', String(!d.length || d.length === 7));
    quick[1].setAttribute('aria-pressed', String(d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x))));
    quick[2].setAttribute('aria-pressed', String(d.length === 2 && d.includes(0) && d.includes(6)));
  }
  paint();
  const fromIn = h('input', { type: 'date', id: fromId, class: 'app-input', value: when.from || '', onchange: () => { when.from = fromIn.value; onChange(); } });
  const toIn = h('input', { type: 'date', id: toId, class: 'app-input', value: when.to || '', onchange: () => { when.to = toIn.value; onChange(); } });
  wrap.append(
    h('div', { class: 'bx-who-row' }, h('span', { class: 'bx-codes-k', id: fromId + 'd' }, 'Days'),
      h('div', { class: 'bx-pills' }, h('div', { class: 'bx-days', role: 'group', 'aria-labelledby': fromId + 'd' }, dayBtns), quick)),
    seg(h, { name: fid('hol'), label: 'Public holidays', value: when.holidays || 'any', compact: true,
      options: [['any', 'Any day'], ['only', 'Only holidays'], ['exclude', 'Not holidays']], onChange: v => { when.holidays = v; onChange(); } }),
    h('div', { class: 'bx-dates' },
      h('div', { class: 'bx-field' }, h('label', { for: fromId }, 'From (optional)'), fromIn),
      h('div', { class: 'bx-field' }, h('label', { for: toId }, 'Until (optional)'), toIn)),
    h('p', { class: 'bx-help' }, 'No days picked = every day. Leave the dates blank for always.'));
  return wrap;
}

// One choice of a few, built from radio buttons (keyboard and screen readers get a real radio group): the kit's
// segmented control when the labels fit one row on a phone (2 to 4 short ones), else a check list (iOS style).
const SEG_FIT = { 2: 18, 3: 11, 4: 8 };   // longest label (characters) a segment holds at 390 px
export function seg(h, { name, label, value, options, onChange }) {
  const longest = Math.max(...options.map(([, l]) => String(l).length));
  const asSeg = options.length >= 2 && options.length <= 4 && longest <= SEG_FIT[options.length];
  const fs = h('fieldset', { class: asSeg ? 'app-segmented bx-seg' : 'bx-radios' }, h('legend', null, label));
  const inputs = options.map(([v, l]) => {
    const inp = h('input', { type: 'radio', name, value: v, checked: v === value, onchange: () => { if (inp.checked) onChange(v); } });
    fs.append(h('label', { class: asSeg ? 'app-seg' : 'bx-radio' }, inp, h('span', null, l)));
    return inp;
  });
  // the legend is hidden in the kit's control; a visible label above stands in for it
  const wrap = h('div', { class: 'bx-segwrap' }, h('p', { class: 'bx-label', 'aria-hidden': 'true' }, label), fs);
  wrap.set = v => inputs.forEach(i => { i.checked = i.value === v; });
  return wrap;
}

// One filter of several as the kit's chips (aria-pressed; exactly one is on). Returns the row, with set(value).
export function chipFilter(h, { label, value, options, onChange }) {
  const row = h('div', { class: 'app-chips bx-chipfilter', role: 'group', 'aria-label': label });
  const btns = options.map(([v, l]) => h('button', { type: 'button', class: 'app-chip', 'aria-pressed': String(v === value), 'data-v': v,
    onclick: () => { row.set(v); onChange(v); } }, l));
  row.append(...btns);
  row.set = v => btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  return row;
}

// ---------- small helpers (exported for People and Check) ----------

export function whoMatches(who, p) {
  who = W(who);
  if ((who.exclude || []).includes(p.id)) return false;
  if (!who.groups.length && !who.tags.length && !who.staff.length) return true;
  return who.groups.includes(p.group) || who.staff.includes(p.id) || (p.tags || []).some(t => who.tags.includes(t));
}

export function whenMatches(when, s, state) {
  when = WHEN(when);
  if (when.from && s < when.from) return false;
  if (when.to && s > when.to) return false;
  if ((when.days || []).length && !when.days.map(Number).includes(M.weekday(s))) return false;
  const hol = M.isHoliday(state, s);
  if (when.holidays === 'only' && !hol) return false;
  if (when.holidays === 'exclude' && hol) return false;
  return true;
}

export function whoText(who, state) {
  who = W(who);
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const parts = [];
  if (who.groups.length) {
    if (same(who.groups, kindIds(state, 'junior'))) parts.push('Juniors');
    else if (same(who.groups, kindIds(state, 'senior'))) parts.push('Seniors');
    else parts.push(...who.groups.map(id => ((state.groups || []).find(g => g.id === id) || { name: id }).name));
  }
  parts.push(...who.tags.map(id => ((state.tags || []).find(g => g.id === id) || { name: id }).name));
  const nm = id => { const p = (state.staff || []).find(x => x.id === id); return p ? (p.short || p.name) : id; };
  parts.push(...who.staff.map(nm));
  let txt = parts.length > 3 ? `${parts.slice(0, 2).join(', ')} and ${parts.length - 2} more` : parts.join(', ');
  if (!txt) txt = 'Everyone';
  if (who.exclude.length) txt += ` except ${who.exclude.length > 2 ? `${who.exclude.length} people` : who.exclude.map(nm).join(' and ')}`;
  return txt;
}

export function whenText(when) {
  when = WHEN(when);
  const d = [...(when.days || [])].map(Number).sort();
  const parts = [];
  if (d.length && d.length < 7) {
    if (d.length === 2 && d[0] === 0 && d[1] === 6) parts.push('weekends');
    else if (d.length === 5 && d.join() === '1,2,3,4,5') parts.push('weekdays');
    else parts.push(d.map(x => DAY_SHORT[x]).join(', '));
  }
  if (when.holidays === 'only') parts.push('public holidays only');
  if (when.holidays === 'exclude') parts.push('not on public holidays');
  if (when.from || when.to) parts.push(`${when.from ? M.fmtDay(when.from) : '…'} to ${when.to ? M.fmtDay(when.to) : '…'}`);
  return parts.join(', ');
}

// Chip colours for a duty, nudged for contrast (requests are outlined: their colour is the text).
export function chipStyle(du) {
  if (!du) return { '--c': '#e6e1d6', '--i': '#272722' };
  if (du.kind === 'request') { const c = darkenFor(du.color || '#633d3c', '#ffffff'); return { '--c': c, '--i': c }; }
  const bg = safeHex(du.color, '#e6e1d6');
  let ink = safeHex(du.ink, '#272722');
  if (contrast(bg, ink) < 4.5) ink = contrast(bg, '#ffffff') >= contrast(bg, '#111111') ? '#ffffff' : '#111111';
  return { '--c': bg, '--i': ink };
}
export function contrast(a, b) {
  const L = hex => {
    const v = hexRgb(hex);
    if (!v) return 1;
    const [r, g, bb] = v.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bb;
  };
  const x = L(a), y = L(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hexRgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
}
function safeHex(c, fb) { return hexRgb(c) ? c : fb; }
function darkenFor(color, bg) {
  let rgb = hexRgb(color) || [11, 83, 148];
  for (let i = 0; i < 30 && contrast('#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''), bg) < 4.5; i++) rgb = rgb.map(v => v * 0.88);
  return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

export function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function pickFile(accept) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    inp.addEventListener('change', () => { resolve(inp.files && inp.files[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

// JSON with sorted keys, to compare two rules.
export function stable(o) {
  if (Array.isArray(o)) return `[${o.map(stable).join(',')}]`;
  if (o && typeof o === 'object') return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  return JSON.stringify(o ?? null);
}

export function clampW(w) { const n = Math.round(Number(w)); return n >= 1 ? Math.min(100, n) : 10; }

function fmtWhen(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return `${M.fmtDay(M.iso(d))} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dlIcon() {
  return '<svg class="ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>';
}
