import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  DEFAULT_DIAL_CODE, checkPhone, formatPhoneInput, formatPhoneDisplay,
  canSendOtpTo, otpChannelFor, WHATSAPP_OTP_ENABLED, SMS_OTP_ENABLED,
  TELEFON_GIRISI_ACIK, phoneLast4,
} from '../../shared/phone';

// ═══════════════════════════════════════════════════════════════════════════
// TELEFON BİRİNCİL GİRİŞ — karar kilitleri (kurucu kararı, 17 Ağustos 2026)
//
// Bu dosya bir özellik testi değil, bir KARAR KİLİDİDİR: telefonun ana giriş
// yöntemi olduğu, şifre kavramının kaldırıldığı ve misafir modunun kapandığı
// kararları koda geri sızmaya karşı korur.
// ═══════════════════════════════════════════════════════════════════════════

const KOK = path.resolve(__dirname, '../..');
const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');

describe('numara kuralı — tek kaynak', () => {
  it('varsayılan ülke Türkiye', () => {
    expect(DEFAULT_DIAL_CODE).toBe('90');
  });

  it('geçerli TR cep numarası E.164 döner', () => {
    expect(checkPhone('532 123 45 67').e164).toBe('+905321234567');
  });

  it('kullanıcının başa koyduğu 0 sessizce düzeltilir', () => {
    // "0532…" Türkiye'de en yaygın yazım. Reddetmek yerine anlamak gerekir.
    expect(checkPhone('0532 123 45 67').e164).toBe('+905321234567');
  });

  it('numaranın içine tekrar yazılan ülke kodu yutulur', () => {
    expect(checkPhone('905321234567').e164).toBe('+905321234567');
  });

  it('5 ile başlamayan TR numarası reddedilir ve sebebi söylenir', () => {
    const r = checkPhone('212 123 45 67');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('5 ile başlar');
  });

  it('eksik haneli numara reddedilir', () => {
    expect(checkPhone('532 123').valid).toBe(false);
  });

  it('boş numara sessizce geçmez', () => {
    expect(checkPhone('').valid).toBe(false);
    expect(checkPhone('').reason).toBeTruthy();
  });

  it('yurt dışı numara biçim olarak geçerli olabilir', () => {
    expect(checkPhone('7911123456', '44').e164).toBe('+447911123456');
  });
});

describe('kanal kuralı — yurt dışına SMS YOK', () => {
  it('Türkiye SMS kanalındadır — gönderim bayrağa bağlı', () => {
    // Kanal SEÇİMİ ülkeye göre sabittir; GÖNDEREBİLİYOR OLMAK ayrı bir soru.
    // 22 Ağu 2026'da bu ikisi ayrıldı: Netgsm aboneliği alınmadığı için SMS
    // kanalı kapatıldı ve `canSendOtpTo` artık bayrağı okuyor. Kanal eşlemesi
    // yine de doğru kalmalı — bayrak açıldığı gün TR yolu SMS'ten gitmeli.
    expect(otpChannelFor('90')).toBe('SMS');
    expect(canSendOtpTo('90')).toBe(SMS_OTP_ENABLED);
  });

  it('yurt dışı WhatsApp kanalındadır ve bugün KAPALIDIR', () => {
    expect(otpChannelFor('44')).toBe('WHATSAPP');
    expect(WHATSAPP_OTP_ENABLED).toBe(false);
    expect(canSendOtpTo('44')).toBe(false);
  });

  /**
   * SMS KAPALI — VE EKRAN BUNU BİLİYOR (22 Ağustos 2026, kurucu kararı)
   *
   * Canlı yapılandırma denetlendi: Send SMS Hook kapalı, sms_provider "twilio"
   * ama Twilio hesabı yok, send-sms fonksiyonu HOOK_NOT_CONFIGURED dönüyor ve
   * auth.users'da telefonla giriş TAMAMLAMIŞ tek kullanıcı yok. Yani telefon
   * yolu hiç çalışmadı. Netgsm aboneliği sonraki sürüme bırakıldı.
   *
   * Çalışmayan bir giriş alanını ekranda bırakmak, kullanıcıya "Doğrulama kodu
   * gönderilemedi"den başka bir şey vermez — App Store'da doğrudan ret sebebi
   * (Kural 2.1). Bu blok, bayrakla ekranın AYNI şeyi söylediğini kilitler.
   */
  it('bayrak kapalıyken ekranlar telefon yolunu hiç kurmuyor', () => {
    expect(TELEFON_GIRISI_ACIK).toBe(SMS_OTP_ENABLED || WHATSAPP_OTP_ENABLED);

    const auth = oku('views/AuthScreen.tsx');
    // Numara alanı, ayraç ve KOD GÖNDER düğmesi aynı kapıdan geçer.
    expect(auth).toContain('const telefonYoluVar = TELEFON_GIRISI_ACIK || demoMode');
    expect((auth.match(/\{telefonYoluVar && \(/g) ?? []).length).toBeGreaterThanOrEqual(3);

    // Açılıştaki numara kapısı da bayrağı okur; kod gidemeyen bir ekrana
    // kimse yönlendirilmez.
    const app = oku('App.tsx');
    expect(app).toContain('const numaraGerekli = TELEFON_GIRISI_ACIK');

    // ÖDEME KAPISI EN KRİTİĞİ: numara doğrulanamazken bu kapı açık kalsaydı
    // HİÇ KİMSE ödeme yapamazdı — uygulamanın ana işi çalışmaz hâle gelirdi.
    const pay = oku('views/PaymentScreen.tsx');
    expect(pay).toContain('if (TELEFON_GIRISI_ACIK && !auth.currentUser.phoneVerified)');
  });

  it('sunucu tarafı da yurt dışını kapatıyor (arayüze güvenilmez)', () => {
    const f = oku('supabase/functions/send-sms/index.ts');
    expect(f).toContain("Deno.env.get('WHATSAPP_ENABLED') === 'true'");
    expect(f).toContain('CHANNEL_UNAVAILABLE');
  });
});

describe('biçimlendirme', () => {
  it('yazarken gruplanır', () => {
    expect(formatPhoneInput('5321234567')).toBe('532 123 45 67');
  });

  it('gösterimde ülke kodu ile yazılır', () => {
    expect(formatPhoneDisplay('+905321234567')).toBe('+90 532 123 45 67');
  });

  it('son dört hane maskeleme için ayrı çıkar', () => {
    expect(phoneLast4('+905321234567')).toBe('4567');
  });
});

describe('şifre kavramı kaldırıldı', () => {
  const authService = oku('supabaseAuth.ts');

  it('e-posta + şifre giriş/kayıt yolları SİLİNDİ', () => {
    for (const fn of [
      'signInWithEmailPassword', 'signUpWithPassword',
      'requestPasswordReset', 'confirmPasswordReset', 'updateUserPassword',
      'sendEmailOtp', 'verifyEmailOtp',
    ]) {
      expect(authService, `${fn} hâlâ dışa veriliyor`).not.toContain(`export const ${fn}`);
    }
  });

  it('giriş ekranında şifre alanı yok', () => {
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).not.toContain("type=\"password\"");
    expect(auth).not.toContain('Şifremi unuttum');
  });

  it('ayarlarda şifre değiştirme kartı yok', () => {
    const p = oku('components/settings/ProfileInfoPage.tsx');
    expect(p).not.toContain('ŞİFRE DEĞİŞTİR');
    expect(p).not.toContain('handleSavePassword');
  });
});

describe('telefon ana yol, Google/Apple ikincil', () => {
  it('giriş ekranı telefon OTP fonksiyonlarını kullanıyor', () => {
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).toContain('sendPhoneOtp');
    expect(auth).toContain('verifyPhoneOtp');
  });

  it('Google ve Apple butonları duruyor', () => {
    const auth = oku('views/AuthScreen.tsx');
    expect(auth).toContain('handleGoogleLogin');
    expect(auth).toContain('handleAppleLogin');
  });

  it('Google native yola öncelik veriyor, tarayıcı yolu YEDEK kalıyor', () => {
    // Yedeğin silinmesi, istemci kimliği eksik bir derlemede girişi tamamen
    // öldürürdü. İkisi birlikte durmalı.
    expect(authService()).toContain('ensureNativeGoogle');
    expect(authService()).toContain('signInWithIdToken');
    expect(authService()).toContain('skipBrowserRedirect: true');
  });

  it('Google/Apple ile girenden numara isteniyor, eski e-posta hesapları muaf', () => {
    const app = oku('App.tsx');
    expect(app).toContain("user.provider === 'google'");
    expect(app).toContain("user.provider === 'apple'");
    expect(app).toContain('!user.phoneVerified');
    expect(app).toContain("resetNavigation('PHONE_LINK')");
    // 'email' sağlayıcısı kapıda ANILMAMALI — anıldığı an eski hesaplar kilitlenir.
    const kapi = app.slice(app.indexOf('const numaraGerekli'), app.indexOf('const numaraGerekli') + 220);
    expect(kapi).not.toContain("'email'");
  });

  function authService() { return oku('supabaseAuth.ts'); }
});

// ═══════════════════════════════════════════════════════════════════════════
// NUMARA ADIMI DUVAR DEĞİL (22 Ağustos 2026 — Apple 5.6 reddi)
//
// Ekran atlanamıyordu ve SMS yalnız +90 numaralara gidiyor: yurt dışındaki
// kullanıcı — mağaza incelemecisi dahil — uygulamayı hiç açamıyordu. Çözüm
// diye incelemeye özel bir paket derlenmişti; Apple onu "inceleme sırasında
// gizlenmiş özellik" sayıp reddetti. Doğru çözüm burada: engel HERKES için
// kalkar, numara yalnız gerçekten gerektiği anda istenir.
//
// Bu blok o çözümü koruyor. Kırılırsa aynı ret kapıda demektir.
// ═══════════════════════════════════════════════════════════════════════════
describe('numara adımı atlanabilir, ihtiyaç anında istenir', () => {
  const app = () => oku('App.tsx');
  const ekran = () => oku('views/PhoneLinkScreen.tsx');

  it('açılış kapısı "atladım" işaretine bakıyor', () => {
    const a = app();
    const kapi = a.slice(a.indexOf('const numaraGerekli'), a.indexOf('if (numaraGerekli)'));
    expect(kapi).toContain('!numaraAtlandiMi(user.uid)');
  });

  it('numara doğrulanmışsa "atladım" işareti temizleniyor', () => {
    // Kullanıcı ileride numarasını kaldırırsa açılış hatırlatması yeniden
    // çalışmalı; işaret ölümsüz kalırsa bir daha hiç sorulmaz.
    expect(app()).toContain('if (user.phoneVerified) numaraAtlamasiniTemizle(user.uid);');
  });

  it('ekranın çıkış yolu var ve atlama işareti YALNIZ girişte yazılıyor', () => {
    const a = app();
    expect(a).toContain('onSkip=');
    // Ödeme ortasında "atladım" yazılsaydı numara bir daha hiç istenmezdi.
    expect(a).toContain("if (gerekce === 'giris' && uid) numarayiAtla(uid);");
  });

  it('ekran iki bağlamı ayırıyor ve ikisinde de kapanabiliyor', () => {
    const e = ekran();
    expect(e).toContain("gerekce = 'giris'");
    expect(e).toContain("const odemeIcin = gerekce === 'odeme'");
    // Alt düğme her iki bağlamda da ÇIKIŞ verir; eskiden tek yol "ÇIKIŞ YAP",
    // yani uygulamadan atılmaktı.
    expect(e).toContain("{odemeIcin ? 'VAZGEÇ' : 'ŞİMDİLİK ATLA'}");
    expect(e).toContain('onClick={onSkip}');
  });

  it('girişteki metin adımın isteğe bağlı olduğunu SÖYLÜYOR', () => {
    // Yazmazsak kullanıcı yine kapalı kapı sanır ve çıkışı denemez.
    expect(ekran()).toContain('İstersen şimdi ekle, istersen sonra');
  });

  it('ödeme numarasız yapılamıyor — kapı tam ihtiyaç anında', () => {
    const p = oku('views/PaymentScreen.tsx');
    const g = p.slice(p.indexOf('const handlePay'), p.indexOf('idemKeyRef.current = safeUuid()'));
    expect(g).toContain('!auth.currentUser.phoneVerified');
    expect(g).toContain("st.setPhoneGateReason('PAYMENT')");
    // Ödeme BIRAKILMAZ, ertelenir: numara doğrulanınca kullanıcı geri döner.
    expect(g).toContain("st.setPendingIntent('PAYMENT')");
    expect(g).toContain("st.navigateTo('PHONE_LINK')");
  });

  /**
   * TELEFONA BAĞLI ÖZELLİKLER DE KAPANMALI (22 Ağustos 2026).
   *
   * Bayrağı kapatmak tek başına yetmiyor: numaraya DAYANAN özellikler açık
   * kalırsa kullanıcıya çalışmayan vaatler sunuluyor. Denetimde ikisi çıktı.
   */
  it('profil, numarası olmayana çözümü olmayan engel göstermiyor', () => {
    const p = oku('components/settings/ProfileInfoPage.tsx');
    // Eski metin "Numaranı bağlamadan ödeme yapamaz ve maça katılamazsın"
    // diyordu. İKİSİ de yanlıştı: ödeme numarasız çalışıyor ve numara
    // bağlamanın hiçbir yolu yok. İncelemeci bunu "uygulama bozuk" okur.
    expect(p).not.toContain('Numaranı bağlamadan ödeme yapamaz');
    // Kart yalnız numarası OLANA ya da telefon yolu AÇIKKEN çizilir.
    expect(p).toContain('{(identity?.phone || TELEFON_GIRISI_ACIK) && (');
  });

  it('rehber eşleştirme kapalı — karşılığı olmayan izin istenmiyor', () => {
    // Eşleşme numara hash\'ine dayanır (match_contacts → profile_contact_hash).
    // Telefon kapalıyken o tabloya yeni kayıt GİRMEZ; kullanıcıdan tüm
    // rehberini isteyip hiçbir şey döndürmemek olurdu (App Store 5.1.1:
    // ihtiyaç duymadığın veriyi isteme).
    const f = oku('views/social/FriendAddView.tsx');
    expect(f).toContain("import { TELEFON_GIRISI_ACIK } from '../../shared/phone'");
    expect(f).toContain('{TELEFON_GIRISI_ACIK && (');
    // Kart gizlenince ızgara tek sütuna düşmeli — yarısı boş kutu kalmasın.
    expect(f).toContain("TELEFON_GIRISI_ACIK ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-1 gap-2.5'");
  });

  it('atlama işareti kullanıcı bazlı ve depolamasız ortamda çökmüyor', async () => {
    const { numarayiAtla, numaraAtlandiMi, numaraAtlamasiniTemizle } =
      await import('../../shared/numaraKapisi');
    expect(numaraAtlandiMi('u1')).toBe(false);
    numarayiAtla('u1');
    expect(numaraAtlandiMi('u1')).toBe(true);
    // Başka kullanıcı etkilenmez — ortak cihazda biri diğerinin kapısını açamaz.
    expect(numaraAtlandiMi('u2')).toBe(false);
    numaraAtlamasiniTemizle('u1');
    expect(numaraAtlandiMi('u1')).toBe(false);
  });
});

describe('SMS ucu güvenliği', () => {
  const f = oku('supabase/functions/send-sms/index.ts');

  it('imza doğrulaması olmadan çalışmıyor (fail-closed)', () => {
    expect(f).toContain('HOOK_NOT_CONFIGURED');
    expect(f).toContain('INVALID_SIGNATURE');
    expect(f).toContain('verifySignature');
  });

  it('tekrar saldırısına karşı zaman penceresi var', () => {
    expect(f).toContain('age > 300');
  });

  it('imza karşılaştırması sabit süreli', () => {
    expect(f).toContain('timingSafeEqual');
  });

  it('KOD hiçbir dalda loglanmıyor', () => {
    // Loga düşen kod, log okuyabilen herkes için hesap anahtarıdır.
    for (const satir of f.split('\n')) {
      if (!satir.includes('console.')) continue;
      expect(satir, `kod loglanıyor: ${satir.trim()}`).not.toMatch(/\botp\b/);
    }
  });

  it('numara loglarda maskeleniyor', () => {
    expect(f).toContain('maskPhone');
  });
});
