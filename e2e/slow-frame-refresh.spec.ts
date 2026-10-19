import { expect, openGame, test } from './fixtures';

/**
 * 畫面很卡（每幀超過 100ms）時，「每半秒」更新的卡片與數值（金幣、任務、待辦）也要照現實時間更新。
 * 原本累加 ticker.deltaMS，每幀最多算 100ms，每幀 400ms 時要 4 幀以上（超過 1.6 秒）才更新一次。
 */
test('畫面低於 10 fps 時金幣數字一兩幀內就更新', async ({ page }) => {
  await openGame(page);
  const frames = await page.evaluate(async () => {
    const game = (window as unknown as { cycle: { game: { state: { economy?: { coins: number } } } } }).cycle.game;
    const coins = document.querySelector('.coins b')!;
    let busy = true;
    const jank = () => {
      if (!busy) return;
      const end = performance.now() + 400;
      while (performance.now() < end);
      requestAnimationFrame(jank);
    };
    requestAnimationFrame(jank);
    await new Promise((r) => setTimeout(r, 1200));
    game.state.economy!.coins = 123_456;
    const want = (123_456).toLocaleString('zh-TW');
    let n = 0;
    while (coins.textContent !== want && n < 20) {
      await new Promise((r) => requestAnimationFrame(r));
      n++;
    }
    busy = false;
    return n;
  });
  // 每幀 400ms、每 500ms 更新一次：應該 1～2 幀；改前實測 4 幀
  expect(frames).toBeLessThanOrEqual(2);
});
