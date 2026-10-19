/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 雲端存檔伺服器的網址，例如 https://api.cycle.example.com；沒設定就不開放雲端存檔。 */
  readonly VITE_API_URL?: string;
  /** 額外打開的 MVP 隱藏功能，逗號分隔（src/features.ts）。 */
  readonly VITE_FEATURES?: string;
}

/** 遊戲版本，例如 0.1.0-beta.123（見 docs/release.md）。 */
declare const __APP_VERSION__: string;
