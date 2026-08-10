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

  it('birincil buton form eksikken de canlı görünüyor', () => {
    // Eskiden zemin rgba(255,255,255,.05), metin rgba(255,255,255,.32) idi:
    // buton ölü görünüyor ama neyin eksik olduğunu söylemiyordu.
    expect(auth).not.toContain("{ background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.32)' }");
    const govde = auth.slice(auth.indexOf('const ctaStyle'), auth.indexOf('const spinner'));
    expect(govde).toContain('background: ctaGradient');
  });

  it('hiçbir handler sessizce dönmüyor — eksik olan söyleniyor', () => {
    for (const h of ['handleSendOtp', 'handlePasswordLogin', 'handleRegister']) {
      const i = auth.indexOf(`const ${h} = async`);
      expect(i, h).toBeGreaterThan(0);
      const bas = auth.slice(i, i + 700);
      expect(bas, `${h}: eksik alanı söylemiyor`).toContain('setError(');
      expect(bas, `${h}: rıza kontrolü yok`).toContain('requireAgreement()');
    }
  });

  it('pasiflik hesapları "agreed"e bağlı değil', () => {
    const ihlal = auth.split('\n').filter(l => /disabled=/.test(l) && /!agreed/.test(l));
    expect(ihlal, 'onay kutusu butonu sessizce öldürüyor').toEqual([]);
  });

  it('hata metni ekran okuyucuya duyuruluyor', () => {
    expect(auth.match(/role="alert" aria-live="assertive"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('misafir gezinme rıza istemiyor', () => {
  it('"ÖNCE MAÇLARA GÖZ AT" onaysız da çalışıyor', () => {
    // Karar 6a: gezinme yazma eylemi değil, sunucuya rıza kaydı gitmiyor.
    const auth = oku('views/AuthScreen.tsx');
    const i = auth.indexOf('id="guest-login-button"');
    expect(i).toBeGreaterThan(0);
    expect(auth.slice(i, i + 500)).not.toContain('!agreed');
  });

  it('misafir girişi sunucuya rıza yazmıyor', () => {
    const auth = oku('views/AuthScreen.tsx');
    const i = auth.indexOf('const handleGuestLogin');
    expect(auth.slice(i, i + 500)).not.toContain('recordUserConsent');
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
    const anahtarlar = Object.keys(DOCS) as LegalDocKey[];
    expect(anahtarlar.length).toBe(8);
    for (const k of anahtarlar) {
      expect(DOCS[k].body.length, `${k} çok kısa`).toBeGreaterThan(500);
      expect(DOCS[k].body, `${k} tarihsiz`).toContain(LEGAL_UPDATED_TR);
    }
  });

  it('onay kutusundan açılan iki belge de gerçek belge', () => {
    for (const k of ['KVKK', 'TERMS'] as const) {
      expect(DOCS[k]).toBeDefined();
      expect(DOCS[k].title.length).toBeGreaterThan(3);
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

describe('telefon girişi — ölü kod temizlendi, ekran yazılmadı', () => {
  const s = oku('supabaseAuth.ts');

  it('paralel ölü telefon çifti silindi', () => {
    expect(s).not.toContain('export const loginWithPhone');
    expect(s).not.toMatch(/export const verifyOtp\b/);
  });

  it('gerçek çift duruyor — sağlayıcı açılınca hazır', () => {
    expect(s).toContain('export const sendPhoneOtp');
    expect(s).toContain('export const verifyPhoneOtp');
  });

  it('neden ekran yazılmadığı kayıtlı', () => {
    // Supabase Phone sağlayıcısının durumu repodan doğrulanamıyor; test
    // edilemeyecek ekran yazılmadı (kullanıcı kararı 10a).
    expect(s).toContain('kullanıcı kararı 10a');
  });
});

describe('kapı — davet, uyarı değil', () => {
  const s = oku('components/common/SignupGate.tsx');

  it('sarı dolgu birincil buton kalmadı', () => {
    // Tasarım sistemi 5.1.4: #FACC15 ↔ #39FF14 kontrastı 1,13:1.
    // Renkler token'a taşındı: #FACC15→warning, #39FF14→primary,
    // #0A0E14→on-primary (değerler birebir aynı). Eski hex yazımı da
    // yasaklı kalsın ki geri sızmasın.
    expect(s).not.toContain('bg-[#FACC15]');
    expect(s).not.toContain('bg-warning');
    expect(s).toContain('bg-primary text-on-primary');
  });

  it('hesabı olan kullanıcı kayıt formuna düşmüyor', () => {
    expect(s).toContain("go('login')");
    expect(s).toContain('Zaten hesabım var — giriş yap');
    expect(s).toContain('setAuthStartMode');
  });

  it('AuthScreen kapıdan gelen modu okuyor ve temizliyor', () => {
    const a = oku('views/AuthScreen.tsx');
    expect(a).toContain('const zorlanan = useAppStore.getState().authStartMode;');
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
