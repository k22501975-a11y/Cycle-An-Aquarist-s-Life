import { isShrimpSpecies, lookVariant, phenotype } from '../sim';
import { BlurFilter, ColorMatrixFilter, Container, type DestroyOptions, Mesh, MeshPlane, Texture } from 'pixi.js';
import type { Fish, FishSpeciesId, GrowthStage, GuppyPhenotype, TankState } from '../sim';
import type { FishForm } from './fish-art';
import { canvasTexture, makeCanvas } from './paint';
import { FEMALE_TINTS, femaleTint, parseRecipeKey, patternBase, phenotypeRecipe, recolorImage, WHOLE_FINS } from './phenotype-art';

export { FEMALE_TINTS, femaleTint, type FemaleTint } from './phenotype-art';
import { guppyLook } from './strains';
import { RefLru } from './lru';
import { tankSubstrateLook } from './substrate';
import { rimLight, toneImage, toneKey } from './tone';

/** 邊緣光的強度（畫面評測 V15）。 */
const RIM_STRENGTH = 0.45;

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
  /** 圖寬是同一條魚基本款的幾倍（大三角、劍尾的鰭往後長，圖比較寬）：魚的大小照基本款算，鰭多出來的部分畫在外面。 */
  span?: number;
}

/** 公魚花紋圖的身體範圍：各張圖身體在圖裡的高度不一樣（上面留了背鰭的空間），y 照圖量過（#101：原本統一 0.02，大C 的鰭和白點都浮在背上方）。 */
const maleBody = (y: number) => ({ x: 0.14, y, rx: 0.2, ry: 0.12 });
const GUPPY_FEMALE_BODY = { x: 0.1, y: 0.02, rx: 0.3, ry: 0.22 };
const SHRIMP_BODY = { x: 0.08, y: -0.02, rx: 0.25, ry: 0.12 };
const ZEBRA_BODY = { x: 0.1, y: 0.0, rx: 0.3, ry: 0.11 };
const FRY_BODY = { x: 0.12, y: 0.0, rx: 0.25, ry: 0.1 };

export const PAINTED: Record<string, PaintedSpec> = {
  'guppy-male-bluegrass': { file: 'fish/guppy-male-bluegrass.webp', tail: 0.34, swing: 0.13, body: maleBody(0.14), eating: 'fish/guppy-male-bluegrass-eating.webp' },
  'guppy-male-cobra': { file: 'fish/guppy-male-cobra.webp', tail: 0.3, swing: 0.13, body: maleBody(0.16) },
  'guppy-male-albino-red': { file: 'fish/guppy-male-albino-red.webp', tail: 0.32, swing: 0.13, body: maleBody(0.155) },
  'guppy-male-tuxedo': { file: 'fish/guppy-male-tuxedo.webp', tail: 0.32, swing: 0.13, body: maleBody(-0.01) },
  'guppy-male-redcobra': { file: 'fish/guppy-male-redcobra.webp', tail: 0.32, swing: 0.13, body: maleBody(0.17) },
  ...finArt(),
  'guppy-fry': { file: 'fish/guppy-fry.webp', tail: 0.24, swing: 0.12, body: FRY_BODY },
  'zebrafish-male': { file: 'fish/zebrafish-male.webp', tail: 0.2, swing: 0.1, body: ZEBRA_BODY },
  'zebrafish-female': { file: 'fish/zebrafish-female.webp', tail: 0.2, swing: 0.09, body: ZEBRA_BODY },
  'guppy-female-base': { file: 'fish/guppy-female-base.webp', tail: 0.26, swing: 0.1, body: GUPPY_FEMALE_BODY, eating: 'fish/guppy-female-base-eating.webp' },
  'guppy-female-pregnant': { file: 'fish/guppy-female-pregnant.webp', tail: 0.24, swing: 0.09, body: GUPPY_FEMALE_BODY },
  ...femaleArt(),
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
  // 鬥魚（betta.ts）：公魚半月大尾，紅藍兩色；尾巴佔圖的四成，擺動慢而大
  'betta-male-red': { file: 'fish/betta-male-red.webp', tail: 0.42, swing: 0.1, body: { x: 0.16, y: 0.0, rx: 0.22, ry: 0.1 } },
  'betta-male-blue': { file: 'fish/betta-male-blue.webp', tail: 0.42, swing: 0.1, body: { x: 0.16, y: 0.0, rx: 0.22, ry: 0.1 } },
  'betta-fry': { file: 'fish/betta-fry.webp', tail: 0.3, swing: 0.14, body: { x: 0.2, y: 0.0, rx: 0.3, ry: 0.06 } },
  'betta-female': { file: 'fish/betta-female.webp', tail: 0.24, swing: 0.1, body: { x: 0.1, y: 0.0, rx: 0.3, ry: 0.11 } },
  // 水晶蝦：紅白相間（和極火蝦同樣的姿勢與身體範圍）
  'shrimp-crystal-male': { file: 'shrimp/shrimp-crystal-male.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
  'shrimp-crystal-female': { file: 'shrimp/shrimp-crystal-female.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
  'shrimp-crystal-berried': { file: 'shrimp/shrimp-crystal-berried.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY, eggs: true },
  'shrimp-crystal-juvenile': { file: 'shrimp/shrimp-crystal-juvenile.webp', tail: 0.18, swing: 0.03, body: SHRIMP_BODY },
};

/**
 * 鰭型的整條魚圖（5 種花紋各一張）。
 * 燕尾是從基本款改尾巴做的；緞帶、大三角、大C、劍尾由 scripts/art/guppy-fins.py 從基本款長出鰭，
 * 鰭的質感取自同一條魚的尾鰭（品系對照 design/guppy-strain-audit.md）。
 */
function finArt(): Record<string, PaintedSpec> {
  // 燕尾：身體中心 y（相對圖高）
  const swallowY: Record<string, number> = { bluegrass: -0.122, cobra: -0.073, 'albino-red': 0.147, tuxedo: -0.159, redcobra: 0.167 };
  // 其他鰭型：[span, tail, 身體中心 x, y, 身體半高 ry]（guppy-fins.py 印出來的，ry 照基本款 0.12 換算圖高）
  const grown: Record<string, Record<string, [number, number, number, number, number]>> = {
    bluegrass: { ribbon: [0.947, 0.346, 0.12, -0.234, 0.121], halfmoon: [0.992, 0.374, 0.137, -0.022, 0.079], bigc: [0.947, 0.346, 0.12, 0.02, 0.162], sword1: [1.123, 0.442, 0.179, -0.011, 0.222], sword2: [1.123, 0.442, 0.179, -0.011, 0.222], sword3: [1.123, 0.442, 0.179, -0.011, 0.222] },
    cobra: { ribbon: [0.99, 0.333, 0.136, -0.222, 0.119], halfmoon: [1.057, 0.373, 0.159, -0.013, 0.08], bigc: [0.99, 0.333, 0.136, -0.003, 0.182], sword1: [1.195, 0.441, 0.199, 0.033, 0.229], sword2: [1.195, 0.441, 0.199, 0.033, 0.229], sword3: [1.195, 0.441, 0.199, 0.033, 0.229] },
    'albino-red': { ribbon: [0.99, 0.348, 0.136, -0.019, 0.088], halfmoon: [1.029, 0.372, 0.15, -0.018, 0.083], bigc: [0.99, 0.348, 0.136, 0.165, 0.12], sword1: [1.164, 0.44, 0.191, 0.196, 0.127], sword2: [1.164, 0.44, 0.191, 0.196, 0.127], sword3: [1.164, 0.44, 0.191, 0.196, 0.127] },
    tuxedo: { ribbon: [0.955, 0.347, 0.123, -0.252, 0.109], halfmoon: [0.994, 0.372, 0.138, -0.052, 0.07], bigc: [0.955, 0.347, 0.123, -0.033, 0.129], sword1: [1.125, 0.44, 0.18, -0.048, 0.196], sword2: [1.125, 0.44, 0.18, -0.039, 0.2], sword3: [1.125, 0.44, 0.18, -0.039, 0.2] },
    redcobra: { ribbon: [0.967, 0.326, 0.128, -0.044, 0.082], halfmoon: [1.053, 0.378, 0.158, -0.013, 0.075], bigc: [0.967, 0.326, 0.128, 0.161, 0.117], sword1: [1.191, 0.445, 0.198, 0.225, 0.13], sword2: [1.191, 0.445, 0.198, 0.225, 0.13], sword3: [1.191, 0.445, 0.198, 0.225, 0.13] },
  };
  const out: Record<string, PaintedSpec> = {};
  for (const [pat, y] of Object.entries(swallowY)) {
    const key = `guppy-male-${pat}-swallow`;
    out[key] = { file: `fish/${key}.webp`, tail: 0.34, swing: 0.12, body: { x: 0.16, y, rx: 0.2, ry: 0.1 } };
    for (const [fin, [span, tail, x, by, ry]] of Object.entries(grown[pat])) {
      const k = `guppy-male-${pat}-${fin}`;
      out[k] = { file: `fish/${k}.webp`, tail, swing: 0.12, span, body: { x, y: by, rx: 0.2 / span, ry } };
    }
  }
  return out;
}


/** 有基因的母孔雀魚：尾巴帶品系色的圖。 */
export function femaleKey(p: GuppyPhenotype, gravid: boolean): string {
  return `guppy-female-${gravid ? 'pregnant' : 'base'}-${femaleTint(p)}`;
}

function femaleArt(): Record<string, PaintedSpec> {
  const out: Record<string, PaintedSpec> = {};
  for (const t of FEMALE_TINTS) {
    out[`guppy-female-base-${t}`] = { file: `fish/guppy-female-base-${t}.webp`, tail: 0.26, swing: 0.1, body: GUPPY_FEMALE_BODY, eating: `fish/guppy-female-base-${t}-eating.webp` };
    out[`guppy-female-pregnant-${t}`] = { file: `fish/guppy-female-pregnant-${t}.webp`, tail: 0.24, swing: 0.09, body: GUPPY_FEMALE_BODY };
  }
  return out;
}

/** 品系名稱 → 素材。沒列到的品系用程式繪製版。 */
const GUPPY_MALE_ART: Record<string, string> = {
  藍草尾: 'guppy-male-bluegrass',
  黃金蛇王: 'guppy-male-cobra',
  全紅白子: 'guppy-male-albino-red',
  藍尾禮服: 'guppy-male-tuxedo',
  紅蛇王: 'guppy-male-redcobra',
};

/** 這條魚該用哪張精繪圖；沒有就回傳 null（還沒畫的品系）。 */
export function paintedKey(species: FishSpeciesId, form: FishForm, variant: number, gravid: boolean, stage?: GrowthStage, stuckMolt = false): string | null {
  if (species === 'crystal_shrimp') {
    if (stuckMolt) return 'shrimp-molt-stuck';
    if (form === 'juvenile') return 'shrimp-crystal-juvenile';
    if (form === 'female') return gravid ? 'shrimp-crystal-berried' : 'shrimp-crystal-female';
    return 'shrimp-crystal-male';
  }
  if (isShrimpSpecies(species)) {
    // 卡殼死掉的蝦：身上一圈白線
    if (stuckMolt) return 'shrimp-molt-stuck';
    if (stage === 'subadult' && form === 'juvenile') return 'shrimp-cherry-subadult';
    if (form === 'juvenile') return stage === 'subadult' ? 'shrimp-cherry-subadult' : 'shrimp-cherry-juvenile';
    if (form === 'female') return gravid ? 'shrimp-cherry-berried' : 'shrimp-cherry-female';
    return 'shrimp-cherry-male';
  }
  // 鬥魚：公魚紅藍兩色（跟著個體固定）；剛孵出來是大眼、細長半透明的仔魚，長大一點先像母魚
  if (species === 'betta') return form === 'juvenile' ? (stage && stage !== 'fry' ? 'betta-female' : 'betta-fry') : form === 'female' ? 'betta-female' : variant % 2 === 1 ? 'betta-male-blue' : 'betta-male-red';
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
  'plant-eleocharis': 'scape/plant-eleocharis.webp',
  'plant-glosso': 'scape/plant-glosso.webp',
  'plant-hydrocotyle': 'scape/plant-hydrocotyle.webp',
  'plant-moss': 'scape/plant-moss.webp',
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
  // 缸內設備（原本只有程式畫的細線輪廓）
  'gear-heater': 'gear/heater.webp',
  'gear-heater-scene': 'gear/heater-scene.webp',
  'gear-intake': 'gear/intake-scene.webp',
  'gear-sponge': 'gear/sponge-filter.webp',
  // 育幼盒（#187）：背板畫在魚後面、正面畫在魚前面，盒裡的魚夾在中間
  'nursery-back': 'gear/nursery-box-back.webp',
  'nursery-front': 'gear/nursery-box-front.webp',
  // 螺（design/snails.md）
  ...Object.fromEntries(
    ['snail-apple-gold', 'snail-apple-blue', 'snail-apple-purple', 'snail-apple-ivory', 'snail-apple-babies', 'snail-apple-eggs', 'snail-nerite-zebra', 'snail-assassin', 'snail-ramshorn-red', 'snail-bladder', 'snail-mts'].map((k) => [k, `snail/${k}.webp`]),
  ),
};

export const FIN_PARTS: Record<string, { file: string; anchor: [number, number] }> = {
  'fin-pectoral-dumbo': { file: 'fish/parts/fin-pectoral-dumbo.webp', anchor: [486 / 520, 70 / 440] },
};

const textures = new Map<string, Texture>();
const scenery = new Map<string, Texture>();
/** 調色快取最多留幾張；超過時把最久沒用、也沒有魚在用的圖釋放掉（GPU 記憶體）。 */
export const TONED_MAX = 64;
const toned = new RefLru<string, Texture>(TONED_MAX, (t) => t.destroy(true));

/** 每個素材的鍵、檔案和放進哪個快取（精繪魚蝦、小道具、單片鰭、造景）。 */
export const ART_FILES: { key: string; file: string; scenery: boolean }[] = [
  ...Object.entries(PAINTED).flatMap(([key, spec]) => [
    { key, file: spec.file, scenery: false },
    ...(spec.eating ? [{ key: `${key}#eating`, file: spec.eating, scenery: false }] : []),
  ]),
  ...Object.entries(PROPS).map(([key, file]) => ({ key, file, scenery: false })),
  ...Object.entries(FIN_PARTS).map(([key, part]) => ({ key, file: part.file, scenery: false })),
  ...Object.entries(SCENERY).map(([key, file]) => ({ key, file, scenery: true })),
];

/** 各魚種會用到哪些圖（斑馬魚的仔魚、幼魚共用孔雀魚的圖；蝦都會脫殼）。公孔雀魚的花紋圖另外看缸裡有哪幾種（guppyMaleArt）。 */
const SPECIES_ART: Record<FishSpeciesId, RegExp> = {
  guppy: /^(guppy-(fry|juvenile|female-(base|pregnant)(#eating)?$)|fin-)/,
  zebrafish: /^(zebrafish-|guppy-fry$|guppy-juvenile$)/,
  cherry_shrimp: /^shrimp-(cherry-|molt)/,
  crystal_shrimp: /^shrimp-(crystal-|molt)/,
  betta: /^betta-/,
  apisto: /^apisto-/,
};

/**
 * 開機先載哪些圖（Issue #81）：只要這些缸現在畫得到的，其他的進遊戲後在背景慢慢載。
 * 新遊戲只有缸背景、設備和底沙幾張，不用等全部 4MB。
 */
export function startupArt(tanks: TankState[]): Set<string> {
  // 缸背景、中景和缸內設備（加熱棒、海綿過濾器）每缸都看得到
  const want: RegExp[] = [/^bg-back$/, /^mid-/, /^gear-/];
  for (const t of tanks) {
    const look = tankSubstrateLook(t.equipment.substrate);
    if (look !== 'bare') want.push(new RegExp(`^sub-${look}-`));
    for (const f of t.fish) {
      want.push(SPECIES_ART[f.species]);
      const male = f.species === 'guppy' && f.sex === 'male' && guppyMaleArt(f);
      if (male) want.push(new RegExp(`^${male}(-(${WHOLE_FINS.join('|')}))?(#eating)?$`));
      // 母魚也只先載缸裡有的尾色（架構審查 #274：4 色 × 一般、懷孕全載約 530 KB）
      if (f.species === 'guppy' && f.sex === 'female' && f.genome) want.push(new RegExp(`^guppy-female-(base|pregnant)-${femaleTint(phenotype(f.genome))}(#eating)?$`));
    }
    for (const p of t.plants) want.push(new RegExp(`^plant-${p.species}$`));
    if (t.equipment.hardscape?.length) want.push(/^(rock|wood)-/);
    if (t.nurseryBox) want.push(/^nursery-/);
    const sn = t.snails;
    if (sn && (sn.snails.length || sn.clutches.length || sn.appleYoung || Object.values(sn.pests).some((n) => n > 0))) want.push(/^snail-/);
  }
  return new Set(ART_FILES.map((a) => a.key).filter((k) => want.some((re) => re.test(k))));
}

/**
 * 這尾公孔雀魚用哪張花紋圖（不含鰭型後綴）：照基因上色的看配方，沒有基因的看品系。
 * 開機只先載缸裡有的花紋（G6：一個品系的缸不用等 5 種花紋 × 4 種鰭型的圖），其他的進遊戲後在背景載。
 */
function guppyMaleArt(f: Fish): string | null {
  if (f.genome) return patternBase(phenotypeRecipe(phenotype(f.genome)).base);
  return paintedKey('guppy', 'male', lookVariant(f), false);
}

/**
 * 載一張圖成貼圖。不用 Pixi 的 Assets：它會連帶打包點陣字、SVG、影片、網頁字型的載入器（合計少約 20 KB gzip，
 * docs/performance-budget.md §3），我們只載 webp。
 */
async function loadTexture(url: string): Promise<Texture> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return Texture.from(img);
}

/** 已經試著載過的圖（成功或失敗都算，不重複載）。 */
const attempted = new Set<string>();
let version = 0;

/**
 * 載入素材：給了 only 就只載那些，沒給就載剩下全部。個別檔案失敗只會讓那張圖退回程式繪製，不會擋住遊戲。
 * 新圖載好後版本號加一，畫面看到版本變了就把退回程式繪製的魚、水草、場景重畫成精繪圖。
 */
export async function loadPaintedArt(only?: Set<string>, base = import.meta.env.BASE_URL): Promise<number> {
  const todo = ART_FILES.filter((a) => !attempted.has(a.key) && (!only || only.has(a.key)));
  for (const a of todo) attempted.add(a.key);
  let loaded = 0;
  await Promise.all(
    todo.map(async (a) => {
      try {
        (a.scenery ? scenery : textures).set(a.key, await loadTexture(`${base}art/${a.file}`));
        loaded++;
      } catch {
        // 留給程式繪製版
      }
    }),
  );
  if (loaded > 0) version++;
  return loaded;
}

/** 素材版本：每載好一批新圖就加一。 */
export function paintedArtVersion(): number {
  return version;
}

export function paintedTexture(key: string | null): Texture | null {
  if (!key) return null;
  return textures.get(key) ?? derivedTexture(key);
}

/** 這個鍵實際用到哪張圖：鰭型圖沒載入時退回花紋圖（PaintedRig 要用對應的身體範圍）。 */
export function resolvePaintedKey(key: string | null): string | null {
  if (!key || paintedTexture(key)) return key;
  // 母魚的品系色圖還沒載好：先用素的母魚
  const female = /^(guppy-female-(?:base|pregnant))-[a-z]+$/.exec(key);
  if (female) return paintedTexture(female[1]) ? female[1] : key;
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
  recolorImage(data.data, recipe, canvas.width);
  ctx.putImageData(data, 0, 0);
  const tex = canvasTexture(canvas);
  textures.set(key, tex);
  return tex;
}

/**
 * 套上色調的圖（「原圖@飽和度:亮度」）：第一次用到時算一次，之後所有同樣的魚共用（I1 貼圖快取）。
 * 取代每條魚各掛一個 ColorMatrixFilter（每格都要離屏重畫）。
 */
export function tonedTexture(key: string, sat: number, bright: number, eating = false): Texture | null {
  const base = eating ? (textures.get(`${key}#eating`) ?? null) : paintedTexture(key);
  if (!base) return base;
  const cacheKey = tonedKey(key, sat, bright, eating);
  const hit = toned.get(cacheKey);
  if (hit) return hit;
  const img = base.source.resource as CanvasImageSource & { width: number; height: number };
  const { canvas, ctx } = makeCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  toneImage(data.data, sat, bright);
  // 背上的邊緣光，厚度約圖高的 2%
  rimLight(data.data, canvas.width, canvas.height, Math.max(2, Math.round(canvas.height * 0.02)), RIM_STRENGTH);
  ctx.putImageData(data, 0, 0);
  return toned.add(cacheKey, canvasTexture(canvas));
}

function tonedKey(key: string, sat: number, bright: number, eating: boolean): string {
  return `${key}${eating ? '#eating' : ''}@${toneKey(sat, bright)}`;
}

/**
 * 每一格最多幾條魚新調色（G6）：調色要在 CPU 上逐點算，開機那一格十幾條魚一起調，主畫面要晚將近一秒才出來。
 * 還沒輪到的魚先用原圖，下一格再調（開機時開場動畫正在淡出，看不出來）。
 */
export const TONE_PER_FRAME = 2;
let toneBudget = TONE_PER_FRAME;

/** 新的一格開始（TankView.update 呼叫），調色的額度補滿。 */
export function newToneFrame(): void {
  toneBudget = TONE_PER_FRAME;
}

/** 快取裡有幾張貼圖（開發者數值、測試用）。 */
export function textureCacheStats(): { painted: number; toned: number } {
  return { painted: textures.size, toned: toned.size };
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
  /** 魚的長度（貼圖像素）：鰭比較長的圖照基本款的大小算，鰭多出來的部分畫在外面。 */
  readonly lengthPx: number;
  private readonly texW: number;
  readonly drawsEggs: boolean;
  /** 蝦走路的快慢 0–1：步足交替擺動的幅度。 */
  walk = 0;
  private readonly mesh: MeshPlane;
  private readonly rest: Float32Array;
  private readonly spec: PaintedSpec;
  private readonly key: string;
  private restTexture: Texture;
  private eatingTexture: Texture | null;
  /** 正在用的調色圖（快取用引用計數判斷能不能釋放）。 */
  private tonedRest: Texture | null = null;
  private tonedEating: Texture | null = null;
  /** 張嘴的圖疊在上面淡入淡出（不是直接換圖，換圖看起來像兩張圖在閃）。 */
  private mouthMesh: Mesh | null = null;
  private mouthOpen = 0;
  private tone = '0:1';
  private rim: Mesh | null = null;
  private rimFill: ColorMatrixFilter | null = null;
  private rimColor = -1;
  private rimBlur: BlurFilter | null = null;
  private rimSoft: boolean | null = null;

  constructor(key: string, texture: Texture, readonly look: { alpha: number }) {
    super();
    const spec = PAINTED[key.split('~')[0]];
    this.spec = spec;
    this.key = key;
    const w = texture.width;
    const h = texture.height;
    this.texW = w;
    this.lengthPx = w / (spec.span ?? 1);
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

  /**
   * 張嘴的程度 0–1：張嘴的圖疊在原圖上面、跟著咬的動作淡入淡出（只有原圖有這張時）。
   * 兩張圖共用同一個網格，所以身體擺動完全一致，不會像兩張圖在交替。
   */
  setMouthOpen(open: number | boolean): void {
    const a = typeof open === 'boolean' ? (open ? 1 : 0) : Math.max(0, Math.min(1, open));
    this.mouthOpen = a;
    const tex = this.eatingTexture;
    if (!tex || a <= 0.01) {
      if (this.mouthMesh) this.mouthMesh.visible = false;
      this.mesh.alpha = 1;
      return;
    }
    if (!this.mouthMesh) {
      this.mouthMesh = new Mesh({ geometry: this.mesh.geometry, texture: tex });
      this.mouthMesh.scale.copyFrom(this.mesh.scale);
      this.mouthMesh.position.copyFrom(this.mesh.position);
      this.addChildAt(this.mouthMesh, this.getChildIndex(this.mesh) + 1);
    }
    if (this.mouthMesh.texture !== tex) this.mouthMesh.texture = tex;
    this.mouthMesh.tint = this.mesh.tint;
    this.mouthMesh.visible = true;
    this.mouthMesh.alpha = a;
    // 快全開時才把閉嘴的圖淡掉，嘴巴的缺口才看得到；中間只有一瞬間兩張都半透明
    const k = Math.max(0, Math.min(1, (a - 0.6) / 0.4));
    this.mesh.alpha = 1 - k * k * (3 - 2 * k);
  }

  /** 色調（飽和度、亮度）：換成快取裡調好色的圖，不用濾鏡。這一格的調色額度用完、又要新調的話回 false，下一格再呼叫。 */
  setTone(sat: number, bright: number): boolean {
    const tone = `${sat}:${bright}`;
    if (tone === this.tone) return true;
    const cached = toned.get(tonedKey(this.key, sat, bright, false)) && (!textures.has(`${this.key}#eating`) || toned.get(tonedKey(this.key, sat, bright, true)));
    if (!cached) {
      if (toneBudget <= 0) return false;
      toneBudget--;
    }
    this.tone = tone;
    // 拿到就先 retain，再拿下一張：不然建吃東西那張時，剛拿到的 rest 可能被清掉
    const rest = tonedTexture(this.key, sat, bright);
    toned.retain(rest);
    const eating = textures.has(`${this.key}#eating`) ? tonedTexture(this.key, sat, bright, true) : null;
    toned.retain(eating);
    toned.release(this.tonedRest);
    toned.release(this.tonedEating);
    this.tonedRest = rest;
    this.tonedEating = eating;
    this.restTexture = rest ?? this.restTexture;
    this.eatingTexture = eating;
    if (this.mesh.texture !== this.restTexture) this.mesh.texture = this.restTexture;
    this.setMouthOpen(this.mouthOpen);
    return true;
  }

  override destroy(options?: DestroyOptions): void {
    toned.release(this.tonedRest);
    toned.release(this.tonedEating);
    this.tonedRest = null;
    this.tonedEating = null;
    super.destroy(options);
  }

  get heightPx(): number {
    return this.mesh.texture.height;
  }

  /** 跟 FishRig.animate 一樣的參數：相位、擺幅、夾鰭、鰭破損。 */
  animate(phase: number, swing: number, fold = 1, damage = 0): void {
    const w = this.texW;
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
      const w = this.texW;
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
    if (this.mouthMesh) this.mouthMesh.tint = this.mesh.tint;
  }
}
