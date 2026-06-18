import React from 'react';
import { Building2 } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import OwnerAccountsTab from '../OwnerAccountsTab';

export const OwnerAccountsPage: React.FC = () => (
  <PageShell route="OWNER_ACCOUNTS" icon={<Building2 size={20} />}>
    <OwnerAccountsTab />
  </PageShell>
);
