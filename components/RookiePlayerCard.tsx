import React from 'react';
import { motion } from 'framer-motion';
import { Gem, AlertTriangle, Camera } from 'lucide-react';

interface RookiePlayerCardProps {
  playerName: string;
  diamondValue: number;
  teamColor?: string; // Örn: '#FACC15' (Neon Sarı) veya '#39FF14' (Neon Yeşil)
  photoUrl?: string; // Kullanıcı fotoğraf yüklerse gösterilecek URL
  onUploadPhoto?: () => void;
  age?: number;
  preferredFoot?: 'Sağ' | 'Sol' | 'Çift';
}

export const RookiePlayerCard: React.FC<RookiePlayerCardProps> = ({
  playerName,
  diamondValue,
  teamColor = '#FACC15', // Varsayılan vurgu rengimiz Neon Sarı
  photoUrl,
  onUploadPhoto,
  age = 21,
  preferredFoot = 'Sol'
}) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, translateY: -5 }}
      whileTap={{ scale: 0.98 }}
      className="relative w-80 h-[460px] rounded-[32px] p-[2px] cursor-pointer overflow-hidden group"
      // Dış çerçevedeki neon gradient hissi
      style={{
        background: `linear-gradient(135deg, ${teamColor}60 0%, #06080A 50%, ${teamColor}90 100%)`
      }}
    >
      {/* Kartın arkasından sızan dinamik neon parlama (Glow) efekti */}
      <div 
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-3xl pointer-events-none"
        style={{ background: teamColor }}
      />

      {/* İç Kart - Glassmorphism ve Koyu Zemin */}
      <div className="relative w-full h-full rounded-[30px] bg-[#0A0E14]/90 backdrop-blur-xl flex flex-col items-center p-6 overflow-hidden">
        
        {/* Carbon-Fiber tarzı arkadan vuran ince doku */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #ffffff 1px, transparent 1px)', backgroundSize: '4px 4px' }} />

        {/* Üst Kısım: Elmas Değeri Modülü */}
        <div className="w-full flex justify-end mb-4 z-10">
          <motion.div 
            animate={{ y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
            className="flex items-center gap-2 bg-black/60 border border-[#39FF14]/30 px-3 py-1.5 rounded-full shadow-[0_0_15px_rgba(57,255,20,0.15)] backdrop-blur-md"
          >
            <Gem className="w-5 h-5 text-[#39FF14]" />
            <span className="text-[#39FF14] font-black text-sm tracking-widest uppercase mt-0.5">
              {diamondValue.toLocaleString('tr-TR')} Elmas
            </span>
          </motion.div>
        </div>

        {/* Orta Kısım: Fotoğraf Alanı (Tesis öncesi çaylak slotu) */}
        <div 
          className="relative w-44 h-52 mt-2 rounded-t-[40px] rounded-b-2xl border border-dashed flex items-center justify-center overflow-hidden transition-all duration-300 z-10 bg-[#161B22]/50 group/photo hover:border-solid hover:shadow-[0_0_20px_rgba(250,204,21,0.2)]"
          style={{ borderColor: `${teamColor}40` }}
          onClick={onUploadPhoto}
        >
          {photoUrl ? (
            <img src={photoUrl} alt={playerName} className="w-full h-full object-cover grayscale contrast-125" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/30 group-hover/photo:text-white/70 transition-colors">
              <Camera className="w-10 h-10" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-center px-4">Yüzünüzü Yükleyin</span>
            </div>
          )}
          
          {/* Fotoğrafın içine sızan ince gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14] via-transparent to-transparent pointer-events-none" />
        </div>

        {/* Oyuncu Adı */}
        <h2 className="mt-5 text-2xl font-black text-white tracking-tighter uppercase italic text-center z-10">
          {playerName}
        </h2>

        {/* Alt Kısım: Oyuncu İstatistikleri (Yaş & Ayak) */}
        <div className="absolute bottom-6 left-5 right-5 z-10 flex gap-3">
          <div className="flex-1 flex flex-col items-center justify-center bg-[#161B22]/80 border border-white/5 rounded-xl py-2 backdrop-blur-md shadow-[0_0_15px_rgba(255,255,255,0.05)]">
            <span className="text-white/30 text-[9px] font-bold uppercase tracking-widest">Yaş</span>
            <span className="text-white text-lg font-black italic">{age}</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center bg-[#161B22]/80 border border-white/5 rounded-xl py-2 backdrop-blur-md shadow-[0_0_15px_rgba(255,255,255,0.05)]">
            <span className="text-white/30 text-[9px] font-bold uppercase tracking-widest">Ayak</span>
            <span className="text-white text-lg font-black italic uppercase">{preferredFoot}</span>
          </div>
        </div>

      </div>
    </motion.div>
  );
};
