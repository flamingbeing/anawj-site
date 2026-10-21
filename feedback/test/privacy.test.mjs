// The feedback button's privacy check before Send (feedback/overlay.js, PRIVATE; Ask Claude in the owner-tools repo keeps the
// same list): what it flags as possible patient details and what ordinary clinical wording it leaves alone.
// Run: node feedback/test/privacy.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = f => {
  const s = fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
  const m = s.match(/const PRIVATE = (\[[\s\S]*?\n\s*\]);/);
  assert.ok(m, `${f}: PRIVATE list found`);
  return m[1].replace(/\s+/g, ' ');
};
const button = src('feedback/overlay.js');
const PRIVATE = eval(button);
const flags = t => PRIVATE.filter(([re]) => re.test(t)).map(([, w]) => w);

// flagged: things shaped like patient details
for (const [text, what] of [
  ['Pt Tan complained about this', /name/], ['Mdm Lim said so', /name/], ['patient Wong', /name/], ['Mr. Ng', /name/],
  ['S1234567D', /NRIC/], ['t0123456a', /NRIC/], ['G7654321X was the one', /NRIC/],
  ['case 1234567', /long number/], ['MRN 12345678', /long number/],
  ['DOB 03/04/1956', /date/], ['seen 3.4.26', /date/], ['on 12-10-2026', /date/],
  ['call 9123 4567', /phone/], ['6123-4567', /phone/], ['81234567', /phone/],
  ['email jo@example.com', /email/],
]) {
  const f = flags(text);
  assert.ok(f.some(w => what.test(w)), `"${text}" should be flagged (${what}); got ${JSON.stringify(f)}`);
}
// left alone: ordinary clinical and editing wording
for (const text of [
  'Dose 0.5 mg/kg, max 20 mg', 'Keep MAP > 65 mmHg', 'Use an 18G cannula', 'C5–T1 roots', 'S1 and S2', 'Make this 2–3 lines shorter',
  'The 2026 guideline changed this', 'Adrenaline 1:200000', 'Temperature 36.5 °C every 5 min', 'SpO2 92% on room air',
  'Change "registrar" to "senior resident" everywhere', 'Step 3 of 4', 'Ratio 2/3', 'The patient should be warmed first',
  'Version B is clearer', 'HR 80–100',
]) assert.deepEqual(flags(text), [], `"${text}" should not be flagged`);
console.log('privacy check tests passed');
