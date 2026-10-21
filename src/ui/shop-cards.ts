import type { AppleColor, FishSpeciesId, GuppyPhenotype, PlantSpeciesId, SnailKind } from '../sim';
import { artImg, ownerImg, type ArtIcon } from './art-icons';
import { h } from './dom';

/**
 * 商店圖卡（介面改版）：每個商品一張卡，上面是商品圖、下面是名字、價錢徽章、幾個小標籤和購買按鈕。
 * 長長的說明收進「阿德老闆的建議」，想看再點開，畫面不再是一整片文字。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

/** 孔雀魚品系（GUPPY_STRAINS 的順序）對應的精繪圖。 */
const GUPPY_STRAIN_ART = ['guppy-male-bluegrass', 'guppy-male-cobra', 'guppy-male-albino-red', 'guppy-male-tuxedo', 'guppy-male-redcobra'];

/** 鰭型 → 整條魚圖的後綴（店裡的「雙劍」用雙劍圖；大耳沒有整條魚圖，用基本款）。 */
const FIN_ART: Record<string, string> = { swallow: 'swallow', ribbon: 'ribbon', halfmoon: 'halfmoon', bigC: 'bigc', bigc: 'bigc', sword: 'sword3', sword1: 'sword1', sword2: 'sword2', sword3: 'sword3' };

export function guppyArt(strain: number, fin?: string): string {
  const base = GUPPY_STRAIN_ART[strain] ?? GUPPY_STRAIN_ART[0];
  const shape = fin ? FIN_ART[fin] : undefined;
  return `fish/${base}${shape ? `-${shape}` : ''}.webp`;
}

/** 品系 → 母魚尾巴的顏色（scripts/art/guppy-females.py）：草尾、禮服是藍尾，蛇王金或紅，全紅白子淡紅尾紅眼。 */
const FEMALE_STRAIN_TINT = ['blue', 'gold', 'albino', 'blue', 'red'];

export function femaleGuppyArt(strain: number): string {
  return `fish/guppy-female-base-${FEMALE_STRAIN_TINT[strain] ?? 'blue'}.webp`;
}

/** 照基因挑母魚圖（和缸裡 painted.ts 的 femaleTint 一樣）。 */
export function femaleArtOf(p: GuppyPhenotype): string {
  const tint = p.albino ? 'albino' : p.gold && !p.tuxedo ? 'gold' : p.red ? 'red' : 'blue';
  return `fish/guppy-female-base-${tint}.webp`;
}

/** 照基因挑公魚的鰭型圖（和缸裡 phenotype-art.ts 的 wholeFin 同樣的先後）。 */
export function maleFinOf(p: GuppyPhenotype): string | undefined {
  return p.bigC ? 'bigc' : p.ribbon ? 'ribbon' : p.swallow ? 'swallow' : p.sword ? `sword${p.sword}` : p.tailShape === 'halfmoon' ? 'halfmoon' : undefined;
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

/** 造景石、沉木的商店圖。 */
export const HARDSCAPE_ART: Record<string, string> = { seiryu: 'scape/rock-seiryu-1.webp', lava: 'gear/rock-lava.webp', slate: 'gear/rock-slate.webp', driftwood: 'scape/wood-spider-1.webp' };

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
