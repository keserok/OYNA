import React from 'react';
import { UserAvatar } from '../common/UserAvatar';
import { trInitials } from '../../utils/trUpper';

// Liste avatarı — baş harf yedeği + çevrimiçi nokta yuvası (Spec §4).
// SocialView/MessagesView/MyTeam'deki kopyaların yerine tek bileşen.
//
// GÖRÜNÜM BURADA TANIMLI DEĞİL: zemin, harf rengi, italik ve yazı tipi
// `UserAvatar`dan gelir. Bu dosya yalnız LİSTE ÖLÇÜSÜNÜ (kutu boyu, köşe
// yuvarlaklığı, punto) ve çevrimiçi noktasını ekler.
//
// Neden böyle: burada eskiden kendi rengi vardı (`from-white/10 to-white/5`
// gradyan + `text-white/80` soluk harf) ve İTALİK DEĞİLDİ. Aynı oyuncu
// Mesajlar'da soluk düz harfle, profilinde parlak italik harfle görünüyordu —
// kurucunun "birinin yuvarlağı bir türlü, birininki başka türlü" dediği kayma.

const SIZES = {
  sm: { box: 'w-8 h-8 rounded-xl', text: 'text-[0.6875rem]', dot: 'w-2 h-2 border' },
  md: { box: 'w-10 h-10 rounded-xl', text: 'text-xs', dot: 'w-2.5 h-2.5 border-2' },
  lg: { box: 'w-[50px] h-[50px] rounded-2xl', text: 'text-sm', dot: 'w-3 h-3 border-2' },
  xl: { box: 'w-20 h-20 rounded-3xl', text: 'text-2xl', dot: 'w-4 h-4 border-2' },
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * Baş harf üretimi TEK kaynaktan (utils/trUpper). Buradaki eski kopya düz
 * `toLocaleUpperCase('tr-TR')` kullanıyordu ama boş adı 'O' harfine
 * çeviriyordu — adı olmayan kullanıcı listede "O" diye görünüyordu.
 */
export const getInitials = (name?: string | null): string => trInitials(name, 2, '•');

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: AvatarSize;
  online?: boolean | null; // null/undefined = nokta hiç çizilmez (gizlilik)
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', online, className = '' }) => {
  const s = SIZES[size];
  return (
    <div className={`relative shrink-0 ${className}`}>
      <UserAvatar
        name={name}
        avatarUrl={src}
        className={s.box}
        textClassName={s.text}
      />
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
