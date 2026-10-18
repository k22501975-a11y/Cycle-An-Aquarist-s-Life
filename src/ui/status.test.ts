import { describe, expect, it } from 'vitest';
import { addFish, createTank, FILTERS, HEATERS, TANKS, tankSize, useTestKit, waterChange } from '../sim';
import { clockLabel, todos, waterCapsules } from './status';

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
    expect(todos(state)[0]).toEqual({ text: '撈出 1 條死魚', tone: 'bad' });
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
