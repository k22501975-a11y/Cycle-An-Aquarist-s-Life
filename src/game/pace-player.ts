import { newGameState } from './game';
import { addFish, addHardscape, buyPlant, checkGoals, claimDaily, FISH_SPECIES, feed, fulfillOrder, HARDSCAPE, linkTanks, orderBoard, orderSupply, PINCH_MEALS, simulate, updateDaily, useTestKit, waterChange, type TankState } from '../sim';
import { advanceQuest, currentQuest, newProgress } from '../ui/tutorial';
import { morningReport, snapshot, type ReportKind } from '../ui/morning-report';
import { doAllDaily } from './daily-player';

/**
 * G8 節奏劇本用的新手玩家（polish-to-9.md §6「G8 節奏怎麼量」）：照教學做完 9 個任務，之後每天
 * 一小撮、測水、測到氨或亞硝就換三成、做完每日小事開寶箱、交得出的單就交，晚上過一晚看早上報告。
 * 每晚記下拿到的獎勵：寶箱是小獎勵，其他（生小魚、交單、比較卡、目標、第一次看到螺…）是大獎勵。
 */

export interface NightRewards {
  /** 第幾晚（第 1 晚是開局那天晚上）。 */
  night: number;
  chest: boolean;
  /** 大獎勵的名稱（早上報告的 kind、'order'、'goal:<id>'）。 */
  big: string[];
}

/** 早上報告裡算大獎勵的條目。 */
export const BIG_REPORT_KINDS: ReadonlySet<ReportKind> = new Set<ReportKind>(['birth', 'cycled', 'belly', 'courtship', 'fry_grew', 'new_leaf', 'rescued']);

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

export function pacePlayer(seed: number, nights = 20): NightRewards[] {
  const s = newGameState(seed);
  const tanks = [s];
  linkTanks(tanks);
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  s.water.tempC = s.water.tempAvgC = 25;
  const p = newProgress();
  const act = () => {
    while (advanceQuest(p, s));
  };
  const out: NightRewards[] = [];
  for (let night = 1; night <= nights; night++) {
    const big: string[] = [];
    // 早上出今天的小事，過半小時才開始動手（小事要在出題之後做才算）
    updateDaily(tanks);
    simulate(s, 0.5);
    // 白天：教學任務叫你做什麼就做
    act();
    if (currentQuest(p)?.id === 'fish') for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex });
    act();
    feed(s, meal(s) * PINCH_MEALS);
    act();
    if (currentQuest(p)?.id === 'plant') buyPlant(s, 'anubias');
    act();
    const r = useTestKit(s);
    act();
    if (currentQuest(p)?.id === 'water' || r.ammonia > 0 || r.nitrite > 0) waterChange(s, 0.3);
    act();
    if (currentQuest(p)?.id === 'scape') addHardscape(s, HARDSCAPE.lava);
    act();
    if (currentQuest(p)?.id === 'name') s.label = '我的第一缸';
    act();
    // 每日小事、寶箱、訂單、目標
    doAllDaily(tanks);
    const chest = !!claimDaily(tanks);
    for (const o of [...orderBoard(s).orders]) if (orderSupply(tanks, o) >= o.count && fulfillOrder(tanks, o.id) > 0) big.push(`order:${o.kind}`);
    for (const g of checkGoals(tanks, !currentQuest(p))) big.push(`goal:${g.id}`);
    // 晚上：過一晚，看早上報告
    const before = snapshot(tanks);
    simulate(s, 23.5);
    const report = morningReport(before, tanks, 24, null);
    for (const item of report.items) if (BIG_REPORT_KINDS.has(item.kind) || (item.kind === 'snails' && before.tanks[0].pests === 0)) big.push(item.kind);
    out.push({ night, chest, big });
  }
  return out;
}
