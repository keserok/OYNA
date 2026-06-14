import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, MapPin, Star, Sun, Moon, Sparkles, Activity } from 'lucide-react';
import { Pitch } from '../types';

interface PitchShowcaseCardProps {
  pitch: Pitch;
  variant?: 'list' | 'preview';
  onClick?: (pitch: Pitch) => void;
  showOccupancy?: boolean;
  occupancyPct?: number;
}

const getGrade = (s: number) => {
  if (s >= 95) return 'A+';
  if (s >= 90) return 'A';
  if (s >= 85) return 'A-';
  if (s >= 80) return 'B+';
  if (s >= 75) return 'B';
  if (s >= 70) return 'B-';
  return 'C';
};

const gradeColor = (g: string) =>
  g.startsWith('A') ? 'text-emerald-400' : g.startsWith('B') ? 'text-yellow-400' : 'text-orange-400';

const occupancyColor = (pct: number) => {
  if (pct >= 85) return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (pct >= 60) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
};

/**
 * PITCH SHOWCASE CARD
 * Player tarafında PitchDiscovery'de, MatchCreate PitchSelectStep'de
 * ve Owner tarafında VitrinStudio canlı önizlemede aynı kart kullanılır.
 *
 * variant='preview' → Owner stüdyosunda küçük etiket gösterir, hover efekti açar.
 */
const PitchShowcaseCard: React.FC<PitchShowcaseCardProps> = ({
  pitch,
  variant = 'list',
  onClick,
  showOccupancy = false,
  occupancyPct
}) => {
  const [isFavorite, setIsFavorite] = useState(false);

  const lightingScore = pitch.lighting || 85;
  const grassScore = pitch.grassQuality || 85;
  const lockerScore = pitch.lockerRoomQuality || 80;

  // Owner'ın elle koyduğu A/B/C varsa onu kullan, yoksa skordan hesapla
  const grassGrade = pitch.qualityGrades?.grass || pitch.grassGrade || getGrade(grassScore);
  const lightingGrade = pitch.qualityGrades?.lighting || pitch.lightingGrade || getGrade(lightingScore);
  const lockerGrade = pitch.qualityGrades?.lockerRoom || pitch.lockerRoomGrade || getGrade(lockerScore);

  const avgGrade = (() => {
    const grades = [grassGrade, lightingGrade, lockerGrade];
    if (grades.every((g) => g.startsWith('A'))) return 'A';
    if (grades.filter((g) => g.startsWith('A')).length >= 2) return 'A-';
    if (grades.every((g) => g.startsWith('C'))) return 'C';
    return 'B';
  })();
  const avgColor = gradeColor(avgGrade);

  // Kapak fotosu: owner'ın seçtiği indeks > image > images[0]
  const coverIdx = pitch.coverImageIndex ?? 0;
  const coverImage = pitch.images?.[coverIdx] || pitch.image || pitch.images?.[0];

  // Öne çıkan amenities: owner seçimi > ilk 2
  const displayAmenities =
    pitch.featuredAmenities && pitch.featuredAmenities.length > 0
      ? pitch.featuredAmenities.slice(0, 3)
      : pitch.amenities?.slice(0, 2) || [];

  const dayPrice = pitch.totalPrice;
  const nightPrice = Math.round(pitch.totalPrice * 1.25);

  const campaign = pitch.showcaseCampaign;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col gap-3 mb-6 cursor-pointer group bg-[#161B22]/60 backdrop-blur-sm rounded-[32px] p-2.5 border border-white/5 hover:border-white/10 transition-all shadow-xl ${
        variant === 'preview' ? 'ring-2 ring-[#FFFF00]/20' : ''
      }`}
      onClick={() => onClick?.(pitch)}
    >
      {/* Preview rozeti */}
      {variant === 'preview' && (
        <div className="absolute -top-3 left-4 z-10 px-3 py-1 bg-[#FFFF00] text-black text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg">
          Canlı Önizleme
        </div>
      )}

      {/* Image Container */}
      <div className="relative w-full aspect-[16/9] rounded-3xl overflow-hidden shadow-lg bg-[#0A0E14]">
        {coverImage && (
          <img
            src={coverImage}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            alt={pitch.name}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14]/90 via-black/20 to-transparent"></div>

        {/* Kampanya Bandı */}
        {campaign && (
          <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-[#FFFF00]/90 to-[#FFFF00]/0 z-20">
            <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md rounded-xl px-3 py-2 border border-[#FFFF00]/30 shadow-lg">
              <Sparkles size={14} className="text-[#FFFF00] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-[#FFFF00] truncate">{campaign.title}</p>
                {campaign.subtitle && (
                  <p className="text-[9px] text-white/80 truncate">{campaign.subtitle}</p>
                )}
              </div>
              {campaign.discountPct && (
                <span className="text-xs font-black text-[#FFFF00] bg-black/40 px-2 py-0.5 rounded-md">
                  %{campaign.discountPct}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Favorite */}
        {variant === 'list' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFavorite(!isFavorite);
            }}
            className={`absolute ${campaign ? 'top-16' : 'top-4'} right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center hover:scale-110 transition-transform z-10 border border-white/10`}
          >
            <Heart
              size={18}
              className={isFavorite ? 'fill-[#FF385C] text-[#FF385C]' : 'fill-black/30 text-white'}
              strokeWidth={2}
            />
          </button>
        )}

        {/* Grade Badge */}
        <div
          className={`absolute ${campaign ? 'top-16' : 'top-4'} left-4 px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-2 shadow-2xl`}
        >
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Saha Notu</span>
          <div className="w-1 h-3 rounded-full bg-white/20"></div>
          <span className={`text-base font-black ${avgColor} drop-shadow-[0_0_8px_currentColor]`}>{avgGrade}</span>
        </div>

        {/* Bottom Row */}
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
          <div className="flex gap-2 flex-wrap">
            {displayAmenities.map((amenity, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-lg text-[9px] font-black text-white uppercase tracking-widest shadow-sm"
              >
                {amenity}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/10 shadow-lg">
            <Star size={12} className="fill-[#FFFF00] text-[#FFFF00]" />
            <span className="text-[12px] font-black text-white">{pitch.rating}</span>
            <span className="text-[10px] text-gray-400 font-bold ml-1 tracking-widest">
              ({pitch.googleReviews})
            </span>
          </div>
        </div>
      </div>

      {/* Info Container */}
      <div className="flex flex-col px-3 pb-2 pt-1">
        <div className="flex justify-between items-start mb-1.5">
          <h3 className="text-xl font-black text-white truncate pr-4 italic tracking-tighter">{pitch.name}</h3>
          {showOccupancy && typeof occupancyPct === 'number' && (
            <span
              className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${occupancyColor(
                occupancyPct
              )} flex items-center gap-1 shrink-0`}
            >
              <Activity size={10} /> %{occupancyPct} DOLU
            </span>
          )}
        </div>

        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
          <MapPin size={12} className="text-[#39FF14]" /> {pitch.district}
          <span className="opacity-30 mx-1">•</span> {pitch.distance}
        </p>

        <div className="flex gap-2">
          {/* Day Price */}
          <div className="flex-1 bg-[#0A0E14] border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center relative overflow-hidden group-hover:border-white/10 transition-colors shadow-inner">
            <Sun size={24} className="text-yellow-400/10 absolute -top-1 -left-1" strokeWidth={3} />
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 z-10">
              Gündüz
            </span>
            <div className="flex items-baseline gap-1 z-10">
              <span className="text-lg font-black text-white tracking-tighter">{dayPrice}₺</span>
              <span className="text-[10px] text-gray-500 font-bold uppercase">/saat</span>
            </div>
          </div>
          {/* Night Price */}
          <div className="flex-1 bg-[#0A0E14] border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center relative overflow-hidden group-hover:border-white/10 transition-colors shadow-inner">
            <Moon size={24} className="text-blue-400/10 absolute -top-1 -left-1" strokeWidth={3} />
            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 z-10">
              Gece
            </span>
            <div className="flex items-baseline gap-1 z-10">
              <span className="text-lg font-black text-[#FFFF00] tracking-tighter">{nightPrice}₺</span>
              <span className="text-[10px] text-gray-500 font-bold uppercase">/saat</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PitchShowcaseCard;
