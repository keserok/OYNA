import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // ilk odaklanabilir öğeye odaklan
    const first = panelRef.current?.querySelector<HTMLElement>('input, button, select, textarea');
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#161B22] w-full max-w-md rounded-t-3xl p-6 border border-white/10"
      >
        <div className="flex justify-between mb-4">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Kapat"><X size={20} className="text-gray-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
};
