import { tankSize, type HardscapeSpec } from './equipment';
import { PLANT_SPECIES } from './species';
import { noteAct, type Plant, type TankState } from './state';

/**
 * 造景編輯（aquascape-editor.md）：石頭、沉木、水草擺在缸裡的哪裡。
 * 畫面是 2D 橫向，用後景／中景／前景三層做出前後深度；位置只存橫向 x（0–1，缸的左到右），
 * 高度由重力決定（落在底沙上）。全部是純資料，可以存檔、傳到伺服器。
 *
 * 寫實代價（§6）：在有魚的缸大動造景會攪起底沙（水變混濁）、魚緊張、底沙裡的有機物跑出來（之後變成氨）。
 * 擺放也影響水草：陽性草種在大石頭、沉木的陰影下會長不好（§3）。
 */

export type ScapeLayer = 'back' | 'mid' | 'front';
export const SCAPE_LAYERS: ScapeLayer[] = ['back', 'mid', 'front'];

export interface Placement {
  /** 橫向位置 0–1（缸的左到右）。 */
  x: number;
  layer: ScapeLayer;
  /** 左右翻轉。 */
  flip?: boolean;
  /** 同一塊石頭可以在小範圍內縮放（再大要買大號）。 */
  scale?: number;
  /** 形狀種子：同一種石頭每塊都長得不一樣。 */
  seed: number;
}

export const SCALE_MIN = 0.85;
export const SCALE_MAX = 1.15;
const X_MIN = 0.04;
const X_MAX = 0.96;

/** 一組造景材料的大小（cm，縮放 1 時）：寬度決定遮光範圍。 */
export function hardscapeSizeCm(spec: HardscapeSpec): { w: number; h: number } {
  if (spec.kind === 'wood') return { w: 18, h: 16 };
  if (spec.id === 'slate') return { w: 13, h: 4 };
  return { w: 10, h: 8 };
}

/** 舊存檔或剛放進去還沒擺過的位置：石頭放前景、沉木放中景，依序錯開（跟以前固定的裝飾差不多）。 */
const ROCK_SLOTS = [0.28, 0.67, 0.79, 0.14, 0.52, 0.9];
const WOOD_SLOTS = [0.42, 0.7, 0.2];

function defaultHardscape(list: HardscapeSpec[], index: number): Placement {
  const spec = list[index];
  const sameKind = list.slice(0, index).filter((x) => x.kind === spec.kind).length;
  const slots = spec.kind === 'wood' ? WOOD_SLOTS : ROCK_SLOTS;
  return {
    x: slots[sameKind % slots.length],
    layer: spec.kind === 'wood' ? 'mid' : 'front',
    flip: sameKind % 2 === 1,
    seed: index * 7 + sameKind * 3 + 1,
  };
}

/** 水草預設的位置：陽性有莖草種後景、陰性草種中景（以前依 id 打散）。 */
export function defaultPlantPlacement(plant: Plant): Placement {
  return {
    x: ((plant.id * 0.618) % 1) * 0.84 + 0.08,
    layer: PLANT_SPECIES[plant.species].lightType === 'high' ? 'back' : 'mid',
    seed: plant.id,
  };
}

/** 每組造景材料的位置（沒擺過的用預設值；不修改狀態，畫面可以直接用）。 */
export function hardscapePlacements(state: TankState): Placement[] {
  const list = state.equipment.hardscape ?? [];
  const stored = state.equipment.hardscapePlace ?? [];
  return list.map((_, i) => stored[i] ?? defaultHardscape(list, i));
}

export function plantPlacement(plant: Plant): Placement {
  return plant.place ?? defaultPlantPlacement(plant);
}

/** 補齊位置陣列（加入、拿出造景材料時保持跟 hardscape 一一對應）。 */
function ensurePlacements(state: TankState): Placement[] {
  const all = hardscapePlacements(state);
  state.equipment.hardscapePlace = all;
  return all;
}

/** 放進一組造景材料後：新的那組用預設位置（沒存的就是預設值，只要確保舊的位置還對得上）。 */
export function onHardscapeAdded(state: TankState): void {
  const place = state.equipment.hardscapePlace;
  const n = (state.equipment.hardscape ?? []).length;
  if (place && place.length >= n) place.length = n - 1;
}

/** 拿出第 index 組造景材料時，把它的位置一起拿掉（給 removeHardscape 用）。 */
export function onHardscapeRemoved(state: TankState, index: number, listBefore: HardscapeSpec[]): void {
  const stored = state.equipment.hardscapePlace;
  if (!stored) return;
  const full = listBefore.map((_, i) => stored[i] ?? defaultHardscape(listBefore, i));
  full.splice(index, 1);
  state.equipment.hardscapePlace = full;
}

function clampPlacement(p: Placement): Placement {
  return {
    ...p,
    x: Math.min(X_MAX, Math.max(X_MIN, p.x)),
    scale: p.scale === undefined ? undefined : Math.min(SCALE_MAX, Math.max(SCALE_MIN, p.scale)),
  };
}

/** 移動造景的結果（給畫面顯示提示）。 */
export interface Disturbance {
  /** 這次讓水多混濁（0–1）。 */
  turbidity: number;
  /** 有幾尾魚蝦被嚇到。 */
  stressed: number;
  /** 大動作（移動石頭、沉木）。 */
  big: boolean;
}

const NONE: Disturbance = { turbidity: 0, stressed: 0, big: false };

/** 攪動底沙：水變混濁、底沙裡的有機物跑出來、魚蝦緊張。 */
function disturb(state: TankState, amount: number, stress: number): Disturbance {
  const volume = state.equipment.tank.volumeL;
  state.water.turbidity = Math.min(1, (state.water.turbidity ?? 0) + amount);
  state.water.organicMg += amount * 12 * (volume / 40);
  let stressed = 0;
  for (const f of state.fish) {
    if (!f.alive) continue;
    if (f.stress < stress) {
      f.stress = stress;
      stressed++;
    }
  }
  return { turbidity: amount, stressed, big: amount >= 0.2 };
}

/** 擺放第 index 組石頭或沉木：拖曳、換層、翻轉、縮放。 */
export function placeHardscape(state: TankState, index: number, change: Partial<Omit<Placement, 'seed'>>): Disturbance {
  const list = state.equipment.hardscape ?? [];
  if (index < 0 || index >= list.length) return NONE;
  const all = ensurePlacements(state);
  const before = all[index];
  const after = clampPlacement({ ...before, ...change });
  all[index] = after;
  if (after.x !== before.x || after.layer !== before.layer || after.flip !== before.flip || after.scale !== before.scale) state.lastScapeHours = state.hours;
  const size = hardscapeSizeCm(list[index]);
  const movedCm = Math.abs(after.x - before.x) * tankSize(state.equipment.tank).w;
  // 每日小事分得出是搬位置、換層、翻面還是縮放
  if (movedCm > 1) noteAct(state, 'scapeMove');
  if (after.layer !== before.layer) noteAct(state, 'scapeLayer');
  if (!!after.flip !== !!before.flip) noteAct(state, 'scapeFlip');
  if ((after.scale ?? 1) !== (before.scale ?? 1)) noteAct(state, 'scapeScale');
  const moved = movedCm > 1 || after.layer !== before.layer;
  // 寶箱開到、剛從手上放進缸的那塊（這個小時內）：還拿在手上慢慢放下去，不會攪起底沙嚇到魚（daily-loop.md §3）
  const placed = state.dailyActs?.scapePlace;
  if (moved && index === list.length - 1 && placed !== undefined && state.hours - placed < 1) return disturb(state, 0.05, 0);
  if (!moved) {
    // 翻面、換角度：拿起來轉一下，攪起一點點沙
    return after.flip !== before.flip || after.scale !== before.scale ? disturb(state, 0.05, 0.25) : NONE;
  }
  // 越大塊、搬越遠，攪起的沙越多
  const bulk = (size.w * size.h * (after.scale ?? 1)) / (10 * 8);
  const amount = Math.min(0.6, 0.18 + 0.2 * bulk * Math.min(1, movedCm / 20 + (after.layer !== before.layer ? 0.5 : 0)));
  return disturb(state, amount, 0.45);
}

/** 把一叢水草移到別的位置（拔起來重種）：攪起的沙少，但剛種下要重新紮根。 */
export function placePlant(state: TankState, plantId: number, change: Partial<Omit<Placement, 'seed'>>): Disturbance {
  const plant = state.plants.find((p) => p.id === plantId);
  if (!plant) return NONE;
  const before = plantPlacement(plant);
  const after = clampPlacement({ ...before, ...change, scale: undefined });
  plant.place = after;
  if (Math.abs(after.x - before.x) < 0.01 && after.layer === before.layer && after.flip === before.flip) return NONE;
  state.lastScapeHours = state.hours;
  noteAct(state, 'scapePlant');
  if (after.layer !== before.layer) noteAct(state, 'scapeLayer');
  // 拔起來重種：掉一些葉子，攪起一點點沙；動作小，不會嚇到魚（daily-loop.md §3：做小事不能讓魚受驚）
  plant.biomassG *= 0.95;
  return disturb(state, 0.06, 0);
}

/** 混濁慢慢沉澱：開著過濾器幾個小時就清了，沒過濾要大半天。 */
export function settleTurbidity(state: TankState, dt: number): void {
  const t = state.water.turbidity;
  if (!t) return;
  const halfLife = state.equipment.filter?.on ? 2.5 : 10;
  const next = t * Math.pow(0.5, dt / halfLife);
  state.water.turbidity = next < 0.005 ? 0 : next;
}

const LAYER_DEPTH: Record<ScapeLayer, number> = { back: 0, mid: 1, front: 2 };

/**
 * 某個位置的水草照得到多少光（0–1，1 = 沒有遮蔽）。
 * 燈從上方偏前照下來：同一層或更前面的大石頭、沉木會遮到後面的草；沉木的枝條遮得最多。
 */
export function shadeAt(state: TankState, x: number, layer: ScapeLayer): number {
  const list = state.equipment.hardscape ?? [];
  const places = hardscapePlacements(state);
  const tankW = tankSize(state.equipment.tank).w;
  let light = 1;
  list.forEach((spec, i) => {
    const p = places[i];
    if (LAYER_DEPTH[p.layer] < LAYER_DEPTH[layer]) return;
    const size = hardscapeSizeCm(spec);
    const half = (size.w * (p.scale ?? 1)) / 2 / tankW;
    const d = Math.abs(p.x - x);
    if (d >= half) return;
    // 正下方遮得最多，越靠邊越少；矮的板岩幾乎不遮
    const edge = 1 - d / half;
    const strength = spec.kind === 'wood' ? 0.55 : size.h >= 6 ? 0.4 : 0.15;
    light *= 1 - strength * Math.min(1, edge * 1.6);
  });
  return Math.max(0.3, light);
}

/** 這叢水草實際照到的光比例（給水草模擬用）。 */
export function plantLight(state: TankState, plant: Plant): number {
  const p = plantPlacement(plant);
  return shadeAt(state, p.x, p.layer);
}

/** 沿著缸底的光照分布（給造景模式畫綠點：陽性草適合種哪裡）。 */
export function lightMap(state: TankState, layer: ScapeLayer, samples = 24): Array<{ x: number; light: number }> {
  const out: Array<{ x: number; light: number }> = [];
  for (let i = 0; i < samples; i++) {
    const x = X_MIN + ((X_MAX - X_MIN) * (i + 0.5)) / samples;
    out.push({ x, light: shadeAt(state, x, layer) });
  }
  return out;
}

/** 構圖輔助線（§5）：黃金比例與三分線。 */
export const GUIDE_LINES = { golden: [0.382, 0.618], thirds: [1 / 3, 2 / 3] } as const;

/** 選取時顯示的「對水質的影響」（把 hardscape.md 的機制帶進造景決策）。 */
export function hardscapeEffect(spec: HardscapeSpec): string {
  if (spec.carbonate) return 'KH↑ pH↑';
  if (spec.tanninKhPerHour) return '單寧酸・pH↓ 水變茶色';
  if (spec.bacteriaSurface) return '多孔・硝化菌多';
  return '不影響水質';
}
