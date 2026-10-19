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

/** 開新遊戲並等到主畫面（水缸畫布與工具列）出現。 */
export async function openGame(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect(page.locator('button.tool').first()).toBeVisible();
  await skipSetupShow(page);
}

/** 新遊戲的開缸演出（倒沙、注水、開燈，約 9 秒）直接跳完，再把演完跳出的「你的第一個缸」慶祝卡關掉。讀檔進來的不會演。 */
export async function skipSetupShow(page: Page): Promise<void> {
  type ViewWindow = { cycle?: { view?: { settingUp: boolean; skipSetup(): void } } };
  await page.waitForFunction(() => !!(window as unknown as ViewWindow).cycle?.view, null, { timeout: 30_000 });
  if (!(await page.evaluate(() => (window as unknown as ViewWindow).cycle!.view!.settingUp))) return;
  await page.evaluate(() => (window as unknown as ViewWindow).cycle!.view!.skipSetup());
  await page.waitForFunction(() => !(window as unknown as ViewWindow).cycle!.view!.settingUp, null, { timeout: 30_000 });
  // 卡片在頁面裡直接點掉：用 locator 的話，數到卡片後它剛好自己退場（約 0.4 秒動畫）就會一直等到逾時
  await page.evaluate(() => document.querySelectorAll<HTMLElement>('.celebrate:not(.out)').forEach((c) => c.click()));
  // 卡片關掉後老闆才開口（#171）：等對話框出來，後面關教學的步驟才找得到它
  await page.locator('.owner').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
}

/** 讀目前存檔（localStorage 的 cycle.save.v1），方便核對畫面和模擬狀態。 */
export async function readSave(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('cycle.save.v1');
    return raw ? JSON.parse(raw) : null;
  });
}
