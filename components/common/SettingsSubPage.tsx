import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

// ─── Ayarlar alt sayfası — tam ekran, alttan yukarı kayan yüzey ───────────────
// Gizlilik, Bildirimler ve Bölge Seçimi gibi "içeri girilen" ayar bölümlerinin
// ortak kabuğu. Ana Ayarlar ekranı sadece butonlar gösterir; detay burada açılır.
interface SettingsSubPageProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const PAGE_MOTION = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'spring' as const, damping: 32, stiffness: 320 },
};

const SettingsSubPage: React.FC<SettingsSubPageProps> = ({ open, onClose, title, subtitle, children }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        {...PAGE_MOTION}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-[60] bg-bg flex flex-col"
      >
        {/* Sticky başlık */}
        <header className="shrink-0 px-5 pt-[calc(env(safe-area-inset-top)+14px)] pb-4 flex items-center gap-4 bg-bg/95 backdrop-blur-xl border-b border-white/5">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center bg-surface-1 rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
            aria-label="Geri"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-white truncate">{title}</h1>
            {subtitle && <p className="text-[0.6875rem] text-ink-4 font-medium truncate">{subtitle}</p>}
          </div>
        </header>

        {/* Kaydırılabilir gövde */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-5 pb-[calc(env(safe-area-inset-bottom)+32px)]">
          {children}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

export default SettingsSubPage;
