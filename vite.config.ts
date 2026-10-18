import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // 模擬好幾週的情境測試在 CI 上跑得比本機慢，5 秒的預設會偶爾逾時
    testTimeout: 20000,
  },
});
