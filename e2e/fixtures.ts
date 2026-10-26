import { test as base, expect, type Page } from '@playwright/test';

/**
 * 共用工具：每個測試都會收集頁面錯誤，測試結束時有未捕捉的錯誤就算失敗；頁面裡的「今天」固定在 TEST_DATE。
 * QA 寫新流程時從這裡 import { test, expect }，不要直接用 @playwright/test。
 */
/**
 * 頁面裡的「今天」：室溫照現實日期算（game.ts 的 applySeason），不固定的話 11 月以後流程測試會跟著日曆變紅。
 * 和單元測試（src/test-setup.ts）同一天；要在舊存檔（flows/saves/*.json 的 savedAt 是 10/01）之後，離線補算才有時間可補。
 */
export const TEST_DATE = new Date('2026-10-15T12:00:00+08:00');

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      // 只把時間平移到 TEST_DATE，照樣往前走（量經過多久、離線補算照常）；有帶參數的 new Date(x) 不受影響。
      // 平移量在測試開始時算好：重新整理頁面時間也接著走，不會倒回 TEST_DATE
      await page.addInitScript((offset) => {
        const Real = Date;
        class TestDate extends Real {
          constructor(...args: unknown[]) {
            if (args.length === 0) super(Real.now() + offset);
            else super(...(args as [number]));
          }
          static now(): number {
            return Real.now() + offset;
          }
        }
        window.Date = TestDate as DateConstructor;
      }, TEST_DATE.getTime() - Date.now());
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      expect(errors, '頁面有未捕捉的錯誤').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** 開新遊戲並等到主畫面（水缸畫布與工具列）出現。新遊戲先倒沙，到「裝上設備」才跳出挑設備面板（polish-to-9.md §8.1），用推薦組合裝上。 */
export async function openGame(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect(page.locator('button.tool').first()).toBeVisible();
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
    // 一直按提示鈕：倒沙（按一下開始、再按一下跳到結尾），到「裝上設備」就跳出挑設備面板。在頁面裡一次做完，CI 的軟體繪圖每來回一次要好幾秒
    await page.waitForFunction(
      () => {
        if (document.querySelector('.sheet.open .setup-panel')) return true;
        const go = document.querySelector('button.setup-go');
        go?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        window.dispatchEvent(new PointerEvent('pointerup'));
        return false;
      },
      null,
      { timeout: 30_000, polling: 300 },
    );
    // 推薦組合排第一，一下就裝好（直接送 click 事件：這裡不是在測點擊本身）
    await setup.getByRole('button', { name: '用這組裝上', exact: true }).dispatchEvent('click');
    await expect(setup).toBeHidden();
    // 剩下的開缸步驟（裝設備、注水、開機）：直接跳完
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
 * 新遊戲的開缸 4 步（倒沙、裝設備、注水、開機，要玩家動手）直接跳完，再把演完跳出的「你的第一個缸」慶祝卡關掉。讀檔進來的不會演。
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
  // 卡片關掉後任務卡才出來（#171，P1 之後老闆不再跳對話框，只換任務卡上的提示）；讀檔進來的不會等
  if (await page.evaluate(() => !!(window as unknown as SetupWindow).sawSetup)) await page.locator('.quest-pill.show').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
}

/** 讀目前存檔（localStorage 的 cycle.save.v1），方便核對畫面和模擬狀態。 */
export async function readSave(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('cycle.save.v1');
    return raw ? JSON.parse(raw) : null;
  });
}
