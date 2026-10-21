// 開場店面的厚塗圖（public/art/intro/shop-*.webp）：先把向量店面分四層截圖，再用 paint.py 加筆觸。
// 用法（在 repo 根目錄，開著 npx vite --port 5179 --host 127.0.0.1，因為櫥窗裡的魚和水草圖從那裡讀）：
//   mkdir -p /tmp/shop && PW_CHROMIUM=<chromium 路徑> node scripts/art/shopfront/render.mjs /tmp/shop
//   python3 scripts/art/shopfront/paint.py /tmp/shop && cp /tmp/shop/shop-*.webp public/art/intro/
import { chromium } from 'playwright';
import { svgShopFront } from './svg.mjs';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.setContent(`<html><body style="margin:0;background:transparent">${svgShopFront()}</body></html>`);
await p.addStyleTag({ content: 'svg{width:1920px;height:1080px;display:block}' });
await p.waitForTimeout(1500);
const pick = (sel) => p.evaluate((sel) => {
  const svg = document.querySelector('svg');
  const kids = [...svg.children].filter((c) => c.tagName !== 'defs');
  const tag = (c) => {
    if (c.classList.contains('intro-door-l')) return 'doorl';
    if (c.classList.contains('intro-door-r')) return 'doorr';
    const t = c.getAttribute('transform') || '';
    if (t.startsWith('translate(570')) return 'front';
    if (c.tagName === 'rect' && c.getAttribute('stroke-width') === '20') return 'front';
    if (c.tagName === 'rect' && c.getAttribute('y') === '880') return 'front';
    if (c.tagName === 'rect' && (c.getAttribute('fill') || '').includes('ishade')) return 'shade';
    return 'back';
  };
  for (const c of kids) c.style.visibility = tag(c) === sel ? 'visible' : 'hidden';
  for (const t of svg.querySelectorAll('text')) t.style.visibility = 'hidden';
}, sel);
for (const l of ['back', 'doorl', 'doorr', 'front']) {
  await pick(l);
  await p.screenshot({ path: `${out}/${l}.png`, omitBackground: l !== 'back' });
}
await b.close();
