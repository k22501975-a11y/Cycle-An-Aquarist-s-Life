import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '../fixtures';
import { expectNoCrash, fastForward, gameState, waitForCycle, watchConsoleErrors } from './helpers';

// 讀檔後要快轉兩天：用 1 倍密度省 CPU
test.use({ deviceScaleFactor: 1, actionTimeout: 20_000 });

/**
 * 舊存檔升級：saves/ 裡是用舊版程式實際產生的存檔（檔名是當時的版本和 PR），
 * 每份都要能讀進目前的版本、補算離線時間、繼續玩、再存回去。
 * 新增存檔欄位或改 SAVE_VERSION 時，這裡會抓到舊玩家的存檔壞掉。
 * v1-synthetic 是把 v2 存檔的版本號改成 1（v1→v2 只差欄位），確認整條升級鏈走得通。
 */
const SAVES = join(import.meta.dirname, 'saves');

/** 第一次載入時放進存檔（reload 時要讀遊戲自己存的）。 */
async function seed(page: import('@playwright/test').Page, items: Record<string, string>): Promise<void> {
  await page.addInitScript((kv) => {
    if (sessionStorage.getItem('qa.seeded')) return;
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
    sessionStorage.setItem('qa.seeded', '1');
  }, items);
}

for (const name of readdirSync(SAVES).filter((f) => f.endsWith('.json'))) {
  test(`舊存檔 ${name.replace('.json', '')}：讀得進來、能繼續玩、存回新版本`, async ({ page }) => {
    const consoleErrors = watchConsoleErrors(page);
    const raw = readFileSync(join(SAVES, name), 'utf8');
    const old = JSON.parse(raw) as { state: { fish: unknown[]; hours: number } };
    await seed(page, { 'cycle.save.v1': raw, 'cycle.tutorial.v1': JSON.stringify({ step: 7, skipped: false, seenTips: [] }) });
    await page.goto('/');
    await waitForCycle(page);
    await expectNoCrash(page);

    // 沒有被當成壞檔；魚的紀錄都在（離線補算可能有魚死掉，但不會消失）；時間有補算
    expect(await page.evaluate(() => localStorage.getItem('cycle.save.corrupt'))).toBeNull();
    expect(await gameState<number>(page, 's.fish.length')).toBeGreaterThanOrEqual(old.state.fish.length);
    expect(await gameState<number>(page, 's.hours')).toBeGreaterThan(old.state.hours);

    // 繼續玩兩天，畫面照常
    await fastForward(page, 48);
    await expectNoCrash(page);

    // 存回去是目前的版本，重開後讀得回同一缸
    const hours = await gameState<number>(page, 's.hours');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('cycle.save.v1')))!) as { version: number };
    expect(saved.version).toBe(3);
    await page.reload();
    await waitForCycle(page);
    expect(await gameState<number>(page, 's.hours')).toBeGreaterThanOrEqual(hours);
    expect(consoleErrors).toEqual([]);
  });
}

test('存檔壞掉、沒有備份：不當機，開一個新缸，壞檔另外保留', async ({ page }) => {
  await seed(page, { 'cycle.save.v1': '{"version":3,"savedAt":"oops"' });
  await page.goto('/');
  await waitForCycle(page);
  await expectNoCrash(page);
  expect(await page.evaluate(() => localStorage.getItem('cycle.save.corrupt'))).toContain('oops');
  expect(await gameState<number>(page, 's.fish.length')).toBe(0);
});

test('存檔壞掉、有備份：自動用備份還原', async ({ page }) => {
  const backup = readFileSync(join(SAVES, 'v3-pr62-crashfix.json'), 'utf8');
  await seed(page, { 'cycle.save.v1': '{"version":3,"savedAt":"oops"', 'cycle.save.backup': backup });
  await page.goto('/');
  await waitForCycle(page);
  await expectNoCrash(page);
  expect(await gameState<number>(page, 's.fish.length')).toBeGreaterThanOrEqual(5);
});

test('存檔比遊戲新（先用了新版 App 又裝回舊版）：另外保留，不覆蓋', async ({ page }) => {
  await seed(page, { 'cycle.save.v1': JSON.stringify({ version: 99, savedAt: 0, timeScale: 7, state: {} }) });
  await page.goto('/');
  await waitForCycle(page);
  await expectNoCrash(page);
  expect(await page.evaluate(() => localStorage.getItem('cycle.save.newer'))).toContain('"version":99');
});
