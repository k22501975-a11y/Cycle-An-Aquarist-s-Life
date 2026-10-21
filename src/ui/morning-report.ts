import { crisisText, type Crisis } from '../game/crisis';
import {
  cycleMaturity,
  DUE_PREGNANCY,
  economy,
  FISH_SPECIES,
  HUNGRY,
  isCycled,
  isJuvenile,
  isShrimpSpecies,
  orderBoard,
  MEASURED_PROBLEM_LEVEL,
  testWater,
  pestCount,
  PLANT_SPECIES,
  takeGearNote,
  tankLabel,
  usesNursery,
  youngGettingHungry,
  type FishSpeciesId,
  type SimEvent,
  type TankState,
} from '../sim';
import { deathText, describeEvent, fryEatenText, ichCauseText } from './labels';

/**
 * 「過一晚」的早上報告（first-10-minutes.md F2）：睡前拍一張快照，醒來跟現在比，
 * 列出昨晚發生的事。每一條帶 action，畫面點下去就帶玩家去處理。不碰 DOM。
 * 唯一會改狀態的是設備後果那句（G5）：說過的記在缸上，下一晚不重複。
 */

/** 點報告的一條要去哪裡處理（畫面自己決定開哪個面板）。 */
export type ReportAction =
  | 'remove_dead' // 撈死魚
  | 'test_water' // 測水
  | 'water_change' // 換水
  | 'feed' // 餵食
  | 'treat' // 看病、下藥
  | 'equipment' // 設備（加熱棒、停電）
  | 'fish' // 看那條魚（subjectId）
  | 'orders' // 訂單板
  | 'snails' // 螺
  | 'trim' // 修剪水草
  | 'fry_box' // 育幼盒或檢疫盒（把仔魚撈進去）
  | 'nursery'; // 把快生的母魚放進育幼盒

export type ReportKind =
  | 'crisis'
  | 'death'
  | 'birth'
  | 'eaten'
  | 'grown'
  | 'cycle'
  | 'cycled'
  | 'disease'
  | 'equipment'
  | 'snails'
  | 'algae'
  | 'plant_died'
  | 'hungry'
  | 'orders'
  | 'nursery'
  | 'plant_grew' // 水草長了一點
  | 'fish_relaxed' // 魚放鬆了
  | 'ammonia' // 新缸開始出現氨
  | 'gear' // 開缸挑的設備造成的後果（G5）
  | 'belly' // 母魚肚子變大、出現胎斑（G8：缸裡真的發生的事）
  | 'courtship' // 公魚追母魚、配對成功（G8）
  | 'fry_grew' // 小魚長到 1 公分、游出水草（G8）
  | 'new_leaf' // 水草長出新葉（G8）
  | 'rescued' // 測到氨或亞硝、換了水、讀數降下來（G8）
  | 'quiet';

export interface ReportItem {
  kind: ReportKind;
  /** 第幾缸。 */
  tank: number;
  tone: 'bad' | 'warn' | 'good' | 'info';
  text: string;
  action?: ReportAction;
  /** 跟哪條魚有關（action 'fish'、'remove_dead' 用）。 */
  subjectId?: number;
  /** 數量（生了幾尾、死了幾條）。 */
  count?: number;
  /** 跟哪株水草有關（new_leaf 的配圖）。 */
  plantId?: number;
}

export interface MorningReport {
  /** 標題，例如「早安，第 3 天」或「半夜出狀況了」。 */
  title: string;
  /** 睡了幾個遊戲小時。 */
  hours: number;
  /** 半路遇到危機停下來。 */
  stopped: boolean;
  /** 越前面越要緊（危機、死亡在最前面）。 */
  items: ReportItem[];
}

interface FishSnap {
  alive: boolean;
  juvenile: boolean;
  lengthCm: number;
  pregnancy: number;
  stress: number;
  colorBoost: number;
}

interface TankSnap {
  tank: TankState;
  events: SimEvent | undefined;
  fish: Map<number, FishSnap>;
  maturity: number;
  cycled: boolean;
  algae: number;
  pests: number;
  orders: Set<number>;
  /** 每株水草的重量（g）。 */
  plants: Map<number, number>;
  /** 測試劑讀到的總氨（mg/L）。 */
  ammonia: number;
  /** 測試劑讀到的亞硝酸（mg/L）。 */
  nitrite: number;
}

export interface Snapshot {
  tanks: TankSnap[];
  coins: number;
}

const allFish = (t: TankState) => [...t.fish, ...(t.quarantine?.fish ?? [])];

/** 睡前拍快照。 */
export function snapshot(tanks: TankState[]): Snapshot {
  return {
    coins: economy(tanks[0]).coins,
    tanks: tanks.map((t) => ({
      tank: t,
      events: t.events.at(-1),
      fish: new Map(allFish(t).map((f) => [f.id, { alive: f.alive, juvenile: isJuvenile(f), lengthCm: f.lengthCm, pregnancy: f.pregnancy, stress: f.stress, colorBoost: f.colorBoost ?? 0 }])),
      maturity: cycleMaturity(t),
      cycled: isCycled(t),
      algae: t.algae,
      pests: pestCount(t),
      orders: new Set(orderBoard(t).orders.map((o) => o.id)),
      plants: new Map(t.plants.map((p) => [p.id, p.biomassG])),
      ammonia: testWater(t).ammonia,
      nitrite: testWater(t).nitrite,
    })),
  };
}

const TONE_ORDER: Record<ReportItem['tone'], number> = { bad: 0, warn: 1, good: 2, info: 3 };

/** 醒來後跟快照比，寫出早上報告。 */
export function morningReport(before: Snapshot, tanks: TankState[], sleptHours: number, crisis: Crisis | null): MorningReport {
  const items: ReportItem[] = [];
  if (crisis) {
    // 半夜死魚停下來的：危機那條就是死亡那條，一樣寫死因、數值、怎麼避免（U4）
    const died = crisis.event?.type === 'fish_died' ? crisis.event : null;
    const text = died ? deathLine(tanks[crisis.tank] ?? tanks[0], died) : crisisText(crisis).replace(/，已經從快轉切回正常速度$/, '，先停下來處理');
    items.push({ kind: 'crisis', tank: crisis.tank, tone: 'bad', text, action: crisisAction(crisis), subjectId: died?.subjectId });
  }
  tanks.forEach((t, index) => {
    const snap = before.tanks.find((s) => s.tank === t);
    const where = tanks.length > 1 ? `${tankLabel(tanks, index)}：` : '';
    const push = (item: Omit<ReportItem, 'tank'>) => items.push({ ...item, tank: index, text: where + item.text });
    const events = snap ? t.events.slice(snap.events ? t.events.lastIndexOf(snap.events) + 1 : 0) : [];

    // 死亡：每條都寫死因、當時的數值、下次怎麼避免（U4：死亡必須有原因可循）
    for (const e of events.filter((x) => x.type === 'fish_died')) {
      if (crisis?.event === e) continue;
      push({ kind: 'death', tone: 'bad', text: deathLine(t, e), action: 'remove_dead', subjectId: e.subjectId });
    }
    // 生病：同一種病合成一行（「3 條魚有白點」），不再一條魚一行（polish-to-9.md G3）。
    // 半夜叫醒的那條也算進來，危機那行只說「有魚生病了」，原因寫在這裡
    for (const sick of groupSick(events)) {
      const e = sick[0];
      const n = new Set(sick.map((x) => x.subjectId)).size;
      const text = n <= 1 ? (describeEvent(t, e)?.text ?? '有魚生病了') : sickText(sick, n);
      push({ kind: 'disease', tone: 'warn', text, action: 'treat', subjectId: e.subjectId, count: n > 1 ? n : undefined });
    }
    // 設備
    for (const e of events) {
      if (crisis?.event === e) continue;
      if (['heater_broke', 'heater_stuck', 'heater_exposed', 'power_out', 'controller_cut'].includes(e.type)) {
        push({ kind: 'equipment', tone: 'bad', text: describeEvent(t, e)?.text ?? '設備出狀況了', action: 'equipment' });
      } else if (e.type === 'plant_died') {
        push({ kind: 'plant_died', tone: 'warn', text: '有一株水草溶光了', action: 'trim' });
      }
    }
    // 出生：一胎一條
    const births = events.filter((x) => x.type === 'fry_born');
    const born = births.reduce((n, e) => n + (e.count ?? 0), 0);
    if (born > 0) {
      const mother = allFish(t).find((f) => f.id === births[0].subjectId);
      const shrimp = !!mother && isShrimpSpecies(mother.species);
      push({ kind: 'birth', tone: 'good', text: `昨晚${shrimp ? '孵出' : '生了'} ${born} ${shrimp ? '隻小蝦' : '尾小魚'}，水草越密越好躲`, action: 'fish', subjectId: births[0].subjectId, count: born });
    }
    // 被吃掉的仔魚（#176）：有就不能寫「一夜平安」，並教玩家怎麼救
    const eaten = events.filter((x) => x.type === 'fry_eaten').reduce((n, e) => n + (e.count ?? 0), 0);
    if (eaten > 0) {
      const shrimp = events.filter((x) => x.type === 'fry_eaten').every((e) => isShrimpSpecies((e.cause ?? 'guppy') as FishSpeciesId));
      push({
        kind: 'eaten',
        tone: 'warn',
        text: `昨晚有 ${fryEatenText(t, eaten, shrimp)}`,
        action: 'fry_box',
        count: eaten,
      });
    }
    // 育幼盒（#187）：老闆送的、小魚長大自己回主缸
    if (events.some((x) => x.type === 'nursery_gift'))
      push({ kind: 'nursery', tone: 'good', text: '阿德老闆送了一個育幼盒，掛在缸邊。快生的母魚放進去，小魚就不會被吃', action: 'nursery' });
    const released = events.filter((x) => x.type === 'nursery_released').reduce((n, e) => n + (e.count ?? 0), 0);
    if (released > 0) push({ kind: 'nursery', tone: 'good', text: `育幼盒裡 ${released} 尾小魚長到 1.6 cm，回主缸了` });
    if (!snap) return;
    // 長大
    const grown = allFish(t).filter((f) => f.alive && !isJuvenile(f) && snap.fish.get(f.id)?.juvenile);
    if (grown.length > 0) push({ kind: 'grown', tone: 'good', text: `${grown.length} 尾小魚長大了，看得出公母`, action: 'fish', subjectId: grown[0].id, count: grown.length });
    // 缸裡真的發生的事（polish-to-9.md G8）：母魚肚子變大、出現胎斑；公魚追母魚
    const mom = allFish(t).find((f) => {
      const was = snap.fish.get(f.id);
      return f.alive && f.sex === 'female' && was && usesNursery(f.species) && bellyStage(f.pregnancy) > bellyStage(was.pregnancy);
    });
    if (mom)
      push(
        bellyStage(mom.pregnancy) === 2
          ? { kind: 'belly', tone: 'good', text: '母魚肚子後面出現黑色胎斑，快生了', action: t.nurseryBox ? 'nursery' : 'fish', subjectId: mom.id }
          : { kind: 'belly', tone: 'good', text: '母魚的肚子圓起來了，看得出懷孕', action: 'fish', subjectId: mom.id },
      );
    const swimOut = allFish(t).filter((f) => f.alive && (f.generation ?? 0) >= 1 && f.lengthCm >= FRY_SWIMS_OUT_CM && (snap.fish.get(f.id)?.lengthCm ?? FRY_SWIMS_OUT_CM) < FRY_SWIMS_OUT_CM);
    if (swimOut.length > 0 && !isShrimpSpecies(swimOut[0].species))
      push({ kind: 'fry_grew', tone: 'good', text: `${swimOut.length} 尾小魚長到 1 公分，開始游出水草搶飼料了`, action: 'fish', subjectId: swimOut[0].id, count: swimOut.length });
    const mated = events.find((x) => x.type === 'mated');
    if (mated) push({ kind: 'courtship', tone: 'good', text: '公魚整晚追著母魚跑，配對成功了，等下一窩', action: 'fish', subjectId: Number(mated.cause) || mated.subjectId });
    // 你救回來了：測到氨或亞硝、測完換了水，讀數降下來（每缸說一次）
    const test = t.lastTest;
    const level = (r: { ammonia: number; nitrite: number }) => Math.max(r.ammonia, r.nitrite);
    if (!t.rescueNoted && test && level(test.reading) >= MEASURED_PROBLEM_LEVEL && (t.lastWaterChangeHours ?? -1) >= test.hours) {
      const now = testWater(t);
      if (Math.min(level(snap), level(now)) < level(test.reading)) {
        t.rescueNoted = true;
        push({ kind: 'rescued', tone: 'good', text: `換完水，${test.reading.ammonia >= MEASURED_PROBLEM_LEVEL ? '氨' : '亞硝'}讀數降下來了：你救回來了`, action: 'test_water' });
      }
    }
    // 養水
    if (!snap.cycled && isCycled(t)) push({ kind: 'cycled', tone: 'good', text: '水養好了！硝化菌已經長起來，可以開始放魚', action: 'test_water' });
    else if (!isCycled(t)) {
      const now = cycleMaturity(t);
      if (now >= 1) push({ kind: 'cycle', tone: 'info', text: '硝化菌夠了，水裡的氨和亞硝酸還在慢慢降，再等一兩晚', action: 'test_water' });
      else if (pct(now) !== pct(snap.maturity)) push({ kind: 'cycle', tone: 'info', text: `養水進度 ${pct(snap.maturity)} → ${pct(now)}`, action: 'test_water' });
      // 剛開始菌很少，一晚還跳不到下一個百分比
      else if (now > snap.maturity * 1.05) push({ kind: 'cycle', tone: 'info', text: `硝化菌慢慢在長，養水進度 ${pct(now)}。魚的排泄和飼料就是牠們的食物`, action: 'test_water' });
    }
    // 螺、藻
    const pests = pestCount(t);
    if (pests > snap.pests) push({ kind: 'snails', tone: 'info', text: snap.pests === 0 ? '缸壁上出現第一隻小螺，應該是跟著水草混進來的' : `小螺多了 ${pests - snap.pests} 隻`, action: 'snails', count: pests - snap.pests });
    if (t.algae > snap.algae + 0.05) push({ kind: 'algae', tone: 'warn', text: '玻璃上的藻變多了，光照可能太久或養分太多', action: 'water_change' });
    // 餓
    const living = t.fish.filter((f) => f.alive);
    if (living.length > 0 && living.reduce((a, f) => a + f.hunger, 0) / living.length > HUNGRY) push({ kind: 'hungry', tone: 'warn', text: '魚在水面游來游去討食，該餵了', action: 'feed' });
    // 小魚兩倍快變餓：一天只餵一次的話，下一餐前就會餓到消耗體力，還沒到要叫醒的程度就在這裡提醒（#193）
    else if (living.some((f) => !isShrimpSpecies(f.species) && youngGettingHungry(f)))
      push({ kind: 'hungry', tone: 'info', text: '小魚長得快、餓得也快，一天餵兩次比較好', action: 'feed' });
    // 新缸症候群（P6）：測試劑讀到的氨昨晚第一次到 0.25，換水就是在解決量得到的問題
    const ammonia = testWater(t).ammonia;
    const ammoniaCrisis = crisis?.reason === 'ammonia' && crisis.tank === index;
    if (!ammoniaCrisis && living.length > 0 && ammonia >= MEASURED_PROBLEM_LEVEL && snap.ammonia < MEASURED_PROBLEM_LEVEL)
      push({ kind: 'ammonia', tone: 'warn', text: `氨 ${ammonia}，水開始髒了，換三成水`, action: 'water_change' });
    // 水草長了一點（睡前就種著的那幾株，合計長了 1% 以上才寫；沒照光的晚上不會長）
    let plantsBefore = 0;
    let plantsNow = 0;
    for (const p of t.plants) {
      const was = snap.plants.get(p.id);
      if (was === undefined) continue;
      plantsBefore += was;
      plantsNow += p.biomassG;
    }
    // 水草長出新葉（G8）：一片葉子算插枝重量的 1/LEAF_PER_CUTTING，有一株多長了一片就寫，這晚就不另外寫長了幾 %
    const leaf = t.plants.find((p) => {
      const was = snap.plants.get(p.id);
      const leafG = PLANT_SPECIES[p.species].cuttingMassG / LEAF_PER_CUTTING;
      return was !== undefined && Math.floor(p.biomassG / leafG) > Math.floor(was / leafG);
    });
    if (leaf) push({ kind: 'new_leaf', tone: 'good', text: `${PLANT_SPECIES[leaf.species].name}長出新葉了`, plantId: leaf.id });
    else if (plantsBefore > 0 && plantsNow >= plantsBefore * PLANT_GREW) push({ kind: 'plant_grew', tone: 'good', text: `水草長了一點（+${Math.round((plantsNow / plantsBefore - 1) * 100)}%）` });
    // 魚放鬆了：睡前睡後都活著的魚，平均壓力降了一截（壓力低就不躲、鰭張開）；發色真的變好才說顏色變亮
    const both = living.filter((f) => snap.fish.get(f.id)?.alive);
    if (both.length > 0) {
      const avg = (get: (f: (typeof both)[number]) => number) => both.reduce((a, f) => a + get(f), 0) / both.length;
      const stressDrop = avg((f) => snap.fish.get(f.id)!.stress) - avg((f) => f.stress);
      // 畫面的發色加成以 0.25 為一級（tank-view.ts），有魚升了一級才看得出來
      const level = (x: number) => Math.round(x * 4);
      const brighter = both.some((f) => level(f.colorBoost ?? 0) > level(snap.fish.get(f.id)!.colorBoost));
      if (stressDrop >= RELAXED_DROP)
        push({ kind: 'fish_relaxed', tone: 'good', text: brighter ? '魚放鬆了，顏色變亮' : '魚慢慢適應新家，放鬆了', action: 'fish', subjectId: both[0].id });
    }
    // 開缸挑的設備有後果（G5）：第 3～10 天每天一句，每種設備只說一次
    const gear = takeGearNote(t);
    if (gear) push({ kind: 'gear', tone: 'info', text: gear.text, action: gear.key === 'filter' || gear.key === 'heater' || gear.key === 'air' ? 'equipment' : gear.key === 'substrate' ? 'test_water' : undefined });
    // 訂單
    const fresh = orderBoard(t).orders.filter((o) => !snap.orders.has(o.id)).length;
    if (fresh > 0 && index === 0) push({ kind: 'orders', tone: 'info', text: `阿德那邊來了 ${fresh} 張新訂單`, action: 'orders', count: fresh });
  });
  if (items.length === 0) items.push({ kind: 'quiet', tank: 0, tone: 'info', text: '昨晚很平靜，魚都在水草裡睡覺' });
  items.sort((a, b) => (a.kind === 'crisis' ? -1 : b.kind === 'crisis' ? 1 : TONE_ORDER[a.tone] - TONE_ORDER[b.tone]));
  const day = Math.floor(tanks[0].hours / 24) + 1;
  return { title: crisis ? '半夜出狀況了' : `早安，第 ${day} 天`, hours: sleptHours, stopped: !!crisis, items };
}

/** 一條死魚的報告文字（魚撈掉了就叫「一條魚」）。 */
function deathLine(t: TankState, e: SimEvent): string {
  const fish = allFish(t).find((f) => f.id === e.subjectId);
  return deathText(fish ? FISH_SPECIES[fish.species].name : '一條魚', e, fish);
}

/** 昨晚的發病事件，依病分組（白點一組、柱狀病一組、鰓吸蟲一組），照第一次出現的順序。 */
function groupSick(events: SimEvent[]): SimEvent[][] {
  const groups = new Map<string, SimEvent[]>();
  for (const e of events) {
    const key = e.type === 'ich_visible' ? 'ich' : e.type === 'disease_visible' ? (e.cause ?? 'disease') : null;
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.values()];
}

/** 好幾條魚發同一種病時的一行字。白點把這一波的原因都寫出來。 */
function sickText(sick: SimEvent[], n: number): string {
  const e = sick[0];
  if (e.type === 'ich_visible') {
    const causes = [...new Set(sick.map(ichCauseText).filter((x) => x))].map((x) => x.replace('。原因：', ''));
    return `${n} 條魚有白點${causes.length ? `。原因：${causes.join('；')}` : ''}`;
  }
  return e.cause === 'columnaris' ? `${n} 條魚嘴巴和身上長出白色棉絮狀的斑：柱狀病，快下抗生素` : `${n} 條魚鰓蓋張開、呼吸很急：水質正常的話是鰓吸蟲，下驅蟲藥`;
}

/** 水草合計長到睡前的幾倍才寫進報告（基本燈下莫絲一整天約長 1.5%，2% 就永遠不會出現）。 */
const PLANT_GREW = 1.01;
/** 一株插枝有幾片葉子（新葉的重量＝插枝重量 / 這個數；榕大約一週一片，G8）。 */
const LEAF_PER_CUTTING = 4;
/** 小魚長到這麼長，就會游出水草到水面搶飼料（G8 早上報告的小里程碑）。 */
const FRY_SWIMS_OUT_CM = 1;
/** 母魚肚子看得出來的懷孕程度（之後到 DUE_PREGNANCY 出現胎斑、快生了）。 */
const BELLY_SHOWS = 0.5;
const bellyStage = (pregnancy: number) => (pregnancy >= DUE_PREGNANCY ? 2 : pregnancy >= BELLY_SHOWS ? 1 : 0);
/** 魚的平均壓力（0–1）一晚降多少才算「放鬆了」（新魚 0.5，第一天約降到 0.3～0.43）。 */
const RELAXED_DROP = 0.05;

const pct = (x: number) => `${Math.round(Math.min(1, x) * 100)}%`;

function crisisAction(c: Crisis): ReportAction {
  switch (c.reason) {
    case 'fish_died':
      return 'remove_dead';
    case 'ich_visible':
    case 'disease_visible':
      return 'treat';
    case 'ammonia':
    case 'nitrite':
      return 'water_change';
    case 'starving':
      return 'feed';
    default:
      return 'equipment';
  }
}
