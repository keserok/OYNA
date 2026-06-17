import React from 'react';
import { useAppStore } from '../../../store';
import { DataTable } from '../components/DataTable';
import { PageShell } from '../components/PageShell';
import { RefreshCw, ScrollText } from 'lucide-react';

interface AuditLogPageProps {
  onRefresh?: () => Promise<void>;
}

export const AuditLogPage: React.FC<AuditLogPageProps> = ({ onRefresh }) => {
  const { adminLogs } = useAppStore();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const columns = [
    {
      header: 'Zaman',
      render: (row: typeof adminLogs[0]) => (
        <span className="text-[11px] font-mono text-gray-400">
          {new Date(row.timestamp).toLocaleString('tr-TR')}
        </span>
      ),
    },
    {
      header: 'Aksiyon',
      render: (row: typeof adminLogs[0]) => (
        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">{row.action}</span>
      ),
    },
    {
      header: 'Hedef',
      render: (row: typeof adminLogs[0]) => (
        <div>
          <div className="text-sm font-semibold text-white">{row.targetName}</div>
          {row.targetId && <div className="text-[10px] font-mono text-gray-600">{row.targetId.slice(0, 8)}...</div>}
        </div>
      ),
    },
    {
      header: 'Detay',
      render: (row: typeof adminLogs[0]) => (
        <span className="text-[11px] text-gray-400 line-clamp-2">{row.details}</span>
      ),
    },
    {
      header: 'Admin',
      render: (row: typeof adminLogs[0]) => (
        <span className="text-[10px] font-mono text-gray-500">{row.adminId.slice(0, 8)}</span>
      ),
    },
  ];

  return (
    <PageShell
      route="AUDIT_LOG"
      icon={<ScrollText size={20} />}
      actions={onRefresh ? (
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Yenile
        </button>
      ) : undefined}
    >
      <DataTable columns={columns} data={adminLogs} emptyMessage="Henüz denetim kaydı yok" />
    </PageShell>
  );
};
