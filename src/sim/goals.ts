import { economy } from './economy';
import { phenotype } from './genetics';
import { growthStage, sexVisible } from './growth';
import { orderBoard } from './orders';
import { hasVisible } from './processes/disease';
import { cycleMaturity, isCycled } from './processes/nitrogen';
import { FISH_SPECIES, isShrimpSpecies, type FishSpeciesId } from './species';
import { type Fish, type TankState } from './state';
import { breedingTankRaised, displayTankHighPlants, purposeTanks } from './tank-purpose';

/**
 * 新手教學之後的目標串（design/mvp.md §4.2，M19）：一次顯示 1～2 個，完成給魚幣或解鎖。
 * 第一個是「等養水」（從新手任務搬來的背景目標，polish-to-9.md U2），接著四個是「第一桶金」（遊戲性評測 g2），再來是 §4.2 的解鎖目標。
 * 一開始只有好養的孔雀魚、斑馬魚、米蝦；學會了再開鬥魚（要單獨一缸）、水晶蝦（軟水、怕熱）、90L 缸。
 * 目標只看玩家做到的事和看得到的東西；完成的紀錄存在共用錢包上（所有缸共用）。
 */

/** 會被目標鎖住的東西。 */
export type Unlock = 'betta' | 'crystal_shrimp' | 'std90' | 'selection' | 'strain_codex' | 'disease_codex' | 'title_breeder';

export const UNLOCK_LABELS: Record<Unlock, string> = {
  betta: '商店開始賣鬥魚',
  crystal_shrimp: '商店開始賣水晶蝦',
  std90: '可以加買 90L 中型缸',
  selection: '解鎖挑選面板說明',
  strain_codex: '圖鑑多了品系頁',
  disease_codex: '圖鑑多了疾病頁',
  title_breeder: '得到稱號「育種新手」',
};

/** 一開始就鎖住、要靠目標解鎖的魚種和缸。 */
export const LOCKED_SPECIES: Partial<Record<FishSpeciesId, Unlock>> = { betta: 'betta', crystal_shrimp: 'crystal_shrimp' };

export interface Goal {
  id: string;
  title: string;
  /** 完成時阿德老闆說的話。 */
  done: string;
  coins: number;
  unlock?: Unlock;
  /** 額外送的東西。 */
  gift?: 'holiday_tablet';
  check: (tanks: TankState[], g: GoalState) => boolean;
  /** 數得出來的目標：現在做到幾個／要幾個（任務卡顯示「3/5」）。 */
  progress?: (tanks: TankState[]) => [number, number];
  /** 數不出來、但看得出進度的目標：任務卡上的一行字（例如「硝化菌 40%（上次測水）」）。 */
  detail?: (tanks: TankState[]) => string | null;
  /** 第一次提到這個目標時，老闆多說的幾句（例如養水要等多久、怎麼加快）。 */
  intro?: string[];
  /** 現在跟玩家無關、先不列出來的目標（例如沒開繁殖缸就不出「繁殖缸」的目標）。 */
  hidden?: (tanks: TankState[]) => boolean;
}

export interface GoalState {
  done: string[];
  unlocked: Unlock[];
  /** 正在生病的魚（用來判斷「治好」）。 */
  sick: number[];
  cured?: boolean;
  /** 每缸（用缸在清單裡的位置）最近一次有警告的時間（遊戲小時）。收掉缸、位置變了就重算。 */
  calmSince: Record<number, number>;
}

const living = (t: TankState) => t.fish.filter((f) => f.alive);
/** withBox：連檢疫盒（當產卵盒用）裡的魚也算。 */
const allFish = (tanks: TankState[], withBox = false) =>
  tanks.flatMap((t) => [...living(t), ...(withBox ? (t.quarantine?.fish ?? []).filter((f) => f.alive) : [])]);
const bred = (f: Fish) => (f.generation ?? 0) >= 1;
const STAGES = ['fry', 'juvenile', 'coloring', 'subadult', 'adult', 'old'];

/** 養大了幾條自己繁殖的魚：缸裡（含檢疫盒）長到轉色期的，加上養過仔魚期才交訂單的（#183：交單不會讓目標倒退）。 */
export function raisedCount(tanks: TankState[]): number {
  const now = allFish(tanks, true).filter((f) => bred(f) && !isShrimpSpecies(f.species) && STAGES.indexOf(growthStage(f)) >= 2).length;
  return now + (economy(tanks[0]).raisedGone ?? 0);
}

/** 缸裡有沒有玩家看得到的警告：氨、亞硝、水溫、生病、死魚。 */
export function tankAlarm(t: TankState): boolean {
  const w = t.water;
  const fish = living(t);
  if (w.tan > 0.25 || w.no2 > 0.25) return true;
  if (t.fish.some((f) => !f.alive)) return true;
  if (fish.some((f) => f.ich.stage === 'visible' || hasVisible(f))) return true;
  return fish.some((f) => w.tempC > FISH_SPECIES[f.species].temp.max + 0.5 || w.tempC < FISH_SPECIES[f.species].temp.min - 0.5);
}

/** 穩定多少天沒有警告才算數。 */
export const CALM_DAYS = 14;

/** 等養水的進度：照上次測水的讀數（玩家看得到的資訊）。 */
export function cycleProgress(s: TankState): string {
  const test = s.lastTest;
  if (!test) return '還沒測過水';
  const r = test.reading;
  const parts = [`硝化菌 ${Math.floor(cycleMaturity(s) * 100)}%`];
  if (r.ammonia > 0) parts.unshift(`氨 ${fmt(r.ammonia)}`);
  if (r.nitrite > 0) parts.unshift(`亞硝 ${fmt(r.nitrite)}`);
  const stale = s.hours - test.hours >= 24;
  return `${parts.join('・')}（${stale ? '舊讀數，再測一次' : '上次測水'}）`;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** 養水完成：有魚、硝化菌長好，而且玩家一天內測到氨 0、亞硝 0（不看硝酸鹽，#65）。 */
export function cycleConfirmed(s: TankState): boolean {
  const r = s.lastTest?.reading;
  return !!r && living(s).length > 0 && r.ammonia === 0 && r.nitrite === 0 && s.hours - s.lastTest!.hours < 24 && isCycled(s);
}

/** 第二缸用途目標要做到幾個：繁殖缸養大幾尾、展示缸種活幾株陽性草。 */
export const PURPOSE_GOAL_COUNT = { breeding: 10, display: 3 } as const;

export const GOALS: Goal[] = [
  // 等養水（design/polish-to-9.md §4 U2）：以前是新手任務，要等它才結束教學；現在是教學後的第一個背景目標
  {
    id: 'cycled',
    title: '等養水完成：氨 0、亞硝 0',
    done: '恭喜，你的缸子「養好了」！硝化菌長好、氨和亞硝酸鹽都是 0，現在可以慢慢多加一些魚。',
    coins: 250,
    check: (tanks) => tanks.some(cycleConfirmed),
    detail: (tanks) => cycleProgress(tanks[0]),
    intro: [
      '硝化菌長起來的途中，亞硝酸鹽會先冒出來一陣子，接著才降回 0。等硝化菌長好、氨和亞硝酸鹽都測到 0，缸子就養好了。',
      '剛放魚的頭一兩天常測到 0，那是魚的排泄物還少，不是養好了；看任務卡上的硝化菌進度。養水通常要 4～7 天，等的時候可以用時鐘旁的快轉。',
      '想快一點可以到商店買硝化菌液（1～3 天），或從自己養好的舊缸分一份濾材過來。',
    ],
  },
  // 第一桶金（遊戲性評測 g2）：保護仔魚 → 養大 5 條 → 第一次賣魚 → 存錢買第二缸
  {
    id: 'protect_fry',
    title: '保護第一窩小魚長到幼魚',
    done: '小魚躲過大魚的嘴巴了！密草和隔離盒都能救小魚，生越多越要記得。',
    coins: 50,
    check: (tanks) => allFish(tanks, true).some((f) => bred(f) && !isShrimpSpecies(f.species) && STAGES.indexOf(growthStage(f)) >= 1),
  },
  {
    id: 'raise5',
    title: '養大 5 條自己繁殖的魚（長到轉色期）',
    done: '小魚開始轉色了！轉色期看得出公母和花色，接下來就能挑出好的留種，也能賣錢了。小魚餓不了幾天，送你一顆假期飼料錠，出遠門前記得放。',
    coins: 80,
    unlock: 'selection',
    gift: 'holiday_tablet',
    check: (tanks) => raisedCount(tanks) >= 5,
    progress: (tanks) => [Math.min(5, raisedCount(tanks)), 5],
  },
  {
    id: 'sale',
    title: '第一次賣魚或交訂單',
    done: '第一筆生意成交！好魚可以賣好價錢，記得看看訂單板上客人要什麼。',
    coins: 50,
    check: (tanks) => (economy(tanks[0]).fishSold ?? 0) > 0 || orderBoard(tanks[0]).done > 0,
  },
  {
    id: 'second_tank',
    title: '存錢買第二個缸',
    done: '兩個缸了！鬥魚要單獨一缸，現在你有地方養了，店裡開始進鬥魚。',
    coins: 100,
    unlock: 'betta',
    check: (tanks) => tanks.length >= 2,
  },
  // 第二缸的用途（polish-to-9.md G4）：開缸卡選了哪一種，就多一個那種的目標；沒選就不出
  {
    id: 'breeding_tank',
    title: `繁殖缸：在這缸養大 ${PURPOSE_GOAL_COUNT.breeding} 尾小魚`,
    done: '繁殖缸上軌道了！小魚在這裡不會被大魚吃，養大了就能挑好的留種、交訂單。',
    coins: 80,
    hidden: (tanks) => purposeTanks(tanks, 'breeding').length === 0,
    check: (tanks) => breedingTankRaised(tanks) >= PURPOSE_GOAL_COUNT.breeding,
    progress: (tanks) => [Math.min(PURPOSE_GOAL_COUNT.breeding, breedingTankRaised(tanks)), PURPOSE_GOAL_COUNT.breeding],
  },
  {
    id: 'display_tank',
    title: `展示缸：種活 ${PURPOSE_GOAL_COUNT.display} 株陽性草`,
    done: '展示缸長起來了！陽性草要強光，水草燈下長得又快又密，修剪下來的插枝還能交單。',
    coins: 80,
    hidden: (tanks) => purposeTanks(tanks, 'display').length === 0,
    check: (tanks) => displayTankHighPlants(tanks) >= PURPOSE_GOAL_COUNT.display,
    progress: (tanks) => [Math.min(PURPOSE_GOAL_COUNT.display, displayTankHighPlants(tanks)), PURPOSE_GOAL_COUNT.display],
  },
  {
    id: 'strain',
    title: '養出第一尾品系公魚（禮服、蛇王、草尾…）',
    done: '這尾是你自己養出來的品系魚，圖鑑幫你記下來了。',
    coins: 100,
    unlock: 'strain_codex',
    check: (tanks) =>
      allFish(tanks).some((f) => {
        if (!bred(f) || f.sex !== 'male' || !f.genome || !sexVisible(f)) return false;
        const p = phenotype(f.genome);
        return p.tuxedo || p.snake || p.grass || p.red || p.albino || p.gold;
      }),
  },
  {
    id: 'cure',
    title: '第一次治好一種病',
    done: '治好了！病是怎麼來的、怎麼治，圖鑑的疾病頁都有記錄。',
    coins: 50,
    unlock: 'disease_codex',
    check: (_tanks, g) => !!g.cured,
  },
  {
    id: 'shrimp',
    title: '開一個蝦缸，等蝦第一次抱蛋',
    done: '母蝦抱蛋了！蝦養得起來，店裡開始進比較難養的水晶蝦。',
    coins: 50,
    unlock: 'crystal_shrimp',
    check: (tanks) => allFish(tanks).some((f) => f.species === 'cherry_shrimp' && f.sex === 'female' && f.pregnancy > 0),
  },
  {
    id: 'fins',
    title: '養出第一尾鰭型魚（燕尾、緞帶、大耳…）',
    done: '鰭型魚是選育的功力！你現在是「育種新手」了。',
    coins: 120,
    unlock: 'title_breeder',
    check: (tanks) =>
      allFish(tanks).some((f) => {
        if (!bred(f) || !f.genome || !sexVisible(f)) return false;
        const p = phenotype(f.genome);
        return p.swallow || p.ribbon || p.dumbo || p.bigC || (p.sword ?? 0) > 0 || p.tailShape === 'halfmoon';
      }),
  },
  {
    id: 'calm',
    title: `一個缸穩定 ${CALM_DAYS} 天沒有任何警告`,
    done: `${CALM_DAYS} 天都沒出狀況，你已經很會顧缸了。可以挑戰 90L 的大缸了。`,
    coins: 100,
    unlock: 'std90',
    check: (tanks, g) => tanks.some((t, i) => living(t).length > 0 && t.hours - (g.calmSince[i] ?? t.hours) >= CALM_DAYS * 24),
  },
];

/** 舊存檔：已經養了、買了的東西直接算解鎖，不會被鎖回去。 */
function grandfather(tanks: TankState[], g: GoalState): void {
  const add = (u: Unlock) => g.unlocked.includes(u) || g.unlocked.push(u);
  for (const t of tanks) {
    for (const f of [...t.fish, ...(t.quarantine?.fish ?? [])]) {
      const u = LOCKED_SPECIES[f.species];
      if (u) add(u);
    }
    if (t.equipment.tank.id === 'std90') add('std90');
  }
}

export function goalState(tanks: TankState[]): GoalState {
  const e = economy(tanks[0]);
  if (!e.goals) {
    e.goals = { done: [], unlocked: [], sick: [], calmSince: {} };
    grandfather(tanks, e.goals);
  }
  // 舊存檔：養水還是新手任務時已經領過獎勵的，不再算一次
  if (e.questRewards?.includes('cycled') && !e.goals.done.includes('cycled')) e.goals.done.push('cycled');
  return e.goals;
}

export function isUnlocked(tanks: TankState[], u: Unlock): boolean {
  return goalState(tanks).unlocked.includes(u);
}

/** 商店可以賣這個魚種了嗎。 */
export function speciesUnlocked(tanks: TankState[], species: FishSpeciesId): boolean {
  const u = LOCKED_SPECIES[species];
  return !u || isUnlocked(tanks, u);
}

/** 鎖住時的說明：完成哪個目標才會解鎖。 */
export function unlockHint(u: Unlock): string {
  const g = GOALS.find((x) => x.unlock === u);
  return g ? `完成目標「${g.title}」解鎖` : '還沒解鎖';
}

/** 加買這個大小的缸要先解鎖嗎（90L 要「穩定 14 天」）。 */
export function tankLock(tanks: TankState[], id: string): Unlock | null {
  return id === 'std90' && !isUnlocked(tanks, 'std90') ? 'std90' : null;
}

/** 接下來要做的目標（一次 1～2 個）。 */
export function nextGoals(tanks: TankState[], count = 2): Goal[] {
  const g = goalState(tanks);
  return GOALS.filter((x) => !g.done.includes(x.id) && !x.hidden?.(tanks)).slice(0, count);
}

/**
 * 定期呼叫（畫面每半秒一次）：記錄治病、穩定天數，完成的目標發獎勵、解鎖。
 * tutorialDone 是 false 時只記錄、不發獎勵（教學還沒做完不跳目標）。回傳這次完成的目標（給畫面演出）。
 */
export function checkGoals(tanks: TankState[], tutorialDone = true): Goal[] {
  const g = goalState(tanks);
  // 治病：上次看到在發病、現在還活著而且好了
  const sickNow = allFish(tanks).filter((f) => f.ich.stage === 'visible' || hasVisible(f)).map((f) => f.id);
  const alive = new Set(allFish(tanks).map((f) => f.id));
  if (g.sick.some((id) => alive.has(id) && !sickNow.includes(id))) g.cured = true;
  g.sick = sickNow;
  tanks.forEach((t, i) => {
    if (tankAlarm(t) || g.calmSince[i] === undefined) g.calmSince[i] = t.hours;
  });
  if (!tutorialDone) return [];
  const done: Goal[] = [];
  for (const goal of nextGoals(tanks, GOALS.length)) {
    if (!goal.check(tanks, g)) continue;
    g.done.push(goal.id);
    economy(tanks[0]).coins += goal.coins;
    if (goal.unlock && !g.unlocked.includes(goal.unlock)) g.unlocked.push(goal.unlock);
    if (goal.gift === 'holiday_tablet') economy(tanks[0]).holidayTablets = (economy(tanks[0]).holidayTablets ?? 0) + 1;
    done.push(goal);
  }
  return done;
}
