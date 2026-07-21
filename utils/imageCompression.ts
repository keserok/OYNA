/**
 * Yükleme öncesi client-side görsel sıkıştırma (Karar #6-7).
 * Mobil veriden fotoğraf yükleyen saha sahibi için kritik: 8MB'lık telefon
 * fotoğrafı ~300-500KB'lık 1920px JPEG'e iner; vitrin listesi hızlı kalır.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // bucket limiti ile aynı
export const MIN_IMAGE_WIDTH = 800;
/** Vitrin (tesis/saha) görselleri için önerilen min çözünürlük (Faz 8 · Karar #8). */
export const SHOWCASE_MIN_WIDTH = 1280;
export const MAX_IMAGE_DIMENSION = 1920;
export const JPEG_QUALITY = 0.82;

export class ImageValidationError extends Error {}

const loadBitmap = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // HEIC gibi decode edilemeyen formatlar aşağıdaki <img> yoluna düşer.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
};

/** Tesis/saha vitrin görselleri için TEK TİP oran: 16:9 yatay (mobil kart + galeri). */
export const SHOWCASE_ASPECT_RATIO = 16 / 9;

export interface CompressOptions {
  /** Kabul edilen en küçük kenar (px). Avatar/arma gibi küçük görseller için düşürülebilir. */
  minWidth?: number;
  /**
   * Hedef en/boy oranı (genişlik/yükseklik). Verilirse görsel bu orana kırpılır
   * — vitrindeki tüm görseller tek tip olur, oyuncu kartları ve galeri header'ı
   * hiçbir cihazda taşmaz/boşluk bırakmaz.
   */
  aspectRatio?: number;
  /**
   * Kırpma odak noktası (0..1). Verilmezse merkez (0.5, 0.5). Elle kırpma
   * aracı bu değeri geçirir — kullanıcı fotoğrafın hangi bandının kalacağını seçer.
   */
  focus?: { x: number; y: number };
}

/**
 * Görseli doğrular ve gerekiyorsa küçültüp JPEG'e çevirir.
 * Tarayıcı formatı decode edemezse (ör. bazı HEIC'ler) orijinal dosya döner;
 * boyut sınırını sunucu tarafındaki bucket limiti güvenceler.
 */
export async function compressImageForUpload(file: File, options: CompressOptions = {}): Promise<File> {
  const minWidth = options.minWidth ?? MIN_IMAGE_WIDTH;
  if (!file.type.startsWith('image/')) {
    throw new ImageValidationError('Yalnızca görsel dosyaları yükleyebilirsiniz.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError('Fotoğraf 10MB sınırını aşıyor. Daha küçük bir dosya seçin.');
  }

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    // Tarayıcı decode edemedi. HEIC/HEIF ham yüklenirse hiçbir tarayıcı
    // gösteremez (iPhone tuzağı) — reddet; diğer formatlarda orijinali dene.
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      throw new ImageValidationError(
        'Bu HEIC fotoğraf tarayıcıda işlenemedi. Telefonunuzda Ayarlar > Kamera > Formatlar\'dan "En Uyumlu"yu seçin veya fotoğrafı JPEG olarak paylaşıp tekrar deneyin.',
      );
    }
    return file;
  }

  const width = bitmap.width;
  const height = bitmap.height;
  if (width < minWidth && height < minWidth) {
    throw new ImageValidationError(`Fotoğraf çok küçük (en az ${minWidth}px kenar önerilir). Daha yüksek çözünürlüklü bir fotoğraf seçin.`);
  }

  // Tek tip oran istenmişse: kaynaktan kırpma dikdörtgeni hesapla (odak noktalı).
  const ratio = options.aspectRatio;
  const fx = Math.min(1, Math.max(0, options.focus?.x ?? 0.5));
  const fy = Math.min(1, Math.max(0, options.focus?.y ?? 0.5));
  let srcX = 0, srcY = 0, srcW = width, srcH = height;
  if (ratio && ratio > 0) {
    const current = width / height;
    const tolerance = 0.01;
    if (current > ratio * (1 + tolerance)) {
      srcW = Math.round(height * ratio);
      srcX = Math.round((width - srcW) * fx);
    } else if (current < ratio * (1 - tolerance)) {
      srcH = Math.round(width / ratio);
      srcY = Math.round((height - srcH) * fy);
    }
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(srcW, srcH));
  const targetW = Math.round(srcW * scale);
  const targetH = Math.round(srcH * scale);

  const cropNeeded = srcX !== 0 || srcY !== 0 || srcW !== width || srcH !== height;
  const alreadySmallJpeg = !cropNeeded && scale === 1 && file.type === 'image/jpeg' && file.size < 600 * 1024;
  if (alreadySmallJpeg) return file;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap as CanvasImageSource, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}
