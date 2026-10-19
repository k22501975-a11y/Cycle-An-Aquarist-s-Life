import type { SoundId } from '../audio/sounds';
import { BAG_ML, bagMl, bagWater, DRIP_READY_GAP, dripGap, dripGrade, dripOutcome, dripReady, safeRate, startDrip, stepDrip, type DripGrade, type DripOutcome, type TankState, type WaterHabit } from '../sim';
import { ownerImg } from './art-icons';
import { h } from './dom';

/**
 * 對水小遊戲（design/first-10-minutes.md F5）：袋子裡的魚、上面一支滴管。
 * 按住「滴水」滴管慢慢開大，開到綠線（魚受得了的最快滴速）就停在那裡，放開就慢慢關小（#197：一直按住不會被罵太快）。
 * 綠線會隨著袋子水變多往右移，所以一直按住也會越滴越快；滴太快魚會緊張（顏色變淡、發抖）。
 * 差距條收到綠線就可以放魚，也可以提早放（休克大一點）。數值都在 sim/drip.ts。
 */

export interface DripGameOptions {
  state: TankState;
  /** 袋子裡原本的水（魚場的水）。 */
  from: WaterHabit;
  /** 袋子裡的魚（art/ 底下的圖）。 */
  art: string;
  /** 幾尾（袋子裡畫幾尾）。 */
  count: number;
  /** 標題上的魚名。 */
  name: string;
  sound?: (id: SoundId) => void;
}

/** 滴管按住時每秒開大多少、放開時每秒關小多少。 */
const OPEN_PER_S = 0.7;
const CLOSE_PER_S = 1.4;
/** 一格最多算幾秒、每一小步幾秒。 */
const MAX_FRAME_S = 2;
const STEP_S = 0.05;

/** 滴管下一小步開多大：按住就往綠線（target）開，到了就停在綠線上，已經超過時照放開的速度關回來；放開就慢慢關小。 */
export function nextValve(rate: number, holding: boolean, target: number, step: number): number {
  if (!holding) return Math.max(0, rate - CLOSE_PER_S * step);
  return rate < target ? Math.min(target, rate + OPEN_PER_S * step) : Math.max(target, rate - CLOSE_PER_S * step);
}

const GRADE_TEXT: Record<DripGrade, string> = {
  perfect: '對得剛剛好，牠一點都不緊張！',
  good: '還不錯，牠很快就會習慣。',
  rushed: '有點趕，牠嚇到了，接下來幾天多注意。',
};

/** 打開小遊戲；放魚時回傳結果，按「取消」回傳 null（還沒付錢，不買）。 */
export function openDripGame(opts: DripGameOptions): Promise<DripOutcome | null> {
  return new Promise((resolve) => {
    const session = startDrip(opts.state, opts.from);
    let rate = 0;
    let holding = false;
    let last = performance.now();
    let raf = 0;
    let readyShown = false;
    const art = `${import.meta.env.BASE_URL}art/${opts.art}`;

    const water = h('div.drip-bag-water');
    const fishes = Array.from({ length: Math.min(3, Math.max(1, opts.count)) }, (_, i) => {
      const img = h('img.drip-fish', { src: art, alt: '', draggable: 'false' });
      img.style.setProperty('--i', String(i));
      return img;
    });
    const drops = h('div.drip-drops');
    const bag = h('div.drip-bag', {}, water, h('div.drip-bag-fish', {}, ...fishes), h('span.drip-bag-shine'), h('span.drip-bag-knot'));
    const tube = h('div.drip-tube', {}, h('span.drip-valve'), drops);
    const scene = h('div.drip-scene', { 'aria-hidden': 'true' }, tube, bag);

    const gapFill = h('i');
    const gapBar = h('div.drip-gap', {}, gapFill, h('span.drip-gap-ok', { style: { left: `${(1 - DRIP_READY_GAP) * 100}%` } }));
    const rateFill = h('i');
    const safeMark = h('span.drip-safe');
    const rateBar = h('div.drip-rate', {}, rateFill, safeMark);
    const phVal = h('b');
    const tempVal = h('b');
    const say = h('span');
    const holdBtn = h('button.drip-hold', { type: 'button' }, h('span.drip-hold-icon', { 'aria-hidden': 'true' }), '按住滴水');
    const releaseBtn = h('button.btn.drip-release', { type: 'button' }, '放魚');
    const cancelBtn = h('button.btn.drip-cancel', { type: 'button' }, '先不買');

    const card = h(
      'div.drip-game.glass',
      { role: 'dialog', 'aria-label': `對水：${opts.name}` },
      h('b.drip-title', {}, `對水：${opts.name}`),
      h('div.owner-say', {}, ownerImg('owner-say-avatar'), say),
      h(
        'div.drip-main',
        {},
        scene,
        h(
          'div.drip-side',
          {},
          h('div.drip-meter', {}, h('span', {}, '水質差距'), gapBar),
          h('div.drip-meter', {}, h('span', {}, '滴速'), rateBar),
          h('div.drip-readings', {}, h('span', {}, 'pH ', phVal), h('span', {}, '水溫 ', tempVal)),
          holdBtn,
        ),
      ),
      h('div.drip-actions', {}, cancelBtn, releaseBtn),
    );
    const shade = h('div.drip-shade', {}, card);
    document.body.append(shade);
    requestAnimationFrame(() => shade.classList.add('in'));

    const press = (on: boolean) => (e: Event) => {
      e.preventDefault();
      holding = on;
      holdBtn.classList.toggle('down', on);
      if (on) opts.sound?.('water');
    };
    holdBtn.addEventListener('pointerdown', press(true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) holdBtn.addEventListener(ev, press(false));
    // 鍵盤：空白鍵按住
    holdBtn.addEventListener('keydown', (e) => e.key === ' ' && press(true)(e));
    holdBtn.addEventListener('keyup', (e) => e.key === ' ' && press(false)(e));

    const finish = (result: DripOutcome | null) => {
      cancelAnimationFrame(raf);
      shade.classList.remove('in');
      window.setTimeout(() => shade.remove(), 350);
      resolve(result);
    };
    cancelBtn.addEventListener('click', () => finish(null));
    releaseBtn.addEventListener('click', () => {
      const outcome = dripOutcome(session);
      const grade = dripGrade(outcome);
      opts.sound?.(grade === 'rushed' ? 'warn' : 'quest');
      card.classList.add('done', grade);
      say.textContent = GRADE_TEXT[grade];
      holdBtn.disabled = releaseBtn.disabled = cancelBtn.disabled = true;
      cancelAnimationFrame(raf);
      window.setTimeout(() => finish(outcome), grade === 'rushed' ? 1500 : 1200);
    });

    const frame = (now: number) => {
      // 用現實時間算，切成 0.05 秒一小步（慢的手機一格要好幾秒也照樣滴得完、滴管照樣慢慢開大）；
      // 切到背景回來的一大段最多算 2 秒
      let dt = Math.min(MAX_FRAME_S, (now - last) / 1000);
      last = now;
      while (dt > 0) {
        const step = Math.min(STEP_S, dt);
        dt -= step;
        rate = nextValve(rate, holding, safeRate(session), step);
        stepDrip(session, rate, step);
      }
      render();
      raf = requestAnimationFrame(frame);
    };

    const render = () => {
      const gap = dripGap(session);
      const safe = safeRate(session);
      const nervous = session.nervous;
      const ready = dripReady(session);
      // 袋子水位：原本 500 mL 畫在四成高，滴到 4 倍水量時接近滿
      const level = 0.4 + 0.5 * Math.min(1, (bagMl(session) - BAG_ML) / (BAG_ML * 3));
      water.style.height = `${(level * 100).toFixed(1)}%`;
      // 水色：魚場的水偏黃綠，滴進缸水後慢慢變成缸裡的藍
      water.style.setProperty('--mix', ((1 - gap) / (1 - DRIP_READY_GAP)).toFixed(3));
      gapFill.style.width = `${((1 - gap) / 1) * 100}%`;
      gapBar.classList.toggle('ok', ready);
      rateFill.style.width = `${rate * 100}%`;
      rateFill.className = rate > safe + 0.02 ? 'fast' : '';
      safeMark.style.left = `${safe * 100}%`;
      tube.style.setProperty('--speed', `${(1.4 - rate * 1.15).toFixed(2)}s`);
      tube.classList.toggle('flowing', rate > 0.03);
      drops.style.opacity = rate > 0.03 ? '1' : '0';
      scene.style.setProperty('--nervous', nervous.toFixed(3));
      scene.classList.toggle('shaking', nervous > 0.35);
      const w = bagWater(session);
      phVal.textContent = `${w.ph.toFixed(1)} → ${session.to.ph.toFixed(1)}`;
      tempVal.textContent = `${w.tempC.toFixed(1)} → ${session.to.tempC.toFixed(1)}°C`;
      releaseBtn.className = `btn drip-release${ready ? ' primary' : ''}`;
      if (card.classList.contains('done')) return;
      if (ready && !readyShown) {
        readyShown = true;
        opts.sound?.('quest');
      }
      say.textContent = ready
        ? '差不多了，水質已經接近。按「放魚」把牠放進缸裡！'
        : nervous > 0.35
          ? '牠有點緊張，先放開讓牠喘口氣。'
          : session.addedMl < 1
            ? '按住滴水，滴管會開到綠線那麼大，缸水一滴一滴進袋子。'
            : holding
              ? '很好，就這樣按著，水越多滴管會開得越大。'
              : '放開滴管就慢慢關小。準備好再按住繼續滴。';
    };
    render();
    raf = requestAnimationFrame(frame);
  });
}
