import { describe, it, expect } from 'vitest';
import { SURFACE_LABELS, SURFACE_OPTIONS, surfaceLabel } from '../../shared/courtSurface';

describe('courtSurface — tek kaynak zemin etiketleri', () => {
  it('TURF/GRASS oyuncu-dostu terimlerle eşlenir (Halı/Çim)', () => {
    expect(SURFACE_LABELS.TURF).toBe('Halı');
    expect(SURFACE_LABELS.GRASS).toBe('Çim');
  });

  it('surfaceLabel bilinen değeri çözer', () => {
    expect(surfaceLabel('TURF')).toBe('Halı');
    expect(surfaceLabel('PARQUET')).toBe('Parke');
    expect(surfaceLabel('TARTAN')).toBe('Tartan');
  });

  it('boş/null değerde Halı varsayılanına düşer', () => {
    expect(surfaceLabel(null)).toBe('Halı');
    expect(surfaceLabel(undefined)).toBe('Halı');
    expect(surfaceLabel('')).toBe('Halı');
  });

  it('bilinmeyen değeri ham haliyle geri verir (veri kaybı yok)', () => {
    expect(surfaceLabel('CLAY')).toBe('CLAY');
  });

  it('SURFACE_OPTIONS etiketleri SURFACE_LABELS ile birebir tutarlı', () => {
    // Dropdown (owner/admin) ile kart etiketi (oyuncu) aynı sözlükten beslenmeli.
    for (const opt of SURFACE_OPTIONS) {
      expect(opt.label).toBe(SURFACE_LABELS[opt.value]);
    }
    expect(SURFACE_OPTIONS.map((o) => o.value)).toEqual(['TURF', 'GRASS', 'PARQUET', 'TARTAN']);
  });
});
