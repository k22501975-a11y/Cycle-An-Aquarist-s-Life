import { economy } from './economy';
import { isParentalSpawner } from './parental';
import { FISH_SPECIES, isShrimpSpecies, type FishSpeciesId } from './species';
import { isJuvenile, recordEvent, type Fish, type TankState } from './state';

/**
 * 育幼盒（design/mvp.md §4.4.2，#187）：掛在主缸裡的小網盒，不佔缸位、用的是主缸的水。
 * 快生的母魚放進去，生下的小魚掉進隔間，成魚吃不到；母魚生完自己回主缸，小魚長到 1.6 cm 也自己放回去。
 * 盒裡的魚還是在 state.fish 裡（吃同一缸的水、同一份飼料），只是帶著 nursery 標記：大魚吃不到、不會配對、不會咬鰭。
 * 第一次有母魚快生了，阿德老闆送一個（每缸最多掛一個，之後自己買）。
 */

/** 一個育幼盒最多放幾尾小魚。 */
export const NURSERY_FRY_CAPACITY = 30;
/** 小魚長到這麼大就放回主缸（成魚吞不下）。 */
export const NURSERY_RELEASE_CM = 1.6;
/** 母魚懷孕到這個程度就算「快生了」（肚子很鼓、看得到胎點）。 */
export const DUE_PREGNANCY = 0.85;

/** 會直接生小魚、可以用育幼盒的魚（孔雀魚這類；蝦、短鯛、鬥魚不用）。 */
export function usesNursery(species: FishSpeciesId): boolean {
  return !!FISH_SPECIES[species].breeding && !isShrimpSpecies(species) && !isParentalSpawner(species);
}

export function buyNurseryBox(state: TankState): void {
  state.nurseryBox = true;
}

/** 盒裡還活著的魚。 */
export function nurseryFish(state: TankState): Fish[] {
  return state.fish.filter((f) => f.alive && f.nursery);
}

/** 快生了、還在主缸裡、可以放進育幼盒的母魚。 */
export function dueMothers(state: TankState): Fish[] {
  return state.fish.filter((f) => f.alive && !f.nursery && f.sex === 'female' && !isJuvenile(f) && f.pregnancy > DUE_PREGNANCY && usesNursery(f.species) && f.listing === undefined);
}

/** 不能放進育幼盒的原因；可以放回 null。 */
export function nurseryRefusal(state: TankState, fish: Fish): string | null {
  if (!state.nurseryBox) return '這缸還沒有育幼盒';
  if (!fish.alive || fish.nursery) return '這尾已經在盒子裡了';
  if (!usesNursery(fish.species)) return isShrimpSpecies(fish.species) ? '蝦不用放育幼盒，多種莫絲就好' : '這種魚自己會顧小孩，不用育幼盒';
  const inside = nurseryFish(state);
  if (!isJuvenile(fish)) {
    if (fish.sex !== 'female' || fish.pregnancy <= 0) return '育幼盒只放快生的母魚和小魚';
    if (inside.some((f) => !isJuvenile(f))) return '盒子裡已經有一尾母魚了';
    if (inside.length > 0) return '盒子裡還有小魚，母魚放進去會吃牠們';
    return null;
  }
  if (inside.some((f) => !isJuvenile(f))) return '母魚還在盒子裡，等牠生完';
  if (inside.length >= NURSERY_FRY_CAPACITY) return `盒子滿了（最多 ${NURSERY_FRY_CAPACITY} 尾）`;
  return null;
}

/** 放進育幼盒；不行就回 false。 */
export function moveToNursery(state: TankState, fishId: number): boolean {
  const fish = state.fish.find((f) => f.id === fishId);
  if (!fish || nurseryRefusal(state, fish)) return false;
  fish.nursery = true;
  // 撈魚是一次小緊迫
  fish.stress = Math.max(fish.stress, 0.2);
  return true;
}

/** 把快生的母魚放進育幼盒（待辦、教學按鈕用）：挑最快生的那尾。回傳放進去的魚。 */
export function moveDueToNursery(state: TankState): Fish | null {
  const mom = [...dueMothers(state)].sort((a, b) => b.pregnancy - a.pregnancy).find((f) => !nurseryRefusal(state, f));
  return mom && moveToNursery(state, mom.id) ? mom : null;
}

/** 會被主缸成魚吃掉的小魚撈進育幼盒（放得下幾尾就撈幾尾，最小的先）。回傳撈了幾尾。 */
export function rescueFryToNursery(state: TankState, prey: Fish[]): number {
  let moved = 0;
  for (const f of [...prey].sort((a, b) => a.lengthCm - b.lengthCm)) if (moveToNursery(state, f.id)) moved++;
  return moved;
}

/** 從盒子裡放回主缸。 */
export function releaseNursery(state: TankState, ids?: number[]): number {
  let n = 0;
  for (const f of nurseryFish(state)) {
    if (ids && !ids.includes(f.id)) continue;
    f.nursery = undefined;
    n++;
  }
  return n;
}

/** 主缸成魚嘴巴最大吞得下多長的魚（盒裡的不算）。 */
function mouthCm(state: TankState): number {
  return state.fish.filter((f) => f.alive && !f.nursery && !isJuvenile(f)).reduce((m, f) => Math.max(m, f.lengthCm * FISH_SPECIES[f.species].mouthRatio), 0);
}

/** 母魚在盒裡生了：小魚留在盒裡（放不下的掉進主缸），母魚回主缸。由族群模擬在生產時呼叫。 */
export function nurseryBirth(state: TankState, mother: Fish, fry: Fish[]): void {
  mother.nursery = undefined;
  const room = Math.max(0, NURSERY_FRY_CAPACITY - nurseryFish(state).length);
  for (const f of fry.slice(0, room)) f.nursery = true;
}

/**
 * 每個 tick：長夠大的小魚放回主缸；第一次有母魚快生了，阿德老闆送一個育幼盒（記一筆 nursery_gift，畫面帶玩家放進去）。
 * 盒子還在但缸裡已經沒有掠食者時，小魚也直接放回去。
 */
export function updateNursery(state: TankState): void {
  if (state.nurseryBox) {
    const inside = nurseryFish(state);
    if (inside.length > 0) {
      const mouth = mouthCm(state);
      const grown = inside.filter((f) => isJuvenile(f) && f.lengthCm >= NURSERY_RELEASE_CM && f.lengthCm > mouth);
      if (grown.length > 0) {
        for (const f of grown) f.nursery = undefined;
        recordEvent(state, { type: 'nursery_released', count: grown.length });
      }
    }
    return;
  }
  const e = state.economy;
  if (!e || e.nurseryGifted) return;
  const mom = dueMothers(state)[0];
  if (!mom) return;
  e.nurseryGifted = true;
  state.nurseryBox = true;
  recordEvent(state, { type: 'nursery_gift', subjectId: mom.id });
}

/** 這個錢包已經送過育幼盒了嗎。 */
export function nurseryGifted(state: TankState): boolean {
  return !!economy(state).nurseryGifted;
}
