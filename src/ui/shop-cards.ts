import type { AppleColor, FishSpeciesId, PlantSpeciesId, SnailKind } from '../sim';
import { artImg, ownerImg, type ArtIcon } from './art-icons';
import { h } from './dom';

/**
 * 商店圖卡（介面改版）：每個商品一張卡，上面是商品圖、下面是名字、價錢徽章、幾個小標籤和購買按鈕。
 * 長長的說明收進「阿德老闆的建議」，想看再點開，畫面不再是一整片文字。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

/** 孔雀魚品系（GUPPY_STRAINS 的順序）對應的精繪圖。 */
const GUPPY_STRAIN_ART = ['guppy-male-bluegrass', 'guppy-male-cobra', 'guppy-male-albino-red', 'guppy-male-tuxedo', 'guppy-male-redcobra'];

export function guppyArt(strain: number, fin?: string): string {
  const base = GUPPY_STRAIN_ART[strain] ?? GUPPY_STRAIN_ART[0];
  const shape = fin === 'swallow' ? 'swallow' : fin === 'ribbon' ? 'ribbon' : fin === 'halfmoon' || fin === 'bigC' ? 'halfmoon' : '';
  return `fish/${base}${shape ? `-${shape}` : ''}.webp`;
}

const SPECIES_ART: Record<FishSpeciesId, string> = {
  guppy: 'fish/guppy-male-bluegrass.webp',
  zebrafish: 'fish/zebrafish-male.webp',
  cherry_shrimp: 'shrimp/shrimp-cherry-female.webp',
  apisto: 'fish/apisto-male.webp',
  betta: 'fish/betta-male-red.webp',
  crystal_shrimp: 'shrimp/shrimp-crystal-female.webp',
};

export function speciesArt(id: FishSpeciesId, sex?: 'male' | 'female'): string {
  if (id === 'betta' && sex === 'female') return 'fish/betta-female.webp';
  return SPECIES_ART[id];
}

/** 剛出生的小魚、小蝦（生小魚的慶祝卡）。 */
export function fryArt(id: FishSpeciesId): string {
  switch (id) {
    case 'betta':
      return 'fish/betta-fry.webp';
    case 'apisto':
      return 'fish/apisto-fry.webp';
    case 'cherry_shrimp':
      return 'shrimp/shrimp-cherry-juvenile.webp';
    case 'crystal_shrimp':
      return 'shrimp/shrimp-crystal-juvenile.webp';
    default:
      // 一群小小的仔魚：單一條放大看起來像成魚
      return 'fish/guppy-fry-school.webp';
  }
}

export function snailArt(kind: SnailKind, color?: AppleColor): string {
  if (kind === 'apple') return `snail/snail-apple-${color ?? 'gold'}.webp`;
  return kind === 'nerite' ? 'snail/snail-nerite-zebra.webp' : 'snail/snail-assassin.webp';
}

export function plantArt(id: PlantSpeciesId): string {
  return `scape/plant-${id}.webp`;
}

export interface CardSpec {
  /** public/art 底下的圖；沒有就用插畫風圖示。 */
  art?: string;
  icon?: ArtIcon;
  name: string;
  /** 價錢（元）；null 不顯示（例如免費的插枝）。 */
  price: number | null;
  /** 價錢後面的單位，例如「/隻」。 */
  unit?: string;
  chips?: string[];
  /** 角落的小徽章（使用中、缸裡有幾組…）。 */
  badge?: string;
  note?: string;
  actions: Node[];
  cls?: string;
}

/** 價錢徽章：金幣＋數字。 */
export function priceTag(price: number, unit = ''): HTMLElement {
  return h('span.price-tag', {}, h('i.coin'), h('b', {}, price.toLocaleString('zh-TW')), unit ? h('small', {}, unit) : '');
}

export function shopCard(c: CardSpec): HTMLElement {
  const pic = h('div.card-pic');
  if (c.art) {
    const img = h('img', { src: ART + c.art, alt: '', loading: 'lazy', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    pic.append(img);
  } else if (c.icon) pic.append(artImg(c.icon, 'card-icon'));
  if (c.badge) pic.append(h('span.card-badge', {}, c.badge));
  return h(
    `div.shop-card${c.cls ?? ''}`,
    {},
    pic,
    h(
      'div.card-body',
      {},
      h('b.card-name', {}, c.name),
      c.price !== null ? priceTag(c.price, c.unit) : '',
      c.chips?.length ? h('div.card-chips', {}, ...c.chips.map((t) => h('span', {}, t))) : '',
      c.note ? h('p.card-note', {}, c.note) : '',
      h('div.card-actions', {}, ...c.actions),
    ),
  );
}

export function cardGrid(...cards: Node[]): HTMLElement {
  return h('div.card-grid', {}, ...cards);
}

/** 阿德老闆的建議：預設收起來，點開才看長說明。 */
export function advice(lines: Array<string | null | undefined | false>, open = false): HTMLElement {
  const items = lines.filter((l): l is string => !!l);
  const d = h(
    'details.advice',
    {},
    h('summary', {}, ownerImg('advice-avatar'), h('span', {}, '阿德老闆的建議'), h('small', {}, `${items.length} 則`)),
    h('ul', {}, ...items.map((t) => h('li', {}, t))),
  );
  if (open) d.setAttribute('open', '');
  return d;
}

/** 有圖的分頁籤。 */
export function iconTabs<T extends string>(tabs: Array<{ id: T; label: string; art?: string; icon?: ArtIcon }>, active: T, onPick: (id: T) => void): HTMLElement {
  return h(
    'div.icon-tabs',
    {},
    ...tabs.map((t) => {
      const pic = t.art ? h('img', { src: ART + t.art, alt: '', draggable: 'false' }) : t.icon ? artImg(t.icon, 'tab-icon') : '';
      return h(`button.icon-tab${t.id === active ? '.active' : ''}`, { onclick: () => onPick(t.id) }, h('span.tab-pic', {}, pic), h('span', {}, t.label));
    }),
  );
}
