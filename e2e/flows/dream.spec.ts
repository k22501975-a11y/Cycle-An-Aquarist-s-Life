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
  await pp.locator('.pp-chooser').nth(1).locator('.pp-chip', { hasText: '藍草' }).first().click();
  await expect(pp.locator('.pp-row-head').first()).toContainText('白子全紅 × 藍草');
});
