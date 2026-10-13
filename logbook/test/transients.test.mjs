import assert from 'node:assert/strict';
import { createTransients } from '../js/transients.js';
const callbacks=new Map(),events={addEventListener:(k,fn)=>callbacks.set(k,fn)};
const location={pathname:'/logbook/',search:'?demo',hash:'#logbook'};
const stack=[{state:{logbookNav:{tab:'logbook'}},url:'#logbook'}];let i=0,backs=0;
const history={get state(){return stack[i].state;},pushState(state,_,url){stack.splice(++i);stack.push({state,url});},replaceState(state){stack[i].state=state;},back(){assert(i>0);backs++;i--;queueMicrotask(()=>callbacks.get('popstate')());}};
const views=createTransients({history,location,events});const closed=[];
const parent=views.open(()=>closed.push('parent')),child=views.open(()=>closed.push('child'));
assert.equal(stack.length,3);assert.equal(history.state.logbookNav.tab,'logbook');
await child.close();assert.deepEqual(closed,['child']);assert.equal(parent.active,true);
await views.dismissAll();assert.deepEqual(closed,['child','parent']);assert.equal(i,0);assert.equal(backs,2);
const next=views.open(()=>closed.push('next'));history.back();await Promise.resolve();assert.equal(next.active,false);assert.equal(closed.at(-1),'next');
const signedOut=views.open(()=>{throw Error('Old account callback must not run');});views.reset();assert.equal(signedOut.active,false);assert.deepEqual(history.state.logbookTransient.ids,[]);

// a late step back (WebKit) after a page opened in between (location.hash = …) must not undo that page
{
  const cb=new Map(),ev={addEventListener:(k,fn)=>cb.set(k,fn)};
  const loc={pathname:'/logbook/',search:'?demo',hash:'#points',get href(){return 'http://x'+this.pathname+this.search+this.hash;}};
  const st=[{state:{logbookNav:{tab:'points'}},hash:'#points'}];let j=0;const queued=[];
  const go=k=>{j=k;loc.hash=st[j].hash;};
  const h={get state(){return st[j].state;},pushState(state,_,url){st.splice(++j);st.push({state,hash:url.slice(url.indexOf('#'))});loc.hash=st[j].hash;},
    replaceState(state,_,url){st[j]={state,hash:url?url.slice(url.indexOf('#')):st[j].hash};loc.hash=st[j].hash;},
    back(){queued.push(()=>{go(j-1);cb.get('popstate')();});},forward(){queued.push(()=>{go(j+1);cb.get('popstate')();});}};
  const tr=createTransients({history:h,location:loc,events:ev});const gone=[];
  // the hash change is seen before the late step
  let v=tr.open(()=>gone.push('a'));const p1=v.close();
  const old=loc.href;st.splice(j+1);st.push({state:null,hash:'#sharefmt'});j++;loc.hash='#sharefmt';cb.get('hashchange')({newURL:loc.href,oldURL:old});
  assert.deepEqual(gone,['a']);await p1;
  queued.shift()();assert.equal(loc.hash,'#sharefmt','the newer page stays');assert.deepEqual(h.state.logbookTransient.ids,[]);assert.equal(queued.length,0);
  // the late step lands first (address unseen): it steps forward to the newer page
  v=tr.open(()=>gone.push('b'));const p2=v.close();
  st.splice(j+1);st.push({state:null,hash:'#sendto'});j++;loc.hash='#sendto';
  queued.shift()();await p2;assert.deepEqual(gone,['a','b']);assert.equal(queued.length,1);queued.shift()();assert.equal(loc.hash,'#sendto');
  // an ordinary close is untouched
  v=tr.open(()=>gone.push('c'));const n=st.length;const p3=v.close();queued.shift()();await p3;assert.equal(loc.hash,'#sendto');assert.equal(st.length,n);assert.deepEqual(gone,['a','b','c']);
}
console.log('transient history tests passed');
