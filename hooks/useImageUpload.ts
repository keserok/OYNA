import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { compressImageForUpload, type CompressOptions } from '../utils/imageCompression';
import { buildImageVariants } from '../utils/imageVariants';

const BUCKET = 'images';

export interface UploadOptions extends CompressOptions {
    /**
     * Yükleme anında üç boy WebP (@1x/@2x/@3x) + bulanık yer tutucu üret ve
     * `image_variants` tablosuna kaydet (OYNA_PRENSIPLER.md · PRO-3).
     *
     * VARSAYILAN KAPALI — bilinçli. Bu kancayı avatar, takım arması ve admin
     * modalleri de kullanıyor; hepsine birden ekstra üç yükleme bindirmek
     * kimsenin istemediği bir davranış değişikliği olurdu. Ana sayfada
     * GERÇEKTEN büyük görünen alanlar (saha bandı, saha fotoğrafı) bunu açar.
     */
    withVariants?: boolean;
}

export interface UploadResult {
    /** Orijinalin (sıkıştırılmış) genel adresi — mevcut çağıranların beklediği değer. */
    url: string;
    /** Bucket içi yol. `image_variants` ile eşleşen anahtar. */
    storagePath: string;
    /** Varyantlar üretilip kaydedilebildi mi? */
    variantsReady: boolean;
}

/**
 * Ortak görsel yükleme kancası — tek boru hattı:
 * compressImageForUpload (tip/boyut doğrulama + HEIC koruması + 1920px JPEG)
 * → storage 'images' bucket'ı. Avatar, takım arması, maç görseli ve admin
 * modalleri dahil tüm çağıranlar aynı kuralları paylaşır.
 *
 * `withVariants` açıkken ek olarak üç boy WebP ve bulanık yer tutucu üretilir.
 * VARYANT ÜRETİMİ YÜKLEMEYİ BOZMAZ: türetilmiş boylar başarısız olursa
 * orijinal yükleme geçerli kalır ve çağıran normal adresi alır. Sebep basit —
 * kullanıcının fotoğrafı yüklenmiş olur; onu bir optimizasyon adımı yüzünden
 * geri çevirmek kabul edilemez. Başarısızlık konsola düşer, sessizce yutulmaz.
 */
export const useImageUpload = (folder: string = 'uploads', options: UploadOptions = {}) => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    /** Ayrıntılı sonuç isteyen çağıranlar için (yol + varyant durumu). */
    const uploadImageDetailed = async (file: File): Promise<UploadResult> => {
        if (!file) throw new Error('No file provided');

        setUploading(true);
        setProgress(0);

        try {
            const prepared = await compressImageForUpload(file, options);
            setProgress(25);

            const ext = prepared.type === 'image/jpeg'
                ? 'jpg'
                : (prepared.name.split('.').pop() || 'jpg').toLowerCase();
            const stamp = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const storagePath = `${folder}/${stamp}.${ext}`;

            const { error } = await supabase.storage
                .from(BUCKET)
                .upload(storagePath, prepared, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: prepared.type || 'image/jpeg',
                });

            if (error) throw error;

            setProgress(55);

            const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
            const url = urlData.publicUrl;

            let variantsReady = false;
            if (options.withVariants) {
                try {
                    variantsReady = await uploadVariants(prepared, folder, stamp, storagePath);
                } catch (e) {
                    // Bilinçli yutma DEĞİL: kayda geçiyor. Orijinal yüklendi,
                    // ekran onu tek boy olarak gösterir — kırılma yok.
                    console.error('[useImageUpload] varyant üretimi başarısız', e);
                }
            }

            setProgress(100);
            return { url, storagePath, variantsReady };
        } finally {
            setUploading(false);
        }
    };

    /** Mevcut çağıranların imzası — yalnız genel adresi döndürür. */
    const uploadImage = async (file: File): Promise<string> =>
        (await uploadImageDetailed(file)).url;

    return { uploadImage, uploadImageDetailed, uploading, progress };
};

/**
 * Türetilmiş boyları yükler ve veritabanına kaydeder.
 * `false` dönerse varyant yok demektir; çağıran orijinali kullanmaya devam eder.
 */
async function uploadVariants(
    prepared: File,
    folder: string,
    stamp: string,
    originalPath: string,
): Promise<boolean> {
    const set = await buildImageVariants(prepared);
    const ext = set.format === 'image/webp' ? 'webp' : 'jpg';

    // Aynı genişliğe düşen boylar aynı blob'u paylaşır (küçük orijinal) —
    // o dosyayı iki kez yüklemeyelim.
    const uploadedByBlob = new Map<Blob, string>();
    const urls: Record<'x1' | 'x2' | 'x3', string> = { x1: '', x2: '', x3: '' };

    for (const v of set.variants) {
        const already = uploadedByBlob.get(v.blob);
        if (already) { urls[v.key] = already; continue; }

        const path = `${folder}/${stamp}@${v.key.replace('x', '')}x.${ext}`;
        const { error } = await supabase.storage
            .from(BUCKET)
            .upload(path, v.blob, { cacheControl: '31536000', upsert: true, contentType: set.format });
        if (error) throw error;

        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        urls[v.key] = data.publicUrl;
        uploadedByBlob.set(v.blob, data.publicUrl);
    }

    const { error: rpcError } = await supabase.rpc('record_image_variants', {
        p_storage_path: originalPath,
        p_url_1x: urls.x1,
        p_url_2x: urls.x2,
        p_url_3x: urls.x3,
        p_lqip: set.lqip || null,
        p_width: set.width,
        p_height: set.height,
        p_bytes_original: prepared.size,
        p_bucket: BUCKET,
    });
    if (rpcError) throw rpcError;

    return true;
}
