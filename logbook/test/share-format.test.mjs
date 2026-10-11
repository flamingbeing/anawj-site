// Copy & share format (js/share-format.js): defaults, placeholders, empty lines, cleaning.
import assert from 'node:assert/strict';
import { formatDay, formatCase, cleanFormat, fillTemplate, DEFAULT_FORMAT } from '../js/share-format.js';

const day = [{ date: '2026-10-10', initials: 'AB', details: '34F LSCS under spinal' }, { date: '2026-10-10', initials: 'CD', details: '72M TKR\nadductor canal block' }];

// the default day: [[date]], then "1. initials" / case, a blank line between cases
assert.equal(formatDay('2026-10-10', day), '[[2026-10-10]]\n1. AB\n34F LSCS under spinal\n\n2. CD\n72M TKR\nadductor canal block');
assert.equal(formatCase(day[0]), '[[2026-10-10]]\nAB\n34F LSCS under spinal');

// no initials: the initials line goes (one case); "1." stays because {n} is filled
assert.equal(formatCase({ date: '2026-10-10', initials: '', details: 'Epidural' }), '[[2026-10-10]]\nEpidural');
assert.equal(formatDay('2026-10-10', [{ date: '2026-10-10', initials: '', details: 'Epidural' }]), '[[2026-10-10]]\n1.\nEpidural');

// older cases with initials inside the details
assert.equal(formatCase({ date: '2026-10-10', details: 'XY 50M lap chole' }), '[[2026-10-10]]\nXY\n50M lap chole');

// custom formats and the other fill-ins
const f = { dayHead: '{day} ({weekday}) · {count} cases', dayCase: '- {initials} {case}', oneCase: '{day}: {initials} {case}' };
assert.equal(formatDay('2026-10-10', day, f), '10 Oct 2026 (Sat) · 2 cases\n- AB 34F LSCS under spinal\n- CD 72M TKR\nadductor canal block');
assert.equal(formatCase(day[0], f), '10 Oct 2026: AB 34F LSCS under spinal');
// an empty heading means no heading line
assert.equal(formatDay('2026-10-10', day.slice(0, 1), { dayHead: '{nothing}', dayCase: '{case}' }).startsWith('{nothing}'), true);   // unknown fill-ins stay as typed

// cleaning: blank fields fall back to the default, junk keys dropped, long text cut
assert.deepEqual(cleanFormat({ dayHead: '  ', junk: 'x' }), DEFAULT_FORMAT);
assert.deepEqual(cleanFormat(null), DEFAULT_FORMAT);
assert.equal(cleanFormat({ oneCase: 'x'.repeat(900) }).oneCase.length, 500);
assert.equal(cleanFormat({ dayCase: 'a\r\nb' }).dayCase, 'a\nb');

// a line with text of its own stays even when its fill-ins are empty
assert.equal(fillTemplate('Initials: {initials}\n{case}', { initials: '', case: 'x' }), 'Initials:\nx');

console.log('share format tests passed');
