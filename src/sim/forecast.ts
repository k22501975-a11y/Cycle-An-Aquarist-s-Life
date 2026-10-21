import { linkTanks } from './household';
import { hasSteadyFood } from './feeders';
import { freeAmmonia, hoursUntilStarving, ICH_CAUSE_LABELS } from './processes/fauna';
import { FISH_SPECIES } from './species';
import { TICK_HOURS, step } from './step';
import type { IchCause, SimEvent, TankState } from './state';

/**
 * 推播用的預測（GAME_DESIGN 第 11 節）：模擬是確定的（亂數狀態存在缸裡），
 * 所以玩家關掉遊戲後會發生什麼，可以先在複本上跑一遍。離線補算的結果和這裡一樣，
 * 只要玩家不插手，預測就會成真。
 */

/** 危機預設開啟；繁殖、市場、好友可以各自開關（2026-10-18 定案）。 */
export type AlertCategory = 'crisis' | 'breeding' | 'market' | 'friends';

export interface ForecastAlert {
  /** 從現在起幾個遊戲小時後。 */
  hours: number;
  category: AlertCategory;
  tank: number;
  /** 同一缸同一種事只通知一次。 */
  key: string;
  body: string;
}

/** 預設看多遠（遊戲小時）：72 小時約現實 10 小時，夠睡一覺。 */
export const FORECAST_HOURS = 72;
/** 開始難受的門檻，比真的傷身體的門檻低一點，留時間給玩家處理。 */
const NH3_WARN = 0.03;
const NO2_WARN = 0.8;
const O2_WARN = 3;

function tankName(tanks: TankState[], i: number): string {
  if (tanks.length <= 1) return '';
  return `${tanks[i].label ?? `第 ${i + 1} 缸`}：`;
}

function speciesOf(state: TankState, id?: number): string {
  const f = state.fish.find((x) => x.id === id) ?? state.quarantine?.fish.find((x) => x.id === id);
  return f ? FISH_SPECIES[f.species].name : '一條魚';
}

function eventAlert(state: TankState, e: SimEvent): Omit<ForecastAlert, 'hours' | 'tank'> | null {
  switch (e.type) {
    case 'fish_died':
      return { category: 'crisis', key: 'died', body: `${speciesOf(state, e.subjectId)}撐不住死了。打開遊戲看看是什麼原因，其他魚可能也有危險。` };
    case 'ich_visible':
      return {
        category: 'crisis',
        key: 'ich',
        body: `${speciesOf(state, e.subjectId)}身上出現白點，要趕快處理，不然會傳染整缸。${e.cause && e.cause in ICH_CAUSE_LABELS ? `原因：${ICH_CAUSE_LABELS[e.cause as IchCause]}。` : ''}`,
      };
    case 'disease_visible':
      return { category: 'crisis', key: 'disease', body: `${speciesOf(state, e.subjectId)}看起來生病了（${e.cause === 'columnaris' ? '身上長白色棉絮' : '鰓蓋張開、呼吸很急'}）。` };
    case 'heater_broke':
      return { category: 'crisis', key: 'heater', body: '加熱棒壞了，水溫會一直往下掉。' };
    case 'heater_stuck':
      return { category: 'crisis', key: 'heater', body: '加熱棒卡住一直加熱，水溫越來越高！' };
    case 'heater_exposed':
      return { category: 'crisis', key: 'level', body: '水位太低，加熱棒露出水面了，記得加水。' };
    case 'power_out':
      return { category: 'crisis', key: 'power', body: '停電了，過濾和加熱都停了。' };
    case 'betta_fight':
      return { category: 'crisis', key: 'fight', body: '兩尾公鬥魚在打架，打輸的撐不了幾天，快把牠們分開。' };
    case 'betta_chase_female':
      return { category: 'crisis', key: 'nest', body: '公鬥魚在顧泡巢，一直追咬母魚。快把母魚撈到別缸。' };
    case 'brood_laid':
      return e.cause === 'bubble' ? { category: 'breeding', key: 'nest', body: '鬥魚在泡巢產卵了！把母魚撈走，公魚會自己顧卵。' } : null;
    case 'brood_left':
      return speciesOf(state, e.subjectId) === '鬥魚' ? { category: 'breeding', key: 'nest', body: '小鬥魚會自己游了，該把公魚撈走，不然牠會吃小魚。' } : null;
    case 'fry_born':
      return { category: 'breeding', key: 'fry', body: `生了 ${e.count ?? '幾'} 尾仔${speciesOf(state, e.subjectId).includes('蝦') ? '蝦' : '魚'}！成魚會吃小的，記得多種水草讓牠們躲。` };
    default:
      return null;
  }
}

function conditionAlerts(state: TankState): Omit<ForecastAlert, 'hours' | 'tank'>[] {
  const alive = state.fish.filter((f) => f.alive);
  if (alive.length === 0) return [];
  const out: Omit<ForecastAlert, 'hours' | 'tank'>[] = [];
  const w = state.water;
  if (freeAmmonia(state) > NH3_WARN) out.push({ category: 'crisis', key: 'ammonia', body: '氨快速升高，魚開始難受了。換水可以救回來。' });
  if (w.no2 > NO2_WARN) out.push({ category: 'crisis', key: 'nitrite', body: '亞硝酸鹽偏高，魚呼吸會越來越困難。先換一次水。' });
  if (w.o2 < O2_WARN) out.push({ category: 'crisis', key: 'oxygen', body: '水裡的氧氣不夠了，魚會浮到水面喘氣。' });
  const species = new Set(alive.map((f) => f.species));
  for (const id of species) {
    const t = FISH_SPECIES[id].temp;
    if (w.tempC > t.max + 1) out.push({ category: 'crisis', key: 'hot', body: `水溫 ${w.tempC.toFixed(1)}°C，對${FISH_SPECIES[id].name}太熱了。` });
    else if (w.tempC < t.min - 1) out.push({ category: 'crisis', key: 'cold', body: `水溫 ${w.tempC.toFixed(1)}°C，對${FISH_SPECIES[id].name}太冷了。` });
  }
  if (alive.some((f) => f.starvingHours > 0)) out.push({ category: 'crisis', key: 'hungry', body: '魚餓壞了，記得餵食。' });
  else if (alive.some((f) => f.hunger > 0.8)) out.push({ category: 'crisis', key: 'peckish', body: '魚這幾天沒吃飽，再這樣下去抵抗力會變差，容易生病。' });
  return out;
}

/**
 * 在複本上往後模擬 hoursAhead 個遊戲小時，列出會發生的事（每缸每種事只取第一次）。
 * 一開始就已經存在的狀況（例如現在氨已經偏高）不算，玩家正看著。
 */
export function forecast(tanks: TankState[], hoursAhead = FORECAST_HOURS): ForecastAlert[] {
  const copies: TankState[] = JSON.parse(JSON.stringify(tanks));
  linkTanks(copies);
  const seen = new Set<string>();
  copies.forEach((t, i) => conditionAlerts(t).forEach((a) => seen.add(`${i}:${a.key}`)));
  const out: ForecastAlert[] = [];
  const ticksPerHour = Math.round(1 / TICK_HOURS);
  for (let h = 1; h <= hoursAhead; h++) {
    const before = copies.map((t) => t.hours);
    for (let k = 0; k < ticksPerHour; k++) for (const t of copies) step(t);
    copies.forEach((t, i) => {
      const fresh = t.events.filter((e) => e.hours > before[i]);
      const found = [...fresh.map((e) => eventAlert(t, e)).filter((a): a is NonNullable<typeof a> => a !== null), ...conditionAlerts(t)];
      for (const a of found) {
        const id = `${i}:${a.key}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ ...a, hours: h, tank: i, body: tankName(copies, i) + a.body });
      }
    });
  }
  // 沒有餵食器、飼料錠的缸：都不餵的話幾天後會開始餓死，提前一天提醒（離線時間照常跑，mvp.md §4.7）
  tanks.forEach((t, i) => {
    const alive = t.fish.filter((f) => f.alive);
    if (alive.length === 0 || hasSteadyFood(t)) return;
    const hours = Math.min(...alive.map((f) => hoursUntilStarving(t, f)));
    if (hours <= hoursAhead || hours > STARVE_NOTICE_HOURS) return;
    out.push({ hours: Math.round(hours - 24), category: 'crisis', tank: i, key: 'starve', body: tankName(tanks, i) + '魚明天開始會餓壞，打開遊戲餵一下。出遠門前可以放假期飼料錠或裝自動餵食器。' });
  });
  return out;
}

/** 離線補算最多兩週，再遠的餓死提醒不排。 */
const STARVE_NOTICE_HOURS = 14 * 24;
