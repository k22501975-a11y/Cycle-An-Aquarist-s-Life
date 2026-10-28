// ESLint 設定（品質閘門的靜態檢查之一）。規則說明見 docs/coding-standards.md。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-sim/**', 'android/**', 'server/**', 'public/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // tsc 已經用 noUnusedLocals 檢查；這裡只允許底線開頭的刻意不用參數
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      // 介面文字常用全形空白排版
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true }],
      // 這幾個一引入就會連帶打包用不到的大段程式（docs/performance-budget.md §3）
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'pixi.js', importNames: ['Assets'], message: '素材圖用 render/painted.ts 的 loadTexture；Assets 會連帶打包點陣字、SVG、影片載入器（約 20 KB gzip）。' },
            { name: 'pixi.js', importNames: ['Application', 'autoDetectRenderer'], message: '用 render/gl-app.ts 的 GlApplication；這兩個會連帶打包 WebGPU、Canvas 渲染器（約 22 KB gzip）。' },
            { name: 'pixi.js', importNames: ['Text', 'BitmapText', 'HTMLText'], message: '文字用 Canvas 畫成貼圖（render/tank-view.ts 試管小字）；Pixi 的文字排版約 8 KB gzip。' },
          ],
        },
      ],
    },
  },
  {
    // 工具腳本在 Node 上跑（ui-icons/render.mjs 有一段在瀏覽器頁面裡執行）
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-console': 'off' },
  },
  {
    // 模擬核心不能碰畫面層或 DOM（tsconfig.sim.json 也會擋 DOM 型別）
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['pixi.js', '**/render/**', '**/ui/**', '**/audio/**'] }],
    },
  },
  {
    files: ['**/*.test.ts', 'e2e/**/*.ts', 'src/simsvc/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
