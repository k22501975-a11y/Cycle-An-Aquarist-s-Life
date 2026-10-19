/**
 * 生小魚的慶祝特寫：周圍暗下來、聚光在母魚身上，金色亮點往上飄，一圈光環擴散。只有數學，不碰畫面物件。
 */

export const CELEBRATE_SECONDS = 7;

export interface CelebrateFrame {
  /** 周圍變暗的程度 0–1。 */
  spot: number;
  /** 光環半徑（0–1，乘上要的大小）與透明度。 */
  ring: number;
  ringAlpha: number;
}

export function celebrateFrame(t: number): CelebrateFrame {
  if (t < 0 || t >= CELEBRATE_SECONDS) return { spot: 0, ring: 0, ringAlpha: 0 };
  // 0.6 秒暗下來，停在那裡，最後 1.2 秒亮回來
  const fadeIn = Math.min(1, t / 0.6);
  const fadeOut = Math.min(1, (CELEBRATE_SECONDS - t) / 1.2);
  const spot = Math.min(fadeIn, fadeOut);
  // 光環前 1.6 秒擴散一次
  const k = Math.min(1, t / 1.6);
  return { spot, ring: 1 - (1 - k) ** 3, ringAlpha: t < 1.6 ? (1 - k) * 0.9 : 0 };
}

export interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  life: number;
}

/** 一團亮點從 (x, y) 附近冒出來往上飄。 */
export function sparkleBurst(n: number, x: number, y: number, size: number, rand: () => number): Sparkle[] {
  const out: Sparkle[] = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = size * (0.2 + rand() * 0.8);
    out.push({
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d * 0.6,
      vx: Math.cos(a) * size * 0.4 * rand(),
      vy: -size * (0.5 + rand() * 0.8),
      r: size * (0.025 + rand() * 0.03),
      t: -rand() * 1.2,
      life: 1.4 + rand() * 1.2,
    });
  }
  return out;
}

/** 亮點的亮度：冒出來時一閃，飄著慢慢淡掉。 */
export function sparkleAlpha(s: Sparkle): number {
  if (s.t < 0 || s.t >= s.life) return 0;
  const k = s.t / s.life;
  return Math.min(1, s.t / 0.15) * (1 - k) * (0.7 + 0.3 * Math.sin(s.t * 18));
}
