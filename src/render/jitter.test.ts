import { describe, expect, it } from 'vitest';
import { spawnSwimmer, updateSwimmer } from './fish-motion';

function rng(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/**
 * 魚不抽搐（YenWel 回報「魚一直抽搐抖動」）：愛躲、貼著底沙待的魚，原本一越過底部的線就被推一大下、
 * 離開就不推，上下速度每格變號，身體跟著一直點頭。現在越靠近推得越用力，頂到底沙時往下的速度歸零。
 */
function bounces(dt: number): number {
  const rand = rng(11);
  const bounds = { width: 900, height: 500, surface: 40, bottom: 440 };
  const fish = Array.from({ length: 4 }, (_, i) => spawnSwimmer(i + 1, 'guppy', bounds, rand));
  const ctx = { bounds, scale: 1, food: [] };
  const lastVy = fish.map(() => 0);
  let count = 0;
  for (let i = 0; i < 30 / dt; i++) {
    for (const s of fish) updateSwimmer(s, fish, { alive: true, hungry: false, symptoms: ['hiding'], body: { halfLen: 34, halfH: 10 } }, ctx, dt, rand);
    fish.forEach((s, k) => {
      // 貼在底部那一帶時，上下速度明顯反向才算一次
      if (i > 60 && s.y > 380 && s.vy * lastVy[k] < 0 && Math.abs(s.vy - lastVy[k]) > 4) count++;
      lastVy[k] = s.vy;
    });
  }
  return count;
}

describe('魚不會抽搐抖動', () => {
  it('愛躲的魚貼著底沙待 30 秒，上下速度不會一格一格來回彈', () => {
    expect(bounces(1 / 60)).toBeLessThan(20);
    expect(bounces(1 / 20)).toBeLessThan(20);
  });
});
