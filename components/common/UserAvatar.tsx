import React, { useEffect, useState } from 'react';
import { trInitials } from '../../utils/trUpper';
import { isDefaultAvatar } from '../../utils/avatarHelper';

/**
 * KİŞİ AVATARI — uygulamadaki TEK görsel dil.
 *
 * Kurucu kararı (2026-08-06): "bir oyuncunun profil yuvarlağı mavi, birinin
 * mavi olmaması gibi durumlar yaşanmasın." Aynı kişi, aynı harfler, aynı
 * yuvarlak; ekran değişince görünüm değişmesin.
 *
 * ZEMİN NEDEN TAMAMEN SAYDAM?
 * Kurucu isteği (17 Ağustos 2026): "bu butonun tamamen saydam olması ve
 * harflerin görünmesi." Önceki değer yarı saydam beyazdı (rgba(255,255,255,.12))
 * ve altındaki koyu lacivert kartın üstünde AÇIK MAVİ bir daire gibi
 * görünüyordu — kurucunun "profil fotoğrafının rengini açık mavi görüyorum"
 * dediği şey buydu.
 *
 * Tam saydam zemin, "altındaki neyse o" kuralının en saf hâlidir: daire artık
 * hiçbir renk katmaz. Dairenin varlığını İNCE BEYAZ ÇERÇEVE taşır (çağırandan
 * `className` ile gelir) — çerçeve olmasaydı havada duran harfler kalırdı.
 *
 * FOTOĞRAF YOLUNDA DA SAYDAM: fotoğraf yüklenirken arkada renkli bir kutu
 * belirip sonra kaybolmaz; yükleme sessiz geçer.
 *
 * HARFLER İTALİK: kurucu isteği. Başlık yazı tipiyle (Montserrat 800) birlikte
 * uygulamanın rozet dilini taşır.
 *
 * ÇERÇEVE ARTIK BURADA: zemin saydam olunca çerçeve dairenin TEK sınırı oldu.
 * Çağıranların yarısında çerçeve vardı, yarısında yoktu; saydamlıkla birlikte
 * çerçevesiz olanlar "havada duran harfler"e dönüşürdü. Bu yüzden ince beyaz
 * halka bileşenin kendisine alındı — boyut ve yuvarlaklık hâlâ dışarıdan
 * (`className`) gelir, renk ve sınır BURADA kilitlidir.
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
export const AVATAR_BG = 'transparent';

/**
 * Dairenin tek sınırı. Saydam zeminde çerçeve olmazsa yuvarlak kaybolur ve
 * geriye yalnız harfler kalır (kurucu isteği: "ince beyaz çerçeve ve baş
 * harfler görünsün").
 */
export const AVATAR_BORDER = '1px solid rgba(255,255,255,0.22)';

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  className = '',
  textClassName = 'text-sm',
}) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [avatarUrl]);
  // ÜRETEÇ ADRESLERİ FOTOĞRAF SAYILMAZ (kurucu kararı, 20 Ağu 2026): ui-avatars
  // gibi servisler zemini görüntünün İÇİNE boyar — demo hesaplardaki "açık mavi
  // yuvarlak" saydam zemin kuralını deliyordu. Böyle bir adres gelirse fotoğraf
  // yok kabul edilir ve aşağıdaki saydam baş harf yedeği çizilir; veri hangi
  // yoldan tohumlanırsa tohumlansın kural burada da tutulur (prensip 6.1).
  const showImg = !!avatarUrl && !broken && !isDefaultAvatar(avatarUrl);

  if (showImg) {
    return (
      <img
        src={avatarUrl!}
        alt={name || 'Profil'}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setBroken(true)}
        className={`object-cover ${className}`}
        // Zemin saydam: yükleme sırasında arkada renkli bir kutu belirip
        // sonra kaybolmaz. Sınırı ince beyaz halka çizer.
        style={{ background: AVATAR_BG, border: AVATAR_BORDER, boxSizing: 'border-box' }}
      />
    );
  }
  return (
    <div
      aria-label={name || 'Profil'}
      className={`flex items-center justify-center font-extrabold italic ${textClassName} ${className}`}
      style={{
        background: AVATAR_BG,
        border: AVATAR_BORDER,
        boxSizing: 'border-box',
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-display)',
      }}
    >
      {trInitials(name, 2, '•')}
    </div>
  );
};

export default UserAvatar;
