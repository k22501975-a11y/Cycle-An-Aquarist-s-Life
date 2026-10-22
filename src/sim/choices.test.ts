import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import {
  addFish,
  CROWD_WARN,
  crowdingRatio,
  bacteriaCapacity,
  buyTank,
  setTankPurpose,
  breedingProgress,
  chooseOption,
  choiceState,
  cross,
  DREAM_FISH,
  dreamChance,
  economy,
  grandDreamChance,
  linkTanks,
  matchingFish,
  orderBoard,
  orderSupply,
  PICK_AFTER_BROOD_DAYS,
  reservedForPick,
  suggestPurpose,
  takeChoice,
  TANK_AFTER_BROOD_DAYS,
  type ShopOrder,
  type TankState,
} from './index';

const calm = { carriesIch: false, carries: [] };

/** 一缸店裡的夢想魚配對（紅蛇王公魚、全紅白子母魚），加上第一窩 n 尾（hoursAgo 前出生）。 */
function withBrood(n: number, hoursAgo: number) {
  const s = newGameState(7);
  const tanks = [s];
  linkTanks(tanks);
  const dad = addFish(s, 'guppy', { ...calm, sex: 'male', strain: DREAM_FISH.parents.male, pregnant: false });
  const mom = addFish(s, 'guppy', { ...calm, sex: 'female', strain: DREAM_FISH.parents.female, pregnant: false });
  const rng = { seed: 5 };
  const kids = Array.from({ length: n }, (_, i) => {
    const sex = i % 2 === 0 ? 'male' : 'female';
    const f = addFish(s, 'guppy', { ...calm, sex, pregnant: false });
    f.genome = cross(rng, mom.genome!, dad.genome!, sex);
    f.generation = 1;
    f.motherId = mom.id;
    f.bornHours = s.hours - hoursAgo;
    f.lengthCm = 1.4;
    return f;
  });
  return { s, tanks, dad, mom, kids };
}

describe('中期的選擇點（design/midgame.md）', () => {
  it('夢想魚機率：紅蛇王配全紅白子，小魚看不到白子，孫代約一成的兒子', () => {
    const { dad, mom } = withBrood(0, 0);
    expect(dreamChance(mom.genome!, dad.genome!)).toBe(0);
    const grand = grandDreamChance(mom.genome!, dad.genome!);
    expect(grand).toBeGreaterThan(2);
    expect(grand).toBeLessThan(15);
  });

  it('C1 第一窩出生就問；選了就不再問', () => {
    const { tanks, kids } = withBrood(6, 10);
    for (const k of kids) k.lengthCm = 0.7;
    const c1 = takeChoice(tanks);
    expect(c1?.id).toBe('C1');
    expect(c1!.options.find((o) => o.recommended)?.key).toBe('box');
    expect(chooseOption(tanks, 'C1', 'hide')).toBeNull();
    expect(takeChoice(tanks)).toBeNull();
  });

  it(`C3 第一窩出生滿 ${TANK_AFTER_BROOD_DAYS} 天、錢夠才問；選繁殖缸，開缸卡就推薦繁殖缸`, () => {
    const { s, tanks } = withBrood(4, (TANK_AFTER_BROOD_DAYS - 1) * 24);
    choiceState(tanks).picked.C1 = 'box';
    expect(takeChoice(tanks)).toBeNull();
    s.hours += 24;
    economy(s).coins = 100;
    expect(takeChoice(tanks)).toBeNull();
    economy(s).coins = 5000;
    const c3 = takeChoice(tanks);
    expect(c3?.id).toBe('C3');
    expect(chooseOption(tanks, 'C3', 'breeding')).toBeNull();
    expect(suggestPurpose(tanks, 99_999)).toBe('breeding');
  });

  it(`C2 第一窩滿 ${PICK_AFTER_BROOD_DAYS} 天、還有 ≥ 3 尾：公母各排一半，留 1 公 2 母，訂單拿不走`, () => {
    const { tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C3: 'had' });
    const c2 = takeChoice(tanks);
    expect(c2?.id).toBe('C2');
    expect(c2!.fish!.filter((f) => f.sex === 'male').length).toBeGreaterThan(0);
    expect(c2!.fish!.filter((f) => f.sex === 'female').length).toBeGreaterThan(0);
    // 全紅白子 × 紅蛇王的第一窩：都帶白子隱性
    expect(c2!.fish!.every((f) => f.missing.includes('白子（帶隱性）'))).toBe(true);
    const male = c2!.fish!.find((f) => f.sex === 'male')!;
    const females = c2!.fish!.filter((f) => f.sex === 'female');
    expect(chooseOption(tanks, 'C2', 'pick', [male.fishId, ...females.map((f) => f.fishId)])).toBe('最多留 1 公 2 母');
    expect(chooseOption(tanks, 'C2', 'pick', [male.fishId, females[0].fishId, females[1].fishId])).toBeNull();
    expect(kids.filter((k) => k.keeper).length).toBe(3);
    const order = { id: 77, kind: 'fish', species: 'guppy', size: 'juvenile', count: 6, unitPrice: 40, postedHours: tanks[0].hours } as ShopOrder;
    for (const k of kids) k.lengthCm = 2.2;
    expect(orderSupply(tanks, order)).toBe(3);
  });

  it('C2 留種會超過上限：整批不標，卡片下次還會出', () => {
    const { tanks, kids, dad, mom } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C3: 'had' });
    const c2 = takeChoice(tanks)!;
    // 已經有 4 尾留種（爸媽和第一窩兩尾），再挑 3 尾會超過 6
    for (const f of [dad, mom, kids[4], kids[5]]) f.keeper = true;
    const fresh = c2.fish!.filter((f) => !kids.find((k) => k.id === f.fishId)!.keeper);
    const picks = [fresh.find((f) => f.sex === 'male')!, ...fresh.filter((f) => f.sex === 'female').slice(0, 2)].map((f) => f.fishId);
    expect(picks.length).toBe(3);
    expect(chooseOption(tanks, 'C2', 'pick', picks)).toMatch(/最多留 6 尾/);
    expect(kids.filter((k) => k.keeper).length).toBe(2);
    expect(choiceState(tanks).picked.C2).toBeUndefined();
  });

  it('選種前，第一窩最大的 1 公 2 母先留著，訂單不拿；選種卡選過就不留', () => {
    const { s, tanks, kids } = withBrood(6, 5 * 24);
    kids.forEach((k, i) => (k.lengthCm = 2 + i * 0.05));
    // 第一窩的時間是選擇點記的（早上報告）；還沒記就不留
    expect(reservedForPick(s).size).toBe(0);
    breedingProgress(tanks);
    const held = reservedForPick(s);
    expect(held.size).toBe(3);
    const order = { id: 78, kind: 'fish', species: 'guppy', size: 'juvenile', count: 6, unitPrice: 40, postedHours: s.hours } as ShopOrder;
    expect(matchingFish(s, order).some((f) => held.has(f.id))).toBe(false);
    choiceState(tanks).picked.C2 = 'later';
    expect(reservedForPick(s).size).toBe(0);
  });

  it('C4 選種後 2 天：候選公魚附孫代機率，店裡的紅蛇王爸爸也算；選了留種、記下這一對', () => {
    const { s, tanks, dad, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C3: 'had' });
    takeChoice(tanks);
    chooseOption(tanks, 'C2', 'pick', [kids[0].id, kids[1].id, kids[3].id]);
    expect(takeChoice(tanks)).toBeNull();
    s.hours += 2 * 24;
    const c4 = takeChoice(tanks);
    expect(c4?.id).toBe('C4');
    expect(c4!.candidates!.length).toBeGreaterThanOrEqual(2);
    expect(c4!.candidates!.some((c) => c.fishId === dad.id)).toBe(true);
    expect(c4!.candidates!.some((c) => c.grandPct > 0)).toBe(true);
    expect(c4!.candidates![0].matureDays).toBeGreaterThan(0);
    const pick = c4!.options.find((o) => o.recommended)!;
    expect(chooseOption(tanks, 'C4', pick.key)).toBeNull();
    expect(choiceState(tanks).pair).toEqual([c4!.motherId, Number(pick.key)]);
    expect(breedingProgress(tanks)).toMatch(/^留種的那對長到 .* cm，再約 \d+ 天成熟可以配$/);
  });

  it('C5 相對門檻：便宜的單會拿走留著能提高孫代機率的魚就問；選過留著之後同類的單自動留，同一天最多一張（#316）', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'had' });
    for (const k of kids) k.lengthCm = 2.2;
    const order = (id: number) => ({ id, kind: 'fish', species: 'guppy', size: 'juvenile', sex: 'female', count: 1, unitPrice: 12, postedHours: s.hours }) as ShopOrder;
    orderBoard(s).orders = [order(90)];
    const c5 = takeChoice(tanks);
    expect(c5?.id).toBe('C5');
    expect(c5!.trade).toMatchObject({ orderId: 90, coins: 12 });
    expect(c5!.trade!.keepPct).toBeGreaterThan(c5!.trade!.sellPct);
    expect(c5!.owner).toMatch(/母魚身上有夢想魚要的基因/);
    const fish = kids.find((k) => k.id === c5!.trade!.fishId)!;
    expect(fish.sex).toBe('female');
    // 同一天不出第二張
    expect(takeChoice(tanks)).toBeNull();
    expect(chooseOption(tanks, 'C5', 'keep')).toBeNull();
    expect(fish.keeper).toBe(true);
    // 之後玩家取消了留種，隔天又來同類的單：照上次的選擇自動留下來，不再出卡
    delete fish.keeper;
    s.hours += 24;
    orderBoard(s).orders = [order(91)];
    expect(takeChoice(tanks)?.id).not.toBe('C5');
    expect(fish.keeper).toBe(true);
  });

  it('C5 選交單：照單交出去拿錢', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'had' });
    for (const k of kids) k.lengthCm = 2.2;
    orderBoard(s).orders = [{ id: 90, kind: 'fish', species: 'guppy', size: 'juvenile', sex: 'female', count: 1, unitPrice: 12, postedHours: s.hours } as ShopOrder];
    const c5 = takeChoice(tanks)!;
    const before = economy(s).coins;
    expect(chooseOption(tanks, 'C5', 'sell')).toBeNull();
    expect(economy(s).coins).toBe(before + 12);
    expect(s.fish.some((f) => f.id === c5.trade!.fishId)).toBe(false);
  });

  it('C6 繁殖缸擺好了：分主缸濾材過去，留種的魚、快生的母魚先搬，小魚跟著搬', () => {
    const { s, tanks, kids, mom } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'breeding' });
    economy(s).coins = 5000;
    s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
    expect(takeChoice(tanks)).toBeNull();
    const t2 = buyTank(tanks, 'nano20')!;
    setTankPurpose(t2, 'breeding');
    kids[0].keeper = true;
    mom.pregnancy = 0.8;
    const c6 = takeChoice(tanks);
    expect(c6?.id).toBe('C6');
    expect(c6!.move!.slice(0, 2)).toEqual([kids[0].id, mom.id]);
    expect(c6!.owner).toMatch(/濾材/);
    expect(chooseOption(tanks, 'C6', 'move')).toBeNull();
    expect(t2.bacteria.aob).toBeGreaterThan(0);
    expect(t2.fish.map((f) => f.id)).toEqual(expect.arrayContaining([kids[0].id, mom.id, ...kids.slice(1).map((k) => k.id)]));
    expect(takeChoice(tanks)).toBeNull();
  });

  it('C6 搬到繁殖缸快養滿為止（跟分缸提示同一把尺），已經滿了就不出', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'breeding' });
    economy(s).coins = 5000;
    const t2 = buyTank(tanks, 'nano20')!;
    setTankPurpose(t2, 'breeding');
    kids[0].keeper = true;
    // 繁殖缸裡已經有魚，只剩一點空間
    while (crowdingRatio(t2) < CROWD_WARN - 0.1) addFish(t2, 'guppy', { carriesIch: false, sex: 'female', pregnant: false });
    const c6 = takeChoice(tanks);
    expect(c6?.id).toBe('C6');
    expect(c6!.move![0]).toBe(kids[0].id);
    expect(c6!.move!.length).toBeLessThan(kids.length);
    s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
    chooseOption(tanks, 'C6', 'move');
    expect(crowdingRatio(t2)).toBeLessThanOrEqual(CROWD_WARN);
  });

  it('選育進度：選種前說第一窩再幾天能挑，留種後說公魚再幾天成熟', () => {
    const { tanks, kids } = withBrood(4, 3 * 24);
    expect(breedingProgress(tanks)).toMatch(new RegExp(`再 ${PICK_AFTER_BROOD_DAYS - 3} 天看得出公母`));
    kids[0].keeper = true;
    expect(breedingProgress(tanks)).toMatch(/^留種的.*公魚長到 1\.4 cm，再約 \d+ 天成熟可以配$/);
  });

  it('沒有第一窩就沒有選擇卡、沒有選育進度', () => {
    const s: TankState = newGameState(3);
    expect(takeChoice([s])).toBeNull();
    expect(breedingProgress([s])).toBeNull();
  });
});
