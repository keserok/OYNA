import React, { useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Share2, Trophy } from 'lucide-react';
import { skillBand } from '../utils/skillBand';

// ════════════════════════════════════════════════════════════════════════
// OYUNCU KARTI — NÖTR SÜRÜM (puan sistemi sökümü, karar F3=b)
// OVR sayısı ve gold/silver/bronze tier'ı KALKTI. Kart artık yalnız kimlik
// taşır: pozisyon + maç sayısı/galibiyet + (varsa) beyan edilen seviye bandı.
// Tek nötr tema — eski "rookie" cyber-slate paleti; kimseye kazanılmamış
// bir parlaklık atfetmez.
// ════════════════════════════════════════════════════════════════════════

interface PlayerCardProps {
  name: string;
  photo: string;
  position?: string;
  matchCount: number;
  winCount: number;
  /** Beyan edilen seviye (profiles.self_skill). Yoksa bant çipi çizilmez. */
  selfSkill?: number | null;
  onShare?: () => void;
}

// Tek nötr tema (eski rookie paleti).
const T = {
  cardBg: 'linear-gradient(160deg, #0e1420 0%, #16202e 35%, #080c14 100%)',
  border: '#3d5566',
  glow: '0 0 40px rgba(80,120,150,0.22), 0 0 90px rgba(50,80,110,0.1)',
  pos: '#7f97a8',
  posTag: 'rgba(120,160,190,0.12)',
  name: '#dce6ee',
  label: '#5c7385',
  value: '#9db4c4',
  sep: 'rgba(80,120,150,0.35)',
  shine: 'rgba(180,210,230,0.18)',
};

export const PlayerCard: React.FC<PlayerCardProps> = ({
  name, photo, position = 'OS', matchCount, winCount, selfSkill, onShare,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const band = skillBand(selfSkill);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onLeave = useCallback(() => { mx.set(0); my.set(0); gOpacity.set(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const winRate = matchCount > 0 ? Math.round((winCount / matchCount) * 100) : null;

  return (
    <div lang="tr" className="relative w-full max-w-[240px] mx-auto select-none" style={{ perspective: '900px' }}>
      <div className="absolute inset-[-20px] rounded-[40px] pointer-events-none blur-2xl opacity-40"
        style={{ background: `radial-gradient(ellipse, ${T.border}, transparent 70%)` }} />

      <motion.div
        ref={cardRef}
        style={{ rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="relative w-full"
      >
        <div
          className="relative w-full rounded-[24px] overflow-hidden"
          style={{ aspectRatio: '2 / 3', background: T.cardBg, boxShadow: T.glow, border: `2px solid ${T.border}` }}
        >
          {/* Hex doku */}
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

          {/* Süpürme parlaması */}
          <motion.div
            className="absolute inset-0 z-20 pointer-events-none mix-blend-overlay"
            style={{ background: `linear-gradient(110deg, transparent 30%, ${T.shine} 50%, transparent 70%)` }}
            animate={{ x: ['-100%', '120%'] }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 6, ease: 'easeInOut' }}
          />

          {/* Fare parıltısı */}
          <motion.div
            className="absolute inset-0 z-20 pointer-events-none rounded-[22px]"
            style={{
              background: useTransform([gX, gY], ([x, y]) =>
                `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.18) 0%, transparent 55%)`
              ),
              opacity: gOpacity,
            }}
          />

          <div className="absolute inset-[3px] rounded-[22px] border pointer-events-none z-30 mix-blend-overlay"
            style={{ borderColor: 'rgba(255,255,255,0.15)' }} />

          {/* ── Üst meta: pozisyon + seviye bandı ── */}
          <div className="absolute top-4 left-4 z-40 flex flex-col items-start gap-1.5">
            <div className="px-2 py-[3px] rounded-md" style={{ background: T.posTag, border: `1px solid ${T.border}44` }}>
              <span className="text-[0.6875rem] font-extrabold uppercase tracking-widest" style={{ color: T.pos }}>{position}</span>
            </div>
            {band && (
              <div
                className="px-2 py-[3px] rounded-full"
                style={{ background: `${band.color}18`, border: `1px solid ${band.color}55` }}
              >
                <span className="text-[0.625rem] font-extrabold uppercase tracking-widest" style={{ color: band.color }}>
                  {band.label}
                </span>
              </div>
            )}
          </div>

          <div className="absolute top-4 right-4 z-40 flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: T.posTag, border: `1px solid ${T.border}44` }}>
              <Trophy size={14} fill="currentColor" style={{ color: T.pos }} />
            </div>
            <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.3em]" style={{ color: T.label }}>OYNA</span>
          </div>

          {/* ── Oyuncu fotoğrafı ── */}
          <div className="absolute bottom-0 left-0 w-full h-[55%] z-20 pointer-events-none"
            style={{ background: 'linear-gradient(to top, #0e1420 0%, transparent 100%)' }} />

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
                    className="text-5xl font-extrabold italic uppercase tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                    style={{ color: T.value, textShadow: `0 0 20px ${T.border}80, 0 0 40px ${T.border}30` }}
                  >
                    {name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </span>
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.25em] mt-1.5 opacity-55" style={{ color: T.pos }}>
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

          {/* ── İsim ── */}
          <div className="absolute z-40 w-full text-center" style={{ bottom: '30%' }}>
            <div className="mx-4">
              <div className="flex items-center gap-2 mb-1.5 justify-center">
                <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.sep})` }} />
                <div className="w-1 h-1 rounded-full" style={{ background: T.border }} />
                <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.sep})` }} />
              </div>
              <h2
                className="text-[0.875rem] font-extrabold uppercase tracking-[0.18em] leading-tight truncate"
                style={{ color: T.name, textShadow: `0 1px 12px ${T.border}60` }}
              >
                {name}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 justify-center">
                <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${T.sep})` }} />
                <div className="w-1 h-1 rounded-full" style={{ background: T.border }} />
                <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${T.sep})` }} />
              </div>
            </div>
          </div>

          {/* ── Alt panel: maç / galibiyet / %galibiyet ── */}
          <div
            className="absolute bottom-0 left-0 w-full z-40 px-4 pb-5"
            style={{ height: '28%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '6px' }}
          >
            <div className="w-full h-px mb-1" style={{ background: `linear-gradient(to right, transparent, ${T.sep}, transparent)` }} />
            <div className="grid grid-cols-3 text-center">
              <div>
                <div className="font-numeric text-lg font-bold leading-none" style={{ color: T.name }}>{matchCount}</div>
                <div className="text-[0.625rem] font-extrabold uppercase tracking-widest mt-1" style={{ color: T.label }}>Maç</div>
              </div>
              <div>
                <div className="font-numeric text-lg font-bold leading-none" style={{ color: T.name }}>{winCount}</div>
                <div className="text-[0.625rem] font-extrabold uppercase tracking-widest mt-1" style={{ color: T.label }}>Galibiyet</div>
              </div>
              <div>
                <div className="font-numeric text-lg font-bold leading-none" style={{ color: T.name }}>
                  {winRate == null ? '—' : `%${winRate}`}
                </div>
                <div className="text-[0.625rem] font-extrabold uppercase tracking-widest mt-1" style={{ color: T.label }}>Galibiyet %</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {onShare && (
        <motion.button
          onClick={onShare}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          className="mt-5 mx-auto flex items-center gap-2 px-5 py-2 rounded-full text-[0.6875rem] font-extrabold uppercase tracking-wide"
          style={{ background: T.posTag, border: `1px solid ${T.border}44`, color: T.name }}
        >
          <Share2 size={12} />
          Kartı Paylaş
        </motion.button>
      )}
    </div>
  );
};
