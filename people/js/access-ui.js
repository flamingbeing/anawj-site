// APMES People › Access: who holds which role, the access log, adding people by pasting names or emails, and ticking
// core faculty and CCC members on the faculty list. Logic is in access.js (unit-tested); saving goes through evals' cloud.js
// (the rules are in logbook/firestore.rules). Admin staff, PCs and owners change roles; PDs may look.

import { S, h, fill, toast, cloud, modal, confirmBox, avatar, icon, errText, fmtAgo } from '../../evals/js/ui-core.js';
import { field, input, cleanEmail, validEmail } from '../../evals/js/ui-admin.js';
import { ROLES, roleLabel, cleanRoles, mayChange, changeText, parseAccessPaste } from './access.js';

const actor = () => ({ owner: !!S.roles.owner, admin: !!S.roles.admin });
const mayEdit = () => !!(S.roles.admin || S.roles.owner);
const matches = (q, ...vals) => !q || vals.some(v => String(v || '').toLowerCase().includes(q.toLowerCase()));
const roleChip = r => h('span', { class: 'e-tag' }, roleLabel(r));

// everyone the lists know, for matching pasted lines (sign-in email, work email or name)
function knownPeople({ access, fac, res, pds }) {
  const out = [];
  const seen = new Set();
  const add = (email, name, workEmail) => { const e = String(email || '').toLowerCase(); if (!e || seen.has(e)) return; seen.add(e); out.push({ email: e, name, workEmail }); };
  for (const a of access) add(a.email, a.name);
  for (const f of fac) add(f.email, f.name, f.workEmail);
  for (const p of pds) add(p.email, p.name);
  for (const r of res) add(r.email, r.name);
  return out;
}

export function accessScreen({ access, log, fac, res, pds, reload }) {
  const edit = mayEdit();
  const me = (S.user?.email || '').toLowerCase();
  const list = h('div', { class: 'e-list' });
  let q = '';

  const paint = () => {
    const rows = access.filter(a => matches(q, a.name, a.email, rolesLabel(a.roles)));
    const body = r => [avatar(r.name || r.email),
      h('span', { class: 'e-row__body' }, h('span', { class: 'e-row__title' }, r.name || '(no name)'), h('span', { class: 'e-row__meta' }, r.email)),
      ...cleanRoles(r.roles).map(roleChip)];
    fill(list, rows.length
      ? rows.map(r => edit
        ? h('button', { type: 'button', class: 'e-row', onclick: () => editAccess(r) }, ...body(r), icon('edit', 'e-row__chev'))
        : h('div', { class: 'e-row e-row--static' }, ...body(r)))
      : h('p', { class: 'e-small', style: 'padding:12px 16px;margin:0' }, q ? 'No match.' : 'Nobody has a role here yet.'));
  };
  const rolesLabel = roles => cleanRoles(roles).map(roleLabel).join(' ');

  function editAccess(rec) {
    const old = cleanRoles(rec?.roles);
    const name = input({ value: rec?.name || '', autocomplete: 'off', required: true });
    const email = input({ type: 'email', value: rec?.email || '', readonly: rec ? true : null, required: true, autocapitalize: 'off', spellcheck: 'false' });
    const boxes = ROLES.filter(([k]) => k !== 'owner' || S.roles.owner || old.includes('owner')).map(([k, label]) => {
      const box = h('input', { type: 'checkbox', id: 'acc-' + k, value: k, checked: old.includes(k), disabled: k === 'owner' && !S.roles.owner ? true : null });
      return h('div', { class: 'e-check' }, box, h('label', { for: 'acc-' + k }, label));
    });
    const msg = h('p', { class: 'e-alert', hidden: true, role: 'alert' });
    const say = t => { msg.hidden = false; msg.textContent = t; };
    const chosen = () => boxes.map(b => b.firstChild).filter(b => b.checked).map(b => b.value);
    const remove = async () => {
      const em = cleanEmail(email.value);
      const ok = mayChange({ actor: actor(), actorEmail: me, targetEmail: em, oldRoles: old, newRoles: [], removing: true });
      if (!ok.ok) return say(ok.why);
      if (!await confirmBox('Remove all roles?', `${rec.name || em} loses ${old.map(roleLabel).join(', ')}.`, 'Remove', true)) return;
      try { await cloud.removeAccess(em, changeText(old, [], true)); m.close(); toast('Removed'); reload(); } catch (e) { say('Couldn’t remove. ' + errText(e)); }
    };
    const m = modal(rec ? 'Edit roles' : 'Add a person', h('form', { onsubmit: async e => {
      e.preventDefault();
      const em = cleanEmail(email.value), nm = name.value.trim(), roles = chosen();
      const bad = !nm ? 'Enter a name.' : !validEmail(em) ? 'Enter a valid email.' : !roles.length ? 'Pick at least one role, or use Remove.' : null;
      if (bad) return say(bad);
      const ok = mayChange({ actor: actor(), actorEmail: me, targetEmail: em, oldRoles: old, newRoles: roles });
      if (!ok.ok) return say(ok.why);
      try { await cloud.saveAccess({ email: em, name: nm, roles, change: changeText(old, roles) }); m.close(); toast(rec ? 'Saved' : `${nm} added`); reload(); }
      catch (e2) { say('Couldn’t save. ' + errText(e2)); }
    } },
      field('Name', name), field('Google account email', email), rec ? null : h('p', { class: 'e-hint' }, 'The email they sign in with.'),
      h('fieldset', { class: 'e-fieldset' }, h('legend', { class: 'e-small' }, 'Roles'), h('div', { class: 'e-checks' }, boxes)), msg,
      h('div', { class: 'e-actions' },
        rec ? h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: remove }, 'Remove') : null,
        h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'),
        h('button', { class: 'a-btn', type: 'submit' }, 'Save'))));
  }

  // Paste people (sign-in email, work email or name) to give them a role
  function pasteRoles() {
    const known = knownPeople({ access, fac, res, pds });
    const role = h('select', { class: 'e-select', 'aria-label': 'Role to give' },
      ROLES.filter(([k]) => k !== 'owner' || S.roles.owner).map(([k, label]) => h('option', { value: k, selected: k === 'pc' }, label)));
    const ta = h('textarea', { class: 'e-textarea', rows: 6, spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'People to give the role',
      placeholder: 'Dr Alex Example, alex.example@example.com\nsomeone@work.example\nLee Wong' });
    const out = h('ul', { class: 'e-paste-res', 'aria-live': 'polite' });
    const btn = h('button', { class: 'a-btn e-go', type: 'button', disabled: true }, 'Give role');
    let rows = [];
    const check = () => {
      rows = parseAccessPaste(ta.value, known).map(r => {
        if (r.problem || !r.email) return r;
        const rec = access.find(a => a.email === r.email);
        const old = cleanRoles(rec?.roles);
        if (old.includes(role.value)) return { ...r, skip: `already ${roleLabel(role.value)}` };
        const roles = cleanRoles([...old, role.value]);
        const ok = mayChange({ actor: actor(), actorEmail: me, targetEmail: r.email, oldRoles: old, newRoles: roles });
        return ok.ok ? { ...r, old, roles } : { ...r, problem: ok.why };
      });
      const good = rows.filter(r => !r.problem && !r.skip);
      fill(out, rows.map(r => h('li', { class: r.problem ? 'is-bad' : r.skip ? 'is-dup' : '' },
        r.problem ? `✗ ${r.line} — ${r.problem}` : r.skip ? `• ${r.name || r.email} — ${r.skip}, skipped` : `✓ ${r.name || r.email} · ${r.email} (found by ${r.how})`)));
      btn.disabled = !good.length;
      btn.textContent = good.length ? `Give role to ${good.length}` : 'Give role';
    };
    ta.addEventListener('input', check); role.addEventListener('change', check);
    btn.addEventListener('click', async () => {
      const good = rows.filter(r => !r.problem && !r.skip);
      if (!await confirmBox(`Give ${roleLabel(role.value)} to ${good.length} ${good.length === 1 ? 'person' : 'people'}?`, good.map(r => `${r.name || r.email} (${r.email})`).join('\n'), 'Give role')) return;
      btn.disabled = true;
      let ok = 0; const fails = [];
      for (const r of good) {
        try { await cloud.saveAccess({ email: r.email, name: r.name, roles: r.roles, change: changeText(r.old, r.roles) }); ok++; } catch (e) { fails.push(`${r.email}: ${errText(e)}`); }
      }
      m.close();
      toast(fails.length ? `Done for ${ok}; ${fails.length} failed (${fails[0]})` : `Done for ${ok}`);
      reload();
    });
    const m = modal('Give a role to several people', [
      h('p', { class: 'e-small' }, 'One per line: a name, an email, or both. People are found by their sign-in email, their NUHS work email or their name on the lists here; a new email needs a name too. Nothing is saved until you confirm.'),
      field('Role', role), ta, out,
      h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'), btn)]);
  }

  // Paste faculty to tick Core faculty or CCC member
  function pasteTicks() {
    const known = fac.map(f => ({ email: f.email, name: f.name, workEmail: f.workEmail }));
    const flag = h('select', { class: 'e-select', 'aria-label': 'Group to tick' }, h('option', { value: 'core' }, 'Core faculty'), h('option', { value: 'ccc' }, 'CCC members'));
    const ta = h('textarea', { class: 'e-textarea', rows: 6, spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Faculty to tick',
      placeholder: 'Dr Alex Example\nalex.example@work.example\nlee@example.com' });
    const out = h('ul', { class: 'e-paste-res', 'aria-live': 'polite' });
    const btn = h('button', { class: 'a-btn e-go', type: 'button', disabled: true }, 'Tick');
    let rows = [];
    const label = () => (flag.value === 'core' ? 'core faculty' : 'CCC member');
    const check = () => {
      rows = parseAccessPaste(ta.value, known).map(r => {
        if (r.problem) return r;
        const f = fac.find(x => x.email === r.email);
        if (!f) return { ...r, problem: 'Not on the faculty list: add them there first.' };
        if (f[flag.value]) return { ...r, skip: `already ${label()}` };
        return { ...r, f };
      });
      const good = rows.filter(r => !r.problem && !r.skip);
      fill(out, rows.map(r => h('li', { class: r.problem ? 'is-bad' : r.skip ? 'is-dup' : '' },
        r.problem ? `✗ ${r.line} — ${r.problem}` : r.skip ? `• ${r.name} — ${r.skip}, skipped` : `✓ ${r.f.name} · ${r.f.email} (found by ${r.how})`)));
      btn.disabled = !good.length;
      btn.textContent = good.length ? `Tick ${good.length}` : 'Tick';
    };
    ta.addEventListener('input', check); flag.addEventListener('change', check);
    btn.addEventListener('click', async () => {
      const good = rows.filter(r => !r.problem && !r.skip);
      if (!await confirmBox(`Tick ${good.length} as ${label()}?`, good.map(r => r.f.name).join('\n'), 'Tick')) return;
      btn.disabled = true;
      let ok = 0; const fails = [];
      for (const r of good) { try { await cloud.saveFaculty({ ...r.f, [flag.value]: true }); ok++; } catch (e) { fails.push(`${r.f.email}: ${errText(e)}`); } }
      m.close();
      toast(fails.length ? `Ticked ${ok}; ${fails.length} failed (${fails[0]})` : `Ticked ${ok}`);
      reload();
    });
    const m = modal('Tick core faculty or CCC members', [
      h('p', { class: 'e-small' }, 'One per line: a name or an email (sign-in or NUHS work email). Only people already on the faculty list are ticked; nobody is unticked. Nothing is saved until you confirm.'),
      field('Group', flag), ta, out,
      h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'), btn)]);
  }

  paint();
  const core = fac.filter(f => f.core).length, ccc = fac.filter(f => f.ccc).length;
  return h('div', { class: 'e-stack' },
    h('p', { class: 'e-small' }, 'Who can do what in the logbook, evals and People. Owners change anything; Admin staff and programme coordinators (PCs) give and remove Admin staff, PC and PD roles; PDs can look.',
      edit ? '' : ' Only owners, Admin staff and PCs change roles.'),
    edit ? h('div', { class: 'e-toolbar' },
      h('input', { class: 'e-input', type: 'search', placeholder: 'Search roles', 'aria-label': 'Search roles', oninput: e => { q = e.target.value; paint(); } }),
      h('button', { class: 'a-btn a-btn--sm e-btn-small', type: 'button', onclick: () => editAccess(null) }, icon('plus'), 'Add'),
      h('button', { class: 'a-btn a-btn--tinted a-btn--sm e-btn-quiet e-btn-small', type: 'button', onclick: pasteRoles }, 'Paste people'))
      : h('div', { class: 'e-toolbar' }, h('input', { class: 'e-input', type: 'search', placeholder: 'Search roles', 'aria-label': 'Search roles', oninput: e => { q = e.target.value; paint(); } })),
    h('p', { class: 'e-listhead' }, h('span', {}, `${access.length} ${access.length === 1 ? 'person' : 'people'} with roles kept here`)),
    h('div', { class: 'e-card e-card--flush' }, list),
    h('p', { class: 'e-small' }, 'Roles set up before this screen existed (the older lists) keep working; they will appear here when they are moved across.'),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h3' }, 'Core faculty and CCC members'),
      h('p', { class: 'e-small' }, `${core} core faculty · ${ccc} CCC members on the faculty list. Tick them one by one on the Faculty tab, or paste a list.`),
      h('div', { class: 'e-actions e-actions--start' }, h('button', { class: 'a-btn a-btn--sm e-btn-small', type: 'button', onclick: pasteTicks }, 'Paste a list to tick'))),
    log ? h('section', { class: 'e-card' },
      h('h2', { class: 'e-h3' }, 'Recent changes'),
      log.length ? h('ul', { class: 'p-plain' }, log.slice(0, 30).map(x => h('li', {}, `${x.by} → ${x.to}: ${x.change} · ${fmtAgo(x.at)}`)))
        : h('p', { class: 'e-small' }, 'No changes yet.')) : null);
}
