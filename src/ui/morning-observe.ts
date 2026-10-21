import { BELLY_SHOWS, economy, FISH_SPECIES, isShrimpSpecies, personalityOf, PLANT_SPECIES, pestCount, type Fish, type TankState } from '../sim';
import { fishStrain } from './labels';

/**
 * 平淡早上的小觀察（企劃 tutorial-lines.md §7，#258）：昨晚沒好事也沒壞事時，帶一句缸裡看得到的小變化，
 * 不要每天都是同一句「很平靜」。5 種句型，同一句型 3 天內不重複；選哪一句跟著天數輪，不用亂數（存讀檔一樣）。
 * 會記下用過的句型（存在共用錢包上）。
 */

/** 同一句型隔幾個遊戲小時才能再出。 */
export const OBSERVE_GAP_HOURS = 72;

/** 睡前的樣子（只要比較得出「長了」「圓了」的那幾個數字）。 */
export interface ObserveBefore {
  fish: Map<number, { lengthCm: number; pregnancy: number }>;
  plants: Map<number, number>;
}

const fishLabel = (f: Fish) => {
  const strain = fishStrain(f);
  return strain ? `${strain}孔雀` : FISH_SPECIES[f.species].name;
};

type Line = (t: TankState, was: ObserveBefore) => string | null;

const LINES: Line[] = [
  // 1. 尾巴長了：長最多的那尾公孔雀
  (t, was) => {
    let best: Fish | null = null;
    let grew = 0;
    for (const f of t.fish) {
      const before = was.fish.get(f.id);
      if (!f.alive || f.sex !== 'male' || f.species !== 'guppy' || !fishStrain(f) || !before) continue;
      if (f.lengthCm - before.lengthCm > grew) [best, grew] = [f, f.lengthCm - before.lengthCm];
    }
    return best ? `${fishLabel(best)}的尾巴又長了一點` : null;
  },
  // 2. 最大的一株草長了新葉
  (t, was) => {
    if (t.plants.length < 2) return null;
    const big = t.plants.reduce((a, p) => (p.biomassG > a.biomassG ? p : a));
    return big.biomassG > (was.plants.get(big.id) ?? Infinity) ? `${PLANT_SPECIES[big.species].name}長出一片新葉，現在是缸裡最大的一株` : null;
  },
  // 3. 膽小或好奇的魚在草邊晃
  (t) => {
    const f = t.fish.find((x) => x.alive && !isShrimpSpecies(x.species) && ['shy', 'curious'].includes(personalityOf(x)));
    const plant = t.plants[0];
    return f && plant ? `${fishLabel(f)}一直在${PLANT_SPECIES[plant.species].name}旁邊晃，好像很喜歡那裡` : null;
  },
  // 4. 螺或蝦吃藻
  (t) => {
    const shrimp = t.fish.find((x) => x.alive && isShrimpSpecies(x.species));
    const who = shrimp ? FISH_SPECIES[shrimp.species].name : (t.snails?.snails.length ?? 0) > 0 || pestCount(t) > 0 ? '螺' : null;
    return who ? `夜裡${who}把缸壁的藻吃掉了一小片` : null;
  },
  // 5. 懷孕母魚肚子更圓
  (t, was) => {
    const mom = t.fish.find((f) => f.alive && f.sex === 'female' && !isShrimpSpecies(f.species) && f.pregnancy >= BELLY_SHOWS && f.pregnancy > (was.fish.get(f.id)?.pregnancy ?? 1));
    return mom ? `${FISH_SPECIES[mom.species].name.replace(/魚$/, '')}母魚的肚子比昨天圓了一點` : null;
  },
];

/** 這個早上的小觀察；沒有合適的（或都剛說過）回傳 null。 */
export function quietObservation(home: TankState, t: TankState, was: ObserveBefore): string | null {
  const e = economy(home);
  const used = (e.observed ??= []);
  const start = Math.floor(t.hours / 24);
  for (let k = 0; k < LINES.length; k++) {
    const i = (start + k) % LINES.length;
    if (used[i] !== undefined && t.hours - used[i] < OBSERVE_GAP_HOURS) continue;
    const text = LINES[i](t, was);
    if (!text) continue;
    used[i] = t.hours;
    return text;
  }
  return null;
}
