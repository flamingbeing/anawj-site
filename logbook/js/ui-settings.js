// Settings tab (#settings): the Admin entry (admins only), display, logging, templates, recycle bin, privacy. Also the Account tab's
// "You" and sign-out cards (youCard, signOutCard), used by ui-account.js.

import { YEAR_NAMES, DEFAULT_NAMES, BY_CODE } from './categories.js';
import { sortCodes, uid, academicYear } from './engine.js';
import { openBin } from './bin.js';
import { S, h, toast, modal, confirmBox, cloud, catChip, catName, catShort, PICKER_ORDER, pickerOrder, settings, patchLogbook, displayName, hooks, rYear, myYearName, fill, categoryNames, setCategoryNames, catPills, tagSet, download, fileButton, todayISO } from './ui-core.js';
import { cleanTagSet, defaultTagSet, tagTree, flatTree, moveTag, reparentTag, removeTag, newKey, tagSetToCsv, tagSetFromCsv, dropTag, canPlace } from './tags.js';
import { pickDialog } from './ui-log.js';
import { PHOTO_BUDGET_KB, PHOTO_NOTE, photoUsageKb, fmtMb } from './reflections.js';
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
    // only admins see this card
    S.admin ? h('section', { class: 'card admin-card' },
      h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Admin portal'), h('span', { class: 'grow' }),
        h('a', { class: 'btn small primary', href: '#admin' }, 'Open admin portal')),
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'Residents, ready portfolios, the portfolio template, default category names, shared templates and importing the old logbook.')) : null,
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
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Case box height on the Log page',
        h('select', { onchange: e => patchLogbook({ settings: { boxLines: Number(e.target.value) } }).then(() => toast('Saved')) },
          Array.from({ length: 19 }, (_, i) => i + 2).map(n => h('option', { value: String(n), selected: n === (Math.min(20, Math.max(2, Number(st.boxLines) || 3))) }, `${n} lines${n === 3 ? ' (default)' : ''}`)))),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Date for a new case',
        h('select', { onchange: e => patchLogbook({ settings: { defaultDate: e.target.value } }) },
          h('option', { value: 'today', selected: st.defaultDate !== 'last' }, 'Today'),
          h('option', { value: 'last', selected: st.defaultDate === 'last' }, 'The date I used last')))),

    h('section', { class: 'card' },
      h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Tag editor'), h('span', { class: 'grow' }), h('a', { class: 'btn small', href: '#tags' }, 'Open tag editor ›')),
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'Rename, hide and reorder the APMES tags on the Log page, group them under headers, and add personal tags. Download or load your layout as a CSV file.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Reflections'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.reflExport !== false, onchange: e => patchLogbook({ settings: { reflExport: e.target.checked } }) }),
        'New reflections are included in the portfolio export'),
      h('p', { class: 'hint', style: 'margin:0' }, 'Untick if you write many and would rather choose which go in. Reflections already written keep their own tick.')),

    templatesCard(),

    // ---- recycle bin (bin agent) ----
    h('section', { class: 'card' },
      h('h2', {}, 'Photos'),
      (() => { const kb = photoUsageKb(S.reflections), pct = Math.min(100, Math.round(kb / PHOTO_BUDGET_KB * 100));
        return [h('p', { style: 'margin:0 0 6px' }, `${fmtMb(kb)} of ${fmtMb(PHOTO_BUDGET_KB)} used by your reflection figures`),
          h('div', { style: 'height:8px;border-radius:4px;background:var(--line, #ddd);overflow:hidden' }, h('div', { style: `height:100%;width:${pct}%;background:${pct >= 90 ? 'var(--err, #b91c1c)' : 'var(--accent, #002f6c)'}` }))]; })(),
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, PHOTO_NOTE + ' They are shrunk on your phone before saving. To free space, remove figures you no longer need; deleted reflections free theirs when they leave the recycle bin (30 days).')),

    h('section', { class: 'card' },
      h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Recycle bin'), h('span', { class: 'grow' }),
        h('button', { class: 'small', onclick: () => openBin() }, 'Open')),
      h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'Deleted cases and reflections are kept for 30 days and can be restored.')),

    backupCard(),

    h('section', { class: 'card' },
      h('h2', {}, 'Privacy'),
      h('p', { class: 'hint', style: 'margin:0' },
        'Your cases are stored in your own logbook in Google Cloud Firestore. Only you can read them (and the app owner, who runs the import from the old Google Form); programme admins cannot. ',
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

// ---------- templates ----------

function templatesCard() {
  const list = (S.logbook && S.logbook.templates) || [];
  return h('section', { class: 'card' },
    h('h2', {}, 'My templates'),
    h('p', { class: 'hint' }, 'One-tap category sets on the Log screen, e.g. “LSCS spinal” = 16 + 17 + 28. Your frequent combinations appear there automatically too.'),
    list.length ? h('ul', { class: 'prog' }, list.map(t => h('li', { style: 'grid-template-columns:1fr auto' },
      h('span', {}, h('b', {}, t.name), ' ', h('span', { class: 'muted' }, catPills(t.cats)), t.details ? h('span', { class: 'muted' }, ` · “${t.details}”`) : null),
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

// ---------- default category names (Admin portal: the programme's names for everyone) ----------

const CN = { open: false, edit: false };
// the programme's names (an admin's, else the built-in defaults), not anyone's own tag-editor names
const progName = code => (categoryNames()[code] && categoryNames()[code].name) || (DEFAULT_NAMES[code] || [])[0] || BY_CODE[code].name;
const progShort = code => (categoryNames()[code] && categoryNames()[code].short) || (DEFAULT_NAMES[code] || [])[1] || progName(code);
export function categoryNamesCard() {
  const cur = categoryNames();
  const edits = JSON.parse(JSON.stringify(cur));
  const set = (code, k, v) => { edits[code] = { ...(edits[code] || {}), [k]: v }; };
  const ed = CN.edit && S.admin;
  return h('section', { class: 'card cat-names-card' }, h('details', { class: 'more-tools', open: CN.open || ed, ontoggle: e => { CN.open = e.target.open; } },
    h('summary', {}, 'Default category names'),
    h('p', { class: 'hint' }, 'The programme’s names for everyone: a display name for lists and Progress, and a short name for the pills. Each resident can still rename them for themselves in the Tag editor. Exports (portfolio, Excel) always use the official APMES names.'),
    S.admin ? h('div', { class: 'bar', style: 'margin:0 0 8px' }, ed
      ? [h('button', { class: 'primary small', onclick: async () => {
          try { const n = await cloud.saveCategoryNames(edits); setCategoryNames(n); CN.edit = false; toast('Category names saved for everyone'); hooks.render(); }
          catch (err) { toast('Could not save: ' + err.message); }
        } }, 'Save names'), h('button', { class: 'small', onclick: () => { CN.edit = false; hooks.render(); } }, 'Cancel')]
      : h('button', { class: 'small', onclick: () => { CN.edit = true; CN.open = true; hooks.render(); } }, 'Edit')) : null,
    ed ? h('p', { class: 'hint' }, 'Leave a box blank for the programme default (shown faintly).') : null,
    h('div', { class: 'scroll' }, h('table', { class: 'cat-names' },
      h('thead', {}, h('tr', {}, ['Code', 'Official', 'Display name', 'Pill name'].map(t => h('th', {}, t)))),
      h('tbody', {}, PICKER_ORDER.map(c => h('tr', {},
        h('td', {}, c.code), h('td', { class: 'muted' }, c.name),
        ed ? h('td', {}, h('input', { value: (cur[c.code] && cur[c.code].name) || '', placeholder: (DEFAULT_NAMES[c.code] || [])[0] || c.name, maxlength: '80', 'aria-label': `Display name for ${c.code}`, oninput: e => set(c.code, 'name', e.target.value) })) : h('td', {}, progName(c.code)),
        ed ? h('td', {}, h('input', { value: (cur[c.code] && cur[c.code].short) || '', placeholder: (DEFAULT_NAMES[c.code] || [])[1] || c.name, maxlength: '30', 'aria-label': `Pill name for ${c.code}`, oninput: e => set(c.code, 'short', e.target.value) })) : h('td', {}, progShort(c.code)))))))));
}

// ---------- tag editor (this account; js/tags.js) ----------

// Your layout of the Log page's list: rename categories for yourself, hide them, reorder them, put them
// under section headers, and add your own tags (linked to APMES categories, or personal labels).
// Share it as a CSV file (opens in Excel) or load someone else's.
const saveTags = set => patchLogbook({ settings: { tagSet: cleanTagSet(set) } }).then(() => hooks.render());
export function renderTagEditor() {
  const set = tagSet();
  const nodes = flatTree(tagTree(set));
  const names = code => ({ pill: catShort(code), long: catName(code) });
  const def = code => ({ pill: (DEFAULT_NAMES[code] || [])[1] || BY_CODE[code].name, long: (DEFAULT_NAMES[code] || [])[0] || BY_CODE[code].name });
  const linkText = n => n.kind === 'head' ? 'section header'
    : 'Personal · ' + ((n.e.links || []).length ? 'counts as ' + n.e.links.map(catShort).join(', ') : (n.e.p && n.e.p.startsWith('c:') ? 'counts under ' + catShort(n.e.p.slice(2)) : 'label only'));
  const row = n => h('li', { 'data-k': n.e.k, style: `padding-left:${8 + Math.min(n.depth, 4) * 18}px`, class: `te-${n.kind}${n.e.hide ? ' te-hidden' : ''}` },
    // drag by the handle: onto the top or bottom of a row to go before or after it, the middle to go inside
    h('span', { class: 'te-handle', title: 'Drag to move or nest', 'aria-label': 'Drag to move or nest', onpointerdown: e => startTagDrag(e, n.e.k) }, '⠿'),
    h('button', { type: 'button', class: 'te-name', onclick: () => editTag(n) },
      h('span', { class: 'te-pill' }, n.kind === 'head' ? n.e.n : n.kind === 'cat' ? catShort(n.code) : n.e.n),
      n.kind === 'head' ? null : h('small', { class: 'muted te-sub' },
        [n.kind === 'cat' ? 'APMES · ' + catName(n.code) : linkText(n), n.e.hide ? 'hidden' : ''].filter(Boolean).join(' · '))),
    h('button', { class: 'small icon-btn', 'aria-label': 'Move up', onclick: () => saveTags(moveTag(set, n.e.k, -1)) }, '↑'),
    h('button', { class: 'small icon-btn', 'aria-label': 'Move down', onclick: () => saveTags(moveTag(set, n.e.k, 1)) }, '↓'));
  return h('section', { class: 'card tag-editor' },
    h('h2', {}, 'Tag editor'),
    h('p', { class: 'hint' }, 'Lay out the Log page’s list your way. APMES tags are the programme’s categories: rename (just for you), hide, move them or put them under section headers. Personal tags are your own: link one to APMES categories and choosing it ticks them, or leave it as a label only. A personal tag under an APMES one counts towards it. Totals and exports always use APMES.'),
    h('div', { class: 'bar', style: 'flex-wrap:wrap;gap:8px;margin:0 0 8px' },
      h('button', { class: 'small primary', onclick: () => editTag(null, 'tag') }, '+ Personal tag'),
      h('button', { class: 'small', onclick: () => editTag(null, 'head') }, '+ Section header'),
      h('button', { class: 'small', onclick: () => download(`tags-${todayISO()}.csv`, new Blob([tagSetToCsv(set, def)], { type: 'text/csv' })) }, 'Download as CSV'),
      fileButton('Load a CSV…', '.csv,text/csv', file => loadTagCsv(file, def), 'btn small'),
      h('button', { class: 'small', onclick: async () => {
        if (!(await confirmBox('Reset tags?', 'Go back to the APMES categories in the official order, with the programme’s names? Your own tags are removed from the list (cases keep them).', 'Reset', true))) return;
        await patchLogbook({ settings: { tagSet: defaultTagSet({}), catOrder: [], subcats: {} } }); hooks.render();
      } }, 'Reset')),
    h('ul', { class: 'te-list' }, nodes.map(row)));
}

// ---------- drag and drop (pointer events, so touch works) ----------
let tdrag = null;
function startTagDrag(e, key) {
  if (tdrag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  const li = e.target.closest('li');
  const box = li.getBoundingClientRect();
  const ghost = li.cloneNode(true);
  Object.assign(ghost.style, { position: 'fixed', left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', pointerEvents: 'none', opacity: '.85', zIndex: 50, background: 'var(--panel)', boxShadow: '0 6px 18px rgba(0,0,0,.25)' });
  ghost.classList.add('te-ghost');
  document.body.append(ghost);
  li.classList.add('te-dragging');
  tdrag = { key, ghost, li, dy: e.clientY - box.top, target: null, where: null, y: e.clientY };
  const clear = () => document.querySelectorAll('.te-list li.drop-before, .te-list li.drop-after, .te-list li.drop-inside').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-inside'));
  const move = ev => {
    tdrag.y = ev.clientY;
    ghost.style.top = (ev.clientY - tdrag.dy) + 'px';
    clear();
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    const t = under && under.closest('.te-list li[data-k]');
    tdrag.target = null;
    if (!t || t.dataset.k === key) return;
    const r = t.getBoundingClientRect(), f = (ev.clientY - r.top) / r.height;
    const set = tagSet();
    const tk = t.dataset.k, te = set.find(x => x.k === tk);
    let where = f < 0.3 ? 'before' : f > 0.7 ? 'after' : 'inside';
    const ok = w => canPlace(set, key, w === 'inside' ? tk : (te.p || '')) && dropTag(set, key, tk, w) !== set;
    if (!ok(where)) where = ['before', 'after', 'inside'].find(ok);
    if (!where) return;
    tdrag.target = tk; tdrag.where = where;
    t.classList.add('drop-' + where);
  };
  // scroll when near the top or bottom of the screen
  const tick = () => {
    if (!tdrag) return;
    const edge = 70, h0 = window.innerHeight;
    if (tdrag.y < edge) window.scrollBy(0, -10); else if (tdrag.y > h0 - edge - 60) window.scrollBy(0, 10);
    tdrag.raf = requestAnimationFrame(tick);
  };
  tdrag.raf = requestAnimationFrame(tick);
  const end = ev => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
    cancelAnimationFrame(tdrag.raf);
    ghost.remove(); li.classList.remove('te-dragging'); clear();
    const { target, where } = tdrag;
    tdrag = null;
    if (ev.type === 'pointerup' && target) saveTags(dropTag(tagSet(), key, target, where));
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
}

// Edit one item (or add a tag / header when n is null).
function editTag(n, kind = n ? n.kind : 'tag') {
  const set = tagSet();
  const e = n ? { ...n.e, links: [...(n.e.links || [])] } : { k: newKey(kind === 'head' ? 'h' : 'u'), n: '', links: [], ...(kind === 'head' ? { hd: true } : {}) };
  const code = kind === 'cat' ? e.k.slice(2) : null;
  const sub = code && BY_CODE[code].parent;
  const dflt = code ? { pill: (DEFAULT_NAMES[code] || [])[1] || BY_CODE[code].name } : null;
  // where it can sit: headers (anything), categories and tags (tags only); not under itself
  const own = new Set([e.k]);
  if (n) { let grew = true; while (grew) { grew = false; for (const x of set) if (x.p && own.has(x.p) && !own.has(x.k)) { own.add(x.k); grew = true; } } }
  const places = flatTree(tagTree(set)).filter(x => !own.has(x.e.k) && (kind === 'tag' ? true : kind === 'cat' ? x.kind === 'head' : false));
  const under = h('select', { disabled: !!sub || kind === 'head' },
    h('option', { value: '' }, sub ? catShort(sub) : 'Top level'),
    places.map(x => h('option', { value: x.e.k, selected: e.p === x.e.k }, `${'  '.repeat(Math.min(x.depth, 4))}${x.kind === 'cat' ? catShort(x.code) : x.e.n}${x.kind === 'head' ? ' (header)' : ''}`)));
  const pill = h('input', { value: e.n || '', maxlength: kind === 'head' ? '60' : '40', placeholder: code ? dflt.pill : kind === 'head' ? 'e.g. Regional' : 'e.g. Interscalene' });
  const long = h('input', { value: e.l || '', maxlength: '100', placeholder: code ? ((DEFAULT_NAMES[code] || [])[0] || BY_CODE[code].name) : 'optional' });
  const hide = h('input', { type: 'checkbox', checked: !!e.hide });
  const linkBox = h('div', { class: 'te-links' }, PICKER_ORDER.map(c => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: e.links.includes(c.code), onchange: ev => { e.links = ev.target.checked ? [...e.links, c.code] : e.links.filter(x => x !== c.code); } }),
    `${c.parent ? '\u00a0\u00a0' : ''}${catName(c.code)}`)));
  const m = modal(n ? (kind === 'cat' ? 'Edit APMES tag' : kind === 'head' ? 'Edit header' : 'Edit personal tag') : (kind === 'head' ? 'New section header' : 'New personal tag'), [
    code ? h('p', { class: 'hint' }, `APMES: ${BY_CODE[code].label}. It always counts towards this category; renaming is just for you.`) : null,
    h('label', { class: 'field' }, kind === 'head' ? 'Header' : 'Name (pill)', pill),
    kind !== 'head' ? h('label', { class: 'field' }, 'Long name (lists)', long) : null,
    kind !== 'head' ? h('label', { class: 'field' }, 'Sits under', under) : null,
    kind === 'tag' ? [h('div', { class: 'chiplabel' }, 'Counts towards (optional)'),
      h('p', { class: 'hint', style: 'margin:0 0 4px' }, 'Choosing this tag ticks these APMES categories. Leave all unticked for a label only.'), linkBox] : null,
    kind !== 'head' ? h('label', { class: 'check', style: 'margin-top:8px' }, hide, 'Hide from the Log page (still found by search)') : null,
    h('div', { class: 'bar', style: 'margin-top:12px' },
      n && kind !== 'cat' ? h('button', { class: 'danger', onclick: async () => { m.close(); await saveTags(removeTag(set, e.k)); toast('Removed (cases keep the tag)'); } }, 'Remove') : null,
      h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => {
        const nm = pill.value.trim();
        if (kind !== 'cat' && !nm) return toast('Give it a name');
        const out = { ...e, n: nm, l: long.value.trim(), hide: hide.checked };
        if (!out.l) delete out.l; if (!out.hide) delete out.hide; if (!out.n && kind === 'cat') delete out.n;
        if (kind !== 'tag') delete out.links;
        let next = n ? set.map(x => (x.k === e.k ? out : x)) : [...set, out];
        const p = sub ? 'c:' + sub : under.value;
        if ((e.p || '') !== p || !n) next = reparentTag(next, e.k, p);
        m.close(); await saveTags(next);
      } }, 'Save'))], { sticky: true });
}

// Load a CSV: show what's in it and what didn't line up, then replace your layout.
async function loadTagCsv(file, def) {
  const { set, errors, notes, counts } = tagSetFromCsv(await file.text(), def, tagSet());
  if (!set) return toast(errors[0] || 'Could not read that file');
  const m = modal('Load tags', [
    h('p', {}, `${counts.cats} APMES, ${counts.tags} personal tag${counts.tags === 1 ? '' : 's'} and ${counts.heads} header${counts.heads === 1 ? '' : 's'}.`),
    notes.length ? h('ul', { class: 'hint' }, notes.map(x => h('li', {}, x))) : null,
    errors.length ? [h('p', { style: 'margin:8px 0 2px' }, h('b', {}, `${errors.length} thing${errors.length === 1 ? '' : 's'} didn’t line up`)),
      h('ul', { class: 'warnings', style: 'max-height:40dvh;overflow:auto' }, errors.map(x => h('li', {}, x)))] : null,
    h('p', { class: 'hint' }, 'This replaces your tag layout. Your cases are not changed.'),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, 'Cancel'),
      h('button', { class: 'primary', onclick: async () => { m.close(); await saveTags(set); toast('Tags loaded'); } }, 'Replace my tags'))]);
}
