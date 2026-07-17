import { supabase } from '../supabaseClient';

// ─── FI-1 — Finans veri katmanı ──────────────────────────────────────────────
// get_pitch_finance_summary RPC'sinin (owner-veya-admin yetkili) tek çağrılık
// dönem özeti. Tüm sayısal alanlar Number()'a normalize edilir (jsonb numeric →
// güvenli sayı). UI hesap yapmaz; birleştirme sunucuda + saf financeModel'de.

export interface FinancePeriod { month: string; start: string; end: string; }
export interface MethodSlice { method: string; amount: number; count: number; }
export interface SourceSlice { source: string; amount: number; }
export interface DailyPoint { date: string; collected: number; }
export interface PendingBooking {
  id: string; date: string; time: string; court: string | null;
  customer_name: string | null; price: number; paid: number; balance: number;
}
export interface RecentPayment {
  id: string; amount: number; method: string; at: string;
  customer_name: string | null; booking_date: string;
}
export interface CategorySlice { category: string; amount: number; count: number; }

export interface FinanceSummary {
  period: FinancePeriod;
  income: {
    collected_total: number;
    billed_total: number;
    pending_total: number;
    by_method: MethodSlice[];
    by_source: SourceSlice[];
    daily: DailyPoint[];
    pending_bookings: PendingBooking[];
    recent_payments: RecentPayment[];
    mismatch_count: number;
  };
  expenses: { total: number; by_category: CategorySlice[]; };
  debt: { open_total: number; debtor_count: number; };
  prev: { collected_total: number; expense_total: number; };
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Tesisin bir aylık ('YYYY-MM') finans özeti. Yetki sunucuda (owner/admin). */
export async function getPitchFinanceSummary(pitchId: string, month: string): Promise<FinanceSummary> {
  const { data, error } = await supabase.rpc('get_pitch_finance_summary', {
    p_pitch_id: pitchId,
    p_month: month,
  });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('UNAUTHORIZED')) throw new Error('Bu tesisin finansına erişim yetkin yok.');
    if (msg.includes('INVALID_MONTH')) throw new Error('Geçersiz ay.');
    throw new Error('Finans özeti yüklenemedi. Lütfen tekrar dene.');
  }
  const d = (data ?? {}) as any;
  const inc = d.income ?? {};
  return {
    period: {
      month: String(d.period?.month ?? month),
      start: String(d.period?.start ?? ''),
      end: String(d.period?.end ?? ''),
    },
    income: {
      collected_total: num(inc.collected_total),
      billed_total: num(inc.billed_total),
      pending_total: num(inc.pending_total),
      by_method: (inc.by_method ?? []).map((m: any) => ({
        method: String(m.method), amount: num(m.amount), count: num(m.count),
      })),
      by_source: (inc.by_source ?? []).map((s: any) => ({
        source: String(s.source), amount: num(s.amount),
      })),
      daily: (inc.daily ?? []).map((x: any) => ({
        date: String(x.date), collected: num(x.collected),
      })),
      pending_bookings: (inc.pending_bookings ?? []).map((b: any) => ({
        id: String(b.id), date: String(b.date), time: String(b.time ?? ''),
        court: b.court ?? null, customer_name: b.customer_name ?? null,
        price: num(b.price), paid: num(b.paid), balance: num(b.balance),
      })),
      recent_payments: (inc.recent_payments ?? []).map((p: any) => ({
        id: String(p.id), amount: num(p.amount), method: String(p.method),
        at: String(p.at ?? ''), customer_name: p.customer_name ?? null,
        booking_date: String(p.booking_date ?? ''),
      })),
      mismatch_count: num(inc.mismatch_count),
    },
    expenses: {
      total: num(d.expenses?.total),
      by_category: (d.expenses?.by_category ?? []).map((c: any) => ({
        category: String(c.category), amount: num(c.amount), count: num(c.count),
      })),
    },
    debt: {
      open_total: num(d.debt?.open_total),
      debtor_count: num(d.debt?.debtor_count),
    },
    prev: {
      collected_total: num(d.prev?.collected_total),
      expense_total: num(d.prev?.expense_total),
    },
  };
}
