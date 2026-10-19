/**
 * 鰭型（J18）：AI 畫不出來的鰭（大C 的背鰭臀鰭、劍尾、大耳的胸鰭）在花紋圖上用程式補畫。
 * 緞帶、燕尾、半月有整條魚的精繪圖，那張圖沒載入時也用這裡的形狀頂上。
 * 座標是魚的圖層像素：原點在魚中心、頭朝左（跟白點一樣），只算形狀不碰畫面物件。
 */

export interface FinTraits {
  swallow?: boolean;
  ribbon?: boolean;
  dumbo?: boolean;
  bigC?: boolean;
  /** 0 沒有、1 上劍、2 下劍、3 雙劍。 */
  sword?: number;
  /** 半月尾：尾鰭張成 180 度的半圓。 */
  halfmoon?: boolean;
  /** 鰭長多基因分數 0–1（店裡平均 0.45）：大C 的弧度、劍和拖絲的長度跟著變。 */
  length?: number;
}

export interface FinShape {
  /** 填色的多邊形（x, y 交錯）或細線（filament，二次曲線的三個點）。 */
  points: number[];
  kind: 'fill' | 'line';
  /** 畫在身體前面（大耳的胸鰭）或後面。 */
  front: boolean;
  /** 鰭條：折線（x, y 交錯），從根部往外。 */
  rays?: number[][];
  /**
   * 薄紗長鰭（大C）：不描硬邊，邊緣羽化，沿著長度一小段一小段由濃到淡、顏色漸漸帶虹彩，鰭條細亮並往尖端漸透（畫面評測 V27、#146）。
   * points 前半是一側從根到尖、後半是另一側從尖到根，各 n+1 點。
   */
  soft?: boolean;
}

interface Body {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

type P = [number, number];
const qb = (a: P, c: P, b: P, t: number): P => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];

/**
 * 一條往外飄的長鰭（大C 的背鰭臀鰭、劍）：沿著二次曲線的中線，從根部的寬度漸漸收到尖端，
 * 鰭條順著中線走。
 */
function streamer(a: P, c: P, b: P, w0: number, w1: number, n = 14, rayOffs = [-0.6, -0.2, 0.2, 0.6], rayEnd = n - 2): FinShape {
  const left: number[] = [], right: number[] = [];
  const at = (t: number, off: number): P => {
    const p = qb(a, c, b, t);
    const q = qb(a, c, b, Math.min(1, t + 0.01));
    const r = qb(a, c, b, Math.max(0, t - 0.01));
    const dx = q[0] - r[0], dy = q[1] - r[1];
    const len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2;
    return [p[0] - (dy / len) * w * off, p[1] + (dx / len) * w * off];
  };
  for (let i = 0; i <= n; i++) {
    left.push(...at(i / n, 1));
    const r = at(1 - i / n, -1);
    right.push(...r);
  }
  const rays = rayOffs.map((off) => {
    const pts: number[] = [];
    for (let i = 0; i <= rayEnd; i++) pts.push(...at(i / n, off));
    return pts;
  });
  return { kind: 'fill', front: false, points: [...left, ...right], rays };
}

/** 依鰭型算出要補畫的形狀。length 是整條魚（含尾鰭）的長度。 */
export function finShapes(t: FinTraits, body: Body, length: number): FinShape[] {
  const out: FinShape[] = [];
  const { x: cx, y: cy, rx, ry } = body;
  const tailEnd = length / 2;
  const peduncle = cx + rx * 0.95;
  const k = Math.min(1, Math.max(0, t.length ?? 0.45));
  if (t.bigC) {
    // 大C：背鰭、臀鰭拉成又寬又長的帆，順著身體往後飄到尾巴上下，尖端往回彎，跟尾鰭圍成一個 C。
    // 根部整段壓在背鰭（臀鰭）的鰭基上，曲線一開始幾乎貼著身體往後走，所以根部的截面就躺在背上，不會浮在半空（畫面評測 V16、#101）。
    // 分數越高越長、彎得越大
    const e = Math.max(0, k - 0.66) / 0.34; // 剛好達標 0 → 滿分 1
    for (const dir of [-1, 1]) {
      const dorsal = dir < 0;
      const root: P = [cx + rx * (dorsal ? 0.6 : 0.55), cy + dir * ry * (dorsal ? 0.62 : 0.55)];
      const ctl: P = [peduncle + rx * (0.25 + e * 0.15), cy + dir * ry * (dorsal ? 2.9 + e * 0.9 : 2.5 + e * 0.8)];
      const tip: P = [tailEnd + length * (0.01 + e * 0.05), cy + dir * ry * (dorsal ? 1.7 + e * 0.5 : 1.5 + e * 0.4)];
      const w0 = rx * (dorsal ? 0.7 : 0.5);
      // 鰭條密一點、一路拉到尖端，放大到肖像時看得出是一根根的鰭條撐著的薄膜
      const rayOffs = Array.from({ length: 10 }, (_, i) => -0.84 + (i * 1.68) / 9);
      out.push({ ...streamer(root, ctl, tip, w0, ry * 0.05, 24, rayOffs, 23), soft: true });
    }
  }
  if (t.ribbon && !t.bigC) {
    // 緞帶：腹鰭（和公魚的交接器）拉成長長的帶子往後下方垂
    const drop = 2.2 + k * 1.4;
    out.push({ kind: 'line', front: false, points: [cx + rx * 0.05, cy + ry * 0.9, cx + rx * 0.5, cy + ry * drop * 0.75, cx + rx * 1.1, cy + ry * drop] });
    out.push({ kind: 'line', front: false, points: [cx - rx * 0.1, cy + ry * 0.85, cx + rx * 0.3, cy + ry * drop * 0.85, cx + rx * 0.85, cy + ry * (drop + 0.3)] });
  }
  if (t.halfmoon && !t.swallow) {
    // 半月：尾鰭上下張開成半圓，比原本的尾巴大一圈
    const r = Math.max(tailEnd - peduncle, ry * 2) * 1.05;
    const fan: number[] = [peduncle, cy - ry * 0.3];
    for (let i = 0; i <= 14; i++) {
      const a = -Math.PI / 2 + Math.PI * (i / 14);
      fan.push(peduncle + Math.cos(a) * r, cy + Math.sin(a) * r * 1.05);
    }
    fan.push(peduncle, cy + ry * 0.3);
    out.push({
      kind: 'fill',
      front: false,
      points: fan,
      rays: [-0.42, -0.3, -0.18, -0.06, 0.06, 0.18, 0.3, 0.42].map((a) => [peduncle, cy, peduncle + Math.cos(Math.PI * a) * r * 0.95, cy + Math.sin(Math.PI * a) * r]),
    });
  }
  if (t.swallow) {
    // 燕尾：鰭條末端長出鬚，尾鰭後緣拖著一排細絲
    const tail = length * (0.08 + k * 0.1);
    for (let i = 0; i < 7; i++) {
      const u = i / 6 - 0.5;
      const y0 = cy + u * ry * 2.6;
      out.push({ kind: 'line', front: false, points: [tailEnd - length * 0.12, y0, tailEnd + tail * 0.3, y0 + u * ry * 1.4, tailEnd + tail, y0 + u * ry * 2.2 + ry * 0.2] });
    }
    // 背鰭的鬚不畫：魚圖的背鰭位置跟身體橢圓對不準，補上去的線會浮在背上方（畫面評測 V16）
  }
  if (t.sword) {
    // 劍尾：尾鰭上緣或下緣的鰭條延伸成一支尖劍，根部寬、尖端細
    const len = length * (0.04 + k * 0.12);
    for (const dir of [-1, 1]) {
      if ((dir === -1 && t.sword !== 1 && t.sword !== 3) || (dir === 1 && t.sword !== 2 && t.sword !== 3)) continue;
      const root: P = [peduncle + rx * 0.05, cy + dir * ry * 0.35];
      const tip: P = [tailEnd + len, cy + dir * ry * 1.85];
      out.push(streamer(root, [tailEnd - length * 0.1, cy + dir * ry * 1.55], tip, ry * 0.45, ry * 0.03));
    }
  }
  if (t.dumbo) {
    // 大耳：胸鰭變大、常帶白色，在鰓後面像一片扇子
    const px = cx - rx * 0.45, py = cy + ry * 0.25;
    const fan: number[] = [px, py];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.12 + 0.6 * (i / 10));
      const r = 1 + 0.12 * Math.sin((i / 10) * Math.PI);
      fan.push(px + Math.cos(a) * rx * 0.8 * r, py + Math.sin(a) * ry * 1.6 * r);
    }
    out.push({
      kind: 'fill',
      front: true,
      points: fan,
      rays: [0.18, 0.28, 0.38, 0.48, 0.58, 0.68].map((a) => [px, py, px + Math.cos(Math.PI * a) * rx * 0.8, py + Math.sin(Math.PI * a) * ry * 1.6]),
    });
  }
  return out;
}

/** 色系的主色（劍尾、大C 的鰭用尾巴的顏色）。 */
export const FIN_COLORS = { blue: 0x3f7fd8, red: 0xd2402e, gold: 0xe4a83c, pale: 0xc9d4dc } as const;
