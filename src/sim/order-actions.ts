import { economy, noteBredSale, noteEarned } from './economy';
import { growthStage } from './growth';
import { isShrimpSpecies } from './species';
import type { Fish, TankState } from './state';
import { matchingFish, orderBoard, orderRefusal, spareSnails } from './orders';

// 交單、撕單：玩家在訂單板上按的動作。只有訂單板（延後載入的面板）用得到，跟 orders.ts 分開，不進開機必載（docs/performance-budget.md）。
/**
 * 交單：從所有缸挑符合的魚（或手上的插枝）交出去，回傳拿到多少錢（交不了回傳 0）。
 * 不算在每天的收購次數裡。keep 是玩家標記要留下來的魚。
 */
export function fulfillOrder(tanks: TankState[], orderId: number, keep: readonly number[] = []): number {
  if (orderRefusal(tanks, orderId, keep)) return 0;
  const state = tanks[0];
  const board = orderBoard(state);
  const o = board.orders.find((x) => x.id === orderId)!;
  let firstGiven: Fish | undefined;
  if (o.kind === 'cutting') economy(state).cuttings[o.plant!]! -= o.count;
  else if (o.kind === 'snail') {
    let left = o.count;
    for (const t of tanks) {
      const give = Math.min(left, spareSnails(t, o.snail!));
      if (give <= 0) continue;
      left -= give;
      if (o.snail === 'appleYoung') t.snails!.appleYoung -= give;
      else t.snails!.pests[o.snail!] -= give;
    }
  } else {
    let left = o.count;
    for (const t of tanks) {
      const give = new Set(matchingFish(t, o, keep).slice(0, left));
      firstGiven ??= give.values().next().value;
      left -= give.size;
      for (const f of give) noteRaisedGone(state, f);
      t.fish = t.fish.filter((f) => !give.has(f));
      if (t.quarantine) t.quarantine.fish = t.quarantine.fish.filter((f) => !give.has(f));
      if (t.tub) t.tub.fish = t.tub.fish.filter((f) => !give.has(f));
    }
  }
  const coins = o.count * o.unitPrice;
  economy(state).coins += coins;
  if (firstGiven) noteBredSale(state, firstGiven, coins, 'order');
  noteEarned(state, coins);
  board.orders = board.orders.filter((x) => x !== o);
  board.done += 1;
  board.earned += coins;
  board.lastChangeHours = state.hours;
  board.fillCheckedHour = undefined;
  return coins;
}

/** 不想做的單可以撕掉，隔天補一張新的。 */
export function dismissOrder(state: TankState, orderId: number): boolean {
  const board = orderBoard(state);
  const before = board.orders.length;
  // 預告卡撕不掉（§4.4.5）：它是告訴玩家之後要往哪裡走
  board.orders = board.orders.filter((x) => x.id !== orderId || x.preview);
  if (board.orders.length === before) return false;
  board.lastChangeHours = state.hours;
  board.fillCheckedHour = undefined;
  return true;
}

/**
 * 交訂單的魚如果是自己繁殖、養過仔魚期的，記一筆（#183）：中魚單常把剛長大的魚拿走，目標「養大 5 條」不會因此倒退。
 * 賣給店家的不算：那是玩家自己選擇換錢，目標本來就要留著魚看轉色。
 */
export function noteRaisedGone(state: TankState, fish: Fish): void {
  // 已經轉色過的算在 raisedEver 裡了
  if (fish.raisedSeen || (fish.generation ?? 0) < 1 || isShrimpSpecies(fish.species) || growthStage(fish) === 'fry') return;
  const e = economy(state);
  e.raisedGone = (e.raisedGone ?? 0) + 1;
}
