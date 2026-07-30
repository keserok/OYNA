// IP-11 bekçisi — hareket, pil ve algılanan hız.
//
// Kilitlenen sözler:
//   1. Sistem "hareketi azalt" derse framer-motion da susar (CSS tek başına yetmez).
//   2. Bekleme göstergeleri BU KURALIN DIŞINDA — spinner donmaz.
//   3. Dekoratif sonsuz döngüler düşük-hareket modunda çizilmez; bilgi taşıyan
//      tek animasyon (geri sayım nabzı) her zaman çalışır.
//   4. Düşük-hareket kararı YALNIZ sistem tercihine bakar — cihaz gücüne göre
//      kimsenin animasyonu habersiz kapatılmaz.
//   5. İki ağır görünüm aynı anda DOM'da durmaz.
//   6. Bekleme ve hata ekran okuyucuya duyurulur.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

describe('prefers-reduced-motion framer-motion\'a ulaşıyor', () => {
  it('App kökü MotionConfig ile sarılı', () => {
    // CSS bloğu framer-motion'ı HİÇ etkilemiyordu: o inline style/WAAPI ile
    // sürer. Sistem tercihini ona taşıyan tek şey bu sarmalayıcı.
    const s = oku('App.tsx');
    expect(s).toContain("import { AnimatePresence, motion, MotionConfig } from 'framer-motion';");
    expect(s).toContain('<MotionConfig reducedMotion="user">');
    expect(s).toContain('</MotionConfig>');
  });

  it('index.css yorumu artık doğru şeyi söylüyor', () => {
    const css = oku('index.css');
    expect(css, 'yanlış yorum: CSS framer-motion\'ı kapatmıyor')
      .not.toContain('Framer Motion @media sorgusu buna bakıyor');
    expect(css).toContain('MotionConfig reducedMotion="user"');
  });
});

describe('bekleme göstergeleri muaf — spinner donmaz', () => {
  const css = oku('index.css');

  it('.animate-spin öldüren listeden çıkarıldı', () => {
    expect(css).toContain('.animate-ping, .animate-pulse, .animate-bounce');
    expect(css).not.toMatch(/\.animate-ping, \.animate-pulse, \.animate-spin/);
  });

  it('.oy-spinner için "animation: none" kuralı kalmadı', () => {
    expect(css).not.toMatch(/\.oy-spinner\s*\{\s*animation:\s*none/);
  });

  it('muafiyet kuralları * kuralından SONRA geliyor', () => {
    // Sıra bozulursa `*` kuralı (0.01ms) muafiyeti ezer ve spinner yine donar.
    const blok = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    const yildiz = blok.indexOf('*, *::before, *::after');
    const spin = blok.indexOf('.animate-spin {');
    const oy = blok.indexOf('.oy-spinner {');
    expect(yildiz).toBeGreaterThanOrEqual(0);
    expect(spin).toBeGreaterThan(yildiz);
    expect(oy).toBeGreaterThan(yildiz);
  });

  it('muafiyet sonsuz tekrar veriyor (tek tur değil)', () => {
    const blok = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(blok).toContain('animation-iteration-count: infinite !important');
  });
});

describe('düşük hareket kararı — yalnız sistem tercihi', () => {
  it('useLowMotion cihaz gücüne BAKMIYOR', () => {
    // ≤4 GB / ≤4 çekirdek eşiği Türkiye'deki Android tabanının büyük kısmını
    // kapsıyor; kullanıcı istemeden animasyonları kapatmak kabul edilmedi.
    const s = oku('hooks/useLowMotion.ts');
    expect(s).toContain('useReducedMotion');
    expect(s).not.toContain('perfTierFrom');
    expect(s).not.toContain('deviceMemory');
    expect(s).not.toContain('hardwareConcurrency');
  });

  it('cihaz sınıflandırması Stüdyo\'ya özgü kaldı', () => {
    const s = oku('views/studio/perf.ts');
    expect(s).toContain('perfTierFrom');
  });
});

describe('Ana Sayfa döngüleri', () => {
  const dash = oku('views/Dashboard.tsx');
  const sonsuzSatirlar = dash.split('\n')
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => l.includes('repeat: Infinity'));

  it('her sonsuz döngü ya koşullu ya bilgi taşıyor', () => {
    const kosulsuz = sonsuzSatirlar.filter(({ l }) =>
      !l.includes('lowMotion') && !l.includes('pulse || isDraft || isLive'));
    expect(kosulsuz.map(x => x.n), 'lowMotion ile koşulla').toEqual([]);
  });

  it('geri sayım nabzı KOŞULLANMADI — maçın canlı olduğunu o taşıyor', () => {
    const bilgi = sonsuzSatirlar.filter(({ l }) => l.includes('pulse || isDraft || isLive'));
    expect(bilgi.length).toBe(1);
    expect(bilgi[0].l).not.toContain('lowMotion');
  });

  it('döngü sayısı hâlâ yüksek — normal cihazda görünüm DEĞİŞMEDİ', () => {
    // Kullanıcı kararı 2a: normal cihazda hiçbir şey kalkmaz, yalnız sistem
    // tercihi açıkken çizilmez. Bu test o kararın bozulmadığını kilitler.
    expect(sonsuzSatirlar.length).toBeGreaterThan(30);
    expect(dash).toContain('const lowMotion = useLowMotion();');
  });

  it('koşullu dal son anahtar kareye oturuyor', () => {
    // `duration: 0` framer-motion'da dizinin SON değerine anında oturur.
    // Diziler ya [a,b,a] ya da ekran dışına süpüren tek yön — görsel artık yok.
    for (const { l, n } of sonsuzSatirlar) {
      if (!l.includes('lowMotion')) continue;
      expect(l, `satır ${n}`).toContain('lowMotion ? { duration: 0 }');
    }
  });
});

describe('görünüm geçişi', () => {
  it('iki ağır görünüm aynı anda DOM\'da durmuyor', () => {
    const s = oku('App.tsx');
    expect(s).toContain('<AnimatePresence mode="wait">');
    expect(s).not.toContain('mode="popLayout"');
  });

  it('geçiş süresi gezinmeyi yavaşlatacak kadar uzun değil', () => {
    // mode="wait" çıkış süresini doğrudan gezinmeye ekler.
    const m = oku('components/common/motion.ts').match(/PAGE_TRANSITION[\s\S]*?duration:\s*([\d.]+)/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThanOrEqual(0.2);
  });

  it('bekleme ekranı ne beklendiğini yazıyor', () => {
    const s = oku('App.tsx');
    expect(s).toContain('Yükleniyor…');
    expect(s).toContain('Bağlantın yavaş olabilir.');
  });
});

describe('algılanan hız — iyimser slot yazımı', () => {
  const mj = oku('views/MatchJoin.tsx');

  it('slot sunucu beklenmeden dolu görünüyor', () => {
    expect(mj).toContain('const geriAl = optimistikDoldur();');
    expect(mj).toContain('geriAl?.();');
  });

  it('iyimser yazım originalMatch\'ten türüyor — uydurma slot store\'a girmiyor', () => {
    // `match` useMemo\'su boş maçlar için VARSAYILAN slot üretiyor; onu
    // store\'a yazmak o slotları kalıcı hale getirirdi.
    const blok = mj.slice(mj.indexOf('const optimistikDoldur'), mj.indexOf('const handleBuySlots'));
    expect(blok).toContain('originalMatch?.slots');
    expect(blok).toContain('if (!evSlots?.length) return null;');
    expect(blok).not.toMatch(/\bmatch\.slots\b/);
  });

  it('yazılan alanlar sunucu kalıbıyla aynı', () => {
    const blok = mj.slice(mj.indexOf('const optimistikDoldur'), mj.indexOf('const handleBuySlots'));
    for (const alan of ['purchasedBy', 'occupant', 'assignmentStatus', 'player']) {
      expect(blok, alan).toContain(alan);
    }
  });

  it('eşik kontrolü hâlâ bekleniyor — LIVE rozeti gecikmiyor', () => {
    // `void`'e çevirmek bir tur kazandırırdı ama getMatchDetails ile yarışıp
    // maçı bazen eski durumda gösterirdi. İyimser yazım gecikmeyi zaten çözdü.
    expect(mj).toContain('await checkMatchThreshold(match.id);');
  });
});

describe('bekleme ve hata duyuruluyor', () => {
  const dosyalar = [
    'components/common/Toast.tsx',
    'components/OfflineBanner.tsx',
    'components/common/StatusState.tsx',
    'components/ui/Spinner.tsx',
    'App.tsx',
  ];

  it('her biri canlı bölge ya da uyarı rolü taşıyor', () => {
    const eksik = dosyalar.filter((y) => !/aria-live|role="alert"|role=\{variant/.test(oku(y)));
    expect(eksik, 'ekran okuyucuya sessiz kalıyor').toEqual([]);
  });

  it('hata assertive, bilgi polite', () => {
    const s = oku('components/common/Toast.tsx');
    expect(s).toContain("role={variant === 'error' ? 'alert' : 'status'}");
    expect(s).toContain("aria-live={variant === 'error' ? 'assertive' : 'polite'}");
  });

  it('hata durumu uyarı olarak duyuruluyor', () => {
    expect(oku('components/common/StatusState.tsx')).toContain('role="alert"');
  });
});
