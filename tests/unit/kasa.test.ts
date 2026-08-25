/**
 * KASA — ANAHTARLARIN SIZMASINI ENGELLEYEN KİLİTLER
 *
 * Kurucu kararı (25 Ağu 2026): anahtar değerleri depoda dursun ama ŞİFRELİ.
 * Bu dosya o kararın kırılabileceği yerleri tutar.
 *
 * Depo ÖZEL olsa bile düz metin kabul edilemez: git geçmişi kalıcıdır. Bir
 * anahtar bir kez commit'e girdiğinde silmek onu geçmişten çıkarmaz; her
 * klonda, her CI çalışmasında yeniden üretilir. O gün anahtarı değiştirmek
 * yetmez — o anahtarla erişilebilecek her şey yeniden kurulmalıdır.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

describe('Kasa · düz metin depoya giremez', () => {
  it('kasa.md .gitignore tarafından tutuluyor', () => {
    // Birinci katman. Tek başına yetmez (git add -f onu deler) ama ilk kapı.
    let yoksayiliyor = false;
    try {
      execFileSync('git', ['check-ignore', '-q', 'docs/master/KASA/kasa.md'], { cwd: KOK });
      yoksayiliyor = true;
    } catch { /* çıkış kodu 1 = yoksayılmıyor */ }
    expect(yoksayiliyor, 'docs/master/KASA/kasa.md .gitignore\'da değil').toBe(true);
  });

  it('çözülmüş düz metin ŞU AN depoda takip edilmiyor', () => {
    const takipli = execFileSync('git', ['ls-files', 'docs/master/KASA/'], { cwd: KOK, encoding: 'utf8' });
    expect(takipli).not.toContain('kasa.md\n');
    expect(takipli).not.toContain('.dogrulama-');
  });

  it('düz metin git GEÇMİŞİNDE hiç görünmemiş', () => {
    // Bu test kırmızıya dönerse dosyayı silmek YETMEZ: geçmişteki değer
    // orada kalır ve kasadaki bütün anahtarlar yenilenmelidir.
    const gecmis = execFileSync(
      'git', ['log', '--oneline', '--all', '--', 'docs/master/KASA/kasa.md'],
      { cwd: KOK, encoding: 'utf8' },
    ).trim();
    expect(gecmis, `kasa.md git geçmişinde:\n${gecmis}`).toBe('');
  });

  it('kilitleme aracı, git takip ediyorsa kilitlemeyi REDDEDİYOR', () => {
    // İkinci katman: .gitignore delinse bile araç durur. Kilitlemek düz metni
    // SİLDİĞİ için, takipli bir dosyayı kilitlemek "sırrı commit'te bırakıp
    // yerelden silmek" olurdu — yani en kötüsü.
    const arac = oku('scripts/kasa.mjs');
    expect(arac).toContain('gitTakipEdiyorMu');
    expect(arac).toContain('Düz metin git tarafından takip ediliyor');
  });
});

describe('Kasa · kilitlemek veri kaybettirmez', () => {
  it('düz metin, geri açılabildiği DOĞRULANMADAN silinmiyor', () => {
    // Bu adım olmasaydı, parolayı yanlış yazdığın bir gün kasanın tamamını
    // kaybeder ve bunu ancak aylar sonra açmaya çalışınca öğrenirdin.
    const arac = oku('scripts/kasa.mjs');
    const kilitle = arac.slice(arac.indexOf("komut === 'kilitle'"));

    const sifrele  = kilitle.indexOf("'-p'");
    const dogrula  = kilitle.indexOf("'-d'");
    const karsilas = kilitle.indexOf('geri !== icerik');
    const sil      = kilitle.indexOf('unlinkSync(DUZ)');

    expect(sifrele).toBeGreaterThan(-1);
    expect(dogrula, 'şifreledikten sonra geri açma adımı yok').toBeGreaterThan(sifrele);
    expect(karsilas, 'içerik karşılaştırması yok').toBeGreaterThan(dogrula);
    expect(sil, 'silme, doğrulamadan ÖNCE yapılıyor').toBeGreaterThan(karsilas);
  });

  it('şifreleme başarısızsa düz metne DOKUNULMUYOR', () => {
    const arac = oku('scripts/kasa.mjs');
    expect(arac).toContain('Düz metin dosyana DOKUNULMADI');
    expect(arac).toContain('düz metin SİLİNMEDİ');
  });
});

describe('Kasa · belgeler yerinde ve değersiz', () => {
  const BELGELER = [
    'docs/master/KASA/README.md',
    'docs/master/KASA/01-ANAHTAR-DEFTERI.md',
    'docs/master/KASA/02-SAGLAYICI-ENVANTERI.md',
    'docs/master/KASA/03-DEMO-HESAPLAR.md',
    'docs/master/KASA/04-SOZLESME-DIZINI.md',
    'docs/master/KASA/kasa.ornek.md',
  ];

  it('beş belge ve şablon duruyor', () => {
    for (const b of BELGELER) expect(existsSync(join(KOK, b)), b).toBe(true);
  });

  it('defterlerde GERÇEK anahtar değeri yok', () => {
    // Defterin işi "hangi anahtar nerede" demek; değeri söylemek DEĞİL.
    // Gerçek anahtarların tanınabilir biçimleri burada aranıyor.
    const desenler: [RegExp, string][] = [
      [/\bsbp_[a-f0-9]{40,}/,            'Supabase erişim jetonu'],
      [/\bre_[A-Za-z0-9_]{20,}/,         'Resend anahtarı'],
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----\s*\n\s*[A-Za-z0-9+/]{40,}/, 'gerçek özel anahtar'],
      [/\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\./, 'JWT (service role olabilir)'],
    ];
    for (const b of BELGELER) {
      const s = oku(b);
      for (const [desen, ad] of desenler) {
        expect(desen.test(s), `${b} içinde ${ad} görünüyor`).toBe(false);
      }
    }
  });

  it('şablon boş — içinde doldurulmuş değer yok', () => {
    const s = oku('docs/master/KASA/kasa.ornek.md');
    // Her sır satırı ya ⟨…⟩ ile boş, ya da gizli OLMAYAN bir sabit
    // (bundle id, base url gibi). Doldurulmuş bir sır kalırsa yakalanır.
    expect(s).toContain('⟨…⟩');
    expect(s).not.toMatch(/IYZICO_SECRET_KEY\s+[A-Za-z0-9]{10,}/);
    expect(s).not.toMatch(/RESEND_API_KEY\s+re_/);
  });

  it('anahtar defteri, kodun GERÇEKTEN okuduğu sırları kapsıyor', () => {
    // Defter eskirse işe yaramaz: yeni bir sır eklenip deftere yazılmazsa,
    // o sırrın ne işe yaradığını altı ay sonra kimse bilmez.
    const defter = oku('docs/master/KASA/01-ANAHTAR-DEFTERI.md');
    const kritik = [
      'SUPABASE_SERVICE_ROLE_KEY', 'IYZICO_API_KEY', 'IYZICO_SECRET_KEY',
      'APNS_PRIVATE_KEY', 'APNS_PRODUCTION', 'GOOGLE_SERVICE_ACCOUNT_KEY',
      'RESEND_API_KEY', 'WEBHOOK_SECRET', 'ADMIN_EDGE_SECRET',
      'PAYMENT_EDGE_SECRET', 'EMAIL_EDGE_SECRET', 'RESET_CODE_PEPPER',
      'SEND_SMS_HOOK_SECRET', 'NETGSM_USERCODE',
    ];
    for (const ad of kritik) {
      expect(defter, `${ad} defterde yok`).toContain(ad);
    }
  });
});
