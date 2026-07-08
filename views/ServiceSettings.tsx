
import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserRole } from '../types';
import {
  ArrowLeft, Bell, Lock, Moon, Sun, HelpCircle,
  ChevronRight, LogOut, Star, KeyRound, Trash2
} from 'lucide-react';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { useAppStore } from '../store';
import { APP_VERSION } from '../utils/appVersion';
import DeleteAccountModal from '../components/common/DeleteAccountModal';

const CONTACT_EMAIL = 'destek@oyna.app';

interface ServiceSettingsProps {
  role: UserRole;
  onBack: () => void;
  onLogout: () => void;
}

type SectionKey = null | 'notifications' | 'privacy' | 'appearance' | 'security' | 'support';

// ─── Standalone toggle row — never re-renders siblings ─────────────────────
const ToggleRow = React.memo(({
  label, desc, checked, onChange, accentColor,
}: {
  label: string; desc?: string; checked: boolean; onChange: () => void; accentColor: string;
}) => (
  <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0 gap-4">
    <div className="flex-1">
      <p className="text-sm font-bold text-white">{label}</p>
      {desc && <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{desc}</p>}
    </div>
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="shrink-0 w-11 h-6 rounded-full relative transition-colors duration-300 outline-none focus:outline-none"
      style={{ background: checked ? accentColor : 'rgba(255,255,255,0.1)' }}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${checked ? 'right-1' : 'left-1'}`}
      />
    </button>
  </div>
));

const ServiceSettings: React.FC<ServiceSettingsProps> = ({ role, onBack, onLogout }) => {
  const isRef = role === UserRole.REFEREE;
  const accentColor = isRef ? '#ef4444' : '#22c55e';
  const accentBg = isRef ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.10)';

  const { adminGoalkeepers, adminReferees, updateOwnProvider } = useAppStore();
  const me = (isRef ? adminReferees : adminGoalkeepers).find(x => x.id === (auth.currentUser?.uid || 'u1')) || (isRef ? adminReferees[0] : adminGoalkeepers[0]);
  
  const savedSettings = me?.settings || {};

  const [openSection, setOpenSection] = useState<SectionKey>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Notification toggles
  const [notifNewOffer, setNotifNewOffer] = useState(savedSettings.notifNewOffer ?? true);
  const [notifReminder, setNotifReminder] = useState(savedSettings.notifReminder ?? true);
  const [notifPayment, setNotifPayment] = useState(savedSettings.notifPayment ?? true);
  const [notifMarketing, setNotifMarketing] = useState(savedSettings.notifMarketing ?? false);
  const [notifWeekly, setNotifWeekly] = useState(savedSettings.notifWeekly ?? true);

  // Privacy
  const [showProfile, setShowProfile] = useState(savedSettings.showProfile ?? true);
  const [showRating, setShowRating] = useState(savedSettings.showRating ?? true);
  const [hidePhone, setHidePhone] = useState(savedSettings.hidePhone ?? false);
  const [allowOffer, setAllowOffer] = useState(savedSettings.allowOffer ?? true);

  // Appearance
  const [darkMode, setDarkMode] = useState(savedSettings.darkMode ?? true);

  // Hesap güvenliği
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<{ text: string; variant: 'success' | 'error' } | null>(null);

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      setSecurityMessage({ text: 'Şifre en az 6 karakter olmalı.', variant: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityMessage({ text: 'Şifreler eşleşmiyor.', variant: 'error' });
      return;
    }
    setIsSavingPassword(true);
    setSecurityMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSecurityMessage({ text: 'Şifreniz güncellendi.', variant: 'success' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setSecurityMessage({ text: err instanceof Error ? err.message : 'Şifre güncellenemedi.', variant: 'error' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  // FAZ 8A — ayarlar self-servis RPC ile DB'ye gerçekten yazılır
  const updateSettings = (key: string, value: any) => {
    if (!me) return;
    const newSettings = { ...savedSettings, [key]: value };
    updateOwnProvider(isRef ? 'REF' : 'GK', { id: me.id, settings: newSettings })
      .catch((err: any) => console.error('Ayar kaydedilemedi:', err?.message));
  };

  // Apply dark/light mode to document
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      document.body.style.background = '#060A12';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      document.body.style.background = '#f1f5f9';
    }
    return () => {
      root.style.colorScheme = '';
      document.body.style.background = '';
    };
  }, [darkMode]);

  const toggleSection = useCallback((key: SectionKey) => {
    setOpenSection(prev => prev === key ? null : key);
  }, []);

  const SectionCard = ({
    sectionKey, icon, title, subtitle, color, children
  }: {
    sectionKey: SectionKey; icon: React.ReactNode; title: string;
    subtitle: string; color: string; children: React.ReactNode;
  }) => {
    const isOpen = openSection === sectionKey;
    return (
      <div className="rounded-[24px] overflow-hidden border border-white/8 bg-[#0d1420]">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between p-5"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: color + '18', color }}>
              {icon}
            </div>
            <div className="text-left">
              <p className="font-black text-sm text-white">{title}</p>
              <p className="text-[10px] text-gray-500 font-medium">{subtitle}</p>
            </div>
          </div>
          <ChevronRight
            size={18}
            className="text-gray-600 transition-transform duration-300"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          />
        </button>
        {isOpen && (
          <div className="px-5 pb-5 border-t border-white/5 pt-3">
            {children}
          </div>
        )}
      </div>
    );
  };

  const screenBg = darkMode ? 'bg-[#060A12]' : 'bg-slate-100';
  const textColor = darkMode ? 'text-white' : 'text-gray-900';
  const cardBg = darkMode ? 'bg-[#0d1420]' : 'bg-white';

  return (
    <div className={`min-h-screen ${screenBg} ${textColor} transition-colors duration-500`}>

      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-20 right-0 w-60 h-60 rounded-full blur-[100px]"
          style={{ background: accentColor, opacity: 0.06 }} />
      </div>

      {/* Header */}
      <div className={`sticky top-0 z-30 px-4 pt-12 pb-4 flex items-center gap-3 ${darkMode ? 'bg-[#060A12]/80' : 'bg-slate-100/80'} backdrop-blur-xl border-b border-white/5`}>
        <button onClick={onBack} className="p-2.5 rounded-2xl bg-white/5 border border-white/10">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-black">Ayarlar</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: accentColor }}>
            {isRef ? 'Hakem' : 'Kaleci'} Hesabı
          </p>
        </div>
      </div>

      <div className="px-4 pb-24 space-y-3 mt-4">

        {/* Account summary */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-[24px] p-5 flex items-center gap-4 border border-white/8`}
          style={{ background: accentBg }}
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-black font-black text-xl"
            style={{ background: accentColor }}>
            {isRef ? '⚖️' : '🧤'}
          </div>
          <div className="flex-1">
            <p className="font-black">{me?.name || (isRef ? 'Hakem' : 'Kaleci')}</p>
            <p className="text-[10px] text-gray-400 font-medium">
              {isRef ? 'Hakem' : 'Kaleci'} Hesabı
            </p>
            <div className="flex items-center gap-1 mt-1">
              <Star size={10} className="text-yellow-400" fill="currentColor" />
              <span className="text-[10px] font-black">{typeof me?.rating === 'number' ? me.rating.toFixed(1) : '—'}</span>
              <span className="text-[10px] text-gray-500">• {me?.matchCount ?? 0} maç</span>
            </div>
          </div>
        </motion.div>

        {/* Bildirimler */}
        <SectionCard
          sectionKey="notifications"
          icon={<Bell size={18} />}
          title="Bildirimler"
          subtitle="Teklif ve hatırlatma bildirimleri"
          color="#f59e0b"
        >
          <ToggleRow label="Yeni Teklif" desc="Kaptanlardan gelen tekliflerde bildir"
            checked={notifNewOffer} onChange={() => { setNotifNewOffer(!notifNewOffer); updateSettings('notifNewOffer', !notifNewOffer); }} accentColor={accentColor} />
          <ToggleRow label="Maç Hatırlatıcı" desc="Maçtan 2 saat önce bildir"
            checked={notifReminder} onChange={() => { setNotifReminder(!notifReminder); updateSettings('notifReminder', !notifReminder); }} accentColor={accentColor} />
          <ToggleRow label="Ödeme Bildirimi" desc="Para transferlerinde anında bildir"
            checked={notifPayment} onChange={() => { setNotifPayment(!notifPayment); updateSettings('notifPayment', !notifPayment); }} accentColor={accentColor} />
          <ToggleRow label="Haftalık Rapor" desc="Kazanç ve performans özeti"
            checked={notifWeekly} onChange={() => { setNotifWeekly(!notifWeekly); updateSettings('notifWeekly', !notifWeekly); }} accentColor={accentColor} />
          <ToggleRow label="Kampanyalar" desc="Özel fırsatlar ve duyurular"
            checked={notifMarketing} onChange={() => { setNotifMarketing(!notifMarketing); updateSettings('notifMarketing', !notifMarketing); }} accentColor="#6b7280" />
        </SectionCard>

        {/* Gizlilik */}
        <SectionCard
          sectionKey="privacy"
          icon={<Lock size={18} />}
          title="Gizlilik"
          subtitle="Profil görünürlük ayarları"
          color="#8b5cf6"
        >
          <ToggleRow label="Profilimi Göster" desc="Kaptanlar profilini görebilir"
            checked={showProfile} onChange={() => { setShowProfile(!showProfile); updateSettings('showProfile', !showProfile); }} accentColor={accentColor} />
          <ToggleRow label="Puan Görünsün" desc="Reyting puanını herkese göster"
            checked={showRating} onChange={() => { setShowRating(!showRating); updateSettings('showRating', !showRating); }} accentColor={accentColor} />
          <ToggleRow label="Telefon Gizle" desc="Telefon numarasını sakla"
            checked={hidePhone} onChange={() => { setHidePhone(!hidePhone); updateSettings('hidePhone', !hidePhone); }} accentColor={accentColor} />
          <ToggleRow label="Direkt Teklif Al" desc="Kaptanlar sana doğrudan teklif gönderebilir"
            checked={allowOffer} onChange={() => { setAllowOffer(!allowOffer); updateSettings('allowOffer', !allowOffer); }} accentColor={accentColor} />
        </SectionCard>

        {/* Görünüm */}
        <SectionCard
          sectionKey="appearance"
          icon={darkMode ? <Moon size={18} /> : <Sun size={18} />}
          title="Görünüm"
          subtitle={darkMode ? 'Karanlık mod aktif' : 'Aydınlık mod aktif'}
          color="#3b82f6"
        >
          <div className="flex items-center justify-between py-3 gap-4">
            <div className="flex-1">
              <p className="text-sm font-bold">Karanlık Mod</p>
              <p className="text-[10px] text-gray-500">{darkMode ? 'Koyu tema aktif' : 'Açık tema aktif'}</p>
            </div>
            <button
              onClick={() => { setDarkMode(!darkMode); updateSettings('darkMode', !darkMode); }}
              className="shrink-0 w-14 h-7 rounded-full relative transition-colors duration-400 focus:outline-none"
              style={{ background: darkMode ? '#3b82f6' : '#e5e7eb' }}
            >
              <motion.span
                animate={{ x: darkMode ? 28 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute left-1 top-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px]"
                style={{ background: darkMode ? '#fff' : '#3b82f6' }}
              >
                {darkMode ? '🌙' : '☀️'}
              </motion.span>
            </button>
          </div>
        </SectionCard>

        {/* Hesap Güvenliği */}
        <SectionCard
          sectionKey="security"
          icon={<KeyRound size={18} />}
          title="Hesap Güvenliği"
          subtitle="Şifre değiştir, hesabı sil"
          color="#ef4444"
        >
          <div className="space-y-4 pb-1">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase">Yeni Şifre</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500/40"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Şifre tekrar"
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500/40"
              />
              {securityMessage && (
                <p className={`text-[11px] font-bold ${securityMessage.variant === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {securityMessage.text}
                </p>
              )}
              <button
                onClick={handlePasswordChange}
                disabled={isSavingPassword || !newPassword || !confirmPassword}
                className="w-full py-3 rounded-2xl font-black text-sm text-white disabled:opacity-50"
                style={{ background: '#3b82f6' }}
              >
                {isSavingPassword ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
              </button>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-red-500/20"
              style={{ background: 'rgba(239,68,68,0.06)' }}
            >
              <div className="flex items-center gap-3">
                <Trash2 size={16} className="text-red-400" />
                <div className="text-left">
                  <span className="text-sm font-bold text-red-400 block">Hesabı Kalıcı Olarak Sil</span>
                  <span className="text-[10px] text-red-400/60">Bu işlem geri alınamaz</span>
                </div>
              </div>
            </button>
          </div>
        </SectionCard>

        {/* Destek */}
        <SectionCard
          sectionKey="support"
          icon={<HelpCircle size={18} />}
          title="Destek"
          subtitle="SSS ve iletişim"
          color="#f97316"
        >
          {[
            { label: 'Sık Sorulan Sorular', desc: 'Ödeme, maç ve profil hakkında', subject: 'Sık Sorulan Sorular' },
            { label: 'Canlı Destek', desc: 'Hafta içi 09:00-22:00', subject: 'Canlı Destek Talebi' },
            { label: 'Hata Bildir', desc: 'Sorun mu yaşıyorsun?', subject: 'Hata Bildirimi' },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => { window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`OYNA — ${item.subject}`)}`; }}
              className="w-full flex items-center justify-between py-3 border-b border-white/5 last:border-0 text-left"
            >
              <div>
                <p className="text-sm font-bold">{item.label}</p>
                <p className="text-[10px] text-gray-500">{item.desc}</p>
              </div>
              <ChevronRight size={16} className="text-gray-600" />
            </button>
          ))}
          <div className="w-full flex items-center justify-between py-3 text-left">
            <div>
              <p className="text-sm font-bold">Uygulama Versiyonu</p>
              <p className="text-[10px] text-gray-500">OYNA v{APP_VERSION}</p>
            </div>
          </div>
        </SectionCard>

        {/* Çıkış */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          {confirmLogout ? (
            <div className="rounded-[24px] p-5 border border-red-500/30 bg-red-950/30 text-center space-y-4">
              <p className="font-bold">Çıkış yapmak istediğinden emin misin?</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmLogout(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/10 font-black text-sm text-gray-400">
                  İPTAL
                </button>
                <button onClick={onLogout}
                  className="flex-1 py-3 rounded-2xl bg-red-500 font-black text-sm text-white">
                  ÇIKIŞ YAP
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLogout(true)}
              className="w-full py-4 rounded-[24px] border border-red-500/20 flex items-center justify-center gap-3 text-red-400 font-black text-sm"
              style={{ background: 'rgba(239,68,68,0.06)' }}
            >
              <LogOut size={18} />
              Çıkış Yap
            </button>
          )}
        </motion.div>

        <p className="text-center text-[10px] text-gray-600 font-bold uppercase tracking-widest pt-2">
          OYNA © 2025 • Tüm hakları saklıdır
        </p>
      </div>

      {/* Hesap silme modal — tek kaynak, oyuncu ayarlarıyla aynı bileşen */}
      <AnimatePresence>
        {showDeleteModal && (
          <DeleteAccountModal
            onClose={() => setShowDeleteModal(false)}
            onConfirmed={() => {
              setShowDeleteModal(false);
              onLogout();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default ServiceSettings;
