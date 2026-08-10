// ════════════════════════════════════════════════════════════════════════════
// PROFİL
// ════════════════════════════════════════════════════════════════════════════
//
// Kaynak: onaylı profil tasarımı (OYNA Profil UI) — "Profil · dolu" ve
// "Profil · yeni kullanıcı" ekranları, 390×844.
//
// ── DÜZENLEME BU EKRANDA DEĞİL ─────────────────────────────────────────────
// Kullanıcı kararı (2026-08): profili düzenleme AYARLARA taşındı
// (Ayarlar → Bilgilerim). Bu ekran artık salt GÖSTERİR; tek çıkışı sağ üstteki
// dişli. Eskiden burada hem "Düzenle" düğmesi hem de tam bir düzenleme
// katmanı vardı; aynı bilgiler Ayarlar'daki "Profil Bilgileri" sayfasında da
// düzenlenebiliyordu — iki kapı, iki farklı alan kümesi, tek bir gerçek.
//
// ── ÜST BARDA YALNIZ DİŞLİ VAR ─────────────────────────────────────────────
// Tasarımda ekran adı yazmıyor: alt menüde "Profil" sekmesi zaten yanıyor,
// başlık aynı şeyi ikinci kez söylüyordu. Sekme kökünde geri oku da YOK.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import { UserRole, AppView } from '../types';
import { Settings, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store';
import { useAsagiCekYenile } from '../hooks/useAsagiCekYenile';
import { YenileniyorSeridi } from '../components/common/YenileniyorSeridi';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { getFullUserProfile, getMatchHistory, saveProfileEdit, MatchHistorySummary, OynaUser } from '../services/userService';
import { fetchFriends } from '../services/friendService';
import { getMyTeams } from '../services/teamSocialService';
import { LoadingState, ErrorState } from '../components/common/StatusState';
import { TrustScoreCard, ProfileShortcuts, MatchHistorySection, ProfileIdentityCard } from '../components/profile';
import { ProfileEditSheet, type ProfileEditValues } from '../components/profile/ProfileEditSheet';
import type { ShortcutItem } from '../components/profile';
// Türetme mantığı TEK KAYNAK: admin panelin Kullanıcı Profili Aynası da aynı
// modülü kullanır — kart/rozet/puan hesapları iki yüzeyde asla ayrışmaz.
import { ageFromBirthdate, trustScoreTo100 } from '../shared/profilePresentation';
import { formatTRYAmount } from '../utils/formatTRY';
import profileAmbient from '../assets/profile/profile-ambient.png';

interface ProfileScreenProps {
    role: UserRole;
    onNavigate?: (view: AppView) => void;
    onOpenDiaryEntry: (id: string) => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ role, onNavigate, onOpenDiaryEntry }) => {
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

    // ── PROFİLİ DÜZENLE ────────────────────────────────────────────────────
    // Kullanıcı kararı: "Profil ekranında üstteki profil bilgilerinin olduğu
    // kutuya basınca profili düzenleme ekranı gelsin." Katman AYNI bileşendir
    // (Ayarlar → Bilgilerim ve yönetim panelindeki ayna da onu kullanır);
    // kaydetme yolu da tek kaynaktan geçer (`saveProfileEdit`). Böylece iki
    // kapı açılsa da düzenlenen alanlar ve kayıt kuralları tek yerde kalır.
    const [editOpen, setEditOpen] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

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

    // AŞAĞI ÇEKİP YENİLE — profil, maç geçmişi ve sayaçlar tazelenir.
    // Misafirde de açık: `loadProfile` misafir için hemen döner, ama kullanıcı
    // parmağını çektiğinde bir karşılık görmeli — sessizlik "bozuk" hissettirir.
    const cekerekYenileniyor = useAsagiCekYenile(loadProfile);

    useEffect(() => {
        loadProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uid]);

    // Güven puanı: DB'de 0–5, ekranda 0–100.
    const trustScore = trustScoreTo100(profile?.trustScore);

    // Tasarım: ikon yok, değerler çıplak sayı — etiket zaten ne olduğunu söylüyor.
    // `dim`: tasarımın yeni kullanıcı ekranında üç değer de SOLUK çiziliyor —
    // sıfır bir başarı değil, henüz doldurulmamış bir yer.
    const shortcuts: ShortcutItem[] = [
        {
            label: 'Cüzdan',
            value: formatTRYAmount(profile?.walletBalance ?? 0),
            dim: !profile?.walletBalance,
            onClick: () => onNavigate && onNavigate('WALLET'),
        },
        {
            label: 'Takımlarım',
            value: `${teamsCount}`,
            dim: teamsCount === 0,
            // MY_TEAM artık belirli takım detayı (TeamDetailView, selectedTeamId gerekir);
            // Sosyal'in Takımlarım sekmesine yönlendir (main A4 kararı).
            onClick: () => { setSocialTarget({ tab: 'TEAMS', subTab: 'MINE' }); onNavigate && onNavigate('SOCIAL'); },
        },
        {
            label: 'Arkadaşlarım',
            value: `${friendsCount}`,
            dim: friendsCount === 0,
            onClick: () => { setSocialTarget({ tab: 'FRIENDS' }); onNavigate && onNavigate('SOCIAL'); },
        },
    ];

    /** Katmanın kayıt sözleşmesi: hata FIRLATILIR ki katman açık kalsın. */
    const saveEdit = async (v: ProfileEditValues) => {
        if (!uid) {
            setEditError('Oturumun kapanmış görünüyor. Tekrar giriş yapıp dene.');
            throw new Error('ProfileScreen.saveEdit: oturum yok');
        }
        setSavingEdit(true);
        setEditError(null);
        try {
            const { avatarChanged } = await saveProfileEdit(uid, v, {
                avatarUrl: profile?.avatar_url,
                selfSkill: profile?.selfSkill,
            });
            if (avatarChanged) {
                // Ana sayfadaki avatar store'daki oturum kimliğinden beslenir —
                // fotoğraf değişimi oraya da ANINDA yansımalı.
                const cur = useAppStore.getState().currentUserProfile;
                if (cur && cur.id === uid) useAppStore.getState().setCurrentUserProfile({ ...cur, avatar: v.avatarUrl });
            }
            await loadProfile();
        } catch (e) {
            console.error('Profil güncelleme hatası:', e);
            setEditError('Kaydedilemedi. Bağlantını kontrol edip tekrar dene.');
            throw e;
        } finally {
            setSavingEdit(false);
        }
    };

    const acEdit = () => { setEditError(null); setEditOpen(true); };

    return (
        // ZEMİN VE YAZI TİPİ — onaylı profil tasarımından birebir:
        // düz #0A0E14 + üstteki saha ışıması. Bu ekran bir dönem tırnaklı
        // (serif) yazıyla ve yeşile çalan zeminle çiziliyordu ("tasarım 3a");
        // teslim edilen yeni tasarım gövdeyi Inter, başlıkları Montserrat ve
        // zemini düz koyu yapıyor — uygulamanın geri kalanıyla aynı dil.
        <div className="fixed inset-0 bg-bg flex flex-col h-screen overflow-hidden selection:bg-primary selection:text-black">
            {/* Ambient ışıma — tasarımın üstteki saha çizimi + köşe parıltısı.
                Görsel `mix-blend-mode: screen` ile zemine karışır ve aşağı
                doğru maskeyle söner; içeriğin okunurluğunu bozmaz. */}
            <img
                src={profileAmbient}
                alt=""
                aria-hidden
                className="pointer-events-none absolute top-[-10px] left-1/2 -translate-x-1/2 w-[520px] max-w-none opacity-50 mix-blend-screen"
                style={{
                    WebkitMaskImage: 'linear-gradient(180deg,#000 0%,#000 40%,transparent 88%)',
                    maskImage: 'linear-gradient(180deg,#000 0%,#000 40%,transparent 88%)',
                }}
            />

            {/* ═══ ÜST BAR — yalnız ayarlar dişlisi ═══ */}
            <div className="px-6 pb-2.5 pt-safe flex justify-end items-center shrink-0 z-50">
                {/* IP-14: sekme kökünde geri oku YOK — alt menü zaten her yere
                    götürüyor, ok kullanıcıyı yığında geriye atıp şaşırtıyordu. */}
                <button
                    onClick={() => onNavigate && onNavigate('SETTINGS')}
                    aria-label="Ayarlar"
                    className="mt-4 w-11 h-11 flex items-center justify-center bg-surface-1/[0.75] rounded-full text-[#F5F3EE] border border-white/[0.08] hover:bg-white/10 active:scale-95 transition-all"
                >
                    <Settings size={17} />
                </button>
            </div>

            {/* ═══ KAYDIRILAN GÖVDE ═══
                DİKKAT: burada `flex flex-col gap-3` KULLANMA. Flex kolonda
                çocuklar varsayılan olarak SIKIŞIR (`flex-shrink: 1`) — içerik
                kaydırıcıdan uzun olduğunda kaydırma üretmek yerine kartları
                ezer. Tasarımın kendi HTML'inde her kart `flex:none` taşıdığı
                için orada sorun yoktu; burada kartlar ortak bileşenler ve
                böyle bir garantileri yok. Aralar `space-y-*` ile veriliyor:
                kaydırıcı düz blok kalır, `tests/visual/icKaydirma` yeşil.

                ARALIK 18px (kullanıcı kararı, 2026-08): "tüm butonların
                aralarındaki boşlukları arttır, ekran premium ve rahat olsun."
                12px'te kartlar tek bir blok gibi okunuyordu; 18px'te her kart
                kendi başına bir nesne. Yatay kenar 20px kalır — kart
                genişlikleri tasarımdaki gibi. */}
            <div className="relative z-10 flex-1 overflow-y-auto px-5 pt-2 pb-safe-nav custom-scrollbar space-y-[18px]">
                <YenileniyorSeridi aktif={cekerekYenileniyor} />
                {loading ? (
                    <LoadingState message="Profil yükleniyor…" />
                ) : error ? (
                    <ErrorState message={error} onRetry={loadProfile} />
                ) : (
                <>
                {/* ═══ MİSAFİR ŞERİDİ — oturumsuz kullanıcıya kaydolma çağrısı ═══ */}
                {isGuest && (
                    <div className="bg-warning/[0.06] border border-warning/30 rounded-3xl p-5 shadow-[0_8px_30px_rgba(0,0,0,0.4)] relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-warning/10 blur-[40px] rounded-full pointer-events-none" />
                        <div className="relative z-10 flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                                <p className="text-[0.75rem] font-bold uppercase tracking-widest text-warning">Misafir Modundasın</p>
                            </div>
                            <p className="text-[0.8125rem] text-[#F5F3EE]/[0.6] leading-relaxed">
                                Profilini oluşturmak, maçlara katılmak ve istatistiklerini biriktirmek için giriş yap.
                            </p>
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => onNavigate && onNavigate('AUTH')}
                                    className="flex-1 h-11 rounded-2xl bg-primary text-on-primary font-bold text-[0.75rem] uppercase tracking-widest active:scale-95 transition-all"
                                >
                                    Giriş Yap
                                </button>
                                <button
                                    onClick={() => onNavigate && onNavigate('AUTH')}
                                    className="flex-1 h-11 rounded-2xl bg-white/5 border border-white/15 text-[#F5F3EE] font-bold text-[0.75rem] uppercase tracking-widest active:scale-95 transition-all hover:bg-white/10"
                                >
                                    Kaydol
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══ PROFİL TAMAMLANMADI ═══
                    Tasarımda ekranın EN ÜSTÜNDE, kimlik kartından önce durur:
                    yeni kullanıcının ilk gördüğü şey "ne yapmalıyım" olmalı. */}
                {!isGuest && profile && profile.hasCompletedOnboarding === false && (
                    <button
                        onClick={() => onNavigate && onNavigate('ONBOARDING')}
                        className="w-full text-left bg-surface-1/[0.92] border border-white/[0.14] rounded-[24px] p-4 flex items-center gap-3.5 min-h-[48px] active:scale-[0.99] transition-all"
                    >
                        <div className="flex-1 min-w-0">
                            <p className="text-[0.9375rem] text-[#F5F3EE]">Profil tamamlanmadı</p>
                            <p className="mt-0.5 text-[0.8125rem] text-[#F5F3EE]/[0.6] leading-snug">
                                Birkaç bilgi eksik. Tamamla, sana uygun maçları önerelim.
                            </p>
                        </div>
                        <ChevronRight size={18} className="text-[#F5F3EE] shrink-0" />
                    </button>
                )}

                {/* ═══ KİMLİK KARTI ═══
                    Kutuya dokunmak "Profili Düzenle" katmanını açar (kullanıcı
                    kararı). Katman ve kayıt yolu Ayarlar → Bilgilerim ile
                    AYNI — iki kapı, tek gerçek. */}
                <ProfileIdentityCard
                    name={profile?.full_name || (isGuest ? 'Misafir' : 'Oyuncu')}
                    avatarUrl={profile?.avatar_url}
                    position={profile?.position}
                    age={ageFromBirthdate(profile?.birthdate)}
                    ageRange={profile?.ageRange}
                    gender={profile?.gender}
                    playStyle={profile?.playStyle}
                    selfSkill={profile?.selfSkill}
                    layout="row"
                    onPress={isGuest ? undefined : acEdit}
                    onEditAvatar={isGuest ? undefined : acEdit}
                    // Fotoğrafı olan kullanıcıda ek satır çizilmez: kart sade
                    // kalsın, değiştirme yolu zaten Ayarlar → Bilgilerim.
                    showAddPhotoRow={!isGuest && !profile?.avatar_url}
                />

                {/* ═══ GÜVEN PUANI ═══ */}
                {/* Onaylı tasarım iki ayrı açıklama veriyor ve ayrım PUANIN
                    KENDİSİNDEDİR: 100 ise "Herkes 100 ile başlar" (puan bir
                    yargı değil, başlangıç noktası), düşmüşse neye göre değiştiği.
                    Ayrımı maç sayısına bağlamak yanlıştı — puanı 92 olan bir
                    profilde "herkes 100 ile başlar" yazıyordu (görsel test
                    yakaladı). Puan tek doğru ölçüttür. */}
                {!isGuest && (
                  <TrustScoreCard
                    score={trustScore}
                    note={trustScore >= 100 ? 'Herkes 100 ile başlar. Maç oynadıkça değişir.' : undefined}
                  />
                )}

                {/* ═══ KISAYOLLAR ═══ */}
                <ProfileShortcuts items={shortcuts} />

                {/* ═══ SOSYAL ═══
                    IP-14: Sosyal alt menüden çıkıp buraya taşındı (kullanıcı kararı).
                    Yukarıdaki kısayollar Sosyal'in İKİ SEKMESİNE derin bağ veriyor;
                    bu satır ekranın kendisini açar — Mesajlar'ın tek kapısı burası,
                    onsuz mesajlaşma erişilemez kalırdı. */}
                {!isGuest && (
                    <button
                        onClick={() => onNavigate && onNavigate('SOCIAL')}
                        className="w-full flex items-center gap-3 py-[18px] px-[18px] rounded-[20px] bg-surface-1 min-h-[48px] hover:bg-white/[0.06] active:scale-[0.99] transition-all text-left"
                    >
                        <div className="min-w-0 flex-1">
                            <span className="text-[0.9375rem] text-[#F5F3EE] block">Sosyal</span>
                            <span className="text-[0.8125rem] text-[#F5F3EE]/[0.55]">
                                {friendsCount === 0 && teamsCount === 0
                                    ? 'Arkadaş ekle, takıma katıl'
                                    : 'Arkadaşlar, takımlar ve mesajlar'}
                            </span>
                        </div>
                        <ChevronRight size={18} className="text-[#F5F3EE]/[0.5] shrink-0" />
                    </button>
                )}

                {/* Rol yönetimi (rol değiştir + ek rol başvurusu) Ayarlar → Sahada Rolün'e taşındı. */}

                {/* ═══ MAÇ GEÇMİŞİ ═══ */}
                <MatchHistorySection
                    matches={matchHistory}
                    onOpen={onOpenDiaryEntry}
                    onFindMatch={() => onNavigate && onNavigate('MATCH_DISCOVERY')}
                />
                {/* Maç/galibiyet/en iyi ÜÇLÜSÜ bu ekranda yok — tasarım kararı:
                    istatistikler Ayarlar → Bilgilerim sayfasına taşındı. */}
                </>
                )}
            </div>

            {/* ═══ PROFİLİ DÜZENLE KATMANI ═══
                Kimlik kutusundan açılır. Portal ile <body>'ye çizilir, yani bu
                ekranın kaydırıcısının içinde değildir — alt menünün de üstünde
                tam ekran durur. */}
            {!isGuest && (
                <ProfileEditSheet
                    open={editOpen}
                    name={profile?.full_name || 'Oyuncu'}
                    initial={{
                        position: profile?.position || '',
                        bio: profile?.bio || '',
                        birthdate: profile?.birthdate || '',
                        gender: profile?.gender || '',
                        playStyle: profile?.playStyle || '',
                        avatarUrl: profile?.avatar_url || '',
                        selfSkill: profile?.selfSkill ?? null,
                    }}
                    saving={savingEdit}
                    errorText={editError}
                    onSave={saveEdit}
                    onClose={() => setEditOpen(false)}
                />
            )}
        </div>
    );
};

export default ProfileScreen;
