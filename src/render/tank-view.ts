import { Application, Container, FederatedPointerEvent, FillGradient, Graphics } from 'pixi.js';
import { isCo2Injecting, isLightOn, observeSymptoms, type TankState } from '../sim';
import { spawnSwimmer, updateSwimmer, type Swimmer } from './fish-motion';
import { tankBounds, unitScale, type TankBounds } from './layout';
import { createFishSprite, drawIchSpots, drawPlant, type FishSprite } from './sprites';

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
  private readonly background = new Graphics();
  private readonly plantLayer = new Container();
  private readonly foodLayer = new Container();
  private readonly fishLayer = new Container();
  private readonly bubbleLayer = new Graphics();
  private readonly overlay = new Graphics();
  private readonly gear = new Graphics();

  private bounds: TankBounds;
  private scale: number;
  private swimmers = new Map<number, { swimmer: Swimmer; sprite: FishSprite; ichDrawn: boolean }>();
  private plants = new Map<number, PlantView>();
  private food: FoodParticle[] = [];
  private bubbles: Bubble[] = [];
  private selectedFish: number | null = null;
  private seed = 12345;

  constructor(private readonly app: Application, private readonly events: TankViewEvents = {}) {
    this.bounds = tankBounds(app.screen.width, app.screen.height);
    this.scale = unitScale(this.bounds);
    this.root.addChild(this.background, this.gear, this.plantLayer, this.foodLayer, this.fishLayer, this.bubbleLayer, this.overlay);
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
    this.bounds = tankBounds(this.app.screen.width, this.app.screen.height);
    this.scale = unitScale(this.bounds);
    const { width, height, surface, bottom } = this.bounds;
    this.root.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x <= width && y <= height };

    const water = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0x3d8fb0 },
        { offset: 1, color: 0x123e54 },
      ],
    });
    this.background.clear();
    this.background.rect(0, 0, width, surface).fill(0x0e2230);
    this.background.rect(0, surface, width, bottom - surface).fill(water);
    this.background.rect(0, surface, width, 2).fill({ color: 0xffffff, alpha: 0.35 });
    this.background.rect(0, bottom, width, height - bottom).fill(0x6b5a45);
    for (let i = 0; i < width / 3; i++) {
      const x = (i * 97) % width;
      const y = bottom + ((i * 53) % Math.max(1, height - bottom));
      this.background.circle(x, y, 1 + (i % 3) * 0.6).fill({ color: i % 2 ? 0x8a7558 : 0x4f4232, alpha: 0.8 });
    }
    // 重新排列水草（位置依畫面寬度）
    for (const view of this.plants.values()) view.drawnBiomass = -1;
  }

  private handleTap(x: number, y: number): void {
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
      if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) {
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
    this.updateBubbles(state, dt);
    this.drawOverlay(state);
  }

  private syncFood(state: TankState, dt: number): void {
    const { width, surface, bottom } = this.bounds;
    const target = Math.min(80, Math.ceil(state.water.foodMg / 2));
    while (this.food.length < target) {
      const g = new Graphics().circle(0, 0, 1.6 * this.scale).fill(0xc8873a);
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
      if (!entry) {
        const swimmer = spawnSwimmer(fish.id, fish.species, this.bounds, () => this.rand());
        const sprite = createFishSprite(fish.species, this.scale * 1.5, fish.id);
        this.fishLayer.addChild(sprite.root);
        entry = { swimmer, sprite, ichDrawn: false };
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
      sprite.root.scale.x = facingLeft ? -1 : 1;
      if (!fish.alive) {
        sprite.root.rotation = 0;
        sprite.root.scale.y = -1;
        sprite.root.alpha = 0.75;
        sprite.body.tint = 0x9a9a9a;
      } else {
        sprite.root.scale.y = 1;
        const tilt = symptoms.includes('loss_of_balance') ? 1.2 : Math.max(-0.35, Math.min(0.35, Math.atan2(swimmer.vy, Math.abs(swimmer.vx) + 1) * 0.6));
        sprite.root.rotation = facingLeft ? -tilt : tilt;
        sprite.tail.rotation = Math.sin(swimmer.phase) * (symptoms.includes('clamped_fins') ? 0.1 : 0.35);
        sprite.tail.scale.y = symptoms.includes('clamped_fins') ? 0.55 : 1;
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
      g.roundRect(width - 46 * s, surface - 14 * s, 36 * s, 34 * s, 4 * s).fill({ color: 0x2b3238, alpha: 0.9 });
    }
    if (eq.heater) {
      const on = eq.heater.heating && !eq.heater.broken && !state.environment.powerOut;
      g.roundRect(10 * s, surface + 20 * s, 7 * s, 70 * s, 3 * s).fill({ color: 0xcfd8dc, alpha: 0.6 });
      g.circle(13.5 * s, surface + 26 * s, 2 * s).fill(eq.heater.broken ? 0x555555 : on ? 0xff7043 : 0x5d4037);
    }
    if (eq.co2) {
      g.circle(width * 0.5, bottom - 10 * s, 5 * s).fill({ color: 0xb0bec5, alpha: 0.7 });
    }
    if (eq.airPump) {
      g.roundRect(width * 0.82, bottom - 8 * s, 10 * s, 6 * s, 2 * s).fill({ color: 0x78909c, alpha: 0.8 });
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
      g.circle(b.x, b.y, b.r).stroke({ color: 0xffffff, width: 0.8, alpha: 0.6 });
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
