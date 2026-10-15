// NTF Roster: one day at a glance (#day?d=YYYY-MM-DD), the default screen on phones. Who is on each duty (with the
// cover rules' counts), who is away, requests, notes and the day's problems with a Show button to jump to the grid,
// each as one of the kit's grouped lists. Swipe left/right (or the arrows, or the date strip) to change day.
import * as M from './model.js';
import { coverOn, makeHasCodes, chipVars } from './ui-roster.js';

const WD = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'];
const LONG_WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function mount(el, app) {
  const { h, icon } = app;
  let day = pickDay(app.params.d);

  el.innerHTML = '';
  const root = h('div', { class: 'dayv' });
  el.append(root);

  const prevBtn = h('button', { type: 'button', class: 'app-bar-btn day-arrow', 'aria-label': 'Previous day', html: icon('left') });
  const nextBtn = h('button', { type: 'button', class: 'app-bar-btn day-arrow', 'aria-label': 'Next day', html: icon('right') });
  const title = h('div', { class: 'day-title' });
  const head = h('div', { class: 'day-head' }, prevBtn, title, nextBtn);
  const strip = h('div', { class: 'day-strip', role: 'group', 'aria-label': 'Days of the month' });
  const content = h('div', { class: 'day-content' });
  root.append(head, strip, content);

  prevBtn.addEventListener('click', () => goDay(M.addDays(day, -1)));
  nextBtn.addEventListener('click', () => goDay(M.addDays(day, 1)));
  strip.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) goDay(b.dataset.d); });

  // swipe to change day
  let sx = 0, sy = 0, st = 0;
  content.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
  content.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st < 600 && Math.abs(dx) > 60 && Math.abs(dy) < 45) goDay(M.addDays(day, dx < 0 ? 1 : -1));
  }, { passive: true });

  function pickDay(d) {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && M.iso(M.parseISO(d)) === d) return d;   // a real date only (not 2026-13-45)
    const sc = app.selectedCell;
    if (sc && sc.date && sc.date.startsWith(app.month)) return sc.date;
    const today = M.iso(new Date());
    return today.startsWith(app.month) ? today : app.month + '-01';
  }

  function goDay(d) {
    app.go('day', { d, m: M.monthOf(d) });
  }

  function longDate(d) {
    const dt = M.parseISO(d);
    return `${LONG_WD[dt.getDay()]} ${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
  }

  function render() {
    const state = app.store.get();
    if (!day.startsWith(app.month)) day = pickDay();
    const days = M.monthDays(app.month);
    const today = M.iso(new Date());
    const ev = app.evaluation();
    const dmap = M.dutyMap(state);
    const staff = M.staffInMonth(state, app.month).filter(p => M.staffActiveOn(p, day));
    const smap = new Map((state.staff || []).map(p => [p.id, p]));
    const gmap = M.groupMap(state);
    const hasCodes = makeHasCodes(state);
    const hol = M.isHoliday(state, day) ? (M.holidayName(state, day) || 'Public holiday') : '';
    const overnight = new Set((state.duties || []).filter(d => d.overnight).map(d => d.code));
    const dayViol = ev.byDay?.get(day) || [];
    const styleVars = (du) => chipVars(du);
    const nm = (p) => p.short || p.name;

    // title
    title.innerHTML = '';
    title.append(
      h('h2', { class: 'day-h' }, longDate(day)),
      h('p', { class: 'day-sub' },
        day === today ? h('span', { class: 'app-badge' }, 'Today') : null,
        hol ? h('span', { class: 'app-badge app-badge--ink' }, hol) : null,
        M.isWeekend(day) && !hol ? h('span', { class: 'app-badge app-badge--ink' }, 'Weekend') : null,
        h('span', { class: 'muted' }, `${staff.length} in post`)));

    // strip
    strip.innerHTML = days.map(d => {
      const n = (ev.byDay?.get(d) || []);
      const hard = n.some(v => v.hard);
      const cls = ['ds', M.isWeekend(d) ? 'we' : '', M.isHoliday(state, d) ? 'hol' : '', d === today ? 'td' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-d="${d}"${d === day ? ' aria-current="date"' : ''} aria-label="${M.fmtDay(d)}${n.length ? `, ${n.length} problem${n.length > 1 ? 's' : ''}` : ''}"><span class="ds-wd">${WD[M.weekday(d)]}</span><span class="ds-n">${+d.slice(8)}</span>${n.length ? `<span class="ds-dot ${hard ? 'vh' : 'vs'}"></span>` : '<span class="ds-dot none"></span>'}</button>`;
    }).join('');
    const cur = strip.querySelector('[aria-current]');
    if (cur) {
      const left = cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2;
      strip.scrollTo({ left: Math.max(0, left), behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
    }

    // gather the day
    const byCode = new Map();     // assigned code -> [{ p, auto }]
    const reqs = new Map();       // request code -> [p]
    const notes = [];
    const post = [];
    for (const p of staff) {
      const cell = state.cells?.[day]?.[p.id];
      const prev = state.cells?.[M.addDays(day, -1)]?.[p.id];
      if (prev && (prev.a || []).some(c => overnight.has(c)) && !(cell?.a || []).includes('x')) post.push(p);
      if (!cell) continue;
      for (const c of cell.a || []) { if (!byCode.has(c)) byCode.set(c, []); byCode.get(c).push({ p, auto: (cell.auto || []).includes(c), cell }); }
      for (const c of cell.r || []) { if (!reqs.has(c)) reqs.set(c, []); reqs.get(c).push(p); }
      if (cell.note) notes.push({ p, note: cell.note });
    }
    const cover = coverOn(state, day, staff, hasCodes);

    content.innerHTML = '';
    if (!staff.length) {
      content.append(h('div', { class: 'app-card app-empty' }, h('span', { class: 'app-empty-icon', html: icon('person') }),
        h('p', { class: 'app-empty-title' }, 'Nobody in post'), h('p', { class: 'app-empty-text' }, 'Nobody on the staff list is in post on this day.')));
      return;
    }

    // one grouped list: a section header (with the count), then rows
    const group = (cls, label, head, rows) => h('section', { class: `app-section day-card ${cls}`, 'aria-label': label },
      h('h3', { class: 'app-section-header dc-h' }, head), h('ul', { class: 'app-list' }, rows.map(r => h('li', null, r))));
    const row = (lead, title, sub, trail) => h('div', { class: 'app-row' }, lead,
      h('span', { class: 'app-row-body' }, h('span', { class: 'app-row-title' }, title), sub ? h('span', { class: 'app-row-sub' }, sub) : null), trail);
    const lead = (chip) => h('span', { class: 'day-row-lead' }, chip);

    // problems
    if (dayViol.length) {
      const hard = dayViol.filter(v => v.hard), soft = dayViol.filter(v => !v.hard);
      content.append(group('day-probs', 'Problems',
        ['Problems', h('span', { class: 'dc-count' }, hard.length ? `${hard.length} must-fix` : '', hard.length && soft.length ? ' · ' : '', soft.length ? `${soft.length} to improve` : '')],
        [...hard, ...soft].map(v => {
          const sid = v.staffId || (v.staffIds || [])[0] || null;
          return row(h('span', { class: `app-row-icon ${v.hard ? 'app-row-icon--bad' : 'app-row-icon--warn'}`, html: icon('alert') }), v.msg, v.hard ? null : 'To improve',
            h('button', {
              type: 'button', class: 'app-btn app-btn--plain app-btn--compact', 'aria-label': `Show on the roster: ${v.msg}`,
              onclick: () => { app.selectCell(day, sid); if (!sid) app.selectedCell = { date: day, staffId: null }; app.go('roster', { m: app.month }); },
            }, 'Show'));
        })));
    }

    // duties: shifts first (auto ones always, others when someone is on them)
    const shiftDuties = (state.duties || []).filter(d => d.kind === 'shift' && (d.auto || byCode.has(d.code)));
    for (const du of shiftDuties) {
      const on = byCode.get(du.code) || [];
      const cv = cover.filter(c => (c.rule.params?.codes || []).includes(du.code));
      if (!on.length && !cv.length) continue;   // auto duty not needed today (e.g. PHD on a normal day)
      const badges = cv.length ? h('span', { class: 'cov-badges' }, cv.map(c => {
        const need = c.min != null ? c.min : c.max;
        const txt = `${c.label} ${c.n}${need != null ? '/' + need : ''}`;
        const say = c.status === 'short' ? `short by ${c.min - c.n}` : c.status === 'over' ? `${c.n - c.max} too many` : 'covered';
        return h('span', { class: `app-badge app-badge--${c.status === 'ok' ? 'ok' : c.status === 'short' ? 'bad' : 'warn'}`, title: c.rule.name || '' },
          h('span', { html: icon(c.status === 'ok' ? 'ok' : 'alert') }), txt, h('span', { class: 'sr-only' }, ', ' + say));
      })) : null;
      const rows = on.length ? on.map(({ p, auto, cell }) => row(null, nm(p), gmap.get(p.group)?.name || '',
        auto || (cell.r || []).length ? h('span', { class: 'day-row-chips' },
          auto ? h('span', { class: 'app-badge app-badge--ink', title: 'Placed by auto-fill' }, 'Auto') : null,
          (cell.r || []).map(c => h('span', { class: 'chip rq', style: styleVars(dmap.get(c)) }, c))) : null))
        : [h('div', { class: 'app-row' }, h('span', { class: 'app-row-body' }, h('span', { class: 'app-row-title muted' }, 'Nobody yet')))];
      content.append(group('duty-card', du.name,
        [h('span', { class: 'chip', style: styleVars(du) }, du.code), h('span', { class: 'dc-name' }, du.name), h('span', { class: 'dc-count' }, String(on.length)), badges], rows));
    }

    // away: leave, other and post call
    const awayCodes = (state.duties || []).filter(d => (d.kind === 'leave' || d.kind === 'other') && byCode.has(d.code));
    const unknown = [...byCode.keys()].filter(c => !dmap.has(c));
    if (awayCodes.length || post.length || unknown.length) {
      const total = new Set([...awayCodes.flatMap(d => byCode.get(d.code).map(x => x.p.id)), ...post.map(p => p.id)]).size;
      const rows = awayCodes.map(du => row(lead(h('span', { class: 'chip', style: styleVars(du) }, du.code)), du.name, byCode.get(du.code).map(x => nm(x.p)).join(', ')));
      for (const c of unknown) rows.push(row(lead(h('span', { class: 'chip unk' }, c)), 'Not a code here', byCode.get(c).map(x => nm(x.p)).join(', ')));
      if (post.length) rows.push(row(lead(h('span', { class: 'chip dx' }, 'x')), 'Post call', post.map(nm).join(', ')));
      content.append(group('day-away', 'Away', ['Away', h('span', { class: 'dc-count' }, String(total))], rows));
    }

    // requests
    if (reqs.size) {
      const n = [...reqs.values()].reduce((a, b) => a + b.length, 0);
      content.append(group('day-reqs', 'Requests', ['Requests', h('span', { class: 'dc-count' }, String(n))],
        [...reqs].map(([c, ps]) => { const du = dmap.get(c); return row(lead(h('span', { class: 'chip rq', style: styleVars(du) }, c)), du?.name || c, ps.map(nm).join(', ')); })));
    }

    // notes
    if (notes.length) {
      content.append(group('day-notes', 'Notes', ['Notes', h('span', { class: 'dc-count' }, String(notes.length))],
        notes.map(n => row(null, nm(n.p), n.note))));
    }

    content.append(h('p', { class: 'day-foot' },
      h('button', { type: 'button', class: 'app-btn app-btn--secondary', onclick: () => { app.selectedCell = { date: day, staffId: null }; app.go('roster', { m: app.month }); }, html: `${icon('grid')}<span>See this day on the roster</span>` })));
  }

  render();

  return {
    update(state, info = {}) {
      if (info.month) day = pickDay();
      render();
    },
    route(params) { day = pickDay(params.d); render(); },
  };
}
