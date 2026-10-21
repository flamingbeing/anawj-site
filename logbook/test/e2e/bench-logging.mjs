// Fake data only. A small benchmark for the Add tab's hot paths (not part of the test loop): typing 200 characters
// into the case box, tapping 20 tags and saving 50 cases, with 2000 cases logged. It reports the main thread's busy
// time (script + style + layout, from Chrome's Performance metrics), so waiting for frames and timers doesn't count.
// Run with a server on PORT: PORT=8080 node logbook/test/e2e/bench-logging.mjs [runs]
// Prints the median of the runs for each measure (lower is better).
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const runs = Number(process.argv[2]) || 3;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const results = {};
const note = (k, v) => { (results[k] ||= []).push(v); };
const TEXT = 'AB 72M lap chole GA ETT difficult airway, videolaryngoscope, fake notes '.repeat(4).slice(0, 200);
try {
  for (let r = 0; r < runs; r++) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable');
    // busy time in ms while fn runs
    const busy = async fn => {
      const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      const a = await get();
      await fn();
      const z = await get();
      return ['ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration'].reduce((s, k) => s + (z[k] - a[k]) * 1000, 0);
    };
    await p.goto(base + '?demo=reset#log');
    await p.waitForSelector('textarea.details');
    // 2000 fake cases, so sorts and counts cost what they would for a busy resident
    await p.evaluate(async () => {
      const { saveMany } = await import('./js/ui-core.js');
      const codes = ['13', '16', '17', '21', '26', '01', '05'];
      const now = Date.now(), day = 864e5;
      await saveMany(Array.from({ length: 2000 }, (_, i) => ({ id: 'bench' + i, date: new Date(now - (i % 700) * day).toISOString().slice(0, 10), initials: 'ZZ', details: `${20 + (i % 60)}M fake case ${i} lap chole GA`, cats: [codes[i % codes.length]], createdAt: now - i * 60e3, updatedAt: now - i * 60e3, source: 'paste' })));
    });
    await p.evaluate(() => { location.hash = '#logbook'; });
    await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = '#log'; });
    await p.waitForSelector('textarea.details');
    await p.waitForTimeout(500);
    // typing at a quick human pace (30 ms a key), then the pause that lets the debounced work finish
    const ta = p.locator('textarea.details');
    await ta.focus();
    note('type 200 chars: busy ms', await busy(async () => { await p.keyboard.type(TEXT, { delay: 30 }); await p.waitForTimeout(600); }));
    await ta.fill('');
    await p.waitForTimeout(400);
    // tapping tags in the list: 20 taps (10 on, 10 off), a frame apart
    note('20 tag taps: busy ms', await busy(() => p.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        document.querySelectorAll('.log-card .picker li[data-code]')[i % 10].click();
        await new Promise(requestAnimationFrame);
      }
    })));
    await p.waitForTimeout(300);
    // saving: 50 cases, one after another, through the Save button (waits for the box to empty each time)
    note('save 50 cases: busy ms', await busy(() => p.evaluate(async () => {
      const { S } = await import('./js/ui-core.js');
      for (let i = 0; i < 50; i++) {
        const ta = document.querySelector('textarea.details');
        ta.value = `CD ${30 + i}F fake bench case ${i}`;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        if (!document.querySelector('.log-card .picker li[data-code="13"].on')) document.querySelector('.log-card .picker li[data-code="13"]').click();
        const n = S.cases.length;
        document.querySelector('.savebar button.primary').click();
        const t1 = performance.now();
        while (S.cases.length === n || document.querySelector('textarea.details').value) {
          await new Promise(r => setTimeout(r, 0));
          if (performance.now() - t1 > 5000) throw new Error('save ' + i + ' stuck: ' + (document.querySelector('#toast')?.innerText || ''));
        }
        await new Promise(requestAnimationFrame);
      }
    })));
    await ctx.close();
  }
} finally { await b.close(); }
for (const [k, xs] of Object.entries(results)) console.log(`${k.padEnd(26)} ${median(xs).toFixed(0).padStart(6)}   runs: ${xs.map(x => x.toFixed(0)).join(', ')}`);
