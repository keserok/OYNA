import React from 'react';
import { useAppStore } from '../../../store';
import {
    Zap, MapPin, Users, Shield, Scale, Megaphone, CreditCard, Settings, Type,
    ChevronLeft, ChevronRight, Radio, Swords, LogOut, Lock, Globe, Trophy, ScrollText,
    ShieldCheck, AlertOctagon, SlidersHorizontal, MessageSquare
} from 'lucide-react';
import type { GodViewSubRoute } from '../GodViewPanel';
import type { AdminSession } from '../../services/adminService';
import { useAdminPermissions } from '../context/AdminPermissionsContext';
import { useAdminFeatureFlags } from '../context/AdminFeatureFlagsContext';

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

    const totalPitches = Number(stats?.total_pitches ?? 0);
    const totalUsers = Number(stats?.total_users ?? 0);
    const totalMatches = Number(stats?.total_matches ?? 0);
    const totalGk = Number(stats?.active_goalkeepers ?? 0);
    const totalRef = Number(stats?.active_referees ?? 0);
    const pendingPitches = Number(stats?.pending_pitches ?? 0);
    const openDisputes = Number(stats?.open_disputes ?? 0);
    const communityCount = Number(stats?.total_communities ?? 0);

    const routeForLabel = (label: string): GodViewSubRoute | null => {
        const map: Record<string, GodViewSubRoute> = {
            'Genel': 'GENEL', 'Komuta Merkezi': 'CONTROL', 'Sahalar': 'SAHALAR', 'Kullanıcılar': 'KULLANICILAR',
            'Doğrulama': 'VERIFICATION', 'Onay Bekl.': 'PENDING_VERIFICATIONS', 'Kimlik Doğr.': 'PROVIDER_IDENTITIES', 'Hizmet İtirazları': 'SERVICE_DISPUTES',
            'Tesis Onayları': 'MODERATION',
            'Maçlar': 'MATCHES', 'Kaleciler': 'KALECİLER', 'Hakemler': 'HAKEMLER', 'Topluluklar': 'TOPLULUKLAR',
            'Takımlar': 'TAKIMLAR', 'Turnuvalar': 'TURNUVALAR', 'Kampanyalar': 'NOTIFICATIONS', 'Bildirim Şablonları': 'NOTIFICATION_TEMPLATES',
            'İndirim Kodları': 'PROMO_CODES', 'Finans Merkezi': 'FINANCE', 'İhtilaflar': 'DISPUTES', 'Komisyon': 'COMMISSION',
            'Denetim Kayıtları': 'AUDIT_LOG', 'Metinler': 'CONTENT', 'Ayarlar': 'SETTINGS', 'Parametreler': 'SYSTEM_PARAMS', 'Ekipler & Yetkiler': 'ACL',
        };
        return map[label] ?? null;
    };

    const SIDEBAR_GROUPS = [
        {
            label: 'BÖLGE KOMUTASI',
            items: [
                { icon: Radio, label: 'Genel', badge: null, active: activeSubRoute === 'GENEL', action: () => onNavigate('GENEL') },
                { icon: Zap, label: 'Komuta Merkezi', badge: 'CANLI', active: activeSubRoute === 'CONTROL', action: () => onNavigate('CONTROL') }
            ]
        },
        {
            label: 'OPERASYON',
            items: [
                { icon: MapPin, label: 'Sahalar', badge: totalPitches || null, active: activeSubRoute === 'SAHALAR', action: () => onNavigate('SAHALAR') },
                { icon: Users, label: 'Kullanıcılar', badge: totalUsers || null, active: activeSubRoute === 'KULLANICILAR', action: () => onNavigate('KULLANICILAR') },
                { icon: ShieldCheck, label: 'Doğrulama', badge: (verificationCount || (pendingVerifCount + providerIdentityCount)) > 0 ? (verificationCount || (pendingVerifCount + providerIdentityCount)) : null, active: activeSubRoute === 'VERIFICATION' || activeSubRoute === 'PENDING_VERIFICATIONS' || activeSubRoute === 'PROVIDER_IDENTITIES', action: () => onNavigate('VERIFICATION') },
                { icon: Shield, label: 'Tesis Onayları', badge: pendingPitches > 0 ? String(pendingPitches) : null, active: activeSubRoute === 'MODERATION', action: () => onNavigate('MODERATION') },
                { icon: Swords, label: 'Maçlar', badge: missingAlerts ? `${missingAlerts}⚠` : (totalMatches || null), active: activeSubRoute === 'MATCHES', action: () => onNavigate('MATCHES') },
                { icon: Shield, label: 'Kaleciler', badge: totalGk || null, active: activeSubRoute === 'KALECİLER', action: () => onNavigate('KALECİLER') },
                { icon: Scale, label: 'Hakemler', badge: totalRef || null, active: activeSubRoute === 'HAKEMLER', action: () => onNavigate('HAKEMLER') },
            ]
        },
        {
            label: 'TOPLULUK YÖNETİMİ',
            items: [
                { icon: Globe, label: 'Topluluklar', badge: communityCount || null, active: activeSubRoute === 'TOPLULUKLAR', action: () => onNavigate('TOPLULUKLAR') },
                { icon: Users, label: 'Takımlar', badge: null, active: activeSubRoute === 'TAKIMLAR', action: () => onNavigate('TAKIMLAR') },
                { icon: Trophy, label: 'Turnuvalar', badge: null, active: activeSubRoute === 'TURNUVALAR', action: () => onNavigate('TURNUVALAR') }
            ]
        },
        {
            label: 'PAZARLAMA',
            items: [
                { icon: Megaphone, label: 'Kampanyalar', badge: null, active: activeSubRoute === 'NOTIFICATIONS' || activeSubRoute === 'SEGMENTATION', action: () => onNavigate('NOTIFICATIONS') },
                { icon: MessageSquare, label: 'Bildirim Şablonları', badge: null, active: activeSubRoute === 'NOTIFICATION_TEMPLATES', action: () => onNavigate('NOTIFICATION_TEMPLATES') },
                { icon: Zap, label: 'İndirim Kodları', badge: Number(stats?.active_promo_codes ?? 0) || null, active: activeSubRoute === 'PROMO_CODES', action: () => onNavigate('PROMO_CODES') },
            ]
        },
        {
            label: 'FİNANS',
            items: [
                { icon: CreditCard, label: 'Finans Merkezi', badge: null, active: activeSubRoute === 'FINANCE', action: () => onNavigate('FINANCE') },
                { icon: Scale, label: 'İhtilaflar', badge: openDisputes > 0 ? String(openDisputes) : null, active: activeSubRoute === 'DISPUTES', action: () => onNavigate('DISPUTES') },
                { icon: AlertOctagon, label: 'Hizmet İtirazları', badge: null, active: activeSubRoute === 'SERVICE_DISPUTES', action: () => onNavigate('SERVICE_DISPUTES') },
                { icon: Zap, label: 'Komisyon', badge: null, active: activeSubRoute === 'COMMISSION', action: () => onNavigate('COMMISSION') },
            ]
        },
        {
            label: 'SİSTEM',
            items: [
                { icon: ScrollText, label: 'Denetim Kayıtları', badge: null, active: activeSubRoute === 'AUDIT_LOG', action: () => onNavigate('AUDIT_LOG') },
                { icon: Type, label: 'Metinler', badge: null, active: activeSubRoute === 'CONTENT', action: () => onNavigate('CONTENT') },
                { icon: Settings, label: 'Ayarlar', badge: null, active: activeSubRoute === 'SETTINGS', action: () => onNavigate('SETTINGS') },
                { icon: SlidersHorizontal, label: 'Parametreler', badge: null, active: activeSubRoute === 'SYSTEM_PARAMS', action: () => onNavigate('SYSTEM_PARAMS') },
                { icon: Lock, label: 'Ekipler & Yetkiler', badge: null, active: activeSubRoute === 'ACL', action: () => onNavigate('ACL') },
            ]
        },
    ];

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
                {SIDEBAR_GROUPS.map(group => (
                    <div key={group.label} className="space-y-0.5">
                        {!collapsed && (
                            <p className="px-3 py-1.5 text-[8.5px] text-gray-600 font-black uppercase tracking-wider">
                                {group.label}
                            </p>
                        )}
                        {group.items
                            .filter(({ label }) => {
                                const route = routeForLabel(label);
                                return !route || (canAccess(route) && moduleEnabled(route));
                            })
                            .map(({ icon: Icon, label, badge, active, action }) => (
                            <button
                                key={label}
                                onClick={action}
                                title={collapsed ? label : undefined}
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
                                            {label}
                                        </span>
                                    )}
                                </div>
                                {badge !== null && badge !== undefined && (
                                    collapsed ? (
                                        <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                                            (String(badge).includes('⚠') || ((label === 'Onay Bekl.' || label === 'Kimlik Doğr.' || label === 'Doğrulama') && Number(badge) > 0))
                                                ? 'bg-red-500' : 'bg-gray-500'
                                        }`} />
                                    ) : (
                                        <span
                                            className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border ${
                                                String(badge).includes('⚠')
                                                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse'
                                                    : (label === 'Onay Bekl.' || label === 'Kimlik Doğr.' || label === 'Doğrulama') && Number(badge) > 0
                                                        ? 'bg-red-500/15 text-red-400 border-red-500/20 animate-pulse'
                                                        : 'bg-white/5 text-gray-400 border-white/5'
                                            }`}
                                        >
                                            {badge}
                                        </span>
                                    )
                                )}
                            </button>
                        ))}
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
