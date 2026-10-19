/**
 * 開缸演出（design/first-10-minutes.md F1-b）：空缸 → 倒沙 → 注水（一開始霧濁、慢慢變清）→ 裝上設備 → 開燈。
 * 這裡只算每個時間點各步驟進行到哪（0–1），畫面怎麼畫在 tank-view.ts。
 */

export type SetupStep = 'sand' | 'water' | 'gear' | 'light' | 'done';

/** 各步驟開始的時間（秒）。 */
const AT = { sand: 0.6, water: 2.6, gear: 6.2, light: 7.6, done: 9.4 } as const;

export const SETUP_SECONDS = AT.done;

export interface SetupLook {
  /** 底沙堆到多高（0 還沒倒、1 倒完）。 */
  sand: number;
  /** 沙子正在往下倒（畫落下的沙流）。 */
  pouring: boolean;
  /** 水位（0 空缸、1 滿水）。 */
  water: number;
  /** 水的霧濁程度（剛注水最濁，慢慢沉澱變清）。 */
  milk: number;
  /** 設備出現（0 還沒裝、1 裝好）。 */
  gear: number;
  /** 燈（0 暗、1 亮）。 */
  light: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export function setupLook(t: number): SetupLook {
  const sand = ease((t - AT.sand) / (AT.water - AT.sand - 0.3));
  const water = ease((t - AT.water) / 2.4);
  // 注水時把沙攪起來最濁，水滿之後慢慢沉澱，開燈前大致清了
  const milk = t < AT.water ? 0 : Math.min(ease((t - AT.water) / 0.8), 1 - ease((t - AT.water - 2) / (AT.light - AT.water - 1.6)));
  return {
    sand,
    pouring: t > AT.sand && t < AT.water - 0.2,
    water,
    milk: 0.75 * milk,
    gear: ease((t - AT.gear) / 0.9),
    light: ease((t - AT.light) / 1.2),
  };
}

/** 這一格進入了哪個步驟（給音效、說明字用）；沒有換步驟回傳 null。 */
export function setupStepAt(prev: number, now: number): SetupStep | null {
  for (const step of ['sand', 'water', 'gear', 'light', 'done'] as const) if (prev < AT[step] && now >= AT[step]) return step;
  return null;
}

export const SETUP_CAPTIONS: Record<SetupStep, string> = {
  sand: '倒入底沙',
  water: '慢慢注水',
  gear: '裝上過濾器和加熱棒',
  light: '開燈！',
  done: '',
};
