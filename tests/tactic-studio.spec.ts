import { test, expect } from '@playwright/test';

test.describe('OYNA App Taktik Stüdyo ve Takımım Entegrasyonu', () => {
  test('Dashboard -> Profil -> Takımlarım -> Taktik Öner -> Kaydet -> Takımlarımda Öneriyi Gör akışı', async ({ page }) => {
    test.setTimeout(60000);
    // Tarayıcı loglarını ve ağ hatalarını yakala
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));
    page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure()?.errorText));

    // 1. Ana sayfayı yükle
    await page.goto('/');

    // 2. Local storage ve çerezleri temizleyip sayfayı yenileyelim (Temiz bir başlangıç için)
    console.log('Oturum verileri temizleniyor...');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
    
    console.log('Temiz sayfa yükleniyor...');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 3. Splash ekranının geçmesini ve Rol Seçimi ekranının gelmesini bekle
    console.log('Splash ekranının yüklenmesi bekleniyor...');
    const playerCard = page.getByRole('heading', { name: 'OYUNCU', exact: true });
    await expect(playerCard).toBeVisible({ timeout: 15000 });

    // 4. OYUNCU rolünü seç
    console.log('Oyuncu rolü seçiliyor...');
    await playerCard.click({ force: true });

    // 5. Giriş ekranında Misafir Girişi yap
    console.log('Giriş ekranı yüklenmesi bekleniyor...');
    const guestLoginBtn = page.locator('#guest-login-button');
    await expect(guestLoginBtn).toBeVisible({ timeout: 15000 });
    await guestLoginBtn.click({ force: true });

    // 6. Dashboard'un yüklenmesini bekle
    console.log('Dashboard yüklenmesi bekleniyor...');
    await expect(page.locator('body')).toContainText('Ana Sayfa', { timeout: 15000 });

    // 7. Alt menüden "Profil" butonuna tıkla (Force: true animasyon geçişini atlar)
    console.log('Profil sayfasına geçiliyor...');
    await page.locator('button[aria-label="Profil"]').click({ force: true });

    // 8. Profil sayfasında "TAKIMLARIM" kartına tıkla
    console.log('Takımlarım ekranına geçiliyor...');
    await page.click('text=TAKIMLARIM', { force: true });

    // 9. Takımım ekranının açıldığını doğrula
    console.log('Kadro Yönetimi doğrulanıyor...');
    await expect(page.locator('body')).toContainText('Kadro Yönetimi', { timeout: 10000 });

    // 10. "Taktik Öner" butonuna tıkla
    console.log('Taktik Öner butonuna tıklanıyor...');
    const proposeBtn = page.locator('button:has-text("Taktik Öner")');
    await expect(proposeBtn).toBeVisible({ timeout: 5000 });
    await proposeBtn.click({ force: true });

    // 11. Taktik Stüdyo'nun açıldığını doğrula
    console.log('Taktik Stüdyo açılışı doğrulanıyor...');
    await expect(page.locator('body')).toContainText('TAKTİK STUDIO', { timeout: 10000 });
    await page.screenshot({ path: 'reports/studio-opened.png' });

    // 12. Taktik Stüdyo'da KAYDET butonuna bas
    console.log('Kaydet butonuna basılıyor...');
    const headerSaveBtn = page.locator('header button:has-text("KAYDET")');
    await expect(headerSaveBtn).toBeVisible({ timeout: 5000 });
    await headerSaveBtn.click({ force: true });

    // 13. Taktik adını gir
    console.log('Taktik ismi giriliyor...');
    const tacticNameInput = page.locator('input[placeholder="Bu taktiğin adı ne olsun?"]');
    await expect(tacticNameInput).toBeVisible({ timeout: 5000 });
    await tacticNameInput.fill('Yeni Taktik Önerisi');

    // 14. "KAPTANA VE TAKIMA ÖNER" butonuna basarak öneriyi kaydet
    console.log('Öneri gönderiliyor...');
    const submitProposalBtn = page.locator('button:has-text("KAPTANA VE TAKIMA ÖNER")');
    await expect(submitProposalBtn).toBeVisible({ timeout: 5000 });
    await submitProposalBtn.click({ force: true });

    // 15. Toast bildiriminin göründüğünü doğrula
    console.log('Başarı mesajı bekleniyor...');
    await expect(page.locator('body')).toContainText('Taktik öneriniz kaptana gönderildi', { timeout: 10000 });
    await page.screenshot({ path: 'reports/proposal-submitted.png' });

    // 16. Taktik Stüdyo'dan Takımlarım sayfasına geri dön
    console.log('Takımlarım sayfasına geri dönülüyor...');
    const backBtn = page.locator('#studio-back-button');
    await backBtn.click({ force: true });

    // 17. Takımlarım sayfasında "Gönderdiğin Öneriler" kısmında yeni taktiğin göründüğünü doğrula!
    console.log('Takımlarım sayfasında önerinin listelenmesi doğrulanıyor...');
    await expect(page.locator('body')).toContainText('Gönderdiğin Öneriler', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Yeni Taktik Önerisi', { timeout: 10000 });
    
    // Son durumu kaydet
    await page.screenshot({ path: 'reports/myteam-with-proposal.png' });
    console.log('Tüm test adımları başarıyla tamamlandı!');
  });
});
