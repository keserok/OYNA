import { supabase } from '../supabaseClient';
import type { OwnerAccount, OwnerEntitlements } from '../types';
import { toTurkishError } from './pitchOwnerService';

const DEFAULT_ENTITLEMENTS: OwnerEntitlements = {
  max_facilities: 1,
  max_courts: 5,
  max_staff: 10,
  flash_deals: true,
  finance: true,
  team: true,
  withdrawals: true,
};

function mapAccount(row: Record<string, unknown>): OwnerAccount {
  const raw = (row.entitlements ?? {}) as Record<string, unknown>;
  return {
    id: row.id as string,
    owner_user_id: row.owner_user_id as string,
    plan_tier: (row.plan_tier as OwnerAccount['plan_tier']) ?? 'starter',
    status: (row.status as OwnerAccount['status']) ?? 'trialing',
    trial_ends_at: (row.trial_ends_at as string | null) ?? null,
    entitlements: {
      max_facilities: Number(raw.max_facilities ?? DEFAULT_ENTITLEMENTS.max_facilities),
      max_courts: Number(raw.max_courts ?? DEFAULT_ENTITLEMENTS.max_courts),
      max_staff: Number(raw.max_staff ?? DEFAULT_ENTITLEMENTS.max_staff),
      flash_deals: raw.flash_deals !== false,
      finance: raw.finance !== false,
      team: raw.team !== false,
      withdrawals: raw.withdrawals !== false,
    },
    billing_email: (row.billing_email as string | null) ?? null,
    created_at: row.created_at as string | undefined,
  };
}

export async function getOwnerAccount(userId: string): Promise<OwnerAccount | null> {
  try {
    const { data, error } = await supabase
      .from('owner_accounts')
      .select('*')
      .eq('owner_user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data as Record<string, unknown>) : null;
  } catch (err) {
    console.warn('getOwnerAccount:', err);
    return null;
  }
}

/** Yoksa oluşturur (trigger kaçırılmış eski kullanıcılar için). */
export async function getOrCreateOwnerAccount(userId: string): Promise<OwnerAccount> {
  const existing = await getOwnerAccount(userId);
  if (existing) return existing;

  try {
    const { data, error } = await supabase
      .from('owner_accounts')
      .insert({ owner_user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return mapAccount(data as Record<string, unknown>);
  } catch (err) {
    console.warn('getOrCreateOwnerAccount insert failed:', err);
    return {
      id: 'local-fallback',
      owner_user_id: userId,
      plan_tier: 'starter',
      status: 'trialing',
      trial_ends_at: null,
      entitlements: DEFAULT_ENTITLEMENTS,
      billing_email: null,
    };
  }
}

export async function ownerCanUseFeature(feature: keyof OwnerEntitlements | 'active'): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('owner_has_entitlement', { p_feature: feature });
    if (error) throw error;
    return data !== false;
  } catch {
    return true;
  }
}

export async function updateOwnerBillingEmail(userId: string, email: string): Promise<void> {
  const { error } = await supabase
    .from('owner_accounts')
    .update({ billing_email: email.trim(), updated_at: new Date().toISOString() })
    .eq('owner_user_id', userId);
  if (error) throw new Error(toTurkishError(error));
}

export function planTierLabel(tier: OwnerAccount['plan_tier']): string {
  const labels: Record<OwnerAccount['plan_tier'], string> = {
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };
  return labels[tier] ?? tier;
}

export function accountStatusLabel(status: OwnerAccount['status']): string {
  const labels: Record<OwnerAccount['status'], string> = {
    trialing: 'Deneme',
    active: 'Aktif',
    past_due: 'Ödeme Bekliyor',
    suspended: 'Askıda',
    cancelled: 'İptal',
  };
  return labels[status] ?? status;
}

export interface OwnerAccountAdminRow extends OwnerAccount {
  owner_name?: string | null;
  owner_email?: string | null;
  facility_count?: number;
}

export async function listOwnerAccountsForAdmin(): Promise<OwnerAccountAdminRow[]> {
  const { data: accounts, error } = await supabase
    .from('owner_accounts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(toTurkishError(error));
  if (!accounts?.length) return [];

  const userIds = accounts.map((a) => (a as { owner_user_id: string }).owner_user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, p as { full_name?: string; email?: string }]),
  );

  const enriched: OwnerAccountAdminRow[] = [];
  for (const row of accounts) {
    const r = row as Record<string, unknown>;
    const ownerUserId = r.owner_user_id as string;
    const profile = profileMap.get(ownerUserId);
    const { count } = await supabase
      .from('pitches')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerUserId)
      .eq('is_demo', false);
    enriched.push({
      ...mapAccount(r),
      owner_name: profile?.full_name ?? null,
      owner_email: profile?.email ?? null,
      facility_count: count ?? 0,
    });
  }

  return enriched;
}

export async function updateOwnerAccountForAdmin(
  ownerUserId: string,
  patch: {
    plan_tier?: OwnerAccount['plan_tier'];
    status?: OwnerAccount['status'];
    entitlements?: Partial<OwnerEntitlements>;
    billing_email?: string | null;
  },
): Promise<void> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.plan_tier) updates.plan_tier = patch.plan_tier;
  if (patch.status) updates.status = patch.status;
  if (patch.billing_email !== undefined) updates.billing_email = patch.billing_email;
  if (patch.entitlements) {
    const { data: current } = await supabase
      .from('owner_accounts')
      .select('entitlements')
      .eq('owner_user_id', ownerUserId)
      .single();
    const prev = (current?.entitlements ?? {}) as Record<string, unknown>;
    updates.entitlements = { ...DEFAULT_ENTITLEMENTS, ...prev, ...patch.entitlements };
  }

  const { error } = await supabase
    .from('owner_accounts')
    .update(updates)
    .eq('owner_user_id', ownerUserId);
  if (error) throw new Error(toTurkishError(error));
}
