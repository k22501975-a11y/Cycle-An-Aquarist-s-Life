/**
 * 按鈕圖示：奶油色細線條（參考圖的精品風 UI），金色點綴。viewBox 以中心為原點。
 */
const LINE = '#f3ead8';
const GOLD = '#e3bd6d';

function svg(body: string): string {
  return `<svg viewBox="-18 -18 36 36" width="100%" height="100%" aria-hidden="true" fill="none" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
}

export const ICONS = {
  feed: svg(`<path d="M-9,-12 L9,-12 L7,4 Q0,8 -7,4 Z"/><circle cx="-4" cy="10" r="1.8" fill="${GOLD}" stroke="none"/><circle cx="2" cy="13" r="1.8" fill="${GOLD}" stroke="none"/><circle cx="6" cy="9" r="1.5" fill="${GOLD}" stroke="none"/>`),
  water: svg(`<path d="M0,-13 C8,-2 10,3 10,6 A10,10 0 0 1 -10,6 C-10,3 -8,-2 0,-13Z"/><path d="M-5,5 Q-5,9 -1,10" stroke="${GOLD}"/>`),
  test: svg(`<path d="M-4,-13 L4,-13 M-3,-13 L-3,8 A3,3 0 0 0 3,8 L3,-13"/><path d="M-3,1 L3,1" stroke="${GOLD}"/><path d="M-2.2,2 L-2.2,8 A2.2,2.2 0 0 0 2.2,8 L2.2,2Z" fill="${GOLD}" stroke="none" opacity="0.8"/>`),
  trim: svg(`<circle cx="-6" cy="9" r="4.5"/><circle cx="6" cy="9" r="4.5"/><path d="M-3,6 L8,-13 M3,6 L-8,-13"/><circle cx="0" cy="1" r="1.2" fill="${GOLD}" stroke="none"/>`),
  shop: svg(`<path d="M-11,-5 L11,-5 L9,12 L-9,12Z"/><path d="M-5,-5 Q-5,-14 0,-14 Q5,-14 5,-5"/><path d="M-6,2 L6,2" stroke="${GOLD}"/>`),
  gear: svg(`<circle cx="0" cy="0" r="5" stroke="${GOLD}"/><path d="M0,-13 L0,-9 M0,9 L0,13 M-13,0 L-9,0 M9,0 L13,0 M-9.2,-9.2 L-6.4,-6.4 M6.4,6.4 L9.2,9.2 M-9.2,9.2 L-6.4,6.4 M6.4,-6.4 L9.2,-9.2"/><circle cx="0" cy="0" r="9"/>`),
  net: svg(`<path d="M-13,13 L-3,3"/><ellipse cx="4" cy="-4" rx="9" ry="7" transform="rotate(-45 4 -4)"/><path d="M-1,-9 L9,1 M2,-12 L12,-2 M-3,-4 L4,3" stroke-width="1" stroke="${GOLD}"/>`),
  todo: svg(`<rect x="-11" y="-10" width="22" height="22" rx="4"/><path d="M-11,-3 L11,-3"/><path d="M-5,-14 L-5,-7 M5,-14 L5,-7"/><path d="M-5,4 L-1,8 L6,1" stroke="${GOLD}"/>`),
  menu: svg(`<path d="M-9,-6 L9,-6 M-9,0 L9,0 M-9,6 L9,6"/>`),
};
