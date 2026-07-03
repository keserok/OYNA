import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, User, Globe, Bell, Shield, HelpCircle, LogOut, ChevronRight,
  RefreshCw, Moon, MapPin, Lock, CheckCircle2, XCircle, Smartphone,
  AlertCircle, Download, Trash2, X, Repeat
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppView, OynaLocation } from '../types';
import { logout, auth } from '../supabaseAuth';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { fbUpdateUserLocation } from '../supabaseMutations';
import { detectRegion } from '../services/locationService';
import LocationPickerSheet from '../components/location/LocationPickerSheet';
import LocationBadge from '../components/location/LocationBadge';
import { NOTIFICATION_CATEGORIES, fetchNotificationTemplates, updateNotificationPreference, NotificationTemplateInfo } from '../notifications/notificationPreferences';
import type { NotificationPreferenceKey } from '../notifications/pushService';
import { Capacitor } from '@capacitor/core';
import { Toast } from '../components/common/Toast';
import { MODAL_BACKDROP, MODAL_CARD } from '../components/common/motion';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

// ─── İki adımlı hesap silme modal ─────────────────────────────────────────────
const DeleteAccountModal: React.FC<{
  onClose: () => void;
  onConfirmed: () => void;
}> = ({ onClose, onConfirmed }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);

  const handleConfirm = async () => {
    if (confirmText !== 'HESABIMI SİL') return;
    setLoading(true);
    try {
      await supabase.rpc('request_account_deletion');
      setToast({ message: 'Silme talebiniz alındı. 7 gün içinde hesabınız silinecek.', variant: 'success' });
      setTimeout(() => {
        onConfirmed();
      }, 2000);
    } catch {
      setToast({ message: 'Bir hata oluştu. Lütfen tekrar deneyin.', variant: 'error' });
      setLoading(false);
    }
  };

  return (
    <motion.div
      {...MODAL_BACKDROP}
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-6"
    >
      <motion.div
        {...MODAL_CARD}
        className="w-full max-w-sm rounded-[28px] p-6"
        style={{
          background: 'linear-gradient(180deg, #1a0808 0%, #0A0E14 100%)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-white text-lg">
            {step === 1 ? 'Hesabı Sil' : 'Son Adım'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {toast && (
          <div className={`mb-4 p-3 rounded-xl text-sm font-bold text-center border ${
            toast.variant === 'success'
              ? 'bg-green-500/15 border-green-500/25 text-green-300'
              : 'bg-red-500/15 border-red-500/25 text-red-300'
          }`}>
            {toast.message}
          </div>
        )}

        {step === 1 ? (
          <>
            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
              Bu işlem <span className="text-red-400 font-bold">geri alınamaz</span>. Hesabın, tüm verilerinle birlikte 7 gün içinde kalıcı olarak silinecek.
              Devam etmek istediğine emin misin?
            </p>
            <div className="space-y-3">
              <button
                onClick={() => setStep(2)}
                className="w-full h-12 rounded-2xl font-black text-sm bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Evet, Devam Et
              </button>
              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl font-black text-sm text-gray-400 border border-white/10"
              >
                İptal
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
              Onaylamak için aşağıya <span className="text-red-400 font-bold">HESABIMI SİL</span> yazın:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="HESABIMI SİL"
              className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-4 text-white font-bold text-sm outline-none focus:border-red-500/50 mb-4"
            />
            <div className="space-y-3">
              <button
                onClick={handleConfirm}
                disabled={confirmText !== 'HESABIMI SİL' || loading}
                className="w-full h-12 rounded-2xl font-black text-sm bg-red-600 text-white disabled:opacity-40 transition-opacity"
              >
                {loading ? 'İŞLENİYOR...' : 'Hesabımı Kalıcı Olarak Sil'}
              </button>
              <button
                onClick={onClose}
                className="w-full h-12 rounded-2xl font-black text-sm text-gray-400 border border-white/10"
              >
                İptal
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, onNavigate }) => {
  const [lang, setLang] = useState('TR');
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [templates, setTemplates] = useState<NotificationTemplateInfo[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isNative] = useState(() => Capacitor.isNativePlatform());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDataDownloadModal, setShowDataDownloadModal] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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

  const handleRegionSelect = (loc: OynaLocation) => {
    setActiveRegion(loc);
    if (loc.coordinates) setUserLocation(loc.coordinates);
    if (loc.source === 'gps') setLocationPermissionStatus('GRANTED');
    if (auth.currentUser && loc.source === 'gps' && loc.coordinates) {
      fbUpdateUserLocation(auth.currentUser.uid, loc.coordinates.lat, loc.coordinates.lng).catch(() => {});
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
            <SettingItem icon={<User size={20} />} title="Profil Bilgileri" value="Düzenle" />
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
              <LocationBadge region={activeRegion} onClick={() => setShowLocationPicker(true)} className="w-full" />
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

            <button
              onClick={() => setShowLocationPicker(true)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-300">
                  <MapPin size={16} />
                </div>
                <div className="text-left">
                  <span className="text-sm font-bold text-white block">Bölgeyi Elle Seç</span>
                  <span className="text-xs text-gray-400">İl / ilçe · 81 il</span>
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
                min={1}
                max={100}
                value={searchRadius}
                onChange={(e) => setSearchRadius(Number(e.target.value))}
                className="w-full accent-[#39FF14] cursor-pointer"
              />
              <p className="text-[10px] text-gray-500 italic mt-1.5">Yakınındaki maçların listeleneceği arama çemberi (KM).</p>
            </div>
          </div>
        </section>

        {/* Hesap ve Veri (KVKK) */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-2">Hesap ve Veri</h3>
          <div className="space-y-3">
            {/* Kişisel Veri İndir */}
            <button
              onClick={() => setShowDataDownloadModal(true)}
              className="w-full flex items-center justify-between p-4 bg-[#161B22] border border-white/5 rounded-2xl hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="text-gray-400"><Download size={20} /></div>
                <div className="text-left">
                  <span className="text-sm font-bold text-white block">Kişisel Verilerimi İndir</span>
                  <span className="text-xs text-gray-500">KVKK kapsamında veri talebi</span>
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-600" />
            </button>

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

      {/* Aksiyon hatası toast */}
      <AnimatePresence>
        {toastMsg && <Toast message={toastMsg} variant="error" />}
      </AnimatePresence>

      {/* Kişisel veri indirme placeholder modal */}
      <AnimatePresence>
        {showDataDownloadModal && (
          <motion.div
            {...MODAL_BACKDROP}
            className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-6"
            onClick={() => setShowDataDownloadModal(false)}
          >
            <motion.div
              {...MODAL_CARD}
              className="w-full max-w-sm rounded-[28px] p-6 text-center"
              style={{ background: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                <Download size={26} className="text-gray-300" />
              </div>
              <h3 className="text-lg font-black text-white mb-2">Yakında Aktif Olacak</h3>
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                Kişisel veri indirme özelliği çok yakında kullanıma açılacak.
              </p>
              <button
                onClick={() => setShowDataDownloadModal(false)}
                className="w-full h-12 rounded-2xl font-black text-sm bg-white/10 text-white"
              >
                Tamam
              </button>
            </motion.div>
          </motion.div>
        )}
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

      {/* Konum seçici — GPS + elle 81 il/ilçe */}
      <LocationPickerSheet
        open={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onSelect={handleRegionSelect}
      />
    </div>
  );
};

export default SettingsScreen;
