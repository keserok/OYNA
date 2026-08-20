// ════════════════════════════════════════════════════════════════════════════
// KARTTAN ÇEKİLEN TUTARIN TEK KAYNAĞI
//
// KURUCU KARARI (20 Ağustos 2026): "Kullanıcı herhangi bir maçta slotta kaç
// lira yazıyorsa ONU ödemeli; ödeme ekranında artmış ücretle ASLA
// karşılaşmamalı. Bu kararı her yere uygula."
//
// Bu karar, 19 Ağustos'un iki eklemesini (%3,5 kart işlem bedeli + 10'un
// katına YUKARI yuvarlama) İPTAL EDER. O model 90 ₺ yazan slotu ödeme
// ekranında 100 ₺ yapıyordu — kullanıcının gördüğü ilk rakam ile karttan
// çekilen rakam ayrışıyordu. Yeni kural tersinden kurulur:
//
//   ETİKETTE YAZAN = ÇEKİLEN. Nokta.
//
//   • Ödeme altyapısı maliyeti ve "yuvarlak rakam" isteği FİYAT BELİRLENİRKEN
//     düşünülür (maç ücreti, kapora oranı, tarife) — tahsilat anında değil.
//     Yuvarlak rakam isteyen, fiyatın kendisini yuvarlak koyar.
//   • Bu dosya sunucudaki `prepare_card_payment` ile birebir ikizdir; sunucu
//     da artık taban dışında tek kuruş eklemez (aynı tarihli göç). İkisinden
//     birine "küçük bir ek" koymak, ekran ile kartı yeniden ayrıştırır —
//     yapma (prensip 2.9).
//
// Kırılım alanları (bedel/yuvarlama) API uyumu için duruyor: eski niyet
// kayıtlarında sıfırdan büyük değerler var ve başarı/iade ekranları bu şekli
// okuyor. Yeni hesapta ikisi de HER ZAMAN 0'dır.
// ════════════════════════════════════════════════════════════════════════════

export interface OdemeKirilimi {
  /** Hizmetin bedeli — etikette yazan tutar. Çekilen de budur. */
  taban: number;
  /** İşlem bedeli — 20 Ağu 2026 kararıyla HER ZAMAN 0. */
  bedel: number;
  /** Yuvarlama farkı — 20 Ağu 2026 kararıyla HER ZAMAN 0. */
  yuvarlama: number;
  /** Karttan çekilen toplam — tabanın kendisi. */
  toplam: number;
  /** Uygulanan oran (%) — HER ZAMAN 0 (parametre uyum için kabul edilir). */
  oran: number;
}

/** İki ondalığa kırpar. Kayan nokta artığını (0.1+0.2) temizler. */
const kurus = (n: number): number => Math.round(n * 100) / 100;

/**
 * Karttan çekilecek tutar = etiketteki taban. Kırılım alanları 0 döner.
 *
 * @param taban Hizmetin bedeli (slot ücreti, kapora, cüzdan yüklemesi…)
 * @param _oran Eski çağıranlar için kabul edilir, UYGULANMAZ. Ekrana ek
 *              yansıtacak bir oran artık yoktur; sunucu da eklemez.
 */
export const odemeKirilimi = (taban: number, _oran: number): OdemeKirilimi => {
  const t = kurus(Math.max(taban || 0, 0));
  return { taban: t, bedel: 0, yuvarlama: 0, toplam: t, oran: 0 };
};
