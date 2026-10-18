/** 餵食演出：飼料片先浮在水面、再邊翻邊沉；魚游到嘴邊時咬一口。只有數學，不碰畫面物件。 */

export interface Pellet {
  x: number;
  y: number;
  /** 還要在水面漂幾秒（0 就開始沉）。 */
  floatT: number;
  rot: number;
  spin: number;
  /** 晃動的相位，每片不同。 */
  phase: number;
  /** 下沉速度倍數（沉底顆粒快、冷凍紅蟲慢）。 */
  sink?: number;
  /** 黏在缸壁上不動。 */
  stuck?: boolean;
  /** 紅蟲會扭。 */
  wiggle?: boolean;
}

/** 一把飼料撒下去：集中在落點附近，各片漂浮時間不同。 */
export function scatterPellets(n: number, dropX: number, surface: number, spread: number, rand: () => number): Pellet[] {
  const out: Pellet[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: dropX + (rand() + rand() - 1) * spread,
      y: surface + rand() * 4,
      floatT: 1 + rand() * 3,
      rot: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 3,
      phase: rand() * 10,
    });
  }
  return out;
}

/** 前進一格：漂浮時在水面輕輕晃，之後慢慢沉、左右飄、翻轉，到底就停住。 */
export function stepPellet(p: Pellet, dt: number, surface: number, bottom: number, scale: number): void {
  p.phase += dt;
  if (p.stuck) return;
  if (p.wiggle) p.rot += Math.sin(p.phase * 7) * 2.5 * dt;
  if (p.floatT > 0) {
    p.floatT -= dt;
    p.y = surface + 2 + Math.sin(p.phase * 2.2) * 1.2;
    p.x += Math.sin(p.phase * 0.7) * 3 * scale * dt;
    p.rot += p.spin * 0.2 * dt;
    return;
  }
  if (p.y >= bottom - 2) {
    p.y = bottom - 2;
    return;
  }
  const sink = p.sink ?? 1;
  p.y = Math.min(bottom - 2, p.y + 14 * sink * scale * dt);
  // 重的顆粒幾乎直直落，輕的薄片左右飄
  p.x += Math.sin(p.phase * 1.8) * (6 / sink) * scale * dt;
  p.rot += p.spin * (p.wiggle ? 0.3 : 1 / sink) * dt;
}

export interface Mouth {
  x: number;
  y: number;
  /** 咬得到的距離（像素）。 */
  reach: number;
}

/**
 * 模擬吃掉了一份飼料，畫面要拿掉哪一片：嘴邊有飼料就是那條魚吃的；
 * 沒有魚碰得到就是爛掉的，拿最靠底的那片。
 */
export function pickEaten(food: Array<{ x: number; y: number }>, mouths: Mouth[]): { food: number; eater: number | null } {
  let best = -1, eater: number | null = null, bd = Infinity;
  mouths.forEach((m, mi) => {
    food.forEach((f, fi) => {
      const d = Math.hypot(f.x - m.x, f.y - m.y);
      if (d < m.reach && d < bd) { bd = d; best = fi; eater = mi; }
    });
  });
  if (best >= 0) return { food: best, eater };
  let low = 0;
  food.forEach((f, i) => { if (f.y > food[low].y) low = i; });
  return { food: low, eater: null };
}

export const BITE_SECONDS = 0.3;

/** 咬一口的往前衝（0–1）：t 秒前咬的，結束後回到 0。 */
export function biteKick(t: number): number {
  if (t < 0 || t >= BITE_SECONDS) return 0;
  return Math.sin((Math.PI * t) / BITE_SECONDS);
}

export const RIPPLE_SECONDS = 1.2;

/** 水面的漣漪：半徑隨時間擴大，越大越淡。 */
export function ripple(t: number, maxR: number): { r: number; alpha: number } {
  const k = Math.min(1, Math.max(0, t / RIPPLE_SECONDS));
  return { r: maxR * (1 - (1 - k) ** 2), alpha: (1 - k) * 0.7 };
}

export type FoodLook = 'floating' | 'sinking' | 'sticky' | 'meat';

/** 每種飼料撒下去的樣子：薄片先漂、顆粒直接沉、紅蟲慢慢扭著沉、黏缸壁的貼著不動。 */
export function applyFoodLook(p: Pellet, kind: FoodLook): void {
  if (kind === 'floating') return;
  p.floatT = 0;
  if (kind === 'sinking') p.sink = 5;
  else if (kind === 'meat') {
    p.sink = 0.8;
    p.wiggle = true;
  } else p.stuck = true;
}

/** 照各批的份量抽一種（讀檔時重建畫面用）。 */
export function pickFoodKind(lots: Array<{ kind: FoodLook; mg: number }>, r: number): FoodLook {
  const total = lots.reduce((s, l) => s + l.mg, 0);
  let x = r * total;
  for (const l of lots) if ((x -= l.mg) <= 0) return l.kind;
  return lots[lots.length - 1]?.kind ?? 'floating';
}
