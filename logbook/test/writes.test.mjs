import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteQueue } from '../js/writes.js';
import { checkWrite } from '../js/recovery-store.js';
import { cleanCase } from '../js/demo-backend.js';
import { createDraftSlot } from '../js/drafts.js';
const clone = x => structuredClone(x);
function fixture() {
  const records = new Map(), remote = new Map();
  let owner = 'a', online = true, reject = false, deny = false;
  const store = { async put(x) { if (deny) throw Error('quota'); records.set(x.key, clone(x)); }, async list(o) { return [...records.values()].filter(x => x.owner === o).map(clone); }, async remove(k) { records.delete(k); }, async forget(o) { for (const [k,x] of records) if(x.owner===o) records.delete(k); } };
  const config = { store, getOwner: () => owner, online: () => online, delay: ms => new Promise(r => setTimeout(r, ms === 180 ? 5 : 100)), backend: async (_, kind, record, base) => {
    if (reject) throw Error('rejected'); const current = remote.get(record.id) || null;
    checkWrite(current, record._deleted ? null : record, base);
    if(record._deleted) remote.delete(record.id); else remote.set(record.id, clone(record)); return record;
  } };
  return { records, remote, config, queue: createWriteQueue(config), owner: x=>owner=x, online:x=>online=x, reject:x=>reject=x, deny:x=>deny=x };
}
test('unavailable durable storage never clears an editor or contacts backend', async () => {
  const f=fixture();f.deny(true);await assert.rejects(f.queue.save('case','a',{id:'1'}),/storage/);assert.equal(f.remote.size,0);assert.equal(f.queue.entries().length,0);
});
test('offline immutable payload survives restart and drains on reconnect', async () => {
  const f=fixture();f.online(false);const input={id:'1',details:'original'};
  const save=f.queue.save('case','a',input);input.details='mutated';await save;assert.equal(f.queue.overlay('case','a',[])[0].details,'original');
  const next=createWriteQueue(f.config);await next.activate('a');f.online(true);assert.equal(await next.flush(),true);assert.equal(f.remote.get('1').details,'original');
});
test('rejected writes keep recovery copy and explicit retry succeeds', async () => {
  const f=fixture();f.reject(true);try { await f.queue.save('case','a',{id:'1',details:'keep'}); } catch {}
  await f.queue.flush();const job=f.queue.entries()[0];assert.equal(job.state,'failed');assert.equal(f.records.get(job.key).record.details,'keep');
  f.reject(false);await f.queue.retry(job.key);assert.equal(f.queue.status('case','1'),'synced');assert.equal(f.remote.get('1').details,'keep');
});
test('concurrent edits preserve remote and local versions without overwrite', async () => {
  const f=fixture(),base={id:'1',details:'old'};f.remote.set('1',{...base,details:'other tab'});
  try { await f.queue.save('case','a',{...base,details:'mine'},base); } catch {}
  await f.queue.flush();const job=f.queue.entries()[0];assert.equal(job.state,'conflict');assert.equal(job.record.details,'mine');assert.equal(job.remote.details,'other tab');assert.equal(f.remote.get('1').details,'other tab');
});
test('offline sequential edits and undo deletion drain in order', async () => {
  const f=fixture();f.online(false);const first={id:'1',details:'one'},second={...first,details:'two'};
  await f.queue.save('case','a',first);await f.queue.save('case','a',second,first);await f.queue.save('case','a',{id:'1',_deleted:true},second);
  assert.equal(f.queue.overlay('case','a',[]).length,0);f.online(true);assert.equal(await f.queue.flush(),true);assert.equal(f.remote.size,0);
});
test('late acknowledgement from previous account cannot reinsert private history', async () => {
  const f=fixture();let finish;f.config.backend=()=>new Promise(r=>finish=r);const q=createWriteQueue(f.config);
  await q.save('case','a',{id:'1'});await q.forget();f.owner('b');await q.activate('b');finish({id:'1'});await Promise.resolve();await Promise.resolve();assert.equal(q.entries().length,0);assert.equal(f.records.size,0);
});
test('duplicate tabs clone reload draft but own independent storage keys', () => {
  const m=new Map(),sm=new Map();const storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},session={getItem:k=>sm.get(k)||null,setItem:(k,v)=>sm.set(k,v)};
  const a=createDraftSlot('draft','a',storage,session);a.save({details:'A'});const b=createDraftSlot('draft','a',storage,session);assert.equal(b.initial.details,'A');b.save({details:'B'});a.save({details:'AA'});assert.notEqual(a.key,b.key);assert.equal(JSON.parse(m.get(b.key)).details,'B');
});

test('edits arriving during an in-flight write drain without an online event or manual flush', async () => {
  const f=fixture();let finish,started;const called=new Promise(r=>started=r),first={id:'1',details:'one'},second={...first,details:'two'};
  const backend=f.config.backend;let calls=0;f.config.backend=async (...args)=>{if(++calls===1){started();await new Promise(r=>finish=r);}return backend(...args);};
  const q=createWriteQueue(f.config);const one=q.save('case','a',first);await called;const two=q.save('case','a',second,first);await two;finish();await one;
  for(let i=0;i<20&&q.status('case','1')!=='synced';i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(q.status('case','1'),'synced');assert.equal(f.remote.get('1').details,'two');
});
test('unchanged recovered reflection survives repeated reloads', () => {
  const m=new Map(),sm=new Map();const storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},session={getItem:k=>sm.get(k)||null,setItem:(k,v)=>sm.set(k,v)};
  createDraftSlot('reflection','a',storage,session).save({title:'Keep',restore:true});
  assert.equal(createDraftSlot('reflection','a',storage,session).initial.title,'Keep');
  assert.equal(createDraftSlot('reflection','a',storage,session).initial.title,'Keep');
});

test('canonical offline versions do not conflict when the backend removes empty/false fields', async () => {
 const f=fixture();f.online(false);f.config.normalize=(kind,value)=>cleanCase(value);const backend=f.config.backend;
 f.config.backend=(email,kind,record,base)=>backend(email,kind,cleanCase(record),base);
 const q=createWriteQueue(f.config);const first=await q.save('case','a',{id:'normal',details:'one',tags:[],reflectTag:false});
 assert.equal(first.tags,undefined);assert.equal(first.reflectTag,undefined);
 await q.save('case','a',{...first,details:'two'},first);f.online(true);assert.equal(await q.flush(),true);assert.equal(f.remote.get('normal').details,'two');
});

test('sign-out check sees another tab’s unsynced change in the shared store', async () => {
  // two tabs (or the browser and the home-screen app) share the recovery store: tab B saves offline
  const f=fixture();f.online(false);const A=createWriteQueue(f.config),B=createWriteQueue(f.config);
  await A.activate('a');await B.save('case','a',{id:'tabB',details:'Fake case from tab B'});
  assert.equal(await A.flush(50),false,'not synced yet: the sign-out prompt shows');
  f.online(true);assert.equal(await B.flush(),true);assert.equal(await A.flush(50),true,'once B has synced it');
});
