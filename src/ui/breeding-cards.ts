import { DREAM_FISH, type PreviewKid } from '../sim';
import { h } from './dom';
import { keeperRibbon } from './keeper-ribbon';
import { dotsOn, kidArt } from './pair-preview-card';
import { guppyArt } from './shop-cards';

/**
 * 中期選育的卡片（design/midgame.md §4）：選種卡（C2）、配對比較卡（C4）、交單還是留著（C5）、
 * 其他選擇點（C1）的圖卡，以及留種緞帶和早上報告的「選育進度」行。
 * 資料由核心算（哪幾尾、機率多少），這裡只負責畫面；字少、圖多，特徵畫成小圖示。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

// ── 資料（核心的 src/sim/choices.ts 算好，欄位名照核心的 ChoiceCard） ──────────

/** 畫一尾魚需要的：公母、品系名、外觀編號、鰭型字（和 PreviewKid 一樣）。 */
export interface FishLook {
  sex: 'male' | 'female';
  name: string;
  look: number;
  fins: string[];
  /** 已取名的品系（strain-fixing.md §2.2，sim 的 lineName）：卡上在魚的圖上方掛金色名牌。 */
  line?: string | null;
}

/** 選種卡上的一尾（ChoiceCard.fish）。 */
export interface PickFish extends FishLook {
  fishId: number;
  tank: number;
  /** 看得出來的特徵（guppyTraits）。 */
  traits: Array<{ key: string; name: string }>;
  /** 離夢想魚還差的特徵名稱，例如「白子」。 */
  missing: string[];
  keeper: boolean;
}

/** 選種名額（ChoiceCard.pickLimit，企劃：1 公 2 母）。 */
export interface PickLimit {
  male: number;
  female: number;
}

/** 配對比較卡上的一尾候選公魚（ChoiceCard.candidates）。 */
export interface PairCandidate {
  fishId: number;
  tank: number;
  name: string;
  look: number;
  fins: string[];
  /** 這對配下去，孫代出現夢想魚的機率（%）。 */
  dreamPct: number;
  /** 看得出來的特徵（guppyTraits）；有就畫成小圖示。 */
  traits?: Array<{ key: string; name: string }>;
  /** 和母魚配出來的小魚（previewPair 前 3 種）。 */
  kids: PreviewKid[];
  /** 這對還要幾天才都長大能配（0 是現在就能配）。 */
  matureDays?: number;
  keeper?: boolean;
  line?: string | null;
}

/** 交單還是留著（ChoiceCard.trade）。 */
export interface TradeEstimate {
  fishId: number;
  orderId: number;
  /** 交單拿到的錢。 */
  coins: number;
  /** 留著／交掉之後，孫代夢想魚的機率（%）。 */
  keepPct: number;
  sellPct: number;
}

export interface ChoiceOption {
  key: string;
  label: string;
  /** 一行後果。 */
  outcome: string;
  recommended?: boolean;
  /** 現在不能選的原因（錢不夠之類）：按鈕灰掉、小字改寫這個。 */
  disabled?: string;
}

// ── 小零件 ──────────────────────────────────────────────

export { keeperRibbon };

/** 特徵的小圖示：顏色畫成寶石、鰭和尾巴畫成剪影。 */
const GEM: Record<string, [string, string]> = {
  albino: ['#ffd6de', '#e0607a'],
  gold: ['#fff1a8', '#d79a1e'],
  tuxedo: ['#7fb2ff', '#18284f'],
  red: ['#ff9a8a', '#c11f2c'],
  snake: ['#ffe3a0', '#6a4a12'],
  grass: ['#a8e4ff', '#2368b8'],
  wild: ['#d8e2d0', '#6c7f6a'],
};

const FIN_PATH: Record<string, string> = {
  swallow: 'M3 12 Q8 9 11 12 Q8 15 3 12 M11 12 L21 4 L17 12 L21 20Z',
  ribbon: 'M3 12 Q8 9 11 12 Q8 15 3 12 M9 10 L20 3 M9 14 L20 21 M11 12 L19 12',
  dumbo: 'M3 12 Q9 8 14 12 Q9 16 3 12 M8 13 Q11 22 16 20 Q12 16 9 13Z',
  bigC: 'M3 12 Q8 9 11 12 Q8 15 3 12 M11 12 Q22 2 21 12 Q22 22 11 12Z',
  sword: 'M3 12 Q8 9 11 12 Q8 15 3 12 M11 11 L22 6 L13 12 L22 18 L11 13Z',
  'tail:halfmoon': 'M3 12 Q8 9 11 12 Q8 15 3 12 M11 12 L21 3 Q23 12 21 21Z',
  'tail:delta': 'M3 12 Q8 9 11 12 Q8 15 3 12 M11 12 L20 6 Q21.5 12 20 18Z',
  'tail:round': 'M3 12 Q8 9 11 12 Q8 15 3 12 M11 12 Q20 4 20 12 Q20 20 11 12Z',
};

let gemSeq = 0;

export function traitIcon(key: string): string {
  const gem = GEM[key];
  if (gem) {
    // 每個圖示用自己的漸層 id（同 id 的第一個若被藏起來，WebView 會讓其他的沒有填色）
    const id = `g-${key}-${++gemSeq}`;
    // 蛇王多一層迷宮紋；禮服是後半身暗
    const extra =
      key === 'snake'
        ? '<path d="M7 9 q2-2 4 0 t4 0 M7 12.5 q2 2 4 0 t4 0 M7 16 q2-2 4 0 t4 0" fill="none" stroke="#3a2808" stroke-width="1.1"/>'
        : key === 'tuxedo'
          ? '<path d="M12 4 A8 8 0 0 1 12 20Z" fill="#0b1430" opacity=".75"/>'
          : key === 'albino'
            ? '<circle cx="12" cy="12" r="2.6" fill="#e0263e"/>'
            : '';
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="${id}" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="${gem[0]}"/><stop offset="1" stop-color="${gem[1]}"/></radialGradient></defs><circle cx="12" cy="12" r="8" fill="url(#${id})" stroke="#f3ead8" stroke-opacity=".55" stroke-width="1"/>${extra}<ellipse cx="9" cy="8.5" rx="2.4" ry="1.4" fill="#fff" opacity=".55"/></svg>`;
  }
  const d = FIN_PATH[key] ?? FIN_PATH['tail:round'];
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="#e3bd6d" fill-opacity=".35" stroke="#f6d891" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function traitChip(t: { key: string; name: string }, cls = ''): HTMLElement {
  const el = h(`span.bc-trait${cls}`, { title: t.name });
  el.innerHTML = traitIcon(t.key);
  el.append(h('small', {}, t.name));
  return el;
}

/** 缺的特徵：虛線框的問號寶石。 */
function missingChip(name: string): HTMLElement {
  return h('span.bc-trait.missing', { title: `還差：${name}` }, h('i', {}, '?'), h('small', {}, name));
}

function fishArt(f: FishLook): HTMLElement {
  const src = ART + kidArt({ ...f, tailShape: f.fins.includes('大三角') ? 'halfmoon' : 'round', pct: 0 });
  return h(`img.bc-fish${f.name.includes('白子') ? '.albino' : ''}`, { src, alt: '', draggable: 'false' });
}

/** 已取名品系的小名牌（「阿德系」）；沒有品系就不畫。 */
export function lineTag(line: string | null | undefined): HTMLElement | null {
  return line ? h('span.line-tag', { title: `${line}（你取名的品系）` }, line) : null;
}

function sexBadge(sex: 'male' | 'female'): HTMLElement {
  return h(`i.bc-sex.${sex}`, { 'aria-label': sex === 'male' ? '公' : '母' }, sex === 'male' ? '♂' : '♀');
}

function dots(pct: number): HTMLElement {
  const on = dotsOn(pct);
  return h('span.pp-dots', { title: `約 ${pct}%`, 'aria-label': `約 ${pct}%` }, ...Array.from({ length: 10 }, (_, i) => h(`i${i < on ? '.on' : ''}`)));
}

/** 夢想魚機率的星星徽章：越高越亮。 */
function dreamMeter(pct: number): HTMLElement {
  const lit = pct >= 20 ? 3 : pct >= 8 ? 2 : pct > 0 ? 1 : 0;
  return h(
    `div.bc-dream${lit === 3 ? '.hot' : ''}`,
    { title: `孫代出現${DREAM_FISH.name}約 ${pct}%` },
    h('span.bc-stars', { 'aria-hidden': 'true' }, ...[0, 1, 2].map((i) => h(`i${i < lit ? '.on' : ''}`, {}, '★'))),
    h('b', {}, `${pct}%`),
  );
}

// ── 選種卡（C2） ─────────────────────────────────────────

/**
 * 點一尾要做的事：沒留種就標上；這一性別名額滿了，就把最早標的那尾換下來（只留 1 公時就是直接換公魚）。
 * 回傳要依序套用的 [fishId, on]。
 */
export function toggleKeeper(fish: PickFish[], limit: PickLimit, f: PickFish): Array<[number, boolean]> {
  if (f.keeper) return [[f.fishId, false]];
  const same = fish.filter((k) => k.keeper && k.sex === f.sex);
  const out: Array<[number, boolean]> = [];
  if (same.length >= limit[f.sex] && same.length > 0) out.push([same[0].fishId, false]);
  out.push([f.fishId, true]);
  return out;
}

const keptCount = (fish: PickFish[], sex: 'male' | 'female') => fish.filter((k) => k.keeper && k.sex === sex).length;

/** 公母都標滿了。 */
export function pickDone(fish: PickFish[], limit: PickLimit): boolean {
  return keptCount(fish, 'male') >= limit.male && keptCount(fish, 'female') >= limit.female;
}

/** 上面的計數：每個名額一個緞帶槽，標了就亮。 */
function tally(fish: PickFish[], limit: PickLimit): HTMLElement {
  const slots = (sex: 'male' | 'female') => {
    const used = keptCount(fish, sex);
    return h(`span.bc-tally-group.${sex}`, {}, sexBadge(sex), ...Array.from({ length: limit[sex] }, (_, i) => (i < used ? keeperRibbon('bc-slot.on') : h('span.bc-slot'))));
  };
  return h('div.bc-tally', {}, slots('male'), slots('female'));
}

/**
 * 選種卡：一窩小魚排成一排，每尾一張「寶貝卡」，點一下掛上留種緞帶。
 * onToggle 由呼叫端改畫面上的選擇再重畫（名額滿了會先拿掉一尾再標新的）；onDone 在公母都標滿後才按得下去，
 * 呼叫端把標了的 fishId 交給 chooseOption。
 */
export function keeperPickCard(fish: PickFish[], limit: PickLimit, onToggle: (fishId: number, on: boolean) => void, onDone?: () => void, onLater?: { label: string; go: () => void }): HTMLElement {
  const done = pickDone(fish, limit);
  const card = (k: PickFish) => {
    const swap = !k.keeper && keptCount(fish, k.sex) >= limit[k.sex];
    return h(
      `button.bc-kid.${k.sex}${k.keeper ? '.kept' : ''}${swap ? '.swap' : ''}${k.missing.length === 0 ? '.dreamy' : ''}`,
      { type: 'button', 'aria-pressed': String(k.keeper), onclick: () => toggleKeeper(fish, limit, k).forEach(([id, on]) => onToggle(id, on)) },
      h('span.bc-glow', { 'aria-hidden': 'true' }),
      k.keeper ? keeperRibbon('bc-kid-ribbon') : null,
      sexBadge(k.sex),
      fishArt(k),
      lineTag(k.line),
      h('span.bc-traits', {}, ...k.traits.map((t) => traitChip(t))),
      k.missing.length ? h('span.bc-missing', {}, ...k.missing.map(missingChip)) : h('span.bc-complete', {}, '★ 都有了'),
      h('span.bc-mark', {}, k.keeper ? '已留種' : swap ? '換這尾' : '留種'),
    );
  };
  return h(
    'div.bc.bc-pick.glass',
    {},
    h('div.bc-head', {}, keeperRibbon('bc-head-ribbon'), h('b', {}, '選種日'), tally(fish, limit)),
    h('div.bc-dream-goal', {}, h(`img${DREAM_FISH.albino ? '.albino' : ''}`, { src: ART + guppyArt(DREAM_FISH.look), alt: '', draggable: 'false' }), h('small', {}, '目標'), h('span', {}, DREAM_FISH.name)),
    h('div.bc-kids', {}, ...fish.map(card)),
    onDone || onLater
      ? h(
          'div.bc-foot',
          {},
          onLater ? h('button.btn.small.ghost.bc-later', { type: 'button', onclick: onLater.go }, onLater.label) : null,
          onDone ? h('button.btn.primary.bc-done', { type: 'button', disabled: !done, onclick: onDone }, done ? '就留這幾尾' : `挑 ${limit.male} 公 ${limit.female} 母`) : null,
        )
      : null,
  );
}

// ── 配對比較卡（C4） ─────────────────────────────────────

/**
 * 配哪一尾：母魚在左，2～3 尾候選公魚並排；每尾下面是配出來的小魚和孫代夢想魚的機率星星。
 * 機率最高的那尾掛「機率最高」，但不替玩家決定。
 */
export function sireCompareCard(mother: FishLook, candidates: PairCandidate[], onPick: (fishId: number) => void): HTMLElement {
  const best = Math.max(...candidates.map((c) => c.dreamPct));
  const col = (c: PairCandidate) =>
    h(
      `div.bc-sire${c.dreamPct === best && best > 0 ? '.best' : ''}`,
      {},
      c.dreamPct === best && best > 0 ? h('span.bc-best', {}, '機率最高') : null,
      c.keeper ? keeperRibbon('bc-kid-ribbon') : null,
      h('div.bc-sire-pic', {}, sexBadge('male'), fishArt({ ...c, sex: 'male' }), lineTag(c.line)),
      c.traits ? h('span.bc-traits', {}, ...c.traits.map((t) => traitChip(t))) : null,
      dreamMeter(c.dreamPct),
      c.matureDays ? h('span.bc-wait', { title: `還要 ${c.matureDays} 天長大才能配` }, '⏳', h('b', {}, `${c.matureDays} 天`)) : null,
      h(
        'div.bc-kidstrip',
        {},
        ...c.kids.slice(0, 3).map((k) =>
          h(
            `div.bc-mini.${k.sex}${k.sex === 'male' && k.name === DREAM_FISH.name ? '.dream' : ''}`,
            { title: `${k.name} 約 ${k.pct}%` },
            h(`img${k.name.includes('白子') ? '.albino' : ''}`, { src: ART + kidArt(k), alt: '', draggable: 'false' }),
            dots(k.pct),
          ),
        ),
      ),
      h('button.btn.small.primary.bc-pick-btn', { type: 'button', onclick: () => onPick(c.fishId) }, '配這尾'),
    );
  return h(
    'div.bc.bc-sires.glass',
    {},
    h('div.bc-head', {}, h('b', {}, '配哪一尾？'), h('small', {}, `★ 孫代出${DREAM_FISH.name}`)),
    h(
      'div.bc-sires-row',
      {},
      h('div.bc-mom', {}, keeperRibbon('bc-kid-ribbon'), sexBadge('female'), fishArt(mother), lineTag(mother.line), h('small', {}, '媽媽')),
      h('span.bc-x', { 'aria-hidden': 'true' }, '×'),
      h('div.bc-sire-cols', {}, ...candidates.map(col)),
    ),
  );
}

// ── 交單還是留著（C5） ───────────────────────────────────

export function keepOrSellCard(fish: FishLook, c: TradeEstimate, onSell: () => void, onKeep: () => void): HTMLElement {
  return h(
    'div.bc.bc-ks.glass',
    {},
    h('div.bc-head', {}, h('b', {}, '交單還是留著？')),
    h('div.bc-ks-fish', {}, sexBadge(fish.sex), fishArt(fish), lineTag(fish.line)),
    h(
      'div.bc-ks-row',
      {},
      h(
        'button.bc-ks-opt.sell',
        { type: 'button', onclick: onSell },
        h('img.bc-ks-icon', { src: `${ART}ui/coin.webp`, alt: '', draggable: 'false' }),
        h('b', {}, `+${c.coins}`),
        dreamMeter(c.sellPct),
        h('span.bc-ks-label', {}, '交單'),
      ),
      h(
        'button.bc-ks-opt.keep',
        { type: 'button', onclick: onKeep },
        keeperRibbon('bc-ks-icon'),
        h('b', {}, '留著'),
        dreamMeter(c.keepPct),
        h('span.bc-ks-label', {}, '當種魚'),
      ),
    ),
  );
}

// ── 其他選擇點（C1 等）：圖卡二選一 ─────────────────────────

export function choiceCard(title: string, options: ChoiceOption[], onChoose: (key: string) => void, art: Record<string, string> = {}, scene?: HTMLElement): HTMLElement {
  return h(
    'div.bc.bc-choice.glass',
    {},
    h('div.bc-head', {}, h('b', {}, title)),
    scene ?? null,
    h(
      'div.bc-opts',
      {},
      ...options.map((o) =>
        h(
          `button.bc-opt${o.recommended ? '.rec' : ''}`,
          // 不能選的（例如錢不夠）：灰掉，小字寫原因
          { type: 'button', disabled: !!o.disabled, onclick: () => onChoose(o.key) },
          o.recommended ? h('span.bc-best', {}, '推薦') : null,
          art[o.key] ? h('img.bc-opt-art', { src: ART + art[o.key], alt: '', draggable: 'false' }) : null,
          h('b', {}, o.label),
          h('small', {}, o.disabled ?? o.outcome),
        ),
      ),
    ),
  );
}

/** 選項的圖（public/art/ 底下）：C1 育幼盒／躲水草，C3 繁殖缸／展示缸，C11 分開／一起養。 */
export const CHOICE_ART: Record<string, string> = {
  box: 'gear/nursery-box.webp',
  hide: 'scape/plant-moss.webp',
  breeding: 'gear/nursery-box.webp',
  display: 'gear/led-planted.webp',
  split: 'gear/nursery-box.webp',
  together: 'gear/tank-empty.webp',
};

// ── 早上報告的「選育進度」行 ──────────────────────────────

/** 早上報告裡的一行：緞帶＋留種魚的小圖＋一句進度＋進度條。 */
export function breedingLineRow(text: string, fish?: FishLook, progress?: number): HTMLElement {
  return h(
    'div.bc-line',
    {},
    keeperRibbon('bc-line-ribbon'),
    fish ? fishArt(fish) : null,
    h('span.bc-line-text', {}, text),
    progress !== undefined ? h('span.bc-line-bar', {}, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` } })) : null,
  );
}

// ── 成長里程碑報告卡（midgame.md §5.3） ─────────────────────

/** sex／color／ready（§5.3），和顯色到可以配之間的成長卡 tail／plump／adult（§6.7）。 */
export type MilestoneStep = 'sex' | 'color' | 'ready' | 'tail' | 'plump' | 'adult';

/** 放大鏡要對準的地方（佔整張魚圖的比例）：公魚的肛鰭（交接器）、母魚的胎斑。圖都是頭朝右畫的。 */
export const LENS_AT: Record<'male' | 'female', { x: number; y: number }> = {
  male: { x: 0.5, y: 0.82 },
  female: { x: 0.63, y: 0.74 },
};

/** 母魚懷孕的圖（同一個尾色）。 */
export function pregnantArt(f: FishLook): string {
  return kidArt({ ...f, tailShape: 'round', pct: 0 }).replace('-base-', '-pregnant-');
}

function artSrc(f: FishLook): string {
  return ART + kidArt({ ...f, tailShape: f.fins.includes('大三角') ? 'halfmoon' : 'round', pct: 0 });
}

/** 圖載完（或已經在快取裡）就跑 f。 */
function onLoaded(img: HTMLImageElement, f: () => void): void {
  if (img.complete && img.naturalWidth > 0) f();
  else img.addEventListener('load', f, { once: true });
}

/** 放大鏡裡的圖放大幾倍（圖寬是鏡片的幾倍）。 */
export const LENS_ZOOM = 2.4;

/** 放大鏡（正方形）裡的圖要擺在哪（left、top，佔鏡片的 %），at 才會剛好在鏡片正中間。aspect 是圖的高÷寬。 */
export function lensPos(at: { x: number; y: number }, aspect: number): { left: number; top: number } {
  return { left: 50 - at.x * LENS_ZOOM * 100, top: 50 - at.y * LENS_ZOOM * 100 * aspect };
}

/** 一塊放大鏡：同一張圖放大，對準 at（圖不是正方形，上下要等載完知道比例才對得準）。 */
function lens(src: string, at: { x: number; y: number }, albino: boolean): HTMLElement {
  const img = h(`img${albino ? '.albino' : ''}`, { src, alt: '', draggable: 'false' }) as HTMLImageElement;
  img.style.width = `${LENS_ZOOM * 100}%`;
  onLoaded(img, () => {
    const { left, top } = lensPos(at, img.naturalHeight / img.naturalWidth);
    img.style.left = `${left}%`;
    img.style.top = `${top}%`;
  });
  return h('span.ms-lens', { 'aria-hidden': 'true' }, img, h('i.ms-lens-glint'));
}

/** 缸裡那尾魚，身上用虛線圈出放大鏡在看的地方（魚圖照比例縮在 150×84 的框裡）。 */
function lensSubject(src: string, at: { x: number; y: number }, albino: boolean): HTMLElement {
  const img = h(`img.ms-fish.young${albino ? '.albino' : ''}`, { src, alt: '', draggable: 'false' }) as HTMLImageElement;
  const spot = h('i.ms-spot', { hidden: true });
  onLoaded(img, () => {
    // object-fit: contain：比較高的圖是左右留白，比較扁的是上下留白
    const k = Math.min(150 / img.naturalWidth, 84 / img.naturalHeight);
    const [w, tall] = [img.naturalWidth * k, img.naturalHeight * k];
    spot.style.left = `${(150 - w) / 2 + at.x * w}px`;
    spot.style.top = `${(84 - tall) / 2 + at.y * tall}px`;
    spot.hidden = false;
  });
  return h('span.ms-subject', {}, img, spot);
}

/**
 * 里程碑報告卡的圖：
 * - sex：魚在缸裡（還沒顯色、淡淡的），放大鏡對著肛鰭（公）或胎斑（母）
 * - color：小時候灰灰的樣子 → 現在顯色的樣子，旁邊閃光
 * - ready：公母面對面，中間一顆愛心和留種緞帶
 * - tail／plump／adult（§6.7）：那尾魚現在的樣子加閃光，進度停在顯色和可以配中間
 * earlierDays：種魚照 C7 養快，比原本提前幾天，掛一個小標。
 */
export function milestoneVisual(step: MilestoneStep, fish: FishLook, partner?: FishLook, earlierDays?: number): HTMLElement {
  const albino = fish.name.includes('白子');
  const steps: MilestoneStep[] = ['sex', 'color', 'ready'];
  const grow = !steps.includes(step);
  const upTo = grow ? 1 : steps.indexOf(step);
  const track = h(
    'span.ms-track',
    { 'aria-hidden': 'true' },
    ...steps.map((s, i) => h(`i${i <= upTo ? '.on' : ''}${s === step ? '.now' : ''}`)),
  );
  const early = earlierDays ? h('span.ms-early', {}, `提前 ${earlierDays} 天`) : null;
  let scene: HTMLElement;
  if (step === 'sex') {
    const src = fish.sex === 'female' ? ART + pregnantArt(fish) : artSrc(fish);
    scene = h(
      `div.ms-scene.ms-sex.${fish.sex}`,
      {},
      lensSubject(src, LENS_AT[fish.sex], albino),
      lens(src, LENS_AT[fish.sex], albino),
      h(`i.bc-sex.${fish.sex}.ms-sex-badge`, {}, fish.sex === 'male' ? '♂' : '♀'),
    );
  } else if (step === 'color') {
    scene = h(
      'div.ms-scene.ms-color',
      {},
      h('img.ms-fish.before', { src: `${ART}fish/guppy-juvenile.webp`, alt: '', draggable: 'false' }),
      h('span.ms-arrow', { 'aria-hidden': 'true' }, '➜'),
      h('span.ms-after', {}, h(`img.ms-fish${albino ? '.albino' : ''}`, { src: artSrc(fish), alt: '', draggable: 'false' }), ...[0, 1, 2].map((i) => h(`i.ms-spark.s${i}`))),
    );
  } else if (grow) {
    scene = h('div.ms-scene.ms-color.ms-grow', {}, h('span.ms-after', {}, h(`img.ms-fish${albino ? '.albino' : ''}`, { src: artSrc(fish), alt: '', draggable: 'false' }), ...[0, 1, 2].map((i) => h(`i.ms-spark.s${i}`))));
  } else {
    const mate = partner ?? null;
    const male = fish.sex === 'male' ? fish : mate;
    const female = fish.sex === 'female' ? fish : mate;
    const pic = (f: FishLook | null, cls: string) => (f ? h(`img.ms-fish.${cls}${f.name.includes('白子') ? '.albino' : ''}`, { src: artSrc(f), alt: '', draggable: 'false' }) : null);
    scene = h('div.ms-scene.ms-ready', {}, pic(female, 'left'), h('span.ms-heart', { 'aria-hidden': 'true' }, '❤', keeperRibbon('ms-ribbon')), pic(male, 'right'));
  }
  return h(`div.ms.ms-${step}`, {}, scene, h('div.ms-foot', {}, track, early));
}

// ── C11 公母分開養（midgame.md §6.1）──────────────────────

const GENERIC_MALE: FishLook = { sex: 'male', name: '', look: 0, fins: [] };

/**
 * C11 的動畫：公母在缸裡一起游，母魚游進育幼盒、公魚留在外面（重複播）。
 * 育幼盒拆前後兩層，母魚夾在中間，看起來是真的游進盒子裡。
 */
export function splitScene(mother: FishLook | null, father: FishLook | null): HTMLElement {
  const mom = mother ?? { ...GENERIC_MALE, sex: 'female' as const };
  const dad = father ?? GENERIC_MALE;
  const img = (f: FishLook, cls: string) => h(`img.sp-fish.${cls}${f.name.includes('白子') ? '.albino' : ''}`, { src: artSrc(f), alt: '', draggable: 'false' });
  return h(
    'div.sp-scene',
    { 'aria-hidden': 'true' },
    h('img.sp-box.back', { src: `${ART}gear/nursery-box-back.webp`, alt: '', draggable: 'false' }),
    h('span.sp-swim.dad', {}, img(dad, 'dad')),
    h('span.sp-swim.mom', {}, img(mom, 'mom'), h(`i.bc-sex.female.sp-badge`, {}, '♀')),
    h('img.sp-box.front', { src: `${ART}gear/nursery-box-front.webp`, alt: '', draggable: 'false' }),
    h('i.sp-heart', {}, '♥'),
  );
}

// ── 開獎卡（midgame.md §6.1 C15 之後，第 81 天）────────────

export interface RevealFry {
  fishId?: number;
  /** 帶白子基因（含隱性）。 */
  albino: boolean;
  /** 帶蛇紋基因。 */
  snake: boolean;
}

/** 一排寶石圖示（後面可接一段字）。 */
function gemSpan(tag: 'span' | `span.${string}`, keys: string[], text?: string): HTMLElement {
  const el = h(tag);
  el.innerHTML = keys.map(traitIcon).join('');
  if (text) el.append(text);
  return el;
}

/** 卡上最多排幾尾（8 尾一排、3 排）；多的寫「還有 N 尾」。 */
export const REVEAL_MAX = 24;

/** 亮出來的順序：什麼都沒帶的先、帶一樣的、兩樣都有的最後（留到最後揭曉）。同一類照原本順序。 */
export function revealOrder(fry: RevealFry[]): RevealFry[] {
  const rank = (f: RevealFry) => Number(f.albino) + Number(f.snake);
  return fry
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map((x) => x.f);
}

/** 每尾的小標（tutorial-lines.md §10）。 */
export function revealTag(f: RevealFry): string {
  return f.albino && f.snake ? '兩樣都有！' : f.albino ? '帶白子' : f.snake ? '帶蛇紋' : '';
}

/**
 * 開獎卡：小魚一尾一尾從暗處亮出來，帶白子的泛粉白光、帶蛇紋的泛金光，兩樣都有的最後出來、整圈光芒。
 * 只排 REVEAL_MAX 尾，兩樣都有的一定排得進去。
 */
export function revealVisual(fry: RevealFry[]): HTMLElement {
  const ordered = revealOrder(fry);
  // 太多尾時從最前面（什麼都沒帶的）砍，兩樣都有的留在卡上
  const shown = ordered.slice(Math.max(0, ordered.length - REVEAL_MAX));
  const more = ordered.length - shown.length;
  const both = fry.filter((f) => f.albino && f.snake).length;
  const step = Math.min(0.35, 6 / Math.max(1, shown.length));
  const cells = shown.map((f, i) => {
    const kind = f.albino && f.snake ? 'both' : f.albino ? 'albino' : f.snake ? 'snake' : 'plain';
    const gems = [f.albino ? 'albino' : '', f.snake ? 'snake' : ''].filter(Boolean);
    const cell = h(
      `span.rv-fry.${kind}`,
      { title: revealTag(f) || undefined },
      kind !== 'plain' ? h('i.rv-glow') : null,
      h(`img${f.albino ? '.albino' : ''}`, { src: `${ART}fish/guppy-juvenile.webp`, alt: '', draggable: 'false' }),
      gems.length ? gemSpan('span.rv-gems', gems) : null,
      kind === 'both' ? h('b.rv-tag', {}, '兩樣都有！') : null,
    );
    cell.style.animationDelay = `${(i * step).toFixed(2)}s`;
    return cell;
  });
  const count = (k: 'albino' | 'snake') => fry.filter((f) => f[k]).length;
  const legend = h(
    'div.rv-legend',
    {},
    gemSpan('span', ['albino'], `帶白子 ${count('albino')}`),
    gemSpan('span', ['snake'], `帶蛇紋 ${count('snake')}`),
    both ? h('b.rv-both', {}, `兩樣都有 ×${both}`) : null,
    more ? h('small', {}, `還有 ${more} 尾`) : null,
  );
  legend.style.animationDelay = `${(shown.length * step + 0.3).toFixed(2)}s`;
  return h('div.rv', {}, h('div.rv-grid', {}, ...cells), legend);
}

// ── C18 為你的品系取名（design/strain-fixing.md §2.2） ─────────────

/** C18 卡上的取名資料（ChoiceCard.naming）。 */
export interface StrainNaming {
  /** 預設名字（「{玩家名}系」）。 */
  suggested: string;
  /** 這窩的穩定度（夢想魚的比例，0～100）。 */
  stability: number;
  /** 這窩有幾尾夢想魚、一共幾尾。 */
  dream: number;
  total: number;
  /** 名字最多幾個字。 */
  maxLen: number;
}

/** 穩定度條上的兩條線（企劃 2026-10-23）：50% 初步固定（出 C18 取名）、75% 品系完成。 */
export const STABLE_MARKS: ReadonlyArray<{ at: number; label: string }> = [
  { at: 50, label: '初步固定' },
  { at: 75, label: '品系完成' },
];
/** 卡上最多排幾尾。 */
export const NAMING_MAX = 24;

/** 玩家打的名字：去掉前後空白、連續空白縮成一個、截到 maxLen 個字（中文和表情符號都算一個字）；空的用預設。 */
export function cleanStrainName(raw: string, n: Pick<StrainNaming, 'suggested' | 'maxLen'>): string {
  const cut = (s: string) => Array.from(s).slice(0, n.maxLen).join('').trim();
  return cut(raw.trim().replace(/\s+/g, ' ')) || cut(n.suggested);
}

/** 字數（同 cleanStrainName 的算法）。 */
export function nameLength(raw: string): number {
  return Array.from(raw.trim().replace(/\s+/g, ' ')).length;
}

/** 排在卡上的魚：照原本的順序；太多尾時先砍不是夢想魚的，夢想魚盡量都留著。 */
export function namingLineup(fish: PickFish[]): PickFish[] {
  if (fish.length <= NAMING_MAX) return fish;
  const dream = fish.filter((f) => f.missing.length === 0).slice(0, NAMING_MAX);
  let room = NAMING_MAX - dream.length;
  const keep = new Set<PickFish>(dream);
  for (const f of fish) {
    if (room <= 0) break;
    if (keep.has(f)) continue;
    keep.add(f);
    room--;
  }
  return fish.filter((f) => keep.has(f));
}

/** 取名完成的名牌：緞帶＋金色的品系名＋夢想魚的名字。 */
export function strainPlaque(name: string): HTMLElement {
  const medal = keeperRibbon('keeper-ribbon.nm-medal');
  medal.removeAttribute('title');
  medal.setAttribute('aria-hidden', 'true');
  return h('div.nm-plaque', { role: 'status' }, medal, h('small.nm-plaque-kicker', {}, '你的品系有名字了'), h('b.nm-plaque-name', {}, name), h('span.nm-plaque-sub', {}, `${name} ${DREAM_FISH.name}`), h('i.nm-shine', { 'aria-hidden': 'true' }));
}

/**
 * C18 取名的演出：一窩魚排開（暗的），夢想魚一尾一尾亮起來，穩定度條跑到這窩的比例、越過「初步固定」的線，
 * 最後出現名字輸入框。onName 回傳錯誤訊息（例如字詞檢查不過）就顯示在框下面讓玩家重打，回 null 就換成名牌。
 */
export function namingScene(fish: PickFish[], n: StrainNaming, onName: (name: string) => string | null, onLater?: { label: string; go: () => void }): HTMLElement {
  const shown = namingLineup(fish);
  const lit = shown.filter((f) => f.missing.length === 0).length;
  // 一尾一尾亮：總長控制在 3 秒內
  const step = Math.min(0.32, 3 / Math.max(1, lit));
  let k = 0;
  const cells = shown.map((f) => {
    const dream = f.missing.length === 0;
    const cell = h(`span.nm-fish${dream ? '.dream' : ''}`, {}, dream ? h('i.nm-glow', { 'aria-hidden': 'true' }) : null, fishArt(f));
    if (dream) cell.style.animationDelay = `${(0.4 + k++ * step).toFixed(2)}s`;
    return cell;
  });
  const end = 0.4 + lit * step;
  const pct = Math.max(0, Math.min(100, Math.round(n.stability)));
  const fill = h('i.nm-fill');
  fill.style.setProperty('--pct', `${pct}%`);
  fill.style.animationDelay = '0.4s';
  fill.style.animationDuration = `${Math.max(0.6, end - 0.4).toFixed(2)}s`;
  const marks = STABLE_MARKS.map((m) => {
    const el = h(`i.nm-mark${pct >= m.at ? '.on' : ''}`, { title: `${m.at}% ${m.label}` }, h('small', {}, m.label));
    el.style.left = `${m.at}%`;
    return el;
  });
  const meter = h('div.nm-meter', {}, h('div.nm-bar', {}, fill, ...marks), h('div.nm-meter-text', {}, h('span', {}, `${n.total} 尾裡有 ${n.dream} 尾是${DREAM_FISH.name}`), h('b', {}, `穩定度 ${pct}%`)));

  const input = h('input.nm-input', { type: 'text', value: n.suggested, maxlength: String(n.maxLen * 2), 'aria-label': '品系名', enterkeyhint: 'done', autocomplete: 'off' }) as HTMLInputElement;
  const count = h('small.nm-count');
  const msg = h('p.nm-msg', { hidden: true });
  const recount = () => {
    const len = nameLength(input.value);
    count.textContent = `${len}/${n.maxLen}`;
    count.classList.toggle('over', len > n.maxLen);
  };
  input.addEventListener('input', recount);
  recount();
  const preview = h('span.nm-preview', {}, DREAM_FISH.name);
  const submit = () => {
    const name = cleanStrainName(input.value, n);
    const why = onName(name);
    if (why) {
      msg.textContent = why;
      msg.hidden = false;
      input.focus();
      return;
    }
    form.replaceWith(strainPlaque(name));
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
  const form = h(
    'div.nm-form',
    {},
    h('b.nm-ask', {}, '幫你的品系取個名字'),
    h('div.nm-field', {}, input, count, preview),
    msg,
    h(
      'div.bc-foot',
      {},
      onLater ? h('button.btn.small.ghost', { type: 'button', onclick: onLater.go }, onLater.label) : null,
      h('button.btn.primary.nm-go', { type: 'button', onclick: submit }, '就叫這個名字'),
    ),
  );
  form.style.animationDelay = `${(end + 0.5).toFixed(2)}s`;
  return h(
    'div.bc.nm.glass',
    {},
    h('div.nm-grid', {}, ...cells),
    shown.length < fish.length ? h('small.nm-more', {}, `還有 ${fish.length - shown.length} 尾`) : null,
    meter,
    form,
  );
}
