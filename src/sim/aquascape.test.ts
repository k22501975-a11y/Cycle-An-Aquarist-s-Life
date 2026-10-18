import { describe, expect, it } from 'vitest';
import {
  addFish,
  addHardscape,
  addPlant,
  CO2_KITS,
  createTank,
  FILTERS,
  HARDSCAPE,
  hardscapePlacements,
  HEATERS,
  LIGHTS,
  placeHardscape,
  placePlant,
  plantLight,
  plantPlacement,
  removeHardscape,
  SCALE_MAX,
  shadeAt,
  simulate,
  TANKS,
  type CreateTankOptions,
} from './index';

const MATURE: CreateTankOptions = { tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h100, targetC: 25 }, light: { spec: LIGHTS.planted }, matureMedia: true };

describe('造景編輯（aquascape-editor.md）', () => {
  it('石頭、沉木有預設位置；拿掉一組時其他組的位置不會亂掉', () => {
    const s = createTank({ ...MATURE, seed: 1 });
    addHardscape(s, HARDSCAPE.seiryu);
    addHardscape(s, HARDSCAPE.driftwood);
    addHardscape(s, HARDSCAPE.lava);
    const [rock, wood] = hardscapePlacements(s);
    expect(rock.layer).toBe('front');
    expect(wood.layer).toBe('mid');
    placeHardscape(s, 2, { x: 0.9, layer: 'back' });
    removeHardscape(s, 'seiryu');
    const after = hardscapePlacements(s);
    expect(after).toHaveLength(2);
    expect(after[0].layer).toBe('mid');
    expect(after[1]).toMatchObject({ x: 0.9, layer: 'back' });
    addHardscape(s, HARDSCAPE.slate);
    expect(hardscapePlacements(s)[1]).toMatchObject({ x: 0.9, layer: 'back' });
  });

  it('縮放只能在小範圍內，位置不能超出缸', () => {
    const s = createTank({ ...MATURE, seed: 2 });
    addHardscape(s, HARDSCAPE.slate);
    placeHardscape(s, 0, { x: 1.4, scale: 2 });
    expect(hardscapePlacements(s)[0].x).toBeLessThan(1);
    expect(hardscapePlacements(s)[0].scale).toBe(SCALE_MAX);
  });

  it('有魚的缸搬大石頭：水變混濁、魚緊張、有機物變多；開著過濾幾小時就清了', () => {
    const s = createTank({ ...MATURE, seed: 3 });
    addHardscape(s, HARDSCAPE.seiryu);
    const fish = addFish(s, 'zebrafish', { carriesIch: false });
    fish.stress = 0;
    const organic = s.water.organicMg;
    const d = placeHardscape(s, 0, { x: 0.75 });
    expect(d.big).toBe(true);
    expect(d.stressed).toBe(1);
    expect(s.water.turbidity!).toBeGreaterThan(0.2);
    expect(fish.stress).toBeGreaterThan(0.4);
    expect(s.water.organicMg).toBeGreaterThan(organic);
    simulate(s, 12);
    expect(s.water.turbidity ?? 0).toBeLessThan(0.05);

    // 只種幾株草影響很小
    const plant = addPlant(s, 'anubias');
    const small = placePlant(s, plant.id, { x: 0.2 });
    expect(small.big).toBe(false);
    expect(small.turbidity).toBeLessThan(0.1);
    expect(plantPlacement(plant).x).toBeCloseTo(0.2);
  });

  it('陽性草種在沉木下面光不夠，會長得比照得到光的差', () => {
    // 陽性草要打 CO₂ 才長得動，這時光才是限制
    const s = createTank({ ...MATURE, co2: CO2_KITS.diy, seed: 4 });
    addHardscape(s, HARDSCAPE.driftwood);
    placeHardscape(s, 0, { x: 0.5, layer: 'front' });
    expect(shadeAt(s, 0.5, 'mid')).toBeLessThan(0.6);
    expect(shadeAt(s, 0.1, 'mid')).toBe(1);
    // 沉木在前景，種在它前面就不會被遮
    expect(shadeAt(s, 0.5, 'front')).toBeLessThan(1);
    placeHardscape(s, 0, { layer: 'back' });
    expect(shadeAt(s, 0.5, 'front')).toBe(1);
    placeHardscape(s, 0, { layer: 'front' });

    const shaded = addPlant(s, 'rotala');
    const sunny = addPlant(s, 'rotala');
    placePlant(s, shaded.id, { x: 0.5, layer: 'mid' });
    placePlant(s, sunny.id, { x: 0.1, layer: 'mid' });
    expect(plantLight(s, shaded)).toBeLessThan(plantLight(s, sunny));
    shaded.biomassG = sunny.biomassG = 3;
    for (let d = 0; d < 10; d++) {
      s.water.no3 = Math.max(s.water.no3, 15);
      simulate(s, 24);
    }
    expect(sunny.biomassG).toBeGreaterThan(shaded.biomassG * 1.2);
  });
});
