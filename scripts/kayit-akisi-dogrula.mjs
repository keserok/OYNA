// kayit-akisi-dogrula.mjs
// Kayıt → kurulum → tekrar giriş yolunu CANLI Supabase'e karşı uçtan uca sürer.
//
//   npm run dev -- --port 5199 --strictPort     (ayrı bir kabukta)
//   npm run kayit:dogrula
//
// ─── NEDEN BİRİM TESTİ YETMİYOR ──────────────────────────────────────────────
// Kayıt akışının kopma noktaları istemcide DEĞİL, istemci ile sunucu ayarının
// arasındadır. En son örnek: e-posta doğrulaması sunucuda açıktı, ücretsiz plan
// saatte 2 posta gönderiyordu; kod kusursuz çalışıyor, kayıt olan kimse giriş
// yapamıyordu. Hiçbir birim testi bunu göremez — yalnız gerçek sürüş görür.
//
// ─── SÜRÜŞTE ÖĞRENİLEN TUZAKLAR (hepsi buraya gömülü) ────────────────────────
// 1) Temiz profil önce TANITIM karuselini gösterir. `#auth-tab-kayit` doğrudan
//    aranırsa bulunamaz; önce `#intro-continue-button` ile geçilmelidir.
// 2) Yasal onay verilmeden "HESAP OLUŞTUR"a basılırsa ekran hata vermez,
//    `aria-label="Yasal onay"` penceresini açar. Kayıt o pencerenin
//    "ONAYLIYORUM VE DEVAM ET" düğmesiyle tamamlanır.
// 3) Kayıttan sonra ANA SAYFA DEĞİL, 5 adımlık kurulum sihirbazı gelir.
// 4) Sihirbazın ATLAMA YOLU YOKTUR (kurucu kararı, 24 Ağu 2026). Her adım
//    doldurulur; tercihe bağlı alanlar (cinsiyet, pozisyon) "OPSİYONEL"
//    etiketiyle boş bırakılabilir, konum ise cihaz izni olduğu için adımın
//    kendi "Konumsuz devam et" çıkışıyla geçilir.
// 5) Yaş çarkının öğeleri <button> değil tıklanabilir <div>'dir ve etiketlerde
//    kısa çizgi değil UZUN TİRE vardır: '24–30'. '24-30' aranırsa BULUNMAZ.
// 6) Seviye şeridi `role="slider"` olup `onPointerDown` ile çalışır; öğeye
//    click() yetmez, koordinata GERÇEK fare tıklaması gerekir.
// 7) Yanlış şifre denemesinde sayfa metnine bakmak SAHTE YEŞİL verir: ekranın
//    kendi alt yazısında da "şifre" geçiyor. Gerçek hata `role="alert"` içinde.
import { chromium } from 'playwright';

const URL    = process.env.OYNA_URL || 'http://localhost:5199/';
const damga  = process.env.OYNA_DAMGA || String(Date.now()).slice(-6);
const EPOSTA = `kayittest-${damga}@oyna.app`;
const SIFRE  = 'Sahada!2026x';
const AD     = 'Kayit Testi';

const log = (...a) => console.log(...a);
const adimlar = [];
const adim = (ad, ok, not = '') => {
  adimlar.push({ ad, ok });
  log(`${ok ? '✓' : '✗'} ${ad}${not ? ' — ' + not : ''}`);
};

const yeniSayfa = async (b) => {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
      : undefined,
  });
  return { ctx, p: await ctx.newPage() };
};

const evde = (p) => p.evaluate(() => /MERHABA|ANA SAYFA|SAHA KİRALA/i.test(document.body.innerText));

/** TUZAK 1: tanıtım karuselini geç, sonra giriş ekranını bekle. */
const authEkrani = async (p) => {
  for (let i = 0; i < 14; i++) {
    if (await p.locator('#auth-tab-kayit').count()) return;
    const d = p.locator('#intro-continue-button');
    if (await d.count() && await d.isVisible()) { await d.click(); await p.waitForTimeout(500); }
    else await p.waitForTimeout(900);
  }
  await p.waitForSelector('#auth-tab-kayit', { timeout: 15000 });
};

const CTA = /^(Devam Et|İleri|Profili Tamamla|Konumsuz devam et|Başla|Bitir)$/;
const GEZINME = ['Geri', 'Kapat', 'Konumu Aç'];

/** Kurulum sihirbazını GERÇEK KULLANICI GİBİ doldurur (TUZAK 4-5-6). */
const atlamaTusuGorundu = [];

const sihirbaziDoldur = async (p) => {
  const gorulen = [];
  for (let i = 0; i < 14; i++) {
    if (await evde(p)) break;
    const baslik = await p.evaluate(
      () => (document.body.innerText.match(/ADIM\s*\d+[^\n]*/i) || [''])[0].trim());
    if (baslik && gorulen[gorulen.length - 1] !== baslik) { gorulen.push(baslik); log('   · ' + baslik); }

    // Kurucu kararı: hiçbir adımda atlama tuşu OLMAMALI. Geri gelirse
    // kullanıcı profili eksik hâlde uygulamaya girer.
    if (await p.getByRole('button', { name: 'Atla', exact: true }).count()) {
      atlamaTusuGorundu.push(baslik || '(başlıksız)');
    }

    // TUZAK 6: yıldız şeridi gerçek dokunuş ister.
    const kaydirac = p.locator('[role=slider]').first();
    if (await kaydirac.count() && await kaydirac.isVisible()) {
      const b = await kaydirac.boundingBox();
      if (b) await p.mouse.click(b.x + b.width * 0.68, b.y + b.height / 2);
      await p.waitForTimeout(500);
    }

    // TUZAK 5: yaş çarkı — <div> ve UZUN TİRE.
    const yas = p.getByText('24–30', { exact: true }).first();
    if (await yas.count() && await yas.isVisible()) {
      await yas.click({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(700);
    }

    // Diğer adımlarda ilk seçeneği işaretle (pozisyon, oyun stili…).
    const dugmeler = p.locator('button');
    const n = await dugmeler.count();
    for (let k = 0; k < n; k++) {
      const e = dugmeler.nth(k);
      const m = ((await e.innerText().catch(() => '')) || '').trim();
      if (!m || GEZINME.includes(m) || CTA.test(m)) continue;
      if (await e.isVisible() && await e.isEnabled()) {
        await e.click({ timeout: 4000 }).catch(() => {});
        await p.waitForTimeout(350);
      }
      break;
    }

    let ilerledi = false;
    for (const ad of ['Profili Tamamla', 'Devam Et', 'İleri', 'Konumsuz devam et', 'Bitir', 'Başla']) {
      const d = p.getByRole('button', { name: ad, exact: true }).first();
      if (await d.count() && await d.isVisible() && await d.isEnabled()) {
        if (await d.click({ timeout: 6000 }).then(() => true).catch(() => false)) { ilerledi = true; break; }
      }
    }
    if (!ilerledi) break;
    await p.waitForTimeout(1800);
  }
  return gorulen;
};

const tarayici = await chromium.launch({
  executablePath: process.env.OYNA_CHROMIUM || '/opt/pw-browsers/chromium',
  // Ağ geçidi Chromium'un TLS 1.3 ClientHello'suna RESET atıyor; 1.2'de
  // sertifika doğrulaması tam açık kalır ve bağlantı geçer.
  args: ['--ssl-version-max=tls1.2'],
});
let hata = null;
try {
  // ═══ A · KAYIT ═══════════════════════════════════════════════════════════
  log('\n─── A · YENİ HESAP KAYDI ───');
  let { ctx, p } = await yeniSayfa(tarayici);
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await authEkrani(p);
  adim('Tanıtım geçildi, giriş ekranı açıldı (GİRİŞ YAP · KAYIT OL sekmeleri)', true);

  await p.click('#auth-tab-kayit');
  await p.waitForSelector('#auth-ad', { timeout: 10000 });
  const tanitim = await p.evaluate(() => document.body.innerText);
  adim('KAYIT sekmesi açıldı', true);
  adim('Ekran "herkes oyuncu olarak başlar" diyor, rol seçtirmiyor',
       /oyuncu olarak başlar/i.test(tanitim) && !/rol seç/i.test(tanitim));

  // Kurucu şartı: KVKK onayı ve "Beni Hatırla" BÜYÜK ve kaydırmadan görünür.
  const olc = await p.evaluate(() => {
    const g = (s) => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); return { y: Math.round(r.y), h: Math.round(r.height) }; };
    return { onay: g('#agreement-checkbox'), hatirla: g('#remember-me-toggle'), pencere: window.innerHeight };
  });
  const gor = (o) => o && o.y >= 0 && o.y + o.h <= olc.pencere + 2;
  adim('Yasal onay kartı kaydırmadan görünüyor ve büyük',
       gor(olc.onay) && olc.onay.h >= 48, `y=${olc.onay?.y}px yükseklik=${olc.onay?.h}px`);
  adim('Beni Hatırla anahtarı kaydırmadan görünüyor ve büyük',
       gor(olc.hatirla) && olc.hatirla.h >= 44, `y=${olc.hatirla?.y}px yükseklik=${olc.hatirla?.h}px`);

  await p.fill('#auth-ad', AD);
  await p.fill('#auth-eposta', EPOSTA);
  await p.fill('#auth-sifre', SIFRE);
  adim('Şifre gücü göstergesi çalışıyor',
       /Şifre gücü:\s*(Güçlü|Orta|Zayıf)/i.test(await p.evaluate(() => document.body.innerText)));

  await p.locator('button[type=submit]').first().click();
  await p.waitForTimeout(1300);
  adim('Yasal onay verilmeden kayıt YAPILMIYOR',
       await p.evaluate(() => !!document.querySelector('#auth-eposta')));

  // TUZAK 2: onay penceresi.
  const onayPenceresi = p.locator('div[role="dialog"][aria-label="Yasal onay"]');
  if (await onayPenceresi.count() && await onayPenceresi.isVisible()) {
    adim('Onay verilmeyince YASAL ONAY penceresi açıldı', true);
    await onayPenceresi.locator('button', { hasText: /DEVAM ET/i }).first().click();
  } else {
    // Kart doğrudan işaretlenirse: ORTASI bağlantı metnidir, kutucuğa tıkla.
    const kutu = p.locator('#agreement-checkbox .au-kutu').first();
    const b = await kutu.boundingBox();
    await p.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await p.locator('button[type=submit]').first().click();
    adim('Onay kutucuğu işaretlenip kayıt gönderildi', true);
  }

  // TUZAK 3: ana sayfa değil, sihirbaz gelir.
  await p.waitForFunction(
    () => /ADIM\s*\d/i.test(document.body.innerText)
       || /MERHABA|ANA SAYFA|SAHA KİRALA/i.test(document.body.innerText),
    null, { timeout: 30000 });
  adim('KAYIT BAŞARILI — oturum anında açıldı, e-posta onayı İSTENMEDİ', true);
  adim('"Doğrulama bağlantısı gönderildi" ekranı ÇIKMADI',
       !/onay bekl|doğrulama bağlantısı/i.test(await p.evaluate(() => document.body.innerText)));

  const gorulen = await sihirbaziDoldur(p);
  adim(`Kurulum sihirbazı tamamlandı (${gorulen.length} adım)`, await evde(p), gorulen.join(' → '));
  adim('Hiçbir adımda "Atla" tuşu YOK', atlamaTusuGorundu.length === 0,
       atlamaTusuGorundu.length ? 'göründüğü adımlar: ' + atlamaTusuGorundu.join(', ') : '');
  await ctx.close();

  // ═══ B · TEMİZ TARAYICIDA TEKRAR GİRİŞ ═══════════════════════════════════
  log('\n─── B · TEMİZ TARAYICIDA TEKRAR GİRİŞ ───');
  ({ ctx, p } = await yeniSayfa(tarayici));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await authEkrani(p);
  await p.click('#auth-tab-giris');
  await p.waitForTimeout(400);
  adim('GİRİŞ sekmesinde "Ad Soyad" alanı YOK',
       await p.evaluate(() => !document.querySelector('#auth-ad')));
  adim('GİRİŞ sekmesinde yasal onay kartı YOK (yalnız kayıtta sorulur)',
       await p.evaluate(() => !document.querySelector('#agreement-checkbox')));

  await p.fill('#auth-eposta', EPOSTA);
  await p.fill('#auth-sifre', SIFRE);
  await p.locator('button[type=submit]').first().click();
  await p.waitForFunction(
    () => /MERHABA|ANA SAYFA|SAHA KİRALA/i.test(document.body.innerText), null, { timeout: 30000 });
  adim('GİRİŞ BAŞARILI — aynı şifreyle girildi, doğrudan ANA SAYFA açıldı', true);
  adim('Kurulum sihirbazı BİR DAHA sorulmadı',
       !/ADIM\s*\d/i.test(await p.evaluate(() => document.body.innerText)));
  await ctx.close();

  // ═══ C · YANLIŞ ŞİFRE ════════════════════════════════════════════════════
  log('\n─── C · YANLIŞ ŞİFRE ───');
  ({ ctx, p } = await yeniSayfa(tarayici));
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await authEkrani(p);
  await p.click('#auth-tab-giris');
  await p.fill('#auth-eposta', EPOSTA);
  await p.fill('#auth-sifre', 'YanlisSifre!9999');
  await p.locator('button[type=submit]').first().click();
  await p.waitForTimeout(4000);
  adim('Yanlış şifre REDDEDİLDİ, giriş ekranında kalındı',
       await p.evaluate(() => !!document.querySelector('#auth-eposta')));
  // TUZAK 7: sayfa metni değil, role=alert.
  const uyari = (await p.evaluate(
    () => [...document.querySelectorAll('[role=alert], .au-alan-hata')]
            .map((e) => e.innerText.trim()).filter(Boolean))).join(' | ');
  adim('Hata, ekran okuyucuya da duyurulan bir uyarı olarak gösterildi',
       /şifre|hatal/i.test(uyari), uyari.slice(0, 100));
  // Hangi alanın yanlış olduğunu SÖYLEMEMELİ: "bu e-posta kayıtlı" demek,
  // saldırgana hesap listesi çıkarma imkânı verir.
  adim('Hata, e-postanın kayıtlı olup olmadığını ELE VERMİYOR',
       !/kayıtlı değil|böyle bir hesap|bulunamadı/i.test(uyari));
  await ctx.close();
} catch (e) {
  hata = e.message;
  log('\n✗✗ SÜRÜŞ DURDU: ' + e.message.split('\n')[0]);
} finally {
  await tarayici.close();
}

const kalan = adimlar.filter((a) => !a.ok);
log(`\n═══ ÖZET: ${adimlar.length - kalan.length}/${adimlar.length} adım geçti ═══`);
if (kalan.length) log('GEÇMEYENLER: ' + kalan.map((a) => a.ad).join(' · '));
log(`\nAÇILAN TEST HESABI: ${EPOSTA}`);
log('Canlıda bırakmamak için sil:');
log(`  DELETE FROM auth.users WHERE email = '${EPOSTA}';`);
process.exit(kalan.length || hata ? 1 : 0);
