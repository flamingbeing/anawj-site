// Rotations: reads the department's master block rotation sheet (one tab per academic year: a weekly grid, names down,
// one posting code per week) into plain data. No page code, so people/test/rotations.test.mjs runs it in Node.
// Read-only and in the browser: nothing here is stored or sent anywhere. The rotation sheet itself stays the planner's.
//
// The grid (as found, owner's sheet, Oct 2026): row 1 has a date in the first column of each month, row 2 a week label
// ("13-19", "3*-9" with a star for a public holiday, "31-6" across a month, the first label may carry a note in brackets);
// column A has names and section labels (RESIDENT PHYSICIANS, SR2 RESIDENTS … CA1 Residents, FELLOWS, External Residents);
// the names are repeated in a column or two inside the grid (for reading across), and for External Residents that
// repeated cell holds where the person comes from (ED, SIG, TTSH…) instead. "TOTAL PROJECTED MANPOWER" ends the people.

// ---------- the code key ----------
// What each code on the sheet means (owner, 16 Oct 2026): [institution, type, meaning].
// institution: NUH, NTF, KKH, TTSH, other (another hospital), none (not at a hospital).
// type: post (a clinical posting), exam (exam or study), leave, other (a tag or a non-posting).
// Notation on top of the codes: a "-E" suffix is the elective version of a posting (an elective is not always at the base
// code's place, and mostly doesn't count toward manpower); a "KIV" prefix means provisional; a slash joins two codes in one week.
export const CODE_KEY = {
  'AH-AMB': ['other', 'post', 'Alexandra Hospital ambulatory (outpatient) surgery'],
  AL: ['none', 'leave', 'Annual leave'],
  AMB: ['NUH', 'post', 'Ambulatory anaesthesia at NUH (as opposed to AH)'],
  AOCC: ['NUH', 'post', 'Perioperative medicine (the anaesthetic outpatient consultation clinic)'],
  AP: ['NUH', 'post', 'Acute pain'],
  C: ['NUH', 'post', 'Cardiac anaesthesia'],
  'C-e': ['NUH', 'post', 'Cardiac echo week'],
  'C-p': ['NUH', 'post', 'Cardiac perfusion week'],
  CP: ['NUH', 'post', 'Chronic pain'],
  Dental: ['NUH', 'post', 'Dental surgery'],
  ED: ['other', 'other', 'Tag, not a posting: an external resident from ED'],
  Elective: ['none', 'other', 'An elective outside the department; mostly not counted toward manpower'],
  ENT: ['NUH', 'post', 'ENT, airway, head and neck surgery; difficult airway'],
  FUN: ['NUH', 'post', 'Fundamentals: the same as GC; residents need it to meet the APMES posting requirements'],
  GC: ['NUH', 'post', 'General clinical: ordinary OT work, no specific posting'],
  GS: ['NUH', 'other', 'Tag, not a posting: an external resident from general surgery (in the posting grid it is a typo for GC)'],
  Gynae: ['NUH', 'post', 'Gynaecological surgery'],
  ICU: ['NUH', 'post', 'ICU'],
  'KIV AL': ['none', 'leave', 'Provisional annual leave'],
  'KIV Elective': ['none', 'other', 'A provisional elective'],
  'KIV ICU': ['NUH', 'post', 'Possibly ICU (provisional)'],
  KKH: ['KKH', 'post', 'Paediatric anaesthesia rotation at KKH'],
  Liver: ['NUH', 'post', 'Liver transplant anaesthesia'],
  'Liver-E': ['NUH', 'post', 'Liver transplant elective'],
  LivOT: ['NUH', 'post', 'Liver anaesthesia'],
  'LivOT-E': ['NUH', 'post', 'Liver OT elective'],
  ML: ['none', 'leave', 'Maternity leave'],
  'ML/ NPL': ['none', 'leave', 'Maternity leave and no-pay leave together'],
  Neu: ['NUH', 'post', 'Neuroanaesthesia'],
  NPL: ['none', 'leave', 'No-pay leave'],
  'NTF ICU': ['NTF', 'post', 'ICU at NTF'],
  NTFGH: ['NTF', 'post', 'An NTF posting'],
  'NTFGH-JR': ['NTF', 'post', 'Junior residency posting at NTF (separate from the regional posting there)'],
  'NTFGH-RA': ['NTF', 'post', 'Regional anaesthesia at NTF'],
  'NTFGH-SR': ['NTF', 'post', 'Senior residency posting at NTF'],
  OG1: ['NUH', 'post', 'Obstetric OT'],
  OG2: ['NUH', 'post', 'Obstetric OT'],
  OGDF: ['NUH', 'post', 'Obstetric day float: weekdays 8 to 5, no post call'],
  OGNF1: ['NUH', 'post', 'Obstetric night float (first resident)'],
  OGNF2: ['NUH', 'post', 'Obstetric night float (second resident); numbered because the floaters alternate, with post call'],
  OR: ['NUH', 'post', 'The same as GC'],
  Ortho: ['NUH', 'other', 'Tag, not a posting: an external resident from orthopaedics'],
  Paed: ['NUH', 'post', 'Paediatric anaesthesia'],
  'Paed-E': ['NUH', 'post', 'Paediatric anaesthesia elective'],
  'Paeds/ GC': ['NUH', 'post', 'Paediatrics, or GC if there are too few paediatric cases (unconfirmed)'],
  'Pall-E': ['other', 'other', 'Palliative care elective (not anaesthesia)'],
  'Part A': ['none', 'exam', 'Part A exam. Part B must be passed to become SR, Part C to become AC'],
  'Part B': ['none', 'exam', 'Part B exam week; may not be in hospital'],
  'Part B SAQ': ['none', 'exam', 'Part B exam (SAQ)'],
  'Part C': ['none', 'exam', 'Part C exam; may be on study or exam leave'],
  Prep: ['NUH', 'exam', 'Exam preparation: easier lists, more study leave'],
  RA: ['NUH', 'post', 'Regional anaesthesia'],
  'RA-E': ['NTF', 'post', 'Regional anaesthesia elective (place unconfirmed)'],
  Remote: ['NUH', 'post', 'Remote anaesthesia'],
  RR: ['NUH', 'post', 'Recovery room (PACU only)'],
  SAF: ['none', 'leave', 'National service (NS in the roster app)'],
  SIG: ['NUH', 'other', 'Tag, not a posting: an external resident from a non-anaesthesia specialty'],
  SR: ['NUH', 'post', 'Special risk: higher-risk cases (thoracic, major GS resections, long flaps)'],
  SRe: ['NUH', 'post', 'Special risk elective'],
  Thoracic: ['NUH', 'post', 'Thoracic anaesthesia (priority for those posted to it)'],
  'Thoracic/ Tag APS': ['NUH', 'post', 'Thoracic, or tagged on to acute pain'],
  TTSH: ['TTSH', 'other', 'Tag, not a posting: an external resident from TTSH'],
  'TTSH NICU': ['TTSH', 'post', 'Neuro ICU at TTSH'],
  'TTSH Neu': ['TTSH', 'post', 'Neuroanaesthesia at TTSH'],
  UGIT: ['NUH', 'post', 'Upper GI surgery (rarely matters to rosterers)'],
  Vascular: ['NUH', 'post', 'Vascular anaesthesia'],
};
export const INSTITUTIONS = { NUH: 'NUH', NTF: 'NTF', KKH: 'KKH', TTSH: 'TTSH', other: 'Another hospital', none: 'Not at a hospital' };

// One cell's text as codes: { raw, provisional, parts: [{ code, base, elective, known }], combo, unknown }.
// An exact entry in the key wins ("C-e", "Liver-E", "ML/ NPL"); otherwise a KIV prefix, a slash and a -E suffix are read.
export function splitCode(raw, key = CODE_KEY) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  // the entry a typed code means: as typed, without a trailing dot ("ICU."), or in other capitals ("PART B"); not for short
  // codes, where "C-e" (echo week) and "C-E" must stay apart
  const canon = p => (key[p] ? p : key[p.replace(/\.$/, '')] ? p.replace(/\.$/, '')
    : (p.length >= 4 && Object.keys(key).find(k => k.toLowerCase() === p.toLowerCase())) || p);
  const mk = raw1 => {
    const p = canon(raw1);
    const exact = key[p] || null;
    const e = /-E$/.test(p);
    const baseCode = e ? p.slice(0, -2) : p;
    const viaBase = e && key[baseCode] ? key[baseCode] : null;
    return { code: p, base: viaBase ? baseCode : p, elective: e && (!!viaBase || !!exact), known: exact || viaBase };
  };
  const whole = canon(text);
  if (key[whole]) return { raw: text, provisional: /^KIV /i.test(whole), parts: [mk(whole)], combo: false, unknown: false };
  let rest = text, provisional = false;
  const kiv = /^KIV\s+(.+)$/i.exec(rest);
  if (kiv) { provisional = true; rest = kiv[1].trim(); }
  const parts = rest.split(/\s*\/\s*/).filter(Boolean).map(mk);
  if (!parts.length) return null;
  return { raw: text, provisional, parts, combo: parts.length > 1, unknown: parts.some(p => !p.known) };
}

// ---------- reading the grid ----------
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

// The weekly columns: [{ col, start (iso date, a Monday except where a note says otherwise), label, month }]
export function weekColumns(row1 = [], row2 = []) {
  const out = [];
  let prev = null;
  let marker = null;   // the latest month date seen in row 1, at or before this column
  const n = Math.max(row1.length, row2.length);
  for (let c = 1; c < n; c++) {
    const m1 = ISO.exec(String(row1[c] ?? ''));
    if (m1) marker = utc(+m1[1], +m1[2], 1);
    const label = String(row2[c] ?? '');
    // the range is the last "7-13" in the label ("CNY 7-8\n\n1*-7" has a note before it, "(MOPEX changeover)\n7* (T)-12" in brackets)
    const found = [...label.replace(/\([^)]*\)/g, ' ').matchAll(/(\d{1,2})\s*\*?\s*-\s*(\d{1,2})/g)];
    if (!found.length) continue;
    const day = +found[found.length - 1][1];
    let start = null;
    if (!prev) {
      if (marker) start = utc(marker.getUTCFullYear(), marker.getUTCMonth() + 1, day);
    } else {
      const next = new Date(prev.getTime() + 7 * 86400000);
      if (next.getUTCDate() === day) start = next;                      // weeks follow each other
      else for (let k = 1; k <= 14 && !start; k++) {                      // a short or long week, or one unreadable label between: look ahead
        const d = new Date(prev.getTime() + k * 86400000);
        if (d.getUTCDate() === day) start = d;
      }
    }
    if (!start) continue;
    prev = start;
    out.push({ col: c, start: isoOf(start), label: label.replace(/\s+/g, ' ').trim(), month: isoOf(start).slice(0, 7), holiday: /\*/.test(label) });
  }
  return out;
}

export const nameKey = s => String(s || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z]/g, '');
const sectionLabelOf = (text) => text.replace(/\s+/g, ' ').trim();
// A section label (SR2 RESIDENTS, CA3 Residents, FELLOWS, External Residents, MOPEX…) rather than a person with nothing
// planned: the names are repeated across the grid too, so that doesn't tell them apart.
const looksLikeHeader = text => /^TOTAL PROJECTED MANPOWER/i.test(text) || !/[a-z]/.test(text)
  || /^(external|supernumerary)/i.test(text) || /\b(residents?|physicians?|fellows?|mopex|pool|registrar)\s*$/i.test(text);

// parse one tab. rows: array of rows, each an array of cell texts (dates as YYYY-MM-DD), row 0 = sheet row 1.
// Returns null when it isn't a block grid. people: [{ name, key, origin, section, codes: [raw per week] }].
export function parseBlockSheet(rows) {
  const weeks = weekColumns(rows[0] || [], rows[1] || []);
  if (weeks.length < 4) return null;
  const weekCols = new Set(weeks.map(w => w.col));
  const sections = [];
  let cur = { label: '', people: [] };
  sections.push(cur);
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = String(row[0] ?? '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const codes = weeks.map(w => String(row[w.col] ?? '').replace(/\s+/g, ' ').trim()).map(t => (/^\d+(\.\d+)?$/.test(t) ? '' : t));   // a bare number is a count, not a posting
    const any = codes.some(Boolean);
    if (/^TOTAL PROJECTED MANPOWER/i.test(name)) break;
    if (!any && looksLikeHeader(name)) {
      cur = { label: sectionLabelOf(name), people: [] };
      sections.push(cur);
      continue;
    }
    // where an external resident comes from: in brackets after the name, or alone in a repeated name cell
    let origin = (/\(([^)]{1,20})\)\s*$/.exec(name) || [])[1] || '';
    if (!origin && /^external/i.test(cur.label)) {
      const alone = row.find((v, i) => i > 0 && !weekCols.has(i) && String(v ?? '').trim() && String(v).trim() !== name && String(v).trim().length <= 12);
      if (alone) origin = String(alone).trim();
    }
    cur.people.push({ name: name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name, key: nameKey(name), origin, section: cur.label, codes });
  }
  return { weeks, sections: sections.filter(s => s.people.length) };
}

// The Monday of the week a date is in (a week label can start midweek after a holiday or a changeover).
export function weekMonday(iso) {
  const m = ISO.exec(iso);
  if (!m) return '';
  const d = utc(+m[1], +m[2], +m[3]);
  return isoOf(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000));
}

// Is a parsed tab one this reader trusts? A full year of weeks that follow each other. Older tabs (before 2024-25) use
// other layouts and notes in the week columns, so they're listed as not read instead of being shown wrongly.
export function readable(parsed, min = 40) {
  if (!parsed || parsed.weeks.length < min) return false;
  const mondays = parsed.weeks.filter(w => weekMonday(w.start) === w.start).length;
  return mondays >= parsed.weeks.length - 4;   // a few start midweek (after a holiday or a changeover)
}

// ---------- summaries ----------
// People per code per week (a combined cell counts for its first code; a provisional one still counts, flagged by the caller).
export function manpower(parsed, { skip = () => false } = {}) {
  const rows = new Map();   // code -> { total, byWeek: [] }
  const n = parsed.weeks.length;
  for (const s of parsed.sections) {
    if (skip(s)) continue;
    for (const p of s.people) {
      p.codes.forEach((raw, i) => {
        const sc = splitCode(raw);
        if (!sc) return;
        const code = sc.parts[0].code;
        const e = rows.get(code) || { code, total: 0, byWeek: Array(n).fill(0) };
        e.total++; e.byWeek[i]++; rows.set(code, e);
      });
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}

// Codes on the sheet that the key doesn't know: [{ code, count }]
export function unknownCodes(parsed) {
  const seen = new Map();
  for (const s of parsed.sections) for (const p of s.people) for (const raw of p.codes) {
    const sc = splitCode(raw);
    if (!sc || !sc.unknown) continue;
    const bad = sc.parts.filter(x => !x.known).map(x => x.code).join(' / ') || sc.raw;
    seen.set(bad, (seen.get(bad) || 0) + 1);
  }
  return [...seen.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}

// Weeks per posting for one person across several parsed tabs: [{ code, total, byTab: { tabName: weeks } }]
export function history(tabs, key) {
  const rows = new Map();
  for (const t of tabs) for (const s of t.parsed.sections) for (const p of s.people) {
    if (p.key !== key) continue;
    for (const raw of p.codes) {
      const sc = splitCode(raw);
      if (!sc) continue;
      const code = sc.parts[0].base;
      const e = rows.get(code) || { code, total: 0, byTab: {} };
      e.total++; e.byTab[t.name] = (e.byTab[t.name] || 0) + 1; rows.set(code, e);
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.code.localeCompare(b.code));
}

// ---------- made-up sample (demo and tests) ----------
// Same layout as the real sheet, made-up names. 12 weeks from Monday 4 Jan 2027, with the first week starting midweek.
export function sampleRows() {
  const row1 = ['', '2027-01-01', '', '', '', '2027-02-01', '', '', '', '2027-03-01', '', '', ''];
  const row2 = ['', '(new year)\n5-10', '11-17', '18-24', '25-31', '1-7', '8-14', '15-21', '22-28', '1-7', '8-14', '15-21', '22-28'];
  const person = (name, codes, tag) => [name, ...codes, tag === undefined ? name : tag];   // the repeated name cell, or where an external resident comes from
  const section = label => [label, ...Array(12).fill(''), label];
  const same = (c) => Array(12).fill(c);
  return [row1, row2,
    ['RESIDENT PHYSICIANS'],
    person('Alex Example', same('GC')),
    person('Sam Sample', ['GC', 'GC', 'RA', 'RA', 'ICU', 'ICU', 'GC', 'GC', 'ML', 'ML', 'ML', 'ML']),
    [],
    section('CA2 Residents'),
    person('Kim Placeholder', ['ICU', 'ICU', 'ICU', 'ICU', 'NTFGH-JR', 'NTFGH-JR', 'NTFGH-JR', 'NTFGH-JR', 'C', 'C', 'C-e', 'C-p']),
    person('Pat Madeup', ['OG1', 'OG1', 'OG1', 'OG1', 'KKH', 'KKH', 'KKH', 'KKH', 'KIV ICU', 'ICU', 'ICU', 'Part B']),
    person('Robin Testcase', ['OGNF1', 'OGNF1', 'OGNF2', 'OGNF2', 'Liver-E', 'Liver-E', 'GC', 'GC', 'Part B/ ICU', 'Prep', 'Prep', 'Mystery']),
    section('CA1 Residents'),
    person('Jo Fictional', ['GC', 'GC', 'AP', 'AP', 'CP', 'CP', 'Neu', 'Neu', 'TTSH NICU', 'TTSH NICU', 'TTSH NICU', 'TTSH NICU']),
    section('External Residents'),
    person('Dana Visitor', ['GC', 'GC', 'GC', 'GC', 'ICU', 'ICU', 'ICU', 'ICU', 'C', 'C', 'C', 'C'], 'ED'),
    person('Lee Rotating (SIG)', same('GC')),
    ['TOTAL PROJECTED MANPOWER'],
    ['Junior Manpower', ...same('9')],
  ];
}
