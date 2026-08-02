import { describe, it, expect, vi, beforeEach } from 'vitest';

// ════════════════════════════════════════════════════════════════════════════
// PUSH ÇÖKME KORUMASI — "uygulama açılıştan 1-2 saniye sonra kapanıyor"
// ----------------------------------------------------------------------------
// Bu, uygulamanın kendi kendine kapanmasının GERÇEK sebebiydi. Gerçek cihazdan
// alınan yığın izi:
//
//   IllegalStateException: Default FirebaseApp is not initialized in this
//   process com.oyna.app
//     at com.getcapacitor.PluginHandle.invoke(PluginHandle.java:138)
//     at com.getcapacitor.Bridge.lambda$callPluginMethod$0(Bridge.java:850)
//
// Zincir: google-services.json pakete girmemiş → Firebase kurulmamış →
// `PushNotifications.register()` native tarafta hata atıyor → Capacitor bunu
// `RuntimeException` olarak yeniden fırlatıyor → süreç ölüyor.
//
// KRİTİK NOKTA: bu hata JS'e HİÇ ULAŞMAZ, yani `try/catch` ile önlenemez.
// Tek doğru çözüm altyapı yokken o çağrıyı HİÇ YAPMAMAKTIR. Bu test o kararın
// doğru verildiğini sabitler — özellikle "bilgi yoksa ne yapılır" hâlini,
// çünkü orada yanlış tarafı seçmek uygulamayı yeniden çökertir.
// ════════════════════════════════════════════════════════════════════════════

const platformMock = vi.fn(() => 'android');
const prefGetMock = vi.fn(async () => ({ value: null as string | null }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => platformMock(),
    isNativePlatform: () => platformMock() !== 'web',
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: (o: { key: string }) => prefGetMock(o as never),
    set: vi.fn(async () => {}),
  },
}));

// pushService, supabase ve matchService'i çeker; ikisi de bu testin konusu
// değil ve ağ/istemci kurulumu istemesin diye boş geçilir.
vi.mock('../../supabaseClient', () => ({ supabase: {} }));
vi.mock('../../services/matchService', () => ({ getMatchDetails: vi.fn() }));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(),
    addListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

const yukle = async () => (await import('../../notifications/pushService')).pushAltyapisiHazirMi;

beforeEach(() => {
  vi.resetModules();
  platformMock.mockReturnValue('android');
  prefGetMock.mockResolvedValue({ value: null });
});

describe('push altyapısı hazır mı — çökme koruması', () => {
  it('Android + Firebase kurulu → push açılır', async () => {
    prefGetMock.mockResolvedValue({ value: 'true' });
    expect(await (await yukle())()).toBe(true);
  });

  it('Android + Firebase YOK → push kapatılır (uygulama çökmez)', async () => {
    prefGetMock.mockResolvedValue({ value: 'false' });
    expect(await (await yukle())()).toBe(false);
  });

  // EN ÖNEMLİ HÂL: bilgi hiç yoksa ne yapılacak? Burada "devam et" demek,
  // eski çökmenin aynısını geri getirmek demektir. Belirsizlikte push kapanır.
  it('Android + bilgi YOK → güvenli tarafta kalır, push kapatılır', async () => {
    prefGetMock.mockResolvedValue({ value: null });
    expect(await (await yukle())()).toBe(false);
  });

  it('Android + tercih okunamıyor (hata) → push kapatılır', async () => {
    prefGetMock.mockRejectedValue(new Error('depo yok'));
    expect(await (await yukle())()).toBe(false);
  });

  it('iOS → kontrol uygulanmaz (orada push Firebase istemez)', async () => {
    platformMock.mockReturnValue('ios');
    prefGetMock.mockResolvedValue({ value: null });
    expect(await (await yukle())()).toBe(true);
  });

  it('bayrak beklenmedik bir değer taşıyorsa da push kapatılır', async () => {
    prefGetMock.mockResolvedValue({ value: 'evet' });
    expect(await (await yukle())()).toBe(false);
  });
});
