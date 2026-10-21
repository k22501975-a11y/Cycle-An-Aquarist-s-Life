import { isCycled } from './processes/nitrogen';
import { testWater } from './readings';
import type { TankState } from './state';

/**
 * 開缸挑的設備有後果（design/polish-to-9.md G5）：開缸後第 3～10 天，早上報告每天最多說一句「這是你挑的設備造成的」，
 * 例如「外掛過濾菌量夠，氨已經歸零」「水草泥讓 pH 降到 6.6」。便宜、推薦、高階三種開局說法不同，玩家看得出選擇有差。
 * 每種設備只說一次，說過的記在缸上（gearNotes）。數值照測試劑讀數，玩家量得到的才說。
 */

/** 開缸後第幾天之間才說（缸的年紀，從鋪底材那一刻算）。 */
export const GEAR_NOTE_DAYS = { from: 3, to: 10 } as const;

export type GearNoteKey = 'filter' | 'substrate' | 'heater' | 'light' | 'air';

export interface GearNote {
  key: GearNoteKey;
  text: string;
}

/** 缸開了第幾天（第 1 天是開缸當天）。舊存檔沒有底材紀錄就從 0 小時算。 */
export function tankAgeDay(state: TankState): number {
  return Math.floor((state.hours - (state.equipment.substrate?.sinceHours ?? 0)) / 24) + 1;
}

const one = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

/** 每種設備現在說得出什麼後果；還看不出來就回 null（之後幾天再說）。 */
const NOTES: Record<GearNoteKey, (s: TankState) => string | null> = {
  filter: (s) => {
    const f = s.equipment.filter;
    if (!f || !s.fish.some((x) => x.alive)) return null;
    if (isCycled(s)) {
      if (f.spec.id === 'sponge') return '水妖精的菌剛好夠這幾條魚，之後加魚要多換水';
      if (f.spec.id === 'canister') return '圓桶過濾菌量大，氨早就歸零，多養幾條也撐得住';
      return `${f.spec.name}的菌量夠，氨和亞硝已經歸零`;
    }
    // 菌住得少的過濾器養水比較慢，第 5 天還沒好就先說
    if (f.spec.id === 'sponge' && tankAgeDay(s) >= 5) return '水妖精住的菌比較少，水養得慢一點，這幾天每天測水';
    return null;
  },
  substrate: (s) => {
    const sub = s.equipment.substrate?.spec;
    const ph = testWater(s).ph;
    if (sub?.id === 'soil') return ph <= 6.8 ? `水草泥讓 pH 降到 ${ph}，水草和米蝦很喜歡` : null;
    if (sub?.id === 'coral') return `珊瑚砂把 pH 撐在 ${ph}，偏硬的水孔雀魚很適應`;
    return `石英砂不改水質，pH 一直穩在 ${ph}`;
  },
  heater: (s) => {
    const h = s.equipment.heater;
    if (!h || h.broken || h.stuckOn) return null;
    const gap = h.targetC - s.water.tempAvgC;
    if (gap > 0.7) return `${h.spec.name}拉不太動，水溫只有 ${one(s.water.tempAvgC)}°C，魚和菌都長得慢一點`;
    // 比設定還熱（夏天、燈太熱）不是加熱棒的功勞，不說
    return gap >= -0.7 ? `${h.spec.name}把水溫穩在 ${one(s.water.tempAvgC)}°C，一天差不到 1 度` : null;
  },
  light: (s) => {
    const l = s.equipment.light;
    if (!l || s.plants.length === 0) return null;
    return l.spec.id === 'planted' ? '水草燈光線強，水草長得快，陽性草也種得起來' : '基本燈光線柔，榕和莫絲這種陰性草長得好，陽性草會長不起來';
  },
  air: (s) => {
    const a = s.equipment.airPump;
    if (!a?.on || !s.fish.some((x) => x.alive)) return null;
    return `打氣機讓水裡氧氣足（${one(s.water.o2)} mg/L），魚不會浮頭`;
  },
};

/** 說的順序：最能看出三種開局差在哪的先說。 */
const ORDER: GearNoteKey[] = ['filter', 'substrate', 'heater', 'light', 'air'];

/** 今天早上可以說的那句（不記錄）；不在第 3～10 天、都說過了或還看不出後果就回 null。 */
export function gearNote(state: TankState): GearNote | null {
  const day = tankAgeDay(state);
  if (day < GEAR_NOTE_DAYS.from || day > GEAR_NOTE_DAYS.to) return null;
  const said = state.gearNotes ?? [];
  for (const key of ORDER) {
    if (said.includes(key)) continue;
    const text = NOTES[key](state);
    if (text) return { key, text };
  }
  return null;
}

/** 早上報告用：拿今天那句並記成說過了（每種設備只說一次）。 */
export function takeGearNote(state: TankState): GearNote | null {
  const note = gearNote(state);
  if (note) state.gearNotes = [...(state.gearNotes ?? []), note.key];
  return note;
}
