import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MODAL_BACKDROP } from '../common/motion';

// Alt-sayfa (bottom sheet) tabanı — profil önizleme, liste seçici,
// maç seçici gibi tüm sosyal sheet'lerin ortak kabuğu (Spec §4).

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** İçerik yüksekliği sınırı; varsayılan ekranın %85'i */
  maxHeightClass?: string;
  ariaLabel?: string;
}

const SHEET_MOTION = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'spring' as const, damping: 28, stiffness: 300 },
};

const BottomSheet: React.FC<BottomSheetProps> = ({
  open, onClose, children, maxHeightClass = 'max-h-[85vh]', ariaLabel,
}) => (
  <AnimatePresence>
    {open && (
      // z-[55]: alt navigasyonun (z-50) üstünde — SOCIAL'de sheet'in birincil
      // butonu navın altında kalıp dokunulamıyordu; onay diyaloğu (z-[60]) üstte.
      <div className="fixed inset-0 z-[55] flex items-end justify-center">
        <motion.button
          {...MODAL_BACKDROP}
          aria-label="Kapat"
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          {...SHEET_MOTION}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 90 || info.velocity.y > 500) onClose();
          }}
          className={`relative w-full max-w-lg ${maxHeightClass} flex flex-col rounded-t-3xl bg-[#0D1219] border-t border-x border-white/10 shadow-[0_-8px_40px_rgba(0,0,0,0.6)]`}
        >
          {/* Sürükleme tutamacı */}
          <div className="shrink-0 pt-3 pb-2 flex justify-center">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          <div className="overflow-y-auto custom-scrollbar px-5 pb-safe">{children}</div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export default BottomSheet;
