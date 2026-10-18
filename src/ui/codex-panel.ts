import { CODEX, isUnlocked, type CodexCategory } from './codex';
import { h } from './dom';
import type { PanelContext } from './panels';

const TABS: Record<CodexCategory, string> = { fish: '魚蝦', plant: '水草', gear: '設備', disease: '疾病' };

/** 圖鑑：分類分頁，點條目看詳細；疾病沒遇過前顯示「？？？」。 */
export function codexPanel(ctx: PanelContext, seen: Set<string>, category: CodexCategory = 'fish', entryId?: string): Node {
  const { sheet } = ctx;
  const go = (c: CodexCategory, id?: string) => sheet.open('圖鑑', () => codexPanel(ctx, seen, c, id));
  const tabs = h('div.tabs', {}, ...(Object.keys(TABS) as CodexCategory[]).map((c) => h(`button.tab${c === category ? '.active' : ''}`, { onclick: () => go(c) }, TABS[c])));
  const entry = entryId ? CODEX.find((e) => e.id === entryId) : undefined;
  if (entry && isUnlocked(entry, seen)) {
    return h(
      'div.stack',
      {},
      tabs,
      h('button.btn.small.back', { onclick: () => go(category) }, '‹ 回到列表'),
      h('h3.codex-name', {}, entry.name),
      h('table.readings', {}, ...entry.facts.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td.value', {}, v)))),
      h('p.codex-text', {}, entry.text),
    );
  }
  const items = CODEX.filter((e) => e.category === category);
  const unlocked = items.filter((e) => isUnlocked(e, seen)).length;
  return h(
    'div.stack',
    {},
    tabs,
    category === 'disease' ? h('p.hint', {}, `已記錄 ${unlocked} / ${items.length} 種。親眼遇過一次才會寫進圖鑑。`) : null,
    h(
      'div.codex-list',
      {},
      ...items.map((e) =>
        isUnlocked(e, seen)
          ? h('button.item.codex-item', { onclick: () => go(category, e.id) }, h('b', {}, e.name), h('span.codex-sub', {}, e.facts[0] ? `${e.facts[0][0]}：${e.facts[0][1]}` : ''))
          : h('div.item.codex-item.locked', {}, h('b', {}, '？？？'), h('span.codex-sub', {}, '還沒遇過')),
      ),
    ),
  );
}
