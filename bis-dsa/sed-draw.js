// Masimo SedLine screen (the 'sedline' skin), part 2: data for the plots and every drawing. The real screen is 800 x 1280 (Root, portrait);
// everything is drawn in those design pixels and the two canvases are scaled to fit. Loaded after sed-screen.js (which owns SED), before app.js.
// Reads app.js globals (HIST, R, SIG, simT, mon, produced, FS, NB, DB_LO, DB_HI, T0, tim, psiOf ...) only when called, never at load.
const SED_FONT='"Source Sans 3","Source Sans Pro","Segoe UI",system-ui,sans-serif';
const SC={bg:'#100f0d',sep:'#2b2a2a',yel:'#f9ca07',unit:'#f4c609',dim:'#5c5c5e',lt:'#afafae',eeg:'#131924',dot:'#f3d314',red:'#ed1c24',gold:'#f9ca07'};
// the spectrogram's colour scale, read off the colour bar of a native screenshot (red = strongest, deep indigo = weakest), quantised to 51 steps
const SED_STOPS=[[0,[0xed,0x1c,0x24]],[.0625,[0xef,0x31,0x20]],[.125,[0xf4,0x71,0x16]],[.1875,[0xfa,0xbf,0x09]],[.25,[0xeb,0xec,0x06]],[.3125,[0xae,0xda,0x19]],[.375,[0x80,0xcc,0x28]],[.4375,[0x63,0xc4,0x31]],[.5,[0x58,0xc0,0x34]],[.5625,[0x5c,0xc1,0x33]],[.625,[0x64,0xc6,0x55]],[.6875,[0x6c,0xcb,0x9c]],[.75,[0x78,0xd2,0xdc]],[.8125,[0x58,0xc2,0xf0]],[.875,[0x45,0x72,0xc1]],[.9375,[0x3a,0x51,0xab]],[1,[0x33,0x49,0xa5]]];
const sedStopAt=p=>{let k=0;while(k<SED_STOPS.length-2&&p>SED_STOPS[k+1][0])k++;const a=SED_STOPS[k],b=SED_STOPS[k+1],f=Math.max(0,Math.min(1,(p-a[0])/(b[0]-a[0])));return a[1].map((v,j)=>Math.round(v+(b[1][j]-v)*f));};
const SED_LUT=Array.from({length:51},(_,i)=>sedStopAt(1-i/50)); // index 0 = weakest (blue) ... 50 = strongest (red)
const NPX=504,PX0=50,PX1=554,DW=685,DX=50,LH=150; // trend plot columns and x range; DSA width and x; DSA height of one side
const clampv=(v,a,b)=>Math.max(a,Math.min(b,v)),pad2=n=>String(n).padStart(2,'0');
function sT(c,s,x,y,size,col,al,wt,it,sx){c.font=`${it?'italic ':''}${wt||400} ${size}px ${SED_FONT}`;c.fillStyle=col;c.textAlign=al||'left';c.textBaseline='alphabetic';if(sx&&sx!==1){c.save();c.translate(x,y);c.scale(sx,1);c.fillText(s,0,0);c.restore();}else c.fillText(s,x,y);}
function sRR(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
// ----- time -----
const sedClock=(t,secs,force24)=>{const d=new Date(T0+t*1000);let h=d.getHours();const h24=force24!=null?force24:SED.set.clock24;
 if(h24)return pad2(h)+':'+pad2(d.getMinutes())+(secs?':'+pad2(d.getSeconds()):'');const ap=h>=12?' PM':' AM';h=h%12||12;return h+':'+pad2(d.getMinutes())+(secs?':'+pad2(d.getSeconds()):'')+ap;};
const sedHms=t=>{const d=new Date(T0+t*1000);return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());};
const sedHm=t=>{const d=new Date(T0+t*1000);return pad2(d.getHours())+':'+pad2(d.getMinutes());};
const sedDate=t=>{const d=new Date(T0+t*1000),y=pad2(d.getFullYear()%100),m=pad2(d.getMonth()+1),dd=pad2(d.getDate());return SED.set.dateFmt==='DD/MM/YY'?`${dd}/${m}/${y}`:`${m}/${dd}/${y}`;};
// ----- layout of the window (design pixels) -----
const SED_PARAMS=['emg','psi','sr','artf','sefl','sefr','st'];
const SED_NAME={emg:'EMG',psi:'PSI',sr:'SR',artf:'ARTF',sefl:'SEFL',sefr:'SEFR',st:'ST'},SED_UNIT={emg:'%',psi:'',sr:'%',artf:'%',sefl:'Hz',sefr:'Hz',st:'HH:MM'};
function sedLay(){const alt=SED.set.placement==='EEG/DSA/PSi',ps=SED_PARAMS.filter(k=>k!=='st'||SED.set.smart),L={alt,dsaY:alt?412:812,trendY:alt?790:410,trendH:322,rows:[],well:[]};
 L.wellY=L.trendY+322;L.wellH=72;
 if(SED.view==='analog'){L.well=ps.filter(k=>k==='artf'||k==='sefl'||k==='sefr'||k==='st');return L;}
 const ex=ps.filter(k=>SED.exp[k]),wsum=ex.reduce((a,k)=>a+(k==='psi'?3:1),0)||1;let y=L.trendY;
 for(const k of ex){const h=L.trendH*(k==='psi'?3:1)/wsum;L.rows.push({k,y,h});y+=h;}
 L.well=ps.filter(k=>!SED.exp[k]);return L;}
// ----- the series behind the plots -----
const sedLb=(h,t)=>{let lo=0,hi=h.length;while(lo<hi){const m=(lo+hi)>>1;if(h[m].n<t)lo=m+1;else hi=m;}return lo;};
// history of one side: the seeded earlier trend, then the live columns (never touches HIST)
function sedHist(s){const live=s==='R'?R.HIST:HIST,p=(SED.pre&&SED.pre[s])||[],c=SED.hc||(SED.hc={}),k=c[s],last=live.length?live[live.length-1].n:-1;
 if(k&&k.len===live.length&&k.last===last&&k.p===p)return k.arr;const arr=p.length?p.concat(live):live.slice();c[s]={len:live.length,last,p,arr};return arr;}
// ASYM: signed percent difference of the left and right EEG power (positive: the left side is stronger); tp is total power in dB
const sedAsym=(tpL,tpR)=>{const pl=Math.pow(10,tpL/10),pr=Math.pow(10,tpR/10);return 100*(pl-pr)/(pl+pr+1e-9);};
const emgPct=e=>clampv(Math.round((e.emg-SED.emgOff())*100/SED.emgSpan()),0,100);
const sedGap=n=>{for(const g of SED.gaps)if(n>=g[0]&&n<=(g[1]==null?1e12:g[1]))return true;return false;};
// per-second values of the shown parameters from one pair of columns (null = not available)
function sedVals(l,r,artfPct){const blankL=l.sqi<15||l.bis==null,blankR=r.sqi<15||r.bis==null,out={};
 const bl=blankL?null:l.bis,br=blankR?null:r.bis,m=bl!=null&&br!=null?(bl+br)/2:bl!=null?bl:br;
 out.psi=m==null||artfPct>50?null:psiOf(m);out.emg=Math.max(emgPct(l),emgPct(r));out.sr=(l.bsr+r.bsr)/2;out.artf=artfPct;out.sefl=l.sef!=null&&!blankL?l.sef:null;out.sefr=r.sef!=null&&!blankR?r.sef:null;out.st=Math.max(l.st||0,r.st||0);return out;}
function sedData(){const hL=sedHist('L'),hR=sedHist('R'),now=simT,tE=SED.hold==null?now:Math.min(now,SED.hold),W=SED.range*60,tS=tE-W,sp=W/NPX,D={tE,tS,W,sp,now,len:hL.length,ser:{}};
 for(const k of SED_PARAMS)D.ser[k]={s:new Float32Array(NPX),c:new Uint16Array(NPX)};
 let i0=Math.max(0,sedLb(hL,tS)-60),ring=[],rs=0;
 for(let i=i0;i<hL.length&&i<hR.length;i++){const l=hL[i],r=hR[i];if(l.n>tE)break;
  const a=l.art||l.sqi<15||r.art?1:0;ring.push(a);rs+=a;if(ring.length>60)rs-=ring.shift();
  if(l.n<tS)continue;const p=Math.floor((l.n-tS)/sp);if(p<0||p>=NPX||sedGap(l.n))continue;
  const v=sedVals(l,r,100*rs/ring.length);for(const k of SED_PARAMS){if(v[k]==null)continue;const q=D.ser[k];q.s[p]+=v[k];q.c[p]++;}}
 // fill: the mean per column (null where none), with the newest column carried to the right edge
 for(const k of SED_PARAMS){const q=D.ser[k],o=new Array(NPX);for(let p=0;p<NPX;p++)o[p]=q.c[p]?q.s[p]/q.c[p]:null;D.ser[k]=o;}
 D.hL=hL;D.hR=hR;D.start=hL.length?hL[0].n:now;return D;}
// numbers shown now (the live second; the scroll position does not change them)
function sedNums(){const hL=sedHist('L'),hR=sedHist('R'),n=Math.min(hL.length,hR.length);if(!n)return null;const l=hL[n-1],r=hR[n-1],blank=SED.sim.disc||SED.sim.off||SED.sim.none;
 let a=0;for(let i=Math.max(0,n-60);i<n;i++)if(hL[i].art||hL[i].sqi<15||hR[i].art)a++;const artf=100*a/Math.min(60,n),v=sedVals(l,r,artf);
 let pl=0,pr=0;for(let i=Math.max(0,n-30);i<n;i++){pl+=Math.pow(10,hL[i].tp/10);pr+=Math.pow(10,hR[i].tp/10);}const as=sedAsym(10*Math.log10(pl+1e-9),10*Math.log10(pr+1e-9));
 return {v,blank,asym:as,l,r,sqiMin:Math.min(l.sqi,r.sqi)};}
// ----- the DSA (two spectrograms and the ASYM strip), one image per side, repainted when a column arrives -----
function sedPaintDsa(D){const hz=SED.set.maxHz,hi=SED.set.dsaHi,lo=SED.set.dsaLo,mt=SED.set.dsaType==='Multitaper',tS=D.tE-1200,sp=1200/DW;
 for(const s of ['L','R']){let o=SED['cv'+s];if(!o){const cv=document.createElement('canvas');cv.width=DW;cv.height=LH;o=SED['cv'+s]={cv,img:cv.getContext('2d').createImageData(DW,LH)};}
  const h=s==='L'?D.hL:D.hR,d=o.img.data,rows=LH,ci=new Int16Array(rows),flag=new Uint8Array(DW),sef=new Float32Array(DW).fill(-1);d.fill(0);for(let i=3;i<d.length;i+=4)d[i]=255;
  const i0=sedLb(h,tS);let lastX=-1;
  for(let j=i0;j<h.length;j++){const c=h[j];if(c.n>D.tE)break;const x=Math.floor((c.n-tS)/sp);if(x<0||x>=DW)continue;const xq=x-(x%2);
   const gap=sedGap(c.n),sqibad=c.sqi<15;
   if(gap||sqibad){flag[x]=Math.max(flag[x],1);continue;}
   if(c.art&&SED.set.dsaArt){flag[x]=Math.max(flag[x],3);}
   if(c.sp){flag[x]=Math.max(flag[x],2);continue;}
   const pv=h[j-1],nx=h[j+1],bins=c.db;
   // the picture is made of 2 x 2 pixel cells (nearest neighbour, no smoothing), as on the real screen
   for(let y=0;y<rows;y+=2){const f=(s==='L'?(rows-2-y):y)*hz/rows+hz/rows,b=f/0.5;let v;if(b>=NB-1)v=-1e9;else{const k=Math.floor(b),fr=b-k,g=(q)=>q[k]*(1-fr)+q[k+1]*fr;
     if(mt&&pv&&nx&&pv.db&&nx.db){v=0.5*g(bins)+0.25*(g(pv.db)+g(nx.db));}else v=g(bins);}
    const real=-35+2.1*v,fr2=clampv((real-lo)/(hi-lo),0,1),q=SED_LUT[Math.round(fr2*50)];
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const i=((y+dy)*DW+xq+dx)*4;d[i]=q[0];d[i+1]=q[1];d[i+2]=q[2];}}
   if(c.sef!=null)sef[x]=c.sef;}
  const cx=o.cv.getContext('2d');cx.putImageData(o.img,0,0);
  // flagged columns: artefact (a white line), suppression (a black bar with a blue tick at the 0 Hz edge), no data (a black bar)
  for(let x=0;x<DW;x++){const f=flag[x];if(!f)continue;
   if(f===3){cx.fillStyle='#fff';cx.fillRect(x-1,0,2,rows);}
   else{cx.fillStyle='#000';cx.fillRect(x-2,0,5,rows);if(f===2){cx.fillStyle='#3349a5';cx.fillRect(x-2,s==='L'?rows-4:0,6,4);}}}
  // the 95% spectral edge as a white stair line
  const th=SED.set.sefThick;cx.fillStyle='#fff';let py=null;
  for(let x=0;x<DW;x++){if(flag[x]===1||flag[x]===2||sef[x]<0){py=null;continue;}const hzv=Math.round(sef[x]),y=s==='L'?rows-hzv*rows/hz:hzv*rows/hz;
   if(y<-2||y>rows+2){py=null;continue;}cx.fillRect(x,Math.round(y-th/2),1,th);if(py!=null&&py!==y)cx.fillRect(x,Math.round(Math.min(y,py)-th/2),1,Math.abs(y-py)+th);py=y;}}
 // ASYM: signed, white filled area (up where the left side is stronger), grey bars where artefact marked the DSA
 let a=SED.cvA;if(!a){const cv=document.createElement('canvas');cv.width=DW;cv.height=53;a=SED.cvA={cv};}
 const cx=a.cv.getContext('2d'),H=53,mid=26;cx.fillStyle='#100f0d';cx.fillRect(0,0,DW,H);
 const hL=D.hL,hR=D.hR,i0=sedLb(hL,tS),vals=new Float32Array(DW).fill(NaN),art=new Uint8Array(DW),cnt=new Uint16Array(DW);
 for(let j=i0;j<hL.length&&j<hR.length;j++){const l=hL[j],r=hR[j];if(l.n>D.tE)break;const x=Math.floor((l.n-tS)/sp);if(x<0||x>=DW||sedGap(l.n))continue;
  if(l.art||r.art){art[x]=1;}const v=sedAsym(l.tp,r.tp);vals[x]=(isNaN(vals[x])?0:vals[x])+v;cnt[x]++;}
 cx.strokeStyle='#3a3938';cx.lineWidth=1;cx.setLineDash([2,3]);for(const y of [1.5,H-1.5]){cx.beginPath();cx.moveTo(0,y);cx.lineTo(DW,y);cx.stroke();}cx.setLineDash([]);
 if(SED.set.dsaArt){cx.fillStyle='#666768';for(let x=0;x<DW;x++)if(art[x])cx.fillRect(x-3,0,8,H);}
 cx.fillStyle='#fff';let sm=null;for(let x=0;x<DW;x++){if(!cnt[x]){sm=null;continue;}const v=vals[x]/cnt[x];sm=sm==null?v:sm*.82+v*.18;const hh=sm*(mid-3)/100;if(Math.abs(hh)<1)cx.fillRect(x,mid,1,1);else if(hh>0)cx.fillRect(x,mid-hh,1,hh+1);else cx.fillRect(x,mid,1,-hh);}
 cx.fillStyle='#fff';cx.fillRect(0,mid,DW,1);}
// ----- icons and small drawings -----
function sIcoBell(c,x,y,s,col){c.save();c.translate(x,y);c.scale(s/24,s/24);c.fillStyle=col;c.beginPath();c.moveTo(12,2.4);c.bezierCurveTo(10.9,2.4,10.1,3.2,10.1,4.3);c.lineTo(10.1,4.8);c.bezierCurveTo(7.5,5.5,6,7.8,6,10.7);c.lineTo(6,14.4);c.lineTo(4.1,17);c.lineTo(4.1,18);c.lineTo(19.9,18);c.lineTo(19.9,17);c.lineTo(18,14.4);c.lineTo(18,10.7);c.bezierCurveTo(18,7.8,16.5,5.5,13.9,4.8);c.lineTo(13.9,4.3);c.bezierCurveTo(13.9,3.2,13.1,2.4,12,2.4);c.closePath();c.fill();c.beginPath();c.arc(12,19.4,2.1,0,Math.PI);c.fill();c.restore();}
function sIcoSpk(c,x,y,s,col,waves,cross){c.save();c.translate(x,y);c.scale(s/24,s/24);c.fillStyle=col;c.strokeStyle=col;c.lineWidth=1.7;c.lineCap='round';c.beginPath();c.moveTo(3,9);c.lineTo(7,9);c.lineTo(12,4.5);c.lineTo(12,19.5);c.lineTo(7,15);c.lineTo(3,15);c.closePath();c.fill();
 if(waves)for(let i=1;i<=3;i++){c.beginPath();c.arc(12,12,3+i*3.1,-0.72,0.72);c.stroke();}
 if(cross){c.lineWidth=2.4;c.beginPath();c.moveTo(14,8);c.lineTo(22,16);c.moveTo(22,8);c.lineTo(14,16);c.stroke();}c.restore();}
function sIcoNet(c,x,y,s,col){c.save();c.translate(x,y);c.scale(s/24,s/24);c.strokeStyle=col;c.lineWidth=1.8;c.strokeRect(8,2,8,6);c.strokeRect(1.5,16,6,6);c.strokeRect(9,16,6,6);c.strokeRect(16.5,16,6,6);c.beginPath();c.moveTo(12,8);c.lineTo(12,16);c.moveTo(4.5,16);c.lineTo(4.5,12);c.lineTo(19.5,12);c.lineTo(19.5,16);c.stroke();c.restore();}
function sIcoIris(c,x,y,s,col){c.save();c.translate(x,y);c.scale(s/24,s/24);c.strokeStyle=col;c.lineWidth=2;for(const [a,b] of [[2,2],[13,2],[2,13],[13,13]]){sRR(c,a,b,9,9,3);c.stroke();}c.restore();}
function sIcoBatt(c,x,y,w,h,col,frac){c.save();c.strokeStyle='#cfd2cf';c.lineWidth=1.6;c.strokeRect(x+.8,y+.8,w-3.6,h-1.6);c.fillStyle='#cfd2cf';c.fillRect(x+w-2.6,y+h*.32,2.6,h*.36);c.fillStyle=col;c.fillRect(x+3,y+3,(w-8)*frac,h-6);c.restore();}
function sIcoFlag(c,x,y,s,col){c.save();c.translate(x,y);c.scale(s/32,s/32);c.fillStyle=col;c.beginPath();c.moveTo(2,3);c.lineTo(20,2);c.bezierCurveTo(24,1,28,6,24,8);c.lineTo(14,13);c.lineTo(9,12);c.closePath();c.fill();c.strokeStyle=col;c.lineWidth=2.6;c.lineCap='round';c.beginPath();c.moveTo(2,3);c.lineTo(10,28);c.stroke();c.restore();}
function sIcoGear(c,x,y,s,col){c.save();c.translate(x+s/2,y+s/2);c.fillStyle=col;const r1=s*.5,r0=s*.36;c.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?r0:r1,a2=a-Math.PI/16;c.lineTo(Math.cos(a2)*r,Math.sin(a2)*r);c.lineTo(Math.cos(a2+Math.PI/16)*r,Math.sin(a2+Math.PI/16)*r);}c.closePath();c.fill();c.globalCompositeOperation='destination-out';c.beginPath();c.arc(0,0,s*.17,0,7);c.fill();c.restore();}
function sChev(c,x,y,w,col,up,dbl){c.save();c.strokeStyle=col;c.lineWidth=2;c.lineCap='round';c.lineJoin='round';const d=up?-1:1;for(let k=0;k<(dbl?2:1);k++){const yy=y+d*(dbl?(k?5:-3):0);c.beginPath();c.moveTo(x-w/2,yy-d*3);c.lineTo(x,yy+d*3);c.lineTo(x+w/2,yy-d*3);c.stroke();}c.restore();}
// ----- the whole static screen -----
const sedAlarmCol=lv=>lv==='hi'?'#ed1c24':'#f9ca07';
function sedDrawStatic(){const cv=SED.cv;if(!cv)return;const dpr=Math.min(2,window.devicePixelRatio||1),w=cv.clientWidth||400,k=w*dpr/800;
 if(cv._w!==Math.round(800*k)){cv.width=Math.round(800*k);cv.height=Math.round(1280*k);cv._w=cv.width;}const c=cv.getContext('2d');c.setTransform(k,0,0,k,0,0);c.clearRect(0,0,800,1280);
 const D=SED.D,N=SED.N,L=SED.L=sedLay(),A=SED.alm,set=SED.set;
 c.fillStyle=SC.bg;c.fillRect(0,0,800,1280);
 sedStatusBar(c,A);sedWindow(c,A);
 if(!D)return;
 sedTrends(c,D,N,L,A);sedWell(c,D,N,L,A);sedDsa(c,D,N,L);sedScrub(c,D,L);
 // bottom icons
 sIcoFlag(c,25,1241,30,'#bfbebc');sIcoGear(c,752,1238,38,'#bebdbb');
 // a system alarm (battery) outlines the whole display
 if(A&&A.sys){c.strokeStyle='#f9ca07';c.lineWidth=5;c.strokeRect(2.5,2.5,795,1275);}}
function sedStatusBar(c,A){
 // bell tile
 const act=A&&A.level,sil=SED.silenceUntil>Date.now(),col=act?sedAlarmCol(A.level):null;
 c.save();if(act){c.shadowColor=col;c.shadowBlur=14;}sRR(c,8,5,60,60,8);c.fillStyle=act?col:'#131110';c.fill();c.restore();
 if(!act){c.strokeStyle='#201e1c';c.lineWidth=1;sRR(c,8.5,5.5,59,59,8);c.stroke();}
 sIcoBell(c,18,15,40,act?'#fff':'#4b4b4c');
 if(sil&&(act||SED.silenceShown)){c.strokeStyle=act?'#fff':'#9a9a9a';c.lineWidth=3.2;c.lineCap='round';c.beginPath();c.moveTo(20,17);c.lineTo(56,53);c.stroke();}
 // audio pause tile
 const ap=SED.pauseUntil>Date.now()||SED.pausePerm;
 sRR(c,78,5,60,60,7);if(ap){c.fillStyle='#c01c24';c.fill();}else{const g=c.createLinearGradient(0,5,0,65);g.addColorStop(0,'#c9c8c7');g.addColorStop(1,'#e6e5e4');c.fillStyle=g;c.fill();}
 if(ap){sIcoSpk(c,86,8,28,'#fff',true,true);const left=Math.ceil((SED.pauseUntil-Date.now())/1000);if(!SED.pausePerm)sT(c,String(Math.max(0,left)),108,57,17,'#fff','center',600);else sT(c,'∞',108,58,19,'#fff','center',600);}
 else sIcoSpk(c,86,13,44,'#222',true,false);
 // standby (only when enabled in Access Control)
 if(SED.set.standby){sRR(c,148,5,60,60,7);const g=c.createLinearGradient(0,5,0,65);g.addColorStop(0,'#c9c8c7');g.addColorStop(1,'#e6e5e4');c.fillStyle=g;c.fill();c.strokeStyle='#222';c.lineWidth=4;c.lineCap='round';c.beginPath();c.arc(178,36,13,-1.1,Math.PI*2-2.04,false);c.moveTo(178,16);c.lineTo(178,34);c.stroke();}
 // profile pill
 const ped=SED.set.profile==='PEDIATRIC',px=ped?400:431,pw=ped?118:87;sRR(c,px,10,pw,23,11.5);const g=c.createLinearGradient(0,10,0,33);if(ped){g.addColorStop(0,'#439153');g.addColorStop(1,'#006a28');}else{g.addColorStop(0,'#3ea7d7');g.addColorStop(1,'#2778b4');}c.fillStyle=g;c.fill();
 sT(c,SED.set.profile,px+pw/2,28,18,'#fff','center',500);
 sIcoNet(c,539,7,26,'#cfd2cf');sIcoIris(c,582,7,26,'#cfd2cf');
 sIcoBatt(c,626,9,26,18,SED.sim.batt?'#e4a01c':'#64c431',SED.sim.batt?.2:1);
 sIcoSpk(c,668,6,26,'#cfd2cf',true,false);
 sT(c,sedClock(simT,false),787,28,22,'#fff','right',400);
 if(SED.sim.batt)sT(c,'Low Battery',420,28,17,'#f9ca07','right',600);}
function sedWindow(c,A){const win=A&&A.win,col=win?sedAlarmCol(win.level):null,par=A&&A.curPar&&A.par;
 // frame and title band
 sRR(c,8,80,784,1107,6);c.fillStyle=SC.bg;c.fill();c.strokeStyle=win?col:'#232120';c.lineWidth=win?2.5:1.2;c.stroke();
 const gg=c.createLinearGradient(0,80,0,110);const tint=win?(win.level==='hi'?['#7a1820','#4a1416']:['#8a6e10','#5a470a']):par?(par.level==='hi'?['#c01c24','#8a1218']:['#b8962a','#8d7218']):['#211e1e','#1c1a1a'];gg.addColorStop(0,tint[0]);gg.addColorStop(1,tint[1]);
 c.save();sRR(c,9,81,782,29,5);c.clip();c.fillStyle=gg;c.fillRect(8,80,784,30);c.restore();
 sT(c,'SedLine',18,102,23,win?(win.level==='hi'?'#ff5a5a':'#f9ca07'):par?'#e8d9a0':'#afafae','left',600,true);sT(c,'TM',92,92,6,'#8a8987','left',400);
 if(SED.set.emgSens==='Maximum')sT(c,'EMG MAX',600,102,15,'#8a8a88','center',400);
 // the pill with the message
 if(A&&A.text){const t=A.text;c.font=`600 18px ${SED_FONT}`;const tw=c.measureText(t).width+34;sRR(c,400-tw/2,83,tw,24,12);c.fillStyle=win&&win.level==='hi'?'#4a1416':par?'#3a2e0e':'#1c1a1a';c.fill();sT(c,t,400,101,18,'#fff','center',600);}
 // the action tab (a blue one with an up chevron under the open menu)
 if(SED.pop&&SED.pop.kind==='action'){sRR(c,705,189,80,21,4);const g=c.createLinearGradient(0,189,0,210);g.addColorStop(0,'#3f95d8');g.addColorStop(1,'#2a76b4');c.fillStyle=g;c.fill();sChev(c,745,199,18,'#fff',true,true);}
 else{sRR(c,703,85,84,25,4);c.fillStyle='#161413';c.fill();c.strokeStyle='#2b2a2a';c.lineWidth=1;c.stroke();c.strokeStyle='#bdbdbd';c.lineWidth=1.8;c.lineCap='round';c.beginPath();c.moveTo(737,93);c.lineTo(753,93);c.stroke();sChev(c,745,100,18,'#bdbdbd',false,false);}}
// ----- the trend rows -----
function sedMap(k){const s=SED.set;switch(k){case 'psi':return {max:s.psiYmax,min:s.psiYmin,inv:false};case 'emg':return {max:s.emgYmax,min:s.emgYmin};case 'sr':return {max:s.srYmax,min:s.srYmin,inv:true};case 'artf':return {max:s.artfYmax,min:s.artfYmin};case 'sefl':return {max:s.sefYmax,min:s.sefYmin};case 'sefr':return {max:s.sefYmax,min:s.sefYmin};default:return {max:100,min:0};}}
function sedFmt(k,N,full){const q=N&&N.v;if(!q||N.blank)return null;const v=q[k];if(v==null)return null;
 if(k==='psi'||k==='emg')return String(Math.round(v));if(k==='sr')return String(Math.round(v/2)*2);if(k==='artf')return v.toFixed(full?1:0);if(k==='sefl'||k==='sefr')return v.toFixed(1);
 if(k==='st'){const sec=Math.round(v);return SED.set.stUnit==='%'?String(Math.min(100,Math.round(100*sec/Math.max(60,simT-(SED.D?SED.D.start:0)))))+'%':pad2(Math.floor(sec/3600))+':'+pad2(Math.floor(sec/60)%60);}return String(v);}
function sedTrends(c,D,N,L,A){const s=SED.set;
 if(SED.view==='analog'){sedGauges(c,N,A);return;}
 const dsaTint=SED.range>=60;
 L.rows.forEach((r,i)=>{const k=r.k,y0=r.y,h=r.h,m=sedMap(k),ser=D.ser[k],tall=h>120,top=y0+(tall?10:8),bot=y0+h-(tall?17:10),yv=v=>{const f=clampv((v-m.min)/(m.max-m.min),0,1);return m.inv?top+f*(bot-top):bot-f*(bot-top);};
  c.fillStyle=SC.bg;c.fillRect(12,y0,775,h);if(i>0){c.fillStyle=SC.sep;c.fillRect(12,y0,775,1);}
  const alarmHere=A&&A.par&&A.par.k===k;
  // PSi: green target band and the fills beyond it
  if(k==='psi'){const ty=yv(s.psiTmax),by=yv(s.psiTmin);c.fillStyle='#1d2217';c.fillRect(PX0,ty,PX1-PX0,by-ty);c.strokeStyle='#75a02b';c.lineWidth=1;c.setLineDash([1.5,2.5]);for(const yy of [ty,by]){c.beginPath();c.moveTo(PX0,yy+.5);c.lineTo(PX1,yy+.5);c.stroke();}c.setLineDash([]);
   const seg=(cmp,line,c0,c1,yl)=>{let st=null;const flush=e=>{if(st==null)return;c.save();c.beginPath();c.rect(PX0,Math.min(line,yl),PX1-PX0,Math.abs(yl-line));c.clip();c.beginPath();c.moveTo(PX0+st,line);for(let p=st;p<=e;p++)c.lineTo(PX0+p+.5,yv(ser[p]));c.lineTo(PX0+e+1,line);c.closePath();const g=c.createLinearGradient(0,cmp>0?top:bot,0,line);g.addColorStop(0,c0);g.addColorStop(1,c1);c.fillStyle=g;c.fill();c.restore();st=null;};
    for(let p=0;p<NPX;p++){const v=ser[p];if(v!=null&&(cmp>0?v>(cmp>0?s.psiTmax:0):v<s.psiTmin)){if(st==null)st=p;}else flush(p-1);}flush(NPX-1);};
   seg(1,ty,'#b2791d','#684219',top);seg(-1,by,'#293e94','#171d3b',bot);}
  // axis labels and the plot's ticks
  const lab=k==='psi'?[m.max,Math.round((m.max+m.min)/2),m.min]:m.inv?[m.min,m.max]:[m.max,m.min];
  lab.forEach((v,j)=>{const yy=yv(v);sT(c,String(v),47,yy+6,17,SC.dim,'right',400);});
  c.fillStyle='#3a3938';for(let t=0;t<=12;t++)c.fillRect(PX0+t*(PX1-PX0)/12,y0+h-4,1,3);
  // the line and its end dot
  c.strokeStyle=SC.yel;c.lineWidth=2;c.lineJoin='round';c.beginPath();let pen=false,lastp=-1;for(let p=0;p<NPX;p++){const v=ser[p];if(v==null){pen=false;continue;}const x=PX0+p+.5,y=yv(clampv(v,m.min,m.max));pen?c.lineTo(x,y):c.moveTo(x,y);pen=true;lastp=p;}c.stroke();
  if(lastp>=0){c.fillStyle=SC.dot;c.beginPath();c.arc(PX1,yv(clampv(ser[lastp],m.min,m.max)),6,0,7);c.fill();}
  // the alarm: panel outline and a gradient in the alarm colour behind the number
  if(alarmHere){const col=sedAlarmCol(A.par.level),g=c.createLinearGradient(530,0,787,0);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,A.par.level==='hi'?'#d2202a':'#c8a62e');c.fillStyle=g;c.fillRect(530,y0+1,257,h-2);c.strokeStyle=col;c.lineWidth=3;c.strokeRect(13.5,y0+1.5,772,h-3);}
  // the number and its labels
  const txt=sedFmt(k,N),yc=y0+h/2,white=alarmHere;
  const big=k==='psi'?92:52;sT(c,txt==null?'--':txt,k==='psi'?705:708,yc+big*.33,big,white?'#fff':SC.yel,'right',400,false,.88);
  if(k==='psi'){const ph=s.psiHi,pl=s.psiLo;sT(c,ph==null?'--':String(ph),780,yc-32,19,'#f8ca07','right');sT(c,pl==null?'--':String(pl),780,yc-14,19,'#f8ca07','right');sT(c,'PSI',780,yc+21,19,SC.unit,'right',500);
   if(alarmHere){sIcoBell(c,731,yc-52,22,'#fff');}}
  else{const lim=k==='sr'&&s.srHi!=null?String(s.srHi):null;if(lim)sT(c,lim,775,yc-10,13,SC.unit,'center');else{sT(c,'–',775,yc-11,13,SC.unit,'center');sT(c,'–',775,yc-4,13,SC.unit,'center');}
   sT(c,SED_NAME[k],762,yc+9,13,SC.unit,'center',500);if(SED_UNIT[k])sT(c,SED_UNIT[k],762,yc+21,13,SC.unit,'center',500);}
 });
 // the DSA WINDOW tint over the last 20 minutes of every trend row and the well
 if(dsaTint&&L.rows.length||dsaTint&&L.well.length){const x0=PX1-20/SED.range*(PX1-PX0),y0=L.trendY+3,y1=L.wellY+L.wellH;c.fillStyle='rgba(255,255,255,.07)';c.fillRect(x0,y0,PX1-x0+.5,y1-y0);sT(c,'DSA WINDOW',(x0+PX1)/2,y1-3,11,SC.dim,'center',400);}}
function sedWell(c,D,N,L,A){const ws=L.well;c.fillStyle=SC.bg;c.fillRect(12,L.wellY,775,L.wellH);if(!ws.length)return;
 const n=ws.length,one=n===1&&ws[0]==='psi';
 ws.forEach((k,i)=>{const cx=one?125:12+775*(i+.5)/n,txt=sedFmt(k,N,true),isP=k==='psi',alarmHere=A&&A.par&&A.par.k==='psi'&&isP,size=isP?58:62,base=L.wellY+L.wellH-14;
  if(alarmHere){c.fillStyle=A.par.level==='hi'?'rgba(237,28,36,.35)':'rgba(249,202,7,.28)';c.fillRect(cx-90,L.wellY+4,180,L.wellH-8);c.strokeStyle=sedAlarmCol(A.par.level);c.lineWidth=2;c.strokeRect(cx-90,L.wellY+4,180,L.wellH-8);}
  const t=txt==null?'--':txt,col=alarmHere?'#fff':SC.yel;let big=t,small='';const dot=t.indexOf('.');if(dot>0&&!isP&&k!=='st'){big=t.slice(0,dot);small=t.slice(dot);}
  c.font=`400 ${size}px ${SED_FONT}`;const w1=c.measureText(big).width*.9;c.font=`400 ${size*.62}px ${SED_FONT}`;const w2=small?c.measureText(small).width*.9:0;c.font=`500 19px ${SED_FONT}`;const nm=SED_NAME[k],w3=Math.max(c.measureText(nm).width,20),tot=w1+w2+8+w3,x0=cx-tot/2;
  sT(c,big,x0,base,size,col,'left',400,false,.9);if(small)sT(c,small,x0+w1,base,size*.62,col,'left',400,false,.9);
  sT(c,nm,x0+w1+w2+8,base-24,19,SC.unit,'left',500);sT(c,k==='st'?'':SED_UNIT[k],x0+w1+w2+8,base-4,14,SC.unit,'left',500);});}
// ----- the DSA block -----
function sedDsa(c,D,N,L){const y0=L.dsaY,hz=SED.set.maxHz,hi=SED.set.dsaHi,lo=SED.set.dsaLo,sp=SED.set;
 c.fillStyle=SC.bg;c.fillRect(12,y0,775,373);
 const o={L:SED.cvL,R:SED.cvR};c.imageSmoothingEnabled=(SED._k||1)<1;
 if(o.L)c.drawImage(o.L.cv,DX,y0+1,DW,LH);
 if(SED.cvA)c.drawImage(SED.cvA.cv,DX,y0+1+LH,DW,53);
 // the time axis band and the R spectrogram
 c.fillStyle='#000';c.fillRect(DX,y0+1+LH+53,DW,17);
 if(o.R)c.drawImage(o.R.cv,DX,y0+1+LH+70,DW,LH);
 c.imageSmoothingEnabled=true;
 const ty=y0+1+LH+53+13;c.fillStyle='#3a3938';
 for(let m=0;m<4;m++){const t=D.tE-m*300,x=DX+DW-m*300*DW/1200-(m?0:0);const lx=Math.min(DX+DW-36,x-36);sT(c,sedHms(t),lx+0,ty,16,'#adadab','center',400);c.fillRect(x-1,y0+1+LH+53,1,4);}
 // frequency labels, L at the bottom of its picture (0 Hz next to ASYM), R mirrored
 const ticks=hz===40?[0,10,20,30,40]:[0,15,30];
 for(const t of ticks){sT(c,String(t),46,y0+1+LH-t*LH/hz+(t===0?0:7),19,SC.dim,'right');sT(c,String(t),46,y0+1+LH+70+t*LH/hz+(t===0?7:t===hz?0:7),19,SC.dim,'right');}
 sT(c,'100',46,y0+LH+17,15,SC.dim,'right');sT(c,'0',46,y0+LH+31,15,SC.dim,'right');sT(c,'100',46,y0+LH+47,15,SC.dim,'right');
 // right gutter: the colour bar, its limits and the L, R and ASYM captions
 const g=c.createLinearGradient(0,y0+4,0,y0+370);SED_STOPS.forEach(s=>g.addColorStop(s[0],`rgb(${s[1].join(',')})`));c.fillStyle=g;c.fillRect(779,y0+3,5,367);
 sT(c,String(hi),775,y0+19,19,SC.dim,'right');sT(c,String(lo),775,y0+368,19,SC.dim,'right');
 sT(c,'L',762,y0+82,21,SC.dim,'right');sT(c,'R',762,y0+283,21,SC.dim,'right');
 sT(c,'ASYM',736,y0+LH+14,14,'#adadab','left');const a=N?N.asym:0,ar=Math.round(Math.abs(a)),at=SED.sim.disc||SED.sim.off||SED.sim.none||!N?'--':ar===0?'0':(a>0?'L':'R')+ar;
 sT(c,at,736,y0+LH+35,25,'#fff','left',400);sT(c,'%',736,y0+LH+50,13,'#adadab','left');}
function sedScrub(c,D,L){c.fillStyle='#151412';sRR(c,8,1190,784,42,5);c.fill();
 const x0=14,x1=555,span=Math.min(7200,Math.max(60,D.now-D.start)),t0=D.now-span,px=(x1-x0)/span;c.fillStyle='#232221';
 // the DSA window (20 min ending at the shown time) as a lighter box
 const wa=clampv(D.tE-1200,t0,D.now),wb=clampv(D.tE,t0,D.now);c.fillStyle='#2b2a2a';c.fillRect(x0+(wa-t0)*px,1191,(wb-wa)*px,40);
 sT(c,sedHm(t0),24,1209,17,'#989797','left');sT(c,sedDate(t0),20,1226,17,'#989797','left');c.fillStyle='#989797';c.fillRect(70,1193,1,16);
 const step=span<=2700?600:1800;let tk=Math.ceil((t0+1)/step)*step;c.font=`400 17px ${SED_FONT}`;
 // ticks on whole clock times
 const dT=new Date(T0+t0*1000),offs=(dT.getMinutes()*60+dT.getSeconds())%step;tk=t0+(step-offs)%step;if(tk-t0<150)tk+=step;
 for(;tk<D.now-130;tk+=step){const x=x0+(tk-t0)*px;if(x<140||x>x1-125)continue;sT(c,sedHm(tk),x-2,1209,17,'#989797','right');c.fillStyle='#989797';c.fillRect(x,1193,1,16);c.fillRect(x,1226,1,5);}
 sT(c,sedClock(D.tE,true),x1-3,1209,17,'#989797','right');c.fillStyle='#989797';c.fillRect(x1,1193,1,16);
 if(SED.range!==SED.range&&0)return;
 if(D.tE>D.start+1)sT(c,'DSA WINDOW',(x0+(wa-t0)*px+x0+(wb-t0)*px)/2+ (wb-wa)*px/2-45,1229,10,SC.dim,'center');
 // events (flags) dropped by the flag key
 c.fillStyle='#f9ca07';for(const e of SED.events){if(e<t0||e>D.now)continue;const x=x0+(e-t0)*px;c.fillRect(x-1,1214,2,13);}
 // zoom
 sRR(c,560,1192,75,38,4);c.fillStyle='#121110';c.fill();sRR(c,705,1192,85,38,4);c.fill();
 sT(c,'−',597,1219,26,'#dad9d8','center',400);sT(c,'+',747,1219,26,'#dad9d8','center',400);
 const h=SED.range,lab=h>=60?(h/60)+':00 h':'0:'+pad2(h)+' h';sT(c,lab,670,1220,21,'#7a7b7d','center',400);}
// ----- the Analog view: a PSi gauge and two small ones -----
function sedGaugeArc(c,cx,cy,rIn,rOut,a0,a1,n,gap,cols){const da=(a1-a0)/n;for(let i=0;i<n;i++){const s=a0+i*da+gap/2,e=a0+(i+1)*da-gap/2;c.beginPath();c.arc(cx,cy,rOut,s,e);c.arc(cx,cy,rIn,e,s,true);c.closePath();c.fillStyle=cols[i];c.fill();}}
function sedNeedle(c,cx,cy,ang,r0,r1,wd){c.save();c.translate(cx,cy);c.rotate(ang);c.beginPath();c.moveTo(r1,0);c.lineTo(r0,-wd/2);c.lineTo(r0,wd/2);c.closePath();c.fillStyle='#f26f21';c.fill();c.restore();}
function sedGauges(c,N,A){const s=SED.set;c.fillStyle=SC.bg;c.fillRect(12,410,775,322);
 const hiV=s.psiHi==null?100:s.psiHi,loV=s.psiLo==null?0:s.psiLo,t=N&&!N.blank&&N.v.psi!=null?N.v.psi:null,al=A&&A.par&&A.par.k==='psi';
 // dashes: red below the low limit, white in range, red above (about ten in all); caution ranges recolour the edge dashes
 const nLo=loV>0?Math.max(1,Math.round(loV/10)):0,nHi=hiV<100?Math.max(1,Math.round((100-hiV)/10)):0,nMid=Math.max(1,10-nLo-nHi),cols=[];
 for(let i=0;i<nLo;i++)cols.push('#c31e26');for(let i=0;i<nMid;i++)cols.push('#f0f1f3');for(let i=0;i<nHi;i++)cols.push('#c31e26');
 if(s.psiCL!=null&&nMid>1)cols[nLo]='#f9ca07';if(s.psiCH!=null&&nMid>1)cols[nLo+nMid-1]='#f9ca07';
 const a0=Math.PI*(185/180),a1=Math.PI*(355/180);
 sedGaugeArc(c,206,622,114,136,a0,a1,cols.length,0.052,cols);
 const ang=v=>a0+(a1-a0)*clampv(v,0,100)/100;
 if(hiV<100){const a=ang(hiV);sT(c,String(hiV),206+150*Math.cos(a),622+150*Math.sin(a)+2,16,'#aeaeac','center');}
 if(loV>0){const a=ang(loV);sT(c,String(loV),206+150*Math.cos(a)-6,622+150*Math.sin(a)+6,16,'#aeaeac','center');}
 if(t!=null)sedNeedle(c,206,622,ang(t),64,122,11);
 sT(c,t==null?'--':String(Math.round(t)),210,616,96,al?'#fff':SC.yel,'center',400);sT(c,'PSI',206,685,34,SC.unit,'center',400);
 if(al){c.strokeStyle=sedAlarmCol(A.par.level);c.lineWidth=3;c.strokeRect(14,425,380,290);}
 const mini=(cy,name,v,val)=>{const cx=612,ang2=Math.PI+Math.PI*clampv(v==null?0:v,0,100)/100;sedGaugeArc(c,cx,cy,64,77,Math.PI,2*Math.PI,6,0.06,['#f0f1f3','#f0f1f3','#f0f1f3','#f0f1f3','#f0f1f3','#f0f1f3']);
  sedNeedle(c,cx,cy+6,ang2,36,96,6);sT(c,val==null?'--':val,cx,cy-8,52,SC.yel,'center',400);sT(c,name,cx,cy+40,24,SC.unit,'center',400);};
 mini(510,'EMG %',N&&!N.blank?N.v.emg:null,sedFmt('emg',N));mini(678,'SR',N&&!N.blank?N.v.sr/2*2:null,sedFmt('sr',N));
 // the well is drawn by sedWell (ARTF, SEFL, SEFR)
}
// ----- the EEG panel (its own canvas, redrawn every frame; the sweep moves, it does not scroll) -----
function sedDrawEeg(){const cv=SED.cvE;if(!cv)return;const dpr=Math.min(2,window.devicePixelRatio||1),w=cv.clientWidth||400,k=w*dpr/800;
 if(cv._w!==Math.round(800*k)){cv.width=Math.round(800*k);cv.height=Math.round(300*k);cv._w=cv.width;}const c=cv.getContext('2d');c.setTransform(k,0,0,k,0,0);c.clearRect(0,0,800,300);
 const A=SED.alm,s=SED.set,gone=SED.sim.disc||SED.sim.none||SED.sim.off;
 // panel (design y 110..410 becomes 0..300 here)
 c.fillStyle='#10131a';c.fillRect(12,0,775,300);c.fillStyle=SC.eeg;c.fillRect(50,0,737,300);
 // the dotted time grid, one second apart (two at 15 mm/s)
 const mm=s.eegSpeed===15?15:30,N=Math.round(737/(6.43*mm/30*1.0)*0+ (mm===30?530:1060)),pxs=737/N; // samples across the panel: about 4.1 s at 30 mm/s, 8.3 s at 15 mm/s
 c.strokeStyle='rgba(150,160,180,.35)';c.lineWidth=1;c.setLineDash([2,4]);for(const x of [208,401,594]){c.beginPath();c.moveTo(x+.5,0);c.lineTo(x+.5,300);c.stroke();}c.setLineDash([]);
 const ys=[38,112,188,263],names=['L1','R1','L2','R2'],ppu=6.43/s.eegAmp; // px per microvolt
 names.forEach((nm,i)=>sT(c,nm,22,ys[i]+8,22,SC.dim,'left',400));
 if(!gone&&SIG.length>N*2&&R.SIG.length>N*2){
  const pos=Math.floor((produced%N)),cur=produced;
  const src=[SIG,R.SIG,SIG,R.SIG],lag=[0,0,3,3],gn=[1,1,.82,.82];
  for(let ch=0;ch<4;ch++){const sig=src[ch],yc=ys[ch];if(SED.sim.hiz&&ch===2)continue;
   const at=(idx)=>{const j=sig.length-1-(cur-1-idx)-lag[ch];return sig[Math.max(0,Math.min(sig.length-1,j))];};
   // display filter: a 3-point smoother, a gain of 0.6 and a soft limit (a big artefact still reaches further; nothing is clipped)
   const val=(idx)=>{const v=(at(idx-1)+2*at(idx)+at(idx+1))/4*gn[ch]*0.6+(ch>1?0.6*Math.sin(idx*0.9+ch):0)+(s.eegFilter?0:0.8*Math.sin(idx*2.1));return Math.tanh(v/70)*70*ppu;};
   const clip=()=>{c.save();c.beginPath();c.rect(50,0,737,300);c.clip();};
   // newer sweep: samples cur-pos .. cur-1 drawn at x 50 .. 50+pos*pxs
   clip();c.strokeStyle=SC.yel;c.lineWidth=2;c.lineJoin='round';c.beginPath();for(let q=0;q<pos;q++){const x=50+q*pxs,y=yc-val(cur-pos+q);q?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
   // the older sweep continues dimmed after a gap of about 55 px
   const gap=Math.round(55/pxs);c.globalAlpha=.4;c.beginPath();let on=false;for(let q=pos+gap;q<N;q++){const x=50+q*pxs,y=yc-val(cur-pos-N+q);on?c.lineTo(x,y):c.moveTo(x,y);on=true;}c.stroke();c.globalAlpha=.16;c.beginPath();on=false;for(let q=N-60;q<N;q++){const x=12+(q-(N-60))*pxs*0.64,y=yc-val(cur-pos-N+q);on?c.lineTo(x,y):c.moveTo(x,y);on=true;}c.stroke();c.restore();}
  // the sweep cursor (a white line, newer builds)
  if(s.cursor){const cx=50+pos*pxs;c.fillStyle='#fff';c.fillRect(cx-1,0,2,300);}}
 sT(c,mm+' mm/sec',55,290,18,'#b5b5b3','left',400);sT(c,s.eegAmp+' µV/mm',781,290,18,'#b5b5b3','right',400);
 // the pull-down handle and the electrode strip over the top of the panel
 if(SED.strip)sedStrip(c);else{sRR(c,366,-10,68,18,3);c.fillStyle='#1d1b1a';c.fill();c.fillStyle='#777';c.fillRect(384,2,32,1.5);c.fillRect(384,5.5,32,1.5);}}
// electrode strip: R2 R1 CT/CB L1 L2 with their impedances, coloured by state (all six dark grey when impedance monitoring is off)
function sedElec(){const S=SED.sim,s=SED.set;if(!s.monImp)return {state:{R2:'dark',R1:'dark',CT:'dark',CB:'dark',L1:'dark',L2:'dark'},k:{}};
 const b=SED.imp,st={},kv={};for(const n of ['R2','R1','CT','CB','L1','L2']){let v=b[n],t='green';
  if(S.disc){t='light';v=null;}else if(S.off){t='blue';v=65;}else{if(S.hiz&&n==='L2'){v=52+Math.sin(simT/9)*2;t='red';}if(S.gel&&(n==='CB'||n==='L1'))t='gel';
   if(t==='green'){if(v>35)t='red';else if(v>15)t='yellow';}}
  st[n]=t;kv[n]=v;}return {state:st,k:kv};}
function sedStrip(c){const e=SED.elec||sedElec(),col={green:'#57a133',yellow:'#f0cd15',red:'#ec1f24',blue:'#486fbf',light:'#a9aaa9',dark:'#7a7c7d',gel:'#7a7c7d'},lab={green:'#6bc03c',yellow:'#f0cd15',red:'#ec1f24',blue:'#6f8fe0',light:'#a9aaa9',dark:'#7a7c7d',gel:'#7a7c7d'};
 c.fillStyle='rgba(21,23,27,.9)';c.fillRect(12,0,775,68);c.fillStyle='#2b2a2a';c.fillRect(12,68,775,1);sT(c,'L1',22,34,16,SC.dim,'left',400);
 const icon=(n,x,y,w,h)=>{const t=e.state[n];c.fillStyle=col[t];sRR(c,x,y,w,h,4);c.fill();if(t==='gel'){c.strokeStyle='#2fd0c8';c.lineWidth=2;c.beginPath();c.moveTo(x+3,y+3);c.lineTo(x+w-3,y+h-3);c.moveTo(x+w-3,y+3);c.lineTo(x+3,y+h-3);c.stroke();c.strokeStyle='#cfd2cf';c.lineWidth=1;sRR(c,x,y,w,h,4);c.stroke();}};
 const kv=(n)=>{const v=e.k[n];return !SED.set.dispImp||v==null?'':(v>=65?'>65K':v.toFixed(1)+'K');};
 const lbl=(n,x,y)=>{sT(c,n,x,y,19,lab[e.state[n]],'left',400);const k=kv(n);if(k)sT(c,k,x,y+17,16,'#aeaeac','left',400);};
 lbl('R2',141,29);icon('R2',168,19,18,28);lbl('R1',249,29);icon('R1',274,19,18,28);
 lbl('CT',350,29);c.strokeStyle=col[e.state.CT];c.lineWidth=2;c.beginPath();c.moveTo(372,23);c.lineTo(385,23);c.moveTo(413,45);c.lineTo(425,45);c.stroke();icon('CT',385,14,28,16);icon('CB',385,36,28,16);lbl('CB',431,29);
 icon('L1',511,19,18,28);lbl('L1',538,29);icon('L2',615,19,18,28);lbl('L2',641,29);
 c.fillStyle='#777';c.fillRect(390,60,20,1.5);c.fillRect(390,63.5,20,1.5);}
