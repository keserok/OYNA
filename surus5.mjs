import { chromium } from 'playwright';
const SHOTS='/tmp/claude-0/-home-user/c4bb2f14-1bc5-5ab4-a83f-a526f78d1306/scratchpad/shots';
const PROXY=process.env.HTTPS_PROXY||process.env.https_proxy;
const SIFRE='Oyna!Saha2026';
const HESAPLAR=[
 ['oyuncu@oyna.app','oyuncu'],
 ['kaleci@oyna.app','kaleci'],
 ['hakem@oyna.app','hakem'],
 ['saha1@oyna.app','tesis'],
];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--ssl-version-max=tls1.2'],...(PROXY?{proxy:{server:PROXY,bypass:'localhost,127.0.0.1'}}:{})});

for (const [eposta, etiket] of HESAPLAR) {
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const p=await ctx.newPage();
  const auth=[];
  p.on('response',async r=>{const u=r.url(); if(u.includes('/auth/v1/token')){let g=''; try{g=(await r.text()).slice(0,120);}catch{} auth.push(`${r.status()} :: ${g.slice(0,90)}`);}});
  try{
    await p.goto('http://localhost:5199/',{waitUntil:'domcontentloaded'});
    await p.waitForSelector('#intro-continue-button',{timeout:45000});
    await p.click('#intro-continue-button'); await p.waitForTimeout(700);
    // GIRIS kipine gec
    await p.click('#auth-tab-giris'); await p.waitForTimeout(400);
    await p.fill('#auth-eposta',eposta);
    await p.fill('#auth-sifre',SIFRE);
    await p.click('button[type="submit"]');
    await p.waitForTimeout(9000);
    const s=await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,160));
    await p.screenshot({path:`${SHOTS}/20-giris-${etiket}.png`});
    console.log(`\n=== ${etiket.toUpperCase()} (${eposta}) ===`);
    console.log('  auth:', auth.join(' | ')||'(yok)');
    console.log('  ekran:', s);
  }catch(e){ console.log(`\n=== ${etiket} HATA:`, String(e).slice(0,160)); }
  await ctx.close();
}
await b.close();
