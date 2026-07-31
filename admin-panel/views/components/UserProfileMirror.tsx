/**
 * KULLANICI PROFİLİ AYNASI — kullanıcının uygulamada gördüğü profil ekranının
 * admin paneldeki CANLI ve DÜZENLENEBİLİR birebir kopyası.
 *
 * Aynılık garantisi: görsel bileşenler (ProfileHero, TrustScoreCard,
 * ProfileShortcuts, MatchHistorySection, ProfileEditSheet) ve türetme mantığı
 * (shared/profilePresentation) ana uygulamayla AYNI modüllerden gelir; veri da
 * aynı okuyucudan (getFullUserProfile / getMatchHistory) çekilir — drift yok.
 *
 * Yazma yolu farklıdır: kullanıcı kendi satırını doğrudan günceller, admin ise
 * audit'li admin_update_user_profile RPC'siyle yazar (her kayıt USER_UPDATE
 * olarak denetim kaydına düşer). Bakiye düzeltmesi ledger'lı
 * admin_adjust_wallet_balance RPC'sinden geçer (FINANCE yetkisi ister).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Loader2, Pencil, RefreshCw, ShieldAlert, Sparkles, Star, Wallet, X,
} from 'lucide-react';
import { supabase } from '../../../supabaseClient';
import {
  getFullUserProfile, getMatchHistory,
  type MatchHistorySummary, type OynaUser,
} from '../../../services/userService';
import { fetchFriends } from '../../../services/friendService';
import { ProfileHero, TrustScoreCard, ProfileShortcuts, MatchHistorySection } from '../../../components/profile';
import type { ShortcutItem } from '../../../components/profile';
import { ProfileEditSheet, type ProfileEditValues } from '../../../components/profile/ProfileEditSheet';
import {
  ageFromBirthdate, formatPosition, trustScoreTo100, winStats,
} from '../../../shared/profilePresentation';
import {
  adjustWalletBalanceAdmin, fetchPlayerPeerScoresAdmin, updateUserAppProfileAdmin,
  toTurkishAdminError, type PlayerPeerScores,
} from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { skillBand } from '../../../utils/skillBand';

interface Props {
  userId: string;
  /** Kayıt sonrası liste tazeleme (UsersPage). */
  onUpdated?: () => void;
}

const fmtMoney = (n: number) => `${Number(n).toLocaleString('tr-TR')} ₺`;

/** Admin krom şeridi: uygulama UI'ından ayrışsın diye tek tip mor "yönet" düğmesi. */
const AdminChip: React.FC<{ label: string; onClick: () => void; icon?: React.ReactNode }> = ({ label, onClick, icon }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-300 text-[9px] font-extrabold uppercase tracking-wider hover:bg-purple-500/20 transition-colors shrink-0"
  >
    {icon ?? <Pencil size={10} />} {label}
  </button>
);

export const UserProfileMirror: React.FC<Props> = ({ userId, onUpdated }) => {
  const { success, error: toastError } = useAdminToast();

  const [profile, setProfile] = useState<OynaUser | null>(null);
  const [history, setHistory] = useState<MatchHistorySummary[]>([]);
  const [friendsCount, setFriendsCount] = useState<number | null>(null);
  const [teamsCount, setTeamsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Düzenleme yüzeyleri
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSaving, setSheetSaving] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [trustDraft, setTrustDraft] = useState(100);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletReason, setWalletReason] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);

  // Alınan akran puanları (salt-okunur; puanlayan kimliği RPC'de bile yok)
  const [peerOpen, setPeerOpen] = useState(false);
  const [peer, setPeer] = useState<PlayerPeerScores | null>(null);
  const [peerLoading, setPeerLoading] = useState(false);
  const [peerError, setPeerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Uygulamanın KENDİ okuyucuları — RLS admin'e tüm profilleri açar
      // (profiles_select_own_or_admin). Sayaçlar en-iyi-çaba: biri düşerse ayna açılır.
      const [profileData, historyData] = await Promise.all([
        getFullUserProfile(userId),
        getMatchHistory(userId).catch(() => [] as MatchHistorySummary[]),
      ]);
      if (!profileData) {
        setLoadError('Profil yüklenemedi. RLS/yetki veya bağlantı sorunu olabilir.');
        return;
      }
      setProfile(profileData);
      setHistory(historyData);
      setNameDraft(profileData.full_name || '');
      setTrustDraft(trustScoreTo100(profileData.trustScore));
      const [friendsRes, teamsRes] = await Promise.allSettled([
        fetchFriends(userId),
        supabase.from('team_members').select('team_id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      setFriendsCount(friendsRes.status === 'fulfilled' ? friendsRes.value.length : null);
      setTeamsCount(teamsRes.status === 'fulfilled' && !teamsRes.value.error ? (teamsRes.value.count ?? 0) : null);
    } catch (err) {
      setLoadError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const saveFields = async (fields: Parameters<typeof updateUserAppProfileAdmin>[1], okMsg: string) => {
    await updateUserAppProfileAdmin(userId, fields);
    success(okMsg);
    await load();
    onUpdated?.();
  };

  // ProfileEditSheet kaydı — uygulamadaki updateProfileBasics ile aynı alan seti,
  // ancak audit'li admin RPC üzerinden.
  const handleSheetSave = async (v: ProfileEditValues) => {
    setSheetSaving(true);
    try {
      await saveFields({
        position: v.position,
        bio: v.bio,
        birthdate: v.birthdate || '',
        gender: v.gender || '',
        // self_skill BILEREK gonderilmez: oyuncunun kendi beyani, admin
        // degistirmez (sheet'te salt-okunur gosterilir).
        play_style: v.playStyle || '',
        ...(v.avatarUrl && v.avatarUrl !== profile?.avatar_url ? { avatar_url: v.avatarUrl } : {}),
      }, 'Profil güncellendi (denetime yazıldı)');
      setSheetOpen(false);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setSheetSaving(false);
    }
  };

  const handleAdminSave = async () => {
    if (!profile) return;
    const name = nameDraft.trim();
    setAdminSaving(true);
    try {
      await saveFields({
        ...(name && name !== (profile.full_name || '') ? { full_name: name } : {}),
        ...(trustDraft !== trustScoreTo100(profile.trustScore) ? { trust_score: trustDraft / 20 } : {}),
      }, 'Yönetici alanları kaydedildi');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setAdminSaving(false);
    }
  };


  const loadPeer = useCallback(async () => {
    setPeerLoading(true);
    setPeerError(null);
    try {
      setPeer(await fetchPlayerPeerScoresAdmin(userId));
    } catch (err) {
      setPeerError(toTurkishAdminError(err));
    } finally {
      setPeerLoading(false);
    }
  }, [userId]);

  const togglePeer = () => {
    setPeerOpen((o) => {
      if (!o && !peer && !peerLoading) void loadPeer();
      return !o;
    });
  };

  const handleWallet = async () => {
    const amount = Number(walletAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount === 0) { toastError('Geçerli bir tutar girin (± ₺).'); return; }
    if (walletReason.trim().length < 3) { toastError('Sebep zorunlu (en az 3 karakter) — ledger açıklamasına yazılır.'); return; }
    setWalletBusy(true);
    try {
      await adjustWalletBalanceAdmin(userId, amount, walletReason.trim());
      success(`Bakiye ${amount > 0 ? '+' : ''}${fmtMoney(amount)} düzeltildi (ledger'a işlendi)`);
      setWalletOpen(false);
      setWalletAmount('');
      setWalletReason('');
      await load();
      onUpdated?.();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setWalletBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center gap-3 text-gray-500">
        <Loader2 size={20} className="animate-spin" />
        <p className="text-[11px]">Kullanıcının uygulama profili yükleniyor…</p>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="py-12 flex flex-col items-center gap-3 text-center px-6">
        <ShieldAlert size={20} className="text-amber-400" />
        <p className="text-[12px] text-gray-400 leading-relaxed">{loadError || 'Profil bulunamadı.'}</p>
        <button type="button" onClick={() => void load()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/15 text-[10px] font-extrabold uppercase text-gray-300 hover:text-white">
          <RefreshCw size={11} /> Yeniden Dene
        </button>
      </div>
    );
  }

  const { total, winRate } = winStats(history);
  const trustScore = trustScoreTo100(profile.trustScore);

  // Tasarım 3a: kısayollarda ikon yok, değer çıplak sayı — uygulamayla birebir.
  const shortcuts: ShortcutItem[] = [
    {
      label: 'Cüzdan',
      value: fmtMoney(profile.walletBalance ?? 0),
      onClick: () => setWalletOpen(true),
    },
    {
      label: 'Takımları',
      value: teamsCount === null ? '—' : `${teamsCount}`,
    },
    {
      label: 'Arkadaşları',
      value: friendsCount === null ? '—' : `${friendsCount}`,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Ayna şeridi — bu bir uygulama ekranı, admin krom değil */}
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          <span className="text-[#39FF14] font-extrabold">CANLI AYNA</span> — kullanıcı profilini uygulamada böyle görüyor.
          Kalem simgeleri admin düzenlemesidir; her kayıt denetime düşer.
        </p>
        <button type="button" onClick={() => void load()} aria-label="Aynayı yenile" className="w-7 h-7 rounded-lg bg-white/5 text-gray-500 hover:text-white flex items-center justify-center shrink-0">
          <RefreshCw size={12} />
        </button>
      </div>

      {/* ═══ UYGULAMA TUVALİ — ProfileScreen gövdesinin birebir kopyası ═══ */}
      <div className="relative mx-auto w-full max-w-[400px] rounded-[30px] border border-white/10 pf-canvas pf-serif px-4 py-5 overflow-hidden">
        <div className="pf-ambient" />
        <div className="relative z-10 space-y-3">
          {/* Profil tamamlanmadı sinyali (uygulamadaki şeridin bilgilendirme hâli) */}
          {profile.hasCompletedOnboarding === false && (
            <div className="bg-[#FACC15]/[0.07] border border-[#FACC15]/30 rounded-2xl px-3.5 py-2.5">
              <p className="text-[10px] font-extrabold text-[#FACC15] uppercase tracking-wider">Profil tamamlanmadı</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Kullanıcı onboarding'i bitirmemiş — rozetler eksik görünebilir.</p>
            </div>
          )}

          <ProfileHero
            name={profile.full_name || 'Oyuncu'}
            avatarUrl={profile.avatar_url}
            verified={profile.verification_status === 'approved'}
            position={formatPosition(profile.position)}
            age={ageFromBirthdate(profile.birthdate)}
            ageRange={profile.ageRange}
            gender={profile.gender}
            playStyle={profile.playStyle}
            matches={total}
            winRate={winRate}
            mvp={null}
            onEditAvatar={() => setSheetOpen(true)}
          />

          {/* Bio + Düzenle — uygulamayla birebir; buton admin adına kaydeder */}
          <div className="flex items-center gap-3 px-1">
            <p className={`flex-1 text-[12px] leading-relaxed ${profile.bio ? 'text-gray-400' : 'text-gray-600 italic'}`}>
              {profile.bio || 'Henüz bir tanıtım eklenmemiş.'}
            </p>
            <button type="button" onClick={() => setSheetOpen(true)} className="shrink-0 px-3.5 py-2 rounded-full bg-white/5 border border-white/15 text-white text-[10px] font-extrabold uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all flex items-center gap-1.5">
              <Pencil size={11} /> Düzenle
            </button>
          </div>

          {/* Güven puanı + admin ayarı */}
          <div>
            <div className="flex justify-end mb-1">
              <AdminChip label="Güven Puanını Ayarla" onClick={() => { setTrustDraft(trustScore); setAdminOpen(true); }} />
            </div>
            <TrustScoreCard score={trustScore} />
          </div>

          <ProfileShortcuts items={shortcuts} />

          <MatchHistorySection matches={history} />
        </div>
      </div>

      {/* ═══ YÖNETİCİ ALANLARI — uygulamada görünmeyen admin yüzeyi ═══ */}
      <div className="bg-[#161B22]/60 border border-purple-500/15 rounded-2xl p-4 space-y-3">
        <button type="button" onClick={() => setAdminOpen((o) => !o)} className="w-full flex items-center justify-between gap-2">
          <p className="text-[10px] font-extrabold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={12} /> Yönetici Alanları (kullanıcı görmez)
          </p>
          <span className="text-[10px] text-gray-500 font-extrabold">{adminOpen ? '▲' : '▼'}</span>
        </button>

        {adminOpen && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Ad Soyad (görünen isim)</label>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="mt-1 w-full h-10 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-purple-500/40 focus:outline-none"
                  placeholder="Ad Soyad"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Güven Puanı</label>
                  <span className={`text-xs font-extrabold font-mono ${trustDraft >= 80 ? 'text-green-400' : trustDraft >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{trustDraft}/100</span>
                </div>
                <input
                  type="range" min={0} max={100} step={1}
                  value={trustDraft}
                  onChange={(e) => setTrustDraft(Number(e.target.value))}
                  className="mt-2 w-full accent-[#39FF14]"
                />
                <p className="text-[9px] text-gray-600 mt-1">DB'de 0–5 saklanır (÷20). Master 3.4: güven 100'den başlar, yalnız düşer — artışı istisnai durumda kullanın.</p>
              </div>
            </div>

            <button
              type="button"
              disabled={adminSaving}
              onClick={() => void handleAdminSave()}
              className="w-full h-11 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-200 text-[11px] font-extrabold uppercase tracking-widest hover:bg-purple-500/25 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {adminSaving ? <Loader2 size={13} className="animate-spin" /> : null} Yönetici Alanlarını Kaydet
            </button>
          </motion.div>
        )}
      </div>

      {/* ═══ ALINAN AKRAN PUANLARI — puan sistemi söküldü; skorlar yalnız burada,
           salt-okunur görünür. Puanlayan kimliği RPC çıktısında bile YOK (anonim). ═══ */}
      <div className="bg-[#161B22]/60 border border-purple-500/15 rounded-2xl p-4 space-y-3">
        <button type="button" onClick={togglePeer} className="w-full flex items-center justify-between gap-2">
          <p className="text-[10px] font-extrabold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
            <Star size={12} /> Alınan Akran Puanları (kullanıcı görmez)
          </p>
          <span className="text-[10px] text-gray-500 font-extrabold">{peerOpen ? '▲' : '▼'}</span>
        </button>

        {peerOpen && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            {peerLoading ? (
              <div className="py-6 flex flex-col items-center gap-2 text-gray-500">
                <Loader2 size={16} className="animate-spin" />
                <p className="text-[10px]">Akran puanları yükleniyor…</p>
              </div>
            ) : peerError ? (
              <div className="py-4 flex flex-col items-center gap-2 text-center">
                <p className="text-[11px] text-gray-400">{peerError}</p>
                <button type="button" onClick={() => void loadPeer()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 text-[10px] font-extrabold uppercase text-gray-300 hover:text-white">
                  <RefreshCw size={10} /> Yeniden Dene
                </button>
              </div>
            ) : peer ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    ['Puan Sayısı', String(peer.count)],
                    // Hiç puan yoksa "—" — 0 ortalama uydurulmaz.
                    ['Ortalama', peer.average === null ? '—' : peer.average.toFixed(1)],
                    ['MVP', String(peer.motmCount)],
                    ['Öz Beyan', skillBand(peer.selfSkill)?.label ?? '—'],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="bg-black/30 border border-white/10 rounded-xl px-2 py-2 text-center">
                      <p className="text-sm font-extrabold text-white font-mono">{value}</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {peer.recent.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Son puanlar</p>
                    {peer.recent.map((r, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5">
                        <span className="text-[10px] text-gray-400 truncate min-w-0">
                          {r.matchTitle || 'Maç'}
                          {r.at ? <span className="text-gray-600"> · {new Date(r.at).toLocaleDateString('tr-TR')}</span> : null}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {r.fairPlay != null && (
                            <span className="text-[9px] font-bold text-gray-500">FP {r.fairPlay}</span>
                          )}
                          <span className="text-[11px] font-extrabold text-amber-300 font-mono">{r.score}/10</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[9px] text-gray-600 leading-relaxed">
                  Puanlayan kimliği gösterilmez — RPC anonim döndürür. Skorlar MVP seçiminde
                  kullanılır; oyuncu profiline puan/kart olarak yansımaz.
                </p>
              </>
            ) : null}
          </motion.div>
        )}
      </div>

      {/* ═══ TEK KAYNAK düzenleme alt sayfası — uygulamadakiyle aynı bileşen ═══ */}
      <ProfileEditSheet
        open={sheetOpen}
        title={`Profili Düzenle — ${profile.full_name || 'Oyuncu'}`}
        initial={{
          position: profile.position || '',
          bio: profile.bio || '',
          birthdate: profile.birthdate || '',
          gender: profile.gender || '',
          playStyle: profile.playStyle || '',
          avatarUrl: profile.avatar_url || '',
          selfSkill: (profile as { selfSkill?: number | null }).selfSkill ?? null,
        }}
        saving={sheetSaving}
        onSave={handleSheetSave}
        onClose={() => setSheetOpen(false)}
        selfSkillEditable={false}
      />

      {/* ═══ Ledger'lı bakiye düzeltme ═══ */}
      {walletOpen && (
        <div className="fixed inset-0 z-[260] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setWalletOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white uppercase flex items-center gap-2"><Wallet size={14} /> Bakiye Düzeltme</h3>
              <button type="button" onClick={() => setWalletOpen(false)} className="w-7 h-7 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center"><X size={14} /></button>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Mevcut bakiye: <span className="font-extrabold text-[#39FF14] font-mono">{fmtMoney(profile.walletBalance ?? 0)}</span>.
              Düzeltme <span className="text-white font-bold">wallet_transactions</span>'a ADMIN_ADJUST olarak işlenir — profil bakiyesi elle ezilmez, finans raporları bozulmaz. FINANCE yetkisi gerekir.
            </p>
            <div className="flex gap-1.5">
              {[100, 500, -100].map((v) => (
                <button key={v} type="button" onClick={() => setWalletAmount(String(v))} className="flex-1 py-1.5 rounded-lg border border-white/10 text-[10px] font-extrabold text-gray-300 hover:text-white">
                  {v > 0 ? `+${v}` : v} ₺
                </button>
              ))}
            </div>
            <input
              value={walletAmount}
              onChange={(e) => setWalletAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Tutar (örn. 250 veya -50)"
              className="w-full h-11 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white font-mono focus:border-[#39FF14]/40 focus:outline-none"
            />
            <textarea
              value={walletReason}
              onChange={(e) => setWalletReason(e.target.value)}
              rows={2}
              placeholder="Sebep (zorunlu — ledger açıklamasında görünür)…"
              className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:border-[#39FF14]/40 focus:outline-none resize-none"
            />
            <button
              type="button"
              disabled={walletBusy}
              onClick={() => void handleWallet()}
              className="w-full h-11 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[11px] font-extrabold uppercase tracking-widest hover:bg-[#39FF14]/25 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {walletBusy ? <Loader2 size={13} className="animate-spin" /> : null} Düzeltmeyi İşle
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
