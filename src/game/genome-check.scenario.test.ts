import { describe, expect, it } from 'vitest';
import { addFish, forgedGenomes, genomeKey, STORE_TAIL_MAX, type Fish, type TankState } from '../sim';
import { seriousPlayer } from './serious-player';

/**
 * 新生魚的基因檢查（L2，#76）不能擋到正常玩家：認真玩家 120 天（買魚、繁殖選育、賣魚交單、加缸），
 * 每天、每 7 天、每 30 天上傳一次都不會被擋；把小魚的基因改好就會被擋。
 */

const snap = (tanks: TankState[]): TankState[] => JSON.parse(JSON.stringify(tanks)) as TankState[];
const fishOf = (tanks: TankState[]): Fish[] => tanks.flatMap((t) => [...t.fish, ...(t.quarantine?.fish ?? [])]);

describe('新生魚的基因檢查（L2，#76）', () => {
  for (const strain of [2, 3]) {
    it(`認真玩家 120 天（品系 ${strain}）：每天、每週、每月上傳都不會被擋`, () => {
      const days: TankState[][] = [];
      seriousPlayer(1, strain, true, { onDay: (tanks) => days.push(snap(tanks)) });
      let born = 0;
      for (const step of [1, 7, 30]) {
        for (let a = 0; a + step < days.length; a += step) {
          const b = a + step;
          expect(forgedGenomes(days[a], days[b]), `第 ${a + 1}～${b + 1} 天`).toEqual([]);
          if (step === 1) born += fishOf(days[b]).filter((f) => f.bornHours !== undefined && !fishOf(days[a]).some((o) => o.id === f.id)).length;
        }
      }
      // 這段真的有生小魚（不然檢查等於沒跑）
      expect(born).toBeGreaterThan(20);
    }, 120_000);
  }

  it('把小魚的基因改好、憑空多一條好魚、換掉母魚存的精子都會被擋', () => {
    const days: TankState[][] = [];
    seriousPlayer(1, 3, true, { days: 60, onDay: (tanks) => days.push(snap(tanks)) });
    // 找一段有新生小魚的
    const a = days.findIndex((d, i) => i > 0 && fishOf(d).some((f) => f.genome && f.bornHours !== undefined && !fishOf(days[i - 1]).some((o) => o.id === f.id))) - 1;
    expect(a).toBeGreaterThanOrEqual(0);
    const prev = days[a];
    const fry = () => {
      const next = snap(days[a + 1]);
      const f = fishOf(next).find((x) => x.genome && x.bornHours !== undefined && !fishOf(prev).some((o) => o.id === x.id))!;
      return { next, f };
    };
    expect(forgedGenomes(prev, days[a + 1])).toEqual([]);

    // 尾鰭改滿分
    let { next, f } = fry();
    f.genome!.tail = 100;
    expect(forgedGenomes(prev, next).map((x) => x.id)).toContain(f.id);

    // 爸媽都沒帶的白子
    ({ next, f } = fry());
    const parents = fishOf(prev).concat(fishOf(next)).filter((x) => x.genome);
    if (!parents.some((x) => x.genome!.albino.includes(1) || x.sire?.genome.albino.includes(1))) {
      f.genome!.albino = [1, 1];
      expect(forgedGenomes(prev, next).map((x) => x.id)).toContain(f.id);
    }
    // 媽媽改成不存在的
    ({ next, f } = fry());
    f.motherId = 999_999;
    expect(forgedGenomes(prev, next).map((x) => x.id)).toContain(f.id);

    // 拿掉出生紀錄假裝是店裡買的：第幾代不是 0、尾鰭超過店魚
    ({ next, f } = fry());
    delete f.bornHours;
    delete f.motherId;
    f.genome!.tail = STORE_TAIL_MAX + 5;
    f.generation = 0;
    expect(forgedGenomes(prev, next).map((x) => x.id)).toContain(f.id);
    // 市場買來的（伺服器知道這份基因）就收
    expect(forgedGenomes(prev, next, [f.genome]).map((x) => x.id)).not.toContain(f.id);

    // 店裡真的買來的魚照收
    next = snap(days[a + 1]);
    const bought = addFish(next[0], 'guppy', { carriesIch: false, carries: [], pregnant: true, sex: 'female' });
    expect(forgedGenomes(prev, next)).toEqual([]);
    // 第 0 代、尾鰭 90 以內，但花紋和鰭型疊滿（店裡沒有這種品系）：擋下；放進精子也一樣
    const stacked = { albino: [1, 1], gold: [1, 1], tuxedo: [1, 1], red: [1, 1], snakeX: [1], y: { snake: 1, grass: 1, sword: 3 }, tail: 90, fins: 100, swallow: [1, 1], ribbon: [1, 1], dumbo: [1, 1] } as NonNullable<Fish['genome']>;
    const fake = addFish(next[0], 'guppy', { carriesIch: false, carries: [], sex: 'male' });
    fake.genome = stacked;
    expect(forgedGenomes(prev, next).map((x) => x.id)).toEqual([fake.id]);
    next[0].fish = next[0].fish.filter((x) => x !== fake);
    bought.sire!.genome = stacked;
    expect(forgedGenomes(prev, next).map((x) => x.id)).toEqual([bought.id]);
    // 母魚存的精子換成缸裡沒有、店裡也買不到的公魚
    bought.sire!.genome = { ...bought.sire!.genome, tail: 100 };
    expect(forgedGenomes(prev, next).map((x) => x.id)).toContain(bought.id);
    expect(genomeKey(bought.genome)).not.toBe(genomeKey(bought.sire!.genome));
  }, 120_000);
});
