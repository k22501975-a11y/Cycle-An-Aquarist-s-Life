import { Assets, Container, MeshPlane, Texture } from 'pixi.js';
import type { FishSpeciesId } from '../sim';
import type { FishForm } from './fish-art';
import { guppyLook } from './strains';

/**
 * 精繪素材（AI 生圖，design/art-assets-ai.md）。
 *
 * 素材是彩色成品，每個品系一張，頭朝右。載入失敗或沒有對應的圖時，
 * 由 fish-art.ts 的程式繪製版本頂上，遊戲照樣能玩。
 */

interface PaintedSpec {
  file: string;
  /** 尾鰭從圖的左邊算起佔多寬（0–1）。尾柄以左的網格會擺動。 */
  tail: number;
  /** 擺動幅度（相對圖高）。蝦的尾扇只輕輕動。 */
  swing: number;
  /** 身體的大概範圍（相對圖寬高，原點在圖中心、頭朝右）：白點病的白點畫在這裡面。 */
  body: { x: number; y: number; rx: number; ry: number };
  /** 圖裡已經畫了卵（抱卵蝦），不用再用程式畫。 */
  eggs?: boolean;
}

const GUPPY_MALE_BODY = { x: 0.14, y: 0.02, rx: 0.2, ry: 0.11 };
const GUPPY_FEMALE_BODY = { x: 0.12, y: 0.04, rx: 0.22, ry: 0.14 };
const SHRIMP_BODY = { x: 0.08, y: -0.02, rx: 0.25, ry: 0.12 };
const ZEBRA_BODY = { x: 0.1, y: 0.0, rx: 0.3, ry: 0.11 };
const FRY_BODY = { x: 0.12, y: 0.0, rx: 0.25, ry: 0.1 };

export const PAINTED: Record<string, PaintedSpec> = {
  'guppy-male-bluegrass': { file: 'fish/guppy-male-bluegrass.webp', tail: 0.34, swing: 0.13, body: GUPPY_MALE_BODY },
  'guppy-male-cobra': { file: 'fish/guppy-male-cobra.webp', tail: 0.3, swing: 0.13, body: GUPPY_MALE_BODY },
  'guppy-male-albino-red': { file: 'fish/guppy-male-albino-red.webp', tail: 0.32, swing: 0.13, body: GUPPY_MALE_BODY },
  'guppy-male-tuxedo': { file: 'fish/guppy-male-tuxedo.webp', tail: 0.32, swing: 0.13, body: GUPPY_MALE_BODY },
  'guppy-male-redcobra': { file: 'fish/guppy-male-redcobra.webp', tail: 0.32, swing: 0.13, body: GUPPY_MALE_BODY },
  'guppy-fry': { file: 'fish/guppy-fry.webp', tail: 0.24, swing: 0.12, body: FRY_BODY },
  'zebrafish-male': { file: 'fish/zebrafish-male.webp', tail: 0.2, swing: 0.1, body: ZEBRA_BODY },
  'zebrafish-female': { file: 'fish/zebrafish-female.webp', tail: 0.2, swing: 0.09, body: ZEBRA_BODY },
  'guppy-female-base': { file: 'fish/guppy-female-base.webp', tail: 0.26, swing: 0.1, body: GUPPY_FEMALE_BODY },
  'guppy-female-pregnant': { file: 'fish/guppy-female-pregnant.webp', tail: 0.24, swing: 0.09, body: GUPPY_FEMALE_BODY },
  'shrimp-cherry-male': { file: 'shrimp/shrimp-cherry-male.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
  'shrimp-cherry-female': { file: 'shrimp/shrimp-cherry-female.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
  'shrimp-cherry-berried': { file: 'shrimp/shrimp-cherry-berried.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY, eggs: true },
  'shrimp-cherry-juvenile': { file: 'shrimp/shrimp-cherry-juvenile.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
};

/** 品系名稱 → 素材。沒列到的品系用程式繪製版。 */
const GUPPY_MALE_ART: Record<string, string> = {
  藍草: 'guppy-male-bluegrass',
  黃金蛇王: 'guppy-male-cobra',
  白子全紅: 'guppy-male-albino-red',
  藍尾禮服: 'guppy-male-tuxedo',
  紅蛇王: 'guppy-male-redcobra',
};

/** 這條魚該用哪張精繪圖；沒有就回傳 null（還沒畫的品系）。 */
export function paintedKey(species: FishSpeciesId, form: FishForm, variant: number, gravid: boolean): string | null {
  if (species === 'cherry_shrimp') {
    if (form === 'juvenile') return 'shrimp-cherry-juvenile';
    if (form === 'female') return gravid ? 'shrimp-cherry-berried' : 'shrimp-cherry-female';
    return 'shrimp-cherry-male';
  }
  // 孔雀魚和斑馬魚的仔魚都是半透明的小魚，共用一張
  if (form === 'juvenile') return 'guppy-fry';
  if (species === 'zebrafish') return form === 'female' ? 'zebrafish-female' : 'zebrafish-male';
  if (form === 'female') return gravid ? 'guppy-female-pregnant' : 'guppy-female-base';
  return GUPPY_MALE_ART[guppyLook(variant).strain] ?? null;
}

/** 背景與造景（青龍石、沉木）：不做網格，由 scenery.ts 畫進場景的 Canvas。 */
export const SCENERY: Record<string, string> = {
  'bg-back': 'bg/bg-tank-back.webp',
  'bg-substrate': 'bg/bg-tank-substrate.webp',
  'rock-1': 'scape/rock-seiryu-1.webp',
  'rock-2': 'scape/rock-seiryu-2.webp',
  'rock-3': 'scape/rock-seiryu-3.webp',
  'rock-4': 'scape/rock-seiryu-4.webp',
  'rock-5': 'scape/rock-seiryu-5.webp',
  'wood-1': 'scape/wood-spider-1.webp',
  'wood-2': 'scape/wood-spider-2.webp',
  'wood-3': 'scape/wood-spider-3.webp',
  'plant-rotala': 'scape/plant-rotala.webp',
};

const textures = new Map<string, Texture>();
const scenery = new Map<string, Texture>();

/** 開遊戲前載入素材。個別檔案失敗只會讓那張圖退回程式繪製，不會擋住遊戲。 */
export async function loadPaintedArt(base = import.meta.env.BASE_URL): Promise<number> {
  await Promise.all([
    ...Object.entries(PAINTED).map(async ([key, spec]) => {
      try {
        textures.set(key, await Assets.load<Texture>(`${base}art/${spec.file}`));
      } catch {
        // 留給程式繪製版
      }
    }),
    ...Object.entries(SCENERY).map(async ([key, file]) => {
      try {
        scenery.set(key, await Assets.load<Texture>(`${base}art/${file}`));
      } catch {
        // 留給程式繪製版
      }
    }),
  ]);
  return textures.size + scenery.size;
}

export function paintedTexture(key: string | null): Texture | null {
  return key ? (textures.get(key) ?? null) : null;
}

/** 造景素材的原圖（給 Canvas 的 drawImage 用）；沒載入就回傳 null，改用程式繪製。 */
export function sceneryImage(key: string): CanvasImageSource | null {
  const tex = scenery.get(key);
  return tex ? (tex.source.resource as CanvasImageSource) : null;
}

const MESH_X = 12;
const MESH_Y = 5;

/**
 * 一張精繪圖做成的魚：整張圖是一個 MeshPlane，尾柄以左的網格隨擺動相位變形。
 * 介面跟 FishRig 一樣（原點在魚中心、頭朝左、單位是貼圖像素）。
 */
export class PaintedRig extends Container {
  readonly art: { R: number; bodyEllipse: { x: number; y: number; rx: number; ry: number } };
  readonly lengthPx: number;
  readonly drawsEggs: boolean;
  private readonly mesh: MeshPlane;
  private readonly rest: Float32Array;
  private readonly spec: PaintedSpec;

  constructor(key: string, texture: Texture, readonly look: { alpha: number }) {
    super();
    const spec = PAINTED[key];
    this.spec = spec;
    const w = texture.width;
    const h = texture.height;
    this.lengthPx = w;
    this.drawsEggs = !!spec.eggs;
    // 圖是頭朝右，魚的座標是頭朝左：水平翻轉，原點放在圖中心。
    this.mesh = new MeshPlane({ texture, verticesX: MESH_X, verticesY: MESH_Y });
    this.mesh.scale.x = -1;
    this.mesh.position.set(w / 2, -h / 2);
    this.addChild(this.mesh);
    this.rest = new Float32Array(this.mesh.geometry.getBuffer('aPosition').data);
    const b = spec.body;
    this.art = { R: 1, bodyEllipse: { x: -b.x * w, y: b.y * h, rx: b.rx * w, ry: b.ry * h } };
    this.alpha = look.alpha;
  }

  /** 跟 FishRig.animate 一樣的參數：相位、擺幅、夾鰭、鰭破損。 */
  animate(phase: number, swing: number, fold = 1, damage = 0): void {
    const w = this.lengthPx;
    const h = this.mesh.texture.height;
    const tailX = this.spec.tail * w;
    const cy = h / 2;
    const shorten = 1 - 0.45 * damage;
    const buf = this.mesh.geometry.getBuffer('aPosition');
    const data = buf.data as Float32Array;
    const rest = this.rest;
    for (let i = 0; i < rest.length; i += 2) {
      const x = rest[i];
      const y = rest[i + 1];
      if (x >= tailX) {
        // 身體前段跟著輕輕擺，看起來是整條魚在游
        const body = (x - tailX) / (w - tailX);
        data[i] = x;
        data[i + 1] = y + Math.sin(phase + 1.2) * swing * (1 - body) * h * 0.012;
        continue;
      }
      const d = (tailX - x) / tailX;
      const wave = Math.sin(phase - d * 2.4) * swing * Math.pow(d, 1.5) * h * this.spec.swing;
      data[i] = tailX - (tailX - x) * shorten + Math.abs(wave) * 0.15;
      data[i + 1] = cy + (y - cy) * (fold + (1 - fold) * (1 - d) * 0.3) + wave;
    }
    buf.update();
  }

  /** 死掉或生病時整條魚變灰。 */
  setDim(color: number | null): void {
    this.mesh.tint = color ?? 0xffffff;
  }
}
