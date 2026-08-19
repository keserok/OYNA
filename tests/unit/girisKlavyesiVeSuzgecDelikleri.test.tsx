/**
 * İKİ KUSURUN KİLİDİ (17 Ağustos 2026 — mağaza gönderimi öncesi ikinci tur)
 *
 *  A) GİRİŞ EKRANI · klavye telafisi YANLIŞ KAYNAKTAN okunuyordu.
 *     views/AuthScreen.tsx kökü `fixed inset-0`, yani PENCEREYE tutunur.
 *     Alt dolgusu ise yalnız `--kb-height`e bakıyordu; o değişken KABUĞA
 *     (document.body) göre ölçülür ve iOS'ta `resize: Body` ile body zaten
 *     kısaldığı için haklı olarak 0 döner. Sonuç: incelemecinin dokunacağı
 *     İLK ekranda form alanları klavyenin ARKASINDA kalıyordu.
 *     Doğru kural: max(--kb-height, pencereye göre ÖLÇÜLEN örtüşme).
 *     Ölçüm TEK yerde yaşar: components/common/Toast.tsx.
 *
 *  B) İÇERİK SÜZGECİ · denetçi canlı çalıştırıp delikleri kanıtladı:
 *     Türkçe karaktersiz yazımlar, yaygın çekimler ve harf aralayarak yazma
 *     süzgeci atlatıyordu; buna karşılık "51k TL ceza" ve büyük harfli
 *     "SIKIYIM" masum oldukları hâlde ENGELLENİYORDU.
 *
 * Testin ölçüsü: düzeltmeyi zihnen geri aldığında bu dosya KIRMIZI dönmeli.
 * Bu yüzden A bölümü gerçek DOM'a bakar (dosyada metin aramaz), B bölümü ise
 * süzgeci gerçekten çalıştırır.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  sabitOgeKlavyeOrtusu,
  klavyeliAltDolgu,
  Toast,
} from '../../components/common/Toast';
import { uygunsuzMu, ilkUygunsuzKelime } from '../../shared/icerikSuzgeci';

// AuthScreen'in dış dünyaya bağlı olduğu üç modül taklit edilir; ölçmek
// istediğimiz şey ağ değil, YERLEŞİM.
vi.mock('../../supabaseClient', () => ({
  supabase: { rpc: vi.fn(), auth: {}, from: vi.fn() },
  getHasAccount: () => true,
}));
vi.mock('../../supabaseAuth', () => ({
  loginWithGoogle: vi.fn(), loginWithApple: vi.fn(),
  // Telefon ANA giriş yolu (17 Ağu 2026): e-posta/şifre yolları kaldırıldı.
  sendPhoneOtp: vi.fn(), verifyPhoneOtp: vi.fn(), demoLogin: vi.fn(),
  isDemoLoginEnabled: () => false, isDemoLoginInput: () => false,
  isDemoAccountPickerEnabled: () => false, loginDemoAccount: vi.fn(),
  // Sağlayıcı dönüşü okuyucusu (19 Ağu 2026): ekran İLK render'da bunu çağırır.
  // Bu testte OAuth dönüşü yok → null; klavye ölçümleri etkilenmez.
  oauthDonusunuOku: () => null,
}));
vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => ({
      authStartMode: null,
      setAuthStartMode: () => {},
      setIsGuest: () => {},
      resetNavigation: () => {},
    }),
  },
}));

import AuthScreen from '../../views/AuthScreen';

// ═══════════════════════════════════════════════════════════════════════════
// A · GİRİŞ EKRANI — klavye telafisi
// ═══════════════════════════════════════════════════════════════════════════

/** Tipik telefon: 800px pencere, 340px klavye → 460px görünür alan. */
const PENCERE = 800;
const KLAVYE = 340;

type SahteGorunurAlan = {
  height: number;
  offsetTop: number;
  addEventListener: () => void;
  removeEventListener: () => void;
};

let eskiGorunurAlan: unknown;

/** Klavyesi AÇIK bir pencere taklit eder (visualViewport kısalmış, pencere değil). */
const klavyeyiAc = (klavyeYuk: number) => {
  const vv: SahteGorunurAlan = {
    height: PENCERE - klavyeYuk,
    offsetTop: 0,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  Object.defineProperty(window, 'innerHeight', { value: PENCERE, configurable: true, writable: true });
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true, writable: true });
};

beforeEach(() => { eskiGorunurAlan = (window as unknown as { visualViewport: unknown }).visualViewport; });
afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: eskiGorunurAlan, configurable: true, writable: true });
});

/**
 * Giriş ekranını FORM adımında açar.
 * Tanıtım perdesi yalnız oturumun İLK açılışında gösterilir (modül içi
 * `introShownThisSession`); bir kez takıp sökünce ikinci render doğrudan
 * forma gelir. Böylece tasarıma dokunmadan gerçek panele ulaşıyoruz.
 */
const girisFormunuAc = () => {
  render(<AuthScreen onSuccess={() => {}} onBack={() => {}} />).unmount();
  return render(<AuthScreen onSuccess={() => {}} onBack={() => {}} />);
};

/** Sayfadaki tüm satır içi alt dolguları toplar. */
const altDolgular = (kok: HTMLElement): string[] =>
  Array.from(kok.querySelectorAll<HTMLElement>('[style]'))
    .map((e) => e.style.paddingBottom)
    .filter(Boolean);

describe('A1 · örtüşme ölçümü (saf hesap)', () => {
  it('klavye açıkken pencere ile görünür alanın farkı kadar örtüşme çıkar', () => {
    expect(sabitOgeKlavyeOrtusu(PENCERE, PENCERE - KLAVYE, 0)).toBe(KLAVYE);
  });

  it('görünür alan kaymışsa (offsetTop) o kayma da düşülür', () => {
    // iOS odaklanınca görünür alanı yukarı kaydırabilir; çift saymamalıyız.
    expect(sabitOgeKlavyeOrtusu(PENCERE, PENCERE - KLAVYE, 40)).toBe(KLAVYE - 40);
  });

  it('klavye kapalıyken 0 döner — kutu boşuna yukarı fırlamaz', () => {
    expect(sabitOgeKlavyeOrtusu(PENCERE, PENCERE, 0)).toBe(0);
  });

  it('birkaç piksellik yuvarlama farkı örtüşme sayılmaz', () => {
    expect(sabitOgeKlavyeOrtusu(PENCERE, PENCERE - 3, 0)).toBe(0);
    expect(sabitOgeKlavyeOrtusu(PENCERE, PENCERE - 12, 0)).toBe(12);
  });
});

describe('A2 · alt dolgu kuralı: TOPLA değil, BÜYÜĞÜNÜ AL', () => {
  const dolgu = klavyeliAltDolgu(KLAVYE, 26);

  it('iki telafi kaynağının büyüğü alınır', () => {
    expect(dolgu).toContain('max(var(--kb-height, 0px), 340px)');
  });

  it('güvenli alan ve tasarımın kendi payı korunur', () => {
    expect(dolgu).toContain('var(--safe-bottom, 0px)');
    expect(dolgu).toContain('+ 26px');
  });

  it('iki kaynak TOPLANMAZ — toplansa kutu bir klavye boyu fazla yukarı fırlardı', () => {
    expect(dolgu).not.toMatch(/var\(--kb-height, 0px\)\s*\+\s*340px/);
  });
});

describe('A3 · giriş ekranı klavyenin ARKASINDA kalmıyor (gerçek render)', () => {
  it('klavye açıkken alt dolgu ölçülen örtüşmeyi içerir', () => {
    klavyeyiAc(KLAVYE);
    const { container } = girisFormunuAc();

    const dolgular = altDolgular(container);
    expect(dolgular.length).toBeGreaterThan(0);
    expect(
      dolgular.some((d) => d.includes(`max(var(--kb-height, 0px), ${KLAVYE}px)`)),
      `giriş panelinde ölçülen klavye payı yok — bulunanlar: ${JSON.stringify(dolgular)}`,
    ).toBe(true);
  });

  it('HİÇBİR alt dolgu yalnız --kb-height okumaz (asıl kusur buydu)', () => {
    klavyeyiAc(KLAVYE);
    const { container } = girisFormunuAc();

    for (const d of altDolgular(container)) {
      if (!d.includes('--kb-height')) continue;
      expect(d, `bu dolgu yalnız kabuğa göre ölçüyor: ${d}`).toContain('max(');
    }
  });

  it('klavye kapalıyken tasarım değişmez (pay 0px)', () => {
    klavyeyiAc(0);
    const { container } = girisFormunuAc();

    const dolgular = altDolgular(container).filter((d) => d.includes('--kb-height'));
    expect(dolgular.length).toBeGreaterThan(0);
    for (const d of dolgular) expect(d).toContain('max(var(--kb-height, 0px), 0px)');
  });

  it('form alanları gerçekten ekranda (panel açıldı, boş DOM ölçmüyoruz)', () => {
    klavyeyiAc(KLAVYE);
    girisFormunuAc();
    // Tek alan var: telefon numarası (+ ülke kodu). Şifre/e-posta kaldırıldı.
    expect(screen.getByLabelText('Telefon numarası')).toBeTruthy();
    expect(screen.getByLabelText('Ülke kodu')).toBeTruthy();
  });
});

describe('A4 · ölçüm TEK kaynaktan gelir', () => {
  const KOK = path.resolve(__dirname, '../..');
  const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');

  it('uyarı balonu ile giriş ekranı AYNI ölçümü kullanır', () => {
    klavyeyiAc(KLAVYE);
    const { container } = render(<Toast message="Saha adı gerekli" />);
    const balon = container.querySelector<HTMLElement>('.uyari-balonu');
    expect(balon).toBeTruthy();
    // Balon değeri CSS değişkenine yazar; giriş ekranı aynı kancadan aynı
    // sayıyı alır. İkisi ayrışırsa bir ekran doğru, öteki yanlış davranırdı.
    expect(balon!.style.getPropertyValue('--balon-klavye')).toBe(`${KLAVYE}px`);
  });

  it('giriş ekranı KENDİ ölçümünü yapmaz (ikinci ölçüm yasak)', () => {
    expect(oku('views/AuthScreen.tsx')).not.toContain('visualViewport');
  });

  it('giriş ekranı ölçümü paylaşılan kancadan alır', () => {
    expect(oku('views/AuthScreen.tsx')).toMatch(
      /import\s*\{[^}]*useKlavyeOrtusu[^}]*\}\s*from\s*['"][^'"]*components\/common\/Toast['"]/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B · İÇERİK SÜZGECİ — kapatılan delikler
// ═══════════════════════════════════════════════════════════════════════════

/** Her kök için ikili örnek: yakalanan · yakalanMAMASI gereken komşusu. */
const KOK_ORNEKLERI: ReadonlyArray<[string, string, string]> = [
  // [kök],                 [engellenmeli],            [geçmeli — masum komşu]
  ['pic (tam kelime)',      'pic herif',               'pikap sesi açık'],
  ['picler (ekli hâli)',    'picler geldi',            'pilav yaptım'],
  // 'pic' kökü BİLEREK dar: "Picasso / picnic / pickup" masum kalmalı.
  ['picin',                 'picin tekisin',           'Picasso gibi pas atti'],
  ['pice',                  'pice bak',                'picnic sepeti hazir'],
  ['serefsiz',              'serefsiz adam',           'seref misafirimiz var'],
  ['yavsak',                'yavsak herif',            'yavas ol biraz'],
  ['surtuk',                'surtuk demis',            'surtunme yuzunden'],
  ['pust',                  'pust herif',              'pusula lazim'],
  ['got (tam kelime)',      'got',                     'goturdum topu sahaya'],
  ['gotveren',              'gotveren',                'gotur beni de'],
  ['oc (tam kelime)',       'oc',                      'ocak ayinda oynariz'],
  ['godos',                 'godos',                   'gol dostu takim'],
  ['yarrag',                'yarragi yedin',           'yarali oyuncu var'],
  ['amcig',                 'amcigim',                 'amca geldi maca'],
  ['sikti',                 'sikti gitti',             'elimi sıktı'],
  ['siktin',                'siktin bizi',             'suyu sıktın mı'],
  ['siktiler',              'siktiler resmen',         'portakalı sıktılar'],
  ['siktiğimin',            'siktiğimin maçı',         'sıktığımın limonu'],
  ['sikeceğim',             'sikeceğim seni',          'şikeci takım bunlar'],
  ['sikecegim (ASCII)',     'sikecegim seni',          'sikeci takim bunlar'],
];

describe('B1 · Türkçe karaktersiz ve çekimli yazımlar artık yakalanıyor', () => {
  it.each(KOK_ORNEKLERI)('%s → engellenir', (_kok, kotu) => {
    expect(uygunsuzMu(kotu), `kaçtı: ${kotu}`).toBe(true);
  });

  it.each(KOK_ORNEKLERI)('%s → masum komşusu engellenMEZ', (_kok, _kotu, masum) => {
    expect(uygunsuzMu(masum), `yanlış pozitif: ${masum}`).toBe(false);
  });
});

describe('B2 · harf aralayarak yazma', () => {
  const engellenmeli = [
    's i k t i r',
    'S I K T I R',
    's.i.k.t.i.r lan',
    'a.m.k',
    'a m k ya',
    'a-m-k',
  ];
  it.each(engellenmeli)('engellenir: %s', (metin) => {
    expect(uygunsuzMu(metin)).toBe(true);
  });

  const masum = [
    'T C kimlik numarasi',
    'P T T kargo geldi',
    'a b c sirasiyla dizildi',
    // Tüm mesajın harfleri bitiştirilseydi "basikili" içinde "sik" bulunurdu;
    // birleştirme YALNIZ art arda tek harflik parçalara uygulanır.
    'bas ikili oyna',
    'sen ikinci yarida gel',
  ];
  it.each(masum)('geçer: %s', (metin) => {
    expect(uygunsuzMu(metin), `yanlış pozitif: ${metin}`).toBe(false);
  });
});

describe('B3 · yanlış pozitif · rakamlar sayı olarak kalır', () => {
  const masum = [
    '51k TL ceza kesmisler',   // denetçinin bulduğu birebir örnek
    '51K TL',
    '100k tl butce',
    'mac 5-0 bitti',
    'saat 21:00 de sahadayiz',
    '2026 sezonu',
    '0532 ile ara',
  ];
  it.each(masum)('geçer: %s', (metin) => {
    expect(uygunsuzMu(metin), `yanlış pozitif: ${metin}`).toBe(false);
  });

  const engellenmeli = [
    's1kt1r lan',   // harf ağırlıklı parça → l33t sayılır
    'g0d0ş',
    '1bne',
  ];
  it.each(engellenmeli)('engellenir: %s', (metin) => {
    expect(uygunsuzMu(metin)).toBe(true);
  });
});

describe('B4 · yanlış pozitif · büyük harfli ASCII "I" belirsizdir', () => {
  const masum = [
    'SIKIYIM',              // denetçinin bulduğu birebir örnek (= sıkıyım)
    'ELINI SIKIYIM',
    'SIK SIK GELIYORUM',    // = sık sık
    'SIKISIK TRAFIK',
    'AMINA MERHABA',        // insan adı
  ];
  it.each(masum)('geçer: %s', (metin) => {
    expect(uygunsuzMu(metin), `yanlış pozitif: ${metin}`).toBe(false);
  });

  const engellenmeli = [
    'SEREFSIZ HERIF',       // 'ı/i' belirsizliği bu kökü etkilemez → yakalanır
    'PIC HERIF',
    'SİKTİR',               // Türkçe 'İ' tartışmasızdır
    'AMK',
    'GOT',
    'OROSPU',
  ];
  it.each(engellenmeli)('engellenir: %s', (metin) => {
    expect(uygunsuzMu(metin), `kaçtı: ${metin}`).toBe(true);
  });
});

describe('B5 · eski davranış korundu (dosyanın felsefesi bozulmadı)', () => {
  const engellenmeli = [
    'siktir git', 'orospu çocuğu', 'amk', 'piç herif', 'göt', 'yavşak',
    'şerefsiz', 'ananı sikeyim', 'amina koyayım', 'ibne', 'sikiş', 'siiiktir',
  ];
  it.each(engellenmeli)('engellenir: %s', (metin) => {
    expect(uygunsuzMu(metin)).toBe(true);
  });

  const masum = [
    'sikişik trafik', 'Sıkıntı yok', 'götürdüm topu', 'Amina merhaba',
    'sikke koleksiyonu', 'amca geldi', 'aptalca bir hata yaptım',
    'topu bok gibi vurdum', 'İyi maçtı, eline sağlık',
  ];
  it.each(masum)('geçer: %s', (metin) => {
    expect(uygunsuzMu(metin), `yanlış pozitif: ${metin}`).toBe(false);
  });

  it('boş / anlamsız girdi patlamaz', () => {
    expect(uygunsuzMu('')).toBe(false);
    expect(uygunsuzMu('   ')).toBe(false);
    expect(ilkUygunsuzKelime(undefined as unknown as string)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B6 · DENETÇİ BULGULARI (17 Ağustos 2026) — kaybolan kök + İngilizce yanlış pozitif
// ─────────────────────────────────────────────────────────────────────────────
//
// Bağımsız denetim, süzgeci canlı çalıştırıp iki şey buldu ve ikisi de gerçekti:
//   1. Kök listesi sadeleştirilirken 'sikiyim' DÜŞMÜŞTÜ — en yaygın Türkçe küfür
//      biçimlerinden biri sessizce geçiyordu (bildirilmemiş bir kayıp).
//   2. ASCII 'got' ve 'pic' TAM KELİME olarak aranıyordu; "got it" ve "nice pic"
//      gibi masum İngilizce mesajlar engelleniyordu — hem de fotoğraf paylaşılan
//      bir uygulamada.
// Aşağısı bu iki kararı da kilitler: biri geri alınırsa test kırmızı döner.
describe('B6 · denetçi bulguları geri gelmesin', () => {
  const engellenmeli = [
    'sikiyim böyle işi',
    'sikiyorum artık bu işi',
    'sikerim seni',
    'sikik herif',
  ];
  it.each(engellenmeli)('engellenir: %s', (metin) => {
    expect(uygunsuzMu(metin), `süzgeçten kaçtı: ${metin}`).toBe(true);
  });

  const masumKalmali = [
    'got it',            // İngilizce "anladım"
    'I got this',
    'nice pic',          // İngilizce "güzel fotoğraf"
    'send me a pic',
    'götürdüm topu',     // 'götü' kökü denendi, bu yüzden GERİ ALINDI
    'götürüyorum arabayı',
  ];
  it.each(masumKalmali)('masum kalır: %s', (metin) => {
    expect(uygunsuzMu(metin), `yanlış pozitif: ${metin}`).toBe(false);
  });

  it('İngilizce istisnası YALNIZ komşuluğa bakar — Türkçe hakaret geçmez', () => {
    // İstisna "got/pic/oc kelimesini tamamen serbest bırak" DEĞİL: yalnız
    // tipik İngilizce komşusu varsa masum sayılır.
    expect(uygunsuzMu('got herif')).toBe(true);
    expect(uygunsuzMu('pic herif')).toBe(true);
    expect(uygunsuzMu('got')).toBe(true);
  });

  it('Türkçe yazımlar bu esnetmeden ETKİLENMEDİ', () => {
    // ASCII gevşetmesi Türkçe karakterli asıl biçimleri korumalı.
    expect(uygunsuzMu('piç kurusu')).toBe(true);
    expect(uygunsuzMu('göt')).toBe(true);
    expect(uygunsuzMu('oç')).toBe(true);
  });
});
