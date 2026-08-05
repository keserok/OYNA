// ════════════════════════════════════════════════════════════════════════════
// PROFİL DÜZENLEME · İKİ KAPI, TEK KATMAN, TEK KAYIT YOLU
// ════════════════════════════════════════════════════════════════════════════
//
// KARARIN GEÇMİŞİ (iki adım):
//  1) 2026-08 başı — "profili düzenlemenin TEK yeri Ayarlar → Bilgilerim".
//     Sebep: o gün İKİ kapı vardı ve ikisi FARKLI alan kümesi düzenliyordu
//     (Profil → "Düzenle": mevki/tanıtım/doğum tarihi/cinsiyet/stil/seviye ·
//     Ayarlar → "Profil Bilgileri": fotoğraf/ad/doğum tarihi/e-posta/şifre).
//     Doğum tarihi ikisinde de vardı; hangisinin kazandığı sıraya bağlıydı.
//  2) 2026-08 sonu — kullanıcı kararı: "Profil ekranında üstteki profil
//     bilgilerinin olduğu kutuya basınca profili düzenleme ekranı gelsin."
//     Kapı yeniden açıldı.
//
// ASIL KORUNAN ŞEY KAPI SAYISI DEĞİLDİ: iki kapının farklı davranmasıydı.
// Bu yüzden kural artık şudur ve test onu bekler:
//   • İki kapı da AYNI katmanı açar (ProfileEditSheet).
//   • İki kapı da AYNI kayıt yolundan geçer (userService · saveProfileEdit) —
//     seviye beyanının ayrı RPC kapısı ve "fotoğrafı yalnız değiştiyse yaz"
//     inceliği orada, tek yerde durur.
//   • Kaydetme sözleşmesi (hata YUKARI fırlatılır) iki ekranda da aynıdır.
// Bir sonraki oturum ekranlardan birine kendi kayıt kodunu yazarsa burası
// kırmızıya döner.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const profil = oku('views/ProfileScreen.tsx');
const bilgilerim = oku('components/settings/ProfileInfoPage.tsx');
const ayarlar = oku('views/SettingsScreen.tsx');

/** Yorumsuz kaynak — anlatı kuralın dışında kalsın. */
const yorumsuz = (s: string) => s.split('\n')
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

const servis = oku('services/userService.ts');

describe('profil düzenleme — iki kapı, tek katman', () => {
  it('Profil ekranındaki kimlik kutusu düzenleme katmanını açıyor', () => {
    // Kullanıcı kararı: "kutuya basınca profili düzenleme ekranı gelsin".
    expect(yorumsuz(profil)).toContain('ProfileEditSheet');
    expect(yorumsuz(profil)).toContain('onPress=');
  });

  it('Ayarlar → Bilgilerim de AYNI katmanı açıyor', () => {
    expect(bilgilerim).toContain('ProfileEditSheet');
  });

  it('iki ekran da AYNI kayıt yolundan geçiyor', () => {
    // Kayıt mantığı ekranların içinde ayrı ayrı yazılırsa er geç ayrışır.
    for (const [ad, kaynak] of [['Profil', profil], ['Bilgilerim', bilgilerim]] as const) {
      expect(yorumsuz(kaynak), `${ad} ekranı ortak kayıt yolunu kullanmıyor`).toContain('saveProfileEdit');
      // `saveEdit` GÖVDESİ kendi yazma çağrılarını kurmamalı. (Bilgilerim'de
      // ayrıca bir fotoğraf yükleme yolu var — o katmanın kaydı değil, kendi
      // başına bir eylem; bu yüzden kural gövdeyle sınırlı.)
      const govde = yorumsuz(kaynak).slice(yorumsuz(kaynak).indexOf('const saveEdit')).slice(0, 1600);
      for (const yazma of ['updateProfileBasics(', 'setMySelfSkill(']) {
        expect(govde, `${ad} ekranı kendi kaydını yazmış: ${yazma}`).not.toContain(yazma);
      }
    }
  });

  it('Ayarlar menüsündeki giriş "Bilgilerim" adını taşıyor', () => {
    expect(ayarlar).toContain('title="Bilgilerim"');
    expect(ayarlar).not.toContain('title="Profil Bilgileri"');
  });

  it('seviye beyanı hâlâ kendi kapısından geçiyor', () => {
    // `setMySelfSkill` RPC'si aralığı doğrular ve NULL'u reddeder: beyan bir
    // kez verildikten sonra silinemez (kadro çipi sözleşmesi). Düz
    // `updateProfileBasics` ile yazılırsa bu kapı atlanmış olur.
    expect(servis).toMatch(/if \(v\.selfSkill != null[\s\S]{0,140}setMySelfSkill\(v\.selfSkill\)/);
  });

  it('fotoğraf yalnız DEĞİŞTİYSE yazılıyor', () => {
    expect(servis).toContain('avatarChanged');
  });

  it('kaydetme sözleşmesi İKİ ekranda da korunuyor — hata YUKARI fırlatılır', () => {
    // Katman "hata fırlatmadı = kaydedildi" sözleşmesiyle çalışır. Yutulursa
    // sahte "Kaydedildi" gösterip değişiklikleri sessizce kaybederdi.
    for (const [ad, kaynak] of [['Profil', profil], ['Bilgilerim', bilgilerim]] as const) {
      const govde = kaynak.slice(kaynak.indexOf('const saveEdit'));
      expect(govde.slice(0, 1600), `${ad} ekranı hatayı yutuyor`).toContain('throw e;');
    }
  });
});

describe('profil ekranı — tasarım kararları', () => {
  it('üst barda yalnız ayarlar dişlisi var', () => {
    expect(profil).toContain("aria-label=\"Ayarlar\"");
    // Ekran adı yazılmıyor: alt menüde "Profil" sekmesi zaten yanıyor.
    expect(yorumsuz(profil)).not.toContain('<OynaLogo');
  });

  it('maç geçmişinin boş hâli bir ÇIKIŞ sunuyor', () => {
    expect(profil).toContain('onFindMatch');
    expect(oku('components/profile/MatchHistorySection.tsx')).toContain('Maç bul');
  });

  it('kaydırıcı flex kolon DEĞİL — uzun içerik sıkışmaz', () => {
    // Flex kolonda çocuklar varsayılan olarak sıkışır ve kaydırma üretilmez;
    // tests/visual/icKaydirma bunu yakalamıştı.
    const blok = profil.slice(profil.indexOf('overflow-y-auto') - 200, profil.indexOf('overflow-y-auto') + 200);
    expect(blok).toContain('space-y-3');
    expect(blok).not.toMatch(/overflow-y-auto[^"]*flex flex-col/);
  });
});
