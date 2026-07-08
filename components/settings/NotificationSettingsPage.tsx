import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bell, Lock, RefreshCw, Moon, AlertCircle, ChevronDown,
  Zap, Trophy, Volume2,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence, motion } from 'framer-motion';
import { auth } from '../../supabaseAuth';
import { useAppStore } from '../../store';
import {
  NOTIFICATION_CATEGORIES,
  fetchNotificationTemplates,
  updateAllNotificationPreferences,
  NotificationTemplateInfo,
} from '../../notifications/notificationPreferences';
import type {
  NotificationPreferences,
  NotificationPreferenceKey,
} from '../../notifications/pushService';
import SettingsSubPage from '../common/SettingsSubPage';

// ─── Bildirim Ayarları — sadeleştirilmiş + geliştirilmiş ──────────────────────
// • Kategori ana anahtarları (tek dokunuşla tüm alt bildirimleri aç/kapat)
// • Genişleyen detay (ince ayar isteyen için)
// • Hızlı ön ayarlar (Hepsi / Sadece Maç / Sessiz)
// • Sessiz saatler (notification_preferences.quiet_hours — backend zaten okuyor)
// • Cihaz izni uyarısı (OS'ta bildirim kapalıysa)
interface NotificationSettingsPageProps {
  open: boolean;
  onClose: () => void;
}

interface QuietHours { start: string; end: string }

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  MATCH: <span>⚽</span>,
  STAFF: <span>🧤</span>,
  REMINDER: <span>⏰</span>,
  DISCOVERY: <span>📍</span>,
  GENERAL: <span>📊</span>,
  OTHER: <span>🔔</span>,
};

// Ön ayar profilleri: hangi kategorilerin AÇIK olacağını belirler
// (zorunlu bildirimler her zaman açık kalır, dokunulmaz).
const PRESETS: { key: string; label: string; icon: React.ReactNode; on: string[] }[] = [
  { key: 'ALL', label: 'Hepsi', icon: <Bell size={14} />, on: ['MATCH', 'STAFF', 'REMINDER', 'DISCOVERY', 'GENERAL', 'OTHER'] },
  { key: 'MATCH_ONLY', label: 'Sadece Maç', icon: <Trophy size={14} />, on: ['MATCH', 'STAFF', 'REMINDER'] },
  { key: 'QUIET', label: 'Sessiz', icon: <Moon size={14} />, on: [] },
];

// Üründe her zaman zorunlu türler — DB şablonu/kayıtlı tercih gecikse bile
// UI'da kilitli kalır (ör. maçtan 1 saat önce hatırlatıcısı kapatılamaz).
const FORCED_MANDATORY = new Set<string>(['match_reminder_1h']);

const NotificationSettingsPage: React.FC<NotificationSettingsPageProps> = ({ open, onClose }) => {
  const { notificationPreferences, setNotificationPreferences } = useAppStore();
  const [templates, setTemplates] = useState<NotificationTemplateInfo[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isNative] = useState(() => Capacitor.isNativePlatform());
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Sessiz saatler yerel durumu (backend formatı: {start,end}, HH:mm)
  const initialQuiet = (notificationPreferences as unknown as { quiet_hours?: QuietHours }).quiet_hours;
  const [quietEnabled, setQuietEnabled] = useState<boolean>(!!initialQuiet);
  const [quietStart, setQuietStart] = useState<string>(initialQuiet?.start ?? '23:00');
  const [quietEnd, setQuietEnd] = useState<string>(initialQuiet?.end ?? '08:00');

  useEffect(() => {
    if (open) fetchNotificationTemplates().then(setTemplates);
  }, [open]);

  // Sayfa açıldığında sessiz saat durumunu store'dan tazele (tercihler
  // ilk mount'tan sonra async yüklenmiş olabilir).
  useEffect(() => {
    if (!open) return;
    const q = (notificationPreferences as unknown as { quiet_hours?: QuietHours }).quiet_hours;
    setQuietEnabled(!!q);
    if (q) { setQuietStart(q.start); setQuietEnd(q.end); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Native cihazda OS bildirim iznini kontrol et
  useEffect(() => {
    if (!open || !isNative) return;
    let active = true;
    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        if (active) setPermissionDenied(perm.receive === 'denied');
      } catch {
        /* eklenti yoksa sessiz geç */
      }
    })();
    return () => { active = false; };
  }, [open, isNative]);

  // DB şablonlarını görüntü kategorilerine grupla (tek kaynak NOTIFICATION_CATEGORIES
  // + bilinmeyenler için "Diğer" — hiçbir bildirim sessizce kaybolmaz).
  const groups = useMemo(() => {
    const categorized = new Set(NOTIFICATION_CATEGORIES.flatMap(c => c.preferences as string[]));
    const base = NOTIFICATION_CATEGORIES.map(cat => ({
      key: cat.key,
      label: cat.label,
      items: templates.filter(t => (cat.preferences as string[]).includes(t.type_key)),
    }));
    const other = templates.filter(t => !categorized.has(t.type_key));
    if (other.length) base.push({ key: 'OTHER', label: 'Diğer Bildirimler', items: other });
    return base.filter(g => g.items.length > 0);
  }, [templates]);

  const prefOf = useCallback(
    (key: string) => notificationPreferences[key as NotificationPreferenceKey],
    [notificationPreferences],
  );

  // Tek zorunluluk kaynağı: kayıtlı tercih VEYA DB şablonu VEYA ürün-zorunlusu.
  const isMandatory = useCallback(
    (t: NotificationTemplateInfo) => {
      const cur = prefOf(t.type_key);
      return !!(cur?.mandatory || t.is_mandatory || FORCED_MANDATORY.has(t.type_key));
    },
    [prefOf],
  );

  // Tek yazma yolu: iyimser store güncellemesi + DB. quiet_hours dahil tüm
  // ekstra alanları korur (updateAllNotificationPreferences pass-through yapar).
  const persist = useCallback(async (next: NotificationPreferences) => {
    setSaving(true);
    setNotificationPreferences(next);
    const uid = auth.currentUser?.uid;
    if (uid) await updateAllNotificationPreferences(uid, next);
    setSaving(false);
  }, [setNotificationPreferences]);

  // Bir kategorideki tüm ZORUNLU OLMAYAN bildirimleri hedef duruma getir
  const setCategory = (items: NotificationTemplateInfo[], enabled: boolean) => {
    const next: NotificationPreferences = { ...notificationPreferences };
    items.forEach(t => {
      const key = t.type_key as NotificationPreferenceKey;
      if (!isMandatory(t)) next[key] = { enabled, mandatory: false };
    });
    persist(next);
  };

  const toggleSingle = (t: NotificationTemplateInfo) => {
    const key = t.type_key as NotificationPreferenceKey;
    if (isMandatory(t)) return;
    const cur = notificationPreferences[key];
    const next: NotificationPreferences = { ...notificationPreferences, [key]: { enabled: !(cur?.enabled ?? true), mandatory: false } };
    persist(next);
  };

  const applyPreset = (on: string[]) => {
    const next: NotificationPreferences = { ...notificationPreferences };
    groups.forEach(g => {
      const enabled = on.includes(g.key);
      g.items.forEach(t => {
        const key = t.type_key as NotificationPreferenceKey;
        if (!isMandatory(t)) next[key] = { enabled, mandatory: false };
      });
    });
    persist(next);
  };

  // Sessiz saatleri kaydet — açıkken {start,end} yaz, kapalıyken anahtarı sil
  // (backend key yoksa sessiz saati devre dışı sayar).
  const saveQuietHours = (enabled: boolean, start: string, end: string) => {
    const next = { ...notificationPreferences } as NotificationPreferences & { quiet_hours?: QuietHours };
    if (enabled) next.quiet_hours = { start, end };
    else delete next.quiet_hours;
    persist(next);
  };

  // Kategori ana anahtar durumu: herhangi bir zorunlu-olmayan açıksa "açık"
  const categoryEnabled = (items: NotificationTemplateInfo[]) =>
    items.some(t => !isMandatory(t) && (prefOf(t.type_key)?.enabled ?? true));

  const hasOptional = (items: NotificationTemplateInfo[]) =>
    items.some(t => !isMandatory(t));

  return (
    <SettingsSubPage open={open} onClose={onClose} title="Bildirimler" subtitle="Neyin bildirileceğini yönet">
      {/* Cihaz izni uyarısı — yalnızca native cihazda izin kapalıysa */}
      {isNative && permissionDenied && (
        <div className="mb-5 bg-red-500/10 border border-red-500/25 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-300">Bildirim izni kapalı</p>
            <p className="text-xs text-red-200/70 mt-0.5 leading-relaxed">
              Aşağıdaki ayarlar kayıtlı ama telefonun bildirim iznini kapattığı için bildirim gelmez.
              Cihaz ayarlarından OYNA bildirimlerine izin ver.
            </p>
          </div>
        </div>
      )}

      {/* Hızlı ön ayarlar */}
      <div className="mb-5">
        <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2 ml-1 flex items-center gap-1.5">
          <Zap size={12} className="text-[#39FF14]" /> Hızlı Ayar
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.on)}
              disabled={saving || groups.length === 0}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-[#161B22] border border-white/8 hover:bg-white/5 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span className="text-[#39FF14]">{p.icon}</span>
              <span className="text-xs font-bold text-white">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sessiz saatler */}
      <div className="mb-5 bg-[#161B22] border border-white/8 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300">
              <Volume2 size={17} />
            </span>
            <div>
              <span className="text-sm font-bold text-white block">Sessiz Saatler</span>
              <span className="text-[11px] text-gray-400">Bu aralıkta bildirim gelmez (acil olanlar hariç)</span>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={quietEnabled}
            aria-label="Sessiz saatler"
            onClick={() => { const v = !quietEnabled; setQuietEnabled(v); saveQuietHours(v, quietStart, quietEnd); }}
            disabled={saving}
            className={`relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 ${quietEnabled ? 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.4)]' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${quietEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        <AnimatePresence>
          {quietEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-white/5"
            >
              <div className="flex items-center gap-3 p-4">
                <label className="flex-1">
                  <span className="text-[10px] font-bold uppercase text-gray-500 block mb-1">Başlangıç</span>
                  <input
                    type="time"
                    value={quietStart}
                    onChange={e => { setQuietStart(e.target.value); saveQuietHours(true, e.target.value, quietEnd); }}
                    className="w-full h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm font-bold text-white outline-none focus:border-[#39FF14]/40"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-[10px] font-bold uppercase text-gray-500 block mb-1">Bitiş</span>
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={e => { setQuietEnd(e.target.value); saveQuietHours(true, quietStart, e.target.value); }}
                    className="w-full h-11 bg-black/30 border border-white/10 rounded-xl px-3 text-sm font-bold text-white outline-none focus:border-[#39FF14]/40"
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Kategori ana anahtarları */}
      <p className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2 ml-1 flex items-center gap-1.5">
        <Bell size={12} className="text-[#39FF14]" /> Kategoriler
      </p>

      {groups.length === 0 ? (
        <div className="py-10 flex justify-center">
          <RefreshCw size={20} className="animate-spin text-gray-500" />
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map(group => {
            const isOpen = expanded === group.key;
            const optional = hasOptional(group.items);
            const on = categoryEnabled(group.items);
            return (
              <div key={group.key} className="bg-[#161B22] border border-white/8 rounded-2xl overflow-hidden">
                {/* Başlık satırı: ana anahtar + genişlet */}
                <div className="flex items-center justify-between p-4">
                  <button
                    onClick={() => setExpanded(isOpen ? null : group.key)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <span className="text-lg">{CATEGORY_ICONS[group.key] ?? <span>🔔</span>}</span>
                    <span className="text-sm font-bold text-white truncate">{group.label}</span>
                    <ChevronDown size={15} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {optional ? (
                    <button
                      role="switch"
                      aria-checked={on}
                      aria-label={`${group.label} kategorisi`}
                      onClick={() => setCategory(group.items, !on)}
                      disabled={saving}
                      className={`relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 ${on ? 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.4)]' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  ) : (
                    <Lock size={14} className="text-gray-500 shrink-0" />
                  )}
                </div>

                {/* Detay: tekil bildirimler */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden border-t border-white/5"
                    >
                      {group.items.map((t, idx) => {
                        const cur = prefOf(t.type_key);
                        const mandatory = isMandatory(t);
                        const enabled = mandatory ? true : (cur?.enabled ?? true);
                        return (
                          <div
                            key={t.type_key}
                            className={`flex items-center justify-between px-4 py-3 ${idx < group.items.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
                          >
                            <div className="flex items-center gap-2.5 flex-1 pr-3 min-w-0">
                              {mandatory && <Lock size={12} className="text-gray-500 shrink-0" />}
                              <div className="min-w-0">
                                <span className="text-[13px] font-semibold text-white block truncate">{t.label_tr}</span>
                                {mandatory && <span className="text-[10px] text-gray-500">Zorunlu — kapatılamaz</span>}
                              </div>
                            </div>
                            <button
                              role="switch"
                              aria-checked={enabled}
                              aria-label={mandatory ? `${t.label_tr} — zorunlu` : `${t.label_tr}`}
                              onClick={() => toggleSingle(t)}
                              disabled={mandatory || saving}
                              className={`relative w-10 h-[22px] rounded-full transition-all duration-200 shrink-0 ${
                                mandatory ? 'bg-gray-700 opacity-60 cursor-not-allowed' : enabled ? 'bg-[#39FF14]' : 'bg-gray-700'
                              }`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-all duration-200 ${enabled ? 'translate-x-[18px]' : 'translate-x-0'}`} />
                            </button>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2 px-2 mt-4">
        <Lock size={12} className="text-gray-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Kilit ikonlu bildirimler güvenlik ve hizmet kalitesi için zorunludur; sessiz saatlerde bile iletilebilir.
        </p>
      </div>
    </SettingsSubPage>
  );
};

export default NotificationSettingsPage;
