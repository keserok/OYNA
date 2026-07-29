// IP-10 — Dokunsal geri bildirim sözleşmesi.
//
// Bu test iki KARARI kilitler. İkisi de kullanıcı kararıdır, teknik tercih değil:
//
//   1. "Titreşim her tuşta olmamalı." Bu yüzden modül YALNIZ üç şey dışa verir:
//      success / error / select. `tap()` YOKTUR ve olmamalıdır — biri ekleyip
//      sıradan butonları titretmeye kalkarsa burası kırmızıya döner.
//   2. Ayarlar'daki anahtar varsayılan AÇIK, ama kapatıldığında GERÇEKTEN susar.
//
// Ayrıca iOS regresyonunu bekçiler: titreşim eskiden yalnız `navigator.vibrate`
// ile yapılıyordu ve iOS WKWebView bunu desteklemediği için iPhone'da ölüydü.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('haptics — API yüzeyi (kullanıcı kararı)', () => {
  it('YALNIZ select/success/error dışa verilir — tap() yoktur', async () => {
    const mod = await import('../../utils/haptics');
    const efektler = ['select', 'success', 'error'].filter((k) => typeof (mod as any)[k] === 'function');
    expect(efektler.sort()).toEqual(['error', 'select', 'success']);

    // Sıradan buton dokunuşu için bir seviye EKLENMEMELİ.
    expect((mod as any).tap, 'tap() eklenmiş — "titreşim her tuşta olmamalı" kararına aykırı').toBeUndefined();
  });

  it('haptics nesnesi de aynı üçlüyü taşır', async () => {
    const { haptics } = await import('../../utils/haptics');
    expect(Object.keys(haptics).sort()).toEqual(['error', 'select', 'success']);
  });

  it('iOS için native köprü gerçekten kullanılıyor (navigator.vibrate tek yol değil)', () => {
    const src = oku('utils/haptics.ts');
    expect(src, '@capacitor/haptics içe aktarılmamış').toContain("from '@capacitor/haptics'");
    expect(src, 'native/web ayrımı yok').toContain('isNativePlatform');
  });

  it('native promise reddi yutuluyor — titreşim hiçbir akışı bozmaz', () => {
    // @capacitor/haptics web katmanı, navigator.vibrate yoksa promise'i REJECT
    // eder. Yakalanmazsa konsola işlenmemiş reddetme düşer.
    const src = oku('utils/haptics.ts');
    expect(src).toMatch(/\.catch\(\(\)\s*=>\s*\{\}\)/);
  });
});

describe('haptics — Ayarlar anahtarı', () => {
  const vibrate = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vibrate.mockClear();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  it('varsayılan AÇIK — anahtar hiç yazılmamışken titreşir', async () => {
    const { select, isHapticsEnabled } = await import('../../utils/haptics');
    expect(isHapticsEnabled()).toBe(true);
    select();
    expect(vibrate).toHaveBeenCalled();
  });

  it('kapatıldığında GERÇEKTEN susar — üç efekt de', async () => {
    const { select, success, error, setHapticsEnabled } = await import('../../utils/haptics');
    setHapticsEnabled(false);
    select(); success(); error();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('tekrar açılınca geri gelir ve tercih kalıcıdır', async () => {
    const { success, setHapticsEnabled, isHapticsEnabled } = await import('../../utils/haptics');
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    expect(isHapticsEnabled()).toBe(true);
    success();
    expect(vibrate).toHaveBeenCalled();
    // Tercih localStorage'da yaşar: yeni bir modül örneği de aynısını okur.
    vi.resetModules();
    const taze = await import('../../utils/haptics');
    expect(taze.isHapticsEnabled()).toBe(true);
  });

  it('navigator.vibrate hiç yokken çökmez (masaüstü Safari / iOS)', async () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true, writable: true });
    const { select, success, error } = await import('../../utils/haptics');
    expect(() => { select(); success(); error(); }).not.toThrow();
  });
});

describe('basma geri bildirimi — index.css', () => {
  const css = oku('index.css');

  it('dokunma parlaması kapatıldığı yerde YERİNE bir karşılık var', () => {
    expect(css).toContain('-webkit-tap-highlight-color: transparent');
    expect(css, ':active global geri bildirimi yok').toMatch(/button:active:not\(:disabled\)/);
    expect(css).toMatch(/filter:\s*brightness\(0\.78\)/);
  });

  it('geri bildirim hareket değil parlaklık — hareketi azalt açıkken de çalışır', () => {
    // `prefers-reduced-motion` bloğu animasyonları 0.01ms'ye indiriyor; geri
    // bildirim animasyona dayansaydı o kullanıcı için hiç kalmazdı.
    const blok = css.slice(css.indexOf('button:active:not(:disabled)'));
    expect(blok.slice(0, 300)).not.toMatch(/animation|transition/);
  });

  it('ripple butonun kendi rengini alır ve butonu kaplar', () => {
    expect(css, 'ripple hâlâ sabit beyaz — neon zeminde görünmüyor').toContain('background-color: currentColor');
    expect(css).toMatch(/transform:\s*scale\(12\)/);
  });

  it('ölü .ripple-container kuralı silindi', () => {
    expect(css).not.toMatch(/^\.ripple-container\s*\{/m);
  });
});

describe('IconButton — etiketsiz ikon buton yazmak imkânsız', () => {
  const src = oku('components/ui/IconButton.tsx');

  it('label prop ZORUNLU (opsiyonel değil)', () => {
    expect(src).toMatch(/\blabel:\s*string;/);
    expect(src, 'label opsiyonel yapılmış').not.toMatch(/\blabel\?:\s*string/);
  });

  it('etiket hem aria-label hem title olarak basılır', () => {
    expect(src).toContain('aria-label={label}');
    expect(src).toContain('title={label}');
  });

  it('taban 44px, geniş varyant 48px', () => {
    expect(src).toContain("md: 'w-11 h-11'");
    expect(src).toContain("lg: 'w-12 h-12'");
  });

  it('sıradan ikon butonu titretmiyor (kullanıcı kararı)', () => {
    expect(src, 'IconButton titreşim çağırıyor — karar: yalnız sonuç/seçim titreşir')
      .not.toMatch(/from '.*haptics'/);
  });
});

describe('AnimatedButton — her dokunuşta titreşim kaldırıldı', () => {
  const src = oku('components/AnimatedButton.tsx');

  it('ham navigator.vibrate çağrısı kalmadı', () => {
    expect(src).not.toMatch(/navigator\.vibrate\(/);
  });

  it('iki basma ölçeği çarpılmıyor — tek kaynak whileTap', () => {
    // Tailwind v4 `active:scale-[0.98]` bağımsız `scale` yazar; framer-motion'ın
    // 0.96'sıyla çarpılıp 0.94 oluyordu.
    expect(src).not.toContain('active:scale-[0.98]');
    expect(src).toMatch(/whileTap/);
  });

  it('en küçük boyut bile dokunma hedefi tabanını geçiyor', () => {
    expect(src).not.toContain('min-h-[36px]');
    expect(src).toMatch(/sm:\s*'[^']*min-h-\[44px\]/);
  });
});
