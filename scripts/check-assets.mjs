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
  /** dist/assets 的 JS 全部 gzip 後合計上限（首次載入要下載的程式碼） */
  jsGzipMax: 450 * KB,
  /** 主程式（入口 index-*.js）gzip 後上限：開機一定要下載的部分 */
  mainJsGzipMax: 300 * KB,
};

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
    const sizes = js.map((f) => ({ path: f.path, gz: gzipSync(readFileSync(f.path)).length }));
    const gz = sizes.reduce((s, f) => s + f.gz, 0);
    // 入口檔名從 dist/index.html 的 <script type="module" src> 找（其他 chunk 也可能叫 index-*.js）
    const entry = /<script[^>]*type="module"[^>]*src="[^"]*\/(assets\/[^"]+\.js)"/.exec(readFileSync(join('dist', 'index.html'), 'utf8'))?.[1];
    const main = sizes.find((f) => entry && f.path === join('dist', entry));
    if (!main) {
      errors.push('在 dist/index.html 找不到主程式的 <script>');
    } else {
      console.log(`主程式：${main.path} gzip 後 ${Math.round(main.gz / KB)} KB（上限 ${RULES.mainJsGzipMax / KB} KB）`);
      if (main.gz > RULES.mainJsGzipMax) errors.push(`主程式 gzip 後 ${Math.round(main.gz / KB)} KB，超過 ${RULES.mainJsGzipMax / KB} KB 上限`);
    }
    console.log(`程式碼：${js.length} 個 JS，gzip 後合計 ${Math.round(gz / KB)} KB（上限 ${RULES.jsGzipMax / KB} KB）`);
    if (gz > RULES.jsGzipMax) errors.push(`JS gzip 後 ${Math.round(gz / KB)} KB，超過 ${RULES.jsGzipMax / KB} KB 上限`);
  }
}

console.log(`素材預算：${files.length} 個檔案，合計 ${(total / KB / KB).toFixed(1)} MB`);
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log('✓ 全部符合預算');
