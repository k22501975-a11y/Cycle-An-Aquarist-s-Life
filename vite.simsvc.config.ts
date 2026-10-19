import { defineConfig } from 'vite';

// 模擬小服務（L2）打包成一個 Node 檔：npm run build:sim → dist-sim/main.js
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'src/simsvc/main.ts',
    outDir: 'dist-sim',
    target: 'node22',
    emptyOutDir: true,
  },
});
