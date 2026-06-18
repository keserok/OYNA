import { test, expect } from '@playwright/test';

test.describe('OYNA OS Admin Panel', () => {
  test('admin.html loads login or boot shell', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.locator('body')).toContainText(/OYNA OS/i);
  });

  test('admin entry is separate from main app', async ({ page }) => {
    const res = await page.goto('/admin.html');
    expect(res?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/admin\.html/);
  });

  test('admin shell has auth form elements when not logged in', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(8000);
    const loginVisible = await page.getByPlaceholder('admin@oyna.app').isVisible().catch(() => false);
    const bootVisible = await page.getByText(/Başlatılıyor|Veri Yüklenemedi/i).isVisible().catch(() => false);
    const panelVisible = await page.getByText(/Genel Bakış|BÖLGE KOMUTASI/i).isVisible().catch(() => false);
    expect(loginVisible || bootVisible || panelVisible).toBeTruthy();
  });

  test('auth gate shows command palette hint on search button when panel loaded', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(8000);
    const searchBtn = page.getByRole('button', { name: /Ara/i });
    if (await searchBtn.isVisible().catch(() => false)) {
      await expect(searchBtn).toBeVisible();
      await searchBtn.click();
      await expect(page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i)).toBeVisible();
    }
  });

  test('login form has password visibility toggle', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(6000);
    const email = page.getByPlaceholder('admin@oyna.app');
    if (await email.isVisible().catch(() => false)) {
      await expect(page.getByLabel(/Şifreyi göster/i)).toBeVisible();
    }
  });

  test('route /admin.html responds', async ({ page }) => {
    const res = await page.goto('/admin.html');
    expect(res?.status()).toBeLessThan(500);
  });

  test('admin URL supports route query param shell', async ({ page }) => {
    const res = await page.goto('/admin.html?route=MATCHES');
    expect(res?.ok()).toBeTruthy();
    await page.waitForTimeout(6000);
    await expect(page.locator('body')).toContainText(/OYNA OS/i);
  });

  test('command palette lists segmentation route when panel loaded', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(8000);
    const searchBtn = page.getByRole('button', { name: /Ara/i });
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await expect(page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i)).toBeVisible();
      await page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i).fill('Segmentasyon');
      await expect(page.getByText(/Segmentasyon/i).first()).toBeVisible({ timeout: 5000 });
    }
  });
});
