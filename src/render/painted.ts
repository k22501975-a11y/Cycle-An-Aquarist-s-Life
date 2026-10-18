import { isShrimpSpecies } from '../sim';
import { Assets, BlurFilter, ColorMatrixFilter, Container, Mesh, MeshPlane, Texture } from 'pixi.js';
import type { FishSpeciesId, GrowthStage } from '../sim';
import type { FishForm } from './fish-art';
import { canvasTexture, makeCanvas } from './paint';
import { parseRecipeKey, patternBase, recolorImage } from './phenotype-art';
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
  /** 張嘴吃東西的那一格（咬下去時換上）。 */
  eating?: string;
}

const GUPPY_MALE_BODY = { x: 0.14, y: 0.02, rx: 0.2, ry: 0.11 };
const GUPPY_FEMALE_BODY = { x: 0.12, y: 0.04, rx: 0.22, ry: 0.14 };
const SHRIMP_BODY = { x: 0.08, y: -0.02, rx: 0.25, ry: 0.12 };
const ZEBRA_BODY = { x: 0.1, y: 0.0, rx: 0.3, ry: 0.11 };
const FRY_BODY = { x: 0.12, y: 0.0, rx: 0.25, ry: 0.1 };

export const PAINTED: Record<string, PaintedSpec> = {
  'guppy-male-bluegrass': { file: 'fish/guppy-male-bluegrass.webp', tail: 0.34, swing: 0.13, body: GUPPY_MALE_BODY, eating: 'fish/guppy-male-bluegrass-eating.webp' },
  'guppy-male-cobra': { file: 'fish/guppy-male-cobra.webp', tail: 0.3, swing: 0.13, body: GUPPY_MALE_BODY },
  'guppy-male-albino-red': { file: 'fish/guppy-male-albino-red.webp', tail: 0.32, swing: 0.13, body: GUPPY_MALE_BODY },
  'guppy-male-tuxedo': { file: 'fish/guppy-male-tuxedo.webp', tail: 0.32, swing: 0.13, body: GUPPY_MALE_BODY },
  'guppy-male-redcobra': { file: 'fish/guppy-male-redcobra.webp', tail: 0.32, swing: 0.13, body: GUPPY_MALE_BODY },
  ...finArt(),
  'guppy-fry': { file: 'fish/guppy-fry.webp', tail: 0.24, swing: 0.12, body: FRY_BODY },
  'zebrafish-male': { file: 'fish/zebrafish-male.webp', tail: 0.2, swing: 0.1, body: ZEBRA_BODY },
  'zebrafish-female': { file: 'fish/zebrafish-female.webp', tail: 0.2, swing: 0.09, body: ZEBRA_BODY },
  'guppy-female-base': { file: 'fish/guppy-female-base.webp', tail: 0.26, swing: 0.1, body: GUPPY_FEMALE_BODY, eating: 'fish/guppy-female-base-eating.webp' },
  'guppy-female-pregnant': { file: 'fish/guppy-female-pregnant.webp', tail: 0.24, swing: 0.09, body: GUPPY_FEMALE_BODY },
  'shrimp-cherry-male': { file: 'shrimp/shrimp-cherry-male.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
  'shrimp-cherry-female': { file: 'shrimp/shrimp-cherry-female.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
  'shrimp-cherry-berried': { file: 'shrimp/shrimp-cherry-berried.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY, eggs: true },
  'shrimp-cherry-subadult': { file: 'shrimp/shrimp-cherry-subadult.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
  'shrimp-molt-stuck': { file: 'shrimp/shrimp-molt-stuck.webp', tail: 0.18, swing: 0.0, body: SHRIMP_BODY },
  'guppy-juvenile': { file: 'fish/guppy-juvenile.webp', tail: 0.3, swing: 0.12, body: { x: 0.14, y: 0.0, rx: 0.22, ry: 0.12 } },
  'shrimp-cherry-juvenile': { file: 'shrimp/shrimp-cherry-juvenile.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
  // 鳳尾短鯛（親魚護幼，parental.ts）：母魚圖是護幼色，平常用濾鏡褪成灰黃
  'apisto-male': { file: 'fish/apisto-male.webp', tail: 0.26, swing: 0.08, body: { x: 0.02, y: 0.1, rx: 0.26, ry: 0.11 } },
  'apisto-female': { file: 'fish/apisto-female.webp', tail: 0.24, swing: 0.08, body: { x: 0.06, y: 0.0, rx: 0.3, ry: 0.11 } },
  'apisto-fry': { file: 'fish/apisto-fry.webp', tail: 0.26, swing: 0.12, body: FRY_BODY },
};

/**
 * 緞帶、燕尾、半月的整條魚圖（5 種花紋各一張，art/fish/fins/）。
 * 緞帶下面多一大片垂下來的帶子，身體在圖裡偏上；半月的尾巴大，身體偏下。
 */
function finArt(): Record<string, PaintedSpec> {
  const bodyY: Record<string, [number, number, number]> = {
    // 花紋：緞帶、燕尾、半月的身體中心 y（相對圖高）
    bluegrass: [-0.05, 0.03, 0.12],
    cobra: [-0.05, 0.03, 0.1],
    'albino-red': [-0.2, 0, 0.1],
    tuxedo: [-0.18, 0.05, 0.09],
    redcobra: [-0.24, 0.01, 0.13],
  };
  const out: Record<string, PaintedSpec> = {};
  for (const [pat, ys] of Object.entries(bodyY)) {
    (['ribbon', 'swallow', 'halfmoon'] as const).forEach((fin, i) => {
      const key = `guppy-male-${pat}-${fin}`;
      const ry = fin === 'ribbon' ? 0.08 : fin === 'halfmoon' ? 0.1 : 0.1;
      out[key] = { file: `fish/${key}.webp`, tail: fin === 'halfmoon' ? 0.38 : 0.34, swing: 0.12, body: { x: 0.16, y: ys[i], rx: 0.2, ry } };
    });
  }
  return out;
}

/** 品系名稱 → 素材。沒列到的品系用程式繪製版。 */
const GUPPY_MALE_ART: Record<string, string> = {
  藍草: 'guppy-male-bluegrass',
  黃金蛇王: 'guppy-male-cobra',
  白子全紅: 'guppy-male-albino-red',
  藍尾禮服: 'guppy-male-tuxedo',
  紅蛇王: 'guppy-male-redcobra',
};

/** 這條魚該用哪張精繪圖；沒有就回傳 null（還沒畫的品系）。 */
export function paintedKey(species: FishSpeciesId, form: FishForm, variant: number, gravid: boolean, stage?: GrowthStage, stuckMolt = false): string | null {
  if (isShrimpSpecies(species)) {
    // 卡殼死掉的蝦：身上一圈白線
    if (stuckMolt) return 'shrimp-molt-stuck';
    if (stage === 'subadult' && form === 'juvenile') return 'shrimp-cherry-subadult';
    if (form === 'juvenile') return stage === 'subadult' ? 'shrimp-cherry-subadult' : 'shrimp-cherry-juvenile';
    if (form === 'female') return gravid ? 'shrimp-cherry-berried' : 'shrimp-cherry-female';
    return 'shrimp-cherry-male';
  }
  // 鬥魚的精繪圖還沒到：成魚先用程式繪製版（fish-art.ts），仔魚和孔雀魚共用
  if (species === 'betta') return form === 'juvenile' ? 'guppy-fry' : null;
  if (species === 'apisto') return form === 'juvenile' ? 'apisto-fry' : form === 'female' ? 'apisto-female' : 'apisto-male';
  // 孔雀魚和斑馬魚的仔魚都是半透明的小魚，共用一張；長到幼魚身體有底色、尾巴變大
  if (form === 'juvenile') return stage && stage !== 'fry' ? 'guppy-juvenile' : 'guppy-fry';
  if (species === 'zebrafish') return form === 'female' ? 'zebrafish-female' : 'zebrafish-male';
  if (form === 'female') return gravid ? 'guppy-female-pregnant' : 'guppy-female-base';
  return GUPPY_MALE_ART[guppyLook(variant).strain] ?? null;
}

/** 背景與造景（青龍石、沉木）：不做網格，由 scenery.ts 畫進場景的 Canvas。 */
export const SCENERY: Record<string, string> = {
  'bg-back': 'bg/bg-tank-back.webp',
  'rock-1': 'scape/rock-seiryu-1.webp',
  'rock-2': 'scape/rock-seiryu-2.webp',
  'rock-3': 'scape/rock-seiryu-3.webp',
  'rock-4': 'scape/rock-seiryu-4.webp',
  'rock-5': 'scape/rock-seiryu-5.webp',
  'wood-1': 'scape/wood-spider-1.webp',
  'wood-2': 'scape/wood-spider-2.webp',
  'wood-3': 'scape/wood-spider-3.webp',
  'plant-rotala': 'scape/plant-rotala.webp',
  'plant-anubias': 'scape/plant-anubias.webp',
  // 底材：俯視紋理（鋪沙面）與前玻璃看進去的斷面條
  'sub-sand-tile': 'substrate/substrate-sand-tile.webp',
  'sub-soil-tile': 'substrate/substrate-soil-tile.webp',
  'sub-coral-tile': 'substrate/substrate-coral-tile.webp',
  'sub-sand-side': 'substrate/substrate-sand-side.webp',
  'sub-soil-side': 'substrate/substrate-soil-side.webp',
  'sub-coral-side': 'substrate/substrate-coral-side.webp',
};

/**
 * 單片鰭的圖層（art/fish/fins/parts/）：頭朝右，anchor 是接到身體的那一點（相對圖寬高）。
 * 大耳的胸鰭根部帶一小塊魚身，要壓在身體下面。
 */
/** 小道具：蝦脫下來的空殼、螺。 */
const PROPS: Record<string, string> = {
  'shrimp-molt': 'shrimp/shrimp-molt.webp',
  // 螺（design/snails.md）
  ...Object.fromEntries(
    ['snail-apple-gold', 'snail-apple-blue', 'snail-apple-babies', 'snail-apple-eggs', 'snail-nerite-zebra', 'snail-assassin', 'snail-ramshorn-red', 'snail-bladder', 'snail-mts'].map((k) => [k, `snail/${k}.webp`]),
  ),
};

export const FIN_PARTS: Record<string, { file: string; anchor: [number, number] }> = {
  'fin-pectoral-dumbo': { file: 'fish/parts/fin-pectoral-dumbo.webp', anchor: [658 / 659, 455 / 785] },
};

const textures = new Map<string, Texture>();
const scenery = new Map<string, Texture>();

/** 開遊戲前載入素材。個別檔案失敗只會讓那張圖退回程式繪製，不會擋住遊戲。 */
export async function loadPaintedArt(base = import.meta.env.BASE_URL): Promise<number> {
  await Promise.all([
    ...Object.entries(PAINTED).map(async ([key, spec]) => {
      try {
        textures.set(key, await Assets.load<Texture>(`${base}art/${spec.file}`));
        if (spec.eating) textures.set(`${key}#eating`, await Assets.load<Texture>(`${base}art/${spec.eating}`));
      } catch {
        // 留給程式繪製版
      }
    }),
    ...Object.entries(PROPS).map(async ([key, file]) => {
      try {
        textures.set(key, await Assets.load<Texture>(`${base}art/${file}`));
      } catch {
        // 沒有圖就不畫殼
      }
    }),
    ...Object.entries(FIN_PARTS).map(async ([key, part]) => {
      try {
        textures.set(key, await Assets.load<Texture>(`${base}art/${part.file}`));
      } catch {
        // 改用程式畫的鰭
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
  if (!key) return null;
  return textures.get(key) ?? derivedTexture(key);
}

/** 這個鍵實際用到哪張圖：鰭型圖沒載入時退回花紋圖（PaintedRig 要用對應的身體範圍）。 */
export function resolvePaintedKey(key: string | null): string | null {
  if (!key || paintedTexture(key)) return key;
  const [base, rest] = key.split('~');
  const pat = patternBase(base);
  if (pat === base) return key;
  const alt = rest ? `${pat}~${rest}` : pat;
  return paintedTexture(alt) ? alt : key;
}

/** 依基因改色的衍生圖（「原圖~顏色」）：第一次用到時從原圖改色，之後重用。 */
function derivedTexture(key: string): Texture | null {
  const recipe = parseRecipeKey(key);
  const src = recipe && textures.get(recipe.base);
  if (!recipe || !src) return null;
  const img = src.source.resource as CanvasImageSource & { width: number; height: number };
  const { canvas, ctx } = makeCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolorImage(data.data, recipe);
  ctx.putImageData(data, 0, 0);
  const tex = canvasTexture(canvas);
  textures.set(key, tex);
  return tex;
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
  /** 蝦走路的快慢 0–1：步足交替擺動的幅度。 */
  walk = 0;
  private readonly mesh: MeshPlane;
  private readonly rest: Float32Array;
  private readonly spec: PaintedSpec;
  private readonly restTexture: Texture;
  private readonly eatingTexture: Texture | null;
  private rim: Mesh | null = null;
  private rimFill: ColorMatrixFilter | null = null;
  private rimColor = -1;
  private rimBlur: BlurFilter | null = null;
  private rimSoft: boolean | null = null;

  constructor(key: string, texture: Texture, readonly look: { alpha: number }) {
    super();
    const spec = PAINTED[key.split('~')[0]];
    this.spec = spec;
    const w = texture.width;
    const h = texture.height;
    this.lengthPx = w;
    this.drawsEggs = !!spec.eggs;
    this.restTexture = texture;
    this.eatingTexture = textures.get(`${key}#eating`) ?? null;
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

  /** 咬下去的那幾格換成張嘴的圖（只有原圖有這張時；改色的衍生圖照舊）。 */
  setMouthOpen(open: boolean): void {
    const tex = open ? this.eatingTexture : this.restTexture;
    if (tex && this.mesh.texture !== tex) this.mesh.texture = tex;
  }

  get heightPx(): number {
    return this.mesh.texture.height;
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
        // 蝦走路：最下面一排（步足）前後交替擺
        data[i] = this.walk > 0 && y >= h * 0.99 && x > w * 0.45 ? x + Math.sin(phase * 2.5 + x * 0.08) * this.walk * w * 0.03 : x;
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

  /**
   * 選取時的輪廓光（Glow ＋邊緣光）：同一份網格再畫一次，放大一點、填成單色、模糊，墊在魚的後面。
   * 共用網格，所以尾巴擺動時光也跟著擺。
   */
  setRim(color: number | null, alpha = 1, soft = true): void {
    if (color === null) {
      if (this.rim) this.rim.visible = false;
      return;
    }
    if (!this.rim) {
      const w = this.lengthPx;
      const h = this.mesh.texture.height;
      const k = 1.06;
      this.rim = new Mesh({ geometry: this.mesh.geometry, texture: this.mesh.texture });
      this.rim.scale.set(-k, k);
      this.rim.position.set((w / 2) * k, (-h / 2) * k);
      this.rimFill = new ColorMatrixFilter();
      this.addChildAt(this.rim, 0);
    }
    if (soft !== this.rimSoft) {
      // 低畫質不模糊，只剩一圈細細的邊緣光
      this.rimBlur ??= new BlurFilter({ strength: 5, quality: 2 });
      this.rim.filters = soft ? [this.rimFill!, this.rimBlur] : [this.rimFill!];
      this.rimSoft = soft;
    }
    if (color !== this.rimColor) {
      const r = ((color >> 16) & 255) / 255;
      const g = ((color >> 8) & 255) / 255;
      const b = (color & 255) / 255;
      // 不管原本的顏色，只保留形狀（alpha），填成單色
      this.rimFill!.matrix = [0, 0, 0, 0, r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 0, 0, 0, 1, 0];
      this.rimColor = color;
    }
    this.rim.visible = true;
    this.rim.alpha = alpha;
  }

  /** 死掉或生病時整條魚變灰。 */
  setDim(color: number | null): void {
    this.mesh.tint = color ?? 0xffffff;
  }
}
