import type { ChoiceCard } from '../sim';
import type { FishLook } from './breeding-cards';
import { h } from './dom';

/**
 * 早上報告裡的選擇卡（design/midgame.md C1～C5，資料在 sim/choices.ts）：
 * C2 是選種卡（一窩寶貝卡，點了掛留種緞帶），C4 是配對比較卡（候選公魚並排、機率星星），
 * C5 是交單還是留著，C1、C3 是二選一的圖卡。卡片的樣子在 breeding-cards.ts，
 * 早上報告出卡時才載入（開機必載的預算留給開局）。
 */

/** 選了一個選項：picks 是 C2 要留種的魚。回傳錯誤訊息（顯示在卡上），成功回傳 null。 */
export type ChoosePick = (key: string, picks: number[]) => string | null;

/** 照魚的編號找牠的樣子（C4 的母魚、C5 那尾魚；卡上只有編號）。 */
export type FishLookup = (fishId: number) => FishLook | null;

export function choiceVisual(card: ChoiceCard, choose: ChoosePick, lookup: FishLookup = () => null): HTMLElement {
  const msg = h('p.choice-msg', { hidden: true });
  const pick = (key: string, picks: number[] = []) => {
    const why = choose(key, picks);
    msg.textContent = why ?? '';
    msg.hidden = !why;
  };
  const box = h('div.choice', {}, h('p.choice-owner', {}, card.owner));
  void import('./breeding-cards')
    .then((bc) => fill(bc, card, box, pick, lookup))
    // 載不到卡片（離線更新到一半之類）：退回一排文字按鈕，照樣選得了
    .catch(() => box.append(h('div.bc-opts', {}, ...card.options.map((o) => h(`button.btn.small${o.recommended ? '.primary' : ''}`, { type: 'button', onclick: () => pick(o.key) }, o.label)))))
    .then(() => box.append(msg));
  return box;
}

function fill(bc: typeof import('./breeding-cards'), card: ChoiceCard, box: HTMLElement, pick: (key: string, picks?: number[]) => void, lookup: FishLookup): void {
  const { CHOICE_ART, choiceCard, keepOrSellCard, keeperPickCard, sireCompareCard } = bc;

  if (card.fish && card.id === 'C2') {
    const limit = card.pickLimit ?? { male: 1, female: 2 };
    const chosen = new Set<number>(card.fish.filter((f) => f.keeper).map((f) => f.fishId));
    const slot = h('div', {});
    const later = card.options.find((o) => o.key === 'later');
    const draw = () =>
      slot.replaceChildren(
        keeperPickCard(
          card.fish!.map((f) => ({ ...f, keeper: chosen.has(f.fishId) })),
          limit,
          (id, on) => {
            if (on) chosen.add(id);
            else chosen.delete(id);
            draw();
          },
          () => pick('pick', [...chosen]),
          later ? { label: later.label, go: () => pick('later') } : undefined,
        ),
      );
    draw();
    box.append(slot);
  } else if (card.candidates && card.id === 'C4') {
    const mother = card.motherId !== undefined ? lookup(card.motherId) : null;
    // 第一窩配對多半只有孫代會出夢想魚：機率取小魚、孫代高的那個
    const cands = card.candidates.map((c) => ({ ...c, dreamPct: Math.max(c.dreamPct, c.grandPct) }));
    box.append(sireCompareCard(mother ?? { sex: 'female', name: '', look: 0, fins: [] }, cands, (id) => pick(String(id))));
  } else if (card.trade && card.id === 'C5') {
    const fish = lookup(card.trade.fishId);
    box.append(fish ? keepOrSellCard(fish, card.trade, () => pick('sell'), () => pick('keep')) : choiceCard(card.title, card.options, (key) => pick(key), CHOICE_ART));
  } else {
    box.append(choiceCard(card.title, card.options, (key) => pick(key), CHOICE_ART));
  }
}
