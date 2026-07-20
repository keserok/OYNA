import React from 'react';
import { Calendar, Home, MoreHorizontal, Users, Wallet } from 'lucide-react';

export type OwnerNavTab = 'HOME' | 'CALENDAR' | 'FINANCE' | 'TEAM' | 'MORE';

interface OwnerBottomNavProps {
  activeTab: OwnerNavTab | string;
  pendingCount?: number;
  financeLocked?: boolean;
  teamLocked?: boolean;
  /** STAFF-3: yetkiye göre tamamen gizlenen sekmeler (ör. personel için Finans). */
  hiddenTabs?: OwnerNavTab[];
  onSelect: (tab: OwnerNavTab) => void;
}

const tabs: { id: OwnerNavTab; label: string; icon: React.ReactNode }[] = [
  { id: 'HOME', label: 'Özet', icon: <Home size={20} /> },
  { id: 'CALENDAR', label: 'Takvim', icon: <Calendar size={20} /> },
  { id: 'FINANCE', label: 'Finans', icon: <Wallet size={20} /> },
  { id: 'TEAM', label: 'Ekip', icon: <Users size={20} /> },
  { id: 'MORE', label: 'Menü', icon: <MoreHorizontal size={20} /> },
];

export const OwnerBottomNav: React.FC<OwnerBottomNavProps> = ({
  activeTab,
  pendingCount = 0,
  financeLocked,
  teamLocked,
  hiddenTabs = [],
  onSelect,
}) => {
  const highlightTab =
    activeTab === 'PENDING_ACTIONS' || activeTab === 'PITCHES' ? 'HOME' : activeTab;
  const shownTabs = tabs.filter((t) => !hiddenTabs.includes(t.id));

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1A1F2C]/95 backdrop-blur-xl border-t border-white/5 px-2 py-2 z-40 safe-area-pb">
      <div className="flex justify-around items-center max-w-lg mx-auto">
        {shownTabs.map((tab) => {
          const isActive = highlightTab === tab.id;
          const locked =
            (tab.id === 'FINANCE' && financeLocked) || (tab.id === 'TEAM' && teamLocked);
          const showBadge = tab.id === 'HOME' && pendingCount > 0;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                isActive
                  ? 'text-blue-400 bg-blue-500/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className={`relative ${isActive ? 'scale-110' : ''} transition-transform`}>
                {tab.icon}
                {showBadge && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 bg-amber-500 text-black text-[9px] font-black rounded-full flex items-center justify-center">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
                {locked && (
                  <span className="absolute -bottom-0.5 -right-1 w-2 h-2 bg-slate-600 rounded-full border border-[#1A1F2C]" />
                )}
              </span>
              <span className="text-[10px] font-bold">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
