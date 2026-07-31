import { describe, it, expect } from 'vitest';
import { matchStartMs, matchStartDayMs } from '../../shared/matchTiming';
import {
  buildDayStrip, matchOnDay, formatDayLabel, startOfDayMs, matchDayKeys, isGeceMaci,
} from '../../utils/discoveryDays';

// ─── TOP OYNA GÜN SEÇİCİ ────────────────────────────────────────────────────
//
// REGRESYON (bu dosyanın var oluş sebebi): veritabanı `date` kolonuna ISO
// tarih yazar ('2026-08-01'). Eski tarih çözücü yalnız 'Bugün'/'Yarın'/gün
// adlarını tanıyordu ve tanımadığı her değerde sessizce BUGÜNE düşüyordu —
// yani listedeki HER maç "bugün" sanılıyor, "Bugün" filtresi hiçbir şeyi
// elemiyordu. Aşağıdaki testler o sessiz düşüşün geri gelmesini engeller.

const SABIT_AN = new Date(2026, 7, 1, 12, 0, 0); // 1 Ağustos 2026, Cumartesi 12:00

describe('matchStartMs — maçın gerçek başlangıcı', () => {
  it("ISO date + time, starts_at'tan ÖNCE gelir (ekran tutarlılığı)", () => {
    // Kartta yazan tarih/saat esas alınır ki gün şeridi, kart ve sayaçlar hep
    // aynı şeyi söylesin — kullanıcının cihaz saat dilimi ne olursa olsun.
    // (starts_at burada bilerek farklı bir an veriyor.)
    const ms = matchStartMs(
      { date: '2026-08-05', time: '21:00', starts_at: '2026-08-05T18:00:00Z' },
      SABIT_AN,
    );
    expect(ms).toBe(new Date(2026, 7, 5, 21, 0, 0, 0).getTime());
  });

  it('ISO tarih yoksa starts_at kullanılır', () => {
    const ms = matchStartMs({ starts_at: '2026-08-05T18:30:00Z', date: '' }, SABIT_AN);
    expect(ms).toBe(new Date('2026-08-05T18:30:00Z').getTime());
  });

  it('camelCase startsAt da okunur', () => {
    const ms = matchStartMs({ startsAt: '2026-08-05T18:30:00Z' }, SABIT_AN);
    expect(ms).toBe(new Date('2026-08-05T18:30:00Z').getTime());
  });

  it('ISO date + time çözülür — ESKİDEN BUGÜNE DÜŞÜYORDU', () => {
    const ms = matchStartMs({ date: '2026-08-05', time: '21:00' }, SABIT_AN);
    expect(ms).toBe(new Date(2026, 7, 5, 21, 0, 0, 0).getTime());
    // Kritik: bugüne (1 Ağustos) düşmedi.
    expect(ms).not.toBe(new Date(2026, 7, 1, 21, 0, 0, 0).getTime());
  });

  it("saat aralığı ('22:00 - 23:00') başlangıcı verir", () => {
    const ms = matchStartMs({ date: '2026-08-05', time: '22:00 - 23:00' }, SABIT_AN);
    expect(ms).toBe(new Date(2026, 7, 5, 22, 0, 0, 0).getTime());
  });

  it('admin eşleyicisinin rawDate alanı da okunur', () => {
    const ms = matchStartMs({ date: '5 Ağu', rawDate: '2026-08-05', time: '20:00' }, SABIT_AN);
    expect(ms).toBe(new Date(2026, 7, 5, 20, 0, 0, 0).getTime());
  });

  it("eski metin etiketleri korunur: 'Bugün' / 'Yarın' / gün adı", () => {
    expect(matchStartMs({ date: 'Bugün', time: '20:00' }, SABIT_AN))
      .toBe(new Date(2026, 7, 1, 20, 0).getTime());
    expect(matchStartMs({ date: 'Yarın', time: '20:00' }, SABIT_AN))
      .toBe(new Date(2026, 7, 2, 20, 0).getTime());
    // 1 Ağustos 2026 Cumartesi → bir sonraki Pazartesi 3 Ağustos
    expect(matchStartMs({ date: 'Pazartesi', time: '20:00' }, SABIT_AN))
      .toBe(new Date(2026, 7, 3, 20, 0).getTime());
  });

  it('çözülemeyen tarih UYDURULMAZ — null döner', () => {
    expect(matchStartMs({ date: '30 Temmuz', time: '20:00' }, SABIT_AN)).toBeNull();
    expect(matchStartMs({ date: '', time: '20:00' }, SABIT_AN)).toBeNull();
    expect(matchStartMs(null, SABIT_AN)).toBeNull();
  });

  it('matchStartDayMs gece yarısına yuvarlar', () => {
    expect(matchStartDayMs({ date: '2026-08-05', time: '23:45' }, SABIT_AN))
      .toBe(new Date(2026, 7, 5).getTime());
  });
});

describe('buildDayStrip — şerit ve gün sayıları', () => {
  const mac = (date: string, time = '20:00') => ({ date, time });

  it('ilk gün İÇİNDE BULUNULAN GÜNDÜR', () => {
    const strip = buildDayStrip([], SABIT_AN);
    expect(strip[0].isToday).toBe(true);
    expect(strip[0].ms).toBe(startOfDayMs(SABIT_AN));
    expect(strip[0].dayNum).toBe(1);
    expect(strip[0].month).toBe('AĞU');
  });

  it('istenen uzunlukta ve ardışık günler üretir', () => {
    const strip = buildDayStrip([], SABIT_AN, 5);
    expect(strip).toHaveLength(5);
    expect(strip.map((d) => d.dayNum)).toEqual([1, 2, 3, 4, 5]);
    expect(strip[1].isTomorrow).toBe(true);
  });

  it('ay sınırını doğru geçer', () => {
    const strip = buildDayStrip([], new Date(2026, 7, 30, 12, 0), 4);
    expect(strip.map((d) => `${d.dayNum} ${d.month}`)).toEqual(['30 AĞU', '31 AĞU', '1 EYL', '2 EYL']);
  });

  it('maçlar doğru güne sayılır', () => {
    const strip = buildDayStrip(
      [mac('2026-08-01'), mac('2026-08-01'), mac('2026-08-03')],
      SABIT_AN,
      5,
    );
    expect(strip[0].count).toBe(2); // 1 Ağustos
    expect(strip[1].count).toBe(0); // 2 Ağustos
    expect(strip[2].count).toBe(1); // 3 Ağustos
  });

  it('tarihi çözülemeyen maç hiçbir güne SAYILMAZ (uydurma sayı yok)', () => {
    const strip = buildDayStrip([mac('bilinmeyen tarih')], SABIT_AN, 3);
    expect(strip.map((d) => d.count)).toEqual([0, 0, 0]);
  });
});

describe('matchOnDay — gün kısıtı', () => {
  it('null gün = kısıt yok, her maç geçer', () => {
    expect(matchOnDay({ date: '2026-09-09', time: '20:00' }, null, SABIT_AN)).toBe(true);
    expect(matchOnDay({ date: 'saçma' }, null, SABIT_AN)).toBe(true);
  });

  it('yalnız o güne düşen maç geçer', () => {
    const gun = new Date(2026, 7, 3).getTime();
    expect(matchOnDay({ date: '2026-08-03', time: '09:00' }, gun, SABIT_AN)).toBe(true);
    expect(matchOnDay({ date: '2026-08-04', time: '09:00' }, gun, SABIT_AN)).toBe(false);
  });

  it('tarihi çözülemeyen maç belirli bir güne AİT SAYILMAZ', () => {
    const gun = startOfDayMs(SABIT_AN);
    expect(matchOnDay({ date: '30 Temmuz', time: '20:00' }, gun, SABIT_AN)).toBe(false);
  });
});

// ─── GECE MAÇLARI ────────────────────────────────────────────────────────────
// Karar: 00:00–06:00 arası başlayan maç İKİ güne birden yazılır. "Cuma gecesi
// 00:30 maçı" hem Cuma'da (oyuncunun dili) hem Cumartesi'de (takvim) görünür;
// hangi güne bakarsa baksın kullanıcı maçını bulur.

describe('gece maçları iki günde birden görünür', () => {
  const cumaGecesi = { date: '2026-08-02', time: '00:30' }; // 2 Ağustos Pazar 00:30
  const oncekiGun = new Date(2026, 7, 1).getTime();
  const gercekGun = new Date(2026, 7, 2).getTime();

  it('iki gün anahtarı üretir: önceki gün + gerçek gün', () => {
    expect(matchDayKeys(cumaGecesi, SABIT_AN)).toEqual([oncekiGun, gercekGun]);
  });

  it('gündüz maçı TEK güne yazılır', () => {
    expect(matchDayKeys({ date: '2026-08-02', time: '20:00' }, SABIT_AN)).toEqual([gercekGun]);
  });

  it('sınır: 06:00 artık gece değildir, 05:59 gecedir', () => {
    expect(matchDayKeys({ date: '2026-08-02', time: '06:00' }, SABIT_AN)).toHaveLength(1);
    expect(matchDayKeys({ date: '2026-08-02', time: '05:59' }, SABIT_AN)).toHaveLength(2);
  });

  it('her iki gün seçildiğinde de listede kalır', () => {
    expect(matchOnDay(cumaGecesi, oncekiGun, SABIT_AN)).toBe(true);
    expect(matchOnDay(cumaGecesi, gercekGun, SABIT_AN)).toBe(true);
    expect(matchOnDay(cumaGecesi, new Date(2026, 7, 3).getTime(), SABIT_AN)).toBe(false);
  });

  it('her iki günün sayacına da işlenir', () => {
    const strip = buildDayStrip([cumaGecesi], SABIT_AN, 4);
    expect(strip[0].count).toBe(1); // 1 Ağustos — "o gecenin maçı"
    expect(strip[1].count).toBe(1); // 2 Ağustos — takvimdeki gerçek gün
    expect(strip[2].count).toBe(0);
  });

  it("'GECE' işareti yalnız ÖNCEKİ gün seçiliyken çıkar", () => {
    expect(isGeceMaci(cumaGecesi, oncekiGun, SABIT_AN)).toBe(true);
    expect(isGeceMaci(cumaGecesi, gercekGun, SABIT_AN)).toBe(false);
    expect(isGeceMaci({ date: '2026-08-02', time: '20:00' }, gercekGun, SABIT_AN)).toBe(false);
    expect(isGeceMaci(cumaGecesi, null, SABIT_AN)).toBe(false);
  });
});

describe('formatDayLabel', () => {
  it("bugün / yarın / tarih", () => {
    const t = startOfDayMs(SABIT_AN);
    expect(formatDayLabel(t, SABIT_AN)).toBe('BUGÜN');
    expect(formatDayLabel(t + 86_400_000, SABIT_AN)).toBe('YARIN');
    expect(formatDayLabel(new Date(2026, 7, 6).getTime(), SABIT_AN)).toBe('6 AĞU');
  });
});
