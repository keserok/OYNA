/**
 * Saha Vitrini kartı — TEK KAYNAK.
 * Oyuncu Saha Keşfet listesinde çizilen vitrin kartının kendisi; admin
 * PitchStudio "Canlı Ayna"sı da birebir bu bileşeni çizer. Kartın görselinde
 * yapılacak her değişiklik YALNIZ burada yapılır — iki ayrı kart / drift yok.
 * onToggleFavorite verilmezse favori yıldızı hiç çizilmez (admin aynası),
 * onClick verilmezse kart tıklanamaz (cursor-default).
 */
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Star, Layers } from 'lucide-react';
import { Pitch } from '../../types';
import { transformedImageUrl } from '../../utils/imageTransform';

/** Favori/puan ayrımı: favori = büyük sarı yıldız (dolu/boş), puan = küçük altın yıldız */
export const FavStar: React.FC<{ active: boolean; size?: number }> = ({ active, size = 18 }) => (
  <Star
    size={size}
    className={active ? 'fill-[#FFFF00] text-[#FFFF00]' : 'text-white'}
    strokeWidth={2}
  />
);

/** Görsel yoksa/kırıksa tasarımdaki yeşil gradient'e düşen güvenli görsel (Karar #11) */
export const SafeImage: React.FC<{ src?: string; alt: string; className?: string; variant?: 'card' | 'detail' | 'thumb' }> = ({ src, alt, className, variant = 'card' }) => {
  const [failed, setFailed] = useState(false);
  const url = transformedImageUrl(src, variant);
  if (!url || failed) {
    return (
      <div className={`${className ?? ''} bg-[linear-gradient(160deg,#143a22_0%,#0b1f14_55%,#05080c_100%)] flex items-center justify-center`}>
        <Layers size={28} className="text-white/15" />
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
};

/** Vitrin kartı — editoryal tam genişlik kart (tasarım 1a) */
export const PitchShowcaseCard: React.FC<{
  pitch: Pitch;
  isFavorite?: boolean;
  onToggleFavorite?: (pitch: Pitch) => void;
  onClick?: (pitch: Pitch) => void;
}> = ({ pitch, isFavorite = false, onToggleFavorite, onClick }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={onClick ? 'cursor-pointer' : 'cursor-default'}
      onClick={onClick ? () => onClick(pitch) : undefined}
    >
      <div className="relative h-52 rounded-3xl overflow-hidden border border-white/5">
        <SafeImage src={pitch.image} alt={pitch.name} className="w-full h-full object-cover" variant="card" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />

        {/* Rozetler: indirim + öne çıkan */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {pitch.flashDiscount ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 text-[10px] font-black text-white shadow-md">
              🔥 %{pitch.flashDiscount} İNDİRİM
            </span>
          ) : null}
          {pitch.isFeatured && (
            <span className="px-2 py-1 rounded-lg bg-[#FFFF00] text-[10px] font-black text-black shadow-md uppercase">Öne Çıkan</span>
          )}
        </div>

        {/* Favori yıldızı — yalnız oyuncu tarafında (onToggleFavorite verildiyse) çizilir */}
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(pitch); }}
            title={isFavorite ? 'Favorilerden çıkar' : 'Favorilere ekle'}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/15 flex items-center justify-center active:scale-90 transition-transform"
          >
            <FavStar active={isFavorite} />
          </button>
        )}

        {/* Mesafe */}
        {pitch.distance && (
          <div className="absolute left-3 bottom-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/50 backdrop-blur-md border border-white/10">
            <MapPin size={11} className="text-[#39FF14]" />
            <span className="text-[11px] font-extrabold text-white">{pitch.distance}</span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between mt-3 gap-3">
        <h3 className="text-lg font-black italic uppercase tracking-tight leading-none text-white">{pitch.name}</h3>
        <div className="flex items-center gap-1 shrink-0">
          {/* V-2: gerçek değerlendirme (platform veya Google) yoksa "5.0" değil "Yeni". */}
          {(pitch.ratingCount > 0 || pitch.googleReviews > 0) ? (
            <>
              <Star size={12} className="fill-[#FACC15] text-[#FACC15]" />
              <span className="text-sm font-extrabold text-white">{pitch.rating.toFixed(1)}</span>
              {pitch.googleReviews > 0 && (
                <span className="text-xs font-medium text-white/45">({pitch.googleReviews})</span>
              )}
            </>
          ) : (
            <span className="text-[11px] font-black uppercase tracking-wide text-white/40">Yeni</span>
          )}
        </div>
      </div>
      <p className="mt-1 text-[13px] font-medium text-white/55">{pitch.district}</p>

      <div className="mt-2.5 flex items-end justify-between">
        <div>
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-white/40 mb-0.5">Ort. Saatlik</span>
          <span className="flex items-baseline gap-2">
            <span className={`text-lg font-black ${pitch.originalPrice ? 'text-[#39FF14]' : 'text-white'}`}>~₺{pitch.totalPrice}</span>
            {pitch.originalPrice && (
              <span className="text-[13px] font-semibold text-white/35 line-through">₺{pitch.originalPrice}</span>
            )}
          </span>
        </div>
        {/* Müsaitlik rozeti: yalnız admin show_availability_badge açtıysa gösterilir */}
        {pitch.showAvailabilityBadge && pitch.todayAvailableCount !== undefined && (
          pitch.todayAvailableCount > 0 ? (
            <span className="px-3 py-2 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/35 text-[#39FF14] text-[11px] font-black">
              Bugün {pitch.todayAvailableCount} saat müsait
            </span>
          ) : (
            <span className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[11px] font-black">
              Bugün dolu
            </span>
          )
        )}
      </div>
    </motion.div>
  );
};
