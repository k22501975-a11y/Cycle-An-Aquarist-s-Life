import { describe, expect, it } from 'vitest';
import { addFish, compareLooks, createTank, economy, feed, FILTERS, guppyTraits, HEATERS, LIGHTS, LOOKALIKE_DAYS, lookalikeLine, phenotype, sellFish, simulate, takeLookalike, TANKS, type GuppyPhenotype } from './index';

const base: GuppyPhenotype = { albino: false, gold: false, tuxedo: false, red: false, snake: false, grass: false, swallow: false, ribbon: false, dumbo: false, bigC: false, sword: 0, tailShape: 'delta', finLength: 0.45 };
const tank = (seed = 3) => createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, seed, matureMedia: true });

describe('長得像誰（polish-to-9.md G2）', () => {
  it('特徵：顏色、鰭型、尾型；沒有顏色基因的是原生色', () => {
    expect(guppyTraits(base).map((t) => t.name)).toEqual(['原生色', '三角尾']);
    expect(guppyTraits({ ...base, tuxedo: true, red: true, swallow: true, tailShape: 'halfmoon' }).map((t) => t.name)).toEqual(['禮服', '紅', '燕尾', '半月尾']);
  });

  it('每個特徵標出跟誰的，爸媽都沒有的是隔代冒出來', () => {
    const mother = { ...base, tuxedo: true };
    const father = { ...base, grass: true, tailShape: 'halfmoon' as const };
    const child = { ...base, tuxedo: true, swallow: true, tailShape: 'halfmoon' as const };
    const r = compareLooks(child, mother, father);
    expect(r.traits.map((t) => [t.name, t.from])).toEqual([
      ['禮服', 'mother'],
      ['燕尾', 'hidden'],
      ['半月尾', 'father'],
    ]);
    expect(r.looksLike).toBe('both');
    expect(compareLooks({ ...base, tuxedo: true }, mother, father).looksLike).toBe('mother');
    expect(compareLooks({ ...base, tuxedo: true }, mother, mother).traits.map((t) => t.from)).toEqual(['both', 'both']);
  });

  it('第一窩出生滿 12 天出一次比較卡，挑公魚；之後不再出', () => {
    const s = tank();
    s.fish = [];
    const mom = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: true, strain: 3 });
    mom.pregnancy = 0.99;
    simulate(s, 12);
    const born = economy(s).broodLog![0].hours;
    let card = null;
    for (let d = 0; d < 20 && !card; d++) {
      feed(s, 30);
      simulate(s, 24);
      card = takeLookalike([s]);
      if (!card) expect(s.hours - born).toBeLessThan(LOOKALIKE_DAYS * 24 + 24);
    }
    expect(card).not.toBeNull();
    expect(s.hours - born).toBeGreaterThanOrEqual(LOOKALIKE_DAYS * 24);
    const child = s.fish.find((f) => f.id === card!.childId)!;
    expect(child.motherId).toBe(mom.id);
    expect(child.generation).toBe(1);
    expect(card!.motherId).toBe(mom.id);
    expect(card!.child).toEqual(phenotype(child.genome!));
    expect(card!.traits.length).toBeGreaterThan(1);
    expect(lookalikeLine(card!)).toMatch(/^小魚看得出像誰了！長大後(比較像媽媽|比較像爸爸|爸媽各像一點)：/);
    if (s.fish.some((f) => f.alive && f.motherId === mom.id && f.sex === 'male')) expect(child.sex).toBe('male');
    expect(economy(s).broodLog).toBeUndefined();
    simulate(s, 24 * 5);
    expect(takeLookalike([s])).toBeNull();
  });

  it('第一窩沒有活到 12 天，就等下一窩', () => {
    const s = tank();
    s.fish = [];
    const mom = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: true, strain: 3 });
    mom.pregnancy = 0.99;
    simulate(s, 12);
    expect(economy(s).broodLog).toHaveLength(1);
    s.fish = s.fish.filter((f) => f.motherId !== mom.id);
    s.hours += LOOKALIKE_DAYS * 24;
    expect(takeLookalike([s])).toBeNull();
    mom.pregnancy = 0.99;
    simulate(s, 12);
    expect(economy(s).broodLog).toHaveLength(2);
    s.hours += LOOKALIKE_DAYS * 24;
    expect(takeLookalike([s])?.motherId).toBe(mom.id);
  });

  it('自己繁殖的魚第一次賣給店家記一筆 first_bred_sale，只記一次；店裡買來的不算', () => {
    const s = tank();
    s.fish = [];
    const store = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    const a = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    const b = addFish(s, 'guppy', { carriesIch: false, carries: [] });
    a.generation = b.generation = 1;
    expect(sellFish(s, store.id)).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === 'first_bred_sale')).toBe(false);
    const got = sellFish(s, a.id);
    const e = s.events.filter((x) => x.type === 'first_bred_sale');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ subjectId: a.id, value: got, cause: 'shop' });
    sellFish(s, b.id);
    expect(s.events.filter((x) => x.type === 'first_bred_sale')).toHaveLength(1);
  });
});
