import { expect, openGame, test } from './fixtures';

type Board = { orders: Array<{ preview?: boolean; kind: string }>; fillCheckedHour?: number; lastChangeHours?: number };
type Tank = { snails?: { snails: unknown[]; pests: Record<string, number>; clutches: unknown[]; appleYoung: number; neriteEggs: number }; economy: { coins: number } };
type Cycle = { cycle: { toasts: { inbox: { text: string }[] }; sim: { orderBoard: (s: Tank) => Board; updateOrders: (s: Tank) => void }; game: { state: Tank; clock: { timeScale: number }; act: (f: (s: Tank) => void) => void } } };

/** 打開訂單板（不常用的工具收在「更多」裡）。 */
async function openOrders(page: import('@playwright/test').Page): Promise<void> {
  const btn = page.locator('button.tool', { hasText: '訂單' });
  if (!(await btn.isVisible())) await page.locator('button.tool-more').dispatchEvent('click');
  await btn.dispatchEvent('click');
  await expect(page.locator('.sheet.open .sheet-title')).toHaveText('客人的訂單');
}

/**
 * 開局訂單板（mvp.md §4.4.5，#290）：還沒有自家繁殖的魚時，第 1 格是起步小單、第 2 格是小孔雀預告、第 3 格空著；
 * 老闆說先接小單。起步單交掉，店家馬上補一張，預告卡還在。
 */
test('開局訂單板：起步單、預告卡、空格；起步單交掉馬上補', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cycle.tutorial.v1', JSON.stringify({ step: 0, skipped: true, seenTips: [] })));
  await openGame(page);
  await page.addStyleTag({ content: '.owner, .owner-tip { display: none !important; }' });
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.clock.timeScale = 0;
    game.act((s) => sim.updateOrders(s));
  });

  await openOrders(page);
  const sheet = page.locator('.sheet.open');
  await expect(sheet.locator('.owner-say')).toContainText('先接螺和插枝的小單');
  await expect(sheet.locator('.order-card.preview')).toHaveCount(1);
  await expect(sheet.locator('.order-card.preview')).toContainText('生小魚之後就能接');
  await expect(sheet.locator('.order-card.preview button')).toHaveCount(0);
  await expect(sheet.locator('.order-slot-empty')).toContainText('生小魚後會有更多客人');
  await expect(sheet.locator('.order-card:not(.preview)')).toHaveCount(1);

  // 缸裡的小螺生夠了：起步螺單交得出來（留 2 隻當種螺）
  await page.evaluate(() => {
    const { sim, game } = (window as unknown as Cycle).cycle;
    game.act((s) => {
      s.snails ??= { snails: [], pests: { ramshorn: 0, bladder: 0, mts: 0 }, clutches: [], appleYoung: 0, neriteEggs: 0 };
      s.snails.pests.ramshorn = 20;
      s.snails.pests.bladder = 20;
      // 換一張照現在缸裡的螺出的起步單
      const board = sim.orderBoard(s);
      board.orders = board.orders.filter((o) => o.preview);
      board.fillCheckedHour = undefined;
      sim.updateOrders(s);
    });
  });
  await page.locator('.sheet.open .sheet-close').dispatchEvent('click');
  await openOrders(page);
  const coins = await page.evaluate(() => (window as unknown as Cycle).cycle.game.state.economy.coins);
  const deliver = sheet.locator('.order-card:not(.preview) button', { hasText: '交貨' });
  await expect(deliver).toHaveCount(1);
  await deliver.dispatchEvent('click');
  // 看通知匣而不是畫面上那一格：剛好同時冒出來、一樣要緊的通知會把它換掉，畫面上就等不到
  const refilled = () => page.evaluate(() => (window as unknown as Cycle).cycle.toasts.inbox.some((n) => n.text.includes('店家馬上補了一張新的單')));
  await expect.poll(refilled).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Cycle).cycle.game.state.economy.coins)).toBeGreaterThan(coins);
  // 重畫後：新的起步單補上了，預告卡還在
  await expect(sheet.locator('.order-card:not(.preview)')).toHaveCount(1);
  await expect(sheet.locator('.order-card.preview')).toHaveCount(1);
});
