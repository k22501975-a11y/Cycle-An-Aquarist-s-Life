import { tankLabel } from './household';
import { crowdingRatio } from './processes/fauna';
import type { TankState } from './state';

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
  /** water：多換水撐了 3 天的結果；split：公母分開後每週那缸生了幾窩（weekly 是第幾週）。 */
  kind?: 'water' | 'split';
  weekly?: number;
  /** split：從什麼時候開始算（遊戲小時）。 */
  since?: number;
}

/** 早上報告一行回音。 */
export interface EchoLine {
  tank: number;
  label: string;
  text: string;
}

/** 公母分開後每週回報幾次（之後就不說了）。 */
export const SPLIT_ECHO_WEEKS = 4;

/** 這缸現在是建議量的幾 %（CROWD_FULL = 1 是 100%）。 */
export const crowdPct = (t: TankState) => Math.round(crowdingRatio(t) * 100);

/** 記一筆回音（選完就呼叫）。 */
export function addEcho(s: { echoes?: Echo[] }, echo: Echo): void {
  (s.echoes ??= []).push(echo);
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
    }
  }
  s.echoes = keep;
  return out;
}
