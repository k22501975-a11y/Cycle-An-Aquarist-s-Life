import { expect, openGame, test } from './fixtures';

type Fish = { ich: { stage: string } };
type Cycle = { cycle: { sim: { addFish: (s: unknown, species: string, o: object) => Fish }; game: { clock: { timeScale: number }; act: (f: (s: unknown) => void) => void } } };

/** 體驗第 15 輪 #291：魚身上出現白點，「下一步」先叫你下藥，點了直接打開用藥（不用找 更多 → 設備 → 用藥）。 */
test('有魚生病：下一步說「去下藥」，點了打開用藥面板', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.tutorial.v1', JSON.stringify({ step: 0, skipped: true, seenTips: [] })));
  await openGame(page);
  await page.addStyleTag({ content: '.owner, .owner-tip { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    game.act((s) => {
      sim.addFish(s, 'guppy', { carriesIch: false, sex: 'male', pregnant: false }).ich.stage = 'visible';
    });
  });
  const pill = page.locator('.quest-pill', { hasText: '有魚生病了，去下藥' });
  await expect(pill).toBeVisible();
  await pill.dispatchEvent('click');
  const sheet = page.locator('.sheet.open');
  await expect(sheet.locator('.treat-advice')).toContainText('白點藥');
  await expect(sheet.locator('button.med-btn', { hasText: '白點藥' })).toBeVisible();
});
