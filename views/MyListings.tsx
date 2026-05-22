
import React from 'react';
import { ArrowLeft, Plus, Clock, MapPin, Users, ChevronRight, Shield, Scale } from 'lucide-react';
import { AppView } from '../types';

interface MyListingsProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const MyListings: React.FC<MyListingsProps> = ({ onBack, onNavigate }) => {
  const mockListings = [
    {
      id: 'list-1',
      type: 'GK',
      title: 'Kaleci Arıyoruz',
      pitch: 'Arena Sport Center',
      time: 'Bugün, 21:00',
      bids: 5,
      status: 'ACTIVE'
    },
    {
      id: 'list-2',
      type: 'REF',
      title: 'Hakem Arıyoruz',
      pitch: 'Vadi Spor Tesisleri',
      time: 'Yarın, 20:00',
      bids: 2,
      status: 'ACTIVE'
    }
  ];

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
      <header className="p-6 flex items-center justify-between border-b border-white/5 bg-[#0A0E14]/80 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-[#161B22] rounded-full text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-sm font-black tracking-widest text-white uppercase">İLANLARIM</h1>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
        <button className="w-full py-6 border-2 border-dashed border-white/10 rounded-[32px] flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-white hover:border-white/20 transition-all group">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#FFFF00] group-hover:text-black transition-colors">
                <Plus size={24} />
            </div>
            <span className="font-black text-xs uppercase tracking-widest">YENİ İLAN OLUŞTUR</span>
        </button>

        <div className="space-y-4">
            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">AKTİF İLANLAR</h2>
            {mockListings.map(listing => (
                <div 
                    key={listing.id}
                    onClick={() => onNavigate('LISTING_DETAILS')}
                    className="bg-[#161B22] border border-white/5 rounded-[32px] p-6 flex items-center gap-4 hover:border-white/10 transition-all cursor-pointer group"
                >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${listing.type === 'GK' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
                        {listing.type === 'GK' ? <Shield size={28} /> : <Scale size={28} />}
                    </div>
                    
                    <div className="flex-1">
                        <h3 className="font-black text-white text-lg italic tracking-tighter">{listing.title}</h3>
                        <div className="flex flex-col gap-1 mt-1">
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold">
                                <MapPin size={12} /> {listing.pitch}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold">
                                <Clock size={12} /> {listing.time}
                            </div>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="inline-flex items-center gap-1.5 bg-[#FFFF00]/10 px-3 py-1.5 rounded-full border border-[#FFFF00]/20 mb-2">
                            <Users size={12} className="text-[#FFFF00]" />
                            <span className="text-[10px] font-black text-[#FFFF00]">{listing.bids} TEKLİF</span>
                        </div>
                        <ChevronRight size={20} className="text-gray-700 group-hover:text-white transition-transform group-hover:translate-x-1" />
                    </div>
                </div>
            ))}
        </div>
      </main>
    </div>
  );
};

export default MyListings;
