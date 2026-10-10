// Home (#home, resident): Request button (+ Repeat last), Needs action, Due for you, recent requests.

import { S, h, icon, go, toolLabel, toMs, empty } from './ui-core.js';
import { progress, dueItems } from './engine.js';
import { itemById } from './catalogue.js';
import { residentCSS, itemRow, itemProgress, lastRequest, repeatLast, myYear } from './ui-request.js';
import { requestRow, needsAction } from './ui-requests.js';

residentCSS();

// The next n items for my year: overdue and due groups first, then the next year's.
export function nextItems(n = 3) {
  const yr = myYear();
  const out = [...new Set(dueItems(S.mine, yr).map(i => i.id))];
  if (out.length < n) {
    const later = progress(S.mine, yr).filter(p => p.state === 'on-track' || p.state === 'later')
      .sort((a, b) => a.group.byYear - b.group.byYear);
    for (const p of later) for (const { item, done } of p.items) if (!done && !out.includes(item.id)) out.push(item.id);
  }
  return out.slice(0, n).map(itemById).filter(Boolean);
}

export function renderHome() {
  const now = Date.now();
  const res = S.roles.resident || {};
  const first = String(res.name || S.user?.name || '').split(/\s+/)[0];
  const last = lastRequest();
  const action = S.mine.filter(ev => needsAction(ev, now))
    .sort((a, b) => (toMs(b.updatedAt) || 0) - (toMs(a.updatedAt) || 0));
  const recent = [...S.mine].filter(ev => !action.includes(ev))
    .sort((a, b) => (toMs(b.updatedAt) || 0) - (toMs(a.updatedAt) || 0)).slice(0, 5);
  const prog = itemProgress();
  const due = nextItems(3);
  const year = myYear();

  return h('div', { class: 'e-stack e-home' },
    h('section', { class: 'e-card e-card--accent' },
      h('p', { class: 'e-small e-muted', style: 'margin:0 0 10px' }, first ? `Hi ${first}` : 'Welcome', ` · R${year}`),
      h('button', { type: 'button', class: 'n-btn e-go e-rq-big', onclick: () => go('new') }, icon('plus'), 'Request evaluation'),
      last ? h('button', { type: 'button', class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', style: 'margin-top:8px', onclick: repeatLast },
        'Repeat last: ', toolLabel(last.tool), ' · ', last.assessorName || last.assessorEmail) : null),

    action.length ? [
      h('h2', { class: 'e-listhead' }, `Needs action (${action.length})`, h('a', { href: '#requests' }, 'All requests')),
      h('div', { class: 'e-list e-rq-strip' }, action.slice(0, 5).map(ev => requestRow(ev, now)))] : null,

    due.length ? [
      h('h2', { class: 'e-listhead' }, `Due for you (R${year})`, h('a', { href: '#progress' }, 'Progress')),
      h('div', { class: 'e-list' }, due.map(it => itemRow(it, prog, () => go('new/' + it.id))))] : null,

    h('h2', { class: 'e-listhead' }, 'Recent requests', S.mine.length ? h('a', { href: '#requests' }, 'See all') : null),
    !S.loaded.mine ? h('p', { class: 'e-loading' }, 'Loading…')
      : recent.length ? h('div', { class: 'e-list' }, recent.map(ev => requestRow(ev, now)))
      : action.length ? h('p', { class: 'e-small' }, 'Nothing else yet.')
      : h('div', { class: 'e-card' }, empty('No requests yet', 'Pick an item, choose your assessor and show them the QR code.')));
}
