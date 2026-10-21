import { expect, test } from '../fixtures';
import { gameState, NO_WAIT, startClean } from './helpers';

test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

type Cycle = { game: { state: unknown }; sim: { addFish(s: unknown, sp: string, o: object): unknown }; toasts: { quietCount: boolean; unread: number; show(t: string, tone?: string): void } };

/** #257：少按面板。餵到「這一餐夠了」自己收起來；換水點一下就換、長按才開面板；教學期間一般通知不算進鈴鐺。 */
test('餵飽自動收、換水一鍵、教學期間鈴鐺只算要處理的', async ({ page }) => {
  await startClean(page);
  await page.evaluate(() => {
    const c = (window as unknown as { cycle: Cycle }).cycle;
    for (const sex of ['male', 'female']) c.sim.addFish(c.game.state, 'guppy', { sex, carriesIch: false, carries: [] });
  });

  // 餵食：撒三下就夠了，不用按「好了」
  await page.locator('button.tool', { hasText: '餵食' }).click(NO_WAIT);
  const bar = page.locator('.feed-bar');
  await expect(bar).toBeVisible();
  const box = (await page.locator('#stage canvas').boundingBox())!;
  for (let i = 0; i < 3; i++) await page.mouse.click(box.x + box.width * (0.35 + i * 0.05), box.y + box.height * 0.45);
  await expect(bar).toBeHidden({ timeout: 15_000 });

  // 換水：點一下就照建議的量換掉，不開面板
  const before = await gameState<number>(page, 's.lastWaterChangeHours ?? -1');
  const water = page.locator('button.tool', { hasText: '換水' });
  await water.click(NO_WAIT);
  await expect.poll(() => gameState<number>(page, 's.lastWaterChangeHours ?? -1')).not.toBe(before);
  await expect(page.locator('.sheet.open')).toHaveCount(0);
  // 長按才開面板調比例
  const wb = (await water.boundingBox())!;
  await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.locator('.sheet.open .sheet-title')).toHaveText('換水');

  // 教學期間：一般通知進通知匣但不算沒看過；教學後照算
  await page.waitForTimeout(1_700);
  const counts = await page.evaluate(() => {
    const t = (window as unknown as { cycle: Cycle }).cycle.toasts;
    t.quietCount = true;
    const a = t.unread;
    t.show('（測試）仔魚長大了一點');
    const b = t.unread;
    t.quietCount = false;
    t.show('（測試）水草長了一點');
    return [a, b, t.unread];
  });
  expect(counts[1]).toBe(counts[0]);
  expect(counts[2]).toBe(counts[0] + 1);
});
