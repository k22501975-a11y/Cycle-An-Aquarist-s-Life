import { describe, expect, it } from 'vitest';
import type { FishSpeciesId } from '../sim';
import { personalSpace, spawnSwimmer, updateSwimmer, type Swimmer } from './fish-motion';

function rng(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const BODY = { halfLen: 34, halfH: 10 };

/** 兩條魚的身體是不是疊在一起（前後重疊超過一半身長、上下重疊超過一半身高），看不出是兩條。 */
const clumped = (a: Swimmer, b: Swimmer) => Math.abs(a.x - b.x) < BODY.halfLen && Math.abs(a.y - b.y) < BODY.halfH;

/** 照評測的方法：游 2 分鐘，每 0.7 秒拍一張，算有幾張裡有魚疊成一團。 */
function clumpShots(seed: number): { shots: number; clumps: number } {
  const rand = rng(seed);
  const bounds = { width: 900, height: 500, surface: 40, bottom: 440 };
  const kinds: FishSpeciesId[] = ['zebrafish', 'zebrafish', 'zebrafish', 'zebrafish', 'zebrafish', 'zebrafish', 'guppy', 'guppy', 'guppy', 'guppy'];
  const fish = kinds.map((k, i) => spawnSwimmer(i + 1, k, bounds, rand));
  const ctx = { bounds, scale: 1, food: [] };
  let shots = 0, clumps = 0, t = 0, next = 5;
  for (let i = 0; i < 120 * 30; i++) {
    for (const s of fish) updateSwimmer(s, fish, { alive: true, hungry: false, symptoms: [], body: BODY }, ctx, 1 / 30, rand);
    t += 1 / 30;
    if (t >= next) {
      next += 0.7;
      shots++;
      if (fish.some((a, i) => fish.slice(i + 1).some((b) => clumped(a, b)))) clumps++;
    }
  }
  return { shots, clumps };
}

describe('魚不會疊成一團（#147）', () => {
  it('同一群的魚各自保持距離：疊在一起的照片不到一成', () => {
    let shots = 0, clumps = 0;
    for (const seed of [3, 11, 29]) {
      const r = clumpShots(seed);
      shots += r.shots;
      clumps += r.clumps;
    }
    expect(clumps / shots).toBeLessThan(0.1);
  });

  it('疊在同一點時會上下錯開，不是卡住不動', () => {
    const a = { id: 1, species: 'zebrafish', x: 100, y: 100, vx: 0, vy: 0, wander: 0, phase: 0, size: BODY } as Swimmer;
    const b = { ...a, id: 2 };
    expect(personalSpace(a, b, 1).y).toBeLessThan(0);
    expect(personalSpace(b, a, 1).y).toBeGreaterThan(0);
  });

  it('離得夠遠就不推', () => {
    const a = { id: 1, species: 'zebrafish', x: 100, y: 100, vx: 0, vy: 0, wander: 0, phase: 0, size: BODY } as Swimmer;
    expect(personalSpace(a, { ...a, id: 2, x: 200 }, 1)).toEqual({ x: 0, y: 0 });
  });
});
