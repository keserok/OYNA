import React from 'react';
import { Swords } from 'lucide-react';
import { MatchesTab } from '../MatchNotifTabs';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { PageShell } from '../components/PageShell';
import { useAppStore } from '../../../store';

interface MatchesPageProps {
  onRefresh?: () => Promise<void>;
}

export const MatchesPage: React.FC<MatchesPageProps> = ({ onRefresh }) => {
  const { loadServices } = useAppStore();

  const refresh = async () => {
    await loadServices();
    if (onRefresh) await onRefresh();
  };

  return (
    <PageShell
      route="MATCHES"
      icon={<Swords size={20} />}
      actions={<ModuleCrudBar moduleKey="matches" onRefresh={refresh} />}
    >
      <MatchesTab />
    </PageShell>
  );
};
