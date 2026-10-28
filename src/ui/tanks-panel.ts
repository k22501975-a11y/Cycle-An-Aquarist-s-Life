// 「我的水缸」、第二缸用途、買缸確認、螺的面板（從 panels.ts 拆出來：panels 延後載入包快到 60 KB 上限）
import { isShrimpSpecies, catchPests, collectTrap, doseMolluscicide, isLightOn, PESTS, pestCount, removeClutches, removeDeadSnails, scrapeNeriteEggs, setTrap, snailBloom, SNAILS, type PestKind, type SnailKind, transferMedia, mediaAvailable, buyTank, buyTankRefusal, tankLock, unlockHint, newTankCost, purposeCost, setTankPurpose, suggestPurpose, TANK_PURPOSES, type TankPurpose, removeTank, removeTankRefusal, slotPrice, TANK_SETS, tankLabel, type TankSizeId, economy, price, type TankState, markDaily } from '../sim';
import { choiceState } from '../sim/choices';
import { h } from './dom';
import { artImg } from './art-icons';
import { advice, cardGrid, shopCard } from './card-kit';
import { todos } from './status';
import { button, purchase, shopPanel, yuan, type PanelContext } from './panels';

/** 兩種用途卡上的圖。 */
const PURPOSE_ART: Record<TankPurpose, string> = { breeding: 'gear/nursery-box.webp', display: 'gear/led-planted.webp' };

/**
 * 第二缸的用途（G4）：繁殖缸或展示缸兩張卡擇一，標「推薦」的照現在缸裡的狀況和錢；可以先跳過，之後在「我的水缸」再選。
 * 選了：缸沒取名就用用途當名字、目標串多一個那種用途的目標，接著帶去商店買必買的東西。
 */
/** 這缸定用途，帶去商店買必備的東西。 */
function applyPurpose(ctx: PanelContext, id: TankPurpose): void {
  const { game, sheet, toasts } = ctx;
  const spec = TANK_PURPOSES[id];
  game.actAll(() => setTankPurpose(game.state, id));
  ctx.sound?.('quest');
  const need = spec.items.filter((x) => x.required).map((x) => x.label).join('、');
  toasts.show(`這缸當${spec.title}：先買${need}`);
  sheet.open('商店', () => shopPanel(ctx, spec.items.find((x) => x.required)?.key.startsWith('plant:') ? 'plants' : 'gear'));
}

export function tankPurposePanel(ctx: PanelContext): Node {
  const { game, sheet } = ctx;
  const coins = economy(game.state).coins;
  const pick = suggestPurpose(game.tanks, coins);
  const now = game.state.purpose;
  const choose = (id: TankPurpose) => applyPurpose(ctx, id);
  const card = (id: TankPurpose) => {
    const spec = TANK_PURPOSES[id];
    const required = spec.items.filter((x) => x.required);
    const later = spec.items.filter((x) => !x.required);
    return shopCard({
      art: PURPOSE_ART[id],
      name: spec.title,
      price: purposeCost(id),
      unit: ' 起',
      badge: now === id ? '現在' : id === pick ? '推薦' : undefined,
      chips: [...required.map((x) => `${x.label} ${x.price}`), ...later.map((x) => `之後：${x.label}`)],
      note: spec.pitch,
      actions: [button(now === id ? '就這樣' : '選這個', () => (now === id ? sheet.close() : choose(id)), id === pick ? 'primary' : '')],
      cls: `.purpose-card${id === pick ? '.picked' : ''}`,
    });
  };
  return h(
    'div.stack.purpose-panel',
    {},
    h('p.hint', {}, `${tankLabel(game.tanks, game.active)}：選一個用途，會多一個這缸的目標。錢包 ${yuan(coins)}`),
    cardGrid(card('breeding'), card('display')),
    h('div.row', {}, button('先跳過，之後在「我的水缸」選', () => sheet.close())),
  );
}

/** 我的水缸：切換、加缸、收缸。缸位只看錢，但每多一缸就多一份要照顧的水。 */
export function tanksPanel(ctx: PanelContext): Node {
  const { game, sheet, toasts } = ctx;
  const coins = economy(game.state).coins;
  const reopen = () => sheet.open('我的水缸', () => tanksPanel(ctx));
  // 每日小事「看看哪一缸最擠」
  markDaily(game.tanks, 'goalCrowded');
  const rows = game.tanks.map((t, i) => {
    const living = t.fish.filter((f) => f.alive).length;
    const urgent = todos(t).filter((x) => x.tone !== 'ok');
    const summary = [t.equipment.tank.name, `${living} 隻魚蝦`, `${t.water.tempC.toFixed(1)}°C`].join(' · ');
    const refusal = removeTankRefusal(game.tanks, i);
    return h(
      `div.item.tank-row${i === game.active ? '.current' : ''}`,
      {},
      artImg('tanks', 'tank-row-art'),
      h(
        'div.tank-row-text',
        {},
        h('b', {}, tankLabel(game.tanks, i)),
        h('div.hint', {}, summary),
        urgent.length ? h(`div.hint.${urgent[0].tone}`, {}, urgent.length > 1 ? `${urgent[0].text}（還有 ${urgent.length - 1} 件）` : urgent[0].text) : null,
      ),
      h(
        'div.row',
        {},
        i === game.active
          ? h('span.tag', {}, '正在看')
          : button('切換', () => {
              game.switchTo(i);
              sheet.close();
              toasts.show(`切換到${tankLabel(game.tanks, i)}`);
            }, 'primary'),
        // 從這缸分一半濾材到正在看的缸：新缸幾乎不用等養水
        i !== game.active && mediaAvailable(t) > 0
          ? h(
              'button.btn.media-btn',
              {
                onclick: () => {
                  const target = game.state;
                  const gift = game.actAll(() => transferMedia(t, target));
                  if (!gift) return;
                  toasts.show(gift.ich ? `把${tankLabel(game.tanks, i)}的濾材分過來了，但那缸有白點蟲，蟲卵也跟著過來了` : `把${tankLabel(game.tanks, i)}的濾材分過來了，硝化菌一起搬家`, gift.ich ? 'warn' : 'info');
                  reopen();
                },
                title: '分一半濾材到正在看的缸',
              },
              artImg('media-transfer', 'btn-art'),
              '分濾材過來',
            )
          : null,
        i > 0
          ? button(t.purpose ? TANK_PURPOSES[t.purpose].title : '選用途', () => {
              game.switchTo(i);
              sheet.open('這缸拿來做什麼？', () => tankPurposePanel(ctx));
            })
          : null,
        button('改名', () => {
          const name = prompt('幫這缸取個名字（例如：繁殖缸、紅蛇王專缸）', t.label ?? '')?.trim();
          if (name === undefined) return;
          game.actAll(() => (t.label = name.slice(0, 12) || undefined));
          reopen();
        }),
        game.tanks.length > 1
          ? button('收掉', () => {
              if (refusal) {
                toasts.show(refusal, 'warn');
                return;
              }
              if (!confirm(`確定要收掉${tankLabel(game.tanks, i)}嗎？水草和造景會丟掉，缸和設備折價賣回。`)) return;
              const refund = game.actAll((tanks) => removeTank(tanks, i));
              toasts.show(`收掉了一缸，拿回 ${yuan(refund)}`);
              reopen();
            })
          : null,
      ),
    );
  });
  const slot = slotPrice(game.tanks.length);
  const offers = (Object.keys(TANK_SETS) as TankSizeId[]).map((id) => tankSetCard(ctx, id, '買'));
  return h(
    'div.stack',
    {},
    h('p.wallet', {}, `錢包：${yuan(coins)}`),
    ...rows,
    h('h3', {}, '加一缸'),
    cardGrid(...offers),
    advice([
      '多一缸可以分開養不同的魚、隔出繁殖缸或種魚專缸。每缸都要各自養水、換水、付電費，缸越多越難顧。',
      '大缸水質比較穩，但設備要跟著夠力。',
      `原本的櫃子放得下 2 缸，之後每多一缸要加一層缸架${slot > 0 ? `（這次 ${yuan(slot)}）` : ''}；房間最多 6 缸。`,
    ]),
  );
}

/** 買一組套缸：錢不夠、缸位滿了跳原因；買到了切過去、問這缸拿來做什麼。 */
function buyTankSet(ctx: PanelContext, id: TankSizeId): void {
  const { game, sheet, toasts } = ctx;
  const cost = newTankCost(game.tanks, id);
  const refusal = buyTankRefusal(game.tanks, id);
  if (refusal) {
    toasts.show(refusal === '錢不夠' ? `錢不夠：要 ${cost} 元，現在有 ${economy(game.state).coins} 元` : refusal, 'warn');
    return;
  }
  const tank = game.actAll((tanks) => buyTank(tanks, id));
  if (!tank) return;
  ctx.sound?.('buy');
  game.switchTo(game.tanks.indexOf(tank));
  toasts.show(`架好了新的${TANK_SETS[id].tank.name}（${yuan(cost)}）。新缸要先養水，硝化菌長起來才能放魚`);
  // 第二缸起（G4）：先問這缸拿來做什麼，可以跳過。早上的選擇卡（C3）已經選過的就照那個，不再問一次（#316）
  const planned = game.tanks.length === 2 ? choiceState(game.tanks).picked.C3 : undefined;
  if (planned === 'breeding' || planned === 'display') applyPurpose(ctx, planned);
  else sheet.open('這缸拿來做什麼？', () => tankPurposePanel(ctx));
}

/** 一組套缸的商品卡（我的水缸、住不下卡的購買確認共用）。 */
function tankSetCard(ctx: PanelContext, id: TankSizeId, label: string, extra: Node[] = []): Node {
  const { game } = ctx;
  const set = TANK_SETS[id];
  const slot = slotPrice(game.tanks.length);
  const lock = tankLock(game.tanks, id);
  return shopCard({
    art: 'gear/tank-empty.webp',
    name: set.tank.name,
    price: newTankCost(game.tanks, id),
    chips: [`${set.tank.volumeL}L`, set.filter.name.replace(/（.*）/, ''), set.heater.name, slot > 0 ? '含缸架' : ''].filter(Boolean),
    note: lock ? '🔒 ' + unlockHint(lock) : undefined,
    actions: [button(label, () => buyTankSet(ctx, id), buyTankRefusal(game.tanks, id) ? '' : 'primary'), ...extra],
    cls: lock ? '.locked' : '',
  });
}

/** 住不下卡（C14）選了再買一缸／換大缸：直接打開那組套缸的購買確認，按「買下架好」才扣錢（polish-to-9.md §10.2，同自動餵食器）。 */
export function tankOffer(ctx: PanelContext, id: TankSizeId): Node {
  return h('div.stack.tank-offer', {}, tankSetCard(ctx, id, '買下架好', [h('button.btn.ghost', { onclick: () => ctx.sheet.close() }, '先不要')]));
}

const PEST_ORDER: PestKind[] = ['bladder', 'ramshorn', 'mts'];

/** 螺的管理：看看缸裡有多少螺，各種清除方法各有代價（design/snails.md §3）。 */
export function snailPanel(ctx: PanelContext): Node {
  // 每日小事「找到缸裡的螺」：打開螺的面板就算看過（之後畫面支援點缸裡的螺再改成點螺）
  markDaily(ctx.game.tanks, 'snail');
  const { game, sheet, toasts } = ctx;
  const st = game.state;
  const s = st.snails;
  const lit = isLightOn(st);
  const living = s?.snails.filter((x) => x.alive) ?? [];
  const dead = (s?.snails.length ?? 0) - living.length;
  const bloom = snailBloom(st);
  const refresh = () => sheet.open('螺', () => snailPanel(ctx));
  const act = (run: (st: TankState) => string, tone: 'info' | 'warn' = 'info') => () => {
    let text = '';
    game.act((x) => (text = run(x)));
    toasts.show(text, tone);
    refresh();
  };
  const counts = (Object.keys(SNAILS) as SnailKind[])
    .map((k) => [k, living.filter((x) => x.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${SNAILS[k].name} ${n} 隻`);
  // 馬來螺白天躲在沙裡：玩家只看得到一兩成
  const pests = PEST_ORDER.map((k) => [k, Math.round(pestCount(st, k) * (k === 'mts' && lit ? 0.1 : 1))] as const).filter(([, n]) => n > 0);
  const young = Math.round(s?.appleYoung ?? 0);
  const trapAge = s?.trapHour !== undefined ? st.hours - s.trapHour : null;
  const hasShrimp = st.fish.some((f) => f.alive && isShrimpSpecies(f.species));
  return h(
    'div.stack',
    {},
    h('p.hint', {}, '小螺吃殘餌和有機物：餵太多幾週內就會爆量，少餵一陣子自然變少。'),
    h(
      'div.item',
      {},
      h(
        'div',
        {},
        h('b', {}, counts.length ? counts.join('、') : '沒有養螺'),
        h('div.hint', {}, pests.length ? `看得到的小螺：${pests.map(([k, n]) => `${PESTS[k].name} ${n}`).join('、')}${lit && pestCount(st, 'mts') > 0 ? '（馬來螺白天躲在沙裡，關燈才爬出來）' : ''}` : '沒看到害蟲小螺'),
        young > 0 ? h('div.hint', {}, `剛孵出的小蘋果螺約 ${young} 隻`) : null,
        bloom !== 'none' ? h('div.warn-text', {}, bloom === 'plague' ? '滿缸都是小螺！一定是餵太多了' : '小螺變多了，少餵一點') : null,
      ),
    ),
    s && s.clutches.length > 0
      ? h('div.item', {}, h('div', {}, h('b', {}, `蘋果螺卵塊 ${s.clutches.length} 團`), h('div.hint', {}, '在水面上方的缸壁上，一團 50～200 顆，三週左右孵化')), button('摘掉', act((x) => `摘掉 ${removeClutches(x)} 團卵塊`)))
      : null,
    dead > 0 ? h('div.item', {}, h('div', {}, h('b.warn-text', {}, `死掉的大螺 ${dead} 隻`), h('div.hint', {}, '大螺死了很快就爛，水會臭、氨會升高')), button('撈出來', act((x) => `撈出 ${removeDeadSnails(x)} 隻死螺`), 'primary')) : null,
    pestCount(st) > 0 || young > 0
      ? h('div.item', {}, h('div', {}, h('b', {}, '手撈小螺'), h('div.hint', {}, '只抓得到看得見的，一次大約四分之一；馬來螺要關燈後撈')), button('撈', act((x) => `撈掉 ${catchPests(x, isLightOn(x))} 隻小螺`)))
      : null,
    h(
      'div.item',
      {},
      h('div', {}, h('b', {}, '螺陷阱'), h('div.hint', {}, trapAge === null ? '放一片燙過的菜過夜，隔天收能抓走一批；忘了收菜會爛' : `放了 ${Math.floor(trapAge)} 小時${trapAge < 8 ? '，再等一下比較多' : trapAge > 36 ? '，快爛了趕快收' : ''}`)),
      trapAge === null ? button('放菜葉', act((x) => (setTrap(x), '放了一片燙過的菜葉，隔夜再收'))) : button('收陷阱', act((x) => `收起陷阱，抓到 ${Math.max(0, collectTrap(x))} 隻小螺`), 'primary'),
    ),
    s && s.neriteEggs >= 1 ? h('div.item', {}, h('div', {}, h('b', {}, `斑馬螺卵點約 ${Math.round(s.neriteEggs)} 顆`), h('div.hint', {}, '淡水孵不出來，只是難看')), button('刮掉', act((x) => `刮掉 ${scrapeNeriteEggs(x)} 顆卵點`))) : null,
    h(
      'div.item',
      {},
      h('div', {}, h('b', {}, '除螺藥（含銅）'), h(hasShrimp ? 'div.warn-text' : 'div.hint', {}, `${price('med:snail')} 元 · 一兩天內螺幾乎死光，但${hasShrimp ? '缸裡的蝦也會中毒死掉！' : '對蝦有毒'}；死螺一起爛，氨會暴衝，記得換水`)),
      button('下藥', () => {
        if (purchase(ctx, price('med:snail'), (x) => doseMolluscicide(x), '下了除螺藥，記得這幾天多換水', 'warn', true)) refresh();
      }, hasShrimp ? 'danger' : ''),
    ),
  );
}

