import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { replaceSubstrate, SUBSTRATES } from '../sim';
import { dirtSpots, floorY, frontLip, sandSurface, substrateLook, substrateName, tankSubstrateLook } from './substrate';

describe('底沙這一層', () => {
  it('依底材換外觀，沒鋪就是裸缸', () => {
    expect(substrateLook('soil')).toBe('soil');
    expect(substrateLook('coral')).toBe('coral');
    expect(substrateLook('sand')).toBe('sand');
    expect(substrateLook(undefined)).toBe('bare');
  });

  it('新缸存檔沒記底材也畫石英砂，明確拆掉（null）才是裸缸（評測 V1 回歸）', () => {
    const s = newGameState(1);
    expect(s.equipment.substrate).toBeUndefined();
    expect(tankSubstrateLook(s.equipment.substrate)).toBe('sand');
    replaceSubstrate(s, SUBSTRATES.soil);
    expect(tankSubstrateLook(s.equipment.substrate)).toBe('soil');
    expect(tankSubstrateLook(null)).toBe('bare');
  });

  it('商店標「使用中」、設備面板寫的底材，和缸裡畫的是同一種（玩家體驗評測 P2-3）', () => {
    const s = newGameState(1);
    expect(substrateName(s.equipment.substrate)).toBe('石英砂');
    for (const spec of Object.values(SUBSTRATES)) {
      replaceSubstrate(s, spec);
      expect(tankSubstrateLook(s.equipment.substrate)).toBe(spec.id);
      expect(substrateName(s.equipment.substrate)).toBe(spec.name);
    }
    expect(substrateName(null)).toBe('裸缸');
  });

  it('前低後高：前玻璃那條邊比沙面低，東西停在兩者之間', () => {
    for (const x of [0, 200, 545, 800, 1000]) {
      const top = sandSurface('soil', x, 1000, 500, 1);
      const lip = frontLip('soil', x, 1000, 500, 1);
      const floor = floorY('soil', x, 1000, 500, 1);
      expect(lip).toBeGreaterThan(top + 10);
      expect(floor).toBeGreaterThan(top);
      expect(floor).toBeLessThan(lip);
    }
  });

  it('沙面有起伏，而且連續（兩段接得起來）', () => {
    expect(sandSurface('sand', 270, 1000, 500, 1)).toBeLessThan(sandSurface('sand', 800, 1000, 500, 1));
    expect(Math.abs(sandSurface('sand', 544.9, 1000, 500, 1) - sandSurface('sand', 545.1, 1000, 500, 1))).toBeLessThan(0.5);
  });

  it('平常沙面幾乎乾淨，餵太多髒點越積越多，有上限', () => {
    expect(dirtSpots(1.5)).toBe(0);
    expect(dirtSpots(5)).toBeGreaterThan(dirtSpots(3));
    expect(dirtSpots(100)).toBe(48);
  });
});
