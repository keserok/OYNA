import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { MODAL_BACKDROP } from '../../../components/common/motion';
import { IconButton } from './IconButton';
import { useBackDismiss } from '../../../hooks/useBackDismiss';

/**
 * FAZ0: Owner panelinin TEK kanonik alt-sayfası (bottom sheet).
 * Uber/Yemeksepeti standardı: alta yaslı, spring slide-up, sürükle-kapat,
 * yapışkan başlık + yapışkan alt-CTA, momentumlu kaydırma, güvenli-alan payı,
 * role=dialog/aria-modal + Esc + basit focus-trap, backdrop-tap kapatma ve
 * KLAVYE-FARKINDALIK (visualViewport ile sheet'i klavye üstüne kaldırır — birincil
 * CTA asla klavye/home-indicator arkasında kalmaz).
 */
interface OwnerBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  /** Yapışkan alt CTA alanı (güvenli-alan payı otomatik eklenir). */
  footer?: React.ReactNode;
  ariaLabel?: string;
  hideHandle?: boolean;
  /** Ek gövde sınıfları. */
  bodyClassName?: string;
}

const SHEET_MOTION = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: { type: 'spring' as const, damping: 30, stiffness: 320 },
};

export const OwnerBottomSheet: React.FC<OwnerBottomSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  ariaLabel,
  hideHandle,
  bodyClassName = '',
}) => {
  // Android geri tusu kaydi. Mevcut Esc dinleyicisi kalabilir: onClose idempotent.
  useBackDismiss(open, onClose, 'owner-bottom-sheet');
  const panelRef = useRef<HTMLDivElement>(null);
  const [kbInset, setKbInset] = useState(0);

  // Klavye-farkındalık: görsel viewport küçülünce sheet'i klavye üstüne kaldır.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () =>
      setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, [open]);

  // Body scroll kilidi + odağı sheet'e taşı.
  // KENDİ Esc dinleyicisi KALDIRILDI: useBackDismiss (yukarıda) Esc'yi merkezî
  // kayıttan yönetiyor ve YALNIZ en üstteki katmanın cevap vermesini sağlıyor.
  // İkisi birden dururken iç içe iki sheet'te tek Esc İKİSİNİ birden kapatıyordu
  // (stopPropagation aynı düğümdeki diğer dinleyicileri durdurmaz).
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => panelRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open]);

  // Basit focus-trap: Tab sheet dışına çıkmasın.
  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[55] flex items-end justify-center"
          style={{ paddingBottom: kbInset }}
        >
          <motion.button
            {...MODAL_BACKDROP}
            aria-label="Kapat"
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            {...SHEET_MOTION}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 550) onClose();
            }}
            style={{ maxHeight: `calc(92dvh - ${kbInset}px)` }}
            className="relative w-full max-w-lg flex flex-col rounded-t-[28px] bg-[#0D1219] border-t border-x border-white/10 shadow-[0_-8px_40px_rgba(0,0,0,0.6)] outline-none"
          >
            {!hideHandle && (
              <div className="shrink-0 pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1.5 rounded-full bg-white/20" />
              </div>
            )}
            {(title || subtitle) && (
              <div className="shrink-0 px-5 pt-2 pb-3 flex items-start justify-between gap-3 border-b border-white/5">
                <div className="min-w-0">
                  {title && (
                    <h2 className="text-lg font-extrabold text-white truncate">{title}</h2>
                  )}
                  {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
                </div>
                <IconButton ariaLabel="Kapat" onClick={onClose} variant="ghost">
                  <X size={20} />
                </IconButton>
              </div>
            )}
            <div
              className={`flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-5 py-4 ${bodyClassName}`}
              style={footer ? undefined : { paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
            >
              {children}
            </div>
            {footer && (
              <div
                className="shrink-0 px-5 pt-3 border-t border-white/5 bg-[#0D1219]"
                style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.75rem)' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default OwnerBottomSheet;
