import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, RefreshCw, Building2, Banknote } from 'lucide-react';
import { PageShell } from '../components/PageShell';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { AdminFilterChips } from '../components/AdminFilterChips';
import { useAdminFilter } from '../hooks/useAdminFilter';
import OwnerModerationTab from '../OwnerModerationTab';
import { fetchWithdrawalRequests, processWithdrawal, toTurkishAdminError, type WithdrawalRequestRow } from '../../../services/adminService';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { useAdminToast } from '../context/AdminToastContext';
import { Check, X } from 'lucide-react';

type ModerationTab = 'pitches' | 'withdrawals' | 'history';

export const ModerationPage: React.FC = () => {
  const [tab, setTab] = useState<ModerationTab>('pitches');
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequestRow[]>([]);
  const [history, setHistory] = useState<WithdrawalRequestRow[]>([]);
  const [loadingWd, setLoadingWd] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const { success, error: toastError } = useAdminToast();

  const loadWithdrawals = useCallback(async () => {
    setLoadingWd(true);
    try {
      const [pending, done] = await Promise.all([
        fetchWithdrawalRequests('PENDING', 100),
        fetchWithdrawalRequests('ALL', 50),
      ]);
      setWithdrawals(pending);
      setHistory(done.filter((r) => r.status !== 'PENDING'));
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoadingWd(false);
    }
  }, [toastError]);

  useEffect(() => {
    if (tab === 'withdrawals' || tab === 'history') void loadWithdrawals();
  }, [tab, loadWithdrawals]);

  const searchFn = useCallback((r: WithdrawalRequestRow, q: string) => {
    const hay = [r.owner_name, r.pitch_name, r.iban, r.id].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }, []);

  const source = tab === 'history' ? history : withdrawals;
  const { query, setQuery, filtered } = useAdminFilter(source, searchFn);

  const handleWithdrawal = async (id: string, approved: boolean, notes?: string) => {
    setActioningId(id);
    try {
      await processWithdrawal(id, approved, notes);
      success(approved ? 'Çekim onaylandı' : 'Çekim reddedildi');
      await loadWithdrawals();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setActioningId(null);
    }
  };

  const tabChips = useMemo(() => [
    { id: 'pitches', label: 'Tesis Onayları' },
    { id: 'withdrawals', label: 'Çekim Talepleri', count: withdrawals.length || undefined },
    { id: 'history', label: 'Çekim Geçmişi' },
  ], [withdrawals.length]);

  const wdColumns = [
    {
      header: 'SAHİP / TESİS',
      render: (r: WithdrawalRequestRow) => (
        <div>
          <p className="text-sm font-bold text-white">{r.owner_name}</p>
          <p className="text-[10px] text-gray-500">{r.pitch_name}</p>
        </div>
      ),
    },
    {
      header: 'TUTAR',
      render: (r: WithdrawalRequestRow) => (
        <span className="text-[#39FF14] font-mono font-bold">₺{Number(r.amount).toLocaleString('tr')}</span>
      ),
    },
    {
      header: 'IBAN',
      render: (r: WithdrawalRequestRow) => (
        <span className="font-mono text-[10px] text-gray-400">{r.iban?.slice(0, 12)}…</span>
      ),
    },
    {
      header: 'DURUM',
      render: (r: WithdrawalRequestRow) => (
        <StatusBadge tone={r.status === 'PENDING' ? 'warning' : r.status === 'APPROVED' ? 'success' : 'danger'}>
          {r.status}
        </StatusBadge>
      ),
    },
    {
      header: 'AKSİYON',
      render: (r: WithdrawalRequestRow) => r.status === 'PENDING' ? (
        <div className="flex gap-1.5">
          <button type="button" disabled={actioningId === r.id} onClick={() => void handleWithdrawal(r.id, true)} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/10">
            <Check size={11} /> Onayla
          </button>
          <button type="button" disabled={actioningId === r.id} onClick={() => void handleWithdrawal(r.id, false, 'Admin reddi')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10">
            <X size={11} /> Reddet
          </button>
        </div>
      ) : <span className="text-[10px] text-gray-500">{new Date(r.created_at).toLocaleDateString('tr-TR')}</span>,
    },
  ];

  return (
    <PageShell
      route="MODERATION"
      icon={<Shield size={20} />}
      actions={
        <button
          type="button"
          onClick={() => void loadWithdrawals()}
          disabled={loadingWd}
          className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loadingWd ? 'animate-spin' : ''} /> Yenile
        </button>
      }
    >
      <AdminFilterChips chips={tabChips} active={tab} onChange={(id) => setTab(id as ModerationTab)} />

      {tab === 'pitches' && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3 text-[11px] text-gray-500">
            <Building2 size={14} /> Owner panelinden gelen tesis onay kuyruğu
          </div>
          <OwnerModerationTab pitchesOnly />
        </div>
      )}

      {(tab === 'withdrawals' || tab === 'history') && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <Banknote size={14} /> {tab === 'withdrawals' ? 'Bekleyen çekim talepleri' : 'İşlenmiş çekim kayıtları'}
          </div>
          <AdminSearchBar value={query} onChange={setQuery} placeholder="Sahip, tesis veya IBAN ara..." resultCount={filtered.length} />
          <DataTable columns={wdColumns} data={filtered} loading={loadingWd} emptyMessage="Kayıt yok" />
        </div>
      )}
    </PageShell>
  );
};
