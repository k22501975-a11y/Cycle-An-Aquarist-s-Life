import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, buyQuarantine, buyTank, economy, maxLengthCm, moveToQuarantine } from './index';
import { CALM_DAYS, checkGoals, goalState, isUnlocked, nextGoals, speciesUnlocked, unlockHint } from './goals';
import type { TankState } from './state';

const calmFish = { carriesIch: false, carries: [] };

/** 自己繁殖的小魚（第 1 代），長到最大體長的 frac。 */
function bredFish(s: TankState, frac: number) {
  const f = addFish(s, 'guppy', calmFish);
  f.generation = 1;
  f.lengthCm = maxLengthCm(f) * frac;
  return f;
}

describe('新手之後的目標（M19）', () => {
  it('一開始是「第一桶金」：先保護小魚、養大 5 條；鬥魚和水晶蝦還沒開賣', () => {
    const tanks = [newGameState(1)];
    expect(nextGoals(tanks).map((g) => g.id)).toEqual(['protect_fry', 'raise5']);
    expect(speciesUnlocked(tanks, 'guppy')).toBe(true);
    expect(speciesUnlocked(tanks, 'betta')).toBe(false);
    expect(speciesUnlocked(tanks, 'crystal_shrimp')).toBe(false);
    expect(unlockHint('betta')).toContain('第二個缸');
  });

  it('教學還沒做完不發獎勵；做完才完成、給魚幣', () => {
    const tanks = [newGameState(1)];
    bredFish(tanks[0], 0.5);
    expect(checkGoals(tanks, false)).toEqual([]);
    const before = economy(tanks[0]).coins;
    expect(checkGoals(tanks, true).map((g) => g.id)).toEqual(['protect_fry']);
    expect(economy(tanks[0]).coins).toBe(before + 50);
    // 同一個目標不會再發一次
    expect(checkGoals(tanks, true)).toEqual([]);
  });

  it('養在產卵盒裡的小魚也算；5 條長到轉色期解鎖挑選說明', () => {
    const tanks = [newGameState(1)];
    economy(tanks[0]).coins = 10_000;
    buyQuarantine(tanks[0]);
    for (let i = 0; i < 5; i++) moveToQuarantine(tanks[0], bredFish(tanks[0], 0.65).id);
    expect(tanks[0].quarantine!.fish).toHaveLength(5);
    const done = checkGoals(tanks).map((g) => g.id);
    expect(done).toContain('raise5');
    expect(isUnlocked(tanks, 'selection')).toBe(true);
  });

  it('買第二個缸：店裡開始賣鬥魚', () => {
    const tanks = [newGameState(1)];
    economy(tanks[0]).coins = 10_000;
    buyTank(tanks, 'nano20');
    expect(checkGoals(tanks).map((g) => g.id)).toContain('second_tank');
    expect(speciesUnlocked(tanks, 'betta')).toBe(true);
  });

  it('舊存檔已經養了鬥魚，直接算解鎖，不會被鎖回去', () => {
    const s = newGameState(1);
    addFish(s, 'betta', calmFish);
    expect(speciesUnlocked([s], 'betta')).toBe(true);
  });

  it(`缸裡有魚、${CALM_DAYS} 天都沒警告才算穩定；有氨就重算`, () => {
    const s = newGameState(1);
    s.bacteria.aob = s.bacteria.nob = 1;
    addFish(s, 'guppy', calmFish);
    const tanks = [s];
    checkGoals(tanks);
    s.hours += 10 * 24;
    s.water.tan = 1;
    checkGoals(tanks);
    s.water.tan = 0;
    s.hours += (CALM_DAYS - 1) * 24;
    checkGoals(tanks);
    expect(goalState(tanks).done).not.toContain('calm');
    s.hours += 2 * 24;
    checkGoals(tanks);
    expect(goalState(tanks).done).toContain('calm');
    expect(isUnlocked(tanks, 'std90')).toBe(true);
  });

  it('治好病：上次看到在發病、現在好了', () => {
    const s = newGameState(1);
    const f = addFish(s, 'guppy', calmFish);
    f.ich = { stage: 'visible', progress: 0.5 };
    checkGoals([s]);
    f.ich = { stage: 'none', progress: 0 };
    checkGoals([s]);
    expect(goalState([s]).done).toContain('cure');
  });
});
