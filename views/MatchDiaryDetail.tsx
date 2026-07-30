import React, { useState, useEffect } from 'react';
import { ArrowLeft, Share2, Users, Layout, PenLine, Save, Shield, Check } from 'lucide-react';
import { MatchListing } from '../types';
import { auth } from '../supabaseAuth';
import { getMatchDetails, getMatchNote, saveMatchNote } from '../services/matchService';
import { LoadingState, ErrorState } from '../components/common/StatusState';
import { showToast } from '../components/common/GlobalToast';
import { getInitials } from '../utils/avatarHelper';

interface MatchDiaryDetailProps {
    diaryId: string | null;
    onBack: () => void;
}

interface DiaryMatchView {
    score: string;
    pitchName: string;
    date: string;
    formation: string;
    result: 'WIN' | 'LOSS' | 'DRAW' | 'NONE';
    rosterSnapshot: { name: string; avatar: string; x: number; y: number; isMe: boolean }[];
}

const buildDiaryView = (listing: MatchListing, uid?: string): DiaryMatchView => {
    const homeSlots = listing.slots || [];
    const awaySlots = listing.awaySlots || [];
    const isAwayPlayer = awaySlots.some(s => s.player?.id === uid);
    // Skor girilmemiş maçı 0-0 saymayız: eskiden `?? 0` yedeği yüzünden skorsuz
    // her maç oyuncunun günlüğünde BERABERLİK olarak görünüyordu. Skoru yalnız
    // hakem veya saha sahibi girer; girilmediyse dürüst olan "girilmedi"dir.
    const homeScore = listing.homeScore ?? null;
    const awayScore = listing.awayScore ?? null;
    const hasScore = homeScore !== null && awayScore !== null;
    const result: 'WIN' | 'LOSS' | 'DRAW' | 'NONE' = !hasScore
        ? 'NONE'
        : homeScore === awayScore
        ? 'DRAW'
        : (isAwayPlayer ? awayScore > homeScore : homeScore > awayScore) ? 'WIN' : 'LOSS';

    return {
        score: hasScore ? `${homeScore} - ${awayScore}` : '–',
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
    };
};

const MatchDiaryDetail: React.FC<MatchDiaryDetailProps> = ({ diaryId, onBack }) => {
    const [match, setMatch] = useState<DiaryMatchView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Kişisel not (Maç Raporu) — gerçek, kalıcı (match_notes).
    const [note, setNote] = useState('');
    const [draftNote, setDraftNote] = useState('');
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [savingNote, setSavingNote] = useState(false);
    // IP-18: not kaydetme hatası ekranda görünür (eskiden yalnız konsoldaydı).
    const [noteError, setNoteError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);

    const loadMatch = async () => {
        if (!diaryId) {
            setError('Maç bulunamadı.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [listing, savedNote] = await Promise.all([
                getMatchDetails(diaryId),
                getMatchNote(diaryId),
            ]);
            if (!listing) {
                setError('Maç bulunamadı.');
                setMatch(null);
                return;
            }
            setMatch(buildDiaryView(listing, auth.currentUser?.uid));
            setNote(savedNote);
            setDraftNote(savedNote);
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

    const handleSaveNote = async () => {
        if (!diaryId) return;
        setNoteError(null);
        setSavingNote(true);
        try {
            await saveMatchNote(diaryId, draftNote.trim());
            setNote(draftNote.trim());
            setIsEditingNote(false);
            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 2000);
        } catch (err) {
            // IP-18: hata YALNIZ konsola gidiyordu. Kullanıcı 1000 karaktere
            // kadar not yazıp Kaydet'e basıyor, buton eski hâline dönüyor ve
            // ekranda hiçbir mesaj çıkmıyordu — sessiz veri kaybı.
            console.error('Maç notu kaydedilemedi:', err);
            setNoteError('Notun kaydedilemedi. Bağlantını kontrol edip tekrar dene — yazdıkların duruyor.');
        } finally {
            setSavingNote(false);
        }
    };

    /**
     * IP-18: paylaş tuşunun onClick'i yoktu — dokunulunca hiçbir şey olmuyordu.
     * Telefonun kendi paylaşım penceresi varsa o açılır; yoksa (masaüstü
     * tarayıcı) metin panoya kopyalanır. Hiçbir yol yoksa sessiz kalmaz.
     */
    const handleShare = async () => {
        if (!match) return;
        const metin = [
            'OYNA · Maç Raporu',
            match.pitchName,
            match.date,
            match.result === 'NONE' ? 'Skor girilmedi' : `Skor: ${match.score}`,
        ].filter(Boolean).join(' — ');
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share({ title: 'OYNA · Maç Raporu', text: metin });
                return;
            }
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(metin);
                showToast('Maç raporu panoya kopyalandı.', 'success');
                return;
            }
            showToast('Bu cihazda paylaşım desteklenmiyor.');
        } catch (err) {
            // Kullanıcı paylaşım penceresini kapattıysa hata sayılmaz.
            if ((err as { name?: string })?.name === 'AbortError') return;
            console.error('Maç raporu paylaşılamadı:', err);
            showToast('Paylaşım açılamadı. Lütfen tekrar dene.');
        }
    };

    const header = (
        <header className="px-6 py-6 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-30 border-b border-white/5 flex items-center justify-center">
            <button
                onClick={onBack}
                aria-label="Geri"
                className="absolute left-6 w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
            >
                <ArrowLeft size={20} />
            </button>
            <div className="text-center">
                <h1 className="text-sm font-extrabold text-white tracking-widest uppercase">MAÇ RAPORU</h1>
            </div>
            {/* IP-18: bu tuşun onClick'i YOKTU — dokunulunca hiçbir şey olmuyordu. */}
            <button
                onClick={handleShare}
                aria-label="Maç raporunu paylaş"
                className="absolute right-6 w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
            >
                <Share2 size={20} />
            </button>
        </header>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0E14] flex flex-col relative font-sans">
                {header}
                <div className="flex-1 flex items-center justify-center">
                    <LoadingState message="Maç detayları yükleniyor…" />
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
    const noScore = match.result === 'NONE';
    const glowColor = isWin ? 'rgba(34,197,94,0.15)' : isLoss ? 'rgba(239,68,68,0.15)' : 'rgba(156,163,175,0.15)';
    const badgeBg = isWin ? 'bg-green-500/10' : isLoss ? 'bg-red-500/10' : 'bg-gray-500/10';
    const badgeText = isWin ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-gray-400';
    const badgeBorder = isWin ? 'border-green-500/20' : isLoss ? 'border-red-500/20' : 'border-gray-500/20';
    const badgeLabel = noScore ? 'SKOR GİRİLMEDİ' : isWin ? 'GALİBİYET' : isLoss ? 'MAĞLUBİYET' : 'BERABERLİK';

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
                        <div className={`px-5 py-1.5 rounded-full text-[0.625rem] font-extrabold uppercase tracking-widest mb-6 border ${badgeBg} ${badgeText} ${badgeBorder}`}>
                            {badgeLabel}
                        </div>

                        <h2 className="text-7xl font-extrabold text-white mb-4 tracking-tighter leading-none italic">{match.score}</h2>

                        {noScore && (
                            <p className="text-xs font-semibold text-ink-4 -mt-2 mb-4 max-w-[240px] leading-relaxed">
                                Bu maçın skoru girilmedi. Skoru maçın hakemi veya tesis sahibi girer;
                                girilmeyen maç istatistiklerine sayılmaz.
                            </p>
                        )}

                        <div className="w-16 h-1 bg-white/10 rounded-full mb-6"></div>

                        <h3 className="text-lg font-bold text-white mb-2">{match.pitchName}</h3>
                        <div className="flex items-center justify-center gap-4 text-xs font-bold text-ink-4 uppercase tracking-widest">
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
                        <h3 className="text-xs font-extrabold text-ink-4 uppercase tracking-widest flex items-center gap-2">
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
                                    <div className={`relative w-11 h-11 rounded-full border-2 shadow-2xl overflow-hidden ${isMe ? 'border-[#FACC15] ring-4 ring-[#FACC15]/30 scale-110 z-10' : 'border-white'}`}>
                                        {/* IP-18: onError yedeği yoktu — kırık görsel bozuk ikon olarak kalıyordu. */}
                                        <img
                                            src={player.avatar}
                                            alt={player.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                const el = e.currentTarget;
                                                el.style.display = 'none';
                                                const kap = el.parentElement;
                                                if (kap && !kap.querySelector('[data-bas-harf]')) {
                                                    const rozet = document.createElement('span');
                                                    rozet.setAttribute('data-bas-harf', '1');
                                                    rozet.className = 'w-full h-full flex items-center justify-center bg-[#161B22] text-white text-[0.6875rem] font-extrabold';
                                                    rozet.textContent = getInitials(player.name);
                                                    kap.appendChild(rozet);
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className={`px-2.5 py-1 rounded-md text-[0.6875rem] font-extrabold text-center whitespace-nowrap shadow-lg ${isMe ? 'bg-[#FACC15] text-black' : 'bg-[#161B22]/90 backdrop-blur-md text-white border border-white/10'}`}>
                                        {player.name}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* 4. Personal Note — Maç Günlüğü (gerçek, kalıcı) */}
                <section className="w-full max-w-sm animate-in slide-in-from-bottom-10 duration-500 pb-10">
                    <div className="flex items-center justify-center gap-2 mb-6">
                        <div className="h-px w-12 bg-white/10"></div>
                        <h3 className="text-xs font-extrabold text-ink-4 uppercase tracking-widest flex items-center gap-2">
                            <PenLine size={14} /> MAÇ GÜNLÜĞÜ
                        </h3>
                        <div className="h-px w-12 bg-white/10"></div>
                    </div>

                    {!isEditingNote ? (
                        <div className="bg-[#161B22] border border-white/5 rounded-[32px] p-8 relative overflow-hidden flex flex-col items-center text-center">
                            {note ? (
                                <>
                                    <div className="absolute top-4 left-6 text-6xl text-[#FACC15]/5 font-serif pointer-events-none">"</div>
                                    <div className="absolute bottom-[-10px] right-6 text-6xl text-[#FACC15]/5 font-serif pointer-events-none">"</div>
                                    <p className="text-[0.625rem] font-extrabold text-[#FACC15] uppercase tracking-widest mb-4">KİŞİSEL NOTUN</p>
                                    <p className="text-gray-300 font-serif text-sm italic leading-relaxed px-4 whitespace-pre-wrap">
                                        "{note}"
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="w-12 h-12 rounded-2xl bg-[#FACC15]/10 border border-[#FACC15]/20 flex items-center justify-center text-[#FACC15] mb-4">
                                        <PenLine size={22} />
                                    </div>
                                    <p className="text-sm font-bold text-white mb-1">Bu maç için not almadın</p>
                                    <p className="text-xs text-ink-4">Taktik, performans ya da unutmak istemediğin anları yaz.</p>
                                </>
                            )}
                            <button
                                onClick={() => { setDraftNote(note); setIsEditingNote(true); }}
                                className="mt-6 px-5 py-2.5 rounded-full bg-white/5 border border-white/15 text-white text-[0.6875rem] font-extrabold uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all flex items-center gap-2"
                            >
                                {justSaved ? <><Check size={13} className="text-[#39FF14]" /> Kaydedildi</> : <><PenLine size={13} /> {note ? 'Notu Düzenle' : 'Not Ekle'}</>}
                            </button>
                        </div>
                    ) : (
                        <div className="bg-[#161B22] border border-white/10 rounded-[32px] p-6 flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-[0.625rem] font-extrabold text-[#FACC15] uppercase tracking-widest">KİŞİSEL NOTUN</p>
                                <span className="flex items-center gap-1 text-[0.6875rem] text-ink-4"><Shield size={12} /> Sadece sen görürsün</span>
                            </div>
                            <textarea
                                className="min-h-[140px] bg-transparent text-base text-white placeholder:text-ink-4 outline-none resize-none font-serif leading-relaxed"
                                placeholder="Bugünkü maç nasıldı? Taktik işe yaradı mı? Kimi tutmakta zorlandın? Kendine notlar al…"
                                value={draftNote}
                                onChange={(e) => setDraftNote(e.target.value)}
                                maxLength={1000}
                                autoFocus
                            />
                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => { setDraftNote(note); setIsEditingNote(false); }}
                                    className="flex-1 h-12 rounded-2xl bg-white/5 border border-white/10 text-gray-300 font-extrabold text-xs uppercase tracking-widest active:scale-95 transition-all"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    onClick={handleSaveNote}
                                    disabled={savingNote}
                                    className="flex-[1.5] h-12 rounded-2xl bg-[#FACC15] text-black font-extrabold text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <Save size={16} /> {savingNote ? 'Kaydediliyor…' : 'Kaydet'}
                                </button>
                            </div>
                            {noteError && (
                                <p role="alert" className="mt-3 text-[0.75rem] font-bold leading-relaxed text-red-400">
                                    {noteError}
                                </p>
                            )}
                        </div>
                    )}
                </section>

            </main>
        </div>
    );
};

export default MatchDiaryDetail;
