
import React, { useState } from 'react';
import { ArrowLeft, Star, Handshake, Check, X, Minus, Plus, Shield, Activity } from 'lucide-react';
import { MOCK_BIDS } from '../constants';
import { IncomingBid } from '../types';

interface ListingDetailsProps {
  onBack: () => void;
}

const ListingDetails: React.FC<ListingDetailsProps> = ({ onBack }) => {
  const [selectedBid, setSelectedBid] = useState<IncomingBid | null>(null);
  const [counterPrice, setCounterPrice] = useState<number>(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successType, setSuccessType] = useState<'APPROVED' | 'COUNTER'>('APPROVED');

  const handleOpenNegotiation = (bid: IncomingBid) => {
    setSelectedBid(bid);
    setCounterPrice(bid.bidAmount);
  };

  const handleAction = (type: 'APPROVED' | 'COUNTER') => {
    setSuccessType(type);
    setSelectedBid(null);
    setShowSuccess(true);
    setTimeout(() => {
        setShowSuccess(false);
        if (type === 'APPROVED') onBack();
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
      <header className="p-6 flex items-center justify-between border-b border-white/5 bg-[#0A0E14]/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-[#161B22] rounded-full text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="text-center">
            <h1 className="text-sm font-black tracking-widest text-white uppercase">İLAN DETAYI</h1>
            <p className="text-[8px] font-bold text-gray-500 uppercase">Arena Sport Center • 21:00</p>
        </div>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar pb-24">
        <div className="flex items-center justify-between px-2">
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">GELEN TEKLİFLER (5)</h2>
            <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-[#FFFF00] rounded-full animate-pulse"></div>
                <span className="text-[9px] font-bold text-[#FFFF00] uppercase">Canlı</span>
            </div>
        </div>

        <div className="space-y-4">
            {MOCK_BIDS.map(bid => (
                <div 
                    key={bid.id}
                    className="bg-[#161B22] border border-white/5 rounded-[32px] p-5 flex flex-col gap-4 hover:border-white/10 transition-all"
                >
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <img src={bid.avatar} className="w-14 h-14 rounded-2xl object-cover border border-white/10" alt={bid.providerName} />
                            <div className="absolute -bottom-1 -right-1 bg-[#FFFF00] text-black p-1 rounded-lg border-2 border-[#161B22]">
                                <Shield size={10} fill="black" />
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <h3 className="font-black text-white text-base italic tracking-tighter">{bid.providerName}</h3>
                                <div className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded text-[10px] font-black text-yellow-400">
                                    <Star size={10} fill="currentColor" /> {bid.rating}
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">{bid.style} • 42 Maç</p>
                        </div>
                    </div>

                    <div className="bg-[#0A0E14] p-3 rounded-2xl border border-white/5">
                        <p className="text-[11px] text-gray-400 italic leading-relaxed">"{bid.note}"</p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <div>
                            <p className="text-[9px] font-bold text-gray-500 uppercase">TEKLİF TUTARI</p>
                            <p className="text-2xl font-black text-white tracking-tighter">{bid.bidAmount}₺</p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => handleOpenNegotiation(bid)}
                                className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-white hover:bg-white/10 transition-all"
                            >
                                PAZARLIK
                            </button>
                            <button 
                                onClick={() => handleAction('APPROVED')}
                                className="px-4 py-2.5 bg-[#FFFF00] rounded-xl text-[10px] font-black text-black hover:bg-yellow-300 transition-all shadow-lg shadow-yellow-900/20"
                            >
                                ONAYLA
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </main>

      {/* Negotiation Modal */}
      {selectedBid && (
          <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-end justify-center animate-in fade-in duration-300">
              <div className="bg-[#161B22] w-full max-w-md rounded-t-[40px] border-t border-white/10 p-8 animate-in slide-in-from-bottom duration-500 shadow-2xl">
                  
                  <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-8"></div>

                  <div className="flex items-center gap-6 mb-10">
                      <img src={selectedBid.avatar} className="w-20 h-20 rounded-2xl object-cover border-2 border-[#FFFF00]" />
                      <div>
                          <h2 className="text-3xl font-black text-white italic tracking-tighter">{selectedBid.providerName}</h2>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Karşı Teklif Veriliyor</p>
                      </div>
                  </div>

                  <div className="bg-[#0A0E14] p-8 rounded-[32px] border border-white/5 mb-8">
                      <p className="text-[10px] font-black text-gray-500 uppercase text-center mb-6 tracking-[0.2em]">YENİ TUTAR BELİRLEYİN</p>
                      
                      <div className="flex items-center justify-between mb-8">
                          <button 
                            onClick={() => setCounterPrice(Math.max(0, counterPrice - 25))}
                            className="w-14 h-14 rounded-2xl bg-[#161B22] border border-white/10 text-white flex items-center justify-center hover:border-[#FFFF00] transition-all"
                          >
                              <Minus size={24} />
                          </button>
                          
                          <div className="text-center">
                              <span className="text-6xl font-black text-white tracking-tighter">{counterPrice}</span>
                              <span className="text-xl font-bold text-[#FFFF00] ml-2">₺</span>
                          </div>

                          <button 
                            onClick={() => setCounterPrice(counterPrice + 25)}
                            className="w-14 h-14 rounded-2xl bg-[#161B22] border border-white/10 text-white flex items-center justify-center hover:border-[#FFFF00] transition-all"
                          >
                              <Plus size={24} />
                          </button>
                      </div>
                  </div>

                  <div className="flex gap-4">
                      <button 
                        onClick={() => setSelectedBid(null)}
                        className="flex-1 h-16 bg-[#0A0E14] text-white font-black rounded-2xl border border-white/10"
                      >
                          VAZGEÇ
                      </button>
                      <button 
                        onClick={() => handleAction('COUNTER')}
                        className="flex-[2] h-16 bg-[#FFFF00] text-black font-black text-lg rounded-2xl shadow-[0_0_30px_rgba(255,255,0,0.3)] flex items-center justify-center gap-3"
                      >
                          TEKLİFİ GÜNCELLE <Handshake size={24} />
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Success Overlay */}
      {showSuccess && (
          <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-300">
              <div className="relative w-32 h-32 mb-8">
                  <div className="absolute inset-0 bg-[#FFFF00] rounded-full blur-[40px] animate-pulse"></div>
                  <div className="relative w-full h-full bg-[#FFFF00] rounded-full flex items-center justify-center shadow-2xl">
                      {successType === 'APPROVED' ? <Check size={64} className="text-black" /> : <Activity size={64} className="text-black animate-spin-slow" />}
                  </div>
              </div>
              <h3 className="text-3xl font-black text-white italic tracking-tighter mb-2">
                  {successType === 'APPROVED' ? 'TRANSFER TAMAMLANDI!' : 'TEKLİF GÜNCELLENDİ'}
              </h3>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">
                  {successType === 'APPROVED' ? 'Kadroya dahil edildi.' : 'Karşı tarafın onayı bekleniyor.'}
              </p>
          </div>
      )}

    </div>
  );
};

export default ListingDetails;
