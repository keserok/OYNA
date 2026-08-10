import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODAL_BACKDROP, MODAL_CARD } from '../common/motion';
import { useBackDismiss } from '../../hooks/useBackDismiss';

// Yıkıcı işlem onayı — arkadaşlıktan çıkar, engelle, takımı dağıt (Spec D25).
// Kural: yıkıcı işlemler onay ister; geri-alınabilirler toast ile geçer.

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, description,
  confirmLabel = 'Onayla', cancelLabel = 'Vazgeç',
  danger = true, onConfirm, onCancel,
}) => {
  // priority 10: bir BottomSheet'in ÜSTÜNDE açıldığında geri tuşu önce bunu
  // kapatır, alttaki sheet açık kalır (planın Regresyon Riski 2).
  useBackDismiss(open, onCancel, 'confirm-dialog', 10);
  return (
  <AnimatePresence>
    {open && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-8">
        <motion.button
          {...MODAL_BACKDROP}
          aria-label="Kapat"
          onClick={onCancel}
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        />
        <motion.div
          {...MODAL_CARD}
          role="alertdialog"
          aria-modal="true"
          className="relative w-full max-w-xs rounded-3xl bg-[#0D1219] border border-white/10 p-6 text-center"
        >
          <h3 className="text-white font-bold text-base">{title}</h3>
          {description && (
            <p className="text-white/50 text-sm mt-2 leading-relaxed">{description}</p>
          )}
          <div className="flex gap-2 mt-6">
            <button
              onClick={onCancel}
              className="flex-1 min-h-[44px] rounded-2xl bg-white/5 border border-white/10 text-white/80 text-sm font-bold active:scale-[0.97]"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 min-h-[44px] rounded-2xl text-sm font-bold active:scale-[0.97] ${
                danger ? 'bg-[#FF4D4D] text-white' : 'bg-primary text-on-primary'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
  );
};

export default ConfirmDialog;
