import React, { useState } from 'react';
import { Eye, EyeOff, Check, MailCheck } from 'lucide-react';
import {
  requestPasswordReset, confirmPasswordReset,
  sifreSebebi, epostaGecerliMi, MIN_SIFRE_UZUNLUGU,
} from '../../supabaseAuth';
import { mapAuthError } from '../../utils/errorMap';

// ════════════════════════════════════════════════════════════════════════════
// ŞİFREMİ UNUTTUM — iki adım
// ════════════════════════════════════════════════════════════════════════════
//
// 1) E-posta yazılır → sunucu 6 haneli kod üretir, özetini saklar, e-postayla yollar.
// 2) Kod + yeni şifre yazılır → sunucu kodu doğrular ve şifreyi değiştirir.
//
// NEDEN "GÖNDERİLDİ" DEMİYORUZ, "KAYITLIYSA GÖNDERİLDİ" DİYORUZ:
// Sunucu, adres kayıtlı olsun olmasın HER ZAMAN başarı döner (kullanıcı
// sıralaması sızdırmamak için). Ekranda "gönderildi" yazsaydık, kayıtlı
// olmayan bir adresi yazan kullanıcı olmayan bir postayı sonsuza kadar
// beklerdi. Cümle, sunucunun gerçekte bildiği kadarını söyler.
//
// AYRICA (dürüstlük notu): sunucuda RESEND_API_KEY tanımlı değilse uç fonksiyon
// SİMÜLASYON çalışır — kodu üretir, veritabanına yazar, ama e-posta GÖNDERMEZ
// ve yine başarı döner. Bu, telefon yolunu öldüren tuzağın aynısıdır
// (bkz. tests/unit/tekGirisYolu.test.ts · "KOD GÖNDER hiçbir zaman çalışmadı").
// Bu ekranın altındaki "kod gelmedi mi?" satırı bu yüzden kullanıcıya HER
// ZAMAN çalışan bir çıkış yolu (Google/Apple) gösterir.
// ════════════════════════════════════════════════════════════════════════════

interface Props {
  /** Giriş formundaki e-posta — kullanıcı iki kez yazmasın. */
  baslangicEpostasi: string;
  onKapat: () => void;
  /** Şifre değişti → giriş kipine dön ve e-postayı taşı. */
  onBasarili: (eposta: string) => void;
  renk: string;
  light: string;
}

type Adim = 'eposta' | 'kod';

const SifremiUnuttum: React.FC<Props> = ({
  baslangicEpostasi, onKapat, onBasarili, renk, light,
}) => {
  const [adim, setAdim] = useState<Adim>('eposta');
  const [eposta, setEposta] = useState(baslangicEpostasi);
  const [kod, setKod] = useState('');
  const [yeniSifre, setYeniSifre] = useState('');
  const [gorunur, setGorunur] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kodIste = async () => {
    if (busy) return;
    if (!epostaGecerliMi(eposta)) { setHata('E-posta adresi geçersiz görünüyor.'); return; }
    setBusy(true); setHata(null);
    try {
      await requestPasswordReset(eposta);
      setAdim('kod');
    } catch (e) {
      setHata(mapAuthError(e, 'Kod isteği gönderilemedi. Bağlantını kontrol et.'));
    } finally {
      setBusy(false);
    }
  };

  const sifreyiDegistir = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(kod)) { setHata('Kod 6 haneli olmalı.'); return; }
    const sebep = sifreSebebi(yeniSifre);
    if (sebep) { setHata(sebep); return; }
    setBusy(true); setHata(null);
    try {
      await confirmPasswordReset(eposta, kod, yeniSifre);
      onBasarili(eposta.trim().toLowerCase());
    } catch (e) {
      // `uctanCagir` uçtan gelen kodu zaten Türkçeye çevirip Error olarak
      // fırlatıyor; o mesaj varsa aynen gösterilir.
      setHata(e instanceof Error && e.message ? e.message : 'Şifre değiştirilemedi. Tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Şifremi unuttum"
      style={{
        position: 'absolute', inset: 0, zIndex: 78, display: 'flex', alignItems: 'flex-end',
        background: 'rgba(4,7,12,.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={onKapat}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="custom-scrollbar"
        style={{
          width: '100%', maxHeight: '92%', overflowY: 'auto',
          padding: '22px 24px calc(var(--safe-bottom, 0px) + 26px)',
          borderRadius: '28px 28px 0 0', background: '#0D121A',
          border: '1px solid rgba(255,255,255,.08)', borderBottom: 'none',
          boxShadow: '0 -12px 44px rgba(0,0,0,.5)',
          animation: 'auSheet .42s cubic-bezier(.22,1,.36,1) both',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.18)', margin: '0 auto 18px' }} />

        {adim === 'eposta' ? (
          <>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: '-.02em', color: '#fff' }}>
              Şifreni mi unuttun?
            </h2>
            <p style={{ margin: '10px 0 20px', fontSize: 12.5, lineHeight: 1.65, fontWeight: 600, color: '#8B949E' }}>
              E-posta adresini yaz, sana 6 haneli bir kod gönderelim.
            </p>

            <label className="au-label" htmlFor="reset-eposta">E-POSTA</label>
            <div className="au-field">
              <input
                id="reset-eposta"
                className="au-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ornek@eposta.com"
                value={eposta}
                disabled={busy}
                onChange={(e) => { setEposta(e.target.value); setHata(null); }}
              />
            </div>

            {hata && <p role="alert" className="au-alan-hata">{hata}</p>}

            <button
              type="button"
              className="au-cta"
              disabled={busy}
              onClick={() => void kodIste()}
              style={{
                marginTop: 20,
                background: busy ? 'rgba(255,255,255,.08)' : `linear-gradient(120deg, ${renk} 0%, ${light} 100%)`,
                color: busy ? 'rgba(255,255,255,.4)' : '#0A0E14',
              }}
            >
              {busy ? <span className="au-spin" aria-hidden="true" /> : <span>KOD GÖNDER</span>}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <MailCheck size={20} color={renk} />
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: '-.02em', color: '#fff' }}>
                Kodu gir
              </h2>
            </div>
            {/* DÜRÜST CÜMLE — bkz. dosya başındaki not. "Gönderildi" demiyoruz. */}
            <p style={{ margin: '10px 0 20px', fontSize: 12.5, lineHeight: 1.65, fontWeight: 600, color: '#8B949E' }}>
              <strong style={{ color: '#fff' }}>{eposta}</strong> adresi kayıtlıysa 6 haneli kod gönderildi.
              Kod 10 dakika geçerli.
            </p>

            <label className="au-label" htmlFor="reset-kod">6 HANELİ KOD</label>
            <div className="au-field">
              <input
                id="reset-kod"
                className="au-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={kod}
                disabled={busy}
                style={{ letterSpacing: '.5em', fontWeight: 800 }}
                onChange={(e) => { setKod(e.target.value.replace(/\D/g, '').slice(0, 6)); setHata(null); }}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="au-label" htmlFor="reset-sifre">YENİ ŞİFRE</label>
              <div className="au-field">
                <input
                  id="reset-sifre"
                  className="au-input"
                  type={gorunur ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={`En az ${MIN_SIFRE_UZUNLUGU} karakter`}
                  value={yeniSifre}
                  disabled={busy}
                  onChange={(e) => { setYeniSifre(e.target.value); setHata(null); }}
                />
                <button
                  type="button"
                  className="au-eye"
                  onClick={() => setGorunur((v) => !v)}
                  aria-label={gorunur ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  tabIndex={-1}
                >
                  {gorunur ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            {hata && <p role="alert" className="au-alan-hata">{hata}</p>}

            <button
              type="button"
              className="au-cta"
              disabled={busy}
              onClick={() => void sifreyiDegistir()}
              style={{
                marginTop: 20,
                background: busy ? 'rgba(255,255,255,.08)' : `linear-gradient(120deg, ${renk} 0%, ${light} 100%)`,
                color: busy ? 'rgba(255,255,255,.4)' : '#0A0E14',
              }}
            >
              {busy ? <span className="au-spin" aria-hidden="true" /> : (
                <><Check size={16} strokeWidth={3} /><span>ŞİFREYİ DEĞİŞTİR</span></>
              )}
            </button>

            {/* HER ZAMAN ÇALIŞAN ÇIKIŞ YOLU: e-posta gelmediyse kullanıcı burada
                sıkışmamalı. Sağlayıcı girişi sunucudaki e-posta ayarına bağlı
                değildir, yani bu yol her hâlükârda açıktır. */}
            <button
              type="button"
              className="au-ghost"
              style={{ marginTop: 10 }}
              onClick={() => setAdim('eposta')}
              disabled={busy}
            >
              KOD GELMEDİ, TEKRAR DENE
            </button>
            <p style={{ margin: '14px 2px 0', fontSize: 11.5, lineHeight: 1.6, color: '#59636e', textAlign: 'center' }}>
              E-posta bir türlü gelmiyorsa Google ya da Apple hesabınla da girebilirsin —
              aynı e-postaysa aynı hesaba düşersin.
            </p>
          </>
        )}

        <button type="button" className="au-ghost" style={{ marginTop: 10 }} onClick={onKapat} disabled={busy}>
          VAZGEÇ
        </button>
      </div>
    </div>
  );
};

export default SifremiUnuttum;
