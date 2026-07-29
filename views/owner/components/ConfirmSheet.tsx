import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { OwnerBottomSheet } from './OwnerBottomSheet';
import { Spinner } from '../../../components/ui/Spinner';

/**
 * FAZ0: Yıkıcı/geri-alınamaz aksiyonlar için markalı onay sheet'i.
 * `window.confirm` (stil dışı, mobil-dışı) yerine tüm geri-alınamaz mutasyonlarda
 * kullanılır. Async `onConfirm` sırasında butonu kilitler + spinner gösterir;
 * işlem biterken yanlışlıkla kapanmayı (backdrop/Esc) engeller.
 */
interface ConfirmSheetProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: React.ReactNode;
}

const noop = () => {};

export const ConfirmSheet: React.FC<ConfirmSheetProps> = ({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  destructive = false,
  icon,
}) => {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <OwnerBottomSheet
      open={open}
      onClose={busy ? noop : onCancel}
      ariaLabel={title}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 h-12 rounded-2xl bg-white/5 text-white font-bold active:scale-[0.98] transition-transform disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`flex-1 h-12 rounded-2xl font-extrabold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1219] ${
              destructive
                ? 'bg-red-600 hover:bg-red-500 focus-visible:ring-red-400'
                : 'bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-400'
            }`}
          >
            {busy ? <Spinner size={18} color="currentColor" glow={false} /> : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center py-2">
        <div
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
            destructive ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'
          }`}
        >
          {icon ?? <AlertTriangle size={26} />}
        </div>
        <h3 className="text-lg font-extrabold text-white mb-1.5">{title}</h3>
        {message && (
          <p className="text-sm text-slate-400 leading-relaxed max-w-[300px]">{message}</p>
        )}
      </div>
    </OwnerBottomSheet>
  );
};

export default ConfirmSheet;
