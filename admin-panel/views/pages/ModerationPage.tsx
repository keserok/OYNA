import React from 'react';
import { Shield, Building2 } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import OwnerModerationTab from '../OwnerModerationTab';

// Moderasyon = tesis onay kuyruğu. Para çekme / payout talepleri tek kaynak
// (payout_requests) olarak Finans → Payout Talepleri sekmesinde yönetilir.
export const ModerationPage: React.FC = () => {
  return (
    <PageShell route="MODERATION" icon={<Shield size={20} />}>
      <div className="mt-2">
        <div className="flex items-center gap-2 mb-3 text-[11px] text-gray-500">
          <Building2 size={14} /> Owner panelinden gelen tesis onay kuyruğu · Para çekme talepleri için Finans → Payout Talepleri
        </div>
        <OwnerModerationTab />
      </div>
    </PageShell>
  );
};
