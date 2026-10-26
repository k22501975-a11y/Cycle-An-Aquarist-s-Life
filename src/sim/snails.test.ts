import { describe, expect, it } from 'vitest';
import {
  addFish,
  addSnail,
  buyPlant,
  linkTanks,
  PESTS_VISIBLE,
  PLANT_HITCHHIKE_CHANCE,
  collectTrap,
  createTank,
  doseMolluscicide,
  feed,
  FILTERS,
  HEATERS,
  LIGHTS,
  pestCount,
  removeDeadSnails,
  setTrap,
  simulate,
  snailBloom,
  snailState,
  TANKS,
  waterChange,
  type CreateTankOptions,
  type TankState,
} from './index';

const MATURE: CreateTankOptions = { tank: TANKS.std90, filter: FILTERS.canister, heater: { spec: HEATERS.h100, targetC: 25 }, light: { spec: LIGHTS.basic }, matureMedia: true };

/** 每天餵 mg，跑 days 天（每週換一次水）。 */
function run(s: TankState, days: number, mgPerDay: number) {
  for (let d = 0; d < days; d++) {
    if (mgPerDay > 0) feed(s, mgPerDay);
    simulate(s, 24);
    if (d % 7 === 6) waterChange(s, 0.3);
  }
}

describe('螺（design/snails.md）', () => {
  it('殘餌多就爆螺，少餵小螺自然變少', () => {
    const over = createTank({ ...MATURE, seed: 701 });
    const lean = createTank({ ...MATURE, seed: 701 });
    for (const s of [over, lean]) for (let i = 0; i < 6; i++) addFish(s, 'guppy', { carriesIch: false });
    // 跟水草混進來幾隻；已經爆量的缸改成少餵
    snailState(over).pests.bladder = 6;
    snailState(lean).pests.bladder = 300;
    run(over, 40, 400);
    run(lean, 40, 60);
    expect(pestCount(over)).toBeGreaterThan(100);
    expect(snailBloom(over)).not.toBe('none');
    expect(pestCount(lean)).toBeLessThan(150);
  });

  it('刺客螺會把小螺吃掉', () => {
    const plain = createTank({ ...MATURE, seed: 702 });
    const guarded = createTank({ ...MATURE, seed: 702 });
    for (const s of [plain, guarded]) snailState(s).pests.ramshorn = 120;
    for (let i = 0; i < 4; i++) addSnail(guarded, 'assassin');
    run(plain, 30, 150);
    run(guarded, 30, 150);
    expect(pestCount(guarded)).toBeLessThan(pestCount(plain) * 0.5);
  });

  it('除螺藥一兩天內螺死光，但蝦也會中毒', () => {
    const s = createTank({ ...MATURE, seed: 703 });
    snailState(s).pests.bladder = 300;
    addSnail(s, 'apple');
    const shrimp = Array.from({ length: 6 }, () => addFish(s, 'cherry_shrimp', { carriesIch: false }));
    doseMolluscicide(s);
    run(s, 4, 60);
    expect(pestCount(s)).toBeLessThan(30);
    expect(snailState(s).snails.filter((x) => x.alive)).toHaveLength(0);
    expect(shrimp.every((f) => f.health < 0.9)).toBe(true);
  });

  it('蘋果螺公母都有就會在水面上產卵塊，三週左右孵出小螺', () => {
    const s = createTank({ ...MATURE, seed: 704 });
    addSnail(s, 'apple', 'gold', 'male');
    addSnail(s, 'apple', 'blue', 'female');
    let laid = false;
    for (let d = 0; d < 50; d++) {
      feed(s, 80);
      simulate(s, 24);
      if (snailState(s).clutches.length > 0) laid = true;
      if (d % 7 === 6) waterChange(s, 0.3);
    }
    expect(laid).toBe(true);
    expect(s.events.some((e) => e.type === 'snail_hatched')).toBe(true);
  });

  it('大螺死了沒撈會爛：比撈掉的缸髒', () => {
    const left = createTank({ ...MATURE, seed: 705 });
    const removed = createTank({ ...MATURE, seed: 705 });
    for (const s of [left, removed]) {
      const a = addSnail(s, 'apple');
      a.alive = false;
      a.corpseMg = 3000;
    }
    removeDeadSnails(removed);
    simulate(left, 24);
    simulate(removed, 24);
    expect(left.water.organicMg + left.water.tan * 1000).toBeGreaterThan(removed.water.organicMg + removed.water.tan * 1000);
  });

  it('陷阱隔夜收能抓走一批，放太久菜會爛', () => {
    const s = createTank({ ...MATURE, seed: 706 });
    snailState(s).pests.bladder = 200;
    setTrap(s);
    simulate(s, 12);
    const before = pestCount(s);
    expect(collectTrap(s)).toBeGreaterThan(before * 0.2);
    setTrap(s);
    simulate(s, 50);
    expect(s.events.some((e) => e.type === 'trap_rotted')).toBe(true);
  });
});

describe('搭便車的螺（polish-to-9.md §4「第二次確認」）', () => {
  it('店裡買的水草：第一次必定夾帶 4～5 隻扁卷螺（交 2 隻起步單、留 2 隻種螺，polish-to-9.md §7.2），之後大約 30%', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createTank({ ...MATURE, seed });
      buyPlant(s, 'anubias');
      expect(snailState(s).pests.ramshorn).toBeGreaterThanOrEqual(4);
      expect(snailState(s).pests.ramshorn).toBeLessThanOrEqual(5);
    }
    const s = createTank({ ...MATURE, seed: 7 });
    buyPlant(s, 'anubias');
    let hits = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const before = snailState(s).pests.ramshorn;
      buyPlant(s, 'moss');
      if (snailState(s).pests.ramshorn > before) hits++;
    }
    expect(Math.abs(hits / n - PLANT_HITCHHIKE_CHANCE)).toBeLessThan(0.04);
  });

  it('第一次必帶螺是整個存檔只算一次：第一缸買過以後，第二缸第一次買也只是 30%', () => {
    let none = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const a = createTank({ ...MATURE, seed });
      const b = createTank({ ...MATURE, seed: seed + 100 });
      linkTanks([a, b]);
      buyPlant(a, 'anubias');
      expect(snailState(a).pests.ramshorn).toBeGreaterThanOrEqual(2);
      buyPlant(b, 'anubias');
      if (snailState(b).pests.ramshorn === 0) none++;
    }
    // 30 次裡大約 21 次沒帶螺（70%）
    expect(none).toBeGreaterThan(10);
  });

  it(`螺會自己繁殖；第一次多到 ${PESTS_VISIBLE} 隻看得見時記一筆（只記一次）`, () => {
    const s = createTank({ ...MATURE, seed: 3 });
    buyPlant(s, 'anubias');
    run(s, 40, 120);
    expect(pestCount(s)).toBeGreaterThan(5);
    expect(s.events.filter((e) => e.type === 'pests_seen')).toHaveLength(1);
  });
});
