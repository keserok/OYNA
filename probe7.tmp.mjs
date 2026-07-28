import { chromium } from 'playwright';
const OUT='/tmp/claude-0/-home-user-OYNA/f7b71ead-8d0c-58fd-8b9c-6af229bd1e0e/scratchpad/shots7';
import fs from 'fs'; fs.mkdirSync(OUT,{recursive:true});
const b64url=(o)=>Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const past=Math.floor(Date.now()/1000)-7200;
const jwt=`${b64url({alg:'HS256',typ:'JWT'})}.${b64url({sub:'e2e',role:'authenticated',aud:'authenticated',exp:past})}.sig`;
const expired=JSON.stringify({access_token:jwt,token_type:'bearer',expires_in:3600,expires_at:past,refresh_token:'r',user:{id:'e2e',aud:'authenticated',role:'authenticated',email:'e2e@oyna.app',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date(0).toISOString()}});
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
async function shot(i){
  const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await ctx.newPage();
  await page.route('**/*',r=>{const u=new URL(r.request().url()); if(u.hostname==='localhost'||u.hostname==='127.0.0.1') return r.continue();
    if(/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(u.pathname)) return r.fulfill({status:200,contentType:'image/png',body:PNG});
    return r.fulfill({status:200,contentType:'text/plain',body:''});});
  await page.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.route('**/auth/v1/**',()=>{ /* asla cevaplama → oturum cozumlenmez, SPLASH kalir */ });
  await page.addInitScript((s)=>{localStorage.setItem('oyna.auth.token',s);},expired);
  await page.goto('http://localhost:4010/',{waitUntil:'load'});
  await page.waitForTimeout(6000);
  const r=await page.evaluate(async()=>{
    const src=await (await fetch('/App.tsx')).text();
    const mm=src.match(/["'](\/node_modules\/\.vite\/deps\/framer-motion\.js[^"']*)["']/);
    const m=await import(mm[1]); m.MotionGlobalConfig.skipAnimations=true;
    const st=await import('/store.ts'); st.useAppStore.getState().resetNavigation('SPLASH');
    return true;});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  await page.waitForTimeout(2500);
  const view=await page.evaluate(async()=>{const m=await import('/store.ts');return m.useAppStore.getState().view;});
  const buf=await page.screenshot({path:`${OUT}/SPLASH-${i}.png`});
  await ctx.close();
  return {buf,view};
}
const a=await shot(1), b=await shot(2);
console.log('view=',a.view,b.view,'tekrarlanabilir=',Buffer.compare(a.buf,b.buf)===0);
await browser.close();
