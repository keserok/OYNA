
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation } from 'lucide-react';
import { Goalkeeper, Referee } from '../../types';

interface MarketplaceMapProps {
  items: (Goalkeeper | Referee)[];
  type: 'GK' | 'REF';
  onSelect: (item: Goalkeeper | Referee) => void;
}

export const MarketplaceMap: React.FC<MarketplaceMapProps> = ({ items, type, onSelect }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isGK = type === 'GK';
  const accentColor = isGK ? '#22C55E' : '#EAB308';
  const accentBg = isGK ? 'bg-green-500' : 'bg-yellow-500';

  return (
    <div className="relative w-full h-full bg-[#050812] overflow-hidden">
      {/* Stylized Grid Background */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(#161B22_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#161B22_1px,transparent_1px),linear-gradient(to_bottom,#161B22_1px,transparent_1px)] [background-size:160px_160px]" />
      </div>

      {/* Radar Scan Effect */}
      <motion.div 
        animate={{ 
          scale: [1, 2],
          opacity: [0.3, 0]
        }}
        transition={{ 
          duration: 4,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border-2 border-[#FFFF00]/10 rounded-full pointer-events-none"
      />
      
      {/* Map Content (Simulated) */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* User Location */}
        <div className="relative">
          <motion.div 
            animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute -inset-4 bg-blue-500/20 rounded-full"
          />
          <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.5)] relative z-10" />
          <div className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[8px] font-black text-white uppercase tracking-widest">
            SİZİN KONUMUNUZ
          </div>
        </div>

        {/* Talent Pins */}
        {items.map((item, index) => {
          // Use item coordinates if available, otherwise use index-based distribution
          const x = item.coordinates ? (item.coordinates.lng - 29.0) * 2000 : (Math.cos(index * 0.6) * 150);
          const y = item.coordinates ? (item.coordinates.lat - 41.0) * 2000 : (Math.sin(index * 0.6) * 150);
          const isHovered = hoveredId === item.id;
          
          return (
            <motion.div
              key={item.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: index * 0.05 }}
              style={{ x, y }}
              className="absolute z-10"
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect(item)}
            >
              <div className="relative cursor-pointer group">
                {/* Pulse Effect */}
                <motion.div 
                  animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity, delay: index * 0.2 }}
                  className={`absolute -inset-3 ${accentBg}/20 rounded-full`}
                />
                
                {/* Pin Avatar */}
                <div className={`w-10 h-10 rounded-2xl overflow-hidden border-2 transition-all duration-300 ${isHovered ? 'scale-125 border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.4)]' : 'border-white/20'}`}>
                  <img src={item.avatar} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                </div>
                
                {/* Tooltip */}
                <AnimatePresence>
                  {isHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: -10, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-48 z-20 pointer-events-none"
                    >
                      <div className="bg-[#161B22] border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur-xl">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-[10px] font-black text-white italic truncate uppercase">{item.name}</p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded bg-black ${isGK ? 'text-green-400' : 'text-yellow-400'}`}>
                            {item.rating}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-[8px] text-gray-500 font-bold uppercase">Ücret</p>
                          <p className="text-xs font-black text-[#FFFF00]">{item.fee}₺</p>
                        </div>
                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-2">
                           <Navigation size={10} className="text-blue-400" />
                           <p className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter">
                             {item.distance || '1.2'} KM YAKINDA
                           </p>
                        </div>
                      </div>
                      {/* Arrow */}
                      <div className="w-3 h-3 bg-[#161B22] border-r border-b border-white/10 rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Map Controls Overlay */}
      <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end pointer-events-none">
          <div className="bg-black/40 backdrop-blur-md border border-white/5 p-4 rounded-3xl pointer-events-auto">
              <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${isGK ? 'bg-green-500' : 'bg-yellow-500'}`} />
                  <div>
                      <p className="text-[10px] font-black text-white uppercase tracking-widest">Canlı Radar</p>
                      <p className="text-[8px] text-gray-500 font-bold uppercase">Bölgenizdeki {isGK ? 'Kaleciler' : 'Hakemler'}</p>
                  </div>
              </div>
          </div>
          
          <div className="flex flex-col gap-2 pointer-events-auto">
              <button className="w-12 h-12 bg-[#161B22]/80 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center text-white hover:bg-white/10 transition-all">
                  <Plus size={20} />
              </button>
              <button className="w-12 h-12 bg-[#161B22]/80 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-center text-white hover:bg-white/10 transition-all">
                  <Minus size={20} />
              </button>
          </div>
      </div>
    </div>
  );
};

const Plus = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);

const Minus = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);
