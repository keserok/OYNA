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

/** Rakam/işaret oyunlarını harfe çevirir (l33t): "s1kt1r" → "siktir". */
const HARF_OYUNLARI: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's',
  'â': 'a', 'î': 'i', 'û': 'u',
};

// Bütün rakamları tarar; karşılığı olmayan rakam (2, 6, 8, 9) olduğu gibi kalır.
// DİKKAT: bu deseni "anahtarlardan otomatik üret" diye kurmaya çalışma —
// karakter sınıfı içinde kaçışlı rakam (\1) sekizlik koda dönüşüp sessizce bozar.
const BIRIM_DESENI = /[0-9@$âîû]/g;

/**
 * Karşılaştırma için metni sadeleştirir.
 * Türkçe 'İ' harfinin küçüğü JS'te 'i' + AYRI bir nokta işareti (U+0307) olarak
 * çıkar; o nokta temizlenmezse "SİKTİR" hiçbir kökle eşleşmez.
 */
export function metniNormalize(metin: string): string {
  return String(metin ?? '')
    .toLowerCase()
    // U+0307 = 'İ' küçültülünce ayrı düşen nokta işareti.
    .split('\u0307').join('')
    .replace(BIRIM_DESENI, (c) => HARF_OYUNLARI[c] ?? c)
    // "siiiktir" gibi uzatmaları kısaltır. Yalnız 3+ tekrar sadeleşir; masum
    // Türkçe kelimeler ("dikkat", "anne") en fazla 2 aynı harf yan yana taşır.
    .replace(/(.)\1{2,}/g, '$1');
}

/**
 * Kelimenin BAŞINDA aranan kökler — Türkçe ekleri de yakalar
 * ("orospu" → orospusun, orospular). Buraya eklenecek her kök için tek soru:
 * "Bu harflerle başlayan masum bir Türkçe kelime var mı?" Varsa kök buraya
 * DEĞİL, aşağıdaki TAM_KELIME listesine yazılmalı.
 */
const KOK_BASLANGIC: readonly string[] = [
  'orospu', 'oruspu',
  'amcık', 'amcik', 'amcığ',
  // 'amına' yalnız noktasız 'ı' ile: noktalı "amina" yazımı "Amina" adıyla
  // çakışıyordu, bir insanın adını engellemektense kaçırmayı seçtik.
  // Bitişik yazılan "aminakoyayım" için aşağıdaki BITISIK_KALIPLAR var.
  'amına',
  'siktir', 'sikey', 'siker', 'sikim', 'sikik', 'sikiyim', 'siktim',
  'yarrak', 'yarrağ', 'yarak',
  'piç',
  'pezevenk', 'kahpe', 'yavşak', 'puşt', 'şerefsiz',
  'ibne', 'sürtük', 'kaltak', 'gavat', 'godoş',
  'gerizekal', 'dangalak', 'dallama',
  'götver', 'götlek', 'götoş',
];

/**
 * Yalnız TAM kelime olarak aranan sözler. Baştan arasak masum kelimeleri
 * yutarlardı: göt→götürmek, sikiş→sikişik, sik→sikke.
 */
const TAM_KELIME: ReadonlySet<string> = new Set([
  'göt', 'sik', 'sikiş', 'sikis', 'oç',
  'amk', 'amq', 'aq',
]);

/**
 * Boşluk/işaret koyarak bölünen kalıplar. Mesajın YALNIZ harfleri bitiştirilip
 * burada aranır; böylece "amina koyayım" da "aminakoyim" de yakalanır ama tek
 * başına "Amina" adı serbest kalır.
 */
const BITISIK_KALIPLAR: readonly string[] = [
  'aminakoy', 'amınakoy', 'aminaqoy',
  'ananisik', 'ananısik', 'anasinisik', 'anasınısik', 'avradinisik',
];

/** Normalleştirilmiş metni kelimelere ayırır (harf olmayan her şey ayraçtır). */
const kelimelereAyir = (normal: string): string[] =>
  normal.split(/[^a-zçğıiöşü]+/).filter(Boolean);

/**
 * Metindeki İLK uygunsuz ifadeyi döndürür (normalleştirilmiş hali), yoksa null.
 * Saf fonksiyon — ağ, depolama, yan etki yok; testten doğrudan çağrılabilir.
 */
export function ilkUygunsuzKelime(metin: string): string | null {
  const normal = metniNormalize(metin);

  for (const kelime of kelimelereAyir(normal)) {
    if (TAM_KELIME.has(kelime)) return kelime;
    const kok = KOK_BASLANGIC.find((k) => kelime.startsWith(k));
    if (kok) return kelime;
  }

  const bitisik = kelimelereAyir(normal).join('');
  const kalip = BITISIK_KALIPLAR.find((k) => bitisik.includes(k));
  return kalip ?? null;
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
