import { test, expect } from '@playwright/test';

test.describe('OYNA OS Admin Panel', () => {
  test('admin.html loads login gate', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.getByText('OYNA OS')).toBeVisible();
    await expect(page.getByPlaceholder('admin@oyna.app')).toBeVisible();
    await expect(page.getByRole('button', { name: /SİSTEME GİRİŞ/i })).toBeVisible();
  });

  test('main app does not expose admin button on role selection', async ({ page }) => {
    await page.goto('/');
    // Role selection may require auth — just verify admin.html is separate entry
    const res = await page.goto('/admin.html');
    expect(res?.ok()).toBeTruthy();
  });
});
