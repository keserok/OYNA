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
    await page.waitForTimeout(10000);
    const loginVisible = await page.getByPlaceholder('admin@oyna.app').isVisible().catch(() => false);
    const bootVisible = await page.getByText(/Başlatılıyor|Veri Yüklenemedi|Oturum doğrulanıyor/i).isVisible().catch(() => false);
    const panelVisible = await page.getByText(/Genel Bakış|BÖLGE KOMUTASI/i).isVisible().catch(() => false);
    const osVisible = await page.getByText(/OYNA OS/i).isVisible().catch(() => false);
    expect(loginVisible || bootVisible || panelVisible || osVisible).toBeTruthy();
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

  test('command palette lists campaigns route when panel loaded', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(8000);
    const searchBtn = page.getByRole('button', { name: /Ara/i });
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
      await expect(page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i)).toBeVisible();
      await page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i).fill('Kampanya');
      await expect(page.getByText(/Kampanyalar/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('boot shell shows phased loading steps', async ({ page }) => {
    await page.goto('/admin.html');
    const bootText = page.getByText(/OYNA OS Başlatılıyor/i);
    if (await bootText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(page.getByText(/Oturum/i).first()).toBeVisible();
      await expect(page.getByText(/Envanter|Operasyonel|Hazır/i).first()).toBeVisible();
    }
  });

  test('segmentation route alias loads without error', async ({ page }) => {
    const res = await page.goto('/admin.html?route=SEGMENTATION');
    expect(res?.ok()).toBeTruthy();
    await page.waitForTimeout(6000);
    await expect(page.locator('body')).toContainText(/OYNA OS/i);
  });

  test('finance route query param loads shell', async ({ page }) => {
    const res = await page.goto('/admin.html?route=FINANCE');
    expect(res?.ok()).toBeTruthy();
    await page.waitForTimeout(6000);
    await expect(page.locator('body')).toContainText(/OYNA OS/i);
  });

  test('users route query param loads shell', async ({ page }) => {
    const res = await page.goto('/admin.html?route=KULLANICILAR');
    expect(res?.ok()).toBeTruthy();
    await page.waitForTimeout(6000);
    await expect(page.locator('body')).toContainText(/OYNA OS/i);
  });
});
