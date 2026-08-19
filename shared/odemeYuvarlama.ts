// ════════════════════════════════════════════════════════════════════════════
// KARTTAN ÇEKİLEN TUTARIN TEK KAYNAĞI
//
// KURUCU KARARI (19 Ağustos 2026): "Kullanıcı asla buçuklu rakamlar ödemeyecek
// ve her seferinde onlar basamağı yuvarlanmış rakamı ödeyecek şekilde
// ayarlayalım, her seferinde yukarıdaki kısma yuvarlansın."
//
// Örnek (kurucunun kendi örneği):
//   1.000 ₺ saha · %40 kapora → taban 400 ₺
//   ödeme altyapısı bedeli %3,5 → 14 ₺
//   ham toplam 414 ₺ → ekranda ve kartta 420 ₺
//
// ÜÇ RAKAM, ÜÇÜ DE AYRI TUTULUR — ve bu ayrım para için hayati:
//   • taban      : hizmetin bedeli. Tesise yazılan, komisyonun hesaplandığı,
//                  maç defterine giren tutar BUDUR. Yuvarlama onu DEĞİŞTİRMEZ.
//   • bedel      : ödeme altyapısının GERÇEK oranıyla hesaplanan işlem bedeli.
//                  iyzico'nun bizden kestiğiyle karşılaştırılabilir kalmalı;
//                  yuvarlama buraya karışırsa "eklediğimiz bedel maliyeti
//                  karşılıyor mu" sorusu bir daha ölçülemez.
//   • yuvarlama  : yalnız 10'un katına tamamlayan fark. Kurucu kararı gereği
//                  OYNA'da kalır (tesise gitmez, bedele sayılmaz).
//
// toplam = taban + bedel + yuvarlama · her zaman 10'un katı · her zaman ham
// toplamdan BÜYÜK VEYA EŞİT.
//
// NEDEN PAYLAŞILAN DOSYA: ekranda yazan tutar ile karttan çekilen tutar asla
// ayrışmamalı (prensip 2.9). Sunucudaki `_odeme_yuvarla` bu dosyanın birebir
// ikizidir; ikisi de aynı yuvarlama ve aynı kuruş kırpmasını uygular.
// ════════════════════════════════════════════════════════════════════════════

/** Yuvarlama basamağı: 10 ₺. Kurucu kararı — "onlar basamağı". */
export const YUVARLAMA_ADIMI = 10;

export interface OdemeKirilimi {
  /** Hizmetin bedeli — tesise/maça yazılan tutar. Yuvarlamadan etkilenmez. */
  taban: number;
  /** Ödeme altyapısının gerçek oranıyla hesaplanan işlem bedeli. */
  bedel: number;
  /** 10'un katına tamamlayan fark. OYNA'da kalır. */
  yuvarlama: number;
  /** Karttan çekilen toplam — daima 10'un katı. */
  toplam: number;
  /** Uygulanan oran (%). 0 ise bedel de 0'dır. */
  oran: number;
}

/** İki ondalığa kırpar. Kayan nokta artığını (0.1+0.2) temizler. */
const kurus = (n: number): number => Math.round(n * 100) / 100;

/**
 * Bir sonraki 10'un katına YUKARI yuvarlar.
 * Zaten 10'un katıysa olduğu gibi bırakır (400 → 400, 401 → 410).
 *
 * Kuruş artığına karşı korumalı: 420 tutarı kayan noktada 419.99999997 olarak
 * temsil edilirse `Math.ceil` onu 420 yerine 420'ye değil 42'lik adımda bir
 * üste taşırdı. Bu yüzden bölüm önce 6 haneye yuvarlanır.
 */
export const onaYuvarla = (tutar: number): number => {
  if (!(tutar > 0)) return 0;
  const adim = tutar / YUVARLAMA_ADIMI;
  return kurus(Math.ceil(Math.round(adim * 1e6) / 1e6) * YUVARLAMA_ADIMI);
};

/**
 * Karttan çekilecek tutarı ve kırılımını hesaplar.
 *
 * @param taban Hizmetin bedeli (kapora, slot ücreti, maç payı…)
 * @param oran  Ödeme altyapısı oranı, yüzde olarak (ör. 3.5). 0 → bedel yok,
 *              ama yuvarlama YİNE uygulanır: kullanıcı her hâlükârda 10'un
 *              katını öder.
 */
export const odemeKirilimi = (taban: number, oran: number): OdemeKirilimi => {
  const t = kurus(Math.max(taban || 0, 0));
  const o = Math.max(oran || 0, 0);
  if (t <= 0) return { taban: 0, bedel: 0, yuvarlama: 0, toplam: 0, oran: o };

  const bedel = o > 0 ? kurus((t * o) / 100) : 0;
  const ham = kurus(t + bedel);
  const toplam = onaYuvarla(ham);
  return { taban: t, bedel, yuvarlama: kurus(toplam - ham), toplam, oran: o };
};
