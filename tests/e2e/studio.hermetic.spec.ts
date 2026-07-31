import { test, expect, Page } from '@playwright/test';

// ─── Hermetik Taktik Stüdyo E2E ───────────────────────────────────────────────
//
// Canlı backend YOK: Supabase REST/RPC/Auth çağrıları route ile stub'lanır,
// oturum localStorage'a tohumlanır. Böylece gerçek tarayıcıda, gerçek pointer
// olaylarıyla stüdyonun BİRİM TESTLERİN KAPSAYAMADIĞI davranışı doğrulanır:
// dashboard→stüdyo geçişi, parmakla çizim, ilk kullanım tanıtımı + örnek taktik.

const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const seedSession = () => {
  const now = Math.floor(Date.now() / 1000);
  const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'e2e-user', role: 'authenticated', aud: 'authenticated', exp: now + 100000 })}.sig`;
  return JSON.stringify({
    access_token: jwt, token_type: 'bearer', expires_in: 100000, expires_at: now + 100000,
    refresh_token: 'e2e-refresh',
    user: {
      id: 'e2e-user', aud: 'authenticated', role: 'authenticated', email: 'e2e@oyna.app',
      app_metadata: { provider: 'email' }, user_metadata: { full_name: 'E2E Kullanıcı' },
      created_at: new Date(0).toISOString(),
    },
  });
};

/** Oturum tohumla + tüm Supabase çağrılarını deterministik stub'la. */
async function bootstrap(page: Page, opts: { onboarded: boolean }) {
  await page.addInitScript(([session, onboarded]) => {
    localStorage.setItem('oyna.auth.token', session as string);
    if (onboarded) localStorage.setItem('oyna_studio_onboarded_v1', '1');
    else localStorage.removeItem('oyna_studio_onboarded_v1');
    localStorage.removeItem('oyna_studio_draft_v1'); // taslak sorma
  }, [seedSession(), opts.onboarded ? '1' : ''] as const);

  await page.route('**/rest/v1/**', async (route) => {
    const accept = route.request().headers()['accept'] || '';
    const single = accept.includes('vnd.pgrst.object');
    await route.fulfill({ status: 200, contentType: 'application/json', body: single ? '{}' : '[]' });
  });
  await page.route('**/auth/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**/rpc/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

/** Dashboard'dan Taktik Stüdyo'yu aç; saha görünene dek bekle. */
async function openStudio(page: Page) {
  await page.goto('/');
  await page.getByText('TAKTİK STÜDYO', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByText('TAKTİK STÜDYO', { exact: true }).click();
  await page.getByTestId('studio-pitch').waitFor({ timeout: 15000 });
}

test.describe('Taktik Stüdyo — hermetik', () => {
  test('dashboard → stüdyo açılır; araç çubuğu ve saha görünür', async ({ page }) => {
    await bootstrap(page, { onboarded: true });
    await openStudio(page);

    await expect(page.getByTestId('studio-pitch')).toBeVisible();
    await expect(page.getByRole('button', { name: /TAŞI/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /KOŞU/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /PAS/ })).toBeVisible();
    // Tempo çipi de her zaman görünür
    await expect(page.getByTitle('Oynatma temposu (plana özel, 1-10)')).toBeVisible();
  });

  test('KOŞU aracıyla parmakla çizim yapılınca sahada çizgi belirir', async ({ page }) => {
    await bootstrap(page, { onboarded: true });
    await openStudio(page);

    // Başlangıçta bizim çizim rengimizde (#39FF14) path yok
    const runPath = page.locator('svg path[stroke="#39FF14"]');
    expect(await runPath.count()).toBe(0);

    await page.getByRole('button', { name: /KOŞU/ }).click();

    // Sahada gerçek pointer sürüklemesi (native PointerEvent — app touch-first).
    // React state'inin (isDrawing/currentLine) flush olması için aralara zaman konur.
    const pitch = page.getByTestId('studio-pitch');
    const box = (await pitch.boundingBox())!;
    const cx = box.x + box.width / 2;
    const y0 = box.y + box.height * 0.7;
    await pitch.dispatchEvent('pointerdown', { pointerId: 1, clientX: cx, clientY: y0, button: 0, buttons: 1, bubbles: true });
    await page.waitForTimeout(40);
    for (let i = 1; i <= 6; i++) {
      await pitch.dispatchEvent('pointermove', { pointerId: 1, clientX: cx, clientY: y0 - i * (box.height * 0.08), buttons: 1, bubbles: true });
      await page.waitForTimeout(40);
    }
    await pitch.dispatchEvent('pointerup', { pointerId: 1, clientX: cx, clientY: y0 - 6 * (box.height * 0.08), button: 0, buttons: 0, bubbles: true });

    // Çizim commit oldu → en az bir yeşil path (SVG'de görünürlük değil SAYI kontrol edilir)
    await expect.poll(() => runPath.count(), { timeout: 5000 }).toBeGreaterThan(0);
  });

  // İlk kullanım tanıtımı 2026-07-23'te YENİLENDİ: "Sonraki" ile ilerleyen
  // 3 adımlı tur yerine, altı aracın tamamını tek sayfada anlatan ve "Başla"
  // ile kapanan bir tanıtım var. Örnek taktik daveti de turun içinden çıktı;
  // artık tanıtım kapandıktan sonra BOŞ TAHTADA beliriyor.
  test('ilk kullanımda tanıtım çıkar; "Örnek taktiği yükle" çalışan bir taktik yükler', async ({ page }) => {
    await bootstrap(page, { onboarded: false });
    await openStudio(page);

    // Tek sayfa tanıtım: altı aracın tamamı aynı anda listelenir.
    await expect(page.getByText('Oyuncuları yerleştir')).toBeVisible();
    await expect(page.getByText('KOŞU çiz')).toBeVisible();
    await expect(page.getByText('PAS çiz — tek top, zincir')).toBeVisible();
    await expect(page.getByText('OYNAT / DURDUR')).toBeVisible();
    await expect(page.getByText('Tempo & taraf')).toBeVisible();
    await expect(page.getByText('Paylaş', { exact: true })).toBeVisible();

    // "Başla" tanıtımı kapatır.
    await page.getByRole('button', { name: 'Başla' }).click();
    await expect(page.getByText('Oyuncuları yerleştir')).toBeHidden();

    // Boş tahtadaki örnek taktik daveti → plana yüklenir + sahada çizim belirir.
    await page.getByText('Örnek taktiği yükle').click();
    await expect(page.getByText('Örnek Taktik').first()).toBeVisible({ timeout: 8000 });
    await expect.poll(() => page.locator('svg path[stroke="#39FF14"]').count(), { timeout: 8000 }).toBeGreaterThan(0);
  });

  // Tanıtım kullanıcı-başına BİR KEZ görünür; Yardım ile istendiğinde geri gelir.
  test('tanıtım bir daha kendiliğinden açılmaz; Yardım ile yeniden açılır', async ({ page }) => {
    await bootstrap(page, { onboarded: true });
    await openStudio(page);

    await expect(page.getByText('Oyuncuları yerleştir')).toBeHidden();
    await page.getByRole('button', { name: 'Yardım' }).click();
    await expect(page.getByText('Oyuncuları yerleştir')).toBeVisible();
  });
});
