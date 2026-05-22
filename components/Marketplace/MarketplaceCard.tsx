
import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Scale, Star, Navigation, Sparkles } from 'lucide-react';
import { Goalkeeper, Referee } from '../../types';

interface MarketplaceCardProps {
  item: Goalkeeper | Referee;
  type: 'GK' | 'REF';
  onClick: () => void;
}

export const MarketplaceCard: React.FC<MarketplaceCardProps> = ({ item, type, onClick }) => {
  const [isFavorite, setIsFavorite] = React.useState(false);
  const isGK = type === 'GK';
  const roleLabel = isGK ? 'Kaleci' : 'Hakem';

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 mb-6 cursor-pointer group"
      onClick={onClick}
    >
      {/* Image Container */}
      <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden shadow-lg border border-white/5 bg-[#161B22]">
        <img 
          src={item.avatar} 
          alt={item.name} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>
        
        {/* Favorite Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsFavorite(!isFavorite); }}
          className="absolute top-3 right-3 p-2 rounded-full hover:scale-110 transition-transform z-10"
        >
          <svg 
            width="24" height="24" viewBox="0 0 24 24" 
            fill={isFavorite ? '#FF385C' : 'rgba(0,0,0,0.3)'} 
            stroke={isFavorite ? '#FF385C' : 'white'} 
            strokeWidth="1.5" 
            strokeLinecap="round" strokeLinejoin="round" 
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        {/* Elite Badge */}
        {item.isElite && (
          <div className="absolute top-3 left-3 px-2 py-1 bg-white/90 backdrop-blur-md text-black text-[10px] font-bold rounded-lg shadow-sm tracking-wide flex items-center gap-1 uppercase">
            <Sparkles size={10} /> {roleLabel}
          </div>
        )}
      </div>

      {/* Info Container */}
      <div className="flex flex-col px-1">
        <div className="flex justify-between items-start">
          <h3 className="text-base font-bold text-white truncate pr-4">{item.name}</h3>
          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            <Star size={13} className="fill-white text-white" />
            <span className="text-sm text-white font-medium">{item.rating}</span>
          </div>
        </div>
        <p className="text-[14px] text-gray-400 mt-0.5">{roleLabel} • {item.distance || '2.4'} km yakında</p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-[14px] font-bold text-[#39FF14] tracking-tight">MÜSAİT</span>
        </div>
      </div>
    </motion.div>
  );
};
