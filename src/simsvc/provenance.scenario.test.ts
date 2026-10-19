import { describe, expect, it } from 'vitest';
import { serializeSave } from '../game/save';
import { seriousPlayer } from '../game/serious-player';
import type { TankState } from '../sim';
import { verify } from './handlers';

const DAY_MS = (24 / 7) * 3_600_000;

/** 認真玩家玩 120 天（繁殖、產卵盒、加缸、移魚、賣魚、交訂單），每天、每 10 天上傳一次都不該被當成作弊。 */
describe('新魚來源檢查（#76）：正常玩不會誤擋', () => {
  for (const [seed, strain] of [
    [7, 3],
    [42, 2],
  ] as const) {
    it(`種子 ${seed}`, { timeout: 60_000 }, () => {
      const saves: unknown[] = [];
      const snap = (tanks: TankState[], day: number) =>
        JSON.parse(serializeSave(tanks[0], 7, day * DAY_MS, undefined, tanks.length > 1 ? { tanks: tanks.slice(1), active: 0 } : undefined));
      seriousPlayer(seed, strain, true, (d, tanks) => saves.push(snap(tanks, d)));
      const problems: string[] = [];
      for (let i = 1; i < saves.length; i++) {
        for (const p of verify(saves[i - 1], saves[i], DAY_MS)) problems.push(`第 ${i + 1} 天 ${p.code} ${p.message}`);
        if (i % 10 === 0) for (const p of verify(saves[i - 10], saves[i], 10 * DAY_MS)) problems.push(`第 ${i - 9}～${i + 1} 天 ${p.code} ${p.message}`);
      }
      expect(problems).toEqual([]);
    });
  }
});
