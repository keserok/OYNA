import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, User, Globe, Bell, Shield, HelpCircle, LogOut, ChevronRight,
  RefreshCw, Moon, Database, MapPin, Lock, CheckCircle2, XCircle, Smartphone,
  AlertCircle, Download, ShieldOff
} from 'lucide-react';
import { downloadMyChatExport, getMyBlockedUsers, unblockUser } from '../services/chatService';
import { motion, AnimatePresence } from 'framer-motion';
import { AppView } from '../types';
import { logout, auth } from '../supabaseAuth';
import { useAppStore } from '../store';
import { fbUpdateUserLocation } from '../supabaseMutations';
import { NOTIFICATION_CATEGORIES, fetchNotificationTemplates, updateNotificationPreference, NotificationTemplateInfo } from '../notifications/notificationPreferences';
import type { NotificationPreferenceKey } from '../notifications/pushService';
import { Capacitor } from '@capacitor/core';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, onNavigate }) => {
  const [lang, setLang] = useState('TR');
  const [seeding, setSeeding] = useState(false);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [templates, setTemplates] = useState<NotificationTemplateInfo[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isNative] = useState(() => Capacitor.isNativePlatform());
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [blockedList, setBlockedList] = useState<Array<{ blocked_id: string; reason: string | null; created_at: string }>>([]);
  const [showBlocked, setShowBlocked] = useState(false);

  const { setUserLocation, notificationPreferences, setNotificationPreferences, updateSingleNotificationPref } = useAppStore();

  const handleExport = async () => {
    setIsExporting(true);
    setExportMsg(null);
    try {
      const ok = await downloadMyChatExport();
      setExportMsg(ok ? 'Mesaj geçmişin indirildi.' : 'Veri indirilemedi.');
    } catch {
      setExportMsg('Veri indirilemedi.');
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportMsg(null), 4000);
    }
  };

  const handleLoadBlocked = async () => {
    setShowBlocked(true);
    const list = await getMyBlockedUsers();
    setBlockedList(list);
  };
  const handleUnblock = async (uid: string) => {
    await unblockUser(uid);
    setBlockedList(prev => prev.filter(b => b.blocked_id !== uid));
  };

  // Şablonları yükle
  useEffect(() => {
    fetchNotificationTemplates().then(setTemplates);
  }, []);

  const handleUpdateLocation = () => {
    setIsUpdatingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
          if (auth.currentUser) {
            fbUpdateUserLocation(auth.currentUser.uid, position.coords.latitude, position.coords.longitude)
              .then(() => setIsUpdatingLocation(false))
              .catch(() => setIsUpdatingLocation(false));
          } else {
            setIsUpdatingLocation(false);
          }
          if (navigator.vibrate) navigator.vibrate(50);
        },
        (err) => {
          console.error(err);
          setIsUpdatingLocation(false);
          alert('Konum alınamadı. Lütfen cihaz ayarlarından izin verin.');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setIsUpdatingLocation(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('SPLASH');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleToggleNotif = async (key: NotificationPreferenceKey, enabled: boolean) => {
    const current = notificationPreferences[key];
    if (current?.mandatory) return; // Zorunlu bildirimlere dokunma

    setSavingKey(key);
    updateSingleNotificationPref(key, enabled); // Optimistic

    const userId = auth.currentUser?.uid;
    if (userId) {
      const updated = await updateNotificationPreference(userId, key, enabled, notificationPreferences);
      if (updated) setNotificationPreferences(updated);
    }
    setSavingKey(null);
  };

  const handleSeed = () => { /* existing seed logic */ };

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

  // Kategori başına şablonları grupla
  const templatesByCategory: Record<string, NotificationTemplateInfo[]> = {};
  templates.forEach(t => {
    if (!templatesByCategory[t.category]) templatesByCategory[t.category] = [];
    templatesByCategory[t.category].push(t);
  });

  const categoryLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    MATCH:    { label: 'Maç Bildirimleri', icon: <span>⚽</span> },
    TEAM:     { label: 'Takım Bildirimleri', icon: <span>🛡️</span> },
    REMINDER: { label: 'Hatırlatıcılar', icon: <span>⏰</span> },
    DISCOVERY:{ label: 'Keşif', icon: <span>📍</span> },
    PROMO:    { label: 'Kampanyalar', icon: <span>🎁</span> },
    SYSTEM:   { label: 'Genel', icon: <span>📊</span> },
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] pb-16">
      {/* Header */}
      <header className="p-6 flex items-center gap-4 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20 border-b border-white/5">
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

        {/* Hesap */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Hesap</h3>
          <div className="flex flex-col">
            <SettingItem icon={<User size={20} />} title="Profil Bilgileri" value="Düzenle" />
            <SettingItem icon={<Shield size={20} />} title="Güvenlik & Gizlilik" value="" />
          </div>
        </section>

        {/* Uygulama Tercihleri */}
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
            <SettingItem icon={<Moon size={20} />} title="Tema" value="Karanlık Mod" />
          </div>
        </section>

        {/* ═══ BİLDİRİM AYARLARI ═══ */}
        <section>
          <div className="flex items-center justify-between mb-3 ml-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
              <Bell size={12} className="text-[#39FF14]" /> Bildirim Ayarları
            </h3>
            {!isNative && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-bold bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-full">
                <Smartphone size={10} /> Cihazda Aktif
              </span>
            )}
          </div>

          {/* Push İzin Durumu Uyarısı (web'de) */}
          {!isNative && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-300">Uygulama Gerektiriyor</p>
                <p className="text-xs text-amber-200/70 mt-0.5 leading-relaxed">
                  Telefon bildirimlerini almak için uygulamayı iOS veya Android cihazında kullanman gerekiyor.
                  Bu ayarlar kaydedilir ve native uygulamada devreye girer.
                </p>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowNotifSettings(!showNotifSettings)}
            className="w-full flex items-center justify-between p-4 bg-[#161B22] border border-[#39FF14]/20 rounded-2xl hover:bg-[#39FF14]/5 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#39FF14]/15 rounded-xl flex items-center justify-center border border-[#39FF14]/25">
                <Bell size={18} className="text-[#39FF14]" />
              </div>
              <div className="text-left">
                <span className="text-sm font-bold text-white block">Bildirim Tercihleri</span>
                <span className="text-[11px] text-gray-400">
                  {Object.values(notificationPreferences).filter(p => p.enabled).length} / {Object.keys(notificationPreferences).length} bildirim aktif
                </span>
              </div>
            </div>
            <ChevronRight
              size={18}
              className={`text-gray-400 transition-transform duration-200 ${showNotifSettings ? 'rotate-90' : ''}`}
            />
          </button>

          {/* Bildirim Tercihleri Detay */}
          <AnimatePresence>
            {showNotifSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-4">
                  {Object.entries(categoryLabels).map(([catKey, catMeta]) => {
                    const catTemplates = templatesByCategory[catKey] || [];
                    if (catTemplates.length === 0) return null;
                    return (
                      <div key={catKey} className="bg-[#0F1318] border border-white/5 rounded-2xl overflow-hidden">
                        {/* Kategori Başlığı */}
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                          <span className="text-base">{catMeta.icon}</span>
                          <span className="text-xs font-black uppercase tracking-widest text-gray-300">{catMeta.label}</span>
                        </div>

                        {/* Bildirim Satırları */}
                        {catTemplates.map((tmpl, idx) => {
                          const prefKey = tmpl.type_key as NotificationPreferenceKey;
                          const pref = notificationPreferences[prefKey];
                          const isEnabled = pref?.enabled ?? true;
                          const isMandatory = pref?.mandatory || tmpl.is_mandatory;
                          const isSaving = savingKey === prefKey;

                          return (
                            <div
                              key={tmpl.type_key}
                              className={`flex items-center justify-between px-4 py-3.5 ${idx < catTemplates.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                            >
                              <div className="flex items-center gap-3 flex-1 pr-4">
                                {isMandatory ? (
                                  <Lock size={14} className="text-gray-500 shrink-0" />
                                ) : (
                                  <div className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <div>
                                  <span className="text-sm font-semibold text-white">{tmpl.label_tr}</span>
                                  {isMandatory && (
                                    <span className="block text-[10px] text-gray-500 mt-0.5">Güvenlik nedeniyle zorunludur</span>
                                  )}
                                </div>
                              </div>

                              {/* Toggle */}
                              <div className="flex items-center gap-2 shrink-0">
                                {isSaving && (
                                  <RefreshCw size={12} className="animate-spin text-gray-400" />
                                )}
                                <button
                                  onClick={() => !isMandatory && handleToggleNotif(prefKey, !isEnabled)}
                                  disabled={isMandatory || isSaving}
                                  className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                                    isMandatory
                                      ? 'bg-gray-700 cursor-not-allowed opacity-60'
                                      : isEnabled
                                        ? 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.4)]'
                                        : 'bg-gray-700'
                                  }`}
                                  aria-label={isEnabled ? 'Kapat' : 'Aç'}
                                >
                                  <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${
                                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Açıklama */}
                  <div className="flex items-start gap-2 px-2">
                    <Lock size={12} className="text-gray-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      Kilit ikonu ile işaretlenen bildirimler, güvenlik ve hizmet kalitesi nedeniyle zorunludur ve kapatılamaz.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Geliştirici Konsolu */}
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
              <><RefreshCw size={14} className="animate-spin text-yellow-500" /> Veritabanı Yükleniyor...</>
            ) : (
              <><Database size={14} className="text-yellow-500" /> Veritabanını Tohumla (Seed DB)</>
            )}
          </button>
        </section>

        {/* Gizlilik & Veri (KVKK) */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2 flex items-center gap-2">
            <Shield size={12} className="text-blue-400" /> Gizlilik & Veri
          </h3>
          <div className="flex flex-col bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                  {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                </div>
                <div>
                  <span className="text-sm font-bold text-white block">Mesaj Geçmişimi İndir</span>
                  <span className="text-xs text-gray-400">KVKK gereği tüm sohbet verilerini JSON olarak indir</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-600" />
            </button>

            <button
              onClick={handleLoadBlocked}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                  <ShieldOff size={16} />
                </div>
                <div>
                  <span className="text-sm font-bold text-white block">Engellenen Kullanıcılar</span>
                  <span className="text-xs text-gray-400">Mesajlaşmasını engellediğin kişileri yönet</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
          {exportMsg && (
            <p className="mt-2 text-[11px] text-blue-300 px-2">{exportMsg}</p>
          )}

          {showBlocked && (
            <div className="mt-3 bg-[#0F1318] border border-white/5 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-xs font-black uppercase tracking-widest text-gray-300">Engellediklerin ({blockedList.length})</span>
                <button onClick={() => setShowBlocked(false)} className="text-gray-500 text-xs">Kapat</button>
              </div>
              {blockedList.length === 0 ? (
                <p className="text-center text-xs text-gray-500 py-6">Engellediğin kimse yok.</p>
              ) : (
                blockedList.map((b) => (
                  <div key={b.blocked_id} className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] last:border-0">
                    <div>
                      <span className="text-xs text-white font-mono">{b.blocked_id.substring(0, 10)}…</span>
                      {b.reason && <span className="block text-[10px] text-gray-500 mt-0.5">{b.reason}</span>}
                    </div>
                    <button
                      onClick={() => handleUnblock(b.blocked_id)}
                      className="px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-black uppercase rounded-lg hover:bg-green-500/20"
                    >
                      Engeli Kaldır
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Konum */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Konum & Tercihler</h3>
          <div className="flex flex-col bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden">
            <button onClick={handleUpdateLocation} disabled={isUpdatingLocation} className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5 text-left">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                  {isUpdatingLocation ? <RefreshCw size={16} className="animate-spin" /> : <MapPin size={16} />}
                </div>
                <div>
                  <span className="text-sm font-bold text-white block">Konumumu Güncelle</span>
                  <span className="text-xs text-gray-400">Yakındaki maçları daha doğru listeler</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
        </section>

        {/* Destek */}
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
          <p className="text-[10px] text-gray-600 font-mono">v2.5.0 • Push Notifications Entegre</p>
        </div>

      </main>
    </div>
  );
};

export default SettingsScreen;
