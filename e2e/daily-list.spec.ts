import { expect, openGame, test } from './fixtures';

type Cycle = {
  cycle: {
    sim: { economy: (s: unknown) => { daily?: { tasks: Array<{ id: string; done: boolean }> } } };
    game: { clock: { timeScale: number }; act: (f: (s: { hours: number }) => void) => void; state: unknown };
  };
};

/** #188：左上角的今日小事清單，點「測一次水」直接測水，回來打勾。 */
test('今日小事清單：點了帶去做，做完打勾', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await page.addStyleTag({ content: '.owner { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    game.act((s) => {
      sim.economy(s).daily = { day: Math.floor(s.hours / 24), issuedHours: s.hours, tasks: [{ id: 'test', done: false }], before: { test: s.hours + 0.5 }, marked: [], claimed: false } as never;
    });
  });
  const item = page.locator('.daily-card .daily-item', { hasText: '測一次水' });
  await expect(item).toBeVisible();
  // 出題時間設在一點點之後，避免同一個小時「先做再出題」不算
  await page.evaluate(() => (window as unknown as Cycle).cycle.game.act((s) => (s.hours += 1)));
  await item.dispatchEvent('click');
  await expect(page.locator('.daily-card .daily-item.done', { hasText: '測一次水' })).toBeVisible();
});
