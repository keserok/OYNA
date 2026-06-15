import React from 'react';
import { Search, Bell, Activity, ChevronRight, HardDrive, Menu } from 'lucide-react';
import { useAppStore } from '../../../store';
import { useAdminToast } from '../context/AdminToastContext';
import { getRouteMeta } from '../design/adminRoutes';

interface TopBarProps {
    activeSubRoute: string;
    onOpenCommandPalette: () => void;
    onToggleMobileMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeSubRoute, onOpenCommandPalette, onToggleMobileMenu }) => {
    const { appSettings, updateAppSettings } = useAppStore();
    const { info } = useAdminToast();
    const meta = getRouteMeta(activeSubRoute);

    return (
        <header className="h-14 bg-[#0D1117]/90 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-4 md:px-6 shrink-0 z-20 sticky top-0">
            <div className="flex items-center gap-3 min-w-0">
                {onToggleMobileMenu && (
                    <button 
                        onClick={onToggleMobileMenu}
                        className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white hover:bg-white/10"
                    >
                        <Menu size={16} />
                    </button>
                )}

                <nav className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 min-w-0">
                    <span className="hidden sm:inline text-gray-600">OYNA OS</span>
                    <ChevronRight size={12} className="hidden sm:inline text-gray-700 shrink-0" />
                    <span className="hidden md:inline text-gray-600 shrink-0">{meta.group}</span>
                    <ChevronRight size={12} className="hidden md:inline text-gray-700 shrink-0" />
                    <span className="text-gray-200 truncate">{meta.title}</span>
                </nav>
            </div>

            <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <button
                    onClick={onOpenCommandPalette}
                    className="flex items-center gap-2 h-8 px-3 bg-white/[0.03] border border-white/[0.08] hover:border-white/15 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                >
                    <Search size={13} />
                    <span className="hidden md:inline text-[11px]">Ara</span>
                    <kbd className="hidden md:inline ml-1 text-[9px] font-mono text-gray-600 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">⌘K</kbd>
                </button>

                <button className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-gray-500 hover:text-white relative">
                    <Bell size={14} />
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                </button>

                <button
                    onClick={() => {
                        updateAppSettings({ maintenanceMode: !appSettings.maintenanceMode });
                        info(appSettings.maintenanceMode ? 'Bakım modu kapatıldı' : 'Bakım modu aktif');
                    }}
                    className={`hidden lg:flex items-center gap-1.5 h-8 px-2.5 text-[10px] font-bold rounded-lg border transition-all ${
                        appSettings.maintenanceMode 
                            ? 'bg-red-500/15 text-red-400 border-red-500/30' 
                            : 'bg-white/[0.03] text-gray-500 border-white/[0.06] hover:text-gray-300'
                    }`}
                >
                    <Activity size={11} />
                    {appSettings.maintenanceMode ? 'Bakım' : 'Canlı'}
                </button>

                <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400" title="Supabase">
                    <HardDrive size={10} />
                    <span className="text-[9px] font-bold uppercase hidden sm:inline">Live</span>
                </div>
            </div>
        </header>
    );
};
