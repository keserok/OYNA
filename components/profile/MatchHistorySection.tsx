import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { MatchHistorySummary } from '../../services/userService';

type Filter = 'ALL' | 'WIN' | 'MVP';

export interface MatchHistorySectionProps {
    matches: MatchHistorySummary[];
    /** Verilmezse satırlar tıklanamaz (salt-okunur profil). */
    onOpen?: (id: string) => void;
    /** MVP oylaması kayıt altına alınınca açılacak; şimdilik kapalı. */
    showMvpTab?: boolean;
}

const SCORE_COLOR: Record<MatchHistorySummary['result'], string> = {
    WIN: 'text-primary',
    LOSS: 'text-error',
    DRAW: 'text-warning',
};

/** Sekmeli maç geçmişi listesi: Tümü / Galibiyet (/ Maçın Adamı). */
export const MatchHistorySection: React.FC<MatchHistorySectionProps> = ({ matches, onOpen, showMvpTab = false }) => {
    const [filter, setFilter] = useState<Filter>('ALL');

    const tabs: Array<[Filter, string]> = [
        ['ALL', 'Tümü'],
        ['WIN', 'Galibiyet'],
        ...(showMvpTab ? [['MVP', 'Maçın Adamı'] as [Filter, string]] : []),
    ];

    const filtered = matches.filter(m => {
        if (filter === 'WIN') return m.result === 'WIN';
        if (filter === 'MVP') return false; // MVP verisi henüz kaydedilmiyor
        return true;
    });

    return (
        <div>
            <div className="flex items-center mt-[22px] mb-0.5">
                <span className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-white/50">Maç Geçmişi</span>
            </div>
            <div className="flex mt-2.5 border-b border-white/10">
                {tabs.map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setFilter(id)}
                        className={`flex-1 text-center pt-2.5 pb-3 px-1 text-[11px] font-bold tracking-[0.02em] transition-colors border-b-2 -mb-px ${
                            filter === id ? 'text-white border-primary' : 'text-white/40 border-transparent'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="flex flex-col">
                {filtered.length > 0 ? (
                    filtered.map(m => {
                        const rowContent = (
                            <>
                                <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-extrabold tracking-[0.1em] uppercase text-white/40">{m.date}</span>
                                    <h4 className="text-base font-bold text-white mt-1 uppercase tracking-[0.01em] truncate">{m.pitchName}</h4>
                                </div>
                                <span className={`text-[19px] font-extrabold italic tracking-tight shrink-0 ${SCORE_COLOR[m.result]}`}>{m.score}</span>
                                {onOpen && <ChevronRight size={15} className="text-white/30 shrink-0" strokeWidth={2.4} />}
                            </>
                        );
                        const rowClass = 'flex items-center gap-3 py-3.5 px-0.5 border-b border-white/[0.06] text-left';
                        return onOpen ? (
                            <button key={m.id} onClick={() => onOpen(m.id)} className={`${rowClass} hover:bg-white/[0.02] transition-colors`}>
                                {rowContent}
                            </button>
                        ) : (
                            <div key={m.id} className={rowClass}>
                                {rowContent}
                            </div>
                        );
                    })
                ) : (
                    <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center mt-2">
                        <p className="text-[11px] font-bold text-white/40 uppercase tracking-[0.06em]">Bu kategoride maç yok</p>
                    </div>
                )}
            </div>
        </div>
    );
};
