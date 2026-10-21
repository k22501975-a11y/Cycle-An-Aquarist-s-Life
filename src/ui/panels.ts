import type { SoundId } from '../audio/sounds';
import { FEATURES } from '../features';
import { substrateName, tankSubstrateLook } from '../render/substrate';
import { kitColor, type KitParam } from '../render/ops-fx';
import {
  isShrimpSpecies,
  addBottledBacteria,
  addFish,
  CARE_EAT_THRESHOLD,
  careTarget,
  guardianOf,
  hasSpawnSite,
  isBroodParent,
  PARENTAL,
  addSnail,
  APPLE_COLOR_LABELS,
  catchPests,
  collectTrap,
  doseMolluscicide,
  buyPlant as plantFromShop,
  isLightOn,
  PESTS,
  pestCount,
  removeClutches,
  removeDeadSnails,
  scrapeNeriteEggs,
  setTrap,
  snailBloom,
  SNAILS,
  type AppleColor,
  type PestKind,
  type SnailKind,
  addFishToQuarantine,
  addCuttings,
  addHardscape,
  addPlant,
  transferMedia,
  mediaAvailable,
  buybackRefusal,
  cureRefusal,
  mallBag,
  useCure,
  GUPPY_STRAIN_PRICES,
  GUPPY_FIN_STRAINS,
  GUPPY_STRAINS,
  finWords,
  matingSuccess,
  predictOffspring,
  canClaimStarterPack,
  claimStarterPack,
  buyTank,
  addHolidayTablet,
  buyTankRefusal,
  HOLIDAY_TABLET_DAYS,
  installFeeder,
  LOCKED_SPECIES,
  speciesUnlocked,
  tankLock,
  unlockHint,
  moveFish,
  newTankCost,
  purposeCost,
  setTankPurpose,
  suggestPurpose,
  TANK_PURPOSES,
  type TankPurpose,
  removeTank,
  removeTankRefusal,
  slotPrice,
  TANK_SETS,
  tankLabel,
  type TankSizeId,
  chargeMeal,
  economy,
  FISH_PRICES,
  BETTA_FEMALE_PRICE,
  fishBuybackPrice,
  PLANT_PRICES,
  plantBuybackPrice,
  price,
  sellCuttings,
  sellableCuttings,
  chestCuttingsOf,
  sellFish,
  sellsLeftToday,
  spend,
  takeCutting,
  buyQuarantine,
  HARDSCAPE,
  removeHardscape,
  placeFromBag,
  replaceSubstrate,
  SUBSTRATES,
  doseAntibiotic,
  doseDewormer,
  doseQuarantine,
  hasVisible,
  isJuvenile,
  crowdingRatio,
  COMFORT_BAND,
  dripMinutes,
  dripGrade,
  dripTutorialLeft,
  recordDrip,
  farmHabit,
  habitGap,
  habitOf,
  phBeyondSurvival,
  SPLIT_PLAN_LABELS,
  splitAdvice,
  splitGroup,
  splitTank,
  rescueFryToBox,
  BOX_CAPACITY,
  buyNurseryBox,
  dueMothers,
  moveDueToNursery,
  moveToNursery,
  NURSERY_FRY_CAPACITY,
  NURSERY_RELEASE_CM,
  nurseryFish,
  nurseryRefusal,
  releaseNursery,
  rescueFryToNursery,
  type SplitPlan,
  daysUntilSexVisible,
  growthFactors,
  growthStage,
  maxLengthCm,
  sexVisible,
  stageLabel,
  phenotype,
  strainName,
  QUARANTINE_DAYS,
  quarantineDays,
  readyForTank,
  releaseQuarantine,
  swallowCm,
  tooSmallForTank,
  PINCH_MEALS,
  orderBoard,
  matchingFish,
  orderSupply,
  moveToQuarantine,
  AIR_PUMPS,
  CHILLERS,
  CO2_KITS,
  doseIchMedication,
  DEFAULT_FOOD,
  feed,
  FANS,
  FOOD_GRADES,
  FOOD_KINDS,
  mealMg,
  mealPrice,
  tapFeed,
  type TapFeedResult,
  FILTERS,
  FISH_SPECIES,
  freeAmmonia,
  HEATERS,
  hidingFactor,
  LIGHTS,
  monthOf,
  observeSymptoms,
  PLANT_SPECIES,
  REGION_LABELS,
  removeDeadFish,
  replaceFilter,
  rinseFilterMedia,
  seasonName,
  setHeaterTarget,
  topUp,
  unplugHeater,
  trimPlant,
  waterChange,
  type DripOutcome,
  type Fish,
  type FishSpeciesId,
  type FoodGrade,
  type FoodKind,
  type Symptom,
  type PlantSpeciesId,
  type Region,
  type TankState,
  type TestKitReading,
  markDaily,
  needsSetup,
  type MallItemId,
} from '../sim';
import { applySeason, type Game } from '../game/game';
import { h } from './dom';
import { ORDER_ICON, ordersPanel } from './orders-panel';
import { BROOD_ISSUE_LABELS, DEATH_CAUSE_LABELS, fishName, SYMPTOM_LABELS } from './labels';
import { artImg, ownerImg } from './art-icons';
import { pairPreviewCard } from './pair-preview-card';
import { advice, cardGrid, guppyArt, iconTabs, plantArt, priceTag, shopCard, snailArt, speciesArt } from './shop-cards';
import type { Sheet, Toasts } from './sheet';
import type { CelebrateSpec } from './celebrate';
import type { MomentId } from './moments';
import { READING_TONES, todos } from './status';
import { overloadWarning } from './tutorial';
import { ownerAsk } from './owner-ask';
import { personaLine } from './persona';
import { openDripGame } from './drip-game';

export interface PanelContext {
  game: Game;
  sheet: Sheet;
  toasts: Toasts;
  /** 播放音效（沒有聲音引擎時不做事）。 */
  sound?: (id: SoundId) => void;
  /** 做一件可能後悔的事，通知上附「復原」按鈕。 */
  undoable?: (run: () => void, text: string, tone?: 'warn' | 'info') => void;
  /** 進入造景模式（拖曳擺放石頭、沉木、水草）。 */
  openScape?: () => void;
  /** 剛買的石頭、水草拿在手上（P4）：收起商店、進造景模式選著它，讓玩家拖到想擺的位置。 */
  placeNew?: (target: { kind: 'plant'; id: number } | { kind: 'hardscape'; index: number }) => void;
  /** 「第一次」的慶祝演出（只演一次）；有演出時回傳 true。 */
  moment?: (id: MomentId, spec: CelebrateSpec) => boolean;
  /** 這條魚在缸裡的樣子（觀察面板頂端的大圖）；沒有就不放圖。 */
  fishPic?: (fish: Fish) => string | null;
  /** 打開開缸（挑設備）面板。 */
  openSetup?: () => void;
  /** 拿到錢的演出：金幣從 from 飛進錢包（F8）。 */
  /** 拿到錢：金幣飛進錢包；tier 是特效大小（小事寶箱、賣魚 small，交單 medium，V5）。 */
  reward?: (from: DOMRect | null, amount: number, tier?: 'small' | 'medium') => void;
  /** 剛放進缸的魚（對水小遊戲對得完美時，魚一進缸就聚光展開尾巴）。 */
  welcome?: (fishIds: number[], perfect: boolean) => void;
  /** 用商城道具：先跟伺服器扣一個，成功才 apply；回傳 null 是成功，不然是原因。 */
  useMall?: (item: MallItemId, apply: () => boolean, refusal: () => string | null) => Promise<string | null>;
}

/** 沒有復原機制時（例如測試）就直接做並顯示通知。 */
function doUndoable(ctx: Pick<PanelContext, 'toasts' | 'undoable'>, run: () => void, text: string, tone: 'warn' | 'info' = 'info'): void {
  if (ctx.undoable) ctx.undoable(run, text, tone);
  else {
    run();
    ctx.toasts.show(text, tone);
  }
}

const alive = (s: TankState) => s.fish.filter((f) => f.alive);

/** 一餐的份量：缸內所有魚每日食量的一半（建議一天兩餐）。 */
const mealSize = mealMg;

function button(label: string, onclick: () => void, kind = ''): HTMLButtonElement {
  return h(`button.btn${kind ? '.' + kind : ''}`, { onclick }, label);
}

/** 藥的按鈕：短名字＋金幣價錢（V4：按鈕不放整句）。 */
function medButton(label: string, cost: number, onclick: () => void): HTMLButtonElement {
  return h('button.btn.med-btn', { onclick, 'aria-label': `下${label}，${cost} 元` }, label, h('span.btn-cost', {}, h('i.coin'), String(cost)));
}

/** 上次選的飼料（同一次遊戲記住）。 */
let feedChoice: { kind: FoodKind; grade: FoodGrade } = { ...DEFAULT_FOOD };

/**
 * 手指餵食（P5）：點一下水面撒一小撮上次選的飼料（種類、等級在「進階」面板選），份量和扣錢照核心的 tapFeed。
 * 缸裡沒魚回傳 null。
 */
export function feedTap(ctx: PanelContext): TapFeedResult | null {
  const got = ctx.game.act((st) => tapFeed(st, feedChoice));
  if (got.mg <= 0) return null;
  ctx.sound?.('feed');
  return got;
}

/** 缸裡有誰吃不太到這種飼料（例如只餵漂浮的，蝦吃不到）。 */
export function feedWarning(s: TankState, kind: FoodKind): string | null {
  const species = [...new Set(alive(s).map((f) => f.species))];
  const missing = species.filter((sp) => FISH_SPECIES[sp].diet[kind] < 0.5);
  if (!missing.length) return null;
  const better = kind === 'sinking' ? '漂浮' : '沉底';
  return `${missing.map((sp) => FISH_SPECIES[sp].name).join('、')}吃不太到${FOOD_KINDS[kind].name}飼料，記得也餵${better}的。`;
}

/** 面板沒東西可做時：一張有圖的卡，老闆說一句，直接帶去商店對應的分頁（不是一行字）。 */
function emptyState(ctx: PanelContext, text: string, tab: ShopTab, art: string): Node {
  const pic = h('img.empty-art', { src: `${import.meta.env.BASE_URL}art/${art}`, alt: '', draggable: 'false' });
  pic.addEventListener('error', () => pic.remove());
  return h(
    'div.empty-state',
    {},
    pic,
    h('div.empty-owner', {}, ownerImg('empty-avatar'), h('span', {}, text)),
    h('button.btn.primary.go-shop', { onclick: () => ctx.sheet.open('商店', () => shopPanel(ctx, tab)) }, artImg('shop', 'btn-art'), '去商店'),
  );
}

export function feedPanel(ctx: PanelContext): Node {
  const { game, sheet, toasts, sound } = ctx;
  const s = game.state;
  const meal = mealSize(s);
  if (meal <= 0) return emptyState(ctx, '缸裡還沒有魚，先去挑幾條吧。', 'fish', speciesArt('guppy'));
  const give = (mg: number, label: string) => () => {
    const { kind, grade } = feedChoice;
    game.act((st) => {
      // 飼料錢每週跟電費一起結算，沒錢也能餵，魚不會因為沒錢餓死
      chargeMeal(st, mealPrice(kind, grade) * (mg / meal));
      feed(st, mg, kind, grade);
    });
    sound?.('feed');
    toasts.show(`餵了${label}${FOOD_GRADES[grade].name}${FOOD_KINDS[kind].name}飼料（${mg.toFixed(0)} mg）`);
    sheet.close();
  };
  const pick = (choice: Partial<typeof feedChoice>) => () => {
    feedChoice = { ...feedChoice, ...choice };
    sheet.refresh();
  };
  const { kind, grade } = feedChoice;
  const g = FOOD_GRADES[grade];
  const warning = feedWarning(s, kind);
  return h(
    'div.stack',
    {},
    h('div.tabs', {}, ...(Object.keys(FOOD_KINDS) as FoodKind[]).map((k) => h(`button.tab${k === kind ? '.active' : ''}`, { onclick: pick({ kind: k }) }, FOOD_KINDS[k].name))),
    h('p.hint', {}, FOOD_KINDS[kind].hint + '。'),
    h('div.tabs', {}, ...([1, 2, 3, 4] as FoodGrade[]).map((n) => h(`button.tab${n === grade ? '.active' : ''}`, { onclick: pick({ grade: n }) }, FOOD_GRADES[n].name))),
    h('p.hint', {}, `${g.name}：${GRADE_NOTES[grade]}價錢是標準的 ${mealPrice(kind, grade).toFixed(1)} 倍。`),
    warning ? h('p.hint.warn', {}, warning) : null,
    h(
      'div.row',
      {},
      // 一小撮是新缸期的維持量：一天兩次吃得飽、一天一次有點餓但不會餓壞，殘餌也少
      button('一小撮', give(meal * PINCH_MEALS, '一小撮')),
      button('一餐', give(meal, '一餐'), 'primary'),
      button('一大把', give(meal * 3, '一大把')),
    ),
    h('p.hint', {}, '一天兩餐、幾分鐘內吃完最好。吃不完的飼料會腐敗，變成氨。'),
  );
}

const GRADE_NOTES: Record<FoodGrade, string> = {
  1: '填充物多，魚長得慢、比較容易生病，吃不完的也比較髒。',
  2: '營養足夠，日常用。',
  3: '含蝦紅素、螺旋藻，發色變好，比賽前用。',
  4: '營養、發色、繁殖意願都最好，殘餌也少。',
};

export function waterChangePanel({ game, sheet, toasts, sound, undoable }: PanelContext): Node {
  let fraction = 0.3;
  let matchTemp = true;
  // 一個小缸：上面要換掉的舊水標成黃濁色，下面留著的是缸裡的水，拉桿和選項都跟著動
  const old = h('i.wc-old');
  const pct = h('b.wc-pct');
  const gauge = h('div.wc-tank', { 'aria-hidden': 'true' }, h('i.wc-keep'), old, pct);
  const slider = h('input', { type: 'range', min: '10', max: '80', step: '5', value: '30', 'aria-label': '換水量' }) as HTMLInputElement;
  const PRESETS = [
    { pct: 20, name: '小換', note: '每週保養' },
    { pct: 30, name: '一般', note: '推薦' },
    { pct: 50, name: '大換', note: '水變差時' },
  ];
  const presetBtns = PRESETS.map((p) =>
    h('button.wc-preset', { type: 'button', onclick: () => set(p.pct) }, h('span.wc-mini', { 'aria-hidden': 'true' }, h('i', { style: `height:${p.pct}%` })), h('b', {}, `${p.name} ${p.pct}%`), h('small', {}, p.note)),
  );
  const set = (value: number) => {
    fraction = value / 100;
    slider.value = String(value);
    old.style.height = `${value}%`;
    pct.textContent = `換 ${value}%`;
    PRESETS.forEach((p, i) => presetBtns[i].classList.toggle('active', p.pct === value));
  };
  slider.addEventListener('input', () => set(Number(slider.value)));
  set(30);
  const temp = h('button.wc-temp.active', { type: 'button', 'aria-pressed': 'true' }, h('span.kit-thermo', { 'aria-hidden': 'true' }, h('i')), h('span', {}, h('b', {}, '新水對好溫度'), h('small', {}, '沒對溫，水溫驟變會讓魚緊迫')));
  temp.addEventListener('click', () => {
    matchTemp = !matchTemp;
    temp.classList.toggle('active', matchTemp);
    temp.setAttribute('aria-pressed', String(matchTemp));
  });
  return h(
    'div.stack',
    {},
    h('div.wc-top', {}, gauge, h('div.wc-presets', {}, ...presetBtns)),
    h('label.field', {}, slider),
    temp,
    button('開始換水', () => {
      doUndoable({ toasts, undoable }, () => game.act((st) => waterChange(st, fraction, matchTemp ? { tempC: st.water.tempC } : {})), `換了 ${Math.round(fraction * 100)}% 的水`);
      sound?.('water');
      sheet.close();
    }, 'primary'),
    advice(['換水能稀釋氨、亞硝酸鹽、硝酸鹽，並補回 KH。每週 20–30% 是好習慣。']),
  );
}

const READING_ROWS: Array<{ key: keyof TestKitReading; label: string; short: string; unit: string; kit?: KitParam }> = [
  { key: 'ammonia', label: '氨 NH₃/NH₄⁺', short: '氨', unit: 'ppm', kit: 'ammonia' },
  { key: 'nitrite', label: '亞硝酸鹽 NO₂', short: '亞硝酸鹽', unit: 'ppm', kit: 'nitrite' },
  { key: 'nitrate', label: '硝酸鹽 NO₃', short: '硝酸鹽', unit: 'ppm', kit: 'nitrate' },
  { key: 'ph', label: 'pH', short: 'pH', unit: '', kit: 'ph' },
  { key: 'kh', label: 'KH', short: 'KH', unit: 'dKH' },
];

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 一支試管：裝著跟缸裡一樣的比色結果（KH 沒有比色，用淡藍）。 */
function tube(color: string): HTMLElement {
  const t = h('span.kit-tube', { 'aria-hidden': 'true' }, h('i'));
  t.style.setProperty('--liquid', color);
  return t;
}

/** 顯示最近一次測水的結果（測試按鈕會先測一次）：每一項是一支試管，顏色就是比色的結果。 */
export function testKitPanel({ game }: PanelContext): Node {
  const test = game.state.lastTest;
  if (!test) return h('p', {}, '還沒測過水。');
  const r = test.reading;
  return h(
    'div.stack',
    {},
    h(
      'div.kit-grid',
      {},
      ...READING_ROWS.map((row) => {
        const tone = READING_TONES[row.key](r[row.key]);
        const color = row.kit ? hex(kitColor(row.kit, r[row.key])) : '#9fd3e6';
        return h('div.kit-card', { title: row.label }, tube(color), h('span.kit-name', {}, row.short), h(`b.kit-value.${tone}`, {}, `${r[row.key]}`, row.unit ? h('small', {}, ` ${row.unit}`) : ''));
      }),
      h('div.kit-card', { title: '溫度計' }, h('span.kit-thermo', { 'aria-hidden': 'true' }, h('i')), h('span.kit-name', {}, '水溫'), h('b.kit-value', {}, game.state.water.tempC.toFixed(1), h('small', {}, ' °C'))),
    ),
    advice(['試劑只能比對色卡，讀到的是大約的級距。結果會顯示在上方的狀態列：超過一天會變淡（水可能已經變了），三天後就當作不知道。養水任務要看當天的讀數。']),
  );
}

/** 修剪：列出所有水草，長滿一半以上的可以剪。 */
export function trimListPanel(ctx: PanelContext): Node {
  const { game, sheet } = ctx;
  const plants = game.state.plants;
  if (plants.length === 0) return emptyState(ctx, '缸裡還沒有水草，種一盆再來修剪。', 'plants', plantArt('anubias'));
  return h(
    'div.stack',
    {},
    h('p.hint', {}, '水草長超過一半就能修剪，剪下的插枝可以種回缸裡。也可以直接點缸裡的水草。'),
    ...plants.map((p) => {
      const sp = PLANT_SPECIES[p.species];
      const fullness = Math.min(100, Math.round((p.biomassG / sp.maxBiomassG) * 100));
      return h(
        'div.item',
        {},
        h('div', {}, h('b', {}, `${sp.name} #${p.id}`), h('div.hint', {}, `茂密度 ${fullness}%`)),
        button('查看', () => sheet.open('水草', () => plantPanel(ctx, p.id), { live: true })),
      );
    }),
  );
}

/** 這次開遊戲已經提醒過「新缸放太多魚」了。 */
let overloadWarned = false;
/** 商店放魚的方式：預設慢慢滴水對水。 */
let shopDrip = true;
/** 滴水對水時自己玩對水小遊戲（第一次一定要玩；之後預設一鍵「慢慢過水」，想玩才按「自己滴」，mvp.md §4.4.3）。 */
let shopPlay = false;

const TAIL_SHAPE_LABELS = { round: '圓尾', delta: '三角尾', halfmoon: '半月尾' } as const;

/** 孔雀魚的品系、尾鰭分數、代數與近親程度（玩家看得到的外觀與紀錄，看不到隱性基因）。 */
function geneticsInfo(fish: Fish): Node {
  const g = fish.genome!;
  const p = phenotype(g);
  const rows: [string, string][] = [];
  // 仔魚和母魚的品系特徵不明顯，只有成年公魚看得出完整品系
  // 白子一出生就看得出來（紅眼）；花紋要轉色才浮現，鰭型要到亞成魚
  const stage = growthStage(fish);
  const finsShown = stage === 'subadult' || stage === 'adult' || stage === 'old';
  if (fish.sex === 'male' && sexVisible(fish) && finsShown) rows.push(['品系', strainName(p)]);
  else rows.push(['看得出的特徵', [p.albino ? '紅眼（白子）' : '', sexVisible(fish) && p.gold ? '金色身體' : '', sexVisible(fish) && p.tuxedo ? '後半身深色（禮服）' : '', ...(finsShown ? finWords(p) : [])].filter(Boolean).join('、') || '還看不出來']);
  if (!isJuvenile(fish)) rows.push(['尾鰭', `${g.tail} 分・${TAIL_SHAPE_LABELS[p.tailShape ?? 'delta']}`]);
  if (fish.sex === 'male' && !isJuvenile(fish) && matingSuccess(g) < 1) rows.push(['繁殖', matingSuccess(g) === 0 ? '交接器太長，不能交配（長公）' : '交接器偏長，很難配成']);
  rows.push(['來源', fish.generation ? `自家繁殖第 ${fish.generation} 代` : '水族店']);
  const inbred = fish.inbreeding ?? 0;
  if (inbred >= 0.2) rows.push(['血緣', inbred >= 0.45 ? '近親繁殖太多代，體質和尾鰭在退化' : '有點近親，記得引進新血']);
  const table = h('table.readings', {}, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td.value', {}, v))));
  if (fish.sex !== 'female' || !fish.sire || isJuvenile(fish)) return table;
  // 母魚會儲存精子：下一胎的爸爸已經決定了，可以預測子代
  const dad = phenotype(fish.sire.genome);
  const pred = predictOffspring(g, fish.sire.genome);
  const list = (items: [string, number][]) => items.slice(0, 4).map(([k, v]) => `${k} ${v}%`).join('、');
  return h(
    'div.stack',
    {},
    table,
    h('h3', {}, '下一胎預測'),
    h('p.hint', {}, `爸爸是${strainName(dad)}（尾鰭 ${fish.sire.genome.tail} 分）。孔雀魚母魚交配一次可以連生好幾胎。`),
    h('p', {}, `公魚：${list(pred.sons)}`),
    h('p', {}, `母魚：${list(pred.daughters)}`),
  );
}

/** 年齡：未滿兩個月用天，之後用月、年。 */
export function ageLabel(days: number): string {
  if (days < 60) return `${Math.floor(days)} 天大`;
  if (days < 365) return `約 ${Math.floor(days / 30)} 個月大`;
  const years = days / 365;
  return `約 ${years < 10 ? (Math.floor(years * 2) / 2).toString() : Math.floor(years)} 歲`;
}

export function fishPanel({ game, sheet, toasts, fishPic, useMall }: PanelContext, fishId: number): Node {
  const fish = game.state.fish.find((f) => f.id === fishId);
  if (!fish) return h('p', {}, '這條魚已經不在缸裡了。');
  if (!fish.alive) {
    const cause = Object.entries(fish.recentDamage).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    return h(
      'div.stack',
      {},
      h('p', {}, `${fishName(fish)} 已經死了，可能原因：${DEATH_CAUSE_LABELS[cause] ?? cause}。`),
      h('p.hint', {}, '死魚留在缸裡會腐爛產生大量的氨，請盡快撈出。'),
      button('撈出死魚', () => {
        game.act(removeDeadFish);
        sheet.close();
      }, 'primary'),
    );
  }
  const symptoms = observeSymptoms(game.state, fish);
  const pic = fishPic?.(fish);
  return h(
    'div.stack',
    {},
    pic ? h('div.fish-hero', {}, h('img', { src: pic, alt: '', draggable: 'false' })) : null,
    h('p', {}, `${fishName(fish)} · 體長約 ${fish.lengthCm.toFixed(1)} cm · ${ageLabel(fish.ageDays)}`),
    personaLine(fish),
    h('p', {}, growthLine(game.state, fish)),
    h('p', {}, habitLine(game.state, fish)),
    broodLine(game.state, fish),
    fish.genome ? geneticsInfo(fish) : null,
    symptoms.length
      ? h('ul.symptoms', {}, ...symptoms.map((s) => h('li', {}, SYMPTOM_LABELS[s])))
      : h('p', {}, '游動正常，看起來很健康。'),
    h('p', {}, conditionLine(fish)),
    h('p.hint', {}, '症狀只是線索：先用測試劑檢查水質，再判斷是環境問題還是生病。'),
    game.tanks.length > 1 ? moveFishRow(game, sheet, toasts, fish) : null,
    cureButton(game, sheet, toasts, fish, useMall),
  );
}

/** 背包裡有特效藥、這尾魚又用得上時才出現。 */
function cureButton(game: Game, sheet: Sheet, toasts: Toasts, fish: Fish, useMall: PanelContext['useMall']): Node | null {
  const left = mallBag(game.tanks).cure;
  if (!useMall || left <= 0 || cureRefusal(game.tanks, fish)) return null;
  return h(
    'div.stack',
    {},
    button(`用特效藥（背包剩 ${left} 瓶）`, async () => {
      // 背包是伺服器庫存的副本：先跟伺服器扣一瓶，成功才治
      const why = await useMall('cure', () => useCure(game.tanks, fish), () => cureRefusal(game.tanks, fish));
      if (why) toasts.show(why, 'warn');
      else toasts.show('症狀退了一些。特效藥只治症狀，記得找出生病的原因（水質、病原），不然還會再發');
      sheet.refresh();
    }),
    h('p.hint', {}, '特效藥只治症狀：水裡的病原和水質問題還在。水質造成的傷，效果只有一半。'),
  );
}

/** 親魚護幼（market-and-breeding.md §1.3.3）：親魚在顧哪一窩、護幼值、照顧不好的原因；仔魚跟著誰。 */
export function broodLine(state: TankState, fish: Fish): Node | null {
  const parent = fish.guardian !== undefined ? guardianOf(state, fish) : null;
  if (parent) return h('p', {}, parent.sex === 'male' ? '跟著爸爸：剛會游的仔魚掉出泡巢，爸爸會含回去' : '跟著媽媽：被吃的機率小很多，媽媽會帶去找東西吃');
  const spec = PARENTAL[fish.species];
  if (!spec || !isBroodParent(fish) || !sexVisible(fish)) return null;
  const nest = spec.site === 'bubble';
  const b = fish.brood;
  if (!b) {
    const living = state.fish.filter((f) => f.alive && f !== fish && f.species === fish.species && sexVisible(f));
    const why = !hasSpawnSite(state, fish.species)
      ? nest ? '水流太強，吐不了泡巢：用海綿過濾或關小過濾器（繁殖缸常用水妖精）' : '缸裡沒有洞穴：放石頭或沉木才有地方產卵'
      : state.water.tempC < spec.minTempC ? `水溫 ${spec.minTempC}°C 以上才會產卵`
      : state.water.ph > spec.maxPh ? `水太鹼（pH ${state.water.ph.toFixed(1)}），要偏酸的軟水才會產卵：放沉木或用水草泥`
      : nest && living.some((f) => f.sex === 'male') ? '缸裡還有別的公鬥魚，只會打架不會吐泡巢'
      : !living.some((f) => f.sex !== spec.guardSex) ? (nest ? '缸裡沒有成熟的母鬥魚' : '缸裡沒有成熟的公魚')
      : '條件都有了，餵點紅蟲之類的肉食會比較快產卵';
    return h('p.hint', {}, `繁殖：${why}`);
  }
  const days = Math.floor((state.hours - b.hour) / 24);
  const kids = state.fish.filter((f) => f.alive && f.guardian === fish.id).length;
  const stage = nest
    ? b.stage === 'eggs' ? `在泡巢下顧著約 ${Math.round(b.count)} 顆卵（約一天半孵化），母魚要撈走` : b.stage === 'wigglers' ? `卵孵了，約 ${Math.round(b.count)} 尾仔魚吊在泡巢下吸卵黃（再兩三天會平游）` : `${kids} 尾仔魚會游了，公魚再顧一兩天就該撈走`
    : b.stage === 'eggs' ? `在洞穴裡顧著約 ${Math.round(b.count)} 顆卵（第 ${days + 1} 天，約 3 天孵化）` : b.stage === 'wigglers' ? `卵孵了，仔魚還在洞裡吸卵黃（約 ${Math.round(b.count)} 尾）` : `帶著 ${kids} 尾仔魚巡邏（第 ${days + 1} 天，約 4 週後離巢）`;
  const { issue } = careTarget(state, fish);
  const care = Math.round(b.care * 100);
  return h(
    'div.stack',
    {},
    h('p', {}, `護幼中：${stage}`),
    h(b.care < CARE_EAT_THRESHOLD + 0.1 ? 'p.warn-text' : 'p.hint', {}, `護幼值 ${care}%${issue ? `：${BROOD_ISSUE_LABELS[issue]}` : '，很安心'}${b.care < CARE_EAT_THRESHOLD + 0.1 ? '，再低下去會把小孩吃掉' : ''}`),
  );
}

/** 成長：階段、還要幾天看得出公母、為什麼長得慢、小時候沒養好的後遺症。 */
export function growthLine(state: TankState, fish: Fish): string {
  const parts = [`${stageLabel(fish)}`];
  if (!sexVisible(fish)) parts.push(`公母還看不出來（約 ${daysUntilSexVisible(fish)} 天後）`);
  if (fish.lengthCm < maxLengthCm(fish) * 0.97) {
    const f = growthFactors(state, fish, crowdingRatio(state));
    const slow = [f.space < 0.9 ? '缸太擠' : '', f.water < 0.9 ? '水質差（該換水了）' : '', f.food < 0.75 ? '吃不夠或營養差' : ''].filter(Boolean);
    if (slow.length) parts.push(`長得慢：${slow.join('、')}`);
  }
  if ((fish.stunted ?? 0) >= 0.15) parts.push('小時候太擠或吃不好，長大會比別人小（永久）');
  if (isShrimpSpecies(fish.species) && fish.lengthCm < maxLengthCm(fish) * 0.97) parts.push('靠脫殼長大');
  return parts.join(' · ');
}

/** 習慣的水質（design/acclimation.md §4）：跟目前的水差多少，差太多會緊迫，慢慢就會適應。 */
export function habitLine(state: TankState, fish: Fish): string {
  const h = habitOf(state, fish);
  const g = habitGap(state, fish);
  const off = Math.abs(g.ph) > COMFORT_BAND.ph || Math.abs(g.gh) > COMFORT_BAND.gh;
  const base = `習慣的水質：pH ${h.ph.toFixed(1)}、GH ${Math.round(h.gh)}、${h.tempC.toFixed(0)}°C`;
  if (phBeyondSurvival(state, fish) > 0) return `${base} · 現在的 pH 超出牠能撐的範圍，要盡快調回來`;
  return off ? `${base} · 跟現在的水差比較多，會緊迫一陣子，一兩週會慢慢適應` : `${base} · 跟現在的水差不多`;
}

/** 吃得怎麼樣：長期營養、發色、繁殖意願（看最近餵的飼料）。 */
export function conditionLine(fish: Fish): string {
  const n = fish.nutrition ?? 0.5;
  const parts = [`營養${n < 0.4 ? '偏差' : n < 0.65 ? '普通' : '很好'}`];
  const c = fish.colorBoost ?? 0;
  if (c >= 0.1) parts.push(`發色加成 ${Math.round(c * 100)}%`);
  const b = fish.breedingCondition ?? 0.5;
  if (b >= 0.65) parts.push('很想繁殖');
  else if (b < 0.4) parts.push('沒什麼繁殖意願');
  return parts.join(' · ');
}

/** 把魚撈到別缸：繁殖時把母魚隔開、把挑出來的種魚放專缸。 */
function moveFishRow(game: Game, sheet: Sheet, toasts: Toasts, fish: Fish): Node {
  return h(
    'div.stack',
    {},
    h('h3', {}, '撈到別缸'),
    h('p.hint', {}, '兩缸水溫、pH 差越多，魚換過去越緊迫。'),
    h(
      'div.row.wrap',
      {},
      ...game.tanks.map((t, i) =>
        i === game.active
          ? null
          : button(tankLabel(game.tanks, i), () => {
              const ok = game.actAll((tanks) => moveFish(tanks[game.active], t, fish.id));
              if (!ok) return;
              toasts.show(`把${fishName(fish)}撈到${tankLabel(game.tanks, i)}`);
              sheet.close();
            }),
      ),
    ),
  );
}

/**
 * 一鍵分缸（design/growth.md §4.1）：照建議選一種分法和目標缸，系統把那群魚撈過去。
 * 換缸有一點緊迫（兩缸水質差越多越緊迫），但遠比不分好。沒有別的缸就提醒先加一缸或賣掉一些。
 */
export function splitPanel(ctx: PanelContext, suggested: SplitPlan): Node {
  const { game, sheet, toasts } = ctx;
  const state = game.state;
  const advice = splitAdvice(state);
  const plans: SplitPlan[] = [suggested, ...(['by_size', 'by_sex', 'half'] as SplitPlan[]).filter((p) => p !== suggested)].filter((p) => splitGroup(state, p).length > 0);
  let plan = plans[0] ?? suggested;
  const others = game.tanks.map((t, i) => ({ t, i })).filter(({ i }) => i !== game.active);
  const body = h('div.stack');
  // 檢疫盒當育幼盒：只有一缸時仔魚也有地方躲（#144）
  const boxOption = (n: number) =>
    h(
      'div.stack',
      {},
      button(`放進檢疫盒（${n} 條）`, () => {
        const moved = game.act((st) => rescueFryToBox(st));
        if (!moved) return;
        ctx.sound?.('net');
        toasts.show(`${moved} 條仔魚撈進檢疫盒了，長到成魚吞不下再放回主缸`);
        sheet.close();
      }, 'primary'),
      (state.quarantine?.fish.length ?? 0) + n > BOX_CAPACITY ? h('p.hint', {}, `盒子放超過 ${BOX_CAPACITY} 條會擠，小魚長得慢一點`) : null,
    );
  // 育幼盒（#187、#166）：掛在缸邊、不佔缸位；沒有就一鍵買了直接放
  const nurseryOption = (group: Fish[]) => {
    const n = group.filter((f) => isJuvenile(f)).length;
    if (n === 0) return null;
    const room = NURSERY_FRY_CAPACITY - nurseryFish(state).length;
    const put = () => {
      const moved = game.act((st) => rescueFryToNursery(st, splitGroup(st, 'by_size').filter((f) => isJuvenile(f))));
      if (!moved) return;
      ctx.sound?.('net');
      toasts.show(`${moved} 條仔魚撈進育幼盒了，長到 ${NURSERY_RELEASE_CM} cm 會自己回主缸`);
      sheet.close();
    };
    if (!state.nurseryBox)
      return button(`去買育幼盒 ${price('nursery:box')} 元，把小魚放進去`, () => {
        if (purchase(ctx, price('nursery:box'), buyNurseryBox, '買了育幼盒，掛在缸邊')) put();
      }, 'primary');
    const blocked = nurseryRefusal(state, group.find((f) => isJuvenile(f))!);
    if (blocked) return h('p.hint', {}, `育幼盒：${blocked}`);
    return button(`放進育幼盒（${Math.min(n, room)} 條${n > room ? `，盒子只放得下 ${room} 條` : ''}）`, put, 'primary');
  };
  const render = () => {
    const group = splitGroup(state, plan);
    body.replaceChildren(
      ...advice.map((a) => h(`p.${a.tone === 'bad' ? 'warn-text' : 'hint'}`, {}, a.text)),
      h('h3', {}, '怎麼分'),
      h('div.row.wrap', {}, ...plans.map((p) => h(`button.btn.small${p === plan ? '.primary' : ''}`, { onclick: () => ((plan = p), render()) }, SPLIT_PLAN_LABELS[p]))),
      h('p', {}, `要移的魚：${group.length} 條（${[...new Set(group.map((f) => fishName(f).replace(/ #\d+$/, '')))].join('、')}）`),
      h('h3', {}, '移到哪一缸'),
      ...(plan === 'by_size' && group.length > 0 ? [nurseryOption(group)].filter((x): x is NonNullable<typeof x> => x !== null) : []),
      ...(plan === 'by_size' && state.quarantine && group.length > 0 ? [boxOption(group.length)] : []),
      others.length === 0
        ? h('div.stack', {}, h('p.hint', {}, plan === 'by_size' ? '沒有別的缸。仔魚先放育幼盒或檢疫盒，長大了自己回主缸；魚太多再加一缸，或把一部分賣掉。' : '沒有別的缸。先加一缸（大缸比較穩，但設備要夠），或把一部分賣掉、送朋友。'), button('去加一缸', () => sheet.open('我的水缸', () => tanksPanel(ctx))))
        : h(
            'div.row.wrap',
            {},
            ...others.map(({ t, i }) =>
              button(`${tankLabel(game.tanks, i)}（擁擠度 ${Math.round(crowdingRatio(t) * 100)}%）`, () => {
                const n = game.actAll((tanks) => splitTank(tanks[game.active], tanks[i], plan));
                if (!n) return;
                toasts.show(`分缸完成：${n} 條撈到${tankLabel(game.tanks, i)}`);
                sheet.close();
              }),
            ),
          ),
      h('p.hint', {}, '換缸前兩缸的水溫、pH 差越多，魚越緊迫。'),
    );
  };
  render();
  return body;
}

export function plantPanel({ game, sheet, toasts, sound }: PanelContext, plantId: number): Node {
  const plant = game.state.plants.find((p) => p.id === plantId);
  if (!plant) return h('p', {}, '這株水草已經不在了。');
  const sp = PLANT_SPECIES[plant.species];
  const status =
    plant.growthRate < -0.0002 ? '正在溶葉（光、CO₂ 或養分不夠）' : plant.growthRate > 0.0005 ? '長得很好' : '生長緩慢';
  const fullness = Math.min(100, Math.round((plant.biomassG / sp.maxBiomassG) * 100));
  const canTrim = plant.biomassG - sp.maxBiomassG * 0.5 >= sp.cuttingMassG;
  return h(
    'div.stack',
    {},
    h('p', {}, `狀態：${status}`),
    plant.leafAlgae > 0.15 ? h('p.warn-text', {}, '葉面長了藻，光照可能太強。') : null,
    h('div.meter', {}, h('div.meter-fill', { style: { width: `${fullness}%` } })),
    h('p.hint', {}, `茂密度 ${fullness}%。超過一半後可以修剪，剪下的插枝能種回缸裡。`),
    button(canTrim ? '修剪' : '還太小，不能修剪', () => {
      if (!canTrim) return;
      const cuttings = game.act((st) => {
        const n = trimPlant(st, plantId);
        addCuttings(st, plant.species, n);
        return n;
      });
      sound?.('trim');
      sheet.open(`剪下 ${cuttings} 份插枝`, () =>
        h(
          'div.stack',
          {},
          h('p.hint', {}, `可以種回缸裡，也可以賣給水族店（每株 ${plantBuybackPrice(plant.species)} 元）。先留著的話，之後在商店的「水草」「賣給店家」都找得到。`),
          h(
            'div.row.wrap',
            {},
            button(`全部種回去（${cuttings} 株）`, () => {
              game.act((st) => {
                for (let i = 0; i < cuttings; i++) if (takeCutting(st, plant.species)) addPlant(st, plant.species, sp.cuttingMassG);
              });
              toasts.show(`種了 ${cuttings} 株${sp.name}`);
              sheet.close();
            }, 'primary'),
            button('賣給水族店', () => {
              const got = game.act((st) => sellCuttings(st, plant.species));
              toasts.show(got > 0 ? `賣掉插枝，拿到 ${got} 元` : '今天店家不收了，先留著', got > 0 ? 'info' : 'warn');
              sheet.close();
            }),
            button('先留著', () => sheet.close()),
          ),
        ),
      );
    }, canTrim ? 'primary' : ''),
  );
}

export type ShopTab = 'fish' | 'snails' | 'plants' | 'gear' | 'sell';

/** 付錢做一件事；錢不夠就提示、不做。回傳有沒有買成。 */
function purchase(ctx: PanelContext, cost: number, run: (st: TankState) => void, done: string, tone: 'info' | 'warn' = 'info', undo = false): boolean {
  const { game, toasts } = ctx;
  const coins = economy(game.state).coins;
  if (coins < cost) {
    toasts.show(`錢不夠：要 ${cost} 元，現在有 ${coins} 元`, 'warn');
    return false;
  }
  const act = () =>
    game.act((st) => {
      spend(st, cost);
      run(st);
    });
  const text = cost > 0 ? `${done}（${cost} 元）` : done;
  if (undo) doUndoable(ctx, act, text, tone);
  else {
    act();
    toasts.show(text, tone);
  }
  ctx.sound?.('buy');
  return true;
}

const yuan = (n: number) => `${n.toLocaleString('zh-TW')} 元`;

export function shopPanel(ctx: PanelContext, tab: ShopTab = 'fish'): Node {
  const { game, sheet, toasts } = ctx;
  // 還沒開缸：設備在開缸時一次挑好，先在商店買會跟開缸重複扣錢（#154 審查）
  if (needsSetup(game.state)) return h('div.stack', {}, h('p.hint', {}, '缸還沒開好。先挑好魚缸和設備，開完缸再來逛商店。'), ctx.openSetup ? button('去開缸', ctx.openSetup, 'primary') : '');
  const coins = economy(game.state).coins;
  const tabs = iconTabs<ShopTab>(
    [
      { id: 'fish', label: '魚', art: 'fish/guppy-male-bluegrass.webp' },
      { id: 'snails', label: '螺', art: 'snail/snail-apple-gold.webp' },
      { id: 'plants', label: '水草', art: 'scape/plant-anubias.webp' },
      { id: 'gear', label: '設備', icon: 'gear' },
      { id: 'sell', label: '賣給店家', icon: 'market' },
    ],
    tab,
    (t) => sheet.open('商店', () => shopPanel(ctx, t)),
  );
  const wallet = h('div.wallet-bar', {}, h('span', {}, '錢包'), priceTag(coins));

  // 新缸一次放太多魚：老闆提醒一次（每次開遊戲最多一次），玩家還是可以照買
  const overloadOk = async (count: number): Promise<boolean> => {
    const warning = overloadWarned ? null : overloadWarning(game.state, count);
    if (!warning) return true;
    overloadWarned = true;
    return ownerAsk({ text: warning, yes: '照買', no: '先不要' });
  };
  /**
   * 放魚（F5）：滴水對水、又是自己玩（第一次一定要玩）就先開對水小遊戲，放魚時才付錢；
   * 檢疫盒、直接倒、一鍵慢慢過水都直接買。add 拿到 drip（true／false 或小遊戲結果），回傳放進去的魚。
   */
  const releaseFish = async (species: FishSpeciesId, count: number, art: string, name: string, cost: number, add: (st: TankState, drip: boolean | DripOutcome) => Fish[], done: string, tone: 'info' | 'warn' = 'info') => {
    const play = !game.state.quarantine && shopDrip && (shopPlay || dripTutorialLeft(game.state) > 0);
    if (!play) {
      purchase(ctx, cost, (st) => void add(st, shopDrip), done, tone);
      return;
    }
    if (economy(game.state).coins < cost) {
      toasts.show(`錢不夠：要 ${cost} 元，現在有 ${economy(game.state).coins} 元`, 'warn');
      return;
    }
    sheet.close();
    const outcome = await openDripGame({ state: game.state, from: farmHabit(species), art, count, name, sound: ctx.sound });
    if (!outcome) {
      sheet.open('商店', () => shopPanel(ctx, 'fish'));
      return;
    }
    let ids: number[] = [];
    const grade = dripGrade(outcome);
    purchase(
      ctx,
      cost,
      (st) => {
        ids = add(st, outcome).map((f) => f.id);
        recordDrip(st);
      },
      `${done.replace(/，慢慢滴水對水後放進缸裡$/, '')}，${grade === 'perfect' ? '對水對得剛好，牠一進缸就展開尾巴' : grade === 'good' ? '對好水放進缸裡' : '對水有點趕，牠嚇到了'}`,
      grade === 'rushed' ? 'warn' : 'info',
    );
    ctx.welcome?.(ids, grade === 'perfect');
  };
  // sexes 有給就照順序決定每隻的公母（孔雀魚品系：公、母、一公兩母），沒給就隨機
  const buyFish = (species: FishSpeciesId, count: number, strain?: number, finStrain?: (typeof GUPPY_FIN_STRAINS)[number], sexes?: ('male' | 'female')[]) => async () => {
    if (!(await overloadOk(count))) return;
    const quarantined = !!game.state.quarantine;
    const name = finStrain ? `${finStrain.name}孔雀魚` : strain !== undefined ? `${GUPPY_STRAINS[strain]}孔雀魚` : FISH_SPECIES[species].name;
    const each = finStrain ? finStrain.price : strain !== undefined ? GUPPY_STRAIN_PRICES[strain] : FISH_PRICES[species];
    const males = sexes?.filter((x) => x === 'male').length ?? 0;
    const sexNote = !sexes ? '' : males === count ? '（公）' : males === 0 ? '（母）' : `（${males} 公 ${count - males} 母）`;
    const options = finStrain ? { strain: finStrain.strain, fin: finStrain.fin } : { strain };
    const art = finStrain ? guppyArt(finStrain.strain, finStrain.fin) : strain !== undefined ? guppyArt(strain) : speciesArt(species);
    await releaseFish(
      species,
      count,
      art,
      name,
      each * count,
      (st, drip) => Array.from({ length: count }, (_, i) => (quarantined ? addFishToQuarantine : addFish)(st, species, { ...options, drip, sex: sexes?.[i] })),
      quarantined
        ? `買了 ${count} 隻${name}${sexNote}，先放進檢疫盒觀察 ${QUARANTINE_DAYS} 天`
        : shopDrip
          ? `買了 ${count} 隻${name}${sexNote}，慢慢滴水對水後放進缸裡`
          : `買了 ${count} 隻${name}${sexNote}，直接倒進缸裡${Math.abs(farmHabit(species).ph - game.state.water.ph) > 0.6 ? '，水質差很多，魚受到驚嚇，接下來幾天容易生病' : ''}`,
      !shopDrip && Math.abs(farmHabit(species).ph - game.state.water.ph) > 0.6 ? 'warn' : 'info',
    );
  };
  // 鬥魚公母分開賣：公魚是長鰭的漂亮魚，母魚短鰭便宜很多
  const buyOne = (species: FishSpeciesId, sex: 'male' | 'female', price: number) => async () => {
    const quarantined = !!game.state.quarantine;
    const name = `${FISH_SPECIES[species].name}${sex === 'male' ? '公魚' : '母魚'}`;
    const males = game.state.fish.filter((f) => f.alive && f.species === species && f.sex === 'male' && !isJuvenile(f)).length;
    if (!(await overloadOk(1))) return;
    if (species === 'betta' && sex === 'male' && males > 0 && !quarantined) {
      const ok = await ownerAsk({ text: '缸裡已經有公鬥魚了。兩尾公鬥魚放一起，會打到一尾死掉。', yes: '照買', no: '先不要' });
      if (!ok) return;
    }
    await releaseFish(species, 1, speciesArt(species, sex), name, price, (st, drip) => [(quarantined ? addFishToQuarantine : addFish)(st, species, { sex, drip })], `買了一隻${name}${quarantined ? `，先放進檢疫盒觀察 ${QUARANTINE_DAYS} 天` : ''}`);
  };
  // 水草可能夾帶害蟲小螺的卵（看不到）；有檢疫盒的人會先泡過，機率低很多（design/snails.md §2）
  const buyPair = (species: FishSpeciesId) => async () => {
    if (!(await overloadOk(2))) return;
    const quarantined = !!game.state.quarantine;
    await releaseFish(
      species,
      2,
      speciesArt(species),
      FISH_SPECIES[species].name,
      FISH_PRICES[species] * 2,
      (st, drip) => (['male', 'female'] as const).map((sex) => (quarantined ? addFishToQuarantine : addFish)(st, species, { sex, drip })),
      `買了一對${FISH_SPECIES[species].name}（一公一母）${quarantined ? `，先放進檢疫盒觀察 ${QUARANTINE_DAYS} 天` : ''}`,
    );
  };
  // 買了不是馬上種好（P4）：拿在手上，拖到缸裡想種的位置
  const buyPlant = (species: PlantSpeciesId) => () => {
    let id = -1;
    const ok = purchase(
      ctx,
      PLANT_PRICES[species],
      (st) => {
        id = plantFromShop(st, species).id;
      },
      `買了一株${PLANT_SPECIES[species].name}`,
    );
    if (ok && id >= 0) ctx.placeNew?.({ kind: 'plant', id });
  };
  const buySnail = (kind: SnailKind, color?: AppleColor) => () =>
    purchase(ctx, SNAILS[kind].price, (st) => addSnail(st, kind, color), `放了一隻${color ? APPLE_COLOR_LABELS[color] : ''}${SNAILS[kind].name}`);

  let content: Node;
  if (tab === 'fish') {
    const farm = farmHabit('guppy');
    // 放魚方式：滴水對水或直接倒（魚怕的是水質突然改變，不是 pH 數字本身）
    const phGap = Math.abs(farm.ph - game.state.water.ph);
    const tutorialLeft = game.state.quarantine ? 0 : dripTutorialLeft(game.state);
    const dripRow = h(
      'div.drip-row',
      {},
      h('div.drip-water', {}, h('span', {}, `對水 pH ${farm.ph}`), h('i.arrow', {}, '→'), h(`span${phGap > 0.6 ? '.warn' : ''}`, {}, `${game.state.water.ph.toFixed(1)}`)),
      // 對水方式（F5）：前幾次一定自己滴（對水小遊戲），之後可以選一鍵「慢慢過水」
      h(
        'div.seg.compact',
        {},
        h(`button.seg-opt${shopDrip && (shopPlay || tutorialLeft > 0) ? '.active' : ''}`, { title: '按住滴管，自己慢慢對水', onclick: () => ((shopDrip = true), (shopPlay = true), sheet.refresh?.()) }, h('b', {}, '自己滴', tutorialLeft > 0 ? h('span.seg-badge', { title: `新手還要自己滴 ${tutorialLeft} 次` }, `新手 ${tutorialLeft}`) : null)),
        tutorialLeft > 0 ? null : h(`button.seg-opt${shopDrip && !shopPlay ? '.active' : ''}`, { title: `一鍵慢慢過水，約 ${dripMinutes(game.state, farm)} 分鐘`, onclick: () => ((shopDrip = true), (shopPlay = false), sheet.refresh?.()) }, h('b', {}, '慢慢過水')),
        h(`button.seg-opt${shopDrip ? '' : '.active'}`, { title: phGap > 0.6 ? '水質差很多：魚會受驚，容易生病' : '水質差不多', onclick: () => ((shopDrip = false), sheet.refresh?.()) }, h('b', {}, '直接倒')),
      ),
    );
    const add = (label: string, run: () => void, kind = '') => button(label, run, kind ? `small.${kind}` : 'small');
    // 孔雀魚公母外觀差很多（公魚才有花色和長尾）：分開賣，也有一公兩母的組合
    const guppyActions = (strain?: number, finStrain?: (typeof GUPPY_FIN_STRAINS)[number]) => [
      add('公', buyFish('guppy', 1, strain, finStrain, ['male'])),
      add('母', buyFish('guppy', 1, strain, finStrain, ['female'])),
      add('一公兩母', buyFish('guppy', 3, strain, finStrain, ['male', 'female', 'female'])),
    ];
    const guppyChips = [`${FISH_SPECIES.guppy.temp.min}–${FISH_SPECIES.guppy.temp.max}°C`, '會繁殖'];
    content = h(
      'div.stack',
      {},
      canClaimStarterPack(game.state, game.others)
        ? h(
            'div.item.gift',
            {},
            h('div', {}, h('b', {}, '老闆送你重新開始'), h('div.hint', {}, '整缸都沒了也別灰心。水族店老闆送你 1 公 2 母的孔雀魚（送的不能賣回店裡，生的小魚可以）。先想想上次出了什麼事。')),
            button('收下', () => {
              game.act((st) => claimStarterPack(st, (s2, sex) => addFish(s2, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false }), game.others));
              ctx.sound?.('quest');
              toasts.show('收下 3 條孔雀魚，這次慢慢來');
              sheet.open('商店', () => shopPanel(ctx, 'fish'));
            }, 'primary'),
          )
        : null,
      dripRow,
      advice([
        game.state.quarantine ? `新買的魚會先放進檢疫盒，觀察 ${QUARANTINE_DAYS} 天沒問題再移到主缸。` : '店裡的魚可能帶著白點蟲或其他病，直接放進主缸可能傳染整缸。商店的「設備」可以買檢疫盒。',
        '新缸還沒養好水就放太多魚，會氨中毒。',
        '孔雀魚和櫻花蝦會自己繁殖，但成魚會吃仔魚和仔蝦，水草種密一點才躲得掉。斑馬魚會輕微咬孔雀魚公魚的長尾巴。',
        '鬥魚會到水面吸空氣，不怕缺氧；但兩尾公鬥魚不能同缸，公鬥魚也會去咬孔雀魚公魚的長尾巴，約三成的鬥魚會獵蝦。水晶蝦很嬌貴：要偏酸的軟水、水溫 24°C 以下，26°C 以上很危險，夏天要開冷氣。',
        FEATURES.apisto ? '鳳尾短鯛會自己帶小孩：要有石頭或沉木當洞穴、水溫 25°C 以上。護幼中的母魚會趕走靠近的魚，缸小的話其他魚會很緊張。' : null,
        `孔雀魚（pH ${FISH_SPECIES.guppy.phSurvive.min}–${FISH_SPECIES.guppy.phSurvive.max} 都能慢慢適應）照品系賣。同品系配對生出來的大多一樣；不同品系混養會生出各種組合，也可能冒出藏在基因裡的白子。`,
        '鰭型品系：燕尾、大耳是隱性，要兩邊都帶才長得出來；緞帶、大C 的公魚交接器太長不能配，要用母魚配一般公魚；劍尾只會傳給兒子。',
      ]),
      // P3：選魚當下就看得到後果，挑一公一母先看會生出什麼
      pairPreviewCard((sex, p) => {
        const fs = p.fin ? GUPPY_FIN_STRAINS.find((f) => f.name === p.name) : undefined;
        void buyFish('guppy', 1, fs ? undefined : p.strain, fs, [sex])();
      }),
      h('h3', {}, '孔雀魚品系'),
      cardGrid(
        ...GUPPY_STRAINS.map((strain, i) =>
          shopCard({ art: guppyArt(i), name: strain, price: GUPPY_STRAIN_PRICES[i], unit: '/隻', chips: guppyChips, actions: guppyActions(i) }),
        ),
        ...GUPPY_FIN_STRAINS.map((fs) =>
          shopCard({ art: guppyArt(fs.strain, fs.fin), name: fs.name, price: fs.price, unit: '/隻', chips: ['鰭型品系'], actions: guppyActions(undefined, fs) }),
        ),
      ),
      h('h3', {}, '其他魚蝦'),
      cardGrid(
        ...(Object.keys(FISH_SPECIES) as FishSpeciesId[]).filter((id) => id !== 'guppy' && (id !== 'apisto' || FEATURES.apisto)).map((id) => {
          const sp = FISH_SPECIES[id];
          const chips = [`${sp.temp.min}–${sp.temp.max}°C`, `pH ${sp.phSurvive.min}–${sp.phSurvive.max}`, sp.minGroup ? `群游 ${sp.minGroup}+` : ''].filter(Boolean);
          // 短鯛成對賣：一公一母才會產卵護幼；鬥魚公母分開賣
          const actions =
            id === 'apisto'
              ? [add('+1', buyFish(id, 1)), add('一對', buyPair(id))]
              : id === 'betta'
                ? [add(`公 ${FISH_PRICES.betta}`, buyOne(id, 'male', FISH_PRICES.betta)), add(`母 ${BETTA_FEMALE_PRICE}`, buyOne(id, 'female', BETTA_FEMALE_PRICE))]
                : [add('+1', buyFish(id, 1)), add('+6', buyFish(id, 6))];
          // 鬥魚、水晶蝦要先完成目標才開賣（goals.ts，M19）
          const lock = LOCKED_SPECIES[id];
          if (lock && !speciesUnlocked(game.tanks, id)) return shopCard({ art: speciesArt(id), name: sp.name, price: null, chips: ['🔒 ' + unlockHint(lock)], actions: [], cls: '.locked' });
          return shopCard({ art: speciesArt(id), name: sp.name, price: FISH_PRICES[id], unit: '/隻', chips, actions });
        }),
      ),
    );
  } else if (tab === 'snails') {
    const card = (kind: SnailKind, name: string, chips: string[], color?: AppleColor) =>
      shopCard({ art: snailArt(kind, color), name, price: SNAILS[kind].price, unit: '/隻', chips, actions: [button('+1', buySnail(kind, color), 'small')] });
    content = h(
      'div.stack',
      {},
      advice([
        '螺是清潔隊也是麻煩：吃殘餌、刮藻，但餵太多就會爆量。小螺多寡直接反映你有沒有餵太多。',
        '蘋果螺公母都有，會在水面上方產粉紅卵塊；餓了會啃水草，死了沒撈很髒。',
        '斑馬螺除藻最強，不會爆量；但會在造景上產白色卵點，刮不乾淨。',
        '刺客螺專吃其他小螺，用來長期控制爆螺；螺吃光了自己會餓，也會吃小蘋果螺。',
      ]),
      cardGrid(
        ...(['gold', 'blue'] as AppleColor[]).map((c) => card('apple', `蘋果螺・${APPLE_COLOR_LABELS[c]}`, ['吃殘餌', '會產卵'], c)),
        card('nerite', SNAILS.nerite.name, ['除藻最強', '不爆量']),
        card('assassin', SNAILS.assassin.name, ['吃小螺', '控螺']),
      ),
    );
  } else if (tab === 'plants') {
    const cuttings = economy(game.state).cuttings;
    content = h(
      'div.stack',
      {},
      advice([
        '陰性草弱光就能長；陽性草需要強光加 CO₂。',
        game.state.quarantine ? '新水草會先在檢疫盒泡過，比較不會夾帶小螺的卵。' : '店裡的水草常夾帶看不到的扁卷螺卵（第一株幾乎一定有），過一陣子才發現缸裡多了螺。有檢疫盒的話會先泡過。',
      ]),
      cardGrid(
        ...(Object.keys(PLANT_SPECIES) as PlantSpeciesId[]).map((id) =>
          shopCard({ art: plantArt(id), name: PLANT_SPECIES[id].name, price: PLANT_PRICES[id], unit: '/盆', chips: [PLANT_SPECIES[id].lightType === 'high' ? '陽性・要強光' : '陰性・弱光可'], actions: [button('種一株', buyPlant(id), 'small')] }),
        ),
        ...(Object.keys(cuttings) as PlantSpeciesId[])
          .filter((id) => (cuttings[id] ?? 0) > 0)
          .map((id) =>
            shopCard({
              art: plantArt(id),
              name: `${PLANT_SPECIES[id].name}插枝`,
              price: null,
              badge: `手上 ${cuttings[id]}`,
              chips: ['免費種回去'],
              actions: [
                button('種一株', () => {
                  game.act((st) => {
                    if (takeCutting(st, id)) addPlant(st, id, PLANT_SPECIES[id].cuttingMassG);
                  });
                  toasts.show(`種了一株${PLANT_SPECIES[id].name}插枝`);
                }, 'small'),
              ],
            }),
          ),
      ),
    );
  } else if (tab === 'gear') {
    const eq = game.state.equipment;
    // 設備商品圖（art/gear/）；沒有圖的（控溫器）用設備圖示
    const item = (label: string, key: string, owned: boolean, buy: () => void, note = '', art?: string) =>
      shopCard({ art, icon: art ? undefined : 'gear', name: label, price: price(key), badge: owned ? '使用中' : undefined, note, actions: owned ? [] : [button('買', buy, 'small')], cls: owned ? '.owned' : '' });
    const bottles = economy(game.state).bacteriaBottles ?? 0;
    const bag = economy(game.state).hardscapeBag ?? [];
    const HARDSCAPE_ART: Record<string, string> = { seiryu: 'scape/rock-seiryu-1.webp', lava: 'gear/rock-lava.webp', slate: 'gear/rock-slate.webp', driftwood: 'scape/wood-spider-1.webp' };
    content = h(
      'div.stack',
      {},
      advice([
        '換過濾器會失去舊濾材上的硝化菌！',
        '換底材要拆缸重鋪：底砂裡的細菌和髒污會翻出來，魚也會很緊迫。',
        '有些石頭會慢慢讓水變硬、pH 變高。不確定的話先滴白醋：冒泡就是含碳酸鈣。拿出來的石頭會放回倉庫，不退錢。',
      ]),
      // 硝化菌液排第一張（養水任務帶到這頁），跟設備放同一排，不會一張卡佔一整列（畫面評測 V20）
      h('h3', {}, '養水與設備'),
      cardGrid(
        shopCard({
          // 無框的物件圖，跟旁邊的設備同一種畫法（畫面評測 V26）
          art: 'gear/bottle-bacteria.webp',
          name: '硝化菌液',
          price: bottles > 0 ? null : price('care:bacteria'),
          unit: '/瓶',
          chips: ['養水 1～3 天'],
          note: bottles > 0 ? `手上有 ${bottles} 瓶寶箱開到的` : '幫新缸加一小批硝化菌，要有魚或氨才長得起來',
          actions: [
            button('倒一瓶', () => {
              // 先倒寶箱開到的（不用錢）；按下去當下才讀手上的瓶數，面板開著時數字變了也不會算錯
              const free = game.act((st) => {
                const e = economy(st);
                if ((e.bacteriaBottles ?? 0) <= 0) return false;
                e.bacteriaBottles = e.bacteriaBottles! - 1;
                addBottledBacteria(st);
                return true;
              });
              if (free) {
                toasts.show('倒了一瓶硝化菌液，過一兩天測測看');
                sheet.refresh();
              } else purchase(ctx, price('care:bacteria'), (st) => void addBottledBacteria(st), '倒了一瓶硝化菌液，過一兩天測測看');
            }, 'small'),
          ],
        }),
        ...Object.values(FILTERS).map((f) =>
          item(f.name, `filter:${f.id}`, eq.filter?.spec.id === f.id, () => {
            purchase(ctx, price(`filter:${f.id}`), (st) => replaceFilter(st, f), `換上${f.name}，濾材要重新養菌`, 'warn', true);
          }, `濾材容量 ${f.bacteriaCapacityMgPerHour}`, `gear/${f.id.toLowerCase()}-filter.webp`),
        ),
        ...Object.values(HEATERS).map((x) =>
          item(x.name, `heater:${x.id}`, eq.heater?.spec.id === x.id && !eq.heater.broken, () => {
            purchase(ctx, price(`heater:${x.id}`), (st) => {
              st.equipment.heater = { spec: x, targetC: st.equipment.heater?.targetC ?? 25, broken: false, heating: false };
            }, `換上${x.name}`);
          }, eq.heater?.spec.id === x.id && eq.heater.broken ? '目前這支壞了' : '', 'gear/heater.webp'),
        ),
        ...Object.values(LIGHTS).map((l) =>
          item(l.name, `light:${l.id}`, eq.light?.spec.id === l.id, () => {
            purchase(ctx, price(`light:${l.id}`), (st) => {
              st.equipment.light = { spec: l, startHour: st.equipment.light?.startHour ?? 10, photoperiodHours: st.equipment.light?.photoperiodHours ?? 8 };
            }, `換上${l.name}`);
          }, `光照 ${l.par} PAR`, `gear/led-${l.id}.webp`),
        ),
        item(AIR_PUMPS.small.name, 'air:small', !!eq.airPump, () => purchase(ctx, price('air:small'), (st) => (st.equipment.airPump = { spec: AIR_PUMPS.small, on: true }), `裝上${AIR_PUMPS.small.name}`), '', 'gear/air-pump.webp'),
        item(CO2_KITS.diy.name, 'co2:diy', !!eq.co2, () => purchase(ctx, price('co2:diy'), (st) => (st.equipment.co2 = { spec: CO2_KITS.diy, on: true }), `裝上${CO2_KITS.diy.name}`), '', 'gear/co2-set.webp'),
        item('育幼盒', 'nursery:box', !!game.state.nurseryBox, () => purchase(ctx, price('nursery:box'), buyNurseryBox, '買了育幼盒，掛在缸邊'), '快生的母魚、小魚放進去，大魚吃不到', 'gear/nursery-box.webp'),
        item('檢疫盒', 'quarantine:box', !!game.state.quarantine, () => purchase(ctx, price('quarantine:box'), buyQuarantine, '買了檢疫盒'), '新魚先隔離觀察', 'gear/quarantine-box.webp'),
      ),
      h('h3', {}, '底材'),
      cardGrid(
        ...Object.values(SUBSTRATES).map((sub) =>
          item(sub.name, `substrate:${sub.id}`, tankSubstrateLook(eq.substrate) === sub.id, () => {
            purchase(ctx, price(`substrate:${sub.id}`), (st) => replaceSubstrate(st, sub), `重新鋪了${sub.name}`, 'warn', true);
          }, SUBSTRATE_NOTES[sub.id], `gear/bag-${sub.id}.webp`),
        ),
      ),
      h('h3', {}, '造景石與沉木'),
      ctx.openScape && ((eq.hardscape ?? []).length > 0 || game.state.plants.length > 0) ? button('進入造景模式：拖曳擺放', () => ctx.openScape!(), 'primary') : null,
      cardGrid(
        ...Object.values(HARDSCAPE).map((x) => {
          const count = (eq.hardscape ?? []).filter((y) => y.id === x.id).length;
          const inHand = bag.filter((id) => id === x.id).length;
          const key = `hardscape:${x.id}`;
          return shopCard({
            art: HARDSCAPE_ART[x.id],
            name: x.name,
            price: price(key),
            unit: '/組',
            badge: count > 0 ? `缸裡 ${count} 組` : inHand > 0 ? `手上 ${inHand}` : undefined,
            note: inHand > 0 ? `手上有 ${inHand} 組寶箱開到的，免費放進缸` : HARDSCAPE_NOTES[x.id],
            actions: [
              x.kind === 'rock' ? button('白醋', () => toasts.show(x.fizzes ? `${x.name}冒出小氣泡：含碳酸鈣，會讓水變硬` : `${x.name}沒有反應：不會影響水質`, x.fizzes ? 'warn' : 'info'), 'small') : null,
              count > 0 ? button('拿出', () => game.act((st) => removeHardscape(st, x.id)), 'small') : null,
              inHand > 0
                ? button('放手上的', () => {
                    if (game.act((st) => placeFromBag(st, x.id))) ctx.placeNew?.({ kind: 'hardscape', index: (game.state.equipment.hardscape ?? []).length - 1 });
                    toasts.show(`放了一組${x.name}（寶箱開到的）`);
                    sheet.refresh();
                  }, 'small.primary')
                : null,
              button('買一組', () => {
                if (purchase(ctx, price(key), (st) => addHardscape(st, x), `買了一組${x.name}`)) ctx.placeNew?.({ kind: 'hardscape', index: (game.state.equipment.hardscape ?? []).length - 1 });
              }, 'small'),
            ].filter((b): b is HTMLButtonElement => !!b),
          });
        }),
      ),
      h('h3', {}, '控溫'),
      cardGrid(
        item(FANS.clip.name, 'fan:clip', !!eq.fan, () => purchase(ctx, price('fan:clip'), (st) => (st.equipment.fan = { spec: FANS.clip, on: true }), `裝上${FANS.clip.name}`), `降溫約 ${FANS.clip.coolingC}°C，水蒸發快`, 'gear/fan.webp'),
        item(CHILLERS.small.name, 'chiller:small', !!eq.chiller, () => purchase(ctx, price('chiller:small'), (st) => (st.equipment.chiller = { spec: CHILLERS.small, targetC: 26, on: true, cooling: false }), `裝上${CHILLERS.small.name}`), '水溫壓在設定值，很耗電', 'gear/chiller.webp'),
        item('控溫器', 'controller:basic', !!eq.controller, () => purchase(ctx, price('controller:basic'), (st) => (st.equipment.controller = { maxC: 30, tripped: false }), '裝上控溫器'), '超溫就切斷加熱棒'),
      ),
      // 出遠門用品（mvp.md §4.7）：關掉遊戲時間照常走，沒人餵魚會餓
      h('h3', {}, '出遠門'),
      cardGrid(
        shopCard({
          art: 'gear/vacation-tablets.webp',
          name: '假期飼料錠',
          price: (economy(game.state).holidayTablets ?? 0) > 0 ? null : price('care:holiday'),
          unit: '/顆',
          chips: [`撐約 ${HOLIDAY_TABLET_DAYS} 天`, '有一點髒水'],
          note: (economy(game.state).holidayTablets ?? 0) > 0 ? `手上有 ${economy(game.state).holidayTablets} 顆送的` : '沉在缸底慢慢溶解，出門前放一顆',
          actions: [
            button('放一顆', () => {
              const e = economy(game.state);
              if ((e.holidayTablets ?? 0) > 0) {
                game.act((st) => {
                  economy(st).holidayTablets = (economy(st).holidayTablets ?? 1) - 1;
                  addHolidayTablet(st);
                });
                toasts.show(`放了一顆假期飼料錠，約 ${HOLIDAY_TABLET_DAYS} 天慢慢溶完`);
                sheet.refresh();
              } else purchase(ctx, price('care:holiday'), (st) => addHolidayTablet(st), `放了一顆假期飼料錠，約 ${HOLIDAY_TABLET_DAYS} 天慢慢溶完`);
            }, 'small'),
          ],
        }),
        item('自動餵食器', 'feeder:auto', !!eq.feeder, () => purchase(ctx, price('feeder:auto'), (st) => installFeeder(st, 1), '裝上自動餵食器，每天早上 9 點投一小撮'), '每天定時投一小撮，吃電池', 'gear/auto-feeder.webp'),
      ),
    );
  } else {
    content = sellContent(ctx);
  }
  const banner = h('div.shop-banner', {}, h('b', {}, '阿德水族館'), wallet);
  return h('div.stack.shop-stack', {}, banner, tabs, content);
}

/** 賣給水族店：只收健康的成魚和插枝，價錢是店價的三成，每天有次數上限。 */
function sellContent(ctx: PanelContext): Node {
  const { game, sheet, toasts } = ctx;
  const s = game.state;
  const left = sellsLeftToday(s);
  const refresh = () => sheet.open('商店', () => shopPanel(ctx, 'sell'));
  const groups = (Object.keys(FISH_SPECIES) as FishSpeciesId[])
    .map((id) => ({ id, fish: s.fish.filter((f) => f.species === id && !buybackRefusal(f)) }))
    .filter((g) => g.fish.length > 0);
  // 寶箱來的插枝不收（polish-to-9.md §4），只列賣得掉的
  const cuttingIds = (Object.keys(economy(s).cuttings) as PlantSpeciesId[]).filter((id) => sellableCuttings(s, id) > 0);
  const priceRange = (fish: Fish[]) => {
    const p = fish.map(fishBuybackPrice);
    const lo = Math.min(...p);
    const hi = Math.max(...p);
    return lo === hi ? `每隻 ${lo} 元` : `每隻 ${lo}～${hi} 元`;
  };
  const sellOne = (id: FishSpeciesId) => () => {
    // 先賣公的，母的留著繁殖；訂單要的魚最後才賣（一般玩家一直按也不會把湊單的魚賣掉）
    const held = new Set(orderBoard(s).orders.flatMap((o) => (o.kind === 'fish' || o.kind === 'fry' ? matchingFish(s, o).slice(0, o.count).map((f) => f.id) : [])));
    const rank = (f: Fish) => (held.has(f.id) ? 2 : 0) + (f.sex === 'male' ? 0 : 1);
    const pick = [...s.fish.filter((f) => f.species === id && !buybackRefusal(f))].sort((a, b) => rank(a) - rank(b))[0];
    if (!pick) return;
    const got = game.act((st) => sellFish(st, pick.id));
    if (got > 0) {
      ctx.sound?.('buy');
      ctx.reward?.(null, got);
      const celebrated = ctx.moment?.('first_sale', {
        art: speciesArt(pick.species, pick.sex),
        title: `第一筆收入 ${got} 元！`,
        sub: `${fishName(pick)} 賣給水族店了`,
        owner: '好魚賣得到好價錢。挑尾巴大、顏色亮的留著配對，選育出來的魚能賣好幾倍。',
      });
      if (!celebrated) toasts.show(`把 ${fishName(pick)} 賣給水族店，拿到 ${got} 元`);
    } else toasts.show('今天店家不收了，明天再來', 'warn');
    refresh();
  };
  // 訂單板（#143）有自己的入口和面板；這裡留一個連過去的按鈕
  const board = orderBoard(s);
  const readyCount = board.orders.filter((o) => orderSupply(game.tanks, o) >= o.count).length;
  return h(
    'div.stack',
    {},
    h(
      'button.btn.order-link',
      { onclick: () => sheet.open('客人的訂單', () => ordersPanel(ctx)) },
      h('img', { src: ORDER_ICON, alt: '' }),
      h('span', {}, `客人的訂單 ${board.orders.length} 張${readyCount > 0 ? `，${readyCount} 張可以交貨` : ''}`),
      '›',
    ),
    h('h3', {}, '賣給店家'),
    h('p.hint', {}, `水族店收健康的魚和插枝：成魚約店價五成，稀有品系、好鰭型賣得更貴；還沒長大的中魚只收三成，太小、生病的不收。今天還能賣 ${left} 次。`),
    groups.length === 0 && cuttingIds.length === 0 ? h('p', {}, '目前沒有店家會收的魚或插枝。把仔魚養大、修剪水草就有東西可以賣。') : null,
    ...groups.map((g) =>
      h(
        'div.item',
        {},
        h('div', {}, h('b', {}, FISH_SPECIES[g.id].name), h('div.hint', {}, `可以賣 ${g.fish.length} 隻 · ${priceRange(g.fish)}`)),
        button('賣一隻', sellOne(g.id), left > 0 ? '' : ''),
      ),
    ),
    ...cuttingIds.map((id) =>
      h(
        'div.item',
        {},
        h('div', {}, h('b', {}, `${PLANT_SPECIES[id].name}插枝`), h('div.hint', {}, `${sellableCuttings(s, id)} 株 · 每株 ${plantBuybackPrice(id)} 元${chestCuttingsOf(s, id) > 0 ? `（寶箱送的 ${chestCuttingsOf(s, id)} 株不收）` : ''}`)),
        button('全部賣掉', () => {
          const got = game.act((st) => sellCuttings(st, id));
          if (got > 0) {
            ctx.sound?.('buy');
            toasts.show(`賣掉${PLANT_SPECIES[id].name}插枝，拿到 ${got} 元`);
          } else toasts.show('今天店家不收了，明天再來', 'warn');
          refresh();
        }),
      ),
    ),
  );
}

function summarizeHardscape(list: { id: string; name: string }[]): string {
  const counts = new Map<string, { name: string; n: number }>();
  for (const x of list) counts.set(x.id, { name: x.name, n: (counts.get(x.id)?.n ?? 0) + 1 });
  return [...counts.values()].map((c) => `${c.name} ${c.n} 組`).join('、');
}

const SUBSTRATE_NOTES: Record<string, string> = {
  sand: '不影響水質，也沒有養分',
  soil: '把 KH 吸低、pH 壓到弱酸，水草長得好；新土前兩週會漏氨，緩衝力約半年到一年用完',
  coral: '讓水變硬、pH 拉到 8 左右；不適合草缸和水晶蝦',
};

const HARDSCAPE_NOTES: Record<string, string> = {
  seiryu: '造景很漂亮，但含碳酸鈣，會慢慢提高 KH 和 pH',
  lava: '不影響水質；孔隙多，硝化菌住得多',
  slate: '不影響水質，可以當產卵平台',
  driftwood: '釋出單寧酸，水變淡茶色、pH 稍微降低',
};

/** 檢疫盒裡看得到的症狀（盒子的水質不追蹤，只看病）。 */
/** 把最快生的母魚放進育幼盒（待辦、早上報告、老闆引導共用）。回傳有沒有放進去。 */
export function putDueInNursery(ctx: PanelContext): boolean {
  const mom = ctx.game.act((st) => moveDueToNursery(st));
  if (!mom) {
    ctx.toasts.show('育幼盒現在放不進去，打開育幼盒看看', 'warn');
    return false;
  }
  ctx.sound?.('net');
  ctx.toasts.show(`把 ${fishName(mom)} 放進育幼盒待產，生完會自己回主缸`);
  return true;
}

/** 待辦「去買育幼盒」：買了直接把快生的母魚放進去。 */
export function buyNurseryForDue(ctx: PanelContext): void {
  if (purchase(ctx, price('nursery:box'), buyNurseryBox, '買了育幼盒，掛在缸邊')) putDueInNursery(ctx);
}

/**
 * 育幼盒（mvp.md §4.4.2，#187）：掛在主缸裡的小網盒。看盒裡有誰、把快生的母魚或會被吃的小魚放進去。
 * 母魚生完、小魚長到 1.6 cm 都會自己回主缸，玩家不用記。
 */
export function nurseryPanel(ctx: PanelContext): Node {
  const { game, sheet, toasts } = ctx;
  const s = game.state;
  if (!s.nurseryBox)
    return h(
      'div.stack',
      {},
      h('p', {}, '育幼盒掛在主缸邊，用的是同一缸的水，不佔缸位。快生的母魚放進去，生下的小魚掉進隔間，大魚吃不到。'),
      button(`買一個（${price('nursery:box')} 元）`, () => purchase(ctx, price('nursery:box'), buyNurseryBox, '買了育幼盒，掛在缸邊') && sheet.refresh(), 'primary'),
    );
  const inside = nurseryFish(s);
  const mom = inside.find((f) => !isJuvenile(f));
  const kids = inside.filter((f) => isJuvenile(f));
  const biggest = Math.max(0, ...kids.map((f) => f.lengthCm));
  const due = dueMothers(s);
  const prey = splitGroup(s, 'by_size').filter((f) => isJuvenile(f) && splitAdvice(s).some((a) => a.reason === 'fry_with_adults'));
  return h(
    'div.stack',
    {},
    h('h3', {}, '盒裡'),
    inside.length === 0 ? h('p.hint', {}, '空的。母魚肚子很鼓、下面出現黑點，就是快生了。') : null,
    mom ? h('div.item', {}, h('div', {}, h('b', {}, fishName(mom)), h('div.hint', {}, mom.pregnancy > 0 ? '待產中，生完會自己回主缸' : '沒懷孕'))) : null,
    kids.length > 0 ? h('div.item', {}, h('div', {}, h('b', {}, `${kids.length} 尾小魚`), h('div.hint', {}, `最大的 ${biggest.toFixed(1)} cm，長到 ${NURSERY_RELEASE_CM} cm 會自己回主缸`))) : null,
    ...due.map((f) => {
      const no = nurseryRefusal(s, f);
      return h(
        'div.item',
        {},
        h('div', {}, h('b', {}, fishName(f)), h('div.hint', {}, no ?? '快生了')),
        no
          ? null
          : button('放進去', () => {
              game.act((st) => moveToNursery(st, f.id));
              ctx.sound?.('net');
              toasts.show(`把 ${fishName(f)} 放進育幼盒待產`);
              sheet.refresh();
            }, 'primary'),
      );
    }),
    prey.length > 0
      ? h(
          'div.item',
          {},
          h('div', {}, h('b', {}, `主缸還有 ${prey.length} 尾小魚`), h('div.hint', {}, nurseryRefusal(s, prey[0]) ?? '會被大魚吃掉')),
          nurseryRefusal(s, prey[0])
            ? null
            : button('撈進盒子', () => {
                const moved = game.act((st) => rescueFryToNursery(st, splitGroup(st, 'by_size').filter((f) => isJuvenile(f))));
                ctx.sound?.('net');
                toasts.show(`${moved} 條小魚撈進育幼盒了`);
                sheet.refresh();
              }, 'primary'),
        )
      : null,
    inside.length > 0
      ? button('全部放回主缸', () => {
          game.act((st) => releaseNursery(st));
          toasts.show('盒裡的魚都放回主缸了');
          sheet.refresh();
        })
      : null,
  );
}

export function quarantineSymptoms(fish: Fish): Symptom[] {
  const out: Symptom[] = [];
  if (fish.ich.stage === 'visible') out.push('white_spots');
  if (hasVisible(fish, 'columnaris')) out.push('white_patches');
  if (hasVisible(fish, 'flukes')) out.push('gill_flare');
  if (fish.health < 0.5) out.push('lethargic');
  return out;
}

export function quarantinePanel(ctx: PanelContext): Node {
  const { game, toasts, sheet } = ctx;
  const q = game.state.quarantine;
  if (!q) return h('p', {}, '還沒有檢疫盒，可以到商店的「設備」購買。');
  const living = q.fish.filter((f) => f.alive);
  const dead = q.fish.length - living.length;
  const release = (ids?: number[]) => {
    let moved = 0;
    game.act((st) => (moved = releaseQuarantine(st, ids)));
    ctx.sound?.('net');
    toasts.show(moved > 0 ? `把 ${moved} 條移到主缸了` : '撈掉了檢疫盒裡的死魚');
    if (game.state.quarantine!.fish.length === 0) sheet.close();
  };
  const MED_KEY = { antibiotic: 'med:antibiotic', dewormer: 'med:dewormer', ichMedication: 'med:ich' } as const;
  // 檢疫盒水少，一份藥只要主缸的一半
  const bath = (medicine: 'antibiotic' | 'dewormer' | 'ichMedication', label: string) => {
    const cost = Math.round(price(MED_KEY[medicine]) / 2);
    return button(`${label}（${cost} 元）`, () => purchase(ctx, cost, (st) => doseQuarantine(st, medicine), `在檢疫盒下了${label}，不會影響主缸`));
  };
  return h(
    'div.stack',
    {},
    h('p.hint', {}, `新魚可能帶著還沒發作的病。觀察 ${QUARANTINE_DAYS} 天，大部分潛伏的病都會在這裡現形；在這裡下藥不會傷到主缸的硝化菌、水草和蝦。`),
    living.length === 0 && dead === 0 ? h('p', {}, '檢疫盒是空的。在商店買魚會先放進來。') : null,
    ...living.map((f) => {
      const days = quarantineDays(game.state, f);
      const symptoms = quarantineSymptoms(f);
      // 仔魚看大小（#174）：成魚吞得下就先別放回去；店裡買的新魚才看觀察天數
      const small = tooSmallForTank(game.state, f);
      const status = symptoms.length
        ? h('div.warn-text', {}, symptoms.map((x) => SYMPTOM_LABELS[x]).join('、'))
        : small
          ? h('div.hint', {}, `還太小，長到約 ${(Math.ceil(swallowCm(game.state) * 10 + 1) / 10).toFixed(1)} cm 成魚就吞不下`)
          : h('div.hint', {}, readyForTank(game.state, f) ? (isJuvenile(f) ? '長夠大了，可以移到主缸' : '觀察期滿，看起來很健康') : '還在觀察');
      return h(
        'div.item',
        {},
        h('div', {}, h('b', {}, `${fishName(f)}・${f.lengthCm.toFixed(1)} cm・第 ${Math.floor(days) + 1} 天`), status),
        button('移到主缸', () => release([f.id]), readyForTank(game.state, f) ? 'primary' : ''),
      );
    }),
    dead > 0 ? h('div.warn-text', {}, `有 ${dead} 條死在檢疫盒裡了。還好沒有放進主缸。`) : null,
    h('h3', {}, '當產卵盒用'),
    h('p.hint', {}, '肚子鼓起來的母魚放進來，生下的小魚不會被成魚吃掉；已經生出來的仔魚也可以撈進來。母魚生完放回主缸；小魚長到 1.6 cm 左右，成魚就吞不下了。'),
    ...game.state.fish
      .filter((f) => f.alive && f.sex === 'female' && f.pregnancy > 0.5)
      .map((f) =>
        h(
          'div.item',
          {},
          h('div', {}, h('b', {}, fishName(f)), h('div.hint', {}, f.pregnancy > 0.85 ? '快生了' : '懷孕中')),
          button('放進盒子', () => {
            game.act((st) => moveToQuarantine(st, f.id));
            ctx.sound?.('net');
            toasts.show(`把 ${fishName(f)} 放進檢疫盒待產`);
            sheet.close();
          }),
        ),
      ),
    ...(() => {
      // 已經生出來、會被成魚吃的仔魚也能放進來（#144）
      const fry = splitGroup(game.state, 'by_size').filter((f) => isJuvenile(f)).length;
      if (fry === 0 || !splitAdvice(game.state).some((a) => a.reason === 'fry_with_adults')) return [];
      return [
        h(
          'div.item',
          {},
          h('div', {}, h('b', {}, `${fry} 條仔魚`), h('div.hint', {}, '在主缸會被成魚吃掉')),
          button('撈進盒子', () => {
            const moved = game.act((st) => rescueFryToBox(st));
            ctx.sound?.('net');
            toasts.show(`${moved} 條仔魚撈進檢疫盒了，長到成魚吞不下再放回主缸`);
            sheet.close();
          }, 'primary'),
        ),
      ];
    })(),
    h('h3', {}, '藥浴（只下在檢疫盒）'),
    h('div.row.wrap', {}, bath('ichMedication', '白點藥'), bath('antibiotic', '抗生素'), bath('dewormer', '驅蟲藥')),
    ...(() => {
      // 一次移的只移長夠大、觀察完的；太小的仔魚留在盒裡（#174）
      const ready = living.filter((f) => readyForTank(game.state, f)).map((f) => f.id);
      if (ready.length > 0) return [button(`把長夠大的移到主缸（${ready.length} 條）`, () => release(ready), 'primary')];
      return dead > 0 ? [button('撈掉死魚', () => release([]))] : [];
    })(),
  );
}

export function maintenancePanel({ game, sheet, toasts, undoable, openScape }: PanelContext): Node {
  const s = game.state;
  // 每日小事「看看過濾器和加熱棒」
  markDaily(game.tanks, 'gear');
  const eq = s.equipment;
  // 每一列前面放那樣設備的商品圖（跟商店、圖鑑同一張），一眼看得出是哪個
  const pic = (art: string) => {
    const img = h('img', { src: `${import.meta.env.BASE_URL}art/${art}`, alt: '', loading: 'lazy', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    return h('span.item-pic', { 'aria-hidden': 'true' }, img);
  };
  const row = (art: string | Node, ...children: Array<Node | null>) => h('div.item.has-pic', {}, typeof art === 'string' ? pic(art) : h('span.item-pic', { 'aria-hidden': 'true' }, art), ...children);
  const toggle = (art: string, label: string, on: boolean, flip: (st: TankState) => void) =>
    row(art, h('b.item-main', {}, label), button(on ? '開' : '關', () => game.act(flip), on ? 'primary' : ''));
  const env = s.environment;
  const month = monthOf(new Date());
  const volume = eq.tank.volumeL;
  const level = (s.water.levelL ?? volume) / volume;
  const setClimate = (change: (st: TankState) => void) =>
    game.act((st) => {
      change(st);
      applySeason(st);
    });
  return h(
    'div.stack',
    {},
    h('h3', {}, '螺'),
    row('snail/snail-bladder.webp', h('div.item-main', {}, h('b', {}, s.snails ? `大螺 ${s.snails.snails.filter((x) => x.alive).length} 隻、小螺約 ${pestCount(s)} 隻` : '螺'), h('div.hint', {}, '卵塊、陷阱、手撈、除螺藥')), button('管理', () => sheet.open('螺', () => snailPanel({ game, sheet, toasts, undoable })))),
    h('h3', {}, '室溫與水位'),
    h(
      'div.item.has-pic',
      {},
      h('span.item-pic', { 'aria-hidden': 'true' }, h('span.kit-thermo', {}, h('i'))),
      h('div.item-main', {}, h('b', {}, `${seasonName(month)}・室溫約 ${env.roomTempC.toFixed(1)}°C`), h('div.hint', {}, `日夜差 ±${(env.roomSwingC ?? 1.5).toFixed(1)}°C，季節跟著現實日曆走`)),
      h(
        'select.select',
        {
          'aria-label': '地區',
          onchange: (e: Event) => setClimate((st) => (st.environment.region = (e.target as HTMLSelectElement).value as Region)),
        },
        ...(Object.keys(REGION_LABELS) as Region[]).map((r) => h('option', { value: r, selected: (env.region ?? 'north') === r }, REGION_LABELS[r])),
      ),
    ),
    toggle('gear/fan.webp', '放在冷氣房（夏天約 26.5°C）', !!env.airConditioned, () => setClimate((st) => (st.environment.airConditioned = !st.environment.airConditioned))),
    row(
      // 小缸：少掉的那截是空的
      h('span.wc-mini.level', {}, h('i', { style: `height:${Math.round(Math.max(0, 1 - level) * 100)}%` })),
      h(
        'div.item-main',
        {},
        h('b', {}, `水位 ${Math.round(level * 100)}%`),
        h(level < 0.9 ? 'div.warn-text' : 'div.hint', {}, level < 0.8 ? '水位太低，加熱棒可能露出水面空燒！' : level < 0.9 ? '蒸發掉的水要補回來，水質才不會越來越濃' : '水蒸發只帶走水，溶在水裡的東西會越來越濃'),
      ),
      button('補水', () => {
        const missing = volume - (game.state.water.levelL ?? volume);
        if (missing < 0.05) toasts.show('水是滿的');
        else doUndoable({ toasts, undoable }, () => game.act((st) => topUp(st)), `補了 ${missing.toFixed(1)} L 的水`);
      }, level < 0.9 ? 'primary' : ''),
    ),
    row(
      `gear/bag-${eq.substrate?.spec.id ?? 'sand'}.webp`,
      h(
        'div.item-main',
        {},
        h('b', {}, `底材：${substrateName(eq.substrate)}`),
        eq.substrate?.spec.khAbsorb
          ? h(eq.substrate.buffer < 0.15 ? 'div.warn-text' : 'div.hint', {}, `緩衝力剩約 ${Math.round(eq.substrate.buffer * 100)}%${eq.substrate.buffer < 0.15 ? '，KH 會慢慢回升，該換新土了' : ''}`)
          : null,
      ),
    ),
    row(
      'scape/rock-seiryu-1.webp',
      h('div.item-main', {}, h('b', {}, '造景'), h('div.hint', {}, (eq.hardscape ?? []).length > 0 ? summarizeHardscape(eq.hardscape ?? []) : '還沒放石頭或沉木（商店的「設備」可以買）')),
      openScape ? button('擺放', () => openScape()) : null,
    ),
    h('h3', {}, '設備'),
    eq.heater
      ? row(
          'gear/heater.webp',
          h(
            'div.item-main',
            {},
            h('b', {}, `加熱棒 ${eq.heater.targetC}°C`),
            eq.heater.broken
              ? h('div.warn-text', {}, eq.heater.stuckOn ? '卡住一直加熱！先拔掉插頭，再到商店換一支' : '故障中，請到商店換一支')
              : null,
          ),
          eq.heater.stuckOn
            ? button('拔掉插頭', () => {
                game.act((st) => unplugHeater(st));
                toasts.show('拔掉加熱棒了，記得換一支新的', 'warn');
              }, 'primary')
            : h('div.row', {}, button('−', () => game.act((st) => setHeaterTarget(st, eq.heater!.targetC - 1))), button('+', () => game.act((st) => setHeaterTarget(st, eq.heater!.targetC + 1)))),
        )
      : null,
    eq.light
      ? row(
          `gear/led-${eq.light.spec.id}.webp`,
          h('b.item-main', {}, `燈光 ${eq.light.startHour}:00 起 ${eq.light.photoperiodHours} 小時`),
          h('div.row', {}, button('−', () => game.act((st) => (st.equipment.light!.photoperiodHours = Math.max(0, eq.light!.photoperiodHours - 1)))), button('+', () => game.act((st) => (st.equipment.light!.photoperiodHours = Math.min(16, eq.light!.photoperiodHours + 1))))),
        )
      : null,
    eq.filter ? toggle(`gear/${eq.filter.spec.id.toLowerCase()}-filter.webp`, eq.filter.spec.name, eq.filter.on, (st) => {
      st.equipment.filter!.on = !st.equipment.filter!.on;
    }) : null,
    eq.airPump ? toggle('gear/air-pump.webp', '打氣機', eq.airPump.on, (st) => {
      st.equipment.airPump!.on = !st.equipment.airPump!.on;
    }) : null,
    eq.co2 ? toggle('gear/co2-set.webp', 'CO₂（跟著燈光時程）', eq.co2.on, (st) => {
      st.equipment.co2!.on = !st.equipment.co2!.on;
    }) : null,
    eq.fan ? toggle('gear/fan.webp', '降溫風扇', eq.fan.on, (st) => {
      st.equipment.fan!.on = !st.equipment.fan!.on;
    }) : null,
    eq.chiller
      ? row(
          'gear/chiller.webp',
          h('div.item-main', {}, h('b', {}, `冷水機 ${eq.chiller.targetC}°C`), h('div.hint', {}, eq.chiller.on ? (eq.chiller.cooling ? '製冷中' : '待機') : '關閉')),
          h(
            'div.row',
            {},
            button('−', () => game.act((st) => (st.equipment.chiller!.targetC = Math.max(18, eq.chiller!.targetC - 1)))),
            button('+', () => game.act((st) => (st.equipment.chiller!.targetC = Math.min(30, eq.chiller!.targetC + 1)))),
            button(eq.chiller.on ? '開' : '關', () => game.act((st) => (st.equipment.chiller!.on = !st.equipment.chiller!.on)), eq.chiller.on ? 'primary' : ''),
          ),
        )
      : null,
    eq.controller
      ? row(
          'gear/heater.webp',
          h('div.item-main', {}, h('b', {}, `控溫器上限 ${eq.controller.maxC}°C`), eq.controller.tripped ? h('div.warn-text', {}, '水溫過高，已切斷加熱棒電源') : h('div.hint', {}, '超過就切斷加熱棒')),
          h(
            'div.row',
            {},
            button('−', () => game.act((st) => (st.equipment.controller!.maxC = Math.max(24, eq.controller!.maxC - 1)))),
            button('+', () => game.act((st) => (st.equipment.controller!.maxC = Math.min(34, eq.controller!.maxC + 1)))),
          ),
        )
      : null,
    // 按鈕只放短字（V4）：說明放在小標題，價錢用金幣小牌
    h('h3', {}, '洗濾材'),
    h(
      'div.row.wrap',
      {},
      button('用缸水', () => {
        doUndoable({ toasts, undoable }, () => game.act((st) => rinseFilterMedia(st, 'tank')), '用換出來的缸水洗了濾材');
      }),
      button('用自來水', () => {
        doUndoable({ toasts, undoable }, () => game.act((st) => rinseFilterMedia(st, 'tap')), '用自來水洗了濾材：自來水的氯會殺死硝化菌', 'warn');
      }),
    ),
    h('h3', {}, '用藥'),
    h(
      'div.row.wrap',
      {},
      medButton('白點藥', price('med:ich'), () => {
        purchase({ game, sheet, toasts, undoable }, price('med:ich'), (st) => doseIchMedication(st), '下了一份白點藥（對蝦有毒）', 'warn', true);
      }),
      medButton('抗生素', price('med:antibiotic'), () => {
        purchase({ game, sheet, toasts, undoable }, price('med:antibiotic'), (st) => doseAntibiotic(st), '下了一份抗生素（也會殺掉一些硝化菌）', 'warn', true);
      }),
      medButton('驅蟲藥', price('med:dewormer'), () => {
        purchase({ game, sheet, toasts, undoable }, price('med:dewormer'), (st) => doseDewormer(st), '下了一份驅蟲藥', 'info', true);
      }),
    ),
    s.quarantine
      ? h(
          'div.stack',
          {},
          h('h3', {}, '檢疫盒'),
          row(
            'gear/quarantine-box.webp',
            h('div.item-main', {}, h('b', {}, `檢疫盒裡有 ${s.quarantine.fish.filter((f) => f.alive).length} 條`), h('div.hint', {}, '新魚先觀察，發病了就在盒子裡藥浴')),
            button('查看', () => sheet.open('檢疫盒', () => quarantinePanel({ game, sheet, toasts, undoable }))),
          ),
        )
      : null,
    s.nurseryBox
      ? h(
          'div.stack',
          {},
          h('h3', {}, '育幼盒'),
          row(
            'gear/nursery-box.webp',
            h('div.item-main', {}, h('b', {}, `育幼盒裡有 ${nurseryFish(s).length} 條`), h('div.hint', {}, '快生的母魚、會被吃的小魚放這裡')),
            button('查看', () => sheet.open('育幼盒', () => nurseryPanel({ game, sheet, toasts, undoable }))),
          ),
        )
      : null,
  );
}

/** 開發用：顯示真實數值，方便調整平衡（玩家版不會有）。 */
export function debugPanel({ game }: PanelContext): Node {
  const s = game.state;
  const w = s.water;
  const rows: Array<[string, string]> = [
    ['水溫', `${w.tempC.toFixed(2)} °C`],
    ['TAN / 游離氨', `${w.tan.toFixed(3)} / ${freeAmmonia(s).toFixed(4)}`],
    ['NO₂ / NO₃', `${w.no2.toFixed(3)} / ${w.no3.toFixed(1)}`],
    ['pH / KH', `${w.ph.toFixed(2)} / ${w.kh.toFixed(2)}`],
    ['O₂ / CO₂', `${w.o2.toFixed(2)} / ${w.co2.toFixed(1)}`],
    ['殘餌 / 有機物', `${w.foodMg.toFixed(0)} / ${w.organicMg.toFixed(0)} mg`],
    ['亞硝化菌 / 硝化菌', `${s.bacteria.aob.toFixed(3)} / ${s.bacteria.nob.toFixed(3)}`],
    ['白點蟲 游走 / 包囊', `${w.ichPathogen.toFixed(2)} / ${w.ichCysts.toFixed(2)}`],
    ['藥物', w.medication.toFixed(2)],
    ['藻類', s.algae.toFixed(2)],
    ['躲藏係數', hidingFactor(s).toFixed(2)],
  ];
  return h(
    'div.stack',
    {},
    h('table.readings', {}, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td.value', {}, v)))),
    h(
      'table.readings',
      {},
      ...s.fish.map((f) =>
        h('tr', {}, h('td', {}, fishName(f)), h('td.value', {}, f.alive ? `健康 ${f.health.toFixed(2)} 壓力 ${f.stress.toFixed(2)} 飢餓 ${f.hunger.toFixed(2)} ${f.ich.stage} ${f.lengthCm.toFixed(1)}cm${f.finDamage > 0 ? ` 鰭 ${f.finDamage.toFixed(2)}` : ''}${f.pregnancy > 0 ? ` 孕 ${f.pregnancy.toFixed(2)}` : ''}` : '死亡')),
      ),
      ...s.plants.map((p) => h('tr', {}, h('td', {}, PLANT_SPECIES[p.species].name), h('td.value', {}, `${p.biomassG.toFixed(2)} g 生長 ${(p.growthRate * 24).toFixed(3)}/天 葉藻 ${p.leafAlgae.toFixed(2)}`))),
    ),
  );
}

/** 我的水缸：切換、加缸、收缸。缸位只看錢，但每多一缸就多一份要照顧的水。 */
const PURPOSE_ART: Record<TankPurpose, string> = { breeding: 'gear/nursery-box.webp', display: 'gear/led-planted.webp' };

/**
 * 第二缸的用途（G4）：繁殖缸或展示缸兩張卡擇一，標「推薦」的照現在缸裡的狀況和錢；可以先跳過，之後在「我的水缸」再選。
 * 選了：缸沒取名就用用途當名字、目標串多一個那種用途的目標，接著帶去商店買必買的東西。
 */
export function tankPurposePanel(ctx: PanelContext): Node {
  const { game, sheet, toasts } = ctx;
  const coins = economy(game.state).coins;
  const pick = suggestPurpose(game.tanks, coins);
  const now = game.state.purpose;
  const choose = (id: TankPurpose) => {
    const spec = TANK_PURPOSES[id];
    game.actAll(() => setTankPurpose(game.state, id));
    ctx.sound?.('quest');
    const need = spec.items.filter((x) => x.required).map((x) => x.label).join('、');
    toasts.show(`這缸當${spec.title}：先買${need}`);
    sheet.open('商店', () => shopPanel(ctx, spec.items.find((x) => x.required)?.key.startsWith('plant:') ? 'plants' : 'gear'));
  };
  const card = (id: TankPurpose) => {
    const spec = TANK_PURPOSES[id];
    const required = spec.items.filter((x) => x.required);
    const later = spec.items.filter((x) => !x.required);
    return shopCard({
      art: PURPOSE_ART[id],
      name: spec.title,
      price: purposeCost(id),
      unit: ' 起',
      badge: now === id ? '現在' : id === pick ? '推薦' : undefined,
      chips: [...required.map((x) => `${x.label} ${x.price}`), ...later.map((x) => `之後：${x.label}`)],
      note: spec.pitch,
      actions: [button(now === id ? '就這樣' : '選這個', () => (now === id ? sheet.close() : choose(id)), id === pick ? 'primary' : '')],
      cls: `.purpose-card${id === pick ? '.picked' : ''}`,
    });
  };
  return h(
    'div.stack.purpose-panel',
    {},
    h('p.hint', {}, `${tankLabel(game.tanks, game.active)}：選一個用途，會多一個這缸的目標。錢包 ${yuan(coins)}`),
    cardGrid(card('breeding'), card('display')),
    h('div.row', {}, button('先跳過，之後在「我的水缸」選', () => sheet.close())),
  );
}

export function tanksPanel(ctx: PanelContext): Node {
  const { game, sheet, toasts } = ctx;
  const coins = economy(game.state).coins;
  const reopen = () => sheet.open('我的水缸', () => tanksPanel(ctx));
  const rows = game.tanks.map((t, i) => {
    const living = t.fish.filter((f) => f.alive).length;
    const urgent = todos(t).filter((x) => x.tone !== 'ok');
    const summary = [t.equipment.tank.name, `${living} 隻魚蝦`, `${t.water.tempC.toFixed(1)}°C`].join(' · ');
    const refusal = removeTankRefusal(game.tanks, i);
    return h(
      `div.item.tank-row${i === game.active ? '.current' : ''}`,
      {},
      artImg('tanks', 'tank-row-art'),
      h(
        'div.tank-row-text',
        {},
        h('b', {}, tankLabel(game.tanks, i)),
        h('div.hint', {}, summary),
        urgent.length ? h(`div.hint.${urgent[0].tone}`, {}, urgent.length > 1 ? `${urgent[0].text}（還有 ${urgent.length - 1} 件）` : urgent[0].text) : null,
      ),
      h(
        'div.row',
        {},
        i === game.active
          ? h('span.tag', {}, '正在看')
          : button('切換', () => {
              game.switchTo(i);
              sheet.close();
              toasts.show(`切換到${tankLabel(game.tanks, i)}`);
            }, 'primary'),
        // 從這缸分一半濾材到正在看的缸：新缸幾乎不用等養水
        i !== game.active && mediaAvailable(t) > 0
          ? h(
              'button.btn.media-btn',
              {
                onclick: () => {
                  const target = game.state;
                  const gift = game.actAll(() => transferMedia(t, target));
                  if (!gift) return;
                  toasts.show(gift.ich ? `把${tankLabel(game.tanks, i)}的濾材分過來了，但那缸有白點蟲，蟲卵也跟著過來了` : `把${tankLabel(game.tanks, i)}的濾材分過來了，硝化菌一起搬家`, gift.ich ? 'warn' : 'info');
                  reopen();
                },
                title: '分一半濾材到正在看的缸',
              },
              artImg('media-transfer', 'btn-art'),
              '分濾材過來',
            )
          : null,
        i > 0
          ? button(t.purpose ? TANK_PURPOSES[t.purpose].title : '選用途', () => {
              game.switchTo(i);
              sheet.open('這缸拿來做什麼？', () => tankPurposePanel(ctx));
            })
          : null,
        button('改名', () => {
          const name = prompt('幫這缸取個名字（例如：繁殖缸、紅蛇王專缸）', t.label ?? '')?.trim();
          if (name === undefined) return;
          game.actAll(() => (t.label = name.slice(0, 12) || undefined));
          reopen();
        }),
        game.tanks.length > 1
          ? button('收掉', () => {
              if (refusal) {
                toasts.show(refusal, 'warn');
                return;
              }
              if (!confirm(`確定要收掉${tankLabel(game.tanks, i)}嗎？水草和造景會丟掉，缸和設備折價賣回。`)) return;
              const refund = game.actAll((tanks) => removeTank(tanks, i));
              toasts.show(`收掉了一缸，拿回 ${yuan(refund)}`);
              reopen();
            })
          : null,
      ),
    );
  });
  const slot = slotPrice(game.tanks.length);
  const offers = (Object.keys(TANK_SETS) as TankSizeId[]).map((id) => {
    const set = TANK_SETS[id];
    const cost = newTankCost(game.tanks, id);
    const refusal = buyTankRefusal(game.tanks, id);
    const lock = tankLock(game.tanks, id);
    const buy = () => {
      if (refusal) {
        toasts.show(refusal === '錢不夠' ? `錢不夠：要 ${cost} 元，現在有 ${coins} 元` : refusal, 'warn');
        return;
      }
      const tank = game.actAll((tanks) => buyTank(tanks, id));
      if (!tank) return;
      ctx.sound?.('buy');
      game.switchTo(game.tanks.indexOf(tank));
      toasts.show(`架好了新的${set.tank.name}（${yuan(cost)}）。新缸要先養水，硝化菌長起來才能放魚`);
      // 第二缸起（G4）：先問這缸拿來做什麼，可以跳過
      sheet.open('這缸拿來做什麼？', () => tankPurposePanel(ctx));
    };
    return shopCard({
      art: 'gear/tank-empty.webp',
      name: set.tank.name,
      price: cost,
      chips: [`${set.tank.volumeL}L`, set.filter.name.replace(/（.*）/, ''), set.heater.name, slot > 0 ? '含缸架' : ''].filter(Boolean),
      note: lock ? '🔒 ' + unlockHint(lock) : undefined,
      actions: [button('買', buy, refusal ? '' : 'primary')],
      cls: lock ? '.locked' : '',
    });
  });
  return h(
    'div.stack',
    {},
    h('p.wallet', {}, `錢包：${yuan(coins)}`),
    ...rows,
    h('h3', {}, '加一缸'),
    cardGrid(...offers),
    advice([
      '多一缸可以分開養不同的魚、隔出繁殖缸或種魚專缸。每缸都要各自養水、換水、付電費，缸越多越難顧。',
      '大缸水質比較穩，但設備要跟著夠力。',
      `原本的櫃子放得下 2 缸，之後每多一缸要加一層缸架${slot > 0 ? `（這次 ${yuan(slot)}）` : ''}；房間最多 6 缸。`,
    ]),
  );
}

const PEST_ORDER: PestKind[] = ['bladder', 'ramshorn', 'mts'];

/** 螺的管理：看看缸裡有多少螺，各種清除方法各有代價（design/snails.md §3）。 */
export function snailPanel(ctx: PanelContext): Node {
  // 每日小事「找到缸裡的螺」：打開螺的面板就算看過（之後畫面支援點缸裡的螺再改成點螺）
  markDaily(ctx.game.tanks, 'snail');
  const { game, sheet, toasts } = ctx;
  const st = game.state;
  const s = st.snails;
  const lit = isLightOn(st);
  const living = s?.snails.filter((x) => x.alive) ?? [];
  const dead = (s?.snails.length ?? 0) - living.length;
  const bloom = snailBloom(st);
  const refresh = () => sheet.open('螺', () => snailPanel(ctx));
  const act = (run: (st: TankState) => string, tone: 'info' | 'warn' = 'info') => () => {
    let text = '';
    game.act((x) => (text = run(x)));
    toasts.show(text, tone);
    refresh();
  };
  const counts = (Object.keys(SNAILS) as SnailKind[])
    .map((k) => [k, living.filter((x) => x.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${SNAILS[k].name} ${n} 隻`);
  // 尖螺白天躲在沙裡：玩家只看得到一兩成
  const pests = PEST_ORDER.map((k) => [k, Math.round(pestCount(st, k) * (k === 'mts' && lit ? 0.1 : 1))] as const).filter(([, n]) => n > 0);
  const young = Math.round(s?.appleYoung ?? 0);
  const trapAge = s?.trapHour !== undefined ? st.hours - s.trapHour : null;
  const hasShrimp = st.fish.some((f) => f.alive && isShrimpSpecies(f.species));
  return h(
    'div.stack',
    {},
    h('p.hint', {}, '小螺吃殘餌和有機物：餵太多幾週內就會爆量，少餵一陣子自然變少。'),
    h(
      'div.item',
      {},
      h(
        'div',
        {},
        h('b', {}, counts.length ? counts.join('、') : '沒有養螺'),
        h('div.hint', {}, pests.length ? `看得到的小螺：${pests.map(([k, n]) => `${PESTS[k].name} ${n}`).join('、')}${lit && pestCount(st, 'mts') > 0 ? '（尖螺白天躲在沙裡，關燈才爬出來）' : ''}` : '沒看到害蟲小螺'),
        young > 0 ? h('div.hint', {}, `剛孵出的小蘋果螺約 ${young} 隻`) : null,
        bloom !== 'none' ? h('div.warn-text', {}, bloom === 'plague' ? '滿缸都是小螺！一定是餵太多了' : '小螺變多了，少餵一點') : null,
      ),
    ),
    s && s.clutches.length > 0
      ? h('div.item', {}, h('div', {}, h('b', {}, `蘋果螺卵塊 ${s.clutches.length} 團`), h('div.hint', {}, '在水面上方的缸壁上，一團 50～200 顆，三週左右孵化')), button('摘掉', act((x) => `摘掉 ${removeClutches(x)} 團卵塊`)))
      : null,
    dead > 0 ? h('div.item', {}, h('div', {}, h('b.warn-text', {}, `死掉的大螺 ${dead} 隻`), h('div.hint', {}, '大螺死了很快就爛，水會臭、氨會升高')), button('撈出來', act((x) => `撈出 ${removeDeadSnails(x)} 隻死螺`), 'primary')) : null,
    pestCount(st) > 0 || young > 0
      ? h('div.item', {}, h('div', {}, h('b', {}, '手撈小螺'), h('div.hint', {}, '只抓得到看得見的，一次大約四分之一；尖螺要關燈後撈')), button('撈', act((x) => `撈掉 ${catchPests(x, isLightOn(x))} 隻小螺`)))
      : null,
    h(
      'div.item',
      {},
      h('div', {}, h('b', {}, '螺陷阱'), h('div.hint', {}, trapAge === null ? '放一片燙過的菜過夜，隔天收能抓走一批；忘了收菜會爛' : `放了 ${Math.floor(trapAge)} 小時${trapAge < 8 ? '，再等一下比較多' : trapAge > 36 ? '，快爛了趕快收' : ''}`)),
      trapAge === null ? button('放菜葉', act((x) => (setTrap(x), '放了一片燙過的菜葉，隔夜再收'))) : button('收陷阱', act((x) => `收起陷阱，抓到 ${Math.max(0, collectTrap(x))} 隻小螺`), 'primary'),
    ),
    s && s.neriteEggs >= 1 ? h('div.item', {}, h('div', {}, h('b', {}, `斑馬螺卵點約 ${Math.round(s.neriteEggs)} 顆`), h('div.hint', {}, '淡水孵不出來，只是難看')), button('刮掉', act((x) => `刮掉 ${scrapeNeriteEggs(x)} 顆卵點`))) : null,
    h(
      'div.item',
      {},
      h('div', {}, h('b', {}, '除螺藥（含銅）'), h(hasShrimp ? 'div.warn-text' : 'div.hint', {}, `${price('med:snail')} 元 · 一兩天內螺幾乎死光，但${hasShrimp ? '缸裡的蝦也會中毒死掉！' : '對蝦有毒'}；死螺一起爛，氨會暴衝，記得換水`)),
      button('下藥', () => {
        if (purchase(ctx, price('med:snail'), (x) => doseMolluscicide(x), '下了除螺藥，記得這幾天多換水', 'warn', true)) refresh();
      }, hasShrimp ? 'danger' : ''),
    ),
  );
}

