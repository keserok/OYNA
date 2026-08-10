import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '../components/DataTable';
import {
  fetchFinanceStats, fetchWalletLedger, fetchBookingPayments, fetchOwnerBillingEvents,
  fetchProfileNameMap, toTurkishAdminError, fetchPayouts, processPayout, fetchPayoutIdentityChecks,
  fetchPaymentIntentsAdmin, forceCaptureIntentAdmin, forceVoidIntentAdmin, forceRefundIntentAdmin,
  markChargebackAdmin, fetchWithdrawalRequestsAdmin, processWithdrawalAdmin, reversePayout,
  type FinanceStats, type WalletLedgerRow, type BookingPaymentRow, type OwnerBillingEventRow,
  type PayoutRequestRow, type PaymentIntentRow, type PayoutIdentityCheck, type WithdrawalRequestRow,
} from '../../services/adminService';
import { PageShell } from '../components/PageShell';
import { FinanceGoLivePanel } from '../components/FinanceGoLivePanel';
import { FinanceReportPanel } from '../components/FinanceReportPanel';
import { PaymentHealthPanel } from '../components/PaymentHealthPanel';
import { AdminSearchBar } from '../components/AdminSearchBar';
import { ActionConfirmModal, type ActionConfirmOptions } from '../components/ActionConfirmModal';
import { useAdminToast } from '../context/AdminToastContext';
import { downloadCsv, maskIban } from '../../utils/exportCsv';
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
  CHARGEBACK_REVERSAL: 'Chargeback Kesintisi',
};

const PAYOUT_TYPE_LABELS: Record<string, string> = {
  OWNER_BIWEEKLY: 'Saha Sahibi',
  PROVIDER_INSTANT: 'Kaleci/Hakem',
  WALLET_CASHOUT: 'Cüzdan Çekimi',
  MANUAL: 'Manuel',
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
  const [idChecks, setIdChecks] = useState<Record<string, PayoutIdentityCheck>>({});
  const [payoutBusy, setPayoutBusy] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [billingUnavailable, setBillingUnavailable] = useState(false);
  const [tab, setTab] = useState<'ledger' | 'payments' | 'intents' | 'billing' | 'payouts' | 'withdrawals' | 'report' | 'health' | 'golive'>('ledger');
  const [query, setQuery] = useState('');
  const { success, error: toastError } = useAdminToast();

  // Tesis İBAN talepleri (owner_withdrawal_requests) — Payout Talepleri'nden
  // (payout_requests) AYRI legacy owner-IBAN akışı; şimdiye dek panelde hiç yoktu.
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequestRow[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalStatus, setWithdrawalStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [withdrawalBusy, setWithdrawalBusy] = useState<string | null>(null);
  // Yarış koruması: RPC sürerken filtre değişirse bayat yanıt en son yazılıp
  // yanlış filtrenin satırlarını gösterebilirdi — yalnız en güncel istek yazar.
  const withdrawalReqRef = useRef(0);
  const withdrawalStatusRef = useRef(withdrawalStatus);
  useEffect(() => { withdrawalStatusRef.current = withdrawalStatus; }, [withdrawalStatus]);

  const loadWithdrawals = useCallback(async (status: string) => {
    const reqId = ++withdrawalReqRef.current;
    setWithdrawalsLoading(true);
    try {
      const rows = await fetchWithdrawalRequestsAdmin(status, PAGE_SIZE);
      if (withdrawalReqRef.current === reqId) setWithdrawals(rows);
    } catch (err) {
      if (withdrawalReqRef.current === reqId) toastError(toTurkishAdminError(err));
    } finally {
      if (withdrawalReqRef.current === reqId) setWithdrawalsLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    if (tab === 'withdrawals') void loadWithdrawals(withdrawalStatus);
  }, [tab, withdrawalStatus, loadWithdrawals]);

  const handleWithdrawal = async (r: WithdrawalRequestRow, approved: boolean) => {
    let notes: string | undefined;
    if (!approved) {
      const input = window.prompt('Red sebebi (tesise bildirim olarak gider):');
      if (input === null) return;
      notes = input.trim() || undefined;
    } else if (!window.confirm(`${r.owner_name || 'Tesis sahibi'} için ₺${Number(r.amount).toLocaleString('tr')} İBAN talebi ONAYLANSIN mı?\nBanka transferini ayrıca yapmanız gerekir — RPC yalnız durumu işler ve sahibi bilgilendirir.`)) {
      return;
    }
    setWithdrawalBusy(r.id);
    try {
      await processWithdrawalAdmin(r.id, approved, notes);
      success(approved ? 'Talep onaylandı; tesise bildirim gitti.' : 'Talep reddedildi; tesise bildirim gitti.');
      // Ref'ten oku: RPC sürerken admin filtreyi değiştirdiyse GÜNCEL filtreyle tazele
      await loadWithdrawals(withdrawalStatusRef.current);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setWithdrawalBusy(null);
    }
  };

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
        // [S4] Bekleyen çekimler için TC/IBAN isim eşleşme kontrolü (best-effort)
        void fetchPayoutIdentityChecks('PENDING', PAGE_SIZE)
          .then((checks) => setIdChecks(Object.fromEntries(checks.map((c) => [c.payout_id, c]))))
          .catch(() => setIdChecks({}));
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

  // Tesis sahibinin serbestçe yazdığı ham URL'yi (iban_photo_url) doğrulamadan
  // <a href> yapmıyoruz: yalnız https + Supabase storage host'u tıklanabilir olur.
  const safeStorageUrl = (raw: string | null): string | null => {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:' || !/\.supabase\.co$/.test(u.hostname)) return null;
      return u.toString();
    } catch {
      return null;
    }
  };

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

  // [S4] Chargeback: intent'i işaretle + ilgili kazancı dondur
  const runChargeback = async (it: PaymentIntentRow, reason?: string) => {
    setIntentBusy(it.id);
    try {
      const r = await markChargebackAdmin(it.id, reason);
      const parts: string[] = [];
      if (Number(r.frozen_pending) > 0) parts.push(`${fmtTry(r.frozen_pending)} bekleyen kazanç donduruldu`);
      if (Number(r.clawed_completed) > 0) parts.push(`${fmtTry(r.clawed_completed)} kazanç geri alındı`);
      success(`Chargeback işaretlendi${parts.length ? ' — ' + parts.join(', ') : ' (ilgili kazanç bulunamadı)'}`);
      setIntentConfirm(null);
      await loadIntents(query);
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setIntentBusy(null);
    }
  };

  const askChargeback = (it: PaymentIntentRow) => {
    const label = `${it.user_name || it.user_id?.slice(0, 8) || 'Ödeme'} • ${fmtTry(it.amount)}`;
    const reason = window.prompt('Chargeback nedeni (opsiyonel, banka itiraz no vb.):') ?? undefined;
    setIntentConfirm({
      title: 'Chargeback işaretle',
      description: `${fmtTry(it.amount)} ödeme chargeback olarak işaretlenecek ve ilgili saha/hizmet kazancı dondurulacak.`,
      impactText: 'Kart sahibi bankasından itiraz etti sayılır → kullanıcıya İADE YAPILMAZ (parasını bankadan aldı). Yalnız ilgili kazanç geri alınır ki platform çifte zarar etmesin. Geri alınamaz.',
      actionType: 'FORCE_CHARGEBACK', targetId: it.id, targetName: label,
      confirmPhrase: 'ONAYLA',
      onConfirm: () => void runChargeback(it, reason),
      onCancel: () => setIntentConfirm(null),
    });
  };

  // F5.3: reversePayout servis sarmalayıcısı vardı ama hiçbir UI çağırmıyordu —
  // yanlış COMPLETED işaretlenen ödeme panelden geri alınamıyordu.
  const askReversePayout = (r: PayoutRequestRow) => {
    const reason = (window.prompt('Geri alma nedeni (zorunlu — denetim kaydına yazılır):') || '').trim();
    if (!reason) { toastError('Sebep girilmeden geri alınamaz.'); return; }
    const label = `${nameMap[r.user_id] || r.user_id.slice(0, 8)} • ₺${Number(r.net_amount ?? r.amount).toLocaleString('tr')}`;
    setIntentConfirm({
      title: 'Payout işaretini geri al',
      description: 'COMPLETED işaretli ödeme PENDING durumuna döner; ilgili cüzdan hareketi de PENDING olur. Banka transferi gerçekten yapıldıysa GERİ ALMAYIN — bu yalnız kayıt düzeltmesidir.',
      impactText: `Sebep: ${reason}`,
      actionType: 'PAYOUT_REVERSE', targetId: r.id, targetName: label,
      confirmPhrase: 'ONAYLA',
      onConfirm: () => void (async () => {
        setPayoutBusy(r.id);
        try {
          await reversePayout(r.id, reason);
          success('Payout PENDING durumuna geri alındı');
          setIntentConfirm(null);
          await load();
        } catch (err) {
          toastError(toTurkishAdminError(err));
        } finally {
          setPayoutBusy(null);
        }
      })(),
      onCancel: () => setIntentConfirm(null),
    });
  };

  const handlePayout = async (id: string, status: 'COMPLETED' | 'FAILED', row?: PayoutRequestRow) => {
    if (status === 'FAILED' && !window.confirm('Bu payout talebi reddedilsin mi? Rezerve tutar sahibe iade edilir.')) return;
    // [S2.1] Cüzdan çekiminde bankaya NET tutar gönderilir (brüt − kesinti) — admin'e vurgula.
    const isCashout = row?.payout_type === 'WALLET_CASHOUT' && row?.net_amount != null;
    const refPrompt = isCashout
      ? `Banka transfer referansı — bankaya NET ₺${Number(row!.net_amount).toLocaleString('tr')} gönderilmeli (brüt ₺${Number(row!.amount).toLocaleString('tr')} − kesinti ₺${Number(row!.fee_amount ?? 0).toLocaleString('tr')}):`
      : 'Banka / iyzico referansı (opsiyonel):';
    const ref = status === 'COMPLETED' ? (window.prompt(refPrompt) ?? undefined) : undefined;
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
    { label: 'Rezervasyon Geliri (30g)', value: `₺${Number(stats.booking_revenue).toLocaleString('tr')}`, color: 'text-primary' },
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

  // F5.4: muhasebenin bankaya gönderdiği liste — IBAN maskeli (PII politikası).
  const exportPayouts = () => {
    downloadCsv('oyna-payouts.csv',
      ['Tarih', 'Talep Eden', 'Tip', 'IBAN Sahibi', 'IBAN (maskeli)', 'Brüt', 'Kesinti', 'Net', 'Durum', 'Banka Ref'],
      payouts.map((r) => [
        new Date(r.created_at).toLocaleString('tr-TR'),
        nameMap[r.user_id] || r.user_id,
        PAYOUT_TYPE_LABELS[r.payout_type] ?? r.payout_type,
        r.iban_holder_name || '',
        maskIban(r.iban),
        String(r.amount),
        String(r.fee_amount ?? 0),
        String(r.net_amount ?? r.amount),
        r.status,
        r.iyzico_payout_ref || '',
      ]));
  };

  const exportIntents = () => {
    downloadCsv('oyna-intents.csv',
      ['Tarih', 'Kullanıcı', 'Bağlam', 'Tutar', 'Komisyon', 'Durum', 'Sağlayıcı Ref'],
      intents.map((r) => [
        new Date(r.created_at).toLocaleString('tr-TR'),
        r.user_name || r.user_id || '',
        r.related_entity_type || r.pitch_name || '',
        String(r.amount),
        String(r.commission_amount ?? 0),
        r.status,
        r.provider_ref || '',
      ]));
  };

  const tabs = useMemo(() => ([
    { id: 'ledger' as const, label: 'Cüzdan Ledger' },
    { id: 'payments' as const, label: 'Rezervasyon Ödemeleri' },
    { id: 'intents' as const, label: 'Ödeme Müdahale' },
    { id: 'payouts' as const, label: `Payout Talepleri${payouts.length ? ` (${payouts.length})` : ''}` },
    { id: 'withdrawals' as const, label: `Tesis İBAN Talepleri${withdrawals.length ? ` (${withdrawals.length})` : ''}` },
    { id: 'billing' as const, label: 'Owner Billing' },
    { id: 'report' as const, label: 'Finans Raporu' },
    { id: 'health' as const, label: 'Ödeme Sağlığı' },
    { id: 'golive' as const, label: 'Go-Live & Mutabakat' },
  ]), [payouts.length, withdrawals.length]);

  const filteredWithdrawals = useMemo(() => filterRows(withdrawals), [withdrawals, query]);
  const activeData = tab === 'ledger' ? filteredLedger : tab === 'payments' ? filteredPayments : tab === 'intents' ? intents : tab === 'billing' ? filteredBilling : tab === 'withdrawals' ? filteredWithdrawals : filteredPayouts;
  const totalData = tab === 'ledger' ? ledger.length : tab === 'payments' ? payments.length : tab === 'intents' ? intents.length : tab === 'billing' ? billing.length : tab === 'withdrawals' ? withdrawals.length : payouts.length;

  return (
    <PageShell
      route="FINANCE"
      icon={<CreditCard size={20} />}
      actions={
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={tab === 'ledger' ? exportLedger : tab === 'payments' ? exportPayments : tab === 'payouts' ? exportPayouts : tab === 'intents' ? exportIntents : exportBilling}
            disabled={loading || (tab === 'billing' && billing.length === 0) || (tab === 'payouts' && payouts.length === 0) || (tab === 'intents' && intents.length === 0) || tab === 'golive' || tab === 'report' || tab === 'health' || tab === 'withdrawals'}
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
        <div key={k.label} className="bg-surface-1/60 border border-white/[0.06] rounded-xl p-4">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{k.label}</p>
          <p className={`text-lg font-extrabold mt-1 ${k.color}`}>{k.value}</p>
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
        {tab !== 'golive' && tab !== 'report' && tab !== 'health' && (
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

      {tab === 'report' && <FinanceReportPanel />}

      {tab === 'health' && <PaymentHealthPanel />}

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
              { header: 'Durum', render: (r: PaymentIntentRow) => (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-bold text-gray-300">{r.status}</span>
                  {r.chargeback_at && <span className="text-[9px] font-extrabold text-red-400 uppercase">⚠ Chargeback</span>}
                </div>
              ) },
              { header: 'Müdahale', render: (r: PaymentIntentRow) => {
                const s = (r.status || '').toUpperCase();
                const canCV = s === 'BLOCKED' || s === 'PENDING';
                const canR = s === 'CAPTURED' || s === 'PAID';
                const canCB = (s === 'CAPTURED' || s === 'PAID') && !r.chargeback_at;
                return (
                  <div className="flex gap-1.5 flex-wrap">
                    <button type="button" disabled={intentBusy === r.id || !canCV} onClick={() => askIntent(r, 'capture')} className="text-[10px] font-bold py-1 px-2 rounded-lg border border-emerald-500/30 text-emerald-400 disabled:opacity-30">Tahsil</button>
                    <button type="button" disabled={intentBusy === r.id || !canCV} onClick={() => askIntent(r, 'void')} className="text-[10px] font-bold py-1 px-2 rounded-lg border border-amber-500/30 text-amber-400 disabled:opacity-30">Void</button>
                    <button type="button" disabled={intentBusy === r.id || !canR} onClick={() => askIntent(r, 'refund')} className="text-[10px] font-bold py-1 px-2 rounded-lg border border-red-500/30 text-red-400 disabled:opacity-30">İade</button>
                    <button type="button" disabled={intentBusy === r.id || !canCB} onClick={() => askChargeback(r)} className="text-[10px] font-bold py-1 px-2 rounded-lg border border-fuchsia-500/30 text-fuchsia-400 disabled:opacity-30">{r.chargeback_at ? 'CB ✓' : 'Chargeback'}</button>
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
            { header: 'Tip', render: (r: PayoutRequestRow) => <span className="text-[11px] font-bold text-blue-300">{PAYOUT_TYPE_LABELS[r.payout_type] ?? r.payout_type}</span> },
            { header: 'IBAN', render: (r: PayoutRequestRow) => <span className="text-[10px] font-mono text-gray-400">{r.iban_holder_name} · {r.iban}</span> },
            { header: 'Kimlik Kontrol', render: (r: PayoutRequestRow) => {
              const c = idChecks[r.id];
              if (!c) return <span className="text-[10px] text-gray-600">—</span>;
              const idLabel = c.identity_status === 'VERIFIED' ? 'TC ✓' : c.identity_status === 'NONE' ? 'TC yok' : c.identity_status;
              const idTone = c.identity_status === 'VERIFIED' ? 'text-green-400' : 'text-amber-400';
              return (
                <div className="flex flex-col gap-0.5 min-w-[130px]">
                  <span className="text-[10px] text-gray-400">Kayıtlı: <span className="text-gray-200">{c.requester_name || '—'}</span></span>
                  <div className="flex items-center gap-2">
                    {c.name_match === true
                      ? <span className="text-[10px] font-extrabold text-green-400">İsim ✓</span>
                      : c.name_match === false
                        ? <span className="text-[10px] font-extrabold text-red-400">⚠ İsim farklı</span>
                        : <span className="text-[10px] text-gray-500">İsim ?</span>}
                    <span className={`text-[10px] font-bold ${idTone}`}>{idLabel}</span>
                  </div>
                </div>
              );
            } },
            { header: 'Tutar', render: (r: PayoutRequestRow) => (
              r.payout_type === 'WALLET_CASHOUT' && r.net_amount != null ? (
                <div className="flex flex-col">
                  {/* Bankaya giden NET tutar öne çıkar; brüt/kesinti iz için altta */}
                  <span className="text-green-400 font-bold">Net ₺{Number(r.net_amount).toLocaleString('tr')}</span>
                  <span className="text-[10px] text-gray-500">brüt ₺{Number(r.amount).toLocaleString('tr')} · kesinti ₺{Number(r.fee_amount ?? 0).toLocaleString('tr')}</span>
                </div>
              ) : <span className="text-green-400 font-bold">₺{Number(r.amount).toLocaleString('tr')}</span>
            ) },
            { header: 'Durum', render: (r: PayoutRequestRow) => <span className="text-[11px] font-bold text-gray-300">{r.status}</span> },
            { header: 'İşlem', render: (r: PayoutRequestRow) => (
              r.status === 'PENDING' || r.status === 'PROCESSING' ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={payoutBusy === r.id}
                    onClick={() => handlePayout(r.id, 'COMPLETED', r)}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 disabled:opacity-40"
                  >
                    Tamamla
                  </button>
                  <button
                    type="button"
                    disabled={payoutBusy === r.id}
                    onClick={() => handlePayout(r.id, 'FAILED', r)}
                    className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                  >
                    Reddet
                  </button>
                </div>
              ) : r.status === 'COMPLETED' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600">{r.iyzico_payout_ref || '—'}</span>
                  {/* F5.3: yanlış COMPLETED işaretlenen payout'u geri al —
                      admin_reverse_payout (FINANCE + sebep zorunlu + audit) */}
                  <button
                    type="button"
                    disabled={payoutBusy === r.id}
                    onClick={() => askReversePayout(r)}
                    className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-orange-500/15 text-orange-300 hover:bg-orange-500/25 disabled:opacity-40"
                  >
                    Geri Al
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

      {tab === 'withdrawals' && (
        <>
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {([['PENDING', 'Bekleyen'], ['APPROVED', 'Onaylanan'], ['REJECTED', 'Reddedilen'], ['ALL', 'Tümü']] as const).map(([s, label]) => (
              <button
                key={s}
                type="button"
                onClick={() => setWithdrawalStatus(s)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-colors ${
                  withdrawalStatus === s ? 'bg-white/10 border-white/25 text-white' : 'border-white/10 text-gray-500 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
            <p className="text-[10px] text-gray-600 ml-2">
              Tesis sahibinin İBAN'a çekim talebi — onay/red tesise bildirim düşürür; banka transferi manuel yapılır.
            </p>
          </div>
          <DataTable
            columns={[
              { header: 'Tarih', render: (r: WithdrawalRequestRow) => <span className="text-[11px] font-mono text-gray-400">{new Date(r.created_at).toLocaleString('tr-TR')}</span> },
              { header: 'Tesis', render: (r: WithdrawalRequestRow) => (
                <div>
                  <p className="text-sm text-white font-bold">{r.pitch_name || '—'}</p>
                  <p className="text-[10px] text-gray-500">{r.owner_name || '—'}</p>
                </div>
              ) },
              { header: 'Tutar', render: (r: WithdrawalRequestRow) => <span className="text-green-400 font-bold">₺{Number(r.amount).toLocaleString('tr')}</span> },
              { header: 'IBAN', render: (r: WithdrawalRequestRow) => {
                const doc = safeStorageUrl(r.iban_photo_url);
                return (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-gray-400">{r.iban || '—'}</span>
                    {doc ? (
                      <a href={doc} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-blue-400 hover:text-blue-300">IBAN belgesi ↗</a>
                    ) : r.iban_photo_url ? (
                      <span className="text-[10px] text-gray-600" title={r.iban_photo_url}>belge bağlantısı geçersiz</span>
                    ) : null}
                  </div>
                );
              } },
              { header: 'Durum', render: (r: WithdrawalRequestRow) => <span className="text-[11px] font-bold text-gray-300">{r.status}</span> },
              { header: 'İşlem', render: (r: WithdrawalRequestRow) => (
                r.status === 'PENDING' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={withdrawalBusy === r.id}
                      onClick={() => void handleWithdrawal(r, true)}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 disabled:opacity-40"
                    >
                      Onayla
                    </button>
                    <button
                      type="button"
                      disabled={withdrawalBusy === r.id}
                      onClick={() => void handleWithdrawal(r, false)}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-40"
                    >
                      Reddet
                    </button>
                  </div>
                ) : <span className="text-[10px] text-gray-600">—</span>
              ) },
            ]}
            data={filteredWithdrawals}
            loading={withdrawalsLoading}
            emptyMessage={withdrawalStatus === 'PENDING' ? 'Bekleyen İBAN talebi yok' : 'Kayıt yok'}
          />
        </>
      )}

      <ActionConfirmModal isOpen={!!intentConfirm} options={intentConfirm} />
    </PageShell>
  );
};
