import { supabase } from '../supabaseClient';

// ─── TELEFON BİLDİRİMİ GERÇEKTEN AÇIK MI? ────────────────────────────────────
//
// NEDEN VAR (23 Ağustos 2026): Sunucudaki `push_live_enabled` anahtarı KAPALI.
// `supabase/functions/send-push` bu anahtar kapalıyken her bildirimi
// "simulated" diye günlüğe yazıp ERKEN DÖNÜYOR — yani telefona hiçbir şey
// gitmiyor. Buna rağmen uygulama iki yerde telefon bildirimi VAAT EDİYORDU:
//
//   1. Kullanıcı bir maça katılınca çıkan izin ekranı ("Maçtan 1 saat önce
//      hatırlatma", "Maç iptal olursa anında haber") ve ardından telefonun
//      kendi izin kutusu.
//   2. Ayarlar → Bildirimler'deki Sessiz Saatler ("Bu aralıkta telefonun
//      çalmaz") — bu kural YALNIZ send-push içinde uygulanır, dolayısıyla
//      anahtar kapalıyken hiçbir şey yapmaz.
//
// İkisi de tutulamayan sözdür. Telefon, bildirim iznini ÖMÜRDE BİR KEZ sorar:
// bugün izin isteyip hiçbir bildirim göndermezsek kullanıcının tek şansını
// boşa harcamış oluruz. App Store 2.1 açısından da "çalışmayan özellik"tir.
//
// Bu yüzden vaat, sunucudaki anahtara BAĞLANDI. Anahtar panelden açıldığı gün
// izin ekranı da sessiz saatler de kendiliğinden geri gelir; yeni paket
// derlemek, göndermek ve mağaza incelemesi beklemek gerekmez.
//
// HATA/AĞ YOKSA `false`: kapalı varsayarız. Ters yönde yanılmak (açık sanıp
// izin istemek) kullanıcının tek iznini yakar; bu yönde yanılmanın bedeli
// yalnızca bir sonraki denemeye ertelenmektir.

let sorulanIstek: Promise<boolean> | null = null;
let sonCevap: { deger: boolean; zaman: number } | null = null;

/** Aynı cevabı bu süre boyunca yeniden sormayız (panelden açılınca da fazla bekletmez). */
const TAZELIK_MS = 5 * 60 * 1000;

const sunucudanOku = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('get_config_bool', {
      p_key: 'push_live_enabled',
      p_default: false,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
};

/**
 * Telefona GERÇEK push gidiyor mu? Uygulama-içi bildirimler bu anahtardan
 * bağımsız olarak her hâlükârda çalışır — bu yalnız TELEFON bildirimini sorar.
 */
export const pushCanliMi = async (): Promise<boolean> => {
  const simdi = Date.now();
  if (sonCevap && simdi - sonCevap.zaman < TAZELIK_MS) return sonCevap.deger;
  // Eşzamanlı çağrılar tek istekte buluşsun (ayarlar ekranı + maça katılma).
  if (!sorulanIstek) {
    sorulanIstek = sunucudanOku().then((deger) => {
      sonCevap = { deger, zaman: Date.now() };
      sorulanIstek = null;
      return deger;
    });
  }
  return sorulanIstek;
};

/** Testler için: bellekteki cevabı unut. */
export const pushCanliOnbelleginiSil = (): void => {
  sonCevap = null;
  sorulanIstek = null;
};
