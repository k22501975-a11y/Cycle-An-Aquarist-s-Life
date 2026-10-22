import { newGameState } from './game';
import {
  addFish,
  addHardscape,
  buyPlant,
  buyTank,
  checkGoals,
  chooseOption,
  claimDaily,
  DREAM_FISH,
  economy,
  FISH_SPECIES,
  feed,
  fulfillOrder,
  HARDSCAPE,
  isCycled,
  linkTanks,
  moveDueToNursery,
  moveFish,
  orderBoard,
  orderSupply,
  PINCH_MEALS,
  setTankPurpose,
  step,
  TICK_HOURS,
  updateDaily,
  useTestKit,
  waterChange,
  type ChoiceCard,
  type ChoiceId,
  type TankState,
} from '../sim';
import { advanceQuest, currentQuest, newProgress } from '../ui/tutorial';
import { morningLine } from '../ui/morning-card';
import { morningReport, snapshot } from '../ui/morning-report';
import { doAllDaily } from './daily-player';

/**
 * 中期劇本（design/midgame.md §5）：基準玩法玩 36 天。開局照教學、買夢想魚配對（紅蛇王公魚、兩尾全紅白子母魚），
 * 之後每天一小撮、測水、測到氨或亞硝換三成、做完小事、交得出的單就交、快生的母魚放育幼盒，晚上過一晚看早上報告。
 * 早上出選擇卡就照推薦選：選種挑卡上排最前面的 1 公 2 母，第二缸買來當繁殖缸、把留種的魚搬過去。
 * 每晚記下：出了哪張選擇卡、早上是不是「安靜的一晚」、手上的錢。
 */

export interface MidgameNight {
  /** 第幾天的早上（第 1 晚過完是第 2 天早上）。 */
  day: number;
  choice?: ChoiceId;
  quiet: boolean;
  coins: number;
  /** 這天早上報告的開場白和每條（除錯看）。 */
  line: string;
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
  if (card.id === 'C3') {
    const t = buyTank(tanks, 'nano20');
    if (t) {
      linkTanks(tanks);
      setTankPurpose(t, key === 'display' ? 'display' : 'breeding');
    }
  }
  return why;
}

export function midgamePlayer(seed: number, days = 36): MidgameNight[] {
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
      for (let i = 0; i < 2; i++) addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', strain: DREAM_FISH.parents.female, pregnant: true });
    }
    act();
    for (const t of tanks) feed(t, meal(t) * PINCH_MEALS);
    act();
    if (currentQuest(p)?.id === 'plant') buyPlant(s, 'anubias');
    act();
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
    for (const o of [...orderBoard(s).orders]) if (orderSupply(tanks, o) >= o.count) fulfillOrder(tanks, o.id);
    for (const t of tanks) moveDueToNursery(t);
    // 繁殖缸養好了：留種的魚搬過去（避免主缸亂配）
    const breed = tanks.find((t) => t.purpose === 'breeding');
    if (breed && isCycled(breed)) for (const f of [...s.fish]) if (f.alive && f.keeper) moveFish(s, breed, f.id);
    checkGoals(tanks, !currentQuest(p));
    const before = snapshot(tanks);
    simulateAll(tanks, 23.5);
    const report = morningReport(before, tanks, 24, null);
    const card = report.items.find((i) => i.choice)?.choice;
    const why = card ? pickRecommended(tanks, card) : null;
    const line = morningLine(report);
    out.push({ day: Math.floor(s.hours / 24) + 1, choice: card?.id, quiet: line === '安靜的一晚。', coins: economy(s).coins, line: `${why ? `（選不了：${why}）` : ''}${line} ${report.items.map((i) => i.kind).join(',')}` });
  }
  return out;
}
