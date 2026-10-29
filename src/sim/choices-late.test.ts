import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, fulfillOrder, orderSupply, sellFish, MAX_TUBS, tubCandidates, sellTub, step, TUB_CAPACITY, TUB_PRICE, tubReady, tubRefusal, airPumpPrice, ADULT_SIZE, bacteriaCapacity, broodFactor, buyTank, CROWD_WARN, crowdingRatio, cross, DREAM_FISH, economy, FISH_SPECIES, linkTanks, orderBoard, setTankPurpose, type Fish, type GuppyGenome, type TankState } from './index';
import { breederIds, chooseOption, choiceState, CHOICE_RESHOW_DAYS, CROWD_FULL, CROWD_PREVIEW, REVEAL_CULL_DAYS, takeCrowdNotes, PAIR_PLAN_DAYS, REVEAL_SHOWS, BOX_DUE, takeBellyNotes, SECOND_BROOD_SHOWS, BROOD_AGAIN_SHOWS, BROOD_AGAIN_GAP_DAYS, WARM_PREG_C, takeChoice, takeLineNotes, lineName, lineNameRefusal, LINE_NAME_SUGGESTED, takeReveal, takeSecondBrood, FINS_DAYS, COLOR_DAYS, SNAKE_DAYS, STABILITY_DAYS } from './choices';
import { dreamRoute, LINE_FIXED_PCT } from './dream';
import { dropTankEchoes, takeEchoes } from './choice-echo';
import { newTankCost } from './household';
import { reservedForPick } from './orders';

const calm = { carriesIch: false, carries: [] };
const ADULT_CM = FISH_SPECIES.guppy.adultLengthCm * ADULT_SIZE;

/**
 * 第 36 天之後的樣子（midgame.md §6）：主缸有店裡買的夢想魚媽媽，繁殖缸有留種的那對（店裡的紅蛇王爸爸、第一窩的女兒），
 * 前面的選擇都選過了。
 */
function latePair() {
  const s = newGameState(7);
  const tanks = [s];
  linkTanks(tanks);
  economy(s).coins = 5000;
  const t2 = buyTank(tanks, 'nano20')!;
  setTankPurpose(t2, 'breeding');
  for (const t of tanks) t.bacteria.aob = t.bacteria.nob = bacteriaCapacity(t);
  const storeMom = addFish(s, 'guppy', { ...calm, sex: 'female', strain: DREAM_FISH.parents.female, pregnant: false });
  const dad = addFish(t2, 'guppy', { ...calm, sex: 'male', strain: DREAM_FISH.parents.male, pregnant: false });
  const rng = { seed: 5 };
  const kid = (t: TankState, sex: 'male' | 'female', cm: number): Fish => {
    const f = addFish(t, 'guppy', { ...calm, sex, pregnant: false });
    f.genome = cross(rng, storeMom.genome!, dad.genome!, sex);
    f.generation = 1;
    f.motherId = storeMom.id;
    f.bornHours = s.hours - 40 * 24;
    f.lengthCm = cm;
    return f;
  };
  const mom = kid(t2, 'female', ADULT_CM - 0.03);
  mom.keeper = true;
  dad.keeper = true;
  const st = choiceState(tanks);
  Object.assign(st.picked, { C1: 'box', C2: 'pick', C3: 'breeding', C4: String(dad.id), C5: 'keep', C6: 'move', C7: 'standard', C8: 'media', C9: 'keep' });
  st.firstBrood = s.hours - 40 * 24;
  st.pair = [mom.id, dad.id];
  // 第一窩出生後就配好對、問過第二窩，留種的那對已經記下來了
  st.shown = { C4: s.hours - 20 * 24 };
  return { s, t2, tanks, st, storeMom, dad, mom, kid };
}

/** 隔天早上（同一天只出一張卡）。 */
const nextDay = (tanks: TankState[]) => {
  tanks[0].hours += 24;
  return takeChoice(tanks);
};

describe('第 36～80 天的選擇點（midgame.md §6，#326）', () => {
  it('C11 快要配之前問要不要分開；選分開養，同缸別的公魚搬去主缸，之後長大的也會搬走', () => {
    const { tanks, t2, s, dad, mom, kid } = latePair();
    const rival = kid(t2, 'male', 2.6);
    const c11 = takeChoice(tanks);
    expect(c11?.id).toBe('C11');
    expect(c11!.motherId).toBe(mom.id);
    expect(c11!.fatherId).toBe(dad.id);
    expect(c11!.options.map((o) => o.key)).toEqual(['split', 'together']);
    expect(c11!.options[0].outcome).toMatch(new RegExp(`${DREAM_FISH.name}的機率約 [\\d.]+%；同缸另外 1 尾公魚搬去`));
    expect(c11!.options[1].outcome).toMatch(/可能被別尾公魚配到，機率約 [\d.]+%/);
    expect(chooseOption(tanks, 'C11', 'split')).toBeNull();
    expect(s.fish.some((f) => f.id === rival.id)).toBe(true);
    expect(t2.fish.some((f) => f.id === dad.id)).toBe(true);
    // 之後繁殖缸又長大一尾公魚：隔天早上自動搬走
    const late = kid(t2, 'male', ADULT_CM);
    nextDay(tanks);
    expect(s.fish.some((f) => f.id === late.id)).toBe(true);
  });

  it('C11 同缸沒有別的公魚就不問；一起養的機率照每尾公魚當爸爸的權重平均', () => {
    const { tanks, t2, kid } = latePair();
    expect(takeChoice(tanks)?.id).not.toBe('C11');
    kid(t2, 'male', 2.6);
    tanks[0].hours += 24;
    expect(takeChoice(tanks)?.id).toBe('C11');
  });

  it('C12 兩尾都快長大時問怎麼配；1 公配 2 母把第二尾母魚搬過來，之後兩尾都問孕期怎麼養', () => {
    const { tanks, t2, s, st, mom, dad, kid } = latePair();
    // 留種的魚放在主缸（C6 沒搬），C12 自己會搬
    Object.assign(st.picked, { C6: 'stay', C11: 'together' });
    mom.lengthCm = ADULT_CM - 0.005;
    const mom2 = kid(s, 'female', ADULT_CM);
    mom2.keeper = true;
    const son = kid(s, 'male', ADULT_CM);
    son.keeper = true;
    const c12 = takeChoice(tanks);
    expect(c12?.id).toBe('C12');
    expect(c12!.options.map((o) => o.key)).toEqual(['two', 'one', 'rotate']);
    expect(c12!.options.find((o) => o.recommended)!.key).toBe('two');
    expect(c12!.owner).toMatch(/^配上之後大約 \d+ 天生（約第 \d+ 天）。$/);
    // 照推薦（C13 調高水溫）的開獎日不會比照現在水溫晚（#335）
    const [, bornDay] = c12!.owner.match(/約第 (\d+) 天/)!;
    const [, revealDay] = c12!.note!.match(/^照推薦，大約第 (\d+) 天開獎$/)!;
    expect(Number(revealDay)).toBeLessThanOrEqual(Number(bornDay));
    expect(chooseOption(tanks, 'C12', 'two')).toBeNull();
    expect(t2.fish.some((f) => f.id === mom2.id)).toBe(true);
    expect(st.mates).toEqual([mom2.id]);
    // 兩尾都懷了指定爸爸的小孩：各問一次孕期怎麼養
    for (const m of [mom, mom2]) {
      m.pregnancy = 0.1;
      m.sire = { genome: dad.genome!, lineage: dad.id, inbreeding: 0, id: dad.id };
    }
    const first = nextDay(tanks);
    expect(first?.id, JSON.stringify({ shown: st.shown, mates: st.mates, preg: [mom.pregnancy, mom2.pregnancy], alive: [mom.alive, mom2.alive], pair: st.pair, ids: [mom.id, mom2.id] })).toBe('C13');
    expect(chooseOption(tanks, 'C13', 'standard')).toBeNull();
    const second = nextDay(tanks);
    expect(second?.id).toBe('C13');
    expect(second!.motherId).not.toBe(first!.motherId);
    expect(chooseOption(tanks, 'C13', 'standard')).toBeNull();
    expect(nextDay(tanks)?.id).not.toBe('C13');
  });

  it('C12 讓 2 尾公魚輪流：另一尾也搬去配，分開養不會把牠搬走', () => {
    const { tanks, t2, s, st, mom, kid } = latePair();
    Object.assign(st.picked, { C6: 'stay', C11: 'split' });
    mom.lengthCm = ADULT_CM - 0.005;
    const son = kid(s, 'male', ADULT_CM);
    son.keeper = true;
    const c12 = takeChoice(tanks);
    expect(c12?.id).toBe('C12');
    expect(c12!.options.map((o) => o.key)).toEqual(['one', 'rotate']);
    expect(chooseOption(tanks, 'C12', 'rotate')).toBeNull();
    expect(st.sires).toEqual([son.id]);
    expect(t2.fish.some((f) => f.id === son.id)).toBe(true);
    nextDay(tanks);
    expect(t2.fish.some((f) => f.id === son.id)).toBe(true);
  });

  it(`C12 在兩尾都還要 ${PAIR_PLAN_DAYS} 天以上才長大時不問`, () => {
    const { tanks, st, mom } = latePair();
    st.picked.C11 = 'together';
    mom.lengthCm = 1.8;
    expect(takeChoice(tanks)).toBeNull();
  });

  it('C13 調高水溫（#335）：推薦、卡上寫早幾天生；可以和活餌一起；生完加熱棒調回原本的溫度', () => {
    const { tanks, t2, st, mom } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one' });
    mom.lengthCm = ADULT_CM + 0.2;
    mom.pregnancy = 0.1;
    const before = t2.equipment.heater!.targetC;
    const c13 = takeChoice(tanks);
    expect(c13?.id).toBe('C13');
    expect(c13!.checks).toEqual(['live', 'warm']);
    const warm = c13!.options.find((o) => o.key === 'warm')!;
    expect(warm).toMatchObject({ label: `水溫調到 ${WARM_PREG_C}°C`, recommended: true });
    expect(warm.outcome).toMatch(/^約早 \d+ 天生（第 \d+ → \d+ 天），水裡的氧少一點，/);
    expect(chooseOption(tanks, 'C13', 'both')).toBeNull();
    expect(t2.equipment.heater!.targetC).toBe(WARM_PREG_C);
    expect(t2.feedPlan).toEqual({ kind: 'meat', grade: 4 });
    mom.pregnancy = 0;
    nextDay(tanks);
    expect(t2.equipment.heater!.targetC).toBe(before);
    expect(st.warmPlan).toBeUndefined();
  });

  it('C13 兩尾母魚都選調高水溫（1 公配 2 母）：兩尾都生完才調回第一次調之前的溫度', () => {
    const { tanks, t2, st, mom, dad, kid } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'two' });
    mom.lengthCm = ADULT_CM + 0.2;
    mom.pregnancy = 0.1;
    const before = t2.equipment.heater!.targetC;
    expect(takeChoice(tanks)?.id).toBe('C13');
    expect(chooseOption(tanks, 'C13', 'warm')).toBeNull();
    const mom2 = kid(t2, 'female', ADULT_CM + 0.2);
    mom2.pregnancy = 0.1;
    mom2.sire = { genome: dad.genome!, lineage: 0, inbreeding: 0, id: dad.id };
    st.mates = [mom2.id];
    // 第二尾過幾天才懷上、才問
    st.shown.C13 = st.lastCard = tanks[0].hours - CHOICE_RESHOW_DAYS * 24;
    expect(takeChoice(tanks)?.id).toBe('C13');
    expect(chooseOption(tanks, 'C13', 'warm')).toBeNull();
    expect(st.warmPlan).toMatchObject({ momIds: [mom.id, mom2.id], prevC: before });
    mom.pregnancy = 0;
    nextDay(tanks);
    expect(t2.equipment.heater!.targetC).toBe(WARM_PREG_C);
    mom2.pregnancy = 0;
    nextDay(tanks);
    expect(t2.equipment.heater!.targetC).toBe(before);
    expect(st.warmPlan).toBeUndefined();
  });

  it('C13 那缸沒有加熱棒：調水溫的選項變灰並寫原因', () => {
    const { tanks, t2, st, mom } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one' });
    mom.lengthCm = ADULT_CM + 0.2;
    mom.pregnancy = 0.1;
    t2.equipment.heater = null;
    const c13 = takeChoice(tanks)!;
    expect(c13.options.find((o) => o.key === 'warm')).toMatchObject({ disabled: '這缸沒有加熱棒，調不了水溫' });
    expect(c13.options.some((o) => o.recommended)).toBe(false);
    expect(chooseOption(tanks, 'C13', 'warm')).toBe('這缸沒有加熱棒，調不了水溫');
  });

  it('C13 選加活餌：那缸改餵冷凍紅蟲，生完就收掉；吃得好一窩多幾尾', () => {
    const { tanks, t2, st, mom } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one' });
    mom.lengthCm = ADULT_CM + 0.2;
    mom.pregnancy = 0.1;
    const c13 = takeChoice(tanks);
    expect(c13?.id).toBe('C13');
    expect(c13!.title).toMatch(/懷孕了！$/);
    expect(c13!.owner).toMatch(/^再約 \d+ 天生。/);
    expect(c13!.options.find((o) => o.key === 'live')!.outcome).toMatch(/一窩可能多 \d+ 尾左右/);
    expect(chooseOption(tanks, 'C13', 'live')).toBeNull();
    expect(t2.feedPlan).toEqual({ kind: 'meat', grade: 4 });
    mom.pregnancy = 0;
    nextDay(tanks);
    expect(t2.feedPlan).toBeUndefined();
    expect(broodFactor(0.5)).toBe(1);
    expect(broodFactor(1)).toBeGreaterThan(1.1);
  });

  it('C14 缸快滿了：沒有交得出的單就賣一批給阿德，賣完不擠了、錢變多', () => {
    const { tanks, s, st } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    orderBoard(s).orders = [];
    while (crowdingRatio(s) < CROWD_WARN + 0.1) addFish(s, 'guppy', { ...calm, sex: 'male', pregnant: false });
    const c14 = takeChoice(tanks);
    expect(c14?.id).toBe('C14');
    expect(c14!.title).toMatch(/快住不下了$/);
    // 沒有快生的、也不是小小魚擠的：推薦賣一批；公母分開、換水也列著
    expect(c14!.options.map((o) => o.key)).toEqual(expect.arrayContaining(['split', 'sell', 'tank', 'water']));
    const sell = c14!.options.find((o) => o.key === 'sell')!;
    expect(sell.recommended).toBe(true);
    expect(sell.outcome).toMatch(/^\d+ 尾賣給阿德，約 \d+ 元$/);
    const coins = economy(s).coins;
    expect(chooseOption(tanks, 'C14', 'sell')).toBeNull();
    expect(crowdingRatio(s)).toBeLessThan(CROWD_WARN);
    expect(economy(s).coins).toBeGreaterThan(coins);
  });

  it('C9 第二次之後是簡化版：照上次一鍵沿用，生了報告寫「又生了」', () => {
    const { tanks, s, st, storeMom, dad, mom } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    mom.lengthCm = ADULT_CM + 0.2;
    st.secondBrood = { momId: storeMom.id, hours: s.hours - 30 * 24, prevKids: 4, born: 12, choice: 'keep' };
    st.broods = 1;
    storeMom.pregnancy = SECOND_BROOD_SHOWS;
    const c9 = takeChoice(tanks);
    expect(c9?.id).toBe('C9');
    expect(c9!.title).toMatch(/又快生了$/);
    expect(c9!.options[0]).toMatchObject({ key: 'same', recommended: true });
    expect(c9!.options[0].label).toMatch(/^照上次：挑 2～\d 尾當備用種魚$/);
    expect(c9!.options.map((o) => o.key).slice(1)).toEqual(['grow', 'sell']);
    expect(chooseOption(tanks, 'C9', 'same')).toBeNull();
    expect(st.broodQueue).toMatchObject([{ momId: storeMom.id, choice: 'keep' }]);
    s.hours += 5 * 24;
    storeMom.pregnancy = 0;
    const rng = { seed: 3 };
    for (let i = 0; i < 5; i++) {
      const f = addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
      f.genome = cross(rng, storeMom.genome!, dad.genome!, 'female');
      f.generation = 1;
      f.motherId = storeMom.id;
      f.bornHours = s.hours;
    }
    const news = takeSecondBrood(tanks);
    expect(news?.text).toMatch(/又生了 5 尾/);
    expect(st.broodQueue).toEqual([]);
  });

  it('C9 重複版別太吵（§6.5）：幾天內會生的合成一張、7 天內不再跳、連選兩次照上次就自動照做', () => {
    const { tanks, s, st, storeMom, mom } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    mom.lengthCm = ADULT_CM + 0.2;
    st.secondBrood = { momId: storeMom.id, hours: s.hours - 30 * 24, prevKids: 4, born: 12, choice: 'keep' };
    st.broods = 1;
    // 另一尾生過的母魚，兩天後也會到門檻
    const other = addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
    const kid = addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
    kid.motherId = other.id;
    storeMom.pregnancy = BROOD_AGAIN_SHOWS;
    other.pregnancy = BROOD_AGAIN_SHOWS - 2 / 28;
    const c9 = takeChoice(tanks);
    expect(c9?.title).toBe('2 尾母魚這幾天快生了');
    expect(c9!.owner).toMatch(/選一次全部套用/);
    expect(chooseOption(tanks, 'C9', 'same')).toBeNull();
    expect(st.broodQueue!.map((b) => b.momId)).toEqual([storeMom.id, other.id]);
    // 兩尾都生完（小魚被吃光）；7 天內又有一尾快生：不跳卡，照上次、早上報告寫一行
    for (const f of [storeMom, other]) f.pregnancy = 0;
    s.hours += 3 * 24;
    takeSecondBrood(tanks);
    const third = addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
    addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false }).motherId = third.id;
    third.pregnancy = BROOD_AGAIN_SHOWS;
    expect(nextDay(tanks)?.id).not.toBe('C9');
    expect(st.broodQueue!.map((b) => b.momId)).toEqual([third.id]);
    const told = takeBellyNotes(tanks);
    expect(told.map((n) => n.text)).toContainEqual(expect.stringMatching(/快生了，照你的設定生下來挑備用種魚$/));
    expect(takeBellyNotes(tanks).some((n) => /照你的設定/.test(n.text))).toBe(false);
    // 過了 7 天又快生：跳卡，選第二次照上次
    third.pregnancy = 0;
    takeSecondBrood(tanks);
    s.hours += BROOD_AGAIN_GAP_DAYS * 24;
    storeMom.pregnancy = BROOD_AGAIN_SHOWS;
    expect(takeChoice(tanks)?.id).toBe('C9');
    expect(chooseOption(tanks, 'C9', 'same')).toBeNull();
    expect(st.sameStreak).toBe(2);
    // 之後就算隔很久也不再跳卡
    storeMom.pregnancy = 0;
    takeSecondBrood(tanks);
    s.hours += 30 * 24;
    other.pregnancy = BROOD_AGAIN_SHOWS;
    expect(nextDay(tanks)?.id).not.toBe('C9');
    expect(st.broodQueue!.map((b) => b.momId)).toEqual([other.id]);
    // 改設定的卡同一個設定只附一次（g22：同一張卡第 92～170 天出了 9 次）；改得回來：點第一次那行跳 C9 的選項加「每次都問我」
    const again = takeBellyNotes(tanks);
    expect(again.map((n) => n.text)).toContainEqual(expect.stringMatching(/快生了，照你的設定生下來挑備用種魚$/));
    expect(again.some((n) => n.setting)).toBe(false);
    const setting = told.find((n) => n.setting)!.setting!;
    expect(setting.options.map((o) => o.key)).toEqual(['auto:grow', 'auto:sell', 'auto:keep', 'ask']);
    expect(setting.options.find((o) => o.recommended)?.key).toBe('auto:keep');
    expect(chooseOption(tanks, 'C9', 'auto:grow')).toBeNull();
    expect(st.picked.C9).toBe('grow');
    expect(chooseOption(tanks, 'C9', 'ask')).toBeNull();
    other.pregnancy = 0;
    takeSecondBrood(tanks);
    s.hours += 30 * 24;
    storeMom.pregnancy = BROOD_AGAIN_SHOWS;
    const back = nextDay(tanks);
    expect(back?.id).toBe('C9');
    expect(back!.options[0].label).toBe('照上次：留在繁殖缸長大');
  });

  it('C9 問過的那胎沒生出小魚（流產、被吃光）就收掉，這尾母魚下一胎還會再問', () => {
    const { tanks, s, st, storeMom, mom } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    mom.lengthCm = ADULT_CM + 0.2;
    st.secondBrood = { momId: storeMom.id, hours: s.hours - 30 * 24, prevKids: 4, born: 12, choice: 'keep' };
    st.broods = 1;
    storeMom.pregnancy = SECOND_BROOD_SHOWS;
    expect(takeChoice(tanks)?.id).toBe('C9');
    expect(chooseOption(tanks, 'C9', 'same')).toBeNull();
    expect(st.broodQueue).toHaveLength(1);
    // 這胎生了但小魚當晚被吃光：沒有小魚、肚子也消了
    s.hours += 5 * 24;
    storeMom.pregnancy = 0;
    expect(takeSecondBrood(tanks)).toBeNull();
    expect(st.broodQueue).toEqual([]);
    // 下一胎又快生了，還會再問
    s.hours += 20 * 24;
    storeMom.pregnancy = SECOND_BROOD_SHOWS;
    expect(takeChoice(tanks)?.id).toBe('C9');
  });

  it('C9 第一次問的第二窩沒生出小魚也會收掉，不會卡住之後的窩', () => {
    const { tanks, s, st, storeMom, mom } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    mom.lengthCm = ADULT_CM + 0.2;
    st.secondBrood = { momId: storeMom.id, hours: s.hours, prevKids: 4, choice: 'keep' };
    storeMom.pregnancy = 0;
    expect(takeSecondBrood(tanks)).toBeNull();
    expect(st.secondBrood.born).toBe(0);
    s.hours += 20 * 24;
    storeMom.pregnancy = SECOND_BROOD_SHOWS;
    delete st.shown.C9;
    expect(takeChoice(tanks)?.id).toBe('C9');
  });

  it('C10 新的一窩長到幼魚、有一尾比留種的好：兩尾都留就多標一尾留種；同一窩不會一尾一尾重問', () => {
    const { tanks, s, st, mom, kid } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    mom.lengthCm = ADULT_CM + 0.2;
    const brood = [0, 1, 2, 3].map(() => kid(s, 'female', 1.8));
    for (const f of brood) f.bornHours = s.hours - 14 * 24;
    // 其中兩尾是白子、蛇紋都帶的（比原本的母魚好）
    const better: GuppyGenome = { ...mom.genome!, albino: [1, 1], red: [1, 1], snakeX: [1, 1], gold: [0, 0], tuxedo: [0, 0] };
    brood[1].genome = { ...better };
    brood[2].genome = { ...better };
    const c10 = takeChoice(tanks);
    expect(c10?.id).toBe('C10');
    expect(c10!.title).toBe('這尾比你留的種魚更好！');
    expect(c10!.owner).toMatch(/的孫代機率約 [\d.]+%，原本的.*約 [\d.]+%。$/);
    expect(c10!.options.map((o) => o.key)).toEqual(['swap', 'both', 'keep']);
    expect(c10!.options[1].outcome).toMatch(/留種名額 3\/6/);
    expect(chooseOption(tanks, 'C10', 'both')).toBeNull();
    expect(brood.filter((f) => f.keeper).length).toBe(1);
    expect(mom.keeper).toBe(true);
    // 選了就有回音（#452）：兩尾都留也要說名額和機率
    expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual([expect.stringMatching(/^兩尾都留了，留種名額 3\/6，孫代機率(是|從) [\d.]+%/)]);
    // 同一窩另一尾一樣好：不再問
    s.hours += 4 * 24;
    expect(takeChoice(tanks)?.id).not.toBe('C10');
  });

  it('C10 換成這尾：新的母魚變成留種那對，原本的不再留種', () => {
    const { tanks, s, st, mom, kid } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    const brood = [0, 1, 2].map(() => kid(s, 'female', 1.8));
    for (const f of brood) f.bornHours = s.hours - 14 * 24;
    brood[0].genome = { ...mom.genome!, albino: [1, 1], red: [1, 1], snakeX: [1, 1], gold: [0, 0], tuxedo: [0, 0] };
    expect(takeChoice(tanks)?.id).toBe('C10');
    // 路線卡常駐孫代機率和開獎日（polish-to-9.md §10.4）；換了種魚當場變，早上報告寫回音
    const before = dreamRoute(tanks).odds!;
    expect(before.pct).toBe(st.better!.oldPct);
    expect(before.day).toBeGreaterThan(Math.floor(s.hours / 24));
    expect(chooseOption(tanks, 'C10', 'swap')).toBeNull();
    expect(st.pair![0]).toBe(brood[0].id);
    expect(brood[0].keeper).toBe(true);
    expect(mom.keeper).toBeFalsy();
    const after = dreamRoute(tanks).odds!;
    expect(after.pct).toBeGreaterThan(before.pct);
    expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual([`換了種魚以後，孫代機率從 ${before.pct}% 變成 ${after.pct}%`]);
  });

  it('C10 留種名額滿了：換掉同性別離夢想魚最遠的那尾；不是那對的就當備用，計畫照走（strain-fixing.md §1）', () => {
    const { tanks, s, t2, st, mom, kid } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    // 名額塞滿（都在繁殖缸）：再標 4 尾留種，其中一尾母魚什麼都不帶（最遠）
    const plain = kid(t2, 'female', ADULT_CM);
    plain.genome = { ...mom.genome!, albino: [0, 0], red: [0, 0], snakeX: [0, 0] };
    for (const f of [plain, kid(t2, 'male', ADULT_CM), kid(t2, 'male', ADULT_CM), kid(t2, 'male', ADULT_CM)]) f.keeper = true;
    const brood = [0, 1, 2].map(() => kid(s, 'female', 1.8));
    for (const f of brood) f.bornHours = s.hours - 14 * 24;
    brood[0].genome = { ...mom.genome!, albino: [1, 1], red: [1, 1], snakeX: [1, 1], gold: [0, 0], tuxedo: [0, 0] };
    const c10 = takeChoice(tanks)!;
    expect(c10.id).toBe('C10');
    expect(c10.options.map((o) => o.key)).toEqual(['replace', 'keep']);
    expect(c10.options[0].recommended).toBe(true);
    expect(c10.options[0].outcome).toMatch(/不再留種，這尾當備用，原本的計畫照走$/);
    expect(chooseOption(tanks, 'C10', 'replace')).toBeNull();
    expect(plain.keeper).toBeFalsy();
    expect(brood[0].keeper).toBe(true);
    expect(st.pair![0]).toBe(mom.id);
  });

  it('C10 留種名額滿了、最遠的是那對的媽媽：換掉後新的這尾接手當媽媽', () => {
    const { tanks, s, t2, st, mom, kid } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    for (const f of [kid(t2, 'male', ADULT_CM), kid(t2, 'male', ADULT_CM), kid(t2, 'male', ADULT_CM), kid(t2, 'male', ADULT_CM)]) f.keeper = true;
    const best = { ...mom.genome!, albino: [1, 1], red: [1, 1], snakeX: [1, 1], gold: [0, 0], tuxedo: [0, 0] } as GuppyGenome;
    mom.genome = { ...mom.genome!, albino: [0, 0], red: [0, 0], snakeX: [0, 0] };
    const brood = [0, 1, 2].map(() => kid(s, 'female', 1.8));
    for (const f of brood) f.bornHours = s.hours - 14 * 24;
    brood[0].genome = best;
    const c10 = takeChoice(tanks)!;
    expect(c10.id).toBe('C10');
    expect(c10.options[0].outcome).toMatch(/^孫代 [\d.]+% → [\d.]+%$/);
    expect(chooseOption(tanks, 'C10', 'replace')).toBeNull();
    expect(mom.keeper).toBeFalsy();
    expect(st.pair![0]).toBe(brood[0].id);
  });

  it('C13 說懷上了到 C15 之間：肚子圓起來了說一次（懷孕期間節奏 ≤ 7 天，midgame.md §6.4）', () => {
    const { tanks, st, mom } = latePair();
    mom.lengthCm = ADULT_CM + 0.3;
    mom.pregnancy = 0.2;
    expect(takeBellyNotes(tanks)).toEqual([]);
    Object.assign(st.picked, { C11: 'split', C12: 'one', C13: 'standard' });
    expect(takeBellyNotes(tanks)).toEqual([]);
    mom.pregnancy = 0.35;
    expect(takeBellyNotes(tanks).map((n) => n.text)).toEqual([expect.stringMatching(/的肚子圓起來了$/)]);
    expect(takeBellyNotes(tanks)).toEqual([]);
  });

  it('C15 夢想魚那窩過一半：等快生再放育幼盒（沒有就先買），快生了自己放進去；懷孕後段有里程碑，生下來那天開獎', () => {
    const { tanks, t2, s, st, mom, dad } = latePair();
    Object.assign(st.picked, { C11: 'split', C12: 'one', C13: 'standard' });
    mom.lengthCm = ADULT_CM + 0.3;
    mom.pregnancy = REVEAL_SHOWS;
    const c15 = takeChoice(tanks);
    expect(c15?.id).toBe('C15');
    expect(c15!.title).toBe('夢想魚的那窩過一半了！');
    expect(c15!.owner).toMatch(/什麼時候把.*母魚移到產房？$/);
    expect(c15!.options.map((o) => o.key)).toEqual(['plants', 'box']);
    expect(c15!.options[1]).toMatchObject({ recommended: true });
    expect(c15!.options[1].label).toMatch(/^等快生再放育幼盒（買一個 \d+ 元）$/);
    expect(c15!.options[1].disabled).toBeUndefined();
    expect(st.reveal).toMatchObject({ momId: mom.id });
    const coins = economy(s).coins;
    expect(chooseOption(tanks, 'C15', 'box')).toBeNull();
    expect(economy(s).coins).toBeLessThan(coins);
    expect(t2.nurseryBox).toBe(true);
    expect(mom.nursery).toBeFalsy();
    expect(takeBellyNotes(tanks)).toEqual([]);
    // 胎斑變黑、看得到眼睛：各說一次；快生了自己放進育幼盒
    mom.pregnancy = 0.75;
    expect(takeBellyNotes(tanks).map((n) => n.text)).toEqual([expect.stringMatching(/的胎斑變大、變黑了$/)]);
    mom.pregnancy = BOX_DUE;
    nextDay(tanks);
    expect(mom.nursery).toBe(true);
    expect(takeBellyNotes(tanks).map((n) => n.text)).toEqual(['胎斑裡看得到小魚的眼睛了！快生了']);
    expect(takeBellyNotes(tanks)).toEqual([]);
    // 還沒生：不開獎
    expect(takeReveal(tanks)).toBeNull();
    s.hours += 5 * 24;
    mom.pregnancy = 0;
    const rng = { seed: 11 };
    const fry = Array.from({ length: 6 }, (_, i) => {
      const sex = i % 2 === 0 ? 'male' : 'female';
      const f = addFish(t2, 'guppy', { ...calm, sex, pregnant: false });
      f.genome = cross(rng, mom.genome!, dad.genome!, sex);
      f.generation = 2;
      f.motherId = mom.id;
      f.bornHours = s.hours;
      return f;
    });
    const news = takeReveal(tanks);
    expect(news?.dream).toBe(DREAM_FISH.name);
    expect(news!.fry.map((f) => f.fishId)).toEqual(fry.map((f) => f.id));
    const both = news!.fry.filter((f) => f.albino && f.snake).length;
    expect(news!.both).toBe(both);
    expect(news!.text).toBe(both > 0 ? `有 ${both} 尾兩樣都有，長大後可能就是${DREAM_FISH.name}！` : '這窩沒有，但牠們身上都帶著基因，下一代還有機會');
    expect(takeReveal(tanks)).toBeNull();
    // 開獎之後，這尾母魚的下一窩改由 C9 問
    expect(st.reveal!.done).toBe(true);
  });

  it('C15 沒有育幼盒又錢不夠：育幼盒那個選項不能選、寫原因，改推薦移去繁殖缸', () => {
    const { tanks, s, st, mom } = latePair();
    Object.assign(st.picked, { C11: 'split', C12: 'one', C13: 'standard' });
    mom.lengthCm = ADULT_CM + 0.3;
    mom.pregnancy = REVEAL_SHOWS;
    economy(s).coins = 20;
    const c15 = takeChoice(tanks)!;
    expect(c15.options[1]).toMatchObject({ key: 'box', recommended: false, disabled: expect.stringMatching(/^錢不夠：育幼盒要 \d+ 元$/) });
    expect(c15.options[0]).toMatchObject({ key: 'plants', recommended: true });
    expect(chooseOption(tanks, 'C15', 'box')).toMatch(/^錢不夠/);
  });

  it('沒選 C15 也照樣開獎（快生了就記下來）', () => {
    const { tanks, st, mom } = latePair();
    Object.assign(st.picked, { C11: 'split', C12: 'one', C13: 'standard', C15: 'plants' });
    mom.lengthCm = ADULT_CM + 0.3;
    mom.pregnancy = REVEAL_SHOWS + 0.05;
    takeChoice(tanks);
    expect(st.reveal).toMatchObject({ momId: mom.id });
  });

  it('種魚長大了、母魚生白點沒配上：懷上之後早上報告說「因為白點，配對晚了約 N 天」', () => {
    const { tanks, t2, st, mom } = latePair();
    Object.assign(st.picked, { C11: 'split', C12: 'one' });
    mom.lengthCm = ADULT_CM + 0.3;
    mom.ich = { stage: 'visible', progress: 0, cause: 'new_fish' };
    for (let d = 0; d < 3; d++) nextDay(tanks);
    expect(takeBellyNotes(tanks)).toEqual([]);
    mom.ich = { stage: 'none', progress: 0 };
    mom.pregnancy = 0.05;
    expect(t2.fish).toContain(mom);
    expect(takeBellyNotes(tanks).map((n) => n.text)).toEqual(['因為白點，配對晚了約 3 天']);
    expect(takeBellyNotes(tanks)).toEqual([]);
  });

  it('C14 擠的多半是小小魚：推薦公母分開；選了把公魚搬去別缸，之後長大的公魚每天自動搬（midgame.md §7.2）', () => {
    const { tanks, s, t2, st } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    orderBoard(s).orders = [];
    const male = addFish(s, 'guppy', { ...calm, sex: 'male', pregnant: false });
    while (crowdingRatio(s) < CROWD_WARN + 0.05) {
      const f = addFish(s, 'guppy', { ...calm, pregnant: false });
      f.lengthCm = 1.4;
      f.ageDays = 3;
    }
    const c14 = takeChoice(tanks)!;
    expect(c14.id).toBe('C14');
    expect(c14.options.find((o) => o.recommended)?.key).toBe('split');
    expect(chooseOption(tanks, 'C14', 'split')).toBeNull();
    expect(t2.fish.some((f) => f.id === male.id)).toBe(true);
    expect(st.crowdSplit).toEqual([0]);
    // 之後長大的公魚：早上自動搬，報告寫一行
    const later = addFish(s, 'guppy', { ...calm, sex: 'male', pregnant: false });
    nextDay(tanks);
    expect(t2.fish.some((f) => f.id === later.id)).toBe(true);
    expect(takeCrowdNotes(tanks).some((n) => /公魚長大了，照你的設定搬到/.test(n.text))).toBe(true);
  });

  it('C14 加強版（≥ 100%）：標題寫太擠了、寫氨；先多換水撐 2 天，2 天後再問', () => {
    const { tanks, s, st } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    orderBoard(s).orders = [];
    while (crowdingRatio(s) < CROWD_FULL + 0.1) addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
    const c14 = takeChoice(tanks)!;
    expect(c14.title).toMatch(/太擠了$/);
    expect(c14.owner).toMatch(/^氨 [\d.]+.*再不處理會開始死魚。$/);
    expect(c14.options.find((o) => o.key === 'water')!.outcome).toBe('換三成水，撐 2 天');
    // 先多換水只是撐著，永遠不標推薦（daily-loop.md §4）
    expect(c14.options.find((o) => o.key === 'water')!.recommended).toBeFalsy();
    expect(chooseOption(tanks, 'C14', 'water')).toBeNull();
    expect(nextDay(tanks)?.id).not.toBe('C14');
    expect(nextDay(tanks)?.id).toBe('C14');
  });

  it('C14 搬一些過去：不選加熱棒壞了、水太冷的缸，選項反灰寫為什麼（#404，g31）', () => {
    const { tanks, s, st } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    orderBoard(s).orders = [];
    const t2 = tanks[1];
    t2.equipment.heater!.broken = true;
    t2.environment.roomTempC = 16;
    t2.water.tempC = 18;
    while (crowdingRatio(s) < CROWD_FULL + 0.1) addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
    const c14 = takeChoice(tanks)!;
    expect(c14.id).toBe('C14');
    const move = c14.options.find((o) => o.key === 'move');
    expect(move?.recommended).toBeFalsy();
    expect(move?.disabled).toMatch(/太冷了，先把加熱棒弄好$/);
    expect(chooseOption(tanks, 'C14', 'move')).not.toBeNull();
  });

  it('C14 搬一些：搬去的缸沒打氣、搬過去的小魚又多，寫明容易缺氧；買得起就順便加打氣機，買不起寫還差多少、照樣點得下去', () => {
    const setup = (coins: number) => {
      const { tanks, s, st } = latePair();
      Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
      orderBoard(s).orders = [];
      tanks[1].equipment.airPump = null;
      // 大魚都是留種的（不搬），搬的只有小魚；搬去的缸沒有會吃小魚的大魚
      for (const f of s.fish) f.keeper = true;
      tanks[1].fish = [];
      delete tanks[1].purpose;
      while (crowdingRatio(s) < CROWD_FULL + 0.1) Object.assign(addFish(s, 'guppy', { ...calm, pregnant: false }), { lengthCm: 1.2, ageDays: 20 });
      economy(s).coins = coins;
      return { tanks, s };
    };
    const rich = setup(5000);
    const card = takeChoice(rich.tanks)!;
    expect(card.id).toBe('C14');
    const move = card.options.find((o) => o.key === 'move')!;
    expect(move.outcome).toMatch(/沒打氣，小魚多容易缺氧，先加一台打氣機（\d+ 元）再搬$/);
    expect(chooseOption(rich.tanks, 'C14', 'move')).toBeNull();
    expect(rich.tanks[1].equipment.airPump?.on).toBe(true);
    const poor = setup(airPumpPrice() - 30);
    const outcome = takeChoice(poor.tanks)!.options.find((o) => o.key === 'move')!;
    expect(outcome.outcome).toMatch(/沒打氣，小魚多容易缺氧（打氣機還差 30 元，搬過去要多換水）$/);
    expect(outcome.disabled).toBeUndefined();
    expect(chooseOption(poor.tanks, 'C14', 'move')).toBeNull();
    expect(poor.tanks[1].equipment.airPump).toBeNull();
  });

  it('C14 超過建議量、除了先多換水什麼都選不了（擠的是小小魚、錢也不夠）：不出卡（daily-loop.md §4）', () => {
    const { tanks, s, st, storeMom } = latePair();
    storeMom.keeper = true;
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    orderBoard(s).orders = [];
    economy(s).coins = 0;
    while (crowdingRatio(s) < CROWD_FULL + 0.1) {
      const f = addFish(s, 'guppy', { ...calm, pregnant: false });
      f.lengthCm = 0.7;
      f.ageDays = 2;
      f.generation = 1;
    }
    st.shown.C6 = s.hours - 24;
    expect(takeChoice(tanks)?.id).not.toBe('C14');
  });

  it('C14 連賣兩次之後推薦「以後太擠就自動賣」；選了之後擠了早上自動賣，不再跳卡', () => {
    const { tanks, s, st } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
    orderBoard(s).orders = [];
    const crowd = () => {
      while (crowdingRatio(s) < CROWD_WARN + 0.1) addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
    };
    st.crowdSells = 2;
    crowd();
    const c14 = takeChoice(tanks)!;
    const auto = c14.options.find((o) => o.key === 'auto')!;
    expect(auto).toMatchObject({ label: '以後太擠就自動賣給阿德', recommended: true });
    expect(chooseOption(tanks, 'C14', 'auto')).toBeNull();
    expect(st.crowdAuto).toBe(true);
    crowd();
    s.hours += 24 * 8;
    expect(takeChoice(tanks)?.id).not.toBe('C14');
    expect(crowdingRatio(s)).toBeLessThan(CROWD_WARN);
    expect(takeCrowdNotes(tanks).some((n) => /又擠了，照你的設定賣了 \d+ 尾給阿德，收入 \d+ 元。/.test(n.text))).toBe(true);
  });

  it('擠缸預告：≥ 60% 而且算上快生的那窩會超過建議量，早上報告說一次；超過建議量每天第一行；都記成提醒過', () => {
    const { tanks, s } = latePair();
    const mom = addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
    // 擠到 85%：算上快生那窩（兩週後的大小）才會超過建議量
    while (crowdingRatio(s) < CROWD_PREVIEW + 0.25) addFish(s, 'guppy', { ...calm, sex: 'male', pregnant: false });
    expect(crowdingRatio(s)).toBeLessThan(CROWD_FULL);
    mom.pregnancy = 0.8;
    const first = takeCrowdNotes(tanks).filter((n) => n.tank === 0);
    expect(first).toHaveLength(1);
    // 這窩大（≥ 每公升 0.5 尾）：大窩換水的提醒併在同一行（polish-to-9.md §10.1 補充）
    expect(first[0].text).toMatch(/現在 \d+ 尾，.+快生了，生完大約 \d+ 尾，會住不太下；只有 40L，生完氨會升高，生產那幾天要多換水。$/);
    expect(takeCrowdNotes(tanks).filter((n) => n.tank === 0)).toHaveLength(0);
    while (crowdingRatio(s) < CROWD_FULL + 0.05) addFish(s, 'guppy', { ...calm, sex: 'male', pregnant: false });
    const full = takeCrowdNotes(tanks).find((n) => n.tank === 0)!;
    expect(full).toMatchObject({ full: true });
    expect(full.text).toMatch(/太擠了，魚擠到水面喘氣。$/);
    expect(s.crowdNotices).toBe(2);
  });

  it('大窩生在小缸的當天只說「今天、明天各換三成水」，同缸另一尾快生的預告留到隔天（#452）', () => {
    const { tanks, s } = latePair();
    const other = addFish(s, 'guppy', { ...calm, sex: 'female', pregnant: false });
    other.pregnancy = 0.9;
    const warned = () => takeCrowdNotes(tanks).filter((n) => n.tank === 0 && /生完氨會升高/.test(n.text)).map((n) => n.text);
    for (let i = 0; i < 24; i++) Object.assign(addFish(s, 'guppy', { ...calm, pregnant: false }), { generation: 1, bornHours: s.hours - 2, lengthCm: 0.6 });
    expect(warned()).toEqual([expect.stringMatching(/^一窩 24 尾生在 40L 的.+，生完氨會升高，今天、明天各換三成水。$/)]);
  });

  it(`開獎版 C10（C16）：開獎後 ${REVEAL_CULL_DAYS} 天，留 4～6 尾候選（公母都有），其他賣給阿德（midgame.md §7.3）`, () => {
    const { tanks, s, t2, st, mom, dad } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard', C15: 'plants' });
    st.reveal = { momId: mom.id, hours: s.hours - (REVEAL_CULL_DAYS + 1) * 24, done: true, born: 14 };
    const rng = { seed: 9 };
    const fry = Array.from({ length: 14 }, (_, i) => {
      const f = addFish(t2, 'guppy', { ...calm, sex: i % 2 ? 'male' : 'female', pregnant: false });
      f.genome = cross(rng, mom.genome!, dad.genome!, f.sex);
      f.generation = 2;
      f.motherId = mom.id;
      f.bornHours = st.reveal!.hours + 1;
      f.lengthCm = 1.3;
      f.ageDays = REVEAL_CULL_DAYS + 1;
      return f;
    });
    const c = takeChoice(tanks)!;
    expect(c.id).toBe('C16');
    expect(c.title).toBe('開獎那窩長大一點了');
    const cull = c.options.find((o) => o.key === 'cull')!;
    expect(cull.recommended).toBe(true);
    expect(cull.label).toMatch(/^留 [4-6] 尾候選，其他賣掉$/);
    const coins = economy(s).coins;
    expect(chooseOption(tanks, 'C16', 'cull')).toBeNull();
    const left = fry.filter((f) => t2.fish.includes(f));
    expect(left.length).toBeGreaterThanOrEqual(4);
    expect(left.length).toBeLessThanOrEqual(6);
    expect(new Set(left.map((f) => f.sex)).size).toBe(2);
    expect(economy(s).coins).toBeGreaterThan(coins);
    expect(takeChoice(tanks)?.id).not.toBe('C16');
  });

  it('C16 挑法（strain-fixing.md §5）：夢想魚樣子 → 帶兩種基因 → 最近，公母各至少 2 尾；母魚不夠用原本的種魚補', () => {
    const { tanks, s, t2, st, mom } = latePair();
    Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard', C15: 'plants' });
    st.reveal = { momId: mom.id, hours: s.hours - (REVEAL_CULL_DAYS + 1) * 24, done: true, born: 14 };
    mom.lengthCm = ADULT_CM + 0.2;
    const base = { ...mom.genome!, red: [1, 1], gold: [0, 0], tuxedo: [0, 0], grass: [0, 0] } as GuppyGenome;
    const mk = (sex: 'male' | 'female', g: Partial<GuppyGenome>) => {
      const f = addFish(t2, 'guppy', { ...calm, sex, pregnant: false });
      f.genome = { ...base, y: sex === 'male' ? { snake: 0, grass: 0 } : null, ...g };
      f.generation = 2;
      f.motherId = mom.id;
      f.bornHours = st.reveal!.hours + 1;
      f.lengthCm = 1.3;
      f.ageDays = REVEAL_CULL_DAYS + 1;
      return f;
    };
    const dream = [0, 1, 2].map(() => mk('male', { albino: [1, 1], snakeX: [1] }));
    const carrier = mk('male', { albino: [1, 0], snakeX: [1] });
    const plainMales = [0, 1, 2].map(() => mk('male', { albino: [0, 0], snakeX: [0] }));
    // 母魚只有 1 尾，帶兩種基因
    const girl = mk('female', { albino: [1, 0], snakeX: [1, 0] });
    const c = takeChoice(tanks)!;
    expect(c.id).toBe('C16');
    expect(c.note).toMatch(/^這窩母魚不夠，.+一起當候選$/);
    // 這窩留 4 尾：3 尾夢想魚樣子 + 唯一的母魚（公母各 2 尾優先於帶兩種基因的公魚），再加補上的原本種魚（母）
    const ids = c.fish!.map((f) => f.fishId);
    for (const f of [...dream, girl, mom]) expect(ids).toContain(f.id);
    for (const f of [carrier, ...plainMales]) expect(ids).not.toContain(f.id);
    expect(c.fish!.filter((f) => f.sex === 'female').length).toBeGreaterThanOrEqual(2);
    expect(chooseOption(tanks, 'C16', 'cull')).toBeNull();
    for (const f of plainMales) expect(t2.fish).not.toContain(f);
    expect(t2.fish).toContain(girl);
    expect(t2.fish).toContain(mom);
  });
});

describe('固定品系：蛇紋和穩定度里程碑（strain-fixing.md §2，#344）', () => {
  /** 開獎過了：mom 生的開獎那窩 n 尾（k 尾夢想魚公魚），出生在 bornHours。 */
  function brood(t: TankState, motherId: number, bornHours: number, n: number, k: number, dad: Fish): Fish[] {
    return Array.from({ length: n }, (_, i) => {
      const f = addFish(t, 'guppy', { ...calm, sex: 'male', pregnant: false });
      f.genome = structuredClone(dad.genome!);
      if (i < k) f.genome.albino = [1, 1];
      f.generation = 2;
      f.motherId = motherId;
      f.bornHours = bornHours;
      return f;
    });
  }

  it('開獎那窩：滿 20 天說蛇紋出來，不出穩定度卡；下一代那窩滿 25 天出穩定度卡，寫比上一代多幾 %', () => {
    const { s, t2, tanks, st, mom, dad } = latePair();
    st.reveal = { momId: mom.id, hours: s.hours, done: true, born: 10 };
    const first = brood(t2, mom.id, s.hours + 1, 10, 1, dad);
    expect(takeLineNotes(tanks)).toEqual([]);
    expect(st.line!.broods).toMatchObject([{ momId: mom.id, n: 10, k: 1, gen: 1 }]);
    s.hours += SNAKE_DAYS * 24 + 2;
    const snake = takeLineNotes(tanks);
    expect(snake).toHaveLength(1);
    expect(snake[0].text).toMatch(/身上的蛇紋出來了。$/);
    // 開獎那窩是起點：滿 25 天也不說
    s.hours += (STABILITY_DAYS - SNAKE_DAYS) * 24;
    expect(takeLineNotes(tanks)).toEqual([]);
    expect(dreamRoute(tanks).stability).toBe(10);

    // 開獎那窩的女兒當新媽媽，生下一代：8 尾裡 5 尾
    const daughter = first[1];
    daughter.sex = 'female';
    st.pair = [daughter.id, dad.id];
    const born2 = s.hours + 1;
    brood(t2, daughter.id, born2, 8, 5, dad);
    takeLineNotes(tanks);
    expect(st.line!.broods[1]).toMatchObject({ momId: daughter.id, n: 8, k: 5, gen: 2 });
    // 紅眼睛和蛇紋中間：滿 11 天說一次尾鰭、滿 16 天說一次上色
    s.hours = born2 + FINS_DAYS * 24;
    expect(takeLineNotes(tanks).map((n) => n.text)).toEqual(['新的這窩小魚尾鰭開始散開了，看得出誰的尾巴比較大']);
    expect(takeLineNotes(tanks)).toEqual([]);
    s.hours = born2 + COLOR_DAYS * 24;
    expect(takeLineNotes(tanks)[0].text).toMatch(/顏色/);
    expect(takeLineNotes(tanks)).toEqual([]);
    s.hours = born2 + SNAKE_DAYS * 24;
    expect(takeLineNotes(tanks)[0].text).toMatch(/蛇紋/);
    s.hours = born2 + STABILITY_DAYS * 24;
    const card = takeLineNotes(tanks);
    expect(card[0].text).toBe(`這窩 8 尾裡，5 尾是${DREAM_FISH.name}，穩定度 63%（比上一代多 53%）。再配一代，穩定度會更高。`);
    expect(card[0].stability).toBe(63);
    expect(takeLineNotes(tanks)).toEqual([]);
    expect(dreamRoute(tanks).steps[3].done).toBe(false);
  });
});

describe('固定品系：C17 誰配誰、C19 引進新血（strain-fixing.md §2.2、§5，#344）', () => {
  /** 開獎過了、C16 挑過：開獎那窩的候選（公母各 2，看得出公母），近交係數照給的。 */
  function lineSetup(inbreeding: number) {
    const ctx = latePair();
    const { s, t2, st, mom, dad } = ctx;
    Object.assign(st.picked, { C11: 'split', C12: 'one', C13: 'standard', C15: 'plants', C16: 'cull' });
    mom.lengthCm = ADULT_CM + 0.2;
    st.reveal = { momId: mom.id, hours: s.hours - 45 * 24, done: true, born: 4 };
    st.revealCullAsked = true;
    const rng = { seed: 11 };
    const kids = (['male', 'male', 'female', 'female'] as const).map((sex) => {
      const f = addFish(t2, 'guppy', { ...calm, sex, pregnant: false });
      f.genome = cross(rng, mom.genome!, dad.genome!, sex);
      f.genome.albino = [1, 1];
      f.genome.red = [1, 1];
      f.genome.snakeX = sex === 'male' ? [1] : [1, 0];
      f.generation = 2;
      f.motherId = mom.id;
      f.lineage = mom.lineage ?? mom.id;
      f.inbreeding = inbreeding;
      f.bornHours = st.reveal!.hours + 1;
      f.lengthCm = ADULT_CM;
      return f;
    });
    // 都跟留種那對比過了（C10 不再出）
    st.compared = kids.map((k) => k.id);
    return { ...ctx, kids };
  }

  it('品系最新一代的候選（公母各至少 2 尾、最多 6 尾）不賣、不交單，等 C17 挑誰配誰', () => {
    const { tanks, st, kids } = lineSetup(0.25);
    takeChoice(tanks);
    expect(new Set(st.lineKeep)).toEqual(new Set(kids.map((k) => k.id)));
    const held = reservedForPick(tanks[0]);
    for (const k of kids) expect(held.has(k.id)).toBe(true);
  });

  it('候選超過 6 尾、夢想魚基因一樣好：先留尾鰭好的，尾鰭差的才可以交單（polish-to-9.md §13.7）', () => {
    const { tanks, t2, st, kids } = lineSetup(0.25);
    const more = kids.map((k) => Object.assign(addFish(t2, 'guppy', { ...calm, sex: k.sex, pregnant: false }), { genome: { ...k.genome! }, generation: 2, motherId: k.motherId, lineage: k.lineage, inbreeding: k.inbreeding, bornHours: k.bornHours, lengthCm: ADULT_CM }));
    const all = [...kids, ...more];
    // 同性別的基因都一樣（排名一樣），只差尾鰭
    all.forEach((f, i) => (f.genome = { ...(f.sex === 'male' ? kids[0] : kids[2]).genome!, tail: 30 + i * 5 }));
    st.compared = all.map((k) => k.id);
    takeChoice(tanks);
    const kept = new Set(st.lineKeep);
    expect(kept.size).toBe(6);
    for (const sex of ['male', 'female'] as const) {
      const mine = all.filter((f) => f.sex === sex).sort((a, b) => b.genome!.tail - a.genome!.tail);
      const k = mine.filter((f) => kept.has(f.id)).length;
      expect(k).toBeGreaterThanOrEqual(2);
      expect(mine.slice(0, k).every((f) => kept.has(f.id))).toBe(true);
    }
  });

  it('候選放在收納箱裡也挑得到：C17 選了，那兩尾從箱子撈到繁殖缸、標留種（polish-to-9.md §13.7）', () => {
    const { tanks, t2, st, kids } = lineSetup(0.25);
    t2.fish = t2.fish.filter((f) => !kids.includes(f));
    t2.tub = { fish: [...kids] };
    const c = takeChoice(tanks)!;
    expect(c.id).toBe('C17');
    expect(chooseOption(tanks, 'C17', 'sib')).toBeNull();
    for (const id of st.pair!) {
      const f = kids.find((k) => k.id === id)!;
      expect(t2.fish.includes(f)).toBe(true);
      expect(t2.tub.fish.includes(f)).toBe(false);
      expect(f.keeper).toBe(true);
    }
  });

  it('C17：第二代兄妹配還推薦（近交 0.44 < 0.45），選了換成新的一對，C11～C13 這一代重新問', () => {
    const { tanks, st, kids, mom, dad } = lineSetup(0.25);
    const c = takeChoice(tanks)!;
    expect(c.id).toBe('C17');
    expect(c.title).toBe('下一代要誰配誰？');
    expect(c.options.map((o) => o.key)).toEqual(['sib', 'back', 'new']);
    expect(c.options[0].recommended).toBe(true);
    expect(c.options[0].outcome).toMatch(/^下一代夢想魚約 \d+%，尾鰭約 −11$/);
    expect(c.options[1].label).toMatch(/^(女兒配爸爸|兒子配媽媽)$/);
    expect(c.options[2].label).toMatch(/^配店裡的新魚（\d+ 元）$/);
    expect(c.options[2].outcome).toMatch(/^品系接著算第 \d+ 代，這一代約 \d+%，血統新、尾鰭不變差$/);
    expect(chooseOption(tanks, 'C17', 'sib')).toBeNull();
    const [m, d] = st.pair!;
    expect(kids.map((k) => k.id)).toEqual(expect.arrayContaining([m, d]));
    expect(mom.keeper).toBeFalsy();
    expect(dad.keeper).toBeFalsy();
    expect(kids.find((k) => k.id === m)!.keeper).toBe(true);
    expect(st.picked.C11).toBeUndefined();
    expect(st.nextGen).toBeDefined();
    // 同一代不再問
    tanks[0].hours += 5 * 24;
    expect(takeChoice(tanks)?.id).not.toBe('C17');
  });

  it('C17：品系還沒完成、自家配這一代就到 75%：先配完，不推換血；新魚選項寫品系接著算第幾代（#449）', () => {
    const { tanks } = lineSetup(0.4375);
    const c = takeChoice(tanks)!;
    expect(c.id).toBe('C17');
    const near = c.options.find((o) => o.key !== 'new' && o.recommended)!;
    expect(Number(near.outcome.match(/約 (\d+)%/)![1])).toBeGreaterThanOrEqual(LINE_FIXED_PCT);
    expect(c.options.find((o) => o.key === 'new')!.recommended).toBe(false);
    expect(c.options.find((o) => o.key === 'new')!.outcome).toMatch(/^品系接著算第 \d+ 代，/);
  });

  it('C17：品系完成以後，第三代（候選近交 0.44）改推配新魚，選了花錢買紅蛇王或全紅白子當另一半', () => {
    const { tanks, s, st, kids } = lineSetup(0.4375);
    st.lineNamed = { name: '測試', hours: s.hours - 24, stability: 80, n: 10, k: 8, done: { hours: s.hours - 24, stability: 80 } };
    const c = takeChoice(tanks)!;
    expect(c.id).toBe('C17');
    expect(c.options.find((o) => o.recommended)!.key).toBe('new');
    const coins = economy(s).coins;
    const before = new Set(tanks.flatMap((t) => t.fish.map((f) => f.id)));
    expect(chooseOption(tanks, 'C17', 'new')).toBeNull();
    expect(economy(s).coins).toBeLessThan(coins);
    const bought = st.pair!.filter((id) => !before.has(id));
    expect(bought).toHaveLength(1);
    expect(kids.map((k) => k.id)).toContain(st.pair!.find((id) => before.has(id)));
  });

  it('C19：最新一代近交 ≥ 0.45 問要不要引進新血；選繼續自己家配，之後每多 0.1 再問', () => {
    const { tanks, st, kids } = lineSetup(0.58);
    st.c17Gen = 1;
    st.picked.C17 = 'sib';
    const c = takeChoice(tanks)!;
    expect(c.id).toBe('C19');
    expect(c.title).toBe('血統有點太近了');
    expect(c.owner).toMatch(/^你的白子紅蛇王已經配了好幾代自己家的魚，尾鰭開始變差（平均 \d+）。$/);
    expect(c.options.map((o) => o.key)).toEqual(['new', 'keep']);
    expect(c.options[0].recommended).toBe(true);
    expect(chooseOption(tanks, 'C19', 'keep')).toBeNull();
    expect(st.c19At).toBeCloseTo(0.58);
    tanks[0].hours += 5 * 24;
    expect(takeChoice(tanks)?.id).not.toBe('C19');
    for (const k of kids) k.inbreeding = 0.69;
    tanks[0].hours += 24;
    expect(takeChoice(tanks)?.id).toBe('C19');
  });
});

describe('固定品系：C18 取名（穩定度 40%）和品系完成（75%）（strain-fixing.md §5、§7，#344、#351）', () => {
  /** 開獎那窩（起點）加上下一代一窩 n 尾、k 尾夢想魚，出生滿 25 天。 */
  function named(n: number, k: number) {
    const ctx = latePair();
    const { s, t2, st, mom, dad } = ctx;
    st.reveal = { momId: mom.id, hours: s.hours - 120 * 24, done: true, born: 10 };
    st.revealCullAsked = true;
    const mk = (motherId: number, born: number, dream: boolean, sex: 'male' | 'female') => {
      const f = addFish(t2, 'guppy', { ...calm, sex, pregnant: false });
      f.genome = { ...dad.genome!, albino: dream ? [1, 1] : [1, 0], red: [1, 1], snakeX: sex === 'male' ? [1] : [1, 1], gold: [0, 0], tuxedo: [0, 0], y: sex === 'male' ? { snake: 0, grass: 0 } : null };
      f.generation = 2;
      f.motherId = motherId;
      f.bornHours = born;
      f.lengthCm = 1.5;
      return f;
    };
    const first = mk(mom.id, st.reveal.hours + 1, false, 'female');
    const born = s.hours - 26 * 24;
    const kids = Array.from({ length: n }, (_, i) => mk(first.id, born, i < k, i % 2 ? 'male' : 'female'));
    st.pair = [first.id, dad.id];
    st.compared = [first.id, ...kids.map((f) => f.id)];
    // 記下兩窩、說過蛇紋，下一次早上才說穩定度
    takeLineNotes(ctx.tanks);
    takeLineNotes(ctx.tanks);
    return { ...ctx, kids, first };
  }

  it('穩定度第一次 ≥ 40% 出 C18：預設「自家系」，字詞檢查不過不收；取了名之後品系的夢想魚都掛名牌', () => {
    const { tanks, st, kids } = named(8, 5);
    expect(st.line!.broods[1]).toMatchObject({ n: 8, k: 5, told: true });
    const c = takeChoice(tanks)!;
    expect(c.id).toBe('C18');
    expect(c.title).toBe('你的品系穩定了！');
    expect(c.owner).toBe(`5／8 尾都是${DREAM_FISH.name}，品系初步固定了。幫它取個名字吧。`);
    expect(c.naming).toEqual({ suggested: LINE_NAME_SUGGESTED, stability: 63, dream: 5, total: 8, maxLen: 8 });
    expect(c.options.map((o) => o.key)).toEqual(['name', 'later']);
    expect(lineNameRefusal('')).not.toBeNull();
    expect(lineNameRefusal('一二三四五六七八九')).toBe('名字最多 8 個字');
    expect(chooseOption(tanks, 'C18', 'name', [], 'ab@c.tw')).toBe('名字不能放網址、帳號或電話');
    expect(chooseOption(tanks, 'C18', 'name', [], '幹系')).toBe('這個名字不能用，換一個吧');
    expect(st.lineNamed).toBeUndefined();
    expect(chooseOption(tanks, 'C18', 'name', [], '  小德  系 ')).toBeNull();
    expect(st.lineNamed).toMatchObject({ name: '小德 系', stability: 63, n: 8, k: 5 });
    expect(lineName(tanks, kids[0])).toBe('小德 系');
    expect(lineName(tanks, kids[7])).toBeNull();
    tanks[0].hours += 5 * 24;
    expect(takeChoice(tanks)?.id).not.toBe('C18');
  });

  it('還沒到 40% 不出；選晚點再取，過幾天再問', () => {
    const low = named(10, 3);
    expect(takeChoice(low.tanks)?.id).not.toBe('C18');
    const { tanks, st } = named(8, 6);
    expect(takeChoice(tanks)?.id).toBe('C18');
    expect(chooseOption(tanks, 'C18', 'later')).toBeNull();
    expect(st.lineNamed).toBeUndefined();
    tanks[0].hours += 24;
    expect(takeChoice(tanks)?.id).not.toBe('C18');
    tanks[0].hours += 3 * 24;
    expect(takeChoice(tanks)?.id).toBe('C18');
  });

  it('品系完成：取了名、那窩 ≥ 75% 的隔天早上說一次', () => {
    const { tanks, st } = named(8, 7);
    takeChoice(tanks);
    expect(chooseOption(tanks, 'C18', 'name', [], '小德系')).toBeNull();
    const done = takeLineNotes(tanks);
    expect(done).toEqual([expect.objectContaining({ done: true, stability: 88, text: `小德系這窩有 88% 是${DREAM_FISH.name}，品系完成了！指定的客人出價會高一半。` })]);
    expect(st.lineNamed!.done).toMatchObject({ stability: 88 });
    expect(takeLineNotes(tanks)).toEqual([]);
  });

  describe('又快生了（C9）的回音（polish-to-9.md §10.3）', () => {
    /** 選了 choice 的那窩剛生了 n 尾（在主缸）。 */
    function born(choice: string, n: number, cm = 0.7) {
      const p = latePair();
      const { s, st, storeMom, dad } = p;
      Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
      st.secondBrood = { momId: storeMom.id, hours: s.hours - 1, prevKids: 0, choice };
      st.broods = 1;
      const rng = { seed: 3 };
      const fry = Array.from({ length: n }, (_, i) => {
        const sex = i % 2 === 0 ? 'male' : 'female';
        const f = addFish(s, 'guppy', { ...calm, sex, pregnant: false });
        f.genome = cross(rng, storeMom.genome!, dad.genome!, sex);
        f.generation = 2;
        f.motherId = storeMom.id;
        f.bornHours = s.hours;
        f.lengthCm = cm;
        return f;
      });
      expect(takeSecondBrood(p.tanks)).not.toBeNull();
      return { ...p, fry };
    }

    it('留著長大：隔天說這窩幾尾、缸裡幾尾、建議量幾 %；超過 80% 多說再一窩就住不下', () => {
      const { tanks, s, st } = born('grow', 6);
      expect(takeEchoes(tanks, st)).toEqual([]);
      s.hours += 24;
      const [line] = takeEchoes(tanks, st);
      expect(line.label).toBe('留在繁殖缸長大');
      expect(line.text).toMatch(/^這窩 6 尾留在.+，缸裡現在 \d+ 尾（建議量 \d+%）/);
      expect(line.text.endsWith('再一窩就住不下了')).toBe(crowdingRatio(s) > 0.8);
    });

    it('挑備用種魚：隔天說挑了幾尾、其他幾尾留著長大', () => {
      const { tanks, s, st } = born('keep', 6);
      s.hours += 24;
      expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual([expect.stringMatching(/^挑了 \d 尾離夢想魚最近的當備用，其他的 \d 尾留著長大$/)]);
    });

    it('交小魚單：滿 7 天、板上有交得出的單就自動交，寫交了幾尾、多少錢', () => {
      const { tanks, s, st, fry } = born('sell', 6, 1.3);
      orderBoard(s).orders.push({ id: 991, kind: 'fry', species: 'guppy', minCm: 1.2, count: 4, unitPrice: 10, postedHours: s.hours });
      s.hours += 6 * 24;
      takeSecondBrood(tanks);
      expect(takeEchoes(tanks, st)).toEqual([]);
      s.hours += 24;
      for (const f of fry) f.ageDays = 7;
      // 別窩、比較小（會先被挑）的自家小魚不能被交掉（#440 架構審查）
      const other = Array.from({ length: 4 }, () => Object.assign(addFish(s, 'guppy', { ...calm, pregnant: false }), { generation: 1, lengthCm: 1.21, ageDays: 7 }));
      const coins = economy(s).coins;
      takeSecondBrood(tanks);
      expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual(['照你的設定交了 4 尾小魚，+40 元']);
      expect(economy(s).coins).toBe(coins + 40);
      expect(other.every((f) => s.fish.includes(f))).toBe(true);
      // 這窩還剩 2 尾：之後有交得出的單照樣交，回音寫這窩一共交了多少（#452：只交第一張，卡上估的整窩金額對不上）
      expect(st.fryDeliver).toHaveLength(1);
      orderBoard(s).orders.push({ id: 992, kind: 'fry', species: 'guppy', minCm: 1.2, count: 2, unitPrice: 12, postedHours: s.hours });
      s.hours += 24;
      takeSecondBrood(tanks);
      expect(takeEchoes(tanks, st).map((e) => e.text)).toEqual(['照你的設定又交了 2 尾，+24 元（這窩一共交了 6 尾、64 元）']);
      expect(st.fryDeliver).toEqual([]);
      expect(other.every((f) => s.fish.includes(f))).toBe(true);
    });

    it('交小魚單：一直交不出去，從上次交貨算起等 21 天就不等了', () => {
      const { tanks, s, st } = born('sell', 6, 1.3);
      s.hours += 7 * 24;
      takeSecondBrood(tanks);
      expect(st.fryDeliver).toHaveLength(1);
      s.hours += 14 * 24;
      takeSecondBrood(tanks);
      expect(st.fryDeliver).toEqual([]);
    });

  });

  describe('住不下（C14）的回音和修正（polish-to-9.md §10.2）', () => {
    it('收掉一缸：那缸的回音和自動交單不做了，後面的缸往前移（架構 #438、#440 🟡）', () => {
      const s = { echoes: [0, 1, 2].map((tank) => ({ label: 'x', tank, due: 0, text: `t${tank}` })), fryDeliver: [0, 1, 2].map((tank) => ({ ids: [tank], born: 0, tank })) };
      dropTankEchoes(s, 1);
      expect(s.echoes.map((e) => [e.tank, e.text])).toEqual([
        [0, 't0'],
        [1, 't2'],
      ]);
      // 第二窩自動交小魚單也跟著移（#440 架構審查）
      expect(s.fryDeliver.map((d) => [d.tank, d.ids[0]])).toEqual([
        [0, 0],
        [1, 2],
      ]);
    });

    const crowd = (tanks: TankState[], s: TankState, over = CROWD_WARN + 0.1) => {
      const st = choiceState(tanks);
      Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
      orderBoard(s).orders = [];
      while (crowdingRatio(s) < over) addFish(s, 'guppy', { ...calm, sex: 'male', pregnant: false });
      return st;
    };

    it('賣一批：隔天早上寫賣了幾尾、多少錢、缸現在幾 %，只出一次', () => {
      const { tanks, s } = latePair();
      const st = crowd(tanks, s);
      expect(takeChoice(tanks)?.id).toBe('C14');
      const coins = economy(s).coins;
      expect(chooseOption(tanks, 'C14', 'sell')).toBeNull();
      const lines = takeEchoes(tanks, st);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ tank: 0, label: '賣一批' });
      const [, n, plus, pct] = lines[0].text.match(/^賣了 (\d+) 尾，\+(\d+) 元，.+現在 (\d+)%$/)!;
      expect(Number(n)).toBeGreaterThan(0);
      expect(Number(plus)).toBe(economy(s).coins - coins);
      expect(Number(pct)).toBe(Math.round(crowdingRatio(s) * 100));
      expect(takeEchoes(tanks, st)).toEqual([]);
    });

    it('公母分開：當天寫搬了幾尾公魚，之後每週寫這缸和別缸各生了幾窩', () => {
      const { tanks, s } = latePair();
      const st = choiceState(tanks);
      Object.assign(st.picked, { C11: 'together', C12: 'one', C13: 'standard' });
      orderBoard(s).orders = [];
      addFish(s, 'guppy', { ...calm, sex: 'male', pregnant: false });
      while (crowdingRatio(s) < CROWD_WARN + 0.05) {
        const f = addFish(s, 'guppy', { ...calm, pregnant: false });
        f.lengthCm = 1.4;
        f.ageDays = 3;
      }
      expect(takeChoice(tanks)?.options.find((o) => o.recommended)?.key).toBe('split');
      expect(chooseOption(tanks, 'C14', 'split')).toBeNull();
      const first = takeEchoes(tanks, st);
      expect(first).toHaveLength(1);
      expect(first[0].label).toBe('公母分開，先別生了');
      expect(first[0].text).toMatch(/^公母分開了，\d+ 尾公魚搬到.+，.+(這週不會再有新的小魚|生完就不會再有新的小魚)$/);
      for (const t of tanks) t.hours += 7 * 24;
      const week = takeEchoes(tanks, st);
      expect(week).toHaveLength(1);
      expect(week[0].text).toMatch(/^.+這週 \d+ 窩，別缸 \d+ 窩$/);
    });

    it('先多換水：3 天後才寫撐了 3 天的結果，還是太擠就寫氨', () => {
      const { tanks, s } = latePair();
      const st = crowd(tanks, s, CROWD_FULL + 0.1);
      expect(chooseOption(tanks, 'C14', 'water')).toBeNull();
      expect(takeEchoes(tanks, st)).toEqual([]);
      for (const t of tanks) t.hours += 3 * 24;
      const lines = takeEchoes(tanks, st);
      expect(lines).toEqual([{ tank: 0, label: '先多換水撐幾天', text: expect.stringMatching(/^多換水撐了 3 天，魚還是太多，水又髒回來了（氨 [\d.]+）$/) }]);
    });

    it('錢不夠買缸：選項灰掉、寫還差幾元，點了不算選（g39：點了同一張卡又跳一次）', () => {
      const { tanks, s } = latePair();
      crowd(tanks, s, CROWD_FULL + 0.1);
      economy(s).coins = 100;
      const card = takeChoice(tanks);
      expect(card?.id).toBe('C14');
      const tank = card!.options.find((o) => o.key === 'tank')!;
      expect(tank).toMatchObject({ disabled: '錢不夠', short: newTankCost(tanks, 'nano20') - 100 });
      expect(chooseOption(tanks, 'C14', 'tank')).toBe('錢不夠');
      expect(choiceState(tanks).picked.C14).toBeUndefined();
    });

    it('有兩缸、另一缸也選過公母分開：公母分開反灰，但不寫「只有一缸」', () => {
      const { tanks, s, t2 } = latePair();
      const st = crowd(tanks, s, CROWD_FULL + 0.1);
      st.crowdSplit = [1];
      expect(tanks.indexOf(t2)).toBe(1);
      const split = takeChoice(tanks)?.options.find((o) => o.key === 'split');
      expect(split?.disabled).toBeDefined();
      expect(split?.disabled).not.toMatch(/只有一缸/);
    });
  });
});

describe('C14 收納箱暫養（polish-to-9.md §13.7）', () => {
  /** 主缸擠滿還不能賣的小小魚（店裡那尾母魚生的，不是品系），手上的錢買缸會剩不到 500。 */
  function crowdedFry(coins: number) {
    const { tanks, s, st, storeMom } = latePair();
    Object.assign(st.picked, { C6: 'move', C11: 'together', C12: 'one', C13: 'standard' });
    orderBoard(s).orders = [];
    // 繁殖缸也快滿了（成魚）：搬不過去
    while (crowdingRatio(tanks[1]) < CROWD_WARN) addFish(tanks[1], 'guppy', { ...calm, sex: 'female', pregnant: false });
    while (crowdingRatio(s) < CROWD_FULL + 0.05) {
      const f = addFish(s, 'guppy', { ...calm, pregnant: false });
      Object.assign(f, { generation: 1, motherId: storeMom.id, bornHours: s.hours - 3 * 24, lengthCm: 1.2, ageDays: 3 });
    }
    economy(s).coins = coins;
    return { tanks, s, st };
  }

  it('買缸會剩不到 500、收納箱買完剩得到：推薦收納箱；選了 180 元、小魚最多 30 尾搬進去，主缸不擠了', () => {
    const { tanks, s } = crowdedFry(800);
    expect(newTankCost(tanks, 'nano20')).toBeGreaterThan(300);
    const c14 = takeChoice(tanks)!;
    expect(c14.id).toBe('C14');
    const tub = c14.options.find((o) => o.key === 'bin')!;
    expect(tub).toMatchObject({ label: '收納箱暫養', recommended: true });
    expect(tub.outcome).toMatch(/^180 元，附打氣和小加熱棒；\d+ 尾小魚先放進去，長到能賣再撈出來$/);
    expect(c14.options.filter((o) => o.recommended).map((o) => o.key)).toEqual(['bin']);
    const fry = s.fish.filter((f) => f.alive && f.generation === 1).length;
    expect(chooseOption(tanks, 'C14', 'bin')).toBeNull();
    expect(economy(s).coins).toBe(800 - TUB_PRICE);
    expect(s.tub!.fish).toHaveLength(Math.min(TUB_CAPACITY, fry));
    expect(crowdingRatio(s)).toBeLessThan(CROWD_FULL);
    // 不佔缸位、買缸的價錢不變
    expect(tanks).toHaveLength(2);
  });

  it('錢夠買缸還剩 500：照舊推薦買缸，收納箱是選項但不推薦；收納箱買完剩不到 500 也不推薦，錢不夠就灰掉', () => {
    const { tanks } = crowdedFry(newTankCost(latePair().tanks, 'nano20') + 600);
    const c14 = takeChoice(tanks)!;
    expect(c14.options.find((o) => o.recommended)?.key).toBe('tank');
    expect(c14.options.find((o) => o.key === 'bin')?.recommended).toBe(false);
    const tight = takeChoice(crowdedFry(TUB_PRICE + 100).tanks)!.options.find((o) => o.key === 'bin');
    expect(tight).toMatchObject({ recommended: false });
    expect(tight?.disabled).toBeUndefined();
    const poor = crowdedFry(100);
    expect(tubRefusal(poor.tanks, 0)).toBe('錢不夠');
  });

  it('箱子裡照常長大、不繁殖；長到能賣，早上報告叫你撈出來賣給阿德', () => {
    const { tanks, s } = crowdedFry(800);
    chooseOption(tanks, 'C14', 'bin');
    const n = s.tub!.fish.length;
    for (let d = 0; d < 60 && tubReady(s).length === 0; d++) for (let h = 0; h < 24; h++) for (const t of tanks) step(t, 1);
    expect(tubReady(s).length).toBeGreaterThan(0);
    expect(s.tub!.fish.length).toBe(n);
    const before = economy(s).coins;
    const r = sellTub(tanks, 0);
    expect(r.n).toBeGreaterThan(0);
    expect(economy(s).coins).toBe(before + r.coins);
    expect(s.tub!.fish.length).toBe(n - r.n);
  });

  it('品系的小魚也能放（太擠的繁殖缸多半是牠們）；留種的、種魚、懷孕的、育幼盒裡的不放', () => {
    const { tanks, t2, mom, dad } = latePair();
    const kid = (o: Partial<Fish>) => Object.assign(addFish(t2, 'guppy', { ...calm, pregnant: false }), { generation: 2, motherId: mom.id, lengthCm: 1.2, ageDays: 5 }, o);
    const line = kid({});
    const kept = kid({ keeper: true });
    const boxed = kid({ nursery: true });
    const preg = kid({ sex: 'female', pregnancy: 0.3 });
    const ids = tubCandidates(t2, breederIds(tanks)).map((f) => f.id);
    expect(ids).toContain(line.id);
    for (const f of [kept, boxed, preg, mom, dad]) expect(ids).not.toContain(f.id);
  });

  it('箱裡的魚交單、賣給阿德都找得到，交出去就不在箱裡，不會重複算', () => {
    const { tanks, s } = crowdedFry(800);
    chooseOption(tanks, 'C14', 'bin');
    const grown = s.tub!.fish.slice(0, 3);
    for (const f of grown) f.lengthCm = FISH_SPECIES.guppy.adultLengthCm * 0.7;
    const o = { id: 999, kind: 'fish' as const, count: 2, unitPrice: 30, postedHours: s.hours, species: 'guppy' as const, size: 'juvenile' as const };
    orderBoard(s).orders = [o];
    const supply = orderSupply(tanks, o);
    expect(supply).toBeGreaterThanOrEqual(3);
    const before = s.tub!.fish.length;
    expect(fulfillOrder(tanks, o.id)).toBe(60);
    const all = tanks.flatMap((t) => [...t.fish, ...(t.tub?.fish ?? [])]);
    expect(all.filter((f) => grown.includes(f)).length).toBe(1);
    expect(s.tub!.fish.length).toBe(before - 2);
    const left = grown.find((f) => s.tub!.fish.includes(f))!;
    expect(sellFish(s, left.id)).toBeGreaterThan(0);
    expect(s.tub!.fish.includes(left)).toBe(false);
  });

  it('一個存檔最多 2 個收納箱；箱子放滿了就不能再放', () => {
    const { tanks, s } = crowdedFry(5000);
    s.tub = { fish: [] };
    tanks[1].tub = { fish: [] };
    const t3 = buyTank(tanks, 'nano20')!;
    expect(tubRefusal(tanks, tanks.indexOf(t3))).toBe(`最多放 ${MAX_TUBS} 個收納箱`);
    s.tub.fish = s.fish.slice(0, TUB_CAPACITY);
    expect(tubRefusal(tanks, 0)).toBe('收納箱已經放滿了');
  });
});
