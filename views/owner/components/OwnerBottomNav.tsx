import React from 'react';
import { Calendar, Home, MoreHorizontal, Users, Wallet } from 'lucide-react';

// Ekip alt bara (ortaya) alındı; Sahalarım Menü'ye indi. Team ekranı çok
// kullanılan operasyon; Sahalarım kurulum-sonrası nadir → menüden erişilir.
export type OwnerNavTab = 'HOME' | 'CALENDAR' | 'PITCHES' | 'FINANCE' | 'TEAM' | 'MORE';

interface OwnerBottomNavProps {
  activeTab: OwnerNavTab | string;
  pendingCount?: number;
  financeLocked?: boolean;
  teamLocked?: boolean;
  /** STAFF-3: yetkiye göre tamamen gizlenen sekmeler (ör. personel için Finans/Ekip). */
  hiddenTabs?: OwnerNavTab[];
  onSelect: (tab: OwnerNavTab) => void;
}

// Ekip TAM ORTADA (5 sekmenin 3.'sü) — operasyonun kalbi, başparmak erişimi.
const tabs: { id: OwnerNavTab; label: string; icon: React.ReactNode }[] = [
  { id: 'HOME', label: 'Özet', icon: <Home size={20} /> },
  { id: 'CALENDAR', label: 'Takvim', icon: <Calendar size={20} /> },
  { id: 'TEAM', label: 'Ekip', icon: <Users size={20} /> },
  { id: 'FINANCE', label: 'Finans', icon: <Wallet size={20} /> },
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
  // Sahalarım artık menüden açılıyor → o ekrandayken "Menü" sekmesi vurgulanır.
  const highlightTab =
    activeTab === 'PENDING_ACTIONS' ? 'HOME' : activeTab === 'PITCHES' ? 'MORE' : activeTab;
  const shownTabs = tabs.filter((t) => !hiddenTabs.includes(t.id));

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0A0E14]/95 backdrop-blur-xl border-t border-white/5 px-2 py-2 z-40 safe-area-pb">
      {/* Üst gradyan scrim: içerik alt bara "akarak" girer, sert çizgi olmaz. */}
      <div className="pointer-events-none absolute left-0 right-0 -top-6 h-6 bg-gradient-to-t from-[#0A0E14] to-transparent" />
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
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 min-h-[48px] justify-center rounded-xl transition-all ${
                isActive
                  ? 'text-blue-400 bg-blue-500/10'
                  : 'text-slate-400 hover:text-white'
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
                  <span className="absolute -bottom-0.5 -right-1 w-2 h-2 bg-slate-600 rounded-full border border-[#0A0E14]" />
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
