import { HUNGRY, type FishSpeciesId, type Symptom } from '../sim';
import { stepIdle, type Idle } from './idle';
import { floorAt, type TankBounds } from './layout';

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
  // 短鯛：底層、在石頭和洞穴附近慢慢巡
  apisto: { speed: 30, depth: 0.85, cohesion: 0, crawler: false },
  // 鬥魚：上層慢慢漂，長鰭拖著游不快
  betta: { speed: 22, depth: 0.2, cohesion: 0, crawler: false },
  crystal_shrimp: { speed: 10, depth: 1, cohesion: 0, crawler: true },
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
  /** 蝦：抱著飼料原地夾著吃；魚：停在飼料旁邊吃（不轉身、身體不歪）。 */
  eating?: boolean;
  /** 蝦：受驚往後彈開還剩幾秒（這段時間不轉身）。 */
  startle?: number;
  /** 跟著哪尾母魚（親魚護幼的仔魚）。 */
  follow?: number;
  /** 畫面上身體的一半長、一半高（像素），別的魚算距離時用。 */
  size?: { halfLen: number; halfH: number };
  /** 待機行為（V1）：在草邊停、在水面啄、在底下休息。 */
  idle?: Idle;
  /** 待機到位了：停著不轉身、尾巴輕輕擺。 */
  settled?: boolean;
  /** 這一格在水面啄了一下（畫面張嘴）。 */
  peck?: boolean;
  /** 蝦爬上水草（#273）：x 草莖的位置、h 要爬多高、t 還要待幾秒、lift 現在離底沙多高（像素）。 */
  climb?: { x: number; h: number; t: number; lift: number };
}

/** 蝦受驚彈開的時間（秒）。 */
export const STARTLE_SECONDS = 0.4;

export interface MotionContext {
  bounds: TankBounds;
  scale: number;
  /** 飼料顆粒位置（餓的魚會游過去）。 */
  food: Array<{ x: number; y: number }>;
  /** 剛撒飼料的搶食熱度 0–1：魚不太餓也會衝上去搶。 */
  frenzy?: number;
  /** 手指剛點過的水裡一點（F6）：好奇的魚會游過來看；seq 每點一次換一個，決定這次誰會來。 */
  poke?: { x: number; y: number; age: number; seq: number };
  /** 水草的水平位置（像素）：待機時會游到草邊停一會兒。 */
  plants?: readonly number[];
  /** 蝦能爬的草（#273）：草莖的水平位置、葉子頂端的高度（像素）。 */
  perches?: ReadonlyArray<{ x: number; top: number }>;
}

/** 蝦爬草的速度（相對走路速度）、平均多久想爬一次（秒）。 */
const CLIMB_SPEED = 0.9;
const CLIMB_EVERY = 25;
/** 蝦沒事自己往後彈一下（真的蝦偶爾會，#273），平均多久一次（秒）。 */
const HOP_EVERY = 40;

/** 魚的個性帶來的小行為（sim/personality.ts 的係數）。 */
export interface FishMood {
  feedRush: number;
  activity: number;
  hide: number;
  approach: number;
}

/** 手指點水面後魚過來看的秒數。 */
export const POKE_SECONDS = 4;

/** 這次手指點下去，這尾魚會不會游過來（同一次點擊結果固定，不會一幀來一幀不來）。 */
export function comesToPoke(id: number, seq: number, approach: number): boolean {
  const x = Math.sin(id * 12.9898 + seq * 78.233) * 43758.5453;
  return x - Math.floor(x) < approach;
}

export interface FishCondition {
  alive: boolean;
  hungry: boolean;
  symptoms: Symptom[];
  /** 親魚護幼：這尾仔魚跟著的母魚 id。 */
  follow?: number;
  /** 正在帶小孩的母魚：慢慢巡、趕走靠近的魚。 */
  guarding?: boolean;
  /** 顧泡巢的公鬥魚：泡巢的水平位置，公魚守在下面、不時游上去補泡泡。 */
  nestX?: number;
  /** 餓很久（0–1）：沒有飼料時會不時游到水面討食。 */
  begging?: number;
  /** 畫面上身體的一半長、一半高（像素）：整條魚留在缸裡，不會半個身體出了缸壁或埋進底沙。 */
  body?: { halfLen: number; halfH: number };
  /** 個性（F6）：搶食快慢、活潑程度、愛不愛躲、會不會游來看手指。 */
  mood?: FishMood;
}

/** 靠近母魚的外人（不是自己的小孩、不是蝦）。 */
function intruderNear(mom: Swimmer, all: Swimmer[], radius: number): Swimmer | null {
  let best: Swimmer | null = null;
  let bd = radius * radius;
  for (const o of all) {
    if (o === mom || o.follow === mom.id || PROFILES[o.species].crawler) continue;
    const d = (o.x - mom.x) ** 2 + (o.y - mom.y) ** 2;
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/**
 * 蝦走在底沙的哪一排（畫面評測第 8 輪：六隻蝦同一個高度排成一直線很不自然）：
 * 每隻照編號固定一個前後位置，往下（靠近玩家、走在沙的前緣）最多約 9 px，往上（後面）約 2 px。
 */
export function crawlLane(id: number): number {
  const k = (Math.imul(id + 1, 2654435761) >>> 0) / 4294967296;
  return -2 + k * 11;
}

function nearestPerch(x: number, perches: ReadonlyArray<{ x: number; top: number }>, within: number): { x: number; top: number } | null {
  let best = null, bd = within;
  for (const q of perches) {
    const d = Math.abs(q.x - x);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/**
 * 蝦爬草（#273）：先走到草莖下面，順著莖往上爬到一半左右，抱著葉子待一會兒再爬下來。
 * 餓了又有飼料沉下來、或身體不舒服就提早下來。回傳 true 表示這一格已經處理完（還在草上）。
 */
function climbStep(s: Swimmer, c: NonNullable<Swimmer['climb']>, cond: FishCondition, ctx: MotionContext, speed: number, dt: number): boolean {
  const { bounds, scale } = ctx;
  const sinking = ctx.food.some((f) => f.y > bounds.bottom - (bounds.bottom - bounds.surface) * 0.4);
  if ((cond.hungry && sinking) || cond.symptoms.some((x) => x === 'lethargic' || x === 'loss_of_balance' || x === 'gasping')) c.t = Math.min(c.t, 0);
  const footY = (x: number) => floorAt(bounds, x) - Math.max(3 * scale, (cond.body?.halfH ?? 0) * 0.8);
  if (c.lift <= 0 && Math.abs(c.x - s.x) > 2 * scale) {
    if (c.t <= 0) {
      s.climb = undefined;
      return false;
    }
    // 走到草莖下面
    s.vx = Math.sign(c.x - s.x) * speed;
    s.vy = 0;
    s.x += s.vx * dt;
    s.y = footY(s.x) + crawlLane(s.id) * scale;
    s.phase += dt * 5;
    return true;
  }
  c.t -= dt;
  const want = c.t > 0 ? c.h : 0;
  const step = speed * CLIMB_SPEED * dt;
  const before = c.lift;
  c.lift = want > c.lift ? Math.min(want, c.lift + step) : Math.max(want, c.lift - step);
  if (c.t <= 0 && c.lift <= 0) {
    s.climb = undefined;
    return false;
  }
  s.x += (c.x - s.x) * Math.min(1, dt * 4);
  s.vx = 0;
  s.vy = (before - c.lift) / Math.max(dt, 1e-6);
  // 剛離開底沙那一段從沙上的那一排慢慢收到草莖上
  const lane = crawlLane(s.id) * scale * Math.max(0, 1 - c.lift / (12 * scale));
  s.y = footY(s.x) + lane - c.lift;
  s.phase += dt * (2 + Math.abs(s.vy) / (4 * scale));
  return true;
}

export function spawnSwimmer(id: number, species: FishSpeciesId, bounds: TankBounds, rand: () => number): Swimmer {
  const p = PROFILES[species];
  const y = p.crawler ? floorAt(bounds, bounds.width / 2) - 4 : bounds.surface + 30 + rand() * (bounds.bottom - bounds.surface - 60);
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
    s.idle = undefined;
    s.climb = undefined;
    // 死魚慢慢沉到底，停在底砂上。
    s.vx *= 0.95;
    s.vy = Math.min(s.vy + 4 * dt, 12 * scale);
    s.x += s.vx * dt;
    s.y = Math.min(s.y + s.vy * dt, floorAt(bounds, s.x) - 3 * scale);
    return;
  }

  const sym = new Set(cond.symptoms);
  const mood = cond.mood;
  let speed = p.speed * scale * (mood?.activity ?? 1);
  s.size = cond.body;
  s.eating = false;
  s.settled = false;
  s.peck = false;

  // 蝦受驚：尾巴一收往後彈開（頭的方向不變），慢慢停下
  if (p.crawler && (s.startle ?? 0) > 0) {
    s.startle = Math.max(0, s.startle! - dt);
    s.vx *= Math.pow(0.02, dt);
    s.x = Math.min(bounds.width - 16 * scale, Math.max(16 * scale, s.x + s.vx * dt));
    s.y = floorAt(bounds, s.x) - Math.max(3 * scale, (cond.body?.halfH ?? 0) * 0.8) + crawlLane(s.id) * scale;
    return;
  }
  if (p.crawler && s.climb && climbStep(s, s.climb, cond, ctx, speed, dt)) return;
  if (p.crawler) {
    const perch = ctx.perches?.length && !cond.hungry && !sym.has('lethargic') && rand() < dt / CLIMB_EVERY ? nearestPerch(s.x, ctx.perches, 60 * scale) : null;
    if (perch) {
      const floor = floorAt(bounds, perch.x);
      const tall = floor - perch.top;
      // 太矮的草（前景草皮）不爬
      if (tall > 24 * scale) {
        s.climb = { x: perch.x + (rand() - 0.5) * 4 * scale, h: tall * (0.35 + 0.4 * rand()), t: 5 + rand() * 8, lift: 0 };
        return;
      }
    }
    if (rand() < dt / HOP_EVERY) {
      s.startle = STARTLE_SECONDS;
      s.vx = -(Math.sign(s.vx) || 1) * speed * 6;
      return;
    }
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
  // 愛躲的（膽小、懶散）待低一點，靠近底下的水草和石頭
  else if (mood && !p.crawler && !sym.has('hiding')) targetDepth += (1 - targetDepth) * mood.hide * 0.35;
  // 同一群的魚各有一點偏好的上下位置，不會全擠在同一個水層疊成一團（#147）
  else if (p.cohesion > 0) targetDepth = Math.min(1, Math.max(0, targetDepth + (((s.id * 0.618) % 1) - 0.5) * 0.35));
  const targetY = bounds.surface + 12 * scale + targetDepth * (bounds.bottom - bounds.surface - 24 * scale);
  if (!p.crawler) ay += ((targetY - s.y) / (bounds.bottom - bounds.surface)) * 0.9;

  // 親魚護幼（market-and-breeding.md §1.3.3）：仔魚像一團小雲跟著媽媽，有魚靠近就一下子聚回媽媽身邊；
  // 母魚慢慢巡，外人靠近就衝過去趕
  s.follow = cond.follow;
  const mom = cond.follow !== undefined ? all.find((o) => o.id === cond.follow) : undefined;
  if (mom) {
    const threat = intruderNear(mom, all, 70 * scale) !== null;
    // 每尾仔魚在媽媽身邊有自己的位置；媽媽停下來時散開覓食，有危險時縮成一團
    const still = Math.hypot(mom.vx, mom.vy) < 8 * scale;
    const r = (threat ? 7 : still ? 26 : 16) * scale * (0.5 + ((s.id * 0.618) % 1));
    const a = s.id * 2.399 + s.phase * 0.05;
    const tx = mom.x - Math.sign(mom.vx || 1) * 6 * scale + Math.cos(a) * r;
    const ty = mom.y + Math.sin(a) * r * 0.5;
    ax = ax * 0.3 + ((tx - s.x) / (14 * scale)) * (threat ? 3 : 1.5);
    ay = ((ty - s.y) / (14 * scale)) * (threat ? 3 : 1.5);
    speed *= threat ? 2.2 : 1.2;
  } else if (cond.nestX !== undefined) {
    // 在泡巢下慢慢晃，偶爾貼到水面補泡泡、把掉下來的卵含回去
    const up = Math.sin(s.phase * 0.05 + s.id) > 0.6;
    const ty = bounds.surface + (up ? 12 : 30) * scale;
    ax = ax * 0.25 + ((cond.nestX - s.x) / (30 * scale)) * 1.2;
    ay = ((ty - s.y) / (16 * scale)) * 1.5;
    // 離泡巢遠就游回去，到了就慢慢晃
    speed *= Math.hypot(cond.nestX - s.x, ty - s.y) > 40 * scale ? 0.9 : 0.35;
  } else if (cond.guarding) {
    const foe = intruderNear(s, all, 70 * scale);
    if (foe) {
      // 衝過去趕走
      ax += ((foe.x - s.x) / (20 * scale)) * 2;
      ay += ((foe.y - s.y) / (20 * scale)) * 2;
      speed *= 2.4;
    } else {
      // 帶著小孩慢慢巡，常常停下來讓小孩散開吃東西
      speed *= Math.sin(s.phase * 0.07 + s.id) > 0.3 ? 0.15 : 0.55;
      ay += ((bounds.bottom - 30 * scale - s.y) / (bounds.bottom - bounds.surface)) * 3;
    }
  }

  // 群體：聚集、對齊、分離
  let sepX = 0, sepY = 0;
  let cx = 0, cy = 0, avx = 0, avy = 0, n = 0;
  for (const o of all) {
    if (o === s) continue;
    const dx = o.x - s.x, dy = o.y - s.y;
    const d2 = dx * dx + dy * dy;
    // 跟著媽媽的仔魚彼此靠得很近也沒關係
    const minD = mom && (o.follow === s.follow || o === mom) ? 4 * scale : 18 * scale;
    if (d2 < minD * minD && d2 > 0.01) {
      ax -= (dx / Math.sqrt(d2)) * 1.2;
      ay -= (dy / Math.sqrt(d2)) * 1.2;
    }
    // 照身體大小留個人空間（#147）：前後約半個身長、上下一個身高，靠太近就推開，上下錯開為主
    if (!mom && !p.crawler && !PROFILES[o.species].crawler && o.follow === undefined) {
      const sep = personalSpace(s, o, scale);
      sepX += sep.x;
      sepY += sep.y;
    }
    // 蝦在沙面上左右錯開，不會三隻疊成一團紅色（#173）
    if (p.crawler && PROFILES[o.species].crawler && Math.abs(dy) < 14 * scale) {
      const gap = Math.max(16 * scale, ((s.size?.halfLen ?? 8 * scale) + (o.size?.halfLen ?? 8 * scale)) * 0.95);
      const ax2 = Math.abs(dx);
      if (ax2 < gap) sepX -= (dx === 0 ? (s.id < o.id ? 1 : -1) : Math.sign(dx)) * (1 - ax2 / gap) * 5;
    }
    if (o.species === s.species && d2 < (120 * scale) ** 2) {
      cx += o.x; cy += o.y; avx += o.vx; avy += o.vy; n++;
    }
  }
  if (n > 0 && p.cohesion > 0 && !sym.has('hiding') && cond.nestX === undefined) {
    ax += ((cx / n - s.x) / (60 * scale)) * p.cohesion;
    ay += ((cy / n - s.y) / (60 * scale)) * p.cohesion * 0.6;
    ax += (avx / n / speed) * 0.5 * p.cohesion;
    ay += (avy / n / speed) * 0.5 * p.cohesion;
  }

  // 餓了就追最近的飼料
  // 魚只搶水裡的，沉到底沙的留給蝦；蝦只走向沉到下層的
  const water = bounds.bottom - bounds.surface;
  const reachable = ctx.food.filter((f) => (p.crawler ? f.y > bounds.bottom - water * 0.4 : f.y < floorAt(bounds, f.x) - 6 * scale));
  // 剛撒飼料：沒在帶小孩、顧泡巢的魚都會來搶（蝦照自己的步調）
  const frenzy = p.crawler || cond.follow !== undefined || cond.nestX !== undefined || cond.guarding ? 0 : (ctx.frenzy ?? 0);
  let chasing = false;
  if ((cond.hungry || frenzy > 0.05) && !sym.has('not_eating') && reachable.length > 0) {
    let best = reachable[0], bd = Infinity;
    for (const f of reachable) {
      const d = (f.x - s.x) ** 2 + (f.y - s.y) ** 2;
      if (d < bd) { bd = d; best = f; }
    }
    const d = Math.sqrt(bd) + 1;
    if (p.crawler && Math.abs(best.x - s.x) < 8 * scale && best.y > floorAt(bounds, best.x) - 8 * scale) {
      // 走到飼料旁邊：停下來抱著夾
      s.eating = true;
      ax = 0;
      s.vx *= Math.pow(0.05, dt);
    } else if (!p.crawler && d < Math.max(16 * scale, (cond.body?.halfLen ?? 0) * 1.3)) {
      // 游到飼料旁邊：煞車停住、身體穩穩的，只張嘴吃（YenWel：吃東西只要動嘴巴，不要整條魚左右晃）
      s.eating = true;
      ax = ((best.x - s.x) / d) * 0.4;
      ay = ((best.y - s.y) / d) * 0.4;
      s.vx *= Math.pow(0.02, dt);
      s.vy *= Math.pow(0.02, dt);
      speed *= 0.3;
      chasing = true;
    } else {
      const dx = best.x - s.x;
      // 快到飼料正上方時放慢橫向、不再硬拉：不然會衝過頭又折回，看起來左右狂晃
      const near = 40 * scale;
      const pull = p.crawler ? 1 : Math.min(1, Math.abs(dx) / near);
      ax += (dx / d) * 2.5 * pull;
      // 往上衝搶水面的飼料：搶食越熱往上拉得越用力
      if (!p.crawler) ay += ((best.y - s.y) / d) * 2.5 * (1 + 1.5 * frenzy);
      if (pull < 1) s.vx *= Math.pow(0.05, dt * (1 - pull));
      // 貪吃的衝最快，膽小的慢吞吞（F6）；乘回 activity 的倒數，搶食快慢只看 feedRush
      speed *= (1.6 + 0.9 * frenzy) * (mood ? mood.feedRush / mood.activity : 1);
      chasing = !p.crawler;
    }
  }

  // 手指點水面（F6）：好奇的魚游過來看看，到了就在旁邊慢慢晃
  const poke = ctx.poke;
  if (!chasing && poke && mood && !p.crawler && poke.age < POKE_SECONDS && cond.follow === undefined && cond.nestX === undefined && !sym.has('hiding') && comesToPoke(s.id, poke.seq, mood.approach)) {
    const dx = poke.x - s.x;
    const dy = poke.y - s.y;
    const d = Math.hypot(dx, dy) + 1;
    const near = Math.max(22 * scale, (cond.body?.halfLen ?? 0) * 1.6);
    if (d > near) {
      ax += (dx / d) * 2.2;
      ay += (dy / d) * 2.2;
      speed *= 2;
    } else {
      s.vx *= Math.pow(0.1, dt);
      s.vy *= Math.pow(0.1, dt);
      speed *= 0.4;
    }
    chasing = true;
  }

  // 沒事做的時候（V1）：偶爾去草邊停、到水面啄、沉到底下休息，看個性
  let settle = false;
  let idling = false;
  const unwell = sym.has('hiding') || sym.has('gasping') || sym.has('lethargic') || sym.has('loss_of_balance');
  const free = !chasing && !p.crawler && !mom && cond.nestX === undefined && !cond.guarding && !unwell && (cond.begging ?? 0) < 0.3;
  if (!free) s.idle = undefined;
  else {
    const scene = { surface: bounds.surface, bottom: bounds.bottom, width: bounds.width, scale, plants: ctx.plants ?? [], floorAt: (x: number) => floorAt(bounds, x) };
    const steer = stepIdle(s, mood, cond.body?.halfLen ?? 10 * scale, cond.body?.halfH ?? 4 * scale, scene, dt, rand);
    if (steer) {
      idling = true;
      ax = ax * 0.2 + steer.ax;
      ay = steer.ay;
      speed *= steer.speed;
      settle = s.settled = steer.settled;
      s.peck = steer.peck;
      if (settle) {
        s.vx *= Math.pow(0.15, dt);
        s.vy *= Math.pow(0.15, dt);
      }
    }
  }

  // 分離最後才加：追飼料、停著吃會蓋掉前面的方向，但不能蓋掉個人空間（停著吃時推得輕一點，大家擠在同一顆飼料邊也看得出幾條）
  ax += sepX * (s.eating ? 0.5 : 1);
  ay += sepY * (s.eating ? 0.5 : 1);

  // 餓很久又沒飼料：不時游到水面前面討食（玩家一看就知道該餵了）
  if (!chasing && !p.crawler && (cond.begging ?? 0) > 0 && cond.follow === undefined && cond.nestX === undefined && !sym.has('not_eating')) {
    if (Math.sin(s.phase * 0.02 + s.id * 1.7) > 0.4 - 0.6 * cond.begging!) {
      ay += ((bounds.surface + 10 * scale - s.y) / (20 * scale)) * 1.5;
      speed *= 1.2;
    }
  }

  // 避開缸壁：照身體長度留空間，不會整群擠在缸邊
  const halfLen = cond.body?.halfLen ?? 0;
  const halfH = cond.body?.halfH ?? 0;
  const margin = Math.max(30 * scale, halfLen * 2.2);
  if (s.x < margin) ax += (margin - s.x) / margin * 3;
  if (s.x > bounds.width - margin) ax -= (s.x - (bounds.width - margin)) / margin * 3;
  // 靠牆時漫遊方向也轉回缸中間，不然推開又游回去，整群貼著缸壁疊成一排
  if (!p.crawler && ((s.x < margin && Math.cos(s.wander) < 0) || (s.x > bounds.width - margin && Math.cos(s.wander) > 0))) s.wander = Math.PI - s.wander;
  const floor = floorAt(bounds, s.x);
  // 靠近水面、底沙時越深推越用力（漸進）：原本一越線就推 2、離開就歸零，魚在線上來回彈，
  // 上下速度每格變號，身體跟著一直點頭抖動（YenWel 回報「魚一直抽搐抖動」）
  const band = Math.max(1, margin * 0.5);
  const top = bounds.surface + band;
  const low = floor - halfH - band;
  if (s.y < top && cond.nestX === undefined && !chasing && !idling) ay += 2 * Math.min(1, (top - s.y) / band);
  if (s.y > low && !p.crawler && !idling) ay -= 2 * Math.min(1, (s.y - low) / band);

  s.vx += ax * speed * dt * 2;
  // 魚主要水平游動，垂直方向的速度壓低；搶食往上衝時放寬一點
  s.vy += ay * speed * dt * 2;
  s.vy *= chasing ? 0.92 + 0.05 * frenzy : idling ? 0.95 : 0.92;
  const v = Math.hypot(s.vx, s.vy);
  if (v > speed) {
    s.vx = (s.vx / v) * speed;
    s.vy = (s.vy / v) * speed;
  }
  if (p.crawler) {
    s.vy = 0;
  }
  const edge = Math.max(16 * scale, halfLen + 4 * scale);
  s.x = Math.min(bounds.width - edge, Math.max(edge, s.x + s.vx * dt));
  const wantY = s.y + s.vy * dt;
  s.y = p.crawler
    ? floorAt(bounds, s.x) - Math.max(3 * scale, halfH * 0.8) + crawlLane(s.id) * scale
    : Math.min(Math.max(bounds.surface + 4, floorAt(bounds, s.x) - Math.max(3 * scale, halfH)), Math.max(bounds.surface + 4 + halfH * 0.3, wantY));
  // 頂到水面或底沙：往那邊的速度歸零，不然速度一直朝牆、位置被夾住，頭一直朝下（或朝上）抖
  if (!p.crawler && Math.abs(s.y - wantY) > 1e-6 && Math.sign(s.vy) === Math.sign(wantY - s.y)) s.vy = 0;
  // 病懨懨的魚尾巴也擺得慢
  s.phase += dt * (4 + v / (8 * scale)) * (sym.has('lethargic') || sym.has('loss_of_balance') ? 0.5 : 1) * (settle && s.idle?.kind === 'rest' ? 0.35 : 1);
}

/**
 * 兩條魚的個人空間（#147）：以兩條魚身體大小算一個橢圓（前後半個身長以上、上下一個身高），
 * 在裡面就往外推，越深推越用力；上下推得比前後用力，看起來是錯開一層而不是互相撞開。
 * 正好疊在同一點時照 id 決定誰往上。
 */
export function personalSpace(s: Swimmer, o: Swimmer, scale: number): { x: number; y: number } {
  const dx = o.x - s.x, dy = o.y - s.y;
  const rx = Math.max(14 * scale, ((s.size?.halfLen ?? 9 * scale) + (o.size?.halfLen ?? 9 * scale)) * 0.75);
  const ry = Math.max(8 * scale, ((s.size?.halfH ?? 4 * scale) + (o.size?.halfH ?? 4 * scale)) * 1.3);
  const nx = dx / rx, ny = dy / ry;
  const q = Math.sqrt(nx * nx + ny * ny);
  if (q >= 1) return { x: 0, y: 0 };
  const push = (1 - q) * 9;
  if (q < 0.05) return { x: 0, y: (s.id < o.id ? -1 : 1) * push * 1.4 };
  return { x: -(nx / q) * push * 0.6, y: -(ny / q) * push * 1.4 };
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
  /** 決定要面向哪邊（1 朝左、-1 朝右）；f 用彈簧追過去。 */
  dir?: number;
  /** 想轉向的方向已經維持多久（秒）：要維持一下才真的轉，追飼料時才不會左右狂翻。 */
  hold?: number;
  /** 剛轉完身的冷卻（秒）：冷卻中只有游很快（逃跑、衝刺）才會再轉。 */
  cool?: number;
}

/** 速度小於這個（px/秒）就不換面向，避免停著、在飼料旁邊慢慢晃的魚左右抖。 */
const TURN_DEADZONE = 5;
/** 新方向要維持多久才轉身。 */
const TURN_COMMIT = 0.18;
/** 轉完身後多久內不會再轉回來（除非游得很快）。 */
const TURN_COOLDOWN = 0.9;
const TURN_URGENT_SPEED = 40;

/** 用彈簧把面向帶到游的方向：稍微衝過頭再彈回，所以轉完會有一下回彈。 */
export function stepTurn(s: TurnState, vx: number, dt: number, hold = false): void {
  const dir = s.dir ?? (Math.sign(s.f) || 1);
  // hold：停在飼料旁邊吃的時候不轉身，不然一點點橫向漂移就左右翻面
  const want = hold ? dir : vx < -TURN_DEADZONE ? 1 : vx > TURN_DEADZONE ? -1 : dir;
  s.cool = Math.max(0, (s.cool ?? 0) - dt);
  s.dir = dir;
  if (want !== dir) {
    s.hold = (s.hold ?? 0) + dt;
    if (s.hold >= TURN_COMMIT && (s.cool <= 0 || Math.abs(vx) > TURN_URGENT_SPEED)) {
      s.dir = want;
      s.hold = 0;
      s.cool = TURN_COOLDOWN;
    }
  } else s.hold = 0;
  const k = 90, damping = 2 * Math.sqrt(k) * 0.7;
  s.v += (k * (s.dir - s.f) - damping * s.v) * dt;
  s.f = Math.max(-1.2, Math.min(1.2, s.f + s.v * dt));
}

/** 游泳時身體跟著上下的速度微微仰頭、低頭；停著吃東西時幾乎不歪，不然原地上下漂就前後點頭。 */
export function swimTilt(s: Swimmer): number {
  const tilt = Math.max(-0.35, Math.min(0.35, Math.atan2(s.vy, Math.abs(s.vx) + 1) * 0.6));
  return (s.eating || s.settled) && !PROFILES[s.species].crawler ? tilt * 0.15 : tilt;
}

/** 面向換算成縮放：轉到一半身體壓窄（最窄 30%，不會變成一條線）、稍微變高；衝過頭時拉長、變扁。 */
export function turnScale(f: number): { sx: number; sy: number } {
  const a = Math.abs(f);
  const sx = (f < 0 ? -1 : 1) * Math.max(0.3, a);
  const sy = 1 + 0.1 * (1 - Math.min(1, a)) - 0.35 * Math.max(0, a - 1);
  return { sx, sy };
}

/**
 * 轉身中段的側身（畫面評測第 9 輪 #265）：只壓窄看起來像紙片翻面。
 * 轉到一半時身體往轉的方向側傾，顏色暗一點（看到的是背和肚子，不是側面的花紋）。
 * bank 是加在 rotation 上的弧度，shade 0～1 是要變暗多少。
 */
export function turnPose(f: number, v: number): { bank: number; shade: number } {
  const mid = 1 - Math.min(1, Math.abs(f));
  const bank = Math.max(-0.3, Math.min(0.3, 0.3 * mid * Math.sign(v) * Math.min(1, Math.abs(v) / 4)));
  return { bank, shade: mid };
}

/**
 * 餓的樣子（遊戲性評測：餓的魚畫面上看不出來）：餓很久肚子變扁，沒飼料時游到水面討食。
 * hunger 0（飽）～1（很餓）；一般餓（< 0.5）看不出來，免得每天都像在挨餓。
 */
export function hungerLook(hunger: number): { thin: number; begging: number } {
  // 跟模擬的「餓了」同一個門檻（點魚資訊卡、老闆說明也用它）；餓到 0.95 就是最扁、最常討食
  const k = Math.max(0, Math.min(1, (hunger - HUNGRY) / (0.95 - HUNGRY)));
  return { thin: 1 - 0.12 * k, begging: k };
}
