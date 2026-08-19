/**
 * BÖLGE ÇIKIŞ YOLU (19 Ağustos 2026)
 *
 * BULUNAN DURUM: ana sayfanın boş hâli iki farklı sebebi ayırıyordu ama
 * yalnız BİRİNE çıkış yolu veriyordu.
 *
 *   · Kapsam YOK  → "ÖNCE BÖLGENİ SEÇ" + KONUMU AYARLA        ✓ yol var
 *   · Kapsam VAR, sonuç 0 → "BUGÜN YAKININDA MAÇ YOK"
 *       + MAÇ KUR + BU HAFTA                                   ✗ yol yok
 *
 * İkinci hâlde iki düğme de AYNI boş bölgeye bakıyordu ("BU HAFTA" da seçili
 * bölgenin listesini açar). OYNA'nın henüz açılmadığı bir şehirdeki kullanıcı
 * — ve konumuna izin veren bir mağaza incelemecisi — tam olarak burada
 * kalıyordu: uygulama çalışıyor, ekran boş, yapacak bir şey yok.
 *
 * Bu dosya çıkış yolunu kilitler.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Ana sayfa boş hâli · bölge çıkış yolu', () => {
  const s = () => oku('views/Dashboard.tsx');

  it('kapsam varken de bölge değiştirme düğmesi çıkıyor', () => {
    const src = s();
    const bas = src.indexOf('{hasScope ? (');
    expect(bas, 'boş hâl dallanması bulunamadı').toBeGreaterThan(-1);
    const dal = src.slice(bas, src.indexOf(') : (', bas));
    expect(dal, 'kapsam VAR dalında bölge düğmesi yok').toContain('BÖLGE DEĞİŞTİR');
    expect(dal).toContain('onSetLocation');
  });

  it('kapsam yokken tek anlamlı eylem hâlâ konum ayarlamak', () => {
    expect(s()).toContain('KONUMU AYARLA');
  });

  it('üç düğme dar telefonda sarabiliyor', () => {
    // Kapsayıcı satırının kendisi aranır: geriye doğru arama, dosyada birden
    // fazla `{error ? (` olduğu için yanlış bloğu yakalıyordu.
    const satir = s().split('\n').find((l) => l.includes("marginTop: 3, display: 'flex'"));
    expect(satir, 'düğme kapsayıcısı bulunamadı').toBeTruthy();
    expect(satir).toContain('flexWrap');
  });
});

describe('Bölge seçici · aktif bölgeler en üstte', () => {
  const s = () => oku('components/settings/RegionPickerPage.tsx');

  it('aktif il/ilçe çiftleri plaka listesinin ÜSTÜNDE render ediliyor', () => {
    const src = s();
    const aktif = src.indexOf('Şu an aktif');
    const plaka = src.indexOf('{region.plate}');
    expect(aktif, 'aktif bölge bloğu yok').toBeGreaterThan(-1);
    expect(plaka, 'il listesi bulunamadı').toBeGreaterThan(-1);
    expect(aktif, 'aktif blok plaka listesinin altında kalmış').toBeLessThan(plaka);
  });

  it('tek dokunuşla il+ilçe seçiyor — önce ile girmek gerekmiyor', () => {
    const src = s();
    const bas = src.indexOf('Şu an aktif');
    const blok = src.slice(bas, bas + 1400);
    expect(blok).toContain('toggleRegion(city, district)');
  });

  it('aktif liste tek kaynaktan geliyor (kapsam verisi)', () => {
    expect(s()).toContain("coveredRegionPairs");
    expect(oku('data/regionCenters.ts')).toContain('export const coveredRegionPairs');
  });

  it('arama kutusu aktif listeyi de süzüyor', () => {
    const src = s();
    const bas = src.indexOf('const activePairs');
    expect(src.slice(bas, bas + 500)).toContain('query');
  });

  it('kapsam verisi il DEĞİL, il+ilçe döndürüyor', () => {
    const d = oku('data/regionCenters.ts');
    const bas = d.indexOf('export const coveredRegionPairs');
    const govde = d.slice(bas, bas + 400);
    expect(govde).toContain('DISTRICT_CENTERS');
    expect(govde).toContain('district');
  });
});
