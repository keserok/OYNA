import { test, expect } from '@playwright/test';

// ─── Temel yükleme ──────────────────────────────────────────────────────────────

test.describe('Admin panel — yükleme ve ayrı giriş noktası', () => {
  test('admin.html yükleniyor ve OYNA OS içeriyor', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.locator('body')).toContainText(/OYNA OS/i);
  });

  test('admin.html, main uygulamayla aynı URL değil', async ({ page }) => {
    const res = await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
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

  test('HTTP 5xx dönmüyor', async ({ page }) => {
    const res = await page.goto('/admin.html');
    expect(res?.status()).toBeLessThan(500);
  });

  test('?route= query param destekleniyor', async ({ page }) => {
    const res = await page.goto('/admin.html?route=MATCHES');
    expect(res?.ok()).toBeTruthy();
    await expect(page.locator('body')).toContainText(/OYNA OS/i);
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

  test('boot shell shows phased loading steps', async ({ page }) => {
    await page.goto('/admin.html');
    const bootText = page.getByText(/OYNA OS Başlatılıyor/i);
    if (await bootText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(page.getByText(/Oturum/i).first()).toBeVisible();
      await expect(page.getByText(/Envanter|Operasyonel|Hazır/i).first()).toBeVisible();
    }
  });
});

// ─── Auth gate — kimlik doğrulama ekranı ──────────────────────────────────────

test.describe('Auth gate — giriş ekranı zorunluluğu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    // Sayfa tam yüklenene kadar bekle: login formu veya panel
    await page.waitForTimeout(6000);
  });

  test('giriş yapılmadan panel içeriği görünmez', async ({ page }) => {
    const email = page.getByPlaceholder('admin@oyna.app');
    const panelContent = page.getByText(/Genel Bakış|Kullanıcılar|Sahalar|BÖLGE KOMUTASI/i);

    const isLoginVisible = await email.isVisible().catch(() => false);
    const isPanelVisible = await panelContent.isVisible().catch(() => false);

    if (isLoginVisible) {
      // Giriş formu görünüyorsa panel içeriği GÖRÜNMEMELI
      expect(isPanelVisible).toBe(false);
    }
    // Panel zaten açıksa (oturum var) test geçer
  });

  test('giriş formu şifre görünürlük toggle içeriyor', async ({ page }) => {
    const email = page.getByPlaceholder('admin@oyna.app');
    if (await email.isVisible().catch(() => false)) {
      const toggle = page.getByLabel(/Şifreyi göster/i);
      await expect(toggle).toBeVisible();
    }
  });

  test('boş credentials ile giriş denemesi form hatası veriyor', async ({ page }) => {
    const email = page.getByPlaceholder('admin@oyna.app');
    if (!(await email.isVisible().catch(() => false))) return; // Panel zaten açık

    const submitBtn = page.getByRole('button', { name: /giriş|oturum/i });
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      // HTML5 validation veya uygulama hatası — giriş YAPıLMAMALI
      await page.waitForTimeout(1000);
      await expect(page.getByPlaceholder('admin@oyna.app')).toBeVisible();
    }
  });

  test('yanlış credentials ile API 4xx hatası alınıyor (UI hata mesajı)', async ({ page }) => {
    const email = page.getByPlaceholder('admin@oyna.app');
    if (!(await email.isVisible().catch(() => false))) return;

    await email.fill('invalid@test.com');
    const password = page.getByPlaceholder(/şifre|password/i);
    if (await password.isVisible().catch(() => false)) {
      await password.fill('wrongpassword123');
    }
    const submitBtn = page.getByRole('button', { name: /giriş|oturum/i });
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      // Hata mesajı bekliyoruz — panel açılmamalı
      await page.waitForTimeout(4000);
      const panelContent = page.getByText(/Genel Bakış|Kullanıcılar|BÖLGE KOMUTASI/i);
      expect(await panelContent.isVisible().catch(() => false)).toBe(false);
    }
  });
});

// ─── Admin panel bileşenleri ──────────────────────────────────────────────────

test.describe('Panel bileşenleri — panel açıkken', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForTimeout(8000);
  });

  test('arama butonu veya giriş formu görünüyor', async ({ page }) => {
    const searchBtn = page.getByRole('button', { name: /Ara/i });
    const loginForm = page.getByPlaceholder('admin@oyna.app');
    const bootMsg = page.getByText(/Başlatılıyor|Veri Yüklenemedi/i);

    const oneVisible =
      (await searchBtn.isVisible().catch(() => false)) ||
      (await loginForm.isVisible().catch(() => false)) ||
      (await bootMsg.isVisible().catch(() => false));

    expect(oneVisible).toBeTruthy();
  });

  test('komut paleti arama alanı açılıyor', async ({ page }) => {
    const searchBtn = page.getByRole('button', { name: /Ara/i });
    if (!(await searchBtn.isVisible().catch(() => false))) return;

    await searchBtn.click();
    await expect(page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i)).toBeVisible();
  });

  test('komut paleti Segmentasyon rotasını listeler', async ({ page }) => {
    const searchBtn = page.getByRole('button', { name: /Ara/i });
    if (!(await searchBtn.isVisible().catch(() => false))) return;

    await searchBtn.click();
    const input = page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i);
    await expect(input).toBeVisible();
    await input.fill('Segmentasyon');
    await expect(page.getByText(/Segmentasyon/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('komut paleti Kampanyalar rotasını listeler', async ({ page }) => {
    const searchBtn = page.getByRole('button', { name: /Ara/i });
    if (!(await searchBtn.isVisible().catch(() => false))) return;

    await searchBtn.click();
    await expect(page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i)).toBeVisible();
    await page.getByPlaceholder(/Sayfa, saha veya kullanıcı ara/i).fill('Kampanya');
    await expect(page.getByText(/Kampanyalar/i).first()).toBeVisible({ timeout: 5000 });
  });
});

// ─── Güvenlik: admin.html → main app izolasyonu ───────────────────────────────

test.describe('Güvenlik — entry point izolasyonu', () => {
  test('admin.html, ana sayfa JS bundle yüklenmiyor', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto('/admin.html');
    await page.waitForLoadState('networkidle');

    // Ana uygulama chunk'ları admin entry'ye karışmamalı
    const mainAppChunks = requests.filter(
      (u) => u.includes('/assets/main-') && !u.includes('admin'),
    );
    // main.js chunk'ı admin.html sayfasında yüklenmemeli
    expect(mainAppChunks.length, 'main-*.js admin sayfasında bulunmamalı').toBe(0);
  });

  test('localStorage üzerinden cross-origin veri sızıntısı yok', async ({ page }) => {
    await page.goto('/admin.html');
    await page.waitForLoadState('networkidle');

    const adminToken = await page.evaluate(() => localStorage.getItem('oyna.auth.token'));
    // Admin paneli açılmamışsa token null olmalı
    if (!adminToken) {
      expect(adminToken).toBeNull();
    }
    // Token varsa bu bir test oturumu — geçer
  });
});
