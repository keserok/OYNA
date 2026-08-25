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
  /**
   * DESEN TEK YERE TAŞINDI (22 Ağustos 2026). Google ve Apple web dalları
   * ayrı ayrı `oauthIsaretiBirak('google'|'apple')` çağırıyordu; ikisi de
   * artık `webOAuthAc(saglayici)` üzerinden geçiyor. Kilit, iki ayrı satırın
   * yazılışını değil DEĞİŞMEZİ korur: işaret, sağlayıcıya gitmeden ÖNCE
   * yazılmalı — sonra yazılsaydı yönlendirme başlamış olurdu ve o satıra
   * hiç dönülmezdi.
   */
  it('işaret, sağlayıcı adresi alınmadan ÖNCE yazılır', () => {
    const s = oku('supabaseAuth.ts');
    const govde = s.slice(s.indexOf('const webOAuthAc'), s.indexOf('const webOAuthAc') + 900);
    const isaret = govde.indexOf('oauthIsaretiBirak(saglayici)');
    const cagri = govde.indexOf('signInWithOAuth');
    expect(isaret, 'webOAuthAc işaret bırakmıyor').toBeGreaterThan(-1);
    expect(cagri, 'webOAuthAc signInWithOAuth çağırmıyor').toBeGreaterThan(-1);
    expect(isaret, 'işaret çağrıdan SONRA yazılıyor').toBeLessThan(cagri);
  });

  it('her iki sağlayıcının web dalı da AYNI yoldan geçer', () => {
    // Biri eski tam-sayfa yolunda kalsaydı, kullanıcı sağlayıcıya göre
    // farklı davranış görürdü.
    const s = oku('supabaseAuth.ts');
    expect(s).toContain("await webOAuthAc('google')");
    expect(s).toContain("await webOAuthAc('apple')");
    // Web dallarında artık doğrudan tam-sayfa yönlendirmesi olmamalı.
    expect(s).not.toMatch(/options: \{ redirectTo: webDonusAdresi\(\) \},\s*\}\);\s*\n\s*if \(error\) throw error;\s*\n\};/);
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
    // Kullanıcıya ÇIKIŞ da gösterilmeli. KORUNAN GARANTİ budur: mesaj yalnız
    // "olmadı" demez, ÇALIŞAN bir yol tarif eder.
    //
    // 24 Ağu 2026: çıkış yolu TELEFON'dan E-POSTA+ŞİFRE'ye geçti. Telefon yolu
    // 23 Ağustos'ta silindi; o tarihten sonra bu satır kullanıcıyı var olmayan
    // bir ekrana yönlendiren bir metni "doğru" sayıyordu — test yeşildi ama
    // kullanıcı çıkmaz sokağa gönderiliyordu. Metin değil, GARANTİ korunur.
    expect(m.toLowerCase()).toContain('şifre');
    // Silinen yola bir daha yönlendirilmemeli.
    expect(m.toLowerCase()).not.toContain('numaran');
  });

  it('sağlayıcı kapalıysa sebep ve çıkış birlikte söylenir', () => {
    const m = mapOAuthDonusu('google', 'server_error', 'Unsupported provider: provider is not enabled');
    expect(m).toContain('Google ile giriş tamamlanamadı');
    expect(m.toLowerCase()).toContain('e-posta');
    expect(m.toLowerCase()).not.toContain('numaran');
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
