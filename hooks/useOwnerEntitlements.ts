import { useCallback, useMemo } from 'react';
import type { OwnerAccount } from '../types';

export type OwnerFeatureKey = 'finance' | 'team' | 'flashDeals' | 'withdrawals';

export type OwnerNotifyFn = (message: string, variant?: 'info' | 'success' | 'warning' | 'error') => void;

const FEATURE_LABELS: Record<OwnerFeatureKey, string> = {
  finance: 'Finans modülü',
  team: 'Ekip modülü',
  flashDeals: 'Flash deal',
  withdrawals: 'Para çekme',
};

export function useOwnerEntitlements(
  account: OwnerAccount | null,
  notify?: OwnerNotifyFn,
) {
  const isReadOnly = useMemo(
    () => !!account && ['suspended', 'cancelled'].includes(account.status),
    [account],
  );

  const isPastDue = useMemo(
    () => account?.status === 'past_due',
    [account],
  );

  const entitlements = account?.entitlements;

  const can = useMemo(
    () => ({
      finance: entitlements?.finance !== false && !isReadOnly,
      team: entitlements?.team !== false && !isReadOnly,
      flashDeals: entitlements?.flash_deals !== false && !isReadOnly,
      withdrawals: entitlements?.withdrawals !== false && !isReadOnly,
    }),
    [entitlements, isReadOnly],
  );

  const requireFeature = useCallback(
    (feature: OwnerFeatureKey): boolean => {
      if (can[feature]) return true;
      const msg = `${FEATURE_LABELS[feature]} mevcut planınızda aktif değil veya hesabınız salt okunur modda. Plan yükseltmesi için destek ile iletişime geçin.`;
      if (notify) notify(msg, 'warning');
      else alert(msg);
      return false;
    },
    [can, notify],
  );

  const guardWrite = useCallback((): boolean => {
    if (!isReadOnly) return true;
    const msg = 'Hesabınız askıda veya iptal edilmiş. Yalnızca görüntüleme yapabilirsiniz.';
    if (notify) notify(msg, 'error');
    else alert(msg);
    return false;
  }, [isReadOnly, notify]);

  return {
    isReadOnly,
    isPastDue,
    can,
    requireFeature,
    guardWrite,
    maxFacilities: entitlements?.max_facilities ?? 1,
    maxCourts: entitlements?.max_courts ?? 5,
    maxStaff: entitlements?.max_staff ?? 10,
    planTier: account?.plan_tier ?? 'starter',
    accountStatus: account?.status ?? 'trialing',
  };
}
