import type { Page, Route } from '@playwright/test';

// ─── Görsel Regresyon Koşum Takımı (hermetik) ────────────────────────────────
//
// AMAÇ: "sıfır görsel bozukluk" iddiasını KANITLANABİLİR kılmak. Uygulamanın ana
// ekranları gerçek Chromium'da render edilir ve piksel piksel referansla
// karşılaştırılır.
//
// TASARIM KURALLARI (hepsi kırılganlığı önlemek için):
//  1. AĞ YOK.       Tüm dış istekler route ile karşılanır; canlı Supabase'e,
//                   Google Fonts'a, harita/doku CDN'lerine hiç çıkılmaz.
//  2. ZAMAN SABİT.  page.clock.setFixedTime → "2 saat önce", "bugün" gibi
//                   metinler her koşumda aynı çıkar.
//  3. ANİMASYON YOK. İki katman:
//       (a) CSS animasyon/geçiş → playwright.visual.config.ts içindeki
//           stylePath (tests/visual/screenshot.css) ve animations:'disabled'.
//       (b) framer-motion (JS ile sürülen, `repeat: Infinity` olanlar dâhil) →
//           MotionGlobalConfig.skipAnimations = true. Bu framer-motion'ın
//           RESMİ test anahtarıdır: animasyon başlatılmaz, değer doğrudan son
//           kareye atlar. Bunu yapmadan Ana Sayfa kartlarındaki sonsuz shimmer
//           yüzünden ardışık iki ekran görüntüsü BİLE eşleşmiyor (ölçüldü:
//           kareler arasında %19,6 piksel farkı).
//  4. UYGULAMA KODU DEĞİŞMEZ. Ekranlara gitmek için store'a doğrudan erişilir:
//     Vite dev sunucusu modülleri URL ile sunduğundan `import('/store.ts')`
//     uygulamanın kullandığı MODÜL ÖRNEĞİNİN AYNISINI verir. Bu yüzden bu
//     testler yalnızca `vite dev` sunucusuna karşı çalışır (build'e karşı değil).

/** Tüm görüntülerde kullanılan sabit zaman (UTC). */
export const SABIT_ZAMAN = new Date('2026-03-01T12:00:00.000Z');

/** 1x1 saydam PNG — dış görsel/doku istekleri bununla karşılanır. */
const BOS_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const b64url = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Deterministik oturum tohumu. `expires_at` GERÇEK saatten değil SABIT_ZAMAN'dan
 * türetilir; aksi halde token süresi her koşumda değişir.
 */
function oturumJson(opts: { suresiGecmis?: boolean } = {}) {
  const t = Math.floor(SABIT_ZAMAN.getTime() / 1000);
  const exp = opts.suresiGecmis ? t - 7200 : t + 31536000;
  const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: 'gorsel-test-kullanicisi', role: 'authenticated', aud: 'authenticated', exp,
  })}.imza`;
  return JSON.stringify({
    access_token: jwt,
    token_type: 'bearer',
    expires_in: opts.suresiGecmis ? 3600 : 31536000,
    expires_at: exp,
    refresh_token: 'gorsel-test-refresh',
    user: {
      id: 'gorsel-test-kullanicisi', aud: 'authenticated', role: 'authenticated',
      email: 'gorsel@oyna.test',
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Görsel Test' },
      created_at: new Date(0).toISOString(),
    },
  });
}

/**
 * Ağı kapat. DİKKAT — Playwright route'ları SON kaydedilenden başlayarak dener;
 * bu yüzden yakalayıcı (catch-all) EN ÖNCE kaydedilir, özel kurallar sonra.
 * Sıra ters olursa Supabase istekleri de abort edilir ve uygulama "Bağlantı
 * zayıf" bozulmuş moduna düşer.
 */
async function agiKapat(page: Page, opts: { authAskida?: boolean } = {}) {
  const bosJson = (route: Route, tekil = false) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: tekil ? '{}' : '[]' });

  // 1) Yakalayıcı: yerel olmayan HER istek.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue();
    if (/\.(png|jpe?g|gif|webp|avif|svg|ico)$/i.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: BOS_PNG });
    }
    // Google Fonts vb. → BOŞ stil. (Abort etmek yerine 200 dönmek konsolu
    // temiz tutar; yazı tipi her ortamda aynı şekilde SİSTEM yedeğine düşer.)
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });

  // 2) Supabase REST/RPC → deterministik BOŞ sonuç (boş-durum ekranları).
  await page.route('**/rest/v1/**', (route) => {
    const accept = route.request().headers()['accept'] || '';
    return bosJson(route, accept.includes('vnd.pgrst.object'));
  });
  await page.route('**/rpc/**', (route) => bosJson(route));

  // 3) Auth. Splash testinde ASLA cevaplanmaz (aşağıdaki nota bak).
  if (opts.authAskida) {
    await page.route('**/auth/v1/**', () => { /* bilerek askıda */ });
  } else {
    await page.route('**/auth/v1/**', (route) => bosJson(route, true));
  }
}

/**
 * Store modülüne (uygulamanın kullandığı örneğe) erişip fonksiyon çalıştırır.
 *
 * Bir önceki adım gezinme tetiklemişse (ör. ekranaGit) evaluate, bağlam
 * yıkıldığı için "Execution context was destroyed" ile düşebilir. Bu, ölçüm
 * aracının yarışıdır — uygulamanın hatası değil. Aracın kendisi kırılgan olursa
 * ürettiği kırmızıya güvenilmez; o yüzden DOM oturana kadar beklenir ve bu
 * spesifik hatada bir kez tekrar denenir.
 */
async function storeIle(page: Page, fn: string, ...args: unknown[]) {
  const calistir = () => page.evaluate(
    async ([kod, argv]) => {
      const m = await import('/store.ts');
      // eslint-disable-next-line no-new-func
      return new Function('store', 'args', `return (${kod})(store, args)`)(
        (m as any).useAppStore, argv,
      );
    },
    [fn, args] as const,
  );

  await page.waitForLoadState('domcontentloaded');
  try {
    return await calistir();
  } catch (e: unknown) {
    if (!/Execution context was destroyed/i.test(String((e as Error)?.message))) throw e;
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(150);
    return calistir();
  }
}

/**
 * framer-motion'ı testte "anında bitir" moduna al. Uygulamanın kullandığı modül
 * örneğine ulaşmak için Vite'ın /App.tsx çevirisindeki gerçek dep URL'i
 * (…/deps/framer-motion.js?v=HASH) okunur — sorgusuz URL AYRI bir örnek yaratır
 * ve bayrak uygulamaya işlemez.
 */
async function animasyonlariDondur(page: Page) {
  const sonuc = await page.evaluate(async () => {
    const src = await (await fetch('/App.tsx')).text();
    const m = src.match(/["'](\/node_modules\/\.vite\/deps\/framer-motion\.js[^"']*)["']/);
    if (!m) return 'framer-motion dep URL bulunamadı';
    const mod: any = await import(m[1]);
    if (!mod.MotionGlobalConfig) return 'MotionGlobalConfig dışa aktarılmamış';
    mod.MotionGlobalConfig.skipAnimations = true;
    mod.MotionGlobalConfig.instantAnimations = true;
    return 'ok';
  });
  if (sonuc !== 'ok') {
    throw new Error(
      `Görsel test kurulamadı: framer-motion animasyonları durdurulamadı (${sonuc}). ` +
      'Bu olmadan ekran görüntüleri sonsuz animasyonlar yüzünden kırılgan olur.',
    );
  }
}

/** İlk yükleme bitene kadar bekle (store hidrasyonu). */
async function hidrasyonuBekle(page: Page) {
  await page.waitForFunction(async () => {
    try {
      const m = await import('/store.ts');
      const s = (m as any).useAppStore.getState();
      return s.isHydrated === true && s.initialLoadComplete === true;
    } catch { return false; }
  }, undefined, { timeout: 45000 });
}

export interface HazirlaSecenekler {
  /** Oturum tohumlanmasın (giriş ekranı senaryosu). */
  oturumsuz?: boolean;
  /** Auth isteği askıda bırakılsın → uygulama SPLASH'ta kalır. */
  authAskida?: boolean;
}

/**
 * Sayfayı hermetik, deterministik ve animasyonsuz hâle getirir; uygulamayı açar.
 * Dönüşte uygulama yüklenmiş ve donmuş durumdadır.
 */
export async function hazirla(page: Page, opts: HazirlaSecenekler = {}) {
  await agiKapat(page, { authAskida: opts.authAskida });
  await page.clock.setFixedTime(SABIT_ZAMAN);

  const oturum = opts.oturumsuz ? null : oturumJson({ suresiGecmis: opts.authAskida });
  await page.addInitScript((s) => {
    try {
      localStorage.clear();
      if (s) localStorage.setItem('oyna.auth.token', s as string);
      // Stüdyo ilk-kullanım turu ekranları örtmesin.
      localStorage.setItem('oyna_studio_onboarded_v1', '1');
    } catch { /* localStorage yoksa sessiz geç */ }
  }, oturum);

  await page.goto('/', { waitUntil: 'load' });

  if (opts.authAskida) {
    // Auth hiç çözülmediği için hidrasyon bayrağı gelmez; SPLASH'ın kendisi
    // beklenen ekran. authResolved=false olduğundan SplashScreen'in 1200 ms'lik
    // otomatik geçiş sayacı HİÇ kurulmaz → ekran süresiz olarak sabit kalır.
    await page.waitForTimeout(4000);
    // "Bağlantı zayıf" afişi bizim auth'u askıda bırakmamızın YAN ÜRÜNÜ, ürünün
    // gerçek splash hâli değil. Referans temsil edici olsun diye bastırılır.
    await page.evaluate(async () => {
      const m = await import('/store.ts');
      (m as any).useAppStore.setState({ loadDegraded: false });
    });
  } else {
    await hidrasyonuBekle(page);
  }

  await animasyonlariDondur(page);
}

/**
 * Hedef ekrana git. Önce nötr bir ekrana uğranır: bileşen YENİDEN monte olsun ve
 * animasyonları "anında bitir" modunda yeniden başlasın diye (bayrak, zaten
 * çalışmakta olan animasyonları durdurmaz).
 */
export async function ekranaGit(page: Page, view: string) {
  const notr = view === 'LEGAL' ? 'AUTH' : 'LEGAL';
  await storeIle(page, '(store, a) => store.getState().resetNavigation(a[0])', notr);
  await page.waitForTimeout(250);
  await storeIle(page, '(store, a) => store.getState().resetNavigation(a[0])', view);
}

/** Bildirim panelini aç (ekran değil, overlay). */
export async function bildirimleriAc(page: Page) {
  await storeIle(page, '(store) => store.getState().setIsNotificationsOpen(true)');
}

/** Ödeme ekranı için deterministik bağlam tohumla. */
export async function odemeBaglamiTohumla(page: Page) {
  await storeIle(page, `(store) => store.getState().setPaymentContext({
    kind: 'PITCH_DEPOSIT',
    badge: 'SAHA KİRALAMA',
    title: 'Yeşil Vadi Halı Saha',
    subtitle: '1 Mart 2026 · 20:00',
    details: [
      { icon: 'pin', text: 'Kadıköy, İstanbul' },
      { icon: 'calendar', text: '1 Mart 2026' },
      { icon: 'clock', text: '20:00 - 21:00' },
    ],
    amount: 400,
    amountLabel: 'Ödenecek Kapora',
    isDeposit: true,
    allowBalance: true,
    successTitle: 'Kapora alındı',
    successSubtitle: 'Rezervasyonun onaylandı.',
    infoNote: 'Maç dolmazsa otomatik iade edilir.',
  })`);
}

/**
 * Maç sonu değerlendirme için deterministik bağlam tohumla.
 *
 * Oturumdaki kullanıcı (`gorsel-test-kullanicisi`) EV sahibi kadrosuna konur ki
 * ekran "KENDİ TAKIMIN" dalını çizsin: kendisi listeden düşer, iki takım
 * arkadaşı puanlanabilir, deplasman oyuncusu HİÇ görünmez.
 */
export async function degerlendirmeBaglamiTohumla(page: Page, opts: { gorevliler?: boolean } = {}) {
  const oyuncu = (id: string, ad: string, mevki: string) =>
    `{ id: '${id}', name: '${ad}', avatar: '', position: '${mevki}', x: 50, y: 50 }`;
  const slot = (sid: string, id: string, ad: string, mevki: string) =>
    `{ id: '${sid}', role: '${mevki}', x: 50, y: 50, status: 'TAKEN', occupant: '${id}', player: ${oyuncu(id, ad, mevki)} }`;

  await storeIle(page, `(store) => store.getState().setSelectedMatch({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    title: 'Akşam Maçı',
    location: 'Yıldız Halı Saha',
    pitchName: 'Yıldız Halı Saha',
    date: '1 Mart 2026',
    time: '20:00 - 21:00',
    price: 150,
    difficulty: 'Rahat',
    image: '',
    badges: [],
    missingPositions: [],
    creatorId: 'baska-biri',
    ${opts.gorevliler ? "gkId: 'gk-1', refereeId: 'ref-1'," : ''}
    slots: [
      ${slot('h1', 'gorsel-test-kullanicisi', 'Ben', 'ORT')},
      ${slot('h2', 'p-emre', 'Emre Duran', 'SAV')},
      ${slot('h3', 'p-caner', 'Caner Kılıç', 'ORT')},
      ${slot('h4', 'p-ahmet', 'Ahmet Yıldız', 'HÜC')},
    ],
    awaySlots: [ ${slot('a1', 'p-rakip', 'Rakip Oyuncu', 'ORT')} ],
  })`);
}

/**
 * Ekran görüntüsünden ÖNCE her şeyin oturmasını bekle:
 * yazı tipleri + bir sonraki boya karesi + kısa bir yerleşim payı.
 */
export async function oturmasiniBekle(page: Page) {
  await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, { timeout: 15000 });
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(700);
}
