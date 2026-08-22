import React, { useEffect, useState } from 'react';
import { ArrowRight, Phone, ShieldCheck } from 'lucide-react';
import { requestPhoneLink, confirmPhoneLink, logout } from '../supabaseAuth';
import {
  DEFAULT_DIAL_CODE, checkPhone, formatPhoneInput, formatPhoneDisplay,
  canSendOtpTo, otpKapaliSebebi,
} from '../shared/phone';
import { mapAuthError } from '../utils/errorMap';
import { useKlavyeOrtusu, klavyeliAltDolgu } from '../components/common/Toast';
import { AUTH_FIELD_CSS } from './authFieldStyles';

/**
 * NUMARANI BAĞLA — iki bağlamda açılır, İKİSİNDE DE ÇIKIŞI VAR
 *
 * Kurucu kararı (17 Ağustos 2026): telefon ana giriş yöntemidir; sebep ürünün
 * kendisinde — tesis sahibi rezervasyon sahibine, kaptan kalecisine numaradan
 * ulaşır. Numarası olmayan hesap, maçın ortasında sessiz bir boşluk demektir.
 *
 * ZORUNLULUK KALKTI (22 Ağustos 2026 — Apple 5.6 reddi). Bu ekran atlanamaz
 * bir duvardı ve SMS yalnız +90 numaralara gidiyor: yurt dışındaki kullanıcı
 * uygulamayı hiç açamıyordu. Artık iki bağlamı var:
 *
 *   • gerekce="giris"  → girişten hemen sonra. ATLANABİLİR; "ŞİMDİLİK ATLA"
 *     kullanıcıyı uygulamaya bırakır ve bir daha açılışta zorlanmaz.
 *   • gerekce="odeme"  → para ödenen / tesise taahhüt veren işin tam
 *     ortasında. Burada numara GEREKLİ — ama ekran yine kapatılabilir:
 *     "VAZGEÇ" işi bırakıp kullanıcıyı geri götürür, kilitlemez.
 *
 * KİMDEN HİÇ İSTENMEZ: eski e-posta hesapları (17 Ağu öncesi kayıtlar).
 * Kapının ölçüsü App.tsx'te (numaraGerekli).
 */

interface PhoneLinkScreenProps {
  /** Numara doğrulandı — App yönlendirmeyi devralır. */
  onLinked: () => void;
  /** Kullanıcı bu adımı geçti (atladı ya da vazgeçti) — App yönlendirir. */
  onSkip: () => void;
  /** Ekran neden açıldı? Metni ve atlama düğmesinin anlamını belirler. */
  gerekce?: 'giris' | 'odeme';
}

const PhoneLinkScreen: React.FC<PhoneLinkScreenProps> = ({ onLinked, onSkip, gerekce = 'giris' }) => {
  const [dial, setDial] = useState(DEFAULT_DIAL_CODE);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const klavyeOrtusu = useKlavyeOrtusu();

  const check = checkPhone(phone, dial);
  const kanalKapali = !!dial && !canSendOtpTo(dial);
  const odemeIcin = gerekce === 'odeme';

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const gonder = async () => {
    if (busy) return;
    if (!check.valid) { setError(check.reason ?? 'Telefon numaranı gir.'); return; }
    if (kanalKapali) {
      setError(otpKapaliSebebi(dial) ?? 'Şu an bu numaraya kod gönderemiyoruz.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await requestPhoneLink(check.e164!);
      setStage('code');
      setOtp('');
      setResendIn(60);
    } catch (err) {
      // En sık sebep: numara başka bir hesapta kayıtlı. Dürüstçe söyle.
      const m = String((err as { message?: string })?.message ?? '').toLowerCase();
      setError(m.includes('already') || m.includes('registered') || m.includes('exists')
        ? 'Bu numara başka bir hesapta kayıtlı. Farklı bir numara dene ya da o hesapla giriş yap.'
        : mapAuthError(err, 'Kod gönderilemedi. Lütfen tekrar dene.'));
    } finally {
      setBusy(false);
    }
  };

  const dogrula = async () => {
    if (busy || otp.length < 6) return;
    setError(null);
    setBusy(true);
    try {
      await confirmPhoneLink(check.e164!, otp);
      onLinked();
    } catch (err) {
      setError(mapAuthError(err, 'Kod hatalı veya süresi dolmuş.'));
      setBusy(false);
    }
  };

  const spinner = <span className="au-spin" aria-hidden="true" />;

  return (
    <div lang="tr" className="fixed inset-0 bg-[#0A0E14] flex flex-col font-sans overflow-hidden"
      style={{ ['--au-accent' as string]: '#FACC15', ['--au-accent-soft' as string]: '#FACC1524' } as React.CSSProperties}
    >
      <style>{AUTH_FIELD_CSS}</style>
      <div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col"
        style={{
          padding: '0 24px',
          paddingTop: 'calc(var(--safe-top, 0px) + 48px)',
          paddingBottom: klavyeliAltDolgu(klavyeOrtusu, 26),
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 62, height: 62, borderRadius: 20, marginBottom: 22,
            background: 'rgba(250,204,21,.1)', border: '1px solid rgba(250,204,21,.25)', color: '#FACC15',
          }}
        >
          {stage === 'phone' ? <Phone size={26} /> : <ShieldCheck size={26} />}
        </div>

        <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.12, fontWeight: 800, letterSpacing: '-.035em', color: '#fff' }}>
          {stage === 'code'
            ? 'Numaranı doğrula'
            : (odemeIcin ? 'Numaran gerekiyor' : 'Numaranı ekle')}
        </h1>
        <p style={{ margin: '10px 0 26px', fontSize: 14, lineHeight: 1.55, fontWeight: 500, color: '#8B949E' }}>
          {stage === 'code'
            ? `${formatPhoneDisplay(check.e164)} numarasına gönderdiğimiz 6 haneli kodu gir.`
            : (odemeIcin
              // Tam ihtiyaç anı: gerekçe SOMUT, o yüzden burada isteniyor.
              ? 'Yerini ayırmadan önce numaranı doğrulamamız gerekiyor: maç günü tesis ve kaptan sana bu numaradan ulaşacak.'
              // Girişte: isteğe bağlı olduğu AÇIKÇA yazılır — kapalı bir kapı
              // gibi görünmesin, kullanıcı atlayabileceğini bilsin.
              : 'Maç günü tesis ve kaptan sana bu numaradan ulaşacak. İstersen şimdi ekle, istersen sonra — yerini ayırırken yeniden soracağız.')}
        </p>

        {stage === 'phone' ? (
          <div>
            <label className="au-label" htmlFor="pl-phone">Telefon numaran</label>
            <div className="au-field">
              <Phone size={19} color="#6b7280" style={{ flexShrink: 0 }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <span style={{ color: '#6b7280', fontSize: 16, fontWeight: 600 }}>+</span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Ülke kodu"
                  value={dial}
                  onChange={(e) => { setDial(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null); }}
                  style={{
                    width: `${Math.max(dial.length, 2)}ch`, minWidth: '2ch', background: 'transparent',
                    border: 'none', outline: 'none', color: '#fff', fontSize: 16, fontWeight: 600,
                  }}
                />
              </span>
              <span aria-hidden="true" style={{ width: 1, height: 22, background: 'rgba(255,255,255,.1)', flexShrink: 0 }} />
              <input
                id="pl-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                className="au-input"
                placeholder="532 123 45 67"
                aria-label="Telefon numarası"
                value={phone}
                autoFocus
                onChange={(e) => { setPhone(formatPhoneInput(e.target.value, dial)); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void gonder(); }}
              />
            </div>
            {kanalKapali && (
              <p style={{ margin: '6px 2px 0', fontSize: 10, fontWeight: 700, color: '#FBBF24' }}>
                {otpKapaliSebebi(dial)}
              </p>
            )}
          </div>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              aria-label="6 haneli doğrulama kodu"
              value={otp}
              autoFocus
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              style={{
                width: '100%', height: 64, boxSizing: 'border-box', borderRadius: 20,
                background: '#0A0E14', border: '1px solid #1f2937', outline: 'none', textAlign: 'center',
                color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: '.5em', textIndent: '.5em',
              }}
            />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              {resendIn > 0 ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8B949E' }}>Kodu tekrar gönder ({resendIn}s)</span>
              ) : (
                <button type="button" className="au-link" onClick={gonder} disabled={busy} style={{ fontSize: 11.5, fontWeight: 900, color: '#FACC15' }}>
                  Kodu tekrar gönder
                </button>
              )}
            </div>
          </>
        )}

        {error && (
          <p role="alert" aria-live="assertive" style={{ margin: '13px 2px 0', fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, color: '#FF4D4D' }}>
            {error}
          </p>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            className="au-cta"
            onClick={stage === 'phone' ? gonder : dogrula}
            disabled={busy}
            style={{
              background: 'linear-gradient(120deg, #FACC15 0%, #FFD700 100%)',
              color: '#0A0E14',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.28)',
              opacity: (stage === 'phone' ? check.valid && !kanalKapali : otp.length === 6) ? 1 : 0.72,
            }}
          >
            {busy ? spinner : (
              <>
                <span>{stage === 'phone' ? 'KOD GÖNDER' : 'DOĞRULA'}</span>
                <ArrowRight size={16} strokeWidth={2.8} />
              </>
            )}
          </button>

          {stage === 'code' ? (
            <button type="button" className="au-ghost" onClick={() => { setStage('phone'); setError(null); }} disabled={busy}>
              NUMARAYI DEĞİŞTİR
            </button>
          ) : (
            // ÇIKIŞ HER İKİ BAĞLAMDA DA VAR (22 Ağu 2026). Kapatılamayan ekran
            // hem kullanıcıyı hapseder hem mağaza reddi sebebidir; eskiden tek
            // çıkış "ÇIKIŞ YAP"tı, yani uygulamadan atılmaktı.
            <button type="button" className="au-ghost" onClick={onSkip} disabled={busy}>
              {odemeIcin ? 'VAZGEÇ' : 'ŞİMDİLİK ATLA'}
            </button>
          )}
          {stage === 'phone' && !odemeIcin && (
            <button
              type="button"
              className="au-link"
              onClick={() => { void logout(); }}
              disabled={busy}
              style={{ fontSize: 11, fontWeight: 800, color: '#59636e', letterSpacing: '.06em' }}
            >
              ÇIKIŞ YAP
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PhoneLinkScreen;
