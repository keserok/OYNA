import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Swords, Edit3, Trash2, Eye, Plus } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { PageShell } from '../components/PageShell';
import { ModuleCrudBar } from '../components/ModuleCrudBar';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { AdminFilterChips } from '../components/AdminFilterChips';
import { MatchFormModal } from '../components/MatchFormModal';
import { MatchDetailDrawer } from '../components/MatchDetailDrawer';
import { ActionConfirmModal, type ActionConfirmOptions } from '../components/ActionConfirmModal';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import {
  fetchMatchesAdmin,
  adminGetMatchAdmin,
  createMatchAdmin,
  updateMatchAdmin,
  deleteMatchAdmin,
  buildMatchPayloadFromListing,
  toTurkishAdminError,
} from '../../services/adminService';
import { MATCH_STATUS_FILTERS, type MatchStatusFilter } from '../../../shared/matchMapper';
import type { MatchListing } from '../../../types';
import type { AdminNavigateFn } from '../GodViewPanel';
import { useAdminNavigation } from '../context/AdminNavigationContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

interface MatchesPageProps {
  onRefresh?: () => Promise<void>;
  onNavigate?: AdminNavigateFn;
}

export const MatchesPage: React.FC<MatchesPageProps> = ({ onRefresh, onNavigate }) => {
  const { consumeParam, params } = useAdminNavigation();
  const { success, error: toastError } = useAdminToast();
  const [matches, setMatches] = useState<MatchListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 350);
  const [statusFilter, setStatusFilter] = useState<MatchStatusFilter>('ALL');
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editMatch, setEditMatch] = useState<MatchListing | null>(null);
  const [detailMatch, setDetailMatch] = useState<MatchListing | null>(null);
  const [confirmModal, setConfirmModal] = useState<ActionConfirmOptions | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMatchesAdmin({
        search: debouncedQuery.trim() || undefined,
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setMatches(res.matches);
      setTotal(res.total);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, statusFilter, page, toastError]);

  useEffect(() => {
    setPage(0);
  }, [debouncedQuery, statusFilter]);

  useEffect(() => { void load(); }, [load, debouncedQuery, statusFilter, page]);

  useEffect(() => {
    const openId = params.matchId;
    if (!openId) return;
    consumeParam('matchId');
    void (async () => {
      const inList = matches.find((m) => m.id === openId);
      if (inList) {
        setDetailMatch(inList);
        return;
      }
      try {
        const m = await adminGetMatchAdmin(openId);
        if (m) setDetailMatch(m);
      } catch {
        /* ignore */
      }
    })();
  }, [params.matchId, consumeParam, matches]);

  const statusChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      const s = m.status || 'ACTIVE';
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    return MATCH_STATUS_FILTERS.map((f) => ({
      id: f.id,
      label: f.label,
      count: f.id === 'ALL' ? total : counts.get(f.id === 'ACTIVE' ? 'ACTIVE' : f.id) ?? undefined,
    }));
  }, [matches, total]);

  const refresh = async () => {
    if (onRefresh) await onRefresh();
    await load();
  };

  const handleSave = async (data: Partial<MatchListing> & { rawDate: string }) => {
    const payload = buildMatchPayloadFromListing(data);
    try {
      if (formMode === 'create') {
        const id = await createMatchAdmin(payload);
        success(`Maç oluşturuldu (${id.slice(0, 8)}…)`);
      } else if (editMatch) {
        await updateMatchAdmin(editMatch.id, payload);
        success('Maç güncellendi');
      }
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
      throw err;
    }
  };

  const handleDelete = (m: MatchListing) => {
    setConfirmModal({
      title: 'Maçı Sil',
      description: `"${m.title}" kalıcı olarak silinecek.`,
      impactText: 'Bağlı rezervasyonlar etkilenebilir. İşlem geri alınamaz.',
      actionType: 'BAN_USER',
      targetId: m.id,
      targetName: m.title,
      onCancel: () => setConfirmModal(null),
      onConfirm: async () => {
        try {
          await deleteMatchAdmin(m.id);
          success('Maç silindi');
          await load();
        } catch (err) {
          toastError(toTurkishAdminError(err));
        }
        setConfirmModal(null);
      },
    });
  };

  const statusTone = (s?: string) => {
    if (s === 'CANCELLED') return 'danger' as const;
    if (s === 'LIVE') return 'warning' as const;
    if (s === 'COMPLETED') return 'info' as const;
    if (s === 'DRAFT') return 'demo' as const;
    return 'success' as const;
  };

  const columns = [
    {
      header: 'MAÇ',
      render: (m: MatchListing) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          {m.image ? (
            <img src={m.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg border border-white/10 shrink-0 bg-white/5 flex items-center justify-center text-gray-600"><Swords size={14} /></div>
          )}
          <div className="min-w-0">
            <p className="font-bold text-white text-sm truncate flex items-center gap-1.5">
              {m.title}
              {m.isDemo && <span className="shrink-0 text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wide">Demo</span>}
            </p>
            <p className="text-[10px] text-gray-500 font-mono">{m.id.slice(0, 8)}…</p>
          </div>
        </div>
      ),
    },
    {
      header: 'KONUM & ZAMAN',
      render: (m: MatchListing) => (
        <div className="text-[11px]">
          <p className="text-white font-medium">{m.location}</p>
          <p className="text-gray-500 font-mono">{m.date} {m.time}</p>
        </div>
      ),
    },
    {
      header: 'FİYAT',
      render: (m: MatchListing) => <span className="text-[#39FF14] font-bold font-mono text-sm">₺{m.price}</span>,
    },
    {
      header: 'DURUM',
      render: (m: MatchListing) => (
        <div className="flex flex-col gap-1">
          <StatusBadge tone={statusTone(m.status)}>{m.status || 'ACTIVE'}</StatusBadge>
          {m.refundStatus && (
            <StatusBadge tone="warning">İade: {m.refundStatus}</StatusBadge>
          )}
          {m.missingPositions?.some((p) => p.count > 0) && (
            <StatusBadge tone="warning">Eksik kadro</StatusBadge>
          )}
        </div>
      ),
    },
    {
      header: 'ZORLUK',
      render: (m: MatchListing) => <span className="text-[10px] font-bold text-gray-400 uppercase">{m.difficulty}</span>,
    },
    {
      header: 'AKSİYONLAR',
      render: (m: MatchListing) => (
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" title="Lobi kontrol" onClick={() => setDetailMatch(m)} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/10">
            <Eye size={11} /> Lobi
          </button>
          <button type="button" title="Düzenle" onClick={() => { setEditMatch(m); setFormMode('edit'); setFormOpen(true); }} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10">
            <Edit3 size={11} /> Düzenle
          </button>
          <button type="button" title="Sil" onClick={() => handleDelete(m)} className="p-1.5 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10">
            <Trash2 size={11} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      route="MATCHES"
      icon={<Swords size={20} />}
      actions={
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => { setFormMode('create'); setEditMatch(null); setFormOpen(true); }}
            className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-white rounded-xl bg-red-600/80 hover:bg-red-600 border border-red-500/40"
          >
            <Plus size={14} /> Yeni Maç
          </button>
          <ModuleCrudBar moduleKey="matches" onRefresh={refresh} showDemo />
        </div>
      }
    >
      <div className="space-y-4 mb-4">
        <AdminSearchBar
          value={query}
          onChange={setQuery}
          placeholder="Başlık, konum veya maç ID ara..."
          resultCount={matches.length}
          totalCount={total}
        />
        <AdminFilterChips chips={statusChips} active={statusFilter} onChange={(id) => setStatusFilter(id as MatchStatusFilter)} />
      </div>

      <DataTable columns={columns} data={matches} loading={loading} emptyMessage={query ? 'Arama sonucu yok' : 'Henüz maç kaydı yok'} />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg border border-white/10 disabled:opacity-40">Önceki</button>
            <button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg border border-white/10 disabled:opacity-40">Sonraki</button>
          </div>
        </div>
      )}

      <MatchFormModal
        open={formOpen}
        mode={formMode}
        match={editMatch}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />

      {detailMatch && (
        <MatchDetailDrawer
          match={detailMatch}
          onClose={() => setDetailMatch(null)}
          onUpdated={() => void load()}
          onViewDisputes={onNavigate ? (matchId) => {
            setDetailMatch(null);
            onNavigate('DISPUTES', { disputeMatchId: matchId });
          } : undefined}
        />
      )}

      <ActionConfirmModal isOpen={!!confirmModal} options={confirmModal} />
    </PageShell>
  );
};
