import React, { useState } from 'react';
import { MatchHistorySummary } from '../../services/userService';

export interface MatchHistorySectionProps {
    matches: MatchHistorySummary[];
    /** Verilmezse satırlar tıklanamaz (salt-okunur profil). */
    onOpen?: (id: string) => void;
}

/** Tasarım 3a: sonuç, skorun renginden değil soldaki harf rozetinden okunur. */
const RESULT_BADGE: Record<MatchHistorySummary['result'], { harf: string; sinif: string; etiket: string }> = {
    WIN: { harf: 'G', sinif: 'bg-primary/15 border-primary/35 text-primary', etiket: 'Galibiyet' },
    DRAW: { harf: 'B', sinif: 'bg-warning/15 border-warning/35 text-warning', etiket: 'Beraberlik' },
    LOSS: { harf: 'M', sinif: 'bg-error/15 border-error/35 text-error', etiket: 'Mağlubiyet' },
    // IP-18: skoru girilmemiş maç bir SONUÇ değildir — nötr çizilir, yeşil/
    // kırmızı/sarı üçlüsüne girmez.
    NO_SCORE: { harf: '–', sinif: 'bg-white/[0.06] border-white/[0.15] text-[#F5F3EE]/[0.55]', etiket: 'Skor girilmedi' },
};

/** Başlangıçta gösterilen satır sayısı; gerisi "Tümü" ile yerinde açılır. */
const ILK_GOSTERIM = 4;

/**
 * Maç geçmişi listesi (tasarım 3a "İnce Neon"): tek kart içinde son 4 maç,
 * başlığın sağında "Tümü →". Kullanıcı kararı: ayrı bir "tüm maçlar" sayfası
 * açılmaz — liste yerinde uzayıp kısalır. Skorlar BEYAZ; kazandın/kaybettin
 * bilgisi soldaki renkli harf rozetinden okunur.
 */
export const MatchHistorySection: React.FC<MatchHistorySectionProps> = ({ matches, onOpen }) => {
    const [hepsiAcik, setHepsiAcik] = useState(false);
    const gorunen = hepsiAcik ? matches : matches.slice(0, ILK_GOSTERIM);
    const fazlasiVar = matches.length > ILK_GOSTERIM;

    return (
        <div>
            <div className="flex items-baseline justify-between mt-6 mb-2.5 px-0.5">
                <span className="text-[1.0625rem] font-bold text-[#F5F3EE]">Maç Geçmişi</span>
                {fazlasiVar && (
                    <button
                        onClick={() => setHepsiAcik(a => !a)}
                        className="text-[0.75rem] italic text-[#F5F3EE]/[0.55] hover:text-[#F5F3EE] transition-colors"
                    >
                        {hepsiAcik ? 'Daha az ←' : `Tümü (${matches.length}) →`}
                    </button>
                )}
            </div>

            {gorunen.length > 0 ? (
                <div className="rounded-3xl bg-surface-1 shadow-[0_10px_30px_rgba(0,0,0,0.3)] overflow-hidden">
                    {gorunen.map((m, i) => {
                        const rozet = RESULT_BADGE[m.result];
                        const sonSatir = i === gorunen.length - 1;
                        const rowContent = (
                            <>
                                <span
                                    aria-label={rozet.etiket}
                                    className={`w-[22px] h-[22px] rounded-full border flex items-center justify-center text-[0.625rem] font-bold shrink-0 ${rozet.sinif}`}
                                >
                                    {rozet.harf}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[0.6875rem] tracking-[0.12em] uppercase text-[#F5F3EE]/[0.55]">{m.date}</p>
                                    <p className="mt-0.5 text-[0.9375rem] font-semibold text-[#F5F3EE] truncate">{m.pitchName}</p>
                                </div>
                                {m.result === 'NO_SCORE' ? (
                                    <span className="text-[0.8125rem] italic text-[#F5F3EE]/[0.55] shrink-0">{m.score}</span>
                                ) : (
                                    <span className="text-base font-bold italic tracking-tight text-[#F5F3EE] shrink-0">{m.score}</span>
                                )}
                            </>
                        );
                        const rowClass = `w-full flex items-center gap-3 py-3.5 px-4 text-left ${sonSatir ? '' : 'border-b border-white/[0.08]'}`;
                        return onOpen ? (
                            <button key={m.id} onClick={() => onOpen(m.id)} className={`${rowClass} hover:bg-white/[0.03] transition-colors`}>
                                {rowContent}
                            </button>
                        ) : (
                            <div key={m.id} className={rowClass}>
                                {rowContent}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-3xl bg-surface-1 shadow-[0_10px_30px_rgba(0,0,0,0.3)] p-6 text-center">
                    <p className="text-[0.8125rem] italic text-[#F5F3EE]/[0.55]">Henüz oynanmış bir maçın yok.</p>
                </div>
            )}
        </div>
    );
};
