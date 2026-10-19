import { BlurFilter, FillGradient, Graphics, Rectangle, Sprite, type GradientOptions, type Renderer, type Texture } from 'pixi.js';
import { phenotype, type Fish } from '../sim';
import type { FishRig } from './fish-art';
import { FIN_COLORS, finShapes, type FinShape, type FinTraits } from './fin-overlay';
import { mix } from './paint';
import { FIN_PARTS, paintedTexture, type PaintedRig } from './painted';
import { patternBase, phenotypeRecipe, type ColorFamily } from './phenotype-art';

/**
 * 鰭型在魚圖上補畫：整條魚圖已經畫了的鰭（緞帶、燕尾、半月）不重畫，
 * 其他的照基因畫成半透明、有鰭條和亮邊的鰭，色系跟著花紋；母魚的鰭比較淡。
 */
export type FinLook = { traits: FinTraits; color: number; alpha: number; dumboArt: boolean; family: ColorFamily };

export function finTraitsOf(fish: Fish, painted: string | null): FinLook | null {
  const p = phenotype(fish.genome!);
  const male = fish.sex === 'male';
  const base = painted?.split('~')[0] ?? '';
  const inArt = (fin: string) => male && base !== patternBase(base) && base.endsWith(`-${fin}`);
  const traits: FinTraits = {
    // 母魚的燕尾、緞帶鰭只是稍長，不畫補線（之前畫成腹下兩條白線，像多長了鰭條）
    swallow: male && p.swallow && !inArt('swallow'),
    ribbon: male && p.ribbon && !inArt('ribbon'),
    // 大耳的胸鰭有單片圖就用圖，沒有才用程式畫
    dumbo: p.dumbo && !paintedTexture('fin-pectoral-dumbo'),
    bigC: male && p.bigC,
    sword: male ? p.sword : 0,
    halfmoon: male && p.tailShape === 'halfmoon' && !inArt('halfmoon') && !inArt('swallow') && !inArt('ribbon'),
    length: p.finLength,
  };
  const dumboArt = !!p.dumbo && !traits.dumbo;
  if (!traits.swallow && !traits.ribbon && !traits.dumbo && !traits.bigC && !traits.sword && !traits.halfmoon && !dumboArt) return null;
  // 鰭的色系跟著花紋；大耳胸鰭圖是藍色的，其他色系照花紋改色
  const family = phenotypeRecipe(p).to;
  return male ? { traits, color: FIN_COLORS[family], alpha: 0.82, dumboArt, family } : { traits, color: FIN_COLORS.pale, alpha: 0.4, dumboArt, family: 'blue' };
}

/** 烘好的鰭（每種鰭型、顏色、魚圖大小一張），所有同樣的魚共用（I1 貼圖快取）。 */
const bakedFins = new Map<string, { tex: Texture; x: number; y: number } | null>();

/** 還沒釋放的漸層（每個漸層各有一張貼圖，烘完或 Graphics 拆掉就要 destroy，不然會一直累積）。 */
let liveGradients = 0;

export function liveFinGradients(): number {
  return liveGradients;
}

function gradient(list: FillGradient[], options: GradientOptions): FillGradient {
  const f = new FillGradient(options);
  liveGradients++;
  list.push(f);
  return f;
}

function freeGradients(list: FillGradient[]): void {
  for (const f of list) f.destroy();
  liveGradients -= list.length;
  list.length = 0;
}

/** 鰭的快取鍵：鰭型、顏色、透明度、身體範圍都一樣，畫出來就一樣。 */
export function finCacheKey(fins: FinLook, body: { x: number; y: number; rx: number; ry: number }, lengthPx: number, layer: 'back' | 'front'): string {
  const t = fins.traits;
  const round = (v: number) => Math.round(v);
  return [layer, +!!t.swallow, +!!t.ribbon, +!!t.dumbo, +!!t.bigC, t.sword ?? 0, +!!t.halfmoon, Math.round((t.length ?? 0) * 20), fins.color, fins.alpha, round(body.x), round(body.y), round(body.rx), round(body.ry), round(lengthPx)].join(':');
}

export function finCacheSize(): number {
  return bakedFins.size;
}

/** 把模糊過的鰭烘成貼圖：濾鏡只跑一次，之後每格只畫一張圖。 */
function cachedSprite(key: string): Sprite | null {
  const hit = bakedFins.get(key);
  if (!hit) return null;
  const s = new Sprite(hit.tex);
  s.position.set(hit.x, hit.y);
  return s;
}

function bake(renderer: Renderer, g: Graphics, key: string, pad: number): Sprite | null {
  let hit = bakedFins.get(key);
  if (hit === undefined) {
    const b = g.getLocalBounds();
    if (b.width <= 0 || b.height <= 0) hit = null;
    else {
      const frame = new Rectangle(Math.floor(b.x - pad), Math.floor(b.y - pad), Math.ceil(b.width + pad * 2), Math.ceil(b.height + pad * 2));
      hit = { tex: renderer.generateTexture({ target: g, frame, antialias: true }), x: frame.x, y: frame.y };
    }
    bakedFins.set(key, hit);
  }
  g.destroy();
  return cachedSprite(key);
}

/** renderer 有給就把鰭烘成共用的貼圖（遊戲裡）；沒給就直接掛著模糊的 Graphics。 */
export function drawFinOverlay(rig: FishRig | PaintedRig, fins: FinLook, renderer?: Renderer): void {
  const { bodyEllipse: e, R } = rig.art;
  const body = { x: e.x * R, y: e.y * R, rx: e.rx * R, ry: e.ry * R };
  const backKey = finCacheKey(fins, body, rig.lengthPx, 'back');
  const frontKey = finCacheKey(fins, body, rig.lengthPx, 'front');
  if (renderer && bakedFins.has(backKey) && bakedFins.has(frontKey)) {
    // 同樣的鰭已經烘過：直接拿共用貼圖，不重畫、不建漸層和模糊濾鏡（#151 審查）
    const b = cachedSprite(backKey);
    const f = cachedSprite(frontKey);
    if (b) rig.addChildAt(b, 0);
    if (f) rig.addChild(f);
  } else {
    const shapes = finShapes(fins.traits, body, rig.lengthPx);
    const back = new Graphics(), front = new Graphics();
    const light = mix(fins.color, 0xffffff, 0.55);
    const deep = mix(fins.color, 0x000000, 0.25);
    const gradients = { back: [] as FillGradient[], front: [] as FillGradient[] };
    const paint = (g: Graphics, list: FinShape[], made: FillGradient[]) => {
      for (const sh of list) {
        if (sh.soft) {
          // 薄紗鰭：不描邊（邊緣靠模糊柔化），薄膜和鰭條都從根部往尖端漸透
          const sheen = mix(fins.color, 0xbff6ff, 0.45);
          // 薄膜用放射漸層：以鰭根為中心，根部濃、往尖端越來越透，顏色漸漸帶一點虹彩
          const p = sh.points, n = p.length;
          const rx = (p[0] + p[n - 2]) / 2, ry = (p[1] + p[n - 1]) / 2;
          let reach = 1;
          for (let i = 0; i < n; i += 2) reach = Math.max(reach, Math.hypot(p[i] - rx, p[i + 1] - ry));
          const rgba = (c: number, a: number) => ({ r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255, a });
          const base = mix(fins.color, 0xffffff, 0.15);
          const membrane = gradient(made, {
            type: 'radial',
            center: { x: rx, y: ry },
            innerRadius: 0,
            outerCenter: { x: rx, y: ry },
            outerRadius: reach,
            colorStops: [
              { offset: 0, color: rgba(base, fins.alpha * 0.7) },
              { offset: 0.5, color: rgba(mix(base, sheen, 0.3), fins.alpha * 0.48) },
              { offset: 1, color: rgba(sheen, fins.alpha * 0.2) },
            ],
            textureSpace: 'global',
          });
          g.poly(p).fill(membrane);
          // 鰭條也用同一個中心的漸層：根部亮、往尖端漸透，亮暗相間帶一點虹彩
          const rayFill = (c: number) =>
            gradient(made, {
              type: 'radial',
              center: { x: rx, y: ry },
              innerRadius: 0,
              outerCenter: { x: rx, y: ry },
              outerRadius: reach,
              colorStops: [
                { offset: 0, color: rgba(c, Math.min(1, fins.alpha * 1.1)) },
                { offset: 1, color: rgba(c, fins.alpha * 0.15) },
              ],
              textureSpace: 'global',
            });
          const rayColors = [mix(fins.color, 0xffffff, 0.35), sheen, light].map(rayFill);
          (sh.rays ?? []).forEach((ray, i) => g.poly(ray, false).stroke({ fill: rayColors[i % 3], width: Math.max(0.7, body.ry * 0.035), cap: 'round', join: 'round' }));
        } else if (sh.kind === 'fill') {
          // 底色深一點、上面再疊一層亮的，看起來是薄薄一片透光的鰭
          g.poly(sh.points).fill({ color: deep, alpha: fins.alpha * 0.5 });
          g.poly(sh.points).fill({ color: mix(fins.color, 0xffffff, 0.15), alpha: fins.alpha * 0.6 });
          for (const ray of sh.rays ?? []) g.poly(ray, false).stroke({ color: deep, alpha: fins.alpha * 0.6, width: Math.max(0.8, body.ry * 0.05), cap: 'round' });
          g.poly(sh.points).stroke({ color: light, alpha: fins.alpha * 0.9, width: Math.max(0.8, body.ry * 0.05), join: 'round' });
        } else {
          const [x0, y0, cx, cy, x1, y1] = sh.points;
          g.moveTo(x0, y0).quadraticCurveTo(cx, cy, x1, y1).stroke({ color: mix(fins.color, 0xffffff, 0.2), alpha: Math.min(1, fins.alpha + 0.2), width: Math.max(1.2, body.ry * 0.1), cap: 'round' });
        }
      }
    };
    paint(back, shapes.filter((sh) => !sh.front), gradients.back);
    paint(front, shapes.filter((sh) => sh.front), gradients.front);
    // 邊緣柔一點，不像剪紙
    const blur = Math.max(0.4, body.ry * 0.015);
    back.filters = [new BlurFilter({ strength: blur, quality: 2 })];
    front.filters = [new BlurFilter({ strength: blur, quality: 2 })];
    if (renderer) {
      const pad = Math.ceil(blur * 4 + 2);
      const b = bake(renderer, back, backKey, pad);
      const f = bake(renderer, front, frontKey, pad);
      // 已經烘進貼圖了，漸層用不到（#151 審查：沒釋放的話每次烘約漏 2MB）
      freeGradients(gradients.back);
      freeGradients(gradients.front);
      if (b) rig.addChildAt(b, 0);
      if (f) rig.addChild(f);
    } else {
      back.once('destroyed', () => freeGradients(gradients.back));
      front.once('destroyed', () => freeGradients(gradients.front));
      rig.addChildAt(back, 0);
      rig.addChild(front);
    }
  }
  const tex = fins.dumboArt ? paintedTexture(fins.family === 'blue' ? 'fin-pectoral-dumbo' : `fin-pectoral-dumbo~${fins.family}`) : null;
  if (tex) {
    // 大耳的胸鰭圖：根部接在鰓後面、扇面往後下方張開，壓在身體下面（圖頭朝右，魚的圖層頭朝左，所以水平翻）
    const fan = new Sprite(tex);
    const [ax, ay] = FIN_PARTS['fin-pectoral-dumbo'].anchor;
    fan.anchor.set(ax, ay);
    const w = rig.lengthPx * 0.36;
    fan.scale.set(-w / tex.width, w / tex.width);
    fan.position.set(body.x - body.rx * 0.5, body.y + body.ry * 0.45);
    fan.rotation = 0.75;
    fan.alpha = fins.color === FIN_COLORS.pale ? 0.55 : 0.92;
    rig.addChildAt(fan, 0);
  }
}

