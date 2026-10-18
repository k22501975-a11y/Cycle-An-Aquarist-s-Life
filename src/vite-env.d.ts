/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 雲端存檔伺服器的網址，例如 https://api.cycle.example.com；沒設定就不開放雲端存檔。 */
  readonly VITE_API_URL?: string;
}
