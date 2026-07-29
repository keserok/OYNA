import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

// Yukarıdan aşağıya açılan filtre dropdown'u (Top Oyna: Format/Mentalite/Pozisyon).
// Kontrollü ve "aptal" bileşen: tek-açık kuralı ve dışarı-tıkla-kapat, ebeveynin
// openDropdown state'i + overlay'iyle yönetilir. Panel z-30: liste (z-10) üstünde,
// sticky başlık (z-50) altında kalır — katman haritası için bkz. GlassModal.tsx.

// IP-09: dışarıdan renk veren prop kaldırıldı. Yan yana duran, aynı işi yapan üç filtreden
// ortadakine sebepsiz farklı renk verilebiliyordu; seçim durumu (rol 2) tek renktir.
const ACCENT = '#39FF14'; // --color-primary; bkz. index.css RENK-ROL TABLOSU

export interface FilterDropdownOption {
  value: string;
  label: string;       // tetikleyicide görünen kısa metin
  panelLabel?: string; // panel satırında görünen tam metin (yoksa label)
}

interface FilterDropdownProps {
  label: string;
  value: string; // '' = Tümü
  options: FilterDropdownOption[]; // 'Tümü' satırı bileşen içinde otomatik eklenir
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  value,
  options,
  onChange,
  open,
  onOpenChange,
  disabled = false,
}) => {
  const reduceMotion = useReducedMotion();
  const selected = options.find((o) => o.value === value);
  const hasSelection = value !== '' && !!selected;
  const rows: FilterDropdownOption[] = [{ value: '', label: 'Tümü' }, ...options];

  return (
    <div className="relative flex-1 min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={`w-full h-11 px-3 rounded-xl border flex items-center justify-between gap-1.5 transition-all backdrop-blur-md ${
          disabled
            ? 'opacity-40 cursor-not-allowed bg-white/[0.02] border-white/5'
            : open || hasSelection
              ? ''
              : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] active:scale-[0.99]'
        }`}
        style={
          !disabled && (open || hasSelection)
            ? { backgroundColor: `${ACCENT}12`, borderColor: `${ACCENT}55`, boxShadow: `0 0 15px ${ACCENT}1f` }
            : undefined
        }
      >
        <span className="flex flex-col items-start min-w-0 text-left">
          <span
            /* IP-08: harf aralığı 0.18em'di; "MENTALİTE" gibi uzun etiketlerde
               metin sağdaki ok işaretinin altına giriyordu. Ölçeğin büyük-harf
               etiket standardına (0.08em) çekildi — hem çakışma bitti hem de
               uygulama genelinde tek bir etiket ritmi oldu. */
            className="text-[0.625rem] font-extrabold uppercase tracking-[0.08em] leading-none mb-1"
            style={{ color: !disabled && hasSelection ? ACCENT : 'rgba(255,255,255,0.45)' }}
          >
            {label}
          </span>
          <span
            className={`max-w-full text-[0.6875rem] font-extrabold uppercase tracking-wider leading-[1.2] truncate ${
              hasSelection ? 'text-white' : 'text-white/60'
            }`}
          >
            {hasSelection ? selected!.label : 'Tümü'}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          style={{ color: !disabled && (open || hasSelection) ? ACCENT : 'rgba(255,255,255,0.4)' }}
        />
      </button>

      <AnimatePresence>
        {open && !disabled && (
          <motion.div
            role="listbox"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.94, y: -4 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scaleY: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scaleY: 0.96, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ originY: 0 }}
            className="absolute inset-x-0 top-[calc(100%+6px)] z-30 rounded-2xl bg-[#161B22]/[0.98] border border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            <div className="max-h-[40vh] overflow-y-auto py-1.5">
              {rows.map((row) => {
                const isSelected = row.value === value;
                return (
                  <button
                    key={row.value || 'ALL'}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(row.value);
                      onOpenChange(false);
                    }}
                    className={`w-full min-h-[44px] px-4 flex items-center justify-between gap-2 text-left transition-colors ${
                      isSelected ? '' : 'hover:bg-white/[0.04] active:bg-white/[0.07]'
                    }`}
                    style={isSelected ? { backgroundColor: `${ACCENT}14` } : undefined}
                  >
                    <span
                      className={`text-[0.6875rem] font-extrabold uppercase tracking-wider truncate ${
                        isSelected ? '' : 'text-white/80'
                      }`}
                      style={isSelected ? { color: ACCENT } : undefined}
                    >
                      {row.panelLabel ?? row.label}
                    </span>
                    {isSelected && <Check size={14} className="shrink-0" style={{ color: ACCENT }} />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FilterDropdown;
