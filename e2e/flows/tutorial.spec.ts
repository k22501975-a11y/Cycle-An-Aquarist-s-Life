import { expect, test } from '../fixtures';
import { aliveCount, closeSheet, dismissGuide, finishDrip, fastForward, gameState, questStep, seedRng, setSpeed, sheetButton, startGame, tool, watchConsoleErrors, type CycleWindow } from './helpers';

// 要快轉很多天：用 1 倍密度省 CPU（無頭瀏覽器用軟體繪圖）
test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

/**
 * 任務進度。老闆的對話框開著時任務不會往下走（Guide.update），而情境提示可能在任何時候跳出來，
 * 所以每次看進度前先把對話框點掉；CI 機器慢時，提示常在買完東西、還沒檢查進度前跳出來。
 */
async function questNow(page: Parameters<typeof questStep>[0]): Promise<number> {
  await dismissGuide(page);
  return questStep(page);
}

const DAY_SUMMARY = `JSON.stringify({
  h: Math.round(s.hours),
  alive: s.fish.filter((f) => f.alive).length,
  test: s.lastTest.reading,
  water: { tan: +s.water.tan.toFixed(2), no2: +s.water.no2.toFixed(2), no3: +s.water.no3.toFixed(1) },
  bact: { aob: +s.bacteria.aob.toFixed(2), nob: +s.bacteria.nob.toFixed(2) },
  deaths: s.events.filter((e) => e.type === 'fish_died').map((e) => Math.round(e.hours) + ':' + e.cause),
})`;

/**
 * 新手任務 1～10：從全新存檔照老闆的引導一路點按鈕玩完。
 * 回歸：任務 6 養水曾經因為看硝酸鹽而永遠過不了（#65 修正）。
 * 要玩十幾個遊戲天，比一般流程測試久（約 1～2 分鐘）。
 */
test('新手任務 1～10：照老闆的引導從新存檔玩得完，魚不會死光', async ({ page }) => {
  test.setTimeout(600_000);
  const consoleErrors = watchConsoleErrors(page);
  await startGame(page);
  // 1 開缸：startGame 已經用推薦組合開好缸，老闆說完就換下一個任務
  await expect
    .poll(async () => {
      await dismissGuide(page);
      return questStep(page);
    })
    .toBe(1);
  await setSpeed(page, '暫停時間');
  // 固定種子：店裡的魚不帶病、照顧得當會繁殖（帶病整缸死光的情況見 #122）
  await seedRng(page, 2);

  // 2 種水草：商店 → 水草 → 種一株
  await tool(page, '商店');
  await page.locator('.sheet.open button.icon-tab', { hasText: '水草' }).click();
  await sheetButton(page, '種一株');
  await closeSheet(page);
  await expect.poll(() => questNow(page)).toBe(2);

  // 3 測水
  await tool(page, '測試');
  await closeSheet(page);
  await expect.poll(() => questNow(page)).toBe(3);

  // 4 放魚：商店 → 魚 → 第一個品系「一公兩母」（滴水對水）
  await tool(page, '商店');
  await page.locator('.sheet.open button.icon-tab', { hasText: '魚' }).click();
  await sheetButton(page, '一公兩母');
  await finishDrip(page);
  await closeSheet(page);
  await fastForward(page, 2);
  await expect.poll(() => questNow(page)).toBe(4);
  expect(await aliveCount(page)).toBe(3);

  // 5 餵食
  await tool(page, '餵食');
  await sheetButton(page, '一小撮');
  await expect.poll(() => questNow(page)).toBe(5);

  // 6 換水
  await tool(page, '換水');
  await sheetButton(page, '開始換水');
  await closeSheet(page);
  await fastForward(page, 1);
  await expect.poll(() => questNow(page)).toBe(6);

  // 7 擺石頭、8 幫缸取名（等養水的空檔；造景拖放和改名的畫面另有測試，這裡直接改狀態）
  await page.evaluate(() => {
    const { game, sim } = (window as unknown as CycleWindow).cycle;
    game.act((s) => {
      sim.addHardscape(s, sim.HARDSCAPE.lava);
      s.label = '我的第一缸';
    });
  });
  // 老闆的對話框開著時任務不會往下走：關掉「完成」和下一個任務的說明。
  // 兩個任務各有好幾頁對話，慢的 CI 上一幀要好幾秒，給久一點
  await expect
    .poll(
      async () => {
        await dismissGuide(page);
        return questStep(page);
      },
      { timeout: 90_000 },
    )
    .toBe(8);

  // 9 養水：照老闆說的一天兩餐、每天測水，測到氨或亞硝就換水；14 個遊戲天內要養好
  const log: string[] = [];
  let day = 0;
  while ((await questStep(page)) < 9) {
    day++;
    await fastForward(page, 12);
    await tool(page, '餵食');
    await sheetButton(page, '一餐');
    await fastForward(page, 12);
    await tool(page, '測試');
    await closeSheet(page);
    const r = await gameState<{ ammonia: number; nitrite: number }>(page, 's.lastTest.reading');
    if (r.ammonia >= 0.5 || r.nitrite >= 0.5) {
      await tool(page, '換水');
      await sheetButton(page, '開始換水');
      await closeSheet(page);
    }
    await tool(page, '餵食');
    await sheetButton(page, '一餐');
    const step = await questStep(page);
    log.push(`第 ${day} 天：任務 ${step}/10，${await gameState<string>(page, DAY_SUMMARY)}`);
    expect(await aliveCount(page), `照教學照顧，魚不該死光（第 ${day} 天）\n${log.join('\n')}`).toBeGreaterThan(0);
    expect(day, `養水 14 個遊戲天內要完成\n${log.join('\n')}`).toBeLessThan(14);
  }
  await test.info().attach('每天的水質紀錄', { body: log.join('\n') });

  // 10 等母魚懷孕：繼續照顧（每天直接餵，不再開面板，省時間）。
  // 店裡的母魚常常在養水期間就生了，下一胎看得出懷孕要再等一陣子，最多給 30 天
  for (let wait = 1; (await questStep(page)) < 9; wait++) {
    expect(wait, '養好水後 30 個遊戲天內要看到母魚懷孕').toBeLessThanOrEqual(30);
    await fastForward(page, 24);
    await page.evaluate(() => {
      const { game, sim } = (window as unknown as CycleWindow).cycle;
      game.act((s) => {
        sim.feed(s, s.fish.filter((f) => f.alive).reduce((mg, f) => mg + sim.FISH_SPECIES[f.species].dailyFoodMg, 0));
        if (s.water.tan > 0.3 || s.water.no2 > 0.3 || s.water.no3 > 40) sim.waterChange(s, 0.3);
      });
    });
  }
  await dismissGuide(page);
  expect(await questStep(page), log.join('\n')).toBe(10);
  expect(await aliveCount(page)).toBeGreaterThanOrEqual(3);
  expect(consoleErrors).toEqual([]);
});
