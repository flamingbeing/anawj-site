// Fake data only. The logbook moved from anawj.com/logbook/ to apmes.anawj.com/logbook/ (SUBDOMAINS.md): the old address
// forwards (path, query and # kept), unless this browser has logbook choices saved there, when it offers them as a file first;
// Settings -> Settings file at the new address loads that file. No loop on the new address, localhost or inside a frame.
// Both hosts are answered from the local server (page.route), so no network is needed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const port = process.env.PORT || 8080;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try {
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
    const seen = [];
    await ctx.route(/^https:\/\/(www\.)?(apmes\.)?anawj\.com\//, async route => {
      const u = new URL(route.request().url());
      seen.push(u.href);
      // a module still loading when the test closes its page is no failure (the race failed a loaded full run once)
      try { await route.fulfill({ response: await route.fetch({ url: `http://localhost:${port}${u.pathname}${u.search}` }) }); }
      catch (err) { if (!/closed|disposed/i.test(err.message)) throw err; }   // (or its response already gone)
    });
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    return { ctx, p, seen, errors };
  };

  // 1. nothing saved at the old address: it forwards at once, keeping path, query and #
  { const { ctx, p, seen } = await mk();
    await p.goto('https://anawj.com/logbook/?demo#log').catch(() => {});
    await p.waitForURL(/apmes\.anawj\.com/);
    assert.equal(p.url(), 'https://apmes.anawj.com/logbook/?demo#log');
    await p.waitForSelector('textarea.details');
    await ctx.close(); }

  // 2. the new address, localhost and a frame do not forward
  { const { ctx, p } = await mk();
    await p.goto('https://apmes.anawj.com/logbook/?demo'); await p.waitForSelector('textarea.details');
    assert.match(p.url(), /^https:\/\/apmes\.anawj\.com\/logbook\/\?demo/);
    assert.equal(await p.evaluate(() => window.LOGBOOK_MOVED_TO), undefined);
    await p.goto(`http://localhost:${port}/logbook/?demo`); await p.waitForSelector('textarea.details');
    assert.ok(p.url().startsWith(`http://localhost:${port}/logbook/?demo`));
    await ctx.close(); }
  { const { ctx, p } = await mk();
    await p.goto(`http://localhost:${port}/logbook/?demo`); await p.waitForSelector('textarea.details');
    // the page editor loads pages from anawj.com in a frame: no forwarding there
    await p.setContent(`<iframe id="f" src="https://anawj.com/logbook/?demo" style="width:390px;height:700px"></iframe>`);
    const fr = await (await p.waitForSelector('#f')).contentFrame();
    await fr.waitForSelector('textarea.details');
    assert.match(fr.url(), /^https:\/\/anawj\.com\/logbook\/\?demo/);
    await ctx.close(); }

  // 3. choices saved at the old address: the page stays and offers them as a file, then goes on
  { const { ctx, p, errors } = await mk();
    await p.goto('https://anawj.com/logbook/robots-check-only').catch(() => {});   // any page on the origin, to set storage
    await p.evaluate(() => { localStorage.setItem('apmes-logbook-theme', 'dark'); localStorage.setItem('apmes-logbook-display', '{"flat":true}'); localStorage.setItem('apmes-logbook-demo-small', '1'); localStorage.setItem('other-app', 'x'); });
    await p.goto('https://anawj.com/logbook/#log');
    await p.getByRole('heading', { name: 'The logbook has moved' }).waitFor();
    assert.equal(p.url(), 'https://anawj.com/logbook/#log');
    assert.match(await p.locator('.moved').innerText(), /apmes\.anawj\.com\/logbook[\s\S]*Settings → Settings file/);
    const dl = p.waitForEvent('download');
    await p.getByRole('button', { name: 'Download this browser’s choices' }).click();
    const file = await (await dl).path();
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(data.kind, 'apmes-logbook-device');
    assert.deepEqual(Object.keys(data.items).sort(), ['apmes-logbook-display', 'apmes-logbook-theme']);   // not the demo flag, not other apps
    await p.getByRole('button', { name: 'Go to the new address' }).click();
    await p.waitForURL('https://apmes.anawj.com/logbook/#log');
    // the next visit to the old address forwards at once
    await p.goto('https://anawj.com/logbook/').catch(() => {});
    await p.waitForURL(/apmes\.anawj\.com/);
    assert.deepEqual(errors, []);
    await ctx.close();

    // 4. at the new address, Settings -> Settings file loads it back
    const n = await mk();
    await n.p.goto('https://apmes.anawj.com/logbook/?demo#settings'); await n.p.waitForSelector('textarea.details, h2');
    await n.p.evaluate(() => { location.hash = '#data'; });
    const tmp = join(tmpdir(), 'logbook-device-test.json'); fs.writeFileSync(tmp, JSON.stringify(data));
    // the Settings file card lives on the Export / Import page's Advanced area or Settings; find its file input
    await n.p.evaluate(() => { location.hash = '#settings'; });
    const input = n.p.locator('input[type=file][accept*="json"]').first();
    await input.waitFor({ state: 'attached', timeout: 15000 });
    await input.setInputFiles(tmp);
    await n.p.locator('dialog[open]').getByRole('button', { name: 'Load', exact: true }).click();
    await n.p.waitForLoadState('load');
    await n.p.waitForFunction(() => localStorage.getItem('apmes-logbook-theme') === 'dark' && /"flat":true/.test(localStorage.getItem('apmes-logbook-display') || ''));
    await n.ctx.close();
  }
  console.log('PASS moved (old address forwards, device file, settings load)');
} finally { await b.close(); }
