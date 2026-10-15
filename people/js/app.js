// APMES People: one place for the people lists the logbook and evals share (residents, faculty, programme
// directors, applications to join). Admins and PDs only. It reuses evals' sign-in, storage and list screens
// (../../evals/js/), so a change there shows here too; what is new lives in batch.js (new intake, year check, CSV).
// Data: the logbook project's residents/{rid}, faculty/{email}, pds/{email}, applications/{uid}
// (logbook/firestore.rules). With ?demo, evals' in-browser demo backend instead (made-up people).

import { S, h, fill, toast, cloud, icon, initials, modal, confirmBox, download, segment, empty, applyTheme, errText, hooks, avatar } from '../../evals/js/ui-core.js';
import { residentsPane, facultyPane, applicationsPane, clearResidentsCache, pasteDialog, field, input, select, cleanEmail, validEmail } from '../../evals/js/ui-admin.js';
import { residentYear, todayISO } from '../../evals/js/engine.js';
import { parseIntake, yearIssues, yearCounts, peopleCSV, academicYear } from './batch.js';

applyTheme();

const app = document.getElementById('app');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const backEl = document.getElementById('back');
const meEl = document.getElementById('me');

const TABS = [['residents', 'Residents'], ['faculty', 'Faculty'], ['pds', 'PDs'], ['applications', 'Applications']];
const SCREENS = { residents: 'Residents', faculty: 'Faculty', pds: 'Programme directors', applications: 'Applications', intake: 'Add a new intake', check: 'Year check' };
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
  backEl.hidden = !(r === 'intake' || r === 'check');
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
  const pending = data.apps.filter(a => a.status === 'pending').length;
  const tabbed = TABS.some(([id]) => id === r);
  const body = r === 'intake' ? intakeScreen() : r === 'check' ? checkScreen() : r === 'faculty' ? facultyPane({ fac: data.fac, reload })
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
