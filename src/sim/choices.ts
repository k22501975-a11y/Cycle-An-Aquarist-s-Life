import { DREAM_FISH } from './dream';
import { setHeaterTarget } from './actions';
import { temperatureFactor } from './chemistry';
import { buybackRefusal, economy, fishBuybackPrice, keeperRefusal, MAX_KEEPERS, PRICES, sellFish, sellsLeftToday, setKeeper, spend } from './economy';
import { broodFactor, FOOD_GRADES, nutritionFactor, type FoodGrade, type FoodKind } from './food';
import { cross, finWords, lookIndex, matingSuccess, phenotype, strainName, type GuppyGenome, type GuppyPhenotype } from './genetics';
import { tankLock } from './goals';
import { daysToLength, growthStage, maxLengthCm } from './growth';
import { moveFish, newTankCost, tankLabel } from './household';
import { crowdingRatio } from './processes/fauna';
import { isCycled } from './processes/nitrogen';
import { sizeRatio } from './processes/population';
import { CROWD_WARN } from './split';
import { addBottledBacteria, mediaAvailable, transferMedia } from './gifts';
import { guppyTraits } from './lookalike';
import { buyNurseryBox, daysToBirth, moveToNursery, nurseryRefusal, releaseNursery, rescueFryToNursery, usesNursery } from './nursery';
import { fulfillOrder, matchingFish, orderBoard, orderRefusal, orderSupply, orderTitle, type ShopOrder } from './orders';
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
 * - C9 母魚又快生了（每一窩都問，第二次之後一鍵照上次）
 * 第 36～80 天（midgame.md §6，#326）：
 * - C10 新的一窩裡有比留種更好的：換成這尾、兩尾都留、維持原本的
 * - C11 留種的那對看得出公母：把同缸別的公魚搬走（分開養），還是一起養
 * - C12 種魚快長大了：1 公配 2 母、1 公配 1 母、2 尾公魚輪流
 * - C13 留種的母魚懷孕了：標準飼料，還是加活餌（一窩多幾尾）
 * - C14 一缸快住不下了：賣一批、再買一缸、買 90L
 * - C15 夢想魚配方那窩快生了：放育幼盒，還是放密草的繁殖缸；生下來那天早上開獎（takeReveal）
 * 不管選哪個都能玩下去。只出資料和套用選擇；卡片的樣子由畫面負責（選種卡、配對比較卡交美術）。
 */

export type ChoiceId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10' | 'C11' | 'C12' | 'C13' | 'C14' | 'C15';
/**
 * 同一天有好幾張可以出時，照這個順序挑一張（C8 新缸養水排在搬魚 C6 前面）。
 * 有時效的排前面：C12 錯過就配上了、C13 孕期一開始就要決定、C15 生了就來不及。
 */
export const CHOICE_IDS: ChoiceId[] = ['C1', 'C2', 'C3', 'C8', 'C4', 'C5', 'C6', 'C7', 'C11', 'C12', 'C13', 'C15', 'C9', 'C10', 'C14'];

export interface ChoiceOption {
  key: string;
  label: string;
  /** 選了會怎樣（一行）。 */
  outcome: string;
  recommended?: boolean;
  /** 現在不能選的原因（例如錢不夠）；畫面把這個選項灰掉。 */
  disabled?: string;
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
  /** C11：指定的那尾公魚（畫面上畫牠留在原缸）。 */
  fatherId?: number;
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
  secondBrood?: { momId: number; hours: number; prevKids: number; born?: number; fry?: number[]; choice?: string };
  /** C9 之後每一窩（#326）：問過、還沒生的（生了就照 choice 處理、拿掉）。選交單的小魚也記進 secondBrood.fry。 */
  broodQueue?: Array<{ momId: number; hours: number; prevKids: number; choice: string }>;
  /** C9 問過幾窩（第二次之後是「又快生了」的簡化版）。 */
  broods?: number;
  /** C12 選了 2 尾公魚輪流：另一尾也是指定的爸爸（C11 分開養不會把牠搬走）。 */
  sires?: number[];
  /** C13 選了加活餌：哪尾母魚（生完就收掉活餌）。 */
  pregPlan?: number;
  /** C13 問過的母魚（C12 配的那幾尾，每尾問一次）。 */
  pregAsked?: number[];
  /** C12 選了 1 公配 2 母：第二尾母魚。 */
  mates?: number[];
  /** C10 這次要問的那尾（新的一窩裡比留種好的），和已經比過的魚（每尾只比一次）。 */
  better?: { fishId: number; oldId: number; newPct: number; oldPct: number };
  compared?: number[];
  /** C10 每一窩（「媽媽:出生日:公母」）問過的最高機率。 */
  betterAsked?: Record<string, number>;
  /** 上一張卡出現的時間（一天最多一張；每窩都問的卡選了之後 shown 會清掉，靠這個擋）。 */
  lastCard?: number;
  /** C15 開獎：哪尾母魚、從什麼時候算（這之後生的就是那一窩），開過了沒、生了幾尾。 */
  reveal?: { momId: number; hours: number; done?: boolean; born?: number; box?: boolean };
  /** 種魚都長大了、母魚卻因為生病沒配上的天數（早上報告說「因為白點，配對晚了約 N 天」），生病的原因，說過了沒。 */
  sickDays?: number;
  sickCause?: 'ich' | 'other';
  sickNoted?: boolean;
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
/** C9 第二次之後（簡化版）：懷孕到多少就問（比第一次早一點，肚子開始圓就問，跟前後的卡排得開）。 */
export const BROOD_AGAIN_SHOWS = 0.6;
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
  // C11 選了分開養：留種母魚在繁殖缸的話，不是指定爸爸的公魚不搬進去（#326）
  const s = economy(tanks[0]).choices;
  const split = s?.picked.C11 === 'split' && !s.reveal?.done ? pairFish(tanks, s) : null;
  const rival = (f: Fish) => !!split && split.tank === to && f.sex === 'male' && growthStage(f) !== 'fry' && !sireIds(s!).includes(f.id);
  const others = tanks.flatMap((t, tank) => (tank === to || t.purpose === 'breeding' ? [] : t.fish.filter((f) => movable(f) && !rival(f)).map((fish) => ({ fish, tank }))));
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

/** C12：兩尾都還要幾天以內長大就問怎麼配（長大當天就可能配上，早一點問）。 */
export const PAIR_PLAN_DAYS = 2;
/** C11：在 C12（快長大）前幾天問。 */
const C11_BEFORE_PAIR = 5;
/** C13：懷孕到多少（約 2～4 天）問孕期怎麼養；超過這個就太晚了。 */
const PREG_ASK = [0.07, 0.4] as const;
/** C15：夢想魚配方那窩懷孕過半就問什麼時候移到產房（midgame.md §6.4）。 */
export const REVEAL_SHOWS = 0.5;
/** C15 選等快生再放育幼盒：懷孕到多少就放進去（約剩 3 天；每天早上看一次，太晚會來不及）。 */
export const BOX_DUE = 0.88;
/** 懷孕後段的里程碑（midgame.md §6.4）：胎斑變大變黑、看得到小魚的眼睛。 */
export const BELLY_MILESTONES = [
  { key: 'dark', at: 0.7 },
  { key: 'eyes', at: BOX_DUE },
] as const;
/** C14 問過之後，隔幾天還是很擠再問一次。 */
const CROWD_REASK_DAYS = 5;
/** C10：新的那尾比原本的好多少（百分點）才問。 */
const BETTER_BY = 1;
/** C13 加活餌、C7 活餌餵的飼料（冷凍紅蟲，專業等級）。 */
const LIVE_FOOD = GROW_PLAN_FOOD.live!;

/** 指定的爸爸：C4 配的那尾，加上 C12 選了輪流的另一尾。 */
const sireIds = (s: Readonly<ChoiceState>) => (s.pair ? [s.pair[1], ...(s.sires ?? [])] : []);

/** 公魚當爸爸的權重（跟族群模擬一樣：尾鰭大的受青睞，配不了的鰭型不算）。 */
const sireWeight = (f: Fish) => (0.5 + (f.genome?.tail ?? 50) / 100) * (f.genome ? matingSuccess(f.genome) : 1);

/** C11：留種母魚那缸裡、不是指定爸爸的孔雀魚公魚（小小魚不算，育幼盒裡的不算）。 */
function rivals(tanks: TankState[], s: Readonly<ChoiceState>, tank: number): Fish[] {
  const sires = sireIds(s);
  return tanks[tank].fish.filter((f) => f.alive && f.species === 'guppy' && f.sex === 'male' && !f.nursery && !sires.includes(f.id) && growthStage(f) !== 'fry');
}

/** 一起養的話孫代機率 %：同缸的公魚照當爸爸的權重平均。 */
function mixedPct(mom: Fish, males: Fish[]): number {
  const ok = males.filter((m) => m.genome && sireWeight(m) > 0);
  const w = ok.reduce((a, m) => a + sireWeight(m), 0);
  if (w <= 0) return 0;
  return Math.round((ok.reduce((a, m) => a + sireWeight(m) * pairDream(mom.genome!, m.genome!), 0) / w) * 10) / 10;
}

/** 別的公魚要搬去哪缸：不是那對在的缸，繁殖缸以外、最不擠的。 */
function otherTank(tanks: TankState[], not: number): number {
  const idx = tanks.map((_, i) => i).filter((i) => i !== not);
  idx.sort((a, b) => Number(tanks[a].purpose === 'breeding') - Number(tanks[b].purpose === 'breeding') || crowdingRatio(tanks[a]) - crowdingRatio(tanks[b]));
  return idx[0] ?? -1;
}

/**
 * C11 選了分開養：把留種母魚那缸裡別的公魚搬去另一缸。太小的（另一缸大魚吞得下）先留著，快長大（PAIR_PLAN_DAYS + 1 天內）再搬。
 * 每天早上都會再看一次（之後長大的、搬進來的），直到開獎。回傳搬了幾尾。
 */
function splitMove(tanks: TankState[], s: ChoiceState): number {
  const p = pairFish(tanks, s);
  if (!p) return 0;
  const to = otherTank(tanks, p.tank);
  if (to < 0) return 0;
  const mouth = Math.max(0, ...tanks[to].fish.filter((f) => f.alive && !f.nursery && !isJuvenile(f)).map(mouthCm));
  let n = 0;
  for (const f of rivals(tanks, s, p.tank)) {
    if (f.lengthCm <= mouth && daysToMature(f) > PAIR_PLAN_DAYS + 1) continue;
    if (moveFish(tanks[p.tank], tanks[to], f.id)) n++;
  }
  return n;
}

/** C12 的第二尾母魚：別的留種母魚裡，配指定公魚機率最高的。 */
function secondMom(tanks: TankState[], mom: Fish, dad: Fish): { fish: Fish; tank: number } | null {
  const cands = located(tanks).filter(({ fish }) => fish.keeper && fish.id !== mom.id && fish.sex === 'female' && fish.species === 'guppy' && fish.genome && !fish.listing);
  return cands.sort((a, b) => pairDream(b.fish.genome!, dad.genome!) - pairDream(a.fish.genome!, dad.genome!))[0] ?? null;
}

/** C12 輪流的第二尾公魚：可以當種魚的公魚裡（留種的優先），配這尾母魚機率最高的。 */
function secondDad(tanks: TankState[], s: Readonly<ChoiceState>, mom: Fish): { fish: Fish; tank: number } | null {
  const sires = sireIds(s);
  const cands = located(tanks).filter(({ fish }) => !sires.includes(fish.id) && breederMale(fish) && sireWeight(fish) > 0);
  const score = (f: Fish) => pairDream(mom.genome!, f.genome!) + (f.keeper ? 0.05 : 0);
  return cands.sort((a, b) => score(b.fish) - score(a.fish))[0] ?? null;
}

const avgPct = (...p: number[]) => Math.round((p.reduce((a, b) => a + b, 0) / p.length) * 10) / 10;

/** C14 賣一批：現在交得出、錢最多的魚單。 */
function bestSellOrder(tanks: TankState[]): ShopOrder | null {
  const ok = orderBoard(tanks[0]).orders.filter((o) => o.kind === 'fish' && !o.preview && orderSupply(tanks, o) >= o.count && !orderRefusal(tanks, o.id));
  return ok.sort((a, b) => b.unitPrice * b.count - a.unitPrice * a.count)[0] ?? null;
}

/** C14 沒有交得出的單：賣給阿德收購，賣到這缸剩快養滿的四分之三（不賣留種的、有夢想魚基因的）。 */
function shopBatch(tanks: TankState[], tank: number): Fish[] {
  const t = tanks[tank];
  const vol = t.equipment.tank.volumeL;
  let over = (crowdingRatio(t) - CROWD_WARN * 0.75) * vol;
  const cands = t.fish.filter((f) => !buybackRefusal(f) && !f.nursery && growthStage(f) !== 'fry' && !(f.genome && hasDreamGenes(f)) && !sireIds(choiceState(tanks)).includes(f.id));
  const out: Fish[] = [];
  for (const f of cands.sort((a, b) => b.lengthCm * sizeRatio(b) - a.lengthCm * sizeRatio(a))) {
    if (over <= 0 || out.length >= sellsLeftToday(tanks[0])) break;
    out.push(f);
    over -= f.lengthCm * sizeRatio(f);
  }
  return out;
}

/** C14：最擠、到了快養滿（CROWD_WARN，跟分缸提示同一把尺）的那缸。 */
function crowdedTank(tanks: TankState[]): number {
  let best = -1;
  tanks.forEach((t, i) => {
    if (crowdingRatio(t) >= CROWD_WARN && (best < 0 || crowdingRatio(t) > crowdingRatio(tanks[best]))) best = i;
  });
  return best;
}

/** C9 的三個選項（第一次問的完整版）。 */
function broodOptions(coins: number): ChoiceOption[] {
  return [
    { key: 'grow', label: '留在繁殖缸長大', outcome: '整窩留著長大，之後再看要留哪幾尾' },
    { key: 'sell', label: '交小魚單', outcome: `長到能交就照訂單交，約 ${coins} 元；有夢想魚基因的也不再問` },
    { key: 'keep', label: `挑 2～${SECOND_BROOD_KEEP} 尾當備用種魚`, outcome: '一生下來就挑離夢想魚最近的標留種，萬一種魚出事還有備用', recommended: true },
  ];
}

/**
 * C10：一窩裡長到幼魚的有 ≥ 3 尾，裡面，有沒有比留種的那對更好的（同性別那尾換掉，孫代機率高 BETTER_BY 以上）。
 * 每尾只比一次（記在 compared）；找到就記在 better 等著出卡。
 */
function scanBetter(tanks: TankState[], s: ChoiceState): void {
  if (s.better) {
    const all = located(tanks);
    const f = all.find(({ fish }) => fish.id === s.better!.fishId)?.fish;
    if (f && !f.keeper && !f.listing && all.some(({ fish }) => fish.id === s.better!.oldId)) return;
    delete s.better;
  }
  const p = pairFish(tanks, s);
  if (!p?.mom.genome || !p.dad.genome) return;
  const seen = (s.compared ??= []);
  // 照一窩分（同一尾媽媽、同一天生），長到幼魚的才比（一窩有快有慢，長到的就比）
  const broods = new Map<string, Fish[]>();
  for (const { fish } of located(tanks)) {
    if (!bredGuppy(fish) || fish.motherId === undefined || growthStage(fish) === 'fry') continue;
    const key = `${fish.motherId}:${Math.floor((fish.bornHours ?? 0) / 24)}`;
    broods.set(key, [...(broods.get(key) ?? []), fish]);
  }
  const oldPct = pairDream(p.mom.genome, p.dad.genome);
  const asked = (s.betterAsked ??= {});
  for (const [key, brood] of broods) {
    if (brood.length < 3) continue;
    for (const f of brood) {
      if (f.keeper || f.listing || seen.includes(f.id)) continue;
      seen.push(f.id);
      const newPct = f.sex === 'female' ? pairDream(f.genome!, p.dad.genome) : pairDream(p.mom.genome, f.genome!);
      // 同一窩問過的話，要比上次問的那尾還好才再問（不然一窩兄弟一尾一尾問一樣的事）
      const bar = Math.max(oldPct + BETTER_BY, (asked[`${key}:${f.sex}`] ?? -Infinity) + BETTER_BY);
      if (newPct >= bar && (!s.better || newPct > s.better.newPct)) {
        s.better = { fishId: f.id, oldId: f.sex === 'female' ? p.mom.id : p.dad.id, newPct, oldPct };
        asked[`${key}:${f.sex}`] = newPct;
      }
    }
  }
}

/**
 * C13：照 C12 配的母魚（留種那對的母魚、1 公配 2 母的第二尾；第二尾要懷的是指定爸爸的），剛懷孕幾天，還沒問過。
 * 那缸已經在餵活餌就不用再問。
 */
function pregnantMom(tanks: TankState[], s: Readonly<ChoiceState>): { fish: Fish; tank: number } | null {
  const p = pairFish(tanks, s);
  if (!p) return null;
  const sires = sireIds(s);
  const asked = s.pregAsked ?? [];
  const live = (t: TankState) => t.feedPlan?.kind === LIVE_FOOD.kind && t.feedPlan.grade === LIVE_FOOD.grade;
  const mates = [p.mom.id, ...(s.mates ?? [])];
  const moms = located(tanks).filter(({ fish, tank }) => mates.includes(fish.id) && (fish.id === p.mom.id || (fish.sire?.id !== undefined && sires.includes(fish.sire.id))) && !asked.includes(fish.id) && !live(tanks[tank]));
  return moms.find(({ fish }) => fish.pregnancy >= PREG_ASK[0] && fish.pregnancy <= PREG_ASK[1]) ?? null;
}

/** C15 開獎準備：留種那對的母魚，夢想魚配方那窩快生了（她第一次懷這對的小孩）。 */
function revealMom(tanks: TankState[], s: Readonly<ChoiceState>): { fish: Fish; tank: number } | null {
  if (!s.pair || s.reveal?.done) return null;
  const m = located(tanks).find(({ fish }) => fish.id === s.pair![0]);
  return m && m.fish.pregnancy >= REVEAL_SHOWS ? m : null;
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
      const mom = secondBroodMom(tanks, s);
      if (!mom) return null;
      const coins = Math.round((FISH_SPECIES[mom.fish.species].breeding!.broodMean * mom.fish.health * 0.5 * JUVENILE_ORDER_PRICE) / 10) * 10;
      const options = broodOptions(coins);
      const last = s.picked.C9 && options.find((o) => o.key === s.picked.C9);
      if (last && (s.broods ?? 0) >= 1) {
        // 第二次之後（midgame.md §6.1）：一鍵照上次，或直接點另外兩個
        return {
          id,
          tank: mom.tank,
          title: `${callName(mom.fish)}又快生了`,
          owner: '照上次的處理，還是這次改一下？',
          options: [{ ...last, key: 'same', label: `照上次：${last.label}`, recommended: true }, ...options.filter((o) => o !== last).map((o) => ({ ...o, recommended: false }))],
          motherId: mom.fish.id,
        };
      }
      return {
        id,
        tank: mom.tank,
        title: '第二窩快生了，要怎麼辦？',
        owner: `${callName(mom.fish)}的肚子又圓了，黑點也出來了。生下來之後照你選的處理。`,
        options,
        motherId: mom.fish.id,
      };
    }
    case 'C10': {
      const b = s.better;
      if (!b) return null;
      const all = located(tanks);
      const nu = all.find(({ fish }) => fish.id === b.fishId);
      const old = all.find(({ fish }) => fish.id === b.oldId);
      if (!nu || !old) return null;
      const room = all.filter(({ fish }) => fish.keeper).length < MAX_KEEPERS;
      return {
        id,
        tank: nu.tank,
        title: '這尾比你留的種魚更好！',
        owner: `${callName(nu.fish)}的孫代機率約 ${b.newPct}%，原本的${callName(old.fish)}約 ${b.oldPct}%。`,
        options: [
          { key: 'swap', label: '換成這尾', outcome: `${nu.fish.sex === 'male' ? '牠當爸爸' : '牠當媽媽'}，原本的不再留種` },
          ...(room ? [{ key: 'both', label: '兩尾都留', outcome: '多一尾種魚，原本的計畫照走，萬一出事還有備用', recommended: true }] : []),
          // 留種名額滿了：照原本的計畫走最穩（換掉那對的其中一尾，要從頭等牠長大）
          { key: 'keep', label: '維持原本的', outcome: room ? '照原本的計畫' : `留種名額滿了（最多 ${MAX_KEEPERS} 尾），照原本的計畫`, recommended: !room },
        ],
        fish: [pickFish(nu.fish, nu.tank), pickFish(old.fish, old.tank)],
      };
    }
    case 'C11': {
      if (tanks.length < 2) return null;
      const p = pairFish(tanks, s);
      if (!p?.mom.genome || !p.dad.genome || p.mom.pregnancy > 0) return null;
      // 快長大、要配之前（C12 前幾天）問：這時候公母都看得出來了
      const plan = s.planDone ? 'standard' : (s.plan ?? 'standard');
      if (planMatureDays(tanks[p.tank], p.mom, plan) > PAIR_PLAN_DAYS + C11_BEFORE_PAIR) return null;
      const r = rivals(tanks, s, p.tank);
      if (r.length === 0) return null;
      const keepPct = pairDream(p.mom.genome, p.dad.genome);
      const mixPct = mixedPct(p.mom, [p.dad, ...r]);
      const to = otherTank(tanks, p.tank);
      return {
        id,
        tank: p.tank,
        title: '留種的魚看得出公母了！',
        owner: '母魚會把精子存起來好幾個月。想讓指定的公魚當爸爸，現在就要把母魚分開。',
        options: [
          { key: 'split', label: '分開養', outcome: `孫代出現${DREAM_FISH.name}的機率約 ${keepPct}%；同缸另外 ${r.length} 尾公魚搬去${tankLabel(tanks, to)}`, recommended: true },
          { key: 'together', label: '一起養', outcome: `可能被別尾公魚配到，機率約 ${mixPct}%` },
        ],
        motherId: p.mom.id,
        fatherId: p.dad.id,
      };
    }
    case 'C12': {
      const p = pairFish(tanks, s);
      if (!p?.mom.genome || !p.dad.genome || p.mom.pregnancy > 0) return null;
      const t = tanks[p.tank];
      const plan = s.planDone ? 'standard' : (s.plan ?? 'standard');
      const wait = Math.max(planMatureDays(t, p.mom, plan), planMatureDays(t, p.dad, plan));
      if (wait > PAIR_PLAN_DAYS) return null;
      const one = pairDream(p.mom.genome, p.dad.genome);
      const mom2 = secondMom(tanks, p.mom, p.dad);
      const dad2 = secondDad(tanks, s, p.mom);
      // 配上（約 2 天）＋懷孕（孕期照水溫）
      const sp = FISH_SPECIES[p.mom.species].breeding!;
      const born = Math.round(wait + 2 + sp.gestationDays / Math.sqrt(temperatureFactor(t.water.tempC)));
      return {
        id,
        tank: p.tank,
        title: '種魚長大了，怎麼配？',
        owner: `配上之後大約 ${born} 天生（約第 ${dayOf(home.hours + born * 24)} 天）。`,
        options: [
          ...(mom2 ? [{ key: 'two', label: '1 公配 2 母', outcome: `母魚壓力小，約 ${avgPct(one, pairDream(mom2.fish.genome!, p.dad.genome))}%`, recommended: true }] : []),
          { key: 'one', label: '1 公配 1 母', outcome: `血統最單純，約 ${one}%`, recommended: !mom2 },
          ...(dad2 ? [{ key: 'rotate', label: '2 尾公魚輪流', outcome: `看哪尾比較好，約 ${avgPct(one, pairDream(p.mom.genome, dad2.fish.genome!))}%` }] : []),
        ],
        motherId: p.mom.id,
        fatherId: p.dad.id,
      };
    }
    case 'C13': {
      const m = pregnantMom(tanks, s);
      if (!m) return null;
      const d = Math.max(1, Math.round(daysToBirth(tanks[m.tank], m.fish) ?? 1));
      const sp = FISH_SPECIES[m.fish.species].breeding!;
      const more = Math.max(1, Math.round(sp.broodMean * m.fish.health * (broodFactor(1) - broodFactor(m.fish.breedingCondition))));
      return {
        id,
        tank: m.tank,
        title: `${callName(m.fish)}懷孕了！`,
        owner: `再約 ${d} 天生。孕期吃得好，一窩可能多幾尾。`,
        options: [
          { key: 'standard', label: '標準飼料', outcome: '照現在餵，水比較好顧' },
          { key: 'live', label: '加活餌', outcome: `一窩可能多 ${more} 尾左右，水比較髒要多換水` },
        ],
        motherId: m.fish.id,
      };
    }
    case 'C14': {
      if (!s.pair) return null;
      const i = crowdedTank(tanks);
      if (i < 0) return null;
      const o = bestSellOrder(tanks);
      const batch = o ? [] : shopBatch(tanks, i);
      const big = !tankLock(tanks, 'std90');
      const sell = o ? `${orderTitle(o)} ${o.unitPrice * o.count} 元` : batch.length > 0 ? `${batch.length} 尾賣給阿德，約 ${batch.reduce((a, f) => a + fishBuybackPrice(f), 0)} 元` : null;
      // 擠的多半是還賣不了的小小魚：等牠們長到能賣再問（不然只剩花大錢買缸）
      if (!sell) return null;
      return {
        id,
        tank: i,
        title: `${tankLabel(tanks, i)}快住不下了`,
        owner: '魚太擠，水質會變差，也容易生病。',
        options: [
          { key: 'sell', label: '賣一批', outcome: sell, recommended: true },
          { key: 'tank', label: tanks.length === 2 ? '買第三缸' : '再買一缸', outcome: `20L 套缸 ${newTankCost(tanks, 'nano20')} 元` },
          ...(big ? [{ key: 'big', label: '換大缸', outcome: `90L，${newTankCost(tanks, 'std90')} 元` }] : []),
        ],
      };
    }
    case 'C15': {
      const m = revealMom(tanks, s);
      if (!m) return null;
      const box = !!tanks[m.tank].nurseryBox;
      const price = PRICES['nursery:box'] ?? 150;
      const breeding = tanks.findIndex((t) => t.purpose === 'breeding');
      // 沒有盒子要先買：價錢寫在選項上，點了才算同意花錢；錢不夠就不能選
      const poor = !box && economy(home).coins < price;
      return {
        id,
        tank: m.tank,
        title: '夢想魚的那窩過一半了！',
        owner: `這一窩裡可能有${DREAM_FISH.name}的寶寶。什麼時候把${callName(m.fish)}移到產房？`,
        options: [
          { key: 'plants', label: breeding >= 0 ? '現在移去密草的繁殖缸' : '現在就留在缸裡躲草', outcome: '母魚適應得好，但小魚出生後一部分要躲', recommended: poor },
          {
            key: 'box',
            label: box ? '等快生再放育幼盒' : `等快生再放育幼盒（買一個 ${price} 元）`,
            outcome: '保護最好，但移太晚母魚會緊迫',
            recommended: !poor,
            ...(poor ? { disabled: `錢不夠：育幼盒要 ${price} 元` } : {}),
          },
        ],
        motherId: m.fish.id,
      };
    }
  }
}

/** C9：已經生過一窩、這一胎又快生了的孔雀魚母魚（肚子最大的那尾）。每一窩都問（#326）。 */
function secondBroodMom(tanks: TankState[], s: Readonly<ChoiceState>): { fish: Fish; tank: number } | null {
  const all = located(tanks);
  // 留種那對的母魚，夢想魚配方那窩由 C15 問
  const dream = s.pair && !s.reveal?.done ? s.pair[0] : undefined;
  // 問過、還沒生的不再問
  const asked = [...(s.secondBrood && s.secondBrood.born === undefined ? [s.secondBrood.momId] : []), ...(s.broodQueue ?? []).map((b) => b.momId)];
  // 第一次問的是「第二窩」（生過的母魚）；之後每一窩都問，自家第一次當媽媽的也問
  const before = (f: Fish) => !!s.secondBrood || all.some((k) => k.fish.motherId === f.id);
  const moms = all.filter(({ fish }) => fish.species === 'guppy' && fish.sex === 'female' && fish.id !== dream && !asked.includes(fish.id) && fish.pregnancy >= (s.secondBrood ? BROOD_AGAIN_SHOWS : SECOND_BROOD_SHOWS) && before(fish));
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
  if (!sb) return null;
  const fryOf = (b: { momId: number; hours: number }) => located(tanks).filter(({ fish }) => fish.motherId === b.momId && (fish.bornHours ?? -Infinity) >= b.hours);
  // 第一次問的那窩（第二窩），或之後問過的那幾窩裡先生的
  let b: { momId: number; prevKids: number; choice: string } | null = null;
  let fry: ReturnType<typeof fryOf> = [];
  let again = false;
  if (sb.born === undefined && (fry = fryOf(sb)).length > 0) {
    sb.born = fry.length;
    b = { ...sb, choice: sb.choice ?? s.picked.C9 ?? 'grow' };
  } else {
    const q = s.broodQueue ?? [];
    const i = q.findIndex((x) => (fry = fryOf(x)).length > 0);
    if (i < 0) return null;
    b = q.splice(i, 1)[0];
    again = true;
  }
  const choice = b.choice;
  let kept = 0;
  let full = false;
  if (choice === 'sell') (sb.fry ??= []).push(...fry.map(({ fish }) => fish.id));
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
  const mom = located(tanks).find(({ fish }) => fish.id === b.momId)?.fish;
  const who = mom ? callName(mom) : '母魚';
  const then = choice === 'sell' ? '長到能交就照訂單交。' : choice === 'keep' ? (full && kept === 0 ? `留種名額滿了（最多 ${MAX_KEEPERS} 尾），先取消幾尾才挑得了。` : kept > 0 ? `挑了 ${kept} 尾離夢想魚最近的當備用種魚。` : '這窩還挑不到能留的，先讓牠們長大。') : '整窩留著長大。';
  const what = again ? `又生了 ${fry.length} 尾（之前的還有 ${b.prevKids} 尾）` : `的第二窩生了 ${fry.length} 尾（第一窩現在還有 ${b.prevKids} 尾）`;
  return { momId: b.momId, count: fry.length, prevKids: b.prevKids, kept, choice, text: `${who}${what}。${then}` };
}

/** 開獎卡（midgame.md §6.1 C15）：每尾小魚帶不帶白子、蛇紋（含隱性），和老闆那句話。 */
export interface RevealNews {
  momId: number;
  dream: string;
  fry: Array<{ fishId: number; albino: boolean; snake: boolean }>;
  /** 兩樣都帶的有幾尾。 */
  both: number;
  text: string;
}

/**
 * 早上報告用：夢想魚配方那窩生了就開獎一次（之後回 null）。母魚不在了、或過了很久都沒生（流產、被配走）就收掉。
 */
export function takeReveal(tanks: TankState[]): RevealNews | null {
  const s = choiceState(tanks);
  const r = s.reveal;
  if (!r || r.done) return null;
  const fry = located(tanks).filter(({ fish }) => fish.motherId === r.momId && (fish.bornHours ?? -Infinity) >= r.hours);
  if (fry.length === 0) {
    const mom = located(tanks).find(({ fish }) => fish.id === r.momId);
    if (!mom || (mom.fish.pregnancy === 0 && tanks[0].hours - r.hours > 10 * 24)) r.done = true;
    return null;
  }
  r.done = true;
  r.born = fry.length;
  const out = fry
    .filter(({ fish }) => fish.genome)
    .map(({ fish }) => ({ fishId: fish.id, albino: fish.genome!.albino.includes(1), snake: fish.genome!.snakeX.includes(1) || fish.genome!.y?.snake === 1 }));
  const both = out.filter((f) => f.albino && f.snake).length;
  const text = both > 0 ? `有 ${both} 尾兩樣都有，長大後可能就是${DREAM_FISH.name}！` : '這窩沒有，但牠們身上都帶著基因，下一代還有機會';
  return { momId: r.momId, dream: DREAM_FISH.name, fry: out, both, text };
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

/** 選過了還會再問的卡：C6 又有魚可以搬、C9 每一窩、C10 每次有更好的、C14 隔幾天還是很擠。 */
function again(id: ChoiceId, tanks: TankState[], s: ChoiceState): boolean {
  if (id === 'C6') return moveAgain(tanks, s);
  if (id === 'C9' || id === 'C10' || id === 'C13') return true;
  if (id === 'C14') return tanks[0].hours - (s.shown.C14 ?? -Infinity) >= CROWD_REASK_DAYS * 24;
  return false;
}

/**
 * 第 36～80 天每天早上的小事（#326）：C11 選了分開養就繼續把長大的別尾公魚搬走（開獎前）；
 * C13 的活餌生完就收掉；夢想魚配方那窩快生了就記下開獎（沒選 C15 也照樣開）；找新的一窩裡更好的魚（C10）。
 */
function lateHousekeeping(tanks: TankState[], s: ChoiceState): void {
  if (s.picked.C11 === 'split' && !s.reveal?.done) splitMove(tanks, s);
  if (s.pregPlan !== undefined) {
    const mom = located(tanks).find(({ fish }) => fish.id === s.pregPlan);
    if (!mom || mom.fish.pregnancy === 0) {
      for (const t of tanks) if (t.feedPlan?.kind === LIVE_FOOD.kind && t.feedPlan.grade === LIVE_FOOD.grade && (!s.plan || s.planDone)) delete t.feedPlan;
      delete s.pregPlan;
    }
  }
  const m = revealMom(tanks, s);
  if (m && s.reveal?.momId !== m.fish.id) s.reveal = { momId: m.fish.id, hours: tanks[0].hours };
  boxDue(tanks, s);
  noteSickDelay(tanks, s);
  scanBetter(tanks, s);
}

/** C15 選了等快生再放：快生了就把母魚放進那缸的育幼盒（盒裡放得出去的小魚先放出去）。 */
function boxDue(tanks: TankState[], s: ChoiceState): void {
  const r = s.reveal;
  if (!r?.box || r.done) return;
  const m = located(tanks).find(({ fish }) => fish.id === r.momId);
  if (!m || m.fish.nursery || m.fish.pregnancy < BOX_DUE) return;
  const t = tanks[m.tank];
  if (!t.nurseryBox) return;
  if (nurseryRefusal(t, m.fish)) releaseNursery(t, t.fish.filter((f) => f.nursery && isJuvenile(f) && f.lengthCm > mouthCm(m.fish)).map((f) => f.id));
  moveToNursery(t, m.fish.id);
}

/** 種魚都長大了、母魚還沒懷上：身體差（生病）的話記一天，看是不是白點。 */
function noteSickDelay(tanks: TankState[], s: ChoiceState): void {
  if (s.reveal || s.sickNoted) return;
  const p = pairFish(tanks, s);
  if (!p || p.mom.pregnancy > 0 || isJuvenile(p.mom) || isJuvenile(p.dad)) return;
  const t = tanks[p.tank];
  const ich = t.fish.some((f) => f.alive && f.ich.stage === 'visible');
  if (!ich && p.mom.health > 0.7) return;
  s.sickDays = (s.sickDays ?? 0) + 1;
  if (ich) s.sickCause = 'ich';
  else s.sickCause ??= 'other';
}

/**
 * 早上報告用：夢想魚那窩的懷孕後段里程碑（每個說一次），和生病拖慢配對的那一句（懷上之後說一次）。
 */
export function takeBellyNotes(tanks: TankState[]): Array<{ fishId: number; text: string }> {
  const s = choiceState(tanks);
  const p = pairFish(tanks, s);
  const out: Array<{ fishId: number; text: string }> = [];
  if (!p) return out;
  if (!s.sickNoted && (s.sickDays ?? 0) > 0 && p.mom.pregnancy > 0) {
    s.sickNoted = true;
    out.push({ fishId: p.mom.id, text: `因為${s.sickCause === 'ich' ? '白點' : '生病'}，配對晚了約 ${s.sickDays} 天` });
  }
  const r = s.reveal;
  if (!r || r.done || r.momId !== p.mom.id) return out;
  const seen = (s.milestoneSeen ??= []);
  for (const m of BELLY_MILESTONES) {
    const key = `${r.momId}@${Math.round(r.hours)}:${m.key}`;
    if (p.mom.pregnancy < m.at || seen.includes(key)) continue;
    seen.push(key);
    out.push({ fishId: p.mom.id, text: m.key === 'dark' ? `${callName(p.mom)}的胎斑變大、變黑了` : '胎斑裡看得到小魚的眼睛了！快生了' });
  }
  return out;
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
  lateHousekeeping(tanks, s);
  const now = tanks[0].hours;
  // 同一個遊戲天最多一張（#316）：同一天又過一晚、或別的地方再拿一次，都不再出第二張
  const today = Math.floor(now / 24);
  if ([...Object.values(s.shown), s.lastCard].some((h) => h !== undefined && Math.floor(h / 24) === today)) return null;
  for (const id of CHOICE_IDS) {
    if (id !== 'C5' && s.picked[id] && !again(id, tanks, s)) continue;
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
    s.lastCard = now;
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
      // 簡化版的「照上次」
      if (key === 'same' && s.picked.C9) key = s.picked.C9;
      if (!['grow', 'sell', 'keep'].includes(key)) return '沒有這個選項';
      const mom = secondBroodMom(tanks, s);
      if (!mom) return '這一胎已經生了';
      const prevKids = located(tanks).filter(({ fish }) => fish.motherId === mom.fish.id).length;
      const b = { momId: mom.fish.id, hours: tanks[0].hours, prevKids, choice: key };
      if (!s.secondBrood) s.secondBrood = b;
      else (s.broodQueue ??= []).push(b);
      s.broods = (s.broods ?? 0) + 1;
      break;
    }
    case 'C10': {
      const b = s.better;
      if (!b || !['swap', 'both', 'keep'].includes(key)) return '這尾已經不在了';
      const nu = find(b.fishId);
      const old = find(b.oldId);
      if (!nu || !old) return '這尾已經不在了';
      // 換掉的話先取消原本那尾，名額才空得出來
      if (key === 'swap') setKeeper(tanks[old.tank], old.fish.id, false);
      if (key !== 'keep') {
        const why = setKeeper(tanks[nu.tank], nu.fish.id, true);
        if (why) {
          if (key === 'swap') setKeeper(tanks[old.tank], old.fish.id, true);
          return why;
        }
      }
      if (key === 'swap') {
        // 換掉留種那對的其中一尾：新的這尾搬去那對的缸
        const p = pairFish(tanks, s);
        if (s.pair && p) {
          s.pair = nu.fish.sex === 'female' ? [nu.fish.id, s.pair[1]] : [s.pair[0], nu.fish.id];
          if (nu.tank !== p.tank) moveFish(tanks[nu.tank], tanks[p.tank], nu.fish.id);
        }
      } else if (key === 'both') (s.backups ??= []).push(nu.fish.id);
      delete s.better;
      break;
    }
    case 'C11': {
      if (key !== 'split' && key !== 'together') return '沒有這個選項';
      if (key === 'split') {
        if (!pairFish(tanks, s)) return '留種的那對不在了';
        splitMove(tanks, s);
      }
      break;
    }
    case 'C12': {
      const p = pairFish(tanks, s);
      if (!p?.mom.genome || !p.dad.genome) return '留種的那對不在了';
      if (key === 'two') {
        const m2 = secondMom(tanks, p.mom, p.dad);
        if (!m2) return '沒有別的留種母魚';
        if (m2.tank !== p.tank) moveFish(tanks[m2.tank], tanks[p.tank], m2.fish.id);
        s.mates = [m2.fish.id];
      } else if (key === 'rotate') {
        const d2 = secondDad(tanks, s, p.mom);
        if (!d2) return '沒有別的公魚可以輪流';
        const why = d2.fish.keeper ? null : setKeeper(tanks[d2.tank], d2.fish.id, true);
        if (why) return why;
        if (d2.tank !== p.tank) moveFish(tanks[d2.tank], tanks[p.tank], d2.fish.id);
        s.sires = [...(s.sires ?? []), d2.fish.id];
      } else if (key !== 'one') return '沒有這個選項';
      break;
    }
    case 'C13': {
      const m = pregnantMom(tanks, s);
      if (!m) return '已經過了孕期剛開始的時候';
      if (key === 'live') {
        tanks[m.tank].feedPlan = { ...LIVE_FOOD };
        s.pregPlan = m.fish.id;
      } else if (key !== 'standard') return '沒有這個選項';
      (s.pregAsked ??= []).push(m.fish.id);
      break;
    }
    case 'C14': {
      // 再買一缸、換大缸：畫面帶去買缸（這裡只記下來）
      if (key === 'sell') {
        const o = bestSellOrder(tanks);
        const i = crowdedTank(tanks);
        if (o) {
          if (!fulfillOrder(tanks, o.id)) return orderRefusal(tanks, o.id) ?? '現在交不出這張單';
        } else {
          const batch = i < 0 ? [] : shopBatch(tanks, i);
          if (batch.length === 0) return '現在沒有可以賣的魚';
          for (const f of batch) sellFish(tanks[i], f.id);
        }
      } else if (key !== 'tank' && key !== 'big') return '沒有這個選項';
      break;
    }
    case 'C15': {
      const m = revealMom(tanks, s);
      if (!m) return '已經生了';
      if (s.reveal?.momId !== m.fish.id) s.reveal = { momId: m.fish.id, hours: tanks[0].hours };
      if (key === 'box') {
        // 先把盒子準備好，快生了（BOX_DUE）每天早上自己放進去
        const t = tanks[m.tank];
        if (!t.nurseryBox) {
          const price = PRICES['nursery:box'] ?? 150;
          if (!spend(tanks[0], price)) return `錢不夠：育幼盒要 ${price} 元`;
          buyNurseryBox(t);
        }
        s.reveal.box = true;
        boxDue(tanks, s);
      } else if (key === 'plants') {
        const to = tanks.findIndex((t) => t.purpose === 'breeding');
        if (to >= 0 && to !== m.tank) moveFish(tanks[m.tank], tanks[to], m.fish.id);
      } else return '沒有這個選項';
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
  // 每一窩都問的卡：選了就不用等隔幾天，下一窩（下一尾）到了就問
  if (id === 'C9' || id === 'C10' || id === 'C13') delete s.shown[id];
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
