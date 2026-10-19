import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: {
    // 遊戲版本：CI 打包測試版時給 VERSION_NAME（例如 0.1.0-beta.123），本機開發是 0.1.0-dev
    __APP_VERSION__: JSON.stringify(process.env.VERSION_NAME || `${pkg.version}-dev`),
  },
  test: {
    include: ['src/**/*.test.ts'],
    // 模擬好幾週的情境測試在 CI 上跑得比本機慢，5 秒的預設會偶爾逾時
    testTimeout: 20000,
  },
});
