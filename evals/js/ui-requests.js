// Requests tab (#requests): my requests with status and age, filtered Waiting | Done | All.
// Request detail (#r/{id} while not submitted, via ui-result.js): status trail, share again,
// Nudge, Change assessor, Cancel, and Send to another assessor after a decline.

import { S, h, fill, toast, cloud, icon, go, toolLabel, fmtDate, fmtAgo, toMs, statusChip, row, empty, segment, modal, confirmBox, hooks } from './ui-core.js';
import { statusOf, validate } from './engine.js';
import { FORMS } from './forms.js';
import { itemById } from './catalogue.js';
import { residentCSS, assessorPicker, shareSheet, shareEval, itemTags, tag, AGE_BANDS } from './ui-request.js';

residentCSS();

const NUDGE_HOURS = 20;
const HOUR = 36e5;
let filter = 'waiting';

const WAITING = ['draft', 'requested', 'declined'];
export const needsAction = (ev, now = Date.now()) => ev.status === 'declined'
  || (ev.status === 'submitted' && !ev.seenAt)
  || (ev.status === 'requested' && ageHours(ev, now) >= NUDGE_HOURS);
export const ageHours = (ev, now = Date.now()) => {
  const t = toMs(ev.chasedAt) || toMs(ev.requestedAt) || toMs(ev.createdAt);
  return t ? (now - t) / HOUR : 0;
};

// "Sent 3 h ago" / "Submitted 2 d ago": the latest event for this request.
export function ageText(ev, now = Date.now()) {
  switch (ev.status) {
    case 'submitted': return 'Submitted ' + fmtAgo(ev.submittedAt || ev.updatedAt, now);
    case 'declined': return 'Declined ' + fmtAgo(ev.declinedAt || ev.updatedAt, now);
    case 'cancelled': return 'Cancelled ' + fmtAgo(ev.updatedAt, now);
    case 'draft': return 'Draft, ' + fmtAgo(ev.createdAt, now);
    default: return 'Sent ' + fmtAgo(ev.requestedAt || ev.createdAt, now);
  }
}

export function requestRow(ev, now = Date.now()) {
  const unseen = ev.status === 'submitted' && !ev.seenAt;
  return row({
    name: ev.assessorName || ev.assessorEmail,
    title: ev.itemText || itemById(ev.itemId)?.text || 'Evaluation',
    meta: `${toolLabel(ev.tool)} · ${ev.assessorName || ev.assessorEmail} · ${ageText(ev, now)}`,
    chip: unseen ? h('span', { class: 'e-chip e-chip--submitted' }, 'New feedback') : statusChip(ev, now),
    dot: ev.status === 'requested' && ev.assessment && Object.keys(ev.assessment).length > 0,
    href: '#r/' + encodeURIComponent(ev.id),
  });
}

export function renderRequests() {
  const now = Date.now();
  const mine = [...S.mine];
  const sortKey = ev => (needsAction(ev, now) ? 1 : 0);
  mine.sort((a, b) => sortKey(b) - sortKey(a) || (toMs(b.updatedAt) || 0) - (toMs(a.updatedAt) || 0));
  const lists = {
    waiting: mine.filter(ev => WAITING.includes(ev.status) || (ev.status === 'submitted' && !ev.seenAt)),
    done: mine.filter(ev => ev.status === 'submitted' || ev.status === 'cancelled'),
    all: mine,
  };
  const root = h('div', {});
  const paint = () => {
    const list = lists[filter];
    fill(root,
      segment([
        { id: 'waiting', label: 'Waiting', count: lists.waiting.filter(ev => needsAction(ev, now)).length },
        { id: 'done', label: 'Done' },
        { id: 'all', label: 'All' },
      ], filter, id => { filter = id; paint(); }),
      !S.loaded.mine ? h('p', { class: 'e-loading' }, 'Loading…')
        : list.length ? h('div', { class: 'e-list' }, list.map(ev => requestRow(ev, now)))
        : empty(filter === 'waiting' ? 'Nothing waiting' : 'No requests yet', filter === 'waiting' ? 'Requests you send show here until they are done.' : 'Send your first request from Home.',
          h('a', { class: 'n-btn', href: '#new' }, icon('plus'), 'Request evaluation')),
      list.length ? h('p', { class: 'e-small e-center', style: 'margin-top:16px' }, h('a', { href: '#new', class: 'n-btn e-go' }, icon('plus'), 'New request')) : null);
  };
  paint();
  return root;
}

// ---------- detail ----------

// Decline reasons as the resident sees them (no conflict-of-interest detail).
const DECLINE = {
  'not-observed': 'Assessor did not observe this case',
  'not-co-managed': 'Assessor did not co-manage this case',
  'wrong-item': 'Wrong item or form for this case',
  other: 'Assessor couldn’t assess this case',
};
export function declineText(r) {
  if (!r) return 'Assessor couldn’t assess this case';
  if (/conflict|coi/i.test(r.code || '')) return 'Assessor couldn’t assess this case';
  const base = DECLINE[r.code] || 'Assessor couldn’t assess this case';
  return r.code === 'other' && r.text ? `${base}: “${r.text}”` : base;
}

function trail(ev) {
  const steps = [];
  const at = v => (v ? fmtDate(v, { time: true }) : '');
  steps.push({ done: true, text: ev.status === 'draft' ? 'Draft saved' : 'Sent', when: at(ev.status === 'draft' ? ev.createdAt : ev.requestedAt || ev.createdAt) });
  if (ev.chasedAt) steps.push({ done: true, text: 'Nudged', when: at(ev.chasedAt) });
  if (ev.metrics?.openedAt > 1e12) steps.push({ done: true, text: 'Opened by assessor', when: at(ev.metrics.openedAt) });
  const a = ev.assessment && Object.keys(ev.assessment).length ? ev.assessment : null;
  if (a && FORMS[ev.formId] && ev.status === 'requested') {
    const v = validate(FORMS[ev.formId], a);
    steps.push({ done: true, text: `In progress: ${v.answered} of ${v.required} answered` });
  }
  if (ev.status === 'declined') steps.push({ bad: true, text: 'Declined: ' + declineText(ev.declineReason), when: at(ev.declinedAt) });
  else if (ev.status === 'cancelled') steps.push({ bad: true, text: 'Cancelled', when: at(ev.updatedAt) });
  else if (ev.status === 'submitted') steps.push({ done: true, text: 'Submitted', when: at(ev.submittedAt) });
  else if (ev.status === 'requested') steps.push({ text: `Waiting for ${ev.assessorName || ev.assessorEmail}` });
  return h('ol', { class: 'e-steps' }, steps.map(s => h('li', { class: s.bad ? 'is-bad' : s.done ? 'is-done' : '' },
    s.text, s.when ? h('span', { class: 'e-small e-muted' }, ' · ' + s.when) : null)));
}

export function caseKV(ev) {
  const r = ev.request || {};
  const rows = [
    ['Date', fmtDate(r.date || ev.date)],
    ['Location', r.location],
    ['Patient', [r.initials, r.ageBand ? (AGE_BANDS.includes(r.ageBand) || /\d/.test(r.ageBand) ? r.ageBand + ' y' : r.ageBand) : null, r.gender].filter(Boolean).join(' · ')],
    r.coManaged ? ['Co-managed', 'Confirmed'] : null,
    r.notes ? ['Note', r.notes] : null,
  ].filter(x => x && x[1]);
  return h('dl', { class: 'e-kv' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}

export function itemCard(ev) {
  const it = itemById(ev.itemId);
  return h('section', { class: 'e-card' },
    h('p', { class: 'e-rq-tags', style: 'margin:0 0 6px' }, it ? itemTags(it) : [tag(toolLabel(ev.tool), 'e-tag--tool'), ev.epa ? tag('EPA ' + ev.epa) : null]),
    h('h2', { class: 'e-h3', style: 'margin:0 0 8px' }, ev.itemText || it?.text || 'Evaluation'),
    h('p', { class: 'e-small', style: 'margin:0' }, 'Assessor: ', h('b', {}, ev.assessorName || ev.assessorEmail),
      ev.assessorName ? h('span', { class: 'e-muted' }, ' · ' + ev.assessorEmail) : null));
}

export function renderRequestDetail(ev) {
  const root = h('div', { class: 'e-stack' });
  let busy = false;
  const act = async (fn, okMsg) => {
    if (busy) return;
    busy = true;
    try { const next = await fn(); if (okMsg) toast(okMsg); if (next) { Object.assign(ev, next); } hooks.render(); }
    catch (err) { toast('Not saved: ' + (err.message || err)); }
    finally { busy = false; }
  };
  const save = patch => cloud.updateEvaluation(ev.id, patch);

  const pickAssessor = (title, onpick, exclude = []) => {
    const m = modal(title, assessorPicker({ current: ev.assessorEmail, exclude, onpick: a => { m.close(); onpick(a); } }), { cls: 'e-sheet' });
  };

  const changeAssessor = () => pickAssessor('Change assessor', a => {
    if (a.email === ev.assessorEmail) return;
    act(async () => {
      const next = await save({ assessorEmail: a.email, assessorName: a.name });
      Object.assign(ev, next);
      if (ev.status === 'requested') shareSheet(ev, `Send the link to ${a.name}`);
      return next;
    }, `Now with ${a.name}`);
  });

  const resend = () => pickAssessor('Send to another assessor', a => act(async () => {
    const next = await save({ status: 'requested', assessorEmail: a.email, assessorName: a.name });
    Object.assign(ev, next);
    shareSheet(ev, `Send the link to ${a.name}`);
    return next;
  }, `Sent to ${a.name}`), [ev.assessorEmail]);

  const nudge = () => act(async () => {
    const next = await save({ chasedAt: Date.now() });
    Object.assign(ev, next);
    await shareEval(ev);
    return next;
  });

  const cancel = async () => {
    const started = ev.assessment && Object.keys(ev.assessment).length;
    const ok = await confirmBox('Cancel this request?', started ? 'The assessor has started the form. It will be marked cancelled (nothing is deleted).' : 'It will be marked cancelled and the link stops working. Nothing is deleted.', 'Cancel request', true);
    if (ok) act(() => save({ status: 'cancelled' }), 'Request cancelled');
  };

  const sendDraft = () => act(async () => {
    const next = await save({ status: 'requested' });
    Object.assign(ev, next);
    shareSheet(ev, 'Request sent');
    return next;
  });

  const delDraft = async () => {
    if (!(await confirmBox('Delete this draft?', 'The draft has not been sent. This can’t be undone.', 'Delete draft', true))) return;
    try { await cloud.deleteDraft(ev.id); toast('Draft deleted'); go('requests'); }
    catch (err) { toast('Not deleted: ' + (err.message || err)); }
  };

  const now = Date.now();
  const st = statusOf(ev, now);
  const started = !!(ev.assessment && Object.keys(ev.assessment).length);
  const canNudge = ev.status === 'requested' && ageHours(ev, now) >= NUDGE_HOURS;
  const actions = [];
  if (ev.status === 'requested') {
    actions.push(h('button', { class: 'n-btn e-btn-big', onclick: () => shareSheet(ev) }, icon('qr'), 'Show QR / share link'));
    if (canNudge) actions.push(h('button', { class: 'n-btn n-btn--secondary e-btn-big', onclick: nudge }, icon('share'), 'Nudge (send the link again)'));
    if (!started) actions.push(h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', onclick: changeAssessor }, 'Change assessor'));
    actions.push(h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', onclick: cancel }, 'Cancel request'));
  } else if (ev.status === 'draft') {
    actions.push(h('button', { class: 'n-btn e-go e-btn-big', onclick: sendDraft }, `Send to ${ev.assessorName || ev.assessorEmail}`));
    actions.push(h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', onclick: changeAssessor }, 'Change assessor'));
    actions.push(h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', onclick: delDraft }, icon('trash'), 'Delete draft'));
  } else if (ev.status === 'declined') {
    actions.push(h('button', { class: 'n-btn e-go e-btn-big', onclick: resend }, 'Send to another assessor'));
    actions.push(h('button', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', onclick: cancel }, 'Cancel request'));
  } else if (ev.status === 'cancelled' && itemById(ev.itemId)) {
    actions.push(h('a', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', href: '#new/' + encodeURIComponent(ev.itemId) }, 'Request this item again'));
  }

  fill(root,
    itemCard(ev),
    ev.status === 'declined' ? h('p', { class: 'e-alert', role: 'status' }, declineText(ev.declineReason), '. Send it to another assessor: nothing to retype.') : null,
    ev.status === 'requested' && st.key === 'overdue' ? h('p', { class: 'e-warn-note' }, `Waiting ${Math.floor(st.ageHours)} h. Forms should be done within 24 h: nudge your assessor.`) : null,
    h('section', { class: 'e-card' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px' },
        h('h2', { class: 'e-h3', style: 'margin:0' }, 'Status'), statusChip(ev, now)),
      trail(ev)),
    h('section', { class: 'e-card' }, h('h2', { class: 'e-h3', style: 'margin:0 0 8px' }, 'Case'), caseKV(ev)),
    actions.length ? h('div', { class: 'e-stack e-noprint' }, actions) : null);
  return root;
}
