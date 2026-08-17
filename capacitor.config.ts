import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.oyna.app',
  appName: 'OYNA',
  webDir: 'dist',
  // WebView'ın NATIVE zemini: kaydırma lastiklemesi/klavye animasyonu gibi
  // anlarda web içeriğinin altından görünen katman. Ayarlanmazsa BEYAZ kalır
  // ve koyu temada üst/altta beyaz şeritler görünür (MOB-S1).
  backgroundColor: '#0A0E14',

  // ─── Plugins ────────────────────────────────────────────────────
  plugins: {
    SignInWithApple: {
      // clientId must match the App Store Bundle ID set in Apple Developer Console
    },
    SplashScreen: {
      // Açılış görseli artık düz koyu zemin (logo yok) — bekletmeye gerek yok;
      // uygulama içi animasyonlu açılış (SplashScreen.tsx) hemen görünsün.
      launchShowDuration: 400,
      launchAutoHide: true,
      backgroundColor: '#0A0E14',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // iOS tarafı: koyu zeminde AÇIK simgeler.
      style: 'DARK',
      backgroundColor: '#0A0E14',
      overlaysWebView: false,
    },
    // ANDROID 15/16 — durum + gezinme çubukları (Capacitor 8 gömülü eklentisi).
    // `StatusBar` eklentisinin Android yolu hedef sürüm 35'ten itibaren ETKİSİZ:
    // renk atanamaz, `overlaysWebView: false` yok sayılır. Ayar buraya yazılmazsa
    // stil CİHAZIN temasına düşer; açık temadaki bir telefonda simgeler KOYU
    // çizilir ve OYNA'nın koyu zemininde görünmez olur. 'DARK' = açık simgeler.
    // Güvenli alan ölçüleri de bu eklentiden gelir (bkz. index.css :root).
    SystemBars: {
      style: 'DARK',
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_oyna',
      iconColor: '#FACC15',
    },
  },

  // ─── Deep Links ─────────────────────────────────────────────────
  server: {
    androidScheme: 'https',
    // 3D SECURE GEZİNME İZNİ (17 Ağu 2026 — mağaza öncesi denetim).
    // Banka doğrulaması uygulama İÇİNDE bir iframe'de açılır
    // (components/payment/ThreeDSSheet.tsx · srcDoc). Capacitor, izin
    // listesinde OLMAYAN adreslere gitmeyi WebView dışına (sistem tarayıcısı)
    // atabilir; bu olursa kullanıcı ödemenin ortasında uygulamadan düşer ve
    // 3DS sonucu bir daha okunamaz (para bankada çekilmiş olabilir).
    // ZİNCİRİN SON HALKASI BİZİM SUNUCUMUZ: banka doğrulaması bitince iyzico,
    // `iyzico-3ds-callback` uç fonksiyonuna (yani `*.supabase.co` adresine)
    // döner ve sonucu bu sayfa postMessage ile sheet'e bildirir. O adres izin
    // listesinde olmazsa Capacitor son adımı uygulama DIŞINA atar: kullanıcı
    // Chrome'da kalır, sonuç mesajı hiç gelmez (yedek yoklama devreye girene
    // kadar ekran ölü görünür) ve para bankada çekilmiş olabilir.
    //
    // Bankaların kendi ACS adresleri listelenemez (her banka farklı, liste
    // eksik kalır); onlara gidiş form POST'u ile olur ve Android WebView POST
    // isteklerinde bu kapıyı çalıştırmaz — bu yüzden sorun çıkarmazlar.
    // '*' YAZMA: o zaman Google Maps/WhatsApp bağlantıları da uygulama içinde
    // açılır (hepsi window.open/_blank ile bu kapıdan geçiyor).
    //
    // NOT: gerçek cihazda ilk kart provası (LANSMAN_PLANI Faz B-3 · STR-3)
    // İKİ PLATFORMDA da bu akışı doğrulamadan kart günü açılmamalı.
    allowNavigation: [
      '*.supabase.co',
      '*.iyzipay.com',
      '*.iyzico.com',
      'sandbox-api.iyzipay.com',
    ],
  },

  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },

  ios: {
    contentInset: 'automatic',
    scheme: 'OYNA',
  },
};

export default config;
