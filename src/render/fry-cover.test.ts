import { describe, expect, it } from 'vitest';
import { floorAt } from './layout';
import { spawnSwimmer, updateSwimmer, type FishCondition, type Swimmer } from './fish-motion';

function rng(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const bounds = { width: 900, height: 500, surface: 40, bottom: 440 };
const FRY = { halfLen: 5, halfH: 2 };
const ADULT = { halfLen: 30, halfH: 9 };
const perches = [
  { x: 250, top: 300 },
  { x: 600, top: 280 },
];

/** 游 seconds 秒，每 0.5 秒記一次每尾小魚離最近草莖的水平距離。 */
function swim(fry: Swimmer[], others: Swimmer[], cover: FishCondition['cover'], seconds: number, rand: () => number, shot: (fry: Swimmer[]) => void): void {
  const all = [...fry, ...others];
  const ctx = { bounds, scale: 1, food: [], plants: perches.map((q) => q.x), perches };
  let t = 0, next = 3;
  for (let i = 0; i < seconds * 30; i++) {
    for (const s of fry) updateSwimmer(s, all, { alive: true, hungry: false, symptoms: [], body: FRY, cover }, ctx, 1 / 30, rand);
    for (const s of others) updateSwimmer(s, all, { alive: true, hungry: false, symptoms: [], body: ADULT }, ctx, 1 / 30, rand);
    if ((t += 1 / 30) >= next) {
      next += 0.5;
      shot(fry);
    }
  }
}

const stemDist = (s: Swimmer) => Math.min(...perches.map((q) => Math.abs(q.x - s.x)));

describe('躲草的小魚在草叢間游進游出（polish-to-9.md §10.1）', () => {
  it('大部分時間待在草莖旁邊的下半段，也會游出去再回來', () => {
    const rand = rng(7);
    const fry = Array.from({ length: 8 }, (_, i) => spawnSwimmer(100 + i, 'guppy', bounds, rand));
    let shots = 0, inside = 0, out = 0;
    swim(fry, [], 'plants', 90, rand, (list) => {
      for (const s of list) {
        shots++;
        const d = stemDist(s);
        if (d < 18 && s.y > 280 - 10) inside++;
        if (d > 28) out++;
      }
    });
    expect(inside / shots).toBeGreaterThan(0.5);
    expect(out / shots).toBeGreaterThan(0.05);
  });

  it('大魚游近時小魚不會留在外面：草邊有大魚的時候，游出去的比例比沒有大魚時低', () => {
    const outShare = (withAdult: boolean) => {
      const rand = rng(19);
      const fry = Array.from({ length: 8 }, (_, i) => spawnSwimmer(200 + i, 'guppy', bounds, rand));
      // 大魚一直在兩株草附近來回巡
      const adult = spawnSwimmer(1, 'guppy', bounds, rand);
      let shots = 0, out = 0;
      swim(fry, withAdult ? [adult] : [], 'plants', 90, rand, (list) => {
        if (withAdult) {
          adult.x = 250 + Math.sin(shots) * 30;
          adult.y = floorAt(bounds, adult.x) - 30;
        }
        for (const s of list) {
          shots++;
          if (stemDist(s) > 28) out++;
        }
      });
      return out / shots;
    };
    expect(outShare(true)).toBeLessThan(outShare(false));
  });

  it('沒有草的缸照一般的游法，不會卡住', () => {
    const rand = rng(3);
    const s = spawnSwimmer(5, 'guppy', bounds, rand);
    const ctx = { bounds, scale: 1, food: [] };
    for (let i = 0; i < 300; i++) updateSwimmer(s, [s], { alive: true, hungry: false, symptoms: [], body: FRY, cover: 'plants' }, ctx, 1 / 30, rand);
    expect(s.hideout).toBeUndefined();
    expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
  });
});

describe('育幼盒裡的小魚擠成一團（polish-to-9.md §10.1）', () => {
  it('擠成一團時，小魚散開的範圍比一般游法小很多', () => {
    const spread = (cover: FishCondition['cover']) => {
      const rand = rng(11);
      // 盒子大約 160×90：一開始散在盒子的範圍裡
      const fry = Array.from({ length: 12 }, (_, i) => Object.assign(spawnSwimmer(300 + i, 'guppy', bounds, rand), { x: 600 + rand() * 160, y: 60 + rand() * 90 }));
      let sum = 0, shots = 0;
      swim(fry, [], cover, 40, rand, (list) => {
        const mx = list.reduce((a, s) => a + s.x, 0) / list.length;
        const my = list.reduce((a, s) => a + s.y, 0) / list.length;
        sum += Math.max(...list.map((s) => Math.hypot(s.x - mx, s.y - my)));
        shots++;
      });
      return sum / shots;
    };
    const huddle = spread('huddle');
    expect(huddle).toBeLessThan(30);
    expect(huddle).toBeLessThan(spread(undefined) * 0.5);
  });
});
