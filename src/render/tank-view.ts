import { Application, Container, FederatedPointerEvent, FillGradient, Graphics } from 'pixi.js';
import { isCo2Injecting, isJuvenile, isLightOn, observeSymptoms, sizeRatio, type TankState } from '../sim';
import { spawnSwimmer, updateSwimmer, type Swimmer } from './fish-motion';
import { tankBounds, tankRect, unitScale, type TankBounds, type TankRect } from './layout';
import { bellyShade, createFishSprite, drawBackdropGrass, drawIchSpots, drawPlant, INK, type FishSprite } from './sprites';

interface FoodParticle {
  g: Graphics;
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
  g: Graphics;
  /** 上次重畫時的狀態，變化夠大才重畫。 */
  drawnBiomass: number;
  drawnAlgae: number;
  drawnMelting: boolean;
}

export interface TankViewEvents {
  onSelectFish?: (id: number) => void;
  onSelectPlant?: (id: number) => void;
}

/**
 * 水缸畫面：只讀取 TankState 來繪圖，不修改模擬狀態。
 * 魚的位置與游動是純畫面效果（模擬本身不管魚在缸內哪裡）。
 */
export class TankView {
  readonly root = new Container();
  /** 房間背景與缸座（水缸外面）。 */
  private readonly room = new Graphics();
  /** 水缸內的一切，原點在水缸左上角，用遮罩裁成圓角。 */
  private readonly scene = new Container();
  private readonly sceneMask = new Graphics();
  /** 卡通風格的粗黑缸框，蓋在最上面。 */
  private readonly frame = new Graphics();
  private readonly background = new Graphics();
  /** 會動的環境效果：光束、沙上的波光、水面波紋。 */
  private readonly ambient = new Graphics();
  /** 缸頂的燈罩，開燈時下緣發亮。 */
  private readonly hood = new Graphics();
  private hoodLit: boolean | null = null;
  private readonly plantLayer = new Container();
  private readonly foodLayer = new Container();
  private readonly fishLayer = new Container();
  private readonly bubbleLayer = new Graphics();
  private readonly overlay = new Graphics();
  private readonly gear = new Graphics();

  private rect: TankRect;
  private bounds: TankBounds;
  private scale: number;
  private swimmers = new Map<number, { swimmer: Swimmer; sprite: FishSprite; ichDrawn: boolean; juvenile: boolean; spriteScale: number }>();
  private plants = new Map<number, PlantView>();
  private food: FoodParticle[] = [];
  private bubbles: Bubble[] = [];
  private selectedFish: number | null = null;
  private seed = 12345;

  constructor(private readonly app: Application, private readonly events: TankViewEvents = {}) {
    this.rect = tankRect(app.screen.width, app.screen.height);
    this.bounds = tankBounds(this.rect.width, this.rect.height);
    this.scale = unitScale(this.bounds);
    this.scene.addChild(this.background, this.ambient, this.gear, this.plantLayer, this.foodLayer, this.fishLayer, this.bubbleLayer, this.overlay);
    this.scene.mask = this.sceneMask;
    this.root.addChild(this.room, this.scene, this.sceneMask, this.frame, this.hood);
    this.root.eventMode = 'static';
    this.root.on('pointertap', (e: FederatedPointerEvent) => this.handleTap(e.global.x, e.global.y));
    this.layout();
    app.renderer.on('resize', () => this.layout());
  }

  selectFish(id: number | null): void {
    this.selectedFish = id;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private layout(): void {
    const screen = this.app.screen;
    this.rect = tankRect(screen.width, screen.height);
    this.bounds = tankBounds(this.rect.width, this.rect.height);
    this.scale = unitScale(this.bounds);
    const { width, height, surface, bottom } = this.bounds;
    const { x: rx, y: ry } = this.rect;
    const radius = Math.min(18, height * 0.05);
    this.root.hitArea = { contains: (x: number, y: number) => x >= rx && y >= ry && x <= rx + width && y <= ry + height };
    this.scene.position.set(rx, ry);
    this.sceneMask.clear().roundRect(rx, ry, width, height, radius).fill(0xffffff);

    const sc = this.scale;
    this.hoodLit = null;

    // 房間：帶直條壁紙的牆面、踢腳板、木頭缸座（空間夠時畫成有門的櫃子）
    const room = this.room.clear();
    const wall = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x30506e },
        { offset: 1, color: 0x1d3046 },
      ],
    });
    room.rect(0, 0, screen.width, screen.height).fill(wall);
    for (let x = 18; x < screen.width; x += 36) room.rect(x, 0, 10, screen.height).fill({ color: 0xffffff, alpha: 0.025 });
    // 直向時水缸上方空間大，牆上掛一扇看得到藍天的窗
    if (ry > 140) {
      const winW = Math.min(width * 0.55, 260);
      const winH = Math.min(ry - 60, winW * 0.75);
      const wx = screen.width / 2 - winW / 2;
      const wy = Math.max(24, (ry - winH) / 2);
      room.roundRect(wx - 8, wy - 8, winW + 16, winH + 16, 10).fill(0xc58a52).stroke({ color: INK, width: 3 });
      const sky = new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 }, colorStops: [{ offset: 0, color: 0x8fd8ff }, { offset: 1, color: 0xd8f3ff }] });
      room.roundRect(wx, wy, winW, winH, 6).fill(sky).stroke({ color: INK, width: 2.5 });
      const cloud = (cx: number, cy: number, r: number) => {
        room.circle(cx, cy, r).circle(cx + r * 0.9, cy + r * 0.2, r * 0.8).circle(cx - r * 0.9, cy + r * 0.25, r * 0.7).fill(0xffffff);
      };
      cloud(wx + winW * 0.3, wy + winH * 0.35, winH * 0.1);
      cloud(wx + winW * 0.72, wy + winH * 0.6, winH * 0.08);
      room.rect(wx + winW / 2 - 2.5, wy, 5, winH).fill(0xc58a52).stroke({ color: INK, width: 2 });
      room.rect(wx, wy + winH / 2 - 2.5, winW, 5).fill(0xc58a52).stroke({ color: INK, width: 2 });
      room.roundRect(wx - 14, wy + winH + 6, winW + 28, 8, 4).fill(0xd99a5e).stroke({ color: INK, width: 2.5 });
    }
    const standY = ry + height;
    const standH = Math.max(14, Math.min(120, screen.height - standY - 2));
    room.rect(0, standY + standH * 0.6, screen.width, screen.height).fill({ color: 0x142233, alpha: 0.9 });
    room.ellipse(rx + width / 2, standY + 2, width * 0.55, 10).fill({ color: 0x000000, alpha: 0.18 });
    const sx = Math.max(3, rx - 12);
    const sw = Math.min(screen.width - 3, rx + width + 12) - sx;
    room.roundRect(sx, standY - 6, sw, standH + 4, 8).fill(0xa8713f).stroke({ color: INK, width: 3 });
    room.rect(sx + 4, standY - 2, sw - 8, Math.min(10, standH * 0.3)).fill(0xc58a52);
    if (standH > 36) {
      const doorW = (sw - 16) / 2 - 4;
      for (const dx of [0, doorW + 8]) {
        const doorX = sx + 8 + dx;
        room.roundRect(doorX, standY + 12, doorW, standH - 20, 5).fill(0x96633a).stroke({ color: INK, width: 2 });
        room.circle(dx === 0 ? doorX + doorW - 10 : doorX + 10, standY + standH / 2, 3).fill(0xffd27a).stroke({ color: INK, width: 1.5 });
      }
    } else {
      for (let i = 1; i < 4; i++) room.moveTo(rx, standY + (standH * i) / 4).lineTo(rx + width, standY + (standH * i) / 4 + 1).stroke({ color: 0x7c5030, width: 1, alpha: 0.6 });
    }

    // 缸框：粗外框＋玻璃反光
    const frame = this.frame.clear();
    frame.roundRect(rx, ry, width, height, radius).stroke({ color: INK, width: 4.5 });
    frame.roundRect(rx + 3, ry + 3, width - 6, height - 6, Math.max(2, radius - 3)).stroke({ color: 0xffffff, width: 1.5, alpha: 0.25 });
    const glass = (x0: number, w: number, a: number) =>
      frame.poly([rx + x0, ry + height * 0.1, rx + x0 + w, ry + height * 0.1, rx + x0 + w - height * 0.25, ry + height * 0.82, rx + x0 - height * 0.25, ry + height * 0.82]).fill({ color: 0xffffff, alpha: a });
    glass(width * 0.1, 18 * sc, 0.07);
    glass(width * 0.1 + 26 * sc, 6 * sc, 0.06);

    // 水：明亮的藍色漸層；遠景有幾層較深的丘陵增加深度
    const water = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x74d6f4 },
        { offset: 0.6, color: 0x3aa3d6 },
        { offset: 1, color: 0x2580ba },
      ],
    });
    const bg = this.background.clear();
    bg.rect(0, 0, width, height).fill(water);
    const hill = (base: number, amp: number, freq: number, phase: number, color: number, alpha: number) => {
      const pts: number[] = [0, height];
      for (let i = 0; i <= 24; i++) {
        const x = (i / 24) * width;
        pts.push(x, base - amp * (0.6 + 0.4 * Math.sin(i * freq + phase)) * sc);
      }
      pts.push(width, height);
      bg.poly(pts).fill({ color, alpha });
    };
    hill(bottom - 6 * sc, 46, 0.55, 1.2, 0x2a7fb4, 0.45);
    hill(bottom - 2 * sc, 26, 0.9, 2.5, 0x22719f, 0.5);
    // 背景裝飾長草（深綠，不能點），集中在兩側
    const grass = [0.03, 0.06, 0.95, 0.975, 0.4, 0.58];
    grass.forEach((fx, i) => {
      const h = (bottom - surface) * (0.32 + ((i * 37) % 23) / 100);
      drawBackdropGrass(bg, width * fx, bottom + 4 * sc, h, sc, i % 2 ? 0x2f9a52 : 0x3bb35d);
    });

    // 微微起伏的沙面，前景有一條較深的沙帶
    const sand: number[] = [0, height];
    const steps = Math.max(8, Math.round(width / 40));
    const sandY = (i: number) => bottom + Math.sin(i * 1.3) * 3 * sc + Math.sin(i * 0.37) * 4 * sc;
    for (let i = 0; i <= steps; i++) sand.push((i / steps) * width, sandY(i));
    sand.push(width, height);
    bg.poly(sand).fill(0xf0d394).stroke({ color: INK, width: 2.5, join: 'round' });
    const front: number[] = [0, height];
    for (let i = 0; i <= steps; i++) front.push((i / steps) * width, height - (height - bottom) * (0.42 + 0.08 * Math.sin(i * 0.9)));
    front.push(width, height);
    bg.poly(front).fill(0xdfba72);
    for (let i = 0; i < width / 5; i++) {
      const x = (i * 97) % width;
      const y = bottom + 8 + ((i * 53) % Math.max(1, height - bottom - 10));
      bg.circle(x, y, 0.8 + (i % 3) * 0.5).fill({ color: i % 2 ? 0xc29a58 : 0xfbe7bb, alpha: 0.9 });
    }
    // 幾顆彩色小卵石
    const pebbleColors = [0xf28b82, 0x8ab4f8, 0xfdd663, 0xffffff];
    for (let i = 0; i < Math.round(width / 70); i++) {
      const x = ((i * 0.618 + 0.05) % 1) * width;
      const y = bottom + (height - bottom) * (0.35 + ((i * 0.37) % 1) * 0.5);
      bg.ellipse(x, y, 3 * sc, 2 * sc).fill(pebbleColors[i % pebbleColors.length]).stroke({ color: INK, width: 1 });
    }
    // 卡通石頭：下緣硬邊陰影＋上緣亮面
    for (const [fx, r] of [[0.12, 14], [0.68, 10], [0.9, 17]] as const) {
      const cx = width * fx;
      const cy = bottom + 4 * sc;
      bg.ellipse(cx, cy, r * sc * 1.4, r * sc * 0.75).fill(0xa9b1b8);
      bellyShade(bg, cx, cy, r * sc * 1.4, r * sc * 0.75, 0x7f8790, 0.45);
      bg.ellipse(cx - r * 0.45 * sc, cy - r * 0.35 * sc, r * 0.5 * sc, r * 0.18 * sc).fill({ color: 0xffffff, alpha: 0.45 });
      bg.ellipse(cx, cy, r * sc * 1.4, r * sc * 0.75).stroke({ color: INK, width: 2 });
    }
    // 重新排列水草（位置依畫面寬度）
    for (const view of this.plants.values()) view.drawnBiomass = -1;
  }

  private handleTap(globalX: number, globalY: number): void {
    const x = globalX - this.rect.x;
    const y = globalY - this.rect.y;
    let best: number | null = null;
    let bestD = (28 * this.scale) ** 2;
    for (const { swimmer } of this.swimmers.values()) {
      const d = (swimmer.x - x) ** 2 + (swimmer.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = swimmer.id;
      }
    }
    if (best !== null) {
      this.events.onSelectFish?.(best);
      return;
    }
    for (const [id, view] of this.plants) {
      const b = view.g.getBounds();
      if (globalX >= b.minX && globalX <= b.maxX && globalY >= b.minY && globalY <= b.maxY) {
        this.events.onSelectPlant?.(id);
        return;
      }
    }
  }

  /** 每個畫面呼叫一次。realDt 為現實經過的秒數（動畫用）。 */
  update(state: TankState, realDt: number): void {
    const dt = Math.min(0.1, realDt);
    this.syncFood(state, dt);
    this.syncFish(state, dt);
    this.syncPlants(state, dt);
    this.drawGear(state);
    this.drawAmbient(state);
    this.drawHood(state);
    this.updateBubbles(state, dt);
    this.drawOverlay(state);
  }

  /** 光束、沙上的波光與水面波紋（只是畫面效果）。 */
  private drawAmbient(state: TankState): void {
    const { width, height, surface, bottom } = this.bounds;
    const s = this.scale;
    const t = performance.now() / 1000;
    const g = this.ambient.clear();
    const lit = isLightOn(state);
    if (lit) {
      for (let i = 0; i < 5; i++) {
        const x0 = width * (0.12 + i * 0.2) + Math.sin(t * 0.25 + i * 1.7) * 24 * s;
        const w = (10 + (i % 3) * 8) * s;
        const alpha = 0.05 + 0.03 * Math.sin(t * 0.6 + i);
        g.poly([x0 - w, surface, x0 + w, surface, x0 + w * 2.6 + 30 * s, bottom, x0 - w * 1.2 + 30 * s, bottom]).fill({ color: 0xffffff, alpha });
      }
      for (let i = 0; i < Math.round(width / 50); i++) {
        const x = ((i * 0.618) % 1) * width + Math.sin(t * 0.7 + i) * 10 * s;
        const y = bottom + 6 * s + ((i * 0.37) % 1) * (height - bottom) * 0.35;
        g.ellipse(x, y, (7 + (i % 3) * 3) * s * (0.8 + 0.2 * Math.sin(t * 1.3 + i)), 1.6 * s).fill({ color: 0xfff6d5, alpha: 0.35 });
      }
    }
    // 水面：上方是空氣，波紋緩緩起伏
    const pts: number[] = [0, 0];
    const steps = Math.max(12, Math.round(width / 24));
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      pts.push(x, surface + Math.sin(x * 0.035 + t * 1.6) * 1.4 * s + Math.sin(x * 0.011 - t * 0.7) * 1.2 * s);
    }
    pts.push(width, 0);
    g.poly(pts).fill(0xd9f3fb);
    const line = pts.slice(2, -2);
    g.poly(line, false).stroke({ color: 0xffffff, width: 2.5, alpha: 0.9 });
  }

  /** 缸頂燈罩：開燈時下緣是暖白色的燈條。 */
  private drawHood(state: TankState): void {
    const lit = isLightOn(state);
    if (lit === this.hoodLit) return;
    this.hoodLit = lit;
    const { x, y, width, height } = this.rect;
    const h = Math.max(8, height * 0.045);
    const g = this.hood.clear();
    g.roundRect(x + 6, y - h * 0.35, width - 12, h, h / 2).fill(0x3a4a5a).stroke({ color: INK, width: 3 });
    g.roundRect(x + 14, y + h * 0.3, width - 28, h * 0.3, h * 0.15).fill(lit ? 0xfff2b0 : 0x5a6a78);
    if (lit) g.roundRect(x + 14, y + h * 0.3, width - 28, h * 0.9, h * 0.3).fill({ color: 0xfff2b0, alpha: 0.18 });
    g.circle(x + width - 24, y + h * 0.15, h * 0.18).fill(lit ? 0x7dff9a : 0x2a3540);
  }

  private syncFood(state: TankState, dt: number): void {
    const { width, surface, bottom } = this.bounds;
    const target = Math.min(80, Math.ceil(state.water.foodMg / 2));
    while (this.food.length < target) {
      const g = new Graphics().circle(0, 0, 1.8 * this.scale).fill(0xe0913a).stroke({ color: INK, width: 0.6 * this.scale });
      const p = { g, x: width * (0.2 + this.rand() * 0.6), y: surface + this.rand() * 6 };
      this.foodLayer.addChild(g);
      this.food.push(p);
    }
    while (this.food.length > target) {
      const p = this.food.splice(Math.floor(this.rand() * this.food.length), 1)[0];
      p.g.destroy();
    }
    for (const p of this.food) {
      p.y = Math.min(bottom - 2, p.y + 14 * this.scale * dt);
      p.x += Math.sin(p.y * 0.05) * 0.2;
      p.g.position.set(p.x, p.y);
    }
  }

  private syncFish(state: TankState, dt: number): void {
    const present = new Set<number>();
    for (const fish of state.fish) {
      present.add(fish.id);
      let entry = this.swimmers.get(fish.id);
      const juvenile = isJuvenile(fish);
      if (!entry || entry.juvenile !== juvenile || entry.spriteScale !== this.scale) {
        // 幼體一律是樸素的灰色，長大後才換成公母各自的樣子；畫面縮放改變（例如手機轉向）時也重畫。
        const swimmer = entry?.swimmer ?? spawnSwimmer(fish.id, fish.species, this.bounds, () => this.rand());
        entry?.sprite.root.destroy({ children: true });
        const sprite = createFishSprite(fish.species, this.scale * 1.5, fish.id, juvenile || fish.sex === 'female');
        this.fishLayer.addChild(sprite.root);
        entry = { swimmer, sprite, ichDrawn: false, juvenile, spriteScale: this.scale };
        this.swimmers.set(fish.id, entry);
      }
    }
    for (const [id, entry] of this.swimmers) {
      if (!present.has(id)) {
        entry.sprite.root.destroy({ children: true });
        this.swimmers.delete(id);
      }
    }

    const all = [...this.swimmers.values()].map((e) => e.swimmer);
    const living = all.filter((s) => state.fish.find((f) => f.id === s.id)?.alive);
    const ctx = { bounds: this.bounds, scale: this.scale, food: this.food };
    for (const fish of state.fish) {
      const entry = this.swimmers.get(fish.id)!;
      const { swimmer, sprite } = entry;
      const symptoms = observeSymptoms(state, fish);
      updateSwimmer(swimmer, living, { alive: fish.alive, hungry: fish.hunger > 0.15, symptoms }, ctx, dt, () => this.rand());

      sprite.root.position.set(swimmer.x, swimmer.y);
      const facingLeft = swimmer.vx < 0;
      // 幼體依體長縮小。
      const size = Math.max(0.2, sizeRatio(fish));
      sprite.root.scale.x = facingLeft ? -size : size;
      if (!fish.alive) {
        sprite.root.rotation = 0;
        sprite.root.scale.y = -size;
        sprite.root.alpha = 0.75;
        sprite.body.tint = 0x9a9a9a;
      } else {
        sprite.root.scale.y = size;
        const tilt = symptoms.includes('loss_of_balance') ? 1.2 : Math.max(-0.35, Math.min(0.35, Math.atan2(swimmer.vy, Math.abs(swimmer.vx) + 1) * 0.6));
        sprite.root.rotation = facingLeft ? -tilt : tilt;
        sprite.tail.rotation = Math.sin(swimmer.phase) * (symptoms.includes('clamped_fins') ? 0.1 : 0.35);
        sprite.tail.scale.y = symptoms.includes('clamped_fins') ? 0.55 : 1;
        // 鰭被咬破會變短。
        sprite.tail.scale.x = 1 - 0.5 * fish.finDamage;
      }
      const spotted = fish.alive && symptoms.includes('white_spots');
      if (spotted !== entry.ichDrawn) {
        drawIchSpots(sprite.spots, this.scale, spotted ? 9 : 0);
        entry.ichDrawn = spotted;
      }
      sprite.ring.visible = this.selectedFish === fish.id;
    }
  }

  private syncPlants(state: TankState, dt: number): void {
    const present = new Set(state.plants.map((p) => p.id));
    for (const [id, view] of this.plants) {
      if (!present.has(id)) {
        view.g.destroy();
        this.plants.delete(id);
      }
    }
    const t = state.hours;
    for (const plant of state.plants) {
      let view = this.plants.get(plant.id);
      if (!view) {
        view = { g: new Graphics(), drawnBiomass: -1, drawnAlgae: -1, drawnMelting: false };
        this.plantLayer.addChild(view.g);
        this.plants.set(plant.id, view);
      }
      const melting = plant.growthRate < -0.0002;
      if (
        Math.abs(view.drawnBiomass - plant.biomassG) > 0.05 * Math.max(1, plant.biomassG) ||
        Math.abs(view.drawnAlgae - plant.leafAlgae) > 0.05 ||
        view.drawnMelting !== melting
      ) {
        drawPlant(view.g, plant, this.scale * 1.4, 0);
        view.drawnBiomass = plant.biomassG;
        view.drawnAlgae = plant.leafAlgae;
        view.drawnMelting = melting;
      }
      const slot = ((plant.id * 0.618) % 1) * 0.8 + 0.1;
      view.g.position.set(this.bounds.width * slot, this.bounds.bottom + 4 * this.scale);
      // 水流造成的輕微搖擺
      view.g.skew.x = Math.sin(t * 6 + plant.id + performance.now() / 900) * 0.04;
    }
    void dt;
  }

  private drawGear(state: TankState): void {
    const g = this.gear;
    const { width, surface, bottom } = this.bounds;
    const s = this.scale;
    g.clear();
    const eq = state.equipment;
    if (eq.filter) {
      // 外掛過濾器掛在後方右上
      g.roundRect(width - 46 * s, surface - 14 * s, 36 * s, 34 * s, 5 * s).fill(0x3a4650).stroke({ color: INK, width: 2 });
      g.rect(width - 40 * s, surface - 8 * s, 24 * s, 3 * s).fill({ color: 0xffffff, alpha: 0.25 });
    }
    if (eq.heater) {
      const on = eq.heater.heating && !state.environment.powerOut;
      g.roundRect(10 * s, surface + 20 * s, 7 * s, 70 * s, 3 * s).fill({ color: 0xe6eef1, alpha: 0.85 }).stroke({ color: INK, width: 1.5 });
      g.circle(13.5 * s, surface + 26 * s, 2 * s).fill(on ? 0xff7043 : eq.heater.broken ? 0x555555 : 0x5d4037);
    }
    if (eq.co2) {
      g.circle(width * 0.5, bottom - 10 * s, 5 * s).fill({ color: 0xd5e3ea, alpha: 0.9 }).stroke({ color: INK, width: 1.5 });
    }
    if (eq.airPump) {
      g.roundRect(width * 0.82, bottom - 8 * s, 10 * s, 6 * s, 2 * s).fill(0x8aa0ab).stroke({ color: INK, width: 1.5 });
    }
  }

  private updateBubbles(state: TankState, dt: number): void {
    const { width, surface, bottom } = this.bounds;
    const s = this.scale;
    const power = !state.environment.powerOut;
    const eq = state.equipment;
    const spawn = (x: number, y: number, r: number, rate: number) => {
      if (this.rand() < rate * dt) this.bubbles.push({ x, y, r, speed: (30 + this.rand() * 30) * s });
    };
    if (power && eq.airPump?.on) spawn(width * 0.82 + 5 * s + (this.rand() - 0.5) * 4, bottom - 9 * s, 2.2 * s, 18);
    if (power && eq.filter?.on) spawn(width - 30 * s + (this.rand() - 0.5) * 20 * s, surface + 12 * s, 1.3 * s, 10);
    if (eq.co2 && isCo2Injecting(state)) spawn(width * 0.5 + (this.rand() - 0.5) * 6 * s, bottom - 14 * s, 0.8 * s, 12);

    const g = this.bubbleLayer;
    g.clear();
    this.bubbles = this.bubbles.filter((b) => b.y > surface);
    for (const b of this.bubbles) {
      b.y -= b.speed * dt;
      b.x += Math.sin(b.y * 0.08) * 0.3;
      g.circle(b.x, b.y, b.r).stroke({ color: 0xffffff, width: 1.2, alpha: 0.85 });
    }
  }

  private drawOverlay(state: TankState): void {
    const { width, height, surface, bottom } = this.bounds;
    const g = this.overlay;
    g.clear();
    // 混濁：有機物與細菌濃度高時水變黃綠
    const turbidity = Math.min(0.35, state.water.organicMg / 4000 + state.water.tan / 20);
    if (turbidity > 0.02) g.rect(0, surface, width, bottom - surface).fill({ color: 0x9a9a40, alpha: turbidity });
    // 缸壁藻類：四周與角落較濃
    if (state.algae > 0.02) {
      const a = state.algae;
      g.rect(0, surface, width, bottom - surface).fill({ color: 0x4f8a2a, alpha: a * 0.25 });
      for (let i = 0; i < 40 * a; i++) {
        const x = (i * 131) % width;
        const edge = i % 2 === 0 ? surface + ((i * 17) % 60) : bottom - ((i * 23) % 80);
        g.circle(x, edge, (4 + (i % 5) * 3) * this.scale).fill({ color: 0x3f7a22, alpha: a * 0.35 });
      }
    }
    // 夜晚（關燈或停電）
    if (!isLightOn(state)) g.rect(0, 0, width, height).fill({ color: 0x050c1a, alpha: 0.5 });
  }
}
