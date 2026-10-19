import { expect, openGame, test } from './fixtures';

/** #142：快轉時有魚死掉之類的危機，遊戲自動切回正常速度並跳出提示。 */
test('快轉時出狀況會切回正常速度並提示', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const game = (window as unknown as { cycle: { game: { clock: { timeScale: number }; state: { fish: { health: number }[] }; act: (f: (s: unknown) => void) => void } } }).cycle.game;
    game.clock.timeScale = 3600;
    game.act((s) => {
      const sim = (window as unknown as { cycle: { sim: { addFish: (s: unknown, sp: string, o: object) => { health: number } } } }).cycle.sim;
      sim.addFish(s, 'guppy', { carriesIch: false }).health = -1;
    });
  });
  await expect(page.getByText('已經從快轉切回正常速度')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { cycle: { game: { clock: { timeScale: number } } } }).cycle.game.clock.timeScale)).toBe(7);
});
