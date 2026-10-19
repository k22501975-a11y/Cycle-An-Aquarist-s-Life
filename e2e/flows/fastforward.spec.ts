import { expect, test } from '../fixtures';
import { aliveCount, closeSheet, expectNoCrash, finishDrip, fastForward, gameState, seedRng, setSpeed, sheetButton, startGame, tool, watchConsoleErrors, type CycleWindow } from './helpers';

// 長時間快轉只看會不會當，用 1 倍密度省 CPU（無頭瀏覽器用軟體繪圖）
test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

/**
 * 回歸：#62 修過「懷孕、長大換外觀時當掉」（_gpuData 被銷毀後又被畫）。
 * 一公兩母快轉三週以上：會懷孕、生小魚、小魚長大換外觀，全程不能有錯誤或當機畫面。
 */
test('一公兩母快轉 3 週以上：生小魚、長大，畫面不當機', async ({ page }) => {
  test.setTimeout(480_000);
  const consoleErrors = watchConsoleErrors(page);
  await startGame(page);
  await page.locator('.owner button.btn.small', { hasText: '跳過教學' }).click();
  await setSpeed(page, '暫停時間');
  await seedRng(page, 2);
  await tool(page, '商店');
  await page.locator('.sheet.open button.icon-tab', { hasText: '魚' }).click();
  await sheetButton(page, '一公兩母');
  await finishDrip(page);
  await closeSheet(page);

  for (let day = 1; day <= 24; day++) {
    await fastForward(page, 24);
    // 每天照顧一下（直接呼叫模擬，省下開面板的時間；這個測試只管畫面撐不撐得住）
    await page.evaluate(() => {
      const { game, sim } = (window as unknown as CycleWindow).cycle;
      game.act((s) => {
        // 一天的份量（和遊戲裡「一餐」×2 一樣用每種魚的食量算）
        sim.feed(s, s.fish.filter((f) => f.alive).reduce((mg, f) => mg + sim.FISH_SPECIES[f.species].dailyFoodMg, 0));
        if (s.water.tan > 0.3 || s.water.no2 > 0.3 || s.water.no3 > 40) sim.waterChange(s, 0.3);
      });
    });
    await expectNoCrash(page);
  }
  expect(await gameState<number>(page, 's.events.filter((e) => e.type === "fry_born").length'), '三週內應該生過小魚').toBeGreaterThan(0);
  expect(await aliveCount(page)).toBeGreaterThan(3);

  // 回到正常速度後時間照常走（×7：現實 12 秒＝遊戲 84 秒，至少一個 tick）
  await setSpeed(page, '正常速度');
  const h0 = await gameState<number>(page, 's.hours');
  await page.waitForTimeout(12_000);
  expect(await gameState<number>(page, 's.hours')).toBeGreaterThan(h0);
  await expectNoCrash(page);
  expect(consoleErrors).toEqual([]);
});
