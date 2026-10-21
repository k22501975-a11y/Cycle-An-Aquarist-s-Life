import { economy } from './economy';
import { GUPPY_FIN_STRAINS, GUPPY_STRAINS, lookIndex, phenotype, strainName } from './genetics';
import { sexVisible } from './growth';
import { cycleMaturity } from './processes/nitrogen';
import type { TankState } from './state';

/**
 * 一開始就給玩家一個想追的目標（polish-to-9.md §6 P2）：歡迎時秀一張「夢想魚」卡，
 * 一尾店裡買不到、要自己選育出來的孔雀魚，下面是 3 步路線：養好缸 → 第一窩 → 第一尾自己選育的魚。
 * 路線常駐在任務卡上方，取代「任務 N/10」當主要目標。只用現有的品系和選育，不加新系統；這裡只出資料。
 */

/** 夢想魚：白子紅蛇王。店裡只有白子全紅和紅蛇王，兩種配一代看不到白子，小魚兄妹再配，約一成的兒子會是牠。 */
export const DREAM_FISH = {
  name: '白子紅蛇王',
  /** 畫面用的外觀編號（GUPPY_STRAINS 的索引）；白子的紅眼和淡色由畫面另外處理。 */
  look: lookIndex({ albino: true, gold: false, tuxedo: false, red: true, snake: true, grass: false }),
  albino: true,
  /** 卡片上的一句話。 */
  tagline: '店裡買不到，要自己選育出來',
  /** 怎麼做（點卡片看）。 */
  recipe: ['買白子全紅的母魚和紅蛇王的公魚', '等小魚長大，挑兄妹配一窩', '孫代裡找紅眼睛的蛇紋公魚'],
} as const;

export type DreamStepId = 'tank' | 'brood' | 'bred';

export interface DreamStep {
  id: DreamStepId;
  title: string;
  done: boolean;
  /** 現在在走的這一步（全部做完就沒有）。 */
  current: boolean;
}

export interface DreamRoute {
  steps: DreamStep[];
  /** 已經選育出夢想魚。 */
  achieved: boolean;
  /** 自己選育、店裡沒賣的公魚（第 3 步做到的那尾），給畫面放在卡片上。 */
  bredName?: string;
}

const STEP_TITLES: Record<DreamStepId, string> = {
  tank: '養好缸',
  brood: '第一窩小魚',
  bred: '第一尾自己選育的魚',
};

/** 店裡買得到的（一般品系加鰭型品系）：自家公魚長成這些以外的，才算「自己選育」。 */
const STORE_NAMES = new Set<string>([...GUPPY_STRAINS, ...GUPPY_FIN_STRAINS.map((s) => s.name)]);

/** 所有缸（含檢疫盒）活著、看得出公母的自家公魚的品系名。 */
function bredMaleNames(tanks: TankState[]): string[] {
  return tanks
    .flatMap((t) => [...t.fish, ...(t.quarantine?.fish ?? [])])
    .filter((f) => f.alive && f.species === 'guppy' && f.sex === 'male' && (f.generation ?? 0) >= 1 && f.genome && sexVisible(f))
    .map((f) => strainName(phenotype(f.genome!)));
}

/**
 * 3 步路線的進度。做到的步驟記在共用錢包上，之後缸況變差（例如氨又冒出來）也不會倒退。
 * 會順手更新記錄，畫面每次刷新呼叫即可。
 */
export function dreamRoute(tanks: TankState[]): DreamRoute {
  const home = tanks[0];
  const e = economy(home);
  const done = new Set<DreamStepId>(e.dreamSteps ?? []);
  const latch = (id: DreamStepId, ok: boolean) => ok && done.add(id);
  // 養好缸：任何一缸的硝化菌長滿
  latch('tank', tanks.some((t) => cycleMaturity(t) >= 1));
  // 第一窩：有自家繁殖的魚（活著的、已經交出去的都算）
  latch('brood', tanks.some((t) => [...t.fish, ...(t.quarantine?.fish ?? [])].some((f) => (f.generation ?? 0) >= 1)) || (e.raisedGone ?? 0) > 0);
  const names = bredMaleNames(tanks);
  const own = names.find((n) => !STORE_NAMES.has(n));
  latch('bred', !!own);
  const achieved = !!e.dreamAchieved || names.includes(DREAM_FISH.name);
  if (achieved) e.dreamAchieved = true;
  e.dreamSteps = [...done];
  const order: DreamStepId[] = ['tank', 'brood', 'bred'];
  const next = order.find((id) => !done.has(id));
  return {
    steps: order.map((id) => ({ id, title: STEP_TITLES[id], done: done.has(id), current: id === next })),
    achieved,
    bredName: own,
  };
}
