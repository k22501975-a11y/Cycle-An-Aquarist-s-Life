import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { PestKind, Snail, TankState } from '../sim';
import { paintedTexture } from './painted';
import type { TankBounds } from './layout';
import { floorY, type SubstrateLook } from './substrate';

/**
 * 螺（design/snails.md §5）：大螺在沙面、缸壁上慢慢爬；害蟲小螺照數量畫（最多 60 隻），
 * 餵太多時一眼看得到滿缸都是；尖螺白天躲在沙裡，關燈才爬出來。
 * 蘋果螺卵塊黏在水面上方的缸壁，斑馬螺的白色卵點黏在沙面上。
 */

export interface SnailScene {
  bounds: TankBounds;
  look: SubstrateLook;
  /** 每公分幾個像素、圖面縮放。 */
  ppc: number;
  hs: number;
  lit: boolean;
  time: number;
}

/**
 * 整張圖的長度（cm，含伸出殼外的腹足）。魚的圖放大了 1.5～1.8 倍，螺只放大一點，
 * 成螺才不會跟魚一樣大：蘋果螺成體約一隻成年孔雀魚身長（不含尾鰭）。
 */
const SIZE_CM = { apple: 3, nerite: 1.7, assassin: 1.8, ramshorn: 1.1, bladder: 1, mts: 1.4, babies: 1.6, eggs: 3.2 };
const TEX = {
  apple: (c?: string) => `snail-apple-${c === 'blue' || c === 'purple' || c === 'ivory' ? c : 'gold'}`,
  nerite: 'snail-nerite-zebra',
  assassin: 'snail-assassin',
  ramshorn: 'snail-ramshorn-red',
  bladder: 'snail-bladder',
  mts: 'snail-mts',
  babies: 'snail-apple-babies',
  eggs: 'snail-apple-eggs',
};
const MAX_PESTS = 60;

/** 0–1 的固定亂數（同一隻螺每一幀都在同一條路上）。 */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

interface Crawler {
  sprite: Sprite;
  /** 爬在哪：沙面或缸壁（玻璃上的高度 0–1）。 */
  onGlass: number | null;
  u: number;
  speed: number;
  phase: number;
}

export class SnailView {
  readonly layer = new Container();
  private readonly eggDots = new Graphics();
  private readonly trap = new Graphics();
  private readonly big = new Map<number, Crawler>();
  private readonly pests: Crawler[] = [];
  private pestKinds: PestKind[] = [];
  private readonly clutches = new Map<number, Sprite>();
  private readonly babies: Sprite[] = [];
  private eggKey = '';

  constructor() {
    this.layer.addChild(this.eggDots, this.trap);
  }

  sync(state: TankState, scene: SnailScene): void {
    const s = state.snails;
    this.syncBig(s?.snails ?? [], scene);
    this.syncPests(state, scene);
    this.syncClutches(state, scene);
    this.syncBabies(s?.appleYoung ?? 0, s?.appleYoungColor, scene);
    this.drawEggDots(s?.neriteEggs ?? 0, scene);
    this.drawTrap(s?.trapHour !== undefined ? state.hours - s.trapHour : null, scene);
  }

  /** 沿著沙面或玻璃慢慢來回爬：回傳位置和朝向。 */
  private place(c: Crawler, scene: SnailScene, lengthPx: number, tex: Texture): void {
    const { width, surface, bottom } = scene.bounds;
    // 一分鐘大約爬一個身長，來回在一小段範圍
    const swing = Math.sin(scene.time * c.speed + c.phase);
    const x = width * (0.06 + 0.88 * c.u) + swing * lengthPx * 3;
    const dir = Math.cos(scene.time * c.speed + c.phase) >= 0 ? 1 : -1;
    const floor = floorY(scene.look, x, width, bottom, scene.hs);
    const y = c.onGlass === null ? floor - lengthPx * 0.05 : surface + (floor - surface) * (0.15 + 0.75 * c.onGlass);
    c.sprite.position.set(x, y);
    const k = lengthPx / tex.width;
    c.sprite.scale.set(dir * k, k);
    // 玻璃上的螺有時候往上爬
    c.sprite.rotation = c.onGlass === null ? 0 : (c.phase % 1 > 0.5 ? -1 : 1) * 0.35 * dir;
  }

  /** 看得到的螺在缸裡的位置（root 座標、大概的半徑）：給點螺、每日小事的光圈用。 */
  targets(): Array<{ x: number; y: number; r: number }> {
    const out: Array<{ x: number; y: number; r: number }> = [];
    for (const c of [...this.big.values(), ...this.pests]) {
      const s = c.sprite;
      if (!s.visible || s.destroyed) continue;
      const r = Math.max(s.width, s.height) / 2;
      // 錨點在殼底（0.9），中心往上半個身高
      out.push({ x: s.x, y: s.y - s.height * 0.4, r });
    }
    return out;
  }

  private syncBig(snails: Snail[], scene: SnailScene): void {
    const live = new Set<number>();
    for (const x of snails) {
      const key = x.kind === 'apple' ? TEX.apple(x.color) : TEX[x.kind];
      const tex = paintedTexture(key);
      if (!tex) continue;
      live.add(x.id);
      let c = this.big.get(x.id);
      if (!c) {
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5, 0.9);
        // 蘋果螺、斑馬螺多半在玻璃、石頭上；刺客螺埋在沙裡找螺吃
        const glass = x.kind !== 'assassin' && hash(x.id) < 0.5;
        c = { sprite, onGlass: glass ? hash(x.id * 3) : null, u: hash(x.id * 7), speed: 0.03 + 0.03 * hash(x.id * 11), phase: hash(x.id * 13) * 6.28 };
        this.big.set(x.id, c);
        this.layer.addChild(sprite);
      }
      const len = scene.ppc * SIZE_CM[x.kind] * (x.kind === 'apple' ? Math.min(1, 0.45 + x.ageDays / 160) : 1);
      if (x.alive) {
        this.place(c, scene, len, tex);
        c.sprite.alpha = 1;
        c.sprite.tint = 0xffffff;
      } else {
        // 死螺：掉到沙面上翻過來、顏色發暗
        c.onGlass = null;
        const { width, bottom } = scene.bounds;
        const px = width * (0.06 + 0.88 * c.u);
        c.sprite.position.set(px, floorY(scene.look, px, width, bottom, scene.hs) - len * 0.3);
        c.sprite.scale.set(len / tex.width, len / tex.width);
        c.sprite.rotation = Math.PI * 0.85;
        c.sprite.tint = 0x8a7a68;
        c.sprite.alpha = 0.85;
      }
    }
    for (const [id, c] of this.big) {
      if (live.has(id)) continue;
      c.sprite.destroy();
      this.big.delete(id);
    }
  }

  private syncPests(state: TankState, scene: SnailScene): void {
    const p = state.snails?.pests;
    // 照比例分配畫幾隻（尖螺白天只看得到一兩成）
    const visible = (k: PestKind) => (p ? p[k] * (k === 'mts' && scene.lit ? 0.1 : 1) : 0);
    const total = (['ramshorn', 'bladder', 'mts'] as PestKind[]).reduce((a, k) => a + visible(k), 0);
    const shown = Math.min(MAX_PESTS, Math.round(total));
    const kinds: PestKind[] = [];
    if (p && total > 0)
      for (const k of ['ramshorn', 'bladder', 'mts'] as PestKind[]) {
        const n = Math.round((visible(k) / total) * shown);
        for (let i = 0; i < n && kinds.length < shown; i++) kinds.push(k);
      }
    if (kinds.join() !== this.pestKinds.join()) {
      for (const c of this.pests) c.sprite.destroy();
      this.pests.length = 0;
      kinds.forEach((k, i) => {
        const tex = paintedTexture(TEX[k]);
        if (!tex) return;
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5, 0.9);
        const seed = i * 17 + k.length * 101;
        // 多半在沙面和下半缸的玻璃上，少數爬到上面；尖螺晚上從沙裡鑽出來貼著沙面
        const glass = hash(seed) < (k === 'mts' ? 0.3 : 0.45) ? 0.5 + 0.5 * Math.sqrt(hash(seed * 3)) : null;
        // 在玻璃上的偏向缸的兩側（後面的玻璃角落）
        const u = glass === null ? hash(seed * 7) : (hash(seed * 7) < 0.5 ? 0.12 : 0.88) + (hash(seed * 19) - 0.5) * 0.3;
        if (glass !== null) sprite.alpha = 0.85;
        this.pests.push({ sprite, onGlass: glass, u, speed: 0.05 + 0.05 * hash(seed * 11), phase: hash(seed * 13) * 6.28 });
        this.layer.addChild(sprite);
      });
      this.pestKinds = kinds;
    }
    this.pests.forEach((c, i) => {
      const k = this.pestKinds[i];
      this.place(c, scene, scene.ppc * SIZE_CM[k] * (0.7 + 0.5 * hash(i * 5)), c.sprite.texture);
    });
  }

  private syncClutches(state: TankState, scene: SnailScene): void {
    const tex = paintedTexture(TEX.eggs);
    const list = state.snails?.clutches ?? [];
    const live = new Set<number>();
    for (const c of list) {
      if (!tex) break;
      live.add(c.id);
      let sp = this.clutches.get(c.id);
      if (!sp) {
        sp = new Sprite(tex);
        // 卵塊產在水面上方的缸壁，畫面上貼著水面線（水面上方被狀態列擋住）
        sp.anchor.set(0.5, 0.2);
        this.clutches.set(c.id, sp);
        this.layer.addChild(sp);
      }
      const { width, surface } = scene.bounds;
      const len = scene.ppc * SIZE_CM.eggs * (0.7 + c.eggs / 400);
      // 快孵化時顏色變淡（粉紅轉灰白）
      const age = state.hours - c.hour;
      sp.tint = age > 24 * 14 ? 0xe8d8d8 : 0xffffff;
      sp.position.set(width * (0.1 + 0.8 * hash(c.id)), surface);
      sp.scale.set(len / tex.width);
    }
    for (const [id, sp] of this.clutches) {
      if (live.has(id)) continue;
      sp.destroy();
      this.clutches.delete(id);
    }
  }

  private syncBabies(young: number, color: string | undefined, scene: SnailScene): void {
    const tex = paintedTexture(TEX.babies);
    // 一張圖有 6 隻：每 6 隻小螺畫一團，最多 10 團
    const want = tex ? Math.min(10, Math.ceil(young / 6)) : 0;
    while (this.babies.length > want) this.babies.pop()!.destroy();
    while (this.babies.length < want && tex) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 0.9);
      this.babies.push(sp);
      this.layer.addChild(sp);
    }
    const { width, bottom } = scene.bounds;
    this.babies.forEach((sp, i) => {
      const x = width * (0.08 + 0.84 * hash(i * 29 + 3)) + Math.sin(scene.time * 0.05 + i) * scene.ppc;
      const len = scene.ppc * SIZE_CM.babies;
      sp.position.set(x, floorY(scene.look, x, width, bottom, scene.hs));
      sp.scale.set(len / sp.texture.width);
      sp.tint = color === 'blue' ? 0x8fa8ff : 0xffffff;
    });
  }

  /** 斑馬螺的卵點：沙面和造景上一顆顆白點，刮不太乾淨。 */
  private drawEggDots(count: number, scene: SnailScene): void {
    const n = Math.min(120, Math.round(count));
    const key = `${n}:${scene.bounds.width}:${scene.bounds.bottom}:${scene.ppc}`;
    if (key === this.eggKey) return;
    this.eggKey = key;
    const g = this.eggDots.clear();
    const { width, bottom } = scene.bounds;
    for (let i = 0; i < n; i++) {
      const x = width * (0.04 + 0.92 * hash(i * 31 + 7));
      const y = floorY(scene.look, x, width, bottom, scene.hs) - hash(i * 37) * scene.ppc * 2;
      g.circle(x, y, Math.max(1, scene.ppc * 0.09)).fill({ color: 0xfaf6ea, alpha: 0.9 });
    }
  }

  /** 螺陷阱：一片燙過的菜葉躺在沙上，放越久小螺圍越多（越久越黃）。 */
  private drawTrap(ageHours: number | null, scene: SnailScene): void {
    const g = this.trap.clear();
    if (ageHours === null) return;
    const { width, bottom } = scene.bounds;
    const x = width * 0.62;
    const y = floorY(scene.look, x, width, bottom, scene.hs) - scene.ppc * 0.3;
    const w = scene.ppc * 2.4;
    const color = ageHours > 36 ? 0x9c8a3a : 0x6fae4a;
    // 葉形：兩段弧線
    g.moveTo(x - w, y).quadraticCurveTo(x, y - w * 0.55, x + w, y).quadraticCurveTo(x, y + w * 0.4, x - w, y).fill({ color, alpha: 0.95 });
    g.moveTo(x - w * 0.9, y).lineTo(x + w * 0.9, y).stroke({ color: 0xd8e8b0, width: Math.max(1, scene.ppc * 0.12), alpha: 0.7 });
  }
}
