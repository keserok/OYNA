import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { mapOAuthDonusu } from '../../utils/errorMap';

// ═══════════════════════════════════════════════════════════════════════════
// SAĞLAYICI DÖNÜŞÜ — karar kilidi (kurucu bildirimi, 19 Ağustos 2026)
//
// BİLDİRİLEN HATA: "google ile giriş yapmayı denedim, uygulama kendini
// yeniledi ve eski kayıt ekranı geldi."
//
// KÖKÜ: web'de Google/Apple girişi TAM SAYFA yönlendirmesidir. Dönüş oturumsuz
// olduğunda uygulama sıfırdan açılır; `introShownThisSession` bayrağı da
// sıfırlandığı için kullanıcı TANITIM ekranıyla karşılaşır — yani bastığı
// ekrandan BAŞKA bir ekranda uyanır ve hiçbir açıklama görmez.
//
// KİLİTLENEN KARARLAR:
//   1. Yönlendirmeden ÖNCE oturuma bir işaret bırakılır.
//   2. Dönüşte ekran TANITIMI ATLAR — aynı telefon ekranı sabit kalır.
//   3. Ekranda SEBEP yazar; sessiz dönüş yok.
// ═══════════════════════════════════════════════════════════════════════════

const KOK = path.resolve(__dirname, '../..');
const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');

describe('1 · yönlendirmeden önce işaret bırakılır', () => {
  it('Google web yolu işareti signInWithOAuth çağrısından ÖNCE yazar', () => {
    const s = oku('supabaseAuth.ts');
    const isaret = s.indexOf("oauthIsaretiBirak('google')");
    expect(isaret, 'Google web dalında işaret bırakılmıyor').toBeGreaterThan(-1);
    // İşaretten sonraki ilk signInWithOAuth, google'ın web dalı olmalı.
    const cagri = s.indexOf('signInWithOAuth', isaret);
    expect(cagri).toBeGreaterThan(isaret);
  });

  it('Apple web yolu da aynı deseni kullanır', () => {
    const s = oku('supabaseAuth.ts');
    const isaret = s.indexOf("oauthIsaretiBirak('apple')");
    expect(isaret, 'Apple web dalında işaret bırakılmıyor').toBeGreaterThan(-1);
    expect(s.indexOf('signInWithOAuth', isaret)).toBeGreaterThan(isaret);
  });

  it('okuyucu işareti TEK KULLANIMLIK yapar (removeItem) ve adresi temizler', () => {
    const s = oku('supabaseAuth.ts');
    expect(s).toContain('sessionStorage.removeItem(OAUTH_ISARET)');
    expect(s).toContain('window.history.replaceState');
  });

  it('bayat işaret yeni bir girişi "başarısız dönüş" sanmaz', () => {
    const s = oku('supabaseAuth.ts');
    expect(s).toContain('OAUTH_ISARET_OMRU_MS');
  });
});

describe('2 · dönüşte tanıtım atlanır — tek telefon ekranı sabit', () => {
  it('AuthScreen açılış aşamasını dönüşe göre seçer', () => {
    const s = oku('views/AuthScreen.tsx');
    // Dönüş varsa 'intro' DEĞİL 'input' ile açılmalı.
    expect(s).toMatch(/\(oauthDonusu \|\| introShownThisSession\)\s*\?\s*'input'\s*:\s*'intro'/);
  });

  it('dönüş İLK render sırasında okunur (sonradan gelen useEffect değil)', () => {
    const s = oku('views/AuthScreen.tsx');
    const okuma = s.indexOf('useState(() => oauthDonusunuOku())');
    const asama = s.indexOf("const [stage, setStage]");
    expect(okuma, 'dönüş tembel useState ile okunmuyor').toBeGreaterThan(-1);
    expect(okuma, 'dönüş, aşama seçilmeden ÖNCE okunmalı').toBeLessThan(asama);
  });
});

describe('3 · ekranda sebep yazar — sessiz dönüş yok', () => {
  it('hata kodu olmasa bile bir cümle üretilir', () => {
    const m = mapOAuthDonusu('google', null, null);
    expect(m).toContain('Google');
    expect(m.length).toBeGreaterThan(30);
    // Kullanıcıya ÇIKIŞ da gösterilmeli: numarayla girme yolu.
    expect(m.toLowerCase()).toContain('telefon');
  });

  it('sağlayıcı kapalıysa sebep ve çıkış birlikte söylenir', () => {
    const m = mapOAuthDonusu('google', 'server_error', 'Unsupported provider: provider is not enabled');
    expect(m).toContain('Google ile giriş tamamlanamadı');
    expect(m.toLowerCase()).toContain('telefon numaran');
  });

  it('kullanıcı izin vermediyse suçlayıcı değil, yol gösterici konuşulur', () => {
    const m = mapOAuthDonusu('apple', 'access_denied', 'The user denied your request');
    expect(m).toContain('Apple');
    expect(m).not.toMatch(/hata kodu|error/i);
  });

  it('mesaj ham İngilizce metni ekrana taşımaz', () => {
    const m = mapOAuthDonusu('google', 'server_error', 'Database error saving new user');
    expect(m).not.toContain('Database error');
  });
});
