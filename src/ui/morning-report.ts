import { crisisText, type Crisis } from '../game/crisis';
import {
  cycleMaturity,
  economy,
  FISH_SPECIES,
  HUNGRY,
  isCycled,
  isJuvenile,
  isShrimpSpecies,
  orderBoard,
  pestCount,
  tankLabel,
  type SimEvent,
  type TankState,
} from '../sim';
import { DEATH_CAUSE_LABELS, describeEvent } from './labels';

/**
 * 「過一晚」的早上報告（first-10-minutes.md F2）：睡前拍一張快照，醒來跟現在比，
 * 列出昨晚發生的事。每一條帶 action，畫面點下去就帶玩家去處理。不碰 DOM。
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
  | 'trim'; // 修剪水草

export type ReportKind =
  | 'crisis'
  | 'death'
  | 'birth'
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
      fish: new Map(allFish(t).map((f) => [f.id, { alive: f.alive, juvenile: isJuvenile(f) }])),
      maturity: cycleMaturity(t),
      cycled: isCycled(t),
      algae: t.algae,
      pests: pestCount(t),
      orders: new Set(orderBoard(t).orders.map((o) => o.id)),
    })),
  };
}

const TONE_ORDER: Record<ReportItem['tone'], number> = { bad: 0, warn: 1, good: 2, info: 3 };

/** 醒來後跟快照比，寫出早上報告。 */
export function morningReport(before: Snapshot, tanks: TankState[], sleptHours: number, crisis: Crisis | null): MorningReport {
  const items: ReportItem[] = [];
  if (crisis) {
    items.push({ kind: 'crisis', tank: crisis.tank, tone: 'bad', text: crisisText(crisis).replace(/，已經從快轉切回正常速度$/, '，先停下來處理'), action: crisisAction(crisis) });
  }
  tanks.forEach((t, index) => {
    const snap = before.tanks.find((s) => s.tank === t);
    const where = tanks.length > 1 ? `${tankLabel(tanks, index)}：` : '';
    const push = (item: Omit<ReportItem, 'tank'>) => items.push({ ...item, tank: index, text: where + item.text });
    const events = snap ? t.events.slice(snap.events ? t.events.lastIndexOf(snap.events) + 1 : 0) : [];

    // 死亡：每條都列出原因（死亡必須有原因可循）
    for (const e of events.filter((x) => x.type === 'fish_died')) {
      if (crisis?.event === e) continue;
      const fish = allFish(t).find((f) => f.id === e.subjectId);
      const name = fish ? FISH_SPECIES[fish.species].name : '一條魚';
      push({ kind: 'death', tone: 'bad', text: `${name}死了，可能原因：${DEATH_CAUSE_LABELS[e.cause ?? 'unknown'] ?? e.cause}`, action: 'remove_dead', subjectId: e.subjectId });
    }
    // 生病、設備
    for (const e of events) {
      if (crisis?.event === e) continue;
      if (e.type === 'ich_visible' || e.type === 'disease_visible') {
        push({ kind: 'disease', tone: 'warn', text: describeEvent(t, e)?.text ?? '有魚生病了', action: 'treat', subjectId: e.subjectId });
      } else if (['heater_broke', 'heater_stuck', 'heater_exposed', 'power_out', 'controller_cut'].includes(e.type)) {
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
    if (!snap) return;
    // 長大
    const grown = allFish(t).filter((f) => f.alive && !isJuvenile(f) && snap.fish.get(f.id)?.juvenile);
    if (grown.length > 0) push({ kind: 'grown', tone: 'good', text: `${grown.length} 尾小魚長大了，看得出公母`, action: 'fish', subjectId: grown[0].id, count: grown.length });
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
    // 訂單
    const fresh = orderBoard(t).orders.filter((o) => !snap.orders.has(o.id)).length;
    if (fresh > 0 && index === 0) push({ kind: 'orders', tone: 'info', text: `阿德那邊來了 ${fresh} 張新訂單`, action: 'orders', count: fresh });
  });
  if (items.length === 0) items.push({ kind: 'quiet', tank: 0, tone: 'info', text: '昨晚很平靜，魚都在水草裡睡覺' });
  items.sort((a, b) => (a.kind === 'crisis' ? -1 : b.kind === 'crisis' ? 1 : TONE_ORDER[a.tone] - TONE_ORDER[b.tone]));
  const day = Math.floor(tanks[0].hours / 24) + 1;
  return { title: crisis ? '半夜出狀況了' : `早安，第 ${day} 天`, hours: sleptHours, stopped: !!crisis, items };
}

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
    default:
      return 'equipment';
  }
}
