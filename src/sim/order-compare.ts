import { tankLabel } from './household';
import { orderTargetCm, orderBoard, orderUnit, type ShopOrder } from './orders';
import { isShrimpSpecies } from './species';
import { type TankState } from './state';
import { type OrderOutlook, orderOutlook } from './order-outlook';

// 訂單板上的比較和說明句：只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
/** 板上有 2 張以上的單才比較（一張單沒什麼好比）；回傳每張單的比較資料，順序跟板上一樣。 */
export function compareOrders(tanks: TankState[], keep: readonly number[] = []): OrderOutlook[] {
  const orders = orderBoard(tanks[0]).orders;
  if (orders.length < 2) return [];
  const list = orders.map((o) => orderOutlook(tanks, o, keep));
  for (const a of list) {
    const ids = new Set(a.fish.map((f) => f.id));
    a.sharesWith = list.filter((b) => b !== a && b.fish.some((f) => ids.has(f.id))).map((b) => b.orderId);
  }
  return list;
}

/** 卡片上的「所需天數」：現在就能交／修剪一下就能交／再養約 N 天／來不及／估不出來的原因。 */
export function outlookDaysLine(x: OrderOutlook, o: ShopOrder): string {
  if (x.trim) return '修剪一下就能交';
  if (x.days === 0) return '現在就能交';
  if (x.late && o.kind === 'snail') return `小螺約 ${x.days} 天後才生夠，單子剩 ${x.daysLeft} 天`;
  if (x.late) {
    // 交不出的單寫原因和預估時間（mvp.md §4.4.5 第 5 點），例如「中魚 2.3 cm：最快那尾約 9 天後，單子剩 4 天」
    const shrimp = o.species !== undefined && isShrimpSpecies(o.species);
    const what = o.kind === 'fry' ? '小孔雀' : o.size === 'adult' ? (shrimp ? '成蝦' : '成魚') : shrimp ? '幼蝦' : '中魚';
    const need = o.count - x.have;
    const when = need <= 1 ? `最快那尾約 ${x.days} 天後` : `湊齊 ${need} ${orderUnit(o)}約 ${x.days} 天後`;
    return `${what} ${Number(orderTargetCm(o).toFixed(1))} cm：${when}，單子剩 ${x.daysLeft} 天`;
  }
  if (x.days !== null) return o.kind === 'snail' ? `小螺還在生，約 ${x.days} 天` : `再養約 ${x.days} 天`;
  if (o.kind === 'cutting') return '等水草長高再剪';
  if (o.kind === 'snail') return x.firstPlant ? '買第一株水草會附螺，養幾天就夠' : '等螺再多生一些';
  return '缸裡還沒有養得成的魚';
}

/** 卡片上的「要用的魚」：從哪幾缸挑幾尾（只有一缸就不寫缸名）；插枝、螺回傳 null。 */
export function outlookFishLine(tanks: TankState[], x: OrderOutlook, o: ShopOrder): string | null {
  if (x.fish.length === 0) return null;
  const unit = orderUnit(o);
  const byTank = new Map<number, number>();
  for (const f of x.fish) byTank.set(f.tank, (byTank.get(f.tank) ?? 0) + 1);
  const growing = x.fish.filter((f) => f.days > 0).length;
  const where = tanks.length > 1 ? [...byTank].map(([t, n]) => `${tankLabel(tanks, t)} ${n} ${unit}`).join('＋') : `${x.fish.length} ${unit}`;
  return `用${where}${growing > 0 ? `（${growing} ${unit}還在長）` : ''}`;
}
