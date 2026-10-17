// Private feedback. Residents: More → Send feedback (saved to Firestore feedback/{id}; only the app owner can read it).
// The owner: More → Feedback, a list with Mark done, Delete and Copy as task (names and numbers taken out).
// Residents must never use the site's public routes (the page editor, the 💬 button): those make public GitHub issues.
// Nothing from the screen or the logbook is attached: only the typed text, the page's name, the app version and browser.

import { S, h, toast, fill, cloud, okNoIds, confirmBox, emptyState, hooks } from './ui-core.js';
import { copyText } from './share.js';
import { appVersion } from './app-version.js';
import { feedbackRecord, sendProblem, taskText, byNewestFeedback, screenOf, TEXT_MAX, DOING_MAX } from './feedback.js';


let sentNote = false;   // after a send, the page says so until it is left
let draft = '';   // text to start the box with (Themes → Suggest a theme), used once
export const setFeedbackDraft = t => { draft = String(t || ''); sentNote = false; };
const rerender = () => hooks.render();

export function renderFeedbackSend() {
  if (sentNote) {
    return h('div', {}, h('section', { class: 'card feedback-sent', role: 'status' },
      h('h2', {}, 'Sent'),
      h('p', {}, 'Sent. Only the programme owner can read this.'),
      h('div', { class: 'bar', style: 'margin-bottom:0' }, h('button', { onclick: () => { sentNote = false; rerender(); } }, 'Send more feedback'))));
  }
  const text = h('textarea', { id: 'fb-text', rows: '6', maxlength: String(TEXT_MAX), 'aria-describedby': 'fb-count' });
  if (draft) { text.value = draft; draft = ''; }
  const count = h('span', { id: 'fb-count', class: 'hint' }, `${text.value.length} / ${TEXT_MAX}`);
  const doing = h('input', { id: 'fb-doing', type: 'text', maxlength: String(DOING_MAX), autocomplete: 'off' });
  const tick = h('input', { id: 'fb-tick', type: 'checkbox' });
  const note = h('p', { class: 'hint fb-problem', role: 'alert', hidden: true });
  const btn = h('button', { class: 'primary', type: 'submit' }, 'Send');
  text.addEventListener('input', () => { count.textContent = `${text.value.length} / ${TEXT_MAX}`; note.hidden = true; });
  const form = h('form', { class: 'feedback-form', onsubmit: async e => {
    e.preventDefault();
    const problem = sendProblem({ text: text.value, doing: doing.value, tick: tick.checked });
    if (problem) { note.textContent = problem; note.hidden = false; (problem.startsWith('Tick') ? tick : problem.includes('doing') ? doing : text).focus(); return; }
    if (!(await okNoIds(text.value, doing.value))) return;
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const rec = feedbackRecord({ uid: S.user.uid, text: text.value, doing: doing.value, screen: S.lastScreen || location.hash, version: await appVersion(), ua: navigator.userAgent });
      const reached = await cloud.sendFeedback(rec);
      if (!reached) toast('No signal: it will send when you’re back online.');
      sentNote = true;
      if (S.tab === 'feedback') rerender();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Send';
      note.textContent = 'Not sent: ' + (err.message || err); note.hidden = false;
    }
  } },
    h('label', { class: 'field', style: 'margin-bottom:2px' }, 'Your feedback', text),
    h('div', { class: 'fb-count' }, count),
    h('label', { class: 'field' }, h('span', {}, 'What were you doing? ', h('span', { class: 'hint fb-opt' }, '(optional)')), doing),
    h('label', { class: 'check', style: 'margin-top:12px' }, tick, ' This contains no patient details'),
    note,
    h('div', { class: 'bar', style: 'margin:12px 0 0' }, h('span', { class: 'grow' }), btn));
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Send feedback'),
      h('p', { class: 'hint' }, 'A problem, an idea, something confusing. Only the programme owner can read it: it is never public. Leave out patient details and colleagues’ names.'),
      form),
    h('section', { class: 'card' },
      h('p', { class: 'hint', style: 'margin:0' }, 'Sent with it: the page you were last on, the app version and your browser type, so a problem can be found. Never your cases, notes or anything on the screen.')));
}

// ---- the owner's list ----

const F = { items: null, loading: false, error: '', filter: 'new' };

async function load() {
  F.loading = true; F.error = '';
  try { F.items = (await cloud.listFeedback()).sort(byNewestFeedback); }
  catch (err) { F.error = err.code === 'permission-denied' ? 'Only the app owner can read feedback.' : (err.message || String(err)); }
  F.loading = false;
  if (S.tab === 'feedbackinbox') rerender();
}
// leaving either page: the Sent note goes, and the owner's list is read afresh next time
export function leaveFeedback() { sentNote = false; F.items = null; F.error = ''; }

const day = ms => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'sending…');

function item(f) {
  const done = f.status === 'done';
  return h('li', { class: 'fb-item', 'data-id': f.id },
    h('div', { class: 'fb-meta hint' }, `${day(f.createdAt)} · #${screenOf(f.screen)} · ${f.version || ''}`, done ? h('b', { class: 'fb-done' }, ' · Done') : null),
    f.doing ? h('p', { class: 'fb-doing' }, h('b', {}, 'Doing: '), f.doing) : null,
    h('p', { class: 'fb-text' }, f.text),
    h('div', { class: 'bar fb-actions', style: 'margin:6px 0 0' },
      h('button', { class: 'small', onclick: () => copyText(taskText(f), 'Copied (names and numbers taken out)') }, 'Copy as task'),
      h('button', { class: 'small', onclick: async () => {
        try { const status = done ? 'new' : 'done'; await cloud.setFeedbackStatus(f.id, status); f.status = status; rerender(); }
        catch (err) { toast('Not changed: ' + err.message); }
      } }, done ? 'Mark new' : 'Mark done'),
      h('span', { class: 'fb-gap' }),
      h('button', { class: 'small danger', onclick: async () => {
        if (!(await confirmBox('Delete this feedback?', 'It is deleted for good.', 'Delete', true))) return;
        try { await cloud.deleteFeedback(f.id); F.items = F.items.filter(x => x.id !== f.id); rerender(); }
        catch (err) { toast('Not deleted: ' + err.message); }
      } }, 'Delete')));
}

export function renderFeedbackInbox() {
  if (!S.owner) return h('section', { class: 'card' }, h('p', {}, 'Only the app owner can read feedback.'));
  if (!F.items && !F.loading && !F.error) load();
  const all = F.items || [];
  const counts = { new: all.filter(f => f.status !== 'done').length, done: all.filter(f => f.status === 'done').length, all: all.length };
  const shown = all.filter(f => F.filter === 'all' || (F.filter === 'done' ? f.status === 'done' : f.status !== 'done'));
  const seg = h('span', { class: 'seg fb-filter', role: 'group', 'aria-label': 'Show' },
    [['new', 'New'], ['done', 'Done'], ['all', 'All']].map(([v, l]) => h('button', { 'data-filter': v, 'aria-pressed': String(F.filter === v), onclick: () => { F.filter = v; rerender(); } }, `${l} (${counts[v]})`)));
  const list = h('ul', { class: 'fb-list' });
  fill(list, shown.map(item));
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Feedback'),
      h('p', { class: 'hint' }, 'From residents, private to you. Copy as task takes out names and numbers; still check it before pasting anywhere public.'),
      h('div', { class: 'bar' }, seg, h('span', { class: 'fb-gap' }), h('button', { class: 'small', onclick: () => { F.items = null; F.error = ''; rerender(); } }, 'Refresh')),
      F.error ? h('p', { class: 'empty', role: 'alert' }, 'Could not load feedback: ' + F.error)
        : F.loading && !F.items ? h('p', { class: 'hint' }, 'Loading…')
          : shown.length ? list
            : emptyState('notes', F.filter === 'new' ? 'No new feedback' : 'Nothing here', F.filter === 'new' ? 'New feedback from residents shows here.' : '')));
}
