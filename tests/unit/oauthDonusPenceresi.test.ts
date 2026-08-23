/**
 * SAĞLAYICI DÖNÜŞÜ — "hesabımı seçince uygulama yeniden başlıyor" KİLİDİ
 *
 * Kurucunun 22–23 Ağustos 2026'da iki kez bildirdiği hata: Google/Apple
 * hesabını onayladıktan sonra OYNA sıfırdan açılıyor ve karşısına giriş
 * ekranı (demo hesap listesiyle birlikte) geliyor.
 *
 * İKİ AYRI MEKANİZMA vardı; bu dosya ikisini de kilitler.
 *
 *   1. AÇILIR PENCERE ENGELLENİYORDU. `window.open`, `signInWithOAuth`
 *      beklendikten SONRA çağrılıyordu. Tarayıcı kuralı: pencere, kullanıcı
 *      jestinin AYNI iş adımında açılmalı. Araya `await` girince Safari
 *      (iOS dâhil) jesti tükenmiş sayıp pencereyi engelliyor, kod da emniyet
 *      valfine — TAM SAYFA yönlendirmesine — düşüyordu. Uygulamanın
 *      kapanıp yeniden açılması buydu.
 *
 *   2. DÖNÜŞ PENCERESİ TANINMIYORDU. Tanıma ölçütü
 *      `window.name === 'oyna-oauth' && window.opener` idi. Chrome 88'den
 *      beri çapraz kaynak gezinmede `window.name` TEMİZLENİR; COOP/noopener
 *      ve mobilin "açılır pencereyi sekme olarak aç" davranışı da
 *      `window.opener`ı koparır. Koşul dönüşte hep false'a düşüyor, dönen
 *      bağlam TÜM UYGULAMAYI çiziyordu.
 *
 * Kilitler kaynak biçimine bakıyor çünkü korunan şey davranış değil SIRA ve
 * ÖLÇÜT: ikisi de birim testinde jsdom'la canlandırılamaz (jsdom açılır
 * pencere açmaz, çapraz kaynak gezinmez).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OAUTH_DONUS_ANAHTARI,
  donusAdresiniIsaretle,
  oauthDonusPenceresiMi,
  oauthDonusIsaretiniSil,
} from '../../shared/oauthPencere';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Yorumları ayıklar: sıra iddiaları KOD sırasına bakmalı. */
const kodu = (metin: string) =>
  metin
    .split('\n')
    .filter((satir) => !/^\s*(\/\/|\/\*|\*)/.test(satir))
    .join('\n');

const adresiKur = (sorgu: string) => {
  window.history.replaceState({}, '', `/${sorgu}`);
};

describe('Sağlayıcı dönüşü · adres işareti', () => {
  beforeEach(() => adresiKur(''));

  it('işaret dönüş adresine eklenir; var olan sorguyu ezmez', () => {
    expect(donusAdresiniIsaretle('https://oyna-app.vercel.app/'))
      .toBe(`https://oyna-app.vercel.app/?${OAUTH_DONUS_ANAHTARI}=1`);
    expect(donusAdresiniIsaretle('https://oyna-app.vercel.app/?a=1'))
      .toBe(`https://oyna-app.vercel.app/?a=1&${OAUTH_DONUS_ANAHTARI}=1`);
  });

  it('işaretli adres dönüş bağlamı sayılır, işaretsiz adres SAYILMAZ', () => {
    adresiKur(`?${OAUTH_DONUS_ANAHTARI}=1&code=abc`);
    expect(oauthDonusPenceresiMi()).toBe(true);

    // Açılır pencere ENGELLENDİĞİNDE tam sayfa yoluna düşülür ve işaret
    // eklenmez: dönen bağlam ANA SEKMEDİR, uygulamayı çizmelidir.
    adresiKur('?code=abc');
    expect(oauthDonusPenceresiMi()).toBe(false);
    adresiKur('');
    expect(oauthDonusPenceresiMi()).toBe(false);
  });

  it('işaret silinir; adresteki öteki alanlar korunur', () => {
    adresiKur(`?code=abc&${OAUTH_DONUS_ANAHTARI}=1`);
    oauthDonusIsaretiniSil();
    expect(oauthDonusPenceresiMi()).toBe(false);
    expect(window.location.search).toContain('code=abc');

    // İşaret yoksa adrese dokunmaz.
    adresiKur('?code=abc');
    oauthDonusIsaretiniSil();
    expect(window.location.search).toBe('?code=abc');
  });
});

describe('Sağlayıcı dönüşü · tanıma ölçütü', () => {
  const idx = oku('index.tsx');

  it('index.tsx dönüşü window.name / window.opener ile TANIMAZ', () => {
    // Chrome çapraz kaynak gezinmede window.name'i temizler; COOP ve mobilin
    // sekme davranışı window.opener'ı koparır. Bu ölçütler geri gelirse
    // dönen sekme yine tüm uygulamayı çizer.
    const kod = kodu(idx);
    expect(kod).not.toMatch(/window\.name\s*===/);
    expect(kod).not.toMatch(/window\.opener/);
  });

  it('index.tsx kararı adres bayrağıyla verir ve uygulamayı ÇİZMEZ', () => {
    expect(idx).toContain('oauthDonusPenceresiMi()');
    const kod = kodu(idx);
    const kosul = kod.indexOf('if (oauthDonusPenceresiMi())');
    expect(kosul).toBeGreaterThan(-1);
    // Kararın ardından uygulama doğrudan çizilmemeli: önce oturum beklenir.
    expect(kod.slice(kosul, kod.indexOf('} else {', kosul))).toContain('getSession()');
  });

  it('kapanamayan dönüş sekmesi BEYAZ SAYFA bırakmaz', () => {
    // Mobil tarayıcılar `window.close()`u çoğu zaman reddeder. Eski kod o
    // durumda kullanıcıyı boş sayfayla baş başa bırakıyordu; artık oturum
    // zaten açık olduğu için uygulama o sekmede çizilir.
    const kod = kodu(idx);
    expect(kod).toMatch(/window\.close\(\)/);
    expect(kod).toMatch(/!window\.closed\)\s*uygulamayiCiz\(\)/);
  });
});

describe('Sağlayıcı girişi · açılır pencere sırası', () => {
  const s = oku('supabaseAuth.ts');
  const govde = (() => {
    const bas = s.indexOf('const webOAuthAc = async');
    expect(bas, 'webOAuthAc bulunamadı').toBeGreaterThan(-1);
    return kodu(s.slice(bas, s.indexOf('\n};', bas)));
  })();

  it('window.open, İLK bekleme noktasından ÖNCE çağrılır', () => {
    const acilis = govde.indexOf('window.open(');
    const ilkAwait = govde.indexOf('await ');
    expect(acilis, 'webOAuthAc pencereyi hiç açmıyor').toBeGreaterThan(-1);
    expect(ilkAwait, 'webOAuthAc hiç beklemiyor — desen değişmiş').toBeGreaterThan(-1);
    // Sıra bozulursa Safari pencereyi engeller ve akış tam sayfa
    // yönlendirmesine düşer: kurucunun bildirdiği hatanın ta kendisi.
    expect(acilis).toBeLessThan(ilkAwait);
  });

  it('pencere boş açılır, adres sonra yazılır', () => {
    expect(govde).toContain("window.open(\n      'about:blank'");
    expect(govde).toMatch(/pencere\.location\.replace\(adres\)/);
  });

  it('dönüş işareti YALNIZ pencere açılabildiyse eklenir', () => {
    // Tam sayfa yoluna düşüldüğünde dönen bağlam ana sekmedir; işaret
    // eklenirse index.tsx uygulamayı çizmez ve kullanıcı boş sayfa görür.
    expect(govde).toMatch(/redirectTo:\s*pencere \? donusAdresiniIsaretle\(kokAdres\) : kokAdres/);
  });

  it('pencere açıldıysa tam sayfa yönlendirmesi YAPILMAZ', () => {
    // `window.location.assign` yalnız pencere yokken (ya da pencereye
    // yazılamadığında) çalışmalı — yoksa ana sekme yine terk edilir.
    const koruma = govde.indexOf('if (!pencere) {');
    const yonlendirme = govde.indexOf('window.location.assign(adres)');
    expect(koruma).toBeGreaterThan(-1);
    expect(yonlendirme).toBeGreaterThan(koruma);
  });
});
