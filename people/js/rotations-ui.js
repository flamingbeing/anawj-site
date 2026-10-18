// People › Rotations: shows the department's master block rotation sheet (an .xlsx saved from Google Sheets) as a grid,
// who has done what, and people per posting per week. Read-only and on this device: the file is read in the browser, nothing
// is uploaded or saved (it is gone when the page closes). Reading lives in rotations.js.

import { h, fill, toast, modal, empty } from '../../evals/js/ui-core.js';
import { CODE_KEY, INSTITUTIONS, splitCode, parseBlockSheet, readable, manpower, unknownCodes, history, sampleRows, suggestLinks, exportRotations, exportPlacements } from './rotations.js';
import { nameScore } from './batch.js';

// What is loaded stays while People is open (switching tabs doesn't lose it).
const R = { tabs: [], skipped: [], cur: 0, q: '', code: '', file: '', sample: false };

// ExcelJS: the logbook already ships it, and apmes.anawj.com serves that folder, so it is not copied again here.
let excel = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excel) excel = new Promise((resolve, reject) => {
    const s = h('script', { src: new URL('../../logbook/vendor/exceljs.min.js', import.meta.url).href });
    s.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('The Excel reader did not load')));
    s.onerror = () => { excel = null; reject(new Error('Could not load the Excel reader. Check your connection and try again.')); };
    document.head.append(s);
  });
  return excel;
}

// ---------- pull mode: NUH Junior Monthly asked for its critical postings ----------
// The roster app opens People with ?pull=rotations. We say hello to the tab that opened us, it answers with its staff names,
// the posting codes it accepts and the weeks it shows, and the user checks the links and taps Send. Nothing goes before that.
const JM_ORIGIN = 'https://nuhjuniormonthly.anawj.com';
const NTF_ORIGIN = 'https://ntfroster.anawj.com';
// The two roster apps that can ask, by their ?pull= value. Each is trusted only at its own address, and keeps its own name links.
const PULL_APPS = {
  rotations: { label: 'NUH Junior Monthly', hello: 'nuhjm-pull-info', linksKey: 'people-rot-links-v1', origin: JM_ORIGIN },
  ntf: { label: 'NTF Roster', hello: 'ntf-pull-info', linksKey: 'people-rot-links-ntf-v1', origin: NTF_ORIGIN },
};
const PULL_APP = PULL_APPS[new URLSearchParams(location.search).get('pull')] || null;
const PULL = { info: null, sent: false, provisional: false, elective: false };
const pullOpener = () => { try { return window.opener && !window.opener.closed ? window.opener : null; } catch (e) { return null; } };
const pullOrigins = () => [...new Set([PULL_APP ? PULL_APP.origin : JM_ORIGIN, location.origin])];
let onPullInfo = null;
function sayHello() {
  const op = pullOpener();
  if (!op) return;
  for (const o of pullOrigins()) { try { op.postMessage({ type: 'people-pull-hello' }, o); } catch (e) { /* not that origin */ } }
}
if (PULL_APP) {
  window.addEventListener('message', e => {
    if (!pullOrigins().includes(e.origin) || e.source !== pullOpener()) return;
    const d = e.data;
    if (!d || d.type !== PULL_APP.hello || !Array.isArray(d.names) || (PULL_APP === PULL_APPS.rotations && !Array.isArray(d.codes))) return;
    PULL.info = { names: d.names.map(String).slice(0, 500), codes: (Array.isArray(d.codes) ? d.codes : []).map(String).slice(0, 100), from: String(d.from || ''), to: String(d.to || ''), month: String(d.month || '') };
    PULL.sent = false;
    if (onPullInfo) onPullInfo();
  });
  sayHello();
}

// Who on the sheet is who in the roster, chosen by hand once and kept in this browser (names only; '' = not in the roster).
const LINKS_KEY = PULL_APP ? PULL_APP.linksKey : 'people-rot-links-v1';
const loadLinks = () => { try { const o = JSON.parse(localStorage.getItem(LINKS_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
const saveLinks = o => { try { localStorage.setItem(LINKS_KEY, JSON.stringify(o)); } catch (e) { /* private mode: it just isn't kept */ } };

const pad = n => String(n).padStart(2, '0');
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
    if ('result' in v) return cellText(v.result);
    if ('text' in v) return cellText(v.text);
    return '';
  }
  return String(v).replace(/ /g, ' ').trim();
}
function sheetRows(ws) {
  const cols = Math.min(ws.columnCount || 80, 90), n = Math.min(ws.rowCount || 0, 400);
  const rows = [];
  for (let r = 1; r <= n; r++) {
    const vals = ws.getRow(r).values || [];
    rows.push(Array.from({ length: cols }, (_, i) => cellText(vals[i + 1])));
  }
  return rows;
}
// '26-27 Block' → 26, so the newest year comes first
const yearOf = name => { const m = /(\d{2})\s*-\s*(\d{2})/.exec(name); return m ? +m[1] : 0; };

async function readWorkbook(file) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const tabs = [], skipped = [];
  wb.eachSheet(ws => {
    if (!/block/i.test(ws.name)) return;
    const parsed = parseBlockSheet(sheetRows(ws));
    if (readable(parsed)) tabs.push({ name: ws.name, parsed }); else skipped.push(ws.name);
  });
  tabs.sort((a, b) => yearOf(b.name) - yearOf(a.name));
  return { tabs, skipped };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = iso => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

function cellInfo(raw) {
  const sc = splitCode(raw);
  if (!sc) return null;
  const known = sc.parts[0].known;
  const cls = ['rt-c'];
  if (!known || sc.unknown) cls.push('rt-unk'); else cls.push('rt-i-' + known[0], 'rt-t-' + known[1]);
  if (sc.provisional) cls.push('rt-prov');
  if (sc.parts[0].elective) cls.push('rt-el');
  const meaning = sc.parts.map(p => (p.known ? `${p.code}: ${p.known[2]} (${INSTITUTIONS[p.known[0]]})` : `${p.code}: not in the code key`)).join('\n');
  return { sc, cls: cls.join(' '), title: (sc.provisional ? 'Provisional. ' : '') + meaning };
}
const hits = (sc, code) => sc && sc.parts.some(p => p.code === code || p.base === code);

export function rotationsScreen({ demo = false } = {}) {
  const root = h('div', { class: 'e-stack' });
  const file = h('input', { type: 'file', id: 'rt-file', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', class: 'rt-file', hidden: true, 'aria-label': 'Rotation sheet file' });
  const status = h('p', { class: 'e-small', role: 'status', 'aria-live': 'polite' });
  const view = h('div', { class: 'e-stack' });
  const pullBox = h('div', { class: 'e-stack', id: 'rt-pull' });
  onPullInfo = () => drawPull();

  const load = async f => {
    status.textContent = `Reading ${f.name}…`;
    try {
      const { tabs, skipped } = await readWorkbook(f);
      Object.assign(R, { tabs, skipped, cur: 0, q: '', code: '', file: f.name, sample: false });
      status.textContent = tabs.length ? '' : 'No readable year tabs in that file. It should have tabs like “26-27 Block”.';
    } catch (e) { status.textContent = 'Couldn’t read that file: ' + (e.message || e); }
    draw();
  };
  file.addEventListener('change', () => { if (file.files[0]) load(file.files[0]); });
  const useSample = () => {
    const parsed = parseBlockSheet(sampleRows());
    Object.assign(R, { tabs: [{ name: 'Sample 27 Block', parsed }], skipped: [], cur: 0, q: '', code: '', file: 'made-up sample', sample: true });
    draw();
  };

  root.append(
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Rotations'),
      h('p', { class: 'e-small' }, 'The department’s master block rotation sheet, week by week: where each person is placed, who has done what, and how many are on each posting. In Google Sheets choose File › Download › Microsoft Excel (.xlsx), then open the file here.'),
      h('p', { class: 'e-hint' }, 'It is read on this device only. Nothing is uploaded or saved, and it is gone when you close the page. The sheet is not changed.'),
      h('div', { class: 'e-actions e-actions--start' },
        h('button', { class: 'a-btn e-btn-small', type: 'button', onclick: () => file.click() }, 'Open the rotation sheet (.xlsx)'), file,
        demo ? h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: useSample }, 'Use a made-up sample') : null),
      status),
    pullBox, view);

  function drawPull() {
    if (!PULL.info) {
      if (PULL_APP) { sayHello(); fill(pullBox, h('section', { class: 'e-card' }, h('p', { class: 'e-small', role: 'status' }, pullOpener()
        ? `Waiting for ${PULL_APP.label} to say what it needs…` : `${PULL_APP.label} asked for postings, but this tab can’t reach it (it was opened another way). Open People from ${PULL_APP === PULL_APPS.ntf ? 'More › Pull rotations from APMES People…' : 'Postings › Pull from APMES People…'} in that app.`))); }
      else fill(pullBox);
      return;
    }
    const info = PULL.info;
    if (!R.tabs.length) { fill(pullBox, h('section', { class: 'e-card' }, h('h2', { class: 'e-h2', style: 'margin-top:0' }, `Postings for ${PULL_APP.label}`),
      h('p', { class: 'e-small' }, `It asked for ${info.from} to ${info.to}. Open the rotation sheet above, then check who is who and send.`))); return; }
    const parsed = R.tabs[Math.min(R.cur, R.tabs.length - 1)].parsed;
    const links = loadLinks();
    const everyone = parsed.sections.flatMap(s => s.people);
    const suggested = suggestLinks(everyone, info.names, nameScore);
    const ntf = PULL_APP === PULL_APPS.ntf;
    const out = ntf ? exportPlacements(parsed, { from: info.from, to: info.to, links, suggested })
      : exportRotations(parsed, { accepted: info.codes, from: info.from, to: info.to, links, suggested, provisional: PULL.provisional, elective: PULL.elective });
    const rowsToLink = [...out.people.map(p => ({ ...p, cells: p.cells })), ...out.unlinked];
    const sel = person => {
      const cur = Object.prototype.hasOwnProperty.call(links, person.key) ? links[person.key] : suggested.get(person.key) || '';
      const known = Object.prototype.hasOwnProperty.call(links, person.key) || suggested.has(person.key);
      const ranked = info.names.slice().sort((a, b) => nameScore(person.name, b) - nameScore(person.name, a) || a.localeCompare(b));
      const el = h('select', { class: 'e-select rt-link', 'aria-label': `Roster name for ${person.name}`, 'data-key': person.key,
        onchange: e => { const l = loadLinks(); l[person.key] = e.target.value === '__none' ? '' : e.target.value; saveLinks(l); drawPull(); } },
        h('option', { value: '' , disabled: known }, known ? '—' : 'Choose…'),
        h('option', { value: '__none' }, 'Not in the roster'),
        ranked.map(n => h('option', { value: n }, n)));
      el.value = !known ? '' : cur === '' ? '__none' : cur;
      return el;
    };
    const send = () => {
      const op = pullOpener();
      if (!op) { toast(`This tab lost ${PULL_APP.label}. Open People again from that app.`); return; }
      for (const o of pullOrigins()) { try { op.postMessage({ type: 'people-rotations', text: out.text }, o); } catch (e) { /* not that origin */ } }
      PULL.sent = true;
      try { op.focus(); } catch (e) { /* the browser decides */ }
      drawPull();
    };
    fill(pullBox, h('section', { class: 'e-card', id: 'rt-pullcard' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, `Postings for ${PULL_APP.label}`),
      h('p', { class: 'e-small' }, ntf ? `It asked for where each person is posted or away, week by week, ${info.from} to ${info.to}: the hospital, or leave or an exam week. Only that goes over, with the roster’s own names; nothing is sent until you tap Send. Choose who each sheet name is once: it is remembered in this browser.`
        : `It asked for ICU, cardiac and OG float postings, ${info.from} to ${info.to}. Only those go over, with the roster’s own names; nothing is sent until you tap Send. Choose who each sheet name is once: it is remembered in this browser.`),
      ntf ? null : h('div', { class: 'rt-opts' },
        h('label', { class: 'e-small' }, h('input', { type: 'checkbox', id: 'rt-kiv', checked: PULL.provisional, onchange: e => { PULL.provisional = e.target.checked; drawPull(); } }), ' Include provisional (KIV)'),
        h('label', { class: 'e-small' }, h('input', { type: 'checkbox', id: 'rt-el', checked: PULL.elective, onchange: e => { PULL.elective = e.target.checked; drawPull(); } }), ' Include electives (-E)')),
      rowsToLink.length ? h('div', { class: 'rt-scroll', tabindex: '0', role: 'region', 'aria-label': 'Who is who' }, h('table', { class: 'rt-table' },
        h('thead', {}, h('tr', {}, h('th', { class: 'rt-name', scope: 'col' }, 'On the sheet'), h('th', { scope: 'col' }, 'Weeks'), h('th', { scope: 'col' }, 'In the roster'))),
        h('tbody', {}, rowsToLink.map(p => h('tr', {}, h('th', { class: 'rt-name', scope: 'row' }, p.name, p.origin ? h('span', { class: 'rt-origin' }, p.origin) : null), h('td', { class: 'rt-n' }, p.cells), h('td', {}, sel(p)))))))
        : h('p', { class: 'e-small' }, ntf ? 'No postings or leave in those weeks on this tab.' : 'No ICU, cardiac or OG float postings in those weeks on this tab.'),
      out.unlinked.length ? h('p', { class: 'e-hint' }, `${plural(out.unlinked.length, 'person has', 'people have')} no roster name yet and will not be sent.`) : null,
      h('div', { class: 'e-actions e-actions--start' },
        h('button', { class: 'a-btn', type: 'button', id: 'rt-send', disabled: !out.people.length, onclick: send }, `Send ${plural(out.people.length, 'person', 'people')} to ${PULL_APP.label}`)),
      PULL.sent ? h('p', { class: 'e-small', role: 'status' }, `Sent. Switch back to ${PULL_APP.label}: the postings are in its Paste rotations box, ready to Apply.`) : null));
  }

  function draw() {
    drawPull();
    if (!R.tabs.length) { fill(view); return; }
    const tab = R.tabs[Math.min(R.cur, R.tabs.length - 1)];
    const { parsed } = tab;
    const unknown = unknownCodes(parsed);
    const people = parsed.sections.reduce((n, s) => n + s.people.length, 0);

    const pick = h('select', { class: 'e-select rt-sel', id: 'rt-year', 'aria-label': 'Year', onchange: e => { R.cur = +e.target.value; draw(); } },
      R.tabs.map((t, i) => h('option', { value: i }, t.name)));
    pick.value = String(R.cur);
    const q = h('input', { class: 'e-input rt-q', type: 'search', id: 'rt-q', placeholder: 'Find a name', 'aria-label': 'Find a name', value: R.q,
      oninput: e => { R.q = e.target.value; paintGrid(); } });
    const codes = [...new Set(parsed.sections.flatMap(s => s.people.flatMap(p => p.codes.map(c => splitCode(c)).filter(Boolean).map(sc => sc.parts[0].base))))].sort();
    const code = h('select', { class: 'e-select rt-sel', id: 'rt-code', 'aria-label': 'Posting', onchange: e => { R.code = e.target.value; paintGrid(); } },
      h('option', { value: '' }, 'All postings'), codes.map(c => h('option', { value: c }, CODE_KEY[c] ? `${c}: ${CODE_KEY[c][2].slice(0, 48)}` : c)));
    code.value = R.code;
    const grid = h('div', { class: 'rt-scroll', tabindex: '0', role: 'region', 'aria-label': 'Rotation grid' });

    const legend = h('ul', { class: 'rt-legend', 'aria-label': 'Colours' }, [['NUH', 'NUH'], ['NTF', 'NTF'], ['KKH', 'KKH'], ['TTSH', 'TTSH'], ['other', 'Another hospital'], ['none', 'Leave, exams, not at a hospital']]
      .map(([k, l]) => h('li', {}, h('i', { class: `rt-c rt-i-${k}` }), l)),
      h('li', {}, h('i', { class: 'rt-c rt-prov rt-i-NUH' }), 'Provisional (KIV)'));

    fill(view,
      h('section', { class: 'e-card' },
        h('div', { class: 'rt-bar' }, pick, q, code),
        h('p', { class: 'e-small', style: 'margin:10px 0 0' },
          `${R.file}: ${plural(people, 'person', 'people')}, ${plural(parsed.weeks.length, 'week', 'weeks')} from ${dm(parsed.weeks[0].start)}/${parsed.weeks[0].start.slice(0, 4)}. Tap a name for what they have done.`,
          R.skipped.length ? ` Older tabs not read (their layout differs): ${R.skipped.join(', ')}.` : ''),
        legend),
      grid,
      unknown.length ? h('p', { class: 'e-hint' }, `Not in the code key (${unknown.length}): ${unknown.slice(0, 12).map(u => `${u.code} ×${u.count}`).join(', ')}${unknown.length > 12 ? '…' : ''}`) : null,
      manpowerCard(parsed));
    paintGrid();

    function paintGrid() {
      const needle = R.q.trim().toLowerCase();
      const table = h('table', { class: 'rt-table' });
      // month row, then the week-start row
      const months = [];
      parsed.weeks.forEach(w => { const m = months[months.length - 1]; if (m && m.month === w.month) m.n++; else months.push({ month: w.month, n: 1 }); });
      table.append(h('thead', {},
        h('tr', {}, h('th', { class: 'rt-name', scope: 'col', rowspan: 2 }, 'Name'), months.map(m => h('th', { colspan: m.n, scope: 'colgroup', class: 'rt-mon' }, `${MONTHS[+m.month.slice(5) - 1]} ${m.month.slice(2, 4)}`))),
        h('tr', {}, parsed.weeks.map(w => h('th', { scope: 'col', class: 'rt-wk' + (w.holiday ? ' rt-hol' : ''), title: w.label }, dm(w.start))))));
      const body = h('tbody');
      let shown = 0;
      for (const s of parsed.sections) {
        const rows = s.people.filter(p => (!needle || p.name.toLowerCase().includes(needle))
          && (!R.code || p.codes.some(c => hits(splitCode(c), R.code))));
        if (!rows.length) continue;
        body.append(h('tr', { class: 'rt-sec' }, h('th', { colspan: parsed.weeks.length + 1, scope: 'colgroup' }, s.label || 'Others')));
        for (const p of rows) {
          shown++;
          body.append(h('tr', {},
            h('th', { class: 'rt-name', scope: 'row' }, h('button', { type: 'button', class: 'rt-who', onclick: () => personDialog(p) }, p.name), p.origin ? h('span', { class: 'rt-origin' }, p.origin) : null),
            p.codes.map(raw => {
              const info = cellInfo(raw);
              if (!info) return h('td', {});
              const hit = R.code && hits(info.sc, R.code);
              return h('td', { class: `${info.cls}${R.code ? (hit ? ' rt-hit' : ' rt-dim') : ''}`, title: info.title }, info.sc.raw);
            })));
        }
      }
      table.append(body);
      fill(grid, shown ? table : h('p', { class: 'e-small', style: 'padding:14px' }, 'Nobody matches.'));
    }
  }

  function manpowerCard(parsed) {
    const rows = manpower(parsed, { skip: s => /^external/i.test(s.label) }).slice(0, 40);
    return h('details', { class: 'e-card rt-man' },
      h('summary', {}, 'People per posting per week (not counting external residents)'),
      h('div', { class: 'rt-scroll', tabindex: '0', role: 'region', 'aria-label': 'People per posting per week' },
        h('table', { class: 'rt-table' },
          h('thead', {}, h('tr', {}, h('th', { class: 'rt-name', scope: 'col' }, 'Posting'), parsed.weeks.map(w => h('th', { scope: 'col', class: 'rt-wk' }, dm(w.start))))),
          h('tbody', {}, rows.map(r => h('tr', {}, h('th', { class: 'rt-name', scope: 'row', title: CODE_KEY[r.code] ? CODE_KEY[r.code][2] : '' }, r.code),
            r.byWeek.map(n => h('td', { class: n ? 'rt-n' : 'rt-n rt-z' }, n || '·'))))))));
  }

  function personDialog(p) {
    const rows = history(R.tabs, p.key);
    const names = R.tabs.map(t => t.name);
    const body = h('div', { class: 'e-stack' },
      h('p', { class: 'e-small' }, `Weeks on each posting, from the tabs open here. The sheet gives only a name, so people with the same name are counted together. A week with two codes counts for the first.`),
      rows.length
        ? h('div', { class: 'rt-scroll' }, h('table', { class: 'rt-table rt-hist' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'rt-name' }, 'Posting'), names.map(n => h('th', { scope: 'col' }, n.replace(/ Block$/, ''))), h('th', { scope: 'col' }, 'Total'))),
          h('tbody', {}, rows.map(r => h('tr', {}, h('th', { scope: 'row', class: 'rt-name', title: CODE_KEY[r.code] ? CODE_KEY[r.code][2] : '' }, r.code),
            names.map(n => h('td', { class: 'rt-n' }, r.byTab[n] || '·')), h('td', { class: 'rt-n' }, r.total))))))
        : h('p', { class: 'e-small' }, 'No postings found.'));
    modal(p.name + (p.origin ? ` (${p.origin})` : ''), body);
  }

  if (R.tabs.length) draw(); else drawPull();
  return root;
}
