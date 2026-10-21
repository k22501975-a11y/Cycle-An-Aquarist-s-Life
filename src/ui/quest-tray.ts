import { DREAM_FISH, economy, GUPPY_STRAIN_PRICES, GUPPY_STRAINS, HARDSCAPE, PLANT_PRICES, PLANT_SPECIES, price, type PlantSpeciesId, type TankState } from '../sim';
import { h } from './dom';
import { guppyArt, HARDSCAPE_ART, plantArt, priceTag } from './shop-cards';

/**
 * 任務卡下面那排一鍵買（#235，遊戲性評測第 13 輪）：前 5 分鐘大半點擊花在商店、切分頁、往下找。
 * 教學要買魚、水草、石頭時，任務卡下面直接排 2～3 張圖卡，點一下就開始對水，或把草、石頭拿在手上拖進缸。
 * 想自己挑的人點最後一張「其他」去商店。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

export type QuickKind = 'fish' | 'plant' | 'stone';
export type HardscapeId = keyof typeof HARDSCAPE;

export type QuickPick = { kind: 'fish'; strains: [male: number, female: number] } | { kind: 'plant'; id: PlantSpeciesId } | { kind: 'stone'; id: HardscapeId };

interface Choice {
  pick: QuickPick;
  art: string;
  name: string;
  sub?: string;
  price: number;
  /** 夢想魚的配方：卡上多一個「夢想魚」標。 */
  dream?: boolean;
}

/** 夢想魚的配方（dream.ts）：紅蛇王公魚配白子全紅母魚。 */
const DREAM_PAIR: [number, number] = [GUPPY_STRAINS.indexOf('紅蛇王'), GUPPY_STRAINS.indexOf('白子全紅')];
const STONES: HardscapeId[] = ['lava', 'slate', 'driftwood'];

const pairPrice = ([m, f]: [number, number]) => GUPPY_STRAIN_PRICES[m] + GUPPY_STRAIN_PRICES[f] * 2;

export function quickChoices(kind: QuickKind): Choice[] {
  if (kind === 'fish') {
    const blue: [number, number] = [0, 0];
    return [
      { pick: { kind: 'fish', strains: DREAM_PAIR }, art: guppyArt(DREAM_PAIR[0]), name: '夢想魚配對', sub: `${GUPPY_STRAINS[DREAM_PAIR[0]]}♂＋${GUPPY_STRAINS[DREAM_PAIR[1]]}♀×2`, price: pairPrice(DREAM_PAIR), dream: true },
      { pick: { kind: 'fish', strains: blue }, art: guppyArt(0), name: `${GUPPY_STRAINS[0]}一公兩母`, sub: '最便宜、好養', price: pairPrice(blue) },
    ];
  }
  if (kind === 'plant') {
    // 新手的燈不一定夠亮：只推弱光也長得好的，便宜的排前面
    const ids = (Object.keys(PLANT_SPECIES) as PlantSpeciesId[]).filter((id) => PLANT_SPECIES[id].lightType !== 'high').sort((a, b) => PLANT_PRICES[a] - PLANT_PRICES[b]);
    return ids.slice(0, 3).map((id) => ({ pick: { kind: 'plant', id }, art: plantArt(id), name: PLANT_SPECIES[id].name, sub: '弱光可', price: PLANT_PRICES[id] }));
  }
  return STONES.map((id) => ({ pick: { kind: 'stone', id }, art: HARDSCAPE_ART[id], name: HARDSCAPE[id].name, price: price(`hardscape:${id}`) }));
}

/** 任務卡下面的一排圖卡；buy 一鍵買，more 去商店自己挑。 */
export function questTray(kind: QuickKind, state: TankState, buy: (pick: QuickPick) => void, more: () => void): HTMLElement {
  const coins = economy(state).coins;
  const card = (c: Choice) =>
    h(
      `button.qt-card${c.dream ? '.dream' : ''}${coins < c.price ? '.short' : ''}`,
      { onclick: () => buy(c.pick), title: c.dream ? `${DREAM_FISH.name}的配方：${c.sub}` : c.name },
      c.dream ? h('span.qt-badge', {}, '夢想魚') : null,
      h(`img.qt-art.${kind}`, { src: ART + c.art, alt: '', draggable: 'false' }),
      h('span.qt-name', {}, c.name),
      c.sub ? h('small.qt-sub', {}, c.sub) : null,
      priceTag(c.price),
    );
  return h('div.qt-row', {}, ...quickChoices(kind).map(card), h('button.qt-more', { onclick: more, title: '去商店自己挑' }, h('span', {}, '其他'), h('small', {}, '去商店')));
}
