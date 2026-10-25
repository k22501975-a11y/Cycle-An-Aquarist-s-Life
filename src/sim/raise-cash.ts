import { buybackRefusal, economy, fishBuybackPrice, loanPayment, sellsLeftToday } from './economy';
import { orderOutlook } from './order-outlook';
import { orderBoard, orderRefusal } from './orders';
import { isJuvenile, type Fish, type TankState } from './state';

/** 板上有沒有一張現在就交得出來的單（預告單不算）。 */
export function canDeliverAnyOrder(tanks: TankState[]): boolean {
  return orderBoard(tanks[0]).orders.some((o) => !o.preview && orderRefusal(tanks, o.id) === null);
}

/**
 * 急著用錢、又沒有交得出的單時（#397：冬天加熱棒壞了、缸裡多是小魚，訂單全要再養十幾天）：今天賣幾尾給水族店湊得到多少。
 * 照賣價高的先賣，今天的收購次數用完就停；coins 是扣掉還阿德的錢之後到手的；留種、選好的種魚、育幼盒裡的不賣，最好的一公一母成魚也留著，之後才生得出來。
 */
export function emergencySale(tanks: TankState[], need: number): { count: number; coins: number; fish: Fish[] } {
  const choices = economy(tanks[0]).choices;
  const pair = new Set([...(choices?.pair ?? []), ...(choices?.sires ?? [])]);
  const priced = tanks
    .flatMap((t) => t.fish)
    .filter((f) => f.alive && !f.nursery && !pair.has(f.id) && !buybackRefusal(f, true))
    .map((f) => ({ f, coins: fishBuybackPrice(f) }))
    .sort((a, b) => b.coins - a.coins);
  // 留最好的一公一母成魚當種
  for (const sex of ['male', 'female'] as const) {
    const i = priced.findIndex((x) => x.f.sex === sex && !isJuvenile(x.f));
    if (i >= 0) priced.splice(i, 1);
  }
  // 還欠阿德加熱棒錢時，每賣一尾照 loanPayment 扣（noteEarned 逐筆扣）：算到手的錢（#404，g31：照任務卡賣了又賣還是不夠）
  let owed = economy(tanks[0]).heaterLoan ?? 0;
  let wallet = economy(tanks[0]).coins;
  const fish: Fish[] = [];
  let coins = 0;
  for (const x of priced.slice(0, sellsLeftToday(tanks[0]))) {
    if (coins >= need) break;
    fish.push(x.f);
    const pay = loanPayment(tanks[0], wallet + x.coins, x.coins, owed);
    owed -= pay;
    wallet += x.coins - pay;
    coins += x.coins - pay;
  }
  return { count: fish.length, coins, fish };
}

/**
 * 錢不夠買急用的東西時該怎麼湊（#388、#391、#397）：有交得出的單就交單；沒有就看今天賣魚湊不湊得到。錢夠回傳 null。
 * what 是要買的東西（例如「換一支加熱棒」），寫成「換一支加熱棒要 350 元（還差 252 元），…」。
 */
export function raiseCashStep(tanks: TankState[], what: string, cost: number): { text: string; target: 'orders' | 'sell'; stuck?: true; enough?: true } | null {
  const short = cost - economy(tanks[0]).coins;
  if (short <= 0) return null;
  const head = `${what}要 ${cost} 元（還差 ${short} 元）`;
  if (canDeliverAnyOrder(tanks)) return { text: `${head}，先交訂單湊錢`, target: 'orders' };
  const sale = emergencySale(tanks, short);
  // 賣了也不夠就寫還差多少，免得以為賣了就夠（g33：還差 333 元，賣 5 尾只拿 32 元）
  if (sale.count > 0)
    return sale.coins >= short
      ? { text: `${head}，賣 ${sale.count} 尾魚給水族店（約 ${sale.coins} 元）湊錢`, target: 'sell', enough: true }
      : { text: `${head}，賣掉今天能賣的 ${sale.count} 尾約 ${sale.coins} 元，還差 ${short - sale.coins} 元`, target: 'sell' };
  // 單交不出、魚也賣不了（stuck 讓呼叫的人知道沒有立刻湊得到的辦法；enough 是今天賣魚就湊得齊）：
  // 說真正卡住的原因，不寫「先交訂單」（#404，g31：單都還要養 16～19 天，照著做是死路）
  return { text: `${head}，${stuckReason(tanks)}`, target: 'orders', stuck: true };
}

/** 今天湊不到錢的原因：收購次數用完、單上的魚還要養幾天，或魚都還太小賣不了。 */
function stuckReason(tanks: TankState[]): string {
  if (sellsLeftToday(tanks[0]) <= 0) return '今天阿德的收購次數用完了，明天再賣魚湊';
  const days = orderBoard(tanks[0])
    .orders.filter((o) => !o.preview)
    .map((o) => orderOutlook(tanks, o).days)
    .filter((d): d is number => d !== null && d > 0);
  if (days.length > 0) return `單上要的魚還要養約 ${Math.min(...days)} 天，今天也沒有魚賣得掉`;
  return '魚都還太小賣不了，也沒有交得出的單';
}
