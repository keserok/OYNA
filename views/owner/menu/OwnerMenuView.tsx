import React from 'react';
import {
  Banknote,
  Bell,
  Building2,
  ChevronRight,
  CreditCard,
  Users,
  Globe,
  Handshake,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  RotateCcw,
  Shield,
  Tag,
  Trophy,
} from 'lucide-react';
import { APP_VERSION } from '../../../utils/appVersion';
import { useOwnerToast } from '../components/useOwnerToast';
import { getPitchBookings } from '../../../services/pitchOwnerService';
import type { OwnerMenuStats } from './ownerMenuTypes';
import { money } from '../finance/financeUi';

export interface OwnerMenuViewProps {
  onNavigate: (view: string) => void;
  onBack: () => void;
  facilityName?: string;
  facilityDistrict?: string;
  facilityImage?: string;
  accountStatus?: string;
  stats: OwnerMenuStats;
  onEditProfile: () => void;
  onWorkingHours: () => void;
  onMatches: () => void;
  onCustomers: () => void;
  onBankAccounts: () => void;
  onWithdrawals: () => void;
  onCancellationPolicy: () => void;
  /** OYNA ile yapılan ticari anlaşmayı gösterir — YALNIZ tesis sahibi. */
  onAgreement: () => void;
  /** Ödeme modu (sahada / online / oyuncu seçsin) ayar modalını açar. */
  onPaymentMode: () => void;
  onLogout: () => void;
  onSecurity: () => void;
  onSupport: () => void;
  /** Bildirim tercihleri modalını açar (cihazlar arası senkron — localStorage değil). */
  onNotifications: () => void;
  onWidgetSettings: () => void;
  onPitches: () => void;
  isReadOnly?: boolean;
  /** Uygulama-içi rol geçişi sayfasını (RoleSwitcher) açar. */
  onSwitchRole?: () => void;
  /** Kullanıcı birden çok role sahip mi? (yalnız o zaman rol geçişi anlamlı) */
  canSwitchRole?: boolean;
  /** STAFF-3: panel erişim seviyesi — menü öğelerini yetkiye göre gizler. */
  accessLevel?: 'OWNER' | 'MANAGER' | 'STAFF';
  /** Üst karttaki "bugünün özeti" (karar 2) için tesis kimliği. */
  pitchId?: string;
}

function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'danger' | 'warning' | 'neutral' | 'info';
}) {
  // Menü cilası (karar 6, 9 Ağu 2026): rozetler hap biçiminde — renkli yumuşak
  // zemin; gidiş okunu YUTMAZ, yanında durur.
  const tones = {
    success: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25',
    danger: 'text-red-300 bg-red-500/15 border-red-500/25',
    warning: 'text-amber-300 bg-amber-500/15 border-amber-500/25',
    neutral: 'text-gray-400 bg-white/5 border-white/10',
    info: 'text-blue-300 bg-blue-500/15 border-blue-500/25',
  };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${tones[tone]}`}>{label}</span>;
}

// Menü cilası (kararlar 1·5·6·8, 9 Ağu 2026): tek renk ikon 36px yumuşak kutuda
// (oyuncu Ayarlar ekranıyla aynı dil), gerekli satırlarda soluk açıklama, hap
// rozet + ok YAN YANA, kilitli satır soluk + "Yalnız …" rozetli, dokunuşta
// hafif titreşim (tarayıcı/iOS desteklemezse sessizce atlanır).
function MenuRow({
  icon,
  label,
  desc,
  badge,
  onClick,
  disabled,
  locked,
  lockedLabel = 'Yalnız yönetim',
  onLockedTap,
}: {
  icon: React.ReactNode;
  /** Eski renkli ikon sınıfları bilerek yok sayılır — kimlik monokrom (karar 1). */
  iconClass?: string;
  label: string;
  desc?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
  lockedLabel?: string;
  onLockedTap?: () => void;
}) {
  const tap = () => {
    try { navigator.vibrate?.(8); } catch { /* titreşim desteklenmiyor */ }
    if (locked) { onLockedTap?.(); return; }
    onClick?.();
  };
  return (
    <button
      type="button"
      onClick={tap}
      disabled={disabled}
      className={`w-full min-h-[48px] flex items-center justify-between gap-3 p-4 hover:bg-white/5 active:scale-[0.99] transition-all border-b border-white/5 last:border-b-0 disabled:opacity-50 ${locked ? 'opacity-55' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-[#F5F3EE]/80">
          {icon}
        </span>
        <span className="text-left min-w-0">
          <span className="text-sm font-bold text-white block truncate">{label}</span>
          {desc && <span className="text-[11px] text-gray-500 block truncate">{desc}</span>}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {locked ? <StatusBadge label={lockedLabel} tone="neutral" /> : badge}
        <ChevronRight size={16} className="text-gray-600" />
      </div>
    </button>
  );
}

export const OwnerMenuView: React.FC<OwnerMenuViewProps> = ({
  onNavigate,
  onBack,
  facilityName = 'Tesisim',
  facilityDistrict = '',
  facilityImage,
  accountStatus = 'Aktif',
  stats,
  onEditProfile,
  onWorkingHours,
  onMatches,
  onCustomers,
  onBankAccounts,
  onWithdrawals,
  onCancellationPolicy,
  onAgreement,
  onPaymentMode,
  onLogout,
  onSecurity,
  onSupport,
  onNotifications,
  onWidgetSettings,
  onPitches,
  isReadOnly = false,
  onSwitchRole,
  canSwitchRole = false,
  accessLevel = 'OWNER',
  pitchId = '',
}) => {
  const isOwnerLvl = accessLevel === 'OWNER';
  const isManagerLvl = accessLevel === 'OWNER' || accessLevel === 'MANAGER';
  const notify = useOwnerToast();
  // Karar 2: bugünün özeti — menü açılınca bugünkü rezervasyon sayısı yüklenir.
  const [todayBookings, setTodayBookings] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!pitchId || pitchId.startsWith('mock-')) return;
    const d = new Date();
    const p = (x: number) => String(x).padStart(2, '0');
    const bugun = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    getPitchBookings(pitchId, bugun)
      .then((r) => setTodayBookings(r.length))
      .catch(() => setTodayBookings(null));
  }, [pitchId]);
  // Karar 4: kilitli satır gizlenmez; dokununca tek cümlelik sade açıklama.
  const kilitliSahip = () => notify('Bu bölümü yalnız tesis sahibi açabilir.', 'warning');
  const kilitliYonetim = () => notify('Bu bölümü yalnız sahip ve müdür açabilir.', 'warning');

  return (
    <div className="p-6 pb-40 pt-safe-6 animate-in slide-in-from-right-10 duration-500">
      <div className="flex items-center gap-4 mb-8">
        <div className="relative">
          {facilityImage ? (
            <img
              src={facilityImage}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-white/10"
              alt=""
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white/5 border-2 border-white/10 flex items-center justify-center">
              <Building2 size={28} className="text-gray-500" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-white truncate">{facilityName}</h2>
          <p className="text-xs text-gray-400 font-medium truncate">
            {facilityDistrict || 'Konum belirtilmedi'}
          </p>
          {/* Karar 2: işletmenin nabzı — yayın hapı + bugünün özeti tek bakışta */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <StatusBadge
              label={stats.isFacilityOpen ? 'Yayında' : 'Kapalı'}
              tone={stats.isFacilityOpen ? 'success' : 'warning'}
            />
            {todayBookings != null && (
              <StatusBadge
                label={todayBookings === 0 ? 'Bugün rezervasyon yok' : `Bugün ${todayBookings} rezervasyon`}
                tone="neutral"
              />
            )}
          </div>
        </div>
      </div>

      {/* Karar 2: kurulum eksiği uyarısı — dokununca ilgili ekrana götürür */}
      {stats.courtsWithoutTariff > 0 && (
        <button
          type="button"
          onClick={() => { if (isManagerLvl) onPitches(); else kilitliYonetim(); }}
          className="w-full mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 font-bold text-left flex items-center justify-between active:scale-[0.99] transition-all"
        >
          <span>{stats.courtsWithoutTariff} saha tarifesiz — fiyat girilmeden yayına çıkamaz. Tamamla →</span>
        </button>
      )}

      {isReadOnly && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-bold text-center">
          Hesabın salt okunur modda — yalnızca görüntüleme yapabilirsin.
        </div>
      )}

      {/* Uygulama-içi rol geçişi — aktif rolü gerçekten değiştirir (RoleSwitcher).
          Eski davranış yalnız onBack çağırıyordu; oyuncu moduna GEÇMİYORDU. */}
      {onSwitchRole && canSwitchRole && (
        <div
          role="button"
          tabIndex={0}
          onClick={onSwitchRole}
          onKeyDown={(e) => e.key === 'Enter' && onSwitchRole()}
          className="bg-gradient-to-r from-blue-900/30 to-[#161B22] p-5 rounded-[24px] border border-blue-500/20 mb-8 flex items-center justify-between group cursor-pointer hover:border-blue-500/50 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500/15 rounded-xl flex items-center justify-center text-blue-400">
              <RefreshCw size={24} />
            </div>
            <div>
              <h3 className="font-bold text-white">Oyuncu Moduna Geç</h3>
              <p className="text-[10px] text-blue-300/70 font-medium">Oyuncu arayüzüne / maçlara geç</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-blue-400" />
        </div>
      )}

      <div className="space-y-6">
        {/* Karar 3 (9 Ağu 2026): bölümler iş SIKLIĞINA göre — günlük iş üstte.
            Karar 4: yönetim satırları personelden GİZLENMEZ; soluk + rozetli
            görünür, dokununca sade açıklama (guard'lar aynen yerinde). */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">Operasyon</h3>
          <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
            <MenuRow
              icon={<Users size={18} />}
              label="Müşteri Defteri"
              desc="Müdavimler, müşteri kartı, tekrar rezervasyon"
              onClick={onCustomers}
            />
            <MenuRow
              icon={<Trophy size={18} />}
              label="Maçlar"
              desc="Sahanda kurulan OYNA maçları"
              locked={!isManagerLvl}
              onLockedTap={kilitliYonetim}
              onClick={onMatches}
            />
            <MenuRow
              icon={<LayoutDashboard size={18} />}
              label="Sahalarım"
              desc="Kortlar, aktif saatler ve ücretler"
              badge={
                stats.courtsWithoutTariff > 0 ? (
                  <StatusBadge label={`${stats.courtsWithoutTariff} saha tarifesiz`} tone="danger" />
                ) : (
                  <StatusBadge label={`${stats.courtCount} saha`} tone="info" />
                )
              }
              locked={!isManagerLvl}
              onLockedTap={kilitliYonetim}
              onClick={onPitches}
            />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">Kurulum</h3>
          <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
            {/* Yayın durumu üst kartın hapında — burada yinelenmez. Fiyat/süre
                politikası Sahalarım → saha → "Aktif Saatler ve Ücretler"dedir;
                "Ekip Yönetimi" alt barda (Ekip), menüde mükerrer tutulmuyor. */}
            <MenuRow
              icon={<Building2 size={18} />}
              label="Tesis Ayarları"
              desc="Ad, fotoğraf, konum, yayın durumu"
              locked={!isManagerLvl}
              onLockedTap={kilitliYonetim}
              onClick={onEditProfile}
            />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">Finans</h3>
          <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
            {/* Banka + Para Çekme + Anlaşma SAHİP-only (para-güvenliği). Karar 4:
                satır görünür ama kilitli — rozet bakiye gibi hassas veriyi ÖRTER. */}
            <MenuRow
              icon={<Building2 size={18} />}
              label="Banka Hesapları"
              badge={<StatusBadge label={`${stats.bankAccountCount} hesap`} tone="neutral" />}
              locked={!isOwnerLvl}
              lockedLabel="Yalnız sahip"
              onLockedTap={kilitliSahip}
              onClick={onBankAccounts}
            />
            <MenuRow
              icon={<Banknote size={18} />}
              label="Para Çekme"
              badge={
                <StatusBadge
                  label={
                    stats.availableBalance != null
                      ? money(stats.availableBalance)
                      : 'Bakiye'
                  }
                  tone="success"
                />
              }
              locked={!isOwnerLvl}
              lockedLabel="Yalnız sahip"
              onLockedTap={kilitliSahip}
              onClick={onWithdrawals}
            />
            {/* GENEL FİYATLANDIRMA KALDIRILDI: tesis geneli tek politika yerine
                her saha kendi fiyat/süre politikasını girer (E1a/E5a/E12a).
                Giriş noktası: Sahalarım → saha → "Aktif Saatler ve Ücretler".
                Çalışma saatleri ayrı ekran değildir; o tarifelerden türetilir. */}
            {/* Anlaşma ticari bilgidir (karar 6a) — kilitli görünür, açılmaz. */}
            <MenuRow
              icon={<Handshake size={18} />}
              label="OYNA Anlaşmam"
              desc="Komisyon ve ticari şartlar"
              badge={<StatusBadge label="Salt okunur" tone="neutral" />}
              locked={!isOwnerLvl}
              lockedLabel="Yalnız sahip"
              onLockedTap={kilitliSahip}
              onClick={onAgreement}
            />
            <MenuRow
              icon={<RotateCcw size={18} />}
              label="İptal / İade Politikası"
              locked={!isManagerLvl}
              onLockedTap={kilitliYonetim}
              onClick={onCancellationPolicy}
            />
            <MenuRow
              icon={<CreditCard size={18} />}
              label="Ödeme Modu"
              desc="Paranın nasıl toplandığı"
              locked={!isOwnerLvl}
              lockedLabel="Yalnız sahip"
              onLockedTap={kilitliSahip}
              onClick={onPaymentMode}
            />
          </div>
        </section>

        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">Uygulama</h3>
          <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
            <MenuRow icon={<LayoutDashboard size={18} />} label="Özet Widgetları" desc="Ana ekrandaki kartları seç" onClick={onWidgetSettings} />
            <MenuRow icon={<Bell size={18} />} label="Bildirimler" onClick={onNotifications} />
            <MenuRow icon={<Shield size={18} />} label="Güvenlik & Şifre" onClick={onSecurity} />
            {/* Ölü "Dil" satırı kaldırıldı (karar 7) — çalışmayan düğme gösterilmez.
                Destek artık burada sıradan bir satır; dev buton değil. */}
            <MenuRow icon={<HelpCircle size={18} />} label="Destek Merkezi" onClick={onSupport} />
          </div>
        </section>

        {/* Karar 7: yıkıcı işlem gövdeden ayrı "Hesap" bloğunda durur. */}
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">Hesap</h3>
          <div className="bg-transparent border border-red-500/20 rounded-[24px] overflow-hidden">
            <MenuRow
              icon={<LogOut size={18} className="text-red-400" />}
              label="Çıkış Yap"
              onClick={onLogout}
            />
          </div>
        </section>

        <div className="text-center pt-4">
          <p className="text-[10px] text-gray-600 font-mono">OYNA Business v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
};
