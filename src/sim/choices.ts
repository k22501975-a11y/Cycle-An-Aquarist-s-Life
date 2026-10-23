import { DREAM_FISH } from './dream';
import { setHeaterTarget } from './actions';
import { temperatureFactor } from './chemistry';
import { economy, keeperRefusal, MAX_KEEPERS, PRICES, setKeeper, spend } from './economy';
import { FOOD_GRADES, nutritionFactor, type FoodGrade, type FoodKind } from './food';
import { cross, finWords, lookIndex, phenotype, strainName, type GuppyGenome, type GuppyPhenotype } from './genetics';
import { daysToLength, growthStage, maxLengthCm } from './growth';
import { moveFish, newTankCost } from './household';
import { crowdingRatio } from './processes/fauna';
import { isCycled } from './processes/nitrogen';
import { sizeRatio } from './processes/population';
import { CROWD_WARN } from './split';
import { addBottledBacteria, mediaAvailable, transferMedia } from './gifts';
import { guppyTraits } from './lookalike';
import { daysToBirth, releaseNursery, rescueFryToNursery, usesNursery } from './nursery';
import { fulfillOrder, matchingFish, orderBoard, orderRefusal, orderSupply, type ShopOrder } from './orders';
import { previewPair, type PreviewKid } from './pair-preview';
import { FISH_SPECIES, isShrimpSpecies } from './species';
import { ADULT_SIZE, isJuvenile, type Fish, type TankState } from './state';

/**
 * 中期的選擇點（design/midgame.md §1）：第 10～36 天照夢想魚配方，把選育拆成 5 個選擇，
 * 每個選擇是早上報告裡的一張卡（一個早上最多一張），2～3 個選項，下面寫各自的後果。觸發看缸況，不看天數：
 * - C1 第一窩出生：小魚放育幼盒，還是留在主缸躲草
 * - C2 第一窩有 ≥3 尾看得出公母：選種日，挑 1 公 2 母留種
 * - C3 第一窩出生後、錢夠買第二缸（#305）：第二缸當繁殖缸還是展示缸
 * - C4 選種後：留種的母魚配哪一尾公魚（各自附這對生出夢想魚的機率）
 * - C5 訂單會拿走一尾有夢想魚基因、還沒留種的魚（#316 相對門檻，不看金額）：交單拿錢，還是留著當備用種魚
 * - C6 繁殖缸養好了（C3 選繁殖缸之後，#305）：留種的魚、快生的母魚、第一窩小魚搬過去
 * - C7 配好對、種魚還要一陣子才長大（#316）：標準、養快一點（高級飼料＋27～28°C）、活餌
 * - C8 買了第二缸、還沒養水（#316）：分舊缸濾材、倒硝化菌液、自己等
 * 不管選哪個都能玩下去。只出資料和套用選擇；卡片的樣子由畫面負責（選種卡、配對比較卡交美術）。
 */

export type ChoiceId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9';
/** 同一天有好幾張可以出時，照這個順序挑一張（C8 新缸養水排在搬魚 C6 前面）。 */
export const CHOICE_IDS: ChoiceId[] = ['C1', 'C2', 'C3', 'C8', 'C4', 'C5', 'C6', 'C7', 'C9'];

export interface ChoiceOption {
  key: string;
  label: string;
  /** 選了會怎樣（一行）。 */
  outcome: string;
  recommended?: boolean;
}

/** 選種卡（C2）上的一尾魚。 */
export interface PickFish {
  fishId: number;
  tank: number;
  sex: 'male' | 'female';
  /** 品系名。 */
  name: string;
  /** 畫面用的外觀編號（GUPPY_STRAINS 的索引）。 */
  look: number;
  /** 外觀（畫面挑圖用：母魚的尾色、公魚的鰭型、白子）。 */
  pheno: GuppyPhenotype;
  fins: string[];
  /** 看得到的特徵（同 guppyTraits：蛇紋、紅、緞帶、尾型…）。 */
  traits: Array<{ key: string; name: string }>;
  /** 離夢想魚還差什麼（例如「白子（帶隱性）」「蛇紋」）；空的就是夢想魚本身。 */
  missing: string[];
  keeper: boolean;
}

/** 配對比較卡（C4）上的一尾候選公魚。 */
export interface PairCandidate {
  fishId: number;
  tank: number;
  name: string;
  look: number;
  pheno: GuppyPhenotype;
  fins: string[];
  /** 看得到的特徵（同 guppyTraits），比較卡畫小圖示用。 */
  traits: Array<{ key: string; name: string }>;
  /** 尾鰭分數（0–100）。 */
  tail: number;
  /** 這對生出夢想魚（白子紅蛇王公魚）的機率 %（所有小魚裡）。 */
  dreamPct: number;
  /** 這對的小魚兄妹再配，孫代出現夢想魚的機率 %（夢想魚配方要走兩代時看這個）。 */
  grandPct: number;
  /** 這對還要幾天才都長大能配（0 是現在就能配）。 */
  matureDays: number;
  /** 這對最常見的小魚（previewPair 前 3 種）。 */
  kids: PreviewKid[];
}

/** C5：交單還是留著，兩邊的預估。 */
export interface TradeEstimate {
  fishId: number;
  orderId: number;
  /** 交這張單拿多少錢。 */
  coins: number;
  /** 留著的話，最好的一對生出夢想魚的機率 %（小魚或孫代，取高的）。 */
  keepPct: number;
  /** 交掉的話，剩下最好的一對的機率 %。 */
  sellPct: number;
}

export interface ChoiceCard {
  id: ChoiceId;
  /** 第幾缸（主要那缸）。 */
  tank: number;
  title: string;
  /** 阿德老闆說的一句話。 */
  owner: string;
  options: ChoiceOption[];
  /** C2：這窩看得出公母的魚，排成一排挑。 */
  fish?: PickFish[];
  /** C2：最多留幾公幾母。 */
  pickLimit?: { male: number; female: number };
  /** C4：候選公魚。 */
  candidates?: PairCandidate[];
  /** C4：配哪尾母魚。 */
  motherId?: number;
  trade?: TradeEstimate;
  /** C6：要搬去繁殖缸的魚（照搬的順序）。 */
  move?: number[];
}

/** 存在共用錢包上：每張卡上次出現的時間、選了什麼。 */
export interface ChoiceState {
  shown: Partial<Record<ChoiceId, number>>;
  picked: Partial<Record<ChoiceId, string>>;
  /** 第一窩出生的時間（遊戲小時）。 */
  firstBrood?: number;
  /** C4 選定的一對：[母魚, 公魚]。 */
  pair?: [number, number];
  /** C7 選的養法，和選的時間（遊戲小時）：成長里程碑算提前幾天用。 */
  plan?: GrowPlan;
  planHours?: number;
  /** C7 選了養快：每個成長里程碑比標準提前幾天（選的那一刻算的）。 */
  planGain?: Partial<Record<MilestoneStep, number>>;
  /** 成長里程碑：記下的是哪一對（「母-公」），和已經報過的（「魚編號:步驟」）。 */
  milestonePair?: string;
  milestoneSeen?: string[];
  /** C5 問過的訂單（每張只問一次）。選過之後 picked.C5 就是之後同類的單的處理方式（keep 自動標留種）。 */
  tradeAsked?: number[];
  /**
   * C5 這次問的是哪張單、哪尾魚（選的時候照這個做，不重算）。atDelivery：按交貨時問的，選交單只記下來，
   * 交貨由畫面照一般流程做（金幣動畫、補單）；沒選就關掉，下次按交貨會再問。
   */
  trade?: { orderId: number; fishId: number; atDelivery?: boolean };
  /** C7 選之前加熱棒設的溫度：種魚長大能配了，養法收掉、溫度調回來。 */
  planPrevTemp?: number;
  /** C7 的養法已經收掉了（種魚長大）。 */
  planDone?: boolean;
  /** C5 留下來的備用種魚（不含 C2 選的）：自動留最多 BACKUP_MAX 尾。 */
  backups?: number[];
  /**
   * C9 第二窩：哪尾母魚、選的時間（遊戲小時）、那時她第一窩還活著幾尾。
   * 生下來之後記 born（幾尾）和 fry（這窩的編號；選交單的話 C5 不再問這幾尾）。
   */
  secondBrood?: { momId: number; hours: number; prevKids: number; born?: number; fry?: number[] };
}

/** 卡出過、玩家沒選，隔幾天再出一次。 */
export const CHOICE_RESHOW_DAYS = 3;
/** 選種後至少隔幾天才出配對卡（C4）。 */
export const PAIR_AFTER_PICK_DAYS = 2;
/**
 * 第一窩出生滿幾天出選種卡（C2）。模擬裡公母要約 38 天才看得清楚（轉色進度 0.35），等那時候已經過了中期，
 * 所以選種是看早期跡象的預告（企劃 2026-10-22，midgame.md C2）：跟「長得像誰」卡同一天，照基因寫公母和長大後的花色。
 */
export const PICK_AFTER_BROOD_DAYS = 12;
/** 第一窩出生滿幾天、錢又夠，才出第二缸卡（C3）：小魚快長到 1.6 cm 要離開育幼盒，需要地方長大（midgame.md C3）。 */
export const TANK_AFTER_BROOD_DAYS = 6;
/** 種魚至少還要幾天才長大，才出 C7（快長大了就不用問怎麼養）。 */
export const PLAN_MIN_DAYS = 5;
/** C7 養快一點、活餌的水溫（企劃：27～28°C；缸裡有怕熱的就照牠的上限）。 */
export const FAST_TEMP_C = 27.5;
/** C9：第二胎懷孕到多少算「看得出快生了」（肚子圓、胎斑黑；28 天的孕期約剩 8 天，種子 1～3 落在第 26～31 天，跟前後的選擇點隔 ≤ 6 天）。 */
export const SECOND_BROOD_SHOWS = 0.7;
/** C9 選「挑備用種魚」：最多挑幾尾（企劃：2～3 尾）。 */
export const SECOND_BROOD_KEEP = 3;
/** C9 卡上估交單的錢：一尾中魚單的價錢（orders.ts 中魚 40～55 元），一窩約一半長得到能交。 */
const JUVENILE_ORDER_PRICE = 45;
/** C8 倒硝化菌液的價錢（商店的硝化菌液）。 */
const BOTTLE_PRICE = PRICES['care:bacteria'] ?? 30;

export type GrowPlan = 'standard' | 'fast' | 'live';
/** C7 各養法餵的飼料：標準照現在、養快一點是高級薄片、活餌是冷凍紅蟲（專業等級營養最好，但最髒水）。 */
export const GROW_PLAN_FOOD: Record<GrowPlan, { kind: FoodKind; grade: FoodGrade } | null> = {
  standard: null,
  fast: { kind: 'floating', grade: 3 },
  live: { kind: 'meat', grade: 4 },
};

/** 這缸養快的水溫：有加熱棒才調得了，缸裡有怕熱的就照牠的適溫上限。 */
function planTemp(t: TankState, plan: GrowPlan): number {
  const now = t.equipment.heater?.targetC ?? t.water.tempC;
  if (plan === 'standard' || !t.equipment.heater) return now;
  const cap = Math.min(FAST_TEMP_C, ...t.fish.filter((f) => f.alive).map((f) => FISH_SPECIES[f.species].temp.max));
  return Math.max(now, cap);
}

/** 這個養法比照現在快幾倍（成長公式：溫度係數 × 營養係數，其他照現在；不會比現在慢）。 */
function planSpeed(t: TankState, f: Fish, plan: GrowPlan): number {
  const food = GROW_PLAN_FOOD[plan];
  if (!food) return 1;
  const speed = (temperatureFactor(planTemp(t, plan)) / temperatureFactor(planTemp(t, 'standard'))) * (nutritionFactor(FOOD_GRADES[food.grade].nutrition) / nutritionFactor(f.nutrition));
  return Math.max(1, speed);
}

/** 照標準照顧要幾天，換成這個養法要幾天（0 還是 0）。 */
const withPlan = (t: TankState, f: Fish, plan: GrowPlan, std: number) => (std <= 0 || !Number.isFinite(std) ? std : Math.max(1, Math.ceil(std / planSpeed(t, f, plan))));

/** 照這個養法，這尾還要幾天長大能配。標準就是 daysToMature；養快、活餌照水溫和飼料營養等比例縮短。 */
export function planMatureDays(t: TankState, f: Fish, plan: GrowPlan): number {
  return withPlan(t, f, plan, daysToMature(f));
}

/**
 * 種魚的成長里程碑（midgame.md §5.3）：看得出公母（公魚肛鰭變尖、母魚出胎斑）→ 公魚顯色 → 可以配。
 * 倒數只寫到下一個里程碑，所以不會一直是「再約 42 天」。
 */
export type MilestoneStep = 'sex' | 'color' | 'ready';
export const MILESTONE_LABELS: Record<MilestoneStep, string> = { sex: '肛鰭變尖、出現胎斑', color: '公魚顯色', ready: '可以配對' };
/** 肛鰭變尖、出現胎斑：長到成體一半（約出生後 25 天，養快約 19 天；現實 3～4 週看得出胎斑。企劃 2026-10-22）。 */
const SEX_SHOWS = 0.5;
/** 公魚開始顯色：轉色進度約七成（體長是長到頂的 0.68）。 */
const COLOR_SHOWS = 0.68;

/** 這尾到這個里程碑的體長。 */
function milestoneCm(f: Fish, step: MilestoneStep): number {
  if (step === 'ready') return FISH_SPECIES[f.species].adultLengthCm * ADULT_SIZE;
  return maxLengthCm(f) * (step === 'sex' ? SEX_SHOWS : COLOR_SHOWS);
}
const reached = (f: Fish, step: MilestoneStep) => (step === 'ready' ? !isJuvenile(f) : f.lengthCm >= milestoneCm(f, step));

/** 這一對每個里程碑要看哪幾尾：公母都要看得出來、公魚顯色、兩尾都長大。 */
const milestoneFish = (mom: Fish, dad: Fish): Array<[MilestoneStep, Fish[]]> => [
  ['sex', [mom, dad]],
  ['color', [dad]],
  ['ready', [mom, dad]],
];

/** 照現在的養法（C7 選的），這尾還要幾天到這個里程碑。 */
function daysToMilestone(t: TankState, f: Fish, step: MilestoneStep, plan: GrowPlan): number {
  if (reached(f, step)) return 0;
  const std = daysToLength(f, milestoneCm(f, step));
  return withPlan(t, f, plan, Number.isFinite(std) ? std : 99);
}

/** 留種的那一對：[母, 公] 和母魚在哪缸。沒有或有一尾不在了回 null。 */
function pairFish(tanks: TankState[], s: Readonly<ChoiceState>): { mom: Fish; dad: Fish; tank: number } | null {
  if (!s.pair) return null;
  const all = located(tanks);
  const [m, d] = s.pair.map((id) => all.find(({ fish }) => fish.id === id));
  return m && d ? { mom: m.fish, dad: d.fish, tank: m.tank } : null;
}

/** 下一個里程碑和還要幾天；都到了回 null。 */
export function nextMilestone(tanks: TankState[]): { step: MilestoneStep; label: string; days: number } | null {
  const s: Readonly<ChoiceState> = economy(tanks[0]).choices ?? { shown: {}, picked: {} };
  const p = pairFish(tanks, s);
  if (!p) return null;
  const t = tanks[p.tank];
  for (const [step, fish] of milestoneFish(p.mom, p.dad)) {
    const days = Math.max(...fish.map((f) => daysToMilestone(t, f, step, s.plan ?? 'standard')));
    if (days > 0) return { step, label: MILESTONE_LABELS[step], days };
  }
  return null;
}

export interface Milestone {
  step: MilestoneStep;
  fishId: number;
  /** ready：配的那一尾。 */
  partnerId?: number;
  /** C7 選了養快，這個里程碑提前了幾天。 */
  earlierDays?: number;
  text: string;
}

/**
 * 早上報告用：留種的那對這一晚新到的里程碑（每個只報一次）。剛配對時已經到了的不報。
 * 看得出公母是一尾一張；顯色看公魚；可以配要兩尾都長大，一張。
 */
export function takeMilestones(tanks: TankState[]): Milestone[] {
  const s = choiceState(tanks);
  const p = pairFish(tanks, s);
  if (!p) return [];
  const key = `${p.mom.id}-${p.dad.id}`;
  const fresh = s.milestonePair !== key;
  if (fresh) {
    s.milestonePair = key;
    s.milestoneSeen = [];
  }
  const seen = (s.milestoneSeen ??= []);
  const out: Milestone[] = [];
  const name = (f: Fish) => `留種的${f.genome ? strainName(phenotype(f.genome)) : FISH_SPECIES[f.species].name}`;
  const gain = (step: MilestoneStep) => (s.planGain?.[step] ?? 0) > 0 ? s.planGain![step] : undefined;
  const note = (step: MilestoneStep) => (gain(step) ? `（養快提前了 ${gain(step)} 天）` : '');
  const add = (id: string, m: Omit<Milestone, 'earlierDays'>) => {
    if (seen.includes(id)) return;
    seen.push(id);
    if (!fresh) out.push({ ...m, earlierDays: gain(m.step), text: m.text + note(m.step) });
  };
  for (const f of [p.mom, p.dad]) {
    if (reached(f, 'sex')) add(`${f.id}:sex`, { step: 'sex', fishId: f.id, text: f.sex === 'male' ? `${name(f)}肛鰭開始變尖了，是公魚！` : `${name(f)}看得到胎斑了，是母魚！` });
  }
  if (reached(p.dad, 'color')) {
    const traits = p.dad.genome ? guppyTraits(phenotype(p.dad.genome)).filter((x) => !x.key.startsWith('tail:')).map((x) => x.name).join('、') : '';
    add(`${p.dad.id}:color`, { step: 'color', fishId: p.dad.id, text: `${name(p.dad)}開始顯色了${traits ? `，尾巴的${traits}出來了` : ''}` });
  }
  if (reached(p.mom, 'ready') && reached(p.dad, 'ready')) add(`${key}:ready`, { step: 'ready', fishId: p.dad.id, partnerId: p.mom.id, text: `${name(p.dad)}長大了，可以配對了！` });
  return out;
}

/** 遊戲第幾天（跟早上報告的「第 N 天」一樣）。 */
const dayOf = (hours: number) => Math.floor(hours / 24) + 1;

/** C2 一窩最多排幾尾。 */
const PICK_SHOW = 8;
/** 夢想魚機率模擬幾尾小魚（固定種子，同一對每次一樣）。 */
const DREAM_SAMPLES = 400;
/** 孫代機率：模擬幾對兄妹、每對幾尾兒子。 */
const GRAND_PAIRS = 60;
const GRAND_SONS = 8;

export function choiceState(tanks: TankState[]): ChoiceState {
  const e = economy(tanks[0]);
  return (e.choices ??= { shown: {}, picked: {} });
}

const fishIn = (t: TankState) => [...t.fish, ...(t.quarantine?.fish ?? [])].filter((f) => f.alive);
const located = (tanks: TankState[]) => tanks.flatMap((t, tank) => fishIn(t).map((fish) => ({ fish, tank })));
const bred = (f: Fish) => (f.generation ?? 0) >= 1 && !isShrimpSpecies(f.species);
const bredGuppy = (f: Fish) => bred(f) && f.species === 'guppy' && !!f.genome;

/** 這尾是不是夢想魚的樣子（白子紅蛇王，鰭型不管）。 */
export function isDreamLook(g: GuppyGenome): boolean {
  // 外觀編號不分白子（白子的紅眼由畫面另外畫），要另外看
  const p = phenotype(g);
  return p.albino && lookIndex(p) === DREAM_FISH.look;
}

/** 這對生出夢想魚公魚的機率 %（夢想魚的蛇紋在公魚身上，算在所有小魚裡）。 */
export function dreamChance(mother: GuppyGenome, father: GuppyGenome): number {
  const rng = { seed: 97531 };
  let n = 0;
  for (let i = 0; i < DREAM_SAMPLES; i++) if (i % 2 === 0 && isDreamLook(cross(rng, mother, father, 'male'))) n++;
  return Math.round((n / DREAM_SAMPLES) * 1000) / 10;
}

/** 這對的小魚兄妹再配一窩，孫代出現夢想魚公魚的機率 %（夢想魚配方的第 2、3 步；算在所有孫代裡）。 */
export function grandDreamChance(mother: GuppyGenome, father: GuppyGenome): number {
  const rng = { seed: 86420 };
  let n = 0;
  for (let i = 0; i < GRAND_PAIRS; i++) {
    const daughter = cross(rng, mother, father, 'female');
    const son = cross(rng, mother, father, 'male');
    for (let j = 0; j < GRAND_SONS; j++) if (isDreamLook(cross(rng, daughter, son, 'male'))) n++;
  }
  return Math.round((n / (GRAND_PAIRS * GRAND_SONS * 2)) * 1000) / 10;
}

/** 這對離夢想魚最近的那條路：直接生得出來就看小魚，不然看孫代。 */
const pairDream = (m: GuppyGenome, f: GuppyGenome) => Math.max(dreamChance(m, f), grandDreamChance(m, f));

/** 離夢想魚還差什麼：白子、紅、蛇紋（看得到的，加上藏在基因裡的白子）。 */
export function dreamMissing(f: Fish): string[] {
  const p = phenotype(f.genome!);
  const out: string[] = [];
  if (!p.albino) out.push(f.genome!.albino.includes(1) ? '白子（帶隱性）' : '白子');
  if (!p.red) out.push('紅');
  // 母魚身上看不到蛇紋，看牠帶不帶（傳給兒子）
  if (f.sex === 'male' ? !p.snake : !f.genome!.snakeX.includes(1)) out.push('蛇紋');
  if (p.gold || p.tuxedo || p.grass) out.push('不要的花色');
  return out;
}

function pickFish(f: Fish, tank: number): PickFish {
  const p = phenotype(f.genome!);
  return { fishId: f.id, tank, sex: f.sex, name: strainName(p), look: lookIndex(p), pheno: p, fins: finWords(p), traits: guppyTraits(p), missing: dreamMissing(f), keeper: !!f.keeper };
}

/** 記下第一窩出生的時間（有自家繁殖的魚就算，出生時間取最早的）。 */
function noteFirstBrood(tanks: TankState[], s: ChoiceState): void {
  if (s.firstBrood !== undefined) return;
  const born = located(tanks).filter(({ fish }) => bred(fish));
  if (born.length === 0 && !(economy(tanks[0]).raisedGone ?? 0) && !(economy(tanks[0]).raisedEver ?? 0)) return;
  s.firstBrood = Math.min(tanks[0].hours, ...born.map(({ fish }) => fish.bornHours ?? tanks[0].hours));
}

/** 出生滿 PICK_AFTER_BROOD_DAYS 天的自家孔雀魚（C2 的候選）。 */
function youngBred(tanks: TankState[]) {
  const by = tanks[0].hours - PICK_AFTER_BROOD_DAYS * 24;
  return located(tanks).filter(({ fish }) => bredGuppy(fish) && (fish.bornHours ?? -Infinity) <= by);
}

/** 可以當種魚的公魚：留種的、自家長到幼魚以上的，或已經長大的（店裡買的爸爸也算）。 */
const breederMale = (f: Fish) => f.species === 'guppy' && f.sex === 'male' && !!f.genome && !f.listing && (!!f.keeper || (bred(f) && growthStage(f) !== 'fry') || !isJuvenile(f));

/** 這尾還要幾天長大到能配（標準照顧；已經長大是 0）。 */
export function daysToMature(f: Fish): number {
  if (!isJuvenile(f)) return 0;
  const d = daysToLength(f, FISH_SPECIES[f.species].adultLengthCm * ADULT_SIZE);
  return Number.isFinite(d) ? d : 99;
}

/** C4 配哪尾母魚：留種的母魚裡，配得出最高夢想魚機率的那尾（一樣就挑尾鰭好的）。 */
function pairCandidates(tanks: TankState[]): { mother: Fish; tank: number; candidates: PairCandidate[] } | null {
  const all = located(tanks);
  const mothers = all.filter(({ fish }) => fish.keeper && fish.sex === 'female' && fish.species === 'guppy' && fish.genome);
  const males = all.filter(({ fish }) => breederMale(fish));
  if (mothers.length === 0 || males.length === 0) return null;
  let best: { mother: Fish; tank: number; candidates: PairCandidate[] } | null = null;
  for (const m of mothers) {
    const candidates = males
      .map(({ fish, tank }): PairCandidate => {
        const p = phenotype(fish.genome!);
        const g = [m.fish.genome!, fish.genome!] as const;
        return { fishId: fish.id, tank, name: strainName(p), look: lookIndex(p), pheno: p, fins: finWords(p), traits: guppyTraits(p), tail: fish.genome!.tail, dreamPct: dreamChance(...g), grandPct: grandDreamChance(...g), matureDays: Math.max(daysToMature(m.fish), daysToMature(fish)), kids: previewPair(...g, 3, 200) };
      })
      // 機率高的、留種的、尾巴漂亮的排前面；最多 3 尾
      .sort((a, b) => best2(b) - best2(a) || Number(!!keeperOf(tanks, b.fishId)) - Number(!!keeperOf(tanks, a.fishId)) || b.tail - a.tail)
      .slice(0, 3);
    const score = (c: { candidates: PairCandidate[]; mother: Fish }) => best2(c.candidates[0]) * 1000 + c.mother.genome!.tail;
    const here = { mother: m.fish, tank: m.tank, candidates };
    if (!best || score(here) > score(best)) best = here;
  }
  return best;
}

const best2 = (c: PairCandidate) => Math.max(c.dreamPct, c.grandPct);
const keeperOf = (tanks: TankState[], id: number) => located(tanks).find(({ fish }) => fish.id === id)?.fish.keeper;

/** C5 看的單：湊齊了，或只差這幾尾（交單那天就會把現在符合的都拿走）。 */
export const TRADE_SHORT = 2;
/** 選過「留著」之後，自動留的備用種魚最多幾尾（不含 C2 選的；企劃 #316）。 */
export const BACKUP_MAX = 3;

type TradeHit = { order: ShopOrder; fish: Fish; tank: number; keepPct: number; sellPct: number };

/** 有夢想魚要的基因：白子（帶隱性也算）、紅、蛇紋最多差一樣，而且沒有不要的花色。 */
export function hasDreamGenes(f: Fish): boolean {
  if (!f.genome) return false;
  const miss = dreamMissing(f).filter((m) => m !== '白子（帶隱性）');
  return miss.length <= 1 && !miss.includes('不要的花色');
}

/** 這張單交出去會拿走的魚裡，有夢想魚基因、還沒留種的自家孔雀魚（留著的話孫代機率最高的那尾）。 */
function dreamFishInOrder(tanks: TankState[], o: ShopOrder): Omit<TradeHit, 'order'> | null {
  // 交單時會拿走的那幾尾（跟 fulfillOrder 同樣從每一缸照順序挑）
  let left = o.count;
  const taken = tanks.flatMap((t, tank) => {
    const give = matchingFish(t, o).slice(0, left);
    left -= give.length;
    return give.map((fish) => ({ fish, tank }));
  });
  // C9 選了交單的第二窩：照玩家選的交，不再問
  const sold = economy(tanks[0]).choices?.secondBrood?.fry ?? [];
  let best: Omit<TradeHit, 'order'> | null = null;
  for (const hit of taken) {
    if (!bredGuppy(hit.fish) || hit.fish.keeper || sold.includes(hit.fish.id) || !hasDreamGenes(hit.fish)) continue;
    const keepPct = bestDreamPct(tanks, undefined, hit.fish.id);
    if (best && keepPct <= best.keepPct) continue;
    best = { ...hit, keepPct, sellPct: bestDreamPct(tanks, hit.fish.id) };
  }
  return best;
}

/**
 * C5（#316 相對門檻，不看金額）：魚單（湊齊了，或只差 TRADE_SHORT 尾以內）會拿走一尾有夢想魚基因、還沒留種的自家孔雀魚。
 * skip 是問過的單。
 */
function tradeDilemma(tanks: TankState[], skip: readonly number[] = []): TradeHit | null {
  for (const o of orderBoard(tanks[0]).orders) {
    if (o.kind !== 'fish' || o.preview || o.late || skip.includes(o.id)) continue;
    const supply = orderSupply(tanks, o);
    if (supply === 0 || supply + TRADE_SHORT < o.count) continue;
    const hit = dreamFishInOrder(tanks, o);
    if (hit) return { order: o, ...hit };
  }
  return null;
}

/**
 * 按「交貨」那一刻（#318 架構：交單多半在湊齊當下就交掉，早上報告看不到）：
 * 這張單會拿走有夢想魚基因、還沒留種的魚，而且還沒問過 C5，就回傳 C5 卡（記下問過），畫面先問再交。
 * 選過「留著」的：自動留下那尾（最多 BACKUP_MAX 尾）再照常交；選過「交單」的：照常交。都回 null。
 */
export function tradeCheck(tanks: TankState[], orderId: number): ChoiceCard | null {
  const s = choiceState(tanks);
  const o = orderBoard(tanks[0]).orders.find((x) => x.id === orderId);
  if (!o || o.kind !== 'fish' || o.preview) return null;
  const hit = dreamFishInOrder(tanks, o);
  if (!hit) return null;
  if (s.picked.C5) {
    if (s.picked.C5 === 'keep' && backupCount(tanks, s) < BACKUP_MAX) {
      const refused = setKeeper(tanks[hit.tank], hit.fish.id, true);
      if (!refused) (s.backups ??= []).push(hit.fish.id);
    }
    return null;
  }
  if ((s.tradeAsked ??= []).includes(o.id)) return null;
  const card = tradeCard({ order: o, ...hit });
  // 選了才記成問過：沒選就關掉，下次按交貨再問
  s.trade = { orderId: o.id, fishId: hit.fish.id, atDelivery: true };
  s.shown.C5 = tanks[0].hours;
  return card;
}

/** C5 的卡片內容。 */
function tradeCard(d: TradeHit): ChoiceCard {
  const { keepPct, sellPct } = d;
  const coins = d.order.unitPrice * d.order.count;
  return {
    id: 'C5',
    tank: d.tank,
    title: '要交出這尾嗎？',
    owner: `${callName(d.fish)}身上有夢想魚要的基因，交了就少一尾備用種魚。`,
    options: [
      { key: 'sell', label: '交單', outcome: `拿 ${coins} 元；孫代機率維持約 ${sellPct}%` },
      { key: 'keep', label: '留著當備用種魚', outcome: `不拿錢；孫代機率約 ${keepPct}%`, recommended: true },
    ],
    trade: { fishId: d.fish.id, orderId: d.order.id, coins, keepPct, sellPct },
  };
}

/** 訂單卡上的小字：選過「交單」之後，這張單會拿走有夢想魚基因的魚就提醒一句（企劃 #316）。 */
export function orderDreamNote(tanks: TankState[], o: ShopOrder): string | null {
  const s = economy(tanks[0]).choices;
  if (s?.picked.C5 !== 'sell' || o.kind !== 'fish' || o.preview) return null;
  return dreamFishInOrder(tanks, o) ? '有夢想魚基因' : null;
}

/** 還活著、還留著的備用種魚有幾尾。 */
function backupCount(tanks: TankState[], s: ChoiceState): number {
  const all = located(tanks);
  return (s.backups ?? []).filter((id) => all.some(({ fish }) => fish.id === id && fish.keeper)).length;
}

/** 最好的一對生出夢想魚的機率 %：without 這尾不算，asKeeper 這尾當成留種的算。 */
function bestDreamPct(tanks: TankState[], without?: number, asKeeper?: number): number {
  const all = located(tanks).filter(({ fish }) => fish.id !== without);
  const moms = all.filter(({ fish }) => fish.sex === 'female' && (fish.keeper || fish.id === asKeeper) && fish.species === 'guppy' && fish.genome);
  const dads = all.filter(({ fish }) => breederMale(fish));
  let best = 0;
  for (const m of moms) for (const d of dads) best = Math.max(best, pairDream(m.fish.genome!, d.fish.genome!));
  return best;
}

/**
 * C6：繁殖缸和要搬過去的魚。順序：留種的魚、快生的母魚、自家的小魚（育幼盒裡的不動，盒子自己會放）。
 * 搬到繁殖缸快養滿為止（擁擠度 CROWD_WARN，跟分缸提示一樣）。沒有繁殖缸、沒魚要搬就回 null。
 * 新買的繁殖缸是空的，沒有氨就養不出菌：搬之前先分主缸一半的濾材過去（transferMedia），跟現實一樣。
 */
function breedingMove(tanks: TankState[]): { to: number; fish: { fish: Fish; tank: number }[]; left: number } | null {
  const to = tanks.findIndex((t) => t.purpose === 'breeding');
  if (to < 0) return null;
  // 搬到「快養滿了」為止（跟分缸提示同一把尺：每公升幾公分魚，小魚算得少）
  let room = CROWD_WARN * tanks[to].equipment.tank.volumeL - crowdingRatio(tanks[to]) * tanks[to].equipment.tank.volumeL;
  // 育幼盒裡留種的、自家的小魚也搬（繁殖缸就是讓牠們長大的地方，#322）
  const movable = (f: Fish) => f.alive && !f.listing && f.species === 'guppy' && (!f.nursery || f.keeper || (bred(f) && isJuvenile(f)));
  const others = tanks.flatMap((t, tank) => (tank === to || t.purpose === 'breeding' ? [] : t.fish.filter(movable).map((fish) => ({ fish, tank }))));
  const rank = (f: Fish) => (f.keeper ? 0 : f.sex === 'female' && f.pregnancy > 0.5 ? 1 : bred(f) && isJuvenile(f) ? 2 : 3);
  let fish = others
    .filter(({ fish }) => rank(fish) < 3)
    .sort((a, b) => rank(a.fish) - rank(b.fish))
    .filter(({ fish }) => {
      const cm = fish.lengthCm * sizeRatio(fish);
      if (cm > room) return false;
      room -= cm;
      return true;
    });
  // 大魚會吃嘴巴塞得下的小魚：繁殖缸是讓小魚長大的，有小魚要搬或已經在裡面，就不把吃得下牠們的快生母魚搬過去
  const dest = tanks[to].fish.filter((f) => f.alive);
  const smallest = Math.min(...[...dest, ...fish.map(({ fish }) => fish)].filter(isJuvenile).map((f) => f.lengthCm));
  fish = fish.filter(({ fish }) => fish.keeper || isJuvenile(fish) || mouthCm(fish) < smallest);
  // 盒裡的小魚：繁殖缸裡（或一起搬過去的）大魚吃得下就先留在盒裡
  const mouth = Math.max(0, ...[...dest, ...fish.map(({ fish }) => fish)].filter((f) => !isJuvenile(f)).map(mouthCm));
  fish = fish.filter(({ fish }) => !fish.nursery || fish.lengthCm > mouth);
  // 主缸是每天看的展示缸：留種的照搬，其他的搬到主缸剩 MAIN_KEEP_FISH 尾為止（#325）
  const left = tanks.map((t) => t.fish.filter((f) => f.alive).length - fish.filter(({ fish, tank }) => fish.keeper && tanks[tank] === t).length);
  fish = fish.filter(({ fish, tank }) => {
    if (fish.keeper) return true;
    if (left[tank] <= MAIN_KEEP_FISH) return false;
    left[tank]--;
    return true;
  });
  return fish.length > 0 ? { to, fish, left: Math.min(...fish.map(({ tank }) => left[tank])) } : null;
}

/** C6 搬魚後主缸至少留幾尾（留種的不算在限制內，照搬）。 */
export const MAIN_KEEP_FISH = 6;

/** 這尾魚嘴巴吞得下多長的魚。 */
const mouthCm = (f: Fish) => f.lengthCm * FISH_SPECIES[f.species].mouthRatio;

/**
 * 選過搬過去之後，又有留種的魚、或 3 尾以上自家小魚在繁殖缸外面（之後才留的種、育幼盒放出來的），
 * 再問一次要不要搬（#322）。
 */
function moveAgain(tanks: TankState[], s: ChoiceState): boolean {
  if (s.picked.C6 !== 'move') return false;
  const m = breedingMove(tanks);
  return !!m && (m.fish.some(({ fish }) => fish.keeper) || m.fish.filter(({ fish }) => bred(fish) && isJuvenile(fish)).length >= 3);
}

/** 這張卡現在該不該出、出的話卡片資料（不記錄）。 */
function cardFor(id: ChoiceId, tanks: TankState[], s: ChoiceState, skipOrders: readonly number[] = []): ChoiceCard | null {
  const home = tanks[0];
  switch (id) {
    case 'C1': {
      if (s.firstBrood === undefined) return null;
      const fry = located(tanks).filter(({ fish }) => bred(fish) && growthStage(fish) === 'fry' && usesNursery(fish.species));
      if (fry.length === 0) return null;
      const boxed = fry.every(({ fish }) => fish.nursery);
      return {
        id,
        tank: fry[0].tank,
        title: '第一窩小魚出生了！要怎麼保護？',
        owner: boxed ? '小魚生在育幼盒裡。要養在盒裡等長大，還是放出去躲草、把盒子空出來？' : '小魚一出生，大魚就會追著吃。要撈進育幼盒，還是讓牠們自己躲在草裡？',
        options: [
          { key: 'box', label: boxed ? '養在育幼盒' : '撈進育幼盒', outcome: '幾乎都活得下來，長到 1.6 cm 自己放出來', recommended: true },
          { key: 'hide', label: boxed ? '放出去躲草' : '留在主缸躲草', outcome: '盒子空出來給下一胎，但會被吃掉一部分；草越密活越多' },
        ],
      };
    }
    case 'C2': {
      if (s.firstBrood === undefined || home.hours - s.firstBrood < PICK_AFTER_BROOD_DAYS * 24) return null;
      const young = youngBred(tanks);
      if (young.length < 3) return null;
      if (!young.some(({ fish }) => fish.sex === 'male') || !young.some(({ fish }) => fish.sex === 'female')) return null;
      // 離夢想魚越近的排前面，一樣近的挑大的
      const rank = (f: Fish) => dreamMissing(f).length * 10 - f.lengthCm;
      const sorted = young.sort((a, b) => rank(a.fish) - rank(b.fish));
      // 公母各排一半，不會整排都是公魚
      const half = (sex: 'male' | 'female') => sorted.filter(({ fish }) => fish.sex === sex).slice(0, PICK_SHOW / 2);
      const fish = [...half('male'), ...half('female')].map(({ fish, tank }) => pickFish(fish, tank));
      return {
        id,
        tank: fish[0].tank,
        title: '選種日：挑 1 公 2 母留種',
        owner: '第一窩開始看得出樣子了：公魚的肛鰭變尖，母魚看得到胎斑。挑幾尾留下來當種魚，訂單和收購就不會把牠們拿走。',
        options: [
          { key: 'pick', label: '留這幾尾', outcome: '留種的魚不會被訂單或收購拿走，下一步配一窩', recommended: true },
          { key: 'later', label: '先不挑', outcome: '之後在魚卡上也能標留種，夢想魚慢一點' },
        ],
        fish,
        pickLimit: { male: 1, female: 2 },
      };
    }
    case 'C3': {
      if (s.firstBrood === undefined || tanks.length >= 2 || home.hours - s.firstBrood < TANK_AFTER_BROOD_DAYS * 24) return null;
      const cost = newTankCost(tanks, 'nano20');
      if (economy(home).coins < cost) return null;
      return {
        id,
        tank: 0,
        title: '錢夠買第二個缸了！要拿來做什麼？',
        owner: `小魚快長大了，20L 套缸 ${cost} 元，你現在買得起。第二缸怎麼用，看你想先追什麼。`,
        options: [
          { key: 'breeding', label: '繁殖缸', outcome: '小魚先搬過去長大，之後放留種的那對，不會跟主缸的魚亂配；夢想魚走得最快', recommended: true },
          { key: 'display', label: '展示缸', outcome: '種陽性草做造景；夢想魚慢一點' },
        ],
      };
    }
    case 'C4': {
      const picked = s.picked.C2 === 'pick' ? s.shown.C2 : undefined;
      if (picked === undefined || home.hours - picked < PAIR_AFTER_PICK_DAYS * 24) return null;
      const pc = pairCandidates(tanks);
      if (!pc) return null;
      const top = pc.candidates[0];
      const wait = top.matureDays > 0 ? `牠們再約 ${top.matureDays} 天長大就會配。` : '';
      const odds = (c: PairCandidate) => (c.dreamPct > 0 ? `小魚約 ${c.dreamPct}% 是${DREAM_FISH.name}` : c.grandPct > 0 ? `孫代約 ${c.grandPct}% 是${DREAM_FISH.name}` : `看不到${DREAM_FISH.name}`);
      return {
        id,
        tank: pc.tank,
        title: '留種的母魚，要配哪一尾？',
        owner: best2(top) > 0 ? `配 ${top.name} 的話，${odds(top)}。也可以挑尾巴漂亮的。${wait}` : `這幾尾配出來還看不到夢想魚，先挑尾巴漂亮的，下一代再往夢想魚走。${wait}`,
        options: pc.candidates.map((c, i) => ({ key: String(c.fishId), label: c.name, outcome: `${odds(c)}，尾鰭 ${c.tail} 分`, recommended: i === 0 })),
        candidates: pc.candidates,
        motherId: pc.mother.id,
      };
    }
    case 'C5': {
      const d = tradeDilemma(tanks, skipOrders);
      return d ? tradeCard(d) : null;
    }
    case 'C6': {
      // 選種（C2）之前先不問：不然搬過去的只有零星幾尾，留種的魚之後都留在主缸（#322）。
      // 一直挑不出種（沒有公母）的話，等選種卡出過兩輪還沒選就照樣問
      const waitPick = !s.picked.C2 && !located(tanks).some(({ fish }) => fish.keeper);
      if (waitPick && (s.firstBrood === undefined || home.hours - s.firstBrood < (PICK_AFTER_BROOD_DAYS + 2 * CHOICE_RESHOW_DAYS) * 24)) return null;
      const m = breedingMove(tanks);
      if (!m) return null;
      // C8 選了倒菌液或自己等：等繁殖缸養好才問要不要搬（不然搬魚又會自己分濾材，跟玩家選的不一樣）
      if (!isCycled(tanks[m.to]) && s.picked.C8 && s.picked.C8 !== 'media') return null;
      const keepers = m.fish.filter(({ fish }) => fish.keeper).length;
      const moms = m.fish.filter(({ fish }) => !fish.keeper && fish.pregnancy > 0.5).length;
      const young = m.fish.length - keepers - moms;
      const cycled = isCycled(tanks[m.to]);
      const what = [keepers ? `留種的魚 ${keepers} 尾` : '', moms ? `快生的母魚 ${moms} 尾` : '', young ? `小魚 ${young} 尾` : ''].filter(Boolean).join('、');
      return {
        id,
        tank: m.to,
        title: s.picked.C6 ? '還有魚可以搬去繁殖缸，要搬嗎？' : '繁殖缸可以用了！把魚搬過去嗎？',
        owner: `${s.picked.C6 ? '' : cycled ? '繁殖缸的水養好了。' : '繁殖缸擺好了。先分主缸一半的濾材過去，菌就跟著過去，不用從頭養水。'}${what}搬過去，小魚不會被大魚吃，留種的也不會跟主缸的魚亂配。`,
        options: [
          { key: 'move', label: '搬過去', outcome: `${cycled ? '' : '分一半濾材、'}${what}搬到繁殖缸，主缸還有 ${m.left} 尾`, recommended: true },
          { key: 'stay', label: '先不要', outcome: '之後在魚卡上也能一尾一尾搬' },
        ],
        move: m.fish.map(({ fish }) => fish.id),
      };
    }
    case 'C7': {
      if (!s.pair || s.shown.C4 === undefined || home.hours - s.shown.C4 < 24) return null;
      const all = located(tanks);
      const pair = s.pair.map((id) => all.find(({ fish }) => fish.id === id));
      if (!pair[0] || !pair[1]) return null;
      const t = tanks[pair[0].tank];
      const days = (plan: GrowPlan) => Math.max(...pair.map((p) => planMatureDays(t, p!.fish, plan)));
      if (days('standard') < PLAN_MIN_DAYS) return null;
      const on = (plan: GrowPlan) => `約第 ${dayOf(home.hours + days(plan) * 24)} 天`;
      const temp = planTemp(t, 'fast');
      return {
        id,
        tank: pair[0].tank,
        title: '種魚要怎麼養大？',
        owner: '吃得好、水溫高一點，長得就快，但要多照顧。',
        options: [
          { key: 'standard', label: '標準', outcome: `照現在，${on('standard')}可以配` },
          { key: 'fast', label: '養快一點', outcome: `高級飼料${temp > planTemp(t, 'standard') ? `、水溫 ${Math.round(temp * 10) / 10}°C` : ''}，${on('fast')}；飼料錢多一點，水質要多注意`, recommended: true },
          { key: 'live', label: '活餌', outcome: `冷凍紅蟲，${on('live')}；最快但最髒水，要多換水` },
        ],
      };
    }
    case 'C8': {
      const to = tanks.findIndex((t, i) => i > 0 && !!t.equipment.filter && !isCycled(t) && fishIn(t).length === 0);
      if (to < 0) return null;
      const media = tanks.some((t, i) => i !== to && mediaAvailable(t) > 0);
      return {
        id,
        tank: to,
        title: '新缸要怎麼養水？',
        owner: '新缸還沒有硝化菌，直接放魚會冒氨。',
        options: [
          ...(media ? [{ key: 'media', label: '分舊缸濾材', outcome: '約 2 天；主缸的菌會少一點，這幾天多測水', recommended: true }] : []),
          { key: 'bottle', label: '硝化菌液', outcome: `${BOTTLE_PRICE} 元，約 3 天`, recommended: !media },
          { key: 'wait', label: '自己等', outcome: '不花錢，3～7 天' },
        ],
      };
    }
    case 'C9': {
      if (s.firstBrood === undefined) return null;
      const mom = secondBroodMom(tanks);
      if (!mom) return null;
      const coins = Math.round((FISH_SPECIES[mom.fish.species].breeding!.broodMean * mom.fish.health * 0.5 * JUVENILE_ORDER_PRICE) / 10) * 10;
      return {
        id,
        tank: mom.tank,
        title: '第二窩快生了，要怎麼辦？',
        owner: `${callName(mom.fish)}的肚子又圓了，黑點也出來了。生下來之後照你選的處理。`,
        options: [
          { key: 'grow', label: '留在繁殖缸長大', outcome: '整窩留著長大，之後再看要留哪幾尾' },
          { key: 'sell', label: '交小魚單', outcome: `長到能交就照訂單交，約 ${coins} 元；有夢想魚基因的也不再問` },
          { key: 'keep', label: `挑 2～${SECOND_BROOD_KEEP} 尾當備用種魚`, outcome: '一生下來就挑離夢想魚最近的標留種，萬一種魚出事還有備用', recommended: true },
        ],
        motherId: mom.fish.id,
      };
    }
  }
}

/** C9：已經生過一窩、這一胎又快生了的孔雀魚母魚（肚子最大的那尾）。 */
function secondBroodMom(tanks: TankState[]): { fish: Fish; tank: number } | null {
  const all = located(tanks);
  const moms = all.filter(({ fish }) => fish.species === 'guppy' && fish.sex === 'female' && fish.pregnancy >= SECOND_BROOD_SHOWS && all.some((k) => k.fish.motherId === fish.id));
  return moms.sort((a, b) => b.fish.pregnancy - a.fish.pregnancy)[0] ?? null;
}

/** C9 第二窩生了的報告（早上報告的比較卡用）。 */
export interface SecondBroodNews {
  momId: number;
  /** 這窩生了幾尾。 */
  count: number;
  /** 第一窩現在還有幾尾。 */
  prevKids: number;
  /** 選「挑備用種魚」實際標了幾尾。 */
  kept: number;
  choice: string;
  text: string;
}

/**
 * 早上報告用：C9 那尾母魚生了，就照玩家選的處理這窩，回傳一次報告（之後回 null）。
 * 挑備用種魚：有夢想魚基因的先挑（母魚照留著時孫代機率排），最多 SECOND_BROOD_KEEP 尾。
 */
export function takeSecondBrood(tanks: TankState[]): SecondBroodNews | null {
  const s = choiceState(tanks);
  const sb = s.secondBrood;
  if (!sb || sb.born !== undefined) return null;
  const fry = located(tanks).filter(({ fish }) => fish.motherId === sb.momId && (fish.bornHours ?? -Infinity) >= sb.hours);
  if (fry.length === 0) return null;
  sb.born = fry.length;
  const choice = s.picked.C9 ?? 'grow';
  let kept = 0;
  let full = false;
  if (choice === 'sell') sb.fry = fry.map(({ fish }) => fish.id);
  if (choice === 'keep') {
    const rank = (f: Fish) => (hasDreamGenes(f) ? 0 : 100) + dreamMissing(f).length * 10 - (f.sex === 'female' ? bestDreamPct(tanks, undefined, f.id) / 10 : 0);
    for (const { fish, tank } of fry.filter(({ fish }) => fish.genome).sort((a, b) => rank(a.fish) - rank(b.fish))) {
      if (kept >= SECOND_BROOD_KEEP) break;
      const why = setKeeper(tanks[tank], fish.id, true);
      if (why) {
        // 留種名額滿了就不用再試；其他原因（例如上架中）換下一尾
        if (located(tanks).filter((x) => x.fish.keeper).length >= MAX_KEEPERS) {
          full = true;
          break;
        }
        continue;
      }
      (s.backups ??= []).push(fish.id);
      kept++;
    }
  }
  const mom = located(tanks).find(({ fish }) => fish.id === sb.momId)?.fish;
  const who = mom ? callName(mom) : '母魚';
  const then = choice === 'sell' ? '長到能交就照訂單交。' : choice === 'keep' ? (full && kept === 0 ? `留種名額滿了（最多 ${MAX_KEEPERS} 尾），先取消幾尾才挑得了。` : kept > 0 ? `挑了 ${kept} 尾離夢想魚最近的當備用種魚。` : '這窩還挑不到能留的，先讓牠們長大。') : '整窩留著長大。';
  return { momId: sb.momId, count: fry.length, prevKids: sb.prevKids, kept, choice, text: `${who}的第二窩生了 ${fry.length} 尾（第一窩現在還有 ${sb.prevKids} 尾）。${then}` };
}

/**
 * C7 的養法只管到種魚長大：兩尾都能配了（或有一尾不在了），收掉這缸的養法飼料、加熱棒調回選之前的溫度。
 * 玩家自己在餵食面板換飼料的話，畫面那邊就先收掉 feedPlan 了。
 */
function endGrowPlan(tanks: TankState[], s: ChoiceState): void {
  if (!s.plan || s.planDone || !s.pair) return;
  const all = located(tanks);
  const pair = s.pair.map((id) => all.find(({ fish }) => fish.id === id));
  const grown = pair.every((p) => p && !isJuvenile(p.fish));
  const gone = pair.some((p) => !p);
  if (!grown && !gone) return;
  s.planDone = true;
  for (const t of tanks) delete t.feedPlan;
  const t = tanks[pair.find((p) => p)?.tank ?? 0];
  if (t.equipment.heater && s.planPrevTemp !== undefined) setHeaterTarget(t, s.planPrevTemp);
}

/** 已經不用問的卡（例如已經有第二缸）直接記成選過，不再出。 */
function settleImplicit(tanks: TankState[], s: ChoiceState): void {
  if (!s.picked.C3 && tanks.length >= 2) s.picked.C3 = tanks[1].purpose ?? 'had';
  // 小魚都長大了還沒選：不用再問怎麼保護
  if (!s.picked.C1 && s.shown.C1 !== undefined && !cardFor('C1', tanks, s)) s.picked.C1 = 'grown';
}

/**
 * 早上報告用：拿今天要出的那張卡並記下出現時間。一個早上最多一張：還沒出過的優先，
 * 出過沒選的隔 CHOICE_RESHOW_DAYS 天再出一次。C5 每張訂單只問一次。
 */
export function takeChoice(tanks: TankState[]): ChoiceCard | null {
  const s = choiceState(tanks);
  noteFirstBrood(tanks, s);
  settleImplicit(tanks, s);
  endGrowPlan(tanks, s);
  const now = tanks[0].hours;
  // 同一個遊戲天最多一張（#316）：同一天又過一晚、或別的地方再拿一次，都不再出第二張
  const today = Math.floor(now / 24);
  if (Object.values(s.shown).some((h) => h !== undefined && Math.floor(h / 24) === today)) return null;
  for (const id of CHOICE_IDS) {
    if (id !== 'C5' && s.picked[id] && !(id === 'C6' && moveAgain(tanks, s))) continue;
    const asked = (s.tradeAsked ??= []);
    const card = cardFor(id, tanks, s, id === 'C5' && !s.picked.C5 ? asked : []);
    if (!card) continue;
    if (id === 'C5') {
      // 選過一次之後，同類的單照上次的選擇，不再問：留著的話自動標留種（魚卡上看得到緞帶），最多 BACKUP_MAX 尾；
      // 交單的話照常交，訂單卡上會寫「有夢想魚基因」
      if (s.picked.C5) {
        if (s.picked.C5 === 'keep' && backupCount(tanks, s) < BACKUP_MAX) {
          const hit = located(tanks).find(({ fish }) => fish.id === card.trade!.fishId)!;
          const refused = setKeeper(tanks[hit.tank], hit.fish.id, true);
          if (!refused) (s.backups ??= []).push(hit.fish.id);
        }
        continue;
      }
      asked.push(card.trade!.orderId);
      s.trade = { orderId: card.trade!.orderId, fishId: card.trade!.fishId };
    } else {
      const last = s.shown[id];
      if (last !== undefined && now - last < CHOICE_RESHOW_DAYS * 24) continue;
    }
    s.shown[id] = now;
    return card;
  }
  return null;
}

/**
 * 玩家選了一個選項。picks 是 C2 要留種的魚。回傳不能套用的原因；成功回傳 null。
 * C1 選育幼盒、C3 選用途後，畫面再帶玩家去放育幼盒、買缸（這裡只記下來）。
 */
export function chooseOption(tanks: TankState[], id: ChoiceId, key: string, picks: readonly number[] = []): string | null {
  const s = choiceState(tanks);
  const find = (fid: number) => located(tanks).find(({ fish }) => fish.id === fid);
  switch (id) {
    case 'C1': {
      // 撈進盒子（盒子在的缸）；放出去躲草就把盒裡的小魚放回主缸。沒有盒子的，畫面帶去育幼盒那裡買
      for (const t of tanks) {
        const fry = t.fish.filter((f) => f.alive && bred(f) && growthStage(f) === 'fry');
        if (key === 'box' && t.nurseryBox) rescueFryToNursery(t, fry.filter((f) => !f.nursery));
        if (key === 'hide') releaseNursery(t, fry.filter((f) => f.nursery).map((f) => f.id));
      }
      break;
    }
    case 'C2': {
      if (key === 'pick') {
        const chosen = picks.map(find).filter((x) => !!x);
        if (chosen.length === 0) return '先點幾尾要留種的魚';
        if (chosen.filter((x) => x.fish.sex === 'male').length > 1 || chosen.filter((x) => x.fish.sex === 'female').length > 2) return '最多留 1 公 2 母';
        // 先全部檢查再一起標：中途被拒不會留下標了一半的魚
        for (const { fish, tank } of chosen) {
          const why = keeperRefusal(tanks[tank], fish);
          if (why) return why;
        }
        const have = located(tanks).filter(({ fish }) => fish.keeper).length;
        if (have + chosen.filter(({ fish }) => !fish.keeper).length > MAX_KEEPERS) return `最多留 ${MAX_KEEPERS} 尾種魚，先取消幾尾`;
        for (const { fish, tank } of chosen) setKeeper(tanks[tank], fish.id, true);
      }
      break;
    }
    case 'C4': {
      const male = find(Number(key));
      if (!male || male.fish.sex !== 'male') return '這尾公魚不在了';
      const momId = cardFor('C4', tanks, s)?.motherId;
      const mom = momId !== undefined ? find(momId) : undefined;
      if (!mom) return '留種的母魚不在了';
      const why = setKeeper(tanks[male.tank], male.fish.id, true);
      if (why) return why;
      // 公魚搬到母魚那缸（配對要在同一缸）
      if (male.tank !== mom.tank) moveFish(tanks[male.tank], tanks[mom.tank], male.fish.id);
      s.pair = [mom.fish.id, male.fish.id];
      break;
    }
    case 'C5': {
      // 照卡片問的那張單、那尾魚
      if (!s.trade) return '這張單已經不在了';
      const hit = find(s.trade.fishId);
      if (!hit) return '這尾魚不在了';
      if (key === 'keep') {
        const why = setKeeper(tanks[hit.tank], hit.fish.id, true);
        if (why) return why;
        (s.backups ??= []).push(hit.fish.id);
      } else if (!s.trade.atDelivery && !orderRefusal(tanks, s.trade.orderId)) fulfillOrder(tanks, s.trade.orderId);
      // 還湊不齊的單：選交單就是「這尾可以交」，湊齊了照常按交貨；按交貨時問的，交貨由畫面接著做
      const asked = (s.tradeAsked ??= []);
      if (!asked.includes(s.trade.orderId)) asked.push(s.trade.orderId);
      break;
    }
    case 'C7': {
      const plan = key as GrowPlan;
      if (!(plan in GROW_PLAN_FOOD)) return '沒有這個養法';
      const mom = s.pair && find(s.pair[0]);
      if (!mom) return '留種的那對不在了';
      const t = tanks[mom.tank];
      const food = GROW_PLAN_FOOD[plan];
      if (food) t.feedPlan = { ...food };
      else delete t.feedPlan;
      if (t.equipment.heater) {
        s.planPrevTemp ??= t.equipment.heater.targetC;
        setHeaterTarget(t, planTemp(t, plan));
      }
      s.plan = plan;
      s.planHours = tanks[0].hours;
      // 每個里程碑比標準提前幾天（兩尾裡慢的那尾決定）
      const dad = find(s.pair![1]);
      s.planGain = {};
      if (dad) {
        for (const [step, fish] of milestoneFish(mom.fish, dad.fish)) {
          const days = (p: GrowPlan) => Math.max(...fish.map((f) => daysToMilestone(t, f, step, p)));
          s.planGain[step] = Math.max(0, days('standard') - days(plan));
        }
      }
      break;
    }
    case 'C8': {
      const card = cardFor('C8', tanks, s);
      if (!card) return '新缸已經養好了';
      const to = tanks[card.tank];
      if (key === 'media') {
        const from = tanks.filter((t) => t !== to).sort((a, b) => mediaAvailable(b) - mediaAvailable(a))[0];
        if (!from || !transferMedia(from, to)) return '舊缸的濾材還不夠成熟';
      } else if (key === 'bottle') {
        if (!spend(tanks[0], BOTTLE_PRICE)) return `錢不夠：硝化菌液要 ${BOTTLE_PRICE} 元`;
        addBottledBacteria(to);
      }
      break;
    }
    case 'C9': {
      if (!['grow', 'sell', 'keep'].includes(key)) return '沒有這個選項';
      const mom = secondBroodMom(tanks);
      if (!mom) return '這一胎已經生了';
      const prevKids = located(tanks).filter(({ fish }) => fish.motherId === mom.fish.id).length;
      s.secondBrood = { momId: mom.fish.id, hours: tanks[0].hours, prevKids };
      break;
    }
    case 'C6': {
      if (key === 'move') {
        const m = breedingMove(tanks);
        if (!m) return '繁殖缸滿了，或沒有要搬的魚';
        const to = tanks[m.to];
        if (!isCycled(to)) {
          // 從最成熟的那缸分濾材
          const from = tanks.filter((t) => t !== to).sort((a, b) => mediaAvailable(b) - mediaAvailable(a))[0];
          if (!from || !transferMedia(from, to)) return '主缸的濾材還不夠成熟，繁殖缸先自己養水';
        }
        for (const { fish, tank } of m.fish) moveFish(tanks[tank], tanks[m.to], fish.id);
      }
      break;
    }
  }
  s.picked[id] = key;
  return null;
}

/** 魚的稱呼：品系加公母（例如「紅蛇王公魚」）。 */
const callName = (f: Fish) => `${f.genome ? strainName(phenotype(f.genome)) : FISH_SPECIES[f.species].name}${f.sex === 'male' ? '公魚' : '母魚'}`;

/**
 * 早上報告的「選育進度」一行（midgame.md §2）：有第一窩或留種的魚就一定出，取代一般的小觀察，讓早上不再只是「安靜的一晚」。
 * - 配好對了：母魚懷孕了沒、還要幾天生；還沒長大就說再幾天能配
 * - 留種了還沒配：留種的公魚長到多大、再幾天成熟
 * - 還沒選種：第一窩長到多大、再幾天可以挑種魚
 * 沒有第一窩、也沒有留種的魚就回 null。
 */
export function breedingProgress(tanks: TankState[]): string | null {
  const s = choiceState(tanks);
  noteFirstBrood(tanks, s);
  const all = located(tanks);
  const now = tanks[0].hours;
  const pair = s.pair && s.pair.map((id) => all.find(({ fish }) => fish.id === id));
  if (pair && pair[0] && pair[1]) {
    const [mom, dad] = pair;
    if (mom.fish.pregnancy > 0.05) {
      const d = Math.max(1, Math.round(daysToBirth(tanks[mom.tank], mom.fish) ?? 1));
      return `留種的${callName(mom.fish)}懷孕了，大約 ${d} 天後生`;
    }
    const next = nextMilestone(tanks);
    if (next) return `留種的那對長到 ${mom.fish.lengthCm.toFixed(1)}、${dad.fish.lengthCm.toFixed(1)} cm，下一步：${next.label}，約 ${next.days} 天`;
    if (mom.tank !== dad.tank) return `留種的${callName(dad.fish)}還不在母魚那缸，搬過去才會配`;
    return `留種的那對都長大了，${callName(dad.fish)}一直追著母魚`;
  }
  const keepers = all.filter(({ fish }) => fish.keeper && fish.species === 'guppy');
  if (keepers.length > 0) {
    const k = keepers.find(({ fish }) => fish.sex === 'male') ?? keepers[0];
    const wait = daysToMature(k.fish);
    return wait > 0 ? `留種的${callName(k.fish)}長到 ${k.fish.lengthCm.toFixed(1)} cm，再約 ${wait} 天成熟可以配` : `留種的${callName(k.fish)}長大了，可以配對了`;
  }
  if (s.firstBrood === undefined) return null;
  const brood = all.filter(({ fish }) => bredGuppy(fish)).sort((a, b) => b.fish.lengthCm - a.fish.lengthCm);
  if (brood.length === 0) return null;
  const big = brood[0].fish;
  const left = Math.ceil(PICK_AFTER_BROOD_DAYS - (now - s.firstBrood) / 24);
  if (left > 0) return `第一窩最大的那尾 ${big.lengthCm.toFixed(1)} cm，再 ${left} 天看得出公母，就能挑種魚`;
  if (!s.picked.C2) return `第一窩最大的那尾 ${big.lengthCm.toFixed(1)} cm，可以挑種魚了`;
  return `第一窩最大的那尾 ${big.lengthCm.toFixed(1)} cm，再約 ${Math.max(1, daysToMature(big))} 天長大`;
}

/**
 * 任務卡的下一步（midgame.md §2 第 1 點）：照現在走到哪個選擇點說，不只是「一天餵兩次」。句子短（任務卡放得下）。
 * 沒有第一窩回傳 null。不改存檔。
 */
export function breedingStep(tanks: TankState[]): string | null {
  const s: Readonly<ChoiceState> = economy(tanks[0]).choices ?? { shown: {}, picked: {} };
  const all = located(tanks);
  const pair = s.pair?.map((id) => all.find(({ fish }) => fish.id === id));
  if (pair?.[0] && pair[1]) {
    const mom = pair[0];
    if (mom.fish.pregnancy > 0.05) return `留種的母魚懷孕了，約 ${Math.max(1, Math.round(daysToBirth(tanks[mom.tank], mom.fish) ?? 1))} 天後生`;
    const next = nextMilestone(tanks);
    return next ? `下一步：${next.label}，約 ${next.days} 天` : '等留種的母魚肚子變圓';
  }
  const keeper = all.find(({ fish }) => fish.keeper && fish.species === 'guppy' && fish.sex === 'male') ?? all.find(({ fish }) => fish.keeper && fish.species === 'guppy');
  if (keeper) {
    const wait = daysToMature(keeper.fish);
    return wait > 0 ? `留種的魚再約 ${wait} 天成熟` : '留種的魚長大了，配一對';
  }
  const brood = all.filter(({ fish }) => bredGuppy(fish));
  const first = s.firstBrood ?? (brood.length ? Math.min(...brood.map(({ fish }) => fish.bornHours ?? tanks[0].hours)) : undefined);
  if (first === undefined || brood.length === 0) return null;
  const left = Math.ceil(PICK_AFTER_BROOD_DAYS - (tanks[0].hours - first) / 24);
  if (left > 0) return `第一窩再 ${left} 天看得出公母`;
  return s.picked.C2 ? null : '第一窩可以挑種魚了';
}
