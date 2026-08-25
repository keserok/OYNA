import React from 'react';
import { Check } from 'lucide-react';
import type { LegalModalKind } from '../../components/common/LegalModal';

// ════════════════════════════════════════════════════════════════════════════
// YASAL ONAY — büyük kart (KVKK · Gizlilik · Kullanım Şartları)
// ════════════════════════════════════════════════════════════════════════════
//
// KURUCU İSTEĞİ (24 Ağustos 2026): "kvkk gizlilik ve beni hatırla butonlarının
// büyük şekilde yer almalarını sağlayalım."
//
// ESKİ HÂLİ VE NESİ YANLIŞTI: 10 punto gri yazı, ekranın en altında, 20px'lik
// bir kutuyla. İki sorun birden vardı:
//   1. HUKUKİ — KVKK açık rızanın "belirli bir konuya ilişkin, bilgilendirmeye
//      dayanan ve özgür iradeyle" verilmesini şart koşar. Okunamayan bir metin
//      bilgilendirme sayılmaz.
//   2. PRATİK — kutu düğmelerin çok aşağısındaydı; telefonun görüş alanına
//      çoğu zaman hiç girmiyordu. Kullanıcının ilk dokunuşunun neden
//      başarısız olduğunun kaydı: tests/unit/tekGirisYolu.test.ts.
//
// ÜÇ BELGE DE AÇILABİLİR: KVKK Aydınlatma Metni, Gizlilik Politikası ve
// Kullanım Şartları. Gizlilik Politikası bu ekrana 24 Ağustos'ta eklendi —
// metin `shared/legalDocs.ts` içinde zaten vardı ama giriş ekranından
// açılamıyordu (LegalModal tipi yalnız KVKK|TERMS'e izin veriyordu).
//
// ONAY OPT-IN'DİR: kutu önceden işaretli GELMEZ ve "devam ederek kabul etmiş
// sayılırsın" denmez. Kullanıcı ya kutuya ya da onay sayfasındaki düğmeye basar.
// ════════════════════════════════════════════════════════════════════════════

interface Props {
  onayli: boolean;
  onChange: (onayli: boolean) => void;
  /** Belge bağlantısına dokunulunca tam metin modalını açar. */
  onBelgeAc: (belge: LegalModalKind) => void;
  renk: string;
  disabled?: boolean;
}

const YasalOnayKarti: React.FC<Props> = ({ onayli, onChange, onBelgeAc, renk, disabled }) => {
  // Bağlantıya dokunmak kutuyu DEĞİŞTİRMEMELİ: kart da tıklanabilir olduğu için
  // olay yukarı kabarırsa, belgeyi okumak isteyen kullanıcı farkında olmadan
  // onay vermiş olur. Rıza, kaza eseri verilemez.
  const belge = (e: React.MouseEvent, kind: LegalModalKind) => {
    e.stopPropagation();
    e.preventDefault();
    onBelgeAc(kind);
  };

  return (
    <button
      id="agreement-checkbox"
      type="button"
      role="checkbox"
      aria-checked={onayli}
      aria-pressed={onayli}
      aria-label="Yasal onay"
      disabled={disabled}
      onClick={() => onChange(!onayli)}
      className="au-onay"
      style={disabled ? { opacity: 0.55, cursor: 'default' } : undefined}
    >
      <span className="au-kutu" aria-hidden="true">
        {onayli && <Check size={16} color="#0A0E14" strokeWidth={3.4} />}
      </span>
      <span className="au-onay-metin">
        <span
          role="link"
          tabIndex={0}
          className="au-link"
          style={{ color: renk }}
          onClick={(e) => belge(e, 'KVKK')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') belge(e as unknown as React.MouseEvent, 'KVKK'); }}
        >
          KVKK Aydınlatma Metni
        </span>
        {'’ni, '}
        <span
          role="link"
          tabIndex={0}
          className="au-link"
          style={{ color: renk }}
          onClick={(e) => belge(e, 'PRIVACY')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') belge(e as unknown as React.MouseEvent, 'PRIVACY'); }}
        >
          Gizlilik Politikası
        </span>
        {'’nı ve '}
        <span
          role="link"
          tabIndex={0}
          className="au-link"
          style={{ color: renk }}
          onClick={(e) => belge(e, 'TERMS')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') belge(e as unknown as React.MouseEvent, 'TERMS'); }}
        >
          Kullanım Şartları
        </span>
        {'’nı okudum, kişisel verilerimin işlenmesini onaylıyorum.'}
      </span>
    </button>
  );
};

export default YasalOnayKarti;
