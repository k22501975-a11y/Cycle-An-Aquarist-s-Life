import { afterEach, describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, bacteriaCapacity, ID_BLOCK, moveSoonToNursery, nurseryFish, buyPlant, buyTank, fulfillOrder, orderBoard, updateOrders, checkGoals, economy, fastestColoring, GENERIC_STEP, GOALS, goalState, LIGHTS, nextGoals, nextStep, PURPOSE_GOAL_COUNT, RAISE_STUCK_HOURS, STALE_STEP_HOURS, NURSERY_FRY_CAPACITY, newTankCost, noteBellySeen, PICK_AFTER_BROOD_DAYS, setTankPurpose, showingMother, setBreedingStep, simulate } from '.';
import { breedingStep, choiceState } from './choices';

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

  it('看過肚子、還沒交過單：下一步先叫你交起步單的 2 隻小螺（polish-to-9.md §7.2），交完才倒數', () => {
    const s = newGameState(1);
    const mom = addFish(s, 'guppy', { sex: 'female' });
    mom.ageDays = 120;
    mom.pregnancy = 0.9;
    buyPlant(s, 'anubias');
    updateOrders(s);
    expect(nextStep([s])?.text).toBe('母魚懷孕了，點她看看肚子');
    noteBellySeen(mom);
    expect(nextStep([s])).toMatchObject({ goal: 'cycled', text: '阿德有一張起步單：交 2 隻小螺', target: 'orders' });
    const o = orderBoard(s).orders.find((x) => x.kind === 'snail')!;
    expect(fulfillOrder([s], o.id)).toBeGreaterThan(0);
    expect(nextStep([s])?.text).toMatch(/^她大約 \d+ 天後生/);
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
    // 盒子空著：直接叫你把她放進去（polish-to-9.md §9.1）
    expect(nextStep([s])).toMatchObject({ text: `育幼盒空了，把快生的孔雀魚母魚 #${mom.id % ID_BLOCK} 放進去`, target: 'nursery_soon', tank: 0 });
    mom.pregnancy = 0;

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

describe('要玩家動手的同一句停太久（#434）', () => {
  it('玩家一直沒買水草燈：3 天後跟其他目標的下一步輪流出現，原句還在、換了就重算', () => {
    const tanks = [newGameState(1)];
    economy(tanks[0]).coins = 99_999;
    buyTank(tanks, 'std40');
    const g = goalState(tanks);
    g.done.push(...GOALS.map((x) => x.id).filter((id) => !['display_tank', 'strain', 'cure', 'calm'].includes(id)));
    setTankPurpose(tanks[1], 'display');
    const base = nextStep(tanks)!;
    expect(base).toMatchObject({ goal: 'display_tank', text: '展示缸換上水草燈', target: 'shop_gear' });
    const others = nextGoals(tanks, 4).slice(1);
    expect(others.length).toBeGreaterThan(0);
    for (const t of tanks) t.hours += STALE_STEP_HOURS - 1;
    expect(nextStep(tanks)?.text).toBe(base.text);
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      for (const t of tanks) t.hours += 12;
      const step = nextStep(tanks)!;
      expect(step.goal).toBe('display_tank');
      seen.add(step.text);
    }
    expect([...seen]).toContain(base.text);
    expect(seen.size).toBeGreaterThan(1);
    expect([...seen]).toContain('挑漂亮的公母配對留種');
    // 買了水草燈：換句，重新算，不輪播
    tanks[1].equipment.light = { spec: LIGHTS.planted, startHour: 10, photoperiodHours: 8 };
    expect(nextStep(tanks)).toMatchObject({ target: 'shop_plants', text: `展示缸種陽性草（0/${PURPOSE_GOAL_COUNT.display}）` });
  });

  it('沒有其他目標可說：照原句', () => {
    const tanks = [newGameState(1)];
    economy(tanks[0]).coins = 99_999;
    buyTank(tanks, 'std40');
    goalState(tanks).done.push(...GOALS.map((x) => x.id).filter((id) => id !== 'display_tank'));
    setTankPurpose(tanks[1], 'display');
    const base = nextStep(tanks)!;
    for (let i = 0; i < 10; i++) {
      for (const t of tanks) t.hours += 12;
      expect(nextStep(tanks)?.text).toBe(base.text);
    }
  });
});

describe('「養大 5 條」卡超過 3 天（#258）', () => {
  function stuck() {
    const s = newGameState(1);
    // 第二缸另外測（錢夠時下一步先說去買）
    goalState([s]).done.push('cycled', 'protect_fry', 'second_tank');
    const fry = addFish(s, 'guppy', { sex: 'male' });
    fry.generation = 1;
    fry.lengthCm = 0.8;
    checkGoals([s], false);
    return { s, fry };
  }

  it('第一窩出生後就出「存錢買第二缸」：錢不夠時下一步照舊顧小魚，錢夠了叫你去買（#305）', () => {
    const s = newGameState(1);
    goalState([s]).done.push('cycled');
    expect(nextGoals([s]).map((g) => g.id)).toEqual(['protect_fry', 'raise5']);
    const fry = addFish(s, 'guppy', { sex: 'male' });
    fry.generation = 1;
    fry.lengthCm = 0.8;
    expect(nextGoals([s]).map((g) => g.id)).toEqual(['protect_fry', 'second_tank']);
    goalState([s]).done.push('protect_fry');
    economy(s).coins = 100;
    expect(nextStep([s])).toMatchObject({ goal: 'second_tank', text: '第一窩再 12 天看得出公母' });
    economy(s).coins = 99_999;
    expect(nextStep([s])).toMatchObject({ goal: 'second_tank', text: '錢夠了，去買第二個缸', target: 'shop_tank' });
  });

  it('3 天內說選育走到哪（餓了才叫你餵）；之後說最快轉色那尾還差幾天，點了開她的卡', () => {
    const { s, fry } = stuck();
    expect(nextStep([s])).toMatchObject({ text: '第一窩再 12 天看得出公母', target: 'fastest' });
    fry.hunger = 0.9;
    expect(nextStep([s])?.target).toBe('feed');
    fry.hunger = 0.2;
    s.hours += RAISE_STUCK_HOURS + 1;
    const step = nextStep([s]);
    expect(step).toMatchObject({ goal: 'raise5', target: 'fastest' });
    expect(step!.text).toMatch(/^養到轉色 \d\/5，最快的那尾還差約 \d+ 天$/);
    expect(fastestColoring([s])?.fish).toBe(fry);
  });

  describe('選育那一行還沒載好（choices.ts 跟早上報告一起延後載入，#333）', () => {
    afterEach(() => setBreedingStep(breedingStep));

    it('先照舊說餵小魚，載好後就說選育走到哪', () => {
      const { s } = stuck();
      setBreedingStep(() => null);
      expect(nextStep([s])).toMatchObject({ goal: 'raise5', target: 'feed', text: '小魚一天餵兩次，養到轉色（0/5）' });
      setBreedingStep(breedingStep);
      expect(nextStep([s])).toMatchObject({ text: '第一窩再 12 天看得出公母', target: 'fastest' });
    });
  });

  it('主缸小魚最近有被吃：叫玩家撈進育幼盒', () => {
    const { s } = stuck();
    s.hours += RAISE_STUCK_HOURS + 1;
    s.events.push({ hours: s.hours - 10, type: 'fry_eaten', count: 2 });
    expect(nextStep([s])).toMatchObject({ text: '小魚在主缸會被吃，撈進育幼盒', target: 'fry_box' });
  });

  it('第二缸養好水、主缸小魚會被吃：不管哪個目標，先叫你把小魚搬過去（g36 #425）', () => {
    const s = newGameState(1);
    goalState([s]).done.push('cycled');
    s.nurseryBox = true;
    for (let i = 0; i < NURSERY_FRY_CAPACITY + 1; i++) {
      const f = addFish(s, 'guppy', {});
      Object.assign(f, { lengthCm: 0.8, ageDays: 3, generation: 1, bornHours: s.hours - 72, nursery: i < NURSERY_FRY_CAPACITY || undefined });
    }
    const tanks = [s];
    economy(s).coins = newTankCost(tanks, 'nano20');
    const t2 = buyTank(tanks, 'nano20')!;
    // 還沒養水：先叫你養水（g37 #428），點了打開「新缸要怎麼養水？」
    expect(nextStep(tanks)).toMatchObject({ text: '第 2 缸先養水，小魚才搬得過去', target: 'cycle_tank', tank: 1 });
    // 分過濾材、還在養：說等就好
    t2.bacteria.aob = t2.bacteria.nob = bacteriaCapacity(t2) / 4;
    t2.water.tan = 0.5;
    expect(nextStep(tanks)).toMatchObject({ text: '第 2 缸在養水，養好就能把小魚搬過去', target: 'test', tank: 1 });
    t2.water.tan = 0;
    t2.bacteria.aob = t2.bacteria.nob = bacteriaCapacity(t2);
    expect(nextStep(tanks)).toMatchObject({ text: '第 2 缸養好水了，把小魚搬過去', target: 'move_fry', tank: 0 });
  });

  it('只有一缸、育幼盒滿了、小魚還在被吃、錢夠：馬上叫你買第二缸（g35，polish-to-9.md §8.2）', () => {
    const s = newGameState(1);
    goalState([s]).done.push('cycled');
    s.nurseryBox = true;
    const fry = () => {
      const f = addFish(s, 'guppy', {});
      f.lengthCm = 0.8;
      f.ageDays = 3;
      f.generation = 1;
      f.bornHours = s.hours - 72;
      return f;
    };
    for (let i = 0; i < NURSERY_FRY_CAPACITY; i++) fry().nursery = true;
    fry();
    economy(s).coins = newTankCost([s], 'nano20') - 1;
    expect(nextStep([s])).toMatchObject({ goal: 'protect_fry', target: 'feed' });
    // 錢夠就叫買，不用等小魚真的被吃（g37 #428：等到被吃才叫，已經來不及）
    economy(s).coins = newTankCost([s], 'nano20');
    expect(nextStep([s])).toMatchObject({ goal: 'protect_fry', text: '育幼盒滿了，小魚會被吃。買第二個缸給小魚住', target: 'shop_tank' });
    // 錢不夠：照原本的
    economy(s).coins = newTankCost([s], 'nano20') - 1;
    expect(nextStep([s])).toMatchObject({ target: 'feed' });
  });

  it('C1 選了躲草：3 天內不叫買缸搬小魚，被吃到剩一半或過了 3 天才叫（polish-to-9.md §10.1）', () => {
    const s = newGameState(1);
    goalState([s]).done.push('cycled');
    s.nurseryBox = true;
    const fry = () => {
      const f = addFish(s, 'guppy', {});
      f.lengthCm = 0.8;
      f.ageDays = 3;
      f.generation = 1;
      f.bornHours = s.hours - 72;
      return f;
    };
    for (let i = 0; i < NURSERY_FRY_CAPACITY; i++) fry().nursery = true;
    const out = Array.from({ length: 6 }, fry);
    economy(s).coins = newTankCost([s], 'nano20');
    choiceState([s]).hide = { at: s.hours, ids: out.map((f) => f.id) };
    expect(nextStep([s])).toMatchObject({ goal: 'protect_fry', target: 'feed' });
    for (const f of out.slice(0, 3)) f.alive = false;
    expect(nextStep([s])).toMatchObject({ target: 'shop_tank' });
    out[0].alive = true;
    expect(nextStep([s])).toMatchObject({ target: 'feed' });
    choiceState([s]).hide!.at -= 3 * 24;
    expect(nextStep([s])).toMatchObject({ target: 'shop_tank' });
  });

  it('第一窩「再幾天看得出公母」照選種日算，跟早上報告同一個數字；過了選種日就不說（g37）', () => {
    const s = newGameState(1);
    goalState([s]).done.push('cycled');
    s.nurseryBox = true;
    const f = addFish(s, 'guppy', {});
    Object.assign(f, { lengthCm: 0.8, ageDays: 3, generation: 1, nursery: true, bornHours: s.hours - 72 });
    choiceState([s]).firstBrood = f.bornHours;
    nextStep([s]);
    const lines: Array<{ text: string; left: number }> = [];
    for (let i = 0; i < 40; i++) {
      s.hours += 6;
      lines.push({ text: nextStep([s])!.text, left: Math.ceil(PICK_AFTER_BROOD_DAYS - (s.hours - f.bornHours!) / 24) });
    }
    const sex = lines.filter((l) => l.text.includes('看得出公母'));
    expect(sex.length).toBeGreaterThan(0);
    for (const l of sex) {
      expect(l.left).toBeGreaterThan(0);
      expect(l.text).toBe(`最大的那尾 0.8 cm 了，再 ${l.left} 天看得出公母`);
    }
  });

  it('等著的同一句停超過 3 天：輪流說小魚的進度，原句換了就重算（polish-to-9.md §8.2）', () => {
    const s = newGameState(1);
    goalState([s]).done.push('cycled');
    s.nurseryBox = true;
    const f = addFish(s, 'guppy', {});
    f.lengthCm = 0.8;
    f.ageDays = 3;
    f.generation = 1;
    f.nursery = true;
    const base = nextStep([s])!;
    expect(base).toMatchObject({ goal: 'protect_fry', text: '小魚還小，一天餵兩次' });
    s.hours += STALE_STEP_HOURS - 1;
    expect(nextStep([s])?.text).toBe(base.text);
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      s.hours += 12;
      seen.add(nextStep([s])!.text);
    }
    expect([...seen]).toContain(base.text);
    expect([...seen].some((t) => /^最大的那尾 0\.8 cm 了，再 \d+ 天看得出公母$/.test(t))).toBe(true);
    expect([...seen]).toContain('育幼盒裡 1 尾，今天被吃 0 尾');
    // 要玩家動手的句子不輪播
    f.health = 0.2;
    f.ich = { stage: 'visible', progress: 1, cause: 'new_fish' };
    expect(nextStep([s])?.target).toBe('treat');
  });

  it('育幼盒空了、母魚快生（懷孕 ≥ BOX_DUE 0.88，約剩 3 天）：任務卡叫你放進去，排在照顧句前面；盒裡還有小魚或還早就不叫（polish-to-9.md §9.1，g38）', () => {
    const s = newGameState(1);
    goalState([s]).done.push('cycled', 'protect_fry');
    s.nurseryBox = true;
    const mom = addFish(s, 'guppy', { sex: 'female' });
    mom.ageDays = 120;
    mom.pregnancy = 0.85;
    expect(nextStep([s])?.target).not.toBe('nursery_soon');
    mom.pregnancy = 0.9;
    expect(nextStep([s])).toMatchObject({ text: `育幼盒空了，把快生的孔雀魚母魚 #${mom.id % ID_BLOCK} 放進去`, target: 'nursery_soon', tank: 0 });
    // 盒裡還有小魚：她放進去會吃牠們，不叫（照 #430 叫買缸或搬小魚）
    const fry = addFish(s, 'guppy', {});
    Object.assign(fry, { lengthCm: 0.7, ageDays: 2, generation: 1, nursery: true, pregnancy: 0 });
    expect(nextStep([s])?.target).not.toBe('nursery_soon');
    fry.alive = false;
    // 點了就放進去，任務卡換掉
    expect(moveSoonToNursery(s)?.id).toBe(mom.id);
    expect(nurseryFish(s).map((f) => f.id)).toEqual([mom.id]);
    expect(nextStep([s])?.target).not.toBe('nursery_soon');
  });
});
