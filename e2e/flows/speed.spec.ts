import { expect, test } from '../fixtures';
import { gameState, NO_WAIT, startClean, startGame } from './helpers';

// 軟體繪圖在高像素密度下慢三倍，這裡不測畫質，用 1 讓 CI 慢的時候也跑得完
test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

const CLOUD_SESSION = JSON.stringify({ token: 'qa-token', username: 'qa', revision: 0 });

test('單機模式：速度選單有暫停、正常和四段快轉；暫停後時間不動', async ({ page }) => {
  await startClean(page);
  await page.locator('button.speed-btn').click(NO_WAIT);
  await expect(page.locator('button.speed-opt')).toHaveCount(6);
  await page.locator('button.speed-opt', { hasText: '暫停時間' }).click(NO_WAIT);
  await expect(page.locator('button.speed-btn')).toHaveText(/暫停/);
  const h0 = await gameState<number>(page, 's.hours');
  await page.waitForTimeout(2_000);
  expect(await gameState<number>(page, 's.hours')).toBe(h0);
});

/** 雲端模式時間由伺服器統一（L2）：只能暫停或 ×7。 */
test('雲端模式：速度選單只有暫停和正常速度', async ({ page }) => {
  await page.addInitScript((session) => localStorage.setItem('cycle.cloud.v1', session), CLOUD_SESSION);
  await startClean(page);
  await page.locator('button.speed-btn').click(NO_WAIT);
  const opts = page.locator('button.speed-opt');
  await expect(opts).toHaveCount(2);
  await expect(opts.nth(0)).toContainText('暫停');
  await expect(opts.nth(1)).toContainText('正常速度');
  await expect(page.locator('.speed-note')).toContainText('不能加快');
});

/** 邊界：登入前開著快轉（存檔記著 6時/秒），登入雲端後不能還在快轉。 */
test('雲端模式：存檔裡記著的快轉速度不會帶進雲端模式', async ({ page }) => {
  test.fail(true, '已知問題 #112：雲端模式沒有限制存檔裡的時間倍率；修好後拿掉這行');
  await page.addInitScript((session) => localStorage.setItem('cycle.cloud.v1', session), CLOUD_SESSION);
  await startGame(page);
  await page.evaluate(() => {
    (window as unknown as { cycle: { game: { clock: { timeScale: number } } } }).cycle.game.clock.timeScale = 21600;
    window.dispatchEvent(new Event('pagehide'));
  });
  await startGame(page);
  expect(await gameState<number>(page, 'g.clock.timeScale'), '雲端模式的時間倍率最多 ×7').toBeLessThanOrEqual(7);
});
