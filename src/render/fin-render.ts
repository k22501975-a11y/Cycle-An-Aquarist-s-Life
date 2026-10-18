import { BlurFilter, Graphics, Sprite } from 'pixi.js';
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
    swallow: p.swallow && !inArt('swallow'),
    ribbon: p.ribbon && !inArt('ribbon'),
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

export function drawFinOverlay(rig: FishRig | PaintedRig, fins: FinLook): void {
  const { bodyEllipse: e, R } = rig.art;
  const body = { x: e.x * R, y: e.y * R, rx: e.rx * R, ry: e.ry * R };
  const shapes = finShapes(fins.traits, body, rig.lengthPx);
  const back = new Graphics(), front = new Graphics();
  const light = mix(fins.color, 0xffffff, 0.55);
  const deep = mix(fins.color, 0x000000, 0.25);
  const paint = (g: Graphics, list: FinShape[]) => {
    for (const sh of list) {
      if (sh.kind === 'fill') {
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
  paint(back, shapes.filter((sh) => !sh.front));
  paint(front, shapes.filter((sh) => sh.front));
  // 邊緣柔一點，不像剪紙
  back.filters = [new BlurFilter({ strength: Math.max(0.4, body.ry * 0.015), quality: 2 })];
  front.filters = [new BlurFilter({ strength: Math.max(0.4, body.ry * 0.015), quality: 2 })];
  rig.addChildAt(back, 0);
  rig.addChild(front);
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

