import React from 'react';
import {
  ArrowUpRight,
  CalendarCheck,
  Clock,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { ownerSectionLabel } from '../design/ownerTheme';

export interface OwnerKpiItem {
  id: string;
  label: string;
  value: string;
  sublabel?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  accent?: 'emerald' | 'blue' | 'amber' | 'red' | 'slate';
  icon: React.ReactNode;
  onClick?: () => void;
}

const accentMap = {
  emerald: {
    card: 'from-emerald-900/35 to-[#161B22] border-emerald-500/20 hover:border-emerald-500/40',
    label: 'text-emerald-400',
    value: 'text-white group-hover:text-emerald-200',
    badge: 'text-emerald-500 bg-emerald-500/10',
  },
  blue: {
    card: 'from-blue-900/30 to-[#161B22] border-blue-500/20 hover:border-blue-500/40',
    label: 'text-blue-400',
    value: 'text-white group-hover:text-blue-200',
    badge: 'text-blue-400 bg-blue-500/10',
  },
  amber: {
    card: 'from-amber-900/25 to-[#161B22] border-amber-500/20 hover:border-amber-500/40',
    label: 'text-amber-400',
    value: 'text-amber-300 group-hover:text-amber-200',
    badge: 'text-amber-400 bg-amber-500/10',
  },
  red: {
    card: 'from-red-900/25 to-[#161B22] border-red-500/20 hover:border-red-500/40',
    label: 'text-red-400',
    value: 'text-red-400 group-hover:text-red-300',
    badge: 'text-red-400 bg-red-500/10',
  },
  slate: {
    card: 'from-[#161B22] to-[#12161f] border-white/5 hover:border-white/15',
    label: 'text-slate-400',
    value: 'text-white group-hover:text-slate-200',
    badge: 'text-slate-500 bg-white/5',
  },
};

interface OwnerKpiGridProps {
  items: OwnerKpiItem[];
  columns?: 2 | 3;
}

export const OwnerKpiGrid: React.FC<OwnerKpiGridProps> = ({ items, columns = 2 }) => {
  const gridClass = columns === 3 ?'grid-cols-2' :'grid-cols-2';

  return (
    <div className={`grid ${gridClass} gap-3 mb-6`}>
      {items.map((item) => {
        const accent = accentMap[item.accent ?? 'slate'];
        const Tag = item.onClick ? 'button' : 'div';
        return (
          <Tag
            key={item.id}
            type={item.onClick ? 'button' : undefined}
            onClick={item.onClick}
            className={`group text-left bg-gradient-to-br p-4 rounded-2xl border relative overflow-hidden transition-all active:scale-[0.98] ${accent.card} ${item.onClick ? 'cursor-pointer' : ''}`}
          >
            <div className="absolute top-2 right-2 opacity-[0.07] group-hover:opacity-[0.14] transition-opacity">
              {item.icon}
            </div>
            <p className={`${ownerSectionLabel} flex items-center gap-1 ${accent.label}`}>
              {item.label}
              {item.onClick ? <ArrowUpRight size={10} /> : null}
            </p>
            <p className={`text-2xl font-extrabold mt-1 tracking-tight transition-colors ${accent.value}`}>
              {item.value}
            </p>
            {(item.sublabel || item.trendLabel) && (
              <div className={`flex items-center gap-1 text-[10px] font-bold mt-2 w-fit px-2 py-0.5 rounded-lg ${accent.badge}`}>
                {item.trend === 'up' ? <TrendingUp size={11} /> : null}
                {item.trendLabel ?? item.sublabel}
              </div>
            )}
          </Tag>
        );
      })}
    </div>
  );
};

/** SaaS command strip — tek satır özet + aksiyon ipuçları */
interface OwnerCommandStripProps {
  pendingCount: number;
  isFacilityOpen: boolean;
  onPendingClick?: () => void;
  onCalendarClick?: () => void;
}

export const OwnerCommandStrip: React.FC<OwnerCommandStripProps> = ({
  pendingCount,
  isFacilityOpen,
  onPendingClick,
  onCalendarClick,
}) => (
  <div className="flex gap-2 overflow-x-auto pb-1 mb-5 -mx-1 px-1 scrollbar-hide">
    <span
      className={`shrink-0 px-3 py-1.5 rounded-full border text-[10px] font-bold ${
        isFacilityOpen
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-red-500/10 border-red-500/20 text-red-400'
      }`}
    >
      {isFacilityOpen ? 'Tesis açık' : 'Tesis kapalı'}
    </span>
    {pendingCount > 0 && onPendingClick && (
      <button
        type="button"
        onClick={onPendingClick}
        className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-extrabold text-amber-200 flex items-center gap-1"
      >
        <Clock size={11} />
        {pendingCount} onay bekliyor
      </button>
    )}
    {onCalendarClick && (
      <button
        type="button"
        onClick={onCalendarClick}
        className="shrink-0 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-slate-300 flex items-center gap-1"
      >
        <CalendarCheck size={11} />
        Takvime git
      </button>
    )}
  </div>
);

export const kpiIcons = {
  wallet: <Wallet size={40} />,
  users: <Users size={40} />,
  clock: <Clock size={40} />,
  calendar: <CalendarCheck size={40} />,
};
