import React from 'react';
import { MatchHistorySummary } from '../../services/userService';
import { winStats } from '../../shared/profilePresentation';

/**
 * Premium kartın arka yüzü — performans raporu (son 5 maç, maç sayısı, galibiyet %).
 *
 * IP-18: gol/asist/en iyi puan/trend sabitleri silindi (bkz. aşağıdaki not) ve
 * galibiyet oranı artık ön yüzle AYNI hesaptan gelir (`winStats`) — burada ayrı
 * bir formül vardı ve skorsuz maçları da paydaya katıyordu.
 */
export const PlayerCardBack: React.FC<{ matches: MatchHistorySummary[] }> = ({ matches }) => {
    const last5 = matches.slice(0, 5);
    const { winRate } = winStats(matches);

    // Tier sistemi söküldü (F3=b) — kart arkası tek nötr paletle çizilir.
    const colors = { border: '#3d5566', text: '#9db4c4', label: '#5c7385' };

    return (
        <div className="w-full h-full rounded-[24px] overflow-hidden relative" style={{ background: 'linear-gradient(160deg, #0a0e14 0%, #161B22 50%, #0a0e14 100%)', border: `2px solid ${colors.border}` }}>
            <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="hcb" width="22" height="38" patternUnits="userSpaceOnUse"><path d="M11 0l11 6.35v12.7L11 25.4 0 19.05V6.35z" fill="none" stroke="white" strokeWidth="0.7" /></pattern></defs><rect width="100%" height="100%" fill="url(#hcb)" /></svg>
            </div>
            <div className="relative z-10 h-full flex flex-col justify-between p-5">
                <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${colors.border}66)` }} />
                        <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.3em]" style={{ color: colors.label }}>Performans Raporu</span>
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${colors.border}66)` }} />
                    </div>
                </div>
                <div>
                    <p className="text-[0.625rem] font-extrabold uppercase tracking-widest mb-2" style={{ color: colors.label }}>Son 5 Maç</p>
                    <div className="flex gap-2 justify-center">
                        {last5.map((m, i) => (
                            // IP-18: skoru girilmemiş maç "B" (beraberlik) DEĞİLDİR — "·" ile nötr çizilir.
                            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-[0.6875rem] font-extrabold border ${m.result === 'WIN' ? 'bg-green-500/20 text-green-400 border-green-500/30' : m.result === 'LOSS' ? 'bg-red-500/20 text-red-400 border-red-500/30' : m.result === 'NO_SCORE' ? 'bg-white/5 text-ink-4 border-white/10' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}
                                title={m.result === 'NO_SCORE' ? 'Skor girilmedi' : undefined}>
                                {m.result === 'WIN' ? 'G' : m.result === 'LOSS' ? 'M' : m.result === 'NO_SCORE' ? '·' : 'B'}
                            </div>
                        ))}
                    </div>
                </div>
                {/* IP-18 · karar 11a — kartın arkasındaki dört sayı (gol,
                    pas verme, en yüksek puan ve trend çubukları) kaynak koda
                    ELLE yazılmış sabitlerdi. Bu veriler uygulamada hiç
                    toplanmıyor, dolayısıyla gerçekleşebilecekleri bir yol da
                    yoktu. Silindi; geriye yalnız gerçekten hesaplanan iki şey
                    kalır: son 5 maç ve galibiyet oranı. */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-extrabold" style={{ color: colors.text }}>{matches.length}</span>
                        <p className="text-[0.625rem] font-extrabold uppercase tracking-widest" style={{ color: colors.label }}>Maç</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-extrabold" style={{ color: colors.text }}>{winRate === null ? '—' : `${winRate}%`}</span>
                        <p className="text-[0.625rem] font-extrabold uppercase tracking-widest" style={{ color: colors.label }}>Galibiyet</p>
                    </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${colors.border}44)` }} />
                    <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.2em]" style={{ color: `${colors.label}80` }}>OYNA</span>
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${colors.border}44)` }} />
                </div>
            </div>
        </div>
    );
};
