import { DREAM_FISH, GUPPY_FIN_STRAINS, GUPPY_STRAINS, previewShopPair, type FinTrait, type PreviewKid } from '../sim';
import { h } from './dom';
import { femaleGuppyArt, guppyArt } from './shop-cards';

/**
 * 選魚當下就看得到後果（polish-to-9.md §6 P3）：商店孔雀魚頁最上面「配一對看看」，
 * 挑一尾母魚、一尾公魚，馬上看到 2～3 尾小魚的顏色、尾形和機率（十顆點表示）。
 * 預設是夢想魚配方（全紅白子母 × 紅蛇王公），點孫代那排就看得到白子紅蛇王的影子。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

export interface GuppyPick {
  name: string;
  strain: number;
  fin?: FinTrait;
}

export const GUPPY_PICKS: GuppyPick[] = [...GUPPY_STRAINS.map((name, strain) => ({ name, strain })), ...GUPPY_FIN_STRAINS.map((f) => ({ name: f.name, strain: f.strain, fin: f.fin }))];

/** 預設夢想魚的配方：全紅白子母、紅蛇王公。 */
const pick = { mother: DREAM_FISH.parents.female, father: DREAM_FISH.parents.male };

export function kidArt(k: PreviewKid): string {
  // 母魚身上是素的，只有尾巴帶品系的顏色
  if (k.sex === 'female') return femaleGuppyArt(k.look);
  const has = (f: string) => k.fins.includes(f);
  const shape = has('大C') ? 'bigc' : has('緞帶') ? 'ribbon' : has('燕尾') ? 'swallow' : has('雙劍') ? 'sword3' : has('上劍') ? 'sword1' : has('下劍') ? 'sword2' : k.tailShape === 'halfmoon' || has('半月') ? 'halfmoon' : undefined;
  return guppyArt(k.look, shape);
}

/** 十顆點亮幾顆：幾成就亮幾顆，不到一成也亮一顆。 */
export const dotsOn = (pct: number): number => Math.min(10, Math.max(1, Math.round(pct / 10)));

function pctDots(pct: number): HTMLElement {
  const on = dotsOn(pct);
  return h('span.pp-dots', { title: `約 ${pct}%`, 'aria-label': `約 ${pct}%` }, ...Array.from({ length: 10 }, (_, i) => h(`i${i < on ? '.on' : ''}`)));
}

function kidCard(k: PreviewKid): HTMLElement {
  const albino = k.name.includes('白子');
  const dream = k.sex === 'male' && k.name === DREAM_FISH.name;
  return h(
    `div.pp-kid.${k.sex}${dream ? '.dream' : ''}`,
    {},
    dream ? h('span.pp-dream-badge', {}, '夢想魚！') : null,
    h(`img.pp-kid-art${albino ? '.albino' : ''}`, { src: ART + kidArt(k), alt: '', draggable: 'false' }),
    h('span.pp-kid-name', {}, h('i.pp-sex', {}, k.sex === 'male' ? '♂' : '♀'), k.name, k.fins.length ? `・${k.fins.join('')}` : ''),
    pctDots(k.pct),
  );
}

function row(title: string, sub: string, kids: PreviewKid[], cls = ''): HTMLElement | null {
  if (!kids.length) return null;
  return h(`div.pp-row${cls}`, {}, h('div.pp-row-head', {}, h('b', {}, title), h('small', {}, sub)), h('div.pp-kids', {}, ...kids.map(kidCard)));
}

function chooser(label: string, sex: 'mother' | 'father', refresh: () => void): HTMLElement {
  return h(
    'div.pp-chooser',
    {},
    h('span.pp-chooser-label', {}, label),
    h(
      'div.pp-chips',
      {},
      ...GUPPY_PICKS.map((p, i) =>
        h(
          `button.pp-chip${pick[sex] === i ? '.active' : ''}`,
          { title: p.name, onclick: () => ((pick[sex] = i), refresh()) },
          h('img', { src: ART + guppyArt(p.strain, p.fin), alt: '', draggable: 'false' }),
          h('span', {}, p.name),
        ),
      ),
    ),
  );
}

/** 商店孔雀魚頁的「配一對看看」：buy(sex, pick) 給這尾的購買按鈕（照商店原本的買法）。 */
export function pairPreviewCard(buy: (sex: 'male' | 'female', p: GuppyPick) => void): HTMLElement {
  const box = h('details.pp', { open: true });
  const render = () => {
    const mom = GUPPY_PICKS[pick.mother];
    const dad = GUPPY_PICKS[pick.father];
    const pv = previewShopPair(mom, dad);
    const parts: Array<HTMLElement | null> = [
      h('summary', {}, h('b', {}, '配一對看看'), h('small', {}, '　挑公母，看看會生出什麼')),
      chooser('母', 'mother', render),
      chooser('公', 'father', render),
      row('跟這尾公魚生的', `${mom.name} × ${dad.name}`, pv.withYourMale),
      row('孫代才會冒出來', '小魚長大後兄妹再配', pv.grandkids, '.surprise'),
      row('店裡買的母魚多半已經懷孕', '第一窩是跟同品系的公魚生的', pv.firstBrood, '.first'),
      h(
        'div.pp-buy',
        {},
        h('button.btn.small', { onclick: () => buy('female', mom) }, `買這尾母魚`),
        h('button.btn.small.primary', { onclick: () => buy('male', dad) }, `買這尾公魚`),
      ),
    ];
    box.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  };
  render();
  return box;
}
