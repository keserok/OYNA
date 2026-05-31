import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Wifi, ChevronDown, X, Check, MapPin, Calendar, Clock, Plus, Star, Shield } from 'lucide-react';
import { db, auth } from '../supabaseAuth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SlotPlayer { id: string; name: string; avatar: string; role: string; rating: number; }
interface TacticSlot { id: string; role: string; x: number; y: number; player?: SlotPlayer; archetype?: string; }

// ─── Formations (Extracted from Studio.tsx) ───────────────────────────────────
const FORMATIONS: Record<string, TacticSlot[]> = {
  '2-3-1': [
    { id:'s1', x:50, y:90, role:'GK' },
    { id:'s2', x:25, y:72, role:'DEF' }, { id:'s3', x:75, y:72, role:'DEF' },
    { id:'s4', x:20, y:48, role:'MID' }, { id:'s5', x:50, y:48, role:'MID' }, { id:'s6', x:80, y:48, role:'MID' },
    { id:'s7', x:50, y:20, role:'FWD' },
  ],
  '3-2-1': [
    { id:'s1', x:50, y:90, role:'GK' },
    { id:'s2', x:20, y:72, role:'DEF' }, { id:'s3', x:50, y:72, role:'DEF' }, { id:'s4', x:80, y:72, role:'DEF' },
    { id:'s5', x:35, y:48, role:'MID' }, { id:'s6', x:65, y:48, role:'MID' },
    { id:'s7', x:50, y:20, role:'FWD' },
  ],
  '2-2-2': [
    { id:'s1', x:50, y:90, role:'GK' },
    { id:'s2', x:30, y:72, role:'DEF' }, { id:'s3', x:70, y:72, role:'DEF' },
    { id:'s4', x:30, y:48, role:'MID' }, { id:'s5', x:70, y:48, role:'MID' },
    { id:'s6', x:35, y:20, role:'FWD' }, { id:'s7', x:65, y:20, role:'FWD' },
  ],
  '1-3-2': [
    { id:'s1', x:50, y:90, role:'GK' },
    { id:'s2', x:50, y:72, role:'DEF' },
    { id:'s3', x:20, y:48, role:'MID' }, { id:'s4', x:50, y:48, role:'MID' }, { id:'s5', x:80, y:48, role:'MID' },
    { id:'s6', x:35, y:20, role:'FWD' }, { id:'s7', x:65, y:20, role:'FWD' },
  ],
};

const MOCK_SQUAD: SlotPlayer[] = [
  { id:'p1', name:'Kerem Y.',  avatar:'https://api.dicebear.com/7.x/avataaars/svg?seed=Kerem',  role:'FWD', rating:83 },
  { id:'p2', name:'Ahmet K.', avatar:'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmet',  role:'MID', rating:78 },
  { id:'p3', name:'Mert Ş.',  avatar:'https://api.dicebear.com/7.x/avataaars/svg?seed=Mert',   role:'DEF', rating:80 },
  { id:'p4', name:'Burak D.', avatar:'https://api.dicebear.com/7.x/avataaars/svg?seed=Burak',  role:'GK',  rating:75 },
  { id:'p5', name:'Can Ö.',   avatar:'https://api.dicebear.com/7.x/avataaars/svg?seed=Can',    role:'FWD', rating:81 },
  { id:'p6', name:'Emre B.',  avatar:'https://api.dicebear.com/7.x/avataaars/svg?seed=Emre',   role:'MID', rating:74 },
  { id:'p7', name:'Sinan T.', avatar:'https://api.dicebear.com/7.x/avataaars/svg?seed=Sinan',  role:'DEF', rating:79 },
];

interface LiveTacticBoardProps { matchId: string; }

const LiveTacticBoard: React.FC<LiveTacticBoardProps> = ({ matchId }) => {
  const [formation, setFormation] = useState('2-3-1');
  const [slots, setSlots] = useState<TacticSlot[]>(FORMATIONS['2-3-1']);
  const [dragging, setDragging] = useState<string | null>(null);
  const [selectModal, setSelectModal] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [lastEditor, setLastEditor] = useState<string | null>(null);
  const [showFormPicker, setShowFormPicker] = useState(false);
  const pitchRef = useRef<HTMLDivElement>(null);
  const docRef = doc(db, 'matchTactics', matchId);

  // ── Firestore real-time listener ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(docRef, snap => {
      if (snap.exists()) {
        const d = snap.data();
        setFormation(d.formation);
        setSlots(JSON.parse(d.slots));
        setLastEditor(d.editorName || null);
        setSynced(true);
      }
    }, () => setSynced(false));
    return () => unsub();
  }, [matchId]);

  const push = async (newFormation: string, newSlots: TacticSlot[]) => {
    try {
      await setDoc(docRef, {
        formation: newFormation,
        slots: JSON.stringify(newSlots),
        editorName: auth.currentUser?.displayName || 'Sen',
        updatedAt: Date.now(),
      }, { merge: true });
      setSynced(true);
    } catch { setSynced(false); }
  };

  const changeFormation = (f: string) => {
    const base = FORMATIONS[f].map(slot => ({ ...slot }));
    slots.forEach(old => {
      const match = base.find(b => b.id === old.id);
      if (match && old.player) match.player = old.player;
    });
    setFormation(f);
    setSlots(base);
    push(f, base);
    setShowFormPicker(false);
  };

  const onPointerDown = (e: React.PointerEvent, slotId: string) => {
    if (!(slots.find(s => s.id === slotId)?.player)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(slotId);
  };

  const rafRef = useRef<number | null>(null);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !pitchRef.current) return;
    const rect = pitchRef.current.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
    
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setSlots(prev => prev.map(s => s.id === dragging ? { ...s, x, y } : s));
    });
  };

  const onPointerUp = () => {
    if (dragging) { push(formation, slots); setDragging(null); }
  };

  const assignPlayer = (player: SlotPlayer) => {
    if (!selectModal) return;
    const updated = slots.map(s => ({
      ...s,
      player: s.player?.id === player.id ? undefined : s.player,
    })).map(s => s.id === selectModal ? { ...s, player } : s);
    setSlots(updated);
    push(formation, updated);
    setSelectModal(null);
  };

  const removePlayer = (slotId: string) => {
    const updated = slots.map(s => s.id === slotId ? { ...s, player: undefined } : s);
    setSlots(updated);
    push(formation, updated);
    setSelectModal(null);
  };

  const assignedIds = slots.filter(s => s.player).map(s => s.player!.id);
  const bench = MOCK_SQUAD.filter(p => !assignedIds.includes(p.id));

  return (
    <div className="flex flex-col gap-4">
      
      {/* ── Match Info Header (Date, Time, Location) ───────────────────────── */}
      <div className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-[#39FF14] to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
             <Shield size={24} className="text-black" />
          </div>
          <div>
            <h2 className="text-white font-black text-sm uppercase tracking-widest flex items-center gap-1"><MapPin size={14} className="text-blue-400"/> Vadi Spor Tesisleri</h2>
            <div className="flex items-center gap-2 mt-1">
               <span className="bg-white/10 text-gray-300 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"><Calendar size={10} /> 12 Mayıs Cuma</span>
               <span className="bg-[#39FF14]/20 text-[#39FF14] text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1"><Clock size={10} /> 21:00</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${synced ? 'bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.8)]' : 'bg-red-500'} animate-pulse`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {synced ? 'Canlı Eşzamanlı' : 'Bağlantı Yok'}
          </span>
        </div>
        {/* Formation picker */}
        <button
          onClick={() => setShowFormPicker(v => !v)}
          className="flex items-center gap-2 bg-blue-500/20 text-blue-400 border border-blue-500/50 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-blue-500/30 transition-colors"
        >
          {formation} <ChevronDown size={14} />
        </button>
      </div>

      <AnimatePresence>
        {showFormPicker && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex flex-wrap gap-2"
          >
            {Object.keys(FORMATIONS).map(f => (
              <button
                key={f}
                onClick={() => changeFormation(f)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                  formation === f
                    ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                    : 'bg-white/5 text-gray-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pitch Area (From Studio.tsx Gerçek Mode) ────────────────────────── */}
      <div
        ref={pitchRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className="relative w-full aspect-[3/4] bg-[#0B2815] rounded-[24px] border-4 border-[#161B22] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] overflow-hidden"
      >
        {/* Grass Stripes */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>

        {/* Pitch Markings — viewBox matches 3:4 aspect ratio for perfect symmetry */}
        <div className="absolute inset-0 pointer-events-none opacity-40">
            <svg viewBox="0 0 600 800" preserveAspectRatio="xMidYMid meet" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    {/* Outer boundary */}
                    <rect x="20" y="20" width="560" height="760" />
                    {/* Center line */}
                    <line x1="20" y1="400" x2="580" y2="400" />
                    {/* Center circle */}
                    <circle cx="300" cy="400" r="70" />
                    {/* Center dot */}
                    <circle cx="300" cy="400" r="3" fill="white" />

                    {/* Top penalty area */}
                    <rect x="130" y="20" width="340" height="120" />
                    {/* Top goal area */}
                    <rect x="210" y="20" width="180" height="45" />
                    {/* Top penalty dot */}
                    <circle cx="300" cy="100" r="3" fill="white" />
                    {/* Top penalty arc */}
                    <path d="M 230 140 A 70 70 0 0 0 370 140" />

                    {/* Bottom penalty area */}
                    <rect x="130" y="660" width="340" height="120" />
                    {/* Bottom goal area */}
                    <rect x="210" y="735" width="180" height="45" />
                    {/* Bottom penalty dot */}
                    <circle cx="300" cy="700" r="3" fill="white" />
                    {/* Bottom penalty arc */}
                    <path d="M 230 660 A 70 70 0 0 1 370 660" />

                    {/* Corner arcs */}
                    <path d="M 20 50 A 30 30 0 0 0 50 20" />
                    <path d="M 550 20 A 30 30 0 0 0 580 50" />
                    <path d="M 20 750 A 30 30 0 0 1 50 780" />
                    <path d="M 580 750 A 30 30 0 0 0 550 780" />
                </g>
            </svg>
        </div>

        {/* Slots */}
        {slots.map(slot => (
          <div
            key={slot.id}
            onPointerDown={e => slot.player ? onPointerDown(e, slot.id) : undefined}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 z-20 ${slot.player ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          >
            <div className="relative flex flex-col items-center">
              {slot.player ? (
                <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`relative w-12 h-12 rounded-full border-2 flex items-center justify-center shadow-[0_4px_15px_rgba(0,0,0,0.5)] ${slot.role === 'GK' ? 'bg-gradient-to-br from-orange-400 to-orange-600 border-orange-300' : 'bg-gradient-to-br from-[#1e2532] to-[#11151c] border-white/30'}`}
                >
                    {/* Replaced initial with image for more personal feel like original join */}
                    {slot.player.avatar ? (
                        <img src={slot.player.avatar} className="w-full h-full rounded-full object-cover" alt={slot.player.name}/>
                    ) : (
                        <span className="text-white font-black text-sm drop-shadow-md">{slot.player.name.charAt(0)}</span>
                    )}
                </motion.div>
              ) : (
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => !dragging && setSelectModal(slot.id)}
                    className={`relative w-12 h-12 rounded-full border-2 border-dashed flex items-center justify-center bg-black/20 backdrop-blur-sm transition-colors ${slot.role === 'GK' ? 'border-orange-500/50 text-orange-500 hover:border-orange-400' : 'border-blue-500/50 text-blue-400/70 hover:border-blue-400 hover:text-blue-400'}`}
                >
                    <Plus size={20} />
                </motion.button>
              )}

              {slot.player && (
                 <div className="absolute top-full mt-1 flex flex-col items-center pointer-events-none">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-black/80 text-white whitespace-nowrap border border-white/10 shadow-sm">
                        {slot.player.name.split(' ')[0]}
                    </span>
                 </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Other Players (Kadrodaki Diğer İnsanlar) ───────────────────────── */}
      {bench.length > 0 && (
        <div className="bg-[#161B22] border border-white/5 rounded-2xl p-4">
          <p className="text-xs font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
            <Users size={16} className="text-blue-400" /> KADRODAKİ DİĞER İNSANLAR
          </p>
          <div className="grid grid-cols-1 gap-2">
            {bench.map(p => (
              <div
                key={p.id}
                onClick={() => {
                  const empty = slots.find(s => !s.player);
                  if (empty) {
                    const updated = slots.map(s => s.id === empty.id ? { ...s, player: p } : s);
                    setSlots(updated);
                    push(formation, updated);
                  }
                }}
                className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 hover:border-blue-500/50 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-800">
                  <img src={p.avatar} className="w-full h-full object-cover" alt={p.name} />
                </div>
                <div className="flex-1">
                   <h4 className="text-white font-bold text-sm">{p.name}</h4>
                   <div className="flex items-center gap-2 mt-0.5">
                       <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/10 text-gray-300">{p.role}</span>
                       <span className="text-[9px] font-bold text-yellow-400 flex items-center gap-0.5"><Star size={10} className="fill-current"/> {p.rating}</span>
                   </div>
                </div>
                <div className="w-8 h-8 rounded-full border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Plus size={16} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Player select modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {selectModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col"
            onClick={() => setSelectModal(null)}
          >
            <div className="flex-1 overflow-y-auto p-6 pt-20" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-widest">Oyuncu Seç</h2>
                    <p className="text-xs font-mono text-blue-400">Takım Arkadaşları</p>
                 </div>
                 <div className="flex items-center gap-2">
                    {slots.find(s => s.id === selectModal)?.player && (
                        <button
                        onClick={() => removePlayer(selectModal)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold"
                        >
                        Kaldır
                        </button>
                    )}
                    <button onClick={() => setSelectModal(null)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
                        <X size={20} />
                    </button>
                 </div>
              </div>

              <div className="space-y-3">
                {MOCK_SQUAD.map(player => {
                  const isAssigned = assignedIds.includes(player.id) && slots.find(s => s.id === selectModal)?.player?.id !== player.id;
                  const isCurrent = slots.find(s => s.id === selectModal)?.player?.id === player.id;
                  return (
                    <button
                      key={player.id}
                      onClick={() => !isAssigned && assignPlayer(player)}
                      disabled={isAssigned}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                        isCurrent
                          ? 'bg-blue-500/20 border-blue-500'
                          : isAssigned
                          ? 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                          : 'bg-[#161B22] border-white/5 hover:border-blue-500/50'
                      }`}
                    >
                      <img src={player.avatar} className="w-12 h-12 rounded-full bg-gray-800" alt={player.name} />
                      <div className="flex-1">
                        <h4 className="text-white font-bold text-sm">{player.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-white/10 text-gray-300">{player.role}</span>
                            <span className="text-[10px] font-bold text-yellow-400 flex items-center gap-0.5"><Star size={10} className="fill-current"/> {player.rating}</span>
                        </div>
                      </div>
                      {isCurrent && <Check size={20} className="text-blue-500" />}
                      {isAssigned && !isCurrent && <span className="text-[10px] text-gray-500 font-bold uppercase">Sahada</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LiveTacticBoard;
