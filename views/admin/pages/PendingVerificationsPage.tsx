import React from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { PendingVerificationsTab } from '../PendingVerificationsTab';

interface PendingVerificationsPageProps {
  onBadgeCount?: (n: number) => void;
}

export const PendingVerificationsPage: React.FC<PendingVerificationsPageProps> = ({ onBadgeCount }) => {
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <PageShell
      route="PENDING_VERIFICATIONS"
      icon={<Clock size={20} />}
      actions={
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10"
        >
          <RefreshCw size={14} /> Yenile
        </button>
      }
    >
      <p className="text-[11px] text-gray-500 mb-4">
        Kaleci ve hakem başvuruları gerçek zamanlı güncellenir. Onay/red işlemleri denetim kaydına düşer.
      </p>
      <PendingVerificationsTab refreshToken={refreshKey} onBadgeCount={onBadgeCount} />
    </PageShell>
  );
};
