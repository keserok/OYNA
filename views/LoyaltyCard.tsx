
import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Ticket, Sparkles, QrCode } from 'lucide-react';

interface LoyaltyCardProps {
  onBack?: () => void;
  embedMode?: boolean;
}

const LoyaltyCard: React.FC<LoyaltyCardProps> = ({ onBack, embedMode = false }) => {
  const [stamps, setStamps] = useState(9);
  const totalStamps = 10;
  const isComplete = stamps >= totalStamps;

  return (
    <div className={`flex flex-col ${embedMode ? 'h-full' : 'min-h-screen bg-[#0A0E14]'}`}>
      {!embedMode && (
          <header className="p-6 flex items-center gap-4 bg-[#0A0E14] sticky top-0 z-20">
            <button onClick={onBack} className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all">
                <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-black text-white">Sadakat Kartım</h1>
          </header>
      )}

      <div className={`flex-1 p-6 ${embedMode ? 'p-0' : ''} flex flex-col items-center justify-center`}>
          
          <div className="w-full max-w-sm relative">
              
              {/* Glassmorphism Card */}
              <div className={`relative z-10 bg-[#161B22]/80 backdrop-blur-xl border border-white/10 rounded-[32px] p-6 shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-500 ${isComplete ? 'border-[#FFFF00] shadow-[0_0_50px_rgba(255,255,0,0.2)]' : ''}`}>
                  
                  <div className="flex justify-between items-start mb-6">
                      <div>
                          <h2 className="text-2xl font-black text-white italic">OYNA<span className="text-[#FFFF00]">LOYALTY</span></h2>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">10. Maç Bizden!</p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                          <Ticket size={20} className={isComplete ? "text-[#FFFF00]" : "text-gray-500"} />
                      </div>
                  </div>

                  {/* Stamp Grid */}
                  <div className="grid grid-cols-5 gap-3 mb-6">
                      {Array.from({ length: totalStamps }).map((_, i) => {
                          const filled = i < stamps;
                          return (
                              <div key={i} className="aspect-square relative flex items-center justify-center">
                                  <div className={`w-full h-full rounded-full border-2 transition-all duration-300 ${filled ? 'bg-[#FFFF00] border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.4)]' : 'border-white/10 bg-white/5'}`}></div>
                                  {filled && <CheckCircle2 size={16} className="absolute text-black animate-in zoom-in duration-300" />}
                                  {!filled && <div className="absolute w-full h-full rounded-full border border-dashed border-gray-600 opacity-30"></div>}
                              </div>
                          );
                      })}
                  </div>

                  {/* Reward / QR Section */}
                  <div className="bg-[#0A0E14] rounded-2xl p-4 text-center border border-white/5 relative overflow-hidden group">
                      {isComplete ? (
                          <div className="animate-in fade-in slide-in-from-bottom-5 duration-500 relative">
                              {/* Laser Scanner Effect */}
                              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent z-20 animate-[scan_2s_linear_infinite] shadow-[0_0_15px_red]"></div>
                              
                              <div className="flex items-center justify-center gap-2 text-[#FFFF00] mb-2">
                                  <Sparkles size={16} />
                                  <span className="font-black text-sm uppercase">Ücretsiz Maç Bileti</span>
                                  <Sparkles size={16} />
                              </div>
                              <div className="bg-white p-2 rounded-xl w-32 h-32 mx-auto mb-2 relative overflow-hidden">
                                  <QrCode size={112} className="text-black" />
                                  {/* Dynamic Gradient Strip on QR */}
                                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-[#FFFF00]/40 to-transparent animate-[shimmer_2s_infinite]"></div>
                              </div>
                              <p className="text-[9px] text-gray-500">Güvenlik lazeri aktiftir. Kopyalanamaz.</p>
                          </div>
                      ) : (
                          <div className="opacity-50 blur-[1px]">
                               <p className="text-xs font-bold text-gray-400 mb-2">ÖDÜL KİLİTLİ</p>
                               <div className="w-32 h-32 bg-gray-800 rounded-xl mx-auto flex items-center justify-center">
                                   <Ticket size={48} className="text-gray-600" />
                               </div>
                          </div>
                      )}
                      
                      {!isComplete && (
                           <div className="absolute inset-0 flex items-center justify-center">
                               <p className="bg-black/80 px-3 py-1 rounded-lg text-[10px] font-bold text-white border border-white/10">
                                   Doldur Topları, Kap Bedava Maçı!
                               </p>
                           </div>
                      )}
                  </div>

              </div>
          </div>
      </div>
    </div>
  );
};

export default LoyaltyCard;
