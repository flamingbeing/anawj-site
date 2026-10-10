// #r/{id}: the result of a submitted evaluation (comments first, then supervision level and overall,
// then every answer read-only with its descriptor on tap; "Got it" sets seenAt; prints cleanly).
// A request that isn't submitted yet shows the request detail (ui-requests.js) to its resident.

import { S, h, fill, toast, cloud, icon, go, toolLabel, fmtDate, hooks, modal } from './ui-core.js';
import { FORMS, SCALES, ENTRUSTMENT_TEXT_KEY } from './forms.js';
import { visibleQuestions } from './engine.js';
import { residentCSS, assessorPicker } from './ui-request.js';
import { renderRequestDetail, itemCard, caseKV } from './ui-requests.js';

residentCSS();

const notAvailable = () => h('div', { class: 'e-empty' }, icon('info', 'e-empty__icon'),
  h('p', { class: 'e-empty__title' }, 'Not available yet'),
  h('p', {}, 'It may still be syncing, or it was sent to a different address.'),
  h('button', { class: 'n-btn', onclick: () => hooks.render() }, 'Try again'));

async function find(id) {
  const local = [...S.mine, ...S.assigned, ...S.all].find(ev => ev.id === id);
  if (local) return local;
  try { return await cloud.getEvaluation(id); } catch { return null; }
}

export async function renderResult(id) {
  if (!id) return notAvailable();
  const ev = await find(id);
  if (!ev) return notAvailable();
  const email = S.user?.email;
  if (ev.status !== 'submitted') {
    if (ev.residentEmail === email) return renderRequestDetail(ev);
    if (ev.assessorEmail === email && ev.status === 'requested') { location.replace(location.pathname + location.search + '#e/' + encodeURIComponent(id)); return h('p', { class: 'e-loading' }, 'Opening the form…'); }
    return h('div', { class: 'e-stack' }, itemCard(ev),
      h('section', { class: 'e-card' }, h('p', {}, `Status: ${ev.status}. ${ev.residentName || ev.residentEmail}`), caseKV(ev)),
      adminActions(ev));
  }
  const node = resultView(ev);
  const extra = ev.residentEmail !== email ? adminActions(ev) : null;
  if (extra) node.append(extra);
  return node;
}

// ---------- admin: reassign, cancel, reopen (the rules let admins make any valid change) ----------

function adminActions(ev) {
  if (!S.roles.admin) return null;
  const run = async (patch, done) => {
    try { await cloud.updateEvaluation(ev.id, patch); toast(done); hooks.render(); }
    catch (err) { toast('Not changed: ' + (err.message || err)); }
  };
  const open = ['draft', 'requested', 'declined'].includes(ev.status);
  const reassign = () => {
    const m = modal('Reassign to', [
      assessorPicker({ exclude: [ev.assessorEmail, ev.residentEmail], onpick: a => { m.close();
        run({ status: 'requested', assessorEmail: a.email, assessorName: a.name, assessment: null, metrics: null }, `Sent to ${a.name}`); } }),
      h('div', { class: 'e-actions' }, h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => m.close() }, 'Cancel')),
    ]);
  };
  const confirmDo = (title, text, label, patch, done) => {
    const m = modal(title, [h('p', {}, text), h('div', { class: 'e-actions' },
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => m.close() }, 'Back'),
      h('button', { class: 'n-btn', onclick: () => { m.close(); run(patch, done); } }, label))]);
  };
  const btns = [
    open ? h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: reassign }, 'Reassign') : null,
    open ? h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => confirmDo('Cancel this request?', 'The resident sees it as cancelled. Nothing is deleted.', 'Cancel request', { status: 'cancelled' }, 'Cancelled') }, 'Cancel request') : null,
    ev.status === 'submitted' || ev.status === 'cancelled' ? h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => confirmDo('Reopen?', `It goes back to ${ev.assessorName || ev.assessorEmail} as a request; their answers are kept.`, 'Reopen', { status: 'requested', submittedAt: null }, 'Reopened') }, 'Reopen') : null,
  ].filter(Boolean);
  if (!btns.length) return null;
  return h('section', { class: 'e-card e-noprint' }, h('h2', { class: 'e-h3' }, 'Admin'), h('div', { class: 'e-actions' }, btns));
}

// ---------- answer formatting ----------

const NINE = SCALES.ninePoint;
const bandOf = v => NINE.bands.find(b => v >= b.range[0] && v <= b.range[1]);
const msLabel = v => (Number(v) === 0.5 ? 'Not yet level 1' : String(Math.round(Number(v) * 2 - 1)));

// { value: short text, desc: longer descriptor or null }
export function answerText(q, v) {
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) return { value: '—', desc: null };
  switch (q.type) {
    case 'ninePoint': {
      if (v === 'NA') return { value: NINE.naLabel || 'Not observed', desc: null };
      const n = Number(v), o = NINE.options.find(x => x.value === n), b = bandOf(n);
      return { value: `${n} / 9`, desc: [b && b.label, o && o.descriptor].filter(Boolean).join(': ') };
    }
    case 'milestone': {
      if (v === 'NA') return { value: 'N/A', desc: null };
      const n = Number(v), lab = msLabel(n);
      const d = q.descriptors || {};
      let desc = d[lab] || null;
      if (!desc && n !== 0.5) {
        const k = Number(lab);
        desc = d[k - 1] && d[k + 1] ? `Between “${d[k - 1]}” and “${d[k + 1]}”` : null;
      }
      if (n === 0.5) desc = 'Not yet achieved milestone level 1.';
      return { value: n === 0.5 ? lab : `${lab} / 9`, desc: desc ? `Milestone level ${n === 0.5 ? '<1' : n}: ${desc}` : null };
    }
    case 'supervision': {
      const o = SCALES.supervision.options.find(x => x.value === Number(v));
      return { value: o ? o.label : String(v), desc: SCALES.supervision.descriptions[String(v)] || null };
    }
    case 'checkboxes': return { value: v.join('; '), desc: null };
    default: return { value: String(v), desc: null };
  }
}

const quote = t => h('p', { class: 'e-rq-quote' }, t);

// ---------- the view ----------

function resultView(ev) {
  const form = FORMS[ev.formId];
  const a = ev.assessment || {};
  const isMine = ev.residentEmail === S.user?.email;
  if (!form) return h('div', { class: 'e-stack' }, itemCard(ev), h('p', { class: 'e-alert' }, 'Unknown form type.'));
  const qs = visibleQuestions(form, a);
  const entrustKey = ENTRUSTMENT_TEXT_KEY[form.id];

  // comments first: the feedback box(es), then the entrustment discussion
  const texts = qs.filter(q => q.type === 'text' && typeof a[q.key] === 'string' && a[q.key].trim());
  texts.sort((x, y) => (x.key === entrustKey) - (y.key === entrustKey) || /comments on what/i.test(y.label) - /comments on what/i.test(x.label) || x.n - y.n);
  const areas = qs.find(q => q.type === 'checkboxes');
  const sup = qs.find(q => q.type === 'supervision');
  const overall = qs.filter(q => q.type === 'ninePoint' && !q.na).pop();   // DOPS q14, Mini-CEX q12

  const commentTitle = q => q.key === entrustKey ? 'Entrustment discussion' : /if any of the areas/i.test(q.label) ? 'Areas for improvement: comments' : /comments on what/i.test(q.label) ? 'Feedback' : 'Comments';

  const supV = sup && a[sup.key] != null ? answerText(sup, a[sup.key]) : null;
  const ovV = overall && a[overall.key] != null && a[overall.key] !== 'NA' ? Number(a[overall.key]) : null;
  const thr = ev.level === 3 ? 5 : ev.level === 4 ? 7 : null;

  const gotIt = h('button', { class: 'n-btn e-go e-btn-big', onclick: async () => {
    gotIt.disabled = true;
    try { const next = await cloud.updateEvaluation(ev.id, { seenAt: Date.now() }); Object.assign(ev, next); toast('Marked as seen'); go('requests'); }
    catch (err) { gotIt.disabled = false; toast('Not saved: ' + (err.message || err)); }
  } }, icon('check'), 'Got it');

  const sections = form.sections.map(sec => {
    const shown = sec.questions.filter(q => qs.includes(q));
    if (!shown.length) return null;
    return [
      sec.title ? h('h3', { class: 'e-section' }, sec.title) : null,
      h('div', { class: 'e-list' }, shown.map(q => {
        const t = answerText(q, a[q.key]);
        if (q.type === 'text') {
          return h('div', { class: 'e-rq-ans', style: 'cursor:default' },
            h('span', { class: 'e-rq-ans__q' }, `${q.n}. ${q.label}`), h('span'),
            h('p', { class: 'e-rq-quote', style: 'grid-column:1/-1;margin:0' }, t.value));
        }
        const stack = q.label.length > 90 || t.value.length > 14;
        const btn = h('button', { type: 'button', class: 'e-rq-ans' + (stack ? ' is-stack' : ''), 'aria-expanded': 'false', onclick: () => {
          if (!t.desc) return;
          const open = btn.classList.toggle('is-open');
          btn.setAttribute('aria-expanded', String(open));
        } },
        h('span', { class: 'e-rq-ans__q' }, `${q.n}. ${stack && q.label.length > 140 ? q.label.slice(0, q.label.indexOf('.', 60) + 1 || 140) : q.label}`),
        h('span', { class: 'e-rq-ans__v' }, t.value),
        t.desc ? h('p', { class: 'e-rq-ans__d' }, t.desc) : null);
        return btn;
      })),
    ];
  });

  return h('div', { class: 'e-stack e-rq-result' },
    itemCard(ev),
    h('p', { class: 'e-small', style: 'margin:0 4px' },
      `${form.title.replace(/\s*\(.*\)$/, '')} · submitted ${fmtDate(ev.submittedAt, { time: true })}`,
      isMine ? null : ` · resident ${ev.residentName || ev.residentEmail}`),

    texts.length || (areas && a[areas.key]) ? h('section', { class: 'e-card e-card--accent' },
      areas && Array.isArray(a[areas.key]) && a[areas.key].length ? [
        h('h2', { class: 'e-h3', style: 'margin:0 0 6px' }, 'Areas for improvement'),
        h('div', { class: 'e-chips', style: 'margin-bottom:12px' }, a[areas.key].map(x => h('span', { class: 'e-tag' }, x)))] : null,
      texts.map((q, i) => [
        h('h2', { class: 'e-h3', style: `margin:${i || (areas && a[areas.key]) ? 12 : 0}px 0 6px` }, commentTitle(q)),
        quote(a[q.key])])) : null,

    supV ? h('section', { class: 'e-card' },
      h('h2', { class: 'e-h3', style: 'margin:0 0 10px' }, 'Supervision level'),
      h('div', { class: 'e-rq-big-level' },
        h('span', { class: 'e-rq-big-level__n', 'aria-hidden': 'true' }, String(a[sup.key])),
        h('div', {}, h('b', {}, supV.value), supV.desc ? h('p', { class: 'e-small', style: 'margin:2px 0 0' }, supV.desc) : null))) : null,

    ovV != null ? h('section', { class: 'e-card' },
      h('h2', { class: 'e-h3', style: 'margin:0 0 10px' }, overall.label.length < 40 ? overall.label : 'Overall'),
      h('div', { class: 'e-rq-big-level' },
        h('span', { class: `e-rq-big-level__n is-band-${ovV <= 3 ? 1 : ovV <= 6 ? 2 : 3}`, 'aria-hidden': 'true' }, String(ovV)),
        h('div', {}, h('b', {}, `${ovV} / 9 · ${bandOf(ovV)?.label || ''}`),
          h('p', { class: 'e-small', style: 'margin:2px 0 0' }, NINE.options.find(o => o.value === ovV)?.descriptor || ''),
          thr ? h('p', { class: 'e-small', style: 'margin:4px 0 0' }, ovV >= thr ? h('span', { class: 'e-tick' }, `✓ Meets the level ${ev.level} threshold (≥${thr})`) : `Below the level ${ev.level} threshold (≥${thr})`) : null))) : null,

    isMine && !ev.seenAt ? h('div', { class: 'e-noprint' }, gotIt) : null,
    isMine && ev.seenAt ? h('p', { class: 'e-small e-center', style: 'margin:0' }, `Seen ${fmtDate(ev.seenAt)}`) : null,

    h('h2', { class: 'e-listhead' }, 'All answers', h('span', { class: 'e-noprint', style: 'text-transform:none;letter-spacing:0;font-weight:400' }, 'Tap a score for its descriptor')),
    h('div', { class: 'e-card e-card--flush' }, sections),

    h('section', { class: 'e-card' }, h('h2', { class: 'e-h3', style: 'margin:0 0 8px' }, 'Case'), caseKV(ev),
      h('p', { class: 'e-small', style: 'margin:8px 0 0' }, 'Assessor: ', ev.assessorName || ev.assessorEmail)),
    h('div', { class: 'e-actions e-noprint' },
      h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => window.print() }, 'Print'),
      isMine ? h('a', { class: 'n-btn n-btn--outline e-btn-quiet', href: '#new/' + encodeURIComponent(ev.itemId || '') }, 'Request again') : null));
}
