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

// ═══════════════════════════════════════════════════════════════════════════
// TELEFON SAĞLAYICISI KAPALIYKEN ÇIKIŞ YOLU (20 Ağustos 2026)
//
// Supabase'de Phone sağlayıcısı kapalıyken `signInWithOtp` şunu döndürür:
//   400 { "error_code": "phone_provider_disabled" }
// Bu desen haritalanmamıştı; kullanıcı genel yedeği görüyordu:
//   "Doğrulama kodu gönderilemedi. Lütfen tekrar deneyin."
// Yani ekran, ASLA çalışmayacak bir eylemi öneriyordu — bölge çıkmazının
// aynısı. Giriş ekranında Google ve Apple ZATEN birincil düğmeler; hata
// metni kullanıcıyı oraya yollamalı.
// ═══════════════════════════════════════════════════════════════════════════
describe('Giriş · telefon kapalıyken çalışan yolu gösterir', () => {
  it('phone_provider_disabled ÇIKMAZ metne düşmüyor', () => {
    const s = oku('utils/errorMap.ts');
    expect(s).toContain('phone_provider_disabled');
    // Yorumda da geçiyor; ARANAN, haritadaki kayıt satırı.
    const bas = s.indexOf('[/phone_provider_disabled');
    expect(bas, 'harita kaydı bulunamadı').toBeGreaterThan(-1);
    const kayit = s.slice(bas, bas + 260);
    expect(kayit, 'kullanıcı çalışan yola yönlendirilmiyor').toMatch(/Google/);
    expect(kayit).toMatch(/Apple/);
    expect(kayit, '"tekrar dene" bu hatada yanlış öneri').not.toMatch(/tekrar dene/i);
  });

  it('sosyal giriş ekranın TEK yolu — yönlendirme boşa düşmesin', () => {
    // Hata metni kullanıcıyı "Google veya Apple ile devam et" diye yönlendirir.
    // O cümle ancak ekranda gerçekten o yollar VARSA anlamlıdır.
    // 23 Ağu 2026: telefon alanı silindi, geriye yalnız bu iki düğme kaldı —
    // çapa artık düğmelerin kendisi (eskiden telefon alanının konumuydu).
    const s = oku('views/AuthScreen.tsx');
    expect(s, 'Google düğmesi yok').toContain('onClick={handleGoogleLogin}');
    expect(s, 'Apple düğmesi yok').toContain('onClick={handleAppleLogin}');
    expect(s, 'telefon alanı geri gelmiş').not.toContain('au-phone');
  });
});
