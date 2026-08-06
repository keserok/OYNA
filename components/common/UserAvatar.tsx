import React, { useEffect, useState } from 'react';
import { trInitials } from '../../utils/trUpper';

/**
 * KİŞİ AVATARI — uygulamadaki TEK görsel dil.
 *
 * Kurucu kararı (2026-08-06): "bir oyuncunun profil yuvarlağı mavi, birinin
 * mavi olmaması gibi durumlar yaşanmasın." Aynı kişi, aynı harfler, aynı
 * yuvarlak; ekran değişince görünüm değişmesin.
 *
 * ZEMİN NEDEN YARI SAYDAM BEYAZ (rgba(255,255,255,0.12))?
 * Kurucu isteği: "yuvarlak daire içerisindeki arka plan rengi butonun genel
 * arka planıyla uyumlu olsun." Sabit bir renk (eskiden `#0d1712` koyu yeşil)
 * bunu YAPAMAZ — ana sayfanın koyu kartında koyu yeşil bir leke gibi duruyor,
 * profil ekranının gradyanlı zemininde bambaşka görünüyordu. Yarı saydam beyaz
 * ise ALTINDAKİ zeminden beslenir: hangi butonun/kartın üstüne konursa onun
 * rengini bir ton açar. Yani tek bir değer her yerde "uyumlu" çıkar.
 *
 * HARFLER İTALİK: kurucu isteği. Başlık yazı tipiyle (Montserrat 800) birlikte
 * uygulamanın rozet dilini taşır.
 *
 * ÇERÇEVE ÇAĞIRANDAN GELMEZ ZORUNLU DEĞİL: boyut/yuvarlaklık/çerçeve
 * `className` ile dışarıdan verilir; renk ve harf dili BURADA kilitlidir.
 * Dışarıdan renk ezmek isteyen bir çağıran çıkarsa o, bu bileşenin varlık
 * sebebini bozar — o yüzden zemin ve harf rengi sınıf olarak değil satır içi
 * stille yazılır (yardımcı sınıf sırası Tailwind v4'te güvenilir değil).
 */

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  /** Dış kutu: boyut + yuvarlaklık + çerçeve çağırandan gelir. */
  className?: string;
  /** Baş harf yazı boyutu (varsayılan text-sm). */
  textClassName?: string;
}

/** Tek yerde tanımlı avatar zemini — dokümantasyon ve testler bunu okur. */
export const AVATAR_BG = 'rgba(255,255,255,0.12)';

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
        loading="lazy"
        onError={() => setBroken(true)}
        className={`object-cover ${className}`}
        // Fotoğraf yüklenene kadar aynı zemin görünsün — yükleme sırasında
        // boş/koyu bir delik açılmasın.
        style={{ background: AVATAR_BG }}
      />
    );
  }
  return (
    <div
      aria-label={name || 'Profil'}
      className={`flex items-center justify-center font-extrabold italic ${textClassName} ${className}`}
      style={{
        background: AVATAR_BG,
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-display)',
      }}
    >
      {trInitials(name, 2, '•')}
    </div>
  );
};

export default UserAvatar;
