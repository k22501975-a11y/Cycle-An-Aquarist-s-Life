import { describe, expect, it } from 'vitest';
import {
  addFish,
  buyTank,
  createTank,
  FILTERS,
  HEATERS,
  LIGHTS,
  TANKS,
  buyTankRefusal,
  goalState,
  economy,
  feed,
  feedTarget,
  feedOtherTanks,
  tapFeed,
  FREE_SLOTS,
  mealMg,
  simulate,
  ID_BLOCK,
  MAX_TANKS,
  moveFish,
  newTankCost,
  RACK_PRICE,
  removeTank,
  removeTankRefusal,
  tankLabel,
  tankSetPrice,
  type TankState,
} from '../sim';
import { Game, newGameState } from './game';
import { catchUp, readSave, writeSave, type KeyValueStore } from './save';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function rich(): TankState[] {
  const home = newGameState(3);
  economy(home).coins = 100_000;
  return [home];
}

describe('多缸與缸位', () => {
  it('買新缸：扣套缸錢，第 3 缸起要加缸架；新缸還沒養水、時間和主缸一樣', () => {
    const tanks = rich();
    tanks[0].hours = 500;
    expect(newTankCost(tanks, 'std40')).toBe(tankSetPrice('std40'));
    const second = buyTank(tanks, 'std40')!;
    expect(economy(tanks[0]).coins).toBe(100_000 - tankSetPrice('std40'));
    expect(second.hours).toBe(500);
    expect(second.fish).toHaveLength(0);
    expect(second.bacteria.aob).toBeLessThan(0.05);
    expect(tanks.length).toBe(FREE_SLOTS);
    expect(newTankCost(tanks, 'nano20')).toBe(tankSetPrice('nano20') + RACK_PRICE);
  });

  it('套缸整組價跟 mvp.md §4.3 一樣：20L 1,430、90L 3,500（#283）', () => {
    expect(tankSetPrice('nano20')).toBe(1430);
    expect(tankSetPrice('std90')).toBe(3500);
  });

  it('停在剛買的空缸按餵食：改餵別缸最餓的那缸，主缸的小魚 7 天不會餓死（#315）', () => {
    const run = (target: (tanks: TankState[]) => number) => {
      // 養好水的主缸（評測裡是第 20 天的孔雀魚之家）
      const home = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 21, matureMedia: true });
      economy(home).coins = 100_000;
      const tanks = [home];
      for (let i = 0; i < 3; i++) addFish(home, 'guppy', { carriesIch: false, sex: i === 0 ? 'male' : 'female' });
      for (let i = 0; i < 12; i++) {
        const fry = addFish(home, 'guppy', { carriesIch: false });
        fry.lengthCm = 0.8;
        fry.ageDays = 10;
      }
      buyTank(tanks, 'nano20');
      // 畫面停在第 2 缸（空的），每天早晚各按一次「餵食」
      for (let half = 0; half < 14; half++) {
        const t = tanks[target(tanks)];
        if (mealMg(t) > 0) feed(t, mealMg(t));
        for (const x of tanks) simulate(x, 12);
      }
      return home.events.filter((e) => e.type === 'fish_died' && e.cause === 'starvation').length;
    };
    expect(feedTarget(rich(), 0)).toBe(0);
    // 這缸有魚就不跳缸，別缸餓了也一樣（#325）
    const two = rich();
    const t2 = buyTank(two, 'nano20')!;
    addFish(t2, 'guppy', { sex: 'female', pregnant: false }).hunger = 0.9;
    addFish(two[0], 'guppy', { sex: 'male' }).hunger = 0.1;
    expect(feedTarget(two, 0)).toBe(0);
    expect(run((tanks) => feedTarget(tanks, 1))).toBe(0);
    // 對照：餵食落在空缸就會餓死（評測 g18 看到的）
    expect(run(() => 1)).toBeGreaterThan(0);
  });

  it('兩缸、一天只按一次餵食（餵畫面上的主缸）：別缸一起餵，20 天沒有魚餓到消瘦（#325）', () => {
    const home = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 22, matureMedia: true });
    economy(home).coins = 100_000;
    const tanks = [home];
    for (let i = 0; i < 6; i++) addFish(home, 'guppy', { carriesIch: false, sex: i % 2 ? 'male' : 'female', pregnant: false });
    const t2 = buyTank(tanks, 'nano20')!;
    t2.bacteria.aob = t2.bacteria.nob = 1e6;
    for (let i = 0; i < 4; i++) {
      const fry = addFish(t2, 'guppy', { carriesIch: false, pregnant: false });
      fry.lengthCm = 1.2;
      fry.ageDays = 15;
    }
    let others = 0;
    for (let day = 0; day < 20; day++) {
      for (let k = 0; k < 3; k++) tapFeed(home);
      others += feedOtherTanks(tanks, 0).length;
      for (const t of tanks) simulate(t, 24);
      for (const t of tanks) expect(t.fish.filter((f) => f.alive && f.starvingHours > 0).length, `day ${day}`).toBe(0);
    }
    expect(others).toBeGreaterThan(10);
    // 別缸不餓、或上一餐還沒吃完就不餵
    for (const f of t2.fish) f.hunger = 0.1;
    expect(feedOtherTanks(tanks, 0)).toEqual([]);
  });

  it('錢包共用：在哪一缸花錢都扣同一個錢包', () => {
    const tanks = rich();
    const second = buyTank(tanks, 'nano20')!;
    expect(second.economy).toBe(tanks[0].economy);
  });

  it('房間最多 6 缸，錢不夠也買不了', () => {
    const tanks = rich();
    while (tanks.length < MAX_TANKS) buyTank(tanks, 'nano20');
    expect(buyTankRefusal(tanks, 'nano20')).toContain('最多');
    expect(buyTank(tanks, 'nano20')).toBeNull();
    const poor = [newGameState(1)];
    economy(poor[0]).coins = 100;
    expect(buyTankRefusal(poor, 'std40')).toBe('錢不夠');
  });

  it('90L 缸要先完成「穩定 14 天」的目標才買得到；舊存檔已經有 90L 的不鎖', () => {
    const tanks = rich();
    expect(buyTankRefusal(tanks, 'std90')).toContain('穩定');
    goalState(tanks).unlocked.push('std90');
    expect(buyTankRefusal(tanks, 'std90')).toBeNull();
  });

  it('每缸的 id 從不同區段開始，魚換缸不會撞號', () => {
    const tanks = rich();
    const second = buyTank(tanks, 'std40')!;
    const a = addFish(tanks[0], 'guppy', { carriesIch: false, carries: [] });
    const b = addFish(second, 'guppy', { carriesIch: false, carries: [] });
    expect(b.id).toBeGreaterThanOrEqual(ID_BLOCK);
    expect(moveFish(tanks[0], second, a.id)).toBe(true);
    expect(new Set(second.fish.map((f) => f.id)).size).toBe(2);
    expect(tanks[0].fish).toHaveLength(0);
  });

  it('魚換缸會緊迫，兩缸水溫差越多越嚴重', () => {
    const tanks = rich();
    const second = buyTank(tanks, 'std40')!;
    const calm = addFish(tanks[0], 'guppy', { carriesIch: false, carries: [] });
    const shocked = addFish(tanks[0], 'guppy', { carriesIch: false, carries: [] });
    calm.stress = shocked.stress = 0;
    second.water.tempC = tanks[0].water.tempC;
    moveFish(tanks[0], second, calm.id);
    second.water.tempC = tanks[0].water.tempC + 6;
    moveFish(tanks[0], second, shocked.id);
    expect(calm.stress).toBeCloseTo(0.3, 1);
    expect(shocked.stress).toBeGreaterThan(calm.stress + 0.3);
  });

  it('收缸：還有活魚不能收、至少留一缸；收掉空缸會拿回一點錢', () => {
    const tanks = rich();
    const second = buyTank(tanks, 'std40')!;
    expect(removeTankRefusal([tanks[0]], 0)).toContain('至少');
    addFish(second, 'guppy', { carriesIch: false, carries: [] });
    expect(removeTankRefusal(tanks, 1)).toContain('活的');
    second.fish = [];
    const before = economy(tanks[0]).coins;
    const refund = removeTank(tanks, 1);
    expect(refund).toBeGreaterThan(0);
    expect(economy(tanks[0]).coins).toBe(before + refund);
    expect(tanks).toHaveLength(1);
  });

  it('沒取名的缸叫「第 N 缸」', () => {
    const tanks = rich();
    buyTank(tanks, 'std40');
    expect(tankLabel(tanks, 1)).toBe('第 2 缸');
    tanks[1].label = '繁殖缸';
    expect(tankLabel(tanks, 1)).toBe('繁殖缸');
  });

  it('遊戲迴圈讓每一缸一起走；其他缸的事件也會通知並標出是哪一缸', () => {
    const game = new Game(rich()[0], 21600);
    const second = game.actAll((tanks) => buyTank(tanks, 'std40'))!;
    const fish = addFish(second, 'guppy', { carriesIch: false, carries: [] });
    fish.health = 0.001;
    second.water.tan = 20;
    const seen: Array<[string, number]> = [];
    game.onEvent((e, tank) => seen.push([e.type, tank]));
    game.advance(1000);
    expect(second.hours).toBeCloseTo(game.tanks[0].hours);
    expect(seen).toContainEqual(['fish_died', 1]);
  });

  it('切換缸以後，操作只作用在目前這缸；冷氣等房間設定同步到每一缸', () => {
    const game = new Game(rich()[0], 0);
    game.actAll((tanks) => buyTank(tanks, 'std40'));
    game.switchTo(1);
    game.act((s) => {
      s.water.foodMg = 33;
      s.environment.airConditioned = true;
    });
    expect(game.tanks[0].water.foodMg).toBe(0);
    expect(game.tanks[0].environment.airConditioned).toBe(true);
  });

  it('復原只換回目前這缸，錢也退回共用錢包', () => {
    const game = new Game(rich()[0], 0);
    game.actAll((tanks) => buyTank(tanks, 'std40'));
    game.switchTo(1);
    const before = structuredClone(game.state);
    const coins = economy(game.state).coins;
    game.act((s) => (economy(s).coins -= 500));
    game.tanks[0].water.foodMg = 7;
    game.restoreActive(before);
    expect(economy(game.tanks[0]).coins).toBe(coins);
    expect(game.tanks[1].economy).toBe(game.tanks[0].economy);
    expect(game.tanks[0].water.foodMg).toBe(7);
  });

  it('多缸存檔讀回來，錢包重新連起來；離線補算每一缸', () => {
    const store = memoryStore();
    const game = new Game(rich()[0], 7);
    game.actAll((tanks) => buyTank(tanks, 'std40'));
    game.switchTo(1);
    writeSave(store, game.tanks[0], 7, 0, { tanks: game.tanks.slice(1), active: game.active });
    const file = readSave(store)!;
    expect(file.tanks).toHaveLength(1);
    expect(file.active).toBe(1);
    const startHours = file.state.hours;
    const off = catchUp(file, 3600 * 1000);
    expect(off.byTank).toHaveLength(2);
    expect(file.tanks![0].hours).toBeCloseTo(file.state.hours);
    expect(file.state.hours).toBeGreaterThan(startHours);
    const loaded = new Game(file.state, file.timeScale, file.tanks, file.active);
    expect(loaded.active).toBe(1);
    expect(loaded.tanks[1].economy).toBe(loaded.tanks[0].economy);
  });
});

describe('多缸的待辦', () => {
  it('其他缸有事會提醒一行，前面標缸名', async () => {
    const { householdTodos } = await import('../ui/status');
    const tanks = rich();
    const second = buyTank(tanks, 'std40')!;
    const f = addFish(second, 'guppy', { carriesIch: false, carries: [] });
    f.alive = false;
    const list = householdTodos(tanks, 0);
    expect(list.some((t) => t.text.startsWith('第 2 缸：撈出 1 條死魚'))).toBe(true);
  });
});
