/**
 * DÖRT TEMİZLİK KİLİDİ (17 Ağustos 2026 — mağaza gönderimi öncesi)
 *
 * Her blok, denetimde bulunmuş somut bir kusurun geri gelmesini yakalar:
 *
 *   B9  — Ödemede kullanıcıyı uygulama DIŞINA (tarayıcıya) atan ölü fonksiyon.
 *   B10 — Üretim paketine giren console.log/debug/info ve debugger kalıntıları.
 *   B11 — Hakem profilinde doğrulanmamış "FIFA LİSANSLI" rozeti.
 *   1.2 — App Store'un istediği uygunsuz içerik SÜZGECİ (mesaj gönderim yolu).
 *
 * En kritik beklenti, süzgecin YANLIŞ POZİTİF üretmemesi: masum bir cümleyi
 * engellemek, bir küfrü kaçırmaktan daha kötüdür.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  uygunsuzMu,
  ilkUygunsuzKelime,
  metniNormalize,
  UYGUNSUZ_ICERIK_MESAJI,
} from '../../shared/icerikSuzgeci';

const KOK = path.resolve(__dirname, '../..');
const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');

/**
 * Yorumları ayıklayıp YALNIZ çalışan kodu döndürür.
 * Gerekli: kaldırılan şeylerin gerekçesi dosyada yorum olarak duruyor
 * ("payBookingDeposit BURADAN SİLİNDİ" gibi). Ham metinde arama yapan bir test
 * bu gerekçeyi kodun kendisi sanıp boşuna kırmızı yanardı.
 * `[^:]` koruması `https://` gibi adreslerin yorum sanılmasını engeller.
 */
const koduAl = (rel: string) =>
  oku(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// ═══════════════════════════════════════════════════════════════════════════
// B9 — uygulama dışına atan ölü ödeme fonksiyonu
// ═══════════════════════════════════════════════════════════════════════════
describe('B9 · ödeme akışı kullanıcıyı uygulama dışına atmaz', () => {
  const kod = koduAl('services/paymentService.ts');

  it('payBookingDeposit kodu tamamen kaldırıldı', () => {
    expect(kod).not.toContain('payBookingDeposit');
  });

  it('paymentService içinde tarayıcıya yönlendirme (window.location) kalmadı', () => {
    // Telefonda bu satır kullanıcıyı webview'dan koparır; geri dönüş yolu yoktur.
    expect(kod).not.toMatch(/window\.location\s*(\.href)?\s*=/);
  });

  it('uygulama-içi ödeme yolu yerinde duruyor', () => {
    expect(kod).toContain('startInAppCardPayment');
  });

  it('kaldırma gerekçesi dosyada yorum olarak kaldı (bir daha eklenmesin)', () => {
    expect(oku('services/paymentService.ts')).toContain('B9');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B10 — üretim paketinde konsol çıktısı
// ═══════════════════════════════════════════════════════════════════════════
describe('B10 · üretim derlemesi konsol çıktısını ayıklar', () => {
  const cfg = koduAl('vite.config.ts');
  // Yalnız temizleyici eklentisinin gövdesi — komşu eklentinin ayarları
  // yanlışlıkla "kanıt" sayılmasın.
  const temizleyici = cfg.slice(
    cfg.indexOf('function uretimKonsolTemizleyici'),
    cfg.indexOf('export default'),
  );

  it('log/debug/info ayıklanır, debugger düşer', () => {
    expect(temizleyici).toContain("'console.log'");
    expect(temizleyici).toContain("'console.debug'");
    expect(temizleyici).toContain("'console.info'");
    expect(temizleyici).toContain("drop: ['debugger']");
  });

  it('eklenti derleme hattına gerçekten takılı', () => {
    expect(cfg).toMatch(/plugins:\s*\[[^\]]*uretimKonsolTemizleyici\(\)/);
  });

  it('console.error ve console.warn KORUNUR (çökme teşhisi için)', () => {
    // Bu ikisi ayıklama listesine girerse sahadaki hataları bir daha göremeyiz.
    expect(temizleyici).not.toContain("'console.error'");
    expect(temizleyici).not.toContain("'console.warn'");
    // Kaba `drop: ['console']` HER console çağrısını siler — asla kullanılmamalı.
    expect(cfg).not.toMatch(/drop:\s*\[[^\]]*'console'/);
  });

  it('temizleyici yalnız üretim derlemesinde çalışır (dev bozulmaz)', () => {
    expect(temizleyici).toContain("apply: 'build'");
    expect(temizleyici).toContain("mode !== 'production'");
  });

  it('bu gece eklenen mobil paket bekçisi yerinde duruyor', () => {
    // Aynı dosyada yaşıyorlar; biri diğerini ezmesin.
    expect(cfg).toContain('mobilPaketBekcisi');
    expect(cfg).toContain('MOBİL PAKET DERLEMESİ DURDURULDU');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B11 — doğrulanmamış FIFA iddiası
// ═══════════════════════════════════════════════════════════════════════════
describe('B11 · hakem rozeti doğrulanmış gibi görünmez', () => {
  const ekran = koduAl('views/ServiceProfile.tsx');

  it('ekranda "FIFA LİSANSLI" rozeti kalmadı', () => {
    expect(ekran).not.toContain('FIFA LİSANSLI');
  });

  it('yerine beyan olduğu açık bir metin var', () => {
    expect(ekran).toContain('BEYAN: FIFA KOKARTI');
  });

  it('rozet hâlâ yalnız isElite sağlayıcıda gösteriliyor (tasarım korundu)', () => {
    expect(ekran).toContain('userProfile?.isElite &&');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// App Store 1.2 (a) — içerik süzgeci
// ═══════════════════════════════════════════════════════════════════════════
describe('İçerik süzgeci · açık küfür engellenir', () => {
  const engellenmeli = [
    'siktir git',
    'SİKTİR',                 // büyük harf + Türkçe İ (küçültünce ayrı nokta düşer)
    's1kt1r lan',             // rakam oyunu
    '$iktir',                 // işaret oyunu
    'siiiktir',               // harf uzatma
    'orospu çocuğu',
    'orospusun',              // ek almış kök
    'amk',
    'aq ya',
    'piç herif',
    'oç',
    'göt',
    'yavşak',
    'şerefsiz',
    'ananı sikeyim',
    'amina koyayım',          // boşlukla bölünmüş kalıp
    'amınakoyim',             // bitişik kalıp
    'ibne',
    'pezevenk',
    'kahpe',
    'g0d0ş',
    'sikiş',
  ];

  it.each(engellenmeli)('engellenir: %s', (metin) => {
    expect(uygunsuzMu(metin)).toBe(true);
    expect(ilkUygunsuzKelime(metin)).not.toBeNull();
  });

  it('cümlenin ortasındaki küfrü de yakalar', () => {
    expect(uygunsuzMu('bu akşam maç var siktir edeyim seni')).toBe(true);
  });
});

describe('İçerik süzgeci · masum cümleler ASLA engellenmez', () => {
  // Bu liste süzgecin can damarı. Bir yanlış pozitif, kullanıcının mesajını
  // sessizce yutar ve uygulamayı bozuk gösterir.
  const masum = [
    'sikişik trafik',          // tuzak: "sıkışık"ın yazım hatası
    'SIKIŞIK TRAFİK',          // tuzak: tamamı büyük harf ("I" küçülünce "i" olur)
    'Sıkıntı yok',
    'sıkışık program',
    'kalecimiz harika',
    'götürdüm topu',           // tuzak: "göt" ile başlıyor
    'götürüyorum arkadaşları',
    'götürebilir misin',
    'amca geldi',              // tuzak: "am" ile başlıyor
    'amaç neydi',
    'ambulans çağırın',
    'Amina merhaba',           // bir insan adı — engellenmemeli
    'sikke koleksiyonu',
    'yaralı oyuncu var',
    'yarım saat gecikeceğim',
    'boks yapıyorum',
    'aptalca bir hata yaptım', // hafif söz — bilerek listede değil
    'topu bok gibi vurdum',
    'hıyar aldım markete uğradım',
    'maç 5-0 bitti',
    'saat 21:00 de sahadayız',
    'İstanbul Kadıköy sahası',
    'pas ver kanattan',
    'ağzına sağlık kaptan',
    'elimiz kolumuz sıkıştı',
    'İyi maçtı, eline sağlık',
    'Bu hafta oynayamıyorum, kusura bakma',
  ];

  it.each(masum)('geçer: %s', (metin) => {
    expect(uygunsuzMu(metin)).toBe(false);
    expect(ilkUygunsuzKelime(metin)).toBeNull();
  });

  it('boş / anlamsız girdi patlamaz', () => {
    expect(uygunsuzMu('')).toBe(false);
    expect(uygunsuzMu('   ')).toBe(false);
    expect(uygunsuzMu('👍👍👍')).toBe(false);
    expect(uygunsuzMu(undefined as unknown as string)).toBe(false);
  });

  it('normalleştirme noktasız ı harfini i yapmaz', () => {
    // Katlansaydı "sıkışık" küfür köküyle eşleşir, masum mesaj engellenirdi.
    expect(metniNormalize('SıKıŞıK')).toBe('sıkışık');
    expect(metniNormalize('Sıkıntı Yok')).toBe('sıkıntı yok');
  });

  it('büyük harfle yazılmış Türkçe İ doğru küçülür (küfür kaçmasın)', () => {
    // 'İ'.toLowerCase() → 'i' + ayrı nokta işareti; temizlenmezse eşleşme kaçar.
    expect(metniNormalize('SİKTİR')).toBe('siktir');
  });

  it('kullanıcıya dönen uyarı suçlayıcı değil ve hangi kelime olduğunu yazmaz', () => {
    expect(UYGUNSUZ_ICERIK_MESAJI).toContain('Topluluk kurallarımız');
    expect(UYGUNSUZ_ICERIK_MESAJI).toMatch(/dener misin/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Süzgeç GERÇEKTEN gönderim yolunda mı? (modül var ama çağrılmıyorsa işe yaramaz)
// ═══════════════════════════════════════════════════════════════════════════
vi.mock('../../supabaseClient', () => ({
  supabase: { rpc: vi.fn(async () => ({ data: null, error: null })) },
}));
vi.mock('../../supabaseAuth', () => ({ auth: { currentUser: { uid: 'u1' } } }));

describe('İçerik süzgeci gönderim yolunda gerçekten çalışıyor', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('birebir mesaj: küfür sunucuya HİÇ gitmez', async () => {
    const { supabase } = await import('../../supabaseClient');
    const { sendMessage } = await import('../../services/messageService');

    await expect(sendMessage('c1', 'siktir git')).rejects.toThrow(UYGUNSUZ_ICERIK_MESAJI);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('takım mesajı: küfür sunucuya HİÇ gitmez (push da doğmaz)', async () => {
    const { supabase } = await import('../../supabaseClient');
    const { sendTeamMessage } = await import('../../services/teamChatService');

    await expect(sendTeamMessage('t1', 'orospu çocuğu')).rejects.toThrow(UYGUNSUZ_ICERIK_MESAJI);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('masum takım mesajı süzgeçten geçip sunucuya ulaşır', async () => {
    const { supabase } = await import('../../supabaseClient');
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { id: 'm1', team_id: 't1', sender_id: 'u1', body: 'sıkışık trafik', created_at: 'now' },
      error: null,
    });
    const { sendTeamMessage } = await import('../../services/teamChatService');

    await expect(sendTeamMessage('t1', 'sıkışık trafik')).resolves.toMatchObject({ id: 'm1' });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});
