import type { ChoiceCard, GuppyPhenotype, PairCandidate, PickFish } from '../sim';
import { h } from './dom';
import { femaleArtOf, guppyArt, maleFinOf } from './shop-cards';

/**
 * 早上報告裡的選擇卡（design/midgame.md C1～C5，資料在 sim/choices.ts）：選項一列，每個寫後果，推薦的標出來。
 * C2 選種卡是一窩魚排一排，點了標留種（最多 1 公 2 母）；C4 是候選公魚並排，附這對生出夢想魚的機率。
 * 先用玻璃面板的簡單樣子，選種卡、配對比較卡的正式版由美術換掉。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

function fishImg(look: number, p: GuppyPhenotype, sex: 'male' | 'female'): HTMLElement {
  const src = ART + (sex === 'female' ? femaleArtOf(p) : guppyArt(look, maleFinOf(p)));
  return h(`img${p.albino ? '.albino' : ''}`, { src, alt: '', draggable: 'false' });
}

/** 選了一個選項：picks 是 C2 要留種的魚。回傳錯誤訊息（顯示在卡上），成功回傳 null。 */
export type ChoosePick = (key: string, picks: number[]) => string | null;

function pickRow(card: ChoiceCard, chosen: Set<number>, refresh: () => void): HTMLElement {
  const limit = card.pickLimit ?? { male: 1, female: 2 };
  const count = (sex: 'male' | 'female') => card.fish!.filter((f) => f.sex === sex && chosen.has(f.fishId)).length;
  const chip = (f: PickFish) =>
    h(
      `button.choice-fish${chosen.has(f.fishId) ? '.on' : ''}`,
      {
        type: 'button',
        'aria-pressed': String(chosen.has(f.fishId)),
        onclick: (e: Event) => {
          e.stopPropagation();
          if (chosen.has(f.fishId)) chosen.delete(f.fishId);
          else {
            // 同性別滿了：換掉先選的那尾
            if (count(f.sex) >= limit[f.sex]) {
              const old = card.fish!.find((x) => x.sex === f.sex && chosen.has(x.fishId));
              if (old) chosen.delete(old.fishId);
            }
            chosen.add(f.fishId);
          }
          refresh();
        },
      },
      fishImg(f.look, f.pheno, f.sex),
      h('b', {}, `${f.sex === 'male' ? '♂' : '♀'} ${f.name}`),
      h('small', {}, f.missing.length ? `還差：${f.missing.join('、')}` : '就是夢想魚！'),
    );
  return h('div.choice-fish-row', {}, ...card.fish!.map(chip));
}

function candidateLine(c: PairCandidate): HTMLElement {
  return h('span.choice-cand', {}, fishImg(c.look, c.pheno, 'male'), h('small', {}, c.kids.map((k) => `${k.name} ${k.pct}%`).join('、')));
}

export function choiceVisual(card: ChoiceCard, choose: ChoosePick): HTMLElement {
  const chosen = new Set<number>((card.fish ?? []).filter((f) => f.keeper).map((f) => f.fishId));
  const msg = h('p.choice-msg', { hidden: true });
  const fishBox = h('div', {});
  const draw = () => {
    if (card.fish) fishBox.replaceChildren(pickRow(card, chosen, draw));
  };
  draw();
  const options = card.options.map((o) => {
    const cand = card.candidates?.find((c) => String(c.fishId) === o.key);
    return h(
      `button.choice-opt${o.recommended ? '.rec' : ''}`,
      {
        type: 'button',
        onclick: (e: Event) => {
          e.stopPropagation();
          const why = choose(o.key, [...chosen]);
          if (why) {
            msg.textContent = why;
            msg.hidden = false;
          }
        },
      },
      h('b', {}, o.label, o.recommended ? h('em', {}, '推薦') : null),
      cand ? candidateLine(cand) : null,
      h('small', {}, o.outcome),
    );
  });
  return h('div.choice', {}, h('p.choice-owner', {}, card.owner), card.fish ? fishBox : null, h('div.choice-opts', {}, ...options), msg);
}
