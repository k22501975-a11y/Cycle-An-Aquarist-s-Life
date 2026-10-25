import { describe, expect, it } from 'vitest';
import { addFish, addPlant, createTank, economy, emergencySale, feed, FILTERS, fulfillOrder, HEATERS, insulateTank, installHeater, LIGHTS, linkTanks, orderBoard, orderRefusal, pinchMg, price, removeDeadFish, sellFish, simulate, spend, takeHeaterCredit, TANKS, unplugHeater, type TankSpec, type TankState } from '../sim';
import { guideStep } from '../ui/status';

/**
 * mvp.md §4.4.6 驗收（#397，g29）：一月室溫 16°C、兩缸加熱棒都壞、手上 98 元、缸裡多是小魚、訂單一張都交不出來。
 * 照任務卡做（保溫、賣魚、跟阿德賒、換加熱棒、撈死魚），死魚要 ≤ 2 尾。
 */
function coldTank(seed: number, spec: TankSpec, heater: keyof typeof HEATERS): TankState {
  const t = createTank({ tank: spec, filter: FILTERS.hangOn, heater: { spec: HEATERS[heater], targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 16, seed, matureMedia: true });
  t.hours = 80 * 24 + 8;
  addPlant(t, 'rotala');
  for (let i = 0; i < 4; i++) addFish(t, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
  // 自家生的中魚：再養十幾天才夠訂單的大小
  for (let i = 0; i < 18; i++) {
    const f = addFish(t, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
    f.lengthCm *= 0.55;
    f.ageDays = 30;
    f.generation = 1;
  }
  for (const f of t.fish) f.stress = 0;
  t.environment.roomSwingC = 1.5;
  t.water.tempC = 21;
  t.equipment.heater!.broken = true;
  unplugHeater(t);
  return t;
}

/** 照任務卡做一步；回傳做了沒。 */
function follow(tanks: TankState[]): boolean {
  const s = guideStep(tanks, 'g');
  if (!s) return false;
  const t = tanks[s.tank ?? 0];
  switch (s.target) {
    case 'insulate':
      return insulateTank(t);
    case 'heater_credit':
      return takeHeaterCredit(t) > 0;
    case 'remove_dead':
      return tanks.reduce((n, x) => n + removeDeadFish(x), 0) > 0;
    case 'equipment': {
      const heater = t.equipment.heater;
      if (heater?.stuckOn) return (unplugHeater(t), true);
      if (!heater?.broken) return false;
      if (!spend(tanks[0], price(`heater:${heater.spec.id}`))) return false;
      installHeater(t, heater.spec);
      return true;
    }
    case 'sell': {
      // 照任務卡說的尾數賣
      const n = Number(/賣 (\d+) 尾/.exec(s.text)?.[1] ?? 0);
      let sold = 0;
      for (const f of emergencySale(tanks, Infinity).fish.slice(0, n)) sold += sellFish(tanks.find((x) => x.fish.includes(f))!, f.id);
      return sold > 0;
    }
    case 'orders': {
      const ok = orderBoard(tanks[0]).orders.find((o) => !o.preview && !orderRefusal(tanks, o.id));
      return !!ok && fulfillOrder(tanks, ok.id) > 0;
    }
    default:
      return false;
  }
}

describe('冬天加熱棒都壞、沒錢、沒單可交（#397，mvp.md §4.4.6 驗收）', () => {
  it('照任務卡做：先保溫、賣魚或賒一支，死魚 ≤ 2 尾', () => {
    const a = coldTank(31, TANKS.std40, 'h50');
    const b = coldTank(32, TANKS.std90, 'h100');
    b.label = '繁殖缸';
    const tanks = [a, b];
    linkTanks(tanks);
    economy(a).coins = 98;
    orderBoard(a).orders = [];
    const fish = tanks.reduce((n, t) => n + t.fish.length, 0);
    const did: string[] = [];
    let died = 0;
    for (let h = 0; h < 10 * 24; h++) {
      for (const t of tanks) {
        const alive = t.fish.filter((f) => f.alive).length;
        simulate(t, 1);
        died += alive - t.fish.filter((f) => f.alive).length;
      }
      // g29 的最壞情況：板上的單全都交不出來（交得出的一出現就被別人接走）
      const board = orderBoard(a);
      board.orders = board.orders.filter((o) => o.preview || orderRefusal(tanks, o.id));
      const hour = Math.round(tanks[0].hours) % 24;
      if (hour === 9 || hour === 19) for (const t of tanks) feed(t, pinchMg(t));
      // 玩家白天每 3 小時看一次任務卡，照著做到沒事可做
      if (hour >= 8 && hour <= 22 && hour % 3 === 2) {
        for (let n = 0; n < 6; n++) {
          const s = guideStep(tanks, 'g');
          if (!follow(tanks)) break;
          did.push(`${Math.floor(tanks[0].hours / 24)}d ${s?.target}`);
        }
      }
    }
    // 一缸賣魚換好、另一缸（90L 要 100W，賣魚湊不到）先保溫再跟阿德賒
    expect(did.some((d) => d.endsWith('insulate')), did.join(', ')).toBe(true);
    expect(did.some((d) => d.endsWith('sell') || d.endsWith('heater_credit')), did.join(', ')).toBe(true);
    expect(tanks.every((t) => t.equipment.heater && !t.equipment.heater.broken)).toBe(true);
    expect(died, did.join(', ')).toBeLessThanOrEqual(2);
    expect(tanks.reduce((n, t) => n + t.fish.filter((f) => f.alive).length, 0)).toBeGreaterThan(fish / 2);
  }, 60_000);
});
