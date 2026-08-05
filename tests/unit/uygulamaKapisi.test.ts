// ════════════════════════════════════════════════════════════════════════════
// UYGULAMA KAPISI — SÖZLEŞMELER
// ════════════════════════════════════════════════════════════════════════════
//
// Bu kapı bir KURTARMA ARACIDIR: bozuk bir sürümü durdurmak için var. Ama
// yanlış kurulursa felaketin KENDİSİ olur — bir sunucu kesintisinde bütün
// kullanıcıları kilitleyebilir. Bu yüzden buradaki ilk ve en önemli kural:
//
//   KAPI **AÇIK** ARIZALANIR.
//
// Aşağıdaki testler o kuralı ve kurucunun dört kararını kilitler.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = 'supabase/migrations/20260805140000_uygulama_kapisi.sql';

describe('kapı AÇIK arızalanır — uygulama tarafı', () => {
  beforeEach(() => vi.resetModules());

  it('sunucu hata dönerse kapı AÇIK', async () => {
    vi.doMock('../../supabaseClient', () => ({
      supabase: { rpc: () => Promise.resolve({ data: null, error: new Error('kapali') }) },
    }));
    const { kapiyiSor } = await import('../../utils/uygulamaKapisi');
    const d = await kapiyiSor('3.0.0');
    expect(d.bakim).toBe(false);
    expect(d.zorunluGuncelleme).toBe(false);
    expect(d.sorulamadi).toBe(true);
  });

  it('istemci patlarsa kapı AÇIK', async () => {
    vi.doMock('../../supabaseClient', () => ({
      supabase: { rpc: () => { throw new Error('istemci yok'); } },
    }));
    const { kapiyiSor } = await import('../../utils/uygulamaKapisi');
    const d = await kapiyiSor('3.0.0');
    expect(d.bakim).toBe(false);
    expect(d.zorunluGuncelleme).toBe(false);
  });

  it('sunucu HİÇ cevap vermezse (asılı kalırsa) kapı AÇIK', async () => {
    vi.useFakeTimers();
    vi.doMock('../../supabaseClient', () => ({
      supabase: { rpc: () => new Promise(() => { /* asla çözülmez */ }) },
    }));
    const { kapiyiSor } = await import('../../utils/uygulamaKapisi');
    const sozu = kapiyiSor('3.0.0');
    await vi.advanceTimersByTimeAsync(5000);
    const d = await sozu;
    expect(d.bakim).toBe(false);
    expect(d.sorulamadi).toBe(true);
    vi.useRealTimers();
  });

  it('anlamsız cevap gelirse kapı AÇIK', async () => {
    vi.doMock('../../supabaseClient', () => ({
      supabase: { rpc: () => Promise.resolve({ data: 'bozuk', error: null }) },
    }));
    const { kapiyiSor } = await import('../../utils/uygulamaKapisi');
    const d = await kapiyiSor('3.0.0');
    expect(d.bakim).toBe(false);
  });

  it('sunucu AÇIKÇA "kilitle" derse kapı KAPANIR', async () => {
    vi.doMock('../../supabaseClient', () => ({
      supabase: {
        rpc: () => Promise.resolve({
          data: { bakim: true, bakim_mesaj: 'Ödeme sisteminde çalışma var', kayit_acik: true },
          error: null,
        }),
      },
    }));
    const { kapiyiSor } = await import('../../utils/uygulamaKapisi');
    const d = await kapiyiSor('3.0.0');
    expect(d.bakim).toBe(true);
    expect(d.bakimMesaj).toBe('Ödeme sisteminde çalışma var');
    expect(d.sorulamadi).toBe(false);
  });

  it('iki kademe ayrı ayrı taşınır', async () => {
    vi.doMock('../../supabaseClient', () => ({
      supabase: {
        rpc: () => Promise.resolve({
          data: { bakim: false, zorunlu_guncelleme: false, onerilen_guncelleme: true },
          error: null,
        }),
      },
    }));
    const { kapiyiSor } = await import('../../utils/uygulamaKapisi');
    const d = await kapiyiSor('3.0.0');
    expect(d.zorunluGuncelleme).toBe(false);
    expect(d.onerilenGuncelleme).toBe(true);
  });
});

describe('sürüm karşılaştırma kuralı — veritabanı', () => {
  const sql = oku(MIGRATION);

  it('düz metin karşılaştırması YAPILMIYOR (3.0.10 > 3.0.9 olmalı)', () => {
    // Parça parça sayıya çevirip karşılaştırdığını doğrula.
    expect(sql).toContain('string_to_array');
    expect(sql).toMatch(/IF x < y THEN RETURN true/);
  });

  it('eşik boşsa KİMSE kilitlenmez', () => {
    expect(sql).toMatch(/p_esik IS NULL OR btrim\(p_esik\) = ''\s*THEN RETURN false/);
  });

  it('sürüm okunamıyorsa KİMSE kilitlenmez', () => {
    expect(sql).toMatch(/p_surum IS NULL OR btrim\(p_surum\) = ''\s*THEN RETURN false/);
  });

  it('RAKAMSIZ sürüm metni kilitlemez (canlıda yakalanan hata)', () => {
    // İlk yazımda bu koruma YOKTU: 'bozuk' gibi rakamsız bir metin, rakamlar
    // silininde boş kalıyor, boş 0 sayılıyor ve "0 < 3" = true çıkıyordu.
    // Yani sürüm bilgisi bozulan HER kullanıcı zorunlu güncelleme ekranına
    // düşerdi — kapının yapmaması gereken tek şey.
    expect(sql).toMatch(/p_surum !~ '\\d' OR p_esik !~ '\\d'\s*THEN RETURN false/);
  });

  it('karşılaştırma patlarsa KİMSE kilitlenmez', () => {
    const govde = sql.slice(sql.indexOf('FUNCTION public.surum_kucuk_mu'));
    expect(govde.slice(0, 2000)).toMatch(/EXCEPTION WHEN OTHERS THEN[\s\S]{0,200}RETURN false/);
  });
});

describe('kapı AÇIK arızalanır — veritabanı tarafı', () => {
  const sql = oku(MIGRATION);

  it('sorgu patlarsa kapı AÇIK döner', () => {
    const govde = sql.slice(sql.indexOf('FUNCTION public.uygulama_kapisi'));
    const kurtarma = govde.slice(govde.indexOf('EXCEPTION WHEN OTHERS'), govde.indexOf('EXCEPTION WHEN OTHERS') + 400);
    expect(kurtarma).toContain("'bakim', false");
    expect(kurtarma).toContain("'zorunlu_guncelleme', false");
    expect(kurtarma).toContain("'kayit_acik', true");
  });

  it('kapı oturum GEREKTİRMEZ (giriş ekranından önce sorulur)', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.uygulama_kapisi\(text\) TO anon, authenticated/);
  });

  it('kapı sağlığı YALNIZ yöneticiye açık', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.kapi_sagligi() FROM PUBLIC, anon');
    const govde = sql.slice(sql.indexOf('FUNCTION public.kapi_sagligi'));
    expect(govde.slice(0, 900)).toContain('is_admin()');
  });

  it('süresiz bakım TEHLİKE olarak işaretleniyor', () => {
    // Bitiş saati olmayan bakım kapatmayı unutmayı kolaylaştırır.
    expect(sql).toContain('bakim_suresiz');
  });

  it('eşik tutarsızlığı yakalanıyor', () => {
    expect(sql).toContain('esik_tutarsiz');
  });
});

describe('kurucu kararları koda geçmiş', () => {
  const kapi = oku('components/UygulamaKapisi.tsx');
  const giris = oku('index.tsx');

  it('1A · bakım TAM KİLİT — çocuklar çizilmez', () => {
    // Bakım dalı `children` DÖNDÜRMEZ; sadece kilit ekranını döndürür.
    const dal = kapi.slice(kapi.indexOf('if (durum.bakim)'), kapi.indexOf('if (durum.zorunluGuncelleme)'));
    expect(dal).not.toContain('{children}');
    expect(dal).toContain('KISA BİR BAKIMDAYIZ');
  });

  it('2A · iki kademe var: kapatılamaz ekran + kapatılabilir şerit', () => {
    expect(kapi).toContain('durum.zorunluGuncelleme');
    expect(kapi).toContain('durum.onerilenGuncelleme');
    expect(kapi).toContain('seritKapatildi');
    // Zorunlu ekranda kapatma düğmesi OLMAMALI.
    const zorunlu = kapi.slice(kapi.indexOf('if (durum.zorunluGuncelleme)'), kapi.indexOf('// ── 3)'));
    expect(zorunlu).not.toContain('seritKapatildi');
  });

  it('3 · güncelleme ekranında mağaza ve destek çıkışı var', () => {
    const zorunlu = kapi.slice(kapi.indexOf('if (durum.zorunluGuncelleme)'), kapi.indexOf('// ── 3)'));
    expect(zorunlu).toContain('magazayaGit');
    expect(zorunlu).toContain('destegeYaz');
  });

  it('4 · fren HERKESE — uygulamanın en dışında, rol ayrımı yok', () => {
    expect(giris).toContain('<UygulamaKapisi>');
    expect(giris).toContain('<App />');
    expect(kapi).not.toMatch(/UserRole|role ===/);
  });

  it('bakım kapatılınca kullanıcı uygulamayı silmek zorunda kalmaz', () => {
    // Ön plana dönünce kapı yeniden sorulur.
    expect(kapi).toContain('visibilitychange');
  });
});
