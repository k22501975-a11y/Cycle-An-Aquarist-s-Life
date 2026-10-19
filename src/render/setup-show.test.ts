import { describe, expect, it } from 'vitest';
import { SETUP_ORDER, SetupShow, STEP_SECONDS } from './setup-show';

/** 照推薦玩：等玩家 wait 秒才動手，每步動手後一直等到演完（注水一路按住）。回傳每段不能操作的最長秒數和總秒數。 */
function play(show: SetupShow, wait = 1): { longestLocked: number; total: number } {
  let total = 0;
  let longestLocked = 0;
  while (show.step !== 'done') {
    total += wait;
    show.press();
    let locked = 0;
    const step = show.step;
    while (show.step === step) {
      show.update(0.05);
      locked += 0.05;
      total += 0.05;
    }
    show.release();
    if (step !== 'water') longestLocked = Math.max(longestLocked, locked);
  }
  return { longestLocked, total };
}

describe('開缸 4 步（mvp.md §4.4.4）', () => {
  it('依序倒沙、裝設備、注水、開機，每步都等玩家動手', () => {
    const show = new SetupShow();
    const done: string[] = [];
    for (const step of SETUP_ORDER) {
      expect(show.step).toBe(step);
      expect(show.waiting).toBe(true);
      // 不動手就不會往前
      for (let i = 0; i < 100; i++) expect(show.update(0.1)).toBeNull();
      show.press();
      expect(show.waiting).toBe(false);
      let f: string | null = null;
      while (!f) f = show.update(0.05);
      done.push(f);
    }
    expect(done).toEqual(['sand', 'gear', 'water', 'power']);
    expect(show.step).toBe('done');
  });

  it('每步演出不超過 5 秒，照推薦玩整段 45 秒內', () => {
    for (const s of SETUP_ORDER) expect(STEP_SECONDS[s]).toBeLessThanOrEqual(5);
    const { longestLocked, total } = play(new SetupShow(), 2);
    expect(longestLocked).toBeLessThanOrEqual(5);
    expect(total).toBeLessThan(45);
  });

  it('演出中再點一下直接跳到這步結尾', () => {
    const show = new SetupShow();
    show.press();
    show.update(0.1);
    show.press();
    expect(show.update(0.01)).toBe('sand');
    expect(show.step).toBe('gear');
  });

  it('注水要按住：放開就停，再按接著灌', () => {
    const s = new SetupShow();
    for (const step of ['sand', 'gear'] as const) {
      s.press();
      s.progress[step] = 1;
      s.update(0);
    }
    expect(s.step).toBe('water');
    s.press();
    s.update(1);
    s.release();
    const level = s.look().water;
    expect(level).toBeGreaterThan(0);
    s.update(2);
    expect(s.look().water).toBe(level);
    expect(s.waiting).toBe(true);
    s.press();
    s.update(STEP_SECONDS.water);
    expect(s.step).toBe('power');
  });

  it('一開始是空缸；注水時變濁，開機後燈亮、水變清', () => {
    const show = new SetupShow();
    const start = show.look();
    expect([start.sand, start.water, start.gear, start.light]).toEqual([0, 0, 0, 0]);
    for (const step of ['sand', 'gear', 'water'] as const) {
      show.press();
      while (show.step === step) show.update(0.05);
    }
    expect(show.look().milk).toBeGreaterThan(0.5);
    show.press();
    while (show.step === 'power') show.update(0.05);
    const end = show.look();
    expect(end.sand).toBe(1);
    expect(end.water).toBe(1);
    expect(end.milk).toBeLessThan(0.01);
    expect(end.gear).toBe(1);
    expect(end.light).toBe(1);
  });
});
