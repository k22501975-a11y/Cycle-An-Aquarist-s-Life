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

/** 依魚種畫一隻面向右邊的魚（原點在身體中心）。 */
export function createFishSprite(species: FishSpeciesId, scale: number, variant: number, female = false): FishSprite {
  const root = new Container();
  const body = new Graphics();
  const tail = new Graphics();
  const spots = new Graphics();
  const ring = new Graphics();
  const s = scale;

  if (species === 'guppy' && female) {
    // 母孔雀魚：體型較大、灰色，尾巴短、顏色淡
    tail.poly([0, 0, -7 * s, -4 * s, -8 * s, 0, -7 * s, 4 * s]).fill({ color: 0xa9b2b6, alpha: 0.8 });
    tail.position.set(-8 * s, 0);
    body.ellipse(0, 0, 9 * s, 4.2 * s).fill(0xa8b4b8);
    body.ellipse(-3 * s, 1.5 * s, 1.6 * s, 1.2 * s).fill({ color: 0x444a4c, alpha: 0.6 });
    body.circle(6 * s, -0.8 * s, 1 * s).fill(0x111111);
  } else if (species === 'guppy') {
    const tailColors = [0xff6b3d, 0x3d8bff, 0xff3d8b, 0xffc23d];
    const tc = tailColors[variant % tailColors.length];
    tail.poly([0, 0, -12 * s, -8 * s, -16 * s, 0, -12 * s, 8 * s]).fill({ color: tc, alpha: 0.9 });
    tail.position.set(-6 * s, 0);
    body.ellipse(0, 0, 8 * s, 3.6 * s).fill(0xb9c4c9);
    body.ellipse(-2 * s, 0.5 * s, 4 * s, 2.2 * s).fill({ color: tc, alpha: 0.55 });
    body.poly([-2 * s, -3 * s, 2 * s, -5 * s, 3 * s, -3 * s]).fill({ color: tc, alpha: 0.8 });
    body.circle(5 * s, -0.8 * s, 0.9 * s).fill(0x111111);
  } else if (species === 'zebrafish') {
    tail.poly([0, 0, -7 * s, -4.5 * s, -6 * s, 0, -7 * s, 4.5 * s]).fill({ color: 0xc9d6e0, alpha: 0.85 });
    tail.position.set(-9 * s, 0);
    body.ellipse(0, 0, 10 * s, 2.6 * s).fill(0xe7edf2);
    for (const dy of [-1.2, 0, 1.2]) {
      body.rect(-9 * s, (dy - 0.3) * s, 17 * s, 0.6 * s).fill(0x2f5fa8);
    }
    body.circle(7 * s, -0.6 * s, 0.8 * s).fill(0x111111);
  } else {
    // 櫻花蝦：半透明紅色，有觸鬚與腳
    body.ellipse(0, 0, 5 * s, 2.2 * s).fill({ color: 0xd8312a, alpha: 0.9 });
    body.ellipse(-4.5 * s, 0.6 * s, 2.2 * s, 1.4 * s).fill({ color: 0xc02a22, alpha: 0.9 });
    body.moveTo(4.5 * s, -0.5 * s).lineTo(10 * s, -4 * s).moveTo(4.5 * s, 0).lineTo(10 * s, -2 * s).stroke({ color: 0xd8312a, width: 0.5 * s });
    for (let i = 0; i < 4; i++) body.moveTo((2 - i * 1.5) * s, 2 * s).lineTo((1.5 - i * 1.5) * s, 3.5 * s).stroke({ color: 0xd8312a, width: 0.5 * s });
    body.circle(4 * s, -1 * s, 0.6 * s).fill(0x111111);
  }
  ring.circle(0, 0, 14 * s).stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });
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

  if (sp.lightType === 'low') {
    g.ellipse(0, baseY - 6 * scale, 20 * scale, 9 * scale).fill(0x5c5a55);
    let leaf = melting ? 0x7a7a3a : 0x2f6b3a;
    leaf = mix(leaf, 0x2b3a25, algae * 0.8);
    const leaves = Math.max(2, Math.round(3 + size * 4));
    for (let i = 0; i < leaves; i++) {
      const a = -Math.PI / 2 + (i / (leaves - 1) - 0.5) * 2.2;
      const len = (14 + size * 10) * scale;
      const x = Math.cos(a) * len, y = baseY - 10 * scale + Math.sin(a) * len;
      g.moveTo(0, baseY - 10 * scale).lineTo(x * 0.6, (y + baseY) / 2 - 5 * scale).stroke({ color: 0x3d5a34, width: 1.2 * scale });
      g.ellipse(x * 0.8, y, 6 * scale, 3.4 * scale).fill(leaf);
      if (algae > 0.2) g.circle(x * 0.8 + 2 * scale, y, 1.2 * scale).fill({ color: 0x1a2a14, alpha: algae });
    }
  } else {
    const stems = Math.max(1, Math.round(1 + size * 3));
    const height = (30 + size * 70) * scale;
    for (let i = 0; i < stems; i++) {
      const x0 = (i - (stems - 1) / 2) * 5 * scale;
      const h = height * (0.75 + ((i * 53) % 25) / 100);
      g.moveTo(x0, baseY).lineTo(x0 + Math.sin(i) * 3 * scale, baseY - h).stroke({ color: melting ? 0x8a7a3a : 0x4f7a32, width: 1.3 * scale });
      const pairs = Math.max(2, Math.floor(h / (6 * scale)));
      for (let k = 1; k <= pairs; k++) {
        const t = k / pairs;
        const y = baseY - h * t;
        const x = x0 + Math.sin(i) * 3 * scale * t;
        let c = mix(0x5aa03c, 0xd0503a, Math.max(0, t - 0.5) * 1.6);
        if (melting) c = mix(c, 0x9a8a4a, 0.7);
        g.ellipse(x - 3 * scale, y, 3 * scale, 1.3 * scale).fill(c);
        g.ellipse(x + 3 * scale, y, 3 * scale, 1.3 * scale).fill(c);
      }
    }
  }
}
