import { feed } from './actions';
import { chargeMeal } from './economy';
import { DEFAULT_FOOD, mealPrice, type FoodGrade, type FoodKind } from './food';
import { FISH_SPECIES } from './species';
import type { TankState } from './state';

/**
 * 手指餵食當預設（polish-to-9.md §6 P5）：點一下餵食就進餵食模式，點水面哪裡飼料就掉哪裡，魚去搶。
 * 一下只撒一小撮（三分之一餐），多點幾下就多撒：餵多少直接用手指決定，不用選份量。
 * 飼料種類、等級照面板上次選的（收在「進階」），沒選過就是標準薄片。
 * 吃不完的會沉底、爛掉，水慢慢變濁（cloudiness）：餵太多看得到後果。
 */

/** 點一下撒幾分之幾餐。 */
export const TAP_FEED_MEALS = 1 / 3;
/** 缸裡沒吃完的飼料超過幾餐就算餵太多（畫面提醒「吃不完了」）。 */
export const OVERFED_MEALS = 1.5;

/** 一餐的份量（mg）：缸內所有活魚每日食量的一半（建議一天兩餐）。 */
export function mealMg(state: TankState): number {
  return state.fish.filter((f) => f.alive).reduce((sum, f) => sum + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
}

export interface TapFeedResult {
  /** 這一下撒了多少 mg（缸裡沒魚就是 0，什麼都不做）。 */
  mg: number;
  /** 缸裡現在有幾餐份的飼料還沒吃完。 */
  meals: number;
  /** 餵太多了（超過 OVERFED_MEALS 餐）。 */
  overfed: boolean;
}

/** 點水面撒一小撮。落點由畫面決定（模擬不分位置）。 */
export function tapFeed(state: TankState, food: { kind: FoodKind; grade: FoodGrade } = DEFAULT_FOOD): TapFeedResult {
  const meal = mealMg(state);
  if (meal <= 0) return { mg: 0, meals: 0, overfed: false };
  const mg = meal * TAP_FEED_MEALS;
  // 飼料錢每週跟電費一起結算（跟餵食面板一樣），沒錢也能餵
  chargeMeal(state, mealPrice(food.kind, food.grade) * TAP_FEED_MEALS);
  feed(state, mg, food.kind, food.grade);
  const meals = state.water.foodMg / meal;
  return { mg, meals, overfed: meals > OVERFED_MEALS };
}

/** 正常餵（一天兩餐）有機物大約停在這個濃度以下（mg/L），水看起來是清的。 */
export const CLEAR_ORGANIC_MG_PER_L = 0.4;

/**
 * 水看起來有多濁（0～0.35，畫面疊一層黃綠色）：爛掉的飼料、糞便變成的有機物。
 * 氨本身是透明的不算：新缸症候群的氨（polish-to-9.md §6.3）要靠測試劑才看得到，正常餵的新缸水還是清的。
 * 照缸的大小換算濃度，小缸餵太多濁得快。
 */
export function cloudiness(state: TankState): number {
  // 一次餵三餐的量，當天就看得出來（約 0.13），隔天更濁（約 0.3）
  const organic = Math.max(0, state.water.organicMg / state.equipment.tank.volumeL - CLEAR_ORGANIC_MG_PER_L);
  return Math.min(0.35, organic * 0.25);
}

/** 缸裡看得到的水況（g13 門檻 2：測水、換水、過一晚 3 秒內在缸裡看得到變化）。畫面每格讀，換水前後的過渡畫面自己做。 */
export interface WaterLook {
  /** 細菌白濁（0～0.25，乳白霧）：跟著真的氨、亞硝走，測到 0.25 就看得出一點，0 就沒有；換水立刻稀釋。 */
  bloom: number;
  /** 爛飼料、糞便的黃褐濁，就是 cloudiness()。 */
  organic: number;
  /** 魚覺得水不舒服（0～1）：鰭稍微收、游得慢一點。只是表現，不扣健康、不算症狀（企劃 2026-10-21）。 */
  uneasy: number;
}

/** 氨＋亞硝每 1 ppm 疊多少白濁：0.25 約 0.075、0.5 約 0.15。 */
const BLOOM_PER_PPM = 0.3;
/** 白濁到這麼濃，早上報告第一次說明「新缸常見的細菌白濁」。 */
export const BLOOM_NOTE = 0.05;

export function waterLook(state: TankState): WaterLook {
  const ppm = state.water.tan + state.water.no2;
  return { bloom: Math.min(0.25, ppm * BLOOM_PER_PPM), organic: cloudiness(state), uneasy: Math.min(1, ppm) };
}
