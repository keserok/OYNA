import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Scale, Users2, Trophy, CreditCard, Bell, ScrollText } from 'lucide-react';
import { useAppStore } from '../../../store';
import {
  assignMatchRefereeAdmin,
  assignToSlotAdmin,
  cancelMatchAdmin,
  kickFromSlotAdmin,
  setMatchStatusAdmin,
  overrideMatchScoreAdmin,
  notifyMatchRosterAdmin,
  fetchMatchIntentsAdmin,
  forceCaptureIntentAdmin,
  forceVoidIntentAdmin,
  forceRefundIntentAdmin,
  fetchMatchAuditAdmin,
  toTurkishAdminError,
  type MatchIntentRow,
  type MatchAuditRow,
} from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import { ActionConfirmModal, type ActionConfirmOptions } from './ActionConfirmModal';
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

export const MatchDetailDrawer: React.FC<Props> = ({ match, onClose, onUpdated, onViewDisputes }) => {
  const { adminUsers, adminReferees, updateMatch } = useAppStore();
  const { success, error: toastError } = useAdminToast();
  const [local, setLocal] = useState<MatchListing | null>(match);
  const [tab, setTab] = useState<TabKey>('kadro');
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [intents, setIntents] = useState<MatchIntentRow[]>([]);
  const [intentsLoading, setIntentsLoading] = useState(false);
  const [audit, setAudit] = useState<MatchAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [confirm, setConfirm] = useState<ActionConfirmOptions | null>(null);

  useEffect(() => { setLocal(match); setTab('kadro'); }, [match]);

  const matchId = local?.id;

  const loadIntents = useCallback(async () => {
    if (!matchId) return;
    setIntentsLoading(true);
    try { setIntents(await fetchMatchIntentsAdmin(matchId)); }
    catch (err) { toastError(toTurkishAdminError(err)); }
    finally { setIntentsLoading(false); }
  }, [matchId, toastError]);

  const loadAudit = useCallback(async () => {
    if (!matchId) return;
    setAuditLoading(true);
    try { setAudit(await fetchMatchAuditAdmin(matchId)); }
    catch (err) { toastError(toTurkishAdminError(err)); }
    finally { setAuditLoading(false); }
  }, [matchId, toastError]);

  useEffect(() => {
    if (tab === 'odeme') void loadIntents();
    if (tab === 'audit') void loadAudit();
  }, [tab, loadIntents, loadAudit]);

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
      setSelectedSlot(null);
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
          player: { id: user.id, name: user.name, avatar: user.avatar, rating: user.rating, position: s.role, x: s.x, y: s.y },
        } : s);
        const patched = isAway ? { ...local, awaySlots: next } : { ...local, slots: next };
        await updateMatch(patched);
        setLocal(patched);
        setSelectedSlot(null);
        success('Oyuncu atandı (yerel)');
        onUpdated();
      } else {
        toastError(msg);
      }
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

  const confirmCancel = async () => {
    if (!local) return;
    setBusy(true);
    try {
      await cancelMatchAdmin(local.id, 'Admin iptali', false);
      setLocal({ ...local, status: 'CANCELLED' });
      success('Maç iptal edildi');
      setCancelOpen(false);
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

  const mid = Math.ceil(local.slots.length / 2) || local.slots.length;
  const teamA = local.slots.slice(0, mid);
  const teamB = local.slots.slice(mid);

  const renderSlots = (slots: typeof teamA, isAway: boolean, label: string, color: string) => (
    <div className={`p-3 rounded-xl border ${color} space-y-2`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
      {slots.length === 0 ? (
        <p className="text-[11px] text-gray-600">Slot yok</p>
      ) : slots.map((slot) => (
        <div key={slot.id} className="flex items-center justify-between gap-2 p-2 bg-black/30 rounded-lg text-xs">
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/5">{slot.role}</span>
            {slot.status === 'TAKEN' && slot.player ? (
              <span className="font-bold text-white truncate">{slot.player.name}</span>
            ) : (
              <span className="text-gray-600 italic">Boş</span>
            )}
          </div>
          <div className="shrink-0 flex gap-1">
            {slot.status === 'TAKEN' ? (
              <button type="button" disabled={busy} onClick={() => void handleKick(slot.id, isAway)} className="text-[9px] font-bold text-red-400 border border-red-500/30 px-2 py-1 rounded">Kick</button>
            ) : selectedSlot === slot.id ? (
              <select
                className="h-7 text-[10px] bg-black border border-white/15 rounded px-1 text-white max-w-[100px]"
                defaultValue=""
                onChange={(e) => void handleAssign(slot.id, e.target.value, isAway)}
              >
                <option value="">Seç</option>
                {adminUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <button type="button" disabled={busy} onClick={() => setSelectedSlot(slot.id)} className="text-[9px] font-bold text-green-400 border border-green-500/30 px-2 py-1 rounded">Ata</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[180] flex justify-end">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={onClose} />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full max-w-xl h-full bg-[#0D1117] border-l border-white/10 flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
            <div className="min-w-0">
              <p className="text-[10px] text-gray-500 font-mono uppercase">Maç Kontrol Kokpiti</p>
              <h2 className="text-sm font-black text-white uppercase truncate">{local.title}</h2>
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
            {/* Üst özet — her sekmede görünür */}
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
                <p className="text-[9px] text-gray-500 uppercase">Durum</p>
                <p className="font-bold text-[#39FF14]">{local.status || 'ACTIVE'}</p>
              </div>
            </div>

            {/* ── KADRO & SLOT ── */}
            {tab === 'kadro' && (
              <>
                {local.status === 'DRAFT' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleStatus('ACTIVE')}
                    className="w-full py-2.5 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-[#39FF14]/25 transition-colors"
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

                {renderSlots(teamA, false, 'A Takımı', 'border-red-500/20 bg-red-500/5')}
                {teamB.length > 0 && renderSlots(teamB, false, 'B Takımı', 'border-blue-500/20 bg-blue-500/5')}
                {local.awaySlots && local.awaySlots.length > 0 && renderSlots(local.awaySlots, true, 'Deplasman Slotları', 'border-cyan-500/20 bg-cyan-500/5')}
              </>
            )}

            {/* ── SONUÇ & HAKEM ── */}
            {tab === 'sonuc' && (
              <>
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

                <div className="bg-[#161B22]/60 border border-white/[0.06] rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Skor Düzeltme (Override)</p>
                  <div className="flex items-center justify-center gap-3">
                    <input type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} placeholder="Ev" className="w-16 h-12 text-center text-lg font-black bg-black/40 border border-white/15 rounded-lg text-white focus:border-[#39FF14]/50 focus:outline-none" />
                    <span className="text-gray-600 font-black">-</span>
                    <input type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} placeholder="Dep" className="w-16 h-12 text-center text-lg font-black bg-black/40 border border-white/15 rounded-lg text-white focus:border-[#39FF14]/50 focus:outline-none" />
                  </div>
                  <button type="button" disabled={busy} onClick={askScore} className="w-full py-2.5 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[11px] font-black uppercase tracking-widest hover:bg-[#39FF14]/25 disabled:opacity-40">
                    Skoru Kaydet & Tamamla
                  </button>
                  <p className="text-[10px] text-gray-500 leading-relaxed">Kaydedince maç tamamlanır, kayıtlı takımların W/L geçmişine işlenir ve kadro otomatik bilgilendirilir.</p>
                </div>
              </>
            )}

            {/* ── ÖDEME ── */}
            {tab === 'odeme' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Bu Maçın Ödemeleri</p>
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
                        <span className={`text-[9px] font-black px-2 py-1 rounded-md border shrink-0 ${intentBadge(it.status)}`}>{it.status}</span>
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
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Kadroya Bildirim Gönder</p>
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
                <button type="button" disabled={busy} onClick={() => void handleNotify()} className="w-full py-2.5 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/40 text-[#39FF14] text-[11px] font-black uppercase tracking-widest hover:bg-[#39FF14]/25 disabled:opacity-40">Kadroya Gönder</button>
              </div>
            )}

            {/* ── AUDIT ── */}
            {tab === 'audit' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Bu Maça Ait Denetim Kayıtları</p>
                  <button type="button" onClick={() => void loadAudit()} className="text-[10px] text-gray-500 hover:text-white">Yenile</button>
                </div>
                {auditLoading ? (
                  <p className="text-[11px] text-gray-600 py-6 text-center">Yükleniyor…</p>
                ) : audit.length === 0 ? (
                  <p className="text-[11px] text-gray-600 py-6 text-center">Bu maç için henüz admin müdahalesi yok.</p>
                ) : audit.map((a) => (
                  <div key={a.id} className="bg-black/30 border border-white/[0.06] rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black text-[#39FF14] uppercase">{a.action}</span>
                      <span className="text-[9px] text-gray-600 font-mono">{new Date(a.created_at).toLocaleString('tr-TR')}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">{a.admin_name || '—'}</p>
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

          <ConfirmDialog
            open={cancelOpen}
            title="Maçı iptal et"
            description={`"${local.title}" iptal edilecek. Bu işlem denetim kaydına düşer.`}
            confirmLabel="İptal Et"
            destructive
            onConfirm={() => void confirmCancel()}
            onCancel={() => setCancelOpen(false)}
          />
          <ActionConfirmModal isOpen={!!confirm} options={confirm} />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
