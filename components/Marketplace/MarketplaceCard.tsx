
import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Scale, Star, Navigation, Sparkles } from 'lucide-react';
import { Goalkeeper, Referee } from '../../types';
import { formatTRY } from '../../utils/formatTRY';

interface MarketplaceCardProps {
  item: Goalkeeper | Referee;
  type: 'GK' | 'REF';
  onClick: () => void;
}

export const MarketplaceCard: React.FC<MarketplaceCardProps> = ({ item, type, onClick }) => {
  const [isFavorite, setIsFavorite] = React.useState(false);
  const isGK = type === 'GK';
  const roleLabel = isGK ? 'Kaleci' : 'Hakem';

  // Dürüstlük (KS0): puanı olmayan (hiç puanlanmamış) sağlayıcı "—" gösterir;
  // sahte "0.0" yok. GK/REF puanı 0-10 ölçeğinde (service_ratings ort.); DB
  // varsayılanı 0 → yalnız gerçek puan alındığında >0 olur. matchCount bug'lı
  // (KD-1, hiç artmıyor) olduğundan rookie ölçütü olarak PUAN>0 kullanılır.
  const rated = typeof item.rating === 'number' && item.rating > 0;

  // Null/eksik stats guard — goalkeepers/referees.stats nullable jsonb; sahte
  // %80 bar yok. Gerçek sayı yoksa null → "istatistik yok" durumu gösterilir.
  const s = (item.stats ?? {}) as Record<string, unknown>;
  const statOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const bars: { label: string; value: number | null; color: string }[] = isGK
    ? [
        { label: 'REFLEKS', value: statOrNull(s.reflexes), color: 'bg-emerald-400' },
        { label: 'UÇUŞ', value: statOrNull(s.diving), color: 'bg-emerald-500' },
        { label: 'POZİSYON', value: statOrNull(s.positioning), color: 'bg-teal-400' },
      ]
    : [
        { label: 'OTORİTE', value: statOrNull(s.authority), color: 'bg-yellow-400' },
        { label: 'KONDİSYON', value: statOrNull(s.fitness), color: 'bg-amber-400' },
        { label: 'İLETİŞİM', value: statOrNull(s.communication), color: 'bg-orange-400' },
      ];
  const hasStats = bars.some((b) => b.value != null);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      className="relative overflow-hidden rounded-[24px] border border-white/5 bg-[#161B22]/60 backdrop-blur-md p-4 flex gap-4 items-center group transition-all duration-300 hover:border-white/10 hover:bg-[#161B22]/80 cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.3)] mb-3"
      onClick={onClick}
    >
      {/* Ambient Glow */}
      <div 
        className="absolute -top-12 -left-12 w-28 h-28 blur-[40px] opacity-10 pointer-events-none transition-opacity duration-300 group-hover:opacity-20"
        style={{ backgroundColor: isGK ? '#39FF14' : '#FACC15' }}
      />



      {/* Left Column: Avatar & Glow Circle & Rating Badge */}
      <div className="relative w-16 h-16 shrink-0">
        <div 
          className="absolute -inset-0.5 rounded-full border border-white/10"
        />
        <div 
          className="absolute inset-0 rounded-full p-[3px]"
          style={{
            background: isGK 
              ? 'linear-gradient(135deg, rgba(57,255,20,0.6) 0%, rgba(16,185,129,0.1) 100%)' 
              : 'linear-gradient(135deg, rgba(250,204,21,0.6) 0%, rgba(245,158,11,0.1) 100%)'
          }}
        >
          <img 
            src={item.avatar} 
            alt={item.name} 
            className="w-full h-full object-cover rounded-full"
            referrerPolicy="no-referrer"
          />
        </div>
        <div 
          className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-black text-black leading-none uppercase shadow-md flex items-center justify-center"
          style={{ backgroundColor: isGK ? '#39FF14' : '#FACC15' }}
        >
          {rated ? item.rating.toFixed(1) : '—'}
        </div>
      </div>

      {/* Middle Column: Name, Description & Micro Stats */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1.5 mb-0.5">
          <h3 className="text-sm font-black text-white uppercase italic tracking-tight truncate leading-tight">
            {item.name}
          </h3>
          {item.isElite && (
            <Sparkles size={11} className={isGK ? 'text-emerald-400' : 'text-brand-primary'} />
          )}
        </div>
        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest leading-none mb-2">
          {roleLabel}{item.distance ? ` • ${item.distance} KM YAKINDA` : ''}
        </p>

        {/* Micro Performance Bars — gerçek stat yoksa sahte %80 değil, dürüst
            "istatistik yok" durumu (KS0). */}
        {hasStats ? (
          <div className="grid grid-cols-3 gap-2 mt-1">
            {bars.map((b) => (
              <div key={b.label} className="space-y-0.5">
                <span className="text-[7.5px] font-bold text-gray-500 block uppercase tracking-tighter truncate">{b.label}</span>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full ${b.color} rounded-full`} style={{ width: `${b.value ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[8.5px] font-bold text-gray-600 uppercase tracking-wider mt-1">
            Yeni {roleLabel.toLocaleLowerCase('tr-TR')} • henüz istatistik yok
          </p>
        )}
      </div>

      {/* Right Column: Fee & Call-to-action */}
      <div className="flex flex-col justify-between items-end shrink-0 self-stretch border-l border-white/5 pl-3 py-1.5 min-h-[90px]">
        {/* Favorite Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsFavorite(!isFavorite); }}
          className="p-1 rounded-full hover:scale-110 active:scale-95 transition-all text-white/40 hover:text-rose-500 z-10"
        >
          <svg 
            width="16" height="16" viewBox="0 0 24 24" 
            fill={isFavorite ? '#FF385C' : 'none'} 
            stroke={isFavorite ? '#FF385C' : 'currentColor'} 
            strokeWidth="2" 
            strokeLinecap="round" strokeLinejoin="round" 
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>

        <div className="text-right">
          <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest block leading-none">ÜCRET</span>
          <span className="text-[11px] font-black italic tracking-tight text-white block mt-1">
            {formatTRY(item.fee)}
          </span>
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all"
          style={{
            backgroundColor: isGK ? 'rgba(57,255,20,0.1)' : 'rgba(250,204,21,0.1)',
            borderColor: isGK ? 'rgba(57,255,20,0.25)' : 'rgba(250,204,21,0.25)',
            color: isGK ? '#39FF14' : '#FACC15',
            boxShadow: isGK ? '0 0 10px rgba(57,255,20,0.05)' : '0 0 10px rgba(250,204,21,0.05)'
          }}
        >
          KİRALA
        </motion.button>
      </div>
    </motion.div>
  );
};
