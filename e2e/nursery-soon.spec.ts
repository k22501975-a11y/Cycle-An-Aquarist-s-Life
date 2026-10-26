import { expect, openGame, test } from './fixtures';

type Fish = { id: number; ageDays: number; pregnancy: number; nursery?: boolean };
type Tank = { fish: Fish[]; nurseryBox?: boolean };
type Sim = { addFish: (s: Tank, species: string, o: object) => Fish };
type Cycle = { cycle: { sim: Sim; game: { clock: { timeScale: number }; tanks: Tank[]; actAll: (f: (tanks: Tank[]) => void) => void } } };

/** polish-to-9.md §9.1（g38）：育幼盒空著、母魚快生了：任務卡叫你把她放進去，點一下就放好。 */
test('育幼盒空了、母魚快生：任務卡說把她放進去，點了就放進育幼盒', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.tutorial.v1', JSON.stringify({ step: 0, skipped: true, seenTips: [] })));
  await openGame(page);
  await page.addStyleTag({ content: '.owner, .owner-tip { display: none !important; }' });
  const id = await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    let id = 0;
    game.actAll((tanks) => {
      const s = tanks[0];
      s.nurseryBox = true;
      const mom = Object.assign(sim.addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female' }), { ageDays: 120, pregnancy: 0.75 });
      id = mom.id;
    });
    return id;
  });
  const pill = page.locator('.quest-pill', { hasText: /育幼盒空了，把快生的孔雀魚母魚 #\d+ 放進去/ });
  await expect(pill).toBeVisible();
  await pill.dispatchEvent('click');
  await expect.poll(() => page.evaluate((id) => !!(window as unknown as Cycle).cycle.game.tanks[0].fish.find((f) => f.id === id)?.nursery, id)).toBe(true);
  await expect(pill).toHaveCount(0);
});
