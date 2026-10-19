import { h } from './dom';

/**
 * 獎勵要看得到（design/first-10-minutes.md F8）：拿到錢時，幾枚金幣從按下的地方（from，沒給就從畫面中間）飛進上方的錢包，
 * 錢包跳一下、浮出「+120」。原本只有一行通知。
 */
export function flyCoins(from: DOMRect | null, wallet: HTMLElement, amount: number): void {
  if (amount <= 0) return;
  const end = wallet.getBoundingClientRect();
  const start = from && from.width > 0 ? from : { left: window.innerWidth / 2 - 10, top: window.innerHeight / 2, width: 20, height: 20 };
  const sx = start.left + start.width / 2;
  const sy = start.top + start.height / 2;
  const ex = end.left + 22;
  const ey = end.top + end.height / 2;
  const n = Math.min(8, 3 + Math.floor(Math.log10(amount + 1) * 2));
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  for (let i = 0; i < n; i++) {
    const coin = h('i.coin.coin-fly', { 'aria-hidden': 'true' });
    coin.style.left = `${sx}px`;
    coin.style.top = `${sy}px`;
    document.body.append(coin);
    const spread = (i - (n - 1) / 2) * 14;
    const anim = coin.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
        { transform: `translate(calc(-50% + ${spread}px), calc(-50% - 36px)) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${ex - sx}px), calc(-50% + ${ey - sy}px)) scale(0.8)`, opacity: 1 },
      ],
      { duration: reduce ? 1 : 700 + i * 60, delay: reduce ? 0 : i * 45, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' },
    );
    anim.onfinish = () => coin.remove();
  }
  const land = reduce ? 0 : 700 + n * 100;
  window.setTimeout(() => {
    wallet.classList.remove('bump');
    void wallet.offsetWidth;
    wallet.classList.add('bump');
    const plus = h('span.coin-plus', {}, `+${amount}`);
    wallet.append(plus);
    window.setTimeout(() => plus.remove(), 1200);
  }, land);
}
