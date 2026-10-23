import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, ADULT_SIZE, bacteriaCapacity, broodFactor, buyTank, CROWD_WARN, crowdingRatio, cross, DREAM_FISH, economy, FISH_SPECIES, linkTanks, orderBoard, setTankPurpose, type Fish, type GuppyGenome, type TankState } from './index';
import { chooseOption, choiceState, CHOICE_RESHOW_DAYS, CROWD_FULL, CROWD_PREVIEW, REVEAL_CULL_DAYS, takeCrowdNotes, PAIR_PLAN_DAYS, REVEAL_SHOWS, BOX_DUE, takeBellyNotes, SECOND_BROOD_SHOWS, BROOD_AGAIN_SHOWS, BROOD_AGAIN_GAP_DAYS, WARM_PREG_C, takeChoice, takeLineNotes, takeReveal, takeSecondBrood, SNAKE_DAYS, STABILITY_DAYS } from './choices';
import { dreamRoute } from './dream';

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
    expect(takeBellyNotes(tanks).map((n) => n.text)).toContainEqual(expect.stringMatching(/快生了，照你的設定生下來挑備用種魚$/));
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
    // 改得回來：點那一行跳 C9 的選項加「每次都問我」
    const setting = takeBellyNotes(tanks).find((n) => n.setting)!.setting!;
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
    expect(chooseOption(tanks, 'C10', 'both')).toBeNull();
    expect(brood.filter((f) => f.keeper).length).toBe(1);
    expect(mom.keeper).toBe(true);
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
    expect(chooseOption(tanks, 'C10', 'swap')).toBeNull();
    expect(st.pair![0]).toBe(brood[0].id);
    expect(brood[0].keeper).toBe(true);
    expect(mom.keeper).toBeFalsy();
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
    expect(chooseOption(tanks, 'C14', 'water')).toBeNull();
    expect(nextDay(tanks)?.id).not.toBe('C14');
    expect(nextDay(tanks)?.id).toBe('C14');
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
    expect(first[0].text).toMatch(/現在 \d+ 尾，.+快生了，生完大約 \d+ 尾，會住不太下。$/);
    expect(takeCrowdNotes(tanks).filter((n) => n.tank === 0)).toHaveLength(0);
    while (crowdingRatio(s) < CROWD_FULL + 0.05) addFish(s, 'guppy', { ...calm, sex: 'male', pregnant: false });
    const full = takeCrowdNotes(tanks).find((n) => n.tank === 0)!;
    expect(full).toMatchObject({ full: true });
    expect(full.text).toMatch(/太擠了，魚擠到水面喘氣。$/);
    expect(s.crowdNotices).toBe(2);
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
