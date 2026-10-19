import { Application, BlurFilter, ColorMatrixFilter, Container, FederatedPointerEvent, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { isShrimpSpecies, FISH_SPECIES, PLANT_SPECIES, colorProgress, isGuarding, PARENTAL, growthStage, isCo2Injecting, isJuvenile, isLightOn, sexVisible, lookVariant, observeSymptoms, personalitySpec, phenotype, plantPlacement, sizeRatio, tankSize, type Fish, type TankState, type TestKitReading } from '../sim';
import { appearance, FishRig, type FishForm } from './fish-art';
import { PaintedRig, paintedArtVersion, paintedKey, paintedTexture, resolvePaintedKey } from './painted';
import { SETUP_SECONDS, setupLook, setupStepAt, type SetupStep } from './setup-show';
import { DEATH_SECONDS, POKE_SECONDS, STARTLE_SECONDS, deathPose, hungerLook, sickLook, spawnSwimmer, stepTurn, swimTilt, turnScale, updateSwimmer, type Swimmer, type TurnState } from './fish-motion';
import { floorAt, pxPerCm, sceneBounds, type Insets, type TankBounds } from './layout';
import { dirtSpots, floorY, frontLip, sandSurface, tankSubstrateLook, SUBSTRATE_PALETTES, type SubstrateLook } from './substrate';
import { celebrateFrame, CELEBRATE_SECONDS, sparkleAlpha, sparkleBurst, type Sparkle } from './celebrate';
import { applyFoodLook, BITE_SECONDS, biteKick, biteMotion, frenzyLevel, visiblePellets, mouthOpenness, pickEaten, pickFoodKind, ripple, RIPPLE_SECONDS, scatterPellets, stepPellet, type FoodLook, type Mouth, type Pellet } from './feeding';
import { canvasTexture, flakeTextures, spotlightTexture, makeCanvas, mix, pelletTextures, softDotTexture, tabletTexture, wormTextures } from './paint';
import { cuttingsFromDrop, inferFraction, kitColor, tubeFrame, waterChangeFrame, TEST_SECONDS, WATER_CHANGE_SECONDS, type KitParam } from './ops-fx';
import { PlantMesh } from './plant-sway';
import { SnailView } from './snail-view';
import { LAYER_LOOK, ScapeView, type Rect, type ScapeEdit, type ScapeTarget } from './scape-view';
import { clawPose, clawRate, pleopods, type Pt } from './shrimp-limbs';
import { phenotypeRecipe, recipeKey } from './phenotype-art';
import { drawFinOverlay, finTraitsOf } from './fin-render';
import { quantizeTone } from './tone';
import { clampPan, fitCamera, maxSpan, zoomAt, type Camera } from './camera';
import { type QualitySpec, qualitySpec } from './quality';
import { causticsTexture, MOCKUP_PX_PER_CM, paintBackdrop, paintDriftwood, paintFront, paintPlant, paintVignette, rayTexture } from './scenery';

interface FoodParticle extends Pellet {
  s: Sprite;
}

/** 魚咬到飼料時噴出的碎屑。 */
interface Crumb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
}

interface PlantView {
  /** 放在種植位置（根部）；網格掛在底下。 */
  holder: Container;
  rig: PlantMesh | null;
  /** 上次重畫時的狀態，變化夠大才重畫。 */
  drawnBiomass: number;
  drawnAlgae: number;
  drawnMelting: boolean;
  /** 畫這張貼圖時的解析度（畫質改了要重畫）。 */
  drawnRes: number;
  /** 上一格的生物量（判斷是不是剛剪過）。 */
  seenBiomass: number;
}

/** 剪下來的插枝：往上飄、慢慢淡出（玩家把它撈起來）。 */
interface Cutting {
  s: Sprite;
  vx: number;
  vy: number;
  spin: number;
  t: number;
}

const TUBES: Array<{ param: KitParam; label: string }> = [
  { param: 'ph', label: 'pH' },
  { param: 'ammonia', label: '氨' },
  { param: 'nitrite', label: '亞硝' },
  { param: 'nitrate', label: '硝酸' },
];
const CUTTING_SECONDS = 2.6;

interface FishView {
  swimmer: Swimmer;
  /** 放在缸內座標，不縮放（光暈畫在這裡）。 */
  holder: Container;
  /** 魚本體：依大小、景深縮放，面向左右時水平翻轉。 */
  rig: FishRig | PaintedRig;
  rigKey: string;
  glow: Sprite;
  spots: Graphics;
  eggs: Graphics;
  ichDrawn: boolean;
  eggsDrawn: boolean;
  /** 景深 0（最遠）– 1（最近），慢慢游來游去。 */
  z: number;
  zTarget: number;
  back: boolean;
  /** 死了幾秒（-1 還活著）。讀檔時已經死的魚直接用演完的姿勢。 */
  deathT: number;
  /** 咬一口後過了幾秒。 */
  biteT: number;
  /** 上一格的嘴巴位置，判斷飼料是誰吃掉的（死魚為 null）。 */
  mouth: Mouth | null;
  /** 轉身中的面向（壓扁再彈回）。 */
  turn: TurnState;
  /** 蝦的小螯與腹足（程式畫的細線）。 */
  limbs: Graphics | null;
  /** 目前套用的發色加成（分四段，變了才換濾鏡）。 */
  /** 目前套用的色調（發色加成、轉色、老魚褪色），變了才重建濾鏡。 */
  tone: string;
}

interface Mote {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

interface Ray {
  s: Sprite;
  x: number;
  phase: number;
}

export interface TankViewEvents {
  onSelectFish?: (id: number | null) => void;
  onSelectPlant?: (id: number) => void;
  /** 造景模式：點選、放開拖曳的物件（x 是 0–1 的橫向位置）。 */
  onScapeSelect?: (target: ScapeTarget | null) => void;
  onScapeDrop?: (target: ScapeTarget, x: number) => void;
  /** 開缸演出進到下一步（放音效、說明字）。 */
  onSetupStep?: (step: SetupStep) => void;
  /** 玩家撒的這一把飼料，第一口被這尾魚吃到（F6：看得出誰貪吃）。 */
  onFirstBite?: (fishId: number) => void;
}

/** 魚畫得比真實比例大一些（遊戲裡要看得清楚品系花紋）。 */
const EXAGGERATION: Record<string, number> = { guppy: 1.8, zebrafish: 1.6, cherry_shrimp: 1.8, apisto: 1.5, betta: 1.5, crystal_shrimp: 1.8 };
/** 景深切換的門檻（有緩衝，避免在兩層之間跳來跳去）。 */
const BACK_ENTER = 0.3;
const BACK_LEAVE = 0.4;

/**
 * 水缸畫面（精緻插畫風，design/art-style.md §0.4）：只讀取 TankState 來繪圖，不修改模擬狀態。
 *
 * 圖層（後 → 前）：
 *   後景（低解析度的遠山與水草，自然模糊）→ 遠層的魚（模糊、偏藍）→ 沉木 → 水草 → 石頭＋底沙
 *   → 焦散光紋（加法混色）→ 缸內設備 → 飼料 → 近層的魚 → 氣泡 → 懸浮粒子 → 光束 → 濁度、夜晚 → 暗角。
 * 缸撐滿整個畫面；狀態列與按鈕列是半透明卡片，浮在畫面上（setInsets 告訴畫面它們佔了多少）。
 */
export class TankView {
  readonly root = new Container();
  /** 魚的肖像快取（rigSpec 的 key → 圖）。 */
  private readonly portraits = new Map<string, string | null>();
  private readonly backdrop = new Sprite();
  private readonly backFish = new Container();
  private readonly driftwood = new Sprite();
  /** 造景三層（石頭、沉木、水草）與造景模式的輔助線。 */
  private readonly scape = new ScapeView();
  /** 造景模式正在拖的物件：按下時跟物件中心的距離。 */
  private scapeDrag: { target: ScapeTarget; offset: number; startX: number; moved: boolean } | null = null;
  private readonly front = new Sprite();
  private readonly causticsLayer = new Container();
  private readonly causticsA: TilingSprite;
  private readonly causticsB: TilingSprite;
  private readonly causticsMask = new Sprite();
  private readonly gear = new Graphics();
  /** 有插圖的設備（加熱棒、海綿過濾器）；沒載入就退回程式畫。 */
  private readonly gearArt = { heater: new Sprite(), sponge: new Sprite(), intake: new Sprite() };
  private readonly gearArtLayer = new Container();
  private readonly gearGlow = new Container();
  private readonly foodLayer = new Container();
  /** 水面漣漪與碎屑，每格重畫。 */
  private readonly feedFx = new Graphics();
  private readonly frontFish = new Container();
  private readonly bubbleLayer = new Graphics();
  private readonly moteLayer = new Container();
  private readonly rayLayer = new Container();
  /** 換水、測水、修剪的演出。 */
  private readonly opsFx = new Graphics();
  private readonly cuttingLayer = new Container();
  /** 生小魚的特寫：周圍暗下來，亮點和光環。 */
  private readonly spot = new Sprite();
  private readonly partyFx = new Graphics();
  private party: { id: number; t: number; sparks: Sparkle[] } | null = null;
  private readonly tubeLabels = new Container();
  /** 大缸滑動時的位置條（固定在畫面上）。 */
  private readonly scrollBar = new Graphics();
  private readonly overlay = new Graphics();
  private readonly vignette = new Sprite();
  /** 開缸演出：空缸時蓋住水的空氣色（畫在後景上、底沙下）、霧濁和倒沙（畫在最上面）、底沙由下往上露出的遮罩。 */
  private readonly setupBack = new Graphics();
  private readonly setupFx = new Graphics();
  private readonly sandMask = new Graphics();
  private setupT = -1;

  private insets: Insets = { top: 0, bottom: 0 };
  private bounds: TankBounds;
  /** 每公分幾像素（鏡頭）。 */
  private ppc = 10;
  /** 相對示意圖的鏡頭倍率：造景、設備的大小。 */
  private hs = 1;
  private sceneKey = '';
  /** 畫面用到的素材版本：背景載好新圖後，退回程式繪製的魚、水草、場景改畫成精繪圖。 */
  private artVersion = paintedArtVersion();
  private readonly depthBlur = new BlurFilter({ strength: 2.5, quality: 2 });
  private quality: QualitySpec = qualitySpec('high', 2);
  private fish = new Map<number, FishView>();
  private plants = new Map<number, PlantView>();
  private food: FoodParticle[] = [];
  /** 上次撒飼料過了幾秒（魚搶食的熱度）；-1 還沒撒過。 */
  private dropT = -1;
  /** 夜晚的程度 0（開燈）～1（關燈），慢慢轉換。 */
  private night = 0;
  private cuttings: Cutting[] = [];
  /** 換水演出進行了幾秒（-1 沒在演）與這次換掉的比例。 */
  private wcT = -1;
  private wcFrac = 0.3;
  private testT = -1;
  private testReading: TestKitReading | null = null;
  private snips: Array<{ x: number; y: number; t: number }> = [];
  /** 上一格看到的狀態，用來發現玩家剛換水、測水。 */
  private seenState: TankState | null = null;
  private seenWc = -1;
  private seenNo3 = 0;
  private seenTest = -1;
  /** 鏡頭（90 cm 以上的缸可以左右滑、縮放）。 */
  private cam: Camera = { span: 1, pan: 0 };
  private camTankW = -1;
  private maxSpan = 1;
  /** 最近一次滑動、縮放的時間（位置條顯示一下再淡出）。 */
  private camMovedAt = -10;
  /** 這次按下後拖動過，放開時不算點選。 */
  private dragged = false;
  private ripples: Array<{ x: number; t: number }> = [];
  /** 手指點水裡空白處（F6）：好奇的魚游過來看，點的地方泛一圈水波。 */
  private poke: { x: number; y: number; age: number; seq: number } | null = null;
  /** 玩家剛撒飼料，還沒有魚吃到第一口。 */
  private firstBitePending = false;
  private crumbs: Crumb[] = [];
  /** 黏缸壁錠貼在玻璃上的位置；t 記一開始有幾顆碎屑，越吃越小。 */
  private tablet: { x: number; y: number; t: number } | null = null;
  private tabletSprite: Sprite | null = null;
  /** 飼料剛因重新排版清空：補回去時不演撒飼料。 */
  private foodReset = true;
  private look: SubstrateLook = 'sand';
  /** 沙面髒點：重畫的依據（數量、版面）。 */
  private dirtKey = '';
  private readonly dirt = new Graphics();
  /** 蝦脫下來的殼：半透明的空殼躺在沙面上，一兩天後被吃掉（淡出）。 */
  private readonly moltLayer = new Container();
  private readonly moltSprites = new Map<string, Sprite>();
  private readonly snails = new SnailView();
  private lastFoodMg = 0;
  private bubbles: Bubble[] = [];
  /** 公鬥魚的泡巢：魚 id → 泡巢的水平位置和大小（0–1，吐越久越大）。 */
  private nests = new Map<number, { x: number; size: number }>();
  private motes: Mote[] = [];
  private rays: Ray[] = [];
  private selectedFish: number | null = null;
  private seed = 12345;
  private time = 0;

  /** 繪圖解析度（裝置像素比），預先畫好的貼圖照這個倍率畫才不會糊。 */
  private get pixelRatio(): number {
    return this.app.renderer.resolution;
  }

  constructor(private readonly app: Application, private readonly events: TankViewEvents = {}) {
    this.bounds = sceneBounds(app.screen.width, app.screen.height, this.insets);
    const tex = causticsTexture();
    this.causticsA = new TilingSprite({ texture: tex, width: 10, height: 10 });
    this.causticsB = new TilingSprite({ texture: tex, width: 10, height: 10 });
    for (const c of [this.causticsA, this.causticsB]) c.blendMode = 'add';
    this.causticsLayer.addChild(this.causticsA, this.causticsB, this.causticsMask);
    // 遠層的魚：模糊、偏藍、淡一點（後景模糊）
    this.backFish.filters = [this.depthBlur];
    this.backFish.alpha = 0.75;
    this.backFish.tint = 0xa9d4e2;
    this.moteLayer.blendMode = 'add';
    this.rayLayer.blendMode = 'add';
    this.gearGlow.blendMode = 'add';
    this.root.addChild(
      this.backdrop,
      this.setupBack,
      this.scape.rocks.back,
      this.scape.plants.back,
      this.backFish,
      this.driftwood,
      this.scape.rocks.mid,
      this.scape.plants.mid,
      this.scape.rocks.front,
      this.scape.plants.front,
      this.front,
      this.dirt,
      this.moltLayer,
      this.snails.layer,
      this.causticsLayer,
      this.gearArtLayer,
      this.gear,
      this.gearGlow,
      this.foodLayer,
      this.feedFx,
      this.frontFish,
      this.bubbleLayer,
      this.moteLayer,
      this.rayLayer,
      this.cuttingLayer,
      this.opsFx,
      this.spot,
      this.partyFx,
      this.tubeLabels,
      this.overlay,
      this.setupFx,
      this.sandMask,
      this.scape.overlay,
      this.vignette,
      this.scrollBar,
    );
    this.root.eventMode = 'static';
    this.root.on('pointertap', (e: FederatedPointerEvent) => {
      if (this.dragged) return;
      if (this.scape.editing) return;
      const p = e.getLocalPosition(this.root);
      this.handleTap(p.x, p.y);
    });
    app.renderer.on('resize', () => (this.sceneKey = ''));
    this.bindCameraInput(app.canvas);
  }

  /** 狀態列與按鈕列蓋住的高度（像素）。 */
  setInsets(insets: Insets): void {
    if (insets.top === this.insets.top && insets.bottom === this.insets.bottom) return;
    this.insets = insets;
    this.sceneKey = '';
  }

  /** 換畫質：濾鏡馬上換，粒子數量在下一次重新排版時重算。 */
  setQuality(spec: QualitySpec): void {
    this.quality = spec;
    this.backFish.filters = spec.depthBlur ? [this.depthBlur] : [];
    this.causticsB.visible = spec.doubleCaustics;
    this.sceneKey = '';
  }

  selectFish(id: number | null): void {
    this.selectedFish = id;
  }

  /** 某條魚在畫面上的位置（像素，相對畫布左上角）；找不到就回傳 null。 */
  fishScreenPos(id: number): { x: number; y: number } | null {
    const view = this.fish.get(id);
    if (!view) return null;
    const p = view.holder.getGlobalPosition();
    return { x: p.x, y: p.y };
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** 畫面大小、遮擋範圍或缸的尺寸改變時重新排版、重畫靜態場景。 */
  private layout(state: TankState): void {
    const screen = this.app.screen;
    const size = tankSize(state.equipment.tank);
    const tankChanged = size.w !== this.camTankW;
    if (tankChanged || this.cam.span > maxSpan(size.w)) {
      this.cam = fitCamera(this.cam, size.w, screen.width, tankChanged);
      this.camTankW = size.w;
      this.maxSpan = maxSpan(size.w);
      if (this.maxSpan > 1) this.camMovedAt = this.time;
    }
    this.cam.pan = clampPan(this.cam.pan, this.cam.span, screen.width);
    this.root.x = -this.cam.pan;
    // 和商店的「目前使用」一致：沒記底材就是石英砂
    const look = tankSubstrateLook(state.equipment.substrate);
    // 石頭沉木只畫玩家買來擺的（scape-view.ts）：新缸沒買造景就只有底沙，不送預設裝飾
    const decor = false;
    const key = `${screen.width}x${screen.height}:${this.insets.top},${this.insets.bottom}:${size.w}x${size.h}:${this.cam.span}:${look}:${decor}`;
    if (key === this.sceneKey) return;
    this.sceneKey = key;
    const oldWidth = this.bounds.width;
    // 大缸畫得比畫面寬（span 倍），整個場景用 root.x 左右移動
    const b = (this.bounds = sceneBounds(screen.width * this.cam.span, screen.height, this.insets));
    if (oldWidth > 0 && oldWidth !== b.width) for (const v of this.fish.values()) v.swimmer.x *= b.width / oldWidth;
    this.ppc = pxPerCm(b, size);
    this.hs = this.ppc / MOCKUP_PX_PER_CM;
    const hs = this.hs;
    this.look = look;
    b.floor = (x: number) => floorY(look, x, b.width, b.bottom, hs);
    this.dirtKey = '';
    this.root.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x <= b.width && y <= b.height };

    const swap = (sprite: Sprite, tex: Texture) => {
      const old = sprite.texture;
      sprite.texture = tex;
      sprite.width = b.width;
      sprite.height = b.height;
      if (old !== Texture.EMPTY && old !== tex) old.destroy(true);
    };
    swap(this.backdrop, paintBackdrop(b, this.hs, this.pixelRatio));
    swap(this.driftwood, paintDriftwood(b, this.hs, decor, this.pixelRatio));
    swap(this.front, paintFront(b, this.hs, look, decor, this.pixelRatio));
    swap(this.vignette, paintVignette(b.width, b.height));

    // 焦散：主要照在底沙上，往上漸漸消失
    for (const [c, scale] of [[this.causticsA, 1.2], [this.causticsB, 0.8]] as const) {
      c.width = b.width;
      c.height = b.height;
      // 網眼約一個拳頭大（畫面評測 V17：之前放太大，變成幾條粗白曲線）
      c.tileScale.set(scale * Math.max(0.6, this.hs) * 0.75);
    }
    // 遮罩用柔和的漸層（從水中段淡入，到底沙最亮）
    if (this.causticsMask.texture === Texture.EMPTY) this.causticsMask.texture = fadeTexture();
    const y0 = b.surface + (b.bottom - b.surface) * 0.5;
    this.causticsMask.position.set(0, y0);
    this.causticsMask.width = b.width;
    // 焦散只照在水和底沙上，不畫到下方工具列後面
    this.causticsMask.height = Math.max(1, b.height - this.insets.bottom - y0);
    this.causticsLayer.mask = this.causticsMask;

    // 光束與懸浮粒子依畫面大小重建
    this.rayLayer.removeChildren().forEach((c) => c.destroy());
    this.rays = [];
    for (const [fx, w] of [[0.18, 0.09], [0.42, 0.06], [0.63, 0.1], [0.84, 0.05]] as const) {
      const s = new Sprite(rayTexture());
      s.anchor.set(0.5, 0);
      s.width = b.width * w;
      s.height = b.bottom * 1.05;
      s.skew.x = -0.28;
      this.rayLayer.addChild(s);
      this.rays.push({ s, x: fx * b.width, phase: this.rand() * 10 });
    }
    this.moteLayer.removeChildren().forEach((c) => c.destroy());
    this.motes = [];
    const motes = Math.round(Math.min(70, (b.width * b.height) / 14000) * this.quality.motes);
    for (let i = 0; i < motes; i++) {
      const s = new Sprite(softDotTexture());
      s.anchor.set(0.5);
      const r = 2 + this.rand() * 5;
      s.width = s.height = r;
      this.moteLayer.addChild(s);
      this.motes.push({ s, x: this.rand() * b.width, y: b.surface + this.rand() * (b.bottom - b.surface), vx: (this.rand() - 0.5) * 6, vy: -1 - this.rand() * 4, phase: this.rand() * 10 });
    }

    // 鏡頭變了：水草依新大小重畫，飼料重新產生
    for (const v of this.plants.values()) v.drawnBiomass = -1;
    for (const p of this.food) p.s.destroy();
    this.food = [];
    this.foodReset = true;
  }

  private handleTap(x: number, y: number): void {
    let best: number | null = null;
    let bestD = Infinity;
    for (const v of this.fish.values()) {
      const reach = Math.max(20, v.rig.lengthPx * Math.abs(v.rig.scale.y) * 0.55);
      const d = Math.hypot(v.swimmer.x - x, v.swimmer.y - y);
      if (d < reach && d < bestD) {
        bestD = d;
        best = v.swimmer.id;
      }
    }
    if (best !== null) {
      this.events.onSelectFish?.(best);
      return;
    }
    for (const [id, view] of this.plants) {
      const bb = this.plantRect(view);
      if (x >= bb.minX + bb.width * 0.2 && x <= bb.maxX - bb.width * 0.2 && y >= bb.minY && y <= bb.maxY) {
        this.events.onSelectPlant?.(id);
        return;
      }
    }
    this.events.onSelectFish?.(null);
    // 點到水裡空白處：好奇的魚會游過來看
    const w = this.waterBounds;
    if (y > w.surface && y < floorAt(this.bounds, x) - 6) this.poke = { x, y, age: 0, seq: (this.poke?.seq ?? 0) + 1 };
  }

  /** 每個畫面呼叫一次。realDt 為現實經過的秒數（動畫用）。 */
  update(state: TankState, realDt: number): void {
    const dt = Math.min(0.1, realDt);
    this.time += dt;
    if (this.artVersion !== paintedArtVersion()) {
      this.artVersion = paintedArtVersion();
      this.sceneKey = '';
      for (const v of this.fish.values()) v.rigKey = '';
      for (const v of this.plants.values()) v.drawnBiomass = -1;
    }
    this.layout(state);
    this.scape.sync(state, { bounds: this.bounds, hs: this.hs, look: this.look, sceneKey: this.sceneKey, pixelRatio: this.pixelRatio });
    this.detectOps(state, dt);
    this.syncFood(state, dt);
    this.drawDirt(state);
    this.syncMolts(state);
    this.snails.sync(state, { bounds: this.bounds, look: this.look, ppc: this.ppc, hs: this.hs, lit: isLightOn(state), time: this.time });
    this.syncFish(state, dt);
    this.drawParty(dt);
    this.syncPlants(state);
    this.drawOps(dt);
    this.drawGear(state);
    this.animateLight(state, dt);
    this.updateBubbles(state, dt);
    this.drawOverlay(state);
    this.drawSetup(dt);
    this.scape.drawEdit(state, this.bounds, (x) => this.bounds.floor?.(x) ?? this.bounds.bottom, this.selectedScapeRect());
  }

  /** 播開缸演出：倒沙、注水、裝設備、開燈（約 9 秒）。 */
  playSetup(): void {
    this.setupT = 0;
  }

  /** 跳過開缸演出：下一格直接演完（設備、燈都到位，照樣通知 'done'）。 */
  skipSetup(): void {
    if (this.setupT >= 0) this.setupT = Math.max(this.setupT, SETUP_SECONDS - 1e-4);
  }

  get settingUp(): boolean {
    return this.setupT >= 0;
  }

  private drawSetup(dt: number): void {
    const g = this.setupFx;
    const back = this.setupBack;
    g.clear();
    back.clear();
    if (this.setupT < 0) return;
    const prev = this.setupT;
    this.setupT += dt;
    const step = setupStepAt(prev, this.setupT);
    if (step) this.events.onSetupStep?.(step);
    const fade = [this.gearArtLayer, this.gear, this.gearGlow, this.bubbleLayer, this.rayLayer, this.causticsLayer, this.moteLayer, this.frontFish, this.backFish];
    if (this.setupT >= SETUP_SECONDS) {
      this.setupT = -1;
      for (const c of fade) c.alpha = c === this.backFish ? 0.75 : 1;
      this.gearArtLayer.y = this.gear.y = this.gearGlow.y = 0;
      this.front.mask = null;
      this.sandMask.clear();
      return;
    }
    const L = setupLook(this.setupT);
    const b = this.bounds;
    const hs = this.hs;
    const t = this.setupT;
    const W = b.width;
    // 底沙：沙從上面倒下來，落點堆成小丘，倒完攤平成前低後高的斜坡
    const sandTop = b.surface + (b.bottom - b.surface) * 0.7;
    const pourX = W * (0.2 + 0.6 * Math.min(1, L.sand * 1.15)) + Math.sin(t * 2.3) * W * 0.03;
    const rise = (b.height - sandTop) * L.sand;
    const mound = (x: number) => (L.pouring ? Math.exp(-(((x - pourX) / (W * 0.12)) ** 2)) * 34 * hs * (1 - L.sand * 0.6) : 0);
    const sandAt = (x: number) => b.height - rise - mound(x) - (x / W - 0.5) * 6 * hs * L.sand;
    const mask = this.sandMask.clear().moveTo(0, b.height);
    for (let i = 0; i <= 32; i++) mask.lineTo((W * i) / 32, sandAt((W * i) / 32));
    mask.lineTo(W, b.height).closePath().fill(0xffffff);
    this.front.mask = this.sandMask;
    // 水位以上是空氣：玻璃後面淡淡的房間色，蓋住後景的水
    // 水從沙面往上漲（沙面以下看不到水）
    const bed = Math.min(b.height, floorAt(b, W / 2));
    const waterY = bed - (bed - b.surface) * L.water;
    if (waterY > 0) back.rect(0, 0, W, waterY).fill({ color: 0xd3e2e8, alpha: 0.94 });
    // 空缸看得出是一個玻璃缸：上緣黑框、左右玻璃邊的反光、斜斜的玻璃反光帶（開燈後淡出）
    const glass = 1 - L.light * 0.85;
    g.rect(0, 0, W, 9 * hs).fill({ color: 0x1b2328, alpha: 0.85 * glass });
    g.rect(0, 9 * hs, W, 2 * hs).fill({ color: 0xffffff, alpha: 0.35 * glass });
    for (const x of [0, W - 7 * hs]) {
      g.rect(x, 0, 7 * hs, b.height).fill({ color: 0xeaf6fa, alpha: 0.28 * glass });
      g.rect(x + (x === 0 ? 7 : -1.5) * hs, 0, 1.5 * hs, b.height).fill({ color: 0xffffff, alpha: 0.5 * glass });
    }
    for (const [x0, w] of [[0.16, 0.05], [0.24, 0.018], [0.68, 0.035]] as const) {
      const x = W * x0;
      g.poly([x, 0, x + W * w, 0, x + W * w - b.height * 0.35, b.height, x - b.height * 0.35, b.height]).fill({ color: 0xffffff, alpha: 0.07 * glass });
    }
    // 倒沙：袋口在上面，一大把沙粒灑下來，落地濺起
    if (L.pouring) {
      const top = 14 * hs;
      // 落點：已經看得到的沙面（沙圖本身的表面，或還在往上堆的那一層，取比較低的）
      const land = Math.max(sandAt(pourX), floorAt(b, pourX) - 4 * hs);
      g.roundRect(pourX - 26 * hs, top - 30 * hs, 52 * hs, 34 * hs, 8 * hs).fill({ color: 0x8a6f4a, alpha: 0.95 });
      g.rect(pourX - 26 * hs, top - 2 * hs, 52 * hs, 4 * hs).fill({ color: 0x5e4a30, alpha: 0.9 });
      g.poly([pourX - 12 * hs, top, pourX + 12 * hs, top, pourX + 20 * hs, land, pourX - 20 * hs, land]).fill({ color: 0xe6d4aa, alpha: 0.28 });
      for (let i = 0; i < 140; i++) {
        const k = (i * 0.0731 + t * 1.6) % 1;
        const spread = (Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 4.1) * 0.5) * (6 + 18 * k) * hs;
        g.circle(pourX + spread, top + (land - top) * k * k, (1.2 + (i % 4) * 0.55) * hs).fill({ color: [0xf3e6c6, 0xd9c296, 0xbfa77c, 0xe9dcc0][i % 4], alpha: 0.95 });
      }
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI + t * 4;
        const r = (12 + (i % 4) * 7) * hs;
        g.circle(pourX + Math.cos(a) * r, land - Math.abs(Math.sin(a * 1.7)) * 10 * hs, 1.6 * hs).fill({ color: 0xd9c49a, alpha: 0.75 });
      }
    }
    // 注水：水管從右上角灌水，水面一條會晃的亮線，水裡一串串氣泡，一開始霧濁、慢慢沉澱變清
    if (L.water > 0 && L.water < 1) {
      const hoseX = W * 0.74;
      g.roundRect(hoseX - 9 * hs, -4 * hs, 18 * hs, 34 * hs, 6 * hs).fill({ color: 0x2f4a3e, alpha: 0.95 });
      g.rect(hoseX - 5 * hs, 30 * hs, 10 * hs, waterY - 30 * hs).fill({ color: 0xcdeef8, alpha: 0.55 });
      g.rect(hoseX - 2 * hs, 30 * hs, 3 * hs, waterY - 30 * hs).fill({ color: 0xffffff, alpha: 0.5 });
      for (let i = 0; i < 14; i++) {
        const a = t * 7 + i * 1.9;
        g.circle(hoseX + Math.cos(a) * (14 + (i % 3) * 8) * hs, waterY - Math.abs(Math.sin(a)) * 9 * hs, (1.8 + (i % 3)) * hs).fill({ color: 0xffffff, alpha: 0.55 });
      }
    }
    if (L.water > 0) {
      const surf = g.moveTo(0, waterY);
      for (let i = 0; i <= 40; i++) surf.lineTo((W * i) / 40, waterY + Math.sin(i * 0.9 + t * 5) * 2.2 * hs * (1 - L.light));
      surf.stroke({ color: 0xffffff, alpha: 0.6 * (L.water < 1 ? 1 : 1 - L.light), width: 2.5 * hs });
      // 氣泡：注水時從水管下方湧出、往上浮
      const fizz = Math.max(0, Math.min(1, (1 - L.water) * 3)) + L.milk * 0.6;
      for (let i = 0; i < 36 && fizz > 0.02; i++) {
        const k = (i * 0.173 + t * 0.55) % 1;
        const x = W * (0.55 + 0.35 * ((i * 0.618) % 1)) + Math.sin(t * 3 + i) * 6 * hs;
        const y = bed - (bed - waterY) * k;
        if (y < waterY + 4 * hs) continue;
        g.circle(x, y, (1.4 + (i % 3) * 0.9) * hs).stroke({ color: 0xffffff, alpha: 0.6 * fizz * (1 - k * 0.5), width: 1 * hs });
      }
    }
    if (L.milk > 0.01) {
      // 濁水：底下最濁，往上漸淡，沉澱時從上面先清
      g.rect(0, waterY, W, b.height - waterY).fill({ color: 0xdde9e2, alpha: L.milk * 0.7 });
      g.rect(0, waterY + (b.height - waterY) * 0.45, W, (b.height - waterY) * 0.55).fill({ color: 0xd8d0b8, alpha: L.milk * 0.35 });
    }
    // 設備：從上面放進缸裡
    for (const c of [this.gearArtLayer, this.gear, this.gearGlow]) {
      c.alpha = L.gear;
      c.y = -(1 - L.gear) * 40 * hs;
    }
    this.bubbleLayer.alpha = L.gear;
    // 開燈：之前整缸偏暗，燈亮後光束、焦散才出現
    if (L.light < 1) g.rect(0, 0, b.width, b.height).fill({ color: 0x06141c, alpha: (1 - L.light) * 0.38 });
    this.rayLayer.alpha = this.causticsLayer.alpha = L.light;
    this.moteLayer.alpha = L.water * (1 - L.milk);
    this.frontFish.alpha = L.light;
    this.backFish.alpha = 0.75 * L.light;
  }

  /** 生小魚的慶祝特寫：聚光在母魚身上幾秒，金色亮點往上飄。 */
  celebrate(fishId: number): void {
    const v = this.fish.get(fishId);
    if (!v) return;
    // 母魚游到前景，不要躲在水草後面
    v.zTarget = 1;
    this.party = { id: fishId, t: 0, sparks: sparkleBurst(20, v.swimmer.x, v.swimmer.y, this.partySize(fishId), () => this.rand()) };
  }

  /** 特寫的大小：照母魚畫面上的長度。 */
  private partySize(id: number): number {
    const fish = this.seenState?.fish.find((f) => f.id === id);
    return Math.max(40, fish ? this.lengthPx(fish) * 1.2 : 40);
  }

  private drawParty(dt: number): void {
    const fx = this.partyFx;
    fx.clear();
    const party = this.party;
    const v = party ? this.fish.get(party.id) : undefined;
    if (!party || !v || (party.t += dt) >= CELEBRATE_SECONDS) {
      this.party = null;
      this.spot.visible = false;
      return;
    }
    const { x, y } = v.swimmer;
    const f = celebrateFrame(party.t);
    const size = this.partySize(party.id);
    // 聚光圈照魚的大小：亮的地方剛好包住母魚，外面一路暗到畫面邊緣
    const big = Math.max(Math.max(this.app.screen.width, this.app.screen.height) * 2.3, size * 12);
    if (this.spot.texture !== spotlightTexture()) {
      this.spot.texture = spotlightTexture();
      this.spot.anchor.set(0.5);
    }
    this.spot.visible = true;
    this.spot.width = this.spot.height = big;
    this.spot.position.set(x, y);
    this.spot.alpha = f.spot;
    if (f.ringAlpha > 0) fx.circle(x, y, size * (0.4 + 1.6 * f.ring)).stroke({ color: 0xffe29a, alpha: f.ringAlpha, width: Math.max(2, 3 * this.hs) });
    // 前 3 秒母魚身邊一直冒亮點，跟著她游
    if (party.t < 3 && this.rand() < dt * 14) party.sparks.push(...sparkleBurst(1, x, y, size, () => this.rand()).map((p) => ({ ...p, t: 0 })));
    party.sparks = party.sparks.filter((p) => p.t < p.life);
    for (const s of party.sparks) {
      s.t += dt;
      if (s.t < 0) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy *= Math.pow(0.6, dt);
      const a = sparkleAlpha(s);
      if (a <= 0) continue;
      // 金色亮點：外面一圈淡光暈、中間亮核
      // 金色小星星（圓的會跟氣泡搞混）
      fx.circle(s.x, s.y, s.r * 2.2).fill({ color: 0xffc94a, alpha: a * 0.18 });
      fx.star(s.x, s.y, 4, s.r * 2.4, s.r * 0.55, s.t * 1.5).fill({ color: 0xffd760, alpha: Math.min(1, a * 1.5) });
    }
  }

  /** 進入、離開造景模式（null = 一般模式）。 */
  setScapeEdit(edit: ScapeEdit | null): void {
    this.scape.setEdit(edit);
    if (!edit) this.scapeDrag = null;
  }

  /**
   * 造景引導（F1-c）：目前這層第一個拖得動的東西（石頭優先），回傳它在畫布上的位置（CSS 像素）。
   * 這層什麼都沒有就回傳 null。
   */
  scapeHintPos(): { x: number; y: number } | null {
    const edit = this.scape.editing;
    if (!edit) return null;
    let r: Rect | null = null;
    const rock = this.scape.firstInLayer(edit.layer);
    if (rock !== null) r = this.scape.hardscapeRect(rock);
    else {
      for (const view of this.plants.values()) {
        if (view.holder.parent !== this.scape.plants[edit.layer]) continue;
        const bb = this.plantRect(view);
        r = { x0: bb.minX, y0: bb.minY, x1: bb.maxX, y1: bb.maxY };
        break;
      }
    }
    if (!r) return null;
    const k = this.app.screen.width / Math.max(1, this.app.canvas.getBoundingClientRect().width);
    return { x: ((r.x0 + r.x1) / 2 + this.root.x) / k, y: (r.y0 + (r.y1 - r.y0) * 0.6 + this.root.y) / k };
  }

  /** 水草在畫面上的範圍（root 座標；getBounds 是畫布座標，要扣掉鏡頭的平移）。 */
  private plantRect(view: PlantView): { minX: number; maxX: number; minY: number; maxY: number; width: number } {
    const bb = view.holder.getBounds();
    return { minX: bb.minX - this.root.x, maxX: bb.maxX - this.root.x, minY: bb.minY - this.root.y, maxY: bb.maxY - this.root.y, width: bb.width };
  }

  private selectedScapeRect(): Rect | null {
    const sel = this.scape.editing?.selected;
    if (!sel) return null;
    if (sel.kind === 'hardscape') return this.scape.hardscapeRect(sel.index);
    const view = this.plants.get(sel.id);
    if (!view) return null;
    const r = this.plantRect(view);
    return { x0: r.minX + r.width * 0.15, y0: r.minY, x1: r.maxX - r.width * 0.15, y1: r.maxY };
  }

  /** 造景模式：按到哪個物件（目前編輯的那層；水草優先，因為常常種在石頭前面）。 */
  private hitScape(x: number, y: number): ScapeTarget | null {
    const edit = this.scape.editing;
    if (!edit) return null;
    for (const [id, view] of this.plants) {
      if (view.holder.parent !== this.scape.plants[edit.layer]) continue;
      const bb = this.plantRect(view);
      if (x >= bb.minX + bb.width * 0.2 && x <= bb.maxX - bb.width * 0.2 && y >= bb.minY && y <= bb.maxY) return { kind: 'plant', id };
    }
    const index = this.scape.hitHardscape(x, y, edit.layer);
    return index === null ? null : { kind: 'hardscape', index };
  }

  /** 拖曳開始時物件中心的 x（像素）。 */
  private scapeItemX(target: ScapeTarget): number {
    if (target.kind === 'plant') return this.plants.get(target.id)?.holder.x ?? 0;
    const r = this.scape.hardscapeRect(target.index);
    return r ? (r.x0 + r.x1) / 2 : 0;
  }

  /** 光束緩慢飄移、焦散流動、粒子漂浮。關燈時光束和焦散消失。 */
  private animateLight(state: TankState, dt: number): void {
    const lit = isLightOn(state);
    // 開關燈約 1.5 秒淡入淡出，不是瞬間切換
    this.night += ((lit ? 0 : 1) - this.night) * Math.min(1, dt * 2);
    const t = this.time;
    const b = this.bounds;
    this.rayLayer.visible = lit;
    this.causticsLayer.visible = lit;
    if (lit) {
      for (const r of this.rays) {
        r.s.x = r.x + Math.sin(t * 0.15 + r.phase) * b.width * 0.03;
        r.s.alpha = 0.45 + 0.15 * Math.sin(t * 0.4 + r.phase);
      }
      this.causticsA.tilePosition.x += dt * 9;
      this.causticsA.tilePosition.y += dt * 4;
      this.causticsB.tilePosition.x -= dt * 6;
      this.causticsB.tilePosition.y += dt * 7;
      this.causticsA.alpha = 0.16 + 0.05 * Math.sin(t * 0.8);
      this.causticsB.alpha = 0.12 + 0.05 * Math.sin(t * 0.6 + 1);
    }
    for (const m of this.motes) {
      m.x += (m.vx + Math.sin(t * 0.5 + m.phase) * 4) * dt;
      m.y += m.vy * dt;
      if (m.y < b.surface) m.y = b.bottom;
      if (m.x < 0) m.x += b.width;
      if (m.x > b.width) m.x -= b.width;
      m.s.position.set(m.x, m.y);
      m.s.alpha = (lit ? 0.35 : 0.12) * (0.6 + 0.4 * Math.sin(t * 1.3 + m.phase));
    }
  }

  /** 缸內的設備：加熱棒、過濾器、打氣石、CO₂ 細化器（玻璃、半透明，用柔光代替描邊）。 */
  private drawGear(state: TankState): void {
    const g = this.gear.clear();
    const { width, surface, bottom } = this.bounds;
    const hs = this.hs;
    const eq = state.equipment;
    const top = this.insets.top;
    const glowFor: Array<[number, number, number, number]> = [];
    const glass = { color: 0xe8fbff, alpha: 0.55, width: Math.max(1, 1.6 * hs) };
    if (!this.gearArtLayer.children.length) {
      for (const sp of Object.values(this.gearArt)) {
        sp.anchor.set(0.5, 0);
        sp.visible = false;
        this.gearArtLayer.addChild(sp);
      }
    }
    // 缸內版的加熱棒（看得到發熱絲）優先，沒有才用商品圖
    const heaterScene = paintedTexture('gear-heater-scene');
    const heaterTex = heaterScene ?? paintedTexture('gear-heater');
    const spongeTex = paintedTexture('gear-sponge');
    const intakeTex = paintedTexture('gear-intake');
    this.gearArt.heater.visible = false;
    this.gearArt.sponge.visible = false;
    this.gearArt.intake.visible = false;

    if (eq.filter?.spec.id === 'hangOn' && intakeTex) {
      // 外掛過濾器的進水管插圖：從水面上方垂下來，底端是濾網籠（畫面評測 V8：原本只剩一根細管）
      const ix = width - 130 * hs - 30;
      const sp = this.gearArt.intake;
      sp.texture = intakeTex;
      sp.visible = true;
      const h = bottom * 0.62 - top + 40 + 26 * hs;
      sp.height = h;
      sp.width = (h * intakeTex.width) / intakeTex.height;
      sp.position.set(ix, top - 40);
    } else if (eq.filter?.spec.id === 'hangOn') {
      // 外掛過濾器：右後方垂下的進水管
      const ix = width - 130 * hs - 30;
      g.roundRect(ix - 7 * hs, top - 40, 14 * hs, bottom * 0.62 - top + 40, 7 * hs).fill({ color: 0x24343f, alpha: 0.75 });
      g.roundRect(ix - 4 * hs, top - 40, 3 * hs, bottom * 0.62 - top + 40, 2 * hs).fill({ color: 0xffffff, alpha: 0.18 });
      g.roundRect(ix - 11 * hs, bottom * 0.62 - 26 * hs, 22 * hs, 28 * hs, 5 * hs).fill({ color: 0x1b2730, alpha: 0.85 });
      for (let i = 0; i < 4; i++) g.rect(ix - 8 * hs, bottom * 0.62 - 22 * hs + i * 6 * hs, 16 * hs, 2 * hs).fill({ color: 0x5b7080, alpha: 0.8 });
    } else if (eq.filter?.spec.id === 'canister') {
      const px = width - 60 * hs - 20;
      g.roundRect(px - 5 * hs, top - 40, 10 * hs, bottom - 30 * hs - top + 40, 5 * hs).fill({ color: 0x6fbf73, alpha: 0.55 });
      g.roundRect(px - 9 * hs, bottom - 54 * hs, 18 * hs, 26 * hs, 4 * hs).fill({ color: 0x4f9a55, alpha: 0.75 });
      const qx = width - 110 * hs - 20;
      g.roundRect(qx - 5 * hs, top - 40, 10 * hs, surface + 30 * hs - top + 40, 5 * hs).fill({ color: 0x6fbf73, alpha: 0.55 });
      g.roundRect(qx - 70 * hs, surface + 24 * hs, 75 * hs, 10 * hs, 5 * hs).fill({ color: 0x6fbf73, alpha: 0.55 });
    } else if (eq.filter?.spec.id === 'sponge' && spongeTex) {
      // 海綿過濾器插圖：立在底沙上，打氣管往上接到水面
      const sx = 90 * hs + 20;
      const sp = this.gearArt.sponge;
      sp.texture = spongeTex;
      sp.visible = true;
      const h = Math.min(170 * hs, (bottom - surface) * 0.6);
      sp.height = h;
      sp.width = (h * spongeTex.width) / spongeTex.height;
      sp.position.set(sx, floorAt(this.bounds, sx) - h + 6 * hs);
      g.moveTo(sx - 4 * hs, top - 20).lineTo(sx - 4 * hs, sp.y + h * 0.05).stroke({ color: 0xd8f0f5, width: Math.max(1, 2.5 * hs), alpha: 0.45 });
    } else if (eq.filter?.spec.id === 'sponge') {
      const sx = 90 * hs + 20;
      g.roundRect(sx - 4 * hs, bottom - 150 * hs, 8 * hs, 110 * hs, 4 * hs).fill({ color: 0xe8fbff, alpha: 0.25 }).stroke(glass);
      g.roundRect(sx - 26 * hs, bottom - 60 * hs, 52 * hs, 64 * hs, 14 * hs).fill({ color: 0x2a3036, alpha: 0.95 });
      for (let i = 0; i < 16; i++) g.circle(sx - 20 * hs + ((i * 37) % 40) * hs, bottom - 54 * hs + ((i * 23) % 54) * hs, 2.4 * hs).fill({ color: 0x15191d, alpha: 0.9 });
    }

    if (eq.heater) {
      // 加熱棒：玻璃管，下半段是發熱體（加熱中發出橘色柔光、故障時暗灰、卡住時紅色閃爍）
      const hx = 26 * hs + 14;
      const hy = surface + 10 * hs;
      const hh = Math.min(190 * hs, (bottom - surface) * 0.75);
      const on = eq.heater.heating && !state.environment.powerOut;
      const stuck = !!eq.heater.stuckOn;
      const element = eq.heater.broken && !stuck ? 0x4a5055 : on ? (stuck && Math.sin(this.time * 7) > 0 ? 0xff3a1a : 0xff8a3a) : 0x9fb0b8;
      if (heaterTex) {
        // 加熱棒插圖：玻璃管加黑色頭；發熱體顏色疊在管子下半段
        const sp = this.gearArt.heater;
        sp.texture = heaterTex;
        sp.visible = true;
        const w = Math.max(14 * hs, (hh * heaterTex.width) / heaterTex.height);
        sp.width = w;
        sp.height = hh + 14 * hs;
        sp.position.set(hx + 8 * hs, hy - 14 * hs);
        sp.tint = eq.heater.broken && !stuck ? 0x9aa2a8 : 0xffffff;
        if (heaterScene) {
          // 缸內版圖本身畫著亮橘色的發熱絲：沒在加熱時把發熱絲蓋暗，壞了是灰的，卡住時紅色閃
          if (!on || stuck) g.roundRect(hx + 8 * hs - w * 0.16, hy + hh * 0.18, w * 0.32, hh * 0.68, w * 0.14).fill({ color: on ? element : 0x5d6a70, alpha: on ? 0.5 : 0.6 });
        } else g.roundRect(hx + 8 * hs - w * 0.18, hy + hh * 0.5, w * 0.36, hh * 0.4, w * 0.18).fill({ color: element, alpha: on || eq.heater.broken ? 0.75 : 0.35 });
      } else {
        g.roundRect(hx, hy, 16 * hs, hh, 8 * hs).fill({ color: 0xe8fbff, alpha: 0.18 }).stroke(glass);
        g.roundRect(hx + 4 * hs, hy + hh * 0.46, 8 * hs, hh * 0.48, 4 * hs).fill(element);
        g.roundRect(hx + 3 * hs, hy + 6 * hs, 2.5 * hs, hh - 12 * hs, 1.5 * hs).fill({ color: 0xffffff, alpha: 0.45 });
        g.roundRect(hx + 1 * hs, hy - 10 * hs, 14 * hs, 14 * hs, 4 * hs).fill(0x1f2a33);
      }
      for (const k of [0.25, 0.7]) g.circle(hx + 19 * hs, hy + hh * k, 4.5 * hs).fill({ color: 0xe8fbff, alpha: 0.35 });
      if (on) glowFor.push([hx + 8 * hs, hy + hh * 0.7, hh * 0.9, stuck ? 0xff4020 : 0xff8a3a]);
    }

    if (eq.airPump) {
      const ax = width - 40 * hs - 16;
      g.moveTo(ax + 6 * hs, top - 20).lineTo(ax + 6 * hs, bottom - 6 * hs).stroke({ color: 0xd8f0f5, width: Math.max(1, 2.5 * hs), alpha: 0.45 });
      g.roundRect(ax - 12 * hs, bottom - 12 * hs, 24 * hs, 12 * hs, 5 * hs).fill(0x7a8a92);
    }
    if (eq.co2) {
      const cx = width * 0.6;
      g.moveTo(cx, bottom - 10 * hs).lineTo(cx, bottom - 30 * hs).stroke({ color: 0xe8fbff, width: Math.max(1, 2 * hs), alpha: 0.6 });
      g.circle(cx, bottom - 36 * hs, 9 * hs).fill({ color: 0xe8fbff, alpha: 0.35 }).stroke(glass);
    }

    // 發熱體的柔光（加法混色）
    while (this.gearGlow.children.length < glowFor.length) {
      const s = new Sprite(softDotTexture());
      s.anchor.set(0.5);
      this.gearGlow.addChild(s);
    }
    this.gearGlow.children.forEach((c, i) => {
      const s = c as Sprite;
      const glow = glowFor[i];
      s.visible = !!glow;
      if (!glow) return;
      s.position.set(glow[0], glow[1]);
      s.width = glow[2] * 0.5;
      s.height = glow[2];
      s.tint = glow[3];
      s.alpha = 0.55 + 0.1 * Math.sin(this.time * 2);
    });
  }

  /** 水位：換水抽水時水面往下降。魚和飼料都待在水裡。 */
  private get drainPx(): number {
    if (this.wcT < 0) return 0;
    return waterChangeFrame(this.wcT).drop * this.wcFrac * (this.bounds.bottom - this.bounds.surface) * 0.9;
  }

  private get waterBounds(): TankBounds {
    const d = this.drainPx;
    return d > 0 ? { ...this.bounds, surface: this.bounds.surface + d } : this.bounds;
  }

  /** 比對上一格的狀態，發現玩家剛換水或測水就開始演。讀檔、復原換成另一份狀態時不演。 */
  private detectOps(state: TankState, dt: number): void {
    const wc = state.lastWaterChangeHours ?? -1;
    const test = state.lastTest?.hours ?? -1;
    if (state === this.seenState) {
      if (wc > this.seenWc) {
        this.wcT = 0;
        this.wcFrac = inferFraction(this.seenNo3, state.water.no3, state.environment.tap.no3);
      }
      if (test > this.seenTest && state.lastTest) {
        this.testT = 0;
        this.testReading = state.lastTest.reading;
      }
    }
    this.seenState = state;
    this.seenWc = wc;
    this.seenNo3 = state.water.no3;
    this.seenTest = test;
    if (this.wcT >= 0 && (this.wcT += dt) >= WATER_CHANGE_SECONDS) this.wcT = -1;
    if (this.testT >= 0 && (this.testT += dt) >= TEST_SECONDS) this.testT = -1;
  }

  private spawnCuttings(view: PlantView, n: number): void {
    const tex = view.rig!.mesh.texture;
    const src = tex.source.resource as HTMLCanvasElement;
    // 找出圖裡真的有葉子的範圍，插枝從葉頂往下切一段
    const data = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    let top = src.height, left = src.width, right = 0;
    for (let y = 0; y < src.height; y += 2) {
      for (let x = 0; x < src.width; x += 2) {
        if (data[(y * src.width + x) * 4 + 3] > 40) {
          top = Math.min(top, y);
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    if (top >= src.height) return;
    const h = Math.max(4, Math.round((src.height - top) * 0.4));
    const tall = 64 * this.hs;
    const plantH = tex.height;
    const baseX = view.holder.x;
    for (let i = 0; i < n; i++) {
      // 每根插枝取葉頂的一段（左右錯開）
      const cw = Math.max(4, Math.round((right - left) * 0.35));
      const sx = Math.round(left + (right - left - cw) * this.rand());
      const { canvas, ctx } = makeCanvas(cw, h);
      ctx.drawImage(src, sx, top, cw, h, 0, 0, cw, h);
      const s = new Sprite(canvasTexture(canvas));
      s.anchor.set(0.5, 1);
      const k = tall / h;
      s.scale.set(k);
      const x = baseX + view.rig!.mesh.x + sx + cw / 2;
      const y = view.holder.y - (plantH - top) * 0.55;
      s.position.set(x, y);
      this.cuttingLayer.addChild(s);
      this.cuttings.push({ s, vx: (this.rand() - 0.5) * 30 * this.hs, vy: -(28 + this.rand() * 20) * this.hs, spin: (this.rand() - 0.5) * 1.6, t: 0 });
      this.snips.push({ x, y, t: 0 });
    }
  }

  /** 換水的水位、虹吸管、加水水柱，測試劑試管，修剪的插枝。 */
  private drawOps(dt: number): void {
    const g = this.opsFx;
    g.clear();
    const { width, surface, bottom } = this.bounds;
    const hs = this.hs;
    const t = this.time;

    if (this.wcT >= 0) {
      const f = waterChangeFrame(this.wcT);
      const level = this.drainPx;
      const y = surface + level;
      if (level > 0.5) {
        // 抽掉水的那一段：只剩空氣，玻璃上留著水痕
        g.rect(0, surface - 8 * hs, width, level + 8 * hs).fill({ color: 0x0b1820, alpha: 0.78 });
        for (let x = 30 * hs; x < width; x += 90 * hs) {
          g.rect(x + Math.sin(x) * 10 * hs, surface, 1.5 * hs, level * (0.3 + 0.5 * Math.abs(Math.sin(x * 1.7)))).fill({ color: 0xbfe6f0, alpha: 0.12 });
        }
        g.moveTo(0, y);
        for (let x = 0; x <= width; x += 20) g.lineTo(x, y + Math.sin(x * 0.03 + t * 3) * 1.5 * hs);
        g.stroke({ color: 0xe8f8ff, alpha: 0.55, width: 2 * hs });
      }
      if (f.siphon) {
        // 虹吸管：從缸外伸進來，管口貼近底砂吸走髒污
        const x0 = width * 0.16, x1 = width * 0.2;
        g.moveTo(x0 - 40 * hs, surface - 60 * hs).bezierCurveTo(x0, surface - 80 * hs, x1, surface, x1, bottom - 26 * hs);
        g.stroke({ color: 0xa9c2ca, alpha: 0.55, width: 12 * hs, cap: 'round' });
        g.moveTo(x0 - 40 * hs, surface - 60 * hs).bezierCurveTo(x0, surface - 80 * hs, x1, surface, x1, bottom - 26 * hs);
        g.stroke({ color: 0x3d5a63, alpha: 0.5, width: 6 * hs, cap: 'round' });
        g.roundRect(x1 - 11 * hs, bottom - 70 * hs, 22 * hs, 48 * hs, 6 * hs).fill({ color: 0xcfe4ea, alpha: 0.25 }).stroke({ color: 0xe0f2f6, alpha: 0.5, width: 1.5 * hs });
        for (let i = 0; i < 6; i++) {
          const k = (t * 1.6 + i / 6) % 1;
          g.circle(x1 + Math.sin(i * 2.3 + t * 4) * 6 * hs, bottom - 24 * hs - k * 40 * hs, 1.8 * hs).fill({ color: 0x8a6a4a, alpha: 0.7 * (1 - k) });
        }
      }
      if (f.pour) {
        // 加水：一道水柱打進缸裡，落點冒泡
        const x = width * 0.72;
        g.rect(x - 6 * hs, surface - 60 * hs, 12 * hs, level + 60 * hs).fill({ color: 0xe8f6ff, alpha: 0.28 });
        g.rect(x - 2 * hs, surface - 60 * hs, 3 * hs, level + 60 * hs).fill({ color: 0xffffff, alpha: 0.35 });
        g.ellipse(x, y + 2 * hs, 26 * hs, 5 * hs).fill({ color: 0xffffff, alpha: 0.3 });
        for (let i = 0; i < 10; i++) {
          const k = (t * 1.3 + i / 10) % 1;
          g.circle(x + Math.sin(i * 1.9 + t * 3) * 22 * hs * k, y + 10 * hs + k * 70 * hs, (1.5 + 2 * (1 - k)) * hs).stroke({ color: 0xffffff, alpha: 0.6 * (1 - k), width: 1 });
        }
      }
    }

    // 測試劑：四支試管在右上角，裝水、滴試劑、慢慢變成比色卡上的顏色
    const tube = tubeFrame(this.testT);
    this.tubeLabels.visible = this.testT >= 0 && !!this.testReading;
    if (this.testT >= 0 && this.testReading) {
      if (this.tubeLabels.children.length === 0) {
        for (const tb of TUBES) {
          const label = new Text({ text: tb.label, style: { fill: 0xeaf6f8, fontSize: 12, fontWeight: '600', fontFamily: 'system-ui, sans-serif' } });
          label.anchor.set(0.5, 0);
          this.tubeLabels.addChild(label);
        }
      }
      const tw = 16 * hs, th = 70 * hs, gap = 30 * hs;
      const x0 = this.cam.pan + this.app.screen.width - 50 * hs - (TUBES.length - 1) * gap;
      const y0 = surface + 24 * hs;
      const reading = this.testReading;
      TUBES.forEach((tb, i) => {
        const x = x0 + i * gap;
        const color = mix(0xd8ecef, kitColor(tb.param, reading[tb.param]), tube.tint);
        const liquid = th * 0.72 * tube.fill;
        g.roundRect(x - tw / 2 - 3 * hs, y0 - 3 * hs, tw + 6 * hs, th + 6 * hs, tw / 2 + 3 * hs).fill({ color: 0x0b1820, alpha: 0.35 * tube.alpha });
        g.roundRect(x - tw / 2, y0 + th - liquid, tw, liquid, tw / 2).fill({ color, alpha: 0.92 * tube.alpha });
        g.roundRect(x - tw / 2, y0, tw, th, tw / 2).stroke({ color: 0xffffff, alpha: 0.75 * tube.alpha, width: 1.5 * hs });
        g.rect(x - tw / 2 + 3 * hs, y0 + 6 * hs, 2.5 * hs, th - 16 * hs).fill({ color: 0xffffff, alpha: 0.35 * tube.alpha });
        const label = this.tubeLabels.children[i] as Text;
        label.position.set(x, y0 + th + 6 * hs);
        label.scale.set(Math.max(0.8, hs));
        label.alpha = tube.alpha;
      });
    }

    // 修剪：剪刀剪下的地方閃一下，插枝往上飄走
    this.snips = this.snips.filter((p) => (p.t += dt) < 0.35);
    for (const p of this.snips) {
      const k = p.t / 0.35;
      g.circle(p.x, p.y, (4 + 14 * k) * hs).stroke({ color: 0xffffff, alpha: 0.8 * (1 - k), width: 2 * hs });
    }
    this.cuttings = this.cuttings.filter((c) => {
      c.t += dt;
      if (c.t >= CUTTING_SECONDS) {
        c.s.destroy({ texture: true, textureSource: true });
        return false;
      }
      c.s.x += c.vx * dt;
      c.s.y = Math.max(surface + 10 * hs, c.s.y + c.vy * dt);
      c.s.rotation += c.spin * dt;
      c.s.alpha = Math.min(1, (CUTTING_SECONDS - c.t) / 0.8);
      return true;
    });
    this.drawScrollBar();
  }

  /** 位置條：畫面上方中間一條細線，亮的那段是目前看到的範圍；滑動後顯示一下再淡出。 */
  private drawScrollBar(): void {
    const g = this.scrollBar;
    g.clear();
    if (this.cam.span <= 1) return;
    const alpha = Math.max(0, Math.min(1, 2.5 - (this.time - this.camMovedAt)));
    if (alpha <= 0) return;
    const sw = this.app.screen.width;
    const track = Math.min(240, sw * 0.3);
    const x = this.cam.pan + (sw - track) / 2;
    const y = this.bounds.surface + 10;
    const thumb = track / this.cam.span;
    const tx = x + (track - thumb) * (this.cam.pan / (sw * (this.cam.span - 1)));
    g.roundRect(x, y, track, 4, 2).fill({ color: 0x0b1820, alpha: 0.45 * alpha });
    g.roundRect(tx, y, thumb, 4, 2).fill({ color: 0xeaf6f8, alpha: 0.85 * alpha });
  }

  private panBy(dx: number): void {
    const pan = clampPan(this.cam.pan + dx, this.cam.span, this.app.screen.width);
    if (pan === this.cam.pan) return;
    this.cam = { ...this.cam, pan };
    this.root.x = -pan;
    this.camMovedAt = this.time;
  }

  private zoomBy(factor: number, anchorX: number): void {
    const next = zoomAt(this.cam, factor, anchorX, this.app.screen.width, this.maxSpan);
    if (next === this.cam) return;
    this.cam = next;
    this.root.x = -next.pan;
    this.camMovedAt = this.time;
  }

  /** 拖曳左右滑、雙指縮放；電腦上用滾輪或觸控板（按 Ctrl 或觸控板捏合縮放）。 */
  private bindCameraInput(canvas: HTMLCanvasElement): void {
    // 拖曳、捏合都自己處理，不讓瀏覽器拿去捲動或放大網頁
    canvas.style.touchAction = 'none';
    const pointers = new Map<number, { x: number; y: number }>();
    let downX = 0;
    let pinchBase = 0;
    const local = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const k = this.app.screen.width / Math.max(1, rect.width);
      return { x: (e.clientX - rect.left) * k - this.root.x, y: (e.clientY - rect.top) * k - this.root.y };
    };
    canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // 造景模式：按到物件就開始拖，按到空白處取消選取
      if (this.scape.editing && pointers.size === 1) {
        const p = local(e);
        const hit = this.hitScape(p.x, p.y);
        this.events.onScapeSelect?.(hit);
        if (hit) {
          const cx = this.scapeItemX(hit);
          this.scapeDrag = { target: hit, offset: cx - p.x, startX: p.x, moved: false };
          this.scape.setDrag(hit, cx);
          this.dragged = true;
          return;
        }
      }
      if (pointers.size === 1) {
        downX = e.clientX;
        this.dragged = false;
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchBase = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (prev && this.scapeDrag) {
        const p = local(e);
        if (Math.abs(p.x - this.scapeDrag.startX) > 4) this.scapeDrag.moved = true;
        const w = this.bounds.width;
        this.scape.setDrag(this.scapeDrag.target, Math.min(w * 0.96, Math.max(w * 0.04, p.x + this.scapeDrag.offset)));
        return;
      }
      if (!prev || this.maxSpan <= 1) return;
      const rect = canvas.getBoundingClientRect();
      const k = this.app.screen.width / Math.max(1, rect.width);
      if (pointers.size === 1) {
        if (Math.abs(e.clientX - downX) > 8) this.dragged = true;
        if (this.dragged) this.panBy(-(e.clientX - prev.x) * k);
      } else if (pointers.size === 2) {
        this.dragged = true;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = ((a.x + b.x) / 2 - rect.left) * k;
        // 手指距離變化超過兩成才跳一格（每格都要重畫造景）
        if (pinchBase > 0 && (d / pinchBase > 1.2 || d / pinchBase < 0.83)) {
          this.zoomBy(d > pinchBase ? 1.25 : 0.8, mid);
          pinchBase = d;
        }
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinchBase = 0;
      const drag = this.scapeDrag;
      if (drag) {
        this.scapeDrag = null;
        const x = this.scape.dragX(drag.target);
        // 先通知（狀態更新成新位置），下一格才放掉拖曳中的位置，避免物件閃回原位
        if (drag.moved && x !== null) this.events.onScapeDrop?.(drag.target, x / this.bounds.width);
        this.scape.setDrag(null);
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    let wheelZoom = 0;
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.maxSpan <= 1) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const k = this.app.screen.width / Math.max(1, rect.width);
        if (e.ctrlKey) {
          wheelZoom += e.deltaY;
          if (Math.abs(wheelZoom) > 40) {
            this.zoomBy(wheelZoom < 0 ? 1.25 : 0.8, (e.clientX - rect.left) * k);
            wheelZoom = 0;
          }
        } else {
          this.panBy((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k);
        }
      },
      { passive: false },
    );
  }

  private syncFood(state: TankState, dt: number): void {
    const { width, surface, bottom } = this.waterBounds;
    const scale = this.motionScale;
    const target = visiblePellets(state.water.foodMg);
    // 飼料畫大一點：手機上原本只有幾個像素，暗缸裡幾乎看不到
    const r = Math.max(7, 13 * this.hs);
    // 缸裡已經滿是飼料時又撒一把：最舊的幾片先拿掉讓位，新撒的才看得到
    const fresh = state.water.foodMg - this.lastFoodMg;
    this.lastFoodMg = state.water.foodMg;
    if (!this.foodReset && fresh > 4 && this.food.length >= target) {
      const room = Math.min(this.food.length, Math.ceil(fresh / 2), 40);
      for (const p of this.food.splice(0, room)) p.s.destroy();
    }
    const add = target - this.food.length;
    if (add > 0) {
      let pellets: Pellet[];
      const lots = state.water.food ?? [];
      // 最新的那一批是剛撒下去的
      const kind = (lots[lots.length - 1]?.kind ?? 'floating') as FoodLook;
      if (this.foodReset || add < 2) {
        // 讀檔、換鏡頭：直接散在水裡，不演撒下去
        pellets = scatterPellets(add, width / 2, surface, width * 0.3, () => this.rand());
        for (const p of pellets) {
          const k = pickFoodKind(lots.length ? lots : [{ kind: 'floating', mg: 1 }], this.rand());
          applyFoodLook(p, k);
          (p as Pellet & { kind?: FoodLook }).kind = k;
          p.floatT = 0;
          p.y = k === 'sticky' ? surface + (bottom - surface) * 0.62 : surface + this.rand() * (bottom - surface);
        }
      } else if (kind === 'sticky') {
        // 黏缸壁錠：壓在前玻璃上一塊，碎屑圍在旁邊
        const x0 = width * (0.3 + this.rand() * 0.4);
        const y0 = surface + (bottom - surface) * 0.62;
        pellets = scatterPellets(add, x0, y0, r * 1.6, () => this.rand());
        for (const p of pellets) {
          p.y = y0 + (this.rand() - 0.5) * r * 2.4;
          applyFoodLook(p, kind);
        }
        this.tablet = { x: x0, y: y0, t: 0 };
      } else {
        // 撒一把：集中落在一處，水面泛起漣漪
        const dropX = width * (0.3 + this.rand() * 0.4);
        pellets = scatterPellets(add, dropX, surface, width * 0.06, () => this.rand());
        for (const p of pellets) applyFoodLook(p, kind);
        this.ripples.push({ x: dropX, t: 0 }, { x: dropX - width * 0.02, t: -0.18 }, { x: dropX + width * 0.025, t: -0.35 });
        this.dropT = 0;
        this.firstBitePending = true;
      }
      for (const p of pellets) {
        const k = (p as Pellet & { kind?: FoodLook }).kind ?? kind;
        const tex = k === 'sinking' ? pelletTextures() : k === 'meat' ? wormTextures() : k === 'sticky' ? pelletTextures() : flakeTextures();
        const s = new Sprite(tex[Math.floor(this.rand() * tex.length)]);
        s.anchor.set(0.5);
        const size = r * (k === 'sinking' || k === 'sticky' ? 0.55 : k === 'meat' ? 1.6 : 1) * (0.75 + this.rand() * 0.5);
        s.width = s.height = size;
        if (k === 'meat') s.height = size * 0.5;
        this.foodLayer.addChild(s);
        this.food.push({ ...p, s });
      }
    }
    this.foodReset = false;
    if (this.dropT >= 0) this.dropT += dt;
    this.drawTablet();
    // 模擬吃掉的份量：嘴邊那片被咬走，咬的魚往前一衝、噴出碎屑；沒魚碰到的就是沉底爛掉
    const views = [...this.fish.values()].filter((v) => v.mouth);
    const mouths = views.map((v) => v.mouth!);
    while (this.food.length > target) {
      const pick = pickEaten(this.food, mouths);
      const p = this.food.splice(pick.food, 1)[0];
      if (pick.eater !== null) {
        views[pick.eater].biteT = 0;
        if (this.firstBitePending) {
          this.firstBitePending = false;
          this.events.onFirstBite?.(views[pick.eater].swimmer.id);
        }
        // 魚咬到飼料冒一兩顆小氣泡
        if (!isShrimpSpecies(views[pick.eater].swimmer.species)) {
          for (let i = 0, n = 1 + Math.floor(this.rand() * 2); i < n; i++) {
            this.bubbles.push({ x: p.x + (this.rand() - 0.5) * 4, y: p.y - 2, r: (1.5 + this.rand() * 1.5) * this.hs, speed: 22 + this.rand() * 10 });
          }
        }
        for (let i = 0; i < 3; i++) {
          this.crumbs.push({ x: p.x, y: p.y, vx: (this.rand() - 0.5) * 30 * scale, vy: (this.rand() - 0.8) * 20 * scale, t: 0 });
        }
      }
      p.s.destroy();
    }
    for (const p of this.food) {
      stepPellet(p, dt, surface, floorAt(this.bounds, p.x) + 2, scale);
      p.s.position.set(p.x, p.y);
      p.s.rotation = p.rot;
      // 漂在水面時壓扁一點，像薄片平躺（顆粒、紅蟲不壓）
      if (!p.sink && !p.stuck) p.s.scale.y = Math.abs(p.s.scale.x) * (p.floatT > 0 ? 0.55 : 0.75 + 0.25 * Math.sin(p.phase * 3));
    }

    const fx = this.feedFx;
    fx.clear();
    this.ripples = this.ripples.filter((w) => (w.t += dt) < RIPPLE_SECONDS);
    for (const w of this.ripples) {
      if (w.t < 0) continue;
      const { r: rr, alpha } = ripple(w.t, 46 * this.hs);
      fx.ellipse(w.x, surface + 3, rr, rr * 0.22).stroke({ color: 0xffffff, alpha, width: Math.max(1, 2 * this.hs) });
    }
    // 手指點的地方：兩圈淡淡的水波往外散
    if (this.poke && this.poke.age < 0.9) {
      for (const lag of [0, 0.25]) {
        const t = this.poke.age - lag;
        if (t < 0) continue;
        const k = t / 0.65;
        if (k >= 1) continue;
        fx.circle(this.poke.x, this.poke.y, (8 + 30 * k) * this.hs).stroke({ color: 0xffffff, alpha: 0.55 * (1 - k), width: Math.max(1, 1.6 * this.hs) });
      }
    }
    this.crumbs = this.crumbs.filter((c) => (c.t += dt) < 0.6);
    for (const c of this.crumbs) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 20 * scale * dt;
      fx.circle(c.x, c.y, Math.max(1, 1.6 * this.hs)).fill({ color: 0xe8a050, alpha: 1 - c.t / 0.6 });
    }
  }

  /** 沙面的髒點：殘餌、魚便積在沙上，越髒越多；換水虹吸時一起吸掉。 */
  private drawDirt(state: TankState): void {
    const n = dirtSpots(state.water.organicMg / state.equipment.tank.volumeL);
    const key = `${n}:${this.sceneKey}`;
    if (key === this.dirtKey) return;
    this.dirtKey = key;
    const g = this.dirt.clear();
    const { width, bottom } = this.bounds;
    const hs = this.hs;
    const look = this.look;
    const color = look === 'bare' ? 0x5a4a30 : SUBSTRATE_PALETTES[look].dirt;
    // 位置固定（同一缸每次都在同樣的地方），越髒就多畫幾團
    let seed = 9173;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const x = r() * width;
      const top = sandSurface(look, x, width, bottom, hs) + 3 * hs;
      const lip = frontLip(look, x, width, bottom, hs) - 3 * hs;
      const y = look === 'bare' ? top - 2 * hs : top + r() * Math.max(1, lip - top);
      const size = (3 + r() * 5) * hs;
      for (let k = 0; k < 5; k++) {
        g.ellipse(x + (r() - 0.5) * size * 1.6, y + (r() - 0.5) * size * 0.4, size * (0.4 + r() * 0.5), size * (0.18 + r() * 0.15)).fill({ color, alpha: 0.22 + r() * 0.18 });
      }
    }
  }

  private syncMolts(state: TankState): void {
    const tex = paintedTexture('shrimp-molt');
    const live = new Set<string>();
    for (const m of state.molts ?? []) {
      const age = state.hours - m.hour;
      if (!tex || age >= 48) continue;
      const key = `${m.id}:${m.hour}`;
      live.add(key);
      let sp = this.moltSprites.get(key);
      if (!sp) {
        sp = new Sprite(tex);
        sp.anchor.set(0.5, 0.8);
        this.moltSprites.set(key, sp);
        this.moltLayer.addChild(sp);
      }
      // 位置跟著殼固定（同一個殼每次都在同一處）
      const { width, bottom } = this.bounds;
      const u = ((m.id * 7919 + Math.round(m.hour) * 104729) % 1000) / 1000;
      const x = width * (0.08 + 0.84 * u);
      const len = this.ppc * m.lengthCm * (EXAGGERATION.cherry_shrimp ?? 1.6);
      sp.position.set(x, floorY(this.look, x, width, bottom, this.hs) - 2 * this.hs);
      sp.scale.set(((u > 0.5 ? 1 : -1) * len) / tex.width, len / tex.width);
      sp.rotation = (u - 0.5) * 0.5;
      sp.alpha = 0.75 * Math.min(1, (48 - age) / 12);
    }
    for (const [key, sp] of this.moltSprites) {
      if (live.has(key)) continue;
      sp.destroy();
      this.moltSprites.delete(key);
    }
  }

  /** 黏缸壁錠：還有碎屑黏著就畫一塊圓餅，越吃越小，吃完就消失。 */
  private drawTablet(): void {
    const stuck = this.food.filter((p) => p.stuck).length;
    const tab = this.tablet;
    if (tab && tab.t === 0) tab.t = stuck;
    if (!tab || stuck === 0) {
      this.tablet = null;
      if (this.tabletSprite) this.tabletSprite.visible = false;
      return;
    }
    if (!this.tabletSprite) {
      this.tabletSprite = new Sprite(tabletTexture());
      this.tabletSprite.anchor.set(0.5);
      this.foodLayer.addChildAt(this.tabletSprite, 0);
    }
    const sp = this.tabletSprite;
    sp.visible = true;
    sp.position.set(tab.x, tab.y);
    sp.width = sp.height = Math.max(4, 9 * this.hs) * 4.5 * Math.sqrt(stuck / Math.max(1, tab.t));
  }

  /** 游動、距離用的縮放（舊版以 300 px 高的缸為 1）。 */
  private get motionScale(): number {
    return Math.max(0.5, this.ppc / 11);
  }

  /** 畫成哪個樣子：轉色前公母都是幼魚的樣子，看得出公母以後才換成公魚、母魚的圖。 */
  private formOf(fish: Fish): FishForm {
    const stage = growthStage(fish);
    if (stage === 'fry' || stage === 'juvenile') return 'juvenile';
    if (isShrimpSpecies(fish.species)) return stage === 'subadult' && !sexVisible(fish) ? 'juvenile' : fish.sex;
    return sexVisible(fish) ? fish.sex : 'juvenile';
  }

  /** 這隻魚畫面上的全長（像素，未含景深）。 */
  private lengthPx(fish: Fish): number {
    const sp = FISH_SPECIES[fish.species];
    return this.ppc * sp.adultLengthCm * (EXAGGERATION[fish.species] ?? 1.6) * Math.max(0.22, sizeRatio(fish));
  }

  private createView(fish: Fish): FishView {
    const holder = new Container();
    const glow = new Sprite(softDotTexture());
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.visible = false;
    const spots = new Graphics();
    const eggs = new Graphics();
    holder.addChild(glow);
    const crawler = isShrimpSpecies(fish.species);
    const z = crawler ? 0.7 + this.rand() * 0.3 : this.rand();
    const swimmer = spawnSwimmer(fish.id, fish.species, this.bounds, () => this.rand());
    const view: FishView = {
      swimmer,
      holder,
      rig: null as unknown as FishRig | PaintedRig,
      rigKey: '',
      glow,
      spots,
      eggs,
      ichDrawn: false,
      eggsDrawn: false,
      deathT: fish.alive ? -1 : DEATH_SECONDS,
      biteT: BITE_SECONDS,
      turn: { f: swimmer.vx < 0 ? 1 : -1, v: 0 },
      limbs: null,
      tone: '',
      mouth: null,
      z,
      zTarget: z,
      back: z < BACK_ENTER,
    };
    (view.back ? this.backFish : this.frontFish).addChild(holder);
    return view;
  }

  /** 這條魚現在的外觀：用哪張圖、補畫哪些鰭。key 一樣畫出來就一樣。 */
  private rigSpec(fish: Fish) {
    const form = this.formOf(fish);
    // 魚懷孕後期肚子才看得出來；蝦一抱卵就看得到。
    const gravid = form === 'female' && fish.pregnancy > (isShrimpSpecies(fish.species) ? 0 : 0.5);
    // 公孔雀魚照基因上色：雜交出來的組合也有自己的花色
    const painted = resolvePaintedKey(fish.species === 'guppy' && form === 'male' && fish.genome ? recipeKey(phenotypeRecipe(phenotype(fish.genome))) : paintedKey(fish.species, form, lookVariant(fish), gravid, growthStage(fish), !!fish.stuckMolt));
    // 鰭型到亞成魚才慢慢長出來（design/growth.md §1）
    const stage = growthStage(fish);
    const fins = fish.species === 'guppy' && form !== 'juvenile' && fish.genome && stage !== 'coloring' ? finTraitsOf(fish, painted) : null;
    const finKey = fins ? `${+fins.dumboArt}${+!!fins.traits.swallow}${+!!fins.traits.ribbon}${+!!fins.traits.dumbo}${+!!fins.traits.bigC}${fins.traits.sword ?? 0}${+!!fins.traits.halfmoon}` : '';
    const key = `${fish.species}:${form}:${gravid}:${painted ?? ''}:${finKey}`;
    return { form, gravid, painted, fins, key, look: appearance(fish.species, form, lookVariant(fish), gravid) };
  }

  /**
   * 這條魚的肖像（觀察卡、選育成功的慶祝卡）：用缸裡同一張圖和同樣補畫的鰭，頭朝右、不擺動，烘成一張圖。
   * 之前卡片用的是商店的代表圖，大C 會變成半月、雜交出來的花色也對不上（畫面評測 V24、V25）。
   */
  portrait(fish: Fish): string | null {
    const spec = this.rigSpec(fish);
    const hit = this.portraits.get(spec.key);
    if (hit !== undefined) return hit;
    const tex = paintedTexture(spec.painted);
    if (!tex || !spec.painted) return null;
    const rig = new PaintedRig(spec.painted, tex, spec.look);
    if (spec.fins) drawFinOverlay(rig, spec.fins, this.app.renderer);
    rig.scale.x = -1;
    const wrap = new Container();
    wrap.addChild(rig);
    let url: string | null = null;
    try {
      const canvas = this.app.renderer.extract.canvas({ target: wrap, antialias: true }) as HTMLCanvasElement;
      url = canvas.toDataURL('image/webp', 0.9);
    } catch {
      url = null;
    }
    wrap.destroy({ children: true });
    if (this.portraits.size >= 24) this.portraits.delete(this.portraits.keys().next().value!);
    this.portraits.set(spec.key, url);
    return url;
  }

  /** 外觀改變（長大、轉成公母、懷孕）時重組圖層。 */
  private applyRig(view: FishView, fish: Fish): void {
    const { painted, fins, key, look } = this.rigSpec(fish);
    if (key === view.rigKey) return;
    view.rigKey = key;
    // 卵和白點圖層每次換外觀都沿用：先從舊圖層拿出來，不然會跟著被銷毀，之後再畫到就當掉
    view.eggs.removeFromParent();
    view.spots.removeFromParent();
    view.rig?.destroy({ children: true });
    const tex = paintedTexture(painted);
    view.rig = tex && painted ? new PaintedRig(painted, tex, look) : new FishRig(fish.species, look);
    view.tone = '';
    view.rig.addChildAt(view.eggs, 0);
    view.rig.addChild(view.spots);
    if (fins) drawFinOverlay(view.rig, fins, this.app.renderer);
    // 腳的圖層是舊外觀的子圖層，上面已經一起銷毀了
    view.limbs = null;
    if (isShrimpSpecies(fish.species) && view.rig instanceof PaintedRig) {
      view.limbs = new Graphics();
      view.rig.addChild(view.limbs);
    }
    view.holder.addChild(view.rig);
    view.ichDrawn = false;
    view.eggsDrawn = false;
  }

  /** 蝦：兩支小螯輪流夾底沙、抱蛋母蝦搧腹足、走路時步足擺、受驚時身體一縮。 */
  private drawShrimpLimbs(view: FishView, fish: Fish, dt: number): void {
    const rig = view.rig;
    const g = view.limbs;
    if (!(rig instanceof PaintedRig) || !g) return;
    g.clear();
    const s = view.swimmer;
    const scale = this.motionScale;
    const speedRatio = Math.min(1, Math.abs(s.vx) / (10 * scale));
    rig.walk = fish.alive && !(s.startle! > 0) ? speedRatio : 0;
    if (!fish.alive) return;
    if (s.startle! > 0) {
      // 尾巴一收：身體縮短、往後彈
      const k = s.startle! / STARTLE_SECONDS;
      rig.scale.x *= 1 - 0.18 * Math.sin(Math.PI * k);
      return;
    }
    const w = rig.lengthPx, h = rig.heightPx;
    const at = (p: Pt) => ({ x: -(p.x - 0.5) * w, y: (p.y - 0.5) * h });
    const t = this.time + fish.id * 0.37;
    const width = w * 0.012;
    const color = fish.sex === 'female' && !isJuvenile(fish) ? 0xc8402c : 0xe06a50;
    // 抱蛋母蝦的腹足（畫在螯後面）
    if (fish.sex === 'female' && fish.pregnancy > 0) {
      for (const leg of pleopods(t, true)) {
        const a = at(leg.from), b = at(leg.to);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
      g.stroke({ color, alpha: 0.75, width: width * 0.8, cap: 'round' });
    }
    const { rate, reach } = clawRate(!!s.eating, speedRatio);
    for (const i of [0, 1]) {
      const c = clawPose(t, rate, i, reach);
      const a = at(c.base), e = at(c.elbow), tip = at(c.tip);
      g.moveTo(a.x, a.y).lineTo(e.x, e.y).lineTo(tip.x, tip.y).stroke({ color, alpha: 0.85, width, cap: 'round', join: 'round' });
      // 小鉗子：兩根短指，張開或夾緊
      const dx = tip.x - e.x, dy = tip.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const f = w * 0.028, spread = 0.15 + 0.5 * c.open;
      for (const sgn of [-1, 1]) {
        const ang = Math.atan2(uy, ux) + sgn * spread;
        g.moveTo(tip.x, tip.y).lineTo(tip.x + Math.cos(ang) * f, tip.y + Math.sin(ang) * f);
      }
      g.stroke({ color: 0xf08a6a, alpha: 0.9, width: width * 0.7, cap: 'round' });
    }
    void dt;
  }

  private syncFish(state: TankState, dt: number): void {
    const present = new Set<number>();
    for (const fish of state.fish) {
      present.add(fish.id);
      let view = this.fish.get(fish.id);
      if (!view) {
        view = this.createView(fish);
        this.fish.set(fish.id, view);
      }
      this.applyRig(view, fish);
    }
    for (const [id, view] of this.fish) {
      if (!present.has(id)) {
        view.holder.destroy({ children: true });
        this.fish.delete(id);
      }
    }

    const all = [...this.fish.values()].map((v) => v.swimmer);
    const alive = new Set(state.fish.filter((f) => f.alive).map((f) => f.id));
    const living = all.filter((s) => alive.has(s.id));
    if (this.poke && (this.poke.age += dt) > POKE_SECONDS) this.poke = null;
    const ctx = { bounds: this.waterBounds, scale: this.motionScale, food: this.food, frenzy: this.food.length ? frenzyLevel(this.dropT) : 0, poke: this.poke ?? undefined };
    for (const fish of state.fish) {
      const view = this.fish.get(fish.id)!;
      const { swimmer, rig } = view;
      const symptoms = observeSymptoms(state, fish);
      const follow = fish.guardian !== undefined && alive.has(fish.guardian) ? fish.guardian : undefined;
      const nestX = this.nestFor(fish, swimmer.x, dt);
      // 身體大小（上一格的景深）：讓整條魚留在缸裡
      const halfLen = this.lengthPx(fish) * (0.72 + 0.33 * view.z) * 0.5;
      const body = { halfLen, halfH: halfLen * ('heightPx' in rig ? rig.heightPx / Math.max(1, rig.lengthPx) : 0.35) };
      const mood = isShrimpSpecies(fish.species) ? undefined : personalitySpec(fish);
      updateSwimmer(swimmer, living, { alive: fish.alive, hungry: fish.hunger > 0.15 && follow === undefined && nestX === undefined, symptoms, follow, guarding: isGuarding(fish), nestX, body, begging: hungerLook(fish.hunger).begging, mood }, ctx, dt, () => this.rand());

      // 景深：魚慢慢在前後之間游動；遠的小一點、模糊偏藍，畫在造景後面。
      if (!isShrimpSpecies(fish.species) && fish.alive) {
        // 愛炫耀的常游到前面來展示（F6）
        if (this.rand() < dt * 0.04) view.zTarget = mood && mood.display > 0.5 ? 0.55 + this.rand() * 0.45 : this.rand();
        view.z += (view.zTarget - view.z) * Math.min(1, dt * 0.25);
      }
      const back = view.back ? view.z < BACK_LEAVE : view.z < BACK_ENTER;
      if (back !== view.back) {
        view.back = back;
        (back ? this.backFish : this.frontFish).addChild(view.holder);
      }
      const depth = 0.72 + 0.33 * view.z;

      view.holder.position.set(swimmer.x, swimmer.y);
      // 圖層是頭朝左畫的：往右游時水平翻轉。轉身時身體先壓窄再彈回，不是瞬間翻面。
      // 蝦受驚往後彈開時頭的方向不變
      if (fish.alive && !(swimmer.startle! > 0)) stepTurn(view.turn, swimmer.vx, dt, swimmer.eating && !isShrimpSpecies(fish.species));
      const facingLeft = view.turn.f > 0;
      const turn = turnScale(view.turn.f);
      const k = (this.lengthPx(fish) / rig.lengthPx) * depth;
      rig.scale.x = k * turn.sx;
      if (!fish.alive) {
        // 死亡演出：最後抽動幾下，慢慢翻成白肚朝上、褪成灰色，一邊沉到底
        view.deathT = view.deathT < 0 ? 0 : view.deathT + dt;
        const pose = deathPose(view.deathT, isShrimpSpecies(fish.species));
        rig.scale.y = k * pose.flip;
        rig.rotation = facingLeft ? -pose.tilt : pose.tilt;
        rig.alpha = rig.look.alpha * (1 - 0.25 * pose.fade);
        rig.setDim(pose.fade < 0.02 ? null : mix(0xffffff, 0x8a8a8a, pose.fade));
        if (view.deathT < DEATH_SECONDS) rig.animate(view.deathT * 9, pose.swing, 0.6, fish.finDamage);
      } else {
        view.deathT = -1;
        // 生病的樣子：越虛弱顏色越淡、消瘦變扁、癢的時候突然側身蹭一下
        const sick = sickLook(symptoms, fish.health, this.time, fish.id);
        rig.scale.y = k * turn.sy * sick.thin * hungerLook(fish.hunger).thin * (1 - 0.55 * sick.flash);
        rig.alpha = rig.look.alpha;
        rig.setDim(sick.dim);
        const tilt = symptoms.includes('loss_of_balance') ? 1.2 : swimTilt(swimmer) + 0.5 * sick.flash;
        rig.rotation = facingLeft ? tilt : -tilt;
        const clamped = symptoms.includes('clamped_fins');
        // 停在飼料旁邊吃：尾巴只輕輕擺著平衡
        const hovering = swimmer.eating && !isShrimpSpecies(fish.species);
        rig.animate(swimmer.phase, clamped ? 0.25 : hovering ? 0.35 : 1, clamped ? 0.55 : 1, fish.finDamage);
      }
      // 咬一口：身體只往前吸一點點，動作集中在張嘴
      const len = this.lengthPx(fish) * depth;
      const dir = facingLeft ? -1 : 1;
      view.biteT += dt;
      const kick = biteKick(view.biteT);
      if (kick > 0 && !isShrimpSpecies(fish.species)) {
        const m = biteMotion(kick);
        view.holder.x += dir * m.dx * len;
        rig.rotation += dir * m.rot;
        rig.scale.x *= m.sx;
        rig.scale.y *= m.sy;
      }
      if (rig instanceof PaintedRig) rig.setMouthOpen(isShrimpSpecies(fish.species) ? 0 : mouthOpenness(kick));
      if (isShrimpSpecies(fish.species)) this.drawShrimpLimbs(view, fish, dt);
      // 長期餵好飼料：顏色更飽和、更亮（只是表現，停餵會退）
      // 轉色期顏色從淡慢慢變濃，老魚顏色變淡（design/growth.md §1、§5）
      const boost = fish.alive ? Math.round((fish.colorBoost ?? 0) * 4) / 4 : 0;
      const stage = growthStage(fish);
      // 短鯛母魚平常灰黃，帶小孩時轉成鮮黃加黑紋（漸變）
      const brood = fish.species === 'apisto' && fish.sex === 'female' && sexVisible(fish) ? (1 - (fish.broodColor ?? 0)) * 0.75 : 0;
      const fade = Math.min(0.9, (stage === 'coloring' ? (1 - colorProgress(fish)) * 0.8 : stage === 'old' ? 0.5 : 0) + brood);
      const sat = Math.round((boost * 0.45 - fade) * 10) / 10;
      const tone = `${sat}:${boost}`;
      if (tone !== view.tone) {
        view.tone = tone;
        if (rig instanceof PaintedRig) {
          // 精繪圖：色調烘進快取的貼圖，不掛濾鏡（I1）
          // 統一調色（畫面評測 V15）：寫實的魚圖整體加一點飽和與亮度，配上插畫風的缸
          const q = quantizeTone(sat + ART_SAT, (1 + boost * 0.08 - (stage === 'old' ? 0.06 : 0)) * ART_BRIGHT);
          rig.setTone(q.sat, q.bright);
        } else if (sat !== 0 || boost > 0) {
          const f = new ColorMatrixFilter();
          f.saturate(sat, false);
          f.brightness(1 + boost * 0.08 - (stage === 'old' ? 0.06 : 0), true);
          view.rig.filters = [f];
        } else view.rig.filters = [];
      }
      view.mouth = fish.alive ? { x: swimmer.x + dir * len * 0.25, y: swimmer.y, reach: Math.max(10, len * 0.55) } : null;
      const spotted = fish.alive && symptoms.includes('white_spots');
      if (spotted !== view.ichDrawn) {
        drawIchSpots(view.spots, rig, spotted ? 12 : 0);
        view.ichDrawn = spotted;
      }
      // 抱卵的母蝦：肚子下面一團黃綠色的卵
      const berried = fish.alive && isShrimpSpecies(fish.species) && fish.pregnancy > 0 && !rig.drawsEggs;
      if (berried !== view.eggsDrawn) {
        view.eggs.clear();
        if (berried) {
          const R = rig.art.R;
          for (let i = 0; i < 8; i++) view.eggs.circle((4 + i * 3.2 - 5) * R, (8 + (i % 2) * 2.2) * R, 2.4 * R).fill({ color: 0xd8e24a, alpha: 0.9 });
        }
        view.eggsDrawn = berried;
      }
      // 選取的魚：身後一圈柔和的金色光暈
      const selected = this.selectedFish === fish.id;
      view.glow.visible = selected;
      rig.setRim(selected ? 0xffe9b0 : null, 0.75 + 0.25 * Math.sin(this.time * 3), this.quality.softGlow);
      if (selected) {
        const r = this.lengthPx(fish) * depth * 1.5;
        view.glow.width = r;
        view.glow.height = r * 0.75;
        view.glow.tint = 0xffe2a0;
        view.glow.alpha = 0.55 + 0.15 * Math.sin(this.time * 3);
      }
    }
  }

  private syncPlants(state: TankState): void {
    const present = new Set(state.plants.map((p) => p.id));
    for (const [id, view] of this.plants) {
      if (!present.has(id)) {
        view.rig?.destroy();
        view.holder.destroy({ children: true });
        this.plants.delete(id);
      }
    }
    const t = state.hours;
    // 過濾器開著水流比較強，水草擺得比較明顯
    const flow = state.equipment.filter?.on ? 1 : 0.35;
    for (const plant of state.plants) {
      let view = this.plants.get(plant.id);
      if (!view) {
        view = { holder: new Container(), rig: null, drawnBiomass: -1, drawnAlgae: -1, drawnMelting: false, drawnRes: 0, seenBiomass: -1 };
        this.plants.set(plant.id, view);
      }
      // 剛剪過：從目前的圖切下葉尖當插枝飄走（要在重畫、舊圖被銷毀之前）
      const cut = view.seenBiomass < 0 ? 0 : cuttingsFromDrop(view.seenBiomass, plant.biomassG, PLANT_SPECIES[plant.species].cuttingMassG);
      view.seenBiomass = plant.biomassG;
      if (cut > 0 && view.rig) this.spawnCuttings(view, cut);
      const melting = plant.growthRate < -0.0002;
      if (
        view.drawnBiomass < 0 ||
        view.drawnRes !== this.pixelRatio ||
        Math.abs(view.drawnBiomass - plant.biomassG) > 0.05 * Math.max(1, plant.biomassG) ||
        Math.abs(view.drawnAlgae - plant.leafAlgae) > 0.05 ||
        view.drawnMelting !== melting
      ) {
        const painting = paintPlant(plant, this.hs, Math.max(1, Math.min(this.pixelRatio, 2)));
        view.rig?.destroy();
        view.rig = new PlantMesh(painting.texture, painting.anchorX, painting.anchorY);
        view.holder.addChild(view.rig.mesh);
        view.drawnBiomass = plant.biomassG;
        view.drawnAlgae = plant.leafAlgae;
        view.drawnMelting = melting;
        view.drawnRes = this.pixelRatio;
      }
      // 種在哪一層、哪個位置（造景編輯）：後景小一點、淡一點，前景大一點
      const place = plantPlacement(plant);
      const look = LAYER_LOOK[place.layer];
      const layer = this.scape.plants[place.layer];
      if (view.holder.parent !== layer) layer.addChild(view.holder);
      const x = this.scape.dragX({ kind: 'plant', id: plant.id }) ?? this.bounds.width * place.x;
      view.holder.position.set(x, this.bounds.bottom + (14 + look.dy) * this.hs);
      view.holder.scale.set(place.flip ? -look.scale : look.scale, look.scale);
      // 水流造成的搖擺：根部不動、葉尖擺最多
      const tall = view.rig!.mesh.texture.height;
      view.rig!.sway(t * 6 + plant.id + this.time * 1.1, tall * 0.045 * flow);
    }
  }


  /** 顧泡巢的公鬥魚：泡巢在牠開始顧的地方，吐了半天才長滿；顧完了泡巢慢慢散掉（在 drawNests 裡）。 */
  private nestFor(fish: Fish, x: number, dt: number): number | undefined {
    if (!fish.alive || !fish.brood || PARENTAL[fish.species]?.site !== 'bubble') return undefined;
    let nest = this.nests.get(fish.id);
    if (!nest) {
      const w = this.bounds.width;
      nest = { x: Math.min(w * 0.85, Math.max(w * 0.15, x)), size: 0.15 };
      this.nests.set(fish.id, nest);
    }
    nest.size = Math.min(1, nest.size + dt * 0.08);
    return nest.x;
  }

  /** 泡巢：水面一團細小的泡泡，中間厚、邊緣薄，跟著水面輕輕晃。 */
  private drawNests(state: TankState, g: Graphics, dt: number): void {
    const hs = this.hs;
    const surface = this.waterBounds.surface;
    for (const [id, nest] of this.nests) {
      const owner = state.fish.find((f) => f.id === id);
      if (!owner?.alive || !owner.brood) {
        nest.size -= dt * 0.03;
        if (nest.size <= 0) this.nests.delete(id);
      }
      if (nest.size <= 0) continue;
      const half = 60 * hs * Math.sqrt(nest.size);
      const n = Math.round(110 * nest.size);
      for (let i = 0; i < n; i++) {
        // 固定的擺法（不每幀亂跳）：越靠中間堆越厚
        const u = ((i * 0.618034) % 1) * 2 - 1;
        const v = (i * 0.414214) % 1;
        const bx = nest.x + u * half + Math.sin(this.time * 0.8 + i) * 0.6 * hs;
        const by = surface + 4 * hs - v * (1 - u * u) * 9 * hs + (1 - u * u) * 3 * hs;
        const r = (1.8 + ((i * 0.7548) % 1) * 2.4) * hs;
        g.circle(bx, by, r).fill({ color: 0xffffff, alpha: 0.28 }).stroke({ color: 0xf2fcff, width: Math.max(0.8, r * 0.3), alpha: 0.75 * Math.min(1, nest.size * 2) });
        if (i % 3 === 0) g.circle(bx - r * 0.35, by - r * 0.35, r * 0.25).fill({ color: 0xffffff, alpha: 0.8 });
      }
    }
  }

  private updateBubbles(state: TankState, dt: number): void {
    const { width, surface, bottom } = this.bounds;
    const hs = this.hs;
    const power = !state.environment.powerOut;
    const eq = state.equipment;
    const spawn = (x: number, y: number, r: number, rate: number) => {
      if (this.rand() < rate * dt) this.bubbles.push({ x, y, r, speed: (30 + this.rand() * 30) * this.motionScale });
    };
    if (power && eq.airPump?.on) spawn(width - 40 * hs - 16 + (this.rand() - 0.5) * 8 * hs, bottom - 14 * hs, (3 + this.rand() * 4) * hs, 16);
    if (power && eq.filter?.on && eq.filter.spec.id === 'sponge') spawn(90 * hs + 20, bottom - 150 * hs, 3 * hs, 14);
    if (eq.co2 && isCo2Injecting(state)) spawn(width * 0.6 + (this.rand() - 0.5) * 6 * hs, bottom - 44 * hs, 1.5 * hs, 12);

    const g = this.bubbleLayer.clear();
    this.bubbles = this.bubbles.filter((b) => b.y > surface - 30);
    for (const b of this.bubbles) {
      b.y -= b.speed * dt;
      b.x += Math.sin(b.y * 0.08) * 0.3;
      const r = Math.max(1.2, b.r);
      g.circle(b.x, b.y, r).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ color: 0xe8fbff, width: Math.max(0.8, r * 0.25), alpha: 0.7 });
      g.circle(b.x - r * 0.35, b.y - r * 0.35, r * 0.28).fill({ color: 0xffffff, alpha: 0.85 });
    }
    this.drawNests(state, g, dt);
  }

  private drawOverlay(state: TankState): void {
    const { width, height, surface, bottom } = this.bounds;
    const g = this.overlay.clear();
    // 混濁：有機物與細菌濃度高時水變黃綠
    const turbidity = Math.min(0.35, state.water.organicMg / 4000 + state.water.tan / 20);
    if (turbidity > 0.02) g.rect(0, 0, width, height).fill({ color: 0x8a8a3a, alpha: turbidity });
    // 剛動過造景：攪起來的細沙讓水白濁，底下最濃，慢慢沉澱
    const silt = state.water.turbidity ?? 0;
    if (silt > 0.01) {
      g.rect(0, surface, width, bottom - surface).fill({ color: 0xc9c1a4, alpha: Math.min(0.5, silt * 0.55) });
      g.rect(0, surface + (bottom - surface) * 0.55, width, (bottom - surface) * 0.6).fill({ color: 0xb8ad8a, alpha: Math.min(0.35, silt * 0.4) });
    }
    // 缸壁藻類：四周與角落較濃
    if (state.algae > 0.02) {
      const a = state.algae;
      g.rect(0, 0, width, height).fill({ color: 0x4f8a2a, alpha: a * 0.25 });
      for (let i = 0; i < 40 * a; i++) {
        const x = (i * 131) % width;
        const edge = i % 2 === 0 ? surface + ((i * 17) % 60) : bottom - ((i * 23) % 80);
        g.circle(x, edge, (10 + (i % 5) * 7) * this.hs).fill({ color: 0x3f7a22, alpha: a * 0.3 });
      }
    }
    // 夜晚（關燈或停電）：月光藍，魚還看得清楚（原本整片灰暗，新玩家第一眼就是暗畫面）；開關燈慢慢轉換
    if (this.night > 0.01) {
      g.rect(0, 0, width, height).fill({ color: 0x0a2246, alpha: 0.34 * this.night });
      // 水面透下來的一點月光：上面亮一點
      g.rect(0, surface, width, (bottom - surface) * 0.35).fill({ color: 0x9fc4ff, alpha: 0.05 * this.night });
    }
  }
}

/** 魚圖的基本調色：飽和度加多少、亮度乘多少。 */
const ART_SAT = 0.2;
const ART_BRIGHT = 1.05;

/** 白點病的白點：固定位置的小白點（座標是魚的圖層像素，以魚中心為原點）。 */
function drawIchSpots(g: Graphics, rig: FishRig | PaintedRig, count: number): void {
  g.clear();
  const { bodyEllipse: e, R } = rig.art;
  for (let i = 0; i < count; i++) {
    const a = (i * 2.399) % (Math.PI * 2);
    const r = 0.25 + (((i * 37) % 10) / 10) * 0.7;
    g.circle((e.x + Math.cos(a) * e.rx * r) * R, (e.y + Math.sin(a) * e.ry * r) * R, Math.max(1.5, e.ry * 0.09 * R)).fill({ color: 0xffffff, alpha: 0.95 });
  }
}

/** 由上往下從透明到不透明的漸層（焦散的遮罩）。 */
function fadeTexture(): Texture {
  const { canvas, ctx } = makeCanvas(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.75, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return canvasTexture(canvas, false);
}
