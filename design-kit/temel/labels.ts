/* ─────────────────────────────────────────────────────────────────────────
   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.
   Kaynak: ui/labels.ts
   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit
   ───────────────────────────────────────────────────────────────────────── */
/**
 * IP-13 — Ekran adı ve aksiyon etiketlerinin TEK kaynağı.
 *
 * Neden var: aynı ekranın akış boyunca iki adı olabiliyordu. Alt menüde
 * "Sahalar" yazan sekme, açılınca kendini "Saha Vitrini" diye tanıtıyordu;
 * Maçlarım da kullanıcıyı "Saha Vitrini'nden…" diye oraya yolluyordu — oysa
 * alt menüde öyle bir sekme yok. Kullanıcı sekmede ne gördüyse onu arar.
 *
 * Kural: bir ekranın adı BURADA bir kez yazılır. Sekme etiketi, ekran başlığı
 * ve metin içindeki atıflar aynı sabitten beslenir.
 */

/** Ekran adları — sekme etiketi ve ekran başlığı AYNI olmak zorunda. */
export const SCREEN = {
  dashboard: 'Ana Sayfa',
  matchDiscovery: 'Top Oyna',
  myMatches: 'Maçlarım',
  /**
   * Kullanıcı kararı (2026-08, onaylı ana sayfa tasarımı): ekranın adı
   * "Saha Kirala". Önceki adlar sırasıyla "Saha Vitrini" → "Sahalar" idi;
   * ikisi de kaldırıldı. Yeni ad EYLEMİ söylüyor — kullanıcı "sahaları
   * listelemek" değil "saha kiralamak" için giriyor.
   */
  pitchDiscovery: 'Saha Kirala',
  profile: 'Profil',
  social: 'Sosyal',
  messages: 'Mesajlar',
  wallet: 'Cüzdan',
  settings: 'Ayarlar',
  studio: 'Taktik Stüdyo',
  /** views/MatchCreate.tsx ekran başlığıyla birebir aynı. */
  matchCreate: 'Maç Kur',
  /** views/Marketplace.tsx type="GK" ekran başlığıyla birebir aynı. */
  marketplaceGk: 'Kaleci Bul',
  /** views/Marketplace.tsx type="REF" ekran başlığıyla birebir aynı. */
  marketplaceRef: 'Hakem Kirala',
} as const;

/**
 * Ana sayfadaki KAPI KARTLARININ adı.
 *
 * Neden ayrı: Kaleci ve Hakem kartları ekranın yarısı genişliğinde. "Kaleci
 * Bul" oraya tek satıra sığmıyor; sığdırmak için puntoyu düşürmek ölçeği
 * (ui/type.ts) delerdi. Kullanıcı kararı: KART kısa adı taşır, açılan EKRAN
 * tam adı taşır.
 *
 * Drift koruması: farklı olması GEREKMEYEN adlar SCREEN'den türetilir, elle
 * ikinci kez yazılmaz. Yalnız iki kart kendi kısa adını taşır.
 */
export const CARD = {
  matchDiscovery: SCREEN.matchDiscovery,
  pitchDiscovery: SCREEN.pitchDiscovery,
  matchCreate: SCREEN.matchCreate,
  marketplaceGk: 'Kaleci',
  marketplaceRef: 'Hakem',
  studio: SCREEN.studio,
} as const;

/**
 * Bekleme metinleri. Üç nokta DAİMA tek karakter `…` (kullanıcı kararı) —
 * repoda `...` ve `…` neredeyse yarı yarıya bölünmüştü.
 */
export const WAIT = {
  loading: 'Yükleniyor…',
  saving: 'Kaydediliyor…',
  sending: 'Gönderiliyor…',
  searching: 'Aranıyor…',
  preparing: 'Hazırlanıyor…',
} as const;

/**
 * Yıkıcı onay diyalogları — kullanıcı kararı:
 *   • Güvenli buton DAİMA "Vazgeç".
 *   • Yıkıcı buton FİİLİ SÖYLER ("Maçtan Ayrıl", "Rezervasyonu İptal Et").
 *   • "Evet," ön eki KULLANILMAZ.
 *
 * Eskiden yan yana "Evet, İptal Et" ile "Vazgeç" duruyordu; Türkçede ikisi de
 * "iptal" demek — kullanıcı hangisinin yıkıcı olduğunu ayırt edemiyordu.
 */
export const CONFIRM = {
  /** Her yıkıcı diyalogda aynı: geri adım. */
  cancel: 'Vazgeç',
  /** Yıkıcı eylemler — fiili söyler, "Evet," yok. */
  leaveMatch: 'Maçtan Ayrıl',
  cancelMatch: 'Maçı İptal Et',
  cancelBooking: 'Rezervasyonu İptal Et',
  deleteAccount: 'Hesabı Sil',
  removeMember: 'Üyeyi Çıkar',
  leaveTeam: 'Takımdan Ayrıl',
  switchRole: 'Rolü Değiştir',
  report: 'Bildir',
} as const;

export type ScreenKey = keyof typeof SCREEN;
