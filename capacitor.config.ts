import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stackwise.app',
  appName: 'Stackwise',
  webDir: 'dist',
  android: {
    // Keep the WebView out of the system bars; the web layer also uses
    // env(safe-area-inset-*) for notches and edge-to-edge devices.
    backgroundColor: '#0a0e13',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Light status/navigation icons, since Stackwise is always dark.
      style: 'DARK',
    },
  },
};

export default config;
