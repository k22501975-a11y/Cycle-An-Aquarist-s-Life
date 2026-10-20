/**
 * 魚的待機行為（polish-to-9.md V1）：沒事的時候不是一直漫遊，偶爾會
 * - plant：游到水草旁邊停一會兒，慢慢晃；
 * - peck：到水面下啄一啄（張嘴、身體往前吸一下）；
 * - rest：沉到底沙上方休息，尾巴擺得很慢。
 * 做哪一種看個性（F6）：膽小的多躲在草邊，懶散的常趴在底下休息，好奇、活潑的常去水面啄。
 * 這裡只算往哪裡游、多快；畫面（張嘴、轉身）由 tank-view 照 Swimmer 上的旗標處理。
 */

export type IdleKind = 'plant' | 'peck' | 'rest';

export interface Idle {
  kind: IdleKind;
  /** 到了之後還要待幾秒。 */
  t: number;
  /** 路上還能花幾秒（游不到就放棄）。 */
  go: number;
  /** 已經到過了。 */
  arrived?: boolean;
  x: number;
  y: number;
  /** 下一次啄的倒數（秒，只有 peck 用）。 */
  next?: number;
}

export interface IdleMood {
  activity: number;
  hide: number;
  approach: number;
}

export interface IdleScene {
  surface: number;
  bottom: number;
  width: number;
  scale: number;
  /** 水草的水平位置（像素）。 */
  plants: readonly number[];
  /** 這個位置的底沙高度。 */
  floorAt: (x: number) => number;
}

export interface IdleSteer {
  ax: number;
  ay: number;
  /** 乘在速度上限。 */
  speed: number;
  /** 到位了：煞車、不轉身、不被水面和底沙推開。 */
  settled: boolean;
  /** 這一格啄了一下（畫面張嘴）。 */
  peck: boolean;
}

/** 平均多久開始一次待機行為（秒）。 */
const IDLE_EVERY = 9;
/** 游過去最多花幾秒：基本幾秒，再加上每 100 像素（以 scale 1 算）幾秒。 */
const TRAVEL_SECONDS = 4;
const TRAVEL_PER_100PX = 3;
const DURATION: Record<IdleKind, [number, number]> = { plant: [5, 9], peck: [3, 5], rest: [6, 11] };

/** 三種行為的比重：個性決定。 */
export function idleWeights(mood: IdleMood | undefined, hasPlants: boolean): Record<IdleKind, number> {
  const m = mood ?? { activity: 1, hide: 0.3, approach: 0.3 };
  return {
    plant: hasPlants ? 0.4 + m.hide * 1.2 : 0,
    peck: 0.3 + m.approach * 0.6 + Math.max(0, m.activity - 1) * 2,
    rest: 0.15 + Math.max(0, 1 - m.activity) * 2 + m.hide * 0.3,
  };
}

export function chooseIdle(mood: IdleMood | undefined, hasPlants: boolean, r: number): IdleKind {
  const w = idleWeights(mood, hasPlants);
  const total = w.plant + w.peck + w.rest;
  let x = r * total;
  for (const k of ['plant', 'peck', 'rest'] as const) {
    if (x < w[k]) return k;
    x -= w[k];
  }
  return 'rest';
}

/** 要去的位置。 */
export function idleSpot(kind: IdleKind, from: { x: number; y: number }, halfH: number, scene: IdleScene, rand: () => number): { x: number; y: number } {
  const { surface, bottom, width, scale } = scene;
  const edge = Math.max(40 * scale, width * 0.08);
  const clampX = (x: number) => Math.min(width - edge, Math.max(edge, x));
  if (kind === 'plant' && scene.plants.length) {
    const px = scene.plants[Math.floor(rand() * scene.plants.length)];
    const x = clampX(px + (rand() - 0.5) * 50 * scale);
    // 草叢中段：底沙上面一些
    const y = scene.floorAt(x) - halfH - (30 + rand() * 50) * scale;
    return { x, y: Math.max(surface + (bottom - surface) * 0.35, y) };
  }
  if (kind === 'peck') {
    const x = clampX(from.x + (rand() - 0.5) * 120 * scale);
    return { x, y: surface + halfH + 6 * scale };
  }
  const x = clampX(from.x + (rand() - 0.5) * 160 * scale);
  return { x, y: scene.floorAt(x) - halfH - 5 * scale };
}

/**
 * 每格呼叫：還沒在待機就偶爾開始一個；在待機就往目標游、到了就停著做那件事。
 * 不該待機（追飼料、生病、帶小孩…）時呼叫端把 s.idle 清掉、不要呼叫。
 */
export function stepIdle(
  s: { x: number; y: number; id: number; idle?: Idle },
  mood: IdleMood | undefined,
  halfLen: number,
  halfH: number,
  scene: IdleScene,
  dt: number,
  rand: () => number,
): IdleSteer | null {
  if (!s.idle) {
    // 懶的、膽小的比較常停下來
    const often = 1 + Math.max(0, 1 - (mood?.activity ?? 1)) + (mood?.hide ?? 0) * 0.5;
    if (rand() >= (dt / IDLE_EVERY) * often) return null;
    const kind = chooseIdle(mood, scene.plants.length > 0, rand());
    const [lo, hi] = DURATION[kind];
    const spot = idleSpot(kind, s, halfH, scene, rand);
    const go = TRAVEL_SECONDS + (Math.hypot(spot.x - s.x, spot.y - s.y) / (100 * scene.scale)) * TRAVEL_PER_100PX;
    s.idle = { kind, t: lo + rand() * (hi - lo), go, ...spot };
  }
  const idle = s.idle;
  const dx = idle.x - s.x;
  const dy = idle.y - s.y;
  const d = Math.hypot(dx, dy) + 1e-6;
  const near = Math.max(12 * scene.scale, halfLen * 0.6);
  // 到過之後範圍放寬（被別的魚擠開一點點不會又變成「在路上」）
  const there = d <= (idle.arrived ? near * 2 : near);
  if (there) {
    idle.arrived = true;
    idle.t -= dt;
  } else idle.go -= dt;
  if (idle.t <= 0 || idle.go <= 0) {
    s.idle = undefined;
    return null;
  }
  if (!there) {
    // 還在路上：照平常的速度游過去
    return { ax: (dx / d) * 1.6, ay: (dy / d) * 1.6, speed: idle.kind === 'rest' ? 0.8 : 1, settled: false, peck: false };
  }
  // 到了：輕輕拉回目標點，幾乎不動
  const pull = { ax: (dx / near) * 0.4, ay: (dy / near) * 0.4 };
  if (idle.kind === 'peck') {
    idle.next = (idle.next ?? 0.3) - dt;
    const peck = idle.next <= 0;
    if (peck) idle.next = 0.7 + rand() * 0.9;
    return { ...pull, speed: 0.25, settled: true, peck };
  }
  if (idle.kind === 'rest') return { ...pull, speed: 0.08, settled: true, peck: false };
  // 草邊：前後慢慢晃一點
  return { ax: pull.ax + Math.sin(idle.t * 0.9 + s.id) * 0.15, ay: pull.ay, speed: 0.2, settled: true, peck: false };
}
