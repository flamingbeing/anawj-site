// Fake demo data only. Run beside the full suite; failures exit nonzero.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const base = `http://localhost:${process.env.PORT || 8080}/logbook/`;
// waits for an async check in the page (waitForFunction does not await an async predicate: it passes at once)
const until = async (p, fn, ms = 15000) => { for (const end = Date.now() + ms; !(await p.evaluate(fn)); await new Promise(r => setTimeout(r, 50))) if (Date.now() > end) throw new Error('Timed out: ' + fn); };
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
  await until(p,async()=>{const {writes}=await import('./js/ui-core.js');return writes.status('case','offline-proof')==='synced';});
  // Genuine edit conflict: the stored record changes after the editor's base snapshot.
  await p.evaluate(async()=>{const {cloud,S,updateCase}=await import('./js/ui-core.js');const base=S.cases.find(x=>x.id==='offline-proof');await cloud.saveCase(S.user.email,{...base,details:'Other writer'});try{await updateCase({...base,details:'My edit'},{base});}catch{};});
  const conflict=await p.evaluate(async()=>{const {writes,cloud,S}=await import('./js/ui-core.js');return {job:writes.entries()[0],remote:(await cloud.listCases(S.user.email)).find(x=>x.id==='offline-proof')};});
  assert.equal(conflict.job.state,'conflict');assert.equal(conflict.job.record.details,'My edit');assert.equal(conflict.remote.details,'Other writer');
  // A later save on this device's own version fails and is kept as a conflict too (it waited behind it for good,
  // saying 'Saved locally'); Restore my version on the first card then saves the newest copy over the other one.
  const later=await p.evaluate(async()=>{const {updateCase,writes}=await import('./js/ui-core.js');const mine=writes.entries()[0].record;try{await updateCase({...mine,details:'My later edit'},{base:mine});return 'saved';}catch(e){return e.message;}});
  assert.match(later,/changed elsewhere/);
  await p.evaluate(()=>location.hash='#recovery');await p.locator('.recover-sec[data-sec=attention][open]').waitFor();
  await p.getByRole('button',{name:'Keep mine',exact:true}).nth(1).click();await p.getByRole('button',{name:'Restore',exact:true}).click();
  await until(p,async()=>{const {cloud,S,writes}=await import('./js/ui-core.js');return (await cloud.listCases(S.user.email)).find(x=>x.id==='offline-proof')?.details==='My later edit'&&writes.status('case','offline-proof')==='synced'&&S.cases.find(x=>x.id==='offline-proof')?.details==='My later edit';});
  assert.equal(await p.evaluate(async()=>(await import('./js/ui-core.js')).writes.entries().filter(x=>x.state==='conflict').length),0);
  // After another conflict, an edit of the copy shown (the other one) syncs, and the toast the save shows next says this
  // device's version is kept in Recent changes (it was set aside silently)
  await p.evaluate(async()=>{const {cloud,S,updateCase}=await import('./js/ui-core.js');const base=S.cases.find(x=>x.id==='offline-proof');await cloud.saveCase(S.user.email,{...base,details:'Other writer 2'});try{await updateCase({...base,details:'My edit 2'},{base});}catch{}});
  await until(p,async()=>{const {S,writes}=await import('./js/ui-core.js');return writes.status('case','offline-proof')==='conflict'&&S.cases.find(x=>x.id==='offline-proof')?.details==='Other writer 2';});
  await p.evaluate(async()=>{const {S,updateCase,toast}=await import('./js/ui-core.js');const shown=S.cases.find(x=>x.id==='offline-proof');await updateCase({...shown,details:'Fake edit of the other copy'},{base:shown});toast('Case updated');});
  assert.equal(await p.locator('#toast').textContent(),'Case updated · Your version from this device is kept in Recover');
  await until(p,async()=>{const {cloud,S,writes}=await import('./js/ui-core.js');return (await cloud.listCases(S.user.email)).find(x=>x.id==='offline-proof')?.details==='Fake edit of the other copy'&&writes.status('case','offline-proof')==='synced';});
  assert.equal(await p.evaluate(async()=>(await import('./js/ui-core.js')).writes.entries().filter(x=>x.state==='conflict').length),0);
  await p.evaluate(()=>location.hash='#log');await p.waitForSelector('textarea.details');
  await p.evaluate(async()=>{const {writes,S}=await import('./js/ui-core.js');writes.configure({backend:async()=>{throw Error('Reflection rejection');},getOwner:()=>S.user?.email});const m=await import('./js/ui-reflect.js');m.reflectOnCase({id:'fake-refl-case',date:'2026-10-10',initials:'ZZ',details:'Fake hernia',cats:['13']},{headingId:'thyroid'});});
  await p.waitForSelector('input[placeholder="Title"]');await p.locator('input[placeholder="Title"]').fill('Fake recoverable reflection');
  await p.getByRole('button',{name:'← Reflections',exact:true}).click();assert.equal(await p.locator('.refl-editor').count(),1);
  await p.reload();await p.waitForSelector('.refl-editor');assert.equal(await p.locator('input[placeholder="Title"]').inputValue(),'Fake recoverable reflection');
  await p.reload();await p.waitForSelector('.refl-editor');assert.equal(await p.locator('input[placeholder="Title"]').inputValue(),'Fake recoverable reflection');
  // Editing while Close is awaiting its immutable snapshot must keep the newer draft.
  await p.evaluate(async()=>{const {writes,S}=await import('./js/ui-core.js');writes.configure({backend:async(_,__,record)=>{await new Promise(r=>setTimeout(r,100));return record;},getOwner:()=>S.user?.email});
    document.querySelector('input[placeholder="Title"]').value='Before close';document.querySelector('input[placeholder="Title"]').dispatchEvent(new Event('input',{bubbles:true}));
    [...document.querySelectorAll('button')].find(x=>x.textContent==='← Reflections').click();
    setTimeout(()=>{const x=document.querySelector('input[placeholder="Title"]');x.value='Typed during Close';x.dispatchEvent(new Event('input',{bubbles:true}));},30);
  });
  await p.waitForTimeout(250);assert.equal(await p.locator('.refl-editor').count(),1);assert.equal(await p.locator('input[placeholder="Title"]').inputValue(),'Typed during Close');
  // Native async event handling plus new input during a case modal Save.
  await p.evaluate(async()=>{const {S,writes,cloud}=await import('./js/ui-core.js');writes.configure({backend:async(...args)=>{await new Promise(r=>setTimeout(r,100));return cloud.commitRecord(...args);}});const {editCaseDialog}=await import('./js/ui-log.js');editCaseDialog(S.cases.find(x=>x.id!=='offline-proof'));});
  await p.locator('dialog textarea').fill('Before modal save');
  await p.evaluate(()=>{document.querySelector('dialog button.primary').click();setTimeout(()=>{const x=document.querySelector('dialog textarea');x.value='Typed during modal save';x.dispatchEvent(new Event('input',{bubbles:true}));},30);});
  await p.waitForTimeout(250);assert.equal(await p.locator('dialog[open]').count(),1);assert.equal(await p.locator('dialog textarea').inputValue(),'Typed during modal save');
  await p.locator('dialog button.primary').click();await p.waitForFunction(()=>!document.querySelector('dialog[open]'));
  // Recovery confirmation must not transfer a previous account's data after an account change.
  await p.evaluate(()=>location.hash='#recovery');await p.waitForURL(/#recovery$/);await p.locator('.recover-page').waitFor();await p.locator('.recover-sec[data-sec=versions]').evaluate(d=>{d.open=true;});
  await p.getByRole('button',{name:'Restore this version',exact:true}).first().click();await p.waitForSelector('dialog[open]');
  await p.evaluate(async()=>{const {S,writes}=await import('./js/ui-core.js');globalThis.originalUser=S.user;S.user={email:'fake-other@example.com'};await writes.activate(S.user.email);globalThis.leakedWrites=[];writes.configure({backend:async(email,kind,record)=>{leakedWrites.push({email,kind,record});return record;}});});
  await p.getByRole('button',{name:'Restore',exact:true}).click();await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>leakedWrites.length),0);
  await p.evaluate(async()=>{const {S,writes}=await import('./js/ui-core.js');S.user=originalUser;await writes.activate(S.user.email);});
  // Closing a tag dialog after account replacement must not run its old editing callback.
  await p.evaluate(async()=>{const {pickDialog}=await import('./js/ui-log.js');globalThis.foreignTagEdits=0;pickDialog(['08'],()=>foreignTagEdits++);});await p.waitForSelector('dialog[open]');
  await p.evaluate(async()=>{const {S,transients}=await import('./js/ui-core.js');S.user={email:'fake-other@example.com'};transients.reset();document.querySelectorAll('dialog[open]').forEach(el=>el.close());});await p.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(await p.evaluate(()=>foreignTagEdits),0);
  await p.evaluate(async()=>{const {S,writes}=await import('./js/ui-core.js');S.user=originalUser;await writes.activate(S.user.email);});
  // Cleanup errors are explicit; an unreadable database cannot be treated as empty.
  const cleanup=await p.evaluate(async()=>{const {recoveryStore}=await import('./js/recovery-store.js');const owner='fake-cleanup@example.com';await recoveryStore.put({key:'fake-cleanup',owner,record:{details:'Fake private'}});const tx=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(){throw Error('Denied transaction');};let rejected=false;try{await recoveryStore.forget(owner);}catch{rejected=true;}finally{IDBDatabase.prototype.transaction=tx;}const retained=(await recoveryStore.list(owner)).length;await recoveryStore.forget(owner);return {rejected,retained};});
  assert.deepEqual(cleanup,{rejected:true,retained:1});
  // Signed-out UI is hidden immediately, while durable cleanup is still running.
  await p.evaluate(async()=>{const {cloud,writes}=await import('./js/ui-core.js');const forget=writes.forget;writes.forget=async()=>{await new Promise(r=>setTimeout(r,400));return forget();};await cloud.signOut();});
  assert.equal(await p.locator('textarea.details, .refl-editor, dialog[open]').count(),0);
  await p.waitForTimeout(450);
  assert.deepEqual(errors,[]);await ctx.close();
  // Both storage mechanisms denied: Save must retain all input, and never say Draft saved.
  const denied=await b.newContext({viewport:{width,height:844},serviceWorkers:'block'});
  await denied.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('logbook-draft-')||k.startsWith('apmes-logbook-recovery:'))throw Error('Denied');return original.call(this,k,v);};indexedDB.open=()=>{throw Error('Denied');};});
  const d=await denied.newPage();await d.goto(base+'?demo#log');await d.waitForSelector('textarea.details');await d.locator('textarea.details').fill('AB denied storage');assert.match(await d.locator('.draft-note').first().textContent(),/not saved/);
  await d.locator('.picker [data-code="08"]').first().click();await d.locator('.savebar button.primary').click();await d.waitForFunction(()=>document.getElementById('toast').textContent.includes('storage'));assert.equal(await d.locator('textarea.details').inputValue(),'AB denied storage');await denied.close();
  console.log(`PASS recovery regressions ${width === 390 ? 'phone' : 'desktop'}`);
}
} finally { await b.close(); }
