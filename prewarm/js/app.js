// Prewarming study: op-day screens. Data stays on this phone for now (localStorage); sharing comes with Firebase.
import { PAGES, SERIES, BY_ID, EXTRA_BY_ID, IX_COLS, SITES, calc, normaliseTemp, isShown } from './schema.js';
import { newRecord, setVal, val, lastEdit, mergeRecord } from './store.js';
import { workbook } from './export.js';
import * as cloud from './cloud.js';
import { qrcode } from './vendor/qrcode.js';

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
  patients[p.id] = p;
  // a second patient already in OT, induction 50 min ago
  const q = newRecord(Date.now() - 7200e3);
  setVal(q, 'enrol_id', 'DEMO-02', 'DM'); setVal(q, 'arm', 2, 'DM'); setVal(q, 'pw_gown', hm(95), 'DM'); setVal(q, 'pw_start', hm(90), 'DM'); setVal(q, 'ev_wstop', hm(80), 'DM');
  setVal(q, 'ev_ot', hm(65), 'DM'); setVal(q, 'io_knife', hm(50), 'DM'); setVal(q, 'io_flip', hm(42), 'DM'); setVal(q, 'io_under_start', hm(40), 'DM');
  [['base', 36.4], [0, 36.3], [5, 36.2], [10, 36.1], [15, 36.0], [20, 35.9], [25, 35.9], [30, 35.8], [35, 35.8], [40, 35.9], [45, 35.9]].forEach(([m, core], i) => {
    setVal(q, `iotemp_${m}_core`, core.toFixed(1), 'DM');
    ['chest', 'arm', 'thigh', 'calf'].forEach((c, j) => setVal(q, `iotemp_${m}_${c}`, (34.2 - j * 0.6 - i * 0.05).toFixed(1), 'DM'));
    setVal(q, `iotemp_${m}_under`, m === 'base' || m < 10 ? 0 : 1, 'DM'); setVal(q, `iotemp_${m}_gown`, 0, 'DM'); setVal(q, `iotemp_${m}_room`, '21.0', 'DM');
    setVal(q, `at_iotemp_${m}`, m === 'base' ? hm(55) : hm(50 - m), 'DM');
  });
  setVal(q, 'haemo_base_sbp', '132', 'DM'); setVal(q, 'haemo_base_dbp', '78', 'DM'); setVal(q, 'haemo_base_map', '96', 'DM'); setVal(q, 'haemo_base_hr', '72', 'DM'); setVal(q, 'at_haemo_base', hm(55), 'DM');
  patients[q.id] = q;
  saveAll();
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
// opened from an admin's emailed sign-in link
async function finishAdmin(email) {
  if (!email) return toast('Enter the email the link was sent to.');
  try { await cloud.finishAdminLink(email); toast('Signed in'); }
  catch (err) { toast(cloud.friendly(err)); go('#/settings'); }
}
if (cloud.enabled && cloud.isAdminLink()) {
  const email = cloud.savedAdminEmail();
  if (email) finishAdmin(email);
  else location.hash = '#/confirm';
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
$('#banner').onclick = () => { $('#banner').hidden = true; };
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

// ---------- patient main screen: event times, temperatures, then links to the other forms in the order they are
// filled in. BP/HR/BIS uses the same reading screen without the times.
const EVENTS = [['pw_gown', 'Gown on'], ['pw_start', 'Warming on', 'pw'], ['ev_wstop', 'Warming off', 'pw'], ['ev_ot', 'In OT'],
  ['io_knife', 'Induction'], ['io_flip', 'Prone'], ['io_under_start', 'Underbody'], ['io_gown_start', 'Gown BH'],
  ['io_done', 'Surgery end'], ['pacu_in', 'PACU arrival'], ['pacu_out', 'To ward']];
const EVENT_FULL = { io_flip: 'Flipped prone', pw_start: 'Active warming started', ev_wstop: 'Active warming stopped', io_knife: 'Induction (knife to skin)', io_under_start: 'Underbody Bair Hugger on',
  io_gown_start: 'Gown Bair Hugger on', io_done: 'Surgery completed (post-extubation)', pacu_out: 'Transfer to ward' };
const defaultSeries = p => noWarming(p) || val(p, 'ev_ot') || val(p, 'io_knife') ? 'iotemp' : 'prewarm';
route(/^\/p\/(\w+)(?:\/(?:read\/)?(prewarm|iotemp|haemo)(?:\/(\w+))?)?$/, (id, s, key) => {
  const p = patients[id]; if (!p) return go('#/');
  if (!s || (s === 'prewarm' && noWarming(p))) s = defaultSeries(p);
  const main = s !== 'haemo';
  const def = SERIES[s], pts = pointsFor(p, s);
  header(main ? sid(p) : sid(p) + ' · BP, HR, BIS', main ? '#/' : '#/p/' + id, `<a class="iconbtn" href="#/p/${id}/sheet" aria-label="Form view">▦</a>`);
  let editing = null; // event whose time is being changed
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
  let setTouched = false; // gown set temp follows "warming off" until someone picks a value
  const isSaved = !!savedAt(p, s, pt.key);

  function strip() {
    const now = nowMin();
    return `<div class="strip" role="list">${pts.map(x => {
      const done = savedAt(p, s, x.key), due = dueOf(p, s, x), missed = !done && due != null && now > due + 5;
      return `<a role="listitem" href="#/p/${id}/${s}/${x.key}" class="${x.key === pt.key ? 'on' : ''} ${done ? 'done' : missed ? 'missed' : ''}">${x.key === 'base' ? 'Base' : x.key === 'end' ? 'End' : x.min}</a>`;
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
  function timesHtml() {
    return `<div class="times">${EVENTS.filter(([, , pw]) => !(pw && noWarming(p))).map(([f, l]) => {
      const v = val(p, f), full = EVENT_FULL[f] || l;
      if (editing === f) return `<div class="tchip edit"><span>${l}</span><input type="time" id="evtime" value="${v === 'NA' ? '' : esc(v || '')}" aria-label="${full}"><button class="link" data-evclear="${f}">Clear</button></div>`;
      return `<button class="tchip ${v ? 'set' : ''}" data-ev="${f}" aria-label="${full}: ${v ? v + ', tap to change' : 'tap to set now'}"><span>${l}</span><b>${v ? esc(v) : 'tap'}</b></button>`;
    }).join('')}</div>`;
  }
  function linksHtml() {
    const done = pg => val(p, 'sign_' + pg) ? ' ✓' : '';
    const haemo = pointsFor(p, 'haemo').filter(x => savedAt(p, 'haemo', x.key)).length;
    return `<nav class="links" aria-label="Other forms">
      <a href="#/p/${id}/haemo">BP, HR, BIS${done('haemo')}<small>${haemo ? haemo + ' saved' : 'Baseline in OT'}</small></a>
      <a href="#/p/${id}/form/intraop">Intra-op details${done('intraop')}<small>Blood, products, tests</small></a>
      <a href="#/p/${id}/form/pacu">PACU${done('pacu')}<small>Temp, NuDESC, delay</small></a>
      <a href="#/p/${id}/form/satis">Satisfaction${done('satis')}<small>Pre- and post-op comfort</small></a>
      <a href="#/p/${id}/sheet">Form view<small>All readings like the paper form</small></a></nav>
      <button class="danger" id="del">Delete this patient</button>`;
  }
  function tabsHtml() {
    if (noWarming(p)) return `<h2 class="sect">Intra-op temperatures</h2>`;
    return `<div class="tabs2" role="tablist">${['prewarm', 'iotemp'].map(x => `<a role="tab" aria-selected="${x === s}" href="#/p/${id}/${x}">${x === 'prewarm' ? 'Pre-warming' : 'Intra-op'}</a>`).join('')}</div>`;
  }
  function draw() {
    if (s === 'prewarm' && !setTouched && cols.some(c => c.key === 'set') && setTempNA(p, pt)) draft.set = 'NA';
    const due = dueOf(p, s, pt);
    const grp = s === 'prewarm' ? `<span class="badge">${GROUPS.find(g => String(g[0]) === String(val(p, 'arm')))?.[1] || 'Group not set'}</span>` : '';
    paint(`${main ? timesHtml() + tabsHtml() : ''}${strip()}
      <div class="tp"><div><b>${pt.label}</b> ${grp}</div><div class="due" id="due">${due != null ? 'due ' + fromMin(Math.round(due)) : pt.key === 'base' ? (s === 'prewarm' ? '' : 'on arrival in OT') : ''}</div></div>
      ${due == null && pt.min != null ? `<p class="note small">Set the “${s === 'prewarm' ? 'Active warming started' : 'Induction'}” time to see when each reading is due.</p>` : ''}
      ${isSaved ? `<p class="muted small">Saved at ${esc(savedAt(p, s, pt.key))}${p.f['at_' + s + '_' + pt.key]?.by ? ' by ' + esc(p.f['at_' + s + '_' + pt.key].by) : ''}. Changes save when you tap Save.</p>` : ''}
      <div class="board">${cols.map(card).join('')}</div>
      <button class="save big" id="save">${isSaved ? 'Save changes' : `Save ${pt.label} reading`}</button>
      ${s === 'haemo' && settings.hide.haemo15 ? `<p class="muted small">Only baseline is entered here; the 15-min rows come from the monitor download. Turn them on in Settings.</p>` : ''}
      ${signoffHtml(p, s)}${main ? linksHtml() : ''}`);
    if (editing) { const i = $('#evtime'); i?.focus(); }
    const st = view.querySelector('.strip'), on = st?.querySelector('.on');
    if (on) st.scrollLeft = on.offsetLeft - st.offsetLeft - (st.clientWidth - on.offsetWidth) / 2;
  }
  draw();
  const step = { core: 0.1, chest: 0.1, arm: 0.1, thigh: 0.1, calf: 0.1, room: 0.5, sbp: 1, dbp: 1, map: 1, hr: 1, bis: 1 };
  const start = { core: 36.5, chest: 36.5, arm: 36.5, thigh: 36.5, calf: 36.5, room: 21, sbp: 120, dbp: 70, map: 85, hr: 75, bis: 50 };
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
    if (chip) { if (chip.dataset.c === 'set') setTouched = true; draft[chip.dataset.c] = draft[chip.dataset.c] === chip.dataset.v ? null : chip.dataset.v; draw(); return; }
    const m = t.closest('[data-map]');
    if (m) { draft.map = m.dataset.map; draw(); return; }
    const ev = t.closest('[data-ev]');
    if (ev) {
      // tap an empty time: now; tap a set one: change it
      if (!val(p, ev.dataset.ev)) set(p, ev.dataset.ev, nowHM()); else editing = ev.dataset.ev;
      draw(); return;
    }
    const clr = t.closest('[data-evclear]');
    if (clr) { set(p, clr.dataset.evclear, null); editing = null; draw(); return; }
    if (t.closest('#del')) {
      if (!t.dataset.sure) { t.dataset.sure = 1; t.textContent = 'Tap again to delete ' + sid(p); return; }
      p.deleted = Date.now(); saveAll(); sync(p, []); go('#/'); return;
    }
    const n = t.closest('.num[data-type]');
    if (n) {
      const k = n.dataset.type, c = cols.find(x => x.key === k);
      // an empty temperature starts at 36.5; tap again to type
      if (c.temp && draft[k] == null) { draft[k] = '36.5'; draw(); return; }
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
      go(`#/p/${id}/${s}/` + (next ? next.key : pt.key));
      return;
    }
    signoffClick(p, s, t);
  };
  view.onchange = e => {
    if (e.target.id !== 'evtime' || !editing) return;
    set(p, editing, e.target.value || null); editing = null; draw();
  };
  view.onfocusout = e => { if (e.target.id === 'evtime') setTimeout(() => { if (editing && !view.contains(document.activeElement)) { editing = null; draw(); } }, 0); };
  cleanup.push(() => { view.onchange = view.onfocusout = null; });
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
      if (settings.remind.banner) { const b = $('#banner'); b.textContent = `${x.label} reading due now (tap to hide)`; b.hidden = false; setTimeout(() => { b.hidden = true; }, 15000); }
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
  const cell = (s, pt, c) => { const v = val(p, `${s}_${pt.key}_${c.key}`); return `<td><a href="#/p/${id}/${s}/${pt.key}" aria-label="${esc(pt.label + ' ' + c.label + ': ' + (v ?? 'empty'))}">${v == null ? '' : esc(c.key === 'ts' && v > 0 ? '+' + v : v)}</a></td>`; };
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
    await joinTeam(settings.site, code, e.target);
    render();
  });
  $('#leave')?.addEventListener('click', async e => {
    if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = 'Tap again to stop sharing on this phone'; return; }
    shared.unwatch?.(); shared.member = null; shared.admin = false;
    try { await cloud.leave(); } catch { /* signed out anyway */ }
    render();
  });
  $('#adminin')?.addEventListener('click', () => { $('#adminbox').hidden = false; $('#adminemail').focus(); });
  $('#adminsend')?.addEventListener('click', async e => {
    const email = $('#adminemail').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Enter your email address.');
    e.target.disabled = true;
    try { await cloud.sendAdminLink(email); $('#adminbox').innerHTML = `<p class="ok-box">Sign-in link sent to ${esc(email)}. Open it on this phone, in this browser.</p>`; }
    catch (err) { e.target.disabled = false; toast(cloud.friendly(err)); }
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
  if (shared.email && !shared.admin) return `<p class="note">${esc(shared.email)} isn’t on the study’s admin list. Ask the owner to add it.</p><button class="secondary" id="leave">Sign out</button>`;
  if (shared.admin) return `<p class="ok-box">Signed in as study admin (${esc(shared.email)}). You see every hospital’s patients.</p>
    <a class="secondary" href="#/admin">Join codes and members</a><button class="secondary" id="leave">Sign out</button>`;
  if (shared.member) return `${chips}<p class="ok-box">Sharing with the ${esc(shared.member.site)} team. Readings sync when there is signal.</p><button class="secondary" id="leave">Stop sharing on this phone</button>`;
  return `${chips}<label class="lab" for="code">Join code for your hospital</label><input id="code" autocomplete="off" autocapitalize="characters">
    <small class="muted">From a study admin. Joining shares this phone’s patients with your hospital’s team.</small>
    <button class="primary" id="join">Join</button>
    <button class="link" id="adminin">Study admin? Sign in by email</button>
    <div id="adminbox" class="stack" hidden><label class="lab" for="adminemail">Your admin email</label>
      <input id="adminemail" type="email" autocomplete="email" inputmode="email">
      <button class="secondary" id="adminsend">Email me a sign-in link</button></div>`;
}

// an admin's sign-in link opened in another browser: ask for the email again
route(/^\/confirm$/, () => {
  header('Finish signing in', '#/');
  if (!cloud.isAdminLink()) return go('#/settings');
  paint(`<div class="stack"><p>This sign-in link was opened in a different browser from the one that asked for it. Type the email it was sent to.</p>
    <label class="lab" for="adminconfirm">Email</label><input id="adminconfirm" type="email" autocomplete="email">
    <button class="primary" id="adminfinish">Sign in</button></div>`);
  $('#adminfinish').onclick = () => finishAdmin($('#adminconfirm').value.trim().toLowerCase());
});

async function joinTeam(site, code, btn) {
  btn.disabled = true; btn.textContent = 'Joining…';
  try {
    await cloud.join(site, code, settings.me);
    shared.member = await cloud.member();
    settings.site = site; saveSettings();
    uploadLocal(); await watch();
    toast('Joined the ' + site + ' team');
    return true;
  } catch (err) {
    shared.member = null;
    toast(err?.code === 'permission-denied' ? 'That code isn’t right for ' + site + '. Ask a study admin.' : cloud.friendly(err));
    return false;
  }
}

// ---------- join link: #/join/{site}/{code} (after the #, so the code never reaches a server)
const joinLink = (site, code) => location.origin + location.pathname + (/emulator/.test(location.search) ? '?emulator' : '') + `#/join/${site}/${encodeURIComponent(code)}`;
route(/^\/join\/([A-Z]+)\/([^/]+)$/, (site, enc) => {
  const code = decodeURIComponent(enc);
  // the code shouldn't stay in the history or a bookmark
  const forget = () => history.replaceState(null, '', location.pathname + location.search + '#/');
  header('Join the ' + site + ' team', '#/');
  if (!SITES.includes(site) || !cloud.enabled) { forget(); paint(`<p class="note">This join link doesn’t work${cloud.enabled ? '' : ' in demo mode'}.</p>`); return; }
  if (shared.member?.site === site) { forget(); paint(`<p class="ok-box">This phone is already in the ${site} team.</p><a class="primary big" href="#/">Patients</a>`); return; }
  paint(`<div class="stack">
    <p>Join the <b>${site}</b> prewarming study team on this phone. You’ll see and enter ${site}’s patients, and they sync when there is signal.</p>
    ${shared.member ? `<p class="note">This phone is in the ${esc(shared.member.site)} team now; joining moves it to ${site}.</p>` : ''}
    <label class="lab" for="me">Your initials</label><input id="me" value="${esc(settings.me)}" maxlength="6" autocapitalize="characters" autocomplete="off">
    <small class="muted">Saved with each reading as “entered by”.</small>
    <button class="primary big" id="joinlink">Join ${site}</button></div>`);
  $('#joinlink').onclick = async e => {
    settings.me = $('#me').value.trim().toUpperCase(); saveSettings();
    if (!settings.me) return toast('Add your initials first.');
    if (shared.member) { shared.unwatch?.(); try { await cloud.leave(); } catch { /* out anyway */ } shared.member = null; }
    if (await joinTeam(site, code, e.target)) { forget(); render(); }
    else { e.target.disabled = false; e.target.textContent = 'Join ' + site; }
  };
});

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text); qr.make();
  const n = qr.getModuleCount(), q = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q},${r + q}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges" role="img" aria-label="QR code of the join link"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// ---------- admin: join codes and members
route(/^\/admin$/, async () => {
  header('Study admin', '#/settings');
  if (!shared.admin) { paint(`<p class="note">Sign in as a study admin from Settings.</p>`); return; }
  paint(`<p class="muted">Loading…</p>`);
  let codes = {}, people = [];
  try { [codes, people] = await Promise.all([cloud.codes(), cloud.members()]); } catch (e) { paint(`<p class="note">${esc(cloud.friendly(e))}</p>`); return; }
  paint(`<div class="stack">
    <p class="muted small">Send each hospital’s team its join link (or show the QR code): it opens the app ready to join, no typing. Share it only with that team. A new code makes old links stop working for new phones; phones already in stay in.</p>
    ${SITES.map(x => {
      const who = people.filter(m => m.site === x);
      return `<div class="fld"><b>${x}</b>
        <div class="coderow"><span class="mono">${codes[x] ? esc(codes[x].code) : '<span class="muted">no code yet</span>'}</span><button class="secondary" data-newcode="${x}">${codes[x] ? 'New code' : 'Make code'}</button></div>
        ${codes[x] ? `<div class="sharerow"><button class="primary" data-share="${x}">Share join link</button><button class="secondary" data-qr="${x}">QR code</button></div><div class="qr" id="qr-${x}" hidden></div>` : ''}
        ${who.length ? `<ul class="plain">${who.map(m => `<li>${esc(m.initials || '—')} <small class="muted">joined ${new Date(m.joinedAt).toLocaleDateString()}</small> <button class="link" data-rm="${m.uid}">Remove</button></li>`).join('')}</ul>` : '<small class="muted">No phones yet</small>'}</div>`;
    }).join('')}</div>`);
  view.onclick = async e => {
    const sh = e.target.closest('[data-share]');
    if (sh) {
      const x = sh.dataset.share, url = joinLink(x, codes[x].code);
      const text = `Prewarming study: tap to join the ${x} team on your phone`;
      try { if (navigator.share) { await navigator.share({ title: 'Join the ' + x + ' team', text, url }); return; } } catch (err) { if (err?.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(url); toast('Join link copied: paste it into a message'); }
      catch { prompt('Copy this join link', url); }
      return;
    }
    const qb = e.target.closest('[data-qr]');
    if (qb) {
      const x = qb.dataset.qr, box = $('#qr-' + x);
      if (box.hidden) { box.innerHTML = qrSvg(joinLink(x, codes[x].code)) + `<small class="muted">Scan with the phone camera to join ${x}.</small>`; box.hidden = false; qb.textContent = 'Hide QR'; }
      else { box.hidden = true; qb.textContent = 'QR code'; }
      return;
    }
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
