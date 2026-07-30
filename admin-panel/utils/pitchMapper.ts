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
    // V-6: sahte 4.5 varsayılanı kaldırıldı. Google yorumu yoksa puan 0
    // (kart "Yeni" gösterir); admin satırında platform rating_count yok.
    rating: Number(row.google_review_count ?? 0) > 0 ? Number(row.google_rating ?? 0) : 0,
    ratingCount: 0,
    googleRating: Number(row.google_rating ?? 0),
    googleReviews: Number(row.google_review_count ?? 0),
    // F3d/F3g: sahte varsayılanlar kaldırıldı — fiyat hesaplanamıyorsa 0 (uydurma
    // 200 değil), görselsiz sahada stok foto yerine boş (SafeImage gradient basar),
    // ölçülmemiş kalite skorları 80 gibi gösterilmez.
    pricePerPerson: Math.round(Number(row.price_per_match ?? 0) / 14) || 0,
    totalPrice: Number(row.price_per_match ?? 0),
    image: row.image || '',
    images: row.image ? [row.image] : [],
    amenities: [],
    lighting: 0,
    grassQuality: 0,
    lockerRoomQuality: 0,
    goalQuality: 0,
    occupancy: 0,
    // Koordinat yoksa sahte Ordu-merkez varsayılanı basma → undefined (yalancı pin yok).
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: row.latitude, lng: row.longitude }
        : undefined,
    slots: [],
    isPublished: row.is_published,
    ...(row.isDemo ? { isDemo: true } as { isDemo?: boolean } : {}),
  };
}

// IP-22: tesis onayı diye bir kavram yok. Süzgeç artık VİTRİN durumudur:
// tesis oyuncuya görünüyor mu, yoksa gizli mi.
export type PitchStatusFilter = 'ALL' | 'published' | 'hidden';

export const PITCH_STATUS_FILTERS: Array<{ id: PitchStatusFilter; label: string }> = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'published', label: 'Vitrinde' },
  { id: 'hidden', label: 'Gizli' },
];
