import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.oyna.app',
  appName: 'OYNA',
  webDir: 'dist',

  // ─── Splash Screen ──────────────────────────────────────────────
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
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
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_oyna',
      iconColor: '#F97316',
    },
  },

  // ─── Deep Links ─────────────────────────────────────────────────
  server: {
    // Prod: web asset'ler local'den servis edilir
    // Dev: aşağıdaki url aktif olur (yorum kaldır)
    // url: 'http://192.168.1.x:4000',
    androidScheme: 'https',
  },

  android: {
    // App Links ve Deep Link desteği
    buildOptions: {
      keystorePath: undefined, // Release build'de tanımla
      keystoreAlias: undefined,
    },
  },

  ios: {
    // Universal Links için
    contentInset: 'automatic',
    scheme: 'OYNA',
  },
};

export default config;
