// IP-12 bekçisi — hata ve boş durum sistemi.
//
// Kilitlenen sözler:
//   1. Ham sunucu kodu ekrana ASLA çıkmaz. Kullanıcı `INVALID_MATCH_STATE`
//      veya `Failed to fetch` görmez.
//   2. Ağ hatası ayrı tanınır — çözüm yolu farklı olduğu için mesajı da farklı.
//   3. Çeviri TEK kaynaktır; `parseRpcError` kopyaları geri gelmez.
//   4. Boş durum çıkmaz sokak değildir (EmptyState çıkış aksiyonu taşıyabilir).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  mapError, mapErrorOrNull, mapAuthError, mapPayoutError,
  isNetworkError, codeOf, BARE_CODE_TR, GENEL_HATA, AG_HATASI,
} from '../../utils/errorMap';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

const servisler = () =>
  readdirSync(join(KOK, 'services')).filter((f) => f.endsWith('.ts')).map((f) => `services/${f}`);

describe('ham kod sızıntısı yok', () => {
  it('tanınmayan çıplak kod ekrana çıkmaz', () => {
    const sonuc = mapError(new Error('WIDGET_EXPLODED'));
    expect(sonuc).toBe(GENEL_HATA);
    expect(sonuc).not.toContain('WIDGET_EXPLODED');
  });

  it('tanınmayan kod, verilen Türkçe yedeği kullanır', () => {
    expect(mapError(new Error('WIDGET_EXPLODED'), 'Kadro güncellenemedi.')).toBe('Kadro güncellenemedi.');
  });

  it('İngilizce sağlayıcı metni olduğu gibi geçmez', () => {
    const sonuc = mapError(new Error('Internal Server Error: something broke'));
    expect(sonuc).not.toContain('something broke');
  });

  it('sözlükteki kodlar Türkçeye çevrilir', () => {
    expect(mapError(new Error('INVALID_MATCH_STATE'))).toBe(BARE_CODE_TR.INVALID_MATCH_STATE);
    expect(mapError(new Error('UNAUTHORIZED'))).toBe(BARE_CODE_TR.UNAUTHORIZED);
    // Çıplak UNAUTHORIZED eskiden ekrana TEK KELİME olarak çıkıyordu.
    expect(mapError(new Error('UNAUTHORIZED'))).not.toBe('UNAUTHORIZED');
  });

  it("sunucunun 'KOD: açıklama' biçimindeki Türkçe açıklaması korunur", () => {
    expect(mapError(new Error('NO_TARIFF: Bu saatin fiyatı girilmemiş.')))
      .toBe('Bu saatin fiyatı girilmemiş.');
  });

  it('açıklama İngilizceyse sözlüğe düşer, açıklama kullanılmaz', () => {
    const sonuc = mapError(new Error('SLOT_TAKEN: already booked by someone'));
    expect(sonuc).toBe(BARE_CODE_TR.SLOT_TAKEN);
  });
});

describe('ağ hatası ayrı tanınır', () => {
  it.each([
    'Failed to fetch',
    'NetworkError when attempting to fetch resource',
    'TypeError: Load failed',
    'network request failed',
  ])('%s → ağ mesajı', (m) => {
    expect(isNetworkError(new Error(m))).toBe(true);
    expect(mapError(new Error(m))).toBe(AG_HATASI);
  });

  it('ağ mesajı ne yapılacağını söylüyor', () => {
    expect(AG_HATASI.toLowerCase()).toContain('bağlantı');
  });

  it('sunucu kodu ağ hatası SAYILMAZ', () => {
    expect(isNetworkError(new Error('SLOT_TAKEN'))).toBe(false);
  });
});

describe('hata kodu ayrı sunulabiliyor (destek için)', () => {
  it('çıplak kodu çıkarır', () => {
    expect(codeOf(new Error('INVALID_MATCH_STATE'))).toBe('INVALID_MATCH_STATE');
    expect(codeOf(new Error('NO_TARIFF: fiyat yok'))).toBe('NO_TARIFF');
  });

  it('kod yoksa null döner', () => {
    expect(codeOf(new Error('bir şeyler ters gitti'))).toBeNull();
  });
});

describe('auth hataları Türkçe', () => {
  it.each([
    ['Invalid login credentials', /e-posta ya da şifre/i],
    ['Email not confirmed', /doğrulamadın/i],
    ['User already registered', /zaten kayıtlı/i],
    ['Token has expired', /süresi doldu/i],
  ])('%s → Türkçe', (giren, bekle) => {
    const sonuc = mapAuthError(new Error(giren));
    expect(sonuc).toMatch(bekle);
    expect(sonuc).not.toBe(giren);
  });

  it('tanınmayan auth hatası ham geçmez', () => {
    expect(mapAuthError(new Error('AuthApiError: weird thing'))).not.toContain('weird thing');
  });
});

describe('para çekme hataları', () => {
  it('çıplak UNAUTHORIZED tek kelime olarak çıkmaz', () => {
    const sonuc = mapPayoutError(new Error('UNAUTHORIZED'));
    expect(sonuc).not.toBe('UNAUTHORIZED');
    expect(sonuc.length).toBeGreaterThan(20);
  });

  it('bekleyen çekim mesajı ne yapılacağını söylüyor', () => {
    expect(mapPayoutError(new Error('PENDING_PAYOUT'))).toBe(BARE_CODE_TR.PENDING_PAYOUT);
  });
});

describe('sözlük kalitesi', () => {
  it('en sık geçen sunucu kodlarının hepsi tanımlı', () => {
    // migrations içinde en çok geçen kodlar — bunlar kullanıcıya en sık ulaşanlar.
    const zorunlu = [
      'UNAUTHORIZED', 'NOT_FOUND', 'FORBIDDEN', 'INVALID_STATE', 'INVALID_AMOUNT',
      'SLOT_TAKEN', 'INSUFFICIENT_BALANCE', 'INVALID_MATCH_STATE', 'NO_TARIFF',
      'PENDING_PAYOUT', 'BOOKING_CANCELLED', 'INVALID_IBAN',
    ];
    for (const k of zorunlu) expect(BARE_CODE_TR[k], `${k} sözlükte yok`).toBeTruthy();
  });

  it('hiçbir mesaj boş ya da tek kelime değil', () => {
    for (const [k, v] of Object.entries(BARE_CODE_TR)) {
      expect(v.trim().length, `${k} çok kısa`).toBeGreaterThan(8);
    }
  });

  it('hitap SEN — SİZ kipi sızıntısı yok', () => {
    // Kullanıcı kararı: uygulamanın tamamı SEN.
    const sizKipi = /\b\w+(iniz|ınız|unuz|ünüz)\b|\bediniz\b|\byapınız\b|\bdeneyiniz\b/i;
    for (const [k, v] of Object.entries(BARE_CODE_TR)) {
      expect(sizKipi.test(v), `${k} SİZ kipinde: "${v}"`).toBe(false);
    }
    expect(sizKipi.test(GENEL_HATA)).toBe(false);
    expect(sizKipi.test(AG_HATASI)).toBe(false);
  });

  it('mapErrorOrNull tanımadığında null döner (çağıran karar versin)', () => {
    expect(mapErrorOrNull(new Error('WIDGET_EXPLODED'))).toBeNull();
    expect(mapErrorOrNull(new Error('SLOT_TAKEN'))).toBe(BARE_CODE_TR.SLOT_TAKEN);
  });
});

describe('tek kaynak — kopyalar geri gelmedi', () => {
  it('hiçbir serviste kendi parseRpcError gövdesi yok', () => {
    const ihlal = servisler().filter((p) => /message\.match\(\/\[A-Z_\]/.test(oku(p)));
    expect(ihlal, `kendi ayrıştırıcısını tutan servisler:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('çeviri yapan her servis ortak sözlüğü içe aktarıyor', () => {
    const parseEdenler = servisler().filter((p) => oku(p).includes('parseRpcError'));
    for (const p of parseEdenler) {
      expect(oku(p), `${p} ortak sözlüğü kullanmıyor`).toContain('utils/errorMap');
    }
  });

  it('ödeme akışı tanınmayan hatayı ham döndürmüyor', () => {
    const s = oku('services/paymentService.ts');
    expect(s).toContain('utils/errorMap');
    expect(s, 'ham metin hâlâ dönüyor').not.toMatch(/return clean \|\|/);
  });
});

describe('boş durum çıkmaz sokak değil', () => {
  it('EmptyState çıkış aksiyonu alabiliyor', () => {
    const s = oku('components/common/StatusState.tsx');
    expect(s).toMatch(/actions\?:\s*EmptyStateAction\[\]/);
  });

  it('varsayılan metinler veritabanı dilinde değil', () => {
    const s = oku('components/common/StatusState.tsx');
    expect(s).not.toContain('veri kaydı');
    expect(s).not.toContain('teknik bir problem');
    expect(s).not.toContain('deneyin.');
  });

  it('Top Oyna boş durumu filtreli/filtresiz ayrımı yapıyor ve çıkış veriyor', () => {
    const s = oku('views/MatchDiscovery.tsx');
    expect(s).toContain('isFilterActive');
    expect(s).toContain('Filtreleri Temizle');
    expect(s).toContain('actions=');
  });

  it('boş gelen kutusundan çıkış var', () => {
    expect(oku('views/MessagesView.tsx')).toContain('Arkadaş Bul');
  });

  it('Sosyal sessiz hata yutmuyor — hata gösterip tekrar denetiyor', () => {
    const s = oku('views/SocialView.tsx');
    expect(s).toContain('friendsError');
    expect(s).toContain('teamsError');
    expect(s).toContain('ErrorState');
    expect(s).toContain('onRetry');
  });
});
