import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminAuditLogs, toTurkishAdminError } from '../../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { DataTable } from '../components/DataTable';
import { PageShell } from '../components/PageShell';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { AdminFilterChips } from '../components/AdminFilterChips';
import { useAdminFilter } from '../hooks/useAdminFilter';
import { RefreshCw, ScrollText } from 'lucide-react';
import type { AdminLog } from '../../../types';

import type { AdminNavigateFn } from '../GodViewPanel';

interface AuditLogPageProps {
  onRefresh?: () => Promise<void>;
  onNavigate?: AdminNavigateFn;
}

export const AuditLogPage: React.FC<AuditLogPageProps> = ({ onRefresh, onNavigate }) => {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const { error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await fetchAdminAuditLogs(250));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const searchFn = useCallback((row: AdminLog, q: string) => {
    const hay = [row.action, row.targetName, row.details, row.adminName, row.adminId].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }, []);

  const { query, setQuery, filtered: searched } = useAdminFilter(logs, searchFn);

  const actionChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of logs) {
      counts.set(log.action, (counts.get(log.action) || 0) + 1);
    }
    const chips = [{ id: 'all', label: 'Tümü', count: logs.length }];
    for (const [action, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      chips.push({ id: action, label: action.replace(/_/g, ' '), count });
    }
    return chips;
  }, [logs]);

  const filtered = useMemo(() => {
    if (actionFilter === 'all') return searched;
    return searched.filter((r) => r.action === actionFilter);
  }, [searched, actionFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const columns = [
    {
      header: 'Zaman',
      render: (row: AdminLog) => (
        <span className="text-[11px] font-mono text-gray-400">
          {new Date(row.timestamp).toLocaleString('tr-TR')}
        </span>
      ),
    },
    {
      header: 'Aksiyon',
      render: (row: AdminLog) => (
        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">{row.action}</span>
      ),
    },
    {
      header: 'Hedef',
      render: (row: AdminLog) => {
        const openTarget = () => {
          if (!onNavigate || !row.targetId) return;
          const a = row.action.toUpperCase();
          if (a.includes('MATCH') || row.targetId.length > 20) {
            onNavigate('MATCHES', { matchId: row.targetId });
          } else if (a.includes('PITCH')) {
            onNavigate('SAHALAR');
          } else if (a.includes('USER') || a.includes('BAN') || a.includes('GHOST')) {
            onNavigate('KULLANICILAR');
          }
        };
        return (
        <div>
          <button type="button" onClick={openTarget} disabled={!row.targetId} className="text-sm font-semibold text-white hover:text-cyan-300 text-left disabled:cursor-default disabled:hover:text-white">
            {row.targetName}
          </button>
          {row.targetId && <div className="text-[10px] font-mono text-gray-600">{row.targetId.slice(0, 8)}…</div>}
        </div>
        );
      },
    },
    {
      header: 'Detay',
      render: (row: AdminLog) => (
        <span className="text-[11px] text-gray-400 line-clamp-2 max-w-xs">{row.details}</span>
      ),
    },
    {
      header: 'Admin',
      render: (row: AdminLog) => (
        <div>
          {row.adminName && <div className="text-xs text-white font-medium">{row.adminName}</div>}
          <div className="text-[10px] font-mono text-gray-500">{row.adminId.slice(0, 8)}…</div>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      route="AUDIT_LOG"
      icon={<ScrollText size={20} />}
      actions={
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing || loading}
          className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Yenile
        </button>
      }
    >
      <div className="space-y-4 mb-4">
        <AdminSearchBar
          value={query}
          onChange={setQuery}
          placeholder="Aksiyon, hedef veya admin ara..."
          resultCount={filtered.length}
          totalCount={logs.length}
        />
        {actionChips.length > 1 && (
          <AdminFilterChips chips={actionChips} active={actionFilter} onChange={setActionFilter} />
        )}
      </div>
      <DataTable
        columns={columns}
        data={filtered}
        loading={loading || refreshing}
        emptyMessage={query || actionFilter !== 'all' ? 'Filtreye uygun kayıt yok' : 'Henüz denetim kaydı yok'}
      />
    </PageShell>
  );
};
