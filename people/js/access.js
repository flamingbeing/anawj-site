// APMES People › Access: who holds which role (owner, Admin staff, programme coordinator, PD). Pure logic, no page code
// (unit tests in test/access.test.mjs). The rules that enforce this are in logbook/firestore.rules ("access/"); `mayChange`
// mirrors them so the screen can say no before the server does.

export const ROLES = [['owner', 'Owner'], ['admin', 'Admin staff'], ['pc', 'Programme coordinator'], ['pd', 'Programme director'], ['selection', 'Applicants set-up']];
const LABEL = Object.fromEntries(ROLES);
export const roleLabel = r => LABEL[r] || r;
export const cleanRoles = list => { const s = new Set(Array.isArray(list) ? list : []); return ROLES.map(([k]) => k).filter(k => s.has(k)); };
export const rolesText = list => { const r = cleanRoles(list); return r.length ? r.map(roleLabel).join(', ') : 'No roles'; };

// May `actor` ({ owner, admin }: admin is true for Admin staff and PCs) set `targetEmail` to `newRoles`
// (or remove them, newRoles = [])? Same rules as access/ in logbook/firestore.rules.
export function mayChange({ actor, actorEmail, targetEmail, oldRoles = [], newRoles = [], removing = false }) {
  const self = String(actorEmail).toLowerCase() === String(targetEmail).toLowerCase();
  const had = cleanRoles(oldRoles).includes('owner'), has = cleanRoles(newRoles).includes('owner');
  if (actor?.owner) {
    if (self && removing) return { ok: false, why: 'You can’t remove yourself. Ask another owner.' };
    if (self && !has) return { ok: false, why: 'You can’t drop your own Owner role. Ask another owner.' };
    return { ok: true };
  }
  if (actor?.admin) {
    if (self) return { ok: false, why: 'Ask another admin to change your own roles.' };
    if (had || has) return { ok: false, why: 'Only an owner changes an Owner.' };
    return { ok: true };
  }
  return { ok: false, why: 'Only owners, Admin staff and programme coordinators change roles.' };
}

// One line for the access log
export function changeText(oldRoles, newRoles, removing = false) {
  if (removing) return `removed (was ${rolesText(oldRoles)})`.slice(0, 300);
  const o = cleanRoles(oldRoles), n = cleanRoles(newRoles);
  return (o.length ? `set to ${rolesText(n)} (was ${rolesText(o)})` : `added as ${rolesText(n)}`).slice(0, 300);
}

// ---- pasting people to give a role ----

const TITLES = /\b(dr|drs|prof|a\/prof|assoc|asst|ms|mr|mrs|mdm|miss)\b\.?/gi;
export const normName = s => String(s || '').replace(TITLES, ' ').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const EMAIL = /[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/;

// `known`: [{ email, workEmail?, name }] (faculty, residents, PDs, people with roles). Each pasted line is an email, a name,
// or both (“Name, email”, “Name <email>”, two spreadsheet columns). Match by either email first, then by exactly one name.
// `email` in the result is the person's sign-in email (a record found through its work email gives its own sign-in email).
export function parseAccessPaste(text, known = []) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(EMAIL);
    const pasted = m ? m[0].toLowerCase() : '';
    const name = line.replace(EMAIL, ' ').replace(/[<>,;\t"]+/g, ' ').replace(/\s+/g, ' ').trim();
    let hit = null, how = '';
    if (pasted) {
      hit = known.find(k => String(k.email).toLowerCase() === pasted) || null;
      if (hit) how = 'email';
      else { hit = known.find(k => String(k.workEmail || '').toLowerCase() === pasted) || null; if (hit) how = 'work email'; }
    }
    if (!hit && name) {
      const nn = normName(name);
      const same = nn ? known.filter(k => normName(k.name) === nn) : [];
      if (same.length === 1) { hit = same[0]; how = 'name'; }
      else if (same.length > 1 && !pasted) { out.push({ line, name, email: '', how: '', problem: 'Several people have that name: add an email.' }); continue; }
    }
    if (hit) { out.push({ line, name: hit.name || name, email: String(hit.email).toLowerCase(), how, problem: '' }); continue; }
    if (pasted) { out.push({ line, name, email: pasted, how: 'new', problem: name ? '' : 'Add a name.' }); continue; }
    out.push({ line, name, email: '', how: '', problem: 'No email, and no one on the lists has that name.' });
  }
  return out;
}
