import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Bell, Trophy, Shield, AlertCircle, Check, Clock, Volume2, ChevronDown } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { AnimatePresence, motion } from 'framer-motion';
import { auth } from '../../supabaseAuth';
import { useAppStore } from '../../store';
import {
  fetchNotificationTemplates,
  updateAllNotificationPreferences,
  fetchNotificationMode,
  setNotificationMode,
  MODE_LEVEL,
  NotificationTemplateInfo,
  NotificationMode,
} from '../../notifications/notificationPreferences';
import type { NotificationPreferences } from '../../notifications/pushService';
import { pushCanliMi } from '../../notifications/pushCanliMi';
import SettingsSubPage from '../common/SettingsSubPage';

// ─── Bildirim Ayarları — ÜÇ MOD (S2, 4 Ağustos 2026) ─────────────────────────
//
// NEDEN DEĞİŞTİ: Bu ekran eskiden 41 ayrı açma/kapama düğmesi gösteriyordu.
// Düğmeler kaydediliyordu ama GERÇEKTE UYGULANMIYORDU — bildirim üreten 49
// veritabanı fonksiyonundan yalnız 1'i tercihe bakıyordu. Canlıda 35 kullanıcının
// 51 anahtarı kapalıydı ve hepsi yok sayılıyordu; kapatan kullanıcı bildirimi
// yine alıyordu.
//
// YENİ KURULUM: Kullanıcı üç moddan birini seçer. Hangi bildirimin hangi modda
// gideceğini YÖNETİCİ PANELİ belirler (notification_templates.mod_seviyesi) ve
// kuralı veritabanındaki tek bekçi uygular — 49 fonksiyonun hepsini kapsar.
//
// Sessiz saatler aynen korundu (send-push edge fonksiyonu uygular).

interface NotificationSettingsPageProps {
  open: boolean;
  onClose: () => void;
}

interface QuietHours { start: string; end: string }

const MODLAR: {
  key: NotificationMode;
  baslik: string;
  ozet: string;
  aciklama: string;
  icon: React.ReactNode;
  renk: string;
}[] = [
  {
    key: 'TUMU',
    baslik: 'Hepsi',
    ozet: 'Her şeyden haberim olsun',
    aciklama: 'Maç hareketleri, takım ve arkadaş bildirimleri, kampanyalar — hepsi gelir.',
    icon: <Bell size={18} />,
    renk: '#39FF14',
  },
  {
    key: 'ONEMLI',
    baslik: 'Önemli olanlar',
    ozet: 'Maçlarım ve takımım',
    aciklama: 'Maç ve kadro hareketleri, takım işleri ve paranla ilgili her şey gelir. Kampanya, arkadaşlık ve sohbet bildirimleri gelmez.',
    icon: <Trophy size={18} />,
    renk: '#FACC15',
  },
  {
    key: 'ZORUNLU',
    baslik: 'Sadece zorunlu',
    ozet: 'En aza indir',
    aciklama: 'Yalnız kapatılamayan bildirimler gelir: para hareketleri, maç iptali, sana gelen doğrudan davetler ve güvenlik uyarıları.',
    icon: <Shield size={18} />,
    renk: '#60A5FA',
  },
];

const NotificationSettingsPage: React.FC<NotificationSettingsPageProps> = ({ open, onClose }) => {
  const { notificationPreferences, setNotificationPreferences } = useAppStore();
  const [templates, setTemplates] = useState<NotificationTemplateInfo[]>([]);
  const [mod, setMod] = useState<NotificationMode>('TUMU');
  const [modYuklendi, setModYuklendi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [listeAcik, setListeAcik] = useState(false);
  const [isNative] = useState(() => Capacitor.isNativePlatform());
  const [permissionDenied, setPermissionDenied] = useState(false);
  // Telefona GERÇEK push gidiyor mu (sunucudaki push_live_enabled)?
  // Bilinene kadar `null`: ne "gider" ne "gitmez" diyoruz, hiçbir şey çizmiyoruz.
  const [telefonPushu, setTelefonPushu] = useState<boolean | null>(null);

  // Sessiz saatler yerel durumu (backend formatı: {start,end}, HH:mm)
  const initialQuiet = (notificationPreferences as unknown as { quiet_hours?: QuietHours }).quiet_hours;
  const [quietEnabled, setQuietEnabled] = useState<boolean>(!!initialQuiet);
  const [quietStart, setQuietStart] = useState<string>(initialQuiet?.start ?? '23:00');
  const [quietEnd, setQuietEnd] = useState<string>(initialQuiet?.end ?? '08:00');

  useEffect(() => {
    if (!open) return;
    void fetchNotificationTemplates().then(setTemplates);
    void fetchNotificationMode().then((m) => { setMod(m); setModYuklendi(true); });
    void pushCanliMi().then(setTelefonPushu);
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

  // Seçili modda HANGİ bildirimlerin geleceği — kullanıcı ne seçtiğini görebilsin.
  const { gelenler, gelmeyenler } = useMemo(() => {
    const sinir = MODE_LEVEL[mod];
    const gelen: NotificationTemplateInfo[] = [];
    const gelmeyen: NotificationTemplateInfo[] = [];
    templates.forEach((t) => {
      // Seviye bilinmiyorsa zorunlu say — bekçi de böyle davranır.
      const seviye = t.mod_seviyesi ?? 1;
      (seviye <= sinir ? gelen : gelmeyen).push(t);
    });
    return { gelenler: gelen, gelmeyenler: gelmeyen };
  }, [templates, mod]);

  const modSec = useCallback(async (yeni: NotificationMode) => {
    if (saving || yeni === mod) return;
    const onceki = mod;
    setSaving(true);
    setHata(null);
    setMod(yeni);                                   // iyimser güncelleme
    const ok = await setNotificationMode(yeni);
    if (!ok) {
      setMod(onceki);                               // yazılamadıysa geri al
      setHata('Ayar kaydedilemedi. Bağlantını kontrol edip tekrar dene.');
    }
    setSaving(false);
  }, [mod, saving]);

  // Sessiz saatleri kaydet — açıkken {start,end} yaz, kapalıyken anahtarı sil
  // (backend key yoksa sessiz saati devre dışı sayar).
  const saveQuietHours = useCallback(async (enabled: boolean, start: string, end: string) => {
    const next = { ...notificationPreferences } as NotificationPreferences & { quiet_hours?: QuietHours };
    if (enabled) next.quiet_hours = { start, end };
    else delete next.quiet_hours;
    setSaving(true);
    setNotificationPreferences(next);
    const uid = auth.currentUser?.uid;
    if (uid) await updateAllNotificationPreferences(uid, next);
    setSaving(false);
  }, [notificationPreferences, setNotificationPreferences]);

  return (
    <SettingsSubPage open={open} onClose={onClose} title="Bildirimler" subtitle="Ne kadar bildirim istersin?">
      {/* ─── Telefon bildirimi henüz açık değil ─────────────────────────
          Sunucudaki `push_live_enabled` kapalıyken send-push her bildirimi
          "simulated" sayıp erken dönüyor: telefona hiçbir şey gitmiyor.
          Kullanıcıya bunu SÖYLEMEK zorundayız — aşağıdaki mod seçimi
          uygulama içi bildirimlerde bugün de geçerli, ama telefonun
          çalmasını beklememeli. Anahtar panelden açıldığı gün bu şerit
          kendiliğinden kaybolur. */}
      {telefonPushu === false && (
        <div className="mb-5 bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-start gap-3">
          <Clock size={18} className="text-amber-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-200">Telefon bildirimleri henüz açık değil</p>
            <p className="text-xs text-amber-100/70 mt-0.5 leading-relaxed">
              Şu anda bildirimler yalnızca uygulama içinde görünür; telefonun çalmaz.
              Aşağıdaki seçimin şimdiden geçerli — telefon bildirimlerini açtığımızda
              aynı seçimle devam edersin.
            </p>
          </div>
        </div>
      )}

      {/* Cihaz izni uyarısı — yalnızca native cihazda, push CANLIYKEN ve izin kapalıysa.
          Push kapalıyken "izin kapalı" uyarısı yanıltıcı olurdu: izin açık olsa da
          bildirim gitmiyor. */}
      {isNative && telefonPushu === true && permissionDenied && (
        <div className="mb-5 bg-red-500/10 border border-red-500/25 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-300">Bildirim izni kapalı</p>
            <p className="text-xs text-red-200/70 mt-0.5 leading-relaxed">
              Aşağıdaki ayar kayıtlı ama telefonun bildirim iznini kapattığı için bildirim gelmez.
              Cihaz ayarlarından OYNA bildirimlerine izin ver.
            </p>
          </div>
        </div>
      )}

      {hata && (
        <div className="mb-4 bg-red-500/10 border border-red-500/25 rounded-2xl p-3 flex items-center gap-2">
          <AlertCircle size={15} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-200">{hata}</p>
        </div>
      )}

      {/* ─── Üç mod ─────────────────────────────────────────────────────── */}
      <div className="space-y-2.5 mb-5">
        {MODLAR.map((m) => {
          const secili = mod === m.key;
          return (
            <button
              key={m.key}
              onClick={() => void modSec(m.key)}
              disabled={saving || !modYuklendi}
              aria-pressed={secili}
              className={`w-full text-left rounded-2xl p-4 border transition-all active:scale-[0.99] disabled:opacity-60 ${
                secili
                  ? 'bg-white/[0.06] border-white/20'
                  : 'bg-[#161B22] border-white/8 hover:bg-white/[0.03]'
              }`}
              style={secili ? { borderColor: `${m.renk}66`, boxShadow: `0 0 22px ${m.renk}1a` } : undefined}
            >
              <div className="flex items-start gap-3">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                  style={{ color: m.renk, backgroundColor: `${m.renk}1f`, borderColor: `${m.renk}40` }}
                >
                  {m.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-white">{m.baslik}</span>
                    {secili && (
                      <span
                        className="inline-flex items-center gap-1 text-[0.625rem] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                        style={{ color: m.renk, backgroundColor: `${m.renk}1f` }}
                      >
                        <Check size={10} strokeWidth={3} /> Seçili
                      </span>
                    )}
                  </div>
                  <p className="text-[0.6875rem] font-bold text-white/50 mt-0.5">{m.ozet}</p>
                  <p className="text-[0.6875rem] text-gray-400 leading-relaxed mt-1.5">{m.aciklama}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── Seçimin ne anlama geldiği (şeffaflık) ──────────────────────── */}
      {templates.length > 0 && (
        <div className="mb-5 bg-[#161B22] border border-white/8 rounded-2xl overflow-hidden">
          <button
            onClick={() => setListeAcik((v) => !v)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-colors"
          >
            <div className="text-left">
              <span className="text-sm font-bold text-white block">Bu modda ne gelir?</span>
              <span className="text-[0.6875rem] text-gray-400">
                {gelenler.length} tür gelir · {gelmeyenler.length} tür gelmez
              </span>
            </div>
            <ChevronDown
              size={17}
              className={`text-gray-400 transition-transform ${listeAcik ? 'rotate-180' : ''}`}
            />
          </button>
          <AnimatePresence initial={false}>
            {listeAcik && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden border-t border-white/5"
              >
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-[0.625rem] font-extrabold uppercase tracking-widest text-[#39FF14] mb-1.5">
                      Gelecek
                    </p>
                    <p className="text-[0.6875rem] text-gray-300 leading-relaxed">
                      {gelenler.map((t) => t.label_tr).join(' · ')}
                    </p>
                  </div>
                  {gelmeyenler.length > 0 && (
                    <div>
                      <p className="text-[0.625rem] font-extrabold uppercase tracking-widest text-gray-400 mb-1.5">
                        Gelmeyecek
                      </p>
                      <p className="text-[0.6875rem] text-gray-400 leading-relaxed">
                        {gelmeyenler.map((t) => t.label_tr).join(' · ')}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── Sessiz saatler ───────────────────────────────────────────────
          YALNIZ telefon bildirimi canlıyken çizilir. Bu kural SADECE
          `supabase/functions/send-push` içinde uygulanıyor; push kapalıyken o
          fonksiyon zaten erken dönüyor, yani "bu aralıkta telefonun çalmaz"
          bugün hiçbir şey yapmayan bir söz olurdu. */}
      {telefonPushu === true && (
      <div className="mb-5 bg-[#161B22] border border-white/8 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300">
              <Volume2 size={17} />
            </span>
            <div>
              <span className="text-sm font-bold text-white block">Sessiz Saatler</span>
              <span className="text-[0.6875rem] text-gray-400">Bu aralıkta telefonun çalmaz</span>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={quietEnabled}
            aria-label="Sessiz saatler"
            onClick={() => { const v = !quietEnabled; setQuietEnabled(v); void saveQuietHours(v, quietStart, quietEnd); }}
            disabled={saving}
            className={`relative w-11 h-6 rounded-full transition-all duration-200 shrink-0 ${quietEnabled ? 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.4)]' : 'bg-gray-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200 ${quietEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {quietEnabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden border-t border-white/5"
            >
              <div className="p-4 flex items-center gap-3">
                <label className="flex-1">
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 block mb-1">Başlangıç</span>
                  <input
                    type="time"
                    value={quietStart}
                    onChange={(e) => { setQuietStart(e.target.value); void saveQuietHours(true, e.target.value, quietEnd); }}
                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-[0.625rem] font-extrabold uppercase tracking-widest text-ink-4 block mb-1">Bitiş</span>
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={(e) => { setQuietEnd(e.target.value); void saveQuietHours(true, quietStart, e.target.value); }}
                    className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white"
                  />
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      <p className="text-[0.6875rem] text-gray-400 leading-relaxed px-1 pb-2">
        Para hareketleri, maç iptali ve sana gelen doğrudan davetler hangi modu
        seçersen seç her zaman gelir — bunlar kaçırılmaması gereken bildirimlerdir.
      </p>
    </SettingsSubPage>
  );
};

export default NotificationSettingsPage;
