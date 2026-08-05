// ════════════════════════════════════════════════════════════════════════════
// ÖLÇÜM — OLAY KATALOĞU · TEK KAYNAK
// ════════════════════════════════════════════════════════════════════════════
//
// KURUCU KARARI (prensip 1.6): "Ölçüm zorunludur. Huni ve 'başarılı maç'
// metriği olmadan ürün kararı verilmez." Bu dosya o hunilerin tanımıdır.
//
// ── NEDEN TEK DOSYA ────────────────────────────────────────────────────────
// Olay adları üç ayrı yerde geçiyor: uygulama (olayı yazan satır), veritabanı
// (kabul edilen adlar listesi) ve yönetim paneli (huniyi çizen ekran). Üçü
// ayrı ayrı yazılsaydı, birinde yapılan bir yazım hatası SESSİZCE bir adımı
// sıfırlardı — huni "kimse ödemeye gelmiyor" derdi, oysa sadece adı yanlıştı.
// Bu yüzden:
//   • Uygulama ve panel bu dosyadan okur.
//   • Veritabanındaki liste bu dosyayla EŞLEŞMEK ZORUNDA; birim testi
//     (tests/unit/olcumKatalogu.test.ts) migration dosyasını okuyup karşılaştırır.
//
// ── HUNİ NEDİR ─────────────────────────────────────────────────────────────
// Sıralı adımlar. Her adımda KAÇ KİŞİ kaldığını sayarız; iki adım arasındaki
// düşüş "kullanıcıyı burada kaybediyoruz" demektir. Bir kullanıcı bir adımı
// birden çok kez yapsa da TEK sayılır (kişi sayısı, tık sayısı değil).
//
// ── OLAY ADI KURALI ────────────────────────────────────────────────────────
// `<huni>_<ne oldu>` · küçük harf · Türkçe · alt çizgi. Bir olay yayına
// girdikten sonra ADI DEĞİŞTİRİLMEZ — değişirse geçmiş veriyle bağı kopar.
// Yeni adım gerekiyorsa listeye EKLENİR (araya da girebilir; sıra buradaki
// dizilime göre çizilir).
// ════════════════════════════════════════════════════════════════════════════

export interface HuniAdimi {
  /** Veritabanına yazılan ad. Yayına girdikten sonra DEĞİŞMEZ. */
  olay: string;
  /** Panelde görünen sade açıklama. */
  ad: string;
}

export interface Huni {
  /** Panelde görünen başlık. */
  baslik: string;
  /** Bu huninin ne sorduğunu tek cümlede anlatır (panel altyazısı). */
  soru: string;
  adimlar: HuniAdimi[];
}

/**
 * DÖRT HUNİ.
 *
 * Sıralama önemlidir: ilk sıradaki ürünün ana vaadidir (prensip 1.1 —
 * "kaptanın para toplama derdini bitirmek"). Panel de bu sırayla çizer.
 */
export const HUNILER = {
  kaptan: {
    baslik: 'Kaptan · maç kurma',
    soru: 'Maç kurmaya başlayan kaptanların kaçı parayı toplayıp maçı yayına sokabiliyor?',
    adimlar: [
      { olay: 'kaptan_ekran_acildi',  ad: 'Maç Kur ekranını açtı' },
      { olay: 'kaptan_saha_secildi',  ad: 'Saha ve saat seçti' },
      { olay: 'kaptan_kapora_ekrani', ad: 'Kapora ekranına geldi' },
      { olay: 'kaptan_kapora_odendi', ad: 'Kaporayı ödedi' },
      { olay: 'kaptan_mac_yayinda',   ad: 'Maç yayına girdi' },
    ],
  },
  oyuncu: {
    baslik: 'Oyuncu · maça katılma',
    soru: 'Maç listesini açan oyuncuların kaçı bir maça katılıp ödemesini tamamlıyor?',
    adimlar: [
      { olay: 'oyuncu_liste_acildi',  ad: 'Maç listesini açtı' },
      { olay: 'oyuncu_mac_acildi',    ad: 'Bir maçın detayına girdi' },
      { olay: 'oyuncu_katil_secildi', ad: 'Katıl dedi, yerini seçti' },
      { olay: 'oyuncu_odeme_ekrani',  ad: 'Ödeme ekranına geldi' },
      { olay: 'oyuncu_odedi',         ad: 'Ödemeyi tamamladı' },
    ],
  },
  kiralama: {
    baslik: 'Saha kiralama',
    soru: 'Saha arayanların kaçı rezervasyonu kaporayla kesinleştiriyor?',
    adimlar: [
      { olay: 'kiralama_liste_acildi',   ad: 'Saha listesini açtı' },
      { olay: 'kiralama_tesis_acildi',   ad: 'Bir tesisi açtı' },
      { olay: 'kiralama_saat_secildi',   ad: 'Saat seçti' },
      { olay: 'kiralama_kapora_ekrani',  ad: 'Kapora ekranına geldi' },
      { olay: 'kiralama_kapora_odendi',  ad: 'Kaporayı ödedi' },
    ],
  },
  tesis: {
    baslik: 'Tesis sahibi paneli',
    soru: 'Paneli açan tesis sahipleri gerçekten rezervasyon ve defter işliyor mu?',
    adimlar: [
      { olay: 'tesis_panel_acildi',          ad: 'Paneli açtı' },
      { olay: 'tesis_takvim_acildi',         ad: 'Takvimi açtı' },
      { olay: 'tesis_rezervasyon_basladi',   ad: 'Rezervasyon girmeye başladı' },
      { olay: 'tesis_rezervasyon_kaydedildi', ad: 'Rezervasyonu kaydetti' },
      { olay: 'tesis_defter_islendi',        ad: 'Deftere kayıt işledi' },
    ],
  },
} as const satisfies Record<string, Huni>;

export type HuniAnahtari = keyof typeof HUNILER;

/** Panel ve testler için sabit sıra. */
export const HUNI_SIRASI: HuniAnahtari[] = ['kaptan', 'oyuncu', 'kiralama', 'tesis'];

/** Kabul edilen TÜM olay adları — veritabanındaki listeyle birebir aynı olmalı. */
export const TUM_OLAYLAR: string[] = HUNI_SIRASI.flatMap(
  (k) => HUNILER[k].adimlar.map((a) => a.olay),
);

/** Bir olayın hangi huninin kaçıncı adımı olduğunu söyler (panel çizimi için). */
export const OLAY_YERI: Record<string, { huni: HuniAnahtari; sira: number }> =
  Object.fromEntries(
    HUNI_SIRASI.flatMap((huni) =>
      HUNILER[huni].adimlar.map((a, i) => [a.olay, { huni, sira: i }] as const),
    ),
  );
