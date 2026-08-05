import React, { useState } from 'react';
import { MatchHistorySummary } from '../../services/userService';

// ════════════════════════════════════════════════════════════════════════════
// MAÇ GEÇMİŞİ — onaylı profil tasarımı ("Profil · dolu" / "Profil · boş")
// ════════════════════════════════════════════════════════════════════════════
//
// SATIRIN OKUNUŞU (tasarımdan birebir):
//     G   Altınordu Halı Saha            6 - 4
//         02 Ağustos
// Solda TEK HARF (renk yok, rozet yok), ortada saha adı ÜSTTE ve tarih ALTTA,
// sağda skor. Önceki sürümde harf renkli bir daire içindeydi ve tarih üstte,
// saha adı altta yazıyordu — tasarımın sırası tersiydi ve kart gürültülüydü.
// Sonuç yine okunur: harfin kendisi (G/B/M) sonucu söylüyor, ekran renk
// kalabalığına boğulmuyor.

/** Sonucun tek harfi. Renk YOK — tasarım kararı. */
const RESULT_LETTER: Record<MatchHistorySummary['result'], { harf: string; etiket: string }> = {
    WIN: { harf: 'G', etiket: 'Galibiyet' },
    DRAW: { harf: 'B', etiket: 'Beraberlik' },
    LOSS: { harf: 'M', etiket: 'Mağlubiyet' },
    // IP-18: skoru girilmemiş maç bir SONUÇ değildir — nötr tire ile çizilir.
    NO_SCORE: { harf: '–', etiket: 'Skor girilmedi' },
};

export interface MatchHistorySectionProps {
    matches: MatchHistorySummary[];
    /** Verilmezse satırlar tıklanamaz (salt-okunur profil). */
    onOpen?: (id: string) => void;
    /** Boş hâldeki "Maç bul" çıkışı. Verilmezse düğme çizilmez. */
    onFindMatch?: () => void;
}

/** Başlangıçta gösterilen satır sayısı; gerisi "Tümü" ile yerinde açılır. */
const ILK_GOSTERIM = 4;

/**
 * Maç geçmişi listesi: tek kart içinde son 4 maç, başlığın sağında "Tümü (n) ›".
 * Kullanıcı kararı: ayrı bir "tüm maçlar" sayfası açılmaz — liste yerinde
 * uzayıp kısalır.
 */
export const MatchHistorySection: React.FC<MatchHistorySectionProps> = ({ matches, onOpen, onFindMatch }) => {
    const [hepsiAcik, setHepsiAcik] = useState(false);
    const gorunen = hepsiAcik ? matches : matches.slice(0, ILK_GOSTERIM);
    const fazlasiVar = matches.length > ILK_GOSTERIM;
    const bos = gorunen.length === 0;

    return (
        <div>
            {/* Başlık: küçük, harf aralıklı, soluk — bir bölüm etiketidir,
                kartların kendisiyle yarışmaz. Boş hâlde üst boşluk küçülür
                (tasarım: dolu 14px, boş 6px). */}
            <div className={`flex items-baseline justify-between ${bos ? 'mt-1.5' : 'mt-3.5'} mb-2.5 px-0.5`}>
                <span className="text-[0.6875rem] tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55]">Maç Geçmişi</span>
                {fazlasiVar && (
                    <button
                        onClick={() => setHepsiAcik(a => !a)}
                        className="text-[0.75rem] text-[#F5F3EE]/[0.55] hover:text-[#F5F3EE] transition-colors"
                    >
                        {hepsiAcik ? '‹ Daha az' : `Tümü (${matches.length}) ›`}
                    </button>
                )}
            </div>

            {!bos ? (
                <div className="rounded-3xl bg-surface-1 overflow-hidden">
                    {gorunen.map((m, i) => {
                        const sonuc = RESULT_LETTER[m.result];
                        const sonSatir = i === gorunen.length - 1;
                        const rowContent = (
                            <>
                                <span
                                    aria-label={sonuc.etiket}
                                    className="w-[14px] text-[0.875rem] text-white shrink-0"
                                >
                                    {sonuc.harf}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="m-0 text-base text-white truncate">{m.pitchName}</p>
                                    <p className="mt-0.5 mb-0 text-[0.75rem] text-[#F5F3EE]/[0.55]">{m.date}</p>
                                </div>
                                {m.result === 'NO_SCORE' ? (
                                    <span className="text-[0.8125rem] text-[#F5F3EE]/[0.55] shrink-0">{m.score}</span>
                                ) : (
                                    <span className="text-base font-[Montserrat] font-extrabold italic text-white shrink-0">{m.score}</span>
                                )}
                            </>
                        );
                        const rowClass = `w-full flex items-center gap-3 py-3.5 px-4 text-left ${sonSatir ? '' : 'border-b border-white/[0.06]'}`;
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
                /* Boş hâl bir ÇIKIŞ sunar. "Henüz maçın yok" tek başına
                   kullanıcıyı çıkmaza sokuyordu; tasarım buraya "Maç bul"
                   düğmesini koydu. Düğme YALNIZ `onFindMatch` verilirse
                   çizilir — admin panelindeki salt-okunur aynada anlamsız. */
                <div className="rounded-3xl bg-surface-1 py-[18px] px-6 flex flex-col items-center gap-3 text-center">
                    <p className="m-0 text-[0.875rem] text-[#F5F3EE]/[0.55] leading-[1.5]">Henüz oynanmış bir maçın yok.</p>
                    {onFindMatch && (
                        <button
                            onClick={onFindMatch}
                            className="min-h-[44px] px-[18px] rounded-full bg-white text-[#0A0E14] text-[0.8125rem] active:opacity-85 transition-opacity"
                        >
                            Maç bul
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
