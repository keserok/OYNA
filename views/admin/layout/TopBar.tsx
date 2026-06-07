import React from 'react';
import { Search, Bell, Activity, ChevronRight, HardDrive, Menu } from 'lucide-react';
import { useAppStore } from '../../../store';
import { motion } from 'framer-motion';

interface TopBarProps {
    activeSubRoute: string;
    onOpenCommandPalette: () => void;
    onShowToast: (msg: string) => void;
    onToggleMobileMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeSubRoute, onOpenCommandPalette, onShowToast, onToggleMobileMenu }) => {
    const { appSettings, updateAppSettings } = useAppStore();

    return (
        <header className="h-[60px] bg-[#0D1117]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-4 md:px-6 shrink-0 z-20 sticky top-0">
            <div className="flex items-center gap-3">
                {/* Mobile Menu Toggle */}
                {onToggleMobileMenu && (
                    <button 
                        onClick={onToggleMobileMenu}
                        className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 text-white hover:bg-white/10"
                    >
                        <Menu size={16} />
                    </button>
                )}

                {/* Breadcrumbs */}
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                    <span className="hidden md:inline">OYNA OS</span>
                    <ChevronRight size={10} className="hidden md:inline text-gray-600" />
                    <span className="text-gray-300">{activeSubRoute}</span>
                </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-4">
                {/* Global Search Trigger (Cmd + K) */}
                <button
                    onClick={onOpenCommandPalette}
                    className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 hover:border-white/20 rounded-lg text-gray-400 hover:text-white transition-colors group"
                >
                    <Search size={13} className="group-hover:text-red-400 transition-colors" />
                    <span className="hidden md:inline text-[10px] font-mono">Arama Yap...</span>
                    <div className="hidden md:flex items-center gap-0.5 ml-3 opacity-60">
                        <span className="bg-white/10 px-1 py-0.5 rounded text-[8px] font-mono text-gray-300 border border-white/5">⌘</span>
                        <span className="bg-white/10 px-1 py-0.5 rounded text-[8px] font-mono text-gray-300 border border-white/5">K</span>
                    </div>
                </button>

                {/* Notifications */}
                <button className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-colors relative">
                    <Bell size={14} />
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
                </button>

                {/* Maintenance Mode Toggle */}
                <div className="hidden md:block h-4 w-px bg-white/10" />
                
                <button
                    onClick={() => {
                        updateAppSettings({ maintenanceMode: !appSettings.maintenanceMode });
                        onShowToast(appSettings.maintenanceMode ? 'Bakım modu kapatıldı' : '⚠️ Bakım modu AKTİF');
                    }}
                    className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black rounded border transition-all uppercase ${
                        appSettings.maintenanceMode 
                            ? 'bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]' 
                            : 'bg-white/5 text-gray-500 border-white/10 hover:text-white'
                    }`}
                >
                    <Activity size={10} className={appSettings.maintenanceMode ? 'animate-pulse' : ''} />
                    {appSettings.maintenanceMode ? 'BAKIM MODU (KAPALI)' : 'NORMAL MOD (AÇIK)'}
                </button>

                {/* DB Status */}
                <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-md text-green-400 cursor-default" title="Supabase Connected">
                    <HardDrive size={10} />
                    <span className="text-[8px] font-mono font-black uppercase">LIVE</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 ml-1 shadow-[0_0_5px_rgba(34,197,94,0.5)] animate-pulse" />
                </div>
            </div>
        </header>
    );
};
