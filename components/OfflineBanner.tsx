import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// Bağlantı koptuğunda üstte sabit uyarı şeridi gösterir (navigator.onLine tabanlı).
const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' && !navigator.onLine
  );

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Şerit `fixed top-0 z-[100]` çiziliyor; kabuk yer açmazsa üstteki geri/kapat
  // düğmelerini örter (BULGU-110). Gövde sınıfı, index.css'teki güvenli-alan
  // yardımcılarına şerit yüksekliği kadar ek üst dolgu verdirir.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('offline-banner-on', isOffline);
    return () => { document.body.classList.remove('offline-banner-on'); };
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-red-600 text-white text-xs font-bold flex items-center justify-center gap-2 py-2 px-4" style={{ paddingTop: 'max(var(--safe-top), 0.5rem)' }}>
      <WifiOff size={14} />
      İnternet bağlantısı yok — bazı özellikler kullanılamayabilir
    </div>
  );
};

export default OfflineBanner;
