import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Camera, Download } from 'lucide-react';
import { AppView } from '../types';

interface CardBuilderProps {
  onBack: () => void;
}

type CardType = 'MIDFIELD' | 'ATTACK' | 'DEFENSE';

export const CardBuilderView: React.FC<CardBuilderProps> = ({ onBack }) => {
  const [name, setName] = useState('MARCO SILVA');
  const [rating, setRating] = useState('87');
  const [attack, setAttack] = useState('94');
  const [defense, setDefense] = useState('78');
  const [cardType, setCardType] = useState<CardType>('MIDFIELD');
  const [photoUrl, setPhotoUrl] = useState('https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80');

  const getCardStyles = () => {
    switch (cardType) {
      case 'MIDFIELD':
        return {
          bg: 'bg-gradient-to-b from-yellow-700 via-yellow-400 to-yellow-900',
          border: 'border-yellow-200/50',
          accent: 'text-yellow-100',
          shadow: 'shadow-[0_0_40px_rgba(234,179,8,0.4)]'
        };
      case 'ATTACK':
        return {
          bg: 'bg-gradient-to-b from-blue-800 via-blue-500 to-blue-950',
          border: 'border-blue-200/50',
          accent: 'text-blue-100',
          shadow: 'shadow-[0_0_40px_rgba(59,130,246,0.4)]'
        };
      case 'DEFENSE':
        return {
          bg: 'bg-gradient-to-b from-red-800 via-red-600 to-red-950',
          border: 'border-red-200/50',
          accent: 'text-red-100',
          shadow: 'shadow-[0_0_40px_rgba(239,68,68,0.4)]'
        };
    }
  };

  const styles = getCardStyles();

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col md:flex-row pb-24">
      {/* Header for mobile */}
      <div className="md:hidden flex items-center p-4 border-b border-white/10">
        <button onClick={onBack} className="p-2 -ml-2 text-white/70 hover:text-white">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold ml-2">Kart Oluşturucu</h1>
      </div>

      {/* Editor Panel */}
      <div className="w-full md:w-96 bg-[#111820] border-r border-white/5 p-6 flex flex-col gap-6 overflow-y-auto">
        <div className="hidden md:flex items-center mb-4">
          <button onClick={onBack} className="p-2 -ml-2 text-white/70 hover:text-white transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-black italic tracking-tight ml-2">KART OLUŞTUR</h1>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
              Kart Tipi (Pozisyon)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setCardType('MIDFIELD')}
                className={`py-2 rounded-lg text-sm font-bold border ${cardType === 'MIDFIELD' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400' : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'}`}
              >
                Orta Saha
              </button>
              <button 
                onClick={() => setCardType('ATTACK')}
                className={`py-2 rounded-lg text-sm font-bold border ${cardType === 'ATTACK' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'}`}
              >
                Atak
              </button>
              <button 
                onClick={() => setCardType('DEFENSE')}
                className={`py-2 rounded-lg text-sm font-bold border ${cardType === 'DEFENSE' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'}`}
              >
                Defans
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
              Oyuncu Adı
            </label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] transition-colors font-bold uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
              Genel Reyting
            </label>
            <input 
              type="number" 
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] transition-colors font-bold text-2xl"
              min="1" max="99"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                Atak Gücü
              </label>
              <input 
                type="number" 
                value={attack}
                onChange={(e) => setAttack(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] transition-colors font-bold text-xl"
                min="1" max="99"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                Savunma Gücü
              </label>
              <input 
                type="number" 
                value={defense}
                onChange={(e) => setDefense(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#39FF14] transition-colors font-bold text-xl"
                min="1" max="99"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
              Fotoğraf URL
            </label>
            <div className="relative">
              <input 
                type="text" 
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-[#39FF14] transition-colors text-sm"
                placeholder="https://..."
              />
              <Camera className="w-4 h-4 text-white/40 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-[10px] text-white/40 mt-2">İpucu: Arka planı transparan (PNG) resimler çok daha iyi görünür.</p>
          </div>
        </div>
      </div>

      {/* Preview Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #39FF14 0%, transparent 70%)' }}></div>
        
        {/* Card Component Container */}
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative w-full max-w-[340px] aspect-[1/1.5] flex items-center justify-center"
        >
          {/* Card Frame Base */}
          <div className={`absolute inset-0 rounded-2xl ${styles.bg} ${styles.shadow} overflow-hidden border-2 border-white/20`} style={{ clipPath: 'polygon(15% 0%, 85% 0%, 100% 10%, 100% 85%, 50% 100%, 0% 85%, 0% 10%)' }}>
            
            {/* Inner detailed frame (simulating premium card border) */}
            <div className={`absolute inset-1 border-2 ${styles.border} opacity-50`} style={{ clipPath: 'polygon(15% 0%, 85% 0%, 100% 10%, 100% 85%, 50% 100%, 0% 85%, 0% 10%)' }}></div>
            
            {/* Top section: Name & Rating */}
            <div className="absolute top-6 w-full text-center z-20 px-4">
              <h2 className="text-2xl font-black italic tracking-widest text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none uppercase">
                {name || 'İSİM GİRİNİZ'}
              </h2>
              <div className="mt-1 inline-block">
                <span className={`text-4xl font-black ${styles.accent} drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]`}>
                  {rating || '00'}
                </span>
              </div>
            </div>

            {/* Middle Section: Player Photo */}
            <div className="absolute inset-x-0 bottom-0 top-[80px] flex items-end justify-center overflow-hidden z-10">
              <div className="w-[120%] h-[120%] relative translate-y-8">
                 {photoUrl ? (
                   <img src={photoUrl} alt="Player" className="w-full h-full object-cover object-top mask-image-bottom drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]" style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 95%)' }} />
                 ) : (
                   <div className="w-full h-full bg-black/20 flex items-center justify-center">
                     <Camera className="w-16 h-16 text-white/20" />
                   </div>
                 )}
              </div>
            </div>

            {/* Bottom Section: Stats & Shield */}
            <div className="absolute bottom-6 inset-x-0 flex justify-between items-end px-8 z-30">
              
              {/* Attack Stat */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase text-white/70 tracking-wider">ATAK</span>
                <span className={`text-3xl font-black ${styles.accent} drop-shadow-md`}>{attack || '00'}</span>
              </div>

              {/* Center Shield */}
              <div className="relative w-16 h-16 flex items-center justify-center -translate-y-2">
                <div className={`absolute inset-0 bg-gradient-to-br from-white/40 to-white/10 backdrop-blur-sm border ${styles.border} rounded-lg rotate-45 shadow-lg`}></div>
                <div className="relative z-10 w-8 h-8 rounded-full border-2 border-white/50 bg-black/40 flex items-center justify-center p-1.5">
                  <div className="w-full h-full bg-white/80 rounded-full" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}></div>
                </div>
              </div>

              {/* Defense Stat */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-black uppercase text-white/70 tracking-wider">SAVUNMA</span>
                <span className={`text-3xl font-black ${styles.accent} drop-shadow-md`}>{defense || '00'}</span>
              </div>

            </div>

            {/* Dynamic visual effects overlays */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay pointer-events-none"></div>
            <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-to-br from-white/20 via-transparent to-black/60 mix-blend-overlay pointer-events-none"></div>
          </div>
        </motion.div>
        
        {/* Helper Note */}
        <p className="text-white/40 text-xs mt-8 text-center max-w-sm">
          Bu arayüz Oyna'nın UEFA kalitesindeki kart tasarımlarını dinamik olarak oluşturmanızı sağlar. Kart tipi rengi, şekli ve verileri anında yansıtır.
        </p>
      </div>
    </div>
  );
};

export default CardBuilderView;
