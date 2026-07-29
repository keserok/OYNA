import React, { useState, useEffect } from 'react';
import { UserRole, AppView } from '../types';
import { ArrowLeft, Settings, Users, UserPlus, Wallet, Pencil, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { getFullUserProfile, getMatchHistory, MatchHistorySummary, OynaUser, updateProfileBasics } from '../services/userService';
import { fetchFriends } from '../services/friendService';
import { getMyTeams } from '../services/teamSocialService';
import { LoadingState, ErrorState } from '../components/common/StatusState';
import { ProfileHero, TrustScoreCard, ProfileShortcuts, MatchHistorySection } from '../components/profile';
import type { ShortcutItem } from '../components/profile';
import { ProfileEditSheet, type ProfileEditValues } from '../components/profile/ProfileEditSheet';
import { OynaLogo } from '../components/OynaLogo';
// Türetme mantığı TEK KAYNAK: admin panelin Kullanıcı Profili Aynası da aynı
// modülü kullanır — kart/rozet/puan hesapları iki yüzeyde asla ayrışmaz.
import { buildCardData, applyCardTierOverride, ageFromBirthdate, formatPosition, trustScoreTo100, winStats } from '../shared/profilePresentation';

interface ProfileScreenProps {
    role: UserRole;
    onBack: () => void;
    onNavigate?: (view: AppView) => void;
    onOpenDiaryEntry: (id: string) => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ role, onBack, onNavigate, onOpenDiaryEntry }) => {
    // Profili Düzenle (mevki + bio + doğum tarihi + ayak) modalı — TEK KAYNAK ProfileEditSheet
    const [showEditModal, setShowEditModal] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const { setMyRoles, setSocialTarget } = useAppStore();

    const [profile, setProfile] = useState<OynaUser | null>(null);
    // F2.2: MVP artık player_ratings ortalamasından TÜRETİLİYOR (match_motm
    // görünümü); sayaç SECURITY DEFINER RPC'den okunur (RLS düz sorguya kapalı).
    const [motmCount, setMotmCount] = useState<number | null>(null);
    useEffect(() => {
        let cancelled = false;
        const uid = auth.currentUser?.uid;
        if (!uid) { setMotmCount(null); return; }
        supabase.rpc('get_player_motm_count', { p_user_id: uid }).then(({ data, error }) => {
            if (!cancelled && !error) setMotmCount(Number(data ?? 0));
        });
        return () => { cancelled = true; };
    }, []);
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
            // D2: giriş yapmış kullanıcının profili null ise bu bir YÜKLEME
            // HATASIDIR (getFullUserProfile hatayı yutup null döndürüyor) —
            // düzenlenebilir boş "Oyuncu" profili gösterip gerçek profili ezme
            // riski yaratmak yerine hata durumu + Yeniden Dene göster.
            if (!profileData) {
                setError('Profil bilgilerin şu an yüklenemedi. Bağlantını kontrol edip tekrar dene.');
                return;
            }
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

    const openEdit = () => setShowEditModal(true);

    const saveEdit = async (v: ProfileEditValues) => {
        if (!uid) return;
        setSavingEdit(true);
        try {
            await updateProfileBasics(uid, {
                position: v.position,
                bio: v.bio,
                birthdate: v.birthdate || null,
                gender: v.gender || null,
                play_style: v.playStyle || null,
                ...(v.avatarUrl && v.avatarUrl !== profile?.avatar_url ? { avatar_url: v.avatarUrl } : {}),
            });
            // MOB-S4: Ana sayfa sol üst avatar (UserAvatar) store'daki oturum
            // kimliğinden beslenir — fotoğraf değişimini ANINDA oraya da yansıt.
            if (v.avatarUrl && v.avatarUrl !== profile?.avatar_url) {
                const cur = useAppStore.getState().currentUserProfile;
                if (cur && cur.id === uid) {
                    useAppStore.getState().setCurrentUserProfile({ ...cur, avatar: v.avatarUrl });
                }
            }
            setShowEditModal(false);
            await loadProfile();
        } catch (e) {
            console.error('Profil güncelleme hatası:', e);
        } finally {
            setSavingEdit(false);
        }
    };

    const { total, wins, winRate } = winStats(matchHistory);

    // Tier admin-atamalı (Q24): kart aktifken admin'in seçtiği tier kullanılır.
    const cardData = applyCardTierOverride(buildCardData(profile, wins, total), profile);

    // Güven puanı: DB'de 0–5, ekranda 0–100.
    const trustScore = trustScoreTo100(profile?.trustScore);

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
                        <span className="text-base font-extrabold text-white tracking-[0.05em] uppercase italic">Profil</span>
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
                                <p className="text-[0.6875rem] font-extrabold uppercase tracking-widest text-[#FACC15]">Misafir Modundasın</p>
                            </div>
                            <p className="text-[0.6875rem] text-gray-400 leading-relaxed">
                                Profilini oluşturmak, maçlara katılmak ve istatistiklerini biriktirmek için giriş yap.
                            </p>
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => onNavigate && onNavigate('AUTH')}
                                    className="flex-1 h-11 rounded-2xl bg-[#FACC15] text-black font-extrabold text-[0.6875rem] uppercase tracking-widest active:scale-95 transition-all shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:bg-yellow-300"
                                >
                                    Giriş Yap
                                </button>
                                <button
                                    onClick={() => onNavigate && onNavigate('AUTH')}
                                    className="flex-1 h-11 rounded-2xl bg-white/5 border border-white/15 text-white font-extrabold text-[0.6875rem] uppercase tracking-widest active:scale-95 transition-all hover:bg-white/10"
                                >
                                    Kaydol
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ PROFİL TAMAMLANMADI ŞERİDİ — onboarding'i atlayan kayıtlı kullanıcı ═══ */}
                {!isGuest && profile && profile.hasCompletedOnboarding === false && (
                    <button
                        onClick={() => onNavigate && onNavigate('ONBOARDING')}
                        className="w-full mb-4 text-left bg-[#FACC15]/[0.07] border border-[#FACC15]/30 rounded-3xl p-4 flex items-center gap-3 active:scale-[0.99] transition-all shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
                    >
                        <div className="w-10 h-10 rounded-2xl bg-[#FACC15]/15 flex items-center justify-center shrink-0">
                            <AlertCircle size={20} className="text-[#FACC15]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[0.8125rem] font-extrabold text-white">Profil tamamlanmadı</p>
                            <p className="text-[0.6875rem] text-gray-400 leading-snug">Birkaç bilgi eksik. Tamamla, sana uygun maçları önerelim.</p>
                        </div>
                        <span className="text-[0.6875rem] font-extrabold text-[#FACC15] uppercase tracking-wider shrink-0">Tamamla →</span>
                    </button>
                )}

                {/* ═══ KİMLİK KARTI ═══ */}
                <ProfileHero
                    name={profile?.full_name || (isGuest ? 'Misafir' : 'Oyuncu')}
                    avatarUrl={profile?.avatar_url}
                    verified={!isGuest && profile?.verification_status === 'approved'}
                    position={formatPosition(profile?.position)}
                    age={ageFromBirthdate(profile?.birthdate)}
                    ageRange={profile?.ageRange}
                    gender={profile?.gender}
                    playStyle={profile?.playStyle}
                    matches={total}
                    winRate={winRate}
                    mvp={motmCount}
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
                        <p className={`flex-1 text-[0.75rem] leading-relaxed ${profile?.bio ? 'text-gray-400' : 'text-ink-4 italic'}`}>
                            {profile?.bio || 'Henüz bir tanıtım eklemedin.'}
                        </p>
                        <button onClick={openEdit} className="shrink-0 px-3.5 py-2 rounded-full bg-white/5 border border-white/15 text-white text-[0.625rem] font-extrabold uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all flex items-center gap-1.5">
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

            {/* ═══ PROFİLİ DÜZENLE — TEK KAYNAK alt sayfa (admin aynası da aynısını kullanır) ═══ */}
            <ProfileEditSheet
                open={showEditModal}
                initial={{
                    position: profile?.position || '',
                    bio: profile?.bio || '',
                    birthdate: profile?.birthdate || '',
                    gender: profile?.gender || '',
                    playStyle: profile?.playStyle || '',
                    avatarUrl: profile?.avatar_url || '',
                }}
                saving={savingEdit}
                onSave={saveEdit}
                onClose={() => setShowEditModal(false)}
            />
        </div>
    );
};

export default ProfileScreen;
