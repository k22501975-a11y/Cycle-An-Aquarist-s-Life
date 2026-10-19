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

/** 缸裡（含檢疫盒）還有沒有魚正在發這個病。 */
function stillSick(state: TankState, illness: Illness): boolean {
  const showing = (f: Fish) => f.alive && (illness === 'ich' ? f.ich.stage === 'visible' : hasVisible(f, illness));
  return state.fish.some(showing) || (state.quarantine?.fish.some(showing) ?? false);
}

/** 治這個病的藥在缸裡（含檢疫盒）的濃度，用來看玩家有沒有下藥。 */
function medicineFor(state: TankState, illness: Illness): number {
  const { water, quarantine: q } = state;
  if (illness === 'ich') return water.medication + (q?.ichMedication ?? 0);
  return DISEASE_SPECS[illness].cure === 'antibiotic' ? (water.antibiotic ?? 0) + (q?.antibiotic ?? 0) : (water.dewormer ?? 0) + (q?.dewormer ?? 0);
}

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
 * 同一缸同一種病只回報第一次發病：病在缸裡傳開時不會每多一條就打斷一次（#160）；
 * 等這個病在缸裡消失，或玩家下了治它的藥，之後再發病才重新算。
 */
export class CrisisWatch {
  private seen = new Map<TankState, SimEvent | undefined>();
  private alarms = new Map<TankState, Set<WaterAlarm>>();
  /** 每缸已經回報過、還在缸裡的病，和回報時（或上次看到時）的藥量。 */
  private illnesses = new Map<TankState, Map<Illness, number>>();

  constructor(tanks: readonly TankState[] = []) {
    this.reset(tanks);
  }

  /** 從現在的狀態重新開始（讀檔、換存檔）。 */
  reset(tanks: readonly TankState[]): void {
    this.seen = new Map(tanks.map((t) => [t, t.events.at(-1)]));
    this.alarms = new Map(tanks.map((t) => [t, waterAlarms(t)]));
    const all: Illness[] = ['ich', ...(Object.keys(DISEASE_SPECS) as DiseaseKind[])];
    this.illnesses = new Map(tanks.map((t) => [t, new Map(all.filter((i) => stillSick(t, i)).map((i) => [i, medicineFor(t, i)]))]));
  }

  /** 病消失了，或藥量比上次高（玩家下藥了），就忘掉這個病。 */
  private forgetHandled(t: TankState): Map<Illness, number> {
    let known = this.illnesses.get(t);
    if (!known) this.illnesses.set(t, (known = new Map()));
    for (const [illness, med] of known) {
      const now = medicineFor(t, illness);
      if (!stillSick(t, illness) || now > med + 1e-6) known.delete(illness);
      else known.set(illness, now);
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
            known.set(illness, medicineFor(t, illness));
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
