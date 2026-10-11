// Plain node checks for the pure helpers in ui-admin.js (paste parsing, rid suggestion, CSV, flags, cohort cells).
import assert from 'node:assert/strict';
import { parseFacultyLines, parseResidentLines, nextRid, toCSV, CSV_COLUMNS, flagsOf, cohortRow, validEmail, cleanEmail, reminderText } from '../js/ui-admin.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('emails', () => {
  assert.equal(cleanEmail('  A.B@Example.COM '), 'a.b@example.com');
  assert.ok(validEmail('x@example.com'));
  assert.ok(!validEmail('x@example'));
  assert.ok(!validEmail('x example.com'));
});

t('faculty paste', () => {
  const r = parseFacultyLines('Dr A, a@example.com\nnope\nb@example.com\tDr B\nDr A, A@EXAMPLE.com\nDr C, c@example.com\nDr D, d@bad', [{ email: 'c@example.com' }]);
  assert.deepEqual(r.map(x => x.problem || x.dup || 'ok'), ['ok', 'No email', 'ok', 'Repeated in this list', 'Already on the faculty list', 'Email not valid']);
  assert.equal(r[2].rec.name, 'Dr B');
  assert.equal(r[0].rec.status, 'ACTIVE');
});

t('resident paste', () => {
  const r = parseResidentLines('rid,name,email,intake,rYear\nR010, Ann, ann@example.com, 2025, 2\nR011, Ben, ben@example.com\nR001, Cat, cat@example.com\nR012, Dee, old@example.com\nR013, Eve, eve@example.com, 25\nR014, Fay, fay@example.com, 2025, R7',
    [{ rid: 'R001', email: 'x@example.com' }, { rid: 'R002', email: 'old@example.com' }]);
  assert.deepEqual(r.map(x => x.problem || x.dup || 'ok'), ['ok', 'ok', 'ID R001 already used', 'Email already on the resident list', 'Intake must be a year, e.g. 2025', 'Year must be 1 to 5']);
  assert.deepEqual(r[0].rec, { rid: 'R010', name: 'Ann', email: 'ann@example.com', intake: 2025, rYear: 2, status: 'ACTIVE' });
  assert.equal(r[1].rec.rYear, null);
});

t('next rid', () => {
  assert.equal(nextRid([{ rid: 'DEMO01' }, { rid: 'DEMO08' }, { rid: 'X' }]), 'DEMO09');
  assert.equal(nextRid([]), 'R001');
  assert.equal(nextRid([{ rid: '7' }, { rid: '9' }]), '10');
});

const sub = { id: 'e1', rid: 'R1', residentName: 'Ann', residentEmail: 'ann@example.com', itemId: 'MINICEX-1-01', itemText: 'Preop, "clinic"', tool: 'MiniCEX', formId: 'minicex',
  epa: '1', level: 3, status: 'submitted', requestedAt: Date.UTC(2026, 0, 1), submittedAt: Date.UTC(2026, 0, 2), assessorEmail: 'f@example.com',
  request: { date: '2026-01-01' }, assessment: { q12: 4, q18: 3, q19: '=SUM(A1)', q20: 'No', q21: 'Yes' } };

t('csv', () => {
  const csv = toCSV([sub, { id: 'e2', status: 'declined', formId: 'ebd', tool: 'EBD', declineReason: { code: 'conflict', text: '' } }]);
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines.length, 3);
  assert.ok(lines.some(l => l.includes('"Preop, ""clinic"""')));
  assert.ok(lines.some(l => l.includes("'=SUM(A1)")), 'formula neutralised');
  assert.ok(lines.some(l => l.includes('Conflict of interest')));
  assert.ok(CSV_COLUMNS.includes('q22') && CSV_COLUMNS.includes('supervision') && CSV_COLUMNS.includes('mirroredToMedHub'));
});

t('flags', () => {
  assert.deepEqual(flagsOf(sub), ['Overall 4/9 on a level 3 item', 'Not receptive to feedback']);
  assert.deepEqual(flagsOf({ ...sub, level: 4, assessment: { q12: 4 } }), []);
  assert.deepEqual(flagsOf({ status: 'declined', declineReason: { code: 'conflict' } }), ['Declined: conflict of interest']);
  assert.deepEqual(flagsOf({ ...sub, assessment: {} }, new Set(['f@example.com'])), ['Assessor is on the resident list']);
});

t('cohort cells', () => {
  const c = cohortRow([], 1);
  assert.ok(c['2'].req > 0 && c['2'].done === 0);
  assert.equal(cohortRow([], 1)['12']?.req || 0, 0);
});

t('reminder', () => {
  const s = reminderText('Dr X', [sub], Date.UTC(2026, 0, 3), 'https://example.com/evals/#pending');
  assert.ok(s.startsWith('Dear Dr X,') && s.includes('1 evaluation waiting') && s.includes('https://example.com/evals/#pending'));
});

console.log(`admin: ${n} checks passed`);

// pasted from an email client, with a header row
{
  const r = parseFacultyLines('Name,Email\nDr Tan Wei Ming <tan@x.com>; B <b@x.com>\n"Lim, Hui Min" <lim@x.com>\nDr Lim Hui Min lim2@x.com');
  assert.deepEqual(r.map(x => x.rec && [x.rec.name, x.rec.email]), [['Dr Tan Wei Ming', 'tan@x.com'], ['B', 'b@x.com'], ['Lim Hui Min', 'lim@x.com'], ['Dr Lim Hui Min', 'lim2@x.com']]);
  assert.match(parseResidentLines('Sam Two, sam2@x.com')[0].problem, /resident ID/);
  console.log('paste formats ok');
}
