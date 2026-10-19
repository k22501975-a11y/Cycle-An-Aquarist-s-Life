import { FISH_SPECIES, type SimEvent, type SimEventType, type TankState } from '../sim';

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
