import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import { sifreGucu, sifreSebebi, epostaGecerliMi, MIN_SIFRE_UZUNLUGU } from '../../supabaseAuth';
import { validateFullName } from '../../shared/personName';

// ════════════════════════════════════════════════════════════════════════════
// E-POSTA + ŞİFRE FORMU — giriş ve kayıt
// ════════════════════════════════════════════════════════════════════════════
//
// TEK BİLEŞEN, İKİ KİP: alanların çoğu ortaktır; kayıt kipinde üste "Ad Soyad"
// eklenir ve şifrenin altında güç çubuğu çıkar. İki ayrı dosya olsaydı alan
// yükseklikleri, hata dili ve odak sırası zamanla ayrışırdı.
//
// DOĞRULAMA NEREDE YAPILIR: burada YALNIZ biçim kontrolü var (e-posta şekli,
// şifre uzunluğu, ad uzunluğu) ve amacı kullanıcıyı sunucuya boşuna
// göndermemek. Gerçek kapı sunucudadır; buradaki hiçbir kontrol güvenlik
// önlemi olarak SAYILMAZ.
//
// HATA NE ZAMAN GÖSTERİLİR: alan bir kez terk edildikten (blur) sonra. Kullanıcı
// "a" yazar yazmaz "e-posta geçersiz" basmak, henüz yazmayı bitirmemiş birini
// azarlamaktır.
// ════════════════════════════════════════════════════════════════════════════

export type FormKipi = 'giris' | 'kayit';

export interface SifreFormDegerleri {
  adSoyad: string;
  eposta: string;
  sifre: string;
}

interface Props {
  kip: FormKipi;
  degerler: SifreFormDegerleri;
  onChange: (d: SifreFormDegerleri) => void;
  onSubmit: () => void;
  onSifremiUnuttum: () => void;
  busy: boolean;
  renk: string;
  light: string;
  /**
   * Alanlar ile ana düğme ARASINA çizilir: "Beni hatırla" anahtarı ve yasal
   * onay kartı buraya geçer.
   *
   * NEDEN BURASI: ölçtük — 390×844'lük bir telefonda bu kartlar düğmenin
   * ALTINDA dururken görüş alanına hiç girmiyordu. Kurucu isteği "büyük ve
   * görünür olsun" idi; ekranın altında kalan bir kart, ne kadar büyük olursa
   * olsun görünmez. Ayrıca rıza, gerektirdiği EYLEMİN hemen yanında durmalı:
   * kullanıcı neye onay verdiğini düğmeye basmadan bir bakışta görür.
   */
  formAlti?: React.ReactNode;
}

const GUC_RENK: Record<string, string> = { zayif: '#FF6B6B', orta: '#FACC15', guclu: '#39FF14' };
const GUC_METIN: Record<string, string> = { zayif: 'Zayıf', orta: 'Orta', guclu: 'Güçlü' };

const SifreFormu: React.FC<Props> = ({
  kip, degerler, onChange, onSubmit, onSifremiUnuttum, busy, renk, light, formAlti,
}) => {
  const [sifreGorunur, setSifreGorunur] = useState(false);
  const [dokunulan, setDokunulan] = useState<Record<string, boolean>>({});
  const kayit = kip === 'kayit';

  const yaz = (alan: keyof SifreFormDegerleri, deger: string) =>
    onChange({ ...degerler, [alan]: deger });

  const adKontrol = useMemo(
    () => (kayit ? validateFullName(degerler.adSoyad) : { valid: true as const }),
    [kayit, degerler.adSoyad],
  );
  const epostaGecerli = epostaGecerliMi(degerler.eposta);
  // Giriş kipinde şifre uzunluğu DOĞRULANMAZ: eski bir hesabın şifresi 8
  // karakterden kısa olabilir ve onu "geçersiz" diye reddetmek, kendi
  // kullanıcımızı kendi hesabından kilitlemek olurdu. Uzunluk kuralı yalnız
  // YENİ şifre belirlenirken (kayıt ve sıfırlama) geçerlidir.
  const sifreHatasi = kayit ? sifreSebebi(degerler.sifre) : (degerler.sifre ? null : 'Şifre gerekli.');

  const guc = sifreGucu(degerler.sifre);
  const gucSeviye = guc === 'guclu' ? 3 : guc === 'orta' ? 2 : degerler.sifre ? 1 : 0;

  const hazir = epostaGecerli && !sifreHatasi && (!kayit || adKontrol.valid);

  const gonder = (e: React.FormEvent) => {
    e.preventDefault();
    // Gönderimde TÜM alanlar dokunulmuş sayılır: kullanıcı hiçbir alana
    // dokunmadan düğmeye basarsa eksiklerin hepsini birden görmeli.
    setDokunulan({ adSoyad: true, eposta: true, sifre: true });
    if (!hazir || busy) return;
    onSubmit();
  };

  const alanHatasi = (alan: string, hata: string | null | undefined) =>
    dokunulan[alan] && hata ? <p className="au-alan-hata">{hata}</p> : null;

  return (
    <form onSubmit={gonder} noValidate>
      {kayit && (
        <div style={{ marginBottom: 14 }}>
          <label className="au-label" htmlFor="auth-ad">AD SOYAD</label>
          <div className="au-field">
            <input
              id="auth-ad"
              className="au-input"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              placeholder="Adın ve soyadın"
              value={degerler.adSoyad}
              disabled={busy}
              onChange={(e) => yaz('adSoyad', e.target.value)}
              onBlur={() => setDokunulan((d) => ({ ...d, adSoyad: true }))}
            />
          </div>
          {alanHatasi('adSoyad', adKontrol.valid ? null : (adKontrol as { reason?: string }).reason
            ?? 'Ad ve soyadını gir.')}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label className="au-label" htmlFor="auth-eposta">E-POSTA</label>
        <div className="au-field">
          {/* inputMode=email → telefon klavyesinde "@" doğrudan görünür.
              autoCapitalize/autoCorrect kapalı: iOS "Ali@" yazdığında adresi
              büyük harfe çevirip sessizce bozuyordu. */}
          <input
            id="auth-eposta"
            className="au-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ornek@eposta.com"
            value={degerler.eposta}
            disabled={busy}
            onChange={(e) => yaz('eposta', e.target.value)}
            onBlur={() => setDokunulan((d) => ({ ...d, eposta: true }))}
          />
        </div>
        {alanHatasi('eposta', epostaGecerli ? null
          : (degerler.eposta ? 'E-posta adresi geçersiz görünüyor.' : 'E-posta gerekli.'))}
      </div>

      <div>
        <label className="au-label" htmlFor="auth-sifre">ŞİFRE</label>
        <div className="au-field">
          {/* autoComplete ayrımı ŞART: 'current-password' girişte kayıtlı şifreyi
              doldurur, 'new-password' kayıtta şifre yöneticisinin güçlü bir
              şifre ÖNERMESİNİ tetikler. İkisi karışırsa parola yöneticileri
              yanlış kayıt açar. */}
          <input
            id="auth-sifre"
            className="au-input"
            type={sifreGorunur ? 'text' : 'password'}
            autoComplete={kayit ? 'new-password' : 'current-password'}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={kayit ? `En az ${MIN_SIFRE_UZUNLUGU} karakter` : 'Şifren'}
            value={degerler.sifre}
            disabled={busy}
            onChange={(e) => yaz('sifre', e.target.value)}
            onBlur={() => setDokunulan((d) => ({ ...d, sifre: true }))}
          />
          <button
            type="button"
            className="au-eye"
            onClick={() => setSifreGorunur((v) => !v)}
            aria-label={sifreGorunur ? 'Şifreyi gizle' : 'Şifreyi göster'}
            tabIndex={-1}
          >
            {sifreGorunur ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </div>
        {alanHatasi('sifre', sifreHatasi)}

        {/* Güç çubuğu YALNIZ kayıtta: girişte kullanıcının mevcut şifresini
            "zayıf" diye yargılamak hem gereksiz hem de rahatsız edici. */}
        {kayit && degerler.sifre.length > 0 && (
          <>
            <div className="au-guc" aria-hidden="true">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="au-guc-parca"
                  style={i <= gucSeviye ? { background: GUC_RENK[guc] } : undefined}
                />
              ))}
            </div>
            <p
              role="status"
              aria-live="polite"
              style={{ margin: '6px 4px 0', fontSize: 11, fontWeight: 700, color: GUC_RENK[guc] }}
            >
              Şifre gücü: {GUC_METIN[guc]}
              {guc !== 'guclu' && (
                <span style={{ color: '#6b7684', fontWeight: 600 }}>
                  {' '}· büyük harf, rakam ve simge eklersen güçlenir
                </span>
              )}
            </p>
          </>
        )}
      </div>

      {!kayit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="button"
            className="au-link"
            style={{ color: '#8B949E', fontSize: 12, fontWeight: 700 }}
            onClick={onSifremiUnuttum}
            disabled={busy}
          >
            Şifremi unuttum
          </button>
        </div>
      )}

      {/* "Beni hatırla" + yasal onay — ana düğmenin HEMEN ÜSTÜNDE (bkz. formAlti). */}
      {formAlti && <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>{formAlti}</div>}

      {/* Düğme onay kutusuna BAKMAZ ve pasifleşmez: eksik onayla dokunulduğunda
          işlem iptal edilmez, onay sayfası açılır (bkz. AuthScreen · formGonderildi).
          Sessizce ölü bir düğme, kullanıcıya "uygulama bozuk" hissettiriyordu. */}
      <button
        type="submit"
        className="au-cta"
        disabled={busy}
        style={{
          marginTop: 18,
          background: busy
            ? 'rgba(255,255,255,.08)'
            : `linear-gradient(120deg, ${renk} 0%, ${light} 100%)`,
          color: busy ? 'rgba(255,255,255,.4)' : '#0A0E14',
          boxShadow: busy ? 'none' : `0 0 22px 0 ${renk}4d, inset 0 1px 0 rgba(255,255,255,.28)`,
        }}
      >
        {busy ? <span className="au-spin" aria-hidden="true" /> : (
          <>
            <span>{kayit ? 'HESAP OLUŞTUR' : 'GİRİŞ YAP'}</span>
            <ArrowRight size={16} strokeWidth={2.8} />
          </>
        )}
      </button>
    </form>
  );
};

export default SifreFormu;
