// Run with: node logbook/test/parts.test.mjs  (fake data only)
import assert from 'node:assert/strict';
import {
  DEFAULT_LABELS, MAX_DETAILS, cleanLabels, labelsOn, labelOf, parseParts, rowSegments, boldLabels, plainLabels, suggestText,
  findLabel, hasPart, takeHas, templateCaret, stripTemplate, splitOverflow, labelWordOk, cleanCaseTemplate, MAX_TEMPLATE,
} from '../js/parts.js';
import { parseBulk } from '../js/engine.js';

const L = cleanLabels([...DEFAULT_LABELS, { k: 'ASA', n: '' }, { k: 'PE' }, { k: 'Plan', hide: true }, { k: 'Ix' }]);

// cleaning the list
{
  assert.deepEqual(cleanLabels(undefined), DEFAULT_LABELS);
  assert.notEqual(cleanLabels(undefined)[0].also, DEFAULT_LABELS[0].also);   // a copy, never the shared default
  assert.deepEqual(cleanLabels([]), []);
  assert.equal(L.find(l => l.k === 'ASA').n, 'ASA');                          // no name: the word itself
  assert.equal(L.find(l => l.k === 'Plan').hide, true);
  assert.equal('hide' in L.find(l => l.k === 'PE'), false);
  // bad words, duplicates (any case), a word already used as another label's "also", too many
  const c = cleanLabels([{ k: 'lp' }, { k: 'LP' }, { k: '1x' }, { k: 'lp2' }, { k: 'Learning', also: ['lp'] }, { k: ' H&P ' }, null, 'x', { k: 'S/B', also: ['sb', 'S/B', '9'] }]);
  assert.deepEqual(c.map(l => l.k), ['lp', 'Learning', 'H&P', 'S/B']);
  assert.equal(c[1].also, undefined);
  assert.deepEqual(c[3].also, ['sb']);
  assert.equal(cleanLabels(Array.from({ length: 30 }, (_, i) => ({ k: 'L' + 'abcdefghijklmnopqrstuvwxyzABCD'[i] }))).length, 20);
  assert.ok(labelWordOk('Learning points') && labelWordOk('Ix') && !labelWordOk('lp1') && !labelWordOk('') && !labelWordOk('a:b'));
}

// off unless switched on; the same list object while the settings don't change
{
  assert.equal(labelsOn({}), null);
  assert.equal(labelsOn(null), null);
  const st = { labelParts: true, partLabels: [{ k: 'PE' }] };
  const a = labelsOn(st), b = labelsOn(st);
  assert.equal(a, b);
  assert.deepEqual(a.map(l => l.k), ['PE']);
  assert.deepEqual(labelsOn({ labelParts: true }).map(l => l.k), ['lp', 'dt']);
}

// what counts as a label
{
  assert.equal(labelOf('lp: tube size', L).label.k, 'lp');
  assert.equal(labelOf('LP: tube size', L).label.k, 'lp');        // case doesn't matter
  assert.equal(labelOf('LP for headache', L), null);              // lumbar puncture: no colon, no label
  assert.equal(labelOf('LP', L), null);
  assert.equal(labelOf('lpx: no', L), null);
  assert.equal(labelOf('see lp: later', L), null);                // only at the start of a line
  assert.equal(labelOf('Learning points: cuff', L).label.k, 'lp');
  assert.equal(labelOf('learning: cuff', L).label.k, 'lp');
  const n = labelOf('lp2: second', L);
  assert.equal(n.num, '2'); assert.equal(n.name, 'Learning point 2'); assert.equal(n.rest, 'second');
  assert.equal(labelOf('ASA 2: HTN', L).name, 'ASA 2');
  assert.equal(labelOf('ASA : ', L).label.k, 'ASA');             // the template's "ASA :"
  assert.equal(labelOf('**PE:** chest clear', L).rest, 'chest clear');
  assert.equal(labelOf('**PE**: chest clear', L).rest, 'chest clear');
  assert.equal(labelOf('- Plan: GA', L).label.k, 'Plan');
  assert.equal(labelOf('**PE: unclosed', L), null);
  assert.equal(labelOf('lp: x', []), null);
}

// parts: main text, then each part to the next label
{
  const t = 'AB 72M lap chole\nGA ETT\nASA 2: HTN, DM\nPE: clear\nlp: check the cuff\nbefore moving\nlp2: second point';
  const p = parseParts(t, L);
  assert.equal(p.main, 'AB 72M lap chole\nGA ETT');
  assert.deepEqual(p.parts.map(x => [x.k, x.name, x.text]), [['ASA', 'ASA 2', 'HTN, DM'], ['PE', 'PE', 'clear'], ['lp', 'Learning point', 'check the cuff\nbefore moving'], ['lp', 'Learning point 2', 'second point']]);
  assert.deepEqual(parseParts('plain text\nLP done', L), { main: 'plain text\nLP done', parts: [] });
  assert.deepEqual(parseParts('lp: only', L).main, '');
  assert.deepEqual(parseParts('x\nlp: y', null), { main: 'x\nlp: y', parts: [] });
  // rows: hidden labels left out
  assert.deepEqual(rowSegments('lap chole\nPlan: GA\nlp: cuff', L), [{ text: 'lap chole' }, { label: 'Learning point', k: 'lp', text: 'cuff' }]);
  assert.equal(hasPart('x\nlp: y', L, 'lp'), true);
  assert.equal(hasPart('x\nlp:   ', L, 'lp'), false);             // an empty part isn't one
  assert.equal(hasPart('x\nPE: y', L, 'lp'), false);
}

// Markdown: bold labels; pasted bold kept plain; suggestions skip learning points
{
  assert.equal(boldLabels('AB lap chole\nASA 2: HTN\nlp: cuff\nLP for headache\nPE:', L), 'AB lap chole\n**ASA 2:** HTN\n**Learning point:** cuff\nLP for headache\n**PE:**');
  assert.equal(boldLabels('lp: x', null), 'lp: x');
  assert.equal(plainLabels('**Learning:** cuff\n**PE**: clear\nPlan: GA\n**not a label:** x', L), 'Learning: cuff\nPE: clear\nPlan: GA\n**not a label:** x');
  assert.equal(suggestText('lap chole\nPlan: spinal\nlp: never spinal again', L), 'lap chole\nspinal');
  assert.equal(suggestText('lp: x', null), 'lp: x');
}

// search: has:lp
{
  assert.equal(findLabel('LP', L).k, 'lp');
  assert.equal(findLabel('learning point', L).k, 'lp');
  assert.equal(findLabel('plan', L).k, 'Plan');
  assert.equal(findLabel('nope', L), null);
  assert.deepEqual(takeHas('lap has:lp chole has:"learning point" has:zzz', L), { rest: 'lap chole', keys: ['lp', 'lp', null] });
  assert.deepEqual(takeHas('plain words', L), { rest: 'plain words', keys: [] });
}

// case template
{
  assert.equal(templateCaret('ASA :\nPE :\nPlan :'), 5);
  assert.equal(templateCaret('ASA: \nPE:'), 5);
  assert.equal(templateCaret('\nASA:\nPE:'), 0);                  // an empty first line: the case goes there
  assert.equal(templateCaret('just words'), 10);
  assert.equal(templateCaret(''), 0);
  const tpl = 'ASA :\nPE :\nPlan :';
  assert.equal(stripTemplate(tpl, tpl), '');                       // nothing added: nothing saved
  assert.equal(stripTemplate(' ASA :\n\nPE :  \nPlan :\n', tpl), '');
  assert.equal(stripTemplate('AB lap chole\nASA : 2\nPE :\nPlan : GA', tpl), 'AB lap chole\nASA : 2\nPlan : GA');
  assert.equal(stripTemplate('anything', ''), 'anything');
  assert.equal(cleanCaseTemplate('a\r\nb'), 'a\nb');
  assert.equal(cleanCaseTemplate('x'.repeat(900)).length, MAX_TEMPLATE);
}

// the 2000-character limit
{
  assert.deepEqual(splitOverflow('short'), { head: 'short', rest: '' });
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i} ` + 'x'.repeat(40)).join('\n');
  const s = splitOverflow(lines);
  assert.ok(s.head.length <= MAX_DETAILS && s.head.length > MAX_DETAILS / 2);
  assert.ok(!s.head.endsWith('\n') && s.head.endsWith('x'));
  assert.equal(s.head + '\n' + s.rest, lines);                     // nothing lost, cut at a line break
  const words = Array.from({ length: 500 }, () => 'word').join(' ');
  const w = splitOverflow(words);
  assert.equal(w.head + ' ' + w.rest, words);
  const solid = 'y'.repeat(2500);
  assert.equal(splitOverflow(solid).head.length, 2000);
  assert.equal(splitOverflow(solid).rest.length, 500);
  const emoji = 'z'.repeat(1999) + '😀' + 'z'.repeat(10);
  assert.equal(splitOverflow(emoji).head.length, 1999);           // the emoji moves whole into the rest
  assert.ok(splitOverflow(emoji).rest.startsWith('😀'));
  assert.equal(splitOverflow('a b c d e f', 5).head, 'a b c');
}

// pasted lists: bold first lines, labelled blocks, plain labels
{
  const now = new Date(2026, 2, 15);
  // the existing rules stay: blank lines split, a case keeps its lines
  assert.deepEqual(parseBulk('AB lap chole\nGA ETT\n\nCD LSCS', null, now).map(r => r.details), ['lap chole\nGA ETT', 'LSCS']);
  // a bold first line starts a case without a blank line, and loses its stars
  const notes = '**AB 72M lap chole**\nASA 2: HTN\nPlan: GA ETT\n**CD 30F LSCS**\n**ASA 2:** obese\nlp: check the block';
  const off = parseBulk(notes, null, now);
  assert.equal(off.length, 2);
  assert.deepEqual([off[0].initials, off[0].details], ['AB', '72M lap chole\nASA 2: HTN\nPlan: GA ETT']);
  assert.equal(off[1].details, '30F LSCS\n**ASA 2:** obese\nlp: check the block');   // a bold label isn't a case
  const on = parseBulk(notes, null, now, { labels: L });
  assert.equal(on[1].details, '30F LSCS\nASA 2: obese\nlp: check the block');        // kept plain with the setting on
  // with labels, a labelled block after a blank line belongs to the case above
  const gap = parseBulk('AB lap chole\n\nlp: cuff pressure\n\nCD LSCS', null, now, { labels: L });
  assert.deepEqual(gap.map(r => r.details), ['lap chole\nlp: cuff pressure', 'LSCS']);
  assert.equal(parseBulk('AB lap chole\n\nlp: cuff pressure', null, now).length, 2);  // off: as before
  // a dated bold line, a numbered bold line, __bold__
  const d = parseBulk('1. **12/3 EF hernia**\nTAP block\n__GH appendix__', null, now);
  assert.deepEqual(d.map(r => [r.date, r.initials, r.details]), [['2026-03-12', 'EF', 'hernia\nTAP block'], [null, 'GH', 'appendix']]);
  // a bold word that is only the start of a line still starts a case; "**Note:**" doesn't
  assert.equal(parseBulk('AB knee\n**Note:** spinal', null, now).length, 1);
  assert.equal(parseBulk('AB knee\n**CD** hip', null, now)[1].details, 'hip');
}

console.log('parts tests passed');
