import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Clock, UserCheck, Building2 } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { PendingVerificationsTab } from '../PendingVerificationsTab';
import { ProviderIdentitiesTab } from '../ProviderIdentitiesTab';
import OwnerModerationTab from '../OwnerModerationTab';

type VerificationSegment = 'pending' | 'identity' | 'facility';

interface SegmentDef {
  key: VerificationSegment;
  label: string;
  icon: React.ReactNode;
  /** Bu segment onBadgeCount ile bekleyen sayısı veriyor mu? */
  hasBadge: boolean;
}

const SEGMENTS: SegmentDef[] = [
  { key: 'pending', label: 'Kaleci/Hakem Başvuruları', icon: <Clock size={14} />, hasBadge: true },
  { key: 'identity', label: 'Kimlik Doğrulama', icon: <UserCheck size={14} />, hasBadge: true },
  { key: 'facility', label: 'Tesis Onayları', icon: <Building2 size={14} />, hasBadge: false },
];

interface VerificationCenterPageProps {
  /** Toplam (kaleci/hakem başvuru + kimlik) bekleyen sayısını üst kabuğa bildirir. */
  onBadgeCount?: (n: number) => void;
}

/**
 * Doğrulama Merkezi — kaleci/hakem başvuruları, kimlik doğrulama ve tesis onayları
 * kuyruklarını tek ekranda segment kontrolüyle birleştirir. Her segment kendi
 * sekmesini içe aktarır; sekmeler kendi toast ve aksiyonlarını yönetir.
 */
export const VerificationCenterPage: React.FC<VerificationCenterPageProps> = ({ onBadgeCount }) => {
  const [active, setActive] = useState<VerificationSegment>('pending');
  const [refreshToken, setRefreshToken] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [identityCount, setIdentityCount] = useState(0);

  // Toplam (başvuru + kimlik) bekleyen sayısını üst kabuğa bildir.
  useEffect(() => {
    onBadgeCount?.(pendingCount + identityCount);
  }, [pendingCount, identityCount, onBadgeCount]);

  const counts: Record<VerificationSegment, number | null> = {
    pending: pendingCount,
    identity: identityCount,
    facility: null,
  };

  const totalBadge = pendingCount + identityCount;

  const refresh = useCallback(() => {
    setRefreshToken((k) => k + 1);
  }, []);

  return (
    <PageShell
      route="VERIFICATION"
      title="Doğrulama Merkezi"
      icon={<ShieldCheck size={20} />}
      actions={
        <div className="flex items-center gap-3">
          {totalBadge > 0 && (
            <span className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-amber-500/15 border border-amber-500/20 text-[11px] font-black text-amber-400">
              {totalBadge} bekleyen
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10"
          >
            <RefreshCw size={14} /> Yenile
          </button>
        </div>
      }
    >
      <p className="text-[11px] text-gray-500 mb-4">
        Kaleci/hakem başvuruları, kimlik doğrulama ve Owner panelinden gelen tesis onay kuyruğu tek ekranda.
        Onay/red işlemleri denetim kaydına (audit) düşer.
      </p>

      {/* Segment kontrolü */}
      <div className="flex flex-wrap gap-2 mb-6">
        {SEGMENTS.map((seg) => {
          const isActive = active === seg.key;
          const badge = counts[seg.key];
          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => setActive(seg.key)}
              className={`flex items-center gap-2 h-10 px-4 rounded-xl text-xs font-bold border transition-colors ${
                isActive
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-white'
                  : 'bg-black/30 border-white/[0.06] text-gray-400 hover:text-white hover:border-white/15'
              }`}
            >
              {seg.icon}
              <span>{seg.label}</span>
              {seg.hasBadge && badge != null && badge > 0 && (
                <span
                  className={`min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-black ${
                    isActive ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-500/20 text-amber-400'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Aktif segment içeriği — sekmeler her zaman monte, sadece gizlenir ki
          rozet sayıları (onBadgeCount) güncel kalsın ve geçişte yeniden yüklenmesin. */}
      <div className={active === 'pending' ? '' : 'hidden'}>
        <PendingVerificationsTab refreshToken={refreshToken} onBadgeCount={setPendingCount} />
      </div>
      <div className={active === 'identity' ? '' : 'hidden'}>
        <ProviderIdentitiesTab refreshToken={refreshToken} onBadgeCount={setIdentityCount} />
      </div>
      <div className={active === 'facility' ? '' : 'hidden'}>
        <div className="flex items-center gap-2 mb-3 text-[11px] text-gray-500">
          <Building2 size={14} /> Owner panelinden gelen tesis onay kuyruğu · Para çekme talepleri için Finans → Payout Talepleri
        </div>
        <OwnerModerationTab />
      </div>
    </PageShell>
  );
};

export default VerificationCenterPage;
