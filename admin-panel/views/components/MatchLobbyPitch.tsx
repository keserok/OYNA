import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Search, UserCheck, Shuffle, Star } from 'lucide-react';
import type { PositionSlot, Player, AdminUser } from '../../../types';
import { FORMATIONS, type SquadSize } from '../../../utils/formations';

// Top Oyna (tüketici) lobisindeki görsel saha mantığının admin karşılığı.
// DB'deki slotlar minimaldir ({id,status,userId,player?}); x/y/role taşımaz.
// Bu yüzden tüketicideki gibi kanonik formasyon koordinatları uygulanır ve
// oyuncular userId üzerinden çözülür. Atama/çıkarma admin_assign_to_slot /
// admin_kick_from_slot RPC'lerine bağlıdır → ana uygulamanın (matches.slots)
// gerçek verisini değiştirir.

const ROLE_SHORT: Record<string, string> = { GK: 'KL', DEF: 'SAV', MID: 'ORT', FWD: 'HÜC' };

export function normalizeRole(role?: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  const r = (role || '').toUpperCase();
  if (r === 'GK' || r.includes('KALE') || r === 'KL') return 'GK';
  if (r === 'DEF' || r.startsWith('D') || r.includes('BACK') || r === 'SAV' || r === 'CB' || r === 'LB' || r === 'RB') return 'DEF';
  if (r === 'FWD' || r === 'ST' || r === 'CF' || r.includes('FOR') || r === 'HÜC' || r === 'LW' || r === 'RW') return 'FWD';
  return 'MID';
}

const pravatar = (seed: string) => `https://i.pravatar.cc/150?u=${seed}`;

function inferSquadSize(slotCount: number): SquadSize {
  if (slotCount <= 5) return '5v5';
  if (slotCount <= 6) return '6v6';
  if (slotCount <= 7) return '7v7';
  if (slotCount <= 8) return '8v8';
  if (slotCount <= 9) return '9v9';
  if (slotCount <= 10) return '10v10';
  return '11v11';
}

/** Tüketici (MatchJoin) ile birebir: rol grubu + ikinci-geçiş ile kanonik x/y/role ata. */
function applyCanonicalCoords(slots: PositionSlot[]): PositionSlot[] {
  if (!slots || slots.length === 0) return [];
  const formationsForSize = FORMATIONS[inferSquadSize(slots.length)];
  if (!formationsForSize) return slots;
  const firstFormation = Object.values(formationsForSize)[0];
  if (!firstFormation) return slots;

  const canonicalByRole: Record<string, { x: number; y: number; role: string }[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  firstFormation.forEach((c) => { const n = normalizeRole(c.role); if (canonicalByRole[n]) canonicalByRole[n].push(c); });
  Object.keys(canonicalByRole).forEach((k) => canonicalByRole[k].sort((a, b) => a.x - b.x));

  const slotsByRole: Record<string, PositionSlot[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  slots.forEach((s) => { const n = normalizeRole(s.role); if (slotsByRole[n]) slotsByRole[n].push(s); });
  Object.keys(slotsByRole).forEach((k) => slotsByRole[k].sort((a, b) => (a.x || 0) - (b.x || 0)));

  const result: PositionSlot[] = [];
  const usedKeys = new Set<string>();
  Object.keys(slotsByRole).forEach((role) => {
    slotsByRole[role].forEach((slot, i) => {
      const coord = canonicalByRole[role][i];
      if (coord) { result.push({ ...slot, role: slot.role || coord.role, x: coord.x, y: coord.y }); usedKeys.add(`${coord.x},${coord.y}`); }
      else result.push({ ...slot, x: -1, y: -1 });
    });
  });
  const unused = firstFormation.filter((c) => !usedKeys.has(`${c.x},${c.y}`));
  let ui = 0;
  return result.map((slot) => {
    if (slot.x === -1 && slot.y === -1) {
      const coord = unused[ui++];
      if (coord) return { ...slot, role: slot.role || coord.role, x: coord.x, y: coord.y };
      const orig = slots.find((s) => s.id === slot.id);
      return { ...slot, role: slot.role || orig?.role || 'MID', x: orig?.x || 50, y: orig?.y || 50 };
    }
    return slot;
  });
}

/** Kanonik koordinat + gerçek oyuncu çözümü (userId/player.id → adminUsers). */
function enrichSlots(slots: PositionSlot[], users: AdminUser[]): PositionSlot[] {
  return applyCanonicalCoords(slots).map((slot) => {
    if (slot.status !== 'TAKEN') return slot;
    const uid = slot.player?.id || (slot as unknown as { userId?: string }).userId;
    const u = uid ? users.find((x) => x.id === uid) : undefined;
    if (u) {
      return { ...slot, player: { id: u.id, name: u.name || 'Oyuncu', avatar: u.avatar || pravatar(u.id), rating: u.rating || 5, position: slot.role, x: slot.x, y: slot.y } as Player };
    }
    if (slot.player?.name) return { ...slot, player: { ...slot.player, position: slot.role, x: slot.x, y: slot.y } as Player };
    if (uid) return { ...slot, player: { id: uid, name: 'Oyuncu', avatar: pravatar(uid), rating: 5, position: slot.role, x: slot.x, y: slot.y } as Player };
    return slot;
  });
}

/** Atanmış gerçek oyuncu id'leri (ham slotlardan — userId dahil). */
function collectAssignedIds(...groups: (PositionSlot[] | undefined)[]): Set<string> {
  const ids = new Set<string>();
  for (const g of groups) for (const s of g || []) {
    const uid = s.player?.id || (s as unknown as { userId?: string }).userId;
    if (uid) ids.add(uid);
  }
  return ids;
}

const roleAccent = (role: string, taken: boolean): string => {
  const n = normalizeRole(role);
  if (taken) return n === 'GK' ? 'border-orange-400' : 'border-white/25';
  return 'border-white/25';
};

interface PitchFieldProps {
  slots: PositionSlot[];
  activeSlotId: string | null;
  onSlotClick: (slot: PositionSlot) => void;
}

/** Saf görsel saha — SVG çizgileri + x/y% ile konumlanmış slotlar. */
const PitchField: React.FC<PitchFieldProps> = ({ slots, activeSlotId, onSlotClick }) => (
  <div
    className="relative w-full max-w-[360px] mx-auto rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
    style={{ aspectRatio: '600 / 1000', background: 'linear-gradient(165deg,#0c2a16 0%,#0a1f12 55%,#081a0f 100%)' }}
  >
    {/* Çim deseni */}
    <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, #ffffff 0px, #ffffff 2px, transparent 2px, transparent 56px)' }} />
    {/* Saha çizgileri */}
    <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <g stroke="rgba(255,255,255,0.35)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <rect x="10" y="10" width="580" height="980" />
        <line x1="10" y1="500" x2="590" y2="500" />
        <circle cx="300" cy="500" r="80" />
        <circle cx="300" cy="500" r="4" fill="rgba(255,255,255,0.35)" />
        <rect x="150" y="10" width="300" height="160" />
        <rect x="150" y="830" width="300" height="160" />
        <path d="M 220 170 A 80 80 0 0 0 380 170" />
        <path d="M 220 830 A 80 80 0 0 1 380 830" />
      </g>
    </svg>

    {slots.map((slot) => {
      const taken = slot.status === 'TAKEN' && !!slot.player;
      const isActive = activeSlotId === slot.id;
      const player = slot.player;
      return (
        <div
          key={slot.id}
          className="absolute w-12 h-12 flex items-center justify-center z-10"
          style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <button type="button" onClick={() => onSlotClick(slot)} className="w-full h-full rounded-full focus:outline-none cursor-pointer">
            <motion.div whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }} className="relative w-full h-full flex flex-col items-center justify-center">
              {taken && player ? (
                <>
                  <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 shadow-lg transition-all ${roleAccent(slot.role, true)} ${isActive ? 'ring-2 ring-[#39FF14] shadow-[0_0_16px_rgba(57,255,20,0.7)]' : ''}`}>
                    <img src={player.avatar || `https://i.pravatar.cc/150?u=${player.id}`} alt={player.name || 'Oyuncu'} className="w-full h-full object-cover bg-[#0A0E14]" />
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-black/90 px-1.5 py-0.5 rounded-full border border-white/10 max-w-[64px] z-20 pointer-events-none">
                    <span className="text-[8px] font-black text-white whitespace-nowrap uppercase truncate block">{(player.name || 'Oyuncu').split(' ')[0]}</span>
                  </div>
                </>
              ) : (
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-lg transition-all relative backdrop-blur-md ${
                  isActive ? 'bg-[#39FF14] border-white text-black shadow-[0_0_22px_rgba(57,255,20,0.85)] scale-110' : 'bg-black/45 border-white/25 text-white/70 hover:border-[#39FF14]/60'
                }`}>
                  <span className="text-[10px] font-black uppercase tracking-wider leading-none">{ROLE_SHORT[normalizeRole(slot.role)]}</span>
                  <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-black flex items-center justify-center border border-black shadow-md z-20 ${isActive ? 'bg-white' : 'bg-[#39FF14]'}`}>
                    <Plus size={9} strokeWidth={3} />
                  </div>
                </div>
              )}
            </motion.div>
          </button>
        </div>
      );
    })}
  </div>
);

interface PlayerPickerProps {
  users: AdminUser[];
  assignedIds: Set<string>;
  busy: boolean;
  onPick: (userId: string) => void;
}

/** Arama yapılabilir oyuncu seçici — atanmış oyuncular ◑ işaretlenir. */
const PlayerPicker: React.FC<PlayerPickerProps> = ({ users, assignedIds, busy, onPick }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    const base = needle
      ? users.filter((u) => u.name.toLocaleLowerCase('tr').includes(needle) || (u.email || '').toLocaleLowerCase('tr').includes(needle))
      : users;
    // atanmamışlar üstte, sonra puana göre
    return [...base]
      .sort((a, b) => (Number(assignedIds.has(a.id)) - Number(assignedIds.has(b.id))) || (b.rating - a.rating))
      .slice(0, 40);
  }, [q, users, assignedIds]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Oyuncu ara (isim / e-posta)…"
          className="w-full h-9 bg-black/40 border border-white/15 rounded-lg pl-8 pr-3 text-xs text-white focus:border-[#39FF14]/40 focus:outline-none"
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
              className="w-full flex items-center gap-2.5 p-1.5 rounded-lg bg-black/30 border border-white/5 hover:border-[#39FF14]/40 hover:bg-[#39FF14]/5 transition-colors disabled:opacity-40 text-left"
            >
              <img src={u.avatar || `https://i.pravatar.cc/100?u=${u.id}`} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{u.name}</p>
                <p className="text-[9px] text-gray-500 truncate">{u.email}</p>
              </div>
              <span className="flex items-center gap-0.5 text-[10px] font-black text-yellow-400 shrink-0"><Star size={10} />{Number(u.rating).toFixed(1)}</span>
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
  onAssign: (slotId: string, userId: string, isAway: boolean) => void | Promise<void>;
  onKick: (slotId: string, isAway: boolean) => void | Promise<void>;
}

/** Admin görsel maç lobisi — saha + slot aksiyon paneli + oyuncu seçici. */
export const MatchLobbyPitch: React.FC<MatchLobbyPitchProps> = ({ slots, awaySlots, users, busy, onAssign, onKick }) => {
  const hasAway = !!(awaySlots && awaySlots.length > 0);
  const [side, setSide] = useState<'home' | 'away'>('home');
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);

  const enrichedHome = useMemo(() => enrichSlots(slots, users), [slots, users]);
  const enrichedAway = useMemo(() => enrichSlots(awaySlots || [], users), [awaySlots, users]);
  const assignedIds = useMemo(() => collectAssignedIds(slots, awaySlots), [slots, awaySlots]);

  const activeSlots = side === 'away' && hasAway ? enrichedAway : enrichedHome;
  const isAway = side === 'away' && hasAway;
  const activeSlot = activeSlots.find((s) => s.id === activeSlotId) || null;

  const filled = activeSlots.filter((s) => s.status === 'TAKEN' && s.player).length;
  const total = activeSlots.length;

  const handleSlotClick = (slot: PositionSlot) => {
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
                onClick={() => { setSide(s); setActiveSlotId(null); }}
                className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-colors ${side === s ? 'bg-[#39FF14]/20 text-[#39FF14]' : 'text-gray-500 hover:text-white'}`}
              >
                {s === 'home' ? 'Ev Sahibi' : 'Deplasman'}
              </button>
            ))}
          </div>
        ) : <div className="text-[10px] font-black uppercase tracking-widest text-gray-500">Sahaya Tıkla → Oyuncu Ata</div>}
        <span className={`text-[11px] font-black px-2 py-1 rounded-lg border ${filled >= total ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'}`}>
          {filled}/{total} dolu
        </span>
      </div>

      <PitchField slots={activeSlots} activeSlotId={activeSlotId} onSlotClick={handleSlotClick} />

      {/* Slot aksiyon paneli */}
      {activeSlot && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-[#0D1117] border border-[#39FF14]/30 rounded-2xl p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/5 text-gray-300 uppercase">{normalizeRole(activeSlot.role)}</span>
              {activeSlot.player ? (
                <span className="text-xs font-bold text-white truncate">{activeSlot.player.name}</span>
              ) : (
                <span className="text-xs text-gray-500 italic">Boş slot</span>
              )}
            </div>
            <button type="button" onClick={() => { setActiveSlotId(null); setReplaceMode(false); }} className="w-6 h-6 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0">
              <X size={13} />
            </button>
          </div>

          {activeSlot.status === 'TAKEN' && activeSlot.player && !replaceMode ? (
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setReplaceMode(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-cyan-500/30 text-cyan-300 text-[11px] font-bold hover:bg-cyan-500/10 disabled:opacity-40">
                <Shuffle size={12} /> Değiştir
              </button>
              <button type="button" disabled={busy} onClick={() => void doKick()} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-500/30 text-red-400 text-[11px] font-bold hover:bg-red-500/10 disabled:opacity-40">
                <X size={12} /> Slottan Çıkar
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
