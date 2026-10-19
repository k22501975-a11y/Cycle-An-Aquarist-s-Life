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
