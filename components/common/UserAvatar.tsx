import React, { useEffect, useState } from 'react';

// Oturum kullanıcısının avatarı — TEK görsel dil (MOB-S4):
// fotoğraf varsa o; yoksa/kırıksa Profil ekranındaki (ProfileHero) stille
// baş harfler. Ana sayfa sol üst ile profil sağ üst böylece birebir aynı görünür.
const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR') || '•';

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  /** Dış kutu: boyut + yuvarlaklık + çerçeve çağırandan gelir. */
  className?: string;
  /** Baş harf yazı boyutu (varsayılan text-sm). */
  textClassName?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  className = '',
  textClassName = 'text-sm',
}) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [avatarUrl]);
  const showImg = !!avatarUrl && !broken;

  if (showImg) {
    return (
      <img
        src={avatarUrl!}
        alt={name || 'Profil'}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`object-cover ${className}`}
      />
    );
  }
  return (
    <div
      aria-label={name || 'Profil'}
      className={`flex items-center justify-center font-black italic text-primary bg-[#0d1712] ${textClassName} ${className}`}
    >
      {initialsOf(name || '')}
    </div>
  );
};
