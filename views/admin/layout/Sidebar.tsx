import React from 'react';
import { useAppStore } from '../../../store';
import {
    Zap, MapPin, Users, Shield, Scale, Megaphone, CreditCard, Settings, Type,
    ChevronLeft, Radio, Swords, LogOut, Lock, Filter, Globe, Trophy, Clock, ScrollText, Building2
} from 'lucide-react';
import type { GodViewSubRoute } from '../GodViewPanel';
import type { AdminSession } from '../../../services/adminService';

interface SidebarProps {
    activeSubRoute: string;
    onNavigate: (route: GodViewSubRoute) => void;
    onBack: () => void;
    onShowToast?: (msg: string) => void;
    pendingVerifCount?: number;
    mode?: 'embedded' | 'standalone';
    adminSession?: AdminSession | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
    activeSubRoute,
    onNavigate,
    onBack,
    pendingVerifCount = 0,
    mode = 'embedded',
    adminSession,
}) => {
    const { adminPitches, adminUsers, adminGoalkeepers, adminReferees, adminMatches, adminDashboardStats } = useAppStore();

    const missingAlerts = adminMatches.filter(m => m.missingPositions?.some(p => p.count > 0)).length;
    const pendingPitches = Number(adminDashboardStats?.pending_pitches ?? 0);
    const openDisputes = Number(adminDashboardStats?.open_disputes ?? 0);
    const communityCount = Number(adminDashboardStats?.total_communities ?? 0);
    const deletionRequests = Number(adminDashboardStats?.deletion_requests ?? 0);

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
                { icon: MapPin, label: 'Sahalar', badge: adminPitches.length, active: activeSubRoute === 'SAHALAR', action: () => onNavigate('SAHALAR') },
                { icon: Users, label: 'Kullanıcılar', badge: adminUsers.length, active: activeSubRoute === 'KULLANICILAR', action: () => onNavigate('KULLANICILAR') },
                { icon: Clock, label: 'Onay Bekl.', badge: pendingVerifCount > 0 ? pendingVerifCount : null, active: activeSubRoute === 'PENDING_VERIFICATIONS', action: () => onNavigate('PENDING_VERIFICATIONS') },
                { icon: Shield, label: 'Tesis Onayları', badge: pendingPitches > 0 ? String(pendingPitches) : null, active: activeSubRoute === 'MODERATION', action: () => onNavigate('MODERATION') },
                { icon: Building2, label: 'SaaS Hesapları', badge: null, active: activeSubRoute === 'OWNER_ACCOUNTS', action: () => onNavigate('OWNER_ACCOUNTS') },
                { icon: Swords, label: 'Maçlar', badge: missingAlerts ? `${missingAlerts}⚠` : adminMatches.length, active: activeSubRoute === 'MATCHES', action: () => onNavigate('MATCHES') },
                { icon: Shield, label: 'Kaleciler', badge: adminGoalkeepers.length, active: activeSubRoute === 'KALECİLER', action: () => onNavigate('KALECİLER') },
                { icon: Scale, label: 'Hakemler', badge: adminReferees.length, active: activeSubRoute === 'HAKEMLER', action: () => onNavigate('HAKEMLER') },
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
                { icon: Megaphone, label: 'Kampanyalar', badge: null, active: activeSubRoute === 'NOTIFICATIONS', action: () => onNavigate('NOTIFICATIONS') },
                { icon: Zap, label: 'İndirim Kodları', badge: Number(adminDashboardStats?.active_promo_codes ?? 0) || null, active: activeSubRoute === 'PROMO_CODES', action: () => onNavigate('PROMO_CODES') },
                { icon: Filter, label: 'Segmentasyon', badge: null, active: activeSubRoute === 'SEGMENTATION', action: () => onNavigate('SEGMENTATION') },
            ]
        },
        {
            label: 'FİNANS',
            items: [
                { icon: CreditCard, label: 'Finans Merkezi', badge: null, active: activeSubRoute === 'FINANCE', action: () => onNavigate('FINANCE') },
                { icon: Scale, label: 'İhtilaflar', badge: openDisputes > 0 ? String(openDisputes) : null, active: activeSubRoute === 'DISPUTES', action: () => onNavigate('DISPUTES') },
            ]
        },
        {
            label: 'SİSTEM',
            items: [
                { icon: ScrollText, label: 'Denetim Kayıtları', badge: null, active: activeSubRoute === 'AUDIT_LOG', action: () => onNavigate('AUDIT_LOG') },
                { icon: Type, label: 'Metinler', badge: null, active: activeSubRoute === 'CONTENT', action: () => onNavigate('CONTENT') },
                { icon: Settings, label: 'Ayarlar', badge: null, active: activeSubRoute === 'SETTINGS', action: () => onNavigate('SETTINGS') },
                { icon: Lock, label: 'Ekipler & Yetkiler', badge: deletionRequests > 0 ? `${deletionRequests}!` : null, active: activeSubRoute === 'ACL', action: () => onNavigate('ACL') },
            ]
        },
    ];

    return (
        <aside className="w-56 bg-[#161B22]/90 backdrop-blur border-r border-white/5 flex flex-col shrink-0 overflow-hidden font-sans">
            {/* Sidebar Logo Header */}
            <div className="px-5 py-4.5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-600/30">
                        <Zap size={14} className="text-white" />
                    </div>
                    <span className="text-xs font-black tracking-widest text-white uppercase italic">
                        OYNA OS
                    </span>
                </div>
                <button
                    onClick={onBack}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                    title="Geri Dön"
                >
                    <ChevronLeft size={16} />
                </button>
            </div>

            {/* Sidebar Navigation Links */}
            <nav className="flex-1 overflow-y-auto custom-scrollbar py-3 px-2 space-y-4">
                {SIDEBAR_GROUPS.map(group => (
                    <div key={group.label} className="space-y-0.5">
                        <p className="px-3 py-1.5 text-[8.5px] text-gray-600 font-black uppercase tracking-wider">
                            {group.label}
                        </p>
                        {group.items.map(({ icon: Icon, label, badge, active, action }) => (
                            <button
                                key={label}
                                onClick={action}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all duration-150 border border-transparent ${
                                    active
                                        ? 'bg-red-600/10 border-red-500/20 text-white font-bold'
                                        : 'text-gray-500 hover:text-gray-250 hover:bg-white/[0.03]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon
                                        size={14}
                                        className={active ? 'text-red-500' : 'text-gray-500 group-hover:text-gray-300'}
                                    />
                                    <span className="text-[11px] font-bold uppercase tracking-wide">
                                        {label}
                                    </span>
                                </div>
                                {badge !== null && badge !== undefined && (
                                    <span
                                        className={`text-[8px] font-black px-1.5 py-0.5 rounded-md border ${
                                            String(badge).includes('⚠')
                                                ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse'
                                                : label === 'Onay Bekl.' && Number(badge) > 0
                                                    ? 'bg-red-500/15 text-red-400 border-red-500/20 animate-pulse'
                                                    : 'bg-white/5 text-gray-400 border-white/5'
                                        }`}
                                    >
                                        {badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                ))}
            </nav>

            {/* Admin Profile & Logout section at the bottom */}
            <div className="border-t border-white/5 p-4 bg-black/10 flex items-center gap-3">
                <img
                    src="https://i.pravatar.cc/150?u=patron"
                    alt="Profil"
                    className="w-9 h-9 rounded-full border border-red-500/20 object-cover shadow-md"
                />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white truncate leading-tight">{adminSession?.name || 'Admin'}</p>
                    <span className="inline-block text-[8px] px-1.5 py-0.5 mt-0.5 bg-red-600/20 text-red-400 font-black rounded-md border border-red-500/10 uppercase tracking-widest scale-90 origin-left">
                        {mode === 'standalone' ? 'OYNA OS' : 'PATRON'}
                    </span>
                </div>
                <button
                    onClick={onBack}
                    title="Çıkış"
                    className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/5"
                >
                    <LogOut size={14} />
                </button>
            </div>
        </aside>
    );
};
