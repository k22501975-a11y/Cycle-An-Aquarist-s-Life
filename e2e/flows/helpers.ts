import { expect, type Page } from '@playwright/test';
import { openGame } from '../fixtures';

/**
 * 遊戲流程測試共用的操作：盡量照玩家的方式點按鈕；
 * 讀數值和快轉時間才透過開發用的 window.cycle（遊戲本來就開放在主控台用）。
 */

/** window.cycle 裡測試會用到的部分。 */
interface Fish {
  alive: boolean;
  species: string;
}
interface Tank {
  hours: number;
  rng: { seed: number };
  fish: Fish[];
  water: { tan: number; no2: number; no3: number };
  label?: string;
}
export interface CycleDebug {
  game: { state: Tank; tanks: Tank[]; clock: { timeScale: number }; advance(realMs: number): number; act(fn: (s: Tank) => void): void };
  sim: {
    feed(s: Tank, mg: number): void;
    waterChange(s: Tank, fraction: number): void;
    FISH_SPECIES: Record<string, { dailyFoodMg: number }>;
    addHardscape(s: Tank, spec: unknown): void;
    HARDSCAPE: Record<string, unknown>;
  };
}
export type CycleWindow = Window & { cycle: CycleDebug };

/**
 * 點擊後不等「導覽完成」：遊戲沒有換頁，而無頭瀏覽器用軟體繪圖一幀要 100～300ms，
 * 這個檢查在 CPU 吃緊時會卡到逾時（大畫布特別明顯）。後續的 expect 會等畫面真的變化。
 */
export const NO_WAIT = { noWaitAfter: true } as const;

/** 收集 console.error（fixtures 已經會抓未捕捉的例外）。離線測試沒有伺服器，連線失敗不算。 */
export function watchConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource|net::ERR_|GPU stall/.test(text)) return;
    errors.push(text);
  });
  return errors;
}

/** 開新遊戲，等到 window.cycle 可以用。 */
export async function startGame(page: Page): Promise<void> {
  await openGame(page);
  await waitForCycle(page);
}

/** 開新遊戲並把開場對話和它打開的面板都關掉，回到乾淨的主畫面。 */
export async function startClean(page: Page): Promise<void> {
  await startGame(page);
  await dismissGuide(page);
  await closeSheet(page);
}

export async function waitForCycle(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as Partial<CycleWindow>).cycle?.game, null, { timeout: 30_000 });
}

/** 在頁面裡算一個關於目前這缸（s）或遊戲（g）的運算式，帶回結果。 */
export async function gameState<T>(page: Page, expr: string): Promise<T> {
  return page.evaluate((code) => {
    const g = (window as unknown as CycleWindow).cycle.game;
    return new Function('s', 'g', `return (${code});`)(g.state, g) as never;
  }, expr);
}

export const aliveCount = (page: Page) => gameState<number>(page, 's.fish.filter((f) => f.alive).length');

/**
 * 把老闆的對話框一路點掉：點「然後呢？」「好，我來試試」「下一個任務」這顆（不點「跳過教學」，
 * 也不點最後一頁的「帶我去商店」）。
 */
export async function dismissGuide(page: Page): Promise<void> {
  // 在頁面裡一次點完：翻頁是同步重畫的，不用等。CI 的軟體繪圖一幀要好幾秒，
  // 原本每頁「找按鈕＋送 click」來回兩次，老闆一次說五頁就吃掉 expect.poll 的 15 秒（新手任務流程測試因此卡住）。
  // 直接送 click 事件，不走滑鼠輸入：這裡只是把對話框關掉，不是在測點擊本身。
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) {
      const btn = Array.from(document.querySelectorAll<HTMLElement>('.owner .owner-actions button:not(.go-shop)')).find(
        (b) => b.getClientRects().length > 0 && !b.textContent?.includes('跳過教學'),
      );
      if (!btn) return;
      btn.click();
    }
  });
}

/** 關掉開著的面板。關掉的面板 DOM 還在（移到畫面外），只看開著的那個；有些操作做完面板會自己關。 */
export async function closeSheet(page: Page): Promise<void> {
  // 在頁面裡一次判斷加點擊：測水結果面板會自己收，先數再點的話中間可能剛好收掉而一直等不到按鈕
  await page.evaluate(() => document.querySelector<HTMLElement>('.sheet.open .sheet-close')?.click());
  await expect(page.locator('.sheet.open')).toHaveCount(0);
}

/** 點下方工具列的按鈕。 */
export async function tool(page: Page, name: string): Promise<void> {
  // 老闆說完話有時會自己幫你打開商店，先關掉再點
  await dismissGuide(page);
  await closeSheet(page);
  const btn = page.locator('button.tool', { hasText: name });
  // 不常用的收在「更多」裡（畫面評測第 8 輪）
  if (!(await btn.isVisible())) await page.locator('button.tool-more').click(NO_WAIT);
  await btn.click(NO_WAIT);
  await expect(page.locator('.sheet.open')).toHaveCount(1);
}

/** 點下方工具列直接做事、不開面板的按鈕（換水一鍵換，#257）。 */
export async function tapTool(page: Page, name: string): Promise<void> {
  await dismissGuide(page);
  await closeSheet(page);
  const btn = page.locator('button.tool', { hasText: name });
  if (!(await btn.isVisible())) await page.locator('button.tool-more').click(NO_WAIT);
  await btn.click(NO_WAIT);
}

/** 點任務卡下面的一鍵買圖卡；換任務時圖卡先收著（#265），要先點任務卡展開。 */
export async function trayCard(page: Page, text?: string): Promise<void> {
  const card = page.locator('.quest-tray .qt-card', text ? { hasText: text } : {}).first();
  await card.waitFor({ state: 'attached' });
  // 換任務的瞬間圖卡會重畫、重新收起來：沒點到就再展開一次
  for (let i = 0; i < 5; i++) {
    const tucked = page.locator('.quest-pill.tray-tucked');
    if (await tucked.count()) await tucked.click(NO_WAIT);
    try {
      await card.click({ ...NO_WAIT, timeout: 3000 });
      return;
    } catch {
      /* 再試一次 */
    }
  }
  await card.click(NO_WAIT);
}

/** 在開著的面板裡點一個按鈕。 */
export async function sheetButton(page: Page, text: string): Promise<void> {
  await page.locator('.sheet.open button', { hasText: text }).first().click(NO_WAIT);
}

/** 買魚後的對水小遊戲（F5，前幾次一定要玩）：按住滴管滴到差距收到綠線，放開、按「放魚」。沒跳出來就不做事。 */
export async function finishDrip(page: Page): Promise<void> {
  const game = page.locator('.drip-game');
  if (!(await game.waitFor({ timeout: 5_000 }).then(() => true, () => false))) return;
  const hold = game.locator('button.drip-hold');
  await hold.dispatchEvent('pointerdown');
  await page.locator('.drip-gap.ok').waitFor({ timeout: 90_000 });
  await hold.dispatchEvent('pointerup');
  await game.locator('button.drip-release').dispatchEvent('click');
  await expect(page.locator('.drip-shade')).toHaveCount(0, { timeout: 10_000 });
}

/** 用時鐘旁的速度按鈕換速度（name 是選單上的字，例如「暫停時間」「正常速度」）。 */
export async function setSpeed(page: Page, name: string): Promise<void> {
  // 老闆的對話框會蓋住速度選單下半部，先點掉
  await dismissGuide(page);
  await closeSheet(page);
  await page.locator('button.speed-btn').click(NO_WAIT);
  await page.locator('button.speed-opt', { hasText: name }).click(NO_WAIT);
}

/**
 * 快轉遊戲時間：直接推進模擬（和速度按鈕的快轉一樣走 Game.advance），每推一段讓畫面畫一幀，
 * 畫面層照樣要處理新出生、長大、死亡的魚。比按 6時/秒 等真實時間快很多
 * （軟體繪圖只有幾 fps，PixiJS 每幀最多算 100ms，6時/秒實際只跑到三分之一）。
 */
export async function fastForward(page: Page, hours: number): Promise<void> {
  const target = (await gameState<number>(page, 's.hours')) + hours;
  for (let guard = 0; guard < 1000; guard++) {
    const left = await page.evaluate((until) => {
      const g = (window as unknown as CycleWindow).cycle.game;
      const before = g.clock.timeScale;
      g.clock.timeScale = 3600;
      // 每次最多 12 個遊戲小時（720 個 tick，Game.advance 一次上限 1500），再讓出一幀給畫面
      g.advance(Math.min(12, until - g.state.hours) * 1000);
      g.clock.timeScale = before;
      return until - g.state.hours;
    }, target);
    if (left <= 1 / 60) return;
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  throw new Error('快轉沒有前進');
}

/**
 * 固定模擬的亂數種子。新遊戲的種子取自開遊戲的時間，店裡的魚帶不帶病、會不會已經懷孕每次都不一樣；
 * 長流程測試先暫停再固定種子，結果才穩定可重現。
 */
export async function seedRng(page: Page, seed: number): Promise<void> {
  await page.evaluate((n) => {
    const g = (window as unknown as CycleWindow).cycle.game;
    for (const t of g.tanks) t.rng.seed = n;
  }, seed);
}

/** 新手任務完成了幾個（存在 localStorage 的教學進度；等於任務數（9）表示全部完成）。 */
export async function questStep(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('cycle.tutorial.v1');
    return raw ? (JSON.parse(raw).step as number) : 0;
  });
}

/** 沒有當機畫面。 */
export async function expectNoCrash(page: Page): Promise<void> {
  await expect(page.locator('.crash')).toHaveCount(0);
}
