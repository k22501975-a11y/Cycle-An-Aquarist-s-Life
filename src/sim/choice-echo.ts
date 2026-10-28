import { tankLabel } from './household';
import { crowdingRatio } from './processes/fauna';
import type { Fish, TankState } from './state';

/**
 * 選擇的回音（polish-to-9.md §10.0）：每張選擇卡選完 3 個遊戲天內，早上報告出一行帶數字的結果；
 * 結果還在發生的（例如公母分開），之後每週最多再一行。
 * 選的時候記一筆在 ChoiceState.echoes，早上報告用 takeEchoes 取出到期的。
 */
export interface Echo {
  /** 玩家選的那個選項（畫面在那行前面寫「你選了：…」）。 */
  label: string;
  tank: number;
  /** 什麼時候可以出（遊戲小時）。 */
  due: number;
  /** 選的當下就算好的結果；沒有就照 kind 到時候再算。 */
  text?: string;
  /**
   * water：多換水撐了 3 天的結果；split：公母分開後每週那缸生了幾窩（weekly 是第幾週）。
   * box、hide：第一窩放育幼盒、躲草之後還剩幾尾；brood：第一窩第 14 天的總結；grow：C9 那窩留在缸裡，缸現在多擠。
   */
  kind?: 'water' | 'split' | 'box' | 'hide' | 'brood' | 'grow';
  weekly?: number;
  /** split：從什麼時候開始算；hide：選的時間（遊戲小時）。 */
  since?: number;
  /** box、hide、brood、grow：那窩小魚是哪幾尾。 */
  ids?: number[];
  /** hide：上一次回音時還有幾尾。 */
  prev?: number;
  /** hide：這次是 HIDE_ECHO_DAYS 的第幾個。 */
  step?: number;
}

/** 早上報告一行回音。 */
export interface EchoLine {
  tank: number;
  label: string;
  text: string;
}

/** 公母分開後每週回報幾次（之後就不說了）。 */
export const SPLIT_ECHO_WEEKS = 4;

/** 缸裡超過建議量的幾成，C9 回音就多說「再一窩就住不下了」。 */
export const CROWD_ALMOST = 0.8;

/** 躲草的回音在選完後第幾天出（polish-to-9.md §10.1）。 */
export const HIDE_ECHO_DAYS = [1, 3, 7];
/** 第一窩出生後第幾天出總結。 */
export const BROOD_SUMMARY_DAYS = 14;
/** 選了躲草之後幾天內，任務卡不叫玩家撈小魚、買第二缸（被吃到剩一半才叫）。 */
export const HIDE_GRACE_DAYS = 3;

/** 這幾尾裡還活著的。 */
const aliveOf = (tanks: TankState[], ids: readonly number[]): Fish[] => {
  const want = new Set(ids);
  return tanks.flatMap((t) => t.fish.filter((f) => f.alive && want.has(f.id)));
};

/** C1 選了躲草、還在 3 天內、小魚沒被吃到剩一半：任務卡先不要叫玩家撈小魚或買缸。 */
export function hideGrace(tanks: TankState[], s: { hide?: { at: number; ids: number[] } } | undefined): boolean {
  const h = s?.hide;
  if (!h || (tanks[0]?.hours ?? 0) - h.at >= HIDE_GRACE_DAYS * 24) return false;
  return aliveOf(tanks, h.ids).length * 2 > h.ids.length;
}

/** 這缸現在是建議量的幾 %（CROWD_FULL = 1 是 100%）。 */
export const crowdPct = (t: TankState) => Math.round(crowdingRatio(t) * 100);

/** 記一筆回音（選完就呼叫）。 */
export function addEcho(s: { echoes?: Echo[] }, echo: Echo): void {
  (s.echoes ??= []).push(echo);
}

/** 收掉第 index 缸（removeTank）：那缸的回音不出了，後面的缸往前移一格。 */
export function dropTankEchoes(s: { echoes?: Echo[] } | undefined, index: number): void {
  if (!s?.echoes) return;
  s.echoes = s.echoes.filter((e) => e.tank !== index).map((e) => (e.tank > index ? { ...e, tank: e.tank - 1 } : e));
}

/** 這段時間（since～現在）這缸生了幾窩。 */
const broodsSince = (t: TankState, since: number) => t.events.filter((e) => e.type === 'fry_born' && e.hours >= since).length;

/** 取出到期的回音（早上報告呼叫一次）。週期的會排下一次。 */
export function takeEchoes(tanks: TankState[], s: { echoes?: Echo[] }): EchoLine[] {
  const now = tanks[0]?.hours ?? 0;
  const out: EchoLine[] = [];
  const keep: Echo[] = [];
  for (const e of s.echoes ?? []) {
    const t = tanks[e.tank];
    if (!t) continue;
    if (e.due > now) {
      keep.push(e);
      continue;
    }
    const name = tankLabel(tanks, e.tank);
    if (e.text) out.push({ tank: e.tank, label: e.label, text: e.text });
    else if (e.kind === 'water') {
      const ammonia = Math.round(t.water.tan * 100) / 100;
      out.push({ tank: e.tank, label: e.label, text: crowdingRatio(t) >= 1 ? `多換水撐了 3 天，魚還是太多，水又髒回來了（氨 ${ammonia}）` : `多換水撐了 3 天，${name}現在 ${crowdPct(t)}%，不擠了` });
    } else if (e.kind === 'split') {
      const since = e.since ?? now - 7 * 24;
      const here = broodsSince(t, since);
      const other = tanks.reduce((n, x, i) => (i === e.tank ? n : n + broodsSince(x, since)), 0);
      out.push({ tank: e.tank, label: e.label, text: `${name}這週 ${here} 窩${tanks.length > 1 ? `，別缸 ${other} 窩` : ''}` });
      const week = (e.weekly ?? 0) + 1;
      if (week < SPLIT_ECHO_WEEKS) keep.push({ ...e, due: now + 7 * 24, since: now, weekly: week, text: undefined });
    } else if (e.kind === 'box') {
      const left = aliveOf(tanks, e.ids ?? []);
      const inBox = left.filter((f) => f.nursery).length;
      if (inBox > 0) out.push({ tank: e.tank, label: e.label, text: `盒裡${left.length === e.ids?.length ? ` ${inBox} 尾都在` : `還有 ${inBox} 尾`}，有點擠，長得慢一點` });
    } else if (e.kind === 'hide') {
      const step = e.step ?? 0;
      const left = aliveOf(tanks, e.ids ?? []).length;
      const lost = Math.max(0, (e.prev ?? left) - left);
      const when = step === 0 ? '昨晚' : `這 ${HIDE_ECHO_DAYS[step] - HIDE_ECHO_DAYS[step - 1]} 天`;
      const text = left === 0 ? `${when}躲草的小魚少了 ${lost} 尾，一尾都不剩了` : lost === 0 ? `${when}躲草的小魚一尾都沒少，還有 ${left} 尾` : `${when}躲草的小魚少了 ${lost} 尾，還有 ${left} 尾`;
      out.push({ tank: e.tank, label: e.label, text });
      const next = HIDE_ECHO_DAYS[step + 1];
      if (left > 0 && next !== undefined) keep.push({ ...e, due: (e.since ?? now) + next * 24, prev: left, step: step + 1 });
    } else if (e.kind === 'grow') {
      const left = aliveOf(tanks, e.ids ?? []).length;
      const pct = crowdPct(t);
      if (left > 0) out.push({ tank: e.tank, label: e.label, text: `這窩 ${left} 尾留在${name}，缸裡現在 ${t.fish.filter((f) => f.alive).length} 尾（建議量 ${pct}%）${pct > CROWD_ALMOST * 100 ? '，再一窩就住不下了' : ''}` });
    } else if (e.kind === 'brood') {
      const left = aliveOf(tanks, e.ids ?? []);
      const big = left.reduce((m, f) => Math.max(m, f.lengthCm), 0);
      out.push({ tank: e.tank, label: e.label, text: left.length === 0 ? '第一窩：一尾都沒留下來' : `第一窩：還有 ${left.length} 尾，最大的 ${big.toFixed(1)} cm` });
    }
  }
  s.echoes = keep;
  return out;
}
