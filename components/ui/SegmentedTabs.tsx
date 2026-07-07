import React from 'react';
import { motion } from 'framer-motion';

// Hap (segmented) sekme kontrolü — Takımlar'ın 3 alt sekmesi için (Spec G38).
// Üst seviye altı-çizgili sekmeden görsel olarak ayrışır; dokunma hedefi ≥44px.

export interface SegmentedTabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;   // ör. "+ Takım Oluştur" için Plus ikonu
  badge?: boolean;          // minik nokta rozeti (ör. kayıtlı taslak)
}

interface SegmentedTabsProps {
  items: SegmentedTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  layoutId?: string;        // aynı ekranda birden çok kontrol varsa benzersiz verin
  className?: string;
}

const SegmentedTabs: React.FC<SegmentedTabsProps> = ({
  items, activeId, onChange, layoutId = 'segmentedTabs', className = '',
}) => (
  <div
    role="tablist"
    className={`flex p-1 rounded-2xl bg-white/5 border border-white/8 ${className}`}
  >
    {items.map(item => {
      const active = item.id === activeId;
      return (
        <button
          key={item.id}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(item.id)}
          className="relative flex-1 min-h-[44px] px-2 rounded-xl flex items-center justify-center gap-1"
        >
          {active && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-xl bg-white/10 border border-white/10"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span
            className={`relative flex items-center gap-1 text-xs font-bold whitespace-nowrap ${
              active ? 'text-white' : 'text-white/50'
            }`}
          >
            {item.icon}
            {item.label}
            {item.badge && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14]" aria-label="Taslak var" />
            )}
          </span>
        </button>
      );
    })}
  </div>
);

export default SegmentedTabs;
