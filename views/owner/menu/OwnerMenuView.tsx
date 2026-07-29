import React from 'react';
import {
  Banknote,
  Bell,
  Building2,
  ChevronRight,
  Globe,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  Tag,
  Trophy,
} from 'lucide-react';
import { APP_VERSION } from '../../../utils/appVersion';
import type { OwnerMenuStats } from './ownerMenuTypes';

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
  onOperations: () => void;
  onMatches: () => void;
  onBankAccounts: () => void;
  onWithdrawals: () => void;
  onCancellationPolicy: () => void;
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
}

function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'danger' | 'warning' | 'neutral' | 'info';
}) {
  const tones = {
    success: 'text-emerald-400',
    danger: 'text-red-400',
    warning: 'text-amber-400',
    neutral: 'text-gray-500',
    info: 'text-blue-400',
  };
  return <span className={`text-[10px] font-bold ${tones[tone]}`}>{label}</span>;
}

function MenuRow({
  icon,
  iconClass,
  label,
  badge,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  label: string;
  badge?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-b-0 disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <span className={iconClass ?? 'text-gray-400'}>{icon}</span>
        <span className="text-sm font-bold text-white text-left">{label}</span>
      </div>
      {badge ?? <ChevronRight size={16} className="text-gray-600" />}
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
  onOperations,
  onMatches,
  onBankAccounts,
  onWithdrawals,
  onCancellationPolicy,
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
}) => {
  const isOwnerLvl = accessLevel === 'OWNER';
  const isManagerLvl = accessLevel === 'OWNER' || accessLevel === 'MANAGER';
  const verificationLabel =
    stats.verificationStatus === 'approved'
      ? 'Onaylı'
      : stats.verificationStatus === 'rejected'
        ? 'Reddedildi'
        : 'İnceleniyor';
  const verificationTone =
    stats.verificationStatus === 'approved'
      ? 'success'
      : stats.verificationStatus === 'rejected'
        ? 'danger'
        : 'warning';

  return (
    <div className="p-6 pb-40 pt-safe-6 overflow-y-auto custom-scrollbar animate-in slide-in-from-right-10 duration-500">
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
        <div>
          <h2 className="text-xl font-black text-white">{facilityName}</h2>
          <p className="text-xs text-gray-400 font-medium">
            {facilityDistrict || 'Konum belirtilmedi'}
          </p>
          <p className="text-[10px] text-emerald-400 font-bold uppercase mt-0.5">{accountStatus}</p>
        </div>
      </div>

      {isReadOnly && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-bold text-center">
          Hesabınız salt okunur modda — yalnızca görüntüleme yapabilirsiniz.
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
        {isManagerLvl && (
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">İşletme Yönetimi</h3>
          <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
            <MenuRow
              icon={<Building2 size={18} />}
              label="Tesis Ayarları"
              badge={<StatusBadge label={verificationLabel} tone={verificationTone} />}
              onClick={onEditProfile}
            />
            {/* Fiyat/süre politikası artık BURADA: Sahalarım → saha → "Aktif
                Saatler ve Ücretler". Tarifesi olmayan saha yayına alınamadığı
                için rozet bunu menüde de dürüstçe söyler. */}
            <MenuRow
              icon={<LayoutDashboard size={18} />}
              label="Sahalarım"
              badge={
                stats.courtsWithoutTariff > 0 ? (
                  <StatusBadge label={`${stats.courtsWithoutTariff} saha tarifesiz`} tone="danger" />
                ) : (
                  <StatusBadge label={`${stats.courtCount} saha`} tone="info" />
                )
              }
              onClick={onPitches}
            />
            <MenuRow
              icon={<Settings size={18} />}
              label="Rezervasyon İşlemleri"
              badge={
                <StatusBadge
                  label={
                    stats.autoApproveEnabled
                      ? `Oto ${stats.autoApproveMinutes}dk`
                      : 'Manuel onay'
                  }
                  tone={stats.autoApproveEnabled ? 'info' : 'warning'}
                />
              }
              onClick={onOperations}
            />
            <MenuRow
              icon={<Trophy size={18} />}
              iconClass="text-blue-400"
              label="Maçlar"
              onClick={onMatches}
            />
            {/* "Ekip Yönetimi" alt bara (Ekip) taşındı — menüde mükerrer tutulmuyor. */}
          </div>
        </section>
        )}

        {isManagerLvl && (
        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">Finansal</h3>
          <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
            {/* Banka + Para Çekme SAHİP-only (para-güvenliği); müdür/personel görmez. */}
            {isOwnerLvl && (
              <MenuRow
                icon={<Building2 size={18} />}
                iconClass="text-emerald-400"
                label="Banka Hesapları"
                badge={<StatusBadge label={`${stats.bankAccountCount} hesap`} tone="neutral" />}
                onClick={onBankAccounts}
              />
            )}
            {isOwnerLvl && (
              <MenuRow
                icon={<Banknote size={18} />}
                label="Para Çekme"
                badge={
                  <StatusBadge
                    label={
                      stats.availableBalance != null
                        ? `₺${stats.availableBalance.toLocaleString('tr-TR')}`
                        : 'Bakiye'
                    }
                    tone="success"
                  />
                }
                onClick={onWithdrawals}
              />
            )}
            {/* GENEL FİYATLANDIRMA KALDIRILDI: tesis geneli tek politika yerine
                her saha kendi fiyat/süre politikasını girer (E1a/E5a/E12a).
                Giriş noktası: Sahalarım → saha → "Aktif Saatler ve Ücretler".
                Çalışma saatleri ayrı ekran değildir; o tarifelerden türetilir. */}
            <MenuRow
              icon={<RotateCcw size={18} />}
              label="İptal / İade Politikası"
              onClick={onCancellationPolicy}
            />
          </div>
        </section>
        )}

        <section>
          <h3 className="text-xs font-bold text-gray-500 uppercase mb-3 ml-1">Uygulama</h3>
          <div className="bg-[#161B22] border border-white/5 rounded-[24px] overflow-hidden">
            <MenuRow icon={<LayoutDashboard size={18} />} label="Özet Widgetları" onClick={onWidgetSettings} />
            <MenuRow icon={<Bell size={18} />} label="Bildirimler" onClick={onNotifications} />
            <MenuRow icon={<Shield size={18} />} label="Güvenlik & Şifre" onClick={onSecurity} />
            <MenuRow
              icon={<Globe size={18} />}
              label="Dil"
              badge={<StatusBadge label="Türkçe" tone="neutral" />}
              disabled
            />
          </div>
        </section>

        <section className="space-y-3">
          <button
            type="button"
            onClick={onSupport}
            className="w-full flex items-center justify-center gap-2 p-4 bg-white/5 border border-white/10 rounded-2xl text-gray-300 font-bold text-sm hover:bg-white/10 transition-colors"
          >
            <HelpCircle size={18} /> Destek Merkezi
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 font-bold text-sm hover:bg-red-500/20 transition-colors"
          >
            <LogOut size={18} /> Güvenli Çıkış
          </button>
        </section>

        <div className="text-center pt-4">
          <p className="text-[10px] text-gray-600 font-mono">OYNA Business v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
};
