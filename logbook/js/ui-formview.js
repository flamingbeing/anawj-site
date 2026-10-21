// Form view (More → Form view, #formview): the old APMES Case Numbers Google Form's layout, for residents who are
// moving from the Form to the logbook. One long page, the Form's questions in the Form's order (Resident, Date,
// Initials and case details, Category), a confirmation with "Edit your response" and "Submit another response".
// It saves through the Add tab's own path (createCase / updateCase in ui-core.js): the same ID-number and duplicate
// questions, the same sync, the same outbox to the response sheet. Nothing goes through the Form inbox, so there is
// nothing to pick up and nothing to clear. The Form's "wrong entry" trick is not needed: Edit corrects the case.

import { S, h, toast, okNoIds, createCase, updateCase, confirmBox, hooks, keepTags, todayISO } from './ui-core.js';
import { ACTIVE } from './categories.js';
import { splitInitials, sortCodes, caseText, fmtDate, parseDate } from './engine.js';
import { MAX_DETAILS } from './bulk-change.js';

let view = 'form';   // 'form' | 'done'
let last = null;     // the case just saved: "Edit your response" opens it again
let editing = null;  // the case being edited (the form is filled from it and Submit updates it)
let busy = false;

const norm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
const residentLine = () => (S.resident && S.resident.name) || (S.user && S.user.email) || '';

export function renderFormView() {
  return h('div', { class: 'fv' }, view === 'done' && last ? doneCard() : formCard());
}

function doneCard() {
  return h('section', { class: 'card fv-card', role: 'status' },
    h('h2', {}, 'APMES Case Numbers'),
    h('p', {}, 'Your response has been recorded.'),
    h('p', { class: 'hint' }, `${fmtDate(last.date)} · ${caseText(last) || 'no details'}`),
    h('p', { class: 'fv-links' },
      h('a', { href: '#formview', class: 'fv-edit', onclick: e => { e.preventDefault(); editing = last; view = 'form'; hooks.render(); } }, 'Edit your response'),
      ' · ',
      h('a', { href: '#formview', class: 'fv-again', onclick: e => { e.preventDefault(); editing = null; last = null; view = 'form'; hooks.render(); } }, 'Submit another response')));
}

function formCard() {
  const c = editing;
  const date = h('input', { id: 'fv-date', type: 'date', value: (c && c.date) || todayISO(), required: true, max: '2100-12-31' });
  const text = h('input', { id: 'fv-text', type: 'text', value: c ? caseText(c) : '', maxlength: String(MAX_DETAILS), autocomplete: 'off', required: true });
  const picked = new Set(c ? c.cats : []);
  const boxes = ACTIVE.map(cat => {
    const box = h('input', { type: 'checkbox', value: cat.code, checked: picked.has(cat.code) });
    return h('label', { class: 'fv-opt' }, box, h('span', {}, cat.label));
  });
  const problem = (id, msg) => h('p', { class: 'fv-problem', id, role: 'alert', hidden: true }, msg);
  const pDate = problem('fv-p-date', 'This is a required question'), pText = problem('fv-p-text', 'This is a required question'), pCat = problem('fv-p-cat', 'This is a required question');
  const show = (p, on) => { p.hidden = !on; };
  const submit = h('button', { type: 'submit', class: 'primary' }, c ? 'Save changes' : 'Submit');
  const form = h('form', { class: 'fv-form', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    if (busy) return;
    const cats = sortCodes(boxes.filter(l => l.firstChild.checked).map(l => l.firstChild.value));
    const iso = parseDate(date.value) || null, details = text.value.trim();
    show(pDate, !iso); show(pText, !details); show(pCat, !cats.length);
    if (!iso) return date.focus();
    if (!details) return text.focus();
    if (!cats.length) return boxes[0].firstChild.focus();
    busy = true; submit.disabled = true;
    try {
      if (!(await okNoIds(details))) return;
      if (!c) {
        // the same text on the same date is probably a double entry (as on the Add tab)
        const twin = (S.cases || []).find(x => x.date === iso && norm(caseText(x)) === norm(details));
        if (twin && !(await confirmBox('Possible duplicate', `You already logged “${caseText(twin).slice(0, 60)}” on ${fmtDate(twin.date)}. Save another one?`, 'Save anyway'))) return;
        last = await createCase({ date: iso, details, cats });
      } else {
        const parts = splitInitials(details);
        const next = { ...c, date: iso, initials: parts.initials, details: parts.details, cats };
        const tags = keepTags(c.tags, cats);
        if (tags.length) next.tags = tags; else delete next.tags;
        last = await updateCase(next, { base: S.cases.find(x => x.id === c.id) || c });
      }
      editing = null; view = 'done';
      hooks.render();
    } catch (err) { toast('Could not save: ' + err.message); } finally { busy = false; submit.disabled = false; }
  } },
    h('div', { class: 'fv-q' }, h('div', { class: 'fv-t' }, 'Resident ', h('span', { class: 'fv-req', 'aria-hidden': 'true' }, '*')), h('div', { class: 'fv-resident' }, residentLine())),
    h('div', { class: 'fv-q' }, h('label', { class: 'fv-t', for: 'fv-date' }, 'Date ', h('span', { class: 'fv-req', 'aria-hidden': 'true' }, '*')), date, pDate),
    h('div', { class: 'fv-q' }, h('label', { class: 'fv-t', for: 'fv-text' }, 'Initials, Case Details ', h('span', { class: 'fv-req', 'aria-hidden': 'true' }, '*')), text, pText),
    h('fieldset', { class: 'fv-q fv-cats' }, h('legend', { class: 'fv-t' }, 'Category ', h('span', { class: 'fv-req', 'aria-hidden': 'true' }, '*')), boxes, pCat),
    h('div', { class: 'bar', style: 'margin:12px 0 0' }, submit,
      c ? h('button', { type: 'button', onclick: () => { editing = null; view = 'done'; hooks.render(); } }, 'Cancel') : null,
      h('span', { class: 'grow' }),
      c ? null : h('button', { type: 'button', class: 'link', onclick: () => { form.reset(); [pDate, pText, pCat].forEach(p => show(p, false)); date.value = todayISO(); } }, 'Clear form')));
  return h('section', { class: 'card fv-card' },
    h('h2', {}, 'APMES Case Numbers'),
    h('p', { class: 'hint' }, c ? 'Change your response and save it.' : 'Log a case the way the Google Form asked for it. It is saved straight into your logbook, the same as on the Add tab. Use Edit your response after submitting to correct it.'),
    h('p', { class: 'hint fv-req-note' }, '* Required'),
    form);
}

// leaving the page starts a fresh form next time
export function resetFormView() { view = 'form'; last = null; editing = null; }
