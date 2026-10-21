import { describe, expect, it } from 'vitest';
import { spawnSwimmer, updateSwimmer } from './fish-motion';
import { floorAt } from './layout';

function rng(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

const bounds = { width: 900, height: 500, surface: 40, bottom: 440 };
const full = { alive: true, hungry: false, symptoms: [] };

describe('蝦爬水草（#273）', () => {
  it('旁邊有草的蝦過一陣子會爬上去，待一會兒再爬下來', () => {
    const rand = rng(11);
    const s = spawnSwimmer(1, 'cherry_shrimp', bounds, rand);
    s.x = 300;
    const ctx = { bounds, scale: 1, food: [], perches: [{ x: 320, top: 200 }] };
    let highest = 0, climbed = false, backDown = false;
    for (let i = 0; i < 60 * 240; i++) {
      updateSwimmer(s, [s], full, ctx, 1 / 60, rand);
      const lift = floorAt(bounds, s.x) - s.y;
      highest = Math.max(highest, lift);
      if (s.climb) climbed = true;
      else if (climbed) backDown = true;
    }
    expect(climbed).toBe(true);
    // 爬到草的一半左右，不會爬出草頂
    expect(highest).toBeGreaterThan(40);
    expect(highest).toBeLessThan(floorAt(bounds, 320) - 200);
    expect(backDown).toBe(true);
  });

  it('沒有草就一直走在底沙上', () => {
    const rand = rng(11);
    const s = spawnSwimmer(1, 'cherry_shrimp', bounds, rand);
    const ctx = { bounds, scale: 1, food: [] };
    for (let i = 0; i < 60 * 120; i++) {
      updateSwimmer(s, [s], full, ctx, 1 / 60, rand);
      expect(s.climb).toBeUndefined();
      expect(floorAt(bounds, s.x) - s.y).toBeLessThan(15);
    }
  });

  it('餓了又有飼料沉下來就爬下來', () => {
    const rand = rng(3);
    const s = spawnSwimmer(1, 'cherry_shrimp', bounds, rand);
    s.x = 320;
    s.climb = { x: 320, h: 80, t: 30, lift: 80 };
    const ctx = { bounds, scale: 1, food: [{ x: 500, y: 430 }], perches: [{ x: 320, top: 200 }] };
    for (let i = 0; i < 60 * 15 && s.climb; i++) updateSwimmer(s, [s], { ...full, hungry: true }, ctx, 1 / 60, rand);
    expect(s.climb).toBeUndefined();
  });
});
