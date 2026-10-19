import type { HungerLevel, StressKey } from '../sim';

/**
 * 老闆看一眼魚就說得出原因（遊戲性評測：生病了不知道為什麼）。
 * 原因來自模擬的 fishCondition().causes（玩家也看得到的資訊推得出來），這裡只負責換成老闆的口氣和該怎麼做。
 */
const FIX: Partial<Record<StressKey, string>> = {
  temperature: '看一下加熱棒和水溫',
  ph: '換水時慢慢調，新魚記得滴水對水',
  ammonia: '少餵一點，換三成水',
  nitrite: '換三成水，可以加硝化菌液',
  nitrate: '換三成水',
  oxygen: '開打氣、別讓水太熱',
  co2: '多打氣，晚上別開 CO₂',
  hunger: '一天餵兩次，份量三分鐘吃得完',
  crowding: '分缸或賣掉幾隻',
  group: '群游魚至少養 6 條',
  suddenChange: '換水的水溫、水質要跟缸裡接近',
  medication: '療程結束後換水',
  injury: '把咬鰭的魚分開',
  territory: '多放石頭水草擋視線，或分缸',
};

export interface CauseLike {
  key: StressKey;
  label: string;
}

/** 魚況要不要讓老闆開口：有明顯的壓力來源，而且魚已經不太舒服。 */
export function needsAdvice(c: { health: number; stress: number; causes: CauseLike[] }): boolean {
  return c.causes.length > 0 && (c.stress > 0.35 || c.health < 0.7);
}

/** 老闆的一句話：最主要的一兩個原因加上怎麼做。 */
export function causeAdvice(name: string, causes: CauseLike[]): string {
  const [a, b] = causes;
  if (!a) return `${name}看起來很好，繼續保持。`;
  const why = b ? `${a.label}，還有${b.label}` : a.label;
  const fixes = [FIX[a.key], b && FIX[b.key]].filter((x): x is string => !!x && x !== undefined);
  const unique = [...new Set(fixes)];
  return `${name}不太舒服：${why}。${unique.length ? `${unique.join('，')}。` : ''}`;
}

/** 資訊卡上的飢餓小標。 */
export const HUNGER_LABEL: Record<HungerLevel, string> = {
  full: '吃飽了',
  fed: '不餓',
  hungry: '餓了',
  starving: '很餓',
};
