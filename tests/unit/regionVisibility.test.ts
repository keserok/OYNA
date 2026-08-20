import { describe, it, expect } from 'vitest';
import {
  buildVisibilityScope, isPlaceVisible, UNRESTRICTED_SCOPE,
  type RegionVisibilityRuleRow,
} from '../../services/regionVisibilityService';

// ─── BÖLGE GÖRÜNÜRLÜK KURALLARI (20 Ağu 2026) ───────────────────────────────
//
// Kurucu senaryosu birebir: "Beşiktaş'taki kullanıcı Sarıyer'deki maçları
// görsün ama Beylikdüzü'ndekileri görmesin." Kritik güvence FAIL-OPEN:
// kural/bölge bilgisi yoksa süzgeç HİÇBİR şeyi gizlemez — yanlış yapılandırma
// vitrini boşaltamaz.

const KURAL: RegionVisibilityRuleRow[] = [
  { city: 'İstanbul', district: 'Beşiktaş', visible_city: 'İstanbul', visible_district: 'Sarıyer' },
  { city: 'İstanbul', district: 'Beşiktaş', visible_city: 'İstanbul', visible_district: 'Şişli' },
];

describe('Bölge görünürlüğü — kurucu senaryosu', () => {
  it('Beşiktaş kullanıcısı Sarıyer maçını GÖRÜR, Beylikdüzü maçını GÖRMEZ', () => {
    const scope = buildVisibilityScope([{ city: 'İstanbul', district: 'Beşiktaş' }], KURAL);
    expect(scope.restricted).toBe(true);
    expect(isPlaceVisible(scope, 'İstanbul', 'Sarıyer')).toBe(true);
    expect(isPlaceVisible(scope, 'İstanbul', 'Beylikdüzü')).toBe(false);
  });

  it('kendi ilçesi izin listesine yazılmasa da HER ZAMAN görünür', () => {
    const scope = buildVisibilityScope([{ city: 'İstanbul', district: 'Beşiktaş' }], KURAL);
    expect(isPlaceVisible(scope, 'İstanbul', 'Beşiktaş')).toBe(true);
  });

  it('il bilgisi olmayan maç satırı (yalnız pitch_district) ilçe adına göre süzülür', () => {
    const scope = buildVisibilityScope([{ city: 'İstanbul', district: 'Beşiktaş' }], KURAL);
    // get_nearby_matches pitch_city döndürmez — ilçe-adı yedeği devrede.
    expect(isPlaceVisible(scope, undefined, 'Sarıyer')).toBe(true);
    expect(isPlaceVisible(scope, undefined, 'Beylikdüzü')).toBe(false);
  });

  it('büyük/küçük harf ve Türkçe İ/ı farkları eşleşmeyi bozmaz', () => {
    const scope = buildVisibilityScope([{ city: 'İSTANBUL', district: 'BEŞİKTAŞ' }], KURAL);
    expect(scope.restricted).toBe(true);
    expect(isPlaceVisible(scope, 'istanbul', 'SARIYER')).toBe(true);
  });
});

describe('Bölge görünürlüğü — fail-open güvenceleri', () => {
  it('kuralsız ilçe seçimi → kısıtlama YOK', () => {
    const scope = buildVisibilityScope([{ city: 'İstanbul', district: 'Kadıköy' }], KURAL);
    expect(scope.restricted).toBe(false);
    expect(isPlaceVisible(scope, 'İstanbul', 'Beylikdüzü')).toBe(true);
  });

  it('kurallı + kuralsız bölge birlikte seçiliyse kısıt uygulanmaz (hangi maç hangi bölgeden geldi bilinemez)', () => {
    const scope = buildVisibilityScope(
      [{ city: 'İstanbul', district: 'Beşiktaş' }, { city: 'İstanbul', district: 'Kadıköy' }],
      KURAL,
    );
    expect(scope.restricted).toBe(false);
  });

  it('il-geneli seçim (ilçesiz) → kısıtlama YOK', () => {
    const scope = buildVisibilityScope([{ city: 'İstanbul', district: null }], KURAL);
    expect(scope.restricted).toBe(false);
  });

  it('hiç bölge seçilmemişse (GPS keşfi) → kısıtlama YOK', () => {
    expect(buildVisibilityScope([], KURAL).restricted).toBe(false);
  });

  it('ilçesi bilinmeyen maç/saha kaydı GİZLENMEZ', () => {
    const scope = buildVisibilityScope([{ city: 'İstanbul', district: 'Beşiktaş' }], KURAL);
    expect(isPlaceVisible(scope, null, null)).toBe(true);
    expect(isPlaceVisible(scope, 'İstanbul', '')).toBe(true);
  });

  it('UNRESTRICTED_SCOPE her şeyi gösterir', () => {
    expect(isPlaceVisible(UNRESTRICTED_SCOPE, 'X', 'Y')).toBe(true);
  });

  it('iki kurallı bölge seçiliyse izinler BİRLEŞİR', () => {
    const kurallar: RegionVisibilityRuleRow[] = [
      ...KURAL,
      { city: 'İstanbul', district: 'Kadıköy', visible_city: 'İstanbul', visible_district: 'Üsküdar' },
    ];
    const scope = buildVisibilityScope(
      [{ city: 'İstanbul', district: 'Beşiktaş' }, { city: 'İstanbul', district: 'Kadıköy' }],
      kurallar,
    );
    expect(scope.restricted).toBe(true);
    expect(isPlaceVisible(scope, 'İstanbul', 'Sarıyer')).toBe(true);   // Beşiktaş kuralından
    expect(isPlaceVisible(scope, 'İstanbul', 'Üsküdar')).toBe(true);   // Kadıköy kuralından
    expect(isPlaceVisible(scope, 'İstanbul', 'Kadıköy')).toBe(true);   // kendi ilçesi
    expect(isPlaceVisible(scope, 'İstanbul', 'Beylikdüzü')).toBe(false);
  });
});
