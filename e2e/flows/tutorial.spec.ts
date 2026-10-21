import { expect, test } from '../fixtures';
import { aliveCount, closeSheet, dismissGuide, finishDrip, fastForward, gameState, NO_WAIT, questStep, seedRng, setSpeed, sheetButton, startGame, tool, watchConsoleErrors, type CycleWindow } from './helpers';

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

/** 進餵食模式（底下出現餵食列）。 */
async function feedMode(page: Parameters<typeof questStep>[0]): Promise<void> {
  await dismissGuide(page);
  await closeSheet(page);
  await page.locator('button.tool', { hasText: '餵食' }).click(NO_WAIT);
  await expect(page.locator('.feed-bar')).toBeVisible();
}

/** 照基準玩法餵一小撮：餵食模式的「進階」面板裡選份量。 */
async function feedPinch(page: Parameters<typeof questStep>[0]): Promise<void> {
  await feedMode(page);
  await page.locator('.feed-bar button', { hasText: '進階' }).click(NO_WAIT);
  await sheetButton(page, '一小撮');
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
 * 新手任務 1～9：從全新存檔照老闆的引導一路點按鈕玩完。順序是開缸 → 挑魚對水 → 餵食 → 種草 → 測水 → 換水 → 擺石頭 → 取名 → 母魚懷孕
 * （polish-to-9.md G7：第一條魚一開局就進缸）。等養水是教學後的背景目標，教學要在第 4 個遊戲天以前做完（U2）。
 * 回歸：養水曾經因為看硝酸鹽而永遠過不了（#65 修正）。接著照基準玩法（一天一小撮、每天測水）等養水目標完成，魚不會死。
 */
test('新手任務 1～9：照老闆的引導從新存檔玩得完，教學第 4 天前做完，養水目標也過得了', async ({ page }) => {
  test.setTimeout(600_000);
  const consoleErrors = watchConsoleErrors(page);
  const started = Date.now();
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

  // 2 挑魚、對水：商店 → 魚 → 第一個品系「一公兩母」（滴水對水小遊戲）
  await tool(page, '商店');
  await page.locator('.sheet.open button.icon-tab', { hasText: '魚' }).click();
  await sheetButton(page, '一公兩母');
  await finishDrip(page);
  await closeSheet(page);
  expect(await aliveCount(page)).toBe(3);
  await test.info().attach('開新遊戲到第一條魚進缸（毫秒，自動操作）', { body: String(Date.now() - started) });
  await expect.poll(() => questNow(page)).toBe(2);

  // 3 餵食（P5）：按「餵食」進餵食模式，點水面撒飼料
  await feedMode(page);
  const box = (await page.locator('#stage canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.45);
  await expect.poll(() => gameState<number>(page, 's.water.foodMg')).toBeGreaterThan(0);
  await page.locator('.feed-bar button', { hasText: '好了' }).click(NO_WAIT);
  await expect.poll(() => questNow(page)).toBe(3);

  // 4 種水草：商店 → 水草 → 種一株
  await tool(page, '商店');
  await page.locator('.sheet.open button.icon-tab', { hasText: '水草' }).click();
  await sheetButton(page, '種一株');
  // P4：買了先拿在手上，商店收起來、進造景模式，拖到想種的位置
  await expect(page.locator('.scape-bar')).toBeVisible();
  const coach = page.locator('.scape-coach');
  await expect(coach).toBeVisible();
  const plantX = () => gameState<number>(page, '(window.cycle.sim.plantPlacement(s.plants[0])).x');
  const x0 = await plantX();
  // 手指比劃的位置就是剛買的那株（畫面座標要加上缸的位置）
  const at = await page.evaluate(() => {
    const q = (window as unknown as { cycle: { view: { scapeHintPos(): { x: number; y: number } } } }).cycle.view.scapeHintPos();
    const r = document.getElementById('stage')!.getBoundingClientRect();
    return { x: q.x + r.x, y: q.y + r.y };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x - 60, at.y, { steps: 6 });
  await page.mouse.move(at.x - 120, at.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(plantX).not.toBeCloseTo(x0, 2);
  await page.locator('.scape-bar button', { hasText: '完成' }).click(NO_WAIT);
  await expect.poll(() => questNow(page)).toBe(4);

  // 5 測水
  await tool(page, '測試');
  await closeSheet(page);
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

  // 之後照基準玩法（mvp.md §4.6）：每天一小撮、一次，每天測水，測到氨或亞硝才換水
  const log: string[] = [];
  const careOneDay = async (day: number) => {
    await feedPinch(page);
    await fastForward(page, 24);
    await tool(page, '測試');
    await closeSheet(page);
    const r = await gameState<{ ammonia: number; nitrite: number }>(page, 's.lastTest.reading');
    if (r.ammonia > 0 || r.nitrite > 0) {
      await tool(page, '換水');
      await sheetButton(page, '開始換水');
      await closeSheet(page);
    }
    await dismissGuide(page);
    log.push(`第 ${day} 天：任務 ${await questStep(page)}/9，${await gameState<string>(page, DAY_SUMMARY)}`);
    expect(await aliveCount(page), `照教學照顧，魚不該死（第 ${day} 天）\n${log.join('\n')}`).toBeGreaterThanOrEqual(3);
  };

  // 9 等母魚懷孕：店裡的母魚大多已經懷孕，教學要在第 4 個遊戲天以前全部做完（U2）
  let day = 0;
  while ((await questNow(page)) < 9) {
    expect(day, `教學要在第 4 天以前做完\n${log.join('\n')}`).toBeLessThan(4);
    await careOneDay(++day);
  }
  const doneDay = Math.floor((await gameState<number>(page, 's.hours')) / 24);
  expect(doneDay, log.join('\n')).toBeLessThanOrEqual(4);

  // 等養水（目標串的第一個背景目標）：照基準玩法 10 個遊戲天內要過
  const cycledDone = () => gameState<boolean>(page, "!!s.economy.goals?.done.includes('cycled')");
  while (!(await cycledDone())) {
    expect(day, `養水目標 10 個遊戲天內要完成\n${log.join('\n')}`).toBeLessThan(10);
    await careOneDay(++day);
  }
  await test.info().attach('每天的水質紀錄', { body: log.join('\n') });
  await dismissGuide(page);
  expect(await questStep(page), log.join('\n')).toBe(9);
  // 買來的一公兩母一條都沒死（養水期間氨不歸零也撐得住，polish-to-9.md §4）
  expect(await gameState<number>(page, 's.fish.filter((f) => f.alive && !f.generation).length'), log.join('\n')).toBe(3);
  expect(consoleErrors).toEqual([]);
});
