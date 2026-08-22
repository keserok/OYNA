/**
 * KULLANICI İÇERİĞİ KAPILARI — App Store Kural 1.2 (22 Ağustos 2026)
 *
 * Kural 1.2, kullanıcı üretimi içerik barındıran uygulamadan DÖRT şey ister:
 *   1. uygunsuz içeriğin girmesini engelleyen bir SÜZGEÇ,
 *   2. uygunsuz içeriği BİLDİRME yolu,
 *   3. tacizciyi ENGELLEME yolu,
 *   4. yayımlanmış iletişim bilgisi + 24 saat içinde işlem taahhüdü.
 *
 * 22 Ağustos denetiminde 2, 3 ve 4 yerindeydi; 1 EKSİKTİ: süzgeç yalnız
 * SOHBET MESAJLARINA uygulanıyordu. Oysa uygulamadaki en yaygın kullanıcı
 * metni GÖRÜNÜR ADdır — maç lobisinde, kadroda, sohbet listesinde, sosyalde
 * herkese görünür. Küfürlü bir ad, mesaj kutusuna hiç girmeden herkese
 * ulaşan ve engellenmesi zor bir taciz yüzeyiydi. Maç başlığı (keşif
 * listesinde herkese açık) ve takım adı da aynı boşluktaydı.
 *
 * Bu dosya süzgecin TÜM yazma yollarında durduğunu kilitler. Yeni bir
 * serbest metin alanı eklenirse buraya bir satır daha eklenmeli.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Kural 1.2 · içerik süzgeci TÜM yazma yollarında', () => {
  /**
   * Kapının ÖLÇÜSÜ: süzgeci çağırmak yetmez, çağrının sonucu YAZMAYI
   * DURDURMALI. `uygunsuzMu(x)` deyip sonucu yok saymak da bu testi
   * geçerdi — bu yüzden `throw` aranıyor.
   */
  const kapiVar = (kaynak: string, yazmaImi: string): boolean => {
    const i = kaynak.indexOf(yazmaImi);
    if (i < 0) return false;
    // Yazma çağrısından ÖNCEKİ 900 karakterde süzgeç + throw olmalı.
    const onceki = kaynak.slice(Math.max(0, i - 900), i);
    return /uygunsuzMu\(/.test(onceki) && /throw new Error\(UYGUNSUZ_ICERIK_MESAJI\)/.test(onceki);
  };

  it('sohbet mesajı (zaten vardı, korunuyor)', () => {
    expect(oku('services/messageService.ts')).toContain('if (uygunsuzMu(body)) throw new Error(UYGUNSUZ_ICERIK_MESAJI)');
    expect(oku('services/teamChatService.ts')).toContain('if (uygunsuzMu(body)) throw new Error(UYGUNSUZ_ICERIK_MESAJI)');
  });

  it('görünür ad — Ayarlar\'dan değiştirme', () => {
    expect(kapiVar(oku('services/userService.ts'), "supabase.from('profiles').update({ name: trimmed")).toBe(true);
  });

  it('görünür ad — tanıtım akışında İLK yazım', () => {
    // İki yazma yolu var; yalnız birine kapı koymak boşluğu kapatmaz.
    expect(kapiVar(oku('services/onboardingService.ts'), "supabase.rpc('apply_onboarding'")).toBe(true);
  });

  it('maç başlığı — keşif listesinde herkese görünür', () => {
    expect(kapiVar(oku('services/matchCreateService.ts'), "supabase.rpc('create_match_atomic'")).toBe(true);
  });

  it('takım adı — kurarken VE sonradan değiştirirken', () => {
    const t = oku('services/teamSocialService.ts');
    // Ortak yardımcı: iki yol da aynı kapıdan geçer.
    expect(t).toContain('const takimAdiniSuz =');
    expect(t).toMatch(/takimAdiniSuz\(payload\);\s*\n\s*const \{ data, error \} = await supabase\.rpc\('create_team'/);
    expect(t).toMatch(/takimAdiniSuz\(patch\);\s*\n\s*const \{ error \} = await supabase\.rpc\('update_team_settings_v2'/);
    // Yardımcı hem uzun adı hem kısa adı görmeli.
    const govde = t.slice(t.indexOf('const takimAdiniSuz'), t.indexOf('export const createTeamRpc'));
    expect(govde).toContain('patch.name');
    expect(govde).toContain('patch.short_name');
    expect(govde).toContain('throw new Error(UYGUNSUZ_ICERIK_MESAJI)');
  });
});

describe('Kural 1.2 · bildirme ve engelleme yolları duruyor', () => {
  it('engelleme gerçek bir kayıt yazıyor (görsel değil)', () => {
    const s = oku('services/socialService.ts');
    expect(s).toContain("from('user_blocks')");
    expect(s).toContain('export const blockUserFully');
    // Engel geri alınabilir olmalı — kalıcı ve tek yönlü bir işlem değil.
    expect(s).toContain('export const unblockUser');
  });

  it('şikâyet üç ayrı yüzeyden erişilebilir', () => {
    // Kural 1.2 "bildirme yolu" ister; tek bir derin ekrana gömülmüş olması
    // pratikte erişilemez demektir. Kullanıcı içeriğini GÖRDÜĞÜ yerde
    // bildirebilmeli: sohbet, maç lobisi ve profil.
    for (const yol of ['views/MessagesView.tsx', 'views/MatchJoin.tsx', 'views/social/FriendProfileSheet.tsx']) {
      expect(oku(yol), `${yol} şikâyet yolu taşımıyor`).toContain('reportUser');
    }
  });

  /**
   * Kural 1.2'nin dördüncü şartı: geliştirici, uygunsuz içerik bildirimleri
   * üzerine 24 SAAT İÇİNDE işlem yapmayı taahhüt etmeli.
   *
   * 22 Ağu denetiminde bu taahhüt YOKTU; dahası Topluluk Kuralları m.8.4
   * "bağlayıcı kesin süre yükümlülüğü getirmez" diyerek tam tersini
   * söylüyordu. İncelemeci sözleşmeyi okur; bu cümle tek başına 1.2 reddi
   * gerekçesidir. Taahhüt eklendi ve hukuki çerçeve m.8.5'e ayrıldı.
   */
  /**
   * Kural 1.2 ayrıca YAYIMLANMIŞ VE ÇALIŞAN bir iletişim adresi ister;
   * incelemeci bu adresi deneyebilir.
   *
   * 22 Ağu denetiminde adres `destek@oyna.app`ti ama `oyna.app` alan adında
   * posta kutusu YOK — o adrese yazan kimseye ulaşamıyordu. Ulaşılamayan bir
   * adres, hiç olmamasından beterdir. Kurucu kararıyla çalışan bir adrese
   * geçildi.
   *
   * Bu kilit ADRESİN KENDİSİNİ değil TUTARLILIĞI korur: sözleşme kaynağı,
   * yayımlanan sayfa, uygulama içi metin ve destek ekranı AYNI adresi
   * göstermeli. Biri güncellenip öteki unutulursa kullanıcı hangisine
   * yazacağını bilemez ve şikâyet yolu fiilen kapanır.
   */
  it('destek adresi dört yüzeyde de AYNI', () => {
    const adres = (metin: string): string | null =>
      (metin.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
        .find((e) => !e.includes('example.com') && !e.startsWith('no-reply')) ?? null;

    const destek = adres(oku('components/settings/SupportPage.tsx'));
    expect(destek, 'destek ekranında adres yok').toBeTruthy();

    // Sözleşme KAYNAĞI ve ondan üretilen sayfa.
    expect(oku('sozlesmeler/oyuncu/09-topluluk-kurallari.md')).toContain(destek!);
    expect(oku('public/topluluk-kurallari.html')).toContain(destek!);
    // Uygulama içinde okunan metin.
    expect(oku('shared/legalDocs.ts')).toContain(destek!);

    // Ulaşılamayan eski adres hiçbir yüzeyde kalmamalı.
    for (const yol of ['components/settings/SupportPage.tsx', 'shared/legalDocs.ts',
                       'public/topluluk-kurallari.html', 'public/kullanim-sartlari.html',
                       'sozlesmeler/oyuncu/09-topluluk-kurallari.md']) {
      expect(oku(yol), `${yol} hâlâ ulaşılamayan adresi gösteriyor`).not.toContain('destek@oyna.app');
    }
  });

  it('24 saat taahhüdü HEM yayımlanmış metinde HEM uygulama içinde', () => {
    // Yayımlanan sayfa (mağaza formuna verilen URL bunu açar).
    const kurallar = oku('public/topluluk-kurallari.html').toLocaleLowerCase('tr');
    expect(kurallar.length).toBeGreaterThan(500);
    expect(kurallar).toContain('24 saat içinde');

    // Uygulama içinde okunan metin (incelemecinin gördüğü ekran). İkisi
    // ayrışırsa hangisinin geçerli olduğu belirsizleşir.
    const icerideki = oku('shared/legalDocs.ts');
    const blok = icerideki.slice(icerideki.indexOf('7. ŞİKÂYET VE UYAR-KALDIR'), icerideki.indexOf('8. YAPTIRIM VE İTİRAZ'));
    expect(blok).toContain('24 SAAT İÇİNDE');

    // Eski çekince cümlesi, uygunsuz içerik bildirimlerini KAPSAMAMALI:
    // kapsasaydı taahhüt anlamsız olurdu.
    const kaynak = oku('sozlesmeler/oyuncu/09-topluluk-kurallari.md');
    const m84 = kaynak.slice(kaynak.indexOf('8.4.'), kaynak.indexOf('9. Moderasyon'));
    expect(m84).toContain('24 saat içinde');
    expect(m84).toContain('Bunun dışındaki bildirimler');
  });
});
