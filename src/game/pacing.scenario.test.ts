import { describe, expect, it } from 'vitest';
import { pacePlayer } from './pace-player';

/**
 * G8 驗收（polish-to-9.md §6「G8 節奏怎麼量」）：一個遊戲天約 45 秒現實時間，「每 3 分鐘一個獎勵」≈ 每 4 晚。
 * 種子 1～3 前 20 晚：有做小事的話每晚都開得到寶箱；不算寶箱的大獎勵，相鄰兩次最多隔 4 晚（開局算第 0 晚）。
 */
describe('前 15 分鐘節奏劇本（G8）', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：前 20 晚每晚有寶箱，大獎勵最多隔 4 晚`, () => {
      const nights = pacePlayer(seed, 20);
      const log = nights.map((n) => `${n.night}:${n.big.join(',') || '-'}`).join(' ');
      expect(nights.filter((n) => !n.chest).map((n) => n.night), log).toEqual([]);
      let last = 0;
      for (const n of nights) {
        if (n.big.length === 0) continue;
        expect(n.night - last, `第 ${last}～${n.night} 晚沒有大獎勵\n${log}`).toBeLessThanOrEqual(4);
        last = n.night;
      }
      expect(nights.length - last, `第 ${last} 晚之後沒有大獎勵\n${log}`).toBeLessThan(4);
    }, 60_000);
  }
});
