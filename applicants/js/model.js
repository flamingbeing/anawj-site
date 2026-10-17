// APMES Applicants: the logic, free of page code so test/model.test.mjs can run it in Node.
// A "round" is one selection exercise (e.g. the 2027 intake): a title, the applicants to rate and, optionally, where
// the answers go (a Google Form). Real applicant names are never in this repo: the admin pastes them in the app and
// shares the round as a private link (the round travels in the part of the link after #, which servers never see).

export const MAX_APPLICANTS = 200;
export const SCORES = [
  [1, 'Unsuitable'], [2, 'Below par'], [3, 'Acceptable'], [4, 'Good'], [5, 'Best fit'],
];
export const INTRO = [
  'The selection exercise is starting soon. We would really appreciate your honest feedback on the applicants below. As successful applicants will form part of our family, we would like to gather insights and understanding of our applicants based on your interactions.',
  'Please give each applicant an overall suitability for residency score from 1 (unsuitable) to 5 (best fit).',
  'More importantly, please write comments and support them with specific examples.',
  'Your response is confidential, and we will keep it so.',
];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = v => (Number.isInteger(v) && v > 0 && v < 1e10 ? v : null);

// One name per line. Bullets, numbers and blank lines are dropped; repeats are ignored.
export function parseNames(text) {
  const seen = new Set(), out = [];
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    out.push({ id: 'a' + (out.length + 1), name: line });
    if (out.length >= MAX_APPLICANTS) break;
  }
  return out;
}

// Checks a round that was pasted or arrived in a link; returns a clean copy, or null.
// form (optional): { id, nameEntry } the Google Form's public id and the respondent-name field; each applicant may carry
// entry: { score, comment }, the numeric ids of that applicant's two fields in the form.
export function cleanRound(r) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.applicants)) return null;
  const seen = new Set();
  const applicants = [];
  for (const a of r.applicants.slice(0, MAX_APPLICANTS)) {
    const name = str(a?.name, 120);
    const id = str(a?.id, 20) || 'a' + (applicants.length + 1);
    if (!name || seen.has(id)) continue;
    seen.add(id);
    const e = a.entry && num(a.entry.score) && num(a.entry.comment) ? { score: a.entry.score, comment: a.entry.comment } : null;
    applicants.push(e ? { id, name, entry: e } : { id, name });
  }
  if (!applicants.length) return null;
  const out = { v: 1, title: str(r.title, 200) || 'Applicant feedback', cycle: str(r.cycle, 20) || 'round', applicants };
  const f = r.form;
  if (f && /^[A-Za-z0-9_-]{20,80}$/.test(f.id || '') && num(f.nameEntry) && applicants.every(a => a.entry)) out.form = { id: f.id, nameEntry: f.nameEntry };
  return out;
}

// A round as text in a link: base64url of the JSON (names may be non-ASCII).
export function encodeRound(round) {
  const bytes = new TextEncoder().encode(JSON.stringify(round));
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeRound(s) {
  try {
    const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return cleanRound(JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))));
  } catch { return null; }
}
// Accepts pasted JSON, a whole link, or just the part after #r=.
export function readRoundText(text) {
  const t = String(text || '').trim();
  if (t.startsWith('{')) { try { return cleanRound(JSON.parse(t)); } catch { return null; } }
  const m = t.match(/#r=([A-Za-z0-9_-]+)/);
  return decodeRound(m ? m[1] : t);
}

// ---- one respondent's answers: { [applicantId]: { score: 1-5|null, comment: '', na: bool } } ----

export const blank = () => ({ score: null, comment: '', na: false });
export function cleanAnswers(round, raw) {
  const out = {};
  for (const a of round.applicants) {
    const r = raw && raw[a.id] || {};
    const score = Number.isInteger(r.score) && r.score >= 1 && r.score <= 5 ? r.score : null;
    const na = !!r.na && score == null && !str(r.comment, 5000);
    out[a.id] = { score, comment: typeof r.comment === 'string' ? r.comment.slice(0, 5000) : '', na };
  }
  return out;
}
// 'scored' (a score and a comment), 'partial' (one of them), 'skipped' (didn't interact), 'todo'
export function statusOf(a) {
  if (!a) return 'todo';
  if (a.na) return 'skipped';
  const c = !!a.comment.trim();
  return a.score && c ? 'scored' : a.score || c ? 'partial' : 'todo';
}
export function progress(round, answers) {
  const n = { scored: 0, partial: 0, skipped: 0, todo: 0 };
  for (const a of round.applicants) n[statusOf(answers[a.id])]++;
  return { ...n, total: round.applicants.length, done: n.scored + n.skipped };
}
// Things worth a second look before sending (never blocks it: nothing in the original form was required).
export function warnings(round, answers) {
  const w = [];
  for (const a of round.applicants) {
    const r = answers[a.id];
    const s = statusOf(r);
    if (s === 'partial' && r.score && !r.comment.trim()) w.push({ id: a.id, name: a.name, text: 'has a score but no comment' });
    else if (s === 'partial') w.push({ id: a.id, name: a.name, text: 'has a comment but no score' });
    else if (s === 'todo') w.push({ id: a.id, name: a.name, text: 'not answered yet' });
  }
  return w;
}

// ---- sending ----

// The body for the Google Form's formResponse address (one field per question).
export function formBody(round, respondent, answers) {
  const p = new URLSearchParams();
  p.set('entry.' + round.form.nameEntry, respondent);
  for (const a of round.applicants) {
    const r = answers[a.id];
    if (!r || r.na) continue;
    if (r.score) p.set('entry.' + a.entry.score, String(r.score));
    if (r.comment.trim()) p.set('entry.' + a.entry.comment, r.comment.trim());
  }
  return p;
}
export const formUrl = round => `https://docs.google.com/forms/d/e/${round.form.id}/formResponse`;

// What the respondent can copy or keep.
export function answersText(round, respondent, answers) {
  const lines = [round.title, `From: ${respondent}`, ''];
  for (const a of round.applicants) {
    const r = answers[a.id];
    if (!r || statusOf(r) === 'todo') continue;
    lines.push(a.name, r.na ? 'Did not interact' : `Score: ${r.score || '-'}`, r.comment.trim() ? r.comment.trim() : '', '');
  }
  return lines.join('\n').trim() + '\n';
}

// ---- results (admins and PDs): submissions = [{ by, name, at, answers }] ----

export function summary(round, subs) {
  return round.applicants.map(a => {
    const scores = [], comments = [];
    let skipped = 0;
    for (const s of subs) {
      const r = s.answers[a.id];
      if (!r) continue;
      if (r.na) skipped++;
      if (r.score) scores.push(r.score);
      if (r.comment.trim()) comments.push({ by: s.name, text: r.comment.trim() });
    }
    const mean = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null;
    return { id: a.id, name: a.name, n: scores.length, mean, skipped, comments };
  });
}
const cell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // a spreadsheet must not run a comment as a formula
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
export function resultsCSV(round, subs) {
  const rows = [['applicant', 'respondent', 'sent', 'score', 'did_not_interact', 'comment']];
  for (const s of subs) for (const a of round.applicants) {
    const r = s.answers[a.id];
    if (!r || statusOf(r) === 'todo') continue;
    rows.push([a.name, s.name, new Date(s.at).toISOString(), r.score ?? '', r.na ? 'yes' : '', r.comment.trim()]);
  }
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}

// ---- demo round (made-up names only) ----

export function demoRound() {
  const names = ['Alex Demo', 'Bao Sample', 'Casey Example', 'Dani Placeholder', 'Eli Test', 'Fern Mockup'];
  return { v: 1, title: 'Applicant feedback (demo)', cycle: 'demo', applicants: names.map((name, i) => ({ id: 'a' + (i + 1), name })) };
}
