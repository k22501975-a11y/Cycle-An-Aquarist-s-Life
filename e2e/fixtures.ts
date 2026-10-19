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
    // 開缸要多點幾下，軟體繪圖下大約多 20 秒：這個測試多給 30 秒
    test.info().setTimeout(test.info().timeout + 30_000);
    await expect(setup).toBeVisible();
    // 不預選：還沒挑完設備時「開缸」按不下去，按「推薦組合」一次選好
    const confirm = setup.getByRole('button', { name: '開缸', exact: true });
    await expect(confirm).toBeDisabled();
    // 直接送 click 事件：軟體繪圖一幀要好幾秒，真的點擊每下都要等好幾秒（這裡不是在測點擊本身）
    await setup.getByRole('button', { name: '推薦組合', exact: true }).dispatchEvent('click');
    await expect(confirm).toBeEnabled();
    await confirm.dispatchEvent('click');
    await expect(setup).toBeHidden();
    // 挑完設備會演開缸（約 9 秒）：直接跳完
    await skipSetupShow(page);
    // 開完缸「開缸」任務馬上完成，老闆會跳出對話框：關掉，免得擋住後面的點擊。
    // 在頁面裡一次點完：軟體繪圖時每次跟頁面來回要一秒多，一顆一顆點會吃掉大半個測試的時間
    await page.evaluate(async () => {
      for (let i = 0, idle = 0; i < 12 && idle < 4; i++) {
        const btn = Array.from(document.querySelectorAll<HTMLElement>('.owner .owner-actions button:not(.go-shop)')).find((b) => b.offsetParent && b.textContent !== '跳過教學');
        if (btn) {
          btn.click();
          idle = 0;
        } else idle++;
        await new Promise((r) => setTimeout(r, 300));
      }
    });
  }
}

/**
 * 新遊戲的開缸演出（倒沙、注水、開燈，約 9 秒）直接跳完，再把演完跳出的「你的第一個缸」慶祝卡關掉。讀檔進來的不會演。
 * 全部在頁面裡的一個 waitForFunction 做完：CI 的軟體繪圖一幀要好幾秒，每來回一次 Playwright 就要等好幾秒，
 * 原本分五次來回，光開遊戲就吃掉 smoke 測試大半的 60 秒（#163 之後 main 的閘門因此逾時）。
 * 卡片在頁面裡直接點掉：用 locator 的話，數到卡片後它剛好自己退場（約 0.4 秒動畫）就會一直等到逾時。
 */
export async function skipSetupShow(page: Page): Promise<void> {
  type SetupWindow = { cycle?: { view?: { settingUp: boolean; skipSetup(): void } }; sawSetup?: boolean };
  await page.waitForFunction(
    () => {
      const w = window as unknown as SetupWindow;
      const view = w.cycle?.view;
      if (!view) return false;
      if (view.settingUp) {
        w.sawSetup = true;
        view.skipSetup();
        return false;
      }
      if (!w.sawSetup) return true;
      const cards = document.querySelectorAll<HTMLElement>('.celebrate:not(.out)');
      cards.forEach((c) => c.click());
      return cards.length > 0;
    },
    null,
    { timeout: 30_000 },
  );
  // 卡片關掉後老闆才開口（#171）：演過開缸才等對話框出來，後面關教學的步驟才找得到它；讀檔進來的不會有
  if (await page.evaluate(() => !!(window as unknown as SetupWindow).sawSetup)) await page.locator('.owner').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
}

/** 讀目前存檔（localStorage 的 cycle.save.v1），方便核對畫面和模擬狀態。 */
export async function readSave(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('cycle.save.v1');
    return raw ? JSON.parse(raw) : null;
  });
}
