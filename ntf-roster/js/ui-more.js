// NTF Roster: the More screen. Import the department's Excel sheet (with a review before anything changes),
// export (Excel in the department layout, PDF through the print dialog, CSV, a calendar file for one person),
// backup and restore, settings (department name, public holidays), the team sharing panel, starting again,
// and the two app-version lines at the very end. Each part is one of the kit's grouped lists (rows on a raised
// surface, a caption header above, a footnote below).
import * as M from './model.js';
import * as io from './io.js';
import { SG_HOLIDAYS } from './demo.js';

const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person';

export function mount(el, app) {
  const { h, icon } = app;
  const store = app.store;
  const root = h('div', { class: 'more' });
  el.innerHTML = '';
  el.append(root);

  // ---------- helpers ----------
  // a grouped section: caption header, a list of rows, an optional footnote
  const section = (id, title, footer, ...kids) => h('section', { class: 'app-section more-sec', 'aria-labelledby': id },
    h('h2', { class: 'app-section-header', id }, title), ...kids, footer ? h('p', { class: 'app-section-footer' }, footer) : null);
  const list = (...items) => h('ul', { class: 'app-list' }, items.flat().filter(Boolean).map(it => h('li', null, it)));
  const rowParts = (label, ic, sub) => [ic ? h('span', { class: 'app-row-icon', html: icon(ic) }) : null,
    h('span', { class: 'app-row-body' }, h('span', { class: 'app-row-title' }, label), sub ? h('span', { class: 'app-row-sub' }, sub) : null)];
  const row = (label, fn, { ic, sub, cls = '' } = {}) => h('button', { type: 'button', class: `app-row ${cls}`, onclick: fn }, rowParts(label, ic, sub));
  const fileRow = (label, accept, onFile, { ic = 'upload', sub } = {}) => {
    const input = h('input', { type: 'file', accept });
    input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; if (f) onFile(f); });
    return h('label', { class: 'app-row more-file' }, input, rowParts(label, ic, sub), h('span', { class: 'app-row-chevron', 'aria-hidden': 'true' }));
  };
  async function busy(button, fn) {
    if (button) button.disabled = true;
    try { await fn(); } catch (e) { console.error(e); app.toast(e.message || 'Something went wrong', { kind: 'error' }); } finally { if (button) button.disabled = false; }
  }
  const monthOptions = (sel) => {
    const out = [];
    for (let i = -12; i <= 12; i++) { const m = M.addMonths(app.month, i); out.push(h('option', { value: m, selected: m === sel }, M.fmtMonth(m))); }
    return out;
  };

  // ---------- Import ----------
  const importSec = section('more-import', 'Import', 'You see what was found before anything changes.',
    list(fileRow('Import the department sheet', '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', onImportFile,
      { ic: 'upload', sub: 'The monthly "ALL STAFF LEAVE REQUEST" Excel file (.xlsx)' })));

  async function onImportFile(file) {
    const closeReading = app.toast('Reading the sheet…', { ms: 10000 });
    const done = () => { if (typeof closeReading === 'function') closeReading(); };
    try {
      await io.loadExcelJS();
      const parsed = await io.parseDeptWorkbook(await file.arrayBuffer(), store.get());
      done();
      if (!parsed.months.length) { app.toast(parsed.warnings[0] || 'No month sheet found in this file.', { kind: 'error', ms: 7000 }); return; }
      reviewImport(parsed, file.name);
    } catch (e) {
      console.error(e);
      done();
      app.toast(/^This isn't an \.xlsx/.test(e.message || '') ? e.message : `Could not read this file: ${e.message || e}`, { kind: 'error', ms: 9000 });
    }
  }

  function reviewImport(parsed, fileName) {
    const state = store.get();
    const choices = { people: {}, unknown: {}, meetings: true };
    const body = h('div', { class: 'imp' });
    body.append(h('p', { class: 'more-p' }, `From ${fileName}. For the people and months in the sheet, leave, requests and other codes come from the sheet (replacing what is there now). Calls and shifts already planned here stay. Applying is one step: Undo puts everything back.`));
    body.append(h('h3', null, 'Months'), h('ul', { class: 'imp-months' }, parsed.months.map(m =>
      h('li', null, `${M.fmtMonth(m.month)}: ${m.people} people, ${m.cells} filled cells (columns ${M.fmtDay(m.dates[0])} to ${M.fmtDay(m.dates[m.dates.length - 1])})`))));
    if (parsed.warnings.length) body.append(h('div', { class: 'warn-box', role: 'note' }, parsed.warnings.map(w => h('div', null, w))));

    // People: new or matched, with their group
    const nNew = parsed.people.filter(p => !p.matchId).length;
    body.append(h('h3', null, `People (${parsed.people.length}: ${parsed.people.length - nNew} matched, ${nNew} new)`));
    const staffOpts = (sel) => (state.staff || []).map(s => h('option', { value: s.id, selected: s.id === sel }, `Same as ${s.name}`));
    const list = h('div', { class: 'imp-people' });
    for (const p of parsed.people) {
      choices.people[p.key] = p.matchId || 'new';
      const meta = [p.note, p.start ? `${M.fmtDay(p.start)} ${p.start.slice(0, 4)}${p.end ? ` to ${M.fmtDay(p.end)} ${p.end.slice(0, 4)}` : ''}` : ''].filter(Boolean).join(' · ');
      const tagCls = v => `app-badge imp-tag${v === 'new' ? ' app-badge--ok' : v === 'skip' ? ' app-badge--ink' : ''}`;
      const tag = h('span', { class: tagCls(p.matchId ? 'match' : 'new') }, p.matchId ? 'matched' : 'new');
      const act = h('select', { class: 'app-input', 'aria-label': `What to do with ${p.name}` },
        h('option', { value: 'new', selected: !p.matchId }, 'Add as new person'),
        staffOpts(p.matchId),
        h('option', { value: 'skip' }, 'Skip this person'));
      const grp = h('select', { class: 'app-input', 'aria-label': `Group for ${p.name}`, disabled: !!p.matchId },
        (state.groups || []).map(g => h('option', { value: g.id, selected: g.id === p.group }, g.name)));
      act.addEventListener('change', () => {
        choices.people[p.key] = act.value;
        grp.disabled = act.value !== 'new';
        tag.className = tagCls(act.value);
        tag.textContent = act.value === 'new' ? 'new' : act.value === 'skip' ? 'skipped' : 'matched';
      });
      grp.addEventListener('change', () => { p.group = grp.value; });
      list.append(h('div', { class: 'imp-person' }, h('div', { class: 'pn' }, h('strong', null, p.name), tag, meta ? h('small', null, meta) : null), act, grp));
    }
    body.append(list);

    // Unknown codes
    const unk = Object.entries(parsed.unknownCodes);
    if (unk.length) {
      body.append(h('h3', null, 'Codes this roster does not know yet'));
      const box = h('div', { class: 'imp-codes' });
      unk.forEach(([code, n], i) => {
        const def = /^[A-Z]{1,4}$/.test(code) ? 'code' : 'note';
        choices.unknown[code] = def;
        const name = `unk-${i}`;
        const radio = (val, label) => {
          const r = h('input', { type: 'radio', name, value: val, checked: def === val });
          r.addEventListener('change', () => { if (r.checked) choices.unknown[code] = val; });
          return h('label', null, r, label);
        };
        box.append(h('div', { class: 'imp-code', role: 'radiogroup', 'aria-label': `Code ${code}` },
          h('code', null, code), h('span', { class: 'muted' }, `${n} cell${n === 1 ? '' : 's'}`),
          radio('code', 'Add as a code'), radio('note', 'Keep as a note')));
      });
      body.append(box, h('p', { class: 'more-p' }, 'New codes are added as kind "other" (away from the pool). You can rename or recolour them under People, Duty codes.'));
    }
    if (parsed.meetings.length) {
      const cb = h('input', { type: 'checkbox', checked: true });
      cb.addEventListener('change', () => { choices.meetings = cb.checked; });
      body.append(h('label', { class: 'imp-meet' }, cb, `Add ${parsed.meetings.length} meeting request${parsed.meetings.length === 1 ? '' : 's'} as notes on the day`));
    }

    app.sheet({
      title: 'Import the department sheet',
      body, wide: true, className: 'is-grouped',
      actions: [
        { label: 'Cancel' },
        { label: 'Apply import', primary: true, fn: () => {
          let sum = null;
          store.commit('Import Excel sheet', draft => { sum = io.applyImport(draft, parsed, choices); });
          const parts = [`${sum.cells} cells`];
          if (sum.added) parts.unshift(`${sum.added} people added`);
          if (sum.matched) parts.unshift(`${sum.matched} matched`);
          if (sum.codesAdded.length) parts.push(`${sum.codesAdded.length} new code${sum.codesAdded.length === 1 ? '' : 's'}`);
          app.toast(`Imported: ${parts.join(', ')}`, { action: { label: 'Undo', fn: () => store.undo() }, ms: 8000 });
          const first = parsed.months[0].month;
          if (first !== app.month) app.setMonth(first);
        } },
      ],
    });
  }

  // ---------- Export ----------
  const fromSel = h('select', { id: 'more-from', class: 'app-input', 'aria-label': 'First month' }, monthOptions(app.month));
  const toSel = h('select', { id: 'more-to', class: 'app-input', 'aria-label': 'Last month' }, monthOptions(app.month));
  const personSel = h('select', { id: 'more-person', class: 'app-input' });
  function fillPeople() {
    const state = store.get();
    const keep = personSel.value;
    personSel.innerHTML = '';
    const people = M.staffInMonth(state, app.month);
    for (const p of people) personSel.append(h('option', { value: p.id, selected: p.id === keep }, p.name));
    if (!people.length) personSel.append(h('option', { value: '' }, 'Nobody in post this month'));
  }
  fillPeople();

  async function exportExcel(months, button) {
    await busy(button, async () => {
      await io.loadExcelJS();
      const blob = await io.exportDeptWorkbook(store.get(), months);
      const name = months.length === 1 ? `ntf-roster-${io.fileStamp(months[0])}.xlsx` : `ntf-roster-${io.fileStamp(months[0])}-to-${io.fileStamp(months[months.length - 1])}.xlsx`;
      io.download(blob, name);
      app.toast(`Downloaded ${name}`);
    });
  }
  const xlThis = row('Download this month', () => exportExcel([app.month], xlThis), { ic: 'download', sub: 'Excel, in the department sheet layout' });
  const xlRange = row('Download these months', () => {
    let a = fromSel.value, b = toSel.value;
    if (a > b) [a, b] = [b, a];
    const months = [];
    for (let m = a; m <= b && months.length < 24; m = M.addMonths(m, 1)) months.push(m);
    exportExcel(months, xlRange);
  }, { ic: 'download' });

  function printRoster() {
    if (app.tab !== 'roster') app.go('roster', { m: app.month });
    let tries = 0;
    const wait = () => {
      if (document.querySelector('.view-roster') || tries++ > 30) { setTimeout(() => window.print(), 150); return; }
      setTimeout(wait, 100);
    };
    wait();
  }

  const exportSec = section('more-export', 'Export', 'Excel has the department sheet\'s layout: sections, coloured codes, x after calls, weekends and holidays shaded, counts and a legend.',
    list(xlThis,
      h('div', { class: 'more-fields' }, h('label', { for: 'more-from' }, 'From'), fromSel, h('label', { for: 'more-to' }, 'to'), toSel),
      xlRange,
      row('Print or save as PDF', printRoster, { ic: 'print', sub: 'Opens the print dialog on the roster grid: choose Landscape and "Save as PDF"' }),
      row('Download CSV of this month', () => {
        io.download(new Blob([io.csvForMonth(store.get(), app.month)], { type: 'text/csv;charset=utf-8' }), `ntf-roster-${io.fileStamp(app.month)}.csv`);
      }, { ic: 'sheet' })));
  const calSec = section('more-cal', 'Calendar for one person', 'Open the file on a phone to add it to the calendar.',
    list(h('div', { class: 'more-fields more-person' }, h('label', { for: 'more-person' }, 'Person'), personSel),
      row('Download calendar', () => {
        const id = personSel.value;
        if (!id) return;
        const p = store.get().staff.find(s => s.id === id);
        io.download(new Blob([io.icsForPerson(store.get(), id, app.month)], { type: 'text/calendar;charset=utf-8' }), `ntf-roster-${slug(p && (p.short || p.name))}-${io.fileStamp(app.month)}.ics`);
      }, { ic: 'day', sub: 'Their shifts this month as all-day events (.ics)' })));

  // ---------- Backup ----------
  const backupSec = section('more-backup', 'Backup',
    store.isDemo ? 'The practice department lives in this browser only.' : 'Everything (staff, codes, rules, every month) in one file. Keep one now and then, especially before big changes.',
    list(row('Download backup', () => {
      io.download(new Blob([io.backupJSON(store.get())], { type: 'application/json' }), `ntf-roster-backup-${M.iso(new Date())}.json`);
    }, { ic: 'download' }),
    fileRow('Restore from a backup', '.json,application/json', onRestore)));

  async function onRestore(file) {
    let next;
    try { next = io.restoreJSON(await file.text()); } catch (e) { app.toast(e.message, { kind: 'error', ms: 7000 }); return; }
    const months = Object.keys(next.months || {}).length || new Set(Object.keys(next.cells || {}).map(M.monthOf)).size;
    const okd = await app.confirm(`Replace everything in this browser with ${file.name}? It has ${next.staff.length} people, ${next.rules.length} rules and ${months} month${months === 1 ? '' : 's'}. You can undo this straight after.`, { ok: 'Restore', danger: true });
    if (!okd) return;
    store.replace(next, 'Restore backup');
    app.toast('Backup restored', { action: { label: 'Undo', fn: () => store.undo() }, ms: 8000 });
  }

  // ---------- Settings ----------
  const deptInput = h('input', { type: 'text', id: 'more-dept', class: 'app-input', value: store.get().settings.dept || '', autocomplete: 'off' });
  deptInput.addEventListener('change', () => {
    const v = deptInput.value.trim();
    if (v === (store.get().settings.dept || '')) return;
    store.commit('Department name', d => { d.settings.dept = v; });
  });
  const holList = h('div');
  const holDate = h('input', { type: 'date', id: 'more-hol-date', class: 'app-input' });
  const holName = h('input', { type: 'text', id: 'more-hol-name', class: 'app-input', placeholder: 'e.g. Deepavali', autocomplete: 'off' });
  function renderHolidays() {
    const hol = store.get().settings.holidays || {};
    const dates = Object.keys(hol).sort();
    holList.innerHTML = '';
    if (!dates.length) { holList.append(h('p', { class: 'app-section-footer' }, 'No public holidays yet. Load the Singapore list or add them one by one.')); return; }
    let year = '';
    let ul = null;
    for (const d of dates) {
      if (d.slice(0, 4) !== year) {
        year = d.slice(0, 4);
        ul = h('ul', { class: 'app-list more-hols' });
        holList.append(h('section', { class: 'app-section', 'aria-label': `Public holidays ${year}` }, h('h3', { class: 'app-section-header' }, year), ul));
      }
      // the name is the row's title and the date sits under it (side by side, a phone squeezed the name)
      ul.append(h('li', null, h('div', { class: 'app-row' },
        h('span', { class: 'app-row-body' }, h('span', { class: 'app-row-title' }, hol[d]), h('span', { class: 'app-row-sub' }, M.fmtDay(d))),
        h('button', { type: 'button', class: 'app-btn app-btn--plain app-btn--compact more-rm', 'aria-label': `Remove ${hol[d]} (${M.fmtDay(d)} ${year})`, onclick: () => {
          store.commit(`Remove holiday ${hol[d]}`, s => { delete s.settings.holidays[d]; });
        } }, 'Remove'))));
    }
  }
  function addHoliday() {
    const d = holDate.value, n = holName.value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { app.toast('Pick a date first', { kind: 'warn' }); holDate.focus(); return; }
    if (!n) { app.toast('Give the holiday a name', { kind: 'warn' }); holName.focus(); return; }
    store.commit(`Add holiday ${n}`, s => { s.settings.holidays[d] = n; });
    holDate.value = ''; holName.value = '';
  }
  holName.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addHoliday(); } });
  function loadSg() {
    const have = store.get().settings.holidays || {};
    const add = Object.keys(SG_HOLIDAYS).filter(d => !have[d]);
    if (!add.length) { app.toast('All Singapore public holidays for 2026 and 2027 are already in the list'); return; }
    store.commit('Load Singapore public holidays', s => { for (const d of add) s.settings.holidays[d] = SG_HOLIDAYS[d]; });
    app.toast(`Added ${add.length} public holiday${add.length === 1 ? '' : 's'}`, { action: { label: 'Undo', fn: () => store.undo() } });
  }
  renderHolidays();

  const settingsSec = section('more-settings', 'Settings', null,
    list(h('div', { class: 'more-dept' }, h('label', { class: 'app-field' }, h('span', { class: 'app-field-label' }, 'Department name'), deptInput))));
  const holSec = section('more-hols', 'Public holidays', 'Holidays are shaded on the roster, count as non-working days and drive holiday rules (like the public holiday day shift).',
    list(h('div', { class: 'more-hol-add' },
      h('label', { class: 'sr-only', for: 'more-hol-date' }, 'Holiday date'), holDate,
      h('label', { class: 'sr-only', for: 'more-hol-name' }, 'Holiday name'), holName,
      h('button', { type: 'button', class: 'app-btn app-btn--secondary app-btn--compact', onclick: addHoliday, html: `${icon('plus')}<span>Add</span>` })),
    row('Load Singapore public holidays (2026 to 2027)', loadSg, { cls: 'app-row--action' })));

  // ---------- Team ----------
  let teamView = null;
  const teamSlot = h('div', { class: 'more-team' });
  const teamSec = section('more-team', 'Team sharing', null, list(teamSlot));
  if (store.isDemo) {
    teamSlot.append(h('p', { class: 'more-p' }, 'Team sharing is off in the practice department.'));
  } else {
    teamSlot.append(h('div', { 'aria-busy': 'true', 'aria-label': 'Loading' }, h('span', { class: 'app-skeleton app-skeleton--line' }), h('span', { class: 'app-skeleton app-skeleton--short', style: { marginTop: '8px' } })));
    import('./ui-team.js').then(mod => {
      teamSlot.innerHTML = '';
      if (typeof mod.mountTeam !== 'function') throw new Error('no mountTeam');
      teamView = mod.mountTeam(teamSlot, app) || null;
    }).catch(() => {
      teamSlot.innerHTML = '';
      teamSlot.append(h('p', { class: 'more-p' }, 'Team sharing is not set up yet. Until then this roster lives in this browser only: download a backup now and then.'));
    });
  }

  // ---------- Start again ----------
  const startSec = section('more-start', store.isDemo ? 'Practice department' : 'Start again', store.isDemo
    ? 'This is a made-up department for trying things out. Changes stay in this browser.'
    : 'Clears the roster in this browser and starts empty (default codes and rules). Download a backup first if you might want it back.',
    list(store.isDemo
      ? h('a', { class: 'app-row app-row--action', href: './' }, rowParts('Go to your own roster'))
      : h('a', { class: 'app-row app-row--action', href: './?demo', target: '_blank', rel: 'noopener' }, rowParts('Try the practice department')),
    store.isDemo
      ? row('Reset the practice department', resetPractice, { cls: 'app-row--danger' })
      : row('Start again (clear this browser)', startAgain, { cls: 'app-row--danger' })));

  async function startAgain() {
    const okd = await app.confirm('Clear everything in this browser and start with an empty roster? Staff, rules and every month go. You can undo straight after, but not once you leave the page.', { ok: 'Clear and start again', danger: true });
    if (!okd) return;
    store.replace(M.defaultState(), 'Start again');
    app.toast('Started again with an empty roster', { action: { label: 'Undo', fn: () => store.undo() }, ms: 8000 });
  }
  async function resetPractice() {
    const okd = await app.confirm('Start the practice department again? Your practice changes will be replaced.', { ok: 'Reset practice' });
    if (!okd) return;
    const { demoState } = await import('./demo.js');
    store.replace(demoState(M.iso(new Date())), 'Reset practice');
    app.toast('Practice department reset', { action: { label: 'Undo', fn: () => store.undo() } });
  }

  // ---------- People link on phone (the shell adds one above this screen; this is a fallback) ----------
  const view = el.closest('.view');
  if (app.isPhone() && !(view && view.querySelector('.link-card'))) {
    root.append(h('div', { class: 'app-section' }, list(h('a', { href: '#people', class: 'app-row link-card', onclick: (e) => { e.preventDefault(); app.go('people'); } },
      rowParts('People', 'people', 'Staff, groups, tags and duty codes'), h('span', { class: 'app-row-chevron', 'aria-hidden': 'true' })))));
  }

  // ---------- version lines ----------
  const foot = h('div', { class: 'more-foot' });
  import('./version.js').then(mod => {
    if (typeof mod.renderVersion !== 'function') return;
    const out = mod.renderVersion(foot);
    if (out instanceof Node && !out.parentNode) foot.append(out);
  }).catch(() => { /* version helper not there yet: show nothing */ });

  root.append(importSec, exportSec, calSec, backupSec, settingsSec, holSec, holList, teamSec, startSec, foot);

  return {
    update(state) {
      if (document.activeElement !== deptInput) deptInput.value = state.settings.dept || '';
      renderHolidays();
      fillPeople();
      if (teamView && typeof teamView.update === 'function') { try { teamView.update(state); } catch (e) { console.error(e); } }
    },
    unmount() {
      if (teamView && typeof teamView.unmount === 'function') { try { teamView.unmount(); } catch (e) { console.error(e); } }
    },
  };
}
