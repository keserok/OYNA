import { describe, it, expect } from 'vitest';
import {
  derivePitchFilterOptions,
  filterAndSortPitches,
  pitchInSelectedRegions,
  type FilterAndSortInput,
  type PitchFilterCriteria,
} from '../../services/pitchFilterService';
import type { Pitch, Court } from '../../types';

// ─── Test yardımcıları: gerçekçi minimal Pitch üreticisi ─────────────────────
let seq = 0;
const court = (type: 'OPEN' | 'CLOSED'): Court => ({
  id: `c${seq++}`, name: type, type, surface: 'TURF', price: 1000, slots: [],
  lighting: 0, grassQuality: 0, lockerRoomQuality: 0,
});

const mk = (over: Partial<Pitch> = {}): Pitch => ({
  id: `p${seq++}`,
  name: over.name ?? 'Saha',
  district: over.district ?? 'Altınordu',
  city: over.city ?? 'Ordu',
  location: '',
  distance: '',
  rating: over.rating ?? 4.0,
  ratingCount: over.ratingCount ?? 0,
  googleRating: 0,
  googleReviews: 0,
  pricePerPerson: 0,
  totalPrice: over.totalPrice ?? 1000,
  image: '',
  images: [],
  description: '',
  amenities: over.amenities ?? [],
  lighting: 0,
  grassQuality: 0,
  lockerRoomQuality: 0,
  goalQuality: 0,
  occupancy: 50,
  coordinates: over.coordinates,
  slots: [],
  courts: over.courts ?? [court('CLOSED')],
  isApproved: over.isApproved ?? true,
  isFeatured: over.isFeatured ?? false,
  flashDiscount: over.flashDiscount,
  workingHours: { open: '09:00', close: '23:00', slotDuration: 60 },
  tariffs: [],
  ...over,
});

const baseInput = (pitches: Pitch[], over: Partial<FilterAndSortInput> = {}): FilterAndSortInput => ({
  pitches,
  searchQuery: '',
  filters: { district: 'Tümü', minRating: 0, maxPrice: null, hasAmenities: [], type: 'Tümü' },
  sortOrder: 'DEFAULT',
  favorites: new Set(),
  favOnly: false,
  onlyDiscounted: false,
  selectedRegions: [],
  mapCenter: [40.98, 37.88],
  userLocation: null,
  ...over,
});

const ids = (ps: Pitch[]) => ps.map((p) => p.id);

// ═══════════════════════════════════════════════════════════════════════════
describe('derivePitchFilterOptions — seçenekler gerçek veriden', () => {
  it('ilçe sayaçları doğru ve sayıya göre azalan sırada', () => {
    const opts = derivePitchFilterOptions([
      mk({ district: 'Altınordu' }), mk({ district: 'Altınordu' }), mk({ district: 'Ünye' }),
    ]);
    expect(opts.districtOptions).toEqual([
      { name: 'Altınordu', count: 2 },
      { name: 'Ünye', count: 1 },
    ]);
  });

  it('fiyat sınırı 50₺ adımına yuvarlanır; fiyatsız (0₺) sahalar sayılmaz', () => {
    const opts = derivePitchFilterOptions([
      mk({ totalPrice: 920 }), mk({ totalPrice: 2380 }), mk({ totalPrice: 0 }),
    ]);
    expect(opts.priceBounds).toEqual({ min: 900, max: 2400 });
  });

  it('hiç fiyat yoksa priceBounds null', () => {
    expect(derivePitchFilterOptions([mk({ totalPrice: 0 })]).priceBounds).toBeNull();
  });

  it('olanaklar legacy yazımı kanonikleştirip birleştirir + sayar', () => {
    const opts = derivePitchFilterOptions([
      mk({ amenities: ['Otopark', 'Dus'] }), // 'Dus' → 'Duş'
      mk({ amenities: ['Otopark', 'Duş'] }),
    ]);
    const map = Object.fromEntries(opts.amenityOptions.map((a) => [a.value, a.count]));
    expect(map['Otopark']).toBe(2);
    expect(map['Duş']).toBe(2);
    expect(map['Dus']).toBeUndefined();
  });

  it('tip sayaçları kortlardan; discountCount flashDiscount olanları sayar', () => {
    const opts = derivePitchFilterOptions([
      mk({ courts: [court('CLOSED'), court('OPEN')] }),
      mk({ courts: [court('OPEN')], flashDiscount: 20 }),
    ]);
    expect(opts.typeCounts).toEqual({ Kapalı: 1, Açık: 2 });
    expect(opts.discountCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('filterAndSortPitches — filtreler', () => {
  it('arama Türkçe İ/ı duyarlı ("IŞIK" → "Işık Arena")', () => {
    const ps = [mk({ name: 'Işık Arena' }), mk({ name: 'Yıldız Saha' })];
    const out = filterAndSortPitches(baseInput(ps, { searchQuery: 'IŞIK' }));
    expect(ids(out)).toEqual([ps[0].id]);
  });

  it('arama "İSTANBUL" büyük İ ile ilçede eşleşir', () => {
    const ps = [mk({ district: 'İstanbul', name: 'A' }), mk({ district: 'Ordu', name: 'B' })];
    const out = filterAndSortPitches(baseInput(ps, { searchQuery: 'İSTANBUL' }));
    expect(ids(out)).toEqual([ps[0].id]);
  });

  it('maxPrice sınırı: sınır değerdeki saha kalır, üstü elenir; 0₺ (bilinmeyen) asla elenmez', () => {
    const ps = [mk({ totalPrice: 900 }), mk({ totalPrice: 920 }), mk({ totalPrice: 1500 }), mk({ totalPrice: 0 })];
    const out = filterAndSortPitches(baseInput(ps, {
      filters: { district: 'Tümü', minRating: 0, maxPrice: 920, hasAmenities: [], type: 'Tümü' },
    }));
    expect(ids(out).sort()).toEqual([ps[0].id, ps[1].id, ps[3].id].sort());
  });

  it('minRating: puansız (sahte 5.0 default dahil) ve düşük saha elenir', () => {
    // V-2: yalnız GERÇEK değerlendirmesi (ratingCount>0) olan saha puan filtresine
    // girer. pitches.rating DEFAULT 5.0 olduğundan ratingCount=0 sahte 5.0 elenmeli.
    const ps = [
      mk({ rating: 4.6, ratingCount: 12 }), // gerçek 4.6 → geçer
      mk({ rating: 3.2, ratingCount: 5 }),  // gerçek ama düşük → elenir
      mk({ rating: 0, ratingCount: 0 }),    // puansız → elenir
      mk({ rating: 5.0, ratingCount: 0 }),  // sahte 5.0 default → elenir
    ];
    const out = filterAndSortPitches(baseInput(ps, {
      filters: { district: 'Tümü', minRating: 4.0, maxPrice: null, hasAmenities: [], type: 'Tümü' },
    }));
    expect(ids(out)).toEqual([ps[0].id]);
  });

  it('olanak filtresi VE-kesişimi; legacy yazım eşleşir', () => {
    const ps = [
      mk({ amenities: ['Otopark', 'Dus'] }), // Duş(normalize) + Otopark
      mk({ amenities: ['Otopark'] }),
    ];
    const out = filterAndSortPitches(baseInput(ps, {
      filters: { district: 'Tümü', minRating: 0, maxPrice: null, hasAmenities: ['Otopark', 'Duş'], type: 'Tümü' },
    }));
    expect(ids(out)).toEqual([ps[0].id]);
  });

  it('saha tipi: Kapalı yalnız kapalı kortu olanı verir; kortsuz saha elenir', () => {
    const ps = [
      mk({ courts: [court('CLOSED')] }),
      mk({ courts: [court('OPEN')] }),
      mk({ courts: [] }),
    ];
    const out = filterAndSortPitches(baseInput(ps, {
      filters: { district: 'Tümü', minRating: 0, maxPrice: null, hasAmenities: [], type: 'Kapalı' },
    }));
    expect(ids(out)).toEqual([ps[0].id]);
  });

  it('onlyDiscounted yalnız flashDiscount olanları verir', () => {
    const ps = [mk({ flashDiscount: 15 }), mk({})];
    const out = filterAndSortPitches(baseInput(ps, { onlyDiscounted: true }));
    expect(ids(out)).toEqual([ps[0].id]);
  });

  it('favOnly yalnız favori id kümesini verir', () => {
    const ps = [mk({}), mk({})];
    const out = filterAndSortPitches(baseInput(ps, { favOnly: true, favorites: new Set([ps[1].id]) }));
    expect(ids(out)).toEqual([ps[1].id]);
  });

  it('onaysız saha (isApproved=false) her zaman elenir', () => {
    const ps = [mk({ isApproved: false }), mk({})];
    const out = filterAndSortPitches(baseInput(ps));
    expect(ids(out)).toEqual([ps[1].id]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('pitchInSelectedRegions — il/ilçe kapsamı', () => {
  it('boş bölge → hepsi kapsanır', () => {
    expect(pitchInSelectedRegions({ city: 'Ordu', district: 'Ünye' }, [])).toBe(true);
  });

  it('ilçe seçili: aynı ad farklı ilde çakışmaz (şehir doğrulanır)', () => {
    const region = [{ city: 'Ordu', district: 'Merkez' }];
    expect(pitchInSelectedRegions({ city: 'Ordu', district: 'Merkez' }, region)).toBe(true);
    expect(pitchInSelectedRegions({ city: 'Samsun', district: 'Merkez' }, region)).toBe(false);
  });

  it('il geneli seçili: o ilin ilçesindeki saha kapsanır (şehir alanı null olsa da TURKEY_REGIONS ile)', () => {
    const region = [{ city: 'Ordu', district: null }];
    expect(pitchInSelectedRegions({ city: 'Ordu', district: 'Ünye' }, region)).toBe(true);
    expect(pitchInSelectedRegions({ city: null, district: 'Ünye' }, region)).toBe(true); // Ünye ∈ Ordu
    expect(pitchInSelectedRegions({ city: null, district: 'Kadıköy' }, region)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('filterAndSortPitches — sıralama', () => {
  it('PRICE_ASC artan fiyat', () => {
    const ps = [mk({ totalPrice: 1500 }), mk({ totalPrice: 900 }), mk({ totalPrice: 1200 })];
    const out = filterAndSortPitches(baseInput(ps, { sortOrder: 'PRICE_ASC' }));
    expect(out.map((p) => p.totalPrice)).toEqual([900, 1200, 1500]);
  });

  it('RATING_DESC azalan puan', () => {
    const ps = [mk({ rating: 4.1 }), mk({ rating: 4.9 }), mk({ rating: 4.5 })];
    const out = filterAndSortPitches(baseInput(ps, { sortOrder: 'RATING_DESC' }));
    expect(out.map((p) => p.rating)).toEqual([4.9, 4.5, 4.1]);
  });

  it('Önerilen + konum YOK → alfabetik (tr-TR: Çınar, Işık, Zafer)', () => {
    const ps = [mk({ name: 'Zafer' }), mk({ name: 'Işık' }), mk({ name: 'Çınar' })];
    const out = filterAndSortPitches(baseInput(ps, { sortOrder: 'DEFAULT', userLocation: null }));
    expect(out.map((p) => p.name)).toEqual(['Çınar', 'Işık', 'Zafer']);
  });

  it('Önerilen + konum VAR → yakınlığa göre; koordinatsız sona', () => {
    const near = mk({ name: 'Yakın', coordinates: { lat: 40.98, lng: 37.88 } });
    const far = mk({ name: 'Uzak', coordinates: { lat: 41.5, lng: 38.5 } });
    const noCoord = mk({ name: 'Konumsuz', coordinates: undefined });
    const out = filterAndSortPitches(baseInput([far, noCoord, near], {
      sortOrder: 'DEFAULT',
      userLocation: { lat: 40.98, lng: 37.88 },
      mapCenter: [40.98, 37.88],
    }));
    expect(out.map((p) => p.name)).toEqual(['Yakın', 'Uzak', 'Konumsuz']);
  });

  it('Öne Çıkan sıralamayı ETKİLEMEZ (artık yalnız görsel rozet)', () => {
    const ps = [
      mk({ name: 'Bravo', isFeatured: false, totalPrice: 900 }),
      mk({ name: 'Alfa', isFeatured: true, totalPrice: 1500 }),
    ];
    // PRICE_ASC: featured olsa da ucuz olan (Bravo) önce gelir
    const out = filterAndSortPitches(baseInput(ps, { sortOrder: 'PRICE_ASC' }));
    expect(out.map((p) => p.name)).toEqual(['Bravo', 'Alfa']);
  });
});
