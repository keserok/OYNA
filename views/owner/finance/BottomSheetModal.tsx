import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useBackDismiss } from '../../../hooks/useBackDismiss';

// ─── FI-1 — Ortak alt-sayfa modalı (erişilebilir) ────────────────────────────
// Tek kaynak: veresiye/gider ekleme modalları bunu kullanır (kopya + drift biter).
// role=dialog + aria-modal, ESC ile kapat, backdrop tıklayınca kapat, gövde
// scroll kilidi, ilk odak.

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const BottomSheetModal: React.FC<Props> = ({ title, onClose, children }) => {
  // Kosullu mount ediliyor -> open sabit true.
  useBackDismiss(true, onClose, 'owner-finance-sheet');
  const panelRef = useRef<HTMLDivElement>(null);
  // FAZ2: klavye-farkındalık — tutar/veresiye inputu klavye açınca sheet klavye üstüne kalkar.
  const [kbInset, setKbInset] = React.useState(0);

  useEffect(() => {
    // KENDİ Esc dinleyicisi KALDIRILDI — useBackDismiss (yukarıda) Esc'yi
    // merkezî kayıttan yönetiyor, yalnız en üstteki katman cevap veriyor.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // ilk odaklanabilir öğeye odaklan
    const first = panelRef.current?.querySelector<HTMLElement>('input, button, select, textarea');
    first?.focus();
    const vv = window.visualViewport;
    const onResize = () => vv && setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv?.addEventListener('resize', onResize);
    vv?.addEventListener('scroll', onResize);
    onResize();
    return () => {
      document.body.style.overflow = prevOverflow;
      vv?.removeEventListener('resize', onResize);
      vv?.removeEventListener('scroll', onResize);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center p-4 pb-0"
      style={{ paddingBottom: kbInset }}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: kbInset ? `calc(85dvh - ${kbInset}px)` : undefined }}
        className="bg-[#161B22] w-full max-w-md rounded-t-3xl p-6 pb-safe-6 border border-white/10 max-h-[85dvh] overflow-y-auto custom-scrollbar"
      >
        <div className="flex justify-between mb-4">
          <h3 className="text-lg font-extrabold text-white">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Kapat"><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};
