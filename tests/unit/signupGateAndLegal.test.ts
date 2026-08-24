// IP-15 bekçisi — kayıt kapısı, oturum ve yasal onay.
//
// Kilitlenen sözler:
//   1. Misafirin denediği HER yazma aksiyonu kapıyı açar, genel hata basmaz.
//   2. Kapı, başlanan işi saklar; kayıt bitince kullanıcı oraya döner.
//   3. Hiçbir buton sessizce pasif kalmaz — eksik olan tek şey söylenir.
//   4. Misafir gezinme rıza istemez (sunucuya rıza kaydı gitmiyor).
//   5. Onay anındaki metin ile Ayarlar → Yasal'daki belge AYNI kaynaktır.
//   6. Belgenin adı tektir: "Kullanım Şartları".
//   7. Rıza sürüm damgası belgenin kendi tarihiyle aynı yerden gelir.
//   8. Splash, oturum çözülmeden dokunuşu yutmaz.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS, type LegalDocKey } from '../../shared/legalDocs';
import { LEGAL_UPDATED_TR, LEGAL_UPDATED_ISO } from '../../shared/legalVersion';
import { CONSENT_VERSIONS } from '../../services/consentService';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

describe('kayıt kapısı her yazma aksiyonunda', () => {
  const YAZMA = [
    ['views/MatchJoin.tsx', 'maça katıl / yedek ol'],
    ['views/PitchDiscovery.tsx', 'saha kaporası'],
    ['views/MatchCreate.tsx', 'maç yayınla'],
    ['views/PaymentScreen.tsx', 'ödeme'],
  ] as const;

  it.each(YAZMA)('%s — kapı var (%s)', (yol) => {
    expect(oku(yol)).toContain('setIsSignupGateOpen(true)');
  });

  it('MatchJoin\'in üç yazma yolu da ortak kapıdan geçiyor', () => {
    const s = oku('views/MatchJoin.tsx');
    expect(s).toContain('const requireAccount = (): boolean => {');
    // handleBuySlots (ücretli + ücretsiz dal) ve handleJoinAsReserve
    expect(s.match(/if \(!requireAccount\(\)\) return;/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('maç yayınlama kapısı SON anda — form kaybolmuyor', () => {
    // Karar 12a: misafir formu doldurabilsin, kaydolunca devam etsin.
    const s = oku('views/MatchCreate.tsx');
    const publish = s.slice(s.indexOf('const publish = useCallback'));
    expect(publish.slice(0, 900)).toContain("s.setPendingIntent('MATCH_CREATE')");
  });

  it('yanlış yorum kalmadı — store.joinMatch diye bir eylem yok', () => {
    const s = oku('views/MatchJoin.tsx');
    expect(s).not.toContain('store.joinMatch içindeki kayıt kapısına takılır');
  });
});

describe('niyet saklanıyor ve tüketiliyor', () => {
  it('store niyet API\'sini sunuyor', () => {
    const s = oku('store.ts');
    for (const parca of ['pendingIntent', 'setPendingIntent', 'consumePendingIntent']) {
      expect(s, parca).toContain(parca);
    }
  });

  it('OAuth yönlendirmesinde hayatta kalıyor — localStorage', () => {
    const s = oku('store.ts');
    expect(s).toContain("const PENDING_INTENT_KEY = 'oyna.pendingIntent';");
    expect(s).toContain('localStorage.setItem(PENDING_INTENT_KEY');
    expect(s).toContain('localStorage.getItem(PENDING_INTENT_KEY)');
  });

  it('bayat niyet kullanıcıyı beklemediği ekrana atmıyor', () => {
    const s = oku('store.ts');
    expect(s).toContain('PENDING_INTENT_MAX_AGE_MS = 30 * 60 * 1000');
    expect(s).toContain('Date.now() - rec.ts > PENDING_INTENT_MAX_AGE_MS');
  });

  it('niyet TEK seferlik — tüketilince siliniyor', () => {
    const s = oku('store.ts');
    const govde = s.slice(s.indexOf('consumePendingIntent: ()'), s.indexOf('authStartMode: null'));
    expect(govde).toContain('localStorage.removeItem(PENDING_INTENT_KEY)');
    expect(govde).toContain('set({ pendingIntent: null })');
  });

  it('yalnız OYUNCU açılışında uygulanıyor', () => {
    // Tesis sahibi hesabıyla giren biri oyuncu maç lobisine bırakılmaz.
    const s = oku('App.tsx');
    expect(s).toContain('if (landingRole !== UserRole.PLAYER) return null;');
  });

  it('hem giriş hem onboarding sonrası tüketiliyor', () => {
    const s = oku('App.tsx');
    // Giriş yönlendirmesi ve onboarding tamamlanması — iki ayrı çağrı.
    expect(s.match(/await niyetiTuket\(/g)?.length).toBe(2);
  });

  it('maç bulunamazsa normal yönlendirmeye düşüyor', () => {
    const s = oku('App.tsx');
    const govde = s.slice(s.indexOf('const niyetiTuket'), s.indexOf('// Bekleme ekranı'));
    expect(govde).toContain('else return null;');
    expect(govde).toContain('catch { return null; }');
  });
});

describe('sessiz pasiflik yok', () => {
  const auth = oku('views/AuthScreen.tsx');

  it('giriş düğmeleri onay eksikken de CANLI görünüyor', () => {
    // Eskiden zemin rgba(255,255,255,.05), metin rgba(255,255,255,.32) idi:
    // buton ölü görünüyor ama neyin eksik olduğunu söylemiyordu.
    expect(auth).not.toContain("{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.32)' }");
    // 23 Ağu 2026: telefon CTA'sı silindi, geriye Apple/Google düğmeleri kaldı.
    // İkisi de YALNIZ yükleme sırasında kilitlenir — onay kutusuna göre değil.
    const kilitler = auth.split('\n').filter((l) => /disabled=\{/.test(l));
    expect(kilitler.length).toBeGreaterThan(0);
    for (const l of kilitler) expect(l, `sessiz pasiflik: ${l.trim()}`).toContain('busy');
  });

  it('hiçbir handler sessizce dönmüyor — eksik olan söyleniyor', () => {
    // Tek giriş yolu kaldı: Apple · Google (23 Ağu 2026). Telefon/kod ve demo
    // yolları koddan silindi; e-posta + şifre 17 Ağu'da silinmişti. İkinci
    // turda iki sağlayıcı tek işleyicide birleşti (girisBaslat) ve onay artık
    // dokunuşu İPTAL ETMİYOR — onay sayfasına dönüşüyor (bkz. tekGirisYolu).
    const i = auth.indexOf('const girisBaslat = async');
    expect(i, 'girisBaslat').toBeGreaterThan(0);
    const bas = auth.slice(i, i + 900);
    expect(bas, 'girisBaslat: hata sessiz geçiliyor').toContain('setError(');
    expect(bas, 'girisBaslat: sakin durum satırı yok').toContain('setBilgi(');
    // Onay kapısı: dokunuş sarmalayıcısında ve İPTAL değil, ONAY sayfası.
    const d = auth.indexOf('const saglayiciyaDokun');
    expect(d, 'saglayiciyaDokun').toBeGreaterThan(0);
    expect(auth.slice(d, d + 400)).toContain('setOnayIstenen(saglayici)');
  });

  it('pasiflik hesapları "agreed"e bağlı değil', () => {
    const ihlal = auth.split('\n').filter(l => /disabled=/.test(l) && /!agreed/.test(l));
    expect(ihlal, 'onay kutusu butonu sessizce öldürüyor').toEqual([]);
  });

  it('hata metni ekran okuyucuya duyuruluyor', () => {
    // Tek ekran, tek hata satırı kaldı (kod doğrulama ekranı 23 Ağu'da silindi).
    expect(auth.match(/role="alert" aria-live="assertive"/g)?.length).toBeGreaterThanOrEqual(1);
  });
});

describe('misafir modu kapatıldı (17 Ağu 2026 kurucu kararı)', () => {
  it('giriş ekranında "önce göz at" yolu YOK', () => {
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).not.toContain('id="guest-login-button"');
    expect(auth).not.toContain('ÖNCE MAÇLARA GÖZ AT');
    expect(auth).not.toContain('const handleGuestLogin');
  });

  it('hiçbir ekran misafir modunu AÇMIYOR', () => {
    // setIsGuest(true) tek bir yerde bile kalırsa kapı yeniden açılır.
    for (const f of ['views/AuthScreen.tsx', 'components/common/SignupGate.tsx', 'App.tsx']) {
      expect(oku(f), f).not.toContain('setIsGuest(true)');
    }
  });
});

describe('yasal metin tek kaynak', () => {
  it('özet metinler SİLİNDİ — onay anında tam belge var (karar 7b)', () => {
    const modal = oku('components/common/LegalModal.tsx');
    expect(modal).not.toContain('KVKK_TEXT');
    expect(modal).not.toContain('SOZLESME_TEXT');
    expect(modal).toContain("from '../../shared/legalDocs'");
    expect(modal).toContain('{doc.body}');
  });

  it('AuthScreen yasal EKRANI import etmiyor — paket şişmesin', () => {
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).not.toMatch(/from '\.\/LegalScreen'/);
  });

  it('belge metni giriş paketine girmiyor — modal tembel yükleniyor', () => {
    // Ölçüldü: statik import'ta main 101 → 140 KB (39 KB yasal metin, belgeyi
    // hiç açmayan kullanıcı da indiriyordu). Tembel yüklemede main 100 KB
    // kalıyor ve metin kendi parçasında dokununca geliyor.
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).toContain("lazy(() =>\n  import('../components/common/LegalModal')");
    expect(auth).toContain("import type { LegalModalKind }");
    expect(auth).toContain('<Suspense fallback={null}>');
    // Statik değer import'u geri gelirse metin yine main'e düşer.
    expect(auth).not.toMatch(/^import \{ LegalModal[,\s}]/m);
  });

  it('LegalScreen de aynı kaynaktan okuyor — ikinci kopya yok', () => {
    const legal = oku('views/LegalScreen.tsx');
    expect(legal).toContain("from '../shared/legalDocs'");
    expect(legal).not.toMatch(/^const DOCS: Record</m);
  });

  it('belgeler gerçekten dolu (özet değil)', () => {
    // Sayı yerine KÜMEYİ yazıyoruz: "9 tane var" iddiası, bir belge silinip
    // yerine başkası eklendiğinde sessizce yeşil kalırdı.
    // HESAP_SILME 24 Ağu 2026'da eklendi — metin repoda ve web'de vardı ama
    // uygulama içi yasal ekranda yoktu; iki mağaza da hesap silmenin uygulama
    // İÇİNDEN anlatılmasını şart koşar.
    const beklenen = ['TERMS', 'TOPLULUK', 'PRIVACY', 'KVKK', 'RIZA', 'VELI',
                      'CEREZ', 'SALES', 'HESAP_SILME'].sort();
    const anahtarlar = (Object.keys(DOCS) as LegalDocKey[]).sort();
    expect(anahtarlar).toEqual(beklenen);
    for (const k of anahtarlar) {
      expect(DOCS[k].body.length, `${k} çok kısa`).toBeGreaterThan(500);
      expect(DOCS[k].body, `${k} tarihsiz`).toContain(LEGAL_UPDATED_TR);
    }
  });

  it('onay kartından açılan ÜÇ belge de gerçek belge', () => {
    // PRIVACY 24 Ağu 2026'da eklendi: Apple gizlilik politikasının uygulama
    // İÇİNDEN erişilebilir olmasını şart koşar ve kayıt ekranı o ana kadar
    // yalnız KVKK+TERMS açabiliyordu (LegalModal tipi öyle daraltılmıştı).
    for (const k of ['KVKK', 'TERMS', 'PRIVACY'] as const) {
      expect(DOCS[k]).toBeDefined();
      expect(DOCS[k].title.length).toBeGreaterThan(3);
    }
  });

  it('ÜÇ ROLÜN DE yasal ekrana bir yolu var', () => {
    // 24 Ağu 2026'ya kadar yalnız OYUNCU ayarlarında yasal bağlantı vardı.
    // Kaleci/hakem (ServiceSettings) ve tesis sahibi (OwnerMenuView) sözleşmelere,
    // gizlilik politikasına ve hesap silme bilgilendirmesine uygulama içinden
    // HİÇ ulaşamıyordu. Apple, gizlilik politikasının uygulama İÇİNDEN
    // erişilebilir olmasını HER kullanıcı için şart koşar; dahası o rollere
    // ait sözleşmeler de tam o ekranda gösteriliyor.
    const yollar: [string, RegExp][] = [
      ['views/SettingsScreen.tsx', /onNavigate\('LEGAL'\)/],
      ['views/ServiceSettings.tsx', /navigateTo\('LEGAL'\)/],
      ['views/owner/menu/OwnerMenuView.tsx', /onNavigate\('LEGAL'\)/],
    ];
    for (const [dosya, desen] of yollar) {
      expect(oku(dosya), `${dosya}: yasal ekrana yol yok`).toMatch(desen);
    }
  });

  it('sağlayıcı ayarlarında yasal bağlantı KATLANABİLİR kartın içinde değil', () => {
    // İlk denemede "Destek" kartının içine konmuştu; o kart varsayılan KAPALI
    // olduğu için bağlantı ekranda hiç görünmüyordu. Erişilebilir olması
    // gereken bir belgeyi açılıp kapanan bir bölmeye gömmek erişilebilir
    // kılmak değildir — canlı sürüşte de tam olarak bulunamadı.
    const s = oku('views/ServiceSettings.tsx');
    const i = s.indexOf("navigateTo('LEGAL')");
    expect(i, 'yasal bağlantı yok').toBeGreaterThan(-1);
    // Bağlantıdan ÖNCEKİ en yakın SectionCard kapanmış olmalı: yani araya
    // </SectionCard> girmiş olmalı ki bağlantı kartın DIŞINDA kalsın.
    const oncesi = s.slice(0, i);
    expect(
      oncesi.lastIndexOf('</SectionCard>'),
      'yasal bağlantı bir SectionCard içinde kalmış (kapalıyken görünmez)',
    ).toBeGreaterThan(oncesi.lastIndexOf('<SectionCard'));
  });

  it('rol sözleşmeleri "bilgi amaçlı örnek" damgası TAŞIYOR', () => {
    // Kaynak markdown'lar kendilerini TASLAK ilan ediyor ve "imza öncesinde
    // lisanslı bir avukat tarafından onaylanmalıdır" diyor; imza alanları da
    // doldurulmamış ([AD SOYAD], [IBAN], B2B'de komisyonda [X]). Damgasız
    // gösterilirse bağlayıcı bir sözleşme izlenimi verir — kaynak dosyanın
    // kendi notunun yasakladığı şey budur. Kurucu kararı (24 Ağu 2026):
    // eklensin ama BAŞINDA damga olsun.
    const rol = oku('shared/legalDocsRol.ts');
    for (const anahtar of ['SAGLAYICI', 'ISLETME']) {
      expect(rol, `${anahtar} yok`).toContain(`${anahtar}: {`);
    }
    // Damga her iki belgenin de İÇİNDE (ayrı bir arayüz öğesi değil): belge
    // başka bir yerde gösterilse de damga metinle birlikte gider.
    expect(rol.match(/BU METİN BİLGİ AMAÇLI ÖRNEKTİR — BAĞLAYICI DEĞİLDİR/g)?.length).toBe(2);
  });

  it('rol sözleşmelerine ŞİRKETİN İÇ NOTLARI sızmıyor', () => {
    // Üreticide `>` blokları varsayılan GİZLİ; bu test o kuralın çıktıda
    // gerçekten tuttuğunu doğrular. Sızarsa kullanıcı "bu sözleşme henüz
    // avukat onayından geçmedi" cümlesini okur.
    const rol = oku('shared/legalDocsRol.ts');
    for (const iz of ['Durum:', 'Uygulandığı yer:', 'adversarial', 'bir iş kararıdır',
                      'lisanslı bir avukat']) {
      expect(rol, `iç not sızdı: "${iz}"`).not.toContain(iz);
    }
  });

  it('rol sözleşmeleri AYRI modülde — oyuncu paketine girmiyor', () => {
    // 60 KB'lık iki sözleşme shared/legalDocs.ts'e konsaydı giriş ekranının
    // tembel yüklediği yasal paket o kadar büyürdü; oyuncuların neredeyse
    // hiçbiri bu belgeleri açmaz.
    expect(oku('shared/legalDocs.ts')).not.toContain('legalDocsRol');
    const ekran = oku('views/LegalScreen.tsx');
    // Statik değil, DİNAMİK import olmalı.
    expect(ekran).toContain("import('../shared/legalDocsRol')");
    expect(ekran).not.toMatch(/^import \{[^}]*ROL_BELGELERI[^}]*\} from/m);
  });

  it('yasal ekran TÜM belgeleri listeler — hiçbiri ulaşılamaz kalmaz', () => {
    // Bir belge DOCS'a eklenip ORDER'a eklenmezse uygulamada GÖRÜNMEZ olur:
    // HESAP_SILME'nin 24 Ağustos'a kadarki durumu tam olarak buydu.
    const ekran = readFileSync(join(process.cwd(), 'views/LegalScreen.tsx'), 'utf8');
    const sira = ekran.match(/const ORDER: LegalDocKey\[\] = \[([^\]]*)\]/);
    expect(sira, 'LegalScreen ORDER listesi bulunamadı').not.toBeNull();
    for (const k of Object.keys(DOCS)) {
      expect(sira![1], `${k} yasal ekranda listelenmiyor`).toContain(`'${k}'`);
    }
  });
});

describe('belge adı tek', () => {
  it('"Kullanıcı Sözleşmesi" adı arayüzden kalktı', () => {
    const s = oku('views/AuthScreen.tsx');
    expect(s).not.toContain('Kullanıcı Sözleşmesi');
  });

  it('kullanılan ad, yasal ekrandaki gerçek belge adı', () => {
    expect(DOCS.TERMS.title).toBe('Kullanım Şartları');
    expect(oku('views/AuthScreen.tsx')).toContain('Kullanım Şartları');
  });
});

describe('rıza sürüm damgası belgeyle aynı kaynaktan', () => {
  it('elle yazılmış eski tarihler kalmadı', () => {
    const s = oku('services/consentService.ts');
    expect(s).not.toMatch(/'2026-07-1[234]'/);
    expect(s).toContain('LEGAL_UPDATED_ISO');
  });

  it('her belge aynı damgayı taşıyor', () => {
    for (const [k, v] of Object.entries(CONSENT_VERSIONS)) {
      expect(v, k).toBe(LEGAL_UPDATED_ISO);
    }
  });

  it('iki biçim aynı günü gösteriyor', () => {
    const [g, a, y] = LEGAL_UPDATED_TR.split('.');
    expect(`${y}-${a}-${g}`).toBe(LEGAL_UPDATED_ISO);
  });
});

describe('splash oturum çözülmeden dokunuşu yutmuyor', () => {
  const s = oku('views/SplashScreen.tsx');

  it('koşulsuz onClick kalmadı', () => {
    expect(s).not.toContain('onClick={onStart}');
    expect(s).toContain('onClick={canStart ? onStart : undefined}');
  });

  it('ağ takılırsa kullanıcı hapsolmuyor', () => {
    expect(s).toContain('setTimedOut(true), 6000');
    expect(s).toContain('const canStart = ready || timedOut;');
  });

  it('ne beklendiği yazıyor ama hızlı bağlantıda yanıp sönmüyor', () => {
    expect(s).toContain('Oturum kontrol ediliyor…');
    expect(s).toContain('setBekleyenGoster(true), 1000');
  });
});

describe('telefon girişi — uygulamadan tümüyle silindi (23 Ağu 2026)', () => {
  const s = oku('supabaseAuth.ts');

  it('telefon giriş/doğrulama uçlarının HİÇBİRİ dışa açık değil', () => {
    // 22 Ağu ölçümü: SMS kancası kapalı, sağlayıcı yok, telefonla girişi
    // tamamlamış tek kullanıcı yok — yani bu uçlar hiç çalışmadı. Ekranları
    // silinince arkalarında bırakmak, "bir gün geri açarız" diye duran ölü
    // yüzey olurdu; Apple 5.6 tam olarak böyle bir yüzeyden çıktı.
    for (const ad of ['loginWithPhone', 'sendPhoneOtp', 'verifyPhoneOtp',
                      'requestPhoneLink', 'confirmPhoneLink']) {
      expect(s, `${ad} hâlâ dışa açık`).not.toContain(`export const ${ad}`);
    }
    expect(s).not.toMatch(/export const verifyOtp\b/);
  });

  it('neden silindiği ve geri geleceği gün kayıtlı', () => {
    expect(s).toContain('hook_send_sms_enabled=false');
    expect(s).toContain('git history');
  });
});

describe('kapı — davet, uyarı değil', () => {
  const s = oku('components/common/SignupGate.tsx');

  it('sarı dolgu birincil buton kalmadı', () => {
    // Tasarım sistemi 5.1.4: #FACC15 ↔ #39FF14 kontrastı 1,13:1.
    expect(s).not.toContain('bg-[#FACC15]');
    expect(s).toContain('bg-[#39FF14] text-[#0A0E14]');
  });

  it('hesabı olan kullanıcı kayıt formuna düşmüyor', () => {
    expect(s).toContain("go('login')");
    expect(s).toContain('Zaten hesabım var — giriş yap');
    expect(s).toContain('setAuthStartMode');
  });

  it('AuthScreen kapıdan gelen modu TEMİZLİYOR', () => {
    // Kayıt/giriş ayrımı kalktığı için mod artık ekranı değiştirmiyor; yine de
    // bayrak okunup temizlenmeli ki sonraki açılış eski bir niyetle gelmesin.
    const a = oku('views/AuthScreen.tsx');
    expect(a).toContain('setAuthStartMode(null)');
  });

  it('tutamayacağı söz verilmiyor', () => {
    // Gerçek yol kayıt → onboarding → özet; "30 saniye" yalandı.
    expect(s).not.toContain('30 saniyeni alır');
  });

  it('metin butonları 44px dokunma hedefi', () => {
    expect(s.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('paylaşılan yasal modüller yerinde', () => {
  it.each(['shared/legalDocs.ts', 'shared/legalVersion.ts'])('%s var', (y) => {
    expect(existsSync(join(KOK, y))).toBe(true);
  });
});
