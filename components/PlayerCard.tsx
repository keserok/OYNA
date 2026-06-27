import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Play, X, Share2, Trophy } from 'lucide-react';
import { PlayerCardData } from '../types';

interface TierTheme {
  cardBg: string; border: string; glow: string;
  overall: string; pos: string; posTag: string;
  name: string; label: string; value: string;
  bar: string; barGlow: string; track: string;
  sep: string; shine: string; holo: boolean; stamp: string;
}

interface PlayerCardProps {
  name: string;
  photo: string;
  position?: string;
  cardData: PlayerCardData;
  onShare?: () => void;
}

// ── Tier Themes ───────────────────────────────────────────────────────────
const TIERS = {
  gold: {
    cardBg: 'linear-gradient(160deg, #2c1d00 0%, #4a2e00 35%, #1a0f00 100%)',
    border: '#d4a84b',
    glow: '0 0 50px rgba(212,168,75,0.4), 0 0 100px rgba(180,130,30,0.15)',
    overall: '#ffe075',
    pos: '#ffd04a',
    posTag: 'rgba(255,200,70,0.12)',
    name: '#fff3cc',
    label: '#c8962a',
    value: '#ffd54f',
    bar: 'linear-gradient(90deg, #f5a623, #ffd700, #fff8b0)',
    barGlow: 'rgba(255,210,60,0.7)',
    track: 'rgba(255,210,60,0.12)',
    sep: 'rgba(212,168,75,0.4)',
    shine: 'rgba(255,240,150,0.3)',
    holo: true,
    stamp: '#c8962a',
  },
  silver: {
    cardBg: 'linear-gradient(160deg, #101018 0%, #1c1e2e 35%, #08080f 100%)',
    border: '#8a96c0',
    glow: '0 0 50px rgba(130,150,200,0.3), 0 0 100px rgba(90,110,160,0.1)',
    overall: '#dde4ff',
    pos: '#b0bcec',
    posTag: 'rgba(150,170,230,0.12)',
    name: '#eef0ff',
    label: '#7888b8',
    value: '#c5cef5',
    bar: 'linear-gradient(90deg, #6070b0, #aab8e8, #dde4ff)',
    barGlow: 'rgba(140,160,220,0.7)',
    track: 'rgba(140,160,220,0.12)',
    sep: 'rgba(130,150,200,0.35)',
    shine: 'rgba(200,220,255,0.2)',
    holo: false,
    stamp: '#7080b0',
  },
  bronze: {
    cardBg: 'linear-gradient(160deg, #1f0e00 0%, #351800 35%, #0f0800 100%)',
    border: '#b07840',
    glow: '0 0 50px rgba(176,120,64,0.35), 0 0 100px rgba(140,88,30,0.12)',
    overall: '#f0c87a',
    pos: '#d49850',
    posTag: 'rgba(200,140,60,0.12)',
    name: '#f5ddb0',
    label: '#8a5c28',
    value: '#d4986a',
    bar: 'linear-gradient(90deg, #8a5224, #c47a3a, #f0c070)',
    barGlow: 'rgba(200,140,60,0.7)',
    track: 'rgba(200,140,60,0.1)',
    sep: 'rgba(176,120,64,0.4)',
    shine: 'rgba(240,200,120,0.25)',
    holo: false,
    stamp: '#8a5c28',
  },
} satisfies Record<string, TierTheme>;

// ── Video Modal ───────────────────────────────────────────────────────────
const VideoModal = ({ statLabel, onClose }: { statLabel: string; onClose: () => void }) => (
  <AnimatePresence>
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/92 p-6 backdrop-blur-lg"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.88, y: 24 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92 }}
        className="w-full max-w-xs bg-[#0d1117] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 flex justify-between items-center border-b border-white/8">
          <div className="flex items-center gap-2">
            <Play size={12} fill="currentColor" className="text-yellow-400" />
            <span className="text-white font-black text-xs uppercase tracking-widest">{statLabel} Analizi</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white">
            <X size={14} />
          </button>
        </div>
        <div className="aspect-video relative bg-black flex items-center justify-center">
          <img src="https://images.unsplash.com/photo-1574629810360-7efbb192453a?auto=format&fit=crop&q=80&w=800" className="absolute inset-0 w-full h-full object-cover opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="z-10 w-14 h-14 rounded-full bg-yellow-400/15 border border-yellow-400/40 flex items-center justify-center backdrop-blur-sm hover:scale-110 cursor-pointer transition-transform">
            <Play size={24} fill="currentColor" className="text-yellow-400 ml-0.5" />
          </div>
          <p className="absolute bottom-3 left-3 z-10 text-[10px] text-white font-bold bg-black/50 px-2 py-1 rounded border border-white/10">OYNA AI Vision™</p>
        </div>
      </motion.div>
    </motion.div>
  </AnimatePresence>
);

// ── Stat Row with bar ─────────────────────────────────────────────────────
interface StatRowProps { label: string; value: number; hasVideo: boolean; theme: TierTheme; onPlay?: () => void; }
const StatRow: React.FC<StatRowProps> = ({ label, value, hasVideo, theme, onPlay }) => {
  const color = value >= 80 ? '#52e88a' : value >= 66 ? '#ffc840' : value >= 50 ? '#ff8c30' : '#ff4d4d';
  return (
    <div
      className={`flex items-center gap-2 ${hasVideo ? 'cursor-pointer' : ''}`}
      onClick={onPlay}
    >
      {/* Label */}
      <span className="text-[9px] font-black uppercase tracking-widest w-7 shrink-0" style={{ color: theme.label }}>
        {label}
      </span>
      {/* Bar */}
      <div className="flex-1 h-[3px] rounded-full" style={{ background: theme.track }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(99, value)}%`,
            background: theme.bar,
            boxShadow: `0 0 6px ${theme.barGlow}`,
          }}
        />
      </div>
      {/* Value */}
      <div className="flex items-center gap-0.5 w-7 justify-end shrink-0">
        {hasVideo && <Play size={6} fill="currentColor" style={{ color: theme.label, opacity: 0.6 }} />}
        <span className="text-[13px] font-black leading-none" style={{ color }}>{value}</span>
      </div>
    </div>
  );
};

// ── Main Card ─────────────────────────────────────────────────────────────
export const PlayerCard: React.FC<PlayerCardProps> = ({ name, photo, position = 'OS', cardData, onShare }) => {
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const tier = (cardData.tier in TIERS ? cardData.tier : 'bronze') as keyof typeof TIERS;
  const t = TIERS[tier] as unknown as TierTheme;

  // 3D tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 280, damping: 28 });
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), { stiffness: 280, damping: 28 });
  const gOpacity = useSpring(0, { stiffness: 280, damping: 28 });
  const gX = useTransform(mx, [-0.5, 0.5], ['10%', '90%']);
  const gY = useTransform(my, [-0.5, 0.5], ['10%', '90%']);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
    gOpacity.set(0.3);
  }, []);
  const onLeave = useCallback(() => { mx.set(0); my.set(0); gOpacity.set(0); }, []);

  const stats = [
    { key: 'shooting', label: 'ŞUT', stat: cardData.stats.shooting },
    { key: 'passing', label: 'PAS', stat: cardData.stats.passing },
    { key: 'physical', label: 'KUV', stat: cardData.stats.physical },
    { key: 'pace', label: 'HIZ', stat: cardData.stats.pace },
    { key: 'dribbling', label: 'DRİ', stat: cardData.stats.dribbling },
    { key: 'defense', label: 'DEF', stat: cardData.stats.defense },
  ];

  const overall = cardData.overall;

  return (
    <>
      <div className="relative w-full max-w-[240px] mx-auto select-none" style={{ perspective: '900px' }}>
        {/* Ambient outer glow */}
        <div className="absolute inset-[-20px] rounded-[40px] pointer-events-none blur-2xl opacity-40"
          style={{ background: `radial-gradient(ellipse, ${t.border}, transparent 70%)` }} />

        <motion.div
          ref={cardRef}
          style={{ rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className="relative w-full"
        >
          {/* Card shell */}
          <div
            className="relative w-full rounded-[24px] overflow-hidden"
            style={{
              aspectRatio: '2 / 3',
              background: t.cardBg,
              boxShadow: t.glow,
              border: `2px solid ${t.border}`,
            }}
          >
            {/* ── Hex texture ─ */}
            <div className="absolute inset-0 z-0 opacity-[0.05] pointer-events-none">
              <svg width="100%" height="100%">
                <defs>
                  <pattern id="hc" width="22" height="38" patternUnits="userSpaceOnUse">
                    <path d="M11 0l11 6.35v12.7L11 25.4 0 19.05V6.35z" fill="none" stroke="white" strokeWidth="0.7" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hc)" />
              </svg>
            </div>

            {/* ── Holo shimmer (gold only) ─ */}
            {t.holo && (
              <motion.div
                className="absolute inset-0 z-10 pointer-events-none mix-blend-color-dodge opacity-[0.12]"
                style={{ background: 'linear-gradient(130deg,#ff006080,#ffb30080,#00ff6080,#007fff80,#bf00ff80)' }}
                animate={{ backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'] }}
                transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
              />
            )}

            {/* ── Sweep shine ─ */}
            <motion.div
              className="absolute inset-0 z-20 pointer-events-none mix-blend-overlay"
              style={{ background: `linear-gradient(110deg, transparent 30%, ${t.shine} 50%, transparent 70%)` }}
              animate={{ x: ['-100%', '120%'] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 6, ease: 'easeInOut' }}
            />

            {/* ── Mouse glare ─ */}
            <motion.div
              className="absolute inset-0 z-20 pointer-events-none rounded-[22px]"
              style={{
                background: useTransform([gX, gY], ([x, y]) =>
                  `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.18) 0%, transparent 55%)`
                ),
                opacity: gOpacity,
              }}
            />

            {/* ── Inner border highlight ─ */}
            <div className="absolute inset-[3px] rounded-[22px] border pointer-events-none z-30 mix-blend-overlay"
              style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

            {/* ═══════════════════════════════════ */}
            {/* ZONE 1 — TOP META (Overall + Pos + Flag) */}
            {/* ═══════════════════════════════════ */}
            <div className="absolute top-4 left-4 z-40 flex flex-col items-center">
              {/* Overall */}
              <span
                className="text-[46px] font-black leading-none tabular-nums"
                style={{ color: t.overall, textShadow: `0 0 20px ${t.border}80` }}
              >
                {overall}
              </span>
              {/* Position badge */}
              <div className="mt-1 px-2 py-[2px] rounded-md"
                style={{ background: t.posTag, border: `1px solid ${t.border}44` }}>
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: t.pos }}>{position}</span>
              </div>
              {/* Small divider */}
              <div className="my-2 w-4 h-px rounded" style={{ background: t.sep }} />
              {/* Flag */}
              <img src="https://flagcdn.com/w40/tr.png" alt="TR"
                className="w-6 h-[16px] rounded-sm object-cover"
                style={{ border: `1px solid ${t.border}44`, boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}
              />
            </div>

            {/* ZONE 1 right — Club badge */}
            <div className="absolute top-4 right-4 z-40 flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: t.posTag, border: `1px solid ${t.border}44` }}>
                <Trophy size={14} fill="currentColor" style={{ color: t.pos }} />
              </div>
              <span className="text-[7px] font-black uppercase tracking-[0.3em]" style={{ color: t.label }}>OYNA</span>
            </div>

            {/* ═══════════════════════════════════ */}
            {/* ── ZONE 2 — PLAYER PHOTO (hero image) ── */}
            {/* Bottom gradient so photo transitions nicely */}
            <div className="absolute bottom-0 left-0 w-full h-[55%] z-20 pointer-events-none"
              style={{ background: `linear-gradient(to top, ${t.cardBg.split(',')[0].replace('linear-gradient(160deg, ', '')} 0%, transparent 100%)` }} />

            <motion.div
              className="absolute top-0 left-0 w-full h-[68%] z-10 pointer-events-none flex items-end justify-center"
              style={{ translateZ: 14 }}
            >
              {!photo || photo === '/player_card_photo.png' || photo.includes('placeholder') ? (
                <div className="w-full h-full flex flex-col items-center justify-center select-none pt-12">
                  <motion.div
                    animate={{ scale: [1, 1.03, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="flex flex-col items-center justify-center"
                  >
                    <span 
                      className="text-5xl font-black italic uppercase tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                      style={{ color: t.overall, textShadow: `0 0 20px ${t.border}80, 0 0 40px ${t.border}30` }}
                    >
                      {name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[7px] font-black uppercase tracking-[0.25em] mt-1.5 opacity-55" style={{ color: t.pos }}>
                      SİLÜET YOK
                    </span>
                  </motion.div>
                </div>
              ) : (
                <img
                  src={photo} alt={name}
                  className="w-[95%] h-full object-contain object-bottom"
                  style={{ filter: 'drop-shadow(0 20px 28px rgba(0,0,0,0.9)) drop-shadow(0 0 1px rgba(0,0,0,0.9))' }}
                  referrerPolicy="no-referrer"
                />
              )}
            </motion.div>

            {/* ═══════════════════════════════════ */}
            {/* ZONE 3 — NAME */}
            {/* ═══════════════════════════════════ */}
            <div className="absolute z-40 w-full text-center" style={{ bottom: '39%' }}>
              <div className="mx-4">
                {/* Decorative line above name */}
                <div className="flex items-center gap-2 mb-1.5 justify-center">
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${t.sep})` }} />
                  <div className="w-1 h-1 rounded-full" style={{ background: t.border }} />
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${t.sep})` }} />
                </div>
                <h2
                  className="text-[14px] font-black uppercase tracking-[0.18em] leading-tight truncate"
                  style={{ color: t.name, textShadow: `0 1px 12px ${t.border}60` }}
                >
                  {name}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 justify-center">
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${t.sep})` }} />
                  <div className="w-1 h-1 rounded-full" style={{ background: t.border }} />
                  <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${t.sep})` }} />
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════ */}
            {/* ZONE 4 — STATS (bottom panel)       */}
            {/* ═══════════════════════════════════ */}
            <div
              className="absolute bottom-0 left-0 w-full z-40 px-4 pb-4"
              style={{ height: '37%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '5px' }}
            >
              {/* Stats divider */}
              <div className="w-full h-px mb-1" style={{ background: `linear-gradient(to right, transparent, ${t.sep}, transparent)` }} />

              {/* Stat rows */}
              <div className="grid grid-cols-2 grid-rows-3 grid-flow-col gap-x-3 gap-y-[6px]">
                {stats.slice(0, 3).map(({ key: sKey, label, stat }) => (
                  <StatRow key={sKey} label={label} value={stat.value} theme={t} hasVideo={false} />
                ))}
                {stats.slice(3).map(({ key: sKey, label, stat }) => (
                  <StatRow key={sKey} label={label} value={stat.value} theme={t} hasVideo={false} />
                ))}
              </div>

              {/* Bottom rule */}
              <div className="w-full h-px mt-1" style={{ background: `linear-gradient(to right, transparent, ${t.sep}, transparent)` }} />
            </div>
          </div>
        </motion.div>

        {/* Share */}
        {onShare && (
          <motion.button
            onClick={onShare}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="mt-5 mx-auto flex items-center gap-2 px-5 py-2 rounded-full text-[11px] font-black uppercase tracking-wide"
            style={{ background: t.posTag, border: `1px solid ${t.border}44`, color: t.name }}
          >
            <Share2 size={12} />
            Kartı Paylaş
          </motion.button>
        )}
      </div>

      {/* AI Vision video özelliği kaldırıldı (Q28). */}
    </>
  );
};
