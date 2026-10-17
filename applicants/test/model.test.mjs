// Unit tests for applicants/js/model.js. Run: node applicants/test/model.test.mjs
import assert from 'node:assert/strict';
import { parseNames, cleanRound, encodeRound, decodeRound, readRoundText, cleanAnswers, statusOf, progress, warnings, formBody, formUrl, summary, resultsCSV, answersText, demoRound, blank } from '../js/model.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('names: bullets, numbers, blanks and repeats', () => {
  const a = parseNames('1. Zoë Tan\n- Lee Wei\n\n  lee   wei \nMark, Jr');
  assert.deepEqual(a.map(x => x.name), ['Zoë Tan', 'Lee Wei', 'Mark, Jr']);
  assert.deepEqual(a.map(x => x.id), ['a1', 'a2', 'a3']);
  assert.equal(parseNames('').length, 0);
});

const round = cleanRound({ title: 'T', cycle: '2027', applicants: parseNames('Zoë Tan\nLee Wei') });
t('round survives a link, including non-ASCII names', () => {
  const back = decodeRound(encodeRound(round));
  assert.deepEqual(back, round);
  assert.deepEqual(readRoundText('https://x/applicants/#r=' + encodeRound(round)), round);
  assert.deepEqual(readRoundText(JSON.stringify(round)), round);
  assert.equal(decodeRound('nonsense!!'), null);
  assert.equal(readRoundText('{bad'), null);
});
t('cleanRound rejects empty and half-wired forms', () => {
  assert.equal(cleanRound({ applicants: [] }), null);
  assert.equal(cleanRound(null), null);
  const half = cleanRound({ applicants: [{ id: 'a1', name: 'X' }], form: { id: 'a'.repeat(30), nameEntry: 5 } });
  assert.equal(half.form, undefined);   // an applicant without field ids: no form
  const full = cleanRound({ applicants: [{ id: 'a1', name: 'X', entry: { score: 1, comment: 2 } }], form: { id: 'a'.repeat(30), nameEntry: 5 } });
  assert.deepEqual(full.form, { id: 'a'.repeat(30), nameEntry: 5 });
  assert.equal(cleanRound({ applicants: [{ name: '<b>x' }, { name: '' }, { id: 'a1', name: 'dup' }, { id: 'q', name: 'ok' }] }).applicants.length, 2);
});
t('status, progress and warnings', () => {
  const ans = cleanAnswers(round, { a1: { score: 4, comment: 'Calm in a crisis' }, a2: { score: 9, comment: ' ' , na: true } });
  assert.equal(statusOf(ans.a1), 'scored');
  assert.equal(ans.a2.score, null);
  assert.equal(statusOf(ans.a2), 'skipped');
  assert.deepEqual(progress(round, ans), { scored: 1, partial: 0, skipped: 1, todo: 0, total: 2, done: 2 });
  assert.equal(statusOf({ ...blank(), score: 3 }), 'partial');
  assert.equal(warnings(round, { a1: { ...blank(), score: 3 }, a2: blank() }).length, 2);
  // typing a comment cancels "did not interact"
  assert.equal(cleanAnswers(round, { a1: { na: true, comment: 'hi' } }).a1.na, false);
});
t('form body uses the right fields and skips what was not answered', () => {
  const wired = cleanRound({ applicants: [{ id: 'a1', name: 'X', entry: { score: 11, comment: 12 } }, { id: 'a2', name: 'Y', entry: { score: 21, comment: 22 } }], form: { id: 'a'.repeat(30), nameEntry: 99 } });
  const ans = cleanAnswers(wired, { a1: { score: 5, comment: ' Great ' }, a2: { na: true } });
  const p = formBody(wired, 'Dr A', ans);
  assert.equal(p.get('entry.99'), 'Dr A'); assert.equal(p.get('entry.11'), '5'); assert.equal(p.get('entry.12'), 'Great');
  assert.equal(p.has('entry.21'), false);
  assert.match(formUrl(wired), /^https:\/\/docs\.google\.com\/forms\/d\/e\/a{30}\/formResponse$/);
});
t('summary and CSV (formula-safe)', () => {
  const subs = [
    { name: 'P', at: 0, answers: cleanAnswers(round, { a1: { score: 4, comment: '=cmd()' }, a2: { score: 2, comment: 'a, "b"' } }) },
    { name: 'Q', at: 0, answers: cleanAnswers(round, { a1: { score: 5, comment: '' }, a2: { na: true } }) },
  ];
  const s = summary(round, subs);
  assert.equal(s[0].mean, 4.5); assert.equal(s[0].n, 2); assert.equal(s[1].skipped, 1); assert.equal(s[1].comments.length, 1);
  const csv = resultsCSV(round, subs);
  assert.match(csv, /"'=cmd\(\)"|'=cmd\(\)/); assert.match(csv, /"a, ""b"""/);
  assert.match(answersText(round, 'P', subs[0].answers), /Score: 4/);
});
t('demo round has made-up names only', () => {
  assert.equal(demoRound().applicants.length, 6);
  assert.ok(cleanRound(demoRound()));
});
console.log(`applicants model: ${n} groups passed`);
