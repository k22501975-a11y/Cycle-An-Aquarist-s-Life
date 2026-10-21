import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, buyTank, checkGoals, economy, fastestColoring, GENERIC_STEP, GOALS, goalState, LIGHTS, nextStep, PURPOSE_GOAL_COUNT, RAISE_STUCK_HOURS, noteBellySeen, setTankPurpose, showingMother, simulate } from '.';

describe('主畫面的下一步（U1）', () => {
  it('每個目標都說得出下一步，句子短', () => {
    const s = newGameState(1);
    const g = goalState([s]);
    for (const goal of GOALS) {
      // 第二缸的用途目標要選了用途才出（下面另外測）
      if (goal.hidden?.([s])) continue;
      const step = nextStep([s]);
      expect(step?.goal).toBe(goal.id);
      expect(step!.text.length).toBeLessThanOrEqual(24);
      // 每個目標都有自己的一句，沒有掉到保底
      expect(step!.text).not.toBe(GENERIC_STEP);
      g.done.push(goal.id);
    }
    expect(nextStep([s])).toBeNull();
  });

  it('還在養水時不只叫玩家等：母魚看得出懷孕就去看她，沒有就造景（g13 門檻 3）', () => {
    const s = newGameState(1);
    const mom = addFish(s, 'guppy', { sex: 'female' });
    mom.ageDays = 120;
    mom.pregnancy = 0.3;
    expect(nextStep([s])).toMatchObject({ goal: 'cycled', target: 'scape' });
    mom.pregnancy = 0.6;
    expect(nextStep([s])).toMatchObject({ goal: 'cycled', text: '母魚懷孕了，點她看看肚子', target: 'mother' });
    mom.pregnancy = 0.95;
    expect(nextStep([s])).toMatchObject({ goal: 'cycled', text: '母魚快生了，買個育幼盒', target: 'nursery' });
  });

  it('點開母魚看過肚子，下一步換成倒數，不會一直叫你再點她（體驗第 14 輪 #282）', () => {
    const s = newGameState(1);
    const mom = addFish(s, 'guppy', { sex: 'female' });
    mom.ageDays = 120;
    mom.pregnancy = 0.6;
    expect(nextStep([s])?.text).toBe('母魚懷孕了，點她看看肚子');
    noteBellySeen(mom);
    // 25°C、懷孕 28 天：還差 0.4 約 11 天
    expect(nextStep([s])).toMatchObject({ text: '她大約 11 天後生，快生了會提醒你', target: 'mother' });
    // 老闆送過育幼盒、這缸又沒有盒子：叫你先備好
    economy(s).nurseryGifted = true;
    expect(nextStep([s])).toMatchObject({ text: '她大約 11 天後生，先備好育幼盒', target: 'nursery' });
    // 生完了，下一胎要重新看
    mom.pregnancy = 0.999;
    simulate(s, 2);
    expect(mom.bellySeen).toBeUndefined();
  });

  it('有魚看得出生病：不管是哪個目標，下一步先叫你下藥（體驗第 15 輪 #291）', () => {
    const s = newGameState(1);
    const mom = addFish(s, 'guppy', { sex: 'female' });
    mom.ageDays = 120;
    mom.pregnancy = 0.6;
    noteBellySeen(mom);
    expect(nextStep([s])).toMatchObject({ goal: 'cycled', target: 'mother' });
    const male = addFish(s, 'guppy', { sex: 'male' });
    male.ich.stage = 'visible';
    expect(nextStep([s])).toMatchObject({ goal: 'cycled', text: '有魚生病了，去下藥', target: 'treat' });
    male.ich.stage = 'none';
    expect(nextStep([s])).toMatchObject({ target: 'mother' });
  });

  it('懷孕的母魚在別缸也找得到，帶去看她要先切缸', () => {
    const s = newGameState(1);
    const other = newGameState(2);
    const shrimp = addFish(other, 'cherry_shrimp', { sex: 'female' });
    shrimp.pregnancy = 0.9;
    expect(showingMother([s, other])).toBeNull();
    const mom = addFish(other, 'guppy', { sex: 'female' });
    mom.ageDays = 120;
    mom.pregnancy = 0.6;
    expect(showingMother([s, other])).toEqual({ tank: 1, fish: mom });
    expect(nextStep([s, other])).toMatchObject({ target: 'mother' });
  });

  it('跟著缸裡的狀況變：母魚快生了、錢夠不夠買第二缸', () => {
    const s = newGameState(1);
    expect(nextStep([s])).toMatchObject({ goal: 'cycled', target: 'scape' });
    goalState([s]).done.push('cycled');
    expect(nextStep([s])).toMatchObject({ goal: 'protect_fry', target: 'feed' });
    const mom = addFish(s, 'guppy', { sex: 'female' });
    mom.ageDays = 120;
    mom.pregnancy = 0.95;
    expect(nextStep([s])).toMatchObject({ text: '母魚快生了，買個育幼盒', target: 'nursery' });
    s.nurseryBox = true;
    expect(nextStep([s])?.text).toBe('母魚快生了，放進育幼盒');

    goalState([s]).done.push('protect_fry', 'raise5', 'sale');
    economy(s).coins = 0;
    expect(nextStep([s])?.text).toMatch(/^再存 \d+ 魚幣/);
    economy(s).coins = 99999;
    expect(nextStep([s])).toMatchObject({ target: 'shop_tank' });
  });

  it('第二缸的用途目標（G4）：繁殖缸叫你把小魚搬過去；展示缸先換水草燈再種陽性草', () => {
    const tanks = [newGameState(1)];
    economy(tanks[0]).coins = 99_999;
    buyTank(tanks, 'std40');
    const g = goalState(tanks);
    g.done.push(...GOALS.map((x) => x.id).filter((id) => id !== 'breeding_tank' && id !== 'display_tank'));
    expect(nextStep(tanks)).toBeNull();
    setTankPurpose(tanks[1], 'breeding');
    expect(nextStep(tanks)).toMatchObject({ goal: 'breeding_tank', target: 'shop_tank', text: `小魚搬去繁殖缸養大（0/${PURPOSE_GOAL_COUNT.breeding}）` });
    setTankPurpose(tanks[1], 'display');
    expect(nextStep(tanks)).toMatchObject({ goal: 'display_tank', target: 'shop_gear' });
    tanks[1].equipment.light = { spec: LIGHTS.planted, startHour: 10, photoperiodHours: 8 };
    expect(nextStep(tanks)).toMatchObject({ goal: 'display_tank', target: 'shop_plants', text: `展示缸種陽性草（0/${PURPOSE_GOAL_COUNT.display}）` });
  });
});

describe('「養大 5 條」卡超過 3 天（#258）', () => {
  function stuck() {
    const s = newGameState(1);
    goalState([s]).done.push('cycled', 'protect_fry');
    const fry = addFish(s, 'guppy', { sex: 'male' });
    fry.generation = 1;
    fry.lengthCm = 0.8;
    checkGoals([s], false);
    return { s, fry };
  }

  it('3 天內照舊；之後說最快轉色那尾還差幾天，點了開她的卡', () => {
    const { s, fry } = stuck();
    expect(nextStep([s])?.target).toBe('feed');
    s.hours += RAISE_STUCK_HOURS + 1;
    const step = nextStep([s]);
    expect(step).toMatchObject({ goal: 'raise5', target: 'fastest' });
    expect(step!.text).toMatch(/^最快轉色的那尾，還差約 \d+ 天$/);
    expect(fastestColoring([s])?.fish).toBe(fry);
  });

  it('主缸小魚最近有被吃：叫玩家撈進育幼盒', () => {
    const { s } = stuck();
    s.hours += RAISE_STUCK_HOURS + 1;
    s.events.push({ hours: s.hours - 10, type: 'fry_eaten', count: 2 });
    expect(nextStep([s])).toMatchObject({ text: '小魚在主缸會被吃，撈進育幼盒', target: 'fry_box' });
  });
});
