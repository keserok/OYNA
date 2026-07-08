import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';
import { PlayerCardData } from '../../types';
import { PlayerCard } from '../PlayerCard';
import { PlayerCardBack } from './PlayerCardBack';
import { MatchHistorySummary } from '../../services/userService';

export interface ProfileHeroProps {
    name: string;
    avatarUrl?: string | null;
    verified?: boolean;
    position?: string | null;
    age?: number | null;
    footLabel?: string | null;
    matches: number;
    /** 0–100 */
    winRate: number;
    /** null → MVP hücresi gizli (oylama verisi henüz kaydedilmiyor) */
    mvp?: number | null;
    /** Admin onaylı premium kart (Q24) — true ise 👤/🎴 geçişi görünür */
    cardAvailable?: boolean;
    cardData?: PlayerCardData | null;
    /** Kart arka yüzü (flip) için maç geçmişi */
    cardBackMatches?: MatchHistorySummary[];
    /** undefined → düzenleme yok (salt okunur profil / misafir) */
    onEditAvatar?: () => void;
    /** Kart görünümündeki paylaş butonu (verilmezse buton çizilmez). */
    onShareCard?: () => void;
}

const initialsOf = (name: string) =>
    name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR');

const Chip: React.FC<{ children: React.ReactNode; accent?: boolean }> = ({ children, accent }) => (
    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border ${
        accent
            ? 'font-black text-primary bg-primary/10 border-primary/40'
            : 'text-white/55 bg-white/5 border-white/10'
    }`}>
        {children}
    </span>
);

/**
 * Profil kimlik kartı: sade görünüm (isim + rozetler + avatar) ile
 * premium FIFA kart görünümü arasında geçiş; altta Maç/Galibiyet(/MVP) şeridi.
 */
export const ProfileHero: React.FC<ProfileHeroProps> = ({
    name, avatarUrl, verified, position, age, footLabel,
    matches, winRate, mvp = null,
    cardAvailable = false, cardData, cardBackMatches = [],
    onEditAvatar, onShareCard,
}) => {
    const [cardMode, setCardMode] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    // Avatar yüklenemezse (kırık URL / erişilemeyen host) baş harflere düş.
    const [avatarBroken, setAvatarBroken] = useState(false);
    const showCard = cardAvailable && cardMode && !!cardData;
    const showAvatarImg = !!avatarUrl && !avatarBroken;

    return (
        <div className="relative rounded-[28px] overflow-hidden border border-primary/20 shadow-[0_0_40px_rgba(57,255,20,0.06)]">
            {/* Zemin katmanları */}
            <div className="absolute inset-0 bg-gradient-to-br from-bg-main via-[#0d1a12] to-bg-main" />
            <div className="absolute inset-0 opacity-35" style={{ background: 'radial-gradient(circle at 85% 0%, color-mix(in srgb, var(--color-primary) 30%, transparent) 0%, transparent 60%)' }} />

            <div className="relative z-10 p-[18px] pb-4">
                {/* 👤/🎴 geçişi — yalnız admin onaylı kartı olanlarda */}
                {cardAvailable && cardData && (
                    <div className="flex justify-end mb-3">
                        <div className="flex gap-1 p-[3px] rounded-[9px] bg-black/35 border border-white/10">
                            <button
                                onClick={() => setCardMode(false)}
                                aria-label="Sade görünüm"
                                className={`w-7 h-[26px] rounded-[7px] text-xs flex items-center justify-center transition-all ${!cardMode ? 'bg-primary' : 'opacity-50'}`}
                            >👤</button>
                            <button
                                onClick={() => setCardMode(true)}
                                aria-label="Kart görünümü"
                                className={`w-7 h-[26px] rounded-[7px] text-xs flex items-center justify-center transition-all ${cardMode ? 'bg-primary' : 'opacity-50'}`}
                            >🎴</button>
                        </div>
                    </div>
                )}

                {!showCard ? (
                    /* ── Sade görünüm ── */
                    <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-[27px] font-black italic uppercase leading-[1.05] tracking-tight text-white flex items-center gap-2">
                                <span className="truncate">{name}</span>
                                {verified && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0" aria-label="Doğrulanmış">
                                        <circle cx="12" cy="12" r="10" className="fill-primary" />
                                        <path d="M8 12l2.5 2.5L16 9" stroke="var(--color-bg-main)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </h1>
                            <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                                <Chip accent>{position || 'Mevki belirtilmedi'}</Chip>
                                {age != null && <Chip>{age} yaş</Chip>}
                                {footLabel && <Chip>{footLabel}</Chip>}
                            </div>
                        </div>
                        <div className="relative shrink-0">
                            {showAvatarImg ? (
                                <img
                                    src={avatarUrl!}
                                    alt={name}
                                    referrerPolicy="no-referrer"
                                    onError={() => setAvatarBroken(true)}
                                    className="w-[84px] h-[84px] rounded-full object-cover border-2 border-primary/50 bg-[#0d1712]"
                                />
                            ) : (
                                <div className="w-[84px] h-[84px] rounded-full flex items-center justify-center text-[28px] font-black italic text-primary bg-[#0d1712] border-2 border-primary/50">
                                    {initialsOf(name)}
                                </div>
                            )}
                            {onEditAvatar && (
                                <button
                                    onClick={onEditAvatar}
                                    aria-label="Profil fotoğrafını değiştir"
                                    className="absolute -bottom-0.5 -right-0.5 w-[26px] h-[26px] rounded-[9px] bg-primary border-2 border-bg-main flex items-center justify-center text-bg-main active:scale-95 transition-all"
                                >
                                    <Camera size={12} strokeWidth={2.6} />
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ── Premium kart görünümü (dokun → çevir) ── */
                    <div className="flex flex-col items-center">
                        <div className="w-full max-w-[240px] cursor-pointer" style={{ perspective: '1200px' }} onClick={() => setIsFlipped(f => !f)}>
                            <motion.div
                                animate={{ rotateY: isFlipped ? 180 : 0 }}
                                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                                style={{ transformStyle: 'preserve-3d' }}
                                className="relative w-full"
                            >
                                <div style={{ backfaceVisibility: 'hidden' }}>
                                    <PlayerCard name={name} photo={avatarUrl || '/player_card_photo.png'} position={position || undefined} cardData={cardData!} onShare={onShareCard} />
                                </div>
                                <div className="absolute inset-0 w-full" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                                    <div style={{ aspectRatio: '2 / 3' }}>
                                        <PlayerCardBack tier={cardData!.tier} matches={cardBackMatches} />
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                        <div className="flex gap-2 mt-3">
                            {age != null && <Chip>Yaş {age}</Chip>}
                            {footLabel && <Chip>{footLabel} Ayak</Chip>}
                        </div>
                    </div>
                )}

                {/* ── İstatistik şeridi ── */}
                <div className="flex bg-black/35 border border-white/10 rounded-[14px] overflow-hidden mt-[18px]">
                    <div className="flex-1 py-3 px-1.5 flex flex-col items-center gap-1">
                        <span className="text-xl font-black text-white leading-none">{matches}</span>
                        <span className="text-[8px] font-black tracking-[0.1em] text-white/40 uppercase">Maç</span>
                    </div>
                    <div className="w-px bg-white/10" />
                    <div className="flex-1 py-3 px-1.5 flex flex-col items-center gap-1">
                        <span className="text-xl font-black text-primary leading-none">%{winRate}</span>
                        <span className="text-[8px] font-black tracking-[0.1em] text-white/40 uppercase">Galibiyet</span>
                    </div>
                    {mvp != null && (
                        <>
                            <div className="w-px bg-white/10" />
                            <div className="flex-1 py-3 px-1.5 flex flex-col items-center gap-1">
                                <span className="text-xl font-black text-white leading-none">{mvp}</span>
                                <span className="text-[8px] font-black tracking-[0.1em] text-white/40 uppercase">MVP</span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
