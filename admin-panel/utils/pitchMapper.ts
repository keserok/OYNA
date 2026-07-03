import type { Pitch } from '../../types';
import type { AdminPitchRow } from '../services/adminService';

export function mapAdminPitchRowToUi(row: AdminPitchRow): Pitch {
  return {
    id: row.id,
    name: row.name,
    district: row.district || '',
    city: row.city || '',
    location: row.district || row.city || '',
    distance: '—',
    rating: Number(row.google_rating ?? 4.5),
    googleRating: Number(row.google_rating ?? 4.5),
    googleReviews: Number(row.google_review_count ?? 0),
    pricePerPerson: Math.round(Number(row.price_per_match ?? 0) / 14) || 200,
    totalPrice: Number(row.price_per_match ?? 0),
    image: row.image || 'https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=800&q=80',
    images: row.image ? [row.image] : [],
    amenities: [],
    lighting: 80,
    grassQuality: 80,
    lockerRoomQuality: 80,
    goalQuality: 80,
    occupancy: 0,
    coordinates: { lat: row.latitude ?? 40.9839, lng: row.longitude ?? 37.8764 },
    slots: [],
    isApproved: row.verification_status === 'approved',
    ...(row.isDemo ? { isDemo: true } as { isDemo?: boolean } : {}),
  };
}

export type PitchStatusFilter = 'ALL' | 'approved' | 'pending' | 'rejected';

export const PITCH_STATUS_FILTERS: Array<{ id: PitchStatusFilter; label: string }> = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'approved', label: 'Onaylı' },
  { id: 'pending', label: 'Bekleyen' },
  { id: 'rejected', label: 'Reddedilen' },
];
