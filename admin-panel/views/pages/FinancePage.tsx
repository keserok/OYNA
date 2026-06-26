import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import {
  fetchFinanceStats, fetchWalletLedger, fetchBookingPayments, fetchOwnerBillingEvents,
  fetchProfileNameMap, toTurkishAdminError, fetchPayouts, processPayout,
  type FinanceStats, type WalletLedgerRow, type BookingPaymentRow, type OwnerBillingEventRow,
  type PayoutRequestRow,
} from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { useAdminToast } from '../context/AdminToastContext';
import { downloadCsv } from '../../utils/exportCsv';
import { CreditCard, Download, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import type { AdminNavigateFn } from '../GodViewPanel';

const PAGE_SIZE = 100;

export const FinancePage: React.FC<{ onNavigate?: AdminNavigateFn }> = ({ onNavigate }) => {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [payments, setPayments] = useState<BookingPaymentRow[]>([]);
  const [billing, setBilling] = useState<OwnerBillingEventRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequestRow[]>([]);
  const [payoutBusy, setPayoutBusy] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [billingUnavailable, setBillingUnavailable] = useState(false);
  const [tab, setTab] = useState<'ledger' | 'payments' | 'billing' | 'payouts'>('ledger');
  const [query, setQuery] = useState('');
  const { success, error: toastError } = useAdminToast();

  const filterRows = <T,>(rows: T[]): T[] => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  };

  const filteredLedger = useMemo(() => filterRows(ledger), [ledger, query]);
  const filteredPayments = useMemo(() => filterRows(payments), [payments, query]);
  const filteredBilling = useMemo(() => filterRows(billing), [billing, query]);
  const filteredPayouts = useMemo(() => filterRows(payouts), [payouts, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setBillingUnavailable(false);
    try {
      const [s, l, p, b, po] = await Promise.allSettled([
        fetchFinanceStats(30),
        fetchWalletLedger(PAGE_SIZE),
        fetchBookingPayments(PAGE_SIZE),
        fetchOwnerBillingEvents(PAGE_SIZE),
        fetchPayouts('PENDING', PAGE_SIZE),
      ]);
      if (s.status === 'fulfilled') setStats(s.value);
      const ids = new Set<string>();
      if (l.status === 'fulfilled') {
        setLedger(l.value);
        l.value.forEach((r) => ids.add(r.user_id));
      }
      if (po.status === 'fulfilled') {
        setPayouts(po.value);
        po.value.forEach((r) => ids.add(r.user_id));
      }
      if (ids.size) setNameMap(await fetchProfileNameMap([...ids]));
      if (p.status === 'fulfilled') setPayments(p.value);
      if (b.status === 'fulfilled') setBilling(b.value);
      else setBillingUnavailable(true);
      const failed = [s, l, p].filter((r) => r.status === 'rejected');
      if (failed.length === 3) throw failed[0].reason;
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const handlePayout = async (id: string, status: 'COMPLETED' | 'FAILED') => {
    if (status === 'FAILED' && !window.confirm('Bu payout talebi reddedilsin mi? Rezerve tutar sahibe iade edilir.')) return;
    const ref = status === 'COMPLETED' ? (window.prompt('Banka / iyzico referansı (opsiyonel):') ?? undefined) : undefined;
    setPayoutBusy(id);
    try {
      await processPayout(id, status, ref);
      success(status === 'COMPLETED' ? 'Payout tamamlandı olarak işaretlendi.' : 'Payout reddedildi.');
      await load();
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setPayoutBusy(null);
    }
  };

  const statCards = stats ? [
    { label: 'Rezervasyon Geliri (30g)', value: `₺${Number(stats.booking_revenue).toLocaleString('tr')}`, color: 'text-[#39FF14]' },
    { label: 'Cüzdan Giriş', value: `₺${Number(stats.wallet_credits).toLocaleString('tr')}`, color: 'text-blue-400' },
    { label: 'Cüzdan Çıkış', value: `₺${Number(stats.wallet_debits).toLocaleString('tr')}`, color: 'text-red-400' },
    { label: 'Bekleyen Çekim', value: `₺${Number(stats.withdrawal_pending).toLocaleString('tr')}`, color: 'text-yellow-400' },
  ] : null;

  const exportLedger = () => {
    downloadCsv('oyna-ledger.csv', ['Tarih', 'Kullanıcı', 'Tip', 'Tutar', 'Açıklama'], ledger.map((r) => [
      new Date(r.created_at).toLocaleString('tr-TR'),
      nameMap[r.user_id] || r.user_id,
      r.type,
      String(r.amount),
      r.description || '',
    ]));
  };

  const exportPayments = () => {
    downloadCsv('oyna-payments.csv', ['Tarih', 'Tesis', 'Yöntem', 'Tutar', 'Not'], payments.map((r) => [
      new Date(r.created_at).toLocaleString('tr-TR'),
      r.pitch_name || '',
      r.payment_method,
      String(r.amount),
      r.note || '',
    ]));
  };

  const exportBilling = () => {
    downloadCsv('oyna-billing.csv', ['Tarih', 'Owner', 'Tip', 'Tutar', 'Ref'], billing.map((r) => [
      new Date(r.created_at).toLocaleString('tr-TR'),
      r.owner_name || '',
      r.event_type,
      r.amount != null ? String(r.amount) : '',
      r.external_id || '',
    ]));
  };

  const tabs = useMemo(() => ([
    { id: 'ledger' as const, label: 'Cüzdan Ledger' },
    { id: 'payments' as const, label: 'Rezervasyon Ödemeleri' },
    { id: 'payouts' as const, label: `Payout Talepleri${payouts.length ? ` (${payouts.length})` : ''}` },
    { id: 'billing' as const, label: 'Owner Billing' },
  ]), [payouts.length]);

  const activeData = tab === 'ledger' ? filteredLedger : tab === 'payments' ? filteredPayments : tab === 'billing' ? filteredBilling : filteredPayouts;
  const totalData = tab === 'ledger' ? ledger.length : tab === 'payments' ? payments.length : tab === 'billing' ? billing.length : payouts.length;

  return (
    <PageShell
      route="FINANCE"
      icon={<CreditCard size={20} />}
      actions={
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={tab === 'ledger' ? exportLedger : tab === 'payments' ? exportPayments : exportBilling}
            disabled={loading || (tab === 'billing' && billing.length === 0)}
            className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-40"
          >
            <Download size={14} /> CSV
          </button>
          <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
          </button>
        </div>
      }
      stats={statCards?.map((k) => (
        <div key={k.label} className="bg-[#161B22]/60 border border-white/[0.06] rounded-xl p-4">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{k.label}</p>
          <p className={`text-lg font-black mt-1 ${k.color}`}>{k.value}</p>
        </div>
      ))}
    >
      {stats && Number(stats.withdrawal_pending) > 0 && (
        <button
          type="button"
          onClick={() => { setTab('payouts'); setQuery(''); }}
          className="mb-4 w-full flex items-center justify-between px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/25 text-left hover:bg-yellow-500/15 transition-colors"
        >
          <div>
            <p className="text-xs font-bold text-yellow-300">Bekleyen çekim: ₺{Number(stats.withdrawal_pending).toLocaleString('tr')}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Payout Talepleri sekmesinde işleyin</p>
          </div>
          <ArrowRight size={16} className="text-yellow-400 shrink-0" />
        </button>
      )}
      {billingUnavailable && tab === 'billing' && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200">
          <AlertTriangle size={14} />
          Owner billing RPC henüz deploy edilmedi — <code className="font-mono text-[10px]">npm run admin:deploy</code>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex gap-2 p-1 bg-black/30 border border-white/[0.06] rounded-xl w-fit flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setQuery(''); }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${tab === t.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AdminSearchBar
          value={query}
          onChange={setQuery}
          placeholder="Tabloda ara..."
          resultCount={activeData.length}
          totalCount={totalData}
          className="sm:max-w-xs"
        />
      </div>

      {tab === 'ledger' && (
        <DataTable
          columns={[
            { header: 'Tarih', render: (r: WalletLedgerRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
            { header: 'Kullanıcı', render: (r: WalletLedgerRow) => <span className="text-sm text-white">{nameMap[r.user_id] || r.user_id.slice(0, 8)}</span> },
            { header: 'Tip', key: 'type' },
            { header: 'Tutar', render: (r: WalletLedgerRow) => <span className={`font-bold ${r.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>₺{r.amount}</span> },
            { header: 'Açıklama', render: (r: WalletLedgerRow) => <span className="text-[11px] text-gray-500">{r.description || '—'}</span> },
          ]}
          data={filteredLedger}
          loading={loading}
          emptyMessage="Ledger kaydı yok"
        />
      )}

      {tab === 'payments' && (
        <DataTable
          columns={[
            { header: 'Tarih', render: (r: BookingPaymentRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
            { header: 'Tesis', render: (r: BookingPaymentRow) => <span className="text-sm font-semibold text-white">{r.pitch_name || '—'}</span> },
            { header: 'Yöntem', key: 'payment_method' },
            { header: 'Not', render: (r: BookingPaymentRow) => <span className="text-[11px] text-gray-500">{r.note || '—'}</span> },
            { header: 'Tutar', render: (r: BookingPaymentRow) => <span className="text-green-400 font-bold">₺{r.amount}</span> },
          ]}
          data={filteredPayments}
          loading={loading}
          emptyMessage="Ödeme kaydı yok"
        />
      )}

      {tab === 'billing' && (
        <DataTable
          columns={[
            { header: 'Tarih', render: (r: OwnerBillingEventRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
            { header: 'Owner', render: (r: OwnerBillingEventRow) => <span className="text-sm text-white">{r.owner_name}</span> },
            { header: 'Tip', key: 'event_type' },
            { header: 'Tutar', render: (r: OwnerBillingEventRow) => <span className="text-yellow-400 font-bold">{r.amount != null ? `₺${r.amount}` : '—'}</span> },
            { header: 'Ref', render: (r: OwnerBillingEventRow) => <span className="text-[10px] font-mono text-gray-500">{r.external_id || '—'}</span> },
          ]}
          data={filteredBilling}
          loading={loading}
          emptyMessage="Billing event yok"
        />
      )}

      {tab === 'payouts' && (
        <DataTable
          columns={[
            { header: 'Tarih', render: (r: PayoutRequestRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
            { header: 'Talep Eden', render: (r: PayoutRequestRow) => <span className="text-sm text-white">{nameMap[r.user_id] || r.user_id.slice(0, 8)}</span> },
            { header: 'Tip', render: (r: PayoutRequestRow) => <span className="text-[11px] font-bold text-blue-300">{r.payout_type === 'OWNER_BIWEEKLY' ? 'Saha Sahibi' : r.payout_type === 'PROVIDER_INSTANT' ? 'Kaleci/Hakem' : r.payout_type}</span> },
            { header: 'IBAN', render: (r: PayoutRequestRow) => <span className="text-[10px] font-mono text-gray-400">{r.iban_holder_name} · {r.iban}</span> },
            { header: 'Tutar', render: (r: PayoutRequestRow) => <span className="text-green-400 font-bold">₺{Number(r.amount).toLocaleString('tr')}</span> },
            { header: 'Durum', render: (r: PayoutRequestRow) => <span className="text-[11px] font-bold text-gray-300">{r.status}</span> },
            { header: 'İşlem', render: (r: PayoutRequestRow) => (
              r.status === 'PENDING' || r.status === 'PROCESSING' ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={payoutBusy === r.id}
                    onClick={() => handlePayout(r.id, 'COMPLETED')}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 disabled:opacity-40"
                  >
                    Tamamla
                  </button>
                  <button
                    type="button"
                    disabled={payoutBusy === r.id}
                    onClick={() => handlePayout(r.id, 'FAILED')}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                  >
                    Reddet
                  </button>
                </div>
              ) : <span className="text-[10px] text-gray-600">{r.iyzico_payout_ref || '—'}</span>
            ) },
          ]}
          data={filteredPayouts}
          loading={loading}
          emptyMessage="Bekleyen payout talebi yok"
        />
      )}
    </PageShell>
  );
};
