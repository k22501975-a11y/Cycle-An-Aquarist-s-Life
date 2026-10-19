import { expect, test } from '../fixtures';
import { finishDrip, gameState, setSpeed, sheetButton, startClean, tool } from './helpers';

test.use({ actionTimeout: 20_000 });

/** F5：前幾次買魚一定要玩對水小遊戲；滴到差距收斂再放魚，魚才進缸、才付錢，次數會記下來。 */
test('買魚：先玩對水小遊戲，放魚後魚才進缸', async ({ page }) => {
  test.slow();
  await startClean(page);
  await setSpeed(page, '暫停時間');
  const coins0 = await gameState<number>(page, 's.economy.coins');
  await tool(page, '商店');
  await page.locator('.sheet.open button.icon-tab', { hasText: '魚' }).dispatchEvent('click');
  await sheetButton(page, '一公兩母');
  await expect(page.locator('.drip-game')).toBeVisible();
  // 還沒放魚：沒付錢、缸裡沒魚
  expect(await gameState<number>(page, 's.fish.length')).toBe(0);
  expect(await gameState<number>(page, 's.economy.coins')).toBe(coins0);
  await finishDrip(page);
  expect(await gameState<number>(page, 's.fish.filter((f) => f.alive).length')).toBe(3);
  expect(await gameState<number>(page, 's.economy.coins')).toBeLessThan(coins0);
  expect(await gameState<number>(page, 's.economy.dripsDone')).toBe(1);
});

test('對水小遊戲按「先不買」：不付錢、不放魚，回到商店', async ({ page }) => {
  test.slow();
  await startClean(page);
  await setSpeed(page, '暫停時間');
  const coins0 = await gameState<number>(page, 's.economy.coins');
  await tool(page, '商店');
  await page.locator('.sheet.open button.icon-tab', { hasText: '魚' }).dispatchEvent('click');
  await sheetButton(page, '一公兩母');
  await page.locator('.drip-game button.drip-cancel').dispatchEvent('click');
  await expect(page.locator('.drip-shade')).toHaveCount(0);
  await expect(page.locator('.sheet.open .sheet-title')).toHaveText('商店');
  expect(await gameState<number>(page, 's.fish.length')).toBe(0);
  expect(await gameState<number>(page, 's.economy.coins')).toBe(coins0);
});
