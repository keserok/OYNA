import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Search, UserCheck, Shuffle, ArrowLeftRight } from 'lucide-react';
import type { PositionSlot, AdminUser } from '../../../types';
import { enrichSlots, collectAssignedIds, normalizeRole, avatarFor } from '../../../shared/lobbyEnrichment';
import { MatchPitch } from '../../../shared/MatchPitch';

// Top Oyna (tüketici) lobisinin AYNI sistemi. Saha + zenginleştirme artık
// paylaşılan tek kaynaktan (shared/MatchPitch + shared/lobbyEnrichment) gelir
// → tüketiciyle birebir, drift yok. Atama/çıkarma admin_assign_to_slot /
// admin_kick_from_slot RPC'lerine bağlı → ana uygulamanın gerçek verisini değiştirir.

interface PlayerPickerProps {
  users: AdminUser[];
  assignedIds: Set<string>;
  busy: boolean;
  onPick: (userId: string) => void;
}

/** Arama yapılabilir oyuncu seçici — kadrodakiler işaretlenir. */
const PlayerPicker: React.FC<PlayerPickerProps> = ({ users, assignedIds, busy, onPick }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    const base = needle
      ? users.filter((u) => u.name.toLocaleLowerCase('tr').includes(needle) || (u.email || '').toLocaleLowerCase('tr').includes(needle))
      : users;
    return [...base]
      .sort((a, b) => (Number(assignedIds.has(a.id)) - Number(assignedIds.has(b.id))) || a.name.localeCompare(b.name, 'tr'))
      .slice(0, 40);
  }, [q, users, assignedIds]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Oyuncu ara (isim / e-posta)…"
          className="w-full h-9 bg-black/40 border border-white/15 rounded-lg pl-8 pr-3 text-xs text-white focus:border-primary/40 focus:outline-none"
        />
      </div>
      <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1 pr-1">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-gray-600 py-4 text-center">Oyuncu bulunamadı</p>
        ) : filtered.map((u) => {
          const assigned = assignedIds.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(u.id)}
              className="w-full flex items-center gap-2.5 p-1.5 rounded-lg bg-black/30 border border-white/5 hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-40 text-left"
            >
              <img src={u.avatar || avatarFor(u.id, u.name)} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{u.name}</p>
                <p className="text-[9px] text-gray-500 truncate">{u.email}</p>
              </div>
              {assigned && <span className="text-[8px] font-bold text-amber-400 border border-amber-500/30 rounded px-1 py-0.5 shrink-0">Kadroda</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface MatchLobbyPitchProps {
  slots: PositionSlot[];
  awaySlots?: PositionSlot[];
  users: AdminUser[];
  busy: boolean;
  format?: string | null;
  captainId?: string | null;
  onAssign: (slotId: string, userId: string, isAway: boolean) => void | Promise<void>;
  onKick: (slotId: string, isAway: boolean) => void | Promise<void>;
  onSwap?: (slotA: string, slotB: string, isAway: boolean) => void | Promise<void>;
}

/** Admin görsel maç lobisi — paylaşılan saha + slot aksiyon paneli + oyuncu seçici. */
export const MatchLobbyPitch: React.FC<MatchLobbyPitchProps> = ({ slots, awaySlots, users, busy, format, captainId, onAssign, onKick, onSwap }) => {
  const hasAway = !!(awaySlots && awaySlots.length > 0);
  const [side, setSide] = useState<'home' | 'away'>('home');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const [swapSource, setSwapSource] = useState<string | null>(null);

  const enrichedHome = useMemo(() => enrichSlots(slots, users, format), [slots, users, format]);
  const enrichedAway = useMemo(() => enrichSlots(awaySlots || [], users, format), [awaySlots, users, format]);
  const assignedIds = useMemo(() => collectAssignedIds(slots, awaySlots), [slots, awaySlots]);

  const activeSlots = side === 'away' && hasAway ? enrichedAway : enrichedHome;
  const isAway = side === 'away' && hasAway;
  const activeSlot = activeSlots.find((s) => s.id === activeSlotId) || null;

  const filled = activeSlots.filter((s) => s.status === 'TAKEN' && s.player).length;
  const total = activeSlots.length;
  const paidCount = activeSlots.filter((s) => s.status === 'TAKEN' && s.player?.paymentStatus === 'PAID').length;

  const handleSlotClick = (slot: PositionSlot) => {
    // Taşı modu: kaynak seçiliyken hedef slota tıklayınca yer değiştir.
    if (swapSource) {
      if (swapSource !== slot.id && onSwap) void onSwap(swapSource, slot.id, isAway);
      setSwapSource(null);
      setActiveSlotId(null);
      return;
    }
    setReplaceMode(false);
    setActiveSlotId((prev) => (prev === slot.id ? null : slot.id));
  };

  const doAssign = async (userId: string) => {
    if (!activeSlot) return;
    await onAssign(activeSlot.id, userId, isAway);
    setActiveSlotId(null);
    setReplaceMode(false);
  };

  const doKick = async () => {
    if (!activeSlot) return;
    await onKick(activeSlot.id, isAway);
    setActiveSlotId(null);
    setReplaceMode(false);
  };

  return (
    <div className="space-y-3">
      {/* Üst bar: taraf seçimi + kadro doluluk */}
      <div className="flex items-center justify-between gap-2">
        {hasAway ? (
          <div className="flex bg-black/40 rounded-xl p-0.5 border border-white/10">
            {(['home', 'away'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setSide(s); setActiveSlotId(null); setSwapSource(null); }}
                className={`px-3 py-1 text-[10px] font-extrabold uppercase rounded-lg transition-colors ${side === s ? 'bg-primary/20 text-primary' : 'text-gray-500 hover:text-white'}`}
              >
                {s === 'home' ? 'Ev Sahibi' : 'Deplasman'}
              </button>
            ))}
          </div>
        ) : <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">Sahaya Tıkla → Oyuncu Ata</div>}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-emerald-500/10 text-emerald-300 border-emerald-500/25">{paidCount} ödedi</span>
          <span className={`text-[11px] font-extrabold px-2 py-1 rounded-lg border ${filled >= total ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'}`}>
            {filled}/{total} dolu
          </span>
        </div>
      </div>

      {swapSource && (
        <div className="flex items-center justify-between gap-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl px-3 py-2">
          <p className="text-[11px] text-cyan-300 font-bold flex items-center gap-1.5"><ArrowLeftRight size={12} /> Taşınıyor — hedef slota tıkla (yer değiştirir)</p>
          <button type="button" onClick={() => setSwapSource(null)} className="text-[10px] text-gray-400 hover:text-white">Vazgeç</button>
        </div>
      )}

      <MatchPitch slots={activeSlots} activeSlotId={swapSource || activeSlotId} onSlotClick={handleSlotClick} showPayment captainId={captainId} />

      {/* Slot aksiyon paneli */}
      {activeSlot && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0D1117] border border-primary/30 rounded-2xl p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white/5 text-gray-300 uppercase">{normalizeRole(activeSlot.role)}</span>
              {activeSlot.player ? (
                <span className="text-xs font-bold text-white truncate">
                  {activeSlot.player.name}
                  {activeSlot.player.paymentStatus && (
                    <span className={`ml-2 text-[8px] font-bold px-1 py-0.5 rounded ${activeSlot.player.paymentStatus === 'PAID' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                      {activeSlot.player.paymentStatus === 'PAID' ? 'ÖDEDİ' : 'BEKLİYOR'}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-gray-500 italic">Boş slot</span>
              )}
            </div>
            <button type="button" onClick={() => { setActiveSlotId(null); setReplaceMode(false); }} className="w-6 h-6 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
              <X size={13} />
            </button>
          </div>

          {activeSlot.status === 'TAKEN' && activeSlot.player && !replaceMode ? (
            <div className="flex gap-1.5">
              <button type="button" disabled={busy} onClick={() => setReplaceMode(true)} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-cyan-500/30 text-cyan-300 text-[11px] font-bold hover:bg-cyan-500/10 disabled:opacity-40">
                <Shuffle size={12} /> Değiştir
              </button>
              {onSwap && (
                <button type="button" disabled={busy} onClick={() => { setSwapSource(activeSlot.id); setActiveSlotId(null); }} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-purple-500/30 text-purple-300 text-[11px] font-bold hover:bg-purple-500/10 disabled:opacity-40">
                  <ArrowLeftRight size={12} /> Taşı
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => void doKick()} className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-red-500/30 text-red-400 text-[11px] font-bold hover:bg-red-500/10 disabled:opacity-40">
                <X size={12} /> Çıkar
              </button>
            </div>
          ) : (
            <>
              {replaceMode && (
                <p className="text-[10px] text-cyan-300/80 flex items-center gap-1"><UserCheck size={11} /> Yeni oyuncu seç — mevcut oyuncunun yerine atanır.</p>
              )}
              <PlayerPicker users={users} assignedIds={assignedIds} busy={busy} onPick={(uid) => void doAssign(uid)} />
            </>
          )}
        </motion.div>
      )}
    </div>
  );
};
