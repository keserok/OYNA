import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import oynaLogo from '../../assets/onboarding/oyna-logo.webp';
import { Gender, OnboardingPosition, PlayStyle, AgeRange, POSITION_LABEL, trUpper } from './onboardingShared';

interface PlayerCardRevealProps {
  firstName: string;
  lastName: string;
  ageRange: AgeRange | '';
  gender: Gender;
  position: OnboardingPosition;
  playStyle: PlayStyle;
  locationGranted: boolean;
  onRegister: () => void;
  onLogin: () => void;
  onBack: () => void;
}

const SPHERE = 'radial-gradient(circle at 32% 28%, #C8FFB0, #4DFF2A 45%, #17B356 72%, #075B2C)';
const STYLE_META: Record<Exclude<PlayStyle, ''>, { label: string; color: string }> = {
  ciddi: { label: 'Ciddi', color: '#FFC107' },
  taktiksel: { label: 'Taktiksel', color: '#00B0FF' },
  rahat: { label: 'Rahat', color: '#39FF14' },
};

const PlayerCardReveal: React.FC<PlayerCardRevealProps> = ({
  firstName, lastName, ageRange, gender, position, playStyle, locationGranted, onRegister, onLogin, onBack,
}) => {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const initials = (trUpper(firstName.trim()).charAt(0) || '') + (trUpper(lastName.trim()).charAt(0) || '');
  const fullName = trUpper(`${firstName.trim()} ${lastName.trim()}`.trim());

  const rows: { label: string; value: string; color: string }[] = [];
  if (ageRange) rows.push({ label: 'YAŞ', value: ageRange.replace('-', '–'), color: '#FFFFFF' });
  if (gender) rows.push({ label: 'CİNSİYET', value: gender === 'kadin' ? '♀ Kadın' : '♂ Erkek', color: '#00B0FF' });
  if (playStyle) rows.push({ label: 'OYUN STİLİ', value: STYLE_META[playStyle].label, color: STYLE_META[playStyle].color });
  if (locationGranted) rows.push({ label: 'KONUM', value: 'Onaylı', color: '#00E676' });
  if (position) rows.push({ label: 'POZİSYON', value: POSITION_LABEL[position], color: '#FFC107' });

  const onMove = (e: React.PointerEvent) => {
    const r = cardRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: py * -16, y: px * 18 });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center px-11"
      style={{ background: 'rgba(6,9,14,0.88)', backdropFilter: 'blur(10px)' }}
    >
      <button onClick={onBack} className="absolute top-6 left-6 w-[38px] h-[38px] rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <ArrowLeft size={18} color="#fff" />
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 900, color: '#fff', textAlign: 'center', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
        Oyna'ya hoş geldin, {firstName.trim() || 'oyuncu'}!
      </h1>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 26 }}>Oynamaya hazırsın.</p>

      {/* Holografik kart */}
      <motion.div
        ref={cardRef}
        initial={{ scale: 0.08, y: 46, opacity: 0, filter: 'blur(12px)' }}
        animate={{ scale: 1, y: 0, opacity: 1, filter: 'blur(0px)' }}
        transition={{ duration: 1.1, ease: [0.34, 1.56, 0.64, 1] }}
        onPointerMove={onMove}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        style={{
          position: 'relative', width: 246, height: 350, borderRadius: 22, padding: 20, overflow: 'hidden',
          background: 'linear-gradient(160deg, #12251A, #0B1622 55%, #131B2E)',
          border: '1.5px solid rgba(57,255,20,0.5)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
          transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: 'transform 0.18s ease-out',
        }}
      >
        {/* holo katman */}
        <div style={{
          position: 'absolute', inset: 0, mixBlendMode: 'screen', opacity: 0.5, pointerEvents: 'none',
          background: 'linear-gradient(115deg, transparent 20%, rgba(57,255,20,0.35), rgba(0,176,255,0.3), rgba(255,193,7,0.3), transparent 80%)',
          backgroundSize: '250% 250%', animation: 'obHoloMove 5.5s ease-in-out infinite alternate',
        }} />
        {/* partiküller */}
        {Array.from({ length: 12 }).map((_, i) => (
          <span key={i} style={{
            position: 'absolute', borderRadius: '50%', background: 'rgba(255,255,255,0.8)', pointerEvents: 'none',
            left: `${(i * 37) % 90 + 5}%`, top: `${(i * 53) % 82 + 6}%`,
            width: 1.5 + (i % 3), height: 1.5 + (i % 3),
            animation: `obTwinkle ${2 + (i % 5) * 0.5}s ease-in-out ${i * 0.2}s infinite alternate`,
          }} />
        ))}

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'stretch', justifyContent: 'space-between' }}>
            <span style={{
              fontFamily: 'Roboto, sans-serif', fontWeight: 900, fontStyle: 'italic', fontSize: 16,
              background: 'linear-gradient(90deg,#39FF14,#00E676)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 8px rgba(57,255,20,0.5))',
            }}>OYNA</span>
            <img src={oynaLogo} alt="" width={34} height={34} style={{ objectFit: 'contain' }} />
          </div>

          <div style={{
            width: 78, height: 78, borderRadius: '50%', background: SPHERE, marginTop: 14,
            boxShadow: 'inset -8px -10px 18px rgba(0,0,0,0.35), inset 5px 6px 12px rgba(255,255,255,0.25), 0 0 30px rgba(57,255,20,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 26,
            textShadow: '0 2px 4px rgba(0,0,0,0.4)',
          }}>{initials || '★'}</div>

          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginTop: 12, textAlign: 'center' }}>{fullName || 'OYUNCU'}</div>
          <div style={{ width: 46, height: 2, background: '#39FF14', borderRadius: 2, margin: '10px 0 14px' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '11px 10px', width: '100%' }}>
            {rows.map((r, i) => {
              const isLastOdd = rows.length % 2 === 1 && i === rows.length - 1;
              return (
                <div key={r.label} style={{ gridColumn: isLastOdd ? '1 / -1' : undefined, textAlign: 'center' }}>
                  <div style={{ fontSize: 7, fontWeight: 900, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.45)' }}>{r.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: r.color, whiteSpace: 'nowrap' }}>{r.value}</div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* CTA */}
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0 }}
        onClick={onRegister}
        style={{
          marginTop: 26, width: '100%', maxWidth: 300, height: 56, borderRadius: 18, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(90deg,#39FF14,#00E676,#39FF14)', backgroundSize: '220% 100%',
          color: '#06210A', fontSize: 16, fontWeight: 900, letterSpacing: '0.02em',
          boxShadow: '0 0 30px rgba(57,255,20,0.5)', animation: 'obGradMove 3s ease-in-out infinite alternate',
        }}
      >
        Kayıt Ol
      </motion.button>
      <button onClick={onLogin} style={{ marginTop: 14, background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 12.5, cursor: 'pointer' }}>
        Zaten hesabın var mı? <span style={{ color: '#39FF14', fontWeight: 700 }}>Giriş yap</span>
      </button>
    </motion.div>
  );
};

export default PlayerCardReveal;
