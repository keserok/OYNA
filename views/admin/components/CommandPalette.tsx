import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Users, Swords, Settings, ArrowRight } from 'lucide-react';
import { useAppStore } from '../../../store';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (route: 'GENEL' | 'CONTROL' | 'SAHALAR' | 'KULLANICILAR' | 'KALECİLER' | 'HAKEMLER' | 'MATCHES' | 'NOTIFICATIONS' | 'CONTENT' | 'SETTINGS' | 'TOPLULUKLAR' | 'TAKIMLAR' | 'TURNUVALAR' | 'PENDING_VERIFICATIONS') => void;
    onSelectPitch?: (pitch: any) => void;
    onSelectUser?: (user: any) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
    isOpen,
    onClose,
    onNavigate,
    onSelectPitch,
    onSelectUser
}) => {
    const [query, setQuery] = useState('');
    const { adminPitches, adminUsers, adminMatches } = useAppStore();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Handle ESC and Enter or hotkeys
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (isOpen) onClose();
            }
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Filter results
    const filteredPitches = adminPitches
        .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 3);

    const filteredUsers = adminUsers
        .filter(u => u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 3);

    const filteredRoutes = [
        { label: 'GENEL PANEL', route: 'GENEL', category: 'Navigasyon' },
        { label: 'KOMUTA MERKEZİ (GHOST MODE)', route: 'CONTROL', category: 'Navigasyon' },
        { label: 'SAHA YÖNETİMİ', route: 'SAHALAR', category: 'Operasyon' },
        { label: 'KULLANICI BİLGİ BANKASI', route: 'KULLANICILAR', category: 'Operasyon' },
        { label: 'MAÇ OPERASYONLARI', route: 'MATCHES', category: 'Operasyon' },
        { label: 'TOPLULUK MERKEZİ', route: 'TOPLULUKLAR', category: 'Topluluk' },
        { label: 'TURNUVA MOTORU', route: 'TURNUVALAR', category: 'Topluluk' },
        { label: 'CMS METİN EDİTÖRÜ', route: 'CONTENT', category: 'Sistem' },
        { label: 'SİSTEM AYARLARI', route: 'SETTINGS', category: 'Sistem' }
    ].filter(r => r.label.toLowerCase().includes(query.toLowerCase())).slice(0, 4);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-md"
                />

                {/* Palette Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="w-full max-w-xl bg-[#0D1117]/95 border border-white/10 rounded-2xl shadow-[0_32px_64px_rgba(0,0,0,0.8)] overflow-hidden z-10 font-sans"
                >
                    {/* Search Bar */}
                    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 bg-black/10">
                        <Search size={18} className="text-gray-400 shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Saha, kullanıcı veya sayfa arayın... (Örn: 'Maslak')"
                            className="w-full bg-transparent border-0 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-0"
                        />
                        <span className="text-[10px] font-mono bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-500 shrink-0">
                            ESC
                        </span>
                    </div>

                    {/* Results Area */}
                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar p-2 space-y-3">
                        {/* Navigasyon Sonuçları */}
                        {filteredRoutes.length > 0 && (
                            <div>
                                <p className="px-3 py-1 text-[9px] font-black text-gray-500 uppercase tracking-widest">NAVİGASYON</p>
                                <div className="space-y-0.5 mt-1">
                                    {filteredRoutes.map((r, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                onNavigate(r.route as any);
                                                onClose();
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs group"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Settings size={12} className="text-gray-400 group-hover:text-red-400" />
                                                <span className="font-bold uppercase tracking-wide">{r.label}</span>
                                            </div>
                                            <span className="text-[8px] bg-red-650/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/10 font-bold opacity-0 group-hover:opacity-100 transition-opacity">GİT <ArrowRight size={8} className="inline ml-0.5" /></span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Sahalar */}
                        {filteredPitches.length > 0 && (
                            <div>
                                <p className="px-3 py-1 text-[9px] font-black text-gray-500 uppercase tracking-widest">SAHALAR</p>
                                <div className="space-y-0.5 mt-1">
                                    {filteredPitches.map((p, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                if (onSelectPitch) onSelectPitch(p);
                                                onNavigate('SAHALAR');
                                                onClose();
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs group"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <MapPin size={12} className="text-gray-400 group-hover:text-red-400" />
                                                <span className="font-bold">{p.name}</span>
                                                <span className="text-[9px] text-gray-500 font-mono">({p.district || 'Bilinmiyor'})</span>
                                            </div>
                                            <span className="text-[9px] font-mono font-black text-red-400">₺{p.pricePerPerson}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Kullanıcılar */}
                        {filteredUsers.length > 0 && (
                            <div>
                                <p className="px-3 py-1 text-[9px] font-black text-gray-500 uppercase tracking-widest">KULLANICILAR</p>
                                <div className="space-y-0.5 mt-1">
                                    {filteredUsers.map((u, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                if (onSelectUser) onSelectUser(u);
                                                onNavigate('KULLANICILAR');
                                                onClose();
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/5 text-gray-300 hover:text-white transition-all text-xs group"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Users size={12} className="text-gray-400 group-hover:text-red-400" />
                                                <span className="font-bold">{u.name}</span>
                                                <span className="text-[9px] text-gray-500 font-mono">({u.role})</span>
                                            </div>
                                            <span className="text-[9px] text-gray-500 font-mono truncate max-w-[150px]">{u.email}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Boş Durum */}
                        {filteredRoutes.length === 0 && filteredPitches.length === 0 && filteredUsers.length === 0 && (
                            <div className="py-8 text-center text-xs text-gray-500 font-mono">
                                "{query}" ile eşleşen sonuç bulunamadı.
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-2 bg-black/20 border-t border-white/5 flex items-center justify-between text-[9px] text-gray-600 font-mono">
                        <span>Seçmek için tıklayın</span>
                        <span>Kapatmak için ESC</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
