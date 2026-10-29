import { newGameState } from './game';
import {
  addCuttings,
  addFish,
  addHardscape,
  addPlant,
  buyNurseryBox,
  catchPests,
  dailyTasks,
  economy,
  feed,
  HARDSCAPE,
  hardscapePlacements,
  makeOrder,
  markDaily,
  isShrimpSpecies,
  isStarving,
  pinchMg,
  markDailyFish,
  waterTaskTank,
  phenotype,
  moveDueToNursery,
  orderBoard,
  PLANT_SPECIES,
  placeFromBag,
  placeHardscape,
  placePlant,
  plantPlacement,
  removeClutches,
  removeDeadSnails,
  rinseFilterMedia,
  takeCutting,
  topUp,
  trimPlant,
  trimToCover,
  updateDaily,
  useTestKit,
  waterChange,
  type DailyTaskId,
  type PlantSpeciesId,
  type TankState,
} from '../sim';

/**
 * 劇本用的「照小卡做事」玩家（每日小事，sim/daily.ts）：每一題用玩家在畫面上會做的那個動作完成。
 * 要點畫面的題目（看魚、翻圖鑑…）跟畫面一樣呼叫 markDaily。
 */

/** 測試用：有魚、長長的紅蝴蝶、幾隻小螺的缸，第 10 天早上。 */
export function richTank(): TankState {
  const s = newGameState(3);
  addFish(s, 'guppy', { carriesIch: false, carries: [] });
  const p = addPlant(s, 'rotala');
  p.biomassG = PLANT_SPECIES.rotala.maxBiomassG;
  s.snails = { snails: [], pests: { bladder: 3, ramshorn: 0, mts: 0 } as never, clutches: [], appleYoung: 0, neriteEggs: 0 };
  s.hours = 24 * 10 + 8;
  return s;
}

/** 什麼題目都出得了的缸：魚、蝦、快生的母魚和育幼盒、長長的草、螺和螺卵、死螺、石頭、手上的沉木和插枝、訂單、水位低、養好的濾材。 */
export function everythingTank(seed = 5): TankState {
  const s = richTank();
  s.rng.seed = seed;
  addFish(s, 'cherry_shrimp', { carriesIch: false, carries: [] });
  const mom = addFish(s, 'guppy', { carriesIch: false, carries: [], sex: 'female', pregnant: false });
  mom.pregnancy = 0.95;
  buyNurseryBox(s);
  addPlant(s, 'anubias');
  addHardscape(s, HARDSCAPE.lava);
  s.snails = {
    snails: [{ id: 1, kind: 'apple', alive: false, hunger: 0, ageDays: 30 } as never],
    pests: { bladder: 20, ramshorn: 0, mts: 0 } as never,
    clutches: [{ id: 1, hour: s.hours, eggs: 80, color: 'gold' }],
    appleYoung: 0,
    neriteEggs: 0,
  };
  const e = economy(s);
  e.hardscapeBag = ['driftwood'];
  e.cuttings = { moss: 2 };
  const board = orderBoard(s);
  board.orders.push(makeOrder(board, s.hours));
  s.water.levelL = s.equipment.tank.volumeL * 0.95;
  s.bacteria.aob = s.bacteria.nob = 1;
  s.water.tan = s.water.no2 = 0;
  // 開缸兩週以上才出洗濾材
  s.hours = 24 * 15 + 8;
  return s;
}

/** 「小魚多要多餵」餵哪一缸：有魚消瘦的、再來最餓的那缸（遊戲裡餵一缸會連別缸一起餵，#325）。 */
function hungriest(tanks: TankState[]): TankState {
  const score = (t: TankState) => {
    const fish = t.fish.filter((f) => f.alive && !isShrimpSpecies(f.species));
    return fish.filter(isStarving).length * 10 + Math.max(0, ...fish.map((f) => f.hunger));
  };
  return tanks.filter((t) => t.fish.some((f) => f.alive)).sort((a, b) => score(b) - score(a))[0] ?? tanks[0];
}

/** 在找得到的第一缸做完一題。 */
export function doDailyTask(tanks: TankState[], id: DailyTaskId, subjectId = dailyTasks(tanks)?.tasks.find((t) => t.id === id)?.subjectId, otherId = dailyTasks(tanks)?.tasks.find((t) => t.id === id)?.otherId): void {
  const home = tanks[0];
  const find = (f: (t: TankState) => boolean) => tanks.find(f) ?? home;
  const withScape = find((t) => (t.equipment.hardscape ?? []).length > 0);
  const withPlant = find((t) => t.plants.length > 0);
  const first = () => hardscapePlacements(withScape)[0];
  switch (id) {
    case 'test':
      useTestKit(home);
      break;
    case 'feed':
    case 'goalFryFed': {
      // 跟遊戲裡按一次餵食一樣：一小撮
      const t = hungriest(tanks);
      feed(t, pinchMg(t));
      break;
    }
    case 'water':
      waterChange(tanks[waterTaskTank(tanks)], 0.3);
      break;
    case 'topup':
      for (const t of tanks) topUp(t);
      break;
    case 'nursery':
      for (const t of tanks) if (t.nurseryBox) moveDueToNursery(t);
      break;
    case 'scape':
      placeHardscape(withScape, 0, { x: first().x > 0.5 ? 0.25 : 0.75 });
      break;
    case 'scapeFlip':
      placeHardscape(withScape, 0, { flip: !first().flip });
      break;
    case 'scapeLayer':
      placeHardscape(withScape, 0, { layer: first().layer === 'back' ? 'mid' : 'back' });
      break;
    case 'scapeScale':
      placeHardscape(withScape, 0, { scale: (first().scale ?? 1) > 1 ? 0.9 : 1.1 });
      break;
    case 'scapePlant': {
      const p = withPlant.plants[0];
      placePlant(withPlant, p.id, { x: plantPlacement(p).x > 0.5 ? 0.3 : 0.7 });
      break;
    }
    case 'scapePlace': {
      const bag = economy(home).hardscapeBag ?? [];
      if (bag.length) placeFromBag(home, bag[0]);
      break;
    }
    case 'trim':
      for (const t of tanks) for (const p of t.plants) addCuttings(t, p.species, trimPlant(t, p.id));
      break;
    case 'trimDense':
      for (const t of tanks) trimToCover(t);
      break;
    case 'cuttings': {
      // 種回去一株（不賣，訂單可能要插枝）
      const cuttings = economy(home).cuttings;
      const sp = (Object.keys(cuttings) as PlantSpeciesId[]).find((k) => (cuttings[k] ?? 0) > 0);
      if (sp && takeCutting(home, sp)) addPlant(home, sp, PLANT_SPECIES[sp].cuttingMassG, true);
      break;
    }
    case 'clutch':
      for (const t of tanks) removeClutches(t);
      break;
    case 'pests':
      catchPests(find((t) => !!t.snails), true);
      break;
    case 'deadSnail':
      for (const t of tanks) removeDeadSnails(t);
      break;
    case 'rinse':
      rinseFilterMedia(find((t) => !!t.equipment.filter), 'tank');
      break;
    case 'goalBelly':
    case 'goalColor':
    case 'goalKeeper':
    case 'goalFirstBrood':
    case 'goalColorDays':
    case 'goalFins':
    case 'goalSplit':
    case 'goalKeeperFed':
    case 'goalHide':
    case 'goalCountBrood':
    case 'goalSnake':
    case 'goalCompare':
      // 點那尾魚（畫面回報）；比一比兩尾都點
      if (subjectId !== undefined) markDailyFish(tanks, subjectId);
      if (otherId !== undefined) markDailyFish(tanks, otherId);
      break;
    case 'goalAlbino': {
      // 在新的一窩裡點一尾紅眼睛的小魚
      const young = tanks.flatMap((t) => t.fish).filter((f) => f.alive && (f.generation ?? 0) >= 1 && f.genome && phenotype(f.genome).albino);
      for (const f of young) markDailyFish(tanks, f.id);
      break;
    }
    default:
      // 看魚、看蝦、找螺、點水草、翻圖鑑、看趨勢、看訂單、看設備：畫面回報
      markDaily(tanks, id);
  }
}

/** 今天還沒做的小事全部做完（不開寶箱）。 */
export function doAllDaily(tanks: TankState[]): void {
  updateDaily(tanks);
  for (const t of dailyTasks(tanks)?.tasks ?? []) if (!t.done) doDailyTask(tanks, t.id, t.subjectId, t.otherId);
  updateDaily(tanks);
}
