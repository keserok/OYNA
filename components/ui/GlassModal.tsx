import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useBackDismiss } from '../../hooks/useBackDismiss';

// ================================================================
// GlassModal — ekran ortasında duran buzlu cam pencere (Arkadaşlar).
// Alt sayfanın (BottomSheet) yerine geçer: alt barla asla çakışmaz,
// güçlü blur'lu karartma arka planı odağı cama toplar.
// Cam dili: koyu buzlu yüzey + ince parlak kenar + üstten süzülen
// ışık; neon YALNIZ içerikteki etkileşim öğelerinde kalır (anayasa).
// Katman: nav z-50 · sheet z-[55] · CAM z-[58] · onay diyaloğu z-[60].
// ================================================================

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
  /** Verilirse üstte başlık + X kapatma satırı çizilir. */
  title?: string;
  /** Başlıksız kullanımda yüzen X; özel başlığı olan içerikte kapat. */
  showClose?: boolean;
  /** İçerik genişlik sınırı; varsayılan max-w-sm (~384px). */
  maxWidthClass?: string;
}

const PANEL_MOTION = {
  initial: { opacity: 0, scale: 0.9, y: 24 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 12 },
  transition: { type: 'spring' as const, damping: 26, stiffness: 320 },
};

const GlassModal: React.FC<GlassModalProps> = ({
  open, onClose, children, ariaLabel, title,
  showClose = true, maxWidthClass = 'max-w-sm',
}) => {
  // Android geri tuşu + Esc bu camı kapatır; arkadaki ekran DEĞİŞMEZ (BULGU-020).
  useBackDismiss(open, onClose, 'glass-modal');
  return (
  <AnimatePresence>
    {open && (
      <div className="fixed inset-0 z-[58] flex items-center justify-center px-5">
        {/* Güçlü blur + karartma — odak camda */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-label="Kapat"
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-xl"
        />

        <motion.div
          {...PANEL_MOTION}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className={`relative w-full ${maxWidthClass} max-h-[78vh] flex flex-col overflow-hidden rounded-[28px] border border-white/[0.14] bg-[#0D1219]/55 backdrop-blur-2xl`}
          style={{
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.12), 0 24px 80px -12px rgba(0,0,0,0.8)',
          }}
        >
          {/* Üstten süzülen ışık + hayal gibi neon nefes (dekor, dokunulmaz) */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.10] to-transparent" />
          <div
            className="pointer-events-none absolute -top-16 -left-16 w-48 h-48 rounded-full blur-[60px]"
            style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.10), transparent 70%)' }}
          />

          {title ? (
            <div className="relative shrink-0 flex items-center gap-3 px-5 pt-5 pb-3">
              <h3 className="flex-1 text-base font-extrabold text-white truncate">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Kapat"
                className="w-11 h-11 -mr-1 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/60 active:scale-95"
              >
                <X size={18} />
              </button>
            </div>
          ) : showClose ? (
            <button
              onClick={onClose}
              aria-label="Kapat"
              className="absolute top-4 right-4 z-10 w-11 h-11 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white/60 active:scale-95"
            >
              <X size={18} />
            </button>
          ) : null}

          <div className={`relative overflow-y-auto custom-scrollbar px-5 pb-5 ${title ? 'pt-1' : 'pt-5'}`}>
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
  );
};

export default GlassModal;
