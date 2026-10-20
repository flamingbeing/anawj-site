// Scan pages screen in demo mode (fake image only): off by default, toggled on in Settings, a photo is tidied, labelled,
// kept after a reload, and deleted. Needs the site served on :8080 like e2e.mjs.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const fails = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const pg = await ctx.newPage();
pg.on('pageerror', e => fails.push('page error: ' + e.message));
let refuse = false;
pg.on('dialog', d => { if (refuse) { refuse = false; return d.dismiss(); } return d.accept(); });
const ok = (c, m) => { if (!c) fails.push(m); };
try {
  // a fake photo: a tilted white page with dark lines and a shadow across its right half, on dark "carpet"
  const photoJs = `async (name) => {
    const W = 1600, H = 1200, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#3a302a'; x.fillRect(0, 0, W, H);
    x.save(); x.beginPath(); x.moveTo(380, 120); x.lineTo(1180, 190); x.lineTo(1260, 1060); x.lineTo(300, 980); x.closePath(); x.clip();
    x.fillStyle = '#e8e8e2'; x.fillRect(0, 0, W, H); x.fillStyle = '#202020';
    for (let i = 0; i < 9; i++) x.fillRect(420 + i * 8, 260 + i * 80, 600, 10);
    const g = x.createLinearGradient(700, 0, 1300, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.restore();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return new File([blob], name, { type: 'image/jpeg' });
  }`;
  const give = (sel, name) => pg.evaluate(`(async () => { const f = await (${photoJs})(${JSON.stringify(name)}); const dt = new DataTransfer(); dt.items.add(f); const i = document.querySelector('${sel}'); i.files = dt.files; i.dispatchEvent(new Event('change')); })()`);
  const flatPaper = () => pg.$eval('#screv', cv => { // brightness along a row of the page, away from the ink lines
    const x = cv.getContext('2d'), v = []; for (const px of [150, 450, 900, 1350, 1650]) v.push(x.getImageData(px, 2300, 1, 1).data[0]); return v; });

  await pg.goto('http://localhost:8080/prewarm/?demo#/settings'); await pg.waitForTimeout(800);
  ok(!(await pg.$('a[href="#/scan"]')), 'Scan pages link hidden until switched on');
  await pg.check('#scanon');
  await pg.click('a[href="#/scan"]');
  await pg.waitForSelector('#scsub');
  ok(await pg.$eval('#scact', e => e.hidden), 'no photo buttons before a Subject ID');
  await pg.fill('#scsub', 'DEMO-01');
  ok(!(await pg.$eval('#scact', e => e.hidden)), 'photo buttons after a Subject ID');
  ok(/Take page 1/.test(await pg.textContent('#scshottxt')), 'camera button names page 1');

  // photo -> crop step with a guessed page, a corner nudged, flattened, lit, accepted
  await give('#scshot', 'p1.jpg');
  await pg.waitForSelector('#scedit:not([hidden]) #sccrop:not([hidden])');
  const box = await pg.$eval('#sccrop', c => { const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  ok(box[2] > 300 && Math.abs(box[2] / box[3] - 4 / 3) < 0.02, 'crop view shows the whole photo, got ' + box);
  // the guess should have put the first corner near the page's top-left (380,120 of 1600x1200): nudge it by dragging, loupe shows
  const at = (px, py) => [box[0] + px / 1600 * box[2], box[1] + py / 1200 * box[3]];
  const [cx, cy] = at(380, 120);
  await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 3, cy + 3, { steps: 3 });
  ok(!(await pg.$eval('#scloupe', e => e.hidden)), 'magnifier shown while a corner is held');
  await pg.mouse.up();
  ok(await pg.$eval('#scloupe', e => e.hidden), 'magnifier hidden after letting go');
  await pg.click('#scflat');
  await pg.waitForSelector('#screv:not([hidden])');
  const paper = await flatPaper();
  ok(Math.min(...paper) > 235 && Math.max(...paper) - Math.min(...paper) < 15, 'flat page is evenly lit across the shadow: ' + paper);
  const dimsRev = await pg.$eval('#screv', c => [c.width, c.height]);
  ok(dimsRev[0] === 1800 && dimsRev[1] === 2400, 'flat page is 1800x2400, got ' + dimsRev);
  ok(/Auto \(black and white\)/.test(await pg.textContent('[data-mode="auto"]')), 'Auto picks black and white for black ink');
  await pg.click('[data-mode="color"]');
  ok(await pg.$eval('[data-mode="color"]', b => b.getAttribute('aria-pressed')) === 'true', 'Colour chosen');
  await pg.click('[data-mode="bw"]');
  const chooser = pg.waitForEvent('filechooser', { timeout: 5000 });
  await pg.click('#scok');
  await chooser; // Accept reopens the camera
  ok(await pg.$eval('#scedit', e => e.hidden), 'editor closed after Accept');
  await pg.waitForSelector('#sclist figure');
  ok(await pg.$eval('#scnum', s => s.value) === '2', 'page number moved on to 2');
  ok(/Take page 2/.test(await pg.textContent('#scshottxt')), 'camera button names page 2');

  // skip page 2 and 3: choose 4; the next offer is 5
  await pg.selectOption('#scnum', '4');
  await give('#scshot', 'p4.jpg');
  await pg.waitForSelector('#sccrop:not([hidden])'); await pg.click('#scflat'); await pg.waitForSelector('#screv:not([hidden])');
  await pg.click('[data-mode="color"]'); await pg.click('#scback'); await pg.waitForSelector('#sccrop:not([hidden])');
  await pg.click('#scrot'); await pg.click('#scrot'); await pg.click('#scrot'); await pg.click('#scrot'); // a full turn: back where it was
  await pg.click('#scflat'); await pg.waitForSelector('#screv:not([hidden])');
  await pg.click('#scok');
  await pg.waitForFunction(() => document.querySelectorAll('#sclist figure').length === 2);
  ok(await pg.$eval('#scnum', s => s.value) === '5', 'after page 4 the offer is page 5');
  ok(JSON.stringify(await pg.$$eval('.scnum', e => e.map(x => x.textContent))) === '["1","4"]', 'thumbnails in page order');

  // the original is kept beside the tidied copy, and the tidied copy is the flat page
  await pg.click('[data-open]'); await pg.waitForSelector('dialog[open]');
  const dims = await pg.$eval('#scimg', i => new Promise(r => { const f = () => r([i.naturalWidth, i.naturalHeight]); i.complete ? f() : (i.onload = f); }));
  ok(dims[0] === 1800 && dims[1] === 2400, 'tidied copy is 1800x2400, got ' + dims);
  await pg.click('#scorig'); ok((await pg.$eval('#scorig', e => e.textContent)) === 'Show tidied', 'original shown');
  await pg.waitForFunction(() => document.querySelector('#scimg').naturalWidth === 1600);
  // Retake from the page's own dialog replaces it
  const ch2 = pg.waitForEvent('filechooser', { timeout: 5000 });
  await pg.click('#scretake'); await ch2;
  await give('#scshot', 'p1b.jpg');
  await pg.waitForSelector('#sccrop:not([hidden])'); await pg.click('#scflat'); await pg.waitForSelector('#screv:not([hidden])');
  await pg.click('#scok'); await pg.waitForFunction(() => document.querySelector('#scedit').hidden);
  await pg.waitForTimeout(500);
  ok((await pg.$$('#sclist figure')).length === 2, 'retake replaced page 1, did not add a third');
  await pg.reload(); await pg.waitForTimeout(800);
  await pg.goto('http://localhost:8080/prewarm/?demo#/scan'); await pg.waitForSelector('#scsub');
  await pg.fill('#scsub', 'DEMO-01');
  await pg.waitForSelector('#sclist figure');
  ok(JSON.stringify(await pg.$$eval('.scnum', e => e.map(x => x.textContent))) === '["1","4"]', 'pages kept after reload');
  ok(await pg.$eval('#scnum', s => s.value) === '2', 'offer is the first free number after a reload');

  // "Choose from photos" goes through the same crop step; Save tidied pages is offered
  ok(!(await pg.$eval('#scsave', e => e.hidden)), 'Save tidied pages offered');
  await give('#scpick', 'pick.jpg');
  await pg.waitForSelector('#sccrop:not([hidden])'); await pg.click('#scflat'); await pg.waitForSelector('#screv:not([hidden])');
  await pg.click('#scok'); await pg.waitForFunction(() => document.querySelectorAll('#sclist figure').length === 3);
  // delete one
  await pg.click('[data-open]'); await pg.waitForSelector('dialog[open]'); await pg.click('#scdel'); await pg.waitForTimeout(300);
  ok((await pg.$$('#sclist figure')).length === 2, 'photo deleted');
  // press and hold selects; tap toggles; All / None / Cancel; Delete removes the picked ones
  const hold = async i => { const b = await (await pg.$$('#sclist img'))[i].boundingBox(); await pg.mouse.move(b.x + 20, b.y + 20); await pg.mouse.down(); await pg.waitForTimeout(700); await pg.mouse.up(); };
  const picked = () => pg.$$eval('#sclist figure.picked', e => e.length);
  ok(await pg.$eval('#scselbar', e => e.hidden), 'selection bar hidden at first');
  await hold(0); await pg.waitForTimeout(100);
  ok(!(await pg.$eval('#scselbar', e => e.hidden)) && await picked() === 1 && (await pg.$$('dialog[open]')).length === 0, 'press and hold starts selecting without opening the page');
  await pg.click('#sclist figure:nth-child(2) img'); ok(await picked() === 2, 'tap adds a photo');
  await pg.click('#sclist figure:nth-child(2) img'); ok(await picked() === 1, 'tap removes a photo');
  await pg.click('#scselnone'); ok(await picked() === 0 && await pg.$eval('#scseldel', e => e.disabled), 'None clears; Delete disabled');
  await pg.click('#scselall'); ok(await picked() === 2, 'All picks every photo');
  await pg.click('#scselcancel'); ok(await pg.$eval('#scselbar', e => e.hidden) && await picked() === 0, 'Cancel leaves selecting');
  await hold(0); refuse = true; await pg.click('#scseldel'); await pg.waitForTimeout(200);
  ok((await pg.$$('#sclist figure')).length === 2, 'declining the question deletes nothing');
  await pg.click('#scseldel'); await pg.waitForFunction(() => document.querySelectorAll('#sclist figure').length === 1);
  ok(await pg.$eval('#scselbar', e => e.hidden), 'bar closes after deleting');
  await give('#scpick', 'pick.jpg');
  await pg.waitForSelector('#sccrop:not([hidden])'); await pg.click('#scflat'); await pg.waitForSelector('#screv:not([hidden])');
  await pg.click('#scok'); await pg.waitForFunction(() => document.querySelectorAll('#sclist figure').length === 2);

  // sending: only on the real address (here: localhost with ?scantest), Access and the study computer stood in for
  await pg.goto('http://localhost:8080/prewarm/?demo#/scan'); await pg.waitForSelector('#scsub');
  await pg.fill('#scsub', 'DEMO-01');
  ok(await pg.$eval('#scsend', e => e.hidden), 'no Send button in demo mode');
  const sent = [];
  let signedIn = false, failPage = '';
  await pg.route('**/scan-api/**', async route => {
    const rq = route.request(), u = new URL(rq.url());
    if (u.pathname.endsWith('/whoami')) return signedIn ? route.fulfill({ json: { email: 'member@example.com' } }) : route.fulfill({ status: 302, headers: { Location: 'https://team.cloudflareaccess.com/login' } });
    if (failPage && u.pathname.endsWith('/' + failPage)) return route.fulfill({ status: 500, json: { error: 'the study computer is busy' } });
    sent.push(u.pathname); return route.fulfill({ json: { ok: true, pages: ['1'] } });
  });
  await pg.goto('http://localhost:8080/prewarm/?demo&scantest#/scan'); await pg.waitForSelector('#scsub');
  await pg.fill('#scsub', 'DEMO-02');
  const addPage = async () => { await give('#scpick', 'x.jpg'); await pg.waitForSelector('#sccrop:not([hidden])'); await pg.click('#scflat'); await pg.waitForSelector('#screv:not([hidden])'); await pg.click('#scok'); await pg.waitForFunction(() => document.querySelector('#scedit').hidden); await pg.waitForTimeout(400); };
  await addPage();
  await pg.selectOption('#scnum', '7'); await addPage();
  await pg.waitForFunction(() => document.querySelectorAll('#sclist figure').length === 2);
  ok(!(await pg.$eval('#scsend', e => e.hidden)), 'Send button on the real address');
  await pg.click('#scup');
  await pg.waitForFunction(() => /Sign in once/.test(document.querySelector('#scmsg').textContent));
  ok(sent.length === 0, 'nothing uploaded while signed out');
  signedIn = true; failPage = '7';
  await pg.click('#scup');
  await pg.waitForFunction(() => /Not sent/.test(document.querySelector('#scmsg').textContent));
  ok(/the study computer is busy/.test(await pg.textContent('#scmsg')), 'the failure reason is shown');
  ok(sent.length === 1 && sent[0].endsWith('/1'), 'page 1 sent although page 7 failed: ' + sent);
  ok((await pg.$$('.scsent')).length === 1, 'one tick');
  ok((await pg.$$('[data-retry]')).length === 1 && await pg.$eval('[data-retry]', b => b.closest('figure').querySelector('.scnum').textContent) === '7', 'Retry only on page 7');
  failPage = '';
  await pg.click('[data-retry]');
  await pg.waitForFunction(() => document.querySelectorAll('.scsent').length === 2);
  ok(sent.length === 2 && new Set(sent.map(p => p.split('/')[3])).size === 1, 'both pages sent under one scan id: ' + sent);
  ok(!(await pg.$('[data-retry]')), 'no Retry once sent');
  await pg.click('#scup'); ok(/already sent/.test(await pg.textContent('#scmsg')) && sent.length === 2, 'no second upload of sent pages');

  // approving a scan import (admin screen mounted with a stand-in cloud and one demo patient; fake values only)
  await pg.goto('http://localhost:8080/prewarm/?demo#/settings'); await pg.waitForTimeout(500);
  const res = await pg.evaluate(async () => {
    const m = await import('./js/scan-imports.js');
    const div = document.createElement('div'); div.id = 'siview'; document.body.append(div);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const saved = [], reviewed = [];
    const imp = { id: 'scan1', status: 'pending', createdAt: Date.now(), pages: [], fields: { age: { v: '67', flags: [] }, pw_gown: { v: '07:05', flags: ['hard to read'] }, wt: { v: '70', flags: [] } } };
    const cloud = { scanImports: async () => [imp], reviewScanImport: async (id, st) => { reviewed.push([id, st]); }, friendly: e => String(e) };
    const pt = { id: 'p1', site: 'NUH', f: { enrol_id: { v: 'S-01' }, wt: { v: 65 } } };
    window.confirm = () => true;
    m.mount({ view: div, esc, toast() {}, cloud, patients: () => ({ p1: pt }), sid: p => p.f.enrol_id.v, val: (p, id) => p.f[id]?.v ?? null, setField: (p, id, v) => saved.push([id, v]) });
    const wait = () => new Promise(r => setTimeout(r, 50));
    await wait();
    div.querySelector('[data-open]').click(); await wait();
    const out = { approveDisabled: div.querySelector('#siok').disabled };
    const sel = div.querySelector('#sipt'); sel.value = 'p1'; sel.onchange(); await wait();
    out.ticks = [...div.querySelectorAll('[data-use]')].map(c => c.checked);
    out.firstFlagged = /hard to read/.test(div.querySelector('li').textContent);
    out.replaceNote = /Now saved: 65/.test(div.textContent);
    div.querySelector('#siok').click(); await wait();
    return { ...out, saved, reviewed };
  });
  ok(res.approveDisabled, 'Approve disabled until a patient is chosen');
  ok(res.firstFlagged, 'flagged value listed first');
  ok(JSON.stringify(res.ticks) === '[false,true,false]', 'flagged and replacing values start unticked: ' + res.ticks);
  ok(res.replaceNote, 'a value that replaces a saved one says so');
  ok(JSON.stringify(res.saved) === '[["age",67]]', 'only the ticked value is saved: ' + JSON.stringify(res.saved));
  ok(JSON.stringify(res.reviewed) === '[["scan1","approved"]]', 'the import is marked approved');
} catch (e) { fails.push('error: ' + e.message.split('\n')[0]); }
await b.close();
console.log(fails.length ? 'FAIL scan e2e:\n' + fails.join('\n') : 'scan e2e passed');
process.exit(fails.length ? 1 : 0);
