// ─── Lansman özellik anahtarları — TEK KAYNAK ────────────────────────────────
// Kurucu kararı (16 Ağustos 2026): OYNA, kullanıcı adına bakiye TUTMAZ.
// Uygulama içinde saklı bakiye ("cüzdan") 6493 sayılı Kanun kapsamında
// elektronik para ihracı sayılır ve lisans ister; OYNA'nın lisansı yok.
// v1'de ödeme İŞLEM BAŞINA karttan alınır (iyzico), iade KARTA döner.
//
// Bu bayrak DERLEME zamanı sabitidir — sunucudan okunmaz. Nedeni:
//   1. Kapı FAIL-CLOSED olmalı: sunucu ayarı okunamadığında cüzdan
//      "açık kalıvermiş" olamaz.
//   2. Ölü kod paketten ayıklanır (tree-shake); cüzdan ekranı pakete girmez.
// Sunucu tarafındaki ikizi: app_config.wallet_enabled (varsayılan false) +
// payment_intents TOP_UP kapısı. İki katman bilinçli (bkz. OYNA_PRENSIPLER §6.1).
//
// Cüzdan ancak lisanslı bir modelle (ör. lisanslı kuruluş ortaklığı) ve
// kurucu kararıyla geri açılır: bu sabit true yapılır, sunucu anahtarı açılır
// ve sözleşme metinleri yeniden yayınlanır. Üçü birden — yarım açılış yok.
export const WALLET_ENABLED = false;

/**
 * Cüzdan yüzeyleri gösterilsin mi? (ekran, bakiye kutuları, "cüzdana yükle"
 * kısayolları, bakiyeyle ödeme seçenekleri)
 *
 * Fonksiyon olarak dışa verilir ki çağrı yerleri "neden kapalı?" diye
 * düşünmeden tek soruyu sorsun; gerekçe ve açılış koşulu burada, tek yerde.
 */
export const isWalletEnabled = (): boolean => WALLET_ENABLED;

// ════════════════════════════════════════════════════════════════════════════
// UYGULAMADAN PARA ÇEKME
//
// KURUCU KARARI (19 Ağustos 2026):
//   "Tesislerin hak edişlerini uygulamadan çekme gibi bir durumları şu anlık
//    olmayacak; biz kendimiz bize ödenen miktardan onlara ödeme yapacağız."
//   "Kaleci ve hakemlerin işlemlerini biz halledeceğiz manuel olarak,
//    uygulamadan çekim yapamasınlar."
//
// KAPANAN ŞEY YALNIZ ÇEKİM TALEBİ AÇMAK. Hakediş defteri aynen durur: kim ne
// kazandı, ne zaman ödenebilir hâle geldi — hepsi görünmeye devam eder. Tesis,
// saha kiralanıp maç oynandıktan sonra ödemesini OYNA'dan alır.
//
// Sunucu ikizi: request_payout / request_payout_with_method artık PAYOUT_MANUAL
// hatası döndürüyor. İki katman bilinçli (prensip 6.1): arayüz düğmeyi hiç
// göstermez, sunucu yine de kapıyı tutar.
export const CEKIM_UYGULAMADAN_ACIK = false;

/** Kullanıcı uygulamadan para çekme talebi açabilir mi? */
export const cekimUygulamadanAcikMi = (): boolean => CEKIM_UYGULAMADAN_ACIK;

/** Çekim kapalıyken ekranlarda gösterilecek TEK cümle. */
export const CEKIM_KAPALI_ACIKLAMA =
  'Kazancın OYNA tarafından hesabına aktarılır. Maç oynandıktan sonra ödemen yapılır — uygulamadan çekim talebi açmana gerek yok.';

// ════════════════════════════════════════════════════════════════════════════
// KALECİ / HAKEM KİRALAMA
//
// KURUCU KARARI (24 Ağustos 2026): kaleci ve hakem kiralamasının teminatı
// KARTTAN BLOKE ile alınır. Blokaj gerçek bir ödeme sağlayıcısı ister; iyzico
// sözleşmesi tamamlanmadığı için akış v1'e yetişmiyor.
//
// ─── NEDEN GİRİŞ NOKTASI KAPANIYOR, EKRAN DEĞİL ─────────────────────────────
// Ekran (views/Marketplace.tsx) sonuna kadar geziliyordu ama tek eylem tuşu
// kodda sabit kapalıydı ve üstünde "Kiralama Çok Yakında" yazıyordu. Apple,
// yayınlanmış bir uygulamada "yakında" yüzeylerini Guideline 2.1 altında
// reddediyor: kullanıcı sonuna kadar gidip hiçbir zaman tamamlayamıyor.
//
// Bu yüzden ekranı silmiyoruz — ONA GİDEN KAPIYI kapatıyoruz. Kod yerinde
// durur, blokaj akışı yazıldığı gün bu sabit true olur ve kartlar geri gelir.
// Yarım açılış yok: bu sabit ancak teminat akışı UÇTAN UCA çalıştığında açılır.
export const KALECI_HAKEM_KIRALAMA_ACIK = false;

/** Kaleci/hakem pazaryeri kullanıcıya gösterilsin mi? */
export const kaleciHakemKiralamaAcikMi = (): boolean => KALECI_HAKEM_KIRALAMA_ACIK;

// ─── VİTRİN AYRI BİR KARARDIR (kurucu, 26 Ağustos 2026) ─────────────────────
// Yukarıdaki bayrak kiralama İŞLEMİNİ kapatır ve kapalı kalır: teminat akışı
// uçtan uca çalışmadan açılmaz. Kurucu ise vitrini geri istedi — listeleme ve
// profil gezme, işlem tuşu OLMADAN.
//
// Bu Apple 2.1 ile çelişmez, çünkü çelişkiyi doğuran şey vaadin kendisiydi:
// eski ekran "Kiralama Çok Yakında" yazan ölü bir tuş taşıyordu — sonuna
// kadar gidip tamamlanamayan akış. Tuşsuz vitrinde vaat yok: kullanıcı
// sağlayıcıları keşfeder, profillerini okur, işlem sözü verilmez.
// (Aynı desen mağazalarda yaygındır: rehber/dizin ekranı.)
//
// İçerik boş da değil: demo sağlayıcılar RLS üzerinden ve HERKESE görünür —
// goalkeepers/referees select politikası `demo_mode_enabled` ayarını okur,
// ayar hesaptan bağımsızdır (5.6 uyumu: herkes aynı listeyi görür).
export const KALECI_HAKEM_VITRIN_ACIK = true;
