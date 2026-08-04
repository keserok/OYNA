/**
 * ÇÖKME KAYDI KURULUMU — geri sökülmesin (SRE-3 / S-3)
 *
 * SRE turu şunu ölçmüştü: `utils/observability.ts` Sentry'ye gönderim için
 * yazılmış ama anahtar yok → captureException SESSİZ no-op. Yani uygulama bir
 * kullanıcının telefonunda çöktüğünde hiçbir yere kayıt gitmiyordu; ErrorBoundary
 * ekranda "sorun Oyna tarafına iletildi" yazdığı hâlde iletilmiyordu.
 *
 * Kurucu kararı S-3 = "güvenli olsun": üçüncü tarafa veri GÖNDERİLMEZ, hatalar
 * kendi veritabanımızdaki `hata_bildir` kapısına yazılır.
 *
 * Bu test o kurulumu KORUR. Biri dinleyicileri kaldırırsa ya da kaydı tekrar
 * yalnızca Sentry'ye bağlarsa test kırılır.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Çökme kaydı kendi veritabanımıza gidiyor olmalı', () => {
  it('captureException her hâlükârda kendi kaydımıza yazar', () => {
    const s = oku('utils/observability.ts');
    expect(s).toContain("supabase.rpc('hata_bildir'");
    expect(s).toContain('kendiKaydimizaGonder(error');
  });

  it('yakalanmamış hatalar da toplanır (eskiden hiçbiri kayda geçmiyordu)', () => {
    const s = oku('utils/observability.ts');
    expect(s).toContain("window.addEventListener('error'");
    expect(s).toContain("window.addEventListener('unhandledrejection'");
  });

  it('dış sağlayıcı yokken de kurulum çalışır (erken return kalkmış olmalı)', () => {
    const s = oku('utils/observability.ts');
    // Eski hata: anahtar yoksa initObservability hemen çıkıyor, dinleyici
    // kurulmuyordu. Dinleyiciler artık bu kontrolden ÖNCE kurulmalı.
    const dinleyici = s.indexOf("window.addEventListener('error'");
    const disSaglayiciKontrolu = s.indexOf('if (!SENTRY_DSN && !POSTHOG_KEY)');
    expect(dinleyici).toBeGreaterThan(-1);
    expect(disSaglayiciKontrolu).toBeGreaterThan(-1);
    expect(dinleyici).toBeLessThan(disSaglayiciKontrolu);
  });

  it('hata kaydederken hata olursa uygulama etkilenmez', () => {
    const s = oku('utils/observability.ts');
    expect(s).toContain('kayitSuruyor');            // sonsuz döngü kilidi
    expect(s).toContain('.catch(() => {');          // gönderim hatası yutulur
  });

  it('ErrorBoundary hatayı yer bilgisiyle bildirir', () => {
    const s = oku('components/ErrorBoundary.tsx');
    expect(s).toContain("where: 'ErrorBoundary'");
  });

  it('yönetici paneli çökme kayıtlarını gösterir', () => {
    const panel = oku('admin-panel/views/pages/CommandCenterPage.tsx');
    expect(panel).toContain('<CokmeKayitlari />');
    expect(oku('admin-panel/views/components/CokmeKayitlari.tsx'))
      .toContain("supabase.rpc('hata_ozeti'");
  });
});
