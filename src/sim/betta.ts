import { chance, nextRandom } from './random';
import { FISH_SPECIES, isShrimpSpecies } from './species';
import { isJuvenile, recordEvent, type Fish, type TankState } from './state';

/**
 * 鬥魚的地盤性（design/compatibility.md §3–4）：
 * - 兩尾公鬥魚同缸會一直打，打輸的一兩天內就會被打死；
 * - 公鬥魚把孔雀魚公魚的長尾巴當成對手，會去咬；
 * - 約三成的鬥魚會獵蝦（看個性），水草越密越抓不到。
 */

/** 打輸的那尾每小時掉多少健康（約一天半被打死）。 */
export const FIGHT_LOSER_DAMAGE = 0.03;
/** 打贏的也會受點傷。 */
const FIGHT_WINNER_DAMAGE = 0.004;
/** 公鬥魚每天攻擊一尾長尾孔雀魚公魚的機率。 */
export const LONG_FIN_ATTACK_PER_DAY = 0.4;
/** 會獵蝦的鬥魚佔幾成。 */
export const SHRIMP_HUNTER_SHARE = 0.3;
/** 會獵蝦的鬥魚、缸裡沒水草時，每天吃掉幾隻成蝦。 */
export const SHRIMP_EATEN_PER_DAY = 1.5;

const isBetta = (f: Fish) => f.species === 'betta';
const adultMaleBetta = (f: Fish) => f.alive && isBetta(f) && f.sex === 'male' && !isJuvenile(f);

/** 個性：這尾鬥魚會不會獵蝦（每尾天生的，跟著個體編號固定）。 */
export function isShrimpHunter(fish: Fish): boolean {
  const h = Math.imul(fish.id ^ 0x5bd1e995, 0x9e3779b1) >>> 0;
  return (h % 1000) / 1000 < SHRIMP_HUNTER_SHARE;
}

function hurt(fish: Fish, amount: number, cause: string, fin: number): void {
  fish.health -= amount;
  fish.finDamage = Math.min(1, fish.finDamage + fin);
  fish.stress = Math.min(1, fish.stress + fin);
  fish.recentDamage[cause] = (fish.recentDamage[cause] ?? 0) + amount;
}

function recentEvent(state: TankState, type: 'betta_fight' | 'betta_ate_shrimp'): boolean {
  return state.events.some((e) => e.type === type && state.hours - e.hours < 24);
}

/** 每一步的鬥魚互動；回傳被吃掉的蝦（由呼叫端移出缸外）。 */
export function bettaAggression(state: TankState, living: Fish[], hiding: number, dt: number): Set<Fish> {
  const eaten = new Set<Fish>();
  const bettas = living.filter((f) => f.alive && isBetta(f) && !isJuvenile(f));
  if (bettas.length === 0) return eaten;

  // 公魚互鬥：最強的那尾（體型 × 健康 × 體質）打贏，其他的都被追著打
  const males = bettas.filter(adultMaleBetta);
  if (males.length >= 2) {
    const strength = (f: Fish) => f.lengthCm * f.health * f.constitution;
    const winner = males.reduce((a, b) => (strength(b) > strength(a) ? b : a));
    for (const m of males) hurt(m, (m === winner ? FIGHT_WINNER_DAMAGE : FIGHT_LOSER_DAMAGE) * dt, 'fight', (m === winner ? 0.002 : 0.02) * dt);
    if (!recentEvent(state, 'betta_fight')) recordEvent(state, { type: 'betta_fight', subjectId: winner.id, count: males.length });
  }

  // 公鬥魚咬長尾的孔雀魚公魚
  if (males.length > 0) {
    const rate = (LONG_FIN_ATTACK_PER_DAY / 24) * Math.min(2, males.length) * (1 - hiding * 0.3);
    for (const target of living) {
      if (!target.alive || isBetta(target) || target.sex !== 'male' || isJuvenile(target) || !FISH_SPECIES[target.species].longFinnedMales) continue;
      if (chance(state.rng, rate, dt)) hurt(target, 0.015, 'betta_attack', 0.2 + 0.1 * nextRandom(state.rng));
    }
  }

  // 獵蝦：只有天生會獵的才吃，水草多抓不到
  const hunters = bettas.filter(isShrimpHunter);
  for (const hunter of hunters) {
    const mouth = hunter.lengthCm * FISH_SPECIES.betta.mouthRatio;
    const prey = living.filter((f) => f.alive && !eaten.has(f) && isShrimpSpecies(f.species) && !isJuvenile(f) && f.lengthCm < mouth);
    if (prey.length === 0) continue;
    if (!chance(state.rng, (SHRIMP_EATEN_PER_DAY / 24) * Math.pow(1 - hiding, 1.5), dt)) continue;
    const victim = prey[Math.floor(nextRandom(state.rng) * prey.length)];
    eaten.add(victim);
    hunter.hunger = Math.max(0, hunter.hunger - 0.2);
    state.water.organicMg += FISH_SPECIES[victim.species].bodyMassMg * 0.2;
    if (!recentEvent(state, 'betta_ate_shrimp')) recordEvent(state, { type: 'betta_ate_shrimp', subjectId: hunter.id });
  }
  return eaten;
}
