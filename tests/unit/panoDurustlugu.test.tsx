/**
 * PANO DÜRÜSTLÜĞÜ — "yaptım" deyip yapmayan düğmeler (17 Ağustos 2026)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * KUSUR: üç ekranda "kopyala/paylaş" düğmesi sonucu HİÇ kontrol etmiyordu.
 *
 *   1. views/MatchTicket.tsx — `await navigator.clipboard?.writeText(text)`
 *      çağrısının ARDINDAN KOŞULSUZ "Rezervasyon bilgisi kopyalandı." yazıyordu.
 *      `?.` erişimi API yoksa HATA ATMAZ: sessizce `undefined` döner, `await
 *      undefined` de sorunsuz geçer. Yani hiçbir şey kopyalanmadan başarı
 *      mesajı çıkıyordu.
 *   2. views/social/FriendAddView.tsx — `catch { }` (pano izni yoksa sessiz).
 *   3. views/MatchCreate.tsx — `catch { }` (pano yok).
 *      2 ve 3'te kullanıcı düğmeye basıyor, hiçbir şey olmuyor, hiçbir şey
 *      söylenmiyor.
 *
 * NEDEN MUTAT DURUM: Pano API'si paketlenmiş uygulamada çoğu zaman YOKTUR —
 * iOS'ta uygulama özel şemadan yüklenir (capacitor.config.ts · scheme 'OYNA'),
 * bu güvenli bağlam sayılmaz; Android WebView'da da ne `navigator.clipboard`
 * ne `navigator.share` vardır (bkz. utils/dosyaKaydet.ts başındaki açıklama).
 *
 * BU DOSYA NEYİ KİLİTLER: "başarı mesajı YALNIZ gerçekten başarılıysa" kuralını,
 * üç ekranda da DAVRANIŞSAL olarak — sahte bir `navigator` ile düğmeye basılır
 * ve ekranın ne söylediğine bakılır. Düzeltme geri alınırsa (koşulsuz başarı
 * mesajı / boş catch) bu testler KIRMIZI döner.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Sahte navigator yüzeyleri ───────────────────────────────────────────────

type Nav = Navigator & { clipboard?: unknown; share?: unknown };
const nav = () => navigator as Nav;

/** Panoyu kur. `null` → API HİÇ YOK (iOS özel şema / Android WebView). */
function panoKur(writeText: ((t: string) => Promise<void>) | null) {
  if (writeText === null) {
    Object.defineProperty(nav(), 'clipboard', { value: undefined, configurable: true, writable: true });
    return;
  }
  Object.defineProperty(nav(), 'clipboard', {
    value: { writeText }, configurable: true, writable: true,
  });
}

/** Sistem paylaşım sayfasını kur. `null` → API yok. */
function paylasimKur(share: ((d: unknown) => Promise<void>) | null) {
  Object.defineProperty(nav(), 'share', {
    value: share ?? undefined, configurable: true, writable: true,
  });
}

const abortHatasi = () => Object.assign(new Error('iptal'), { name: 'AbortError' });

// ── Modül taklitleri ────────────────────────────────────────────────────────

// Global setup'taki supabase taklidi `single()` için promise DÖNDÜRMÜYOR;
// FriendAddView `.single().then(...)` çağırdığı için orada patlardı.
vi.mock('../../supabaseClient', () => {
  const zincir: Record<string, unknown> = {};
  zincir.select = () => zincir;
  zincir.eq = () => zincir;
  zincir.maybeSingle = () => Promise.resolve({ data: null, error: null });
  zincir.single = () => Promise.resolve({ data: { oyna_id: 'kerem34' }, error: null });
  return { supabase: { from: () => zincir } };
});

vi.mock('../../services/socialService', () => ({
  searchUsers: vi.fn(async () => []),
  getRecentTeammates: vi.fn(async () => []),
  getFriendSuggestions: vi.fn(async () => []),
  getFriends: vi.fn(async () => []),
  sendFriendRequest: vi.fn(async () => ({ state: 'PENDING_OUT', request_id: 'r1' })),
  cancelFriendRequest: vi.fn(async () => undefined),
  respondFriendRequest: vi.fn(async () => undefined),
  getOrCreateReferralCode: vi.fn(async () => 'KEREM7'),
  parseSocialError: (e: unknown) => (e as Error)?.message ?? 'hata',
}));

vi.mock('../../services/contactsService', () => ({
  syncContactsAndMatch: vi.fn(async () => ({ matched: [], invitable: [] })),
  isContactsAvailable: () => false,
}));

// MatchCreate'in kullandığı global toast kanalı — ne söylendiğini buradan okuruz.
const toastKaydi: { mesaj: string; tur: string }[] = [];
vi.mock('../../components/common/GlobalToast', () => ({
  showToast: (mesaj: string, tur = 'error') => { toastKaydi.push({ mesaj, tur }); },
  GlobalToast: () => null,
}));

import MatchTicket from '../../views/MatchTicket';
import FriendAddView from '../../views/social/FriendAddView';
import { panoyaKopyala, kopyalaVeBildir } from '../../views/MatchCreate';

/** Gerçekten kopyalandığında kullanılabilecek başarı ifadeleri. */
const BASARI = /(kopyalandı|kopyalanmıştır)/i;
/** Dürüst başarısızlık ifadeleri. */
const BASARISIZ = /kopyalanamadı/i;

beforeEach(() => {
  toastKaydi.length = 0;
  panoKur(null);
  paylasimKur(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1) BİLET PAYLAŞ — views/MatchTicket.tsx
// ════════════════════════════════════════════════════════════════════════════

describe('Bilet · Paylaş düğmesi yalan söylemiyor', () => {
  const bileti = () => render(<MatchTicket onBack={vi.fn()} />);
  const paylasDugmesi = () => screen.getByRole('button', { name: /^Paylaş$/ });

  it('pano ve paylaşım YOKKA "kopyalandı" DEMEZ (asıl kusur)', async () => {
    // iOS özel şema / Android WebView: iki API de yok.
    bileti();
    fireEvent.click(paylasDugmesi());

    const durum = await screen.findByRole('status');
    expect(durum.textContent ?? '').toMatch(BASARISIZ);
    expect(durum.textContent ?? '').not.toMatch(BASARI);
  });

  it('pano GERÇEKTEN yazınca "kopyalandı" der ve metni yazar', async () => {
    const yazilan: string[] = [];
    panoKur(async (t) => { yazilan.push(t); });
    bileti();
    fireEvent.click(paylasDugmesi());

    const durum = await screen.findByRole('status');
    expect(durum.textContent ?? '').toMatch(BASARI);
    expect(yazilan).toHaveLength(1);
    expect(yazilan[0]).toContain('OYNA rezervasyonum');
  });

  it('pano yazma REDDEDİLİRSE başarı uydurulmaz', async () => {
    // Pano izni verilmemiş / belge odakta değil.
    panoKur(async () => { throw new Error('NotAllowedError'); });
    bileti();
    fireEvent.click(paylasDugmesi());

    const durum = await screen.findByRole('status');
    expect(durum.textContent ?? '').toMatch(BASARISIZ);
    expect(durum.textContent ?? '').not.toMatch(BASARI);
  });

  it('sistem paylaşımı çalışınca panoya düşmez ve fazladan mesaj yazmaz', async () => {
    const paylasilan: unknown[] = [];
    const yazilan: string[] = [];
    paylasimKur(async (d) => { paylasilan.push(d); });
    panoKur(async (t) => { yazilan.push(t); });
    bileti();
    fireEvent.click(paylasDugmesi());

    await waitFor(() => expect(paylasilan).toHaveLength(1));
    expect(yazilan).toEqual([]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('kullanıcı paylaşımdan VAZGEÇİNCE panoya düşülmez, mesaj yazılmaz', async () => {
    const yazilan: string[] = [];
    paylasimKur(async () => { throw abortHatasi(); });
    panoKur(async (t) => { yazilan.push(t); });
    bileti();
    fireEvent.click(paylasDugmesi());

    // Vazgeçtikten sonra sessizce panoya kopyalayıp "kopyalandı" demek de yalandır.
    await waitFor(() => expect(yazilan).toEqual([]));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2) OYNA-ID KOPYALA — views/social/FriendAddView.tsx
// ════════════════════════════════════════════════════════════════════════════

describe('Arkadaş Ekle · "Kopyala" sessizce yutmuyor', () => {
  const ekrani = () => render(<FriendAddView onBack={vi.fn()} onNavigate={vi.fn()} />);
  const kopyalaDugmesi = async () =>
    (await screen.findByRole('button', { name: /^Kopyala$/ }));

  it('pano YOKKA kullanıcıya söylenir ve ID elle yazılabilsin diye gösterilir', async () => {
    ekrani();
    // ID sunucudan gelene kadar bekle (yoksa düğme erken çıkar).
    await screen.findByText('@kerem34');
    fireEvent.click(await kopyalaDugmesi());

    const bildirim = await screen.findByText(BASARISIZ);
    expect(bildirim.textContent ?? '').toContain('@kerem34');
    // Sahte onay AÇILMAMALI.
    expect(screen.queryByRole('button', { name: /^Kopyalandı$/ })).toBeNull();
  });

  it('pano ÇALIŞINCA onay göstergesi açılır', async () => {
    const yazilan: string[] = [];
    panoKur(async (t) => { yazilan.push(t); });
    ekrani();
    await screen.findByText('@kerem34');
    fireEvent.click(await kopyalaDugmesi());

    await screen.findByRole('button', { name: /^Kopyalandı$/ });
    expect(yazilan).toEqual(['@kerem34']);
    expect(screen.queryByText(BASARISIZ)).toBeNull();
  });

  it('pano yazma REDDEDİLİRSE onay açılmaz, dürüst uyarı çıkar', async () => {
    panoKur(async () => { throw new Error('NotAllowedError'); });
    ekrani();
    await screen.findByText('@kerem34');
    fireEvent.click(await kopyalaDugmesi());

    await screen.findByText(BASARISIZ);
    expect(screen.queryByRole('button', { name: /^Kopyalandı$/ })).toBeNull();
  });

  it('davet paylaşımı: pano yoksa "kopyalandı" DEMEZ, bağlantıyı EKRANDA BIRAKIR', async () => {
    ekrani();
    fireEvent.click(await screen.findByRole('button', { name: /^Paylaş$/ }));

    // Kurtarma yolu KALICI olmalı: bildirim şeridi 2,4 saniyede kayboluyor ve
    // `pointer-events-none` olduğu için metni seçmek de mümkün değil. Yani
    // bağlantı yalnız orada yazsaydı "elle paylaş" önerisi gerçekte işlemezdi.
    const kalici = await screen.findByText('https://oyna.app/davet/KEREM7');
    expect(kalici.className, 'bağlantı seçilebilir olmalı').toContain('select-all');

    // Ve hiçbir yerde sahte başarı yok.
    expect(screen.queryByText(/kopyalandı(?!.*—)/i)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3) MAÇ KODU KOPYALA — views/MatchCreate.tsx
// ════════════════════════════════════════════════════════════════════════════
//
// Bu ekranın kopyala düğmesi ancak maç YAYINLANDIKTAN sonraki başarı
// sayfasında görünür (tesis→saha→saat→yayınla akışının tamamı gerekir), o
// yüzden mantık dışa açılıp doğrudan sürülüyor: `kopyalaVeBildir` hem panoya
// yazar hem sonucu SÖYLER, hem de çağıranın onay göstergesini açıp
// açmayacağını belirleyen değeri döndürür.

describe('Maç Kur · kod kopyalama sonucu söyleniyor', () => {
  it('pano YOKKA false döner ve kullanıcıya hata söylenir', async () => {
    const oldu = await kopyalaVeBildir('ABC123', null, 'Kod kopyalanamadı, elle gir: ABC123');
    expect(oldu).toBe(false);
    expect(toastKaydi).toHaveLength(1);
    expect(toastKaydi[0].mesaj).toMatch(BASARISIZ);
    expect(toastKaydi[0].mesaj).toContain('ABC123');   // elle girilebilsin
    expect(toastKaydi[0].tur).toBe('error');
  });

  it('pano yazma REDDEDİLİRSE de false döner (sessiz yutma yok)', async () => {
    panoKur(async () => { throw new Error('NotAllowedError'); });
    const oldu = await kopyalaVeBildir('ABC123', null, 'Kod kopyalanamadı, elle gir: ABC123');
    expect(oldu).toBe(false);
    expect(toastKaydi[0]?.mesaj).toMatch(BASARISIZ);
  });

  it('pano ÇALIŞINCA true döner, hata toast\'ı çıkmaz', async () => {
    const yazilan: string[] = [];
    panoKur(async (t) => { yazilan.push(t); });
    const oldu = await kopyalaVeBildir('ABC123', null, 'Kod kopyalanamadı, elle gir: ABC123');
    expect(oldu).toBe(true);
    expect(yazilan).toEqual(['ABC123']);
    expect(toastKaydi).toEqual([]);                    // gereksiz gürültü yok
  });

  it('başarı mesajı verilmişse YALNIZ gerçek kopyalamada yazılır', async () => {
    panoKur(async () => { throw new Error('NotAllowedError'); });
    await kopyalaVeBildir('metin', 'Davet metni kopyalandı', 'Davet metni kopyalanamadı.');
    expect(toastKaydi.map(t => t.mesaj)).not.toContain('Davet metni kopyalandı');

    toastKaydi.length = 0;
    panoKur(async () => { /* başarılı */ });
    await kopyalaVeBildir('metin', 'Davet metni kopyalandı', 'Davet metni kopyalanamadı.');
    expect(toastKaydi).toEqual([{ mesaj: 'Davet metni kopyalandı', tur: 'success' }]);
  });

  it('panoyaKopyala · API yoksa PATLAMAZ, false döner', async () => {
    // Asıl tuzak: `navigator.clipboard?.writeText(x)` hata atmaz, `undefined`
    // döner — bu yüzden "hata çıkmadı = başarılı" varsayımı YANLIŞTIR.
    await expect(panoyaKopyala('x')).resolves.toBe(false);
  });

  it('panoyaKopyala · writeText fonksiyon değilse false döner', async () => {
    Object.defineProperty(nav(), 'clipboard', {
      value: {}, configurable: true, writable: true,
    });
    await expect(panoyaKopyala('x')).resolves.toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3b · DÜĞMENİN EKRANA BAĞLANDIĞI SATIR da kilitli olmalı
// ─────────────────────────────────────────────────────────────────────────────
//
// Denetçi somut bir boşluk gösterdi: yardımcı fonksiyon testliydi ama onu
// "Kod kopyalandı ✓" göstergesine bağlayan satır değildi. O satır koşulsuz
// `setCopied(true)` hâline döndürüldüğünde 15 testin 15'i de yeşil kalıyordu —
// yani kullanıcının GÖRDÜĞÜ yalan geri gelebiliyordu.
describe('Maç Kur · onay göstergesi sonuca BAĞLI', () => {
  const kaynak = readFileSync(join(process.cwd(), 'views/MatchCreate.tsx'), 'utf8');

  it('"Kod kopyalandı ✓" yazısı yalnız kopyalama BAŞARILIYSA açılır', () => {
    // Kritik satır: setCopied(true) koşulsuz çağrılmamalı.
    const govde = kaynak.slice(kaynak.indexOf('const copyCode'), kaynak.indexOf('// ── Görsel yardımcılar'));
    expect(govde).toMatch(/if\s*\(await kopyalaVeBildir\([^)]*\)\)\s*setCopied\(true\)/);
    // Koşulsuz kullanım geri gelirse burası kırmızı döner.
    expect(govde).not.toMatch(/^\s*setCopied\(true\);/m);
  });

  it('gösterge metni gerçekten bu duruma bağlı çiziliyor', () => {
    expect(kaynak).toMatch(/copied \? 'Kod kopyalandı ✓'/);
  });
});
