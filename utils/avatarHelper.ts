/**
 * Bir avatar adresi GERÇEK fotoğraf mı, yoksa üreteç/yer tutucu mu?
 *
 * Kurucu kararı (20 Ağu 2026): baş harfli profil yuvarlağının zemini SAYDAM,
 * harfleri OPAK olacak — hiçbir ekranda renkli disk yok. Dış üreteçlerin
 * (ui-avatars vb.) ürettiği PNG'lerde zemin RENGİN İÇİNE GÖMÜLÜDÜR; demo
 * hesaplardaki "açık mavi yuvarlak" tam olarak buydu. Bu yüzden üreteç
 * adresleri "fotoğraf yok" sayılır ve ekran kendi saydam baş harf yedeğini
 * çizer (components/common/UserAvatar). Yerel baş harf SVG'miz
 * (shared/lobbyEnrichment.avatarFor → data:image/svg) de fotoğraf değildir.
 */
export const isDefaultAvatar = (url: string | null | undefined): boolean => {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('dicebear.com') ||
    lowerUrl.includes('pravatar.cc') ||
    lowerUrl.includes('picsum.photos') ||
    lowerUrl.includes('ui-avatars.com') ||
    lowerUrl.startsWith('data:image/svg') ||
    lowerUrl.trim() === ''
  );
};

/**
 * Generates clean uppercase player initials from their name.
 * Handles suffixes like "(Sen)" and multiple word names.
 */
export const getInitials = (name: string): string => {
  if (!name) return '?';
  // Strip out any trailing parenthesized details like (Sen), (Kaptan) etc.
  const cleanName = name.replace(/\([^)]*\)/g, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return parts[0] ? parts[0].charAt(0).toUpperCase() : '?';
};
