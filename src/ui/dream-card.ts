import { DREAM_FISH, type DreamRoute } from '../sim';
import { h } from './dom';
import { guppyArt } from './shop-cards';

/**
 * 夢想魚（polish-to-9.md §6 P2）：一開始就給玩家一個想追的目標。
 * 選育出來之前畫成發光的剪影，做到了才露出真面目（白子：紅眼、偏淡的紅）。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

export function dreamFishImg(achieved: boolean, cls = 'dream-fish'): HTMLImageElement {
  return h(`img.${cls}${achieved ? '.got' : ''}`, { src: ART + guppyArt(DREAM_FISH.look), alt: achieved ? DREAM_FISH.name : '還沒選育出來的夢想魚', draggable: 'false' });
}

function steps(route: DreamRoute): HTMLElement {
  return h(
    'ol.dream-steps',
    {},
    ...route.steps.map((s, i) => h(`li${s.done ? '.done' : ''}${s.current ? '.current' : ''}`, {}, h('span.dream-dot', {}, s.done ? '✓' : String(i + 1)), h('span', {}, s.title))),
  );
}

/** 第 4 步（固定品系）的短標籤：還沒算過穩定度就說到手了。 */
function fixedLabel(route: DreamRoute): string {
  return route.stability === undefined ? `${DREAM_FISH.name}到手了！再固定品系` : `固定品系：穩定度 ${route.stability}%`;
}

/** 機率的寫法：整數不帶小數點，其他留一位（29.6%）。 */
export const pctText = (p: number): string => `${Number.isInteger(p) ? p : p.toFixed(1)}%`;

/**
 * 有機率時路線卡寫兩行（polish-to-9.md §10.4）：第一行步驟名「3／4 第一尾自己選育的魚」，第二行小字「孫代 x%・約第 d 天開獎」。
 * from 是上一次的機率：跟這次不一樣就當場跳數字，第二行先寫「29.6% → 49.6%」，過幾秒換回開獎日。
 */
function oddsLines(step: string, odds: NonNullable<DreamRoute['odds']>, from?: number): HTMLElement {
  const num = h('b.dream-pct', {}, pctText(odds.pct));
  const was = h('span.dream-was', { hidden: true });
  const line = h('small.dream-odds-line', {}, h('span.dream-odds-who', {}, '孫代 '), was, num, h('span.dream-odds-day', {}, `・約第 ${odds.day} 天開獎`));
  const tag = h('span.dream-odds', { title: `孫代出現${DREAM_FISH.name}的機率 ${pctText(odds.pct)}，預計開獎約第 ${odds.day} 天` }, h('span.dream-step', {}, step), line);
  if (from === undefined || from === odds.pct) return tag;
  tag.classList.add('jump', odds.pct > from ? 'up' : 'down');
  was.textContent = `${pctText(from)} → `;
  was.hidden = false;
  window.setTimeout(() => {
    tag.classList.remove('jump');
    was.hidden = true;
  }, 3000);
  // 數字從舊的數到新的（約 0.9 秒）；不想要動畫的玩家直接換成新數字
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      const v = from + (odds.pct - from) * (1 - (1 - k) ** 3);
      num.textContent = pctText(k < 1 ? Math.round(v * 10) / 10 : odds.pct);
      if (k < 1) requestAnimationFrame(tick);
    };
    num.textContent = pctText(from);
    requestAnimationFrame(tick);
  }
  return tag;
}

/** 任務卡上方常駐的一條：剪影、每步一個點、現在在走的那步；有機率的話寫兩行，步驟名加孫代機率和開獎日（from 是上一次的機率）。 */
export function dreamStrip(route: DreamRoute, onclick: () => void, from?: number): HTMLButtonElement {
  const at = route.steps.findIndex((s) => s.current);
  const cur = route.steps[at];
  const label = cur?.id === 'fixed' ? (route.achieved ? fixedLabel(route) : '再等牠冒出來') : cur ? cur.title : route.achieved ? `${DREAM_FISH.name}品系固定了！` : '再等牠冒出來';
  return h(
    `button.dream-strip.glass${route.odds ? '.has-odds' : ''}`,
    { onclick, title: '夢想魚：點開看怎麼選育' },
    dreamFishImg(route.achieved, 'dream-mini'),
    h('span.dream-strip-dots', {}, ...route.steps.map((s) => h(`i${s.done ? '.done' : ''}${s.current ? '.current' : ''}`))),
    route.odds ? oddsLines(at >= 0 ? `${at + 1}／${route.steps.length} ${label}` : label, route.odds, from) : h('span.dream-strip-label', {}, h('small', {}, '夢想魚'), label),
  );
}

/** 路線卡放上畫面後量一下：第二行塞不下就只留「x%」（步驟名一定留著）。 */
export function fitDreamStrip(strip: Element | null): void {
  const line = strip?.querySelector<HTMLElement>('.dream-odds-line');
  if (!line) return;
  line.classList.remove('narrow');
  if (line.scrollWidth > line.clientWidth + 1) line.classList.add('narrow');
}

/** 歡迎時疊在老闆那句話下面的小卡（不另外跳對話框）。 */
export function dreamTeaser(): HTMLElement {
  return h('div.dream-teaser', {}, dreamFishImg(false, 'dream-mini'), h('span', {}, h('b', {}, `夢想魚：${DREAM_FISH.name}`), h('small', {}, DREAM_FISH.tagline)));
}

/** 點開的卡片：大剪影、名字、路線、怎麼做。 */
export function dreamCard(route: DreamRoute): HTMLElement {
  return h(
    'div.dream-card',
    {},
    h('div.dream-stage', {}, h('div.dream-glow'), dreamFishImg(route.achieved)),
    h('h3.dream-name', {}, route.achieved ? DREAM_FISH.name : `${DREAM_FISH.name}？`),
    h('p.dream-tag', {}, route.achieved ? '你自己選育出來的，店裡買不到' : DREAM_FISH.tagline),
    steps(route),
    route.bredName && !route.achieved ? h('p.hint', {}, `你已經選育出「${route.bredName}」了，離牠不遠`) : null,
    route.stability !== undefined ? h('p.hint', {}, `最近一窩的穩定度 ${route.stability}%`) : null,
    route.odds ? h('p.dream-card-odds', {}, `孫代出現${DREAM_FISH.name}的機率 `, h('b', {}, pctText(route.odds.pct)), `・預計開獎約第 ${route.odds.day} 天`) : null,
    h('details.dream-recipe', {}, h('summary', {}, '怎麼選育'), h('ol', {}, ...DREAM_FISH.recipe.map((r) => h('li', {}, r)))),
  );
}
