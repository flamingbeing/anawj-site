// Fake demo data only. All Inspired themes on Add/List, phone/desktop, both appearances; picker and persistence.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {THEMES} from '../../js/themes.js';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const output=process.env.E2E_OUT;const ids=THEMES.slice(-25).map(t => t.id);const themes=THEMES.filter(t=>t.group==='inspired');
const browser=await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']} : {});const errors=[],results=[];
try{
for(const width of [390,1280]){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'}); const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://localhost:${process.env.PORT || 8080}/logbook/?demo#log`);await page.locator('textarea.details').waitFor();
 for(const theme of themes)for(const mode of ['light','dark']){
  const dir=output && `${output}/catalogue/${width}-${mode}`;if(dir)mkdirSync(dir,{recursive:true});
  await page.evaluate(async({id,mode})=>{const d=await import('./js/display.js'),t=await import('./js/themes.js');d.applyTheme(mode);d.applyDisplay(d.setDisplay(t.themePatch(t.themeById(id))));(await import('./js/ui-core.js')).hooks.render();},{id:theme.id,mode});
  for(const screen of ['log','logbook']){
   await page.evaluate(s=>{location.hash='#'+s},screen);
   if(screen==='log')await page.locator('textarea.details').waitFor();
   else{await page.locator('main .seg button',{hasText:/^List$/}).first().click();await page.locator('ul.cases').waitFor();}
   await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(80);await page.evaluate(()=>scrollTo(0,0));
   const actual=await page.evaluate(async()=>{const d=await import('./js/display.js'),t=await import('./js/themes.js');const root=document.documentElement,style=getComputedStyle(root);return {overflow:root.scrollWidth>innerWidth+1,custom:t.themeState(d.display()).custom,bg:style.getPropertyValue('--bg').trim()};});
   assert.equal(actual.overflow,false,`${theme.id} ${width} ${mode} ${screen}: overflow`);assert.equal(actual.custom,false,theme.id+' selected');assert.equal(actual.bg,theme.look.colours[mode].bg);
   if(dir)await page.screenshot({path:`${dir}/${theme.id}-${screen}.png`,animations:'disabled',caret:'hide'});
   results.push({id:theme.id,width,mode,screen,...actual});
  }
  // Every appearance opens and dismisses a real dialog and displays a toast.
  await page.evaluate(async()=>{const c=await import('./js/ui-core.js');c.confirmBox('Review theme','Example text to check dialog readability.','OK');});
  const dialog=page.locator('dialog[open]');await dialog.waitFor();
  const bounds=await dialog.boundingBox();assert.ok(bounds.width<=width+1,theme.id+' dialog fits');
  if(dir && width===390 && (ids.includes(theme.id)||['obsidian','gmail','whatsapp'].includes(theme.id)))await page.screenshot({path:`${dir}/${theme.id}-dialog.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.evaluate(async()=>{const c=await import('./js/ui-core.js');c.toast('Example saved');});await page.locator('#toast.show').waitFor();
  await page.evaluate(async()=>{(await import('./js/ui-core.js')).clearToast();});
 }
 console.log(`PASS ${width}px: ${themes.length} themes × two appearances × Add/List, dialogs and toasts`);
 // Exercise actual searchable picker and reload for all 25 additions, plus revised Obsidian.
 if(width===390)for(const id of ['obsidian',...ids]){
  const theme=themes.find(t=>t.id===id);await page.evaluate(()=>location.hash='#themesall');
  await page.locator('.theme-find').fill(theme.name);await page.locator('.theme-row',{has:page.getByText(theme.name,{exact:true})}).click();
  assert.equal(await page.evaluate(async()=>(await import('./js/display.js')).display().theme),id);
  await page.reload();await page.locator('.theme-find').waitFor();
  assert.equal(await page.evaluate(async()=>(await import('./js/display.js')).display().theme),id,id+' reload');
 }
 // Return from every facet combination to the unmodified default CSS.
 await page.evaluate(async()=>{const d=await import('./js/display.js'),t=await import('./js/themes.js');d.applyDisplay(d.setDisplay(t.themePatch(t.themeById('nuhs'))));});
 assert.equal(await page.locator('#look-css').textContent(),'');
 if (width === 390) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(async () => { const d = await import('./js/display.js'), t = await import('./js/themes.js'); d.applyDisplay(d.setDisplay(t.themePatch(t.themeById('terracotta')))); location.hash = '#logbook'; (await import('./js/ui-core.js')).hooks.render(); });
  await page.locator('ul.cases').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Terracotta fits 320px');
}
 await context.close();
}
assert.deepEqual(errors,[]);if(output)writeFileSync(output+'/browser-results.json',JSON.stringify({checks:results.length,errors,results},null,2));
}finally{await browser.close();}
