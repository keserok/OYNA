import React from 'react';
import { Search, ChevronRight, Menu, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../../store';
import { getRouteMeta } from '../design/adminRoutes';

interface TopBarProps {
    activeSubRoute: string;
    onOpenCommandPalette: () => void;
    onToggleMobileMenu?: () => void;
}

/**
 * Üst bar — bilinçli olarak sade: kırıntı navigasyonu + tek arama girişi.
 * Operasyon rozetleri sidebar'da, bakım modu yönetimi Ayarlar sayfasındadır.
 * Bakım modu AKTİFKEN yalnızca bilgilendirici (tıklanamaz) bir uyarı rozeti görünür.
 */
export const TopBar: React.FC<TopBarProps> = ({ activeSubRoute, onOpenCommandPalette, onToggleMobileMenu }) => {
    const maintenanceMode = useAppStore((s) => s.appSettings.maintenanceMode);
    const meta = getRouteMeta(activeSubRoute);

    return (
        <header className="h-14 bg-[#0D1117]/90 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between gap-3 px-4 md:px-6 shrink-0 z-20 sticky top-0">
            <div className="flex items-center gap-3 min-w-0">
                {onToggleMobileMenu && (
                    <button
                        onClick={onToggleMobileMenu}
                        aria-label="Menüyü aç/kapat"
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

            <div className="flex items-center gap-2 shrink-0">
                {maintenanceMode && (
                    <span
                        title="Bakım modu aktif — yönetim: Ayarlar sayfası"
                        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold uppercase tracking-wide"
                    >
                        <AlertTriangle size={11} />
                        <span className="hidden sm:inline">Bakım Modu</span>
                    </span>
                )}

                <button
                    onClick={onOpenCommandPalette}
                    aria-label="Ara (Cmd+K)"
                    className="flex items-center gap-2 h-9 pl-3 pr-2 min-w-[40px] md:min-w-[220px] bg-white/[0.03] border border-white/[0.08] hover:border-white/20 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                >
                    <Search size={14} className="shrink-0" />
                    <span className="hidden md:inline flex-1 text-left text-[12px]">Sayfa, saha, kullanıcı ara…</span>
                    <kbd className="hidden md:inline shrink-0 text-[9px] font-mono text-gray-600 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">⌘K</kbd>
                </button>
            </div>
        </header>
    );
};
