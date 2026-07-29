import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, ChevronDown } from 'lucide-react';
import type { OynaLocation } from '../../types';

interface LocationBadgeProps {
  region: OynaLocation | null;
  onClick?: () => void;
  className?: string;
  /** false ise salt-gösterge: tıklanmaz, ok ikonu gizlenir. */
  interactive?: boolean;
}

/**
 * Uygulama genelinde kullanılan "aktif bölge" çipi.
 * Renk kaynağa göre değişir: yeşil=canlı GPS, mavi=son (tahmini), turuncu=elle.
 * Dokununca konum seçiciyi açar.
 */
const stateStyle = (region: OynaLocation | null) => {
  if (!region) return { color: '#8B949E', border: 'rgba(255,255,255,0.10)', label: 'KONUM SEÇ', live: false };
  switch (region.source) {
    case 'gps':
      return { color: '#39FF14', border: 'rgba(57,255,20,0.28)', label: 'CANLI KONUM', live: true };
    case 'manual':
      return { color: '#FFAA00', border: 'rgba(255,170,0,0.30)', label: 'SEÇİLİ BÖLGE', live: false };
    default: // restored
      return { color: '#00B0FF', border: 'rgba(0,176,255,0.25)', label: 'SON BÖLGE', live: false };
  }
};

const LocationBadge: React.FC<LocationBadgeProps> = ({ region, onClick, className = '', interactive = true }) => {
  const s = stateStyle(region);
  const Wrapper: any = interactive ? motion.button : 'div';
  const wrapperProps = interactive
    ? { onClick, whileTap: { scale: 0.97 }, 'aria-label': 'Bölgeni değiştir' as const }
    : {};
  return (
    <Wrapper
      {...wrapperProps}
      className={`flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-2xl
                  bg-[#161B22]/80 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.25)]
                  ${className}`}
      style={{ border: `1px solid ${s.border}` }}
    >
      <span
        className="relative w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${s.color}1f`, border: `1px solid ${s.color}44`, color: s.color }}
      >
        <MapPin size={16} />
        {s.live && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0A0E14] animate-pulse"
            style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }}
          />
        )}
      </span>
      <span className="flex flex-col min-w-0 leading-tight text-left">
        <span className="text-[8px] font-extrabold tracking-[0.18em] uppercase" style={{ color: s.color }}>
          {s.live && '● '}{s.label}
        </span>
        <span className="text-sm font-extrabold text-white truncate max-w-[150px]">
          {region ? region.label : 'Bölge seç'}
        </span>
      </span>
      {interactive && <ChevronDown size={14} style={{ color: s.color }} className="flex-shrink-0" />}
    </Wrapper>
  );
};

export default LocationBadge;
