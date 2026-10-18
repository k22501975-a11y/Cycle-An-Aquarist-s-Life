import { describe, expect, it } from 'vitest';
import { applyFoodLook, pickFoodKind, scatterPellets, stepPellet } from './feeding';

const one = () => scatterPellets(1, 100, 10, 0, () => 0.5)[0];

describe('各種飼料撒下去的樣子', () => {
  it('沉底顆粒不漂、直直沉得比薄片快；紅蟲沉得慢；黏缸壁的不動', () => {
    const flake = one(), pellet = one(), worm = one(), tab = one();
    applyFoodLook(pellet, 'sinking');
    applyFoodLook(worm, 'meat');
    applyFoodLook(tab, 'sticky');
    flake.floatT = 0;
    const y0 = tab.y;
    for (let i = 0; i < 30; i++) for (const p of [flake, pellet, worm, tab]) stepPellet(p, 0.1, 10, 1000, 1);
    expect(pellet.y).toBeGreaterThan(flake.y * 1.5);
    expect(worm.y).toBeLessThan(flake.y);
    expect(tab.y).toBe(y0);
  });

  it('讀檔時照各批份量抽飼料種類', () => {
    const lots = [{ kind: 'floating' as const, mg: 10 }, { kind: 'sinking' as const, mg: 30 }];
    expect(pickFoodKind(lots, 0.1)).toBe('floating');
    expect(pickFoodKind(lots, 0.5)).toBe('sinking');
  });
});
