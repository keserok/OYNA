import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { compressImageForUpload, type CompressOptions } from '../utils/imageCompression';

/**
 * Ortak görsel yükleme kancası — tek boru hattı:
 * compressImageForUpload (tip/boyut doğrulama + HEIC koruması + 1920px JPEG)
 * → storage 'images' bucket'ı. Avatar, takım arması, maç görseli ve admin
 * modalleri dahil tüm çağıranlar aynı kuralları paylaşır.
 */
export const useImageUpload = (folder: string = 'uploads', options: CompressOptions = {}) => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const uploadImage = async (file: File): Promise<string> => {
        if (!file) throw new Error('No file provided');

        setUploading(true);
        setProgress(0);

        try {
            const prepared = await compressImageForUpload(file, options);
            setProgress(30);

            const ext = prepared.type === 'image/jpeg'
                ? 'jpg'
                : (prepared.name.split('.').pop() || 'jpg').toLowerCase();
            const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

            const { error } = await supabase.storage
                .from('images')
                .upload(fileName, prepared, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: prepared.type || 'image/jpeg',
                });

            if (error) throw error;

            setProgress(90);

            const { data: urlData } = supabase.storage
                .from('images')
                .getPublicUrl(fileName);

            setProgress(100);
            return urlData.publicUrl;
        } finally {
            setUploading(false);
        }
    };

    return { uploadImage, uploading, progress };
};
