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
  adjustWalletBalanceAdmin, banUserAdmin, fetchPlayerPeerScoresAdmin, updateUserAppProfileAdmin,
  toTurkishAdminError, type AppProfileAdminFields, type PlayerPeerScores,
} from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { skillBand, SELF_SKILL_MAX } from '../../../utils/skillBand';
import { UserRole } from '../../../types';
import {
  NOTIFICATION_CATEGORIES,
  fetchNotificationTemplates as fetchBildirimSablonlari,
} from '../../../notifications/notificationPreferences';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../../../notifications/pushService';

interface Props {
  userId: string;
  /** Kayıt sonrası liste tazeleme (UsersPage). */
  onUpdated?: () => void;
}

const fmtMoney = (n: number) => `${Number(n).toLocaleString('tr-TR')} ₺`;

// ═══ v4 · Aynada düzenlenebilir yönetici alanları ═══════════════════════════
// Kullanıcı kararı: "üç düzenleme yeri tek yerde birleşsin". Eskiden Kullanıcılar
// sayfasındaki DERİN DÜZENLEME penceresinde duran alanlar (telefon, rol, maç
// sayısı, doğrulanmış, yasak) buraya taşındı; yanlarına aynada hiç olmayanlar
// eklendi (seviye beyanı, yaş aralığı, pro, kurulum, gizlilik, bildirimler).
// Kapsam dışı (kullanıcı kararı): cüzdanı doğrudan yazma, admin yetkisi verme,
// doğrulama durumunu elle değiştirme.

interface BildirimTercihi { enabled: boolean; mandatory: boolean }
type BildirimHaritasi = Record<string, BildirimTercihi>;

interface YoneticiAlanlari {
  phone: string;
  role: string;
  is_verified: boolean;
  is_pro: boolean;
  is_banned: boolean;
  match_count: number;
  self_skill: number | null;
  age_range: string;
  has_completed_onboarding: boolean;
  is_searchable: boolean;
  discoverable_by_phone: boolean;
  show_online_status: boolean;
  bildirimler: BildirimHaritasi;
}

const YONETICI_KOLONLARI =
  'phone, role, is_verified, is_pro, is_banned, match_count, self_skill, age_range, ' +
  'has_completed_onboarding, is_searchable, discoverable_by_phone, show_online_status, notification_preferences';

/**
 * Kayıtlı tercihleri uygulamanın VARSAYILANLARIYLA birleştirir. İki sebep:
 * (1) hiç tercihi olmayan kullanıcıda panel boş kalmasın, (2) `mandatory`
 * bayrağının tek kaynağı DEFAULT_NOTIFICATION_PREFERENCES olsun — zorunlu bir
 * bildirim panelden yanlışlıkla kapatılamasın.
 * Eski satırlarda değer düz `true/false` olabilir; o biçim de okunur.
 */
const bildirimleriNormalize = (ham: unknown): BildirimHaritasi => {
  const harita: BildirimHaritasi = {};
  for (const [k, v] of Object.entries(DEFAULT_NOTIFICATION_PREFERENCES as unknown as BildirimHaritasi)) {
    harita[k] = { enabled: v.enabled, mandatory: v.mandatory };
  }
  if (ham && typeof ham === 'object') {
    for (const [k, v] of Object.entries(ham as Record<string, unknown>)) {
      const zorunlu = harita[k]?.mandatory ?? false;
      if (typeof v === 'boolean') harita[k] = { enabled: v, mandatory: zorunlu };
      else if (v && typeof v === 'object' && 'enabled' in (v as Record<string, unknown>)) {
        harita[k] = { enabled: !!(v as BildirimTercihi).enabled, mandatory: zorunlu };
      }
    }
  }
  return harita;
};

/** Kategorilere girmeyen anahtarlar sessizce kaybolmasın: "Diğer" grubu. */
const bildirimGruplari = (harita: BildirimHaritasi) => {
  const siniflanan = new Set(NOTIFICATION_CATEGORIES.flatMap((c) => c.preferences as string[]));
  const gruplar = NOTIFICATION_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    anahtarlar: (c.preferences as string[]).filter((k) => k in harita),
  }));
  const diger = Object.keys(harita).filter((k) => !siniflanan.has(k));
  if (diger.length) gruplar.push({ key: 'DIGER', label: 'Diğer Bildirimler', anahtarlar: diger });
  return gruplar.filter((g) => g.anahtarlar.length > 0);
};

/** Admin panelindeki küçük aç/kapa anahtarı. */
const Anahtar: React.FC<{
  label: string; desc?: string; value: boolean; onChange: () => void;
  disabled?: boolean; danger?: boolean;
}> = ({ label, desc, value, onChange, disabled, danger }) => (
  <button
    type="button"
    onClick={disabled ? undefined : onChange}
    disabled={disabled}
    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
      disabled ? 'bg-black/20 border-white/5 cursor-default' : 'bg-black/30 border-white/10 hover:border-white/20'
    }`}
  >
    <span className="min-w-0">
      <span className={`block text-[11px] font-bold ${disabled ? 'text-gray-500' : 'text-white'}`}>{label}</span>
      {desc && <span className="block text-[9px] text-gray-500 mt-0.5">{desc}</span>}
    </span>
    <span
      className={`shrink-0 w-9 h-5 rounded-full border transition-colors relative ${
        value
          ? danger ? 'bg-red-500/70 border-red-400/60' : 'bg-primary/70 border-primary/60'
          : 'bg-white/10 border-white/15'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white transition-all ${value ? 'left-[18px]' : 'left-[2px]'}`} />
    </span>
  </button>
);

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
  // v4: kayıtlı hâl (kıyas için) + üzerinde çalışılan taslak. Kaydederken yalnız
  // DEĞİŞEN alanlar gönderilir — RPC gönderilmeyen alana dokunmaz.
  const [yKayitli, setYKayitli] = useState<YoneticiAlanlari | null>(null);
  const [yTaslak, setYTaslak] = useState<YoneticiAlanlari | null>(null);
  // Bildirim adları uygulamanın kendi şablon tablosundan gelir (label_tr) —
  // admin panelinde `match_reminder_24h` gibi ham anahtar okutmamak için.
  // En-iyi-çaba: gelmezse ham anahtar gösterilir, panel yine çalışır.
  const [bildirimAdlari, setBildirimAdlari] = useState<Record<string, { ad: string; zorunlu: boolean }>>({});
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
      const [friendsRes, teamsRes, yoneticiRes, sablonRes] = await Promise.allSettled([
        fetchFriends(userId),
        supabase.from('team_members').select('team_id', { count: 'exact', head: true }).eq('user_id', userId),
        // v4: aynada düzenlenebilir alanlar. getFullUserProfile bunları
        // haritalamıyor (uygulama ekranı göstermiyor); admin için ayrıca okunur.
        // Kendi async sarmalayıcısında: bu okuma SENKRON bile patlasa (istemci
        // farkı, eksik zincir) hata reddedilmiş söze dönüşür ve ayna açılmaya
        // devam eder — sayaçlarla aynı "en-iyi-çaba" kuralı.
        (async () => supabase.from('profiles').select(YONETICI_KOLONLARI).eq('id', userId).single())(),
        (async () => fetchBildirimSablonlari())(),
      ]);
      if (sablonRes.status === 'fulfilled' && Array.isArray(sablonRes.value)) {
        const harita: Record<string, { ad: string; zorunlu: boolean }> = {};
        for (const s of sablonRes.value) {
          // Zorunluluk iki kaynağın BİRLEŞİMİ (uygulamadaki isMandatory ile aynı
          // kural): şablon zorunlu diyorsa ya da kullanıcı kapatamıyorsa kilitli.
          harita[s.type_key] = { ad: s.label_tr || s.type_key, zorunlu: !!s.is_mandatory || s.can_user_disable === false };
        }
        setBildirimAdlari(harita);
      }
      setFriendsCount(friendsRes.status === 'fulfilled' ? friendsRes.value.length : null);
      setTeamsCount(teamsRes.status === 'fulfilled' && !teamsRes.value.error ? (teamsRes.value.count ?? 0) : null);
      if (yoneticiRes.status === 'fulfilled' && yoneticiRes.value && !yoneticiRes.value.error && yoneticiRes.value.data) {
        const r = yoneticiRes.value.data as unknown as Record<string, unknown>;
        const alanlar: YoneticiAlanlari = {
          phone: (r.phone as string) || '',
          role: (r.role as string) || 'PLAYER',
          is_verified: !!r.is_verified,
          is_pro: !!r.is_pro,
          is_banned: !!r.is_banned,
          match_count: Number(r.match_count ?? 0),
          self_skill: r.self_skill == null ? null : Number(r.self_skill),
          age_range: (r.age_range as string) || '',
          has_completed_onboarding: !!r.has_completed_onboarding,
          is_searchable: r.is_searchable !== false,
          discoverable_by_phone: r.discoverable_by_phone !== false,
          show_online_status: r.show_online_status !== false,
          bildirimler: bildirimleriNormalize(r.notification_preferences),
        };
        setYKayitli(alanlar);
        setYTaslak(alanlar);
      } else {
        // Okunamadıysa panel açılmaz — boş/yanlış değerlerle kaydetme riski olmasın.
        setYKayitli(null);
        setYTaslak(null);
      }
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
      // Katmanı BURADA kapatma: kayıt sözleşmesi gereği "Kaydedildi" onayını
      // gösterip kendisi kapanır (onClose ile geri döner).
    } catch (err) {
      // Hata YUKARI FIRLATILIR: katman ancak böyle "kaydedilmedi" olduğunu
      // bilir, açık kalır ve admin toast'taki sebebi görüp yeniden dener.
      toastError(toTurkishAdminError(err));
      throw err;
    } finally {
      setSheetSaving(false);
    }
  };

  const handleAdminSave = async () => {
    if (!profile) return;
    const name = nameDraft.trim();
    setAdminSaving(true);
    try {
      const alanlar: AppProfileAdminFields = {
        ...(name && name !== (profile.full_name || '') ? { full_name: name } : {}),
        ...(trustDraft !== trustScoreTo100(profile.trustScore) ? { trust_score: trustDraft / 20 } : {}),
      };

      // v4: yalnız DEĞİŞEN alanlar payload'a girer — dokunulmayan alan sunucuda
      // da dokunulmadan kalır ve denetim kaydı gerçekten neyin değiştiğini gösterir.
      if (yTaslak && yKayitli) {
        const d = <K extends keyof YoneticiAlanlari>(k: K) => yTaslak[k] !== yKayitli[k];
        if (d('phone')) alanlar.phone = yTaslak.phone.trim();
        if (d('role')) alanlar.role = yTaslak.role;
        if (d('is_verified')) alanlar.is_verified = yTaslak.is_verified;
        if (d('is_pro')) alanlar.is_pro = yTaslak.is_pro;
        if (d('match_count')) alanlar.match_count = yTaslak.match_count;
        // Beyan geri alınamaz: null'a çekme gönderilmez (sunucu da reddediyor).
        if (d('self_skill') && yTaslak.self_skill != null) alanlar.self_skill = yTaslak.self_skill;
        if (d('age_range')) alanlar.age_range = yTaslak.age_range.trim();
        if (d('has_completed_onboarding')) alanlar.has_completed_onboarding = yTaslak.has_completed_onboarding;
        if (d('is_searchable')) alanlar.is_searchable = yTaslak.is_searchable;
        if (d('discoverable_by_phone')) alanlar.discoverable_by_phone = yTaslak.discoverable_by_phone;
        if (d('show_online_status')) alanlar.show_online_status = yTaslak.show_online_status;

        const degisenBildirimler: Record<string, BildirimTercihi> = {};
        for (const [k, v] of Object.entries(yTaslak.bildirimler)) {
          if (yKayitli.bildirimler[k]?.enabled !== v.enabled) degisenBildirimler[k] = v;
        }
        if (Object.keys(degisenBildirimler).length) alanlar.notification_preferences = degisenBildirimler;
      }

      // Yasak AYRI yoldan gider: banUserAdmin oturumu da düşürür ve aktif
      // rezervasyonları iptal eder — profil güncellemesiyle aynı şey değildir.
      const yasakDegisti = !!yTaslak && !!yKayitli && yTaslak.is_banned !== yKayitli.is_banned;
      if (yasakDegisti && yTaslak) await banUserAdmin(userId, yTaslak.is_banned, null);

      if (Object.keys(alanlar).length === 0 && !yasakDegisti) {
        success('Değişiklik yok');
        return;
      }
      if (Object.keys(alanlar).length > 0) {
        await saveFields(alanlar, 'Yönetici alanları kaydedildi (denetime yazıldı)');
      } else {
        success('Hesap yasağı güncellendi (denetime yazıldı)');
        await load();
        onUpdated?.();
      }
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setAdminSaving(false);
    }
  };

  /** Taslakta tek alan güncelle (panel çizilmeden önce çağrılmaz). */
  const yGuncelle = <K extends keyof YoneticiAlanlari>(k: K, v: YoneticiAlanlari[K]) =>
    setYTaslak((t) => (t ? { ...t, [k]: v } : t));

  /** Zorunluluk iki kaynağın BİRLEŞİMİ: istemci varsayılanı + DB şablonu. */
  const bildirimZorunlu = (anahtar: string) =>
    !!(yTaslak?.bildirimler[anahtar]?.mandatory || bildirimAdlari[anahtar]?.zorunlu);

  const bildirimAnahtarla = (anahtar: string) =>
    setYTaslak((t) => {
      if (!t) return t;
      const mevcut = t.bildirimler[anahtar];
      // Zorunlu bildirim kapatılamaz — kullanıcı da kapatamıyor, admin de kapatmaz.
      if (!mevcut || mevcut.mandatory || bildirimAdlari[anahtar]?.zorunlu) return t;
      return { ...t, bildirimler: { ...t.bildirimler, [anahtar]: { ...mevcut, enabled: !mevcut.enabled } } };
    });


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
          <span className="text-primary font-extrabold">CANLI AYNA</span> — kullanıcı profilini uygulamada böyle görüyor.
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
            <div className="bg-warning/[0.07] border border-warning/30 rounded-2xl px-3.5 py-2.5">
              <p className="text-[10px] font-extrabold text-warning uppercase tracking-wider">Profil tamamlanmadı</p>
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
      <div className="bg-surface-1/60 border border-purple-500/15 rounded-2xl p-4 space-y-3">
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
                  className="mt-2 w-full accent-primary"
                />
                <p className="text-[9px] text-gray-600 mt-1">DB'de 0–5 saklanır (÷20). Master 3.4: güven 100'den başlar, yalnız düşer — artışı istisnai durumda kullanın.</p>
              </div>
            </div>

            {yTaslak ? (
              <>
                {/* ── HESAP & İLETİŞİM (eski "Derin Düzenleme" penceresinden taşındı) ── */}
                <div className="space-y-2">
                  <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Hesap & İletişim</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">E-posta (salt okunur)</label>
                      <input
                        value={profile.email || ''}
                        readOnly disabled
                        className="mt-1 w-full h-10 bg-black/20 border border-white/10 rounded-xl px-3 text-sm text-gray-500 opacity-70"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Telefon</label>
                      <input
                        value={yTaslak.phone}
                        onChange={(e) => yGuncelle('phone', e.target.value)}
                        placeholder="+90 5..."
                        className="mt-1 w-full h-10 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-purple-500/40 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Sistem Rolü</label>
                      <select
                        value={yTaslak.role}
                        onChange={(e) => yGuncelle('role', e.target.value)}
                        className="mt-1 w-full h-10 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-purple-500/40 focus:outline-none"
                      >
                        {Object.values(UserRole).map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Maç Sayısı</label>
                      <input
                        type="number" min={0}
                        value={yTaslak.match_count}
                        onChange={(e) => yGuncelle('match_count', Math.max(0, Number(e.target.value)))}
                        className="mt-1 w-full h-10 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-purple-500/40 focus:outline-none"
                      />
                    </div>
                  </div>
                  <Anahtar
                    label="Doğrulanmış Hesap" desc="Profilde mavi tik görünür"
                    value={yTaslak.is_verified} onChange={() => yGuncelle('is_verified', !yTaslak.is_verified)}
                  />
                  <Anahtar
                    label="Pro Rozeti" desc="Ücretli üyelik işareti"
                    value={yTaslak.is_pro} onChange={() => yGuncelle('is_pro', !yTaslak.is_pro)}
                  />
                  <Anahtar
                    label="Hesabı Yasakla" danger
                    desc="Kullanıcı giriş yapamaz; ayrı bir yetki adımından geçer ve denetime yazılır"
                    value={yTaslak.is_banned} onChange={() => yGuncelle('is_banned', !yTaslak.is_banned)}
                  />
                </div>

                {/* ── UYGULAMA ALANLARI ── */}
                <div className="space-y-2">
                  <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Uygulama Alanları</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Seviye Beyanı</label>
                        {yTaslak.self_skill != null && (
                          <span className="text-[9px] font-extrabold" style={{ color: skillBand(yTaslak.self_skill)?.color }}>
                            {skillBand(yTaslak.self_skill)?.label}
                          </span>
                        )}
                      </div>
                      <select
                        value={yTaslak.self_skill ?? ''}
                        onChange={(e) => yGuncelle('self_skill', e.target.value === '' ? null : Number(e.target.value))}
                        className="mt-1 w-full h-10 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-purple-500/40 focus:outline-none"
                      >
                        <option value="">— beyan yok —</option>
                        {Array.from({ length: SELF_SKILL_MAX }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      {/* Oyuncunun kendi beyanı: düzeltilebilir ama SİLİNEMEZ
                          (sunucu NULL'u reddeder — "beyan geri alınamaz"). */}
                      <p className="text-[9px] text-gray-600 mt-1">Oyuncunun kendi beyanı. Düzeltilebilir, silinemez.</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Yaş Aralığı</label>
                      <input
                        value={yTaslak.age_range}
                        onChange={(e) => yGuncelle('age_range', e.target.value)}
                        placeholder="ör. 24-30"
                        className="mt-1 w-full h-10 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white focus:border-purple-500/40 focus:outline-none"
                      />
                      <p className="text-[9px] text-gray-600 mt-1">Doğum tarihi yoksa profilde bu görünür.</p>
                    </div>
                  </div>
                  <Anahtar
                    label="Kurulumu Tamamladı" desc="Kapalıyken uygulama kurulum ekranını tekrar gösterir"
                    value={yTaslak.has_completed_onboarding}
                    onChange={() => yGuncelle('has_completed_onboarding', !yTaslak.has_completed_onboarding)}
                  />
                </div>

                {/* ── GİZLİLİK (uygulamada: Sosyal → Gizlilik) ── */}
                <div className="space-y-2">
                  <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Gizlilik Tercihleri</p>
                  <p className="text-[9px] text-gray-600 -mt-1">
                    Bunlar kullanıcının kendi seçimleridir; buradan değiştirmek kullanıcının tercihini ezer.
                    Yalnız destek talebi üzerine kullanın — her değişiklik denetime yazılır.
                  </p>
                  <Anahtar
                    label="Aramada Görünsün" desc="Kapalıysa isimle aranarak bulunamaz"
                    value={yTaslak.is_searchable} onChange={() => yGuncelle('is_searchable', !yTaslak.is_searchable)}
                  />
                  <Anahtar
                    label="Telefonla Bulunabilsin" desc="Rehberdeki numarayla eşleşme"
                    value={yTaslak.discoverable_by_phone}
                    onChange={() => yGuncelle('discoverable_by_phone', !yTaslak.discoverable_by_phone)}
                  />
                  <Anahtar
                    label="Çevrimiçi Durumu Görünsün"
                    value={yTaslak.show_online_status}
                    onChange={() => yGuncelle('show_online_status', !yTaslak.show_online_status)}
                  />
                </div>

                {/* ── BİLDİRİM TERCİHLERİ ── */}
                <div className="space-y-2">
                  <p className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">Bildirim Tercihleri</p>
                  <p className="text-[9px] text-gray-600 -mt-1">
                    Zorunlu bildirimler (maça alınma, iptal, davet gibi) kapatılamaz — kilitli görünürler.
                  </p>
                  {bildirimGruplari(yTaslak.bildirimler).map((grup) => (
                    <div key={grup.key} className="space-y-1.5">
                      <p className="text-[9px] text-purple-300/70 font-bold uppercase tracking-wider mt-2">{grup.label}</p>
                      {grup.anahtarlar.map((anahtar) => {
                        const t = yTaslak.bildirimler[anahtar];
                        const zorunlu = bildirimZorunlu(anahtar);
                        return (
                          <Anahtar
                            key={anahtar}
                            label={bildirimAdlari[anahtar]?.ad || anahtar}
                            desc={zorunlu ? 'Zorunlu — kapatılamaz' : undefined}
                            value={t.enabled}
                            disabled={zorunlu}
                            onChange={() => bildirimAnahtarla(anahtar)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[10px] text-gray-500 bg-black/30 border border-white/10 rounded-xl p-3">
                Ek yönetici alanları okunamadı (yetki veya bağlantı). Ad ve güven puanı yine kaydedilebilir.
              </p>
            )}

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
      <div className="bg-surface-1/60 border border-purple-500/15 rounded-2xl p-4 space-y-3">
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
        name={profile.full_name || 'Oyuncu'}
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
          <div onClick={(e) => e.stopPropagation()} className="bg-surface-1 border border-white/10 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white uppercase flex items-center gap-2"><Wallet size={14} /> Bakiye Düzeltme</h3>
              <button type="button" onClick={() => setWalletOpen(false)} className="w-7 h-7 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center"><X size={14} /></button>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Mevcut bakiye: <span className="font-extrabold text-primary font-mono">{fmtMoney(profile.walletBalance ?? 0)}</span>.
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
              className="w-full h-11 bg-black/40 border border-white/15 rounded-xl px-3 text-sm text-white font-mono focus:border-primary/40 focus:outline-none"
            />
            <textarea
              value={walletReason}
              onChange={(e) => setWalletReason(e.target.value)}
              rows={2}
              placeholder="Sebep (zorunlu — ledger açıklamasında görünür)…"
              className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:border-primary/40 focus:outline-none resize-none"
            />
            <button
              type="button"
              disabled={walletBusy}
              onClick={() => void handleWallet()}
              className="w-full h-11 rounded-xl bg-primary/15 border border-primary/40 text-primary text-[11px] font-extrabold uppercase tracking-widest hover:bg-primary/25 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {walletBusy ? <Loader2 size={13} className="animate-spin" /> : null} Düzeltmeyi İşle
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
