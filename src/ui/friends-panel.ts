import { applyMedia, economy, isPlantSpecies, mediaAvailable, packMedia, PLANT_SPECIES, receiveCuttings, takeCuttingsForGift, type PlantSpeciesId } from '../sim';
import type { Game } from '../game/game';
import type { CloudClient, FriendsOverview, Gift } from '../net/cloud';
import { h } from './dom';
import type { Sheet, Toasts } from './sheet';

export interface FriendsDeps {
  cloud: CloudClient;
  game: Game;
  sheet: Sheet;
  toasts: Toasts;
  /** 進入好友的缸（參觀模式）。 */
  visit: (username: string) => void;
  /** 打開雲端存檔面板（還沒登入時）。 */
  openCloud: () => void;
}

export const AFFINITY_LABELS = ['', '魚友', '熟識', '好友', '摯友'];

function giftText(g: Gift): string {
  if (g.kind === 'cuttings') return `${isPlantSpecies(g.payload.species) ? PLANT_SPECIES[g.payload.species].name : g.payload.species}插枝 ${g.payload.count} 株`;
  return `一份成熟濾材（${g.payload.filter}）`;
}

/** 收下禮物並放進目前這缸。 */
async function claim(deps: FriendsDeps, g: Gift): Promise<boolean> {
  const res = await deps.cloud.claimGift(g.id);
  if (!res.ok) {
    deps.toasts.show(res.message, 'warn');
    return false;
  }
  deps.game.act((st) => {
    if (g.kind === 'cuttings') receiveCuttings(st, g.payload.species, g.payload.count);
    else applyMedia(st, g.payload);
  });
  deps.toasts.show(g.kind === 'cuttings' ? `收下${giftText(g)}，可以到修剪或商店種下` : '把成熟濾材放進過濾器了，硝化菌會長得比較快');
  return true;
}

/** 好友面板：好友碼、加好友、邀請、好友清單、收到的禮物。 */
export function friendsPanel(deps: FriendsDeps): Node {
  const { cloud, sheet, toasts } = deps;
  if (!cloud.available || !cloud.session) {
    return h(
      'div.stack',
      {},
      h('p', {}, '加好友、參觀好友的缸、互送水草和濾材，要先登入雲端存檔。'),
      cloud.available ? h('button.btn.primary', { onclick: deps.openCloud }, '登入雲端存檔') : h('p.hint', {}, '雲端存檔還沒開放，好友功能也要等伺服器上線。'),
    );
  }
  const root = h('div.stack', {}, h('p.hint', {}, '讀取中…'));
  void (async () => {
    const [ov, inbox] = await Promise.all([cloud.friends(), cloud.gifts()]);
    if (!ov.ok) {
      root.replaceChildren(h('p', {}, ov.message));
      return;
    }
    root.replaceChildren(...renderOverview(deps, ov.value, inbox.ok ? inbox.value : []));
  })();
  return root;

  function renderOverview(d: FriendsDeps, ov: FriendsOverview, gifts: Gift[]): Node[] {
    const reopen = () => sheet.open('好友', () => friendsPanel(d));
    const codeInput = h('input.text-input', { type: 'text', placeholder: '輸入朋友的好友碼', maxlength: '8', autocapitalize: 'characters' }) as HTMLInputElement;
    const status = h('p.hint');
    const add = async () => {
      const res = await cloud.requestFriend(codeInput.value);
      if (!res.ok) {
        status.textContent = res.message;
        return;
      }
      toasts.show(res.value.status === 'friends' ? `你和 ${res.value.username} 成為好友了` : `已經邀請 ${res.value.username}，等他接受`);
      reopen();
    };
    return [
      h('div.item', {}, h('div', {}, h('div.hint', {}, '我的好友碼'), h('b.friend-code', {}, ov.code)), h('div.row', {},
        h('button.btn', { onclick: () => navigator.clipboard?.writeText(ov.code).then(() => toasts.show('複製了好友碼'), () => toasts.show(ov.code)) }, '複製'))),
      h('p.hint', {}, `你的缸被按了 ${ov.likes} 個讚 · 今天還能送 ${ov.sendLeft} 點、收 ${ov.receiveLeft} 點禮物`),
      h('div.row', {}, codeInput, h('button.btn.primary', { onclick: add }, '加好友')),
      status,
      ...(gifts.length
        ? [
            h('h3', {}, '收到的禮物'),
            ...gifts.map((g) =>
              h('div.item.gift', {}, h('div', {}, h('b', {}, giftText(g)), h('div.hint', {}, `${g.from} 送的${g.kind === 'media' && g.payload.ich ? '（他的缸最近有白點，濾材可能帶蟲）' : ''}`)),
                h('button.btn.primary', { onclick: async () => (await claim(d, g)) && reopen() }, '收下')),
            ),
          ]
        : []),
      ...(ov.incoming.length
        ? [
            h('h3', {}, '好友邀請'),
            ...ov.incoming.map((name) =>
              h('div.item', {}, h('b', {}, name), h('div.row', {},
                h('button.btn.primary', { onclick: async () => { const r = await cloud.acceptFriend(name); if (r.ok) toasts.show(`你和 ${name} 成為好友了`); else toasts.show(r.message, 'warn'); reopen(); } }, '接受'),
                h('button.btn', { onclick: async () => { await cloud.declineFriend(name); reopen(); } }, '婉拒'))),
            ),
          ]
        : []),
      h('h3', {}, `好友（${ov.friends.length}）`),
      ...(ov.friends.length === 0 ? [h('p.hint', {}, '還沒有好友。把好友碼傳給朋友，或輸入朋友的好友碼。')] : []),
      ...ov.friends.map((f) =>
        h('div.item', {}, h('div', {}, h('b', {}, f.username), h('div.hint', {}, `${AFFINITY_LABELS[f.level]} · 交情 ${f.affinity}${f.visitedToday ? ' · 今天參觀過' : ''}`)),
          h('div.row', {},
            h('button.btn.primary', { onclick: () => d.visit(f.username) }, '參觀'),
            h('button.btn', { onclick: () => sheet.open(`送禮給 ${f.username}`, () => giftPanel(d, f.username, ov.sendLeft)) }, '送禮'))),
      ),
      ...(ov.outgoing.length ? [h('p.hint', {}, `等待回覆：${ov.outgoing.join('、')}`)] : []),
      h('p.hint', {}, '每天參觀、按讚、送禮會累積交情。交情越深，之後能做的事越多（送魚、合作繁殖、旅行託管）。'),
    ];
  }
}

/** 送禮：手上的插枝、成熟濾材。 */
export function giftPanel(deps: FriendsDeps, to: string, sendLeft: number): Node {
  const { cloud, game, sheet, toasts } = deps;
  const cuttings = economy(game.state).cuttings;
  const back = () => sheet.open('好友', () => friendsPanel(deps));
  const sendCuttings = async (species: PlantSpeciesId, count: number) => {
    if (!game.act((st) => takeCuttingsForGift(st, species, count))) return;
    const res = await cloud.sendGift(to, { kind: 'cuttings', payload: { species, count } });
    if (!res.ok) {
      game.act((st) => receiveCuttings(st, species, count));
      toasts.show(res.message, 'warn');
      return;
    }
    toasts.show(`送了 ${PLANT_SPECIES[species].name}插枝 ${count} 株給 ${to}`);
    back();
  };
  const sendMedia = async () => {
    const pack = game.act((st) => packMedia(st));
    if (!pack) {
      toasts.show('濾材還不夠成熟，養水完成後再送', 'warn');
      return;
    }
    const res = await cloud.sendGift(to, { kind: 'media', payload: { bacteria: pack.bacteria, filter: pack.filter, ich: pack.ich } });
    if (!res.ok) {
      game.act((st) => applyMedia(st, { ...pack, ich: false }));
      toasts.show(res.message, 'warn');
      return;
    }
    toasts.show(`分了一份濾材給 ${to}，自己的過濾器少了一點菌`);
    back();
  };
  const species = (Object.keys(PLANT_SPECIES) as PlantSpeciesId[]).filter((id) => (cuttings[id] ?? 0) > 0);
  const media = mediaAvailable(game.state) > 0;
  return h(
    'div.stack',
    {},
    h('p.hint', {}, `今天還能送 ${sendLeft} 點（插枝一株 1 點、濾材 2 點）。`),
    h('h3', {}, '水草插枝'),
    ...(species.length === 0 ? [h('p.hint', {}, '手上沒有插枝。修剪長滿的水草就會有。')] : []),
    ...species.map((id) => {
      const n = cuttings[id] ?? 0;
      return h('div.item', {}, h('div', {}, h('b', {}, PLANT_SPECIES[id].name), h('div.hint', {}, `手上有 ${n} 株`)), h('div.row', {},
        h('button.btn', { onclick: () => sendCuttings(id, 1) }, '送 1'),
        n >= 3 ? h('button.btn', { onclick: () => sendCuttings(id, Math.min(n, 5)) }, `送 ${Math.min(n, 5)}`) : null));
    }),
    h('h3', {}, '成熟濾材'),
    h('div.item', {}, h('div', {}, h('b', {}, '分一份濾材'), h('div.hint', {}, media ? '朋友的新缸可以更快養好水；你的過濾器會少一點菌。缸裡有白點蟲時，蟲卵會跟著過去。' : '濾材還不夠成熟（養水完成後才能分）。')),
      h('button.btn', { onclick: sendMedia, disabled: !media }, '送')),
  );
}
