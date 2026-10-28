import { expect, test } from '../fixtures';
import { gameState, NO_WAIT, startClean } from './helpers';

test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

type Sim = {
  addFish: (s: unknown, species: string, o: object) => unknown;
  crowdingRatio: (s: unknown) => number;
  economy: (s: unknown) => { coins: number };
};
type Cycle = { cycle: { sim: Sim; game: { act: (f: (s: unknown) => void) => void } } };

/** polish-to-9.md §10.2（g39）：住不下卡選「再買一缸」，直接打開那組套缸的購買確認，按「買下架好」就多一缸。 */
test('缸太擠：住不下卡選再買一缸，直接打開購買確認，買下就多一缸', async ({ page }) => {
  await startClean(page);
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.act((s) => {
      sim.economy(s).coins = 20_000;
      while (sim.crowdingRatio(s) < 1.1) sim.addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
    });
  });
  await page.locator('button.sleep-btn').click(NO_WAIT);
  const card = page.locator('.morning');
  await expect(card).toBeVisible({ timeout: 15_000 });
  const choice = card.locator('.choice-item', { hasText: '太擠了' });
  await expect(choice).toBeVisible();
  await choice.locator('.morning-decide').dispatchEvent('click');
  await choice.locator('.bc-opt', { hasText: '再買一缸' }).dispatchEvent('click');
  const buy = page.locator('.sheet.open .tank-offer button', { hasText: '買下架好' });
  await expect(buy).toBeVisible();
  await buy.dispatchEvent('click');
  await expect.poll(() => gameState<number>(page, 'g.tanks.length')).toBe(2);
});
