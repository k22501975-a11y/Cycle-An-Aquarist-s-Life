import { h } from './dom';

/** 留種緞帶：金邊紅緞帶，缸裡、魚卡、選種卡都用同一個。 */
export const RIBBON_SVG =
  '<svg viewBox="0 0 24 32" aria-hidden="true"><defs><linearGradient id="rb-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a7a"/><stop offset=".55" stop-color="#d8384a"/><stop offset="1" stop-color="#8e1830"/></linearGradient><radialGradient id="rb-k" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff2c4"/><stop offset=".6" stop-color="#e3bd6d"/><stop offset="1" stop-color="#9a7230"/></radialGradient></defs><path d="M8 13 L3 30 L7.5 27 L10 31 L12.5 15Z" fill="url(#rb-a)" stroke="#5c0f1f" stroke-width=".8"/><path d="M16 13 L21 30 L16.5 27 L14 31 L11.5 15Z" fill="url(#rb-a)" stroke="#5c0f1f" stroke-width=".8"/><circle cx="12" cy="10" r="8" fill="url(#rb-k)" stroke="#7a5420" stroke-width="1"/><circle cx="12" cy="10" r="5" fill="none" stroke="#fff4cf" stroke-opacity=".7" stroke-width=".9"/><path d="M12 6.6 l1 2.2 2.4.3-1.8 1.6.5 2.4L12 11.9l-2.1 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="#fff8de"/></svg>';

let seq = 0;

export function keeperRibbon(cls = 'keeper-ribbon'): HTMLElement {
  const el = h(`span.${cls}`, { title: '留種', 'aria-label': '留種' });
  // 每個緞帶用自己的漸層 id：同 id 的第一個若在藏起來的面板裡，WebView 會讓其他緞帶沒有填色
  const n = ++seq;
  el.innerHTML = RIBBON_SVG.replace(/rb-([ak])/g, `rb-$1${n}`);
  return el;
}
