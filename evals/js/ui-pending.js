// Evaluations tab (#pending, #pending/history): requests waiting for me, oldest first, and what I
// have submitted or declined. Rows open the form (#e/{id}).

import { S, h, go, avatar, icon, empty, segment, fmtAgo, fmtDate, toolLabel, statusChip } from './ui-core.js';
import { FORMS } from './forms.js';
import { validate, nextGap, OVERDUE_HOURS } from './engine.js';

const sentAt = ev => ev.requestedAt || ev.createdAt || 0;
// item text may wrap to 2 lines (meta is one line by default)
const ITEM_STYLE = 'white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical';
const doneAt = ev => ev.submittedAt || ev.declinedAt || ev.updatedAt || 0;

export function pendingList() {
  const me = S.user?.email;
  return (S.assigned || []).filter(ev => ev.status === 'requested' && ev.residentEmail !== me).sort((a, b) => sentAt(a) - sentAt(b));
}

export function historyList() {
  // cancelled ones show only if I had started them ("Cancelled by resident")
  return (S.assigned || []).filter(ev => ev.status === 'submitted' || ev.status === 'declined'
    || (ev.status === 'cancelled' && ev.assessment && Object.keys(ev.assessment).length))
    .sort((a, b) => doneAt(b) - doneAt(a));
}

// "Resume at Q9" for a partly done form, else null
export function resumeAt(ev) {
  const a = ev.assessment;
  if (!a || !Object.keys(a).length || !FORMS[ev.formId]) return null;
  return nextGap(validate(FORMS[ev.formId], a));
}

export function renderPending(sub) {
  const tab = sub === 'history' ? 'history' : 'pending';
  const pend = pendingList(), hist = historyList();
  const root = h('div', { class: 'e-pending' },
    segment([{ id: 'pending', label: 'Pending', count: pend.length }, { id: 'history', label: 'History' }], tab,
      id => go(id === 'history' ? 'pending/history' : 'pending')));
  if (!S.loaded.assigned) { root.append(h('p', { class: 'e-loading' }, 'Loading…')); return root; }
  if (tab === 'pending') {
    if (!pend.length) {
      root.append(empty('Nothing waiting', 'When a resident sends you a DOPS, Mini-CEX or EBD it appears here. Their link opens it too.',
        hist.length ? h('a', { class: 'n-btn n-btn--outline e-btn-quiet', href: '#pending/history' }, 'See history') : null));
    } else {
      root.append(h('p', { class: 'e-listhead' }, h('span', {}, `${pend.length} to complete`), h('span', {}, 'oldest first')),
        h('div', { class: 'e-list' }, pend.map(pendingRow)));
    }
  } else if (!hist.length) {
    root.append(empty('No history yet', 'Forms you submit or decline are listed here.'));
  } else {
    root.append(h('div', { class: 'e-list' }, hist.map(historyRow)));
  }
  return root;
}

function pendingRow(ev) {
  const age = Math.floor((Date.now() - sentAt(ev)) / 36e5);
  const late = age >= OVERDUE_HOURS;
  const gap = resumeAt(ev);
  return rowEl(ev, [
    h('span', { class: 'e-row__meta', style: ITEM_STYLE }, ev.itemText || ev.itemId),
    h('span', { class: 'e-row__meta' }, h('span', { class: 'e-tag e-tag--tool' }, toolLabel(ev.tool)), ' ',
      h('span', { style: late ? 'color: var(--n-alert-ink); font-weight: 600' : null }, fmtAgo(sentAt(ev))),
      gap ? ` · Resume at Q${gap}` : ''),
  ], gap ? h('span', { class: 'e-dot', title: 'Partly complete' }) : null, null);
}

function historyRow(ev) {
  const when = ev.status === 'submitted' ? `Submitted ${fmtDate(ev.submittedAt)}`
    : ev.status === 'declined' ? `Declined ${fmtDate(ev.declinedAt)}` : 'Cancelled by resident';
  return rowEl(ev, [
    h('span', { class: 'e-row__meta', style: ITEM_STYLE }, ev.itemText || ev.itemId),
    h('span', { class: 'e-row__meta' }, h('span', { class: 'e-tag e-tag--tool' }, toolLabel(ev.tool)), ' ', when),
  ], null, statusChip(ev));
}

function rowEl(ev, metas, dot, chip) {
  return h('a', { class: 'e-row', href: '#e/' + encodeURIComponent(ev.id) },
    avatar(ev.residentName || ev.residentEmail),
    h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, ev.residentName || ev.residentEmail), metas),
    dot, chip, icon('chevron', 'e-row__chev'));
}
