import { describe, expect, it } from 'vitest';
import { spawnSwimmer, stepTurn, updateSwimmer, type TurnState } from './fish-motion';

/** 一條餓的孔雀魚追一顆停在水中的飼料：數牠 10 秒內翻面幾次。 */
function chase(): number {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bounds = { width: 900, height: 500, surface: 40, bottom: 440 };
  const s = spawnSwimmer(1, 'guppy', bounds, rand);
  s.x = 200;
  s.y = 200;
  const turn: TurnState = { f: s.vx < 0 ? 1 : -1, v: 0 };
  const ctx = { bounds, scale: 1, food: [{ x: 420, y: 230 }] };
  let flips = 0, last = Math.sign(turn.f);
  for (let i = 0; i < 600; i++) {
    updateSwimmer(s, [s], { alive: true, hungry: true, symptoms: [] }, ctx, 1 / 60, rand);
    stepTurn(turn, s.vx, 1 / 60);
    if (Math.sign(turn.f) !== last) {
      flips++;
      last = Math.sign(turn.f);
    }
  }
  return flips;
}

describe('追飼料', () => {
  // 改之前同樣情境 10 秒翻 14 次（看起來像兩張圖在交替）
  it('游到飼料旁邊停著搶食，不會一直左右翻面', () => {
    expect(chase()).toBeLessThanOrEqual(2);
  });
});

function rng(seed: number): () => number {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

describe('剛撒飼料的搶食', () => {
  const bounds = { width: 900, height: 500, surface: 40, bottom: 440 };
  const run = (frenzy: number) => {
    const rand = rng(11);
    const s = spawnSwimmer(1, 'guppy', bounds, rand);
    s.x = 450;
    s.y = 300;
    const ctx = { bounds, scale: 1, food: [{ x: 470, y: 42 }], frenzy };
    for (let i = 0; i < 120; i++) updateSwimmer(s, [s], { alive: true, hungry: false, symptoms: [] }, ctx, 1 / 60, rand);
    return s.y;
  };

  it('不太餓的魚也會在兩秒內衝上水面搶', () => {
    expect(run(1)).toBeLessThan(120);
  });

  it('沒撒飼料時不餓的魚不會理水面的碎屑', () => {
    expect(run(0)).toBeGreaterThan(150);
  });
});

describe('整條魚留在缸裡', () => {
  it('身體不會超出缸壁或埋進底沙', () => {
    const rand = rng(5);
    const bounds = { width: 600, height: 400, surface: 30, bottom: 340 };
    const body = { halfLen: 40, halfH: 14 };
    const fish = Array.from({ length: 8 }, (_, i) => spawnSwimmer(i, 'guppy', bounds, rand));
    for (let i = 0; i < 60 * 30; i++) {
      for (const s of fish) updateSwimmer(s, fish, { alive: true, hungry: false, symptoms: [], body }, { bounds, scale: 1, food: [] }, 1 / 60, rand);
      for (const s of fish) {
        expect(s.x - body.halfLen).toBeGreaterThanOrEqual(0);
        expect(s.x + body.halfLen).toBeLessThanOrEqual(bounds.width);
        expect(s.y + body.halfH).toBeLessThanOrEqual(bounds.bottom);
      }
    }
  });
});
