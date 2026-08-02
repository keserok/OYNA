import { test, expect } from '@playwright/test';
import { hazirla, ekranaGit, oturmasiniBekle } from './harness';

// ─── Saha Keşfi haritası — duman testi ───────────────────────────────────────
//
// NEDEN VAR: Keşif haritası MapLibre'den (WebGL/vektör) Leaflet'e (raster)
// taşındı. Tip kontrolü bu taşımanın DERLENDİĞİNİ söyler, ÇALIŞTIĞINI söylemez:
// yanlış bir prop ya da eksik bir katman ancak tarayıcıda ortaya çıkar ve
// ekran sessizce boş kalır. Bu test o boşluğu kapatır — harita gerçek
// Chromium'da kurulur, pinler sayılır ve konsola hata düşmediği doğrulanır.
//
// AĞ KAPALI (harness): karo (tile) görüntüleri gelmez, gelmesi de gerekmez.
// Doğrulanan şey haritanın KURULMASI ve pinlerin doğru sayıda basılmasıdır.

/**
 * Harness her Supabase sorgusuna BOŞ liste döndürür (bilerek — boş-durum
 * ekranları için). Harita pini olmadan bu test bir şey kanıtlamaz; bu yüzden
 * yalnız `pitches` sorgusu koordinatlı iki sahayla karşılanır.
 */
async function ikiSahaTohumla(page: import('@playwright/test').Page) {
  const saha = (id: string, ad: string, lat: number, lng: number) => ({
    id, name: ad, district: 'Altınordu', city: 'Ordu',
    latitude: lat, longitude: lng,
    is_open: true, is_published: true,
    rating: 4.6, images: [], amenities: [], courts: [], pitch_tariffs: [],
  });
  await page.route('**/rest/v1/pitches*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        saha('saha-1', 'Yeşil Vadi Halı Saha', 40.9839, 37.8764),
        saha('saha-2', 'Sahil Spor Tesisleri', 40.9921, 37.8688),
      ]),
    }),
  );
}

test.describe('Saha Keşfi haritası', () => {
  test('Leaflet haritası kurulur, pinler basılır, konsol temiz kalır', async ({ page }) => {
    const konsolHatalari: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') konsolHatalari.push(m.text()); });
    page.on('pageerror', (e) => konsolHatalari.push(String(e)));

    await hazirla(page);
    await ikiSahaTohumla(page);
    await ekranaGit(page, 'PITCH_DISCOVERY');
    await expect(page.getByText(/TESİS BULUNDU/i)).toBeVisible();

    // Liste → Harita geçişi
    await page.getByRole('button', { name: /^Harita$/ }).click();

    // 1) Harita kabı kuruldu mu?
    const harita = page.locator('.leaflet-container');
    await expect(harita).toBeVisible();

    // 2) Karo katmanı bağlandı mı? (görüntü gelmese de <img> düğümleri doğar)
    await expect(page.locator('.leaflet-tile-pane')).toHaveCount(1);

    // 3) Yasal atıf görünür mü? (OSM + CARTO — gizlenmesi yasak)
    await expect(page.locator('.leaflet-control-attribution')).toContainText(/OpenStreetMap/i);

    // 4) Pinler basıldı mı? Başlangıç zoom'u 13, eşik 12,5 → ad balonu modu.
    //    NOT: `.oyna-dpin` kökü BİLEREK 0×0'dır (pini koordinata çivileyen
    //    desen); görünen parça balonun kendisidir, ölçüm ona yapılır.
    const balonlar = page.locator('.oyna-dpin .pin-bubble');
    await expect(balonlar.first()).toBeVisible();
    await expect(balonlar).toHaveCount(2); // tohumlanan iki saha

    // 5) Pin gerçekten saha ADINI taşıyor mu (boş balon değil)?
    await expect(balonlar.first().locator('.pin-name')).toHaveText(/Yeşil Vadi|Sahil Spor/);

    // 6) Pin koordinata çivili mi? Kök tam olarak 0×0 olmalı — büyürse
    //    Leaflet pini kendi kutusuna göre yerleştirir ve zoom'da kayar.
    const kokKutu = await page.locator('.oyna-dpin').first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    });
    expect(kokKutu).toEqual({ w: 0, h: 0 });

    // 7) Pine dokunmak sahayı seçer → alt kart karuseli açılır.
    await balonlar.first().click();
    await expect(page.locator('.oyna-map-carousel')).toBeVisible();
    await expect(page.locator('.oyna-dpin .pin-bubble.selected')).toHaveCount(1);

    await oturmasiniBekle(page);
    expect(konsolHatalari, `Konsol hataları:\n${konsolHatalari.join('\n')}`).toEqual([]);
  });
});
