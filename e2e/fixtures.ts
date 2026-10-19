import { test as base, expect, type Page } from '@playwright/test';

/**
 * 共用工具：每個測試都會收集頁面錯誤，測試結束時有未捕捉的錯誤就算失敗。
 * QA 寫新流程時從這裡 import { test, expect }，不要直接用 @playwright/test。
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      expect(errors, '頁面有未捕捉的錯誤').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** 開新遊戲並等到主畫面（水缸畫布與工具列）出現。新遊戲會先跳出開缸面板，用推薦組合開缸。 */
export async function openGame(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect(page.locator('button.tool').first()).toBeVisible();
  // 等遊戲決定要不要開缸：還沒開缸就等開缸面板打開（CI 機器慢時面板會晚幾秒才出現）
  const setup = page.locator('.sheet.open .setup-panel');
  const needsSetup = () =>
    page.evaluate(() => {
      const cycle = (window as unknown as { cycle?: { game: { tanks: unknown[] }; sim: { needsSetup(s: unknown): boolean } } }).cycle;
      return cycle ? cycle.sim.needsSetup(cycle.game.tanks[0]) : null;
    });
  await expect.poll(needsSetup).not.toBeNull();
  if (await needsSetup()) {
    await expect(setup).toBeVisible();
    // 不預選：還沒挑完設備時「開缸」按不下去，按「推薦組合」一次選好
    const confirm = setup.getByRole('button', { name: '開缸', exact: true });
    await expect(confirm).toBeDisabled();
    await setup.getByRole('button', { name: '推薦組合', exact: true }).click();
    await confirm.click();
    await expect(setup).toBeHidden();
    // 開完缸「開缸」任務馬上完成，老闆會跳出對話框：關掉，免得擋住後面的點擊。
    // 直接送 click 事件（慢的 CI 上一幀要好幾秒，真的點擊會等到逾時），跟 flows/helpers.ts 的 dismissGuide 一樣。
    for (let i = 0; i < 20; i++) {
      const btn = page.locator('.owner .owner-actions button:visible:not(.go-shop)', { hasNotText: '跳過教學' }).first();
      if (await btn.count()) await btn.dispatchEvent('click');
      else if (i >= 5) break;
      await page.waitForTimeout(150);
    }
  }
}

/** 讀目前存檔（localStorage 的 cycle.save.v1），方便核對畫面和模擬狀態。 */
export async function readSave(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('cycle.save.v1');
    return raw ? JSON.parse(raw) : null;
  });
}
