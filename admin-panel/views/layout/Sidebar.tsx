import React from 'react';
import { useAppStore } from '../../../store';
import { Zap, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import type { GodViewSubRoute } from '../GodViewPanel';
import type { AdminSession } from '../../services/adminService';
import { useAdminPermissions } from '../context/AdminPermissionsContext';
import { useAdminFeatureFlags } from '../context/AdminFeatureFlagsContext';
import { SIDEBAR_GROUPS, type AdminBadgeKey, type AdminRouteDef } from '../design/adminRoutes';

interface SidebarProps {
    activeSubRoute: string;
    onNavigate: (route: GodViewSubRoute) => void;
    onBack: () => void;
    onShowToast?: (msg: string) => void;
    pendingVerifCount?: number;
    providerIdentityCount?: number;
    verificationCount?: number;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
    mode?: 'embedded' | 'standalone';
    adminSession?: AdminSession | null;
}

interface BadgeValue {
    text: string;
    tone: 'neutral' | 'alert' | 'warn';
}

export const Sidebar: React.FC<SidebarProps> = ({
    activeSubRoute,
    onNavigate,
    onBack,
    pendingVerifCount = 0,
    providerIdentityCount = 0,
    verificationCount = 0,
    collapsed = false,
    onToggleCollapse,
    mode = 'embedded',
    adminSession,
}) => {
    const { canAccess, roleLabel } = useAdminPermissions();
    const { moduleEnabled } = useAdminFeatureFlags();
    const stats = useAppStore((s) => s.adminDashboardStats);
    const missingAlerts = useAppStore((s) =>
        s.adminMatches.reduce((n, m) => n + (m.missingPositions?.some((p) => p.count > 0) ? 1 : 0), 0),
    );

    const n = (v: unknown) => Number(v ?? 0);
    const verifTotal = verificationCount || (pendingVerifCount + providerIdentityCount);

    /** Registry'deki badge anahtarını canlı sayaca çevirir; null → rozet yok. */
    const resolveBadge = (key: AdminBadgeKey | undefined): BadgeValue | null => {
        if (!key) return null;
        switch (key) {
            case 'live': return { text: 'CANLI', tone: 'neutral' };
            case 'pitches': return n(stats?.total_pitches) ? { text: String(n(stats?.total_pitches)), tone: 'neutral' } : null;
            case 'users': return n(stats?.total_users) ? { text: String(n(stats?.total_users)), tone: 'neutral' } : null;
            case 'matches':
                if (missingAlerts) return { text: `${missingAlerts}⚠`, tone: 'warn' };
                return n(stats?.total_matches) ? { text: String(n(stats?.total_matches)), tone: 'neutral' } : null;
            case 'goalkeepers': return n(stats?.active_goalkeepers) ? { text: String(n(stats?.active_goalkeepers)), tone: 'neutral' } : null;
            case 'referees': return n(stats?.active_referees) ? { text: String(n(stats?.active_referees)), tone: 'neutral' } : null;
            case 'pendingPitches': return n(stats?.pending_pitches) ? { text: String(n(stats?.pending_pitches)), tone: 'alert' } : null;
            case 'openDisputes': return n(stats?.open_disputes) ? { text: String(n(stats?.open_disputes)), tone: 'alert' } : null;
            case 'verification': return verifTotal > 0 ? { text: String(verifTotal), tone: 'alert' } : null;
            case 'activePromos': return n(stats?.active_promo_codes) ? { text: String(n(stats?.active_promo_codes)), tone: 'neutral' } : null;
            case 'communities': return n(stats?.total_communities) ? { text: String(n(stats?.total_communities)), tone: 'neutral' } : null;
            default: return null;
        }
    };

    const isItemActive = (def: AdminRouteDef) =>
        activeSubRoute === def.route || (def.activeAlso ?? []).includes(activeSubRoute as GodViewSubRoute);

    const visibleGroups = SIDEBAR_GROUPS
        .map((group) => ({
            label: group.label,
            items: group.items.filter((def) => canAccess(def.route) && moduleEnabled(def.route)),
        }))
        // Karar #44: yetki/flag filtresinden sonra boş kalan grup başlığıyla birlikte gizlenir.
        .filter((group) => group.items.length > 0);

    return (
        <aside className={`${collapsed ? 'w-16' : 'w-56'} bg-[#161B22]/90 backdrop-blur border-r border-white/5 flex flex-col shrink-0 overflow-hidden font-sans transition-[width] duration-200`}>
            {/* Sidebar Logo Header */}
            <div className={`py-4.5 border-b border-white/5 flex items-center ${collapsed ? 'px-2 justify-center' : 'px-5 justify-between'}`}>
                {!collapsed && (
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-600/30">
                            <Zap size={14} className="text-white" />
                        </div>
                        <span className="text-xs font-black tracking-widest text-white uppercase italic">
                            OYNA OS
                        </span>
                    </div>
                )}
                <button
                    onClick={() => (onToggleCollapse ? onToggleCollapse() : onBack())}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                    title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
                >
                    {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
            </div>

            {/* Sidebar Navigation Links */}
            <nav className="flex-1 overflow-y-auto custom-scrollbar py-3 px-2 space-y-4">
                {visibleGroups.map((group) => (
                    <div key={group.label} className="space-y-0.5">
                        {!collapsed && (
                            <p className="px-3 py-1.5 text-[8.5px] text-gray-600 font-black uppercase tracking-wider">
                                {group.label}
                            </p>
                        )}
                        {group.items.map((def) => {
                            const Icon = def.icon;
                            const active = isItemActive(def);
                            const badge = resolveBadge(def.badge);
                            return (
                                <button
                                    key={def.route}
                                    onClick={() => onNavigate(def.route)}
                                    title={collapsed ? def.label : undefined}
                                    className={`relative w-full flex items-center px-3 py-2 rounded-xl text-left transition-all duration-150 border ${collapsed ? 'justify-center' : 'justify-between'} ${
                                        active
                                            ? 'bg-red-600/10 border-red-500/20 text-white font-bold shadow-[inset_3px_0_0_0_rgba(239,68,68,0.8)]'
                                            : 'border-transparent text-gray-500 hover:text-gray-250 hover:bg-white/[0.03]'
                                    }`}
                                >
                                    <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
                                        <Icon
                                            size={14}
                                            className={active ? 'text-red-500' : 'text-gray-500 group-hover:text-gray-300'}
                                        />
                                        {!collapsed && (
                                            <span className="text-[11px] font-bold uppercase tracking-wide">
                                                {def.label}
                                            </span>
                                        )}
                                    </div>
                                    {badge && (
                                        collapsed ? (
                                            <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                                                badge.tone === 'neutral' ? 'bg-gray-500' : 'bg-red-500'
                                            }`} />
                                        ) : (
                                            <span
                                                className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border ${
                                                    badge.tone === 'warn'
                                                        ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse'
                                                        : badge.tone === 'alert'
                                                            ? 'bg-red-500/15 text-red-400 border-red-500/20 animate-pulse'
                                                            : 'bg-white/5 text-gray-400 border-white/5'
                                                }`}
                                            >
                                                {badge.text}
                                            </span>
                                        )
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Admin Profile & Logout section at the bottom */}
            <div className={`border-t border-white/5 p-4 bg-black/10 flex items-center gap-3 ${collapsed ? 'flex-col' : ''}`}>
                <img
                    src={adminSession?.email ? `https://ui-avatars.com/api/?name=${encodeURIComponent(adminSession.name)}&background=dc2626&color=fff` : 'https://i.pravatar.cc/150?u=patron'}
                    alt="Profil"
                    className="w-9 h-9 rounded-full border border-red-500/20 object-cover shadow-md"
                />
                {!collapsed && (
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white truncate leading-tight">{adminSession?.name || 'Admin'}</p>
                        <span className="inline-block text-[8px] px-1.5 py-0.5 mt-0.5 bg-red-600/20 text-red-400 font-black rounded-md border border-red-500/10 uppercase tracking-widest scale-90 origin-left">
                            {mode === 'standalone' ? roleLabel : 'PATRON'}
                        </span>
                    </div>
                )}
                <button
                    onClick={() => { if (window.confirm('Panelden çıkış yapmak istediğinize emin misiniz?')) onBack(); }}
                    title="Çıkış"
                    className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/5"
                >
                    <LogOut size={14} />
                </button>
            </div>
        </aside>
    );
};
