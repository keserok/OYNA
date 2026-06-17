import React, { useCallback, useEffect, useState } from 'react';
import { DataTable } from '../components/DataTable';
import {
  fetchFinanceStats, fetchWalletLedger, fetchBookingPayments,
  toTurkishAdminError, type FinanceStats, type WalletLedgerRow, type BookingPaymentRow,
} from '../../../services/adminService';
import { PageShell } from '../components/PageShell';
import { useAdminToast } from '../context/AdminToastContext';
import { CreditCard, RefreshCw } from 'lucide-react';

export const FinancePage: React.FC = () => {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerRow[]>([]);
  const [payments, setPayments] = useState<BookingPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ledger' | 'payments'>('ledger');
  const { error: toastError } = useAdminToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l, p] = await Promise.all([
        fetchFinanceStats(30),
        fetchWalletLedger(80),
        fetchBookingPayments(80),
      ]);
      setStats(s);
      setLedger(l);
      setPayments(p);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void load(); }, [load]);

  const statCards = stats ? [
    { label: 'Rezervasyon Geliri (30g)', value: `₺${Number(stats.booking_revenue).toLocaleString('tr')}`, color: 'text-[#39FF14]' },
    { label: 'Cüzdan Giriş', value: `₺${Number(stats.wallet_credits).toLocaleString('tr')}`, color: 'text-blue-400' },
    { label: 'Cüzdan Çıkış', value: `₺${Number(stats.wallet_debits).toLocaleString('tr')}`, color: 'text-red-400' },
    { label: 'Bekleyen Çekim', value: `₺${Number(stats.withdrawal_pending).toLocaleString('tr')}`, color: 'text-yellow-400' },
  ] : null;

  return (
    <PageShell
      route="FINANCE"
      icon={<CreditCard size={20} />}
      actions={
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>
      }
      stats={statCards?.map((k) => (
        <div key={k.label} className="bg-[#161B22]/60 border border-white/[0.06] rounded-xl p-4">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{k.label}</p>
          <p className={`text-lg font-black mt-1 ${k.color}`}>{k.value}</p>
        </div>
      ))}
    >
      <div className="flex gap-2 p-1 bg-black/30 border border-white/[0.06] rounded-xl w-fit">
        {(['ledger', 'payments'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${tab === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {t === 'ledger' ? 'Cüzdan Ledger' : 'Rezervasyon Ödemeleri'}
          </button>
        ))}
      </div>

      {tab === 'ledger' ? (
        <DataTable
          columns={[
            { header: 'Tarih', render: (r: WalletLedgerRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
            { header: 'Kullanıcı', render: (r: WalletLedgerRow) => <span className="text-[11px] font-mono text-gray-500">{r.user_id.slice(0, 8)}…</span> },
            { header: 'Tip', key: 'type' },
            { header: 'Tutar', render: (r: WalletLedgerRow) => <span className={`font-bold ${r.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>₺{r.amount}</span> },
            { header: 'Açıklama', render: (r: WalletLedgerRow) => <span className="text-[11px] text-gray-500">{r.description || '—'}</span> },
          ]}
          data={ledger}
          loading={loading}
          emptyMessage="Ledger kaydı yok"
        />
      ) : (
        <DataTable
          columns={[
            { header: 'Tarih', render: (r: BookingPaymentRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
            { header: 'Tesis', render: (r: BookingPaymentRow) => <span className="text-sm font-semibold text-white">{r.pitch_name || '—'}</span> },
            { header: 'Yöntem', key: 'payment_method' },
            { header: 'Tutar', render: (r: BookingPaymentRow) => <span className="text-green-400 font-bold">₺{r.amount}</span> },
          ]}
          data={payments}
          loading={loading}
          emptyMessage="Ödeme kaydı yok"
        />
      )}
    </PageShell>
  );
};
