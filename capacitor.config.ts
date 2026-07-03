import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.oyna.app',
  appName: 'OYNA',
  webDir: 'dist',

  // ─── Plugins ────────────────────────────────────────────────────
  plugins: {
    SignInWithApple: {
      // clientId must match the App Store Bundle ID set in Apple Developer Console
    },
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
      iconColor: '#FACC15',
    },
  },

  // ─── Deep Links ─────────────────────────────────────────────────
  server: {
    androidScheme: 'https',
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
