
import React, { useState } from 'react';
import { MapPin, Navigation, CheckCircle2, AlertCircle } from 'lucide-react';
import { Spinner } from '../components/ui/Spinner';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { fbUpdateUserLocation } from '../supabaseMutations';
import { showToast } from '../components/common/GlobalToast';

interface LocationPromptProps {
  onPermissionGranted: () => void;
  onSkip: () => void;
}

const LocationPrompt: React.FC<LocationPromptProps> = ({ onPermissionGranted, onSkip }) => {
  const [status, setStatus] = useState<'IDLE' | 'SCANNING' | 'FOUND' | 'DENIED'>('IDLE');
  const { setUserLocation, setLocationPermissionStatus } = useAppStore();

  const handleGrantPermission = () => {
    setStatus('SCANNING');
    
    // Simulate finding location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                // Konumu kaydet
                setUserLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
                setLocationPermissionStatus('GRANTED');

                // Eğer kullanıcı giriş yapmışsa veritabanına da kaydet
                if (auth.currentUser) {
                    fbUpdateUserLocation(auth.currentUser.uid, position.coords.latitude, position.coords.longitude).catch(err => {
                        console.error('Konum DB kaydı başarısız:', err);
                        showToast('Konumun kaydedilemedi — yakınındaki sahalar eksik görünebilir.');
                    });
                }
                
                setStatus('FOUND');
                if (navigator.vibrate) navigator.vibrate([50, 100, 50]);
                setTimeout(onPermissionGranted, 1500);
            },
            (error) => {
                console.error('Konum alınamadı:', error);
                setStatus('DENIED');
                setLocationPermissionStatus('DENIED');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    } else {
        setStatus('DENIED');
        setLocationPermissionStatus('DENIED');
    }
  };

  const handleSkip = () => {
    setLocationPermissionStatus('DENIED');
    onSkip();
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col relative overflow-hidden">
      
      {/* MAP BACKGROUND */}
      <div className="absolute inset-0 opacity-20 grayscale mix-blend-luminosity">
          {/* F3d: harici stok görsel yerine yerel gradient (çevrimdışı/karanlıkta da tutarlı) */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#123321] via-[#0f1b2d] to-[#0A0E14]"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0E14] via-transparent to-[#0A0E14]"></div>
      </div>

      {/* RADAR EFFECT */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
          
          <div className="relative w-64 h-64 flex items-center justify-center mb-12">
              {/* Radar Rings */}
              <div className={`absolute inset-0 border border-green-500/20 rounded-full ${status === 'SCANNING' ? 'animate-[ping_2s_linear_infinite]' : ''}`}></div>
              <div className="absolute inset-12 border border-green-500/40 rounded-full"></div>
              <div className="absolute inset-24 border border-green-500/60 rounded-full"></div>
              
              {/* Scanning Line */}
              {status === 'SCANNING' && (
                  <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0_deg,rgba(34,197,94,0.3)_360deg)] animate-[spin_2s_linear_infinite]"></div>
              )}

              {/* Center Icon */}
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] border-4 transition-all duration-500 z-20 ${status === 'FOUND' ? 'bg-green-500 border-green-400 scale-110' : 'bg-[#161B22] border-white/10'}`}>
                  {status === 'SCANNING' ? (
                      <Spinner size={32} color="#22C55E" />
                  ) : status === 'FOUND' ? (
                      <CheckCircle2 size={32} className="text-black" />
                  ) : (
                      <Navigation size={32} className="text-white fill-white" />
                  )}
              </div>

              {/* Found Ping */}
              {status === 'FOUND' && (
                  <div className="absolute top-1/3 left-1/4 w-3 h-3 bg-white rounded-full animate-ping"></div>
              )}
          </div>

          <div className="text-center px-8 space-y-3">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                  {status === 'SCANNING' ? 'KONUM TARANIYOR...' : status === 'FOUND' ? 'LOKASYON DOĞRULANDI' : 'SAHANI BULALIM'}
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-xs mx-auto">
                  {status === 'DENIED' 
                    ? 'Konum izni verilmedi. Maçları manuel araman gerekecek.' 
                    : 'Yakınındaki maçları ve boş sahaları listelemek için radarını aç.'}
              </p>
          </div>

      </div>

      {/* FOOTER ACTIONS */}
      <div className="p-6 pb-10 relative z-10 w-full max-w-md mx-auto">
          {status === 'DENIED' ? (
              <button 
                onClick={handleSkip}
                className="w-full h-14 bg-[#161B22] text-white font-bold rounded-2xl border border-white/10 hover:bg-white/5 transition-colors"
              >
                  MANUEL DEVAM ET
              </button>
          ) : (
              <div className="space-y-3">
                  <button 
                    onClick={handleGrantPermission}
                    disabled={status !== 'IDLE'}
                    className={`w-full h-16 rounded-2xl font-extrabold text-lg flex items-center justify-center gap-2 transition-all ${status === 'IDLE' ? 'bg-[#39FF14] text-black hover:scale-[1.02] shadow-[0_0_30px_rgba(57,255,20,0.2)]' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                  >
                      {status === 'IDLE' ? <><Navigation size={20} fill="black" /> RADARI AÇ</> : 'BEKLEYİNİZ...'}
                  </button>
                  {status === 'IDLE' && (
                      <button onClick={handleSkip} className="w-full py-3 text-xs font-bold text-gray-500 hover:text-white transition-colors">
                          ŞİMDİ DEĞİL
                      </button>
                  )}
              </div>
          )}
      </div>
    </div>
  );
};

export default LocationPrompt;
