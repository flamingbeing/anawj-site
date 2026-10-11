// Settings tab (#settings): the Admin entry (admins only), display, logging, templates, recycle bin, privacy. Also the Account tab's
// "You" and sign-out cards (youCard, signOutCard), used by ui-account.js.

import { YEAR_NAMES } from './categories.js';
import { sortCodes, uid, academicYear } from './engine.js';
import { openBin } from './bin.js';
import { S, h, toast, modal, confirmBox, cloud, catChip, catName, PICKER_ORDER, settings, patchLogbook, displayName, hooks, rYear, myYearName, fill } from './ui-core.js';
import { pickDialog } from './ui-log.js';
import { backupCard } from './backup.js';

// Compact mode (S.logbook.settings.compact): body.compact (style.css, "compact mode" block). Cached in
// localStorage so the first paint after a reload is already compact, before the logbook loads.
const COMPACT_KEY = 'apmes-logbook-compact';
export function applyCompact(on) {
  document.body.classList.toggle('compact', !!on);
  try { on ? localStorage.setItem(COMPACT_KEY, '1') : localStorage.removeItem(COMPACT_KEY); } catch { /* storage blocked */ }
}
// Theme: 'light' (default), 'dark', or 'auto' (follows the phone) as <html data-theme>, styled at
// the end of style.css. Saved on this device only (Auto is a device setting, and a ward PC can stay
// light while a phone is dark); sign-out keeps it. index.html applies it before the first paint.
const THEME_KEY = 'apmes-logbook-theme';
export function applyTheme(t) {
  const theme = t === 'dark' || t === 'auto' ? t : 'light';
  document.documentElement.dataset.theme = theme;
  try { theme === 'light' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, theme); } catch { /* storage blocked */ }
}
export function cachedTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'light'; } catch { return 'light'; }
}
// Text size (S.logbook.settings.textSize): a zoom factor for the page content (style.css --text-zoom).
const SIZE_KEY = 'apmes-logbook-textsize';
export const TEXT_SIZES = [['0.9', 'Smaller'], ['1', 'Normal'], ['1.12', 'Larger'], ['1.25', 'Largest']];
export function applyTextSize(z) {
  const v = TEXT_SIZES.some(([k]) => k === String(z)) ? String(z) : '1';
  document.documentElement.style.setProperty('--text-zoom', v);
  try { v === '1' ? localStorage.removeItem(SIZE_KEY) : localStorage.setItem(SIZE_KEY, v); } catch { /* storage blocked */ }
}
export function cachedTextSize() {
  try { return localStorage.getItem(SIZE_KEY) || '1'; } catch { return '1'; }
}
export function cachedCompact() {
  try { return localStorage.getItem(COMPACT_KEY) === '1'; } catch { return false; }
}

export function renderSettings() {
  const st = settings();
  return h('div', {},
    S.admin ? h('section', { class: 'card' },
      h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Admin'), h('span', { class: 'grow' }),
        h('a', { class: 'btn small primary', href: '#admin' }, 'Open admin')),
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'Residents list, importing the old logbook, shared templates and the portfolio template.')) : null,
    h('section', { class: 'card' },
      h('h2', {}, 'Display'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', role: 'switch', checked: !!st.compact, onchange: e => {
        applyCompact(e.target.checked);
        patchLogbook({ settings: { compact: e.target.checked } });
      } }), 'Compact mode'),
      h('p', { class: 'hint', style: 'margin:2px 0 0' }, 'Smaller chips, rows and spacing so more categories fit on screen. Saved to your account, so it follows you to other devices.'),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Text size',
        h('select', { onchange: e => { applyTextSize(e.target.value); patchLogbook({ settings: { textSize: e.target.value } }); } },
          TEXT_SIZES.map(([v, l]) => h('option', { value: v, selected: String(st.textSize || '1') === v }, l)))),
      h('label', { class: 'field', style: 'margin-top:10px' }, 'Theme',
        h('select', { onchange: e => applyTheme(e.target.value) },
          [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto (match the phone)']].map(([v, l]) => h('option', { value: v, selected: cachedTheme() === v }, l)))),
      h('p', { class: 'hint', style: 'margin:2px 0 0' }, 'Theme is saved on this device.')),

    // year for targets: programme residents get it from the list; anyone else sets it here
    S.resident ? null : h('section', { class: 'card' },
      h('h2', {}, 'Residency year'),
      h('label', { class: 'field' }, 'Year used for the targets on Progress',
        h('select', { onchange: e => patchLogbook({ settings: { rYear: Number(e.target.value), rYearAY: academicYear() } }).then(() => toast('Saved')) },
          YEAR_NAMES.map((r, i) => h('option', { value: String(i + 1), selected: i + 1 === rYear() }, r)))),
      h('p', { class: 'hint', style: 'margin:4px 0 0' }, 'Programme residents get their year from the programme list automatically. If you are an APMES resident, ask the programme admins to add your email.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Logging'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.suggestions !== false, onchange: e => patchLogbook({ settings: { suggestions: e.target.checked } }) }),
        'Suggest categories as I type'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!st.enterSaves, onchange: e => patchLogbook({ settings: { enterSaves: e.target.checked } }) }),
        'Enter key saves the case (Shift+Enter for a new line)'),
      h('p', { class: 'hint', style: 'margin:0 0 6px' }, 'Off (the default): Enter starts a new line, and Ctrl+Enter (Cmd+Enter on a Mac) saves.'),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Date for a new case',
        h('select', { onchange: e => patchLogbook({ settings: { defaultDate: e.target.value } }) },
          h('option', { value: 'today', selected: st.defaultDate !== 'last' }, 'Today'),
          h('option', { value: 'last', selected: st.defaultDate === 'last' }, 'The date I used last')))),

    templatesCard(),
    subcatsCard(),

    // ---- recycle bin (bin agent) ----
    h('section', { class: 'card' },
      h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Recycle bin'), h('span', { class: 'grow' }),
        h('button', { class: 'small', onclick: () => openBin() }, 'Open')),
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'Deleted cases and reflections are kept for 30 days and can be restored.')),

    backupCard(),

    h('section', { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('p', { class: 'hint', style: 'margin:0' },
        'Your cases are stored in your own logbook in Google Cloud Firestore and only you (and the programme admins) can read them. ',
        'Log patient initials only — no names, NRIC or hospital numbers. Programme residents share case counts per category on the Totals tab; details are never shared. ',
        'This device keeps an offline copy of your cases until you sign out — sign out on shared computers.')),

    h('section', { class: 'card credits' },
      h('h2', {}, 'Credits'),
      h('p', { style: 'margin:0' }, 'Code by ', h('b', {}, 'Abigail Sim')),
      h('p', { style: 'margin:4px 0 0' }, 'Design and UX/UI by ', h('b', {}, 'Koh Wenjun'))));
}

// ---------- Account-tab cards: who you are, sign out ----------

export function youCard() {
  const r = S.resident;
  return h('section', { class: 'card' },
    h('h2', {}, 'You'),
    h('p', { class: 'hint' }, 'Signed in as ', h('b', {}, S.user.email), S.admin ? ' (admin)' : '', '.'),
    h('label', { class: 'field' }, 'Name (shown on your exports; the Totals table uses the name on the programme list)',
      h('input', { value: displayName(), autocomplete: 'name', onchange: e => patchLogbook({ name: e.target.value.trim() }).then(() => toast('Saved')) })),
    r
      ? h('p', { class: 'hint' }, `On the programme list: ${r.rid}, AY${r.intake || '?'} intake, ${myYearName()}${r.status && r.status !== 'ACTIVE' ? ', ' + r.status.toLowerCase() : ''}. Your case counts (never your case details) are shared on the Totals tab.`)
      : h('p', { class: 'hint' }, 'Not on the programme resident list, so your logbook is private and not on the Totals tab. If you are an APMES resident, ask the programme admins to add your email.'));
}

export function signOutCard() {
  return h('section', { class: 'card' },
    h('div', { class: 'bar', style: 'margin:0' },
      h('button', { onclick: async e => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const ok = await cloud.synced();
        btn.disabled = false;
        if (!ok && !(await confirmBox('Not synced yet', 'Some cases or changes on this device have not reached the server yet (no signal?). Signing out now deletes them. Wait for signal and try again, or sign out anyway?', 'Sign out anyway', true))) return;
        cloud.signOut();
      } }, 'Sign out'),
      cloud.demo ? h('span', { class: 'muted' }, 'Demo mode: data stays in this browser.') : null));
}

// ---------- personal subcategories ----------

// Your own labels inside an APMES category (e.g. 26 → Interscalene, Femoral): tick them when logging;
// Progress counts them under the category. They never change the APMES counts.
function subcatsCard() {
  const all = { ...((settings().subcats) || {}) };
  const codes = Object.keys(all).filter(c => (all[c] || []).length).sort();
  const save = next => patchLogbook({ settings: { subcats: next } }).then(() => hooks.render());
  const sel = h('select', { 'aria-label': 'Category' }, PICKER_ORDER.map(c => h('option', { value: c.code }, `${c.code} ${c.name}`)));
  const name = h('input', { placeholder: 'e.g. Interscalene', maxlength: '40', 'aria-label': 'Subcategory name' });
  const addIt = () => {
    const code = sel.value, n = name.value.trim();
    if (!n) return toast('Type a name for the subcategory');
    const list = all[code] || [];
    if (list.some(x => x.toLowerCase() === n.toLowerCase())) return toast('Already there');
    if (list.length >= 20) return toast('Up to 20 per category');
    save({ ...all, [code]: [...list, n] });
  };
  return h('section', { class: 'card' },
    h('h2', {}, 'My subcategories'),
    h('p', { class: 'hint' }, 'Your own labels within an APMES category, e.g. 26 Peripheral nerve blocks → Interscalene, Femoral. Tick them when logging; Progress counts each one. The APMES counts are unchanged.'),
    codes.length ? h('ul', { class: 'prog' }, codes.map(code => h('li', { style: 'grid-template-columns:1fr' },
      h('span', {}, h('b', {}, code), ' ', h('span', { class: 'muted' }, catName(code))),
      h('div', { class: 'chips' }, all[code].map(n => h('span', { class: 'chip on' }, n,
        h('button', { class: 'chip-x', 'aria-label': `Remove ${n}`, onclick: () => save({ ...all, [code]: all[code].filter(x => x !== n) }) }, '×'))))))) : null,
    h('div', { class: 'bar', style: 'margin:10px 0 0' }, sel, name, h('button', { onclick: addIt }, '+ Add')));
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
          toast(`Template “${t.name}” deleted`, { action: 'Undo', onaction: async () => { await patchLogbook({ templates: list }); hooks.render(); } });
        } }, 'Delete'))))) : null,
    h('div', { class: 'bar', style: 'margin:12px 0 0' }, h('button', { onclick: () => editTemplate(null) }, '+ New template')));
}

// Template editor, shared with the admin screen (shared templates). save(t) persists it.
export function templateDialog(t, save, title = null) {
  const e = t ? { ...t, cats: [...t.cats] } : { id: uid(), name: '', cats: [], details: '' };
  const chips = h('div', { class: 'chips selected' });
  const paint = () => fill(chips, ...(e.cats.length ? e.cats.map(c => catChip(c, { on: true })) : [h('span', { class: 'none' }, 'No categories yet')]),
    h('button', { class: 'small', onclick: () => pickDialog(e.cats, cats => { e.cats = cats; paint(); }) }, 'Choose…'));
  paint();
  const m = modal(title || (t ? 'Edit template' : 'New template'), [
    h('label', { class: 'field' }, 'Name', h('input', { value: e.name, placeholder: 'e.g. LSCS spinal', oninput: ev => { e.name = ev.target.value; } })),
    h('div', { class: 'chiplabel' }, 'Categories'), chips,
    h('label', { class: 'field', style: 'margin-top:10px' }, 'Starting text for details (optional)', h('input', { value: e.details || '', placeholder: 'e.g. spinal, GA if converted', oninput: ev => { e.details = ev.target.value; } })),
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
