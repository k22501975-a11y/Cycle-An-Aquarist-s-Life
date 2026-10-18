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

/** 卡通風格的輪廓顏色（近黑）。 */
export const INK = 0x1d1d1b;

/** 卡通大眼睛：白眼球＋黑瞳孔＋反光點。 */
function drawEye(g: Graphics, x: number, y: number, r: number, s: number): void {
  g.circle(x, y, r).fill(0xffffff).stroke({ color: INK, width: 0.9 * s });
  g.circle(x + r * 0.15, y + r * 0.05, r * 0.58).fill(INK);
  g.circle(x - r * 0.12, y - r * 0.25, r * 0.22).fill(0xffffff);
}

/** 依魚種畫一隻面向右邊的魚（原點在身體中心）。卡通風：粗黑輪廓、大眼睛、飽和色塊。 */
export function createFishSprite(species: FishSpeciesId, scale: number, variant: number, female = false): FishSprite {
  const root = new Container();
  const body = new Graphics();
  const tail = new Graphics();
  const spots = new Graphics();
  const ring = new Graphics();
  const s = scale;
  const line = { color: INK, width: 1.1 * s };

  if (species === 'guppy' && female) {
    // 母孔雀魚（與所有仔魚）：灰色、體型圓，短而淡的尾巴
    tail.moveTo(0, -1.5 * s).lineTo(-7 * s, -4.5 * s).quadraticCurveTo(-9 * s, 0, -7 * s, 4.5 * s).lineTo(0, 1.5 * s).closePath().fill(0xc7d0d3).stroke(line);
    tail.position.set(-7.5 * s, 0);
    body.poly([-1 * s, -3.6 * s, 2 * s, -5.6 * s, 3.5 * s, -3.4 * s]).fill(0xc7d0d3).stroke(line);
    body.ellipse(0, 0, 9 * s, 4.4 * s).fill(0xb3bfc3).stroke(line);
    body.ellipse(-1 * s, -1.8 * s, 5 * s, 1.2 * s).fill({ color: 0xffffff, alpha: 0.45 });
    body.ellipse(-3 * s, 1.6 * s, 1.6 * s, 1.1 * s).fill({ color: 0x4a5052, alpha: 0.7 });
    drawEye(body, 5 * s, -0.8 * s, 2.3 * s, s);
  } else if (species === 'guppy') {
    // 公孔雀魚：銀白身體、大片彩色扇形尾巴（參考 art-style-cartoon-guppies.png）
    const tailColors = [0xff5a3c, 0x3f86ff, 0xff3f8f, 0xffc531];
    const tc = tailColors[variant % tailColors.length];
    tail.moveTo(0, -2 * s).lineTo(-13 * s, -8.5 * s).quadraticCurveTo(-17 * s, 0, -13 * s, 8.5 * s).lineTo(0, 2 * s).closePath().fill(tc).stroke(line);
    for (const dy of [-4, 0, 4]) tail.moveTo(-2 * s, dy * 0.25 * s).lineTo(-12 * s, dy * s).stroke({ color: INK, width: 0.5 * s, alpha: 0.35 });
    tail.position.set(-6.5 * s, 0);
    body.poly([-2 * s, -3 * s, 1 * s, -6.5 * s, 4 * s, -3.2 * s]).fill(tc).stroke(line);
    body.ellipse(0, 0, 8 * s, 3.8 * s).fill(0xdfe6ea).stroke(line);
    body.ellipse(-1 * s, -1.6 * s, 4.5 * s, 1 * s).fill({ color: 0xffffff, alpha: 0.7 });
    body.ellipse(-3 * s, 0.6 * s, 2.6 * s, 1.8 * s).fill({ color: tc, alpha: 0.55 });
    drawEye(body, 4.4 * s, -0.7 * s, 2.2 * s, s);
  } else if (species === 'zebrafish') {
    // 斑馬魚：細長白身體，藍色縱紋延伸到叉形尾巴
    tail.moveTo(0, -1.2 * s).lineTo(-7 * s, -4.5 * s).lineTo(-5 * s, 0).lineTo(-7 * s, 4.5 * s).lineTo(0, 1.2 * s).closePath().fill(0xf3f6f8).stroke(line);
    for (const dy of [-1.6, 0, 1.6]) tail.moveTo(0, dy * 0.4 * s).lineTo(-5.5 * s, dy * s).stroke({ color: 0x2f5fd0, width: 0.7 * s });
    tail.position.set(-9.5 * s, 0);
    body.ellipse(0, 0, 10 * s, 2.9 * s).fill(0xfbf6e4);
    for (const dy of [-1.3, 0, 1.3]) body.rect(-9 * s, (dy - 0.35) * s, 16 * s, 0.7 * s).fill(0x2f5fd0);
    body.ellipse(0, 0, 10 * s, 2.9 * s).stroke(line);
    drawEye(body, 6.8 * s, -0.5 * s, 1.8 * s, s);
  } else {
    // 櫻花蝦：飽和紅色、分節的身體、長觸鬚
    for (let i = 0; i < 4; i++) body.moveTo((2 - i * 1.5) * s, 1.8 * s).lineTo((1.5 - i * 1.5) * s, 3.6 * s).stroke({ color: INK, width: 0.6 * s });
    body.moveTo(4.5 * s, -0.8 * s).quadraticCurveTo(8 * s, -5 * s, 11 * s, -4 * s).moveTo(4.5 * s, -0.2 * s).quadraticCurveTo(8 * s, -2.5 * s, 11 * s, -1.5 * s).stroke({ color: INK, width: 0.5 * s });
    body.ellipse(-4.6 * s, 0.6 * s, 2.3 * s, 1.5 * s).fill(0xd8261f).stroke(line);
    body.ellipse(0, 0, 5.2 * s, 2.4 * s).fill(0xf0362b).stroke(line);
    for (const x of [-2, 0, 2]) body.moveTo(x * s, -2.1 * s).lineTo(x * s, 2.1 * s).stroke({ color: INK, width: 0.4 * s, alpha: 0.4 });
    body.ellipse(-0.5 * s, -1.2 * s, 3 * s, 0.6 * s).fill({ color: 0xffffff, alpha: 0.5 });
    body.circle(4.2 * s, -1.1 * s, 0.9 * s).fill(INK);
    body.circle(4 * s, -1.4 * s, 0.3 * s).fill(0xffffff);
  }
  ring.circle(0, 0, 14 * s).stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
  ring.visible = false;
  root.addChild(tail, body, spots, ring);
  return { root, body, tail, spots, ring };
}

/** 白點病的白點（固定位置的小白點）。 */
export function drawIchSpots(g: Graphics, scale: number, count: number): void {
  g.clear();
  for (let i = 0; i < count; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const r = ((i * 37) % 10) / 10;
    g.circle(Math.cos(a) * 6 * r * scale, Math.sin(a) * 2.5 * r * scale, 0.7 * scale).fill(0xffffff);
  }
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
  const mix = (c1: number, c2: number, t: number) => {
    const r = ((c1 >> 16) & 255) * (1 - t) + ((c2 >> 16) & 255) * t;
    const gg = ((c1 >> 8) & 255) * (1 - t) + ((c2 >> 8) & 255) * t;
    const b = (c1 & 255) * (1 - t) + (c2 & 255) * t;
    return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
  };

  const outline = { color: INK, width: 0.9 * scale };
  if (sp.lightType === 'low') {
    // 榕：綁在石頭上的寬葉，深綠帶葉脈
    let leaf = melting ? 0xb5a842 : 0x2fa04a;
    leaf = mix(leaf, 0x3a4a2a, algae * 0.8);
    const leaves = Math.max(2, Math.round(3 + size * 4));
    for (let i = 0; i < leaves; i++) {
      const a = -Math.PI / 2 + (i / (leaves - 1) - 0.5) * 2.2;
      const len = (14 + size * 10) * scale;
      const x = Math.cos(a) * len, y = baseY - 10 * scale + Math.sin(a) * len;
      g.moveTo(0, baseY - 10 * scale).lineTo(x * 0.6, (y + baseY) / 2 - 5 * scale).stroke({ color: INK, width: 2 * scale }).stroke({ color: 0x2f7a3a, width: 1 * scale });
      g.ellipse(x * 0.8, y, 6 * scale, 3.4 * scale).fill(leaf).stroke(outline);
      g.moveTo(x * 0.8 - 4.5 * scale, y).lineTo(x * 0.8 + 4.5 * scale, y).stroke({ color: INK, width: 0.5 * scale, alpha: 0.4 });
      if (algae > 0.2) g.circle(x * 0.8 + 2 * scale, y, 1.2 * scale).fill({ color: 0x1a2a14, alpha: algae });
    }
    g.ellipse(0, baseY - 6 * scale, 20 * scale, 9 * scale).fill(0x9da3a8).stroke({ color: INK, width: 1.6 * scale });
    g.ellipse(-6 * scale, baseY - 10 * scale, 7 * scale, 2.5 * scale).fill({ color: 0xffffff, alpha: 0.3 });
  } else {
    const stems = Math.max(1, Math.round(1 + size * 3));
    const height = (30 + size * 70) * scale;
    for (let i = 0; i < stems; i++) {
      const x0 = (i - (stems - 1) / 2) * 5 * scale;
      const h = height * (0.75 + ((i * 53) % 25) / 100);
      g.moveTo(x0, baseY).lineTo(x0 + Math.sin(i) * 3 * scale, baseY - h).stroke({ color: INK, width: 2.4 * scale }).stroke({ color: melting ? 0xb5a842 : 0x46a83a, width: 1.2 * scale });
      const pairs = Math.max(2, Math.floor(h / (6 * scale)));
      for (let k = 1; k <= pairs; k++) {
        const t = k / pairs;
        const y = baseY - h * t;
        const x = x0 + Math.sin(i) * 3 * scale * t;
        // 紅蝴蝶：越靠頂端越紅（強光下的典型顏色）
        let c = mix(0x5cc23e, 0xff5a3c, Math.max(0, t - 0.5) * 1.6);
        if (melting) c = mix(c, 0xb5a842, 0.7);
        if (algae > 0.2) c = mix(c, 0x3a4a2a, algae * 0.6);
        g.ellipse(x - 3 * scale, y, 3.2 * scale, 1.5 * scale).fill(c).stroke({ color: INK, width: 0.6 * scale });
        g.ellipse(x + 3 * scale, y, 3.2 * scale, 1.5 * scale).fill(c).stroke({ color: INK, width: 0.6 * scale });
      }
    }
  }
}
