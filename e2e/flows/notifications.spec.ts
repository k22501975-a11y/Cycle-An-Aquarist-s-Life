import { expect, test } from '../fixtures';
import { startClean } from './helpers';

test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

type Toasts = { show: (text: string, tone?: 'bad' | 'warn' | 'info') => void };
const show = (page: import('@playwright/test').Page, list: Array<[string, ('bad' | 'warn' | 'info')?]>) =>
  page.evaluate((items) => {
    const toasts = (window as unknown as { cycle: { toasts: Toasts } }).cycle.toasts;
    for (const [text, tone] of items) toasts.show(text, tone);
  }, list);

/** YenWel：「通知太亂文字一直跳出來」：自己發生的事只在鈴鐺加數字，畫面上同時最多一則，同樣的合成 ×N。 */
test('通知：沒按東西時只進鈴鐺，壞消息一次只跳一則並合併', async ({ page }) => {
  await startClean(page);
  // 讓「剛按過東西」的時間過去
  await page.waitForTimeout(1_700);
  const before = await page.locator('.bell-btn .badge').textContent();
  await show(page, [['（測試）仔魚長大了一點'], ['（測試）仔魚長大了一點'], ['（測試）畫質調成省電']]);
  await expect(page.locator('.toast').filter({ hasText: '（測試）' })).toHaveCount(0);
  await expect(page.locator('.bell-btn .badge')).toHaveText(String(Number(before || 0) + 3));

  await show(page, [['（測試）加熱棒壞了', 'bad'], ['（測試）有魚死了', 'bad'], ['（測試）有魚死了', 'bad']]);
  await expect(page.locator('.toast')).toHaveCount(1);
  await expect(page.locator('.toast')).toContainText('（測試）有魚死了×2');

  await page.locator('.bell-btn').click();
  await expect(page.locator('.sheet.open .inbox-row').filter({ hasText: '仔魚長大了一點 ×2' })).toBeVisible();
  await expect(page.locator('.bell-btn .badge')).toHaveText('');
});
