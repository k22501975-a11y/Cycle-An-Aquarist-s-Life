import { expect, test } from './fixtures';

type View = { settingUp: boolean; setupStep: string | null };

/**
 * #371：開場淡出時點到背景，只能用來跳過動畫；polish-to-9.md §8.1 起開場一收就停在空缸上先倒沙，
 * 到「裝上設備」才跳出挑設備面板，點面板背景不會把它關掉。挑完設備後開缸 4 步照樣走得完。
 */
test('開場淡出時連點背景 3 下，開缸照樣從倒沙開始；挑設備面板點背景不會關，4 步走得完', async ({ page }) => {
  test.setTimeout(180_000);
  // ?intro 強制演開場；第一次是完整版，按開始後等它演完
  await page.goto('/?intro');
  const intro = page.locator('#intro');
  await intro.locator('.intro-start').click();
  await page.locator('button.tool').first().waitFor({ state: 'attached', timeout: 60_000 });
  // 開場一開始淡出（.out）就在缸上連點 3 下（在頁面裡判斷加點，確定點的時候開場還在淡出；淡出的開場不擋點擊，會穿到缸上）
  const clicked = await page.waitForFunction(
    () => {
      const el = document.querySelector('#intro');
      if (!el?.classList.contains('out')) return false;
      const canvas = document.querySelector('#stage canvas')!;
      for (let i = 0; i < 3; i++) canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup'));
      return true;
    },
    null,
    { timeout: 60_000, polling: 50 },
  );
  expect(await clicked.jsonValue()).toBe(true);
  await expect(intro).toHaveCount(0, { timeout: 10_000 });
  // 淡出時點的不算倒沙：開場收掉後停在空缸上，提示倒沙；還沒有挑設備面板
  await expect(page.locator('.setup-prompt')).toContainText('點一下，倒入底沙');
  expect(await page.evaluate(() => (window as unknown as { cycle: { view: View } }).cycle.view.setupStep)).toBe('sand');
  const setup = page.locator('.sheet.open .setup-panel');
  await expect(setup).toHaveCount(0);
  // 一直按提示鈕到「裝上設備」：跳出挑設備面板
  await page.waitForFunction(
    () => {
      if (document.querySelector('.sheet.open .setup-panel')) return true;
      document.querySelector('button.setup-go')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup'));
      return false;
    },
    null,
    { timeout: 60_000, polling: 300 },
  );
  expect(await page.evaluate(() => (window as unknown as { cycle: { view: View } }).cycle.view.setupStep)).toBe('gear');
  // 點面板背景不會關
  for (let i = 0; i < 3; i++) await page.mouse.click(60, 200);
  await expect(setup).toBeVisible();
  // 推薦組合排第一個
  await expect(setup.locator('.setup-quick')).toContainText('推薦組合');
  await setup.getByRole('button', { name: '用這組裝上', exact: true }).dispatchEvent('click');
  await expect(setup).toBeHidden();
  // 剩下的：一直按提示鈕（裝設備、開機按一下開始、演出中再按跳到結尾；注水要按住，所以中途不放開），做完才放開
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
