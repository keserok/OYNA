// ════════════════════════════════════════════════════════════════════════
// OTURUM VE CİHAZ GİZLİLİĞİ KAPILARI (26 Ağu 2026 — denetim paketi FAZ 2)
//
// Ortak cihaz (tesis tableti, aile telefonu) senaryosunun korumaları:
//   2.1 Çıkışta belirtecin TELEFON kopyası (Preferences) da silinir.
//   2.2 İstemsiz oturum düşüşü "çıkış tuşu" sanılmaz; niyet saklanır.
//   2.3 Çıkışta kullanıcıya ait TÜM store alanları sıfırlanır.
//   2.4 Tahsilat kuyruğu kullanıcıya bağlıdır (uid'li anahtar + ownerUid).
//   2.5 Cihazda kalan kullanıcı artıkları tek yardımcıyla temizlenir.
//   1.10 İptal edilen biletin çevrimdışı kopyası silinir; önbellek 48 saat.
//
// Bu testler kaynak-metin asertlidir (repo geleneği: bildirimDuzeltmeleri):
// davranışı üreten kod kalıbı dosyadan kaybolursa test kırmızıya döner.
// ════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KOK = path.resolve(__dirname, '..', '..');
const oku = (gorece: string) => readFileSync(path.join(KOK, gorece), 'utf8');

describe('2.1 · çıkışta telefon kopyası da silinir', () => {
  it('depolama adaptörünün removeItem\'ı asenkron ve Preferences.remove bekleniyor', () => {
    const s = oku('supabaseClient.ts');
    expect(s).toContain('removeItem: async (key: string): Promise<void>');
    const blok = s.slice(s.indexOf('removeItem: async'), s.indexOf('// 17 Ağustos öncesi'));
    expect(blok).toContain('await Preferences.remove({ key })');
  });

  it('acil temizlik yolu (oturumuZorlaSil) native aynaya da dokunuyor', () => {
    const s = oku('supabaseAuth.ts');
    const blok = s.slice(s.indexOf('const oturumuZorlaSil'), s.indexOf('const YENIDEN_BASLATMA_ISARETI'));
    expect(blok).toContain('Preferences.remove({ key: AUTH_DEPO_ANAHTARI })');
  });
});

describe('2.2 · istemli/istemsiz çıkış ayrımı', () => {
  it('logout istemli işareti koyuyor, App tüketiyor', () => {
    const auth = oku('supabaseAuth.ts');
    expect(auth).toContain('sonCikisIstemli = true');
    expect(auth).toContain('export const cikisIstemliMiVeTuket');
    const app = oku('App.tsx');
    expect(app).toContain('cikisIstemliMiVeTuket()');
    // İstemsiz düşüşte niyet saklanır ki girişte kaldığı yere dönülsün —
    // ama YALNIZ anlamlıca geri yüklenebilen ekran için (maç lobisi):
    // paneller/bağlamlı ekranlar için niyet yazmak ortak cihazda başka
    // kullanıcıya taşınır ya da boş ekran açardı (26 Ağu inceleme bulgusu).
    expect(app).toContain("prevView === 'MATCH_JOIN' && storeSnap.selectedMatch?.id");
    expect(app).toContain('Oturumun yenilenemedi');
    // logout() dışı istemli çıkışlar (Tüm oturumları kapat) işaret koymalı.
    expect(oku('views/owner/menu/OwnerSecurityModal.tsx')).toContain('cikisIstemliIsaretle()');
    // Jeton-geçersiz yolu istemsizdir: bayrak kurulmaz.
    expect(app).toContain("logout('oturum-gecersiz')");
  });
});

describe('2.3 · çıkışta store sıfırlanır', () => {
  it('App SIGNED_OUT dalı resetUserScopedState çağırıyor', () => {
    expect(oku('App.tsx')).toContain('resetUserScopedState()');
  });

  it('resetUserScopedState kullanıcıya ait kritik alanların hepsini kapsıyor', () => {
    const s = oku('store.ts');
    const blok = s.slice(s.indexOf('resetUserScopedState: () =>'));
    for (const alan of [
      'myMatches: []', 'userNotifications: []', 'unreadNotificationsCount: 0',
      'adminSession: null', 'savedCards: []', 'pushToken: null',
      'currentUserProfile: null', 'paymentContext: null', 'userLocation: null',
      'staffPanelContext: null', 'impersonatedUser: null',
    ]) {
      expect(blok, `resetUserScopedState '${alan}' içermeli`).toContain(alan);
    }
  });
});

describe('2.4 · tahsilat kuyruğu kullanıcıya bağlı', () => {
  it('kuyruk anahtarı uid içeriyor, uid yokken okuma/yazma yok', () => {
    const s = oku('services/offline/outbox.ts');
    expect(s).toContain("STORAGE_KEY_BASE = 'oyna_owner_outbox_v1'");
    expect(s).toContain('`${STORAGE_KEY_BASE}.${uid}`');
    expect(s).toContain('if (!key) return');
  });

  it('flush başka kullanıcının öğesini göndermiyor ve düşürmüyor', () => {
    const s = oku('services/offline/outbox.ts');
    expect(s).toContain('head.ownerUid && head.ownerUid !== aktifUid()');
    // Eski uid'siz kuyruk kimsenin oturumuyla gönderilmez — karantina.
    expect(s).toContain('eskiKuyruguKarantinayaAl');
  });

  it('öğeler yazan kullanıcının uid\'ini taşıyor (ikinci kemer)', () => {
    expect(oku('shared/outboxModel.ts')).toContain('ownerUid?: string');
    expect(oku('services/offline/outbox.ts')).toContain('ownerUid: aktifUid()');
  });
});

describe('2.5 · cihaz artıkları tek yardımcıyla temizlenir', () => {
  it('logout, signOut\'tan ÖNCE (uid eldeyken) temizliği çağırıyor', () => {
    const s = oku('supabaseAuth.ts');
    const logoutBlok = s.slice(s.indexOf('export const logout ='), s.indexOf('const oturumuZorlaSil'));
    const temizlik = logoutBlok.indexOf('kullaniciVerisiniTemizle');
    const signOut = logoutBlok.indexOf('supabase.auth.signOut()');
    expect(temizlik).toBeGreaterThan(-1);
    expect(signOut).toBeGreaterThan(-1);
    expect(temizlik).toBeLessThan(signOut);
  });

  it('yardımcı, denetimde sayılan artıkların hepsini kapsıyor', () => {
    const s = oku('utils/kullaniciVerisiTemizligi.ts');
    for (const anahtar of [
      'oyna_active_region', 'oyna_selected_regions', 'oyna_studio_draft_v1',
      'owner_activeWidgets', 'oyna_admin_email', 'oyna.ticket.', 'oyna.basvuru.taslak.v1',
    ]) {
      expect(s, `temizlik '${anahtar}' anahtarını kapsamalı`).toContain(anahtar);
    }
    // Bilinçli korunanlar: cihaz bayrakları çıkışta SİLİNMEZ.
    expect(s).not.toContain("guvenliSil('oyna.auth.beniHatirla')");
    const cikisListesi = s.slice(s.indexOf('KULLANICI_ANAHTARLARI'), s.indexOf('HESAP_SILME_ANAHTARLARI'));
    expect(cikisListesi).not.toContain('oyna.auth.hasAccount');
  });

  it('ana sayfa önbellek anahtarı gerçek CACHE_VERSION ile uyumlu', () => {
    const hook = oku('hooks/useDashboardHome.ts');
    const surum = hook.match(/const CACHE_VERSION = (\d+)/)?.[1];
    expect(surum).toBeTruthy();
    expect(oku('utils/kullaniciVerisiTemizligi.ts')).toContain(`oyna.home.v${surum}.`);
  });
});

describe('1.10 · iptal edilen biletin çevrimdışı kopyası', () => {
  it('cancelMyBooking başarıda clearTicketCache çağırıyor', () => {
    const s = oku('services/playerBookingService.ts');
    const blok = s.slice(s.indexOf('export async function cancelMyBooking'));
    expect(blok).toContain('clearTicketCache(bookingId)');
  });

  it('önbellek ömrü 48 saat (30 gün değil)', () => {
    expect(oku('utils/ticketCache.ts')).toContain('48 * 60 * 60 * 1000');
  });

  it('çevrimdışı damga dürüst: kapıda doğrulanamayabilir uyarısı var', () => {
    expect(oku('views/MatchTicket.tsx')).toContain('kapıda doğrulanamayabilir');
  });
});
