import React from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { ProviderIdentitiesTab } from '../ProviderIdentitiesTab';

interface ProviderIdentitiesPageProps {
  onBadgeCount?: (n: number) => void;
}

export const ProviderIdentitiesPage: React.FC<ProviderIdentitiesPageProps> = ({ onBadgeCount }) => {
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <PageShell
      route="PROVIDER_IDENTITIES"
      icon={<ShieldCheck size={20} />}
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
      <ProviderIdentitiesTab refreshToken={refreshKey} onBadgeCount={onBadgeCount} />
    </PageShell>
  );
};
