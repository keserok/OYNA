import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, MapPin, Trophy, ArrowRight } from 'lucide-react';

// İlk açılış değer anlatımı (3 sayfa). Bir kez gösterilir
// (localStorage 'oyna_onboarding_done'), "Atla" ile geçilebilir.

export const ONBOARDING_DONE_KEY = 'oyna_onboarding_done';

export const isOnboardingDone = () => {
  try { return localStorage.getItem(ONBOARDING_DONE_KEY) === '1'; } catch { return true; }
};

const markOnboardingDone = () => {
  try { localStorage.setItem(ONBOARDING_DONE_KEY, '1'); } catch { /* private mode */ }
};

const SLIDES = [
  {
    icon: Zap,
    title: 'Maç bul, hemen oyna',
    desc: 'Çevrendeki halı saha maçlarına tek dokunuşla katıl. Eksik oyuncu arayan kadrolar seni bekliyor.',
  },
  {
    icon: MapPin,
    title: 'Sahanı seç, anında kirala',
    desc: 'Haritada fiyatlarıyla listelenen sahalardan uygun saati seç; ücreti takım arkadaşlarınla bölüş.',
  },
  {
    icon: Trophy,
    title: 'Kartını geliştir, yıldız ol',
    desc: 'Her maç istatistiklerine işlenir. FUT tarzı oyuncu kartın gelişsin, maçın oyuncusu seçil.',
  },
];

interface OnboardingViewProps {
  onDone: () => void;
}

const OnboardingView: React.FC<OnboardingViewProps> = ({ onDone }) => {
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];
  const Icon = slide.icon;

  const finish = () => {
    markOnboardingDone();
    onDone();
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col justify-between px-8 pt-safe pb-safe">
      <div className="flex justify-end pt-6">
        <button onClick={finish} className="text-gray-500 font-bold text-sm px-3 py-2" aria-label="Tanıtımı atla">
          Atla
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center text-center gap-6"
        >
          <div className="w-24 h-24 rounded-[28px] bg-[#FACC15]/12 border border-[#FACC15]/25 flex items-center justify-center">
            <Icon size={44} className="text-[#FACC15]" />
          </div>
          <h1 className="text-white font-black text-3xl leading-tight">{slide.title}</h1>
          <p className="text-gray-400 text-base leading-relaxed max-w-xs">{slide.desc}</p>
        </motion.div>
      </AnimatePresence>

      <div className="pb-10 space-y-6">
        <div className="flex justify-center gap-2" role="progressbar" aria-valuenow={index + 1} aria-valuemax={SLIDES.length}>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${i === index ? 'w-8 bg-[#FACC15]' : 'w-2 bg-white/15'}`}
            />
          ))}
        </div>
        <button
          onClick={() => (isLast ? finish() : setIndex(index + 1))}
          className="w-full py-4 bg-[#FACC15] text-black font-black text-base rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          {isLast ? 'BAŞLAYALIM' : 'DEVAM'} <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default OnboardingView;
