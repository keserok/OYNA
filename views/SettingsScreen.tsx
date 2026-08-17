import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, User, Shield, HelpCircle, LogOut, ChevronRight,
  RefreshCw, MapPin, Bell, Lock, AlertCircle, Download, Trash2, Repeat, ShieldCheck,
  Building2, KeyRound, Crown, X, Check } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { AppView } from '../types';
import { logout, auth } from '../supabaseAuth';
import { useAppStore } from '../store';
import { supabase } from '../supabaseClient';
import { fbUpdateUserLocation } from '../supabaseMutations';
import { detectRegion } from '../services/locationService';
import LocationBadge from '../components/location/LocationBadge';
import { Toast } from '../components/common/Toast';
import PrivacySection from '../components/social/PrivacySection';
import DeleteAccountModal from '../components/common/DeleteAccountModal';
import SettingsSubPage from '../components/common/SettingsSubPage';
import NotificationSettingsPage from '../components/settings/NotificationSettingsPage';
import RegionPickerPage from '../components/settings/RegionPickerPage';
import ProfileInfoPage from '../components/settings/ProfileInfoPage';
import FieldRolePage from '../components/settings/FieldRolePage';
import SupportPage from '../components/settings/SupportPage';
import { APP_VERSION } from '../utils/appVersion';
import { getMyStaffPitches, staffAcceptInvite, type StaffPitch } from '../services/staffService';
import { dosyaKaydetVeyaPaylas } from '../utils/dosyaKaydet';

interface SettingsScreenProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

type SubPage = null | 'notifications' | 'privacy' | 'region' | 'profile' | 'role' | 'support';

const SettingsScreen: React.FC<SettingsScreenProps> = ({ onBack, onNavigate }) => {
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  // A4: derin bağlantı (oyna://support) Ayarlar'ı doğrudan Destek alt sayfasıyla
  // açar. İstek TÜKETİLİR — okuyunca store'daki değer sıfırlanır, yoksa kullanıcı
  // Ayarlar'a her girdiğinde Destek sayfası tekrar açılırdı.
  // ('region' de kabul edilir: ana sayfada bölge seçilmemişken çıkan
  //  "KONUMU AYARLA" düğmesi kullanıcıyı doğrudan Bölgelerim'e getirir.)
  const [subPage, setSubPage] = useState<SubPage>(() => {
    const istek = useAppStore.getState().settingsSubPage;
    return (istek === 'support' || istek === 'notifications' || istek === 'region') ? istek : null;
  });
  useEffect(() => {
    if (useAppStore.getState().settingsSubPage) {
      useAppStore.getState().setSettingsSubPage(null);
    }
  }, []);
  // STAFF-3: kullanıcının personel/müdür olduğu tesisler + davet kodu kullan
  const [staffPitches, setStaffPitches] = useState<StaffPitch[]>([]);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const showToast = (message: string) => {
    setToastMsg(message);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const {
    setUserLocation, setLocationPermissionStatus, activeRegion, setActiveRegion,
    selectedRegions, searchRadius, setSearchRadius, notificationPreferences, myRoles,
    setStaffPanelContext,
  } = useAppStore();

  // STAFF-3: personel/müdür olunan tesisleri yükle (panel girişi için)
  const loadStaffPitches = React.useCallback(async () => {
    try { setStaffPitches(await getMyStaffPitches()); } catch { /* sessiz — giriş noktası opsiyonel */ }
  }, []);
  useEffect(() => { loadStaffPitches(); }, [loadStaffPitches]);

  const openStaffPanel = (p: StaffPitch) => {
    setStaffPanelContext({ pitchId: p.pitch_id, pitchName: p.pitch_name, accessLevel: p.access_level });
    onNavigate('OWNER_PANEL');
  };
  const hasMultipleRoles = myRoles.length > 1;

  const enabledNotifCount = Object.values(notificationPreferences).filter(
    (p) => p && typeof p === 'object' && 'enabled' in p && (p as { enabled: boolean }).enabled,
  ).length;

  // Kullanıcının saha sahibi olup olmadığını tespit et (KVKK export bölümü için)
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

  // KVKK — Tesis verilerini JSON olarak indir (yalnızca saha sahipleri)
  const handleExportOwnerData = async () => {
    setIsExporting(true);
    setExportError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('Oturumun bulunamadı.');

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
      // Pakette `<a download>` sessizce çalışmaz (iOS/Android WebView) — KVKK
      // veri dışa aktarımı hiç inmiyordu. Ortak yardımcı önce native paylaşım
      // sayfasını açar. SONUCU YOK SAYMA: eskiden dönen değere bakılmıyordu,
      // dosya hiç kaydedilmese bile ekran sessizce "olmuş gibi" duruyordu.
      const sonuc = await dosyaKaydetVeyaPaylas(blob, `oyna-tesis-${Date.now()}.json`, 'OYNA Tesis Verisi');
      if (sonuc === 'PAYLASILDI') showToast('Verilerin paylaşıma hazır. Açılan pencereden kaydedebilirsin.');
      else if (sonuc === 'INDIRILDI') showToast('Tesis verilerin indirildi.');
      else if (sonuc === 'DESTEKLENMIYOR') setExportError('Bu cihazda dosya kaydedilemedi. Uygulamayı güncelle veya web sürümünden dene.');
      // 'IPTAL' → kullanıcı kendisi vazgeçti; ne başarı ne hata mesajı verilir.
    } catch (err) {
      console.error('handleExportOwnerData:', err);
      const raw = err instanceof Error ? err.message : String(err);
      setExportError(raw.includes('Failed to fetch') ? 'Bağlantı hatası. İnternetini kontrol et.' : 'Veriler indirilemedi. Tekrar dene.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleUpdateLocation = async () => {
    setIsUpdatingLocation(true);
    try {
      const loc = await detectRegion();
      if (loc.coordinates) setUserLocation(loc.coordinates);
      setLocationPermissionStatus('GRANTED');
      setActiveRegion(loc);
      if (auth.currentUser && loc.coordinates) {
        await fbUpdateUserLocation(auth.currentUser.uid, loc.coordinates.lat, loc.coordinates.lng).catch(() => {});
      }
    } catch (err) {
      console.error(err);
      showToast('Konum alınamadı. Elle bölge seçebilir veya cihaz ayarlarından izin verebilirsin.');
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      onNavigate('AUTH'); // çıkışta doğrudan giriş ekranına
    } catch (error) {
      console.error('Error logging out:', error);
      showToast('Çıkış yapılırken bir hata oluştu. Lütfen tekrar dene.');
    }
  };

  // Ana Ayarlar ekranı sadece butonlar gösterir; detaylar alt sayfalarda açılır.
  const SettingItem = ({ icon, title, value, onClick, color = 'text-ink-4' }: any) => (
    <button onClick={onClick} className="w-full flex items-center justify-between px-[18px] py-[15px] min-h-[48px] bg-surface-1 border border-white/[0.08] first:rounded-t-3xl last:rounded-b-3xl border-b-0 last:border-b hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-4">
        <div className="text-[#F5F3EE]/[0.55]">{icon}</div>
        <span className="text-sm font-bold text-white">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold ${color}`}>{value}</span>
        <ChevronRight size={16} className="text-ink-4" />
      </div>
    </button>
  );

  // Tam ekran bir ayar sayfası açan büyük buton (Bildirimler, Gizlilik)
  const PageButton = ({ icon, title, subtitle, onClick }: any) => (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-[18px] py-4 min-h-[48px] bg-surface-1 border border-white/[0.08] rounded-3xl hover:bg-white/[0.03] transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/[0.12] text-[#F5F3EE]">
          {icon}
        </div>
        <div className="text-left">
          <span className="text-sm font-bold text-white block">{title}</span>
          <span className="text-[0.8125rem] text-[#F5F3EE]/[0.55]">{subtitle}</span>
        </div>
      </div>
      <ChevronRight size={18} className="text-ink-4" />
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0A0E14] pb-16">
      {/* Header */}
      {/* ÜST ÇUBUK — profil akışıyla AYNI desen (kullanıcı kararı: Ayarlar
          ekranı profil ve ana sayfayla uyumlu olsun): 44px yuvarlak geri
          düğmesi + küçük, harf aralıklı ekran adı. Eskiden 40px düğme ve
          kalın 20px başlık vardı; iki ekran yan yana açıldığında başka bir
          uygulamadan gelmiş gibi duruyordu. */}
      <header className="px-5 pt-[calc(var(--safe-top)+1.25rem)] pb-3 flex items-center gap-3 sticky top-0 bg-[#0A0E14]/90 backdrop-blur-xl z-20">
        <button
          onClick={onBack}
          className="w-11 h-11 shrink-0 flex items-center justify-center bg-surface-1/[0.75] rounded-full border border-white/[0.08] text-white hover:bg-white/10 active:scale-95 transition-all"
          aria-label="Geri Dön"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-[0.6875rem] tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55] font-normal">Ayarlar</h1>
      </header>

      <main className="p-6 space-y-8">

        {/* ── İŞLETME ── personel/müdür olduğun tesislerin panel girişi.
            Kullanıcı kararı (2026-08): "Tesise Katıl" buradan ÇIKTI ve
            Ayarlar → Sahada Rolün sayfasının içine taşındı — davet koduyla
            ekibe katılmak da bir "sahadaki rolün" meselesi.
            Bu bölüm artık personel olunan tesis YOKSA hiç çizilmez: eskiden
            "Tesise Katıl" düğmesi onu tek başına ayakta tutuyordu, o gidince
            geriye yalnız boş bir başlık kalırdı. */}
        {staffPitches.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-[0.6875rem] tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55] mb-2.5 ml-0.5">İşletme</h3>
            {staffPitches.map((p) => (
              <button
                key={p.member_id}
                onClick={() => openStaffPanel(p)}
                className="w-full flex items-center justify-between px-[18px] py-4 min-h-[48px] bg-surface-1 border border-white/[0.08] rounded-3xl hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.06] border border-white/[0.12] text-[#F5F3EE]">
                    {p.access_level === 'MANAGER' ? <Crown size={18} /> : <Building2 size={18} />}
                  </div>
                  <div className="text-left">
                    <span className="text-sm font-bold text-white block">{p.pitch_name}</span>
                    <span className="text-[0.8125rem] text-[#F5F3EE]/[0.55]">Tesis paneli · {p.access_level === 'MANAGER' ? 'Müdür' : 'Personel'}</span>
                  </div>
                </div>
                <ChevronRight size={18} className="text-ink-4" />
              </button>
            ))}
          </section>
        )}

        {/* Hesap */}
        <section>
          <h3 className="text-[0.6875rem] tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55] mb-2.5 ml-0.5">Hesap</h3>
          <div className="flex flex-col">
            {/* Profili düzenlemenin TEK kapısı burası (kullanıcı kararı,
                2026-08). Profil ekranındaki "Düzenle" düğmesi kaldırıldı. */}
            <SettingItem icon={<User size={20} />} title="Bilgilerim" value="Düzenle" onClick={() => setSubPage('profile')} />
            <SettingItem icon={<ShieldCheck size={20} />} title="Veli Onayı" value="" onClick={() => onNavigate('GUARDIAN_CHILD')} />
            <SettingItem icon={<Shield size={20} />} title="Yasal & Sözleşmeler" value="" onClick={() => onNavigate('LEGAL')} />
          </div>
        </section>

        {/* Bildirimler & Gizlilik — tek buton, içeride açılır */}
        <section className="space-y-3">
          <PageButton
            icon={<Bell size={18} />}
            title="Bildirimler"
            subtitle={`${enabledNotifCount} bildirim açık · sessiz saatler, ön ayarlar`}
            onClick={() => setSubPage('notifications')}
          />
          <PageButton
            icon={<Lock size={18} />}
            title="Gizlilik"
            subtitle="Görünürlük ve engellenenler"
            onClick={() => setSubPage('privacy')}
          />

        </section>

        {/* Konum */}
        <section>
          <h3 className="text-[0.6875rem] tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55] mb-2.5 ml-0.5">Konum</h3>
          <div className="bg-surface-1 border border-white/[0.08] rounded-3xl p-[18px] space-y-3.5">
            <div>
              <span className="text-[0.6875rem] font-bold text-ink-4 uppercase tracking-wide block mb-2 ml-0.5">
                Bölgelerim{selectedRegions.length > 1 ? ` (${selectedRegions.length})` : ''}
              </span>
              {selectedRegions.length > 1 ? (
                <button
                  onClick={() => setSubPage('region')}
                  className="w-full flex flex-wrap items-center gap-2 p-3 rounded-[20px] bg-[#0F1318] border border-[#39FF14]/20 hover:bg-white/5 transition-colors text-left"
                >
                  {selectedRegions.map((r, i) => (
                    <span key={`${r.city}|${r.district ?? ''}|${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/25 text-[#39FF14] text-xs font-bold">
                      <MapPin size={11} /> {r.label}
                    </span>
                  ))}
                  <ChevronRight size={16} className="text-ink-4 ml-auto" />
                </button>
              ) : (
                <LocationBadge region={activeRegion} interactive onClick={() => setSubPage('region')} className="w-full" />
              )}
            </div>

            {/* Otomatik Bul — bölge butonuyla aynı hiyerarşide, tam genişlik */}
            <button
              onClick={handleUpdateLocation}
              disabled={isUpdatingLocation}
              /* Birincil eylem rengi tasarımdan: BEYAZ hap + koyu yazı
                 (profildeki "Maç bul" ve düzenleme ekranındaki "Kaydet" ile
                 aynı). Eskiden maviydi — uygulamanın hiçbir yerinde
                 kullanılmayan bir renkti ve ekranı yabancılaştırıyordu. */
              className="w-full flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-full bg-white text-[#0A0E14] hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-60"
            >
              {isUpdatingLocation ? <RefreshCw size={16} className="animate-spin" /> : <MapPin size={16} />}
              <span className="text-[0.8125rem] font-semibold">Konumumu Otomatik Bul</span>
            </button>

            <div className="pt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.8125rem] text-[#F5F3EE]">Arama Yarıçapı</span>
                <span className="text-sm font-extrabold text-[#39FF14]">{searchRadius} KM</span>
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
              <p className="text-[0.6875rem] text-[#F5F3EE]/[0.55] mt-1.5">Her seçili bölgenin merkezinden {searchRadius} KM çapındaki maçlar listelenir — 5 km adımlarla (5–50 KM).</p>
            </div>
          </div>
        </section>

        {/* Tesis Verileri (KVKK) — yalnızca saha sahipleri */}
        {isOwner && (
          <section className="bg-surface-1 border border-white/[0.08] rounded-3xl p-[18px] space-y-3">
            <div className="flex items-center gap-2 text-[#39FF14]">
              <Download size={16} />
              <h3 className="text-xs font-extrabold uppercase tracking-wider">Tesis Verilerim (KVKK)</h3>
            </div>
            <p className="text-[0.8125rem] text-[#F5F3EE]/[0.55] leading-relaxed">
              Tesisine ait son 1 yıllık rezervasyon, gider, veresiye ve abonelik kayıtlarını JSON olarak indir. Tüm verilerin sana aittir.
            </p>
            {exportError && (
              <div className="flex items-center gap-2 text-red-300 text-[0.6875rem] bg-red-900/20 border border-red-500/30 rounded-lg p-2">
                <AlertCircle size={14} className="shrink-0" /> {exportError}
              </div>
            )}
            <button
              disabled={isExporting}
              onClick={handleExportOwnerData}
              className="w-full flex items-center justify-center gap-2.5 min-h-[48px] px-4 bg-[#39FF14]/10 hover:bg-[#39FF14]/20 border border-[#39FF14]/30 rounded-full text-[#39FF14] font-bold text-xs transition-all uppercase tracking-widest disabled:opacity-50"
            >
              {isExporting ? (
                <><RefreshCw size={14} className="animate-spin" /> Hazırlanıyor…</>
              ) : (
                <><Download size={14} /> Tesis Verilerimi İndir</>
              )}
            </button>
          </section>
        )}

        {/* Hesap Silme (KVKK) */}
        <section>
          <h3 className="text-[0.6875rem] tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55] mb-2.5 ml-0.5">Hesap</h3>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full flex items-center justify-between px-[18px] py-4 min-h-[48px] bg-[#FF4D4D]/[0.08] border border-[#FF4D4D]/25 rounded-3xl hover:bg-[#FF4D4D]/15 transition-colors"
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
        </section>

        {/* Destek */}
        <section>
          <h3 className="text-[0.6875rem] tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55] mb-2.5 ml-0.5">Destek</h3>
          <div className="flex flex-col">
            {/* Uygulama içi destek: talep aç → admin Destek Merkezi'nden yanıt gelir.
                mailto yedeği SupportPage içinde durur. */}
            <SettingItem
              icon={<HelpCircle size={20} />}
              title="Yardım Merkezi"
              value=""
              onClick={() => setSubPage('support')}
            />
            {/* Sahada Rolün — kullanıcı kararı (2026-08): ekranın EN ÜSTÜNDEKİ
                büyük mavi karttan buraya, Yardım Merkezi'nin altına İKİNCİ
                SATIR olarak indi. Gerekçe: rol başvurusu günlük bir iş değil;
                üstte durduğunda her Ayarlar açılışında ilk göze çarpan şey
                oluyordu. Tesise katılma da bu sayfanın içine girdi. */}
            <SettingItem
              icon={<Repeat size={20} />}
              title="Sahada Rolün"
              value={hasMultipleRoles ? 'Rol değiştir' : 'Başvur'}
              onClick={() => setSubPage('role')}
            />
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 p-4 mt-4 bg-[#FF4D4D]/10 border border-[#FF4D4D]/25 rounded-3xl text-[#FF4D4D] font-bold text-sm hover:bg-[#FF4D4D]/20 transition-colors"
            >
              <LogOut size={18} /> Çıkış Yap
            </button>
          </div>
        </section>

        <div className="text-center">
          <p className="text-[0.6875rem] text-ink-4 font-mono">v{APP_VERSION} • Push Notifications Entegre</p>
        </div>

      </main>

      {/* Aksiyon hatası toast */}
      <AnimatePresence>
        {toastMsg && <Toast message={toastMsg} variant="error" />}
      </AnimatePresence>

      {/* Alt sayfalar — tam ekran, içeriye girilir */}
      <ProfileInfoPage open={subPage === 'profile'} onClose={() => setSubPage(null)} />
      {/* Tesise katılma davet kodu bu sayfanın içinden açılır; modal burada
          durmaya devam ediyor çünkü katılım başarılı olunca "İşletme"
          listesini (staffPitches) tazeleyen yer burası. */}
      <FieldRolePage
        open={subPage === 'role'}
        onClose={() => setSubPage(null)}
        onNavigate={onNavigate}
        onJoinPitch={() => setShowJoinModal(true)}
      />
      <NotificationSettingsPage open={subPage === 'notifications'} onClose={() => setSubPage(null)} />
      <RegionPickerPage open={subPage === 'region'} onClose={() => setSubPage(null)} />
      <SupportPage open={subPage === 'support'} onClose={() => setSubPage(null)} />
      <SettingsSubPage open={subPage === 'privacy'} onClose={() => setSubPage(null)} title="Gizlilik" subtitle="Görünürlük ve engellenenler">
        <PrivacySection embedded />
      </SettingsSubPage>

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

      {showJoinModal && (
        <JoinFacilityModal
          onClose={() => setShowJoinModal(false)}
          onJoined={async (name) => {
            setShowJoinModal(false);
            showToast(`${name} ekibine katıldın! "İşletme" bölümünden panele girebilirsin.`);
            await loadStaffPitches();
          }}
        />
      )}
    </div>
  );
};

// ── Tesise Katıl — 6 haneli davet kodu kullanma ─────────────────────────────
const JoinFacilityModal: React.FC<{ onClose: () => void; onJoined: (pitchName: string) => void }> = ({ onClose, onJoined }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.replace(/\D/g, '').slice(0, 6);

  const submit = async () => {
    if (clean.length !== 6) { setError('Kod 6 haneli olmalı.'); return; }
    setBusy(true); setError(null);
    try {
      const r = await staffAcceptInvite(clean);
      onJoined(r.pitch_name);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-end justify-center p-4" onClick={onClose} role="presentation">
      <div className="bg-[#161B22] w-full max-w-sm rounded-3xl p-6 pb-safe-6 border border-white/10" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Tesise Katıl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-extrabold text-white">Tesise Katıl</h3>
          <button type="button" onClick={onClose} aria-label="Kapat"><X size={20} className="text-ink-4" /></button>
        </div>
        <div className="mx-auto w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center mb-3"><KeyRound size={26} className="text-[#F5F3EE]" /></div>
        <p className="text-[0.8125rem] text-[#F5F3EE]/[0.55] text-center mb-4">Tesis sahibinin verdiği 6 haneli davet kodunu gir.</p>
        <input
          value={clean}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          inputMode="numeric"
          placeholder="______"
          autoFocus
          className="w-full text-center text-3xl font-extrabold tracking-[0.4em] font-mono bg-[#0A0E14] border border-white/10 rounded-2xl p-4 text-white placeholder:text-ink-4"
        />
        {error && <p className="text-xs text-[#FF4D4D] mt-2 text-center">{error}</p>}
        <button
          type="button"
          disabled={busy || clean.length !== 6}
          onClick={submit}
          className="w-full mt-4 min-h-[50px] rounded-full bg-white text-[#0A0E14] text-[0.8125rem] font-semibold disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
        >
          {busy ? 'Katılınıyor…' : <><Check size={16} /> Katıl</>}
        </button>
      </div>
    </div>
  );
};

export default SettingsScreen;
