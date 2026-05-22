import React from 'react';
import { RookiePlayerCard } from '../components/RookiePlayerCard';
import { RefereeScoreModule } from '../components/RefereeScoreModule';
import { Flame, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';

export const RookieShowcase: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#06080A] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
      {/* Arka plan ortam ışıkları */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[#FFFF00] opacity-10 rounded-full blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-[#39FF14] opacity-10 rounded-full blur-[100px]" />

      <div className="z-10 flex flex-col items-center gap-10 max-w-md w-full">
        
        {/* Oyuncu Kartımız */}
        <RookiePlayerCard 
          playerName="Arda Güler" 
          diamondValue={75000} 
          teamColor="#FFFF00"
          age={21}
          preferredFoot="Sol"
          onUploadPhoto={() => alert("Kamera/Galeri modülü tetiklenecek ve fotoğraf karta yerleşecek.")}
        />

        {/* Yeni Elmas ve Karat Açıklama Kutusu */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-[#161B22]/80 backdrop-blur-xl border border-[#FFFF00]/20 rounded-3xl p-6 shadow-[0_0_30px_rgba(255,255,0,0.1)] relative overflow-hidden"
        >
          {/* İç ışık sızması */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFFF00] opacity-10 blur-3xl" />
          
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-[#FFFF00]/20 p-2 rounded-xl border border-[#FFFF00]/30 shadow-[0_0_15px_rgba(255,255,0,0.2)]">
              <Flame className="w-6 h-6 text-[#FFFF00]" />
            </div>
            <div>
              <h3 className="text-white font-black uppercase italic text-lg tracking-tighter">Borsa Motoru Aktif</h3>
              <p className="text-[#FFFF00] text-[10px] font-bold uppercase tracking-widest">Eksponansiyel Büyüme</p>
            </div>
          </div>

          <p className="text-white/70 text-sm leading-relaxed mb-6 font-medium">
            OYNA ekosisteminde sıradan puanlar yoktur. 
            <span className="text-white font-black"> Elmas (💎) </span> değeriniz, oynadığınız maç ve kazandığınız zaferlerle 
            <span className="text-[#FFFF00] font-black italic"> KATLANARAK </span> büyür. Opanel üzerinden yapılan her müdahale, saniyesinde bu karta yansır.
          </p>

          <div className="bg-[#0A0E14] border border-[#39FF14]/20 rounded-2xl p-4 flex items-center justify-between shadow-inner">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-[#39FF14]" />
              <div className="flex flex-col">
                <span className="text-[#39FF14]/60 text-[9px] font-bold uppercase tracking-widest">Takım Gücü</span>
                <span className="text-white font-black italic text-sm">KARAT (KT) SİSTEMİ</span>
              </div>
            </div>
            <div className="text-right flex flex-col">
              <span className="text-[#39FF14] font-black text-xl leading-none">100%</span>
              <span className="text-[#39FF14]/50 text-[8px] font-bold uppercase tracking-widest mt-1">Senkronize</span>
            </div>
          </div>

        </motion.div>

        {/* Canlı Test İçin Hakem Modülü Entegrasyonu */}
        <div className="w-full mt-10 flex flex-col items-center">
          <h2 className="text-white/30 font-black uppercase tracking-widest text-xs mb-4 text-center">Hakem Otoritesi (Canlı Test)</h2>
          <RefereeScoreModule 
            matchId="test-match-1"
            homeTeamName="KADIKÖY FC"
            awayTeamName="BEŞİKTAŞ GÜCÜ"
            refereeName="HAKEM: CÜNEYT Ç."
            onSubmitScore={(h, a) => console.log(`Skor Mühürlendi: ${h} - ${a}`)}
          />
        </div>

      </div>
    </div>
  );
};
