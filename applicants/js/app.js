// APMES Applicants: residents and faculty give confidential feedback on residency applicants (a 1-5 suitability score
// and a comment each). It reuses evals' sign-in and people lists (../../evals/js/), so the people who can answer are the
// ones already in People; what is new is here and in model.js.
// Stage 1 (PLAN.md): the round (title + applicants) lives on the device and travels as a private link; answers are saved on
// the device as the respondent types, and "Send" posts them to the department's Google Form when the round is wired to one.
// With ?demo: made-up applicants, the evals demo sign-in, and nothing leaves the browser.

import { S, h, fill, toast, cloud, modal, confirmBox, download, empty, applyTheme, errText, avatar, initials, debounce, row, segment } from '../../evals/js/ui-core.js';
import {
  INTRO, SCORES, parseNames, cleanRound, encodeRound, readRoundText, cleanAnswers, blank, statusOf, progress, warnings,
  formBody, formUrl, answersText, summary, resultsCSV, demoRound,
} from './model.js';
import * as store from './store.js';

applyTheme();

const app = document.getElementById('app');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const backEl = document.getElementById('back');
const meEl = document.getElementById('me');

// ---------- on-device storage (the demo keeps its own, apart from any real round) ----------

const NS = cloud.demo ? 'sel-demo' : 'sel';
const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const del = k => { try { localStorage.removeItem(k); } catch {} };
const K = { round: `${NS}-round`, ans: (c, e) => `${NS}-ans-${c}-${e}`, subs: c => `${NS}-subs-${c}` };

let round = null;      // the open round, or null
let answers = {};      // this respondent's answers, by applicant id
let sent = null;       // { at, via } once this respondent sent
let isCom = false;     // on the selection committee (may read the responses)

// A round link: the round travels after #r= . Read it before anything else so it survives sign-in.
(function takeLink() {
  const m = location.hash.match(/^#r=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const r = readRoundText(m[1]);
  history.replaceState(null, '', location.pathname + location.search + '#');
  if (r) { put(K.round, r); setTimeout(() => toast('Round opened: ' + r.title), 400); }
  else setTimeout(() => toast('That link didn’t work. Ask for a new one.'), 400);
})();

// The round: the open one in the shared store, else the newest closed one (staff and the committee still read it), else
// one that came in a link or was set up on this device.
async function loadRound() {
  let shared = null;
  if (S.user && mayAnswer()) { try { const all = await store.listRounds(); shared = all.find(r => r.status === 'open') || all[0] || null; } catch (e) { console.warn('Shared rounds unavailable', e); } }
  round = shared || cleanRound(get(K.round, null)) || (cloud.demo ? demoRound() : null);
}
async function loadMine() {
  answers = {}; sent = null;
  if (!round || !S.user) return;
  const mine = get(K.ans(round.cycle, S.user.email), {});
  answers = cleanAnswers(round, mine.a);
  sent = mine.sent || null;
  if (round.shared) {
    try {
      const r = await store.myResponse(round.cycle, S.user.email);
      if (r) { sent = { at: Number(r.updatedAt?.toMillis ? r.updatedAt.toMillis() : r.updatedAt) || Date.now(), via: 'store' }; if (!mine.a) answers = cleanAnswers(round, r.answers); }
      else if (sent?.via === 'store') sent = null;
    } catch (e) { console.warn('Couldn’t check for a sent response', e); }
  }
}
const saveMine = () => put(K.ans(round.cycle, S.user.email), { a: answers, sent });
const isStaff = () => !!(S.roles.admin || S.roles.pd);
const mayAnswer = () => isStaff() || !!S.roles.resident || (!!S.roles.faculty && S.roles.faculty.status !== 'INACTIVE');
const subs = () => (round && !round.shared ? get(K.subs(round.cycle), []) : []);
const canResults = () => !!S.roles.pd || isCom;
const isOpen = () => !round?.shared || round.status === 'open';

// ---------- routing ----------

const route = () => {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'a' && round?.applicants.some(x => x.id === b)) return { name: 'a', id: b };
  if (['review', 'done'].includes(a)) return { name: a };
  if ((a === 'setup' && isStaff()) || (a === 'results' && canResults())) return { name: a };
  return { name: 'home' };
};
const go = hash => { location.hash = hash; };

function header(title, { back = false } = {}) {
  titleEl.textContent = title;
  document.title = title === 'APMES Applicants' ? title : `${title} · APMES Applicants`;
  subEl.textContent = 'Demo'; subEl.hidden = !cloud.demo;
  backEl.hidden = !back;
  backEl.onclick = () => { history.length > 1 && route().name !== 'home' ? history.back() : go('#'); };
  fill(meEl, S.user ? h('button', { type: 'button', class: 'a-bar-btn e-appbar__me', title: S.user.email, 'aria-label': 'Account', onclick: account }, h('span', { class: 'a-avatar', 'aria-hidden': 'true' }, initials(S.user.name || S.user.email))) : null);
}

function account() {
  const role = S.roles.admin ? 'Admin' : S.roles.pd ? 'Programme director' : S.roles.resident ? 'Resident' : S.roles.faculty ? 'Faculty' : '';
  const kids = [
    h('p', {}, S.user.name, h('br'), h('span', { class: 'e-small' }, S.user.email)),
    h('p', { class: 'e-small' }, role ? role + ' · ' : '', 'the same sign-in as the logbook and evals.'),
  ];
  if (cloud.demo) kids.push(h('label', { class: 'e-label' }, 'Demo role', h('select', { class: 'e-select', onchange: e => { cloud.setDemoRole(e.target.value); location.reload(); } },
    ['resident', 'assessor', 'admin'].map(r => h('option', { value: r, selected: cloud.demoRole() === r }, { resident: 'Resident', assessor: 'Faculty', admin: 'Admin' }[r])))));
  const m = modal('Account', [
    ...kids,
    h('p', { class: 'e-small' }, h('a', { href: '../logbook/' }, 'Logbook'), ' · ', h('a', { href: '../evals/' }, 'Evals'), isStaff() ? [' · ', h('a', { href: '../people/' }, 'People')] : null),
    h('div', { class: 'e-actions' },
      round ? h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: async () => {
        if (!await confirmBox('Clear my answers?', 'This removes your scores and comments from this device. If you haven’t sent them, they’re gone.', 'Clear', true)) return;
        del(K.ans(round.cycle, S.user.email)); m.close(); loadMine().then(render);
      } }, 'Clear my answers') : null,
      h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Close'),
      h('button', { class: 'a-btn', type: 'button', onclick: async () => { m.close(); await cloud.signOut(); location.reload(); } }, 'Sign out')),
  ]);
}

// ---------- screens ----------

const chipFor = a => {
  const s = statusOf(a);
  return s === 'scored' ? h('span', { class: 'e-chip e-chip--submitted' }, 'Score ' + a.score)
    : s === 'partial' ? h('span', { class: 'e-chip e-chip--in-progress' }, a.score ? 'Score ' + a.score + ', no comment' : 'Comment, no score')
      : s === 'skipped' ? h('span', { class: 'e-chip e-chip--draft' }, 'Didn’t interact') : h('span', { class: 'e-chip e-chip--draft' }, 'Not yet');
};

function homeScreen() {
  if (!round) {
    return empty(isStaff() ? 'No round yet' : 'No round open on this device',
      isStaff() ? 'Set up the round: paste the applicants’ names, then share the private link with residents and faculty.' : 'Open the link you were sent for this round. If you can’t find it, ask the programme office.',
      isStaff() ? h('button', { class: 'a-btn', type: 'button', onclick: () => go('#setup') }, 'Set up the round') : null);
  }
  const p = progress(round, answers);
  const pct = Math.round((p.done / p.total) * 100);
  return h('div', { class: 'e-stack' },
    !isOpen() ? h('div', { class: 'e-warn-note' }, 'This round is closed. You can still look at your answers, but they can’t be sent any more.') : null,
    h('section', { class: 'e-card sl-intro' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, round.title),
      INTRO.map(t => h('p', {}, t)),
      h('div', { class: 'sl-conf' }, h('span', { 'aria-hidden': 'true' }, '🔒'), h('span', {}, 'Confidential. Only the selection committee sees who said what. Please don’t share your answers or discuss them with the applicants.')),
      h('div', { class: 'sl-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': p.total, 'aria-valuenow': p.done, 'aria-label': 'Applicants answered' }, h('i', { style: `width:${pct}%` })),
      h('p', { class: 'e-small' }, `${p.done} of ${p.total} answered${sent ? ' · sent' : ''}`)),
    h('div', { class: 'e-card e-card--flush' }, h('div', { class: 'e-list' }, round.applicants.map(a =>
      row({ name: a.name, title: a.name, chip: chipFor(answers[a.id]), onclick: () => go('#a/' + a.id) })))),
    h('div', { class: 'e-actions' },
      h('button', { class: 'a-btn e-go', type: 'button', onclick: () => go('#review') }, sent ? 'Review what you sent' : 'Review and send')));
}

function applicantScreen(id) {
  const idx = round.applicants.findIndex(a => a.id === id);
  const a = round.applicants[idx];
  const r = answers[id] || blank();
  answers[id] = r;
  header(a.name, { back: true });
  const saved = h('p', { class: 'sl-saved', 'aria-live': 'polite' });
  const save = () => { r.na = r.na && r.score == null && !r.comment.trim(); saveMine(); saved.textContent = 'Saved on this device'; };
  const scores = h('fieldset', { class: 'sl-scores' }, h('legend', { class: 'e-label' }, 'Overall suitability for residency, 1 (unsuitable) to 5 (best fit)'),
    SCORES.map(([v, label]) => h('label', {}, h('input', { type: 'radio', name: 'score', value: v, checked: r.score === v, disabled: r.na, onchange: () => { r.score = v; r.na = false; save(); naBox.checked = false; } }), h('b', {}, String(v)), h('span', {}, label))));
  // legend sits inside the grid: put it above instead
  const legend = scores.querySelector('legend'); legend.style.gridColumn = '1 / -1';
  const text = h('textarea', { class: 'e-textarea', id: 'sl-comment', rows: 5, maxlength: 5000, disabled: r.na, placeholder: 'e.g. observed strengths, weaknesses or concerns, with a specific example', 'aria-describedby': 'sl-hint',
    oninput: debounce(() => { r.comment = text.value; if (r.comment.trim()) r.na = false; naBox.checked = r.na; save(); }, 300) });
  text.value = r.comment;
  const naBox = h('input', { type: 'checkbox', checked: r.na, onchange: () => {
    if ((r.score || r.comment.trim()) && naBox.checked) { naBox.checked = false; toast('Clear the score and comment first.'); return; }
    r.na = naBox.checked; scores.querySelectorAll('input').forEach(i => { i.disabled = r.na; }); text.disabled = r.na; save();
  } });
  const prev = round.applicants[idx - 1], next = round.applicants[idx + 1];
  fill(app, h('div', { class: 'e-stack sl-col' },
    h('p', { class: 'sl-pos' }, `Applicant ${idx + 1} of ${round.applicants.length}`),
    h('section', { class: 'e-card' },
      scores,
      h('label', { class: 'e-label', for: 'sl-comment', style: 'margin-top:16px;display:block' }, 'Comments'),
      text,
      h('p', { class: 'e-hint', id: 'sl-hint' }, 'Specific examples help most: what you saw, when, and what it told you.'),
      h('label', { class: 'e-check', style: 'margin-top:12px' }, naBox, h('span', {}, 'I haven’t worked with this applicant')),
      saved),
    h('div', { class: 'sl-nav' },
      prev ? h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: () => go('#a/' + prev.id) }, '‹ ' + prev.name.split(' ')[0]) : h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: () => go('#') }, 'All applicants'),
      next ? h('button', { class: 'a-btn', type: 'button', onclick: () => go('#a/' + next.id) }, next.name.split(' ')[0] + ' ›') : h('button', { class: 'a-btn e-go', type: 'button', onclick: () => go('#review') }, 'Review'))));
  window.scrollTo(0, 0);
}

function reviewScreen() {
  header('Review and send', { back: true });
  const p = progress(round, answers);
  const w = warnings(round, answers);
  const nameIn = h('input', { class: 'e-input', id: 'sl-name', autocomplete: 'name', value: S.user.name || '', maxlength: 120 });
  const status = h('p', { class: 'e-small', 'aria-live': 'polite' });
  const send = h('button', { class: 'a-btn e-go', type: 'button', disabled: !isOpen() }, sent ? 'Send again' : 'Send');
  send.onclick = async () => {
    const who = nameIn.value.trim() || S.user.email;
    if (sent && !await confirmBox('Send again?', round.shared ? 'This replaces what you sent before.' : 'You already sent these. The committee will get a second copy.', 'Send again')) return;
    if (p.scored + p.partial === 0 && !await confirmBox('Nothing to send', 'You haven’t scored or commented on anyone. Send anyway?', 'Send anyway')) return;
    send.disabled = true; status.textContent = 'Sending…';
    try {
      const via = await deliver(who);
      sent = { at: Date.now(), via }; saveMine();
      if (via !== 'store') {
        const list = subs().filter(s => s.by !== S.user.email); list.push({ by: S.user.email, name: who, at: sent.at, answers });
        put(K.subs(round.cycle), list);
      }
      go('#done');
    } catch (e) { status.textContent = 'Couldn’t send: ' + errText(e) + ' Your answers are safe on this device; try again, or copy them below.'; send.disabled = false; }
  };
  fill(app, h('div', { class: 'e-stack sl-col' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, `${p.scored} scored with a comment`),
      h('p', { class: 'e-small' }, `${p.partial} partly answered · ${p.skipped} didn’t interact · ${p.todo} not answered`),
      w.length ? h('div', { class: 'e-warn-note' }, h('p', { style: 'margin:0 0 6px;font-weight:600' }, 'Worth a second look (you can still send):'),
        h('ul', { class: 'sl-comments' }, w.map(x => h('li', {}, h('a', { href: '#a/' + x.id }, x.name), ' ' + x.text)))) : h('p', { class: 'e-ok-note' }, 'Everyone is answered.')),
    h('section', { class: 'e-card' },
      h('label', { class: 'e-label', for: 'sl-name' }, 'Your name, as the committee will see it'),
      nameIn,
      !isOpen() ? h('p', { class: 'e-warn-note' }, 'This round is closed, so answers can’t be sent any more.') : null,
      h('p', { class: 'e-hint' }, round.shared ? 'Your answers go to the selection committee and the programme directors, who see who said what. Nobody else can read them.' : round.form ? 'Your answers go to the selection committee’s form. Nothing else is kept online.' : 'This round isn’t connected to a form yet, so “Send” keeps your answers on this device and shows them to the committee here. Use Copy to send them another way.'),
      h('div', { class: 'e-actions' }, send,
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(answersText(round, nameIn.value.trim() || S.user.name, answers)); toast('Copied'); } catch { toast('Couldn’t copy. Use Download.'); } } }, 'Copy'),
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: () => download(`feedback-${round.cycle}.txt`, new Blob([answersText(round, nameIn.value.trim() || S.user.name, answers)], { type: 'text/plain' })) }, 'Download')),
      status)));
}

// Stage 1 delivery: post to the Google Form when the round is wired to one (the reply can't be read from another site, so
// "sent" means the browser handed it over; the committee checks the response sheet). Otherwise it stays on this device.
async function deliver(who) {
  if (round.shared) { await store.sendResponse(round, S.user, who, answers); return 'store'; }
  if (cloud.demo || !round.form) return 'device';
  if (!navigator.onLine) throw new Error('No signal.');
  await fetch(formUrl(round), { method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', body: formBody(round, who, answers) });
  return 'form';
}

function doneScreen() {
  header('Thank you');
  fill(app, h('div', { class: 'e-stack sl-col' }, empty('Sent. Thank you.',
    sent?.via === 'store' || sent?.via === 'form' ? 'Your feedback went to the selection committee. You can come back and change it, then send again.' : 'Your feedback is saved on this device for the committee.',
    h('div', { class: 'e-actions' }, h('button', { class: 'a-btn', type: 'button', onclick: () => go('#') }, 'Back to the list')))));
}

// ---------- admins and PDs ----------

function setupScreen() {
  header('Set up the round');
  const titleIn = h('input', { class: 'e-input', id: 'su-title', value: round?.title || 'Applicant feedback', maxlength: 200 });
  const cycleIn = h('input', { class: 'e-input', id: 'su-cycle', value: round?.cycle === 'round' || !round ? '' : round.cycle, maxlength: 20, placeholder: 'e.g. 2027', disabled: !!round?.shared });
  const names = h('textarea', { class: 'e-textarea', id: 'su-names', rows: 8, placeholder: 'One name per line, in the order they should appear' });
  names.value = round ? round.applicants.map(a => a.name).join('\n') : '';
  const wired = round?.shared ? `Published (${round.status}): residents and faculty see it as soon as they open the app.` : round?.form ? 'Connected to a Google Form.' : 'Not published: answers stay on each person’s device, or go to the Google Form if the round is connected to one.';
  const out = h('div', {});
  const build = () => {
    const apps = parseNames(names.value);
    if (!apps.length) { toast('Add at least one name.'); return null; }
    // keep ids, and any form wiring, for names that were already there
    const old = new Map((round?.applicants || []).map(a => [a.name.toLowerCase(), a]));
    const merged = apps.map(a => old.get(a.name.toLowerCase()) || a);
    const used = new Set(); merged.forEach((a, i) => { if (used.has(a.id)) a.id = 'n' + (i + 1); used.add(a.id); });
    const next = cleanRound({ title: titleIn.value, cycle: cycleIn.value || 'round', applicants: merged, form: round?.form });
    if (!next) { toast('That round isn’t valid.'); return null; }
    return next;
  };
  const save = () => { const next = build(); if (!next) return null; put(K.round, next); round = next; loadMine(); return next; };
  // the shared store: everyone who may answer sees the round; close it to stop answers
  const publish = async status => {
    const next = build(); if (!next) return;
    if (next.cycle === 'round') { toast('Give the round an intake (for example 2027) first.'); return; }
    if (!round?.shared && !await confirmBox('Publish the round?', 'The applicants’ names go to the shared store, and every resident and faculty member in APMES can see them and answer.', 'Publish')) return;
    try { round = await store.saveRound(next, status); await loadMine(); toast(status === 'open' ? 'Published' : 'Closed'); render(); } catch (e) { toast('Couldn’t save. ' + errText(e)); }
  };
  const link = () => {
    const r = round?.shared ? build() : save(); if (!r) return;
    const url = `${location.origin}${location.pathname}#r=${encodeRound(r)}`;
    fill(out, h('p', { class: 'e-small' }, 'Send this link privately (WhatsApp or email) to residents and faculty. It carries the applicants’ names, so don’t post it anywhere public:'),
      h('textarea', { class: 'e-textarea sl-code', readonly: true, 'aria-label': 'Private link', onfocus: e => e.target.select() }, url),
      h('div', { class: 'e-actions' }, h('button', { class: 'a-btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Select the link and copy it.'); } } }, 'Copy link')));
  };
  const imp = h('textarea', { class: 'e-textarea sl-code', id: 'su-import', 'aria-label': 'Round link or JSON', placeholder: 'Paste a round link or round JSON' });
  fill(app, h('div', { class: 'e-stack sl-col' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'The round'),
      h('label', { class: 'e-label', for: 'su-title' }, 'Title'), titleIn,
      h('label', { class: 'e-label', for: 'su-cycle', style: 'margin-top:12px;display:block' }, 'Intake'), cycleIn,
      h('label', { class: 'e-label', for: 'su-names', style: 'margin-top:12px;display:block' }, 'Applicants'), names,
      h('p', { class: 'e-hint' }, wired + ' Names are never in the app’s code.'),
      h('div', { class: 'e-actions' },
        round?.shared
          ? [h('button', { class: 'a-btn', type: 'button', onclick: () => publish(round.status) }, 'Save changes'),
            h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: () => publish(round.status === 'open' ? 'closed' : 'open') }, round.status === 'open' ? 'Close the round' : 'Reopen the round')]
          : [h('button', { class: 'a-btn', type: 'button', onclick: () => publish('open') }, 'Publish to everyone'),
            h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: () => { if (save()) toast('Saved on this device'); } }, 'Save on this device only')],
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: link }, 'Make a private link')), out),
    committeeCard(),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Already have a round?'),
      h('p', { class: 'e-small' }, 'Paste a link or the round file (it may also connect the round to the committee’s Google Form).'),
      imp,
      h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: () => {
        const r = readRoundText(imp.value);
        if (!r) { toast('That didn’t look like a round.'); return; }
        put(K.round, r); round = r; loadMine().then(() => { toast('Round loaded'); render(); });
      } }, 'Load it'))),
    round && !round.shared ? h('section', { class: 'e-card' },
      h('button', { class: 'a-btn a-btn--danger a-btn--tinted', type: 'button', onclick: async () => {
        if (!await confirmBox('Remove the round?', 'This removes the round and the answers kept on this device. The Google Form’s responses aren’t touched.', 'Remove', true)) return;
        [K.round, K.ans(round.cycle, S.user.email), K.subs(round.cycle)].forEach(del); round = null; answers = {}; sent = null; go('#');
      } }, 'Remove the round from this device')) : null));
}

// who may read the responses besides the PDs: kept by admins and PDs
function committeeCard() {
  const box = h('div', {});
  const email = h('input', { class: 'e-input', id: 'cm-email', type: 'email', autocomplete: 'off', placeholder: 'name@example.com', 'aria-label': 'Committee member’s email' });
  const name = h('input', { class: 'e-input', id: 'cm-name', autocomplete: 'off', placeholder: 'Name', 'aria-label': 'Committee member’s name' });
  const draw = async () => {
    let list = [];
    try { list = await store.listCommittee(); } catch (e) { fill(box, h('p', { class: 'e-alert' }, 'Couldn’t load the committee. ' + errText(e))); return; }
    fill(box, list.length ? h('div', { class: 'e-list' }, list.map(m => h('div', { class: 'e-row e-row--static' },
      h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, m.name || m.email), m.name ? h('span', { class: 'e-row__meta' }, m.email) : null),
      h('button', { class: 'a-btn a-btn--tinted a-btn--sm', type: 'button', 'aria-label': 'Remove ' + (m.name || m.email), onclick: async () => {
        try { await store.removeCommittee(m.email); draw(); } catch (e) { toast('Couldn’t remove. ' + errText(e)); }
      } }, 'Remove')))) : h('p', { class: 'e-small' }, 'No one yet. The programme directors always see the responses.'));
  };
  draw();
  return h('section', { class: 'e-card' },
    h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Selection committee'),
    h('p', { class: 'e-small' }, 'They read every response, with names, as the programme directors do. Use the email they sign in with.'),
    box,
    h('div', { class: 'e-stack', style: 'margin-top:12px' }, email, name),
    h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: async () => {
      try { await store.saveCommittee({ email: email.value, name: name.value }); email.value = ''; name.value = ''; draw(); } catch (e) { toast(errText(e)); }
    } }, 'Add')));
}

async function resultsScreen() {
  header('Results');
  if (!round) { fill(app, empty('No round', '', null)); return; }
  const n = seq;
  let list;
  if (round.shared) {
    fill(app, h('p', { class: 'e-loading' }, 'Loading…'));
    try { list = (await store.listResponses(round.cycle)).map(r => ({ by: r.email, name: r.name, at: r.updatedAt, answers: cleanAnswers(round, r.answers) })); }
    catch (e) { fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load the responses. ' + errText(e))); return; }
    if (n !== seq) return;
  } else list = subs();
  const sum = summary(round, list);
  const staffBar = tabs('results');
  fill(app, h('div', { class: 'e-stack e-wide' },
    staffBar,
    h('div', { class: 'e-note' }, round.shared
      ? `${round.title} (${round.status}): ${list.length} ${list.length === 1 ? 'response' : 'responses'}. Only PDs and the committee see this screen.`
      : `${list.length} ${list.length === 1 ? 'response was' : 'responses were'} sent from this device. Answers sent to the Google Form are in its response sheet; publish the round to see everyone’s here.`),
    h('div', { class: 'e-table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Scores by applicant' }, h('table', { class: 'e-table' },
      h('thead', {}, h('tr', {}, ['Applicant', 'Mean', 'Scores', 'Didn’t interact'].map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, sum.map(s => h('tr', {}, h('th', { scope: 'row' }, s.name), h('td', { class: 'sl-mean' }, s.mean == null ? '–' : s.mean.toFixed(1)), h('td', {}, String(s.n)), h('td', {}, String(s.skipped))))))),
    sum.filter(s => s.comments.length).map(s => h('section', { class: 'e-card' }, h('h2', { class: 'e-h3', style: 'margin-top:0' }, s.name),
      h('ul', { class: 'sl-comments' }, s.comments.map(c => h('li', {}, c.text, ' ', h('span', { class: 'sl-who' }, '· ' + c.by)))))),
    list.length ? h('section', { class: 'e-card' }, h('h2', { class: 'e-h3', style: 'margin-top:0' }, 'Who has answered'),
      h('p', { class: 'e-small' }, list.map(s => s.name).sort((a, b) => a.localeCompare(b)).join(', '))) : null,
    h('div', { class: 'e-actions' }, h('button', { class: 'a-btn', type: 'button', disabled: !list.length, onclick: () => download(`results-${round.cycle}.csv`, new Blob([resultsCSV(round, list)], { type: 'text/csv' })) }, 'Download CSV'))));
  window.aRefreshBar?.();
}

// ---------- render and boot ----------

let seq = 0;
const tabs = cur => (isStaff() || canResults())
  ? segment([['home', 'Feedback', true], ['results', 'Results', canResults()], ['setup', 'Set up', isStaff()]].filter(t => t[2]).map(([id, label]) => ({ id, label })), cur, id => go(id === 'home' ? '#' : '#' + id)) : null;
async function render() {
  const n = ++seq;
  if (!S.user) return;
  if (!mayAnswer()) {
    header('APMES Applicants');
    fill(app, empty('For residents and faculty', `${S.user.email} isn’t on the resident or faculty list yet. Ask to be added, or apply for access in evals.`, h('a', { class: 'a-btn', href: '../evals/' }, 'Open evals')));
    return;
  }
  if (n !== seq) return;
  const r = route();
  const staffBar = ['home', 'setup'].includes(r.name) ? tabs(r.name) : null;   // Results draws its own, after it has loaded
  if (r.name === 'a') return applicantScreen(r.id);
  if (r.name === 'review' && round) return reviewScreen();
  if (r.name === 'done') return doneScreen();
  header(r.name === 'setup' ? 'Set up the round' : r.name === 'results' ? 'Results' : round ? round.title : 'APMES Applicants');
  backEl.hidden = true;
  const body = r.name === 'setup' ? (setupScreen(), null) : r.name === 'results' ? (resultsScreen(), null) : homeScreen();
  if (body) fill(app, h('div', { class: 'e-stack sl-col' }, staffBar, body));
  else if (staffBar) { backEl.hidden = true; app.prepend(h('div', { class: 'sl-col' }, staffBar)); }
  window.aRefreshBar?.();
}
window.addEventListener('hashchange', () => render());

function signInScreen() {
  header('APMES Applicants');
  fill(app, h('section', { class: 'e-card', style: 'max-width:520px;margin:0 auto' },
    h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'APMES Applicants'),
    h('p', {}, 'Confidential feedback on residency applicants, for residents and faculty. Sign in with the account you use for the logbook and evals.'),
    h('button', { class: 'a-btn', type: 'button', onclick: async () => { try { await cloud.signIn(); } catch (e) { toast('Sign-in failed. ' + errText(e)); } } }, 'Sign in with Google'),
    cloud.demo ? h('p', { class: 'e-small' }, 'Demo: made-up applicants, kept only in this browser.') : null));
}

cloud.watchUser(async u => {
  S.user = u;
  if (!u) { S.roles = { admin: false, pd: false }; signInScreen(); return; }
  try { S.roles = await cloud.getRoles(u.email); } catch (e) { S.roles = { admin: false, pd: false }; toast('Couldn’t check your access. ' + errText(e)); }
  await loadRound(); await loadMine();
  try { isCom = await store.isCommittee(u.email); } catch { isCom = false; }
  render();
});
if (!cloud.enabled) fill(app, h('p', { class: 'e-alert' }, 'Sign-in isn’t set up.'));
