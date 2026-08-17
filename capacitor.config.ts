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
      style: 'DARK',
      backgroundColor: '#0A0E14',
      overlaysWebView: false,
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
    // Buraya ödeme altyapısının alan adları yazılır; bankaların ACS adresleri
    // sağlayıcı üzerinden geldiği için asıl kapı iyzico'dur.
    // NOT: gerçek cihazda ilk kart provası (LANSMAN_PLANI Faz B-3 · STR-3)
    // İKİ PLATFORMDA da bu akışı doğrulamadan kart günü açılmamalı.
    allowNavigation: [
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
