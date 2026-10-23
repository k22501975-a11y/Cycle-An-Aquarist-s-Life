import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import {
  addFish,
  ADULT_SIZE,
  bacteriaCapacity,
  broodFactor,
  buyTank,
  chooseOption,
  choiceState,
  CROWD_WARN,
  crowdingRatio,
  cross,
  DREAM_FISH,
  economy,
  FISH_SPECIES,
  linkTanks,
  orderBoard,
  PAIR_PLAN_DAYS,
  REVEAL_SHOWS,
  BOX_DUE,
  takeBellyNotes,
  SECOND_BROOD_SHOWS,
  setTankPurpose,
  takeChoice,
  takeReveal,
  takeSecondBrood,
  type Fish,
  type GuppyGenome,
  type TankState,
} from './index';

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
    expect(c14!.options.map((o) => o.key).slice(0, 2)).toEqual(['sell', 'tank']);
    expect(c14!.options[0].outcome).toMatch(/^\d+ 尾賣給阿德，約 \d+ 元$/);
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
});
