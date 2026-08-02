import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── HARİTA KARO BELLEĞİ — zayıf cihaz koruması ──────────────────────────────
//
// NEDEN VAR: Harita karoları ekranda birer <img>'dir ve tarayıcı bunları AÇILMIŞ
// hâlde bellekte tutar; maliyet "en × boy × 4 bayt"tır. Retina karo (512×512)
// normal karonun (256×256) DÖRT KATI yer kaplar. Leaflet ayrıca görünen alanın
// `keepBuffer` kadar dışındaki karoları da atmadan saklar.
//
// İkisi birleşince zayıf bir telefonda YALNIZ harita yüzünden yüzlerce MB'a
// çıkılabiliyordu (keepBuffer=8 + retina → en kötü hâlde ~380 karo × 1,05 MB).
// Android bellek daralınca en çok yer tutan uygulamayı öldürür — kullanıcının
// gördüğü şey "uygulama kendi kendine kapandı" olur.
//
// Bu test korumanın DEVREDE olduğunu sabitler. Ölçüm tarayıcıda değil burada
// yapılır çünkü görsel test ortamı `deviceScaleFactor: 1` ile çalışır — orada
// Leaflet retina karo hiç istemez ve test hiçbir şey kanıtlamaz (denendi:
// koruma kapatıldığında da yeşil kalıyordu).

/** navigator sinyallerini ayarlayıp mapBase'i YENİDEN yükler.
 *  `zayifCihaz` modül yüklenirken bir kez hesaplandığı için sıra önemli. */
async function mapBaseYukle(sinyaller: { cores?: number; memory?: number }) {
  vi.resetModules();
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    value: sinyaller.cores, configurable: true,
  });
  Object.defineProperty(navigator, 'deviceMemory', {
    value: sinyaller.memory, configurable: true,
  });
  return import('../../components/map/mapBase');
}

afterEach(() => {
  vi.resetModules();
});

describe('harita karo belleği — zayıf cihaz koruması', () => {
  it('zayıf cihazda retina karo İSTENMEZ (karo başına 4 kat bellek)', async () => {
    const { OYNA_TILE_URL } = await mapBaseYukle({ cores: 8, memory: 4 });
    expect(OYNA_TILE_URL).not.toContain('{r}');
    expect(OYNA_TILE_URL).toContain('/{z}/{x}/{y}.png');
  });

  it('zayıf cihazda saklanan karo tamponu daraltılır', async () => {
    const { oynaTileProps } = await mapBaseYukle({ cores: 8, memory: 4 });
    expect(oynaTileProps.keepBuffer).toBe(1);
    // Gezinme bitene kadar yeni karo isteme — yüzlerce karo açıp atmayı önler.
    expect(oynaTileProps.updateWhenIdle).toBe(true);
  });

  it('güçlü cihazda kalite KORUNUR (retina + geniş tampon)', async () => {
    const { OYNA_TILE_URL, oynaTileProps } = await mapBaseYukle({ cores: 8, memory: 8 });
    expect(OYNA_TILE_URL).toContain('{r}');
    expect(oynaTileProps.keepBuffer).toBe(8);
    expect(oynaTileProps.updateWhenIdle).toBe(false);
  });

  it('az çekirdekli cihaz da zayıf sayılır', async () => {
    const { oynaTileProps } = await mapBaseYukle({ cores: 4, memory: 8 });
    expect(oynaTileProps.keepBuffer).toBe(1);
  });

  it('sinyal yoksa güçlü varsayılır — iyi telefon kalite kaybetmez', async () => {
    const { OYNA_TILE_URL, oynaTileProps } = await mapBaseYukle({ cores: undefined, memory: undefined });
    expect(OYNA_TILE_URL).toContain('{r}');
    expect(oynaTileProps.keepBuffer).toBe(8);
  });

  it('yasal atıf her koşulda korunur (OSM + CARTO gizlenemez)', async () => {
    const zayif = await mapBaseYukle({ cores: 8, memory: 4 });
    const guclu = await mapBaseYukle({ cores: 8, memory: 8 });
    for (const m of [zayif, guclu]) {
      expect(m.oynaTileProps.attribution).toContain('OpenStreetMap');
      expect(m.oynaTileProps.attribution).toContain('CARTO');
    }
  });
});
