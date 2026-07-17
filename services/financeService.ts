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

// ─── FI-2 — Veresiye defteri (hareket + kısmi ödeme + rezervasyon köprüsü) ────

export interface DebtorEntry {
  id: string;
  entry_type: 'DEBT' | 'PAYMENT';
  amount: number;
  payment_method: string | null;
  note: string | null;
  booking_id: string | null;
  created_at: string;
}

/** Bir veresiye kişisinin hareket defteri (borç + ödemeler), yeni→eski. */
export async function getDebtorEntries(debtorId: string): Promise<DebtorEntry[]> {
  const { data, error } = await supabase
    .from('pitch_debtor_entries')
    .select('id, entry_type, amount, payment_method, note, booking_id, created_at')
    .eq('debtor_id', debtorId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Hareket geçmişi yüklenemedi.');
  return (data ?? []).map((e: any) => ({
    id: String(e.id), entry_type: e.entry_type, amount: num(e.amount),
    payment_method: e.payment_method ?? null, note: e.note ?? null,
    booking_id: e.booking_id ?? null, created_at: String(e.created_at),
  }));
}

/** Yeni veresiye kişisi + açılış borcu (atomik RPC). Debtor id döner. */
export async function createDebtor(
  pitchId: string, name: string, phone: string | undefined, amount: number, note?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('debtor_create', {
    p_pitch_id: pitchId, p_name: name, p_phone: phone ?? null, p_amount: amount, p_note: note ?? null,
  });
  if (error) throw new Error(mapDebtorError(error.message));
  return String(data);
}

/** Kısmi/tam ödeme al. Yeni bakiyeyi döner. */
export async function debtorAddPayment(
  debtorId: string, amount: number, method: string, note?: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('debtor_add_payment', {
    p_debtor_id: debtorId, p_amount: amount, p_method: method, p_note: note ?? null,
  });
  if (error) throw new Error(mapDebtorError(error.message));
  return num(data);
}

/** Bekleyen rezervasyon bakiyesini veresiyeye taşı. Debtor id döner. */
export async function bookingToDebtor(
  bookingId: string, name?: string, phone?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('booking_to_debtor', {
    p_booking_id: bookingId, p_name: name ?? null, p_phone: phone ?? null,
  });
  if (error) throw new Error(mapDebtorError(error.message));
  return String(data);
}

/** WhatsApp hatırlatması gönderildi damgası (last_reminded_at). */
export async function markDebtorReminded(debtorId: string): Promise<void> {
  await supabase.from('pitch_debtors').update({ last_reminded_at: new Date().toISOString() }).eq('id', debtorId);
}

function mapDebtorError(msg: string): string {
  const m = msg || '';
  if (m.includes('OVER_PAYMENT')) return 'Bakiyeden fazla ödeme alınamaz.';
  if (m.includes('NO_BALANCE')) return 'Bu rezervasyonda bekleyen tutar yok.';
  if (m.includes('UNAUTHORIZED')) return 'Bu işlem için yetkin yok.';
  if (m.includes('INVALID_AMOUNT')) return 'Geçersiz tutar.';
  if (m.includes('INVALID_NAME')) return 'İsim zorunludur.';
  return 'İşlem tamamlanamadı. Lütfen tekrar dene.';
}

// ─── FI-3 — Gider düzenle/sil + sabit gider şablonları ───────────────────────

export interface ExpenseTemplate {
  id: string;
  title: string;
  category: string;
  amount: number;
  is_active: boolean;
}

/** Gideri güncelle (başlık/tutar/kategori/tarih). RLS owner/admin. */
export async function updateExpense(
  id: string, patch: { title: string; amount: number; category: string; expense_date: string },
): Promise<void> {
  const { error } = await supabase.from('pitch_expenses').update(patch).eq('id', id);
  if (error) throw new Error('Gider güncellenemedi.');
}

/** Gideri sil. */
export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('pitch_expenses').delete().eq('id', id);
  if (error) throw new Error('Gider silinemedi.');
}

/** Tesisin aktif sabit gider şablonları. */
export async function getExpenseTemplates(pitchId: string): Promise<ExpenseTemplate[]> {
  const { data, error } = await supabase
    .from('pitch_expense_templates')
    .select('id, title, category, amount, is_active')
    .eq('pitch_id', pitchId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Şablonlar yüklenemedi.');
  return (data ?? []).map((t: any) => ({
    id: String(t.id), title: t.title, category: t.category, amount: num(t.amount), is_active: !!t.is_active,
  }));
}

export async function createExpenseTemplate(
  pitchId: string, t: { title: string; category: string; amount: number },
): Promise<void> {
  const { error } = await supabase.from('pitch_expense_templates').insert({
    pitch_id: pitchId, title: t.title, category: t.category, amount: t.amount,
  });
  if (error) throw new Error('Şablon eklenemedi.');
}

export async function deleteExpenseTemplate(id: string): Promise<void> {
  // is_active=false ile pasifleştir (geçmiş giderlerin template_id bağı korunur).
  const { error } = await supabase.from('pitch_expense_templates').update({ is_active: false }).eq('id', id);
  if (error) throw new Error('Şablon kaldırılamadı.');
}

/** Şablonu belirli bir tarihte gider olarak uygula (ayda 1 — unique index korur). */
export async function applyExpenseTemplate(
  pitchId: string, t: ExpenseTemplate, expenseDateISO: string,
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('pitch_expenses').insert({
    pitch_id: pitchId, title: t.title, category: t.category, amount: t.amount,
    expense_date: expenseDateISO, template_id: t.id, created_by: u.user?.id ?? null,
  });
  if (error) {
    if ((error as any).code === '23505' || (error.message || '').includes('duplicate')) {
      throw new Error('Bu sabit gider bu ay zaten eklenmiş.');
    }
    throw new Error('Sabit gider eklenemedi.');
  }
}

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
