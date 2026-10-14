// Masimo SedLine screen, part 3: the menu tree in Root's dialog style (a black page, a thin lowercase title, a back arrow, Cancel and OK).
// The gear opens the Main Menu; SedLine > Parameter Settings and Additional Settings hold every setting the manual lists, with the manual's
// names, ranges and factory defaults. A leaf screen edits a copy: OK keeps it, Cancel and the back arrow drop it. Loaded after sed-screen.js.
const sRng=(a,b,s)=>{const o=[];for(let v=a;v<=b;v+=s||1)o.push(v);return o;},sOff=(a,b,s)=>[null,...sRng(a,b,s)];
const sFmtOff=v=>v==null?'Off':String(v),sFmtU=u=>v=>v+' '+u;
const SD_SIL=[30,60,120,300],sFmtSil=v=>v===30?'30 sec':(v/60)+' min';
const sFmtPause=v=>v===0?'Permanent':v===-1?'Permanent with Reminder':(v/60)+' min';
const sCap=s=>s.charAt(0)+s.slice(1).toLowerCase();
const SD_ABOUT={psi:'The Patient State Index (PSi) is related to the effect of certain anesthetic agents on a patient.',
 dsa:'The Density Spectral Array (DSA) is a colour representation of the power of the EEG between 0 and 30/40 Hz showing activity in the right and left areas of the brain using spectral edge frequency as the indices. The DSA represents the last 20 minutes of R and L frontal-prefrontal EEG activity tracked by the 95% Spectral Edge Frequency.',
 asym:'The asymmetry graph shows the degree of asymmetry between the left and right hemispheres of the brain over time. The asymmetry parameter (ASYM) to the right of the graph indicates the percentage of EEG power present in the left or right hemisphere with respect to total EEG power present.',
 emg:'EMG (electromyography) is a measure of detected muscle activity, such as grimacing or jaw clenching. The EMG value varies from 0% to 100%.',
 sr:'Suppression Ratio (SR) is a measure of how much the electrical activity of the frontal and pre-frontal cortex of the brain is suppressed.',
 artf:'Artifact (ARTF) is a measure of how much physiological (non-brain related) and environmental noise the system detects.',
 sefl:'The Spectral Edge Frequency (SEF) identifies the frequency below which 95% of the total power of the patient’s EEG is located. 95% SEF power is displayed as a white line on the DSA and as a value for the left frontal-prefrontal hemisphere of the brain.',
 sefr:'The Spectral Edge Frequency (SEF) identifies the frequency below which 95% of the total power of the patient’s EEG is located. 95% SEF power is displayed as a white line on the DSA and as a value for the right frontal-prefrontal hemisphere of the brain.',
 st:'The Suppression Time (ST) is the cumulative time the EEG is under suppression.'};
const SD_PN={psi:'PSi',dsa:'DSA',sefl:'SEFL',sefr:'SEFR',emg:'EMG',sr:'SR',artf:'ARTF',st:'ST'};
const sTrendRows=(max,min,mx,mn,ss,hi)=>[{t:'sel',l:'Y-Axis Max',k:max,o:sRng(5,hi||100,5),f:null},{t:'sel',l:'Y-Axis Min',k:min,o:sRng(0,(hi||100)-5,5)}];
// the pages: title, rows (sel = a list, tog = ON/OFF, nav = go to a page, btn = a button, txt = read-only text, info = a label and a value), ok = Cancel and OK shown
function sedPage(id){const s=SED.set;
 if(id.startsWith('about_')){const k=id.slice(6);return {title:'about '+(SD_PN[k]||k).toLowerCase(),rows:[{t:'txt',text:SD_ABOUT[k]||''}]};}
 switch(id){
  case 'main':return {title:'menu',tiles:[['Layout','layout','M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z'],['Sounds','sounds','M4 9h4l5-4v14l-5-4H4zM16 8c2 2 2 6 0 8'],['Device Settings','device','M12 8a4 4 0 1 0 .01 0M12 2v3M12 19v3M2 12h3M19 12h3'],['About','about','M12 3a9 9 0 1 0 .01 0M12 11v6M12 7v1.5'],['Trend Settings','trendset','M3 18l5-6 4 3 6-9 3 4'],['Profiles','profiles','M12 4a4 4 0 1 0 .01 0M4 21c0-5 4-8 8-8s8 3 8 8'],['Iris','iris','M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z'],['SedLine','sedline','M2 14c3-8 5 6 8-2s4 6 7-2 3 3 5-1']]};
  case 'layout':return {title:'layout',layout:true,ok:true,rows:[{t:'nav',l:'Additional Settings',to:'layout_add'}]};
  case 'layout_add':return {title:'additional settings',ok:true,rows:[{t:'sel',l:'Trend Layout',k:'trendLayout',o:['Dynamic','Fixed']},{t:'sel',l:'Analog Range',k:'analogRange',o:['Fixed','Dynamic']}]};
  case 'sounds':return {title:'sounds',ok:true,rows:[{t:'sel',l:'Alarm Volume',k:'alarmVol',o:sRng(1,10)},{t:'sel',l:'Pulse Tone Volume',k:'pulseVol',o:sRng(0,10)},{t:'sel',l:'Audio Pause Duration',k:'pauseDur',o:[60,120,180,0,-1],f:sFmtPause},{t:'tog',l:'SmartTone',k:'smartTone'}]};
  case 'device':return {title:'device settings',rows:[['Localization','localization'],['Kite','d_kite'],['Wi-Fi','d_wifi'],['Ethernet','d_eth'],['Bluetooth','d_bt'],['Root Battery','d_batt'],['Brightness','d_bright'],['Access Control','access'],['Device Output','d_out']].map(([l,to])=>({t:'nav',l,to}))};
  case 'localization':return {title:'localization',ok:true,rows:[{t:'sel',l:'Time Format',k:'clock24',o:[false,true],f:v=>v?'24 hour':'12 hour'},{t:'sel',l:'Date Format',k:'dateFmt',o:['MM/DD/YY','DD/MM/YY']}]};
  case 'd_kite':return {title:'kite',rows:[{t:'info',l:'Status',v:'Not connected'}]};
  case 'd_wifi':return {title:'wi-fi',rows:[{t:'info',l:'Wi-Fi',v:'Off'},{t:'txt',text:'Not used in the simulator.'}]};
  case 'd_eth':return {title:'ethernet',rows:[{t:'info',l:'Ethernet',v:'Not connected'}]};
  case 'd_bt':return {title:'bluetooth',rows:[{t:'info',l:'Bluetooth',v:'Off'}]};
  case 'd_batt':return {title:'root battery',rows:[{t:'info',l:'Charge',v:SED.sim.batt?'20%':'100%'},{t:'info',l:'Power',v:SED.sim.batt?'Battery':'AC'}]};
  case 'd_bright':return {title:'brightness',ok:true,rows:[{t:'sel',l:'Brightness',k:'brightness',o:sRng(3,10)}]};
  case 'd_out':return {title:'device output',rows:[{t:'info',l:'Serial output',v:'Off'},{t:'txt',text:'Not used in the simulator.'}]};
  case 'access':return {title:'access control',ok:true,rows:[{t:'sel',l:'power on profile',k:'_pop',o:['Previous Profile','Adult','Pediatric'],local:true},{t:'tog',l:'all mute enabled',k:'allMute'},{t:'sel',l:'lock alarm volume',k:'lockVol',o:[false,true],f:v=>v?'ON':'OFF'},{t:'tog',l:'standby enabled',k:'standby'},{t:'sel',l:'standby reminder tone interval',k:'_sri',o:['30 sec','1 min','2 min'],local:true},{t:'sel',l:'USB Port 1 baudrate',k:'_b1',o:['115200','460800','921600'],local:true,def:'921600'},{t:'sel',l:'USB Port 2 baudrate',k:'_b2',o:['115200','460800','921600'],local:true,def:'921600'},{t:'tog',l:'data collection enabled',k:'dataColl'},{t:'btn',l:'save as adult',b:'Save'},{t:'btn',l:'save as pediatric',b:'Save'},{t:'btn',l:'factory defaults',b:'Restore',fn:'restore'}]};
  case 'about':return {title:'about',rows:[{t:'info',l:'Device',v:'Root (simulated)'},{t:'info',l:'Module',v:'SedLine (simulated)'},{t:'info',l:'Software',v:'BIS to DSA teaching simulator'},{t:'txt',text:'A teaching simulation. The EEG is synthetic and the PSi is a stand-in, not Masimo’s algorithm.'}]};
  case 'trendset':return {title:'trend settings',ok:true,rows:[{t:'sel',l:'Time Range',k:'range',o:RANGES_H,f:v=>v>=60?(v/60)+':00 h':'0:'+String(v).padStart(2,'0')+' h'},{t:'sel',l:'Trend Layout',k:'trendLayout',o:['Dynamic','Fixed']}]};
  case 'profiles':return {title:'profiles',ok:true,rows:[{t:'sel',l:'Profile',k:'profile',o:['ADULT','PEDIATRIC'],f:sCap}]};
  case 'iris':return {title:'iris',rows:[{t:'info',l:'Iris',v:'Not connected'}]};
  case 'sedline':return {title:'sedline',rows:[{t:'nav',l:'Parameter Settings',to:'params'},{t:'nav',l:'Additional Settings',to:'add'}]};
  case 'params':return {title:'parameter settings',rows:['psi','dsa','sefl','sefr','emg','sr','artf'].concat(s.smart?['st']:[]).map(k=>({t:'nav',l:SD_PN[k],to:'p_'+k}))};
  case 'add':return {title:'additional settings',ok:true,rows:[{t:'sel',l:'EEG Amplitude',k:'eegAmp',o:[1,2,3,4,5,10,25,50,100],f:v=>v+' µV/mm'},{t:'sel',l:'EEG Chart Speed',k:'eegSpeed',o:[15,30],f:v=>v+' mm/sec'},{t:'tog',l:'EEG Display Filter',k:'eegFilter'},{t:'sel',l:'DSA Placement',k:'placement',o:['EEG/PSi/DSA','EEG/DSA/PSi']},{t:'tog',l:'Monitor Impedance',k:'monImp'},{t:'tog',l:'Display Impedance',k:'dispImp'},{t:'tog',l:'DSA Artifacts',k:'dsaArt'},{t:'tog',l:'Suppression Time (ST)',k:'smart'}]};
  case 'p_psi':return {title:'psi',rows:[{t:'nav',l:'About',to:'about_psi'},{t:'nav',l:'Alarms',to:'p_psi_alarms'},{t:'nav',l:'Trends',to:'p_psi_trends'}]};
  case 'p_psi_alarms':return {title:'psi alarms',ok:true,check:'psi',rows:[{t:'sel',l:'High Limit',k:'psiHi',o:sOff(5,99),f:sFmtOff},{t:'sel',l:'Low Limit',k:'psiLo',o:sOff(1,95),f:sFmtOff},{t:'sel',l:'High Caution Range',k:'psiCH',o:sOff(0,10),f:sFmtOff},{t:'sel',l:'Low Caution Range',k:'psiCL',o:sOff(0,10),f:sFmtOff},{t:'sel',l:'Silence Duration',k:'silence',o:SD_SIL,f:sFmtSil},{t:'tog',l:'Audible Alarms',k:'audible'}]};
  case 'p_psi_trends':return {title:'psi trends',ok:true,check:'psiy',rows:[{t:'sel',l:'Y-Axis Max',k:'psiYmax',o:sRng(5,100,5)},{t:'sel',l:'Y-Axis Min',k:'psiYmin',o:sRng(0,95,5)},{t:'sel',l:'Threshold Max',k:'psiTmax',o:sRng(5,100,5)},{t:'sel',l:'Threshold Min',k:'psiTmin',o:sRng(0,95,5)}]};
  case 'p_dsa':return {title:'dsa',rows:[{t:'nav',l:'About DSA',to:'about_dsa'},{t:'nav',l:'Trends',to:'p_dsa_trends'},{t:'nav',l:'Additional Settings',to:'p_dsa_add'},{t:'nav',l:'About ASYM',to:'about_asym'}]};
  case 'p_dsa_trends':return {title:'dsa trends',ok:true,check:'dsa',rows:[{t:'sel',l:'Upper (dB)',k:'dsaHi',o:sRng(-40,40,5)},{t:'sel',l:'Lower (dB)',k:'dsaLo',o:sRng(-60,-20,5)}]};
  case 'p_dsa_add':return {title:'dsa additional settings',ok:true,rows:[{t:'sel',l:'SEF Line Thickness',k:'sefThick',o:[1,2,3]},{t:'sel',l:'Max Frequency',k:'maxHz',o:[30,40],f:v=>v+' Hz'},{t:'sel',l:'DSA Type',k:'dsaType',o:['Hanning','Multitaper']}]};
  case 'p_emg':return {title:'emg',rows:[{t:'nav',l:'About',to:'about_emg'},{t:'nav',l:'Trends',to:'p_emg_trends'},{t:'nav',l:'Additional Settings',to:'p_emg_add'}]};
  case 'p_emg_add':return {title:'emg additional settings',ok:true,rows:[{t:'sel',l:'EMG Sensitivity',k:'emgSens',o:['Standard','Maximum']}]};
  case 'p_sr':return {title:'sr',rows:[{t:'nav',l:'About',to:'about_sr'},{t:'nav',l:'Alarms',to:'p_sr_alarms'},{t:'nav',l:'Trends',to:'p_sr_trends'}]};
  case 'p_sr_alarms':return {title:'sr alarms',ok:true,rows:[{t:'sel',l:'High Limit',k:'srHi',o:sOff(2,99),f:sFmtOff},{t:'sel',l:'High Caution Range',k:'srCH',o:sOff(1,10),f:sFmtOff},{t:'sel',l:'Silence Duration',k:'srSil',o:SD_SIL,f:sFmtSil}]};
  case 'p_artf':return {title:'artf',rows:[{t:'nav',l:'About',to:'about_artf'},{t:'nav',l:'Trends',to:'p_artf_trends'}]};
  case 'p_sefl':return {title:'sefl',rows:[{t:'nav',l:'About',to:'about_sefl'},{t:'nav',l:'Trends',to:'p_sefl_trends'}]};
  case 'p_sefr':return {title:'sefr',rows:[{t:'nav',l:'About',to:'about_sefr'},{t:'nav',l:'Trends',to:'p_sefr_trends'}]};
  case 'p_st':return {title:'st',rows:[{t:'nav',l:'About',to:'about_st'},{t:'nav',l:'Additional Settings',to:'p_st_add'}]};
  case 'p_st_add':return {title:'st additional settings',ok:true,rows:[{t:'sel',l:'Unit of Measurement',k:'stUnit',o:['HH:MM','%'],f:v=>v==='%'?'%':'HH:MM:SS'}]};}
 const m=/^p_(emg|sr|artf|sefl|sefr)_trends$/.exec(id);
 if(m){const k=m[1],sef=k==='sefl'||k==='sefr',mx={emg:'emgYmax',sr:'srYmax',artf:'artfYmax',sefl:'sefYmax',sefr:'sefYmax'}[k],mn=mx.replace('max','min').replace('Ymax','Ymin');
  return {title:SD_PN[k].toLowerCase()+' trends',ok:true,check:'y',rows:[{t:'sel',l:'Y-Axis Max',k:mx,o:sRng(5,sef?30:100,5),f:sef?sFmtU('Hz'):null},{t:'sel',l:'Y-Axis Min',k:mn,o:sRng(0,sef?25:95,5),f:sef?sFmtU('Hz'):null}]};}
 return {title:id,rows:[{t:'txt',text:'This screen is not available in the simulator.'}]};}
// ----- open, close, back -----
function sedDlgOpen(id){sedUnlock();const pg=sedPage(id),d={};for(const r of pg.rows||[])if(r.k&&(r.t==='sel'||r.t==='tog'))d[r.k]=r.k==='range'?SED.range:r.local?(SED.local&&SED.local[r.k])||r.def||r.o[0]:SED.set[r.k];
 if(!SED.dlg)SED.dlg={stack:[],list:null};SED.dlg.stack.push({id,draft:d,err:''});SED.dlg.list=null;SED.pop=null;sq('bMenu').setAttribute('aria-expanded','true');sedDlgRender();}
function sedDlgClose(){SED.dlg=null;const el=sq('sedDlg');el.hidden=true;el.innerHTML='';sq('bMenu').setAttribute('aria-expanded','false');sedInval();}
function sedDlgBack(){if(!SED.dlg)return;SED.dlg.stack.pop();SED.dlg.list=null;if(!SED.dlg.stack.length)sedDlgClose();else sedDlgRender();}
function sedDlgCommit(){const f=SED.dlg.stack[SED.dlg.stack.length-1],pg=sedPage(f.id),d=f.draft,s=SED.set;
 const g=k=>d[k]!==undefined?d[k]:s[k];let err='';
 if(pg.check==='psi'&&g('psiHi')!=null&&g('psiLo')!=null&&g('psiLo')>=g('psiHi'))err='The low limit must be below the high limit.';
 if(pg.check==='psiy'){if(g('psiYmin')>=g('psiYmax'))err='Y-Axis Min must be below Y-Axis Max.';else if(g('psiTmin')>=g('psiTmax'))err='Threshold Min must be below Threshold Max.';}
 if(pg.check==='dsa'&&g('dsaLo')>=g('dsaHi')-5)err='Lower must be at least 10 dB below Upper.';
 if(pg.check==='y'){const ks=pg.rows.map(r=>r.k);if(g(ks[1])>=g(ks[0]))err='Y-Axis Min must be below Y-Axis Max.';}
 if(err){f.err=err;sedDlgRender();return;}
 for(const k in d){if(k==='range'){SED.range=d[k];continue;}if(k[0]==='_'){(SED.local||(SED.local={}))[k]=d[k];continue;}s[k]=d[k];}
 if('profile' in d&&d.profile!==undefined){s.maxHz=d.profile==='PEDIATRIC'?40:30;}
 if(pg.check==='psi'||'psiHi' in d){SED.armed=false;SED.outSince=null;}
 if('standby' in d&&!d.standby)SED.standbyOn=false;
 sedSave();SED._hk=null;SED.elec=null;sedInval();applyBrightness();sedDlgBack();}
function applyBrightness(){const e=sq('sedS');if(e)e.style.filter=SED.set.brightness>=10?'':`brightness(${(0.45+SED.set.brightness*0.055).toFixed(3)})`;}
function sedDlgAct(a,v,el){const D=SED.dlg,f=D.stack[D.stack.length-1],pg=sedPage(f.id);
 switch(a){
  case 'back':case 'cancel':sedDlgBack();return;
  case 'ok':sedDlgCommit();return;
  case 'go':sedDlgOpen(v);return;
  case 'open':{const i=+v;D.list=D.list===i?null:i;sedDlgRender();const b=sq('sedDlg').querySelector('.sdlist button.on')||sq('sedDlg').querySelector('.sdlist button');if(b)b.focus();return;}
  case 'pick':{const r=pg.rows[D.list],o=r.o[+v];f.draft[r.k]=o;f.err='';D.list=null;sedDlgRender();return;}
  case 'tog':{const r=pg.rows[+v];f.draft[r.k]=!f.draft[r.k];f.err='';sedDlgRender();return;}
  case 'btn':{const r=pg.rows[+v];if(r.fn==='restore'){Object.assign(SED.set,SED_DEF);SED.exp={emg:1,psi:1,sr:1};SED.range=30;SED.armed=false;sedSave();SED._hk=null;sedInval();applyBrightness();f.draft={};for(const q of pg.rows)if(q.k&&q.t!=='btn')f.draft[q.k]=q.local?q.def||q.o[0]:SED.set[q.k];f.msg='Factory defaults restored';}else f.msg=r.l+': saved';sedDlgRender();return;}}}
function sedDlgRender(){const D=SED.dlg;if(!D)return;const f=D.stack[D.stack.length-1],pg=sedPage(f.id),el=sq('sedDlg');el.hidden=false;
 const back=`<button type="button" class="sdback" data-a="back" aria-label="Back"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" fill="#000" stroke="#d8d8d8" stroke-width="2"/><path d="M33 22H13M21 12L11 22l10 10" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
 let body='';
 if(pg.tiles){body=`<div class="sdtiles">${pg.tiles.map(t=>`<button type="button" class="sdtile" data-a="go" data-v="${t[1]}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${t[2]}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${sEsc(t[0])}</span></button>`).join('')}</div>`;}
 else{if(pg.layout)body+=`<div class="sdlay"><div class="sdlt on"><span>SedLine</span></div><p>One window, full screen. (Other layouts need a Radical-7 or other module.)</p></div>`;
  body+=pg.rows.map((r,i)=>{const val=r.k!=null?f.draft[r.k]:null,fm=r.f||(x=>String(x));
   if(r.t==='txt')return `<p class="sdtxt">${sEsc(r.text)}</p>`;
   if(r.t==='info')return `<div class="sdrow"><label>${sEsc(r.l)}</label><div class="sdinfo">${sEsc(r.v)}</div></div>`;
   if(r.t==='nav')return `<div class="sdrow nav"><button type="button" class="sdbar" data-a="go" data-v="${r.to}">${sEsc(r.l)}</button></div>`;
   if(r.t==='btn')return `<div class="sdrow"><label>${sEsc(r.l)}</label><button type="button" class="sdsave" data-a="btn" data-v="${i}">${sEsc(r.b)}</button></div>`;
   if(r.t==='tog')return `<div class="sdrow"><label id="sl${i}">${sEsc(r.l)}</label><button type="button" class="sdtog ${val?'on':''}" role="switch" aria-checked="${!!val}" aria-labelledby="sl${i}" data-a="tog" data-v="${i}"><b>${val?'ON':'OFF'}</b><i></i></button></div>`;
   const open=D.list===i;return `<div class="sdrow"><label id="sl${i}">${sEsc(r.l)}</label><button type="button" class="sdbar" aria-haspopup="listbox" aria-expanded="${open}" aria-labelledby="sl${i}" data-a="open" data-v="${i}">${sEsc(r.fmt?r.fmt(val):fm(val))}</button>
    ${open?`<div class="sdlist" role="listbox" aria-label="${sEsc(r.l)}">${r.o.map((o,j)=>`<button type="button" role="option" aria-selected="${o===val}" class="${o===val?'on':''}" data-a="pick" data-v="${j}">${sEsc(fm(o))}</button>`).join('')}</div>`:''}</div>`;}).join('');}
 el.innerHTML=`<div class="sdp" role="dialog" aria-label="${sEsc(pg.title||'main menu')}">${back}<h2>${sEsc(pg.title)}</h2><div class="sdbody">${body}${f.err?`<p class="sderr" role="alert">${sEsc(f.err)}</p>`:''}${f.msg?`<p class="sdmsg" role="status">${sEsc(f.msg)}</p>`:''}</div>
  ${pg.ok?`<div class="sdfoot"><button type="button" class="sdcancel" data-a="cancel">Cancel</button><button type="button" class="sdok" data-a="ok">OK</button></div>`:''}</div>`;
 const first=el.querySelector('.sdbar,.sdtile,.sdok,.sdback');if(first&&!D.list)first.focus({preventScroll:true});}
