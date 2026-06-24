import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Share2, Users, Layout } from 'lucide-react';
import { MatchListing } from '../types';
import { auth } from '../supabaseAuth';
import { getMatchDetails } from '../services/matchService';
import { LoadingState, ErrorState } from '../components/common/StatusState';

interface MatchDiaryDetailProps {
    diaryId: string | null;
    onBack: () => void;
}

interface DiaryMatchView {
    score: string;
    pitchName: string;
    date: string;
    formation: string;
    result: 'WIN' | 'LOSS' | 'DRAW';
    rosterSnapshot: { name: string; avatar: string; x: number; y: number; isMe: boolean }[];
    personalNote?: string;
}

const buildDiaryView = (listing: MatchListing, uid?: string): DiaryMatchView => {
    const homeSlots = listing.slots || [];
    const awaySlots = listing.awaySlots || [];
    const isAwayPlayer = awaySlots.some(s => s.player?.id === uid);
    const homeScore = listing.homeScore ?? 0;
    const awayScore = listing.awayScore ?? 0;
    const result: 'WIN' | 'LOSS' | 'DRAW' = homeScore === awayScore
        ? 'DRAW'
        : (isAwayPlayer ? awayScore > homeScore : homeScore > awayScore) ? 'WIN' : 'LOSS';

    return {
        score: `${homeScore} - ${awayScore}`,
        pitchName: listing.pitchName || listing.location,
        date: listing.date,
        formation: listing.format || '—',
        result,
        rosterSnapshot: [...homeSlots, ...awaySlots]
            .filter(s => s.player)
            .map(s => ({
                name: s.player!.name,
                avatar: s.player!.avatar,
                x: s.x,
                y: s.y,
                isMe: s.player!.id === uid,
            })),
        personalNote: undefined,
    };
};

const MatchDiaryDetail: React.FC<MatchDiaryDetailProps> = ({ diaryId, onBack }) => {
    const [match, setMatch] = useState<DiaryMatchView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMatch = async () => {
        if (!diaryId) {
            setError('Maç bulunamadı.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const listing = await getMatchDetails(diaryId);
            if (!listing) {
                setError('Maç bulunamadı.');
                setMatch(null);
                return;
            }
            setMatch(buildDiaryView(listing, auth.currentUser?.uid));
        } catch (err) {
            console.error('MatchDiaryDetail fetch:', err);
            setError('Maç detayları yüklenemedi. Lütfen tekrar dene.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMatch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [diaryId]);

    const header = (
        <header className="px-6 py-6 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-30 border-b border-white/5 flex items-center justify-center">
            <button
                onClick={onBack}
                className="absolute left-6 w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
            >
                <ArrowLeft size={20} />
            </button>
            <div className="text-center">
                <h1 className="text-sm font-black text-white tracking-widest uppercase">MAÇ DETAYI</h1>
            </div>
            <button className="absolute right-6 w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
                <Share2 size={20} />
            </button>
        </header>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0E14] flex flex-col relative font-sans">
                {header}
                <div className="flex-1 flex items-center justify-center">
                    <LoadingState message="Maç detayları yükleniyor..." />
                </div>
            </div>
        );
    }

    if (error || !match) {
        return (
            <div className="min-h-screen bg-[#0A0E14] flex flex-col relative font-sans">
                {header}
                <div className="flex-1 flex items-center justify-center">
                    <ErrorState message={error || 'Maç bulunamadı.'} onRetry={loadMatch} />
                </div>
            </div>
        );
    }

    const isWin = match.result === 'WIN';
    const isLoss = match.result === 'LOSS';
    const glowColor = isWin ? 'rgba(34,197,94,0.15)' : isLoss ? 'rgba(239,68,68,0.15)' : 'rgba(156,163,175,0.15)';
    const badgeBg = isWin ? 'bg-green-500/10' : isLoss ? 'bg-red-500/10' : 'bg-gray-500/10';
    const badgeText = isWin ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-gray-400';
    const badgeBorder = isWin ? 'border-green-500/20' : isLoss ? 'border-red-500/20' : 'border-gray-500/20';

    return (
        <div className="min-h-screen bg-[#0A0E14] flex flex-col relative font-sans">
            {header}

            <main className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar flex flex-col items-center">

                {/* 1. Score & Result Monolith */}
                <div className="w-full max-w-sm bg-[#161B22] border border-white/5 rounded-[40px] p-8 text-center relative overflow-hidden shadow-2xl flex flex-col items-center">
                    {/* Perfect symmetric glow */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 blur-[80px] pointer-events-none" style={{ backgroundColor: glowColor }}></div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center w-full">
                        <div className={`px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 border ${badgeBg} ${badgeText} ${badgeBorder}`}>
                            {isWin ? 'GALİBİYET' : isLoss ? 'MAĞLUBİYET' : 'BERABERLİK'}
                        </div>

                        <h2 className="text-7xl font-black text-white mb-4 tracking-tighter leading-none italic">{match.score}</h2>

                        <div className="w-16 h-1 bg-white/10 rounded-full mb-6"></div>

                        <h3 className="text-lg font-bold text-white mb-2">{match.pitchName}</h3>
                        <div className="flex items-center justify-center gap-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
                            <span>{match.date}</span>
                            <div className="w-1 h-1 bg-gray-600 rounded-full"></div>
                            <span className="flex items-center gap-1"><Layout size={12}/> {match.formation}</span>
                        </div>
                    </div>
                </div>

                {/* 3. The Visual Pitch (Symmetrical Tactical Board) */}
                <section className="w-full max-w-sm flex flex-col items-center">
                    <div className="flex items-center justify-center gap-2 mb-6">
                        <div className="h-px w-12 bg-white/10"></div>
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                            <Users size={14} /> SAHADAKİ DİZİLİŞ
                        </h3>
                        <div className="h-px w-12 bg-white/10"></div>
                    </div>

                    <div className="relative w-full aspect-[2/3] bg-[#1B4332] rounded-[32px] border-4 border-[#161B22] shadow-[inset_0_0_80px_rgba(0,0,0,0.9)] overflow-hidden">
                        {/* Grass Stripes Symmetric */}
                        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>

                        {/* Flawless Symmetric SVG Pitch */}
                        <div className="absolute inset-0 pointer-events-none opacity-40">
                            <svg viewBox="0 0 400 600" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                                <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                    {/* Dış Çizgiler */}
                                    <rect x="20" y="20" width="360" height="560" />
                                    
                                    {/* Orta Saha Çizgisi */}
                                    <line x1="20" y1="300" x2="380" y2="300" />
                                    
                                    {/* Orta Yuvarlak */}
                                    <circle cx="200" cy="300" r="50" />
                                    {/* Başlama Noktası */}
                                    <circle cx="200" cy="300" r="3" fill="white" />

                                    {/* Üst Ceza Sahası */}
                                    <rect x="100" y="20" width="200" height="80" />
                                    {/* Üst Altı Pas */}
                                    <rect x="150" y="20" width="100" height="30" />
                                    {/* Üst Penaltı Noktası */}
                                    <circle cx="200" cy="70" r="3" fill="white" />
                                    {/* Üst Ceza Sahası Yayı */}
                                    <path d="M 160 100 A 40 40 0 0 0 240 100" />

                                    {/* Alt Ceza Sahası */}
                                    <rect x="100" y="500" width="200" height="80" />
                                    {/* Alt Altı Pas */}
                                    <rect x="150" y="550" width="100" height="30" />
                                    {/* Alt Penaltı Noktası */}
                                    <circle cx="200" cy="530" r="3" fill="white" />
                                    {/* Alt Ceza Sahası Yayı */}
                                    <path d="M 160 500 A 40 40 0 0 1 240 500" />

                                    {/* Köşe Yayları */}
                                    <path d="M 20 40 A 20 20 0 0 0 40 20" />
                                    <path d="M 380 40 A 20 20 0 0 1 360 20" />
                                    <path d="M 20 560 A 20 20 0 0 1 40 580" />
                                    <path d="M 380 560 A 20 20 0 0 0 360 580" />
                                </g>
                            </svg>
                        </div>

                        {/* Players */}
                        {match.rosterSnapshot.map((player, idx) => {
                            const isMe = player.isMe;

                            return (
                                <div
                                    key={idx}
                                    className="absolute flex flex-col items-center justify-center gap-1.5"
                                    style={{ 
                                        left: `${player.x}%`, 
                                        top: `${player.y}%`,
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                >
                                    <div className={`relative w-11 h-11 rounded-full border-2 shadow-2xl overflow-hidden ${isMe ? 'border-[#FFFF00] ring-4 ring-[#FFFF00]/30 scale-110 z-10' : 'border-white'}`}>
                                        <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div className={`px-2.5 py-1 rounded-md text-[9px] font-black text-center whitespace-nowrap shadow-lg ${isMe ? 'bg-[#FFFF00] text-black' : 'bg-[#161B22]/90 backdrop-blur-md text-white border border-white/10'}`}>
                                        {player.name}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 4. Personal Note (Symmetric Box) */}
                {match.personalNote && (
                    <section className="w-full max-w-sm animate-in slide-in-from-bottom-10 duration-500 pb-10">
                        <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-8 text-center relative overflow-hidden flex flex-col items-center">
                            {/* Symmetric quotes accent */}
                            <div className="absolute top-4 left-6 text-6xl text-[#FFFF00]/5 font-serif pointer-events-none">"</div>
                            <div className="absolute bottom-[-10px] right-6 text-6xl text-[#FFFF00]/5 font-serif pointer-events-none">"</div>
                            
                            <p className="text-[10px] font-black text-[#FFFF00] uppercase tracking-widest mb-4">KİŞİSEL NOTUN</p>
                            <p className="text-gray-300 font-serif text-sm italic leading-relaxed px-4">
                                "{match.personalNote}"
                            </p>
                        </div>
                    </section>
                )}

            </main>
        </div>
    );
};

export default MatchDiaryDetail;
