/**
 * PUSH DİNLEYİCİ TEMİZLİĞİ — geri sökülmesin (26 Ağustos 2026)
 *
 * initPushNotifications her çağrıda 4 dinleyici takıyordu ama hiçbirini
 * sökmüyordu. İzin modalı yolu (App.tsx → pushKurulumRef) fonksiyonu İKİNCİ
 * kez çağırınca dinleyiciler birikiyor, her bildirim çift toast ve çift
 * navigasyon üretiyordu. Tek temizlik clearPushToken'daydı ve if (!error)
 * içinde KOŞULLUYDU — çevrimdışı çıkışta dinleyiciler takılı kalıyordu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const s = oku('notifications/pushService.ts');

// Fonksiyon gövdeleri: bir sonraki export'a kadar dilimlenir.
const init = s.slice(
  s.indexOf('export const initPushNotifications'),
  s.indexOf('export const clearPushToken'),
);
const clear = s.slice(
  s.indexOf('export const clearPushToken'),
  s.indexOf('export const subscribeToInAppNotifications'),
);

describe('initPushNotifications — her çağrı idempotent olmalı', () => {
  it('removeAllListeners ile temizlik yapılır', () => {
    expect(init).toContain('removeAllListeners');
  });

  it('temizlik dinleyici eklemeden ve register()dan ÖNCE gelir', () => {
    const temizlik = init.indexOf('removeAllListeners');
    expect(temizlik).toBeGreaterThan(-1);
    expect(temizlik).toBeLessThan(init.indexOf('addListener'));
    expect(temizlik).toBeLessThan(init.indexOf('PushNotifications.register()'));
  });

  it('temizlik KOŞULSUZ: izin kontrollerinden bile önce çalışır', () => {
    // İzin verilmemiş erken-çıkış yollarında da birikme olmasın diye
    // temizlik checkPermissions'tan önce durur.
    expect(init.indexOf('removeAllListeners')).toBeLessThan(init.indexOf('checkPermissions'));
  });

  it('yarış koruması bozulmadı: token dinleyicisi register()dan önce bağlanır', () => {
    expect(init.indexOf("addListener('registration'")).toBeLessThan(
      init.indexOf('PushNotifications.register()'),
    );
  });
});

describe('clearPushToken — çevrimdışı çıkışta da dinleyiciler sökülmeli', () => {
  it('removeAllListeners artık if (!error) koşulunun içinde DEĞİL', () => {
    expect(clear).toContain('removeAllListeners');
    // Eski koşullu kalıp geri gelmesin — profiles güncellemesi başarısız
    // olsa bile dinleyiciler sökülür.
    expect(clear).not.toContain('if (!error)');
  });
});

describe('D2 bekçisi bozulmadı', () => {
  it("'izinIste: boolean = false' imzası hâlâ duruyor", () => {
    expect(s).toContain('izinIste: boolean = false');
    expect(s).toContain('if (!izinIste) {');
  });
});
