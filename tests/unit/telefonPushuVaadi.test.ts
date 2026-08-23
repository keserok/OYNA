/**
 * TUTULAMAYAN TELEFON BİLDİRİMİ SÖZÜ — KİLİT (23 Ağustos 2026)
 *
 * ÖLÇÜLEN DURUM: canlıda `app_config.push_live_enabled = false`.
 * `supabase/functions/send-push` bu anahtar kapalıyken bildirimi "simulated"
 * diye günlüğe yazıp ERKEN DÖNÜYOR — telefona hiçbir şey gitmiyor. Canlıda
 * push token'ı olan profil sayısı da SIFIR.
 *
 * Buna rağmen uygulama telefon bildirimini İKİ YERDE vaat ediyordu:
 *
 *   1. Kullanıcı maça katılınca açılan izin ekranı: "Maçtan 1 saat önce
 *      hatırlatma", "Maç iptal olursa anında haber" — ardından telefonun
 *      kendi izin kutusu. Telefon o kutuyu ÖMÜRDE BİR KEZ gösterir; izin
 *      alıp hiç bildirim göndermemek kullanıcının tek şansını yakar.
 *   2. Ayarlar → Bildirimler → Sessiz Saatler: "Bu aralıkta telefonun
 *      çalmaz". Bu kural yalnız send-push içinde uygulanıyor, dolayısıyla
 *      anahtar kapalıyken HİÇBİR ŞEY yapmıyordu.
 *
 * App Store 2.1 açısından ikisi de "tanıtıldığı gibi çalışmayan özellik".
 *
 * ÇÖZÜM: vaat, sunucudaki anahtara bağlandı. Anahtar panelden açıldığı gün
 * ikisi de kendiliğinden geri gelir — yeni paket derlemek, mağazaya göndermek
 * ve inceleme beklemek gerekmez. Kilitler bunun geri sökülmesini engeller.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// ── Davranış: kapı sunucuya sorar, hataya KAPALI düşer ──────────────────────
const rpc = vi.fn();
vi.mock('../../supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

describe('pushCanliMi · sunucudaki anahtarı okur', () => {
  beforeEach(async () => {
    rpc.mockReset();
    const m = await import('../../notifications/pushCanliMi');
    m.pushCanliOnbelleginiSil();
  });

  it('anahtar açıkken true, kapalıyken false', async () => {
    const { pushCanliMi, pushCanliOnbelleginiSil } = await import('../../notifications/pushCanliMi');

    rpc.mockResolvedValue({ data: true, error: null });
    await expect(pushCanliMi()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('get_config_bool', {
      p_key: 'push_live_enabled',
      p_default: false,
    });

    pushCanliOnbelleginiSil();
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(pushCanliMi()).resolves.toBe(false);
  });

  it('HATA/AĞ YOKSA kapalı sayar — ters yönde yanılmak tek izni yakar', async () => {
    const { pushCanliMi, pushCanliOnbelleginiSil } = await import('../../notifications/pushCanliMi');

    rpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    await expect(pushCanliMi()).resolves.toBe(false);

    pushCanliOnbelleginiSil();
    rpc.mockRejectedValue(new Error('offline'));
    await expect(pushCanliMi()).resolves.toBe(false);
  });

  it('eşzamanlı çağrılar TEK istekte buluşur', async () => {
    const { pushCanliMi } = await import('../../notifications/pushCanliMi');
    rpc.mockResolvedValue({ data: true, error: null });
    const [a, b, c] = await Promise.all([pushCanliMi(), pushCanliMi(), pushCanliMi()]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

// ── Biçim: iki vaat noktası da kapıya bağlı ─────────────────────────────────
describe('Vaat noktaları anahtara bağlı', () => {
  it('izin ekranı, push kapalıyken AÇILMAZ', () => {
    const s = oku('notifications/pushIzniKapisi.ts');
    expect(s).toContain("import { pushCanliMi } from './pushCanliMi'");
    // Kapı, store bayrağı kaldırılmadan ÖNCE gelmeli.
    const kapi = s.indexOf('if (!(await pushCanliMi())) return;');
    const bayrak = s.indexOf('setPushIzniSorulsun(true)');
    expect(kapi).toBeGreaterThan(-1);
    expect(bayrak).toBeGreaterThan(-1);
    expect(kapi).toBeLessThan(bayrak);
  });

  it('sessiz saatler bloğu YALNIZ push canlıyken çizilir', () => {
    const s = oku('components/settings/NotificationSettingsPage.tsx');
    expect(s).toContain('void pushCanliMi().then(setTelefonPushu)');
    // "Bu aralıkta telefonun çalmaz" metni koşulun İÇİNDE kalmalı.
    const kosul = s.indexOf('{telefonPushu === true && (');
    const soz = s.indexOf('Bu aralıkta telefonun çalmaz');
    expect(kosul).toBeGreaterThan(-1);
    expect(soz).toBeGreaterThan(kosul);
  });

  it('push kapalıyken kullanıcıya AÇIKÇA söylenir', () => {
    const s = oku('components/settings/NotificationSettingsPage.tsx');
    expect(s).toContain('{telefonPushu === false && (');
    expect(s).toContain('Telefon bildirimleri henüz açık değil');
    // Mod seçimi bugün de işe yarıyor (uygulama-içi bildirimi DB bekçisi
    // süzüyor); kullanıcı boşuna seçim yaptığını sanmasın.
    expect(s).toMatch(/seçimin şimdiden geçerli/i);
  });

  it('bilinmeden karar verilmez: üçüncü hâl (null) hiçbir şey çizmez', () => {
    const s = oku('components/settings/NotificationSettingsPage.tsx');
    expect(s).toContain('useState<boolean | null>(null)');
    // İki şerit de === ile karşılaştırılmalı; truthy/falsy kontrolü `null`
    // durumunda "kapalı" şeridini yanlışlıkla çizerdi.
    expect(s).not.toMatch(/\{!telefonPushu &&/);
  });

  it('"izin kapalı" uyarısı push kapalıyken çıkmaz (yanıltıcı olurdu)', () => {
    const s = oku('components/settings/NotificationSettingsPage.tsx');
    expect(s).toContain('isNative && telefonPushu === true && permissionDenied');
  });
});

// ── Ayarlar girişindeki ölü sayaç ───────────────────────────────────────────
describe('Ayarlar → Bildirimler alt yazısı', () => {
  it('ölü "N bildirim açık" sayacı kaldırıldı', () => {
    const s = oku('views/SettingsScreen.tsx');
    // Tür-bazlı `enabled` anahtarlarını yazan UI üç-mod ekranına geçilirken
    // silindi: sayaç yeni kullanıcıda "0 bildirim açık" diyordu.
    expect(s).not.toContain('enabledNotifCount');
    expect(s).toContain('subtitle="Ne kadar bildirim istersin?"');
    // Sessiz saatler artık koşullu; alt yazı onu vaat etmemeli.
    expect(s).not.toMatch(/subtitle=.*sessiz saatler/i);
  });
});
