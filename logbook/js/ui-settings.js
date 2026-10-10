// Settings: name, suggestions, default date, templates, privacy, install help, sign out.

import { R_YEARS } from './categories.js';
import { sortCodes, uid } from './engine.js';
import { S, h, toast, modal, confirmBox, cloud, catChip, settings, patchLogbook, displayName, hooks, rYear, fill } from './ui-core.js';
import { pickDialog } from './ui-log.js';

export function renderSettings() {
  const st = settings();
  const r = S.resident;
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'You'),
      h('p', { class: 'hint' }, 'Signed in as ', h('b', {}, S.user.email), S.admin ? ' (admin)' : '', '.'),
      h('label', { class: 'field' }, 'Name (shown on your exports and, for programme residents, on the totals table)',
        h('input', { value: displayName(), autocomplete: 'name', onchange: e => patchLogbook({ name: e.target.value.trim() }).then(() => toast('Saved')) })),
      r
        ? h('p', { class: 'hint' }, `On the programme list: ${r.rid}, AY${r.intake || '?'} intake, ${R_YEARS[rYear() - 1]}${r.status && r.status !== 'ACTIVE' ? ', ' + r.status.toLowerCase() : ''}. Your case counts (never your case details) are shared on the Totals tab.`)
        : h('p', { class: 'hint' }, 'Not on the programme resident list, so your logbook is private and not on the Totals tab. If you are an APMES resident, ask the programme admins to add your email.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Logging'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.suggestions !== false, onchange: e => patchLogbook({ settings: { suggestions: e.target.checked } }) }),
        'Suggest categories as I type'),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Date for a new case',
        h('select', { onchange: e => patchLogbook({ settings: { defaultDate: e.target.value } }) },
          h('option', { value: 'today', selected: st.defaultDate !== 'last' }, 'Today'),
          h('option', { value: 'last', selected: st.defaultDate === 'last' }, 'The date I used last')))),

    templatesCard(),

    h('section', { class: 'card' },
      h('h2', {}, 'Install on your phone'),
      h('p', { class: 'hint' }, 'It works like an app and keeps working without signal; cases sync when you are back online.'),
      h('ul', {},
        h('li', {}, h('b', {}, 'iPhone (Safari): '), 'tap Share ', h('span', { 'aria-hidden': 'true' }, '⎋'), ' → Add to Home Screen.'),
        h('li', {}, h('b', {}, 'Android (Chrome): '), 'tap the ⋮ menu → Install app (or Add to Home screen).'))),

    h('section', { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('p', { class: 'hint', style: 'margin:0' },
        'Your cases are stored in your own logbook in Google Cloud Firestore and only you (and the programme admins) can read them. ',
        'Log patient initials only — no names, NRIC or hospital numbers. Programme residents share case counts per category on the Totals tab; details are never shared. ',
        'This device keeps an offline copy of your cases until you sign out — sign out on shared computers.')),

    h('section', { class: 'card' },
      h('div', { class: 'bar', style: 'margin:0' },
        h('button', { onclick: () => cloud.signOut() }, 'Sign out'),
        cloud.demo ? h('span', { class: 'muted' }, 'Demo mode: data stays in this browser.') : null)));
}

// ---------- templates ----------

function templatesCard() {
  const list = (S.logbook && S.logbook.templates) || [];
  return h('section', { class: 'card' },
    h('h2', {}, 'My templates'),
    h('p', { class: 'hint' }, 'One-tap category sets on the Log screen, e.g. “LSCS spinal” = 16 + 17 + 28. Your frequent combinations appear there automatically too.'),
    list.length ? h('ul', { class: 'prog' }, list.map(t => h('li', { style: 'grid-template-columns:1fr auto' },
      h('span', {}, h('b', {}, t.name), ' ', h('span', { class: 'muted' }, sortCodes(t.cats).join(' + ')), t.details ? h('span', { class: 'muted' }, ` · “${t.details}”`) : null),
      h('span', { class: 'row' },
        h('button', { class: 'small', onclick: () => editTemplate(t) }, 'Edit'),
        h('button', { class: 'small danger', onclick: async () => {
          if (!(await confirmBox('Delete template', `Delete “${t.name}”?`, 'Delete', true))) return;
          await patchLogbook({ templates: list.filter(x => x.id !== t.id) }); hooks.render();
        } }, 'Delete'))))) : null,
    h('div', { class: 'bar', style: 'margin:12px 0 0' }, h('button', { onclick: () => editTemplate(null) }, '+ New template')));
}

// Template editor, shared with the admin screen (shared templates). save(t) persists it.
export function templateDialog(t, save) {
  const e = t ? { ...t, cats: [...t.cats] } : { id: uid(), name: '', cats: [], details: '' };
  const chips = h('div', { class: 'chips selected' });
  const paint = () => fill(chips, ...(e.cats.length ? e.cats.map(c => catChip(c, { on: true })) : [h('span', { class: 'none' }, 'No categories yet')]),
    h('button', { class: 'small', onclick: () => pickDialog(e.cats, cats => { e.cats = cats; paint(); }) }, 'Choose…'));
  paint();
  const m = modal(t ? 'Edit template' : 'New template', [
    h('label', { class: 'field' }, 'Name', h('input', { value: e.name, placeholder: 'e.g. LSCS spinal', oninput: ev => { e.name = ev.target.value; } })),
    h('div', { class: 'chiplabel' }, 'Categories'), chips,
    h('label', { class: 'field', style: 'margin-top:10px' }, 'Starting text for details (optional)', h('input', { value: e.details || '', placeholder: 'e.g. LSCS spinal', oninput: ev => { e.details = ev.target.value; } })),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        if (!e.name.trim() || !e.cats.length) return toast('Give it a name and at least one category');
        const out = { id: e.id, name: e.name.trim(), cats: sortCodes(e.cats) };
        if (e.details && e.details.trim()) out.details = e.details.trim();
        m.close();
        await save(out);
      } }, 'Save')),
  ]);
}

function editTemplate(t) {
  templateDialog(t, async out => {
    const list = ((S.logbook && S.logbook.templates) || []).filter(x => x.id !== out.id);
    const i = ((S.logbook && S.logbook.templates) || []).findIndex(x => x.id === out.id);
    list.splice(i < 0 ? list.length : i, 0, out);
    await patchLogbook({ templates: list });
    hooks.render();
  });
}
