import { expect, test } from './fixtures';

// 遊戲只用 WebGL 畫（src/render/gl-app.ts）：裝置開不了 WebGL 時要顯示看得懂的原因，不能停在開場或整片白。
test('開不了 WebGL：顯示原因和重新載入按鈕，不是白畫面', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('/');
  const dialog = page.getByRole('alertdialog', { name: '遊戲開不起來' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('這台裝置畫不出水缸');
  await expect(dialog).toContainText('WebGL');
  await expect(dialog.getByRole('button', { name: '重新載入' })).toBeVisible();
  await expect(page.locator('#intro')).toHaveCount(0, { timeout: 30_000 });
});
