import { expect, test } from '../fixtures';
import { gameState, NO_WAIT, startClean, waitForCycle } from './helpers';

test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

/** F2：按「過一晚」跳到隔天早上 8 點，醒來有一張早上報告卡，點掉回到主畫面。 */
test('過一晚：跳到隔天早上 8 點，出現早上報告卡', async ({ page }) => {
  await startClean(page);
  const day0 = await gameState<number>(page, 'Math.floor(s.hours / 24)');
  await page.locator('button.sleep-btn').click(NO_WAIT);
  const card = page.locator('.morning');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.morning-title')).toContainText(/早安|半夜/);
  await expect(card.locator('.morning-item').first()).toBeVisible();
  const hours = await gameState<number>(page, 's.hours');
  expect(Math.floor(hours / 24)).toBe(day0 + 1);
  expect(hours % 24).toBeCloseTo(8, 0);
  await card.locator('.morning-start').dispatchEvent('click');
  await expect(page.locator('.night')).toHaveCount(0);
});

test('雲端模式：不能過一晚，會說原因', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.cloud.v1', JSON.stringify({ token: 'qa-token', username: 'qa', revision: 0 })));
  await startClean(page);
  const h0 = await gameState<number>(page, 's.hours');
  await page.locator('button.sleep-btn').click(NO_WAIT);
  await expect(page.locator('.toast').filter({ hasText: '雲端模式' })).toBeVisible();
  await expect(page.locator('.morning')).toHaveCount(0);
  expect(await gameState<number>(page, 's.hours')).toBeLessThan(h0 + 1);
});

type Celebrating = { cycle: { celebration: { show(spec: { art: string; title: string; sub: string }): void; queued: number } } };

/** 夜幕蓋著時跳出的慶祝卡（例如訂單可交貨）先排隊，報告卡關掉後才演，不會被蓋掉看不到。 */
test('過一晚：夜裡的慶祝卡等報告卡關掉才演', async ({ page }) => {
  await startClean(page);
  await page.locator('button.sleep-btn').click(NO_WAIT);
  await expect(page.locator('.night')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as Celebrating).cycle.celebration.show({ art: 'ui/icon-orders.webp', title: '測試慶祝', sub: '夜裡跳的' }));
  const card = page.locator('.morning');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.celebrate')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Celebrating).cycle.celebration.queued)).toBe(1);
  await card.locator('.morning-start').dispatchEvent('click');
  await expect(page.locator('.celebrate').filter({ hasText: '測試慶祝' })).toBeVisible();
});

/** 開缸演出還在演時按「過一晚」：不過夜，提示先演完或跳過（演完的「你的第一個缸」才不會被夜幕蓋掉）。 */
test('開缸演出途中不能過一晚', async ({ page }) => {
  await page.goto('/');
  await waitForCycle(page);
  type ViewWindow = { cycle: { view?: { settingUp: boolean } } };
  await page.waitForFunction(() => !!(window as unknown as ViewWindow).cycle.view, null, { timeout: 30_000 });
  test.skip(!(await page.evaluate(() => (window as unknown as ViewWindow).cycle.view!.settingUp)), '開缸演出已經演完');
  await page.locator('button.sleep-btn').dispatchEvent('click');
  await expect(page.locator('.toast').filter({ hasText: '開缸演完' })).toBeVisible();
  await expect(page.locator('.night')).toHaveCount(0);
});
