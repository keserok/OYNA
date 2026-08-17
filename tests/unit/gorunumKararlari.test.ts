import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { AVATAR_BG, AVATAR_BORDER } from '../../components/common/UserAvatar';

// ═══════════════════════════════════════════════════════════════════════════
// GÖRÜNÜM — karar kilitleri (kurucu istekleri, 17 Ağustos 2026)
//
//   D · Profil yuvarlağı TAMAMEN SAYDAM + ince beyaz çerçeve. Eski yarı saydam
//       beyaz zemin, koyu lacivert kartın üstünde AÇIK MAVİ bir daire gibi
//       görünüyordu ("profil fotoğrafının rengini açık mavi görüyorum").
//   Ç · Ekran başlıkları üst çentiğe TAKILMAZ: güvenli alanı bildirmeyen
//       cihazda bile taban boşluk kalır.
//   A · Alt menü ekranın altıyla BİRLEŞİK; yalnız üst köşeleri yuvarlak.
// ═══════════════════════════════════════════════════════════════════════════

const KOK = path.resolve(__dirname, '../..');
const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');
const css = oku('index.css');

describe('D · avatar saydam, çerçeve ince', () => {
  it('zemin tamamen saydam', () => {
    expect(AVATAR_BG).toBe('transparent');
  });

  it('çerçeve ince ve beyaz — daire kaybolmuyor', () => {
    expect(AVATAR_BORDER).toMatch(/^1px solid rgba\(255,255,255,0\.\d+\)$/);
  });

  it('renk TEK yerde: çağıranlar kendi zeminini yazmıyor', () => {
    // Bileşenin varlık sebebi "aynı kişi her ekranda aynı görünsün".
    for (const f of [
      'components/ui/Avatar.tsx',
      'components/profile/ProfileHero.tsx',
      'components/profile/ProfileIdentityCard.tsx',
      'components/Marketplace/MarketplaceCard.tsx',
      'views/MessagesView.tsx',
    ]) {
      const govde = oku(f);
      const i = govde.indexOf('<UserAvatar');
      if (i < 0) continue;
      // YALNIZ etiketin kendisi ölçülür. Daha geniş bir dilim, yanındaki
      // çevrimiçi noktasının yeşilini (bg-[#39FF14]) yakalayıp yanlış alarm verirdi.
      const kapanis = govde.indexOf('/>', i);
      const cagri = govde.slice(i, kapanis > 0 ? kapanis : i + 400);
      expect(cagri, `${f}: avatar zeminini eziyor`).not.toMatch(/background:\s*['"]?#|bg-\[#/);
    }
  });

  it('çift halka yok — çağıranlar ayrıca çerçeve çizmiyor', () => {
    expect(oku('components/ui/Avatar.tsx')).not.toContain('border border-white/10`');
    const dash = oku('views/Dashboard.tsx');
    const i = dash.indexOf('className="oy-home-avatar"');
    expect(dash.slice(i, i + 420)).not.toContain("border: '1.5px solid");
  });
});

describe('Ç · başlıklar çentiğin altında kalmıyor', () => {
  it('taban boşluk kuralı tanımlı (güvenli alan 0 dese bile)', () => {
    expect(css).toContain('.pt-safe-baslik { padding-top: max(calc(var(--safe-top) + 1rem), 3.25rem); }');
  });

  it('çevrimdışı şerit telafisi de var (şerit açıkken başlık altında kalmasın)', () => {
    expect(css).toContain('body.offline-banner-on .pt-safe-baslik');
  });

  it('kurucunun saydığı ekranlar taban boşluk kuralını kullanıyor', () => {
    const ekranlar: [string, string][] = [
      ['views/MatchCreate.tsx', 'Maç Kur'],
      ['views/Marketplace.tsx', 'Kaleci/Hakem Kirala'],
      ['views/Studio.tsx', 'Stüdyo'],
      ['views/MyMatchesHub.tsx', 'Maçlarım'],
      ['views/SocialView.tsx', 'Sosyal'],
      ['views/MessagesView.tsx', 'Mesajlar'],
      ['views/ProfileScreen.tsx', 'Profil'],
      ['views/PaymentScreen.tsx', 'Ödeme'],
      ['views/MatchJoin.tsx', 'Maç Lobisi'],
      ['views/OwnerPanel.tsx', 'İşletme'],
    ];
    for (const [dosya, ad] of ekranlar) {
      expect(oku(dosya), `${ad} başlığı taban boşluk kullanmıyor`).toContain('pt-safe-baslik');
    }
  });

  it('ekran başlıklarında çıplak pt-safe kalmadı', () => {
    // `pt-safe` güvenli alanı bildirmeyen cihazda 16px'e düşer ve başlık
    // çentiğin altına girer. Ekran başlıklarında kullanılmamalı.
    for (const dosya of ['views/MatchCreate.tsx', 'views/Studio.tsx', 'views/MyMatchesHub.tsx',
                         'views/PaymentScreen.tsx', 'components/payment/AddCardScreen.tsx']) {
      // `pt-safe-baslik` de eşleşmesin: tire kelime sınırı sayıldığı için
      // `\bpt-safe\b` onu da yakalıyordu.
      const basliklar = oku(dosya).split('\n').filter(l => /<header/.test(l) && /pt-safe(?![\w-])/.test(l));
      expect(basliklar, `${dosya}: çıplak pt-safe başlık kaldı`).toEqual([]);
    }
  });
});

describe('A · alt menü ekranın altıyla birleşik', () => {
  const nav = oku('components/BottomNav.tsx');

  it('yalnız ÜST köşeler yuvarlak', () => {
    expect(nav).toContain('rounded-t-[28px]');
    expect(nav).not.toContain('rounded-[32px]');
  });

  it('yanlarda ve altta boşluk yok — çubuk havada durmuyor', () => {
    const sarmalayici = nav.slice(nav.indexOf('className="fixed bottom-0'), nav.indexOf('className="fixed bottom-0') + 120);
    expect(sarmalayici).not.toContain('px-4');
    expect(sarmalayici).not.toContain('pt-2');
  });

  it('güvenli alan payı çubuğun İÇİNDE — zemin alt kenara kadar iniyor', () => {
    expect(nav).toContain('pb-safe-2');
    expect(css).toContain('.pb-safe-2   { padding-bottom: calc(var(--safe-bottom) + 0.5rem); }');
  });

  it('çerçeve yalnız üstte', () => {
    expect(nav).toContain('border-t border-white/10');
  });

  it('üç menünün üçü de aynı dili konuşuyor', () => {
    // Rol değiştiren kullanıcı "başka uygulamaya girdim" hissetmemeli.
    for (const f of ['components/BottomNav.tsx',
                     'views/owner/components/OwnerBottomNav.tsx',
                     'views/ServiceDashboard.tsx']) {
      expect(oku(f), f).toContain('rounded-t-[28px]');
    }
  });

  it('içerik payı hâlâ tek kaynaktan (--oy-nav-h) geliyor', () => {
    expect(css).toContain('--oy-nav-h:');
    expect(css).toContain('.pb-safe-nav { padding-bottom: calc(var(--safe-bottom) + var(--oy-nav-h)); }');
  });
});
