import { economy } from './economy';
import { phenotype } from './genetics';
import type { Fish, TankState } from './state';
import { broodOf, compareLooks, guppyTraits, LOOKALIKE_DAYS, type LookalikeCard } from './lookalike';

// 像爸爸還是像媽媽的那張卡：早上報告才用得到，只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
/**
 * 早上報告用（所有缸一起看，小魚可能換過缸）：自己繁殖的孔雀魚第一窩出生滿 LOOKALIKE_DAYS 天就出一次比較卡，
 * 挑公魚（花色在公魚身上）、特徵多的那尾；child 是牠的基因長大後的樣子。第一窩被吃光、賣光的話，就等下一窩。
 */
export function takeLookalike(tanks: TankState[]): (LookalikeCard & { tank: number }) | null {
  const e = economy(tanks[0]);
  const log = e.broodLog;
  if (e.lookalikeShown || !log?.length) return null;
  const old = (f: Fish) => {
    const b = broodOf(f, log);
    return !!b && tanks[0].hours - b.hours >= LOOKALIKE_DAYS * 24;
  };
  const shown = tanks.flatMap((t, tank) => t.fish.filter(old).map((fish) => ({ fish, tank })));
  if (shown.length === 0) return null;
  const score = (f: Fish) => (f.sex === 'male' ? 100 : 0) + guppyTraits(phenotype(f.genome!)).length;
  const pick = shown.reduce((a, x) => (score(x.fish) > score(a.fish) ? x : a));
  const b = broodOf(pick.fish, log)!;
  e.lookalikeShown = true;
  e.broodLog = undefined;
  const mother = phenotype(b.mother);
  const father = phenotype(b.father);
  const child = phenotype(pick.fish.genome!);
  return { tank: pick.tank, childId: pick.fish.id, motherId: b.motherId, fatherId: b.fatherId, mother, father, child, ...compareLooks(child, mother, father) };
}
