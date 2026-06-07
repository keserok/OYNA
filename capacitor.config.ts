import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.oyna.app.kerem',
  appName: 'OYNA',
  webDir: 'dist',
  plugins: {
    SignInWithApple: {
      // clientId must match the App Store Bundle ID set in Apple Developer Console
    },
  },
};

export default config;
