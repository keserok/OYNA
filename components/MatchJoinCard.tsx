import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, Calendar, ChevronRight } from 'lucide-react';
import { MatchListing, PositionSlot } from '../types';
import { useAppStore } from '../store';
import { FORMATIONS, type SquadSize } from '../utils/formations';

// ── Shared helpers (subset from MatchJoin) ───────────────────────────────────

const normalizeRole = (role: string): string => {
  const r = (role || '').toUpperCase();
  if (r === 'GK' || r === 'KL' || r === 'KALECİ' || r === 'K') return 'GK';
  if (r === 'DEF' || r === 'SAV' || r === 'STP' || r === 'STOPER' || r === 'S' || r === 'LB' || r === 'RB' || r === 'CB') return 'DEF';
  if (r === 'MID' || r === 'ORT' || r === 'OS' || r === 'ORTA SAHA' || r === 'M' || r === 'CM' || r === 'CDM' || r === 'CAM') return 'MID';
  if (r === 'FWD' || r === 'HÜC' || r === 'SNT' || r === 'HÜCUM' || r === 'F' || r === 'ST' || r === 'CF' || r === 'LW' || r === 'RW') return 'FWD';
  return 'MID';
};

const ROLE_TR: Record<string, string> = { GK: 'KL', DEF: 'SAV', MID: 'ORT', FWD: 'HÜC' };

const inferSquadSize = (slotCount: number): SquadSize => {
  if (slotCount <= 5) return '5v5';
  if (slotCount <= 6) return '6v6';
  if (slotCount <= 7) return '7v7';
  if (slotCount <= 8) return '8v8';
  if (slotCount <= 9) return '9v9';
  if (slotCount <= 10) return '10v10';
  return '11v11';
};

const applyCanonicalCoords = (slots: PositionSlot[]): PositionSlot[] => {
  if (!slots || slots.length === 0) return [];
  const size = inferSquadSize(slots.length);
  const formation = Object.values(FORMATIONS[size] || {})[0];
  if (!formation) return slots;

  const byRole: Record<string, { x: number; y: number; role: string }[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  formation.forEach(c => { const n = normalizeRole(c.role); if (byRole[n]) byRole[n].push(c); });
  Object.values(byRole).forEach(arr => arr.sort((a, b) => a.x - b.x));

  const slotsByRole: Record<string, PositionSlot[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  slots.forEach(s => { const n = normalizeRole(s.role); if (slotsByRole[n]) slotsByRole[n].push(s); });
  Object.values(slotsByRole).forEach(arr => arr.sort((a, b) => (a.x || 0) - (b.x || 0)));

  const result: PositionSlot[] = [];
  const usedKeys = new Set<string>();

  Object.keys(slotsByRole).forEach(role => {
    slotsByRole[role].forEach((slot, i) => {
      const coord = byRole[role][i];
      if (coord) {
        result.push({ ...slot, x: coord.x, y: coord.y });
        usedKeys.add(`${coord.x},${coord.y}`);
      } else {
        result.push({ ...slot, x: -1, y: -1 });
      }
    });
  });

  const unused = formation.filter(c => !usedKeys.has(`${c.x},${c.y}`));
  let ui = 0;
  return result.map(slot => {
    if (slot.x === -1 && slot.y === -1) {
      const c = unused[ui++];
      return c ? { ...slot, x: c.x, y: c.y } : { ...slot, x: 50, y: 50 };
    }
    return slot;
  });
};

const DIFF_CONFIG: Record<string, { color: string; label: string }> = {
  'Ciddi':     { color: '#FF3B3B', label: 'CİDDİ'     },
  'Taktiksel': { color: '#FFFF00', label: 'TAKTİKSEL' },
  'Rahat':     { color: '#39FF14', label: 'RAHAT'     },
};

// ── Countdown ────────────────────────────────────────────────────────────────

const parseMatchDate = (date: string, time: string): Date | null => {
  try {
    if (date.includes('-')) return new Date(`${date}T${time}:00`);
    const d = new Date();
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    if (date === 'Yarın') d.setDate(d.getDate() + 1);
    return d;
  } catch { return null; }
};

const useCountdown = (date: string, time: string): string => {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const target = parseMatchDate(date, time);
      if (!target) { setLabel('Maç Başladı'); return; }
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setLabel('Maç Başladı'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(h > 0 ? `${h}s ${m}dk` : `${m}dk ${s}sn`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [date, time]);
  return label;
};

// ── MiniPitch ─────────────────────────────────────────────────────────────────

interface MiniPitchProps {
  slots: PositionSlot[];
  currentUserUid: string;
}

const MiniPitch: React.FC<MiniPitchProps> = ({ slots, currentUserUid }) => (
  <div className="relative w-full h-full bg-[#0b1a0d] rounded-xl overflow-hidden">
    {/* Pitch glow */}
    <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/25 via-emerald-950/10 to-transparent pointer-events-none" />
    {/* SVG field lines */}
    <div className="absolute inset-0 pointer-events-none opacity-25">
      <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <g stroke="rgba(255,255,255,0.9)" strokeWidth="6" fill="none" strokeLinecap="round">
          <rect x="10" y="10" width="580" height="980" />
          <line x1="10" y1="500" x2="590" y2="500" />
          <circle cx="300" cy="500" r="80" />
          <circle cx="300" cy="500" r="4" fill="rgba(255,255,255,0.9)" />
          <rect x="150" y="10" width="300" height="160" />
          <circle cx="300" cy="130" r="4" fill="rgba(255,255,255,0.9)" />
          <rect x="150" y="830" width="300" height="160" />
          <circle cx="300" cy="870" r="4" fill="rgba(255,255,255,0.9)" />
        </g>
      </svg>
    </div>
    {/* Slots */}
    {slots.map(slot => {
      const isTaken = slot.status === 'TAKEN';
      const isMe = slot.player?.id === currentUserUid;
      const roleNorm = normalizeRole(slot.role);
      return (
        <div
          key={slot.id}
          className="absolute flex flex-col items-center pointer-events-none"
          style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          {isTaken && slot.player ? (
            <>
              <div className={`w-8 h-8 rounded-full overflow-hidden border-2 shadow-md transition-all ${
                isMe
                  ? 'border-[#39FF14] shadow-[0_0_12px_rgba(57,255,20,0.8)]'
                  : roleNorm === 'GK'
                    ? 'border-orange-400/70'
                    : 'border-white/25'
              }`}>
                <img
                  src={slot.player.avatar || `https://i.pravatar.cc/150?u=${slot.player.id}`}
                  className="w-full h-full object-cover bg-[#0A0E14]"
                  alt=""
                />
                {isMe && <div className="absolute inset-0 bg-[#39FF14]/15" />}
              </div>
              <div className={`mt-1 px-1.5 py-px rounded-full border shadow-sm ${
                isMe
                  ? 'bg-[#39FF14]/90 border-[#39FF14] text-black'
                  : 'bg-black/80 border-white/10 text-white'
              }`}>
                <span className="text-[7px] font-black whitespace-nowrap uppercase block leading-none">
                  {isMe ? 'SEN' : (slot.player.name || '').split(' ')[0]}
                </span>
              </div>
            </>
          ) : (
            <div className="w-7 h-7 rounded-full border-2 border-dashed border-white/15 bg-white/4 flex items-center justify-center">
              <span className="text-[6px] font-bold text-white/25 uppercase">
                {ROLE_TR[roleNorm] || '?'}
              </span>
            </div>
          )}
        </div>
      );
    })}
  </div>
);

// ── MatchJoinCard ─────────────────────────────────────────────────────────────

interface MatchJoinCardProps {
  match: MatchListing;
  currentUserUid: string;
  onOpenLobby: () => void;
}

export const MatchJoinCard: React.FC<MatchJoinCardProps> = ({ match, currentUserUid, onOpenLobby }) => {
  const { userTeams } = useAppStore();

  const homeSlots = useMemo(() => applyCanonicalCoords(match.slots || []), [match.slots]);
  const awaySlots = useMemo(() => applyCanonicalCoords(match.awaySlots || []), [match.awaySlots]);

  const isOnAwayTeam = awaySlots.some(s => s.player?.id === currentUserUid);
  const displaySlots = isOnAwayTeam ? awaySlots : homeSlots;

  const homeTeam = match.homeTeamId ? (userTeams || []).find(t => t.id === match.homeTeamId) : null;
  const awayTeam = match.awayTeamId ? (userTeams || []).find(t => t.id === match.awayTeamId) : null;

  const filledHome = homeSlots.filter(s => s.status === 'TAKEN').length;
  const filledAway = awaySlots.filter(s => s.status === 'TAKEN').length;
  const totalHome = homeSlots.length;
  const totalAway = awaySlots.length;

  const diffConf = DIFF_CONFIG[match.difficulty || ''] || DIFF_CONFIG['Rahat'];
  const countdown = useCountdown(match.date, match.time);
  const isCancelled = match.status === 'CANCELLED';

  return (
    <motion.div
      onClick={isCancelled ? undefined : onOpenLobby}
      whileTap={isCancelled ? {} : { scale: 0.985 }}
      className={`bg-[#12161F] border rounded-[22px] overflow-hidden transition-all ${
        isCancelled
          ? 'border-red-500/15 cursor-default'
          : 'border-white/7 cursor-pointer hover:border-white/12 hover:bg-[#141921]'
      }`}
      style={{
        boxShadow: isCancelled
          ? '0 4px 24px -6px rgba(239,68,68,0.06)'
          : '0 4px 24px -6px rgba(57,255,20,0.06)',
      }}
    >
      {/* ── VS Header ─────────────────────────────────────────────── */}
      <div className="flex items-stretch gap-1.5 p-3 pb-0">
        {/* Home */}
        <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
          !isOnAwayTeam && !isCancelled
            ? 'bg-white/[0.07] border-white/20'
            : 'bg-transparent border-white/5 opacity-60'
        }`}>
          <div className={`w-2 h-2 rounded-full shrink-0 ${homeTeam ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-white shadow-[0_0_5px_rgba(255,255,255,0.5)]'}`} />
          <p className="text-[11px] font-black text-white uppercase italic truncate leading-tight flex-1 min-w-0">
            {match.homeTeamName || homeTeam?.name || 'TAKIM'}
          </p>
          {homeTeam?.logo && (
            <div className="w-6 h-6 rounded-lg shrink-0 overflow-hidden">
              {homeTeam.logo.startsWith('http')
                ? <img src={homeTeam.logo} alt={homeTeam.name} className="w-full h-full object-cover" />
                : <span className="text-sm">{homeTeam.logo}</span>}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center justify-center w-5 shrink-0">
          <div className="w-px h-6 bg-white/10" />
        </div>

        {/* Away */}
        <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
          isOnAwayTeam && !isCancelled
            ? 'bg-red-500/[0.08] border-red-500/25'
            : 'bg-transparent border-white/5 opacity-60'
        }`}>
          {awayTeam?.logo && (
            <div className="w-6 h-6 rounded-lg shrink-0 overflow-hidden">
              {awayTeam.logo.startsWith('http')
                ? <img src={awayTeam.logo} alt={awayTeam.name} className="w-full h-full object-cover" />
                : <span className="text-sm">{awayTeam.logo}</span>}
            </div>
          )}
          <p className={`text-[11px] font-black uppercase italic truncate leading-tight flex-1 min-w-0 text-right ${
            (match.awayTeamName || awayTeam?.name) ? 'text-white' : 'text-red-400'
          }`}>
            {match.awayTeamName || awayTeam?.name || 'TAKIM'}
          </p>
          <div className="w-2 h-2 rounded-full shrink-0 bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]" />
        </div>
      </div>

      {/* ── Pitch + Info ───────────────────────────────────────────── */}
      <div className="flex gap-2.5 p-3">
        {/* Mini Pitch */}
        <div className="relative flex-1" style={{ aspectRatio: '3/4', minHeight: 185, maxHeight: 240 }}>
          <MiniPitch slots={displaySlots} currentUserUid={currentUserUid} />
          {/* Side label */}
          <div className="absolute top-2 left-2 bg-black/65 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/8">
            <span className="text-[7px] font-black text-white/50 uppercase tracking-wider">
              {isOnAwayTeam ? 'DEPLASMAN' : 'EV SAHİBİ'}
            </span>
          </div>
          {/* Slot fill indicator */}
          <div className="absolute bottom-2 left-2 bg-black/65 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/8">
            <span className="text-[8px] font-black text-white/60 tabular-nums">
              {isOnAwayTeam ? filledAway : filledHome}/{isOnAwayTeam ? totalAway : totalHome}
            </span>
          </div>
        </div>

        {/* Info panel */}
        <div className="w-[118px] flex flex-col justify-between py-0.5">
          {/* Match name & location */}
          <div>
            <p className="text-[12px] font-black text-white italic uppercase leading-tight tracking-tight line-clamp-2 mb-2">
              {match.title || match.location}
            </p>
            <div className="space-y-1.5">
              <div className="flex items-start gap-1.5">
                <MapPin size={9} className="text-[#39FF14] mt-0.5 shrink-0" />
                <span className="text-[9px] font-bold text-white/55 leading-tight">{match.location}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={9} className="text-white/30 shrink-0" />
                <span className="text-[9px] font-bold text-white/45">{match.time}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={9} className="text-white/30 shrink-0" />
                <span className="text-[9px] font-bold text-white/45">{match.date}</span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1 mt-2">
            <span
              className="text-[8px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md border"
              style={{ color: diffConf.color, borderColor: diffConf.color + '40', background: diffConf.color + '10' }}
            >
              {diffConf.label}
            </span>
            <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-white/5 border border-white/8 text-white/45">
              {match.format || inferSquadSize((match.slots || []).length)}
            </span>
            {match.price ? (
              <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-[#FFFF00]/8 border border-[#FFFF00]/15 text-[#FFFF00]">
                ₺{match.price}
              </span>
            ) : null}
          </div>

          {/* Countdown */}
          {!isCancelled && countdown && (
            <div className="mt-2.5 pt-2 border-t border-white/5">
              <p className="text-[7px] font-black text-[#FFFF00] tracking-widest uppercase">KALAN SÜRE</p>
              <p className="text-[12px] font-black text-white tabular-nums mt-0.5 leading-none">{countdown}</p>
            </div>
          )}
          {isCancelled && (
            <div className="mt-2.5 pt-2 border-t border-red-500/10">
              <p className="text-[7px] font-black text-red-500 tracking-widest uppercase">MAÇ İPTAL</p>
              <p className="text-[9px] font-bold text-white/40 mt-0.5 leading-tight">
                {match.refundStatus || 'Ücret alınmadı'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── CTA Footer ────────────────────────────────────────────── */}
      {!isCancelled && (
        <div className="px-3 pb-3 pt-0">
          <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#39FF14]/8 border border-[#39FF14]/18 hover:bg-[#39FF14]/14 transition-all">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#39FF14]">LOBİYE GİT</span>
            <ChevronRight size={13} className="text-[#39FF14]" />
          </div>
        </div>
      )}
    </motion.div>
  );
};
