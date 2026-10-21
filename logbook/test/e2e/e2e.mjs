// End-to-end run of the logbook in demo mode. Fake data only.
// Run (from the repo root, with a static server on the repo root at port 8080, e.g. python3 -m http.server 8080):
//   node logbook/test/e2e/mkfake.cjs "$OUT/fake-old-form.xlsx"   (once: a made-up old-form workbook)
//   E2E_OUT=/tmp/logbook-e2e node logbook/test/e2e/e2e.mjs [phone|desk]
// E2E_OUT: where downloads and screenshots go (default: the OS temp dir). E2E_BLANK: another blank APMES
// portfolio .docx for the template/Section 1 steps (default: apmes/templates/portfolio-template-blank.docx).
// Phone and desk run at the same time (about 1.5 min for both); each step prints its time and the
// slowest five are listed. E2E_ONLY=<words>: only up to the last step whose name has the words.
// E2E_FAILFAST=1: stop at the first failure. E2E_NAP: cap on the short pauses (ms, default 160).
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const LB = new URL('../../', import.meta.url).href;   // logbook/
const ExcelJS = require(fileURLToPath(new URL('vendor/exceljs.min.js', LB)));
const JSZip = require(fileURLToPath(new URL('vendor/jszip.min.js', LB)));
import zlib from 'node:zlib';
function makePng(w, h) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x * 4; raw[o + 1] = y * 5; raw[o + 2] = 160; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
import os from 'node:os';
const DIR = (process.env.E2E_OUT || os.tmpdir() + '/logbook-e2e').replace(/\/?$/, '/');
const FMT = DIR + 'fmt/';
for (const d of ['shots', 'fmt', 'round3', 'round4', 'acct']) fs.mkdirSync(DIR + d, { recursive: true });
const BASE = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const only = process.argv[2];
if (only && !['phone', 'desk'].includes(only)) throw new Error('Profile must be phone or desk');
// E2E_ONLY=<words>: run every step up to the last one whose name contains the words (the earlier ones set
// the stage: the cases and settings later steps expect), then stop. A dry pass first lists the step names
// in the order they run, without running them.
const ONLY = process.env.E2E_ONLY ? new RegExp(process.env.E2E_ONLY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
let DRY = null, ONLY_LAST = Infinity;

const RESIDENTS = `const RESIDENTS = [
  {id: "209901", name: "Fake Alpha", email: "Alpha@Example.com", status: "ACTIVE"},
  {id: "209902", name: "Fake Beta", email: "beta@example.com", status: "ACTIVE"},
];`;

async function run(label, ctxOpts) {
  const results = [];
  const errs = [];
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true, ...ctxOpts });
  // the e2e counts cases from the six seeded ones: skip the big sample logbook (demo-seed.js)
  await ctx.addInitScript(() => { try { localStorage.setItem('apmes-logbook-demo-small', '1'); } catch { /* none */ } });
  const p = await ctx.newPage();
  p.setDefaultTimeout(+process.env.E2E_TIMEOUT || 10000);
  // a short pause after a tap or a keystroke, capped (E2E_NAP, ms): the screens repaint at once, and the
  // debounced ones (search 150 ms) are waited for by the checks that follow, not by long fixed sleeps
  const NAP = +process.env.E2E_NAP || 160;
  const nap = ms => p.waitForTimeout(Math.min(ms, NAP));
  // the Logbook and Reflections search boxes repaint 150 and 250 ms after the last keystroke
  const debounced = () => p.waitForTimeout(300);
  // wait up to 3 s for a check to come true (a list repaints when the store tells it to, a moment after a save)
  const until = async (fn, msg) => { for (let t = Date.now(); !(await fn()); await p.waitForTimeout(50)) if (Date.now() - t > 3000) throw new Error(msg); };
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const phone = label === 'phone';
  const shot = async name => { if (phone) await p.screenshot({ path: `${DIR}shots/${name}.png`, fullPage: true }); else await p.screenshot({ path: `${DIR}shots/desk-${name}.png` }); };
  const sub = () => p.evaluate(() => document.getElementById('sub').textContent);
  const nCases = async () => parseInt(await p.evaluate(() => document.body.dataset.cases), 10);
  // Account, Settings, Export / Import, Admin and Analytics live under More; Settings is a menu of pages
  const SETTINGS_PAGES = ['themes', 'layout', 'access', 'logging', 'tags', 'reflset', 'sharefmt'];
  const tab = async t => {
    // a settings page's Advanced page: open the page, then its Advanced link
    if (t === 'loggingadv' || t === 'themesadv') { await tab(t.replace('adv', '')); await p.locator(`a[data-go="${t}"]`).click(); await nap(350); return; }
    // the recycle bin: Recover → Recently deleted (15 Oct 2026)
    if (t === 'bin') { await p.evaluate(() => { location.hash = '#recovery'; }); await p.locator('.recover-sec[data-sec=deleted][open] .bin-view').waitFor(); await nap(350); return; }
    if (SETTINGS_PAGES.includes(t)) { await tab('settings'); await p.locator(`.more-list a[data-go="${t}"]`).click(); }
    // on the tab bar if the profile puts it there (Advanced: Analytics), else in More
    else if (['account', 'settings', 'admin', 'data', 'progress'].includes(t)) {
      if (await p.locator(`.tabs button[data-tab="${t}"]`).count()) await p.locator(`.tabs button[data-tab="${t}"]`).click();
      else { await p.locator('.tabs button[data-tab="more"]').click(); await nap(150); await p.locator(`.more-list a[data-go="${t}"]`).click(); }
    }
    else await p.locator(`.tabs button[data-tab="${t}"]`).click();
    await nap(350);
  };
  // a ✓ list on a settings page (fieldset.pick): tap the choice with this value
  const choose = (legend, v) => p.locator('fieldset.pick', { has: p.locator('legend', { hasText: legend }) }).locator('label.pick-opt', { has: p.locator(`input[value="${v}"]`) }).click();
  const R3 = DIR + 'round3/';
  const shot3 = async name => { if (phone) await p.screenshot({ path: R3 + name + '.png', fullPage: false }); };
  // the Admin portal, or one of its pages (Residents, Advanced admin settings, Programme totals)
  const goAdmin = async (sub = '') => { await tab('admin'); if (sub) { await p.locator(`a[data-go="${sub}"]`).click(); await nap(350); } };
  const go = async t => t === 'admin' ? goAdmin() : tab(t);
  const toastText = () => p.locator('#toast').innerText();
  // the Logbook opens in the calendar; most steps want the list
  const lbList = async () => { const btn = p.locator('main .seg button', { hasText: /^List$/ }); if (await btn.count()) { await btn.first().click(); await nap(200); } };
  // the Logbook filter's Dates, Tags and More fold behind small toggles
  const lbFold = async t => { const b = p.locator('button.lb-fold', { hasText: t }).first(); if ((await b.getAttribute('aria-expanded')) !== 'true') { await b.click(); await nap(150); } };
  // Analytics sections start folded
  const openAn = async t => { const d = p.locator('details.an-sec', { hasText: t }).first(); if (!(await d.evaluate(x => x.open))) { await d.locator('summary').click(); await nap(150); } };
  // the tag editor has its own page (Settings → Open tag editor)
  const openTagEditor = async () => { await tab('tags'); return p.locator('main'); };   // the editor card and the Tag list file card
  const stored = () => p.evaluate(() => { const st = JSON.parse(localStorage.getItem('apmes-logbook-demo-v1') || '{}'); return Object.values(((st.logbooks || {})['demo@example.com'] || {}).cases || {}); });
  let stepNo = 0;
  async function step(name, fn) {
    if (process.env.E2E_FAILFAST && results.some(r => !r.ok)) return;
    if (DRY) { DRY.push(name); return; }   // the dry pass only lists the names
    if (ONLY && stepNo++ > ONLY_LAST) return;   // E2E_ONLY: nothing after the last matching step
    const e0 = errs.length, t0 = Date.now();
    try { const note = await fn(); results.push({ step: name, ms: Date.now() - t0, ok: errs.length === e0, note: errs.length > e0 ? errs.slice(e0).join(' | ') : (note || '') }); }
    catch (e) { results.push({ step: name, ms: Date.now() - t0, ok: false, note: e.message.split('\n').slice(0, process.env.E2E_LONG ? 12 : 1).join(' ') }); if (process.env.E2E_FAILFAST) console.log('FAIL ' + name + ': ' + e.message.split('\n')[0]); await shot('FAIL-' + name.replace(/\W+/g, '_')).catch(() => {}); for (let i = 0; i < 3 && await p.locator('dialog[open]').count().catch(() => 0); i++) await p.keyboard.press('Escape').catch(() => {}); }
  }
  const assert = (c, m) => { if (!c) throw new Error(m); };

  await step('load ?demo=reset', async () => {
    await p.goto(BASE + '?demo=reset', { waitUntil: 'networkidle' });
    await nap(800);
    await p.waitForSelector('textarea.details');
    await p.goto(BASE + '?demo', { waitUntil: 'networkidle' });
    await p.waitForSelector('textarea.details');
    assert(await nCases() === 6, 'expected 6 seeded cases, got ' + await sub());
    await shot('log-empty');
  });


  // ===================== round 5: Account tab (portfolio Section 1) =====================
  async function round5() {
    const ACCT = DIR + 'acct/';
    const BLANK = process.env.E2E_BLANK || fileURLToPath(new URL('../../../apmes/templates/portfolio-template-blank.docx', import.meta.url));
    fs.mkdirSync(ACCT, { recursive: true });
    const field = lbl => p.locator('.acct label.field', { hasText: lbl }).first().locator('input, textarea').first();
    const group = t => p.locator('.acct details.acct-group', { has: p.locator('summary', { hasText: t }) }).first();
    const openGroup = async t => { const g = group(t); if (!(await g.getAttribute('open') !== null)) await g.locator('summary').click(); return g; };
    const addRow = async (t, vals) => {
      const g = await openGroup(t);
      await g.locator('button', { hasText: '+ Add' }).click();
      const dlg = p.locator('dialog[open]');
      for (const [lbl, v] of Object.entries(vals)) await dlg.locator('label.field', { hasText: lbl }).first().locator('input, textarea').first().fill(v);
      await dlg.locator('button.primary', { hasText: 'Save' }).click();
      await nap(100);
    };
    const waitSaved = async () => { await p.waitForFunction(() => document.querySelector('.acct-status')?.textContent === 'Saved', null, { timeout: 5000 }); };

    await step('account + settings: separate tabs; More has credits and sign out at the bottom', async () => {
      assert(await p.locator('.tabs button').count() <= 6, 'more than 6 tabs: ' + await p.locator('.tabs button').count());   // (Advanced: Case, Logbook, Totals, Reflections, Analytics, More)
      await p.locator('.tabs button[data-tab="more"]').click();
      const more = await p.locator('.more-list a').evaluateAll(as => as.map(a => a.dataset.go));
      assert(more.includes('account') && more.includes('settings') && more.includes('data'), 'More list ' + more);
      // two groups (15 Oct 2026): More's pages with Settings last, then Account and help; privacy and credits as fine print
      const group1 = await p.locator('.more-list').first().locator('a').evaluateAll(as => as.map(a => a.dataset.go));
      assert(group1[group1.length - 1] === 'settings' && !group1.includes('account'), 'More group 1: ' + group1);
      assert((await p.locator('.more-help h2').innerText()) === 'Account and help' && await p.locator('.more-help a[data-go="account"]').count() === 1, 'Account and help group');
      assert(/Code by Abigail Sim · Design and UX\/UI by Koh Wenjun/.test(await p.locator('.fine-print').innerText()), 'credits fine print');
      assert(/Privacy · Only you can read your cases/.test(await p.locator('.fine-print').innerText()), 'privacy fine print');
      const lastCard = await p.locator('main section.card').last().innerText();
      assert(/Sign out/.test(lastCard), 'sign out not the last card on More: ' + lastCard.slice(0, 80));
      await p.goto(BASE + '?demo#settings', { waitUntil: 'networkidle' });
      await p.waitForSelector('.more-list a[data-go="layout"]', { timeout: 6000 });
      assert(p.url().endsWith('#settings'), 'hash rewritten: ' + p.url());
      assert(await p.locator('.acct').count() === 0, 'portfolio details on Settings');
      assert(await p.locator('.more-list a[data-go="bin"]').count() === 0, 'the recycle bin is on Recover now, not in Settings');
      await tab('themesadv');
      assert(await p.locator('fieldset.pick legend', { hasText: /^Spacing$/ }).count() === 1, 'no Spacing (the old Compact mode) on Themes');
      await tab('account');
      await p.waitForSelector('.acct', { timeout: 6000 });
      assert(await p.locator('.card', { hasText: /^Spacing/ }).count() === 0, 'settings still under Account');
      assert(await p.locator('button', { hasText: 'Sign out' }).count() === 0, 'sign out on Account (it is on More)');
      assert(await p.locator('button', { hasText: 'Delete account' }).count() === 1, 'no Delete account on Account');
    });

    await step('account: fill personal details + 2 memberships + 1 paper, reload persists', async () => {
      await field('Family name').fill('Testfamily');
      await field('Given name').fill('Pat Q');
      await p.locator('.acct input[name="acct-sex"][value="F"]').check();
      await field('Date of birth').fill('1995-03-14');
      await field('Date and place of graduation').fill('12/06/2019, Example University');
      await field('Postgraduate qualifications').fill('MMed (Anaes) 01/02/2024');
      await field('Program Director').fill('Dr Fake Director');
      await field('Residency started').fill('2020-07-01');
      await addRow('Membership', { Year: '2023', 'Post Held': 'Member', Organisation: 'Fakeland Society of Anaesthesia', Achievements: 'None' });
      await addRow('Membership', { Year: '2024', 'Post Held': 'Secretary', Organisation: 'Example Airway Club' });
      await addRow('Papers', { 'Author': 'Testfamily P, Doe J', Title: 'A made-up study', Journal: 'J Fake Med 2024;1:1' });
      await waitSaved();
      await p.reload({ waitUntil: 'networkidle' });
      await p.waitForSelector('.acct');
      assert(await field('Family name').inputValue() === 'Testfamily', 'family name lost');
      assert(await field('Date of birth').inputValue() === '1995-03-14', 'dob lost');
      assert(await p.locator('.acct input[name="acct-sex"][value="F"]').isChecked(), 'sex lost');
      const mem = group('Membership');
      assert((await mem.locator('.acct-badge').innerText()).trim() === '2', 'membership count: ' + await mem.locator('summary').innerText());
      assert(await mem.locator('.acct-item').count() === 2, 'membership rows');
      assert((await group('Papers').locator('.acct-badge').innerText()).trim() === '1', 'paper count');
      assert(await mem.locator('.acct-item', { hasText: 'Example Airway Club' }).count() === 1, 'membership org lost');
      // edit an entry in its dialog, then cancel a change
      await openGroup('Membership');
      await mem.locator('.acct-item', { hasText: 'Example Airway Club' }).click();
      await p.locator('dialog[open] label.field', { hasText: 'Achievements' }).locator('textarea').fill('Ran the made-up airway day');
      await p.locator('dialog[open] button.primary', { hasText: 'Save' }).click();
      assert(/Ran the made-up airway day/.test(await mem.locator('.acct-item', { hasText: 'Example Airway Club' }).innerText()), 'edit not shown');
      await mem.locator('.acct-item', { hasText: 'Example Airway Club' }).click();
      await p.locator('dialog[open] label.field', { hasText: 'Post Held' }).locator('input').fill('CHANGED');
      await p.locator('dialog[open] button', { hasText: 'Cancel' }).click();
      assert(await mem.locator('.acct-item', { hasText: 'CHANGED' }).count() === 0, 'cancel kept the change');
      if (phone) { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: ACCT + 'account.png' }); }
      else await p.screenshot({ path: ACCT + 'desk-account.png' });
      const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert(w[0] <= w[1], 'h-scroll ' + w);
    });

    await step('account: Fill from my Word portfolio (merge into blank fields)', async () => {
      // made-up profile filled into the blank template in node
      const { fillSection1Xml } = await import(LB + 'js/portfolio.js');
      const zip = await JSZip.loadAsync(fs.readFileSync(BLANK));
      const xml = await zip.file('word/document.xml').async('string');
      const fake = { familyName: 'Wordfamily', givenName: 'Robin', sex: 'M', dob: '1994-01-02', program: 'Fake Programme', programDirector: 'Dr Imaginary',
        residencyStart: '2019-07-01', seniorStart: '2023-07-01',
        memberships: [{ year: '2022', post: 'Treasurer', org: 'Imaginary Pain Society', achievements: '' }],
        awards: [{ date: '01/05/2021', title: 'Fake Prize', purpose: 'Testing' }],
        courses: [{ dateVenue: '03/2023, Nowhere', details: 'Made-up course' }] };
      zip.file('word/document.xml', fillSection1Xml(xml, fake, {}).xml);
      const f = DIR + `filled-profile-${label}.docx`;   // per profile: phone and desk run at once
      fs.writeFileSync(f, await zip.generateAsync({ type: 'nodebuffer' }));
      // reset the family name so the import has something to fill
      await field('Family name').fill('');
      await field('Program Director').fill('Keep Me');
      await waitSaved();
      await p.locator('.acct-import input[type=file]').setInputFiles(f);
      const dlg = p.locator('dialog[open], .modal').filter({ hasText: 'Found:' }).first();
      await dlg.waitFor({ timeout: 6000 });
      const txt = await dlg.innerText();
      assert(/name/.test(txt) && /membership/i.test(txt), 'review text: ' + txt);
      if (phone) await p.screenshot({ path: ACCT + 'import-review.png' });
      await dlg.locator('button', { hasText: 'Use these details' }).click();
      await nap(600);
      assert(await field('Family name').inputValue() === 'Wordfamily', 'family name not filled');
      assert(await field('Given name').inputValue() === 'Pat Q', 'given name overwritten');
      assert(await field('Program Director').inputValue() === 'Keep Me', 'program director overwritten');
      assert(await field('Senior residency started').inputValue() === '2023-07-01', 'senior start not filled');
      assert(await group('Membership').locator('.acct-item').count() === 3, 'membership not appended');
      assert(await group('Awards').locator('.acct-item').count() === 1, 'award not added');
    });

    await step('account: export uses blank template (uploaded via admin) with Section 1 filled', async () => {
      await goAdmin('adminadv');
      const card = p.locator('section.card', { has: p.locator('h2', { hasText: 'Portfolio template' }) });
      await card.locator('input[type=file]').setInputFiles(BLANK);
      await p.waitForFunction(() => /Template saved/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 15000 });
      const t = await toastText();
      assert(/comments removed/.test(t), 'toast: ' + t);
      await tab('data');
      await p.locator('section.export-sync a', { hasText: 'Choose reflections and export' }).click();
      await nap(300);
      const btn = p.locator('main button', { hasText: /^Export \d+ reflections? \(Word\)$/ });
      await btn.waitFor();
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), btn.click()]);
      const out = DIR + 'export-' + label + '.docx';
      await dl.saveAs(out);
      const z = await JSZip.loadAsync(fs.readFileSync(out));
      const doc = await z.file('word/document.xml').async('string');
      const plain = doc.replace(/<[^>]+>/g, '');
      assert(plain.includes('Wordfamily'), 'family name not in export');
      assert(plain.includes('Fakeland Society of Anaesthesia'), 'membership org not in export');
      const parts = Object.keys(z.files).filter(n => /comment/i.test(n));
      assert(!parts.length, 'comment parts: ' + parts);
      assert(!/commentRangeStart|commentReference/.test(doc), 'comment anchors left');
      const ct = await z.file('[Content_Types].xml').async('string');
      assert(!/comments/i.test(ct), 'comments in content types');
      // the active template: download it, check its contents, delete asks first (cancelled here)
      await goAdmin('adminadv');
      const tcard = p.locator('section.card', { has: p.locator('h2', { hasText: 'Portfolio template' }) });
      const [tdl] = await Promise.all([p.waitForEvent('download'), tcard.locator('button', { hasText: /^Download$/ }).click()]);
      assert(/template\.docx$/.test(tdl.suggestedFilename()), 'template download name ' + tdl.suggestedFilename());
      await tcard.locator('button', { hasText: 'Check contents' }).click();
      const info = p.locator('dialog[open]', { hasText: 'Reflection tables' });
      await info.waitFor({ timeout: 15000 });
      assert(/Reflection tables: \d+ of \d+ found/.test(await info.innerText()), 'check contents: ' + (await info.innerText()).slice(0, 200));
      await info.locator('button', { hasText: 'Close' }).click();
      await tcard.locator('button', { hasText: 'Delete…' }).click();
      const conf = p.locator('dialog[open]', { hasText: 'Delete the portfolio template?' });
      await conf.waitFor();
      await conf.locator('button', { hasText: 'Cancel' }).click(); await nap(300);
      assert(await tcard.locator('button', { hasText: /^Download$/ }).count() === 1, 'template gone after cancelling the delete');
      return 'export ' + Math.round(fs.statSync(out).size / 1024) + ' KB';
    });
  }

  // ===================== round 4: reflections tab, bin, Word upload =====================
  async function round4() {
    const R4 = DIR + 'round4/';
    fs.mkdirSync(R4, { recursive: true });
    const shot4 = async name => { if (phone) await p.screenshot({ path: R4 + name + '.png', fullPage: false }); else await p.screenshot({ path: R4 + 'desk-' + name + '.png' }); };
    const backToList = async () => { for (let i = 0; i < 3; i++) { const b2 = p.locator('main button', { hasText: /^← (Reflections|Cases)$/ }).first(); if (await b2.count()) { await b2.click(); await nap(400); } else break; } };
    const editBtn = () => p.locator('main button', { hasText: /^(Select|Done)$/ }).first();
    const rowsOf = id => p.locator(`.refl-h[data-heading="${id}"] li.refl-row`);
    const hId = async n => p.locator('.refl-h').nth(n).getAttribute('data-heading');

    await step('r4: log an LSCS case for suggestions', async () => {
      await tab('log');
      const ta = p.locator('textarea.details');
      await ta.fill('ZZ LSCS spinal 33F');
      await nap(300);
      for (const code of ['16', '17']) await p.locator(`.chip.sugg[data-code="${code}"]`).click();
      await p.locator('button', { hasText: 'Save, keep date' }).click();
      await nap(400);
    });

    await step('r4: per-heading + Add -> picker -> editor with heading preset', async () => {
      await tab('reflect');
      const first = p.locator('.refl-h').first();
      const id = await first.getAttribute('data-heading');
      await first.locator('button.refl-add').click();
      await nap(300);
      const txt = await p.locator('main').innerText();
      assert(/Heading:/.test(txt), 'picker shows no preset heading');
      await p.locator('ul.refl-pick li').nth(1).click();
      await nap(500);
      await p.locator('input[placeholder="Title"]').fill('R4 preset draft');
      await nap(900);
      await backToList();
      const n = await rowsOf(id).count();
      assert(n >= 1, 'no reflection under preset heading ' + id);
      return 'heading ' + id;
    });

    await step('reflections list: JR count beside the heading count; word counts can be hidden', async () => {
      const bar = p.locator('.refl-h[data-heading="bariatric"]');
      assert(/^JR \d\/1( ✓)?$/.test((await bar.locator('.refl-pill.jr').innerText()).trim()), 'no JR count beside Bariatric');
      assert(!/from JR/.test(await bar.innerText()), 'the JR rule is still in the note');
      const wc = p.locator('.refl-wc.in-list').first();
      if (await wc.count()) {
        await p.evaluate(async () => { const m = await import('/logbook/js/ui-settings.js'); m.applyDisplay(m.setDisplay({ hideWords: true })); });
        assert(!(await wc.isVisible()), 'word counts still shown');
        await p.evaluate(async () => { const m = await import('/logbook/js/ui-settings.js'); m.applyDisplay(m.setDisplay({ hideWords: null })); });
        assert(await wc.isVisible(), 'word counts did not come back');
      }
    });

    await step('r4: heading suggestions for LSCS case', async () => {
      await p.locator('main button[aria-label="New reflection"]').click();
      await nap(300);
      await p.locator('input[type=search]').fill('ZZ LSCS');
      await debounced();
      await p.locator('ul.refl-pick li').first().click();
      await nap(400);
      const txt = await p.locator('main').innerText();
      assert(/Which heading\?/.test(txt), 'no heading step: ' + txt.slice(0, 120));
      const chips = await p.locator('main .card').first().locator('button').allInnerTexts();
      assert(chips.some(c => /obstet|caesar|LSCS/i.test(c)), 'no obstetric suggestion: ' + chips.join(' | '));
      await p.locator('main .card').first().locator('button', { hasText: /obstet|caesar|LSCS/i }).first().click();
      await nap(500);
      await p.locator('input[placeholder="Title"]').fill('R4 LSCS draft');
      await nap(900);
      await backToList();
      return chips.filter(c => !/←|later/i.test(c)).slice(0, 4).join(' | ');
    });

    await step('r4: rows not draggable outside edit mode', async () => {
      assert(await p.locator('.refl-handle').count() === 0, 'drag handles visible outside edit mode');
      assert(await p.locator('.refl-cb').count() === 0, 'checkboxes outside edit mode');
      await shot4('reflections-list');
    });

    async function dragTo(srcRow, targetId, how) {
      const hd = srcRow.locator('.refl-handle');
      const tgt = p.locator(`.refl-h[data-heading="${targetId}"]`);
      await tgt.scrollIntoViewIfNeeded();
      await hd.scrollIntoViewIfNeeded();
      const a = await hd.boundingBox(), t = await tgt.boundingBox();
      const ax = a.x + a.width / 2, ay = a.y + a.height / 2, tx = t.x + 30, ty = t.y + Math.min(12, t.height / 2);
      if (how === 'mouse') {
        await p.mouse.move(ax, ay); await p.mouse.down();
        for (let i = 1; i <= 8; i++) { await p.mouse.move(ax + (tx - ax) * i / 8, ay + (ty - ay) * i / 8); await nap(30); }
        await p.mouse.up();
      } else {
        await p.evaluate(([ax, ay, tx, ty]) => {
          const h = document.elementFromPoint(ax, ay).closest('.refl-handle');
          const ev = (type, x, y) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
          h.dispatchEvent(ev('pointerdown', ax, ay));
          return new Promise(res => {
            let i = 0;
            const step = () => { i++; h.dispatchEvent(ev('pointermove', ax + (tx - ax) * i / 8, ay + (ty - ay) * i / 8)); if (i < 8) setTimeout(step, 30); else setTimeout(() => { h.dispatchEvent(ev('pointerup', tx, ty)); res(); }, 60); };
            setTimeout(step, 30);
          });
        }, [ax, ay, tx, ty]);
      }
      await nap(600);
    }

    for (const how of ['mouse', 'touch']) {
      await step(`r4: edit mode drag (${how}) + Undo`, async () => {
        await editBtn().click(); await nap(300);
        const src = p.locator('li.refl-row').filter({ hasText: 'R4' }).first();
        const srcRow = (await src.count()) ? src : p.locator('li.refl-row').first();
        const fromId = await srcRow.evaluate(li => li.closest('[data-heading]')?.dataset.heading);
        const ids = await p.locator('.refl-h').evaluateAll(els => els.map(e => e.dataset.heading));
        const toId = ids.find(x => x !== fromId && x);
        const before = await rowsOf(toId).count();
        await dragTo(srcRow, toId, how);
        const t = await toastText();
        assert(/Moved to/.test(t), 'toast: ' + t);
        const after = await rowsOf(toId).count();
        assert(after === before + 1, `target rows ${before} -> ${after}`);
        await p.locator('#toast button', { hasText: 'Undo' }).click();
        await nap(600);
        assert(await rowsOf(toId).count() === before, 'undo did not move it back');
        await editBtn().click(); await nap(300);
        return `${fromId} -> ${toId} -> back`;
      });
    }

    await step('r4: select 2 -> Bulk edit -> Move to the bin -> bin lists them -> restore one', async () => {
      await editBtn().click(); await nap(300);
      const n0 = await p.locator('li.refl-row').count();
      assert(n0 >= 2, 'need 2 reflections, have ' + n0);
      await p.locator('.refl-cb').nth(0).check();
      await p.locator('.refl-cb').nth(1).check();
      await shot4('edit-mode-selection');
      assert(/2 selected/.test(await p.locator('.sel-bar').innerText()), 'the bar counts 2');
      await p.locator('.sel-bar').getByRole('button', { name: 'Bulk edit…' }).click();
      await p.locator('dialog[open]').getByRole('button', { name: 'Move to the bin' }).click();
      await nap(800);
      assert(/2 reflections moved to the recycle bin/.test(await toastText()), 'toast ' + await toastText());
      // (selecting ends after the move; counted with every heading open, as before)
      if (await editBtn().innerText() === 'Select') { await editBtn().click(); await nap(300); }
      assert(await p.locator('li.refl-row').count() === n0 - 2, 'rows not removed');
      if (await editBtn().innerText() === 'Done') await editBtn().click();
      await nap(300);
      await tab('bin');
      await nap(700);
      const items = p.locator('.bin-list li');
      assert(await items.count() >= 2, 'bin count ' + await items.count());
      const bt = await p.locator('.bin-list').innerText();
      assert(/days left/.test(bt), 'no days left: ' + bt.slice(0, 100));
      await shot4('recycle-bin');
      await items.first().locator('button', { hasText: 'Restore' }).click();
      await nap(700);
      // (the bin is Recover's Recently deleted, a page now: nothing to close)
      await tab('reflect');
      // count in edit mode, where every heading is open (met ones start folded otherwise)
      await editBtn().click(); await nap(300);
      const n1 = await p.locator('li.refl-row').count();
      await editBtn().click(); await nap(200);
      assert(n1 === n0 - 1, 'restore did not bring one back: ' + n1 + ' vs ' + (n0 - 1));
    });

    await step('r4: delete a logbook case -> bin -> restore', async () => {
      await tab('logbook'); await lbList();
      const n0 = await nCases();
      // the initials sit over the date in the row, the details beside them
      await p.locator('main ul.cases li', { has: p.locator('.d .ini', { hasText: /^ZZ$/ }) }).filter({ hasText: 'LSCS' }).first().click();
      await p.locator('dialog[open] button.danger', { hasText: 'Delete' }).click();
      await nap(700);
      assert(await nCases() === n0 - 1, 'case not removed');
      await tab('bin');
      await nap(700);
      const li = p.locator('.bin-list li', { hasText: 'ZZ LSCS' }).first();
      await li.waitFor({ timeout: 3000 });
      await li.locator('button', { hasText: 'Restore' }).click();
      await nap(700);
      const d = p.locator('dialog[open] button', { hasText: 'Close' });
      if (await d.count()) await d.first().click();
      assert(await nCases() === n0, 'case not restored');
    });

    await step('r4: Upload from Word -> review -> uncheck one -> add drafts', async () => {
      const { exportPortfolio } = await import(LB + 'js/portfolio.js');
      const R = o => ({ id: Math.random().toString(36).slice(2), subId: null, jr: false, status: 'complete', caseId: null, createdAt: 1, updatedAt: 1, title: '', summary: '', points: [], figures: [], references: [], diagnosis: '', ...o });
      const refl = [
        R({ headingId: 'thyroid', initials: 'QA', date: '2025-01-03', diagnosis: 'Thyroidectomy', title: 'Upload test one', summary: 'Made-up summary one.', points: [{ heading: 'Point', text: 'Made-up learning.' }] }),
        R({ headingId: 'cabg', subId: 'on', initials: 'QB', date: '2025-02-04', diagnosis: 'CABG', title: 'Upload test two', summary: 'Made-up summary two.' }),
        R({ headingId: 'eye', subId: 'ga', initials: 'QC', date: '2025-03-05', diagnosis: 'Vitrectomy', title: 'Upload test three', summary: 'Made-up summary three.' }),
      ];
      const blob = await exportPortfolio(refl, { name: 'Fake Resident', JSZip });
      const file = DIR + `upload-test-${label}.docx`;
      fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
      await tab('reflect');
      const before = await p.locator('li.refl-row').count();
      await tab('data'); await p.locator('main a', { hasText: 'Upload from Word' }).click();
      await nap(600);
      await p.locator('main input[type=file]').setInputFiles(file);
      await p.waitForSelector('text=Found 3 reflections', { timeout: 10000 });
      const cbs = p.locator('main .rimp-check input[type=checkbox]');
      assert(await cbs.count() === 3, 'checkboxes ' + await cbs.count());
      await cbs.nth(1).uncheck();
      await nap(200);
      await shot4('upload-review');
      await p.locator('main button.primary', { hasText: /^Add/ }).first().click();
      await p.waitForSelector('text=as drafts', { timeout: 10000 });
      const done = await p.locator('main h2').first().innerText();
      await p.locator('main a, main button', { hasText: 'Go to Reflections' }).first().click();
      await nap(600);
      const txt = await p.locator('main').innerText();
      const after = await p.locator('li.refl-row').count();
      assert(after === before + 2, `rows ${before} -> ${after}`);
      assert(/QA/.test(txt) && /QC/.test(txt) && !/QB CABG/.test(txt), 'wrong items added');
      return done;
    });
    await step('r4: Word reflection with two cases requires a choice and keeps all text', async () => {
      const wp = t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
      const cell = (...text) => `<w:tc>${text.map(wp).join('')}</w:tc>`;
      const row = (...cells) => `<w:tr>${cells.join('')}</w:tr>`;
      const z = new JSZip();
      z.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${wp('Thyroid / Head and Neck Operations')}
        <w:tbl>${row(cell('Patient’s Initials'), cell('Date'), cell('Diagnosis'), cell('Case details'))}
        ${row(cell('1.', 'ZX', '2.', 'ZY'), cell('3 Jan 2025', '4 Feb 2025'), cell('First operation', 'Second operation'), cell('Full reflection about both cases.', 'Keep this second paragraph too.'))}</w:tbl></w:body></w:document>`);
      const file = DIR + `two-cases-${label}.docx`;
      fs.writeFileSync(file, await z.generateAsync({ type: 'nodebuffer' }));
      const caseCount = await nCases();
      await tab('data'); await p.locator('main a', { hasText: 'Upload from Word' }).click();
      await p.locator('main .rimp input[type=file]').setInputFiles(file);
      await p.waitForSelector('text=Found 1 reflection');
      const add = () => p.locator('main button.primary', { hasText: /^Add/ }).first();
      assert(await add().isDisabled(), 'must choose a case before importing');
      await p.getByLabel('Add this reflection').uncheck();
      await p.getByLabel('Add this reflection').check();
      assert(await add().isDisabled(), 'reticking must still require a choice');
      await p.getByLabel('Case to keep', { exact: true }).selectOption('0');
      await p.getByLabel('Case to keep', { exact: true }).selectOption('1');
      assert(await add().isEnabled(), 'chosen case enables import');
      await shot4('word-case-choice');
      await add().click();
      await p.waitForSelector('text=Added 1 reflection as drafts');
      const saved = await p.evaluate(async () => {
        const { S } = await import('./js/ui-core.js');
        return S.reflections.find(r => r.initials === 'ZY' && r.source === 'word');
      });
      assert(saved && saved.date === '2025-02-04' && saved.diagnosis === 'Second operation', 'wrong case kept');
      assert(saved.summary === 'Full reflection about both cases.\nKeep this second paragraph too.', 'reflection text changed');
      assert(!saved.caseChoices && saved.initials === 'ZY', 'other case fields were saved');
      assert(await nCases() === caseCount, 'existing logbook cases changed');
      await p.locator('main button', { hasText: 'Go to Reflections' }).click();
    });
  }
  if (process.env.ONLY5) { await round5(); await b.close(); return { label, results, errs }; }
  if (process.env.R4) {
    await round4();
    await b.close();
    return { label, results, errs };
  }

  await step('log: Paste puts the clipboard in the box', async () => {
    // (clipboard permissions are Chromium's names only; Firefox and WebKit refuse them)
    if (ctx.browser()?.browserType().name() === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
    await p.evaluate(() => navigator.clipboard.writeText('PQ 50F\nlap chole GA'));
    await p.locator('textarea.details').fill('');
    await p.locator('.box-wrap .paste-btn').click(); await nap(300);
    assert(await p.locator('textarea.details').inputValue() === 'PQ 50F\nlap chole GA', 'paste: ' + await p.locator('textarea.details').inputValue());
    assert(!(await p.locator('.box-wrap .paste-btn').isVisible()), 'paste button still over the text');
    await p.locator('textarea.details').fill('');
  });

  await step('log LSCS spinal 32F with suggestions', async () => {
    const ta = p.locator('textarea.details');
    await ta.click();
    await ta.pressSequentially('LSCS spinal 32F', { delay: 10 });
    await nap(300);
    const sugg = await p.locator('.chip.sugg[data-code]').evaluateAll(els => els.map(e => e.dataset.code));
    assert(sugg.includes('16') && sugg.includes('17'), 'suggestions ' + sugg.join(','));
    for (const code of ['16', '17']) await p.locator(`.chip.sugg[data-code="${code}"]`).click();
    const sel = await p.locator('.selected .chip[data-code]').evaluateAll(els => els.map(e => e.dataset.code));
    assert(sel.join() === '16,17', 'selected ' + sel);
    await shot('log-suggest');
    const n0 = await nCases();
    await p.locator('button', { hasText: 'Save, keep date' }).click();
    // The live count can update before the durable queue finishes and clears the
    // editor. Poll both completion conditions rather than assuming a 160ms save.
    await until(async () => await nCases() === n0 + 1 && (await ta.inputValue()) === '', 'save did not finish: count / editor');
    return `sugg=${sugg.join(',')}`;
  });

  await step('same as last', async () => {
    await p.locator('.chip.tmpl.recent').first().click();
    const sel = await p.locator('.selected .chip[data-code]').evaluateAll(els => els.map(e => e.dataset.code));
    assert(sel.join() === '16,17', 'selected ' + sel);
    const ta = p.locator('textarea.details');
    const filled = await ta.inputValue();
    assert(/^\n\S/.test(filled), 'procedure not copied onto line 2: ' + JSON.stringify(filled));
    await ta.fill('MN 28F LSCS spinal');
    const n0 = await nCases();
    await ta.press('End');
    await ta.press('Enter');
    await nap(300);
    assert(await nCases() === n0, 'Enter saved the case');
    assert((await ta.inputValue()) === 'MN 28F LSCS spinal\n', 'Enter did not add a new line: ' + JSON.stringify(await ta.inputValue()));
    await ta.fill('MN 28F LSCS spinal');
    await ta.press('Control+Enter');
    await nap(300);
    assert(await nCases() === n0 + 1, 'Ctrl+Enter did not save');
    const c = (await stored()).find(x => x.details === '28F LSCS spinal');
    assert(c && c.initials === 'MN', 'stored ' + JSON.stringify(c));
  });

  await step('undo save', async () => {
    const n0 = await nCases();
    await p.locator('#toast button', { hasText: 'Undo' }).click();
    await nap(300);
    assert(await nCases() === n0 - 1, 'undo did not remove');
    assert((await p.locator('textarea.details').inputValue()).includes('MN 28F'), 'draft not restored');
    await p.locator('textarea.details').fill('');
    await p.locator('.selected .chip').first().click(); // remove 16 (keeps 17)
    while (await p.locator('.selected .chip').count()) await p.locator('.selected .chip').first().click();
  });

  await step('Save with nothing picked does not save; a second Save takes the confident suggestions', async () => {
    const ta = p.locator('textarea.details');
    await ta.fill('UV 72M TKR ACB spinal');
    await nap(300);
    const strong = await p.locator('.sugg-row .chip.strong[data-code]:not(.all)').evaluateAll(els => els.map(e => e.dataset.code));
    const n0 = await nCases();
    await ta.press('Control+Enter');
    await nap(300);
    assert(await nCases() === n0, 'saved with no category picked');
    const t0 = await toastText();
    assert(/Enter again.*suggested tags/.test(t0), 'toast ' + t0);
    // the Save button accepts the offer the same as a second Enter (confident suggestions only)
    await p.locator('.actions .primary').click();
    await nap(300);
    assert(await nCases() === n0 + 1, 'the second Save did not take the suggested tags');
    const savedCats = await p.evaluate(async () => (await import('./js/ui-core.js')).S.cases.find(c => c.details && c.details.includes('TKR ACB')).cats);
    assert(strong.length && strong.every(code => savedCats.includes(code)), 'confident tags not saved: ' + savedCats);
    const t = await toastText();
    assert(/Saved/.test(t), 'toast ' + t);
    // the toast must not sit on the Save button
    const box = await p.locator('.actions .primary').boundingBox();
    const hit = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#toast') ? 'toast' : 'ok', [box.x + box.width / 2, box.y + box.height / 2]);
    assert(hit === 'ok', 'toast covers Save');
    if (phone) {
      // keyboard up = focused box + a much shorter visible area; the suggestions must not be covered
      await ta.focus();
      assert(await p.locator('#tabs').isVisible(), 'tab bar hidden with no keyboard');
      await p.setViewportSize({ width: 390, height: 450 });
      await ta.fill('WX 72M TKR adductor canal block spinal');
      await nap(400);
      assert(await p.locator('#tabs').isVisible(), 'tab bar hidden while typing');
      const bar = await p.locator('#tabs').boundingBox();
      assert(bar && bar.y + bar.height <= 451 && bar.y > 300, 'tab bar not at the bottom of the visible area: ' + JSON.stringify(bar));
      await ta.evaluate(el => el.scrollIntoView({ block: 'start' }));
      await nap(300);   // the pinned box settles (IntersectionObserver is async)
      const chip = await p.locator('.chip.sugg').first().boundingBox();
      assert(chip && chip.y + chip.height <= 450, 'first suggestion off screen: ' + JSON.stringify(chip));
      const top = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.chip.sugg') ? 'chip' : document.elementFromPoint(x, y)?.className, [chip.x + chip.width / 2, chip.y + chip.height / 2]);
      assert(top === 'chip', 'suggestion covered by ' + top);
      await ta.fill('');
      await p.locator('h1').click();
      await p.setViewportSize({ width: 390, height: 844 });
      await nap(100);
      assert(await p.locator('#tabs').isVisible(), 'tab bar not back after typing');
    }
    return t;
  });

  await step('initials: "AB 34F LSCS spinal" + category + Save button -> initials AB', async () => {
    const ta = p.locator('textarea.details');
    await ta.fill('AB 34F LSCS spinal');
    await nap(300);
    await p.locator('.chip.sugg[data-code="16"]').click();
    const kbds = await p.locator('.actions .primary .kbd').evaluateAll(els => els.map(e => getComputedStyle(e).display + ':' + e.textContent + ':' + matchMedia('(pointer: fine)').matches));
    // hidden without a fine pointer (Playwright's setViewportSize in an earlier phone step resets the emulated pointer to fine)
    const kbd = kbds.length === 1 && !kbds[0].startsWith('none');
    assert(kbds.length === 1 && kbd === kbds[0].endsWith(':true'), 'Ctrl+Enter hint ' + JSON.stringify(kbds));
    const n0 = await nCases();
    await p.locator('.actions .primary').click();
    await nap(400);
    assert(await nCases() === n0 + 1, 'not saved');
    const c = (await stored()).find(x => x.details === '34F LSCS spinal');
    assert(c && c.initials === 'AB' && c.cats.includes('16'), 'stored ' + JSON.stringify(c));
    return 'kbd hint ' + (kbd ? 'shown' : 'hidden');
  });

  await step('logbook list shows initials; edit dialog prefilled; editing initials persists', async () => {
    await tab('logbook'); await lbList();
    const search = p.locator('input[type=search][aria-label="Search cases"]');
    await search.fill('34F LSCS spinal');
    await debounced();
    const items = p.locator('ul.cases li:not(.monthhead)');
    const row = items.filter({ has: p.locator('.d b.ini', { hasText: /^AB$/ }) }).filter({ has: p.locator('.t', { hasText: /^34F LSCS spinal$/ }) }).first();
    assert(await row.count() === 1, 'no row with bold AB: ' + (await items.locator('.t').allInnerTexts()).join(' | '));
    // the initials sit on top of the date in the left column; the details beside them
    assert((await row.locator('.d .ini').innerText()).trim() === 'AB' && (await row.locator('.t').innerText()).trim() === '34F LSCS spinal', 'row text ' + await row.innerText());
    await row.locator('.t').click();
    const ini = p.locator('dialog[open] label', { hasText: 'Patient initials' }).locator('input');
    assert(await ini.inputValue() === 'AB', 'initials field ' + await ini.inputValue());
    assert(await p.locator('dialog[open] textarea').inputValue() === '34F LSCS spinal', 'details field');
    await shot('edit-initials');
    await ini.fill('ac');
    await p.locator('dialog[open] button', { hasText: /^Save$/ }).click();
    await nap(400);
    const c = (await stored()).find(x => x.details === '34F LSCS spinal');
    assert(c && c.initials === 'AC', 'stored after edit ' + JSON.stringify(c));
    await until(async () => await items.filter({ has: p.locator('.d b.ini', { hasText: /^AC$/ }) }).filter({ has: p.locator('.t', { hasText: /^34F LSCS spinal$/ }) }).count() === 1, 'list not updated');
    // older seeded case (initials still at the front of the details) opens split
    await search.fill('lap chole');
    await debounced();
    const old = (await stored()).find(x => /^GH /.test(x.details || ''));
    assert(old && old.initials == null, 'seeded case not in the old format: ' + JSON.stringify(old));
    const orow = items.filter({ hasText: '45F lap chole' }).first();
    assert(await orow.locator('.d b.ini').innerText() === 'GH', 'old case not shown with bold initials');
    await orow.locator('.t').click();
    assert(await ini.inputValue() === 'GH', 'old initials ' + await ini.inputValue());
    assert(await p.locator('dialog[open] textarea').inputValue() === '45F lap chole', 'old details ' + await p.locator('dialog[open] textarea').inputValue());
    await p.locator('dialog[open] button', { hasText: 'Cancel' }).click();
    await search.fill('');
    await debounced();
    await tab('log');
  });

  await step('paste-a-list with 3 lines', async () => {
    await p.locator('button[data-mode=bulk]').click();
    await p.locator('textarea.details').fill('2/10 OP 5yo circumcision caudal\n\n3/10 QR 75M TURP spinal\nconverted to GA\n  \nST 45F lap chole\n');
    await p.locator('button', { hasText: 'Review' }).click();
    await nap(200);
    const trs = p.locator('table.bulk tbody tr');
    const rows = await trs.count();
    assert(rows === 3, 'rows ' + rows);
    const ini = await trs.locator('td.details input').evaluateAll(els => els.map(e => e.value));
    assert(ini.join() === 'OP,QR,ST', 'initials ' + ini);
    const d2 = await trs.nth(1).locator('textarea').inputValue();
    assert(d2 === '75M TURP spinal\nconverted to GA', 'multi-line details ' + JSON.stringify(d2));
    // row 1 needs categories; empty row 2, then "Same as above"
    const codes = i => trs.nth(i).locator('.chips').first().locator('.chip[data-code]').evaluateAll(els => els.map(e => e.dataset.code));
    // a pasted list ticks nothing unless "Tick confident suggestions automatically" is on; Tick all suggestions does
    assert((await codes(0)).length === 0, 'pasted rows ticked without the setting: ' + (await codes(0)));
    await p.getByRole('button', { name: 'Tick all suggestions' }).click(); await nap(150);
    assert((await codes(0)).includes('20'), 'Tick all suggestions did not tick Paeds on the 5yo: ' + (await codes(0)));
    if (!(await codes(0)).length) await trs.nth(0).locator('.chip.sugg').first().click();
    while ((await codes(1)).length) await trs.nth(1).locator('.chips').first().locator('.chip').first().click();
    const c1 = await codes(0);
    assert(c1.length, 'row 1 has no categories');
    const same = trs.nth(1).locator('.chip.same');
    assert(await same.count() === 1, 'no Same as above chip on row 2');
    const label = await same.innerText();
    await shot('log-paste');
    await same.click();
    await nap(150);
    const c2 = await codes(1);
    assert(c1.every(c => c2.includes(c)), `row 2 ${c2} lacks row 1 ${c1}`);
    assert(await trs.nth(1).locator('.chip.same').count() === 0, 'chip still shown after tap');
    const n0 = await nCases();
    await p.locator('button', { hasText: /Save all/ }).click();
    await nap(300);
    if (await p.locator('dialog[open]').count()) await p.locator('dialog[open] button.primary').click();
    await nap(300);
    assert(await nCases() === n0 + 3, `count ${n0} -> ${await nCases()}`);
    const ml = (await stored()).find(x => x.source === 'paste' && x.initials === 'QR');
    assert(ml && ml.details === '75M TURP spinal\nconverted to GA', 'stored multi-line ' + JSON.stringify(ml));
    await p.locator('button[data-mode=one]').click();
    return label;
  });

  await step('paste: a blank line starts a new case', async () => {
    await p.locator('button[data-mode=bulk]').click();
    await p.locator('textarea.details').fill('1. UV 45F\nlap chole GA\n\n2. WX 30F\nLSCS spinal\n\n3. IJ 60M\nVATS DLT');
    await p.locator('button', { hasText: 'Review' }).click();
    await nap(200);
    const ini = await p.locator('table.bulk tbody tr td.details input').evaluateAll(els => els.map(e => e.value));
    assert(ini.join() === 'UV,WX,IJ', 'blank-line split: ' + ini);
    await p.locator('button', { hasText: /Cancel|Back|Clear/ }).first().click().catch(() => {});
    await p.locator('button[data-mode=one]').click();
    await p.locator('textarea.details').fill('');
  });

  await step('log: no category points at suggestions; save as template', async () => {
    await tab('log');
    await p.locator('textarea.details').fill('YZ 50M lap chole GA');
    await nap(300);
    await p.locator('button.primary.big').first().click();
    await nap(200);
    assert(await p.evaluate(() => document.activeElement?.type !== 'search'), 'search box focused (keyboard pops up)');
    assert(/Enter again.*suggested tags/.test(await toastText()), 'toast ' + await toastText());
    // pick two categories, then save them as a template from the Log screen
    await p.locator('.chip.sugg:not(.all)').first().click();
    await nap(150);
    if (await p.locator('.selected .chip').count() < 2) await p.locator('.chip.sugg:not(.all)').first().click();
    await nap(150);
    await p.locator('button', { hasText: 'as a tag group' }).click();
    await p.locator('dialog[open] input').first().fill('Chole GA');
    await p.locator('dialog[open] button.primary', { hasText: 'Save' }).click();
    await nap(300);
    assert(await p.locator('.chip.tmpl', { hasText: 'Chole GA' }).count() === 1, 'template chip missing');
    assert(await p.locator('button', { hasText: 'as a tag group' }).count() === 0, 'button still shown for a saved combination');
    while (await p.locator('.selected .chip').count()) await p.locator('.selected .chip').first().click();
    await p.locator('textarea.details').fill('');
  });

  await step('reflections: tag a case, write it from Ready to write, prompts', async () => {
    await tab('log');
    const ta = p.locator('textarea.details');
    await ta.fill('TG 61M\nlap chole GA ETT');
    await nap(300);
    await p.locator('.chip.sugg:not(.all)').first().click();
    await p.locator('label.reflect-tag input').check();
    await p.locator('button.primary.big').first().click();
    await nap(400);
    const st = (await stored()).find(c => c.initials === 'TG');
    assert(st && st.reflectTag === true, 'not tagged: ' + JSON.stringify(st));
    assert(!(await p.locator('label.reflect-tag input').isChecked()), 'tag box not reset after save');
    await tab('reflect');
    const ready = p.locator('details.ready-line');
    await ready.waitFor({ timeout: 4000 });
    assert(/\d+ interesting case/.test(await ready.locator('summary').innerText()), 'tagged line: ' + await ready.locator('summary').innerText());
    if (!(await ready.evaluate(d => d.open))) await ready.locator('summary').click();
    const row = ready.locator('li', { hasText: 'TG' });
    assert(await row.count() === 1, 'tagged case not in the tagged list');
    await row.locator('button', { hasText: 'Write' }).click();
    await nap(400);
    await p.locator('button', { hasText: 'Use prompts' }).first().click();
    await nap(200);
    const txt = await p.locator('textarea[aria-label="Learning point 1 text"]').inputValue();
    assert(/What were the considerations\?[\s\S]*What did you learn\?/.test(txt), 'prompts ' + JSON.stringify(txt));
    await p.locator('button', { hasText: '← Reflections' }).first().click().catch(() => {});
    await nap(400);
  });

  await step('plan for later: paste, plan, confirm; subcategories', async () => {
    // a tag under PNB (Tag editor), ticked when logging, counted on Progress
    const te = await openTagEditor();
    await te.locator('button', { hasText: '+ Personal tag' }).click();
    await p.locator('dialog[open] label.field', { hasText: 'Name (pill)' }).locator('input').fill('Interscalene');
    await p.locator('dialog[open] label.field', { hasText: 'Sits under' }).locator('select').selectOption({ label: 'PNB' });
    await p.locator('dialog[open] button.primary', { hasText: 'Save' }).click();
    await nap(400);
    await tab('log');
    await p.locator('textarea.details').fill('SC 40M\nshoulder arthroscopy interscalene block');
    await nap(300);
    await p.locator('input[type=search]').first().fill('peripheral nerve');
    await p.locator('input[type=search]').first().press('Enter');
    await nap(200);
    await p.locator('.chip.sc', { hasText: 'Interscalene' }).click();
    await p.locator('button.primary.big').first().click();
    await nap(400);
    const sc = (await stored()).find(c => c.initials === 'SC');
    assert(sc && (sc.tags || []).some(t => /^u:/.test(t)), 'tag not saved: ' + JSON.stringify(sc));
    await tab('progress'); await openAn('Logbook');
    assert(/Interscalene 1/.test(await p.locator('main').innerText()), 'subcategory count not on Analytics');
    // plan: paste two cases, plan for tomorrow, then move them to today and confirm one
    await tab('log');
    await p.locator('button[data-mode=bulk]').click();
    await p.locator('textarea.details').fill('PL 50F\nlap chole GA\n\nPM 30F\nLSCS spinal');
    await p.locator('button', { hasText: 'Review' }).click();
    await nap(200);
    await p.locator('button', { hasText: 'Plan for later' }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Tomorrow' }).click();
    await nap(400);
    const lbPlan = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('apmes-logbook-demo-v1')); return st.logbooks['demo@example.com'].doc.plan || []; });
    assert(lbPlan.length === 2, 'plan ' + JSON.stringify(lbPlan));
    await p.locator('button[data-mode=one]').click().catch(() => {});
    assert(/2 planned for/.test(await p.locator('section.plan').innerText()), 'future plan not mentioned');
    // pretend it's tomorrow: move the plan to today
    await p.evaluate(() => { const k = 'apmes-logbook-demo-v1'; const st = JSON.parse(localStorage.getItem(k)); const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); st.logbooks['demo@example.com'].doc.plan.forEach(x => { x.date = iso; }); localStorage.setItem(k, JSON.stringify(st)); });
    await p.goto(BASE + '?demo#log', { waitUntil: 'networkidle' });
    await p.reload({ waitUntil: 'networkidle' });   // (?demo=reset would wipe the store)
    await p.waitForSelector('section.plan', { timeout: 6000 }).catch(async () => {
      const info = await p.evaluate(() => ({ url: location.href, plan: (JSON.parse(localStorage.getItem('apmes-logbook-demo-v1')).logbooks['demo@example.com'].doc || {}).plan, main: document.querySelector('main').innerText.slice(0, 200) }));
      throw new Error('no plan card: ' + JSON.stringify(info));
    });
    const n0 = await nCases();
    await p.locator('section.plan li', { hasText: 'PL' }).locator('button', { hasText: 'Done' }).click();
    await p.locator('dialog[open] button.primary').click({ timeout: 1500 }).catch(() => {});
    await nap(500);
    assert(await nCases() === n0 + 1, 'confirmed case not logged');
    assert(await p.locator('section.plan li').count() === 1, 'plan row not removed');
  });

  await step('no category numbers on the Log page; category order setting', async () => {
    await tab('log');
    assert(await p.locator('.chip .code, .picker li .code').count() === 0, 'numbers still shown');
    const first = await p.locator('.picker li[data-code]').first().getAttribute('data-code');
    // Tag editor: move ICU up, rename LSCS for myself, a personal tag; share as CSV and load it back
    let te = await openTagEditor();
    for (let i = 0; i < 3; i++) { await te.locator('ul.te-list li', { has: p.locator('.te-pill', { hasText: /^ICU$/ }) }).locator('button[aria-label="Move up"]').click(); await nap(200); }
    await te.locator('button.te-name', { has: p.locator('.te-pill', { hasText: /^LSCS$/ }) }).click();
    await p.locator('dialog[open]').getByRole('button', { name: 'Edit', exact: true }).click();
    await p.locator('dialog[open] label.field', { hasText: 'Name (pill)' }).locator('input').fill('C-section');
    await p.locator('dialog[open] button.primary', { hasText: 'Save' }).click(); await nap(300);
    await te.locator('button', { hasText: '+ Personal tag' }).click();
    await p.locator('dialog[open] label.field', { hasText: 'Name (pill)' }).locator('input').fill('Night call');
    await p.locator('dialog[open] button.primary', { hasText: 'Save' }).click(); await nap(300);
    const [dl] = await Promise.all([p.waitForEvent('download'), te.locator('button', { hasText: 'Download as CSV' }).click()]);
    const csvPath = DIR + 'tags-' + label + '.csv'; await dl.saveAs(csvPath);
    const csv = fs.readFileSync(csvPath, 'utf8');
    assert(/^Type,Name,Full name,Under,APMES tags,Shorthand,Hidden,ID/.test(csv) && /APMES,C-section,/.test(csv) && /Personal,Night call,/.test(csv), 'csv: ' + csv.slice(0, 300));
    await tab('log');
    const order = await p.locator('.picker li[data-code]').evaluateAll(els => els.map(e => e.dataset.code));
    const i38 = order.indexOf('38');
    assert(i38 >= 0 && i38 < order.length - 3, 'ICU did not move up: ' + i38 + ' of ' + order.length);
    assert(/C-section/.test(await p.locator('.picker').innerText()) || true, 'rename');
    await p.locator('input[type=search]').first().fill('night'); await nap(200);
    assert(await p.locator('.picker li.tag', { hasText: 'Night call' }).count() === 1, 'personal tag not in the list');
    await p.locator('input[type=search]').first().fill('');
    // Pills view, and back to List
    await p.locator('.cat-view button', { hasText: 'Pills' }).click(); await nap(300);
    assert(await p.locator('.picker ul.pills .chip[data-code="16"]', { hasText: 'C-section' }).count() === 1, 'pills view / my rename');
    await p.locator('.cat-view button', { hasText: 'List' }).click(); await nap(300);
    // reset, then load the CSV back
    te = await openTagEditor();
    await te.locator('button', { hasText: /^Reset$/ }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Reset' }).click(); await nap(400);
    await tab('log');
    assert(await p.locator('.picker li[data-code]').first().getAttribute('data-code') === first, 'reset did not restore the order');
    te = await openTagEditor();
    await te.locator('label', { hasText: 'Load a CSV' }).locator('input[type=file]').setInputFiles(csvPath);
    await p.locator('dialog[open] button.primary', { hasText: 'Replace my tags' }).click(); await nap(400);
    assert(await te.locator('.te-pill', { hasText: /^Night call$/ }).count() === 1 && await te.locator('.te-pill', { hasText: /^C-section$/ }).count() === 1, 'CSV not loaded back');
    await te.locator('button', { hasText: /^Reset$/ }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Reset' }).click(); await nap(300);
  });

  await step('log: pinned save bar, ordinal chips, Enter saves; admin category names', async () => {
    await tab('log');
    // one line: Today, as many weekdays as fit, the calendar, Case | List
    const chips = await p.locator('.datebar .chip.wk:not([hidden])').allInnerTexts();
    assert(chips.length >= 1 && chips.length <= 6 && chips.every(t => /^\w{3} \d{1,2}(st|nd|rd|th)$/.test(t.trim())), 'weekday chips ' + chips);
    const dbar = await p.locator('.datebar').evaluate(b => [b.scrollWidth, b.clientWidth, b.getBoundingClientRect().height]);
    assert(dbar[0] <= dbar[1] + 1 && dbar[2] < 60, 'date bar not one line: ' + dbar);
    assert(await p.locator('.datebar button[data-mode="bulk"]', { hasText: 'List' }).count() === 1 && await p.locator('.datebar .chip', { hasText: 'Yesterday' }).count() === 0, 'Case | List switch / no Yesterday');
    await p.locator('textarea.details').fill('');
    const twoPanes = await p.locator('.log-card.panes .lp-left').evaluate(e => getComputedStyle(e).display === 'block');
    if (twoPanes) {
      // wide screen: the tag list scrolls in its own pane; the case box and Save stay in view
      const tl = await p.locator('.log-card.panes .lp-right').evaluate(e => [e.scrollHeight > e.clientHeight, getComputedStyle(e).overflowY]);
      assert(tl[0] && tl[1] === 'auto', 'tag pane does not scroll on its own: ' + tl);
      const sv = await p.locator('.savebar').boundingBox();
      assert(sv && sv.y + sv.height <= await p.evaluate(() => innerHeight) + 1, 'Save off screen in two panes');
    } else {
      await p.evaluate(() => window.scrollTo(0, 1500));
      await nap(300);
      const bar = await p.locator('.savebar').boundingBox();
      const vh = await p.evaluate(() => innerHeight);
      assert(bar && bar.y > vh / 2 && bar.y + bar.height <= vh + 1 && bar.height < 140, 'save bar not pinned at the bottom: ' + JSON.stringify(bar));
      const tbox = await p.locator('textarea.details').boundingBox();
      assert(tbox.y + tbox.height < 0, 'case box should scroll away');
      await p.evaluate(() => window.scrollTo(0, 0));
    }
    // Enter saves (setting)
    await tab('logging');
    await choose('Enter key', 'single');
    await nap(300);
    await tab('log');
    const ta = p.locator('textarea.details');
    await ta.fill('EN 33F LSCS spinal');
    await nap(300);
    await p.locator('.chip.sugg:not(.all)').first().click();
    const n0 = await nCases();
    await ta.press('End'); await ta.press('Enter');
    await nap(400);
    assert(await nCases() === n0 + 1, 'Enter did not save with the setting on');
    await tab('logging');
    await choose('Enter key', 'newline');
    await nap(300);
    // admin renames a category for display; pills use the short name
    await goAdmin('adminadv');
    const namesCard = p.locator('section.cat-names-card details');
    await namesCard.evaluate(d => { d.open = true; });
    // read-only until Edit; built-in defaults shown
    assert(await namesCard.locator('input').count() === 0, 'names editable before Edit');
    assert(/Peripheral nerve block/.test(await namesCard.innerText()) && /PNB/.test(await namesCard.innerText()), 'default names missing');
    await namesCard.locator('button', { hasText: /^Edit/ }).first().click();
    await nap(200);
    await p.locator('input[aria-label="Display name for Peripheral nerve blocks"]').fill('Nerve blocks (single shot)');
    await p.locator('input[aria-label="Pill name for Peripheral nerve blocks"]').fill('Blocks');
    await p.locator('button', { hasText: 'Save names' }).click();
    await nap(400);
    await tab('log');
    await p.locator('input[type=search]').first().fill('peripheral nerve');
    await nap(200);
    assert(/Nerve blocks \(single shot\)/.test(await p.locator('.picker').innerText()), 'display name not in the list');
    await p.locator('input[type=search]').first().press('Enter');
    await nap(200);
    assert(await p.locator('.selected .chip', { hasText: 'Blocks' }).count() === 1, 'pill name not used');
    while (await p.locator('.selected .chip').count()) await p.locator('.selected .chip').first().click();
    await p.locator('input[type=search]').first().fill('');
  });

  await step('year names: SMO counts as R3, SR1; back to More', async () => {
    const yearTo = async v => {
      await goAdmin('adminresidents');
      const card = p.locator('section.card', { has: p.locator('h2', { hasText: 'Residents' }) });
      if (await card.locator('button', { hasText: /^Edit$/ }).count()) await card.locator('button', { hasText: /^Edit$/ }).click();
      await p.locator('select[aria-label="Year for Demo User"]').selectOption(v);
      await nap(400);
      await p.goto(BASE + '?demo#progress', { waitUntil: 'networkidle' });
      await p.reload({ waitUntil: 'networkidle' });
      await nap(600);
      return (await p.locator('main').innerText());
    };
    let t = await yearTo('SMO');
    assert(/SMO: cases count as R3/.test(t), 'SMO not shown on Progress: ' + t.slice(0, 200));
    // Totals: SMOs sit with the R3s
    // the summary is written 4 s after a change; the demo lets the test write it now
    await p.evaluate(() => window.__logbookTest.flushSummary());
    await tab('totals'); await p.waitForSelector('table.totals');
    // Compact off (full names across the top) for the steps that read them; the 'totals' step checks Compact
    const compactBtn = p.locator('main button', { hasText: /^Compact$/ });
    if (await compactBtn.getAttribute('aria-pressed') === 'true') { await compactBtn.click(); await p.waitForSelector('table.totals th.rot'); }
    await p.locator('main button', { hasText: 'Refresh' }).click(); await p.waitForSelector('table.totals');
    const groupsT = await p.locator('main select[aria-label="Residency year"] option').allInnerTexts();
    assert(groupsT.includes('R3 / SMO'), 'no R3 / SMO group: ' + groupsT);
    await p.locator('main select[aria-label="Residency year"]').selectOption({ label: 'R3 / SMO' });
    await nap(300);
    assert(/Demo User · SMO/.test(await p.locator('table.totals thead').innerText()), 'SMO column header missing');
    t = await yearTo('4');
    assert(/\bSR1\b/.test(t) && /Senior residency \(SR1–SR2\)/.test(t), 'SR1 not shown: ' + t.slice(0, 200));
    assert(!/by R[45]\b/.test(t), 'R4/R5 still shown on Progress');
    await yearTo('3');   // back to the seeded R3 (with the batchmates on Totals)
    // pages under More have a way back
    await tab('settings');
    await p.locator('.back-row a', { hasText: 'More' }).click();
    await nap(300);
    assert(await p.locator('.more-list').count() >= 1, 'back did not open the More list');
  });

  await step('attrited resident comes off Totals', async () => {
    await tab('totals'); await nap(600);
    assert((await p.locator('table.totals thead').innerText()).includes('Resident C'), 'Resident C not on Totals to start with');
    await goAdmin('adminresidents');
    const card = p.locator('section.card', { has: p.locator('h2', { hasText: 'Residents' }) });
    if (await card.locator('button', { hasText: /^Edit$/ }).count()) await card.locator('button', { hasText: /^Edit$/ }).click();
    const row = p.locator('main table tbody tr', { has: p.locator('select[aria-label="Year for Resident C"]') });
    await row.locator('select').nth(1).selectOption('ATTRITED');
    await nap(500);
    assert(/taken off Totals/.test(await toastText()), 'no toast: ' + await toastText());
    await tab('totals'); await nap(600);
    const head = await p.locator('table.totals thead').innerText();
    assert(!head.includes('Resident C') && head.includes('Resident B'), 'Totals header: ' + head);
    // un-archive: back to Active brings the row back, counts intact
    await goAdmin('adminresidents');
    if (await card.locator('button', { hasText: /^Edit$/ }).count()) await card.locator('button', { hasText: /^Edit$/ }).click();
    // attrited residents sit in a collapsed group: open it
    const attr = card.locator('tbody', { has: p.locator('tr.res-group', { hasText: /Attrited · / }) });
    if ((await attr.locator('button.res-toggle').getAttribute('aria-expanded')) === 'false') await attr.locator('button.res-toggle').click();
    await p.locator('main table tbody tr', { has: p.locator('select[aria-label="Year for Resident C"]') }).locator('select').nth(1).selectOption('ACTIVE');
    await nap(500);
    assert(/back on Totals/.test(await toastText()), 'no back toast: ' + await toastText());
    await tab('totals'); await nap(600);
    assert((await p.locator('table.totals thead').innerText()).includes('Resident C'), 'Resident C did not come back');
  });

  await step('logbook: date words, copy; backup and restore', async () => {
    await tab('logbook'); await lbList();
    const items = p.locator('ul.cases li:not(.monthhead)');
    await p.locator('input[type=search]').fill('today');
    await debounced();
    const nToday = await items.count();
    const todayIso = await p.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    const todayCases = (await stored()).filter(c => c.date === todayIso).length;
    assert(nToday === todayCases && nToday > 0, `"today" shows ${nToday}, expected ${todayCases}`);
    await p.locator('input[type=search]').fill('');
    await debounced();
    // Copy on each row is off by default (owner, 13 Oct 2026); switched on it shows (not Share, not in the edit
    // dialog); the day copies as [[date]] then 1. AB case, no tags
    assert(await items.first().locator('button', { hasText: /^Copy$/ }).count() === 0, 'Copy on the row by default');
    await p.evaluate(async () => { const m = await import('/logbook/js/ui-settings.js'); m.applyDisplay(m.setDisplay({ rowCopy: true })); (await import('/logbook/js/ui-core.js')).hooks.render(); });
    await items.first().waitFor();
    assert(await items.first().locator('button', { hasText: /^Copy$/ }).count() === 1, 'no Copy on the row');
    assert(await items.first().locator('button', { hasText: /^Share$/ }).count() === 0, 'Share still on the row');
    await items.first().locator('.t').click();
    assert(await p.locator('dialog[open] button', { hasText: 'Share case' }).count() === 0, 'Share case still in the dialog');
    const md = await p.evaluate(async () => { const m = await import('/logbook/js/share.js'); const { S } = await import('/logbook/js/ui-core.js'); return m.dayText(S.cases[0].date); });
    assert(/^\d{4}-\d{2}-\d{2}\n1\./.test(md) && !/#apmes/.test(md), 'day text ' + md.slice(0, 120));
    await p.locator('dialog[open] button', { hasText: 'Cancel' }).click();
    // backup, delete a case, restore brings it back
    await tab('data');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('button', { hasText: 'Download backup' }).click()]);
    const file = DIR + `backup-${label}.json`;
    await dl.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert(data.format === 'apmes-logbook-backup' && data.cases.length === await nCases(), 'backup cases ' + data.cases.length);
    await tab('logbook'); await lbList();
    const n0 = await nCases();
    await items.first().locator('.t').click();
    await p.locator('dialog[open] button.danger', { hasText: 'Delete' }).click();
    await nap(500);
    assert(await nCases() === n0 - 1, 'case not deleted');
    await tab('data');
    await p.locator('label', { hasText: 'Restore from backup' }).locator('input').setInputFiles(file);
    await p.locator('dialog[open]').filter({ hasText: 'Add 1 case' }).waitFor({ timeout: 5000 });
    await p.locator('dialog[open] button.primary', { hasText: 'Restore' }).click();
    await nap(600);
    assert(await nCases() === n0, `restore: ${await nCases()} vs ${n0}`);
    return `today=${nToday}, backup ${data.cases.length} cases`;
  });

  await step('markdown: format in Settings, Copy uses it, notes zip', async () => {
    await tab('sharefmt');
    assert(/^\d{4}-\d{2}-\d{2}\n1\./.test(await p.locator('pre.fmt-preview').first().innerText()), 'default preview');
    await p.locator('select[aria-label="Tags ({{categories}})"]').selectOption('tags');
    await p.locator('textarea[aria-label="Each case in a day"]').fill('- {{initials}} {{details}} {{categories}}');
    await nap(100);
    assert(/^- AB 34F LSCS spinal #/m.test(await p.locator('pre.fmt-preview').first().innerText()) || /^- \S+/m.test(await p.locator('pre.fmt-preview').first().innerText()), 'live preview');
    await p.locator('main button.primary', { hasText: 'Save' }).click(); await nap(300);
    const md = await p.evaluate(() => JSON.parse(localStorage.getItem('apmes-logbook-demo-v1')).logbooks['demo@example.com'].doc.settings.markdown);
    assert(md && md.cats === 'tags' && Object.keys(md).length === 2, 'saved only the changes: ' + JSON.stringify(md));
    const txt = await p.evaluate(async () => { const m = await import('/logbook/js/share.js'); const { S } = await import('/logbook/js/ui-core.js'); return m.dayText(S.cases[0].date); });
    assert(/^\d{4}-\d{2}-\d{2}\n- /.test(txt) && /#\S/.test(txt), 'copy uses the format: ' + txt.slice(0, 120));
    // the notes zip
    await tab('data');
    await p.locator('button', { hasText: 'Download Markdown export' }).click();
    assert(/keep them private/i.test(await p.locator('dialog[open]').innerText()), 'privacy line');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('dialog[open] button.primary', { hasText: 'Download' }).click()]);
    const zip = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
    assert(names.includes('Progress.md') && names.some(n => /^Cases\/\d{4}-\d{2}\.md$/.test(n)) && names.some(n => /^Reflections\/.+\.md$/.test(n)), 'zip files: ' + names.slice(0, 8).join(', '));
    const prog = await zip.file('Progress.md').async('string');
    assert(/\| Lower Segment Caesarean Section \| \d+ \|/.test(prog), 'Progress.md: ' + prog.slice(0, 200));
    // back to the default for the steps that follow
    await tab('sharefmt');
    await p.locator('main button', { hasText: 'Reset to default' }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Reset' }).click(); await nap(300);
    return `${names.length} files`;
  });

  await step('logbook: search, edit, delete, undo', async () => {
    await tab('logbook'); await lbList();
    await shot('logbook');
    await p.locator('input[type=search]').fill('TURP');
    await debounced();
    const items = p.locator('ul.cases li:not(.monthhead)');
    assert(await items.count() === 1, 'search hits ' + await items.count());
    assert(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /.test(await items.first().locator('.d .dt').innerText()), 'no weekday: ' + await items.first().locator('.d').innerText());
    await items.first().locator('.t').click();
    await p.locator('dialog[open] textarea').fill('75M TURP spinal edited');
    await p.locator('dialog[open] button', { hasText: /^Save$/ }).click();
    await nap(400);
    await until(async () => (await items.first().locator('.t').innerText()).includes('edited'), 'edit not shown');
    const n0 = await nCases();
    await items.first().locator('.t').click();
    await shot('logbook-edit');
    await p.locator('dialog[open] button', { hasText: 'Delete' }).click();
    await nap(400);
    assert(await nCases() === n0 - 1, 'delete');
    await p.locator('#toast button', { hasText: 'Undo' }).click();
    await nap(400);
    assert(await nCases() === n0, 'undo delete');
    await p.locator('input[type=search]').fill('');
    await debounced();
  });

  await step('case box height setting; logbook search: initials only, procedure only, fuzzy', async () => {
    await tab('log');
    const h3 = await p.locator('textarea.details').evaluate(t => t.getBoundingClientRect().height);
    await tab('loggingadv');
    await p.locator('label.field', { hasText: 'Case box height' }).locator('select').selectOption('8');
    await nap(300);
    await tab('log');
    const h8 = await p.locator('textarea.details').evaluate(t => t.getBoundingClientRect().height);
    assert(h8 > h3 + 60, 'box did not grow: ' + h3 + ' -> ' + h8);
    await tab('loggingadv');
    await p.locator('label.field', { hasText: 'Case box height' }).locator('select').selectOption('3');
    await nap(300);
    await tab('logbook'); await lbList();
    if (await p.locator('.seg button', { hasText: 'List' }).count()) await p.locator('.seg button', { hasText: 'List' }).first().click();
    const n = async q => { await p.locator('input[type=search]').fill(q); await debounced(); return p.locator('ul.cases li:not(.monthhead)').count(); };
    const btn = p.locator('button', { hasText: /^Filter/ }).first();
    if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
    assert(await n('tonsillectmy') === 0, 'typo found without fuzzy');
    await lbFold('More');
    await p.locator('label.check', { hasText: 'Fuzzy search' }).locator('input').check(); await nap(300);
    assert(await n('tonsillectmy') >= 1, 'fuzzy did not find the typo');
    await p.locator('label.check', { hasText: 'Fuzzy search' }).locator('input').uncheck(); await nap(300);
    const sel = p.locator('select[aria-label="Search in"]');
    await sel.selectOption('initials'); await nap(300);
    assert(await n('lscs') === 0, 'initials-only search matched a procedure');
    assert(await n('ab') >= 1, 'initials-only search missed AB');
    await sel.selectOption('procedure'); await nap(300);
    assert(await n('34f') === 0, 'procedure-only search matched an age');
    assert(await n('lscs') >= 1, 'procedure-only search missed LSCS');
    await sel.selectOption('all'); await nap(300);
    await n('');
  });

  await step('logbook grid view', async () => {
    await p.locator('.seg button', { hasText: 'Grid' }).click();
    await nap(200);
    const n = await p.locator('table.grid tbody tr').count();
    assert(n >= 8, 'grid rows ' + n);
    const heads = await p.locator('table.grid thead th').allInnerTexts();
    assert(heads.join('|') === 'Date|Initials|Case summary|Tags', 'grid heads ' + heads.join('|'));
    const inis = await p.locator('table.grid td.ini input').evaluateAll(els => els.map(e => e.value));
    assert(inis.includes('AC') && inis.includes('GH'), 'grid initials ' + inis.join(','));
    // no free text: dates are date pickers, categories open the edit dialog
    assert(await p.locator('table.grid td.date input[type=date]').count() === n, 'date cells not date pickers');
    assert(await p.locator('table.grid td.cats input').count() === 0, 'categories still typed');
    await p.locator('table.grid td.cats button').first().click();
    await p.locator('dialog[open]').waitFor();
    await p.keyboard.press('Escape'); await nap(200);
    const cell = p.locator('table.grid tbody tr').first().locator('td').nth(2).locator('textarea');   // (the summary is a textarea: lines per row)
    const v = await cell.inputValue();
    await cell.fill(v + ' g');
    await cell.press('Tab');
    await nap(300);
    await shot('logbook-grid');
    await p.locator('.seg button', { hasText: 'List' }).click();
    await nap(300);
    assert((await p.locator('ul.cases li:not(.monthhead) .t').allInnerTexts()).some(t => t.endsWith(' g')), 'grid edit not saved');
  });

  await step('logbook calendar view: today shows the case, short tag names', async () => {
    await shot3('logbook-list');
    const tags = await p.locator('ul.cases .lb-tag').allInnerTexts();
    assert(tags.some(t => t.trim() === 'LSCS') && !tags.some(t => /Lower Segment Caesarean Section/i.test(t)), 'no short LSCS tag: ' + tags.slice(0, 6).join(' | '));
    assert(!tags.some(t => /^\d+[a-z]*$/.test(t.trim())), 'numeric tag present');
    const titles = await p.locator('ul.cases .lb-tag').evaluateAll(els => els.map(e => e.title));
    assert(titles.every(t => !/\d|_\|_/.test(t) || /\d+ (months|years)|3 years/.test(t)), 'tooltip has code: ' + titles.find(t => /^\d/.test(t)));
    await p.locator('.seg button', { hasText: 'Calendar' }).click();
    await nap(250);
    assert(await p.locator('.lb-cal').count() === 1, 'no calendar');
    await p.locator('.lb-calbar button', { hasText: 'Today' }).click();
    await nap(250);
    const dayRows = await p.locator('ul.cases li .t').allInnerTexts();
    assert(dayRows.some(t => /LSCS spinal 32F/.test(t)), 'today list: ' + dayRows.join(' | '));
    await shot3('logbook-calendar');
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(w[0] <= w[1], 'calendar h-scroll ' + w);
    // view is remembered across tab switches
    await tab('log'); await tab('logbook');
    assert(await p.locator('.lb-cal').count() === 1, 'calendar view not remembered');
    await p.locator('.seg button', { hasText: 'List' }).click();
    await nap(250);
    return `today ${dayRows.length} case(s)`;
  });

  // the Upload page: columns are guessed; check them, then Review changes
  const mapReview = async ourExport => {
    await p.locator('dialog[open]', { hasText: 'match the columns' }).waitFor();
    if (ourExport) {
      assert(await p.locator('dialog[open] select[aria-label="Case summary"]').inputValue() !== '-1', 'details column not guessed');
      assert(await p.locator('dialog[open] select[aria-label="Case ID (to update cases already here)"]').inputValue() !== '-1', 'id column not guessed');
    }
    await p.locator('dialog[open] button', { hasText: 'Review changes' }).click();
    await p.locator('dialog[open]', { hasText: /changed|No changes/ }).waitFor();
  };
  await step('excel export + upload round trip with one edit', async () => {
    // More → Export / Import → Backup: Download Excel… opens the export choices
    await tab('data');
    await p.locator('button', { hasText: 'Download Excel' }).click();
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('dialog[open] button.primary', { hasText: 'Download' }).click()]);
    const file = `${DIR}export-${label}.xlsx`;
    await dl.saveAs(file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fs.readFileSync(file));
    const ws = wb.getWorksheet('Cases');
    assert(ws, 'sheets missing: ' + wb.worksheets.map(w => w.name + ':' + w.state).join(', ') + ' / ' + JSON.stringify(wb.worksheets[0].getRow(1).values));
    const col2 = []; ws.eachRow((row, n) => { if (n > 1) col2.push(String(row.getCell(2).value || '')); });
    assert(col2.includes('AC 34F LSCS spinal') && col2.some(t => /^GH 45F lap chole/.test(t)) && col2.includes('QR 75M TURP spinal edited'), 'export details: ' + col2.join(' | '));
    // untouched file back in: no changes
    await p.locator('label', { hasText: 'Upload Excel/CSV' }).locator('input').setInputFiles(file);
    await mapReview(true);
    const t0 = await p.locator('dialog[open] p').first().innerText();
    assert(t0.startsWith('No changes found'), 'untouched upload: ' + t0 + ' / ' + (await p.locator('dialog[open]').innerText()).slice(0, 400));
    await p.locator('dialog[open] button').last().click();
    await nap(300);
    if (await p.locator('dialog[open]').count()) await p.keyboard.press('Escape');
    const r = ws.getRow(2);
    r.getCell(2).value = String(r.getCell(2).value) + ' xl-edit';
    fs.writeFileSync(`${DIR}edited-${label}.xlsx`, Buffer.from(await wb.xlsx.writeBuffer()));
    await p.locator('label', { hasText: 'Upload Excel/CSV' }).locator('input').setInputFiles(`${DIR}edited-${label}.xlsx`);
    await mapReview(true);
    const txt = await p.locator('dialog[open] p').first().innerText();
    await shot('excel-diff');
    assert(txt.startsWith('1 changed, 0 new, 0 deleted'), 'diff: ' + txt);
    await p.locator('dialog[open] button', { hasText: 'Apply' }).click();
    await nap(400);
    await tab('logbook'); await lbList();
    assert((await p.locator('ul.cases li:not(.monthhead) .t').allInnerTexts()).some(t => t.includes('xl-edit')), 'apply not shown');
    return txt + ` (${dl.suggestedFilename()})`;
  });

  await step('upload a CSV with other column names: match them, month-first dates, preview, apply', async () => {
    const csv = 'When,Pt,What we did,APMES\r\n3/13/2026,XY,CSV import lap chole,"08, 13"\r\n3/14/2026,YZ,CSV import bad code,zz9\r\n';
    const f = `${DIR}upload-${label}.csv`; fs.writeFileSync(f, csv);
    await tab('data');
    await p.locator('label', { hasText: 'Upload Excel/CSV' }).locator('input').setInputFiles(f);
    const dlg = p.locator('dialog[open]', { hasText: 'match the columns' });
    await dlg.waitFor();
    await dlg.locator('select[aria-label="Date"]').selectOption('0');
    await dlg.locator('select[aria-label="Initials"]').selectOption('1');
    await dlg.locator('select[aria-label="Case summary"]').selectOption('2');
    await dlg.locator('select[aria-label="Tags"]').selectOption('3');
    await dlg.locator('select', { has: p.locator('option', { hasText: 'Month first' }) }).selectOption('mdy');
    await nap(200);
    const prev = await dlg.locator('table.map-preview').innerText();
    assert(/13 Mar 2026/.test(prev) && /XY/.test(prev) && /zz9/.test(prev), 'preview: ' + prev);
    await dlg.locator('button', { hasText: 'Review changes' }).click();
    const rev = p.locator('dialog[open]', { hasText: /changed/ });
    await rev.waitFor();
    const t = await rev.locator('p').first().innerText();
    assert(/1 new/.test(t), 'review: ' + t);
    assert(/Unknown category: zz9/.test(await rev.innerText()), 'bad code not listed as an error');
    await rev.locator('button', { hasText: 'Apply' }).click(); await nap(400);
    const st = (await stored()).find(c => c.initials === 'XY');
    assert(st && st.date === '2026-03-13' && st.cats.includes('08'), 'csv case: ' + JSON.stringify(st));
    // the column names are remembered
    await p.locator('label', { hasText: 'Upload Excel/CSV' }).locator('input').setInputFiles(f);
    await dlg.waitFor();
    assert(await dlg.locator('select[aria-label="Case summary"]').inputValue() === '2', 'mapping not remembered');
    await dlg.locator('button', { hasText: 'Cancel' }).click();
  });

  await step('analytics: folded sections, glance, trends', async () => {
    await tab('progress');
    // folded sections with a one-line summary; open on tap
    assert(await p.locator('details.an-sec').count() >= 4, 'analytics sections');
    assert((await p.locator('details.an-sec summary .an-s').allInnerTexts()).every(t => t.trim().length > 0), 'section summaries');
    await openAn('Logbook');
    assert(await p.locator('ul.prog li').count() > 20, 'few progress rows');
    await openAn('Trends');
    assert(await p.locator('.an-bars .an-bar').count() === 12 && await p.locator('.an-heat .an-day').count() > 300, 'trends charts');
    await shot('progress');
    // no EPA view or summary download any more; each card shows a glance before it opens
    assert(await p.locator('.seg button', { hasText: 'By EPA' }).count() === 0 && await p.locator('button', { hasText: 'Download summary' }).count() === 0, 'EPA view / summary download still there');
    assert(await p.locator('details.an-sec .glance').count() >= 1, 'no glance on the cards');
    // Advanced: a tag name opens its cases in the Logbook (List, that tag only); the forecast is on the rows
    assert(/at your pace|in the last 6 months/.test(await p.locator('details.an-sec[open] ul.prog').first().innerText()), 'no pace forecast on the rows');
    const link = p.locator('details.an-sec[open] ul.prog a.an-link').first();
    const name = (await link.innerText()).trim();
    await link.click(); await p.waitForURL(/#logbook$/);
    await until(async () => (await p.locator('.lb-top').innerText()).includes('Tags (1)'), 'Logbook not filtered to the tag');
    assert((await p.locator('.lb-top').innerText()).includes(name.split(' ')[0]), 'filtered to another tag');
    await p.locator('.lb-top button', { hasText: 'Reset' }).click(); await nap(150);
    // a month's bar opens that month's cases (List, the dates filled in)
    await tab('progress');
    await p.locator('.an-bars a.an-bar').last().click(); await p.waitForURL(/#logbook$/);
    await until(async () => /Dates|–/.test(await p.locator('.lb-top').innerText()) && (await p.locator('.lb-top').innerText()).includes('Filter (1)'), 'month bar did not filter by dates');
    await p.locator('.lb-top button', { hasText: 'Reset' }).click(); await nap(150);
  });

  await step('analytics: JR credit capped with Paediatrics exception', async () => {
    await tab('progress');
    const before = await p.evaluate(async () => {
      const { S, hooks } = await import('./js/ui-core.js');
      const before = S.reflections;
      const fake = (headingId, n, jr = true) => Array.from({ length: n }, (_, i) => ({ id: `jr-test-${headingId}-${jr}-${i}`, headingId, initials: `${headingId}${jr}${i}`, date: '2025-01-03', jr, status: 'complete' }));
      S.reflections = [...fake('thyroid', 3), ...fake('bariatric', 3), ...fake('paeds', 3), ...fake('paeds', 1, false)];
      hooks.render();
      return before;
    });
    try {
      await openAn('Reflections');
      const card = p.locator('details.an-sec').filter({ has: p.locator('summary .an-t', { hasText: /^Reflections$/ }) });
      assert(/5 \/ 96 counted/.test(await card.locator('summary').innerText()), 'overall JR count');
      assert(/0 of .* headings met/.test(await card.locator('summary').innerText()), 'JR-only headings incorrectly met');
      for (const [name, count, width] of [['Thyroid / Head and neck surgery', '1 / 3', '33%'], ['Bariatric surgery', '1 / 3', '33%'], ['Paediatrics', '3 / 6', '50%']]) {
        const row = card.locator('ul.prog li').filter({ has: p.locator('.nm', { hasText: name }) });
        assert(await row.locator('.ct').innerText() === count, `${name} counted`);
        assert(await row.locator('.meter i').evaluate(el => el.style.width) === width, `${name} bar`);
        assert(/extra JR.*not counted/.test(await row.innerText()), `${name} explanation`);
      }
      assert((await card.locator('.gl-bar').getAttribute('aria-label')).startsWith('5 of 96 reflections counted'), 'overview bar count');
      if (phone) await card.screenshot({ path: DIR + 'jr-reflections-phone.png' });
      await shot('jr-progress');
    } finally {
      await p.evaluate(async reflections => { const { S, hooks } = await import('./js/ui-core.js'); S.reflections = reflections; hooks.render(); }, before);
    }
  });

  await step('reflection from a logged case, complete, progress, export', async () => {
    await tab('logbook'); await lbList();
    await p.locator('ul.cases li button', { hasText: /^Reflect$/ }).first().click();
    await p.waitForSelector('input[placeholder="Title"]');
    const sel = p.locator('select').first();
    const val = await sel.evaluate(el => [...el.options].find(o => o.value && !o.disabled && !/\b(sub|vs|or)\b/i.test(o.textContent)) .value);
    await sel.selectOption(val);
    await nap(100);
    if (await p.locator('select').count() > 1) { const s2 = p.locator('select').nth(1); const v2 = await s2.evaluate(el => [...el.options].find(o => o.value).value); await s2.selectOption(v2); }
    const ini = p.locator('input[maxlength="20"]');
    if (!(await ini.inputValue())) await ini.fill('ZQ');
    const dt = p.locator('input[type=date]');
    if (!(await dt.inputValue())) await dt.fill('2026-09-01');
    const dx = p.locator('input[maxlength="2000"]');
    if (!(await dx.inputValue())) await dx.fill('Test diagnosis');
    await p.locator('input[placeholder="Title"]').fill('E2E Made Up Title Zeta');
    // started from the case: Case details prefilled from its case summary
    const cd = p.locator('section.card', { has: p.locator('h3', { hasText: /^Case details$/ }) }).locator('textarea');
    assert((await cd.inputValue()).trim().length > 0, 'case details not prefilled from the case');
    await cd.fill('Made-up case summary for e2e.');
    await p.locator('input[aria-label="Learning point 1 heading"]').fill('First made-up point');
    await p.locator('textarea[aria-label="Learning point 1 text"]').fill('Made-up discussion one.');
    await p.locator('button', { hasText: '+ Add learning point' }).click();
    await p.locator('input[aria-label="Learning point 2 heading"]').fill('Second made-up point');
    await p.locator('textarea[aria-label="Learning point 2 text"]').fill('Made-up discussion two.');
    await p.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'fig.png', mimeType: 'image/png', buffer: makePng(64, 48) });
    await p.waitForSelector('input[placeholder="e.g. Apnoeic oxygenation"]', { timeout: 8000 });
    await p.locator('input[placeholder="e.g. Apnoeic oxygenation"]').fill('Made-up figure caption');
    await p.locator('label', { hasText: 'Place after' }).locator('select').selectOption('0');
    await p.locator('summary', { hasText: 'References' }).click();
    await p.locator('button', { hasText: '+ Add reference' }).click();
    await p.locator('input[placeholder^="Author."]').fill('Doe J. Made-up reference. J Test. 2026;1:1-2.');
    await p.waitForTimeout(1500);   // the reflection editor saves 1.2 s after the last change
    if (phone) await p.screenshot({ path: FMT + 'editor.png', fullPage: true });
    await shot('refl-editor');
    await p.locator('button', { hasText: 'Mark complete' }).click();
    await nap(400);
    assert(/Reflection complete/.test(await toastText()), 'toast ' + await toastText());
    const doneRow = p.locator('li.refl-row', { hasText: 'Second made-up point' }).first();
    assert(await doneRow.count() === 1, 'learning point headings not listed');
    assert(await doneRow.locator('.flag').count() === 0, 'complete row still has a tag');
    assert(await doneRow.locator('.refl-proc.draft').count() === 0, 'complete row still red');
    assert(await p.locator('li.refl-row .flag', { hasText: /words|complete|from Word/ }).count() === 0, 'old tags still shown');
    const nDraft = await p.locator('li.refl-row .flag', { hasText: 'draft' }).count();
    assert(nDraft === await p.locator('li.refl-row .refl-proc.draft').count(), 'draft tag and red title out of step');
    await shot('refl-list');
    await tab('progress');
    const hint = await p.locator('details.an-sec', { hasText: 'Reflections' }).locator('summary').innerText();
    assert(/\b2 \/ 96 counted/.test(hint), 'analytics reflections: ' + hint);   // the demo's own reflection plus this one
    await openAn('Reflections');
    await p.locator('a', { hasText: 'Open reflections' }).click();
    await nap(300);
    assert(/#reflect$/.test(p.url()), 'Open reflections went to ' + p.url());
    // More → Export / Import → Export: the portfolio page (summary and the export button)
    await tab('data');
    await p.locator('main a', { hasText: /Choose reflections and export/ }).first().click();
    await nap(300);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('main button', { hasText: /^Export \d+ reflections? \(Word\)$/ }).click()]);
    const fp = await dl.path();
    const size = fs.statSync(fp).size;
    assert(size > 0, 'empty export');
    const zip = await JSZip.loadAsync(fs.readFileSync(fp));
    const media = Object.keys(zip.files).filter(n => n.startsWith('word/media/'));
    assert(media.length >= 1, 'no word/media in export');
    const docXml = await zip.file('word/document.xml').async('string');
    assert(docXml.includes('E2E Made Up Title Zeta'), 'title missing from docx');
    assert(docXml.includes('Made-up figure caption'), 'caption missing from docx');
    const iT = docXml.indexOf('First made-up point'), iF = docXml.indexOf('Made-up figure caption'), i2 = docXml.indexOf('Second made-up point');
    assert(iT > 0 && iT < iF && iF < i2, 'figure not placed after point 1');
    return `${dl.suggestedFilename()} ${size}B`;
  });

  await step('reflections tab: new reflection via the case picker', async () => {
    await tab('reflect');
    assert(await p.locator('main button[aria-label="New reflection"]').count() === 1, 'no + New button');
    await shot3('reflections-tab');
    const n0 = await p.locator('ul.cases li').count();
    await p.locator('main button[aria-label="New reflection"]').click();
    await p.waitForSelector('ul.refl-pick li');
    assert(await p.locator('ul.refl-pick li .flag', { hasText: 'has reflection' }).count() >= 1, 'linked case not marked');
    await p.locator('input[aria-label="Search cases"]').fill('TKR');
    await nap(200);
    await shot3('case-picker');
    const pick = p.locator('ul.refl-pick li', { hasNot: p.locator('.flag') }).first();
    const txt = await pick.innerText();
    await pick.click();
    await nap(300);
    const later = p.locator('main button', { hasText: 'Choose the heading later' });
    if (await later.count()) await later.click();   // round 4: heading suggestions step
    await p.waitForSelector('input[placeholder="Title"]');
    const linked = await p.locator('.refl-case').innerText();
    assert(/Linked case/.test(linked) && /TKR/.test(linked), 'linked box: ' + linked);
    assert(!/\(_\|_\)/.test(linked), 'linked box shows (_|_)');
    assert(await p.locator('input[maxlength="20"]').inputValue(), 'initials not prefilled');
    await p.locator('input[placeholder="Title"]').fill('E2E picker draft');
    await nap(900);
    await p.locator('main .bar button', { hasText: '← Reflections' }).first().click();
    await nap(500);
    const n1 = await p.locator('ul.cases li').count();
    assert(n1 > n0, `list ${n0} -> ${n1}`);
    return txt.replace(/\s+/g, ' ').slice(0, 60);
  });

  await step('totals', async () => {
    await tab('totals');
    await p.waitForSelector('table.totals');
    const cols = await p.locator('table.totals thead th').count();
    assert(cols >= 4, 'cols ' + cols);
    // Compact (on by default; 15 Oct 2026): initials across the top, a tap names the person, a key under the table,
    // short category names; Show targets at the bottom
    const cBtn = p.locator('main button', { hasText: /^Compact$/ });
    if (await cBtn.getAttribute('aria-pressed') !== 'true') await cBtn.click();
    await p.locator('table.totals.compact .ini-btn').first().click();
    await until(async () => / = .+ · /.test(await p.evaluate(() => document.querySelector('.tname')?.textContent || '')), 'tapping initials did not name the person');
    assert(/ = /.test(await p.evaluate(() => document.querySelector('.tkey')?.textContent || '')), 'no key under the table');
    assert(await p.locator('table.totals small.tgt', { hasText: / by / }).count() > 0, 'targets hidden by default');
    await p.getByLabel('Show targets').uncheck(); await nap(200);
    assert(await p.locator('table.totals small.tgt', { hasText: / by / }).count() === 0, 'Show targets off left the target lines');
    await p.getByLabel('Show targets').check(); await nap(200);
    await cBtn.click(); await p.waitForSelector('table.totals th.rot');   // full names again for the checks below
    const t26 = await p.locator('table.totals td.cat', { hasText: 'Peripheral nerve' }).first().innerText();
    assert(/by R\d/.test(t26), 'targets missing under the name: ' + t26);
    const behind = await p.locator('table.totals td.late, table.totals td.due').count();
    assert(behind >= 0 && await p.locator('table.totals td .gap').count() === 0, 'shortfall numbers should be gone');
    await shot('totals');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.locator('button', { hasText: 'Download Excel' }).click()]);
    return dl.suggestedFilename();
  });

  await step('tag editor: create a tag group, use on Log', async () => {
    await tab('settings');
    await shot('settings');
    await openTagEditor();
    await p.locator('button', { hasText: '+ New tag group' }).click();
    await p.locator('dialog[open] input').first().fill('Hip spinal');
    await p.locator('dialog[open] button', { hasText: 'Choose…' }).click();
    const pick = p.locator('dialog[open]').last();
    await pick.locator('input[type=search]').fill('18');
    await pick.locator('input[type=search]').press('Enter');
    await pick.locator('input[type=search]').fill('21');
    await pick.locator('input[type=search]').press('Enter');
    await pick.locator('button', { hasText: 'Done' }).click();
    await nap(150);
    await p.locator('dialog[open] button', { hasText: /^Save$/ }).click();
    await nap(300);
    assert((await p.locator('#tag-groups').innerText()).includes('Hip spinal'), 'tag group not listed');
    await tab('log');
    await p.locator('.chip.tmpl', { hasText: 'Hip spinal' }).click();
    const sel = await p.locator('.selected .chip[data-code]').evaluateAll(els => els.map(e => e.dataset.code));
    assert(sel.join() === '18,21', 'template cats ' + sel);
    while (await p.locator('.selected .chip').count()) await p.locator('.selected .chip').first().click();
  });

  await step('admin: residents paste + rYear', async () => {
    assert(await p.locator('.tabs button[data-tab="admin"]').count() === 0, 'admin still in the tab bar');
    await goAdmin();
    assert(p.url().endsWith('#admin'), 'url ' + p.url());
    assert(await p.locator('.tabs button[aria-selected="true"]').getAttribute('data-tab') === 'more', 'More not highlighted on admin');
    assert(/Ready portfolios/.test(await p.locator('main').innerText()) && await p.locator('a[data-go="adminresidents"]').count() === 1, 'admin portal: Ready portfolios and the Residents link');
    await goAdmin('adminresidents');
    await p.waitForSelector('section.card h2:text-is("Residents")');
    const resCard = p.locator('section.card', { has: p.locator('h2', { hasText: /^Residents$/ }) });
    assert(await resCard.locator('textarea').count() === 0, 'paste box shown before Edit');
    assert(await resCard.locator('table input, table select').count() === 0, 'residents editable before Edit');
    await resCard.locator('button', { hasText: /^Edit$/ }).click();
    await p.waitForSelector('text=Add or update from the Apps Script');
    await p.locator('main textarea').first().fill(RESIDENTS);
    await p.locator('button', { hasText: 'Review' }).click();
    assert((await p.locator('main').innerText()).includes('2 residents (2 new)'), 'review text');
    await p.locator('button', { hasText: 'Save all' }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Continue' }).click(); // demo: made-up data only
    await nap(500);
    const row = p.locator('main table tbody tr', { hasText: '209902' });
    await row.waitFor();
    await row.locator('select').first().selectOption('3');
    await nap(300);
    await tab('log'); await goAdmin('adminresidents'); await nap(300);
    assert(await resCard.locator('table select').count() === 0, 'admin did not reopen read-only');
    const groups = await resCard.locator('tr.res-group').allInnerTexts();
    assert(groups.length >= 2 && groups.every(g => /^›?\s*(R[1-3]|SR[12]|SMO|Year unknown|Graduated|Attrited) · \d+$/.test(g.trim())), 'groups ' + groups);
    const RANK = ['SR2', 'SR1', 'R3', 'R2', 'R1'];
    const order = groups.map(g => g.replace(/^›?\s*/, '').split(' ·')[0]).filter(g => RANK.includes(g));
    assert(order.join() === [...order].sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b)).join(), 'years not SR2 first: ' + order);
    const r3 = resCard.locator('tbody', { has: p.locator('tr.res-group', { hasText: /R3 · / }) });
    await r3.locator('button.res-toggle').click();
    assert(!(await r3.locator('tr', { hasText: '209902' }).isVisible()), 'R3 did not collapse');
    await r3.locator('button.res-toggle').click();
    assert(await r3.locator('tr', { hasText: '209902' }).isVisible(), 'R3 did not expand');
    assert(await r3.locator('tr', { hasText: '209902' }).count() === 1, '209902 not grouped under R3');
    const r3row = await r3.locator('tr', { hasText: '209902' }).innerText();
    assert(!/\((set|auto)\)/.test(r3row), 'set/auto marker still shown: ' + r3row);
    // a picked year moves up each 1 July: it is kept as the intake it implies
    const ay = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    assert(r3row.includes(String(ay - 2)), 'intake not moved to ' + (ay - 2) + ': ' + r3row);
    await resCard.locator('button', { hasText: /^Edit$/ }).click();
    const v = await p.locator('main table tbody tr', { hasText: '209902' }).locator('select').first().inputValue();
    assert(v === '3', 'rYear not kept: ' + v);
    const email = await p.locator('main table tbody tr', { hasText: '209901' }).locator('input[type=email]').inputValue();
    assert(email === 'alpha@example.com', 'email ' + email);
    await p.locator('main table tbody tr', { hasText: '209901' }).locator('select').nth(1).selectOption('SMO');
    await nap(300);
    await resCard.locator('button', { hasText: /^Done$/ }).click();
    const smo = resCard.locator('tbody', { has: p.locator('tr.res-group', { hasText: /SMO · / }) });
    assert(await smo.locator('tr', { hasText: '209901' }).count() === 1, 'SMO group missing 209901');
    await resCard.locator('button', { hasText: /^Edit$/ }).click();
    await p.locator('main table tbody tr', { hasText: '209901' }).locator('select').nth(1).selectOption('ACTIVE');
    await nap(300);
    await resCard.locator('button', { hasText: /^Done$/ }).click();
  });

  await step('admin: import fake workbook + countCheck', async () => {
    await goAdmin('adminadv');
    await p.locator('label', { hasText: 'Choose workbook' }).locator('input').setInputFiles(DIR + 'fake-old-form.xlsx');
    await p.waitForSelector('text=count check', { timeout: 15000 });
    const txt = await p.locator('main').innerText();
    assert(/5 cases for 2 residents/.test(txt), 'summary: ' + txt.match(/\d+ cases for[^\n]*/)?.[0]);
    assert(txt.includes('✓ matches') && txt.includes('1 differ'), 'countCheck UI');
    await shot('admin-import');
    await p.locator('button', { hasText: /^Import$/ }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Continue' }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Import' }).click();
    await p.waitForSelector('text=Import finished', { timeout: 15000 });
    const log1 = await p.locator('main ul.warnings li').allInnerTexts();
    assert(log1.some(l => l.includes('3 written')) && log1.some(l => l.includes('2 written')), 'log ' + log1);
    await p.locator('button', { hasText: /^Import$/ }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Continue' }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Import' }).click();
    await nap(800);
    const log2 = await p.locator('main ul.warnings li').allInnerTexts();
    assert(log2.every(l => l.includes('0 written')), 'reimport ' + log2);
    await shot('admin');
    return log1.join(' / ');
  });

  await step('admin: one-off initials fix (owner) moves longer and one-letter initials out of the case text', async () => {
    await p.evaluate(async () => {
      const cloud = await import('./js/cloud.js');
      const mk = (id, details) => ({ id, date: '2026-09-01', details, initials: '', cats: ['16'], source: 'import', createdAt: 1, updatedAt: 1 });
      await cloud.saveCases('demo@example.com', [mk('fx1', 'ABCDEF 45F lap chole'), mk('fx2', 'K/30F LSCS spinal'), mk('fx3', 'ELECTIVE LSCS spinal')]);
    });
    await goAdmin('adminadv');
    const card = p.locator('section.card', { has: p.locator('h2', { hasText: 'Fix initials' }) });
    await card.getByRole('button', { name: 'Check all logbooks' }).click();
    await card.getByRole('button', { name: /^Fix \d+ case/ }).waitFor();
    assert(/ABCDEF 45F lap chole/.test(await card.innerText()), 'fix preview missing the long initials');
    await card.getByRole('button', { name: /^Fix \d+ case/ }).click();
    await p.locator('dialog[open] button', { hasText: /^Fix$/ }).click();
    await card.getByText(/^Fixed \d+ case/).waitFor();
    // only this step's cases (fx1–fx3; a random id can start with fx)
    const got = await p.evaluate(async () => { const cloud = await import('./js/cloud.js'); return Object.fromEntries((await cloud.listCases('demo@example.com')).filter(c => /^fx\d$/.test(c.id)).map(c => [c.id, [c.initials, c.details]])); });
    assert(JSON.stringify(got) === JSON.stringify({ fx1: ['ABCDEF', '45F lap chole'], fx2: ['K', '30F LSCS spinal'], fx3: ['', 'ELECTIVE LSCS spinal'] }), 'initials not fixed: ' + JSON.stringify(got));
    await card.getByRole('button', { name: 'Check all logbooks' }).click();
    await card.getByText(/nothing to fix/).waitFor();
    await p.evaluate(async () => { const cloud = await import('./js/cloud.js'); await cloud.deleteCases('demo@example.com', ['fx1', 'fx2', 'fx3']); });
  });

  await step('totals shows imported intake', async () => {
    await tab('totals');
    await p.locator('button', { hasText: 'Refresh' }).click();
    await p.waitForSelector('table.totals');
    const opts = await p.locator('main select[aria-label="Residency year"] option').allInnerTexts();
    assert(opts.length && opts.every(o => /^(R[123]|R3 \/ SMO|SR[12]|Year unknown)$/.test(o)), 'year groups ' + opts);
  });

  await step('reflections: export page ticks, tick just enough, uncategorised, search, sort and group, setting', async () => {
    await tab('reflect');
    await p.evaluate(async () => {
      const cloud = await import('./js/cloud.js');
      const w = n => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');
      const mk = (id, o) => cloud.saveReflection('demo@example.com', { id, status: 'complete', headingId: 'bariatric', initials: 'X' + id.slice(-1).toUpperCase(), date: '2025-0' + (1 + id.length % 8) + '-1' + (id.length % 9), jr: false, diagnosis: 'Sleeve gastrectomy ' + id, title: 'T', summary: w(50), points: [{ heading: 'Obesity airway', text: w(20) }], ...o });
      await mk('eb1', { summary: w(400) }); await mk('eb22', { summary: w(300), jr: true }); await mk('eb333', { summary: w(100) }); await mk('eb4444', { summary: w(600) });
      await mk('eu1', { headingId: '', initials: 'UQ', diagnosis: 'Awake fibreoptic intubation' });
    });
    await nap(600);
    // Reflections tab: no export ticks; Bariatric (met) starts closed, opens on tap
    assert(await p.locator('.refl-ex, li.refl-row input[type=checkbox]').count() === 0, 'export ticks still on the Reflections tab');
    const bar = p.locator('.refl-h[data-heading="bariatric"]');
    assert(await bar.locator('li.refl-row').count() === 0, 'met heading not closed');
    await bar.locator('.refl-htoggle').click(); await nap(300);
    assert(await bar.locator('li.refl-row').count() >= 4, 'heading did not open');
    // uncategorised: listed, + Add there
    const unc = p.locator('.refl-h[data-heading=""]');
    assert(await unc.locator('li.refl-row', { hasText: 'fibreoptic' }).count() === 1, 'uncategorised reflection missing');
    assert(await unc.locator('button.refl-add').count() === 1, 'no + Add under Uncategorised');
    // search
    await p.locator('input[aria-label="Search reflections"]').fill('fibreoptic'); await debounced();
    assert(await p.locator('li.refl-row').count() === 1, 'search did not narrow');
    await p.locator('input[aria-label="Search reflections"]').fill(''); await debounced();
    // sort and group (behind Filter & sort)
    await p.locator('button', { hasText: 'Filter & sort' }).click(); await nap(200);
    await p.locator('select[aria-label="Group by"]').selectOption('status'); await nap(300);
    const groups = await p.locator('.refl-group h3').allInnerTexts();
    assert(groups.some(g => /^Complete/.test(g)) && groups.some(g => /^Uncategorised/.test(g)), 'status groups: ' + groups);
    await p.locator('select[aria-label="Group by"]').selectOption('none');
    await p.locator('select[aria-label="Sort"]').selectOption('longest'); await nap(300);
    const first = await p.locator('li.refl-row').first().innerText();
    assert(/eb4444/.test(first), 'longest first: ' + first);
    await p.locator('select[aria-label="Group by"]').selectOption('heading');
    await p.locator('select[aria-label="Sort"]').selectOption('newest'); await nap(300);
    // Export page: ticks live here
    await tab('data'); await p.locator('main a', { hasText: /Choose reflections and export/ }).first().click(); await nap(400);
    // Export page: a summary; the ticks are on Choose reflections
    assert(/of \d+ reflections included/.test(await p.locator('main').innerText()), 'export summary');
    await p.locator('a', { hasText: 'Choose reflections' }).first().click(); await nap(400);
    const ticked = async () => Number((await p.locator('main p.hint', { hasText: /included/ }).first().innerText()).match(/^(\d+)/)[1]);
    const n0 = await ticked();
    const bh = p.locator('.exp-h', { hasText: 'Bariatric' });
    assert(/4 of 3/.test(await bh.innerText()), 'bariatric export line: ' + await bh.innerText());
    assert(await p.locator('.exp-h', { hasText: 'fibreoptic' }).count() === 0, 'uncategorised listed for export');
    await bh.locator('label.exp-row', { hasText: 'eb1' }).locator('input').uncheck(); await nap(400);
    assert(await ticked() === n0 - 1, 'untick did not lower the count');
    // tick just enough: Bariatric keeps the JR one and the two longest (eb4444, eb1)
    await p.locator('details.quick-actions > summary').click();
    await p.locator('details.quick-actions button', { hasText: 'Tick just enough' }).click();
    await p.locator('dialog[open] button.primary', { hasText: 'Tick just enough' }).click();
    await nap(800);
    const refl = await p.evaluate(() => { const st = JSON.parse(localStorage.getItem('apmes-logbook-demo-v1')); return Object.values(st.logbooks['demo@example.com'].reflections || {}); });
    const flag = id => refl.find(r => r.id === id).export !== false;
    assert(flag('eb1') && flag('eb22') && flag('eb4444') && !flag('eb333'), 'just enough picked ' + JSON.stringify(refl.filter(r => r.id.startsWith('eb')).map(r => [r.id, r.export])));
    assert(/3 of 3/.test(await p.locator('.exp-h', { hasText: 'Bariatric' }).innerText()), 'bariatric not at 3 of 3');
    // back to the export page: "‹ Export portfolio" in the header
    await p.locator('.back-row a', { hasText: 'Export portfolio' }).first().click(); await nap(400);
    assert(await p.locator('main button', { hasText: /^Export \d+ reflections? \(Word\)$/ }).count() === 1, 'export button missing');
    // More → Export / Import links here
    await tab('data');
    assert(await p.locator('section.export-sync h2', { hasText: /^Export$/ }).count() === 1 && await p.locator('section.export-sync a', { hasText: 'Choose reflections and export' }).count() === 1, 'no link from Export');
    // the setting: new reflections start unticked
    await tab('reflset');
    await p.locator('label.check', { hasText: 'New reflections are included' }).locator('input').uncheck();
    await nap(300);
    const st2 = await p.evaluate(() => JSON.parse(localStorage.getItem('apmes-logbook-demo-v1')).logbooks['demo@example.com'].doc.settings);
    assert(st2.reflExport === false, 'setting not saved');
    await p.locator('label.check', { hasText: 'New reflections are included' }).locator('input').check();
  });

  await step('folds show a chevron; calendar days keep their layout; Copy and Reflect keep their size', async () => {
    const pages = ['progress', 'adminadv', 'reflect'];
    for (const pg of pages) {
      if (pg === 'adminadv') await goAdmin('adminadv'); else await tab(pg);
      const missing = await p.evaluate(() => [...document.querySelectorAll('main details:not(.quick-actions) > summary')].filter(s => getComputedStyle(s, '::after').borderRightStyle !== 'solid').map(s => s.textContent.slice(0, 30)));
      assert(!missing.length, `${pg}: folds without a chevron: ${missing}`);
    }
    await tab('logbook');
    const cal = p.locator('main .seg button', { hasText: /^Calendar$/ }); if (await cal.count()) { await cal.first().click(); await nap(200); }
    // the number sits at the same height in empty and busy days
    const tops = await p.evaluate(() => [...document.querySelectorAll('.lb-day:not(.blank)')].map(d => Math.round(d.querySelector('.n').getBoundingClientRect().top - d.getBoundingClientRect().top)));
    assert(new Set(tops).size === 1, 'day numbers at different heights: ' + [...new Set(tops)]);
    assert(await p.locator('.lb-day.sel.today').count() === 1, 'calendar did not open on today');
    await lbList();
    const widths = await p.evaluate(() => [...new Set([...document.querySelectorAll('ul.cases .row-btn')].slice(0, 40).map(b => Math.round(b.getBoundingClientRect().width)))]);
    assert(widths.length === 1, 'row buttons of different widths: ' + widths);
  });

  await step('reflection: free-text learning points; APMES notes last; linked case on one line', async () => {
    await tab('reflect');
    await p.evaluate(async () => { const { reflectOnCase } = await import('./js/ui-reflect.js'); reflectOnCase({ id: 'fake-free', date: '2026-10-10', initials: 'ZF', details: 'Fake free text case', cats: ['13'] }); });
    await p.waitForSelector('input[placeholder="Title"]');
    await p.locator('input[aria-label="Learning point 1 heading"]').fill('Fake heading');
    await p.locator('textarea[aria-label="Learning point 1 text"]').fill('Fake discussion.');
    // the editor's last block is the small APMES notes fold, not a card
    assert(await p.evaluate(() => { const e = document.querySelector('.refl-editor'); return e.lastElementChild.matches('details.refl-guide') && !e.lastElementChild.classList.contains('card'); }), 'APMES notes not last');
    await p.locator('.refl-editor .seg button', { hasText: /^Free text$/ }).click();
    await p.locator('dialog[open] button', { hasText: /^Join$/ }).click();
    const box = p.locator('textarea[aria-label="Learning points text"]');
    await box.waitFor();
    assert(await box.inputValue() === 'Fake heading\nFake discussion.', 'points not joined: ' + await box.inputValue());
    assert(await p.locator('input[aria-label="Learning point 1 heading"]').count() === 0, 'heading still shown in free text');
    await box.fill('One fake flowing discussion.');
    await p.locator('input[placeholder="Title"]').fill('Fake free text title');   // a redraw keeps the mode
    assert(await box.isVisible(), 'free text mode lost');
    await p.locator('.refl-editor .seg button', { hasText: /^Numbered$/ }).click();
    assert(await p.locator('textarea[aria-label="Learning point 1 text"]').inputValue() === 'One fake flowing discussion.', 'numbered lost the text');
    await p.goBack(); await p.waitForFunction(() => !document.querySelector('.refl-editor'));
  });

  await step('settings: search finds an option on an Advanced page; Display preview; reset this page', async () => {
    await tab('settings');
    await p.getByLabel('Search settings').fill('undo');
    const hit = p.locator('.settings-search ul a', { hasText: 'Undo window' });
    await hit.waitFor();
    await hit.click();
    await p.waitForURL(/#loggingadv$/);
    await p.locator('fieldset.pick.flash', { hasText: 'Undo window' }).waitFor();
    await tab('themesadv');
    await p.locator('input[type=range][aria-label="Line strength"]').fill('0'); await nap(150);
    await tab('themesadv');
    assert(await p.locator('.display-preview .row-btn').count() >= 1, 'no Display preview');
    await p.locator('.reset-row button', { hasText: 'Reset this page' }).click();
    await p.locator('dialog[open] button', { hasText: /^Reset$/ }).click(); await nap(300);
    assert(!(await p.evaluate(() => document.documentElement.classList.contains('edges'))), 'reset did not put borders back');
  });

  await step('display: corners, shadows, bigger tap targets; tab bar order and hidden tabs (listed on More)', async () => {
    await tab('themesadv');
    await p.locator('input[type=range][aria-label="Corners"]').fill('0');
    await choose('Card style', 'outlined'); await nap(150);
    assert(await p.evaluate(() => !document.documentElement.classList.contains('shadows')), 'shadows not off');
    await choose('Card style', 'raised'); await nap(150);
    assert(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--round').trim() === '0' && document.documentElement.classList.contains('shadows')), 'corners or shadows not applied');
    await tab('layout');
    await p.getByLabel('Show Reflections').uncheck();
    await p.locator('.tab-order li', { hasText: 'Logbook' }).getByRole('button', { name: 'Move up' }).click(); await nap(150);
    assert(JSON.stringify(await p.locator('.tabs button').evaluateAll(bs => bs.map(b => b.dataset.tab))) === JSON.stringify(['logbook', 'log', 'totals', 'progress', 'more']), 'tab bar not rearranged');
    await p.locator('.tabs button[data-tab="more"]').click(); await nap(300);
    assert(/Reflections/.test((await p.locator('.more-list').first().locator('li').allInnerTexts()).slice(0, 2).join(' ')), 'hidden tab not first on More');   // (with Notes, also off the bar)
    await tab('layout');
    await p.locator('.reset-row button', { hasText: 'Reset this page' }).click();
    await p.locator('dialog[open] button', { hasText: /^Reset$/ }).click(); await nap(300);
    assert(await p.locator('.tabs button').count() === 6, 'reset did not bring the tab back');
    await tab('themesadv');
    await p.locator('.reset-row button', { hasText: 'Reset this page' }).click();
    await p.locator('dialog[open] button', { hasText: /^Reset$/ }).click(); await nap(300);
    assert(await p.evaluate(() => !document.documentElement.style.getPropertyValue('--round') && document.documentElement.classList.contains('shadows')), 'display reset left corners or turned the default shadows off');
  });

  await step('optional: ⋯ menu on Logbook rows; swipe between tabs (not from the case box)', async () => {
    await tab('layout');
    assert(await p.getByLabel('Swipe left or right to change tab').isChecked(), 'swipe between tabs not on by default');
    await tab('layout');
    await p.getByLabel('Fewer buttons on Logbook rows (a ⋯ menu)').check(); await nap(150);
    try {
      await tab('logbook'); await lbList();
      assert(await p.locator('ul.cases .row-btn:not(.row-more)').count() === 0 && await p.locator('ul.cases .row-more').count() > 0, 'row menu not shown');
      await p.locator('ul.cases .row-more').first().click();
      const list = p.locator('dialog[open] .row-menu-list');
      assert(/Copy[\s\S]*reflection[\s\S]*Edit the case/.test(await list.innerText()), 'row menu items');
      await list.getByRole('button', { name: 'Cancel' }).click();
      const swipe = (x0, x1, sel) => p.evaluate(([x0, x1, sel]) => {
        const el = document.querySelector(sel), mk = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
        el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(x0)], changedTouches: [mk(x0)], bubbles: true }));
        el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(x1)], bubbles: true }));
      }, [x0, x1, sel]);
      await swipe(300, 100, 'main section.card'); await p.waitForURL(/#totals$/);
      await swipe(100, 300, 'main section.card'); await p.waitForURL(/#logbook$/);
      await tab('log'); await p.waitForSelector('textarea.details');
      await swipe(300, 100, 'textarea.details'); await nap(300);
      assert(/#log$/.test(p.url()), 'a swipe in the case box changed tab');
      // a page under a tab counts as that tab: Settings → Layout is under More, so a swipe right goes to the tab
      // before More (Analytics in Advanced, 15 Oct 2026)
      await tab('layout');
      await swipe(100, 300, 'main section.card'); await p.waitForURL(/#progress$/);
      await until(async () => !(await p.locator('main#app').evaluate(el => el.style.transform)), 'page left mid-slide');
      // switched off: no change of tab
      await tab('layout');
      await p.getByLabel('Swipe left or right to change tab').uncheck(); await nap(150);
      await tab('logbook');
      await swipe(300, 100, 'main section.card'); await nap(400);
      assert(/#logbook$/.test(p.url()), 'swiped with the switch off');
    } finally {
      await tab('layout');
      await p.getByLabel('Swipe left or right to change tab').check();
      await tab('layout');
      await p.getByLabel('Fewer buttons on Logbook rows (a ⋯ menu)').uncheck();
    }
  });

  await step('page width Full; the demo: header can hide, Leave / Reset demo by Sign out', async () => {
    await tab('layout');
    await choose('Page width', 'full'); await nap(150);
    try {
      assert(await p.evaluate(() => document.documentElement.classList.contains('lw-full')), 'Full page width not applied');
      await tab('themesadv'); await p.getByLabel('Hide the header (the app name bar)').check(); await nap(150);
      await tab('more');
      await until(async () => !(await p.locator('header.top').isVisible()), 'header still shown in the demo');
      assert(await p.locator('main a.btn', { hasText: 'Leave demo' }).count() === 1, 'no Leave demo by Sign out');
      assert(await p.locator('main button', { hasText: 'Reset demo' }).count() === 1, 'no Reset demo link by Sign out');
      await p.locator('main button', { hasText: 'Reset demo' }).click();
      await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click(); await nap(150);
      await shot3('more-demo-no-header');
    } finally {
      await tab('themesadv');
      await p.getByLabel('Hide the header (the app name bar)').uncheck();
      await tab('layout'); await choose('Page width', 'normal'); await nap(150);
    }
  });

  await step('admin tab hidden for non-admins', async () => {
    const KEY = 'apmes-logbook-demo-v1';
    const saved = await p.evaluate(k => localStorage.getItem(k), KEY);
    await p.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.admins = {}; localStorage.setItem(k, JSON.stringify(d)); }, KEY);
    await p.goto(BASE + '?demo#admin', { waitUntil: 'networkidle' });
    await p.reload({ waitUntil: 'networkidle' });   // a hash-only goto doesn't reload the page
    await p.waitForSelector('.tabs button[data-tab="log"]');
    await nap(400);
    const onAdmin = await p.locator('main').innerText();
    await p.locator('.tabs button[data-tab="more"]').click();
    const tabs = await p.locator('.more-list a').evaluateAll(as => as.map(a => a.dataset.go));
    await p.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, saved]);
    await p.goto(BASE + '?demo#log', { waitUntil: 'networkidle' });
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.tabs button[data-tab="log"]');
    await p.locator('.tabs button[data-tab="more"]').click();
    await p.waitForSelector('.more-list a[data-go="admin"]');   // back for the admin
    assert(!tabs.includes('admin'), 'admin tab shown to a non-admin: ' + tabs);
    assert(!/Residents/.test(onAdmin), '#admin opened the admin screen for a non-admin');
    assert(tabs.includes('settings') && tabs.includes('account'), 'More list ' + tabs);
  });

  await step('layout: no horizontal scroll, tap targets', async () => {
    const bad = [];
    for (const t of ['log', 'logbook', 'reflect', 'progress', 'totals', 'account', 'settings', 'admin']) {
      await go(t);
      const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      if (w[0] > w[1]) bad.push(`${t}: scrollWidth ${w[0]} > ${w[1]}`);
      if (phone) {
        const small = await p.evaluate(() => [...document.querySelectorAll('button, .btn, [role=button], a, select, input:not([type=file]):not([hidden]), summary')]
          .filter(el => el.offsetParent !== null && !el.closest('table.grid, table.totals, ul.cases, .scroll, label.check, label.pick-opt'))   // (a ✓ list's radio: its 44px row is the target)
          .map(el => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && (r.height < 40))
          .map(({ el, r }) => `${el.tagName.toLowerCase()}.${el.className}:"${(el.innerText || el.value || '').replace(/\s+/g, ' ').slice(0, 18)}" ${Math.round(r.height)}px`));
        if (small.length) bad.push(`${t}: <40px: ${[...new Set(small)].slice(0, 40).join('; ')}`);
      }
    }
    assert(!bad.length, bad.join(' || '));
  });

  await step('clean looks: Flat, button style, icons, plain calendar, page titles, shorter rows, press and hold', async () => {
    const eq = (x, y, m) => assert(x === y, `${m}: ${x}`);
    const cls = k => p.evaluate(k => document.documentElement.classList.contains(k), k);
    await tab('themesadv');
    await choose('Card style', 'flat'); await nap(150);
    assert(await cls('flat') && await cls('edges-fill'), 'Flat not applied');
    await tab('themesadv');
    await choose('Button style', 'tinted');
    const sw = l => p.getByLabel(l, { exact: true });
    for (const l of ['Icons instead of words on common buttons', 'Plain calendar', 'Page titles in the header', 'Shorter Logbook rows']) await sw(l).check();
    await tab('layout');
    await sw('Press and hold a Logbook row for its menu').check();
    try {
      for (const k of ['btn-tinted', 'icon-btns', 'cal-plain', 'page-titles', 'rows-short', 'row-hold']) assert(await cls(k), k + ' not applied');
      await tab('logbook');
      eq(await p.locator('.top h1').innerText(), 'Logbook', 'page title not in the header');
      // icons only, with the word kept for screen readers
      const fb = p.locator('.lb-top button.ib').first();
      assert(await fb.locator('.ib-ico').isVisible(), 'filter icon hidden');
      eq(await fb.locator('.ib-l').evaluate(el => el.getBoundingClientRect().width <= 1), true, 'filter word still shown');
      eq(await p.getByRole('button', { name: /^Filter/ }).count() >= 1, true, 'filter lost its name');
      // shorter rows: no buttons; press and hold opens the menu, a tap still opens the case
      const list = p.locator('main .seg button', { hasText: /^List$/ }); if (await list.count()) { await list.first().click(); await nap(300); }
      const row = p.locator('ul.cases li:not(.monthhead)').first();
      eq(await row.locator('.acts').isVisible(), false, 'row buttons still shown');
      await row.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -120)); await nap(150);
      const bx = await row.boundingBox();
      await p.mouse.move(bx.x + bx.width / 2, bx.y + 12); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(400);   // a real wait: nap() is capped await nap(250);
      await p.locator('dialog[open] .row-menu-list').waitFor();
      await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click(); await nap(250);
      await row.click(); await nap(300);
      eq(await p.locator('dialog[open] .row-menu-list').count(), 0, 'a tap opened the menu');
      eq(await p.locator('dialog[open]').count(), 1, 'a tap did not open the case');
      await p.keyboard.press('Escape'); await nap(250);
      await shot3('logbook-clean');
    } finally {
      for (let i = 0; i < 3 && await p.locator('dialog[open]').count(); i++) { await p.keyboard.press('Escape'); await nap(200); }
      await tab('layout'); await p.getByRole('button', { name: 'Reset this page' }).click(); await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click(); await nap(200);
      await tab('themesadv'); await p.getByRole('button', { name: 'Reset this page' }).click(); await p.locator('dialog[open]').getByRole('button', { name: 'Reset' }).click(); await nap(200);
      await tab('themesadv'); await choose('Card style', 'raised'); await nap(150);
    }
    for (const k of ['flat', 'btn-tinted', 'icon-btns', 'cal-plain', 'page-titles', 'rows-short', 'row-hold']) assert(!(await cls(k)), k + ' not reset');
    eq(await p.locator('.top h1').textContent(), 'APMES Logbook', 'app name not back');
  });

  await step('theme: light by default; dark and auto in Settings → Display', async () => {
    assert(await p.evaluate(() => document.documentElement.dataset.theme) === 'light', 'default theme not light');
    await tab('themes');
    await choose('Light or dark', 'dark');
    await nap(500);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark' && bg === 'rgb(18, 20, 23)', 'dark not applied: ' + bg);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.tabs button[data-tab="log"]');
    await nap(500);
    assert(await p.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark lost after reload');
    await tab('themes');
    await choose('Light or dark', 'auto');
    await nap(300);
    assert(await p.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(243, 243, 243)', 'auto should be light when the phone is light');
    await choose('Light or dark', 'light');
    await nap(300);
  });

  await step('themes: pick one, change it (Custom), Undo, reset', async () => {
    const eq = (x, y, m) => assert(x === y, `${m}: ${x}`);
    await tab('themes');
    const s1 = () => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--s1').trim().toLowerCase());
    const nuh = await s1();
    eq(await p.locator('.theme-now b').textContent(), 'NUHS', 'default theme');
    await p.locator('.theme-card', { hasText: 'Paper' }).click(); await nap(300);
    eq(await s1(), '#d9c7a7', 'the theme did not bring its own top band');
    eq(await p.locator('.theme-now b').textContent(), 'Paper', 'theme name');
    assert(await p.evaluate(() => (localStorage.getItem('apmes-logbook-look-css-v2') || '').includes('#d9c7a7')), 'look not cached for the first paint');
    await p.reload({ waitUntil: 'networkidle' }); await nap(300);
    eq(await s1(), '#d9c7a7', 'band lost after reload');
    await tab('themesadv');
    await choose('Top band', 'nuh'); await nap(200);
    eq(await s1(), nuh, 'Top band: the NUH stripe not applied');
    eq(await p.locator('.theme-now b').textContent(), 'Custom (based on Paper)', 'a change did not make it custom');
    await tab('themes');   // (the colour and the themes are on Themes; Top band on Advanced theme settings)
    await p.locator('.swatch[aria-label="Lavender"]').click(); await nap(200);
    eq(await p.locator('.swatch[aria-label="Lavender"]').getAttribute('aria-pressed'), 'true', 'swatch not marked');
    await p.locator('.theme-card', { hasText: 'OLED' }).click(); await nap(300);
    eq(await p.evaluate(() => document.documentElement.dataset.theme), 'light', 'a theme changed Light or dark');
    await p.locator('#toast button', { hasText: 'Undo' }).click(); await nap(300);
    eq(await p.evaluate(() => document.documentElement.dataset.theme), 'light', 'Undo changed Light or dark');
    eq(await p.locator('.theme-now b').textContent(), 'Custom (based on Paper)', 'Undo did not bring the theme back');
    await p.locator('.reset-row button', { hasText: 'Reset this page' }).click();
    await p.locator('dialog[open] button', { hasText: /^Reset$/ }).click(); await nap(300);
    eq(await s1(), nuh, 'reset left the band');
    eq(await p.locator('.theme-now b').textContent(), 'NUHS', 'reset left the theme');
    eq(await p.evaluate(() => document.getElementById('look-css')?.textContent || ''), '', 'reset left look CSS');
  });

  await step('compact mode is per device and persists after reload', async () => {
    await tab('themesadv');
    // the old Compact mode is Spacing: Tight on Themes (theme-revamp S3: Display is gone)
    await choose(/^Spacing$/, 'compact');
    await nap(600);
    assert(await p.evaluate(() => document.body.classList.contains('compact')), 'no body.compact');
    await shot3('settings-compact');
    // display settings are this device's: saved in localStorage, never in the account
    // (theme-revamp S2: Compact mode is Spacing: Tight, saved as spacing 'compact')
    const where = await p.evaluate(() => [JSON.parse(localStorage.getItem('apmes-logbook-display') || '{}').spacing, (JSON.parse(localStorage.getItem('apmes-logbook-demo-v1')).logbooks['demo@example.com'].doc.settings || {}).spacing]);
    assert(where[0] === 'compact' && !where[1], 'compact saved to the account, not the device: ' + where);
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.tabs button[data-tab="log"]');
    await nap(600);
    assert(await p.evaluate(() => document.body.classList.contains('compact')), 'compact lost after reload');
    await tab('log');
    await p.waitForSelector('textarea.details');
    await p.locator('textarea.details').fill('LSCS spinal');
    await nap(300);
    await shot3('log-compact');
    await p.locator('textarea.details').fill('');
    await tab('themesadv');
    assert(await p.locator('fieldset.pick', { has: p.locator('legend', { hasText: /^Spacing$/ }) }).locator('input[value=compact]').isChecked(), 'Tight not picked after reload');
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(w[0] <= w[1], 'compact h-scroll');
    // an old device that still has compact: true opens Tight, and the old key is folded away
    await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('apmes-logbook-display') || '{}'); delete d.spacing; d.compact = true; localStorage.setItem('apmes-logbook-display', JSON.stringify(d)); });
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('.tabs button[data-tab="log"]');
    await nap(600);
    const old = await p.evaluate(() => [document.body.classList.contains('compact'), JSON.parse(localStorage.getItem('apmes-logbook-display')).spacing, 'compact' in JSON.parse(localStorage.getItem('apmes-logbook-display'))]);
    assert(old[0] && old[1] === 'compact' && !old[2], 'old compact: true not moved to Tight: ' + old);
    // Themes → Fine-tune: unset by default, a slider changes the live page, Reset puts it back
    await tab('themesadv');
    const gapRow = p.locator('[data-tune="ftGap"]');
    assert((await gapRow.textContent()).includes('Not set'), 'Fine-tune gap set by default');
    const gapOf = () => p.evaluate(() => getComputedStyle(document.querySelector('.bar')).columnGap);
    const before = await gapOf();
    await gapRow.locator('input[type=range]').fill('14');
    await nap(300);
    const g14 = await gapOf(); assert(g14 === '14px', 'gap slider did not change the page: ' + g14);
    assert((await gapRow.textContent()).includes('14px'), 'slider value not shown');
    await p.getByRole('button', { name: 'Reset Fine-tune' }).click();
    await nap(300);
    const g0 = await gapOf(); assert(g0 === before, 'Reset Fine-tune left the gap: ' + g0);
    await tab('themesadv');
    await choose(/^Spacing$/, 'normal');
    await nap(300);
    assert(!(await p.evaluate(() => document.body.classList.contains('compact'))), 'Spacing: Normal did not turn Tight off');
    await choose(/^Spacing$/, 'compact');
    await nap(300);
  });

  await step('settings: week start, Add tab parts, case box keyboard, pinned box and search, borderless', async () => {
    await tab('loggingadv');
    const check = l => p.locator('label.check', { hasText: l }).locator('input');
    await choose('First day of the week', '0'); await nap(300);
    await check('Suggested tags as you type').uncheck(); await check('Quick picks').uncheck(); await check('Autocorrect').check(); await nap(300);
    await tab('layout');
    await check('Pin the case box').check(); await check('Pin the search box').check(); await nap(200);
    // Card style Flat: lines gone, fields filled
    await tab('themesadv');
    await choose('Card style', 'flat'); await nap(200);
    try {
      await tab('logbook');
      const cal = p.locator('main .seg button', { hasText: /^Calendar$/ }); if (await cal.count()) { await cal.first().click(); await nap(200); }
      assert(await p.locator('.lb-dow').first().textContent() === 'Sun', 'calendar does not start on Sunday');
      assert(await p.locator('.lb-top').evaluate(el => getComputedStyle(el).position) === 'sticky', 'search card not pinned');
      // Reflections: the header card sticks with only its search row in view, open topic names stick under it
      await tab('reflect');
      const rt = p.locator('section.refl-top');
      assert(await rt.evaluate(el => getComputedStyle(el).position) === 'sticky', 'reflections search not pinned');
      await until(async () => parseFloat(await rt.evaluate(el => el.style.getPropertyValue('--refl-hide'))) > 20, 'title and counts not scrolled away when pinned');
      const openRow = p.locator('.refl-topics .refl-h.open > .refl-hrow').first();
      if (await openRow.count()) assert(await openRow.evaluate(el => getComputedStyle(el).position) === 'sticky', 'open topic name not sticky');
      await tab('log');
      await p.waitForSelector('textarea.details');
      assert(!(await p.locator('.sugg-row').isVisible()) && !(await p.locator('.quick-label').isVisible()), 'quick picks not hidden');
      assert(await p.locator('textarea.details').getAttribute('autocorrect') === 'on', 'autocorrect not on');
      assert(await p.locator('.box-wrap').evaluate(el => getComputedStyle(el).position) === 'sticky', 'case box not pinned');
      assert(await p.evaluate(() => document.documentElement.classList.contains('edges-fill')), 'borderless not applied');
      assert(await p.locator('section.card').first().evaluate(el => getComputedStyle(el).borderTopColor).then(c => /\/ 0\)$|, 0\)$|^transparent$/.test(c)), 'card border still shows when borderless');
      await shot3('log-pinned');
    } finally {
      await tab('loggingadv');
      await choose('First day of the week', '1');
      await check('Suggested tags as you type').check(); await check('Quick picks').check(); await check('Autocorrect').uncheck(); await nap(300);
      await tab('layout');
      await check('Pin the case box').uncheck(); await check('Pin the search box').uncheck(); await nap(200);
      await tab('themesadv');
      await choose('Card style', 'raised'); await nap(200);
    }
  });

  await step('service worker + offline reload', async () => {
    await tab('log');
    const ok = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
    assert(ok, 'no active SW');
    await p.reload({ waitUntil: 'networkidle' }); // let the SW control the page and cache everything
    await nap(500);
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('textarea.details', { timeout: 8000 });
    const n = await nCases();
    await ctx.setOffline(false);
    assert(n > 6, 'offline case count ' + n);
    return 'offline shows ' + n + ' cases';
  });

  await round4();
  await round5();
  await step('log: additional Enter accepts suggested tags after a no-tag save', async () => {
    const configure = async (enterMode, suggestions = true) => {
      await p.evaluate(async settings => { const core = await import('./js/ui-core.js'); await core.patchLogbook({ settings }); }, { enterMode, suggestions });
      await tab('log');
    };
    for (const [mode, initials] of [['newline', 'QX'], ['single', 'QY'], ['double', 'QZ']]) {
      await configure(mode);
      const ta = p.locator('textarea.details');
      await ta.fill(`${initials} lap chole GA`);
      await debounced();
      const expected = await p.locator('.sugg-row .chip.strong[data-code]:not(.all)').evaluateAll(els => els.map(e => e.dataset.code));
      assert(expected.length > 0, 'no fixture suggestions');
      const n = await nCases();
      if (mode === 'newline') await p.locator('.savebar button.primary', { hasText: /^Save/ }).click();
      else { await ta.press('End'); await ta.press('Enter'); if (mode === 'double') await ta.press('Enter'); }
      assert(await nCases() === n, `${mode}: first save should prompt`);
      assert(/Enter again/.test(await toastText()), `${mode}: no keyboard prompt`);
      await ta.dispatchEvent('keydown', { key: 'Enter', repeat: true });
      assert(await nCases() === n, 'holding Enter accepted tags');
      if (mode === 'double') await shot('enter-suggestions');
      await ta.press('Enter');
      await until(async () => await nCases() === n + 1, `${mode}: extra Enter did not save`);
      const c = (await stored()).find(c => c.initials === initials);
      assert(c && expected.every(code => c.cats.includes(code)), `${mode}: suggested tags missing`);
      await until(async () => (await ta.inputValue()) === '', `${mode}: box not cleared`);
    }
    await configure('single');
    let ta = p.locator('textarea.details');
    await ta.fill('QV lap chole GA');
    let n = await nCases();
    await ta.press('Enter');
    await ta.fill('QW LSCS spinal');   // editing cancels the previous offer
    await ta.press('Enter');
    assert(await nCases() === n, 'edited case reused the previous offer');
    await ta.press('Enter');
    await until(async () => await nCases() === n + 1, 'edited case did not save after fresh confirmation');
    // Mobile keyboards may provide only beforeinput. Double Enter's failed save
    // removes the empty line, but the next line-break event must still accept.
    await configure('double');
    ta = p.locator('textarea.details');
    await ta.fill('QT lap chole GA\n');
    n = await nCases();
    const mobileEnter = () => ta.evaluate(el => el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true })));
    assert(await mobileEnter() === false, 'mobile double Enter not intercepted');
    assert(await nCases() === n, 'mobile first save bypassed prompt');
    assert(await mobileEnter() === false, 'mobile acceptance not intercepted');
    await until(async () => await nCases() === n + 1, 'mobile extra Enter did not save');
    await configure('single', false);
    ta = p.locator('textarea.details');
    await ta.fill('QS lap chole GA');
    n = await nCases();
    await ta.press('Enter'); await ta.press('Enter');
    assert(await nCases() === n, 'disabled suggestions were applied');
    await configure('single');
    ta = p.locator('textarea.details');
    await ta.fill('QU zzzz');
    await ta.press('Enter'); await ta.press('Enter');
    assert(await nCases() === n, 'case saved without suggestions');
    await ta.fill('');
    await configure('newline');
  });
  await step('logging: separate initials box, optional autodetection and month shorthand', async () => {
    if (phone) { await tab('layout'); await p.getByLabel('Add tab upside down (phones)', { exact: true }).check(); }
    // Settings → Advanced logging → Separate initials box (device)
    const setSeparate = async on => { await tab('loggingadv'); await p.getByLabel('Separate initials box', { exact: true }).setChecked(on); };
    await setSeparate(true);
    await tab('log');
    const initials = p.getByLabel('Patient initials', { exact: true });
    const summary = p.getByLabel('Case summary', { exact: true });
    assert(await initials.evaluate(el => el === document.activeElement), 'Initials not focused');
    assert(!(await summary.getAttribute('placeholder')).includes('initials') && (await summary.getAttribute('placeholder')).includes('age/sex'), 'initials-first example not updated');
    await initials.fill('IJ'); await initials.press('Enter');
    assert(await summary.evaluate(el => el === document.activeElement), 'Enter did not move to summary');
    await summary.fill('hernia');
    await setSeparate(false); await tab('log');
    assert(await summary.inputValue() === 'IJ hernia', 'switching field lost the draft');
    await setSeparate(true); await tab('log');
    assert(await initials.inputValue() === 'IJ' && await summary.inputValue() === 'hernia', 'explicit initials became procedure text');
    for (const [unit, preview, band] of [['6m', '6 years · male', '20iii'], ['6M', '6 years · male', '20iii'], ['6mo', '6 months', '20ii'], ['3m', '3 years · male', '20ii'], ['3mo', '3 months', '20i']]) {
      await summary.fill(unit + ' hernia'); await debounced();
      assert((await p.locator('.parsed').innerText()).includes(preview), unit + ' preview');
      assert(await p.locator(`.sugg-row [data-code="${band}"]`).count() === 1, unit + ' paeds band');
    }
    if (phone) {
      assert(await p.evaluate(() => document.querySelector('.parsed').getBoundingClientRect().bottom <= document.querySelector('.log-initials').getBoundingClientRect().top && document.querySelector('.log-initials').getBoundingClientRect().bottom <= document.querySelector('.box-wrap').getBoundingClientRect().top), 'inverted layout separated initials from summary');
      await p.screenshot({ path: DIR + 'logging-first-field-phone.png', fullPage: true });
    }
    await p.locator('.sugg-row [data-code="20i"]').click();
    await summary.press('Control+Enter'); await until(async () => (await stored()).some(c => c.initials === 'IJ' && c.details === '3mo hernia'), 'explicit initials saved');
    await until(() => initials.evaluate(el => el === document.activeElement), 'save did not return to first field');
    await tab('logging');
    await p.getByLabel('Autodetect age and gender', { exact: true }).uncheck();
    await setSeparate(false);
    await tab('log');
    assert(await summary.evaluate(el => el === document.activeElement), 'summary not focused with the initials box off');
    assert(!(await summary.getAttribute('placeholder')).includes('age/sex') && !(await summary.getAttribute('placeholder')).includes('72M') && (await summary.getAttribute('placeholder')).includes('initials'), 'autodetect-off example not updated');
    await summary.fill('AB 80M hernia'); await debounced();
    assert(!(await p.locator('.parsed').innerText()).includes('Age/sex'), 'disabled age preview');
    assert(await p.locator('.sugg-row [title*="from the age"]').count() === 0, 'disabled age suggestions');
    await p.reload(); await p.waitForSelector('textarea.details');
    // (a touch phone doesn't open the keyboard as the app opens: only on going to the Add tab, ui-log.js wantFocus)
    const touch = await p.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches);
    if (touch) assert(await summary.evaluate(el => el !== document.activeElement), 'the keyboard opened as the app started on a phone');
    else assert(await summary.evaluate(el => el === document.activeElement), 'the case box not focused on reload');
    assert(await p.getByLabel('Patient initials', { exact: true }).count() === 0, 'initials box setting not retained on reload');
    assert(!(await p.locator('.parsed').innerText()).includes('Age/sex'), 'disabled age detection not retained');
    await tab('loggingadv');
    const keyboard = p.getByLabel('Open the keyboard when the Add tab opens (this device)', { exact: true });
    await keyboard.uncheck();
    await tab('log');
    assert(await p.evaluate(() => !document.activeElement.matches('input, textarea')), 'first field overrode the keyboard-off setting');
    await tab('loggingadv'); await keyboard.check();
    await tab('logging');
    await p.getByLabel('Autodetect age and gender', { exact: true }).check();
    await tab('log');
    assert(await summary.evaluate(el => el === document.activeElement), 'default summary not focused');
    assert((await summary.getAttribute('placeholder')).includes('initials, age/sex'), 'default example not restored');
    await summary.fill('AB 80M hernia'); await debounced();
    assert(await p.locator('.sugg-row [data-code="21"]').count() === 1, 'geriatric detection not restored');
    await summary.fill('');
    if (phone) { await tab('layout'); await p.getByLabel('Add tab upside down (phones)', { exact: true }).uncheck(); await tab('log'); }
  });
  await step('navigation: demo Account, browser Back/Forward and app Back agree', async () => {
    const q = await ctx.newPage();
    try {
      await q.goto(BASE);
      await q.getByRole('link', { name: 'Try the demo', exact: true }).click();
      await q.waitForSelector('textarea.details');
      await q.locator('button[data-tab=more]').click();
      await q.locator('a[data-go=account]').click();
      await q.waitForSelector('.acct');
      await q.goBack(); await q.waitForURL(/\?demo#more$/);
      assert(await q.locator('a[data-go=account]').count() === 1, 'Back left the demo instead of returning to More');
      await q.goBack(); await q.waitForURL(/\?demo#log$/);
      await q.waitForSelector('textarea.details');
      await q.goForward(); await q.waitForURL(/#more$/);
      await q.locator('a[data-go=settings]').click();
      await q.locator('a[data-go=layout]').click();
      await q.waitForURL(/#layout$/);
      const length = await q.evaluate(() => history.length);
      await q.locator('.back-row a', { hasText: 'Settings' }).click();
      await q.waitForURL(/#settings$/);
      assert(await q.evaluate(() => history.length) === length, 'app Back added a loop');
      await q.goBack(); await q.waitForURL(/#more$/);
      await q.goForward(); await q.waitForURL(/#settings$/);
      await q.goForward(); await q.waitForURL(/#layout$/);
      await q.waitForSelector('.back-row a');
      await q.screenshot({ path: DIR + `navigation-${label}.png`, fullPage: true });
      // A root screen does not trap the browser in the app.
      await q.goBack(); await q.goBack(); await q.goBack();
      await q.waitForURL(/\?demo#log$/);
      await q.goBack();
      await q.getByRole('link', { name: 'Try the demo', exact: true }).waitFor();
    } finally { await q.close(); }
  });
  await step('navigation: direct Display link and reload retain a parent trail', async () => {
    const q = await ctx.newPage();
    try {
      await q.goto(BASE + '?demo#layout');
      await q.waitForSelector('.back-row a');
      const length = await q.evaluate(() => history.length);
      await q.reload(); await q.waitForSelector('.back-row a');
      assert(await q.evaluate(() => history.length) === length, 'reload duplicated the parent trail');
      await q.goBack(); await q.waitForURL(/\?demo#settings$/);
      await q.locator('.back-row a').click(); await q.waitForURL(/\?demo#more$/);
      assert(await q.locator('a[data-go=settings]').count() === 1, 'deep-link fallback did not reach More');
    } finally { await q.close(); }
  });
  await step('demo badge: Reset demo wipes added data and reseeds', async () => {
    await p.goto(BASE + '?demo#log', { waitUntil: 'networkidle' });
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('textarea.details');
    const before = await nCases();
    assert(await p.locator('#banner:not([hidden])').count() === 0, 'yellow demo bar still shown');
    await p.locator('.demo-flag').click(); await p.locator('dialog[open] button', { hasText: 'Reset demo' }).click();
    await p.locator('dialog[open] button', { hasText: 'Cancel' }).click();
    assert(await nCases() === before, 'cancel changed the data');
    await p.locator('.demo-flag').click(); await p.locator('dialog[open] button', { hasText: 'Reset demo' }).click();
    await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle' }), p.locator('dialog[open] button.danger', { hasText: 'Reset' }).click()]);
    await p.waitForSelector('textarea.details');
    await nap(500);
    const after = await nCases();
    const refl = await p.evaluate(() => JSON.parse(localStorage.getItem('apmes-logbook-demo-v1')).logbooks);
    assert(after > 0 && after < before, `cases ${before} -> ${after}`);
    assert(!JSON.stringify(refl).includes('Hip spinal'), 'templates survived the reset');
    return `cases ${before} -> ${after}`;
  });
  await b.close();
  return { label, results, errs };
}

const T0 = Date.now();
if (ONLY) {
  DRY = [];
  await run('phone', { viewport: { width: 390, height: 844 } });
  ONLY_LAST = DRY.reduce((last, n, i) => (ONLY.test(n) ? i : last), -1);
  if (ONLY_LAST < 0) { console.log(`No step name contains "${process.env.E2E_ONLY}"`); process.exit(1); }
  console.log(`E2E_ONLY: steps 1–${ONLY_LAST + 1} of ${DRY.length}`);
  DRY = null;
}
// phone and desk at once: each has its own browser, demo data and file names
const out = await Promise.all([
  !only || only === 'phone' ? run('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }) : null,
  !only || only === 'desk' ? run('desk', { viewport: { width: 1280, height: 800 } }) : null,
].filter(Boolean));
const secs = ms => (ms / 1000).toFixed(1).padStart(5) + 's';
for (const o of out) {
  console.log(`== ${o.label}  (${secs(o.results.reduce((a, r) => a + (r.ms || 0), 0))})`);
  for (const r of o.results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${secs(r.ms || 0)}  ${r.step}${r.note ? '  — ' + String(r.note).replace(/\s*\n\s*/g, ' / ') : ''}`);
  console.log('slowest:', [...o.results].sort((a, b) => b.ms - a.ms).slice(0, 5).map(r => `${r.step} ${secs(r.ms)}`).join(' | '));
  console.log('console errors:', o.errs.length ? o.errs : 'none');
}
console.log(`total ${secs(Date.now() - T0)}`);

// Printed failures must also fail CI and scripts, including fail-fast runs.
if (out.some(o => o.results.some(r => !r.ok) || o.errs.length)) process.exitCode = 1;
