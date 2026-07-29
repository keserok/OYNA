import { describe, it, expect } from 'vitest';
import {
  COURT_TARIFF_REQUIRED_MESSAGE,
  canPublishCourt,
  courtHasOwnTariff,
  courtsMissingTariff,
} from '../../shared/courtTariffGate';
import { toTurkishError } from '../../services/pitchOwnerService';

// SAHA (KORT) BAZLI TARİFE ZORUNLULUĞU — arayüz kapısı sunucudaki iki trigger'ın
// ikizi olmalı (migration 20260828000008):
//   trg_enforce_court_tariff_before_activate  → courts.is_active geçişi
//   trg_enforce_active_court_for_app_booking  → APP_BOOKING / APP_MATCH
// Ayrışırlarsa sahip bir şey görür, sunucu başka şey yapar.

const COURT_A = 'court-a';
const COURT_B = 'court-b';

const facilityWide = { court_id: null, is_active: true };
const courtAOwn = { court_id: COURT_A, is_active: true };
const courtAPassive = { court_id: COURT_A, is_active: false };

describe('courtHasOwnTariff — tesis geneli tarife yayın kapısını AÇMAZ', () => {
  it('sahanın kendi tarifesi varsa true', () => {
    expect(courtHasOwnTariff([facilityWide, courtAOwn], COURT_A)).toBe(true);
  });

  it('yalnız tesis geneli (court_id = null) tarife varsa false', () => {
    // Ürün kararı: her saha KENDİ politikasını girer. Eski tesis-geneli satır
    // fiyat çözümlemesinde yedek kalır ama sahayı yayına aldırmaz.
    expect(courtHasOwnTariff([facilityWide], COURT_A)).toBe(false);
  });

  it('başka sahanın tarifesi bu sahayı açmaz', () => {
    expect(courtHasOwnTariff([courtAOwn], COURT_B)).toBe(false);
  });

  it('pasif tarife sayılmaz', () => {
    expect(courtHasOwnTariff([courtAPassive], COURT_A)).toBe(false);
  });

  it('kort kimliği yoksa (henüz kaydedilmemiş saha) false', () => {
    expect(courtHasOwnTariff([courtAOwn], null)).toBe(false);
    expect(courtHasOwnTariff([courtAOwn], '')).toBe(false);
  });

  it('tarife listesi boş/tanımsızsa patlamaz', () => {
    expect(courtHasOwnTariff([], COURT_A)).toBe(false);
    expect(courtHasOwnTariff(null, COURT_A)).toBe(false);
    expect(courtHasOwnTariff(undefined, COURT_A)).toBe(false);
  });
});

describe('courtsMissingTariff — menüdeki dürüst uyarının kaynağı', () => {
  const courts = [
    { id: COURT_A, is_active: true },
    { id: COURT_B, is_active: true },
    { id: 'court-pasif', is_active: false },
  ];

  it('yalnız AKTİF ve kendi tarifesi olmayan sahaları sayar', () => {
    expect(courtsMissingTariff(courts, [courtAOwn])).toEqual([COURT_B]);
  });

  it('pasif saha uyarıya girmez (zaten yayında değil)', () => {
    const missing = courtsMissingTariff(courts, []);
    expect(missing).toEqual([COURT_A, COURT_B]);
    expect(missing).not.toContain('court-pasif');
  });

  it('tesis geneli tarife tek başına hiçbir sahayı kurtarmaz', () => {
    expect(courtsMissingTariff(courts, [facilityWide])).toEqual([COURT_A, COURT_B]);
  });
});

describe('canPublishCourt — kapı YALNIZ geçişte çalışır (geriye dönük uyum)', () => {
  it('tarifesiz saha kapalıdan yayına ALINAMAZ', () => {
    const d = canPublishCourt({ wasActive: false, nextActive: true, hasOwnTariff: false });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe(COURT_TARIFF_REQUIRED_MESSAGE);
    // Sessiz hata yok: kullanıcıya ne yapacağını söyleyen bir cümle döner.
    expect(d.reason).toMatch(/fiyat politikası/);
  });

  it('tarifesi olan saha yayına alınabilir', () => {
    expect(canPublishCourt({ wasActive: false, nextActive: true, hasOwnTariff: true }).allowed).toBe(true);
  });

  it('ZATEN yayındaki eski saha tarifesi olmasa da kapanmaz', () => {
    // Canlıda 15 aktif sahanın 11'i yalnız tesis geneli tarifeye biniyor;
    // migration onları bozmamalı.
    expect(canPublishCourt({ wasActive: true, nextActive: true, hasOwnTariff: false }).allowed).toBe(true);
  });

  it('yayından çıkarma her zaman serbest', () => {
    expect(canPublishCourt({ wasActive: true, nextActive: false, hasOwnTariff: false }).allowed).toBe(true);
    expect(canPublishCourt({ wasActive: false, nextActive: false, hasOwnTariff: false }).allowed).toBe(true);
  });
});

describe('toTurkishError — sunucu kapıları Türkçe konuşur', () => {
  it('NO_COURT_TARIFF → saha bazlı fiyat politikası çağrısı', () => {
    const msg = toTurkishError(
      new Error('NO_COURT_TARIFF: Bu saha icin once fiyat politikasi girilmelidir. Tarifesiz saha yayina alinamaz.'),
    );
    expect(msg).toBe(COURT_TARIFF_REQUIRED_MESSAGE);
  });

  it('COURT_NOT_PUBLISHED → rezervasyon reddi açıklanır', () => {
    const msg = toTurkishError(new Error('COURT_NOT_PUBLISHED: Bu saha su an yayinda degil; rezervasyon alinamaz.'));
    expect(msg).toBe('Bu saha şu an yayında değil; rezervasyon alınamaz.');
  });

  it('SLOT_MINUTES_LOCKED → sunucunun tarih/saat ayrıntısı korunur (E4a/A2a)', () => {
    const msg = toTurkishError(
      new Error('SLOT_MINUTES_LOCKED: 05.08.2026 tarihinde 20:00 saatinde rezervasyon var; o saatin slot süresi (60 dk) değiştirilemez.'),
    );
    expect(msg).toContain('05.08.2026');
    expect(msg).toContain('60 dk');
    expect(msg).not.toContain('SLOT_MINUTES_LOCKED');
  });

  it('TARIFF_REQUIRED_FOR_BOOKING → rezervasyonlu saat tarifesiz bırakılamaz', () => {
    const msg = toTurkishError(
      new Error('TARIFF_REQUIRED_FOR_BOOKING: 05.08.2026 tarihinde 20:00 saatinde rezervasyon var; o saati tarifesiz birakamazsin.'),
    );
    expect(msg).toContain('05.08.2026');
    expect(msg).not.toContain('TARIFF_REQUIRED_FOR_BOOKING');
  });

  it('NO_TARIFF (tesis) → tarife istenir', () => {
    const msg = toTurkishError(new Error('NO_TARIFF: Yayindaki tesis tarifesiz birakilamaz.'));
    expect(msg).toContain('fiyat politikası');
  });

  // NO_COURT_TARIFF metni "UNAUTHORIZED" gibi genel kalıplardan ÖNCE eşleşmeli;
  // sıralama bozulursa sahip "yetkiniz yok" görür ve ne yapacağını bilemez.
  it('kapı mesajları genel hata kalıplarına yem olmaz', () => {
    expect(toTurkishError(new Error('NO_COURT_TARIFF: x'))).not.toContain('yetkiniz yok');
  });
});
