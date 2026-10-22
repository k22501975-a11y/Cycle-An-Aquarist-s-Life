import { expect, test } from '../fixtures';
import { gameState, NO_WAIT, startClean } from './helpers';

test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

type Sim = {
  addFish: (s: unknown, species: string, o: object) => { lengthCm: number; ageDays: number; generation?: number; bornHours?: number };
  buyNurseryBox: (s: unknown) => void;
  FISH_SPECIES: Record<string, { birthLengthCm: number }>;
};
type Cycle = { cycle: { sim: Sim; game: { act: (f: (s: { hours: number }) => void) => void } } };

/** 中期選擇點（design/midgame.md C1）：第一窩出生，隔天早上報告出選擇卡；選「撈進育幼盒」，小魚撈進盒子、帶去育幼盒面板。 */
test('第一窩出生：早上報告出 C1 選擇卡，選了撈進育幼盒', async ({ page }) => {
  await startClean(page);
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.act((s) => {
      sim.addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
      sim.addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: false });
      for (let i = 0; i < 4; i++) {
        const f = sim.addFish(s, 'guppy', { carriesIch: false, carries: [], pregnant: false });
        f.lengthCm = sim.FISH_SPECIES.guppy.birthLengthCm;
        f.ageDays = 1;
        f.generation = 1;
        f.bornHours = s.hours - 12;
      }
      sim.buyNurseryBox(s);
    });
  });
  await page.locator('button.sleep-btn').click(NO_WAIT);
  const card = page.locator('.morning');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const choice = card.locator('.choice-item', { hasText: '第一窩小魚出生了' });
  await expect(choice).toBeVisible();
  await expect(choice.locator('.bc-opt')).toHaveCount(2);
  await choice.locator('.bc-opt.rec').dispatchEvent('click');
  await expect(page.locator('.morning')).toHaveCount(0);
  await expect.poll(() => gameState<string | undefined>(page, 's.economy.choices.picked.C1')).toBe('box');
  await expect.poll(() => gameState<number>(page, 's.fish.filter((f) => f.alive && f.generation === 1 && f.nursery).length')).toBeGreaterThan(0);
});
