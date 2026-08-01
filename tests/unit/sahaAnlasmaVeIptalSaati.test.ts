/**
 * SAHA ANLAŞMASI: fiyat farkı ve iptal saati artık SAHADAN gelir.
 *
 * İki eski hata bu dosyayla kapanır:
 *  1. Kişi başı tutar ekranda `* 1.05` ile TAHMİN ediliyordu. Sahayla başka bir
 *     oran konuşulunca ekrandaki fiyat, yayınlanınca oluşan gerçek fiyattan
 *     farklı çıkıyordu.
 *  2. İptal/iade saatleri (24/6/50) ekran metinlerine GÖMÜLÜYDÜ; saha kendi
 *     süresini değiştirdiğinde oyuncuya hâlâ eski sayı görünüyordu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  kisiBasiTutar, oyuncuToplami, PITCH_PRICE_FALLBACK, type PitchPricePreview,
} from '../../services/matchCreateService';
import { iadeKademesiCumlesi, CANCEL_POLICY_FALLBACK } from '../../services/matchService';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const anlasma = (o: Partial<PitchPricePreview>): PitchPricePreview => ({ ...PITCH_PRICE_FALLBACK, ...o });

describe('Kişi başı tutar — sunucu formülüyle birebir', () => {
  it('global varsayılan (%5): 2000₺ / 5v5 → 210₺ (bugünkü fiyat korunur)', () => {
    expect(oyuncuToplami(2000, anlasma({}))).toBe(2100);
    expect(kisiBasiTutar(2000, 10, anlasma({}))).toBe(210);
  });

  it('sahaya özel %20: 2000₺ / 5v5 → 240₺', () => {
    expect(oyuncuToplami(2000, anlasma({ markupPct: 20 }))).toBe(2400);
    expect(kisiBasiTutar(2000, 10, anlasma({ markupPct: 20 }))).toBe(240);
  });

  it('SABİT tutar yüzdeyi EZER: 2000₺ + 400₺ = 2400₺ (yüzde 20 olsa bile)', () => {
    expect(oyuncuToplami(2000, anlasma({ markupPct: 20, markupAmount: 400 }))).toBe(2400);
    expect(oyuncuToplami(2000, anlasma({ markupPct: 0, markupAmount: 400 }))).toBe(2400);
  });

  it('kuruş artığı YUKARI yuvarlanır — kimse eksik ödemez (sunucudaki CEIL)', () => {
    // 1050 + %5 = 1102.5 → 14 kişi → 78.75 → 79.
    expect(kisiBasiTutar(1050, 14, anlasma({}))).toBe(79);
  });

  it('markup sıfırsa oyuncu tam olarak sahanın fiyatını öder', () => {
    expect(oyuncuToplami(2000, anlasma({ markupPct: 0 }))).toBe(2000);
  });
});

describe('İade kademesi cümlesi sahadan kurulur', () => {
  it('varsayılan kademe bugünkü metni verir', () => {
    expect(iadeKademesiCumlesi(CANCEL_POLICY_FALLBACK))
      .toBe("maça 24 saatten fazla varsa tamamı, 6–24 saat kala %50'si cüzdanına döner; 6 saatten az kala iade yapılmaz");
  });

  it('saha 48 saate çekince cümledeki HER sayı değişir', () => {
    const c = iadeKademesiCumlesi({ fullHours: 48, halfHours: 12, halfPct: 40 });
    expect(c).toContain('48 saatten fazla');
    expect(c).toContain('12–48 saat kala %40');
    expect(c).toContain('12 saatten az');
    expect(c).not.toContain('24');
  });
});

describe('Ekranlarda gömülü sayı KALMADI', () => {
  it('MatchCreate kişi başı tutarı 1.05 ile tahmin etmiyor', () => {
    const s = oku('views/MatchCreate.tsx');
    expect(s).not.toContain('1.05');
    expect(s).toContain('kisiBasiTutar(total, per * 2, sahaFiyat)');
  });

  it('MatchCreate iptal saatlerini sahanın ayarından yazıyor', () => {
    const s = oku('views/MatchCreate.tsx');
    expect(s).toContain('${sahaFiyat.fullHours} saatten az kala sen iptal edersen');
    expect(s).toContain('${sahaFiyat.halfHours}–${sahaFiyat.fullHours} saat kala %${sahaFiyat.halfPct}');
  });

  it('MatchJoin kaptan iptali eşiğini sahadan okuyor', () => {
    const s = oku('views/MatchJoin.tsx');
    expect(s).toContain('const serbestIptalSaati = iptalPolitikasi.fullHours;');
    expect(s).toContain('macaKalanSaat < serbestIptalSaati');
    // İptal onay kutusundaki iki satır da artık değişkenle yazılıyor.
    expect(s).toContain('<b>{serbestIptalSaati} saatten fazla</b>');
    expect(s).toContain('<b>{serbestIptalSaati} saatten az</b>');
  });

  it('MatchJoin politikayı sunucudan çekiyor', () => {
    const s = oku('views/MatchJoin.tsx');
    expect(s).toContain('fetchMatchCancelPolicy(match.id)');
  });
});

describe('Paneller: anlaşma doğru kişiye görünür', () => {
  it('saha sahibi anlaşma satırı YALNIZ sahip seviyesinde çizilir (müdür/personel görmez)', () => {
    const s = oku('views/owner/menu/OwnerMenuView.tsx');
    const blok = s.split('OYNA Anlaşmam')[0];
    // Satırın hemen üstündeki koşul sahip kontrolü olmalı.
    expect(blok.slice(-400)).toContain('{isOwnerLvl && (');
  });

  it('panel anlaşma modalını sahip kapısından açar', () => {
    const s = oku('views/OwnerPanel.tsx');
    expect(s).toContain('onAgreement={() => {');
    expect(s.split('onAgreement={() => {')[1].slice(0, 200)).toContain('ownerOnlyGuard()');
  });

  it('sahip ekranı SALT OKUNUR — kaydetme çağrısı yok', () => {
    const s = oku('views/owner/menu/OwnerAgreementModal.tsx');
    expect(s).toContain('getMyPitchAgreement');
    expect(s).not.toContain('admin_set_pitch_agreement');
    expect(s).not.toMatch(/set[A-Za-z]*Agreement\(/);
  });

  it('admin paneli anlaşmaları RPC ile yazar (tabloya elle satır atmaz)', () => {
    const s = oku('admin-panel/views/components/PitchAgreementsPanel.tsx');
    expect(s).toContain("supabase.rpc('admin_pitch_agreements')");
    expect(s).toContain("supabase.rpc('admin_set_pitch_agreement'");
    expect(s).toContain("supabase.rpc('admin_set_pitch_cancel_policy'");
    expect(s).not.toContain(".from('commission_config')");
  });
});

describe('Sunucu tarafı: anlaşma migration\'ları depoda', () => {
  const m1 = oku('supabase/migrations/20260904000000_saha_anlasma_sistemi.sql');
  const m2 = oku('supabase/migrations/20260904000001_kesinlesme_ve_saha_hakedisi.sql');

  it('gömülü %5 create_match_atomic içinden kaldırıldı', () => {
    expect(m2).toContain('v_markup := public._markup_tutari(');
    expect(m2).not.toMatch(/CEIL\([^)]*\* 1\.05/);
  });

  it('kadro dolunca tek durum yazılır: CONFIRMED', () => {
    expect(m2).toContain("SET status = 'CONFIRMED', confirmed_at = timezone('utc', now())");
    // is_successful kesinleşmede YAZILMAZ — o finalize_match'in işi.
    const govde = m2.split('CREATE OR REPLACE FUNCTION public.match_check_threshold')[1]
      ?.split('CREATE OR REPLACE FUNCTION')[0] ?? '';
    expect(govde).not.toBe('');
    expect(govde).not.toContain('is_successful');
  });

  it('kaptan iptali serbest saati sahadan okur', () => {
    expect(m2).toContain('SELECT full_hours INTO v_serbest FROM public._pitch_refund_tiers(v_match.pitch_id)');
  });

  it('anlaşma maça DONDURULUR (sonradan oran değişse bile hesap değişmez)', () => {
    expect(m1).toContain('commission_rate_pct');
    expect(m1).toContain('NEW.commission_rate_pct       := COALESCE(NEW.commission_rate_pct, a.rate_pct);');
  });

  it('komisyon oranı oyuncuya AÇILMAZ (ticari bilgi)', () => {
    expect(m1).toContain('REVOKE ALL ON FUNCTION public.pitch_agreement_summary(uuid, numeric) FROM PUBLIC, anon, authenticated;');
    const m3 = oku('supabase/migrations/20260904000002_oyuncu_fiyat_ve_iptal_onizleme.sql');
    expect(m3).not.toContain("'rate_pct'");
  });
});
