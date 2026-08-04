/**
 * BİLDİRİM DÜZELTMELERİ — geri sökülmesin (A + S2 + D2, 4 Ağustos 2026)
 *
 * Bu oturumda canlıdan ölçülen dört ayrı sessiz arıza düzeltildi. Hepsi
 * "kod çalışıyor ama işe yaramıyor" türündendi — yani hiçbiri hata vermiyordu,
 * bu yüzden de kimse fark etmemişti. Aynı sessizliğe geri düşmemek için
 * her birinin bir bekçisi var:
 *
 *   A1  36 maç hatırlatması '/match/<id>' adresi taşıyordu; uygulama yalnız
 *       'oyna://' kabul ediyor → basınca hiçbir şey olmuyordu.
 *   A2  Maça 5,9 saat kala "24 saat sonra başlıyor" bildirimi gitmişti.
 *   A3  İade bildirimi 'oyna://wallet' taşıyordu ama 'wallet' izinli ekran
 *       listesinde yoktu → 10 bildirim cüzdan yerine ana ekrana düşüyordu.
 *   D2  Bildirim izni girişte, hiçbir bağlam olmadan isteniyordu →
 *       35 profilden SIFIRI izin vermişti.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const GOC_A = 'supabase/migrations/20260804290000_a_bildirim_baglantilari.sql';
const GOC_S2 = 'supabase/migrations/20260804280000_s2_bildirim_modlari.sql';

describe('A1 — maç hatırlatması tıklanabilir olmalı', () => {
  it('sunucu oyna:// biçiminde adres üretir', () => {
    const s = oku(GOC_A);
    expect(s).toContain("'oyna://match/' || m.id::text");
    // Eski bozuk biçim geri gelmesin
    expect(s).not.toContain("'/match/' || m.id::text");
  });

  it('bağlantı işlenemezse maç numarasıyla yedek yol denenir', () => {
    const s = oku('views/Notifications.tsx');
    // Eskiden koşulsuz `return` vardı ve yedek yol hiç çalışmıyordu.
    expect(s).toContain('if (!n.matchId) return;');
  });
});

describe('A2 — hatırlatma gerçek kalan süreyi söylemeli', () => {
  it('metin sabit değil, kalan süreden hesaplanır', () => {
    const s = oku(GOC_A);
    expect(s).toContain('v_kalan := m.starts_at - now()');
    expect(s).toMatch(/v_when := v_dk \|\| ' dakika'/);
    expect(s).toMatch(/v_when := v_sa \|\| ' saat'/);
  });

  it('24 saatlik hatırlatma yalnız gerçekten 20-24 saat kala gönderilir', () => {
    const s = oku(GOC_A);
    expect(s).toContain("now() + interval '20 hours'");
  });
});

describe('A3/A4 — yeni ekran adresleri tanınmalı', () => {
  it('wallet · owner · support · bookings izinli listede', () => {
    const s = oku('notifications/pushService.ts');
    for (const kaynak of ['wallet', 'owner', 'support', 'bookings']) {
      expect(s).toContain(`'${kaynak}'`);
      expect(s).toContain(`case '${kaynak}':`);
    }
  });

  it('cüzdan adresi WALLET ekranını açar', () => {
    const s = oku('notifications/pushService.ts');
    expect(s).toMatch(/case 'wallet':[\s\S]{0,220}setView\('WALLET'\)/);
  });
});

describe('S2 — bildirim modu bekçisi', () => {
  it('bekçi notifications tablosuna BEFORE INSERT bağlanır', () => {
    const s = oku(GOC_S2);
    expect(s).toContain('CREATE TRIGGER b_bildirim_modu_bekcisi');
    expect(s).toContain('BEFORE INSERT ON public.notifications');
  });

  it('bekçi asla kaza ile engellemez: hata/bilinmeyen tür/seviye 1 geçer', () => {
    const s = oku(GOC_S2);
    // Hata olursa bildirim gitsin
    expect(s).toContain('EXCEPTION WHEN OTHERS THEN\n  -- Hangi hata olursa olsun bildirimi kaybetme.\n  RETURN true;');
    // Şablonu olmayan tür geçsin
    expect(s).toContain('IF v_seviye IS NULL THEN RETURN true; END IF;');
    // Seviye 1 her modda geçsin
    expect(s).toContain('IF v_seviye <= 1 THEN RETURN true; END IF;');
  });

  it('zorunlu bildirimlerin seviyesi 1 olarak sabitlenir', () => {
    const s = oku(GOC_S2);
    expect(s).toContain('SET mod_seviyesi = 1 WHERE is_mandatory IS TRUE');
  });

  it('oyuncu ekranı üç mod gösterir, 41 düğme değil', () => {
    const s = oku('components/settings/NotificationSettingsPage.tsx');
    for (const mod of ['TUMU', 'ONEMLI', 'ZORUNLU']) expect(s).toContain(`'${mod}'`);
    expect(s).toContain('fetchNotificationMode');
    // Mod GERÇEKTEN sunucuya yazılır (eski düğmeler yalnızca kaydediliyor,
    // hiçbir yerde uygulanmıyordu — bütün mesele buydu).
    const svc = oku('notifications/notificationPreferences.ts');
    expect(svc).toContain("rpc('bildirim_modum')");
    expect(svc).toContain("rpc('bildirim_modu_ayarla'");
  });
});

describe('D2 — bildirim izni doğru anda istenir', () => {
  it('initPushNotifications varsayılan olarak izin İSTEMEZ', () => {
    const s = oku('notifications/pushService.ts');
    expect(s).toContain('izinIste: boolean = false');
    expect(s).toContain('if (!izinIste) {');
  });

  it('izin maça katılınca tetiklenir', () => {
    const s = oku('views/MatchJoin.tsx');
    expect(s).toContain('pushIzniZamaniGeldi');
  });

  it('"Şimdi değil" telefonun izin kutusunu AÇMAZ (tek şans harcanmaz)', () => {
    const s = oku('components/common/PushIzniModal.tsx');
    // kapat() yalnız işaretler ve kapatır; onIzinIste'yi çağırmaz
    expect(s).toMatch(/const kapat = \(\) => \{[\s\S]{0,200}sorulduIsaretle\(\);[\s\S]{0,120}\};/);
    expect(s).not.toMatch(/const kapat = \(\) => \{[\s\S]{0,200}onIzinIste/);
  });
});

describe('D1 — bozuk maç koruması', () => {
  const GOC_D = 'supabase/migrations/20260804310000_d_bozuk_mac_korumasi.sql';

  it('maç durumuna DEĞİL ayrı sütuna yazar (mevcut ekranlar etkilenmesin)', () => {
    const s = oku(GOC_D);
    expect(s).toContain('elle_bakilmali');
    expect(s).not.toMatch(/UPDATE public\.matches SET status\s*=\s*'NEEDS_REVIEW'/);
  });

  it('sonuçlandırma döngüsü artık tek bozuk maçta durmaz', () => {
    const s = oku(GOC_D);
    // auto_finalize_matches içinde her maç kendi BEGIN/EXCEPTION bloğunda
    const govde = s.slice(s.indexOf('auto_finalize_matches'));
    expect(govde).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(govde).toContain('supurucu_hata_kaydet');
  });

  it('rafa alınan maç bir daha denenmez', () => {
    const s = oku(GOC_D);
    expect(s).toContain('AND NOT elle_bakilmali');
  });
});
