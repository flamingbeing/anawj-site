// BIS to DSA teaching simulator (bis-dsa/NOTES.md). Synthetic EEG -> FFT -> DSA columns -> a teaching BIS estimate.
// ===== EEG engine (shared with page) =====
const FS=128, NWIN=256, HOP=128, DF=FS/NWIN; // 0.5 Hz bins
const OSC_F=[]; for(let f=0.5;f<=47;f+=0.5) OSC_F.push(f);
function randn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
// spectral profile parameters (power units ~ uV^2 per 0.5 Hz bin)
const KEYS=['bg','slow','delta','theta','alpha','alphaF','beta','betaF','gamma','spindle','emg','bs'];
const S=(o)=>Object.assign({bg:6,slow:0,delta:0,theta:0,alpha:0,alphaF:10,beta:0,betaF:20,gamma:0,spindle:0,emg:0,bs:0},o);
const DRUGS={
 propofol:[[0,S({bg:3.5,alpha:3,alphaF:10,beta:6,betaF:21,gamma:2.6})],
  [0.15,S({bg:5,slow:2,delta:1,beta:14,betaF:17,gamma:2,alpha:2})],
  [0.32,S({bg:6,slow:25,delta:8,theta:2,alpha:14,alphaF:12,beta:5,betaF:15,gamma:0.6})],
  [0.55,S({bg:7,slow:110,delta:30,theta:4,alpha:55,alphaF:10.5,beta:0.8,betaF:15,gamma:0.1})],
  [0.75,S({bg:7,slow:190,delta:45,theta:4,alpha:16,alphaF:9,beta:0.2,betaF:14})],
  [0.88,S({bg:7,slow:170,delta:35,theta:3,alpha:15,alphaF:9,beta:0.2,bs:0.55})],
  [1,S({bg:7,slow:170,delta:35,theta:3,alpha:10,alphaF:9,beta:0.2,bs:1})]],
 sevo:[[0,S({bg:3.5,alpha:3,alphaF:10,beta:6,betaF:21,gamma:2.6})],
  [0.15,S({bg:5,slow:2,delta:1,beta:12,betaF:17,gamma:2,alpha:2})],
  [0.32,S({bg:6,slow:25,delta:8,theta:3,alpha:14,alphaF:11.5,beta:5,betaF:15,gamma:0.6})],
  [0.55,S({bg:7,slow:100,delta:30,theta:12,alpha:50,alphaF:10,beta:0.8,betaF:15,gamma:0.1})],
  [0.75,S({bg:7,slow:150,delta:45,theta:40,alpha:30,alphaF:8.5,beta:0.4})],
  [0.88,S({bg:7,slow:150,delta:40,theta:25,alpha:15,alphaF:8.5,beta:0.2,bs:0.5})],
  [1,S({bg:7,slow:150,delta:40,theta:20,alpha:10,alphaF:8.5,bs:1})]],
 ketamine:[[0,S({bg:3.5,alpha:3,alphaF:10,beta:6,betaF:21,gamma:2.6})],
  [0.3,S({bg:5,slow:6,delta:3,theta:3,alpha:1,beta:12,betaF:24,gamma:5})],
  [0.6,S({bg:6,slow:60,delta:15,theta:10,alpha:0.5,beta:9,betaF:26,gamma:9})],
  [1,S({bg:6,slow:90,delta:25,theta:14,alpha:0.5,beta:7,betaF:26,gamma:8})]],
 dex:[[0,S({bg:3.5,alpha:3,alphaF:10,beta:6,betaF:21,gamma:2.6})],
  [0.4,S({bg:6,slow:60,delta:20,theta:3,spindle:40,alphaF:13,beta:1.2,betaF:16,gamma:0.3})],
  [0.8,S({bg:7,slow:140,delta:35,theta:3,spindle:25,alphaF:13,beta:0.6,gamma:0.1})],
  [1,S({bg:7,slow:160,delta:40,theta:3,spindle:20,alphaF:13,beta:0.5})]],
};
function target(drug,d,mods){
 const kf=DRUGS[drug]; let i=0; while(i<kf.length-2&&d>kf[i+1][0])i++;
 const [d0,a]=kf[i],[d1,b]=kf[i+1]; const t=Math.max(0,Math.min(1,(d-d0)/(d1-d0)));
 const p={}; for(const k of KEYS)p[k]=a[k]+(b[k]-a[k])*t;
 if(mods&&mods.elderly){p.alpha*=0.2;p.spindle*=0.4;p.slow*=0.45;p.delta*=0.5;p.theta*=0.5;p.bg*=0.6;p.beta*=0.6;}
 if(mods&&mods.emg){p.emg=Math.max(p.emg,6);}
 return p;
}
function profile(p,f,spEnv){
 const g=(c,w)=>Math.exp(-((f-c)**2)/(2*w*w));
 let P=p.bg/(0.6+f)*3;
 P+=p.slow*g(0.75,0.45)+p.delta*g(2.5,1)+p.theta*g(6,1.2)+p.alpha*g(p.alphaF,1.1)
   +p.spindle*spEnv*g(p.alphaF,1.0)+p.beta*g(p.betaF,4.5)+p.gamma*g(34,5)+p.emg*(f>18?Math.min(1,(f-18)/15):0);
 return P;
}
class Engine{
 constructor(){this.ph=OSC_F.map(()=>Math.random()*6.283);this.m=OSC_F.map(()=>1);this.p=target('propofol',0);
  this.t=0;this.spPhase=0;this.bsState=0;this.bsTimer=1;this.gate=1;this.drug='propofol';this.d=0;this.mods={};}
 setTarget(drug,d,mods){this.drug=drug;this.d=d;this.mods=mods||{};}
 snap(){this.p=target(this.drug,this.d,this.mods);} // jump instantly
 sample(){ // one sample at FS
  const dt=1/FS; this.t+=dt;
  const tg=target(this.drug,this.d,this.mods); const k=dt/8; // ~8 s time constant
  for(const key of KEYS)this.p[key]+=(tg[key]-this.p[key])*k;
  // spindle envelope: ~1.5 s bursts every ~5 s
  this.spPhase+=dt; const sp=(this.spPhase%5.3); const spEnv=sp<1.6?Math.sin(Math.PI*sp/1.6)**2:0;
  // burst suppression gate
  this.bsTimer-=dt; if(this.bsTimer<=0){
   if(this.bsState===0){ // was burst -> suppression
    if(Math.random()<this.p.bs){this.bsState=1;this.bsTimer=(this.p.bs>0.97?3:1+5*this.p.bs*Math.random()+2*this.p.bs);} else this.bsTimer=1+Math.random()*2;
   } else {this.bsState=0;this.bsTimer=(this.p.bs>0.97?0.02:1+Math.random()*1.5);}
   if(this.p.bs>0.97&&this.bsState===0&&Math.random()<0.98){this.bsState=1;this.bsTimer=3;}
  }
  const gTarget=this.bsState?0.03:1; this.gate+=(gTarget-this.gate)*0.08;
  let x=0;
  for(let i=0;i<OSC_F.length;i++){const f=OSC_F[i];
   this.m[i]+= (1-this.m[i])*0.004+randn()*0.03; if(this.m[i]<0.05)this.m[i]=0.05;
   this.ph[i]+=6.2832*f*dt+randn()*0.08;
   const P=profile(this.p,f,spEnv); x+=Math.sqrt(2*P)*this.m[i]*Math.sin(this.ph[i]);
  }
  const emgNoise=this.p.emg>0?randn()*Math.sqrt(this.p.emg)*1.2:0;
  return x*this.gate+emgNoise+randn()*0.6;
 }
}
// FFT (radix-2, in place)
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const ur=re[i+j],ui=im[i+j],vr=re[i+j+len/2]*cr-im[i+j+len/2]*ci,vi=re[i+j+len/2]*ci+im[i+j+len/2]*cr;re[i+j]=ur+vr;im[i+j]=ui+vi;re[i+j+len/2]=ur-vr;im[i+j+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}}
const HANN=Array.from({length:NWIN},(_,i)=>0.5-0.5*Math.cos(2*Math.PI*i/(NWIN-1)));
function spectrum(win){ // returns {P: power per bin (uV^2), re, im}
 const re=new Float64Array(NWIN),im=new Float64Array(NWIN); let mean=0; for(const v of win)mean+=v; mean/=NWIN;
 for(let i=0;i<NWIN;i++)re[i]=(win[i]-mean)*HANN[i]; fft(re,im);
 const P=new Float64Array(NWIN/2); for(let k=0;k<NWIN/2;k++)P[k]=(re[k]**2+im[k]**2)*4/(NWIN*NWIN*0.375);
 return {P,re,im};
}
function bandPow(P,lo,hi){let s=0;for(let k=Math.round(lo/DF);k<=Math.round(hi/DF);k++)s+=P[k];return s;}
function features(P,win){
 const tot=bandPow(P,0.5,30); let c=0,sef=30; for(let k=1;k<=60;k++){c+=P[k];if(c>=0.95*tot){sef=k*DF;break;}}
 const br=Math.log10((bandPow(P,30,47)+1e-3)/(bandPow(P,11,20)+1e-3));
 // suppression: half-window RMS < 5 uV for the newest second
 let r=0; for(let i=NWIN-HOP;i<NWIN;i++)r+=win[i]**2; r=Math.sqrt(r/HOP);
 const t47=bandPow(P,0.5,47);return {sef,br,tot,suppressed:r<4,rms:r,slowFrac:bandPow(P,0.5,4)/t47,alphaFrac:bandPow(P,8,14)/t47,fast:Math.log10(bandPow(P,14,47)/t47),hi:Math.log10(bandPow(P,30,47)/t47)};
}
function bisRaw(f,bsr){ // teaching model, NOT the proprietary algorithm
 let b=114.35-0.874*f.sef+65.64*f.fast-3.49*f.hi+7.46*f.slowFrac+19.63*f.alphaFrac;
 if(b<50)b=50-(50-b)*1.4; else if(b>80)b=80+(b-80)*1.6;
 if(bsr>0)b=Math.min(b,50-bsr/2);
 return Math.max(0,Math.min(98,b));
}

// ===== colour map (turbo, close to monitor DSA colours) =====
function turbo(x){x=Math.max(0,Math.min(1,x));
 const r=0.13572138+x*(4.6153926+x*(-42.66032258+x*(132.13108234+x*(-152.94239396+x*59.28637943))));
 const g=0.09140261+x*(2.19418839+x*(4.84296658+x*(-14.18503333+x*(4.27729857+x*2.82956604))));
 const b=0.1066733+x*(12.64194608+x*(-60.58204836+x*(110.36276771+x*(-89.90310912+x*27.34824973))));
 return [Math.max(0,Math.min(255,r*255))|0,Math.max(0,Math.min(255,g*255))|0,Math.max(0,Math.min(255,b*255))|0];}
const DB_LO=-2, DB_HI=31, NB=60; // 60 bins of 0.5 Hz = 0-30 Hz
const LUT=Array.from({length:256},(_,i)=>turbo(i/255));
const dbToX=d=>Math.max(0,Math.min(1,(d-DB_LO)/(DB_HI-DB_LO)));
const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;
const MONO='600 12px "JetBrains Mono", ui-monospace, monospace';
const SCR={bg:'#05080f',fg:'#d9e4f5',mute:'#7d8ca6',grid:'#1a2538',bis:'#ffd166',sef:'#ffffff'};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

function fit(c,hLogical){const dpr=Math.min(2,window.devicePixelRatio||1);const w=c.clientWidth||300;const h=hLogical||+c.getAttribute('height')||100;
 if(c._w!==w||c._h!==h||c._d!==dpr){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.style.height=h+'px';c._w=w;c._h=h;c._d=dpr;}
 const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w,h};}

// ===== live simulation state =====
const eng=new Engine();
const SIG=[]; const SIGMAX=8*FS;
const COLS=[]; const COLMAX=300; // one column per second, 5 min
const sup=[]; let bisS=null, lastSef=null, produced=0, simT=0, speed=1, paused=false;
let drug='propofol', depth=0; const mods={elderly:false,emg:false};
function applyTarget(){eng.setTarget(drug,depth,mods);describe();}

function step(nSamples){
 for(let i=0;i<nSamples;i++){SIG.push(eng.sample());if(SIG.length>SIGMAX)SIG.shift();produced++;
  if(produced%HOP===0&&SIG.length>=NWIN){
   const win=SIG.slice(-NWIN);const {P}=spectrum(win);const f=features(P,win);
   sup.push(f.suppressed?1:0);if(sup.length>63)sup.shift();
   const bsr=100*sup.reduce((a,b)=>a+b,0)/sup.length;
   const raw=bisRaw(f,bsr); bisS=bisS==null?raw:bisS+(raw-bisS)*(1/15); // ~15 s smoothing
   if(!f.suppressed)lastSef=f.sef;
   const db=new Float32Array(NB);for(let k=0;k<NB;k++)db[k]=10*Math.log10(P[k]+1e-4);
   const emg=10*Math.log10(bandPow(P,30,47)+1e-4);
   COLS.push({db,sef:f.suppressed?null:f.sef,bis:bisS,bsr,emg});if(COLS.length>COLMAX)COLS.shift();
   onColumn&&onColumn();
  }}
}

// ===== drawing: monitor =====
const cEeg=document.getElementById('cEeg'),cTrend=document.getElementById('cTrend'),cDsa=document.getElementById('cDsa');
const off=document.createElement('canvas');off.width=COLMAX;off.height=NB;const offCtx=off.getContext('2d');const offImg=offCtx.createImageData(COLMAX,NB);
function paintOff(){const d=offImg.data;const start=COLMAX-COLS.length;
 for(let x=0;x<COLMAX;x++){const col=COLS[x-start];for(let y=0;y<NB;y++){const i=(y*COLMAX+x)*4;
  if(!col){d[i]=5;d[i+1]=8;d[i+2]=15;d[i+3]=255;continue;}
  const c=LUT[(dbToX(col.db[NB-1-y])*255)|0];d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;}}
 offCtx.putImageData(offImg,0,0);}
function drawEeg(){const {ctx,w,h}=fit(cEeg);ctx.fillStyle=SCR.bg;ctx.fillRect(0,0,w,h);
 ctx.strokeStyle=SCR.grid;ctx.lineWidth=1;for(let s=0;s<=8;s++){const x=Math.round(w*s/8)+.5;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
 ctx.beginPath();ctx.moveTo(0,h/2+.5);ctx.lineTo(w,h/2+.5);ctx.stroke();
 // newest 2-s epoch
 ctx.fillStyle='rgba(23,143,215,.16)';ctx.fillRect(w*6/8,0,w*2/8,h);ctx.strokeStyle='rgba(120,190,255,.7)';ctx.strokeRect(w*6/8+.5,.5,w*2/8-1,h-1);
 ctx.fillStyle=SCR.mute;ctx.font=MONO;ctx.textAlign='right';ctx.fillText('newest 2 s → next DSA column',w-6,14);
 const n=SIG.length,off0=SIGMAX-n,sc=(h/2-4)/100;ctx.strokeStyle='#7ee0a1';ctx.lineWidth=1.3;ctx.beginPath();
 for(let i=0;i<n;i++){const x=(off0+i)/SIGMAX*w,y=h/2-SIG[i]*sc;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
function plotGeom(w,h){return {x:34,y:6,w:w-34-30,h:h-24};}
function drawTrend(){const {ctx,w,h}=fit(cTrend);ctx.fillStyle=SCR.bg;ctx.fillRect(0,0,w,h);const g={x:34,y:6,w:w-64,h:h-12};
 const Y=v=>g.y+g.h*(1-v/100);ctx.fillStyle='rgba(255,209,102,.10)';ctx.fillRect(g.x,Y(60),g.w,Y(40)-Y(60));
 ctx.font=MONO;ctx.fillStyle=SCR.mute;ctx.textAlign='right';for(const v of [0,50,100]){ctx.fillText(v,g.x-6,Math.min(h-2,Math.max(10,Y(v)+4)));}
 ctx.strokeStyle=SCR.bis;ctx.lineWidth=2;ctx.beginPath();const start=COLMAX-COLS.length;
 COLS.forEach((c,i)=>{const x=g.x+(start+i+.5)/COLMAX*g.w,y=Y(c.bis);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
function drawDsa(){const {ctx,w,h}=fit(cDsa);ctx.fillStyle=SCR.bg;ctx.fillRect(0,0,w,h);const g=plotGeom(w,h);
 ctx.imageSmoothingEnabled=true;ctx.drawImage(off,g.x,g.y,g.w,g.h);
 // SEF line
 const start=COLMAX-COLS.length;ctx.strokeStyle=SCR.sef;ctx.lineWidth=1.4;ctx.beginPath();let pen=false;
 COLS.forEach((c,i)=>{if(c.sef==null){pen=false;return;}const x=g.x+(start+i+.5)/COLMAX*g.w,y=g.y+g.h*(1-c.sef/30);pen?ctx.lineTo(x,y):ctx.moveTo(x,y);pen=true;});ctx.stroke();
 // newest column outline
 if(COLS.length){ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=1;ctx.strokeRect(g.x+g.w-g.w/COLMAX*3-1,g.y-1,g.w/COLMAX*3+2,g.h+2);}
 ctx.font=MONO;ctx.fillStyle=SCR.mute;ctx.textAlign='right';
 for(const f of [0,10,20,30]){ctx.fillText(f,g.x-6,Math.min(g.y+g.h,Math.max(g.y+9,g.y+g.h*(1-f/30)+4)));}
 ctx.save();ctx.translate(10,g.y+g.h/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillText('Hz',0,0);ctx.restore();
 ctx.textAlign='left';ctx.fillText('−5 min',g.x,h-4);ctx.textAlign='center';ctx.fillText('−2½',g.x+g.w/2,h-4);ctx.textAlign='right';ctx.fillText('now',g.x+g.w,h-4);
 // colour scale
 const lx=w-20;for(let i=0;i<g.h;i++){ctx.fillStyle=rgb(LUT[((1-i/g.h)*255)|0]);ctx.fillRect(lx,g.y+i,10,1);}
 ctx.save();ctx.translate(lx-4,g.y+g.h/2);ctx.rotate(-Math.PI/2);ctx.textAlign='center';ctx.fillStyle=SCR.mute;ctx.font='600 10px "JetBrains Mono", monospace';ctx.fillText('power',0,0);ctx.restore();}
const $=id=>document.getElementById(id);
function zoneOf(b){return b>80?'Awake/light':b>60?'Sedation':b>=40?'GA range':b>=20?'Deep':'Very deep';}
function readouts(){const c=COLS[COLS.length-1];if(!c)return;$('vBis').textContent=Math.round(c.bis);$('vZone').textContent=zoneOf(c.bis);
 $('vSr').textContent=Math.round(c.bsr);$('vSef').textContent=lastSef==null?'--':lastSef.toFixed(1);
 $('vEmg').textContent=Math.round(c.emg);$('vEmgBar').style.width=Math.max(0,Math.min(100,(c.emg+5)/35*100))+'%';}

// ===== state descriptions =====
function describe(){const d=depth;let n,t;
 if(drug==='propofol'||drug==='sevo'){const s=drug==='sevo';
  if(d<0.08){n='Awake';t='Low-amplitude, mixed fast activity. Power is spread thinly across the DSA with no strong band. SEF95 is high (above 25 Hz), so BIS reads 90 or more.';}
  else if(d<0.24){n='Paradoxical excitation';t='Early '+(s?'sevoflurane':'propofol')+' boosts beta (13–25 Hz) power. The DSA brightens high up and BIS may stay high or even rise, although the patient is drifting off.';}
  else if(d<0.44){n='Sedation';t='Beta fades and a band starts to form around 12 Hz while slow waves appear at the bottom. BIS sits around 60–80. The patient may still respond to voice.';}
  else if(d<0.68){n='General anaesthesia';t=(s?'Sevoflurane':'Propofol')+' gives the classic two bands: a bright alpha band (8–12 Hz) and bright slow-delta power (under 4 Hz), with a dark gap above about 15 Hz. SEF95 falls to about 15 Hz and BIS reads 40–60.'+(s?' Sevoflurane also adds some theta (4–8 Hz) as it deepens.':'');}
  else if(d<0.82){n='Deep anaesthesia';t='The alpha band dims and slides lower; slow waves dominate.'+(s?' With sevoflurane, theta fills in between alpha and slow, merging them into one broad block.':'')+' BIS drops into the 30s.';}
  else if(d<0.96){n='Burst suppression';t='Bursts of activity alternate with flat periods. Each flat period is a dark vertical stripe on the DSA, and SR rises. BIS is under 30. This is usually more depth than surgery needs, and in older patients it is linked with postoperative delirium.';}
  else {n='Isoelectric';t='A flat EEG: the DSA is dark, SR is near 100 and BIS is 0. Seen with a large overdose, profound hypothermia, or brain ischaemia.';}
 } else if(drug==='ketamine'){
  if(d<0.08){n='Awake';t='Mixed fast activity with no strong band. BIS 90 or more.';}
  else if(d<0.45){n='Ketamine, sub-anaesthetic';t='Beta and gamma power rise. BIS stays high, which fits: the patient is analgesed but often still aware.';}
  else {n='Ketamine anaesthesia';t='Bright fast power from 25–40 Hz (gamma) on top of slow waves, and no alpha band. The fast power keeps SEF95 and BIS high (often 60–80) even though the patient is unconscious. Don’t give more hypnotic just to lower the number.';}
 } else {
  if(d<0.08){n='Awake';t='Mixed fast activity with no strong band. BIS 90 or more.';}
  else if(d<0.6){n='Dexmedetomidine sedation';t='Sleep-like spindles: short bursts at 12–15 Hz that make the band look beaded, plus slow waves. BIS reads 50–70, yet the patient can usually be roused, as from natural sleep.';}
  else {n='Deep dexmedetomidine sedation';t='Slow waves dominate and spindles become sparse. BIS may fall to the 40s, but this is still a rousable, sleep-like state, not general anaesthesia.';}
 }
 if(mods.elderly&&drug!=='ketamine')t+=' Older patient: alpha and overall power are much lower, so the DSA is dimmer and BIS reads higher for the same dose.';
 if(mods.emg)t+=' Muscle activity: broad high-frequency power raises the EMG bar and pushes BIS up. It is artefact, not lighter anaesthesia.';
 $('rName').textContent=n;$('rText').textContent=t;}

// ===== controls =====
const DEPTH_TICKS={propofol:['Awake','Sedated','GA','Deep','Flat'],sevo:['Awake','Sedated','~1 MAC','Deep','Flat'],ketamine:['Awake','Analgesic','','GA','High dose'],dex:['Awake','','Sedated','','Deep sedation']};
function setDrug(dn){drug=dn;document.querySelectorAll('#drugSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.drug===dn));
 $('ticks').innerHTML=DEPTH_TICKS[dn].map(s=>`<span>${s}</span>`).join('');applyTarget();}
document.querySelectorAll('#drugSeg button').forEach(b=>b.onclick=()=>{stopStory();setDrug(b.dataset.drug);});
$('depth').oninput=e=>{stopStory();depth=e.target.value/100;applyTarget();};
$('mElder').onchange=e=>{mods.elderly=e.target.checked;applyTarget();};
$('mEmg').onchange=e=>{mods.emg=e.target.checked;applyTarget();};
function setSpeed(s){speed=s;document.querySelectorAll('#speedSeg button[data-speed]').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.speed===s));}
document.querySelectorAll('#speedSeg button[data-speed]').forEach(b=>b.onclick=()=>setSpeed(+b.dataset.speed));
$('pause').onclick=()=>{paused=!paused;$('pause').setAttribute('aria-pressed',paused);$('pause').textContent=paused?'Resume':'Pause';};

// ===== the case story =====
const STORY=[
 {at:0,drug:'propofol',d:0,mods:{},cap:'Pre-induction. Awake EEG: small, fast, disorganised. Thin power across the DSA and BIS in the 90s.'},
 {at:25,d:0.17,cap:'Propofol bolus. Beta power rises first (paradoxical excitation), so BIS barely moves even though the patient is drifting off.'},
 {at:50,d:0.57,cap:'Loss of consciousness. Power moves into two bands: alpha 8–12 Hz and slow-delta under 4 Hz. SEF95 drops and BIS settles at 40–60.'},
 {at:130,d:0.9,cap:'Infusion left high and the blood pressure falls. Alpha fades, slow waves dominate, then dark vertical stripes appear: burst suppression. SR climbs and BIS falls below 30.'},
 {at:220,d:0.57,cap:'Infusion reduced. The alpha band comes back within a minute or two. Notice the DSA recovers before the smoothed BIS number does.'},
 {at:280,d:0.5,mods:{emg:true},cap:'Relaxant wears off with surgery still going. Facial EMG adds broad high-frequency power and BIS jumps, though the brain state (the alpha band) is unchanged.'},
 {at:330,d:0.5,mods:{},cap:'Relaxant given. EMG gone, BIS back in range. More hypnotic was not needed.'},
 {at:370,d:0.12,cap:'Infusion stopped at the end. Alpha dims, slow waves fade, beta returns and BIS rises towards 80–90 as the patient wakes.'},
 {at:440,end:true,cap:'End of case. Scroll the DSA back in your head: two bands for propofol GA, stripes for too deep, high fast power for EMG.'}];
let story=null;
function stopStory(){if(!story)return;story=null;$('storyBtn').textContent='Play a case: induction to emergence';}
$('storyBtn').onclick=()=>{if(story){stopStory();$('storyCap').textContent='';return;}
 story={t0:simT,i:-1};mods.elderly=false;mods.emg=false;$('mElder').checked=false;$('mEmg').checked=false;setSpeed(10);
 if(paused)$('pause').click();$('storyBtn').textContent='Stop the case';};
function runStory(){if(!story)return;const t=simT-story.t0;
 while(story.i+1<STORY.length&&t>=STORY[story.i+1].at){story.i++;const s=STORY[story.i];
  if(s.drug)setDrug(s.drug);if(s.d!=null){depth=s.d;$('depth').value=Math.round(s.d*100);}
  if(s.mods){mods.emg=!!s.mods.emg;$('mEmg').checked=mods.emg;}
  applyTarget();$('storyCap').textContent=`${story.i+1}/${STORY.length} · ${s.cap}`;
  if(s.end){story=null;$('storyBtn').textContent='Play the case again';setSpeed(1);return;}}}

// ===== explainer animation =====
const cEx=$('cEx');
const STEPS=[
 {name:'1 · Take an epoch',cap:'The monitor takes the newest 2 seconds of frontal EEG (256 samples at 128 per second). A new epoch is taken every second, so epochs overlap by half.'},
 {name:'2 · It is a sum of waves',cap:'Any EEG epoch can be rebuilt by adding together waves of different frequencies. Here it is split into slow-delta (under 4 Hz), alpha (8–13 Hz) and beta (13–30 Hz) parts. Under propofol GA the slow and alpha parts are large and beta is tiny.'},
 {name:'3 · Fourier transform',cap:'A fast Fourier transform (FFT) measures how much power the epoch has at each frequency, every 0.5 Hz from 0 to 30 Hz. Taller bar = more power (log scale, in decibels).'},
 {name:'4 · Turn it into colour',cap:'Stand the spectrum on its side so frequency runs upward, and swap bar height for colour: blue for little power, through green and yellow, to red for a lot. The whole spectrum is now one thin column.'},
 {name:'5 · Add it to the DSA',cap:'The column joins the right-hand edge of the DSA and the older columns shift left. One column a second builds the picture on the monitor. BIS is computed from features of these same spectra (and the flat-line ratio), then smoothed.'}];
const T=[0,1.6,4.4,6.8,9.2,11.2,12.4];
let ex=null, exT=0, exPlaying=!reduced, exLast=null;
$('steps').innerHTML=STEPS.map((s,i)=>`<li><button data-i="${i}">${s.name}</button></li>`).join('');
document.querySelectorAll('#steps button').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;setExPlaying(false);if(i===0)snapshotEx();exT=T[i+1]-0.01;exUI();});
function setExPlaying(p){exPlaying=p;$('exPlay').textContent=p?'Pause':'Play';}
$('exPlay').onclick=()=>setExPlaying(!exPlaying);
$('exNext').onclick=()=>{const s=curStep();setExPlaying(false);if(s>=4){snapshotEx();exT=T[1]-0.01;}else exT=T[s+2]-0.01;exUI();};
function curStep(){for(let i=0;i<5;i++)if(exT<T[i+1])return i;return 4;}
function bandRecon(win,lo,hi){const re=new Float64Array(NWIN),im=new Float64Array(NWIN);let m=0;for(const v of win)m+=v;m/=NWIN;for(let i=0;i<NWIN;i++)re[i]=win[i]-m;fft(re,im);
 const out=new Float32Array(NWIN);for(let k=Math.round(lo/DF);k<=Math.round(hi/DF);k++){for(let n=0;n<NWIN;n++){const a=2*Math.PI*k*n/NWIN;out[n]+=2*(re[k]*Math.cos(a)-im[k]*Math.sin(a))/NWIN;}}return out;}
function snapshotEx(){if(SIG.length<NWIN||!COLS.length)return;const strip=SIG.slice(-6*FS);const win=SIG.slice(-NWIN);const {P}=spectrum(win);
 const db=Array.from({length:NB},(_,k)=>10*Math.log10(P[k]+1e-4));
 ex={strip,win,db,comps:[['slow-delta  <4 Hz',bandRecon(win,0.5,4),'#6aa8ff'],['alpha  8–13 Hz',bandRecon(win,8,13),'#ffb454'],['beta  13–30 Hz',bandRecon(win,13.5,30),'#ff7a90']],
  hist:COLS.slice(-60).map(c=>c.db)};}
function layout(W){if(W>=700)return {W:960,H:440,A:{x:24,y:28,w:912,h:70},B:{x:24,y:140,w:300,h:270},C:{x:380,y:150,w:270,h:250},D:{x:690,y:150,w:16,h:250},E:{x:726,y:150,w:210,h:250},cw:5};
 return {W:480,H:700,A:{x:16,y:28,w:448,h:64},B:{x:16,y:128,w:448,h:250},C:{x:40,y:420,w:250,h:240},D:{x:316,y:420,w:14,h:240},E:{x:346,y:420,w:118,h:240},cw:4};}
const ease=t=>t<0?0:t>1?1:t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const prog=(a,b)=>ease((exT-a)/(b-a));
function trace(ctx,arr,x,y,w,h,scale,color,lw){ctx.strokeStyle=color;ctx.lineWidth=lw||1.3;ctx.beginPath();for(let i=0;i<arr.length;i++){const px=x+i/(arr.length-1)*w,py=y+h/2-arr[i]*scale;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
function drawEx(){const cw0=cEx.clientWidth||600;const L=layout(cw0);const scale=cw0/L.W;const {ctx}=fit(cEx,L.H*scale);ctx.setTransform(ctx.getTransform().a*scale,0,0,ctx.getTransform().a*scale,0,0);
 ctx.fillStyle=SCR.bg;ctx.fillRect(0,0,L.W,L.H);if(!ex){ctx.fillStyle=SCR.mute;ctx.font=MONO;ctx.fillText('Collecting EEG…',24,40);return;}
 const s=curStep();ctx.font=MONO;ctx.textAlign='left';
 // A: strip
 const A=L.A;ctx.fillStyle=SCR.mute;ctx.fillText('RAW EEG · last 6 s',A.x,A.y-10);
 trace(ctx,ex.strip,A.x,A.y,A.w,A.h,(A.h/2)/100,'#7ee0a1');
 const wx=A.x+A.w*(4/6),ww=A.w*(2/6);const flash=s===0?0.25+0.2*Math.sin(exT*8):0.12;
 ctx.fillStyle=`rgba(23,143,215,${flash})`;ctx.fillRect(wx,A.y-4,ww,A.h+8);ctx.strokeStyle='rgba(120,190,255,.9)';ctx.lineWidth=1.5;ctx.strokeRect(wx,A.y-4,ww,A.h+8);
 ctx.fillStyle=SCR.fg;ctx.textAlign='right';ctx.fillText('2-s epoch',wx+ww,A.y+A.h+20);ctx.textAlign='left';
 // B: epoch lifted down
 const B=L.B,rowH=B.h/4;const p1=prog(T[0]+0.2,T[1]);
 const ex0={x:wx,y:A.y,w:ww,h:A.h},ex1={x:B.x,y:B.y,w:B.w,h:rowH-14};const lerp=(a,b,t)=>a+(b-a)*t;
 const ep={x:lerp(ex0.x,ex1.x,p1),y:lerp(ex0.y,ex1.y,p1),w:lerp(ex0.w,ex1.w,p1),h:lerp(ex0.h,ex1.h,p1)};
 const sc=(ex1.h/2)/90;
 trace(ctx,ex.win,ep.x,ep.y,ep.w,ep.h,sc,'#7ee0a1',1.6);
 if(p1>0.98){ctx.fillStyle=SCR.fg;ctx.fillText('epoch',B.x,B.y-6);}
 const p2=prog(T[1],T[2]-0.4);
 if(exT>=T[1]){ex.comps.forEach(([lab,arr,col],i)=>{const a=Math.max(0,Math.min(1,p2*3-i));if(a<=0)return;ctx.globalAlpha=a;
   const y=B.y+rowH*(i+1);ctx.fillStyle=col;ctx.fillText((i===0?'= ':'+ ')+lab,B.x,y-2);trace(ctx,arr,B.x,y,B.w,rowH-14,sc,col,1.4);ctx.globalAlpha=1;});}
 // C: spectrum bars
 const C=L.C,bw=C.w/NB,hOf=d=>dbToX(d)*C.h;const p3=exT<T[2]?0:Math.min(1,(exT-T[2])/(T[3]-T[2]-0.4));const p4=prog(T[3],T[4]-0.3);const p5=prog(T[4],T[5]-0.2);
 if(exT>=T[2]){ // axes
  ctx.globalAlpha=1-p4*0.6;ctx.strokeStyle=SCR.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(C.x,C.y);ctx.lineTo(C.x,C.y+C.h);ctx.lineTo(C.x+C.w,C.y+C.h);ctx.stroke();
  ctx.fillStyle=SCR.mute;ctx.textAlign='center';for(const f of [0,10,20,30])ctx.fillText(f,C.x+f/30*C.w,C.y+C.h+16);ctx.fillText('frequency (Hz)',C.x+C.w/2,C.y+C.h+32);
  ctx.save();ctx.translate(C.x-12,C.y+C.h/2);ctx.rotate(-Math.PI/2);ctx.fillText('power (dB)',0,0);ctx.restore();
  // band labels
  const bands=[[0.5,4,'δ'],[4,8,'θ'],[8,13,'α'],[13,30,'β']];bands.forEach(([lo,hi,l])=>{ctx.fillStyle='rgba(255,255,255,.04)';if(l==='α'||l==='δ')ctx.fillRect(C.x+lo/30*C.w,C.y,(hi-lo)/30*C.w,C.h);ctx.fillStyle=SCR.mute;ctx.fillText(l,C.x+(lo+hi)/60*C.w,C.y-6);});
  ctx.globalAlpha=1;ctx.textAlign='left';
 }
 const D=L.D,ch=D.h/NB;
 // E: mini DSA history (shifts left during step 5)
 const E=L.E,ncol=Math.floor(E.w/L.cw);const hist=ex.hist.slice(-(ncol-1));
 if(exT>=T[3]-0.2){ctx.save();ctx.beginPath();ctx.rect(E.x,E.y,E.w,E.h);ctx.clip();
  const shift=p5*L.cw;hist.forEach((col,ci)=>{const x=E.x+E.w-L.cw*(hist.length-ci)-shift;for(let k=0;k<NB;k++){ctx.fillStyle=rgb(LUT[(dbToX(col[k])*255)|0]);ctx.fillRect(x,E.y+E.h-(k+1)*ch,L.cw+0.5,ch+0.5);}});
  ctx.restore();ctx.strokeStyle=SCR.grid;ctx.strokeRect(E.x-.5,E.y-.5,E.w+1,E.h+1);
  ctx.fillStyle=SCR.fg;ctx.fillText('DSA',E.x,E.y-8);ctx.fillStyle=SCR.mute;ctx.textAlign='right';ctx.fillText('now →',E.x+E.w,E.y+E.h+16);ctx.textAlign='left';
  ctx.textAlign='right';ctx.fillText('30',D.x-4,D.y+8);ctx.fillText('0 Hz',D.x-4,D.y+D.h);ctx.textAlign='left';}
 // bars -> column -> into DSA
 if(exT>=T[2]){const nShow=Math.floor(p3*NB);
  for(let k=0;k<NB;k++){if(k>nShow&&p4===0)continue;const hk=hOf(ex.db[k]);
   const r0={x:C.x+k*bw+0.5,y:C.y+C.h-hk,w:bw-1,h:hk};
   const colX=lerp(D.x,E.x+E.w-L.cw,p5),colW=lerp(D.w,L.cw,p5);
   const r1={x:colX,y:D.y+D.h-(k+1)*ch,w:colW,h:ch+0.5};
   const r={x:lerp(r0.x,r1.x,p4),y:lerp(r0.y,r1.y,p4),w:lerp(r0.w,r1.w,p4),h:lerp(r0.h,r1.h,p4)};
   const cc=LUT[(dbToX(ex.db[k])*255)|0];const grey=[200,214,235];
   const mix=[0,1,2].map(j=>Math.round(lerp(grey[j],cc[j],Math.min(1,p4*1.6))));ctx.fillStyle=rgb(mix);ctx.fillRect(r.x,r.y,r.w,r.h);}
  if(p4>0.9&&p5<0.05){ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(D.x-1.5,D.y-1.5,D.w+3,D.h+3);}
 }
 // step title on canvas
 ctx.fillStyle=SCR.bis;ctx.font='600 13px "JetBrains Mono", monospace';ctx.textAlign='right';ctx.fillText(STEPS[s].name.toUpperCase(),L.W-24,18);ctx.textAlign='left';
}
function exUI(){const s=curStep();document.querySelectorAll('#steps button').forEach((b,i)=>{if(i===s)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
 if($('exCap')._s!==s){$('exCap')._s=s;$('exCap').textContent=STEPS[s].cap;}}

// ===== offline strips for library and quiz =====
function simStrip(drug,d,m,seconds){const e=new Engine();e.setTarget(drug,d,m);e.snap();const buf=[];const cols=[];let n=0;
 for(let s=0;s<(seconds+2)*FS;s++){buf.push(e.sample());if(buf.length>NWIN)buf.shift();n++;
  if(n%HOP===0&&buf.length===NWIN&&s>2*FS){const {P}=spectrum(buf);const f=features(P,buf);cols.push({db:Array.from({length:NB},(_,k)=>10*Math.log10(P[k]+1e-4)),sef:f.suppressed?null:f.sef});}}
 return cols;}
function drawStrip(canvas,cols){const {ctx,w,h}=fit(canvas);ctx.fillStyle=SCR.bg;ctx.fillRect(0,0,w,h);const g={x:28,y:6,w:w-34,h:h-12};
 const o=document.createElement('canvas');o.width=cols.length;o.height=NB;const oc=o.getContext('2d');const im=oc.createImageData(cols.length,NB);
 cols.forEach((c,x)=>{for(let y=0;y<NB;y++){const i=(y*cols.length+x)*4,col=LUT[(dbToX(c.db[NB-1-y])*255)|0];im.data[i]=col[0];im.data[i+1]=col[1];im.data[i+2]=col[2];im.data[i+3]=255;}});
 oc.putImageData(im,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(o,g.x,g.y,g.w,g.h);
 ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=1.2;ctx.beginPath();let pen=false;cols.forEach((c,i)=>{if(c.sef==null){pen=false;return;}const x=g.x+(i+.5)/cols.length*g.w,y=g.y+g.h*(1-c.sef/30);pen?ctx.lineTo(x,y):ctx.moveTo(x,y);pen=true;});ctx.stroke();
 ctx.fillStyle=SCR.mute;ctx.font='600 10px "JetBrains Mono", monospace';ctx.textAlign='right';ctx.fillText('30',g.x-4,g.y+9);ctx.fillText('15',g.x-4,g.y+g.h/2+4);ctx.fillText('0',g.x-4,g.y+g.h);}
const LIB=[
 {id:'awake',name:'Awake',drug:'propofol',d:0,m:{},bis:'90–98',txt:'Thin, low power everywhere and no clear band. SEF95 is high.'},
 {id:'exc',name:'Paradoxical excitation',drug:'propofol',d:0.17,m:{},bis:'80–95',txt:'Beta (13–25 Hz) brightens at induction or in light sedation. BIS can stay high or even rise.'},
 {id:'ga',name:'Propofol GA',drug:'propofol',d:0.57,m:{},bis:'40–60',txt:'Two bright bands, alpha 8–12 Hz and slow under 4 Hz, with a dark gap above. The pattern you want.'},
 {id:'deep',name:'Too deep',drug:'propofol',d:0.76,m:{},bis:'30–40',txt:'Alpha dims and drifts lower; slow waves take over. Consider lightening if surgery allows.'},
 {id:'bs',name:'Burst suppression',drug:'propofol',d:0.9,m:{},bis:'under 30',txt:'Dark vertical stripes are flat-line periods. SR above 0. Usually unnecessary depth.'},
 {id:'old',name:'Older patient, propofol GA',drug:'propofol',d:0.57,m:{elderly:true},bis:'45–60',txt:'Same dose as Propofol GA, but alpha is weak and the strip is dim. BIS reads higher; don’t chase it.'},
 {id:'sevo',name:'Deep sevoflurane',drug:'sevo',d:0.76,m:{},bis:'30–40',txt:'Theta (4–8 Hz) fills the gap, so alpha and slow merge into one broad bright block.'},
 {id:'ket',name:'Ketamine',drug:'ketamine',d:0.65,m:{},bis:'60–80',txt:'Bright fast power at 25–40 Hz plus slow waves, no alpha. BIS reads high in an unconscious patient.'},
 {id:'dex',name:'Dexmedetomidine',drug:'dex',d:0.4,m:{},bis:'50–70',txt:'Beaded spindles at 12–15 Hz with slow waves, like stage 2 sleep. Rousable.'},
 {id:'emg',name:'EMG artefact',drug:'propofol',d:0.55,m:{emg:true},bis:'falsely 65–85',txt:'Broad power climbing into the high frequencies over a normal GA pattern. Check the EMG bar.'}];
function buildLib(){const el=$('lib');el.innerHTML=LIB.map(x=>`<article class="card"><canvas id="lib-${x.id}" height="110" aria-label="DSA strip: ${x.name}"></canvas><div class="meta"><h3>${x.name}</h3><span class="bis">BIS ${x.bis}</span></div><p>${x.txt}</p></article>`).join('');
 let i=0;const next=()=>{if(i>=LIB.length)return;const x=LIB[i++];x.cols=simStrip(x.drug,x.d,x.m,150);drawStrip($('lib-'+x.id),x.cols);setTimeout(next,0);};next();}

// quiz
let qa=null,score=0,tries=0;
function newQ(){const ans=LIB[Math.floor(Math.random()*LIB.length)];const others=LIB.filter(x=>x!==ans).sort(()=>Math.random()-.5).slice(0,3);
 const opts=[ans,...others].sort(()=>Math.random()-.5);qa={ans,done:false,cols:simStrip(ans.drug,ans.d,ans.m,150)};drawStrip($('cQuiz'),qa.cols);$('fb').textContent='';
 $('opts').innerHTML=opts.map(o=>`<button data-id="${o.id}">${o.name}</button>`).join('');
 document.querySelectorAll('#opts button').forEach(b=>b.onclick=()=>{if(qa.done)return;qa.done=true;tries++;const ok=b.dataset.id===ans.id;if(ok)score++;
  document.querySelectorAll('#opts button').forEach(x=>{if(x.dataset.id===ans.id)x.classList.add('right');else if(x===b)x.classList.add('wrong');});
  $('fb').textContent=(ok?'Correct. ':'It was '+ans.name+'. ')+ans.txt+' (BIS '+ans.bis+')';$('score').textContent=`${score} / ${tries}`;});}
$('qNext').onclick=newQ;

// ===== main loop =====
let last=performance.now(),dirty=true,colsSinceSnap=0;
var onColumn=()=>{dirty=true;};
function frame(now){const dt=Math.min(0.1,(now-last)/1000);last=now;
 if(!paused){const target=simT+dt*speed;const need=Math.floor(target*FS)-Math.floor(simT*FS);simT=target;step(need);runStory();}
 if(dirty){paintOff();drawTrend();drawDsa();readouts();dirty=false;}
 drawEeg();
 if(exPlaying){exT+=dt;if(exT>=T[6]){exT=0;snapshotEx();}}
 if(!ex)snapshotEx();
 drawEx();exUI();
 requestAnimationFrame(frame);}
// warm start: 90 s of awake EEG so the screen opens full
setDrug('propofol');eng.snap();step(60*FS);depth=0.57;$('depth').value=57;applyTarget();step(170*FS);simT=230;snapshotEx();
if(reduced){exT=T[5]-0.01;}
addEventListener('resize',()=>{dirty=true;LIB.forEach(x=>x.cols&&drawStrip($('lib-'+x.id),x.cols));qa&&drawStrip($('cQuiz'),qa.cols);});
requestAnimationFrame(frame);
setTimeout(()=>{buildLib();newQ();},50);
