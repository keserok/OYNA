import React, { useState } from 'react';
import { UserRole, AppView } from '../types';
import { Shield, Scale, Building2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Custom Football SVG Icon (Perfected Geometry)
const FootballIcon = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className}>
    <defs>
      <clipPath id="ball-clip">
        <circle cx="50" cy="50" r="45" />
      </clipPath>
    </defs>

    <g clipPath="url(#ball-clip)">
      {/* Center pentagon (Empty) */}
      <polygon points="50,26 71,42 63,66 37,66 29,42" fill="transparent" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />

      {/* Connecting lines */}
      <line x1="50" y1="26" x2="50" y2="10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="71" y1="42" x2="86" y2="37" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="63" y1="66" x2="77" y2="79" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="37" y1="66" x2="23" y2="79" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <line x1="29" y1="42" x2="14" y2="37" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />

      {/* Edge partial pentagons (extended outward to be perfectly clipped) */}
      {/* Top - Empty */}
      <polygon points="50,10 70,-5 30,-5" fill="transparent" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {/* Top-Right - Empty */}
      <polygon points="86,37 105,20 100,60" fill="transparent" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {/* Bottom-Right - Filled */}
      <polygon points="77,79 100,95 65,105" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity="0.95" />
      {/* Bottom-Left - Empty */}
      <polygon points="23,79 0,95 35,105" fill="transparent" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {/* Top-Left - Filled */}
      <polygon points="14,37 -5,20 0,60" fill="currentColor" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" opacity="0.95" />
    </g>

    {/* Base outline (drawn last to smoothly cover clipped edges) */}
    <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="6" fill="transparent" />
  </svg>
);

interface RoleSelectionProps {
  onSelect: (role: UserRole, data?: any) => void;
  onBack: () => void;
  onPartnerInvite?: () => void;
  onNavigate?: (view: AppView) => void;
}

// ─── Animated Particle orb ───────────────────────────────────────────────────
const FloatingOrb = ({ color, size, x, y, duration }: { color: string; size: number; x: string; y: string; duration: number }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{ width: size, height: size, left: x, top: y, background: color, filter: `blur(${size * 0.6}px)` }}
    animate={{ y: [0, -30, 0], opacity: [0.15, 0.35, 0.15], scale: [1, 1.2, 1] }}
    transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
  />
);

// --- HERO CARD COMPONENT ---
const RoleHeroCard: React.FC<{
  role: UserRole;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  glowColor: string;
  gradientFrom: string;
  gradientTo: string;
  iconBg: string;
  onComplete: () => void;
  delayMs: number;
}> = ({ role, title, subtitle, icon, glowColor, gradientFrom, gradientTo, iconBg, onComplete, delayMs }) => {
  const [isEntering, setIsEntering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const getRoleLabel = (r: UserRole) => {
    if (r === UserRole.PLAYER) return 'OYUNCU KİMLİĞİ';
    if (r === UserRole.GOALKEEPER) return 'KALECİ KİMLİĞİ';
    if (r === UserRole.REFEREE) return 'HAKEM KİMLİĞİ';
    if (r === UserRole.OWNER) return 'SAHİP PANELİ';
    return `${r} ID`;
  };

  const handleEntry = () => {
    if (isEntering) return;
    setIsEntering(true);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random() * 22 + 12;
      if (p >= 100) {
        p = 100; clearInterval(iv); setProgress(100);
        setTimeout(onComplete, 280);
      } else { setProgress(p); }
    }, 35);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: isEntering ? 0.97 : 1 }}
      transition={{
        opacity: { duration: 0.5, delay: delayMs / 1000 },
        y: { type: 'spring', stiffness: 280, damping: 24, delay: delayMs / 1000 },
        scale: { type: 'spring', stiffness: 400, damping: 22 }
      }}
      onClick={handleEntry}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group relative w-full rounded-[28px] overflow-hidden cursor-pointer select-none" style={{ minHeight: 112,
        boxShadow: isHovered || isEntering
          ? `0 0 0 1.5px ${glowColor}80, 0 8px 40px ${glowColor}30, inset 0 1px 0 rgba(255,255,255,0.06)`
          : '0 0 0 1px rgba(255,255,255,0.07), 0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'box-shadow 0.35s ease'
      }}
    >
      {/* Glass base */}
      <div className="absolute inset-0" style={{
        background: `linear-gradient(135deg, ${gradientFrom} 0%, #0d1420 60%, ${gradientTo} 100%)`,
        opacity: isHovered ? 1 : 0.88,
        transition: 'opacity 0.35s ease'
      }} />

      {/* Progress fill */}
      <motion.div
        className="absolute inset-0 origin-left"
        style={{
          scaleX: progress / 100,
          background: `linear-gradient(90deg, ${glowColor}18, ${glowColor}40)`
        }}
        transition={{ duration: 0.05 }}
      />

      {/* Animated scan line on hover */}
      <AnimatePresence>
        {isHovered && !isEntering && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
            className="absolute inset-y-0 w-1/3 pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${glowColor}25, transparent)` }}
          />
        )}
      </AnimatePresence>

      {/* Giant watermark icon */}
      <motion.div
        className="absolute -right-3 -bottom-3 pointer-events-none"
        animate={{ rotate: isHovered ? 8 : 0, scale: isHovered ? 1.12 : 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        style={{ color: glowColor, opacity: isHovered ? 0.12 : 0.06 }}
      >
        {React.cloneElement(icon as React.ReactElement<any>, { size: 130 })}
      </motion.div>

      {/* Content row */}
      <div className="absolute inset-0 px-5 flex items-center gap-4 z-10">
        {/* Icon box */}
        <motion.div
          animate={{ scale: isEntering ? 0.9 : isHovered ? 1.08 : 1 }}
          transition={{ type: 'spring', stiffness: 350, damping: 22 }}
          className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            background: iconBg,
            boxShadow: isHovered ? `0 0 18px ${glowColor}50` : `0 0 0 1px ${glowColor}25`,
            color: glowColor
          }}
        >
          {React.cloneElement(icon as React.ReactElement<any>, { size: 24, strokeWidth: 2.2 })}
        </motion.div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-[0.625rem] font-extrabold uppercase tracking-[0.25em] mb-0.5" style={{ color: glowColor, opacity: 0.75 }}>{getRoleLabel(role)}</p>
          <motion.h2
            animate={{ x: isEntering ? 6 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="text-[1.375rem] font-extrabold text-white italic tracking-tight leading-none mb-1"
          >{title}</motion.h2>
          <p className="text-[0.6875rem] text-gray-300 font-medium leading-snug" style={{ maxWidth: 200 }}>{subtitle}</p>
        </div>

        {/* Right indicator */}
        <div className="shrink-0">
          {isEntering ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 rounded-full border-2 border-transparent"
              style={{ borderTopColor: glowColor }}
            />
          ) : (
            <motion.div
              animate={{ x: isHovered ? 3 : 0 }}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: isHovered ? `${glowColor}20` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isHovered ? glowColor + '60' : 'rgba(255,255,255,0.1)'}`,
                color: isHovered ? glowColor : 'rgba(255,255,255,0.3)',
                transition: 'all 0.25s ease'
              }}
            >
              <ArrowRight size={15} />
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect, onNavigate }) => {
  // Tüm roller artık ortak giriş arayüzüne (AuthScreen) yönlendirilir.
  // Apple / Google / E-posta / Telefon ile giriş yapılır; role özel kayıt akışı
  // (kaleci/hakem başvuru formu, tesis kurulumu) doğrulamadan sonra çalışır.
  const handleCardClick = (role: UserRole) => {
    onSelect(role);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#060A12] relative overflow-hidden">

      {/* ── Animated ambient orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <FloatingOrb color="#f59e0b" size={260} x="-80px" y="10%" duration={7} />
        <FloatingOrb color="#22c55e" size={200} x="60%" y="5%" duration={9} />
        <FloatingOrb color="#ef4444" size={180} x="20%" y="55%" duration={8} />
        <FloatingOrb color="#3b82f6" size={220} x="65%" y="60%" duration={10} />
        {/* Grid overlay */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '44px 44px'
        }} />
        {/* Vignette */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, #060A12 100%)'
        }} />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen w-full mx-auto max-w-lg px-4">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="pt-14 pb-8 text-center"
        >
          <motion.p
            initial={{ opacity: 0, letterSpacing: '0.5em' }}
            animate={{ opacity: 1, letterSpacing: '0.35em' }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-[0.625rem] font-extrabold uppercase text-ink-4 mb-3 tracking-[0.35em]"
          >OYNA — ROL SEÇİMİ</motion.p>
          <motion.h1
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 260, damping: 22 }}
            className="text-[2.125rem] font-extrabold text-white leading-tight tracking-tight"
            style={{ textShadow: '0 2px 8px rgba(255,255,255,0.2)' }}
          >
            Kim olarak<br />sahaya çıkıyorsun?
          </motion.h1>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
            className="mt-4 h-px mx-auto w-24"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }}
          />
        </motion.div>

        {/* ── Cards ── */}
        <div className="flex flex-col gap-3 pb-10">
          <RoleHeroCard
            role={UserRole.PLAYER}
            title="OYUNCU"
            subtitle="Maç yap, takıma katıl veya eksik tamamla."
            icon={<FootballIcon />}
            glowColor="#f59e0b"
            gradientFrom="rgba(120,60,0,0.55)"
            gradientTo="rgba(92,50,0,0.15)"
            iconBg="rgba(245,158,11,0.15)"
            onComplete={() => handleCardClick(UserRole.PLAYER)}
            delayMs={80}
          />
          <RoleHeroCard
            role={UserRole.GOALKEEPER}
            title="KALECİ"
            subtitle="Maç başı ücretini belirle, eldivenlerini konuştur."
            icon={<Shield />}
            glowColor="#22c55e"
            gradientFrom="rgba(0,80,30,0.55)"
            gradientTo="rgba(0,60,20,0.15)"
            iconBg="rgba(34,197,94,0.15)"
            onComplete={() => handleCardClick(UserRole.GOALKEEPER)}
            delayMs={180}
          />
          <RoleHeroCard
            role={UserRole.REFEREE}
            title="HAKEM"
            subtitle="Adaleti sağla, yönettiğin maç başına kazan."
            icon={<Scale />}
            glowColor="#ef4444"
            gradientFrom="rgba(100,10,10,0.55)"
            gradientTo="rgba(80,0,0,0.15)"
            iconBg="rgba(239,68,68,0.15)"
            onComplete={() => handleCardClick(UserRole.REFEREE)}
            delayMs={280}
          />
          <RoleHeroCard
            role={UserRole.OWNER}
            title="TESİS"
            subtitle="Sahanı listele, rezervasyonları yönet."
            icon={<Building2 />}
            glowColor="#3b82f6"
            gradientFrom="rgba(15,30,100,0.55)"
            gradientTo="rgba(10,20,80,0.15)"
            iconBg="rgba(59,130,246,0.15)"
            onComplete={() => handleCardClick(UserRole.OWNER)}
            delayMs={380}
          />
        </div>
      </div>

      {/* Admin panel artık standalone: /admin.html */}
    </div>
  );
};

export default RoleSelection;
