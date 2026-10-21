import { expect, test } from '../fixtures';
import { NO_WAIT, startClean, tool } from './helpers';

test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

/** P2／P3：任務卡上方有夢想魚路線，點開是夢想魚卡；商店孔雀魚頁可以配一對先看小魚，預設配方的孫代就是夢想魚。 */
test('夢想魚路線與配一對看看', async ({ page }) => {
  await startClean(page);
  const strip = page.locator('.dream-strip');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('養好缸');
  await strip.click(NO_WAIT);
  await expect(page.locator('.sheet.open .dream-name')).toContainText('白子紅蛇王');
  await expect(page.locator('.sheet.open .dream-steps li')).toHaveCount(3);

  await tool(page, '商店');
  await page.locator('.sheet.open button.icon-tab', { hasText: '魚' }).click();
  const pp = page.locator('.sheet.open .pp');
  await expect(pp).toBeVisible();
  await expect(pp.locator('.pp-row.surprise .pp-kid.dream')).toContainText('白子紅蛇王');
  // 換一尾公魚：預覽跟著變
  await pp.locator('.pp-chooser').nth(1).locator('.pp-chip', { hasText: '藍草尾' }).first().click();
  await expect(pp.locator('.pp-row-head').first()).toContainText('全紅白子 × 藍草尾');
});

/** #256：重開遊戲後夢想魚膠囊一進來就在，不用先做一個動作。 */
test('重開遊戲後夢想魚膠囊馬上看得到', async ({ page }) => {
  await startClean(page);
  await expect(page.locator('.dream-strip')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.reload();
  await expect(page.locator('.dream-strip')).toBeVisible();
});

/** G4：買第二缸後先問這缸拿來做什麼；選了缸就有名字，接著到商店買必買的東西。 */
test('第二缸選用途：繁殖缸或展示缸', async ({ page }) => {
  await startClean(page);
  await page.evaluate(() => (window as unknown as { cycle: { game: { actAll: (f: (t: { economy?: { coins: number } }[]) => void) => void } } }).cycle.game.actAll((t) => (t[0].economy!.coins = 20_000)));
  await page.locator('button.tank-chip').click(NO_WAIT);
  await page.locator('.sheet.open .shop-card', { hasText: '20L' }).first().locator('button', { hasText: '買' }).click(NO_WAIT);
  const panel = page.locator('.sheet.open .purpose-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.purpose-card')).toHaveCount(2);
  await panel.locator('.purpose-card', { hasText: '繁殖缸' }).locator('button').click(NO_WAIT);
  await expect(page.locator('.sheet.open .sheet-title')).toContainText('商店');
  expect(await page.evaluate(() => (window as unknown as { cycle: { game: { state: { purpose?: string; label?: string } } } }).cycle.game.state.purpose)).toBe('breeding');
});
