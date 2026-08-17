// ─── İçerik Süzgeci (App Store Kural 1.2 · "objectionable content filtering") ──
//
// Apple, kullanıcıların birbirine içerik yazabildiği her uygulamada ÜÇ şey ister:
//   (a) uygunsuz içeriği SÜZMEK      ← bu dosya
//   (b) bildirme (şikayet) yolu      ← MessagesView / MatchJoin
//   (c) engelleme yolu               ← user_blocks + teamChatService
// (b) ve (c) vardı, (a) yoktu. Bu modül gönderim anında devreye girer: açık
// küfür/hakaret içeren mesaj SUNUCUYA HİÇ GİTMEZ.
//
// ══ TASARIM KARARI: LİSTE BİLEREK DAR TUTULDU ═══════════════════════════════
// Masum bir cümleyi engellemek, bir küfrü kaçırmaktan DAHA KÖTÜDÜR. Kullanıcı
// neden gönderemediğini anlamaz, uygulamayı bozuk sanır ve bir daha yazmaz.
// Kaçan küfür için ise zaten şikayet + engelleme yolu var. Bu yüzden:
//
//   · Yalnız AÇIK küfür ve ağır hakaret listede. "salak, aptal, gerzek, mal,
//     eşek, öküz, bok" gibi hafif/çift anlamlı sözler BİLEREK DIŞARIDA —
//     günlük konuşmada masum cümlelerde de geçerler ("aptalca bir hata yaptım",
//     "topu bok gibi vurdum", "hıyar aldım").
//
//   · 'ı' ile 'i' AYRI harf olarak bırakılır. Sebebi somut: katlansaydı
//     "sıkışık trafik" küfür köküyle eşleşir, masum bir mesaj engellenirdi.
//
//   · Kökler iki gruba ayrılır. Bazıları kelimenin BAŞINDA aranabilir (o
//     harflerle başlayan masum Türkçe kelime yok → ekleri de yakalar), bazıları
//     yalnız TAM kelime olarak aranır. Örnek: "göt" tam eşleşmeyle aranır,
//     çünkü baştan aransaydı "götürdüm / götürüyorum" engellenirdi. Aynı sebeple
//     "sikiş" tam eşleşmedir — "sikişik" (sıkışık'ın yazım hatası) geçebilsin.
//
//   · "s*ktir" gibi kendini sansürlemiş yazımlar KASITLI olarak geçer:
//     kullanıcı zaten yumuşatmış demektir.
//
// ══ 17 Ağustos 2026 · denetimde bulunan DELİKLER kapatıldı ══════════════════
//   1. TÜRKÇE KARAKTERSİZ yazımlar (telefon klavyesinde en yaygın hâl) geçiyordu:
//      pic, serefsiz, yavsak, got, gotveren, surtuk, pust, oc. Listede yalnız
//      'orospu/amcik' gibi birkaç ASCII eşi vardı; ç/ş/ğ/ö taşıyan köklerin
//      ASCII ikizleri eksikti.
//   2. Yaygın çekimler (sikti, siktin, siktiler, siktiğimin, sikeceğim) hiçbir
//      köke takılmıyordu.
//   3. Harf aralayarak yazma ("s i k t i r", "a.m.k") süzgeci atlatıyordu.
// Ve iki YANLIŞ POZİTİF giderildi:
//   4. "51k TL ceza" engelleniyordu (5→s, 1→i çevrimi "sik" üretiyordu).
//   5. Büyük harfli "SIKIYIM" (= sıkıyım) engelleniyordu.

/** Rakam/işaret oyunlarını harfe çevirir (l33t): "s1kt1r" → "siktir". */
const HARF_OYUNLARI: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's',
  'â': 'a', 'î': 'i', 'û': 'u',
};

// Rakam OLMAYAN oyunlar (işaretler ve şapkalı harfler): bunlar hiçbir zaman
// "sayı" anlamına gelmez, o yüzden koşulsuz çevrilir.
// DİKKAT: bu deseni "anahtarlardan otomatik üret" diye kurmaya çalışma —
// karakter sınıfı içinde kaçışlı rakam (\1) sekizlik koda dönüşüp sessizce bozar.
const ISARET_DESENI = /[@$âîû]/g;
const RAKAM_DESENI = /[0-9]/g;
/** Türkçe alfabe + şapkalı harfler — "bu parça ne kadar harf?" sayımında kullanılır. */
const HARF_DESENI = /[a-zçğıiöşüâîû]/g;

/**
 * Rakam→harf çevrimini YALNIZ harf ağırlıklı parçalara uygular.
 *
 * NEDEN (denetim, yanlış pozitif): eskiden çevrim metnin tamamına körlemesine
 * uygulanıyordu; "51k TL ceza" cümlesindeki "51k" → "sik" olup ENGELLENİYORDU.
 * Kural artık dar: bir parçada harf sayısı rakam sayısını GEÇMİYORSA o parça
 * bir SAYIDIR (51k, 5-0, 21:00, 2026, 0532...) ve dokunulmaz. Geçiyorsa l33t
 * yazımdır (s1kt1r → 4 harf / 2 rakam) ve çevrilir.
 */
function rakamlariCevir(metin: string): string {
  // Boşluklar korunarak bölünür; her parça KENDİ başına değerlendirilir.
  return metin.split(/(\s+)/).map((parca) => {
    const rakam = (parca.match(RAKAM_DESENI) ?? []).length;
    if (rakam === 0) return parca;
    const harf = (parca.match(HARF_DESENI) ?? []).length;
    if (harf <= rakam) return parca;
    return parca.replace(RAKAM_DESENI, (c) => HARF_OYUNLARI[c] ?? c);
  }).join('');
}

/**
 * Karşılaştırma için metni sadeleştirir.
 * Türkçe 'İ' harfinin küçüğü JS'te 'i' + AYRI bir nokta işareti (U+0307) olarak
 * çıkar; o nokta temizlenmezse "SİKTİR" hiçbir kökle eşleşmez.
 */
export function metniNormalize(metin: string): string {
  const kucuk = String(metin ?? '')
    .toLowerCase()
    // U+0307 = 'İ' küçültülünce ayrı düşen nokta işareti.
    .split('̇').join('')
    .replace(ISARET_DESENI, (c) => HARF_OYUNLARI[c] ?? c);
  // Rakam çevrimi parça parça yapılır (bkz. rakamlariCevir — "51k TL" korunur).
  // Ardından "siiiktir" gibi uzatmalar kısaltılır: yalnız 3+ tekrar sadeleşir,
  // masum Türkçe kelimeler ("dikkat", "anne") en fazla 2 aynı harf taşır.
  return rakamlariCevir(kucuk).replace(/(.)\1{2,}/g, '$1');
}

/**
 * Kelimenin BAŞINDA aranan kökler — Türkçe ekleri de yakalar
 * ("orospu" → orospusun, orospular). Buraya eklenecek her kök için tek soru:
 * "Bu harflerle başlayan masum bir Türkçe kelime var mı?" Varsa kök buraya
 * DEĞİL, aşağıdaki TAM_KELIME listesine yazılmalı.
 *
 * ASCII İKİZLERİ: Türkçe karakter tuşu olmayan klavyede yazılan hâller de
 * listede ('şerefsiz' yanında 'serefsiz' gibi). Bunlar ayrı satırlarda durur,
 * çünkü ç/ş/ğ/ö'yü otomatik katlamak "sürtünme → surtunme" gibi masum
 * kelimeleri de köke yaklaştırırdı; tek tek yazmak kontrolü bizde tutar.
 */
const KOK_BASLANGIC: readonly string[] = [
  'orospu', 'oruspu',
  'amcık', 'amcik', 'amcığ', 'amcig',
  // 'amına' yalnız noktasız 'ı' ile: noktalı "amina" yazımı "Amina" adıyla
  // çakışıyordu, bir insanın adını engellemektense kaçırmayı seçtik.
  // Bitişik yazılan "aminakoyayım" için aşağıdaki BITISIK_KALIPLAR var.
  'amına',
  // 'sikti' geniş bilerek: sikti, siktin, siktiler, siktim, siktir, siktiğimin.
  // 'sıktı' (sıkmak) NOKTASIZ ı taşır, bu yüzden buraya takılmaz.
  'sikti', 'siktir',
  // 'sikeceğim/sikecegim' için. DİKKAT: kök 'sike' ya da 'sikec' YAPILMADI —
  // futbol uygulamasında "şike" ve "şikeci" ASCII yazılınca ("sike", "sikeci")
  // masum cümleler engellenirdi. Aynı sebeple 'sikey' yerine tam 'sikeyim':
  // "şikeyi" ASCII'de "sikeyi" olur ve 'sikey' köküne takılıyordu.
  'sikeceğ', 'sikeceg', 'sikeyim',
  // 'sikiyim' AYRI YAZILDI (kısaltma denemesi 'siki' MASUM kelimeleri yerdi:
  // "sıkıyım" noktasız yazılır ama "şikiyi" gibi ASCII yazımlar 'siki' köküne
  // takılırdı). Bir ara listeden düşmüştü ve en yaygın küfür biçimi geçiyordu.
  'sikiyim', 'sikiyorum',
  'siker', 'sikim', 'sikik',
  'yarrak', 'yarrağ', 'yarrag', 'yarak',
  'piç',
  // ASCII 'pic' TEK BAŞINA kök yapılamadı: "Picasso" (ve picnic/pickup) o kökle
  // başlıyor, masum bir cümle engelleniyordu. Bu yüzden yalnız Türkçe EKLERİYLE
  // aranır; ek almamış "pic" aşağıda TAM kelime olarak listelidir.
  'pici', 'pice', 'picl', 'picti',
  'pezevenk', 'kahpe', 'yavşak', 'yavsak', 'puşt', 'pust',
  'şerefsiz', 'serefsiz',
  'ibne', 'sürtük', 'surtuk', 'kaltak', 'gavat', 'godoş', 'godos',
  'gerizekal', 'dangalak', 'dallama',
  'götver', 'gotver', 'götlek', 'gotlek', 'götoş', 'gotos',
  // 'götü/gotu' KÖK YAPILAMAZ — denenip GERİ ALINDI: "götürdüm topu",
  // "götürüyorum" gibi çok sık kullanılan masum cümleler engelleniyordu.
  // Bedeli: ASCII "gotune" gibi ekli hakaretler kaçıyor. Dosyanın kuralı
  // gereği masum olan kazanır; kaçan için şikayet + engelleme yolu var.
];

/**
 * Yalnız TAM kelime olarak aranan sözler. Baştan arasak masum kelimeleri
 * yutarlardı: göt→götürmek, got→goturdum, sikiş→sikişik, sik→sikke,
 * oç/oc→ocak.
 */
const TAM_KELIME: ReadonlySet<string> = new Set([
  // ASCII 'got' ÇIKARILDI: "got it", "I got this" gibi masum İngilizce
  // cümleler engelleniyordu. Türkçe 'göt' (noktalı ö) tam kelime olarak
  // kalıyor; ASCII yazımın ekli hâlleri ('gotu', 'gotune', 'gotver'…)
  // aşağıdaki kök listesinden yakalanıyor. Aynı sebeple ASCII 'oc' de
  // çıkarıldı ("OC" kısaltması masum); Türkçe 'oç' duruyor.
  // ASCII 'got' / 'pic' / 'oc' LİSTEDE KALIYOR: Türkçe klavyede noktasız yazan
  // kullanıcı çoğunlukta ve "got herif", "pic herif" gerçek hakaret. Bunların
  // masum İngilizce anlamları ("got it", "nice pic") ayrı bir komşuluk
  // kuralıyla korunuyor (bkz. INGILIZCE_KOMSU).
  'göt', 'got', 'sik', 'sikiş', 'sikis', 'oç', 'oc', 'pic',
  'amk', 'amq', 'aq',
]);

/**
 * Boşluk/işaret koyarak bölünen kalıplar. Mesajın YALNIZ harfleri bitiştirilip
 * burada aranır; böylece "amina koyayım" da "aminakoyim" de yakalanır ama tek
 * başına "Amina" adı serbest kalır.
 *
 * NEDEN kısa kökler (sik, göt...) bu birleştirilmiş metinde ARANMAZ: tüm mesaj
 * bitiştiğinde masum cümleler de küfür üretir — "bas ikili oyna" → "basikili"
 * içinde "sik" geçer. Harf aralayarak yazma için aşağıdaki, çok daha dar olan
 * `aralananlariBirlestir` kullanılır.
 */
const BITISIK_KALIPLAR: readonly string[] = [
  'aminakoy', 'amınakoy', 'aminaqoy',
  'ananisik', 'ananısik', 'anasinisik', 'anasınısik', 'avradinisik',
];

/** Normalleştirilmiş metni kelimelere ayırır (harf olmayan her şey ayraçtır). */
const kelimelereAyir = (normal: string): string[] =>
  normal.split(/[^a-zçğıiöşü]+/).filter(Boolean);

/**
 * HARF ARALAYARAK yazma: "s i k t i r", "a.m.k", "s-i-k-t-i-r".
 * Yalnız ART ARDA GELEN TEK HARFLİK parçalar birleştirilir; üç ve daha uzun
 * diziler aday sayılır. Böylece "a.m.k" yakalanırken normal cümleler
 * ("bas ikili oyna") asla birleştirilmez — birleştirme tüm mesaja uygulansaydı
 * masum cümleler küfür üretirdi.
 */
function aralananlariBirlestir(kelimeler: readonly string[]): string[] {
  const adaylar: string[] = [];
  let dizi: string[] = [];
  const bosalt = () => {
    if (dizi.length >= 3) adaylar.push(dizi.join(''));
    dizi = [];
  };
  for (const kelime of kelimeler) {
    if (kelime.length === 1) dizi.push(kelime);
    else bosalt();
  }
  bosalt();
  return adaylar;
}

/**
 * Büyük ASCII 'I' harfi BELİRSİZDİR: Türkçe klavyede 'ı', ASCII klavyede 'i'
 * demektir. `toLowerCase()` onu her zaman 'i' yapıyordu ve "SIKIYIM" (= sıkıyım)
 * ENGELLENİYORDU. Bu yüzden metin iki kez süzülür:
 *   1) BELİRSİZ okuma — büyük 'I' hiçbir kökle eşleşmeyen bir ayraca çevrilir;
 *      burada TÜM kökler aranır (küçük harfli metinler bu turdan geçer, yani
 *      davranış eskisiyle birebir aynıdır).
 *   2) ASCII okuması — büyük 'I' = 'i'; burada yalnız 'ı/i' belirsizliğinden
 *      etkilenmeyen kökler aranır. Böylece "SEREFSIZ" ve "PIC" yakalanmaya
 *      devam ederken "SIKIYIM" ve "AMINA" masum kalır.
 *
 * BİLEREK KAÇAN: tamamı büyük ASCII harfle yazılmış "SIKTIR" da bu kuralla
 * geçer — çünkü "sıktır" (sıkmak) gerçek ve masum bir kelimedir, ikisini
 * ayırmanın bir yolu yoktur. Dosyanın felsefesi gereği masum olan kazanır.
 */
// Boşluk seçildi: kelime ayracıdır, yani büyük 'I' geçen yer hiçbir köke
// harf olarak katılamaz ("SIKIYIM" → "s k y m").
const BELIRSIZ_I_AYRACI = ' ';
/** 'ı/i' belirsizliğine duyarlı kökler: ASCII okumasında ARANMAZ. */
const iBelirsizKok = (kok: string): boolean => kok.startsWith('sik') || kok === 'amına';
const KOK_BASLANGIC_ASCII = KOK_BASLANGIC.filter((k) => !iBelirsizKok(k));
const TAM_KELIME_ASCII = new Set([...TAM_KELIME].filter((k) => !iBelirsizKok(k)));

/**
 * İNGİLİZCE KOMŞULUK İSTİSNASI.
 *
 * 'got', 'pic' ve 'oc' ASCII yazımları hem hakaret hem masum İngilizce
 * olabiliyor. Bağımsız denetim iki gerçek yanlış pozitif ölçtü: "got it" ve
 * "nice pic" engelleniyordu — üstelik fotoğraf paylaşılan bir uygulamada.
 * Kelimenin KOMŞUSU tipik bir İngilizce işaretçiyse hakaret sayılmaz.
 * Liste dar: yalnız bu üç kelimeyle birlikte sık geçen İngilizce sözcükler.
 * ("got herif", "pic herif" gibi Türkçe komşuluklar YAKALANMAYA devam eder.)
 */
const INGILIZCE_ISTISNA: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['got', new Set(['it', 'this', 'that', 'you', 'we', 'they', 'i', 'ive', 'have', 'has', 'the', 'a', 'my', 'your', 'me'])],
  ['pic', new Set(['nice', 'the', 'a', 'this', 'that', 'my', 'your', 'good', 'cool', 'great', 'send', 'sent'])],
  ['oc', new Set(['the', 'a', 'my', 'your', 'is', 'in', 'of'])],
]);

/** Bu tam-kelime isabeti, komşusuna bakınca masum İngilizce mi? */
function ingilizceMasumMu(kelimeler: readonly string[], i: number): boolean {
  const izinli = INGILIZCE_ISTISNA.get(kelimeler[i]);
  if (!izinli) return false;
  return izinli.has(kelimeler[i - 1] ?? '') || izinli.has(kelimeler[i + 1] ?? '');
}

/** Tek kelime köklerden birine takılıyor mu? (tam eşleşme ya da kök başlangıcı) */
function kelimeUygunsuzMu(
  kelime: string,
  kokler: readonly string[],
  tamKelimeler: ReadonlySet<string>,
): boolean {
  return tamKelimeler.has(kelime) || kokler.some((k) => kelime.startsWith(k));
}

/**
 * Tek bir okuma üzerinde tarama yapar.
 * `aralananKokler`/`aralananTam`: harf aralayarak yazılmış adaylar için ayrı
 * liste verilebilir — harf aralamak KASITLI atlatma kanıtıdır, orada büyük 'I'
 * belirsizliğini sanığın lehine yorumlamayız ("S I K T I R" yakalanır, ama
 * normal yazılmış "SIKTIR" = sıktır masum sayılmaya devam eder).
 */
function tara(
  normal: string,
  kokler: readonly string[],
  tamKelimeler: ReadonlySet<string>,
  aralananKokler: readonly string[] = kokler,
  aralananTam: ReadonlySet<string> = tamKelimeler,
): string | null {
  const kelimeler = kelimelereAyir(normal);

  for (let i = 0; i < kelimeler.length; i++) {
    const kelime = kelimeler[i];
    if (!kelimeUygunsuzMu(kelime, kokler, tamKelimeler)) continue;
    // Komşusu İngilizce işaretçiyse ("got it", "nice pic") hakaret sayılmaz.
    if (ingilizceMasumMu(kelimeler, i)) continue;
    return kelime;
  }

  // Harf aralayarak yazılmış olabilir: "s i k t i r" → "siktir".
  for (const aday of aralananlariBirlestir(kelimeler)) {
    if (kelimeUygunsuzMu(aday, aralananKokler, aralananTam)) return aday;
  }

  const bitisik = kelimeler.join('');
  return BITISIK_KALIPLAR.find((k) => bitisik.includes(k)) ?? null;
}

/**
 * Metindeki İLK uygunsuz ifadeyi döndürür (normalleştirilmiş hali), yoksa null.
 * Saf fonksiyon — ağ, depolama, yan etki yok; testten doğrudan çağrılabilir.
 */
export function ilkUygunsuzKelime(metin: string): string | null {
  const ham = String(metin ?? '');
  // Büyük ASCII 'I' (U+0049) — Türkçe 'İ' (U+0130) BAŞKA bir karakterdir, ona
  // dokunulmaz; o zaten tartışmasız 'i' demektir.
  const belirsizIVar = ham.includes('I');

  const belirsizOkuma = metniNormalize(
    belirsizIVar ? ham.split('I').join(BELIRSIZ_I_AYRACI) : ham,
  );
  const bulunan = tara(belirsizOkuma, KOK_BASLANGIC, TAM_KELIME);
  if (bulunan) return bulunan;

  if (!belirsizIVar) return null;
  return tara(
    metniNormalize(ham),
    KOK_BASLANGIC_ASCII, TAM_KELIME_ASCII,
    // Aralanmış adaylarda tüm kökler geçerli — gerekçe `tara`nın başında.
    KOK_BASLANGIC, TAM_KELIME,
  );
}

/** Metin açık küfür/hakaret içeriyor mu? */
export function uygunsuzMu(metin: string): boolean {
  return ilkUygunsuzKelime(metin) !== null;
}

/**
 * Gönderim engellendiğinde kullanıcıya gösterilen metin.
 * SUÇLAYICI DEĞİL: "küfür ettin" demez, ne yapacağını söyler. Hangi kelimenin
 * takıldığını da yazmaz — yanlış pozitifte kullanıcıyı gereksiz utandırır,
 * ayrıca süzgeci deneme-yanılmayla atlatmayı kolaylaştırırdı.
 */
export const UYGUNSUZ_ICERIK_MESAJI =
  'Bu mesajı gönderemedik. Topluluk kurallarımız hakaret ve küfür içeren ' +
  'ifadelere izin vermiyor. İfadeni biraz yumuşatıp tekrar dener misin?';
