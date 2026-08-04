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

  /**
   * Sahada gerçek pointer sürüklemesi (native PointerEvent — app touch-first).
   * React state'inin (isDrawing/currentLine) flush olması için aralara zaman konur.
   * Koordinatlar saha YÜZDESİ olarak verilir; varsayılan 7v7 "2-3-1" dizilişinde
   * orta saha (50, 50), kaleci (50, 90), stoperler (25/75, 75).
   */
  async function dragOnPitch(page: Page, fromPct: { x: number; y: number }, toPct: { x: number; y: number }) {
    const pitch = page.getByTestId('studio-pitch');
    const box = (await pitch.boundingBox())!;
    const px = (p: { x: number; y: number }) => ({
      x: box.x + box.width * (p.x / 100),
      y: box.y + box.height * (p.y / 100),
    });
    const a = px(fromPct), b = px(toPct);
    await pitch.dispatchEvent('pointerdown', { pointerId: 1, clientX: a.x, clientY: a.y, button: 0, buttons: 1, bubbles: true });
    await page.waitForTimeout(40);
    for (let i = 1; i <= 6; i++) {
      await pitch.dispatchEvent('pointermove', {
        pointerId: 1, clientX: a.x + ((b.x - a.x) * i) / 6, clientY: a.y + ((b.y - a.y) * i) / 6,
        buttons: 1, bubbles: true,
      });
      await page.waitForTimeout(40);
    }
    await pitch.dispatchEvent('pointerup', { pointerId: 1, clientX: b.x, clientY: b.y, button: 0, buttons: 0, bubbles: true });
  }

  test('KOŞU aracıyla bir OYUNCUDAN çizim yapılınca sahada çizgi belirir', async ({ page }) => {
    await bootstrap(page, { onboarded: true });
    await openStudio(page);

    // Başlangıçta bizim çizim rengimizde (#39FF14) path yok
    const runPath = page.locator('svg path[stroke="#39FF14"]');
    expect(await runPath.count()).toBe(0);

    await page.getByRole('button', { name: /KOŞU/ }).click();
    // Orta saha mevkisinden (50,50) ileri doğru çek
    await dragOnPitch(page, { x: 50, y: 50 }, { x: 50, y: 20 });

    // Çizim commit oldu → en az bir yeşil path (SVG'de görünürlük değil SAYI kontrol edilir)
    await expect.poll(() => runPath.count(), { timeout: 5000 }).toBeGreaterThan(0);
  });

  // ─── Koşu kuralı (2026-08-04, kullanıcı kararı) ─────────────────────────────
  // Koşu bir OYUNCUNUN hareketidir: oyuncudan başlamayan koşu OLUŞMAZ ve sahanın
  // üstünde kırmızı uyarı belirir. Doğru koşu çizilince uyarı kalkar. Uyarı bir
  // stüdyo oturumunda en fazla İKİ kez gösterilir — kural yine geçerlidir.
  const RUN_WARNING = 'Koşu bir oyuncudan başlamalı';

  test('boş sahadan koşu çizilemez; kırmızı uyarı çıkar, doğru koşuda kalkar', async ({ page }) => {
    await bootstrap(page, { onboarded: true });
    await openStudio(page);

    const runPath = page.locator('svg path[stroke="#39FF14"]');
    const warning = page.getByText(RUN_WARNING);
    await page.getByRole('button', { name: /KOŞU/ }).click();
    await expect(warning).toBeHidden();

    // Oyuncusuz boş bölge (65,65) → çizgi oluşmamalı, uyarı çıkmalı
    await dragOnPitch(page, { x: 65, y: 65 }, { x: 65, y: 35 });
    await expect(warning).toBeVisible();
    expect(await runPath.count()).toBe(0);

    // Orta sahadan (50,50) doğru koşu → çizgi oluşur ve uyarı kalkar
    await dragOnPitch(page, { x: 50, y: 50 }, { x: 50, y: 20 });
    await expect.poll(() => runPath.count(), { timeout: 5000 }).toBeGreaterThan(0);
    await expect(warning).toBeHidden();
  });

  test('koşu uyarısı bir oturumda en fazla iki kez gösterilir', async ({ page }) => {
    await bootstrap(page, { onboarded: true });
    await openStudio(page);

    const runPath = page.locator('svg path[stroke="#39FF14"]');
    const warning = page.getByText(RUN_WARNING);
    await page.getByRole('button', { name: /KOŞU/ }).click();

    // 1. deneme → uyarı
    await dragOnPitch(page, { x: 65, y: 65 }, { x: 65, y: 35 });
    await expect(warning).toBeVisible();
    // TAŞI'ya geçince uyarı kalkar (mesaj yalnız KOŞU seçiliyken anlamlı)
    await page.getByRole('button', { name: /TAŞI/ }).click();
    await expect(warning).toBeHidden();

    // 2. deneme → uyarı yine çıkar
    await page.getByRole('button', { name: /KOŞU/ }).click();
    await dragOnPitch(page, { x: 65, y: 65 }, { x: 65, y: 35 });
    await expect(warning).toBeVisible();
    await page.getByRole('button', { name: /TAŞI/ }).click();
    await expect(warning).toBeHidden();

    // 3. deneme → uyarı ARTIK çıkmaz, ama kural sürer: çizgi yine oluşmaz
    await page.getByRole('button', { name: /KOŞU/ }).click();
    await dragOnPitch(page, { x: 65, y: 65 }, { x: 65, y: 35 });
    await page.waitForTimeout(300);
    await expect(warning).toBeHidden();
    expect(await runPath.count()).toBe(0);
  });

  // ─── OYNAT / DURDUR (2026-08-04) ────────────────────────────────────────────
  // Oyuncular artık topla AYNI motorla (CSS keyframes) sürülüyor. Eskiden
  // framer-motion ile sürüldükleri için DURDUR'a basınca top donuyor, oyuncular
  // yürümeye devam ediyordu; ayrıca oyuncular rotayı iki tur yürürken top ve
  // bitiş sayacı bir tur koşuyordu. Bu testler ikisini de kilitler.

  /** Hareket eden markörün sahadaki gerçek konumu (hesaplanmış left/top). */
  async function movingMarkerPos(page: Page) {
    return page.locator('[data-testid="studio-pitch"] .brightness-125').first().evaluate((el) => {
      const s = getComputedStyle(el as HTMLElement);
      return `${s.left}|${s.top}`;
    });
  }

  /** Tempoyu en yavaşa (1) çeker — ölçüm için yeterli süre kalsın. */
  async function setSlowestTempo(page: Page) {
    await page.getByTitle('Oynatma temposu (plana özel, 1-10)').click();
    await page.getByLabel('Tempo (1-10)').fill('1');
    await page.getByRole('button', { name: 'Tamam' }).click();
  }

  /** Kalecinin üzerinden uzun, çapraz bir koşu çizer (ölçülebilir süre için). */
  async function drawLongRun(page: Page) {
    await page.getByRole('button', { name: /KOŞU/ }).click();
    await dragOnPitch(page, { x: 50, y: 90 }, { x: 20, y: 20 });
    await expect.poll(() => page.locator('svg path[stroke="#39FF14"]').count(), { timeout: 5000 }).toBeGreaterThan(0);
  }

  test('DURDUR oyuncuyu OLDUĞU YERDE dondurur; OYNAT kaldığı yerden devam eder', async ({ page }) => {
    await bootstrap(page, { onboarded: true });
    await openStudio(page);
    await setSlowestTempo(page);
    await drawLongRun(page);

    // OYNAT → oyuncu gerçekten yürüyor mu?
    await page.getByTitle('Taktiği oynat').click();
    await page.waitForTimeout(400);
    const a = await movingMarkerPos(page);
    await page.waitForTimeout(500);
    const b = await movingMarkerPos(page);
    expect(b, 'oynatırken oyuncu hareket etmeli').not.toBe(a);

    // DURDUR → oyuncu DONMALI (asıl hata buydu: top donuyor, oyuncu yürüyordu)
    await page.getByTitle('Taktiği durdur (olduğu yerde dondur)').click();
    const frozen1 = await movingMarkerPos(page);
    await page.waitForTimeout(900);
    const frozen2 = await movingMarkerPos(page);
    expect(frozen2, 'DURDUR sonrası oyuncu kımıldamamalı').toBe(frozen1);

    // DEVAM → kaldığı yerden ilerlemeli
    await page.getByTitle('Kaldığı yerden devam et').click();
    await page.waitForTimeout(500);
    const resumed = await movingMarkerPos(page);
    expect(resumed, 'DEVAM sonrası oyuncu yeniden hareket etmeli').not.toBe(frozen2);
  });

  test('oynatma BİR tur sürer: bitince buton TEKRAR OYNAT olur ve oyuncu durur', async ({ page }) => {
    await bootstrap(page, { onboarded: true });
    await openStudio(page);
    await setSlowestTempo(page);
    await drawLongRun(page);

    await page.getByTitle('Taktiği oynat').click();
    // Tur bitince buton "TEKRAR OYNAT"a döner (bitiş sayacı doldu).
    // Not: butonun erişilebilir adı aria-label'dan gelir ("Taktiği oynat"),
    // bu yüzden GÖRÜNEN yazıya bakılır.
    await expect(page.getByText('TEKRAR OYNAT')).toBeVisible({ timeout: 15000 });

    // Buton bittiğini söylüyorsa oyuncu da GERÇEKTEN durmuş olmalı —
    // eskiden oyuncular ikinci tura başlıyor, buton ise "bitti" diyordu.
    const p1 = await movingMarkerPos(page);
    await page.waitForTimeout(900);
    const p2 = await movingMarkerPos(page);
    expect(p2, 'tur bitince oyuncu hareketsiz olmalı').toBe(p1);

    // TEKRAR OYNAT → animasyon baştan kurulur ve oyuncu yeniden yürür
    await page.getByTitle('Taktiği oynat').click();
    await page.waitForTimeout(600);
    const p3 = await movingMarkerPos(page);
    expect(p3, 'TEKRAR OYNAT sonrası oyuncu yeniden hareket etmeli').not.toBe(p2);
  });

  // İlk kullanım tanıtımı 2026-07-23'te YENİLENDİ: "Sonraki" ile ilerleyen
  // 3 adımlı tur yerine, altı aracın tamamını tek sayfada anlatan ve "Başla"
  // ile kapanan bir tanıtım var.
  // 2026-08-04 (kullanıcı kararı): örnek taktik TAMAMEN kaldırıldı — tanıtım
  // zaten araçları anlatıyor, boş tahtada ayrıca hazır taktik önerilmiyor.
  test('ilk kullanımda tanıtım çıkar; kapanınca örnek taktik önerilmez', async ({ page }) => {
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

    // Boş tahtada örnek taktik daveti ARTIK YOK.
    await expect(page.getByText('Örnek taktiği yükle')).toHaveCount(0);
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
