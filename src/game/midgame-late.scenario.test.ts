import { describe, expect, it } from 'vitest';
import { midgamePlayer } from './midgame-player';

/**
 * 第 36～80 天驗收（design/midgame.md §6、§6.4，#326）：基準玩法玩 90 天，種子 1～3，照推薦選。
 * - C11～C15 都出現，順序是 C11 → C12 → C13 → C15，之後開獎
 * - 同一天最多一張卡
 * - 相鄰兩個選擇點（種魚成長里程碑也算，§6.7）隔 ≤ 6 天；留種母魚懷孕期間（C13 到開獎）選擇卡或懷孕里程碑卡隔 ≤ 7 天
 * - 經濟（mvp.md §4.3）：第 60 天 ≥ 800 元
 * - 開局挑快生的母魚：第一窩 ≤ 第 10 天；照推薦孕期調高水溫，C13 到開獎不死魚、不出紅色水質警告（§6.6）
 * - C9 重複版別太吵（§6.5）：第 36～90 天每個種子 ≤ 3 張
 * - 開獎（自家配的那窩出生，midgame.md §7.8）：每個種子 ≤ 第 90 天，種子 1～3 的中位數 ≤ 第 85 天
 * 第 80～120 天魚越生越多（midgame.md §7.4、§7.8，#338）：照推薦選，擠缸死魚 ≤ 2 尾、沒有一缸連續超過 3 天 ≥ 100%、
 *   C14 每個種子 ≤ 8 張（白點治好魚活得多，暫時放寬到 #359，strain-fixing.md §9）、種子 1～3 的中位數 ≤ 6 張（§8，#351）
 */
describe('第 36～120 天的選擇點（design/midgame.md §6、§7）', () => {
  const reveals: number[] = [];
  const crowdCards: number[] = [];
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}：C11～C15 照順序出、節奏不空太久、一天一張；開獎準時；第 60 天錢夠`, () => {
      const nights = midgamePlayer(seed, 120);
      const log = nights.filter((n) => n.day >= 30).map((n) => `${n.day}${n.choice ? `[${n.choice}]` : ''}${n.orderChoice ? `{${n.orderChoice}}` : ''}${n.bellyMilestone ? 'b' : ''}${n.line.includes('reveal') ? '★' : ''}`).join(' ');
      const order = nights.filter((n) => n.choice).map((n) => n.choice!);
      const first = (id: string) => nights.find((n) => n.choice === id)?.day ?? Infinity;
      for (const id of ['C11', 'C12', 'C13', 'C15']) expect(order, log).toContain(id);
      expect(first('C11'), log).toBeLessThan(first('C12'));
      expect(first('C12'), log).toBeLessThan(first('C13'));
      expect(first('C13'), log).toBeLessThan(first('C15'));
      const reveal = nights.find((n) => n.line.includes('reveal'))?.day ?? Infinity;
      expect(reveal, log).toBeGreaterThan(first('C15'));
      reveals.push(reveal);
      expect(reveal, log).toBeLessThanOrEqual(90);
      // 開獎那天早上報告第一項就是開獎（半夜出事才排第二）（#357）。同一窩不再另外說「昨晚生了 N 尾」，
      // 但同一晚別尾母魚生的照說：種子 3 第 82 天另一尾生了 19 尾，報告裡有那一行
      const kinds = nights.find((n) => n.day === reveal)!.line.split(' ').pop()!.split(',');
      expect(kinds[0] === 'reveal' || kinds[1] === 'reveal', kinds.join(',')).toBe(true);
      expect(kinds.filter((k) => k === 'birth').length, kinds.join(',')).toBeLessThanOrEqual(seed === 3 ? 1 : 0);
      // 同一天最多一張（早上的卡和交貨時的卡加起來）
      const cards = nights.filter((n) => n.choice || n.orderChoice);
      expect(cards.filter((n) => n.choice && n.orderChoice), log).toEqual([]);
      // 第 36～80 天（36 天前最近的一個也算，到第 80 天為止）：成長里程碑、懷孕期間里程碑卡、開獎也算一個點，
      // 懷孕期間隔 ≤ 7 天；其他 ≤ 6 天
      const pregnant = (d: number) => d >= first('C13') && d <= reveal;
      const points = nights
        .filter((n) => n.choice || n.orderChoice || n.day === reveal || /\bmilestone\b/.test(n.line) || (n.bellyMilestone && pregnant(n.day)))
        .map((n) => n.day);
      const from = Math.max(0, points.filter((d) => d <= 36).length - 1);
      const span = [...points.slice(from).filter((d) => d < 80), 80];
      for (let i = 1; i < span.length; i++) {
        const [a, b] = [span[i - 1], span[i]];
        expect(b - a, `${a}→${b} ${log}`).toBeLessThanOrEqual(pregnant(a) && pregnant(b) ? 7 : 6);
      }
      expect(nights.find((n) => n.day === 60)!.coins, log).toBeGreaterThanOrEqual(800);
      // 開局挑快生的母魚（§6.6）：第一窩 ≤ 第 10 天
      expect(nights.find((n) => n.line.includes('birth'))?.day ?? Infinity, log).toBeLessThanOrEqual(10);
      // 照推薦孕期調高水溫（§6.6）：從 C13 到開獎不死魚、不出紅色水質警告
      const preg = nights.filter((n) => n.day >= first('C13') && n.day <= reveal);
      expect(preg.filter((n) => n.line.includes('death')).map((n) => n.day), log).toEqual([]);
      expect(preg.flatMap((n) => n.alarms.filter((a) => !a.endsWith(':starving'))), log).toEqual([]);
      // C9 別太吵（§6.5）：第 36～90 天每個種子 ≤ 3 張
      expect(nights.filter((n) => n.day >= 36 && n.day <= 90 && n.choice === 'C9').length, log).toBeLessThanOrEqual(3);
      // 第 80～120 天擠缸（§7.4）
      const late = nights.filter((n) => n.day >= 80);
      const crowdLog = late.map((n) => `${n.day}${n.choice === 'C14' ? '[C14]' : ''}:${n.crowd.join('/')}${n.crowdDeaths ? `†${n.crowdDeaths}` : ''}`).join(' ');
      expect(late.reduce((a, n) => a + n.crowdDeaths, 0), crowdLog).toBeLessThanOrEqual(2);
      const tankCount = Math.max(...late.map((n) => n.crowd.length));
      for (let i = 0; i < tankCount; i++) {
        let run = 0;
        for (const n of late) {
          run = (n.crowd[i] ?? 0) >= 1 ? run + 1 : 0;
          expect(run, `第 ${i} 缸 第 ${n.day} 天 ${crowdLog}`).toBeLessThanOrEqual(3);
        }
      }
      const c14 = late.filter((n) => n.choice === 'C14').length;
      crowdCards.push(c14);
      expect(c14, crowdLog).toBeLessThanOrEqual(8);
    }, 600_000);
  }

  it('開獎：種子 1～3 的中位數 ≤ 第 85 天（midgame.md §7.8）', () => {
    expect(reveals).toHaveLength(3);
    expect([...reveals].sort((a, b) => a - b)[1], reveals.join(',')).toBeLessThanOrEqual(85);
  });

  it('第 80～120 天 C14：種子 1～3 的中位數 ≤ 6 張（strain-fixing.md §8）', () => {
    expect(crowdCards).toHaveLength(3);
    expect([...crowdCards].sort((a, b) => a - b)[1], crowdCards.join(',')).toBeLessThanOrEqual(6);
  });
});
