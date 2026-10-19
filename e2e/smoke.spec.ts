import { expect, openGame, test } from './fixtures';

// 冒煙測試：確認打包後的遊戲能開起來、主要按鈕都在、打開面板不會出錯。
// 更完整的遊戲流程由 QA 測試角色加在 e2e/flows/。

test('新遊戲能開啟主畫面', async ({ page }) => {
  await openGame(page);
  for (const label of ['餵食', '換水', '測試', '修剪', '商店', '設備', '撈死魚']) {
    await expect(page.locator('button.tool', { hasText: label })).toBeVisible();
  }
});

test('商店面板能打開', async ({ page }) => {
  await openGame(page);
  await page.locator('button.tool', { hasText: '商店' }).evaluate((b: HTMLElement) => b.click());
  const sheet = page.locator('.sheet.open');
  await expect(sheet.locator('.sheet-title')).toHaveText('商店');
  await expect(sheet.locator('.sheet-body')).not.toBeEmpty();
});
