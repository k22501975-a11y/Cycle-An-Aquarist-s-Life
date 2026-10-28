import { expect, openGame, test } from './fixtures';

type Tank = { purpose?: string; equipment: { light?: { spec: { id: string } } } };
type Cycle = {
  cycle: {
    sim: { buyTank: (tanks: Tank[], id: string) => unknown; setTankPurpose: (t: Tank, p: string) => void; economy: (t: Tank) => { coins: number }; goalState: (tanks: Tank[]) => { done: string[] }; GOALS: Array<{ id: string }> };
    game: { tanks: Tank[]; clock: { timeScale: number }; actAll: (f: (tanks: Tank[]) => void) => void };
  };
};

/** g39c #441：點任務卡「展示缸換上水草燈」買的燈要裝到展示缸，不是主缸。 */
test('任務卡「展示缸換上水草燈」：先切到展示缸，商店寫買給展示缸，買的燈裝在展示缸', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.tutorial.v1', JSON.stringify({ step: 0, skipped: true, seenTips: [] })));
  await openGame(page);
  await page.addStyleTag({ content: '.owner, .owner-tip { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    game.actAll((tanks) => {
      sim.economy(tanks[0]).coins = 99_999;
      sim.buyTank(tanks, 'nano20');
      sim.setTankPurpose(tanks[1], 'display');
      sim.goalState(tanks).done.push(...sim.GOALS.map((g) => g.id).filter((id) => id !== 'display_tank'));
    });
  });
  const pill = page.locator('.quest-pill', { hasText: '展示缸換上水草燈' });
  await expect(pill).toBeVisible();
  await pill.dispatchEvent('click');
  const sheet = page.locator('.sheet.open');
  await expect(sheet.locator('.shop-for')).toContainText('展示缸');
  await sheet.locator('.shop-card', { hasText: '水草燈' }).locator('button', { hasText: '買' }).first().dispatchEvent('click');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Cycle).cycle.game.tanks.map((t) => t.equipment.light?.spec.id ?? null)))
    .toEqual([expect.not.stringMatching(/^planted$/), 'planted']);
});
