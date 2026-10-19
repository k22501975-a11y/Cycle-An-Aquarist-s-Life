// 把 icons.mjs 的向量圖示畫成 256×256 webp（public/art/ui/）。
// 用法：node scripts/ui-icons/render.mjs [輸出資料夾]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// playwright 不在專案依賴裡，用全域安裝的那份（PLAYWRIGHT_PATH 可以改）
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? 'playwright');
import { ICONS } from './icons.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, '../../public/art/ui');
mkdirSync(out, { recursive: true });
const frame = readFileSync(join(here, 'frame.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
for (const [name, { defs, body }] of Object.entries(ICONS)) {
  const svg = frame.replace('@@DEFS@@', defs).replace('@@BODY@@', body);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  // 先畫 512 再縮成 256：邊緣比較平滑
  const dataUrl = await page.evaluate(async () => {
    const el = document.querySelector('svg');
    const xml = new XMLSerializer().serializeToString(el);
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, 256, 256);
    return c.toDataURL('image/webp', 0.9);
  });
  writeFileSync(join(out, `${name}.webp`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', name);
}
await browser.close();
