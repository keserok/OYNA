import { describe, it, expect } from 'vitest';
import { computeShowcaseScore, showcaseReadyBlockers } from '../../services/pitchShowcaseService';
import { splitAmenities, normalizeAmenity } from '../../shared/amenities';
import { transformedImageUrl } from '../../utils/imageTransform';

// ─── Vitrin Skoru (Karar #17) ────────────────────────────────────────────────

const fullPitch = {
  description: 'Kapalı ve açık iki sahası, profesyonel zemin ve ışıklandırması olan tesis.',
  amenities: ['Otopark', 'Duş', 'Kafeterya'],
  images: ['a.jpg', 'b.jpg', 'c.jpg'],
  latitude: 40.98,
  longitude: 37.88,
  courts: [{ is_active: true }],
  pitch_tariffs: [{ is_active: true }],
};

describe('computeShowcaseScore', () => {
  it('eksiksiz profil 100 puan alır ve engelleyici kalmaz', () => {
    const score = computeShowcaseScore(fullPitch as never);
    expect(score.score).toBe(100);
    expect(score.tasks.every((t) => t.done)).toBe(true);
    expect(showcaseReadyBlockers(score)).toHaveLength(0);
  });

  it('boş profil 0 puan alır ve tüm zorunlu şartlar engelleyicidir', () => {
    const score = computeShowcaseScore({} as never);
    expect(score.score).toBe(0);
    // amenities zorunlu değil (skor verir ama onayı engellemez)
    expect(showcaseReadyBlockers(score).map((b) => b.key).sort()).toEqual(
      ['court', 'description', 'photos', 'pin', 'tariff'],
    );
  });

  it('40 karakter altındaki açıklama görev olarak eksik sayılır', () => {
    const score = computeShowcaseScore({ ...fullPitch, description: 'Kısa açıklama' } as never);
    expect(score.tasks.find((t) => t.key === 'description')?.done).toBe(false);
    expect(score.score).toBe(85);
  });

  it('2 fotoğraf yetmez, 3 fotoğraf yeter (Karar #20)', () => {
    const two = computeShowcaseScore({ ...fullPitch, images: ['a.jpg', 'b.jpg'] } as never);
    expect(two.tasks.find((t) => t.key === 'photos')?.done).toBe(false);
    const three = computeShowcaseScore(fullPitch as never);
    expect(three.tasks.find((t) => t.key === 'photos')?.done).toBe(true);
  });

  it('pasif kort/tarife aktif sayılmaz', () => {
    const score = computeShowcaseScore({
      ...fullPitch,
      courts: [{ is_active: false }],
      pitch_tariffs: [{ is_active: false }],
    } as never);
    const blockers = showcaseReadyBlockers(score).map((b) => b.key);
    expect(blockers).toContain('court');
    expect(blockers).toContain('tariff');
  });
});

// ─── Olanak kataloğu (Karar #16) ─────────────────────────────────────────────

describe('splitAmenities', () => {
  it('katalogdakileri ikonlu, bilinmeyenleri Diğer olarak ayırır', () => {
    const { known, other } = splitAmenities(['Otopark', 'Sauna', 'Duş']);
    expect(known.map((k) => k.value)).toEqual(['Otopark', 'Duş']);
    expect(other).toEqual(['Sauna']);
  });

  it('eski yazımları kanonik değere çevirir ve tekrarları eler', () => {
    expect(normalizeAmenity('Dus')).toBe('Duş');
    expect(normalizeAmenity('Kafe')).toBe('Kafeterya');
    const { known, other } = splitAmenities(['Dus', 'Duş', 'Wifi', 'Büfe', 'Kafeterya']);
    expect(known.map((k) => k.value)).toEqual(['Duş', 'WiFi', 'Kafeterya']);
    expect(other).toHaveLength(0);
  });
});

// ─── Görsel türevleri (Karar #7) ─────────────────────────────────────────────

describe('transformedImageUrl', () => {
  const supa = 'https://x.supabase.co/storage/v1/object/public/images/pitches/p1/a.jpg';

  it('Supabase public URL render endpoint + boyut parametrelerine çevrilir', () => {
    const out = transformedImageUrl(supa, 'card');
    expect(out).toContain('/storage/v1/render/image/public/');
    expect(out).toContain('width=640');
  });

  it('Supabase dışı URL olduğu gibi geçer', () => {
    const ext = 'https://images.unsplash.com/photo-1.jpg';
    expect(transformedImageUrl(ext, 'detail')).toBe(ext);
  });

  it('boş değerde boş string döner', () => {
    expect(transformedImageUrl(null, 'thumb')).toBe('');
    expect(transformedImageUrl(undefined, 'card')).toBe('');
  });
});
