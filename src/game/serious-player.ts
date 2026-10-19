import { newGameState } from './game';
import {
  addCuttings,
  addFish,
  addPlant,
  buybackRefusal,
  buyQuarantine,
  BOX_CAPACITY,
  buyTank,
  checkGoals,
  dismissOrder,
  economy,
  feed,
  FISH_SPECIES,
  fulfillOrder,
  GUPPY_STRAIN_PRICES,
  isCycled,
  isJuvenile,
  linkTanks,
  matchingFish,
  moveFish,
  moveToQuarantine,
  newTankCost,
  orderBoard,
  PLANT_PRICES,
  price,
  releaseQuarantine,
  sellFish,
  simulate,
  transferMedia,
  trimPlant,
  useTestKit,
  waterChange,
  type TankState,
} from '../sim';

/** 經濟劇本測試（*.scenario.test.ts）共用的「認真玩家」腳本。 */

const alive = (s: TankState) => s.fish.filter((f) => f.alive);
const meal = (s: TankState) => alive(s).reduce((a, f) => a + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;

export interface SeriousRun {
  /** 每天累計賣給店家的錢。 */
  income: Record<number, number>;
  /** 每天累計交訂單的錢。 */
  orders: Record<number, number>;
  /** 第 21 天手上的錢（已經買了第二缸就是 Infinity）。 */
  coins21: number;
  tanks: number;
}

/**
 * 認真玩家 120 天（design/mvp.md §4.3）：買一組品系 1 公 2 母、種莫絲和矮珍珠，每天餵兩餐、測水、超標或每週換水。
 * 快生的母魚放進檢疫盒當產卵盒，小魚長到 1.6 cm 再放出來；成魚（留種的 3 條除外）賣給店家，太擠才賣中魚。
 * 錢夠又快滿了就加缸，分濾材過去、養好後移魚。新手任務獎勵共 800，簡化成第 10 天一次給；之後的目標（M19）照遊戲每天檢查、發獎勵。
 * takeOrders：每天修剪水草、先交訂單（湊單的魚留著不賣），湊不齊超過 10 天的單撕掉換新。
 */
export function seriousPlayer(seed: number, strain: number, takeOrders = false): SeriousRun {
  const home = newGameState(seed);
  const tanks: TankState[] = [home];
  linkTanks(tanks);
  home.environment.roomTempC = 25;
  home.environment.roomSwingC = 2;
  // 起始水溫也固定：newGameState 照現實日期給室溫當水溫，不固定的話結果會隨跑測試的日期、時間變
  home.water.tempC = home.water.tempAvgC = 25;
  const plantUp = (t: TankState) => {
    for (const p of ['moss', 'moss', 'glosso'] as const) addPlant(t, p);
    economy(home).coins -= 2 * PLANT_PRICES.moss + PLANT_PRICES.glosso;
  };
  plantUp(home);
  for (const sex of ['male', 'female', 'female'] as const) addFish(home, 'guppy', { carriesIch: false, carries: [], sex, strain });
  economy(home).coins -= 3 * GUPPY_STRAIN_PRICES[strain];
  const breeders = new Set(home.fish.map((f) => f.id));
  const cap = (t: TankState) => Math.round(t.equipment.tank.volumeL / 2);
  const count = (t: TankState) => alive(t).length;
  const income: Record<number, number> = {};
  const orderIncome: Record<number, number> = {};
  let total = 0;
  let coins21 = 0;
  for (let d = 1; d <= 120; d++) {
    for (let k = 0; k < 2; k++) {
      for (const t of tanks) if (count(t) > 0) feed(t, meal(t));
      for (const t of tanks) simulate(t, 12);
    }
    for (const t of tanks) {
      const heater = t.equipment.heater;
      if (heater && (heater.stuckOn || heater.broken)) t.equipment.heater = { spec: heater.spec, targetC: heater.targetC, broken: false, heating: false };
      const r = useTestKit(t);
      if (r.ammonia >= 0.25 || r.nitrite >= 0.25 || r.nitrate >= 40 || d % 7 === 0) waterChange(t, 0.3);
      // 接訂單：先交得出來的單（留種的魚不交），插枝靠修剪；小孔雀單不交，仔魚要留著挑種（mvp.md §4.4.1 第 3 點）
      if (takeOrders) {
        for (const p of t.plants) addCuttings(t, p.species, trimPlant(t, p.id));
        for (const o of [...orderBoard(t).orders]) {
          if (o.kind !== 'fry') fulfillOrder(tanks, o.id, [...breeders]);
          // 一直湊不齊的單撕掉換一張
          if (t.hours - o.postedHours > 10 * 24) dismissOrder(t, o.id);
        }
      }
      // 留著湊訂單的魚先不賣
      const held = new Set(takeOrders ? orderBoard(t).orders.flatMap((o) => (o.kind === 'fish' ? matchingFish(t, o, [...breeders]).slice(0, o.count).map((f) => f.id) : [])) : []);
      const crowded = count(t) > cap(t) * 1.2;
      for (const f of alive(t)) if (!breeders.has(f.id) && !held.has(f.id) && !buybackRefusal(f) && (crowded || !isJuvenile(f))) total += sellFish(t, f.id);
    }
    // 產卵盒：快生的母魚放進去，生完放回去；盒裡的小魚長大一點放到最空的缸
    if (!home.quarantine && d >= 14 && economy(home).coins >= price('quarantine:box') + 300) {
      economy(home).coins -= price('quarantine:box');
      buyQuarantine(home);
    }
    if (home.quarantine) {
      const box = home.quarantine.fish.filter((f) => f.alive);
      const mom = box.find((f) => f.sex === 'female' && !isJuvenile(f));
      if (mom && mom.pregnancy === 0) releaseQuarantine(home, [mom.id]);
      if (!mom) {
        const due = alive(home).find((f) => f.pregnancy > 0.85);
        if (due) moveToQuarantine(home, due.id);
      }
      // 長到 1.6 cm 放出來；盒子太擠就先放大的出來
      const crowd = box.length > BOX_CAPACITY ? [...box].sort((a, b) => b.lengthCm - a.lengthCm).slice(0, box.length - BOX_CAPACITY) : [];
      const grown = box.filter((f) => isJuvenile(f) && (f.lengthCm >= 1.6 || crowd.includes(f))).map((f) => f.id);
      if (grown.length > 0) {
        releaseQuarantine(home, grown);
        const to = tanks.filter((t) => isCycled(t)).reduce((a, b) => (count(b) / cap(b) < count(a) / cap(a) ? b : a));
        if (to !== home) for (const id of grown) moveFish(home, to, id);
      }
    }
    if (d === 10) economy(home).coins += 800;
    checkGoals(tanks, d >= 10);
    // 第 21 天：已經買了第二缸，或者手上的錢買得起
    if (d === 21) coins21 = tanks.length > 1 ? Infinity : economy(home).coins;
    const size = tanks.length === 1 ? 'nano20' : 'std40';
    const fish = tanks.reduce((a, t) => a + count(t), 0);
    if (tanks.length < 6 && fish > tanks.reduce((a, t) => a + cap(t), 0) * 0.5 && economy(home).coins >= newTankCost(tanks, size) + 300) {
      const t = buyTank(tanks, size)!;
      transferMedia(home, t);
      plantUp(t);
    }
    for (const t of tanks.slice(1)) {
      if (!isCycled(t) || count(t) >= cap(t) * 0.5) continue;
      const from = tanks.reduce((a, b) => (count(b) > count(a) ? b : a));
      if (from !== t) for (const f of alive(from).filter((x) => !breeders.has(x.id)).slice(0, Math.floor(cap(t) * 0.5))) moveFish(from, t, f.id);
    }
    income[d] = total;
    orderIncome[d] = orderBoard(home).earned;
  }
  return { income, orders: orderIncome, coins21, tanks: tanks.length };
}

/**
 * 一般玩家（遊戲性評測 g3 的玩法）：一公兩母藍草、1 株榕、一天兩餐、每週換水三成、能賣就賣（留種的 3 條除外），
 * 不用產卵盒、不修剪水草、不加缸。takeOrders：訂單板上交得出來的單就交。回傳每天累計的賣魚和訂單收入。
 */
export function casualPlayer(seed: number, takeOrders: boolean, days = 90): { income: Record<number, number>; orders: Record<number, number> } {
  const s = newGameState(seed);
  const tanks = [s];
  s.environment.roomTempC = 25;
  s.environment.roomSwingC = 2;
  // 起始水溫也固定：newGameState 照現實日期給室溫當水溫，不固定的話結果會隨跑測試的日期、時間變
  s.water.tempC = s.water.tempAvgC = 25;
  addPlant(s, 'anubias');
  for (const sex of ['male', 'female', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex, strain: 0 });
  const breeders = [...s.fish.map((f) => f.id)];
  const income: Record<number, number> = {};
  const orders: Record<number, number> = {};
  let total = 0;
  for (let d = 1; d <= days; d++) {
    for (let k = 0; k < 2; k++) {
      feed(s, meal(s));
      simulate(s, 12);
    }
    if (d % 7 === 0) waterChange(s, 0.3);
    if (d === 10) economy(s).coins += 800;
    checkGoals(tanks, d >= 10);
    // 有接訂單的話：交得出來就交，訂單要的魚先留著不賣
    // 小孔雀單：板上有中魚單時聽阿德的提醒先不賣，留著養大（mvp.md §4.4.1 第 3 點）
    const growing = orderBoard(s).orders.some((o) => o.kind === 'fish' && o.size === 'juvenile');
    if (takeOrders) for (const o of [...orderBoard(s).orders]) if (o.kind !== 'fry' || !growing) fulfillOrder(tanks, o.id, breeders);
    const held = new Set(takeOrders ? orderBoard(s).orders.flatMap((o) => (o.kind === 'fish' ? matchingFish(s, o, breeders).slice(0, o.count).map((f) => f.id) : [])) : []);
    for (const f of alive(s)) if (!breeders.includes(f.id) && !held.has(f.id) && !buybackRefusal(f)) total += sellFish(s, f.id);
    income[d] = total;
    orders[d] = orderBoard(s).earned;
  }
  return { income, orders };
}
