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

type View = { cycle: { view: { fish: Map<number, { swimmer: { x: number; y: number } }>; handleTap: (x: number, y: number) => void }; game: { tanks: Array<{ economy?: { daily?: { seen?: number[] }; dailyEarly?: { fish: number[] } } }>; state: { fish: Array<{ id: number; bellySeen?: boolean }> } } } };

/** polish-to-9.md §12.1：點懷著夢想窩的母魚打開路線卡，也照常算看過肚子、算到每日小事。 */
test('點夢想窩的母魚：打開夢想魚路線卡，也算看過肚子', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.tutorial.v1', JSON.stringify({ step: 0, skipped: true, seenTips: [] })));
  await openGame(page);
  await page.addStyleTag({ content: '.owner, .owner-tip { display: none !important; }' });
  const id = await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    return game.act((s) => {
      const mom = sim.addFish(s, 'guppy', { carriesIch: false, sex: 'female', pregnant: false }) as Fish & { dreamBrood?: boolean };
      mom.ageDays = 120;
      mom.pregnancy = 0.9;
      mom.dreamBrood = true;
      return mom.id;
    });
  });
  // 等她的畫面建好，在她身上點一下（跟手指點到魚走同一條路）
  await page.waitForFunction((id) => (window as unknown as View).cycle.view.fish.has(id), id);
  await page.evaluate((id) => {
    const { view } = (window as unknown as View).cycle;
    const s = view.fish.get(id)!.swimmer;
    view.handleTap(s.x, s.y);
  }, id);
  await expect(page.locator('.sheet.open .sheet-title')).toHaveText('夢想魚');
  const seen = await page.evaluate((id) => {
    const { game } = (window as unknown as View).cycle;
    const e = game.tanks[0].economy;
    return { belly: !!game.state.fish.find((f) => f.id === id)?.bellySeen, daily: [...(e?.daily?.seen ?? []), ...(e?.dailyEarly?.fish ?? [])].includes(id) };
  }, id);
  expect(seen).toEqual({ belly: true, daily: true });
});
