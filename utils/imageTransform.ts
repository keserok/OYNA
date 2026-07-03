/**
 * Supabase Storage görsel türevleri (Karar #7, #27).
 * Public URL'i render/image transform endpoint'ine çevirir; vitrin kartı küçük,
 * detay galerisi orta boyut ister. Supabase dışı URL'ler (eski Unsplash vb.)
 * olduğu gibi geçer.
 */

const OBJECT_SEGMENT = '/storage/v1/object/public/';
const RENDER_SEGMENT = '/storage/v1/render/image/public/';

export type ImageVariant = 'card' | 'detail' | 'thumb';

const VARIANTS: Record<ImageVariant, { width: number; quality: number }> = {
  thumb: { width: 320, quality: 70 },
  card: { width: 640, quality: 75 },
  detail: { width: 1280, quality: 80 },
};

export const transformedImageUrl = (url: string | null | undefined, variant: ImageVariant): string => {
  if (!url) return '';
  if (!url.includes(OBJECT_SEGMENT)) return url;
  const { width, quality } = VARIANTS[variant];
  const base = url.replace(OBJECT_SEGMENT, RENDER_SEGMENT);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${width}&quality=${quality}&resize=contain`;
};
