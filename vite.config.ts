import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Vite manifest 只給 scripts/check-assets.mjs 用：打包完移到 dist 外面，不要跟著進 APK */
const moveManifest = (): Plugin => ({
  name: 'move-manifest',
  apply: 'build',
  closeBundle() {
    const dir = 'node_modules/.cache/cycle-build';
    mkdirSync(dir, { recursive: true });
    renameSync('dist/.vite/manifest.json', `${dir}/manifest.json`);
    rmSync('dist/.vite', { recursive: true, force: true });
  },
});

export default defineConfig({
  plugins: [moveManifest()],
  define: {
    // 遊戲版本：CI 打包測試版時給 VERSION_NAME（例如 0.1.0-beta.123），本機開發是 0.1.0-dev
    __APP_VERSION__: JSON.stringify(process.env.VERSION_NAME || `${pkg.version}-dev`),
  },
  build: {
    // scripts/check-assets.mjs 用 Vite manifest 算「開機必載」（打包完由 moveManifest 移出 dist）
    manifest: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    globalSetup: ['src/test-global.ts'],
    // 模擬好幾週的情境測試在 CI 上跑得比本機慢，5 秒的預設會偶爾逾時
    testTimeout: 20000,
  },
});
