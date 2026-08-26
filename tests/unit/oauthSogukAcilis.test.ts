/**
 * SAĞLAYICI DÖNÜŞÜ · SOĞUK AÇILIŞ — "beni attı ve baştan başlattı"
 * (22 Ağustos 2026)
 *
 * KARDEŞ DOSYA: `saglayiciDonusu.test.ts` web'deki işaret/dönüş okumasını
 * kilitler (AuthScreen tarafı). Bu dosya ONDAN FARKLI üç şeyi kilitler:
 * native soğuk açılış, dönüş sonucunun kullanıcıya bildirilmesi ve açılış
 * ekranının dönüşü tanıması.
 *
 * Kurucunun bildirdiği hata: Google ile girmeye çalışınca uygulama kapanıyor,
 * sıfırdan açılıyor ve karşısına telefon numarası ekranı geliyor.
 *
 * Üç ayrı sebep bulundu; üçü de burada kilitleniyor.
 *
 * 1) SOĞUK AÇILIŞ DELİĞİ (native, gerçek hata).
 *    `appUrlOpen` dinleyicisi dinamik import ile takılıyor. Uygulama arka
 *    planda öldürülmüşse — iOS bunu tarayıcı yaprağı öndeyken rutin olarak
 *    yapar — sistem uygulamayı `oyna://auth-callback?code=...` ile SIFIRDAN
 *    açar ve olay dinleyici takılmadan ÖNCE düşer. Kod hiç bozdurulmaz,
 *    oturum açılmaz, kullanıcı giriş ekranında uyanır.
 *
 * 2) SESSİZ DÜŞÜŞ. Kod bozdurulamadığında sonuç yalnız konsola yazılıyordu;
 *    kullanıcı neden giriş ekranında olduğunu bilmiyordu.
 *
 * 3) DÖNÜŞTE MARKA JENERİĞİ. Web'de giriş TAM SAYFA yönlendirmesidir;
 *    dönüşte açılış ekranı kendini normal bir ilk açılış sanıyor ve
 *    "Oturum kontrol ediliyor…" diyordu. Kullanıcı bunu "baştan başladı"
 *    diye okur.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('1 · soğuk açılışta deep link kaybolmuyor', () => {
  const app = () => oku('App.tsx');

  it('uygulamayı AÇAN adres de sorgulanıyor, yalnız olay beklenmiyor', () => {
    const s = app();
    expect(s).toContain('CapApp.getLaunchUrl()');
    // Aynı işleyiciden geçmeli: iki ayrı kopya, ikisinden birinin unutulması demek.
    const blok = s.slice(s.indexOf("import('@capacitor/app').then"), s.indexOf('return () => { if (remove) remove(); };'));
    expect((blok.match(/adresiIsle\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('aynı adres iki kez işlenmiyor', () => {
    // OAuth kodu TEK KULLANIMLIKTIR: ikinci bozdurma hata verir ve kullanıcıya
    // başarılı bir girişin ardından yanlışlıkla hata gösterirdi.
    const s = app();
    expect(s).toContain('const islenen = new Set<string>()');
    expect(s).toMatch(/if \(!url \|\| islenen\.has\(url\)\) return;\s*\n\s*islenen\.add\(url\);/);
  });

  it('açılış adresi okunamazsa uygulama çökmüyor', () => {
    const s = app();
    const blok = s.slice(s.indexOf('CapApp.getLaunchUrl()'), s.indexOf('CapApp.getLaunchUrl()') + 320);
    expect(blok).toContain('.catch(');
  });
});

describe('2 · dönüş başarısızsa kullanıcı sebebini görüyor', () => {
  it('işleyici sonucu SÖYLÜYOR, yutmuyor', () => {
    const s = oku('supabaseAuth.ts');
    expect(s).toContain("export type OAuthDonusSonucu = false | 'BASARILI' | 'IPTAL' | 'HATA'");
    const govde = s.slice(s.indexOf('export const handleAuthCallbackUrl'), s.indexOf('export type OAuthSaglayici') > 0 ? s.length : s.length);
    const f = govde.slice(0, govde.indexOf('\n};') + 3);
    expect(f).toContain("return 'BASARILI'");
    expect(f).toContain("return 'HATA'");
  });

  it('kullanıcının VAZGEÇMESİ hata sayılmıyor', () => {
    // İptal edene kırmızı uyarı göstermek, yaptığı şeyi hata gibi sunmaktır.
    const s = oku('supabaseAuth.ts');
    expect(s).toMatch(/access_denied\|user_cancel\|cancell\?ed/);
    expect(s).toContain("? 'IPTAL' : 'HATA'");
  });

  it('ekran yalnız GERÇEK hatada uyarı basıyor', () => {
    const s = oku('App.tsx');
    expect(s).toContain("if (donus === 'HATA')");
    expect(s).toContain("showToast('Giriş tamamlanamadı. Lütfen tekrar dene.')");
  });
});

describe('3 · dönüşte açılış ekranı kendini tanıyor', () => {
  it('yoklama işareti TÜKETMİYOR', () => {
    // `oauthDonusunuOku` işareti silerek okur; açılış ekranı onu çağırsaydı
    // giriş ekranı dönüş sebebini bir daha göremezdi.
    const s = oku('supabaseAuth.ts');
    expect(s).toContain('export const oauthDonusuMu = (): boolean =>');
    const govde = s.slice(s.indexOf('export const oauthDonusuMu'), s.indexOf('export const oauthDonusunuOku'));
    expect(govde).not.toContain('removeItem');
    // İki işaret de tanınmalı: adres alanı (gizli sekme yedeği) + oturum işareti.
    expect(govde).toContain("sorgu.get('code')");
    expect(govde).toContain('OAUTH_ISARET');
  });

  it('dönüşte jenerik beklemesi sıfırlanıyor ve metin değişiyor', () => {
    const s = oku('views/SplashScreen.tsx');
    expect(s).toContain('const [oauthDonusu] = useState(oauthDonusuMu)');
    expect(s).toContain('const ACILIS_SURESI_MS = oauthDonusu ? 0 : 1000');
    expect(s).toContain('Giriş tamamlanıyor…');
    // Ölçüm İLK render'da bir kez alınmalı: adres sonradan temizlenince
    // süre ortada değişir ve ekran zıplardı.
    expect(s).not.toContain('const oauthDonusu = oauthDonusuMu()');
  });
});
