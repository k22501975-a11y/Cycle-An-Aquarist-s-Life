import { nutritionFactor } from './food';
import { nextRandom } from './random';
import { FISH_SPECIES } from './species';
import { recordEvent, type Fish, type TankState } from './state';

/**
 * 成長（design/growth.md）：體長連續變化，依長度分成六個階段；
 * 長多快看飼料、溫度、水質、擁擠度和個體差異，仔魚期吃不好、太擠會永久長不大。
 * 蝦靠脫殼長大：長的量先累積，脫殼那一刻才一次長上去；GH 太低或水質一下變太多會卡殼。
 */

export type GrowthStage = 'fry' | 'juvenile' | 'coloring' | 'subadult' | 'adult' | 'old';

export const STAGE_LABELS: Record<GrowthStage, string> = {
  fry: '仔魚',
  juvenile: '幼魚',
  coloring: '轉色期',
  subadult: '亞成魚',
  adult: '成魚',
  old: '老魚',
};
export const SHRIMP_STAGE_LABELS: Record<GrowthStage, string> = { ...STAGE_LABELS, fry: '仔蝦', juvenile: '幼蝦', coloring: '幼蝦', subadult: '亞成蝦', adult: '成蝦', old: '老蝦' };

/**
 * 各階段的體長上限（相對成體體長）。照標準照顧的成長曲線，孔雀魚大約是：
 * 仔魚到第 14 天（1.5 cm）、幼魚到第 35 天（2.4 cm）、轉色期到第 60 天（3 cm）、亞成魚到第 100 天。
 */
const FISH_STAGES: Array<[GrowthStage, number]> = [
  ['fry', 0.375],
  ['juvenile', 0.59],
  ['coloring', 0.75],
  ['subadult', 0.88],
];
/** 米蝦 2 cm：仔蝦 3 mm、幼蝦 8 mm、亞成蝦 14 mm，沒有轉色期。 */
const SHRIMP_STAGES: Array<[GrowthStage, number]> = [
  ['fry', 0.15],
  ['juvenile', 0.4],
  ['subadult', 0.7],
];
/** 壽命走到這個比例以後算老魚。 */
export const OLD_FRACTION = 0.85;

const isShrimp = (fish: Fish) => fish.species === 'cherry_shrimp';

/** 這尾魚長到頂的體長：仔魚期吃不好、太擠的魚永久偏小（最多小兩成）。 */
export function maxLengthCm(fish: Fish): number {
  return FISH_SPECIES[fish.species].adultLengthCm * (1 - 0.2 * (fish.stunted ?? 0));
}

function lifeFraction(fish: Fish): number {
  const sp = FISH_SPECIES[fish.species];
  return (fish.ageDays ?? 0) / (sp.lifespanDays * fish.constitution);
}

export function growthStage(fish: Fish): GrowthStage {
  // 長不大的魚用自己的頂當基準，不會一輩子停在亞成
  const r = fish.lengthCm / maxLengthCm(fish);
  for (const [stage, upTo] of isShrimp(fish) ? SHRIMP_STAGES : FISH_STAGES) if (r < upTo) return stage;
  return lifeFraction(fish) >= OLD_FRACTION ? 'old' : 'adult';
}

export function stageLabel(fish: Fish): string {
  return (isShrimp(fish) ? SHRIMP_STAGE_LABELS : STAGE_LABELS)[growthStage(fish)];
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * 轉色進度 0–1：孔雀魚幼魚後段（約 2.2 cm）公魚開始出花紋、母魚出胎斑，轉色期結束（3 cm）轉完；
 * 米蝦從幼蝦開始慢慢變紅。
 */
export function colorProgress(fish: Fish): number {
  const r = fish.lengthCm / maxLengthCm(fish);
  return isShrimp(fish) ? smooth(0.15, 0.55, r) : smooth(0.55, 0.75, r);
}

/** 看得出公母了沒：基因一出生就決定，只是轉色前看不出來。 */
export function sexVisible(fish: Fish): boolean {
  return isShrimp(fish) ? fish.lengthCm / maxLengthCm(fish) >= 0.4 : colorProgress(fish) >= 0.35;
}

/** 幾天後看得出公母（以標準照顧估算；已經看得出來回傳 0）。 */
export function daysUntilSexVisible(fish: Fish): number {
  if (sexVisible(fish)) return 0;
  const sp = FISH_SPECIES[fish.species];
  // 轉色進度 0.35 大約在 0.55 + 0.2 × 0.4 的體長
  const target = maxLengthCm(fish) * (isShrimp(fish) ? 0.4 : 0.63);
  const max = maxLengthCm(fish);
  const k = Math.log(10) / sp.daysToAdult;
  // 曲線 L(t) = max − (max − L0)·e^(−kt)
  return Math.max(1, Math.ceil(Math.log((max - fish.lengthCm) / Math.max(0.001, max - target)) / k));
}

/** 長得快慢的環境係數（0–1.2），面板也拿來說明「為什麼長不大」。 */
export interface GrowthFactors {
  food: number;
  water: number;
  space: number;
}

export function growthFactors(state: TankState, fish: Fish, crowding: number): GrowthFactors {
  const w = state.water;
  const food = (fish.hunger < 0.8 ? 1 : 0.2) * nutritionFactor(fish.nutrition);
  // 硝酸鹽 20 以上開始拖慢、氨和亞硝酸鹽不是 0 也拖慢（勤換水的缸長得快）
  const water = Math.max(0.4, 1 - Math.min(0.4, Math.max(0, w.no3 - 20) / 100) - (w.tan > 0.25 || w.no2 > 0.25 ? 0.25 : 0));
  // 擁擠度 0.8 以上就長不大
  const space = Math.max(0.4, 1 - 0.6 * Math.min(1, Math.max(0, crowding - 0.8)));
  return { food, water, space };
}

/** 蝦多久脫一次殼（小時）：幼蝦約一週，越大越久，成蝦三四週。 */
export function moltIntervalHours(fish: Fish): number {
  const r = fish.lengthCm / maxLengthCm(fish);
  return 24 * (5 + 20 * smooth(0.1, 0.9, r));
}

/** 這次脫殼卡住的機率：GH 太低（礦物質不夠長新殼）、水質剛大變（大換水、pH 跳）都會提高。 */
export function moltFailChance(state: TankState): number {
  const gh = waterGh(state);
  const lowGh = Math.max(0, 4 - gh) * 0.1;
  const swing = Math.max(0, Math.abs(state.water.ph - state.water.phAvg) - 0.2) * 0.4;
  return Math.min(0.6, 0.004 + lowGh + swing);
}

/** 總硬度（dGH）：舊存檔沒有，當成自來水的 6。 */
export function waterGh(state: TankState): number {
  return state.water.gh ?? state.environment.tap.gh ?? 6;
}

/**
 * 長一小時：體長以 von Bertalanffy 曲線趨近自己的頂。
 * tf 是溫度係數，crowding 是缸的擁擠度（crowdingRatio）。
 */
export function growFish(state: TankState, fish: Fish, tf: number, crowding: number, dt: number): void {
  const sp = FISH_SPECIES[fish.species];
  const f = growthFactors(state, fish, crowding);
  const stage = growthStage(fish);
  // 仔魚、幼魚期吃不好或太擠，會永久長不大（約三週的壞日子就到頂）
  if (stage === 'fry' || stage === 'juvenile') {
    const bad = Math.max(0, 0.75 - f.food) + Math.max(0, 0.85 - f.space);
    if (bad > 0) fish.stunted = Math.min(1, (fish.stunted ?? 0) + (bad / (24 * 10)) * dt);
  }
  const max = maxLengthCm(fish);
  if (fish.lengthCm >= max) return;
  const k = Math.log(10) / (sp.daysToAdult * 24);
  const gain = k * tf * f.food * f.water * f.space * (fish.growthRate ?? 1) * (max - fish.lengthCm - (fish.pendingCm ?? 0)) * dt;
  if (!isShrimp(fish)) {
    fish.lengthCm += Math.max(0, gain);
    return;
  }
  // 蝦：長的量先存著，脫殼才長上去
  fish.pendingCm = (fish.pendingCm ?? 0) + Math.max(0, gain);
  fish.moltTimerH = (fish.moltTimerH ?? moltIntervalHours(fish) * nextRandom(state.rng)) - dt;
  if (fish.moltTimerH > 0) return;
  fish.moltTimerH = moltIntervalHours(fish) * (0.85 + 0.3 * nextRandom(state.rng));
  if (nextRandom(state.rng) < moltFailChance(state)) {
    // 卡殼：舊殼脫不下來，身上一圈白線，幾個小時內死掉
    fish.recentDamage.molt = (fish.recentDamage.molt ?? 0) + 10;
    fish.health = 0;
    fish.alive = false;
    fish.corpseMg = sp.bodyMassMg * Math.min(1, fish.lengthCm / sp.adultLengthCm) ** 3;
    fish.stuckMolt = true;
    recordEvent(state, { type: 'fish_died', subjectId: fish.id, cause: 'molt' });
    return;
  }
  fish.lengthCm += fish.pendingCm;
  fish.pendingCm = 0;
  // 脫下來的殼留在缸底一兩天，蝦會慢慢吃掉補鈣
  state.molts = [...(state.molts ?? []).filter((m) => state.hours - m.hour < 48), { id: fish.id, hour: state.hours, lengthCm: fish.lengthCm }].slice(-12);
}
