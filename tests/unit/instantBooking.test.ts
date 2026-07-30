// IP-22 bekçisi — rezervasyon onay sistemi ve tesis başvurusu kaldırıldı.
//
// Kilitlenen sözler:
//   1. Rezervasyon oluşturulur oluşturulmaz kesinleşir; "onay bekleyen" diye
//      bir durum, bir sayaç, bir kuyruk YOK.
//   2. Tesisler yönetici tarafından tanımlanır; kullanıcı kendi kendine tesis
//      başvurusu yapamaz, "tesisin onaylanmadı" ekranı yoktur.
//   3. Tesis sahibi kesinleşmiş rezervasyonu hâlâ iptal edebilir — ama iptalin
//      parasal sonucu (ödeme altyapısı ücreti) onay penceresinde YAZAR.
//
// Bu testler kaynak dosyaları OKUR. Tarayıcı testi değildir; amaç kaldırılan
// akışın bir daha sessizce geri sızmamasıdır.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');
const varMi = (p: string) => existsSync(join(KOK, p));

/** Uygulama kaynağı (yönetici paneli hariç — o ayrı bir iş paketinde). */
function kaynaklar(): string[] {
  const out: string[] = [];
  const gez = (d: string) => {
    for (const ad of readdirSync(join(KOK, d))) {
      const rel = `${d}/${ad}`;
      if (statSync(join(KOK, rel)).isDirectory()) gez(rel);
      else if (/\.tsx?$/.test(ad)) out.push(rel);
    }
  };
  gez('views');
  gez('components');
  gez('services');
  gez('hooks');
  return [...out, 'App.tsx', 'types.ts', 'store.ts'];
}

const GOC = 'supabase/migrations/20260831000000_ip22_onay_sistemi_kaldirildi.sql';

describe('rezervasyon anında kesinleşir', () => {
  const sql = oku(GOC);

  it('sunucu her rezervasyonu kesinleşmiş yazıyor', () => {
    // Eski hâl: kaynağa ve tesis ayarına göre 'PENDING' veya 'CONFIRMED'.
    const govde = sql.slice(sql.indexOf('FUNCTION public.create_pitch_booking'));
    const insert = govde.slice(govde.indexOf('INSERT INTO public.pitch_bookings'));
    expect(insert).toContain("'CONFIRMED', p_source");
    // Durum artık dallanmıyor: karar değişkeni bile kalmadı.
    expect(govde.slice(0, govde.indexOf('INSERT INTO public.pitch_bookings'))).not.toContain('v_status');
  });

  it('dakikada bir çalışan otomatik onay işi durduruldu', () => {
    expect(sql).toContain("cron.unschedule('auto_approve_bookings')");
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.auto_approve_pending_bookings()');
  });

  it('elle onay çağrısı da kaldırıldı', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.staff_approve_booking(uuid)');
  });

  it('bekleyen rezervasyon bırakılmadı', () => {
    expect(sql).toContain("UPDATE public.pitch_bookings SET status = 'CONFIRMED' WHERE status = 'PENDING'");
  });

  it('otomatik onay kolonları tabloda kalmadı', () => {
    expect(sql).toContain('ALTER TABLE public.pitches DROP COLUMN IF EXISTS auto_approve_enabled');
    expect(sql).toContain('ALTER TABLE public.pitches DROP COLUMN IF EXISTS auto_approve_minutes');
  });

  it('kolonu okuyan fonksiyonlar kolon DÜŞMEDEN ÖNCE yeniden yazıldı', () => {
    // Ters sırada uygulanırsa takvim ve demo kurucusu çalışma anında patlar.
    const dusme = sql.indexOf('DROP COLUMN IF EXISTS auto_approve_enabled');
    for (const fn of ['public.get_facility_schedule', 'public.seed_owner_demo', 'public.create_pitch_booking']) {
      expect(sql.indexOf(`FUNCTION ${fn}`), fn).toBeLessThan(dusme);
    }
  });

  it('geçmişe dönük "onaylandı" bildirimi göndermiyor', () => {
    // Bildirim fonksiyonu, veri düzeltmesinden ÖNCE güncellenir; böylece
    // 19 gün önceki maç için kimseye "rezervasyonun onaylandı" düşmez.
    expect(sql.indexOf('FUNCTION public.notify_booking_events'))
      .toBeLessThan(sql.indexOf("UPDATE public.pitch_bookings SET status = 'CONFIRMED'"));
  });
});

describe('uygulamada onay akışından eser kalmadı', () => {
  it('hiçbir kaynak dosya otomatik onaya atıf yapmıyor', () => {
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      oku(yol).split('\n').forEach((satir, i) => {
        if (/auto_approve|autoApprove|AutoApprove/.test(satir)) ihlal.push(`${yol}:${i + 1}`);
      });
    }
    expect(ihlal, `onay sistemi geri sızmış:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('Talepler sekmesi ve ekranı yok', () => {
    expect(varMi('views/owner/PendingActionsView.tsx')).toBe(false);
    const ihlal = kaynaklar().filter((y) => oku(y).includes('PENDING_ACTIONS'));
    expect(ihlal).toEqual([]);
  });

  it('rezervasyon işlemleri ayar penceresi yok', () => {
    expect(varMi('views/owner/menu/OwnerOperationsSettingsModal.tsx')).toBe(false);
    expect(oku('views/owner/menu/index.ts')).not.toContain('OwnerOperationsSettingsModal');
  });

  it('bekleyen talep sayacı besleyen servis çağrıları kaldırıldı', () => {
    const s = oku('services/pitchOwnerService.ts');
    for (const ad of ['getPendingBookings', 'approveBooking', 'rejectBooking', 'PitchOperationsSettings']) {
      expect(s, ad).not.toContain(ad);
    }
  });

  it('özet ekranında geri sayan onay kartı yok', () => {
    expect(oku('views/owner/home/OwnerHomeWidgets.tsx')).not.toContain('MatchCountdownItem');
    expect(oku('views/owner/menu/ownerMenuTypes.ts')).not.toContain('PENDING_REQUESTS');
  });

  it('alt barda ve üst şeritte "onay bekliyor" rozeti yok', () => {
    expect(oku('views/owner/components/OwnerBottomNav.tsx')).not.toContain('pendingCount');
    expect(oku('views/owner/components/OwnerKpiGrid.tsx')).not.toContain('pendingCount');
  });
});

describe('tesis başvurusu kaldırıldı', () => {
  it('başvuru ekranı ve rotası yok', () => {
    expect(varMi('views/PartnerOnboarding.tsx')).toBe(false);
    expect(oku('types.ts')).not.toContain('PARTNER_ONBOARDING');
    expect(oku('App.tsx')).not.toContain('PartnerOnboarding');
  });

  it('"Sahada Rolün" ekranı tesis rolüne başvuru sunmuyor', () => {
    const s = oku('components/settings/FieldRolePage.tsx');
    // Tesis satırı yalnız role ZATEN sahip olana çizilir.
    expect(s).toContain("ROLE_OPTS.filter((opt) => opt.r !== UserRole.OWNER || roles.includes(opt.r))");
  });

  it('tesis paneli olmayan bir kayıt akışını vaat etmiyor', () => {
    const s = oku('views/OwnerPanel.tsx');
    expect(s).not.toContain('TESİS KAYDI BAŞLAT');
    expect(s).not.toContain('onNeedOnboarding');
    expect(s).toContain('Hesabına bağlı tesis yok');
  });

  it('tesis onay durumu artık ekranlarda gezmiyor', () => {
    for (const yol of [
      'views/OwnerPanel.tsx',
      'views/owner/menu/OwnerMenuView.tsx',
      'views/owner/menu/ownerMenuTypes.ts',
    ]) {
      expect(oku(yol), yol).not.toContain('verificationStatus');
    }
  });

  it('vitrin sorguları tesisi onaya göre elemiyor', () => {
    // Yönetici bir tesis eklediğinde oyuncuda ANINDA görünmeli.
    expect(oku('views/PitchDiscovery.tsx')).not.toContain("eq('verification_status'");
    expect(oku('services/matchCreateService.ts')).not.toContain("eq('verification_status'");
  });
});

describe('tesis iptali — parasal sonuç önceden söyleniyor', () => {
  it('onay penceresi ödeme altyapısı ücretini yazıyor', () => {
    const s = oku('views/owner/OwnerBookingDetailModal.tsx');
    const blok = s.slice(s.indexOf("title: 'Rezervasyonu iptal et?'"));
    expect(blok.slice(0, 700)).toContain('Ödeme altyapısının bu tahsilat için kestiği ücret geri alınmaz');
    expect(blok.slice(0, 700)).toContain('sana yapılacak ödemeden düşülür');
  });

  it('iptal yeteneği KALDIRILMADI — yalnız uyarı eklendi', () => {
    expect(oku('views/owner/OwnerBookingDetailModal.tsx')).toContain('cancelConfirmedBooking(booking.id');
  });
});
