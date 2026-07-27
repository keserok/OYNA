// Kılavuz ekran görüntüleri — rol bazlı çekim akışları.
//
//   node scripts/kilavuz-gorselleri/flows.mjs            # hepsi
//   node scripts/kilavuz-gorselleri/flows.mjs oyuncu     # tek rol
//
// Ön koşul: yerel yığın ayakta (local-stack/up.sh) veya canlıya ağ izni var.
// Gezinme, tıklama yerine uygulamanın kendi store'u üzerinden yapılır
// (`import('/store.ts')` → setView) — kırılgan seçicilere bağımlı değildir.
import { launch, loginApp, shot, APP, ADMIN, PASS } from './capture.mjs';

const results = { ok: [], fail: [] };

/** Store üzerinden görünüm değiştir. */
async function go(page, view, wait = 2500) {
  await page.evaluate(async (v) => {
    const m = await import('/store.ts');
    m.useAppStore.getState().setView(v);
  }, view);
  await page.waitForTimeout(wait);
}

/** Tek bir kareyi al; hata olursa kaydet ama akışı kesme. */
async function step(page, rel, fn) {
  try {
    if (fn) await fn();
    await shot(page, rel);
    results.ok.push(rel);
  } catch (e) {
    console.log(`  ✗ ${rel} — ${String(e).slice(0, 120)}`);
    results.fail.push(rel);
  }
}

/** Metni birebir içeren ilk görünür ögeye tıkla (Türkçe İ sorunu yok). */
async function clickText(page, text, timeout = 8000) {
  const el = page.getByText(text, { exact: false }).first();
  await el.waitFor({ timeout });
  await el.click();
  await page.waitForTimeout(2000);
}

// ═══════════════════════════════════════════════════════════ GENEL ══════════
async function flowGenel() {
  const { ctx, page } = await launch('genel');
  console.log('\n▸ genel');
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await step(page, 'genel/01-giris-ekrani.png');

  await loginApp(page, 'oyuncu');
  await go(page, 'DASHBOARD');
  await step(page, 'genel/02-ana-sayfa-alt-menu.png');
  await ctx.close();
}

// ══════════════════════════════════════════════════════════ OYUNCU ══════════
async function flowOyuncu() {
  const { ctx, page } = await launch('oyuncu');
  console.log('\n▸ oyuncu');
  await loginApp(page, 'oyuncu');

  await step(page, 'oyuncu/01-ana-sayfa.png', () => go(page, 'DASHBOARD'));
  await step(page, 'oyuncu/02-top-oyna.png', () => go(page, 'MATCH_DISCOVERY', 3500));

  // Maç lobisi: listeden ilk maça gir
  await step(page, 'oyuncu/03-mac-lobisi.png', async () => {
    await go(page, 'MATCH_DISCOVERY', 3500);
    const card = page.locator('[class*="cursor-pointer"]').first();
    await card.click({ timeout: 8000 });
    await page.waitForTimeout(3500);
  });

  await step(page, 'oyuncu/04-mac-olustur.png', () => go(page, 'MATCH_CREATE', 3000));
  await step(page, 'oyuncu/05-saha-vitrini.png', () => go(page, 'PITCH_DISCOVERY', 3500));

  await step(page, 'oyuncu/06-saha-detay.png', async () => {
    await go(page, 'PITCH_DISCOVERY', 3500);
    const card = page.locator('[class*="cursor-pointer"]').first();
    await card.click({ timeout: 8000 });
    await page.waitForTimeout(3000);
  });

  await step(page, 'oyuncu/07-maclarim.png', () => go(page, 'MY_MATCHES', 3000));
  await step(page, 'oyuncu/08-sosyal.png', () => go(page, 'SOCIAL', 3000));
  await step(page, 'oyuncu/09-taktik-studyo.png', () => go(page, 'STUDIO', 3000));
  await step(page, 'oyuncu/10-profil.png', () => go(page, 'PROFILE', 3000));
  await step(page, 'oyuncu/11-cuzdan.png', () => go(page, 'WALLET', 3000));
  await step(page, 'oyuncu/12-bildirimler.png', () => go(page, 'NOTIFICATIONS', 3000));
  await step(page, 'oyuncu/13-ayarlar.png', () => go(page, 'SETTINGS', 3000));
  await step(page, 'oyuncu/14-pazaryeri-kaleci.png', () => go(page, 'MARKETPLACE_GK', 3500));

  await ctx.close();
}

// ═════════════════════════════════════════════════ KALECİ / HAKEM ═══════════
async function flowSaglayici(role) {
  const { ctx, page } = await launch(role);
  console.log(`\n▸ ${role}`);
  await loginApp(page, role);

  const dir = role; // 'kaleci' | 'hakem'
  await step(page, `${dir}/01-panel-ana-sayfa.png`, () => go(page, 'SERVICE_DASHBOARD', 4000));
  await step(page, `${dir}/02-mac-bul.png`, () => go(page, 'MATCH_DISCOVERY', 3500));
  await step(page, `${dir}/03-cuzdan.png`, () => go(page, 'WALLET', 3000));

  if (role === 'kaleci') {
    // Menü + profil + aktiflik ayarları sağlayıcı panelinin içinden açılır
    await step(page, 'kaleci/04-menu.png', async () => {
      await go(page, 'SERVICE_DASHBOARD', 3500);
      await clickText(page, 'Menü');
    });
    await step(page, 'kaleci/05-profil.png', () => go(page, 'PROFILE', 3000));
    await step(page, 'kaleci/06-aktiflik-ayarlari.png', () => go(page, 'SETTINGS', 3000));
  }

  await step(page, `${dir}/${role === 'kaleci' ? '07' : '04'}-basvuru-formu.png`,
    () => go(page, 'SERVICE_APPLICATION', 3500));

  await ctx.close();
}

// ═══════════════════════════════════════════════════ SAHA SAHİBİ ════════════
async function flowSaha() {
  const { ctx, page } = await launch('saha');
  console.log('\n▸ saha-sahibi');
  await loginApp(page, 'saha');
  await go(page, 'OWNER_PANEL', 5000);

  // Owner paneli iç sekme durumunu kendi tutuyor; her kare öncesi sayfayı
  // tazeleyip panele dönerek temiz bir başlangıç sağlıyoruz.
  const reset = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await go(page, 'OWNER_PANEL', 4000);
  };

  const tabs = [
    ['saha-sahibi/01-ozet.png', 'Özet'],
    ['saha-sahibi/02-takvim.png', 'Takvim'],
    ['saha-sahibi/03-ekip.png', 'Ekip'],
    ['saha-sahibi/04-finans.png', 'Finans'],
    ['saha-sahibi/05-menu.png', 'Menü'],
  ];
  for (const [rel, label] of tabs) {
    await step(page, rel, async () => { await reset(); await clickText(page, label); });
  }

  // Menü içindeki gerçek başlıklar (panelden okundu)
  const menuItems = [
    ['saha-sahibi/06-sahalarim.png', 'Sahalarım'],
    ['saha-sahibi/07-bekleyen-islemler.png', 'Rezervasyon İşlemleri'],
    ['saha-sahibi/08-tesis-ayarlari.png', 'Tesis Ayarları'],
  ];
  for (const [rel, label] of menuItems) {
    await step(page, rel, async () => {
      await reset();
      await clickText(page, 'Menü');
      await clickText(page, label);
    });
  }

  // Skor girişi Özet sekmesindeki büyük "SKOR GİR" kutusundan açılır.
  await step(page, 'saha-sahibi/09-skor-gir.png', async () => {
    await reset();
    await clickText(page, 'SKOR GİR');
  });

  // Personel daveti Ekip sekmesinin içinde.
  await step(page, 'saha-sahibi/10-personel-davet.png', async () => {
    await reset();
    await clickText(page, 'Ekip');
    await clickText(page, 'Personel / Müdür Ekle', 8000);
  });

  await ctx.close();
}

// ═══════════════════════════════════════════════════════════ ADMIN ══════════
async function flowAdmin() {
  const { ctx, page } = await launch('admin', { desktop: true });
  console.log('\n▸ admin');

  await page.goto(ADMIN, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await step(page, 'admin/01-giris.png');

  // Giriş
  const email = process.env.OYNA_ADMIN_EMAIL || 'mirackerem@oyna.app';
  const pass = process.env.OYNA_ADMIN_PASS || PASS;
  try {
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(pass);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(9000);
  } catch (e) {
    console.log('  ! admin girişi başarısız:', String(e).slice(0, 140));
    await ctx.close();
    return;
  }

  // [dosya, kenar çubuğu etiketi, beklenen sayfa başlığı]
  // Başlık doğrulaması şart: "Komuta" gibi kısmi metinler kenar çubuğu grup
  // adına da uyup yanlış sayfanın karesini alıyordu.
  const pages = [
    ['admin/02-genel-bakis.png', 'Genel', 'Genel Bakış'],
    ['admin/03-komuta-merkezi.png', 'Komuta Merkezi', 'Komuta Merkezi'],
    ['admin/04-kullanicilar.png', 'Kullanıcılar', 'Kullanıcılar'],
    ['admin/05-dogrulama-merkezi.png', 'Doğrulama', 'Doğrulama Merkezi'],
    ['admin/06-sahalar.png', 'Sahalar', 'Sahalar'],
    ['admin/07-maclar.png', 'Maçlar', 'Maçlar'],
    ['admin/08-finans.png', 'Finans Merkezi', 'Finans'],
    ['admin/09-komisyon.png', 'Komisyon', 'Komisyon'],
    ['admin/10-sistem-parametreleri.png', 'Parametreler', 'Sistem Parametreleri'],
    ['admin/11-yetkiler-acl.png', 'Ekipler & Yetkiler', 'Ekipler & Yetkiler'],
    ['admin/12-denetim-gunlugu.png', 'Denetim Kayıtları', 'Denetim Kayıtları'],
  ];
  for (const [rel, label, title] of pages) {
    await step(page, rel, async () => {
      // Kenar çubuğu ögelerinin erişilebilir adında sayaç rozeti de olabiliyor
      // ("Sahalar 4", "Komuta Merkezi CANLI") → baştan eşleşen desen kullan.
      // Regex, /i/ bayrağı OLMADAN verilir; Türkçe İ katlanma sorunu böylece yok.
      const rx = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      await page.getByRole('button', { name: rx }).first().click({ timeout: 10000 });
      await page.waitForTimeout(1000);
      // Sayfa gerçekten değişti mi? Başlık uymuyorsa kareyi alma.
      await page.locator('h1', { hasText: title }).first().waitFor({ timeout: 12000 });
      await page.waitForTimeout(2500);
    });
  }

  await ctx.close();
}

// ════════════════════════════════════════════════════════════ ÇALIŞTIR ══════
const only = process.argv[2];
const all = {
  genel: flowGenel,
  oyuncu: flowOyuncu,
  kaleci: () => flowSaglayici('kaleci'),
  hakem: () => flowSaglayici('hakem'),
  saha: flowSaha,
  admin: flowAdmin,
};

for (const [name, fn] of Object.entries(all)) {
  if (only && only !== name) continue;
  try { await fn(); } catch (e) { console.log(`✗ ${name} akışı çöktü: ${String(e).slice(0, 200)}`); }
}

console.log(`\n═══ SONUÇ: ${results.ok.length} başarılı, ${results.fail.length} başarısız`);
if (results.fail.length) console.log('Eksikler:\n  ' + results.fail.join('\n  '));
