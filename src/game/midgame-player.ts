import { newGameState } from './game';
import { addFish, crowdingRatio, takeStoreFemales, addHardscape, buyPlant, buyTank, checkGoals, claimDaily, doseIchMedication, DREAM_FISH, economy, FISH_SPECIES, feed, fulfillOrder, HARDSCAPE, ICH_MED_WORKING, linkTanks, moveDueToNursery, orderBoard, orderSupply, PINCH_MEALS, setTankPurpose, splitTank, transferMedia, step, TICK_HOURS, updateDaily, useTestKit, waterChange, type TankState } from '../sim';
import { chooseOption, choiceState, tradeCheck, type ChoiceCard, type ChoiceId } from '../sim/choices';
import { advanceQuest, currentQuest, newProgress } from '../ui/tutorial';
import { morningLine } from '../ui/morning-card';
import { morningReport, snapshot } from '../ui/morning-report';
import { waterAlarms } from './crisis';
import { doAllDaily } from './daily-player';

/**
 * 中期劇本（design/midgame.md §5）：基準玩法玩 36 天。開局照教學、買夢想魚配對（紅蛇王公魚、兩尾全紅白子母魚），
 * 之後每天一小撮、測水、測到氨或亞硝換三成、做完小事、交得出的單就交、快生的母魚放育幼盒，晚上過一晚看早上報告。
 * 早上出選擇卡就照推薦選：選種挑卡上排最前面的 1 公 2 母，第二缸買來當繁殖缸，養好了照 C6 卡把魚搬過去。
 * 長白點就照任務卡下一份藥。第 36～80 天（#326）：C14 選再買一缸、換大缸就照買。
 * 每晚記下：出了哪張選擇卡、早上是不是「安靜的一晚」、手上的錢。
 */

export interface MidgameNight {
  /** 第幾天的早上（第 1 晚過完是第 2 天早上）。 */
  day: number;
  choice?: ChoiceId;
  /** 前一天按交貨時跳出來的選擇卡（C5：會交出有夢想魚基因的魚）。 */
  orderChoice?: ChoiceId;
  quiet: boolean;
  coins: number;
  /** 幾個缸。 */
  tanks: number;
  /** 繁殖缸裡有幾尾魚（沒有繁殖缸是 0）。 */
  inBreeding: number;
  /** 這天早上報告的開場白和每條（除錯看）。 */
  line: string;
  /** 早上報告有夢想魚那窩的懷孕里程碑（胎斑變黑、看得到眼睛，midgame.md §6.4）。 */
  bellyMilestone: boolean;
  /** 種魚長大了卻因為生病晚配的天數（到這天為止）。 */
  sickDays: number;
  /** 早上各缸的水質警報（「第幾缸:警報」，例如 1:too_hot）。 */
  alarms: string[];
  /** 早上各缸的擁擠度（crowdingRatio，1 是建議量）。 */
  crowd: number[];
  /** 這一晚死的魚的死因（各缸合起來）。 */
  deaths: string[];
  /** 這一晚在超過建議量的缸（前一晚或早上 ≥ 100%）死的魚（midgame.md §7.4 的擠缸死魚）。 */
  crowdDeaths: number;
}

/** 所有缸一起跑（跟遊戲一樣每個 tick 輪流推每一缸）。 */
function simulateAll(tanks: TankState[], hours: number): void {
  for (let i = Math.round(hours / TICK_HOURS); i > 0; i--) for (const t of tanks) step(t);
}

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

/** 照推薦選；選種挑排最前面的 1 公 2 母。只做選擇本身（C3 買缸由劇本自己決定）。 */
export function chooseRecommended(tanks: TankState[], card: ChoiceCard): { key: string; why: string | null } {
  const opt = card.options.find((o) => o.recommended) ?? card.options[0];
  const picks: number[] = [];
  if (card.fish) {
    const male = card.fish.find((f) => f.sex === 'male');
    if (male) picks.push(male.fishId);
    picks.push(...card.fish.filter((f) => f.sex === 'female').slice(0, 2).map((f) => f.fishId));
  }
  return { key: opt.key, why: chooseOption(tanks, card.id, opt.key, picks) };
}

/** 照推薦選；C3 就照選的用途買 20L 第二缸。 */
function pickRecommended(tanks: TankState[], card: ChoiceCard): string | null {
  const { key, why } = chooseRecommended(tanks, card);
  if (card.id === 'C14' && (key === 'tank' || key === 'big')) {
    const t = buyTank(tanks, key === 'big' ? 'std90' : 'nano20');
    if (t) {
      linkTanks(tanks);
      // 新缸先分舊缸濾材，再把擠的那缸分一半過去
      const from = tanks[card.tank];
      transferMedia(from, t);
      splitTank(from, t, 'half');
    }
  }
  if (card.id === 'C3') {
    const t = buyTank(tanks, 'nano20');
    if (t) {
      linkTanks(tanks);
      setTankPurpose(t, key === 'display' ? 'display' : 'breeding');
    }
  }
  return why;
}

/** neglectCrowd：擠缸都不處理（C14 每次都選先多換水，midgame.md §7.4 的「都不處理」）。 */
export function midgamePlayer(seed: number, days = 36, opts: { neglectCrowd?: boolean } = {}): MidgameNight[] {
  return run(seed, days, opts).nights;
}

/** 中期劇本玩完之後的所有缸（上傳檢查的劇本用）。 */
export function midgamePlayerTanks(seed: number, days = 36): TankState[] {
  return run(seed, days).tanks;
}

function run(seed: number, days: number, opts: { neglectCrowd?: boolean } = {}): { nights: MidgameNight[]; tanks: TankState[] } {
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
  const out: MidgameNight[] = [];
  for (let night = 1; night < days; night++) {
    updateDaily(tanks);
    simulateAll(tanks, 0.5);
    act();
    if (currentQuest(p)?.id === 'fish') {
      addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'male', strain: DREAM_FISH.parents.male });
      // 夢想魚一鍵買：店裡最快生的那兩尾（#335）
      const due = takeStoreFemales(s, DREAM_FISH.parents.female, 2);
      for (let i = 0; i < 2; i++) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', strain: DREAM_FISH.parents.female, pregnancy: due[i] });
    }
    act();
    for (const t of tanks) feed(t, meal(t) * PINCH_MEALS, t.feedPlan?.kind, t.feedPlan?.grade);
    act();
    if (currentQuest(p)?.id === 'plant') buyPlant(s, 'anubias');
    act();
    // 加熱棒壞了（早上報告會說）就換一支，跟認真玩家一樣
    for (const t of tanks) {
      const heater = t.equipment.heater;
      if (heater && (heater.stuckOn || heater.broken)) t.equipment.heater = { spec: heater.spec, targetC: heater.targetC, broken: false, heating: false };
    }
    // 長白點就照任務卡下一份藥（#324：藥效中不再下）
    for (const t of tanks) if (t.fish.some((f) => f.alive && f.ich.stage === 'visible') && t.water.medication < ICH_MED_WORKING) doseIchMedication(t);
    for (const t of tanks) {
      const r = useTestKit(t);
      if ((t === s && currentQuest(p)?.id === 'water') || r.ammonia > 0 || r.nitrite > 0) waterChange(t, 0.3);
    }
    act();
    if (currentQuest(p)?.id === 'scape') addHardscape(s, HARDSCAPE.lava);
    act();
    if (currentQuest(p)?.id === 'name') s.label = '我的第一缸';
    act();
    doAllDaily(tanks);
    claimDaily(tanks);
    let orderChoice: ChoiceId | undefined;
    for (const o of [...orderBoard(s).orders]) {
      if (orderSupply(tanks, o) < o.count) continue;
      // 交貨前先問（C5）：照推薦選，選完還湊得齊就照常交
      const ask = tradeCheck(tanks, o.id);
      if (ask) {
        orderChoice = ask.id;
        chooseRecommended(tanks, ask);
      }
      if (orderSupply(tanks, o) >= o.count) fulfillOrder(tanks, o.id);
    }
    for (const t of tanks) moveDueToNursery(t);
    checkGoals(tanks, !currentQuest(p));
    const before = snapshot(tanks);
    const evening = tanks.map(crowdingRatio);
    simulateAll(tanks, 23.5);
    const report = morningReport(before, tanks, 24, null);
    const card = report.items.find((i) => i.choice)?.choice;
    const why = !card ? null : card.id === 'C14' && opts.neglectCrowd ? chooseOption(tanks, 'C14', 'water') : pickRecommended(tanks, card);
    const line = morningLine(report);
    const cs = choiceState(tanks);
    const bellyMilestone = report.items.some((i) => i.kind === 'belly' && i.subjectId !== undefined && i.subjectId === cs.reveal?.momId);
    const night0 = s.hours - 24;
    const died = tanks.map((t) => t.events.filter((e) => e.type === 'fish_died' && e.hours > night0));
    const deaths = died.flat().map((e) => String(e.cause));
    const crowdDeaths = died.reduce((a, d, i) => a + (Math.max(evening[i] ?? 0, crowdingRatio(tanks[i])) >= 1 ? d.length : 0), 0);
    out.push({ crowdDeaths, crowd: tanks.map((t) => Math.round(crowdingRatio(t) * 100) / 100), deaths, bellyMilestone, sickDays: cs.sickDays ?? 0, day: Math.floor(s.hours / 24) + 1, choice: card?.id, orderChoice, quiet: line === '安靜的一晚。', coins: economy(s).coins, tanks: tanks.length, inBreeding: tanks.find((t) => t.purpose === 'breeding')?.fish.filter((f) => f.alive).length ?? 0, alarms: tanks.flatMap((t, i) => [...waterAlarms(t)].map((x) => `${i}:${x}`)), line: `${card ? `<${(card.options.find((o) => o.recommended) ?? card.options[0]).key}>` : ''}${why ? `（選不了：${why}）` : ''}${line} ${report.items.map((i) => i.kind).join(',')}` });
  }
  return { nights: out, tanks };
}
