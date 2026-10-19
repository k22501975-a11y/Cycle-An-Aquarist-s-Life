import { expect, openGame, test } from './fixtures';

/**
 * #113：畫面很卡（每幀超過 100ms）時，遊戲時間也要照現實經過的時間跑，不能跟著變慢。
 * 用 requestAnimationFrame 每幀卡 250ms 模擬 4 fps 的手機，倍率 3600（現實 1 秒＝遊戲 1 小時）。
 */
test('畫面低於 10 fps 時遊戲時間不會變慢', async ({ page }) => {
  await openGame(page);
  const { hours, wallMs } = await page.evaluate(async () => {
    const game = (window as unknown as { cycle: { game: { clock: { timeScale: number }; state: { hours: number } } } }).cycle.game;
    let busy = true;
    const jank = () => {
      if (!busy) return;
      const end = performance.now() + 250;
      while (performance.now() < end);
      requestAnimationFrame(jank);
    };
    requestAnimationFrame(jank);
    await new Promise((r) => setTimeout(r, 600));
    game.clock.timeScale = 3600;
    const h0 = game.state.hours;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 3000));
    const result = { hours: game.state.hours - h0, wallMs: performance.now() - t0 };
    busy = false;
    game.clock.timeScale = 7;
    return result;
  });
  // 量測頭尾各差最多一幀（約 250ms），給 25% 的容許誤差
  expect(hours).toBeGreaterThan((wallMs / 3_600_000) * 3600 * 0.75);
});
