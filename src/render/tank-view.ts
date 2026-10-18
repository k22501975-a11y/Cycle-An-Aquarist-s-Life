import { Application, BlurFilter, Container, FederatedPointerEvent, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { FISH_SPECIES, PLANT_SPECIES, isCo2Injecting, isJuvenile, isLightOn, lookVariant, observeSymptoms, phenotype, sizeRatio, tankSize, type Fish, type TankState, type TestKitReading } from '../sim';
import { appearance, FishRig, type FishForm } from './fish-art';
import { PaintedRig, paintedKey, paintedTexture } from './painted';
import { DEATH_SECONDS, deathPose, sickLook, spawnSwimmer, stepTurn, turnScale, updateSwimmer, type Swimmer, type TurnState } from './fish-motion';
import { pxPerCm, sceneBounds, type Insets, type TankBounds } from './layout';
import { BITE_SECONDS, biteKick, pickEaten, ripple, RIPPLE_SECONDS, scatterPellets, stepPellet, type Mouth, type Pellet } from './feeding';
import { canvasTexture, flakeTextures, makeCanvas, mix, softDotTexture } from './paint';
import { cuttingsFromDrop, inferFraction, kitColor, tubeFrame, waterChangeFrame, TEST_SECONDS, WATER_CHANGE_SECONDS, type KitParam } from './ops-fx';
import { PlantMesh } from './plant-sway';
import { phenotypeRecipe, recipeKey } from './phenotype-art';
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
}

/** 魚畫得比真實比例大一些（遊戲裡要看得清楚品系花紋）。 */
const EXAGGERATION: Record<string, number> = { guppy: 1.8, zebrafish: 1.6, cherry_shrimp: 1.8 };
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
  private readonly backdrop = new Sprite();
  private readonly backFish = new Container();
  private readonly driftwood = new Sprite();
  private readonly plantLayer = new Container();
  private readonly front = new Sprite();
  private readonly causticsLayer = new Container();
  private readonly causticsA: TilingSprite;
  private readonly causticsB: TilingSprite;
  private readonly causticsMask = new Sprite();
  private readonly gear = new Graphics();
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
  private readonly tubeLabels = new Container();
  /** 大缸滑動時的位置條（固定在畫面上）。 */
  private readonly scrollBar = new Graphics();
  private readonly overlay = new Graphics();
  private readonly vignette = new Sprite();

  private insets: Insets = { top: 0, bottom: 0 };
  private bounds: TankBounds;
  /** 每公分幾像素（鏡頭）。 */
  private ppc = 10;
  /** 相對示意圖的鏡頭倍率：造景、設備的大小。 */
  private hs = 1;
  private sceneKey = '';
  private readonly depthBlur = new BlurFilter({ strength: 2.5, quality: 2 });
  private quality: QualitySpec = qualitySpec('high', 2);
  private fish = new Map<number, FishView>();
  private plants = new Map<number, PlantView>();
  private food: FoodParticle[] = [];
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
  private crumbs: Crumb[] = [];
  /** 飼料剛因重新排版清空：補回去時不演撒飼料。 */
  private foodReset = true;
  private bubbles: Bubble[] = [];
  private motes: Mote[] = [];
  private rays: Ray[] = [];
  private selectedFish: number | null = null;
  private seed = 12345;
  private time = 0;

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
      this.backFish,
      this.driftwood,
      this.plantLayer,
      this.front,
      this.causticsLayer,
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
      this.tubeLabels,
      this.overlay,
      this.vignette,
      this.scrollBar,
    );
    this.root.eventMode = 'static';
    this.root.on('pointertap', (e: FederatedPointerEvent) => {
      if (this.dragged) return;
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
    const key = `${screen.width}x${screen.height}:${this.insets.top},${this.insets.bottom}:${size.w}x${size.h}:${this.cam.span}`;
    if (key === this.sceneKey) return;
    this.sceneKey = key;
    const oldWidth = this.bounds.width;
    // 大缸畫得比畫面寬（span 倍），整個場景用 root.x 左右移動
    const b = (this.bounds = sceneBounds(screen.width * this.cam.span, screen.height, this.insets));
    if (oldWidth > 0 && oldWidth !== b.width) for (const v of this.fish.values()) v.swimmer.x *= b.width / oldWidth;
    this.ppc = pxPerCm(b, size);
    this.hs = this.ppc / MOCKUP_PX_PER_CM;
    this.root.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x <= b.width && y <= b.height };

    const swap = (sprite: Sprite, tex: Texture) => {
      const old = sprite.texture;
      sprite.texture = tex;
      sprite.width = b.width;
      sprite.height = b.height;
      if (old !== Texture.EMPTY && old !== tex) old.destroy(true);
    };
    swap(this.backdrop, paintBackdrop(b, this.hs));
    swap(this.driftwood, paintDriftwood(b, this.hs));
    swap(this.front, paintFront(b, this.hs));
    swap(this.vignette, paintVignette(b.width, b.height));

    // 焦散：主要照在底沙上，往上漸漸消失
    for (const [c, scale] of [[this.causticsA, 1.2], [this.causticsB, 0.8]] as const) {
      c.width = b.width;
      c.height = b.height;
      c.tileScale.set(scale * Math.max(0.6, this.hs) * 1.6);
    }
    // 遮罩用柔和的漸層（從水中段淡入，到底沙最亮）
    if (this.causticsMask.texture === Texture.EMPTY) this.causticsMask.texture = fadeTexture();
    const y0 = b.surface + (b.bottom - b.surface) * 0.3;
    this.causticsMask.position.set(0, y0);
    this.causticsMask.width = b.width;
    this.causticsMask.height = b.height - y0;
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
      const bb = view.holder.getBounds();
      if (x >= bb.minX + bb.width * 0.2 && x <= bb.maxX - bb.width * 0.2 && y >= bb.minY && y <= bb.maxY) {
        this.events.onSelectPlant?.(id);
        return;
      }
    }
    this.events.onSelectFish?.(null);
  }

  /** 每個畫面呼叫一次。realDt 為現實經過的秒數（動畫用）。 */
  update(state: TankState, realDt: number): void {
    const dt = Math.min(0.1, realDt);
    this.time += dt;
    this.layout(state);
    this.detectOps(state, dt);
    this.syncFood(state, dt);
    this.syncFish(state, dt);
    this.syncPlants(state);
    this.drawOps(dt);
    this.drawGear(state);
    this.animateLight(state, dt);
    this.updateBubbles(state, dt);
    this.drawOverlay(state);
  }

  /** 光束緩慢飄移、焦散流動、粒子漂浮。關燈時光束和焦散消失。 */
  private animateLight(state: TankState, dt: number): void {
    const lit = isLightOn(state);
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
      this.causticsA.alpha = 0.22 + 0.06 * Math.sin(t * 0.8);
      this.causticsB.alpha = 0.18 + 0.06 * Math.sin(t * 0.6 + 1);
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

    if (eq.filter?.spec.id === 'hangOn') {
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
      g.roundRect(hx, hy, 16 * hs, hh, 8 * hs).fill({ color: 0xe8fbff, alpha: 0.18 }).stroke(glass);
      g.roundRect(hx + 4 * hs, hy + hh * 0.46, 8 * hs, hh * 0.48, 4 * hs).fill(element);
      g.roundRect(hx + 3 * hs, hy + 6 * hs, 2.5 * hs, hh - 12 * hs, 1.5 * hs).fill({ color: 0xffffff, alpha: 0.45 });
      g.roundRect(hx + 1 * hs, hy - 10 * hs, 14 * hs, 14 * hs, 4 * hs).fill(0x1f2a33);
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
    canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    const target = Math.min(80, Math.ceil(state.water.foodMg / 2));
    const r = Math.max(4, 9 * this.hs);
    const add = target - this.food.length;
    if (add > 0) {
      let pellets: Pellet[];
      if (this.foodReset || add < 2) {
        // 讀檔、換鏡頭：直接散在水裡，不演撒下去
        pellets = scatterPellets(add, width / 2, surface, width * 0.3, () => this.rand());
        for (const p of pellets) {
          p.floatT = 0;
          p.y = surface + this.rand() * (bottom - surface);
        }
      } else {
        // 撒一把：集中落在一處，水面泛起漣漪
        const dropX = width * (0.3 + this.rand() * 0.4);
        pellets = scatterPellets(add, dropX, surface, width * 0.06, () => this.rand());
        this.ripples.push({ x: dropX, t: 0 }, { x: dropX - width * 0.02, t: -0.18 }, { x: dropX + width * 0.025, t: -0.35 });
      }
      const tex = flakeTextures();
      for (const p of pellets) {
        const s = new Sprite(tex[Math.floor(this.rand() * tex.length)]);
        s.anchor.set(0.5);
        s.width = s.height = r * (0.75 + this.rand() * 0.5);
        this.foodLayer.addChild(s);
        this.food.push({ ...p, s });
      }
    }
    this.foodReset = false;
    // 模擬吃掉的份量：嘴邊那片被咬走，咬的魚往前一衝、噴出碎屑；沒魚碰到的就是沉底爛掉
    const views = [...this.fish.values()].filter((v) => v.mouth);
    const mouths = views.map((v) => v.mouth!);
    while (this.food.length > target) {
      const pick = pickEaten(this.food, mouths);
      const p = this.food.splice(pick.food, 1)[0];
      if (pick.eater !== null) {
        views[pick.eater].biteT = 0;
        for (let i = 0; i < 3; i++) {
          this.crumbs.push({ x: p.x, y: p.y, vx: (this.rand() - 0.5) * 30 * scale, vy: (this.rand() - 0.8) * 20 * scale, t: 0 });
        }
      }
      p.s.destroy();
    }
    for (const p of this.food) {
      stepPellet(p, dt, surface, bottom, scale);
      p.s.position.set(p.x, p.y);
      p.s.rotation = p.rot;
      // 漂在水面時壓扁一點，像薄片平躺
      p.s.scale.y = Math.abs(p.s.scale.x) * (p.floatT > 0 ? 0.55 : 0.75 + 0.25 * Math.sin(p.phase * 3));
    }

    const fx = this.feedFx;
    fx.clear();
    this.ripples = this.ripples.filter((w) => (w.t += dt) < RIPPLE_SECONDS);
    for (const w of this.ripples) {
      if (w.t < 0) continue;
      const { r: rr, alpha } = ripple(w.t, 46 * this.hs);
      fx.ellipse(w.x, surface + 3, rr, rr * 0.22).stroke({ color: 0xffffff, alpha, width: Math.max(1, 2 * this.hs) });
    }
    this.crumbs = this.crumbs.filter((c) => (c.t += dt) < 0.6);
    for (const c of this.crumbs) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 20 * scale * dt;
      fx.circle(c.x, c.y, Math.max(1, 1.6 * this.hs)).fill({ color: 0xe8a050, alpha: 1 - c.t / 0.6 });
    }
  }

  /** 游動、距離用的縮放（舊版以 300 px 高的缸為 1）。 */
  private get motionScale(): number {
    return Math.max(0.5, this.ppc / 11);
  }

  private formOf(fish: Fish): FishForm {
    return isJuvenile(fish) ? 'juvenile' : fish.sex;
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
    const crawler = fish.species === 'cherry_shrimp';
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
      mouth: null,
      z,
      zTarget: z,
      back: z < BACK_ENTER,
    };
    (view.back ? this.backFish : this.frontFish).addChild(holder);
    return view;
  }

  /** 外觀改變（長大、轉成公母、懷孕）時重組圖層。 */
  private applyRig(view: FishView, fish: Fish): void {
    const form = this.formOf(fish);
    // 魚懷孕後期肚子才看得出來；蝦一抱卵就看得到。
    const gravid = form === 'female' && fish.pregnancy > (fish.species === 'cherry_shrimp' ? 0 : 0.5);
    // 公孔雀魚照基因上色：雜交出來的組合也有自己的花色
    const painted = fish.species === 'guppy' && form === 'male' && fish.genome ? recipeKey(phenotypeRecipe(phenotype(fish.genome))) : paintedKey(fish.species, form, lookVariant(fish), gravid);
    const key = `${fish.species}:${form}:${gravid}:${painted ?? ''}`;
    if (key === view.rigKey) return;
    view.rigKey = key;
    view.rig?.destroy({ children: true });
    const look = appearance(fish.species, form, lookVariant(fish), gravid);
    const tex = paintedTexture(painted);
    view.rig = tex && painted ? new PaintedRig(painted, tex, look) : new FishRig(fish.species, look);
    view.rig.addChildAt(view.eggs, 0);
    view.rig.addChild(view.spots);
    view.holder.addChild(view.rig);
    view.ichDrawn = false;
    view.eggsDrawn = false;
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
    const ctx = { bounds: this.waterBounds, scale: this.motionScale, food: this.food };
    for (const fish of state.fish) {
      const view = this.fish.get(fish.id)!;
      const { swimmer, rig } = view;
      const symptoms = observeSymptoms(state, fish);
      updateSwimmer(swimmer, living, { alive: fish.alive, hungry: fish.hunger > 0.15, symptoms }, ctx, dt, () => this.rand());

      // 景深：魚慢慢在前後之間游動；遠的小一點、模糊偏藍，畫在造景後面。
      if (fish.species !== 'cherry_shrimp' && fish.alive) {
        if (this.rand() < dt * 0.04) view.zTarget = this.rand();
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
      if (fish.alive) stepTurn(view.turn, swimmer.vx, dt);
      const facingLeft = view.turn.f > 0;
      const turn = turnScale(view.turn.f);
      const k = (this.lengthPx(fish) / rig.lengthPx) * depth;
      rig.scale.x = k * turn.sx;
      if (!fish.alive) {
        // 死亡演出：最後抽動幾下，慢慢翻成白肚朝上、褪成灰色，一邊沉到底
        view.deathT = view.deathT < 0 ? 0 : view.deathT + dt;
        const pose = deathPose(view.deathT, fish.species === 'cherry_shrimp');
        rig.scale.y = k * pose.flip;
        rig.rotation = facingLeft ? -pose.tilt : pose.tilt;
        rig.alpha = rig.look.alpha * (1 - 0.25 * pose.fade);
        rig.setDim(pose.fade < 0.02 ? null : mix(0xffffff, 0x8a8a8a, pose.fade));
        if (view.deathT < DEATH_SECONDS) rig.animate(view.deathT * 9, pose.swing, 0.6, fish.finDamage);
      } else {
        view.deathT = -1;
        // 生病的樣子：越虛弱顏色越淡、消瘦變扁、癢的時候突然側身蹭一下
        const sick = sickLook(symptoms, fish.health, this.time, fish.id);
        rig.scale.y = k * turn.sy * sick.thin * (1 - 0.55 * sick.flash);
        rig.alpha = rig.look.alpha;
        rig.setDim(sick.dim);
        const tilt = symptoms.includes('loss_of_balance') ? 1.2 : Math.max(-0.35, Math.min(0.35, Math.atan2(swimmer.vy, Math.abs(swimmer.vx) + 1) * 0.6)) + 0.5 * sick.flash;
        rig.rotation = facingLeft ? tilt : -tilt;
        const clamped = symptoms.includes('clamped_fins');
        rig.animate(swimmer.phase, clamped ? 0.25 : 1, clamped ? 0.55 : 1, fish.finDamage);
      }
      // 咬一口：往前一衝、頭往下點一下
      const len = this.lengthPx(fish) * depth;
      const dir = facingLeft ? -1 : 1;
      view.biteT += dt;
      const kick = biteKick(view.biteT);
      if (kick > 0) {
        view.holder.x += dir * kick * len * 0.12;
        rig.rotation += dir * kick * 0.18;
        rig.scale.y *= 1 + 0.05 * kick;
      }
      view.mouth = fish.alive ? { x: swimmer.x + dir * len * 0.25, y: swimmer.y, reach: Math.max(10, len * 0.55) } : null;
      const spotted = fish.alive && symptoms.includes('white_spots');
      if (spotted !== view.ichDrawn) {
        drawIchSpots(view.spots, rig, spotted ? 12 : 0);
        view.ichDrawn = spotted;
      }
      // 抱卵的母蝦：肚子下面一團黃綠色的卵
      const berried = fish.alive && fish.species === 'cherry_shrimp' && fish.pregnancy > 0 && !rig.drawsEggs;
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
        view = { holder: new Container(), rig: null, drawnBiomass: -1, drawnAlgae: -1, drawnMelting: false, seenBiomass: -1 };
        this.plantLayer.addChild(view.holder);
        this.plants.set(plant.id, view);
      }
      // 剛剪過：從目前的圖切下葉尖當插枝飄走（要在重畫、舊圖被銷毀之前）
      const cut = view.seenBiomass < 0 ? 0 : cuttingsFromDrop(view.seenBiomass, plant.biomassG, PLANT_SPECIES[plant.species].cuttingMassG);
      view.seenBiomass = plant.biomassG;
      if (cut > 0 && view.rig) this.spawnCuttings(view, cut);
      const melting = plant.growthRate < -0.0002;
      if (
        view.drawnBiomass < 0 ||
        Math.abs(view.drawnBiomass - plant.biomassG) > 0.05 * Math.max(1, plant.biomassG) ||
        Math.abs(view.drawnAlgae - plant.leafAlgae) > 0.05 ||
        view.drawnMelting !== melting
      ) {
        const painting = paintPlant(plant, this.hs);
        view.rig?.destroy();
        view.rig = new PlantMesh(painting.texture, painting.anchorX, painting.anchorY);
        view.holder.addChild(view.rig.mesh);
        view.drawnBiomass = plant.biomassG;
        view.drawnAlgae = plant.leafAlgae;
        view.drawnMelting = melting;
      }
      const slot = ((plant.id * 0.618) % 1) * 0.84 + 0.08;
      view.holder.position.set(this.bounds.width * slot, this.bounds.bottom + 14 * this.hs);
      // 水流造成的搖擺：根部不動、葉尖擺最多
      const tall = view.rig!.mesh.texture.height;
      view.rig!.sway(t * 6 + plant.id + this.time * 1.1, tall * 0.045 * flow);
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
  }

  private drawOverlay(state: TankState): void {
    const { width, height, surface, bottom } = this.bounds;
    const g = this.overlay.clear();
    // 混濁：有機物與細菌濃度高時水變黃綠
    const turbidity = Math.min(0.35, state.water.organicMg / 4000 + state.water.tan / 20);
    if (turbidity > 0.02) g.rect(0, 0, width, height).fill({ color: 0x8a8a3a, alpha: turbidity });
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
    // 夜晚（關燈或停電）：深藍、只剩一點月光
    if (!isLightOn(state)) g.rect(0, 0, width, height).fill({ color: 0x041226, alpha: 0.55 });
  }
}

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
