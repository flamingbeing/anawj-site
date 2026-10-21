// Admin (programme admins only): the resident list, importing the old Google Form workbook (the app
// owner only), shared templates.
// Firestore rules enforce admin-only access; this screen is only hidden from everyone else.

import { YEAR_NAMES, yearName } from './categories.js';
import { academicYear } from './engine.js';
import { countCases, sortCodes, splitInitials, initialsFixes } from './engine.js';
import { parseResidentsScript, parseCaseSheet, parseTotalsSheet, countCheck } from './importer.js';
import { S, h, toast, confirmBox, cloud, needExcel, sheetRows, fileButton, hooks, add, resetters, residentYear, residentYearName, residentSmo, baseIntake, effectiveIntake, catPills, download, todayISO } from './ui-core.js';
import { templateDialog, categoryNamesCard } from './ui-settings.js';
import { forgetTotals } from './ui-progress.js';
import { renderTemplateCard, getTemplate, exportPortfolio, needZip } from './portfolio.js';

const STATUSES = ['ACTIVE', 'ON LEAVE', 'SMO', 'GRADUATED', 'ATTRITED'];
const A = { residents: null, loading: false, pasted: null, imp: null, busy: false, log: [], shared: null, editRes: false };
// residents groups the admin has folded (by label); leavers start folded
const collapsed = new Set(['Graduated', 'Attrited']);
const intakeOf = rid => Number(String(rid).slice(0, 4)) || null;
resetters.push(() => Object.assign(A, { residents: null, loading: false, pasted: null, imp: null, busy: false, log: [], shared: null, prog: null, editRes: false }));

// The demo keeps everything unencrypted in this browser: real residents or cases must not go there.
const demoOk = () => !cloud.demo || confirmBox('Demo mode', 'The demo stores data unencrypted in this browser. Use made-up data only — never real residents or cases. Continue?', 'Continue');

// Leaving the admin screen ends residents editing, so it opens read-only next time.
export function leaveAdmin() { A.editRes = false; A.pasted = null; }

// The Admin portal (owner, Oct 2026): what admins come for first, then links to the rest. Ready portfolios on the
// page; Programme totals (#admintotals), Residents (#adminresidents) and Advanced admin settings (#adminadv) are
// pages under it (TABS in app.js), so Back returns here and More stays the highlighted tab.
const onAdmin = () => /^admin/.test(S.tab || '');
const adminOnly = () => (S.admin ? null : h('p', { class: 'empty' }, 'Admins only.'));
const linkRow = (id, label, desc) => h('li', {}, h('a', { href: '#' + id, 'data-go': id },
  h('span', { class: 'mt' }, h('b', {}, label), h('small', {}, desc)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
export function renderAdmin() {
  if (!S.admin) return adminOnly();
  if (!A.residents && !A.loading) load();
  const n = (A.residents || []).length;
  return h('div', {}, readyPortfoliosCard(),
    h('section', { class: 'card more-list admin-links' }, h('ul', {},
      linkRow('admintotals', 'Programme totals', 'Case counts by residency year; Excel download'),
      linkRow('adminresidents', 'Residents', A.residents ? `${n} on the programme list · years, status, paste the list` : 'The programme list: years, status, paste the list'),
      // APMES People (people/): the same resident list, plus faculty and PDs, a yearly intake and the year check
      h('li', {}, h('a', { href: '../people/' }, h('span', { class: 'mt' }, h('b', {}, 'People (logbook and evals)'),
        h('small', {}, 'Add a yearly intake, year check, faculty and PDs: one list for both apps')), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'))),
      // the app owner's private feedback queue (also in More)
      S.owner ? linkRow('feedbackinbox', 'Feedback', 'Private feedback from residents: mark done, delete, copy as a task') : null,
      linkRow('adminadv', 'Advanced admin settings', `Shared tag groups, default tag names, portfolio template${S.owner ? ', import, initials fix' : ''}`))));
}
export function renderAdminResidents() {
  if (!S.admin) return adminOnly();
  if (!A.residents && !A.loading) load();
  return h('div', {}, residentsCard());
}
export function renderAdminAdvanced() {
  if (!S.admin) return adminOnly();
  if (!A.residents && !A.loading) load();
  return h('div', {}, sharedCard(), categoryNamesCard(), renderTemplateCard(), S.owner ? importCard() : ownerOnlyCard(), S.owner ? initialsFixCard() : null);
}

// Attrited residents are left off Totals: their rids go on config/totalsHidden, kept in step with the
// residents list each time Admin opens and whenever a status changes. Setting someone back to Active
// takes them off the list, so their row (still kept up to date by their device) shows again.
// Their logbook is never touched.
async function syncHidden(announce = null) {
  try {
    const want = A.residents.filter(r => r.status === 'ATTRITED').map(r => r.rid).sort();
    const have = (await cloud.loadTotalsHidden()).slice().sort();
    if (want.join() === have.join()) return;
    await cloud.saveTotalsHidden(want);
    forgetTotals();
    if (announce) toast(announce);
  } catch (err) { if (announce) toast('Could not update Totals: ' + err.message); }
}

// The change to a resident for picking year `v` ('1'…'5' or 'SMO').
export function yearPatch(r, v) {
  const leaving = r.status === 'SMO' ? { status: 'ACTIVE', smo: residentSmo(r) || null } : {};
  if (v === 'SMO') return { status: 'SMO', intake: effectiveIntake(r) || null, rYear: null, smo: Number(r.smo) || null };
  const n = Number(v), ay = academicYear(), smo = residentSmo(r), base = baseIntake(r);
  const raw = base ? ay - base + 1 : 0;
  // back from SMO into the senior years: count the SMO years, keep the intake
  if (smo && n >= 4 && base && raw - n >= 0) return { ...leaving, intake: base, rYear: null, smo: raw - n || null };
  return { ...leaving, intake: ay - n + 1, rYear: null, smo: null };
}

// A year fixed by hand (rYear, from before years moved up on their own, or set in evals) becomes the
// intake it implies, so it moves up every 1 July like everyone else's. Shows the same year today.
async function unfixYears() {
  const fixed = A.residents.filter(x => x.rYear && x.status !== 'SMO');
  for (const r of fixed) {
    try { const patch = { intake: effectiveIntake(r), rYear: null }; await cloud.saveResident({ ...r, ...patch }); Object.assign(r, patch); }
    catch (err) { console.warn('year not moved to intake', r.rid, err); }
  }
  if (fixed.length && onAdmin() && !A.editRes) hooks.render();
}

// ---------- ready portfolios (residents marked theirs ready; generate one or all) ----------

const RP = { list: null, loading: false, busy: '' };
resetters.push(() => { RP.list = null; RP.loading = false; RP.busy = ''; });
async function portfolioBlob(email) {
  const sub = await cloud.loadSubmission(email);
  if (!sub) throw new Error('not marked ready any more');
  const t = await getTemplate();
  const m = sub.meta;
  const blob = await exportPortfolio(sub.reflections, { name: m.name || '', templateB64: t && t.data, counts: m.counts, intake: m.intake, rYear: m.rYear, smo: m.smo, images: sub.images, profile: m.profile });
  return { blob, name: m.name || email };
}
const safeName = s => String(s || 'resident').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
function readyPortfoliosCard() {
  if (!RP.list && !RP.loading) {
    RP.loading = true;
    cloud.listSubmissions().then(l => { RP.list = l; }).catch(err => { RP.list = []; toast('Could not load ready portfolios: ' + err.message); }).finally(() => { RP.loading = false; if (onAdmin()) hooks.render(); });
  }
  const list = (RP.list || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const readyEmails = new Set(list.map(x => x.email));
  const notReady = (A.residents || []).filter(r => (r.status === 'ACTIVE' || r.status === 'SMO') && r.email && !readyEmails.has(String(r.email).toLowerCase()));
  const one = async x => {
    RP.busy = x.email; hooks.render();
    try { const { blob, name } = await portfolioBlob(x.email); download(`APMES portfolio - ${safeName(name)}.docx`, blob); }
    catch (err) { toast(`Could not generate ${x.name || x.email}: ${err.message}`); }
    RP.busy = ''; hooks.render();
  };
  const all = async () => {
    RP.busy = 'all'; hooks.render();
    try {
      const Z = await needZip();
      const zip = new Z();
      const failed = [];
      for (const x of list) {
        try { const { blob, name } = await portfolioBlob(x.email); zip.file(`APMES portfolio - ${safeName(name)}.docx`, blob); }
        catch (err) { failed.push(`${x.name || x.email} (${err.message})`); }
      }
      if (notReady.length) zip.file('Not marked ready.txt', notReady.map(r => `${r.name || ''} <${r.email}>`).join('\r\n') + '\r\n');
      download(`APMES portfolios ${todayISO()}.zip`, await zip.generateAsync({ type: 'blob' }));
      toast(`${list.length - failed.length} portfolio${list.length - failed.length === 1 ? '' : 's'} generated${failed.length ? '; could not generate ' + failed.join(', ') : ''}`);
    } catch (err) { toast('Could not generate: ' + err.message); }
    RP.busy = ''; hooks.render();
  };
  return h('section', { class: 'card' },
    h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Ready portfolios'), h('span', { class: 'grow' }),
      h('button', { class: 'small', onclick: () => { RP.list = null; hooks.render(); } }, 'Refresh'),
      list.length ? h('button', { class: 'small primary', disabled: !!RP.busy, onclick: all }, RP.busy === 'all' ? 'Generating…' : `Download all (${list.length})`) : null),
    h('p', { class: 'hint' }, 'Residents who marked their portfolio ready. Each is generated from what they ticked, with their Section 1 details and Section 4 case numbers, using the portfolio template. You never see their cases or other reflections.'),
    !RP.list ? h('p', { class: 'muted' }, 'Loading…') : !list.length ? h('p', { class: 'empty' }, 'No portfolios marked ready yet.')
      : h('ul', { class: 'ready-list' }, list.map(x => h('li', {},
        h('span', { class: 'grow' }, h('b', {}, x.name || x.email), h('span', { class: 'muted' }, ` · ready ${new Date(x.readyAt).toLocaleDateString()}${x.updatedAt && x.updatedAt - x.readyAt > 60000 ? `, updated ${new Date(x.updatedAt).toLocaleDateString()}` : ''} · ${x.count} reflection${x.count === 1 ? '' : 's'}`)),
        h('button', { class: 'small', disabled: !!RP.busy, onclick: () => one(x) }, RP.busy === x.email ? 'Generating…' : 'Download')))),
    RP.list && notReady.length ? h('details', { class: 'more-tools' }, h('summary', {}, `Not marked ready (${notReady.length})`),
      h('ul', { class: 'hint' }, notReady.map(r => h('li', {}, `${r.name || r.rid} · ${r.email}`)))) : null);
}

async function load() {
  A.loading = true;
  try {
    [A.residents, A.shared] = await Promise.all([cloud.listResidents(), cloud.listSharedTemplates()]);
    syncHidden();
    unfixYears();
  } catch (err) { A.residents = []; A.shared = []; toast('Could not load: ' + err.message); }
  A.loading = false;
  if (onAdmin()) hooks.render();
}

// ---------- residents ----------

// Groups for the residents list: active and on-leave residents by residency year, SR2 first down
// to R1, then SMOs, then graduated and attrited. Within a group, by name.
const GONE = { SMO: 'SMO', GRADUATED: 'Graduated', ATTRITED: 'Attrited' };
export function groupResidents(list) {
  const groups = new Map([...[...YEAR_NAMES].reverse().map(y => [y, []]), ['SMO', []], ['Year unknown', []], ['Graduated', []], ['Attrited', []]]);
  for (const r of list) {
    const y = residentYear(r);
    const key = GONE[r.status] || (y ? yearName(Math.min(y, YEAR_NAMES.length)) : 'Year unknown');
    groups.get(key).push(r);
  }
  for (const g of groups.values()) g.sort((a, b) => String(a.name || a.rid).localeCompare(String(b.name || b.rid)));
  return [...groups].filter(([, g]) => g.length);
}

function residentsCard() {
  const card = h('section', { class: 'card' },
    h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, 'Residents'), h('span', { class: 'grow' }),
      A.residents ? h('button', { class: A.editRes ? 'small primary' : 'small', onclick: () => { A.editRes = !A.editRes; if (!A.editRes) A.pasted = null; hooks.render(); } }, A.editRes ? 'Done' : 'Edit') : null),
    h('p', { class: 'hint' }, 'Programme residents share their case counts on the Totals tab. Years move up every 1 July from the intake. Tap Edit to change one (leave, repeats; it keeps moving up from there) or to mark someone as an SMO, which stays put: cases done as an SMO count as R3 in the portfolio. Attrited residents are left off Totals (their logbook is kept); set them back to Active to show them again.'));
  if (!A.residents) { add(card, h('p', { class: 'empty' }, 'Loading…')); return card; }
  const ed = A.editRes;
  // apply a change and save it; a refused save puts the old values back
  const edit = async (r, patch) => {
    const prev = { ...r };
    Object.assign(r, patch);
    try { await cloud.saveResident(r); toast('Saved ' + (r.name || r.rid)); }
    catch (err) { Object.keys(r).forEach(k => delete r[k]); Object.assign(r, prev); toast('Could not save: ' + err.message); hooks.render(); }
  };
  const yearLabel = r => residentYearName(r);
  // Year: R1…SR2 or SMO. Years move up every 1 July: picking one sets the intake it implies (leave,
  // repeats). SMO sets the status and stays put; the years spent as one are kept (smo) so their cases
  // stay in the R3 column after moving on to SR1.
  const setYear = (r, v) => edit(r, yearPatch(r, v));
  const row = r => ed ? h('tr', {},
      h('td', {}, r.rid),
      h('td', {}, h('input', { value: r.name || '', style: 'min-width:150px', onchange: e => { edit(r, { name: e.target.value.trim() }); } })),
      h('td', {}, h('input', { type: 'email', value: r.email || '', style: 'min-width:200px', onchange: e => { edit(r, { email: e.target.value.trim().toLowerCase() }); } })),
      h('td', {}, h('input', { type: 'number', value: r.intake || '', style: 'width:90px', onchange: e => { edit(r, { intake: Number(e.target.value) || null }); } })),
      // moves up each 1 July; SMO stays put
      h('td', {}, h('select', { 'aria-label': `Year for ${r.name || r.rid}`, onchange: e => { setYear(r, e.target.value); hooks.render(); } },
        residentYear(r) ? null : h('option', { value: '', selected: true }, '?'),
        YEAR_NAMES.map((y, i) => h('option', { value: String(i + 1), selected: r.status !== 'SMO' && residentYear(r) === i + 1 }, y)),
        h('option', { value: 'SMO', selected: r.status === 'SMO' }, 'SMO (counts as R3)'))),
      h('td', {}, h('select', { onchange: e => {
        const v = e.target.value, was = r.status;
        if (v === 'SMO') setYear(r, 'SMO');
        else edit(r, was === 'SMO' ? { status: v, smo: residentSmo(r) || null } : { status: v });
        if (v === 'ATTRITED' || was === 'ATTRITED') syncHidden(v === 'ATTRITED' ? `${r.name || r.rid} taken off Totals` : `${r.name || r.rid} back on Totals`);
        hooks.render();
      } }, STATUSES.map(s => h('option', { value: s, selected: r.status === s }, s)))),
      h('td', {}, h('button', { class: 'small danger', 'aria-label': `Remove ${r.name || r.rid}`, onclick: async () => {
        if (!(await confirmBox('Remove resident', `Remove ${r.name || r.rid} from the programme list? Their row leaves the Totals table; their logbook is kept.`, 'Remove', true))) return;
        try { await cloud.deleteResident(r.rid); } catch (err) { toast('Could not remove: ' + err.message); return; }
        A.residents = A.residents.filter(x => x.rid !== r.rid); hooks.render();
      } }, '×')))
    : h('tr', {}, h('td', {}, r.rid), h('td', {}, r.name || ''), h('td', {}, r.email || h('span', { class: 'flag err' }, 'no email')),
      h('td', {}, String(r.intake || '')), h('td', {}, yearLabel(r)), h('td', {}, r.status || ''));
  const cols = ['ID', 'Name', 'Email', 'Intake', 'Year', 'Status'].concat(ed ? [''] : []);
  const groups = groupResidents(A.residents);
  add(card, groups.length ? h('div', { class: 'scroll' }, h('table', { class: ed ? 'res-table edit' : 'res-table' },
    h('thead', {}, h('tr', {}, cols.map(t => h('th', {}, t)))),
    groups.map(([label, rs]) => {
      const rowsEl = rs.map(row);
      const shut = collapsed.has(label);
      rowsEl.forEach(tr => { tr.hidden = shut; });
      const btn = h('button', { type: 'button', class: 'res-toggle', 'aria-expanded': String(!shut), onclick: () => {
        const nowShut = !collapsed.has(label);
        nowShut ? collapsed.add(label) : collapsed.delete(label);
        btn.setAttribute('aria-expanded', String(!nowShut));
        rowsEl.forEach(tr => { tr.hidden = nowShut; });
      } }, h('span', { class: 'res-chev', 'aria-hidden': 'true' }, '›'), `${label} · ${rs.length}`);
      return h('tbody', {}, h('tr', { class: 'res-group' }, h('th', { colspan: String(cols.length), scope: 'colgroup' }, btn)), rowsEl);
    }))) : h('p', { class: 'muted' }, 'No residents yet.'));
  if (ed) add(card, h('p', { class: 'hint', style: 'margin:6px 0 0' }, 'Changes save as you make them. The grouping updates when you tap Done.'));
  if (!ed) return card;

  const ta = h('textarea', { rows: '4', placeholder: 'Paste the RESIDENTS array from the old Apps Script: const RESIDENTS = [ {id: "...", name: "...", email: "...", status: "ACTIVE"}, … ];' });
  add(card, h('h3', {}, 'Add or update from the Apps Script'), ta,
    h('div', { class: 'bar', style: 'margin-top:8px' }, h('button', { onclick: () => { A.pasted = parseResidentsScript(ta.value); hooks.render(); } }, 'Review')));
  if (A.pasted) {
    const known = new Map((A.residents || []).map(r => [r.rid, r]));
    const rows = A.pasted.map(p => {
      const old = known.get(p.id) || {};
      const intake = old.intake || intakeOf(p.id);
      // statuses outside the four the rules accept would stop the save halfway: flag them, save as ACTIVE
      const status = STATUSES.includes(p.status) ? p.status : 'ACTIVE';
      // a row without an email keeps the one on the list; a status set here (SMO, graduated…) isn't
      // undone by the script's default ACTIVE
      const keepStatus = old.status && status === 'ACTIVE' && old.status !== 'ACTIVE';
      return { ...old, rid: p.id, name: p.name || old.name, email: p.email || old.email || '', status: keepStatus ? old.status : status,
        badStatus: status !== p.status ? p.status : null, intake, rYear: old.rYear || null, smo: old.smo || null };
    });
    const bad = rows.filter(r => r.badStatus);
    add(card, h('p', {}, `${rows.length} residents (${rows.filter(r => !known.has(r.rid)).length} new).`),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['ID', 'Name', 'Email', 'Intake', 'Year', 'Status'].map(t => h('th', {}, t)))),
        h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, r.rid), h('td', {}, r.name), h('td', {}, r.email), h('td', {}, String(r.intake || '')),
          h('td', {}, residentYearName(r)),
          h('td', {}, r.status, r.badStatus ? h('span', { class: 'flag err', title: 'Not a known status; saved as ACTIVE' }, ` was “${r.badStatus}”`) : null)))))),
      bad.length ? h('p', { class: 'tip' }, `${bad.length} unknown status${bad.length === 1 ? '' : 'es'} will be saved as ACTIVE (allowed: ${STATUSES.join(', ')}). Change them in the table after saving.`) : null,
      h('div', { class: 'bar', style: 'margin-top:8px' },
        h('button', { class: 'primary', onclick: async () => {
          if (!(await demoOk())) return;
          // carry on past a failed row and say which ones failed
          const failed = [];
          for (const r of rows) {
            const { badStatus, ...doc } = r;
            try { await cloud.saveResident(doc); } catch (err) { failed.push(`${r.rid}: ${err.message}`); }
          }
          toast(failed.length ? `Saved ${rows.length - failed.length} of ${rows.length}. Failed: ${failed.join('; ')}` : `Saved ${rows.length} residents`, { ms: failed.length ? 12000 : 4500 });
          A.pasted = null; A.residents = null; hooks.render();
        } }, 'Save all'),
        h('button', { onclick: () => { A.pasted = null; hooks.render(); } }, 'Cancel')));
  }
  return card;
}

// ---------- one-off initials fix (the app owner only) ----------
// Older imports, pastes and spreadsheets kept longer (5–8 letter) or one-letter initials inside the case text, with
// an empty initials field. Check reads every logbook's cases (the owner may), Fix writes initials + details back.
// Running it again finds nothing. Fake data only in the demo.
const IF = { scan: null, busy: false, msg: '' };
resetters.push(() => Object.assign(IF, { scan: null, busy: false, msg: '' }));
function initialsFixCard() {
  const card = h('section', { class: 'card' }, h('h2', {}, 'Fix initials in older cases (one-off)'),
    h('p', { class: 'hint' }, 'Finds cases whose initials are still at the start of the case text (e.g. “ABCDEF 45F lap chole”, “K/45F hernia”) in every logbook, shows them, and moves the initials into their own field. Nothing changes until you press Fix.'));
  const scan = IF.scan, n = scan ? scan.reduce((t, x) => t + x.fixes.length, 0) : 0;
  add(card, h('div', { class: 'bar', style: 'margin-bottom:6px' },
    h('button', { disabled: IF.busy, onclick: checkInitials }, scan ? 'Check again' : 'Check all logbooks'),
    scan && n ? h('button', { class: 'primary', disabled: IF.busy, onclick: () => fixInitials(scan, n) }, `Fix ${n} case${n === 1 ? '' : 's'}`) : null),
    IF.msg ? h('p', { class: 'hint', 'aria-live': 'polite', style: 'margin:0 0 6px' }, IF.msg) : null);
  if (scan && n) add(card, h('ul', { class: 'fix-list' }, scan.filter(x => x.fixes.length).map(x => h('li', {},
    h('b', {}, x.email), ` · ${x.fixes.length} case${x.fixes.length === 1 ? '' : 's'}`,
    x.fixes.slice(0, 3).map(f => h('div', { class: 'hint', style: 'margin:2px 0 0' }, `“${f.before.slice(0, 60)}” → ${f.initials} · ${f.details.slice(0, 50)}`))))));
  return card;
}
async function checkInitials() {
  IF.busy = true; IF.msg = 'Checking…'; hooks.render();
  try {
    const emails = await cloud.listLogbookEmails(), out = [];
    for (let i = 0; i < emails.length; i++) {
      IF.msg = `Checking ${i + 1} of ${emails.length} logbooks…`; hooks.render();
      out.push({ email: emails[i], fixes: initialsFixes(await cloud.listCases(emails[i])) });
    }
    const n = out.reduce((t, x) => t + x.fixes.length, 0);
    IF.scan = out; IF.msg = n ? `${n} case${n === 1 ? '' : 's'} in ${out.filter(x => x.fixes.length).length} logbook(s) can be fixed. A few from each are shown.` : `Checked ${emails.length} logbooks: nothing to fix.`;
  } catch (err) { IF.msg = 'Could not check: ' + err.message; }
  IF.busy = false; hooks.render();
}
async function fixInitials(scan, n) {
  if (!(await confirmBox('Fix initials', `Move the initials of ${n} case${n === 1 ? '' : 's'} into their own field? The case text keeps everything else.`, 'Fix'))) return;
  IF.busy = true; hooks.render();
  let done = 0;
  try {
    for (const x of scan) if (x.fixes.length) {
      await cloud.fixCaseInitials(x.email, x.fixes, k => { IF.msg = `Fixing… ${done + k} of ${n}`; hooks.render(); });
      done += x.fixes.length;
    }
    IF.scan = null; IF.msg = `Fixed ${done} case${done === 1 ? '' : 's'}. Check again to confirm nothing is left.`;
    toast(`Fixed initials in ${done} cases`);
  } catch (err) { IF.msg = `Stopped after ${done} of ${n}: ${err.message}. Check again, then Fix the rest.`; }
  IF.busy = false; hooks.render();
}

// ---------- importer (the app owner only: admins can't read or write residents' cases) ----------
function ownerOnlyCard() {
  return h('section', { class: 'card' }, h('h2', {}, 'Import the old Google Form responses'),
    h('p', { class: 'hint', style: 'margin:0' }, 'Only the app owner can import cases into residents’ logbooks: admins can’t see anyone’s cases. The owner is set in the Firebase console (Firestore → owners). Residents can add their own past cases with Paste list on the Add tab.'));
}


function importCard() {
  const card = h('section', { class: 'card' }, h('h2', {}, 'Import the old Google Form responses'),
    h('p', { class: 'hint' }, 'Upload the responses workbook (.xlsx). The “Case” tab is read in this browser and checked against the “AYxxxx Totals” tabs. Importing writes only rows not imported before, so it is safe to run again.'),
    h('div', { class: 'bar' }, fileButton('Choose workbook…', '.xlsx', readWorkbook), A.busy ? h('span', { class: 'muted' }, 'Working…') : null));
  const imp = A.imp;
  if (!imp) return card;
  const byRid = new Map((A.residents || []).map(r => [r.rid, r]));
  const okCount = imp.groups.filter(g => g.check.ok).length;
  add(card, 
    h('p', {}, `${imp.total} cases for ${imp.groups.length} residents · ${imp.skipped} rows skipped · ${imp.warnings} warnings · count check ${okCount}/${imp.groups.length} OK.`),
    h('div', { class: 'scroll' }, h('table', {},
      h('thead', {}, h('tr', {}, ['ID', 'Resident', 'Email', 'Cases', 'Count check'].map(t => h('th', {}, t)))),
      h('tbody', {}, imp.groups.map(g => {
        const r = byRid.get(g.rid);
        return h('tr', {},
          h('td', {}, g.rid || '—'),
          h('td', {}, r ? r.name : g.label),
          h('td', {}, r && r.email ? r.email : h('span', { class: 'flag err' }, 'no email — add to residents first')),
          h('td', { class: 'num' }, String(g.cases.length), g.app && g.app.length ? h('span', { class: 'muted', title: 'Rows made in the app: already in the logbook, not imported, but counted in the check' }, ` + ${g.app.length} in the app`) : null),
          h('td', {}, g.check.checked ? (g.check.ok ? h('span', { class: 'flag', style: 'background:var(--ok-bg);color:var(--ok)' }, '✓ matches') :
            h('span', { class: 'flag err', title: g.check.diffs.map(d => `${d.code}: expected ${d.expected}, got ${d.got}`).join('\n') }, `${g.check.diffs.length} differ`)) : h('span', { class: 'muted' }, 'no totals')));
      })))),
    imp.warningList.length ? h('details', {}, h('summary', {}, `Warnings (${imp.warningList.length})`),
      h('ul', { class: 'warnings' }, imp.warningList.slice(0, 300).map(w => h('li', { class: 'warn' }, `Row ${w.row}: ${w.message}`)))) : null,
    h('div', { class: 'bar', style: 'margin-top:12px' },
      h('button', { class: 'primary', disabled: A.busy, onclick: runImport }, 'Import'),
      h('button', { disabled: A.busy, onclick: () => { A.imp = null; A.log = []; hooks.render(); } }, 'Clear')),
    A.prog != null ? h('progress', { max: '1', value: String(A.prog) }) : null,
    A.log.length ? h('ul', { class: 'warnings', style: 'margin-top:8px' }, A.log.map(l => h('li', { class: l.cls }, l.text))) : null);
  return card;
}

async function readWorkbook(file) {
  A.busy = true; A.imp = null; A.log = []; A.prevSummaries = null; hooks.render();
  try {
    await needExcel();
    const wb = new globalThis.ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const caseWs = wb.worksheets.find(w => /^case$/i.test(w.name.trim())) || wb.worksheets[0];
    const parsed = parseCaseSheet(sheetRows(caseWs));
    const totals = {};
    for (const ws of wb.worksheets) if (/^AY\s*\d{4}\s*Totals/i.test(ws.name)) Object.assign(totals, parseTotalsSheet(sheetRows(ws)));
    const groups = new Map();
    for (const c of parsed.cases) {
      const k = c.rid || c.residentLabel;
      if (!groups.has(k)) groups.set(k, { rid: c.rid, label: c.residentLabel, cases: [] });
      groups.get(k).cases.push(c);
    }
    // rows the sheet script added for cases logged in the app: not imported (already in the logbook), but the Totals tabs
    // count them, so the check does too
    const appByRid = new Map();
    for (const a of parsed.appRows || []) if (a.rid) appByRid.set(a.rid, [...(appByRid.get(a.rid) || []), a]);
    const list = [...groups.values()].sort((a, b) => String(a.rid).localeCompare(String(b.rid)));
    for (const g of list) {
      const t = g.rid && totals[g.rid] ? { [g.rid]: totals[g.rid] } : null;
      g.app = (g.rid && appByRid.get(g.rid)) || [];
      g.check = t ? { checked: true, ...countCheck([...g.cases, ...g.app], t) } : { checked: false, ok: false, diffs: [] };
    }
    A.imp = { groups: list, total: parsed.cases.length, skipped: parsed.skipped.length, warnings: parsed.warnings.length, warningList: parsed.warnings };
  } catch (err) { toast('Could not read the workbook: ' + err.message); }
  A.busy = false; hooks.render();
}

async function runImport() {
  const byRid = new Map((A.residents || []).map(r => [r.rid, r]));
  const groups = A.imp.groups.filter(g => g.rid && byRid.get(g.rid)?.email);
  if (!groups.length) return toast('No resident in the file has an email on the residents list');
  if (!(await demoOk())) return;
  if (!(await confirmBox('Import cases', `Write cases for ${groups.length} residents? Rows already imported are skipped.`, 'Import'))) return;
  A.busy = true; A.log = []; A.prog = 0; hooks.render();
  let done = 0;
  const total = groups.reduce((n, g) => n + g.cases.length, 0);
  for (const g of groups) {
    const r = byRid.get(g.rid);
    const cases = g.cases.map(c => {
      // importKey was hashed on the original details text (importer.js); only the stored fields are split
      const out = { date: c.date || null, ...splitInitials(c.details), cats: sortCodes(c.cats), importKey: c.importKey, source: 'import', createdAt: c.timestamp || Date.now(), updatedAt: Date.now() };
      if (!c.date && c.dateText) out.dateText = c.dateText;
      return out;
    });
    try {
      // responses the Google Form inbox already brought into this logbook aren't imported again (form-inbox.js)
      const { withoutFormCases } = await import('./form-inbox.js');
      const before = await cloud.listCases(r.email);
      const { rows, dropped } = withoutFormCases(cases, before);
      // a case already in the logbook is never overwritten (the resident may have edited it since)
      const res = await cloud.importCases(r.email, g.rid, rows, n => { A.prog = (done + Math.min(n, cases.length)) / total; paintProgress(); }, { have: before.map(c => c.id) });
      if (dropped) res.skipped += dropped;
      // counts for the Totals tab, from everything in the logbook (cases logged in the app included)
      const all = await cloud.listCases(r.email);
      const intake = r.intake || intakeOf(g.rid);
      // keep the resident's reflection counts: admins can't read reflections themselves
      const prev = (A.prevSummaries ||= Object.fromEntries((await cloud.listSummaries()).map(x => [String(x.rid), x])))[String(g.rid)];
      await cloud.writeSummary(g.rid, { rid: g.rid, name: r.name || '', intake, rYear: residentYear({ ...r, intake }) || 1, ...(r.status === 'SMO' ? { smo: true } : {}), counts: countCases(all), total: all.length, reflections: prev?.reflections || {}, reflectionsTotal: prev?.reflectionsTotal || 0, updatedAt: Date.now() });
      A.log.push({ cls: 'ok', text: `${r.name || g.rid}: ${res.written} written, ${res.skipped} already there` });
    } catch (err) {
      A.log.push({ cls: 'error', text: `${r.name || g.rid}: ${err.message}` });
    }
    done += cases.length;
    A.prog = done / total;
    hooks.render();
  }
  A.busy = false; A.prog = null; hooks.render();
  toast('Import finished');
}

function paintProgress() {
  const p = document.querySelector('main progress');
  if (p) p.value = A.prog;
}

// ---------- shared templates ----------

function sharedCard() {
  const list = A.shared || [];
  const save = async t => { try { await cloud.saveSharedTemplate(t); A.shared = [...list.filter(x => x.id !== t.id), t]; S.sharedTemplates = A.shared; hooks.render(); } catch (err) { toast('Could not save: ' + err.message); } };
  return h('section', { class: 'card' },
    h('h2', {}, 'Shared tag groups'),
    h('p', { class: 'hint' }, 'A starting set of tag groups: each resident gets a copy in their own tag groups (Quick picks on the Add tab), which they can edit or delete. Changes here reach only residents who haven\'t had that group yet.'),
    list.length ? h('ul', { class: 'prog' }, list.map(t => h('li', { style: 'grid-template-columns:1fr auto' },
      h('span', {}, h('b', {}, t.name), ' ', h('span', { class: 'muted' }, catPills(t.cats))),
      h('span', { class: 'row' },
        h('button', { class: 'small', onclick: () => templateDialog(t, save) }, 'Edit'),
        h('button', { class: 'small danger', onclick: async () => {
          if (!(await confirmBox('Delete shared tag group', `Delete “${t.name}” for everyone?`, 'Delete', true))) return;
          try { await cloud.deleteSharedTemplate(t.id); } catch (err) { toast('Could not delete: ' + err.message); return; }
          A.shared = list.filter(x => x.id !== t.id); S.sharedTemplates = A.shared; hooks.render();
        } }, 'Delete'))))) : h('p', { class: 'muted' }, 'None yet.'),
    h('div', { class: 'bar', style: 'margin:12px 0 0' }, h('button', { onclick: () => templateDialog(null, save) }, '+ New shared tag group')));
}
