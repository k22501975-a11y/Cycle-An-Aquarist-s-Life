import { mallBag, placeMallTankset, setMallBag, tanksetRefusal, type MallItemId } from '../sim';
import type { Game } from '../game/game';
import type { CloudClient, PointsCatalog } from '../net/cloud';
import type { SoundId } from '../audio/sounds';
import { h } from './dom';
import type { Sheet, Toasts } from './sheet';

/**
 * 商城（design/monetization.md）：台幣儲值成點數，點數買道具。點數和遊戲幣分開，不能換成遊戲幣。
 * 買到的道具由伺服器保管（docs/ledger.md §4），遊戲的背包只是副本；用的時候先跟伺服器扣一個，成功才套用效果。
 */

export interface MallDeps {
  cloud: CloudClient;
  game: Game;
  sheet: Sheet;
  toasts: Toasts;
  sound?: (id: SoundId) => void;
  openCloud: () => void;
}

const points = (n: number) => `${n.toLocaleString('zh-TW')} 點`;

/** 背包照伺服器的庫存更新（登入時）。 */
export async function syncMall(deps: Pick<MallDeps, 'cloud' | 'game'>): Promise<void> {
  const { cloud, game } = deps;
  if (!cloud.session) return;
  const res = await cloud.points();
  if (res.ok) game.actAll((tanks) => setMallBag(tanks, res.value.bag));
}

/**
 * 跟伺服器用掉一個道具；成功才呼叫 apply 套用效果，背包照伺服器剩下的數量覆寫。
 * 斷線時用同一個 requestId 再送一次，伺服器不會扣兩個。回傳 null 表示成功，不然是給玩家看的原因。
 */
export async function useMallItem(deps: Pick<MallDeps, 'cloud' | 'game'>, item: MallItemId, apply: () => boolean): Promise<string | null> {
  const { cloud, game } = deps;
  if (!cloud.session) return '商城道具存在帳號裡，要先登入雲端存檔才能用';
  const requestId = crypto.randomUUID();
  let res = await cloud.pointsUse(item, requestId);
  if (!res.ok && res.code === 'offline') res = await cloud.pointsUse(item, requestId);
  if (!res.ok) {
    if (res.code === 'no_item') game.actAll((tanks) => (mallBag(tanks)[item] = 0));
    return res.message;
  }
  const remaining = res.value.remaining;
  game.actAll((tanks) => {
    apply();
    mallBag(tanks)[item] = remaining;
  });
  return null;
}

export function mallPanel(deps: MallDeps): Node {
  const { cloud } = deps;
  if (!cloud.available || !cloud.session) {
    return h(
      'div.stack',
      {},
      h('p', {}, '商城可以用儲值點數買特效藥、熟成套缸等道具。點數存在帳號裡，換手機也不會不見，所以要先登入雲端存檔。'),
      cloud.available ? h('button.btn.primary', { onclick: deps.openCloud }, '登入雲端存檔') : h('p.hint', {}, '雲端存檔還沒開放，商城也要等伺服器上線。'),
    );
  }
  const body = h('div.stack', {}, h('p.hint', {}, '讀取中…'));
  void (async () => {
    const res = await cloud.points();
    if (!res.ok) return body.replaceChildren(h('p', {}, res.message));
    deps.game.actAll((tanks) => setMallBag(tanks, res.value.bag));
    body.replaceChildren(...mallView(deps, res.value));
  })();
  return body;
}

function reopen(deps: MallDeps): void {
  deps.sheet.open('商城', () => mallPanel(deps));
}

function mallView(deps: MallDeps, cat: PointsCatalog): Node[] {
  const { cloud, game, toasts } = deps;
  const bag = mallBag(game.tanks);
  const buy = async (id: string, name: string, cost: number) => {
    if (!confirm(`用 ${points(cost)}買「${name}」？`)) return;
    const res = await cloud.pointsBuy(id);
    if (!res.ok) return toasts.show(res.message, 'warn');
    game.actAll((tanks) => setMallBag(tanks, res.value.bag));
    deps.sound?.('buy');
    toasts.show(`買好了，「${name}」放進背包`);
    reopen(deps);
  };
  const topup = async (pack: PointsCatalog['packs'][number]) => {
    if (!confirm(`測試儲值 NT$${pack.twd}（不會收錢），拿到 ${points(pack.points)}？`)) return;
    const res = await cloud.pointsTopup(pack.id);
    if (!res.ok) return toasts.show(res.message, 'warn');
    toasts.show(`儲值完成，現在有 ${points(res.value.balance)}`);
    reopen(deps);
  };
  const tanksetBlock = tanksetRefusal(game.tanks);
  return [
    h('p.wallet', {}, `儲值點數：${points(cat.balance)}`),
    h('h3', {}, '背包'),
    h(
      'ul.mall-bag',
      {},
      h('li', {}, h('b', {}, `特效藥 × ${bag.cure}`), h('div.hint', {}, '點缸裡生病的魚，在牠的資料裡使用。')),
      h(
        'li',
        {},
        h('b', {}, `熟成套缸 × ${bag.tankset}`),
        bag.tankset > 0
          ? h(
              'button.btn',
              {
                disabled: !!tanksetBlock,
                title: tanksetBlock ?? '',
                onclick: async () => {
                  let tank: ReturnType<typeof placeMallTankset> = null;
                  const why = await useMallItem(deps, 'tankset', () => !!(tank = placeMallTankset(game.tanks)));
                  if (why) return toasts.show(why, 'warn');
                  if (!tank) return;
                  game.switchTo(game.tanks.indexOf(tank));
                  toasts.show('熟成套缸擺好了，孔雀魚已經放進去');
                  deps.sheet.close();
                },
              },
              tanksetBlock ?? '擺出來',
            )
          : null,
      ),
    ),
    h('h3', {}, '道具'),
    ...cat.items.map((it) => {
      const left = it.daily > 0 ? it.daily - it.boughtToday : Infinity;
      const why = left <= 0 ? '今天買完了' : cat.balance < it.points ? '點數不夠' : null;
      return h(
        'div.mall-item',
        {},
        h('div', {}, h('b', {}, it.name), ' ', h('b.price', {}, points(it.points)), h('div.hint', {}, it.note), it.daily > 0 ? h('div.hint', {}, `每天限買 ${it.daily} 個，今天還能買 ${Math.max(0, left)} 個`) : null),
        h('button.btn', { disabled: !!why, onclick: () => void buy(it.id, it.name, it.points) }, why ?? '購買'),
      );
    }),
    h('h3', {}, '儲值'),
    cat.sandbox
      ? h('p.hint', {}, `目前是測試模式，儲值不會收錢。每個月最多儲值 NT$${cat.monthlyLimit.toLocaleString('zh-TW')}（這個月已儲值 NT$${cat.toppedUpThisMonth.toLocaleString('zh-TW')}）。`)
      : h('p.hint', {}, '儲值還沒開放。'),
    h(
      'div.chips.wrap',
      {},
      ...cat.packs.map((p) =>
        h('button.chip', { disabled: !cat.sandbox || cat.toppedUpThisMonth + p.twd > cat.monthlyLimit, onclick: () => void topup(p) }, `NT$${p.twd} → ${points(p.points)}${p.points > p.twd ? `（多送 ${p.points - p.twd}）` : ''}`),
      ),
    ),
    h(
      'p.hint',
      {},
      '點數沒有使用期限，只能買商城道具，不能換成遊戲幣或轉給別人。未滿 18 歲要先經過家長同意。詳細規定（退款、停止營運）請看',
      h('a', { href: './legal/terms.html#points', target: '_blank', rel: 'noopener' }, '使用條款'),
      '。',
    ),
    h('button.btn.ghost', { onclick: () => deps.sheet.open('點數明細', () => historyPanel(deps)) }, '點數明細'),
  ];
}

function historyPanel(deps: MallDeps): Node {
  const body = h('div.stack', {}, h('p.hint', {}, '讀取中…'));
  void (async () => {
    const res = await deps.cloud.pointsHistory();
    if (!res.ok) return body.replaceChildren(h('p', {}, res.message));
    if (res.value.length === 0) return body.replaceChildren(h('p', {}, '還沒有紀錄。'));
    body.replaceChildren(
      h(
        'ul.mall-history',
        {},
        ...res.value.map((e) =>
          h('li', {}, h('span', {}, new Date(e.at).toLocaleString('zh-TW', { dateStyle: 'short', timeStyle: 'short' })), ' ', e.note, ' ', h('b', {}, `${e.delta > 0 ? '+' : ''}${e.delta}`), h('span.hint', {}, `（餘 ${e.balance}）`)),
        ),
      ),
    );
  })();
  return body;
}
