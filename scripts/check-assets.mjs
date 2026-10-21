// 素材預算檢查（品質閘門）：規則見 docs/performance-budget.md。
// 用法：node scripts/check-assets.mjs（打包後加 --dist，順便檢查 dist/ 的 JS 大小）
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname, sep } from 'node:path';

const KB = 1024;
const RULES = {
  /** public/art/ 單張圖上限 */
  artFileMax: 300 * KB,
  /** public/ 底下全部檔案合計上限（會打進 APK） */
  publicTotalMax: 15 * 1024 * KB,
  /** public/icons/ 單張上限（App 圖示是 PNG，可以大一點） */
  iconFileMax: 400 * KB,
  /** public/art/ 只收 webp（透明背景、檔案小） */
  artExts: new Set(['.webp']),
  /** 主程式（入口 index-*.js）gzip 後上限 */
  mainJsGzipMax: 300 * KB,
  /** 開機必載：入口、它靜態 import 的 chunk、BOOT_DYNAMIC 列的 chunk，gzip 後合計上限 */
  bootJsGzipMax: 330 * KB,
  /** dist/assets 的 JS 全部 gzip 後合計上限（防膨脹：延後載入的 chunk、Worker 也算） */
  jsGzipMax: 520 * KB,
  /** 開機必載以外的單一 chunk（延後載入的面板、Worker）gzip 後上限：打開時不用等一大包 */
  lazyChunkGzipMax: 60 * KB,
};

/**
 * 寫成 dynamic import、但開機一定會等它（或一開機就在背景載）的模組：不擋入口，卻一樣要下載，
 * 所以算進「開機必載」。新增這種模組時要加進來（docs/performance-budget.md §3）。
 */
const BOOT_DYNAMIC = ['src/render/gl-renderer.ts', 'src/audio/engine.ts'];

/** vite.config.ts 把 Vite manifest 移到 dist 外面，免得打進 APK */
const MANIFEST_PATH = join('node_modules', '.cache', 'cycle-build', 'manifest.json');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    // .DS_Store、.gitkeep 這類隱藏檔不算素材
    if (e.name.startsWith('.')) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [{ path: p, size: statSync(p).size }];
  });
}

const errors = [];
const files = walk('public');
const total = files.reduce((s, f) => s + f.size, 0);
for (const f of files) {
  if (f.path.startsWith(join('public', 'art') + sep)) {
    if (!RULES.artExts.has(extname(f.path))) errors.push(`${f.path}：public/art 只能放 .webp`);
    if (f.size > RULES.artFileMax) errors.push(`${f.path}：${Math.round(f.size / KB)} KB，超過單張 ${RULES.artFileMax / KB} KB 上限`);
  } else if (f.path.startsWith(join('public', 'icons') + sep) && f.size > RULES.iconFileMax) {
    errors.push(`${f.path}：${Math.round(f.size / KB)} KB，超過圖示 ${RULES.iconFileMax / KB} KB 上限`);
  }
}
if (total > RULES.publicTotalMax) {
  errors.push(`public/ 合計 ${(total / KB / KB).toFixed(1)} MB，超過 ${RULES.publicTotalMax / KB / KB} MB 上限`);
}

if (process.argv.includes('--dist')) {
  if (!existsSync('dist/assets')) {
    errors.push('找不到 dist/assets，請先 npm run build');
  } else {
    const js = walk(join('dist', 'assets')).filter((f) => extname(f.path) === '.js');
    const sizes = new Map(js.map((f) => [f.path, gzipSync(readFileSync(f.path)).length]));
    const kb = (n) => Math.round(n / KB);
    const gz = [...sizes.values()].reduce((s, n) => s + n, 0);
    // 入口和它靜態 import 的 chunk 從 Vite manifest 找（vite.config.ts 的 build.manifest）
    const manifestPath = MANIFEST_PATH;
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
    const entryKey = manifest && Object.keys(manifest).find((k) => manifest[k].isEntry && manifest[k].file.endsWith('.js'));
    if (!entryKey) {
      errors.push(`找不到 ${manifestPath} 或裡面沒有入口，請確認 vite.config.ts 有 build.manifest`);
    } else {
      const boot = new Set();
      const visit = (key) => {
        const file = join('dist', manifest[key].file);
        if (boot.has(file)) return;
        boot.add(file);
        for (const dep of manifest[key].imports ?? []) visit(dep);
      };
      visit(entryKey);
      for (const src of BOOT_DYNAMIC) {
        if (manifest[src]) visit(src);
        else errors.push(`Vite manifest 裡找不到 ${src}：改名或刪掉了的話請更新 check-assets.mjs 的 BOOT_DYNAMIC`);
      }
      const main = join('dist', manifest[entryKey].file);
      const mainGz = sizes.get(main) ?? 0;
      const bootGz = [...boot].reduce((s, f) => s + (sizes.get(f) ?? 0), 0);
      console.log(`1. 主程式：${main} gzip 後 ${kb(mainGz)} KB（上限 ${RULES.mainJsGzipMax / KB} KB）`);
      if (mainGz > RULES.mainJsGzipMax) errors.push(`主程式 gzip 後 ${kb(mainGz)} KB，超過 ${RULES.mainJsGzipMax / KB} KB 上限`);
      console.log(`2. 開機必載：${boot.size} 個 JS，gzip 後 ${kb(bootGz)} KB（上限 ${RULES.bootJsGzipMax / KB} KB）`);
      if (bootGz > RULES.bootJsGzipMax) errors.push(`開機必載 gzip 後 ${kb(bootGz)} KB，超過 ${RULES.bootJsGzipMax / KB} KB 上限`);
      console.log(`3. 程式碼合計：${js.length} 個 JS，gzip 後 ${kb(gz)} KB（上限 ${RULES.jsGzipMax / KB} KB）`);
      if (gz > RULES.jsGzipMax) errors.push(`JS 合計 gzip 後 ${kb(gz)} KB，超過 ${RULES.jsGzipMax / KB} KB 上限`);
      const lazy = [...sizes].filter(([f]) => !boot.has(f)).sort((a, b) => b[1] - a[1]);
      const biggest = lazy[0];
      console.log(`4. 延後載入：${lazy.length} 個 JS，最大 ${biggest ? `${biggest[0]} ${kb(biggest[1])} KB` : '無'}（單一上限 ${RULES.lazyChunkGzipMax / KB} KB）`);
      for (const [f, n] of lazy) if (n > RULES.lazyChunkGzipMax) errors.push(`${f}：gzip 後 ${kb(n)} KB，超過延後載入單一 ${RULES.lazyChunkGzipMax / KB} KB 上限`);
    }
  }
}

console.log(`素材預算：${files.length} 個檔案，合計 ${(total / KB / KB).toFixed(1)} MB`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log('✓ 全部符合預算');
