// ════════════════════════════════════════════════════════════════════════════
// PROFİL DÜZENLEME · TEK KAPI
// ════════════════════════════════════════════════════════════════════════════
//
// Kullanıcı kararı (2026-08): profili düzenlemenin TEK yeri Ayarlar →
// Bilgilerim. Profil ekranı artık salt gösterir.
//
// NEDEN TEST: karar bir sorunu kapattı. Eskiden İKİ kapı vardı ve ikisi
// FARKLI alan kümesi düzenliyordu —
//   • Profil → "Düzenle": mevki, tanıtım, doğum tarihi, cinsiyet, oyun
//     stili, seviye
//   • Ayarlar → "Profil Bilgileri": fotoğraf, ad, doğum tarihi, e-posta, şifre
// Doğum tarihi İKİSİNDE de vardı; hangisinin kazandığı sıraya bağlıydı.
// Bir sonraki oturum "profilde düzenle düğmesi yok, ekleyeyim" derse burası
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

describe('profil düzenleme yalnız Ayarlar altında', () => {
  it('Profil ekranı düzenleme katmanını AÇMIYOR', () => {
    expect(yorumsuz(profil)).not.toContain('ProfileEditSheet');
  });

  it('Profil ekranı kayıt YAPMIYOR — salt gösterir', () => {
    // Yazma çağrıları buradan tamamen çıktı; ekran yalnız okur.
    for (const yazma of ['updateProfileBasics', 'setMySelfSkill', 'updateProfileName']) {
      expect(yorumsuz(profil), `${yazma} profil ekranına geri gelmiş`).not.toContain(yazma);
    }
  });

  it('Ayarlar → Bilgilerim düzenleme katmanının TEK sahibi', () => {
    expect(bilgilerim).toContain('ProfileEditSheet');
    expect(bilgilerim).toContain('updateProfileBasics');
    expect(bilgilerim).toContain('setMySelfSkill');
  });

  it('Ayarlar menüsündeki giriş "Bilgilerim" adını taşıyor', () => {
    expect(ayarlar).toContain('title="Bilgilerim"');
    expect(ayarlar).not.toContain('title="Profil Bilgileri"');
  });

  it('seviye beyanı hâlâ kendi kapısından geçiyor', () => {
    // `setMySelfSkill` RPC'si aralığı doğrular ve NULL'u reddeder: beyan bir
    // kez verildikten sonra silinemez (kadro çipi sözleşmesi). Düz
    // `updateProfileBasics` ile yazılırsa bu kapı atlanmış olur.
    expect(bilgilerim).toMatch(/if \(v\.selfSkill != null[\s\S]{0,120}setMySelfSkill\(v\.selfSkill\)/);
  });

  it('kaydetme sözleşmesi korunuyor — hata YUKARI fırlatılır', () => {
    // Katman "hata fırlatmadı = kaydedildi" sözleşmesiyle çalışır. Yutulursa
    // sahte "Kaydedildi" gösterip değişiklikleri sessizce kaybederdi.
    const govde = bilgilerim.slice(bilgilerim.indexOf('const saveEdit'));
    expect(govde.slice(0, 1600)).toContain('throw e;');
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
