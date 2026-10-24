import { expect, openGame, test } from './fixtures';

/** #366：收起來的面板不能再被 Tab、讀屏或自動化碰到；滑出、淡出的動畫照舊。 */
// 商店是全螢幕面板（淡出），測水是靠邊的面板（滑出）：兩種收法都要測
for (const [name, opener] of [
  ['商店', 'button.tool:has-text("商店")'],
  ['測水', 'button.tool:has-text("測試")'],
] as const) {
  test(`${name}面板關掉後，裡面的按鈕看不到、Tab 不會跑進去`, async ({ page }) => {
    await openGame(page);
    await page.addStyleTag({ content: '.owner { display: none !important; }' });
    const sheet = page.locator('.sheet');
    await page.locator(opener).evaluate((b: HTMLElement) => b.click());
    await expect(sheet).toHaveClass(/open/);
    await expect(sheet.locator('.sheet-close')).toBeVisible();
    await sheet.locator('.sheet-close').evaluate((b: HTMLElement) => b.click());
    await expect(sheet).not.toHaveClass(/open/);
    // 收起來的面板：整塊不可互動，動畫跑完後裡面的按鈕都看不到
    expect(await sheet.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    await expect(sheet.locator('button:visible')).toHaveCount(0);
    // Tab 走一圈也不會停在面板裡
    const landed = await page.evaluate(() => {
      const panel = document.querySelector('.sheet')!;
      const all = Array.from(document.querySelectorAll<HTMLElement>('button, [tabindex], a[href], input, select'));
      return all.some((el) => {
        el.focus();
        return panel.contains(document.activeElement);
      });
    });
    expect(landed).toBe(false);
  });
}
