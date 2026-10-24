import { expect, test } from './fixtures';

type View = { settingUp: boolean };

/**
 * #371：開場淡出時點到背景，只能用來跳過動畫，不能穿過去把「開缸」面板關掉；點面板背景也不會關掉開缸面板。
 * 淡出期間連點背景 3 下，面板還在，挑完設備後開缸 4 步照樣走得完。
 */
test('開場淡出時連點背景 3 下，開缸面板還在，開缸 4 步走得完', async ({ page }) => {
  test.setTimeout(180_000);
  // ?intro 強制演開場；第一次是完整版，按開始後等它演完
  await page.goto('/?intro');
  const intro = page.locator('#intro');
  await intro.locator('.intro-start').click();
  await page.locator('button.tool').first().waitFor({ state: 'attached', timeout: 60_000 });
  const setup = page.locator('.sheet.open .setup-panel');
  // 開場一開始淡出（.out）就在面板左邊的背景連點 3 下：面板靠右，左邊是背景，淡出中的開場蓋在最上面
  await page.waitForFunction(() => document.querySelector('#intro')?.classList.contains('out'), null, { timeout: 60_000 });
  for (let i = 0; i < 3; i++) await page.mouse.click(60, 200);
  await expect(intro).toHaveCount(0, { timeout: 10_000 });
  await expect(setup).toBeVisible();
  // 開場收掉後點面板背景也一樣不會關
  for (let i = 0; i < 3; i++) await page.mouse.click(60, 200);
  await expect(setup).toBeVisible();
  // 挑設備、開缸
  await setup.getByRole('button', { name: '推薦組合', exact: true }).dispatchEvent('click');
  await setup.getByRole('button', { name: '開缸', exact: true }).dispatchEvent('click');
  await expect(setup).toBeHidden();
  // 開缸 4 步：一直按提示鈕（倒沙、裝設備、開機按一下開始、演出中再按跳到結尾；注水要按住，所以中途不放開），做完才放開
  await page.waitForFunction(
    () => {
      const view = (window as unknown as { cycle: { view: View } }).cycle.view;
      if (!view.settingUp) {
        window.dispatchEvent(new PointerEvent('pointerup'));
        return true;
      }
      document.querySelector('button.setup-go')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return false;
    },
    null,
    { timeout: 60_000, polling: 300 },
  );
  await expect(page.locator('.celebrate')).toHaveCount(1, { timeout: 15_000 });
});
