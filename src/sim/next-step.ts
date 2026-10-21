import { economy } from './economy';
import { CALM_DAYS, goalState, nextGoals, PURPOSE_GOAL_COUNT, raisedCount, type Goal } from './goals';
import { growthStage } from './growth';
import { newTankCost } from './household';
import { BELLY_SHOWS, dueMothers } from './nursery';
import { orderBoard, orderSupply } from './orders';
import { hasVisible } from './processes/disease';
import { isShrimpSpecies } from './species';
import type { TankState } from './state';
import { breedingTankRaised, displayTankHighPlants, purposeTanks } from './tank-purpose';

/**
 * 主畫面的「下一步」（polish-to-9.md U1）：教學結束後，時鐘下方一直看得到現在該做什麼，點下去帶到要按的按鈕。
 * 這裡只出資料（一句話＋要去哪裡），畫面怎麼畫、點了打開哪個面板由畫面決定。
 * 跟著目標串走：第一個還沒完成的目標，依現在缸裡的狀況說具體要做的事。
 */

/** 點「下一步」要帶去的地方。 */
export type NextTarget =
  | 'feed' // 餵食
  | 'nursery' // 育幼盒（買或把母魚放進去）
  | 'orders' // 訂單板
  | 'sell' // 賣魚給店家
  | 'shop_tank' // 商店的魚缸頁
  | 'shop_fish' // 商店的魚頁
  | 'shop_gear' // 商店的設備頁
  | 'shop_plants' // 商店的水草頁
  | 'select' // 挑選面板（選育）
  | 'treat' // 治療
  | 'test'; // 測水

export interface NextStep {
  /** 對應的目標 id。 */
  goal: string;
  /** 一句話（≤ 20 字左右，畫面放得下）。 */
  text: string;
  target: NextTarget;
}

const living = (tanks: TankState[]) => tanks.flatMap((t) => t.fish.filter((f) => f.alive));
const bredFry = (tanks: TankState[]) => living(tanks).filter((f) => (f.generation ?? 0) >= 1 && !isShrimpSpecies(f.species) && growthStage(f) === 'fry');

/** 沒寫到的目標用的保底句。 */
export const GENERIC_STEP = '看看任務卡上的目標';

/** 母魚快生了（要育幼盒）或肚子看得出懷孕時的下一步；都沒有回傳 null。 */
function motherStep(tanks: TankState[]): Omit<NextStep, 'goal'> | null {
  if (tanks.some((t) => dueMothers(t).length > 0)) return tanks.some((t) => t.nurseryBox && dueMothers(t).length > 0) ? { text: '母魚快生了，放進育幼盒', target: 'nursery' } : { text: '母魚快生了，買個育幼盒', target: 'nursery' };
  const showing = living(tanks).some((f) => f.sex === 'female' && f.pregnancy >= BELLY_SHOWS && !isShrimpSpecies(f.species));
  return showing ? { text: '母魚懷孕了，餵飽她等小魚', target: 'feed' } : null;
}

/** 每個目標在現在的狀況下要做的事。 */
function stepFor(goal: Goal, tanks: TankState[]): Omit<NextStep, 'goal'> {
  const home = tanks[0];
  switch (goal.id) {
    case 'cycled':
      // 養水是背景目標（U2）：店裡的母魚常常已經懷孕，這段時間指向第一窩小魚，不要只叫玩家等（g13 門檻 3）
      return motherStep(tanks) ?? { text: '每天測水，等氨和亞硝都到 0', target: 'test' };
    case 'protect_fry':
      if (bredFry(tanks).length > 0) return { text: '小魚還小，一天餵兩次', target: 'feed' };
      return motherStep(tanks) ?? { text: '餵飽母魚，等她懷孕', target: 'feed' };
    case 'raise5':
      return { text: `小魚一天餵兩次，養到轉色（${Math.min(5, raisedCount(tanks))}/5）`, target: 'feed' };
    case 'sale': {
      const ready = orderBoard(home).orders.some((o) => orderSupply(tanks, o) >= o.count);
      return ready ? { text: '有訂單交得出貨，去交貨', target: 'orders' } : { text: '賣一尾魚，或看看訂單板', target: 'sell' };
    }
    case 'second_tank': {
      const need = newTankCost(tanks, 'nano20') - economy(home).coins;
      return need > 0 ? { text: `再存 ${need} 魚幣買第二個缸`, target: 'orders' } : { text: '錢夠了，去買第二個缸', target: 'shop_tank' };
    }
    case 'cure':
      return living(tanks).some((f) => f.ich.stage === 'visible' || hasVisible(f)) ? { text: '有魚生病了，去治療', target: 'treat' } : { text: '每天測水，魚生病就治好牠', target: 'test' };
    case 'shrimp':
      return living(tanks).some((f) => f.species === 'cherry_shrimp') ? { text: '顧好水質，等母蝦抱蛋', target: 'test' } : { text: '買幾隻米蝦，開個蝦缸', target: 'shop_fish' };
    case 'calm': {
      const g = goalState(tanks);
      const best = Math.max(0, ...tanks.map((t, i) => Math.floor((t.hours - (g.calmSince[i] ?? t.hours)) / 24)));
      return { text: `每天測水，${CALM_DAYS} 天沒警告（${Math.min(best, CALM_DAYS)}/${CALM_DAYS}）`, target: 'test' };
    }
    case 'breeding_tank':
      return { text: `小魚搬去繁殖缸養大（${Math.min(PURPOSE_GOAL_COUNT.breeding, breedingTankRaised(tanks))}/${PURPOSE_GOAL_COUNT.breeding}）`, target: 'shop_tank' };
    case 'display_tank': {
      const lit = purposeTanks(tanks, 'display').some((t) => t.equipment.light?.spec.id === 'planted');
      if (!lit) return { text: '展示缸換上水草燈', target: 'shop_gear' };
      return { text: `展示缸種陽性草（${Math.min(PURPOSE_GOAL_COUNT.display, displayTankHighPlants(tanks))}/${PURPOSE_GOAL_COUNT.display}）`, target: 'shop_plants' };
    }
    case 'strain':
    case 'fins':
      return { text: '挑漂亮的公母配對留種', target: 'select' };
    // 新目標忘了在這裡加一句時的保底（測試會抓到）
    default:
      return { text: GENERIC_STEP, target: 'test' };
  }
}

/** 現在的下一步；目標全做完了回傳 null。 */
export function nextStep(tanks: TankState[]): NextStep | null {
  const [goal] = nextGoals(tanks, 1);
  if (!goal || !tanks[0]) return null;
  return { goal: goal.id, ...stepFor(goal, tanks) };
}
