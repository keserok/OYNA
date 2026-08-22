/**
 * NUMARA KAPISI — telefon adımı ZORUNLU DEĞİL, GEREKTİĞİNDE İSTENİR
 *
 * 22 Ağustos 2026 · Apple 5.6 reddinden çıkan karar.
 *
 * ESKİ DAVRANIŞ VE NEDEN ÇÖKTÜ
 * Telefon ana giriş yöntemi olduğu için Google/Apple ile girenden de numara
 * isteniyordu ve bu ekran ATLANAMIYORDU. SMS yalnız +90 numaralara gidiyor;
 * yurt dışındaki bir kullanıcı — mağaza incelemecisi dahil — uygulamayı hiç
 * açamıyordu. Bunu çözmek için incelemeye özel bir paket derlenmişti; Apple
 * o paketi "inceleme sırasında gizlenmiş özellik" sayıp reddetti (5.6).
 *
 * YENİ KURAL
 *   1. Numara adımı girişte ATLANABİLİR. Atlayan kullanıcı uygulamayı
 *      gezebilir, maçları görebilir, profilini kurabilir.
 *   2. Numara, GERÇEKTEN gerektiği anda istenir: para ödenen ya da bir tesise
 *      taahhüt veren iş (ödeme/rezervasyon). Orada gerekçe somuttur — tesis
 *      sahibi ve kaptan maç günü bu numaradan ulaşır — ve kullanıcı ne için
 *      istendiğini görerek verir.
 *   3. Herkes için AYNI: incelemeciye özel kapı, bayrak ya da paket YOK.
 *
 * "Atladım" bilgisi cihazda tutulur; sunucuda karşılığı yok, çünkü bu bir
 * hesap durumu değil "bu kullanıcıyı her açılışta aynı ekrana çarpma"
 * hatırlatması. Onboarding'in "Şimdilik Atla" bayrağıyla aynı desen
 * (views/onboarding/onboardingShared.ts).
 */

const ATLA_ANAHTARI = (uid: string) => `oyna.numara.atlandi.${uid}`;

/** Kullanıcı numara adımını bilerek atladı — açılışta bir daha zorlanmasın. */
export const numarayiAtla = (uid: string): void => {
  try { localStorage.setItem(ATLA_ANAHTARI(uid), '1'); } catch { /* depolama yoksa yoksay */ }
};

export const numaraAtlandiMi = (uid: string): boolean => {
  try { return localStorage.getItem(ATLA_ANAHTARI(uid)) === '1'; } catch { return false; }
};

/**
 * Numara bağlandı — işaret silinir. Kullanıcı ileride numarasını kaldırırsa
 * (hesap değiştirme, numara devri) açılış hatırlatması yeniden çalışsın.
 */
export const numaraAtlamasiniTemizle = (uid: string): void => {
  try { localStorage.removeItem(ATLA_ANAHTARI(uid)); } catch { /* yoksay */ }
};
