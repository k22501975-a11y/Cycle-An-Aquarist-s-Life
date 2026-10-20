import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { doDailyTask } from './daily-player';
import {
  addCuttings,
  addFish,
  addPlant,
  claimDaily,
  dailyTasks,
  economy,
  FISH_SPECIES,
  feed,
  fulfillOrder,
  orderBoard,
  orderContext,
  PINCH_MEALS,
  simulate,
  trimPlant,
  updateDaily,
  useTestKit,
  waterChange,
  type TankState,
} from '../sim';

/**
 * 前期收入（design/mvp.md §4.4.1，#175）：照新手基準玩法（§4.6：1 株水草、一公兩母、每天一小撮一次、
 * 每天測水、測到氨或亞硝才換水），加上每天把 3 件小事做完開寶箱、交得出來的訂單就交（留種的不交；
 * 板上有中魚單時小孔雀留夠那張單的數量養大，多的才交仔魚單）。
 * 第一筆收入要在第 14 天以內，第 10～60 天之間任兩筆收入隔不超過 7 個遊戲天。
 */

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

/** 回傳每一筆收入在第幾天、從哪來。 */
function baseline(seed: number, days = 60): Array<{ day: number; from: string; coins: number; kind?: string }> {
  const s = newGameState(seed);
  const tanks = [s];
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
  addPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex });
  const breeders = s.fish.map((f) => f.id);
  const income: Array<{ day: number; from: string; coins: number; kind?: string }> = [];
  for (let d = 1; d <= days; d++) {
    simulate(s, 24);
    updateDaily(tanks);
    // 基準玩法的日常
    feed(s, meal(s) * PINCH_MEALS);
    const r = useTestKit(s);
    const tasks = dailyTasks(tanks)?.tasks.map((t) => t.id) ?? [];
    if (r.ammonia > 0 || r.nitrite > 0 || tasks.includes('water')) waterChange(s, 0.3);
    // 每日小事：剩下要動手的也做完（寶箱開到的石頭、插枝也照小卡擺進缸、種回去）
    updateDaily(tanks);
    for (const t of dailyTasks(tanks)?.tasks ?? []) if (!t.done) doDailyTask(tanks, t.id);
    updateDaily(tanks);
    // 寶箱開到東西也算一筆收入（折合商店價）
    const chest = claimDaily(tanks);
    if (chest) income.push({ day: d, from: 'daily', coins: chest.value, kind: chest.item ?? 'coins' });
    // 訂單：插枝單先修剪；交得出來就交
    const board = orderBoard(s);
    if (board.orders.some((o) => o.kind === 'cutting')) for (const p of s.plants) addCuttings(s, p.species, trimPlant(s, p.id));
    // 小孔雀留夠中魚單要的數量，多的才交仔魚單
    const keep = Math.max(0, ...board.orders.filter((o) => o.kind === 'fish' && o.size === 'juvenile').map((o) => o.count));
    for (const o of [...board.orders]) {
      if (o.kind === 'fry' && orderContext(s).fry - o.count < keep) continue;
      const coins = fulfillOrder(tanks, o.id, breeders);
      if (coins > 0) income.push({ day: d, from: o.kind, coins });
    }
  }
  expect(economy(s).coins).toBeGreaterThan(0);
  return income;
}

describe('前期收入劇本（mvp.md §4.4.1）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：第一筆收入 ≤ 第 14 天，第 10～60 天任兩筆收入間隔 ≤ 7 天`, () => {
      const income = baseline(seed);
      expect(income.length).toBeGreaterThan(0);
      expect(income[0].day).toBeLessThanOrEqual(14);
      const days = [...new Set(income.map((x) => x.day))].filter((d) => d >= 10 && d <= 60);
      for (let i = 1; i < days.length; i++) expect(days[i] - days[i - 1], `第 ${days[i - 1]} 天到第 ${days[i]} 天沒有收入`).toBeLessThanOrEqual(7);
      expect(60 - days[days.length - 1]).toBeLessThanOrEqual(7);
      // 訂單也要有收入（不能全靠每日小事）
      expect(income.some((x) => x.from !== 'daily' && x.day <= 45)).toBe(true);
      // 寶箱獎勵池（polish-to-9.md U5）：14 天內至少開出 3 種不同獎勵
      expect(new Set(income.filter((x) => x.from === 'daily' && x.day <= 14).map((x) => x.kind)).size).toBeGreaterThanOrEqual(3);
    }, 60_000);
  }
});
