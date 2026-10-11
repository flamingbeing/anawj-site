// Run with: node logbook/test/tags.test.mjs  (fake data only)
import assert from 'node:assert/strict';
import { reparentTag, learnShorthand, cleanShorthand, apmesShorthand, shorthandTags, defaultTagSet, cleanTagSet, tagSetOf, tagTree, flatTree, tagLinks, userCatNames, tagName, tagSetToCsv, tagSetFromCsv, parseCsv } from '../js/tags.js';
import { CATEGORIES } from '../js/categories.js';

const ACTIVE = CATEGORIES.filter(c => !c.retired);

// default: every category once, subcategories under their parent; older subcats become tags
const d = defaultTagSet({ subcats: { '26': ['Interscalene'] } });
assert.equal(d.filter(e => e.k.startsWith('c:')).length, ACTIVE.length);
assert.deepEqual(d.find(e => e.k === '26:Interscalene'), { k: '26:Interscalene', n: 'Interscalene', p: 'c:26' });
const def = tagSetOf({});
assert.equal(def.find(e => e.k === 'c:20i').p, 'c:20', 'built-in sub under its parent');
// catOrder moves a category (and its subs) up
const o = defaultTagSet({ catOrder: ['38', '26'] });
assert.deepEqual(o.slice(0, 2).map(e => e.k), ['c:38', 'c:26']);
assert.equal(o[2].k, 'c:26i');

// clean: repairs
const c = cleanTagSet([
  { k: 'h:reg', n: 'Regional', hd: true },
  { k: 'c:26', p: 'h:reg', n: 'Blocks' },
  { k: 'c:20i', p: 'h:reg' },               // built-in sub: back under 20
  { k: 'c:03', p: 'c:26' },                 // a top category only under a header
  { k: 'u:a', n: 'Loop A', p: 'u:b' }, { k: 'u:b', n: 'Loop B', p: 'u:a' },   // loop broken
  { k: 'u:x', n: 'Interscalene', p: 'c:26', links: ['26i', 'zz'] },
  { k: 'u:x', n: 'dup' },
  { k: 'u:y', n: '' },                        // no name: dropped
  { k: 'c:15ii' },                            // retired: dropped
]);
const by = Object.fromEntries(c.map(e => [e.k, e]));
assert.equal(by['c:26'].p, 'h:reg'); assert.equal(by['c:26'].n, 'Blocks');
assert.equal(by['c:20i'].p, 'c:20');
assert.ok(!('p' in by['c:03']));
assert.ok(!by['u:a'].p || !by['u:b'].p, 'loop broken');
assert.deepEqual(by['u:x'].links, ['26i']);
assert.equal(c.filter(e => e.k === 'u:x').length, 1);
assert.ok(!by['u:y'] && !by['c:15ii']);
assert.equal(c.filter(e => e.k.startsWith('c:')).length, ACTIVE.length, 'missing categories added');

// tree and links
const tree = tagTree(c);
const reg = tree.find(n => n.e.k === 'h:reg');
assert.equal(reg.kind, 'head');
assert.ok(reg.children.some(n => n.code === '26'));
const n26 = reg.children.find(n => n.code === '26');
assert.ok(n26.children.some(n => n.e.k === 'u:x'), 'tag under 26');
assert.ok(flatTree(tree).length === c.length);
assert.deepEqual(tagLinks(c, 'u:x').sort(), ['26', '26i'], 'own link + parent category');
assert.deepEqual(tagLinks(c, 'c:26'), ['26']);
const unlinked = cleanTagSet([{ k: 'u:z', n: 'Night call' }]);
assert.deepEqual(tagLinks(unlinked, 'u:z'), [], 'unlinked tag');
// names
assert.deepEqual(userCatNames(c)['26'], { n: 'Blocks', l: '' });
assert.equal(tagName(c, 'u:x'), 'Interscalene');
assert.equal(tagName([], '16:elective'), 'elective', 'older subcategory key');

// CSV round trip
const names = code => ({ pill: 'P' + code, long: 'Long ' + code });
const csv = tagSetToCsv(c, names);
assert.ok(csv.startsWith('Type,Name,Full name,Under,APMES tags,Shorthand,Hidden,ID'));
assert.ok(/Personal,Interscalene,,Blocks,26i Upper limb blocks,,no,u:x/.test(csv), csv.split('\r\n').find(l => l.includes('Interscalene')));
assert.ok(/^APMES,Blocks,/m.test(csv) && /^Header,/m.test(csv));
const back = tagSetFromCsv(csv, names, c);
assert.deepEqual(back.errors, []); assert.deepEqual(back.notes, []);
const bb = Object.fromEntries(back.set.map(e => [e.k, e]));
assert.equal(bb['c:26'].n, 'Blocks'); assert.equal(bb['c:26'].p, 'h:reg');
assert.equal(bb['u:x'].p, 'c:26'); assert.deepEqual(bb['u:x'].links, ['26i']);
assert.ok(!('n' in bb['c:03']), 'default names not stored');
// the old file format still loads
const old = 'Type,Tag,Long name,Under,APMES categories,Hidden,Key\r\nCategory,Blocks,,,26 Peripheral nerve blocks,,c:26\r\nTag,Interscalene,,Blocks,26i,,u:x\r\n';
const o2 = tagSetFromCsv(old, names, c);
assert.deepEqual(o2.errors, []); assert.equal(o2.set.find(e => e.k === 'u:x').p, 'c:26');
// hand-written CSV from Excel: moved columns, quotes, no IDs, Under below it, names instead of numbers
const hand = 'My tags\r\n\r\nName,Type,Under,Counts towards,Extra\r\nRegional,Header,,,x\r\nBlocks,APMES,Regional,"26 Peripheral nerve blocks"\r\n"Hip #, NOF",Personal,Blocks,"18; 21"\r\nSupervisor note,,Later,\r\nBad,Personal,,99x\r\nLater,Header,,\r\nThoracic,APMES,,Thoracic surgery\r\nInterscalene,Personal,Nowhere,8\r\n';
const h2 = tagSetFromCsv(hand, names, c);
assert.equal(h2.errors.length, 2, h2.errors.join('\n')); assert.match(h2.errors[0], /99x/); assert.match(h2.errors[1], /Nowhere/);
const hip = h2.set.find(e => e.n === 'Hip #, NOF');
assert.ok(hip && hip.k.startsWith('u:'));
assert.deepEqual(hip.links, ['18', '21']);
assert.equal(h2.set.find(e => e.k === 'c:26').p, h2.set.find(e => e.n === 'Regional').k);
assert.deepEqual(tagLinks(h2.set, hip.k).sort(), ['18', '21', '26']);
assert.equal(h2.set.find(e => e.n === 'Supervisor note').p, h2.set.find(e => e.n === 'Later').k, 'Under a row further down');
assert.ok(h2.set.some(e => e.k === 'c:03'), 'APMES by name');
assert.equal(h2.set.find(e => e.n === 'Interscalene').k, 'u:x', 'same name keeps your tag ID');
assert.deepEqual(h2.set.find(e => e.n === 'Interscalene').links, ['08'], 'single-digit number');
assert.ok(h2.missing.length > 0 && h2.notes.some(n => /at the end/.test(n)), 'missing APMES reported');
assert.ok(h2.set.filter(e => e.k.startsWith('c:')).length === ACTIVE.length, 'missing APMES added back');
// unknown type, duplicate APMES, semicolon file
const odd = tagSetFromCsv('Type;Name;APMES categories\r\nWeird;Foo;\r\nAPMES;A;26\r\nAPMES;B;26\r\n', names, []);
assert.equal(odd.errors.length, 2, odd.errors.join('\n')); assert.ok(odd.set.some(e => e.n === 'Foo' && e.k.startsWith('u:')));
// your tags missing from the file are reported
assert.ok(tagSetFromCsv('Type,Name\r\nPersonal,New one\r\n', names, c).dropped.includes('Interscalene'));
assert.ok(tagSetFromCsv('a,b\r\n1,2', names).errors.length, 'not a tag file');
assert.deepEqual(parseCsv('a,"b ""c""",d\n'), [['a', 'b "c"', 'd']]);
// shorthand: stored cleaned, round-trips through the CSV, matches whole words (not the initials)
assert.deepEqual(cleanShorthand('Appy, lap  appy;appy,'), ['appy', 'lap appy']);
const ks = cleanTagSet([{ k: 'c:32', kw: ['flap', 'free flap'] }, { k: 'u:ap', n: 'Appendix', links: ['13'], kw: 'appy, lap appy' }, { k: 'h:z', n: 'H', hd: true, kw: ['x'] }]);
assert.deepEqual(ks.find(e => e.k === 'u:ap').kw, ['appy', 'lap appy']);
assert.ok(!ks.find(e => e.k === 'h:z').kw, 'headers have no shorthand');
assert.deepEqual(shorthandTags(ks, 'AB 12M lap appy GA'), ['u:ap']);
assert.deepEqual(shorthandTags(ks, 'happy patient'), [], 'whole words only');
assert.deepEqual(shorthandTags([{ k: 'u:dl', n: 'DL', kw: ['dl'] }], 'DL 40F lap chole'), [], 'leading initials are not shorthand');
assert.ok(apmesShorthand(ks).some(x => x.code === '32' && x.re.test(' free  flap')));
const kc = tagSetFromCsv(tagSetToCsv(ks, names), names, ks);
assert.deepEqual(kc.set.find(e => e.k === 'u:ap').kw, ['appy', 'lap appy']);
assert.deepEqual(kc.set.find(e => e.k === 'c:32').kw, ['flap', 'free flap']);
// built-in shorthand: shown on APMES tags until changed; a matching CSV row keeps following it
import('../js/tags.js').then(({ shorthandOf, DEFAULT_SHORTHAND }) => {
  assert.deepEqual(shorthandOf({ k: 'c:32' }), DEFAULT_SHORTHAND['32']);
  assert.deepEqual(shorthandOf({ k: 'c:32', kw: [] }), [], 'turned off');
  assert.deepEqual(cleanTagSet([{ k: 'c:32', kw: [] }]).find(e => e.k === 'c:32').kw, [], 'an empty list on an APMES tag is kept');
  const d0 = defaultTagSet({});
  const d1 = tagSetFromCsv(tagSetToCsv(d0, names), names, d0).set;
  assert.ok(!d1.some(e => e.k.startsWith('c:') && e.kw), 'built-in shorthand is not copied into the set');
});
// shorthand learned from your own cases: frequent in the tag, rare elsewhere; ages and filler skipped
{
  const cs = [];
  for (let i = 0; i < 5; i++) cs.push({ initials: 'AB', details: '45M lap appy GA', cats: ['08', '13'] });
  for (let i = 0; i < 6; i++) cs.push({ initials: 'CD', details: '70M TKR spinal', cats: ['18', '28'], tags: ['u:knee'] });
  const w = learnShorthand(cs, 'c:13').map(x => x.w);
  assert.ok(w.includes('appy') && !w.includes('45m') && !w.includes('ga'), w.join());
  assert.ok(!learnShorthand(cs, 'c:13', { have: ['appy'] }).some(x => x.w === 'appy'), 'words you have are not suggested');
  assert.ok(learnShorthand(cs, 'u:knee').some(x => x.w === 'tkr'), 'personal tags too');
  assert.deepEqual(learnShorthand(cs.slice(0, 2), 'c:13'), [], 'needs at least 3 cases');
}
// review fixes: roman numerals, same names round trip, separator under a title, reparent order, cap
{
  const r = tagSetFromCsv('Type,Name,APMES tags,Under\r\nAPMES,Lower limb,26ii\r\nPersonal,Ankle,26iii\r\nPersonal,Knee,,26ii\r\n', names, []);
  assert.deepEqual(r.errors, [], r.errors.join('\n'));
  assert.equal(r.set.find(e => e.k === 'c:26ii').n, 'Lower limb');
  assert.deepEqual(r.set.find(e => e.n === 'Ankle').links, ['26iii']);
  const same = cleanTagSet([{ k: 'u:o1', n: 'Other', p: 'c:26' }, { k: 'u:o2', n: 'Other', p: 'c:18' }, { k: 'u:kn', n: 'Knee', p: 'u:o1' }]);
  const back2 = tagSetFromCsv(tagSetToCsv(same, names), names, same).set;
  assert.equal(back2.find(e => e.k === 'u:kn').p, 'u:o1', 'same-name parent kept');
  assert.equal(tagSetFromCsv('My tags\nType;Name;APMES tags\nPersonal;Foo;26\n', names, []).set.find(e => e.n === 'Foo').links[0], '26', 'semicolons under a title');
  const order = [{ k: 'h:h1', n: 'H', hd: true }, { k: 'u:child', n: 'C', p: 'u:par' }, { k: 'u:par', n: 'P', p: 'h:h1' }];
  const moved = reparentTag(order, 'u:par', '');
  assert.equal(moved.find(e => e.k === 'u:child').p, 'u:par', 'child keeps its parent');
  assert.equal(order[1].p, 'u:par', 'input not changed');
  const many = Array.from({ length: 320 }, (_, i) => ({ k: 'u:t' + i, n: 'T' + i }));
  const capped = cleanTagSet(many);
  assert.equal(capped.filter(e => e.k.startsWith('u:')).length, 300, 'cap counts your own tags only');
  assert.equal(capped.filter(e => e.k.startsWith('c:')).length, ACTIVE.length);
}
console.log('tags tests passed');
{
  const { moveTag, reparentTag, removeTag } = await import('../js/tags.js');
  const s = cleanTagSet([{ k: 'h:a', n: 'A', hd: true }, { k: 'u:1', n: 'one', p: 'h:a' }, { k: 'u:2', n: 'two', p: 'h:a' }, { k: 'u:3', n: 'three', p: 'u:2' }]);
  const m = moveTag(s, 'u:2', -1);
  assert.deepEqual(m.slice(0, 4).map(e => e.k), ['h:a', 'u:2', 'u:3', 'u:1'], 'moved with its child');
  assert.deepEqual(moveTag(m, 'u:2', 1).slice(0, 4).map(e => e.k), ['h:a', 'u:1', 'u:2', 'u:3']);
  const r = reparentTag(s, 'u:1', 'c:26');
  assert.equal(r.find(e => e.k === 'u:1').p, 'c:26');
  assert.ok(r.findIndex(e => e.k === 'u:1') > r.findIndex(e => e.k === 'c:26'));
  assert.equal(reparentTag(s, 'u:2', 'u:3'), s, 'not under its own child');
  const top = reparentTag(s, 'u:1', '');
  assert.ok(!top.find(e => e.k === 'u:1').p);
  const del = removeTag(s, 'u:2');
  assert.ok(!del.find(e => e.k === 'u:2'));
  assert.equal(del.find(e => e.k === 'u:3').p, 'h:a', 'child moves up');
  assert.equal(removeTag(s, 'c:26'), s, 'built-ins stay');
  console.log('tag editing tests passed');
}
{
  const { dropTag, canPlace } = await import('../js/tags.js');
  const s = cleanTagSet([{ k: 'h:a', n: 'A', hd: true }, { k: 'u:1', n: 'one' }, { k: 'u:2', n: 'two', p: 'u:1' }]);
  // a tag nested by dragging onto another
  let d = dropTag(s, 'u:1', 'c:26', 'inside');
  assert.equal(d.find(e => e.k === 'u:1').p, 'c:26');
  assert.equal(d.find(e => e.k === 'u:2').p, 'u:1', 'its child comes with it');
  assert.ok(d.findIndex(e => e.k === 'u:1') > d.findIndex(e => e.k === 'c:26iii'), 'last child of 26');
  // before / after: sibling of the target
  d = dropTag(s, 'u:1', 'c:03', 'before');
  assert.ok(!d.find(e => e.k === 'u:1').p);
  assert.equal(d.findIndex(e => e.k === 'u:2'), d.findIndex(e => e.k === 'c:03') - 1, 'the block (with its child) sits right before Thoracic');
  d = dropTag(s, 'c:16', 'h:a', 'inside');
  assert.equal(d.find(e => e.k === 'c:16').p, 'h:a', 'a category under a header');
  // not allowed: unchanged
  assert.equal(dropTag(s, 'c:16', 'c:26', 'inside'), s, 'category under a category');
  assert.equal(dropTag(s, 'c:20i', 'c:26', 'inside'), s, 'built-in sub stays with its parent');
  assert.equal(dropTag(s, 'h:a', 'c:26', 'inside'), s, 'header nested');
  assert.equal(dropTag(s, 'u:1', 'u:2', 'inside'), s, 'under its own child');
  assert.ok(canPlace(s, 'c:20ii', 'c:20') && !canPlace(s, 'c:20ii', ''));
  // reorder built-in subs among themselves
  d = dropTag(s, 'c:20iii', 'c:20i', 'before');
  assert.ok(d.findIndex(e => e.k === 'c:20iii') < d.findIndex(e => e.k === 'c:20i'));
  console.log('tag drag tests passed');
}
