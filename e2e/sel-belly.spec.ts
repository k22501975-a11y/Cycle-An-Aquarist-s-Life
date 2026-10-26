import { expect, openGame, test } from './fixtures';

type Fish = { id: number; ageDays: number; pregnancy: number };
type Cycle = { cycle: { sim: { addFish: (s: unknown, species: string, o: object) => Fish }; game: { clock: { timeScale: number }; act: <T>(f: (s: unknown) => T) => T }; select: (id: number | null) => void } };

/** g35（polish-to-9.md §8.2）：任務卡叫你「點她看看肚子」，點了懷孕的母魚，選取卡上看得到懷孕到哪、大約幾天後生。 */
test('點懷孕的母魚：選取卡寫懷孕程度和大約幾天後生', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.tutorial.v1', JSON.stringify({ step: 0, skipped: true, seenTips: [] })));
  await openGame(page);
  await page.addStyleTag({ content: '.owner, .owner-tip { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game, select } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    const id = game.act((s) => {
      const mom = sim.addFish(s, 'guppy', { carriesIch: false, sex: 'female', pregnant: false });
      mom.ageDays = 120;
      mom.pregnancy = 0.9;
      return mom.id;
    });
    select(id);
  });
  await expect(page.locator('.selcard .sel-belly')).toHaveText(/^懷孕：胎斑變大、變黑了，大約 \d+ 天後生$/);
});
