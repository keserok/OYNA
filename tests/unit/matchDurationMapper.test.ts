import { describe, it, expect } from 'vitest';
import { mapFromSnakeCase } from '../../supabaseMutations';
import { formatMatchDuration } from '../../shared/matchTiming';

// ─── MAÇ SÜRESİ EŞLEYİCİ ZİNCİRİ ────────────────────────────────────────────
//
// matches satırı → store (adminMatches) → kart. Zincirin ilk halkası
// `mapFromSnakeCase`; `duration_minutes` burada eşlenmezse kart süreyi hiç
// göremez ve eski kod serbest metne / uydurma '90 Dakika'ya düşerdi.
// Bu test o halkayı kilitler.

describe('mapFromSnakeCase — duration_minutes → durationMinutes', () => {
  it('sunucu satirindaki sureyi camelCase alana tasir', () => {
    const row = mapFromSnakeCase({
      id: 'm1',
      title: 'Akşam Maçı',
      duration_minutes: 90,
      duration: '90 Dakika',
    });
    expect(row.durationMinutes).toBe(90);
  });

  it('tasinan deger dogrudan kart etiketine donusur', () => {
    const row = mapFromSnakeCase({ id: 'm1', duration_minutes: 90 });
    expect(formatMatchDuration(row)).toBe('90 dakika');
  });

  it('60 dakikalik mac kartta 90 GORUNMEZ (eski uydurma yedegin regresyonu)', () => {
    const row = mapFromSnakeCase({ id: 'm1', duration_minutes: 60, duration: '60 Dakika' });
    expect(formatMatchDuration(row)).toBe('60 dakika');
  });

  it('sure yoksa alan uretilmez → kart etiketi hic cizilmez', () => {
    const row = mapFromSnakeCase({ id: 'm1', duration: '90 Dakika' });
    expect(row.durationMinutes).toBeUndefined();
    expect(formatMatchDuration(row)).toBeNull();
  });

  it('mevcut eslemeler bozulmadi (regresyon emniyeti)', () => {
    const row = mapFromSnakeCase({ owner_id: 'u1', working_hours: [], total_price: 100 });
    expect(row.ownerId).toBe('u1');
    expect(row.workingHours).toEqual([]);
    expect(row.totalPrice).toBe(100);
  });
});
