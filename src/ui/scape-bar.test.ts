import { describe, expect, it } from 'vitest';
import { addHardscape, addPlant, createTank, FILTERS, HARDSCAPE, HEATERS, LIGHTS, placeHardscape, plantPlacement, TANKS } from '../sim';
import { firstLayer } from './scape-bar';

const tank = () => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h100, targetC: 25 }, light: { spec: LIGHTS.planted }, seed: 3 });

describe('進造景模式停在有東西的那層（F1-c）', () => {
  it('空缸停在中景', () => {
    expect(firstLayer(tank())).toBe('mid');
  });

  it('有石頭就停在石頭那層（拖得到東西）', () => {
    const s = tank();
    addHardscape(s, HARDSCAPE.seiryu);
    placeHardscape(s, 0, { layer: 'back' });
    expect(firstLayer(s)).toBe('back');
  });

  it('只有水草就停在水草那層', () => {
    const s = tank();
    const plant = addPlant(s, 'anubias');
    expect(firstLayer(s)).toBe(plantPlacement(plant).layer);
  });
});
