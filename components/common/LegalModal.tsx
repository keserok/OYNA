import React from 'react';
import { motion } from 'framer-motion';
import { DOCS, type LegalDocKey } from '../../shared/legalDocs';

// Onay anında gösterilen yasal belge.
//
// IP-15 — kullanıcı kararı 7b: burada eskiden iki dosya-içi sabitte birer
// PARAGRAFLIK özet vardı, Ayarlar → Yasal ekranındaki resmi belgeler ise
// bambaşkaydı. Kullanıcı neye onay verdiğini göremiyordu. Özetler silindi;
// artık onay anında TAM belge gösteriliyor ve metin tek kaynaktan
// (`shared/legalDocs.ts`) geliyor — iki ekran birebir aynı şeyi okur.
//
// Onay kutusundan açılabilen belgeler; "Kullanıcı Sözleşmesi" adı kalktı,
// yasal ekrandaki gerçek adı olan "Kullanım Şartları" (TERMS) kullanılıyor.
//
// PRIVACY (24 Ağu 2026): Gizlilik Politikası bu listeye eklendi. Eskiden
// `shared/legalDocs.ts` içinde VARDI ama giriş ekranından açılamıyordu —
// tip yalnız KVKK|TERMS'e izin veriyordu. Apple App Store, gizlilik
// politikasının uygulama İÇİNDEN erişilebilir olmasını şart koşar; kayıt
// anında açılamayan bir politika bu şartı yarım karşılar.
export type LegalModalKind = Extract<LegalDocKey, 'KVKK' | 'TERMS' | 'PRIVACY'>;

interface LegalModalProps {
  openModal: LegalModalKind | null;
  setOpenModal: (v: LegalModalKind | null) => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ openModal, setOpenModal }) => {
  if (!openModal) return null;
  const doc = DOCS[openModal];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setOpenModal(null)}
      style={{
        position: 'absolute', inset: 0, zIndex: 80, display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        style={{
          width: '100%', borderRadius: '32px 32px 0 0',
          padding: '24px 24px calc(var(--safe-bottom, 0px) + 32px)',
          background: 'linear-gradient(180deg, #161B22 0%, #0A0E14 100%)',
          border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none',
          maxHeight: '80%', overflowY: 'auto',
        }}
        className="custom-scrollbar"
      >
        <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.2)', margin: '0 auto 20px' }} />
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.06em', color: '#fff' }}>
          {doc.title}
        </h3>
        {/* Belge satır sonlarıyla biçimlenmiştir; tek <p> içinde okunamaz.
            Kalıp views/LegalScreen.tsx ile aynı. */}
        <pre className="whitespace-pre-wrap font-sans custom-scrollbar" style={{
          margin: 0, fontSize: 13, lineHeight: 1.75, fontWeight: 500, color: '#d1d5db',
          maxHeight: '55vh', overflowY: 'auto', paddingRight: 4,
        }}>
          {doc.body}
        </pre>
        <button
          type="button"
          onClick={() => setOpenModal(null)}
          style={{
            marginTop: 24, width: '100%', height: 48, borderRadius: 16, border: 'none', cursor: 'pointer',
            background: '#39FF14', color: '#0A0E14', fontSize: 12, fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: '.08em',
          }}
        >
          Anladım, kapat
        </button>
      </motion.div>
    </motion.div>
  );
};
