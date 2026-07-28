import { describe, it, expect, beforeEach, vi } from 'vitest';

// IP-01 — Navigasyon yığını semantiği.
//
// tests/setup.ts useAppStore'u GLOBAL olarak taklit ediyor; burada GERÇEK
// store'un indirgeyici mantığını sınıyoruz, o yüzden importActual şart.
//
// Sınanan davranışlar:
//   · switchTab      — sekmede geri = Ana Sayfa, uygulama küçülmez (BULGU-018)
//   · resetUnderHome — para hareketi sonrası yığın boş kalmaz (BULGU-019)
//   · navigateTo     — döngü kırıcı, geri tuşu İLERİ götürmez (BULGU-028)
//   · closeTopOverlay— öncelik + LIFO sırası (BULGU-020/021/132)

type Store = {
  view: string;
  navigationStack: string[];
  overlayStack: { id: string; priority: number; close: () => void }[];
  paymentLockActive: boolean;
  navigateTo: (v: string) => void;
  goBack: (fallback?: string) => void;
  resetNavigation: (v: string) => void;
  switchTab: (v: string) => void;
  resetUnderHome: (v: string) => void;
  pushOverlay: (id: string, close: () => void, priority?: number) => void;
  popOverlay: (id: string) => void;
  closeTopOverlay: () => boolean;
  setPaymentLockActive: (v: boolean) => void;
};

let store: Store;

beforeEach(async () => {
  vi.resetModules();
  const actual = await vi.importActual<typeof import('../../store')>('../../store');
  store = actual.useAppStore.getState() as unknown as Store;
  actual.useAppStore.setState({ view: 'DASHBOARD', navigationStack: [], overlayStack: [], paymentLockActive: false } as never);
  store = actual.useAppStore.getState() as unknown as Store;
  // Aksiyonlar getState()'ten alınıyor ama okuma her seferinde tazelenmeli.
  const get = () => actual.useAppStore.getState() as unknown as Store;
  store = new Proxy({} as Store, {
    get: (_t, k: string) => (get() as never)[k],
  });
});

describe('navigateTo — döngü kırıcı (BULGU-028)', () => {
  it('normal geçişte mevcut ekranı yığına iter', () => {
    store.navigateTo('MATCH_JOIN');
    store.navigateTo('PAYMENT');
    expect(store.navigationStack).toEqual(['DASHBOARD', 'MATCH_JOIN']);
    expect(store.view).toBe('PAYMENT');
  });

  it('A → B → A: yığına ikinci A eklenmez, yığındaki A tüketilir', () => {
    store.navigateTo('MATCH_JOIN');
    store.navigateTo('PAYMENT');
    store.navigateTo('WALLET');
    expect(store.navigationStack).toEqual(['DASHBOARD', 'MATCH_JOIN', 'PAYMENT']);

    store.navigateTo('PAYMENT'); // Cüzdan'dan "tekrar dene"
    expect(store.navigationStack).toEqual(['DASHBOARD', 'MATCH_JOIN']);
    expect(store.view).toBe('PAYMENT');
  });

  it('geri tuşu İLERİ götürmez — Cüzdan yerine giriş ekranına döner', () => {
    store.navigateTo('MATCH_JOIN');
    store.navigateTo('PAYMENT');
    store.navigateTo('WALLET');
    store.navigateTo('PAYMENT');
    store.goBack();
    expect(store.view).toBe('MATCH_JOIN'); // WALLET DEĞİL
  });

  it('aynı ekrana gitmek yığını değiştirmez', () => {
    store.navigateTo('PAYMENT');
    const before = [...store.navigationStack];
    store.navigateTo('PAYMENT');
    expect(store.navigationStack).toEqual(before);
  });

  it('3 halkalı döngüyü kapatmaz (bilinen sınır)', () => {
    store.navigateTo('MESSAGES');
    store.navigateTo('STUDIO');
    store.navigateTo('MY_TEAM');
    store.navigateTo('MESSAGES'); // tepe MY_TEAM ≠ MESSAGES → normal itme
    expect(store.navigationStack).toEqual(['DASHBOARD', 'MESSAGES', 'STUDIO', 'MY_TEAM']);
  });
});

describe('switchTab — sekmede geri Ana Sayfa (BULGU-018)', () => {
  it('DASHBOARD dışı sekmede kök ["DASHBOARD"] bırakır', () => {
    store.switchTab('PITCH_DISCOVERY');
    expect(store.navigationStack).toEqual(['DASHBOARD']);
    store.goBack();
    expect(store.view).toBe('DASHBOARD');
  });

  it('DASHBOARD sekmesinde yığın boşalır (geri = uygulamayı arka plana al)', () => {
    store.switchTab('SOCIAL');
    store.switchTab('DASHBOARD');
    expect(store.navigationStack).toEqual([]);
  });

  it('derin yığından sekmeye geçince yığın kabarmaz', () => {
    store.navigateTo('MATCH_JOIN');
    store.navigateTo('PAYMENT');
    store.switchTab('PROFILE');
    expect(store.navigationStack).toEqual(['DASHBOARD']);
  });
});

describe('resetUnderHome — para hareketi sonrası (BULGU-019)', () => {
  it('yığını BOŞ bırakmaz, kök Ana Sayfa olur', () => {
    store.navigateTo('PITCH_DISCOVERY');
    store.navigateTo('PAYMENT');
    store.resetUnderHome('MY_MATCHES');
    expect(store.navigationStack).toEqual(['DASHBOARD']);
    expect(store.view).toBe('MY_MATCHES');
    store.goBack();
    expect(store.view).toBe('DASHBOARD');
  });

  it('resetNavigation ise yığını boşaltmaya devam eder (kök sıfırlaması)', () => {
    store.navigateTo('PAYMENT');
    store.resetNavigation('AUTH');
    expect(store.navigationStack).toEqual([]);
  });
});

describe('3DS kilidi asılı kalmaz', () => {
  it('kök sıfırlayan üç aksiyon da kilidi düşürür', () => {
    for (const act of ['resetNavigation', 'switchTab', 'resetUnderHome'] as const) {
      store.setPaymentLockActive(true);
      expect(store.paymentLockActive).toBe(true);
      store[act]('DASHBOARD');
      expect(store.paymentLockActive, act).toBe(false);
    }
  });
});

describe('closeTopOverlay — öncelik ve LIFO (BULGU-020/021/132)', () => {
  it('overlay yokken false döner (geri tuşu ekrana geçsin)', () => {
    expect(store.closeTopOverlay()).toBe(false);
  });

  it('tek overlay: close çağrılır ve true döner', () => {
    const close = vi.fn();
    store.pushOverlay('sheet', close);
    expect(store.closeTopOverlay()).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('close() kapanmayı REDDEDERSE kayıt yığında KALIR', () => {
    // Korumalı no-op: kayıt sürerken kapanmayı reddeden sheet. Kaydı önden
    // silseydik o katman geri-yığınından kalıcı düşer, sonraki geri tuşu
    // ALTINDAKİ ekranı kapatırdı.
    const inatci = vi.fn(); // hiçbir şey yapmaz = katman açık kalır
    store.pushOverlay('busy-sheet', inatci);
    store.closeTopOverlay();
    expect(inatci).toHaveBeenCalledOnce();
    expect(store.overlayStack.map((o) => o.id)).toContain('busy-sheet');
    // ikinci geri tuşu YİNE aynı katmanı hedefler, ekrana düşmez
    expect(store.closeTopOverlay()).toBe(true);
    expect(inatci).toHaveBeenCalledTimes(2);
  });

  it('eşit öncelikte SON kaydedilen kapanır (LIFO)', () => {
    const a = vi.fn(); const b = vi.fn();
    store.pushOverlay('alt', a);
    store.pushOverlay('ust', b);
    store.closeTopOverlay();
    expect(b).toHaveBeenCalledOnce();
    expect(a).not.toHaveBeenCalled();
  });

  it('yüksek öncelikli önce kapanır — sheet üstündeki onay diyaloğu', () => {
    // GERÇEK döngü: close() katmanı kapatır → bileşen unmount olur →
    // useBackDismiss'in cleanup'ı popOverlay çağırır. Testte bunu taklit ediyoruz.
    const sheet = vi.fn(() => store.popOverlay('bottom-sheet'));
    const dialog = vi.fn(() => store.popOverlay('confirm-dialog'));
    store.pushOverlay('bottom-sheet', sheet, 0);
    store.pushOverlay('confirm-dialog', dialog, 10);
    store.closeTopOverlay();
    expect(dialog).toHaveBeenCalledOnce();
    expect(sheet).not.toHaveBeenCalled();
    // Diyalog gerçekten kapandı: ikinci geri tuşu sheet'i hedefler.
    store.closeTopOverlay();
    expect(sheet).toHaveBeenCalledOnce();
  });

  it('öncelik sırası kayıt sırasından bağımsız', () => {
    const sheet = vi.fn(); const dialog = vi.fn();
    store.pushOverlay('confirm-dialog', dialog, 10);
    store.pushOverlay('bottom-sheet', sheet, 0); // sonra kaydoldu ama düşük öncelik
    store.closeTopOverlay();
    expect(dialog).toHaveBeenCalledOnce();
    expect(sheet).not.toHaveBeenCalled();
  });

  it('aynı id iki kez kaydolursa tek kayıt kalır', () => {
    store.pushOverlay('x', vi.fn());
    store.pushOverlay('x', vi.fn());
    expect(store.overlayStack).toHaveLength(1);
  });

  it('popOverlay kaydı siler, close ÇAĞIRMAZ', () => {
    const close = vi.fn();
    store.pushOverlay('x', close);
    store.popOverlay('x');
    expect(close).not.toHaveBeenCalled();
    expect(store.closeTopOverlay()).toBe(false);
  });
});
