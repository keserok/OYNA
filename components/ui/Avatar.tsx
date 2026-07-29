import React from 'react';

// Paylaşılan Avatar — baş harf yedeği + çevrimiçi nokta yuvası (Spec §4).
// SocialView/MessagesView/MyTeam'deki kopyaların yerine tek bileşen.

const SIZES = {
  sm: { box: 'w-8 h-8 rounded-xl', text: 'text-[11px]', dot: 'w-2 h-2 border' },
  md: { box: 'w-10 h-10 rounded-xl', text: 'text-xs', dot: 'w-2.5 h-2.5 border-2' },
  lg: { box: 'w-[50px] h-[50px] rounded-2xl', text: 'text-sm', dot: 'w-3 h-3 border-2' },
  xl: { box: 'w-20 h-20 rounded-3xl', text: 'text-2xl', dot: 'w-4 h-4 border-2' },
} as const;

export type AvatarSize = keyof typeof SIZES;

export const getInitials = (name?: string | null): string =>
  (name || 'O')
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('tr-TR');

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  online?: boolean | null; // null/undefined = nokta hiç çizilmez (gizlilik)
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', online, className = '' }) => {
  const s = SIZES[size];
  // Görsel yüklenemezse baş harflere düş (kırık/boş kare görünmesin)
  const [broken, setBroken] = React.useState(false);
  React.useEffect(() => { setBroken(false); }, [src]);
  return (
    <div className={`relative shrink-0 ${className}`}>
      {src && !broken ? (
        <img
          src={src}
          alt={name || 'Oyuncu'}
          className={`${s.box} object-cover bg-white/5`}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <div
          className={`${s.box} flex items-center justify-center bg-gradient-to-br from-white/10 to-white/5 border border-white/10`}
        >
          <span className={`${s.text} font-extrabold text-white/80`}>{getInitials(name)}</span>
        </div>
      )}
      {online === true && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${s.dot} rounded-full bg-[#39FF14] border-[#0A0E14]`}
          aria-label="Çevrimiçi"
        />
      )}
    </div>
  );
};

export default Avatar;
