import { h } from './dom';
import { dreamTeaser } from './dream-card';
import { WELCOME_LINE } from './tutorial';

/**
 * 開局前 30 秒（polish-to-9.md §8.1）：阿德老闆的歡迎改成缸上方的一行字，夢想魚預告改成右上角的小卡，
 * 都不擋缸、點不到（點缸直接穿過去）。什麼時候換字、收起來由開缸流程決定。
 */
export interface OpeningHud {
  /** 換那行字（例如換成下一步的提示）。 */
  setLine(text: string): void;
  /** 只收起夢想魚小卡。 */
  closeDream(): void;
  /** 兩樣一起淡出。 */
  close(): void;
}

const fadeOut = (el: HTMLElement) => {
  if (!el.isConnected || el.classList.contains('out')) return;
  el.classList.add('out');
  window.setTimeout(() => el.remove(), 400);
};

export function openingHud(line = WELCOME_LINE): OpeningHud {
  const text = h('span', {}, line);
  const banner = h('div.opening-line', { role: 'status' }, h('b', {}, '阿德老闆'), text);
  const dream = h('div.dream-corner', { 'aria-hidden': 'true' }, dreamTeaser());
  document.body.append(banner, dream);
  return {
    setLine: (t) => {
      text.textContent = t;
      // 換字時輕輕閃一下，看得出是新的一句
      banner.classList.remove('swap');
      void banner.offsetWidth;
      banner.classList.add('swap');
    },
    closeDream: () => fadeOut(dream),
    close: () => {
      fadeOut(banner);
      fadeOut(dream);
    },
  };
}
