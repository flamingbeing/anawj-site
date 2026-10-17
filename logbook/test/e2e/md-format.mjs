// Fake data only. Settings → Markdown (log2 15, first part): the day heading's styles (Plain by default, Heading,
// Link, Custom) and the date formats (presets and a custom pattern, file names of their own), with live previews;
// reflections and linked notes under their case (Link falls back to the full text in Copy); Save keeps them in the
// account.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const poll = async (fn, what, ms = 8000) => { const end = Date.now() + ms; for (;;) { if (await fn()) return; if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise(r => setTimeout(r, 100)); } };
try { for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const open = async () => {
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    await p.waitForFunction(() => Number(document.body.dataset.cases) > 200);
    await p.evaluate(() => { location.hash = '#sharefmt'; });
    await p.getByLabel('Day heading', { exact: true }).waitFor();
  };
  await open();
  const day = () => p.getByLabel('Preview of a day').innerText(), one = () => p.getByLabel('Preview of one case').innerText();
  // Plain by default: the date alone, no [[link]]
  assert.match(await day(), /^\d{4}-\d{2}-\d{2}\n1\. /, 'plain heading');
  assert.equal(await p.getByLabel('Your day heading').isVisible(), false, 'the heading box only for Custom');
  await p.getByLabel('Day heading', { exact: true }).selectOption('heading');
  await poll(async () => /^# \d{4}-/.test(await day()) && /^# \d{4}-/.test(await one()), 'Heading style, one case too');
  await p.getByLabel('Day heading', { exact: true }).selectOption('link');
  await poll(async () => /^\[\[\d{4}-\d{2}-\d{2}\]\]/.test(await day()), 'Link style');
  // dates: a custom pattern shows; file names their own (the link targets the file, shows the date)
  await p.getByLabel('Dates ({{date}})').selectOption('custom');
  await p.getByLabel('Date pattern', { exact: true }).fill('ddd D MMM');
  await p.getByLabel('File names and link targets').selectOption('compact');
  await poll(async () => /^\[\[\d{8}\|(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2} [A-Z][a-z]{2}\]\]/.test(await day()), 'custom date in the link');
  assert.match(await p.locator('p[aria-live]', { hasText: 'is written' }).innerText(), /10 Oct 2026 is written Sat 10 Oct; its day note is named 20261010\.md/);
  // Custom: the box shows, filled with the heading so far
  await p.getByLabel('Day heading', { exact: true }).selectOption('custom');
  assert.equal(await p.getByLabel('Your day heading').inputValue(), '{{dateLink}}');
  await p.getByLabel('Your day heading').fill('## {{date}}');
  await poll(async () => /^## (Sun|Mon|Tue|Wed|Thu|Fri|Sat) /.test(await day()), 'custom heading');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await poll(async () => /Saved/.test(await p.locator('#toast').innerText()), 'saved');
  const stored = await p.evaluate(async () => (await import('./js/ui-core.js')).settings().markdown);
  assert.deepEqual(stored, { dayHeadStyle: 'custom', dayHead: '## {{date}}', dateFormat: 'custom', datePattern: 'ddd D MMM', fileDate: 'compact', oneCase: '{{dateLink}}\n{{initials}}\n{{details}}' });
  await open();
  assert.equal(await p.getByLabel('Day heading', { exact: true }).inputValue(), 'custom', 'kept');
  assert.equal(await p.getByLabel('Your day heading').inputValue(), '## {{date}}');
  // a case's reflection under it (Full text; Link falls back to it where no reflection note exists, as in Copy)
  await p.getByLabel('Reflections under their case').selectOption('link');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await poll(async () => (await p.evaluate(async () => (await import('./js/ui-core.js')).settings().markdown?.reflInDay)) === 'link', 'saved: link');
  const under = await p.evaluate(async () => {
    const { S } = await import('./js/ui-core.js'), { dayText, caseText } = await import('./js/share.js');
    const r = (S.reflections || []).find(x => x.caseId && S.cases.some(c => c.id === x.caseId && c.date));
    const c = S.cases.find(x => x.id === r.caseId);
    return { day: dayText(c.date), one: caseText(c), title: r.title || r.diagnosis };
  });
  for (const t of [under.day, under.one]) assert.ok(t.includes(`### ${under.title}`) && !t.includes('Reflection: [['), 'the full text where no note exists: ' + t.slice(0, 200));
  await p.getByLabel('Reflections under their case').selectOption('none');
  // back to the default: nothing stored
  await p.getByLabel('Day heading', { exact: true }).selectOption('plain');
  await p.getByLabel('Dates ({{date}})').selectOption('iso');
  await p.getByLabel('File names and link targets').selectOption('same');
  await p.getByLabel('One case', { exact: true }).fill('{{date}}\n{{initials}}\n{{details}}');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await poll(async () => (await p.evaluate(async () => (await import('./js/ui-core.js')).settings().markdown ?? null)) === null, 'defaults not stored');
  assert.deepEqual(errors, []);
  await ctx.close();
  console.log('ok', width);
} } finally { await b.close(); }
console.log('PASS md-format');
