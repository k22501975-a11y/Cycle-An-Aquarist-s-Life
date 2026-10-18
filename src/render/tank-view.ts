import { Application, BlurFilter, Container, FederatedPointerEvent, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { FISH_SPECIES, isCo2Injecting, isJuvenile, isLightOn, observeSymptoms, sizeRatio, tankSize, type Fish, type TankState } from '../sim';
import { appearance, FishRig, type FishForm } from './fish-art';
import { spawnSwimmer, updateSwimmer, type Swimmer } from './fish-motion';
import { pxPerCm, sceneBounds, type Insets, type TankBounds } from './layout';
import { canvasTexture, makeCanvas, softDotTexture } from './paint';
import { causticsTexture, MOCKUP_PX_PER_CM, paintBackdrop, paintDriftwood, paintFront, paintPlant, paintVignette, rayTexture } from './scenery';

interface FoodParticle {
  s: Sprite;
  x: number;
  y: number;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
}

interface PlantView {
  sprite: Sprite;
  /** 上次重畫時的狀態，變化夠大才重畫。 */
  drawnBiomass: number;
  drawnAlgae: number;
  drawnMelting: boolean;
}

interface FishView {
  swimmer: Swimmer;
  /** 放在缸內座標，不縮放（光暈畫在這裡）。 */
  holder: Container;
  /** 魚本體：依大小、景深縮放，面向左右時水平翻轉。 */
  rig: FishRig;
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
  private readonly frontFish = new Container();
  private readonly bubbleLayer = new Graphics();
  private readonly moteLayer = new Container();
  private readonly rayLayer = new Container();
  private readonly overlay = new Graphics();
  private readonly vignette = new Sprite();

  private insets: Insets = { top: 0, bottom: 0 };
  private bounds: TankBounds;
  /** 每公分幾像素（鏡頭）。 */
  private ppc = 10;
  /** 相對示意圖的鏡頭倍率：造景、設備的大小。 */
  private hs = 1;
  private sceneKey = '';
  private fish = new Map<number, FishView>();
  private plants = new Map<number, PlantView>();
  private food: FoodParticle[] = [];
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
    this.backFish.filters = [new BlurFilter({ strength: 2.5, quality: 2 })];
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
      this.frontFish,
      this.bubbleLayer,
      this.moteLayer,
      this.rayLayer,
      this.overlay,
      this.vignette,
    );
    this.root.eventMode = 'static';
    this.root.on('pointertap', (e: FederatedPointerEvent) => this.handleTap(e.global.x, e.global.y));
    app.renderer.on('resize', () => (this.sceneKey = ''));
  }

  /** 狀態列與按鈕列蓋住的高度（像素）。 */
  setInsets(insets: Insets): void {
    if (insets.top === this.insets.top && insets.bottom === this.insets.bottom) return;
    this.insets = insets;
    this.sceneKey = '';
  }

  selectFish(id: number | null): void {
    this.selectedFish = id;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** 畫面大小、遮擋範圍或缸的尺寸改變時重新排版、重畫靜態場景。 */
  private layout(state: TankState): void {
    const screen = this.app.screen;
    const size = tankSize(state.equipment.tank);
    const key = `${screen.width}x${screen.height}:${this.insets.top},${this.insets.bottom}:${size.w}x${size.h}`;
    if (key === this.sceneKey) return;
    this.sceneKey = key;
    const b = (this.bounds = sceneBounds(screen.width, screen.height, this.insets));
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
    const motes = Math.round(Math.min(70, (b.width * b.height) / 14000));
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
      const bb = view.sprite.getBounds();
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
    this.syncFood(state, dt);
    this.syncFish(state, dt);
    this.syncPlants(state);
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

  private syncFood(state: TankState, dt: number): void {
    const { width, surface, bottom } = this.bounds;
    const target = Math.min(80, Math.ceil(state.water.foodMg / 2));
    const r = Math.max(3, 7 * this.hs);
    while (this.food.length < target) {
      const s = new Sprite(softDotTexture());
      s.anchor.set(0.5);
      s.width = s.height = r;
      s.tint = 0xd98a3a;
      const p = { s, x: width * (0.2 + this.rand() * 0.6), y: surface + this.rand() * 6 };
      this.foodLayer.addChild(s);
      this.food.push(p);
    }
    while (this.food.length > target) {
      const p = this.food.splice(Math.floor(this.rand() * this.food.length), 1)[0];
      p.s.destroy();
    }
    for (const p of this.food) {
      p.y = Math.min(bottom - 2, p.y + 14 * this.motionScale * dt);
      p.x += Math.sin(p.y * 0.05) * 0.2;
      p.s.position.set(p.x, p.y);
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
      rig: null as unknown as FishRig,
      rigKey: '',
      glow,
      spots,
      eggs,
      ichDrawn: false,
      eggsDrawn: false,
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
    const gravid = form === 'female' && fish.pregnancy > 0.5;
    const key = `${fish.species}:${form}:${gravid}`;
    if (key === view.rigKey) return;
    view.rigKey = key;
    view.rig?.destroy({ children: true });
    view.rig = new FishRig(fish.species, appearance(fish.species, form, fish.id, gravid));
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
    const ctx = { bounds: this.bounds, scale: this.motionScale, food: this.food };
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
      const facingLeft = swimmer.vx < 0;
      // 圖層是頭朝左畫的：往右游時水平翻轉。
      const k = (this.lengthPx(fish) / rig.lengthPx) * depth;
      rig.scale.x = facingLeft ? k : -k;
      if (!fish.alive) {
        rig.rotation = 0;
        rig.scale.y = -k;
        rig.alpha = 0.75;
        rig.setDim(0x8a8a8a);
      } else {
        rig.scale.y = k;
        rig.alpha = rig.look.alpha;
        rig.setDim(symptoms.includes('lethargic') ? 0xb8b8b8 : null);
        const tilt = symptoms.includes('loss_of_balance') ? 1.2 : Math.max(-0.35, Math.min(0.35, Math.atan2(swimmer.vy, Math.abs(swimmer.vx) + 1) * 0.6));
        rig.rotation = facingLeft ? tilt : -tilt;
        const clamped = symptoms.includes('clamped_fins');
        rig.animate(swimmer.phase, clamped ? 0.25 : 1, clamped ? 0.55 : 1, fish.finDamage);
      }
      const spotted = fish.alive && symptoms.includes('white_spots');
      if (spotted !== view.ichDrawn) {
        drawIchSpots(view.spots, rig, spotted ? 12 : 0);
        view.ichDrawn = spotted;
      }
      // 抱卵的母蝦：肚子下面一團黃綠色的卵
      const berried = fish.alive && fish.species === 'cherry_shrimp' && fish.pregnancy > 0;
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
        if (view.sprite.texture !== Texture.EMPTY) view.sprite.texture.destroy(true);
        view.sprite.destroy();
        this.plants.delete(id);
      }
    }
    const t = state.hours;
    for (const plant of state.plants) {
      let view = this.plants.get(plant.id);
      if (!view) {
        view = { sprite: new Sprite(), drawnBiomass: -1, drawnAlgae: -1, drawnMelting: false };
        this.plantLayer.addChild(view.sprite);
        this.plants.set(plant.id, view);
      }
      const melting = plant.growthRate < -0.0002;
      if (
        view.drawnBiomass < 0 ||
        Math.abs(view.drawnBiomass - plant.biomassG) > 0.05 * Math.max(1, plant.biomassG) ||
        Math.abs(view.drawnAlgae - plant.leafAlgae) > 0.05 ||
        view.drawnMelting !== melting
      ) {
        const painting = paintPlant(plant, this.hs);
        const old = view.sprite.texture;
        view.sprite.texture = painting.texture;
        if (old !== Texture.EMPTY) old.destroy(true);
        view.sprite.anchor.set(painting.anchorX / painting.texture.width, painting.anchorY / painting.texture.height);
        view.drawnBiomass = plant.biomassG;
        view.drawnAlgae = plant.leafAlgae;
        view.drawnMelting = melting;
      }
      const slot = ((plant.id * 0.618) % 1) * 0.84 + 0.08;
      view.sprite.position.set(this.bounds.width * slot, this.bounds.bottom + 14 * this.hs);
      // 水流造成的輕微搖擺
      view.sprite.skew.x = Math.sin(t * 6 + plant.id + this.time * 1.1) * 0.035;
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
function drawIchSpots(g: Graphics, rig: FishRig, count: number): void {
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
