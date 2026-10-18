import type { CapacitorConfig } from '@capacitor/cli';

/** Android App（Capacitor）：把 vite build 的 dist/ 包進 WebView，橫向全螢幕。 */
const config: CapacitorConfig = {
  appId: 'tw.cycle.aquarist',
  appName: '水族人生',
  webDir: 'dist',
  backgroundColor: '#0b2230',
  android: {
    // 正式版不允許從電腦用 Chrome 偵錯 WebView
    webContentsDebuggingEnabled: false,
  },
};

export default config;
