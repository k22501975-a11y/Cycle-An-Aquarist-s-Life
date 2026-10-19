import { expect, test } from '../fixtures';
import { gameState, NO_WAIT, startClean } from './helpers';

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
