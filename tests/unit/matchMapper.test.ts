import { describe, it, expect } from 'vitest';
import {
  mapAdminMatchRowToListing,
  listingToMatchPayload,
  type AdminMatchRow,
} from '../../shared/matchMapper';

// Minimal geçerli bir satır üreten yardımcı
function row(partial: Partial<AdminMatchRow>): AdminMatchRow {
  return {
    id: 'm1', title: 'Test Maç', location: 'Altınordu', date: null, time: '20:00',
    price: 200, difficulty: 'Ciddi', status: 'ACTIVE', format: '7v7', image: null, badges: null, missingPositions: null, slots: null, away_slots: null,
    chatMessages: null, refereeId: null, creatorId: null, isDemo: null,
    cancel_reason: null, refund_status: null, created_at: null,
    ...partial,
  } as AdminMatchRow;
}

describe('normalizeStatus (mapAdminMatchRowToListing üzerinden)', () => {
  it('CONFIRMED durumunu KORUR (lifecycle otoritesi)', () => {
    expect(mapAdminMatchRowToListing(row({ status: 'CONFIRMED' })).status).toBe('CONFIRMED');
  });
  it('OPEN → ACTIVE', () => {
    expect(mapAdminMatchRowToListing(row({ status: 'OPEN' })).status).toBe('ACTIVE');
  });
  it('CANCELED ve CANCELLED → CANCELLED', () => {
    expect(mapAdminMatchRowToListing(row({ status: 'CANCELED' })).status).toBe('CANCELLED');
    expect(mapAdminMatchRowToListing(row({ status: 'CANCELLED' })).status).toBe('CANCELLED');
  });
  it('COMPLETED/DONE → COMPLETED', () => {
    expect(mapAdminMatchRowToListing(row({ status: 'COMPLETED' })).status).toBe('COMPLETED');
    expect(mapAdminMatchRowToListing(row({ status: 'DONE' })).status).toBe('COMPLETED');
  });
  it('LIVE ve DRAFT korunur', () => {
    expect(mapAdminMatchRowToListing(row({ status: 'LIVE' })).status).toBe('LIVE');
    expect(mapAdminMatchRowToListing(row({ status: 'DRAFT' })).status).toBe('DRAFT');
  });
  it('bilinmeyen/null → ACTIVE (güvenli varsayılan)', () => {
    expect(mapAdminMatchRowToListing(row({ status: 'WAT' })).status).toBe('ACTIVE');
    expect(mapAdminMatchRowToListing(row({ status: null })).status).toBe('ACTIVE');
  });
});

describe('mapAdminMatchRowToListing — FAZ 3 alanları', () => {
  it('PRIVATE görünürlük + kod + pitchId map edilir', () => {
    const r = mapAdminMatchRowToListing(row({
      visibility: 'PRIVATE', private_code: 'A1B2C3', pitch_id: 'p9',
      is_successful: true, confirmed_at: '2026-07-01T10:00:00Z', starts_at: '2026-07-02T19:00:00Z',
    }));
    expect(r.visibility).toBe('PRIVATE');
    expect(r.privateCode).toBe('A1B2C3');
    expect(r.pitchId).toBe('p9');
    expect(r.isSuccessful).toBe(true);
    expect(r.confirmedAt).toBe('2026-07-01T10:00:00Z');
    expect(r.startsAt).toBe('2026-07-02T19:00:00Z');
  });
  it('visibility verilmezse OPEN varsayılır', () => {
    expect(mapAdminMatchRowToListing(row({})).visibility).toBe('OPEN');
  });
  it('PRIVATE dışındaki değerler OPEN olur', () => {
    expect(mapAdminMatchRowToListing(row({ visibility: 'whatever' })).visibility).toBe('OPEN');
  });
});

describe('listingToMatchPayload — tarih çözümleme', () => {
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const offsetIso = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  it('rawDate verilirse aynen kullanılır', () => {
    expect(listingToMatchPayload({ rawDate: '2026-08-15' }).date).toBe('2026-08-15');
  });
  it('"Bugün" → bugünün ISO tarihi', () => {
    expect(listingToMatchPayload({ date: 'Bugün' }).date).toBe(todayIso());
  });
  it('"Yarın" → yarının ISO tarihi', () => {
    expect(listingToMatchPayload({ date: 'Yarın' }).date).toBe(offsetIso(1));
  });
  it('DD.MM.YYYY → YYYY-MM-DD (sıfır dolgulu)', () => {
    expect(listingToMatchPayload({ date: '27.06.2026' }).date).toBe('2026-06-27');
    expect(listingToMatchPayload({ date: '5.7.2026' }).date).toBe('2026-07-05');
  });
  it('DD/MM/YYYY ayraçı da kabul edilir', () => {
    expect(listingToMatchPayload({ date: '09/12/2026' }).date).toBe('2026-12-09');
  });
  it('ISO tarih (YYYY-MM-DD) aynen korunur', () => {
    expect(listingToMatchPayload({ date: '2026-06-27' }).date).toBe('2026-06-27');
  });
  it('tanınmayan tarih → bugüne düşer (kırılmaz)', () => {
    expect(listingToMatchPayload({ date: 'Çarşamba' }).date).toBe(todayIso());
  });
});

describe('listingToMatchPayload — FAZ 3 alanları payloada girer', () => {
  it('visibility ve pitch_id gönderilir', () => {
    const p = listingToMatchPayload({ rawDate: '2026-08-15', visibility: 'PRIVATE', pitchId: 'p7' });
    expect(p.visibility).toBe('PRIVATE');
    expect(p.pitch_id).toBe('p7');
  });
  it('visibility yoksa anahtar HİÇ gitmez (kısmi güncelleme PRIVATE maçı OPEN yapmasın), pitchId yoksa null', () => {
    const p = listingToMatchPayload({ rawDate: '2026-08-15' });
    expect('visibility' in p).toBe(false);
    expect(p.pitch_id).toBeNull();
  });
  it('status verilmezse ACTIVE varsayılır', () => {
    expect(listingToMatchPayload({ rawDate: '2026-08-15' }).status).toBe('ACTIVE');
  });
});
