import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { closeSheet, startClean, startGame, tool, watchConsoleErrors } from './helpers';

/**
 * 裝置相容性：常見手機、平板、桌機的畫面大小都要排得下。
 * 檢查：沒有橫向捲軸、工具列和狀態列的按鈕都在畫面內而且沒被別的東西蓋住、商店面板放得進畫面。
 * 版面用 CSS 像素算，和像素密度無關；軟體繪圖在高密度下慢三倍，所以只有 Pixel 7 用真的密度（hiDpi），其他都用 1。
 */
const DEVICES = [
  { name: '小手機橫向 iPhone SE', width: 667, height: 375, dpr: 2, mobile: true },
  { name: '手機橫向 Pixel 7', width: 915, height: 412, dpr: 2.6, mobile: true, hiDpi: true },
  { name: '長螢幕手機橫向', width: 932, height: 430, dpr: 3, mobile: true },
  { name: '平板橫向 iPad', width: 1180, height: 820, dpr: 2, mobile: true },
  { name: '筆電', width: 1366, height: 768, dpr: 1, mobile: false },
  { name: '桌機', width: 1920, height: 1080, dpr: 1, mobile: false },
];

async function blockedButtons(page: Page, selector: string): Promise<string[]> {
  return page.$$eval(selector, (els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent)
      .flatMap((el) => {
        const r = el.getBoundingClientRect();
        const label = (el as HTMLElement).innerText.trim() || el.getAttribute('aria-label') || el.className;
        if (r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) return [`${label}（超出畫面）`];
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit && (el === hit || el.contains(hit)) ? [] : [`${label}（被 ${hit?.className || hit?.tagName} 蓋住）`];
      }),
  );
}

for (const d of DEVICES) {
  test.describe(d.name, () => {
    // 版面只看 CSS 尺寸；大螢幕用真實密度時畫布太大，軟體繪圖一幀超過一秒會讓點擊逾時，所以大螢幕用 1 倍
    test.use({ actionTimeout: 60_000, viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.hiDpi ? d.dpr : 1, isMobile: d.mobile, hasTouch: d.mobile });

    test(`${d.width}×${d.height}：主畫面和商店排得下`, async ({ page }) => {
      test.setTimeout(240_000);
      const consoleErrors = watchConsoleErrors(page);
      await startClean(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '不能有橫向捲軸').toBe(true);
      expect(await blockedButtons(page, 'button.tool, header button, .hud button'), '工具列、狀態列按鈕').toEqual([]);

      await tool(page, '商店');
      const sheet = page.locator('.sheet.open');
      const box = (await sheet.boundingBox())!;
      expect(box.width, '商店面板寬度').toBeLessThanOrEqual(d.width + 0.5);
      expect(box.x).toBeGreaterThanOrEqual(-0.5);
      expect(await blockedButtons(page, '.sheet.open .sheet-close, .sheet.open .icon-tab'), '商店分頁和關閉鈕').toEqual([]);
      await closeSheet(page);
      await expect(page.locator('.sheet.open')).toHaveCount(0);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('手機直向', () => {
  test.use({ actionTimeout: 20_000, viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  test('直向拿手機也不會當，會提示轉橫向', async ({ page }) => {
    const consoleErrors = watchConsoleErrors(page);
    // 提示幾秒後會淡出，開遊戲前就開始等
    const hint = page.getByText('把手機轉成橫向').waitFor({ timeout: 60_000 });
    await startGame(page);
    await hint;
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
