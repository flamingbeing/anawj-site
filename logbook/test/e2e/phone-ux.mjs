// Fake data only. The phone batch (13 Oct 2026): the note editor's ⋯ menu (opens and stays open, Escape, arrows,
// outside taps), Done always draws the list (and live saves repaint it in place), the editor's top bar stays put and
// long titles wrap, Hide the tab bar while typing, a tapped calendar day comes into view, case row tags wrap, 44px
// tap targets on touch screens, no keyboard as the app opens on a phone (unless asked for), and Request an
// evaluation (off by default) with only the date and initials in its link. Phone 390 (touch) and desk 1280.
import assert from 'node:assert/strict';
import { launch, engine, isChromium, phoneOpts, ignorable, until } from './browsers.mjs';
const origin = `http://localhost:${process.env.PORT || 8080}`, base = origin + '/logbook/';
const b = await launch();
if (!b) { console.log(`SKIP phone-ux (${engine} is not installed here)`); process.exit(0); }
const label = w => (w === 390 ? 'phone' : 'desktop') + (isChromium ? '' : ` (${engine})`);
try { for (const width of [390, 1280]) {
  const phone = width === 390;
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', ...(phone ? phoneOpts() : {}) });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small', '1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text()); });
  // links the app opens are caught here, not followed
  await p.addInitScript(() => {
    window.__opened = [];
    document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a.eval-req'); if (a) { e.preventDefault(); window.__opened.push(a.getAttribute('href')); } }, true);
  });
  const tap = (loc, o) => (phone ? loc.tap(o) : loc.click(o));
  const focusedTag = () => p.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'));

  // ---- the case box and the keyboard: on a phone not as the app opens, only on going to the Add tab ----
  await p.goto(base + '?demo=reset#log'); await p.waitForSelector('textarea.details');
  await p.waitForTimeout(300);
  if (phone) {
    assert.notEqual(await focusedTag(), 'Case summary', 'the keyboard opened as the app started on a phone');
    await tap(p.locator('[role=tab][data-tab=logbook]'));
    await tap(p.locator('[role=tab][data-tab=log]'));
    await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Case summary');
    // "Also when the app opens" brings it back as the app starts
    await p.goto(base + '?demo#loggingadv');
    const also = p.getByRole('switch', { name: 'Also when the app opens on a phone or tablet (this device)' });
    assert.equal(await also.isChecked(), false);
    await tap(also);
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Case summary');
    await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ autoFocus: null })); });
    // the app's "Log a case" shortcut (./#quicklog) asks for the keyboard as it opens, and the address becomes #log
    await p.evaluate(() => history.replaceState(null, '', location.pathname + '?demo#quicklog')); await p.reload(); await p.waitForSelector('textarea.details');
    await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Case summary');
    assert.equal(new URL(p.url()).hash, '#log');
    // a plain open again: no keyboard
    await p.reload(); await p.waitForSelector('textarea.details'); await p.waitForTimeout(300);
    assert.notEqual(await focusedTag(), 'Case summary', 'the keyboard opened as the app started (after the shortcut)');
  } else {
    await p.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Case summary');   // computers as before
  }
  console.log(`PASS keyboard on opening ${label(width)}`);

  // ---- tap targets: 44px on touch screens ----
  if (phone) {
    await tap(p.locator('[role=tab][data-tab=logbook]'));
    const cal = p.locator('main .seg button').filter({ hasText: /^Calendar$/ }); if (await cal.count()) await tap(cal.first());
    for (const name of ['Previous month', 'Next month']) {
      const r = await p.getByRole('button', { name }).boundingBox();
      assert.ok(r.width >= 44 && r.height >= 44, `${name} is ${r.width}x${r.height}`);
    }
    await tap(p.locator('[role=tab][data-tab=log]'));
    for (const name of [/^Case$/, /^List$/]) {
      const r = await p.locator('.datebar .mode-seg button').filter({ hasText: name }).first().boundingBox();
      assert.ok(r.height >= 44, `the Case | List switch is ${r.height} high`);
    }
    await p.goto(base + '?demo#layout'); await p.getByRole('heading', { name: 'Layout', exact: true }).first().waitFor();
    const back = await p.locator('.back-row .back-link').first().boundingBox();
    assert.ok(back.height >= 44, `the back link is ${back.height} high`);
    console.log(`PASS tap targets ${label(width)}`);
  }

  // ---- case rows: the tags wrap, nothing runs under the note button or the row's buttons ----
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);   // (the demo's cases load after the first drawing)
  await p.evaluate(async () => {
    const { S, updateCase } = await import('./js/ui-core.js');
    const c = S.cases[0];
    await updateCase(c.id, { tags: ['fake-tag-one', 'fake-tag-two', 'fake-tag-three'], cats: ['16', '28', '1', '2', '3'] });
  });
  await p.goto(base + '?demo#logbook');
  const list = p.locator('main .seg button').filter({ hasText: /^List$/ }); await list.first().click();
  await p.locator('ul.cases li[data-date] .c-tags').first().waitFor();
  const rows = await p.locator('ul.cases li[data-date] .c-tags').evaluateAll(els => els.map(e => ({ wrap: getComputedStyle(e).flexWrap, over: e.scrollWidth - e.clientWidth })));
  assert.ok(rows.length >= 1);
  for (const r of rows) { assert.equal(r.wrap, 'wrap'); assert.ok(r.over <= 1, 'a tag row runs past its edge: ' + r.over); }
  // Shorter Logbook rows keep one grey line of tags that scrolls inside the row: nothing spills past the page's edge
  await p.evaluate(async () => {
    const { S, updateCase } = await import('./js/ui-core.js');
    await updateCase(S.cases[0].id, { cats: ['16', '28', '1', '2', '3', '4', '5', '6', '7', '8', '9'] });
    const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ rowShort: true }));
  });
  await p.goto(base + '?demo#logbook');
  await p.waitForFunction(() => Number(document.body.dataset.cases) > 0);
  await p.locator('main .seg button').filter({ hasText: /^List$/ }).first().click();
  await p.locator('ul.cases li[data-date] .c-tags').first().waitFor();
  const short = await p.locator('ul.cases li[data-date] .c-tags').first().evaluate(e => ({ wrap: getComputedStyle(e).flexWrap, ox: getComputedStyle(e).overflowX }));
  assert.equal(short.wrap, 'nowrap'); assert.equal(short.ox, 'auto');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= width, 'the short rows\' tags made the page scroll sideways');
  await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ rowShort: null })); });
  console.log(`PASS case row tags wrap ${label(width)}`);

  // ---- the calendar: a tapped day's cases come into view above the tab bar ----
  if (phone) {
    await p.setViewportSize({ width, height: 560 });
    const cal = p.locator('main .seg button').filter({ hasText: /^Calendar$/ }); await tap(cal.first());
    await p.evaluate(() => window.scrollTo(0, 0));
    const day = p.locator('button.lb-day:not(.blank)').filter({ has: p.locator('.lb-count:not(.none)') }).first();
    await tap(day);
    const head = p.locator('.lb-daydetail .lb-dayhead');
    await head.waitFor();
    await p.waitForFunction(() => {
      const r = document.querySelector('.lb-daydetail .lb-dayhead').getBoundingClientRect(), bar = document.getElementById('tabs').getBoundingClientRect();
      return r.bottom <= bar.top && r.top >= 0;
    }, null, { timeout: 3000 }).catch(async e => {
      console.log('calendar state', await p.evaluate(() => { const d = document.querySelector('.lb-daydetail'); const h = d && d.querySelector('.lb-dayhead'); return { y: scrollY, ih: innerHeight, det: d && Math.round(d.getBoundingClientRect().top), head: h && Math.round(h.getBoundingClientRect().bottom), bar: Math.round(document.getElementById('tabs').getBoundingClientRect().top), sel: Math.round(document.querySelector('.lb-day.sel')?.getBoundingClientRect().top ?? -1) }; }));
      await p.screenshot({ path: (process.env.E2E_OUT || '/tmp') + '/phone-ux-calendar.png' });
      throw e;
    });
    // and the day stays on screen
    const sel = await p.locator('button.lb-day.sel').boundingBox();
    assert.ok(sel.y >= 0, 'the tapped day went off the top');
    await p.setViewportSize({ width, height: 844 });
    console.log(`PASS calendar day into view ${label(width)}`);
  }

  // ---- the note editor ----
  await p.goto(base + '?demo#notes'); await p.getByRole('button', { name: '+ New note' }).waitFor();
  await p.getByRole('button', { name: '+ New note' }).click();
  // a long title wraps onto more lines; a pasted line break becomes a space
  const long = 'Fake long title about a teaching point that goes on and on well past one line of the phone';
  await p.getByLabel('Note title').fill(long + '\nsecond');
  assert.equal(await p.getByLabel('Note title').inputValue(), long + ' second');
  const tb = await p.getByLabel('Note title').evaluate(e => ({ h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight), tag: e.tagName }));
  assert.equal(tb.tag, 'TEXTAREA');
  if (phone) assert.ok(tb.h > tb.lh * 1.6, `the long title didn't wrap (${tb.h}px, line ${tb.lh}px)`);
  // a wider window, then narrower again (a phone turned): the title fits again, no line cut off
  const titleFits = () => p.getByLabel('Note title').evaluate(e => e.scrollHeight <= e.clientHeight + 1);
  await p.setViewportSize({ width: width === 390 ? 844 : 1600, height: 844 }); await p.waitForTimeout(150);
  assert.ok(await titleFits(), 'the title was cut off when the window grew');
  await p.setViewportSize({ width, height: 844 }); await p.waitForTimeout(150);
  assert.ok(await titleFits(), 'the title was cut off when the window narrowed');
  await p.getByLabel('Note text').fill(Array.from({ length: 80 }, (_, i) => 'Fake line ' + i).join('\n'));
  // the ⋯ menu opens and stays open (a tap on its own button can't close it again)
  const more = p.getByRole('button', { name: 'More options' });
  const menuHidden = () => p.locator('.note-menu').evaluate(m => m.hidden);
  await tap(more);
  await p.waitForTimeout(200);
  assert.equal(await menuHidden(), false, 'the ⋯ menu closed at once');
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  // keyboard: focus in the menu, arrows move, Escape closes and goes back to ⋯
  assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('role')), 'menuitem');
  await p.keyboard.press('ArrowDown');
  assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Clean up');
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');
  assert.equal(await p.evaluate(() => document.activeElement?.textContent), 'Delete');
  await p.keyboard.press('Escape');
  assert.equal(await menuHidden(), true);
  assert.equal(await focusedTag(), 'More options');
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  // a tap elsewhere closes it; ⋯ again closes it; opening again still works
  await tap(more); assert.equal(await menuHidden(), false);
  await tap(p.getByLabel('Note title'), { position: { x: 8, y: 8 } });
  assert.equal(await menuHidden(), true);
  await tap(more); await tap(more);
  assert.equal(await menuHidden(), true);
  await tap(more);
  await p.getByRole('menuitem', { name: 'Preview' }).click();
  assert.equal(await menuHidden(), true);
  await p.locator('.note-view:not([hidden])').waitFor();
  // the top bar stays at the top while the note scrolls
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(100);
  const top = await p.locator('.note-editor .note-top').boundingBox();
  assert.ok(top.y >= -1 && top.y < 30, `the editor's top bar scrolled away (${top.y})`);
  assert.ok(await p.getByRole('button', { name: 'Done' }).isVisible());
  // Done: the list, at once; the save that follows repaints its rows in place (the page isn't drawn again under a tap)
  await tap(p.getByRole('button', { name: 'Done' }));
  await p.locator('ul.notes-rows li').first().waitFor({ timeout: 2000 });
  await p.evaluate(() => { window.__page = document.querySelector('.notes-page'); });
  await until(p, async () => { const { S } = await import('./js/ui-core.js'); return S.notes?.some(n => n.title?.startsWith('Fake long title') && n.updatedAt); }, null, { msg: 'the note saved' });
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => window.__page.isConnected), true, 'the Notes page was drawn again after Done');
  assert.match(await p.locator('ul.notes-rows').innerText(), /Fake long title/);
  // a tap on a row straight after Done (before the browser's step back lands) opens that note, and it stays open
  await p.locator('ul.notes-rows li').first().click();
  await p.locator('.note-editor').waitFor();
  await p.evaluate(() => { [...document.querySelectorAll('.note-editor button')].find(b => b.textContent.trim() === 'Done').click(); document.querySelector('ul.notes-rows li').click(); });
  await p.waitForTimeout(400);
  assert.equal(await p.locator('.note-editor').count(), 1, 'the note opened right after Done closed by itself');
  // and Back still closes it
  await p.goBack();
  await p.locator('ul.notes-rows li').first().waitFor({ timeout: 2000 });
  // and again through Back, with a few in a row
  for (let i = 0; i < 3; i++) {
    await p.locator('ul.notes-rows li').first().click();
    await p.locator('.note-editor').waitFor();
    if (i % 2) await p.goBack(); else await tap(p.getByRole('button', { name: 'Done' }));
    await p.locator('ul.notes-rows li').first().waitFor({ timeout: 2000 });
  }
  // with the tab bar at the top of a phone, the editor's top bar stays in view under it
  if (phone) {
    await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ tabBar: 'top' })); });
    await p.locator('ul.notes-rows li').first().click();
    await p.locator('.note-view:not([hidden])').waitFor();
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(100);
    const hit = await p.evaluate(() => { const r = document.querySelector('.note-editor .note-top').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el?.closest('.note-top'); });
    assert.ok(hit, 'the editor\'s top bar is hidden under the tab bar at the top');
    await tap(p.getByRole('button', { name: 'Done' }));
    await p.locator('ul.notes-rows li').first().waitFor({ timeout: 2000 });
    await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ tabBar: null })); });
  }
  console.log(`PASS note editor ${label(width)}`);

  // ---- Hide the tab bar while typing (Accessibility, this device; off by default) ----
  if (phone) {
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    // the keyboard coming up: a text box has focus and the visible area shrinks
    const typeWithKeyboard = async () => {
      await p.locator('textarea.details').focus();
      await p.setViewportSize({ width, height: 480 });
      await p.waitForFunction(() => document.body.classList.contains('typing'));
    };
    await typeWithKeyboard();
    assert.equal(await p.locator('#tabs').isVisible(), true);
    assert.equal(await p.evaluate(() => document.body.classList.contains('typing-nobar')), false);
    await p.setViewportSize({ width, height: 844 });
    await p.goto(base + '?demo#layout');
    const sw = p.getByRole('switch', { name: 'Hide the tab bar while typing' });
    assert.equal(await sw.isChecked(), false);
    await tap(sw);
    assert.equal(await p.evaluate(async () => (await import('./js/ui-settings.js')).display().hideTabsTyping), true);
    await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
    await typeWithKeyboard();
    await p.waitForFunction(() => document.body.classList.contains('typing-nobar'));
    assert.equal(await p.locator('#tabs').isVisible(), false);
    // Save sits at the bottom now, where the bar was
    const save = await p.locator('.savebar').boundingBox();
    assert.ok(save && save.y + save.height >= 480 - 2, 'the Save bar did not move down: ' + JSON.stringify(save));
    await p.locator('textarea.details').blur();
    await p.setViewportSize({ width, height: 844 });
    await p.waitForFunction(() => !document.body.classList.contains('typing-nobar'));
    assert.equal(await p.locator('#tabs').isVisible(), true);
    await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ hideTabsTyping: null })); });
    console.log(`PASS hide the tab bar while typing ${label(width)}`);
  }

  // ---- Request an evaluation: off by default, then in the case's ⋯ menu and its edit page ----
  await p.evaluate(async () => { const m = await import('./js/ui-settings.js'); m.applyDisplay(m.setDisplay({ rowMenu: true })); });
  await p.goto(base + '?demo#logbook');
  await p.locator('main .seg button').filter({ hasText: /^List$/ }).first().click();
  const c0 = await p.evaluate(async () => { const { S } = await import('./js/ui-core.js'); const { caseParts } = await import('./js/engine.js'); const c = S.cases.find(x => caseParts(x).initials); return { id: c.id, date: c.date, initials: caseParts(c).initials, details: caseParts(c).details }; });
  const row = p.locator(`ul.cases li[data-date="${c0.date}"]`).first();
  await row.locator('.row-more').click();
  await p.locator('dialog[open] .row-menu-list').waitFor();
  assert.equal(await p.locator('dialog[open]').getByText('Request an evaluation').count(), 0);
  await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  await p.goto(base + '?demo#showhide');
  const evalSw = p.getByRole('switch', { name: 'Request an evaluation from a case' });
  assert.equal(await evalSw.isChecked(), false);
  await evalSw.check();
  await until(p, async () => (await import('./js/ui-core.js')).shows('evalRequest') === true, null, { msg: 'the setting saved' });
  await p.goto(base + '?demo#logbook');
  await p.locator('main .seg button').filter({ hasText: /^List$/ }).first().click();
  await p.locator(`ul.cases li[data-date="${c0.date}"]`).first().locator('.row-more').click();
  const link = p.locator('dialog[open]').getByRole('link', { name: 'Request an evaluation' });
  const href = await link.getAttribute('href');
  assert.equal(href, `${origin}/evals/?demo&date=${c0.date}&initials=${c0.initials}#new`);   // this server's evals, not the live one
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.ok(!href.includes(encodeURIComponent(c0.details.split(' ')[0])) || c0.details.split(' ')[0] === c0.initials, 'the case details went into the link');
  await link.click();
  await p.waitForFunction(() => window.__opened.length === 1);
  assert.equal(await p.locator('dialog[open]').count(), 0, 'the menu stayed open');
  // the edit page has it too
  await p.locator(`ul.cases li[data-date="${c0.date}"]`).first().locator('.t').click();
  await p.locator('dialog[open]').getByText('Edit case', { exact: true }).waitFor();
  const editLink = p.locator('dialog[open] .case-links').getByRole('link', { name: 'Request an evaluation' });
  assert.equal(await editLink.getAttribute('href'), href);
  // a correction made in the dialog before Save goes with the link
  await p.locator('dialog[open]').getByLabel('Patient initials').fill('XQ');
  await editLink.click();
  await p.waitForFunction(() => window.__opened.length === 2);
  assert.equal(await p.evaluate(() => window.__opened[1]), `${origin}/evals/?demo&date=${c0.date}&initials=XQ#new`);
  await p.keyboard.press('Escape');
  if (await p.locator('dialog[open]').count()) await p.keyboard.press('Escape');
  // the dialogs' history steps are done (a step back still on its way would undo the next page's hash)
  await until(p, () => !document.querySelector('dialog[open]') && location.hash === '#logbook', null, { msg: 'the dialogs closed' });
  // its group's reset says what it does (a dialog's step back can still land after the hash change: go again until
  // the Profile page shows; it failed now and then in the full run, 15 Oct 2026)
  await p.goto(base + '?demo#showhide');
  await until(p, () => { if (location.hash !== '#showhide') location.hash = '#showhide'; return !!document.querySelector('[data-group="apmes"]'); }, null, { msg: 'the Profile page' });
  await p.locator('[data-group="apmes"]').getByRole('button', { name: 'Reset this group' }).click();
  await p.locator('dialog[open]').getByText(/This also turns off Request an evaluation/).waitFor();
  await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  assert.equal(await p.evaluate(async () => (await import('./js/ui-core.js')).shows('evalRequest')), true, 'Cancel kept it on');
  // the Personal profile's sheet lists this device's Hide the tab bar while typing (on in Personal) and turns off
  // Request an evaluation (opt-in: off in every profile)
  await p.locator('input[name=profile][value=personal]').check();
  const sheet = p.locator('dialog[open] .profile-changes');
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /Turns on \(this device\): Hide the tab bar while typing/);
  assert.match(await sheet.innerText(), /Turns off:[^\n]*Request an evaluation from a case/);
  await p.locator('dialog[open]').getByRole('button', { name: 'Cancel' }).click();
  console.log(`PASS request an evaluation ${label(width)}`);

  assert.deepEqual(errors, []); await ctx.close(); console.log(`PASS phone-ux ${label(width)}`);
} } finally { await b.close(); }
