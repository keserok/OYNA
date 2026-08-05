// ════════════════════════════════════════════════════════════════════════════
// ÖLÇÜM · HUNİ SİSTEMİ — SÖZLEŞMELER
// ════════════════════════════════════════════════════════════════════════════
//
// Bu dosya ölçüm sisteminin KENDİ korumasıdır (P-0: "peki bu koruma bozulursa
// kim söyleyecek?"). Ölçümün sessiz bozulma yolları şunlar ve her biri burada
// kilitli:
//
//   1. Olay adı uygulamada bir, veritabanında başka yazılır → o adım hep 0
//      görünür ve "kimse buraya gelmiyor" diye okunur.
//   2. Bir huninin adımı hiç bağlanmaz (kod yazılır, çağrı unutulur) → huni
//      ortadan kopuk çıkar.
//   3. Ölçüm çağrısı akışı bozar (hata fırlatır / bekletir) → ödeme patlar.
//   4. Aynı olay bir oturumda iki kez yazılır → tek kişi iki kişi görünür.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUNILER, HUNI_SIRASI, TUM_OLAYLAR, OLAY_YERI } from '../../shared/olayKatalogu';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const MIGRATION = 'supabase/migrations/20260805181455_olcum_huni_sistemi.sql';
/** Olayın uygulamada BAĞLI olup olmadığına bakılacak dosyalar. */
const UYGULAMA_DOSYALARI = [
  'views/MatchCreate.tsx',
  'views/MatchDiscovery.tsx',
  'views/MatchJoin.tsx',
  'views/PitchDiscovery.tsx',
  'views/PaymentScreen.tsx',
  'views/OwnerPanel.tsx',
  'views/owner/calendar/FinancialCalendarView.tsx',
  'services/pitchOwnerService.ts',
];

describe('ölçüm · katalog ile veritabanı AYNI olmalı', () => {
  const sql = oku(MIGRATION);

  it('kataloğun her olayı veritabanı listesinde var', () => {
    const eksik = TUM_OLAYLAR.filter((o) => !sql.includes(`('${o}'`));
    expect(
      eksik,
      'Bu olaylar shared/olayKatalogu.ts içinde var ama migration dosyasındaki ' +
      `olay_tanimlari listesinde YOK. Sunucu onları reddeder ve adım hep 0 görünür:\n${eksik.join('\n')}`,
    ).toEqual([]);
  });

  it('veritabanı listesindeki her olay katalogda var', () => {
    // `INSERT INTO public.olay_tanimlari` bloğundaki adları çıkar.
    const blok = sql.slice(sql.indexOf('INSERT INTO public.olay_tanimlari'));
    const gecerli = new Set(TUM_OLAYLAR);
    const fazla = [...blok.matchAll(/\('([a-z_]+)',\s*'(kaptan|oyuncu|kiralama|tesis)'/g)]
      .map((m) => m[1])
      .filter((o) => !gecerli.has(o));
    expect(
      fazla,
      'Bu olaylar veritabanında tanımlı ama katalogda yok — panel onları çizemez:\n' + fazla.join('\n'),
    ).toEqual([]);
  });

  it('huni adı ve adım sırası iki tarafta da aynı', () => {
    const blok = sql.slice(sql.indexOf('INSERT INTO public.olay_tanimlari'));
    const uyusmayan: string[] = [];
    for (const m of blok.matchAll(/\('([a-z_]+)',\s*'([a-z]+)',\s*(\d+)/g)) {
      const [, olay, huni, sira] = m;
      const yer = OLAY_YERI[olay];
      if (!yer) continue;
      if (yer.huni !== huni || yer.sira !== Number(sira)) {
        uyusmayan.push(`${olay}: katalog=${yer.huni}/${yer.sira} · veritabanı=${huni}/${sira}`);
      }
    }
    expect(uyusmayan, `Adım sırası ayrışmış:\n${uyusmayan.join('\n')}`).toEqual([]);
  });
});

describe('ölçüm · her huni adımı uygulamada BAĞLI', () => {
  const kaynak = UYGULAMA_DOSYALARI.map(oku).join('\n');

  it.each(HUNI_SIRASI)('%s hunisinin bütün adımları çağrılıyor', (huni) => {
    const baglanmayan = HUNILER[huni].adimlar
      .map((a) => a.olay)
      .filter((o) => !kaynak.includes(`'${o}'`));
    expect(
      baglanmayan,
      `"${HUNILER[huni].baslik}" hunisinin şu adımları hiçbir ekrandan çağrılmıyor — ` +
      `huni ortadan kopuk görünür:\n${baglanmayan.join('\n')}`,
    ).toEqual([]);
  });

  it('kataloğun dışında bir olay adı uydurulmamış', () => {
    // `olayYaz('...')` çağrılarının hepsi katalogdan olmalı.
    const gecerli = new Set(TUM_OLAYLAR);
    const uydurma = [...kaynak.matchAll(/olayYaz\(\s*'([a-z_]+)'/g)]
      .map((m) => m[1])
      .filter((o) => !gecerli.has(o));
    expect(uydurma, `Katalogda olmayan olay adı çağrılmış:\n${uydurma.join('\n')}`).toEqual([]);
  });
});

describe('ölçüm · ölçtüğü akışı ASLA bozmaz', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sunucu hata dönse bile çağıran etkilenmez', async () => {
    vi.doMock('../../supabaseClient', () => ({
      supabase: { rpc: () => Promise.reject(new Error('ağ koptu')) },
    }));
    const { olayYaz } = await import('../../utils/olcum');
    // Fırlatmamalı ve senkron dönmeli.
    expect(() => olayYaz('kaptan_ekran_acildi')).not.toThrow();
  });

  it('supabase istemcisi patlasa bile çağıran etkilenmez', async () => {
    vi.doMock('../../supabaseClient', () => ({
      supabase: { rpc: () => { throw new Error('istemci yok'); } },
    }));
    const { olayYaz } = await import('../../utils/olcum');
    expect(() => olayYaz('oyuncu_odedi')).not.toThrow();
  });

  it('aynı olay bir oturumda BİR kez yazılır', async () => {
    const cagrilar: string[] = [];
    vi.doMock('../../supabaseClient', () => ({
      supabase: {
        rpc: (_ad: string, p: { p_olay: string }) => {
          cagrilar.push(p.p_olay);
          return Promise.resolve({ data: true, error: null });
        },
      },
    }));
    const { olayYaz } = await import('../../utils/olcum');
    olayYaz('kaptan_ekran_acildi');
    olayYaz('kaptan_ekran_acildi');
    olayYaz('kaptan_ekran_acildi');
    expect(cagrilar).toEqual(['kaptan_ekran_acildi']);
  });

  it('`tekrarlanabilir` işaretli adım her seferinde yazılır', async () => {
    const cagrilar: string[] = [];
    vi.doMock('../../supabaseClient', () => ({
      supabase: {
        rpc: (_ad: string, p: { p_olay: string }) => {
          cagrilar.push(p.p_olay);
          return Promise.resolve({ data: true, error: null });
        },
      },
    }));
    const { olayYaz } = await import('../../utils/olcum');
    olayYaz('oyuncu_mac_acildi', { tekrarlanabilir: true });
    olayYaz('oyuncu_mac_acildi', { tekrarlanabilir: true });
    expect(cagrilar).toHaveLength(2);
  });

  it('katalogda olmayan ad sunucuya HİÇ gitmez', async () => {
    const cagrilar: string[] = [];
    vi.doMock('../../supabaseClient', () => ({
      supabase: {
        rpc: (_ad: string, p: { p_olay: string }) => {
          cagrilar.push(p.p_olay);
          return Promise.resolve({ data: true, error: null });
        },
      },
    }));
    const { olayYaz } = await import('../../utils/olcum');
    olayYaz('boyle_bir_olay_yok');
    expect(cagrilar).toEqual([]);
  });
});

describe('ölçüm · gizlilik ve veritabanı kapıları', () => {
  const sql = oku(MIGRATION);

  it('ham kayıt tablosunu kimse doğrudan okuyamaz', () => {
    expect(sql).toContain('REVOKE ALL ON TABLE public.urun_olaylari FROM anon, authenticated');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/olaylari sadece yonetici okur[\s\S]{0,200}is_admin\(\)/);
  });

  it('huni ve başarı özetleri YALNIZ yöneticiye açık', () => {
    for (const fn of ['huni_ozeti', 'basarili_mac_ozeti', 'olcum_sagligi']) {
      expect(sql, `${fn} anon'a açık bırakılmış`).toContain(`FROM PUBLIC, anon;`);
      expect(sql, `${fn} yönetici kapısı yok`).toMatch(
        new RegExp(`FUNCTION public\\.${fn}[\\s\\S]{0,2000}?is_admin\\(\\)`),
      );
    }
  });

  it('ek bilgi gizlilik eleğinden geçiyor (çökme kaydıyla AYNI elek)', () => {
    expect(sql).toContain('public.hata_temizle_metin');
  });

  it('sel baskını koruması var', () => {
    expect(sql).toMatch(/v_kisi\s*>=\s*300/);
    expect(sql).toMatch(/v_toplam\s*>=\s*20000/);
  });

  it('olay yazma ASLA hata fırlatmaz', () => {
    const govde = sql.slice(sql.indexOf('FUNCTION public.olay_yaz'));
    expect(govde.slice(0, 4000)).toContain('EXCEPTION WHEN OTHERS THEN');
  });

  it('ham kayıt 90 gün sonra siliniyor, günlük özet kalıyor', () => {
    expect(sql).toContain("olustu_at < now() - interval '90 days'");
    expect(sql).toContain('urun_olaylari_gunluk');
  });
});

describe('ölçüm · "başarılı maç" kurucunun tanımına uyuyor', () => {
  const sql = oku(MIGRATION);
  const govde = sql.slice(sql.indexOf('FUNCTION public.basarili_mac_ozeti'));

  it('kadro doldu koşulu var', () => {
    expect(govde).toMatch(/katilan\s*>=\s*gereken/);
  });
  it('para toplandı koşulu var', () => {
    expect(govde).toMatch(/odenmis\s*>\s*0/);
    expect(govde).toMatch(/bekleyen\s*=\s*0/);
  });
  it('saati geçti koşulu var', () => {
    expect(govde).toMatch(/starts_at\s*<\s*now\(\)/);
  });
  it('iptal edilen maç başarılı sayılmıyor', () => {
    expect(govde).toMatch(/cancel_reason IS NULL/);
  });
  it('demo veri sayıma girmiyor', () => {
    expect(govde).toContain('"isDemo" IS NOT TRUE');
  });
});

describe('ölçüm · demo işareti "bir kez demo, hep demo"', () => {
  // Kuzey yıldızı ölçüsü ("başarılı maç") demo veriyi `isDemo` ile eler.
  // O işaret silinebiliyorsa ölçü sessizce şişer — ölçmemekten kötüdür.
  const sql = oku('supabase/migrations/20260805205221_demo_isareti_her_guncellemede_korunur.sql');

  it('tetik HER güncellemede koşuyor (yalnız kaptan değişiminde değil)', () => {
    // İlk kurulumda `UPDATE OF captain_id, "creatorId"` yazılmıştı; `isDemo`
    // alanına dokunan bir güncelleme tetiği hiç uyandırmıyordu.
    expect(sql).toMatch(
      /CREATE TRIGGER trg_demo_isareti_mac\s*\n?\s*BEFORE INSERT OR UPDATE ON public\.matches/,
    );
    expect(sql).not.toMatch(/BEFORE INSERT OR UPDATE OF captain_id[^\n]*\n\s*FOR EACH ROW/);
  });

  it('düzeltme kendi sonucunu canlıda sınıyor', () => {
    // Doğrulama bloğu: işareti silmeyi DENER, tetik geri koymazsa migration patlar.
    expect(sql).toContain('UPDATE public.matches SET "isDemo" = false');
    expect(sql).toMatch(/v_sonra IS NOT TRUE THEN[\s\S]{0,160}RAISE EXCEPTION/);
  });

  it('gerçek maçların yanlışlıkla demo işaretlenmediği de sınanıyor', () => {
    expect(sql).toMatch(/gercek mac yanlislikla demo isaretli/);
  });
});
