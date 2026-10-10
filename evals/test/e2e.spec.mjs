// End-to-end check of the demo loop across roles, in one browser context (shared localStorage):
// resident requests → assessor completes → resident reads the result → progress; plus Mini-CEX, EBD,
// decline + reassign, validation blocking and no console errors.
//
// Needs Playwright (global install is fine) and a static server for the repo root:
//   http-server /home/user/anawj-site -p 8110 -s &
//   node evals/test/e2e.spec.mjs            (BASE=http://localhost:8110/evals/ by default)
// Set PW_PATH to playwright's folder and CHROMIUM to a browser binary if they aren't found.

import { createRequire } from 'module';
import { existsSync } from 'fs';
import { FORMS } from '../js/forms.js';

const require = createRequire(import.meta.url);
let pw;
for (const p of [process.env.PW_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
  try { pw = require(p); break; } catch { /* next */ }
}
if (!pw) { console.error('Playwright not found: set PW_PATH'); process.exit(2); }
const B = process.env.BASE || 'http://localhost:8110/evals/';
const exe = process.env.CHROMIUM || null;

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (cond) console.log('  ok  ' + msg); else { fails++; console.log('  FAIL ' + msg); } };

const browser = await pw.chromium.launch(exe && existsSync(exe) ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());

const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('apmes-evals-demo-v1')));
const evById = async id => (await store()).evaluations[id];
async function open(role, hash) {
  const q = role === 'resident' ? '?demo' : '?demo=' + role;
  await page.goto(B + q + '#' + hash);
}
let taps = 0;
const tap = async loc => { taps++; await loc.first().click(); };

// Fill every required (visible) question of a form; `skip` leaves some out on purpose.
// Answers: middle of each scale, first option of selects, the exclusive tick for EBD q2.
async function fillForm(formId, { skip = [], text = {} } = {}) {
  for (const sec of FORMS[formId].sections) for (const q of sec.questions) {
    if (skip.includes(q.key)) continue;
    const box = page.locator('#q-' + q.key);
    if (!(await box.isVisible())) continue;
    if (q.type === 'text') {
      if (!q.required && !text[q.key]) continue;
      const v = text[q.key] || 'Clear plan, explained the risks and checked understanding well.';
      await box.locator('textarea').fill(v);      // typing counts as one step, not a tap
      continue;
    }
    if (!q.required) continue;
    if (q.type === 'ninePoint') await tap(box.locator('label:has(input[value="6"])'));
    else if (q.type === 'milestone') await tap(box.locator('label:has(input[value="3"])'));
    else if (q.type === 'supervision') await tap(box.locator('label:has(input[value="3"])'));
    else if (q.type === 'checkboxes') await tap(box.locator('label', { hasText: 'No obvious' }));
    else await tap(box.locator('label'));
    if (formId === 'ebd' && q.key === 'q2') await page.waitForTimeout(50);
  }
}
const submit = () => tap(page.locator('.e-submitbar .e-go'));

// Resident: #new/{itemId} → assessor → case card → Send. Returns the new evaluation id.
async function request(itemId, assessorName, { coManaged = false } = {}) {
  taps = 0;
  await open('resident', 'new/' + itemId);
  await page.waitForSelector('.e-rq-picker');
  const all = page.locator('.e-rq-picker [role=tab]', { hasText: 'All faculty' });
  if ((await all.getAttribute('aria-selected')) !== 'true') await tap(all);
  await tap(page.locator('.e-rq-picker .e-row', { hasText: assessorName }));
  await page.waitForSelector('#rq-initials');
  await tap(page.locator('label.e-choice', { hasText: 'Operating theatre' }));
  await page.fill('#rq-initials', 'AB');
  await tap(page.locator('label.e-choice', { hasText: '41-64' }));
  await tap(page.locator('label.e-choice', { hasText: 'Female' }));
  if (coManaged) await tap(page.locator('.e-rq label.e-check'));
  await tap(page.locator('.e-rq-sendbar button'));
  await page.waitForSelector('text=Request sent', { timeout: 5000 });
  const s = await store();
  const ev = Object.values(s.evaluations).filter(e => e.itemId === itemId && e.status === 'requested').sort((a, b) => b.createdAt - a.createdAt)[0];
  return { id: ev && ev.id, ev, taps };
}

try {
  console.log('setup');
  await page.goto(B + '?demo=reset');
  await page.waitForSelector('#app *');
  ok((await store()).evaluations, 'demo store seeded');

  // ---------- DOPS loop ----------
  console.log('DOPS loop');
  const r1 = await request('DOPS-2-01', 'Dr Demo Faculty');
  ok(r1.id, `resident sent a DOPS request (${r1.taps} taps + initials)`);
  ok(r1.ev?.assessorEmail === 'faculty@example.com' && r1.ev?.formId === 'dops' && r1.ev?.request?.initials === 'AB', 'request has assessor, form and case card');

  await open('assessor', 'pending');
  await page.waitForSelector('.e-pending');
  ok(await page.locator(`.e-pending a[href*="${r1.id}"], .e-pending [data-id="${r1.id}"]`).count() + await page.locator('.e-pending .e-row', { hasText: 'Mask holding' }).count() > 0, 'assessor sees it in Pending');
  await open('assessor', 'e/' + r1.id);
  await page.waitForSelector('.e-form');
  taps = 0;
  await fillForm('dops');
  const dopsTaps = taps;
  await submit();
  await page.waitForSelector('.e-form__sent', { timeout: 5000 });
  const d1 = await evById(r1.id);
  ok(d1.status === 'submitted' && d1.submittedAt, `DOPS submitted (${taps} taps, ${dopsTaps} on answers)`);
  ok(d1.assessment.q3 === 6 && typeof d1.assessment.q1 === 'string' && d1.assessment.q15.length > 0, 'answers stored with the right types');
  ok(d1.metrics && d1.metrics.openedAt && d1.metrics.firstAnswerAt, 'metrics recorded');
  const DOPS_TAPS = taps;

  await open('resident', 'requests');
  await page.waitForSelector('.e-tab');
  ok(/\d/.test(await page.locator('.e-tab[href="#requests"] .e-badge').innerText().catch(() => '')), 'Requests tab shows a badge for the new result');
  await open('resident', 'r/' + r1.id);
  await page.waitForSelector('text=Got it');
  ok(await page.locator('text=Mask holding').count() > 0, 'resident sees the result');
  await page.locator('button', { hasText: 'Got it' }).click();
  await page.waitForFunction(() => location.hash === '#requests');
  ok((await evById(r1.id)).seenAt, 'Got it sets seenAt');

  await open('resident', 'progress');
  await page.waitForSelector('.e-progress-page');
  const epa2 = page.locator('details.e-rq-epa', { has: page.locator('.e-rq-epa__n', { hasText: /^2$/ }) });
  await epa2.locator('summary').click();
  const row = epa2.locator('.e-rq-gitem', { hasText: 'Mask holding' });
  ok((await row.first().locator('.e-rq-gitem__n').innerText()).startsWith('✓'), 'progress ticks the item');

  // ---------- Mini-CEX with validation ----------
  console.log('Mini-CEX + validation');
  const r2 = await request('MINICEX-1-01', 'Dr Demo Faculty');
  ok(r2.id && r2.ev.formId === 'minicex', 'Mini-CEX requested');
  await open('assessor', 'e/' + r2.id);
  await page.waitForSelector('.e-form');
  taps = 0;
  await fillForm('minicex', { skip: ['q5', 'q19'] });
  await submit();
  await page.waitForTimeout(400);
  ok((await page.locator('.e-form__sent').count()) === 0, 'submit blocked with missing required answers');
  const gaps = await page.locator('.e-form__gaps').innerText().catch(() => '');
  ok(/Q5/.test(gaps) && /Q19/.test(gaps), `gaps listed (${gaps.replace(/\s+/g, ' ').slice(0, 60)})`);
  ok((await evById(r2.id)).status === 'requested', 'still requested after the blocked submit');
  await tap(page.locator('#q-q5 label:has(input[value="NA"])'));
  await page.locator('#q-q19 textarea').fill('Good plan.');   // no minimum length
  await submit();
  await page.waitForSelector('.e-form__sent', { timeout: 5000 });
  const m2 = await evById(r2.id);
  ok(m2.status === 'submitted' && m2.assessment.q5 === 'NA', `Mini-CEX submitted (${taps} taps incl. the blocked try)`);
  const MINI_TAPS = taps;

  // ---------- EBD ----------
  console.log('EBD');
  const r3 = await request('EBD-1-02', 'Dr Demo Faculty', { coManaged: true });
  ok(r3.id && r3.ev.request.coManaged === true, 'EBD requested with the co-managed tick');
  await open('assessor', 'e/' + r3.id);
  await page.waitForSelector('.e-form');
  await page.locator('#q-q2 label', { hasText: 'Clinical management plan' }).click();
  ok(await page.locator('#q-q3').isVisible(), 'EBD Q3 shows once an area is ticked');
  await page.locator('#q-q2 label', { hasText: 'Clinical management plan' }).click();
  taps = 0;
  await fillForm('ebd');
  ok(!(await page.locator('#q-q3').isVisible()), 'EBD Q3 hidden with "No obvious areas"');
  await submit();
  await page.waitForSelector('.e-form__sent', { timeout: 5000 });
  const e3 = await evById(r3.id);
  ok(e3.status === 'submitted' && Array.isArray(e3.assessment.q2), `EBD submitted (${taps} taps)`);
  const EBD_TAPS = taps;

  // ---------- decline + reassign ----------
  console.log('decline + reassign');
  const r4 = await request('DOPS-2-02', 'Dr Demo Faculty');
  ok(r4.id, 'second DOPS requested');
  await open('assessor', 'e/' + r4.id);
  await page.waitForSelector('.e-form');
  await page.locator('.e-form__cant').click();
  await page.waitForSelector('dialog[open]');
  await page.locator('dialog label.e-radio', { hasText: /other/i }).click();
  await page.locator('dialog button', { hasText: /^Decline$/ }).click();
  ok(await page.locator('dialog .e-q__error:not([hidden])').count() === 1, '"Other" without a reason is blocked');
  await page.fill('#decline-other', 'On leave that week');
  await page.locator('dialog button', { hasText: /^Decline$/ }).click();
  await page.waitForFunction(() => location.hash.startsWith('#pending'));
  const x4 = await evById(r4.id);
  ok(x4.status === 'declined' && x4.declineReason?.code === 'other' && x4.declinedAt, 'declined with a reason');

  await open('resident', 'r/' + r4.id);
  await page.waitForSelector('text=Send to another assessor');
  await page.locator('button', { hasText: 'Send to another assessor' }).click();
  await page.waitForSelector('dialog[open] .e-rq-picker');
  const allTab = page.locator('dialog .e-rq-picker [role=tab]', { hasText: 'All faculty' });
  if ((await allTab.getAttribute('aria-selected')) !== 'true') await allTab.click();
  ok(await page.locator('dialog .e-rq-picker .e-row', { hasText: 'Dr Demo Faculty' }).count() === 0, 'the declining assessor is not offered again');
  await page.locator('dialog .e-rq-picker .e-row', { hasText: 'Dr Hana Lee' }).click();
  await page.waitForTimeout(400);
  const y4 = await evById(r4.id);
  ok(y4.status === 'requested' && y4.assessorEmail === 'dr.hana.lee@example.com', 'reassigned to a new assessor');

  // ---------- admin smoke ----------
  console.log('admin');
  await open('admin', 'overview');
  await page.waitForSelector('text=Download CSV', { timeout: 5000 });
  ok(true, 'overview renders');
  await open('admin', 'people');
  await page.waitForSelector('.e-admin .e-segment', { timeout: 5000 });
  ok(await page.locator('#app', { hasText: 'Dr Maya Goh' }).count() > 0, 'people: pending application listed');
  await open('admin', 'people/faculty');
  await page.waitForFunction(() => document.querySelector('#app').textContent.includes('Dr Hana Lee'), null, { timeout: 5000 });
  ok(true, 'people: faculty list renders');
  await open('admin', 'more');
  await page.waitForSelector('text=Sign out');
  ok(true, 'more renders');

  // placeholders mean a screen module failed to load
  for (const [role, hash] of [['resident', 'home'], ['resident', 'requests'], ['resident', 'progress'], ['assessor', 'pending'], ['assessor', 'pending/history'], ['resident', 'new']]) {
    await open(role, hash);
    await page.waitForTimeout(300);
    const ph = await page.locator('text=is not ready yet').count();
    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(!ph && scrollX <= 0, `${role} #${hash} renders, no horizontal scroll`);
  }

  console.log(`\ntaps: DOPS ${DOPS_TAPS}, Mini-CEX ${MINI_TAPS} (incl. one blocked submit), EBD ${EBD_TAPS}, resident request ${r1.taps} (+ initials typed)`);
} catch (err) {
  fails++;
  console.log('  FAIL threw: ' + (err.stack || err));
  await page.screenshot({ path: '/tmp/evals-e2e-fail.png', fullPage: true }).catch(() => {});
}

const realErrs = errs.filter(e => !/service ?worker/i.test(e));
ok(realErrs.length === 0, 'no console errors' + (realErrs.length ? ':\n    ' + realErrs.join('\n    ') : ''));
await browser.close();
console.log(fails ? `${fails} of ${checks} e2e checks failed` : `${checks} e2e checks passed`);
process.exit(fails ? 1 : 0);
