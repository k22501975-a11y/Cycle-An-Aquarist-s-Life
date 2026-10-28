import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, CROWD_WARN, crowdingRatio, FISH_SPECIES, bacteriaCapacity, MAX_KEEPERS, maxLengthCm, buyTank, setTankPurpose, cross, DREAM_FISH, economy, linkTanks, matchingFish, orderBoard, orderSupply, reservedForPick, suggestPurpose, type ShopOrder, type TankState } from './index';
import { BROOD_SUMMARY_DAYS, takeEchoes } from './choice-echo';
import { buyNurseryBox } from './nursery';
import { BACKUP_MAX, MAIN_KEEP_FISH, hasDreamGenes, orderDreamNote, tradeCheck, SECOND_BROOD_KEEP, SECOND_BROOD_SHOWS, takeSecondBrood, breedingProgress, chooseOption, CHOICE_RESHOW_DAYS, choiceState, dreamChance, FAST_TEMP_C, grandDreamChance, PICK_AFTER_BROOD_DAYS, takeChoice, takeMilestones, nextMilestone, TANK_AFTER_BROOD_DAYS } from './choices';

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

  describe('C1 的取捨和回音（polish-to-9.md §10.1）', () => {
    it('躲草：第 1、3、7 天各說少了幾尾、還有幾尾；剩一半以上的 3 天內任務卡先不叫搬', () => {
      const { s, tanks, kids } = withBrood(6, 10);
      for (const k of kids) k.lengthCm = 0.7;
      expect(takeChoice(tanks)?.id).toBe('C1');
      expect(chooseOption(tanks, 'C1', 'hide')).toBeNull();
      const st = choiceState(tanks);
      expect(takeEchoes(tanks, st)).toEqual([]);
      s.hours += 24;
      kids[0].alive = kids[1].alive = false;
      expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual(['昨晚躲草的小魚少了 2 尾，還有 4 尾']);
      s.hours += 48;
      expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual(['這 2 天躲草的小魚一尾都沒少，還有 4 尾']);
      s.hours += 4 * 24;
      kids[2].alive = false;
      expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual(['這 4 天躲草的小魚少了 1 尾，還有 3 尾']);
      s.hours += 24;
      expect(takeEchoes(tanks, st)).toEqual([]);
    });

    it('育幼盒：第 1 天說都在；第一窩還佔著盒子、母魚又快生了說一次；第 14 天總結還有幾尾、最大幾 cm', () => {
      const { s, tanks, kids, mom } = withBrood(6, 10);
      for (const k of kids) k.lengthCm = 0.7;
      economy(s).coins = 5000;
      buyNurseryBox(s);
      expect(takeChoice(tanks)?.id).toBe('C1');
      expect(chooseOption(tanks, 'C1', 'box')).toBeNull();
      expect(kids.every((k) => k.nursery)).toBe(true);
      const st = choiceState(tanks);
      s.hours += 24;
      expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual(['盒裡 6 尾都在，一尾都沒被吃']);
      // 第一窩還在盒裡，母魚又快生了：說一次盒子被佔著（之後不再說）
      mom.pregnancy = 0.9;
      s.hours += 24;
      expect(takeEchoes(tanks, st, () => '紅蛇王母魚').map((e) => e.text)).toEqual(['盒子被第一窩佔著，紅蛇王母魚快生了也沒地方放']);
      s.hours += 24;
      expect(takeEchoes(tanks, st)).toEqual([]);
      s.hours = st.firstBrood! + BROOD_SUMMARY_DAYS * 24;
      kids[0].lengthCm = 1.83;
      kids[5].alive = false;
      expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual(['第一窩：還有 5 尾，最大的 1.8 cm']);
    });
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
    expect(breedingProgress(tanks)).toMatch(/^留種的那對長到 .* cm，下一步：肛鰭變尖、出現胎斑，約 \d+ 天$/);
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

  it('C7 配好對隔天：三種養法寫成熟的天數，養快、活餌比標準早；選養快會換高級飼料、調到 27.5°C（#316）', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C3: 'had' });
    takeChoice(tanks);
    chooseOption(tanks, 'C2', 'pick', [kids[0].id, kids[1].id, kids[3].id]);
    s.hours += 2 * 24;
    const c4 = takeChoice(tanks)!;
    chooseOption(tanks, 'C4', c4.options.find((o) => o.recommended)!.key);
    s.hours += 24;
    const c7 = takeChoice(tanks);
    expect(c7?.id).toBe('C7');
    const day = (key: string) => Number(c7!.options.find((o) => o.key === key)!.outcome.match(/約第 (\d+) 天/)![1]);
    expect(day('fast')).toBeLessThan(day('standard'));
    expect(day('live')).toBeLessThanOrEqual(day('fast'));
    expect(c7!.options.find((o) => o.recommended)?.key).toBe('fast');
    expect(chooseOption(tanks, 'C7', 'fast')).toBeNull();
    expect(s.equipment.heater!.targetC).toBe(FAST_TEMP_C);
    expect(s.feedPlan).toEqual({ kind: 'floating', grade: 3 });
    expect(choiceState(tanks).plan).toBe('fast');
  });

  it('成長里程碑：配好對之後，看得出公母、公魚顯色、可以配各報一次；養快會寫提前幾天（#316）', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C3: 'had' });
    takeChoice(tanks);
    chooseOption(tanks, 'C2', 'pick', [kids[0].id, kids[1].id, kids[3].id]);
    s.hours += 2 * 24;
    const c4 = takeChoice(tanks)!;
    chooseOption(tanks, 'C4', c4.options.find((o) => o.recommended)!.key);
    const [momId, dadId] = choiceState(tanks).pair!;
    const mom = s.fish.find((f) => f.id === momId)!;
    const dad = s.fish.find((f) => f.id === dadId)!;
    // 剛配好對：已經到了的不報
    expect(takeMilestones(tanks)).toEqual([]);
    expect(nextMilestone(tanks)?.step).toBe('sex');
    expect(chooseOption(tanks, 'C7', 'fast')).toBeNull();
    // 長到成體一半就看得出公母（企劃 2026-10-22）
    mom.lengthCm = maxLengthCm(mom) * 0.5 - 0.01;
    dad.lengthCm = maxLengthCm(dad) * 0.5 - 0.01;
    expect(takeMilestones(tanks)).toEqual([]);
    mom.lengthCm = maxLengthCm(mom) * 0.5;
    dad.lengthCm = maxLengthCm(dad) * 0.5;
    const sex = takeMilestones(tanks);
    expect(sex.map((m) => m.step)).toEqual(['sex', 'sex']);
    expect(sex.find((m) => m.fishId === dadId)!.text).toMatch(/肛鰭開始變尖了，是公魚！/);
    expect(sex.find((m) => m.fishId === momId)!.text).toMatch(/看得到胎斑了，是母魚！/);
    expect(sex[0].earlierDays).toBeGreaterThan(0);
    expect(takeMilestones(tanks)).toEqual([]);
    expect(nextMilestone(tanks)?.step).toBe('color');
    dad.lengthCm = 2.8;
    expect(takeMilestones(tanks).map((m) => m.step)).toEqual(['color']);
    mom.lengthCm = dad.lengthCm = 3.1;
    const ready = takeMilestones(tanks);
    expect(ready).toMatchObject([{ step: 'ready', fishId: dadId, partnerId: momId }]);
    expect(nextMilestone(tanks)).toBeNull();
  });

  it('C9 生過一窩的母魚又快生了：問第二窩怎麼辦；選挑備用種魚，生下來就挑離夢想魚最近的標留種（#316）', () => {
    const { s, tanks, mom, dad } = withBrood(4, 20 * 24);
    const st = choiceState(tanks);
    Object.assign(st.picked, { C1: 'box', C2: 'later', C3: 'had', C4: 'x', C5: 'sell', C6: 'stay', C7: 'standard', C8: 'wait' });
    mom.pregnancy = SECOND_BROOD_SHOWS - 0.05;
    expect(takeChoice(tanks)).toBeNull();
    mom.pregnancy = SECOND_BROOD_SHOWS;
    const c9 = takeChoice(tanks);
    expect(c9?.id).toBe('C9');
    expect(c9!.title).toBe('第二窩快生了，要怎麼辦？');
    expect(c9!.options.map((o) => o.key)).toEqual(['grow', 'sell', 'keep']);
    expect(c9!.options.find((o) => o.key === 'sell')!.outcome).toMatch(/約 \d+ 元/);
    expect(chooseOption(tanks, 'C9', 'keep')).toBeNull();
    expect(st.secondBrood).toMatchObject({ momId: mom.id, prevKids: 4 });
    // 還沒生：沒有報告
    expect(takeSecondBrood(tanks)).toBeNull();
    s.hours += 7 * 24;
    mom.pregnancy = 0;
    const rng = { seed: 9 };
    const fry = Array.from({ length: 8 }, (_, i) => {
      const sex = i % 2 === 0 ? 'male' : 'female';
      const f = addFish(s, 'guppy', { sex, pregnant: false });
      f.genome = cross(rng, mom.genome!, dad.genome!, sex);
      f.generation = 1;
      f.motherId = mom.id;
      f.bornHours = s.hours;
      return f;
    });
    const news = takeSecondBrood(tanks);
    expect(news).toMatchObject({ count: 8, prevKids: 4, choice: 'keep' });
    expect(news!.kept).toBeGreaterThanOrEqual(1);
    expect(news!.kept).toBeLessThanOrEqual(SECOND_BROOD_KEEP);
    expect(fry.filter((f) => f.keeper).length).toBe(news!.kept);
    expect(news!.text).toMatch(/第二窩生了 8 尾（第一窩現在還有 4 尾）/);
    expect(takeSecondBrood(tanks)).toBeNull();
  });

  it('C9 挑備用種魚但留種名額滿了：報告講清楚，不默默略過', () => {
    const { s, tanks, mom, dad, kids } = withBrood(MAX_KEEPERS, 20 * 24);
    const st = choiceState(tanks);
    Object.assign(st.picked, { C1: 'box', C2: 'later', C3: 'had', C4: 'x', C5: 'sell', C6: 'stay', C7: 'standard', C8: 'wait' });
    for (const k of kids) k.keeper = true;
    mom.pregnancy = 0.8;
    expect(takeChoice(tanks)?.id).toBe('C9');
    expect(chooseOption(tanks, 'C9', 'keep')).toBeNull();
    s.hours += 6 * 24;
    const rng = { seed: 9 };
    for (let i = 0; i < 4; i++) {
      const f = addFish(s, 'guppy', { sex: 'female', pregnant: false });
      f.genome = cross(rng, mom.genome!, dad.genome!, 'female');
      f.generation = 1;
      f.motherId = mom.id;
      f.bornHours = s.hours;
    }
    const news = takeSecondBrood(tanks)!;
    expect(news.kept).toBe(0);
    expect(news.text).toMatch(/留種名額滿了/);
  });

  it('C9 選交小魚單：這窩之後交單不再出 C5', () => {
    const { s, tanks, mom, dad } = withBrood(4, 20 * 24);
    const st = choiceState(tanks);
    Object.assign(st.picked, { C1: 'box', C2: 'later', C3: 'had', C4: 'x', C6: 'stay', C7: 'standard', C8: 'wait' });
    mom.pregnancy = 0.8;
    expect(takeChoice(tanks)?.id).toBe('C9');
    expect(chooseOption(tanks, 'C9', 'sell')).toBeNull();
    s.hours += 6 * 24;
    mom.pregnancy = 0;
    const rng = { seed: 9 };
    const fry = Array.from({ length: 6 }, () => {
      const f = addFish(s, 'guppy', { sex: 'female', pregnant: false });
      f.genome = cross(rng, mom.genome!, dad.genome!, 'female');
      f.generation = 1;
      f.motherId = mom.id;
      f.bornHours = s.hours;
      f.lengthCm = 2.2;
      return f;
    });
    expect(takeSecondBrood(tanks)?.choice).toBe('sell');
    expect(st.secondBrood!.fry).toEqual(fry.map((f) => f.id));
    // 第一窩的魚都先留種，單只會拿到第二窩
    for (const k of s.fish.filter((f) => f.motherId === mom.id && !fry.includes(f))) k.keeper = true;
    orderBoard(s).orders = [{ id: 97, kind: 'fish', species: 'guppy', size: 'juvenile', sex: 'female', count: 1, unitPrice: 40, postedHours: s.hours } as ShopOrder];
    // 對照：不是交單的那窩的話，這張單會問
    const sold = st.secondBrood!.fry!;
    st.secondBrood!.fry = [];
    const o = orderBoard(s).orders[0];
    st.picked.C5 = 'sell';
    expect(orderDreamNote(tanks, o)).toBe('有夢想魚基因');
    st.secondBrood!.fry = sold;
    expect(orderDreamNote(tanks, o)).toBeNull();
    delete st.picked.C5;
    expect(tradeCheck(tanks, 97)).toBeNull();
  });

  it('C7 的養法管到種魚長大：兩尾都能配了就收掉養法飼料、加熱棒調回原本的溫度（#319 架構）', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C3: 'had' });
    takeChoice(tanks);
    chooseOption(tanks, 'C2', 'pick', [kids[0].id, kids[1].id, kids[3].id]);
    s.hours += 2 * 24;
    const c4 = takeChoice(tanks)!;
    chooseOption(tanks, 'C4', c4.options.find((o) => o.recommended)!.key);
    const before = s.equipment.heater!.targetC;
    expect(chooseOption(tanks, 'C7', 'live')).toBeNull();
    expect(s.feedPlan).toBeDefined();
    s.hours += 24;
    takeChoice(tanks);
    expect(s.feedPlan).toBeDefined();
    for (const id of choiceState(tanks).pair!) s.fish.find((f) => f.id === id)!.lengthCm = 3.2;
    s.hours += 24;
    takeChoice(tanks);
    expect(s.feedPlan).toBeUndefined();
    expect(s.equipment.heater!.targetC).toBe(before);
    expect(choiceState(tanks).planDone).toBe(true);
  });

  it('C8 買了第二缸：分舊缸濾材（推薦）、硝化菌液 30 元、自己等；選了倒菌液就等養好才問搬魚（#316）', () => {
    const { s, tanks } = withBrood(2, 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C3: 'breeding' });
    economy(s).coins = 5000;
    s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
    const t2 = buyTank(tanks, 'nano20')!;
    setTankPurpose(t2, 'breeding');
    const c8 = takeChoice(tanks);
    expect(c8?.id).toBe('C8');
    expect(c8!.options.map((o) => o.key)).toEqual(['media', 'bottle', 'wait']);
    expect(c8!.options[0].recommended).toBe(true);
    const coins = economy(s).coins;
    const aob = t2.bacteria.aob;
    expect(chooseOption(tanks, 'C8', 'bottle')).toBeNull();
    expect(economy(s).coins).toBe(coins - 30);
    expect(t2.bacteria.aob).toBeGreaterThan(aob);
    // 選自己等：繁殖缸還沒養好之前不問搬魚
    t2.bacteria.aob = t2.bacteria.nob = 0;
    choiceState(tanks).picked.C8 = 'wait';
    s.hours += 24;
    expect(takeChoice(tanks)?.id).not.toBe('C6');
  });

  it('C5 交單時才問：要交的單會拿走有夢想魚基因的魚就出卡，同一張單只問一次（#316）', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'had' });
    for (const k of kids) k.lengthCm = 2.2;
    orderBoard(s).orders = [{ id: 95, kind: 'fish', species: 'guppy', size: 'juvenile', sex: 'female', count: 1, unitPrice: 40, postedHours: s.hours } as ShopOrder];
    const card = tradeCheck(tanks, 95);
    expect(card?.id).toBe('C5');
    expect(card!.trade).toMatchObject({ orderId: 95, coins: 40 });
    const fish = kids.find((k) => k.id === card!.trade!.fishId)!;
    expect(hasDreamGenes(fish)).toBe(true);
    expect(card!.options.find((o) => o.recommended)?.key).toBe('keep');
    // 沒選就關掉：下次按交貨再問；當天早上也不會再出第二張卡
    expect(tradeCheck(tanks, 95)?.id).toBe('C5');
    expect(takeChoice(tanks)).toBeNull();
    expect(chooseOption(tanks, 'C5', 'keep')).toBeNull();
    expect(fish.keeper).toBe(true);
    expect(choiceState(tanks).backups).toEqual([fish.id]);
    // 選過了，同一張單不再問
    expect(tradeCheck(tanks, 95)).toBeNull();
  });

  it('C5 按交貨時選交單：只記下來，交貨照一般流程（不在選的時候就交）', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'had' });
    for (const k of kids) k.lengthCm = 2.2;
    orderBoard(s).orders = [{ id: 98, kind: 'fish', species: 'guppy', size: 'juvenile', sex: 'female', count: 1, unitPrice: 40, postedHours: s.hours } as ShopOrder];
    const card = tradeCheck(tanks, 98)!;
    const coins = economy(s).coins;
    expect(chooseOption(tanks, 'C5', 'sell')).toBeNull();
    expect(economy(s).coins).toBe(coins);
    expect(s.fish.some((f) => f.id === card.trade!.fishId)).toBe(true);
    expect(choiceState(tanks).tradeAsked).toContain(98);
  });

  it(`C5 選過留著：之後交單自動留下有基因的魚，最多 ${BACKUP_MAX} 尾`, () => {
    const { s, tanks, kids } = withBrood(10, PICK_AFTER_BROOD_DAYS * 24);
    const st = choiceState(tanks);
    Object.assign(st.picked, { C1: 'box', C2: 'later', C3: 'had', C5: 'keep' });
    for (const k of kids) k.lengthCm = 2.2;
    const before = kids.filter((k) => k.keeper).length;
    for (let i = 0; i < BACKUP_MAX + 3; i++) {
      orderBoard(s).orders = [{ id: 200 + i, kind: 'fish', species: 'guppy', size: 'juvenile', count: 1, unitPrice: 40, postedHours: s.hours } as ShopOrder];
      expect(tradeCheck(tanks, 200 + i)).toBeNull();
    }
    expect(st.backups!.length).toBeGreaterThan(0);
    expect(st.backups!.length).toBeLessThanOrEqual(BACKUP_MAX);
    expect(kids.filter((k) => k.keeper).length - before).toBe(st.backups!.length);
  });

  it('C5 選過交單：照常交、不出卡，訂單卡上標「有夢想魚基因」', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'had', C5: 'sell' });
    for (const k of kids) k.lengthCm = 2.2;
    const o = { id: 96, kind: 'fish', species: 'guppy', size: 'juvenile', sex: 'female', count: 1, unitPrice: 40, postedHours: s.hours } as ShopOrder;
    orderBoard(s).orders = [o];
    expect(orderDreamNote(tanks, o)).toBe('有夢想魚基因');
    expect(tradeCheck(tanks, 96)).toBeNull();
    expect(kids.some((k) => k.keeper)).toBe(false);
    // 沒選交單的話不標
    delete choiceState(tanks).picked.C5;
    expect(orderDreamNote(tanks, o)).toBeNull();
  });

  it('C6 繁殖缸擺好了：分主缸濾材過去，留種的魚、快生的母魚先搬，小魚跟著搬；主缸至少留 MAIN_KEEP_FISH 尾（#325）', () => {
    const { s, tanks, kids, mom } = withBrood(12, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'breeding', C8: 'media' });
    economy(s).coins = 5000;
    s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
    expect(takeChoice(tanks)).toBeNull();
    const t2 = buyTank(tanks, 'nano20')!;
    setTankPurpose(t2, 'breeding');
    // 40L 的繁殖缸：快生母魚那窩小魚（算兩週後的大小）也放得下，搬到主缸剩 MAIN_KEEP_FISH 尾為止
    t2.equipment.tank = { ...t2.equipment.tank, volumeL: 40 };
    kids[0].keeper = true;
    // 小魚夠大，母魚吞不下
    for (const k of kids) k.lengthCm = 2.2;
    mom.pregnancy = 0.8;
    const c6 = takeChoice(tanks);
    expect(c6?.id).toBe('C6');
    expect(c6!.move!.slice(0, 2)).toEqual([kids[0].id, mom.id]);
    expect(c6!.owner).toMatch(/濾材/);
    expect(c6!.options[0].outcome).toContain(`主缸還有 ${MAIN_KEEP_FISH} 尾`);
    expect(chooseOption(tanks, 'C6', 'move')).toBeNull();
    expect(t2.bacteria.aob).toBeGreaterThan(0);
    expect(t2.fish.map((f) => f.id)).toEqual(expect.arrayContaining([kids[0].id, mom.id]));
    expect(t2.fish.length).toBe(14 - MAIN_KEEP_FISH);
    expect(s.fish.filter((f) => f.alive).length).toBe(MAIN_KEEP_FISH);
    expect(takeChoice(tanks)).toBeNull();
  });

  it('C6 搬快生的母魚會算上那窩小魚：20L 繁殖缸不會一生就超過建議量（midgame.md §7）', () => {
    const { s, tanks, kids, mom } = withBrood(12, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'breeding', C8: 'media' });
    economy(s).coins = 5000;
    s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
    const t2 = buyTank(tanks, 'nano20')!;
    setTankPurpose(t2, 'breeding');
    for (const k of kids) k.lengthCm = 2.2;
    mom.pregnancy = 0.8;
    expect(chooseOption(tanks, 'C6', 'move')).toBeNull();
    const brood = (FISH_SPECIES.guppy.breeding!.broodMean * mom.health * 0.36) / t2.equipment.tank.volumeL;
    expect(crowdingRatio(t2) + brood).toBeLessThanOrEqual(CROWD_WARN + 0.01);
  });

  it('C6 小魚還小：吃得下牠們的快生母魚不跟著搬（#322）', () => {
    const { s, tanks, kids, mom } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'breeding', C8: 'media' });
    economy(s).coins = 5000;
    s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
    const t2 = buyTank(tanks, 'nano20')!;
    setTankPurpose(t2, 'breeding');
    kids[0].keeper = true;
    mom.pregnancy = 0.8;
    const c6 = takeChoice(tanks)!;
    expect(c6.move).toContain(kids[0].id);
    expect(c6.move).not.toContain(mom.id);
  });

  it('C6 等選種之後才問；育幼盒裡留種的也搬；之後又有留種的魚在外面，隔幾天再問一次（#322）', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    const st = choiceState(tanks);
    Object.assign(st.picked, { C1: 'box', C3: 'breeding', C8: 'media' });
    economy(s).coins = 5000;
    s.bacteria.aob = s.bacteria.nob = bacteriaCapacity(s);
    const t2 = buyTank(tanks, 'nano20')!;
    setTankPurpose(t2, 'breeding');
    // 還沒選種：先出選種卡，不出搬魚卡
    expect(takeChoice(tanks)?.id).toBe('C2');
    for (const k of kids) k.nursery = true;
    expect(chooseOption(tanks, 'C2', 'pick', [kids[0].id, kids[1].id, kids[3].id])).toBeNull();
    s.hours += 24;
    const c6 = takeChoice(tanks);
    expect(c6?.id).toBe('C6');
    expect(c6!.move).toEqual(expect.arrayContaining([kids[0].id, kids[1].id, kids[3].id]));
    expect(chooseOption(tanks, 'C6', 'move')).toBeNull();
    expect(t2.fish.filter((f) => f.keeper).length).toBe(3);
    // 之後又留了一尾在主缸：隔 CHOICE_RESHOW_DAYS 天再問
    const late = addFish(s, 'guppy', { sex: 'female', pregnant: false });
    late.genome = kids[2].genome;
    late.generation = 1;
    late.lengthCm = 2.2;
    late.keeper = true;
    Object.assign(st.picked, { C4: 'x', C7: 'standard', C9: 'grow' });
    s.hours += 24;
    expect(takeChoice(tanks)?.id).not.toBe('C6');
    s.hours += CHOICE_RESHOW_DAYS * 24;
    const again = takeChoice(tanks);
    expect(again?.id).toBe('C6');
    expect(again!.title).toMatch(/還有魚/);
    expect(again!.move).toContain(late.id);
  });

  it('C6 搬到繁殖缸快養滿為止（跟分缸提示同一把尺），已經滿了就不出', () => {
    const { s, tanks, kids } = withBrood(6, PICK_AFTER_BROOD_DAYS * 24);
    Object.assign(choiceState(tanks).picked, { C1: 'box', C2: 'later', C3: 'breeding', C8: 'media' });
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
