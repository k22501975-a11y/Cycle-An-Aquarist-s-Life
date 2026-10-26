import { expect, openGame, test } from './fixtures';

type Fish = { lengthCm: number; ageDays: number; generation?: number; alive: boolean; pregnancy: number };
type Tank = { fish: Fish[] };
type Sim = {
  addFish: (s: Tank, species: string, o: object) => Fish;
  buyTank: (tanks: Tank[], id: string) => Tank | null;
  economy: (s: Tank) => { coins: number };
};
type Cycle = { cycle: { sim: Sim; toasts: { inbox: { text: string }[] }; game: { clock: { timeScale: number }; active: number; actAll: (f: (tanks: Tank[]) => void) => void } } };

/** g37 #428：主缸小魚會被吃、第二缸買了還空著沒養水：任務卡叫你先養水，點了直接選怎麼養；選完說在養水，菌夠了就接著叫你搬小魚。 */
test('第二缸還沒養水：任務卡說先養水，點了選硝化菌液，接著說在養水或叫你搬小魚', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.tutorial.v1', JSON.stringify({ step: 0, skipped: true, seenTips: [] })));
  await openGame(page);
  await page.addStyleTag({ content: '.owner, .owner-tip { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    game.actAll((tanks) => {
      const s = tanks[0];
      sim.addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', pregnant: false });
      for (let i = 0; i < 3; i++) Object.assign(sim.addFish(s, 'guppy', { carriesIch: false, carries: [] }), { lengthCm: 0.7, ageDays: 2, generation: 1, pregnancy: 0 });
      sim.economy(s).coins = 5000;
      sim.buyTank(tanks, 'nano20');
    });
  });
  const pill = page.locator('.quest-pill', { hasText: '第 2 缸先養水，小魚才搬得過去' });
  await expect(pill).toBeVisible();
  await pill.dispatchEvent('click');
  const option = page.locator('.sheet button', { hasText: '硝化菌液' }).first();
  await expect(option).toBeVisible();
  // 遊戲狀態一變面板就重畫（CI 上慢，重畫常常剛好在卡片按鈕補上之後）：重畫完按鈕還是同一顆、按得到
  await page.evaluate(() => (window as unknown as Cycle).cycle.game.actAll(() => undefined));
  await expect(page.locator('.sheet', { hasText: '自己等' })).toHaveCount(0);
  await option.click();
  // 一樣看通知匣：畫面上那一格會被剛好同時冒出來的通知換掉
  const poured = () => page.evaluate(() => (window as unknown as Cycle).cycle.toasts.inbox.some((n) => n.text.includes('倒了硝化菌液')));
  await expect.poll(poured).toBe(true);
  // 空缸倒了菌液：菌夠了就接著叫你搬小魚，還差一點就說在養水（看開局的隨機種子）
  await expect(page.locator('.quest-pill').filter({ hasText: /第 2 缸養好水了，把小魚搬過去|第 2 缸在養水/ })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Cycle).cycle.game.active)).toBe(1);
});
