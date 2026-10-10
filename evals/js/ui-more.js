// More (#more): account, apply for a role, demo role switch, settings, guide links, privacy, sign out.

import { S, h, fill, cloud, toast, hooks, avatar, isResident, isFaculty, isStaff, confirmBox } from './ui-core.js';
import { residentYear } from './engine.js';

const AUTOSCROLL_KEY = 'evals-autoscroll';   // 'off' turns auto-advance off (ui-form.js reads it)
const GUIDE_URL = 'https://github.com/flamingbeing/anawj-site/tree/main/evals/reference';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export function renderMore() {
  const root = h('div', { class: 'e-stack' });
  if (!S.user) return root;
  root.append(accountCard());
  const apply = applyCard();
  if (apply) root.append(apply);
  if (cloud.demo) root.append(demoCard());
  root.append(settingsCard(), guideCard(), privacyCard(),
    h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', type: 'button', onclick: signOut }, cloud.demo ? 'Sign out of the demo' : 'Sign out'));
  return root;
}

function roleNames() {
  const r = S.roles, out = [];
  if (r.admin) out.push('Admin');
  if (r.pd) out.push('Programme director');
  if (r.faculty) out.push(r.faculty.status === 'INACTIVE' ? 'Faculty (inactive)' : 'Faculty');
  if (r.resident) out.push(`Resident ${r.resident.rid}${residentYear(r.resident) ? ' · R' + residentYear(r.resident) : ''}${r.resident.status !== 'ACTIVE' ? ' · ' + r.resident.status.toLowerCase() : ''}`);
  return out;
}

function accountCard() {
  const roles = roleNames();
  return h('section', { class: 'e-card' },
    h('div', { style: 'display:flex;gap:12px;align-items:center;margin-bottom:12px' }, avatar(S.user.name || S.user.email),
      h('div', { style: 'min-width:0' }, h('h2', { class: 'e-h3', style: 'margin:0' }, S.user.name || S.user.email),
        h('div', { class: 'e-small', style: 'overflow-wrap:anywhere' }, S.user.email))),
    h('dl', { class: 'e-kv' }, h('dt', {}, 'Roles'), h('dd', {}, roles.length ? roles.join(', ') : 'None yet')));
}

// Apply for the role I don't have (one application per account; the admin decides it).
function applyCard() {
  const wantRes = !isResident(), wantFac = !S.roles.faculty;
  if (!wantRes && !wantFac) return null;
  const appl = S.roles.application;
  const card = h('section', { class: 'e-card' }, h('h2', { class: 'e-h3' }, wantRes && wantFac ? 'Join as resident or faculty' : wantRes ? 'Join as a resident' : 'Join as faculty'));
  const label = r => (r === 'faculty' ? 'faculty' : 'a resident');
  if (isStaff()) {
    card.append(h('p', { class: 'e-small' }, 'As an admin or programme director you can add yourself in People.'),
      h('div', { class: 'e-actions e-actions--start' }, h('a', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-small', href: '#people/faculty' }, 'Open People')));
    return card;
  }
  if (appl && appl.status === 'pending') {
    card.append(h('p', { class: 'e-note' }, `Application to join as ${label(appl.role)} sent. An admin or programme director will approve it.`),
      h('div', { class: 'e-actions' },
        h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-small', type: 'button', onclick: () => fill(card, h('h2', { class: 'e-h3' }, 'Change application'), applyForm(appl, wantRes, wantFac)) }, 'Change'),
        h('button', { class: 'n-btn e-btn-small', type: 'button', onclick: async () => { await hooks.refreshRoles(); toast(S.roles.application?.status === 'pending' ? 'Still waiting' : 'Updated'); } }, 'Check again')));
    return card;
  }
  if (appl && appl.status !== 'pending') {
    card.append(h('p', { class: 'e-small' }, appl.status === 'rejected'
      ? 'Your application was not approved. Contact the programme office if this is a mistake.'
      : `Your application to join as ${label(appl.role)} was approved. To add another role, contact the programme office.`));
    return card;
  }
  card.append(applyForm(null, wantRes, wantFac));
  return card;
}

function applyForm(prev, wantRes, wantFac) {
  const roles = [wantRes && ['resident', 'Resident', 'Request evaluations and track progress'], wantFac && ['faculty', 'Faculty', 'Assess residents']].filter(Boolean);
  let role = prev?.role && roles.some(r => r[0] === prev.role) ? prev.role : roles[0][0];
  const name = h('input', { class: 'e-input', id: 'more-apply-name', value: prev?.name || S.user.name || '', autocomplete: 'name', required: true });
  const note = h('textarea', { class: 'e-textarea', id: 'more-apply-note', rows: 2, placeholder: 'e.g. intake year, department' }, prev?.note || '');
  const msg = h('p', { class: 'e-alert', hidden: true, role: 'alert' });
  const btn = h('button', { class: 'n-btn e-go', type: 'submit' }, 'Apply');
  return h('form', { onsubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()) { msg.hidden = false; msg.textContent = 'Enter your name.'; return; }
    btn.disabled = true;
    try {
      await cloud.applyForRole({ role, name: name.value.trim(), note: note.value.trim() });
      toast('Application sent');
      await hooks.refreshRoles();
    } catch (err) { msg.hidden = false; msg.textContent = 'Could not apply: ' + (err.message || err); btn.disabled = false; }
  } },
    roles.length > 1 ? h('div', { class: 'e-radios', role: 'radiogroup', 'aria-label': 'Role' }, roles.map(([v, l, d]) =>
      h('label', { class: 'e-radio' }, h('input', { type: 'radio', name: 'more-apply-role', value: v, checked: v === role, onchange: () => { role = v; } }),
        h('span', { class: 'e-radio__text' }, h('b', {}, l), h('br'), h('span', { class: 'e-small' }, d)))))
      : h('p', { class: 'e-small' }, `Ask to be added as ${roles[0][1].toLowerCase()}: ${roles[0][2].toLowerCase()}.`),
    h('label', { class: 'e-label', for: 'more-apply-name' }, 'Your name'), name,
    h('label', { class: 'e-label', for: 'more-apply-note' }, 'Note (optional)'), note,
    msg,
    h('div', { class: 'e-actions' }, btn));
}

function demoCard() {
  const cur = cloud.demoRole ? cloud.demoRole() : S.demoRole;
  const base = location.pathname;
  const opt = (role, q, label, who) => h('a', { class: `e-row ${cur === role ? 'is-current' : ''}`, href: base + q, 'aria-current': cur === role ? 'true' : null },
    h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, label), h('span', { class: 'e-row__meta' }, who)),
    cur === role ? h('span', { class: 'e-chip e-chip--info' }, 'Current') : null);
  return h('section', { class: 'e-card e-card--flush' },
    h('h2', { class: 'e-section' }, 'Switch demo role'),
    h('div', { class: 'e-list' },
      opt('resident', '?demo', 'Resident', 'Demo Resident'),
      opt('assessor', '?demo=assessor', 'Assessor', 'Dr Demo Faculty'),
      opt('admin', '?demo=admin', 'Admin and programme director', 'Demo Admin')),
    h('div', { style: 'padding:12px 16px' },
      h('p', { class: 'e-small', style: 'margin:0 0 8px' }, 'The demo data is shared between roles in this browser. Open two tabs to play both sides.'),
      h('a', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-small', href: base + '?demo=reset', onclick: async e => {
        e.preventDefault();
        if (await confirmBox('Reset the demo?', 'All demo changes in this browser are wiped and the made-up data is loaded again.', 'Reset', true)) location.href = base + '?demo=reset';
      } }, 'Reset demo data')));
}

function settingsCard() {
  const on = store.get(AUTOSCROLL_KEY) !== 'off';
  const box = h('input', { type: 'checkbox', id: 'more-autoscroll', checked: on, onchange: e => {
    store.set(AUTOSCROLL_KEY, e.target.checked ? null : 'off');
    toast(e.target.checked ? 'Auto-scroll on' : 'Auto-scroll off');
  } });
  return h('section', { class: 'e-card' },
    h('h2', { class: 'e-h3' }, 'Settings'),
    h('label', { class: 'e-check', for: 'more-autoscroll' }, box,
      h('span', {}, h('b', {}, 'Scroll to the next question'), h('br'), h('span', { class: 'e-small' }, 'After you answer a question on a form. Saved on this device.'))));
}

function guideCard() {
  return h('section', { class: 'e-card' },
    h('h2', { class: 'e-h3' }, 'Guide and forms'),
    h('p', { class: 'e-small' }, 'The EPA requirements, form wording and guidebook extracts this app is built from.'),
    h('ul', { style: 'margin:0;padding-left:20px' },
      h('li', {}, h('a', { href: GUIDE_URL, target: '_blank', rel: 'noopener' }, 'Reference files (guidebook, EPAs, forms)')),
      h('li', {}, h('a', { href: GUIDE_URL + '/guidebook', target: '_blank', rel: 'noopener' }, 'Guidebook extracts by EPA'))));
}

function privacyCard() {
  return h('section', { class: 'e-card' },
    h('h2', { class: 'e-h3' }, 'About and privacy'),
    h('p', { class: 'e-small' }, 'An unofficial tool for requesting and completing APMES DOPS, Mini-CEX and EBD evaluations. It does not replace the official record.'),
    h('p', { class: 'e-small' }, 'Patient details are limited to initials, age band and gender. Never enter names, NRIC/FIN, record numbers or phone numbers in any box.'),
    h('p', { class: 'e-small' }, 'Evaluations are seen by the resident, the assessor and the programme’s admins and directors.'));
}

async function signOut() {
  try { await cloud.signOut(); }
  catch (err) { toast('Could not sign out: ' + (err.message || err)); }
}
