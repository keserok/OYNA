import { test, expect, type Page } from '@playwright/test';
import {
  hazirla, ekranaGit, oturmasiniBekle,
  odemeBaglamiTohumla, rahatBaglamiTohumla, taktikBaglamiTohumla,
} from './harness';

// ─── İÇ KAYDIRICI regresyonu ─────────────────────────────────────────────────
//
// ŞİKÂYET (iki kez geldi): "Sahalar ekranındaki kaydırma çalışmıyor",
// ardından "taktiksel ve ciddi maçların lobilerinde de kaydırma bozuk".
//
// SEBEP tek ve aynı yerleşim inceliğiydi. Bu ekranlar dikey bir yığındır: üstte
// sabit başlık, altta kendi içinde kayan liste (`flex-1` + `overflow-y-auto`).
// Bir çocuğun "kalan alanı doldur, taşarsan kaydır" davranışı ancak ANA KUTUNUN
// yüksekliği BELLİ olduğunda çalışır. Ekranın kökü `min-h-screen` ile yalnız bir
// TABAN veriyordu, yüksekliği serbest bırakıyordu: kutu içerikle birlikte
// uzuyor, `flex-1` sınırlanacak bir alan bulamıyor ve listenin kendi kaydırması
// HİÇ DEVREYE GİRMİYORDU. Kök `h-full` yapılınca sınır netleşti.
//
// BU TESTİN SINAVI (asıl mesele budur):
//   Ekrana yapay olarak ÇOK uzun bir blok eklenir. Doğru kurulmuş bir iç
//   kaydırıcı bu durumda BOYUNU KORUR ve kaydırılabilir hâle gelir. Bozuk
//   kurulumda ise kaydırıcının kendisi uzar (kaydırma üretmez), kök şişer ve
//   taşma dışarı çıkar. Sadece "kaydırıcı var mı" diye bakmak yetmez — bozuk
//   hâlde de vardır.
//
// KAYDIRICI SINIF ADIYLA DEĞİL, DAVRANIŞLA bulunur (en büyük dikey taşma
// kutusu). Böylece bir ekranın sınıfları değiştiğinde test sessizce körleşmez.

interface Olcum {
  kokSinif: string;
  icEtiket: string;
  /** Yük öncesi kök yüksekliği. */
  kokYuk: number;
  /** Yük altında kök yüksekliği — DEĞİŞMEMELİ. */
  kokYukYukAltinda: number;
  /** Yük altında: kaydırıcının görünen boyu (sabit kalmalı). */
  gorunen: number;
  /** Yük altında: kaydırılabilir mesafe (0'dan büyük olmalı). */
  kaydirilabilir: number;
  /** Yük altında: dış sayfanın kaydırması (0 kalmalı — taşma dışarı çıkmamalı). */
  disKaydirma: number;
}

async function yukAltindaOlc(page: Page): Promise<Olcum> {
  return page.evaluate(() => {
    const sc = document.querySelector('[data-oyna-view-scroller]');
    if (!(sc instanceof HTMLElement)) throw new Error('Görünüm kaydırıcısı yok');
    const kok = sc.firstElementChild;
    if (!(kok instanceof HTMLElement)) throw new Error('Ekran kökü yok');

    // Ekranın ana içerik kaydırıcısı: dikey taşmayı kendi içinde tutması
    // beklenen EN BÜYÜK kutu. (Küçük şeritler/açılır listeler elenir.)
    const adaylar = Array.from(kok.querySelectorAll<HTMLElement>('*'))
      .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.clientHeight > 150)
      .sort((a, b) => b.clientHeight - a.clientHeight);
    const ic = adaylar[0];
    if (!ic) throw new Error('Ekranın iç kaydırıcısı bulunamadı');

    const kokYuk = kok.offsetHeight;
    const dolgu = document.createElement('div');
    dolgu.style.height = '3000px';
    ic.appendChild(dolgu);
    void ic.offsetHeight; // yerleşimi zorla

    const sonuc: Olcum = {
      kokSinif: (kok.className || '(sınıfsız)').slice(0, 70),
      icEtiket: `${ic.tagName.toLowerCase()}.${(ic.className || '').slice(0, 45)}`,
      kokYuk,
      kokYukYukAltinda: kok.offsetHeight,
      gorunen: ic.clientHeight,
      kaydirilabilir: ic.scrollHeight - ic.clientHeight,
      disKaydirma: sc.scrollHeight - sc.clientHeight,
    };
    dolgu.remove();
    return sonuc;
  });
}

interface Senaryo {
  gorunum: string;
  capa: RegExp;
  ac?: (p: Page) => Promise<void>;
}

// İç kaydırıcısı OLAN ekranların tamamı. (Ana Sayfa, Ayarlar, Stüdyo, Bildirim
// paneli ve Maç Bileti bilinçli olarak sayfa boyu akar — iç kaydırıcıları
// yoktur, bu yüzden bu sınava girmezler.)
const SENARYOLAR: Senaryo[] = [
  { gorunum: 'PITCH_DISCOVERY', capa: /TESİS BULUNDU/i },
  { gorunum: 'MATCH_DISCOVERY', capa: /Kodla Katıl/i },
  { gorunum: 'MY_MATCHES', capa: /Saha Kiralamalarım/i },
  { gorunum: 'WALLET', capa: /Cüzdan Bakiyesi/i },
  { gorunum: 'PROFILE', capa: /Profil|Güv/i },
  { gorunum: 'SOCIAL', capa: /Arkadaş|Takım/i },
  { gorunum: 'MESSAGES', capa: /Mesaj/i },
  { gorunum: 'FRIEND_ADD', capa: /Arkadaş/i },
  { gorunum: 'MARKETPLACE_GK', capa: /Kaleci Bul/i },
  { gorunum: 'MARKETPLACE_REF', capa: /Hakem Kirala/i },
  { gorunum: 'MATCH_CREATE', capa: /Maç|Saha/i },
  { gorunum: 'SERVICE_DASHBOARD', capa: /^(HAKEM|KALECİ)$/ },
  {
    gorunum: 'PAYMENT',
    capa: /Ödenecek Kapora/i,
    ac: async (p) => { await odemeBaglamiTohumla(p); },
  },
  {
    // Rahat lobi — pozisyonsuz kadro ekranı.
    gorunum: 'MATCH_JOIN · Rahat',
    capa: /BEYAZ TAKIM/,
    ac: async (p) => { await rahatBaglamiTohumla(p); },
  },
  {
    // Taktiksel/Ciddi lobi — kullanıcının bildirdiği ekran. Ayrı tohum ŞART:
    // difficulty 'Rahat' olduğunda App.tsx bambaşka bir ekrana yönlendirir.
    gorunum: 'MATCH_JOIN · Taktiksel',
    capa: /KADRO|DİZİLİŞ|HAKKINDA/i,
    ac: async (p) => { await taktikBaglamiTohumla(p); },
  },
];

test.describe('İç kaydırıcı — yük altında boyunu korumalı', () => {
  for (const s of SENARYOLAR) {
    test(s.gorunum, async ({ page }) => {
      await hazirla(page);
      await s.ac?.(page);
      await ekranaGit(page, s.gorunum.split(' · ')[0]);
      await expect(page.getByText(s.capa).first()).toBeVisible({ timeout: 20_000 });
      await oturmasiniBekle(page);

      const m = await yukAltindaOlc(page);
      const kunye =
        `"${s.gorunum}" · kök: "${m.kokSinif}" · kaydırıcı: "${m.icEtiket}"`;

      // 1) Ekranın kökü yük altında ŞİŞMEMELİ (yüksekliği belli olmalı).
      expect(
        m.kokYukYukAltinda,
        `${kunye}\nKök yük altında ${m.kokYuk}px → ${m.kokYukYukAltinda}px büyüdü. ` +
        'Yüksekliği sabit olmalı (h-full), taban değil (min-h-screen).',
      ).toBe(m.kokYuk);

      // 2) ASIL SINAV: yük altında kaydırıcı boyunu korumalı ve kaydırma üretmeli.
      expect(
        m.kaydirilabilir,
        `${kunye}\nYük altında kaydırma ÜRETMEDİ ` +
        `(görünen ${m.gorunen}px, kaydırılabilir ${m.kaydirilabilir}px). ` +
        'Kaydırıcı sınırlanmamış demektir — ekran parmakla kaydırılamaz.',
      ).toBeGreaterThan(1000);

      // 3) Taşma dışarı çıkmamalı — sayfanın kendisi uzamamalı.
      expect(
        m.disKaydirma,
        `${kunye}\nYük altında SAYFAYI uzattı (${m.disKaydirma}px). ` +
        'İç kaydırıcı taşmayı kendi içinde tutmalı.',
      ).toBeLessThanOrEqual(1);
    });
  }
});
