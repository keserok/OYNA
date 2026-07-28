import { test, expect, type Page } from '@playwright/test';
import {
  hazirla, ekranaGit, bildirimleriAc, odemeBaglamiTohumla, oturmasiniBekle,
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
    ad: '02-giris-auth',
    capa: /SAHAYA ÇIKMA VAKTİ/i,
    ac: async (page) => { await hazirla(page, { oturumsuz: true }); await ekranaGit(page, 'AUTH'); },
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
