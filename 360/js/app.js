// APMES CCC 360: before a CCC meeting the programme coordinators (PCs) need each resident's scholarly projects and the
// people who should give them multisource feedback (MSF). This is the resident's half: fill both in, send, and change
// them until the PCs close the round. It reuses evals' sign-in and people lists (../../evals/js/), so the residents are
// the ones already in People; what is new is here, in model.js and in store.js. The coordinators' half is staff.js.
// With ?demo: a made-up round and people, the evals demo sign-in, and nothing leaves the browser.

import { S, h, fill, toast, cloud, modal, confirmBox, empty, applyTheme, errText, initials, debounce, row } from '../../evals/js/ui-core.js';
import {
  GROUPS, GROUP, STATUSES, LISTS, cleanEntry, blankEntry, cleanNominees, nomineeCounts, canAdd, cleanNominee, newId, carryOver,
  problems, warnings, progress, snapshot, suggestFaculty, contactEmail, monthText, dayText, pastDeadline,
} from './model.js';
import * as store from './store.js';
import { staffScreen } from './staff.js';

applyTheme();

const app = document.getElementById('app');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const backEl = document.getElementById('back');
const meEl = document.getElementById('me');

const NS = cloud.demo ? 'ccc-demo' : 'ccc';
const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const del = k => { try { localStorage.removeItem(k); } catch {} };
const draftKey = () => `${NS}-draft-${round.round}-${S.user.email}`;

let rounds = [];       // every round, newest first
let round = null;      // the one shown: the newest open round, else the newest closed one
let entry = blankEntry();
let nominees = [];
let sentSnap = null;   // snapshot of what was last sent (null: nothing sent yet)
let sentAt = 0;
let carried = null;    // the earlier round whose projects were carried over, if any
let faculty = [];      // for the nominee picker
let people = [];       // the other active residents, for the peer picker

const isResident = () => !!S.roles.resident;
const isStaff = () => !!(S.roles.admin || S.roles.pd || S.roles.owner);   // PDs, Admin staff and PCs (getRoles reads access/ too)
const isOpen = () => round?.status === 'open';
const locked = () => !isOpen();

// ---------- loading ----------

async function loadAll() {
  rounds = []; round = null; faculty = []; people = [];
  entry = blankEntry(); nominees = []; sentSnap = null; sentAt = 0; carried = null;
  if (!S.user) return;
  if (!isResident()) return;
  rounds = await store.listRounds();
  round = rounds.find(r => r.status === 'open') || rounds[0] || null;
  cloud.listFaculty().then(l => { faculty = l || []; }).catch(e => console.warn('Faculty list unavailable', e));
  cloud.listActiveResidents().then(l => { people = (l || []).filter(r => String(r.email).toLowerCase() !== String(S.user.email).toLowerCase()); }).catch(e => console.warn('Resident list unavailable', e));
  if (!round) return;
  const got = await store.mine(round.round, S.user.email);
  if (got) { entry = got.entry; nominees = got.nominees; sentSnap = snapshot(entry, nominees); sentAt = got.sentAt; }
  else if (isOpen()) {
    try {
      const prev = await store.previousEntry(rounds, round.round, S.user.email);
      if (prev) { entry = carryOver(prev.entry); carried = prev.round; }
    } catch (e) { console.warn('Couldn’t look for earlier projects', e); }
  }
  // what was typed on this device and not yet sent wins over what is on the server
  const draft = get(draftKey(), null);
  if (draft && isOpen()) { entry = cleanEntry(draft.entry); nominees = cleanNominees(draft.nominees); if (draft.carried === false) carried = null; }
}
const saveDraft = () => put(draftKey(), { entry, nominees, carried: !!carried });
const dirty = () => sentSnap !== snapshot(entry, nominees);

// ---------- routing ----------

const route = () => {
  const [a, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'staff' && isStaff()) return { name: 'staff', parts: rest };
  return { name: ['projects', 'nominees', 'review'].includes(a) && round && isResident() ? a : 'home' };
};
const go = hash => { location.hash = hash; };

function header(title, { back = false, to = '#' } = {}) {
  titleEl.textContent = title;
  document.title = title === 'APMES CCC 360' ? title : `${title} · APMES CCC 360`;
  subEl.textContent = 'Demo'; subEl.hidden = !cloud.demo;
  backEl.hidden = !back;
  backEl.onclick = () => go(to);
  fill(meEl, S.user ? h('button', { type: 'button', class: 'a-bar-btn e-appbar__me', title: S.user.email, 'aria-label': 'Account', onclick: account }, h('span', { class: 'a-avatar', 'aria-hidden': 'true' }, initials(S.user.name || S.user.email))) : null);
}

function account() {
  const role = isStaff() ? 'Coordinator or staff' : isResident() ? 'Resident' : '';
  const kids = [
    h('p', {}, S.user.name, h('br'), h('span', { class: 'e-small' }, S.user.email)),
    h('p', { class: 'e-small' }, role ? role + ' · ' : '', 'the same sign-in as the logbook and evals.'),
  ];
  if (cloud.demo) kids.push(h('label', { class: 'e-label' }, 'Demo role', h('select', { class: 'e-select', onchange: e => { cloud.setDemoRole(e.target.value); location.reload(); } },
    ['resident', 'admin'].map(r => h('option', { value: r, selected: cloud.demoRole() === r }, { resident: 'Resident', admin: 'Admin' }[r])))));
  const m = modal('Account', [
    ...kids,
    h('p', { class: 'e-small' }, h('a', { href: '../logbook/' }, 'Logbook'), ' · ', h('a', { href: '../evals/' }, 'Evals')),
    h('div', { class: 'e-actions' },
      h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Close'),
      h('button', { class: 'a-btn', type: 'button', onclick: async () => { m.close(); await cloud.signOut(); location.reload(); } }, 'Sign out')),
  ]);
}

// ---------- small building blocks ----------

const lbl = (text, el, attrs = {}) => h('label', { class: 'e-label', ...attrs }, text, el);
const txt = (attrs = {}) => h('input', { class: 'e-input', autocomplete: 'off', ...attrs });
const chip = (kind, text) => h('span', { class: `a-pill ${kind === 'ok' ? 'a-pill--ok' : kind === 'warn' ? 'a-pill--warn' : ''} e-chip e-chip--${kind === 'ok' ? 'submitted' : kind === 'warn' ? 'in-progress' : 'draft'}` }, text);
const touch = debounce(() => { saveDraft(); refreshSaved(); }, 250);
let savedEl = null;
function refreshSaved() { if (savedEl) savedEl.textContent = dirty() ? 'Saved on this device. Not sent yet.' : 'Everything is sent.'; }
const note = () => { savedEl = h('p', { class: 'cc-sent', 'aria-live': 'polite' }); refreshSaved(); return savedEl; };

// ---------- home ----------

function homeScreen() {
  header('APMES CCC 360');
  if (!S.user) return;
  if (!isResident()) {
    if (isStaff()) return go('#staff');   // coordinators and directors who are not residents go straight to their view
    return fill(app, empty('For residents', `${S.user.email} isn’t on the resident list. Ask a coordinator to check People.`, h('a', { class: 'a-btn', href: '../evals/' }, 'Open evals')));
  }
  if (!round) return fill(app, empty('No round open', 'The programme coordinators open a round before each CCC meeting. You will see it here.'));
  const p = progress(entry, nominees);
  const c = nomineeCounts(nominees);
  const total = nominees.length;
  const pChip = p.projects === 'filled' ? chip('ok', `${entry.projects.length} project${entry.projects.length === 1 ? '' : 's'}`) : p.projects === 'none' ? chip('ok', 'None to report')
    : p.projects === 'partial' ? chip('warn', 'Lists only') : chip('draft', 'Not started');
  const nChip = total ? chip('ok', `${total} nominee${total === 1 ? '' : 's'}`) : chip('draft', 'Not started');
  const due = dayText(round.deadline);
  fill(app, h('div', { class: 'e-stack cc-col' },
    !isOpen() ? h('div', { class: 'e-warn-note' }, 'This round is closed. You can still look at what you sent, but it can’t be changed any more.') : null,
    carried && isOpen() ? h('div', { class: 'e-ok-note' }, `Your scholarly projects were carried over from “${carried.title}”. Check that each is still right, then send.`) : null,
    h('section', { class: 'e-card cc-intro' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, round.title),
      h('p', {}, 'Before the CCC meeting the programme coordinators need two things from you: the scholarly projects you are doing, and the people who should give you feedback.'),
      due ? h('p', { class: 'e-small' }, `Please send by ${due}.`, isOpen() && pastDeadline(round) ? ' That date has passed, but the round is still open.' : '') : null,
      h('div', { class: 'cc-private' }, h('span', { 'aria-hidden': 'true' }, '🔒'), h('span', {}, 'Only the programme coordinators and directors see this. The people you nominate are contacted by the coordinators; you choose who.')),
      sentSnap ? h('p', { class: 'cc-sent' }, dirty() ? 'You have changes that are not sent yet.' : 'Sent' + (sentAt ? ` on ${new Date(sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : '') + '.') : null),
    h('div', { class: 'e-card e-card--flush' }, h('div', { class: 'e-list' },
      row({ name: 'P', title: 'Scholarly projects', meta: 'Projects, committees, teaching and conferences', chip: pChip, onclick: () => go('#projects') }),
      row({ name: 'F', title: 'Feedback nominees', meta: GROUPS.map(g => `${c[g.id]} ${g.label.toLowerCase()}`).join(' · '), chip: nChip, onclick: () => go('#nominees') }))),
    isOpen() ? h('div', { class: 'e-actions' }, h('button', { class: 'a-btn e-go', type: 'button', onclick: () => go('#review') }, sentSnap ? 'Review and send again' : 'Review and send')) : null,
    isStaff() ? h('div', { class: 'e-actions e-actions--start' }, h('a', { class: 'a-btn a-btn--tinted', href: '#staff' }, 'Coordinators’ view')) : null));
}

// ---------- scholarly projects ----------

function projectsScreen() {
  header('Scholarly projects', { back: true });
  const lock = locked();
  const box = h('div', { class: 'e-stack' });
  const na = h('input', { type: 'checkbox', id: 'cc-na', checked: entry.noProjects, disabled: lock || entry.projects.length > 0,
    onchange: () => { entry.noProjects = na.checked; touch(); draw(); } });
  const draw = () => {
    na.disabled = lock || entry.projects.length > 0; na.checked = entry.noProjects;
    fill(box,
      entry.projects.map((p, i) => {
        const title = txt({ value: p.title, maxlength: 200, disabled: lock, oninput: () => { p.title = title.value; touch(); } });
        const sup = txt({ value: p.supervisor, maxlength: 120, disabled: lock, oninput: () => { p.supervisor = sup.value; touch(); } });
        const st = h('select', { class: 'e-select', disabled: lock, onchange: () => { p.status = st.value; touch(); } }, STATUSES.map(s => h('option', { value: s, selected: p.status === s }, s)));
        const start = txt({ type: 'month', value: p.start, disabled: lock, onchange: () => { p.start = start.value; touch(); } });
        const end = txt({ type: 'month', value: p.end, disabled: lock, onchange: () => { p.end = end.value; touch(); } });
        const nt = h('textarea', { class: 'e-textarea', rows: 3, maxlength: 1000, disabled: lock, oninput: () => { p.note = nt.value; touch(); } }); nt.value = p.note;
        return h('section', { class: 'e-card cc-card', 'aria-label': `Project ${i + 1}` },
          h('div', { class: 'cc-head' }, h('h3', {}, `Project ${i + 1}`),
            lock ? null : h('button', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet', type: 'button', 'aria-label': `Remove project ${i + 1}`, onclick: async () => {
              if (!await confirmBox('Remove this project?', p.title || 'It has no title yet.', 'Remove', true)) return;
              entry.projects.splice(i, 1); touch(); draw();
            } }, 'Remove')),
          lbl('Title', title), lbl('Supervisor', sup), lbl('Status', st),
          h('div', { class: 'cc-pair' }, lbl('Started', start), lbl('Expected end or ended', end)),
          lbl('Progress or notes', nt));
      }),
      lock ? null : h('div', { class: 'e-actions e-actions--start' }, h('button', { class: 'a-btn a-btn--tinted', type: 'button', disabled: entry.projects.length >= 30,
        onclick: () => { entry.projects.push({ id: newId(), title: '', supervisor: '', status: 'Ongoing', start: '', end: '', note: '' }); entry.noProjects = false; touch(); draw(); setTimeout(() => box.querySelector('section:last-of-type input')?.focus(), 0); } }, 'Add a project')));
  };
  draw();
  const lists = LISTS.map(l => {
    const ta = h('textarea', { class: 'e-textarea', rows: 4, id: `cc-${l.key}`, disabled: lock, 'aria-describedby': `cc-${l.key}-h`, oninput: () => { entry[l.key] = ta.value.split(/\r?\n/); touch(); } });
    ta.value = entry[l.key].join('\n');
    // keep the blank lines while typing; they are dropped when saved or sent
    return h('section', { class: 'e-card cc-card' }, h('label', { class: 'e-label', for: `cc-${l.key}` }, l.label), ta, h('p', { class: 'e-hint', id: `cc-${l.key}-h` }, l.hint));
  });
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Projects you are doing now'),
      h('p', { class: 'e-small' }, 'Scholarly projects: research, audit, quality improvement. State the progress, and the start and end dates.'),
      h('label', { class: 'e-check', style: 'margin-top:8px' }, na, h('span', {}, 'I have no scholarly projects'))),
    box, ...lists, lock ? null : note(),
    h('div', { class: 'e-actions' }, h('button', { class: 'a-btn e-go', type: 'button', onclick: () => { saveDraft(); go('#nominees'); } }, 'Next: feedback nominees'))));
  window.scrollTo(0, 0);
}

// ---------- feedback nominees ----------

function nomineesScreen() {
  header('Feedback nominees', { back: true });
  const lock = locked();
  const box = h('div', { class: 'e-stack' });
  const draw = () => {
    fill(box, GROUPS.map(g => {
      const mine = nominees.filter(n => n.group === g.id);
      return h('section', { class: 'e-card cc-card', 'aria-label': g.label },
        h('div', { class: 'cc-head' }, h('h3', {}, g.label), h('span', { class: 'cc-count' }, `${mine.length} of ${g.max}`)),
        h('p', { class: 'e-hint', style: 'margin:0' }, g.hint),
        mine.map(n => nomineeCard(n, g, lock)),
        lock ? null : h('div', { class: 'e-actions e-actions--start' }, h('button', { class: 'a-btn a-btn--tinted', type: 'button', disabled: !canAdd(nominees, g.id), 'data-add': g.id,
          onclick: () => { nominees.push({ id: newId(), group: g.id, name: '', email: '' }); touch(); draw(); setTimeout(() => [...box.querySelectorAll(`section[aria-label="${g.label}"] .cc-name`)].pop()?.focus(), 0); } }, `Add ${g.one.toLowerCase()}`)));
    }));
  };
  function nomineeCard(n, g, lock) {
    const sug = h('ul', { class: 'cc-sug', 'aria-label': 'Faculty suggestions', hidden: true });
    const name = txt({ class: 'e-input cc-name', value: n.name, maxlength: 120, disabled: lock, autocapitalize: 'words', 'aria-label': `${g.one} name`, oninput: () => { n.name = name.value; n.fac = undefined; touch(); suggest(); } });
    const email = txt({ type: 'email', value: n.email, maxlength: 200, disabled: lock, autocapitalize: 'off', spellcheck: 'false', 'aria-label': `${g.one} email`, oninput: () => { n.email = email.value; touch(); } });
    const suggest = () => {
      const q = name.value;
      const list = g.id === 'senior' ? suggestFaculty(faculty, q) : g.id === 'peer' ? suggestFaculty(people, q)
        : g.id === 'other' ? [...suggestFaculty(faculty, q, 3), ...suggestFaculty(people, q, 3)] : [];
      sug.hidden = !list.length;
      fill(sug, list.map(f => h('li', {}, h('button', { type: 'button', onclick: () => {
        n.name = f.name; n.email = contactEmail(f); n.fac = f.rid ? undefined : f.email; name.value = n.name; email.value = n.email; sug.hidden = true; touch(); email.focus();
      } }, h('span', {}, f.name), f.core || f.ccc ? h('span', { class: 'cc-badge' }, f.ccc ? 'CCC' : 'Core') : null))));
    };
    return h('div', { class: 'cc-card' },
      h('div', { class: 'cc-pair' },
        h('div', {}, lbl('Name', name), sug),
        lbl(g.emailRequired ? 'Email (needed)' : 'Email', email)),
      lock ? null : h('div', { class: 'e-actions e-actions--start' }, h('button', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet', type: 'button', 'aria-label': `Remove ${n.name || 'this nominee'}`, onclick: () => {
        nominees = nominees.filter(x => x !== n); touch(); draw();
      } }, 'Remove')));
  }
  draw();
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Who should give you feedback?'),
      h('p', { class: 'e-small' }, 'List colleagues you worked with in the past 5 months. You decide who. The programme coordinators will email them. Start typing a name to pick a faculty member or a resident from the list.')),
    box, lock ? null : note(),
    h('div', { class: 'e-actions' }, h('button', { class: 'a-btn e-go', type: 'button', onclick: () => { saveDraft(); go('#review'); } }, 'Review and send'))));
  window.scrollTo(0, 0);
}

// ---------- review and send ----------

function reviewScreen() {
  header('Review and send', { back: true });
  const e = cleanEntry(entry), ns = cleanNominees(nominees);
  const bad = problems(e, ns), warn = warnings(e, ns);
  const c = nomineeCounts(ns);
  const nameIn = txt({ id: 'cc-name', value: S.roles.resident?.name || S.user.name || '', maxlength: 120, autocomplete: 'name' });
  const status = h('p', { class: 'e-small', 'aria-live': 'polite' });
  const send = h('button', { class: 'a-btn e-go', type: 'button', disabled: !isOpen() || bad.length > 0 }, sentSnap ? 'Send again' : 'Send');
  send.onclick = async () => {
    send.disabled = true; status.textContent = 'Sending…';
    try {
      entry = e; nominees = ns;
      sentAt = await store.send(round.round, S.user, nameIn.value.trim() || S.user.email, e, ns);
      sentSnap = snapshot(e, ns); del(draftKey()); carried = null;
      toast('Sent. You can change it until the round closes.'); go('#');
    } catch (err) { status.textContent = 'Couldn’t send: ' + errText(err) + ' What you typed is safe on this device. Try again.'; send.disabled = false; }
  };
  const fix = x => h('li', {}, x.text, ' ', h('a', { href: x.where === 'nominees' ? '#nominees' : '#projects' }, 'Fix'));
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Scholarly projects'),
      e.projects.length ? h('ul', { class: 'cc-list' }, e.projects.map(p => h('li', {}, h('b', {}, p.title || '(no title)'), ` · ${p.status}`, p.supervisor ? ` · ${p.supervisor}` : '',
        p.start || p.end ? ` · ${monthText(p.start) || '?'} to ${monthText(p.end) || 'ongoing'}` : '')))
        : h('p', { class: 'e-small' }, e.noProjects ? 'None to report.' : 'None yet.'),
      LISTS.map(l => e[l.key].length ? h('p', { class: 'e-small' }, h('b', {}, l.label + ': '), e[l.key].join('; ')) : null)),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, `Feedback nominees (${ns.length})`),
      ns.length ? h('ul', { class: 'cc-list' }, ns.map(n => h('li', {}, h('b', {}, n.name || n.email), ` · ${GROUP[n.group].one}`, n.email ? ` · ${n.email}` : ''))) : h('p', { class: 'e-small' }, 'None yet.'),
      h('p', { class: 'e-small' }, GROUPS.map(g => `${c[g.id]} of ${g.max} ${g.label.toLowerCase()}`).join(' · '))),
    bad.length ? h('div', { class: 'e-alert', role: 'alert' }, h('p', { style: 'margin:0 0 6px;font-weight:600' }, 'Fix these before sending:'), h('ul', { class: 'cc-list' }, bad.map(fix))) : null,
    warn.length ? h('div', { class: 'e-warn-note' }, h('p', { style: 'margin:0 0 6px;font-weight:600' }, 'Worth a second look (you can still send):'), h('ul', { class: 'cc-list' }, warn.map(fix)))
      : !bad.length ? h('p', { class: 'e-ok-note' }, 'Everything looks complete.') : null,
    h('section', { class: 'e-card' },
      lbl('Your name, as the coordinators will see it', nameIn),
      !isOpen() ? h('p', { class: 'e-warn-note' }, 'This round is closed, so nothing can be sent any more.') : null,
      h('p', { class: 'e-hint' }, 'The coordinators and programme directors read this. The people you nominate are only contacted by the coordinators. You can change and send again until the round closes.'),
      h('div', { class: 'e-actions' }, send), status)));
  window.scrollTo(0, 0);
}

// ---------- render ----------

let seq = 0;
async function render() {
  const n = ++seq;
  if (!S.user) return;
  const r = route();
  if (r.name === 'staff') { await staffScreen(r.parts, { app, header, go, render }); if (n !== seq) return; }
  else if (r.name === 'home') homeScreen();
  else if (r.name === 'projects') projectsScreen();
  else if (r.name === 'nominees') nomineesScreen();
  else reviewScreen();
  if (n !== seq) return;
  window.aRefreshBar?.();
}
window.addEventListener('hashchange', () => render());

function signInScreen() {
  header('APMES CCC 360');
  fill(app, h('section', { class: 'e-card', style: 'max-width:520px;margin:0 auto' },
    h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'APMES CCC 360'),
    h('p', {}, 'Before each CCC meeting, send the programme coordinators your scholarly projects and the people who should give you feedback.'),
    h('button', { class: 'a-btn', type: 'button', onclick: async () => { try { await cloud.signIn(); } catch (e) { toast('Sign-in failed. ' + errText(e)); } } }, 'Sign in with Google'),
    cloud.demo ? h('p', { class: 'e-small' }, 'Demo: a made-up round, kept only in this browser.') : null));
}

cloud.watchUser(async u => {
  S.user = u;
  if (!u) { S.roles = {}; signInScreen(); return; }
  fill(app, h('p', { class: 'e-loading' }, 'Loading…'));
  try { S.roles = await cloud.getRoles(u.email); } catch (e) { S.roles = {}; toast('Couldn’t check your access. ' + errText(e)); }
  try { await loadAll(); } catch (e) { fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load the round: ' + errText(e)), h('button', { class: 'a-btn', type: 'button', onclick: () => location.reload() }, 'Try again')); return; }
  render();
});
if (!cloud.enabled) fill(app, h('p', { class: 'e-alert' }, 'Sign-in isn’t set up.'));
