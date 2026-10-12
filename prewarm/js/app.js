// Prewarming study: op-day screens. Data stays on this phone for now (localStorage); sharing comes with Firebase.
import { PAGES, SERIES, BY_ID, EXTRA_BY_ID, IX_COLS, SITES, calc, normaliseTemp, isShown } from './schema.js';
import { newRecord, setVal, val, lastEdit, mergeRecord } from './store.js';
import { workbook } from './export.js';
import * as cloud from './cloud.js';

const DEMO = new URLSearchParams(location.search).has('demo');
const NS = DEMO ? 'prewarm-demo:' : 'prewarm:';
const $ = s => document.querySelector(s);
const view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const field = id => BY_ID[id] || EXTRA_BY_ID[id];
const GROUPS = [[1, '30 min pre-warming'], [2, '10 min pre-warming'], [3, 'No pre-warming']];

// Replace the screen. Blurring first lets a half-typed box commit its change before it disappears, and the guard
// stops that change from redrawing again mid-swap.
let painting = false, newer = null;
function paint(html) {
  if (painting) { newer = html; return; } // drawn by the blur's own handler: newer than ours
  painting = true; newer = null;
  try { if (view.contains(document.activeElement)) document.activeElement.blur(); view.innerHTML = newer ?? html; } finally { painting = false; }
}

// ---------- storage
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(NS + k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch { toast('Not saved: this phone’s storage is full or blocked.'); return false; } };
let patients = read('patients', {});
const settings = Object.assign({ me: '', site: '', hide: { skin: false, set: false, ts: false, warm: false, room: false, haemo15: true, bis: false },
  remind: { vibrate: true, beep: true, banner: true, awake: true } }, read('settings', {}));
const saveAll = () => write('patients', patients);
const saveSettings = () => write('settings', settings);
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

if (DEMO && !Object.keys(patients).length) {
  const p = newRecord(Date.now() - 3600e3);
  const now = new Date(), hm = m => { const d = new Date(now.getTime() - m * 60e3); return d.toTimeString().slice(0, 5); };
  setVal(p, 'enrol_id', 'DEMO-01', 'DM'); setVal(p, 'arm', 1, 'DM'); setVal(p, 'pw_gown', hm(30), 'DM'); setVal(p, 'pw_start', hm(22), 'DM');
  [[0, 36.6, 33.0, 32.1, 31.6, 30.9], [5, 36.6, 33.6, 32.6, 31.9, 31.1], [10, 36.7, 34.1, 33.0, 32.2, 31.4], [15, 36.7, 34.5, 33.4, 32.4, 31.6]].forEach(([m, ...t]) => {
    ['core', 'chest', 'arm', 'thigh', 'calf'].forEach((c, i) => setVal(p, `prewarm_${m}_${c}`, String(t[i]), 'DM'));
    setVal(p, `prewarm_${m}_set`, '43', 'DM'); setVal(p, `prewarm_${m}_ts`, m ? 1 : 0, 'DM'); setVal(p, `at_prewarm_${m}`, hm(22 - m), 'DM');
  });
  patients[p.id] = p; saveAll();
}

// ---------- helpers
const nowHM = () => new Date().toTimeString().slice(0, 5);
const toMin = hm => { const m = /^(\d{1,2}):(\d{2})$/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; };
const fromMin = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };
const sid = p => val(p, 'enrol_id') || 'New patient';
function set(p, id, v) { if (setVal(p, id, v, settings.me)) { saveAll(); sync(p, [id]); } }

// ---------- sharing
const shared = { member: null, admin: false, email: '', unwatch: null, stale: false };
const sharing = () => cloud.enabled && (shared.member || shared.admin);
// send changed fields; Firestore keeps them on the phone and sends them when there is signal
function sync(p, ids) {
  if (!sharing()) return;
  p.site ||= val(p, 'site') || shared.member?.site || settings.site;
  if (!p.site) return;
  cloud.push(p, ids).catch(e => toast(cloud.friendly(e)));
}
async function watch() {
  shared.unwatch?.(); shared.unwatch = null;
  if (!sharing()) return;
  shared.unwatch = await cloud.watchPatients(shared.admin ? null : shared.member.site, list => {
    let changed = false;
    for (const r of list) {
      const local = patients[r.id];
      if (!local) { patients[r.id] = { ...r, f: { ...r.f } }; changed = true; continue; }
      const m = mergeRecord(local, r);
      // in place: open screens hold this object
      if (m.changed) { Object.assign(local, m.rec, { site: local.site || r.site }); changed = true; }
    }
    if (!changed) return;
    saveAll();
    const h = location.hash.slice(1) || '/';
    if (/^\/$|^\/p\/\w+$|\/sheet$/.test(h) && !view.contains(document.activeElement)) render();
    else { shared.stale = true; const b = $('#fresh'); if (b) b.hidden = false; }
  }, e => toast(cloud.friendly(e)));
}
function uploadLocal() {
  if (!shared.member) return;
  const key = 'uploaded:' + shared.member.site;
  if (read(key, false)) return;
  for (const p of Object.values(patients)) {
    const site = val(p, 'site') || p.site;
    if (site && site !== shared.member.site) continue;
    if (!site) setVal(p, 'site', shared.member.site, settings.me);
    sync(p, Object.keys(p.f));
  }
  saveAll(); write(key, true);
}
if (cloud.enabled) cloud.onUser(async u => {
  const before = !!(shared.member || shared.admin);
  shared.member = u ? await cloud.member() : null;
  shared.admin = u && !u.isAnonymous ? await cloud.isAdmin() : false;
  shared.email = u?.email || '';
  if (shared.member) { settings.site = shared.member.site; if (!settings.me && shared.member.initials) settings.me = shared.member.initials; saveSettings(); }
  uploadLocal();
  await watch();
  document.body.dataset.cloud = 'ready';
  // redraw only when sharing changed, so a half-typed join code isn't wiped
  if (before !== !!(shared.member || shared.admin) && !view.contains(document.activeElement)) render();
});
let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }

// Which columns of a series are shown (Settings hides some)
function colsFor(s, pt) {
  const h = settings.hide;
  return SERIES[s].cols.filter(c => {
    if (h.skin && ['chest', 'arm', 'thigh', 'calf'].includes(c.key)) return false;
    if (h.set && c.key === 'set') return false;
    if (h.ts && c.key === 'ts') return false;
    if (h.warm && ['under', 'gown'].includes(c.key)) return false;
    if (h.room && c.key === 'room') return false;
    if (h.bis && c.key === 'bis') return false;
    return true;
  });
}
function pointsFor(p, s) {
  const pts = SERIES[s].points;
  if (s === 'haemo' && settings.hide.haemo15) return pts.filter(x => x.key === 'base' || p.f['at_haemo_' + x.key]);
  return pts;
}
// due time (minutes after midnight) of a timepoint, from the reference event
function dueOf(p, s, pt) {
  if (pt.min == null) return null;
  const ref = SERIES[s].ref.map(id => toMin(val(p, id))).find(x => x != null);
  return ref == null ? null : ref + pt.min;
}
const savedAt = (p, s, key) => val(p, `at_${s}_${key}`);
const noWarming = p => String(val(p, 'arm')) === '3';
// gown set temp is NA for the no-pre-warming group and once active warming has stopped
function setTempNA(p, pt) {
  if (noWarming(p)) return true;
  const stop = toMin(val(p, 'ev_wstop')), due = dueOf(p, 'prewarm', pt);
  return stop != null && due != null && due > stop;
}

// ---------- routing
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
let cleanup = [];
function render() {
  cleanup.forEach(f => f()); cleanup = [];
  shared.stale = false; $('#fresh').hidden = true;
  const h = location.hash.slice(1) || '/';
  for (const [re, fn] of routes) { const m = re.exec(h); if (m) { fn(...m.slice(1)); window.scrollTo(0, 0); return; } }
  home();
}
window.addEventListener('hashchange', render);
$('#fresh').onclick = () => render();
function header(title, back, extra = '') {
  $('#title').textContent = title;
  $('#back').hidden = !back; $('#back').onclick = () => go(back);
  $('#extra').innerHTML = extra;
}

// ---------- home
route(/^\/$/, home);
function home() {
  header('Prewarming study' + (DEMO ? ' (demo)' : ''), null, `<a class="iconbtn" href="#/settings" aria-label="Settings">⚙</a>`);
  const list = Object.values(patients).filter(p => !p.deleted).sort((a, b) => (lastEdit(b)?.t || b.created) - (lastEdit(a)?.t || a.created));
  paint(`
    ${settings.me && settings.site ? '' : `<div class="note">Add your ${settings.me ? '' : 'initials and '}hospital in <a href="#/settings">Settings</a>${settings.me ? '' : ' so each reading shows who entered it'}.</div>`}
    <button class="primary big" id="new">+ New patient</button>
    <h2>Patients on this phone</h2>
    ${list.length ? `<ul class="list">${list.map(p => {
      const e = lastEdit(p);
      return `<li><a href="#/p/${p.id}"><b>${esc(sid(p))}${val(p, 'site') ? ` <small>${esc(val(p, 'site'))}</small>` : ''}</b><span>${esc(status(p))}</span>
        <small>${e ? 'Last entry ' + new Date(e.t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (e.by ? ' by ' + esc(e.by) : '') : 'No entries yet'}</small></a></li>`;
    }).join('')}</ul>` : `<p class="muted">No patients yet. Tap <b>New patient</b> on the morning of surgery.</p>`}
    <a class="secondary big" href="#/export">Export Excel</a>
    <p class="muted small">${sharing() ? `Shared with the ${esc(shared.admin ? 'whole study (admin)' : shared.member.site + ' team')}. Readings sync when there is signal.` : `Data stays on this phone. <a href="#/settings">Join your hospital’s team</a> to share patients.`} Study IDs only: no names or hospital numbers.</p>`);
  $('#new').onclick = () => go('#/new');
}
function status(p) {
  if (val(p, 'pacu_in')) return 'PACU';
  if (val(p, 'io_knife') || val(p, 'ev_ot')) return 'In OT';
  if (val(p, 'pw_start') || val(p, 'pw_gown')) return 'Pre-warming';
  return 'Not started';
}

route(/^\/new$/, () => {
  header('New patient', '#/');
  paint(`<form id="f" class="stack">
    <label class="lab" for="sid">Subject ID</label><input id="sid" required autocomplete="off" autocapitalize="characters">
    <span class="lab">Randomisation group</span>
    <div class="seg col">${GROUPS.map(([v, l]) => `<button type="button" class="chip" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="muted small">After this, the group shows only on the pre-warming screen.</p>
    <button class="primary big" type="submit">Start</button></form>`);
  let arm = null;
  view.querySelectorAll('.seg .chip').forEach(b => b.onclick = () => { arm = +b.dataset.v; view.querySelectorAll('.seg .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  $('#f').onsubmit = e => {
    e.preventDefault();
    const id = $('#sid').value.trim();
    if (!id) return toast('Enter the Subject ID.');
    if (!arm) return toast('Choose the randomisation group.');
    if (Object.values(patients).some(p => !p.deleted && String(val(p, 'enrol_id')).toLowerCase() === id.toLowerCase())) return toast('That Subject ID is already on this phone.');
    const p = newRecord(); set(p, 'enrol_id', id); set(p, 'arm', arm); if (settings.site) set(p, 'site', settings.site); patients[p.id] = p; saveAll();
    go('#/p/' + p.id);
  };
});

// ---------- patient hub
const EVENTS = [['pw_gown', 'Gown on'], ['pw_start', 'Active warming started', 'pw'], ['ev_wstop', 'Active warming stopped', 'pw'], ['ev_ot', 'Arrived in OT'],
  ['io_knife', 'Induction (knife to skin)'], ['io_flip', 'Flipped prone'], ['io_under_start', 'Underbody Bair Hugger on'], ['io_gown_start', 'Gown Bair Hugger on'],
  ['io_done', 'Surgery completed (post-extubation)'], ['pacu_in', 'PACU arrival'], ['pacu_out', 'Transfer to ward']];
route(/^\/p\/(\w+)$/, id => {
  const p = patients[id]; if (!p) return go('#/');
  header(sid(p), '#/', `<a class="iconbtn" href="#/p/${id}/sheet" aria-label="Form view">▦</a>`);
  const count = s => pointsFor(p, s).filter(x => savedAt(p, s, x.key)).length;
  const signed = pg => val(p, 'sign_' + pg) ? ' ✓' : '';
  paint(`
    <div class="tiles">
      <a class="tile" href="#/p/${id}/read/prewarm"><b>Pre-warming temps${signed('prewarm')}</b><span>${count('prewarm')} of ${SERIES.prewarm.points.length}</span></a>
      <a class="tile" href="#/p/${id}/read/iotemp"><b>Intra-op temps${signed('iotemp')}</b><span>${count('iotemp')} of ${SERIES.iotemp.points.length}</span></a>
      <a class="tile" href="#/p/${id}/read/haemo"><b>BP, HR, BIS${signed('haemo')}</b><span>${count('haemo')} saved</span></a>
      <a class="tile" href="#/p/${id}/form/intraop"><b>Intra-op details${signed('intraop')}</b><span>Blood, products, tests</span></a>
      <a class="tile" href="#/p/${id}/form/pacu"><b>PACU${signed('pacu')}</b><span>Temp, NuDESC, delay</span></a>
      <a class="tile" href="#/p/${id}/form/satis"><b>Satisfaction${signed('satis')}</b><span>Pre- and post-op comfort</span></a>
    </div>
    <h2>Times</h2>
    <ul class="events">${EVENTS.filter(([, , pw]) => !(pw && noWarming(p))).map(([f, l]) => {
      const v = val(p, f), na = f === 'pw_start' && v === 'NA';
      return `<li><span>${l}</span><input type="time" data-f="${f}" value="${na ? '' : esc(v || '')}" aria-label="${l}">
        <button class="small-btn" data-now="${f}">${v ? 'Redo' : 'Now'}</button></li>`;
    }).join('')}</ul>
    <button class="danger" id="del">Delete this patient</button>`);
  view.querySelectorAll('[data-now]').forEach(b => b.onclick = () => {
    const f = b.dataset.now;
    if (val(p, f) && b.textContent === 'Redo' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again'; return; }
    set(p, f, nowHM()); render();
  });
  view.querySelectorAll('input[type=time]').forEach(i => i.onchange = () => set(p, i.dataset.f, i.value));
  $('#del').onclick = e => {
    if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = 'Tap again to delete ' + sid(p); return; }
    p.deleted = Date.now(); saveAll(); sync(p, []); go('#/');
  };
});

// ---------- reading screen (option B: change what moved)
route(/^\/p\/(\w+)\/read\/(prewarm|iotemp|haemo)(?:\/(\w+))?$/, (id, s, key) => {
  const p = patients[id]; if (!p) return go('#/');
  const def = SERIES[s], pts = pointsFor(p, s);
  const title = { prewarm: 'Pre-warming', iotemp: 'Intra-op temps', haemo: 'BP, HR, BIS' }[s];
  header(sid(p) + ' · ' + title, '#/p/' + id);
  if (s === 'prewarm' && noWarming(p)) {
    paint(`<p class="note">${GROUPS[2][1]}: no pre-warming readings for this patient. The first reading is intra-op baseline.</p>
      <a class="primary big" href="#/p/${id}/read/iotemp">Intra-op temps</a>`);
    return;
  }
  // default timepoint: the unsaved one nearest its due time, else the first unsaved
  if (!key) {
    const open = pts.filter(x => !savedAt(p, s, x.key));
    const now = nowMin();
    const timed = open.filter(x => dueOf(p, s, x) != null).sort((a, b) => Math.abs(dueOf(p, s, a) - now) - Math.abs(dueOf(p, s, b) - now));
    key = (timed[0] || open[0] || pts[pts.length - 1]).key;
  }
  const pt = def.points.find(x => x.key === key) || pts[0];
  const idx = def.points.indexOf(pt);
  const cols = colsFor(s, pt);
  // draft: this timepoint's saved values, else carried over from the last saved timepoint
  const prev = def.points.slice(0, idx).reverse().find(x => savedAt(p, s, x.key));
  const draft = {}, was = {};
  for (const c of cols) {
    const mine = val(p, `${s}_${pt.key}_${c.key}`);
    was[c.key] = prev ? val(p, `${s}_${prev.key}_${c.key}`) : null;
    draft[c.key] = mine ?? was[c.key];
  }
  if (s === 'prewarm' && setTempNA(p, pt)) draft.set = 'NA';
  const isSaved = !!savedAt(p, s, pt.key);

  function strip() {
    const now = nowMin();
    return `<div class="strip" role="list">${pts.map(x => {
      const done = savedAt(p, s, x.key), due = dueOf(p, s, x), missed = !done && due != null && now > due + 5;
      return `<a role="listitem" href="#/p/${id}/read/${s}/${x.key}" class="${x.key === pt.key ? 'on' : ''} ${done ? 'done' : missed ? 'missed' : ''}">${x.key === 'base' ? 'Base' : x.key === 'end' ? 'End' : x.min}</a>`;
    }).join('')}</div>`;
  }
  function card(c) {
    const v = draft[c.key];
    if (c.type === 'code') {
      return `<div class="card wide"><div class="clab">${c.label}${c.key === 'ts' ? ' <small>−3 cold … +3 hot</small>' : ''}</div>
        <div class="seg ${c.opts.length > 2 ? 'seven' : 'two'}">${c.opts.map(([ov, ol]) => `<button class="chip" aria-pressed="${String(v) === String(ov)}" data-c="${c.key}" data-v="${ov}">${c.key === 'ts' ? ol.split(' ')[0] : ol}</button>`).join('')}</div></div>`;
    }
    if (c.key === 'set') {
      return `<div class="card wide"><div class="clab">Gown set temp <small>°C</small></div>
        <div class="seg seven">${['38', '39', '40', '41', '42', '43', 'NA'].map(o => `<button class="chip" aria-pressed="${String(v) === o}" data-c="set" data-v="${o}">${o}</button>`).join('')}</div></div>`;
    }
    const changed = v != null && was[c.key] != null && String(v) !== String(was[c.key]);
    let hint = changed ? 'was ' + was[c.key] : was[c.key] != null ? 'same' : '';
    if (c.key === 'map' && v == null) { const m = calc('map', k => draft[k]); if (m) hint = `<button class="link" data-map="${m}">use ${m}</button>`; }
    return `<div class="card ${changed ? 'changed' : ''}"><div class="clab">${c.label}<small>${hint}</small></div>
      <button class="num" data-type="${c.key}">${v ?? '<span class="muted">tap</span>'}</button>
      <div class="pm"><button class="k" data-step="-1" data-c="${c.key}" aria-label="${c.label} down">−</button><button class="k" data-step="1" data-c="${c.key}" aria-label="${c.label} up">+</button></div></div>`;
  }
  function draw() {
    const due = dueOf(p, s, pt);
    const grp = s === 'prewarm' ? `<span class="badge">${GROUPS.find(g => String(g[0]) === String(val(p, 'arm')))?.[1] || 'Group not set'}</span>` : '';
    paint(`${strip()}
      <div class="tp"><div><b>${pt.label}</b> ${grp}</div><div class="due" id="due">${due != null ? 'due ' + fromMin(Math.round(due)) : pt.key === 'base' ? (s === 'prewarm' ? '' : 'on arrival in OT') : ''}</div></div>
      ${due == null && pt.min != null ? `<p class="note small">Set the “${s === 'prewarm' ? 'Active warming started' : 'Induction'}” time to see when each reading is due.</p>` : ''}
      ${isSaved ? `<p class="muted small">Saved at ${esc(savedAt(p, s, pt.key))}${p.f['at_' + s + '_' + pt.key]?.by ? ' by ' + esc(p.f['at_' + s + '_' + pt.key].by) : ''}. Changes save when you tap Save.</p>` : ''}
      <div class="board">${cols.map(card).join('')}</div>
      <button class="save big" id="save">${isSaved ? 'Save changes' : `Save ${pt.label} reading`}</button>
      ${s === 'haemo' && settings.hide.haemo15 ? `<p class="muted small">Only baseline is entered here; the 15-min rows come from the monitor download. Turn them on in Settings.</p>` : ''}
      ${signoffHtml(p, s)}`);
  }
  draw();
  const step = { core: 0.1, chest: 0.1, arm: 0.1, thigh: 0.1, calf: 0.1, room: 0.5, sbp: 1, dbp: 1, map: 1, hr: 1, bis: 1 };
  const start = { core: 36.5, chest: 34, arm: 33, thigh: 32.5, calf: 31.5, room: 21, sbp: 120, dbp: 70, map: 85, hr: 75, bis: 50 };
  function bump(k, dir) {
    const cur = parseFloat(draft[k]);
    const n = Number.isFinite(cur) ? cur + dir * step[k] : start[k];
    draft[k] = step[k] < 1 ? (Math.round(n * 10) / 10).toFixed(1) : String(Math.round(n));
  }
  let hold;
  const stopHold = () => { clearTimeout(hold); clearInterval(hold); };
  view.onpointerdown = e => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    e.preventDefault();
    const k = b.dataset.c, dir = +b.dataset.step;
    bump(k, dir); draw();
    hold = setTimeout(() => { hold = setInterval(() => { bump(k, dir); draw(); }, 120); }, 450);
  };
  view.onpointerup = view.onpointercancel = view.onpointerleave = stopHold;
  cleanup.push(stopHold, () => { view.onpointerdown = view.onpointerup = view.onpointercancel = view.onpointerleave = view.onclick = null; });
  view.onclick = e => {
    const t = e.target;
    const st = t.closest('[data-step]');
    if (st && e.detail === 0) { bump(st.dataset.c, +st.dataset.step); draw(); return; } // keyboard
    const chip = t.closest('.chip[data-c]');
    if (chip) { draft[chip.dataset.c] = draft[chip.dataset.c] === chip.dataset.v ? null : chip.dataset.v; draw(); return; }
    const m = t.closest('[data-map]');
    if (m) { draft.map = m.dataset.map; draw(); return; }
    const n = t.closest('.num[data-type]');
    if (n) {
      const k = n.dataset.type, c = cols.find(x => x.key === k);
      const inp = document.createElement('input');
      inp.className = 'num'; inp.inputMode = 'decimal'; inp.value = draft[k] ?? ''; inp.setAttribute('aria-label', c.label);
      n.replaceWith(inp); inp.focus(); inp.select();
      let ended = false; // removing the box on redraw fires blur again
      const done = () => { if (ended) return; ended = true; const v = c.temp ? normaliseTemp(inp.value) : inp.value.trim(); draft[k] = v === '' ? null : v; draw(); };
      inp.onblur = done; inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); };
      return;
    }
    if (t.closest('#save')) {
      const bad = cols.filter(c => c.temp && draft[c.key] != null && (+draft[c.key] < 25 || +draft[c.key] > 45 || Number.isNaN(+draft[c.key])));
      if (bad.length) return toast('Check ' + bad.map(c => c.label).join(', ') + ': temperatures should be 25–45 °C.');
      for (const c of cols) setVal(p, `${s}_${pt.key}_${c.key}`, draft[c.key] == null ? null : (c.type === 'code' ? +draft[c.key] : String(draft[c.key])), settings.me);
      if (!isSaved) setVal(p, `at_${s}_${pt.key}`, nowHM(), settings.me);
      saveAll();
      sync(p, [...cols.map(c => `${s}_${pt.key}_${c.key}`), `at_${s}_${pt.key}`]);
      toast(pt.label + ' saved');
      const next = pts.slice(pts.indexOf(pt) + 1).find(x => !savedAt(p, s, x.key));
      go(`#/p/${id}/read/${s}` + (next ? '/' + next.key : '/' + pt.key));
      return;
    }
    signoffClick(p, s, t);
  };
  startAlerts(p, s, () => { const el = $('#due'); if (el) { const d = dueOf(p, s, pt); if (d != null) { const left = d - nowMin(); el.textContent = 'due ' + fromMin(Math.round(d)) + (left > 0 ? ` · in ${Math.floor(left)}:${String(Math.floor((left % 1) * 60)).padStart(2, '0')}` : left > -5 ? ' · now' : ' · late'); } } });
});

// ---------- due alerts (only while the app is open)
function startAlerts(p, s, tick) {
  const alerted = new Set(read('alerted', []));
  let lock = null;
  if (settings.remind.awake && navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => {});
  const iv = setInterval(() => {
    tick();
    const now = nowMin();
    for (const x of pointsFor(p, s)) {
      const d = dueOf(p, s, x), tag = p.id + s + x.key + (val(p, SERIES[s].ref[0]) || '');
      if (d == null || savedAt(p, s, x.key) || alerted.has(tag) || now < d || now > d + 5) continue;
      alerted.add(tag); write('alerted', [...alerted].slice(-200));
      if (settings.remind.banner) { const b = $('#banner'); b.textContent = `${x.label} reading due now`; b.hidden = false; setTimeout(() => { b.hidden = true; }, 15000); }
      if (settings.remind.vibrate && navigator.vibrate) navigator.vibrate([300, 150, 300]);
      if (settings.remind.beep) beep();
    }
  }, 1000);
  tick();
  cleanup.push(() => { clearInterval(iv); lock?.release?.().catch(() => {}); });
}
let actx;
function beep() {
  try {
    actx ||= new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.25);
  } catch { /* sound needs a tap first on some phones */ }
}
document.addEventListener('pointerdown', () => { try { actx ||= new AudioContext(); actx.resume?.(); } catch {} }, { once: true });

// ---------- section sign-off (replaces the paper form's Name / Signature / Date)
function signoffHtml(p, pg) {
  const v = val(p, 'sign_' + pg);
  return `<div class="sign">${v ? `Marked complete: ${esc(v)} <button class="link" data-unsign="${pg}">Undo</button>` : `<button class="secondary" data-sign="${pg}">Mark section complete</button>`}</div>`;
}
function signoffClick(p, pg, t) {
  if (t.closest('[data-sign]')) {
    if (!settings.me) return toast('Add your initials in Settings first.');
    set(p, 'sign_' + pg, `${settings.me} ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} ${nowHM()}`); render();
  } else if (t.closest('[data-unsign]')) { set(p, 'sign_' + pg, null); render(); }
}

// ---------- forms (intra-op details, PACU, satisfaction)
const FORM = {
  intraop: [['io_tech'], ['io_ebl'], ['h', 'Transfusion'], ['tx'], ['io_cs', 'io_cs_vol', 'io_cs_ret'], ['io_pcc', 'io_pcc_dose'],
    ['io_txa', 'io_txa_bolus', 'io_txa_inf', 'io_txa_total'], ['io_fib', 'io_fib_dose'], ['h', 'Intra-op investigations'], ['ix']],
  pacu: [['pacu_temp'], ['pacu_shiver'], ['pacu_ponv'], ['pacu_hypot'], ['pacu_tx'], ['pacu_pain'], ['h', 'NuDESC'],
    ['nd_dis', 'nd_beh', 'nd_com', 'nd_ill', 'nd_psy', 'pacu_nudesc'], ['pacu_delay', 'pacu_delay1h', 'pacu_delay_why']],
  satis: [['sat_pre'], ['sat_post']],
};
route(/^\/p\/(\w+)\/form\/(intraop|pacu|satis)$/, (id, pg) => {
  const p = patients[id]; if (!p) return go('#/');
  header(sid(p) + ' · ' + PAGES.find(x => x.id === pg).title, '#/p/' + id);
  const get = k => val(p, k);
  const draw = () => {
    const y = window.scrollY;
    paint(`<div class="stack">${FORM[pg].map(group => {
      if (group[0] === 'h') return `<h2>${group[1]}</h2>`;
      if (group[0] === 'tx') return txTable(p);
      if (group[0] === 'ix') return ixTable(p);
      return group.map(k => fieldHtml(field(k), get)).join('');
    }).join('')}${signoffHtml(p, pg)}</div>`);
    window.scrollTo(0, y);
  };
  draw();
  view.onclick = e => {
    const b = e.target.closest('.chip[data-f]');
    if (b) { const f = field(b.dataset.f); const v = f.type === 'code' ? +b.dataset.v : b.dataset.v; set(p, f.id, String(get(f.id)) === String(v) ? null : v); recalc(p); draw(); return; }
    const u = e.target.closest('[data-use]');
    if (u) { set(p, u.dataset.use, u.dataset.v); draw(); return; }
    if (e.target.closest('#addix')) { const rows = ixRows(p); rows.push({ time: nowHM() }); set(p, 'io_ix_rows', JSON.stringify(rows)); draw(); return; }
    const rm = e.target.closest('[data-rmix]');
    if (rm) { const rows = ixRows(p); rows.splice(+rm.dataset.rmix, 1); set(p, 'io_ix_rows', rows.length ? JSON.stringify(rows) : null); draw(); return; }
    signoffClick(p, pg, e.target);
  };
  view.onchange = e => {
    const i = e.target;
    if (i.dataset.ix != null) { const rows = ixRows(p); rows[+i.dataset.ix][i.dataset.k] = i.value.trim(); set(p, 'io_ix_rows', JSON.stringify(rows)); return; }
    if (!i.dataset.f) return;
    const f = field(i.dataset.f);
    set(p, f.id, f.temp ? normaliseTemp(i.value) : i.value.trim());
    // redraw only when other fields depend on this one, so the next box keeps focus
    if (REDRAW.has(f.id)) { recalc(p); draw(); }
  };
  cleanup.push(() => { view.onclick = view.onchange = null; });
});
const REDRAW = new Set(['io_txa_bolus', 'io_txa_inf', ...Object.values(BY_ID).filter(f => f.show).map(f => f.show.f)]);
// totals worked out from other fields fill in when empty or when they still hold the old worked-out value
function recalc(p) {
  for (const [id, kind] of [['io_txa_total', 'txa'], ['pacu_nudesc', 'nudesc']]) {
    const c = calc(kind, k => val(p, k));
    if (c != null && (val(p, id) == null || p.f[id]?.auto)) { setVal(p, id, String(c), settings.me); p.f[id].auto = true; saveAll(); sync(p, [id]); }
  }
}
function fieldHtml(f, get) {
  if (!f || !isShown(f, get)) return '';
  const v = get(f.id), idA = 'f-' + f.id;
  const hint = f.hint ? `<small class="muted">${esc(f.hint)}</small>` : '';
  if (f.type === 'code' || f.type === 'word') {
    const opts = f.type === 'word' ? f.opts.map(o => [o, f.id === 'io_tech' ? 'GA (' + o + ')' : o]) : f.opts;
    return `<div class="fld"><span class="lab">${esc(f.label)}</span>${hint}<div class="seg ${opts.length > 4 ? 'many' : ''}">${opts.map(([ov, ol]) =>
      `<button class="chip" data-f="${f.id}" data-v="${ov}" aria-pressed="${String(v) === String(ov)}">${esc(ol)}</button>`).join('')}</div></div>`;
  }
  const mode = f.type === 'text' ? 'text' : f.type === 'int' ? 'numeric' : 'decimal';
  return `<div class="fld"><label class="lab" for="${idA}">${esc(f.label)}${f.unit ? ` <small>${esc(f.unit)}</small>` : ''}</label>${hint}
    <input id="${idA}" data-f="${f.id}" inputmode="${mode}" value="${esc(v ?? '')}" autocomplete="off"></div>`;
}
function txTable(p) {
  const rows = [['rbc', 'RBC'], ['plt', 'Platelets'], ['ffp', 'FFP'], ['cryo', 'Cryo']];
  return `<table class="grid"><thead><tr><th></th><th>Units</th><th>Volume (mL)</th></tr></thead><tbody>${rows.map(([k, l]) =>
    `<tr><th>${l}</th><td><input data-f="io_${k}" inputmode="decimal" value="${esc(val(p, 'io_' + k) ?? '')}" aria-label="${l} units"></td>
    <td><input data-f="io_${k}_ml" inputmode="numeric" value="${esc(val(p, 'io_' + k + '_ml') ?? '')}" aria-label="${l} volume"></td></tr>`).join('')}</tbody></table>`;
}
function ixRows(p) { try { return JSON.parse(val(p, 'io_ix_rows')) || []; } catch { return []; } }
function ixTable(p) {
  const rows = ixRows(p);
  return `${rows.map((r, i) => `<div class="ixrow">${IX_COLS.map(([k, l]) => `<label><span>${l}</span><input data-ix="${i}" data-k="${k}" ${k === 'time' ? 'type="time"' : k === 'test' ? '' : 'inputmode="decimal"'} value="${esc(r[k] ?? '')}"></label>`).join('')}
    <button class="link" data-rmix="${i}">Remove</button></div>`).join('')}
    <button class="secondary" id="addix">+ Add a result</button>
    <p class="muted small">Only Hct available? Enter Hb as Hct ÷ 3.</p>`;
}

// ---------- form view: readings laid out like the paper form
route(/^\/p\/(\w+)\/sheet$/, id => {
  const p = patients[id]; if (!p) return go('#/');
  header(sid(p) + ' · Form view', '#/p/' + id);
  const cell = (s, pt, c) => { const v = val(p, `${s}_${pt.key}_${c.key}`); return `<td><a href="#/p/${id}/read/${s}/${pt.key}" aria-label="${esc(pt.label + ' ' + c.label + ': ' + (v ?? 'empty'))}">${v == null ? '' : esc(c.key === 'ts' && v > 0 ? '+' + v : v)}</a></td>`; };
  const pw = SERIES.prewarm, it = SERIES.iotemp, hd = SERIES.haemo;
  paint(`
    ${noWarming(p) ? '' : `<h2>Pre-warming, every 5 minutes</h2><div class="scroll"><table class="grid sheet"><thead><tr><th>Time (min)</th>${pw.points.map(x => `<th>${x.min}</th>`).join('')}</tr></thead><tbody>
      <tr><th>Time</th>${pw.points.map(x => `<td>${esc(savedAt(p, 'prewarm', x.key) || '')}</td>`).join('')}</tr>
      ${pw.cols.map(c => `<tr><th>${c.label}</th>${pw.points.map(x => cell('prewarm', x, c)).join('')}</tr>`).join('')}</tbody></table></div>`}
    <h2>Intra-op temperature</h2><div class="scroll"><table class="grid sheet"><thead><tr><th>From induction</th>${it.cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>
      ${it.points.map(x => `<tr><th>${x.key === 'base' ? 'Baseline' : x.key === 'end' ? 'End' : x.min}</th>${it.cols.map(c => cell('iotemp', x, c)).join('')}</tr>`).join('')}</tbody></table></div>
    <h2>Haemodynamics</h2><div class="scroll"><table class="grid sheet"><thead><tr><th>From induction</th>${hd.cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>
      ${hd.points.map(x => `<tr><th>${x.key === 'base' ? 'Baseline' : x.key === 'end' ? 'End' : x.min}</th>${hd.cols.map(c => cell('haemo', x, c)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted small">Tap a cell to change that reading.</p>`);
});

// ---------- settings
route(/^\/settings$/, () => {
  header('Settings', '#/');
  const tog = (grp, k, l, d = '') => `<label class="tog"><input type="checkbox" data-g="${grp}" data-k="${k}" ${grp === 'hide' ? (settings.hide[k] ? '' : 'checked') : settings[grp][k] ? 'checked' : ''}><span>${l}${d ? `<small>${d}</small>` : ''}</span></label>`;
  paint(`<div class="stack">
    <label class="lab" for="me">Your initials</label><input id="me" value="${esc(settings.me)}" maxlength="6" autocapitalize="characters" autocomplete="off">
    <small class="muted">Saved with each reading as “entered by”.</small>
    <h2>Hospital and sharing</h2>
    ${sharingHtml()}
    <h2>Readings to enter live</h2>
    <p class="muted small">Untick what you’ll fill in later from the Fortuna monitor or Epic. Core temperature is always on.</p>
    ${tog('hide', 'skin', 'Skin temps: chest, arm, thigh, calf')}${tog('hide', 'set', 'Gown set temp (pre-warming)')}${tog('hide', 'ts', 'Thermal sensation (pre-warming)')}
    ${tog('hide', 'warm', 'Underbody / gown warming on or off')}${tog('hide', 'room', 'Room temp')}
    ${tog('hide', 'haemo15', 'BP, HR and BIS every 15 min', 'Off: baseline only')}${tog('hide', 'bis', 'BIS')}
    <h2>When a reading is due</h2>
    <p class="muted small">Works while the app is open on screen.</p>
    ${tog('remind', 'banner', 'Banner')}${tog('remind', 'vibrate', 'Vibrate', 'Android only')}${tog('remind', 'beep', 'Short beep')}${tog('remind', 'awake', 'Keep the screen on during readings')}
    <button class="secondary" id="test">Test the alert</button></div>`);
  view.querySelectorAll('[data-site]').forEach(b => b.onclick = () => { if (shared.member) return; settings.site = settings.site === b.dataset.site ? '' : b.dataset.site; saveSettings(); render(); });
  $('#me').onchange = e => { settings.me = e.target.value.trim().toUpperCase(); saveSettings(); if (shared.member) cloud.setInitials(settings.me).catch(() => {}); toast('Saved'); };
  $('#join')?.addEventListener('click', async e => {
    const code = $('#code').value.trim();
    if (!settings.site) return toast('Choose your hospital first.');
    if (!code) return toast('Enter the join code for ' + settings.site + '.');
    e.target.disabled = true; e.target.textContent = 'Joining…';
    try { await cloud.join(settings.site, code, settings.me); shared.member = await cloud.member(); uploadLocal(); await watch(); toast('Joined the ' + settings.site + ' team'); }
    catch (err) { shared.member = null; toast(err?.code === 'permission-denied' ? 'That code isn’t right for ' + settings.site + '. Ask a study admin.' : cloud.friendly(err)); }
    render();
  });
  $('#leave')?.addEventListener('click', async e => {
    if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = 'Tap again to stop sharing on this phone'; return; }
    shared.unwatch?.(); shared.member = null; shared.admin = false;
    try { await cloud.leave(); } catch { /* signed out anyway */ }
    render();
  });
  $('#adminin')?.addEventListener('click', async () => {
    try { await cloud.adminSignIn(); shared.admin = await cloud.isAdmin(); if (!shared.admin) { toast('This Google account isn’t a study admin.'); await cloud.leave(); } else { await watch(); go('#/admin'); } }
    catch (err) { toast(cloud.friendly(err)); }
  });
  view.onchange = e => {
    const i = e.target; if (!i.dataset.g) return;
    if (i.dataset.g === 'hide') settings.hide[i.dataset.k] = !i.checked; else settings.remind[i.dataset.k] = i.checked;
    saveSettings();
  };
  $('#test').onclick = () => {
    if (settings.remind.banner) { const b = $('#banner'); b.textContent = 'Test: reading due now'; b.hidden = false; setTimeout(() => { b.hidden = true; }, 4000); }
    if (settings.remind.vibrate && navigator.vibrate) navigator.vibrate([300, 150, 300]);
    if (settings.remind.beep) beep();
  };
  cleanup.push(() => { view.onchange = null; });
});

function sharingHtml() {
  const chips = `<div class="seg">${SITES.map(x => `<button type="button" class="chip" data-site="${x}" aria-pressed="${settings.site === x}" ${shared.member ? 'disabled' : ''}>${x}</button>`).join('')}</div>`;
  if (!cloud.enabled) return `${chips}<small class="muted">New patients on this phone are recorded at this hospital. Sharing is off in demo mode.</small>`;
  if (shared.admin) return `<p class="ok-box">Signed in as study admin (${esc(shared.email)}). You see every hospital’s patients.</p>
    <a class="secondary" href="#/admin">Join codes and members</a><button class="secondary" id="leave">Sign out</button>`;
  if (shared.member) return `${chips}<p class="ok-box">Sharing with the ${esc(shared.member.site)} team. Readings sync when there is signal.</p><button class="secondary" id="leave">Stop sharing on this phone</button>`;
  return `${chips}<label class="lab" for="code">Join code for your hospital</label><input id="code" autocomplete="off" autocapitalize="characters">
    <small class="muted">From a study admin. Joining shares this phone’s patients with your hospital’s team.</small>
    <button class="primary" id="join">Join</button>
    <button class="link" id="adminin">Study admin? Sign in with Google</button>`;
}

// ---------- admin: join codes and members
route(/^\/admin$/, async () => {
  header('Study admin', '#/settings');
  if (!shared.admin) { paint(`<p class="note">Sign in as a study admin from Settings.</p>`); return; }
  paint(`<p class="muted">Loading…</p>`);
  let codes = {}, people = [];
  try { [codes, people] = await Promise.all([cloud.codes(), cloud.members()]); } catch (e) { paint(`<p class="note">${esc(cloud.friendly(e))}</p>`); return; }
  paint(`<div class="stack">
    <p class="muted small">Give each hospital’s team its code. A new code stops new phones joining with the old one; phones already in stay in.</p>
    ${SITES.map(x => {
      const who = people.filter(m => m.site === x);
      return `<div class="fld"><b>${x}</b>
        <div class="coderow"><span class="mono">${codes[x] ? esc(codes[x].code) : '<span class="muted">no code yet</span>'}</span><button class="secondary" data-newcode="${x}">${codes[x] ? 'New code' : 'Make code'}</button></div>
        ${who.length ? `<ul class="plain">${who.map(m => `<li>${esc(m.initials || '—')} <small class="muted">joined ${new Date(m.joinedAt).toLocaleDateString()}</small> <button class="link" data-rm="${m.uid}">Remove</button></li>`).join('')}</ul>` : '<small class="muted">No phones yet</small>'}</div>`;
    }).join('')}</div>`);
  view.onclick = async e => {
    const nc = e.target.closest('[data-newcode]');
    if (nc) {
      const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', b = crypto.getRandomValues(new Uint8Array(8));
      const code = nc.dataset.newcode + '-' + Array.from(b, x => abc[x % abc.length]).join('');
      try { await cloud.setCode(nc.dataset.newcode, code); render(); } catch (err) { toast(cloud.friendly(err)); }
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      if (!rm.dataset.sure) { rm.dataset.sure = 1; rm.textContent = 'Tap again to remove'; return; }
      try { await cloud.removeMember(rm.dataset.rm); render(); } catch (err) { toast(cloud.friendly(err)); }
    }
  };
  cleanup.push(() => { view.onclick = null; });
});

// ---------- export
route(/^\/export$/, () => {
  header('Export', '#/');
  const n = Object.values(patients).filter(p => !p.deleted).length;
  paint(`<div class="stack">
    <p>An Excel file in the study template’s layout: one row per patient, the template’s 572 columns, op-day columns filled and the rest blank, so rows paste into the master sheet.</p>
    <ul class="muted small"><li><b>Data Collection</b>: the template sheet</li><li><b>Readings</b>: every reading with the time it was saved and who saved it</li>
    <li><b>Extra</b>: items the template has no column for (transfusion volumes, investigation rows, PACU transfusion, NuDESC items, sign-offs)</li></ul>
    <button class="primary big" id="xl" ${n ? '' : 'disabled'}>Export ${n} patient${n === 1 ? '' : 's'}</button></div>`);
  $('#xl').onclick = async () => {
    const live = Object.values(patients);
    const bytes = workbook(live, []);
    const name = `prewarming-study-${new Date().toISOString().slice(0, 10)}${DEMO ? '-demo' : ''}.xlsx`;
    const file = new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
});

// ---------- offline shell and updates
if ('serviceWorker' in navigator && !DEMO) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => { const b = $('#update'); b.hidden = false; b.onclick = () => w.postMessage('skipWaiting'); };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

render();
