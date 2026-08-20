// IP-04 — Maçtan ayrılma sözleşmesi.
//
// Kilitlenen davranış: ayrılma modalı HİÇBİR durumda para konusunda sessiz
// kalamaz. Eskiden `refundable > 0` değilse kutu hiç çizilmiyordu; sunucu 0
// döndüğünde de RPC patladığında da modal aynı görünüyor, kullanıcı 150₺'yi
// uyarısız kaybediyordu (BULGU-087). Artı: geç ayrılmada yanan tutar ve
// güvenilirlik cezası basılmadan AYRIL'a basılamaz (BULGU-077).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

const { leaveQuoteMessage, previewLeaveMatch, leaveMatchSlot } = await import('../../services/matchService');
type Quote = Awaited<ReturnType<typeof previewLeaveMatch>>;

const quote = (over: Partial<Quote> = {}): Quote => ({
  refundable: 0, paid: 0, alreadyRefunded: false, inSquad: true,
  hoursToStart: 48, refundPct: 100, fullHours: 24, halfHours: 6, halfPct: 50,
  late: false, penalty: 0, forfeited: 0,
  // Kart dönemi + kaptan bağlamı (20 Ağu 2026)
  pspFee: 0, isCaptain: false, squadOthers: 0, captainCancelsMatch: false,
  depositStatus: 'NONE', depositAmount: 0, depositCharged: 0,
  depositRefundable: 0, depositLate: false,
  ...over,
});

describe('leaveQuoteMessage — hiçbir dal sessiz değil', () => {
  it('altı durumun her biri boş olmayan Türkçe metin döner', () => {
    const hepsi = [
      leaveQuoteMessage(null, false, true),                                   // yedek
      leaveQuoteMessage(null, true, false),                                   // yükleniyor
      leaveQuoteMessage(null, false, false),                                  // hesaplanamadı
      leaveQuoteMessage(quote({ late: true, penalty: 10, forfeited: 150, refundPct: 0 }), false, false),
      leaveQuoteMessage(quote({ refundable: 150, paid: 150 }), false, false),
      leaveQuoteMessage(quote({ paid: 0 }), false, false),                    // iade yok
    ];
    for (const m of hepsi) expect(m.text.trim().length).toBeGreaterThan(10);
    expect(new Set(hepsi.map(m => m.tone)).size).toBe(6); // altı ayrı ton
  });

  it('yedeklik: para/ceza uyarısı çıkmaz', () => {
    const m = leaveQuoteMessage(null, false, true);
    expect(m.tone).toBe('reserve');
    expect(m.text).toMatch(/iade veya puan kaybı yok/i);
  });

  it('yedeklik yükleniyor/hata durumunu EZER (yedekte beklemeye gerek yok)', () => {
    expect(leaveQuoteMessage(null, true, true).tone).toBe('reserve');
    expect(leaveQuoteMessage(quote({ late: true }), false, true).tone).toBe('reserve');
  });

  it('önizleme alınamadı: "hesaplanamadı" der, 0₺ demez', () => {
    const m = leaveQuoteMessage(null, false, false);
    expect(m.tone).toBe('unknown');
    expect(m.text).toMatch(/hesaplanamadı/i);
    expect(m.text).not.toMatch(/₺/);
  });

  it('<6 saat kademesi: tamamı yanar, 6 saat eşiği ve ceza yazılır', () => {
    const m = leaveQuoteMessage(
      quote({ late: true, penalty: 10, refundPct: 0, refundable: 0, forfeited: 150, paid: 150, hoursToStart: 2 }),
      false, false);
    expect(m.tone).toBe('late');
    expect(m.text).toContain('6 saatten az');
    expect(m.text).toContain('150₺');
    expect(m.text).toMatch(/iade edilmez/i);
    expect(m.text).toMatch(/güvenilirlik puanın 10 düşer/i);
  });

  it('6–24 saat kademesi: %50 döner, kesinti ve kalan — ÜÇÜ de yazılır', () => {
    // Sözleşme md.6.1 orta kademesi (kart dönemi, 20 Ağu 2026): iade kademesi
    // ÇEKİLEN tutar üzerinden hesaplanır, ödeme altyapısı kesintisi açıkça
    // yazılır ve para KARTA döner — sessizce "iade yok" da "cüzdan" da denemez.
    const m = leaveQuoteMessage(
      quote({ late: true, penalty: 10, refundPct: 50, refundable: 70, forfeited: 75,
              paid: 150, pspFee: 5, hoursToStart: 10 }),
      false, false);
    expect(m.tone).toBe('late');
    expect(m.text).toContain('24 saatten az');
    expect(m.text).toContain('%50');
    expect(m.text).toContain('150₺');
    expect(m.text).toContain('5₺');
    expect(m.text).toContain('70₺');
    expect(m.text).toMatch(/kartına iade edilir/i);
    expect(m.text).toMatch(/iade edilmez/i);
  });

  it('geç ayrılma ama ödeme yok (misafir): para cümlesi kurulmaz, ceza yazılır', () => {
    const m = leaveQuoteMessage(
      quote({ late: true, penalty: 10, refundPct: 0, forfeited: 0, paid: 0 }), false, false);
    expect(m.tone).toBe('late');
    expect(m.text).not.toMatch(/₺/);
    expect(m.text).toMatch(/güvenilirlik puanın 10 düşer/i);
  });

  it('erken ayrılma: iade tutarı kanonik biçimde basılır, kesinti açıkça yazılır', () => {
    // IP-19: tam sayıda ondalık YOK. Eskiden "1.500,00₺" yazıyordu; aynı
    // kullanıcı aynı akışta Sahalar'da "₺1500" görüyordu.
    const m = leaveQuoteMessage(quote({ refundable: 1450, paid: 1500, pspFee: 50 }), false, false);
    expect(m.tone).toBe('refund');
    expect(m.text).toContain('1.450₺');
    expect(m.text).toContain('1.500₺');
    expect(m.text).toContain('50₺');
    expect(m.text).not.toContain('1.450,00₺');
    expect(m.text).toMatch(/kartına iade edilir/i);
  });

  it('kart dili: iade KARTA döner — "cüzdanına döner" artık hiçbir dalda kullanılmaz', () => {
    // Kurucu kararı (16-20 Ağu 2026): cüzdan kaldırıldı, iadeler karta gider.
    const dallar = [
      leaveQuoteMessage(quote({ refundable: 150, paid: 150 }), false, false),
      leaveQuoteMessage(quote({ late: true, refundPct: 50, refundable: 70, paid: 150, pspFee: 5, penalty: 10 }), false, false),
      leaveQuoteMessage(quote({ captainCancelsMatch: true, isCaptain: true, depositStatus: 'BLOCKED', depositCharged: 110, depositRefundable: 105 }), false, false),
    ];
    for (const m of dallar) {
      expect(m.text).not.toMatch(/cüzdan/i);
      expect(m.text).toMatch(/kartına iade|kartından para çekilmez/i);
    }
  });

  it('kaptan yalnızsa: ayrılış = maç iptali, kapora sonucu açıkça yazılır', () => {
    // Kurucu kararı (20 Ağu 2026): kadroda başka oyuncu yoksa kaptanın
    // ayrılışı maçı iptal eder. Kapora durumu üç halde de dürüstçe söylenir.
    const erken = leaveQuoteMessage(
      quote({ captainCancelsMatch: true, isCaptain: true, depositStatus: 'BLOCKED',
              depositCharged: 110, depositRefundable: 105 }), false, false);
    expect(erken.text).toMatch(/maç iptal edilir/i);
    expect(erken.text).toContain('105₺');
    expect(erken.tone).toBe('refund');

    const gec = leaveQuoteMessage(
      quote({ captainCancelsMatch: true, isCaptain: true, depositStatus: 'BLOCKED',
              depositCharged: 110, depositRefundable: 0, depositLate: true, fullHours: 24 }), false, false);
    expect(gec.text).toMatch(/maç iptal edilir/i);
    expect(gec.text).toMatch(/iade edilmez/i);
    expect(gec.text).toContain('110₺');
    expect(gec.tone).toBe('late');

    const odenmemis = leaveQuoteMessage(
      quote({ captainCancelsMatch: true, isCaptain: true, depositStatus: 'AWAITING_PAYMENT' }), false, false);
    expect(odenmemis.text).toMatch(/kartından para çekilmez/i);
  });

  it('kaptan ama kadroda başkaları var: kaptanlık devri yazılır, iptal yazılmaz', () => {
    const m = leaveQuoteMessage(
      quote({ isCaptain: true, squadOthers: 5, refundable: 150, paid: 150 }), false, false);
    expect(m.text).toMatch(/kaptanlık kadrodaki en güvenilir oyuncuya devredilir/i);
    expect(m.text).not.toMatch(/iptal/i);
  });

  it('iade yok: "zaten iade edilmişti" ile "tutar yok" ayrı ayrı söylenir', () => {
    expect(leaveQuoteMessage(quote({ alreadyRefunded: true, paid: 150 }), false, false).text)
      .toMatch(/zaten iade edilmişti/i);
    expect(leaveQuoteMessage(quote({ paid: 0 }), false, false).text)
      .toMatch(/iade edilecek tutar yok/i);
  });

  it('eşikler SUNUCUDAN gelir — tesis kademesi ezilirse metin de değişir', () => {
    // Tesis override: 48s tam / 12s %30 (pitches.refund_*).
    const m = leaveQuoteMessage(
      quote({ late: true, penalty: 5, refundPct: 30, refundable: 45, forfeited: 105,
              fullHours: 48, halfHours: 12, halfPct: 30, hoursToStart: 20 }), false, false);
    expect(m.text).toContain('48 saatten az');
    expect(m.text).toContain('%30');
  });
});

describe('previewLeaveMatch — sunucu sözleşmesini tipe çevirir', () => {
  beforeEach(() => rpc.mockReset());

  it('snake_case alanları camelCase\'e eşler (kaptan/kapora alanları dahil)', async () => {
    rpc.mockResolvedValue({
      data: {
        refundable: 70, paid: 150, already_refunded: false, in_squad: true,
        hours_to_start: 10, refund_pct: 50, full_hours: 24, half_hours: 6, half_pct: 50,
        late: true, penalty: 10, forfeited: 75, psp_fee: 5,
        is_captain: true, squad_others: 3, captain_cancels_match: false,
        deposit_status: 'BLOCKED', deposit_amount: 100, deposit_charged: 110,
        deposit_refundable: 105.5, deposit_late: false,
      },
      error: null,
    });
    expect(await previewLeaveMatch('m1')).toEqual({
      refundable: 70, paid: 150, alreadyRefunded: false, inSquad: true,
      hoursToStart: 10, refundPct: 50, fullHours: 24, halfHours: 6, halfPct: 50,
      late: true, penalty: 10, forfeited: 75, pspFee: 5,
      isCaptain: true, squadOthers: 3, captainCancelsMatch: false,
      depositStatus: 'BLOCKED', depositAmount: 100, depositCharged: 110,
      depositRefundable: 105.5, depositLate: false,
    });
  });

  it('HATA FIRLATIR — sessizce 0 iade dönmez (BULGU-087 kök nedeni)', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('network') });
    await expect(previewLeaveMatch('m1')).rejects.toThrow();
  });

  it('boş cevapta eşik varsayılanları sözleşmeyle aynı (24 / 6 / %50)', async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    const q = await previewLeaveMatch('m1');
    expect(q.fullHours).toBe(24);
    expect(q.halfHours).toBe(6);
    expect(q.halfPct).toBe(50);
    expect(q.late).toBe(false);
    expect(q.refundable).toBe(0);
  });
});

describe('leaveMatchSlot', () => {
  beforeEach(() => rpc.mockReset());

  it('RPC\'yi doğru parametrelerle çağırır', async () => {
    rpc.mockResolvedValue({ error: null });
    await leaveMatchSlot('m1', 'u1');
    expect(rpc).toHaveBeenCalledWith('leave_public_match_slot', { p_match_id: 'm1', p_user_id: 'u1' });
  });

  it('sunucu hatasını yutmaz', async () => {
    rpc.mockResolvedValue({ error: new Error('Kullanıcı maça kayıtlı değil!') });
    await expect(leaveMatchSlot('m1', 'u1')).rejects.toThrow(/kayıtlı değil/);
  });
});
