import {
  applyLedger,
  economy,
  sellableCuttings,
  findListedFish,
  FISH_SPECIES,
  listedFish,
  listingFee,
  listingRefusal,
  listingTitle,
  marketItem,
  marketPayout,
  minFishPrice,
  minPlantPrice,
  packFish,
  PACKAGING,
  PLANT_SPECIES,
  receiveFish,
  receivePlants,
  suggestedFishPrice,
  suggestedPlantPrice,
  takeCuttingsForSale,
  unlistFish,
  addCuttings,
  isPlantSpecies,
  type Fish,
  type FishSpeciesId,
  type PackagingId,
  type PlantSpeciesId,
} from '../sim';
import type { Game } from '../game/game';
import type { CloudClient, LedgerWallet, MarketListing, MarketMine, MarketOrder } from '../net/cloud';
import type { SoundId } from '../audio/sounds';
import { lineChart } from './charts';
import { h } from './dom';
import { ageLabel } from './panels';
import type { Sheet, Toasts } from './sheet';

/**
 * 玩家市場（market-and-breeding.md §3）：逛市場、上架、到貨。
 * 上架的魚還在自己缸裡照常養；成交後遊戲會自動撈出來出貨（syncMarket）。
 */

export interface MarketDeps {
  cloud: CloudClient;
  game: Game;
  sheet: Sheet;
  toasts: Toasts;
  sound?: (id: SoundId) => void;
  openCloud: () => void;
  /** 先把存檔傳到雲端（伺服器上架魚時看的是雲端那份，L2）；沒傳上去回傳 false。 */
  syncSave?: () => Promise<boolean>;
}

export type MarketTab = 'browse' | 'shop' | 'arrivals';

const yuan = (n: number) => `${n.toLocaleString('zh-TW')} 元`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

function speciesName(id: string): string {
  if (id in FISH_SPECIES) return FISH_SPECIES[id as FishSpeciesId].name;
  if (isPlantSpecies(id)) return PLANT_SPECIES[id].name;
  return id;
}

/** 套用伺服器記的一筆收支（docs/ledger.md）：照 delta 加減、記下雲端存檔的新版本。 */
function applyWallet(deps: Pick<MarketDeps, 'cloud' | 'game'>, wallet: LedgerWallet): void {
  deps.game.act((st) => applyLedger(st, wallet));
  deps.cloud.advanceRevision(wallet.revision);
}

let syncing = false;
/** 上次對帳時知道的、還在路上的貨（App 版用來排到貨通知）。 */
let inTransit: { at: number; title: string; id: number }[] = [];

export function knownArrivals(): { at: number; title: string; id: number }[] {
  return inTransit.filter((a) => a.at > Date.now());
}

/**
 * 和市場對帳（登入時每分鐘、打開市場時）：
 * 賣出的魚自動撈出來出貨、魚死了就下架、到貨的貨款入帳、沒出貨的退款；回傳有幾件貨到了等收。
 */
export async function syncMarket(deps: MarketDeps): Promise<{ arrived: number } | null> {
  const { cloud, toasts } = deps;
  if (!cloud.session || syncing) return null;
  syncing = true;
  try {
    const res = await cloud.marketMine();
    if (!res.ok) return null;
    const mine = res.value;
    inTransit = mine.purchases.filter((o) => o.status === 'shipped' && !o.arrived && o.arriveAt).map((o) => ({ at: o.arriveAt!, title: o.title, id: o.id }));
    await handleSales(deps, mine.sales);
    await refreshListings(deps, mine);
    let arrived = 0;
    for (const o of mine.purchases) {
      if (o.status === 'cancelled') {
        const r = await cloud.marketCollect(o.id);
        if (r.ok && r.value.result === 'refund') {
          applyWallet(deps, r.value.wallet);
          toasts.show(`${o.counterpart ?? '賣家'} 沒有出貨，退回 ${yuan(r.value.amount)}`, 'warn');
        }
      } else if (o.arrived) arrived++;
    }
    if (arrived > 0) toasts.show(`有 ${arrived} 件市場的貨到了`, 'info', { label: '收貨', run: () => deps.sheet.open('市場', () => marketPanel(deps, 'arrivals')) });
    return { arrived };
  } finally {
    syncing = false;
  }
}

async function handleSales(deps: MarketDeps, sales: MarketOrder[]): Promise<void> {
  const { cloud, game, toasts } = deps;
  for (const o of sales) {
    if (o.status === 'paid') {
      if (o.kind === 'plant') {
        // 插枝上架時就拿走了，直接出貨
        const r = await cloud.marketShip(o.id, o.item ?? {}, 25, 7);
        if (r.ok) toasts.show(`${o.title} 賣給 ${o.counterpart}，已經出貨`);
        continue;
      }
      const shipment = game.act(() => packFish(game.tanks, o.listingId));
      if (!shipment) {
        await cloud.marketSellerCancel(o.id);
        game.act(() => unlistFish(game.tanks, o.listingId));
        toasts.show(`${o.title} 已經不在了，訂單取消，款項退給 ${o.counterpart}`, 'warn');
        continue;
      }
      const r = await cloud.marketShip(o.id, shipment.item, shipment.bagTemp, shipment.bagPh);
      if (r.ok) {
        deps.sound?.('buy');
        toasts.show(`${o.title} 賣給 ${o.counterpart}，撈出來裝袋出貨了`);
      } else {
        // 出貨失敗（例如剛好超過期限被取消）：魚放回第一缸
        game.act((st) => receiveFish(st, shipment.item, { stress: 0.3, bagTemp: shipment.bagTemp, bagPh: shipment.bagPh, drip: true }));
        toasts.show(r.message, 'warn');
      }
    } else if (o.status === 'cancelled' || o.arrived) {
      const r = await cloud.marketCollect(o.id);
      if (!r.ok) continue;
      const v = r.value;
      if (v.result === 'payout') {
        applyWallet(deps, v.wallet);
        deps.sound?.('buy');
        toasts.show(`${o.title} 送到 ${o.counterpart} 手上了，入帳 ${yuan(v.amount)}（已扣 8% 成交稅）`);
      } else if (v.result === 'doa') {
        toasts.show(`${o.title} 在運送途中死了，貨款退給買家。下次出貨前先把魚養健康一點`, 'warn');
      } else if (v.result === 'cancelled') {
        if (o.kind === 'fish') game.act(() => unlistFish(game.tanks, o.listingId));
        else if (o.item && isPlantSpecies(String(o.item.species))) game.act((st) => addCuttings(st, o.item!.species as PlantSpeciesId, Number(o.item!.count) || 0));
        toasts.show(`${o.counterpart ?? '買家'} 的訂單太久沒出貨，自動取消了`, 'warn');
      }
    }
  }
}

/** 上架中的魚：死了或不見了就下架；健康變化時更新買家看到的狀態。標記對不上的拿掉。 */
async function refreshListings(deps: MarketDeps, mine: MarketMine): Promise<void> {
  const { cloud, game, toasts } = deps;
  const known = new Set<number>([...mine.listings.map((l) => l.id), ...mine.sales.map((o) => o.listingId)]);
  const maxKnown = Math.max(0, ...known);
  for (const l of mine.listings) {
    if (l.kind !== 'fish') continue;
    const found = findListedFish(game.tanks, l.id);
    if (!found || !found.fish.alive) {
      await cloud.marketCancel(l.id);
      if (found) game.act(() => unlistFish(game.tanks, l.id));
      toasts.show(`${l.title} 死了，已經從市場下架`, 'warn');
    } else if (Math.abs(found.fish.health - l.health) > 0.03 || found.fish.pregnancy > 0.05 !== (Number(l.item.pregnancy) > 0.05)) {
      await cloud.marketUpdate(l.id, marketItem(found.fish));
    }
  }
  // 別台裝置下架或已經處理完的：拿掉標記（剛上架、還沒出現在清單上的不動）
  game.act(() => {
    for (const { fish } of listedFish(game.tanks)) if (!known.has(fish.listing!) && fish.listing! <= maxKnown) delete fish.listing;
  });
}

export function marketPanel(deps: MarketDeps, tab: MarketTab = 'browse', filter = ''): Node {
  const { cloud, sheet } = deps;
  if (!cloud.available || !cloud.session) {
    return h(
      'div.stack',
      {},
      h('p', {}, '玩家市場可以把自己繁殖的魚蝦、水草插枝賣給其他玩家，也能買到別人育出的品系。要先登入雲端存檔。'),
      cloud.available ? h('button.btn.primary', { onclick: deps.openCloud }, '登入雲端存檔') : h('p.hint', {}, '雲端存檔還沒開放，市場也要等伺服器上線。'),
    );
  }
  const open = (t: MarketTab, f = filter) => sheet.open('市場', () => marketPanel(deps, t, f));
  const tabs = h(
    'div.tabs',
    {},
    ...(['browse', 'shop', 'arrivals'] as const).map((t) => h(`button.tab${t === tab ? '.active' : ''}`, { onclick: () => open(t) }, { browse: '逛市場', shop: '我的攤位', arrivals: '到貨' }[t])),
  );
  const body = h('div.stack', {}, h('p.hint', {}, '讀取中…'));
  void (async () => {
    if (tab === 'browse') body.replaceChildren(...(await browseView(deps, filter)));
    else {
      await syncMarket(deps);
      const res = await cloud.marketMine();
      if (!res.ok) body.replaceChildren(h('p', {}, res.message));
      else body.replaceChildren(...(tab === 'shop' ? shopView(deps, res.value) : arrivalsView(deps, res.value)));
    }
  })();
  return h('div.stack', {}, tabs, h('p.wallet', {}, `錢包：${yuan(economy(deps.game.state).coins)}`), body);
}

// ---- 逛市場 ----

async function browseView(deps: MarketDeps, filter: string): Promise<Node[]> {
  const { cloud, sheet } = deps;
  const chips: [string, string][] = [['', '全部'], ...Object.keys(FISH_SPECIES).map((id) => [id, speciesName(id)] as [string, string]), ...Object.keys(PLANT_SPECIES).map((id) => [id, speciesName(id)] as [string, string])];
  const chipRow = h(
    'div.chips',
    {},
    ...chips.map(([id, name]) => h(`button.chip${id === filter ? '.active' : ''}`, { onclick: () => sheet.open('市場', () => marketPanel(deps, 'browse', id)) }, name)),
  );
  const [res, prices] = await Promise.all([cloud.marketListings(filter || undefined), filter ? cloud.marketPrices(filter) : Promise.resolve(null)]);
  if (!res.ok) return [chipRow, h('p', {}, res.message)];
  const out: Node[] = [chipRow];
  if (prices?.ok) out.push(priceTrend(filter, prices.value));
  if (res.value.length === 0) out.push(h('p.hint', {}, filter ? `現在沒有人在賣${speciesName(filter)}。` : '市場上還沒有東西。把繁殖出來的魚、修剪下來的水草放上來賣吧。'));
  out.push(...res.value.map((l) => listingRow(deps, l)));
  out.push(h('p.hint', {}, '價錢由賣家決定。魚還養在賣家的缸裡，成交後才出貨，看到的健康是即時的。看不到基因，只能看外觀和賣家信譽判斷。'));
  return out;
}

function priceTrend(species: string, points: { day: string; median: number; count: number }[]): Node {
  const total = points.reduce((n, p) => n + p.count, 0);
  // X 軸用「從兩週前算起的小時」，刻度顯示日期
  const DAY = 86_400_000;
  const start = Math.floor((Date.now() + 8 * 3600_000) / DAY) - 13;
  const date = (d: number) => new Date((start + d) * DAY).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  return lineChart({
    title: `${speciesName(species)} 近兩週成交價（中位數，${total} 筆）`,
    unit: '',
    points: points.map((p) => ({ x: (Date.parse(`${p.day}T00:00:00Z`) / DAY - start) * 24, y: p.median })),
    xRange: [0, 13 * 24],
    yMinSpan: 20,
    zeroBased: true,
    dots: true,
    formatX: (x) => date(Math.round(x / 24)),
    formatY: (y) => `${Math.round(y)} 元`,
    formatTick: date,
    empty: '近兩週還沒有成交紀錄。',
  });
}

function sellerLine(l: MarketListing): string {
  const s = l.seller;
  return s.deals === 0 && s.doaRate === 0 ? `${s.username} · 新賣家` : `${s.username} · 成交 ${s.deals} 筆 · 到貨死亡 ${pct(s.doaRate)}`;
}

function itemDetails(l: Pick<MarketListing, 'kind' | 'item' | 'health'>): string {
  const it = l.item;
  if (l.kind === 'plant') return `${Number(it.count) || 0} 株插枝`;
  const parts = [`健康 ${pct(l.health)}`];
  if (typeof it.ageDays === 'number') parts.push(ageLabel(it.ageDays));
  if (typeof it.lengthCm === 'number') parts.push(`${it.lengthCm.toFixed(1)} 公分`);
  if (typeof it.generation === 'number' && it.generation > 0) parts.push(`第 ${it.generation} 代`);
  return parts.join(' · ');
}

function listingRow(deps: MarketDeps, l: MarketListing): Node {
  return h(
    'div.item.market-item',
    {},
    h(
      'div',
      {},
      h('b', {}, l.title),
      h('div.hint', {}, itemDetails(l)),
      h(`div.hint${l.seller.warning ? '.warn-text' : ''}`, {}, sellerLine(l) + (l.seller.warning ? ' · 常有魚死在路上' : '')),
    ),
    h('div.row', {}, h('b.price', {}, yuan(l.price)), h('button.btn.primary', { onclick: () => deps.sheet.open('購買', () => buyPanel(deps, l)) }, '買')),
  );
}

/** 選包裝、付款。款項先由市場託管，到貨後才給賣家。 */
export function buyPanel(deps: MarketDeps, l: MarketListing): Node {
  const { cloud, game, sheet, toasts } = deps;
  const coins = economy(game.state).coins;
  const buy = async (pack: PackagingId) => {
    const total = l.price + PACKAGING[pack].cost;
    if (economy(game.state).coins < total) {
      toasts.show('錢不夠', 'warn');
      return;
    }
    const res = await cloud.marketBuy(l.id, pack);
    if (!res.ok) {
      toasts.show(res.message, 'warn');
      sheet.open('市場', () => marketPanel(deps, 'browse'));
      return;
    }
    applyWallet(deps, res.value.wallet);
    deps.sound?.('buy');
    toasts.show(`買了${l.title}，付款 ${yuan(total)}。等 ${l.seller.username} 出貨，運送要遊戲裡 6～24 小時`);
    sheet.open('市場', () => marketPanel(deps, 'arrivals'));
  };
  const packs = (l.kind === 'plant' ? (['bag'] as PackagingId[]) : (Object.keys(PACKAGING) as PackagingId[])).map((id) => {
    const p = PACKAGING[id];
    const total = l.price + p.cost;
    return h(
      'div.item',
      {},
      h('div', {}, h('b', {}, p.name), h('div.hint', {}, `${p.cost ? `+${yuan(p.cost)} · ` : ''}${p.note}`)),
      h('button.btn.primary', { onclick: () => void buy(id), disabled: coins < total }, `付 ${yuan(total)}`),
    );
  });
  return h(
    'div.stack',
    {},
    h('div.item', {}, h('div', {}, h('b', {}, l.title), h('div.hint', {}, itemDetails(l)), h('div.hint', {}, sellerLine(l))), h('b.price', {}, yuan(l.price))),
    h('p.wallet', {}, `錢包：${yuan(coins)}`),
    l.kind === 'fish' ? h('p.hint', {}, '選擇包裝。運送越久、魚越不健康，越容易死在路上；死在路上的話款項全額退回。') : null,
    ...packs,
    h('p.hint', {}, '到貨後可以選擇慢慢滴水對水或直接倒進缸裡。有檢疫盒的話會先放進檢疫盒。'),
  );
}

// ---- 我的攤位 ----

function shopView(deps: MarketDeps, mine: MarketMine): Node[] {
  const { game, sheet } = deps;
  const out: Node[] = [];
  const used = mine.listings.length;
  const canList = Date.now() >= mine.canListAt;
  out.push(h('p.hint', {}, `上架格子 ${used} / ${mine.slots}（成功出貨越多，格子越多）。上架費是售價的 1%，賣出後扣 8% 成交稅。`));
  if (!canList) out.push(h('p.warn-text', {}, `新帳號 ${new Date(mine.canListAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 之後才能上架（防止開小號洗錢）。`));

  const selling = mine.sales.filter((o) => o.status === 'shipped' || o.status === 'paid');
  if (selling.length) {
    out.push(h('h3', {}, '已賣出'));
    out.push(...selling.map((o) => h('div.item', {}, h('div', {}, h('b', {}, o.title), h('div.hint', {}, `賣給 ${o.counterpart} · ${orderState(o)}`)), h('b.price', {}, yuan(o.price)))));
  }
  out.push(h('h3', {}, '上架中'));
  if (used === 0) out.push(h('p.hint', {}, '還沒有上架的東西。'));
  out.push(
    ...mine.listings.map((l) =>
      h(
        'div.item',
        {},
        h('div', {}, h('b', {}, l.title), h('div.hint', {}, itemDetails(l))),
        h('div.row', {}, h('b.price', {}, yuan(l.price)), h('button.btn', { onclick: () => void cancelListing(deps, l) }, '下架')),
      ),
    ),
  );
  if (canList && used < mine.slots) {
    out.push(h('h3', {}, '可以上架的魚蝦'));
    const fish = game.tanks.flatMap((t) => [...t.fish, ...(t.quarantine?.fish ?? [])]).filter((f) => !listingRefusal(f));
    if (fish.length === 0) out.push(h('p.hint', {}, '沒有可以賣的魚蝦。太小、生病、老闆送的魚不能上架。'));
    // 同一種同一個名字的只列一次，挑最健康的
    const groups = new Map<string, Fish[]>();
    for (const f of fish) groups.set(listingTitle(f), [...(groups.get(listingTitle(f)) ?? []), f]);
    out.push(
      ...[...groups.entries()].map(([title, list]) => {
        const best = [...list].sort((a, b) => b.health - a.health)[0];
        return h(
          'div.item',
          {},
          h('div', {}, h('b', {}, title), h('div.hint', {}, `有 ${list.length} 隻 · 建議 ${yuan(suggestedFishPrice(best))}`)),
          h('button.btn', { onclick: () => sheet.open('上架', () => listFishPanel(deps, best)) }, '上架'),
        );
      }),
    );
    // 寶箱來的插枝不能上架（polish-to-9.md §4）
    const cuttings = economy(game.state).cuttings;
    const plants = (Object.keys(cuttings) as PlantSpeciesId[]).filter((id) => sellableCuttings(game.state, id) > 0);
    if (plants.length) {
      out.push(h('h3', {}, '水草插枝'));
      out.push(
        ...plants.map((id) =>
          h('div.item', {}, h('div', {}, h('b', {}, `${PLANT_SPECIES[id].name}插枝`), h('div.hint', {}, `可以上架 ${sellableCuttings(game.state, id)} 株`)),
            h('button.btn', { onclick: () => sheet.open('上架', () => listPlantPanel(deps, id)) }, '上架')),
        ),
      );
    }
  }
  return out;
}

async function cancelListing(deps: MarketDeps, l: MarketListing): Promise<void> {
  const { cloud, game, toasts, sheet } = deps;
  const res = await cloud.marketCancel(l.id);
  if (!res.ok) toasts.show(res.message, 'warn');
  else {
    if (l.kind === 'fish') game.act(() => unlistFish(game.tanks, l.id));
    else if (isPlantSpecies(l.species)) game.act((st) => addCuttings(st, l.species as PlantSpeciesId, Number(l.item.count) || 0));
    toasts.show(`${l.title} 下架了（上架費不退）`);
  }
  sheet.open('市場', () => marketPanel(deps, 'shop'));
}

function priceForm(min: number, suggested: number, submit: (price: number) => void): Node {
  const input = h('input.text-input', { type: 'number', inputmode: 'numeric', min: String(min), step: '1', value: String(suggested) }) as HTMLInputElement;
  const note = h('p.hint');
  const update = () => {
    const p = Math.floor(Number(input.value));
    note.textContent = p >= min ? `上架費 ${yuan(listingFee(p))} · 賣出後實拿 ${yuan(marketPayout(p))}` : `最低 ${yuan(min)}（水族店的收購價）`;
  };
  input.addEventListener('input', update);
  update();
  return h(
    'div.stack',
    {},
    h('label.hint', {}, `售價（建議 ${yuan(suggested)}，最低 ${yuan(min)}）`),
    h('div.row', {}, input, h('button.btn.primary', { onclick: () => submit(Math.floor(Number(input.value))) }, '上架')),
    note,
  );
}

export function listFishPanel(deps: MarketDeps, picked: Fish): Node {
  const { cloud, game, sheet, toasts } = deps;
  const min = minFishPrice(picked);
  const submit = async (price: number) => {
    if (!(price >= min)) return toasts.show(`最低 ${yuan(min)}`, 'warn');
    const fee = listingFee(price);
    if (economy(game.state).coins < fee) return toasts.show('錢不夠付上架費', 'warn');
    // 伺服器看的是雲端那份存檔：先同步，剛出生的魚才找得到
    if (deps.syncSave && !(await deps.syncSave())) return toasts.show('存檔還沒同步到雲端，先處理好存檔再上架', 'warn');
    // 同步時可能改用了伺服器補算的進度：重新找這條魚
    const fish = game.tanks.flatMap((t) => [...t.fish, ...(t.quarantine?.fish ?? [])]).find((f) => f.id === picked.id && f.alive);
    if (!fish) return toasts.show('找不到這條魚了', 'warn');
    const res = await cloud.marketList({ kind: 'fish', species: fish.species, title: listingTitle(fish), item: marketItem(fish), price });
    if (!res.ok) return toasts.show(res.message, 'warn');
    applyWallet(deps, res.value.wallet);
    game.act(() => (fish.listing = res.value.id));
    toasts.show(`${listingTitle(fish)} 上架了，售價 ${yuan(price)}。魚還在缸裡，記得照顧好`);
    sheet.open('市場', () => marketPanel(deps, 'shop'));
  };
  return h(
    'div.stack',
    {},
    h('div.item', {}, h('div', {}, h('b', {}, listingTitle(picked)), h('div.hint', {}, `#${picked.id} · 健康 ${pct(picked.health)} · ${ageLabel(picked.ageDays)}`))),
    h('p.hint', {}, '上架後魚還在你的缸裡照常養：生病、長大、懷孕都會照實顯示給買家，死了會自動下架。成交後遊戲會把牠撈出來出貨。'),
    priceForm(min, suggestedFishPrice(picked), (p) => void submit(p)),
  );
}

export function listPlantPanel(deps: MarketDeps, species: PlantSpeciesId): Node {
  const { cloud, game, sheet, toasts } = deps;
  const have = sellableCuttings(game.state, species);
  const count = Math.min(have, 5);
  const submit = async (price: number) => {
    const min = minPlantPrice(species, count);
    if (!(price >= min)) return toasts.show(`最低 ${yuan(min)}`, 'warn');
    if (economy(game.state).coins < listingFee(price)) return toasts.show('錢不夠付上架費', 'warn');
    if (!game.act((st) => takeCuttingsForSale(st, species, count))) return;
    const res = await cloud.marketList({ kind: 'plant', species, title: `${PLANT_SPECIES[species].name}插枝 ${count} 株`, item: { species, count }, price });
    if (!res.ok) {
      game.act((st) => addCuttings(st, species, count));
      return toasts.show(res.message, 'warn');
    }
    applyWallet(deps, res.value.wallet);
    toasts.show(`${PLANT_SPECIES[species].name}插枝 ${count} 株上架了`);
    sheet.open('市場', () => marketPanel(deps, 'shop'));
  };
  return h(
    'div.stack',
    {},
    h('p', {}, `一次上架 ${count} 株${PLANT_SPECIES[species].name}插枝（手上有 ${have} 株）。`),
    priceForm(minPlantPrice(species, count), suggestedPlantPrice(species, count), (p) => void submit(p)),
  );
}

// ---- 到貨 ----

function orderState(o: MarketOrder): string {
  if (o.status === 'paid') return o.role === 'buyer' ? `等 ${o.counterpart ?? '賣家'} 出貨` : '等出貨';
  if (o.status === 'cancelled') return '已取消';
  if (o.arrived) return '已到貨';
  const mins = Math.max(1, Math.round(((o.arriveAt ?? Date.now()) - Date.now()) / 60_000));
  return `運送中，約 ${mins >= 60 ? `${Math.round(mins / 6) / 10} 小時` : `${mins} 分鐘`}後到`;
}

function arrivalsView(deps: MarketDeps, mine: MarketMine): Node[] {
  if (mine.purchases.length === 0) return [h('p.hint', {}, '沒有在路上的貨。到「逛市場」看看別人在賣什麼。')];
  return mine.purchases.map((o) =>
    h(
      `div.item${o.arrived ? '.gift' : ''}`,
      {},
      h('div', {}, h('b', {}, o.title), h('div.hint', {}, `${o.counterpart ?? '賣家'} · ${yuan(o.price)} · ${PACKAGING[o.packaging as PackagingId]?.name ?? o.packaging} · ${orderState(o)}`)),
      o.arrived
        ? o.kind === 'fish'
          ? h('div.row', {}, h('button.btn.primary', { onclick: () => void collect(deps, o, true) }, '滴水對水'), h('button.btn', { onclick: () => void collect(deps, o, false) }, '直接倒入'))
          : h('button.btn.primary', { onclick: () => void collect(deps, o, true) }, '收下')
        : null,
    ),
  );
}

async function collect(deps: MarketDeps, o: MarketOrder, drip: boolean): Promise<void> {
  const { cloud, game, sheet, toasts } = deps;
  const res = await cloud.marketCollect(o.id);
  if (!res.ok) {
    toasts.show(res.message, 'warn');
    return;
  }
  const v = res.value;
  if (v.result === 'refund') {
    applyWallet(deps, v.wallet);
    toasts.show(v.reason === 'doa' ? `打開袋子，${o.title} 已經死在路上了。款項 ${yuan(v.amount)} 全額退回` : `退回 ${yuan(v.amount)}`, 'warn');
  } else if (v.result === 'item') {
    if (v.kind === 'plant') {
      game.act((st) => receivePlants(st, v.item));
      toasts.show(`收到${o.title}，可以到商店的水草頁種下`);
    } else {
      const fish = game.act((st) => receiveFish(st, v.item, { stress: v.stress, bagTemp: v.bagTemp, bagPh: v.bagPh, drip }, o.id));
      const q = !!game.state.quarantine;
      toasts.show(
        fish
          ? `${o.title} 到了，${drip ? '慢慢滴水對水後' : '直接倒進'}${q ? '檢疫盒' : '缸裡'}${drip ? '，牠很快就會安定下來' : '，水溫和水質不同讓牠很緊迫'}`
          : '收到的魚資料有問題，無法放進缸裡',
        fish && drip ? 'info' : 'warn',
      );
    }
    deps.sound?.('buy');
  }
  sheet.open('市場', () => marketPanel(deps, 'arrivals'));
}
