import { expect, openGame, test } from './fixtures';

/**
 * #144：待辦面板每半秒整個重畫，按鈕一直被換掉，連點時常點不到。
 * 內容沒變的時候不能重畫（按鈕要還是同一個元素）。
 */
test('面板內容沒變時不重畫，按鈕點得到', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    (window as unknown as { cycle: { game: { clock: { timeScale: number } } } }).cycle.game.clock.timeScale = 0;
  });
  await page.locator('button.todo-btn').click();
  const body = page.locator('.sheet.open .sheet-body');
  await expect(body.locator('button').first()).toBeVisible();
  await body.evaluate((el) => ((window as unknown as { firstBtn: Element }).firstBtn = el.querySelector('button')!));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { firstBtn: Element }).firstBtn.isConnected)).toBe(true);
});
