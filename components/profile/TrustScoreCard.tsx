import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';

const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;

export interface TrustScoreCardProps {
    /** 0–100 */
    score: number;
    note?: string;
}

/**
 * Güven puanı kartı: dairesel ilerleme halkası + açıklama; dokununca
 * puanın nasıl hesaplandığını anlatan bottom-sheet açılır.
 */
export const TrustScoreCard: React.FC<TrustScoreCardProps> = ({ score, note }) => {
    const [sheetOpen, setSheetOpen] = useState(false);
    const clamped = Math.max(0, Math.min(100, Math.round(score)));

    return (
        <>
            <button
                onClick={() => setSheetOpen(true)}
                className="w-full rounded-3xl p-4 bg-surface-1 shadow-[0_10px_30px_rgba(0,0,0,0.3)] flex items-center gap-3.5 hover:bg-white/[0.06] active:scale-[0.99] transition-all"
            >
                <div className="relative w-[46px] h-[46px] flex items-center justify-center shrink-0">
                    <svg width="46" height="46" viewBox="0 0 46 46" className="absolute inset-0 -rotate-90">
                        <circle cx="23" cy="23" r={RING_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
                        <circle
                            cx="23" cy="23" r={RING_R} fill="none"
                            className="stroke-primary"
                            strokeWidth="4" strokeLinecap="round"
                            strokeDasharray={`${RING_C} ${RING_C}`}
                            strokeDashoffset={RING_C * (1 - clamped / 100)}
                        />
                    </svg>
                    <span className="relative text-[0.9375rem] font-bold text-[#F5F3EE]">{clamped}</span>
                </div>
                <div className="flex-1 text-left min-w-0">
                    <p className="text-[0.6875rem] font-semibold tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55] mb-[3px]">Güven Puanı</p>
                    <p className="text-[0.8125rem] italic text-[#F5F3EE]/[0.6] leading-[1.45]">
                        {note || 'Fair-play geçmişin ve katılım disiplininle hesaplanır.'}
                    </p>
                </div>
                <span aria-hidden className="text-[#F5F3EE]/[0.5] shrink-0">→</span>
            </button>

            {/* Açıklama bottom-sheet'i — portal: üst motion sarmalayıcıların stacking
                context'i sheet'i BottomNav'ın altına itmesin.
                `pf-serif` BURAYA AYRICA yazılır: sayfa <body>'ye çizildiği için
                profil ekranının yazı tipini miras alamaz. */}
            {sheetOpen && createPortal(
                <div className="pf-serif fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSheetOpen(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-bg-main text-[#F5F3EE] border-t border-white/10 rounded-t-[28px] p-6 pb-10 space-y-4">
                        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold uppercase tracking-[0.18em] flex items-center gap-2">
                                <ShieldCheck size={18} className="text-primary" /> Güven Puanı
                            </h3>
                            <button onClick={() => setSheetOpen(false)} aria-label="Kapat" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#F5F3EE]/[0.6] hover:text-[#F5F3EE] transition-colors">
                                <X size={15} />
                            </button>
                        </div>
                        <p className="text-xs italic text-[#F5F3EE]/[0.6] leading-relaxed">
                            Güven puanın 0–100 arasındadır ve sahadaki güvenilirliğini özetler. Maç sonu
                            değerlendirmeleri, fair-play geçmişin (kartlar, olaysız maçlar) ve katılım
                            disiplinin (maça gelme, zamanında iptal) puanını belirler.
                        </p>
                        <div className="space-y-2">
                            {[
                                ['Maçlarına zamanında gel', 'Gelmediğin maçlar puanı en hızlı düşüren etkendir.'],
                                ['Fair-play oyna', 'Kartsız tamamlanan maçlar puanını yukarı taşır.'],
                                ['Değerlendirmeleri önemse', 'Maç sonu takım arkadaşlarının oyları puana işlenir.'],
                            ].map(([title, sub]) => (
                                <div key={title} className="rounded-2xl p-3.5 bg-surface-1 border border-white/[0.08]">
                                    <p className="text-xs font-semibold text-[#F5F3EE]">{title}</p>
                                    <p className="text-[0.75rem] italic text-[#F5F3EE]/[0.55] mt-0.5">{sub}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
