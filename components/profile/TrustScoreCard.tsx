import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ShieldCheck, X } from 'lucide-react';

const RING_R = 21;
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
                className="w-full rounded-[22px] p-3.5 px-4 bg-primary/5 border border-primary/25 flex items-center gap-3.5 hover:bg-primary/10 active:scale-[0.99] transition-all"
            >
                <div className="relative w-[52px] h-[52px] flex items-center justify-center shrink-0">
                    <svg width="52" height="52" viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
                        <circle cx="26" cy="26" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                        <circle
                            cx="26" cy="26" r={RING_R} fill="none"
                            className="stroke-primary"
                            strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={`${RING_C} ${RING_C}`}
                            strokeDashoffset={RING_C * (1 - clamped / 100)}
                        />
                    </svg>
                    <span className="relative text-base font-black text-white">{clamped}</span>
                </div>
                <div className="flex-1 text-left min-w-0">
                    <p className="text-[8px] font-black tracking-[0.14em] uppercase text-white/45 mb-1">Güven Puanı</p>
                    <p className="text-[11px] font-semibold text-white/50 leading-[1.4]">
                        {note || 'Fair-play geçmişin ve katılım disiplininle hesaplanır.'}
                    </p>
                </div>
                <ChevronRight size={16} className="text-white/30 shrink-0" strokeWidth={2.4} />
            </button>

            {/* Açıklama bottom-sheet'i — portal: üst motion sarmalayıcıların stacking
                context'i sheet'i BottomNav'ın altına itmesin */}
            {sheetOpen && createPortal(
                <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSheetOpen(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-bg-main border-t border-white/10 rounded-t-[28px] p-6 pb-10 space-y-4">
                        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <ShieldCheck size={18} className="text-primary" /> Güven Puanı
                            </h3>
                            <button onClick={() => setSheetOpen(false)} aria-label="Kapat" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
                                <X size={15} />
                            </button>
                        </div>
                        <p className="text-[12px] text-gray-400 leading-relaxed">
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
                                <div key={title} className="rounded-2xl p-3.5 bg-white/[0.03] border border-white/[0.08]">
                                    <p className="text-[12px] font-black text-white">{title}</p>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
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
