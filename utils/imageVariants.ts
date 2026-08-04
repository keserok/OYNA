// ════════════════════════════════════════════════════════════════════════════
// GÖRSEL VARYANTLARI — üç boy WebP + bulanık yer tutucu (LQIP)
// ════════════════════════════════════════════════════════════════════════════
//
// NEDEN VAR
//   Ana sayfadaki üç fotoğraf alanı (maç kartı, saha bandı, profil) bugün tek
//   boy JPEG indiriyor. Bant görselinin tasarımdaki hâli 675 KB — 148px'lik
//   bir şeritte gösterilmek için. Orta segment Android'de bu, ilk açılışta
//   görünür bir gecikme demek.
//
// NEREDE ÜRETİLİYOR — ve NEDEN ORADA
//   Boylar YÜKLEME ANINDA, tarayıcıda üretilir. Bu bir tercih değil, kayıtlı
//   bir karardır: OYNA_PRENSIPLER.md · PRO-3 →
//     "Görsel dönüştürme · bugün: yükleme anında çok boy · Pro'da: sunucu
//      tarafı dönüştürme"
//   Supabase'in sunucu tarafı görsel dönüştürmesi Pro planın özelliğidir ve
//   proje ücretsiz plandadır. Edge function ile WASM WebP kodlaması denenirse
//   ücretsiz plandaki 2 sn CPU sınırına üç boyda çok yaklaşılır — ara sıra
//   patlayan bir boru hattı, hiç olmayanından kötüdür.
//
//   Pro'ya geçildiğinde DEĞİŞECEK TEK ŞEY: `buildImageVariants` çağrısının
//   yeri (tarayıcı yerine sunucu). Çıktının şekli, veritabanı tablosu
//   (`image_variants`) ve tüketen taraf (`resolveImageSource`) aynı kalır.
//
// NEDEN WebP
//   Aynı görsel kalitesinde JPEG'in ~%25-35 altında. Capacitor'ın WebView'ı
//   (iOS 14+ / Android 5+) WebP'yi destekler. Yine de körü körüne güvenmiyoruz:
//   tarayıcı WebP kodlayamıyorsa JPEG'e düşülür ve bu AÇIKÇA bildirilir
//   (`format` alanı) — sessizce bozuk çıktı üretmez.
//
// NEDEN LQIP (bulanık minyatür)
//   ~16px genişlikte, birkaç yüz baytlık bir görsel; `data:` URI olarak
//   satırın İÇİNDE durur. Ağ isteği gerektirmediği için ilk boyamada hazırdır:
//   kullanıcı boş gri kutu yerine fotoğrafın rengini/kompozisyonunu görür.
//   Ayrı dosya olsaydı onu da indirmek gerekirdi — amacın tam tersi.
// ════════════════════════════════════════════════════════════════════════════

import { ImageValidationError, MAX_UPLOAD_BYTES } from './imageCompression';

/**
 * Mantıksal genişlikler. Ekrandaki en geniş kullanım ana sayfa bant görseli
 * (390px'lik telefonda ~148px) ve saha vitrini kartıdır (tam genişlik).
 * @1x tabanı 640px: tasarımdaki hiçbir alan bundan geniş değil, ama kart
 * tablette de açılabilsin diye cömert tutuldu.
 */
export const VARIANT_WIDTHS = { x1: 640, x2: 1280, x3: 1920 } as const;

/** LQIP genişliği. 16px: gözle "renk lekesi" olarak okunur, ~300-600 bayt. */
export const LQIP_WIDTH = 16;

export const WEBP_QUALITY = 0.78;
/** WebP kodlanamazsa düşülecek biçim — kalite JPEG_QUALITY ile aynı hizada. */
export const FALLBACK_QUALITY = 0.82;

export interface VariantBlob {
  /** Mantıksal boy anahtarı. */
  key: 'x1' | 'x2' | 'x3';
  blob: Blob;
  width: number;
  height: number;
}

export interface ImageVariantSet {
  variants: VariantBlob[];
  /** `data:image/webp;base64,…` — bulanık yer tutucu. */
  lqip: string;
  /** ORİJİNALİN ölçüleri. @3x bundan büyük olamaz: büyütme yapılmaz. */
  width: number;
  height: number;
  /** Gerçekte hangi biçim üretildi. WebP kodlanamadıysa 'image/jpeg'. */
  format: 'image/webp' | 'image/jpeg';
}

const loadBitmap = async (file: Blob): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Aşağıdaki <img> yoluna düş.
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

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Tarayıcı gerçekten WebP KODLAYABİLİYOR mu?
 *
 * `canvas.toBlob(…, 'image/webp')` desteklenmeyen tarayıcıda sessizce PNG
 * döndürür — istenen biçimi değil. Bu yüzden dönen blob'un `type`'ına
 * bakıyoruz, çağrının kendisine değil. (Safari 13 ve altı tam olarak böyle
 * davranıyordu ve kimse fark etmiyordu: dosya adı .webp, içerik PNG.)
 */
let webpSupport: boolean | null = null;
export async function canEncodeWebp(): Promise<boolean> {
  if (webpSupport !== null) return webpSupport;
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const b = await toBlob(c, 'image/webp', 0.8);
    webpSupport = !!b && b.type === 'image/webp';
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

/** Test edilebilirlik için: önbelleğe alınmış WebP kararını sıfırlar. */
export function resetWebpSupportCache(): void { webpSupport = null; }

const drawScaled = (
  bitmap: CanvasImageSource,
  srcW: number,
  srcH: number,
  targetW: number,
): { canvas: HTMLCanvasElement; w: number; h: number } | null => {
  const w = Math.max(1, Math.round(targetW));
  const h = Math.max(1, Math.round((srcH / srcW) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Küçültürken kenar kırıklığını azaltır; LQIP'te zaten bulanıklık isteniyor.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, srcW, srcH, 0, 0, w, h);
  return { canvas, w, h };
};

/**
 * Bir görselden üç boy + bulanık yer tutucu üretir.
 *
 * BÜYÜTME YAPILMAZ: orijinal 900px ise @2x (1280) ve @3x (1920) üretilmez;
 * bunun yerine mevcut en büyük boy tekrar kullanılır. Yoksa 900px'lik bir
 * fotoğrafı 1920'ye şişirip "yüksek çözünürlük" diye sunardık — dosya büyür,
 * görüntü aynı kalır.
 */
export async function buildImageVariants(file: Blob): Promise<ImageVariantSet> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageValidationError('Fotoğraf 10MB sınırını aşıyor. Daha küçük bir dosya seçin.');
  }

  const bitmap = await loadBitmap(file);
  const width = bitmap.width;
  const height = bitmap.height;
  if (!width || !height) {
    throw new ImageValidationError('Fotoğraf okunamadı.');
  }

  const webp = await canEncodeWebp();
  const format: ImageVariantSet['format'] = webp ? 'image/webp' : 'image/jpeg';
  const quality = webp ? WEBP_QUALITY : FALLBACK_QUALITY;

  const variants: VariantBlob[] = [];
  const produced = new Map<number, VariantBlob>();

  for (const key of ['x1', 'x2', 'x3'] as const) {
    // Orijinalden büyüğünü isteme.
    const targetW = Math.min(VARIANT_WIDTHS[key], width);
    const seen = produced.get(targetW);
    if (seen) {
      // Aynı genişlik ikinci kez istendi (orijinal küçük) — yeniden kodlamak
      // yerine aynı blob'u paylaş. Üç ayrı dosya yüklemek gereksiz.
      variants.push({ ...seen, key });
      continue;
    }
    const drawn = drawScaled(bitmap as CanvasImageSource, width, height, targetW);
    if (!drawn) throw new ImageValidationError('Fotoğraf işlenemedi (canvas açılamadı).');
    const blob = await toBlob(drawn.canvas, format, quality);
    if (!blob) throw new ImageValidationError('Fotoğraf sıkıştırılamadı.');
    const v: VariantBlob = { key, blob, width: drawn.w, height: drawn.h };
    produced.set(targetW, v);
    variants.push(v);
  }

  // ── Bulanık yer tutucu ────────────────────────────────────────────────────
  // Bulanıklığı FİLTREYLE değil, aşırı küçültüp büyütmeye bırakarak veriyoruz:
  // 16px'lik bir görsel `<img>` içinde zaten yumuşak ölçeklenir ve `blur()`
  // filtresi orta segment Android'de kare düşürüyor (brifing · madde 7).
  const tiny = drawScaled(bitmap as CanvasImageSource, width, height, LQIP_WIDTH);
  let lqip = '';
  if (tiny) {
    const tinyBlob = await toBlob(tiny.canvas, format, 0.6);
    if (tinyBlob) lqip = await blobToDataUrl(tinyBlob);
  }

  if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
    (bitmap as ImageBitmap).close();
  }

  return { variants, lqip, width, height, format };
}

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('data URI üretilemedi'));
    r.readAsDataURL(blob);
  });

// ── TÜKETEN TARAF ───────────────────────────────────────────────────────────

export interface StoredVariants {
  url_1x: string | null;
  url_2x: string | null;
  url_3x: string | null;
  lqip: string | null;
}

export interface ResolvedImage {
  /** `src` — @1x. Eski tarayıcı `srcSet`i anlamazsa bu yüklenir. */
  src: string;
  /** `srcSet` — cihaz piksel yoğunluğuna göre tarayıcı seçer. */
  srcSet?: string;
  /** Yer tutucu (varsa). Yoksa boş dize. */
  lqip: string;
}

/**
 * Kayıtlı varyantları `<img>` niteliklerine çevirir.
 *
 * Varyant YOKSA orijinal adres tek boy olarak döner — eski görseller
 * (boru hattı kurulmadan önce yüklenmiş olanlar) kırılmaz, sadece
 * optimizasyondan yararlanamaz. Bu bilinçli: geriye dönük yükleme (backfill)
 * ayrı bir iştir.
 */
export function resolveImageSource(
  originalUrl: string | null | undefined,
  v?: StoredVariants | null,
): ResolvedImage | null {
  const base = originalUrl?.trim();
  if (!v?.url_1x) {
    return base ? { src: base, lqip: '' } : null;
  }
  const parts = [`${v.url_1x} 1x`];
  if (v.url_2x) parts.push(`${v.url_2x} 2x`);
  if (v.url_3x) parts.push(`${v.url_3x} 3x`);
  return {
    src: v.url_1x,
    srcSet: parts.join(', '),
    lqip: v.lqip ?? '',
  };
}
