import React from 'react';
import { useAppStore } from '../../../store';
import { DataTable } from '../components/DataTable';
import { Swords, ShieldAlert, Eye, Send } from 'lucide-react';

export const MatchesPage: React.FC = () => {
    const { adminMatches } = useAppStore();

    const missingAlerts = adminMatches.filter(m => m.missingPositions.some(p => p.count > 0)).length;

    const columns = [
        {
            header: 'MAÇ ID',
            key: 'id',
            className: 'font-mono text-gray-400 text-[10px]'
        },
        {
            header: 'SAHA / KONUM',
            render: (m: any) => (
                <div>
                    <div className="font-bold text-white text-xs">{m.location || m.title}</div>
                    <div className="text-[9px] text-gray-500 font-mono mt-0.5">{m.date} - {m.time}</div>
                </div>
            )
        },
        {
            header: 'FİYAT & ZORLUK',
            render: (m: any) => (
                <div className="font-mono text-[10px]">
                    <span className="text-green-400 font-bold">₺{m.price}</span> / <span className="text-gray-400">Diff: {m.difficulty}/5</span>
                </div>
            )
        },
        {
            header: 'DURUM',
            render: (m: any) => {
                const isMissing = m.missingPositions.some((p: any) => p.count > 0);
                return (
                    <span className={`text-[9px] font-black px-2 py-1 rounded border uppercase tracking-wider ${isMissing ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-green-500/10 text-[#39FF14] border-[#39FF14]/30'}`}>
                        {isMissing ? 'EKSİK KADRO' : 'TAM KADRO'}
                    </span>
                );
            }
        },
        {
            header: 'AKSİYONLAR',
            render: (m: any) => (
                <div className="flex gap-2">
                    <button title="İzle" className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg border border-blue-500/20 transition-all">
                        <Eye size={14} />
                    </button>
                    <button title="Push Bildirim Gönder" className="p-1.5 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-lg border border-purple-500/20 transition-all">
                        <Send size={14} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="p-6 space-y-6">
            {/* Alerts Row */}
            {missingAlerts > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex items-center gap-3">
                    <ShieldAlert size={20} className="text-yellow-400 animate-pulse" />
                    <div>
                        <p className="text-xs font-black text-yellow-400 uppercase tracking-widest">Aksiyon Gerekiyor</p>
                        <p className="text-[10px] text-yellow-500/70 mt-0.5">Sistemde kadrosu eksik {missingAlerts} maç bulunuyor. Yedek oyuncu bildirimleri devrede.</p>
                    </div>
                </div>
            )}

            <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Swords size={16} className="text-red-500" /> Maç Operasyonları
                </h2>
                <DataTable columns={columns} data={adminMatches} />
            </div>
        </div>
    );
};
