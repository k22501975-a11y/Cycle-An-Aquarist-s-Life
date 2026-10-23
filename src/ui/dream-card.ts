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

/** 任務卡上方常駐的一條：剪影、每步一個點、現在在走的那步。 */
export function dreamStrip(route: DreamRoute, onclick: () => void): HTMLButtonElement {
  const cur = route.steps.find((s) => s.current);
  const label = cur?.id === 'fixed' ? (route.achieved ? fixedLabel(route) : '再等牠冒出來') : cur ? cur.title : route.achieved ? `${DREAM_FISH.name}品系固定了！` : '再等牠冒出來';
  return h(
    'button.dream-strip.glass',
    { onclick, title: '夢想魚：點開看怎麼選育' },
    dreamFishImg(route.achieved, 'dream-mini'),
    h('span.dream-strip-dots', {}, ...route.steps.map((s) => h(`i${s.done ? '.done' : ''}${s.current ? '.current' : ''}`))),
    h('span.dream-strip-label', {}, h('small', {}, '夢想魚'), label),
  );
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
    h('details.dream-recipe', {}, h('summary', {}, '怎麼選育'), h('ol', {}, ...DREAM_FISH.recipe.map((r) => h('li', {}, r)))),
  );
}
