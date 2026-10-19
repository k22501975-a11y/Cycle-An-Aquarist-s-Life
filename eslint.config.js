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
