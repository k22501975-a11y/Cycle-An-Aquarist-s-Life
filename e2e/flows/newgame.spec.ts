import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { gameState, startClean, startGame, watchConsoleErrors, type CycleWindow } from './helpers';

test('新遊戲：錢 2,000、任務 1/7、速度 ×7，畫面有畫出東西，沒有 console 錯誤', async ({ page }) => {
  const consoleErrors = watchConsoleErrors(page);
  await startGame(page);
  await expect(page.locator('button.speed-btn')).toHaveText(/×7/);
  await expect(page.locator('button.coins')).toHaveText(/2,000/);
  await expect(page.locator('.quest-pill')).toContainText('任務 1/7');
  // PNG 壓縮後太小代表畫布幾乎是單色（黑畫面）
  expect((await page.locator('#stage canvas').screenshot()).byteLength).toBeGreaterThan(20_000);
  expect(consoleErrors).toEqual([]);
});

/** 回歸：新缸曾經沒有底沙，缸底只有一條線（#65 改成沒記底材就畫石英砂）。 */
test('新缸有底沙：缸底畫得出沙子，拆掉底沙後畫面會變', async ({ page }) => {
  await startClean(page);
  // 新缸不記底材（undefined）＝石英砂；null 才是拆掉的裸缸
  expect(await gameState<string>(page, 's.equipment.substrate === null ? "bare" : (s.equipment.substrate?.spec.id ?? "sand")')).toBe('sand');
  const box = (await page.locator('#stage canvas').boundingBox())!;
  // 左下角、工具列左邊、缸名字下面那塊：新缸看得到沙面
  const clip = { x: box.x + box.width * 0.02, y: box.y + box.height * 0.82, width: box.width * 0.24, height: box.height * 0.08 };
  const withSand = await page.screenshot({ clip });
  await page.evaluate(() => {
    const g = (window as unknown as CycleWindow).cycle.game;
    g.act((s) => ((s as unknown as { equipment: { substrate: null } }).equipment.substrate = null));
  });
  await page.waitForTimeout(1_000);
  const bare = await page.screenshot({ clip });
  await test.info().attach('缸底-有沙', { body: withSand, contentType: 'image/png' });
  await test.info().attach('缸底-裸缸', { body: bare, contentType: 'image/png' });
  // 沙子是淺色的，裸缸缸底是暗的水色
  const sandLuma = await meanLuma(page, withSand);
  const bareLuma = await meanLuma(page, bare);
  expect(sandLuma - bareLuma, `缸底亮度：有沙 ${sandLuma.toFixed(0)}、裸缸 ${bareLuma.toFixed(0)}`).toBeGreaterThan(15);
});

/** 截圖的平均亮度（0～255），在頁面裡解 PNG 算。 */
async function meanLuma(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return sum / (d.length / 4);
  }, png.toString('base64'));
}
