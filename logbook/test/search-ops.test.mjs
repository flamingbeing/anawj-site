// Advanced search operators (js/search-ops.js).
import assert from 'node:assert/strict';
import { parseQuery, matchQuery, insertOperator } from '../js/search-ops.js';

const P = q => parseQuery(q).groups.map(g => g.map(t => `${t.neg ? '-' : ''}${t.field ? t.field + ':' : ''}${t.phrase ? `"${t.text}"` : t.text}`).join('|')).join(' ');
assert.equal(P('lap chole'), 'lap chole');
assert.equal(P('initials:AB tag:16 case:hernia'), 'initials:ab tag:16 case:hernia');
assert.equal(P('"lap chole" -paeds'), '"lap chole" -paeds');
assert.equal(P('spinal OR epidural GA'), 'spinal|epidural ga');
assert.equal(P('a | b | c'), 'a|b|c');
assert.equal(P('spinal AND ga & x'), 'spinal ga x');   // AND / & are the same as a space
assert.equal(P('salt and pepper'), 'salt and pepper'); // lower-case "and" is a word
assert.equal(P('title:lscs'), 'title:lscs');
assert.equal(P('OR a or b'), 'a or b');                 // lower-case "or" is a word; a leading OR is dropped
assert.equal(P('-tag:13 -"day surgery"'), '-tag:13 -"day surgery"');
assert.equal(P('GA:ETT'), 'ga:ett');                     // not an operator: plain text
assert.equal(P('- -- x-ray'), '- -- x-ray');             // dashes that aren't "leave out"
assert.equal(P('"open phrase'), '"open phrase"');        // an unclosed quote runs to the end
assert.deepEqual(parseQuery('initals:AB tga:16').unknown, [{ op: 'initals:', suggest: 'initials:' }, { op: 'tga:', suggest: 'tag:' }]);
assert.deepEqual(parseQuery('GA:ETT').unknown, []);

// matching
const c = { all: 'ab 34f lscs under spinal\nconverted to ga 16 lscs', initials: 'ab', title: 'ab 34f lscs under spinal', case: '34f lscs under spinal\nconverted to ga' };
const get = k => c[k];
const tags = new Set(['16', 'lscs', 'caesarean']);
const tagHas = t => tags.has(t);
const M = q => matchQuery(parseQuery(q), get, tagHas);
assert.equal(M('lscs spinal'), true);
assert.equal(M('initials:ab'), true);
assert.equal(M('initials:sp'), false);
assert.equal(M('case:16'), false);                       // tags aren't in the case text
assert.equal(M('tag:16'), true);
assert.equal(M('tag:13'), false);
assert.equal(M('-tag:13 spinal'), true);
assert.equal(M('"under spinal"'), true);
assert.equal(M('"spinal under"'), false);
assert.equal(M('-spinal'), false);
assert.equal(M('epidural OR spinal'), true);
assert.equal(M('epidural OR tka'), false);
assert.equal(M(''), true);
assert.equal(M('title:spinal'), true);
assert.equal(M('title:converted'), false);             // second line
assert.equal(M('converted AND spinal'), true);

// has: a labelled part (the caller says which parts a case has)
{
  assert.equal(P('has:LP -has:plan'), 'has:lp -has:plan');
  assert.equal(parseQuery('has:LP', { keepCase: true }).groups[0][0].text, 'lp');   // a label never case sensitive
  const parts = new Set(['lp']);
  const H = q => matchQuery(parseQuery(q), () => 'lap chole', null, undefined, t => parts.has(t));
  assert.equal(H('has:lp'), true);
  assert.equal(H('has:plan'), false);
  assert.equal(H('-has:lp'), false);
  assert.equal(H('lap has:lp'), true);
  assert.equal(matchQuery(parseQuery('has:lp'), () => 'x', null), false);              // no part test: nothing has one
}

// tapping an operator in the "?" list
assert.deepEqual(insertOperator('', 0, 'tag:', 4), { text: 'tag:', caret: 4 });
assert.deepEqual(insertOperator('spinal', 6, '""', 1), { text: 'spinal ""', caret: 8 });
assert.deepEqual(insertOperator('spinal GA', 6, '-', 1), { text: 'spinal - GA', caret: 8 });
assert.deepEqual(insertOperator('spinal ', 7, 'OR ', 3), { text: 'spinal OR ', caret: 10 });

console.log('search operator tests passed');
