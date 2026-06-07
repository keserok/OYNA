import React, { useState } from 'react';
import { Globe, Trophy, Users, Check, X, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface CommunitiesPageProps {
    subRoute: 'TOPLULUKLAR' | 'TAKIMLAR' | 'TURNUVALAR';
}

export const CommunitiesPage: React.FC<CommunitiesPageProps> = ({ subRoute }) => {
    // Initial static mock data derived from original logic
    const [communities, setCommunities] = useState([
        {
            id: 'c1', name: 'Boğaziçi Üniversitesi', domain: '@boun.edu.tr', logo: '🦅',
            memberCount: 1250, isVerified: true,
            modules: { transferMarket: true, leaderboards: true, tournaments: true },
            teams: [
                { id: 't1', name: 'BOUN Crows', wins: 15, losses: 3 },
                { id: 't2', name: 'BOUN Lions', wins: 10, losses: 8 }
            ]
        },
        {
            id: 'c2', name: 'İstanbul Teknik Üniversitesi', domain: '@itu.edu.tr', logo: '🐝',
            memberCount: 980, isVerified: true,
            modules: { transferMarket: true, leaderboards: true, tournaments: false },
            teams: [
                { id: 't3', name: 'ITU Hornets', wins: 12, losses: 6 }
            ]
        }
    ]);

    const [toast, setToast] = useState<string | null>(null);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    };

    const toggleModule = (cId: string, modKey: string) => {
        setCommunities(prev => prev.map(c => {
            if (c.id === cId) {
                return { ...c, modules: { ...c.modules, [modKey]: !(c.modules as any)[modKey] } };
            }
            return c;
        }));
        showToast('Modül durumu güncellendi ✓');
    };

    if (subRoute === 'TOPLULUKLAR') {
        return (
            <div className="p-6 space-y-6">
                <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                        <Globe size={16} className="text-blue-400" /> Üniversite Toplulukları
                    </h2>

                    <div className="space-y-4">
                        {communities.map(c => (
                            <div key={c.id} className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-2xl">
                                        {c.logo}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-white">{c.name}</h3>
                                            {c.isVerified && <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded border border-blue-500/20 uppercase">Doğrulanmış</span>}
                                        </div>
                                        <p className="text-[10px] text-gray-500 font-mono mt-1">{c.domain} • {c.memberCount} Üye • {c.teams.length} Takım</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Aktif Modüller</p>
                                    <div className="flex gap-2">
                                        <button onClick={() => toggleModule(c.id, 'transferMarket')} className={`px-2 py-1 text-[9px] font-bold rounded-lg border flex items-center gap-1 ${c.modules.transferMarket ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                            {c.modules.transferMarket ? <Check size={10} /> : <X size={10} />} Transfer Pazarı
                                        </button>
                                        <button onClick={() => toggleModule(c.id, 'tournaments')} className={`px-2 py-1 text-[9px] font-bold rounded-lg border flex items-center gap-1 ${c.modules.tournaments ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                                            {c.modules.tournaments ? <Check size={10} /> : <X size={10} />} Turnuva Motoru
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {toast && <div className="fixed bottom-10 right-10 bg-green-500/10 text-green-400 px-4 py-2 rounded-lg border border-green-500/20 text-xs font-bold animate-pulse">{toast}</div>}
            </div>
        );
    }

    if (subRoute === 'TURNUVALAR') {
        return (
            <div className="p-6 space-y-6">
                <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                    <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                        <Trophy size={16} className="text-yellow-400" /> Turnuva Fikstür Yönetimi
                    </h2>
                    <div className="py-10 text-center flex flex-col items-center justify-center border border-dashed border-white/10 rounded-xl bg-black/20">
                        <Trophy size={48} className="text-gray-600 mb-4" />
                        <p className="text-xs text-gray-400 font-mono">Boğaziçi Süper Kupa 2026 - Yarı Final Aşaması</p>
                        <p className="text-[10px] text-gray-600 mt-2">Bracket görünümü yakında Supabase üzerinden entegre edilecek.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center h-full text-gray-500 font-mono text-sm">
            {subRoute} Sayfası Yapım Aşamasında 🚀
        </div>
    );
};
