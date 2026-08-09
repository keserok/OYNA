// ════════════════════════════════════════════════════════════════════════════
// DAVET KODU GİRİŞİ (B2) · Ayarlar → Hesap → "Davet Kodu"
// ════════════════════════════════════════════════════════════════════════════
//
// Kurucu kararı (9 Ağustos 2026): davet zincirinin kopuk ucu (İşlevsel
// Açıklar B2) kayıt ekranına DEĞİL, Ayarlar'a bağlandı — kayıt akışı kimlik
// bölgesidir, oraya alan eklemek ayrı bir karar olarak beklemede.
//
// Sunucu tarafı (redeem_referral_code RPC'si) baştan beri hazırdı; kopuk olan
// tek şey giriş ekranıydı. Bu test iki şeyi korur:
//   1. Yapıştırılan metinden kod ayıklama — bağlantı, boşluk, büyük harf
//   2. Ayarlar ekranındaki giriş satırı + modal bağı yerinde duruyor

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeReferralCodeInput, REFERRAL_CODE_LENGTH } from '../../utils/referral';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ayarlar = oku('views/SettingsScreen.tsx');

describe('normalizeReferralCodeInput — yapıştırılanı koda çevirir', () => {
  it('kodu olduğu gibi kabul eder, büyük harfi küçültür, boşluğu kırpar', () => {
    expect(normalizeReferralCodeInput('  A1b2C3d4 ')).toBe('a1b2c3d4');
  });

  it('paylaşım BAĞLANTISINDAN kodu ayıklar', () => {
    expect(normalizeReferralCodeInput('https://oyna.app/davet/a1b2c3d4')).toBe('a1b2c3d4');
  });

  it('bağlantıyı içeren TAM davet mesajından da kodu bulur', () => {
    const mesaj = "OYNA'da beraber maç yapalım! ⚽ Beni @kerem olarak ekle: https://oyna.app/davet/A1B2C3D4";
    expect(normalizeReferralCodeInput(mesaj)).toBe('a1b2c3d4');
  });

  it('araya karışan tire/boşluk gibi karakterleri süzer', () => {
    expect(normalizeReferralCodeInput('a1b2-c3d4')).toBe('a1b2c3d4');
  });

  it('boş girişte boş döner — gönderim düğmesi kapalı kalır', () => {
    expect(normalizeReferralCodeInput('')).toBe('');
    expect(normalizeReferralCodeInput('   ')).toBe('');
  });

  it('üretilen kod uzunluğu sunucuyla aynı (8)', () => {
    // get_or_create_referral_code: left(uuid, 8). Sunucu değişirse bu sabit
    // de onunla birlikte değişmeli — test o günü yakalamak için var.
    expect(REFERRAL_CODE_LENGTH).toBe(8);
  });
});

describe('Ayarlar ekranı — giriş ucu yerinde', () => {
  it('Hesap bölümünde "Davet Kodu" satırı var', () => {
    // "Bildirimler" kelimesi dosyada daha ÖNCE de geçiyor (tercih sayaçları);
    // bölüm sonu Hesap başlığından SONRA aranır, yoksa dilim boş çıkar.
    const bas = ayarlar.indexOf('Hesap</h3>');
    const hesap = ayarlar.slice(bas, ayarlar.indexOf('Bildirimler', bas));
    expect(hesap).toContain('Davet Kodu');
  });

  it('satır modalı açıyor ve modal sunucudaki kullanım fonksiyonunu çağırıyor', () => {
    expect(ayarlar).toContain('setShowReferralModal(true)');
    expect(ayarlar).toContain('redeemReferralCode(');
  });

  it('tesis koduyla karışmıyor — iki AYRI modal duruyor', () => {
    // JoinFacilityModal: 6 haneli TESİS personel kodu. RedeemReferralModal:
    // 8 karakterli ARKADAŞ davet kodu. Biri diğerinin yerine geçemez.
    expect(ayarlar).toContain('JoinFacilityModal');
    expect(ayarlar).toContain('RedeemReferralModal');
  });

  it('sunucunun üç ret sebebi de sade Türkçe karşılık buluyor', () => {
    expect(ayarlar).toContain('INVALID_CODE');
    expect(ayarlar).toContain('SELF_CODE');
    expect(ayarlar).toContain('ALREADY_ATTRIBUTED');
  });
});
