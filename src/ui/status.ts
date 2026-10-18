import { FISH_SPECIES, GAME_SECONDS_PER_DAY, observeSymptoms, PLANT_SPECIES, type TankState, type TestKitReading } from '../sim';

/**
 * 狀態列與待辦卡要顯示的內容（純函式，不碰 DOM，方便測試）。
 * 玩家只看得到測試劑測過的數值：沒測過顯示「?」，太久沒測也變回「?」。
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'unknown';

export const READING_TONES: Record<keyof TestKitReading, (v: number) => Tone> = {
  ammonia: (v) => (v === 0 ? 'ok' : v <= 0.25 ? 'warn' : 'bad'),
  nitrite: (v) => (v === 0 ? 'ok' : v <= 0.25 ? 'warn' : 'bad'),
  nitrate: (v) => (v <= 20 ? 'ok' : v <= 40 ? 'warn' : 'bad'),
  ph: (v) => (v >= 6.6 && v <= 8 ? 'ok' : 'warn'),
  kh: (v) => (v >= 3 ? 'ok' : v >= 1 ? 'warn' : 'bad'),
};

export interface Capsule {
  label: string;
  value: string;
  tone: Tone;
  /** 讀數超過一天，可能已經不準了（顯示得淡一點）。 */
  stale: boolean;
  title: string;
}

/** 測試劑讀數多久之後視為不知道（遊戲小時）。 */
export const TEST_FORGET_HOURS = 72;
const TEST_STALE_HOURS = 24;

function temperatureTone(state: TankState): Tone {
  const t = state.water.tempC;
  let tone: Tone = 'ok';
  for (const species of new Set(state.fish.filter((f) => f.alive).map((f) => f.species))) {
    const { min, max } = FISH_SPECIES[species].temp;
    const off = Math.max(min - t, t - max);
    if (off > 2) return 'bad';
    if (off > 0) tone = 'warn';
  }
  return tone;
}

export function waterCapsules(state: TankState): Capsule[] {
  const caps: Capsule[] = [
    { label: '溫度', value: `${state.water.tempC.toFixed(1)}°C`, tone: temperatureTone(state), stale: false, title: '溫度計隨時看得到' },
  ];
  const test = state.lastTest;
  const age = test ? state.hours - test.hours : Infinity;
  const known = age <= TEST_FORGET_HOURS;
  const stale = known && age > TEST_STALE_HOURS;
  const title = !test ? '還沒測過，點「測試」用測試劑測水' : known ? `${Math.floor(age / 24) > 0 ? `${Math.floor(age / 24)} 天前` : '今天'}測的` : '太久沒測了，數值可能變了';
  const row = (label: string, key: keyof TestKitReading) => {
    const v = test?.reading[key];
    caps.push({
      label,
      value: known && v !== undefined ? String(v) : '?',
      tone: known && v !== undefined && !stale ? READING_TONES[key](v) : 'unknown',
      stale,
      title,
    });
  };
  row('pH', 'ph');
  row('氨', 'ammonia');
  row('亞硝', 'nitrite');
  row('硝酸', 'nitrate');
  return caps;
}

/** 「第 3 週・週二 14:05」：第 1 天是第 1 週的週一。 */
export function clockLabel(hours: number): string {
  const t = hours * 3600;
  const dayIndex = Math.floor(t / GAME_SECONDS_PER_DAY);
  const week = Math.floor(dayIndex / 7) + 1;
  const weekday = '一二三四五六日'[dayIndex % 7];
  const hh = Math.floor((t % GAME_SECONDS_PER_DAY) / 3600);
  const mm = Math.floor((t % 3600) / 60);
  return `第 ${week} 週・週${weekday} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface Todo {
  text: string;
  tone: 'bad' | 'warn' | 'ok';
}

/** 待辦卡：今天該做的事，嚴重的排前面。只用玩家看得到的資訊（症狀、死魚、設備狀態、自己做過的事）。 */
export function todos(state: TankState): Todo[] {
  const out: Todo[] = [];
  const living = state.fish.filter((f) => f.alive);
  const dead = state.fish.length - living.length;
  const eq = state.equipment;
  if (state.environment.powerOut) out.push({ text: '停電中，設備都停了', tone: 'bad' });
  if (dead > 0) out.push({ text: `撈出 ${dead} 條死魚`, tone: 'bad' });
  if (eq.heater?.stuckOn) out.push({ text: '加熱棒卡住了，快拔插頭', tone: 'bad' });
  else if (eq.heater?.broken) out.push({ text: '加熱棒壞了，換一支', tone: 'bad' });
  const symptoms = living.map((f) => ({ fish: f, s: observeSymptoms(state, f) }));
  if (symptoms.some((x) => x.s.includes('white_spots'))) out.push({ text: '有魚身上出現白點', tone: 'bad' });
  if (symptoms.some((x) => x.s.includes('gasping'))) out.push({ text: '魚在水面喘氣', tone: 'bad' });

  // 水溫超出缸裡魚種的適溫範圍（以最怕熱、最怕冷的那種為準）
  if (living.length > 0) {
    const t = state.water.tempC;
    const hottest = Math.min(...living.map((f) => FISH_SPECIES[f.species].temp.max));
    const coldest = Math.max(...living.map((f) => FISH_SPECIES[f.species].temp.min));
    if (t > hottest + 0.5) out.push({ text: `水溫偏高（${t.toFixed(1)}°C），開風扇或冷水機`, tone: t > hottest + 2 ? 'bad' : 'warn' });
    else if (t < coldest - 0.5) out.push({ text: `水溫偏低（${t.toFixed(1)}°C），檢查加熱棒`, tone: t < coldest - 2 ? 'bad' : 'warn' });
  }
  const level = (state.water.levelL ?? eq.tank.volumeL) / eq.tank.volumeL;
  if (level < 0.9) out.push({ text: `水位降到 ${Math.round(level * 100)}%，該補水了`, tone: level < 0.8 && eq.heater ? 'bad' : 'warn' });

  if (living.length > 0) {
    const testAge = state.lastTest ? state.hours - state.lastTest.hours : Infinity;
    if (testAge === Infinity) out.push({ text: '還沒測過水質', tone: 'warn' });
    else if (testAge > TEST_FORGET_HOURS) out.push({ text: `${Math.floor(testAge / 24)} 天沒測水了`, tone: 'warn' });
    const sinceChange = state.hours - (state.lastWaterChangeHours ?? 0);
    if (sinceChange > 7 * 24) out.push({ text: `該換水了（${Math.floor(sinceChange / 24)} 天沒換）`, tone: 'warn' });
    const hunger = living.reduce((sum, f) => sum + f.hunger, 0) / living.length;
    if (hunger > 0.5) out.push({ text: '魚餓了，該餵食', tone: 'warn' });
  }

  const pregnant = symptoms.filter((x) => x.s.includes('pregnant'));
  const guppies = pregnant.filter((x) => x.fish.species !== 'cherry_shrimp').length;
  const shrimp = state.fish.filter((f) => f.alive && f.species === 'cherry_shrimp' && f.pregnancy > 0).length;
  if (guppies > 0) out.push({ text: `${guppies} 條母魚肚子鼓鼓的，快生了`, tone: 'ok' });
  if (shrimp > 0) out.push({ text: `${shrimp} 隻母蝦正在抱卵`, tone: 'ok' });
  if (state.plants.some((p) => p.biomassG - PLANT_SPECIES[p.species].maxBiomassG * 0.5 >= PLANT_SPECIES[p.species].cuttingMassG && p.biomassG >= PLANT_SPECIES[p.species].maxBiomassG))
    out.push({ text: '水草長滿了，可以修剪', tone: 'ok' });

  if (out.length === 0) out.push({ text: living.length === 0 ? '去商店買魚和水草吧' : '一切正常', tone: 'ok' });
  const rank = { bad: 0, warn: 1, ok: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
