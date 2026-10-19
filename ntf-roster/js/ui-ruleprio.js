// NTF Roster: rule priorities at a glance (Rules > Priorities). Every rule as one bar: preferences by priority (1 to
// 100, longest first), then must-hold rules full width, rules that are off greyed. Drag a bar to change one
// rule; tick several and set them together (a priority, raise or lower, must hold or preference, on or off).
import { RULE_TYPES, describeRule } from './rules.js';
import { clampW } from './ui-rules.js';

const softOnly = r => !!(RULE_TYPES[r.type] && RULE_TYPES[r.type].soft_only);
export const isHard = r => !!r.hard && !softOnly(r);

// Apply one bulk change to the rules with these ids in a draft. how: { weight } | { by } | { hard } | { enabled }.
// Returns how many rules changed. Rules that can only be preferences never become must hold.
export function bulkSet(draft, ids, how) {
  let n = 0;
  for (const r of draft.rules || []) {
    if (!ids.has(r.id)) continue;
    const before = JSON.stringify([r.hard, r.weight, r.enabled]);
    if (how.weight != null) r.weight = clampW(how.weight);   // a must-hold rule keeps it for when it becomes a preference
    if (how.by != null) { r.weight = Math.max(1, Math.min(100, clampW(r.weight) + how.by)); }
    if (how.hard != null && !(how.hard && softOnly(r))) r.hard = how.hard;
    if (how.enabled != null) r.enabled = how.enabled;
    if (JSON.stringify([r.hard, r.weight, r.enabled]) !== before) n++;
  }
  return n;
}

export function openRulePriorities(app) {
  const { h } = app;
  const body = h('div', { class: 'rq' });
  const selected = new Set();
  let showOff = true;

  const commit = (label, how) => {
    const ids = new Set(selected);
    let n = 0;
    app.store.commit(label, d => { n = bulkSet(d, ids, how); if (!n) return false; });
    app.toast(n ? `${label}: ${n} rule${n === 1 ? '' : 's'}` : 'Nothing to change', { action: n ? { label: 'Undo', fn: () => app.store.undo() } : undefined });
  };

  function row(r, state) {
    const hard = isHard(r), off = r.enabled === false, w = clampW(r.weight);
    const title = r.name || describeRule(r, state);
    const t = RULE_TYPES[r.type];
    const on = selected.has(r.id);
    const tick = h('input', { type: 'checkbox', checked: on, 'aria-label': `Select: ${title}`, onchange: () => { tick.checked ? selected.add(r.id) : selected.delete(r.id); draw(); } });
    let barEl;
    if (hard) {
      barEl = h('div', { class: 'rq-track' }, h('div', { class: 'rq-fill hard', style: 'width:100%' }, 'Must hold'));
    } else {
      const out = h('output', { class: 'rq-w' }, String(w));
      const range = h('input', {
        type: 'range', min: '1', max: '100', step: '1', value: String(w), class: 'rq-range', style: `--w:${w}%`, 'aria-label': `Priority of ${title}`,
        oninput: () => { out.textContent = range.value; range.style.setProperty('--w', `${range.value}%`); },
        onchange: () => app.store.commit(`Priority ${range.value} · ${title}`, d => { const x = d.rules.find(y => y.id === r.id); if (!x) return false; x.weight = Number(range.value); }),
      });
      barEl = h('div', { class: 'rq-track' }, range, out);
    }
    return h('li', { class: `rq-row${hard ? ' is-hard' : ''}${off ? ' is-off' : ''}${on ? ' sel' : ''}` },
      h('label', { class: 'rq-tick' }, tick),
      h('div', { class: 'rq-name' }, h('span', { class: 'rq-ic', 'aria-hidden': 'true' }, t ? t.icon : '?'), h('span', null, title), off ? h('span', { class: 'bx-tag off' }, 'Off') : null),
      barEl);
  }

  function draw() {
    const state = app.store.get();
    const rules = (state.rules || []).filter(r => showOff || r.enabled !== false);
    for (const id of [...selected]) if (!(state.rules || []).some(r => r.id === id)) selected.delete(id);
    const hard = rules.filter(isHard), soft = rules.filter(r => !isHard(r)).sort((a, b) => clampW(b.weight) - clampW(a.weight));
    body.textContent = '';
    body.append(h('p', { class: 'team-p' }, 'Must-hold rules are kept whenever possible. Preferences are weighed by priority: a longer bar matters more, and when two clash the longer one wins. Drag a bar to change it, or tick several and change them together below.'));
    body.append(h('div', { class: 'team-row' },
      h('label', { class: 'switch', for: 'rq-off' }, h('input', { type: 'checkbox', id: 'rq-off', checked: showOff, onchange: e => { showOff = e.target.checked; draw(); } }),
        h('span', { class: 'sw-track', 'aria-hidden': 'true' }), h('span', null, 'Show rules that are off')),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { const all = rules.every(r => selected.has(r.id)); for (const r of rules) all ? selected.delete(r.id) : selected.add(r.id); draw(); } },
        rules.length && rules.every(r => selected.has(r.id)) ? 'Unselect all' : 'Select all'),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { for (const r of soft) selected.add(r.id); draw(); } }, 'Select preferences')));
    const sec = (label, list) => list.length ? [h('h3', { class: 'rq-h' }, label, h('span', { class: 'bx-count' }, String(list.length))), h('ul', { class: 'rq-list', 'aria-label': label }, list.map(r => row(r, state)))] : [];
    body.append(...sec('Preferences, by priority', soft), ...sec('Must hold', hard));
    if (!rules.length) body.append(h('p', { class: 'team-p' }, 'No rules to show.'));
    const n = selected.size, dis = !n;
    const wSel = h('select', { 'aria-label': 'Priority for the selected rules', disabled: dis },
      h('option', { value: '' }, 'Set priority…'), [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 1].map(v => h('option', { value: String(v) }, String(v))));
    wSel.onchange = () => { if (wSel.value) commit(`Priority ${wSel.value}`, { weight: Number(wSel.value) }); };
    const b = (label, how, cls = 'btn-ghost') => h('button', { type: 'button', class: `btn btn-sm ${cls}`, disabled: dis, onclick: () => commit(label, how) }, label);
    body.append(h('div', { class: 'rp-bar rq-bar', role: 'group', 'aria-label': 'Change the selected rules' },
      h('span', { class: 'rp-count' }, n ? `${n} selected` : 'Tick rules to change several'),
      wSel, b('+10', { by: 10 }), b('−10', { by: -10 }), b('Must hold', { hard: true }), b('Preference', { hard: false }), b('On', { enabled: true }), b('Off', { enabled: false })));
  }

  draw();
  const unsub = app.store.subscribe(() => draw());
  app.sheet({ title: 'Rule priorities', body, wide: true, actions: [{ label: 'Close', primary: true }], onClose: () => unsub() });
}
