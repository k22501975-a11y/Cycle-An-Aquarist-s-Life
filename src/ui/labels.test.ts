import { describe, expect, it } from 'vitest';
import { addFish, addPlant, buyNurseryBox, createTank, NURSERY_FRY_CAPACITY, TANKS, type TankState } from '../sim';
import { fryEatenText } from './labels';

function tank(): TankState {
  const s = createTank({ tank: TANKS.std40, seed: 3 });
  addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male' });
  return s;
}

describe('小魚被吃的說法（UX r12）', () => {
  it('連續幾天被吃，每天的說法不一樣', () => {
    const s = tank();
    const texts = new Set<string>();
    for (let d = 0; d < 6; d++) {
      s.hours = d * 24 + 8;
      texts.add(fryEatenText(s, 2, false));
    }
    expect(texts.size).toBeGreaterThanOrEqual(3);
    for (const t of texts) expect(t).toMatch(/^2 尾小魚/);
  });

  it('看情況給建議：草少教種密草、有盒子教撈進盒、母魚快生教先放進盒', () => {
    const s = tank();
    expect(fryEatenText(s, 1, false)).toMatch(/莫絲|矮珍珠/);
    buyNurseryBox(s);
    const fry = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    fry.lengthCm = 0.8;
    fry.ageDays = 3;
    expect(fryEatenText(s, 1, false)).toContain('撈進育幼盒');
    const mom = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female' });
    mom.pregnancy = 0.96;
    expect(fryEatenText(s, 1, false)).toMatch(/母魚.*育幼盒/);
    // 母魚進了盒子：盒子不收小魚，叫玩家等她生完，不叫人撈進去（架構建議，#191）
    mom.nursery = true;
    const tip = fryEatenText(s, 1, false);
    expect(tip).toMatch(/等她生完/);
    expect(tip).not.toMatch(/滿了/);
  });

  it('草夠密就不再叫玩家種草', () => {
    const s = tank();
    for (let i = 0; i < 8; i++) addPlant(s, 'moss');
    for (const p of s.plants) p.biomassG = 40;
    for (let d = 0; d < 4; d++) {
      s.hours = d * 24;
      expect(fryEatenText(s, 1, false)).not.toMatch(/多種|水草太少/);
    }
  });

  it('育幼盒滿了不叫你放回主缸：叫你準備第二缸；第二缸能收就叫你搬過去（g36 #425）', () => {
    const s = tank();
    buyNurseryBox(s);
    for (let i = 0; i <= NURSERY_FRY_CAPACITY; i++) {
      const f = addFish(s, 'guppy', { carriesIch: false, carries: [] });
      Object.assign(f, { lengthCm: 0.8, ageDays: 3, nursery: i < NURSERY_FRY_CAPACITY || undefined });
    }
    for (let d = 0; d < 4; d++) {
      s.hours = d * 24;
      const one = fryEatenText(s, 1, false);
      expect(one).not.toMatch(/放回主缸|放出去/);
      expect(one).toMatch(/第二.*缸/);
      expect(fryEatenText(s, 1, false, null, true)).toMatch(/另一缸/);
      expect(fryEatenText(s, 1, false, '第 2 缸')).toMatch(/第 2 缸.*(搬|安全)/);
    }
  });

  it('小蝦有自己的說法', () => {
    expect(fryEatenText(tank(), 3, true)).toMatch(/^3 隻小蝦/);
  });
});
