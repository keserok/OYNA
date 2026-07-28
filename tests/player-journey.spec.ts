import { test, expect } from '@playwright/test';

/**
 * Oyuncu Temel Yolculuğu: Maç Keşfet → Detay Ekranı
 *
 * Ödeme ve QR check-in adımları, gerçek Supabase kaydı gerektirdiği için
 * bu spec'te navigation + ekran render doğrulaması yapılır.
 * Seed data ile test ortamı kurulduğunda tam akış genişletilebilir.
 */
/**
 * Misafir girişi: splash → TANITIM → giriş formu → "önce göz at".
 * Tanıtım perdesi giriş akışının kapısıdır; form alanları ancak ok düğmesine
 * basınca gelir. Misafir düğmesi KVKK onayı işaretlenene dek pasiftir.
 */
async function enterAsGuest(page: import('@playwright/test').Page) {
  const intro = page.locator('#intro-continue-button');
  await expect(intro).toBeVisible({ timeout: 20000 });
  await intro.click();

  const consent = page.locator('#agreement-checkbox');
  await expect(consent).toBeVisible({ timeout: 15000 });
  await consent.click();

  const guestBtn = page.locator('#guest-login-button');
  await guestBtn.scrollIntoViewIfNeeded();
  await expect(guestBtn).toBeEnabled({ timeout: 15000 });
  await guestBtn.click();
}

test.describe('Oyuncu yolculuğu — Maç keşfet', () => {
  test.beforeEach(async ({ page }) => {
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Tanıtım → Misafir girişi → Dashboard görünür', async ({ page }) => {
    test.setTimeout(60000);

    await enterAsGuest(page);

    // Dashboard yüklenmiş
    await expect(page.locator('body')).toContainText('Ana Sayfa', { timeout: 15000 });
  });

  test('Dashboard → Maç Keşfet ekranı açılır ve yüklenir', async ({ page }) => {
    test.setTimeout(60000);

    // Ortak setup: tanıtım → misafir girişi
    await enterAsGuest(page);

    await expect(page.locator('body')).toContainText('Ana Sayfa', { timeout: 15000 });

    // Dashboard'da "Maçlar" veya "Keşfet" nav butonuna tıkla
    const matchNavBtn = page.locator('button[aria-label="Maçlar"], button[aria-label="Keşfet"], button:has-text("Maçlar")').first();
    await expect(matchNavBtn).toBeVisible({ timeout: 10000 });
    await matchNavBtn.click({ force: true });

    // Maç Keşfet ekranının başlık veya içeriğini doğrula
    await expect(page.locator('body')).toContainText(/Maç|keşfet|MAÇLAR/i, { timeout: 15000 });
  });

  test('Dashboard → Maç Keşfet → Maç varsa detay ekranı açılır', async ({ page }) => {
    test.setTimeout(90000);

    await enterAsGuest(page);

    await expect(page.locator('body')).toContainText('Ana Sayfa', { timeout: 15000 });

    const matchNavBtn = page.locator('button[aria-label="Maçlar"], button[aria-label="Keşfet"], button:has-text("Maçlar")').first();
    await expect(matchNavBtn).toBeVisible({ timeout: 10000 });
    await matchNavBtn.click({ force: true });

    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Maç kartı varsa ilkine tıkla ve detay ekranının açıldığını doğrula
    const firstMatch = page.locator('[data-testid="match-card"], .match-card').first();
    const hasMatches = await firstMatch.isVisible().catch(() => false);

    if (hasMatches) {
      await firstMatch.click({ force: true });
      // Detay veya katılım ekranı
      await expect(page.locator('body')).toContainText(/Katıl|Saha|Ücret|TL|MAÇA KATIL/i, { timeout: 10000 });
    } else {
      // Boş durum veya yükleniyor mesajı da kabul edilir
      const emptyOrLoading = page.locator('body');
      await expect(emptyOrLoading).toContainText(/Maç bulunamadı|Yükleniyor|Henüz|yakında|KEŞFET/i, { timeout: 10000 });
    }
  });
});
