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

test('先停在開始畫面，按「開始」才演開場動畫；演完會自己收掉，點一下可以跳過', async ({ page }) => {
  // 自動化測試平常不演開場（navigator.webdriver），網址加 ?intro 強制演
  await page.goto('/?intro&full');
  const intro = page.locator('#intro');
  await expect(intro).toBeVisible();
  await expect(intro).toHaveClass(/full/);
  // 沒按開始就一直停在開始畫面，遊戲載好了也不會自己收
  const startBtn = intro.locator('.intro-start');
  await expect(startBtn).toBeVisible();
  await page.locator('button.tool').first().waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(800);
  await expect(intro).toHaveClass(/gate/);
  await startBtn.click();
  await expect(intro).not.toHaveClass(/gate/);
  await expect(intro).toHaveCount(0, { timeout: 60_000 });
  // 第二次開是短版，點一下就收（遊戲載好之後）；機器慢的時候點之前可能已經演完在淡出，那就不用點
  await page.goto('/?intro');
  await expect(intro).toHaveClass(/short/);
  await intro.locator('.intro-start').click();
  await intro.click({ force: true, timeout: 5_000 }).catch(() => {});
  await expect(intro).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.setup-panel')).toBeVisible();
});
