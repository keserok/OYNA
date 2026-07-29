import { test, expect, type Page } from '@playwright/test';
import {
  hazirla, ekranaGit, bildirimleriAc, odemeBaglamiTohumla, oturmasiniBekle,
  degerlendirmeBaglamiTohumla,
} from './harness';

// ─── OYNA — Ana ekran görsel regresyonu ──────────────────────────────────────
//
// 623 birim testi mantığı doğruluyor ama HİÇBİRİ "ekran bozuldu mu?" sorusunu
// cevaplamıyor. Bu dosya o boşluğu kapatır: her ana ekran iki telefon
// genişliğinde render edilip depodaki referans görüntüyle piksel piksel
// karşılaştırılır. Bir paket ekranın yerleşimini, rengini, boşluğunu ya da
// tipografisini bozarsa bu testler kırmızıya döner.
//
// Kurulum ayrıntıları ve kırılganlık önlemleri: tests/visual/harness.ts

interface Ekran {
  /** Referans dosya adı (tests/visual/__baseline__/<proje>/<ad>-<platform>.png) */
  ad: string;
  /** Ekranın açıldığını doğrulayan çapa metin — görüntüden ÖNCE beklenir. */
  capa: RegExp | string;
  /** Ekrana git + gerekli tohumlamayı yap. */
  ac: (page: Page) => Promise<void>;
}

const EKRANLAR: Ekran[] = [
  {
    ad: '01-giris-splash',
    capa: /Potansiyel zaferler için/i,
    // SÜRESİ GEÇMİŞ oturum tohumlanır → supabase-js token yenilemeye çıkar →
    // o istek bilerek cevapsız bırakılır → authResolved=false kalır →
    // SplashScreen'in 1200 ms'lik otomatik geçiş sayacı HİÇ kurulmaz.
    // (Oturumsuz açılışta auth anında çözülür ve ekran AUTH'a kayar.)
    ac: async (page) => { await hazirla(page, { authAskida: true }); },
  },
  {
    // AUTH artık tanıtım perdesiyle açılıyor; giriş/kayıt formu ok düğmesinin
    // ardında. Bu kayıt formu ekranını çeker, tanıtım ayrı kalem (12).
    ad: '02-giris-auth',
    capa: /Hesap oluştur|Hoş geldin/i,
    ac: async (page) => {
      await hazirla(page, { oturumsuz: true });
      await ekranaGit(page, 'AUTH');
      await page.locator('#intro-continue-button').click();
    },
  },
  {
    ad: '03-ana-sayfa',
    capa: /ANA SAYFA/,
    ac: async (page) => { await hazirla(page); await ekranaGit(page, 'DASHBOARD'); },
  },
  {
    ad: '04-mac-lobisi',
    capa: /Kodla Katıl/i,
    ac: async (page) => { await hazirla(page); await ekranaGit(page, 'MATCH_DISCOVERY'); },
  },
  {
    ad: '05-maclarim',
    capa: /Saha Kiralamalarım/i,
    ac: async (page) => { await hazirla(page); await ekranaGit(page, 'MY_MATCHES'); },
  },
  {
    ad: '06-cuzdan',
    capa: /Cüzdan Bakiyesi/i,
    ac: async (page) => { await hazirla(page); await ekranaGit(page, 'WALLET'); },
  },
  {
    ad: '07-odeme',
    capa: /Ödenecek Kapora/i,
    ac: async (page) => {
      await hazirla(page);
      await odemeBaglamiTohumla(page);
      await ekranaGit(page, 'PAYMENT');
    },
  },
  {
    ad: '08-saha-vitrini',
    capa: /TESİS BULUNDU/i,
    ac: async (page) => { await hazirla(page); await ekranaGit(page, 'PITCH_DISCOVERY'); },
  },
  {
    ad: '09-profil',
    capa: /Güv|Profil/i,
    ac: async (page) => { await hazirla(page); await ekranaGit(page, 'PROFILE'); },
  },
  {
    ad: '10-bildirimler',
    capa: /Bildirimler/i,
    ac: async (page) => {
      await hazirla(page);
      await ekranaGit(page, 'DASHBOARD');
      await bildirimleriAc(page);
    },
  },
  {
    ad: '11-ayarlar',
    capa: /Sahada Rolün/i,
    ac: async (page) => { await hazirla(page); await ekranaGit(page, 'SETTINGS'); },
  },
  {
    // Giriş akışının kapısı: splash ile giriş formu arasındaki tanıtım perdesi.
    ad: '12-giris-tanitim',
    capa: /İSTEDİĞİN ZAMAN/i,
    ac: async (page) => { await hazirla(page, { oturumsuz: true }); await ekranaGit(page, 'AUTH'); },
  },
  {
    // Maç sonu değerlendirme · 1/2 — kendi takımın, 1–10 yıldız şeridi.
    ad: '13-mac-sonu-kadro',
    capa: /KENDİ TAKIMIN/,
    ac: async (page) => {
      await hazirla(page);
      await degerlendirmeBaglamiTohumla(page);
      await ekranaGit(page, 'POST_MATCH_EVAL');
    },
  },
  {
    // Maç sonu değerlendirme · 2/2 — tesis 5 yıldız (görevli atanmamış maç:
    // kaleci/hakem kartı HİÇ çizilmez, sahte sağlayıcı uydurulmaz).
    ad: '14-mac-sonu-tesis',
    capa: /TESİS VE GÖREVLİLER/,
    ac: async (page) => {
      await hazirla(page);
      await degerlendirmeBaglamiTohumla(page);
      await ekranaGit(page, 'POST_MATCH_EVAL');
      await page.getByRole('button', { name: 'Devam' }).click();
    },
  },
  {
    // Aynı ekran, kaleci + hakem ATANMIŞ maç: iki adet 10 puanlık çubuk kartı.
    ad: '15-mac-sonu-gorevliler',
    capa: /TESİS VE GÖREVLİLER/,
    ac: async (page) => {
      await hazirla(page);
      await degerlendirmeBaglamiTohumla(page, { gorevliler: true });
      await ekranaGit(page, 'POST_MATCH_EVAL');
      await page.getByRole('button', { name: 'Devam' }).click();
    },
  },
  {
    // PUANLANMIŞ hâl: yıldız şeridinin clipPath kırpması, altın satır kenarlığı,
    // sağdaki rakam ve alt sayaç/ortalama birlikte doğrulanır.
    ad: '16-mac-sonu-kadro-puanli',
    capa: /KENDİ TAKIMIN/,
    ac: async (page) => {
      await hazirla(page);
      await degerlendirmeBaglamiTohumla(page);
      await ekranaGit(page, 'POST_MATCH_EVAL');
      const seritler = page.getByRole('slider');
      // Şeridin %oran'ına dokun → ceil(oran × 10) puan.
      const puanla = async (i: number, oran: number) => {
        const s = seritler.nth(i);
        const box = (await s.boundingBox())!;
        await page.mouse.click(box.x + box.width * oran, box.y + box.height / 2);
      };
      await puanla(0, 0.95); // 10 — EFSANE ucu
      await puanla(1, 0.65); // 7
      await puanla(2, 0.25); // 3
    },
  },
];

test.describe('Görsel regresyon — ana ekranlar', () => {
  for (const ekran of EKRANLAR) {
    test(ekran.ad, async ({ page }) => {
      const konsolHatalari: string[] = [];
      page.on('pageerror', (e) => konsolHatalari.push(String(e)));

      await ekran.ac(page);

      // Ekran gerçekten açıldı mı? (Yanlış ekranın görüntüsünü "referans" diye
      // kaydetmemek için görüntüden ÖNCE çapa doğrulanır.)
      await expect(page.getByText(ekran.capa).first()).toBeVisible({ timeout: 20_000 });
      await oturmasiniBekle(page);

      await expect(page).toHaveScreenshot(`${ekran.ad}.png`);

      // Ekran görüntüsü "doğru" görünse bile sayfada patlayan bir hata varsa
      // bunu sessizce geçme.
      expect(konsolHatalari, `Sayfada JS hatası: ${konsolHatalari.join(' | ')}`).toHaveLength(0);
    });
  }
});
