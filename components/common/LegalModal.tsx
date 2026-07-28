import React from 'react';
import { motion } from 'framer-motion';

// KVKK Aydınlatma Metni + Kullanıcı Sözleşmesi özetleri. Giriş akışındaki onay
// satırından açılır; tam metinler public/ altındaki yasal sayfalarda yayınlanır.
export const KVKK_TEXT = 'OYNA, kullanıcıların e-posta veya telefon numarasını 6698 sayılı KVKK kapsamında yalnızca kimlik doğrulama, hesap güvenliği ve hizmet bilgilendirmesi amacıyla işlemekte; üçüncü taraflarla paylaşmamakta ve kullanıcının talebi üzerine verilerini kalıcı olarak silmektedir. Kişisel verilerinize ilişkin haklarınızı destek@oyna.app adresine yazılı başvuru yoluyla kullanabilirsiniz.';

export const SOZLESME_TEXT = 'OYNA platformunu kullanan her kişi, uygulamanın yalnızca yasal spor organizasyonları amacıyla kullanılacağını, başkalarının haklarını ihlal eden içerik paylaşmayacağını ve hesabının güvenliğinden bizzat sorumlu olduğunu kabul etmektedir. Kullanım koşullarını ihlal eden hesaplar bildirim yapılmaksızın askıya alınabilir.';

export type LegalModalKind = 'kvkk' | 'sozlesme';

interface LegalModalProps {
  openModal: LegalModalKind | null;
  setOpenModal: (v: LegalModalKind | null) => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ openModal, setOpenModal }) => {
  if (!openModal) return null;
  const isKvkk = openModal === 'kvkk';
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
          {isKvkk ? 'KVKK Aydınlatma Metni' : 'Kullanıcı Sözleşmesi'}
        </h3>
        <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.75, fontWeight: 500, color: '#d1d5db' }}>
          {isKvkk ? KVKK_TEXT : SOZLESME_TEXT}
        </p>
        <button
          type="button"
          onClick={() => setOpenModal(null)}
          style={{
            marginTop: 24, width: '100%', height: 48, borderRadius: 16, border: 'none', cursor: 'pointer',
            background: '#FACC15', color: '#000', fontSize: 12, fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: '.08em',
          }}
        >
          Anladım, kapat
        </button>
      </motion.div>
    </motion.div>
  );
};
