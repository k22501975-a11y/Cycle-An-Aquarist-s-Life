import { describe, expect, it } from 'vitest';
import type { Game } from '../game/game';
import type { CloudClient, CloudResult } from '../net/cloud';
import { createTank, mallBag, setMallBag, TANKS, type TankState } from '../sim';
import { useMallItem } from './mall-panel';

/** 假伺服器：每用一次扣一個，記下送了幾次。 */
function setup(stock = 2) {
  const tanks: TankState[] = [createTank({ tank: TANKS.std40 })];
  setMallBag(tanks, { cure: stock, tankset: 0 });
  let calls = 0;
  const cloud = {
    session: { token: 't', username: 'aquarist', revision: 1 },
    pointsUse: async (item: string): Promise<CloudResult<{ item: string; remaining: number }>> => {
      calls++;
      stock--;
      return { ok: true, value: { item, remaining: stock } };
    },
  } as unknown as CloudClient;
  const game = { tanks, actAll: <T>(fn: (t: TankState[]) => T) => fn(tanks) } as unknown as Game;
  return { deps: { cloud, game }, tanks, calls: () => calls };
}

describe('用商城道具', () => {
  it('送出前已經不能用就不跟伺服器扣', async () => {
    const t = setup();
    const why = await useMallItem(t.deps, 'cure', () => true, () => '這尾魚已經死了');
    expect(why).toBe('這尾魚已經死了');
    expect(t.calls()).toBe(0);
    expect(mallBag(t.tanks).cure).toBe(2);
  });

  it('扣成功就套用效果，背包照伺服器剩下的數量', async () => {
    const t = setup();
    let applied = 0;
    expect(await useMallItem(t.deps, 'cure', () => ++applied > 0, () => null)).toBeNull();
    expect(applied).toBe(1);
    expect(mallBag(t.tanks).cure).toBe(1);
  });

  it('等回應時情況變了沒用上，照實告訴玩家', async () => {
    const t = setup();
    const why = await useMallItem(t.deps, 'cure', () => false, () => null);
    expect(why).toContain('沒用上');
    expect(mallBag(t.tanks).cure).toBe(1);
  });
});
