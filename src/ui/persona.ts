import { isShrimpSpecies, personalityOf, personalitySpec, type Fish } from '../sim';
import { h } from './dom';

/** 點魚卡標題下的個性標籤（F6，每種個性一個顏色）；蝦沒有個性。 */
export function personaChip(fish: Fish): HTMLElement | null {
  if (isShrimpSpecies(fish.species)) return null;
  const p = personalityOf(fish);
  const spec = personalitySpec(fish);
  return h(`span.persona-chip.${p}`, { title: spec.blurb }, h('i', { 'aria-hidden': 'true' }), spec.label);
}

/** 詳細面板的一行：「個性：好奇・手指點哪裡就游過去看看」。 */
export function personaLine(fish: Fish): HTMLElement | null {
  const chip = personaChip(fish);
  if (!chip) return null;
  return h('p.persona-line', {}, chip, h('span', {}, personalitySpec(fish).blurb));
}
