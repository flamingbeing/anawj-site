// Fake demo data only. Run beside the full suite; failures exit nonzero.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
try {
for (const width of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => localStorage.setItem('apmes-logbook-demo-small','1'));
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '?demo#log'); await p.waitForSelector('textarea.details');
  // Input event + immediate reload: no debounce window can lose the final keystroke.
  await p.evaluate(() => { const x=document.querySelector('textarea.details');x.value='QZ 6m lap chole';x.dispatchEvent(new Event('input',{bubbles:true}));location.reload(); });
  await p.waitForSelector('textarea.details'); assert.equal(await p.locator('textarea.details').inputValue(),'QZ 6m lap chole');
  const q=await ctx.newPage();await q.goto(base+'?demo#log');await q.waitForSelector('textarea.details');
  await q.locator('textarea.details').fill('XY 3mo other draft');await p.reload();await p.waitForSelector('textarea.details');
  assert.equal(await p.locator('textarea.details').inputValue(),'QZ 6m lap chole');await q.reload();await q.waitForSelector('textarea.details');assert.equal(await q.locator('textarea.details').inputValue(),'XY 3mo other draft');await q.close();
  await p.evaluate(async () => { const {writes}=await import('./js/ui-core.js');writes.configure({backend:async()=>{throw Error('Simulated rejection');},getOwner:()=> 'demo@example.com'}); });
  await p.locator('.picker [data-code="08"]').first().click();await p.locator('.savebar button.primary').click();
  await p.waitForFunction(() => document.getElementById('toast').textContent.includes('Simulated rejection'));
  assert.equal(await p.locator('textarea.details').inputValue(),'QZ 6m lap chole');
  assert.equal(await p.evaluate(async()=>{const {writes}=await import('./js/ui-core.js');return writes.entries()[0].state;}),'failed');
  await p.reload();await p.waitForSelector('textarea.details');assert.equal(await p.locator('textarea.details').inputValue(),'QZ 6m lap chole');
  await p.evaluate(async()=>{ const {writes}=await import('./js/ui-core.js');await writes.retry(writes.entries()[0].key); });
  assert.equal(await p.evaluate(async()=>{const {writes}=await import('./js/ui-core.js');return writes.entries()[0].state;}),'synced');
  // Acknowledged local-only write survives restart and reaches the backend.
  await p.evaluate(async()=>{ Object.defineProperty(navigator,'onLine',{configurable:true,value:false});const {createCase}=await import('./js/ui-core.js');await createCase({id:'offline-proof',details:'Fake offline',cats:['08']}); });
  assert.equal(await p.evaluate(async()=>{const {writes}=await import('./js/ui-core.js');return writes.status('case','offline-proof');}),'pending');
  await p.reload();await p.waitForSelector('textarea.details');
  await p.waitForFunction(async()=>{const {writes}=await import('./js/ui-core.js');return writes.status('case','offline-proof')==='synced';});
  // Genuine edit conflict: the stored record changes after the editor's base snapshot.
  await p.evaluate(async()=>{const {cloud,S,updateCase}=await import('./js/ui-core.js');const base=S.cases.find(x=>x.id==='offline-proof');await cloud.saveCase(S.user.email,{...base,details:'Other writer'});try{await updateCase({...base,details:'My edit'},{base});}catch{};});
  const conflict=await p.evaluate(async()=>{const {writes,cloud,S}=await import('./js/ui-core.js');return {job:writes.entries()[0],remote:(await cloud.listCases(S.user.email)).find(x=>x.id==='offline-proof')};});
  assert.equal(conflict.job.state,'conflict');assert.equal(conflict.job.record.details,'My edit');assert.equal(conflict.remote.details,'Other writer');
  await p.evaluate(async()=>{const {writes,S}=await import('./js/ui-core.js');writes.configure({backend:async()=>{throw Error('Reflection rejection');},getOwner:()=>S.user?.email});const m=await import('./js/ui-reflect.js');m.reflectOnCase({id:'fake-refl-case',date:'2026-10-10',initials:'ZZ',details:'Fake hernia',cats:['13']},{headingId:'thyroid'});});
  await p.waitForSelector('input[placeholder="Title"]');await p.locator('input[placeholder="Title"]').fill('Fake recoverable reflection');
  await p.getByRole('button',{name:'← Reflections',exact:true}).click();assert.equal(await p.locator('.refl-editor').count(),1);
  await p.reload();await p.waitForSelector('.refl-editor');assert.equal(await p.locator('input[placeholder="Title"]').inputValue(),'Fake recoverable reflection');
  assert.deepEqual(errors,[]);await ctx.close();
  // Both storage mechanisms denied: Save must retain all input, and never say Draft saved.
  const denied=await b.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await denied.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('logbook-draft-')||k.startsWith('apmes-logbook-recovery:'))throw Error('Denied');return original.call(this,k,v);};indexedDB.open=()=>{throw Error('Denied');};});
  const d=await denied.newPage();await d.goto(base+'?demo#log');await d.waitForSelector('textarea.details');await d.locator('textarea.details').fill('AB denied storage');assert.match(await d.locator('.draft-note').first().textContent(),/not saved/);
  await d.locator('.picker [data-code="08"]').first().click();await d.locator('.savebar button.primary').click();await d.waitForFunction(()=>document.getElementById('toast').textContent.includes('storage'));assert.equal(await d.locator('textarea.details').inputValue(),'AB denied storage');await denied.close();
  console.log(`PASS recovery regressions ${width === 390 ? 'phone' : 'desktop'}`);
}
} finally { await b.close(); }
