import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Scale } from 'lucide-react';
import { useAppStore } from '../../../store';
import {
  assignMatchRefereeAdmin,
  assignToSlotAdmin,
  cancelMatchAdmin,
  kickFromSlotAdmin,
  setMatchStatusAdmin,
  toTurkishAdminError,
} from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { ConfirmDialog } from './ConfirmDialog';
import type { MatchListing } from '../../../types';

interface Props {
  match: MatchListing | null;
  onClose: () => void;
  onUpdated: () => void;
  onViewDisputes?: (matchId: string) => void;
}

export const MatchDetailDrawer: React.FC<Props> = ({ match, onClose, onUpdated, onViewDisputes }) => {
  const { adminUsers, adminReferees, updateMatch } = useAppStore();
  const { success, error: toastError } = useAdminToast();
  const [local, setLocal] = useState<MatchListing | null>(match);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setLocal(match); }, [match]);

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
            <div>
              <p className="text-[10px] text-gray-500 font-mono uppercase">Lobi Kontrol</p>
              <h2 className="text-sm font-black text-white uppercase">{local.title}</h2>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
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

            <div className="flex flex-wrap gap-2">
              {(['ACTIVE', 'LIVE', 'COMPLETED', 'CANCELLED'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || local.status === s}
                  onClick={() => void handleStatus(s)}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border ${local.status === s ? 'bg-red-500/20 border-red-500/40 text-red-300' : 'border-white/10 text-gray-500 hover:text-white'}`}
                >
                  {s}
                </button>
              ))}
            </div>

            {renderSlots(teamA, false, 'A Takımı', 'border-red-500/20 bg-red-500/5')}
            {teamB.length > 0 && renderSlots(teamB, false, 'B Takımı', 'border-blue-500/20 bg-blue-500/5')}

            {local.awaySlots && local.awaySlots.length > 0 && renderSlots(local.awaySlots, true, 'Deplasman Slotları', 'border-cyan-500/20 bg-cyan-500/5')}
          </div>

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
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
