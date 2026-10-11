// Run with: node logbook/test/tags.test.mjs  (fake data only)
import assert from 'node:assert/strict';
import { defaultTagSet, cleanTagSet, tagSetOf, tagTree, flatTree, tagLinks, userCatNames, tagName, tagSetToCsv, tagSetFromCsv, parseCsv } from '../js/tags.js';
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
assert.ok(csv.startsWith('Type,Tag,Long name,Under,APMES categories,Hidden,Key'));
assert.ok(/Tag,Interscalene,,Blocks,26i Upper limb blocks,,u:x/.test(csv), csv.split('\r\n').find(l => l.includes('Interscalene')));
const back = tagSetFromCsv(csv, names);
assert.deepEqual(back.errors, []);
const bb = Object.fromEntries(back.set.map(e => [e.k, e]));
assert.equal(bb['c:26'].n, 'Blocks'); assert.equal(bb['c:26'].p, 'h:reg');
assert.equal(bb['u:x'].p, 'c:26'); assert.deepEqual(bb['u:x'].links, ['26i']);
assert.ok(!('n' in bb['c:03']), 'default names not stored');
// hand-written CSV from Excel: moved columns, quotes, no keys
const hand = 'Tag,Type,Under,APMES categories\r\nRegional,Header,,\r\nBlocks,Category,Regional,"26 Peripheral nerve blocks"\r\n"Hip #, NOF",Tag,Blocks,"18; 21"\r\nSupervisor note,Tag,,\r\nBad,Tag,,99x\r\n';
const h2 = tagSetFromCsv(hand, names);
assert.equal(h2.errors.length, 1); assert.match(h2.errors[0], /99x/);
const hip = h2.set.find(e => e.n === 'Hip #, NOF');
assert.ok(hip && hip.k.startsWith('u:'));
assert.deepEqual(hip.links, ['18', '21']);
assert.equal(h2.set.find(e => e.k === 'c:26').p, h2.set.find(e => e.n === 'Regional').k);
assert.deepEqual(tagLinks(h2.set, hip.k).sort(), ['18', '21', '26']);
assert.ok(tagSetFromCsv('a,b\r\n1,2', names).errors.length, 'not a tag file');
assert.deepEqual(parseCsv('a,"b ""c""",d\n'), [['a', 'b "c"', 'd']]);
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
