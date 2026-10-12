// Edge cases of the prewarming app in demo mode (fake data only): a case running past midnight, double-tapping Save,
// BP / HR / BIS checks, the phone's back button with an unsaved reading, Log then move on, Enter on the last question.
// Needs the site served on :8080 (python3 -m http.server 8080), like e2e.mjs.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const fails = [];
const tryit = async f => { try { await f(); } catch (e) { fails.push('error: ' + e.message.split('\n')[0]); } };
const log = (ok, msg) => { if (!ok) fails.push(msg); };
async function fresh(time) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => fails.push('page error: ' + e.message));
  if (time) await pg.clock.install({ time: new Date(time) });
  await pg.goto('http://localhost:8080/prewarm/?demo'); await pg.waitForTimeout(800);
  return { ctx, pg };
}
// DEMO-01 is in pre-warming, DEMO-02 in surgery
const open = async (pg, i) => { await pg.locator('a[href*="#/p/"]', { hasText: i ? 'DEMO-02' : 'DEMO-01' }).first().click(); await pg.waitForSelector('#clock'); };

// A. midnight: intra-op patient, clock crosses midnight
await tryit(async () => {
  const { ctx, pg } = await fresh('2026-10-13T23:40:00');
  await open(pg, 1);
  const before = await pg.textContent('#clock');
  await pg.clock.fastForward('00:40:00'); await pg.waitForTimeout(1500);
  const after = await pg.textContent('#clock');
  log(!/\d+:\d\d:\d\d/.test(after), `midnight: countdown sane (${before.replace(/\s+/g, ' ')} -> ${after.replace(/\s+/g, ' ')})`);
  const due = await pg.textContent('#due').catch(() => '');
  log(!/in \d{3,}/.test(due), 'midnight: due pill sane: ' + due);
  const missed = await pg.$$eval('.strip a.missed', a => a.length);
  log(missed < 12, 'midnight: strip missed count ' + missed);
  await ctx.close();
});
// B. surgery end: later intra-op points stop nagging
await tryit(async () => {
  const { ctx, pg } = await fresh();
  await open(pg, 1);
  await pg.click('[data-ev="io_done"]'); await pg.waitForTimeout(300);
  const end = await pg.textContent('[data-ev="io_done"] b');
  log(!!end.match(/\d\d:\d\d/), 'surgery end set');
  log(!/late \d+:\d\d:\d\d/.test(await pg.textContent('#clock')), 'top bar sane after surgery end');
  await ctx.close();
});
// C. double tap Save: must not save the next timepoint
await tryit(async () => {
  const { ctx, pg } = await fresh();
  await open(pg, 0);
  const tp = (await pg.textContent('.tp b')).trim();
  await pg.dblclick('#save'); await pg.waitForTimeout(500);
  const next = (await pg.textContent('.tp b')).trim();
  const saved = await pg.$$eval('.strip a.done', a => a.map(x => x.textContent.trim()));
  log(next !== tp && !saved.includes(next.replace(' min', '')), `double-tap Save on ${tp} must not save ${next} too (saved: ${saved.join(',')})`);
  await ctx.close();
});
// D. BP: letters refused, unusual asked
await tryit(async () => {
  const { ctx, pg } = await fresh();
  await open(pg, 0);
  await pg.click('#haemolink'); await pg.waitForSelector('input[data-in="sbp"]');
  await pg.fill('input[data-in="sbp"]', '12o'); await pg.click('#save');
  log(/numbers only/.test(await pg.textContent('#toast')), 'BP letters refused: ' + await pg.textContent('#toast'));
  let asked = '';
  pg.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await pg.fill('input[data-in="sbp"]', '320'); await pg.click('#save'); await pg.waitForTimeout(300);
  log(/unusual/.test(asked), 'BP 320 asked: ' + asked);
  pg.once('dialog', d => d.accept());
  await pg.click('#save'); await pg.waitForTimeout(300);
  log(/saved/.test(await pg.textContent('#toast')), 'BP 320 saved after OK');
  await ctx.close();
});
// E. back button with unsaved change, app opened at home: back never leaves the app while there's something to save
await tryit(async () => {
  const { ctx, pg } = await fresh();
  await open(pg, 0);
  const url = pg.url();
  await pg.click('[data-step="1"][data-c="core"]');
  await pg.goBack(); await pg.waitForTimeout(400);
  log(!!await pg.$('dialog.ask[open]') && pg.url() === url, 'back: prompt shown, URL kept');
  await pg.click('dialog.ask [data-a="stay"]', { timeout: 3000 });
  log((await pg.textContent('.num[data-type="core"]')).trim() !== '', 'stay keeps the screen');
  await pg.goBack(); await pg.waitForTimeout(400);
  log(!!await pg.$('dialog.ask[open]') && pg.url() === url, 'back again: prompt again, still in the app');
  await pg.click('dialog.ask [data-a="stay"]', { timeout: 3000 });
  await pg.goBack(); await pg.waitForTimeout(400);
  log(!!await pg.$('dialog.ask[open]') && pg.url() === url, 'third back: prompt again');
  await pg.click('dialog.ask [data-a="drop"]', { timeout: 3000 }); await pg.waitForTimeout(400);
  log(!pg.url().includes('/p/'), "Don't save: back at " + pg.url().split('#')[1]);
  await pg.goForward(); await pg.waitForTimeout(400);
  log(pg.url().includes('/p/') && !await pg.$('dialog.ask[open]'), 'forward: back on the patient, no prompt');
  // link away, Stay, then link away and Save
  await pg.click('[data-step="1"][data-c="core"]');
  await pg.click('#haemolink'); await pg.waitForTimeout(300);
  await pg.click('dialog.ask [data-a="stay"]', { timeout: 3000 }); await pg.waitForTimeout(300);
  log(!pg.url().includes('haemo'), 'link, Stay: still on temps');
  await pg.click('#haemolink'); await pg.waitForTimeout(300);
  await pg.click('dialog.ask [data-a="save"]', { timeout: 3000 }); await pg.waitForTimeout(500);
  log(pg.url().includes('haemo'), 'link, Save: on BP screen');
  await pg.goBack(); await pg.waitForTimeout(400);
  log(pg.url().includes('/p/') && !pg.url().includes('haemo') && !await pg.$('dialog.ask[open]'), 'back from BP: temps, no prompt');
  await ctx.close();
});
// F. Log Prewarm off on an unsaved timepoint: no prompt for the automatic NA
await tryit(async () => {
  const { ctx, pg } = await fresh();
  await open(pg, 0);
  await pg.click('#lognext'); await pg.waitForTimeout(300);
  await pg.click('.pn.next'); await pg.waitForTimeout(300);
  log(!await pg.$('dialog.ask[open]'), 'Log then next: no prompt when nothing typed');
  await ctx.close();
});
// G. Other data: Enter on the last question, Shift+Enter back
await tryit(async () => {
  const { ctx, pg } = await fresh();
  await open(pg, 0);
  await pg.click('#haemolink'); await pg.click('.minicard'); await pg.waitForSelector('details.sect');
  const last = pg.locator('details.sect').last().locator('.fld').last().locator('input, .chip').first();
  await last.focus(); await pg.keyboard.press('Enter');
  log(!await pg.$('dialog.ask[open]'), 'Enter on the last question: no error, no prompt');
  await ctx.close();
});
// H. intra-op: after Surgery end the End readings fall due; once missed they and the unanswered details are listed,
// and Mark data collection as complete lists them first
await tryit(async () => {
  const { ctx, pg } = await fresh('2026-10-13T10:00:00');
  await pg.evaluate(() => { const k = 'prewarm-demo:settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.me = 'AB'; localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForTimeout(600);
  await open(pg, 1);
  await pg.click('[data-ev="io_done"]'); await pg.waitForTimeout(300);
  log(/End of surgery/.test(await pg.textContent('#clock .next')), 'after Surgery end the top bar asks for the End reading');
  await pg.clock.fastForward('00:06:00'); await pg.waitForTimeout(1500);
  const g = await pg.textContent('#gaps');
  log(/Intra-op temps not saved:[^:]*End/.test(g), 'missed End temp listed: ' + g);
  log(/BP, HR, BIS not saved:[^:]*End/.test(g), 'missed End BP listed');
  log(/Intra-op details unanswered: .*Blood loss/.test(g), 'unanswered intra-op details listed');
  let msg = ''; pg.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await pg.click('[data-done]'); await pg.waitForTimeout(300);
  log(/Still to fill/.test(msg) && !/Data collection complete/.test(await pg.textContent('main')), 'Mark complete asks first; Cancel leaves it open');
  await pg.click('#gaps a[href*="/iotemp/"]'); await pg.waitForTimeout(400);
  log(pg.url().includes('/iotemp/'), 'the link opens the first missed intra-op temp');
  await pg.click('#haemolink'); await pg.waitForSelector('input[data-in="sbp"]');
  log(/\d+ to answer/.test(await pg.textContent('.links a[href$="/form/intraop"]')), 'Intra-op details (BP, HR, BIS tab) shows how many are left');
  log(!!await pg.$('#gaps'), 'still to fill on the BP, HR, BIS tab too');
  await ctx.close();
});
await b.close();
if (fails.length) { console.error('prewarm edge: FAIL\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('prewarm edge: ok (midnight, surgery end, double-tap Save, BP checks, back button, Log, Enter, still to fill)');
