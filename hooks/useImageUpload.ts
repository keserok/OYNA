import { useState } from 'react';
import { supabase } from '../supabaseClient';

export const useImageUpload = (folder: string = 'uploads') => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const uploadImage = async (file: File): Promise<string> => {
        if (!file) throw new Error('No file provided');

        setUploading(true);
        setProgress(0);

        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

            setProgress(30);

            const { error } = await supabase.storage
                .from('images')
                .upload(fileName, file, { cacheControl: '3600', upsert: false });

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
