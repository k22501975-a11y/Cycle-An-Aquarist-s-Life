import { DREAM_FISH, lookIndex, type GuppyPhenotype, type PreviewKid } from '../sim';
import { h } from './dom';
import { keeperRibbon } from './keeper-ribbon';
import { dotsOn, kidArt } from './pair-preview-card';
import { femaleArtOf, guppyArt, maleFinOf } from './shop-cards';

/**
 * 中期選育的卡片（design/midgame.md §4）：選種卡（C2）、配對比較卡（C4）、交單還是留著（C5）、
 * 其他選擇點（C1）的圖卡，以及留種緞帶和早上報告的「選育進度」行。
 * 資料由核心算（哪幾尾、機率多少），這裡只負責畫面；字少、圖多，特徵畫成小圖示。
 */

const ART = `${import.meta.env.BASE_URL}art/`;

// ── 資料（核心填） ──────────────────────────────────────────

export interface KeeperKid {
  id: number;
  sex: 'male' | 'female';
  /** 長大後的樣子（基因決定）。 */
  pheno: GuppyPhenotype;
  /** 看得出來的特徵（guppyTraits）。 */
  traits: Array<{ key: string; name: string }>;
  /** 離夢想魚還差的特徵名稱，例如「白子」。 */
  missing: string[];
  keeper: boolean;
}

export interface KeeperPick {
  tank: number;
  kids: KeeperKid[];
  /** 要留幾公幾母（企劃：1 公 2 母）。 */
  need: { male: number; female: number };
}

export interface SireCandidate {
  id: number;
  pheno: GuppyPhenotype;
  traits: Array<{ key: string; name: string }>;
  /** 孫代出現夢想魚的機率（%）。 */
  dreamChance: number;
  /** 和母魚配出來的小魚（previewPair）。 */
  kids: PreviewKid[];
  keeper?: boolean;
}

export interface SireChoice {
  tank: number;
  mother: { id: number; pheno: GuppyPhenotype };
  candidates: SireCandidate[];
}

export interface KeepOrSell {
  fishId: number;
  pheno: GuppyPhenotype;
  sex: 'male' | 'female';
  /** 交單拿到的錢。 */
  coins: number;
  /** 留著：孫代夢想魚機率（%）；交掉之後的機率。 */
  chanceIfKept: number;
  chanceIfSold: number;
}

export interface ChoiceOption {
  key: string;
  label: string;
  /** 一句後果。 */
  consequence: string;
  recommended?: boolean;
  /** 卡上的圖（public/art/ 底下的路徑）。 */
  art?: string;
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

export function traitIcon(key: string): string {
  const gem = GEM[key];
  if (gem) {
    // 蛇王多一層迷宮紋；禮服是後半身暗
    const extra =
      key === 'snake'
        ? '<path d="M7 9 q2-2 4 0 t4 0 M7 12.5 q2 2 4 0 t4 0 M7 16 q2-2 4 0 t4 0" fill="none" stroke="#3a2808" stroke-width="1.1"/>'
        : key === 'tuxedo'
          ? '<path d="M12 4 A8 8 0 0 1 12 20Z" fill="#0b1430" opacity=".75"/>'
          : key === 'albino'
            ? '<circle cx="12" cy="12" r="2.6" fill="#e0263e"/>'
            : '';
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><radialGradient id="g-${key}" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="${gem[0]}"/><stop offset="1" stop-color="${gem[1]}"/></radialGradient></defs><circle cx="12" cy="12" r="8" fill="url(#g-${key})" stroke="#f3ead8" stroke-opacity=".55" stroke-width="1"/>${extra}<ellipse cx="9" cy="8.5" rx="2.4" ry="1.4" fill="#fff" opacity=".55"/></svg>`;
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

function fishArt(p: GuppyPhenotype, sex: 'male' | 'female'): HTMLElement {
  const src = ART + (sex === 'female' ? femaleArtOf(p) : guppyArt(lookIndex(p), maleFinOf(p)));
  return h(`img.bc-fish${p.albino ? '.albino' : ''}`, { src, alt: '', draggable: 'false' });
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
 * 回傳要依序呼叫的 [id, on]。
 */
export function toggleKeeper(pick: KeeperPick, kid: KeeperKid): Array<[number, boolean]> {
  if (kid.keeper) return [[kid.id, false]];
  const same = pick.kids.filter((k) => k.keeper && k.sex === kid.sex);
  const out: Array<[number, boolean]> = [];
  if (same.length >= pick.need[kid.sex] && same.length > 0) out.push([same[0].id, false]);
  out.push([kid.id, true]);
  return out;
}

/** 這一性別名額滿了（再點會換掉一尾）。 */
function sexFull(pick: KeeperPick, sex: 'male' | 'female'): boolean {
  return pick.kids.filter((k) => k.keeper && k.sex === sex).length >= pick.need[sex];
}

/** 公母都標滿了。 */
export function pickDone(pick: KeeperPick): boolean {
  const n = (s: 'male' | 'female') => pick.kids.filter((k) => k.keeper && k.sex === s).length;
  return n('male') >= pick.need.male && n('female') >= pick.need.female;
}

/** 上面的計數：每個名額一個緞帶槽，標了就亮。 */
function tally(pick: KeeperPick): HTMLElement {
  const slots = (sex: 'male' | 'female') => {
    const used = pick.kids.filter((k) => k.keeper && k.sex === sex).length;
    return h(
      `span.bc-tally-group.${sex}`,
      {},
      sexBadge(sex),
      ...Array.from({ length: pick.need[sex] }, (_, i) => (i < used ? keeperRibbon('bc-slot.on') : h('span.bc-slot'))),
    );
  };
  return h('div.bc-tally', {}, slots('male'), slots('female'));
}

/**
 * 選種卡：一窩小魚排成一排，每尾一張「寶貝卡」，點一下掛上留種緞帶。
 * onToggle 由呼叫端改存檔再重畫；onDone 在公母都標滿後出現。
 */
export function keeperPickCard(pick: KeeperPick, onToggle: (id: number, on: boolean) => void, onDone?: () => void): HTMLElement {
  const done = pickDone(pick);
  const card = (k: KeeperKid) => {
    const swap = !k.keeper && sexFull(pick, k.sex);
    return h(
      `button.bc-kid.${k.sex}${k.keeper ? '.kept' : ''}${swap ? '.swap' : ''}${k.missing.length === 0 ? '.dreamy' : ''}`,
      { type: 'button', 'aria-pressed': String(k.keeper), onclick: () => toggleKeeper(pick, k).forEach(([id, on]) => onToggle(id, on)) },
      h('span.bc-glow', { 'aria-hidden': 'true' }),
      k.keeper ? keeperRibbon('bc-kid-ribbon') : null,
      sexBadge(k.sex),
      fishArt(k.pheno, k.sex),
      h('span.bc-traits', {}, ...k.traits.map((t) => traitChip(t))),
      k.missing.length ? h('span.bc-missing', {}, ...k.missing.map(missingChip)) : h('span.bc-complete', {}, '★ 都有了'),
      h('span.bc-mark', {}, k.keeper ? '已留種' : swap ? '換這尾' : '留種'),
    );
  };
  return h(
    'div.bc.bc-pick.glass',
    {},
    h('div.bc-head', {}, keeperRibbon('bc-head-ribbon'), h('b', {}, '選種日'), tally(pick)),
    h('div.bc-dream-goal', {}, h(`img${DREAM_FISH.albino ? '.albino' : ''}`, { src: ART + guppyArt(DREAM_FISH.look), alt: '', draggable: 'false' }), h('small', {}, '目標'), h('span', {}, DREAM_FISH.name)),
    h('div.bc-kids', {}, ...pick.kids.map(card)),
    onDone ? h(`button.btn.primary.bc-done`, { type: 'button', disabled: !done, onclick: onDone }, done ? '就留這幾尾' : '挑 1 公 2 母') : null,
  );
}

// ── 配對比較卡（C4） ─────────────────────────────────────

/**
 * 配哪一尾：母魚在左，2～3 尾候選公魚並排；每尾下面是配出來的小魚和孫代夢想魚的機率星星。
 * 機率最高的那尾掛「機率最高」，但不替玩家決定。
 */
export function sireCompareCard(choice: SireChoice, onPick: (id: number) => void): HTMLElement {
  const best = Math.max(...choice.candidates.map((c) => c.dreamChance));
  const col = (c: SireCandidate) =>
    h(
      `div.bc-sire${c.dreamChance === best && best > 0 ? '.best' : ''}`,
      {},
      c.dreamChance === best && best > 0 ? h('span.bc-best', {}, '機率最高') : null,
      c.keeper ? keeperRibbon('bc-kid-ribbon') : null,
      h('div.bc-sire-pic', {}, sexBadge('male'), fishArt(c.pheno, 'male')),
      h('span.bc-traits', {}, ...c.traits.map((t) => traitChip(t))),
      dreamMeter(c.dreamChance),
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
      h('button.btn.small.primary.bc-pick-btn', { type: 'button', onclick: () => onPick(c.id) }, '配這尾'),
    );
  return h(
    'div.bc.bc-sires.glass',
    {},
    h('div.bc-head', {}, h('b', {}, '配哪一尾？'), h('small', {}, `★ 孫代出${DREAM_FISH.name}`)),
    h(
      'div.bc-sires-row',
      {},
      h('div.bc-mom', {}, keeperRibbon('bc-kid-ribbon'), sexBadge('female'), fishArt(choice.mother.pheno, 'female'), h('small', {}, '媽媽')),
      h('span.bc-x', { 'aria-hidden': 'true' }, '×'),
      h('div.bc-sire-cols', {}, ...choice.candidates.map(col)),
    ),
  );
}

// ── 交單還是留著（C5） ───────────────────────────────────

export function keepOrSellCard(c: KeepOrSell, onSell: () => void, onKeep: () => void): HTMLElement {
  return h(
    'div.bc.bc-ks.glass',
    {},
    h('div.bc-head', {}, h('b', {}, '交單還是留著？')),
    h('div.bc-ks-fish', {}, sexBadge(c.sex), fishArt(c.pheno, c.sex)),
    h(
      'div.bc-ks-row',
      {},
      h(
        'button.bc-ks-opt.sell',
        { type: 'button', onclick: onSell },
        h('img.bc-ks-icon', { src: `${ART}ui/coin.webp`, alt: '', draggable: 'false' }),
        h('b', {}, `+${c.coins}`),
        dreamMeter(c.chanceIfSold),
        h('span.bc-ks-label', {}, '交單'),
      ),
      h(
        'button.bc-ks-opt.keep',
        { type: 'button', onclick: onKeep },
        keeperRibbon('bc-ks-icon'),
        h('b', {}, '留著'),
        dreamMeter(c.chanceIfKept),
        h('span.bc-ks-label', {}, '當種魚'),
      ),
    ),
  );
}

// ── 其他選擇點（C1 等）：圖卡二選一 ─────────────────────────

export function choiceCard(title: string, options: ChoiceOption[], onChoose: (key: string) => void): HTMLElement {
  return h(
    'div.bc.bc-choice.glass',
    {},
    h('div.bc-head', {}, h('b', {}, title)),
    h(
      'div.bc-opts',
      {},
      ...options.map((o) =>
        h(
          `button.bc-opt${o.recommended ? '.rec' : ''}`,
          { type: 'button', onclick: () => onChoose(o.key) },
          o.recommended ? h('span.bc-best', {}, '推薦') : null,
          o.art ? h('img.bc-opt-art', { src: ART + o.art, alt: '', draggable: 'false' }) : null,
          h('b', {}, o.label),
          h('small', {}, o.consequence),
        ),
      ),
    ),
  );
}

/** C1 小魚怎麼保護：育幼盒（推薦）／留在主缸躲草。 */
export const FRY_GUARD_OPTIONS: ChoiceOption[] = [
  { key: 'box', label: '放育幼盒', consequence: '幾乎都活下來', recommended: true, art: 'gear/nursery-box.webp' },
  { key: 'plants', label: '躲水草', consequence: '不花錢，會被吃掉幾尾', art: 'scape/plant-moss.webp' },
];

// ── 早上報告的「選育進度」行 ──────────────────────────────

/** 早上報告裡的一行：緞帶＋留種魚的小圖＋一句進度＋進度條。 */
export function breedingLineRow(text: string, fish?: { pheno: GuppyPhenotype; sex: 'male' | 'female' }, progress?: number): HTMLElement {
  return h(
    'div.bc-line',
    {},
    keeperRibbon('bc-line-ribbon'),
    fish ? fishArt(fish.pheno, fish.sex) : null,
    h('span.bc-line-text', {}, text),
    progress !== undefined ? h('span.bc-line-bar', {}, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` } })) : null,
  );
}
