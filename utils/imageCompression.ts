/**
 * Yükleme öncesi client-side görsel sıkıştırma (Karar #6-7).
 * Mobil veriden fotoğraf yükleyen saha sahibi için kritik: 8MB'lık telefon
 * fotoğrafı ~300-500KB'lık 1920px JPEG'e iner; vitrin listesi hızlı kalır.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // bucket limiti ile aynı
export const MIN_IMAGE_WIDTH = 800;
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

/**
 * Görseli doğrular ve gerekiyorsa küçültüp JPEG'e çevirir.
 * Tarayıcı formatı decode edemezse (ör. bazı HEIC'ler) orijinal dosya döner;
 * boyut sınırını sunucu tarafındaki bucket limiti güvenceler.
 */
export async function compressImageForUpload(file: File): Promise<File> {
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
    return file; // decode edilemedi — orijinali dene, bucket MIME/boyut sınırı devrede
  }

  const width = bitmap.width;
  const height = bitmap.height;
  if (width < MIN_IMAGE_WIDTH && height < MIN_IMAGE_WIDTH) {
    throw new ImageValidationError(`Fotoğraf çok küçük (en az ${MIN_IMAGE_WIDTH}px kenar önerilir). Daha yüksek çözünürlüklü bir fotoğraf seçin.`);
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const alreadySmallJpeg = scale === 1 && file.type === 'image/jpeg' && file.size < 600 * 1024;
  if (alreadySmallJpeg) return file;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg' });
}
