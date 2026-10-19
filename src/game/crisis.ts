import { DISEASE_SPECS, FISH_SPECIES, hasVisible, type DiseaseKind, type Fish, type SimEvent, type SimEventType, type TankState } from '../sim';

/**
 * 快轉時遇到的危機（#142）：設備故障、停電、生病、死魚，或水質、水溫突然變危險。
 * 快轉下幾十秒就可能整缸死光，遇到這些就切回正常速度，讓玩家來得及處理。
 */
export type WaterAlarm = 'too_hot' | 'too_cold' | 'ammonia' | 'nitrite';
export type CrisisReason = SimEventType | WaterAlarm;

export interface Crisis {
  /** 第幾缸。 */
  tank: number;
  reason: CrisisReason;
  /** 事件引起的危機才有。 */
  event?: SimEvent;
}

export const CRISIS_EVENTS: ReadonlySet<SimEventType> = new Set<SimEventType>([
  'fish_died',
  'ich_visible',
  'disease_visible',
  'heater_broke',
  'heater_stuck',
  'heater_exposed',
  'controller_cut',
  'power_out',
]);

/** 自然死亡（老死、蝦脫殼失敗）不算危機：魚蝦一多就常常發生，算進來快轉會一直被打斷。 */
const NATURAL_DEATHS = new Set(['old_age', 'molt']);

/** 這個事件算不算危機。 */
export function isCrisisEvent(e: SimEvent): boolean {
  if (!CRISIS_EVENTS.has(e.type)) return false;
  return !(e.type === 'fish_died' && NATURAL_DEATHS.has(e.cause ?? ''));
}

/** 魚病：白點或 DiseaseKind；發病事件以外回 null。 */
type Illness = 'ich' | DiseaseKind;

function illnessOf(e: SimEvent): Illness | null {
  if (e.type === 'ich_visible') return 'ich';
  if (e.type === 'disease_visible' && e.cause && e.cause in DISEASE_SPECS) return e.cause as DiseaseKind;
  return null;
}

/** 缸裡（含檢疫盒）還有沒有魚帶著這個病（潛伏或發病都算：同一波還沒過）。 */
function carrying(state: TankState, illness: Illness): boolean {
  const has = (f: Fish) => f.alive && (illness === 'ich' ? f.ich.stage !== 'none' : (f.infections ?? []).some((i) => i.kind === illness));
  return state.fish.some(has) || (state.quarantine?.fish.some(has) ?? false);
}

/** 缸裡（含檢疫盒）有沒有魚正在發這個病（看得到症狀）。 */
function showing(state: TankState, illness: Illness): boolean {
  const sick = (f: Fish) => f.alive && (illness === 'ich' ? f.ich.stage === 'visible' : hasVisible(f, illness));
  return state.fish.some(sick) || (state.quarantine?.fish.some(sick) ?? false);
}

/** 一個病在缸裡完全沒有魚帶著超過這麼久（遊戲小時，約白點一個潛伏期），才算這一波過了。 */
const WAVE_OVER_HOURS = 72;

/** 水溫超出魚的適溫幾度算危險（跟狀態列溫度變紅一致）。 */
const TEMP_MARGIN_C = 2;
/** 總氨、亞硝酸超過多少算危險（測試劑讀到 0.5 以上）；降到一半以下才解除，避免在門檻附近一直觸發。 */
const TOXIC_MG_L = 0.4;

/** 這缸現在有哪些水質警報（只看有活魚的缸）。prev 是上一次的警報，用來做解除的緩衝。 */
export function waterAlarms(state: TankState, prev: ReadonlySet<WaterAlarm> = new Set()): Set<WaterAlarm> {
  const alarms = new Set<WaterAlarm>();
  const species = new Set(state.fish.filter((f) => f.alive).map((f) => f.species));
  if (species.size === 0) return alarms;
  const { tempC, tan, no2 } = state.water;
  for (const s of species) {
    const { min, max } = FISH_SPECIES[s].temp;
    if (tempC > max + TEMP_MARGIN_C) alarms.add('too_hot');
    if (tempC < min - TEMP_MARGIN_C) alarms.add('too_cold');
  }
  if (tan > (prev.has('ammonia') ? TOXIC_MG_L / 2 : TOXIC_MG_L)) alarms.add('ammonia');
  if (no2 > (prev.has('nitrite') ? TOXIC_MG_L / 2 : TOXIC_MG_L)) alarms.add('nitrite');
  return alarms;
}

/**
 * 危機偵測（可重用：遊戲迴圈的快轉、之後的「過一晚」都用它）。
 * 記住每缸看過的最後一個事件和目前的水質警報；check 回報上次以後新發生的危機，
 * sync 只更新記錄、不回報（正常速度下用，切到快轉時不會把已經知道的狀況當成新的）。
 * 同一缸同一種病一波只回報一次：病在缸裡傳開時不會每多一條就打斷一次（#160、#165）；
 * 下藥治療期間也不再打斷。等這個病在缸裡完全沒有魚帶著、過了 WAVE_OVER_HOURS，下一波才重新算。
 */
export class CrisisWatch {
  private seen = new Map<TankState, SimEvent | undefined>();
  private alarms = new Map<TankState, Set<WaterAlarm>>();
  /** 每缸已經回報過、這一波還沒過的病，和最後一次看到有魚帶著的時間（遊戲小時）。 */
  private illnesses = new Map<TankState, Map<Illness, number>>();

  constructor(tanks: readonly TankState[] = []) {
    this.reset(tanks);
  }

  /** 從現在的狀態重新開始（讀檔、換存檔）。 */
  reset(tanks: readonly TankState[]): void {
    this.seen = new Map(tanks.map((t) => [t, t.events.at(-1)]));
    this.alarms = new Map(tanks.map((t) => [t, waterAlarms(t)]));
    const all: Illness[] = ['ich', ...(Object.keys(DISEASE_SPECS) as DiseaseKind[])];
    // 只記正在發病的：潛伏中的（例如店魚帶來的）還沒回報過，之後真的發病要打斷
    this.illnesses = new Map(tanks.map((t) => [t, new Map(all.filter((i) => showing(t, i)).map((i) => [i, t.hours]))]));
  }

  /** 還有魚帶著的病更新時間；完全沒有魚帶著超過 WAVE_OVER_HOURS 就忘掉（這一波過了）。 */
  private forgetHandled(t: TankState): Map<Illness, number> {
    let known = this.illnesses.get(t);
    if (!known) this.illnesses.set(t, (known = new Map()));
    for (const [illness, lastSeen] of known) {
      if (carrying(t, illness)) known.set(illness, t.hours);
      else if (t.hours - lastSeen >= WAVE_OVER_HOURS) known.delete(illness);
    }
    return known;
  }

  /** 上次 check／sync 以後新發生的第一個危機；沒有回 null。 */
  check(tanks: readonly TankState[]): Crisis | null {
    let found: Crisis | null = null;
    tanks.forEach((t, tank) => {
      const events = t.events;
      const last = events.at(-1);
      const seen = this.seen.get(t);
      if (last !== seen) {
        const fresh = events.slice(seen ? events.lastIndexOf(seen) + 1 : 0);
        this.seen.set(t, last);
        const known = this.forgetHandled(t);
        for (const e of fresh) {
          if (!isCrisisEvent(e)) continue;
          const illness = illnessOf(e);
          if (illness) {
            if (known.has(illness)) continue;
            known.set(illness, t.hours);
          }
          if (!found) found = { tank, reason: e.type, event: e };
        }
      } else this.forgetHandled(t);
      const before = this.alarms.get(t) ?? new Set<WaterAlarm>();
      const now = waterAlarms(t, before);
      this.alarms.set(t, now);
      const rose = [...now].find((a) => !before.has(a));
      if (rose && !found) found = { tank, reason: rose };
    });
    return found;
  }

  /** 只更新記錄、不回報。 */
  sync(tanks: readonly TankState[]): void {
    this.check(tanks);
  }
}

const ALARM_TEXT: Record<WaterAlarm, string> = {
  too_hot: '水溫太高',
  too_cold: '水溫太低',
  ammonia: '氨超標',
  nitrite: '亞硝酸超標',
};

const EVENT_TEXT: Partial<Record<SimEventType, string>> = {
  fish_died: '有魚死了',
  ich_visible: '有魚生病了',
  disease_visible: '有魚生病了',
  heater_broke: '加熱棒壞了',
  heater_stuck: '加熱棒卡住了',
  heater_exposed: '加熱棒空燒壞了',
  controller_cut: '控溫器切斷了加熱棒',
  power_out: '停電了',
};

/** 切回正常速度時的提示。 */
export function crisisText(c: Crisis): string {
  const what = (ALARM_TEXT as Partial<Record<CrisisReason, string>>)[c.reason] ?? EVENT_TEXT[c.reason as SimEventType] ?? '出狀況了';
  return `${what}，已經從快轉切回正常速度`;
}
