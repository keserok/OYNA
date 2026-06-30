import React, { useState, useEffect } from 'react';
import { UserRole, AppView, PlayerCardData } from '../types';
import { ArrowLeft, Settings, Shield, ChevronRight, Share2, Pencil, TrendingUp, Target, Activity, Trophy, Users, Repeat, Scale, Building2 } from 'lucide-react';
import { PlayerCard } from '../components/PlayerCard';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { auth } from '../supabaseAuth';
import { getFullUserProfile, getMatchHistory, MatchHistorySummary, OynaUser, updateProfileBasics } from '../services/userService';
import { LoadingState, ErrorState } from '../components/common/StatusState';
import { useImageUpload } from '../hooks/useImageUpload';

const DEFAULT_CARD_STAT = { value: 50, videoUrl: null };

const buildCardData = (profile: OynaUser | null, wins: number, total: number): PlayerCardData => {
    // playerCard'ı YALNIZCA tam (stats + overall içeriyorsa) kullan; eksik/kısmi
    // kart (ör. yalnız tier/position) PlayerCard'ı çökertirdi (stats.shooting undefined).
    const pc = profile?.playerCard as Partial<PlayerCardData> | undefined;
    if (pc && pc.stats && typeof pc.overall === 'number') {
        return pc as PlayerCardData;
    }
    const overall = Math.round((profile?.stats?.rating ?? 5) * 20);
    return {
        overall,
        tier: overall >= 80 ? 'gold' : overall >= 65 ? 'silver' : 'bronze',
        isStatsVerified: false,
        diamondValue: 0,
        winCount: wins,
        totalMatches: total,
        stats: {
            pace: { ...DEFAULT_CARD_STAT },
            shooting: { ...DEFAULT_CARD_STAT },
            passing: { ...DEFAULT_CARD_STAT },
            dribbling: { ...DEFAULT_CARD_STAT },
            defense: { ...DEFAULT_CARD_STAT },
            physical: { ...DEFAULT_CARD_STAT },
        }
    };
};

interface ProfileScreenProps {
    role: UserRole;
    onBack: () => void;
    onNavigate?: (view: AppView) => void;
    onOpenDiaryEntry: (id: string) => void;
}

const CardBack: React.FC<{ tier: 'gold' | 'silver' | 'bronze'; matches: MatchHistorySummary[] }> = ({ tier, matches }) => {
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
                        <span className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: colors.label }}>Scouting Raporu</span>
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${colors.border}66)` }} />
                    </div>
                </div>
                <div>
                    <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: colors.label }}>Son 5 Maç</p>
                    <div className="flex gap-2 justify-center">
                        {last5.map((m, i) => (
                            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black border ${m.result === 'WIN' ? 'bg-green-500/20 text-green-400 border-green-500/30' : m.result === 'LOSS' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                                {m.result === 'WIN' ? 'G' : m.result === 'LOSS' ? 'M' : 'B'}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-black" style={{ color: colors.text }}>18</span>
                        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: colors.label }}>Gol</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-black" style={{ color: colors.text }}>12</span>
                        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: colors.label }}>Asist</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-black" style={{ color: colors.text }}>9.2</span>
                        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: colors.label }}>En İyi Puan</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-black" style={{ color: colors.text }}>{winRate}%</span>
                        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: colors.label }}>Galibiyet</p>
                    </div>
                </div>
                <div>
                    <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: colors.label }}>Performans Trendi</p>
                    <div className="flex items-end gap-[3px] h-8 justify-center">
                        {[7.2, 8.1, 6.5, 8.8, 9.2, 7.8, 8.5, 9.0, 7.5, 8.2].map((v, i) => (
                            <div key={i} className="w-3 rounded-sm" style={{ height: `${(v / 10) * 100}%`, background: v >= 8 ? 'linear-gradient(to top, #22c55e, #4ade80)' : v >= 7 ? 'linear-gradient(to top, #eab308, #facc15)' : 'linear-gradient(to top, #ef4444, #f87171)' }} />
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${colors.border}44)` }} />
                    <span className="text-[7px] font-black uppercase tracking-[0.2em]" style={{ color: `${colors.label}80` }}>OYNA</span>
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${colors.border}44)` }} />
                </div>
            </div>
        </div>
    );
};

const MatchBanner: React.FC<{ item: MatchHistorySummary; isMvp?: boolean; onClick: () => void }> = ({ item, isMvp, onClick }) => (
    <button onClick={onClick} className="w-full relative group hover:scale-[1.01] active:scale-[0.99] transition-all text-left">
        <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent rounded-[24px] pointer-events-none" />
        <div className="relative bg-[#161B22]/80 backdrop-blur-xl border border-white/5 rounded-[24px] p-5 flex items-center gap-3 hover:bg-white/[0.08] transition-all overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex flex-col gap-1.5 z-10 text-left flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#c8962a]">{item.date}</span>
                    {isMvp && (
                        <span className="px-2 py-0.5 bg-[#FFFF00] text-black text-[8px] font-black rounded-full uppercase tracking-widest flex items-center gap-1 shadow-[0_0_10px_rgba(255,255,0,0.4)]">
                            <Trophy size={8} fill="black" /> MVP
                        </span>
                    )}
                </div>
                <h4 className="text-sm font-bold text-gray-300 truncate uppercase tracking-tight">{item.pitchName}</h4>
            </div>
            <div className="flex flex-col items-center z-10 w-20 shrink-0">
                <span className={`text-3xl font-black italic leading-none tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] ${item.result === 'WIN' ? 'text-[#39FF14]' : item.result === 'LOSS' ? 'text-[#FF3131]' : 'text-white'}`}>
                    {item.score}
                </span>
                <span className="text-[7px] font-black uppercase tracking-widest mt-1 opacity-50">SKOR</span>
            </div>
            <div className="z-10 shrink-0 bg-white/5 p-2.5 rounded-xl border border-white/10 group-hover:border-[#d4a84b]/50 transition-colors">
                <ChevronRight size={16} className="text-[#d4a84b]" />
            </div>
        </div>
    </button>
);

const ProfileScreen: React.FC<ProfileScreenProps> = ({ role, onBack, onNavigate, onOpenDiaryEntry }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [activeFilter, setActiveFilter] = useState<'ALL' | 'WIN' | 'PERFORMANCE' | 'MVP'>('ALL');
    // Profili Düzenle (mevki + bio) modalı
    const [showEditModal, setShowEditModal] = useState(false);
    const [editPos, setEditPos] = useState('');
    const [editBio, setEditBio] = useState('');
    const [editAvatar, setEditAvatar] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const { uploadImage, uploading } = useImageUpload('avatars');
    const { globalTexts, setMyRoles, setIsRoleSwitcherOpen, setServiceAppRole } = useAppStore();

    const [profile, setProfile] = useState<OynaUser | null>(null);
    const [matchHistory, setMatchHistory] = useState<MatchHistorySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const uid = auth.currentUser?.uid;
    // Misafir ("Önce Maçlara Göz At" ile giren, oturumsuz) kullanıcı.
    const isGuest = !uid;

    const loadProfile = async () => {
        if (!uid) {
            // Misafir: oturum yok. Hata göstermek yerine profili boş/placeholder
            // modda aç ki kullanıcı boş halleri görebilsin (üstte kaydolma şeridi).
            setProfile(null);
            setMatchHistory([]);
            setError(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [profileData, history] = await Promise.all([
                getFullUserProfile(uid),
                getMatchHistory(uid),
            ]);
            setProfile(profileData);
            setMatchHistory(history);
            // FAZ 7.5: rol değiştirici için güncel rolleri store'a yansıt
            if (profileData?.roles?.length) setMyRoles(profileData.roles);
        } catch (err) {
            console.error('ProfileScreen fetch:', err);
            setError('Profil yüklenemedi. Lütfen tekrar dene.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid]);

    const openEdit = () => {
        setEditPos(profile?.position || '');
        setEditBio(profile?.bio || '');
        setEditAvatar(profile?.avatar_url || '');
        setShowEditModal(true);
    };
    const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const url = await uploadImage(file);
            setEditAvatar(url);
        } catch (err) {
            console.error('Fotoğraf yükleme hatası:', err);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };
    const saveEdit = async () => {
        if (!uid) return;
        setSavingEdit(true);
        try {
            await updateProfileBasics(uid, {
                position: editPos.trim(),
                bio: editBio.trim(),
                ...(editAvatar && editAvatar !== profile?.avatar_url ? { avatar_url: editAvatar } : {}),
            });
            setShowEditModal(false);
            await loadProfile();
        } catch (e) {
            console.error('Profil güncelleme hatası:', e);
        } finally {
            setSavingEdit(false);
        }
    };

    const hasMultipleRoles = (profile?.roles?.length ?? 0) > 1;

    const total = matchHistory.length;
    const wins = matchHistory.filter(m => m.result === 'WIN').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    // Tier admin-atamalı (Q24): kart aktifken admin'in seçtiği tier kullanılır.
    const cardData = (() => {
        const c = buildCardData(profile, wins, total);
        return profile?.cardTier ? { ...c, tier: profile.cardTier } : c;
    })();

    // Filter match history
    const filteredMatches = matchHistory.filter(item => {
        if (activeFilter === 'WIN') return item.result === 'WIN';
        if (activeFilter === 'MVP') return false; // Maçın adamı oylaması henüz kayıt altına alınmıyor
        return true; // ALL or PERFORMANCE shows all matches
    });

    const getActiveFilterLabel = () => {
        switch (activeFilter) {
            case 'WIN': return 'FİLTRE: KAZANILAN MAÇLAR';
            case 'PERFORMANCE': return 'FİLTRE: YÜKSEK PERFORMANSLAR';
            case 'MVP': return 'FİLTRE: MAÇIN ADAMI SEÇİLDİKLERİN';
            default: return 'FİLTRE: TÜM GEÇMİŞ MAÇLAR';
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0A0E14] flex flex-col h-screen overflow-hidden selection:bg-[#FFFF00] selection:text-black">
            {/* ═══ FIXED TOP BAR ═══ */}
            <div className="px-6 pb-4 pt-safe flex justify-between items-center shrink-0 border-b border-white/5 z-50 bg-[#0A0E14]/90 backdrop-blur-md">
                <div className="flex items-center justify-between w-full pt-4">
                    <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 active:scale-95 transition-all">
                        <ArrowLeft size={18} />
                    </button>
                    <span className="text-sm font-black text-white tracking-widest uppercase italic">PROFİL</span>
                    <button onClick={() => onNavigate && onNavigate('SETTINGS')} className="w-10 h-10 flex items-center justify-center bg-[#161B22] rounded-full text-gray-400 hover:text-white border border-white/5 hover:bg-white/10 active:scale-95 transition-all">
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* ═══ NATURAL SCROLLABLE BODY ═══ */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar pb-28">
                {loading ? (
                    <LoadingState message="Profil yükleniyor..." />
                ) : error ? (
                    <ErrorState message={error} onRetry={loadProfile} />
                ) : (
                <>
                {/* ═══ MİSAFİR ŞERİDİ — oturumsuz kullanıcıya kaydolma çağrısı ═══ */}
                {isGuest && (
                    <div className="bg-[#FFFF00]/[0.06] border border-[#FFFF00]/30 rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.4)] relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#FFFF00]/10 blur-[40px] rounded-full pointer-events-none" />
                        <div className="relative z-10 flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#FFFF00] animate-pulse" />
                                <p className="text-[11px] font-black uppercase tracking-widest text-[#FFFF00]">Misafir Modundasın</p>
                            </div>
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                                Profilini oluşturmak, maçlara katılmak ve istatistiklerini biriktirmek için giriş yap.
                            </p>
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => onNavigate && onNavigate('AUTH')}
                                    className="flex-1 h-11 rounded-2xl bg-[#FFFF00] text-black font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all shadow-[0_0_15px_rgba(255,255,0,0.3)] hover:bg-yellow-300"
                                >
                                    Giriş Yap
                                </button>
                                <button
                                    onClick={() => onNavigate && onNavigate('AUTH')}
                                    className="flex-1 h-11 rounded-2xl bg-white/5 border border-white/15 text-white font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all hover:bg-white/10"
                                >
                                    Kaydol
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Kimlik — kart admin tarafından aktifse premium FIFA kartı, değilse sade profil */}
                {profile?.cardActive ? (
                <div className="flex flex-col items-center gap-6">
                    <div className="w-full max-w-[240px] cursor-pointer" style={{ perspective: '1200px' }} onClick={() => setIsFlipped(!isFlipped)}>
                        <motion.div
                            animate={{ rotateY: isFlipped ? 180 : 0 }}
                            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                            style={{ transformStyle: 'preserve-3d' }}
                            className="relative w-full"
                        >
                            {/* Front */}
                            <div style={{ backfaceVisibility: 'hidden' }}>
                                <PlayerCard name={profile?.full_name || 'Oyuncu'} photo={profile?.avatar_url || '/player_card_photo.png'} position="OS" cardData={cardData} />
                            </div>
                            {/* Back */}
                            <div className="absolute inset-0 w-full" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                                <div style={{ aspectRatio: '2 / 3' }}><CardBack tier={cardData.tier} matches={matchHistory} /></div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Static Info Badges under Card */}
                    <div className="flex justify-center gap-3 relative z-50">
                        <div className="px-3 py-1 bg-[#161B22]/80 backdrop-blur-md border border-[#d4a84b]/30 rounded-full flex items-center gap-1.5 shadow-2xl">
                            <span className="text-[8px] font-black uppercase tracking-widest text-[#c8962a]">Yaş</span>
                            <span className="text-xs font-black text-[#ffd54f]">26</span>
                        </div>
                        <div className="px-3 py-1 bg-[#161B22]/80 backdrop-blur-md border border-[#d4a84b]/30 rounded-full flex items-center gap-1.5 shadow-2xl">
                            <span className="text-[8px] font-black uppercase tracking-widest text-[#c8962a]">Ayak</span>
                            <span className="text-xs font-black text-[#ffd54f]">Sağ</span>
                        </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="w-full max-w-sm flex items-center justify-center gap-6 bg-[#161B22]/30 border border-white/5 rounded-2xl py-4">
                        <div className="text-center flex-1">
                            <p className="text-2xl font-black text-white italic">{total}</p>
                            <p className="text-[8px] text-[#d4a84b] font-black uppercase tracking-widest">Maç</p>
                        </div>
                        <div className="w-px h-10 bg-gradient-to-b from-transparent via-[#d4a84b]/20 to-transparent" />
                        <div className="text-center flex-1">
                            <p className="text-2xl font-black text-[#39FF14] italic">{winRate}%</p>
                            <p className="text-[8px] text-[#d4a84b] font-black uppercase tracking-widest">Galibiyet</p>
                        </div>
                        <div className="w-px h-10 bg-gradient-to-b from-transparent via-[#d4a84b]/20 to-transparent" />
                        <div className="text-center flex-1">
                            <div className="flex items-center justify-center gap-1">
                                <Shield size={16} fill="#39FF14" className="text-[#39FF14]" />
                                <p className="text-2xl font-black text-[#39FF14] italic">100</p>
                            </div>
                            <p className="text-[8px] text-[#d4a84b] font-black uppercase tracking-widest">Güven</p>
                        </div>
                    </div>
                </div>
                ) : (
                <div className="flex flex-col items-center gap-4 pt-2">
                    <img
                        src={profile?.avatar_url || '/player_card_photo.png'}
                        alt={profile?.full_name || 'Oyuncu'}
                        referrerPolicy="no-referrer"
                        className="w-28 h-28 rounded-3xl object-cover border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                    />
                    <div className="text-center">
                        <h2 className="text-xl font-black text-white italic uppercase tracking-tight">{profile?.full_name || 'Oyuncu'}</h2>
                        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#39FF14]">{profile?.position || 'Mevki belirtilmedi'}</span>
                        </div>
                    </div>
                    <p className={`text-[12px] text-center leading-relaxed max-w-xs ${profile?.bio ? 'text-gray-400' : 'text-gray-600 italic'}`}>
                        {profile?.bio || 'Henüz bir tanıtım eklemedin.'}
                    </p>
                    <button onClick={openEdit} className="mt-1 px-5 py-2.5 rounded-full bg-white/5 border border-white/15 text-white text-[11px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all flex items-center gap-2">
                        <Pencil size={13} /> Profili Düzenle
                    </button>
                </div>
                )}

                {/* Profili Düzenle modalı (mevki + bio) */}
                {showEditModal && (
                    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowEditModal(false)}>
                        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-[#0A0E14] border-t border-white/10 rounded-t-[28px] p-6 pb-10 space-y-4">
                            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto" />
                            <h3 className="text-base font-black text-white uppercase tracking-wider">Profili Düzenle</h3>
                            {/* Profil fotoğrafı */}
                            <div className="flex flex-col items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="relative group active:scale-95 transition-all disabled:opacity-60"
                                >
                                    <img
                                        src={editAvatar || '/player_card_photo.png'}
                                        alt="Profil"
                                        referrerPolicy="no-referrer"
                                        className="w-24 h-24 rounded-3xl object-cover border border-white/10"
                                    />
                                    <div className="absolute inset-0 rounded-3xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Pencil size={20} className="text-white" />
                                    </div>
                                    {uploading && (
                                        <div className="absolute inset-0 rounded-3xl bg-black/70 flex items-center justify-center">
                                            <span className="text-[10px] font-black text-[#39FF14] uppercase tracking-widest">Yükleniyor…</span>
                                        </div>
                                    )}
                                </button>
                                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-[10px] font-black text-[#39FF14] uppercase tracking-widest disabled:opacity-60">
                                    Fotoğrafı Değiştir
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">Mevki</label>
                                <input value={editPos} onChange={(e) => setEditPos(e.target.value)} placeholder="Örn: Orta Saha" className="mt-1.5 w-full bg-[#161B22] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-[#39FF14]/40" />
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">Kısa Tanıtım</label>
                                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} maxLength={200} placeholder="Kendini birkaç kelimeyle anlat..." className="mt-1.5 w-full bg-[#161B22] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-[#39FF14]/40 resize-none" />
                            </div>
                            <button onClick={saveEdit} disabled={savingEdit || uploading} className="w-full h-12 rounded-2xl bg-[#39FF14] text-black font-black text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50">
                                {savingEdit ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ═══ WALLET CARD ═══ */}
                <button 
                    onClick={() => onNavigate && onNavigate('WALLET')}
                    className="w-full bg-[#161B22]/60 backdrop-blur-md border border-[#39FF14]/30 rounded-3xl p-5 flex items-center justify-between group hover:bg-[#39FF14]/5 hover:border-[#39FF14]/50 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden"
                >
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#39FF14]/10 blur-[40px] rounded-full group-hover:bg-[#39FF14]/20 transition-all" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-[#39FF14]/20 rounded-2xl flex items-center justify-center border border-[#39FF14]/30 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(57,255,20,0.2)]">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#39FF14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                        </div>
                        <div className="text-left">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">OYNA CÜZDAN</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black italic text-white leading-none tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{(profile?.walletBalance ?? 0).toLocaleString('tr-TR')}</span>
                                <span className="text-sm font-bold text-[#39FF14]">₺</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative z-10 flex flex-col items-end gap-1">
                        <span className="px-4 py-2 bg-[#39FF14] text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-[#32e612] transition-colors shadow-[0_0_15px_rgba(57,255,20,0.4)] hover:shadow-[0_0_25px_rgba(57,255,20,0.6)]">
                            YÖNET
                        </span>
                    </div>
                </button>

                {/* ═══ TAKIMLARIM CARD ═══ */}
                <button
                    onClick={() => onNavigate && onNavigate('MY_TEAM')}
                    className="w-full bg-[#161B22]/60 backdrop-blur-md border border-[#FFFF00]/30 rounded-3xl p-5 flex items-center justify-between group hover:bg-[#FFFF00]/5 hover:border-[#FFFF00]/50 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden"
                >
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#FFFF00]/10 blur-[40px] rounded-full group-hover:bg-[#FFFF00]/20 transition-all" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-[#FFFF00]/20 rounded-2xl flex items-center justify-center border border-[#FFFF00]/30 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(255,255,0,0.2)]">
                            <Users size={22} className="text-[#FFFF00]" />
                        </div>
                        <div className="text-left">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">TAKIMLARIM</p>
                            <p className="text-sm font-black italic text-white leading-none tracking-tight">Kadro & Taktik Tahtası</p>
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-[#FFFF00] relative z-10 group-hover:translate-x-1 transition-transform" />
                </button>

                {/* ═══ ROL DEĞİŞTİR CARD (yalnızca >1 rol varsa) ═══ */}
                {hasMultipleRoles && (
                    <button
                        onClick={() => {
                            if (profile?.roles?.length) setMyRoles(profile.roles);
                            setIsRoleSwitcherOpen(true);
                        }}
                        className="w-full bg-[#161B22]/60 backdrop-blur-md border border-[#3b82f6]/30 rounded-3xl p-5 flex items-center justify-between group hover:bg-[#3b82f6]/5 hover:border-[#3b82f6]/50 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden"
                    >
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#3b82f6]/10 blur-[40px] rounded-full group-hover:bg-[#3b82f6]/20 transition-all" />
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 bg-[#3b82f6]/20 rounded-2xl flex items-center justify-center border border-[#3b82f6]/30 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                                <Repeat size={22} className="text-[#3b82f6]" />
                            </div>
                            <div className="text-left">
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">ROL DEĞİŞTİR</p>
                                <p className="text-sm font-black italic text-white leading-none tracking-tight">Birden çok rolün var — geçiş yap</p>
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-[#3b82f6] relative z-10 group-hover:translate-x-1 transition-transform" />
                    </button>
                )}

                {/* ═══ SAHADA ROLÜN — opt-in rol başvurusu ═══ */}
                <div className="bg-[#161B22]/50 backdrop-blur-md border border-white/5 rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">SAHADA ROLÜN</p>
                    <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
                        Oyunculuğun her zaman açık. İstersen ek bir rol için başvur; onaylanınca uygulamayı açtığında doğrudan o panele yönlendirilirsin.
                    </p>
                    {(((profile as any)?.verificationStatus ?? (profile as any)?.verification_status) === 'pending') && (
                        <div className="mb-3 rounded-2xl px-3 py-2.5 text-[11px] font-bold flex items-center gap-2" style={{ background: 'rgba(255,170,0,0.1)', border: '1px solid rgba(255,170,0,0.35)', color: '#FFAA00' }}>
                            <Activity size={14} className="shrink-0" /> Başvurun inceleniyor — oyuncu olarak oynamaya devam edebilirsin.
                        </div>
                    )}
                    <div className="space-y-2.5">
                        {[
                            { r: UserRole.GOALKEEPER, label: 'Kaleci', sub: 'Maç başı ücretini konuştur, talep al', color: '#39FF14', icon: <Shield size={20} /> },
                            { r: UserRole.REFEREE, label: 'Hakem', sub: 'Yönettiğin maçtan kazan', color: '#FF3333', icon: <Scale size={20} /> },
                            { r: UserRole.OWNER, label: 'Tesis', sub: 'Sahanı ve rezervasyonları yönet', color: '#3b82f6', icon: <Building2 size={20} /> },
                        ].map((opt) => {
                            const owned = ((profile?.roles ?? []) as string[]).includes(opt.r);
                            return (
                                <button
                                    key={opt.r}
                                    onClick={() => {
                                        if (owned) {
                                            if (profile?.roles?.length) setMyRoles(profile.roles);
                                            setIsRoleSwitcherOpen(true);
                                            return;
                                        }
                                        if (opt.r === UserRole.OWNER) { onNavigate && onNavigate('PARTNER_ONBOARDING'); return; }
                                        setServiceAppRole(opt.r);
                                        onNavigate && onNavigate('SERVICE_APPLICATION');
                                    }}
                                    className="w-full flex items-center gap-3 rounded-2xl p-3.5 border transition-all active:scale-[0.99]"
                                    style={{ background: `${opt.color}0d`, borderColor: `${opt.color}26` }}
                                >
                                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${opt.color}1a`, color: opt.color }}>
                                        {opt.icon}
                                    </div>
                                    <div className="text-left flex-1 min-w-0">
                                        <p className="text-sm font-black text-white leading-tight">{opt.label}</p>
                                        <p className="text-[11px] text-gray-400 truncate">{opt.sub}</p>
                                    </div>
                                    {owned ? (
                                        <span className="text-[10px] font-black px-3 py-1.5 rounded-full shrink-0" style={{ color: opt.color, background: `${opt.color}1a`, border: `1px solid ${opt.color}40` }}>SAHİP</span>
                                    ) : (
                                        <span className="text-[11px] font-black px-3 py-1.5 rounded-full shrink-0 flex items-center gap-1" style={{ color: '#39FF14', background: 'rgba(57,255,20,0.1)', border: '1px solid rgba(57,255,20,0.4)' }}>Başvur →</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ═══ BENTO STATISTICS & FILTERS (yalnız kart aktifken) ═══ */}
                {profile?.cardActive && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Wins filter button */}
                        <button 
                            onClick={() => setActiveFilter(activeFilter === 'WIN' ? 'ALL' : 'WIN')}
                            className={`col-span-1 border rounded-[28px] p-5 flex flex-col justify-between h-32 relative overflow-hidden group text-left transition-all ${
                                activeFilter === 'WIN' 
                                    ? 'bg-[#39FF14]/10 border-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]' 
                                    : 'bg-[#161B22]/50 border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="absolute -top-4 -right-4 w-20 h-20 bg-[#39FF14]/10 blur-3xl rounded-full" />
                            <Activity size={20} className={activeFilter === 'WIN' ? 'text-[#39FF14]' : 'text-gray-400'} />
                            <div>
                                <p className="text-3xl font-black text-white italic leading-none">{wins}</p>
                                <p className={`text-[9px] font-black uppercase tracking-widest mt-1.5 ${
                                    activeFilter === 'WIN' ? 'text-[#39FF14]' : 'text-[#c8962a]'
                                }`}>GALİBİYET</p>
                            </div>
                        </button>

                        {/* Performance/All filter button */}
                        <button 
                            onClick={() => setActiveFilter(activeFilter === 'PERFORMANCE' ? 'ALL' : 'PERFORMANCE')}
                            className={`col-span-1 border rounded-[28px] p-5 flex flex-col justify-between h-32 relative overflow-hidden group text-left transition-all ${
                                activeFilter === 'PERFORMANCE' 
                                    ? 'bg-[#FFFF00]/10 border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.2)]' 
                                    : 'bg-[#161B22]/50 border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="absolute -top-4 -right-4 w-20 h-20 bg-[#FFFF00]/10 blur-3xl rounded-full" />
                            <TrendingUp size={20} className={activeFilter === 'PERFORMANCE' ? 'text-[#FFFF00]' : 'text-gray-400'} />
                            <div>
                                <p className="text-3xl font-black text-white italic leading-none">{winRate}%</p>
                                <p className={`text-[9px] font-black uppercase tracking-widest mt-1.5 ${
                                    activeFilter === 'PERFORMANCE' ? 'text-[#FFFF00]' : 'text-[#c8962a]'
                                }`}>PERFORMANS</p>
                            </div>
                        </button>

                        {/* MVP filter button */}
                        <button 
                            onClick={() => setActiveFilter(activeFilter === 'MVP' ? 'ALL' : 'MVP')}
                            className={`col-span-2 border rounded-[28px] p-5 flex items-center justify-between h-24 relative overflow-hidden group text-left transition-all ${
                                activeFilter === 'MVP' 
                                    ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]' 
                                    : 'bg-[#161B22]/50 border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                                    activeFilter === 'MVP' 
                                        ? 'bg-indigo-500/30 border-indigo-400' 
                                        : 'bg-indigo-500/10 border-indigo-500/20'
                                }`}>
                                    <Target size={24} className={activeFilter === 'MVP' ? 'text-indigo-300' : 'text-indigo-400'} />
                                </div>
                                <div>
                                    <p className="text-lg font-black text-white uppercase tracking-tight italic leading-none">MAÇIN ADAMI</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1.5">MVP SEÇİLDİN</p>
                                </div>
                            </div>
                            <span className={`text-4xl font-black italic ${activeFilter === 'MVP' ? 'text-indigo-300' : 'text-indigo-400'}`}>0</span>
                        </button>
                    </div>
                </div>

                )}

                {/* ═══ MATCH LIST SECTION ═══ */}
                <div className="space-y-5">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-5">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-gray-500">GEÇMİŞ MAÇLAR</span>
                            <div className="flex-1 h-px bg-white/10" />
                        </div>
                        {/* Active Filter Badge */}
                        <div className="flex justify-center">
                            <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-black tracking-widest text-[#FFFF00] uppercase shadow-sm">
                                {getActiveFilterLabel()}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {filteredMatches.length > 0 ? (
                            filteredMatches.map(item => (
                                <MatchBanner
                                    key={item.id}
                                    item={item}
                                    isMvp={false}
                                    onClick={() => onOpenDiaryEntry(item.id)}
                                />
                            ))
                        ) : (
                            <div className="text-center py-10 bg-[#161B22]/30 border border-white/5 rounded-3xl">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">BU KATEGORİDE MAÇ BULUNAMADI</p>
                            </div>
                        )}
                    </div>
                </div>
                </>
                )}
            </div>

            {/* ═══ FIXED BOTTOM BAR ═══ */}
            <div className="px-6 pt-4 pb-safe border-t border-white/5 flex items-center justify-around shrink-0 bg-[#0A0E14]/90 backdrop-blur-xl z-50">
                <button onClick={() => { if (navigator.share) navigator.share({ title: 'OYNA', url: window.location.href }).catch(() => {}); }} className="flex flex-col items-center gap-1.5 group">
                    <div className="w-11 h-11 bg-[#161B22] border border-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#d4a84b] transition-all shadow-lg">
                        <Share2 size={18} />
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">PAYLAŞ</span>
                </button>
                <button className="flex flex-col items-center gap-1.5 group">
                    <div className="w-11 h-11 bg-[#161B22] border border-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-white transition-all shadow-lg">
                        <Pencil size={18} />
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">DÜZENLE</span>
                </button>
            </div>
        </div>
    );
};

export default ProfileScreen;
