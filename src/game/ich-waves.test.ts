import { describe, expect, it } from 'vitest';
import { ichWaveCounter, type IchDay } from './ich-waves';

const sick: IchDay = { episode: true, visible: true, moved: false };
const latent: IchDay = { episode: true, visible: false, moved: false };
const calm: IchDay = { episode: false, visible: false, moved: false };

/** 一缸每天的狀態跑一遍，回傳總波數。 */
function waves(days: Record<number, IchDay>, last = 30): number {
  const count = ichWaveCounter<string>();
  let n = 0;
  for (let d = 0; d <= last; d++) n += count(d, [['a', days[d] ?? calm]]);
  return n;
}

describe('白點波數的量法（polish-to-9.md §13.6）', () => {
  it('同一缸第 0、5、10 天各發一次：7 天從第一次發病算起不往後延，算 2 波', () => {
    expect(waves({ 0: sick, 5: sick, 10: sick })).toBe(2);
  });

  it('超過 7 天再發算新的一波；第 7 天剛好滿 7 天也算新的', () => {
    expect(waves({ 0: sick, 6: sick })).toBe(1);
    expect(waves({ 0: sick, 7: sick })).toBe(2);
  });

  it('潛伏的魚一直沒長出白點、蟲就沒了：不算', () => {
    expect(waves({ 0: latent, 1: latent })).toBe(0);
    // 潛伏幾天後才長出來：長出來那天算一波
    expect(waves({ 0: latent, 1: latent, 2: sick, 3: sick })).toBe(1);
  });

  it('一段白點拖很久（一直看得到）只算一波', () => {
    const long: Record<number, IchDay> = {};
    for (let d = 0; d < 20; d++) long[d] = d % 3 === 1 ? latent : sick;
    expect(waves(long)).toBe(1);
  });

  it('帶蟲的魚搬到別缸是同一波；兩缸各自發就各算', () => {
    const count = ichWaveCounter<string>();
    expect(count(0, [['a', sick], ['b', calm]])).toBe(1);
    expect(count(1, [['a', calm], ['b', { ...sick, moved: true }]])).toBe(0);
    expect(count(2, [['a', calm], ['b', sick]])).toBe(0);
    expect(count(20, [['a', sick], ['b', calm]])).toBe(1);
    expect(count(21, [['a', sick], ['b', sick]])).toBe(1);
  });
});
