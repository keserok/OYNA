#!/usr/bin/env node
/**
 * SAĞLAYICI GİRİŞİ — ÜRETİM PAKETİYLE UÇTAN UCA SÜRÜŞ
 *
 * NİYE VAR: kurucu 22 ve 23 Ağustos 2026'da aynı hatayı iki kez bildirdi —
 * "Google/Apple hesabımı seçince uygulama yeniden başlıyor ve karşıma demo
 * hesap ekranı geliyor". Hatanın iki mekanizması da TARAYICI DAVRANIŞINDAYDI
 * (açılır pencere engeli, `window.name`in çapraz kaynakta silinmesi); birim
 * testi bunları canlandıramaz. Bu sürüş gerçek Chromium'da, gerçek üretim
 * paketiyle koşar.
 *
 * NE TAKLİT EDİLİR: yalnız Google'ın kendi ekranı ve Supabase arka ucu —
 * gerçek bir Google hesabıyla otomatik oturum açılamadığı için. Bizim
 * kodumuzun tamamı GERÇEKTİR: açılır pencerenin açılması, çapraz kaynağa
 * gidip dönmesi, PKCE doğrulayıcısının ortak localStorage'dan okunması,
 * index.tsx'in "uygulamayı çizme" kararı, App.tsx'in yönlendirmesi.
 *
 * EN ZOR HÂL ZORLANIR: dönüş bağlamında `window.name` silinir ve
 * `window.opener` koparılır (Chrome'un çapraz kaynak davranışı). Eski tanıma
 * ölçütü tam burada çöküyordu.
 *
 * KULLANIM:
 *   npm run build && npm run giris:dogrula
 *   npm run giris:dogrula -- --dizin dist
 *
 * Demo hesap ekranı 23 Ağustos 2026'da KODDAN silindi; betik onun hiçbir
 * sunucu adında çizilmediğini de doğrular.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

// ─── Ayarlar ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const bayrak = (ad, varsayilan = null) => {
  const i = args.indexOf(ad);
  return i >= 0 && args[i + 1] ? args[i + 1] : varsayilan;
};
const DIZIN = resolve(bayrak('--dizin', 'dist'));
/** Yayın adresi taklidi. Chromium'a çözümletiriz; /etc/hosts gerekmez. */
const YAYIN_HOST = 'oyna-yayin.test';
const KULLANICI_ID = '11111111-2222-3333-4444-555555555555';

// ─── Küçük statik sunucu (SPA geri dönüşlü) ─────────────────────────────────
const TURLER = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};
const sunucuAc = (kok) => new Promise((coz, red) => {
  if (!existsSync(join(kok, 'index.html'))) {
    red(new Error(`Paket yok: ${kok}/index.html — önce \`npm run build\` çalıştır.`));
    return;
  }
  const s = createServer((istek, yanit) => {
    const yol = decodeURIComponent(new URL(istek.url, 'http://x').pathname);
    let dosya = join(kok, normalize(yol).replace(/^(\.\.[/\\])+/, ''));
    if (!existsSync(dosya) || statSync(dosya).isDirectory()) dosya = join(kok, 'index.html');
    yanit.writeHead(200, {
      'content-type': TURLER[extname(dosya)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(dosya).pipe(yanit);
  });
  s.listen(0, '127.0.0.1', () => coz({ sunucu: s, port: s.address().port }));
});

// ─── Tarayıcı ───────────────────────────────────────────────────────────────
const tarayiciAc = () => chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
  args: [
    // Yayın adresi taklidi 127.0.0.1'e çözülür: /etc/hosts'a dokunmayız.
    `--host-resolver-rules=MAP ${YAYIN_HOST} 127.0.0.1`,
    '--no-sandbox',
  ],
});
const baglamAc = (t) => t.newContext({ viewport: { width: 430, height: 932 }, ignoreHTTPSErrors: true });

/** Açılış jeneriği + tanıtımı geçip GİRİŞ ekranına gelir. */
const girisEkraninaGel = async (sayfa) => {
  for (let i = 0; i < 45; i += 1) {
    await sayfa.waitForTimeout(350);
    const metin = await sayfa.evaluate(() => document.body.innerText).catch(() => '');
    if (/Sahaya çık/i.test(metin)) return true;
    // Tanıtımdaki ilerletme düğmesi SİMGEDİR (metni yok) — kimlikle aranır.
    const d = sayfa.locator('#intro-continue-button');
    if (await d.count() && await d.isVisible().catch(() => false)) await d.click().catch(() => {});
  }
  return false;
};
const ekran = async (s) => (await s.evaluate(() => document.body.innerText).catch(() => ''))
  .replace(/\s+/g, ' ');

// ─── Supabase taklidi ───────────────────────────────────────────────────────
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jetonUret = () => {
  const t = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: KULLANICI_ID, aud: 'authenticated', role: 'authenticated',
          email: 'test@oyna.app', iat: t, exp: t + 3600 }),
    'sahte-imza',
  ].join('.');
};
const KULLANICI = {
  id: KULLANICI_ID, aud: 'authenticated', role: 'authenticated', email: 'test@oyna.app',
  email_confirmed_at: new Date().toISOString(), confirmed_at: new Date().toISOString(),
  phone: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { full_name: 'Test Oyuncu', email: 'test@oyna.app', avatar_url: null },
  identities: [{ id: KULLANICI_ID, user_id: KULLANICI_ID, provider: 'google',
                 identity_data: { email: 'test@oyna.app', full_name: 'Test Oyuncu' } }],
};
const KAYITLI_PROFIL = {
  role: 'PLAYER', roles: ['PLAYER'], verification_status: null, verification_notes: null,
  is_admin: false, wallet_balance: 0, phone: null, email: 'test@oyna.app',
  full_name: 'Test Oyuncu', avatar_url: null, has_completed_onboarding: true,
};

const arkaUcuTaklitEt = async (baglam, profil) => {
  // Sağlayıcı ekranı yerine doğrudan dönüş: gerçek çapraz kaynak gezinmesi.
  await baglam.route('**/auth/v1/authorize**', (yol) => {
    const donus = new URL(yol.request().url()).searchParams.get('redirect_to');
    const hedef = `${donus}${donus.includes('?') ? '&' : '?'}code=SAHTE-KOD`;
    return yol.fulfill({ status: 302, headers: { location: hedef }, body: '' });
  });
  await baglam.route('**/auth/v1/token**', (yol) => yol.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      access_token: jetonUret(), token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'sahte-yenileme', user: KULLANICI }) }));
  await baglam.route('**/auth/v1/user**', (yol) => yol.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(KULLANICI) }));
  // signOut bu uca POST atar. Taklit edilmezse istek gerçek ağa gider, düşer
  // ve oturum yerel depoda kalır — çıkış senaryosu sahte bir kırmızı üretir.
  await baglam.route('**/auth/v1/logout**', (yol) => yol.fulfill({ status: 204, body: '' }));
  // SIRA ÖNEMLİ: Playwright en SON eklenen yolu ÖNCE dener.
  await baglam.route('**/rest/v1/**', (yol) => yol.fulfill({
    status: 200, contentType: 'application/json', body: '[]' }));
  await baglam.route('**/rest/v1/profiles**', (yol) => {
    const istek = yol.request();
    if (istek.method() !== 'GET') {
      return yol.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    // PostgREST DOĞRU taklit edilmeli: `.single()` nesne kabul başlığı gönderir
    // ve 0 satırda PGRST116 döner. Boş DİZİ döndürmek JS'te DOĞRUdur; uygulama
    // onu "profil var" sanar ve yeni kullanıcı onboarding yerine ana sayfaya
    // gider. (Taklidin hatasıydı, kodun değil — kayda geçsin.)
    const nesne = /vnd\.pgrst\.object/.test(istek.headers()['accept'] || '');
    if (nesne) {
      return profil
        ? yol.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profil) })
        : yol.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({
            code: 'PGRST116', details: 'The result contains 0 rows', hint: null,
            message: 'JSON object requested, multiple (or no) rows returned' }) });
    }
    return yol.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(profil ? [profil] : []) });
  });
  await baglam.route('**/functions/v1/**', (yol) => yol.fulfill({
    status: 200, contentType: 'application/json', body: '{}' }));
};

// ─── Sonuç toplayıcı ────────────────────────────────────────────────────────
const sonuc = [];
const iddia = (ad, ok, ek = '') => {
  sonuc.push(ok);
  console.log(`  ${ok ? '[32m✓[0m' : '[31m✗[0m'} ${ad}${ek ? ` [90m— ${ek}[0m` : ''}`);
};

// ─── Senaryo: açılır pencere yolu ───────────────────────────────────────────
const pencereYolu = async (kok, baslik, { profil, beklenen, kapanmayiEngelle, saglayici = 'Google' }) => {
  console.log(`\n[1m▸ ${baslik}[0m`);
  const t = await tarayiciAc();
  const baglam = await baglamAc(t);
  await arkaUcuTaklitEt(baglam, profil);
  // EN ZOR HÂL: Chrome çapraz kaynak gezinmede window.name'i temizler, COOP
  // window.opener'ı koparır. Ağ katmanında taklit ettiğimiz için kendiliğinden
  // olmaz; elle yapılır ki yeni tanıma ölçütü gerçekten sınansın.
  await baglam.addInitScript(() => {
    try { window.name = ''; } catch { /* yoksay */ }
    try { Object.defineProperty(window, 'opener', { get: () => null, configurable: true }); } catch { /* yoksay */ }
  });
  if (kapanmayiEngelle) {
    // Mobil tarayıcı taklidi: window.close() sessizce reddediliyor.
    await baglam.addInitScript(() => { window.close = () => {}; });
  }

  const istekler = [];
  const gezinti = [];
  let donusteCizdiMi = null;
  baglam.on('page', (p) => {
    p.on('request', (r) => { if (r.isNavigationRequest()) istekler.push(r.url()); });
    p.on('framenavigated', async (f) => {
      if (f !== p.mainFrame()) return;
      gezinti.push(f.url());
      if (f.url().startsWith(kok) && f.url().includes('oyna_donus=1') && donusteCizdiMi === null) {
        donusteCizdiMi = await p
          .evaluate(() => !!document.getElementById('root')?.firstElementChild)
          .catch(() => null);
      }
    });
  });

  const ana = await baglam.newPage();
  await ana.goto(`${kok}/`, { waitUntil: 'domcontentloaded' });
  if (!(await girisEkraninaGel(ana))) { iddia('giriş ekranına ulaşıldı', false); await t.close(); return; }
  await ana.locator('#agreement-checkbox').click();
  const anaAdresOnce = ana.url();

  const pencereSozu = baglam.waitForEvent('page', { timeout: 15000 });
  await ana.locator('button', { hasText: new RegExp(`^${saglayici}$`) }).first().click();
  let pencere = null;
  try { pencere = await pencereSozu; } catch { /* açılmadı */ }
  iddia('açılır pencere açıldı (tam sayfa yönlendirmesi YOK)', !!pencere);
  if (!pencere) { await t.close(); return; }

  for (let i = 0; i < 40 && !pencere.isClosed(); i += 1) await new Promise((c) => setTimeout(c, 200));

  // 302 ara adımı COMMIT olmadığı için gezinti günlüğüne düşmez; isteğe bakılır.
  iddia('pencere sağlayıcıya (çapraz kaynağa) gitti',
    istekler.some((u) => u.includes('/auth/v1/authorize')), `${istekler.length} gezinti isteği`);
  iddia('dönüş adresi işaretli (?oyna_donus=1)',
    gezinti.some((u) => u.startsWith(kok) && u.includes('oyna_donus=1')),
    (gezinti.find((u) => u.startsWith(kok) && u.includes('code=')) || '—').replace(kok, ''));

  if (kapanmayiEngelle) {
    iddia('kapanamayan sekme açık kaldı', !pencere.isClosed());
    let metin = '';
    for (let i = 0; i < 25; i += 1) {
      await new Promise((c) => setTimeout(c, 400));
      metin = await ekran(pencere);
      if (beklenen.test(metin)) break;
    }
    iddia('kapanamayan sekmede BEYAZ SAYFA yok', metin.trim().length > 0, metin.slice(0, 70));
    iddia('kapanamayan sekmede GİRİŞ EKRANI yok', !/Sahaya çık|DEMO HESABIYLA/i.test(metin), metin.slice(0, 70));
    iddia('kapanamayan sekmede adres işareti temizlendi', !pencere.url().includes('oyna_donus'));
  } else {
    iddia('dönüş penceresi UYGULAMAYI ÇİZMEDİ', donusteCizdiMi === false,
      `dönüş anında #root dolu mu: ${donusteCizdiMi}`);
    iddia('dönüş penceresi kendini KAPATTI', pencere.isClosed());
  }

  iddia('ana sekmenin adresi DEĞİŞMEDİ', ana.url() === anaAdresOnce, ana.url().replace(kok, ''));
  let anaMetin = '';
  for (let i = 0; i < 30; i += 1) {
    await new Promise((c) => setTimeout(c, 400));
    anaMetin = await ekran(ana);
    if (beklenen.test(anaMetin)) break;
  }
  iddia(`ana sekme beklenen ekrana geçti ${beklenen}`, beklenen.test(anaMetin), anaMetin.slice(0, 90));
  iddia('ana sekmede giriş ekranı KALMADI', !/Sahaya çık/i.test(anaMetin), anaMetin.slice(0, 70));
  await t.close();
};

// ─── Senaryo: açılır pencere engelli (emniyet valfi) ────────────────────────
const engelliYol = async (kok) => {
  console.log('\n[1m▸ Açılır pencere ENGELLİ — emniyet valfi (tam sayfa)[0m');
  const t = await tarayiciAc();
  const baglam = await baglamAc(t);
  await arkaUcuTaklitEt(baglam, KAYITLI_PROFIL);
  await baglam.addInitScript(() => { window.open = () => null; });
  const ana = await baglam.newPage();
  await ana.goto(`${kok}/`, { waitUntil: 'domcontentloaded' });
  if (!(await girisEkraninaGel(ana))) { iddia('giriş ekranına ulaşıldı', false); await t.close(); return; }
  await ana.locator('#agreement-checkbox').click();
  await ana.locator('button', { hasText: /^Google$/ }).first().click();

  let metin = '';
  for (let i = 0; i < 40; i += 1) {
    await new Promise((c) => setTimeout(c, 400));
    metin = await ekran(ana);
    if (/ANA SAYFA|Yakınındaki|MAÇ|KONUM/i.test(metin)) break;
  }
  // İşaret YALNIZ pencere açılabildiğinde eklenir; ana sekme dönüşte uygulamayı
  // çizmeli, yoksa kullanıcı boş sayfayla kalır.
  iddia('tam sayfa dönüşünde adreste işaret YOK', !ana.url().includes('oyna_donus'));
  iddia('tam sayfa dönüşünde uygulama ÇİZİLDİ (beyaz sayfa yok)', metin.trim().length > 0, metin.slice(0, 70));
  iddia('tam sayfa dönüşünde giriş ekranına düşülmedi', !/Sahaya çık/i.test(metin), metin.slice(0, 70));
  await t.close();
};

// ─── Senaryo: ÇIKIŞ SONRASI ekran ──────────────────────────────────────────
// Kurucu 23 Ağu 2026'da şunu bildirdi: "Çıkış yaptığımda da hâlâ bu ekran
// geliyor" (telefon + demo ekranı). Giriş ekranı tek bir bileşendir; ama
// iddiayı sözle değil sürüşle kapatıyoruz: oturum düşürülüp uygulama yeniden
// açıldığında karşımıza çıkan ekran ölçülür.
const cikisSonrasi = async (kok) => {
  console.log('\n[1m▸ ÇIKIŞ sonrası karşılama ekranı[0m');
  const t = await tarayiciAc();
  const baglam = await baglamAc(t);
  await arkaUcuTaklitEt(baglam, KAYITLI_PROFIL);
  const ana = await baglam.newPage();
  await ana.goto(`${kok}/`, { waitUntil: 'domcontentloaded' });
  if (!(await girisEkraninaGel(ana))) { iddia('giriş ekranına ulaşıldı', false); await t.close(); return; }
  await ana.locator('#agreement-checkbox').click();
  const pencereSozu = baglam.waitForEvent('page', { timeout: 15000 });
  await ana.locator('button', { hasText: /^Google$/ }).first().click();
  await pencereSozu.catch(() => null);
  let icerde = '';
  for (let i = 0; i < 30; i += 1) {
    await new Promise((c) => setTimeout(c, 400));
    icerde = await ekran(ana);
    if (/ANA SAYFA|Yakınındaki|MAÇ/i.test(icerde)) break;
  }
  iddia('önce içeri girildi', /ANA SAYFA|Yakınındaki|MAÇ/i.test(icerde), icerde.slice(0, 60));

  // GERÇEK ÇIKIŞ — ürünün kendi yolundan: Profil → Ayarlar → "Çıkış Yap".
  // Depoyu elle silmek "çıkış yaptım" DEĞİLDİR; kurucunun yaptığı şey bu üç
  // dokunuştur ve bayat sekme sorunu da tam burada ortaya çıkıyordu.
  await ana.locator('[aria-label="Profil"]').first().click();
  await ana.waitForTimeout(1200);
  const ayarlar = ana.locator('button:has-text("Ayarlar"), [aria-label="Ayarlar"]').first();
  iddia('Profil → Ayarlar yolu var', (await ayarlar.count()) > 0);
  await ayarlar.click();
  await ana.waitForTimeout(1200);
  const cikis = ana.locator('button:has-text("Çıkış Yap")').first();
  iddia('Ayarlar\u2019da "Çıkış Yap" var', (await cikis.count()) > 0);
  await cikis.click();

  // ÇIKIŞ SEKMEYİ KÖKTEN YENİDEN YÜKLER (23 Ağu 2026). Yükleme gerçekten
  // oluyor mu ölçülür: olmazsa ekran, sekmenin AÇILDIĞI GÜNKÜ paketten
  // çizilir ve eski giriş ekranı geri gelir — kurucunun bildirdiği şey buydu.
  const yuklendi = await ana.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
  iddia('çıkış sekmeyi yeniden yükledi (bayat paket kalmaz)', yuklendi);
  await ana.waitForTimeout(800);
  if (!(await girisEkraninaGel(ana))) {
    iddia('çıkıştan sonra giriş ekranı geldi', false, (await ekran(ana)).slice(0, 90));
    await t.close();
    return;
  }
  const metin = await ekran(ana);
  iddia('çıkıştan sonra gelen ekran "Sahaya çık"', /Sahaya çık/i.test(metin), metin.slice(0, 60));
  for (const iz of ['Numaranla gir', 'TELEFON NUMARAN', 'KOD GÖNDER', 'DEMO HESABIYLA', 'APP REVIEW']) {
    iddia(`çıkış ekranında "${iz}" YOK`, !metin.includes(iz));
  }
  iddia('çıkış ekranında Apple ve Google var',
    (await ana.locator('button', { hasText: /^Apple$/ }).count()) === 1
    && (await ana.locator('button', { hasText: /^Google$/ }).count()) === 1);
  await t.close();
};

// ─── Senaryo: demo kapısı (aynı paket, iki sunucu adı) ──────────────────────
const demoKapisi = async (port) => {
  // Demo yolları koddan silindi: hiçbir bayrak, hiçbir sunucu adı geri
  // getiremez. İki ayrı adreste de yokluğu doğrulanır.
  console.log('\n[1m▸ Demo hesap ekranı — hiçbir adreste yok[0m');
  for (const [ad, kok, beklenen] of [
    ['yerel sunucu (127.0.0.1)', `http://127.0.0.1:${port}`, false],
    [`yayın adresi (${YAYIN_HOST})`, `http://${YAYIN_HOST}:${port}`, false],
  ]) {
    const t = await tarayiciAc();
    const s = await (await baglamAc(t)).newPage();
    await s.goto(`${kok}/`, { waitUntil: 'domcontentloaded' });
    const geldi = await girisEkraninaGel(s);
    const metin = await ekran(s);
    await t.close();
    if (!geldi) { iddia(`${ad} · giriş ekranına ulaşıldı`, false, metin.slice(0, 70)); continue; }
    const varMi = /DEMO HESABIYLA|Demo Hesabıyla|DEMO MODU/i.test(metin);
    iddia(`${ad} · demo ekranı ${beklenen ? 'VAR olmalı' : 'YOK olmalı'}`, varMi === beklenen,
      `ekranda ${varMi ? 'var' : 'yok'}`);
  }
};

// ─── Koşum ──────────────────────────────────────────────────────────────────
const { sunucu, port } = await sunucuAc(DIZIN);
const KOK = `http://${YAYIN_HOST}:${port}`;
console.log(`[90mPaket: ${DIZIN}\nAdres: ${KOK}[0m`);

try {
  await pencereYolu(KOK, 'KAYITLI kullanıcı · Google · pencere kapanabiliyor',
    { profil: KAYITLI_PROFIL, beklenen: /ANA SAYFA|Yakınındaki|MAÇ|KONUM/i });
  await pencereYolu(KOK, 'YENİ kullanıcı · Google · onboarding başlamalı',
    { profil: null, beklenen: /ADIM 1|KONUM|Konumunu ayarla/i });
  await pencereYolu(KOK, 'KAYITLI kullanıcı · Google · pencere KAPANAMIYOR (mobil sekme)',
    { profil: KAYITLI_PROFIL, beklenen: /ANA SAYFA|Yakınındaki|MAÇ|KONUM/i, kapanmayiEngelle: true });
  await pencereYolu(KOK, 'KAYITLI kullanıcı · APPLE',
    { profil: KAYITLI_PROFIL, beklenen: /ANA SAYFA|Yakınındaki|MAÇ|KONUM/i, saglayici: 'Apple' });
  await engelliYol(KOK);
  await cikisSonrasi(KOK);
  await demoKapisi(port);
} finally {
  sunucu.close();
}

const kalan = sonuc.filter((x) => !x).length;
console.log(`\n${kalan ? '[31m' : '[32m'}SONUÇ: ${sonuc.length - kalan}/${sonuc.length} geçti.[0m`);
process.exit(kalan ? 1 : 0);
