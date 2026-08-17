// ════════════════════════════════════════════════════════════════════════════
// HAKEM SEVİYESİ — EKRANDA GÖRÜNEN METNİN TEK KAYNAĞI
// ════════════════════════════════════════════════════════════════════════════
//
// SORUN (denetim B11):
//   Hakem, başvuru formunda (views/ServiceApplication.tsx) kendi seviyesini
//   listeden KENDİSİ seçiyor: 'İl Hakemi' | 'Bölgesel' | 'Klasman' |
//   'FIFA Kokart'. OYNA bu seçim için hiçbir belge istemiyor, hiçbir kurumla
//   doğrulama yapmıyor; değer olduğu gibi `referees.level` kolonuna yazılıyor.
//
//   Buna rağmen bu değer, BAŞKA kullanıcılara (kaptanlara) altın/vurgulu bir
//   rozet olarak çiziliyordu. Ekranda "FIFA" yazan altın bir rozet, kullanıcıya
//   OYNA'nın bu kişiyi doğruladığı izlenimini verir. İki ayrı risk doğar:
//     1) Yanıltıcı beyan — kaptan, doğrulanmış sandığı bir bilgiye göre para
//        ödeyip hakem tutuyor.
//     2) Marka riski — FIFA üçüncü taraf tescilli bir markadır; onun adını
//        doğrulanmış bir yetkinlik gibi göstermek mağaza incelemesinde de
//        hukuken de sorun çıkarır.
//
// KURUCU KARARI: rozet KALDIRILMADI — hakemin gerçek seviyesi kaptan için
// değerli bilgi. Yalnız İDDİANIN SAHİBİ açık hale getirildi: metin artık her
// ekranda "BEYAN: <SEVİYE>" biçiminde çıkıyor.
//
// NEDEN BU DOSYA VAR: aynı metin 8 ayrı yerde çiziliyordu (ServiceProfile,
// Marketplace detay, MarketplaceCard, MatchJoin ×4, ServiceDashboard ×2).
// Metin oralarda tek tek yazılsaydı, yarın biri güncellenip biri unutulurdu ve
// tek bir ekranda çıplak "FIFA" iddiası hayatta kalırdı. Bu yüzden gösterilecek
// metni ÜRETEN tek fonksiyon burada; ekranlar ham `level` alanını doğrudan
// BASMAZ.
//
// DİKKAT: `isElite` (DB'de `is_elite`) BAMBAŞKA bir alandır — yönetim
// panelinden elle açılan bir sıralama/vitrin bayrağı (admin-panel
// DeepEditModals: "ELITE Statüsü"). Hakemin seviyesiyle hiçbir ilgisi yoktur.
// Rozetin görünme koşulu eskiden `isElite` idi ve metin sabit "FIFA" yazıyordu:
// yani seviyesi 'İl Hakemi' olan bir hakem, admin onu elite işaretlediyse
// ekranda "FIFA" görünüyordu. Bu beyan bile değil, tamamen uydurmaydı. Artık
// hakem rozeti hakemin KENDİ seviyesinden beslenir.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Başvuru formundaki seviye listesi.
 *
 * views/ServiceApplication.tsx içindeki REF_LEVELS ile BİREBİR aynı olmalı;
 * tests/unit/hakemSeviyeBeyani.test.ts bunu kilitler. Burada yalnız
 * dokümantasyon ve test amaçlı duruyor — `hakemSeviyeRozeti` bu listeyi bir
 * beyaz liste olarak KULLANMAZ (aşağıdaki nedene bakınız).
 */
export const HAKEM_SEVIYELERI = ['İl Hakemi', 'Bölgesel', 'Klasman', 'FIFA Kokart'] as const;

/** Rozetin başına konan, iddianın sahibini gösteren önek. Tek yerden gelir. */
export const HAKEM_SEVIYE_ONEKI = 'BEYAN';

/**
 * Rozetin yanında/altında kullanılan kısa dürüstlük notu.
 *
 * Öneki sığdıramayacak kadar dar yerlerde (ör. pazaryeri detayındaki üçlü
 * karo satırı) rozet metniyle BİRLİKTE gösterilir — onun yerine geçmez.
 */
export const HAKEM_SEVIYE_NOTU = 'doğrulanmadı';

/**
 * Türkçe büyük harf — 'i' → 'İ', 'ı' → 'I' doğru çalışsın diye locale verilir.
 * (Varsayılan toUpperCase 'ı' harfini bozar: "İl Hakemi" → "IL HAKEMI".)
 */
const buyuk = (s: string) => s.toLocaleUpperCase('tr-TR');

/**
 * Depodaki ham değerin ekranda okunan hali.
 *
 * Yalnız 'FIFA Kokart' için düzeltme var: düz büyütme "FIFA KOKART" verir,
 * Türkçesi "FIFA KOKARTI"dır. Diğer seviyeler büyütülünce zaten doğru okunur.
 */
const OKUNUR_AD: Record<string, string> = {
  'FIFA Kokart': 'FIFA KOKARTI',
};

/**
 * Hakemin seviyesini, ekranda gösterilebilir BEYAN etiketine çevirir.
 *
 * @param hamSeviye `referees.level` alanından gelen ham değer (her tip olabilir;
 *                  eski kayıtlarda null/boş metin var).
 * @returns `'BEYAN: FIFA KOKARTI'` gibi tek biçim metin, ya da gösterilecek bir
 *          şey yoksa `null`. Çağıran taraf `null` gelince rozeti HİÇ çizmemeli
 *          (uydurma bir varsayılan seviye atanmaz).
 *
 * NEDEN BEYAZ LİSTE YOK: `level` kolonu serbest metin; yönetim panelinden elle
 * de yazılabiliyor. Listede olmayan bir değeri sessizce yutmak, hakemin
 * girdiği bilgiyi kullanıcıdan gizlemek olurdu. Bunun yerine ne gelirse gelsin
 * "BEYAN:" öneki ile gösteriyoruz — önek zaten bilginin doğrulanmadığını
 * söylediği için bilinmeyen bir seviye de yanıltıcı olmuyor.
 */
export function hakemSeviyeRozeti(hamSeviye: unknown): string | null {
  if (typeof hamSeviye !== 'string') return null;
  const temiz = hamSeviye.trim();
  if (!temiz) return null;
  const okunur = OKUNUR_AD[temiz] ?? buyuk(temiz);
  return `${HAKEM_SEVIYE_ONEKI}: ${okunur}`;
}
