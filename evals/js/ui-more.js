// More (#more): account, apply for a role, demo role switch, settings, privacy, sign out.

import { S, h, fill, cloud, toast, hooks, avatar, isResident, isFaculty, isStaff, confirmBox, signOutSafely, segment, THEMES, themePref, setTheme, errText } from './ui-core.js';
import { residentYear } from './engine.js';

const AUTOSCROLL_KEY = 'evals-autoscroll';   // 'off' turns auto-advance off (ui-form.js reads it)
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export function renderMore() {
  // the app kit's settings screen: inset grouped lists with section captions
  const root = h('div', { class: 'e-more' });
  if (!S.user) return root;
  root.append(accountCard());
  const apply = applyCard();
  if (apply) root.append(h('p', { class: 'a-section' }, 'Join'), apply);
  if (cloud.demo) root.append(...demoCard());
  root.append(h('p', { class: 'a-section' }, 'Help'),
    h('ul', { class: 'a-list' }, h('li', {}, h('a', { class: 'a-row', href: '#how' }, h('span', { class: 'a-row-text' }, 'How evals work'), h('span', { class: 'a-chev', 'aria-hidden': 'true' })))));
  const inst = installCard();
  if (inst) root.append(inst);
  root.append(...settingsCard(), ...privacyCard(),
    h('ul', { class: 'a-list e-more__signout' }, h('li', {},
      h('button', { class: 'a-row a-row--center a-row--danger', type: 'button', onclick: signOut }, cloud.demo ? 'Sign out of the demo' : 'Sign out'))),
    ...versionLine());
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
  return h('ul', { class: 'a-list e-more__account', 'aria-label': 'Account' },
    h('li', {}, h('div', { class: 'a-row' }, avatar(S.user.name || S.user.email, 'e-avatar--lg'),
      h('span', { class: 'a-row-text' }, h('h2', { class: 'e-more__name' }, S.user.name || S.user.email),
        h('small', { style: 'overflow-wrap:anywhere' }, S.user.email)))),
    h('li', {}, h('div', { class: 'a-row' }, h('span', { class: 'a-row-text' }, 'Roles'),
      h('span', { class: 'e-more__roles' }, roles.length ? roles.join(', ') : 'None yet'))));
}

// Apply for the role I don't have (one application per account; the admin decides it).
function applyCard() {
  const wantRes = !isResident(), wantFac = !S.roles.faculty;
  if (!wantRes && !wantFac) return null;
  const appl = S.roles.application;
  const card = h('section', { class: 'a-card e-card' }, h('h2', { class: 'e-h3' }, wantRes && wantFac ? 'Join as resident or faculty' : wantRes ? 'Join as a resident' : 'Join as faculty'));
  const label = r => (r === 'faculty' ? 'faculty' : 'a resident');
  if (isStaff()) {
    card.append(h('p', { class: 'e-small' }, 'As an admin or programme director you can add yourself in People.'),
      h('div', { class: 'e-actions e-actions--start' }, h('a', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet e-btn-small', href: '#people/faculty' }, 'Open People')));
    return card;
  }
  if (appl && appl.status === 'pending') {
    card.append(h('p', { class: 'e-note' }, `Application to join as ${label(appl.role)} sent. An admin or programme director will approve it.`),
      h('div', { class: 'e-actions' },
        h('button', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet e-btn-small', type: 'button', onclick: () => fill(card, h('h2', { class: 'e-h3' }, 'Change application'), applyForm(appl, wantRes, wantFac)) }, 'Change'),
        h('button', { class: 'a-btn a-btn--sm e-btn-small', type: 'button', onclick: async () => { await hooks.refreshRoles(); toast(S.roles.application?.status === 'pending' ? 'Not approved yet. You’ll see it here once it is.' : 'Updated'); } }, 'Check again')));
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
  const btn = h('button', { class: 'a-btn e-go', type: 'submit' }, 'Apply');
  return h('form', { onsubmit: async e => {
    e.preventDefault();
    if (!name.value.trim()) { msg.hidden = false; msg.textContent = 'Enter your name.'; return; }
    btn.disabled = true;
    try {
      await cloud.applyForRole({ role, name: name.value.trim(), note: note.value.trim() });
      toast('Application sent');
      await hooks.refreshRoles();
    } catch (err) { msg.hidden = false; msg.textContent = 'Couldn’t send your application. ' + errText(err); btn.disabled = false; }
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
  // checkmark rows: the current role is ticked
  const opt = (role, q, label, who) => h('li', {}, h('a', { class: `a-row e-row ${cur === role ? 'is-current' : ''}`, href: base + q, 'aria-current': cur === role ? 'true' : null },
    h('span', { class: 'a-row-text' }, label, h('small', {}, who)),
    cur === role ? h('span', { class: 'a-pill a-pill--tint e-chip e-chip--info' }, 'Current') : null));
  return [
    h('h2', { class: 'a-section' }, 'Switch demo role'),
    h('ul', { class: 'a-list' },
      opt('resident', '?demo', 'Resident', 'Demo Resident'),
      opt('assessor', '?demo=assessor', 'Assessor', 'Dr Demo Faculty'),
      opt('admin', '?demo=admin', 'Admin and programme director', 'Demo Admin'),
      h('li', {}, h('button', { type: 'button', class: 'a-row a-row--center', onclick: () => import('./app.js').then(m => m.resetDemoData()) }, 'Reset demo data'))),
    h('p', { class: 'a-footnote' }, 'The demo data is shared between roles in this browser. Open two tabs to play both sides.')];
}

function settingsCard() {
  const on = store.get(AUTOSCROLL_KEY) !== 'off';
  const box = h('input', { type: 'checkbox', class: 'a-switch', role: 'switch', id: 'more-autoscroll', checked: on, onchange: e => {
    store.set(AUTOSCROLL_KEY, e.target.checked ? null : 'off');
    toast(e.target.checked ? 'Auto-scroll on' : 'Auto-scroll off');
  } });
  const theme = h('div', { role: 'group', 'aria-labelledby': 'more-theme-l' });
  const paintTheme = () => fill(theme, segment(THEMES.map(([id, label]) => ({ id, label })), themePref(), id => { setTheme(id); paintTheme(); }));
  paintTheme();
  return [
    h('h2', { class: 'a-section' }, 'Settings'),
    h('ul', { class: 'a-list' },
      h('li', {}, h('label', { class: 'a-row', for: 'more-autoscroll' },
        h('span', { class: 'a-row-text' }, 'Scroll to the next question', h('small', {}, 'After you answer a question on a form. Saved on this device.')), box)),
      h('li', {}, h('div', { class: 'a-row e-more-theme' }, h('span', { class: 'a-row-text', id: 'more-theme-l' }, 'Theme'), theme))),
    h('p', { class: 'a-footnote' }, 'Auto follows your phone’s light or dark setting. Saved on this device.')];
}

function privacyCard() {
  return [h('h2', { class: 'a-section' }, 'About and privacy'), h('section', { class: 'a-card e-more__about' },
    h('p', { class: 'e-small' }, 'An unofficial tool for requesting and completing APMES DOPS, Mini-CEX and EBD evaluations. It does not replace the official record.'),
    h('p', { class: 'e-small' }, 'Patient details are limited to initials, age band and gender. Never enter names, NRIC/FIN, record numbers or phone numbers in any box.'),
    h('p', { class: 'e-small' }, 'Evaluations are seen by the resident, the assessor and the programme’s admins and directors.'))];
}

const signOut = () => signOutSafely();

// App version and "Get the latest version" (owner, 14 Oct 2026, as in prewarm): small print at the bottom of More.
// The version is the name of the saved copy of the app (sw.js VERSION, stamped at deploy), so a phone stuck on an old
// one can be spotted. The button clears only this app's saved copy (never the logbook's) and reloads; answers not
// sent yet stay in Firestore's own offline store, but it still asks first.
function versionLine() {
  // two lines of small muted text (AGENTS.md): the version, then the link-styled button
  const ver = h('p', { class: 'e-appver' }, 'App version: checking…');
  const line = [ver, h('p', { class: 'e-appver' },
    h('button', { class: 'e-linkbtn', type: 'button', onclick: getLatest }, 'Not updating? Get the latest version'))];
  (window.caches ? caches.keys() : Promise.resolve([])).then(ks => {
    const k = ks.find(x => x.startsWith('evals-'));
    ver.textContent = k ? 'App version ' + k.replace(/^evals-/, '').replace(/-([0-9a-f]{8})$/, ' ($1)') : 'App version: not saved on this device';
  }).catch(() => { ver.textContent = 'App version: unknown'; });
  return line;
}

async function getLatest() {
  try { if (!(await fetch('sw.js', { cache: 'no-store' })).ok) throw new Error(); }
  catch { toast('No connection. Try again when you have signal.'); return; }
  if (!cloud.demo && await cloud.hasUnsentWrites() && !(await confirmBox('Some answers aren’t sent yet',
    'They stay saved on this phone and are sent once the app reopens with signal. Get the latest version now?', 'Get it'))) return;
  try {
    for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) if (/\/evals\/$/.test(r.scope)) await r.unregister();
    for (const k of await caches.keys()) if (k.startsWith('evals-')) await caches.delete(k);
  } catch { /* reload anyway */ }
  location.reload();
}

// ---------- How evals work (#how) ----------
// Plain steps for each role. Only what the app and the APMES guidebook already say (24 h, the same
// patient for at most 2 assessments, EBD by someone who co-managed, 15-minute corrections).

export function renderHow() {
  const step = (n, t, d) => h('li', { class: 'e-how__step' }, h('span', { class: 'e-how__n', 'aria-hidden': 'true' }, String(n)),
    h('div', {}, h('b', {}, t), d ? h('p', { class: 'e-small' }, d) : null));
  const forAssessors = h('section', { class: 'e-card' },
    h('h2', { class: 'e-h3' }, 'If you assess residents'),
    h('ol', { class: 'e-how' },
      step(1, 'A resident sends you a link or shows a QR code', 'After a case you supervised. Open it on your phone.'),
      step(2, 'Sign in with Google', 'Use the account the programme has for you (the link names it). If the link opened inside WhatsApp, open it in Chrome or Safari first: Google doesn’t allow signing in inside WhatsApp.'),
      step(3, 'Fill in the official form', 'DOPS, Mini-CEX or EBD, as in the APMES guidebook. Answers save as you go: you can stop and finish later from Evaluations.'),
      step(4, 'Submit within 24 hours', 'You can correct your answers for 15 minutes after submitting. The resident then sees your feedback.'),
      step(5, 'Can’t assess it?', 'Tap “I can’t assess this” at the top of the form and say why (for example, you didn’t observe the case, or for an EBD you didn’t co-manage it). The resident can send it to someone else.')));
  const forResidents = h('section', { class: 'e-card' },
    h('h2', { class: 'e-h3' }, 'If you are a resident'),
    h('ol', { class: 'e-how' },
      step(1, 'Request evaluation', 'Pick the item (Progress shows what’s due), then the assessor.'),
      step(2, 'Describe the case', 'Date, place, the patient’s initials, age band and gender only: no names or record numbers. The same patient can be used for at most 2 assessments. An EBD needs an assessor who co-managed the case.'),
      step(3, 'Show the QR code or share the link', 'Best done straight after the case. Without signal, the link works once your phone is back online.'),
      step(4, 'Follow up', 'Forms should be done within 24 hours. From Requests you can remind your assessor, or send a declined request to someone else.'),
      step(5, 'Track your progress', 'Progress counts submitted forms against the APMES EPA requirements for your year.')));
  const order = isResident() && !isFaculty() ? [forResidents, forAssessors] : [forAssessors, forResidents];
  return h('div', { class: 'e-stack' }, ...order,
    h('p', { class: 'e-small e-center' }, 'An unofficial tool for the APMES programme. It does not replace the official record.'));
}

// ---------- Install (home-screen app) ----------
// Chrome/Android offer an install prompt (beforeinstallprompt); iPhones need Share → Add to Home Screen.
let installEvent = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });
const standalone = () => typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
function installCard() {
  if (standalone() || cloud.demo) return null;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (!installEvent && !ios) return null;
  return h('section', { class: 'e-card' },
    h('h2', { class: 'e-h3' }, 'Add Evals to your home screen'),
    h('p', { class: 'e-small' }, 'It opens like an app, works without signal, and shows a badge when something needs you.'),
    installEvent ? h('button', { class: 'a-btn', type: 'button', onclick: async () => {
      const ev = installEvent; installEvent = null;
      ev.prompt();
      try { const r = await ev.userChoice; if (r.outcome === 'accepted') toast('Added to your home screen'); } catch {}
      hooks.render();
    } }, 'Install') : h('p', { class: 'e-small' }, 'In Safari, tap the Share button, then “Add to Home Screen”.'));
}
