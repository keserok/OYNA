/**
 * GİRİŞ SONRASI YÖNLENDİRME — "hesabı onayladım, giriş ekranında kaldım"
 * (22 Ağustos 2026)
 *
 * Kurucunun ekran görüntüsüyle bildirdiği hata: Apple/Google hesabı
 * onaylanıyor, oturum GERÇEKTEN açılıyor (auth.users.last_sign_in_at
 * yazılıyor), ama uygulama giriş ekranında öylece duruyor.
 *
 * Çok yönlü bir tarama, App.tsx'teki auth dinleyicisinde SEKİZ ayrı yol
 * buldu; her biri tek başına bu sonucu üretebiliyordu. Bu dosya sekizini de
 * kilitler. Değişmez tek cümleyle: OTURUM GEÇERLİYSE KULLANICI İÇERİ ALINIR.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const app = () => oku('App.tsx');

describe('geçerli oturum kapının dışında bırakılmaz', () => {
  it('içeri alma yardımcısı var ve yalnız DIŞARIDAKİ görünümlerde çalışır', () => {
    const s = app();
    expect(s).toContain('const icerideBirak = (): void =>');
    const govde = s.slice(s.indexOf('const icerideBirak'), s.indexOf('const icerideBirak') + 500);
    // Kullanıcı zaten uygulamanın içindeyse (arka plan jeton yenilemesi)
    // ekranını çalmamalı.
    expect(govde).toContain("['SPLASH', 'AUTH', 'ROLE_SELECTION'].includes(st.view)");
    expect(govde).toContain('if (!disarida) return;');
    expect(govde).toContain('resetNavigation(navigateBasedOnRole(');
  });

  it('profil okunamadığında kullanıcı içeri alınıyor (eskiden hiçbir şey yapılmıyordu)', () => {
    const s = app();
    const dal = s.slice(
      s.indexOf("captureException(profileErr, { where: 'onAuthStateChanged.profileFetch' })"),
      s.indexOf("} else if (!profile) {"),
    );
    expect(dal).toContain('icerideBirak()');
  });

  it('çakışma sonrası profil okunamazsa da içeri alınıyor', () => {
    const s = app();
    const dal = s.slice(s.indexOf('if (!profile && isConflict) {'), s.indexOf('} else if (!profile) {', s.indexOf('if (!profile && isConflict) {')));
    expect(dal).toContain('icerideBirak()');
  });

  it('insert çakışma DIŞI bir sebeple düştüyse ONBOARDING\'e gönderilmiyor', () => {
    // Profil satırı yokken onboarding'e göndermek, yazacak satırı olmayan
    // bir akış başlatmaktır.
    const s = app();
    expect(s).toContain('} else if (insertError && !isConflict) {');
    const dal = s.slice(s.indexOf('} else if (insertError && !isConflict) {'), s.indexOf('} else if (!profile) {', s.indexOf('} else if (insertError && !isConflict) {')));
    expect(dal).toContain('icerideBirak()');
  });
});

describe('yarış durumları', () => {
  it('giriş anı ölçüsü AĞ BEKLEMELERİNDEN ÖNCE alınıyor', () => {
    // Sonra alınırsa açılış ekranının zamanlayıcısı yarışı kazanıp
    // giriş-sonrası yönlendirmeyi tamamen iptal edebiliyordu.
    const s = app();
    const olcum = s.indexOf('const girisAninkiGorunum = useAppStore.getState().view;');
    const ilkAwait = s.indexOf('await selectProfile()');
    expect(olcum, 'ölçüm yok').toBeGreaterThan(-1);
    expect(ilkAwait).toBeGreaterThan(-1);
    expect(olcum, 'ölçüm ilk ağ çağrısından SONRA alınıyor').toBeLessThan(ilkAwait);
    expect(s).toContain('.includes(girisAninkiGorunum)');
  });

  it('oturumsuz olayların hepsi çıkış sayılmıyor', () => {
    const s = app();
    expect(s).toContain("const gercekCikis = olay === 'SIGNED_OUT'");
    expect(s).toContain('if (!gercekCikis && auth.currentUser)');
  });

  it('olay türü dinleyiciden App\'e taşınıyor', () => {
    const a = oku('supabaseAuth.ts');
    expect(a).toContain('export type AuthOlayi =');
    expect(a).toContain('callback: (user: OynaCurrentUser | null, olay?: AuthOlayi) => void');
    expect(app()).toContain('onAuthStateChanged(auth, async (user, olay) =>');
  });
});

describe('otomatik çıkış yalnız KESİN sinyalle', () => {
  it('hata METNİNDE "Auth" görmek çıkışa yol açmıyor', () => {
    // @supabase/auth-js'in hata sınıfı adı "AuthApiError", mesajları da sık
    // sık "Auth" içerir: geçici bir ağ/RLS hatası kullanıcıyı çıkışa
    // zorluyordu. Giriş sonrası otomatik çıkışın TEK yolu buydu.
    const s = app();
    const blok = s.slice(s.indexOf("console.error('[App] Auth state error:'"), s.indexOf('finally {', s.indexOf("console.error('[App] Auth state error:'")));
    expect(blok).not.toContain("message?.includes('Auth')");
    expect(blok).not.toContain("message?.includes('JWT')");
    expect(blok).toContain("kod === 'PGRST301'");
    expect(blok).toContain('durum === 401');
  });
});

describe('profil kaydı şemaya uyuyor', () => {
  it('NOT NULL "name" kolonu insert edilirken gönderiliyor', () => {
    // Gönderilmediğinde insert 23502 ile düşüyordu — 23505 DEĞİL. Çakışma
    // dalı çalışmıyor, akış "gerçekten yeni kullanıcı" sanıp profilsiz
    // hâlde onboarding'e gidiyordu. Apple kimlik jetonu ad İÇERMEZ, yani
    // bu yol Apple ile girenler için kuraldı.
    const s = app();
    const govde = s.slice(s.indexOf("await supabase.from('profiles').insert({"), s.indexOf('const isConflict'));
    expect(govde).toContain('name:');
    expect(govde).toContain('full_name:');
  });
});
