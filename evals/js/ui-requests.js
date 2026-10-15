// Requests tab (#requests): my requests with status and age, filtered Waiting | Done | All.
// Request detail (#r/{id} while not submitted, via ui-result.js): status trail, share again,
// Nudge, Change assessor, Cancel, and Send to another assessor after a decline.

import { S, h, fill, toast, cloud, icon, go, toolLabel, fmtDate, fmtAgo, toMs, statusChip, row, empty, segment, modal, confirmBox, hooks, needsAction, ageHours, NUDGE_HOURS, errText } from './ui-core.js';
import { statusOf, validate, caseKey, sameCaseCount, identifierWarning, todayISO } from './engine.js';
import { FORMS } from './forms.js';
import { itemById } from './catalogue.js';
import { residentCSS, assessorPicker, shareSheet, shareEval, itemTags, tag, AGE_BANDS, GENDERS, LOCATIONS } from './ui-request.js';

residentCSS();

let filter = 'waiting';

const WAITING = ['draft', 'requested', 'declined'];
export { needsAction, ageHours };

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
  const started = ev.status === 'requested' && ev.assessment && Object.keys(ev.assessment).length > 0;
  return row({
    name: ev.assessorName || ev.assessorEmail,
    title: ev.itemText || itemById(ev.itemId)?.text || 'Evaluation',
    meta: [toolLabel(ev.tool) + (ev.epa ? ` · EPA ${ev.epa}` : ''), ev.assessorName || ev.assessorEmail, ageText(ev, now) + (started ? ' · started' : '')].join(' · '),
    chip: unseen ? h('span', { class: 'e-chip e-chip--submitted' }, 'New feedback') : statusChip(ev, now),
    stacked: true,
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
        { id: 'waiting', label: 'Open', count: lists.waiting.filter(ev => needsAction(ev, now)).length },
        { id: 'done', label: 'Done' },
        { id: 'all', label: 'All' },
      ], filter, id => { filter = id; paint(); }),
      !S.loaded.mine ? h('p', { class: 'e-loading' }, 'Loading…')
        : list.length ? h('div', { class: 'e-list' }, list.map(ev => requestRow(ev, now)))
        : empty(filter === 'waiting' ? 'Nothing open' : 'No requests yet', filter === 'waiting' ? 'Requests you send show here until they are done.' : 'Send your first request from Home.',
          h('a', { class: 'a-btn', href: '#new' }, icon('plus'), 'Request evaluation')),
      list.length ? h('a', { href: '#new', class: 'a-fab e-go', 'aria-label': 'New request', title: 'New request' }, icon('plus')) : null);
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
  if (ev.chasedAt) steps.push({ done: true, text: 'Reminder sent', when: at(ev.chasedAt) });
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
    ['Patient', [r.initials, r.ageBand ? (AGE_BANDS.includes(r.ageBand) || /\d/.test(r.ageBand) ? r.ageBand + ' y' : r.ageBand) : null, ({ F: 'Female', M: 'Male' })[r.gender] || r.gender].filter(Boolean).join(' · ')],
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
    catch (err) { toast('Not saved. ' + errText(err)); }
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
    await shareEval(ev, { reminder: true });
    return next;
  });

  // Fix the case card (a typo in the initials, the wrong date) while the assessor hasn't started:
  // same fields and checks as when requesting; the rules lock it once an assessment has begun.
  const editCase = () => {
    const r = { ...(ev.request || {}) };
    const err = h('p', { class: 'e-rq-err', role: 'alert', hidden: true });
    const date = h('input', { class: 'e-input', type: 'date', id: 'ec-date', value: r.date || ev.date || '', max: todayISO() });
    const loc = h('input', { class: 'e-input', id: 'ec-loc', value: r.location || '', maxlength: 80, list: 'ec-locs' });
    const ini = h('input', { class: 'e-input e-rq-initials', id: 'ec-ini', value: r.initials || '', maxlength: 3, autocapitalize: 'characters', autocomplete: 'off',
      oninput: () => { ini.value = ini.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); } });
    const sel = (id, opts, cur) => h('select', { class: 'e-select', id }, opts.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: v === cur ? true : null }, l);
    }));
    const age = sel('ec-age', AGE_BANDS, r.ageBand), gender = sel('ec-gender', GENDERS, r.gender);
    const notes = h('textarea', { class: 'e-textarea', id: 'ec-notes', rows: 2, maxlength: 300 }, r.notes || '');
    const field = (label, id, el) => h('div', { class: 'e-rq-field' }, h('label', { class: 'e-label', for: id }, label), el);
    const save = async () => {
      const next = { ...r, date: date.value, location: loc.value.trim(), initials: ini.value, ageBand: age.value, gender: gender.value };
      const note = notes.value.trim();
      if (note) next.notes = note; else delete next.notes;
      const problem = !/^\d{4}-\d{2}-\d{2}$/.test(next.date) ? 'Choose the date'
        : next.date > todayISO() ? 'The date can’t be in the future'
        : !next.location ? 'Enter a location' : !next.initials ? 'Enter the patient’s initials'
        : identifierWarning(note) || null;
      if (!problem && sameCaseCount(S.mine.filter(x => x.id !== ev.id), next.date, next.initials) >= 2) {
        if (!(await confirmBox('Same patient again?', `${next.initials} on ${fmtDate(next.date)} is already on 2 of your requests. A patient can be used for at most 2 assessments.`, 'Save anyway'))) return;
      }
      if (problem) { err.textContent = problem; err.hidden = false; return; }
      m.close();
      act(() => save2({ request: next, date: next.date, caseKey: caseKey(next.date, next.initials) }), 'Case details saved');
    };
    const save2 = patch => cloud.updateEvaluation(ev.id, patch);
    const m = modal('Edit case details', h('div', { class: 'e-stack' },
      h('p', { class: 'e-small', style: 'margin:0' }, 'Initials, age band and gender only: no names or record numbers.'),
      field('Date of case', 'ec-date', date),
      field('Location', 'ec-loc', loc), h('datalist', { id: 'ec-locs' }, LOCATIONS.map(l => h('option', { value: l }))),
      field('Patient initials', 'ec-ini', ini),
      field('Age', 'ec-age', age), field('Gender', 'ec-gender', gender),
      field('Note to assessor (optional)', 'ec-notes', notes),
      err,
      h('div', { class: 'e-actions' },
        h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'a-btn', type: 'button', onclick: save }, 'Save'))), { cls: 'e-sheet' });
  };

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
    catch (err) { toast('Not deleted. ' + errText(err)); }
  };

  const now = Date.now();
  const st = statusOf(ev, now);
  const started = !!(ev.assessment && Object.keys(ev.assessment).length);
  const canNudge = ev.status === 'requested' && ageHours(ev, now) >= NUDGE_HOURS;
  // one filled button for the main action, the others as a grouped list of rows (the app kit's detail screen)
  const actions = [], rows = [];
  const rowBtn = (label, onclick, danger = false, ic = null) => h('li', {}, h('button', { type: 'button', class: `a-row a-row--center${danger ? ' a-row--danger' : ''}`, onclick }, ic, label));
  if (ev.status === 'requested') {
    actions.push(h('button', { class: 'a-btn a-btn--block e-btn-big', onclick: () => shareSheet(ev) }, icon('qr'), 'Show QR / share link'));
    if (canNudge) rows.push(rowBtn('Remind assessor', nudge, false, icon('share')));
    if (!started) rows.push(rowBtn('Change assessor', changeAssessor));
    if (!started) rows.push(rowBtn('Edit case details', editCase));
    rows.push(rowBtn('Cancel request', cancel, true));
  } else if (ev.status === 'draft') {
    actions.push(h('button', { class: 'a-btn a-btn--block e-go e-btn-big', onclick: sendDraft }, `Send to ${ev.assessorName || ev.assessorEmail}`));
    rows.push(rowBtn('Change assessor', changeAssessor));
    rows.push(rowBtn('Delete draft', delDraft, true, icon('trash')));
  } else if (ev.status === 'declined') {
    actions.push(h('button', { class: 'a-btn a-btn--block e-go e-btn-big', onclick: resend }, 'Send to another assessor'));
    rows.push(rowBtn('Cancel request', cancel, true));
  } else if (ev.status === 'cancelled' && itemById(ev.itemId)) {
    rows.push(h('li', {}, h('a', { class: 'a-row a-row--center', href: '#new/' + encodeURIComponent(ev.itemId) }, 'Request this item again')));
  }
  if (rows.length) actions.push(h('ul', { class: 'a-list e-actrows' }, rows));

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
