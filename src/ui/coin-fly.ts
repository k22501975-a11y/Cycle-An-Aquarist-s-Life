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

/**
 * 獎勵特效的小、中兩級（polish-to-9.md V5；大的是 celebrate.ts 的全螢幕慶祝卡）：
 * small（小事寶箱、賣魚）：按下的地方炸開一圈金色亮點；
 * medium（交單）：亮點多一倍、外加一圈擴散的光環，中間浮出金額。
 */
export function rewardBurst(from: DOMRect | null, tier: 'small' | 'medium', label?: string): void {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  const at = from && from.width > 0 ? from : { left: window.innerWidth / 2 - 10, top: window.innerHeight / 2, width: 20, height: 20 };
  const x = at.left + at.width / 2;
  const y = at.top + at.height / 2;
  const medium = tier === 'medium';
  const host = h('div.reward-burst', { 'aria-hidden': 'true' });
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  document.body.append(host);
  const n = medium ? 18 : 10;
  const reach = medium ? 96 : 54;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
    const r = reach * (0.7 + ((i * 37) % 10) / 30);
    const spark = h('i.burst-spark');
    host.append(spark);
    spark.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r}px)) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * r * 1.15}px), calc(-50% + ${Math.sin(a) * r * 1.15 + 10}px)) scale(0.3)`, opacity: 0 },
      ],
      { duration: medium ? 900 : 650, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
    );
  }
  if (medium) {
    const ring = h('i.burst-ring');
    host.append(ring);
    ring.animate([{ transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0.9 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }], { duration: 800, easing: 'ease-out', fill: 'forwards' });
    if (label) {
      const tag = h('b.burst-label', {}, label);
      host.append(tag);
      tag.animate(
        [
          { transform: 'translate(-50%, -30%) scale(0.6)', opacity: 0 },
          { transform: 'translate(-50%, -120%) scale(1.15)', opacity: 1, offset: 0.3 },
          { transform: 'translate(-50%, -190%) scale(1)', opacity: 0 },
        ],
        { duration: 1400, easing: 'ease-out', fill: 'forwards' },
      );
    }
  }
  window.setTimeout(() => host.remove(), 1500);
}
