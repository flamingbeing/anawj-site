// Fake data only. Form view (More → Form view): the old Google Form's layout saving straight into the logbook through
// the Add tab's own path. A case entered there has the same record shape as one entered on the Add tab, shows in the
// Logbook, nothing goes through the Form inbox, required questions are checked, "Edit your response" changes the same
// case, and an ID number or a double entry is asked about first. SHOTS=<dir> saves a 390 px screenshot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, engine, ignorable } from './browsers.mjs';
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const KEY = 'apmes-logbook-demo-v1';
const shots = process.env.SHOTS || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const b = await launch();
if (!b) { console.log(`SKIP formview (${engine} is not installed here)`); process.exit(0); }
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  const store = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  const casesOf = async () => Object.values(Object.values((await store()).logbooks)[0].cases);
  await p.goto(base + '?demo=reset#log'); await p.waitForSelector('textarea.details');

  // a case from the Add tab, to compare with
  const before = (await casesOf()).length;
  await p.locator('textarea.details').fill('FK 34F LSCS spinal');
  await p.locator('.chip', { hasText: /^16\)|LSCS/ }).first().click().catch(() => {});
  if (!(await p.locator('.sel-chip, .chip.on[data-code]').count())) {
    await p.locator('input[type=search], input.picker').first().fill('Caesarean'); await p.locator('[data-code="16"]').first().click();
  }
  await p.getByRole('button', { name: /^Save/ }).first().click();
  await p.getByText(/^Saved /).first().waitFor();
  const appCase = (await casesOf()).find(c => /FK/.test(c.initials + c.details));
  assert.ok(appCase, 'the Add tab case is stored');

  // More → Form view
  await p.evaluate(() => { location.hash = '#more'; });
  await p.locator('.more-list a[data-go=formview]').click();
  await p.getByRole('heading', { name: 'APMES Case Numbers' }).waitFor();
  const qs = await p.locator('.fv-t').allInnerTexts();
  assert.deepEqual(qs.map(t => t.replace(/\s*\*\s*$/, '').trim()), ['Resident', 'Date', 'Initials, Case Details', 'Category']);
  assert.equal(await p.locator('.fv-opt').count(), 46, 'the Form had 46 categories');
  if (shots) await p.waitForTimeout(500), await p.screenshot({ path: `${shots}/formview-390.png`, fullPage: false });

  // required questions are checked, nothing is saved
  await p.getByRole('button', { name: 'Submit', exact: true }).click();
  assert.equal(await p.locator('.fv-problem:not([hidden])').count(), 2, 'every empty required question is flagged');
  await p.locator('#fv-text').fill('GH 40F LSCS spinal');
  await p.getByRole('button', { name: 'Submit', exact: true }).click();
  assert.ok(await p.locator('#fv-p-cat').isVisible(), 'category is required');
  assert.equal((await casesOf()).length, before + 1);

  // submit
  await p.locator('.fv-opt', { hasText: /^16\)/ }).locator('input').check();
  await p.locator('#fv-date').fill('2026-10-12');
  await p.getByRole('button', { name: 'Submit', exact: true }).click();
  await p.getByText('Your response has been recorded.').waitFor();
  const all = await casesOf();
  assert.equal(all.length, before + 2);
  const formCase = all.find(c => c.initials === 'GH');
  assert.ok(formCase, 'stored with initials split off like the Add tab');
  assert.deepEqual(Object.keys(formCase).sort(), Object.keys(appCase).sort(), 'same record shape as a Add tab case');
  assert.equal(formCase.source, 'app'); assert.equal(formCase.date, '2026-10-12'); assert.deepEqual(formCase.cats, ['16']);
  assert.equal(formCase.details, '40F LSCS spinal');
  // nothing went through the Form inbox
  const st = await store();
  assert.ok(!JSON.stringify(st).includes('formInbox') && !Object.values(st.logbooks)[0].formGone, 'no Form inbox entry');
  assert.ok(!all.some(c => c.source === 'form'), 'not a Form case');

  // it is in the Logbook
  await p.evaluate(() => { location.hash = '#logbook'; });
  await p.waitForFunction(() => document.getElementById('app').dataset.page === 'logbook');
  await p.getByRole('button', { name: 'List', exact: true }).click();
  await p.getByText('40F LSCS spinal').first().waitFor();

  // edit straight after submitting: back on the form, filled; saving changes the same case
  await p.evaluate(() => { location.hash = '#formview'; });
  await p.getByText('Your response has been recorded.').waitFor();
  await p.locator('.fv-edit').click();
  assert.equal(await p.locator('#fv-text').inputValue(), 'GH 40F LSCS spinal');
  assert.ok(await p.locator('.fv-opt', { hasText: /^16\)/ }).locator('input').isChecked());
  await p.locator('.fv-opt', { hasText: /^17\)/ }).locator('input').check();
  await p.locator('#fv-text').fill('GH 41F LSCS spinal and epidural');
  await p.getByRole('button', { name: 'Save changes' }).click();
  await p.getByText('Your response has been recorded.').waitFor();
  const edited = (await casesOf()).filter(c => c.initials === 'GH');
  assert.equal(edited.length, 1, 'the same case, not a second one');
  assert.equal(edited[0].id, formCase.id); assert.deepEqual(edited[0].cats, ['16', '17']); assert.equal(edited[0].details, '41F LSCS spinal and epidural');
  assert.equal(edited[0].createdAt, formCase.createdAt);

  // Submit another: an empty form; an ID number is asked about first; a double entry too
  await p.locator('.fv-again').click();
  assert.equal(await p.locator('#fv-text').inputValue(), '');
  await p.locator('#fv-text').fill('IJ 5yo hernia S1234567A');
  await p.locator('.fv-opt', { hasText: /^20iii\)/ }).locator('input').check();
  await p.getByRole('button', { name: 'Submit', exact: true }).click();
  await p.getByRole('heading', { name: 'Looks like an ID number' }).waitFor();
  await p.locator('dialog').last().getByRole('button', { name: 'Cancel' }).click();
  assert.ok(!(await casesOf()).some(c => c.initials === 'IJ'), 'cancelled: nothing saved');
  await p.locator('#fv-text').fill('GH 41F LSCS spinal and epidural');
  await p.locator('#fv-date').fill('2026-10-12');
  await p.getByRole('button', { name: 'Submit', exact: true }).click();
  await p.getByRole('heading', { name: 'Possible duplicate' }).waitFor();
  await p.locator('dialog').last().getByRole('button', { name: 'Cancel' }).click();
  assert.equal((await casesOf()).filter(c => c.initials === 'GH').length, 1);

  assert.deepEqual(errors, [], 'console errors');
  console.log('PASS formview');
} finally { await b.close(); }
