import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { MODAL_BACKDROP, MODAL_CARD } from './motion';

// ─── İki adımlı hesap silme modal — hangi rolden açılırsa açılsın aynı akış ────
// Tek yerde tanımlı: Oyuncu (SettingsScreen) ve Kaleci/Hakem (ServiceSettings)
// ekranlarının ikisi de buradan içe aktarır, böylece hesap silme her hesap
// türünden aynı şekilde erişilebilir olur (mağaza şartı).
const DeleteAccountModal: React.FC<{
  onClose: () => void;
  onConfirmed: () => void;
}> = ({ onClose, onConfirmed }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  const handleConfirm = async () => {
    if (confirmText !== 'HESABIMI SİL') return;
    setLoading(true);
    try {
      await supabase.rpc('request_account_deletion');
      setToast({ message: 'Silme talebiniz alındı. 7 gün içinde hesabınız silinecek.', variant: 'success' });
      setTimeout(() => {
        onConfirmed();
      }, 2000);
    } catch {
      setToast({ message: 'Bir hata oluştu. Lütfen tekrar deneyin.', variant: 'error' });
      setLoading(false);
    }
  };

  return (
    <motion.div
      {...MODAL_BACKDROP}
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-6"
    >
      <motion.div
        {...MODAL_CARD}
        className="w-full max-w-sm rounded-[28px] p-6"
        style={{
          background: 'linear-gradient(180deg, #1a0808 0%, #0A0E14 100%)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-white text-lg">
            {step === 1 ? 'Hesabı Sil' : 'Son Adım'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1" aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        {toast && (
          <div className={`mb-4 p-3 rounded-xl text-sm font-bold text-center border ${
            toast.variant === 'success'
              ? 'bg-green-500/15 border-green-500/25 text-green-300'
              : 'bg-red-500/15 border-red-500/25 text-red-300'
          }`}>
            {toast.message}
          </div>
        )}

        {step === 1 ? (
          <>
            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
              Bu işlem <span className="text-red-400 font-bold">geri alınamaz</span>. Hesabın, tüm verilerinle birlikte 7 gün içinde kalıcı olarak silinecek.
              Devam etmek istediğine emin misin?
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setStep(2)}
                className="w-full h-12 rounded-2xl font-black text-sm bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Evet, Devam Et
              </button>
              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl font-black text-sm text-gray-400 border border-white/10"
              >
                İptal
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Onaylamak için aşağıya <span className="text-red-400 font-bold">HESABIMI SİL</span> yazın:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="HESABIMI SİL"
              className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-4 text-white font-bold text-sm outline-none focus:border-red-500/50 mb-4"
            />
            <div className="space-y-3">
              <button
                onClick={handleConfirm}
                disabled={confirmText !== 'HESABIMI SİL' || loading}
                className="w-full h-12 rounded-2xl font-black text-sm bg-red-600 text-white disabled:opacity-40 transition-opacity"
              >
                {loading ? 'İŞLENİYOR...' : 'Hesabımı Kalıcı Olarak Sil'}
              </button>
              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl font-black text-sm text-gray-400 border border-white/10"
              >
                İptal
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

export default DeleteAccountModal;
