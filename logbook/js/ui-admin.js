// Admin (programme admins only): the resident list, importing the old Google Form workbook (the app
// owner only), shared templates.
// Firestore rules enforce admin-only access; this screen is only hidden from everyone else.

import { YEAR_NAMES, yearName } from './categories.js';
import { academicYear } from './engine.js';
import { countCases, sortCodes, splitInitials } from './engine.js';
import { parseResidentsScript, parseCaseSheet, parseTotalsSheet, countCheck } from './importer.js';
import { S, h, toast, confirmBox, cloud, needExcel, sheetRows, fileButton, hooks, add, resetters, residentYear, residentYearName, residentSmo, baseIntake, effectiveIntake, categoryNames, setCategoryNames, PICKER_ORDER } from './ui-core.js';
import { templateDialog } from './ui-settings.js';
import { renderTemplateCard } from './portfolio.js';

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

export function renderAdmin() {
  if (!S.admin) return h('p', { class: 'empty' }, 'Admins only.');
  if (!A.residents && !A.loading) load();
  return h('div', {}, residentsCard(), S.owner ? importCard() : ownerOnlyCard(), sharedCard(), categoryNamesCard(), renderTemplateCard());
}

async function load() {
  A.loading = true;
  try {
    [A.residents, A.shared] = await Promise.all([cloud.listResidents(), cloud.listSharedTemplates()]);
  } catch (err) { A.residents = []; A.shared = []; toast('Could not load: ' + err.message); }
  A.loading = false;
  if (S.tab === 'admin') hooks.render();
}

// ---------- category display names ----------

// Shorter or friendlier names for everyone's screens: a display name (lists, Progress) and a pill name
// (the category chips). The portfolio and Excel exports keep the official APMES names.
function categoryNamesCard() {
  const cur = categoryNames();
  const edits = JSON.parse(JSON.stringify(cur));
  const set = (code, k, v) => { edits[code] = { ...(edits[code] || {}), [k]: v }; };
  return h('details', { class: 'card more-tools' },
    h('summary', {}, 'Category names (display only)'),
    h('p', { class: 'hint' }, 'Change how categories are named on screen: a display name for lists and Progress, and a short name for the pills. Leave blank for the official name. Exports (portfolio, Excel) always use the official APMES names.'),
    h('div', { class: 'scroll' }, h('table', { class: 'cat-names' },
      h('thead', {}, h('tr', {}, ['Code', 'Official', 'Display name', 'Pill name'].map(t => h('th', {}, t)))),
      h('tbody', {}, PICKER_ORDER.map(c => h('tr', {},
        h('td', {}, c.code), h('td', { class: 'muted' }, c.name),
        h('td', {}, h('input', { value: (cur[c.code] && cur[c.code].name) || '', placeholder: c.name, maxlength: '80', 'aria-label': `Display name for ${c.code}`, oninput: e => set(c.code, 'name', e.target.value) })),
        h('td', {}, h('input', { value: (cur[c.code] && cur[c.code].short) || '', placeholder: c.name, maxlength: '30', 'aria-label': `Pill name for ${c.code}`, oninput: e => set(c.code, 'short', e.target.value) }))))))),
    h('div', { class: 'bar', style: 'margin:10px 0 0' },
      h('button', { class: 'primary', onclick: async () => {
        try { const n = await cloud.saveCategoryNames(edits); setCategoryNames(n); toast('Category names saved for everyone'); hooks.render(); }
        catch (err) { toast('Could not save: ' + err.message); }
      } }, 'Save names')));
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
    h('p', { class: 'hint' }, 'Programme residents share their case counts on the Totals tab. Year defaults from the intake (AY starts 1 July). Tap Edit to set it by hand (leave, repeats) or to mark someone as an SMO: cases done as an SMO count as R3 in the portfolio.'));
  if (!A.residents) { add(card, h('p', { class: 'empty' }, 'Loading…')); return card; }
  const ed = A.editRes;
  // apply a change and save it; a refused save puts the old values back
  const edit = async (r, patch) => {
    const prev = { ...r };
    Object.assign(r, patch);
    try { await cloud.saveResident(r); toast('Saved ' + (r.name || r.rid)); }
    catch (err) { Object.keys(r).forEach(k => delete r[k]); Object.assign(r, prev); toast('Could not save: ' + err.message); hooks.render(); }
  };
  const yearLabel = r => residentYearName(r) + (r.rYear && r.status !== 'SMO' ? ' (set)' : '');
  // Year: Auto, R1…SR2 or SMO. SMO sets the status; the years spent as one are kept (smo) so their
  // cases stay in the R3 column after moving on to SR1.
  const setYear = (r, v) => {
    const leaving = r.status === 'SMO' ? { status: 'ACTIVE', smo: residentSmo(r) || null } : {};
    if (v === 'SMO') return edit(r, { status: 'SMO', intake: effectiveIntake(r) || null, rYear: null, smo: Number(r.smo) || null });
    if (!v) return edit(r, { ...leaving, rYear: null });
    const n = Number(v), smo = residentSmo(r), base = baseIntake(r);
    const raw = base ? academicYear() - base + 1 : 0;
    // back from SMO into the senior years: count the SMO years instead of fixing the year
    if (smo && n >= 4 && base && raw - n >= 0) return edit(r, { ...leaving, intake: base, rYear: null, smo: raw - n || null });
    return edit(r, { ...leaving, rYear: n, smo: null });
  };
  const row = r => ed ? h('tr', {},
      h('td', {}, r.rid),
      h('td', {}, h('input', { value: r.name || '', style: 'min-width:150px', onchange: e => { edit(r, { name: e.target.value.trim() }); } })),
      h('td', {}, h('input', { type: 'email', value: r.email || '', style: 'min-width:200px', onchange: e => { edit(r, { email: e.target.value.trim().toLowerCase() }); } })),
      h('td', {}, h('input', { type: 'number', value: r.intake || '', style: 'width:90px', onchange: e => { edit(r, { intake: Number(e.target.value) || null }); } })),
      // "Auto" moves up each 1 July from the intake; a set year stays until changed (leave, repeats)
      h('td', {}, h('select', { 'aria-label': `Year for ${r.name || r.rid}`, onchange: e => { setYear(r, e.target.value); hooks.render(); } },
        h('option', { value: '', selected: !r.rYear && r.status !== 'SMO' }, `Auto (${yearName(residentYear({ intake: r.intake, smo: r.smo }) || 1)})`),
        YEAR_NAMES.map((y, i) => h('option', { value: String(i + 1), selected: r.status !== 'SMO' && r.rYear === i + 1 }, y)),
        h('option', { value: 'SMO', selected: r.status === 'SMO' }, 'SMO (counts as R3)'))),
      h('td', {}, h('select', { onchange: e => {
        const v = e.target.value;
        if (v === 'SMO') setYear(r, 'SMO');
        else edit(r, r.status === 'SMO' ? { status: v, smo: residentSmo(r) || null } : { status: v });
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
          h('td', {}, residentYearName(r) + (r.rYear ? '' : ' (auto)')),
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

// ---------- importer (the app owner only: admins can't read or write residents' cases) ----------
function ownerOnlyCard() {
  return h('section', { class: 'card' }, h('h2', {}, 'Import the old Google Form responses'),
    h('p', { class: 'hint', style: 'margin:0' }, 'Only the app owner can import cases into residents’ logbooks: admins can’t see anyone’s cases. The owner is set in the Firebase console (Firestore → owners). Residents can add their own past cases with Paste list on the Log screen.'));
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
          h('td', { class: 'num' }, String(g.cases.length)),
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
    const list = [...groups.values()].sort((a, b) => String(a.rid).localeCompare(String(b.rid)));
    for (const g of list) {
      const t = g.rid && totals[g.rid] ? { [g.rid]: totals[g.rid] } : null;
      g.check = t ? { checked: true, ...countCheck(g.cases, t) } : { checked: false, ok: false, diffs: [] };
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
      const res = await cloud.importCases(r.email, g.rid, cases, n => { A.prog = (done + Math.min(n, cases.length)) / total; paintProgress(); });
      // counts for the Totals tab, from everything in the logbook (cases logged in the app included)
      const all = await cloud.listCases(r.email);
      const intake = r.intake || intakeOf(g.rid);
      // keep the resident's reflection counts: admins can't read reflections themselves
      const prev = (A.prevSummaries ||= Object.fromEntries((await cloud.listSummaries()).map(x => [String(x.rid), x])))[String(g.rid)];
      await cloud.writeSummary(g.rid, { rid: g.rid, name: r.name || '', intake, rYear: residentYear({ ...r, intake }) || 1, counts: countCases(all), total: all.length, reflections: prev?.reflections || {}, reflectionsTotal: prev?.reflectionsTotal || 0, updatedAt: Date.now() });
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
    h('h2', {}, 'Shared templates'),
    h('p', { class: 'hint' }, 'Quick picks everyone sees on the Log screen.'),
    list.length ? h('ul', { class: 'prog' }, list.map(t => h('li', { style: 'grid-template-columns:1fr auto' },
      h('span', {}, h('b', {}, t.name), ' ', h('span', { class: 'muted' }, sortCodes(t.cats || []).join(' + '))),
      h('span', { class: 'row' },
        h('button', { class: 'small', onclick: () => templateDialog(t, save) }, 'Edit'),
        h('button', { class: 'small danger', onclick: async () => {
          if (!(await confirmBox('Delete shared template', `Delete “${t.name}” for everyone?`, 'Delete', true))) return;
          try { await cloud.deleteSharedTemplate(t.id); } catch (err) { toast('Could not delete: ' + err.message); return; }
          A.shared = list.filter(x => x.id !== t.id); S.sharedTemplates = A.shared; hooks.render();
        } }, 'Delete'))))) : h('p', { class: 'muted' }, 'None yet.'),
    h('div', { class: 'bar', style: 'margin:12px 0 0' }, h('button', { onclick: () => templateDialog(null, save) }, '+ New shared template')));
}
