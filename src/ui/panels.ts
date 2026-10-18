import type { SoundId } from '../audio/sounds';
import {
  addFish,
  addFishToQuarantine,
  addCuttings,
  addHardscape,
  addPlant,
  buybackRefusal,
  GUPPY_STRAIN_PRICES,
  GUPPY_FIN_STRAINS,
  GUPPY_STRAINS,
  finWords,
  matingSuccess,
  predictOffspring,
  canClaimStarterPack,
  claimStarterPack,
  buyTank,
  buyTankRefusal,
  moveFish,
  newTankCost,
  removeTank,
  removeTankRefusal,
  slotPrice,
  TANK_SETS,
  tankLabel,
  tankSetPrice,
  type TankSizeId,
  chargeMeal,
  economy,
  FISH_PRICES,
  fishBuybackPrice,
  PLANT_PRICES,
  plantBuybackPrice,
  price,
  sellCuttings,
  sellFish,
  sellsLeftToday,
  spend,
  takeCutting,
  buyQuarantine,
  HARDSCAPE,
  removeHardscape,
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
  farmHabit,
  habitGap,
  habitOf,
  phBeyondSurvival,
  waterGh,
  SPLIT_PLAN_LABELS,
  splitAdvice,
  splitGroup,
  splitTank,
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
  releaseQuarantine,
  AIR_PUMPS,
  CHILLERS,
  CO2_KITS,
  doseIchMedication,
  DEFAULT_FOOD,
  feed,
  FANS,
  FOOD_GRADES,
  FOOD_KINDS,
  mealPrice,
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
  type Fish,
  type FishSpeciesId,
  type FoodGrade,
  type FoodKind,
  type Symptom,
  type PlantSpeciesId,
  type Region,
  type TankState,
  type TestKitReading,
} from '../sim';
import { applySeason, type Game } from '../game/game';
import { h } from './dom';
import { DEATH_CAUSE_LABELS, fishName, plantName, SYMPTOM_LABELS } from './labels';
import type { Sheet, Toasts } from './sheet';
import { READING_TONES, todos } from './status';

export interface PanelContext {
  game: Game;
  sheet: Sheet;
  toasts: Toasts;
  /** 播放音效（沒有聲音引擎時不做事）。 */
  sound?: (id: SoundId) => void;
  /** 做一件可能後悔的事，通知上附「復原」按鈕。 */
  undoable?: (run: () => void, text: string, tone?: 'warn' | 'info') => void;
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
function mealSize(s: TankState): number {
  return alive(s).reduce((sum, f) => sum + FISH_SPECIES[f.species].dailyFoodMg, 0) / 2;
}

function button(label: string, onclick: () => void, kind = ''): HTMLButtonElement {
  return h(`button.btn${kind ? '.' + kind : ''}`, { onclick }, label);
}

/** 上次選的飼料（同一次遊戲記住）。 */
let feedChoice: { kind: FoodKind; grade: FoodGrade } = { ...DEFAULT_FOOD };

/** 缸裡有誰吃不太到這種飼料（例如只餵漂浮的，蝦吃不到）。 */
export function feedWarning(s: TankState, kind: FoodKind): string | null {
  const species = [...new Set(alive(s).map((f) => f.species))];
  const missing = species.filter((sp) => FISH_SPECIES[sp].diet[kind] < 0.5);
  if (!missing.length) return null;
  const better = kind === 'sinking' ? '漂浮' : '沉底';
  return `${missing.map((sp) => FISH_SPECIES[sp].name).join('、')}吃不太到${FOOD_KINDS[kind].name}飼料，記得也餵${better}的。`;
}

export function feedPanel(ctx: PanelContext): Node {
  const { game, sheet, toasts, sound } = ctx;
  const s = game.state;
  const meal = mealSize(s);
  if (meal <= 0) return h('p', {}, '缸裡還沒有魚。');
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
      button('一小撮', give(meal * 0.5, '一小撮')),
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
  const label = h('span', {}, '30%');
  const slider = h('input', { type: 'range', min: '10', max: '80', step: '5', value: '30' }) as HTMLInputElement;
  slider.addEventListener('input', () => {
    fraction = Number(slider.value) / 100;
    label.textContent = `${slider.value}%`;
  });
  const check = h('input', { type: 'checkbox', checked: 'checked' }) as HTMLInputElement;
  check.addEventListener('change', () => (matchTemp = check.checked));
  return h(
    'div.stack',
    {},
    h('p.hint', {}, '換水能稀釋氨、亞硝酸鹽、硝酸鹽，並補回 KH。每週 20–30% 是好習慣。'),
    h('label.field', {}, '換水量 ', label, slider),
    h('label.check', {}, check, ' 新水對好溫度（沒對溫，水溫驟變會讓魚緊迫）'),
    button('開始換水', () => {
      doUndoable({ toasts, undoable }, () => game.act((st) => waterChange(st, fraction, matchTemp ? { tempC: st.water.tempC } : {})), `換了 ${Math.round(fraction * 100)}% 的水`);
      sound?.('water');
      sheet.close();
    }, 'primary'),
  );
}

const READING_ROWS: Array<{ key: keyof TestKitReading; label: string; unit: string }> = [
  { key: 'ammonia', label: '氨 NH₃/NH₄⁺', unit: 'ppm' },
  { key: 'nitrite', label: '亞硝酸鹽 NO₂', unit: 'ppm' },
  { key: 'nitrate', label: '硝酸鹽 NO₃', unit: 'ppm' },
  { key: 'ph', label: 'pH', unit: '' },
  { key: 'kh', label: 'KH', unit: 'dKH' },
];

/** 顯示最近一次測水的結果（測試按鈕會先測一次）。 */
export function testKitPanel({ game }: PanelContext): Node {
  const test = game.state.lastTest;
  if (!test) return h('p', {}, '還沒測過水。');
  const r = test.reading;
  return h(
    'div.stack',
    {},
    h('p.hint', {}, '試劑只能比對色卡，讀到的是大約的級距。結果會顯示在上方的狀態列，三天後就不準了。'),
    h(
      'table.readings',
      {},
      ...READING_ROWS.map((row) => {
        const tone = READING_TONES[row.key](r[row.key]);
        return h('tr', {}, h('td', {}, row.label), h(`td.value.${tone}`, {}, `${r[row.key]} ${row.unit}`));
      }),
      h('tr', {}, h('td', {}, '水溫（溫度計）'), h('td.value', {}, `${game.state.water.tempC.toFixed(1)} °C`)),
    ),
  );
}

/** 修剪：列出所有水草，長滿一半以上的可以剪。 */
export function trimListPanel(ctx: PanelContext): Node {
  const { game, sheet } = ctx;
  const plants = game.state.plants;
  if (plants.length === 0) return h('p', {}, '缸裡還沒有水草，可以到商店買。');
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

/** 商店放魚的方式：預設慢慢滴水對水。 */
let shopDrip = true;

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

export function fishPanel({ game, sheet, toasts }: PanelContext, fishId: number): Node {
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
  return h(
    'div.stack',
    {},
    h('p', {}, `${fishName(fish)} · 體長約 ${fish.lengthCm.toFixed(1)} cm · ${ageLabel(fish.ageDays)}`),
    h('p', {}, growthLine(game.state, fish)),
    h('p', {}, habitLine(game.state, fish)),
    fish.genome ? geneticsInfo(fish) : null,
    symptoms.length
      ? h('ul.symptoms', {}, ...symptoms.map((s) => h('li', {}, SYMPTOM_LABELS[s])))
      : h('p', {}, '游動正常，看起來很健康。'),
    h('p', {}, conditionLine(fish)),
    h('p.hint', {}, '症狀只是線索：先用測試劑檢查水質，再判斷是環境問題還是生病。'),
    game.tanks.length > 1 ? moveFishRow(game, sheet, toasts, fish) : null,
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
  if (fish.species === 'cherry_shrimp' && fish.lengthCm < maxLengthCm(fish) * 0.97) parts.push('靠脫殼長大');
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
  const render = () => {
    const group = splitGroup(state, plan);
    body.replaceChildren(
      ...advice.map((a) => h(`p.${a.tone === 'bad' ? 'warn-text' : 'hint'}`, {}, a.text)),
      h('h3', {}, '怎麼分'),
      h('div.row.wrap', {}, ...plans.map((p) => h(`button.btn.small${p === plan ? '.primary' : ''}`, { onclick: () => ((plan = p), render()) }, SPLIT_PLAN_LABELS[p]))),
      h('p', {}, `要移的魚：${group.length} 條（${[...new Set(group.map((f) => fishName(f).replace(/ #\d+$/, '')))].join('、')}）`),
      h('h3', {}, '移到哪一缸'),
      others.length === 0
        ? h('div.stack', {}, h('p.hint', {}, '沒有別的缸。先加一缸（大缸比較穩，但設備要夠），或把一部分賣掉、送朋友。'), button('去加一缸', () => sheet.open('我的水缸', () => tanksPanel(ctx))))
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

export type ShopTab = 'fish' | 'plants' | 'gear' | 'sell';

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
  const coins = economy(game.state).coins;
  const tabs = h(
    'div.tabs',
    {},
    ...(['fish', 'plants', 'gear', 'sell'] as const).map((t) =>
      h(`button.tab${t === tab ? '.active' : ''}`, { onclick: () => sheet.open('商店', () => shopPanel(ctx, t)) }, { fish: '魚', plants: '水草', gear: '設備', sell: '賣給店家' }[t]),
    ),
  );
  const wallet = h('p.wallet', {}, `錢包：${yuan(coins)}`);

  const buyFish = (species: FishSpeciesId, count: number, strain?: number, finStrain?: (typeof GUPPY_FIN_STRAINS)[number]) => () => {
    const quarantined = !!game.state.quarantine;
    const name = finStrain ? `${finStrain.name}孔雀魚` : strain !== undefined ? `${GUPPY_STRAINS[strain]}孔雀魚` : FISH_SPECIES[species].name;
    const each = finStrain ? finStrain.price : strain !== undefined ? GUPPY_STRAIN_PRICES[strain] : FISH_PRICES[species];
    const options = { ...(finStrain ? { strain: finStrain.strain, fin: finStrain.fin } : { strain }), drip: shopDrip };
    purchase(
      ctx,
      each * count,
      (st) => {
        for (let i = 0; i < count; i++) (quarantined ? addFishToQuarantine : addFish)(st, species, options);
      },
      quarantined
        ? `買了 ${count} 隻${name}，先放進檢疫盒觀察 ${QUARANTINE_DAYS} 天`
        : shopDrip
          ? `買了 ${count} 隻${name}，慢慢滴水對水後放進缸裡`
          : `買了 ${count} 隻${name}，直接倒進缸裡${Math.abs(farmHabit(species).ph - game.state.water.ph) > 0.6 ? '，水質差很多，牠們嚇壞了' : ''}`,
      !shopDrip && Math.abs(farmHabit(species).ph - game.state.water.ph) > 0.6 ? 'warn' : 'info',
    );
  };
  const buyPlant = (species: PlantSpeciesId) => () => purchase(ctx, PLANT_PRICES[species], (st) => addPlant(st, species), `種下一株${PLANT_SPECIES[species].name}`);

  let content: Node;
  if (tab === 'fish') {
    const farm = farmHabit('guppy');
    const dripRow = h(
      'div.stack',
      {},
      h('p.hint', {}, `店裡的魚習慣魚場的水（孔雀魚 pH ${farm.ph}、GH ${farm.gh}），你的缸現在 pH ${game.state.water.ph.toFixed(1)}、GH ${Math.round(waterGh(game.state))}。魚怕的是水質突然改變，不是 pH 數字本身。`),
      h(
        'div.row.wrap',
        {},
        h(`button.btn.small${shopDrip ? '.primary' : ''}`, { onclick: () => ((shopDrip = true), sheet.refresh?.()) }, `慢慢滴水對水（約 ${dripMinutes(game.state, farm)} 分鐘）`),
        h(`button.btn.small${shopDrip ? '' : '.primary'}`, { onclick: () => ((shopDrip = false), sheet.refresh?.()) }, '直接倒進缸裡'),
      ),
    );
    content = h(
      'div.stack',
      {},
      dripRow,
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
      game.state.quarantine
        ? h('p.hint', {}, `新買的魚會先放進檢疫盒，觀察 ${QUARANTINE_DAYS} 天沒問題再移到主缸。`)
        : h('p.hint', {}, '店裡的魚可能帶著白點蟲或其他病，直接放進主缸可能傳染整缸。商店的「設備」可以買檢疫盒。'),
      h('p.hint', {}, '新缸還沒養好水就放太多魚，會氨中毒。'),
      h('p.hint', {}, '孔雀魚和櫻花蝦會自己繁殖，但成魚會吃仔魚和仔蝦，水草種密一點才躲得掉。斑馬魚會輕微咬孔雀魚公魚的長尾巴。'),
      h('p.hint', {}, `孔雀魚（${FISH_SPECIES.guppy.temp.min}–${FISH_SPECIES.guppy.temp.max}°C；pH ${FISH_SPECIES.guppy.phSurvive.min}–${FISH_SPECIES.guppy.phSurvive.max} 都能慢慢適應）照品系賣。同品系配對生出來的大多一樣；不同品系混養會生出各種組合，也可能冒出藏在基因裡的白子。`),
      ...GUPPY_STRAINS.map((strain, i) =>
        h(
          'div.item',
          {},
          h('div', {}, h('b', {}, `孔雀魚・${strain}`), h('div.hint', {}, `每隻 ${GUPPY_STRAIN_PRICES[i]} 元`)),
          h('div.row', {}, button('+1', buyFish('guppy', 1, i)), button('+3', buyFish('guppy', 3, i))),
        ),
      ),
      h('p.hint', {}, '鰭型品系：燕尾、大耳是隱性，要兩邊都帶才長得出來；緞帶、大C 的公魚交接器太長不能配，要用母魚配一般公魚；劍尾只會傳給兒子。'),
      ...GUPPY_FIN_STRAINS.map((fs) =>
        h(
          'div.item',
          {},
          h('div', {}, h('b', {}, `孔雀魚・${fs.name}`), h('div.hint', {}, `每隻 ${fs.price} 元`)),
          h('div.row', {}, button('+1', buyFish('guppy', 1, undefined, fs)), button('+3', buyFish('guppy', 3, undefined, fs))),
        ),
      ),
      ...(Object.keys(FISH_SPECIES) as FishSpeciesId[]).filter((id) => id !== 'guppy').map((id) => {
        const sp = FISH_SPECIES[id];
        const note = [`每隻 ${FISH_PRICES[id]} 元`, `${sp.temp.min}–${sp.temp.max}°C`, `pH ${sp.phSurvive.min}–${sp.phSurvive.max} 能適應`, sp.minGroup ? `群游，至少 ${sp.minGroup} 隻` : ''].filter(Boolean).join(' · ');
        return h('div.item', {}, h('div', {}, h('b', {}, sp.name), h('div.hint', {}, note)), h('div.row', {}, button('+1', buyFish(id, 1)), button('+6', buyFish(id, 6))));
      }),
    );
  } else if (tab === 'plants') {
    const cuttings = economy(game.state).cuttings;
    content = h(
      'div.stack',
      {},
      h('p.hint', {}, '陰性草弱光就能長；陽性草需要強光加 CO₂。'),
      ...(Object.keys(PLANT_SPECIES) as PlantSpeciesId[]).map((id) =>
        h('div.item', {}, h('div', {}, h('b', {}, plantName(id)), h('div.hint', {}, `一盆 ${PLANT_PRICES[id]} 元`)), button('種一株', buyPlant(id))),
      ),
      ...(Object.keys(cuttings) as PlantSpeciesId[])
        .filter((id) => (cuttings[id] ?? 0) > 0)
        .map((id) =>
          h(
            'div.item',
            {},
            h('div', {}, h('b', {}, `手上的${PLANT_SPECIES[id].name}插枝`), h('div.hint', {}, `${cuttings[id]} 株，種回去不用錢`)),
            button('種一株', () => {
              game.act((st) => {
                if (takeCutting(st, id)) addPlant(st, id, PLANT_SPECIES[id].cuttingMassG);
              });
              toasts.show(`種了一株${PLANT_SPECIES[id].name}插枝`);
            }),
          ),
        ),
    );
  } else if (tab === 'gear') {
    const eq = game.state.equipment;
    const item = (label: string, key: string, owned: boolean, buy: () => void, note = '') =>
      h(
        'div.item',
        {},
        h('div', {}, h('b', {}, label), h('div.hint', {}, [yuan(price(key)), note].filter(Boolean).join(' · '))),
        owned ? h('span.owned', {}, '使用中') : button('買', buy),
      );
    content = h(
      'div.stack',
      {},
      h('p.warn-text', {}, '換過濾器會失去舊濾材上的硝化菌！'),
      ...Object.values(FILTERS).map((f) =>
        item(f.name, `filter:${f.id}`, eq.filter?.spec.id === f.id, () => {
          purchase(ctx, price(`filter:${f.id}`), (st) => replaceFilter(st, f), `換上${f.name}，濾材要重新養菌`, 'warn', true);
        }, `濾材容量 ${f.bacteriaCapacityMgPerHour}`),
      ),
      ...Object.values(HEATERS).map((x) =>
        item(x.name, `heater:${x.id}`, eq.heater?.spec.id === x.id && !eq.heater.broken, () => {
          purchase(ctx, price(`heater:${x.id}`), (st) => {
            st.equipment.heater = { spec: x, targetC: st.equipment.heater?.targetC ?? 25, broken: false, heating: false };
          }, `換上${x.name}`);
        }, eq.heater?.spec.id === x.id && eq.heater.broken ? '目前這支壞了' : ''),
      ),
      ...Object.values(LIGHTS).map((l) =>
        item(l.name, `light:${l.id}`, eq.light?.spec.id === l.id, () => {
          purchase(ctx, price(`light:${l.id}`), (st) => {
            st.equipment.light = { spec: l, startHour: st.equipment.light?.startHour ?? 10, photoperiodHours: st.equipment.light?.photoperiodHours ?? 8 };
          }, `換上${l.name}`);
        }, `光照強度 ${l.par} PAR`),
      ),
      item(AIR_PUMPS.small.name, 'air:small', !!eq.airPump, () => purchase(ctx, price('air:small'), (st) => (st.equipment.airPump = { spec: AIR_PUMPS.small, on: true }), `裝上${AIR_PUMPS.small.name}`)),
      item(CO2_KITS.diy.name, 'co2:diy', !!eq.co2, () => purchase(ctx, price('co2:diy'), (st) => (st.equipment.co2 = { spec: CO2_KITS.diy, on: true }), `裝上${CO2_KITS.diy.name}`)),
      item('檢疫盒', 'quarantine:box', !!game.state.quarantine, () => purchase(ctx, price('quarantine:box'), buyQuarantine, '買了檢疫盒'), '獨立的小缸：新魚先在這裡觀察，發病也不會傳染主缸'),
      h('h3', {}, '底材'),
      h('p.hint', {}, '換底材要拆缸重鋪：底砂裡的細菌和髒污會翻出來，魚也會很緊迫。'),
      ...Object.values(SUBSTRATES).map((sub) =>
        item(sub.name, `substrate:${sub.id}`, (eq.substrate?.spec.id ?? 'sand') === sub.id, () => {
          purchase(ctx, price(`substrate:${sub.id}`), (st) => replaceSubstrate(st, sub), `重新鋪了${sub.name}`, 'warn', true);
        }, SUBSTRATE_NOTES[sub.id]),
      ),
      h('h3', {}, '造景石與沉木'),
      h('p.hint', {}, '有些石頭會慢慢讓水變硬、pH 變高。不確定的話先滴白醋：冒泡就是含碳酸鈣。拿出來的石頭會放回倉庫，不退錢。'),
      ...Object.values(HARDSCAPE).map((x) => {
        const count = (eq.hardscape ?? []).filter((y) => y.id === x.id).length;
        const key = `hardscape:${x.id}`;
        return h(
          'div.item',
          {},
          h('div', {}, h('b', {}, x.name), count > 0 ? h('div.owned', {}, `缸裡有 ${count} 組`) : null, h('div.hint', {}, `一組 ${yuan(price(key))} · ${HARDSCAPE_NOTES[x.id]}`)),
          h(
            'div.row',
            {},
            x.kind === 'rock' ? button('白醋', () => toasts.show(x.fizzes ? `${x.name}冒出小氣泡：含碳酸鈣，會讓水變硬` : `${x.name}沒有反應：不會影響水質`, x.fizzes ? 'warn' : 'info')) : null,
            count > 0 ? button('拿出', () => game.act((st) => removeHardscape(st, x.id))) : null,
            button('買一組', () => purchase(ctx, price(key), (st) => addHardscape(st, x), `放了一組${x.name}`)),
          ),
        );
      }),
      h('h3', {}, '控溫'),
      item(FANS.clip.name, 'fan:clip', !!eq.fan, () => purchase(ctx, price('fan:clip'), (st) => (st.equipment.fan = { spec: FANS.clip, on: true }), `裝上${FANS.clip.name}`), `水溫比室溫低約 ${FANS.clip.coolingC}°C，但水蒸發得快很多`),
      item(CHILLERS.small.name, 'chiller:small', !!eq.chiller, () => purchase(ctx, price('chiller:small'), (st) => (st.equipment.chiller = { spec: CHILLERS.small, targetC: 26, on: true, cooling: false }), `裝上${CHILLERS.small.name}`), '把水溫壓在設定溫度，很耗電'),
      item('控溫器', 'controller:basic', !!eq.controller, () => purchase(ctx, price('controller:basic'), (st) => (st.equipment.controller = { maxC: 30, tripped: false }), '裝上控溫器'), '水溫超過上限就切斷加熱棒，防止卡住的加熱棒把魚煮熟'),
    );
  } else {
    content = sellContent(ctx);
  }
  return h('div.stack', {}, tabs, wallet, content);
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
  const cuttings = economy(s).cuttings;
  const cuttingIds = (Object.keys(cuttings) as PlantSpeciesId[]).filter((id) => (cuttings[id] ?? 0) > 0);
  const sellOne = (id: FishSpeciesId) => () => {
    // 先賣公的，母的留著繁殖
    const pick = [...s.fish.filter((f) => f.species === id && !buybackRefusal(f))].sort((a, b) => (a.sex === b.sex ? 0 : a.sex === 'male' ? -1 : 1))[0];
    if (!pick) return;
    const got = game.act((st) => sellFish(st, pick.id));
    if (got > 0) {
      ctx.sound?.('buy');
      toasts.show(`把 ${fishName(pick)} 賣給水族店，拿到 ${got} 元`);
    } else toasts.show('今天店家不收了，明天再來', 'warn');
    refresh();
  };
  return h(
    'div.stack',
    {},
    h('p.hint', {}, `水族店用店價的三成收健康的成魚和插枝，太小、生病的不收。今天還能賣 ${left} 次。`),
    groups.length === 0 && cuttingIds.length === 0 ? h('p', {}, '目前沒有店家會收的魚或插枝。把仔魚養大、修剪水草就有東西可以賣。') : null,
    ...groups.map((g) =>
      h(
        'div.item',
        {},
        h('div', {}, h('b', {}, FISH_SPECIES[g.id].name), h('div.hint', {}, `可以賣 ${g.fish.length} 隻 · 每隻 ${fishBuybackPrice(g.fish[0])} 元`)),
        button('賣一隻', sellOne(g.id), left > 0 ? '' : ''),
      ),
    ),
    ...cuttingIds.map((id) =>
      h(
        'div.item',
        {},
        h('div', {}, h('b', {}, `${PLANT_SPECIES[id].name}插枝`), h('div.hint', {}, `${cuttings[id]} 株 · 每株 ${plantBuybackPrice(id)} 元`)),
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
      return h(
        'div.item',
        {},
        h(
          'div',
          {},
          h('b', {}, `${fishName(f)}・第 ${Math.floor(days) + 1} 天`),
          symptoms.length ? h('div.warn-text', {}, symptoms.map((x) => SYMPTOM_LABELS[x]).join('、')) : h('div.hint', {}, days >= QUARANTINE_DAYS ? '觀察期滿，看起來很健康' : '還在觀察'),
        ),
        button('移到主缸', () => release([f.id]), days >= QUARANTINE_DAYS && symptoms.length === 0 ? 'primary' : ''),
      );
    }),
    dead > 0 ? h('div.warn-text', {}, `有 ${dead} 條死在檢疫盒裡了。還好沒有放進主缸。`) : null,
    h('h3', {}, '藥浴（只下在檢疫盒）'),
    h('div.row.wrap', {}, bath('ichMedication', '白點藥'), bath('antibiotic', '抗生素'), bath('dewormer', '驅蟲藥')),
    living.length > 0 || dead > 0 ? button(dead > 0 && living.length === 0 ? '撈掉死魚' : '全部移到主缸', () => release()) : null,
  );
}

export function maintenancePanel({ game, sheet, toasts, undoable }: PanelContext): Node {
  const s = game.state;
  const eq = s.equipment;
  const toggle = (label: string, on: boolean, flip: (st: TankState) => void) =>
    h('div.item', {}, h('b', {}, label), button(on ? '開' : '關', () => game.act(flip), on ? 'primary' : ''));
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
    h('h3', {}, '室溫與水位'),
    h(
      'div.item',
      {},
      h('div', {}, h('b', {}, `${seasonName(month)}・室溫約 ${env.roomTempC.toFixed(1)}°C`), h('div.hint', {}, `日夜差 ±${(env.roomSwingC ?? 1.5).toFixed(1)}°C，季節跟著現實日曆走`)),
      h(
        'select.select',
        {
          'aria-label': '地區',
          onchange: (e: Event) => setClimate((st) => (st.environment.region = (e.target as HTMLSelectElement).value as Region)),
        },
        ...(Object.keys(REGION_LABELS) as Region[]).map((r) => h('option', { value: r, selected: (env.region ?? 'north') === r }, REGION_LABELS[r])),
      ),
    ),
    toggle('放在冷氣房（夏天約 26.5°C）', !!env.airConditioned, () => setClimate((st) => (st.environment.airConditioned = !st.environment.airConditioned))),
    h(
      'div.item',
      {},
      h(
        'div',
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
    h(
      'div.item',
      {},
      h(
        'div',
        {},
        h('b', {}, `底材：${eq.substrate?.spec.name ?? '石英砂'}`),
        eq.substrate?.spec.khAbsorb
          ? h(eq.substrate.buffer < 0.15 ? 'div.warn-text' : 'div.hint', {}, `緩衝力剩約 ${Math.round(eq.substrate.buffer * 100)}%${eq.substrate.buffer < 0.15 ? '，KH 會慢慢回升，該換新土了' : ''}`)
          : null,
        (eq.hardscape ?? []).length > 0 ? h('div.hint', {}, `造景：${summarizeHardscape(eq.hardscape ?? [])}`) : null,
      ),
    ),
    h('h3', {}, '設備'),
    eq.heater
      ? h(
          'div.item',
          {},
          h(
            'div',
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
      ? h(
          'div.item',
          {},
          h('b', {}, `燈光 ${eq.light.startHour}:00 起 ${eq.light.photoperiodHours} 小時`),
          h('div.row', {}, button('−', () => game.act((st) => (st.equipment.light!.photoperiodHours = Math.max(0, eq.light!.photoperiodHours - 1)))), button('+', () => game.act((st) => (st.equipment.light!.photoperiodHours = Math.min(16, eq.light!.photoperiodHours + 1))))),
        )
      : null,
    eq.filter ? toggle('過濾器', eq.filter.on, (st) => {
      st.equipment.filter!.on = !st.equipment.filter!.on;
    }) : null,
    eq.airPump ? toggle('打氣機', eq.airPump.on, (st) => {
      st.equipment.airPump!.on = !st.equipment.airPump!.on;
    }) : null,
    eq.co2 ? toggle('CO₂（跟著燈光時程）', eq.co2.on, (st) => {
      st.equipment.co2!.on = !st.equipment.co2!.on;
    }) : null,
    eq.fan ? toggle('降溫風扇', eq.fan.on, (st) => {
      st.equipment.fan!.on = !st.equipment.fan!.on;
    }) : null,
    eq.chiller
      ? h(
          'div.item',
          {},
          h('div', {}, h('b', {}, `冷水機 ${eq.chiller.targetC}°C`), h('div.hint', {}, eq.chiller.on ? (eq.chiller.cooling ? '製冷中' : '待機') : '關閉')),
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
      ? h(
          'div.item',
          {},
          h('div', {}, h('b', {}, `控溫器上限 ${eq.controller.maxC}°C`), eq.controller.tripped ? h('div.warn-text', {}, '水溫過高，已切斷加熱棒電源') : h('div.hint', {}, '超過就切斷加熱棒')),
          h(
            'div.row',
            {},
            button('−', () => game.act((st) => (st.equipment.controller!.maxC = Math.max(24, eq.controller!.maxC - 1)))),
            button('+', () => game.act((st) => (st.equipment.controller!.maxC = Math.min(34, eq.controller!.maxC + 1)))),
          ),
        )
      : null,
    h('h3', {}, '清潔與用藥'),
    h(
      'div.row.wrap',
      {},
      button('用缸水洗濾材', () => {
        doUndoable({ toasts, undoable }, () => game.act((st) => rinseFilterMedia(st, 'tank')), '用換出來的缸水洗了濾材');
      }),
      button('用自來水洗濾材', () => {
        doUndoable({ toasts, undoable }, () => game.act((st) => rinseFilterMedia(st, 'tap')), '用自來水洗了濾材：自來水的氯會殺死硝化菌', 'warn');
      }),
      button(`下白點藥（${price('med:ich')} 元）`, () => {
        purchase({ game, sheet, toasts, undoable }, price('med:ich'), (st) => doseIchMedication(st), '下了一份白點藥（對蝦有毒）', 'warn', true);
      }),
      button(`下抗生素（${price('med:antibiotic')} 元）`, () => {
        purchase({ game, sheet, toasts, undoable }, price('med:antibiotic'), (st) => doseAntibiotic(st), '下了一份抗生素（也會殺掉一些硝化菌）', 'warn', true);
      }),
      button(`下驅蟲藥（${price('med:dewormer')} 元）`, () => {
        purchase({ game, sheet, toasts, undoable }, price('med:dewormer'), (st) => doseDewormer(st), '下了一份驅蟲藥', 'info', true);
      }),
    ),
    s.quarantine
      ? h(
          'div.stack',
          {},
          h('h3', {}, '檢疫盒'),
          h(
            'div.item',
            {},
            h('div', {}, h('b', {}, `檢疫盒裡有 ${s.quarantine.fish.filter((f) => f.alive).length} 條`), h('div.hint', {}, '新魚先觀察，發病了就在盒子裡藥浴')),
            button('查看', () => sheet.open('檢疫盒', () => quarantinePanel({ game, sheet, toasts, undoable }))),
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
      `div.item${i === game.active ? '.current' : ''}`,
      {},
      h(
        'div',
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
    const parts = [`套缸 ${yuan(tankSetPrice(id))}`, slot > 0 ? `缸架 ${yuan(slot)}` : ''].filter(Boolean).join(' + ');
    return h(
      'div.item',
      {},
      h('div', {}, h('b', {}, set.tank.name), h('div.hint', {}, `${set.filter.name}、${set.heater.name}、基本 LED 燈`), h('div.hint', {}, `${parts} = ${yuan(cost)}`)),
      button('買', () => {
        if (refusal) {
          toasts.show(refusal === '錢不夠' ? `錢不夠：要 ${cost} 元，現在有 ${coins} 元` : refusal, 'warn');
          return;
        }
        const tank = game.actAll((tanks) => buyTank(tanks, id));
        if (!tank) return;
        ctx.sound?.('buy');
        game.switchTo(game.tanks.indexOf(tank));
        toasts.show(`架好了新的${set.tank.name}（${yuan(cost)}）。新缸要先養水，硝化菌長起來才能放魚`);
        sheet.close();
      }),
    );
  });
  return h(
    'div.stack',
    {},
    h('p.wallet', {}, `錢包：${yuan(coins)}`),
    ...rows,
    h('h3', {}, '加一缸'),
    h('p.hint', {}, '多一缸可以分開養不同的魚、隔出繁殖缸或種魚專缸。每缸都要各自養水、換水、付電費，缸越多越難顧。大缸水質比較穩，但設備要跟著夠力。'),
    h('p.hint', {}, `原本的櫃子放得下 2 缸，之後每多一缸要加一層缸架；房間最多 6 缸。`),
    ...offers,
  );
}
