
import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, ArrowRight, Shirt, Footprints, Droplets, Info, 
  CheckCircle2, Hand, Scale, Users, Shield, Plus, ListFilter, 
  Sliders, X, Zap, Star, CreditCard, Handshake, ChevronRight, Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GOALKEEPERS, REFEREES } from '../constants';
import { Goalkeeper, Referee } from '../types';

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
  // Equipment State
  const [bootsCount, setBootsCount] = useState(0);
  const [vestsCount, setVestsCount] = useState(0);
  const [waterCount, setWaterCount] = useState(0);

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
            
            {/* Section 1: Talent Modules (Side-by-Side Buttons) */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <Users size={16} className="text-[#FFFF00]" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Profesyonel Destek</h3>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => onNavigate('MARKETPLACE_GK')}
                    className={`flex-1 h-24 rounded-3xl border flex flex-col items-center justify-center gap-2 transition-all relative overflow-hidden ${selectedGk ? 'bg-green-500/10 border-green-500 text-green-400' : 'bg-[#161B22] border-white/5 text-gray-400 hover:border-white/20'}`}
                  >
                    <Hand size={24} className={selectedGk ? 'text-green-400' : 'text-gray-500'} />
                    <span className="text-xs font-black uppercase tracking-widest">KALECİ</span>
                    {selectedGk && <CheckCircle2 size={14} className="absolute top-2 right-2 text-green-400" />}
                  </button>

                  <button 
                    onClick={() => onNavigate('MARKETPLACE_REF')}
                    className={`flex-1 h-24 rounded-3xl border flex flex-col items-center justify-center gap-2 transition-all relative overflow-hidden ${selectedRef ? 'bg-yellow-500/10 border-yellow-500 text-yellow-400' : 'bg-[#161B22] border-white/5 text-gray-400 hover:border-white/20'}`}
                  >
                    <Scale size={24} className={selectedRef ? 'text-yellow-400' : 'text-gray-500'} />
                    <span className="text-xs font-black uppercase tracking-widest">HAKEM</span>
                    {selectedRef && <CheckCircle2 size={14} className="absolute top-2 right-2 text-yellow-400" />}
                  </button>
                </div>

                {/* Status Indicators */}
                {(selectedGk || selectedRef) && (
                  <div className="bg-[#161B22] p-4 rounded-2xl border border-white/5 space-y-2">
                    {selectedGk && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full overflow-hidden border border-green-500/30">
                            <img src={selectedGk.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <span className="text-[10px] font-bold text-white uppercase">{selectedGk.name} Atandı</span>
                        </div>
                        <button onClick={onRemoveGk} className="text-gray-500 hover:text-red-400"><X size={14} /></button>
                      </div>
                    )}
                    {selectedRef && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full overflow-hidden border border-yellow-500/30">
                            <img src={selectedRef.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <span className="text-[10px] font-bold text-white uppercase">{selectedRef.name} Atandı</span>
                        </div>
                        <button onClick={onRemoveRef} className="text-gray-500 hover:text-red-400"><X size={14} /></button>
                      </div>
                    )}
                  </div>
                )}
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
    </div>
  );
};

export default BookingAddons;
