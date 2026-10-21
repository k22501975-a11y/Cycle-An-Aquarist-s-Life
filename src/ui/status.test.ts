import { describe, expect, it } from 'vitest';
import { addFish, createTank, FILTERS, HEATERS, TANKS, tankSize, useTestKit, waterChange } from '../sim';
import { clockLabel, householdTodos, todos, waterCapsules, waterSummary } from './status';

function tank() {
  return createTank({ tank: TANKS.std40, filter: FILTERS.sponge, heater: { spec: HEATERS.h50, targetC: 25 }, seed: 3 });
}

describe('waterCapsules', () => {
  it('沒測過時只看得到溫度，其他顯示 ?', () => {
    const caps = waterCapsules(tank());
    expect(caps[0].label).toBe('溫度');
    expect(caps.slice(1).every((c) => c.value === '?' && c.tone === 'unknown')).toBe(true);
  });

  it('測過後顯示讀數，一天後變淡，三天後又變回 ?', () => {
    const state = tank();
    useTestKit(state);
    expect(waterCapsules(state)[1].value).not.toBe('?');
    expect(waterCapsules(state)[1].stale).toBe(false);
    state.hours += 30;
    expect(waterCapsules(state)[1].stale).toBe(true);
    expect(waterCapsules(state)[1].tone).toBe('unknown');
    state.hours += 50;
    expect(waterCapsules(state)[1].value).toBe('?');
  });
});

describe('clockLabel', () => {
  it('第一天是第 1 週週一', () => {
    expect(clockLabel(13)).toBe('第 1 週・週一 13:00');
    expect(clockLabel(24 * 8 + 14.5)).toBe('第 2 週・週二 14:30');
  });
});

describe('todos', () => {
  it('空缸提示去商店', () => {
    expect(todos(tank())[0].text).toContain('商店');
  });

  it('有魚沒測水、太久沒換水會提醒，換水後消失', () => {
    const state = tank();
    addFish(state, 'guppy');
    state.hours = 24 * 8;
    const texts = todos(state).map((t) => t.text);
    expect(texts).toContain('還沒測過水質');
    expect(texts.some((t) => t.startsWith('該換水了'))).toBe(true);
    waterChange(state, 0.3);
    expect(state.lastWaterChangeHours).toBe(state.hours);
    expect(todos(state).some((t) => t.text.startsWith('該換水了'))).toBe(false);
  });

  it('死魚排在最前面', () => {
    const state = tank();
    addFish(state, 'guppy');
    addFish(state, 'guppy').alive = false;
    expect(todos(state)[0]).toEqual({ text: '撈出 1 條死魚', tone: 'bad', go: 'remove_dead' });
  });

  it('要處理的待辦都點得進去（U3）：撈死魚、測水、換水、加熱棒各自帶去對的地方', () => {
    const state = tank();
    addFish(state, 'guppy');
    state.hours = 24 * 8;
    state.equipment.heater!.broken = true;
    const go = Object.fromEntries(todos(state).map((t) => [t.text, t.go]));
    expect(go['還沒測過水質']).toBe('test_water');
    expect(Object.entries(go).find(([t]) => t.startsWith('該換水了'))?.[1]).toBe('water_change');
    expect(go['加熱棒壞了，換一支']).toBe('equipment');
    // 紅色、黃色的待辦全部都有去處
    expect(todos(state).filter((t) => t.tone !== 'ok').every((t) => t.go || t.split || t.snails || t.nursery)).toBe(true);
  });
});

describe('householdTodos', () => {
  it('別缸的待辦點了先切到那缸：不帶育幼盒、分缸、螺這些直接作用在目前這缸的按鈕', () => {
    const a = tank();
    const b = tank();
    addFish(a, 'guppy');
    addFish(b, 'guppy').alive = false;
    const other = householdTodos([a, b], 0).find((t) => t.tank === 1);
    expect(other?.go).toBe('remove_dead');
    expect(other?.nursery ?? other?.split ?? other?.snails).toBeUndefined();
  });
});

describe('tankSize', () => {
  it('已知缸用實際尺寸，自訂缸依水量估算', () => {
    expect(tankSize(TANKS.std90)).toEqual({ w: 60, h: 38, d: 40 });
    const est = tankSize({ ...TANKS.std40, id: 'custom', sizeCm: undefined, volumeL: 120 });
    expect(est.w * est.h * est.d).toBeGreaterThan(100_000);
    expect(est.w * est.h * est.d).toBeLessThan(140_000);
  });
});

describe('waterSummary', () => {
  const cap = (tone: 'ok' | 'warn' | 'bad' | 'unknown') => ({ label: 'x', value: '1', tone, stale: false, title: '' });
  it('看最糟的一項', () => {
    expect(waterSummary([cap('ok'), cap('warn'), cap('bad')])).toEqual({ tone: 'bad', value: '危險' });
    expect(waterSummary([cap('ok'), cap('warn'), cap('unknown')])).toEqual({ tone: 'warn', value: '注意' });
  });
  it('有一項沒測就不說正常', () => {
    expect(waterSummary([cap('ok'), cap('unknown')])).toEqual({ tone: 'unknown', value: '待測' });
    expect(waterSummary([cap('ok'), cap('ok')])).toEqual({ tone: 'ok', value: '正常' });
  });
});
