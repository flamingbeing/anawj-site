// APMES People: one place for the people lists the logbook and evals share (residents, faculty, programme
// directors, applications to join). Admins and PDs only. It reuses evals' sign-in, storage and list screens
// (../../evals/js/), so a change there shows here too; what is new lives in batch.js (new intake, year check, CSV,
// import from the monthly roster).
// Data: the logbook project's residents/{rid}, faculty/{email}, pds/{email}, applications/{uid}
// (logbook/firestore.rules). With ?demo, evals' in-browser demo backend instead (made-up people).

import { S, h, fill, add, toast, cloud, icon, initials, modal, confirmBox, download, segment, empty, applyTheme, errText, hooks, avatar } from '../../evals/js/ui-core.js';
import { residentsPane, facultyPane, applicationsPane, clearResidentsCache, pasteDialog, field, input, select, cleanEmail, validEmail, nextRid } from '../../evals/js/ui-admin.js';
import { residentYear, todayISO } from '../../evals/js/engine.js';
import { rotationsScreen } from './rotations-ui.js';
import { parseIntake, yearIssues, yearCounts, peopleCSV, academicYear, parseRosterList, rosterChanges, itemPatch } from './batch.js';

applyTheme();

const app = document.getElementById('app');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const backEl = document.getElementById('back');
const meEl = document.getElementById('me');

const TABS = [['residents', 'Residents'], ['faculty', 'Faculty'], ['pds', 'PDs'], ['rotations', 'Rotations'], ['applications', 'Applications']];
const SCREENS = { residents: 'Residents', faculty: 'Faculty', pds: 'Programme directors', applications: 'Applications', rotations: 'Rotations', intake: 'Add a new intake', check: 'Year check', roster: 'Import from the monthly roster' };
const route = () => { const r = location.hash.replace(/^#\/?/, '').split('/')[0]; return SCREENS[r] ? r : 'residents'; };
const err = e => errText(e);

let data = null;   // { res, fac, pds, apps }
async function loadAll() {
  const [res, fac, apps, pds] = await Promise.all([cloud.listResidents(), cloud.listFaculty(), cloud.listApplications(), cloud.listPDs()]);
  clearResidentsCache();
  data = { res, fac, apps, pds };
  S.faculty = fac;
}
const reload = async () => { data = null; await render(); };

function header(title) {
  titleEl.textContent = title;
  document.title = title === 'APMES People' ? title : `${title} · APMES People`;
  subEl.textContent = cloud.demo ? 'Demo' : '';
  subEl.hidden = !cloud.demo;
  const r = route();
  backEl.hidden = !(r === 'intake' || r === 'check' || r === 'roster');
  fill(meEl, S.user ? h('button', { type: 'button', class: 'a-bar-btn e-appbar__me', title: S.user.email, 'aria-label': 'Account', onclick: account }, h('span', { class: 'a-avatar', 'aria-hidden': 'true' }, initials(S.user.name || S.user.email))) : null);
}
backEl.addEventListener('click', () => { location.hash = '#residents'; });

function account() {
  const m = modal('Account', [
    h('p', {}, S.user.name, h('br'), h('span', { class: 'e-small' }, S.user.email)),
    h('p', { class: 'e-small' }, S.roles.admin ? 'Admin' : 'Programme director', ' · the same sign-in as the logbook and evals.'),
    h('p', { class: 'e-small' }, h('a', { href: '../logbook/' }, 'Open the logbook'), ' · ', h('a', { href: '../evals/' }, 'Open evals')),
    h('div', { class: 'e-actions' },
      h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Close'),
      h('button', { class: 'a-btn', type: 'button', onclick: async () => { m.close(); await cloud.signOut(); location.reload(); } }, 'Sign out')),
  ]);
}

// ---------- screens ----------

function residentsScreen() {
  const { res } = data;
  const counts = yearCounts(res);
  const issues = yearIssues(res);
  const top = h('section', { class: 'e-card' },
    h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Residents'),
    h('p', { class: 'p-apps' }, 'One list for the ', h('b', {}, 'logbook'), ' and ', h('b', {}, 'evals'), ': add someone here and they are on both.'),
    h('ul', { class: 'p-years', 'aria-label': 'Active residents by year' },
      Object.keys(counts).sort().map(k => h('li', {}, `${k}: ${counts[k]}`))),
    h('div', { class: 'e-actions e-actions--start', style: 'margin-top:12px' },
      h('a', { class: 'a-btn a-btn--sm e-btn-small', href: '#intake' }, icon('plus'), 'Add a new intake'),
      h('a', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet e-btn-small', href: '#check' }, `Year check${issues.length ? ` (${issues.length})` : ''}`),
      h('a', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet e-btn-small', href: '#roster' }, 'Import from roster'),
      h('button', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet e-btn-small', type: 'button', onclick: exportAll }, 'Export CSV')));
  return h('div', { class: 'e-stack' }, top, residentsPane({ res, reload }));
}

function exportAll() {
  download(`apmes-people-${todayISO()}.csv`, new Blob([peopleCSV({ residents: data.res, faculty: data.fac, pds: data.pds })], { type: 'text/csv;charset=utf-8' }));
  toast(`Exported ${data.res.length} residents, ${data.fac.length} faculty, ${data.pds.length} PDs`);
}

// Add a new intake: one intake year for the whole batch, paste names and emails, IDs given in order.
function intakeScreen() {
  const ay = academicYear();
  const yr = input({ type: 'number', inputmode: 'numeric', min: 2000, max: 2100, value: ay, id: 'p-intake' });
  const start = select([['', 'From intake'], ...[1, 2, 3, 4, 5].map(v => [v, `Fixed at R${v}`])], '');
  start.id = 'p-start';
  const ta = h('textarea', { class: 'e-textarea', rows: 8, id: 'p-paste', spellcheck: 'false', autocapitalize: 'off',
    placeholder: 'Sam Example, sam.example@example.com\nAlex Example <alex.example@example.com>\n(or paste two columns from a spreadsheet: name, email)' });
  const out = h('ul', { class: 'e-paste-res', 'aria-live': 'polite' });
  const btn = h('button', { class: 'a-btn e-go', type: 'button', disabled: true }, 'Add');
  let parsed = [];
  const check = () => {
    parsed = parseIntake(ta.value, data.res, { intake: yr.value, rYear: start.value || null });
    const good = parsed.filter(p => p.rec && !p.dup && !p.problem);
    fill(out, parsed.map(p => h('li', { class: p.problem ? 'is-bad' : p.dup ? 'is-dup' : '' },
      p.problem ? `✗ ${p.line} — ${p.problem}` : p.dup ? `• ${p.line} — ${p.dup}, skipped` : `✓ ${p.rec.rid} · ${p.rec.name} · ${p.rec.email}`)));
    btn.disabled = !good.length || !/^\d{4}$/.test(yr.value);
    btn.textContent = good.length ? `Add ${good.length} to intake ${yr.value}` : 'Add';
  };
  for (const el of [ta, yr, start]) el.addEventListener('input', check);
  start.addEventListener('change', check);
  btn.addEventListener('click', async () => {
    const good = parsed.filter(p => p.rec && !p.dup && !p.problem);
    if (!await confirmBox(`Add ${good.length} resident${good.length === 1 ? '' : 's'}?`,
      `They join the logbook and evals lists as Active, intake ${yr.value}${start.value ? `, fixed at R${start.value}` : ''}. They sign in with these Google accounts.`, 'Add')) return;
    btn.disabled = true;
    let ok = 0; const fails = [];
    for (const p of good) {
      try { await cloud.saveResident(p.rec); ok++; } catch (e) { fails.push(`${p.rec.email}: ${err(e)}`); }
    }
    toast(fails.length ? `Added ${ok}; ${fails.length} failed (${fails[0]})` : `Added ${ok} to intake ${yr.value}`);
    data = null; location.hash = '#residents';
  });
  return h('div', { class: 'e-stack' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Add a new intake'),
      h('p', { class: 'e-small' }, 'The yearly batch in one go. Everyone pasted gets the same intake year and the next resident IDs, and goes on the list the logbook and evals both use.'),
      h('div', { class: 'e-pg' }, field('Intake year', yr), field('Residency year', start)),
      h('p', { class: 'e-hint' }, `“From intake” works the year out each July (intake ${ay} is R1 until 30 June ${ay + 1}). Fix a year only for someone joining part-way.`),
      field('Names and emails, one per line', ta),
      h('p', { class: 'e-hint' }, 'An ID at the start of a line is kept (e.g. “R031, Sam Example, sam@example.com”). People already on the list are skipped.'),
      out,
      h('div', { class: 'e-actions' }, h('a', { class: 'a-btn a-btn--tinted e-btn-quiet', href: '#residents' }, 'Cancel'), btn)));
}

// Import from the monthly roster: NUH Junior Monthly keeps every resident's grade month by month. Its staff list comes
// over by postMessage (it opens with ?send=apmes and sends once the user says so) or pasted; batch.js lists what would
// change, and only the ticked changes are saved, after a confirm.
const JM_ORIGIN = 'https://nuhjuniormonthly.anawj.com';
let rosterText = '';       // the last list sent or pasted, kept while People is open
let onRosterList = null;   // the open import screen's handler
window.addEventListener('message', e => {
  // only NUH Junior Monthly's own address, or this one (previews and tests serve both apps from one origin)
  if (e.origin !== JM_ORIGIN && e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.type !== 'nuhjm-staff' || typeof d.text !== 'string' || d.text.length > 200000) return;
  rosterText = d.text;
  if (onRosterList) onRosterList(d.text);
  else if (S.user) location.hash = '#roster';
});
const rosterAppURL = () => (location.hostname === 'apmes.anawj.com' ? JM_ORIGIN + '/' : new URL('../nuh-junior-monthly/', location.href).href)
  + '?' + (cloud.demo ? 'demo&' : '') + 'send=apmes#people';

// A made-up roster for the demo residents (evals' demo backend): two year changes, one name inside another, one
// graduated, two new residents (one a senior resident: R4 or R5), an MO and someone not on it.
function demoRoster() {
  return [`NUH Junior Monthly staff (made up), roster month ${todayISO().slice(0, 7)}`, 'Grade\tName\tFrom\tUntil',
    'R\tFarah Ng', 'R\tPriya Example', 'RES3\tDina Hassan', 'RES3\tEvan Koh', 'RES3\tChandra Rao', 'RES2\tDemo Resident',
    'RES2\tBea Lim', 'RES1\tAiden Tan Wei', 'RES1\tNoor Example', 'AC\tGabriel Wong', 'MOPEX\tQuinn Example'].join('\n') + '\n';
}

function rosterScreen() {
  const ta = h('textarea', { class: 'e-textarea', rows: 4, id: 'p-roster', spellcheck: 'false', autocapitalize: 'off',
    placeholder: 'Grade\tName\nRES1\tSam Example\nR\tKim Example' });
  ta.value = rosterText;
  const month = input({ type: 'month', id: 'p-rmonth' });
  const out = h('div', { class: 'e-stack', 'aria-live': 'polite' });
  const apply = h('button', { class: 'a-btn e-go', type: 'button', disabled: true }, 'Apply');
  let st = null;          // what the user has said about this list: links, ticks, names, emails, years
  let listKey = null;     // the list st belongs to
  let items = [];
  const ready = it => {
    const y = it.choose ? Number(st.years[it.key] || it.suggest) : 1;
    if (!y) return false;
    if (it.kind !== 'new') return true;
    if (!st.adding[it.key]) return false;
    const em = cleanEmail(st.emails[it.key] || '');
    return validEmail(em) && !data.res.some(r => r.email === em) && (st.names[it.key] ?? it.rec.name).trim() !== ''
      && !items.some(o => o !== it && o.kind === 'new' && cleanEmail(st.emails[o.key] || '') === em);
  };
  const ticked = it => (it.kind === 'change' || it.kind === 'new') && ready(it) && (it.key in st.ticks ? st.ticks[it.key] : it.kind === 'new' || it.tick);
  const count = () => {
    const n = items.filter(ticked).length;
    apply.disabled = !n;
    apply.textContent = n ? `Apply ${n} change${n === 1 ? '' : 's'}` : 'Apply';
    for (const it of items) {
      const cb = out.querySelector(`input[data-key="${CSS.escape(it.key)}"]`);
      if (cb) { cb.disabled = !ready(it); cb.checked = ticked(it); }
    }
  };

  const paint = () => {
    rosterText = ta.value;
    if (!ta.value.trim()) { items = []; fill(out); count(); return; }
    const list = parseRosterList(ta.value);
    if (listKey !== ta.value) {
      listKey = ta.value; st = { links: {}, ticks: {}, adding: {}, names: {}, emails: {}, years: {} };
      month.value = list.month || todayISO().slice(0, 7);
    }
    if (list.problem || !list.people.length) {
      items = [];
      fill(out, h('p', { class: 'e-alert' }, `${list.problem || 'Nobody in the list'}. Use the list from NUH Junior Monthly (More › Export › Copy the staff list for APMES People), or copy the whole grid tab of the department sheet.`));
      count(); return;
    }
    const res = rosterChanges(list, data.res, { month: month.value, links: st.links });
    items = res.items;
    const changes = items.filter(i => i.kind === 'change'), fresh = items.filter(i => i.kind === 'new');
    const missing = items.filter(i => i.kind === 'missing'), other = items.filter(i => i.kind === 'other');
    const linked = Object.keys(st.links).length;
    const when = new Date(res.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    fill(out,
      h('p', { class: 'e-small', style: 'margin:0' }, `${res.same} already agree · ${changes.length} to update · ${fresh.length} new · ${missing.length} not on the roster. Years as in ${when}.`,
        linked ? [' ', h('button', { class: 'e-linkbtn', type: 'button', onclick: () => { st.links = {}; paint(); } }, `Forget ${linked} match${linked === 1 ? '' : 'es'} made by hand`)] : null),
      changes.length ? group('Changes', 'Ticked ones are saved when you tap Apply. Untick any you don’t want.', changes.map(changeRow)) : null,
      fresh.length ? group('On the roster, not on the list here', 'Say who each one is: on the list here under another name, or a new resident (with the Google account email they sign in with).', fresh.map(newRow)) : null,
      missing.length || other.length ? h('details', { class: 'e-card p-more' },
        h('summary', {}, `Not on the roster as residents (${missing.length + other.length})`),
        h('p', { class: 'e-small' }, 'Active residents the roster doesn’t list as RES1–RES3, R or AC: away from NUH, on long leave, or left? Nothing changes for them; check by hand.'),
        h('ul', { class: 'p-plain' }, [...other.map(i => h('li', {}, `${i.r.name} (${i.r.rid}): on the roster as ${i.p.grade || 'no grade'}`)),
          ...missing.map(i => h('li', {}, `${i.r.name} (${i.r.rid}), R${residentYear(i.r, res.date) || '?'}`))])) : null,
      !changes.length && !fresh.length ? empty('All up to date', 'The residents here agree with the roster.') : null);
    count();
  };

  const group = (title, help, rows) => h('section', { class: 'e-card e-card--flush p-group' },
    h('div', { class: 'p-group-h' }, h('h2', { class: 'e-h3' }, `${title} (${rows.length})`), h('p', { class: 'e-hint' }, help)),
    h('div', { class: 'e-checks' }, rows));
  const tickBox = (it, label) => h('input', { type: 'checkbox', id: 'p-' + it.key.replace(/\W/g, '-'), 'data-key': it.key, 'aria-label': label,
    onchange: e => { st.ticks[it.key] = e.target.checked; count(); } });
  const yearPick = it => {
    const sel = select([['', 'R4 or R5?'], ['4', 'R4'], ['5', 'R5']], String(st.years[it.key] || it.suggest || ''));
    sel.addEventListener('change', () => { st.years[it.key] = sel.value; count(); });
    return sel;
  };

  function changeRow(it) {
    const id = 'p-' + it.key.replace(/\W/g, '-');
    return h('div', { class: 'e-check p-pick' },
      tickBox(it, `${it.r.name}: ${it.changes.join(', ')}`),
      h('div', { class: 'p-pick__body' },
        h('label', { for: id, class: 'e-row__title' }, it.r.name),
        h('div', { class: 'e-row__meta' }, `${it.r.rid} · ${it.why}${it.p.name !== it.r.name ? ` (“${it.p.name}”)` : ''}`),
        h('div', { class: 'p-pick__what' }, it.changes.join(' · ')),
        it.choose ? h('div', { class: 'p-pick__fields' }, field('Senior resident: which year?', yearPick(it))) : null,
        !it.tick && !it.choose ? h('div', { class: 'e-row__meta' }, it.fix.status === 'ACTIVE' ? 'Not ticked: check they are back in the programme.' : 'Not ticked: they have SMO years, so check the year.') : null));
  }

  function newRow(it) {
    const id = 'p-' + it.key.replace(/\W/g, '-');
    const others = items.filter(i => i.kind === 'missing' || i.kind === 'other').map(i => i.r).filter(r => !it.maybe.includes(r));
    const who = h('select', { class: 'e-select' },
      h('option', { value: '' }, 'Choose…'),
      h('option', { value: '+', selected: !!st.adding[it.key] }, 'Add as a new resident'),
      it.maybe.length ? h('optgroup', { label: 'Similar names on the list' }, it.maybe.map(r => h('option', { value: r.rid }, `${r.name} (${r.rid})`))) : null,
      others.length ? h('optgroup', { label: 'Others not on the roster' }, others.map(r => h('option', { value: r.rid }, `${r.name} (${r.rid})`))) : null);
    const adding = h('div', { class: 'p-pick__fields', hidden: !st.adding[it.key] });
    who.addEventListener('change', () => {
      if (who.value && who.value !== '+') { st.links[it.p.idx] = who.value; paint(); return; }
      st.adding[it.key] = who.value === '+';
      adding.hidden = !st.adding[it.key];
      if (st.adding[it.key]) email.focus();
      count();
    });
    const name = input({ value: st.names[it.key] ?? it.rec.name, autocomplete: 'off' });
    name.addEventListener('input', () => { st.names[it.key] = name.value; count(); });
    const email = input({ type: 'email', value: st.emails[it.key] || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'name@example.com' });
    const warn = h('p', { class: 'e-hint', role: 'status' });
    email.addEventListener('input', () => {
      st.emails[it.key] = email.value;
      const em = cleanEmail(email.value), on = data.res.find(r => r.email === em);
      warn.textContent = on ? `${em} is already on the list as ${on.name} (${on.rid}): choose them above instead.` : '';
      count();
    });
    const year = it.rec.intake ? `R${residentYear(it.rec, it.date)}` : null;
    return h('div', { class: 'e-check p-pick' },
      tickBox(it, `Add ${it.p.name}`),
      h('div', { class: 'p-pick__body' },
        h('label', { for: id, class: 'e-row__title' }, it.p.name),
        h('div', { class: 'e-row__meta' }, `${it.p.grade} on the roster${year ? ` · joins as ${year}` : ''}${it.p.from ? ` · from ${it.p.from}` : ''}`),
        h('div', { class: 'p-pick__fields' }, field(`Who is ${it.p.name}?`, who)),
        add(adding, field('Name', name), field('Google account email', email), it.choose ? field('Senior resident: which year?', yearPick(it)) : null),
        warn));
  }

  ta.addEventListener('input', paint);
  month.addEventListener('change', paint);
  onRosterList = text => { ta.value = text; paint(); toast('Got the staff list from NUH Junior Monthly'); out.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); };
  apply.addEventListener('click', async () => {
    const todo = items.filter(ticked);
    if (!todo.length) return;
    const lines = todo.map(it => it.kind === 'new'
      ? `${(st.names[it.key] ?? it.rec.name).trim()}: add as R${residentYear(itemPatch(it, st.years[it.key]), it.date) || '?'} (${cleanEmail(st.emails[it.key])})`
      : `${it.r.name}: ${it.changes.join(', ').replace('senior resident', 'R' + (st.years[it.key] || it.suggest))}`);
    if (!await confirmBox(`Apply ${todo.length} change${todo.length === 1 ? '' : 's'}?`, lines.join('\n'), 'Apply')) return;
    apply.disabled = true;
    const all = [...data.res];
    let ok = 0; const fails = [];
    for (const it of todo) {
      let rec = itemPatch(it, st.years[it.key]);
      if (it.kind === 'new') { rec = { ...rec, rid: nextRid(all), name: (st.names[it.key] ?? it.rec.name).trim(), email: cleanEmail(st.emails[it.key]) }; all.push(rec); }
      try { await cloud.saveResident(rec); ok++; } catch (e) { fails.push(`${rec.name}: ${err(e)}`); }
    }
    toast(fails.length ? `Saved ${ok}; ${fails.length} failed (${fails[0]})` : `Saved ${ok} change${ok === 1 ? '' : 's'} from the roster`);
    rosterText = ''; data = null; location.hash = '#residents';
  });

  const get = h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button',
    onclick: () => { if (!window.open(rosterAppURL(), 'nuhjm-send')) toast('The browser blocked the new tab: copy the list in NUH Junior Monthly and paste it here.'); } },
    'Get the list from NUH Junior Monthly');
  const wrap = h('div', { class: 'e-stack' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Import from the monthly roster'),
      h('p', { class: 'e-small' }, 'NUH Junior Monthly keeps every resident’s grade up to date month by month. Bring its staff list here to see who has moved up a year, who has finished and who is missing, then untick anything you don’t want and apply. Nothing changes until you tap Apply.'),
      h('div', { class: 'e-actions e-actions--start' }, get,
        cloud.demo ? h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => { ta.value = demoRoster(); paint(); } }, 'Fill in a made-up list') : null),
      h('p', { class: 'e-hint' }, 'It opens NUH Junior Monthly in a new tab and asks there before sending names and grades (no roster). If that doesn’t work, in NUH Junior Monthly go to More › Export › Copy the staff list for APMES People and paste it below. A copy of the department sheet’s whole grid tab works too.'),
      field('Or paste the list', ta),
      field('Grades are for', month, 'p-month'),
      h('p', { class: 'e-hint' }, 'The roster month the grades are from (filled in from NUH Junior Monthly’s list). Years move up on 1 July.')),
    out,
    h('div', { class: 'e-actions' }, h('a', { class: 'a-btn a-btn--tinted e-btn-quiet', href: '#residents' }, 'Cancel'), apply));
  paint();
  return wrap;
}

// Year check: residents whose year won't look after itself at the July change-over.
function checkScreen() {
  const issues = yearIssues(data.res);
  const wrap = h('div', { class: 'e-stack' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Year check'),
      h('p', { class: 'e-small' }, 'Residency years move up on 1 July from each resident’s intake year. These residents have a year set by hand, no year at all, or an intake that puts them past R5. Run it before July and after adding an intake.')));
  if (!issues.length) { wrap.append(empty('All clear', 'Every active resident’s year comes from their intake.')); return wrap; }
  const fixable = issues.filter(i => i.fix);
  wrap.append(h('div', { class: 'e-card e-card--flush' }, issues.map(i => h('div', { class: 'p-issue' },
    avatar(i.r.name || i.r.email),
    h('div', {}, h('div', { class: 'e-row__title' }, i.r.name || i.r.email),
      h('div', { class: 'e-row__meta' }, `${i.r.rid} · now R${residentYear(i.r) || '?'} · ${i.r.status}`),
      h('div', { class: 'e-row__meta e-flag-why' }, i.why)),
    i.fix ? h('button', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet e-btn-small', type: 'button', onclick: () => fixOne(i) }, i.fixLabel)
      : h('span', { class: 'e-small' }, 'Edit in Residents')))));
  if (fixable.length > 1) wrap.append(h('div', { class: 'e-actions' },
    h('button', { class: 'a-btn', type: 'button', onclick: () => fixAll(fixable) }, `Apply all ${fixable.length} suggestions`)));
  return wrap;
}
async function fixOne(i) {
  try { await cloud.saveResident({ ...i.r, ...i.fix }); toast(`${i.r.name}: ${i.fixLabel.toLowerCase()}`); reload(); }
  catch (e) { toast('Couldn’t save. ' + err(e)); }
}
async function fixAll(list) {
  if (!await confirmBox(`Apply ${list.length} suggestions?`, list.map(i => `${i.r.name}: ${i.fixLabel}`).join('\n'), 'Apply')) return;
  let ok = 0;
  for (const i of list) { try { await cloud.saveResident({ ...i.r, ...i.fix }); ok++; } catch {} }
  toast(`Updated ${ok} of ${list.length}`); reload();
}

// Programme directors: admins add and remove; PDs see the list.
function pdsScreen() {
  const { pds } = data;
  const admin = !!S.roles.admin;
  const add = () => {
    const name = input({ autocomplete: 'off', required: true });
    const email = input({ type: 'email', required: true, autocapitalize: 'off', spellcheck: 'false' });
    const msg = h('p', { class: 'e-alert', hidden: true, role: 'alert' });
    const m = modal('Add programme director', h('form', { onsubmit: async e => {
      e.preventDefault();
      const em = cleanEmail(email.value), nm = name.value.trim();
      const bad = !nm ? 'Enter a name.' : !validEmail(em) ? 'Enter a valid email.' : pds.some(p => p.email === em) ? `${em} is already a PD.` : null;
      if (bad) { msg.hidden = false; msg.textContent = bad; return; }
      try { await cloud.savePD({ email: em, name: nm }); m.close(); toast(`${nm} added`); reload(); }
      catch (e2) { msg.hidden = false; msg.textContent = 'Couldn’t save. ' + err(e2); }
    } }, field('Name', name), field('Google account email', email), msg,
      h('div', { class: 'e-actions' },
        h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'a-btn', type: 'submit' }, 'Add'))));
  };
  const remove = async p => {
    if (!await confirmBox('Remove programme director?', `${p.name || p.email} loses PD access to the logbook, evals and People.`, 'Remove', true)) return;
    try { await cloud.removePD(p.email); toast('Removed'); reload(); } catch (e) { toast('Couldn’t remove. ' + err(e)); }
  };
  return h('div', { class: 'e-stack' },
    h('p', { class: 'e-small' }, 'PDs see every resident’s evaluations and the programme totals, and can keep the resident and faculty lists.',
      admin ? '' : ' Only admins change this list.'),
    admin ? h('div', { class: 'e-toolbar' }, h('button', { class: 'a-btn a-btn--sm e-btn-small', type: 'button', onclick: add }, icon('plus'), 'Add PD')) : null,
    h('div', { class: 'e-card e-card--flush' }, pds.length ? h('div', { class: 'e-list' }, pds.map(p => h('div', { class: 'e-row e-row--static' },
      avatar(p.name || p.email),
      h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, p.name || '(no name)'), h('span', { class: 'e-row__meta' }, p.email)),
      admin ? h('button', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet e-btn-small', type: 'button', 'aria-label': `Remove ${p.name || p.email}`, onclick: () => remove(p) }, 'Remove') : null)))
      : h('p', { class: 'e-small', style: 'padding:12px 16px;margin:0' }, 'No PDs yet.')));
}

// ---------- render ----------

let seq = 0;
async function render() {
  const n = ++seq;
  if (!S.user) return;
  if (!(S.roles.admin || S.roles.pd)) {
    header('APMES People');
    fill(app, empty('For admins and PDs', `${S.user.email} isn’t an admin or programme director. Residents and faculty use the logbook and evals.`,
      h('a', { class: 'a-btn', href: '../evals/' }, 'Open evals')));
    return;
  }
  const r = route();
  header(r === 'residents' ? 'APMES People' : SCREENS[r]);
  if (!data) {
    fill(app, h('p', { class: 'e-loading' }, 'Loading…'));
    try { await loadAll(); } catch (e) {
      if (n !== seq) return;
      fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load the people lists: ' + err(e)), h('button', { class: 'a-btn', onclick: reload }, 'Try again'));
      return;
    }
  }
  if (n !== seq) return;
  onRosterList = null;
  const pending = data.apps.filter(a => a.status === 'pending').length;
  const tabbed = TABS.some(([id]) => id === r);
  const body = r === 'intake' ? intakeScreen() : r === 'check' ? checkScreen() : r === 'roster' ? rosterScreen() : r === 'rotations' ? rotationsScreen({ demo: cloud.demo }) : r === 'faculty' ? facultyPane({ fac: data.fac, reload })
    : r === 'pds' ? pdsScreen() : r === 'applications' ? applicationsPane({ apps: data.apps, fac: data.fac, res: data.res, reload }) : residentsScreen();
  // the app kit's large title, then the segmented control for the four lists
  fill(app, h('div', { class: 'e-admin e-wide' },
    h('div', { class: 'e-titlebox' }, h('h1', { class: 'a-title' }, r === 'residents' ? 'People' : SCREENS[r])),
    tabbed ? segment(TABS.map(([id, label]) => ({ id, label, count: id === 'applications' ? pending : 0 })), r, id => { location.hash = '#' + id; }) : null,
    body));
  window.aRefreshBar?.();
}
hooks.render = () => reload();
window.addEventListener('hashchange', () => render());

// ---------- sign-in ----------

function signInScreen() {
  header('APMES People');
  fill(app, h('section', { class: 'e-card', style: 'max-width:520px;margin:0 auto' },
    h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'APMES People'),
    h('p', {}, 'The resident, faculty and programme director lists the logbook and evals share. For admins and PDs.'),
    h('button', { class: 'a-btn', type: 'button', onclick: async () => { try { await cloud.signIn(); } catch (e) { toast('Sign-in failed. ' + err(e)); } } }, 'Sign in with Google'),
    cloud.demo ? h('p', { class: 'e-small' }, 'Demo: made-up people, kept only in this browser.') : null));
}

if (cloud.demo && cloud.demoRole() !== 'admin') cloud.setDemoRole('admin');   // the demo opens as the admin
cloud.watchUser(async u => {
  S.user = u; data = null;
  if (!u) { S.roles = { admin: false, pd: false }; signInScreen(); return; }
  try { S.roles = await cloud.getRoles(u.email); } catch (e) { S.roles = { admin: false, pd: false }; toast('Couldn’t check your access. ' + err(e)); }
  render();
});
if (!cloud.enabled) fill(app, h('p', { class: 'e-alert' }, 'Sign-in isn’t set up.'));
