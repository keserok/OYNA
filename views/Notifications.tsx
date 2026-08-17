import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, Bell, Clock, Star, CheckCircle, AlertTriangle, Calendar, ChevronRight, ArrowLeft, MapPin, MessageCircle, Users, Shield, DollarSign, MapPinned, Megaphone } from 'lucide-react';
import { Spinner } from '../components/ui/Spinner';
import { motion, AnimatePresence } from 'framer-motion';
import { UserRole, AppView } from '../types';
import { useAppStore } from '../store';
import { useBackDismiss } from '../hooks/useBackDismiss';
import {
  AppNotification,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
  findPendingMatchInvite,
} from '../services/notificationService';
import { handleDeepLink } from '../notifications/pushService';
import { getMatchDetails } from '../services/matchService';
import { declineMatchListInvite } from '../services/socialService';
import { showToast } from '../components/common/GlobalToast';
import { openAppSettings, canOpenAppSettings } from '../services/locationService';

interface NotificationsProps {
  onBack: () => void;
  role?: UserRole | null;
}

// ─── type_key → ikon/renk eşlemesi ───────────────────────────────────────────
// Şablon anahtarları DB tarafından üretilir; hem snake_case (match_joined) hem
// SCREAMING_CASE (NEW_MESSAGE) varyantları desteklenir. Bulunamazsa prefix
// (match_, gk_, ref_, service_) ile eşlenir, en son genel Bell'e düşülür.
const ICON_MAP: Record<string, { icon: React.ElementType; color: string }> = {
  // Mesajlaşma
  new_message: { icon: MessageCircle, color: '#3b82f6' },
  // Maç
  match_joined: { icon: CheckCircle, color: '#22c55e' },
  match_invite: { icon: Calendar, color: '#39FF14' },
  match_cancelled: { icon: AlertTriangle, color: '#ef4444' },
  match_reminder_1h: { icon: Clock, color: '#f59e0b' },
  match_reminder_24h: { icon: Clock, color: '#f59e0b' },
  nearby_match: { icon: MapPinned, color: '#3b82f6' },
  // IP-06: ikisi de bugüne kadar match_ prefix'inden Calendar'a düşüyordu.
  match_completed_evaluate: { icon: Star, color: '#FACC15' },
  match_invite_declined: { icon: X, color: '#F87171' },
  // Kadro / hizmet
  team_invite: { icon: Users, color: '#8b5cf6' },
  gk_accepted: { icon: Shield, color: '#22c55e' },
  gk_rejected: { icon: Shield, color: '#ef4444' },
  ref_accepted: { icon: Shield, color: '#22c55e' },
  ref_rejected: { icon: Shield, color: '#ef4444' },
  service_offer: { icon: DollarSign, color: '#22c55e' },
  service_accepted: { icon: CheckCircle, color: '#22c55e' },
  service_rejected: { icon: AlertTriangle, color: '#ef4444' },
  // Rezervasyon
  booking_confirmed: { icon: CheckCircle, color: '#22c55e' },
  booking_rejected: { icon: AlertTriangle, color: '#ef4444' },
  // Destek (admin yanıtı → kullanıcı Ayarlar → Yardım Merkezi'nden okur)
  support_reply: { icon: MessageCircle, color: '#22d3ee' },
  // Hesap
  account_deletion_cancelled: { icon: CheckCircle, color: '#22c55e' },
  withdrawal_approved: { icon: DollarSign, color: '#22c55e' },
  withdrawal_rejected: { icon: AlertTriangle, color: '#ef4444' },
  // Genel
  weekly_summary: { icon: Star, color: '#f59e0b' },
  promo_offers: { icon: Megaphone, color: '#f59e0b' },
  system: { icon: Bell, color: '#f59e0b' },
};

// Prefix tabanlı yedek eşleme (tek tek tanımlanmamış anahtarlar için).
const PREFIX_MAP: { prefix: string; icon: React.ElementType; color: string }[] = [
  { prefix: 'message', icon: MessageCircle, color: '#3b82f6' },
  { prefix: 'match', icon: Calendar, color: '#39FF14' },
  { prefix: 'team', icon: Users, color: '#8b5cf6' },
  { prefix: 'gk', icon: Shield, color: '#22c55e' },
  { prefix: 'ref', icon: Shield, color: '#22c55e' },
  { prefix: 'service', icon: DollarSign, color: '#22c55e' },
  { prefix: 'booking', icon: CheckCircle, color: '#22c55e' },
  { prefix: 'promo', icon: Megaphone, color: '#f59e0b' },
  { prefix: 'system', icon: Bell, color: '#f59e0b' },
];

const resolveVisual = (typeKey: string | null): { icon: React.ElementType; color: string } => {
  if (!typeKey) return { icon: Bell, color: '#f59e0b' };
  const key = typeKey.toLowerCase();
  if (ICON_MAP[key]) return ICON_MAP[key];
  const match = PREFIX_MAP.find((p) => key.startsWith(p.prefix));
  if (match) return { icon: match.icon, color: match.color };
  return { icon: Bell, color: '#f59e0b' };
};

// ─── type_key → kategori (filtre çipleri için, Soru 11) ──────────────────────
type NotifCategory = 'MATCH' | 'SQUAD' | 'PAYMENT' | 'SYSTEM';
const categoryOf = (typeKey: string | null): NotifCategory => {
  const k = (typeKey || '').toLowerCase();
  if (k.startsWith('match') || k.startsWith('nearby')) return 'MATCH';
  if (k.startsWith('team') || k.startsWith('gk') || k.startsWith('ref') || k.startsWith('service')) return 'SQUAD';
  if (k.startsWith('booking') || k.startsWith('payment') || k.startsWith('payout') || k.startsWith('wallet') || k.startsWith('debtor')) return 'PAYMENT';
  return 'SYSTEM';
};
const CATEGORY_CHIPS: { key: 'ALL' | NotifCategory; label: string }[] = [
  { key: 'ALL', label: 'Tümü' },
  { key: 'MATCH', label: 'Maç' },
  { key: 'SQUAD', label: 'Kadro' },
  { key: 'PAYMENT', label: 'Ödeme' },
  { key: 'SYSTEM', label: 'Sistem' },
];

// ─── created_at → "2 dk", "1 sa", "3 gün" göreli zaman ───────────────────────
const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'Az önce';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} sa`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} gün`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek} hf`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};
const item = {
  hidden: { opacity: 0, x: -24, scale: 0.96 },
  show: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 340, damping: 26 } },
  exit: { opacity: 0, x: 50, scale: 0.94, transition: { duration: 0.22 } },
};

const Notifications: React.FC<NotificationsProps> = ({ onBack, role }) => {
  // App.tsx yalnız isNotificationsOpen iken mount ediyor → open sabit true.
  // Geri tuşu yalnız bu sheet'i kapatır, arkadaki ekran DEĞİŞMEZ (BULGU-020).
  useBackDismiss(true, onBack, 'notifications');
  const isGK = role === UserRole.GOALKEEPER;
  const isRef = role === UserRole.REFEREE;

  const accentColor = isRef ? '#ef4444' : isGK ? '#22c55e' : '#f59e0b';

  const { navigateTo, setSelectedMatch, clearUnreadNotifications, incrementUnreadNotifications } = useAppStore();

  // IP-16 (kullanıcı kararı) — konum izni kapalıysa bildirim listesinin en
  // üstünde KALICI bir hatırlatma durur. Sunucudan bildirim GÖNDERİLMEZ:
  // tekrar tekrar gerçek bildirim yazmak spam olur ve geri alınamaz. Bu
  // hatırlatma yerel bir durumdur, izin verilir verilmez kendiliğinden kaybolur.
  const konumIzni = useAppStore(st => st.locationPermissionStatus);
  const aktifBolge = useAppStore(st => st.activeRegion);
  const konumKapali = konumIzni === 'DENIED';

  // ─── Gerçek DB bildirimleri ───────────────────────────────────────────────
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<AppNotification | null>(null);
  // Yönlendirme/davet cevabı sırasında çift dokunuş kilidi.
  const [routing, setRouting] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  const unread = notifs.filter((n) => !n.isRead).length;
  const [activeCat, setActiveCat] = useState<'ALL' | NotifCategory>('ALL');
  const visibleNotifs = activeCat === 'ALL' ? notifs : notifs.filter((n) => categoryOf(n.typeKey) === activeCat);

  // Yükleme
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotifications(50);
      setNotifs(data);
    } catch (e: any) {
      setError(e?.message || 'Bildirimler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — yeni bildirim gelince listeye ekle + global rozeti artır
  const incrementRef = useRef(incrementUnreadNotifications);
  incrementRef.current = incrementUnreadNotifications;
  useEffect(() => {
    const unsubscribe = subscribeToNotifications((n) => {
      setNotifs((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
      if (incrementRef.current) incrementRef.current();
    });
    return unsubscribe;
  }, []);

  // ─── Okundu işaretleme + yönlendirme ──────────────────────────────────────
  const routeTo = useCallback(
    async (n: AppNotification) => {
      if (routing) return;
      setRouting(true);
      try {
        const s = useAppStore.getState();
        if (n.deepLink) {
          const ok = await handleDeepLink(n.deepLink, (v) => navigateTo(v as AppView), {
            setSelectedMatch,
            setSelectedTeamId: s.setSelectedTeamId,
            setStudioContext: s.setStudioContext,
            setSocialTarget: s.setSocialTarget,
            setSelectedConversationId: s.setSelectedConversationId,
            setSelectedTeamChatId: s.setSelectedTeamChatId,
            setTeamInitialTab: s.setTeamInitialTab,
            setSettingsSubPage: s.setSettingsSubPage,
            showToast,
          });
          if (ok) { onBack(); return; } // BULGU-016: başarısızsa sheet AÇIK kalır
          // A1 (4 Ağustos 2026): bağlantı işlenemediyse BURADA DURMA.
          // Eskiden koşulsuz `return` vardı; bozuk adresli 36 maç hatırlatması
          // yüzünden maç numarası elde olmasına rağmen hiçbir şey açılmıyordu.
          if (!n.matchId) return;
        }
        if (n.matchId) {
          // BULGU-016: önce maçı yükle, SONRA görünümü değiştir. Aksi hâlde
          // MATCH_JOIN match=null ile açılır ve çıkışsız boş ekran kalır.
          const match = await getMatchDetails(n.matchId);
          if (!match) {
            showToast('Bu maç artık mevcut değil.', 'error');
            return;
          }
          s.setLobbyMode('DISCOVER');
          setSelectedMatch(match);
          navigateTo('MATCH_JOIN' as AppView);
          onBack();
        }
      } finally {
        setRouting(false);
      }
    },
    [navigateTo, setSelectedMatch, onBack, routing],
  );

  const handleCardClick = useCallback(
    (n: AppNotification) => {
      // action_required olan davetler için modal aç (yönlendirme yok)
      if (n.actionRequired && (n.typeKey === 'match_invite' || n.typeKey === 'team_invite')) {
        if (!n.isRead) {
          setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
          void markNotificationRead(n.id);
        }
        setSelectedInvite(n);
        return;
      }
      // Okundu işaretle (optimistik)
      if (!n.isRead) {
        setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        void markNotificationRead(n.id);
      }
      void routeTo(n);
    },
    [routeTo],
  );

  // BULGU-070: "Gelemem" sunucuya gerçekten yazılır — davet edene de haber gider.
  const handleDeclineInvite = useCallback(async () => {
    const n = selectedInvite;
    if (!n || inviteBusy) return;
    setInviteBusy(true);
    try {
      let inviteId = n.inviteId;
      // payload.invite_id taşımayan ESKİ davet satırları için yedek arama.
      if (!inviteId && n.matchId) inviteId = await findPendingMatchInvite(n.matchId);
      if (!inviteId) {
        showToast('Bu davet artık geçerli değil.', 'error');
        setSelectedInvite(null);
        return;
      }
      await declineMatchListInvite(inviteId);
      setNotifs((prev) => prev.filter((x) => x.id !== n.id));
      setSelectedInvite(null);
      showToast('Kaptana ilettik: gelemiyorsun.', 'success');
    } catch {
      showToast('Cevabın gönderilemedi. Bağlantını kontrol edip tekrar dene.', 'error');
    } finally {
      setInviteBusy(false);
    }
  }, [selectedInvite, inviteBusy]);

  const handleMarkAll = useCallback(() => {
    setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    void markAllNotificationsRead();
    if (clearUnreadNotifications) clearUnreadNotifications();
  }, [clearUnreadNotifications]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onBack}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full h-[85vh] bg-[#0A0E14] rounded-t-3xl overflow-hidden flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)] border-t border-white/10"
      >
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/20 rounded-full z-30 pointer-events-none" />

        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            className="absolute rounded-full blur-[120px]"
            style={{ width: 320, height: 320, top: '-10%', right: '-10%', background: accentColor, opacity: 0.08 }}
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        {/* Header — güvenli alan + 2rem. ÇEVRİMDIŞI ŞERİT TELAFİSİ BİLEREK YOK:
            bu ekran tam ekran bir sayfa değil, `h-[85vh]` ile ekranın ALTINA
            yapışan bir çekmece (yukarıdaki `justify-end`). Kırmızı şerit y=0..83
            arasında duruyor, çekmece ise y=127'de başlıyor — şerit bu başlığa
            hiç değmiyor. Telafi eklendiğinde 83px ölü bant açılıyor ve bildirim
            listesi o kadar kısalıyordu (gerçek tarayıcıda ölçüldü). Bu yüzden
            telafili sınıf (`pt-safe-8`) DEĞİL, satır içi hesap kullanılıyor. */}
        <div
          className="sticky top-0 z-20 px-5 pt-[calc(var(--safe-top)+2rem)] pb-4 flex items-center gap-3 border-b border-white/5"
          style={{ background: 'rgba(10,14,20,0.95)', backdropFilter: 'blur(24px)' }}
        >
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            className="w-10 h-10 rounded-full flex items-center justify-center border border-white/10 text-white"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <ArrowLeft size={18} />
          </motion.button>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-white tracking-tight">Bildirimler</h1>
              {unread > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-5 h-5 rounded-full text-[0.6875rem] font-extrabold text-black flex items-center justify-center"
                  style={{ background: accentColor }}
                >
                  {unread}
                </motion.span>
              )}
            </div>
          </div>

          {unread > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleMarkAll}
              className="px-3 py-2 rounded-xl text-[0.6875rem] font-extrabold border border-white/10 text-gray-400"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              Tümünü Oku
            </motion.button>
          )}
        </div>

        {/* Kategori filtre çipleri (Soru 11) */}
        {!loading && !error && notifs.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
            {CATEGORY_CHIPS.map((c) => {
              const active = activeCat === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setActiveCat(c.key)}
                  className="px-3.5 py-1.5 rounded-full text-[0.6875rem] font-extrabold whitespace-nowrap transition-all border"
                  style={{
                    background: active ? accentColor : 'rgba(255,255,255,0.04)',
                    color: active ? '#000' : 'rgba(255,255,255,0.6)',
                    borderColor: active ? accentColor : 'rgba(255,255,255,0.08)',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Notification list */}
        <div className="flex-1 px-4 py-4 pb-28 overflow-y-auto">
          {konumKapali && (
            <div
              role="status"
              className="mb-3 rounded-2xl border border-warning-line bg-warning-bg px-4 py-3.5 flex items-start gap-3"
            >
              <MapPin size={16} className="text-warning shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-extrabold text-warning">Konum izni kapalı</p>
                <p className="text-[0.6875rem] text-gray-300 leading-relaxed mt-1">
                  Yakınındaki maçları ve sahaları görebilmek için konum iznini açman gerekiyor.
                  {aktifBolge?.label ? ` Şimdilik kayıtlı bölgen kullanılıyor: ${aktifBolge.label}.` : ''}
                </p>
                {canOpenAppSettings() ? (
                  <button
                    onClick={() => { void openAppSettings(); }}
                    className="mt-2.5 min-h-11 px-4 rounded-xl bg-warning text-[#0A0E14] text-[0.75rem] font-extrabold active:scale-95 transition-transform"
                  >
                    Ayarları Aç
                  </button>
                ) : (
                  // Web'de uygulama ayarları ekranı yok — tuş çizmek yerine yol tarif edilir.
                  <p className="text-[0.6875rem] text-gray-400 mt-1.5">
                    Tarayıcıda adres çubuğundaki kilit simgesinden izin verebilirsin.
                  </p>
                )}
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-28 text-center">
              <Spinner size={32} color={accentColor} className="mb-4" />
              <p className="text-sm text-ink-4">Bildirimler yükleniyor…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-28 text-center">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4"
                style={{ background: '#ef444415', border: '1px solid #ef444430' }}
              >
                <AlertTriangle size={32} style={{ color: '#ef4444' }} />
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1">Bir şeyler ters gitti</h3>
              <p className="text-sm text-ink-4 mb-5">{error}</p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={load}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold text-black"
                style={{ background: accentColor }}
              >
                Tekrar Dene
              </motion.button>
            </div>
          ) : notifs.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-28 text-center"
            >
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4"
                style={{ background: accentColor + '15', border: `1px solid ${accentColor}30` }}
              >
                <Bell size={32} style={{ color: accentColor }} />
              </div>
              <h3 className="text-lg font-extrabold text-white mb-1">Henüz bildirimin yok</h3>
              <p className="text-sm text-ink-4">Yeni bir şey olduğunda burada göreceksin.</p>
            </motion.div>
          ) : visibleNotifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Bell size={28} className="mb-3" style={{ color: accentColor, opacity: 0.5 }} />
              <p className="text-sm text-ink-4">Bu kategoride bildirim yok.</p>
            </div>
          ) : (
            <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
              <AnimatePresence mode="popLayout">
                {visibleNotifs.map((n) => {
                  const { icon: Icon, color } = resolveVisual(n.typeKey);
                  const isUnread = !n.isRead;
                  const isInvite = n.actionRequired && (n.typeKey === 'match_invite' || n.typeKey === 'team_invite');
                  return (
                    <motion.div
                      key={n.id}
                      variants={item}
                      exit="exit"
                      layout
                      onClick={() => handleCardClick(n)}
                      className="relative rounded-[22px] overflow-hidden cursor-pointer group"
                      style={{
                        background: isUnread
                          ? `linear-gradient(135deg, rgba(10,14,22,0.98) 0%, ${color}08 100%)`
                          : 'rgba(13,20,32,0.95)',
                        border: `1px solid ${isUnread ? color + '30' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      {/* Top accent line for unread */}
                      {isUnread && (
                        <div
                          className="absolute top-0 left-0 right-0 h-0.5"
                          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
                        />
                      )}

                      <div className="p-4 flex items-start gap-3">
                        {/* Icon */}
                        <motion.div
                          whileHover={{ scale: 1.1, rotate: 8 }}
                          className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
                          style={{ background: color + '18', border: `1px solid ${color}30` }}
                        >
                          <Icon size={20} style={{ color }} />
                        </motion.div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1 pr-6">
                            <h4 className="font-extrabold text-white text-sm leading-snug">{n.title}</h4>
                            <div className="flex items-center gap-2 shrink-0 mt-0.5">
                              {isUnread && (
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
                                />
                              )}
                              <span className="text-[0.6875rem] text-ink-4 font-medium">{relativeTime(n.createdAt)}</span>
                            </div>
                          </div>
                          {n.body && <p className="text-[0.6875rem] text-gray-400 leading-relaxed">{n.body}</p>}

                          {isInvite ? (
                            <div className="mt-3 flex items-center gap-1 text-[0.6875rem] font-extrabold uppercase text-[#39FF14] bg-[#39FF14]/10 w-max px-3 py-1.5 rounded-xl border border-[#39FF14]/20">
                              Daveti İncele <ChevronRight size={14} />
                            </div>
                          ) : (n.deepLink || n.matchId) ? (
                            <div className="mt-2 flex items-center gap-1 text-[0.6875rem] font-extrabold" style={{ color }}>
                              Görüntüle <ChevronRight size={12} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Invite Modal — match_invite / team_invite (action_required) */}
      <AnimatePresence>
        {selectedInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex flex-col"
          >
            {/* Alt bar tek satırdan iki satıra çıktı (Geliyorum + Gelemem/Sonra
                Bakarım) — kaydırma boşluğu buna göre büyütüldü. */}
            <div className="flex-1 overflow-y-auto flex flex-col relative pb-48">
              <div className="w-full h-64 relative shrink-0">
                {/* F3d: stok Unsplash hero kaldırıldı — davet gerçek maç görseli
                    taşımıyor; nötr gradient zemin kullanılır. */}
                <div className="w-full h-full bg-gradient-to-br from-[#123321] via-[#0f1b2d] to-[#0A0E14]" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#0A0E14]/60 to-[#0A0E14]" />
                {/* KAPAT düğmesi: bu katman `fixed inset-0`, yani ekranın tepesinden
                    başlar. `top-12` (48px) Dynamic Island'lı iPhone'da (güvenli alan
                    59px) durum çubuğunun ALTINDA kalıyordu — davet penceresi
                    kapatılamıyordu. `max(...)` iki cihazı birden doğru tutar: güvenli
                    alanı bildirmeyen cihazda eski 48px aynen korunur, bildiren cihazda
                    çentiğin altına iner. (Çevrimdışı şeridi telafisi gerekmez: bu
                    katman z-[110] ile şeridin (z-[100]) ÜSTÜNDE çizilir.) */}
                <button
                  onClick={() => setSelectedInvite(null)}
                  className="absolute top-[max(3rem,calc(var(--safe-top)+1rem))] right-5 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20"
                >
                  <X size={20} />
                </button>

                <div className="absolute bottom-6 left-6 right-6">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#39FF14]/20 border border-[#39FF14]/30 text-[#39FF14] text-[0.625rem] font-extrabold uppercase tracking-widest mb-3">
                    <CheckCircle size={12} /> Davet Edildin
                  </div>
                  <h2 className="text-2xl font-extrabold text-white italic tracking-tighter uppercase drop-shadow-lg">
                    {selectedInvite.title}
                  </h2>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-xs text-white/70 font-medium">
                      <Calendar size={14} className="text-[#39FF14]" /> {relativeTime(selectedInvite.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-6 py-6 flex-1 flex flex-col gap-6">
                {selectedInvite.body && (
                  <div className="bg-[#161B22] border border-white/5 rounded-3xl p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-[#39FF14]/10 flex items-center justify-center text-[#39FF14] shrink-0">
                      <MapPin size={24} />
                    </div>
                    <div>
                      <p className="text-sm text-white/80 leading-relaxed">{selectedInvite.body}</p>
                    </div>
                  </div>
                )}

                <p className="text-[0.8125rem] text-[#8B949E] text-center px-4 leading-relaxed mt-auto">
                  Geliyorum dersen maç lobisine gidersin. Yerin, ödemeni tamamlayınca kesinleşir.
                </p>
              </div>

              <div className="fixed bottom-0 left-0 right-0 px-6 pt-6 pb-safe bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/95 to-transparent z-20">
                {/* BULGU-070: üç gerçek aksiyon — "Gelemem" sunucuya yazılır. */}
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => { const inv = selectedInvite; setSelectedInvite(null); void routeTo(inv); }}
                    disabled={inviteBusy}
                    className="w-full h-14 rounded-2xl bg-[#39FF14] text-[#0A0E14] text-[0.9375rem] font-bold uppercase flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    <CheckCircle size={20} /> Geliyorum
                  </button>
                  <div className="flex gap-2.5">
                    <button
                      onClick={handleDeclineInvite}
                      disabled={inviteBusy}
                      className="flex-1 h-14 rounded-2xl bg-[#F87171]/10 border border-[#F87171]/40 text-[#F87171] text-[0.9375rem] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                    >
                      {inviteBusy ? <Spinner size={18} color="#F87171" /> : <><X size={18} /> Gelemem</>}
                    </button>
                    <button
                      onClick={() => setSelectedInvite(null)}
                      disabled={inviteBusy}
                      className="flex-1 h-14 rounded-2xl bg-white/5 border border-white/10 text-[#A9B4C0] text-[0.9375rem] font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
                    >
                      Sonra Bakarım
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Notifications;
