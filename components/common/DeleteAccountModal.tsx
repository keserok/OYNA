import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, AlertTriangle, ShieldAlert, Wallet } from 'lucide-react';
import { supabase, clearHasAccount } from '../../supabaseClient';
import { MODAL_BACKDROP, MODAL_CARD } from './motion';

// ─── İki adımlı hesap silme modal — hangi rolden açılırsa açılsın aynı akış ────
// Tek yerde tanımlı: Oyuncu (SettingsScreen) ve Kaleci/Hakem (ServiceSettings)
// ekranlarının ikisi de buradan içe aktarır, böylece hesap silme her hesap
// türünden aynı şekilde erişilebilir olur (mağaza şartı).
//
// [S4] Silme öncesi sunucudan durum (preview_account_deletion) alınır: açık
// rezervasyon/maç, ÇEKİLEBİLİR BAKİYE veya bekleyen çekim varsa silme engellenir
// ve NET yönlendirme gösterilir (para kaybı olmasın).
//
// K1: iade bakiyesi artık çekilebilir olduğu için "kaybolur" uyarısı kaldırıldı;
// o tutar da çekilebilir bakiyeye dahil ve aynı engelin kapsamında.

interface DeletionItem { code: string; message: string; amount?: number }
interface DeletionPreview {
  can_delete: boolean;
  blockers: DeletionItem[];
  warnings: DeletionItem[];
  wait_days: number;
}

const DeleteAccountModal: React.FC<{
  onClose: () => void;
  onConfirmed: () => void;
}> = ({ onClose, onConfirmed }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc('preview_account_deletion');
      if (!alive) return;
      if (error) {
        // Önizleme RPC yoksa/başarısızsa akışı kilitleme — sunucu request'te yine korur.
        setPreview({ can_delete: true, blockers: [], warnings: [], wait_days: 7 });
      } else {
        setPreview(data as DeletionPreview);
      }
      setPreviewLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const waitDays = preview?.wait_days ?? 7;

  const handleConfirm = async () => {
    if (confirmText !== 'HESABIMI SİL') return;
    setLoading(true);
    const { error } = await supabase.rpc('request_account_deletion');
    if (error) {
      // Sunucunun Türkçe yönlendirme mesajını göster (bakiye/rezervasyon engeli).
      setToast({ message: error.message || 'Bir hata oluştu. Lütfen tekrar deneyin.', variant: 'error' });
      setLoading(false);
      return;
    }
    // Cihaz-hesap bayrağını temizle: bu cihaz artık kayıt-öncelikli auth ekranı
    // görür. (Çıkışta temizlenmez; yalnızca silme talebinde.)
    clearHasAccount();
    setToast({ message: `Silme talebin alındı. ${waitDays} gün içinde hesabın silinecek.`, variant: 'success' });
    setTimeout(() => { onConfirmed(); }, 2000);
  };

  const blocked = !!preview && !preview.can_delete;
  const warnings = preview?.warnings ?? [];

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
          <h3 className="font-extrabold text-white text-lg">
            {blocked ? 'Hesap Silinemiyor' : step === 1 ? 'Hesabı Sil' : 'Son Adım'}
          </h3>
          <button onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center text-ink-4 hover:text-white" aria-label="Kapat">
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

        {previewLoading ? (
          <div className="py-8 text-center text-sm text-ink-4">Durum kontrol ediliyor…</div>
        ) : blocked ? (
          <>
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Hesabını silebilmek için önce aşağıdakileri çözmen gerekiyor:
            </p>
            <div className="space-y-2.5 mb-6">
              {preview!.blockers.map((b) => (
                <div key={b.code} className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25">
                  {b.code === 'CASHABLE_BALANCE' || b.code === 'PENDING_PAYOUT'
                    ? <Wallet size={16} className="text-red-400 shrink-0 mt-0.5" />
                    : <ShieldAlert size={16} className="text-red-400 shrink-0 mt-0.5" />}
                  <p className="text-[0.8125rem] text-red-200 leading-snug">{b.message}</p>
                </div>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-full h-12 rounded-2xl font-extrabold text-sm bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 transition-colors"
            >
              Anladım
            </button>
          </>
        ) : step === 1 ? (
          <>
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Bu işlem <span className="text-red-400 font-bold">geri alınamaz</span>. Hesabın, tüm verilerinle birlikte {waitDays} gün içinde kalıcı olarak silinecek.
            </p>
            {warnings.length > 0 && (
              <div className="space-y-2.5 mb-4">
                {warnings.map((w) => (
                  <div key={w.code} className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
                    <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[0.8125rem] text-amber-200 leading-snug">{w.message}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-400 mb-6">Devam etmek istediğine emin misin?</p>
            <div className="space-y-3">
              <button
                onClick={() => setStep(2)}
                className="w-full h-12 rounded-2xl font-extrabold text-sm bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Hesabı Sil
              </button>
              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl font-extrabold text-sm text-gray-400 border border-white/10"
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
                className="w-full h-12 rounded-2xl font-extrabold text-sm bg-red-600 text-white disabled:opacity-40 transition-opacity"
              >
                {loading ? 'İŞLENİYOR…' : 'Hesabımı Kalıcı Olarak Sil'}
              </button>
              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl font-extrabold text-sm text-gray-400 border border-white/10"
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
