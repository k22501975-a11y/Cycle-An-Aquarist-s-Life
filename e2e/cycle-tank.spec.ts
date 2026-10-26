import { expect, openGame, test } from './fixtures';

type Fish = { lengthCm: number; ageDays: number; generation?: number; alive: boolean };
type Tank = { fish: Fish[] };
type Sim = {
  addFish: (s: Tank, species: string, o: object) => Fish;
  buyTank: (tanks: Tank[], id: string) => Tank | null;
  economy: (s: Tank) => { coins: number };
};
type Cycle = { cycle: { sim: Sim; game: { clock: { timeScale: number }; active: number; actAll: (f: (tanks: Tank[]) => void) => void } } };

/** g37 #428：主缸小魚會被吃、第二缸買了還空著沒養水：任務卡叫你先養水，點了直接選怎麼養；空缸倒了菌液菌就夠了，接著叫你搬小魚。 */
test('第二缸還沒養水：任務卡說先養水，點了選硝化菌液，接著叫你搬小魚', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.tutorial.v1', JSON.stringify({ step: 0, skipped: true, seenTips: [] })));
  await openGame(page);
  await page.addStyleTag({ content: '.owner, .owner-tip { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    game.actAll((tanks) => {
      const s = tanks[0];
      sim.addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
      for (let i = 0; i < 3; i++) Object.assign(sim.addFish(s, 'guppy', { carriesIch: false, carries: [] }), { lengthCm: 0.7, ageDays: 2, generation: 1 });
      sim.economy(s).coins = 5000;
      sim.buyTank(tanks, 'nano20');
    });
  });
  const pill = page.locator('.quest-pill', { hasText: '第 2 缸先養水，小魚才搬得過去' });
  await expect(pill).toBeVisible();
  await pill.dispatchEvent('click');
  const option = page.locator('.sheet button', { hasText: '硝化菌液' }).first();
  await expect(option).toBeVisible();
  await expect(page.locator('.sheet', { hasText: '自己等' })).toHaveCount(0);
  await option.click();
  await expect(page.locator('.toast', { hasText: '倒了硝化菌液，新缸的菌夠了' })).toBeVisible();
  await expect(page.locator('.quest-pill', { hasText: '第 2 缸養好水了，把小魚搬過去' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Cycle).cycle.game.active)).toBe(1);
});
