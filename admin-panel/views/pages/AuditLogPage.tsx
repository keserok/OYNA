import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminAuditLogs, toTurkishAdminError } from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';
import { DataTable } from '../components/DataTable';
import { PageShell } from '../components/PageShell';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { AdminFilterChips } from '../components/AdminFilterChips';
import { useAdminFilter } from '../hooks/useAdminFilter';
import { RefreshCw, ScrollText, X, Search } from 'lucide-react';
import type { AdminLog } from '../../../types';

import type { AdminNavigateFn } from '../GodViewPanel';

/** Eski→yeni değer diff'i (Karar #70b): yalnız değişen alanlar yan yana. */
const AuditDiff: React.FC<{ log: AdminLog; onClose: () => void }> = ({ log, onClose }) => {
  const oldV = (log.oldValue ?? {}) as Record<string, unknown>;
  const newV = (log.newValue ?? {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(oldV), ...Object.keys(newV)])).sort();
  const fmt = (v: unknown) => v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const changed = keys.filter((k) => fmt(oldV[k]) !== fmt(newV[k]));

  return (
    <div className="fixed inset-0 z-[190] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-500 font-mono uppercase">Denetim Diff</p>
            <h3 className="text-sm font-black text-white truncate">{log.action} · {log.targetName}</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">{new Date(log.timestamp).toLocaleString('tr-TR')} · {log.adminName || log.adminId.slice(0, 8)}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-gray-400 hover:text-white flex items-center justify-center shrink-0"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {changed.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6">Bu kayıtta alan bazlı eski/yeni değer yok (yalnız aksiyon kaydı).</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-[9px] font-black text-gray-600 uppercase tracking-wider px-1">
                <span>Alan</span><span className="text-red-400/70">Eski</span><span className="text-green-400/70">Yeni</span>
              </div>
              {changed.map((k) => (
                <div key={k} className="grid grid-cols-[1fr_1fr_1fr] gap-2 items-start bg-black/30 border border-white/[0.06] rounded-lg px-3 py-2">
                  <span className="text-[11px] font-mono font-bold text-gray-300 break-all">{k}</span>
                  <span className="text-[11px] font-mono text-red-300/90 break-all line-through decoration-red-500/40">{fmt(oldV[k])}</span>
                  <span className="text-[11px] font-mono text-green-300 break-all">{fmt(newV[k])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface AuditLogPageProps {
  onRefresh?: () => Promise<void>;
  onNavigate?: AdminNavigateFn;
}

export const AuditLogPage: React.FC<AuditLogPageProps> = ({ onRefresh, onNavigate }) => {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [diffLog, setDiffLog] = useState<AdminLog | null>(null);
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
    {
      header: 'Diff',
      render: (row: AdminLog) => {
        const hasDiff = !!(row.oldValue || row.newValue);
        return (
          <button
            type="button"
            disabled={!hasDiff}
            onClick={() => setDiffLog(row)}
            title={hasDiff ? 'Eski → yeni değer' : 'Diff verisi yok'}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 text-[10px] font-bold text-gray-400 hover:text-white disabled:opacity-30"
          >
            <Search size={11} /> Diff
          </button>
        );
      },
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
      {diffLog && <AuditDiff log={diffLog} onClose={() => setDiffLog(null)} />}
    </PageShell>
  );
};
