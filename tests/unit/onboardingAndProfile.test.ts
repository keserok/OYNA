// IP-16 + IP-18 bekçisi — tanıtım akışı, konum tek yolu, profil doğruluğu.
//
// Kilitlenen sözler:
//   1. Yarıda bırakılan tanıtım açılışta geri gelir; "atladım" diyen zorlanmaz.
//   2. Konum TEK yoldan istenir ve verilen izin KALICI olur.
//   3. Konum reddi ekranda kalıcıdır; çalışmayacak tuş çizilmez.
//   4. Görünen ile geçerli olan aynıdır (yaş çarkı).
//   5. Maç geçmişi SUNUCUDA süzülür; platform büyüyünce boşalmaz.
//   6. Skoru girilmemiş maç beraberlik SAYILMAZ ve oranı sulandırmaz.
//   7. Ekranda uydurma sayı yoktur.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { winStats } from '../../shared/profilePresentation';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

// ─── IP-16 ───────────────────────────────────────────────────────────────────

describe('yarıda bırakılan tanıtım geri gelir', () => {
  it('açılış sorgusu "tanıtım bitti mi" alanını çekiyor', () => {
    // Alan hiç okunmuyordu: 4 adımın ortasında çıkan kullanıcı bir daha
    // akışa dönmüyor, konum da yalnız orada istendiği için hiç sorulmuyordu.
    const s = oku('App.tsx');
    expect(s.match(/has_completed_onboarding/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('yalnız oyuncu ve yalnız atlamamış kullanıcı yönlendiriliyor', () => {
    const s = oku('App.tsx');
    expect(s).toContain('landingRole === UserRole.PLAYER &&');
    expect(s).toContain('!wasOnboardingSkipped(user.uid)');
    expect(s).toContain("resetNavigation('ONBOARDING');");
  });

  it('"atladım" bayrağı yazılıyor ve tamamlanınca temizleniyor', () => {
    const s = oku('views/Onboarding.tsx');
    expect(s).toContain('markOnboardingSkipped(uid)');
    expect(s).toContain('clearOnboardingSkipped(uid)');
  });

  it('bayrak kullanıcı bazlı — başka hesap etkilenmiyor', () => {
    const s = oku('views/onboarding/onboardingShared.ts');
    expect(s).toContain('oyna.onboarding.skipped.${uid}');
  });
});

describe('konum tek yoldan isteniyor', () => {
  it('doğrudan navigator.geolocation çağrısı kalmadı', () => {
    // services/locationService.ts sözleşmesi: hiçbir yer doğrudan çağırmaz.
    // Doğrudan çağrı native izin akışını atlıyor ve red/engel/zaman aşımı
    // ayrımını kaybediyordu.
    for (const yol of ['views/Onboarding.tsx', 'views/LocationPrompt.tsx']) {
      expect(oku(yol), `${yol} hâlâ doğrudan çağırıyor`).not.toContain('navigator.geolocation');
    }
  });

  it('her iki ekran da ortak servisi kullanıyor', () => {
    for (const yol of ['views/Onboarding.tsx', 'views/LocationPrompt.tsx']) {
      expect(oku(yol), yol).toContain('detectRegion');
    }
  });

  it('verilen izin KALICI — bölge kaydediliyor', () => {
    // Eskiden izin verilse bile `userLocation` her soğuk açılışta null'a
    // dönüyordu; "yakınındaki maçlar" bir daha hiç açılmıyordu.
    for (const yol of ['views/Onboarding.tsx', 'views/LocationPrompt.tsx']) {
      expect(oku(yol), yol).toContain('setActiveRegion(loc)');
    }
  });

  it('konum kapalıyken önceki bölge hatırlatılıyor', () => {
    expect(oku('views/Onboarding.tsx')).toContain('hatirlananBolge={activeRegion?.label ?? null}');
    expect(oku('views/onboarding/StepLocation.tsx')).toContain('Kayıtlı bölgen kullanılacak');
  });
});

describe('konum reddi ekranda kalıcı', () => {
  const s = oku('views/onboarding/StepLocation.tsx');

  it('her başarısızlık türü kendi metnini taşıyor', () => {
    for (const durum of ['denied', 'blocked', 'timeout', 'unavailable']) {
      expect(s, durum).toContain(`${durum}:`);
    }
  });

  it('kalıcı engelde "Tekrar Dene" çizilmiyor — çalışmazdı', () => {
    const blok = s.slice(s.indexOf("{(state === 'denied'"), s.lastIndexOf('Tekrar Dene') + 40);
    expect(blok).toContain("state === 'denied' || state === 'timeout'");
    expect(blok).not.toContain("state === 'blocked'");
  });

  it('kalıcı engelde neden tekrar denemenin işe yaramadığı yazıyor', () => {
    // Metin artık yol tarif etmiyor çünkü tuş doğrudan oraya götürüyor.
    expect(s).toContain('telefon ayarlarından kapatılmış');
    expect(s).toContain('tekrar denemek işe yaramaz');
  });

  it('"Ayarları Aç" tuşu var ve yalnız AÇILABİLDİĞİ cihazda çiziliyor', () => {
    // Kullanıcı isteği: kalıcı engelde ayarlar ekranı açılsın. Eklenti kuruldu.
    // Web'de böyle bir ekran YOK — orada tuş çizilmez, metin yol gösterir.
    expect(s).toContain('Ayarları Aç');
    expect(s).toContain("state === 'blocked' && onOpenSettings");
    expect(oku('package.json')).toContain('capacitor-native-settings');
    const svc = oku('services/locationService.ts');
    expect(svc).toContain('export async function openAppSettings');
    expect(svc).toContain('if (!IS_NATIVE) return false;');
    expect(svc).toContain('export const canOpenAppSettings = (): boolean => IS_NATIVE;');
    // Çağıran taraf tuşu koşullu çiziyor.
    expect(oku('views/Onboarding.tsx')).toContain('canOpenAppSettings() ?');
    expect(oku('views/Notifications.tsx')).toContain('canOpenAppSettings() ?');
  });

  it('bildirim merkezinde kalıcı hatırlatma var', () => {
    // Kullanıcı kararı: konumu açmayana sürekli hatırlatılsın. Sunucudan
    // gerçek bildirim GÖNDERİLMEZ (spam + geri alınamaz); yerel durum.
    const n = oku('views/Notifications.tsx');
    expect(n).toContain('Konum izni kapalı');
    expect(n).toContain("konumIzni === 'DENIED'");
  });
});

describe('görünen ile geçerli olan aynı — yaş çarkı', () => {
  const s = oku('views/Onboarding.tsx');

  it('varsayılan seçim gerçekten sayılıyor (karar 4b)', () => {
    // Ekranda "24-30" seçili görünüyor ama sayılmıyordu; "Devam Et" ölü
    // kalıyor ve kullanıcı neyi eksik yaptığını anlamıyordu.
    expect(s).toContain('useState(true)');
    expect(s).toContain('case 1: return true;');
  });

  it('18 yaş altı seçimi ekranda söyleniyor', () => {
    expect(s).toContain('isMinorAgeRange');
    expect(s).toContain('veli onayı gerekiyor');
  });

  it('her adım verinin niye istendiğini yazıyor', () => {
    expect(s).toContain('const SUBTITLES');
    const blok = s.slice(s.indexOf('const SUBTITLES'), s.indexOf('const SUBTITLES') + 600);
    expect(blok.match(/'/g)?.length).toBeGreaterThanOrEqual(8); // dört adım
  });
});

describe('atlama artık soruyor', () => {
  const s = oku('views/Onboarding.tsx');

  it('onay diyaloğu var (kullanıcı kararı: tuş küçük kalsın ama sorsun)', () => {
    expect(s).toContain('setSkipConfirm(true)');
    expect(s).toContain('<ConfirmDialog');
    expect(s).toContain('Kurulumu atla?');
  });

  it('kısmi kayıt tutmazsa kullanıcı bunu öğreniyor', () => {
    expect(s).toContain('Girdiklerin kaydedilemedi');
  });

  it('özet ekranındaki kayıt hatası KALICI ve çıkışı var', () => {
    // Perde `absolute inset-0 z-20` olduğu için üstteki "Atla" tuşunu örtüyordu:
    // hatada kullanıcının görünür hiçbir çıkışı kalmıyordu.
    expect(s).toContain('completeError');
    const r = oku('views/onboarding/PlayerCardReveal.tsx');
    expect(r).toContain('error?: string | null;');
    expect(r).toContain('Şimdilik Geç');
    expect(r).toContain("error ? 'Tekrar Dene'");
  });
});

// ─── IP-18 ───────────────────────────────────────────────────────────────────

describe('maç geçmişi sunucuda süzülüyor', () => {
  const s = oku('services/userService.ts');

  it('platformun tamamını çeken sorgu kalmadı', () => {
    // Eski hâli: select('*') + limit(50), katılım süzgeci TARAYICIDA.
    // Platformda 50'den fazla tamamlanmış maç biriktiği gün geçmiş boşalırdı.
    const govde = s.slice(s.indexOf('export const getMatchHistory'));
    expect(govde.slice(0, 2000)).not.toContain(".select('*')");
    expect(govde.slice(0, 2000)).not.toContain('.limit(50)');
  });

  it('katılım ilişkisel tablodan okunuyor', () => {
    expect(s).toContain("supabase.rpc('get_my_match_history'");
  });

  it('sunucu fonksiyonu match_participants üzerinden çalışıyor', () => {
    const m = oku('supabase/migrations/20260830000000_ip18_mac_gecmisi_kullanici_kapsamli.sql');
    expect(m).toContain('FROM public.match_participants mp');
    expect(m).toContain('mp.user_id = (SELECT auth.uid())');
    expect(m).toContain('SECURITY DEFINER');
    // Anonim erişim kapalı olmalı.
    expect(m).toContain('REVOKE ALL ON FUNCTION public.get_my_match_history(int) FROM PUBLIC, anon;');
  });

  it('limit filtreden SONRA uygulanıyor', () => {
    const m = oku('supabase/migrations/20260830000000_ip18_mac_gecmisi_kullanici_kapsamli.sql');
    const wh = m.indexOf('WHERE mp.user_id');
    const li = m.indexOf('LIMIT GREATEST');
    expect(wh).toBeGreaterThan(0);
    expect(li).toBeGreaterThan(wh);
  });

  it('olmayan kolon (pitchName) artık okunmuyor', () => {
    // matches tablosunda pitchName/pitch_name kolonu YOK; saha adı location'dan.
    const govde = s.slice(s.indexOf('export const getMatchHistory'));
    expect(govde.slice(0, 2000)).not.toContain('row.pitchName');
  });
});

describe('skorsuz maç beraberlik değil', () => {
  it('skor durumu sunucunun kolonundan okunuyor', () => {
    // İkinci bir doğruluk kaynağı üretilmiyor: matches.score_status zaten
    // ENTERED / NOT_ENTERED / PENDING diye türetiliyor ve trigger'la sürüyor.
    const s = oku('services/userService.ts');
    expect(s).toContain("row.score_status === 'ENTERED'");
    expect(s).not.toMatch(/homeScore \?\? .*?0/);
  });

  it('kimlik kartında DOĞRULAMA TİKİ yok — bir daha da gelmez', () => {
    // Kullanıcı kararı (2026-08): "Profil ekranındaki tik işaretini kaldır ve
    // bir daha görünmemesini sağla." Onaylı tasarımın kimlik kartında da tik
    // yoktur. Bileşen artık `verified` diye bir alan KABUL ETMİYOR; bu test
    // hem alanın hem de rozet çiziminin geri gelmesini engeller.
    const kart = oku('components/profile/ProfileIdentityCard.tsx');
    expect(kart, 'ProfileIdentityCard yeniden `verified` alanı almış').not.toMatch(/verified\??:/);
    expect(kart, 'kimlik kartına doğrulama rozeti geri çizilmiş').not.toContain('Doğrulanmış');
    for (const dosya of ['views/ProfileScreen.tsx', 'components/settings/ProfileInfoPage.tsx']) {
      expect(oku(dosya), `${dosya} karta yeniden \`verified\` gönderiyor`).not.toContain('verified=');
    }
  });

  it('NO_SCORE her yüzeyde tanınıyor', () => {
    expect(oku('services/userService.ts')).toContain("'WIN' | 'LOSS' | 'DRAW' | 'NO_SCORE'");
    expect(oku('components/profile/MatchHistorySection.tsx')).toContain('NO_SCORE:');
    expect(oku('components/profile/PlayerCardBack.tsx')).toContain("m.result === 'NO_SCORE'");
  });

  it('galibiyet oranının paydasına girmiyor', () => {
    const r = winStats([
      { result: 'WIN' }, { result: 'LOSS' },
      { result: 'NO_SCORE' }, { result: 'NO_SCORE' }, { result: 'NO_SCORE' },
    ]);
    expect(r.total).toBe(5);        // "Maç" sayacı hepsini sayar
    expect(r.scoredTotal).toBe(2);  // oran yalnız ikisinden
    expect(r.winRate).toBe(50);     // %20 değil %50
  });

  it('hiç skorlu maç yoksa %0 değil — döner', () => {
    // Sıfır başarı ile veri yokluğu aynı şey değil.
    expect(winStats([{ result: 'NO_SCORE' }, { result: 'NO_SCORE' }]).winRate).toBeNull();
    expect(winStats([]).winRate).toBeNull();
  });

  it('profil ekranı — yazıyor, %0 değil', () => {
    const h = oku('components/profile/ProfileHero.tsx');
    expect(h).toContain('winRate: number | null;');
    expect(h).toContain("winRate === null ? '—'");
  });
});

describe('ekranda uydurma sayı yok', () => {
  const back = oku('components/profile/PlayerCardBack.tsx');

  it('sabit gol/asist/en iyi puan silindi (karar 11a)', () => {
    for (const yalan of ['>18<', '>12<', '>9.2<']) {
      expect(back, `${yalan} hâlâ duruyor`).not.toContain(yalan);
    }
    expect(back).not.toContain('Asist');
    expect(back).not.toContain('En İyi Puan');
  });

  it('sahte performans trendi silindi', () => {
    expect(back).not.toContain('7.2, 8.1, 6.5');
    expect(back).not.toContain('Performans Trendi');
  });

  it('kartın iki yüzü aynı galibiyet hesabını kullanıyor', () => {
    // Arka yüzde ayrı bir formül vardı ve skorsuz maçları da paydaya katıyordu.
    expect(back).toContain('winStats(matches)');
  });

  it('tasarımcı jargonu kullanıcıya gösterilmiyor (karar 13a)', () => {
    const card = oku('components/PlayerCard.tsx');
    expect(card).not.toContain('SİLÜET YOK');
    expect(card).toContain('FOTOĞRAF EKLE');
  });
});

describe('maç raporu ekranı', () => {
  const s = oku('views/MatchDiaryDetail.tsx');

  it('paylaş tuşu gerçekten çalışıyor', () => {
    expect(s).toContain('onClick={handleShare}');
    expect(s).toContain('navigator.share');
    expect(s).toContain('navigator.clipboard');   // masaüstü yedeği
  });

  it('paylaşım iptali hata sayılmıyor', () => {
    expect(s).toContain("'AbortError'");
  });

  it('not kaydetme hatası ekranda görünüyor', () => {
    // 1000 karakterlik not sessizce kaybolabiliyordu.
    expect(s).toContain('setNoteError(');
    expect(s).toContain('{noteError}');
    expect(s).toContain('yazdıkların duruyor');
  });

  it('kırık avatar baş harfe düşüyor', () => {
    expect(s).toContain('onError={(e)');
    expect(s).toContain('getInitials(player.name)');
  });
});

describe('paylaşılan dosyalar yerinde', () => {
  it.each([
    'supabase/migrations/20260830000000_ip18_mac_gecmisi_kullanici_kapsamli.sql',
    'views/onboarding/StepLocation.tsx',
  ])('%s var', (y) => {
    expect(existsSync(join(KOK, y))).toBe(true);
  });
});
