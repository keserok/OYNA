import { Capacitor } from '@capacitor/core';
import { useAppStore } from '../store';
import { pushCanliMi } from './pushCanliMi';

// ─── D2 — Bildirim iznini DOĞRU ANDA iste ────────────────────────────────────
//
// SORUN (canlıda ölçüldü): İzin, kullanıcı giriş yapar yapmaz isteniyordu.
// Kişi henüz uygulamada hiçbir şey yapmamış, neden izin vereceğini bilmiyor.
// Sonuç: 35 profil, izin veren SIFIR kişi.
//
// Telefon bu izni ömürde BİR KEZ sorar. "Hayır" diyen kullanıcı, ayarlardan
// elle açmadıkça bir daha hiç bildirim alamaz. Yani ilk soruş tek şansımızdır.
//
// YENİ KURAL: İzin, kullanıcı bir maça KATILDIKTAN sonra — yani bildirimin
// ne işine yarayacağını gördüğü anda — ve önce tek cümlelik bir açıklama
// ekranıyla istenir.

const SORULDU_ANAHTARI = 'oyna_push_izni_soruldu';

/** Bu cihazda daha önce sorduk mu? (Kullanıcıyı tekrar tekrar rahatsız etme.) */
export const dahaOnceSorulduMu = (): boolean => {
  try {
    return localStorage.getItem(SORULDU_ANAHTARI) === '1';
  } catch {
    return false; // localStorage yoksa engelleme
  }
};

export const sorulduIsaretle = (): void => {
  try {
    localStorage.setItem(SORULDU_ANAHTARI, '1');
  } catch {
    /* özel sekme vb. — kaydedemezsek sorun değil */
  }
};

/**
 * "Doğru an geldi" tetiği. Maça katılma başarılı olduğunda çağrılır.
 * Kendi kendine karar verir: uygun değilse SESSİZCE hiçbir şey yapmaz.
 *
 * Ekranı açmaz — yalnızca store'daki bayrağı kaldırır; açıklama ekranını
 * App.tsx gösterir. Böylece bu modül React'e bağımlı kalmaz.
 */
export const pushIzniZamaniGeldi = async (): Promise<void> => {
  try {
    if (!Capacitor.isNativePlatform()) return;   // web'de Capacitor push yok
    if (dahaOnceSorulduMu()) return;             // bir kez sorduk, yeter

    // TUTAMAYACAĞIMIZ SÖZÜ VERME (23 Ağustos 2026). Sunucudaki
    // `push_live_enabled` kapalıyken send-push her bildirimi "simulated"
    // sayıp erken dönüyor: telefona hiçbir şey gitmiyor. Bu ekran ise
    // "maçtan 1 saat önce hatırlatırız" diyor ve ardından telefonun izin
    // kutusunu açıyor. Telefon o kutuyu ÖMÜRDE BİR KEZ gösterir — bugün
    // sorup hiçbir bildirim göndermezsek kullanıcının tek şansı yanar.
    // Anahtar panelden açıldığı gün bu kapı kendiliğinden açılır.
    if (!(await pushCanliMi())) return;

    const { PushNotifications } = await import('@capacitor/push-notifications');
    const izin = await PushNotifications.checkPermissions();
    // Yalnız HENÜZ SORULMAMIŞSA. 'granted' ise zaten var, 'denied' ise
    // sistem bir daha sormaz — ikisinde de ekran açmanın anlamı yok.
    if (izin.receive !== 'prompt' && izin.receive !== 'prompt-with-rationale') return;

    useAppStore.getState().setPushIzniSorulsun(true);
  } catch {
    /* eklenti yoksa / hata varsa sessiz geç — akışı asla bölme */
  }
};
