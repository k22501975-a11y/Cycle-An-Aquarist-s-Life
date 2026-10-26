import { expect, openGame, test } from './fixtures';

type Fish = { lengthCm: number; ageDays: number; generation?: number; alive: boolean };
type Tank = { fish: Fish[]; bacteria: { aob: number; nob: number } };
type Sim = {
  addFish: (s: Tank, species: string, o: object) => Fish;
  buyTank: (tanks: Tank[], id: string) => Tank | null;
  bacteriaCapacity: (s: Tank) => number;
  economy: (s: Tank) => { coins: number };
};
type Cycle = { cycle: { sim: Sim; game: { clock: { timeScale: number }; active: number; tanks: Tank[]; actAll: (f: (tanks: Tank[]) => void) => void } } };

/** g36 #425：第二缸養好水了、主缸小魚會被吃：任務卡叫你搬小魚，點一下就搬進新缸、切過去看牠們。 */
test('第二缸養好水：任務卡說把小魚搬過去，點了就搬好', async ({ page }) => {
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
      const t2 = sim.buyTank(tanks, 'nano20')!;
      t2.bacteria.aob = t2.bacteria.nob = sim.bacteriaCapacity(t2);
    });
  });
  const pill = page.locator('.quest-pill', { hasText: '第 2 缸養好水了，把小魚搬過去' });
  await expect(pill).toBeVisible();
  await pill.dispatchEvent('click');
  await expect(page.locator('.toast', { hasText: '3 尾小魚慢慢對水，搬進第 2 缸了' })).toBeVisible();
  const after = await page.evaluate(() => {
    const { game } = (window as unknown as Cycle).cycle;
    return { active: game.active, fry: game.tanks[1].fish.filter((f) => f.alive && f.generation === 1).length };
  });
  expect(after).toEqual({ active: 1, fry: 3 });
});
