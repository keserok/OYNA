import { useState } from 'react';

export const useImageUpload = (folder: string = 'uploads') => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const uploadImage = async (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject('No file provided');
                return;
            }

            setUploading(true);
            setProgress(0);
            
            // Mock upload process since firebase is removed
            setTimeout(() => {
                setProgress(100);
                setUploading(false);
                // Return a generic placeholder or object URL for now
                resolve(URL.createObjectURL(file));
            }, 1000);
        });
    };

    return { uploadImage, uploading, progress };
};
