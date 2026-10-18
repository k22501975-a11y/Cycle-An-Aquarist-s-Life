import type { FishSpeciesId, Symptom } from '../sim';
import type { TankBounds } from './layout';

/** 每個魚種的游動個性。 */
interface MotionProfile {
  speed: number;
  /** 偏好的水層：0 = 水面、1 = 底部。 */
  depth: number;
  /** 與同種聚在一起的程度（群游）。 */
  cohesion: number;
  /** 貼底爬行（蝦）。 */
  crawler: boolean;
}

const PROFILES: Record<FishSpeciesId, MotionProfile> = {
  guppy: { speed: 38, depth: 0.35, cohesion: 0.3, crawler: false },
  zebrafish: { speed: 62, depth: 0.25, cohesion: 1, crawler: false },
  cherry_shrimp: { speed: 10, depth: 1, cohesion: 0, crawler: true },
};

export interface Swimmer {
  id: number;
  species: FishSpeciesId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 漫遊目標方向（弧度），緩慢變化。 */
  wander: number;
  /** 尾巴擺動相位。 */
  phase: number;
  /** 蝦：抱著飼料原地夾著吃。 */
  eating?: boolean;
  /** 蝦：受驚往後彈開還剩幾秒（這段時間不轉身）。 */
  startle?: number;
}

/** 蝦受驚彈開的時間（秒）。 */
export const STARTLE_SECONDS = 0.4;

export interface MotionContext {
  bounds: TankBounds;
  scale: number;
  /** 飼料顆粒位置（餓的魚會游過去）。 */
  food: Array<{ x: number; y: number }>;
}

export interface FishCondition {
  alive: boolean;
  hungry: boolean;
  symptoms: Symptom[];
}

export function spawnSwimmer(id: number, species: FishSpeciesId, bounds: TankBounds, rand: () => number): Swimmer {
  const p = PROFILES[species];
  const y = p.crawler ? bounds.bottom - 4 : bounds.surface + 30 + rand() * (bounds.bottom - bounds.surface - 60);
  return { id, species, x: 20 + rand() * (bounds.width - 40), y, vx: rand() - 0.5, vy: 0, wander: rand() * Math.PI * 2, phase: rand() * 10 };
}

/**
 * 簡化的 Boids：漫遊＋同種聚集與對齊＋保持距離＋避開缸壁＋追飼料。
 * 症狀會改變行為：躲藏→往底部角落、浮頭→貼水面、瀕死→幾乎不動、死亡→沉底。
 */
export function updateSwimmer(s: Swimmer, all: Swimmer[], cond: FishCondition, ctx: MotionContext, dt: number, rand: () => number): void {
  const p = PROFILES[s.species];
  const { bounds, scale } = ctx;

  if (!cond.alive) {
    // 死魚慢慢沉到底，停在底砂上。
    s.vx *= 0.95;
    s.vy = Math.min(s.vy + 4 * dt, 12 * scale);
    s.x += s.vx * dt;
    s.y = Math.min(s.y + s.vy * dt, bounds.bottom - 3 * scale);
    return;
  }

  const sym = new Set(cond.symptoms);
  let speed = p.speed * scale;
  s.eating = false;

  // 蝦受驚：尾巴一收往後彈開（頭的方向不變），慢慢停下
  if (p.crawler && (s.startle ?? 0) > 0) {
    s.startle = Math.max(0, s.startle! - dt);
    s.vx *= Math.pow(0.02, dt);
    s.x = Math.min(bounds.width - 16 * scale, Math.max(16 * scale, s.x + s.vx * dt));
    s.y = bounds.bottom - 3 * scale;
    return;
  }
  if (p.crawler) {
    for (const o of all) {
      if (PROFILES[o.species].crawler) continue;
      if (Math.abs(o.x - s.x) < 16 * scale && Math.abs(o.y - s.y) < 14 * scale && Math.abs(o.vx) > 10 * scale && rand() < dt * 4) {
        s.startle = STARTLE_SECONDS;
        s.vx = -(Math.sign(s.vx) || 1) * speed * 9;
        return;
      }
    }
  }
  if (sym.has('lethargic')) speed *= 0.45;
  if (sym.has('loss_of_balance')) speed *= 0.15;

  s.wander += (rand() - 0.5) * 1.6 * dt;
  let ax = Math.cos(s.wander) * 0.6;
  let ay = Math.sin(s.wander) * (p.crawler ? 0 : 0.12);

  // 偏好水層
  let targetDepth = p.depth;
  if (sym.has('hiding')) targetDepth = 0.9;
  if (sym.has('gasping')) targetDepth = 0;
  const targetY = bounds.surface + 12 * scale + targetDepth * (bounds.bottom - bounds.surface - 24 * scale);
  if (!p.crawler) ay += ((targetY - s.y) / (bounds.bottom - bounds.surface)) * 0.9;

  // 群體：聚集、對齊、分離
  let cx = 0, cy = 0, avx = 0, avy = 0, n = 0;
  for (const o of all) {
    if (o === s) continue;
    const dx = o.x - s.x, dy = o.y - s.y;
    const d2 = dx * dx + dy * dy;
    const minD = 18 * scale;
    if (d2 < minD * minD && d2 > 0.01) {
      ax -= (dx / Math.sqrt(d2)) * 1.2;
      ay -= (dy / Math.sqrt(d2)) * 1.2;
    }
    if (o.species === s.species && d2 < (120 * scale) ** 2) {
      cx += o.x; cy += o.y; avx += o.vx; avy += o.vy; n++;
    }
  }
  if (n > 0 && p.cohesion > 0 && !sym.has('hiding')) {
    ax += ((cx / n - s.x) / (60 * scale)) * p.cohesion;
    ay += ((cy / n - s.y) / (60 * scale)) * p.cohesion * 0.6;
    ax += (avx / n / speed) * 0.5 * p.cohesion;
    ay += (avy / n / speed) * 0.5 * p.cohesion;
  }

  // 餓了就追最近的飼料
  // 魚只搶水裡的，沉到底沙的留給蝦；蝦只走向沉到下層的
  const water = bounds.bottom - bounds.surface;
  const reachable = ctx.food.filter((f) => (p.crawler ? f.y > bounds.bottom - water * 0.4 : f.y < bounds.bottom - 6 * scale));
  if (cond.hungry && !sym.has('not_eating') && reachable.length > 0) {
    let best = reachable[0], bd = Infinity;
    for (const f of reachable) {
      const d = (f.x - s.x) ** 2 + (f.y - s.y) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    const d = Math.sqrt(bd) + 1;
    if (p.crawler && Math.abs(best.x - s.x) < 8 * scale && best.y > bounds.bottom - 8 * scale) {
      // 走到飼料旁邊：停下來抱著夾
      s.eating = true;
      ax = 0;
      s.vx *= Math.pow(0.05, dt);
    } else {
      ax += ((best.x - s.x) / d) * 2.5;
      if (!p.crawler) ay += ((best.y - s.y) / d) * 2.5;
      speed *= 1.6;
    }
  }

  // 避開缸壁
  const margin = 30 * scale;
  if (s.x < margin) ax += (margin - s.x) / margin * 3;
  if (s.x > bounds.width - margin) ax -= (s.x - (bounds.width - margin)) / margin * 3;
  if (s.y < bounds.surface + margin * 0.5) ay += 2;
  if (s.y > bounds.bottom - margin * 0.5 && !p.crawler) ay -= 2;

  s.vx += ax * speed * dt * 2;
  // 魚主要水平游動，垂直方向的速度壓低。
  s.vy += ay * speed * dt * 2;
  s.vy *= 0.92;
  const v = Math.hypot(s.vx, s.vy);
  if (v > speed) {
    s.vx = (s.vx / v) * speed;
    s.vy = (s.vy / v) * speed;
  }
  if (p.crawler) {
    s.vy = 0;
    s.y = bounds.bottom - 3 * scale;
  }
  const edge = 16 * scale;
  s.x = Math.min(bounds.width - edge, Math.max(edge, s.x + s.vx * dt));
  s.y = Math.min(bounds.bottom - 3 * scale, Math.max(bounds.surface + 4, s.y + s.vy * dt));
  // 病懨懨的魚尾巴也擺得慢
  s.phase += dt * (4 + v / (8 * scale)) * (sym.has('lethargic') || sym.has('loss_of_balance') ? 0.5 : 1);
}

export interface SickLook {
  /** 整條魚的色調（null 正常）。越虛弱越淡、偏灰。 */
  dim: number | null;
  /** 身體上下比例：消瘦時變扁。 */
  thin: number;
  /** 磨身（白點、寄生蟲癢）：0–1 的翻身幅度，偶爾突然側身蹭一下。 */
  flash: number;
}

/**
 * 生病的動作語言（D5）：看得出不對勁，但不誇張。
 * health 0–1；t 是畫面時間（秒），seed 讓每條魚磨身的時機錯開。
 */
export function sickLook(symptoms: readonly string[], health: number, t: number, seed: number): SickLook {
  const sym = new Set(symptoms);
  let pale = Math.max(0, Math.min(1, (0.6 - health) / 0.6));
  if (sym.has('lethargic')) pale = Math.max(pale, 0.5);
  const dim = pale > 0.02 ? mixGray(pale) : null;
  const thin = sym.has('thin') ? 0.86 : 1;
  let flash = 0;
  if (sym.has('flashing')) {
    // 大約每 5 秒蹭一次，每次 0.5 秒
    const cycle = (t / 5 + seed * 0.37) % 1;
    if (cycle < 0.1) flash = Math.sin((cycle / 0.1) * Math.PI);
  }
  return { dim, thin, flash };
}

/** 白色往淡灰藍混：1 是最淡。 */
function mixGray(k: number): number {
  const ch = (to: number) => Math.round(255 + (to - 255) * k * 0.7);
  return (ch(0xa8) << 16) | (ch(0xb4) << 8) | ch(0xb8);
}

/** 死亡演出的長度（秒）：最後幾下抽動、慢慢翻成白肚朝上、顏色褪成灰。 */
export const DEATH_SECONDS = 4;

export interface DeathPose {
  /** 身體上下的比例：1 正常，-1 翻成肚子朝上；中間經過 0 看起來像側身翻過去。 */
  flip: number;
  /** 翻身時頭稍微往下栽的角度。 */
  tilt: number;
  /** 褪色程度 0–1。 */
  fade: number;
  /** 尾巴擺動幅度：剛死時還抽動幾下，之後完全不動。 */
  swing: number;
}

/** 死了 t 秒的姿勢（design/art-style.md：嚴肅不搞笑，動作慢、沒有彈跳）。 */
export function deathPose(t: number, crawler = false): DeathPose {
  const k = Math.max(0, Math.min(1, t / DEATH_SECONDS));
  const ease = k * k * (3 - 2 * k);
  const swing = t < 1.2 ? 0.5 * (1 - t / 1.2) * Math.abs(Math.sin(t * 9)) : 0;
  // 蝦子死了是側躺，不會翻白肚
  if (crawler) return { flip: 1, tilt: 0.25 * ease, fade: ease, swing: 0 };
  const roll = Math.max(0, Math.min(1, (t - 0.8) / (DEATH_SECONDS - 0.8)));
  const r = roll * roll * (3 - 2 * roll);
  return { flip: Math.cos(Math.PI * r), tilt: 0.35 * Math.sin(Math.PI * r), fade: ease, swing };
}

/** 轉身的狀態：f 是面向（1 朝左、-1 朝右），轉身時經過 0（身體變窄，像轉向鏡頭）。 */
export interface TurnState {
  f: number;
  v: number;
}

/** 速度小於這個就不換面向，避免停著的魚左右抖。 */
const TURN_DEADZONE = 0.6;

/** 用彈簧把面向帶到游的方向：稍微衝過頭再彈回，所以轉完會有一下回彈。 */
export function stepTurn(s: TurnState, vx: number, dt: number): void {
  const target = vx < -TURN_DEADZONE ? 1 : vx > TURN_DEADZONE ? -1 : Math.sign(s.f) || 1;
  const k = 90, damping = 2 * Math.sqrt(k) * 0.7;
  s.v += (k * (target - s.f) - damping * s.v) * dt;
  s.f = Math.max(-1.2, Math.min(1.2, s.f + s.v * dt));
}

/** 面向換算成縮放：轉到一半身體壓窄、稍微變高；衝過頭時拉長、變扁。 */
export function turnScale(f: number): { sx: number; sy: number } {
  const a = Math.abs(f);
  const sx = (f < 0 ? -1 : 1) * Math.max(0.15, a);
  const sy = 1 + 0.1 * (1 - Math.min(1, a)) - 0.35 * Math.max(0, a - 1);
  return { sx, sy };
}
