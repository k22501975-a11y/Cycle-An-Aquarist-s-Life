import { addFish, addPlant } from './actions';
import { economy, type MallBag } from './economy';
import { linkTanks, MAX_TANKS, placeTankSet } from './household';
import { hasVisible } from './processes/disease';
import { FISH_SPECIES } from './species';
import type { Fish, TankState } from './state';

/**
 * 商城道具（design/monetization.md）：用儲值點數買，伺服器扣點，遊戲把道具放進背包、由玩家決定什麼時候用。
 * 原則是「付錢買的是省時間，不是跳過照顧」：特效藥只治症狀，套缸的生物照樣會因為照顧不當生病。
 */

export type MallItemId = keyof Omit<MallBag, 'claimed'>;

export const MALL_ITEMS: MallItemId[] = ['cure', 'tankset'];

export function mallBag(tanks: TankState[]): MallBag {
  return (economy(tanks[0]).mall ??= { cure: 0, tankset: 0, claimed: [] });
}

/** 把伺服器的道具放進背包；同一個編號只放一次。回傳有沒有新放進去。 */
export function addMallGrant(tanks: TankState[], grant: { id: number; item: string }): boolean {
  const bag = mallBag(tanks);
  if (bag.claimed.includes(grant.id) || !(MALL_ITEMS as string[]).includes(grant.item)) return false;
  bag[grant.item as MallItemId] += 1;
  bag.claimed.push(grant.id);
  // 只留最近的紀錄就夠（伺服器領過的不會再給）
  if (bag.claimed.length > 200) bag.claimed.splice(0, bag.claimed.length - 200);
  return true;
}

/** 水質造成的傷：特效藥對這些效果減半，提醒玩家去找原因。 */
const WATER_CAUSES = ['ammonia', 'nitrite', 'oxygen', 'co2', 'temperature'];
/** 特效藥補多少體力（病造成的傷）。 */
export const CURE_HEAL = 0.3;

function waterDamageShare(fish: Fish): number {
  const total = Object.values(fish.recentDamage).reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return WATER_CAUSES.reduce((a, k) => a + (fish.recentDamage[k] ?? 0), 0) / total;
}

/** 為什麼不能對這尾魚用特效藥；可以就回傳 null。 */
export function cureRefusal(tanks: TankState[], fish: Fish): string | null {
  if (mallBag(tanks).cure <= 0) return '背包裡沒有特效藥';
  if (!fish.alive) return '已經死了';
  if (FISH_SPECIES[fish.species].invertebrate) return '特效藥是給魚用的';
  if (fish.health >= 0.95 && fish.ich.stage !== 'visible' && !hasVisible(fish)) return '這尾魚看起來沒事';
  return null;
}

/**
 * 特效藥：症狀馬上消退、補回一些體力，但只治症狀——
 * 皮下的白點蟲退回潛伏、身上的病退回潛伏期，水裡的病原、水質問題都還在，不處理還會再發。
 * 水質造成的傷（氨、亞硝酸、缺氧、溫度）效果減半。
 */
export function useCure(tanks: TankState[], fish: Fish): boolean {
  if (cureRefusal(tanks, fish)) return false;
  mallBag(tanks).cure -= 1;
  if (fish.ich.stage === 'visible') fish.ich = { stage: 'incubating', progress: 0.5 };
  for (const inf of fish.infections ?? []) {
    if (inf.stage === 'visible') {
      inf.stage = 'latent';
      inf.progress = 0.5;
    }
  }
  const heal = CURE_HEAL * (1 - 0.5 * waterDamageShare(fish));
  fish.health = Math.min(1, fish.health + heal);
  fish.stress = Math.max(0, fish.stress - 0.2);
  return true;
}

export function tanksetRefusal(tanks: TankState[]): string | null {
  if (mallBag(tanks).tankset <= 0) return '背包裡沒有套缸';
  if (tanks.length >= MAX_TANKS) return `房間最多放 ${MAX_TANKS} 缸，先收掉一缸`;
  return null;
}

/** 擺出熟成套缸：40 L、濾材養好了、種好水草、6 尾確認健康的普通孔雀魚（3 公 3 母）。 */
export function placeMallTankset(tanks: TankState[]): TankState | null {
  if (tanksetRefusal(tanks)) return null;
  mallBag(tanks).tankset -= 1;
  const tank = placeTankSet(tanks, 'std40', true);
  tank.label = '熟成套缸';
  addPlant(tank, 'anubias');
  addPlant(tank, 'anubias');
  addPlant(tank, 'rotala');
  addPlant(tank, 'rotala');
  for (const sex of ['male', 'male', 'male', 'female', 'female', 'female'] as const) addFish(tank, 'guppy', { sex, carriesIch: false, pregnant: false });
  linkTanks(tanks);
  return tank;
}
