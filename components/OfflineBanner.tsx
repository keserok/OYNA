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

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-red-600 text-white text-xs font-bold flex items-center justify-center gap-2 py-2 px-4" style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}>
      <WifiOff size={14} />
      İnternet bağlantısı yok — bazı özellikler kullanılamayabilir
    </div>
  );
};

export default OfflineBanner;
