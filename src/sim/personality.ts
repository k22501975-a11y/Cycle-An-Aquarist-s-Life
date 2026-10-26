import type { Fish } from './state';

/**
 * 魚的個性（design/first-10-minutes.md F6）：每尾魚一個個性標籤，只影響畫面上的小行為
 * （貪吃的先衝、膽小的躲草裡、好奇的游到手指點的地方），不影響遺傳、價格和模擬。
 * 個性由魚的編號決定，不用亂數（不會改變模擬結果），舊存檔的魚也自動有個性；
 * fish.personality 有值時以它為準（商城的「改變個性」之後寫這個欄位）。
 */

export type Personality = 'shy' | 'greedy' | 'showy' | 'curious' | 'lazy';

export const PERSONALITIES: Personality[] = ['shy', 'greedy', 'showy', 'curious', 'lazy'];

export interface PersonalitySpec {
  /** 點魚卡上的標籤。 */
  label: string;
  /** 一句話說明。 */
  blurb: string;
  /** 看到飼料時游過去的速度倍率。 */
  feedRush: number;
  /** 平常游動的速度倍率。 */
  activity: number;
  /** 喜歡待在水草、石頭旁邊的程度（0～1）。 */
  hide: number;
  /** 手指點水面時游過來看的機率（0～1）。 */
  approach: number;
  /** 展鰭、在前景游來游去的頻率（0～1）。 */
  display: number;
}

export const PERSONALITY_SPECS: Record<Personality, PersonalitySpec> = {
  shy: { label: '膽小', blurb: '喜歡躲在水草裡，有人靠近就溜走', feedRush: 0.7, activity: 0.8, hide: 0.8, approach: 0.05, display: 0.1 },
  greedy: { label: '貪吃', blurb: '飼料一下去總是第一個衝過來', feedRush: 1.6, activity: 1.1, hide: 0.2, approach: 0.5, display: 0.3 },
  showy: { label: '愛炫耀', blurb: '常在缸子前面展開尾巴', feedRush: 1, activity: 1.15, hide: 0.1, approach: 0.3, display: 0.9 },
  curious: { label: '好奇', blurb: '手指點哪裡就游過去看看', feedRush: 1.1, activity: 1.05, hide: 0.25, approach: 0.9, display: 0.4 },
  lazy: { label: '懶散', blurb: '喜歡在底層慢慢晃，不太愛動', feedRush: 0.8, activity: 0.6, hide: 0.4, approach: 0.2, display: 0.15 },
};

/** 由編號決定的雜湊（同一尾魚永遠一樣）。 */
function hash(n: number): number {
  let x = Math.imul(n ^ 0x5bd1e995, 0x9e3779b1) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
}

export function personalityOf(fish: Pick<Fish, 'id' | 'personality'>): Personality {
  return fish.personality ?? PERSONALITIES[hash(fish.id) % PERSONALITIES.length];
}

export function personalitySpec(fish: Pick<Fish, 'id' | 'personality'>): PersonalitySpec {
  return PERSONALITY_SPECS[personalityOf(fish)];
}

/** 「貪吃的阿藍第一個吃到」這種小字（name 是玩家取的名字，沒取名就用魚種名）。 */
export function firstBiteText(fish: Pick<Fish, 'id' | 'personality'>, name: string): string {
  return `${personalitySpec(fish).label}的${name}第一個吃到`;
}
