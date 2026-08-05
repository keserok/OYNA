/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: components/ui/Chip.tsx
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
import React, { useRef } from 'react';

// Filtre/liste çipi — arkadaş listeleri, dizin filtreleri (Spec E28/I52).
// onLongPress: liste yönetimi menüsü için (uzun basış ~450ms).

interface ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  emoji?: string | null;
  count?: number;
  className?: string;
}

const Chip: React.FC<ChipProps> = ({
  label, selected = false, onClick, onLongPress, emoji, count, className = '',
}) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);

  const start = () => {
    if (!onLongPress) return;
    longFired.current = false;
    timer.current = setTimeout(() => {
      longFired.current = true;
      onLongPress();
    }, 450);
  };
  const cancel = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  return (
    <button
      onClick={() => { if (!longFired.current) onClick?.(); }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={e => { e.preventDefault(); }}
      className={`shrink-0 min-h-[36px] px-3.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors active:scale-[0.96] ${
        selected
          ? 'bg-white text-[#0A0E14] border-white'
          : 'bg-white/5 text-white/60 border-white/10'
      } ${className}`}
    >
      {emoji && <span className="mr-1">{emoji}</span>}
      {label}
      {typeof count === 'number' && (
        <span className={`ml-1.5 ${selected ? 'text-black/50' : 'text-ink-4'}`}>{count}</span>
      )}
    </button>
  );
};

export default Chip;
