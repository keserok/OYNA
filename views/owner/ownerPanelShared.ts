// P-REFACTOR: OwnerPanel'den SALT TAŞIMA — davranış değişmedi.
import { localDateISO } from './ownerCalendarHelpers';
import type { PitchBookingFull } from '../../types';

export function todayISO(): string {
  return localDateISO();
}


export function bookingToPendingRequest(b: PitchBookingFull, autoApproveMinutes: number) {
  const created = b.created_at ? new Date(b.created_at).getTime() : Date.now();
  const deadline = created + autoApproveMinutes * 60 * 1000;
  const timerSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  const courtName = b.courts?.name ?? 'Saha';
  const start = (b.start_time ?? '').slice(0, 5);
  const end = (b.end_time ?? '').slice(0, 5);
  return {
    id: b.id,
    bookingId: b.id,
    title: b.customer_name || b.title || 'Rezervasyon Talebi',
    subtitle: `${courtName} (${start} - ${end})`,
    timerSeconds,
    status: 'PENDING' as const,
    source: b.source,
  };
}

export const INITIAL_PENDING_REQUESTS: ReturnType<typeof bookingToPendingRequest>[] = [];

