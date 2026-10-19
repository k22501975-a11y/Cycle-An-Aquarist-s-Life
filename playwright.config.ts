import { defineConfig, devices } from '@playwright/test';

/**
 * 遊戲流程測試（品質閘門第 3 關）。測試案例放在 e2e/，由 QA 測試角色撰寫；
 * 寫法與共用工具見 e2e/README.md。
 *
 * 跑的是正式打包後的版本（vite preview），和玩家拿到的一樣。
 * 本機若已有 Chromium，可用 PW_CHROMIUM=/路徑/chrome 指定，不必下載。
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // 主要目標：手機橫向（和評測用的設定一致）
      name: 'phone-landscape',
      use: {
        ...devices['Pixel 7 landscape'],
        viewport: { width: 915, height: 412 },
        launchOptions: {
          executablePath: process.env.PW_CHROMIUM || undefined,
          // 沒有 GPU 的環境要用軟體 WebGL，否則 PixiJS 會黑畫面
          args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
