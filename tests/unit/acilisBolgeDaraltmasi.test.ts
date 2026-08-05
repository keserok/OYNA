import { describe, it, expect, vi, beforeEach } from 'vitest';

// ════════════════════════════════════════════════════════════════════════════
// [YUK-2] AÇILIŞ SORGULARININ BÖLGE DARALTMASI
// ────────────────────────────────────────────────────────────────────────────
// Bu testler, uygulama açılışında çekilen saha/maç listelerinin
//   1. bölge yoksa HİÇ veri çekmediğini (prensip 4.5 — ülke geneli gösterilmez),
//   2. bölge varsa sunucu tarafında daraltıldığını,
//   3. ilin ilçe adıyla yazıldığı BOZUK kayıtları da kapsadığını
// kilitler. (3) olmadan canlıdaki "Ahmet Kuru Tesisleri" sahası ve ona bağlı
// 4 maç, Ordu/Altınordu kullanıcısının ekranından kaybolurdu.
// ════════════════════════════════════════════════════════════════════════════

/** Zincirleme sorgu kurucusunu taklit eder ve uygulanan süzgeçleri kaydeder. */
type Kayit = { yontem: string; args: unknown[] };

let kayitlar: Kayit[] = [];
let donenVeri: unknown[] = [];
/** Oturum var mı? fbGetMatches/fbGetGoalkeepers buna göre ham tabloyu ya da
 *  misafire açık maskeli görünümü seçer (B2 anon maskelemesi). */
let oturumVar = true;

function sorguKurucu() {
  const kurucu: Record<string, unknown> = {};
  for (const yontem of ['select', 'eq', 'in', 'order', 'limit']) {
    kurucu[yontem] = (...args: unknown[]) => {
      kayitlar.push({ yontem, args });
      return kurucu;
    };
  }
  // supabase-js kurucusu "thenable"dır: await edilince sorgu çalışır.
  kurucu.then = (cozumle: (v: unknown) => unknown) =>
    Promise.resolve({ data: donenVeri, error: null }).then(cozumle);
  return kurucu;
}

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (tablo: string) => {
      kayitlar.push({ yontem: 'from', args: [tablo] });
      return sorguKurucu();
    },
    rpc: vi.fn(),
    auth: {
      getSession: async () => ({ data: { session: oturumVar ? { user: { id: 'u' } } : null } }),
    },
  },
  SUPABASE_URL: 'http://localhost',
}));

const { fbGetPitches, fbGetMatches } = await import('../../supabaseMutations');

const suzgec = (yontem: string, alan: string) =>
  kayitlar.find((k) => k.yontem === yontem && k.args[0] === alan);

beforeEach(() => {
  kayitlar = [];
  donenVeri = [];
  oturumVar = true; // varsayılan: giriş yapmış kullanıcı
});

describe('[YUK-2] Bölge bilinmiyorsa ülke geneli ÇEKİLMEZ', () => {
  it('sahalar: bölge null ise hiç sorgu atılmaz', async () => {
    const sonuc = await fbGetPitches(null);
    expect(sonuc).toEqual([]);
    expect(kayitlar).toHaveLength(0);
  });

  it('maçlar: bölge null ise hiç sorgu atılmaz', async () => {
    const sonuc = await fbGetMatches(null);
    expect(sonuc).toEqual([]);
    expect(kayitlar).toHaveLength(0);
  });

  it('sahalar: bölge var ama il boşsa hiç sorgu atılmaz', async () => {
    await fbGetPitches({ city: '', district: 'Altınordu' });
    expect(kayitlar).toHaveLength(0);
  });
});

describe('[YUK-2] Bölge biliniyorsa daraltma SUNUCUDA yapılır', () => {
  it('sahalar: ilçe tam eşleşir, il "gerçek il VEYA ilçe adı" olarak esnetilir', async () => {
    await fbGetPitches({ city: 'Ordu', district: 'Altınordu' });

    expect(suzgec('from', 'pitches')).toBeTruthy();
    expect(suzgec('eq', 'district')?.args[1]).toBe('Altınordu');
    // Bozuk kayıt toleransı: city='Altınordu' yazılmış saha da kapsanır.
    expect(suzgec('in', 'city')?.args[1]).toEqual(['Ordu', 'Altınordu']);
  });

  it('ÜYE — maçlar: daraltma gömülü saha üzerinden yapılır (matches tablosunda il/ilçe yok)', async () => {
    oturumVar = true;
    await fbGetMatches({ city: 'Ordu', district: 'Altınordu' });

    expect(suzgec('from', 'matches')).toBeTruthy();
    const secim = kayitlar.find((k) => k.yontem === 'select');
    expect(String(secim?.args[0])).toContain('pitches!inner');
    expect(suzgec('eq', 'pitches.district')?.args[1]).toBe('Altınordu');
    expect(suzgec('in', 'pitches.city')?.args[1]).toEqual(['Ordu', 'Altınordu']);
  });

  it('yalnız il biliniyorsa (ilçe yok) ilin tamamı çekilir', async () => {
    await fbGetPitches({ city: 'Ordu', district: null });
    expect(suzgec('eq', 'city')?.args[1]).toBe('Ordu');
    expect(suzgec('in', 'city')).toBeUndefined();
  });

  it('il ile ilçe aynı yazılmışsa aday listesi tekrar etmez', async () => {
    await fbGetPitches({ city: 'Altınordu', district: 'Altınordu' });
    expect(suzgec('in', 'city')?.args[1]).toEqual(['Altınordu']);
  });
});

describe('[YUK-2] Maç listesi şekli bozulmaz', () => {
  it('süzmek için eklenen gömülü "pitches" alanı sonuçtan çıkarılır', async () => {
    donenVeri = [{ id: 'm1', title: 'Maç', pitches: { city: 'Ordu', district: 'Altınordu' } }];
    const sonuc = await fbGetMatches({ city: 'Ordu', district: 'Altınordu' });
    expect(sonuc).toHaveLength(1);
    expect(sonuc[0]).not.toHaveProperty('pitches');
    expect(sonuc[0].id).toBe('m1');
  });
});

describe('[B2] MİSAFİR maskeli görünümü okur, kadro isimlerini görmez', () => {
  it('giriş yoksa ham `matches` DEĞİL, `public_matches` sorgulanır', async () => {
    oturumVar = false;
    await fbGetMatches({ city: 'Ordu', district: 'Altınordu' });

    // Ham tablo misafire kapalı; oraya gitmek hata verirdi.
    expect(suzgec('from', 'matches')).toBeUndefined();
    expect(suzgec('from', 'public_matches')).toBeTruthy();
  });

  it('misafirde bölge süzgeci görünümün kendi kolonlarını kullanır', async () => {
    oturumVar = false;
    await fbGetMatches({ city: 'Ordu', district: 'Altınordu' });

    // Görünümlerde gömülü `pitches!inner` çalışmaz; hazır kolonlar kullanılır.
    expect(suzgec('eq', 'pitch_district')?.args[1]).toBe('Altınordu');
    expect(suzgec('in', 'pitch_city')?.args[1]).toEqual(['Ordu', 'Altınordu']);
    const secim = kayitlar.find((k) => k.yontem === 'select');
    expect(String(secim?.args[0])).not.toContain('pitches!inner');
  });

  it('misafir yolunda süzme kolonları sonuç şeklini bozmaz', async () => {
    oturumVar = false;
    donenVeri = [{ id: 'm1', title: 'Maç', pitch_city: 'Ordu', pitch_district: 'Altınordu' }];
    const sonuc = await fbGetMatches({ city: 'Ordu', district: 'Altınordu' });
    expect(sonuc).toHaveLength(1);
    expect(sonuc[0]).not.toHaveProperty('pitch_city');
    expect(sonuc[0]).not.toHaveProperty('pitch_district');
    expect(sonuc[0].id).toBe('m1');
  });
});
