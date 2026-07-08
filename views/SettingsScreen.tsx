import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, User, Globe, Bell, Shield, HelpCircle, LogOut, ChevronRight,
  RefreshCw, Moon, MapPin, Lock, Smartphone,
  AlertCircle, Download, Trash2, Repeat
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppView } from '../types';
import { logout, auth } from '../supabaseAuth';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { fbUpdateUserLocation } from '../supabaseMutations';
import { detectRegion } from '../services/locationService';
import LocationBadge from '../components/location/LocationBadge';
import { NOTIFICATION_CATEGORIES, fetchNotificationTemplates, updateNotificationPreference, NotificationTemplateInfo } from '../notifications/notificationPreferences';
import type { NotificationPreferenceKey } from '../notifications/pushService';
import { Capacitor } from '@capacitor/core';
import { Toast } from '../components/common/Toast';
import PrivacySection from '../components/social/PrivacySection';
import DeleteAccountModal from '../components/common/DeleteAccountModal';
import { APP_VERSION } from '../utils/appVersion';
import { getFullUserProfile, getMatchHistory } from '../services/userService';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const CONTACT_EMAIL = 'destek@oyna.app';

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, onNavigate }) => {
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [templates, setTemplates] = useState<NotificationTemplateInfo[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isNative] = useState(() => Capacitor.isNativePlatform());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingProfile, setIsExportingProfile] = useState(false);
  const [profileExportError, setProfileExportError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMsg(message);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const { setUserLocation, setLocationPermissionStatus, activeRegion, setActiveRegion, searchRadius, setSearchRadius, notificationPreferences, setNotificationPreferences, updateSingleNotificationPref, myRoles, setIsRoleSwitcherOpen } = useAppStore();
  const hasMultipleRoles = myRoles.length > 1;

  // Şablonları yükle
  useEffect(() => {
    fetchNotificationTemplates().then(setTemplates);
  }, []);

  // Kullanıcının saha sahibi olup olmadığını tespit et
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return;
        const { count } = await supabase
          .from('pitches')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', uid);
        if (active) setIsOwner((count ?? 0) > 0);
      } catch {
        /* sessiz geç */
      }
    })();
    return () => { active = false; };
  }, []);

  // KVKK — Tesis verilerini JSON olarak indir (client-side)
  const handleExportOwnerData = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('Oturumunuz bulunamadı.');

      const { data: pitches, error: pErr } = await supabase
        .from('pitches')
        .select('*')
        .eq('owner_id', uid);
      if (pErr) throw pErr;

      const pitchIds = (pitches ?? []).map((p) => (p as { id: string }).id);
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      let bookings: unknown[] = [];
      let expenses: unknown[] = [];
      let debtors: unknown[] = [];
      let subscriptions: unknown[] = [];

      if (pitchIds.length > 0) {
        const [bRes, eRes, dRes, sRes] = await Promise.all([
          supabase.from('pitch_bookings').select('*').in('pitch_id', pitchIds).gte('booking_date', oneYearAgo),
          supabase.from('pitch_expenses').select('*').in('pitch_id', pitchIds).gte('expense_date', oneYearAgo),
          supabase.from('pitch_debtors').select('*').in('pitch_id', pitchIds),
          supabase.from('pitch_subscriptions').select('*').in('pitch_id', pitchIds),
        ]);
        if (bRes.error) throw bRes.error;
        if (eRes.error) throw eRes.error;
        if (dRes.error) throw dRes.error;
        if (sRes.error) throw sRes.error;
        bookings = bRes.data ?? [];
        expenses = eRes.data ?? [];
        debtors = dRes.data ?? [];
        subscriptions = sRes.data ?? [];
      }

      const payload = {
        exported_at: new Date().toISOString(),
        owner_id: uid,
        pitches: pitches ?? [],
        bookings,
        expenses,
        debtors,
        subscriptions,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oyna-tesis-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('handleExportOwnerData:', err);
      const raw = err instanceof Error ? err.message : String(err);
      setExportError(raw.includes('Failed to fetch') ? 'Bağlantı hatası. İnternetinizi kontrol edin.' : 'Veriler indirilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsExporting(false);
    }
  };

  // KVKK m.11 — kişisel verilerimi JSON olarak indir (oyuncu). Tesis sahibi
  // exportuyla aynı kalıp: profil + maç geçmişi + bildirim tercihleri.
  const handleExportPlayerData = async () => {
    setIsExportingProfile(true);
    setProfileExportError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('Oturumunuz bulunamadı.');

      const [profile, matchHistory] = await Promise.all([
        getFullUserProfile(uid),
        getMatchHistory(uid),
      ]);

      const payload = {
        exported_at: new Date().toISOString(),
        user_id: uid,
        profile,
        match_history: matchHistory,
        notification_preferences: notificationPreferences,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oyna-verilerim-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('handleExportPlayerData:', err);
      const raw = err instanceof Error ? err.message : String(err);
      setProfileExportError(raw.includes('Failed to fetch') ? 'Bağlantı hatası. İnternetinizi kontrol edin.' : 'Veriler indirilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsExportingProfile(false);
    }
  };

  const handleUpdateLocation = async () => {
    setIsUpdatingLocation(true);
    // Ortak konum servisi: GPS al → "Ordu · Altınordu" bölgesine çöz → aktif et.
    try {
      const loc = await detectRegion();
      if (loc.coordinates) setUserLocation(loc.coordinates);
      setLocationPermissionStatus('GRANTED');
      setActiveRegion(loc);
      if (auth.currentUser && loc.coordinates) {
        await fbUpdateUserLocation(auth.currentUser.uid, loc.coordinates.lat, loc.coordinates.lng).catch(() => {});
      }
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (err) {
      console.error(err);
      showToast('Konum alınamadı. Lütfen cihaz ayarlarından izin verin.');
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('SPLASH');
    } catch (error) {
      console.error('Error logging out:', error);
      showToast('Çıkış yapılırken bir hata oluştu. Lütfen tekrar dene.');
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

  // Etkileşimli görünüp hiçbir şey yapmayan kontroller güveni zedeler — henüz
  // gerçek bir işlevi olmayan ayarlar (tema, dil) SettingItem yerine bunu kullanır:
  // tıklanabilir gibi görünmez, ok işareti yoktur.
  const InfoItem = ({ icon, title, value, note, color = 'text-gray-500' }: any) => (
    <div className="w-full flex items-center justify-between p-4 bg-[#161B22] border border-white/5 first:rounded-t-2xl last:rounded-b-2xl border-b-0 last:border-b">
      <div className="flex items-center gap-4">
        <div className="text-gray-400">{icon}</div>
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold ${color}`}>{value}</span>
        {note && (
          <span className="text-[9px] font-black uppercase tracking-wide text-gray-500 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
            {note}
          </span>
        )}
      </div>
    </div>
  );

  // Kategori başına şablonları grupla — tek kaynak NOTIFICATION_CATEGORIES
  // (notifications/notificationPreferences.ts). Bilinmeyen bir kategori DB'de
  // eklenirse "Diğer Bildirimler" altında yakalanır, sessizce kaybolmaz.
  const categoryIcons: Record<string, React.ReactNode> = {
    MATCH: <span>⚽</span>,
    STAFF: <span>🧤</span>,
    REMINDER: <span>⏰</span>,
    DISCOVERY: <span>📍</span>,
    GENERAL: <span>📊</span>,
  };
  const categorizedKeys = new Set(NOTIFICATION_CATEGORIES.flatMap(c => c.preferences as string[]));
  const notificationGroups = [
    ...NOTIFICATION_CATEGORIES.map(cat => ({
      key: cat.key,
      label: cat.label,
      icon: categoryIcons[cat.key] ?? <span>🔔</span>,
      items: templates.filter(t => (cat.preferences as string[]).includes(t.type_key)),
    })),
    {
      key: 'OTHER',
      label: 'Diğer Bildirimler',
      icon: <span>🔔</span>,
      items: templates.filter(t => !categorizedKeys.has(t.type_key)),
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0E14] pb-16">
      {/* Header */}
      <header className="p-6 flex items-center gap-4 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20 border-b border-white/5">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center bg-[#161B22] rounded-full border border-white/5 text-white hover:bg-white/10 active:scale-95 transition-all"
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
            <SettingItem icon={<User size={20} />} title="Profil Bilgileri" value="Düzenle" onClick={() => onNavigate('PROFILE')} />
            {hasMultipleRoles && (
              <SettingItem
                icon={<Repeat size={20} />}
                title="Rol Değiştir"
                value="Geçiş yap"
                color="text-[#3b82f6]"
                onClick={() => setIsRoleSwitcherOpen(true)}
              />
            )}
            <SettingItem icon={<Shield size={20} />} title="Yasal & Sözleşmeler" value="" onClick={() => onNavigate('LEGAL')} />
          </div>
        </section>

        {/* Uygulama Tercihleri */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Uygulama</h3>
          <div className="flex flex-col">
            <InfoItem
              icon={<Globe size={20} />}
              title="Dil / Language"
              value="Türkçe"
              note="İngilizce yakında"
              color="text-yellow-500"
            />
            <InfoItem icon={<Moon size={20} />} title="Tema" value="Karanlık Mod" />
          </div>
        </section>

        {/* ═══ GİZLİLİK (Sosyal — Spec §3.12) ═══ */}
        <PrivacySection />

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
                  {notificationGroups.map((group) => {
                    if (group.items.length === 0) return null;
                    return (
                      <div key={group.key} className="bg-[#0F1318] border border-white/5 rounded-2xl overflow-hidden">
                        {/* Kategori Başlığı */}
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                          <span className="text-base">{group.icon}</span>
                          <span className="text-xs font-black uppercase tracking-widest text-gray-300">{group.label}</span>
                        </div>

                        {/* Bildirim Satırları */}
                        {group.items.map((tmpl, idx) => {
                          const prefKey = tmpl.type_key as NotificationPreferenceKey;
                          const pref = notificationPreferences[prefKey];
                          const isEnabled = pref?.enabled ?? true;
                          const isMandatory = pref?.mandatory || tmpl.is_mandatory;
                          const isSaving = savingKey === prefKey;

                          return (
                            <div
                              key={tmpl.type_key}
                              className={`flex items-center justify-between px-4 py-3.5 ${idx < group.items.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
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
                                  role="switch"
                                  aria-checked={isEnabled}
                                  onClick={() => !isMandatory && handleToggleNotif(prefKey, !isEnabled)}
                                  disabled={isMandatory || isSaving}
                                  className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                                    isMandatory
                                      ? 'bg-gray-700 cursor-not-allowed opacity-60'
                                      : isEnabled
                                        ? 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.4)]'
                                        : 'bg-gray-700'
                                  }`}
                                  aria-label={isMandatory ? `${tmpl.label_tr} — güvenlik nedeniyle zorunlu` : (isEnabled ? `${tmpl.label_tr} bildirimini kapat` : `${tmpl.label_tr} bildirimini aç`)}
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

        {/* Tesis Verileri (KVKK) — yalnızca saha sahipleri */}
        {isOwner && (
          <section className="bg-[#161B22] border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-[#39FF14]">
              <Download size={16} />
              <h3 className="text-xs font-black uppercase tracking-wider">Tesis Verilerim (KVKK)</h3>
            </div>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Tesisinize ait son 1 yıllık rezervasyon, gider, veresiye ve abonelik kayıtlarını JSON formatında indirin. Tüm verileriniz size aittir.
            </p>
            {exportError && (
              <div className="flex items-center gap-2 text-red-300 text-[11px] bg-red-900/20 border border-red-500/30 rounded-lg p-2">
                <AlertCircle size={14} className="shrink-0" /> {exportError}
              </div>
            )}
            <button
              disabled={isExporting}
              onClick={handleExportOwnerData}
              className="w-full flex items-center justify-center gap-2.5 p-3.5 bg-[#39FF14]/10 hover:bg-[#39FF14]/20 border border-[#39FF14]/30 rounded-xl text-[#39FF14] font-bold text-xs transition-all uppercase tracking-widest disabled:opacity-50"
            >
              {isExporting ? (
                <><RefreshCw size={14} className="animate-spin" /> Hazırlanıyor...</>
              ) : (
                <><Download size={14} /> Tesis Verilerimi İndir</>
              )}
            </button>
          </section>
        )}

        {/* Konum */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Konum</h3>
          <div className="bg-[#161B22] border border-white/5 rounded-2xl p-4 space-y-4">
            <div>
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-2 ml-0.5">Aktif Bölge</span>
              <LocationBadge region={activeRegion} interactive={false} className="w-full" />
            </div>

            <button
              onClick={handleUpdateLocation}
              disabled={isUpdatingLocation}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-[#00B0FF]/8 border border-[#00B0FF]/25 hover:bg-[#00B0FF]/12 transition-colors disabled:opacity-60"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#00B0FF]/12 flex items-center justify-center text-[#00B0FF]">
                  {isUpdatingLocation ? <RefreshCw size={16} className="animate-spin" /> : <MapPin size={16} />}
                </div>
                <div className="text-left">
                  <span className="text-sm font-bold text-white block">Konumumu Otomatik Bul</span>
                  <span className="text-xs text-gray-400">GPS ile bölgeni günceller</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-gray-600" />
            </button>

            <div className="pt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-300">Arama Yarıçapı</span>
                <span className="text-sm font-black text-[#39FF14]">{searchRadius} KM</span>
              </div>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={searchRadius}
                onChange={(e) => setSearchRadius(Number(e.target.value))}
                className="w-full accent-[#39FF14] cursor-pointer"
              />
              <p className="text-[10px] text-gray-500 italic mt-1.5">Yakınındaki maçların listeleneceği arama çemberi — 5 km adımlarla (5–50 KM).</p>
            </div>
          </div>
        </section>

        {/* Hesap ve Veri (KVKK) */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Hesap ve Veri</h3>
          <div className="space-y-3">
            {/* Kişisel Veri İndir */}
            <button
              onClick={handleExportPlayerData}
              disabled={isExportingProfile}
              className="w-full flex items-center justify-between p-4 bg-[#161B22] border border-white/5 rounded-2xl hover:bg-white/5 transition-colors disabled:opacity-60"
            >
              <div className="flex items-center gap-4">
                <div className="text-gray-400">{isExportingProfile ? <RefreshCw size={20} className="animate-spin" /> : <Download size={20} />}</div>
                <div className="text-left">
                  <span className="text-sm font-bold text-white block">Kişisel Verilerimi İndir</span>
                  <span className="text-xs text-gray-500">{isExportingProfile ? 'Hazırlanıyor...' : 'KVKK m.11 kapsamında veri talebi'}</span>
                </div>
              </div>
              {!isExportingProfile && <ChevronRight size={16} className="text-gray-600" />}
            </button>
            {profileExportError && (
              <div className="flex items-center gap-2 text-red-300 text-[11px] bg-red-900/20 border border-red-500/30 rounded-lg p-2">
                <AlertCircle size={14} className="shrink-0" /> {profileExportError}
              </div>
            )}

            {/* Hesabı Kalıcı Sil */}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center justify-between p-4 bg-red-500/8 border border-red-500/15 rounded-2xl hover:bg-red-500/15 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="text-red-400"><Trash2 size={20} /></div>
                <div className="text-left">
                  <span className="text-sm font-bold text-red-400 block">Hesabı Kalıcı Olarak Sil</span>
                  <span className="text-xs text-red-400/60">Bu işlem geri alınamaz</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-red-600" />
            </button>
          </div>
        </section>

        {/* Destek */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Destek</h3>
          <div className="flex flex-col">
            <SettingItem
              icon={<HelpCircle size={20} />}
              title="Yardım Merkezi"
              value=""
              onClick={() => { window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('OYNA — Yardım Talebi')}`; }}
            />
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 p-4 mt-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 font-bold text-sm hover:bg-red-500/20 transition-colors"
            >
              <LogOut size={18} /> Çıkış Yap
            </button>
          </div>
        </section>

        <div className="text-center">
          <p className="text-[10px] text-gray-600 font-mono">v{APP_VERSION} • Push Notifications Entegre</p>
        </div>

      </main>

      {/* Aksiyon hatası toast */}
      <AnimatePresence>
        {toastMsg && <Toast message={toastMsg} variant="error" />}
      </AnimatePresence>

      {/* Hesap silme modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <DeleteAccountModal
            onClose={() => setShowDeleteModal(false)}
            onConfirmed={async () => {
              setShowDeleteModal(false);
              await handleLogout();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SettingsScreen;
