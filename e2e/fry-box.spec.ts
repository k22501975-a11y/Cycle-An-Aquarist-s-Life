import { expect, openGame, test } from './fixtures';

type Sim = {
  addFish: (s: unknown, species: string, o: object) => { lengthCm: number; ageDays: number; generation?: number };
  buyQuarantine: (s: unknown) => void;
  FISH_SPECIES: Record<string, { birthLengthCm: number }>;
};
type Cycle = { cycle: { sim: Sim; game: { clock: { timeScale: number }; act: (f: (s: unknown) => void) => void; state: { fish: unknown[]; quarantine?: { fish: unknown[] } } } } };

/** #144：只有一缸時，仔魚救援的待辦點進去可以把仔魚撈進檢疫盒，不再是死路。 */
test('只有一缸：仔魚可以撈進檢疫盒', async ({ page }) => {
  await openGame(page);
  // 老闆的教學和情境提示會在任意時間跳出來蓋住面板下半部，這個測試不測教學，先藏起來
  await page.addStyleTag({ content: '.owner { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    game.act((s) => {
      sim.addFish(s, 'guppy', { carriesIch: false, sex: 'male', pregnant: false });
      sim.addFish(s, 'guppy', { carriesIch: false, sex: 'female', pregnant: false });
      for (let i = 0; i < 3; i++) {
        const f = sim.addFish(s, 'guppy', { carriesIch: false, pregnant: false });
        f.lengthCm = sim.FISH_SPECIES.guppy.birthLengthCm;
        f.ageDays = 1;
        f.generation = 1;
      }
      sim.buyQuarantine(s);
    });
  });
  // 直接送 click 事件（同 flows/helpers 的作法）：慢的 CI 一幀要好幾秒，真的點擊會等輸入回應等到逾時
  await page.locator('button.bell-btn').dispatchEvent('click');
  await page.locator('.sheet.open button.todo-item.split', { hasText: '成魚會吃小魚' }).dispatchEvent('click');
  await page.locator('.sheet.open button', { hasText: '放進檢疫盒' }).dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => (window as unknown as Cycle).cycle.game.state.quarantine?.fish.length ?? 0)).toBe(3);
});

type NurseryCycle = {
  cycle: {
    sim: { addFish: (s: unknown, species: string, o: object) => { pregnancy: number; nursery?: boolean }; economy: (s: unknown) => { coins: number; nurseryGifted?: boolean } };
    game: { clock: { timeScale: number }; act: (f: (s: unknown) => void) => void; state: { nurseryBox?: boolean; fish: Array<{ nursery?: boolean }> } };
  };
};

/** #187：待辦「母魚快生了」直接附「去買育幼盒 150 元」，按了買盒子並把母魚放進去。 */
test('母魚快生了：待辦一鍵買育幼盒並放進去', async ({ page }) => {
  await openGame(page);
  await page.addStyleTag({ content: '.owner { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as NurseryCycle).cycle;
    game.clock.timeScale = 0;
    game.act((s) => {
      // 老闆已經送過了（這裡測自己買的路）
      sim.economy(s).nurseryGifted = true;
      sim.economy(s).coins = Math.max(sim.economy(s).coins, 500);
      sim.addFish(s, 'guppy', { carriesIch: false, sex: 'male', pregnant: false });
      const mom = sim.addFish(s, 'guppy', { carriesIch: false, sex: 'female', pregnant: false });
      mom.pregnancy = 0.9;
    });
  });
  await page.locator('button.bell-btn').dispatchEvent('click');
  await page.locator('.sheet.open .todo-item.nursery button', { hasText: '去買育幼盒' }).dispatchEvent('click');
  await expect.poll(() => page.evaluate(() => (window as unknown as NurseryCycle).cycle.game.state.nurseryBox ?? false)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as NurseryCycle).cycle.game.state.fish.filter((f) => f.nursery).length)).toBe(1);
});
