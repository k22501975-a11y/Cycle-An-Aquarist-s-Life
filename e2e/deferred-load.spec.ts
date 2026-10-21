import { expect, openGame, test } from './fixtures';

// 入口變小（docs/performance-budget.md §3）：聲音引擎、訂單板、造景操作列改成延後載入，
// 這裡確認第一次用到時照樣能用。
test('聲音引擎延後載入：第一次點擊就會建立音訊環境', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { audioContexts: number; AudioContext: typeof AudioContext };
    w.audioContexts = 0;
    const Original = w.AudioContext;
    w.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        w.audioContexts++;
      }
    };
  });
  await openGame(page);
  // 直接點畫面中間（左邊的任務卡會擋住水缸邊緣）；任何一次點擊都會解鎖聲音
  const box = (await page.locator('#stage canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => (window as unknown as { audioContexts: number }).audioContexts)).toBe(1);
});

test('訂單板、造景操作列延後載入後照樣打得開', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => (window as unknown as { cycle: { scape: { enter(): void } } }).cycle.scape.enter());
  await expect(page.locator('.scape-bar')).toBeVisible();
  await page.locator('.scape-bar button', { hasText: '完成' }).dispatchEvent('click');
  await expect(page.locator('.scape-bar')).toBeHidden();
  const orders = page.locator('button.tool', { hasText: '訂單' });
  if (await orders.isVisible()) {
    await orders.dispatchEvent('click');
    await expect(page.locator('.sheet.open .sheet-title')).toHaveText('客人的訂單');
  }
});
