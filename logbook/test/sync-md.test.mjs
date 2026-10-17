// Sync (one Markdown file per day): the app's block, the three-way merge, file names, settings and the ledger.
import assert from 'node:assert/strict';
const { START, END, wrapBlock, extractBlock, replaceBlock, merge3, planDay, dayFileName, cleanTarget, cleanSync, targetReady, targetPath,
  cleanSyncLedger, markSynced, changedDays, fingerprint, toBase64, fromBase64, paceWait, rateLimitWait, reconcileSyncState, placeOf, MINE_MARK, SPLIT_MARK, THEIRS_MARK } = await import('../js/sync-md.js');

// ---- blocks ----
{
  assert.equal(wrapBlock('a\nb'), `${START}\na\nb\n${END}`);
  assert.equal(wrapBlock('a\r\nb\n\n'), `${START}\na\nb\n${END}`);   // CRLF in, trailing newlines dropped
  assert.equal(extractBlock('no block here'), null);
  assert.equal(extractBlock(''), null);
  const file = `# My day\n\nmine above\n${START}\nAB lscs\nCD lap chole\n${END}\nmine below\n`;
  assert.deepEqual(extractBlock(file), { before: '# My day\n\nmine above\n', inner: 'AB lscs\nCD lap chole', after: '\nmine below\n', fp: '' });
  // CRLF file: inner comes out with \n
  assert.equal(extractBlock(file.replace(/\n/g, '\r\n')).inner, 'AB lscs\nCD lap chole');
  // an empty block
  assert.equal(extractBlock(`${START}\n\n${END}`).inner, '');
  // the end mark deleted: the block runs to the end of the file
  assert.deepEqual(extractBlock(`top\n${START}\nAB\nuser line\n`), { before: 'top\n', inner: 'AB\nuser line', after: '', fp: '' });
}
{
  const nb = wrapBlock('NEW');
  assert.equal(replaceBlock('', nb), nb + '\n');
  assert.equal(replaceBlock('   \n', nb), nb + '\n');
  // the user's text outside the block stays exactly
  const file = `---\ntags: [day]\n---\nabove\n${START}\nold\n${END}\nbelow\n`;
  assert.equal(replaceBlock(file, nb), `---\ntags: [day]\n---\nabove\n${nb}\nbelow\n`);
  // no block yet: added at the end after a blank line
  assert.equal(replaceBlock('my own note', nb), `my own note\n\n${nb}\n`);
  assert.equal(replaceBlock('my own note\n\n\n', nb), `my own note\n\n${nb}\n`);
  // CRLF files keep CRLF, block included
  assert.equal(replaceBlock(`a\r\n${START}\r\nold\r\n${END}\r\nb\r\n`, wrapBlock('x\ny')), `a\r\n${START}\r\nx\r\ny\r\n${END}\r\nb\r\n`);
  // a block at the very end of a file with no newline after it
  assert.equal(replaceBlock(`a\n${START}\nold\n${END}`, nb), `a\n${nb}\n`);
  // round trip
  assert.equal(extractBlock(replaceBlock('hello', wrapBlock('l1\nl2'))).inner, 'l1\nl2');
}

// ---- merge3 ----
{
  // nothing changed / one side changed
  assert.deepEqual(merge3('a\nb\nc', 'a\nb\nc', 'a\nb\nc'), { text: 'a\nb\nc', conflicts: 0 });
  assert.deepEqual(merge3('a\nb\nc', 'a\nB\nc', 'a\nb\nc'), { text: 'a\nB\nc', conflicts: 0 });
  assert.deepEqual(merge3('a\nb\nc', 'a\nb\nc', 'a\nb\nc\nuser'), { text: 'a\nb\nc\nuser', conflicts: 0 });
  // both changed different lines: both applied
  assert.deepEqual(merge3('1\n2\n3\n4\n5', '1\nTWO\n3\n4\n5', '1\n2\n3\n4\nFIVE'), { text: '1\nTWO\n3\n4\nFIVE', conflicts: 0 });
  // the app adds a case at the end, the user annotated an earlier line
  assert.deepEqual(merge3('AB lscs\nCD hip', 'AB lscs\nCD hip\nEF knee', 'AB lscs (difficult airway)\nCD hip'), { text: 'AB lscs (difficult airway)\nCD hip\nEF knee', conflicts: 0 });
  // the app deletes a line the user didn't touch
  assert.deepEqual(merge3('a\nb\nc', 'a\nc', 'a\nb\nc\nd'), { text: 'a\nc\nd', conflicts: 0 });
  // identical changes on both sides: once
  assert.deepEqual(merge3('a\nb', 'a\nX\nb', 'a\nX\nb'), { text: 'a\nX\nb', conflicts: 0 });
  // conflicting lines: both kept, marked, the app's first
  const c = merge3('a\nb\nc', 'a\nAPP\nc', 'a\nUSER\nc');
  assert.equal(c.conflicts, 1);
  assert.equal(c.text, ['a', MINE_MARK, 'APP', SPLIT_MARK, 'USER', THEIRS_MARK, 'c'].join('\n'));
  // empty base: both sides' text is new; the same text once, different text both kept (added at the end)
  assert.deepEqual(merge3('', 'x\ny', 'x\ny'), { text: 'x\ny', conflicts: 0 });
  assert.deepEqual(merge3('', 'x', 'y'), { text: 'y\nx', conflicts: 0 });
  // both add at the end (a new case, the user's note): both kept, the user's first (under the line it is about)
  assert.deepEqual(merge3('a', 'a\nAPP', 'a\nUSER'), { text: 'a\nUSER\nAPP', conflicts: 0 });
  // the user's reflection on the day's last case stays under that case when the app adds the next one
  assert.deepEqual(merge3('[[2026-10-13]]\n1. AB lap chole', '[[2026-10-13]]\n1. AB lap chole\n\n2. CD hernia', '[[2026-10-13]]\n1. AB lap chole\n   - learnt: X'),
    { text: '[[2026-10-13]]\n1. AB lap chole\n   - learnt: X\n\n2. CD hernia', conflicts: 0 });
  // both add different lines at the same place in the middle: a clash
  assert.equal(merge3('a\nb', 'a\nX\nb', 'a\nY\nb').conflicts, 1);
  // the user deletes a line the app changed: a clash (kept both ways)
  assert.equal(merge3('a\nb\nc', 'a\nB\nc', 'a\nc').conflicts, 1);
  assert.deepEqual(merge3('', '', 'user only'), { text: 'user only', conflicts: 0 });
  assert.deepEqual(merge3('', 'app only', ''), { text: 'app only', conflicts: 0 });
  // everything emptied by the user, the app unchanged: stays empty
  assert.deepEqual(merge3('a\nb', 'a\nb', ''), { text: '', conflicts: 0 });
  // CRLF anywhere merges as \n
  assert.deepEqual(merge3('a\r\nb', 'a\r\nb\r\nc', 'a\nb'), { text: 'a\nb\nc', conflicts: 0 });
  // trailing newline: a change only there is a change like any other
  assert.deepEqual(merge3('a\nb', 'a\nb\n', 'a\nb'), { text: 'a\nb\n', conflicts: 0 });
  assert.deepEqual(merge3('a\nb\n', 'a\nb\n', 'a\nb\nmore\n'), { text: 'a\nb\nmore\n', conflicts: 0 });
  // repeated lines don't confuse it
  assert.deepEqual(merge3('-\n-\n-', '-\nx\n-\n-', '-\n-\n-\ny'), { text: '-\nx\n-\n-\ny', conflicts: 0 });
  // a long day merges quickly
  const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
  const t0 = Date.now();
  const r = merge3(big.join('\n'), [...big.slice(0, 1500), 'APP', ...big.slice(1500)].join('\n'), [...big.slice(0, 10), 'USER', ...big.slice(10)].join('\n'));
  assert.equal(r.conflicts, 0); assert.ok(r.text.includes('APP') && r.text.includes('USER')); assert.ok(Date.now() - t0 < 2000);
}

// ---- planDay: what to write for a day ----
{
  // no file yet
  assert.deepEqual(planDay({ remoteText: null, inner: 'AB lscs' }), { text: wrapBlock('AB lscs', fingerprint('AB lscs')) + '\n', write: true, conflicts: 0, merged: false });
  // the start mark carries the fingerprint of the app's text
  assert.equal(wrapBlock('AB', 'k1.2'), `<!-- logbook:start fp=k1.2 -->\nAB\n${END}`);
  assert.deepEqual(extractBlock(`top\n${wrapBlock('AB', 'k1.2')}\n`), { before: 'top\n', inner: 'AB', after: '\n', fp: 'k1.2' });
  assert.equal(extractBlock(wrapBlock('AB')).fp, '');
  // a file the user made, without our block: the block is added, their text kept
  const p1 = planDay({ remoteText: '# Thoughts\nbusy list\n', inner: 'AB lscs' });
  assert.equal(p1.text, `# Thoughts\nbusy list\n\n${wrapBlock('AB lscs', fingerprint('AB lscs'))}\n`); assert.equal(p1.write, true);
  // unchanged inside since last time (fp matches): replaced; the user's text outside kept
  const sent = 'AB lscs';
  const remote = `my top\n${wrapBlock(sent)}\nmy bottom\n`;
  const p2 = planDay({ remoteText: remote, inner: 'AB lscs\nCD hip', last: { fp: fingerprint(sent), base: sent } });
  assert.equal(p2.text, `my top\n${wrapBlock('AB lscs\nCD hip', fingerprint('AB lscs\nCD hip'))}\nmy bottom\n`); assert.equal(p2.merged, false);
  // nothing new: no write
  assert.equal(planDay({ remoteText: remote, inner: sent, last: { fp: fingerprint(sent), base: sent } }).write, false);
  // edited inside: merged with the last sent text as the base
  const edited = `my top\n${wrapBlock('AB lscs - my note')}\n`;
  const p3 = planDay({ remoteText: edited, inner: 'AB lscs\nCD hip', last: { fp: fingerprint(sent), base: sent } });
  assert.equal(extractBlock(p3.text).inner, 'AB lscs - my note\nCD hip'); assert.equal(p3.merged, true); assert.equal(p3.conflicts, 0);
  // and the next sync after that keeps the user's edit (base = the app's text then, not the merged file)
  const p4 = planDay({ remoteText: p3.text, inner: 'AB lscs\nCD hip\nEF knee', last: { fp: fingerprint('AB lscs\nCD hip'), base: 'AB lscs\nCD hip' } });
  assert.equal(extractBlock(p4.text).inner, 'AB lscs - my note\nCD hip\nEF knee');
  // the same line changed both ways: both kept, marked
  const p5 = planDay({ remoteText: wrapBlock('AB lscs USER'), inner: 'AB lscs APP', last: { fp: fingerprint(sent), base: sent } });
  assert.equal(p5.conflicts, 1); assert.match(p5.text, /<<<<<<< logbook\nAB lscs APP\n=======\nAB lscs USER\n>>>>>>> your edits/);
  // no ledger on this device (new phone): the same text is quietly adopted, a different one kept both ways
  assert.equal(planDay({ remoteText: wrapBlock('AB lscs'), inner: 'AB lscs' }).write, false);
  assert.equal(planDay({ remoteText: wrapBlock('AB old'), inner: 'AB new' }).conflicts, 1);
  // base lost but fp known: both kept, marked (never drops the user's lines)
  const p6 = planDay({ remoteText: wrapBlock('x\nuser'), inner: 'x\napp', last: { fp: 'other' } });
  assert.equal(p6.conflicts, 1); assert.match(p6.text, /user/); assert.match(p6.text, /app/);
  // the user emptied the block and no base: the app's text goes back in
  assert.equal(extractBlock(planDay({ remoteText: wrapBlock(''), inner: 'AB' }).text).inner, 'AB');
  // CRLF file stays CRLF
  const p7 = planDay({ remoteText: `top\r\n${wrapBlock(sent).replace(/\n/g, '\r\n')}\r\n`, inner: 'AB lscs\nCD hip', last: { fp: fingerprint(sent), base: sent } });
  assert.equal(p7.text, `top\r\n${wrapBlock('AB lscs\nCD hip', fingerprint('AB lscs\nCD hip')).replace(/\n/g, '\r\n')}\r\n`);

  // a second device (or this one after sign-out cleared its ledger): no ledger, no base
  const phone = planDay({ remoteText: null, inner: '- AB lap chole' }).text;
  // the app added a case and nobody touched the file: replaced, no marks
  const d1 = planDay({ remoteText: `mine above\n${phone}`, inner: '- AB lap chole\n- CD TKR' });
  assert.equal(d1.conflicts, 0); assert.equal(d1.merged, false);
  assert.equal(extractBlock(d1.text).inner, '- AB lap chole\n- CD TKR'); assert.ok(d1.text.startsWith('mine above\n'));
  // the user annotated inside the block and the app's text is the same as when it was written: left alone
  const ann = phone.replace('chole', 'chole\n   - learnt X');
  assert.equal(planDay({ remoteText: ann, inner: '- AB lap chole' }).write, false);
  // a merged block written by the other device holds the same app text: left alone too
  const p8 = planDay({ remoteText: ann, inner: '- AB lap chole\n- CD TKR', last: { fp: fingerprint('- AB lap chole'), base: '- AB lap chole' } });
  assert.equal(extractBlock(p8.text).inner, '- AB lap chole\n   - learnt X\n- CD TKR'); assert.equal(p8.merged, true);
  assert.equal(extractBlock(p8.text).fp, fingerprint('- AB lap chole\n- CD TKR'));   // the app's text, not the merged one
  assert.equal(planDay({ remoteText: p8.text, inner: '- AB lap chole\n- CD TKR' }).write, false);
  // edited, no base, but the app's text has every line of the file's block (an old file without a fingerprint)
  const p9 = planDay({ remoteText: wrapBlock('- AB lap chole'), inner: '- AB lap chole\n- CD TKR' });
  assert.equal(p9.conflicts, 0); assert.equal(extractBlock(p9.text).inner, '- AB lap chole\n- CD TKR');
  // edited and the app changed too, no base: both kept, marked (never drops the user's lines)
  const p10 = planDay({ remoteText: ann, inner: '- AB lap chole, edited' });
  assert.equal(p10.conflicts, 1); assert.match(p10.text, /learnt X/); assert.match(p10.text, /edited/);
}

// ---- GitHub's write limits ----
{
  assert.equal(paceWait([], 1000), 0);
  const t = Array.from({ length: 60 }, (_, i) => 100000 + i * 100);
  assert.equal(paceWait(t.slice(0, 59), 106000), 0);
  assert.equal(paceWait(t, 106000), 100000 + 60e3 - 106000);   // the 60th write in a minute waits for the oldest
  assert.equal(paceWait(t, 200000), 0);
  const hdr = o => k => (k in o ? String(o[k]) : null);
  assert.equal(rateLimitWait(403, hdr({}), 'Resource not accessible by personal access token'), null);
  assert.equal(rateLimitWait(404, hdr({}), 'rate limit'), null);
  assert.equal(rateLimitWait(403, hdr({}), 'You have exceeded a secondary rate limit'), 1);
  assert.equal(rateLimitWait(403, hdr({ 'retry-after': 300 }), ''), 5);
  assert.equal(rateLimitWait(429, hdr({}), ''), 1);
  assert.equal(rateLimitWait(403, hdr({ 'x-ratelimit-remaining': 0, 'x-ratelimit-reset': 1000 + 600 }), '', 1000 * 1000), 10);
}

// ---- file names and paths ----
{
  assert.equal(dayFileName('', '2026-10-13'), '2026-10-13.md');
  assert.equal(dayFileName('{date}.md', '2026-10-13'), '2026-10-13.md');
  assert.equal(dayFileName('{{date}} log.md', '2026-10-13'), '2026-10-13 log.md');
  assert.equal(dayFileName('{year}/{month}/{date}.md', '2026-10-13'), '2026/10/2026-10-13.md');
  assert.equal(dayFileName('{year}-{month}-{day} Daily.md', '2026-10-13'), '2026-10-13 Daily.md');
  // no date in the pattern: one file a day all the same
  assert.equal(dayFileName('Logbook.md', '2026-10-13'), 'Logbook 2026-10-13.md');
  // unsafe characters and folder tricks go
  assert.equal(dayFileName('../a:b*?/{date}.md', '2026-10-13'), 'ab/2026-10-13.md');
  assert.equal(dayFileName('/{date}.md\nsecond line', '2026-10-13'), '2026-10-13.md');
  const t = { kind: 'drive', fileName: '{date}.md' };
  assert.equal(targetPath(t, '2026-10-13'), 'Daily/2026-10-13.md');
  assert.equal(targetPath({ ...t, kind: 'dropbox' }, '2026-10-13'), '/Daily/2026-10-13.md');
  assert.equal(targetPath({ ...t, kind: 'github', folder: 'Journal/Logbook' }, '2026-10-13'), 'Journal/Logbook/2026-10-13.md');
  assert.equal(targetPath({ ...t, kind: 'github', folder: '' }, '2026-10-13'), '2026-10-13.md');
}

// ---- settings: never tokens; cleaned ----
{
  assert.deepEqual(cleanSync(null), { targets: [], remind: false });
  assert.equal(cleanTarget({ kind: 'ftp' }), null);
  const d = cleanTarget({ id: 'a1', kind: 'drive', token: 'SECRET' });
  assert.deepEqual(d, { id: 'a1', kind: 'drive', name: 'Google Drive', fileName: '{date}.md', from: '' });
  const g = cleanTarget({ id: 'g!1', kind: 'github', owner: 'fake-user', repo: 'notes.repo', branch: '', folder: '/Daily/../x/', token: 'ghp_x', from: '2026-01-01' });
  assert.deepEqual(g, { id: 'g1', kind: 'github', name: 'GitHub', fileName: '{date}.md', from: '2026-01-01', owner: 'fake-user', repo: 'notes.repo', branch: 'main', folder: 'Daily/x' });
  assert.equal(JSON.stringify(cleanSync({ targets: [{ kind: 'github', token: 't', pat: 'p' }] })).includes('"t"'), false);
  assert.equal(cleanTarget({ kind: 'github', owner: 'bad owner', repo: 'r' }).owner, '');
  assert.equal(targetReady(cleanTarget({ kind: 'github', owner: 'o' })), false);
  assert.equal(targetReady(cleanTarget({ kind: 'github', owner: 'o', repo: 'r' })), true);
  assert.equal(targetReady(cleanTarget({ kind: 'dropbox' })), true);
  // duplicates by id dropped, at most six
  const many = cleanSync({ remind: 1, targets: [{ id: 'x', kind: 'drive' }, { id: 'x', kind: 'dropbox' }, ...Array.from({ length: 9 }, (_, i) => ({ id: 'd' + i, kind: 'dropbox' }))] });
  assert.equal(many.targets.length, 6); assert.equal(many.targets[0].kind, 'drive'); assert.equal(many.remind, true);
}

// ---- ledger ----
{
  assert.deepEqual(cleanSyncLedger('x'), {});
  let l = markSynced({}, 't1', '2026-10-13', 'fp1', 'rev1');
  l = markSynced(l, 't1', '2026-10-12', 'fp2');
  assert.deepEqual(l, { t1: { '2026-10-12': { fp: 'fp2' }, '2026-10-13': { fp: 'fp1', rev: 'rev1' } } });
  assert.deepEqual(cleanSyncLedger({ t1: { 'not-a-date': { fp: 'x' }, '2026-01-01': 'old string', '2026-01-02': { fp: 'ok', rev: 5 } } }), { t1: { '2026-01-02': { fp: 'ok' } } });
  assert.deepEqual(changedDays(l, 't1', { '2026-10-13': 'fp1', '2026-10-12': 'CHANGED', '2026-10-14': 'new' }), ['2026-10-12', '2026-10-14']);
  assert.deepEqual(changedDays(l, 'other', { '2026-10-13': 'fp1' }), ['2026-10-13']);
  assert.deepEqual(changedDays({}, 't1', { bad: 'x' }), []);
}

// ---- UTF-8 base64 ----
{
  const s = 'Fake – “quotes” café 你好 🙂\nline 2';
  assert.equal(fromBase64(toBase64(s)), s);
  assert.equal(toBase64('hi'), 'aGk=');
  assert.equal(fromBase64('aGk=\n'), 'hi');   // GitHub wraps its base64 in lines
  assert.equal(fromBase64(toBase64('x'.repeat(100000))).length, 100000);
}

// another device rewrote the block since this device's last sync (its fp mark differs): this device's base is not
// used, so the cases both have are not doubled
{
  const c1 = '- AB lap chole GA', c12 = c1 + '\n- CD TKR spinal', c123 = c12 + '\n- EF LSCS spinal';
  const file = wrapBlock(c12 + '\nhard spinal, 3 attempts', fingerprint(c12)) + '\n';
  const p = planDay({ remoteText: file, inner: c123, last: { fp: fingerprint(c1), base: c1 } });
  // (no silent merge: both versions, marked, for the user to sort out)
  assert.equal(p.conflicts, 1);
  assert.match(p.text, /hard spinal/); assert.match(p.text, /EF LSCS/);
}
// a secondary rate limit with the hourly window not used up: a minute, not the hourly reset
{
  const hdr = o => k => (k in o ? String(o[k]) : null);
  assert.equal(rateLimitWait(403, hdr({ 'x-ratelimit-remaining': 4321, 'x-ratelimit-reset': 1000 + 3000 }), 'You have exceeded a secondary rate limit', 1000 * 1000), 1);
  // at most GH_PER_HOUR writes in an hour
  const hour = Array.from({ length: 450 }, (_, i) => i * 1000);
  assert.ok(paceWait(hour, 460000) > 0);
  assert.equal(paceWait(hour, 3600e3 + 1000), 0);
}
// the ledger follows the place, not only the target id: pointed elsewhere (another device, a settings file) or
// removed, its ledger goes; an old ledger with no place recorded is kept and takes the place it has now
{
  const t = { id: 't1', kind: 'github', owner: 'me', repo: 'notes-a', branch: 'main', folder: '', fileName: '{date}.md' };
  const first = reconcileSyncState({ ledger: { t1: { '2026-10-13': { fp: 'x' } }, gone: { '2026-10-01': { fp: 'y' } } }, at: { gone: 1 } }, [t]);
  assert.deepEqual(first.drop, ['gone']); assert.ok(first.state.ledger.t1); assert.equal(first.state.places.t1, placeOf(t));
  const moved = reconcileSyncState(first.state, [{ ...t, repo: 'vault-b' }]);
  assert.deepEqual(moved.drop, ['t1']); assert.equal(moved.state.ledger.t1, undefined);
  assert.deepEqual(reconcileSyncState(first.state, [t]).drop, []);
}
console.log('sync-md tests passed');

// reflection notes (log2 15): one per reflection, named as the export names them, keyed r:<id>; renamed ones flagged
{
  const { reflectionFiles, changedRefls, placePath, REFL_KEY, cleanTarget: ct, cleanSyncLedger: cl, markSynced: ms } = await import('../js/sync-md.js');
  const refls = [
    { id: 'rb', date: '2026-10-12', initials: 'ZB', title: 'Fake b', headingId: 'lscs', points: [{ heading: 'P', text: 'fake' }], createdAt: 2 },
    { id: 'ra', date: '2026-10-11', initials: 'ZA', title: 'Fake a', points: [], createdAt: 1 },
    { id: 'gone', date: '2026-10-10', deleted: true, title: 'x' },
  ];
  const files = reflectionFiles(refls, null);
  assert.deepEqual(files.map(x => x.key), ['r:ra', 'r:rb'], 'oldest first, deleted ones left out');
  assert.match(files[0].path, /^Reflections\/2026-10\/.+\.md$/);
  assert.ok(!files[1].text.startsWith('---') && files[1].text.includes('# Fake b'), 'no front matter: ' + files[1].text.slice(0, 40));
  assert.ok(REFL_KEY.test('r:ra') && !REFL_KEY.test('2026-10-10'));
  assert.equal(placePath({ kind: 'github', folder: 'Vault/Daily' }, files[0].path), 'Vault/Daily/' + files[0].path);
  assert.equal(placePath({ kind: 'dropbox' }, 'Reflections/x.md'), '/Daily/Reflections/x.md');
  // what to write: new, changed, renamed
  const fps = { 'r:ra': 'f1', 'r:rb': 'f2' };
  let ledger = ms({}, 't1', 'r:ra', 'f1', 'rev1', files[0].path);
  ledger = ms(ledger, 't1', 'r:rb', 'f2', 'rev2', 'Reflections/2026-10/old name.md');
  ledger = ms(ledger, 't1', '2026-10-11', 'fd');
  const ch = changedRefls(ledger, 't1', files, fps);
  assert.deepEqual(ch.map(x => [x.key, x.renamed]), [['r:rb', true]], 'unchanged skipped; a new name is written');
  assert.deepEqual(changedRefls(ledger, 't1', files, { ...fps, 'r:ra': 'f9' }).map(x => x.key), ['r:ra', 'r:rb']);
  // the ledger keeps reflection entries (with their path) beside the days
  const back = cl(ledger);
  assert.equal(back.t1['r:ra'].path, files[0].path); assert.equal(back.t1['2026-10-11'].fp, 'fd');
  assert.equal(cl({ t1: { 'r:bad key': { fp: 'x' }, 'x:1': { fp: 'y' } } }).t1['r:bad key'], undefined);
  // the place's switch: only true is kept
  assert.equal(ct({ kind: 'dropbox', reflections: true }).reflections, true);
  assert.equal('reflections' in ct({ kind: 'dropbox', reflections: 'yes' }), false);
  console.log('sync reflection notes: ok');
}
