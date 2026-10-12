// Prewarming study: op-day screens. Data stays on this phone for now (localStorage); sharing comes with Firebase.
import { PAGES, SERIES, BY_ID, EXTRA_BY_ID, IX_COLS, SITES, calc, normaliseTemp, isShown } from './schema.js';
import { newRecord, setVal, val, lastEdit, mergeRecord } from './store.js';
import { workbook } from './export.js';
import * as cloud from './cloud.js';
import { qrcode } from './vendor/qrcode.js';
import * as wordview from './wordview.js';

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
const settings = Object.assign({ me: '', site: '', hide: { skin: false, set: false, ts: false, warm: false, room: false, haemo15: false, bis: false },
  remind: { vibrate: true, beep: true, banner: true, awake: true } }, read('settings', {}));
const saveAll = () => write('patients', patients);
const saveSettings = () => write('settings', settings);
// settings v2 (owner, 12 Oct 2026): every reading is entered live by default, BP / HR / BIS every 15 min included
if ((settings.v || 0) < 2) { settings.hide.haemo15 = false; settings.v = 2; saveSettings(); }
// Interface size (this phone only): zooms the whole screen. Normal is 100%.
const SIZES = [['0.85', 'Smaller'], ['0.92', 'Small'], ['1', 'Normal'], ['1.1', 'Large'], ['1.25', 'Larger']];
const applySize = z => document.documentElement.style.setProperty('--ui-zoom', SIZES.some(([k]) => k === String(z)) ? String(z) : '1');
applySize(settings.zoom);
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
function set(p, id, v) {
  if (p.lock?.on) return toast('Locked: read only. Unlock it on the home page to change it.');
  if (setVal(p, id, v, settings.me)) { saveAll(); sync(p, [id]); }
}

// ---------- sharing
const shared = { member: null, admin: false, email: '', unwatch: null, stale: false };
const sharing = () => cloud.enabled && (shared.member || shared.admin);
// send changed fields; Firestore keeps them on the phone and sends them when there is signal
// patients with changes sent but not yet confirmed by the server (no signal), kept across reloads; Log out warns
let pending = read('pending', {});
// when this phone was last fully in step with the server (nothing waiting to send, team's changes received)
let lastSync = read('lastSync', 0);
function synced() {
  if (Object.keys(pending).length) return;
  lastSync = Date.now(); write('lastSync', lastSync); showSync();
}
function syncText() {
  if (!sharing()) return '';
  const n = Object.keys(pending).map(id => patients[id]).filter(p => p && !p.deleted).length;
  const when = !lastSync ? '' : (() => {
    const m = (Date.now() - lastSync) / 60000, d = new Date(lastSync);
    if (m < 1) return 'just now';
    if (m < 60) return Math.floor(m) + ' min ago';
    const t = d.toTimeString().slice(0, 5);
    return d.toDateString() === new Date().toDateString() ? 'at ' + t : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + t;
  })();
  if (n) return `Not synced: ${n} patient${n === 1 ? '' : 's'} waiting for signal.${when ? ' Last synced ' + when + '.' : ''}`;
  return when ? `Synced ${when}.` : 'Not synced yet.';
}
// every "last synced" line on screen
function showSync() { const t = syncText(); document.querySelectorAll('.syncline').forEach(el => { el.textContent = t; el.classList.toggle('late', /^Not/.test(t)); }); }
setInterval(showSync, 20000);
function sync(p, ids, withLock = false) {
  if (!sharing()) return;
  p.site ||= val(p, 'site') || shared.member?.site || settings.site;
  if (!p.site) return;
  const tok = Date.now() + Math.random();
  pending[p.id] = tok; write('pending', pending);
  showSync();
  const done = () => { if (pending[p.id] === tok) { delete pending[p.id]; write('pending', pending); synced(); } };
  cloud.push(p, ids, withLock).then(done).catch(e => {
    // refused (e.g. an admin locked the patient meanwhile): the server drops the change, so it isn't waiting either
    if (e?.code === 'permission-denied') { done(); toast(`${sid(p)}: not saved to the team (locked by the study admin?)`); }
    else toast(cloud.friendly(e));
  });
}
// Log out (owner, 12 Oct 2026): leaves the team and deletes every patient on this phone, after a warning, and a
// second one if some changes haven't reached the team yet. Settings (initials, display) stay.
async function logOut(btn) {
  const n = Object.values(patients).filter(p => !p.deleted).length;
  const who = shared.member ? `the ${shared.member.site} team` : 'the study';
  if (!confirm(`Log out of ${who} on this phone?\n\nThis deletes all ${n} patient${n === 1 ? '' : 's'} from this phone. What has synced stays with your team.`)) return;
  btn.disabled = true; btn.textContent = 'Checking everything has synced…';
  if (Object.keys(pending).length && await cloud.flushed(6000)) { pending = {}; write('pending', pending); synced(); }
  const unsynced = Object.keys(pending).map(id => patients[id]).filter(p => p && !p.deleted).map(sid);
  if (unsynced.length && !confirm(`Not synced yet: ${unsynced.join(', ')}.${lastSync ? ' ' + syncText().replace(/^Not synced:[^.]*\. ?/, '') : ''}\n\nThese changes haven’t reached your team (no signal?). Logging out now loses them. Cancel, get signal and wait a moment, or Export Excel first.\n\nLog out anyway and lose them?`)) {
    btn.disabled = false; btn.textContent = 'Log out'; return;
  }
  shared.unwatch?.();
  await cloud.logOut();
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(NS) && k !== NS + 'settings') localStorage.removeItem(k); } catch { /* storage blocked */ }
  location.replace(location.pathname + location.search + '#/');
  location.reload();
}
async function watch() {
  shared.unwatch?.(); shared.unwatch = null;
  if (!sharing()) return;
  shared.unwatch = await cloud.watchPatients(shared.admin ? null : shared.member.site, (list, meta) => {
    if (meta.server) { synced(); resyncOnce(); }
    let changed = false;
    // a member's phone: a patient locked by an admin leaves the team's query, so it goes from this phone
    if (!shared.admin) for (const id of meta.removed || []) {
      if (!patients[id]) continue;
      delete patients[id]; delete pending[id]; changed = true;
    }
    if (changed) write('pending', pending);
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
    // redraw unless someone is typing (a focused link or button is fine)
    const typing = view.contains(document.activeElement) && document.activeElement.matches('input, textarea, select');
    if (/^\/$|^\/p\/\w+$|\/sheet$/.test(h) && !typing && !leaveGuard?.()) render();
    else { shared.stale = true; const b = $('#fresh'); if (b) b.hidden = false; }
  }, e => toast(cloud.friendly(e)));
}
// Repair (12 Oct 2026): a lock, unlock or delete briefly sent an empty f, which wiped the readings on the server copy.
// Once, after the phone has the server's latest (so nothing newer is overwritten), send every patient whole again.
function resyncOnce() {
  // resync2: also gives older records the locked flag the team's query filters on
  if (read('resync2', false) || !sharing()) return;
  write('resync2', true);
  for (const p of Object.values(patients)) {
    const site = val(p, 'site') || p.site;
    if (!shared.admin && site !== shared.member?.site) continue;
    if (Object.keys(p.f).length) sync(p, Object.keys(p.f));
  }
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
  // changes held over from an earlier visit go out with the next signal: then nothing is pending
  if (sharing() && Object.keys(pending).length) cloud.flushed(600000).then(ok => { if (ok) { pending = {}; write('pending', pending); synced(); } });
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
// a reading screen with changes not yet saved sets this: it returns { what, save } while there is something to lose
let leaveGuard = null, shown = location.hash;
function render() {
  // leaving (another timepoint, BP / HR / BIS, back, a team update): ask to save first
  const g = leaveGuard?.();
  if (g) {
    const to = location.hash;
    if (to !== shown) history.replaceState(null, '', shown || '#/');
    if (document.querySelector('dialog.ask[open]')) return;
    askLeave(g, () => { leaveGuard = null; if (to !== shown) go(to); else render(); });
    return;
  }
  leaveGuard = null; shown = location.hash;
  cleanup.forEach(f => f()); cleanup = [];
  shared.stale = false; $('#fresh').hidden = true;
  const h = location.hash.slice(1) || '/';
  // a locked patient can't be opened (by anyone) until a study admin unlocks it
  const pm = /^\/p\/(\w+)/.exec(h);
  // a locked patient can't be opened from a team phone; an admin opens it read only
  const lockedHere = !!(pm && patients[pm[1]]?.lock?.on);
  if (lockedHere && !canLock()) { toast('Locked by the study admin'); location.replace('#/'); return; }
  document.body.classList.toggle('ro', lockedHere);
  for (const [re, fn] of routes) { const m = re.exec(h); if (m) { fn(...m.slice(1)); window.scrollTo(0, 0); return; } }
  home();
}
window.addEventListener('hashchange', render);
window.addEventListener('beforeunload', e => { if (leaveGuard?.()) e.preventDefault(); });
function askLeave(g, proceed) {
  const d = document.createElement('dialog');
  d.className = 'ask';
  d.innerHTML = `<p><b>Save the ${esc(g.what)}?</b></p><p class="muted small">You changed it but haven’t saved.</p>
    <div class="askbtns"><button class="save" data-a="save">Save</button><button class="secondary" data-a="drop">Don’t save</button><button class="link" data-a="stay">Stay here</button></div>`;
  document.body.append(d);
  d.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a || (e.target === d ? 'stay' : null);
    if (!a) return;
    if (a === 'save' && !g.save()) { d.close(); return; }
    d.close();
    if (a !== 'stay') proceed();
  };
  d.onclose = () => d.remove();
  d.showModal();
  d.querySelector('[data-a="save"]').focus();
}
$('#fresh').onclick = () => render();
$('#banner').onclick = () => { $('#banner').hidden = true; };
function header(title, back, extra = '') {
  $('#title').textContent = title;
  $('#back').hidden = !back; $('#back').onclick = () => go(back);
  $('#extra').innerHTML = extra;
}

// ---------- home
route(/^\/$/, home);
// Locking (owner, 12 Oct 2026): a study admin (or anyone, in demo mode) picks patients on the home page and locks
// them; nobody can open a locked patient, and the rules stop members changing it, until an admin unlocks it.
const canLock = () => shared.admin || DEMO;
const LOCK_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
let selecting = null; // Set of patient ids while choosing which to lock / unlock
function setLock(ids, on) {
  const by = shared.email || settings.me || 'admin';
  for (const id of ids) {
    const p = patients[id]; if (!p) continue;
    p.lock = { on, t: Date.now(), by };
    // locking sends the whole record (repairs a server copy); unlocking only the lock (all a locked patient allows)
    sync(p, on ? Object.keys(p.f) : [], true);
  }
  saveAll();
}
function home() {
  header('Prewarming study' + (DEMO ? ' (demo)' : ''), null, `<a class="iconbtn" href="#/settings" aria-label="Settings">⚙</a>`);
  const list = Object.values(patients).filter(p => !p.deleted).sort((a, b) => (lastEdit(b)?.t || b.created) - (lastEdit(a)?.t || a.created));
  if (selecting && !canLock()) selecting = null;
  const latest = list[0];
  paint(`
    ${settings.me && settings.site ? '' : `<div class="note">Add your ${settings.me ? '' : 'initials and '}hospital in <a href="#/settings">Settings</a>${settings.me ? '' : ' so each reading shows who entered it'}.</div>`}
    <button class="primary big" id="new">+ New patient</button>
    <div class="listhead"><h2>Patients on this phone</h2>${canLock() && list.length && !selecting ? '<button class="link" id="select">Select to lock</button>' : ''}</div>
    ${selecting ? `<div class="seltools"><span>${selecting.size} selected</span>
      ${latest && list.length > 1 ? `<button class="secondary" id="selall">All but ${esc(sid(latest))} (latest)</button>` : ''}<button class="secondary" id="selnone">None</button>
      <button class="primary" id="lock" ${selecting.size ? '' : 'disabled'}>${LOCK_ICON} Lock</button><button class="secondary" id="unlock" ${selecting.size ? '' : 'disabled'}>Unlock</button><button class="link" id="seldone">Done</button></div>` : ''}
    ${list.length ? `<ul class="list">${list.map(p => {
      const e = lastEdit(p), locked = p.lock?.on;
      const body = `<b>${esc(sid(p))}${val(p, 'site') ? ` <small>${esc(val(p, 'site'))}</small>` : ''}</b><span${locked ? ' class="lockline"' : val(p, 'done') ? ' class="okline"' : ''}>${locked ? `${LOCK_ICON} Locked by the study admin${canLock() ? ' · read only' : ''}` : esc(status(p))}</span>
        <small>${e ? 'Last entry ' + new Date(e.t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (e.by ? ' by ' + esc(e.by) : '') : 'No entries yet'}</small>`;
      if (selecting) return `<li><label class="selrow"><input type="checkbox" data-sel="${p.id}" ${selecting.has(p.id) ? 'checked' : ''}><span>${body}</span></label></li>`;
      if (locked) return `<li><a href="${canLock() ? '#/p/' + p.id : '#/'}" class="locked"${canLock() ? '' : ' data-locked="1"'}>${body}</a></li>`;
      return `<li><a href="#/p/${p.id}"${val(p, 'done') ? ` data-done="${esc(val(p, 'done'))}"` : ''}>${body}</a></li>`;
    }).join('')}</ul>` : `<p class="muted">No patients yet. Tap <b>New patient</b> on the morning of surgery.</p>`}
    <p class="muted small">${sharing() ? `Shared with the ${esc(shared.admin ? 'whole study (admin)' : shared.member.site + ' team')}. Readings sync when there is signal. <b class="syncline">${esc(syncText())}</b>` : `Data stays on this phone. <a href="#/settings">Join your hospital’s team</a> to share patients.`} Study IDs only: no names or hospital numbers.</p>`);
  $('#new').onclick = () => go('#/new');
  view.querySelectorAll('.list a[data-locked]').forEach(a => a.onclick = e => { e.preventDefault(); toast('Locked by the study admin'); });
  if ($('#select')) $('#select').onclick = () => { selecting = new Set(); home(); };
  if (selecting) {
    view.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? selecting.add(c.dataset.sel) : selecting.delete(c.dataset.sel); home(); });
    if ($('#selall')) $('#selall').onclick = () => { selecting = new Set(list.filter(p => p !== latest).map(p => p.id)); home(); };
    $('#selnone').onclick = () => { selecting = new Set(); home(); };
    $('#seldone').onclick = () => { selecting = null; home(); };
    $('#lock').onclick = () => {
      const n = selecting.size;
      if (!confirm(`Lock ${n} patient${n === 1 ? '' : 's'}?\n\nNobody can open ${n === 1 ? 'it' : 'them'} until an admin unlocks${sharing() ? ', and phones can’t change ' + (n === 1 ? 'it' : 'them') : ''}.`)) return;
      setLock(selecting, true); toast(n + ' locked'); selecting = null; home();
    };
    $('#unlock').onclick = () => { const n = selecting.size; setLock(selecting, false); toast(n + ' unlocked'); selecting = null; home(); };
  }
  // a patient marked complete: warn on the first tap, open on the second
  view.querySelectorAll('.list a[data-done]').forEach(a => a.onclick = e => {
    if (a.dataset.warned) return;
    e.preventDefault(); a.dataset.warned = 1; a.classList.add('warned');
    a.insertAdjacentHTML('beforeend', `<em class="warnline">Data collection was marked complete${a.dataset.done ? ' (' + esc(a.dataset.done) + ')' : ''}. Tap again to open it; any change is recorded with your initials.</em>`);
  });
}
function status(p) {
  if (val(p, 'done')) return '✓ Data collection complete';
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
const EVENTS = [['pw_gown', 'Gown on'], ['pw_start', 'Prewarm on', 'pw'], ['ev_wstop', 'Prewarm off', 'pw'], ['ev_ot', 'In OT'],
  ['io_knife', 'Induction'], ['io_flip', 'Prone'], ['io_under_start', 'Under­body warm'], ['io_gown_start', 'Gown warm'],
  ['io_done', 'Surgery end'], ['pacu_in', 'PACU in'], ['pacu_out', 'To ward']];
// the gown and Bair Hugger times, coloured warm (owner, 12 Oct 2026)
const WARM_EVENTS = new Set(['pw_gown', 'pw_start', 'ev_wstop', 'io_under_start', 'io_gown_start']);
const EVENT_FULL = { pw_gown: 'Gown on', ev_ot: 'In OT', pacu_in: 'PACU arrival', io_flip: 'Flipped prone', pw_start: 'Active warming started', ev_wstop: 'Active warming stopped', io_knife: 'Induction (knife to skin)', io_under_start: 'Underbody Bair Hugger on',
  io_gown_start: 'Gown Bair Hugger on', io_done: 'Surgery completed (post-extubation)', pacu_out: 'Transfer to ward' };
// Running timer and the next event to note, in the app bar of the patient screen
const ESSENTIAL = ['pw_gown', 'pw_start', 'ev_wstop', 'ev_ot', 'io_knife', 'io_done', 'pacu_in', 'pacu_out'];
const WARM_MIN = { 1: 30, 2: 10 };
const mmss = m => { const sec = Math.max(0, Math.floor(m * 60)), h = Math.floor(sec / 3600), mm = Math.floor(sec / 60) % 60, ss = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`; };
// top bar (owner, 12 Oct 2026): on the right the time now (it sits above the time boxes); to its left a countdown to the
// next thing to log: the next reading due on this screen, or warming off, whichever comes first
function clockHtml(p, s) {
  const now = nowMin(), n = nextDue(p, s);
  let next = '';
  if (n) {
    const left = n.due - now, st = left > 2 ? 'later' : left > 0 ? 'soon' : left > -5 ? 'now' : 'late';
    next = `<div class="next" data-state="${st}"><small>${esc(n.label)}</small><b>${left > 0 ? 'in ' + mmss(left) : left > -5 ? 'now' : 'late ' + mmss(-left)}</b></div>`;
  }
  return `${next}<div class="now"><small>Now</small><b>${fromMin(Math.floor(now))}</b></div>`;
}
function nextDue(p, s) {
  const now = nowMin(), all = [];
  // the reading due most recently (until the next one is due), else the next one coming up
  const timed = pointsFor(p, s).map(x => ({ x, due: dueOf(p, s, x) })).filter(t => t.due != null).sort((a, b) => a.due - b.due);
  const cur = timed.filter(t => t.due <= now).pop(), up = timed.find(t => t.due > now && !savedAt(p, s, t.x.key));
  const pick = cur && !savedAt(p, s, cur.x.key) ? cur : up;
  if (pick) all.push({ label: (s === 'haemo' ? 'BP ' : 'Temp ') + pick.x.label, due: pick.due });
  const nx = nextEvent(p);
  if (nx?.due != null) all.push({ label: nx.label, due: nx.due });
  return all.sort((a, b) => a.due - b.due)[0] || null;
}
// the next event to note: the first unset one after the last one set (warming off: when it is expected)
function nextEvent(p) {
  const evs = ESSENTIAL.filter(id => !(noWarming(p) && (id === 'pw_start' || id === 'ev_wstop')));
  const last = evs.reduce((i, id, j) => val(p, id) ? j : i, -1);
  const id = evs.slice(last + 1).find(x => !val(p, x));
  if (!id) return null;
  const label = EVENTS.find(([f]) => f === id)[1].replace('\u00ad', '');
  const due = id === 'ev_wstop' && toMin(val(p, 'pw_start')) != null && WARM_MIN[val(p, 'arm')] ? toMin(val(p, 'pw_start')) + WARM_MIN[val(p, 'arm')] : null;
  return { id, label, due };
}
// app-bar button that logs the next event as now
const logBtnHtml = p => { const nx = nextEvent(p); return nx ? `<b>Log</b><small>${esc(nx.label)}</small>` : ''; };
// The patient screens' top bar (main screen, BP / HR / BIS, intra-op details, PACU): running timer, next event and
// its Log button. Returns a function that redraws it; it also ticks every second while the screen is open.
function topBar(p, s, onLog) {
  $('#extra').innerHTML = `<div class="clock" id="clock">${clockHtml(p, s)}</div><button class="logbtn" id="lognext" ${nextEvent(p) ? '' : 'hidden'}>${logBtnHtml(p)}</button>`;
  const refresh = () => {
    const ck = $('#clock'); if (ck) ck.innerHTML = clockHtml(p, s);
    const lb = $('#lognext'); if (lb) { const h = logBtnHtml(p); if (lb.innerHTML !== h) lb.innerHTML = h; lb.hidden = !h; }
  };
  $('#lognext').onclick = () => {
    const nx = nextEvent(p); if (!nx) return;
    const t = nowHM();
    set(p, nx.id, t); toast(`${nx.label} ${t}. Tap its box to change.`); refresh(); onLog?.();
  };
  const iv = setInterval(refresh, 1000);
  cleanup.push(() => clearInterval(iv));
  return refresh;
}
const defaultSeries = p => noWarming(p) || val(p, 'ev_ot') || val(p, 'io_knife') ? 'iotemp' : 'prewarm';
route(/^\/p\/(\w+)(?:\/(?:read\/)?(prewarm|iotemp|haemo)(?:\/(\w+))?)?$/, (id, s, key) => {
  const p = patients[id]; if (!p) return go('#/');
  if (!s || (s === 'prewarm' && noWarming(p))) s = defaultSeries(p);
  const main = s !== 'haemo';
  const def = SERIES[s], pts = pointsFor(p, s);
  header(main ? sid(p) : sid(p) + ' · BP, HR, BIS', main ? '#/' : '#/p/' + id);
  const refreshBar = topBar(p, s, () => draw());
  let editing = null; // event whose time is being changed
  let typing = null; // the BP / HR / BIS box with the keyboard up
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
  // what's on screen when it opens; anything changed from that is asked about before leaving
  const snap = () => JSON.stringify(cols.map(c => draft[c.key] == null ? null : String(draft[c.key])));
  let base = null;
  leaveGuard = () => !p.lock?.on && base != null && snap() !== base ? { what: pt.label + ' reading', save: commit } : null;
  function commit() {
    if (p.lock?.on) { toast('Locked: read only. Unlock it on the home page to change it.'); return false; }
    const bad = cols.filter(c => c.temp && draft[c.key] != null && (+draft[c.key] < 25 || +draft[c.key] > 45 || Number.isNaN(+draft[c.key])));
    if (bad.length) { toast('Check ' + bad.map(c => c.label).join(', ') + ': temperatures should be 25–45 °C.'); return false; }
    for (const c of cols) setVal(p, `${s}_${pt.key}_${c.key}`, draft[c.key] == null ? null : (c.type === 'code' ? +draft[c.key] : String(draft[c.key])), settings.me);
    if (!isSaved) setVal(p, `at_${s}_${pt.key}`, nowHM(), settings.me);
    saveAll();
    sync(p, [...cols.map(c => `${s}_${pt.key}_${c.key}`), `at_${s}_${pt.key}`]);
    toast(pt.label + ' saved');
    base = snap();
    return true;
  }

  function strip() {
    const now = nowMin();
    return `<div class="strip" role="list">${pts.map(x => {
      const done = savedAt(p, s, x.key), due = dueOf(p, s, x), missed = !done && due != null && now > due + 5;
      return `<a role="listitem" href="#/p/${id}/${s}/${x.key}" class="${x.key === pt.key ? 'on' : ''} ${done ? 'done' : missed ? 'missed' : ''}">${x.key === 'base' ? 'Base' : x.key === 'end' ? 'End' : x.min}</a>`;
    }).join('')}</div>`;
  }
  function isChanged(k) { const v = draft[k]; return v != null && was[k] != null && String(v) !== String(was[k]); }
  function hintOf(c) {
    const v = draft[c.key];
    if (c.key === 'map' && v == null) { const m = calc('map', k => draft[k]); if (m) return `<button class="link" data-map="${m}">use ${m}</button>`; }
    return isChanged(c.key) ? 'was ' + was[c.key] : was[c.key] != null ? 'same' : '';
  }
  function card(c) {
    const v = draft[c.key];
    if (c.type === 'code') {
      return `<div class="card ${c.opts.length > 2 ? 'wide inline' : ''}" ${c.key === 'ts' ? 'title="−3 cold … +3 hot" aria-label="Thermal sensation, −3 cold to +3 hot" role="group"' : ''}><div class="clab">${c.label}</div>
        <div class="seg ${c.opts.length > 2 ? 'seven' : 'two'}">${c.opts.map(([ov, ol]) => `<button class="chip" aria-pressed="${String(v) === String(ov)}" data-c="${c.key}" data-v="${ov}">${c.key === 'ts' ? ol.split(' ')[0] : ol}</button>`).join('')}</div></div>`;
    }
    if (c.key === 'set') {
      return `<div class="card wide inline"><div class="clab">Gown set <small>°C</small></div>
        <div class="seg seven">${['38', '39', '40', '41', '42', '43', 'NA'].map(o => `<button class="chip" aria-pressed="${String(v) === o}" data-c="set" data-v="${o}">${o}</button>`).join('')}</div></div>`;
    }
    const changed = isChanged(c.key), hint = hintOf(c);
    // BP, HR, BIS: plain boxes that stay boxes, so the keyboard stays up from one to the next (owner, 12 Oct 2026)
    if (s === 'haemo') {
      const last = c === cols[cols.length - 1];
      return `<div class="card typed ${changed ? 'changed' : ''}" data-k="${c.key}"><div class="clab"><span>${c.label}</span><small>${hint}</small></div>
        <input class="num" id="in-${c.key}" data-in="${c.key}" inputmode="numeric" enterkeyhint="${last ? 'done' : 'next'}" autocomplete="off" aria-label="${c.label}" value="${esc(v ?? '')}"></div>`;
    }
    // an empty temperature: the whole card is one big target that puts in 36.5
    const fill = (c.temp || c.key === 'room') && v == null;
    return `<div class="card ${changed ? 'changed' : ''}${fill ? ' fill' : ''}" ${fill ? `data-fill="${c.key}"` : ''}><div class="clab">${c.label}<small>${hint}</small></div>
      <div class="pm"><button class="k" data-step="-1" data-c="${c.key}" aria-label="${c.label} down">−</button><button class="num" data-type="${c.key}">${v ?? '<span class="muted">tap</span>'}</button><button class="k" data-step="1" data-c="${c.key}" aria-label="${c.label} up">+</button></div></div>`;
  }
  function timesHtml() {
    // numbered in the order they happen (owner, 12 Oct 2026)
    return `<div class="times">${EVENTS.filter(([, , pw]) => !(pw && noWarming(p))).map(([f, l], i) => {
      const v = val(p, f), full = EVENT_FULL[f] || l, n = `<i class="tn" aria-hidden="true">${i + 1}</i>`;
      if (editing === f) return `<div class="tchip edit"><span>${i + 1}. ${l}</span><input type="time" id="evtime" value="${v === 'NA' ? '' : esc(v || '')}" aria-label="${full}"><button class="link" data-evclear="${f}">Clear</button></div>`;
      return `<button class="tchip ${v ? 'set' : ''}${WARM_EVENTS.has(f) ? ' warm' : ''}" data-ev="${f}" aria-label="${i + 1}, ${full}: ${v ? v + ', tap to change' : 'tap to set now'}">${n}<span>${l}</span><b>${v ? esc(v) : 'tap'}</b></button>`;
    }).join('')}</div>`;
  }
  // patient comfort: pre-op question at the top, post-op at the bottom; one line once answered
  const COMFORT = BY_ID.sat_pre.opts;
  let satEdit = null;
  function comfortHtml(id, label) {
    const v = val(p, id);
    if (v != null && satEdit !== id) {
      return `<div class="comfort done"><span>${label}: <b>${esc(COMFORT.find(o => String(o[0]) === String(v))?.[1] || v)}</b></span><button class="link" data-satedit="${id}">Change</button></div>`;
    }
    return `<div class="comfort"><span class="lab">${label}<small>ask the patient</small></span>
      <div class="seg comfort5">${COMFORT.map(([ov, ol]) => `<button class="chip" data-sat="${id}" data-v="${ov}" aria-pressed="${String(v) === String(ov)}">${ol.replace('omfortable', 'omfort&shy;able')}</button>`).join('')}</div></div>`;
  }
  function linksHtml() {
    const done = pg => val(p, 'sign_' + pg) ? ' ✓' : '';
    const haemo = pointsFor(p, 'haemo').filter(x => savedAt(p, 'haemo', x.key)).length;
    return `<nav class="links" aria-label="Other forms">
      <a href="#/p/${id}/haemo" id="haemolink" data-state="${haemoState(p)}">BP, HR, BIS${done('haemo')}<small>${haemo ? haemo + ' saved' : 'Baseline in OT'}</small></a>
      <a href="#/p/${id}/form/intraop">Intra-op details${done('intraop')}<small>Blood, products, tests</small></a>
      <a href="#/p/${id}/form/pacu">PACU${done('pacu')}<small>Temp, NuDESC, delay</small></a>
      </nav>
      <div class="textlinks"><a class="minicard" href="#/p/${id}/data">Other data</a><a href="#/p/${id}/form">Form view</a><a href="#/p/${id}/sheet">Sheet view</a></div>`;
  }
  // previous / next timepoint: big buttons either side of the tabs and the timepoint strip
  function navHtml() {
    const i = pts.findIndex(x => x.key === pt.key);
    const btn = (x, cls, sym, word) => x
      ? `<a class="pn ${cls}" href="#/p/${id}/${s}/${x.key}" aria-label="${word}: ${esc(x.label)}">${sym}</a>`
      : `<span class="pn ${cls}" aria-hidden="true">${sym}</span>`;
    return `<div class="nav2">${btn(pts[i - 1], 'prev', '‹', 'Previous')}<div class="mid">${main ? tabsHtml() : ''}${strip()}</div>${btn(pts[i + 1], 'next', '›', 'Next')}</div>`;
  }
  function tabsHtml() {
    if (noWarming(p)) return `<h2 class="sect">Intra-op temperatures</h2>`;
    return `<div class="tabs2" role="tablist">${['prewarm', 'iotemp'].map(x => `<a role="tab" aria-selected="${x === s}" href="#/p/${id}/${x}">${x === 'prewarm' ? 'Pre-warming' : 'Intra-op'}</a>`).join('')}</div>`;
  }
  function draw() {
    if (s === 'prewarm' && !setTouched && cols.some(c => c.key === 'set') && setTempNA(p, pt)) draft.set = 'NA';
    if (base == null) base = snap();
    const due = dueOf(p, s, pt);
    const grp = s === 'prewarm' ? `<span class="badge">${GROUPS.find(g => String(g[0]) === String(val(p, 'arm')))?.[1] || 'Group not set'}</span>` : '';
    paint(`${main && val(p, 'done') ? `<p class="ok-box donetop">✓ Data collection complete <small>${esc(val(p, 'done'))}</small></p>` : ''}${main ? comfortHtml('sat_pre', 'Comfortable before surgery?') + timesHtml() : ''}${navHtml()}
      <div class="tp"><div><b>${pt.label}</b> ${grp}</div><div class="due" id="due">${due != null ? 'due ' + fromMin(Math.round(due)) : pt.key === 'base' ? (s === 'prewarm' ? '' : 'on arrival in OT') : pt.min != null ? `<span class="hint">Set “${s === 'prewarm' ? 'Prewarm on' : 'Induction'}” for due times</span>` : ''}</div></div>
      ${isSaved ? `<p class="muted small tight">Saved ${esc(savedAt(p, s, pt.key))}${p.f['at_' + s + '_' + pt.key]?.by ? ' by ' + esc(p.f['at_' + s + '_' + pt.key].by) : ''}. Changes save when you tap Save.</p>` : ''}
      <div class="board">${cols.map(card).join('')}</div>
      <button class="save big" id="save">${isSaved ? 'Save changes' : `Save ${pt.label} reading`}</button>
      ${s === 'haemo' && vitalsCollected(p) ? '<p class="okline small">✓ Vital signs data collected: ticked on the paper form</p>' : ''}
      ${s === 'haemo' && settings.hide.haemo15 ? `<p class="muted small">Only baseline is entered here; the 15-min rows come from the monitor download. Turn them on in Settings.</p>` : ''}
      ${main ? comfortHtml('sat_post', 'Comfortable after surgery?') + linksHtml() + doneHtml(p) : signoffHtml(p, s)}`);
    refreshBar();
    if (editing) { const i = $('#evtime'); i?.focus(); }
    if (typing) { const i = view.querySelector(`[data-in="${typing}"]`); i?.focus(); }
    const st = view.querySelector('.strip'), on = st?.querySelector('.on');
    if (on) st.scrollLeft = on.offsetLeft - st.offsetLeft - (st.clientWidth - on.offsetWidth) / 2;
  }
  draw();
  const step = { core: 0.1, chest: 0.1, arm: 0.1, thigh: 0.1, calf: 0.1, room: 0.5, sbp: 1, dbp: 1, map: 1, hr: 1, bis: 1 };
  const start = { core: 36.5, chest: 36.5, arm: 36.5, thigh: 36.5, calf: 36.5, room: 20, sbp: 120, dbp: 70, map: 85, hr: 75, bis: 50 };
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
    const fl = t.closest('.card[data-fill]');
    if (fl && !t.closest('[data-step]')) { draft[fl.dataset.fill] = fl.dataset.fill === 'room' ? '20.0' : '36.5'; draw(); return; }
    const m = t.closest('[data-map]');
    if (m) { draft.map = m.dataset.map; draw(); return; }
    const sat = t.closest('[data-sat]');
    if (sat) { const cur = val(p, sat.dataset.sat); set(p, sat.dataset.sat, String(cur) === sat.dataset.v ? null : +sat.dataset.v); satEdit = null; draw(); return; }
    const se = t.closest('[data-satedit]');
    if (se) { satEdit = se.dataset.satedit; draw(); return; }
    const ev = t.closest('[data-ev]');
    if (ev) {
      // tap an empty time: now; tap a set one: change it
      if (!val(p, ev.dataset.ev)) set(p, ev.dataset.ev, nowHM()); else editing = ev.dataset.ev;
      draw(); return;
    }
    const clr = t.closest('[data-evclear]');
    if (clr) { set(p, clr.dataset.evclear, null); editing = null; draw(); return; }
    const n = t.closest('.num[data-type]');
    if (n) {
      const k = n.dataset.type, c = cols.find(x => x.key === k);
      // an empty temperature starts at 36.5; tap again to type
      if ((c.temp || k === 'room') && draft[k] == null) { draft[k] = k === 'room' ? '20.0' : '36.5'; draw(); return; }
      const inp = document.createElement('input');
      inp.className = 'num'; inp.inputMode = 'decimal'; inp.value = draft[k] ?? ''; inp.setAttribute('aria-label', c.label);
      n.replaceWith(inp); inp.focus(); inp.select();
      let ended = false; // removing the box on redraw fires blur again
      const done = () => { if (ended) return; ended = true; const v = c.temp ? normaliseTemp(inp.value) : inp.value.trim(); draft[k] = v === '' ? null : v; draw(); };
      inp.onblur = done; inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); };
      return;
    }
    if (t.closest('#save')) {
      if (!commit()) return;
      const next = pts.slice(pts.indexOf(pt) + 1).find(x => !savedAt(p, s, x.key));
      go(`#/p/${id}/${s}/` + (next ? next.key : pt.key));
      return;
    }
    if (t.closest('[data-done]')) {
      if (!settings.me) return toast('Add your initials in Settings first.');
      set(p, 'done', `${settings.me} ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ${nowHM()}`);
      toast('Data collection marked complete'); draw(); window.scrollTo(0, 0); return;
    }
    if (t.closest('[data-undone]')) { set(p, 'done', null); draw(); return; }
    signoffClick(p, s, t);
  };
  view.onchange = e => {
    if (e.target.id !== 'evtime' || !editing) return;
    set(p, editing, e.target.value || null); editing = null; draw();
  };
  // typed boxes (BP, HR, BIS): no redraw while typing, so moving to the next box keeps the keyboard up
  view.onfocusin = e => { if (e.target.dataset.in) typing = e.target.dataset.in; };
  view.oninput = e => {
    const k = e.target.dataset.in; if (!k) return;
    const v = e.target.value.trim(); draft[k] = v === '' ? null : v;
    for (const c of cols) {
      const cd = view.querySelector(`.card[data-k="${c.key}"]`); if (!cd) continue;
      cd.classList.toggle('changed', isChanged(c.key)); cd.querySelector('.clab small').innerHTML = hintOf(c);
    }
  };
  view.onkeydown = e => {
    if (e.key !== 'Enter' || !e.target.dataset.in) return;
    e.preventDefault();
    const all = [...view.querySelectorAll('[data-in]')], next = all[all.indexOf(e.target) + 1];
    if (next) next.focus(); else e.target.blur();
  };
  view.onfocusout = e => {
    if (e.target.dataset.in) setTimeout(() => { if (!view.querySelector('[data-in]:focus')) typing = null; }, 0);
    if (e.target.id === 'evtime') setTimeout(() => { if (editing && !view.contains(document.activeElement)) { editing = null; draw(); } }, 0); };
  cleanup.push(() => { view.onchange = view.onfocusout = view.onfocusin = view.oninput = view.onkeydown = null; });
  // the due time warms up as it nears the clock: soon (2 min), now (to 5 min past), late; plain once saved
  startAlerts(p, s, () => {
    const el = $('#due'); if (!el) return;
    const d = dueOf(p, s, pt); if (d == null) return;
    const left = d - nowMin();
    el.textContent = 'due ' + fromMin(Math.round(d)) + (left > 0 ? ` · in ${Math.floor(left)}:${String(Math.floor((left % 1) * 60)).padStart(2, '0')}` : left > -5 ? ' · now' : ' · late');
    el.dataset.state = isSaved ? 'saved' : left > 2 ? 'later' : left > 0 ? 'soon' : left > -5 ? 'now' : 'late';
  });
  // the BP, HR, BIS box warms up the same way for its next 15-min reading
  const hl = setInterval(() => { const a = $('#haemolink'); if (a) a.dataset.state = haemoState(p); }, 1000);
  cleanup.push(() => clearInterval(hl));
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

// ---------- the patient's op-day data collection marked complete (bottom of the main screen, so it isn't tapped by
// accident); shown at the top of the main screen and in the patient list. The Word form's sign-off lines use it.
function doneHtml(p) {
  const v = val(p, 'done');
  return `<div class="sign">${v ? `Data collection complete: ${esc(v)} <button class="link" data-undone>Undo</button>` : `<button class="link" data-done>Mark data collection as complete</button>`}</div>`;
}

// ---------- section sign-off (replaces the paper form's Name / Signature / Date)
function signoffHtml(p, pg) {
  const v = val(p, 'sign_' + pg);
  return `<div class="sign">${v ? `Marked complete: ${esc(v)} <button class="link" data-unsign="${pg}">Undo</button>` : `<button class="link" data-sign="${pg}">Mark section complete</button>`}</div>`;
}
function signoffClick(p, pg, t) {
  if (t.closest('[data-sign]')) {
    if (!settings.me) return toast('Add your initials in Settings first.');
    set(p, 'sign_' + pg, `${settings.me} ${new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} ${nowHM()}`); render();
  } else if (t.closest('[data-unsign]')) { set(p, 'sign_' + pg, null); render(); }
}

// BP / HR / BIS: the next 15-min reading's state, like the due time (readings missed by over 15 min are let go)
function haemoState(p) {
  const now = nowMin();
  const lefts = pointsFor(p, 'haemo').filter(x => x.min != null && !savedAt(p, 'haemo', x.key))
    .map(x => dueOf(p, 'haemo', x)).filter(d => d != null).map(d => d - now).filter(l => l > -15);
  if (!lefts.length) return 'later';
  const left = Math.min(...lefts);
  return left > 2 ? 'later' : left > 0 ? 'soon' : left > -5 ? 'now' : 'late';
}
// the paper form's "Vital Signs Data Collected": ticked once any BP / HR / BIS value is saved
const vitalsCollected = p => Object.keys(p.f).some(k => /^haemo_/.test(k) && val(p, k) != null);

// ---------- other data: the study's remaining pages (pre-op, day 1 and 2 chart review, discharge), all on one page under
// headers that open by default (owner, 12 Oct 2026). Built for a computer keyboard too: Enter or ↓ goes to the next
// question, ↑ to the one before; on a row of choices ← → move along it and Enter or Space picks one and moves on.
route(/^\/p\/(\w+)\/data$/, id => {
  const p = patients[id]; if (!p) return go('#/');
  header(sid(p) + ' · Other data', '#/p/' + id);
  topBar(p, defaultSeries(p));
  const get = k => val(p, k);
  const closed = new Set();
  const filled = pg => FORM[pg].filter(([k]) => val(p, k) != null).length;
  const draw = () => {
    const y = window.scrollY;
    paint(`<p class="muted small">Usually from Epic or the chart, after the day of surgery. Fill in what you have; the rest stays blank.</p>
      ${OTHER_PAGES.map(pg => `<details class="sect" data-pg="${pg}" ${closed.has(pg) ? '' : 'open'}><summary><span>${esc(PAGES.find(x => x.id === pg).title)}</span>
        <small>${filled(pg) ? filled(pg) + ' of ' + FORM[pg].length + ' filled' : 'Not started'}</small></summary>
        <div class="stack">${FORM[pg].map(([k]) => fieldHtml(field(k), get)).join('')}</div></details>`).join('')}`);
    window.scrollTo(0, y);
  };
  draw();
  // each question is one stop: its box, or on a row of choices the picked one (else the first)
  const stops = () => [...view.querySelectorAll('details[open] .fld')];
  const stopOf = el => el.closest('.fld');
  const keyOf = fld => fld.querySelector('[data-f]')?.dataset.f;
  const focusStop = fld => { if (!fld) return; const t = fld.querySelector('input, .chip[aria-pressed="true"]') || fld.querySelector('.chip'); t.focus(); if (t.select && t.type === 'text') t.select(); };
  const move = (k, by) => { const all = stops(); const i = all.findIndex(f => keyOf(f) === k); focusStop(all[i + by]); };
  const pick = b => { const f = field(b.dataset.f); const v = f.type === 'code' ? +b.dataset.v : b.dataset.v; set(p, f.id, String(get(f.id)) === String(v) ? null : v); draw(); };
  view.onclick = e => { const b = e.target.closest('.chip[data-f]'); if (b) pick(b); };
  view.onchange = e => {
    const i = e.target; if (!i.dataset.f) return;
    const f = field(i.dataset.f);
    set(p, f.id, f.temp ? normaliseTemp(i.value) : i.value.trim());
    if (REDRAW.has(f.id)) return draw();
    const d = i.closest('details[data-pg]'), n = d && filled(d.dataset.pg);
    if (d) d.querySelector('summary small').textContent = n ? n + ' of ' + FORM[d.dataset.pg].length + ' filled' : 'Not started';
  };
  view.onkeydown = e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const fld = stopOf(e.target); if (!fld) return;
    const k = keyOf(fld), chip = e.target.closest('.chip');
    // date and time boxes keep their own arrow keys (they change the value)
    const arrows = chip || e.target.type === 'text';
    if (chip && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const row = [...fld.querySelectorAll('.chip')]; row[Math.max(0, Math.min(row.length - 1, row.indexOf(chip) + (e.key === 'ArrowRight' ? 1 : -1)))].focus();
    } else if (chip && e.key === ' ') {
      // Space picks or clears and stays; Enter picks (never clears) and moves on
      e.preventDefault(); const v = chip.dataset.v; pick(chip); view.querySelector(`.chip[data-f="${k}"][data-v="${v}"]`)?.focus();
    } else if (chip && e.key === 'Enter') {
      e.preventDefault(); if (chip.getAttribute('aria-pressed') !== 'true') pick(chip); move(k, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Enter' || (arrows && e.key === 'ArrowDown')) {
      e.preventDefault(); e.target.blur(); move(k, e.shiftKey && e.key === 'Enter' ? -1 : 1);
    } else if (arrows && e.key === 'ArrowUp') {
      e.preventDefault(); e.target.blur(); move(k, -1);
    }
  };
  const ontoggle = e => { const d = e.target.closest?.('details[data-pg]'); if (d) d.open ? closed.delete(d.dataset.pg) : closed.add(d.dataset.pg); };
  view.addEventListener('toggle', ontoggle, true);
  cleanup.push(() => { view.onclick = view.onchange = view.onkeydown = null; view.removeEventListener('toggle', ontoggle, true); });
});

// ---------- forms (intra-op details, PACU, satisfaction)
const FORM = {
  intraop: [['io_tech'], ['io_ebl'], ['h', 'Transfusion'], ['tx'], ['io_cs', 'io_cs_vol', 'io_cs_ret'], ['io_pcc', 'io_pcc_dose'],
    ['io_txa', 'io_txa_bolus', 'io_txa_inf', 'io_txa_total'], ['io_fib', 'io_fib_dose'], ['h', 'Intra-op investigations'], ['ix']],
  pacu: [['pacu_temp'], ['pacu_shiver'], ['pacu_ponv'], ['pacu_hypot'], ['pacu_tx'], ['pacu_pain'], ['h', 'NuDESC'],
    ['nd_dis', 'nd_beh', 'nd_com', 'nd_ill', 'nd_psy', 'pacu_nudesc'], ['pacu_delay', 'pacu_delay1h', 'pacu_delay_why']],
  satis: [['sat_pre'], ['sat_post']],
};
// the rest of the study's data (owner, 12 Oct 2026): every field of these pages, in template order
const OTHER_PAGES = ['preop', 'meds', 'bloods', 'pod1', 'pod1an', 'pod2', 'pod2an', 'dc'];
for (const pg of OTHER_PAGES) FORM[pg] = PAGES.find(x => x.id === pg).fields.filter(f => f.id !== 'enrol_id').map(f => [f.id]);
route(/^\/p\/(\w+)\/form\/(\w+)$/, (id, pg) => {
  const p = patients[id]; if (!p) return go('#/');
  if (OTHER_PAGES.includes(pg)) return go(`#/p/${id}/data`);
  if (!FORM[pg]) return go('#/p/' + id);
  header(sid(p) + ' · ' + PAGES.find(x => x.id === pg).title, '#/p/' + id);
  topBar(p, defaultSeries(p));
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
    if (c != null && !p.lock?.on && (val(p, id) == null || p.f[id]?.auto)) { setVal(p, id, String(c), settings.me); p.f[id].auto = true; saveAll(); sync(p, [id]); }
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
  const type = f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text';
  return `<div class="fld"><label class="lab" for="${idA}">${esc(f.label)}${f.unit ? ` <small>${esc(f.unit)}</small>` : ''}</label>${hint}
    <input id="${idA}" data-f="${f.id}" type="${type}" ${type === 'text' ? `inputmode="${mode}"` : ''} value="${esc(v ?? '')}" autocomplete="off"></div>`;
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
  header(sid(p) + ' · Sheet view', '#/p/' + id);
  const cell = (s, pt, c) => { const v = val(p, `${s}_${pt.key}_${c.key}`); return `<td><a href="#/p/${id}/${s}/${pt.key}" aria-label="${esc(pt.label + ' ' + c.label + ': ' + (v ?? 'empty'))}">${v == null ? '' : esc(c.key === 'ts' && v > 0 ? '+' + v : v)}</a></td>`; };
  const pw = SERIES.prewarm, it = SERIES.iotemp, hd = SERIES.haemo;
  paint(`
    ${noWarming(p) ? '' : `<h2>Pre-warming, every 5 minutes</h2><div class="scroll" tabindex="0"><table class="grid sheet"><thead><tr><th>Time (min)</th>${pw.points.map(x => `<th>${x.min}</th>`).join('')}</tr></thead><tbody>
      <tr><th>Time</th>${pw.points.map(x => `<td>${esc(savedAt(p, 'prewarm', x.key) || '')}</td>`).join('')}</tr>
      ${pw.cols.map(c => `<tr><th>${c.label}</th>${pw.points.map(x => cell('prewarm', x, c)).join('')}</tr>`).join('')}</tbody></table></div>`}
    <h2>Intra-op temperature</h2><div class="scroll" tabindex="0"><table class="grid sheet"><thead><tr><th>From induction</th>${it.cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>
      ${it.points.map(x => `<tr><th>${x.key === 'base' ? 'Baseline' : x.key === 'end' ? 'End' : x.min}</th>${it.cols.map(c => cell('iotemp', x, c)).join('')}</tr>`).join('')}</tbody></table></div>
    <h2>Haemodynamics</h2><div class="scroll" tabindex="0"><table class="grid sheet"><thead><tr><th>From induction</th>${hd.cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>
      ${hd.points.map(x => `<tr><th>${x.key === 'base' ? 'Baseline' : x.key === 'end' ? 'End' : x.min}</th>${hd.cols.map(c => cell('haemo', x, c)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted small">Tap a cell to change that reading.</p>`);
});

// ---------- delete participants (from Settings; the only place patients are deleted)
route(/^\/delete$/, () => {
  header('Delete participants', '#/settings');
  const list = Object.values(patients).filter(p => !p.deleted).sort((a, b) => String(sid(a)).localeCompare(String(sid(b))));
  paint(`<p class="muted small">${sharing() ? `Deleting removes the participant from this phone and from your team’s phones.` : 'Deleting removes the participant from this phone.'} Tap Delete, then tap again to confirm.</p>
    ${list.length ? `<ul class="list dellist">${list.map(p => {
      const e = lastEdit(p);
      return `<li><div><b>${esc(sid(p))}${val(p, 'site') ? ` <small>${esc(val(p, 'site'))}</small>` : ''}</b><small>${esc(status(p))} · ${e ? 'last entry ' + new Date(e.t).toLocaleDateString([], { day: 'numeric', month: 'short' }) : 'no entries'}</small></div>
        ${p.lock?.on ? `<span class="muted small">${LOCK_ICON} Locked</span>` : `<button class="danger" data-del="${p.id}" aria-label="Delete ${esc(sid(p))}">Delete</button>`}</li>`;
    }).join('')}</ul>` : `<p class="muted">No participants on this phone.</p>`}`);
  view.onclick = e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const p = patients[b.dataset.del]; if (!p) return;
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again'; b.setAttribute('aria-label', 'Tap again to delete ' + sid(p)); return; }
    p.deleted = Date.now(); saveAll(); sync(p, []); toast(sid(p) + ' deleted'); render();
  };
  cleanup.push(() => { view.onclick = null; });
});

// ---------- form view: the study's Word form (uploaded once by an admin) filled in for this patient: download it,
// or show it and print / save as PDF. Without the Word form yet: a simple version of the day-of-surgery pages.
let blankCache = null;
async function blankForm() {
  if (blankCache) return blankCache;
  if (DEMO) { try { blankCache = JSON.parse(sessionStorage.getItem(NS + 'blank')); } catch { /* none */ } return blankCache; }
  if (!sharing()) return null;
  try { blankCache = await cloud.blankForm(); } catch { /* offline and never fetched */ }
  return blankCache;
}
function noBlankNote() {
  if (DEMO) return `<div class="note">Demo: this is a simple version. To see the study’s Word form filled in, choose its blank .docx (kept only in this browser tab).
    <label class="secondary filebtn">Choose the blank form<input type="file" id="blankfile" accept=".docx" hidden></label></div>`;
  if (shared.admin) return `<p class="note">This is a simple version. Upload the study’s blank Word form on the <a href="#/admin">admin screen</a> to fill in the real form.</p>`;
  if (sharing()) return `<p class="note">This is a simple version: your study admin hasn’t uploaded the blank Word form yet.</p>`;
  return `<p class="note">This is a simple version. <a href="#/settings">Join your hospital’s team</a> to fill in the study’s Word form.</p>`;
}
route(/^\/p\/(\w+)\/form$/, async id => {
  const p = patients[id]; if (!p) return go('#/');
  header(sid(p) + ' · Form view', '#/p/' + id);
  const here = location.hash, still = () => location.hash === here;
  paint(`<p class="muted">Loading the form…</p>`);
  const b = await blankForm();
  if (!still()) return;
  if (!b) {
    simpleForm(p, id, noBlankNote());
    const inp = $('#blankfile');
    if (inp) inp.onchange = async () => {
      try { const r = await wordview.prepareBlank(inp.files[0]); blankCache = { b64: r.b64, name: inp.files[0].name, setAt: Date.now() }; }
      catch (e) { toast(e.message); return; }
      try { sessionStorage.setItem(NS + 'blank', JSON.stringify(blankCache)); } catch { /* this visit only */ }
      render();
    };
    return;
  }
  paint(`<div class="noprint stack"><div class="sharerow"><button class="primary" id="dl" disabled>Download Word file</button><button class="secondary" id="print" disabled>Save as PDF / Print</button></div>
    <p class="muted small">The study’s data collection form, filled in. Pages with no data stay blank. To save a PDF, choose “Save as PDF” as the printer (iPhone: Share → Print).</p></div>
    <div id="doc" class="wordview"><p class="muted">Filling in the form…</p></div>`);
  let file;
  try { file = await wordview.filledDocx(b.b64, p); if (!still()) return; await wordview.show(file, $('#doc')); }
  catch (e) { if (still()) $('#doc').innerHTML = `<p class="note">Couldn’t open the form: ${esc(e.message)}</p>`; return; }
  if (!still()) return;
  $('#dl').disabled = $('#print').disabled = false;
  $('#dl').onclick = () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = `${sid(p)} data collection form.docx`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };
  $('#print').onclick = () => window.print();
  // the Word pages carry their own margins
  const pageStyle = document.createElement('style'); pageStyle.textContent = '@page { size: A4; margin: 0; }'; document.head.append(pageStyle);
  const refit = () => wordview.fit($('#doc'));
  addEventListener('resize', refit);
  cleanup.push(() => { pageStyle.remove(); removeEventListener('resize', refit); });
});
function simpleForm(p, id, note = '') {
  const v = k => val(p, k);
  const t = k => esc(v(k) ?? '');
  const box = on => on ? '☒' : '☐';
  const yn = k => `${box(String(v(k)) === '1')} Yes ${box(String(v(k)) === '0')} No`;
  const line = (k, unit = '') => `<span class="fill">${v(k) != null ? esc(v(k)) + (unit ? ' ' + unit : '') : ''}</span>`;
  const ifYes = (k, html) => String(v(k)) === '1' ? html : '';
  const day = (() => { const ts = Object.values(p.f).map(x => x.t).filter(Boolean); return ts.length ? new Date(Math.min(...ts)).toLocaleDateString('en-GB') : ''; })();
  const head = `<div class="fhead"><span>Subject ID: <b>${esc(sid(p))}</b></span><span>Date of entry: <b>${day}</b></span></div>`;
  const foot = pg => `<div class="ffoot">Name / Signature / Date: <b>${t('sign_' + pg) || '&nbsp;'}</b></div>`;
  const row = (label, html) => `<tr><th>${label}</th><td>${html}</td></tr>`;
  const pw = SERIES.prewarm, it = SERIES.iotemp, hd = SERIES.haemo;
  const cell = (s, pt, c) => { const x = v(`${s}_${pt.key}_${c.key}`); return `<td>${x == null ? '' : esc(c.key === 'ts' && x > 0 ? '+' + x : c.type === 'code' && s === 'iotemp' ? (String(x) === '1' ? 'Y' : 'N') : x)}</td>`; };
  const arm = String(v('arm'));
  const ix = (() => { try { return JSON.parse(v('io_ix_rows')) || []; } catch { return []; } })();
  const comfort = k => BY_ID.sat_pre.opts.map(([o, l]) => `${box(String(v(k)) === String(o))} ${l}`).join('<br>');
  paint(`${note}<div class="noprint stack"><button class="primary big" id="print">Save as PDF / Print</button>
    <p class="muted small">Opens the phone’s print screen: choose “Save as PDF” as the printer (on iPhone: Share → Print, then share the preview).</p></div>
  <div class="form">
  <section class="fpage" tabindex="0" aria-label="Pre-operative intervention page">${head}
    <h3>PRE-OPERATIVE (INTERVENTION)</h3>
    <h4>RANDOMISATION</h4>
    <p>${box(arm === '1')} 30-minute prewarming &nbsp; ${box(arm === '2')} 10-minute prewarming &nbsp; ${box(arm === '3')} No prewarming</p>
    <h4>INTERVENTION DETAILS</h4>
    <table class="ftable kv">${row('Time that gown was put on', line('pw_gown') + ' (24 hour clock)')}
      ${row('Start time of active warming', (v('pw_start') && v('pw_start') !== 'NA' ? line('pw_start') : '<span class="fill"></span>') + ' (24 hour clock)<br>' + box(arm === '3' || v('pw_start') === 'NA') + ' Not applicable, patient is in no prewarming group')}
      ${row('Active warming stopped', line('ev_wstop'))}</table>
    <p class="fcap">Temperature every 5 minutes</p>
    <div class="scroll" tabindex="0"><table class="ftable grid5"><thead><tr><th>Time (min)</th>${pw.points.map(x => `<th>${x.min}</th>`).join('')}</tr></thead><tbody>
      <tr><th>Time (00:00)</th>${pw.points.map(x => `<td>${esc(v('at_prewarm_' + x.key) || '')}</td>`).join('')}</tr>
      ${pw.cols.map(c => `<tr><th>${c.key === 'set' ? 'Set temp on gown*' : c.label}</th>${pw.points.map(x => cell('prewarm', x, c)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="fsmall">*“NA” if patient is in control group OR active warming has been terminated. Thermal sensation: −3 cold … 0 neutral … +3 hot.</p>
    ${foot('prewarm')}</section>

  <section class="fpage" tabindex="0" aria-label="Intraoperative page">${head}
    <h3>INTRAOPERATIVE</h3>
    <h4>SURGERY DETAILS</h4>
    <table class="ftable kv">${row('Time that patient was flipped', line('io_flip'))}${row('Knife-to-skin start time (Induction)', line('io_knife'))}
      ${row('Start time of underbody Bair Hugger', line('io_under_start'))}${row('Start time of intraoperative gown Bair Hugger', line('io_gown_start'))}
      ${row('Surgery completion time (Post-extubation)', line('io_done'))}</table>
    <h4>ANAESTHESIA DETAILS</h4>
    <table class="ftable kv">${row('Anaesthesia technique', `${box(v('io_tech') === 'Inhalational')} GA (Inhalational)<br>${box(v('io_tech') === 'TIVA')} GA (TIVA)`)}
      ${row('Blood loss', line('io_ebl', 'ml'))}
      ${row('Transfusion', `<table class="ftable inner"><tr><th></th><th>RBC</th><th>Platelets</th><th>FFP</th><th>Cryo</th></tr>
        <tr><th>Units</th>${['rbc', 'plt', 'ffp', 'cryo'].map(k => `<td>${t('io_' + k)}</td>`).join('')}</tr>
        <tr><th>Volume (ml)</th>${['rbc', 'plt', 'ffp', 'cryo'].map(k => `<td>${t('io_' + k + '_ml')}</td>`).join('')}</tr></table>`)}
      ${row('Cell Saver', yn('io_cs') + ifYes('io_cs', `<br>Volume in cell saver: ${line('io_cs_vol', 'ml')}<br>Volume retransfused: ${line('io_cs_ret', 'ml')}`))}
      ${row('Prothrombin Complex Concentrate', yn('io_pcc') + ifYes('io_pcc', ` (dose: ${line('io_pcc_dose')})`))}
      ${row('Tranexamic Acid', yn('io_txa') + ifYes('io_txa', `<br>Bolus: ${line('io_txa_bolus', 'mg')}<br>Infusion: ${line('io_txa_inf', 'mg')}<br>Total: ${line('io_txa_total', 'mg')}`))}
      ${row('Fibrinogen', yn('io_fib') + ifYes('io_fib', ` (dose: ${line('io_fib_dose')})`))}</table>
    <p class="fcap">Intraoperative Investigations</p>
    <table class="ftable"><tr>${IX_COLS.map(([, l]) => `<th>${l}${l === 'Hb' ? '*' : ''}</th>`).join('')}</tr>
      ${(ix.length ? ix : [{}, {}]).map(r => `<tr>${IX_COLS.map(([k]) => `<td>${esc(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</table>
    <p class="fsmall">*If only Hct is available, chart Hb as Hct/3</p>
    ${foot('intraop')}</section>

  <section class="fpage" tabindex="0" aria-label="Intraoperative readings page">${head}
    <h3>INTRAOPERATIVE READINGS</h3>
    <p class="fcap">Temperature every 5 minutes for the first 60 minutes, then every 15 minutes after</p>
    <div class="scroll" tabindex="0"><table class="ftable"><thead><tr><th>Time from induction</th>${it.cols.map(c => `<th>${c.label}${c.unit ? ' ' + c.unit : c.type === 'code' ? ' Y/N' : ''}</th>`).join('')}</tr></thead><tbody>
      ${it.points.map(x => `<tr><th>${x.key === 'base' ? 'Baseline' : x.key === 'end' ? 'End of Surgery (post extubation)' : x.min}</th>${it.cols.map(c => cell('iotemp', x, c)).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="fcap">Hemodynamics to be collected every 15 minutes</p>
    <div class="scroll" tabindex="0"><table class="ftable"><thead><tr><th>Time from induction</th>${hd.cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead><tbody>
      ${hd.points.filter(x => x.key === 'base' || v('at_haemo_' + x.key)).map(x => `<tr><th>${x.key === 'base' ? 'Baseline' : x.key === 'end' ? 'End of Surgery' : x.min}</th>${hd.cols.map(c => cell('haemo', x, c)).join('')}</tr>`).join('')}</tbody></table></div>
    ${foot('iotemp')}</section>

  <section class="fpage" tabindex="0" aria-label="PACU page">${head}
    <h3>POSTOPERATIVE (PACU)</h3>
    <h4>PACU DETAILS AND COMPLICATIONS</h4>
    <table class="ftable kv">${row('Time of PACU arrival', line('pacu_in'))}${row('Temperature on PACU arrival', line('pacu_temp', '°C'))}
      ${row('Shivering', yn('pacu_shiver'))}${row('Nausea and Vomiting', yn('pacu_ponv'))}
      ${row('Hypotension<br><small>(Systolic BP either &gt;20% below preoperative systolic BP or below 90 mmHg for &gt; 5 minutes)</small>', yn('pacu_hypot'))}
      ${row('Need for Transfusion in PACU', yn('pacu_tx'))}${row('Highest Pain Score<br><small>(Based on 11-point NRS score)</small>', line('pacu_pain'))}
      ${row('NuDESC Score', line('pacu_nudesc'))}${row('Time of Transfer from PACU to Ward', line('pacu_out'))}
      ${row('Delay in PACU Discharge', yn('pacu_delay') + ifYes('pacu_delay', `<br>If yes, is delay for more than 1 hour? ${yn('pacu_delay1h')}` + ifYes('pacu_delay1h', `<br>Reason: ${line('pacu_delay_why')}`)))}</table>
    <h4>PATIENT SATISFACTION FEEDBACK</h4>
    <table class="ftable kv">${row('Were you comfortable in the preoperative period?', comfort('sat_pre'))}${row('Were you comfortable in the postoperative period?', comfort('sat_post'))}</table>
    ${foot('pacu')}</section>
  </div>`);
  $('#print').onclick = () => window.print();
}

// ---------- settings
route(/^\/settings$/, () => {
  header('Settings', '#/');
  const tog = (grp, k, l, d = '') => `<label class="tog"><input type="checkbox" data-g="${grp}" data-k="${k}" ${grp === 'hide' ? (settings.hide[k] ? '' : 'checked') : settings[grp][k] ? 'checked' : ''}><span>${l}${d ? `<small>${d}</small>` : ''}</span></label>`;
  paint(`<div class="stack">
    <label class="lab" for="me">Your initials</label><input id="me" value="${esc(settings.me)}" maxlength="6" autocapitalize="characters" autocomplete="off">
    <small class="muted">Saved with each reading as “entered by”.</small>
    <h2>Screen size</h2>
    <div class="seg sizes" role="group" aria-label="Screen size">${SIZES.map(([k, l]) => `<button type="button" class="chip" data-zoom="${k}" aria-pressed="${String(settings.zoom || '1') === k}">${l}</button>`).join('')}</div>
    <small class="muted">Makes text and buttons bigger or smaller on this phone.</small>
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
    <button class="secondary" id="test">Test the alert</button>
    <h2>Export</h2>
    <a class="secondary" href="#/export">Export Excel</a>
    <h2>Participants</h2>
    <a class="secondary" href="#/delete">Delete participants</a></div>`);
  view.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => {
    settings.zoom = b.dataset.zoom; saveSettings(); applySize(settings.zoom);
    view.querySelectorAll('[data-zoom]').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  view.querySelectorAll('[data-site]').forEach(b => b.onclick = () => { if (shared.member) return; settings.site = settings.site === b.dataset.site ? '' : b.dataset.site; saveSettings(); render(); });
  $('#me').onchange = e => { settings.me = e.target.value.trim().toUpperCase(); saveSettings(); if (shared.member) cloud.setInitials(settings.me).catch(() => {}); toast('Saved'); };
  $('#join')?.addEventListener('click', async e => {
    const code = $('#code').value.trim().toUpperCase();
    if (!code) return toast('Enter the join code.');
    // codes start with their hospital: NTF-XXXXXXXX
    const site = siteOfCode(code);
    if (!site) return toast('That isn’t a join code. It starts with the hospital, e.g. NTF-.');
    await joinTeam(site, code, e.target);
    render();
  });
  $('#leave')?.addEventListener('click', e => logOut(e.target));
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
  const chips = `<div class="seg sites">${SITES.map(x => `<button type="button" class="chip" data-site="${x}" aria-pressed="${settings.site === x}" ${shared.member ? 'disabled' : ''}>${x}</button>`).join('')}</div>`;
  if (!cloud.enabled) return `${chips}<small class="muted">New patients on this phone are recorded at this hospital. Sharing is off in demo mode.</small>`;
  if (shared.email && !shared.admin) return `<p class="note">${esc(shared.email)} isn’t on the study’s admin list. Ask the owner to add it.</p><button class="secondary" id="leave">Log out</button>`;
  if (shared.admin) return `<p class="ok-box">Signed in as study admin (${esc(shared.email)}). You see every hospital’s patients.<br><span class="syncline">${esc(syncText())}</span></p>
    <a class="secondary" href="#/admin">Join codes and members</a><button class="secondary" id="leave">Log out</button>`;
  if (shared.member) return `<p class="ok-box">Sharing with the ${esc(shared.member.site)} team. Readings sync when there is signal.<br><span class="syncline">${esc(syncText())}</span></p><button class="secondary" id="leave">Log out</button>
    <small class="muted">Logging out deletes every patient on this phone (it warns first, and again if something hasn’t synced).</small>`;
  return `<label class="lab" for="code">Join code</label><input id="code" autocomplete="off" autocapitalize="characters" placeholder="e.g. NTF-…">
    <small class="muted">From a study admin, or just open the join link they sent. The code says which hospital. Joining shares this phone’s patients with that hospital’s team.</small>
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

const siteOfCode = code => SITES.find(x => code.startsWith(x + '-')) || null;
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
  let codes = {}, people = [], bf = null;
  try { [codes, people, bf] = await Promise.all([cloud.codes(), cloud.members(), cloud.blankForm()]); } catch (e) { paint(`<p class="note">${esc(cloud.friendly(e))}</p>`); return; }
  paint(`<div class="stack">

    <p class="muted small">Send each hospital’s team its join link (or show the QR code): it opens the app ready to join, no typing. Share it only with that team. A new code makes old links stop working for new phones; phones already in stay in.</p>
    ${SITES.map(x => {
      const who = people.filter(m => m.site === x);
      return `<div class="fld"><b>${x}</b>
        <div class="coderow">${codes[x] ? `<button class="codebig" data-copy="${esc(codes[x].code)}" aria-label="Copy the ${x} join code">${esc(codes[x].code)}<small>tap to copy</small></button>` : '<span class="muted">no code yet</span>'}<button class="${codes[x] ? 'link' : 'secondary'}" data-newcode="${x}">${codes[x] ? 'New code' : 'Make code'}</button></div>
        ${codes[x] ? `<div class="sharerow"><button class="primary" data-share="${x}">Share join link</button><button class="secondary" data-qr="${x}">QR code</button></div><div class="qr" id="qr-${x}" hidden></div>` : ''}
        ${who.length ? `<ul class="plain">${who.map(m => `<li>${esc(m.initials || '—')} <small class="muted">joined ${new Date(m.joinedAt).toLocaleDateString()}</small> <button class="link" data-rm="${m.uid}">Remove</button></li>`).join('')}</ul>` : '<small class="muted">No phones yet</small>'}</div>`;
    }).join('')}
    <div class="fld"><b>Blank data collection form</b>
      <small class="muted">${bf ? `${esc(bf.name)}, uploaded ${new Date(bf.setAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} by ${esc(bf.setBy)}.` : 'Not uploaded yet.'} The Form view fills this Word file in for each patient; teams can download it or save it as a PDF. Its file details (author, editor, company) are removed on upload.</small>
      <label class="secondary filebtn">${bf ? 'Replace' : 'Upload'} the blank form (.docx)<input type="file" id="blankup" accept=".docx" hidden></label></div></div>`);
  $('#blankup').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    let r;
    try { r = await wordview.prepareBlank(f); } catch (err) { toast(err.message); return; }
    if (r.missed.length && !confirm(`${r.missed.length} place(s) didn’t match the v3.2 form and will stay blank:\n${r.missed.slice(0, 12).join('\n')}${r.missed.length > 12 ? '\n…' : ''}\n\nUpload anyway?`)) return;
    try { await cloud.setBlankForm(r.b64, f.name, r.size); blankCache = null; toast('Blank form saved'); render(); }
    catch (err) { toast(cloud.friendly(err)); }
  };
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
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Code copied'); } catch { prompt('Copy this join code', cp.dataset.copy); }
      return;
    }
    const nc = e.target.closest('[data-newcode]');
    if (nc && codes[nc.dataset.newcode] && !confirm(`Make a new join code for ${nc.dataset.newcode}?\n\nThe current code, its join link and QR code stop working: phones that haven’t joined yet need the new link.\n\nPhones already in the ${nc.dataset.newcode} team stay in. To take a phone out, use Remove under the members.`)) return;
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
  header('Export', '#/settings');
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
  // reload only when an update takes over, not when the first install claims the page (that wiped a half-filled form)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
}

render();
