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
