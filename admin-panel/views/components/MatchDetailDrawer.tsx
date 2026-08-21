import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Scale, Users2, Trophy, CreditCard, Bell, ScrollText, MessageSquare, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../../store';
import {
  adminGetMatchAdmin,
  assignMatchRefereeAdmin,
  assignMatchGoalkeeperSideAdmin,
  emergencyCancelMatchAdmin,
  fetchMatchGoalkeepers,
  assignToSlotAdmin,
  swapSlotsAdmin,
  cancelMatchAdmin,
  kickFromSlotAdmin,
  moveSlotTeamAdmin,
  setMatchStatusAdmin,
  recomputeMatchStatusAdmin,
  overrideMatchScoreAdmin,
  notifyMatchRosterAdmin,
  fetchMatchIntentsAdmin,
  forceCaptureIntentAdmin,
  forceVoidIntentAdmin,
  forceRefundIntentAdmin,
  matchDepositActionAdmin,
  fetchMatchTimelineAdmin,
  fetchMatchServiceRequestsAdmin,
  updateMatchAdmin,
  toTurkishAdminError,
  type MatchIntentRow,
  type MatchTimelineRow,
  type ServiceRequestAdminRow,
} from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { ActionConfirmModal, type ActionConfirmOptions } from './ActionConfirmModal';
import { MatchLobbyPitch } from './MatchLobbyPitch';
import { MatchLobbyRoster } from './MatchLobbyRoster';
import { MatchLobbyHeader } from './MatchLobbyHeader';
import { supabase } from '../../../supabaseClient';
import { allowedSquadSizesForCourts, formatCapacityRangeForCourts } from '../../../shared/pitchShowcaseMapper';
import type { MatchListing } from '../../../types';

interface Props {
  match: MatchListing | null;
  onClose: () => void;
  onUpdated: () => void;
  onViewDisputes?: (matchId: string) => void;
}

const TABS = [
  { key: 'kadro', label: 'Kadro & Slot', icon: Users2 },
  { key: 'sonuc', label: 'Sonuç & Hakem', icon: Trophy },
  { key: 'odeme', label: 'Ödeme', icon: CreditCard },
  { key: 'bildirim', label: 'Bildirim', icon: Bell },
  { key: 'sohbet', label: 'Sohbet', icon: MessageSquare },
  { key: 'audit', label: 'Kayıt', icon: ScrollText },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const fmtMoney = (n: number | null | undefined) => `${Number(n ?? 0).toLocaleString('tr-TR')}₺`;

const intentBadge = (status: string): string => {
  const s = status.toUpperCase();
  if (s === 'CAPTURED' || s === 'PAID') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (s === 'BLOCKED' || s === 'PENDING') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (s === 'REFUNDED') return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  return 'bg-white/5 text-gray-400 border-white/10';
};

const sourceBadge = (source: string): string => {
  switch (source) {
    case 'ADMIN': return 'bg-red-500/15 text-red-300 border-red-500/30';
    case 'WALLET':
    case 'PAYMENT': return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'NOTIFY': return 'bg-pink-500/15 text-pink-300 border-pink-500/30';
    case 'SERVICE': return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    case 'DISPUTE': return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
    case 'SCORE': return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
    default: return 'bg-white/5 text-gray-300 border-white/15'; // EVENT (katılım/ayrılma/durum/skor)
  }
};

export const MatchDetailDrawer: React.FC<Props> = ({ match, onClose, onUpdated, onViewDisputes }) => {
  const { adminUsers, adminReferees, adminGoalkeepers, updateMatch } = useAppStore();
  const { success, error: toastError } = useAdminToast();
  const [local, setLocal] = useState<MatchListing | null>(match);
  const [tab, setTab] = useState<TabKey>('kadro');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRefund, setCancelRefund] = useState(true);
  const [busy, setBusy] = useState(false);

  const [intents, setIntents] = useState<MatchIntentRow[]>([]);
  const [intentsLoading, setIntentsLoading] = useState(false);
  const [timeline, setTimeline] = useState<MatchTimelineRow[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [serviceReqs, setServiceReqs] = useState<ServiceRequestAdminRow[]>([]);
  const [serviceReqsLoading, setServiceReqsLoading] = useState(false);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  // İki taraflı kaleci: matches'ten (public SELECT) doğrudan okunur — admin_fetch_matches
  // bu kolonları döndürmüyor, drawer açılınca tazelenir.
  const [homeGkId, setHomeGkId] = useState<string>('');
  const [awayGkId, setAwayGkId] = useState<string>('');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [confirm, setConfirm] = useState<ActionConfirmOptions | null>(null);

  useEffect(() => { setLocal(match); setTab('kadro'); }, [match]);

  // TAM SATIR HİDRASYONU: liste RPC'si (admin_fetch_matches) kapora, sohbet,
  // yedekler, skor ve kaleci kolonlarını döndürmüyor — kokpit açılır açılmaz
  // tekil admin_get_match (to_jsonb) ile eksikler tamamlanır. Böylece listeden
  // açılan kokpitte "Kapora: NONE" / boş sohbet gibi yanıltıcı görünüm kalmaz.
  useEffect(() => {
    if (!match?.id) return;
    let alive = true;
    adminGetMatchAdmin(match.id)
      .then((full) => {
        if (!alive || !full) return;
        setLocal((prev) => (prev && prev.id === full.id ? { ...prev, ...full } : full));
      })
      .catch(() => { /* liste verisiyle devam — kokpit yine çalışır */ });
    return () => { alive = false; };
  }, [match?.id]);

  // Sahanın kort format aralıkları → Lobi Aynası'ndaki format düzenleyicisi
  // yalnız EN AZ BİR kortun aralığına giren formatları sunar.
  const [courtRanges, setCourtRanges] = useState<Array<{ minCapacity: number | null; maxCapacity: number | null; capacity: number | null }>>([]);
  useEffect(() => {
    const pid = local?.pitchId;
    if (!pid) { setCourtRanges([]); return; }
    let alive = true;
    void supabase
      .from('courts')
      .select('capacity, min_capacity, max_capacity')
      .eq('pitch_id', pid)
      .eq('is_active', true)
      .then(({ data }) => {
        if (!alive) return;
        setCourtRanges(((data ?? []) as Array<{ capacity: number | null; min_capacity: number | null; max_capacity: number | null }>)
          .map((c) => ({ minCapacity: c.min_capacity, maxCapacity: c.max_capacity, capacity: c.capacity })));
      });
    return () => { alive = false; };
  }, [local?.pitchId]);

  const allowedFormats = useMemo(
    () => (courtRanges.length ? allowedSquadSizesForCourts(courtRanges).filter((s) => s !== '2v2') : undefined),
    [courtRanges],
  );
  const formatRangeHint = useMemo(
    () => (courtRanges.length ? formatCapacityRangeForCourts(courtRanges) : null),
    [courtRanges],
  );

  // Atanmış kalecileri (ev sahibi + deplasman) matches'ten tazele.
  useEffect(() => {
    if (!match?.id) { setHomeGkId(''); setAwayGkId(''); return; }
    let alive = true;
    fetchMatchGoalkeepers(match.id)
      .then(({ gkId, awayGkId }) => { if (alive) { setHomeGkId(gkId || ''); setAwayGkId(awayGkId || ''); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [match?.id]);

  const matchId = local?.id;

  const loadIntents = useCallback(async () => {
    if (!matchId) return;
    setIntentsLoading(true);
    try { setIntents(await fetchMatchIntentsAdmin(matchId)); }
    catch (err) { toastError(toTurkishAdminError(err)); }
    finally { setIntentsLoading(false); }
  }, [matchId, toastError]);

  const loadTimeline = useCallback(async () => {
    if (!matchId) return;
    setTimelineLoading(true);
    try { setTimeline(await fetchMatchTimelineAdmin(matchId)); }
    catch (err) { toastError(toTurkishAdminError(err)); }
    finally { setTimelineLoading(false); }
  }, [matchId, toastError]);

  const loadServiceReqs = useCallback(async () => {
    if (!matchId) return;
    setServiceReqsLoading(true);
    try { setServiceReqs(await fetchMatchServiceRequestsAdmin(matchId)); }
    catch (err) { toastError(toTurkishAdminError(err)); }
    finally { setServiceReqsLoading(false); }
  }, [matchId, toastError]);

  useEffect(() => {
    if (tab === 'odeme') void loadIntents();
    if (tab === 'audit') void loadTimeline();
    if (tab === 'sonuc') void loadServiceReqs();
  }, [tab, loadIntents, loadTimeline, loadServiceReqs]);

  const refreshLocalSlots = useCallback((slots: MatchListing['slots'], isAway: boolean) => {
    if (!local) return;
    setLocal(isAway ? { ...local, awaySlots: slots } : { ...local, slots });
  }, [local]);

  const handleKick = async (slotId: string, isAway: boolean) => {
    if (!local) return;
    setBusy(true);
    try {
      const updated = await kickFromSlotAdmin(local.id, slotId, isAway);
      refreshLocalSlots(updated, isAway);
      success('Oyuncu slottan çıkarıldı');
      onUpdated();
    } catch (err) {
      const msg = toTurkishAdminError(err);
      if (msg.includes('admin_kick') || msg.includes('PGRST202')) {
        const slots = isAway ? (local.awaySlots || []) : local.slots;
        const next = slots.map((s) => s.id === slotId ? { ...s, status: 'OPEN' as const, player: undefined } : s);
        const patched = isAway ? { ...local, awaySlots: next } : { ...local, slots: next };
        await updateMatch(patched);
        setLocal(patched);
        success('Oyuncu slottan çıkarıldı (yerel)');
        onUpdated();
      } else {
        toastError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async (slotId: string, userId: string, isAway: boolean) => {
    if (!local || !userId) return;
    setBusy(true);
    try {
      const updated = await assignToSlotAdmin(local.id, slotId, userId, isAway);
      refreshLocalSlots(updated, isAway);
      success('Oyuncu slota atandı');
      onUpdated();
    } catch (err) {
      const msg = toTurkishAdminError(err);
      if (msg.includes('admin_assign') || msg.includes('PGRST202')) {
        const user = adminUsers.find((u) => u.id === userId);
        if (!user) { toastError('Kullanıcı bulunamadı'); return; }
        const slots = isAway ? (local.awaySlots || []) : local.slots;
        const next = slots.map((s) => s.id === slotId ? {
          ...s,
          status: 'TAKEN' as const,
          userId: user.id,
          player: { id: user.id, name: user.name, avatar: user.avatar, position: s.role, x: s.x, y: s.y, paymentStatus: 'PAID' as const },
        } : s);
        const patched = isAway ? { ...local, awaySlots: next } : { ...local, slots: next };
        await updateMatch(patched);
        setLocal(patched);
        success('Oyuncu atandı (yerel)');
        onUpdated();
      } else {
        toastError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  // Rahat kadro düzeltmesi: yeri karşı takımın İLK AÇIK slotuna taşır (para
  // hareketi yok; 20260730140341 is_admin muafiyeti). Taşıma İKİ tarafı da
  // değiştirdiği için tek taraflı refreshLocalSlots yetmez — tam satır tazelenir.
  const handleMoveTeam = async (slotId: string, isAway: boolean) => {
    if (!local) return;
    setBusy(true);
    try {
      await moveSlotTeamAdmin(local.id, slotId, isAway ? 'home' : 'away');
      const full = await adminGetMatchAdmin(local.id);
      if (full) setLocal((prev) => (prev && prev.id === full.id ? { ...prev, ...full } : full));
      success('Yer karşı takıma taşındı');
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSwap = async (slotA: string, slotB: string, isAway: boolean) => {
    if (!local) return;
    setBusy(true);
    try {
      const updated = await swapSlotsAdmin(local.id, slotA, slotB, isAway);
      refreshLocalSlots(updated, isAway);
      success('Oyuncular yer değiştirdi');
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReferee = async (refId: string) => {
    if (!local) return;
    setBusy(true);
    try {
      await assignMatchRefereeAdmin(local.id, refId || null);
      setLocal({ ...local, refereeId: refId || undefined });
      success('Hakem ataması güncellendi');
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoalkeeperSide = async (gkId: string, side: 'HOME' | 'AWAY') => {
    if (!local) return;
    setBusy(true);
    try {
      await assignMatchGoalkeeperSideAdmin(local.id, gkId || null, side);
      if (side === 'AWAY') { setAwayGkId(gkId); }
      else { setHomeGkId(gkId); setLocal({ ...local, gkId: gkId || undefined }); }
      success(side === 'AWAY' ? 'Deplasman kaleci ataması güncellendi' : 'Ev sahibi kaleci ataması güncellendi');
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (status: string) => {
    if (!local) return;
    setBusy(true);
    try {
      await setMatchStatusAdmin(local.id, status);
      setLocal({ ...local, status: status as MatchListing['status'] });
      success(`Durum: ${status}`);
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  // Durum takılı kaldıysa (doluluk değişti ama durum eskide kaldı) sunucudaki
  // kanonik hesabı elle tetikle — slot müdahaleleri bunu zaten içeriden çağırır.
  const handleRecomputeStatus = async () => {
    if (!local) return;
    setBusy(true);
    try {
      const yeni = await recomputeMatchStatusAdmin(local.id);
      setLocal((prev) => (prev ? { ...prev, status: (yeni || prev.status) as MatchListing['status'] } : prev));
      success(`Durum yeniden hesaplandı: ${yeni || '—'}`);
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  // Lobi Aynası alan kaydı: tek alan → admin_update_match (audit'li) → yerel yama.
  // PRIVATE'a geçişte kod sunucuda üretilebilir → tam satırı yeniden çek.
  // Fonksiyonel setLocal ŞART: açılıştaki tam-satır hidrasyonu uçuştayken kayıt
  // yapılırsa nesne-literal yama bayat closure ile hidrasyonu ezip kaporayı
  // NONE, sohbeti boş gösteriyordu. Dönüş: başarıda true — düzenleyici yalnız
  // başarıda kapanır (hatada taslak korunur).
  const handleInfoSave = async (payload: Record<string, unknown>, patch: Partial<MatchListing>): Promise<boolean> => {
    if (!local || busy) return false;
    const matchIdAtSave = local.id;
    setBusy(true);
    try {
      await updateMatchAdmin(matchIdAtSave, payload);
      setLocal((prev) => (prev && prev.id === matchIdAtSave ? { ...prev, ...patch } : prev));
      if (payload.visibility === 'PRIVATE' && !payload.private_code) {
        const full = await adminGetMatchAdmin(matchIdAtSave).catch(() => null);
        if (full) setLocal((prev) => (prev && prev.id === full.id ? { ...prev, ...full } : prev));
      }
      success('Maç bilgisi güncellendi — lobide anında görünür');
      onUpdated();
      return true;
    } catch (err) {
      toastError(toTurkishAdminError(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!local) return;
    // Karar #73: her iptal zorunlu sebeple audit'e yazılır.
    if (cancelReason.trim().length < 5) {
      toastError('İptal sebebi zorunlu (en az 5 karakter).');
      return;
    }
    setBusy(true);
    try {
      await cancelMatchAdmin(local.id, cancelReason.trim(), cancelRefund);
      setLocal({ ...local, status: 'CANCELLED' });
      success(cancelRefund ? 'Maç iptal edildi; iadeler politikaya göre işlenir' : 'Maç iptal edildi (iadesiz)');
      setCancelOpen(false);
      setCancelReason('');
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  // ACİL İPTAL: tek adımda iptal + iade süreci (PENDING) + TÜM kadroya anlık
  // bildirim (admin_emergency_cancel_match). Normal iptalden farkı: bildirim
  // otomatik gider ve iade süreci daima başlatılır.
  const confirmEmergencyCancel = async () => {
    if (!local) return;
    if (cancelReason.trim().length < 5) {
      toastError('İptal sebebi zorunlu (en az 5 karakter).');
      return;
    }
    setBusy(true);
    try {
      const { recipients } = await emergencyCancelMatchAdmin(local.id, cancelReason.trim());
      // Fonksiyonel güncelleme: eşzamanlı hidrasyonun getirdiği alanlar ezilmesin
      setLocal((prev) => (prev ? { ...prev, status: 'CANCELLED' } : prev));
      success(`Acil iptal tamam — ${recipients} oyuncuya bildirim gitti, iade süreci başlatıldı`);
      setCancelOpen(false);
      setCancelReason('');
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  // ─── Para işlemleri (yaz-onayla) ───────────────────────────────────────────
  const runMoney = async (fn: () => Promise<void>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      success(okMsg);
      setConfirm(null);
      await loadIntents();
      onUpdated();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const askCapture = (it: MatchIntentRow) => setConfirm({
    title: 'Tahsilatı zorla (capture)',
    description: `${it.user_name} için ${fmtMoney(it.amount)} ön-provizyonu TAHSİL edilecek.`,
    impactText: 'Para gerçekten çekilir. Geri almak ayrı bir iade işlemi gerektirir.',
    actionType: 'FORCE_CAPTURE', targetId: it.id, targetName: `${it.user_name} • ${fmtMoney(it.amount)}`,
    confirmPhrase: local?.title,
    onConfirm: () => void runMoney(() => forceCaptureIntentAdmin(it.id, 'Kokpit force capture'), 'Tahsil edildi'),
    onCancel: () => setConfirm(null),
  });

  const askVoid = (it: MatchIntentRow) => setConfirm({
    title: 'Ön-provizyonu iptal et (void)',
    description: `${it.user_name} için ${fmtMoney(it.amount)} bloke serbest bırakılacak (tahsil edilmez).`,
    impactText: 'Bloke kaldırılır; bu maç slotu için ödeme alınmamış sayılır.',
    actionType: 'FORCE_VOID', targetId: it.id, targetName: `${it.user_name} • ${fmtMoney(it.amount)}`,
    confirmPhrase: local?.title,
    onConfirm: () => void runMoney(() => forceVoidIntentAdmin(it.id, 'Kokpit force void'), 'Bloke serbest bırakıldı'),
    onCancel: () => setConfirm(null),
  });

  const askRefund = (it: MatchIntentRow) => setConfirm({
    title: 'İade et (refund)',
    description: `${it.user_name} için ${fmtMoney(it.amount)} kademeli iade politikasına göre iade edilecek.`,
    impactText: 'Tahsil edilmiş ödeme iade edilir; kesintiler politikaya göre hesaplanır.',
    actionType: 'FORCE_REFUND', targetId: it.id, targetName: `${it.user_name} • ${fmtMoney(it.amount)}`,
    confirmPhrase: local?.title,
    onConfirm: () => void runMoney(() => forceRefundIntentAdmin(it.id, 'Kokpit force refund'), 'İade işlendi'),
    onCancel: () => setConfirm(null),
  });

  const askScore = () => {
    if (!local) return;
    const h = Number(homeScore), a = Number(awayScore);
    if (homeScore === '' || awayScore === '' || Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) {
      toastError('Geçerli skor girin'); return;
    }
    setConfirm({
      title: 'Skoru kaydet & maçı tamamla',
      description: `Skor ${h}-${a} olarak kaydedilecek; maç TAMAMLANDI yapılacak, kayıtlı takımların W/L geçmişine işlenecek ve kadro otomatik bilgilendirilecek.`,
      impactText: 'Bu işlem maçı sonlandırır ve takım istatistiklerini günceller.',
      actionType: 'SCORE_OVERRIDE', targetId: local.id, targetName: `${h}-${a}`,
      onConfirm: () => void (async () => {
        setBusy(true);
        try {
          await overrideMatchScoreAdmin(local.id, h, a);
          setLocal({ ...local, status: 'COMPLETED' as MatchListing['status'] });
          success('Skor kaydedildi, kadro bilgilendirildi');
          setConfirm(null);
          onUpdated();
        } catch (err) { toastError(toTurkishAdminError(err)); }
        finally { setBusy(false); }
      })(),
      onCancel: () => setConfirm(null),
    });
  };

  const handleNotify = async () => {
    if (!local) return;
    if (!notifyTitle.trim() || !notifyBody.trim()) { toastError('Başlık ve mesaj gerekli'); return; }
    setBusy(true);
    try {
      const n = await notifyMatchRosterAdmin(local.id, notifyTitle.trim(), notifyBody.trim());
      success(`${n} oyuncuya gönderildi`);
      setNotifyTitle(''); setNotifyBody('');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!local) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[180] flex justify-end">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full max-w-2xl h-full bg-[#0D1117] border-l border-white/10 flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <div className="min-w-0">
              <p className="text-[10px] text-gray-500 font-mono uppercase">Maç Kontrol Kokpiti</p>
              <h2 className="text-sm font-extrabold text-white uppercase truncate">{local.title}</h2>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Sekmeler */}
          <div className="flex items-stretch border-b border-white/10 shrink-0 overflow-x-auto custom-scrollbar">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${
                  tab === key ? 'border-[#39FF14] text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
            {/* Üst özet — kadro DIŞINDAKİ sekmelerde (kadroda Lobi Aynası var) */}
            {tab !== 'kadro' && (
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                  <p className="text-[9px] text-gray-500 uppercase">Konum</p>
                  <p className="font-bold text-white truncate">{local.location}</p>
                </div>
                <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                  <p className="text-[9px] text-gray-500 uppercase">Zaman</p>
                  <p className="font-mono text-red-300">{local.date} {local.time}</p>
                </div>
                <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[9px] text-gray-500 uppercase">Durum</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRecomputeStatus()}
                      title="Durumu doluluk/eşik kurallarından yeniden hesapla (durum takılı kaldıysa)"
                      className="w-5 h-5 rounded bg-white/5 border border-white/10 text-gray-500 hover:text-white flex items-center justify-center disabled:opacity-40"
                    >
                      <RefreshCw size={9} />
                    </button>
                  </div>
                  <p className="font-bold text-[#39FF14]">{local.status || 'ACTIVE'}</p>
                </div>
                <div className="bg-black/30 rounded-lg p-2 border border-white/5">
                  <p className="text-[9px] text-gray-500 uppercase">Kapora</p>
                  <span className={`inline-block mt-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${intentBadge(local.depositStatus || 'NONE')}`}>
                    {local.depositStatus || 'NONE'}{local.depositAmount ? ` · ${local.depositAmount}₺` : ''}
                  </span>
                </div>
              </div>
            )}

            {/* ── KADRO & SLOT ── */}
            {tab === 'kadro' && (
              <>
                {/* Lobi Aynası: kullanıcı lobisi başlığının düzenlenebilir birebir kopyası */}
                <MatchLobbyHeader match={local} busy={busy} onSave={handleInfoSave} allowedFormats={allowedFormats} formatRangeHint={formatRangeHint} />
                {local.status === 'DRAFT' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleStatus('ACTIVE')}
                    className="w-full py-2.5 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[11px] font-extrabold uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-[#39FF14]/25 transition-colors"
                  >
                    ✓ ONAYLA — YAYINA AL
                  </button>
                )}

                <div className="flex flex-wrap gap-2">
                  {(['DRAFT', 'ACTIVE', 'LIVE', 'COMPLETED', 'CANCELLED'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy || local.status === s}
                      onClick={() => void handleStatus(s)}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-colors ${
                        local.status === s
                          ? s === 'DRAFT'
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : s === 'ACTIVE' || s === 'LIVE'
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-red-500/20 border-red-500/40 text-red-300'
                          : 'border-white/10 text-gray-500 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {(local.depositStatus === 'BLOCKED' || local.depositStatus === 'CAPTURED') && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-bold uppercase">Kapora (admin):</span>
                    {local.depositStatus === 'BLOCKED' && (
                      <>
                        <button type="button" disabled={busy}
                          onClick={() => void runMoney(async () => { await matchDepositActionAdmin(local.id, 'CAPTURE'); setLocal({ ...local, depositStatus: 'CAPTURED' }); }, 'Kapora tahsil edildi')}
                          className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/15">CAPTURE</button>
                        <button type="button" disabled={busy}
                          onClick={() => void runMoney(async () => { await matchDepositActionAdmin(local.id, 'VOID', 'Admin void'); setLocal({ ...local, depositStatus: 'VOIDED' }); }, 'Kapora serbest bırakıldı')}
                          className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-white/15 text-gray-300 hover:bg-white/10">VOID</button>
                      </>
                    )}
                    <button type="button" disabled={busy}
                      onClick={() => void runMoney(async () => { await matchDepositActionAdmin(local.id, 'REFUND', 'Admin refund'); setLocal({ ...local, depositStatus: 'REFUNDED' }); }, 'Kapora iade edildi')}
                      className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-blue-500/40 text-blue-300 hover:bg-blue-500/15">REFUND</button>
                  </div>
                )}

                {local.slots.length === 0 ? (
                  <p className="text-[11px] text-gray-600 py-6 text-center">Bu maçın kadro/slot tanımı yok.</p>
                ) : local.difficulty === 'Rahat' ? (
                  // E9 · Rahat maç: saha çizimi yok — oyuncuyla aynı dili konuşan
                  // pozisyonsuz iki kolonlu kadro (BEYAZ | KIRMIZI).
                  <MatchLobbyRoster
                    slots={local.slots}
                    awaySlots={local.awaySlots}
                    users={adminUsers}
                    busy={busy}
                    onKick={(slotId, isAway) => handleKick(slotId, isAway)}
                    onMoveTeam={(slotId, isAway) => handleMoveTeam(slotId, isAway)}
                  />
                ) : (
                  <MatchLobbyPitch
                    slots={local.slots}
                    awaySlots={local.awaySlots}
                    users={adminUsers}
                    busy={busy}
                    format={local.format}
                    captainId={local.creatorId}
                    onAssign={(slotId, userId, isAway) => handleAssign(slotId, userId, isAway)}
                    onKick={(slotId, isAway) => handleKick(slotId, isAway)}
                    onSwap={(a, b, isAway) => handleSwap(a, b, isAway)}
                  />
                )}

                {/* Yedekler (reservePlayers) — varsa göster */}
                {local.reservePlayers && local.reservePlayers.length > 0 && (
                  <div className="p-3 rounded-xl border border-white/10 bg-black/20 space-y-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">Yedekler ({local.reservePlayers.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {local.reservePlayers.map((p) => (
                        <div key={p.id} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full pl-1 pr-2.5 py-1">
                          <img src={p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name || 'Oyuncu')}`} alt="" className="w-5 h-5 rounded-full object-cover" />
                          <span className="text-[10px] font-bold text-white truncate max-w-[90px]">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── SONUÇ & HAKEM ── */}
            {tab === 'sonuc' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Hakem</label>
                    <select
                      value={local.refereeId || ''}
                      disabled={busy}
                      onChange={(e) => void handleReferee(e.target.value)}
                      className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white"
                    >
                      <option value="">Atanmadı</option>
                      {adminReferees.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Kaleci · Ev Sahibi</label>
                    <select
                      value={homeGkId}
                      disabled={busy}
                      onChange={(e) => void handleGoalkeeperSide(e.target.value, 'HOME')}
                      className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white"
                    >
                      <option value="">Atanmadı</option>
                      {adminGoalkeepers.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Kaleci · Deplasman</label>
                    <select
                      value={awayGkId}
                      disabled={busy}
                      onChange={(e) => void handleGoalkeeperSide(e.target.value, 'AWAY')}
                      className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white"
                    >
                      <option value="">Atanmadı</option>
                      {adminGoalkeepers.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                </div>

                {/* Sağlayıcı talepleri (kaleci/hakem başvuruları + kiralama, escrow durumu) */}
                <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Sağlayıcı Talepleri</p>
                    <button type="button" onClick={() => void loadServiceReqs()} className="text-[10px] text-gray-500 hover:text-white">Yenile</button>
                  </div>
                  {serviceReqsLoading ? (
                    <p className="text-[11px] text-gray-500">Yükleniyor…</p>
                  ) : serviceReqs.length === 0 ? (
                    <p className="text-[11px] text-gray-600">Bu maçta hizmet talebi/başvurusu yok.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {serviceReqs.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-2 bg-black/30 border border-white/5 rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs text-white font-bold truncate">
                              {r.provider_name} <span className="text-gray-500">· {r.provider_type === 'GK' ? 'Kaleci' : 'Hakem'}</span>
                            </p>
                            <p className="text-[9px] text-gray-500">
                              {r.initiated_by === 'PROVIDER' ? 'Başvuru' : 'Kiralama'} · {fmtMoney(r.provider_amount)}
                              {r.status === 'CAPTURED' && ` · Onay: ${r.provider_confirmed ? '✓' : '○'} sağlayıcı / ${r.captain_confirmed ? '✓' : '○'} kaptan`}
                            </p>
                          </div>
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border ${intentBadge(r.status)}`}>{r.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Skor Düzeltme (Override)</p>
                  <div className="flex items-center justify-center gap-3">
                    <input type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} placeholder="Ev" className="w-16 h-12 text-center text-lg font-extrabold bg-black/40 border border-white/15 rounded-lg text-white focus:border-[#39FF14]/50 focus:outline-none" />
                    <span className="text-gray-600 font-extrabold">-</span>
                    <input type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} placeholder="Dep" className="w-16 h-12 text-center text-lg font-extrabold bg-black/40 border border-white/15 rounded-lg text-white focus:border-[#39FF14]/50 focus:outline-none" />
                  </div>
                  <button type="button" disabled={busy} onClick={askScore} className="w-full py-2.5 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[11px] font-extrabold uppercase tracking-widest hover:bg-[#39FF14]/25 disabled:opacity-40">
                    Skoru Kaydet & Tamamla
                  </button>
                  <p className="text-[10px] text-gray-500 leading-relaxed">Kaydedince maç tamamlanır, kayıtlı takımların W/L geçmişine işlenir ve kadro otomatik bilgilendirilir.</p>
                </div>
              </>
            )}

            {/* ── ÖDEME ── */}
            {tab === 'odeme' && (
              <div className="space-y-2">
                {/* Finans özeti */}
                {(() => {
                  const up = (s: string) => s.toUpperCase();
                  const sum = (pred: (s: string) => boolean) => intents.filter((i) => pred(up(i.status))).reduce((t, i) => t + Number(i.amount || 0), 0);
                  const collected = sum((s) => s === 'CAPTURED' || s === 'PAID');
                  const blocked = sum((s) => s === 'BLOCKED' || s === 'PENDING');
                  const refunded = sum((s) => s === 'REFUNDED');
                  const commission = intents.filter((i) => ['CAPTURED', 'PAID'].includes(up(i.status))).reduce((t, i) => t + Number(i.commission_amount || 0), 0);
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5">
                        <p className="text-[9px] text-emerald-300/70 uppercase font-bold">Tahsil Edilen</p>
                        <p className="text-sm font-extrabold text-emerald-300 font-mono">{fmtMoney(collected)}</p>
                      </div>
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5">
                        <p className="text-[9px] text-amber-300/70 uppercase font-bold">Bloke / Bekleyen</p>
                        <p className="text-sm font-extrabold text-amber-300 font-mono">{fmtMoney(blocked)}</p>
                      </div>
                      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5">
                        <p className="text-[9px] text-blue-300/70 uppercase font-bold">İade Edilen</p>
                        <p className="text-sm font-extrabold text-blue-300 font-mono">{fmtMoney(refunded)}</p>
                      </div>
                      <div className="bg-[#39FF14]/10 border border-[#39FF14]/20 rounded-xl p-2.5">
                        <p className="text-[9px] text-[#39FF14]/70 uppercase font-bold">Platform Komisyonu</p>
                        <p className="text-sm font-extrabold text-[#39FF14] font-mono">{fmtMoney(commission)}</p>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Bu Maçın Ödemeleri</p>
                  <button type="button" onClick={() => void loadIntents()} className="text-[10px] text-gray-500 hover:text-white">Yenile</button>
                </div>
                {intentsLoading ? (
                  <p className="text-[11px] text-gray-600 py-6 text-center">Yükleniyor…</p>
                ) : intents.length === 0 ? (
                  <p className="text-[11px] text-gray-600 py-6 text-center">Bu maça bağlı ödeme kaydı yok.</p>
                ) : intents.map((it) => {
                  const s = it.status.toUpperCase();
                  const canCaptureVoid = s === 'BLOCKED' || s === 'PENDING';
                  const canRefund = s === 'CAPTURED' || s === 'PAID';
                  return (
                    <div key={it.id} className="bg-black/30 border border-white/[0.06] rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{it.user_name}</p>
                          <p className="text-[10px] text-gray-500">{fmtMoney(it.amount)} · komisyon {fmtMoney(it.commission_amount)}</p>
                        </div>
                        <span className={`text-[9px] font-extrabold px-2 py-1 rounded-md border shrink-0 ${intentBadge(it.status)}`}>{it.status}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button type="button" disabled={busy || !canCaptureVoid} onClick={() => askCapture(it)} className="flex-1 text-[10px] font-bold py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 disabled:opacity-30">Tahsil Et</button>
                        <button type="button" disabled={busy || !canCaptureVoid} onClick={() => askVoid(it)} className="flex-1 text-[10px] font-bold py-1.5 rounded-lg border border-amber-500/30 text-amber-400 disabled:opacity-30">İptal (Void)</button>
                        <button type="button" disabled={busy || !canRefund} onClick={() => askRefund(it)} className="flex-1 text-[10px] font-bold py-1.5 rounded-lg border border-red-500/30 text-red-400 disabled:opacity-30">İade Et</button>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-gray-600 leading-relaxed pt-1">Para işlemleri FİNANS/SUPER_ADMIN yetkisi ister, denetim kaydına düşer ve onay için maç adını yazmanız gerekir.</p>
              </div>
            )}

            {/* ── BİLDİRİM ── */}
            {tab === 'bildirim' && (
              <div className="space-y-3">
                <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Kadroya Bildirim Gönder</p>
                <input value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} placeholder="Başlık (örn. Maç saati değişti)" className="w-full h-10 bg-black/40 border border-white/15 rounded-lg px-3 text-sm text-white focus:border-[#39FF14]/40 focus:outline-none" />
                <textarea value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} placeholder="Mesaj…" rows={4} className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:border-[#39FF14]/40 focus:outline-none resize-none" />
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ['Maç iptal edildi', 'Maçınız iptal edildi. Ödemeniz iade sürecine alındı.'],
                    ['Saha değişti', 'Maçınızın sahası güncellendi. Detaylar uygulamada.'],
                    ['Saat güncellendi', 'Maçınızın saati güncellendi. Lütfen kontrol edin.'],
                  ].map(([t, b]) => (
                    <button key={t} type="button" onClick={() => { setNotifyTitle(t); setNotifyBody(b); }} className="text-[10px] text-gray-400 border border-white/10 rounded-lg px-2 py-1 hover:text-white">{t}</button>
                  ))}
                </div>
                <button type="button" disabled={busy} onClick={() => void handleNotify()} className="w-full py-2.5 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[11px] font-extrabold uppercase tracking-widest hover:bg-[#39FF14]/25 disabled:opacity-40">Kadroya Gönder</button>
              </div>
            )}

            {/* ── SOHBET (read-only moderasyon) ── */}
            {tab === 'sohbet' && (
              <div className="space-y-2">
                <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Maç Sohbeti (salt okunur)</p>
                {!local.chatMessages || local.chatMessages.length === 0 ? (
                  <p className="text-[11px] text-gray-600 py-6 text-center">Bu maçta henüz mesaj yok.</p>
                ) : local.chatMessages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-2 bg-black/30 border border-white/[0.06] rounded-xl p-2.5">
                    <img src={msg.senderAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderName || 'K')}`} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-white truncate">{msg.senderName}</span>
                        <span className="text-[9px] text-gray-600 font-mono shrink-0">{msg.timestamp ? new Date(msg.timestamp).toLocaleString('tr-TR') : ''}</span>
                      </div>
                      <p className="text-[11px] text-gray-300 break-words">{msg.text}</p>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-gray-600 leading-relaxed pt-1">Moderasyon için görüntülenir. İhtilaf durumunda yazışma delili burada.</p>
              </div>
            )}

            {/* ── KAYIT (TAM ZAMAN ÇİZELGESİ) ── */}
            {tab === 'audit' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">Maç Zaman Çizelgesi</p>
                  <button type="button" onClick={() => void loadTimeline()} className="text-[10px] text-gray-500 hover:text-white">Yenile</button>
                </div>
                <p className="text-[10px] text-gray-600 leading-relaxed">Katılım/ayrılma, ödeme, bildirim, hizmet, skor, itiraz ve admin müdahaleleri — hepsi tek akışta.</p>
                {timelineLoading ? (
                  <p className="text-[11px] text-gray-600 py-6 text-center">Yükleniyor…</p>
                ) : timeline.length === 0 ? (
                  <p className="text-[11px] text-gray-600 py-6 text-center">Bu maç için henüz kayıtlı olay yok.</p>
                ) : timeline.map((ev, i) => (
                  <div key={i} className="bg-black/30 border border-white/[0.06] rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md border uppercase tracking-wide ${sourceBadge(ev.source)}`}>{ev.source}</span>
                      <span className="text-[9px] text-gray-600 font-mono">{new Date(ev.created_at).toLocaleString('tr-TR')}</span>
                    </div>
                    <p className="text-xs font-bold text-white mt-1.5">{ev.title}</p>
                    {ev.detail && <p className="text-[10px] text-gray-500 mt-0.5 break-words">{ev.detail}</p>}
                    {ev.actor && <p className="text-[9px] text-gray-600 mt-0.5">— {ev.actor}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alt aksiyon barı */}
          <div className="shrink-0 p-4 border-t border-white/10 flex flex-wrap gap-2">
            {onViewDisputes && (
              <button type="button" onClick={() => onViewDisputes(local.id)} className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold text-amber-400 border border-amber-500/30 rounded-lg">
                <Scale size={12} /> İhtilaflar
              </button>
            )}
            <button type="button" disabled={busy || local.status === 'CANCELLED'} onClick={() => setCancelOpen(true)} className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold text-red-400 border border-red-500/30 rounded-lg ml-auto">
              <Trash2 size={12} /> Maçı İptal Et
            </button>
          </div>

          {cancelOpen && (
            <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#161B22] border border-red-500/30 rounded-2xl w-full max-w-sm p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-extrabold text-white uppercase">Maçı İptal Et</h3>
                  <p className="text-[11px] text-gray-400 mt-1">"{local.title}" iptal edilecek. Sebep zorunludur ve denetim kaydına yazılır.</p>
                </div>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="İptal sebebi (kadroya bildirimde ve denetimde görünür)…"
                  rows={3}
                  className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:border-red-500/40 focus:outline-none resize-none"
                />
                <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={cancelRefund}
                    onChange={(e) => setCancelRefund(e.target.checked)}
                    className="accent-red-500 w-4 h-4"
                  />
                  Ödemeleri iade et (kademeli iade politikası uygulanır)
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCancelOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white text-xs font-bold"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    disabled={busy || cancelReason.trim().length < 5}
                    onClick={() => void confirmCancel()}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-extrabold disabled:opacity-40"
                  >
                    İptal Et
                  </button>
                </div>
                {/* Acil iptal: iade + kadro bildirimi otomatik (tek adım) */}
                <button
                  type="button"
                  disabled={busy || cancelReason.trim().length < 5}
                  onClick={() => void confirmEmergencyCancel()}
                  className="w-full py-2.5 rounded-xl bg-orange-500/15 border border-orange-500/40 text-orange-300 text-xs font-extrabold uppercase tracking-wider hover:bg-orange-500/25 disabled:opacity-40"
                >
                  🚨 Acil İptal — iade sürecini başlat + tüm kadroya bildir
                </button>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  Acil iptalde iade süreci daima başlatılır ve kadrodaki herkese anlık bildirim gider; normal iptalde iade seçime bağlıdır ve bildirimi ayrıca gönderirsiniz.
                </p>
              </div>
            </div>
          )}
          <ActionConfirmModal isOpen={!!confirm} options={confirm} />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
