import { Container, MeshPlane, Sprite, type Texture } from 'pixi.js';
import type { FishSpeciesId } from '../sim';
import { canvasTexture, makeCanvas, mix, seeded, type Ctx } from './paint';
import { guppyLook, GUPPY_LOOKS, type BodyPattern, type GuppyLook, type TailPattern } from './strains';

export { guppyLook, GUPPY_LOOKS };

/**
 * 魚的分層渲染（design/art-style.md §0.3：精繪分層＋程式上色）。
 *
 * 每個魚種只有一套「灰階」圖層：身體、尾鰭、背鰭、腹鰭、胸鰭，保留明暗、鰭條與光澤；
 * 顏色由基因（現在是品系）用 tint 疊上去，花紋是另外的白色遮罩，也用 tint 上色。
 * 尾鰭是 MeshPlane，每一幀依擺動相位變形網格，比整張圖旋轉自然。
 *
 * 現在的灰階圖是用 Canvas 程式繪製的替代圖（形狀沿用示意圖的路徑，魚頭朝左）；
 * 精繪素材到位後，換掉 paint* 函式回傳的貼圖即可，FishRig 不用改。
 */

/** 一張圖層貼圖，以及它左上角在「藝術座標」的位置。 */
interface Layer {
  tex: Texture;
  x: number;
  y: number;
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpeciesArt {
  /** 藝術座標 → 貼圖像素的倍率。 */
  R: number;
  /** 魚的中心與全長（藝術座標）。 */
  center: { x: number; y: number };
  length: number;
  body: Layer;
  /** 身體的高光（白色，不上色）。 */
  sheen: Layer;
  /** 懷孕母魚的孕斑（深色，不上色）。 */
  gravid: Layer | null;
  bodyPatterns: Partial<Record<BodyPattern | 'stripes', Layer>>;
  tail: {
    frame: Frame;
    pivot: { x: number; y: number };
    base: Texture;
    /** 尾鰭外緣的漸層色遮罩。 */
    outer: Texture;
    patterns: Partial<Record<TailPattern | 'stripes', Texture>>;
    /** 鰭緣的金邊（稀有基因）。 */
    rim: Texture;
  } | null;
  /** 背鰭、腹鰭（尾鰭前面、身體後面）與胸鰭（身體前面）。 */
  backFins: Layer[];
  frontFins: Layer[];
  eye: { iris: Layer; pupil: Layer; glint: Layer } | null;
  /** 身體的大概範圍（藝術座標，相對中心）：白點病的白點畫在這裡面。 */
  bodyEllipse: { x: number; y: number; rx: number; ry: number };
}

// ---- 繪製工具 --------------------------------------------------------------

function paint(frame: Frame, R: number, draw: (ctx: Ctx) => void, slim?: { cy: number; k: number }): Layer {
  const { canvas, ctx } = makeCanvas(frame.w * R, frame.h * R);
  ctx.scale(R, R);
  ctx.translate(-frame.x, -frame.y);
  // 身體壓扁一點（示意圖的卡通身形太圓，寫實的孔雀魚比較修長）
  if (slim) {
    ctx.translate(0, slim.cy);
    ctx.scale(1, slim.k);
    ctx.translate(0, -slim.cy);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return { tex: canvasTexture(canvas), x: frame.x, y: frame.y };
}

function withClip(ctx: Ctx, path: Path2D, draw: () => void): void {
  ctx.save();
  ctx.clip(path);
  draw();
  ctx.restore();
}

/** 灰階的身體：背部較暗、側面最亮、腹部下緣再暗一點，加上細細的鱗片紋與鰓蓋。 */
function paintBody(ctx: Ctx, body: Path2D, top: number, bottom: number, opts: { scales?: boolean; gill?: [number, number, number] } = {}): void {
  withClip(ctx, body, () => {
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, '#8e8e8e');
    g.addColorStop(0.32, '#ffffff');
    g.addColorStop(0.68, '#ececec');
    g.addColorStop(1, '#a4a4a4');
    ctx.fillStyle = g;
    ctx.fillRect(-50, top - 20, 400, bottom - top + 40);
    if (opts.scales) {
      ctx.strokeStyle = 'rgba(70,70,70,0.13)';
      ctx.lineWidth = 1;
      for (let row = 0, y = top + 6; y < bottom; row++, y += 7) {
        for (let x = 70 + (row % 2) * 5; x < 180; x += 10) {
          ctx.beginPath();
          ctx.arc(x, y, 5, Math.PI * 0.6, Math.PI * 1.4);
          ctx.stroke();
        }
      }
    }
    if (opts.gill) {
      const [gx, gy, gr] = opts.gill;
      ctx.strokeStyle = 'rgba(60,60,60,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, -Math.PI * 0.35, Math.PI * 0.35);
      ctx.stroke();
    }
  });
  // 柔和的邊緣：不用粗黑描邊，只用淡淡的深灰線定出輪廓
  ctx.strokeStyle = 'rgba(30,30,30,0.35)';
  ctx.lineWidth = 1.6;
  ctx.stroke(body);
}

function paintSheen(ctx: Ctx, body: Path2D, cx: number, cy: number, r: number): void {
  withClip(ctx, body, () => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  });
}

/** 灰階的鰭：從鰭基放射的鰭條、越往外越透明，外緣一條亮邊。 */
function paintFin(ctx: Ctx, fin: Path2D, base: [number, number], reach: number, spread: [number, number], opts: { rays?: number; dark?: number } = {}): void {
  const [bx, by] = base;
  withClip(ctx, fin, () => {
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, reach);
    g.addColorStop(0, opts.dark !== undefined ? `rgb(${opts.dark},${opts.dark},${opts.dark})` : '#8a8a8a');
    g.addColorStop(0.3, '#d6d6d6');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    ctx.fillRect(bx - reach * 1.5, by - reach * 1.5, reach * 3, reach * 3);
    const rays = opts.rays ?? 36;
    for (let i = 0; i <= rays; i++) {
      const a = spread[0] + ((spread[1] - spread[0]) * i) / rays;
      ctx.strokeStyle = i % 2 ? 'rgba(60,60,60,0.22)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = i % 2 ? 1.1 : 0.8;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + Math.cos(a) * reach * 0.5, by + Math.sin(a) * reach * 0.45, bx + Math.cos(a) * reach * 1.2, by + Math.sin(a) * reach * 1.2);
      ctx.stroke();
    }
    // 外緣半透明（鰭膜很薄）
    ctx.globalCompositeOperation = 'destination-out';
    const fade = ctx.createRadialGradient(bx, by, reach * 0.7, bx, by, reach * 1.05);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = fade;
    ctx.fillRect(bx - reach * 1.5, by - reach * 1.5, reach * 3, reach * 3);
    ctx.globalCompositeOperation = 'source-over';
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.3;
  ctx.stroke(fin);
}

/** 外緣漸層遮罩：鰭基透明 → 外緣不透明，上色後就是「尾色 → 外緣色」的漸層。 */
function paintOuterMask(ctx: Ctx, fin: Path2D, base: [number, number], from: number, to: number): void {
  const [bx, by] = base;
  withClip(ctx, fin, () => {
    const g = ctx.createRadialGradient(bx, by, from, bx, by, to);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(bx - to * 1.5, by - to * 1.5, to * 3, to * 3);
  });
}

function paintDots(ctx: Ctx, clip: Path2D, region: Frame, count: number, seed: number, r: [number, number]): void {
  const rand = seeded(seed);
  withClip(ctx, clip, () => {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 1.5;
    for (let i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(region.x + rand() * region.w, region.y + rand() * region.h, r[0] + rand() * (r[1] - r[0]), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function paintLace(ctx: Ctx, clip: Path2D, region: Frame): void {
  withClip(ctx, clip, () => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    for (let row = 0, y = region.y; y <= region.y + region.h; row++, y += 11) {
      for (let x = region.x + (row % 2 ? 8 : 0); x <= region.x + region.w; x += 16) {
        ctx.beginPath();
        ctx.ellipse(x, y, 5, 3.4, 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });
}

function paintRim(ctx: Ctx, fin: Path2D): void {
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 5;
  ctx.lineWidth = 2.6;
  ctx.stroke(fin);
}

/** 眼睛三層：虹膜（上色）、瞳孔（上色：黑或白子的紅）、反光（不上色）。不再是卡通大眼。 */
function paintEye(R: number, cx: number, cy: number, r: number): SpeciesArt['eye'] {
  const f = { x: cx - r - 2, y: cy - r - 2, w: r * 2 + 4, h: r * 2 + 4 };
  const iris = paint(f, R, (ctx) => {
    const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, r * 0.2, cx, cy, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.7, '#cfcfcf');
    g.addColorStop(1, '#6a6a6a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,30,0.6)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });
  const pupil = paint(f, R, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - r * 0.08, cy + r * 0.05, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  });
  const glint = paint(f, R, (ctx) => {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.25, cy + r * 0.3, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
  return { iris, pupil, glint };
}

// ---- 孔雀魚 ---------------------------------------------------------------

const G_TAIL = 'M160,76 C186,44 226,24 262,28 C276,52 270,70 280,84 C270,98 276,118 262,140 C226,142 186,122 160,90Z';
const G_DORSAL = 'M84,44 C92,14 130,10 150,26 C140,40 124,48 112,50Z';
const G_VENTRAL = 'M112,120 C118,138 136,142 146,136 C138,128 128,120 120,116Z';
const G_BODY = 'M30,82 C30,52 58,38 92,40 C128,42 150,60 166,72 L166,92 C150,104 128,122 92,124 C58,126 30,112 30,82Z';
const G_TUXEDO = 'M104,20 C112,60 112,100 104,140 L180,140 L180,20Z';
const G_PECTORAL = 'M96,84 C110,80 122,88 124,100 C110,102 100,96 96,84Z';

const SLIM = { cy: 84, k: 0.8 };

function guppyArt(): SpeciesArt {
  const R = 1.3;
  const body = new Path2D(G_BODY);
  const tail = new Path2D(G_TAIL);
  const bodyFrame = { x: 24, y: 34, w: 148, h: 96 };
  const tailFrame = { x: 152, y: 18, w: 134, h: 130 };
  const pivot: [number, number] = [163, 83];
  return {
    R,
    center: { x: 155, y: 82 },
    length: 250,
    body: paint(bodyFrame, R, (ctx) => {
      paintBody(ctx, body, 40, 124, { scales: true, gill: [70, 82, 20] });
      // 嘴
      ctx.strokeStyle = 'rgba(40,40,40,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(32, 90);
      ctx.quadraticCurveTo(38, 94, 44, 92);
      ctx.stroke();
    }, SLIM),
    sheen: paint(bodyFrame, R, (ctx) => paintSheen(ctx, body, 90, 58, 50), SLIM),
    gravid: paint(bodyFrame, R, (ctx) =>
      withClip(ctx, body, () => {
        const g = ctx.createRadialGradient(118, 100, 0, 118, 100, 16);
        g.addColorStop(0, 'rgba(25,25,25,0.75)');
        g.addColorStop(1, 'rgba(25,25,25,0)');
        ctx.fillStyle = g;
        ctx.fillRect(100, 84, 36, 32);
      }),
      SLIM,
    ),
    bodyPatterns: {
      tuxedo: paint(bodyFrame, R, (ctx) =>
        withClip(ctx, body, () => {
          const g = ctx.createLinearGradient(98, 0, 120, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(1, 'rgba(255,255,255,1)');
          ctx.fillStyle = g;
          ctx.fill(new Path2D(G_TUXEDO));
        }),
        SLIM,
      ),
      lace: paint(bodyFrame, R, (ctx) => paintLace(ctx, body, { x: 70, y: 42, w: 100, h: 84 }), SLIM),
    },
    tail: {
      frame: tailFrame,
      pivot: { x: pivot[0], y: pivot[1] },
      base: paint(tailFrame, R, (ctx) => paintFin(ctx, tail, pivot, 122, [-0.95, 0.95], { rays: 44 })).tex,
      outer: paint(tailFrame, R, (ctx) => paintOuterMask(ctx, tail, pivot, 45, 112)).tex,
      patterns: {
        dots: paint(tailFrame, R, (ctx) => paintDots(ctx, tail, { x: 180, y: 22, w: 100, h: 124 }, 70, 7, [1.8, 3.4])).tex,
        lace: paint(tailFrame, R, (ctx) => paintLace(ctx, tail, { x: 170, y: 24, w: 115, h: 120 })).tex,
      },
      rim: paint(tailFrame, R, (ctx) => paintRim(ctx, tail)).tex,
    },
    backFins: [
      paint({ x: 80, y: 14, w: 74, h: 46 }, R, (ctx) => {
        ctx.translate(0, 6);
        paintFin(ctx, new Path2D(G_DORSAL), [112, 50], 48, [-2.6, -0.4], { rays: 18 });
      }),
      paint({ x: 108, y: 104, w: 42, h: 32 }, R, (ctx) => {
        ctx.translate(0, -8);
        paintFin(ctx, new Path2D(G_VENTRAL), [114, 118], 34, [0.2, 1.2], { rays: 10 });
      }),
    ],
    frontFins: [paint({ x: 92, y: 78, w: 36, h: 26 }, R, (ctx) => paintFin(ctx, new Path2D(G_PECTORAL), [98, 86], 28, [-0.1, 0.8], { rays: 9 }))],
    eye: paintEye(R, 54, 77, 11),
    bodyEllipse: { x: -57, y: 0, rx: 55, ry: 24 },
  };
}

// ---- 斑馬魚 ---------------------------------------------------------------

const Z_BODY = 'M28,82 C30,62 62,56 100,58 C138,60 162,70 176,77 L176,87 C162,94 138,104 100,106 C62,108 30,102 28,82Z';
const Z_TAIL = 'M168,78 C192,70 214,54 244,42 C238,62 230,74 226,82 C230,90 238,102 244,122 C214,110 192,94 168,86Z';
const Z_DORSAL = 'M104,60 C110,44 130,42 140,52 C130,60 118,62 110,62Z';
const Z_ANAL = 'M116,104 C122,118 140,120 150,112 C140,106 128,102 120,102Z';

function zebraArt(): SpeciesArt {
  const R = 1.4;
  const body = new Path2D(Z_BODY);
  const tail = new Path2D(Z_TAIL);
  const bodyFrame = { x: 22, y: 52, w: 160, h: 60 };
  const tailFrame = { x: 160, y: 36, w: 90, h: 92 };
  const stripes = (ctx: Ctx, clip: Path2D, x0: number, x1: number, tailLines: boolean) =>
    withClip(ctx, clip, () => {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 1.5;
      if (tailLines) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(164, 79);
        ctx.lineTo(244, 46);
        ctx.moveTo(164, 85);
        ctx.lineTo(244, 118);
        ctx.stroke();
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(164, 82);
        ctx.lineTo(236, 82);
        ctx.stroke();
      } else {
        // 斑馬魚的縱紋：中間一條粗、上下各一條細，頭部沒有
        for (const [y, h] of [[65, 4], [77, 9], [95, 4]]) {
          ctx.beginPath();
          ctx.roundRect(x0, y, x1 - x0, h, h / 2);
          ctx.fill();
        }
      }
    });
  return {
    R,
    center: { x: 136, y: 82 },
    length: 216,
    body: paint(bodyFrame, R, (ctx) => paintBody(ctx, body, 58, 106, { gill: [66, 82, 14] })),
    sheen: paint(bodyFrame, R, (ctx) => paintSheen(ctx, body, 92, 68, 46)),
    gravid: null,
    bodyPatterns: { stripes: paint(bodyFrame, R, (ctx) => stripes(ctx, body, 70, 190, false)) },
    tail: {
      frame: tailFrame,
      pivot: { x: 170, y: 82 },
      base: paint(tailFrame, R, (ctx) => paintFin(ctx, tail, [170, 82], 82, [-0.75, 0.75], { rays: 28, dark: 190 })).tex,
      outer: paint(tailFrame, R, (ctx) => paintOuterMask(ctx, tail, [170, 82], 30, 80)).tex,
      patterns: { stripes: paint(tailFrame, R, (ctx) => stripes(ctx, tail, 0, 0, true)).tex },
      rim: paint(tailFrame, R, (ctx) => paintRim(ctx, tail)).tex,
    },
    backFins: [
      paint({ x: 100, y: 40, w: 44, h: 26 }, R, (ctx) => paintFin(ctx, new Path2D(Z_DORSAL), [112, 62], 32, [-2.4, -0.6], { rays: 10, dark: 200 })),
      paint({ x: 112, y: 98, w: 42, h: 26 }, R, (ctx) => paintFin(ctx, new Path2D(Z_ANAL), [120, 102], 32, [0.3, 1.1], { rays: 10, dark: 200 })),
    ],
    frontFins: [],
    eye: paintEye(R, 52, 78, 10),
    bodyEllipse: { x: -36, y: 0, rx: 60, ry: 18 },
  };
}

// ---- 櫻花蝦 ---------------------------------------------------------------

function shrimpArt(): SpeciesArt {
  const R = 4;
  const frame = { x: -50, y: -32, w: 110, h: 54 };
  // 半透明的分節蝦殼：每一節有自己的明暗，背上一條淡色背線
  const shell = new Path2D('M-8,-6 C-6,-14 6,-14 20,-11 C32,-9 40,-8 46,-4 L54,-8 L53,7 L44,3 C36,7 24,10 12,9 C0,8 -9,4 -8,-6Z');
  const body = paint(frame, R, (ctx) => {
    ctx.strokeStyle = 'rgba(70,70,70,0.75)';
    ctx.lineWidth = 0.9;
    // 觸鬚與腳
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.quadraticCurveTo(-30, -26, -46, -18);
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(-26, -12, -42, -3);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const x of [4, 10, 16, 22, 28]) {
      ctx.moveTo(x, 7);
      ctx.lineTo(x - 2, 15);
    }
    ctx.stroke();
    withClip(ctx, shell, () => {
      const g = ctx.createLinearGradient(0, -14, 0, 10);
      g.addColorStop(0, '#9a9a9a');
      g.addColorStop(0.4, '#ffffff');
      g.addColorStop(1, '#b8b8b8');
      ctx.fillStyle = g;
      ctx.fillRect(-12, -16, 70, 28);
      ctx.strokeStyle = 'rgba(60,60,60,0.3)';
      ctx.lineWidth = 1;
      for (const x of [8, 17, 26, 35]) {
        ctx.beginPath();
        ctx.moveTo(x, -13);
        ctx.quadraticCurveTo(x + 3, -2, x, 9);
        ctx.stroke();
      }
    });
    ctx.strokeStyle = 'rgba(30,30,30,0.35)';
    ctx.lineWidth = 0.9;
    ctx.stroke(shell);
  });
  const sheen = paint(frame, R, (ctx) =>
    withClip(ctx, shell, () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-2, -10);
      ctx.quadraticCurveTo(18, -12.5, 42, -6);
      ctx.stroke();
    }),
  );
  return {
    R,
    center: { x: 5, y: 0 },
    length: 62,
    body,
    sheen,
    gravid: null,
    bodyPatterns: {},
    tail: null,
    backFins: [],
    frontFins: [],
    eye: paintEye(R, -5, -6, 3),
    bodyEllipse: { x: 13, y: -2, rx: 22, ry: 6 },
  };
}

const ART_CACHE = new Map<FishSpeciesId, SpeciesArt>();

/** 每個魚種的灰階圖層（第一次用到時產生，之後共用）。 */
export function speciesArt(species: FishSpeciesId): SpeciesArt {
  let art = ART_CACHE.get(species);
  if (!art) {
    art = species === 'guppy' ? guppyArt() : species === 'cherry_shrimp' ? shrimpArt() : zebraArt();
    ART_CACHE.set(species, art);
  }
  return art;
}

// ---- 外觀（基因 → 顏色與花紋）----------------------------------------------

export type FishForm = 'male' | 'female' | 'juvenile';

export interface Appearance {
  body: number;
  fin: number;
  tail: number;
  tailOuter: number;
  pattern: number;
  bodyPattern: BodyPattern | 'stripes' | 'none';
  tailPattern: TailPattern | 'stripes' | 'none';
  iris: number;
  pupil: number;
  rim: number | null;
  /** 尾鰭大小（母魚、仔魚的尾巴小）。 */
  tailScale: number;
  gravid: boolean;
  /** 整體透明度（仔魚半透明）。 */
  alpha: number;
}

/** 由魚種、性別階段與品系決定外觀。Phase 1 會改成讀基因。 */
export function appearance(species: FishSpeciesId, form: FishForm, variant: number, pregnant = false): Appearance {
  if (species === 'guppy') {
    const look: GuppyLook = guppyLook(variant);
    const albino = look.eye !== 0x111111;
    if (form === 'male') {
      return {
        body: look.body,
        fin: look.fin,
        tail: look.tail,
        tailOuter: look.tailOuter,
        pattern: look.patternColor,
        bodyPattern: look.bodyPattern,
        tailPattern: look.tailPattern,
        iris: albino ? 0xffc2c2 : 0xd9c58a,
        pupil: look.eye,
        rim: look.rim ?? null,
        tailScale: 1,
        gravid: false,
        alpha: 1,
      };
    }
    // 母魚與仔魚：橄欖灰，只帶一點品系的顏色；尾巴小而透明
    const juvenile = form === 'juvenile';
    const base = juvenile ? 0xd3dde0 : albino ? 0xf0d2c8 : 0xc6c6ae;
    return {
      body: base,
      fin: mix(base, look.fin, 0.15),
      tail: mix(0xd8dedb, look.tail, juvenile ? 0.06 : 0.22),
      tailOuter: mix(0xeef2f0, look.tailOuter, juvenile ? 0.05 : 0.18),
      pattern: 0,
      bodyPattern: 'none',
      tailPattern: 'none',
      iris: albino ? 0xffc2c2 : 0xd9c58a,
      pupil: look.eye,
      rim: null,
      tailScale: 0.6,
      gravid: form === 'female' && pregnant,
      alpha: juvenile ? 0.82 : 1,
    };
  }
  if (species === 'zebrafish' || species === 'apisto') {
    const juvenile = form === 'juvenile';
    return {
      body: juvenile ? 0xe9e6d6 : 0xf1e3b8,
      fin: 0xf3ecd8,
      tail: 0xf3ecd8,
      tailOuter: 0xffffff,
      pattern: juvenile ? 0x9aa6d6 : 0x3549c0,
      bodyPattern: 'stripes',
      tailPattern: juvenile ? 'none' : 'stripes',
      iris: 0xd9c58a,
      pupil: 0x111111,
      rim: null,
      tailScale: form === 'female' ? 0.95 : 1,
      gravid: false,
      alpha: juvenile ? 0.82 : 1,
    };
  }
  // 櫻花蝦：母蝦紅得深，公蝦偏淡，仔蝦幾乎透明
  return {
    body: form === 'female' ? 0xe8281c : form === 'male' ? 0xff7a66 : 0xffc2b8,
    fin: 0,
    tail: 0,
    tailOuter: 0,
    pattern: 0,
    bodyPattern: 'none',
    tailPattern: 'none',
    iris: 0x333333,
    pupil: 0x111111,
    rim: null,
    tailScale: 1,
    gravid: false,
    alpha: form === 'juvenile' ? 0.75 : 0.95,
  };
}

// ---- 組裝：一條魚的所有圖層 --------------------------------------------------

const MESH_X = 10;
const MESH_Y = 5;

/**
 * 一條魚的圖層組合（原點在魚中心，單位是貼圖像素；魚頭朝左）。
 * 外面的 Container 負責位置、大小、左右翻轉。
 */
export class FishRig extends Container {
  readonly art: SpeciesArt;
  /** 程式繪製版的蝦卵由 TankView 另外畫。 */
  readonly drawsEggs = false;
  private tailMeshes: MeshPlane[] = [];
  private tailRest: Float32Array | null = null;
  private tailHolder = new Container();
  private bodySprites: Sprite[] = [];
  /** 魚的全長（貼圖像素）。 */
  readonly lengthPx: number;

  constructor(species: FishSpeciesId, readonly look: Appearance) {
    super();
    const art = speciesArt(species);
    this.art = art;
    this.lengthPx = art.length * art.R;
    const place = (layer: Layer, tint: number, alpha = 1, blend?: 'add'): Sprite => {
      const s = new Sprite(layer.tex);
      s.position.set((layer.x - art.center.x) * art.R, (layer.y - art.center.y) * art.R);
      s.tint = tint;
      s.alpha = alpha;
      if (blend) s.blendMode = blend;
      this.addChild(s);
      return s;
    };

    // 尾鰭（網格變形）：底色 → 外緣漸層 → 花紋 → 金邊
    if (art.tail) {
      const t = art.tail;
      const layers: Array<[Texture, number, number, 'add' | undefined]> = [
        [t.base, look.tail, 0.92, undefined],
        [t.outer, look.tailOuter, 0.9, undefined],
      ];
      const tp = look.tailPattern !== 'none' ? t.patterns[look.tailPattern] : undefined;
      if (tp) layers.push([tp, look.pattern, 0.95, undefined]);
      if (look.rim !== null) layers.push([t.rim, look.rim, 0.9, 'add']);
      for (const [tex, tint, alpha, blend] of layers) {
        const mesh = new MeshPlane({ texture: tex, verticesX: MESH_X, verticesY: MESH_Y });
        mesh.tint = tint;
        mesh.alpha = alpha;
        if (blend) mesh.blendMode = blend;
        this.tailHolder.addChild(mesh);
        this.tailMeshes.push(mesh);
      }
      this.tailRest = new Float32Array(this.tailMeshes[0].geometry.getBuffer('aPosition').data);
      // 以尾柄為中心縮放（母魚、仔魚尾巴小）
      const px = (t.pivot.x - art.center.x) * art.R;
      const py = (t.pivot.y - art.center.y) * art.R;
      this.tailHolder.pivot.set((t.pivot.x - t.frame.x) * art.R, (t.pivot.y - t.frame.y) * art.R);
      this.tailHolder.position.set(px, py);
      this.tailHolder.scale.set(look.tailScale, look.tailScale * (look.tailScale < 1 ? 1.1 : 1));
      this.addChild(this.tailHolder);
    }
    for (const fin of art.backFins) this.bodySprites.push(place(fin, look.fin, 0.9));
    this.bodySprites.push(place(art.body, look.body));
    const bp = look.bodyPattern !== 'none' ? art.bodyPatterns[look.bodyPattern] : undefined;
    if (bp) place(bp, look.pattern, 0.92);
    if (look.gravid && art.gravid) place(art.gravid, 0xffffff);
    place(art.sheen, 0xffffff, 0.9);
    for (const fin of art.frontFins) place(fin, look.fin, 0.75);
    if (art.eye) {
      place(art.eye.iris, look.iris);
      place(art.eye.pupil, look.pupil);
      place(art.eye.glint, 0xffffff);
    }
    this.alpha = look.alpha;
  }

  /**
   * 尾鰭擺動：離尾柄越遠擺得越大，波從尾柄往外傳。
   * fold：夾鰭時鰭收起來（< 1）；damage：鰭被咬破時變短。
   */
  animate(phase: number, swing: number, fold = 1, damage = 0): void {
    const rest = this.tailRest;
    const t = this.art.tail;
    if (!rest || !t) return;
    const R = this.art.R;
    const px = (t.pivot.x - t.frame.x) * R;
    const py = (t.pivot.y - t.frame.y) * R;
    const span = t.frame.w * R - px;
    const height = t.frame.h * R;
    const shorten = 1 - 0.45 * damage;
    const first = this.tailMeshes[0].geometry.getBuffer('aPosition');
    const data = first.data as Float32Array;
    for (let i = 0; i < rest.length; i += 2) {
      const x = rest[i];
      const y = rest[i + 1];
      const d = Math.max(0, Math.min(1, (x - px) / span));
      const wave = Math.sin(phase - d * 2.4) * swing * Math.pow(d, 1.5) * height * 0.2;
      data[i] = px + (x - px) * shorten - Math.abs(wave) * 0.15;
      data[i + 1] = py + (y - py) * (fold + (1 - fold) * (1 - d) * 0.3) + wave;
    }
    first.update();
    for (let m = 1; m < this.tailMeshes.length; m++) {
      const buf = this.tailMeshes[m].geometry.getBuffer('aPosition');
      (buf.data as Float32Array).set(data);
      buf.update();
    }
  }

  /** 死掉或生病時整條魚變灰（不影響金邊等加法圖層的亮度）。 */
  /** 程式繪製版沒有輪廓光，選取時只靠身後的光暈。 */
  setRim(_color: number | null, _alpha = 1, _soft = true): void {}

  setDim(color: number | null): void {
    for (const s of this.bodySprites) s.tint = color ?? (s === this.bodySprites[this.bodySprites.length - 1] ? this.look.body : this.look.fin);
    for (const [i, m] of this.tailMeshes.entries()) if (i === 0) m.tint = color ?? this.look.tail;
  }
}
