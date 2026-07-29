import React from 'react';
import { MatchHistorySummary } from '../../services/userService';

/**
 * Premium kartın arka yüzü — performans raporu (son 5 maç, galibiyet %, trend).
 * ProfileScreen içindeki CardBack'ten taşındı; davranış birebir aynı.
 */
export const PlayerCardBack: React.FC<{ tier: 'gold' | 'silver' | 'bronze'; matches: MatchHistorySummary[] }> = ({ tier, matches }) => {
    const last5 = matches.slice(0, 5);
    const wins = matches.filter(m => m.result === 'WIN').length;
    const total = matches.length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const colors = {
        gold: { border: '#d4a84b', text: '#ffd54f', label: '#c8962a' },
        silver: { border: '#8a96c0', text: '#c5cef5', label: '#7888b8' },
        bronze: { border: '#b07840', text: '#d4986a', label: '#8a5c28' }
    }[tier];

    return (
        <div className="w-full h-full rounded-[24px] overflow-hidden relative" style={{ background: 'linear-gradient(160deg, #0a0e14 0%, #161B22 50%, #0a0e14 100%)', border: `2px solid ${colors.border}` }}>
            <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="hcb" width="22" height="38" patternUnits="userSpaceOnUse"><path d="M11 0l11 6.35v12.7L11 25.4 0 19.05V6.35z" fill="none" stroke="white" strokeWidth="0.7" /></pattern></defs><rect width="100%" height="100%" fill="url(#hcb)" /></svg>
            </div>
            <div className="relative z-10 h-full flex flex-col justify-between p-5">
                <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${colors.border}66)` }} />
                        <span className="text-[8px] font-extrabold uppercase tracking-[0.3em]" style={{ color: colors.label }}>Performans Raporu</span>
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${colors.border}66)` }} />
                    </div>
                </div>
                <div>
                    <p className="text-[8px] font-extrabold uppercase tracking-widest mb-2" style={{ color: colors.label }}>Son 5 Maç</p>
                    <div className="flex gap-2 justify-center">
                        {last5.map((m, i) => (
                            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-extrabold border ${m.result === 'WIN' ? 'bg-green-500/20 text-green-400 border-green-500/30' : m.result === 'LOSS' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                                {m.result === 'WIN' ? 'G' : m.result === 'LOSS' ? 'M' : 'B'}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-extrabold" style={{ color: colors.text }}>18</span>
                        <p className="text-[7px] font-extrabold uppercase tracking-widest" style={{ color: colors.label }}>Gol</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-extrabold" style={{ color: colors.text }}>12</span>
                        <p className="text-[7px] font-extrabold uppercase tracking-widest" style={{ color: colors.label }}>Asist</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-extrabold" style={{ color: colors.text }}>9.2</span>
                        <p className="text-[7px] font-extrabold uppercase tracking-widest" style={{ color: colors.label }}>En İyi Puan</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-extrabold" style={{ color: colors.text }}>{winRate}%</span>
                        <p className="text-[7px] font-extrabold uppercase tracking-widest" style={{ color: colors.label }}>Galibiyet</p>
                    </div>
                </div>
                <div>
                    <p className="text-[8px] font-extrabold uppercase tracking-widest mb-1.5" style={{ color: colors.label }}>Performans Trendi</p>
                    <div className="flex items-end gap-[3px] h-8 justify-center">
                        {[7.2, 8.1, 6.5, 8.8, 9.2, 7.8, 8.5, 9.0, 7.5, 8.2].map((v, i) => (
                            <div key={i} className="w-3 rounded-sm" style={{ height: `${(v / 10) * 100}%`, background: v >= 8 ? 'linear-gradient(to top, #22c55e, #4ade80)' : v >= 7 ? 'linear-gradient(to top, #eab308, #facc15)' : 'linear-gradient(to top, #ef4444, #f87171)' }} />
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${colors.border}44)` }} />
                    <span className="text-[7px] font-extrabold uppercase tracking-[0.2em]" style={{ color: `${colors.label}80` }}>OYNA</span>
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${colors.border}44)` }} />
                </div>
            </div>
        </div>
    );
};
