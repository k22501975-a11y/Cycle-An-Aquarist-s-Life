import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { addFish, addPlant, dailyTasks, feed, FISH_SPECIES, fulfillOrder, ICH_CAUSE_LABELS, orderBoard, orderContext, PINCH_MEALS, simulate, updateDaily, useTestKit, waterChange, type TankState } from '../sim';

/**
 * 白點病頻率（polish-to-9.md G3、§4）：照推薦玩法——和教學一樣從商店買一公兩母（沒有檢疫盒，會隨機帶白點蟲）直接放進缸、
 * 1 株水草、每天一次「一小撮」、每天測水、測到氨或亞硝或小事要換水才換、交得出來的訂單就交——玩 30 天。
 * 種子 1～10 加起來最多爆發 3 次，每次都要有原因（溫差、新魚沒檢疫、太擠）。
 * 一波：缸裡完全沒有魚帶著白點蟲超過 3 天後又有魚出現白點，才算新的一波。
 */

const DAYS = 30;
const WAVE_GAP_HOURS = 72;

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

interface Outbreak {
  day: number;
  cause: string | undefined;
}

function recommended(seed: number): Outbreak[] {
  const s = newGameState(seed);
  const tanks = [s];
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
  addPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { sex });
  const breeders = s.fish.map((f) => f.id);
  const outbreaks: Outbreak[] = [];
  // 這一波還沒過；上一次缸裡還有魚帶著白點蟲的時間
  let wave = false;
  let lastCarrying = 0;
  let seen = s.events.at(-1);
  const watch = () => {
    const fresh = s.events.slice(seen ? s.events.lastIndexOf(seen) + 1 : 0);
    seen = s.events.at(-1);
    for (const e of fresh) {
      if (e.type !== 'ich_visible' || wave) continue;
      wave = true;
      outbreaks.push({ day: Math.floor(e.hours / 24) + 1, cause: e.cause });
    }
    if (alive(s).some((f) => f.ich.stage !== 'none')) lastCarrying = s.hours;
    else if (wave && s.hours - lastCarrying > WAVE_GAP_HOURS) wave = false;
  };
  for (let d = 1; d <= DAYS; d++) {
    simulate(s, 24, watch);
    updateDaily(tanks);
    feed(s, meal(s) * PINCH_MEALS);
    const r = useTestKit(s);
    const tasks = dailyTasks(tanks)?.tasks.map((t) => t.id) ?? [];
    if (r.ammonia > 0 || r.nitrite > 0 || tasks.includes('water')) waterChange(s, 0.3);
    const board = orderBoard(s);
    const keep = Math.max(0, ...board.orders.filter((o) => o.kind === 'fish' && o.size === 'juvenile').map((o) => o.count));
    for (const o of [...board.orders]) {
      if (o.kind === 'fry' && orderContext(s).fry - o.count < keep) continue;
      fulfillOrder(tanks, o.id, breeders);
    }
  }
  return outbreaks;
}

describe('白點病頻率劇本（polish-to-9.md G3）', () => {
  it(`種子 1～10 照推薦玩法 ${DAYS} 天：最多爆發 3 次，每次都有原因`, { timeout: 120_000 }, () => {
    const all = Array.from({ length: 10 }, (_, i) => recommended(i + 1).map((o) => ({ seed: i + 1, ...o })));
    const flat = all.flat();
    const log = flat.map((o) => `種子 ${o.seed} 第 ${o.day} 天：${o.cause ? (ICH_CAUSE_LABELS as Record<string, string>)[o.cause] ?? o.cause : '沒有原因'}`).join('\n');
    expect(flat.length, log).toBeLessThanOrEqual(3);
    for (const o of flat) expect(o.cause && o.cause in ICH_CAUSE_LABELS, log).toBeTruthy();
  });
});
