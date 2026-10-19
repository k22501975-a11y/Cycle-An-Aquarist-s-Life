/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 雲端存檔伺服器的網址，例如 https://api.cycle.example.com；沒設定就不開放雲端存檔。 */
  readonly VITE_API_URL?: string;
  /** '1' 時正式打包也把 window.cycle 掛出來（只給遊戲流程測試用）。 */
  readonly VITE_DEBUG_HANDLE?: string;
}

/** 遊戲版本，例如 0.1.0-beta.123（見 docs/release.md）。 */
declare const __APP_VERSION__: string;
