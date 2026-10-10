// Complete an evaluation (#e/{id}): the official DOPS / Mini-CEX / EBD form for the assessor, with
// autosave (this device at once, the server for choices at once and text after 3 s idle), a sticky
// "n of N required" bar, submit, decline, and a read-only view for anyone else or once submitted.

import { S, h, fill, add, toast, cloud, icon, go, modal, debounce, fmtDate, fmtAgo, toMs, avatar, toolLabel, empty, draftKey } from './ui-core.js';
import { FORMS, SCALES, ENTRUSTMENT_TEXT_KEY } from './forms.js';
import { itemById } from './catalogue.js';
import { validate, visibleQuestions, nextGap, identifierWarning } from './engine.js';

const EDIT_MS = 15 * 60e3;              // the assessor may change a submitted form for 15 min
const TEXT_IDLE = 3000;                 // text goes to the server after 3 s without typing
const HOWTO_KEY = 'evals-howto-seen';
const AUTOSCROLL_KEY = 'evals-autoscroll';   // 'off' turns auto-advance off (More)

// Text the form inserts for you. It never counts toward a minimum length (engine.validate starters).
const entrustStarter = q => `Q: ${q}\nA: `;
const COMMENT_STARTERS = ['Did well: ', 'To reach the next level: '];

export const DECLINE_REASONS = [
  { code: 'not-observed', label: 'I did not observe this case' },
  { code: 'not-co-managed', label: 'I did not co-manage this case' },
  { code: 'conflict', label: 'Conflict of interest' },
  { code: 'wrong-item', label: 'Wrong item or form' },
  { code: 'other', label: 'Other reason' },
];

const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const blank = v => v == null || v === '' || (Array.isArray(v) && !v.length);
const uid = (() => { let n = 0; return p => `${p}-${++n}`; })();

// ---------- entry ----------

export async function renderForm(id) {
  injectCss();
  descPool();
  if (!id) return empty('No evaluation chosen', null, h('a', { class: 'n-btn', href: '#pending' }, 'Evaluations'));
  let ev = findLocal(id);
  if (!ev) {
    try { ev = await cloud.getEvaluation(id); } catch (err) { console.warn(err); }
  }
  if (!ev) {
    return empty('Evaluation not found', navigator.onLine ? 'It may have been withdrawn, or it was sent to a different account.' : 'Opens when you have signal.',
      h('a', { class: 'n-btn', href: '#pending' }, 'Evaluations'));
  }
  const form = FORMS[ev.formId];
  if (!form) return empty('Unknown form', `This evaluation uses a form this app doesn't know (${ev.formId}).`);
  setTitle(toolLabel(ev.tool || form.tool));
  return new FormScreen(ev, form).render();
}

function findLocal(id) {
  for (const list of [S.assigned, S.all, S.mine]) {
    const ev = (list || []).find(e => e.id === id);
    if (ev) return ev;
  }
  return null;
}

function setTitle(t) {
  const el = document.getElementById('title');
  if (el) el.textContent = t;
}

// ---------- the form screen ----------

class FormScreen {
  constructor(ev, form, mode) {
    this.ev = ev;
    this.form = form;
    this.item = itemById(ev.itemId);
    const me = S.user && S.user.email;
    this.isAssessor = !!me && ev.assessorEmail === me;
    this.inWindow = ev.status === 'submitted' && this.isAssessor && Date.now() < (toMs(ev.submittedAt) || 0) + EDIT_MS;
    // mode: 'fill' (requested), 'edit' (submitted, within 15 min, after tapping Edit), 'view'
    this.mode = mode || (this.isAssessor && ev.status === 'requested' ? 'fill' : 'view');
    this.answers = { ...(ev.assessment || {}) };
    this.metrics = { ...(ev.metrics || {}) };
    this.starters = [...(this.item?.entrustQs || []).map(entrustStarter), ...COMMENT_STARTERS];
    this.qEls = {};       // key -> question element
    this.refreshers = {}; // key -> fn() repainting that question's state
    this.saving = null;   // the server save in flight (at most one; later changes wait in this.again)
    this.again = false;
    this.sentAny = !!Object.keys(this.answers).length;   // the server holds some answers
    this.saveText = debounce(() => this.saveCloud(), TEXT_IDLE);
    this.lastPointer = 0;
    this.tried = false;   // a submit was attempted (then the bar's count is announced)
    if (this.mode === 'fill') this.restoreLocal();
  }

  get editable() { return this.mode === 'fill' || this.mode === 'edit'; }

  // ---- drafts ----

  // This device's copy wins only when it is newer than the server's (e.g. answers made offline).
  restoreLocal() {
    const local = ls.get(draftKey(this.ev.id));
    if (!local || !local.answers) return;
    const serverAt = toMs(this.ev.updatedAt) || 0;
    const differs = JSON.stringify(local.answers) !== JSON.stringify(this.answers);
    if (local.at > serverAt && differs) {
      this.answers = { ...this.answers, ...local.answers };
      for (const k of Object.keys(this.answers)) if (blank(this.answers[k])) delete this.answers[k];
      this.restored = true;
    } else if (!differs || local.at <= serverAt) ls.del(draftKey(this.ev.id));
  }

  saveLocal() { ls.set(draftKey(this.ev.id), { answers: this.answers, at: Date.now() }); }

  cleanAnswers() {
    const vis = new Set(visibleQuestions(this.form, this.answers).map(q => q.key));
    const out = {};
    for (const [k, v] of Object.entries(this.answers)) if (vis.has(k) && !blank(v)) out[k] = typeof v === 'string' ? v.replace(/\s+$/, '') : v;
    return out;
  }

  // Server save. Only while the request is open (an edit after submit is saved on "Save changes"
  // only, so a half-changed form never shows). Saves are coalesced: one in flight, and when it
  // settles only the latest answers go. They return once the write is in the offline cache.
  saveCloud() {
    if (this.mode !== 'fill') return Promise.resolve();
    this.saveText.cancel();
    if (this.saving) { this.again = true; return this.saving; }
    const run = async () => {
      do {
        this.again = false;
        const assessment = this.cleanAnswers();
        const patch = { metrics: this.metrics };
        // an empty assessment is left out: opening the form must not count as "started"
        if (Object.keys(assessment).length) { patch.assessment = assessment; this.sentAny = true; }
        else if (this.sentAny) { patch.assessment = null; this.sentAny = false; }
        if (S.user?.name && this.ev.assessorName !== S.user.name) patch.assessorName = S.user.name;
        try {
          await cloud.updateEvaluation(this.ev.id, patch, { wait: false });
          this.status('Saved');
        } catch (err) { console.warn('Save failed', err); this.status('Saved on this device'); this.saveError(err); this.again = false; }
      } while (this.again);
    };
    this.saving = run().finally(() => { this.saving = null; });
    return this.saving;
  }

  saveError(err) {
    if (err && err.code === 'permission-denied') {
      const cur = findLocal(this.ev.id);
      const why = cur && cur.status === 'cancelled' ? 'The resident cancelled this request.' : 'This request can no longer be changed.';
      toast(why + ' Your answers are kept on this device.');
    }
  }

  status(msg) { if (this.liveEl) this.liveEl.textContent = msg; }

  // ---- answering ----

  answer(q, value, { text = false, noAdvance = false } = {}) {
    const was = !blank(this.answers[q.key]);
    if (blank(value)) delete this.answers[q.key]; else this.answers[q.key] = value;
    if (!this.metrics.firstAnswerAt && !blank(value)) this.metrics.firstAnswerAt = Date.now();
    this.saveLocal();
    this.paintState(q.key);
    if (this.mode === 'fill') { if (text) this.saveText(); else this.saveCloud(); }
    if (!text && !noAdvance && !was && Date.now() - this.lastPointer < 1500) this.advance(q.key);
  }

  // After a choice, bring the next unanswered question into view. Focus stays put.
  advance(key) {
    try { if (localStorage.getItem(AUTOSCROLL_KEY) === 'off') return; } catch {}
    const keys = visibleQuestions(this.form, this.answers).map(q => q.key);
    const i = keys.indexOf(key);
    const next = keys.slice(i + 1).find(k => blank(this.answers[k]));
    const el = next ? this.qEls[next] : this.barEl;
    if (!el) return;
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      const top = (document.querySelector('.e-appbar')?.getBoundingClientRect().bottom || 0) + 4;
      const bottom = (this.barEl?.getBoundingClientRect().top || window.innerHeight) - 4;
      // already fully on screen (or its first part is, for a tall one): stay put
      if (r.top >= top && (r.bottom <= bottom || r.top + 160 <= bottom)) return;
      el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: next ? 'start' : 'end' });
    }, 120);
  }

  // Required tag, errors, EBD q3, and the bar after an answer changes.
  paintState(key) {
    const vis = new Set(visibleQuestions(this.form, this.answers).map(q => q.key));
    for (const [k, el] of Object.entries(this.qEls)) {
      el.hidden = !vis.has(k);
      el.classList.toggle('is-answered', !blank(this.answers[k]) && !this.errorFor(k));
    }
    if (key && this.refreshers[key]) this.refreshers[key]();
    if (key && this.qEls[key]?.classList.contains('is-error')) this.markErrors();
    this.paintBar();
  }

  result() { return validate(this.form, this.cleanAnswers(), { starters: this.starters }); }
  errorFor(key) {
    const q = this.form.sections.flatMap(s => s.questions).find(x => x.key === key);
    if (!q || q.type !== 'text' || blank(this.answers[key])) return null;
    const r = validate({ sections: [{ questions: [{ ...q, required: true }] }] }, { [key]: this.answers[key] }, { starters: this.starters });
    return r.errors[0]?.msg || (r.missing.length ? 'Add your own words' : null);
  }

  paintBar() {
    if (!this.countEl) return;
    const r = this.result();
    const done = r.ok;
    this.countEl.classList.toggle('is-done', done);
    fill(this.countEl, done ? [icon('check'), ' All required answered'] : `${r.answered} of ${r.required} required`,
      !done ? h('span', { class: 'e-small e-form__jump' }, ` · next: Q${nextGap(r)}`) : null);
    this.countEl.setAttribute('aria-live', this.tried ? 'polite' : 'off');
  }

  jumpToGap(focus = false) {
    const n = nextGap(this.result());
    const q = this.form.sections.flatMap(s => s.questions).find(x => x.n === n);
    const el = q && this.qEls[q.key];
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    if (focus) {
      const input = el.querySelector('input:not(:disabled), textarea');
      if (input) input.focus({ preventScroll: true });
    }
  }

  markErrors() {
    const r = this.result();
    const bad = new Map([...r.missing.map(n => [n, 'Required']), ...r.errors.map(e => [e.n, e.msg])]);
    for (const q of this.form.sections.flatMap(s => s.questions)) {
      const el = this.qEls[q.key];
      if (!el) continue;
      const msg = this.tried ? bad.get(q.n) : null;
      el.classList.toggle('is-error', !!msg);
      const box = el.querySelector(':scope > .e-q__error');
      if (box) { box.textContent = msg || ''; box.hidden = !msg; }
    }
    return r;
  }

  // ---- submit / decline ----

  async submit(btn) {
    this.tried = true;
    const r = this.markErrors();
    this.metrics.submitAttempts = (this.metrics.submitAttempts || 0) + 1;
    if (!r.ok) {
      const ns = [...new Set([...r.missing, ...r.errors.map(e => e.n)])].sort((a, b) => a - b);
      fill(this.gapsEl, `Still needed: ${ns.map(n => 'Q' + n).join(', ')}`);
      this.gapsEl.hidden = false;
      this.paintBar();
      this.jumpToGap(true);
      if (this.mode === 'fill') this.saveCloud();
      return;
    }
    this.gapsEl.hidden = true;
    btn.disabled = true;
    const live = findLocal(this.ev.id);
    if (live && this.mode === 'fill' && live.status !== 'requested') {
      toast(live.status === 'cancelled' ? 'The resident cancelled this request.' : 'This request is no longer open.');
      btn.disabled = false;
      return;
    }
    const assessment = this.cleanAnswers();
    const patch = this.mode === 'edit' ? { assessment }
      : { status: 'submitted', submittedAt: Date.now(), assessment, metrics: this.metrics, assessorName: S.user?.name || this.ev.assessorName };
    if (!navigator.onLine) this.status('Sending when online: keep this page open until ✓');
    try {
      // no waiting for autosaves: Firestore applies writes in order. The device copy stays until the
      // server has the submitted form (pruneDrafts), so a rejected offline submit loses nothing.
      this.saveText.cancel();
      this.again = false;
      this.saveLocal();
      const saved = await cloud.updateEvaluation(this.ev.id, patch);
      if (cloud.demo) ls.del(draftKey(this.ev.id));
      const ev = { ...this.ev, ...(saved || patch) };
      this.root.replaceWith(sentScreen(ev, this.mode === 'edit'));
      window.scrollTo(0, 0);
    } catch (err) {
      console.warn(err);
      btn.disabled = false;
      const m = modal('Not sent', [
        h('p', {}, err.code === 'permission-denied' ? 'The request is no longer open, or the 15-minute edit window has passed.' : 'Could not send: ' + (err.message || err)),
        h('p', { class: 'e-small' }, 'Your answers are kept on this device.'),
        h('div', { class: 'e-actions' },
          h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => copyAnswers(this.form, this.cleanAnswers()) }, 'Copy my answers'),
          h('button', { class: 'n-btn', onclick: () => m.close() }, 'OK')),
      ]);
    }
  }

  decline() {
    let code = null;
    const other = h('textarea', { class: 'e-textarea', rows: 2, id: 'decline-other', placeholder: 'Reason', autocapitalize: 'sentences', hidden: true, maxlength: 500 });
    const err = h('p', { class: 'e-q__error', hidden: true }, 'Choose a reason');
    const radios = h('div', { class: 'e-radios', role: 'radiogroup', 'aria-label': 'Reason' }, DECLINE_REASONS.map(r =>
      h('label', { class: 'e-radio' }, h('input', { type: 'radio', name: 'decline', value: r.code, onchange: () => {
        code = r.code; other.hidden = code !== 'other'; err.hidden = true;
        if (code === 'other') other.focus();
      } }), h('span', { class: 'e-radio__text' }, r.label))));
    const ok = h('button', { class: 'n-btn n-btn--alert', onclick: async () => {
      const text = other.value.trim();
      if (!code || (code === 'other' && !text)) { err.textContent = !code ? 'Choose a reason' : 'Say why in a few words'; err.hidden = false; return; }
      ok.disabled = true;
      try {
        this.saveText.cancel();
        this.again = false;
        // partial answers are dropped on decline (the resident never sees half a score sheet)
        await cloud.updateEvaluation(this.ev.id, { status: 'declined', declineReason: { code, text: code === 'other' ? text : '' }, declinedAt: Date.now(), assessment: null, metrics: null });
        if (cloud.demo) ls.del(draftKey(this.ev.id));
        m.close();
        toast('Declined. The resident can send it to someone else.');
        go('pending');
      } catch (e) {
        ok.disabled = false;
        err.textContent = 'Could not decline: ' + (e.message || e); err.hidden = false;
      }
    } }, 'Decline');
    const m = modal('I can’t assess this', [
      h('p', { class: 'e-small' }, 'The resident is told you couldn’t assess this case and can send it to another assessor.'),
      radios, other, err,
      h('div', { class: 'e-actions' }, h('button', { class: 'n-btn n-btn--outline e-btn-quiet', onclick: () => m.close() }, 'Cancel'), ok),
    ]);
  }

  // ---- rendering ----

  render() {
    const ev = this.ev, form = this.form;
    const root = h('div', { class: 'e-form', onpointerdown: () => { this.lastPointer = Date.now(); } });
    this.root = root;
    if (this.mode === 'fill' && !this.metrics.openedAt) {
      this.metrics.openedAt = Date.now();
      this.saveCloud();
    }
    add(root, this.header(), this.subject(), this.notice(), this.mode === 'fill' ? howTo() : null);
    // others see answers only once submitted (the resident's result screen is #r/{id})
    const hideAnswers = this.mode === 'view' && !this.isAssessor && ev.status !== 'submitted';
    if (hideAnswers) root.append(h('div', { class: 'e-q e-center' }, h('a', { class: 'n-btn', href: '#r/' + encodeURIComponent(ev.id) }, 'Request details')));
    for (const sec of hideAnswers ? [] : form.sections) {
      if (sec.title) root.append(h('h2', { class: 'e-section' }, sec.title));
      for (const q of sec.questions) root.append(this.question(q));
    }
    if (this.editable) {
      this.gapsEl = h('p', { class: 'e-alert e-form__gaps', role: 'alert', hidden: true });
      this.liveEl = h('span', { class: 'e-sr', 'aria-live': 'polite' });
      this.countEl = h('button', { type: 'button', class: 'e-submitbar__count', onclick: () => this.jumpToGap(false) });
      const btn = h('button', { type: 'button', class: 'n-btn e-go', onclick: () => this.submit(btn) }, this.mode === 'edit' ? 'Save changes' : 'Submit');
      this.barEl = h('div', { class: 'e-submitbar' }, this.countEl, btn, this.liveEl);
      add(root, this.gapsEl,
        h('p', { class: 'e-attest' }, `By submitting you confirm you directly observed${form.id === 'ebd' ? ' and co-managed' : ''} this case.`),
        this.barEl);
    } else {
      root.append(h('div', { class: 'e-q e-center' }, h('a', { class: 'n-btn n-btn--outline e-btn-quiet', href: '#pending' }, 'Back to Evaluations')));
    }
    this.paintState();
    if (this.restored) setTimeout(() => toast('Restored answers saved on this device'), 300);
    return root;
  }

  header() {
    const ev = this.ev;
    return h('div', { class: 'e-q e-form__head' },
      h('div', { class: 'e-form__headrow' },
        h('span', { class: 'e-tag e-tag--tool' }, toolLabel(ev.tool || this.form.tool)),
        ev.epa ? h('span', { class: 'e-tag' }, `EPA ${ev.epa}`) : null,
        ev.level ? h('span', { class: 'e-tag' }, `L${ev.level}`) : null,
        h('span', { class: 'e-grow' }),
        this.mode === 'fill' ? h('button', { type: 'button', class: 'e-btn-link e-form__cant', onclick: () => this.decline() }, 'I can’t assess this') : null),
      h('h1', { class: 'e-h3 e-form__title' }, this.form.title),
      h('p', { class: 'e-form__item' }, ev.itemText || this.item?.text || ev.itemId || ''),
      h('p', { class: 'e-small e-form__date' }, `Requested ${fmtDate(ev.requestedAt || ev.createdAt)} · ${fmtAgo(ev.requestedAt || ev.createdAt)}`));
  }

  subject() {
    const ev = this.ev, rq = ev.request || {};
    const kv = [['Date', rq.date ? fmtDate(rq.date) : fmtDate(ev.date)], ['Location', rq.location], ['Patient', rq.initials],
      ['Age', rq.ageBand], ['Gender', rq.gender], ev.formId === 'ebd' && rq.coManaged ? ['Co-managed', 'Yes'] : null, ['Notes', rq.notes]]
      .filter(x => x && x[1]);
    return h('section', { class: 'e-form__subject', 'aria-label': 'Evaluation subject' },
      h('h2', { class: 'e-section' }, 'Evaluation Subject'),
      h('div', { class: 'e-subject' }, avatar(ev.residentName || ev.residentEmail),
        h('div', {},
          h('p', { class: 'e-subject__name' }, ev.residentName || ev.residentEmail),
          h('p', { class: 'e-subject__meta' }, ev.residentEmail))),
      kv.length ? h('dl', { class: 'e-kv e-form__case' }, kv.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])) : null);
  }

  notice() {
    const ev = this.ev;
    if (this.mode === 'edit') return h('p', { class: 'e-note' }, `Editing a submitted form. Changes save when you tap Save changes (until ${fmtDate(toMs(ev.submittedAt) + EDIT_MS, { time: true })}).`);
    if (this.mode === 'fill') return null;
    if (ev.status === 'submitted') {
      return h('div', { class: 'e-ok-note e-form__notice' },
        h('span', {}, `Submitted ${fmtDate(ev.submittedAt, { time: true })}${ev.assessorName ? ' by ' + ev.assessorName : ''}.`),
        this.inWindow ? h('button', { class: 'n-btn e-btn-small', onclick: () => {
          const s = new FormScreen(this.ev, this.form, 'edit');
          this.root.replaceWith(s.render());
        } }, `Edit answers (${Math.max(1, Math.ceil(((toMs(ev.submittedAt) + EDIT_MS) - Date.now()) / 60e3))} min left)`) : null);
    }
    if (ev.status === 'declined') {
      const r = DECLINE_REASONS.find(x => x.code === ev.declineReason?.code);
      return h('p', { class: 'e-alert' }, `Declined ${fmtDate(ev.declinedAt)}: ${r ? r.label : 'no reason given'}${ev.declineReason?.text ? ' – ' + ev.declineReason.text : ''}.`);
    }
    if (ev.status === 'cancelled') return h('p', { class: 'e-alert' }, 'Cancelled by resident. Nothing more to do.');
    if (ev.status === 'draft') return h('p', { class: 'e-note' }, 'The resident hasn’t sent this request yet.');
    if (!this.isAssessor) return h('p', { class: 'e-note' }, `Waiting for ${ev.assessorName || ev.assessorEmail}. Read only.`);
    return null;
  }

  // One question: fieldset for choices, a plain block for text.
  question(q) {
    const choice = q.type !== 'text';
    const id = `q-${q.key}`;
    const ro = !this.editable;
    const [label, more] = labelParts(q);
    const head = [
      h('span', { class: 'e-q__n' }, `${q.n}.`),
      h('span', { class: 'e-q__label', id: `${id}-label` }, label),
      q.required ? h('span', { class: 'e-required' }, h('span', { 'aria-hidden': 'true' }, 'Required'), h('span', { class: 'e-sr' }, ', required')) : null,
    ];
    // the rest of a long label sits after the legend, so it is not part of the group's name
    const moreEl = more ? h('details', { class: 'e-q__more e-q__help' }, h('summary', {}, 'more'), more) : null;
    const el = choice
      ? h('fieldset', { class: 'e-q', id, 'data-q': q.n, disabled: ro || null }, h('legend', { class: 'e-q__head' }, head), moreEl)
      : h('div', { class: 'e-q', id, 'data-q': q.n }, h('div', { class: 'e-q__head' }, head), moreEl);
    this.qEls[q.key] = el;
    const body = {
      ninePoint: () => this.ninePoint(q, ro),
      milestone: () => this.milestone(q, ro),
      supervision: () => this.supervision(q, ro),
      select: () => this.select(q, ro),
      checkboxes: () => this.checkboxes(q, ro),
      text: () => this.text(q, ro),
    }[q.type];
    add(el, body ? body() : h('p', {}, `Unsupported question type ${q.type}`), h('p', { class: 'e-q__error', hidden: true }));
    return el;
  }

  radio(q, value, ro, extra = {}) {
    const cur = this.answers[q.key];
    return h('input', { type: 'radio', name: `${this.ev.id}-${q.key}`, value: String(value), checked: cur != null && String(cur) === String(value),
      disabled: ro || null, onchange: () => this.answer(q, value), ...extra });
  }

  ninePoint(q, ro) {
    const sc = SCALES.ninePoint;
    const band = v => sc.bands.find(b => v >= b.range[0] && v <= b.range[1])?.label || '';
    const desc = h('p', { class: 'e-scale9__desc', 'aria-hidden': 'true' });
    const paintDesc = () => {
      const v = this.answers[q.key];
      if (v === 'NA') fill(desc, h('b', {}, sc.naLabel || 'Not observed'));
      else if (v != null) {
        const o = sc.options.find(o => o.value === Number(v));
        fill(desc, h('b', {}, `${v} · ${band(Number(v)).replace(' Expectations', '')}: `), o ? o.descriptor : '');
      } else fill(desc);
    };
    this.refreshers[q.key] = paintDesc;
    paintDesc();
    return h('div', { class: 'e-scale9' },
      h('div', { class: 'e-scale9__bands', 'aria-hidden': 'true' }, sc.bands.map(b => h('span', {}, b.label.replace(' Expectations', '')))),
      h('div', { class: 'e-scale9__row' }, sc.options.map(o =>
        h('label', { class: 'e-cell' }, this.radio(q, o.value, ro, { 'aria-label': `${o.value}, ${band(o.value)}`, 'aria-describedby': descId(o.value) }),
          h('span', { 'aria-hidden': 'true' }, o.label)))),
      h('div', { class: 'e-scale9__na' },
        q.na ? h('label', { class: 'e-cell e-cell--na' }, this.radio(q, 'NA', ro), h('span', {}, sc.naLabel || 'Not observed')) : null,
        h('span', { class: 'e-grow' }),
        h('button', { type: 'button', class: 'e-btn-link e-form__info', onclick: () => this.scaleInfo(q) }, icon('info'), 'Descriptors')),
      desc);
  }

  async scaleInfo(q) {
    const sc = SCALES.ninePoint;
    const body = h('div', { class: 'e-form__info-body' },
      h('dl', { class: 'e-kv' }, sc.options.map(o => [h('dt', {}, h('b', {}, o.value)), h('dd', {}, o.descriptor)])),
      q.na ? h('p', { class: 'e-small' }, `${sc.naLabel}: the item was not part of this case.`) : null);
    const m = modal(q.label.length > 80 ? `Q${q.n}` : q.label, [body, h('div', { class: 'e-actions' }, h('button', { class: 'n-btn', onclick: () => m.close() }, 'Close'))]);
    if (this.form.id !== 'dops') return;
    const exp = await dopsExpectations(this.ev.itemId, q.n).catch(() => null);
    if (!exp) return;
    body.append(
      exp.row ? h('div', { class: 'e-form__exp' }, h('h3', { class: 'e-h3' }, `Guidebook: ${exp.title}`),
        [['Below', exp.row[1]], ['Meeting', exp.row[2]], ['Above', exp.row[3]]].map(([k, v]) =>
          h('div', { class: 'e-form__exprow' }, h('b', {}, k), v.split(/<br\s*\/?>/i).map(s => h('p', {}, s.trim()))))) : null,
      exp.checklist.length ? h('details', { class: 'e-q__more' }, h('summary', {}, 'Procedure checklist'),
        exp.checklist.map(([t, items]) => [h('p', {}, h('b', {}, t)), h('ol', {}, items.map(i => h('li', {}, i)))])) : null);
  }

  // Milestones look like the 9-point scale: one row of 1-9 (stored as the official 1.0-5.0 in half
  // steps), "Not yet Level 1" and "Not observed" below, the chosen descriptor under the row.
  milestone(q, ro) {
    const sc = SCALES.milestone;
    const opts = sc.options.filter(o => o.value >= 1);
    const nOf = v => Math.round(Number(v) * 2 - 1);            // 1.0 -> 1, 1.5 -> 2 ... 5.0 -> 9
    const anchorText = n => q.descriptors?.[String(n)] || '';
    const desc = h('p', { class: 'e-scale9__desc', 'aria-hidden': 'true' });
    const paintDesc = () => {
      const v = this.answers[q.key];
      if (v === 'NA') fill(desc, h('b', {}, 'Not observed'));
      else if (Number(v) === 0.5) fill(desc, h('b', {}, 'Not yet achieved Level 1'));
      else if (v != null) {
        const n = nOf(v);
        fill(desc, n % 2 ? [h('b', {}, `${n} · Level ${(n + 1) / 2}: `), anchorText(n)] : h('b', {}, `${n} · between Level ${n / 2} and Level ${n / 2 + 1}`));
      } else fill(desc);
    };
    this.refreshers[q.key] = paintDesc;
    paintDesc();
    return h('div', { class: 'e-scale9 e-scale9--milestone' },
      h('div', { class: 'e-scale9__row e-scale9__row--even' }, opts.map(o => {
        const n = nOf(o.value);
        return h('label', { class: 'e-cell' }, this.radio(q, o.value, ro, { 'aria-label': n % 2 ? `${n}, level ${(n + 1) / 2}: ${anchorText(n)}` : `${n}, between level ${n / 2} and ${n / 2 + 1}` }),
          h('span', { 'aria-hidden': 'true' }, String(n)));
      })),
      h('div', { class: 'e-scale9__na' },
        h('label', { class: 'e-cell e-cell--na' }, this.radio(q, 0.5, ro, { 'aria-label': 'Not yet achieved level 1' }), h('span', {}, 'Not yet Level 1')),
        q.na ? h('label', { class: 'e-cell e-cell--na' }, this.radio(q, 'NA', ro), h('span', {}, 'Not observed')) : null,
        h('span', { class: 'e-grow' }),
        h('button', { type: 'button', class: 'e-btn-link e-form__info', onclick: () => this.milestoneInfo(q) }, icon('info'), 'Descriptors')),
      desc);
  }

  milestoneInfo(q) {
    const rows = [[h('b', {}, '<1'), 'Not yet achieved Level 1']];
    for (const n of [1, 3, 5, 7, 9]) rows.push([h('b', {}, `${n} (L${(n + 1) / 2})`), q.descriptors?.[String(n)] || '']);
    const body = h('div', { class: 'e-form__info-body' },
      h('dl', { class: 'e-kv' }, rows.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('p', { class: 'e-small' }, 'Even numbers sit between two levels.'));
    const m = modal(q.label.length > 80 ? `Q${q.n}` : q.label, [body, h('div', { class: 'e-actions' }, h('button', { class: 'n-btn', onclick: () => m.close() }, 'Close'))]);
  }

  supervision(q, ro) {
    const sc = SCALES.supervision;
    return h('div', { class: 'e-radios' }, sc.options.map(o => {
      const dId = uid('sd');
      return h('label', { class: 'e-radio' }, this.radio(q, o.value, ro, { 'aria-describedby': dId }),
        h('span', { class: 'e-radio__text' }, h('b', {}, o.label), h('span', { class: 'e-small', id: dId }, sc.descriptions?.[o.value] || '')));
    }));
  }

  select(q, ro) {
    const opts = q.options || SCALES[q.scaleKey]?.options || [];
    if (q.scaleKey === 'guidance') {
      return h('div', { class: 'e-radios' }, opts.map(o => h('label', { class: 'e-radio' }, this.radio(q, o, ro), h('span', { class: 'e-radio__text' }, o))));
    }
    return h('div', { class: q.scaleKey === 'clinicalSetting' ? 'e-chips e-chips--grid' : 'e-chips' },
      opts.map(o => h('label', { class: 'e-choice' }, this.radio(q, o, ro), h('span', {}, o))));
  }

  checkboxes(q, ro) {
    const boxes = [];
    const sync = () => {
      const v = this.answers[q.key] || [];
      const ex = q.exclusive && v.includes(q.exclusive);
      for (const b of boxes) { b.checked = v.includes(b.value); b.disabled = ro || (ex && b.value !== q.exclusive); }
    };
    const list = h('div', { class: 'e-checks' }, q.options.map(o => {
      const b = h('input', { type: 'checkbox', value: o, disabled: ro || null, onchange: () => {
        let v = [...(this.answers[q.key] || [])].filter(x => x !== o);
        if (b.checked) v = o === q.exclusive ? [o] : [...v.filter(x => x !== q.exclusive), o];
        this.answer(q, q.options.filter(x => v.includes(x)), { noAdvance: true });   // in the options' order
        sync();
      } });
      boxes.push(b);
      return h('label', { class: 'e-check' }, b, h('span', {}, o));
    }));
    sync();
    return list;
  }

  text(q, ro) {
    const isEntrust = ENTRUSTMENT_TEXT_KEY[this.form.id] === q.key;
    const ta = h('textarea', {
      class: 'e-textarea', id: `${q.key}-${this.ev.id}`, rows: 3, autocapitalize: 'sentences', enterkeyhint: 'done', spellcheck: 'true',
      'aria-labelledby': `q-${q.key}-label`, readonly: ro || null, maxlength: 4000,
      'aria-required': q.required && !ro ? 'true' : null,
      'aria-describedby': q.minLength ? `${q.key}-${this.ev.id}-count` : null,
    });
    ta.value = this.answers[q.key] || '';
    const counter = q.minLength ? h('p', { class: 'e-counter', id: `${q.key}-${this.ev.id}-count`, 'aria-live': 'off' }) : null;
    const warn = h('p', { class: 'e-warn-note e-form__idwarn', hidden: true, role: 'status' });
    const own = () => ownLen(ta.value, this.starters);
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 480) + 'px'; };
    const refresh = () => {
      if (counter) {
        const n = own();
        counter.textContent = `${n}/${q.minLength}`;
        counter.setAttribute('aria-label', `${n} of at least ${q.minLength} characters of your own`);
        counter.classList.toggle('is-short', n > 0 && n < q.minLength);
      }
      const w = identifierWarning(ta.value);
      warn.textContent = w || ''; warn.hidden = !w;
    };
    this.refreshers[q.key] = refresh;
    ta.addEventListener('input', () => { grow(); this.answer(q, ta.value, { text: true }); });
    ta.addEventListener('blur', () => { if (this.mode === 'fill' && this.saveText) this.saveText.flush(); });
    requestAnimationFrame(grow);
    refresh();
    const insert = s => {
      const v = ta.value.replace(/\s+$/, '');
      ta.value = (v ? v + '\n' : '') + s;
      grow();
      this.answer(q, ta.value, { text: true });
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    };
    let starters = null;
    if (isEntrust) {
      // the item's suggested entrustment questions, as a plain reading list (not tappable)
      const qs = this.item?.entrustQs || [];
      starters = qs.length
        ? h('div', { class: 'e-entrust' },
            h('p', { class: 'e-entrust__title' }, 'Entrustment questions (discuss at least 2)'),
            h('ol', { class: 'e-entrust__list' }, qs.map(x => h('li', {}, x))))
        : h('p', { class: 'e-q__help' }, 'The guidebook sets no entrustment questions for this item. Discuss at least 2 of your own.');
    } else if (!ro && (q.feedback || q.minLength)) {
      starters = h('div', { class: 'e-starters' }, COMMENT_STARTERS.map(s => h('button', { type: 'button', onclick: () => insert(s) }, s.replace(/: $/, '…'))));
    }
    return [starters, ta, counter, warn];
  }
}

// ---------- pieces ----------

// The long supervision question: [first sentence, the rest (shown behind "more") or null].
function labelParts(q) {
  const t = q.label || '';
  // only the long supervision question folds (other long labels would split at "e.g. ")
  if (q.type !== 'supervision' || t.length < 160) return [t, null];
  const i = t.indexOf('. ');
  if (i < 0) return [t, null];
  return [t.slice(0, i + 1), t.slice(i + 2)];
}

// own words only: starters count neither as typed nor trimmed ("A: " is stored as "A:")
const ownLen = (v, starters) => {
  let t = String(v || '');
  for (const s of starters) { t = t.split(s).join(' '); if (s.trimEnd()) t = t.split(s.trimEnd()).join(' '); }
  return t.replace(/\s+/g, ' ').trim().length;
};

// Shared hidden descriptors for the 9-point radios (aria-describedby): once per page, outside #app,
// so they survive one form replacing another.
const descId = v => `e-d9-${v}`;
function descPool() {
  if (document.getElementById(descId(1))) return;
  document.body.append(h('div', { hidden: true, id: 'e-d9-pool' }, SCALES.ninePoint.options.map(o => h('span', { id: descId(o.value) }, o.descriptor))));
}

function howTo() {
  const seen = ls.get(HOWTO_KEY);
  const d = h('details', { class: 'e-q e-form__howto', open: !seen || null, ontoggle: () => { if (!d.open) ls.set(HOWTO_KEY, 1); } },
    h('summary', {}, icon('info'), ' How this form works'),
    h('ul', {},
      h('li', {}, 'Scores 1–3 are below, 4–6 meet and 7–9 exceed expectations for the stage of training. Tap Descriptors for the full wording.'),
      h('li', {}, 'Red ', h('b', {}, 'Required'), ' tags turn into a ✓ as you answer. The bar at the bottom jumps to the next gap.'),
      h('li', {}, 'Answers save as you go, so you can stop and come back from Evaluations.'),
      h('li', {}, 'If you didn’t see this case, tap ', h('b', {}, 'I can’t assess this'), ' at the top.')));
  if (!seen) ls.set(HOWTO_KEY, 1);
  return d;
}

// After submit: "Sent ✓", tell the resident, next pending.
function sentScreen(ev, edited) {
  const me = S.user?.email;
  const next = (S.assigned || []).filter(e => e.status === 'requested' && e.id !== ev.id && e.residentEmail !== me)
    .sort((a, b) => (a.requestedAt || a.createdAt || 0) - (b.requestedAt || b.createdAt || 0));
  const link = resultLink(ev.id);
  const msg = `${toolLabel(ev.tool)} done: ${ev.itemText || ''}`.trim();
  const tell = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Evaluation done', text: msg, url: link }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${msg}\n${link}`); toast('Link copied'); }
    catch { toast(link, { ms: 9000 }); }
  };
  setTitle('Sent');
  return h('div', { class: 'e-stack e-form__sent' },
    h('div', { class: 'e-card e-center' },
      h('div', { class: 'e-form__senticon', 'aria-hidden': 'true' }, icon('check')),
      h('h1', { class: 'e-h2', role: 'status', 'aria-live': 'polite' }, edited ? 'Changes saved ✓' : 'Sent ✓'),
      h('p', {}, `${toolLabel(ev.tool)} for ${ev.residentName || ev.residentEmail}`),
      h('p', { class: 'e-small' }, ev.itemText || ''),
      h('p', { class: 'e-small' }, 'You can change your answers for 15 minutes from Evaluations › History.')),
    h('button', { class: 'n-btn e-btn-big', onclick: tell }, icon('share'), ' Tell resident'),
    next.length ? h('a', { class: 'n-btn n-btn--secondary e-btn-big', href: '#e/' + encodeURIComponent(next[0].id) }, `Next pending (${next.length})`) : null,
    h('a', { class: 'n-btn n-btn--outline e-btn-quiet e-btn-big', href: '#pending' }, 'Back to Evaluations'));
}

function resultLink(id) {
  const u = new URL(location.href);
  u.hash = 'r/' + id;
  if (cloud.demo) u.search = '?demo'; else u.search = '';
  return u.toString();
}

async function copyAnswers(form, answers) {
  const lines = form.sections.flatMap(s => s.questions).filter(q => !blank(answers[q.key]))
    .map(q => `Q${q.n}: ${Array.isArray(answers[q.key]) ? answers[q.key].join('; ') : answers[q.key]}`);
  try { await navigator.clipboard.writeText(lines.join('\n')); toast('Answers copied'); } catch { toast('Could not copy'); }
}

// ---------- DOPS guidebook expectations (fetched on first use) ----------

const DOPS_PROC = {
  'DOPS-2-02': 'Laryngeal Mask Airway', 'DOPS-2-03': 'Endotracheal Intubation', 'DOPS-2-05': 'Endotracheal Intubation',
  'DOPS-2-01': 'Laryngeal Mask Airway', 'DOPS-2-04': 'Endotracheal Intubation',
  'DOPS-2-06': 'Double Lumen Tube', 'DOPS-3-01': 'Spinal Anaesthesia', 'DOPS-3-02': 'Peripheral Nerve Block (PNB)',
  'DOPS-3-03': 'Peripheral Nerve Block (PNB)', 'DOPS-3-04': 'Peripheral Nerve Block (PNB)', 'DOPS-3-05': 'with catheter',
  'DOPS-4-01': 'Scope Assisted', 'DOPS-4-02': 'Difficult Intubation', 'DOPS-6-01': 'Intra-Arterial', 'DOPS-6-02': 'Dialysis',
  'DOPS-7a-01': 'Labour Combined', 'DOPS-10-01': 'Central Venous',
};
let mdP = null;
async function dopsExpectations(itemId, n) {
  const key = DOPS_PROC[itemId];
  if (!key) return null;
  mdP = mdP || fetch('reference/guidebook/dops-expectations.md').then(r => (r.ok ? r.text() : Promise.reject(new Error(r.status))));
  let md;
  try { md = await mdP; } catch (e) { mdP = null; throw e; }
  const parts = md.split(/\n## /).slice(1);
  // the first heading containing the key, preferring an exact "(PNB)" over "(PNB) with catheter"
  const sec = parts.find(p => { const t = p.split('\n')[0]; return t.includes(key) && (key === 'with catheter' || !/with catheter/.test(t)); });
  if (!sec) return null;
  const title = sec.split('\n')[0].replace(/^DOPS for /, '');
  const checklist = [];
  for (const block of sec.split(/\n### /).slice(1)) {
    const head = block.split('\n')[0].trim();
    if (/^Expectations/i.test(head)) continue;
    const items = block.split('\n').filter(l => /^\d+\.\s/.test(l)).map(l => l.replace(/^\d+\.\s+/, ''));
    if (items.length) checklist.push([head, items]);
  }
  const rows = sec.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*-/.test(l)).slice(1)
    .map(l => l.split('|').slice(1, -1).map(c => c.trim()));
  // the table rows follow the form's Q3–Q13 in order (Q14 is the overall score)
  const row = rows.length === 11 && n >= 3 && n <= 13 ? rows[n - 3] : null;
  return { title, checklist, row };
}

// ---------- styles not in style.css (scoped to the form) ----------

function injectCss() {
  if (document.getElementById('e-form-css')) return;
  document.head.append(h('style', { id: 'e-form-css' }, `
.e-form__head { padding-bottom: 12px; }
.e-form__headrow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: -8px 0 4px; }
.e-form__cant { min-height: var(--e-touch, 48px); font-size: var(--n-text-sm); color: var(--n-alert-ink); }
.e-form__title { margin: 4px 0 2px; }
.e-form__item { margin: 0 0 4px; font-weight: var(--n-semibold); }
.e-form__date { margin: 0; }
.e-form__case { padding: 0 16px 14px 84px; background: var(--n-bg); border-bottom: 1px solid var(--n-line); }
.e-form__subject .e-subject { border-bottom: 0; }
.e-form__notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.e-form__howto summary { cursor: pointer; display: flex; align-items: center; gap: 6px; min-height: var(--e-touch, 48px); font-weight: var(--n-semibold); color: var(--n-navy); }
.e-form__howto ul { margin: 8px 0 0; padding-left: 20px; font-size: var(--n-text-sm); }
.e-form__howto li { margin-bottom: 4px; }
.e-form__howto { background: var(--e-info-bg); }
.e-form__info { min-height: var(--e-touch, 48px); font-size: var(--n-text-sm); text-decoration: none; }
.e-form__info .e-ico { width: 20px; height: 20px; }
.e-scale9__na { align-items: center; padding: 0 8px; }
.e-form__change { min-height: var(--e-touch, 48px); font-size: var(--n-text-sm); margin-top: 4px; }
.e-entrust { margin: 0 0 10px; padding: 10px 12px; background: var(--n-bg-blue); border-left: 3px solid var(--n-navy); }
.e-entrust__title { margin: 0 0 6px; font-weight: 600; color: var(--n-navy); font-size: var(--n-text-sm); }
.e-entrust__list { margin: 0; padding-left: 1.4em; font-size: var(--n-text-sm); color: var(--n-ink); }
.e-entrust__list li { margin: 0 0 6px; white-space: pre-line; }
.e-form__idwarn { margin: 8px 0 0; padding: 8px 12px; }
.e-form__gaps { margin: 0; }
.e-form__jump { font-weight: var(--n-regular); color: var(--n-muted); }
.e-q > .e-q__more { margin: -4px 0 8px; }
.e-submitbar__count.is-done { display: inline-flex; align-items: center; gap: 6px; }
.e-form__exp { margin-top: 16px; }
.e-form__exprow { margin: 0 0 10px; font-size: var(--n-text-sm); }
.e-form__exprow p { margin: 0 0 4px; }
.e-form__info-body .e-kv { font-size: var(--n-text-sm); }
.e-form__info-body ol { padding-left: 20px; font-size: var(--n-text-sm); }
.e-form__sent { padding: 16px; }
.e-form__senticon { display: grid; place-items: center; width: 64px; height: 64px; margin: 0 auto 8px; border-radius: 50%; background: var(--e-ok-bg); color: var(--e-go); }
.e-form__senticon .e-ico { width: 36px; height: 36px; stroke-width: 3; }
.e-form__sent .n-btn { gap: 8px; text-decoration: none; }
.e-pending__age--late { color: var(--n-alert-ink); font-weight: var(--n-semibold); }
fieldset.e-q:disabled .e-cell, fieldset.e-q:disabled .e-choice, fieldset.e-q:disabled .e-radio, fieldset.e-q:disabled .e-milestone__opt { cursor: default; }
`));
}
