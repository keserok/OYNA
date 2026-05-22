import React, { useState } from 'react';
import { ArrowLeft, User, Globe, Bell, Shield, HelpCircle, LogOut, ChevronRight, RefreshCw, Moon, Database } from 'lucide-react';
import { AppView } from '../types';
import { logout } from '../firebase';
import { seedFirestore } from '../firebaseSync';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, onNavigate }) => {
  const [lang, setLang] = useState('TR');
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const handleLogout = async () => {
      try {
          await logout();
          onNavigate('SPLASH');
      } catch (error) {
          console.error("Error logging out:", error);
      }
  };

  const handleSeed = async () => {
      setSeeding(true);
      try {
          await seedFirestore();
      } catch (err) {
          console.error(err);
      } finally {
          setSeeding(false);
      }
  };

  const SettingItem = ({ icon, title, value, onClick, color = 'text-gray-500' }: any) => (
      <button onClick={onClick} className="w-full flex items-center justify-between p-4 bg-[#161B22] border border-white/5 first:rounded-t-2xl last:rounded-b-2xl border-b-0 last:border-b hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-4">
              <div className="text-gray-400">{icon}</div>
              <span className="text-sm font-bold text-white">{title}</span>
          </div>
          <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${color}`}>{value}</span>
              <ChevronRight size={16} className="text-gray-600" />
          </div>
      </button>
  );

  return (
    <div className="min-h-screen bg-[#0A0E14] pb-12">
        {/* Stack Header */}
        <header className="p-6 flex items-center gap-4 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20 border-b border-white/5">
            {/* Back Button (Standardized) */}
            <button 
              onClick={onBack} 
              className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
              aria-label="Geri Dön"
            >
                <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-black text-white">Ayarlar</h1>
        </header>

        <main className="p-6 space-y-8">
            
            {/* Account */}
            <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Hesap</h3>
                <div className="flex flex-col">
                    <SettingItem icon={<User size={20} />} title="Profil Bilgileri" value="Düzenle" />
                    <SettingItem icon={<Shield size={20} />} title="Güvenlik & Gizlilik" value="" />
                </div>
            </section>

            {/* App Preferences */}
            <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Uygulama</h3>
                <div className="flex flex-col">
                    <SettingItem 
                         icon={<Globe size={20} />} 
                         title="Dil / Language" 
                         value={lang === 'TR' ? 'Türkçe' : 'English'} 
                         onClick={() => setLang(lang === 'TR' ? 'EN' : 'TR')}
                         color="text-yellow-500"
                    />
                    <SettingItem 
                         icon={<Bell size={20} />} 
                         title="Bildirimler" 
                         value={notifEnabled ? 'Açık' : 'Kapalı'} 
                         onClick={() => setNotifEnabled(!notifEnabled)}
                         color={notifEnabled ? 'text-green-500' : 'text-red-500'}
                    />
                    <SettingItem icon={<Moon size={20} />} title="Tema" value="Karanlık Mod" />
                </div>
            </section>

            {/* Developer Console (Seed) */}
            <section className="bg-[#1a1c22]/50 border border-yellow-500/10 rounded-2xl p-5 space-y-3 relative overflow-hidden">
                <div className="flex items-center gap-2 text-yellow-500">
                    <Database size={16} />
                    <h3 className="text-xs font-black uppercase tracking-wider">Geliştirici Konsolu</h3>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                    OYNA uygulamasının veritabanını (sahalar, hakemler, kaleciler) Firebase bulutuna ilk kez yüklemek veya sıfırlamak için aşağıdaki butona basın.
                </p>
                <button 
                    disabled={seeding}
                    onClick={handleSeed}
                    className="w-full flex items-center justify-center gap-2.5 p-3.5 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 hover:from-yellow-500/30 hover:to-orange-500/30 border border-yellow-500/30 rounded-xl text-yellow-500 font-bold text-xs transition-all uppercase tracking-widest disabled:opacity-50"
                >
                    {seeding ? (
                        <>
                            <RefreshCw size={14} className="animate-spin text-yellow-500" /> Veritabanı Yükleniyor...
                        </>
                    ) : (
                        <>
                            <Database size={14} className="text-yellow-500" /> Veritabanını Tohumla (Seed DB)
                        </>
                    )}
                </button>
            </section>

            {/* Support */}
            <section>
                <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Destek</h3>
                <div className="flex flex-col">
                    <SettingItem icon={<HelpCircle size={20} />} title="Yardım Merkezi" value="" />
                    <button 
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 p-4 mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 font-bold text-sm hover:bg-red-500/20 transition-colors"
                    >
                        <LogOut size={18} /> Çıkış Yap
                    </button>
                </div>
            </section>

            <div className="text-center">
                <p className="text-[10px] text-gray-600 font-mono">v2.4.0 • Build 20240324</p>
            </div>

        </main>
    </div>
  );
};

export default SettingsScreen;
