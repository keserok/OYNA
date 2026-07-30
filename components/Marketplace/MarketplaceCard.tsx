
import React from 'react';
import { motion } from 'framer-motion';
import { Star, MapPin, ChevronRight, BadgeCheck, Shield, Scale } from 'lucide-react';
import { Goalkeeper, Referee } from '../../types';
import { getInitials } from '../ui/Avatar';
import { formatTRYShort } from '../../utils/formatTRY';

// Rol bazlı tema — Dashboard giriş kartlarıyla tutarlı: Kaleci = neon yeşil,
// Hakem = mavi. (Eski "brand-primary" sınıfları Tailwind temasında tanımsızdı
// ve hakem vurguları hiç render olmuyordu.)
export const ROLE_THEME = {
  GK: {
    accent: '#39FF14',
    soft: 'rgba(57,255,20,0.10)',
    border: 'rgba(57,255,20,0.35)',
    label: 'Kaleci',
    icon: Shield,
  },
  REF: {
    accent: '#60A5FA',
    soft: 'rgba(96,165,250,0.10)',
    border: 'rgba(96,165,250,0.35)',
    label: 'Hakem',
    icon: Scale,
  },
} as const;

interface MarketplaceCardProps {
  item: Goalkeeper | Referee;
  type: 'GK' | 'REF';
  onClick: () => void;
  /** Kullanıcı konumuna göre hesaplanan gerçek mesafe; yoksa gösterilmez (sahte "2.4 KM" fallback kaldırıldı — Plan 8A.6). */
  distanceKm?: number | null;
}

const InfoPill: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[0.6875rem] font-bold text-white/70 leading-none whitespace-nowrap ${className}`}>
    {children}
  </span>
);

export const MarketplaceCard: React.FC<MarketplaceCardProps> = ({ item, type, onClick, distanceKm }) => {
  const theme = ROLE_THEME[type];
  const isGK = type === 'GK';
  // Görsel yüklenemezse baş harflere düş (kırık kare görünmesin)
  const [imgBroken, setImgBroken] = React.useState(false);
  React.useEffect(() => { setImgBroken(false); }, [item.avatar]);

  const unavailable = item.isAvailable === false;
  const reviewCount = item.reviews?.length ?? 0;
  const matchCount = (item as Referee).matchCount ?? (item as Goalkeeper).matchCount ?? 0;
  const styleLabel = typeof item.style === 'string' && item.style.trim() ? item.style : null;
  const subMeta = isGK
    ? ((item as Goalkeeper).age ? `${(item as Goalkeeper).age} yaş` : null)
    : ((item as Referee).level || null);
  const zone = item.preferredZones?.[0]?.split('/').pop()?.trim() || null;
  const hasRating = (item.rating ?? 0) > 0;

  return (
    <motion.button
      layout
      type="button"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={`relative w-full text-left overflow-hidden rounded-3xl border bg-[#11161F] p-4 flex gap-3.5 items-center transition-colors duration-200 border-white/[0.06] hover:border-white/[0.14] hover:bg-[#151B26] cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.25)] ${unavailable ? 'opacity-70' : ''}`}
    >
      {/* Rol vurgulu ambient parıltı */}
      <div
        className="absolute -top-14 -left-14 w-32 h-32 rounded-full blur-[46px] opacity-[0.14] pointer-events-none"
        style={{ backgroundColor: theme.accent }}
      />

      {/* Avatar — foto yoksa baş harf, elite'e degrade çerçeve */}
      <div className="relative shrink-0">
        <div
          className="w-14 h-14 rounded-2xl p-[2px]"
          style={{
            background: item.isElite
              ? `linear-gradient(140deg, ${theme.accent} 0%, rgba(255,255,255,0.14) 55%, transparent 100%)`
              : 'rgba(255,255,255,0.08)',
          }}
        >
          {item.avatar && !imgBroken ? (
            <img
              src={item.avatar}
              alt={item.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgBroken(true)}
              className="w-full h-full object-cover rounded-[14px] bg-white/5"
            />
          ) : (
            <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-white/10 to-white/[0.03] flex items-center justify-center">
              <span className="text-sm font-extrabold text-white/80">{getInitials(item.name)}</span>
            </div>
          )}
        </div>
        {/* Müsaitlik noktası */}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#11161F]"
          style={{ backgroundColor: unavailable ? '#6B7280' : '#22C55E' }}
          aria-label={unavailable ? 'Müsait değil' : 'Müsait'}
        />
      </div>

      {/* Kimlik + gerçek veri rozetleri */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[0.9375rem] font-extrabold text-white tracking-tight truncate">{item.name}</h3>
          {item.isElite && <BadgeCheck size={15} className="shrink-0" style={{ color: theme.accent }} />}
        </div>
        <p className="text-[0.6875rem] font-semibold text-ink-4 truncate mt-0.5">
          <span style={{ color: theme.accent }}>{theme.label}</span>
          {styleLabel && <> · {styleLabel}</>}
          {subMeta && <> · {subMeta}</>}
        </p>

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <InfoPill>
            <Star size={10} className={hasRating ? 'fill-amber-400 text-amber-400' : 'text-ink-4'} />
            {hasRating ? (
              <>
                <span className="text-white font-numeric">{item.rating.toFixed(1)}</span>
                {reviewCount > 0 && <span className="text-ink-4">({reviewCount})</span>}
              </>
            ) : (
              <span className="text-white/55">Yeni</span>
            )}
          </InfoPill>
          {matchCount > 0 && (
            <InfoPill>
              <span className="font-numeric text-white">{matchCount}</span> maç
            </InfoPill>
          )}
          {distanceKm != null && (
            <InfoPill>
              <MapPin size={10} className="text-ink-4" />
              <span className="font-numeric text-white">{distanceKm.toFixed(1)}</span> km
            </InfoPill>
          )}
          {zone && <InfoPill className="max-w-[110px]"><span className="truncate capitalize">{zone}</span></InfoPill>}
        </div>
      </div>

      {/* Ücret + profil oku */}
      <div className="shrink-0 self-stretch flex flex-col items-end justify-between pl-3 border-l border-white/[0.06] py-0.5">
        <div className="text-right">
          <span className="block text-lg font-extrabold text-white font-numeric leading-none">
            {formatTRYShort(item.fee)}
          </span>
          <span className="block text-[0.625rem] font-bold text-ink-4 uppercase tracking-wider mt-1">maç başı</span>
        </div>
        {unavailable ? (
          <span className="text-[0.625rem] font-extrabold uppercase tracking-wider text-ink-4">Müsait Değil</span>
        ) : (
          <span
            className="inline-flex items-center gap-0.5 text-[0.625rem] font-extrabold uppercase tracking-wider"
            style={{ color: theme.accent }}
          >
            Profil <ChevronRight size={12} />
          </span>
        )}
      </div>
    </motion.button>
  );
};
