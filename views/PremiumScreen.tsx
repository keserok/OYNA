
import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Crown, Zap, BarChart3, Tv, Shield, Star, Play, X } from 'lucide-react';

interface PremiumScreenProps {
  onBack: () => void;
  onUpgrade: () => void;
}

const PremiumScreen: React.FC<PremiumScreenProps> = ({ onBack, onUpgrade }) => {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const [isSuccess, setIsSuccess] = useState(false);

  const handlePurchase = () => {
      // Simulate API and Payment
      setIsSuccess(true);
      setTimeout(() => {
          onUpgrade();
      }, 3000);
  };

  if (isSuccess) {
      return (
          <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center relative overflow-hidden">
              {/* Confetti & Fireworks CSS Simulation */}
              <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-[#FFFF00] rounded-full animate-ping"></div>
                  <div className="absolute top-1/3 right-1/4 w-4 h-4 bg-[#FFD700] rounded-full animate-bounce"></div>
                  <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-[#DAA520] rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-40 animate-spin-slow"></div>
              </div>

              <div className="relative z-10 text-center animate-in zoom-in duration-700">
                  <div className="relative w-40 h-40 mx-auto mb-8">
                      <div className="absolute inset-0 bg-gradient-to-r from-yellow-600 via-yellow-300 to-yellow-600 rounded-full blur-[50px] animate-pulse"></div>
                      <div className="relative w-full h-full bg-gradient-to-br from-[#FFD700] to-[#DAA520] rounded-full flex items-center justify-center border-4 border-white/20 shadow-2xl animate-[spin_3s_linear_infinite]">
                          <Crown size={64} className="text-black" />
                      </div>
                  </div>
                  <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#FFFF00] via-white to-[#FFFF00] mb-2">ARTIK EFSANESİN!</h2>
                  <p className="text-gray-400 font-bold">OYNA PRO üyeliğin aktif edildi.</p>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col relative overflow-x-hidden">
        {/* Background Ambience */}
        <div className="absolute top-0 left-0 w-full h-[60vh] bg-gradient-to-b from-[#1B1205] to-[#0A0E14] z-0"></div>
        <div className="absolute top-[-100px] left-[-100px] w-[300px] h-[300px] bg-yellow-600/20 blur-[100px] rounded-full"></div>

        {/* Header */}
        <header className="p-6 flex items-center justify-between relative z-10">
            <button onClick={onBack} className="p-3 bg-black/30 backdrop-blur-md rounded-full text-white hover:bg-white/10 transition-colors border border-white/5">
                <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2">
                <Crown size={20} className="text-[#FFFF00] fill-[#FFFF00]" />
                <span className="font-black text-lg text-white tracking-widest">OYNA PRO</span>
            </div>
            <div className="w-10"></div>
        </header>

        <main className="flex-1 px-6 pb-24 relative z-10 overflow-y-auto custom-scrollbar">
            
            <div className="text-center mb-8">
                <h1 className="text-4xl font-black text-white mb-2 leading-tight">
                    Sıradan Olma,<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFFF00] via-[#FCEE21] to-[#D4AF37]">EFSANE OL.</span>
                </h1>
                <p className="text-gray-400 text-sm">Profesyonellerin dünyasına katıl, sahada fark yarat.</p>
            </div>

            {/* Toggle */}
            <div className="bg-[#161B22] p-1 rounded-2xl flex relative mb-8 border border-white/10 w-full max-w-xs mx-auto">
                <div 
                    className={`absolute top-1 bottom-1 w-[48%] bg-[#FFFF00] rounded-xl transition-all duration-300 ${billingCycle === 'MONTHLY' ? 'left-1' : 'left-[51%]'}`}
                ></div>
                <button 
                    onClick={() => setBillingCycle('MONTHLY')}
                    className={`flex-1 py-3 text-xs font-black relative z-10 transition-colors ${billingCycle === 'MONTHLY' ? 'text-black' : 'text-gray-400'}`}
                >
                    AYLIK (99₺)
                </button>
                <button 
                    onClick={() => setBillingCycle('YEARLY')}
                    className={`flex-1 py-3 text-xs font-black relative z-10 transition-colors flex flex-col items-center justify-center leading-none ${billingCycle === 'YEARLY' ? 'text-black' : 'text-gray-400'}`}
                >
                    <span>YILLIK (899₺)</span>
                    <span className={`text-[8px] mt-0.5 ${billingCycle === 'YEARLY' ? 'text-black/70' : 'text-green-400'}`}>%25 İNDİRİM</span>
                </button>
            </div>

            {/* Features List */}
            <div className="space-y-4 mb-8">
                <div className="bg-gradient-to-r from-[#161B22] to-[#1F1A0B] p-5 rounded-[24px] border border-[#FFFF00]/20 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-black shadow-lg shadow-yellow-500/20">
                        <Zap size={24} fill="black" />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Komisyon İndirimi</h3>
                        <p className="text-xs text-gray-400">Hizmet bedellerinde %50 indirim. 3 maçta parasını çıkarır.</p>
                    </div>
                </div>

                <div className="bg-[#161B22] p-5 rounded-[24px] border border-white/5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Shield size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Öncelikli Rezervasyon</h3>
                        <p className="text-xs text-gray-400">Popüler saatlerde 15dk erken erişim.</p>
                    </div>
                </div>

                <div className="bg-[#161B22] p-5 rounded-[24px] border border-white/5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <BarChart3 size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Maç Analizi</h3>
                        <p className="text-xs text-gray-400">Oyun stiline özel detaylı raporlar.</p>
                    </div>
                </div>

                <div className="bg-[#161B22] p-5 rounded-[24px] border border-white/5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-400">
                        <Tv size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">OYNA TV+</h3>
                        <p className="text-xs text-gray-400">Reklamsız izle, HD kalitede indir.</p>
                    </div>
                </div>
            </div>

            {/* Comparison Table */}
            <div className="bg-white/5 backdrop-blur-md rounded-[32px] p-6 border border-white/10 mb-8">
                <h3 className="text-center font-black text-white mb-6">PLAN KARŞILAŞTIRMASI</h3>
                <div className="flex justify-between text-xs font-bold text-gray-500 mb-4 pb-2 border-b border-white/10">
                    <span>ÖZELLİK</span>
                    <div className="flex gap-6">
                        <span className="w-12 text-center">STD</span>
                        <span className="w-12 text-center text-[#FFFF00]">PRO</span>
                    </div>
                </div>
                
                {[
                    { name: 'Maç Rezervasyonu', std: true, pro: true },
                    { name: 'Detaylı İstatistik', std: 'Temel', pro: 'Gelişmiş' },
                    { name: 'Komisyon', std: '%10', pro: '%5' },
                    { name: 'TV İndirme', std: false, pro: true },
                    { name: 'Altın Rozet', std: false, pro: true },
                ].map((item, i) => (
                    <div key={i} className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 text-sm">
                        <span className="text-gray-300 font-medium">{item.name}</span>
                        <div className="flex gap-6 items-center">
                            <span className="w-12 text-center flex justify-center text-gray-500">
                                {typeof item.std === 'boolean' ? (item.std ? <CheckCircle2 size={16} /> : <X size={16} />) : item.std}
                            </span>
                            <span className="w-12 text-center flex justify-center text-[#FFFF00] font-bold">
                                {typeof item.pro === 'boolean' ? (item.pro ? <CheckCircle2 size={16} /> : <X size={16} />) : item.pro}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* VIP Room Teaser */}
            <div className="relative rounded-[32px] overflow-hidden h-40 group cursor-pointer border border-[#FFFF00]/30">
                <img src="https://images.unsplash.com/photo-1551958219-acbc608c6377?auto=format&fit=crop&q=80&w=800" className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                    <div className="bg-[#FFFF00] text-black px-3 py-1 rounded-full text-[10px] font-black mb-2 flex items-center gap-1">
                        <Crown size={12} fill="black" /> VIP ODA
                    </div>
                    <h3 className="font-black text-white text-xl">DÜNYA YILDIZLARI</h3>
                    <p className="text-xs text-gray-300 mt-1">Özel antrenman videoları ve taktik dersleri.</p>
                    <div className="mt-3 bg-white/10 backdrop-blur-md px-3 py-2 rounded-full border border-white/20">
                        <div className="flex -space-x-2">
                            <div className="w-6 h-6 rounded-full bg-gray-500 border border-black"></div>
                            <div className="w-6 h-6 rounded-full bg-gray-400 border border-black"></div>
                            <div className="w-6 h-6 rounded-full bg-gray-300 border border-black flex items-center justify-center text-[8px] text-black font-bold">+12</div>
                        </div>
                    </div>
                </div>
            </div>

        </main>

        {/* Sticky Action Footer */}
        <div className="absolute bottom-0 left-0 w-full bg-[#0A0E14]/90 backdrop-blur-xl border-t border-[#FFFF00]/20 p-6 z-20">
            <button 
                onClick={handlePurchase}
                className="w-full h-16 rounded-2xl font-black text-lg text-black bg-gradient-to-r from-[#FFD700] via-[#FCEE21] to-[#FFD700] shadow-[0_0_30px_rgba(255,215,0,0.3)] hover:shadow-[0_0_50px_rgba(255,215,0,0.5)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 animate-pulse-slow relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] animate-[shimmer_2s_infinite]"></div>
                <Crown size={24} fill="black" />
                <span>HEMEN YÜKSELT</span>
            </button>
            <p className="text-[10px] text-center text-gray-500 mt-3">İstediğin zaman iptal edebilirsin.</p>
        </div>
    </div>
  );
};

export default PremiumScreen;
