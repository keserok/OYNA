// ════════════════════════════════════════════════════════════════════════════
// MÜŞTERİ (MÜDAVİM) DEFTERİ — 8 kurucu kararının bekçisi
// ════════════════════════════════════════════════════════════════════════════
//
// Tasarım: docs/master/MUSTERI_DEFTERI_TASARIMI.md (9 Ağustos 2026).
// Bu test, kararların koddan sessizce geri dönmesini engeller:
//   kayıtlar kendiliğinden düşer · geçmişten doldurulur · personel de kullanır ·
//   giriş Menü'den · gelmedi/iptal görünür · tekrar rezervasyon · telefonsuzlar işaretli.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextSameWeekdayISO } from '../../services/customerService';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const migration = oku('supabase/migrations/20260906000000_musteri_defteri.sql');

describe('nextSameWeekdayISO — "geçen haftanın aynısı" tarih hesabı', () => {
  // 2026-08-12 Çarşamba · bugün 2026-08-09 Pazar olsun.
  it('haftanın aynı gününün bugünden SONRAKİ ilkini verir', () => {
    expect(nextSameWeekdayISO('2026-08-05', '2026-08-09')).toBe('2026-08-12'); // Çarşamba
  });
  it('bugün o günse bir sonraki haftaya atar', () => {
    expect(nextSameWeekdayISO('2026-08-02', '2026-08-09')).toBe('2026-08-16'); // Pazar → haftaya Pazar
  });
  it('çok eski rezervasyon da yarına değil doğru güne oturur', () => {
    expect(nextSameWeekdayISO('2026-06-01', '2026-08-09')).toBe('2026-08-10'); // Pazartesi
  });
  it('bozuk tarihte girdiyi aynen döndürür (çökmez)', () => {
    expect(nextSameWeekdayISO('bozuk', '2026-08-09')).toBe('bozuk');
  });
});

describe('migration — tablo, güvenlik, tetikleyici, geçmiş doldurma', () => {
  it('defter tablosu RLS ile ve telefon-kimlik teklikiyle kurulur', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.pitch_customers');
    expect(migration).toContain('ALTER TABLE public.pitch_customers ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ux_pitch_customers_phone');
  });

  it('personel de erişir (karar 4): dört politika ekip modeliyle', () => {
    expect(migration).toContain('public.can_staff_pitch(pitch_id)');
    expect(migration).toContain('pc_manage_delete'); // silme yalnız sahip+müdür
  });

  it('üç kaynaktan kendiliğinden dolar (karar 1): rezervasyon + veresiye + abonman', () => {
    expect(migration).toContain('trg_musteri_booking');
    expect(migration).toContain('trg_musteri_debtor');
    expect(migration).toContain('trg_musteri_subscription');
  });

  it('uygulama içi (APP) rezervasyonlar deftere GİRMEZ', () => {
    expect(migration).toContain("IN ('OWNER_MANUAL', 'SUBSCRIPTION')");
  });

  it('geçmişten doldurma üç kaynağı da tarar (karar 2)', () => {
    expect(migration).toContain('FROM public.pitch_bookings b');
    expect(migration).toContain('FROM public.pitch_debtors d');
    expect(migration).toContain('FROM public.pitch_subscriptions s');
  });

  it('telefon normalizasyonu istemcidekiyle aynı kural (waNumber)', () => {
    expect(migration).toContain('_tr_telefon_norm');
    expect(migration).toContain("'90' || substr");
  });

  it('gelmedi işareti ve kart/arama fonksiyonları kurulur (karar 6)', () => {
    expect(migration).toContain('booking_gelmedi_isaretle');
    expect(migration).toContain('search_pitch_customers');
    expect(migration).toContain('musteri_karti');
    expect(migration).toContain('no_show');
  });

  it('kendi doğrulamasını taşır (prensip 7.7)', () => {
    expect(migration).toContain('DOGRULAMA');
  });
});

describe('ekran bağları', () => {
  const takvim = oku('views/owner/calendar/FinancialCalendarView.tsx');
  const menu = oku('views/owner/menu/OwnerMenuView.tsx');
  const modal = oku('views/owner/menu/OwnerCustomersModal.tsx');
  const panel = oku('views/OwnerPanel.tsx');
  const detay = oku('views/owner/OwnerBookingDetailModal.tsx');

  it('hızlı rezervasyon formunda defter önerisi var', () => {
    expect(takvim).toContain('searchPitchCustomers');
    expect(takvim).toContain('pickCustomer');
  });

  it('Menüdeki "Müşteri Defteri" satırı KİLİTSİZ (personel de kullanır)', () => {
    // Menü cilasından sonra yönetim satırları gizlenmek yerine "locked" rozetiyle
    // duruyor; Müşteri Defteri ise herkese açık — satırında kilit olmamalı.
    const satir = menu.indexOf('label="Müşteri Defteri"');
    expect(satir).toBeGreaterThan(-1);
    expect(menu.slice(satir, satir + 220)).not.toContain('locked');
  });

  it('müşteri kartı: gelmedi/iptal + veresiye + tekrar rezervasyon + telefon tamamlama', () => {
    expect(modal).toContain('Gelmedi · İptal');
    expect(modal).toContain('nextSameWeekdayISO');
    expect(modal).toContain('setCustomerPhone');
    expect(modal).toContain('telefonu eksik');
  });

  it('panel modalı bağlıyor ve karttan takvime atlanabiliyor', () => {
    expect(panel).toContain('OwnerCustomersModal');
    expect(panel).toContain('setCustomersOpen');
  });

  it('Gelmedi düğmesi istatistik işaretini de basıyor', () => {
    expect(detay).toContain('markBookingNoShow');
  });
});
