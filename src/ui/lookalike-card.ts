import { lookIndex, type GuppyPhenotype, type LookalikeCard, type TraitFrom } from '../sim';
import { h } from './dom';
import { femaleArtOf, guppyArt, maleFinOf } from './shop-cards';

/**
 * 早上報告的「長得像誰」比較卡（polish-to-9.md G2，資料在 sim/lookalike.ts）：
 * 媽媽、爸爸、小魚（長大後的樣子）三張圖並排，下面每個特徵一顆小標，顏色說明跟誰的。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

const FROM_LABEL: Record<TraitFrom, string> = { mother: '像媽媽', father: '像爸爸', both: '爸媽都有', hidden: '隔代冒出來' };

/** 公魚的圖：品系的花色加鰭型；母魚身上是素的，只有尾巴帶品系的顏色。 */
function phenoArt(p: GuppyPhenotype, sex: 'male' | 'female'): string {
  if (sex === 'female') return femaleArtOf(p);
  return guppyArt(lookIndex(p), maleFinOf(p));
}

function portrait(label: string, p: GuppyPhenotype, sex: 'male' | 'female', cls: string): HTMLElement {
  return h(
    `figure.la-fish.${cls}`,
    {},
    h(`img${p.albino ? '.albino' : ''}`, { src: ART + phenoArt(p, sex), alt: '', draggable: 'false' }),
    h('figcaption', {}, label),
  );
}

export function lookalikeVisual(card: LookalikeCard): HTMLElement {
  const won = card.looksLike === 'mother' ? 'mom' : card.looksLike === 'father' ? 'dad' : '';
  return h(
    'div.la',
    {},
    h(
      'div.la-row',
      {},
      portrait('媽媽', card.mother, 'female', `mom${won === 'mom' ? '.won' : ''}`),
      h('span.la-plus', { 'aria-hidden': 'true' }, '＋'),
      portrait('爸爸', card.father, 'male', `dad${won === 'dad' ? '.won' : ''}`),
      h('span.la-arrow', { 'aria-hidden': 'true' }, '→'),
      portrait('長大後', card.child, 'male', 'kid'),
    ),
    h('div.la-traits', {}, ...card.traits.map((t) => h(`span.la-trait.${t.from}`, { title: FROM_LABEL[t.from] }, t.name, h('small', {}, FROM_LABEL[t.from])))),
  );
}
