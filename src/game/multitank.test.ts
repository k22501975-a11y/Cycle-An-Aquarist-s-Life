import { describe, expect, it } from 'vitest';
import {
  addFish,
  buyTank,
  buyTankRefusal,
  economy,
  FREE_SLOTS,
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
    expect(second.bacteria.aob).toBeLessThan(0.01);
    expect(tanks.length).toBe(FREE_SLOTS);
    expect(newTankCost(tanks, 'nano20')).toBe(tankSetPrice('nano20') + RACK_PRICE);
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
    expect(buyTankRefusal(poor, 'std90')).toBe('錢不夠');
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
