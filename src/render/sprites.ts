import { Container, Graphics } from 'pixi.js';
import { PLANT_SPECIES, type FishSpeciesId, type Plant } from '../sim';

export interface FishSprite {
  root: Container;
  body: Graphics;
  tail: Graphics;
  spots: Graphics;
  /** 選取時的外框。 */
  ring: Graphics;
}

/** 卡通風格的輪廓顏色：帶暖色的深褐（參考 art-style-cartoon-guppies.svg 的 #2b1a12）。 */
export const INK = 0x2b1a12;

/** 把顏色往白色（t > 0）或黑色（t < 0）調。 */
export function shade(color: number, t: number): number {
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  const ch = (shift: number) => Math.round(((color >> shift) & 255) * (1 - k) + target * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function mix(c1: number, c2: number, t: number): number {
  const ch = (shift: number) => Math.round(((c1 >> shift) & 255) * (1 - t) + ((c2 >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * 橢圓下緣的硬邊色塊陰影（卡通的「色塊陰影」）：外緣沿著橢圓，內緣是一條往上拱的弧線。
 * depth 是陰影佔身體高度的比例。
 */
function bellyShade(g: Graphics, cx: number, cy: number, rx: number, ry: number, color: number, depth = 0.45): void {
  const pts: number[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = Math.PI * (0.06 + (0.88 * i) / n);
    pts.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
  }
  // 內緣：從左端拱回右端
  for (let i = n - 1; i >= 1; i--) {
    const t = Math.PI * (0.06 + (0.88 * i) / n);
    const k = Math.sin(t);
    pts.push(cx + rx * 0.97 * Math.cos(t), cy + ry * (1 - 2 * depth) * k + ry * 0.12);
  }
  g.poly(pts).fill(color);
}

/** 橢圓上緣的亮面（反光帶）。 */
function topHighlight(g: Graphics, cx: number, cy: number, rx: number, ry: number, alpha = 0.6): void {
  const pts: number[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = Math.PI * (1.18 + (0.5 * i) / n);
    pts.push(cx + rx * 0.82 * Math.cos(t), cy + ry * 0.78 * Math.sin(t));
  }
  for (let i = n; i >= 0; i--) {
    const t = Math.PI * (1.18 + (0.5 * i) / n);
    pts.push(cx + rx * 0.7 * Math.cos(t), cy + ry * 0.45 * Math.sin(t));
  }
  g.poly(pts).fill({ color: 0xffffff, alpha });
}

/** 卡通大眼睛：粗框白眼球、大黑瞳孔、兩個反光點。 */
function drawEye(g: Graphics, x: number, y: number, r: number, s: number, iris = INK): void {
  g.circle(x, y, r).fill(0xffffff).stroke({ color: INK, width: 0.9 * s });
  g.circle(x + r * 0.18, y + r * 0.04, r * 0.62).fill(iris);
  if (iris !== INK) g.circle(x + r * 0.18, y + r * 0.04, r * 0.36).fill(INK);
  g.circle(x - r * 0.05, y - r * 0.24, r * 0.26).fill(0xffffff);
  g.circle(x + r * 0.42, y + r * 0.3, r * 0.11).fill(0xffffff);
}

/** 嘴角的小微笑。 */
function drawSmile(g: Graphics, x: number, y: number, s: number): void {
  g.moveTo(x - 1.4 * s, y).quadraticCurveTo(x - 0.2 * s, y + 1 * s, x + 0.9 * s, y - 0.2 * s).stroke({ color: INK, width: 0.55 * s, cap: 'round' });
}

/** 公孔雀魚的尾色與尾巴花紋（之後由基因決定，Phase 0 依個體編號輪替）。 */
const GUPPY_TAILS: Array<{ color: number; pattern: 'dots' | 'lace' | 'solid' | 'tuxedo' }> = [
  { color: 0xff5a3c, pattern: 'solid' },
  { color: 0x3f86ff, pattern: 'dots' },
  { color: 0xff3f8f, pattern: 'solid' },
  { color: 0xffc531, pattern: 'lace' },
  { color: 0x2f6fe0, pattern: 'tuxedo' },
];

/** 扇形大尾巴（原點在尾柄，往 -x 展開），外半部有較亮的色塊與鰭條。 */
function fanTail(g: Graphics, s: number, len: number, spread: number, color: number, line: { color: number; width: number }): void {
  const L = len * s;
  const W = spread * s;
  g.moveTo(0, -1.8 * s)
    .bezierCurveTo(-L * 0.3, -W * 0.6, -L * 0.6, -W * 1.05, -L * 0.88, -W)
    .bezierCurveTo(-L * 1.02, -W * 0.65, -L * 0.94, -W * 0.3, -L, 0)
    .bezierCurveTo(-L * 0.94, W * 0.3, -L * 1.02, W * 0.65, -L * 0.88, W)
    .bezierCurveTo(-L * 0.6, W * 1.05, -L * 0.3, W * 0.6, 0, 1.8 * s)
    .closePath()
    .fill(color)
    .stroke(line);
  // 尾巴外半部較亮的色塊
  g.moveTo(-L * 0.5, -W * 0.82)
    .bezierCurveTo(-L * 0.66, -W * 0.95, -L * 0.82, -W * 0.98, -L * 0.88, -W * 0.94)
    .bezierCurveTo(-L * 0.98, -W * 0.6, -L * 0.92, -W * 0.3, -L * 0.96, 0)
    .bezierCurveTo(-L * 0.92, W * 0.3, -L * 0.98, W * 0.6, -L * 0.88, W * 0.94)
    .bezierCurveTo(-L * 0.82, W * 0.98, -L * 0.66, W * 0.95, -L * 0.5, W * 0.82)
    .quadraticCurveTo(-L * 0.68, 0, -L * 0.5, -W * 0.82)
    .fill(shade(color, 0.35));
  // 鰭條
  for (const k of [-0.62, -0.25, 0.25, 0.62]) {
    g.moveTo(-L * 0.12, k * 1.2 * s).quadraticCurveTo(-L * 0.5, k * W * 0.75, -L * 0.82, k * W * 1.05).stroke({ color: INK, width: 0.45 * s, alpha: 0.35 });
  }
}

/** 尾巴花紋：點狀（草尾）、蕾絲（蛇王）、半黑（禮服）。 */
function tailPattern(g: Graphics, s: number, len: number, spread: number, color: number, pattern: string): void {
  const L = len * s;
  const W = spread * s;
  if (pattern === 'dots') {
    for (let i = 0; i < 26; i++) {
      const u = 0.25 + ((i * 0.618) % 1) * 0.65;
      const v = (((i * 0.382) % 1) * 2 - 1) * 0.85 * (0.4 + u * 0.6);
      g.circle(-L * u, v * W, (0.35 + ((i * 7) % 4) * 0.12) * s).fill(shade(color, -0.6));
    }
  } else if (pattern === 'lace') {
    for (let i = 0; i < 18; i++) {
      const u = 0.25 + ((i * 0.618) % 1) * 0.62;
      const v = (((i * 0.382) % 1) * 2 - 1) * 0.8 * (0.4 + u * 0.6);
      g.ellipse(-L * u, v * W, 0.9 * s, 0.6 * s).stroke({ color: shade(color, -0.55), width: 0.4 * s });
    }
  }
}

/** 依魚種畫一隻面向右邊的魚（原點在身體中心）。卡通風：粗輪廓、大眼睛、飽和色塊與硬邊陰影。 */
export function createFishSprite(species: FishSpeciesId, scale: number, variant: number, female = false): FishSprite {
  const root = new Container();
  const body = new Graphics();
  const tail = new Graphics();
  const spots = new Graphics();
  const ring = new Graphics();
  const s = scale;
  const line = { color: INK, width: 1.05 * s, join: 'round' as const };

  if (species === 'guppy' && female) {
    // 母孔雀魚（與所有仔魚）：橄欖灰、身體圓，短而淡的尾巴，腹部有孕斑
    const base = 0xb8c3be;
    fanTail(tail, s, 8.5, 4.5, 0xd2dad5, line);
    tail.position.set(-7.5 * s, 0);
    body.moveTo(-2 * s, -3.8 * s).bezierCurveTo(-1 * s, -6 * s, 2 * s, -6.4 * s, 3.4 * s, -3.6 * s).fill(0xd2dad5).stroke(line);
    body.ellipse(0, 0, 9 * s, 4.5 * s).fill(base);
    bellyShade(body, 0, 0, 9 * s, 4.5 * s, shade(base, -0.18));
    topHighlight(body, 0, 0, 9 * s, 4.5 * s, 0.55);
    body.ellipse(-3 * s, 1.6 * s, 1.7 * s, 1.2 * s).fill({ color: 0x3f4644, alpha: 0.75 });
    body.ellipse(0, 0, 9 * s, 4.5 * s).stroke(line);
    body.ellipse(0.5 * s, 1.8 * s, 1.8 * s, 0.9 * s).fill(0xd2dad5).stroke({ ...line, width: 0.7 * s });
    drawEye(body, 5.2 * s, -1 * s, 2.5 * s, s);
    drawSmile(body, 7.6 * s, 1.3 * s, s);
  } else if (species === 'guppy') {
    // 公孔雀魚：銀白身體、大片彩色扇形尾巴與背鰭（參考 art-style-cartoon-guppies.svg）
    const t = GUPPY_TAILS[variant % GUPPY_TAILS.length];
    fanTail(tail, s, 15, 8.5, t.color, line);
    tailPattern(tail, s, 15, 8.5, t.color, t.pattern);
    tail.position.set(-6.5 * s, 0);
    body.moveTo(-3 * s, -3.2 * s).bezierCurveTo(-2 * s, -7.5 * s, 3 * s, -8 * s, 4.2 * s, -3.4 * s).fill(t.color).stroke(line);
    body.moveTo(-1.6 * s, -4.2 * s).bezierCurveTo(-0.6 * s, -6.6 * s, 2 * s, -7 * s, 3 * s, -4.6 * s).fill(shade(t.color, 0.35));
    const bodyColor = 0xe3eaee;
    body.ellipse(0, 0, 8 * s, 3.9 * s).fill(bodyColor);
    if (t.pattern === 'tuxedo') {
      // 禮服：身體後半是深色
      body.poly([-8 * s, -1 * s, -2 * s, -3.9 * s, -0.5 * s, 3.9 * s, -8 * s, 1 * s]).fill(0x1d2440);
    } else {
      body.ellipse(-3 * s, 0.5 * s, 2.8 * s, 1.9 * s).fill({ color: t.color, alpha: 0.5 });
    }
    bellyShade(body, 0, 0, 8 * s, 3.9 * s, shade(bodyColor, -0.17));
    topHighlight(body, 0, 0, 8 * s, 3.9 * s, 0.75);
    body.ellipse(0, 0, 8 * s, 3.9 * s).stroke(line);
    body.ellipse(1 * s, 1.6 * s, 2 * s, 1 * s).fill(t.color).stroke({ ...line, width: 0.7 * s });
    drawEye(body, 4.6 * s, -0.9 * s, 2.5 * s, s);
    drawSmile(body, 7 * s, 1.2 * s, s);
  } else if (species === 'zebrafish') {
    // 斑馬魚：細長奶油色身體，藍色縱紋延伸到叉形尾巴
    const stripe = 0x2f5fd0;
    tail.moveTo(0, -1.4 * s).bezierCurveTo(-3 * s, -3 * s, -6 * s, -5 * s, -8 * s, -4.8 * s).quadraticCurveTo(-6 * s, -1.5 * s, -5.5 * s, 0).quadraticCurveTo(-6 * s, 1.5 * s, -8 * s, 4.8 * s).bezierCurveTo(-6 * s, 5 * s, -3 * s, 3 * s, 0, 1.4 * s).closePath().fill(0xf6f2e2).stroke(line);
    for (const dy of [-1.8, 0, 1.8]) tail.moveTo(0, dy * 0.35 * s).lineTo(-6 * s, dy * 1.1 * s).stroke({ color: stripe, width: 0.75 * s });
    tail.position.set(-9.5 * s, 0);
    const bodyColor = 0xfbf3da;
    body.moveTo(-1 * s, -2.6 * s).quadraticCurveTo(1 * s, -5.4 * s, 3.5 * s, -2.7 * s).fill(0xf6f2e2).stroke(line);
    body.ellipse(0, 0, 10 * s, 3 * s).fill(bodyColor);
    for (const dy of [-1.3, 0, 1.3]) body.roundRect(-9.5 * s, (dy - 0.38) * s, 16.5 * s, 0.76 * s, 0.38 * s).fill(stripe);
    bellyShade(body, 0, 0, 10 * s, 3 * s, 0x6f7fa8, 0.32);
    topHighlight(body, 0, 0, 10 * s, 3 * s, 0.6);
    body.ellipse(0, 0, 10 * s, 3 * s).stroke(line);
    drawEye(body, 6.8 * s, -0.6 * s, 2 * s, s);
    drawSmile(body, 8.6 * s, 1 * s, s * 0.8);
  } else {
    // 櫻花蝦：飽和紅色、分節的身體、長觸鬚、凸眼
    const red = 0xf0362b;
    for (let i = 0; i < 5; i++) body.moveTo((2.6 - i * 1.4) * s, 1.9 * s).lineTo((1.9 - i * 1.4) * s, 3.8 * s).stroke({ color: INK, width: 0.6 * s, cap: 'round' });
    body.moveTo(4.5 * s, -1 * s).bezierCurveTo(7 * s, -4 * s, 10 * s, -6 * s, 13 * s, -4.5 * s).moveTo(4.5 * s, -0.4 * s).bezierCurveTo(7 * s, -2 * s, 10 * s, -2.8 * s, 12.5 * s, -1.5 * s).stroke({ color: INK, width: 0.5 * s, cap: 'round' });
    // 尾扇
    body.poly([-6.4 * s, 0.4 * s, -9 * s, -1.4 * s, -9.4 * s, 1.2 * s, -8.6 * s, 2.6 * s]).fill(shade(red, -0.15)).stroke({ ...line, width: 0.8 * s });
    body.ellipse(-4.6 * s, 0.6 * s, 2.4 * s, 1.6 * s).fill(shade(red, -0.1)).stroke(line);
    body.ellipse(0, 0, 5.4 * s, 2.5 * s).fill(red);
    bellyShade(body, 0, 0, 5.4 * s, 2.5 * s, shade(red, -0.25), 0.4);
    for (const x of [-2.2, -0.4, 1.4]) body.moveTo(x * s, -2.3 * s).quadraticCurveTo((x + 0.5) * s, 0, x * s, 2.3 * s).stroke({ color: INK, width: 0.4 * s, alpha: 0.45 });
    topHighlight(body, 0, 0, 5.4 * s, 2.5 * s, 0.65);
    body.ellipse(0, 0, 5.4 * s, 2.5 * s).stroke(line);
    body.circle(4.6 * s, -1.5 * s, 1.1 * s).fill(INK);
    body.circle(4.3 * s, -1.9 * s, 0.38 * s).fill(0xffffff);
  }
  ring.circle(0, 0, 15 * s).stroke({ color: 0xffffff, width: 2.5, alpha: 0.95 });
  ring.circle(0, 0, 15 * s + 2).stroke({ color: INK, width: 1, alpha: 0.5 });
  ring.visible = false;
  root.addChild(tail, body, spots, ring);
  return { root, body, tail, spots, ring };
}

/** 白點病的白點（固定位置的小白點，帶一圈淡淡的輪廓才看得清楚）。 */
export function drawIchSpots(g: Graphics, scale: number, count: number): void {
  g.clear();
  for (let i = 0; i < count; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const r = ((i * 37) % 10) / 10;
    g.circle(Math.cos(a) * 6 * r * scale, Math.sin(a) * 2.5 * r * scale, 0.75 * scale).fill(0xffffff).stroke({ color: INK, width: 0.25 * scale, alpha: 0.5 });
  }
}

/** 一片尖頭葉子（從葉基往 angle 方向長）。darkHalf 為 true 時下半片畫成陰影色。 */
function drawLeaf(g: Graphics, x: number, y: number, len: number, width: number, angle: number, color: number, scale: number, darkHalf = true): void {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const pt = (u: number, v: number): [number, number] => [x + u * ca - v * sa, y + u * sa + v * ca];
  const side = (sign: number) => {
    const pts: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = (i / 8) * len;
      const v = sign * width * Math.sin((Math.PI * i) / 8) * (1 - 0.15 * (i / 8));
      pts.push(...pt(u, v));
    }
    return pts;
  };
  const upper = side(1);
  const lower = side(-1);
  const lowerRev: number[] = [];
  for (let i = lower.length - 2; i >= 0; i -= 2) lowerRev.push(lower[i], lower[i + 1]);
  g.poly([...upper, ...lowerRev]).fill(color);
  if (darkHalf) g.poly([...lower, ...pt(len, 0), ...pt(0, 0)]).fill(shade(color, -0.22));
  g.poly([...upper, ...lowerRev]).stroke({ color: INK, width: 0.85 * scale, join: 'round' });
  const [x0, y0] = pt(0, 0);
  const [x1, y1] = pt(len * 0.9, 0);
  g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: shade(color, 0.35), width: 0.5 * scale });
}

/**
 * 依生物量畫水草。榕：寬葉長在石頭上；紅蝴蝶：一叢有莖草，頂端偏紅。
 * 溶葉中的草偏黃褐色，葉面有藻時顏色變暗、帶斑點。
 */
export function drawPlant(g: Graphics, plant: Plant, scale: number, baseY: number): void {
  g.clear();
  const sp = PLANT_SPECIES[plant.species];
  const size = Math.min(2.2, plant.biomassG / sp.maxBiomassG + 0.25);
  const melting = plant.growthRate < -0.0002;
  const algae = plant.leafAlgae;

  if (sp.lightType === 'low') {
    // 榕：綁在石頭上的寬葉，深綠、半邊陰影、淡色葉脈
    let leaf = melting ? 0xc2b44a : 0x2fae4e;
    leaf = mix(leaf, 0x4a5a32, algae * 0.75);
    const leaves = Math.max(2, Math.round(3 + size * 4));
    const stemY = baseY - 10 * scale;
    for (let i = 0; i < leaves; i++) {
      const a = -Math.PI / 2 + (i / (leaves - 1) - 0.5) * 2.3;
      const reach = (10 + size * 7) * scale;
      const bx = Math.cos(a) * reach * 0.55;
      const by = stemY + Math.sin(a) * reach * 0.55;
      g.moveTo(0, stemY).quadraticCurveTo(bx * 0.4, by - 4 * scale, bx, by).stroke({ color: INK, width: 2.2 * scale, cap: 'round' }).stroke({ color: 0x3f8a3e, width: 1 * scale, cap: 'round' });
      drawLeaf(g, bx, by, (11 + size * 4) * scale, 4.2 * scale, a, leaf, scale);
      if (algae > 0.2) {
        g.circle(bx + Math.cos(a) * 6 * scale, by + Math.sin(a) * 6 * scale, 1.3 * scale).fill({ color: 0x1a2a14, alpha: algae });
        g.circle(bx + Math.cos(a) * 9 * scale + 1.5 * scale, by + Math.sin(a) * 9 * scale, 0.9 * scale).fill({ color: 0x1a2a14, alpha: algae });
      }
    }
    // 石頭：灰色、下緣陰影、上緣亮面
    g.ellipse(0, baseY - 6 * scale, 20 * scale, 9 * scale).fill(0xa3abb3);
    bellyShade(g, 0, baseY - 6 * scale, 20 * scale, 9 * scale, 0x7d858e, 0.42);
    g.ellipse(-6 * scale, baseY - 10.5 * scale, 7 * scale, 2.4 * scale).fill({ color: 0xffffff, alpha: 0.35 });
    g.ellipse(0, baseY - 6 * scale, 20 * scale, 9 * scale).stroke({ color: INK, width: 1.6 * scale });
  } else {
    // 紅蝴蝶：有莖草，越靠頂端越紅（強光下的典型顏色）
    const stems = Math.max(1, Math.round(1 + size * 3));
    const height = (30 + size * 70) * scale;
    for (let i = 0; i < stems; i++) {
      const x0 = (i - (stems - 1) / 2) * 5.5 * scale;
      const h = height * (0.75 + ((i * 53) % 25) / 100);
      const lean = Math.sin(i * 1.7) * 4 * scale;
      g.moveTo(x0, baseY).quadraticCurveTo(x0 + lean * 0.2, baseY - h * 0.5, x0 + lean, baseY - h).stroke({ color: INK, width: 2.6 * scale, cap: 'round' }).stroke({ color: melting ? 0xc2b44a : 0x4cb63c, width: 1.2 * scale, cap: 'round' });
      const pairs = Math.max(2, Math.floor(h / (6.5 * scale)));
      for (let k = 1; k <= pairs; k++) {
        const t = k / pairs;
        const y = baseY - h * t;
        const x = x0 + lean * t * t;
        let c = mix(0x5ccf3e, 0xff5a3c, Math.max(0, t - 0.45) * 1.7);
        if (melting) c = mix(c, 0xc2b44a, 0.7);
        if (algae > 0.2) c = mix(c, 0x4a5a32, algae * 0.6);
        const len = (6.5 - t * 2) * scale;
        drawLeaf(g, x, y, len, 2.2 * scale, -0.3, c, scale * 0.75);
        drawLeaf(g, x, y, len, 2.2 * scale, Math.PI + 0.3, c, scale * 0.75);
      }
    }
  }
}

/** 背景裝飾水草（不是模擬中的水草，點不到）：深一點的綠色長葉，像參考圖兩側的草。 */
export function drawBackdropGrass(g: Graphics, x: number, baseY: number, height: number, scale: number, color: number): void {
  const w = 5 * scale;
  g.moveTo(x - w, baseY)
    .bezierCurveTo(x - w * 2.4, baseY - height * 0.35, x + w * 1.4, baseY - height * 0.55, x - w * 0.2, baseY - height)
    .bezierCurveTo(x + w * 2.6, baseY - height * 0.6, x + w * 0.4, baseY - height * 0.3, x + w, baseY)
    .closePath()
    .fill(color)
    .stroke({ color: INK, width: 1.6 * scale, join: 'round', alpha: 0.85 });
  g.moveTo(x, baseY - 2 * scale).bezierCurveTo(x - w * 0.6, baseY - height * 0.4, x + w * 0.6, baseY - height * 0.6, x - w * 0.1, baseY - height * 0.9).stroke({ color: shade(color, 0.25), width: 0.8 * scale });
}

export { bellyShade };
