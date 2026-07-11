import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import {
  fetchFinanceStats, fetchWalletLedger, fetchBookingPayments, fetchOwnerBillingEvents,
  fetchProfileNameMap, toTurkishAdminError, fetchPayouts, processPayout,
  fetchPaymentIntentsAdmin, forceCaptureIntentAdmin, forceVoidIntentAdmin, forceRefundIntentAdmin,
  type FinanceStats, type WalletLedgerRow, type BookingPaymentRow, type OwnerBillingEventRow,
  type PayoutRequestRow, type PaymentIntentRow,
} from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { FinanceGoLivePanel } from '../components/FinanceGoLivePanel';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { ActionConfirmModal, type ActionConfirmOptions } from '../components/ActionConfirmModal';
import { useAdminToast } from '../context/AdminToastContext';
import { downloadCsv } from '../../utils/exportCsv';
import { CreditCard, Download, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import type { AdminNavigateFn } from '../GodViewPanel';

const PAGE_SIZE = 100;

// Cüzdan v2 ledger tipleri — Türkçe etiketler (TOP_UP kovası + bakiye harcaması dahil)
const LEDGER_TYPE_LABELS: Record<string, string> = {
  TOP_UP: 'Para Yükleme',
  WALLET_PAYMENT: 'Bakiye ile Ödeme',
  DEPOSIT: 'İade Kredisi',
  REFUND: 'İade',
  MATCH_REFUND: 'Maç İadesi',
  MATCH_FEE: 'Maç Katılım Ücreti',
  MATCH_EARNING: 'Maç Kazancı',
  BOOKING_EARNING: 'Kiralama Kazancı',
  SERVICE_EARNING: 'Hizmet Kazancı',
  REFERRAL_BONUS: 'Referans Bonusu',
  WITHDRAWAL: 'IBAN Çekimi',
};

const INTENT_CONTEXT_LABELS: Record<string, string> = {
  BOOKING: 'Rezervasyon',
  MATCH: 'Maç',
  MATCH_DEPOSIT: 'Maç Kaporası',
  GK_SERVICE: 'Kaleci Hizmeti',
  REF_SERVICE: 'Hakem Hizmeti',
  TOP_UP: 'Cüzdan Yükleme',
};

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
  const [tab, setTab] = useState<'ledger' | 'payments' | 'intents' | 'billing' | 'payouts' | 'golive'>('ledger');
  const [query, setQuery] = useState('');
  const { success, error: toastError } = useAdminToast();

  // Ödeme müdahale (Karar #73): genel intent listesi + force capture/void/refund
  const [intents, setIntents] = useState<PaymentIntentRow[]>([]);
  const [intentsLoading, setIntentsLoading] = useState(false);
  const [intentBusy, setIntentBusy] = useState<string | null>(null);
  const [intentConfirm, setIntentConfirm] = useState<ActionConfirmOptions | null>(null);

  const loadIntents = useCallback(async (search: string) => {
    setIntentsLoading(true);
    try {
      const { rows } = await fetchPaymentIntentsAdmin({ search: search.trim() || undefined, limit: PAGE_SIZE });
      setIntents(rows);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setIntentsLoading(false);
    }
  }, [toastError]);

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

  // Ödeme müdahale sekmesi açıldığında / arama değiştiğinde intent listesini çek
  useEffect(() => {
    if (tab !== 'intents') return;
    const t = setTimeout(() => void loadIntents(query), 300);
    return () => clearTimeout(t);
  }, [tab, query, loadIntents]);

  const fmtTry = (n: number | null | undefined) => `₺${Number(n ?? 0).toLocaleString('tr-TR')}`;

  const runIntentAction = async (fn: () => Promise<void>, okMsg: string, id: string) => {
    setIntentBusy(id);
    try {
      await fn();
      success(okMsg);
      setIntentConfirm(null);
      await loadIntents(query);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setIntentBusy(null);
    }
  };

  const askIntent = (it: PaymentIntentRow, kind: 'capture' | 'void' | 'refund') => {
    const label = `${it.user_name || it.user_id?.slice(0, 8) || 'Ödeme'} • ${fmtTry(it.amount)}`;
    const cfg = {
      capture: { title: 'Tahsilatı zorla (capture)', desc: `${fmtTry(it.amount)} ön-provizyon TAHSİL edilecek.`, impact: 'Para gerçekten çekilir; geri almak ayrı iade gerektirir.', at: 'FORCE_CAPTURE' as const, run: () => forceCaptureIntentAdmin(it.id, 'Finans genel müdahale'), ok: 'Tahsil edildi' },
      void: { title: 'Ön-provizyonu iptal et (void)', desc: `${fmtTry(it.amount)} bloke serbest bırakılacak.`, impact: 'Bloke kaldırılır; ödeme alınmamış sayılır.', at: 'FORCE_VOID' as const, run: () => forceVoidIntentAdmin(it.id, 'Finans genel müdahale'), ok: 'Bloke serbest bırakıldı' },
      refund: { title: 'İade et (refund)', desc: `${fmtTry(it.amount)} kademeli iade politikasına göre iade edilecek.`, impact: 'Tahsil edilmiş ödeme iade edilir; kesintiler politikaya göre.', at: 'FORCE_REFUND' as const, run: () => forceRefundIntentAdmin(it.id, 'Finans genel müdahale'), ok: 'İade işlendi' },
    }[kind];
    setIntentConfirm({
      title: cfg.title, description: cfg.desc, impactText: cfg.impact,
      actionType: cfg.at, targetId: it.id, targetName: label,
      confirmPhrase: 'ONAYLA',
      onConfirm: () => void runIntentAction(cfg.run, cfg.ok, it.id),
      onCancel: () => setIntentConfirm(null),
    });
  };

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

  const exportPayouts = () => {
    downloadCsv('oyna-payouts.csv', ['Tarih', 'Talep Eden', 'Tip', 'IBAN Sahibi', 'IBAN', 'Tutar', 'Durum', 'Referans'], payouts.map((r) => [
      new Date(r.created_at).toLocaleString('tr-TR'),
      nameMap[r.user_id] || r.user_id,
      r.payout_type === 'OWNER_BIWEEKLY' ? 'Saha Sahibi' : r.payout_type === 'PROVIDER_INSTANT' ? 'Kaleci/Hakem' : r.payout_type,
      r.iban_holder_name || '',
      r.iban || '',
      String(r.amount),
      r.status,
      r.iyzico_payout_ref || '',
    ]));
  };

  const exportIntents = () => {
    downloadCsv('oyna-odemeler.csv', ['Tarih', 'Kullanıcı', 'Bağlam', 'Tutar', 'Komisyon', 'Durum'], intents.map((r) => [
      new Date(r.created_at).toLocaleString('tr-TR'),
      r.user_name || r.user_id || '',
      r.related_entity_type === 'TOP_UP' ? 'Cüzdan Yükleme' : r.pitch_name || (r.match_id ? 'Maç' : INTENT_CONTEXT_LABELS[r.related_entity_type ?? ''] ?? r.related_entity_type ?? ''),
      String(r.amount ?? 0),
      String(r.commission_amount ?? 0),
      r.status,
    ]));
  };

  // Her sekmenin kendi CSV dışa aktarımı — muhasebeye vermek için (Karar: finans şeffaflığı)
  const handleExport = () => {
    switch (tab) {
      case 'ledger': return exportLedger();
      case 'payments': return exportPayments();
      case 'intents': return exportIntents();
      case 'payouts': return exportPayouts();
      case 'billing': return exportBilling();
      default: return;
    }
  };

  const tabs = useMemo(() => ([
    { id: 'ledger' as const, label: 'Cüzdan Ledger' },
    { id: 'payments' as const, label: 'Rezervasyon Ödemeleri' },
    { id: 'intents' as const, label: 'Ödeme Müdahale' },
    { id: 'payouts' as const, label: `Payout Talepleri${payouts.length ? ` (${payouts.length})` : ''}` },
    { id: 'billing' as const, label: 'Owner Billing' },
    { id: 'golive' as const, label: 'Go-Live & Mutabakat' },
  ]), [payouts.length]);

  const activeData = tab === 'ledger' ? filteredLedger : tab === 'payments' ? filteredPayments : tab === 'intents' ? intents : tab === 'billing' ? filteredBilling : filteredPayouts;
  const totalData = tab === 'ledger' ? ledger.length : tab === 'payments' ? payments.length : tab === 'intents' ? intents.length : tab === 'billing' ? billing.length : payouts.length;

  return (
    <PageShell
      route="FINANCE"
      icon={<CreditCard size={20} />}
      actions={
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || tab === 'golive' || activeData.length === 0}
            title={tab === 'golive' ? 'Bu sekmede tablo verisi yok' : 'Görünen kayıtları CSV olarak indir'}
            className="flex items-center gap-2 h-9 px-4 text-xs font-bold text-gray-400 hover:text-white rounded-xl bg-white/5 border border-white/10 disabled:opacity-40"
          >
            <Download size={14} /> CSV İndir
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
        {tab !== 'golive' && (
          <AdminSearchBar
            value={query}
            onChange={setQuery}
            placeholder="Tabloda ara..."
            resultCount={activeData.length}
            totalCount={totalData}
            className="sm:max-w-xs"
          />
        )}
      </div>

      {tab === 'golive' && <FinanceGoLivePanel />}

      {tab === 'ledger' && (
        <DataTable
          columns={[
            { header: 'Tarih', render: (r: WalletLedgerRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
            { header: 'Kullanıcı', render: (r: WalletLedgerRow) => <span className="text-sm text-white">{nameMap[r.user_id] || r.user_id.slice(0, 8)}</span> },
            { header: 'Tip', render: (r: WalletLedgerRow) => <span className="text-[11px] font-bold text-gray-300">{LEDGER_TYPE_LABELS[r.type] ?? r.type}</span> },
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

      {tab === 'intents' && (
        <>
          <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
            Tüm ödeme intent'leri (rezervasyon, maç, hizmet). Askıda kalan bir ödemeyi maç kokpitine
            gitmeden buradan tahsil edebilir, blokeyi kaldırabilir veya iade edebilirsiniz — her işlem
            FİNANS yetkisi ister, denetime yazılır ve onay için <b>ONAYLA</b> yazmanız gerekir.
          </p>
          <DataTable
            columns={[
              { header: 'Tarih', render: (r: PaymentIntentRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
              { header: 'Kullanıcı', render: (r: PaymentIntentRow) => <span className="text-sm text-white">{r.user_name || r.user_id?.slice(0, 8) || '—'}</span> },
              { header: 'Bağlam', render: (r: PaymentIntentRow) => <span className="text-[11px] text-gray-400">{r.related_entity_type === 'TOP_UP' ? 'Cüzdan Yükleme' : r.pitch_name || (r.match_id ? 'Maç' : INTENT_CONTEXT_LABELS[r.related_entity_type ?? ''] ?? r.related_entity_type ?? '—')}</span> },
              { header: 'Tutar', render: (r: PaymentIntentRow) => <span className="text-green-400 font-bold">{fmtTry(r.amount)}</span> },
              { header: 'Komisyon', render: (r: PaymentIntentRow) => <span className="text-[11px] text-amber-300">{fmtTry(r.commission_amount)}</span> },
              { header: 'Durum', render: (r: PaymentIntentRow) => <span className="text-[11px] font-bold text-gray-300">{r.status}</span> },
              { header: 'Müdahale', render: (r: PaymentIntentRow) => {
                const s = (r.status || '').toUpperCase();
                const canCV = s === 'BLOCKED' || s === 'PENDING';
                const canR = s === 'CAPTURED' || s === 'PAID';
                return (
                  <div className="flex gap-1.5">
                    <button type="button" disabled={intentBusy === r.id || !canCV} onClick={() => askIntent(r, 'capture')} className="text-[10px] font-bold py-1 px-2 rounded-lg border border-emerald-500/30 text-emerald-400 disabled:opacity-30">Tahsil</button>
                    <button type="button" disabled={intentBusy === r.id || !canCV} onClick={() => askIntent(r, 'void')} className="text-[10px] font-bold py-1 px-2 rounded-lg border border-amber-500/30 text-amber-400 disabled:opacity-30">Void</button>
                    <button type="button" disabled={intentBusy === r.id || !canR} onClick={() => askIntent(r, 'refund')} className="text-[10px] font-bold py-1 px-2 rounded-lg border border-red-500/30 text-red-400 disabled:opacity-30">İade</button>
                  </div>
                );
              } },
            ]}
            data={intents}
            loading={intentsLoading}
            emptyMessage={query ? 'Eşleşen ödeme yok' : 'Ara: kullanıcı, tesis, intent ID veya referans'}
          />
        </>
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

      <ActionConfirmModal isOpen={!!intentConfirm} options={intentConfirm} />
    </PageShell>
  );
};
