
import React, { useEffect, useState } from 'react';
import { Trophy, Star, ArrowRight, Share2, TicketPercent, ArrowLeft } from 'lucide-react';

interface MotmRevealProps {
  onClaim: () => void;
  onBack: () => void;
}

const MotmReveal: React.FC<MotmRevealProps> = ({ onClaim, onBack }) => {
  const [step, setStep] = useState<'LOADING' | 'REVEAL'>('LOADING');

  useEffect(() => {
      setTimeout(() => setStep('REVEAL'), 2000);
  }, []);

  if (step === 'LOADING') {
      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center p-6 relative overflow-hidden">
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-900/20 via-[#0A0E14] to-[#0A0E14]"></div>
               <div className="relative z-10 text-center">
                   <div className="w-24 h-24 border-4 border-[#FFFF00]/20 border-t-[#FFFF00] rounded-full animate-spin mx-auto mb-6"></div>
                   <h2 className="text-2xl font-black text-white animate-pulse">OYLAR SAYILIYOR...</h2>
                   <p className="text-gray-500 mt-2">Takım arkadaşlarının kararı belirleniyor.</p>
               </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Back Button */}
        <button 
            onClick={onBack} 
            className="absolute top-6 left-6 p-3 bg-black/20 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-black/40 transition-colors z-50"
        >
            <ArrowLeft size={24} />
        </button>

        {/* Confetti Background (CSS Simulation) */}
        <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-[#FFFF00] rounded-full animate-bounce"></div>
            <div className="absolute top-1/3 right-1/4 w-4 h-4 bg-blue-500 rounded-full animate-ping"></div>
            <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 animate-spin-slow"></div>
        </div>

        <div className="relative z-10 text-center w-full max-w-sm animate-in zoom-in duration-700">
            
            <div className="mb-2 inline-block bg-gradient-to-r from-yellow-600 to-yellow-400 text-black text-xs font-black px-4 py-1 rounded-full shadow-[0_0_20px_rgba(255,215,0,0.5)]">
                MAÇIN OYUNCUSU
            </div>
            
            <div className="relative mx-auto w-48 h-48 mb-8 mt-4">
                <div className="absolute inset-0 bg-[#FFFF00] rounded-full blur-[60px] opacity-30 animate-pulse"></div>
                <div className="relative w-full h-full rounded-full border-4 border-[#FFFF00] p-1 shadow-2xl">
                    <img src="https://i.pravatar.cc/150?u=burak" alt="Winner" className="w-full h-full rounded-full object-cover" />
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-[#FFFF00] text-black p-3 rounded-full border-4 border-[#0A0E14] shadow-xl">
                        <Trophy size={32} fill="black" />
                    </div>
                </div>
            </div>

            <h1 className="text-5xl font-black text-white mb-2 tracking-tighter drop-shadow-2xl">BURAK</h1>
            <p className="text-gray-400 font-bold tracking-widest uppercase mb-10">KARA KARTALLAR FC</p>

            {/* Award Badge */}
            <div className="bg-[#161B22] border border-[#FFFF00]/30 p-4 rounded-2xl flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-[#FFFF00]/10 rounded-xl flex items-center justify-center text-[#FFFF00]">
                    <Star size={24} fill="#FFFF00" />
                </div>
                <div className="text-left flex-1">
                    <h4 className="font-bold text-white">Koleksiyona Eklendi</h4>
                    <p className="text-[10px] text-gray-400">"Altın Krampon" Rozeti</p>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
                <button 
                  onClick={onClaim}
                  className="w-full py-4 bg-gradient-to-r from-[#FFFF00] to-yellow-500 text-black font-black text-lg rounded-2xl shadow-[0_0_30px_rgba(255,215,0,0.3)] hover:scale-105 transition-transform flex items-center justify-center gap-2 relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-500"></div>
                    <TicketPercent size={20} /> ÖDÜLÜ AL (%5 İNDİRİM)
                </button>
                
                <button className="w-full py-4 bg-[#161B22] text-white font-bold rounded-2xl border border-white/10 hover:bg-white/5 transition-colors flex items-center justify-center gap-2">
                    <Share2 size={18} /> SKORU PAYLAŞ
                </button>
            </div>
        </div>
    </div>
  );
};

export default MotmReveal;
