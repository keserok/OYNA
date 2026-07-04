import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Users, ArrowRight, Zap, Building2, UserX, Megaphone, ShieldCheck, Power } from 'lucide-react';
import { useAppStore } from '../../../store';
import { COMMAND_PALETTE_ROUTES } from '../design/adminRoutes';
import { useAdminPermissions } from '../context/AdminPermissionsContext';
import { useAdminFeatureFlags } from '../context/AdminFeatureFlagsContext';
import { useAdminToast } from '../context/AdminToastContext';
import type { GodViewSubRoute } from '../GodViewPanel';

/** Palet aksiyon komutu (Karar #45): navigasyon değil, doğrudan iş. */
interface PaletteAction {
    id: string;
    label: string;
    keywords: string;
    icon: React.ElementType;
    /** Yetki: bu route'a erişebilen görebilir. */
    route: GodViewSubRoute;
    run: (ctx: { navigate: (r: GodViewSubRoute) => void; close: () => void }) => void;
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (route: GodViewSubRoute) => void;
    onSelectPitch?: (pitch: { id: string; name: string }) => void;
    onSelectUser?: (user: { id: string; name: string }) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
    isOpen,
    onClose,
    onNavigate,
    onSelectPitch,
    onSelectUser,
}) => {
    const [query, setQuery] = useState('');
    const adminPitches = useAppStore((s) => s.adminPitches);
    const adminUsers = useAppStore((s) => s.adminUsers);
    const maintenanceMode = useAppStore((s) => s.appSettings.maintenanceMode);
    const { canAccess } = useAdminPermissions();
    const { moduleEnabled } = useAdminFeatureFlags();
    const { info } = useAdminToast();
    const inputRef = useRef<HTMLInputElement>(null);

    // Aksiyon komutları — yetkiye göre süzülür; navigasyon+bağlam tetikler (Karar #45)
    const ACTIONS: PaletteAction[] = useMemo(() => [
        { id: 'new-pitch', label: 'Yeni Tesis Kur', keywords: 'saha tesis ekle kurulum vitrin', icon: Building2, route: 'SAHALAR',
          run: ({ navigate, close }) => { navigate('SAHALAR'); close(); info('Sahalar → "Yeni Tesis Kur" ile kurulum merkezini açın'); } },
        { id: 'go-deletion', label: 'Silme Kuyruğunu Aç', keywords: 'hesap silme kvkk talep', icon: UserX, route: 'DELETION_QUEUE',
          run: ({ navigate, close }) => { navigate('DELETION_QUEUE'); close(); } },
        { id: 'go-verify', label: 'Doğrulama Merkezini Aç', keywords: 'kaleci hakem kimlik onay bekleyen', icon: ShieldCheck, route: 'VERIFICATION',
          run: ({ navigate, close }) => { navigate('VERIFICATION'); close(); } },
        { id: 'go-broadcast', label: 'Toplu Bildirim Gönder', keywords: 'kampanya broadcast duyuru bildirim', icon: Megaphone, route: 'NOTIFICATIONS',
          run: ({ navigate, close }) => { navigate('NOTIFICATIONS'); close(); } },
        { id: 'go-maintenance', label: `Bakım Modu (${maintenanceMode ? 'AÇIK' : 'kapalı'}) — Ayarlar`, keywords: 'bakim maintenance kapat sistem', icon: Power, route: 'SETTINGS',
          run: ({ navigate, close }) => { navigate('SETTINGS'); close(); info('Bakım modu Ayarlar sayfasından yaz-onayla değiştirilir'); } },
    ], [maintenanceMode, info]);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const q = query.trim().toLowerCase();

    const filteredRoutes = useMemo(() => {
        const list = COMMAND_PALETTE_ROUTES.filter(
            (r) => canAccess(r.route) && moduleEnabled(r.route)
                && (!q || r.label.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)),
        );
        return list.slice(0, 8);
    }, [q, canAccess, moduleEnabled]);

    const filteredPitches = useMemo(
        () => adminPitches.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 3),
        [adminPitches, q],
    );

    const filteredUsers = useMemo(
        () => adminUsers
            .filter((u) => u.name.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
            .slice(0, 3),
        [adminUsers, q],
    );

    const filteredActions = useMemo(
        () => ACTIONS.filter((a) =>
            canAccess(a.route) && moduleEnabled(a.route)
            && (!q || a.label.toLowerCase().includes(q) || a.keywords.includes(q)),
        ).slice(0, 5),
        [ACTIONS, q, canAccess, moduleEnabled],
    );

    const routesByCategory = useMemo(() => {
        const map = new Map<string, typeof filteredRoutes>();
        for (const r of filteredRoutes) {
            const arr = map.get(r.category) || [];
            arr.push(r);
            map.set(r.category, arr);
        }
        return map;
    }, [filteredRoutes]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh] p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-w-xl bg-[#0D1117]/95 border border-white/10 rounded-2xl shadow-[0_32px_64px_rgba(0,0,0,0.8)] overflow-hidden z-10 font-sans"
                >
                    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 bg-black/10">
                        <Search size={18} className="text-gray-400 shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode="search"
                            enterKeyHint="search"
                            autoComplete="off"
                            spellCheck={false}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Sayfa, saha veya kullanıcı ara..."
                            className="w-full bg-transparent border-0 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-0"
                        />
                        <span className="text-[10px] font-mono bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-500 shrink-0">
                            ESC
                        </span>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-2 space-y-3">
                        {filteredActions.length > 0 && (
                            <div>
                                <p className="px-3 py-1 text-[9px] font-black text-red-400/70 uppercase tracking-widest">Hızlı Aksiyon</p>
                                <div className="space-y-0.5 mt-1">
                                    {filteredActions.map((a) => {
                                        const Icon = a.icon;
                                        return (
                                            <button
                                                key={a.id}
                                                type="button"
                                                onClick={() => a.run({ navigate: onNavigate, close: onClose })}
                                                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-red-500/[0.06] text-gray-200 hover:text-white transition-all text-xs group"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <Icon size={12} className="text-red-400" />
                                                    <span className="font-bold">{a.label}</span>
                                                </div>
                                                <span className="text-[8px] text-red-400 opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                                                    ÇALIŞTIR <Zap size={8} />
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {Array.from(routesByCategory.entries()).map(([category, routes]) => (
                            <div key={category}>
                                <p className="px-3 py-1 text-[9px] font-black text-gray-500 uppercase tracking-widest">{category}</p>
                                <div className="space-y-0.5 mt-1">
                                    {routes.map((r) => (
                                        <button
                                            key={r.route}
                                            type="button"
                                            onClick={() => { onNavigate(r.route); onClose(); }}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs group"
                                        >
                                            <span className="font-bold">{r.label}</span>
                                            <span className="text-[8px] text-red-400 opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                                                GİT <ArrowRight size={8} />
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {filteredPitches.length > 0 && (
                            <div>
                                <p className="px-3 py-1 text-[9px] font-black text-gray-500 uppercase tracking-widest">Sahalar</p>
                                <div className="space-y-0.5 mt-1">
                                    {filteredPitches.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => {
                                                onSelectPitch?.(p);
                                                onNavigate('SAHALAR');
                                                onClose();
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <MapPin size={12} className="text-gray-400" />
                                                <span className="font-bold">{p.name}</span>
                                                <span className="text-[9px] text-gray-500 font-mono">({p.district || '—'})</span>
                                            </div>
                                            <span className="text-[9px] font-mono font-black text-red-400">₺{p.pricePerPerson}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {filteredUsers.length > 0 && (
                            <div>
                                <p className="px-3 py-1 text-[9px] font-black text-gray-500 uppercase tracking-widest">Kullanıcılar</p>
                                <div className="space-y-0.5 mt-1">
                                    {filteredUsers.map((u) => (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => {
                                                onSelectUser?.(u);
                                                onNavigate('KULLANICILAR');
                                                onClose();
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Users size={12} className="text-gray-400" />
                                                <span className="font-bold">{u.name}</span>
                                                <span className="text-[9px] text-gray-500 font-mono">({u.role})</span>
                                            </div>
                                            <span className="text-[9px] text-gray-500 font-mono truncate max-w-[150px]">{u.email}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {filteredRoutes.length === 0 && filteredPitches.length === 0 && filteredUsers.length === 0 && filteredActions.length === 0 && (
                            <div className="py-8 text-center text-xs text-gray-500 font-mono">
                                {query ? `"${query}" ile eşleşen sonuç yok.` : 'Aramaya başlayın veya bir kategori seçin.'}
                            </div>
                        )}
                    </div>

                    <div className="px-4 py-2 bg-black/20 border-t border-white/5 flex items-center justify-between text-[9px] text-gray-600 font-mono">
                        <span>⌘K ile aç / kapat</span>
                        <span>ESC ile kapat</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
