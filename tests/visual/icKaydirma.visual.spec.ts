import { test, expect, type Page } from '@playwright/test';
import {
  hazirla, ekranaGit, oturmasiniBekle,
  odemeBaglamiTohumla, rahatBaglamiTohumla, taktikBaglamiTohumla, kapsamsizTohumla,
} from './harness';

// Kaydırma motoru dokunmatik OLMAYAN cihazda hiç kurulmaz ve azaltılmış
// hareket açıkken bilerek devre dışıdır. "Parmak bağlı mı" bloğu motoru
// ölçtüğü için ikisi de burada açılır (görsel config 'reduce' verir).
test.use({
  contextOptions: { reducedMotion: 'no-preference', hasTouch: true, isMobile: true },
  hasTouch: true,
  isMobile: true,
});

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

// ─── PANEL SEKMELERİ — SAYFA-AKIŞ MODELİ (beşinci şikâyet: 4 Ağustos 2026) ───
//
// TARİHÇE: Dördüncü şikâyette paneller "sabit kabuk + İÇ kaydırıcı" modeline
// alınmış ve bu test iç kaydırıcıyı şart koşmuştu. BEŞİNCİ şikâyet geldi:
// gerçek cihazda parmak başlığa/sekme çubuğuna/kısa içerikli sekmeye denk
// gelince yine hiçbir şey kaymıyordu (html/body bilinçli kilitli; o noktada
// kayacak kutu yok). Kullanıcı kararı net: "TÜM ekran parmakla kaydırılabilir
// olmalı."
//
// YENİ MODEL: Ayarlar/Profil ekranlarıyla aynı — panel kökü `min-h-screen`,
// içerik App'in görünüm kaydırıcısında akar; başlık dahil her nokta parmak
// yüzeyidir. Alt gezinmeler `fixed` kalır. Bu blok artık DIŞ kaydırmayı
// şart koşar (önceki sürümün tam tersi — bilinçli).

const PANEL_SEKMELERI: { panel: string; sekme: string; ard?: string }[] = [
  { panel: 'SERVICE_DASHBOARD', sekme: 'Ana Sayfa' },
  { panel: 'SERVICE_DASHBOARD', sekme: 'Maç Bul' },
  { panel: 'SERVICE_DASHBOARD', sekme: 'Cüzdan' },
  { panel: 'SERVICE_DASHBOARD', sekme: 'Menü' },
  { panel: 'SERVICE_DASHBOARD', sekme: 'Menü', ard: 'Profilim' },
  { panel: 'SERVICE_DASHBOARD', sekme: 'Menü', ard: 'Ayarlar' },
  { panel: 'OWNER_PANEL', sekme: 'Özet' },
  { panel: 'OWNER_PANEL', sekme: 'Takvim' },
  { panel: 'OWNER_PANEL', sekme: 'Ekip' },
  { panel: 'OWNER_PANEL', sekme: 'Finans' },
  { panel: 'OWNER_PANEL', sekme: 'Menü' },
];

/** Sayfa-akış ölçümü: ekran köküne yük ekle; SAYFA (görünüm kaydırıcısı)
 *  kaydırma üretmeli. Ekran başlığı dahil her nokta aynı kaydırıcıya aittir. */
async function sayfaAkisiOlc(page: Page): Promise<{ disKaydirma: number; kokSinif: string }> {
  return page.evaluate(() => {
    const sc = document.querySelector('[data-oyna-view-scroller]');
    if (!(sc instanceof HTMLElement)) throw new Error('Görünüm kaydırıcısı yok');
    const kok = sc.firstElementChild;
    if (!(kok instanceof HTMLElement)) throw new Error('Ekran kökü yok');
    const dolgu = document.createElement('div');
    dolgu.style.height = '3000px';
    kok.appendChild(dolgu);
    void kok.offsetHeight;
    const sonuc = {
      disKaydirma: sc.scrollHeight - sc.clientHeight,
      kokSinif: (kok.className || '(sınıfsız)').slice(0, 70),
    };
    dolgu.remove();
    return sonuc;
  });
}

test.describe('Panel sekmeleri — ekranın TAMAMI sayfayla kaymalı', () => {
  for (const s of PANEL_SEKMELERI) {
    const ad = `${s.panel === 'OWNER_PANEL' ? 'Saha sahibi' : 'Kaleci/hakem'} · ${s.sekme}${s.ard ? ' › ' + s.ard : ''}`;
    test(ad, async ({ page }) => {
      await hazirla(page);
      await ekranaGit(page, s.panel);
      await page.waitForTimeout(1200);
      await oturmasiniBekle(page).catch(() => {});

      await page.getByText(s.sekme, { exact: true }).first().click({ timeout: 10_000 });
      await page.waitForTimeout(700);
      if (s.ard) {
        await page.getByText(s.ard, { exact: true }).first().click({ timeout: 10_000 });
        await page.waitForTimeout(900);
      }

      const m = await sayfaAkisiOlc(page);
      expect(
        m.disKaydirma,
        `"${ad}" · kök: "${m.kokSinif}"\nYük altında SAYFA kaydırma üretmedi ` +
        `(${m.disKaydirma}px). Panel sayfa-akış modelinden çıkmış demektir — ` +
        'başlığa/kısa sekmeye konan parmak yine karşılıksız kalır.',
      ).toBeGreaterThan(1000);
    });
  }
});

// ─── PARMAK BAĞLI MI — panelin HER noktası kaydırma yüzeyi mi? ───────────────
//
// Yukarıdaki blok "sayfada kaydırılacak bir şey var mı" sorusunu ölçer.
// Bu blok kullanıcının asıl şikâyetini ölçer: "parmağımla kaydıramıyorum".
// İkisi aynı şey DEĞİL — sayfa kaydırılabilir olsa bile parmağın denk geldiği
// nokta (başlık, sekme çubuğu, boş alan) kaydırıcıya bağlı değilse ekran ölü
// hisseder. Beşinci şikâyetin sebebi tam olarak buydu.
//
// NASIL ÖLÇÜLÜR: Gerçek TouchEvent zinciri gönderilir ve kaydırma motorunun
// yazdığı ESNEME okunur. Esneme > 0 ise o nokta kaydırıcıya bağlıdır.
// (Yapay dokunma olayları tarayıcının KENDİ kaydırmasını tetikleyemez — bu
// yüzden scrollTop değil, motorun JS ile yazdığı esneme ölçülür.)
//
// TUZAK — okurken dikkat: dikey esneme `translate: 0px 63px` biçiminde yazılır.
// İLK sayı her zaman 0'dır; ölçüm İKİNCİ sayıyı okumalıdır. Bu test yazılırken
// ilk sayı okunup "hiçbir yerde kaymıyor" sanılmıştı.
test.describe('Parmak bağlı mı — panelin her noktası kaydırma yüzeyi', () => {
  const NOKTALAR = [
    { ad: 'başlık üstü',  oran: 0.08 },
    { ad: 'orta',         oran: 0.45 },
    { ad: 'alt bar üstü', oran: 0.80 },
  ];

  for (const panel of ['SERVICE_DASHBOARD', 'OWNER_PANEL']) {
    const panelAd = panel === 'OWNER_PANEL' ? 'Saha sahibi' : 'Kaleci/hakem';
    test(`${panelAd} paneli`, async ({ page }) => {
      // Motor: dokunmatik ŞART, azaltılmış hareket kapalı olmalı (kurulum koşulu).
      await page.context().addInitScript(() => { /* bağlam seçenekleri config'ten gelir */ });
      await hazirla(page);
      await ekranaGit(page, panel);
      await page.waitForTimeout(1500);
      await oturmasiniBekle(page).catch(() => {});

      for (const n of NOKTALAR) {
        const esneme = await page.evaluate((oran) => {
          const sc = document.querySelector('[data-oyna-view-scroller]');
          if (!(sc instanceof HTMLElement)) return -1;
          sc.scrollTop = 0;
          const x = Math.round(window.innerWidth / 2);
          const y0 = Math.round(window.innerHeight * oran);
          const hedef = document.elementFromPoint(x, y0) ?? sc;
          const dokun = (tip: string, y: number) => {
            const t = new Touch({ identifier: 1, target: hedef, clientX: x, clientY: y });
            hedef.dispatchEvent(new TouchEvent(tip, {
              touches: tip === 'touchend' ? [] : [t],
              targetTouches: tip === 'touchend' ? [] : [t],
              changedTouches: [t], bubbles: true, cancelable: true, composed: true,
            }));
          };
          dokun('touchstart', y0);
          for (let i = 1; i <= 8; i++) dokun('touchmove', y0 + i * 20);
          const sayilar = ((sc.style.translate || '').match(/-?[\d.]+/g) || []).map(Number);
          const px = sayilar.length > 1 ? sayilar[1] : (sayilar[0] ?? 0);
          dokun('touchend', y0 + 160);
          return Math.round(px);
        }, n.oran);

        expect(
          esneme,
          `"${panelAd} · ${n.ad}" noktasından parmak çekilince kaydırıcı CEVAP VERMEDİ ` +
          `(esneme ${esneme}px). Bu nokta kaydırma yüzeyi değil demektir — kullanıcı ` +
          'ekranı orada "donuk" hisseder. Panel sayfa-akış modelinden çıkmış olabilir.',
        ).toBeGreaterThan(5);
      }
    });
  }
});

// ─── SON DÜĞMEYE ULAŞILABİLİYOR MU ──────────────────────────────────────────
//
// NEDEN: Profil ekranının kart araları kullanıcı isteğiyle 12px'ten 18px'e
// çıktı ("premium ve rahat olsun"). Boşluk arttıkça içerik uzar; kaydırıcının
// alt dolgusu (`pb-safe-nav`) yetmezse EN ALTTAKİ düğme sonuna kadar
// kaydırıldığında bile alt menünün ARKASINDA kalır — görünür ama basılamaz,
// üstelik ekran görüntüsü testleri yalnız üst kısmı çektiği için sessizce
// geçer. Bu blok o sessizliği kapatır: sonuna kadar kaydırıp son düğmenin
// alt menünün ÜSTÜNDE bittiğini ölçer.
test.describe('Son düğme alt menünün arkasında kalmamalı', () => {
  test('Profil ekranı — "Maç bul" tam görünür', async ({ page }) => {
    await hazirla(page);
    await ekranaGit(page, 'PROFILE');
    await page.waitForTimeout(1200);
    await oturmasiniBekle(page).catch(() => {});

    // Çentikli telefon: alt güvenli alan sıfır değilken en dar durum oluşur.
    await page.addStyleTag({ content: ':root { --safe-bottom: 34px; --safe-top: 47px; }' });
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

    const olcum = await page.evaluate(() => {
      const sc = [...document.querySelectorAll('*')]
        .find((e) => e instanceof HTMLElement
          && getComputedStyle(e).overflowY === 'auto'
          && e.scrollHeight > e.clientHeight + 4) as HTMLElement | undefined;
      if (!sc) return null;
      sc.scrollTop = sc.scrollHeight;
      const dugme = [...document.querySelectorAll('button')]
        .find((b) => (b.textContent || '').trim() === 'Maç bul');
      if (!dugme) return null;
      const nav = document.querySelector('nav');
      return {
        dugmeAlt: Math.round(dugme.getBoundingClientRect().bottom),
        navUst: Math.round(nav ? nav.getBoundingClientRect().top : window.innerHeight),
      };
    });

    expect(olcum, 'Profil kaydırıcısı ya da "Maç bul" düğmesi bulunamadı').not.toBeNull();
    expect(
      olcum!.dugmeAlt,
      `Sonuna kadar kaydırıldığında "Maç bul" düğmesinin alt kenarı ${olcum!.dugmeAlt}px, ` +
      `alt menü ise ${olcum!.navUst}px'te başlıyor — düğme menünün arkasında kalıyor. ` +
      'Kaydırıcının alt dolgusu (`pb-safe-nav`) içeriğe yetmiyor demektir.',
    ).toBeLessThanOrEqual(olcum!.navUst);
  });
});

// ─── "KONUMU AYARLA" GERÇEKTEN BÖLGE SAYFASINI AÇIYOR MU ────────────────────
//
// NEDEN: Düğme iki adımlı çalışıyor — önce store'a "Ayarlar'ı Bölgelerim ile
// aç" isteği yazıyor, sonra Ayarlar ekranına gidiyor. İki adımdan biri
// kopsa (ör. Ayarlar isteği tanımadığı bir değer diye yok sayarsa) düğme
// kullanıcıyı Ayarlar'ın ANA listesine bırakır ve bölge satırını kendisi
// aramak zorunda kalır. Ekran görüntüsü bunu göremez; bu test görür.
test.describe('Ana sayfadaki "KONUMU AYARLA" düğmesi', () => {
  test('Ayarlar → Bölgelerim sayfasını doğrudan açar', async ({ page }) => {
    await hazirla(page);
    await ekranaGit(page, 'DASHBOARD');
    await kapsamsizTohumla(page);

    await page.getByLabel('Konumu ayarla').click();

    // Bölgelerim alt sayfasının kendi başlığı görünmeli.
    await expect(
      page.getByText(/Bölgelerim/i).first(),
      '"KONUMU AYARLA" Ayarlar\'ı açtı ama Bölgelerim sayfası gelmedi — ' +
      'derin bağlantı isteği (settingsSubPage = "region") tüketilmemiş olabilir.',
    ).toBeVisible({ timeout: 15_000 });
  });
});
