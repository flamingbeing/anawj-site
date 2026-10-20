// Scan pages screen in demo mode (fake image only): off by default, toggled on in Settings, a photo is tidied, labelled,
// kept after a reload, and deleted. Needs the site served on :8080 like e2e.mjs.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const fails = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const pg = await ctx.newPage();
pg.on('pageerror', e => fails.push('page error: ' + e.message));
pg.on('dialog', d => d.accept());
const ok = (c, m) => { if (!c) fails.push(m); };
try {
  await pg.goto('http://localhost:8080/prewarm/?demo#/settings'); await pg.waitForTimeout(800);
  ok(!(await pg.$('a[href="#/scan"]')), 'Scan pages link hidden until switched on');
  await pg.check('#scanon');
  await pg.click('a[href="#/scan"]');
  await pg.waitForSelector('#scsub');
  ok(await pg.$eval('#scact', e => e.hidden), 'no photo buttons before a Subject ID');
  await pg.fill('#scsub', 'DEMO-01');
  ok(!(await pg.$eval('#scact', e => e.hidden)), 'photo buttons after a Subject ID');
  // a fake grey page with a dark mark, as a JPEG file
  await pg.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 3200; c.height = 2400;
    const x = c.getContext('2d'); x.fillStyle = '#969696'; x.fillRect(0, 0, 3200, 2400); x.fillStyle = '#303030'; x.fillRect(200, 200, 600, 60);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'fake.jpg', { type: 'image/jpeg' }));
    const inp = document.querySelector('#scpick'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
  });
  await pg.waitForSelector('#sclist figure');
  const dims = await pg.$eval('#sclist img', i => new Promise(r => { const f = () => r([i.naturalWidth, i.naturalHeight]); i.complete ? f() : (i.onload = f); }));
  ok(dims[0] === 2400 && dims[1] === 1800, 'tidied copy scaled to 2400 long edge, got ' + dims);
  await pg.selectOption('[data-label]', '4');
  await pg.reload(); await pg.waitForTimeout(800);
  await pg.goto('http://localhost:8080/prewarm/?demo#/scan'); await pg.waitForSelector('#scsub');
  await pg.fill('#scsub', 'DEMO-01');
  await pg.waitForSelector('#sclist figure');
  ok(await pg.$eval('[data-label]', s => s.value) === '4', 'page label kept after reload');
  await pg.click('[data-open]'); await pg.waitForSelector('dialog[open]');
  await pg.click('#scorig'); ok((await pg.$eval('#scorig', e => e.textContent)) === 'Show tidied', 'original shown');
  await pg.click('#scclose');
  await pg.click('[data-del]'); await pg.waitForTimeout(300);
  ok(!(await pg.$('#sclist figure')), 'photo deleted');
} catch (e) { fails.push('error: ' + e.message.split('\n')[0]); }
await b.close();
console.log(fails.length ? 'FAIL scan e2e:\n' + fails.join('\n') : 'scan e2e passed');
process.exit(fails.length ? 1 : 0);
