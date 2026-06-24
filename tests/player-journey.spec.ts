import { test, expect } from '@playwright/test';

/**
 * Oyuncu Temel Yolculuğu: Maç Keşfet → Detay Ekranı
 *
 * Ödeme ve QR check-in adımları, gerçek Supabase kaydı gerektirdiği için
 * bu spec'te navigation + ekran render doğrulaması yapılır.
 * Seed data ile test ortamı kurulduğunda tam akış genişletilebilir.
 */
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

  test('Rol seçimi → Misafir girişi → Dashboard görünür', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Rol seçimi ekranı
    const playerCard = page.getByRole('heading', { name: 'OYUNCU', exact: true });
    await expect(playerCard).toBeVisible({ timeout: 15000 });
    await playerCard.click({ force: true });

    // 2. Misafir girişi
    const guestBtn = page.locator('#guest-login-button');
    await expect(guestBtn).toBeVisible({ timeout: 15000 });
    await guestBtn.click({ force: true });

    // 3. Dashboard yüklenmiş
    await expect(page.locator('body')).toContainText('Ana Sayfa', { timeout: 15000 });
  });

  test('Dashboard → Maç Keşfet ekranı açılır ve yüklenir', async ({ page }) => {
    test.setTimeout(60000);

    // Ortak setup: rol seçimi + misafir girişi
    const playerCard = page.getByRole('heading', { name: 'OYUNCU', exact: true });
    await expect(playerCard).toBeVisible({ timeout: 15000 });
    await playerCard.click({ force: true });

    const guestBtn = page.locator('#guest-login-button');
    await expect(guestBtn).toBeVisible({ timeout: 15000 });
    await guestBtn.click({ force: true });

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

    const playerCard = page.getByRole('heading', { name: 'OYUNCU', exact: true });
    await expect(playerCard).toBeVisible({ timeout: 15000 });
    await playerCard.click({ force: true });

    const guestBtn = page.locator('#guest-login-button');
    await expect(guestBtn).toBeVisible({ timeout: 15000 });
    await guestBtn.click({ force: true });

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
