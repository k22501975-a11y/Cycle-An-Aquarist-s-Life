import { describe, expect, it } from 'vitest';
import {
  addFish,
  addPlant,
  compareOrders,
  createTank,
  economy,
  FILTERS,
  FISH_SPECIES,
  INCOME_GAP_DAYS,
  ORDER_EXPIRE_DAYS,
  HEATERS,
  LIGHTS,
  orderBoard,
  orderOutlook,
  outlookDaysLine,
  outlookFishLine,
  TANKS,
  type Fish,
  type ShopOrder,
  type TankState,
} from './index';

const tank = (seed = 3) => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, seed, matureMedia: true });

function bred(s: TankState, lengthCm: number, sex?: 'male' | 'female'): Fish {
  const f = addFish(s, 'guppy', { carriesIch: false, carries: [] });
  f.lengthCm = lengthCm;
  f.generation = 1;
  if (sex) f.sex = sex;
  return f;
}

const order = (id: number, o: Partial<ShopOrder>): ShopOrder => ({ id, kind: 'fish', species: 'guppy', count: 1, unitPrice: 45, postedHours: 0, ...o });

const adult = FISH_SPECIES.guppy.adultLengthCm;

describe('訂單比較（polish-to-9.md G5）', () => {
  it('板上只有一張單不比較', () => {
    const s = tank();
    orderBoard(s).orders = [order(1, { size: 'juvenile' })];
    expect(compareOrders([s])).toEqual([]);
  });

  it('兩張魚單：標出要用的魚、還要幾天，搶同一批魚的互相標出來', () => {
    const s = tank();
    s.fish = [];
    const a = bred(s, adult * 0.6);
    const b = bred(s, adult * 0.6);
    const small = bred(s, adult * 0.45);
    const juvenile = order(1, { size: 'juvenile', count: 3 });
    const grown = order(2, { size: 'adult', count: 1 });
    orderBoard(s).orders = [juvenile, grown];
    const [j, g] = compareOrders([s]);
    expect(j.have).toBe(2);
    expect(j.fish.map((f) => f.id).sort()).toEqual([a.id, b.id, small.id].sort());
    expect(j.fish.find((f) => f.id === small.id)!.days).toBe(j.days);
    expect(j.days).toBeGreaterThan(0);
    expect(outlookDaysLine(j, juvenile)).toBe(`再養約 ${j.days} 天`);
    expect(outlookFishLine([s], j, juvenile)).toBe('用3 尾（1 尾還在長）');
    // 成魚單：現在的中魚長到成魚要更久，用的也是同一批魚
    expect(g.have).toBe(0);
    expect(g.days).toBeGreaterThan(0);
    expect(j.sharesWith).toEqual([2]);
    expect(g.sharesWith).toEqual([1]);
    expect(j.coins).toBe(135);
  });

  it('越小的魚估得越久；湊不齊就估不出來', () => {
    const s = tank();
    s.fish = [];
    const near = bred(s, adult * 0.45);
    const far = bred(s, adult * 0.2);
    const o = order(1, { size: 'juvenile', count: 2 });
    const x = orderOutlook([s], o);
    const days = new Map(x.fish.map((f) => [f.id, f.days]));
    expect(days.get(near.id)!).toBeLessThan(days.get(far.id)!);
    const y = orderOutlook([s], { ...o, count: 3 });
    expect(y.days).toBeNull();
    expect(outlookDaysLine(y, { ...o, count: 3 })).toBe('缸裡還沒有養得成的魚');
  });

  it('只差大小才算：公母不合、店裡買來的、要留下來的都不算', () => {
    const s = tank();
    s.fish = [];
    const female = bred(s, adult * 0.3, 'female');
    const store = bred(s, adult * 0.3, 'male');
    store.generation = 0;
    const kept = bred(s, adult * 0.3, 'male');
    const o = order(1, { size: 'juvenile', sex: 'male' });
    expect(orderOutlook([s], o, [kept.id]).fish).toEqual([]);
    expect(orderOutlook([s], o).fish.map((f) => f.id)).toEqual([kept.id]);
    expect(female.alive).toBe(true);
  });

  it('從好幾缸湊魚時寫出缸名', () => {
    const a = tank();
    const b = tank(4);
    b.economy = economy(a);
    b.nextId = 10_000_001;
    a.fish = [];
    b.fish = [];
    bred(a, adult * 0.6);
    bred(b, adult * 0.6);
    bred(b, adult * 0.6);
    const o = order(1, { size: 'juvenile', count: 3 });
    const x = orderOutlook([a, b], o);
    expect(x.days).toBe(0);
    expect(outlookDaysLine(x, o)).toBe('現在就能交');
    expect(outlookFishLine([a, b], x, o)).toBe('用第 1 缸 1 尾＋第 2 缸 2 尾');
  });

  it('估的天數比單子剩下的久就標來不及；保底單、小孔雀單照各自的期限算', () => {
    const s = tank();
    s.fish = [];
    bred(s, adult * 0.3);
    s.hours = 100;
    const o = order(1, { size: 'juvenile', postedHours: s.hours });
    const x = orderOutlook([s], o);
    expect(x.daysLeft).toBe(ORDER_EXPIRE_DAYS);
    expect(x.days).toBeGreaterThan(ORDER_EXPIRE_DAYS);
    expect(x.late).toBe(true);
    expect(outlookDaysLine(x, o)).toBe(`來不及（要養約 ${x.days} 天，單子剩 ${ORDER_EXPIRE_DAYS} 天）`);
    // 掛了 3 天半的保底單只剩 2 天
    const gap = orderOutlook([s], { ...o, gap: true, postedHours: s.hours - 84 });
    expect(gap.daysLeft).toBe(INCOME_GAP_DAYS - 4);
    // 快長到的魚趕得上
    s.fish[0].lengthCm = adult * 0.49;
    const soon = orderOutlook([s], o);
    expect(soon.late).toBe(false);
    expect(outlookDaysLine(soon, o)).toBe(`再養約 ${soon.days} 天`);
  });

  it('插枝單：手上不夠但修剪一下就夠，寫「修剪一下就能交」；不夠剪寫等水草長', () => {
    const s = tank(5);
    s.fish = [];
    addPlant(s, 'rotala', 14);
    const o: ShopOrder = { id: 1, kind: 'cutting', plant: 'rotala', count: 1, unitPrice: 20, postedHours: 0 };
    const x = orderOutlook([s], o);
    expect(x.trim).toBe(true);
    expect(outlookDaysLine(x, o)).toBe('修剪一下就能交');
    expect(outlookFishLine([s], x, o)).toBeNull();
    const big = orderOutlook([s], { ...o, count: 99 });
    expect(big.days).toBeNull();
    expect(outlookDaysLine(big, o)).toBe('等水草長高再剪');
  });
});
