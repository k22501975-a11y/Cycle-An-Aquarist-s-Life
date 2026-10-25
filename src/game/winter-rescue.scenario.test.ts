import { describe, expect, it } from 'vitest';
import { addFish, addPlant, createTank, economy, emergencySale, feed, FILTERS, fulfillOrder, HEATERS, insulateTank, installHeater, LIGHTS, linkTanks, moveToWarmTank, buyCheapHeater, needsInsulation, orderBoard, orderRefusal, pinchMg, price, removeDeadFish, sellFish, simulate, spend, takeHeaterCredit, TANKS, unplugHeater, type TankSpec, type TankState } from '../sim';
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
    case 'move_warm':
      return !!moveToWarmTank(tanks, s.tank ?? 0);
    case 'buy_heater':
      return !!buyCheapHeater(t);
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

/** 跑 days 天：每小時記死了幾尾，白天每 3 小時照任務卡做；板上的單全都交不出來（g29 的最壞情況）。 */
function play(tanks: TankState[], days: number, log?: string[]): { died: number; did: string[] } {
  const a = tanks[0];
  const did: string[] = [];
  let died = 0;
  for (let h = 0; h < days * 24; h++) {
    for (const t of tanks) {
      const alive = t.fish.filter((f) => f.alive).length;
      simulate(t, 1);
      died += alive - t.fish.filter((f) => f.alive).length;
    }
    // 交得出的單一出現就被別人接走
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
        log?.push(`${Math.floor(tanks[0].hours / 24)}d ${s?.text} | ${tanks.map((t) => `${t.fish.filter((f) => f.alive).length}尾 ${t.water.tempC.toFixed(1)}°C`).join(' / ')}`);
      }
    }
  }
  return { died, did };
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
    const { died, did } = play(tanks, 10);
    // 一缸賣魚換好、另一缸（90L 要 100W，賣魚湊不到）先保溫再跟阿德賒
    expect(did.some((d) => d.endsWith('insulate')), did.join(', ')).toBe(true);
    expect(did.some((d) => d.endsWith('sell') || d.endsWith('heater_credit')), did.join(', ')).toBe(true);
    expect(tanks.every((t) => t.equipment.heater && !t.equipment.heater.broken)).toBe(true);
    expect(died, did.join(', ')).toBeLessThanOrEqual(2);
    expect(tanks.reduce((n, t) => n + t.fish.filter((f) => f.alive).length, 0)).toBeGreaterThan(fish / 2);
  }, 60_000);

  it('賒過一支、另一缸還是冷（g30）：任務卡叫玩家把魚搬去有加熱棒的缸，大部分救得回來', () => {
    // g30：孔雀魚之家 40L 4 尾大魚＋36 尾小魚，繁殖缸 20L 跟阿德賒的加熱棒是好的，手上沒錢
    const a = coldTank(41, TANKS.std40, 'h50');
    const fry = a.fish.filter((f) => f.generation === 1);
    for (const f of fry) {
      f.lengthCm = 0.8;
      f.ageDays = 5;
    }
    for (let i = 0; i < 18; i++) {
      const f = addFish(a, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
      Object.assign(f, { lengthCm: 0.8, ageDays: 5, generation: 1, stress: 0 });
    }
    const b = coldTank(42, TANKS.nano20, 'h25');
    b.label = '繁殖缸';
    b.fish = b.fish.slice(0, 10);
    installHeater(b, HEATERS.h25);
    b.water.tempC = 25;
    const tanks = [a, b];
    linkTanks(tanks);
    economy(a).coins = 0;
    economy(a).heaterLoan = 280;
    orderBoard(a).orders = [];
    const fish = tanks.reduce((n, t) => n + t.fish.length, 0);
    const log: string[] = [];
    const { died, did } = play(tanks, 6, log);
    expect(did.some((d) => d.endsWith('move_warm')), log.join('\n')).toBe(true);
    // 搬過去之後沒有冷死的（小魚被大魚吃掉是平常的事，原本的缸也會吃）
    const cold = tanks.flatMap((t) => t.events).filter((e) => e.type === 'fish_died' && e.cause === 'temperature').length;
    expect(cold, log.join('\n')).toBe(0);
    expect(fish - died, log.join('\n')).toBeGreaterThan(fish / 2);
    // 空缸早上不再叫保溫
    expect(a.fish.some((f) => f.alive)).toBe(false);
    expect(needsInsulation(a)).toBe(false);
  }, 60_000);

  /** g31：孔雀魚之家 40L（50W 壞了）4 尾大魚＋30 尾小魚，繁殖缸 20L 跟阿德賒的 25W 是好的、10 尾魚、正在下白點藥。 */
  function g31(coins: number) {
    const a = coldTank(51, TANKS.std40, 'h50');
    a.fish = a.fish.slice(0, 4);
    for (let i = 0; i < 30; i++) {
      const f = addFish(a, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
      Object.assign(f, { lengthCm: 0.8, ageDays: 5, generation: 1, stress: 0 });
    }
    const b = coldTank(52, TANKS.nano20, 'h25');
    b.label = '繁殖缸';
    b.fish = b.fish.slice(0, 10);
    installHeater(b, HEATERS.h25);
    b.water.tempC = 25;
    b.water.medication = 1;
    const tanks = [a, b];
    linkTanks(tanks);
    economy(a).coins = coins;
    economy(a).heaterLoan = 280;
    orderBoard(a).orders = [];
    return { tanks, a, b };
  }

  it('g31：手上 250 元，任務卡第一步叫你買 25W，孔雀魚之家冷死 ≤ 2 尾（#404）', () => {
    const { tanks, a } = g31(250);
    economy(a).coins = 290;
    const fish = tanks.reduce((n, t) => n + t.fish.length, 0);
    const log: string[] = [];
    play(tanks, 8, log);
    expect(log[0], log.join('\n')).toMatch(/先買一支25W 加熱棒（280 元）撐過冬天/);
    const cold = tanks.flatMap((t) => t.events).filter((e) => e.type === 'fish_died' && e.cause === 'temperature').length;
    expect(cold, log.join('\n')).toBeLessThanOrEqual(2);
    expect(a.equipment.heater?.broken).toBe(false);
    // 小魚被大魚吃掉是平常的事；其他死因（冷、病）合起來 ≤ 2 尾
    const other = tanks.flatMap((t) => t.events).filter((e) => e.type === 'fish_died').length;
    expect(other, log.join('\n')).toBeLessThanOrEqual(2);
    expect(fish).toBeGreaterThan(30);
  }, 60_000);

  it('g31：繁殖缸在下白點藥也叫你搬魚（魚一起泡藥），不會整缸冷死（#404）', () => {
    const { tanks } = g31(20);
    const log: string[] = [];
    const { did } = play(tanks, 2, log);
    expect(did.some((d) => d.endsWith('move_warm')), log.join('\n')).toBe(true);
  }, 60_000);

  it('g32：兩缸都冷、只能賒一支，小缸先冷到也把加熱棒賒給魚多的大缸，小缸的魚再搬過去，魚幾乎都救得回來（#407）', () => {
    // g32 B 次：孔雀魚之家 90L 42 尾 1.6 cm 小魚，繁殖缸 20L 一對種魚＋8 尾小魚，兩缸加熱棒都壞，手上 228 元，魚都還太小賣不了
    const a = coldTank(61, TANKS.std90, 'h50');
    a.label = '孔雀魚之家';
    a.fish = [];
    for (let i = 0; i < 42; i++) {
      const f = addFish(a, 'guppy', { carriesIch: false, carries: [], sex: i % 2 ? 'male' : 'female', pregnant: false });
      Object.assign(f, { lengthCm: 1.6, ageDays: 5, generation: 1, stress: 0 });
    }
    const b = coldTank(62, TANKS.nano20, 'h25');
    b.label = '繁殖缸';
    b.fish = [...b.fish.slice(0, 2), ...b.fish.slice(4, 12).map((f) => Object.assign(f, { lengthCm: 1.6, ageDays: 5 }))];
    b.water.tempC = 20;
    const tanks = [a, b];
    linkTanks(tanks);
    economy(a).coins = 228;
    orderBoard(a).orders = [];
    const fish = tanks.reduce((n, t) => n + t.fish.length, 0);
    const log: string[] = [];
    const { did } = play(tanks, 12, log);
    expect(did.some((d) => d.endsWith('heater_credit')), log.join('\n')).toBe(true);
    expect(log.find((l) => /賒一支/.test(l)), log.join('\n')).toMatch(/^\d+d 孔雀魚之家：/);
    const cold = tanks.flatMap((t) => t.events).filter((e) => e.type === 'fish_died' && e.cause === 'temperature').length;
    expect(cold, log.join('\n')).toBeLessThanOrEqual(2);
    // 舊的：賒給繁殖缸，孔雀魚之家的小魚一尾 1 元賣掉 33 尾，只剩 19 尾
    expect(tanks.reduce((n, t) => n + t.fish.filter((f) => f.alive).length, 0), log.join('\n')).toBeGreaterThanOrEqual(fish - 2);
  }, 60_000);
});

