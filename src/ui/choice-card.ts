import type { ChoiceCard } from '../sim/choices';
import type { FishLook } from './breeding-cards';
import { h } from './dom';

/**
 * 早上報告裡的選擇卡（design/midgame.md C1～C5，資料在 sim/choices.ts）：
 * C11 是公母分開養（母魚游進育幼盒的動畫）；C2 是選種卡（一窩寶貝卡，點了掛留種緞帶），C4 是配對比較卡（候選公魚並排、機率星星），
 * C5 是交單還是留著，C1、C3 是二選一的圖卡。卡片的樣子在 breeding-cards.ts，
 * 早上報告出卡時才載入（開機必載的預算留給開局）。
 */

/** 選了一個選項：picks 是 C2 要留種的魚，text 是 C18 玩家打的品系名。回傳錯誤訊息（顯示在卡上），成功回傳 null。 */
export type ChoosePick = (key: string, picks: number[], text?: string) => string | null;

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
    .then((bc) => fill(bc, card, box, pick, lookup, (name) => choose('name', [], name)))
    // 載不到卡片（離線更新到一半之類）：退回一排文字按鈕，照樣選得了
    .catch(() => box.append(h('div.bc-opts', {}, ...card.options.map((o) => h(`button.btn.small${o.recommended ? '.primary' : ''}`, { type: 'button', onclick: () => pick(o.key) }, o.label)))))
    .then(() => box.append(...(card.note ? [h('p.choice-note', {}, card.note)] : []), msg));
  return box;
}

function fill(bc: typeof import('./breeding-cards'), card: ChoiceCard, box: HTMLElement, pick: (key: string, picks?: number[]) => void, lookup: FishLookup, named: (name: string) => string | null): void {
  const { CHOICE_ART, choiceCard, keepOrSellCard, keeperPickCard, sireCompareCard } = bc;
  const naming = card.naming;

  // 已取名品系的魚：從 lookup 拿品系名（核心的 PickFish／PairCandidate 不帶）
  const withLine = <T extends { fishId: number }>(f: T): T & { line?: string | null } => ({ ...f, line: lookup(f.fishId)?.line });
  if (card.fish) card = { ...card, fish: card.fish.map(withLine) };
  if (card.candidates) card = { ...card, candidates: card.candidates.map(withLine) };

  if (naming && card.fish) {
    // C18：錯誤訊息（字詞檢查不過）顯示在名字框下面，不用卡底下那行
    const later = card.options.find((o) => o.key === 'later');
    box.append(bc.namingScene(card.fish, naming, named, later ? { label: later.label, go: () => pick('later') } : undefined));
  } else if (card.fish && card.id === 'C2') {
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
    // 公魚帶白子的話小魚就有機會出夢想魚，不然要等孫代：機率取小魚、孫代高的那個
    const cands = card.candidates.map((c) => ({ ...c, direct: c.dreamPct > 0 && c.dreamPct >= c.grandPct, dreamPct: Math.max(c.dreamPct, c.grandPct) }));
    box.append(sireCompareCard(mother ?? { sex: 'female', name: '', look: 0, fins: [] }, cands, (id) => pick(String(id))));
  } else if (card.trade && card.id === 'C5') {
    const fish = lookup(card.trade.fishId);
    box.append(fish ? keepOrSellCard(fish, card.trade, () => pick('sell'), () => pick('keep')) : choiceCard(card.title, card.options, (key) => pick(key), CHOICE_ART));
  } else if (card.checks) {
    box.append(checkCard(card, pick));
  } else if (card.options.some((o) => o.key === 'split')) {
    // C11 公母分開養：母魚游進育幼盒的動畫在選項上面
    const mom = card.motherId !== undefined ? lookup(card.motherId) : null;
    const dad = card.fatherId !== undefined ? lookup(card.fatherId) : null;
    box.append(choiceCard(card.title, card.options, (key) => pick(key), CHOICE_ART, bc.splitScene(mom, dad)));
  } else {
    box.append(choiceCard(card.title, card.options, (key) => pick(key), CHOICE_ART));
  }
}

/**
 * 可以一起勾的選項（C13 加活餌、調高水溫，#335）：推薦的先勾好，按「就這樣」送出。
 * 都沒勾是 standard、都勾是 both、勾一個就是那一個。
 */
function checkCard(card: ChoiceCard, pick: (key: string) => void): HTMLElement {
  const on = new Set(card.checks!.filter((k) => card.options.some((o) => o.key === k && o.recommended && !o.disabled)));
  const row = (key: string) => {
    const o = card.options.find((x) => x.key === key)!;
    const btn = h(
      `button.choice-check${on.has(key) ? '.on' : ''}`,
      {
        type: 'button',
        disabled: !!o.disabled,
        'aria-pressed': String(on.has(key)),
        onclick: () => {
          if (on.has(key)) on.delete(key);
          else on.add(key);
          btn.classList.toggle('on', on.has(key));
          btn.setAttribute('aria-pressed', String(on.has(key)));
        },
      },
      h('span.choice-check-box', { 'aria-hidden': 'true' }),
      h('span.choice-check-text', {}, h('b', {}, o.label), h('small', {}, o.disabled ?? o.outcome)),
    );
    return btn;
  };
  const go = () => pick(on.size === 0 ? 'standard' : on.size === card.checks!.length ? 'both' : [...on][0]);
  return h('div.choice-checks', {}, ...card.checks!.map(row), h('button.btn.small.primary', { type: 'button', onclick: go }, '就這樣'));
}
