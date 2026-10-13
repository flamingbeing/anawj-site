// Fake data only. A dialog's close steps back in history, and the step can land late (WebKit). A page opened in
// between (location.hash = …, or a pushState) must stay: the late step must not take the app back to the old page.
import assert from 'node:assert/strict';
import { launch, engine } from './browsers.mjs';
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await launch();
if (!b) { console.log(`SKIP late step back: ${engine} not installed`); process.exit(0); }
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const tab = () => p.evaluate(async () => (await import('./js/ui-core.js')).S.tab);
  await p.goto(base + '?demo#points'); await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  const until = async (fn, msg) => { for (let i = 0; i < 40; i++) { if (await fn()) return; await p.waitForTimeout(75); } throw new Error(msg); };
  // Cancel in the Edit case dialog, its step back held for 600 ms, and a newer page opened meanwhile
  const cancelThenGo = async (how, go) => {
    await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); const { editCaseDialog } = await import('./js/ui-log.js'); editCaseDialog(S.cases[0]); });
    const dlg = p.locator('dialog[open]'); await dlg.waitFor();
    await p.evaluate(() => { const back = history.back.bind(history); history.back = () => setTimeout(back, 600); });
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await p.waitForFunction(() => !document.querySelector('dialog[open]'));
    await p.evaluate(go);
    await p.waitForTimeout(900);   // the late step has come and gone
    await p.evaluate(() => { delete history.back; });
    assert.match(p.url(), /#sharefmt$/, `${how}: still on the newer page`);
    await until(async () => await tab() === 'sharefmt', `${how}: the app shows the newer page, not ${await tab()}`);
    // Back from there goes to the page under the dialog
    await p.goBack(); await p.waitForURL(/#points$/); await until(async () => await tab() === 'points', `${how}: Back goes to Learning points`);
  };
  // the hash change is seen before the late step lands
  await cancelThenGo('hash', () => { location.hash = '#sharefmt'; });
  // a pushState (no hashchange): the late step lands unseen, and steps forward to the newer page again
  await cancelThenGo('pushState', () => history.pushState(null, '', location.pathname + location.search + '#sharefmt'));
  assert.deepEqual(errors, []);
  console.log(`PASS late step back after a dialog (${engine} ${width})`);
  await ctx.close();
} } finally { await b.close(); }
