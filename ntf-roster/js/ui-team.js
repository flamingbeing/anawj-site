// NTF Roster: the Team sharing panel (inside More). Sign in with Google, see your role, Save to team (the staff list,
// rules, codes and settings, plus the month on screen), Load from team, who saved last and when, a prompt when
// someone else saved first, and for admins the members list and people asking to join.
// Off (a short note instead) until js/firebase-config.js is filled in, and always off in practice mode (?demo).
import * as cloud from './cloud.js';

// The team copy's updatedAt this browser last loaded or saved, per device (not part of the roster):
// { team: ms | null, months: { 'YYYY-MM': ms } }. A save that finds a different updatedAt there stops (conflict).
const SEEN_KEY = 'ntf-roster-team-seen';
const ROLE_LABEL = { admin: 'Admin', rosterer: 'Rosterer', viewer: 'Viewer' };
const ROLE_HELP = {
  admin: 'You can save and load the roster, and add or remove members.',
  rosterer: 'You can save and load the roster.',
  viewer: 'You can load the roster; an admin can let you save it.',
};

function readSeen() {
  try {
    const s = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null');
    if (s && typeof s === 'object') return { team: s.team ?? null, months: (s.months && typeof s.months === 'object') ? s.months : {} };
  } catch { /* private window or damaged: start fresh */ }
  return { team: null, months: {} };
}
function writeSeen(s) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

function when(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
// the name is whatever the saver's account says; the email is checked by the rules, so show it too
const byName = b => (b ? (b.name && b.email && b.name !== b.email ? `${b.name} (${b.email})` : b.email || b.name) : '') || 'someone';

export function mountTeam(el, app) {
  const h = app.h;
  const M = app.model;
  const fmtMonth = m => (M && M.fmtMonth ? M.fmtMonth(m) : m);
  const root = h('div', { class: 'team' });
  el.append(root);
  const note = text => root.append(h('p', { class: 'team-p' }, text));

  if (cloud.isDemo || (app.store && app.store.isDemo)) {
    note('Team sharing is off in the practice department: nothing here is signed in or shared.');
    return { update() {}, unmount() {} };
  }
  if (!cloud.enabled) {
    note("Team sharing isn't switched on yet: until then this roster lives in this browser; use Backup to move it.");
    return { update() {}, unmount() {} };
  }

  let alive = true, unwatch = null;
  let user = null, member, request = null, status = null, members = null, requests = null;
  let busy = '', month = app.month, ready = false;

  const toastErr = e => app.toast(cloud.friendly(e), { kind: 'error' });
  const btn = (label, fn, cls = 'btn btn-ghost') => h('button', { type: 'button', class: cls, disabled: !!busy, onclick: fn }, label);

  async function refresh() {
    if (!alive) return;
    if (!user) { member = null; render(); return; }
    member = undefined; render();
    try {
      member = await cloud.myMember();
      if (!member) {
        request = await cloud.myAccessRequest().catch(() => null);
      } else {
        status = await cloud.lastSaved(month).catch(e => { console.warn(e); return null; });
        if (member.role === 'admin') {
          [members, requests] = await Promise.all([cloud.listMembers(), cloud.listAccessRequests()]);
        } else { members = null; requests = null; }
      }
    } catch (e) {
      console.warn(e);
      member = null;
      toastErr(e);
    }
    if (alive) render();
  }

  async function work(label, fn) {
    if (busy) return;
    busy = label; render();
    try { await fn(); } catch (e) {
      if (e instanceof cloud.Conflict) conflictPrompt(e); else toastErr(e);
    } finally { busy = ''; if (alive) render(); }
  }

  // ---- actions ----

  const signIn = () => work('Signing in…', async () => { await cloud.signIn(); });
  const signOut = () => work('Signing out…', async () => { await cloud.signOut(); });

  function save(force = false) {
    return work('Saving…', async () => {
      const st = app.store.get(), m = month, seen = readSeen();
      const { cells, meta } = cloud.pickMonth(st, m);
      const { at, by } = await cloud.saveAll({ team: st, month: { m, cells, meta } },
        { teamAt: seen.team, monthAt: seen.months[m] ?? null, force });
      seen.team = at; seen.months[m] = at; writeSeen(seen);
      status = { team: { updatedAt: at, updatedBy: by }, month: { updatedAt: at, updatedBy: by } };
      app.toast(`Saved to the team: the staff list, rules and ${fmtMonth(m)}.`);
    });
  }

  async function load() {
    const m = month;
    const ok = await app.confirm(`Load the team's copy? It replaces the staff list, rules, duty codes, settings and ${fmtMonth(m)} in this browser. Other months stay as they are. Undo brings yours back.`, { ok: 'Load from team' });
    if (!ok) return;
    return work('Loading…', async () => {
      const [t, mo] = await Promise.all([cloud.loadTeam(), cloud.loadMonth(m)]);
      if (!t && !mo) { app.toast('Nothing has been saved to the team yet.', { kind: 'warn' }); return; }
      let next = app.store.get();
      if (t) next = cloud.mergeTeam(next, t);
      if (mo) next = cloud.mergeMonth(next, m, mo);
      app.store.replace(next, 'Load from team');
      const seen = readSeen();
      if (t) seen.team = t.updatedAt ?? null;
      if (mo) seen.months[m] = mo.updatedAt ?? null;
      writeSeen(seen);
      status = { team: t ? { updatedAt: t.updatedAt, updatedBy: t.updatedBy } : null, month: mo ? { updatedAt: mo.updatedAt, updatedBy: mo.updatedBy } : null };
      app.toast(mo ? `Loaded the team's copy and ${fmtMonth(m)}.` : `Loaded the team's copy. ${fmtMonth(m)} isn't on the team yet, so yours is kept.`,
        { action: { label: 'Undo', fn: () => app.store.undo() } });
    });
  }

  function conflictPrompt(e) {
    const what = e.what === 'team' ? 'the staff list and rules' : fmtMonth(e.month);
    app.sheet({
      title: 'Someone else saved first',
      body: h('div', { class: 'team' },
        h('p', { class: 'team-p' }, `${byName(e.current && e.current.updatedBy)} saved ${what} to the team ${when(e.current && e.current.updatedAt)}, after this browser last loaded or saved it.`),
        h('p', { class: 'team-p' }, 'Load theirs to see it first (undo brings yours back), or save yours over it. Their save stays in the team history either way.')),
      actions: [
        { label: 'Cancel' },
        { label: 'Load theirs', fn: () => { load(); } },
        { label: 'Save mine anyway', danger: true, fn: () => { save(true); } },
      ],
    });
  }

  function askToJoin(name) {
    return work('Sending…', async () => {
      request = await cloud.requestAccess(name);
      app.toast('Asked to join. An admin will add you.');
    });
  }

  function setRole(m, role) {
    return work('Saving…', async () => {
      await cloud.setMember(m.email, role, m.name || '', m.staffId || '');
      members = await cloud.listMembers();
      app.toast(`${m.name || m.email} is now ${ROLE_LABEL[role].toLowerCase()}.`);
    });
  }

  async function remove(m) {
    const ok = await app.confirm(`Remove ${m.name || m.email} from the team? They will no longer see the roster.`, { ok: 'Remove', danger: true });
    if (!ok) return;
    return work('Removing…', async () => {
      await cloud.removeMember(m.email);
      members = await cloud.listMembers();
      app.toast(`Removed ${m.name || m.email}.`);
    });
  }

  function add(email, name, role) {
    return work('Adding…', async () => {
      const m = await cloud.setMember(email, role, name);
      if ((requests || []).some(r => r.email === m.email)) await cloud.deleteAccessRequest(m.email);
      [members, requests] = await Promise.all([cloud.listMembers(), cloud.listAccessRequests()]);
      app.toast(`Added ${name || m.email} as ${ROLE_LABEL[role].toLowerCase()}.`);
    });
  }

  function dismiss(r) {
    return work('Removing…', async () => {
      await cloud.deleteAccessRequest(r.email);
      requests = await cloud.listAccessRequests();
    });
  }

  // ---- drawing ----

  function render() {
    if (!alive) return;
    root.textContent = '';
    if (!ready) { note('Checking sign-in…'); return; }
    if (!user) {
      note('Sign in with your Google account to share this roster with the team: save it for others to see, and load what they saved.');
      root.append(h('div', { class: 'team-row' }, btn(busy || 'Sign in with Google', signIn, 'btn btn-primary')));
      return;
    }
    const email = (user.email || '').toLowerCase();
    const signOutBtn = btn('Sign out', signOut, 'btn btn-ghost btn-sm');
    if (member === undefined) {
      root.append(h('p', { class: 'team-p' }, 'Signed in as ', h('strong', null, email), '. Checking your access…'));
      return;
    }
    if (!member) { renderOutsider(email, signOutBtn); return; }

    const role = ROLE_LABEL[member.role] ? member.role : 'viewer';
    root.append(
      h('div', { class: 'team-row' },
        h('span', null, 'Signed in as ', h('strong', null, email)),
        h('span', { class: 'team-role', 'data-role': role }, ROLE_LABEL[member.role] || `${member.role || 'no role'} (reads only)`),
        signOutBtn),
      h('p', { class: 'team-p' }, ROLE_HELP[role]));

    // who saved last and when, and whether this browser has that copy
    const seen = readSeen();
    const line = (label, meta, seenAt, none) => {
      if (!meta || !meta.updatedAt) return h('li', null, `${label}: ${none}`);
      const fresh = seenAt === meta.updatedAt;
      return h('li', null, `${label}: saved by ${byName(meta.updatedBy)}, ${when(meta.updatedAt)}. `,
        fresh ? h('span', { class: 'team-p' }, '(the copy in this browser)')
          : h('span', { class: 'team-new' }, seenAt == null ? 'Not loaded in this browser yet.' : 'Newer than the copy in this browser.'));
    };
    root.append(h('ul', { class: 'team-status', 'aria-label': 'Team copy' },
      status ? [
        line('Staff list, rules and settings', status.team, seen.team, 'not saved to the team yet.'),
        line(fmtMonth(month), status.month, seen.months[month] ?? null, 'not saved to the team yet.'),
      ] : h('li', { class: 'team-p' }, 'Could not check the team copy just now.')));

    const editor = cloud.canEdit(member);
    root.append(h('div', { class: 'team-row' },
      editor ? btn(busy === 'Saving…' ? busy : 'Save to team', () => save(false), 'btn btn-primary') : null,
      btn(busy === 'Loading…' ? busy : 'Load from team', load),
      btn('Refresh', () => refresh(), 'btn btn-ghost btn-sm')));
    root.append(h('p', { class: 'team-p' }, editor
      ? `Save to team sends the staff list, rules, duty codes, settings and ${fmtMonth(month)}; change month to save another.`
      : `Load from team brings in the staff list, rules and ${fmtMonth(month)}.`));

    if (member.role === 'admin') renderAdmin(email);
  }

  function renderOutsider(email, signOutBtn) {
    root.append(h('div', { class: 'team-row' }, h('span', null, 'Signed in as ', h('strong', null, email)), signOutBtn));
    note("This account isn't on the team yet. Ask to join, and an admin can add you.");
    if (request) note(`You asked on ${when(request.requestedAt)}${request.name ? ` as ${request.name}` : ''}. An admin will add you; you can ask again to change your name.`);
    const nameIn = h('input', { type: 'text', id: 'team-ask-name', maxlength: '100', autocomplete: 'name', value: (request && request.name) || user.displayName || '' });
    root.append(h('div', { class: 'team-row' },
      h('label', { for: 'team-ask-name' }, 'Your name'), nameIn,
      btn(busy === 'Sending…' ? busy : (request ? 'Ask again' : 'Ask to join'), () => askToJoin(nameIn.value.trim()), 'btn btn-primary')));
  }

  function renderAdmin(myEmail) {
    root.append(h('h3', { class: 'team-h' }, 'Members'));
    if (!members) { note('Could not load the members list.'); }
    else {
      root.append(h('ul', { class: 'team-list', 'aria-label': 'Members' }, members.map(m => {
        const self = m.email === myEmail;
        const id = 'team-role-' + m.email.replace(/[^a-z0-9]/g, '-');
        const sel = h('select', { id, disabled: self || !!busy, title: self ? "You can't change your own role" : null, onchange: e => setRole(m, e.target.value) },
          cloud.ROLES.map(r => h('option', { value: r, selected: m.role === r }, ROLE_LABEL[r])));
        return h('li', { class: 'team-item' },
          h('span', { class: 'team-who' }, m.name || m.email, m.name ? h('small', null, m.email) : null, self ? h('small', null, 'You') : null),
          h('label', { for: id, class: 'sr-only' }, `Role for ${m.name || m.email}`), sel,
          self ? null : btn('Remove', () => remove(m), 'btn btn-danger-ghost btn-sm'));
      })));
    }

    const em = h('input', { type: 'email', id: 'team-add-email', autocomplete: 'off', placeholder: 'name@example.com' });
    const nm = h('input', { type: 'text', id: 'team-add-name', maxlength: '100', autocomplete: 'off' });
    const rl = h('select', { id: 'team-add-role' }, cloud.ROLES.map(r => h('option', { value: r, selected: r === 'viewer' }, ROLE_LABEL[r])));
    root.append(h('form', { class: 'team-add', 'aria-label': 'Add a member', onsubmit: e => { e.preventDefault(); if (em.value.trim()) add(em.value.trim(), nm.value.trim(), rl.value); } },
      h('label', null, 'Google account email', em),
      h('label', null, 'Name', nm),
      h('label', null, 'Role', rl),
      h('button', { type: 'submit', class: 'btn btn-ghost', disabled: !!busy }, 'Add member')));

    root.append(h('h3', { class: 'team-h' }, 'Asking to join'));
    if (!requests || !requests.length) { note('Nobody is waiting.'); return; }
    root.append(h('ul', { class: 'team-list', 'aria-label': 'Asking to join' }, requests.map(r => h('li', { class: 'team-item' },
      h('span', { class: 'team-who' }, r.name || r.email, h('small', null, `${r.email}, asked ${when(r.requestedAt)}`)),
      btn('Add as viewer', () => add(r.email, r.name || '', 'viewer'), 'btn btn-ghost btn-sm'),
      btn('Add as rosterer', () => add(r.email, r.name || '', 'rosterer'), 'btn btn-ghost btn-sm'),
      btn('Dismiss', () => dismiss(r), 'btn btn-danger-ghost btn-sm')))));
  }

  render();
  cloud.watchUser(u => { ready = true; user = u; status = null; members = null; requests = null; request = null; refresh(); })
    .then(fn => { unwatch = fn; if (!alive && fn) fn(); })
    .catch(e => { ready = true; console.warn(e); root.textContent = ''; note('Team sharing could not start: ' + cloud.friendly(e)); });

  return {
    update() {
      // a new month on screen: show its team status
      if (app.month !== month) { month = app.month; if (member) refresh(); }
    },
    unmount() { alive = false; if (typeof unwatch === 'function') unwatch(); },
  };
}
