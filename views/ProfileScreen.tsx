import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserRole, AppView, PlayerCardData } from '../types';
import { ArrowLeft, Settings, Users, UserPlus, Wallet, Pencil } from 'lucide-react';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { getFullUserProfile, getMatchHistory, MatchHistorySummary, OynaUser, updateProfileBasics } from '../services/userService';
import { fetchFriends } from '../services/friendService';
import { getMyTeams } from '../services/teamSocialService';
import { LoadingState, ErrorState } from '../components/common/StatusState';
import { useImageUpload } from '../hooks/useImageUpload';
import { ProfileHero, TrustScoreCard, ProfileShortcuts, MatchHistorySection } from '../components/profile';
import type { ShortcutItem } from '../components/profile';
import { OynaLogo } from '../components/OynaLogo';
import { ratingToOverall, tierForOverall } from '../utils/ratingScale';

const DEFAULT_CARD_STAT = { value: 50, videoUrl: null };

const buildCardData = (profile: OynaUser | null, wins: number, total: number): PlayerCardData => {
    // playerCard'ı YALNIZCA tam (stats + overall içeriyorsa) kullan; eksik/kısmi
    // kart (ör. yalnız tier/position) PlayerCard'ı çökertirdi (stats.shooting undefined).
    const pc = profile?.playerCard as Partial<PlayerCardData> | undefined;
    if (pc && pc.stats && typeof pc.overall === 'number') {
        return pc as PlayerCardData;
    }
    // Rookie ayrımı: hiç maç oynamamış oyuncu için sahte OVR göstermeyiz.
    // Maç sayısı için GÜVENİLİR sinyal profiles.match_count (stats.matchesPlayed);
    // matchHistory.length maç kayıtları linklenmemişse veterana "0" derdi.
    const matchesForCard = profile?.stats?.matchesPlayed ?? total;
    const overallOrNull = ratingToOverall(profile?.stats?.rating, matchesForCard);
    const rookie = overallOrNull === null;
    const overall = overallOrNull ?? 0;
    return {
        overall,
        isRookie: rookie,
        tier: rookie ? 'bronze' : (tierForOverall(overallOrNull) as 'gold' | 'silver' | 'bronze'),
        isStatsVerified: false,
        diamondValue: 0,
        winCount: wins,
        totalMatches: matchesForCard,
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

const ageFromBirthdate = (birthdate?: string | null): number | null => {
    if (!birthdate) return null;
    const d = new Date(birthdate);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 5 && age < 120 ? age : null;
};

const FOOT_LABELS: Record<'SAG' | 'SOL' | 'CIFT', string> = { SAG: 'Sağ', SOL: 'Sol', CIFT: 'Çift' };

// Eski/seed verideki enum-biçimli mevkileri okunur hale getirir ("SAG_KANAT" → "Sağ Kanat").
const POSITION_WORDS: Record<string, string> = {
    SAG: 'Sağ', SOL: 'Sol', KANAT: 'Kanat', ORTA: 'Orta', SAHA: 'Saha',
    KALECI: 'Kaleci', STOPER: 'Stoper', BEK: 'Bek', FORVET: 'Forvet', SANTRFOR: 'Santrfor',
};
const formatPosition = (pos?: string | null): string | null => {
    if (!pos) return null;
    if (!/^[A-Z_ÇĞİÖŞÜ]+$/.test(pos)) return pos; // serbest metin — dokunma
    return pos.split('_').map(w => POSITION_WORDS[w] || (w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR'))).join(' ');
};

interface ProfileScreenProps {
    role: UserRole;
    onBack: () => void;
    onNavigate?: (view: AppView) => void;
    onOpenDiaryEntry: (id: string) => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ role, onBack, onNavigate, onOpenDiaryEntry }) => {
    // Profili Düzenle (mevki + bio + doğum tarihi + ayak) modalı
    const [showEditModal, setShowEditModal] = useState(false);
    const [editPos, setEditPos] = useState('');
    const [editBio, setEditBio] = useState('');
    const [editAvatar, setEditAvatar] = useState('');
    const [editBirthdate, setEditBirthdate] = useState('');
    const [editFoot, setEditFoot] = useState<'SAG' | 'SOL' | 'CIFT' | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const { uploadImage, uploading } = useImageUpload('avatars', { minWidth: 200 });
    const { setMyRoles, setSocialTarget } = useAppStore();

    const [profile, setProfile] = useState<OynaUser | null>(null);
    const [matchHistory, setMatchHistory] = useState<MatchHistorySummary[]>([]);
    const [teamsCount, setTeamsCount] = useState(0);
    const [friendsCount, setFriendsCount] = useState(0);
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
            // Kısayol sayıları en-iyi-çaba: biri düşerse profil yine açılır.
            const [teamsRes, friendsRes] = await Promise.allSettled([
                // E2: Sosyal ile TEK kaynak (get_my_teams) — Profil eskiden
                // fetchUserTeams (arşivi de sayan) kullanıp Sosyal ile çelişiyordu.
                getMyTeams(),
                fetchFriends(uid),
            ]);
            if (teamsRes.status === 'fulfilled') {
                setTeamsCount(teamsRes.value.filter(t => !t.is_archived).length);
            }
            if (friendsRes.status === 'fulfilled') {
                setFriendsCount(friendsRes.value.length);
            }
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
        setEditBirthdate(profile?.birthdate || '');
        setEditFoot(profile?.preferredFoot ?? null);
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
                birthdate: editBirthdate || null,
                preferred_foot: editFoot,
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

    const total = matchHistory.length;
    const wins = matchHistory.filter(m => m.result === 'WIN').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    // Tier admin-atamalı (Q24): kart aktifken admin'in seçtiği tier kullanılır.
    const cardData = (() => {
        const c = buildCardData(profile, wins, total);
        // Admin açıkça tier atadıysa rookie durumunu geçersiz kıl (o kartı göster).
        return profile?.cardTier ? { ...c, tier: profile.cardTier, isRookie: false } : c;
    })();

    // Güven puanı: DB'de 0–5, ekranda 0–100.
    const trustScore = Math.round((profile?.trustScore ?? 5) * 20);

    const shortcuts: ShortcutItem[] = [
        {
            icon: <Wallet size={16} strokeWidth={2.3} />,
            label: 'Cüzdan',
            value: `${(profile?.walletBalance ?? 0).toLocaleString('tr-TR')} ₺`,
            onClick: () => onNavigate && onNavigate('WALLET'),
        },
        {
            icon: <Users size={16} strokeWidth={2.3} />,
            label: 'Takımlarım',
            value: `${teamsCount} Takım`,
            // MY_TEAM artık belirli takım detayı (TeamDetailView, selectedTeamId gerekir);
            // Sosyal'in Takımlarım sekmesine yönlendir (main A4 kararı).
            onClick: () => { setSocialTarget({ tab: 'TEAMS', subTab: 'MINE' }); onNavigate && onNavigate('SOCIAL'); },
        },
        {
            icon: <UserPlus size={16} strokeWidth={2.3} />,
            label: 'Arkadaşlarım',
            value: `${friendsCount} Arkadaş`,
            onClick: () => { setSocialTarget({ tab: 'FRIENDS' }); onNavigate && onNavigate('SOCIAL'); },
        },
    ];

    return (
        <div className="fixed inset-0 bg-bg-main flex flex-col h-screen overflow-hidden selection:bg-primary selection:text-black">
            {/* Ambient ışıma */}
            <div className="pf-ambient" />

            {/* ═══ FIXED TOP BAR ═══ */}
            <div className="px-6 pb-3 pt-safe flex justify-between items-center shrink-0 z-50">
                <div className="flex items-center justify-between w-full pt-4">
                    <button onClick={onBack} className="w-[42px] h-[42px] flex items-center justify-center bg-[#161B22]/80 rounded-full text-white border border-white/[0.08] hover:bg-white/10 active:scale-95 transition-all">
                        <ArrowLeft size={19} strokeWidth={2.3} />
                    </button>
                    <div className="flex items-center gap-2">
                        <OynaLogo width={20} height={20} />
                        <span className="text-base font-black text-white tracking-[0.05em] uppercase italic">Profil</span>
                    </div>
                    <button onClick={() => onNavigate && onNavigate('SETTINGS')} className="w-[42px] h-[42px] flex items-center justify-center bg-[#161B22]/80 rounded-full text-white/75 hover:text-white border border-white/[0.08] hover:bg-white/10 active:scale-95 transition-all">
                        <Settings size={17} />
                    </button>
                </div>
            </div>

            {/* ═══ SCROLLABLE BODY ═══ */}
            <div className="relative z-10 flex-1 overflow-y-auto px-5 pt-2 pb-safe-nav custom-scrollbar">
                {loading ? (
                    <LoadingState message="Profil yükleniyor..." />
                ) : error ? (
                    <ErrorState message={error} onRetry={loadProfile} />
                ) : (
                <>
                {/* ═══ MİSAFİR ŞERİDİ — oturumsuz kullanıcıya kaydolma çağrısı ═══ */}
                {isGuest && (
                    <div className="mb-4 bg-[#FACC15]/[0.06] border border-[#FACC15]/30 rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.4)] relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#FACC15]/10 blur-[40px] rounded-full pointer-events-none" />
                        <div className="relative z-10 flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-[#FACC15] animate-pulse" />
                                <p className="text-[11px] font-black uppercase tracking-widest text-[#FACC15]">Misafir Modundasın</p>
                            </div>
                            <p className="text-[11px] text-gray-400 leading-relaxed">
                                Profilini oluşturmak, maçlara katılmak ve istatistiklerini biriktirmek için giriş yap.
                            </p>
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => onNavigate && onNavigate('AUTH')}
                                    className="flex-1 h-11 rounded-2xl bg-[#FACC15] text-black font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:bg-yellow-300"
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

                {/* ═══ KİMLİK KARTI ═══ */}
                <ProfileHero
                    name={profile?.full_name || (isGuest ? 'Misafir' : 'Oyuncu')}
                    avatarUrl={profile?.avatar_url}
                    verified={!isGuest && profile?.verification_status === 'approved'}
                    position={formatPosition(profile?.position)}
                    age={ageFromBirthdate(profile?.birthdate)}
                    footLabel={profile?.preferredFoot ? FOOT_LABELS[profile.preferredFoot] : null}
                    matches={total}
                    winRate={winRate}
                    mvp={null /* MVP oylaması kayıt altına alınınca bağlanacak */}
                    cardAvailable={!!profile?.cardActive}
                    cardData={cardData}
                    cardBackMatches={matchHistory}
                    onEditAvatar={isGuest ? undefined : openEdit}
                    onShareCard={() => {
                        if (navigator.share) {
                            navigator.share({ title: 'OYNA', text: `${profile?.full_name || 'Oyuncu'} — OYNA oyuncu kartım`, url: window.location.origin }).catch(() => {});
                        }
                    }}
                />

                {/* Bio + Profili Düzenle — sade tutuldu, hero'nun hemen altında */}
                {!isGuest && (
                    <div className="mt-3 flex items-center gap-3 px-1">
                        <p className={`flex-1 text-[12px] leading-relaxed ${profile?.bio ? 'text-gray-400' : 'text-gray-600 italic'}`}>
                            {profile?.bio || 'Henüz bir tanıtım eklemedin.'}
                        </p>
                        <button onClick={openEdit} className="shrink-0 px-3.5 py-2 rounded-full bg-white/5 border border-white/15 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all flex items-center gap-1.5">
                            <Pencil size={11} /> Düzenle
                        </button>
                    </div>
                )}

                {/* ═══ GÜVEN PUANI ═══ */}
                {!isGuest && (
                    <div className="mt-3.5">
                        <TrustScoreCard score={trustScore} />
                    </div>
                )}

                {/* ═══ KISAYOLLAR ═══ */}
                <div className="mt-3">
                    <ProfileShortcuts items={shortcuts} />
                </div>

                {/* Rol yönetimi (rol değiştir + ek rol başvurusu) Ayarlar → Sahada Rolün'e taşındı. */}

                {/* ═══ MAÇ GEÇMİŞİ ═══ */}
                <MatchHistorySection matches={matchHistory} onOpen={onOpenDiaryEntry} />
                </>
                )}
            </div>

            {/* ═══ PROFİLİ DÜZENLE MODALI (mevki + bio + doğum tarihi + ayak) ═══
                 Portal: motion sarmalayıcıların stacking context'i modalı BottomNav'ın
                 altına itiyordu (Kaydet tıklanamıyordu) — body'ye taşınarak çözüldü. */}
            {showEditModal && createPortal(
                <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowEditModal(false)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[88vh] overflow-y-auto custom-scrollbar bg-bg-main border-t border-white/10 rounded-t-[28px] p-6 pb-10 space-y-4">
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
                                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">Yükleniyor…</span>
                                    </div>
                                )}
                            </button>
                            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-[10px] font-black text-primary uppercase tracking-widest disabled:opacity-60">
                                Fotoğrafı Değiştir
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">Mevki</label>
                            <input value={editPos} onChange={(e) => setEditPos(e.target.value)} placeholder="Örn: Orta Saha" className="mt-1.5 w-full bg-[#161B22] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/40" />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">Doğum Tarihi</label>
                            <input
                                type="date"
                                value={editBirthdate}
                                onChange={(e) => setEditBirthdate(e.target.value)}
                                max={new Date().toISOString().slice(0, 10)}
                                className="mt-1.5 w-full bg-[#161B22] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/40 [color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">Kullandığın Ayak</label>
                            <div className="mt-1.5 flex gap-2">
                                {(Object.keys(FOOT_LABELS) as Array<'SAG' | 'SOL' | 'CIFT'>).map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setEditFoot(editFoot === f ? null : f)}
                                        className={`flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                                            editFoot === f
                                                ? 'bg-primary text-black border-primary'
                                                : 'bg-[#161B22] text-white/60 border-white/10 hover:bg-white/5'
                                        }`}
                                    >
                                        {FOOT_LABELS[f]}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider ml-1">Kısa Tanıtım</label>
                            <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} maxLength={200} placeholder="Kendini birkaç kelimeyle anlat..." className="mt-1.5 w-full bg-[#161B22] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none focus:border-primary/40 resize-none" />
                        </div>
                        <button onClick={saveEdit} disabled={savingEdit || uploading} className="w-full h-12 rounded-2xl bg-primary text-black font-black text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50">
                            {savingEdit ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default ProfileScreen;
