/**
 * B11 — DOĞRULANMAMIŞ "FIFA" İDDİASI HİÇBİR EKRANDA ROZET OLARAK ÇIKMAZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * KUSUR: Hakem, başvuru formunda (views/ServiceApplication.tsx) kendi seviyesini
 * listeden KENDİSİ seçiyor — 'İl Hakemi' | 'Bölgesel' | 'Klasman' |
 * 'FIFA Kokart'. OYNA hiçbir belge istemiyor, hiçbir kurumla doğrulamıyor.
 * Buna rağmen bu değer, kaptanlara vurgulu/altın bir rozet olarak çiziliyordu.
 * Kaptan, doğrulanmış sandığı bir bilgiye göre para ödeyip hakem tutuyordu.
 * (Ayrıca FIFA üçüncü taraf tescilli markadır — doğrulanmış gibi göstermek
 * mağaza incelemesinde de hukuken de risktir.)
 *
 * ÇÖZÜM: Rozet kaldırılmadı (gerçek seviye kaptan için değerli bilgi); metin
 * TEK kaynaktan — shared/hakemSeviyesi.ts — "BEYAN: <SEVİYE>" olarak geliyor.
 *
 * BU TEST NEYİ KİLİTLER:
 *   1) Yardımcının davranışı (metin biçimi, Türkçe büyütme, boş değer).
 *   2) Başvuru formundaki seviye listesiyle yardımcının listesi ayrışmasın.
 *   3) GERÇEK RENDER: pazaryeri kartı, hakem 'FIFA Kokart' seçtiğinde ekrana
 *      "BEYAN: FIFA KOKARTI" basar; çıplak "FIFA Kokart" DOM'da bulunmaz.
 *   4) YAPISAL: gösterim yapan beş dosyanın hiçbiri ham `.level` alanını ekrana
 *      basmaz — hepsi ortak yardımcıdan geçer. Yarın biri yeni bir ekranda ham
 *      değeri basarsa bu test kırmızı yanar.
 *   5) Hakem rozetinin görünme koşulu artık `isElite` (yönetim panelinden
 *      verilen vitrin bayrağı) DEĞİL, hakemin kendi beyan ettiği seviyedir.
 *      Denetçinin ilk turda "asıl kusur duruyor" dediği nokta tam buydu.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  hakemSeviyeRozeti,
  HAKEM_SEVIYELERI,
  HAKEM_SEVIYE_ONEKI,
  HAKEM_SEVIYE_NOTU,
} from '../../shared/hakemSeviyesi';
import { MarketplaceCard } from '../../components/Marketplace/MarketplaceCard';
import type { Referee } from '../../types';

const KOK = path.resolve(__dirname, '../..');
const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');

/** Yorumları ayıklar: gerekçe yorumlarında geçen "FIFA" kodu sanılmasın. */
const koduAl = (rel: string) =>
  oku(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Hakem seviyesini ekrana basan TÜM dosyalar. Yeni ekran eklenirse buraya da. */
const GOSTERIM_DOSYALARI = [
  'views/ServiceProfile.tsx',
  'views/Marketplace.tsx',
  'components/Marketplace/MarketplaceCard.tsx',
  'views/MatchJoin.tsx',
  'views/ServiceDashboard.tsx',
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// 1 · Yardımcının davranışı
// ═══════════════════════════════════════════════════════════════════════════
describe('hakemSeviyeRozeti · iddianın sahibi metne yazılır', () => {
  it('FIFA seçimi doğrulanmış gibi değil, BEYAN olarak döner', () => {
    expect(hakemSeviyeRozeti('FIFA Kokart')).toBe('BEYAN: FIFA KOKARTI');
  });

  it('çıplak seviye adını ASLA tek başına döndürmez', () => {
    for (const seviye of HAKEM_SEVIYELERI) {
      const etiket = hakemSeviyeRozeti(seviye);
      expect(etiket).not.toBeNull();
      // Her etiket önce "BEYAN:" der; ancak ondan sonra iddia gelir.
      expect(etiket!.startsWith(`${HAKEM_SEVIYE_ONEKI}: `)).toBe(true);
    }
  });

  it('Türkçe büyütme doğru (İ/ı bozulmaz)', () => {
    // Düz toUpperCase() "IL HAKEMI" verirdi — Türkçe okuma bozulur.
    expect(hakemSeviyeRozeti('İl Hakemi')).toBe('BEYAN: İL HAKEMİ');
    expect(hakemSeviyeRozeti('Bölgesel')).toBe('BEYAN: BÖLGESEL');
    expect(hakemSeviyeRozeti('Klasman')).toBe('BEYAN: KLASMAN');
  });

  it('seviye yoksa null döner — uydurma varsayılan atanmaz', () => {
    expect(hakemSeviyeRozeti(null)).toBeNull();
    expect(hakemSeviyeRozeti(undefined)).toBeNull();
    expect(hakemSeviyeRozeti('')).toBeNull();
    expect(hakemSeviyeRozeti('   ')).toBeNull();
    expect(hakemSeviyeRozeti(42)).toBeNull();
  });

  it('listede olmayan (elle girilmiş) bir seviye sessizce yutulmaz', () => {
    // Kullanıcının/adminin girdiği bilgiyi gizlemek yerine, yine BEYAN olarak
    // gösteririz — önek zaten doğrulanmadığını söylüyor.
    expect(hakemSeviyeRozeti('Süper Lig')).toBe('BEYAN: SÜPER LİG');
  });

  it('dürüstlük notu ayrı bir metin olarak dışa açılır', () => {
    expect(HAKEM_SEVIYE_NOTU).toBe('doğrulanmadı');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · Başvuru formu ile yardımcı ayrışmasın
// ═══════════════════════════════════════════════════════════════════════════
describe('seviye listesi · başvuru formuyla aynı', () => {
  it('ServiceApplication REF_LEVELS ile birebir örtüşür', () => {
    const kod = koduAl('views/ServiceApplication.tsx');
    const m = kod.match(/const REF_LEVELS = \[([^\]]*)\]/);
    expect(m, 'ServiceApplication içinde REF_LEVELS bulunamadı').not.toBeNull();
    const formdakiler = m![1]
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    expect(formdakiler).toEqual([...HAKEM_SEVIYELERI]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · GERÇEK RENDER — pazaryeri kartı
// ═══════════════════════════════════════════════════════════════════════════
describe('MarketplaceCard · hakem kartı ekrana ne basıyor', () => {
  const hakem = (over: Partial<Referee> = {}): Referee =>
    ({
      id: 'ref-1',
      name: 'Kerem Yılmaz',
      rating: 4.8,
      fee: 500,
      level: 'FIFA Kokart',
      matchCount: 120,
      isElite: true,
      reviews: [],
      preferredZones: ['Ordu/Altınordu'],
      ...over,
    }) as unknown as Referee;

  it('"BEYAN: FIFA KOKARTI" basar', () => {
    render(<MarketplaceCard item={hakem()} type="REF" onClick={() => {}} />);
    expect(screen.getByText(/BEYAN: FIFA KOKARTI/)).toBeInTheDocument();
  });

  it('çıplak "FIFA Kokart" / "FIFA LİSANSLI" DOM\'da YOKTUR', () => {
    const { container } = render(
      <MarketplaceCard item={hakem()} type="REF" onClick={() => {}} />,
    );
    const metin = container.textContent || '';
    expect(metin).not.toContain('FIFA LİSANSLI');
    // Ekranda geçen her "FIFA" mutlaka "BEYAN:" önekinin ARDINDAN gelir.
    const fifaSayisi = (metin.match(/FIFA/g) || []).length;
    const beyanliFifaSayisi = (metin.match(/BEYAN: FIFA/g) || []).length;
    expect(fifaSayisi).toBe(beyanliFifaSayisi);
  });

  it('seviye girmemiş hakemde hiç FIFA/seviye metni çıkmaz', () => {
    const { container } = render(
      <MarketplaceCard item={hakem({ level: null as any })} type="REF" onClick={() => {}} />,
    );
    expect(container.textContent || '').not.toContain('FIFA');
    expect(container.textContent || '').not.toContain('BEYAN');
  });

  it('isElite bayrağı TEK BAŞINA seviye iddiası doğurmaz', () => {
    // Kusurun özü: rozet `isElite`e bağlıydı ve metni sabit "FIFA" idi. Yani
    // seviyesi 'İl Hakemi' olan biri, admin onu elite işaretlediyse ekranda
    // FIFA görünüyordu. Aşağıdaki hakem elite ve seviyesi il — FIFA çıkmamalı.
    const { container } = render(
      <MarketplaceCard
        item={hakem({ level: 'İl Hakemi', isElite: true } as any)}
        type="REF"
        onClick={() => {}}
      />,
    );
    const metin = container.textContent || '';
    expect(metin).not.toContain('FIFA');
    expect(metin).toContain('BEYAN: İL HAKEMİ');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · YAPISAL — hiçbir ekran ham `.level` basmıyor, hepsi ortak yardımcıdan
// ═══════════════════════════════════════════════════════════════════════════
describe('tüm gösterim yerleri ortak yardımcıdan besleniyor', () => {
  /**
   * `hakemSeviyeRozeti(...)` çağrılarını (bir seviye iç parantez dahil) siler.
   * Geriye kalan her `.level`, ham alanın doğrudan kullanıldığı yerdir.
   */
  const cagrilariSil = (kod: string) =>
    kod.replace(/hakemSeviyeRozeti\((?:[^()]|\([^()]*\))*\)/g, 'YARDIMCI');

  /**
   * Ekrana basmayan, yalnız veriyi TAŞIYAN satırlar. Bunlar `.level` içerir ama
   * kullanıcıya bir şey göstermez; gösterim hep yardımcıdan geçer.
   */
  const TASIMA_ISTISNALARI = [
    // ServiceDashboard: profil nesnesi kurulurken ham değer taşınıyor.
    /^\s*level:\s*\(me as any\)\.level\b/,
  ];

  it.each(GOSTERIM_DOSYALARI)('%s ortak yardımcıyı içe aktarıyor', (dosya) => {
    expect(koduAl(dosya)).toMatch(/from ['"][^'"]*shared\/hakemSeviyesi['"]/);
  });

  it.each(GOSTERIM_DOSYALARI)('%s ham `.level` alanını doğrudan kullanmıyor', (dosya) => {
    const kalanlar = cagrilariSil(koduAl(dosya))
      .split('\n')
      .map((satir, i) => ({ satir, no: i + 1 }))
      .filter(({ satir }) => /\.level\b/.test(satir))
      .filter(({ satir }) => !TASIMA_ISTISNALARI.some((r) => r.test(satir)));

    expect(
      kalanlar.map(({ no, satir }) => `${dosya}:${no} → ${satir.trim()}`),
      'Ham seviye ekrana basılıyor; shared/hakemSeviyesi.ts üzerinden geçmeli',
    ).toEqual([]);
  });

  it.each(GOSTERIM_DOSYALARI)('%s içinde elle yazılmış "FIFA" metni yok', (dosya) => {
    // Metin tek kaynaktan gelmeli; ekrana elle "FIFA" yazan hiçbir satır kalmaz.
    expect(koduAl(dosya)).not.toMatch(/FIFA/);
  });

  it('doğrulanmış izlenimi veren "FIFA LİSANSLI" hiçbir dosyada yok', () => {
    for (const dosya of GOSTERIM_DOSYALARI) {
      expect(oku(dosya)).not.toContain('FIFA LİSANSLI');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 · Hakem rozeti artık `isElite` bayrağına bağlı DEĞİL
// ═══════════════════════════════════════════════════════════════════════════
describe('ServiceProfile · hakem rozetinin koşulu', () => {
  const kod = koduAl('views/ServiceProfile.tsx');

  it('hakem rozeti hakemin kendi seviyesinden çiziliyor', () => {
    expect(kod).toMatch(/seviyeRozeti\s*&&/);
    expect(kod).toMatch(/const seviyeRozeti = isRef \? hakemSeviyeRozeti\(/);
  });

  it('"ELİT KALECİ" rozeti hâlâ yalnız kalecide ve isElite ile (tasarım korundu)', () => {
    // isElite yönetim panelinden verilen bir VİTRİN bayrağıdır; kaleci
    // tarafında anlamı korunur, hakem seviyesiyle karıştırılmaz.
    expect(kod).toContain('ELİT KALECİ');
    expect(kod).toMatch(/userProfile\?\.isElite &&/);
  });

  it('isElite ile FIFA metni artık aynı ifadede buluşmuyor', () => {
    // Eski kod: {userProfile?.isElite && ... {isRef ? 'BEYAN: FIFA KOKARTI' : ...}}
    // Bu satır geri gelirse (koşul isElite + sabit FIFA metni) test kırılır.
    const isEliteSatirlari = kod.split('\n').filter((s) => s.includes('isElite'));
    for (const s of isEliteSatirlari) expect(s).not.toMatch(/FIFA|isRef \?/);
  });
});
