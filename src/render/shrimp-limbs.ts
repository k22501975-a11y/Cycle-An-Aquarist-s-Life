/**
 * 蝦的小螯和腹足（art-style.md §8.2、§8.3）：身體用精繪圖，夾子和腹足用程式畫細線段，
 * 動作可以無限變化。這裡只算位置，座標是「圖的比例」（0–1，頭朝右，跟精繪圖一樣）。
 */

export interface Pt {
  x: number;
  y: number;
}

export interface ClawPose {
  base: Pt;
  elbow: Pt;
  tip: Pt;
  /** 鉗子張開的程度 0（夾緊）–1（張開）。 */
  open: number;
}

/** 嘴、螯的根部、夾底沙的位置（在精繪圖裡量的）。 */
const MOUTH: Pt = { x: 0.8, y: 0.63 };
const BASE: Pt = { x: 0.75, y: 0.67 };
const GROUND: Pt = { x: 0.87, y: 0.92 };

const ease = (k: number) => k * k * (3 - 2 * k);

/**
 * 第 i 支螯（0、1 輪流）在時間 t 的樣子：往前下方伸到底沙夾一下，再收回嘴邊。
 * rate 是每秒夾幾次；reach 是伸多遠（走路時伸得短）。
 */
export function clawPose(t: number, rate: number, i: number, reach = 1): ClawPose {
  const cycle = t * rate + i * 0.5;
  const u = cycle - Math.floor(cycle);
  // 每一下夾的位置左右錯開一點，看起來是在找東西
  const n = Math.floor(cycle);
  const jitter = (Math.sin(n * 12.9898 + i * 78.233) * 43758.5453) % 1;
  const ground = { x: GROUND.x + jitter * 0.04, y: GROUND.y };
  const r = (u < 0.4 ? ease(u / 0.4) : u < 0.55 ? 1 : 1 - ease((u - 0.55) / 0.45)) * reach;
  const tip = { x: MOUTH.x + (ground.x - MOUTH.x) * r, y: MOUTH.y + (ground.y - MOUTH.y) * r };
  const base = { x: BASE.x - i * 0.02, y: BASE.y + i * 0.01 };
  // 關節往前上方拱起
  const elbow = { x: (base.x + tip.x) / 2 + 0.035, y: (base.y + tip.y) / 2 - 0.03 };
  const open = u < 0.4 ? 1 : u < 0.55 ? 1 - (u - 0.4) / 0.15 : 0;
  return { base, elbow, tip, open };
}

/** 抱蛋母蝦的腹足：五對在肚子下面一直搧（幫蛋送氧氣）。回傳每支的根部與末端。 */
export function pleopods(t: number, beating: boolean): Array<{ from: Pt; to: Pt }> {
  const out: Array<{ from: Pt; to: Pt }> = [];
  for (let k = 0; k < 5; k++) {
    const from = { x: 0.33 + k * 0.065, y: 0.74 };
    const a = beating ? 0.35 + 0.45 * Math.sin(t * Math.PI * 2 * 4 + k * 0.9) : 0.35;
    const len = 0.1;
    out.push({ from, to: { x: from.x - Math.sin(a) * len * 0.6, y: from.y + Math.cos(a) * len } });
  }
  return out;
}

/** 夾的速度：抱著飼料吃最快，閒著在底沙夾生物膜，走路時幾乎不夾。 */
export function clawRate(eating: boolean, speedRatio: number): { rate: number; reach: number } {
  if (eating) return { rate: 3, reach: 1 };
  if (speedRatio > 0.5) return { rate: 1, reach: 0.35 };
  return { rate: 2.2, reach: 0.85 };
}
