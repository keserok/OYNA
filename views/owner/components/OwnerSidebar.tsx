import React from 'react';
import { Calendar, Home, MoreHorizontal, Users, Wallet, LogOut, Building2, Lock } from 'lucide-react';
import type { OwnerNavTab } from './OwnerBottomNav';

interface OwnerSidebarProps {
  activeTab: OwnerNavTab | string;
  pendingCount?: number;
  financeLocked?: boolean;
  teamLocked?: boolean;
  facilityName?: string;
  onSelect: (tab: OwnerNavTab) => void;
  onExit: () => void;
}

const tabs: { id: OwnerNavTab; label: string; icon: React.ReactNode }[] = [
  { id: 'HOME', label: 'Özet', icon: <Home size={20} /> },
  { id: 'CALENDAR', label: 'Takvim', icon: <Calendar size={20} /> },
  { id: 'FINANCE', label: 'Finans', icon: <Wallet size={20} /> },
  { id: 'TEAM', label: 'Ekip', icon: <Users size={20} /> },
  { id: 'MORE', label: 'Menü & Ayarlar', icon: <MoreHorizontal size={20} /> },
];

/**
 * Masaüstü (lg+) yan menü. Mobilde gizli; OwnerBottomNav ile aynı sekmeleri
 * dikey/etiketli olarak gösterir. Pure-CSS responsive: bottom nav `lg:hidden`,
 * bu menü `hidden lg:flex` — JS breakpoint mantığı yok, flicker yok.
 */
export const OwnerSidebar: React.FC<OwnerSidebarProps> = ({
  activeTab,
  pendingCount = 0,
  financeLocked,
  teamLocked,
  facilityName,
  onSelect,
  onExit,
}) => {
  const highlightTab =
    activeTab === 'PENDING_ACTIONS' || activeTab === 'PITCHES' ? 'HOME' : activeTab;

  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 z-40 flex-col bg-[#161B22] border-r border-white/5">
      {/* Header — marka + tesis adı */}
      <div className="px-5 pt-6 pb-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Building2 size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white tracking-wide leading-tight">OYNA İŞLETME</h1>
            <p className="text-[11px] text-emerald-400 font-medium truncate">{facilityName ?? 'Tesisim'}</p>
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
        {tabs.map((tab) => {
          const isActive = highlightTab === tab.id;
          const locked =
            (tab.id === 'FINANCE' && financeLocked) || (tab.id === 'TEAM' && teamLocked);
          const showBadge = tab.id === 'HOME' && pendingCount > 0;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                isActive
                  ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <span className="relative shrink-0">
                {tab.icon}
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 bg-amber-500 text-black text-[9px] font-black rounded-full flex items-center justify-center">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </span>
              <span className="flex-1 text-left">{tab.label}</span>
              {locked && <Lock size={13} className="text-slate-600 shrink-0" />}
            </button>
          );
        })}
      </nav>

      {/* Footer — çıkış */}
      <div className="px-3 py-4 border-t border-white/5">
        <button
          type="button"
          onClick={onExit}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut size={20} className="shrink-0" />
          <span>Çıkış</span>
        </button>
      </div>
    </aside>
  );
};

export default OwnerSidebar;
