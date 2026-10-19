import { Container, Graphics, Sprite } from 'pixi.js';
import { GUIDE_LINES, hardscapePlacements, lightMap, PLANT_SPECIES, SCAPE_LAYERS, type Placement, type ScapeLayer, type TankState } from '../sim';
import type { TankBounds } from './layout';
import { paintHardscapeItem } from './scenery';
import type { SubstrateLook } from './substrate';

/**
 * 造景圖層（aquascape-editor.md §1）：後景、中景、前景三層。
 * 後景縮小、顏色偏淡偏藍（離得遠），前景放大一點、最清楚；石頭和沉木依玩家擺的位置畫，落在底沙上。
 * 造景模式時還會畫構圖輔助線、選取框、光照點（陽性草適合種在哪裡），其他層變半透明避免誤點。
 */

export interface LayerLook {
  scale: number;
  /** 落點往下移幾個 hs（後景在比較遠、比較高的沙坡上）。 */
  dy: number;
  /** 遠處的水色。 */
  tint: number;
  /** 疊在素材上的水藍色濃度。 */
  haze: number;
}

export const LAYER_LOOK: Record<ScapeLayer, LayerLook> = {
  back: { scale: 0.86, dy: -12, tint: 0xb4d2dc, haze: 0.22 },
  mid: { scale: 1, dy: 0, tint: 0xffffff, haze: 0.12 },
  front: { scale: 1.06, dy: 8, tint: 0xffffff, haze: 0.05 },
};

export const LAYER_LABELS: Record<ScapeLayer, string> = { back: '後景', mid: '中景', front: '前景' };

export type ScapeTarget = { kind: 'hardscape'; index: number } | { kind: 'plant'; id: number };

export function sameTarget(a: ScapeTarget | null, b: ScapeTarget | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === 'hardscape' ? b.kind === 'hardscape' && a.index === b.index : b.kind === 'plant' && a.id === b.id;
}

/** 造景模式的狀態（畫面只讀，由介面設定）。 */
export interface ScapeEdit {
  layer: ScapeLayer;
  selected: ScapeTarget | null;
  guides: boolean;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 石頭、沉木的落點高度：埋進沙裡一點（底沙圖層會蓋住底部）。 */
export function hardscapeBaseY(kind: 'rock' | 'wood', layer: ScapeLayer, look: SubstrateLook, bottom: number, hs: number): number {
  const base = look === 'bare' ? 8 : kind === 'wood' ? 8 : 22;
  return bottom + (base + LAYER_LOOK[layer].dy) * hs;
}

interface ItemView {
  sprite: Sprite;
  index: number;
  place: Placement;
  kind: 'rock' | 'wood';
}

export class ScapeView {
  /** 石頭、沉木（每層一個）。 */
  readonly rocks: Record<ScapeLayer, Container> = { back: new Container(), mid: new Container(), front: new Container() };
  /** 水草（每層一個；tank-view 把水草放進對應的層）。 */
  readonly plants: Record<ScapeLayer, Container> = { back: new Container(), mid: new Container(), front: new Container() };
  /** 造景模式的輔助線、選取框、光照點（畫在魚的上面）。 */
  readonly overlay = new Graphics();
  private items: ItemView[] = [];
  private key = '';
  private edit: ScapeEdit | null = null;
  /** 拖曳中的物件與它目前的 x（像素）。 */
  private drag: { target: ScapeTarget; x: number } | null = null;

  constructor() {
    for (const layer of SCAPE_LAYERS) {
      this.rocks[layer].tint = LAYER_LOOK[layer].tint;
      this.plants[layer].tint = LAYER_LOOK[layer].tint;
    }
  }

  get editing(): ScapeEdit | null {
    return this.edit;
  }

  setEdit(edit: ScapeEdit | null): void {
    this.edit = edit;
    if (!edit) this.drag = null;
  }

  setDrag(target: ScapeTarget | null, x = 0): void {
    this.drag = target ? { target, x } : null;
  }

  dragX(target: ScapeTarget): number | null {
    return this.drag && sameTarget(this.drag.target, target) ? this.drag.x : null;
  }

  /** 依狀態重建石頭、沉木（位置或版面變了才重畫）。 */
  sync(state: TankState, env: { bounds: TankBounds; hs: number; look: SubstrateLook; sceneKey: string; pixelRatio?: number }): void {
    const list = state.equipment.hardscape ?? [];
    const places = hardscapePlacements(state);
    const key = `${env.sceneKey}@${env.pixelRatio ?? 1}|${list.map((x, i) => `${x.id}@${JSON.stringify(places[i])}`).join(',')}`;
    if (key !== this.key) {
      this.key = key;
      for (const v of this.items) {
        v.sprite.texture.destroy(true);
        v.sprite.destroy();
      }
      this.items = list.map((spec, index) => {
        const place = places[index];
        const look = LAYER_LOOK[place.layer];
        const painting = paintHardscapeItem(spec.id, place.seed, env.hs, (place.scale ?? 1) * look.scale, look.haze, !!place.flip, env.pixelRatio);
        const sprite = new Sprite(painting.texture);
        sprite.anchor.set(painting.anchorX, painting.anchorY);
        this.rocks[place.layer].addChild(sprite);
        return { sprite, index, place, kind: spec.kind };
      });
    }
    const { width, bottom } = env.bounds;
    for (const v of this.items) {
      const x = this.dragX({ kind: 'hardscape', index: v.index }) ?? v.place.x * width;
      v.sprite.position.set(x, hardscapeBaseY(v.kind, v.place.layer, env.look, bottom, env.hs));
    }
  }

  /** 物件在畫面上的範圍（root 座標）。 */
  hardscapeRect(index: number): Rect | null {
    const v = this.items.find((i) => i.index === index);
    if (!v) return null;
    const s = v.sprite;
    const w = s.texture.width * s.scale.x;
    const h = s.texture.height * s.scale.y;
    return { x0: s.x - w * s.anchor.x, y0: s.y - h * s.anchor.y, x1: s.x + w * (1 - s.anchor.x), y1: s.y };
  }

  /** 這層的第一組石頭、沉木（造景引導指給玩家看）。 */
  firstInLayer(layer: ScapeLayer): number | null {
    return this.items.find((v) => v.place.layer === layer)?.index ?? null;
  }

  /** 點到哪一組石頭、沉木（只找目前編輯的那層，前面的優先）。 */
  hitHardscape(x: number, y: number, layer: ScapeLayer): number | null {
    for (const v of [...this.items].reverse()) {
      if (v.place.layer !== layer) continue;
      const r = this.hardscapeRect(v.index)!;
      const padX = (r.x1 - r.x0) * 0.12;
      if (x >= r.x0 + padX && x <= r.x1 - padX && y >= r.y0 + (r.y1 - r.y0) * 0.1 && y <= r.y1 + 10) return v.index;
    }
    return null;
  }

  /** 造景模式：其他層變淡、畫輔助線、選取框、光照點。selectedRect 由 tank-view 給（水草的範圍在那邊）。 */
  drawEdit(state: TankState, bounds: TankBounds, floor: (x: number) => number, selectedRect: Rect | null): void {
    const g = this.overlay.clear();
    const edit = this.edit;
    for (const layer of SCAPE_LAYERS) {
      const a = !edit || edit.layer === layer ? 1 : 0.4;
      this.rocks[layer].alpha = a;
      this.plants[layer].alpha = a;
    }
    if (!edit) return;
    const { width, surface, bottom } = bounds;
    if (edit.guides) {
      for (const f of GUIDE_LINES.golden) dashed(g, f * width, surface, bottom, 0xe3bd6d, 0.7);
      for (const f of GUIDE_LINES.thirds) dashed(g, f * width, surface, bottom, 0xf3ead8, 0.35);
    }
    // 光照點：選了水草時，沿著缸底標出光夠不夠（陽性草要種在綠點）
    const sel = edit.selected;
    if (sel?.kind === 'plant') {
      const plant = state.plants.find((p) => p.id === sel.id);
      const high = plant ? PLANT_SPECIES[plant.species].lightType === 'high' : true;
      for (const { x, light } of lightMap(state, edit.layer, 28)) {
        const px = x * width;
        const color = light >= 0.85 ? 0x7fd88a : light >= 0.6 ? 0xffcf5a : high ? 0xff6b5e : 0x8fd3e8;
        g.circle(px, floor(px) - 2, 4).fill({ color, alpha: 0.85 }).stroke({ color: 0x0b2a36, width: 1, alpha: 0.6 });
      }
    }
    if (selectedRect) {
      const r = selectedRect;
      g.roundRect(r.x0 - 4, r.y0 - 4, r.x1 - r.x0 + 8, r.y1 - r.y0 + 8, 10).stroke({ color: 0xf6d891, width: 2, alpha: 0.9 });
      // 落點：放開後會落到這裡（重力吸附在底沙上）
      const cx = (r.x0 + r.x1) / 2;
      g.ellipse(cx, r.y1, Math.max(10, (r.x1 - r.x0) * 0.35), 4).fill({ color: 0xf6d891, alpha: 0.35 });
    }
  }
}

function dashed(g: Graphics, x: number, y0: number, y1: number, color: number, alpha: number): void {
  for (let y = y0; y < y1; y += 14) g.moveTo(x, y).lineTo(x, Math.min(y1, y + 7));
  g.stroke({ color, width: 1.5, alpha });
}
