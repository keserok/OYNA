
import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, ArrowRight, Shirt, Footprints, Droplets, Info, 
  CheckCircle2, Hand, Scale, Users, Shield, Plus, ListFilter, 
  Sliders, X, Zap, Star, CreditCard, Handshake, ChevronRight, Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GOALKEEPERS, REFEREES } from '../constants';
import { Goalkeeper, Referee } from '../types';
import { useAppStore } from '../store';

interface BookingAddonsProps {
  onBack: () => void;
  onContinue: (total: number) => void;
  onNavigate: (view: any) => void;
  selectedGk: Goalkeeper | null;
  selectedRef: Referee | null;
  onRemoveGk: () => void;
  onRemoveRef: () => void;
}

const BookingAddons: React.FC<BookingAddonsProps> = ({ 
  onBack, 
  onContinue, 
  onNavigate,
  selectedGk,
  selectedRef,
  onRemoveGk,
  onRemoveRef
}) => {
  const [bootsCount, setBootsCount] = useState(0);
  const [vestsCount, setVestsCount] = useState(0);
  const [waterCount, setWaterCount] = useState(0);
  
  const [showCancelPolicy, setShowCancelPolicy] = useState(false);

  const prices = {
      boots: 50,
      vests: 10,
      water: 15,
      gk: selectedGk ? selectedGk.fee : 0,
      ref: selectedRef ? selectedRef.fee : 0,
  };

  const calculateTotal = () => {
      let total = (bootsCount * prices.boots) + (vestsCount * prices.vests) + (waterCount * prices.water);
      total += prices.gk;
      total += prices.ref;
      return total;
  };

  const handleContinue = () => {
      if (selectedGk || selectedRef) {
          setShowCancelPolicy(true);
      } else {
          onContinue(calculateTotal());
      }
  };

  const handleConfirmPolicy = () => {
      setShowCancelPolicy(false);
      onContinue(calculateTotal());
  };

  const EquipmentItem = ({ icon, title, count, setCount, price }: any) => (
      <div className="flex items-center justify-between p-3 bg-[#161B22] border border-white/5 rounded-2xl">
          <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0A0E14] flex items-center justify-center text-gray-400">
                  {icon}
              </div>
              <div>
                  <p className="text-xs font-bold text-white">{title}</p>
                  <p className="text-[10px] text-[#FFFF00] font-black">+{price}₺</p>
              </div>
          </div>
          <div className="flex items-center gap-2 bg-[#0A0E14] rounded-lg p-1">
              <button onClick={() => setCount(Math.max(0, count - 1))} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white">-</button>
              <span className="text-xs font-bold text-white w-3 text-center">{count}</span>
              <button onClick={() => setCount(count + 1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white">+</button>
          </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col relative font-sans">
       
       {/* Header */}
       <header className="p-6 flex items-center gap-4 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20 border-b border-white/5">
           <button onClick={onBack} className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full text-white hover:bg-gray-800 transition-colors border border-white/5">
               <ArrowLeft size={20} />
           </button>
           <div>
               <h1 className="text-xl font-black text-white">KADRO TAKVİYESİ</h1>
               <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Maç Öncesi Hazırlık</p>
           </div>
       </header>

       <main className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar pb-40">
            
            {/* Section 1: Talent Modules (Side-by-Side Premium Cards) */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                    <Users size={14} className="text-[#FFFF00] drop-shadow-[0_0_8px_rgba(255,255,0,0.5)]" />
                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Profesyonel Destek</h3>
                </div>
                
                <div className="flex gap-3">
                  {selectedGk ? (
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onNavigate('MARKETPLACE_GK')}
                      className="flex-1 min-h-[125px] rounded-[24px] border border-emerald-500/40 bg-gradient-to-b from-emerald-950/20 to-black/85 p-3.5 flex flex-col justify-between relative overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.15)] group cursor-pointer"
                    >
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 pointer-events-none" />
                      
                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                          <Hand size={10} className="text-emerald-400" />
                          <span className="text-[8px] font-black text-emerald-400 tracking-wider">KALECİ</span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onRemoveGk(); }}
                          className="w-5 h-5 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-all"
                        >
                          <X size={10} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5 my-2 relative z-10">
                        <div className="relative w-10 h-10 shrink-0">
                          <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-[#39FF14] opacity-80 blur-[2px]" />
                          <img src={selectedGk.avatar} className="relative w-full h-full rounded-full object-cover border border-black" referrerPolicy="no-referrer" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-white uppercase italic tracking-tight truncate">{selectedGk.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star size={8} className="text-[#FFFF00] fill-[#FFFF00]" />
                            <span className="text-[9px] font-black text-[#FFFF00]">{selectedGk.rating.toFixed(1)}</span>
                            <span className="text-[8px] font-bold text-white/40">•</span>
                            <span className="text-[8px] font-black text-white/60 tracking-wider">REF: {selectedGk.stats.reflexes}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between relative z-10 pt-1.5 border-t border-white/5">
                        <span className="text-[8px] font-black text-white/40 tracking-wider uppercase">ÜCRET</span>
                        <span className="text-[10px] font-black text-[#39FF14]">+{selectedGk.fee} ₺</span>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.button 
                      whileHover={{ scale: 1.02, borderColor: 'rgba(57,255,20,0.5)', backgroundColor: 'rgba(57,255,20,0.03)' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onNavigate('MARKETPLACE_GK')}
                      className="flex-1 min-h-[125px] rounded-[24px] border border-dashed border-emerald-500/30 bg-[#161B22]/40 p-3.5 flex flex-col justify-between text-left relative overflow-hidden transition-all duration-300"
                    >
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#39FF14]" />
                          <span className="text-[8px] font-black text-emerald-400/80 tracking-widest uppercase">KADRO EKSİK</span>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <Plus size={12} />
                        </div>
                      </div>

                      <div className="my-2">
                        <h4 className="text-[11px] font-black text-white uppercase italic tracking-tight">KİRALIK KALECİ</h4>
                        <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Sahanı Kilitle</p>
                      </div>

                      <div className="flex items-center justify-between w-full pt-1.5 border-t border-white/5">
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-wider">BAŞLANGIÇ</span>
                        <span className="text-[9px] font-black text-white/80">150 ₺</span>
                      </div>
                    </motion.button>
                  )}

                  {selectedRef ? (
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onNavigate('MARKETPLACE_REF')}
                      className="flex-1 min-h-[125px] rounded-[24px] border border-yellow-500/40 bg-gradient-to-b from-yellow-950/20 to-black/85 p-3.5 flex flex-col justify-between relative overflow-hidden shadow-[0_0_20px_rgba(255,255,0,0.15)] group cursor-pointer"
                    >
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 pointer-events-none" />
                      
                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30">
                          <Scale size={10} className="text-yellow-400" />
                          <span className="text-[8px] font-black text-yellow-400 tracking-wider">HAKEM</span>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onRemoveRef(); }}
                          className="w-5 h-5 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500 hover:text-white transition-all"
                        >
                          <X size={10} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5 my-2 relative z-10">
                        <div className="relative w-10 h-10 shrink-0">
                          <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-[#FFFF00] opacity-80 blur-[2px]" />
                          <img src={selectedRef.avatar} className="relative w-full h-full rounded-full object-cover border border-black" referrerPolicy="no-referrer" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-white uppercase italic tracking-tight truncate">{selectedRef.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Star size={8} className="text-[#FFFF00] fill-[#FFFF00]" />
                            <span className="text-[9px] font-black text-[#FFFF00]">{selectedRef.rating.toFixed(1)}</span>
                            <span className="text-[8px] font-bold text-white/40">•</span>
                            <span className="text-[8px] font-black text-white/60 tracking-wider">OTO: {selectedRef.stats.authority}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between relative z-10 pt-1.5 border-t border-white/5">
                        <span className="text-[8px] font-black text-white/40 tracking-wider uppercase">ÜCRET</span>
                        <span className="text-[10px] font-black text-[#FFFF00]">+{selectedRef.fee} ₺</span>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.button 
                      whileHover={{ scale: 1.02, borderColor: 'rgba(255,255,0,0.5)', backgroundColor: 'rgba(255,255,0,0.03)' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onNavigate('MARKETPLACE_REF')}
                      className="flex-1 min-h-[125px] rounded-[24px] border border-dashed border-yellow-500/30 bg-[#161B22]/40 p-3.5 flex flex-col justify-between text-left relative overflow-hidden transition-all duration-300"
                    >
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shadow-[0_0_8px_#FFFF00]" />
                          <span className="text-[8px] font-black text-yellow-400/80 tracking-widest uppercase">OTORİTE EKSİK</span>
                        </div>
                        <div className="w-6 h-6 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400">
                          <Plus size={12} />
                        </div>
                      </div>

                      <div className="my-2">
                        <h4 className="text-[11px] font-black text-white uppercase italic tracking-tight">RESMİ HAKEM</h4>
                        <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Adil Yönetim</p>
                      </div>

                      <div className="flex items-center justify-between w-full pt-1.5 border-t border-white/5">
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-wider">BAŞLANGIÇ</span>
                        <span className="text-[9px] font-black text-white/80">200 ₺</span>
                      </div>
                    </motion.button>
                  )}
                </div>
            </div>

           {/* Section 2: Essentials */}
           <div>
               <div className="flex items-center gap-2 mb-3 mt-6">
                   <Shirt size={16} className="text-blue-400" />
                   <h3 className="text-xs font-bold text-white uppercase tracking-wider">Ekipman & İçecek</h3>
               </div>
               <div className="grid grid-cols-1 gap-3">
                   <EquipmentItem icon={<Footprints size={18} />} title="Krampon" price={prices.boots} count={bootsCount} setCount={setBootsCount} />
                   <EquipmentItem icon={<Shirt size={18} />} title="Yelek" price={prices.vests} count={vestsCount} setCount={setVestsCount} />
                   <EquipmentItem icon={<Droplets size={18} />} title="Su (1.5L)" price={prices.water} count={waterCount} setCount={setWaterCount} />
               </div>
           </div>

           <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-2xl flex items-start gap-3 mt-4">
               <Info className="text-blue-400 shrink-0" size={20} />
               <p className="text-xs text-blue-200 leading-relaxed">
                   Seçilen hizmetler ve ekipmanlar maç saatinde sahada hazır olacaktır.
               </p>
           </div>
       </main>

       {/* Footer */}
       <div className="absolute bottom-0 left-0 w-full bg-[#0A0E14] border-t border-white/10 p-6 pb-8 z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
           <div className="flex justify-between items-center mb-4">
               <div>
                   <p className="text-gray-400 text-xs font-bold uppercase">Ekstra Tutar</p>
                   <p className="text-xs text-gray-600">Saha ücretine eklenir</p>
               </div>
               <span className="text-3xl font-black text-white">+{calculateTotal()}₺</span>
           </div>
           <button 
            onClick={handleContinue}
            className="w-full h-16 bg-[#FFFF00] text-black font-black text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-yellow-300 transition-all shadow-lg shadow-yellow-900/20 active:scale-95"
           >
               REZERVASYONU VE KADROYU ONAYLA
               <ArrowRight size={20} />
           </button>
       </div>

       {/* Cancellation Policy Modal */}
       <AnimatePresence>
         {showCancelPolicy && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-black/80 backdrop-blur-sm"
               onClick={() => setShowCancelPolicy(false)}
             />
             <motion.div 
               initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
               className="bg-[#161B22] border border-red-500/30 rounded-3xl p-6 w-full max-w-md relative z-10 overflow-hidden"
             >
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500" />
               <div className="flex items-center gap-3 mb-4">
                 <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                   <Shield size={24} />
                 </div>
                 <div>
                   <h3 className="text-lg font-black text-white">Güvenli Ödeme & İptal Politikası</h3>
                   <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Lütfen Okuyun</p>
                 </div>
               </div>
               
               <div className="space-y-3 mb-6">
                 <div className="bg-[#0A0E14] rounded-xl p-4 border border-white/5 flex gap-3 items-start">
                   <CreditCard size={16} className="text-[#39FF14] shrink-0 mt-0.5" />
                   <p className="text-xs text-gray-300 font-medium leading-relaxed">
                     <strong className="text-white">Escrow (Havuz) Sistemi:</strong> Ödemeniz OYNA havuzunda güvence altında tutulur. Maç sorunsuz bittiğinde hizmet verene (kaleci/hakem) aktarılır.
                   </p>
                 </div>
                 <div className="bg-[#0A0E14] rounded-xl p-4 border border-white/5 flex gap-3 items-start">
                   <Info size={16} className="text-orange-400 shrink-0 mt-0.5" />
                   <p className="text-xs text-gray-300 font-medium leading-relaxed">
                     <strong className="text-white">İptal Kesintisi:</strong> Maça <strong className="text-orange-400">12 saatten az</strong> kala iptal ederseniz, mağduriyet önleme bedeli olarak tutarın %50'si kaleciye/hakeme aktarılır.
                   </p>
                 </div>
                 <div className="bg-[#0A0E14] rounded-xl p-4 border border-white/5 flex gap-3 items-start">
                   <CheckCircle2 size={16} className="text-blue-400 shrink-0 mt-0.5" />
                   <p className="text-xs text-gray-300 font-medium leading-relaxed">
                     <strong className="text-white">Tam İade:</strong> Hizmet veren (kaleci/hakem) maça gelmezse veya iptal ederse %100 kesintisiz iade + OYNA Kuponu kazanırsınız.
                   </p>
                 </div>
               </div>

               <div className="flex gap-3">
                 <button 
                   onClick={() => setShowCancelPolicy(false)}
                   className="flex-1 py-3.5 rounded-xl font-bold text-sm text-gray-400 bg-white/5 hover:bg-white/10 transition-colors"
                 >
                   Vazgeç
                 </button>
                 <button 
                   onClick={handleConfirmPolicy}
                   className="flex-1 py-3.5 rounded-xl font-black text-sm text-black bg-[#FFFF00] hover:bg-yellow-400 transition-colors shadow-[0_0_20px_rgba(255,255,0,0.2)]"
                 >
                   OKUDUM, ONAYLIYORUM
                 </button>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>
    </div>
  );
};

export default BookingAddons;
