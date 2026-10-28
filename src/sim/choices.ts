import { DREAM_FISH, DREAM_MALE, LINE_FIXED_PCT, LINE_NAME_MAX, LINE_NAME_PCT, stabilityPct } from './dream';
import { addFish, setHeaterTarget } from './actions';
import { waterChange } from './maintenance-actions';
import { temperatureFactor } from './chemistry';
import { buybackRefusal, economy, FISH_PRICES, FRY_BAG, fishBuybackPrice, isFrySale, MAX_KEEPERS, PRICES, sellsLeftToday, spend } from './economy';
import { keeperRefusal, sellFish, setKeeper } from './economy-actions';
import { broodFactor, FOOD_GRADES, nutritionFactor, type FoodGrade, type FoodKind } from './food';
import { childInbreeding, cross, finWords, GUPPY_STRAIN_PRICES, lookIndex, matingSuccess, phenotype, strainName, type GuppyGenome, type GuppyPhenotype } from './genetics';
import { tankLock } from './goals';
import { daysToLength, growthStage, maxLengthCm, PICK_AFTER_BROOD_DAYS, sexVisible } from './growth';
import { moveFish, newTankCost, tankLabel } from './household';
import { buyTankRefusal } from './household-actions';
import { crowdingRatio } from './processes/fauna';
import { isCycled } from './processes/nitrogen';
import { sizeRatio } from './processes/population';
import { CROWD_WARN, cyclingTank } from './split';
import { tooSmallForTank } from './quarantine';
import { addBottledBacteria, mediaAvailable, transferMedia } from './gifts';
import { guppyTraits } from './lookalike';
import { BELLY_DARK, BELLY_SHOWS, BOX_DUE, buyNurseryBox, daysToBirth, DUE_PREGNANCY, moveToNursery, nurseryRefusal, releaseNursery, rescueFryToNursery, usesNursery } from './nursery';
import { fulfillOrder } from './order-actions';
import { matchingFish, orderBoard, orderRefusal, orderSupply, orderTitle, type ShopOrder } from './orders';
import { previewPair, typicalStoreGenome, type PreviewKid } from './pair-preview';
import { FISH_SPECIES, isShrimpSpecies } from './species';
import { ADULT_SIZE, isJuvenile, recordEvent, type Fish, type TankState } from './state';
import { coldWithoutHeater } from './winter-rescue';

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
 * - C14 一缸快住不下了（≥ 80%；≥ 100% 加強版每 2 天問）：公母分開、賣一批、再買一缸、買 90L、先多換水（midgame.md §7）
 * - C16 開獎那窩長大一點了（開獎後 7 天）：留 4～6 尾候選、其他賣掉（midgame.md §7.3）
 * - C15 夢想魚配方那窩快生了：放育幼盒，還是放密草的繁殖缸；生下來那天早上開獎（takeReveal）
 * 不管選哪個都能玩下去。只出資料和套用選擇；卡片的樣子由畫面負責（選種卡、配對比較卡交美術）。
 */

export type ChoiceId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10' | 'C11' | 'C12' | 'C13' | 'C14' | 'C15' | 'C16' | 'C17' | 'C18' | 'C19';
/**
 * 同一天有好幾張可以出時，照這個順序挑一張（C8 新缸養水排在搬魚 C6 前面）。
 * 有時效的排前面：C12 錯過就配上了、C13 孕期一開始就要決定、C15 生了就來不及。
 */
export const CHOICE_IDS: ChoiceId[] = ['C1', 'C2', 'C3', 'C8', 'C4', 'C5', 'C6', 'C7', 'C11', 'C12', 'C13', 'C15', 'C9', 'C10', 'C16', 'C18', 'C17', 'C19', 'C14'];

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
  /** C18 取名卡（strain-fixing.md §2.2）：預設名字、這窩的穩定度和幾尾、名字最多幾個字。 */
  naming?: { suggested: string; stability: number; dream: number; total: number; maxLen: number };
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
  /** C13：可以一起勾的選項（畫面畫成勾選；都沒勾是 standard、都勾是 both，#335）。 */
  checks?: string[];
  /** 選項下面的一行小字（C12：照推薦大約第幾天開獎，#335）。 */
  note?: string;
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
  /** 留種公魚開始顯色的時間（遊戲小時）：顯色到可以配之間的成長卡（§6.7）用。 */
  colorHours?: number;
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
  broodQueue?: Array<{ momId: number; hours: number; prevKids: number; choice: string; preg?: number }>;
  /** C9 問過幾窩（第二次之後是「又快生了」的簡化版）。 */
  broods?: number;
  /** C9 重複版上次選的時間（遊戲小時）：重複版 BROOD_AGAIN_GAP_DAYS 天內最多一張（midgame.md §6.5）。 */
  broodPickedAt?: number;
  /** C9 重複版連續選「照上次」幾次：BROOD_AUTO_AFTER 次之後不再跳卡，自動照上次。 */
  sameStreak?: number;
  /** 自動照上次處理的母魚（早上報告寫一行，寫過就拿掉）。 */
  broodAutoNotes?: Array<{ momId: number; choice: string }>;
  /** C9 自動照上次那行已經附過哪個設定的改設定卡（g22：同一張卡第 92～170 天出了 9 次）：同一個設定只附一次，改了設定再附。 */
  broodAutoTold?: string;
  /** C12 選了 2 尾公魚輪流：另一尾也是指定的爸爸（C11 分開養不會把牠搬走）。 */
  sires?: number[];
  /** C13 選了加活餌：哪尾母魚（生完就收掉活餌）。 */
  pregPlan?: number;
  /** C13 選了調高水溫：哪幾尾母魚、哪缸、第一次調之前加熱棒設幾度（都生完才調回來，#335）。 */
  warmPlan?: { momIds: number[]; tank: number; prevC: number };
  /** C14（midgame.md §7）：下次可以再問的時間（先多換水、隔幾天再問）。 */
  crowdNext?: number;
  /** 離線回來的擠缸行：每缸上次說的是第幾個遊戲天（同一缸一天最多說一次）。 */
  awayNoted?: Record<number, number>;
  /** C14 連續選「賣一批」幾次（兩次之後多一個「以後太擠就自動賣」）。 */
  crowdSells?: number;
  /** C14 選了以後太擠就自動賣給阿德。 */
  crowdAuto?: boolean;
  /** C14 選了公母分開的缸：每天早上把長大的公魚搬走。 */
  crowdSplit?: number[];
  /** 已經出過「生完會住不太下」預告的缸（擁擠度掉回 CROWD_PREVIEW 以下才會再出）。 */
  crowdPreviewed?: number[];
  /** 早上的小事當天記下、早上報告要說的擠缸行（自動賣、自動搬）。 */
  crowdNotes?: Array<{ tank: number; text: string }>;
  /** C16 開獎版 C10 問過了。 */
  revealCullAsked?: boolean;
  /**
   * 固定品系（strain-fixing.md §2）：開獎那窩起，品系的每一窩出生時記下幾尾、幾尾是夢想魚（gen 第幾代，開獎那窩是 1），
   * 蛇紋出來說過了沒（snake）、穩定度卡說過了沒（told）。
   */
  line?: { broods: LineBrood[] };
  /** C17 問過第幾代的候選（strain-fixing.md §2.2）；下一代的候選看得出公母再問。 */
  c17Gen?: number;
  /** C17、C19 換了一對之後，到那對的母魚生下一窩之前：C11 選了分開養的話照樣把別尾公魚搬走。 */
  nextGen?: number;
  /**
   * 品系的名字（C18，穩定度第一次 ≥ LINE_NAME_PCT 取的）：名字、取名那天（遊戲小時）、那一窩的穩定度和幾尾。
   * done：穩定度第一次 ≥ LINE_FIXED_PCT（品系完成）的時間和那窩的穩定度。
   */
  lineNamed?: { name: string; hours: number; stability: number; n: number; k: number; done?: { hours: number; stability: number } };
  /** 品系最新一代要留著配下一代的候選（lineCandidates，每天早上更新）：不賣、不交單。 */
  lineKeep?: number[];
  /** C19 上次問的時候，品系最近一代的近交係數；再多 INBREEDING_STEP 再問。 */
  c19At?: number;
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

/** 品系的一窩：媽媽、出生時間、幾尾、幾尾是夢想魚、第幾代。 */
export interface LineBrood {
  momId: number;
  /** 爸爸是哪尾（舊存檔、店裡買來就懷孕的沒有）。 */
  dadId?: number;
  born: number;
  n: number;
  k: number;
  gen: number;
  albino?: boolean;
  fins?: boolean;
  color?: boolean;
  snake?: boolean;
  told?: boolean;
  sexing?: boolean;
}

/** 卡出過、玩家沒選，隔幾天再出一次。 */
export const CHOICE_RESHOW_DAYS = 3;
/** 選種後至少隔幾天才出配對卡（C4）。 */
export const PAIR_AFTER_PICK_DAYS = 2;
// 選種日（C2）的天數放在 growth.ts：任務卡的進度句也要用，跟早上報告說的天數一樣（g37）
export { PICK_AFTER_BROOD_DAYS };
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
/** C13 孕期調高水溫（midgame.md §6.6）：調到幾度（缸裡有怕熱的魚就照牠們的上限）。 */
export const WARM_PREG_C = 28;
/** C9 重複版（midgame.md §6.5）：這幾天內也會到 BROOD_AGAIN_SHOWS 的母魚合成一張卡。 */
export const BROOD_GROUP_DAYS = 3;
/** C9 重複版：上次選完幾天內又有母魚快生，就直接照上次，不跳卡。 */
export const BROOD_AGAIN_GAP_DAYS = 7;
/** C9 重複版：連續選幾次「照上次」之後就自動照做。 */
export const BROOD_AUTO_AFTER = 2;
/** C9 自動照上次時早上報告那一行的做法。 */
const BROOD_AUTO_DO: Record<string, string> = { grow: '整窩留著長大', sell: '長到能交就照訂單交', keep: '生下來挑備用種魚' };
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

/** 留種那對的公魚不在了、母魚還懷著牠的：只有母魚（dad 只帶 id）。 */
function widowedMom(tanks: TankState[], s: Readonly<ChoiceState>): { mom: Fish; dad: { id: number } } | null {
  if (!s.pair) return null;
  const mom = located(tanks).find(({ fish }) => fish.id === s.pair![0])?.fish;
  return mom && mom.pregnancy > 0 && mom.sire?.id === s.pair[1] ? { mom, dad: { id: s.pair[1] } } : null;
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

/** 顯色到可以配之間的成長卡（midgame.md §6.7）：尾巴拉長、母魚長大一圈、交接鰭長好。 */
export type GrowStep = 'tail' | 'plump' | 'adult';
/** 各張在顯色到可以配之間的哪裡（照時間算）。 */
export const GROW_AT: Record<GrowStep, number> = { tail: 1 / 3, plump: 1 / 2, adult: 2 / 3 };

export interface Milestone {
  step: MilestoneStep | GrowStep;
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
  const add = (id: string, m: Omit<Milestone, 'earlierDays'> & { step: MilestoneStep }) => {
    if (seen.includes(id)) return;
    seen.push(id);
    if (!fresh) out.push({ ...m, earlierDays: gain(m.step), text: m.text + note(m.step) });
  };
  for (const f of [p.mom, p.dad]) {
    if (reached(f, 'sex')) add(`${f.id}:sex`, { step: 'sex', fishId: f.id, text: f.sex === 'male' ? `${name(f)}肛鰭開始變尖了，是公魚！` : `${name(f)}看得到胎斑了，是母魚！` });
  }
  if (reached(p.dad, 'color')) {
    const traits = p.dad.genome ? guppyTraits(phenotype(p.dad.genome)).filter((x) => !x.key.startsWith('tail:')).map((x) => x.name).join('、') : '';
    if (!seen.includes(`${p.dad.id}:color`)) s.colorHours = tanks[0].hours;
    add(`${p.dad.id}:color`, { step: 'color', fishId: p.dad.id, text: `${name(p.dad)}開始顯色了${traits ? `，尾巴的${traits}出來了` : ''}` });
  }
  if (reached(p.mom, 'ready') && reached(p.dad, 'ready')) add(`${key}:ready`, { step: 'ready', fishId: p.dad.id, partnerId: p.mom.id, text: `${name(p.dad)}長大了，可以配對了！` });
  return out;
}

/**
 * 早上報告用：留種那對顯色到可以配之間的成長卡（midgame.md §6.7），一個早上最多一張。
 * 照時間算到了 1/3（尾巴拉長）、1/2（母魚長大一圈）、2/3（交接鰭長好）就出；
 * busy：今天已經有別的卡（選擇卡、里程碑、開獎），往後挪一天。
 */
export function takeGrowMilestone(tanks: TankState[], busy: boolean): Milestone | null {
  const s = choiceState(tanks);
  const p = pairFish(tanks, s);
  if (busy || !p || s.colorHours === undefined || s.milestonePair !== `${p.mom.id}-${p.dad.id}`) return null;
  const t = tanks[p.tank];
  const plan = s.plan ?? 'standard';
  const [momDays, dadDays] = [p.mom, p.dad].map((f) => daysToMilestone(t, f, 'ready', plan));
  const left = Math.max(momDays, dadDays);
  if (left <= 0) return null;
  const since = (tanks[0].hours - s.colorHours) / 24;
  const at = since / (since + left);
  const seen = (s.milestoneSeen ??= []);
  const step = (Object.keys(GROW_AT) as GrowStep[]).find((k) => at >= GROW_AT[k] && !seen.includes(`${p.dad.id}:${k}`));
  if (!step) return null;
  seen.push(`${p.dad.id}:${step}`);
  const n = Math.max(1, Math.round(left));
  if (step === 'tail') return { step, fishId: p.dad.id, text: `${callName(p.dad)}的尾巴開始拉長了，顏色也一天比一天深。` };
  if (step === 'plump') return { step, fishId: p.mom.id, text: `${callName(p.mom)}這週又長大一圈，身體看起來厚實多了。` };
  const mom = momDays > dadDays ? `${callName(p.mom)}還要再長一點，大約 ${n} 天` : `${callName(p.mom)}體型也夠了，再大約 ${n} 天就能配對`;
  return { step, fishId: p.dad.id, partnerId: p.mom.id, text: `${callName(p.dad)}的交接鰭長好了，已經是大人了。${mom}。` };
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
  // 懷孕過半的母魚算上那窩小魚兩週後的大小（繁殖缸才不會一生就爆，midgame.md §7）
  let room = CROWD_WARN * tanks[to].equipment.tank.volumeL - crowdingRatio(tanks[to]) * tanks[to].equipment.tank.volumeL - tanks[to].fish.reduce((a, f) => a + broodSoonCm(f), 0);
  // 育幼盒裡留種的、自家的小魚也搬（繁殖缸就是讓牠們長大的地方，#322）
  const movable = (f: Fish) => f.alive && !f.listing && f.species === 'guppy' && (!f.nursery || f.keeper || (bred(f) && isJuvenile(f)));
  // C11 選了分開養：留種母魚在繁殖缸的話，不是指定爸爸的公魚不搬進去（#326）
  const s = economy(tanks[0]).choices;
  const split = s && splitting(s) ? pairFish(tanks, s) : null;
  const rival = (f: Fish) => !!split && split.tank === to && f.sex === 'male' && growthStage(f) !== 'fry' && !sireIds(s!).includes(f.id);
  const others = tanks.flatMap((t, tank) => (tank === to || t.purpose === 'breeding' ? [] : t.fish.filter((f) => movable(f) && !rival(f)).map((fish) => ({ fish, tank }))));
  const rank = (f: Fish) => (f.keeper ? 0 : f.sex === 'female' && f.pregnancy > 0.5 ? 1 : bred(f) && isJuvenile(f) ? 2 : 3);
  let fish = others
    .filter(({ fish }) => rank(fish) < 3)
    .sort((a, b) => rank(a.fish) - rank(b.fish))
    .filter(({ fish }) => {
      const cm = fish.lengthCm * sizeRatio(fish) + broodSoonCm(fish);
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
/** C15 選等快生再放育幼盒：懷孕到多少就放進去（約剩 3 天；每天早上看一次，太晚會來不及）。跟任務卡同一個門檻，定義在 nursery.ts。 */
export { BOX_DUE };
/** 懷孕後段的里程碑（midgame.md §6.4）：胎斑變大變黑、看得到小魚的眼睛。 */
export const BELLY_MILESTONES = [
  { key: 'dark', at: 0.7 },
  { key: 'eyes', at: BOX_DUE },
] as const;
/** 開局第一尾快生的母魚（polish-to-9.md §7.1，買來就 0.88～0.92）：買回來隔天說胎斑變大，快生時說看得到眼睛（取代一般的「出現黑色胎斑」）。 */
const FIRST_BELLY = [
  { key: 'dark', at: BELLY_DARK },
  { key: 'eyes', at: DUE_PREGNANCY },
] as const;
/** 品系下一代懷孕前段的里程碑（開獎那窩有 C15 開獎準備，之後的每代沒有）。 */
const LINE_BELLY = { key: 'round', at: 0.3 } as const;
/** C14 問過之後，隔幾天還是很擠再問一次；超過建議量（加強版）隔 CROWD_FULL_REASK_DAYS 天。 */
const CROWD_REASK_DAYS = 7;
const CROWD_FULL_REASK_DAYS = 2;
/** 擠缸預告（midgame.md §7.1）：到這個比例、而且算上快生的那窩會超過建議量，早上報告先說一行。 */
export const CROWD_PREVIEW = 0.6;
/** 超過建議量：C14 加強版、早上報告第一行。 */
export const CROWD_FULL = 1;
/** C14 還沒超過建議量時，買了缸手上至少還要留多少錢才推買缸。 */
const CROWD_TANK_RESERVE = 1000;
/** C14 賣一批賣到剩多少擠（低於快生提示那條線，才不會一窩生下來又馬上擠）。 */
const CROWD_SELL_TO = 0.5;
/** 預告時一尾剛生的小魚兩週後大約佔多少（體長 × 體型比例，cm）。 */
const FRY_SOON_CM = 0.36;
/** C14 選先多換水：換多少、幾天後再問（加強版 2 天）。 */
const CROWD_WATER = 0.3;
const CROWD_WATER_DAYS = 3;
/** C16：開獎後幾天問、推薦留幾尾候選。 */
export const REVEAL_CULL_DAYS = 7;
const REVEAL_KEEP = [4, 6] as const;
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
function otherTank(tanks: TankState[], not: number, skip: readonly number[] = []): number {
  // 加熱棒壞了、水溫低於適溫的缸不搬過去（#404，g31：擠缸卡推薦搬回冷缸，又冷死）
  const idx = tanks.map((_, i) => i).filter((i) => i !== not && !skip.includes(i) && !coldWithoutHeater(tanks[i]));
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

/**
 * C10 留種名額滿了要換掉誰：跟新的這尾同性別的留種裡，離夢想魚最遠的（缺的最多；一樣多先換不是那對的）。
 * 那對的另一半（異性）不會被換到。沒有同性別的留種、或最遠的也沒比新的這尾遠，回 null。
 */
function worstKeeper(tanks: TankState[], s: Readonly<ChoiceState>, nu: Fish): { fish: Fish; tank: number } | null {
  const pair: readonly number[] = s.pair ?? [];
  const cands = located(tanks).filter(({ fish }) => fish.keeper && fish.id !== nu.id && fish.sex === nu.sex && fish.genome);
  const score = (f: Fish) => dreamMissing(f).length * 10 + (pair.includes(f.id) ? 0 : 1);
  const worst = cands.sort((a, b) => score(b.fish) - score(a.fish))[0];
  // 換了也不會比較好（缺的一樣多）就不換
  return worst && dreamMissing(worst.fish).length > dreamMissing(nu).length ? worst : null;
}

/** C12 的第二尾母魚：別的留種母魚裡，配指定公魚機率最高的。 */
function secondMom(tanks: TankState[], mom: Fish, dad: Fish, line = false): { fish: Fish; tank: number } | null {
  const cands = located(tanks).filter(({ fish }) => fish.keeper && fish.id !== mom.id && fish.sex === 'female' && fish.species === 'guppy' && fish.genome && !fish.listing);
  const odds = (f: Fish) => (line ? dreamShare(f.genome!, dad.genome!) : pairDream(f.genome!, dad.genome!));
  return cands.sort((a, b) => odds(b.fish) - odds(a.fish))[0] ?? null;
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

/**
 * C14 沒有交得出的單：賣給阿德收購，賣到這缸剩 CROWD_SELL_TO（不賣留種的、指定的爸爸、全家最好的幾尾有夢想魚基因的）。
 * 大的先賣，照今天還能賣的次數；超過建議量時，滿 7 天的小小魚也賣（一袋 FRY_BAG 尾算賣一次，沒那麼擠就留著長大賣得比較好）。
 */
function shopBatch(tanks: TankState[], tank: number): Fish[] {
  const t = tanks[tank];
  const fryToo = crowdingRatio(t) >= CROWD_FULL;
  const vol = t.equipment.tank.volumeL;
  let over = (crowdingRatio(t) - CROWD_SELL_TO) * vol;
  const sires = sireIds(choiceState(tanks));
  // 品系候選和其他有夢想魚基因的加起來最多留 DREAM_SPARE 尾（品系候選優先），缸才不會一直爆
  const line = choiceState(tanks).lineKeep ?? [];
  const spare = new Set([...line, ...[...dreamSpares(tanks)].filter((id) => !line.includes(id)).slice(0, Math.max(0, DREAM_SPARE - line.length))]);
  // 育幼盒裡的小魚也撈出來賣（盒子也在同一缸水裡）
  const cands = t.fish.filter((f) => !buybackRefusal(f, true) && !spare.has(f.id) && !sires.includes(f.id));
  const out: Fish[] = [];
  let sales = sellsLeftToday(tanks[0]);
  let fry = 0;
  for (const f of cands.sort((a, b) => b.lengthCm * sizeRatio(b) - a.lengthCm * sizeRatio(a))) {
    if (over <= 0) break;
    if (isFrySale(f)) {
      if (!fryToo) continue;
      if (fry % FRY_BAG === 0 && sales-- <= 0) break;
      fry++;
    } else if (sales-- <= 0) continue;
    out.push(f);
    over -= f.lengthCm * sizeRatio(f);
  }
  return out;
}

/** 留種以外，有夢想魚基因的魚最多保留幾尾不賣（全家；離夢想魚最近的優先）。 */
const DREAM_SPARE = 6;

/**
 * 賣一批時不賣的有夢想魚基因的魚：全家離夢想魚最近的 DREAM_SPARE 尾（留種的本來就不賣）。
 * 整缸都是夢想魚那對的後代時，留下最好的幾尾，其他的還是能賣，缸才不會一直爆。
 */
function dreamSpares(tanks: TankState[]): Set<number> {
  const rank = (f: Fish) => (isDreamLook(f.genome!) ? 0 : 100) + dreamMissing(f).length * 10 - f.lengthCm;
  const dream = located(tanks).map(({ fish }) => fish).filter((f) => !f.keeper && f.genome && hasDreamGenes(f));
  return new Set(dream.sort((a, b) => rank(a) - rank(b)).slice(0, DREAM_SPARE).map((f) => f.id));
}

/** 懷孕過半的母魚：那窩小魚兩週後大約佔多少（cm，擁擠度用）。 */
function broodSoonCm(f: Fish): number {
  const b = FISH_SPECIES[f.species].breeding;
  if (!f.alive || f.sex !== 'female' || f.pregnancy <= 0.5 || !b || !usesNursery(f.species)) return 0;
  return Math.round(b.broodMean * f.health) * FRY_SOON_CM;
}

/** 這缸快生的母魚（懷孕 ≥ 0.7）生下來大約幾尾。 */
function dueFry(t: TankState): number {
  return t.fish
    .filter((f) => f.alive && f.sex === 'female' && f.pregnancy >= 0.7 && FISH_SPECIES[f.species].breeding && usesNursery(f.species))
    .reduce((a, f) => a + Math.round(FISH_SPECIES[f.species].breeding!.broodMean * f.health), 0);
}

/** 算上快生的那窩（兩週後的大小）的擁擠度。 */
const crowdSoon = (t: TankState) => crowdingRatio(t) + (dueFry(t) * FRY_SOON_CM) / t.equipment.tank.volumeL;

/**
 * C14：最擠、到了快養滿（CROWD_WARN，跟分缸提示同一把尺）的那缸（快生的那窩會擠爆只出早上那一行預告，不出卡）。
 * 選了自動賣，沒超過建議量就不再問（自動賣會處理）。
 */
function crowdedTank(tanks: TankState[], s?: Readonly<ChoiceState>): number {
  let best = -1;
  tanks.forEach((t, i) => {
    const r = crowdingRatio(t);
    if (s?.crowdAuto && r < CROWD_FULL) return;
    if (r >= CROWD_WARN && (best < 0 || r > crowdingRatio(tanks[best]))) best = i;
  });
  return best;
}

/** 公母分開：這缸要搬走的公魚（看得出公母、不是留種的或指定的爸爸、不在育幼盒；只算那缸放得下的）和搬去哪缸；沒有別缸回 -1。 */
function crowdMales(tanks: TankState[], s: Readonly<ChoiceState>, tank: number): { fish: Fish[]; to: number } {
  const sires = sireIds(s);
  const fish = tanks[tank].fish.filter((f) => f.alive && !f.nursery && f.sex === 'male' && !isShrimpSpecies(f.species) && usesNursery(f.species) && growthStage(f) !== 'fry' && !f.keeper && !sires.includes(f.id));
  // 不搬去也選了公母分開的缸（不然兩缸互搬）
  const to = otherTank(tanks, tank, s.crowdSplit);
  if (to < 0) return { fish, to };
  // 只搬那缸還放得下的（搬完不到快養滿），大的先搬；放不下的留著，不把別缸擠爆
  const dest = tanks[to];
  let room = (CROWD_WARN - crowdingRatio(dest)) * dest.equipment.tank.volumeL;
  const fit: Fish[] = [];
  for (const f of fish.sort((a, b) => b.lengthCm - a.lengthCm)) {
    const cm = f.lengthCm * sizeRatio(f);
    if (cm > room) continue;
    fit.push(f);
    room -= cm;
  }
  return { fish: fit, to };
}

/**
 * 搬一些到別缸：最空的那缸（搬完不超過 CROWD_PREVIEW），搬不是留種、不是指定爸爸、不會被那缸成魚吞掉的魚，
 * 大的先搬，搬到這缸剩 CROWD_SELL_TO。沒有地方回 null。
 */
function crowdMove(tanks: TankState[], s: Readonly<ChoiceState>, tank: number): { fish: Fish[]; to: number } | null {
  const t = tanks[tank];
  const others = tanks.map((_, i) => i).filter((i) => i !== tank && crowdingRatio(tanks[i]) < CROWD_PREVIEW && !coldWithoutHeater(tanks[i]));
  if (others.length === 0) return null;
  const to = others.sort((a, b) => crowdingRatio(tanks[a]) - crowdingRatio(tanks[b]))[0];
  const dest = tanks[to];
  const sires = sireIds(s);
  let over = (crowdingRatio(t) - CROWD_SELL_TO) * t.equipment.tank.volumeL;
  let room = (CROWD_PREVIEW - crowdingRatio(dest)) * dest.equipment.tank.volumeL;
  const cands = t.fish.filter((f) => f.alive && !f.keeper && f.listing === undefined && !sires.includes(f.id) && !tooSmallForTank(dest, f));
  const out: Fish[] = [];
  for (const f of cands.sort((a, b) => b.lengthCm - a.lengthCm)) {
    const cm = f.lengthCm * sizeRatio(f);
    if (over <= 0) break;
    if (cm > room) continue;
    out.push(f);
    over -= cm;
    room -= cm;
  }
  return out.length > 0 ? { fish: out, to } : null;
}

/** 在水面喘氣的魚（溶氧不夠時看得到，小小魚不算）。 */
function gasping(t: TankState): number {
  if (t.water.o2 >= 4) return 0;
  return t.fish.filter((f) => f.alive && !f.nursery && growthStage(f) !== 'fry' && !FISH_SPECIES[f.species].airBreather).length;
}

/** 賣一批給阿德（shopBatch）：回傳賣了幾尾、收入。 */
function sellCrowd(tanks: TankState[], i: number): { coins: number; n: number } {
  const t = tanks[i];
  let coins = 0;
  let n = 0;
  for (const f of shopBatch(tanks, i)) {
    const got = sellFish(t, f.id);
    if (got > 0) {
      coins += got;
      n++;
    }
  }
  return { coins, n };
}

/** 開獎那窩還活著的小魚。 */
function revealBrood(tanks: TankState[], s: Readonly<ChoiceState>): Array<{ fish: Fish; tank: number }> {
  const r = s.reveal;
  if (!r?.done) return [];
  return located(tanks).filter(({ fish }) => fish.motherId === r.momId && (fish.bornHours ?? -Infinity) >= r.hours && !fish.keeper);
}

/** 帶著夢想魚的兩種基因：白子（隱性也算）和蛇紋（公魚的蛇紋在 X 或 Y，母魚看 X）。 */
function carriesDreamGenes(f: Fish): boolean {
  const g = f.genome!;
  return g.albino.includes(1) && (g.snakeX.includes(1) || (f.sex === 'male' && g.y?.snake === 1));
}

/** C16 每個性別至少留幾尾（strain-fixing.md §5：公母各至少 2 尾）。 */
const REVEAL_KEEP_SEX = 2;

/**
 * C16 要留的候選（midgame.md §7.3、strain-fixing.md §5）：照「夢想魚樣子 → 帶兩種基因 → 離夢想魚最近」排，
 * 公母各至少 REVEAL_KEEP_SEX 尾，一共 4～6 尾（夢想魚樣子的有幾尾就盡量留幾尾）。
 * 開獎那窩某個性別不夠，用開局的種魚和備用種魚補（extra，本來就留著，不會被賣）。
 */
function revealKeep(tanks: TankState[], s: Readonly<ChoiceState>, brood: Array<{ fish: Fish; tank: number }>, size?: number): { keep: Set<number>; looks: number; extra: Array<{ fish: Fish; tank: number }> } {
  const withGenome = brood.filter(({ fish }) => fish.genome);
  const looks = withGenome.filter(({ fish }) => isDreamLook(fish.genome!)).length;
  const n = Math.min(withGenome.length, size ?? Math.max(REVEAL_KEEP[0], Math.min(REVEAL_KEEP[1], looks)));
  // 公魚的蛇紋看得到的多半在 Y 上；X 也帶的兒子才傳得給女兒，下一代才到得了七成五（#359），一樣好的先留
  const xSon = (f: Fish) => (f.sex === 'male' && f.genome!.snakeX.includes(1) ? -5 : 0);
  const rank = (f: Fish) => (isDreamLook(f.genome!) ? 0 : carriesDreamGenes(f) ? 100 : 200) + dreamMissing(f).length * 10 + xSon(f);
  // 一樣好的先留大的（早一點看得出公母、能配）
  const sorted = withGenome.map(({ fish }) => fish).sort((a, b) => rank(a) - rank(b) || (a.bornHours ?? 0) - (b.bornHours ?? 0));
  // 先保住每個性別最好的 REVEAL_KEEP_SEX 尾，剩下的名額照排名補滿
  const keep = new Set<number>();
  for (const sex of ['male', 'female'] as const) for (const f of sorted.filter((x) => x.sex === sex).slice(0, REVEAL_KEEP_SEX)) keep.add(f.id);
  for (const f of sorted) if (keep.size < n) keep.add(f.id);
  // 某個性別不夠：開局的種魚、留種的那對和備用種魚裡，同性別、帶得最多的補上
  const extra: Array<{ fish: Fish; tank: number }> = [];
  const broodIds = new Set(brood.map(({ fish }) => fish.id));
  const parents = new Set([s.reveal?.momId, ...(s.pair ?? []), ...(s.mates ?? [])]);
  for (const sex of ['male', 'female'] as const) {
    const short = REVEAL_KEEP_SEX - sorted.filter((f) => f.sex === sex && keep.has(f.id)).length;
    if (short <= 0) continue;
    const cands = located(tanks)
      .filter(({ fish }) => fish.sex === sex && fish.species === 'guppy' && fish.genome && !broodIds.has(fish.id) && !isJuvenile(fish) && (fish.keeper || parents.has(fish.id)))
      .sort((x, y) => rank(x.fish) - rank(y.fish));
    extra.push(...cands.slice(0, short));
  }
  return { keep, looks, extra };
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
/** C13 孕期要調到的水溫：WARM_PREG_C，缸裡有怕熱的魚就照牠們能忍的上限。 */
function warmTarget(t: TankState): number {
  return Math.min(WARM_PREG_C, ...t.fish.filter((f) => f.alive).map((f) => FISH_SPECIES[f.species].temp.max));
}

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
      const to = cyclingTank(tanks);
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
      const group = broodRepeat(s) ? broodMoms(tanks, s, BROOD_GROUP_DAYS) : broodMoms(tanks, s, 0).slice(0, 1);
      const mom = group[0];
      if (!mom) return null;
      const coins = Math.round((FISH_SPECIES[mom.fish.species].breeding!.broodMean * mom.fish.health * 0.5 * JUVENILE_ORDER_PRICE) / 10) * 10;
      const options = broodOptions(coins);
      const last = s.picked.C9 && options.find((o) => o.key === s.picked.C9);
      if (last && (s.broods ?? 0) >= 1) {
        // 第二次之後（midgame.md §6.1）：一鍵照上次，或直接點另外兩個
        return {
          id,
          tank: mom.tank,
          title: group.length > 1 ? `${group.length} 尾母魚這幾天快生了` : `${callName(mom.fish)}又快生了`,
          owner: group.length > 1 ? '照上次的處理，還是這次改一下？選一次全部套用。' : '照上次的處理，還是這次改一下？',
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
      // 留種名額滿了（strain-fixing.md §1）：換掉同性別、離夢想魚最遠的那尾留種；換掉的是那對的，新的這尾接手當爸爸或媽媽
      const worst = room ? null : worstKeeper(tanks, s, nu.fish);
      if (!room && !worst) return null;
      return {
        id,
        tank: nu.tank,
        title: '這尾比你留的種魚更好！',
        owner: `${callName(nu.fish)}的孫代機率約 ${b.newPct}%，原本的${callName(old.fish)}約 ${b.oldPct}%。`,
        options: room
          ? [
              { key: 'swap', label: '換成這尾', outcome: `${nu.fish.sex === 'male' ? '牠當爸爸' : '牠當媽媽'}，原本的不再留種` },
              { key: 'both', label: '兩尾都留', outcome: '多一尾種魚，原本的計畫照走，萬一出事還有備用', recommended: true },
              { key: 'keep', label: '維持原本的', outcome: '照原本的計畫' },
            ]
          : [
              {
                key: 'replace',
                label: `換掉${callName(worst!.fish)}`,
                outcome: s.pair?.includes(worst!.fish.id) ? `孫代 ${b.oldPct}% → ${b.newPct}%` : `${callName(worst!.fish)}不再留種，這尾當備用，原本的計畫照走`,
                recommended: true,
              },
              { key: 'keep', label: '維持原本的', outcome: `留種名額滿了（最多 ${MAX_KEEPERS} 尾），照原本的計畫` },
            ],
        fish: [pickFish(nu.fish, nu.tank), pickFish((worst ?? old).fish, (worst ?? old).tank)],
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
      // 開獎之後（品系的下一代）看這一窩的穩定度：第二尾母魚差太多會拉低穩定度，就不推
      const line = !!s.reveal?.done;
      const odds = (m: GuppyGenome, d: GuppyGenome) => (line ? dreamShare(m, d) : pairDream(m, d));
      const one = odds(p.mom.genome, p.dad.genome);
      const mom2 = secondMom(tanks, p.mom, p.dad, line);
      const two = mom2 ? odds(mom2.fish.genome!, p.dad.genome) : 0;
      const recTwo = !!mom2 && (!line || two >= one - TAIL_TIE_PCT);
      const dad2 = secondDad(tanks, s, p.mom);
      // 配上（約 2 天）＋懷孕（孕期照水溫）
      const sp = FISH_SPECIES[p.mom.species].breeding!;
      const born = Math.round(wait + 2 + sp.gestationDays / Math.sqrt(temperatureFactor(t.water.tempC)));
      // 照推薦（C13 孕期調高水溫，#335）：懷上之後問 C13，之後照調高的水溫算
      const warmC = t.equipment.heater ? Math.max(t.water.tempC, warmTarget(t)) : t.water.tempC;
      const gest = (f: number, c: number) => (f * sp.gestationDays) / Math.sqrt(temperatureFactor(c));
      const reveal = Math.round(wait + 2 + gest(PREG_ASK[0], t.water.tempC) + gest(1 - PREG_ASK[0], warmC));
      return {
        id,
        tank: p.tank,
        title: '種魚長大了，怎麼配？',
        owner: `配上之後大約 ${born} 天生（約第 ${dayOf(home.hours + born * 24)} 天）。`,
        options: [
          ...(mom2 ? [{ key: 'two', label: '1 公配 2 母', outcome: `母魚壓力小，約 ${avgPct(one, two)}%`, recommended: recTwo }] : []),
          { key: 'one', label: '1 公配 1 母', outcome: `血統最單純，約 ${one}%`, recommended: !recTwo },
          ...(dad2 ? [{ key: 'rotate', label: '2 尾公魚輪流', outcome: `看哪尾比較好，約 ${avgPct(one, odds(p.mom.genome, dad2.fish.genome!))}%` }] : []),
        ],
        motherId: p.mom.id,
        fatherId: p.dad.id,
        note: `照推薦，大約第 ${dayOf(home.hours + reveal * 24)} 天開獎`,
      };
    }
    case 'C13': {
      const m = pregnantMom(tanks, s);
      if (!m) return null;
      const d = Math.max(1, Math.round(daysToBirth(tanks[m.tank], m.fish) ?? 1));
      const sp = FISH_SPECIES[m.fish.species].breeding!;
      const more = Math.max(1, Math.round(sp.broodMean * m.fish.health * (broodFactor(1) - broodFactor(m.fish.breedingCondition))));
      // 孕期調高水溫（#335）：懷孕天數本來就照水溫走（population.ts），早幾天生
      const t = tanks[m.tank];
      const warmC = warmTarget(t);
      const warmD = Math.max(1, Math.round(((1 - m.fish.pregnancy) * sp.gestationDays) / Math.sqrt(temperatureFactor(warmC))));
      const early = d - warmD;
      const today = dayOf(home.hours);
      const noWarm = !t.equipment.heater ? '這缸沒有加熱棒，調不了水溫' : early < 1 ? '水溫已經夠高了' : undefined;
      const warm = `水溫調到 ${warmC}°C`;
      const warmOut = `約早 ${early} 天生（第 ${today + d} → ${today + warmD} 天），水裡的氧少一點，${t.equipment.airPump ? '打氣會幫你開著' : '記得開打氣'}`;
      return {
        id,
        tank: m.tank,
        title: `${callName(m.fish)}懷孕了！`,
        owner: `再約 ${d} 天生。孕期吃得好，一窩可能多幾尾。`,
        options: [
          { key: 'standard', label: '標準飼料', outcome: '照現在餵，水比較好顧' },
          { key: 'live', label: '加活餌', outcome: `一窩可能多 ${more} 尾左右，水比較髒要多換水` },
          { key: 'warm', label: warm, outcome: warmOut, recommended: !noWarm, disabled: noWarm },
          { key: 'both', label: `加活餌＋${warm}`, outcome: `多幾尾，也早 ${early} 天生；水比較髒、氧比較少，要多換水、開打氣`, disabled: noWarm },
        ],
        checks: ['live', 'warm'],
        motherId: m.fish.id,
      };
    }
    case 'C14': {
      const i = crowdedTank(tanks, s);
      if (i < 0) return null;
      const t = tanks[i];
      const full = crowdingRatio(t) >= CROWD_FULL;
      // 超過建議量：直接從這缸賣一批給阿德（交單的魚不一定從這缸出，不一定解得了擠）
      const o = full ? null : bestSellOrder(tanks);
      const batch = o ? [] : shopBatch(tanks, i);
      const big = !tankLock(tanks, 'std90');
      const sell = o ? `${orderTitle(o)} ${o.unitPrice * o.count} 元` : batch.length > 0 ? `${batch.length} 尾賣給阿德，約 ${batch.reduce((a, f) => a + fishBuybackPrice(f), 0)} 元` : null;
      const males = crowdMales(tanks, s, i);
      const splitOk = males.to >= 0 && males.fish.length > 0 && !s.crowdSplit?.includes(i);
      const fryCm = t.fish.filter((f) => f.alive && growthStage(f) === 'fry').reduce((a, f) => a + f.lengthCm * sizeRatio(f), 0);
      const allCm = crowdingRatio(t) * t.equipment.tank.volumeL;
      const fryHeavy = fryCm >= allCm / 2;
      // 別缸有空、搬過去就不擠了：先搬（還能繼續生、繼續交單），不用停生
      const move = crowdMove(tanks, s, i);
      // 有空位卻太冷的缸：選項反灰，寫為什麼不能搬（#404）
      const coldOther = move ? -1 : tanks.findIndex((x, j) => j !== i && crowdingRatio(x) < CROWD_PREVIEW && coldWithoutHeater(x));
      const moveEnough = !!move && crowdingRatio(t) - move.fish.reduce((a, f) => a + f.lengthCm * sizeRatio(f), 0) / t.equipment.tank.volumeL < CROWD_WARN;
      // 擠的多半是小小魚：先停生（搬再多也會一直生）；只是快生了：公母分開要搬得動夠多公魚（搬完不到快養滿）、又沒地方搬才推
      const splitEnough = crowdingRatio(t) - males.fish.reduce((a, f) => a + f.lengthCm * sizeRatio(f), 0) / t.equipment.tank.volumeL < CROWD_WARN;
      const recSplit = splitOk && (fryHeavy || (splitEnough && !moveEnough && (dueFry(t) > 0 || !sell)));
      // 賣一批之後還是超過建議量（賣不掉的小小魚太多）：別缸有空就先搬過去
      const soldCm = batch.reduce((a, f) => a + f.lengthCm * sizeRatio(f), 0);
      const sellEnough = !!o || (sell !== null && crowdingRatio(t) - soldCm / t.equipment.tank.volumeL < CROWD_FULL);
      const autoOk = !!sell && (s.crowdSells ?? 0) >= 2;
      const tankCost = newTankCost(tanks, 'nano20');
      const noTank = buyTankRefusal(tanks, 'nano20');
      const noBig = buyTankRefusal(tanks, 'std90');
      // 推薦順序：停生 → 搬過去就不擠 → 賣一批就回到建議量以下 → 買缸、（超過建議量）換大缸 → 賣一點、搬一點 → 先多換水撐著
      // 買了缸手上還有 CROWD_TANK_RESERVE 才推買缸（不然先換水撐著）；超過建議量時第二、三缸不看錢，
      // 第四缸起一樣要留（後期一缸兩千多，賣魚很久賺不回來，strain-fixing.md §9）
      const tankOk = !noTank && ((full && tanks.length < 3) || economy(home).coins - tankCost >= CROWD_TANK_RESERVE);
      const rec = recSplit ? 'split' : moveEnough ? 'move' : sellEnough ? 'sell' : tankOk ? 'tank' : full && big && !noBig ? 'big' : sell ? 'sell' : move ? 'move' : 'water';
      // 還沒超過建議量、又只能先多換水（擠的是賣不了也搬不走的小小魚，錢也不夠買缸）：不出卡，早上報告那行擠缸提醒就夠了（#359）
      if (!full && rec === 'water') return null;
      const recSell = rec === 'sell';
      const recMove = rec === 'move';
      const recTank = rec === 'tank';
      const recBig = rec === 'big';
      const ammonia = Math.round(t.water.tan * 100) / 100;
      const gasp = gasping(t);
      const card: ChoiceCard = {
        id,
        tank: i,
        title: full ? `${tankLabel(tanks, i)}太擠了` : `${tankLabel(tanks, i)}快住不下了`,
        owner: full ? `氨 ${ammonia}${gasp > 0 ? `，有 ${gasp} 尾魚在水面喘氣` : '，魚都擠在一起'}。再不處理會開始死魚。` : '魚太擠，水質會變差，也容易生病。',
        options: [
          ...(males.fish.length > 0 && !s.crowdSplit?.includes(i)
            ? [{ key: 'split', label: '公母分開，先別生了', outcome: `把 ${males.fish.length} 尾公魚搬到${males.to >= 0 ? tankLabel(tanks, males.to) : '另一缸'}，留種那對不動`, recommended: recSplit, ...(males.to < 0 ? { disabled: '只有一缸，先買第二缸' } : {}) }]
            : []),
          // 已經連賣兩次：推薦以後自動賣（留種的不賣），不用每次跳卡
          ...(sell ? [{ key: 'sell', label: '賣一批', outcome: sell, recommended: recSell && !autoOk }] : []),
          ...(move
            ? [{ key: 'move', label: `搬一些到${tankLabel(tanks, move.to)}`, outcome: `${move.fish.length} 尾大一點的搬過去，留種的不動`, recommended: recMove }]
            : coldOther >= 0
              ? [{ key: 'move', label: `搬一些到${tankLabel(tanks, coldOther)}`, outcome: '加熱棒壞了，水太冷', recommended: false, disabled: `${tankLabel(tanks, coldOther)}太冷了，先把加熱棒弄好` }]
              : []),
          ...(autoOk ? [{ key: 'auto', label: '以後太擠就自動賣給阿德', outcome: `留種的不賣；這次先${o ? `交${sell}` : `賣 ${batch.length} 尾`}`, recommended: recSell }] : []),
          { key: 'tank', label: tanks.length === 2 ? '買第三缸' : '再買一缸', outcome: `20L 套缸 ${tankCost} 元`, recommended: recTank, ...(noTank ? { disabled: noTank } : {}) },
          ...(big ? [{ key: 'big', label: '換大缸', outcome: `90L，${newTankCost(tanks, 'std90')} 元`, recommended: recBig, ...(noBig ? { disabled: noBig } : {}) }] : []),
          // 先多換水只是撐著：永遠不標推薦（daily-loop.md §4）
          { key: 'water', label: '先多換水撐幾天', outcome: full ? '換三成水，撐 2 天' : `換三成水，${CROWD_WATER_DAYS} 天後再看` },
        ],
      };
      // 除了先多換水都選不了：不出卡，早上報告那行擠缸提醒就夠了
      return card.options.some((o) => o.key !== 'water' && !o.disabled) ? card : null;
    }
    case 'C16': {
      if (s.revealCullAsked || !s.reveal?.done) return null;
      const brood = revealBrood(tanks, s);
      if (brood.length <= REVEAL_KEEP[1]) return null;
      const born = Math.min(...brood.map(({ fish }) => fish.bornHours ?? home.hours));
      if (home.hours - born < REVEAL_CULL_DAYS * 24) return null;
      const { keep, looks, extra } = revealKeep(tanks, s, brood);
      const rest = brood.filter(({ fish }) => !keep.has(fish.id));
      const coins = rest.reduce((a, { fish }) => a + (buybackRefusal(fish, true) ? 0 : fishBuybackPrice(fish)), 0);
      const at = brood.find(({ fish }) => keep.has(fish.id)) ?? brood[0];
      return {
        id,
        tank: at.tank,
        title: '開獎那窩長大一點了',
        owner: looks > 0 ? `${looks} 尾看得出是${DREAM_FISH.name}候選。留幾尾，其他的可以交單或賣掉。` : `這窩還看不出${DREAM_FISH.name}，留基因最近的幾尾，其他的可以交單或賣掉。`,
        options: [
          { key: 'cull', label: `留 ${keep.size} 尾候選，其他賣掉`, outcome: `${rest.length} 尾賣給阿德，約 ${coins} 元`, recommended: true },
          { key: 'all', label: '全部留著', outcome: '缸會很擠，要再開缸' },
          { key: 'pick', label: '自己挑', outcome: '打開魚群一尾一尾選' },
        ],
        fish: [...brood.filter(({ fish }) => keep.has(fish.id) && fish.genome), ...extra].map(({ fish, tank }) => pickFish(fish, tank)),
        ...(extra.length > 0 ? { note: `這窩${[...new Set(extra.map(({ fish }) => (fish.sex === 'male' ? '公' : '母')))].join('、')}魚不夠，${extra.map(({ fish }) => callName(fish)).join('、')}一起當候選` } : {}),
      };
    }
    case 'C18': {
      if (s.lineNamed) return null;
      const b = nameBrood(s);
      if (!b) return null;
      const pct = stabilityPct(b);
      const kids = broodKids(tanks, b);
      return {
        id,
        tank: kids[0]?.tank ?? 0,
        title: '你的品系穩定了！',
        owner: `${b.k}／${b.n} 尾都是${DREAM_FISH.name}，品系初步固定了。幫它取個名字吧。`,
        options: [
          { key: 'name', label: '就叫這個名字', outcome: '指定這個品系的客人出價會高兩成', recommended: true },
          { key: 'later', label: '晚點再取', outcome: '過幾天再問' },
        ],
        fish: kids.filter(({ fish }) => fish.genome).map(({ fish, tank }) => pickFish(fish, tank)),
        naming: { suggested: LINE_NAME_SUGGESTED, stability: pct, dream: b.k, total: b.n, maxLen: LINE_NAME_MAX },
      };
    }
    case 'C17': {
      const opts = linePairs(tanks, s);
      if (!opts) return null;
      const coins = economy(home).coins;
      const rec = recommendedPair(opts, coins);
      return {
        id,
        tank: opts.tank,
        title: '下一代要誰配誰？',
        owner: '配得越近，夢想魚越多，但尾鰭會一代一代變差。',
        options: opts.pairs.map((o) => ({
          key: o.key,
          label: o.key === 'sib' ? '兄妹配' : o.key === 'back' ? (o.dad?.id === s.pair?.[1] ? '女兒配爸爸' : '兒子配媽媽') : `配店裡的新魚（${o.buy!.price} 元）`,
          outcome: o.key === 'new' ? `這一代約 ${o.pct}%，血統新、尾鰭不變差` : `${o.key === 'sib' ? '下一代夢想魚' : ''}約 ${o.pct}%，尾鰭約 −${finDrop(o.inbreeding)}`,
          recommended: o === rec,
          ...(o.buy && coins < o.buy.price ? { disabled: `錢不夠：要 ${o.buy.price} 元` } : {}),
        })),
        fish: opts.cands.map(({ fish, tank }) => pickFish(fish, tank)),
      };
    }
    case 'C19': {
      const inb = lineInbreeding(tanks, s);
      if (inb === null || inb < (s.c19At === undefined ? INBREEDING_LIMIT : s.c19At + INBREEDING_STEP)) return null;
      const opts = linePairs(tanks, s, true);
      const fresh = opts?.pairs.find((o) => o.key === 'new');
      if (!opts || !fresh) return null;
      const coins = economy(home).coins;
      const kids = lineGenFish(tanks, s).filter(({ fish }) => fish.genome);
      const tail = Math.round(kids.reduce((a, { fish }) => a + fish.genome!.tail, 0) / Math.max(1, kids.length));
      return {
        id,
        tank: opts.tank,
        title: '血統有點太近了',
        owner: `你的${DREAM_FISH.name}已經配了好幾代自己家的魚，尾鰭開始變差（平均 ${tail}）。`,
        options: [
          {
            key: 'new',
            label: `買一尾新魚進來配（${fresh.buy!.price} 元）`,
            outcome: '下一代夢想魚少一點，但品系會更健康',
            recommended: coins >= fresh.buy!.price,
            ...(coins < fresh.buy!.price ? { disabled: `錢不夠：要 ${fresh.buy!.price} 元` } : {}),
          },
          { key: 'keep', label: '繼續自己家配', outcome: '穩定得最快，尾鰭會越來越差', recommended: coins < fresh.buy!.price },
        ],
        fish: opts.cands.map(({ fish, tank }) => pickFish(fish, tank)),
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

/**
 * C9：已經生過一窩、這一胎又快生了的孔雀魚母魚。每一窩都問（#326）。
 * C9 的母魚，肚子大的在前：懷孕到門檻的，加上 aheadDays 天內也會到的（重複版合成一張卡，midgame.md §6.5）。
 * 沒有一尾到門檻就是空的。
 */
function broodMoms(tanks: TankState[], s: Readonly<ChoiceState>, aheadDays: number): Array<{ fish: Fish; tank: number }> {
  const all = located(tanks);
  // 留種那對的母魚，夢想魚配方那窩由 C15 問
  const dream = s.pair && !s.reveal?.done ? s.pair[0] : undefined;
  // 問過、還沒生的不再問
  const asked = [...(s.secondBrood && s.secondBrood.born === undefined ? [s.secondBrood.momId] : []), ...(s.broodQueue ?? []).map((b) => b.momId)];
  // 第一次問的是「第二窩」（生過的母魚）；之後每一窩都問，自家第一次當媽媽的也問
  const before = (f: Fish) => !!s.secondBrood || all.some((k) => k.fish.motherId === f.id);
  const at = s.secondBrood ? BROOD_AGAIN_SHOWS : SECOND_BROOD_SHOWS;
  const soon = at - aheadDays / FISH_SPECIES.guppy.breeding!.gestationDays;
  const moms = all.filter(({ fish }) => fish.species === 'guppy' && fish.sex === 'female' && fish.id !== dream && !asked.includes(fish.id) && fish.pregnancy >= soon && before(fish));
  moms.sort((a, b) => b.fish.pregnancy - a.fish.pregnancy);
  return moms[0] && moms[0].fish.pregnancy >= at ? moms : [];
}

/** C9 已經是重複版（第一次選過了）。 */
const broodRepeat = (s: Readonly<ChoiceState>) => !!s.secondBrood && !!s.picked.C9 && (s.broods ?? 0) >= 1;

/** 記下這幾尾母魚這一胎照 choice 處理（生了由 takeSecondBrood 處理）。 */
function queueBroods(tanks: TankState[], s: ChoiceState, moms: Array<{ fish: Fish }>, choice: string): void {
  for (const mom of moms) {
    const prevKids = located(tanks).filter(({ fish }) => fish.motherId === mom.fish.id).length;
    const b = { momId: mom.fish.id, hours: tanks[0].hours, prevKids, choice, preg: mom.fish.pregnancy };
    if (!s.secondBrood) s.secondBrood = b;
    else (s.broodQueue ??= []).push(b);
  }
  s.broods = (s.broods ?? 0) + 1;
}

/** C9 自動照上次之後改設定的卡（midgame.md §6.5）：三個選項換成新的自動設定，或「每次都問我」恢復跳卡。 */
function broodSettingCard(mom: Fish, tank: number, now: string): ChoiceCard {
  const coins = Math.round((FISH_SPECIES[mom.species].breeding!.broodMean * mom.health * 0.5 * JUVENILE_ORDER_PRICE) / 10) * 10;
  return {
    id: 'C9',
    tank,
    title: '之後快生的母魚要怎麼處理？',
    owner: `現在照你的設定：${BROOD_AUTO_DO[now] ?? '處理'}。`,
    options: [
      ...broodOptions(coins).map((o) => ({ ...o, key: `auto:${o.key}`, recommended: o.key === now })),
      { key: 'ask', label: '每次都問我', outcome: '快生的時候再跳卡問你' },
    ],
    motherId: mom.id,
  };
}

/**
 * C9 重複版不跳卡、直接照上次（midgame.md §6.5）：連續選了 BROOD_AUTO_AFTER 次「照上次」，
 * 或上次選完還不到 BROOD_AGAIN_GAP_DAYS 天。早上報告寫一行。
 */
function autoBrood(tanks: TankState[], s: ChoiceState): void {
  if (!broodRepeat(s)) return;
  const auto = (s.sameStreak ?? 0) >= BROOD_AUTO_AFTER || (s.broodPickedAt !== undefined && tanks[0].hours - s.broodPickedAt < BROOD_AGAIN_GAP_DAYS * 24);
  if (!auto) return;
  const moms = broodMoms(tanks, s, 0);
  if (moms.length === 0) return;
  queueBroods(tanks, s, moms, s.picked.C9!);
  for (const m of moms) (s.broodAutoNotes ??= []).push({ momId: m.fish.id, choice: s.picked.C9! });
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
  // 問過的那胎沒生出小魚就結束了（流產、小魚當晚被吃光、母魚不在了）：收掉，這尾母魚下一胎還會再問
  const over = (x: { momId: number; preg?: number }) => {
    const mom = located(tanks).find(({ fish }) => fish.id === x.momId)?.fish;
    return !mom || mom.pregnancy < (x.preg ?? BROOD_AGAIN_SHOWS);
  };
  if (sb.born === undefined && fryOf(sb).length === 0 && over(sb)) sb.born = 0;
  if (s.broodQueue) s.broodQueue = s.broodQueue.filter((x) => fryOf(x).length > 0 || !over(x));
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

/**
 * 擠缸的早上小事（midgame.md §7.2）：選了公母分開的缸，把新長大的公魚搬走；選了自動賣，擠了就賣一批給阿德。
 * 早上報告要說的話記在 crowdNotes（takeCrowdNotes 拿）。
 */
function crowdHousekeeping(tanks: TankState[], s: ChoiceState): void {
  for (const i of s.crowdSplit ?? []) {
    if (!tanks[i]) continue;
    const m = crowdMales(tanks, s, i);
    if (m.to < 0 || m.fish.length === 0) continue;
    let n = 0;
    for (const f of m.fish) if (moveFish(tanks[i], tanks[m.to], f.id)) n++;
    if (n > 0) (s.crowdNotes ??= []).push({ tank: i, text: `${n} 尾公魚長大了，照你的設定搬到${tankLabel(tanks, m.to)}。` });
  }
  if (!s.crowdAuto) return;
  tanks.forEach((t, i) => {
    if (crowdingRatio(t) < CROWD_WARN) return;
    const { n, coins } = sellCrowd(tanks, i);
    if (n > 0) (s.crowdNotes ??= []).push({ tank: i, text: `${tankLabel(tanks, i)}又擠了，照你的設定賣了 ${n} 尾給阿德，收入 ${coins} 元。` });
  });
}

/**
 * 早上報告的擠缸行（midgame.md §7.1）：放在 takeChoice 後面拿（cardTank：今天出 C14 的缸，那缸不再重複預告）。
 * - 自動搬公魚、自動賣的結果
 * - 超過建議量：「{缸名}太擠了，魚擠到水面喘氣。」（每天，排第一行）
 * - ≥ 60% 而且算上快生的那窩會超過：預告一次（掉回 60% 以下才會再出）
 * 每說一次（加上出 C14）記在那缸的 crowdNotices：擠缸死魚之前一定提醒過兩次。
 */
export function takeCrowdNotes(tanks: TankState[], cardTank?: number): Array<{ tank: number; text: string; full?: boolean }> {
  const s = choiceState(tanks);
  const out: Array<{ tank: number; text: string; full?: boolean }> = [...(s.crowdNotes?.splice(0) ?? [])];
  if (cardTank !== undefined && tanks[cardTank]) tanks[cardTank].crowdNotices = (tanks[cardTank].crowdNotices ?? 0) + 1;
  const seen = (s.crowdPreviewed ??= []);
  tanks.forEach((t, i) => {
    const r = crowdingRatio(t);
    if (r < CROWD_PREVIEW) {
      t.crowdNotices = 0;
      if (seen.includes(i)) seen.splice(seen.indexOf(i), 1);
      return;
    }
    if (r >= CROWD_FULL) {
      out.push({ tank: i, full: true, text: `${tankLabel(tanks, i)}太擠了，魚擠到水面喘氣。` });
      t.crowdNotices = (t.crowdNotices ?? 0) + 1;
      // 早上報告說過了：今天切回前景不再說一次「你不在的時候太擠了」
      (s.awayNoted ??= {})[i] = Math.floor(tanks[0].hours / 24);
      return;
    }
    const due = dueFry(t);
    if (cardTank === i || seen.includes(i) || due === 0 || crowdSoon(t) < CROWD_FULL) return;
    seen.push(i);
    const mom = t.fish.find((f) => f.alive && f.sex === 'female' && f.pregnancy >= 0.7);
    const now = t.fish.filter((f) => f.alive).length;
    out.push({ tank: i, text: `${tankLabel(tanks, i)}現在 ${now} 尾，${mom ? callName(mom) : '母魚'}快生了，生完大約 ${now + due} 尾，會住不太下。` });
    t.crowdNotices = (t.crowdNotices ?? 0) + 1;
  });
  return out;
}

/**
 * 離線回來（midgame.md §7.7）：離開期間（sinceHours 之後）超過建議量的缸，報告第一行寫「你不在的時候{缸名}太擠了」，
 * 接著出 C14。每一行和那張 C14 都算一次提醒（crowdNotices）。
 * 一直切出去又切回來不會一直跳：同一缸的擠缸行一天最多一次；C14 前 24 小時內出過、或選了先多換水還沒到時間就不出。
 */
export function takeAwayCrowd(tanks: TankState[], sinceHours: number): { notes: Array<{ tank: number; text: string }>; choice: ChoiceCard | null } {
  const s = choiceState(tanks);
  const now = tanks[0].hours;
  const today = Math.floor(now / 24);
  const noted = (s.awayNoted ??= {});
  const notes: Array<{ tank: number; text: string }> = [];
  tanks.forEach((t, i) => {
    if ((t.crowdOverHours ?? -Infinity) < sinceHours || noted[i] === today) return;
    noted[i] = today;
    notes.push({ tank: i, text: `你不在的時候${tankLabel(tanks, i)}太擠了` });
    t.crowdNotices = (t.crowdNotices ?? 0) + 1;
  });
  if (notes.length === 0) return { notes, choice: null };
  const recent = now - (s.shown.C14 ?? -Infinity) < 24 || (s.crowdNext !== undefined && now < s.crowdNext);
  const choice = recent ? null : cardFor('C14', tanks, s);
  if (choice) {
    s.shown.C14 = s.lastCard = now;
    tanks[choice.tank].crowdNotices = (tanks[choice.tank].crowdNotices ?? 0) + 1;
  }
  return { notes, choice };
}

/** 選過了還會再問的卡：C6 又有魚可以搬、C9 每一窩、C10 每次有更好的、C14 隔幾天還是很擠。 */
function again(id: ChoiceId, tanks: TankState[], s: ChoiceState): boolean {
  if (id === 'C6') return moveAgain(tanks, s);
  if (id === 'C9' || id === 'C10' || id === 'C13') return true;
  // 每一代的候選看得出公母都問一次；C19 近交係數每再多 INBREEDING_STEP 再問
  if (id === 'C17') return lineGen(s) !== s.c17Gen || pairLost(tanks, s);
  // 晚點再取：隔幾天再問，取了名就不再問
  if (id === 'C18') return !s.lineNamed;
  if (id === 'C19') return true;
  if (id === 'C14') {
    if (s.crowdNext !== undefined && tanks[0].hours < s.crowdNext) return false;
    const i = crowdedTank(tanks, s);
    const full = i >= 0 && crowdingRatio(tanks[i]) >= CROWD_FULL;
    return tanks[0].hours - (s.shown.C14 ?? -Infinity) >= (full ? CROWD_FULL_REASK_DAYS : CROWD_REASK_DAYS) * 24;
  }
  return false;
}

/**
 * 第 36～80 天每天早上的小事（#326）：C11 選了分開養就繼續把長大的別尾公魚搬走（開獎前）；
 * C13 的活餌生完就收掉；夢想魚配方那窩快生了就記下開獎（沒選 C15 也照樣開）；找新的一窩裡更好的魚（C10）。
 */
function lateHousekeeping(tanks: TankState[], s: ChoiceState): void {
  noteLineBroods(tanks, s);
  const keep = [...lineCandidates(tanks, s)];
  if (keep.length > 0 || s.lineKeep) s.lineKeep = keep;
  // 換了一對（C17、C19）：那對的母魚生了下一窩，這一代的分開養就結束
  if (s.nextGen !== undefined && s.pair && s.line?.broods.some((b) => b.momId === s.pair![0] && (b.dadId === undefined || b.dadId === s.pair![1]) && b.born >= s.nextGen!)) delete s.nextGen;
  if (splitting(s)) splitMove(tanks, s);
  crowdHousekeeping(tanks, s);
  if (s.pregPlan !== undefined) {
    const mom = located(tanks).find(({ fish }) => fish.id === s.pregPlan);
    if (!mom || mom.fish.pregnancy === 0) {
      for (const t of tanks) if (t.feedPlan?.kind === LIVE_FOOD.kind && t.feedPlan.grade === LIVE_FOOD.grade && (!s.plan || s.planDone)) delete t.feedPlan;
      delete s.pregPlan;
    }
  }
  if (s.warmPlan) {
    const w = s.warmPlan;
    const all = located(tanks);
    if (!w.momIds.some((id) => (all.find(({ fish }) => fish.id === id)?.fish.pregnancy ?? 0) > 0)) {
      if (tanks[w.tank]) setHeaterTarget(tanks[w.tank], w.prevC);
      delete s.warmPlan;
    }
  }
  const m = revealMom(tanks, s);
  if (m && s.reveal?.momId !== m.fish.id) s.reveal = { momId: m.fish.id, hours: tanks[0].hours };
  boxDue(tanks, s);
  noteSickDelay(tanks, s);
  scanBetter(tanks, s);
  autoBrood(tanks, s);
}

/**
 * C15 選了等快生再放：快生了就把母魚放進那缸的育幼盒（盒裡放得出去的小魚先放出去）。
 * 開獎之後品系的每一窩也一樣（#359）：留種那對的母魚懷著這對的小孩、快生了就放進去；那缸沒有盒子就照 C15 的選擇買一個。
 */
function boxDue(tanks: TankState[], s: ChoiceState): void {
  const r = s.reveal;
  if (!r?.box) return;
  const momId = !r.done ? r.momId : s.pair?.[0];
  const m = located(tanks).find(({ fish }) => fish.id === momId && fish.alive);
  if (!m || m.fish.nursery || m.fish.pregnancy < BOX_DUE) return;
  if (r.done && m.fish.sire?.id !== s.pair![1]) return;
  const t = tanks[m.tank];
  const price = PRICES['nursery:box'] ?? 150;
  if (!t.nurseryBox && r.done && spend(tanks[0], price)) {
    buyNurseryBox(t);
    recordEvent(t, { type: 'nursery_bought', subjectId: m.fish.id, count: price });
  }
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
export function takeBellyNotes(tanks: TankState[]): Array<{ fishId: number; text: string; setting?: ChoiceCard }> {
  const s = choiceState(tanks);
  // 留種的公魚懷孕期間死了，母魚肚子裡的還是這對的：里程碑照說
  const p = pairFish(tanks, s) ?? widowedMom(tanks, s);
  const out: Array<{ fishId: number; text: string; setting?: ChoiceCard }> = [];
  // C9 自動照上次（midgame.md §6.5）：點這一行再跳一次 C9 的選項改設定（多「每次都問我」）
  for (const n of s.broodAutoNotes?.splice(0) ?? []) {
    const mom = located(tanks).find(({ fish }) => fish.id === n.momId);
    if (!mom) continue;
    // 改設定的卡同一個設定只附一次（g22：同一張卡第 92～170 天出了 9 次）；之後只說一句照設定處理了
    const told = s.broodAutoTold === n.choice;
    s.broodAutoTold = n.choice;
    out.push({ fishId: mom.fish.id, text: `${callName(mom.fish)}快生了，照你的設定${BROOD_AUTO_DO[n.choice] ?? '處理'}`, ...(told ? {} : { setting: broodSettingCard(mom.fish, mom.tank, n.choice) }) });
  }
  // 開局買的那尾快生母魚也說懷孕後段的里程碑（§7.1，不只開獎那窩才有）；只說第一胎（生完肚子小了就都算說過）
  const firstId = economy(tanks[0]).firstMomId;
  const first = located(tanks).find(({ fish }) => fish.id === firstId && fish.alive && fish.id !== s.reveal?.momId)?.fish;
  if (first) {
    const seen = (s.milestoneSeen ??= []);
    const due = FIRST_BELLY.filter((m) => !seen.includes(`${first.id}@first:${m.key}`));
    const reached = due.filter((m) => first.pregnancy >= m.at);
    for (const m of first.pregnancy < BELLY_SHOWS ? due : reached) seen.push(`${first.id}@first:${m.key}`);
    // 一晚跨過兩個只說後面那個
    const last = first.pregnancy < BELLY_SHOWS ? undefined : reached[reached.length - 1];
    if (last) out.push({ fishId: first.id, text: last.key === 'dark' ? `${callName(first)}的胎斑變大、變黑了，再兩三天就生` : '胎斑裡看得到小魚的眼睛了！快生了' });
  }
  if (!p) return out;
  if (!s.sickNoted && (s.sickDays ?? 0) > 0 && p.mom.pregnancy > 0) {
    s.sickNoted = true;
    out.push({ fishId: p.mom.id, text: `因為${s.sickCause === 'ich' ? '白點' : '生病'}，配對晚了約 ${s.sickDays} 天` });
  }
  const r = s.reveal;
  // 開獎那窩懷孕前段：C13 說懷上了，過一半才有 C15 開獎準備，中間十來天說一次肚子圓起來了（懷孕期間節奏 ≤ 7 天，midgame.md §6.4）
  if (!r && (s.picked.C13 !== undefined || s.shown.C13 !== undefined) && p.mom.pregnancy >= LINE_BELLY.at && p.mom.pregnancy < REVEAL_SHOWS) {
    const key = `${p.mom.id}@pre:round`;
    const seen = (s.milestoneSeen ??= []);
    if (!seen.includes(key)) {
      seen.push(key);
      out.push({ fishId: p.mom.id, text: `${callName(p.mom)}的肚子圓起來了` });
    }
  }
  // 開獎那窩；之後 C17、C19 換了一對、等這對的下一代那段也一樣（strain-fixing.md §2.1「懷孕期間同 midgame §6.4」）
  const line = !!r?.done && s.nextGen !== undefined && p.mom.sire?.id === p.dad.id;
  if (!r || (!line && (r.done || r.momId !== p.mom.id))) return out;
  const since = line ? s.nextGen! : r.hours;
  const seen = (s.milestoneSeen ??= []);
  // 品系的下一代沒有開獎準備（C15），懷孕前段多一句肚子圓起來了
  for (const m of line ? [LINE_BELLY, ...BELLY_MILESTONES] : BELLY_MILESTONES) {
    const key = `${p.mom.id}@${Math.round(since)}:${m.key}`;
    if (p.mom.pregnancy < m.at || seen.includes(key)) continue;
    seen.push(key);
    const text = m.key === 'round' ? `${callName(p.mom)}的肚子圓起來了，下一代懷上了` : m.key === 'dark' ? `${callName(p.mom)}的胎斑變大、變黑了` : '胎斑裡看得到小魚的眼睛了！快生了';
    out.push({ fishId: p.mom.id, text });
  }
  return out;
}

/** 小魚出生幾天後看得出紅眼睛（白子里程碑）。 */
export const ALBINO_DAYS = 5;
/** 小魚出生幾天後尾鰭散開（尾鰭里程碑：紅眼睛和蛇紋中間的空檔）。 */
export const FINS_DAYS = 11;
/** 小魚出生幾天後身上開始有顏色（尾鰭和蛇紋中間，出生後的里程碑隔 ≤ 6 天，strain-fixing.md §2.1）。 */
export const COLOR_DAYS = 16;
/** 小魚出生幾天後蛇紋看得出來（蛇紋里程碑）。 */
export const SNAKE_DAYS = 20;
/** 出生幾天後算得出穩定度（公母、蛇紋都看得出來，出穩定度卡）。 */
export const STABILITY_DAYS = 25;
/** 出生幾天後說一次長得怎樣（穩定度卡到挑下一代 C17 之間的空檔，strain-fixing.md §2.1）。 */
export const SEXING_DAYS = 31;

/** 品系的媽媽：開獎那尾、現在留種那對的母魚、輪流配的第二尾母魚。 */
function lineMoms(s: Readonly<ChoiceState>): number[] {
  if (!s.reveal?.done) return [];
  return [...new Set([s.reveal.momId, ...(s.pair ? [s.pair[0]] : []), ...(s.mates ?? [])])];
}

/** 這尾魚是品系的第幾代：品系記過的那窩生的就是那窩的代數，店裡買的、品系以外的是 0。 */
function fishGen(fish: Fish | undefined, broods: readonly LineBrood[]): number {
  if (!fish || fish.motherId === undefined || fish.bornHours === undefined) return 0;
  return broods.find((b) => b.momId === fish.motherId && Math.abs(b.born - fish.bornHours!) < 24)?.gen ?? 0;
}

/** 這窩算第幾代：爸媽裡代數比較大的那尾的下一代（開獎那窩爸媽都是店裡買的，是第 1 代；兒子配媽媽也是下一代）。 */
function broodGen(tanks: TankState[], broods: readonly LineBrood[], momId: number, dadId: number | undefined): number {
  const fish = located(tanks).map(({ fish }) => fish);
  const mom = fish.find((f) => f.id === momId);
  const dad = dadId === undefined ? undefined : fish.find((f) => f.id === dadId);
  // 媽媽之前生過、這次找不到爸爸：至少跟她上一窩同一代
  const own = broods.filter((b) => b.momId === momId && (dadId === undefined || b.dadId === dadId)).map((b) => b.gen);
  return Math.max(fishGen(mom, broods) + 1, fishGen(dad, broods) + 1, ...(dad ? [] : own));
}

/** 這尾公魚是不是品系的魚：品系生的、開獎那窩的爸爸、現在留種的、輪流配的。品系的媽媽配到別的公魚，那窩不算品系。 */
function lineDad(tanks: TankState[], s: Readonly<ChoiceState>, dadId: number | undefined): boolean {
  const broods = s.line?.broods ?? [];
  if (dadId === undefined || broods.length === 0) return true;
  if (broods[0].dadId === dadId || s.pair?.[1] === dadId || (s.sires ?? []).includes(dadId)) return true;
  return fishGen(located(tanks).find(({ fish }) => fish.id === dadId)?.fish, broods) > 0;
}

/** 記下品系新出生的一窩（出生那天就記，之後賣掉、挑掉都不影響這窩的穩定度）。 */
function noteLineBroods(tanks: TankState[], s: ChoiceState): void {
  const moms = lineMoms(s);
  if (moms.length === 0) return;
  const line = (s.line ??= { broods: [] });
  const groups = new Map<string, Fish[]>();
  for (const { fish } of located(tanks)) {
    if (fish.motherId === undefined || !moms.includes(fish.motherId) || fish.bornHours === undefined || fish.bornHours < s.reveal!.hours || !fish.genome) continue;
    const key = `${fish.motherId}@${Math.floor(fish.bornHours / 24)}`;
    groups.set(key, [...(groups.get(key) ?? []), fish]);
  }
  const fresh = [...groups.values()].map((kids) => ({ kids, born: Math.min(...kids.map((f) => f.bornHours!)) })).sort((a, b) => a.born - b.born);
  for (const { kids, born } of fresh) {
    const momId = kids[0].motherId!;
    const dadId = kids.find((f) => f.fatherId !== undefined)?.fatherId;
    if (line.broods.some((b) => b.momId === momId && Math.abs(b.born - born) < 24)) continue;
    if (!lineDad(tanks, s, dadId)) continue;
    line.broods.push({ momId, ...(dadId !== undefined ? { dadId } : {}), born, n: kids.length, k: kids.filter((f) => isDreamLook(f.genome!)).length, gen: broodGen(tanks, line.broods, momId, dadId) });
  }
}

/**
 * 早上報告的品系里程碑（strain-fixing.md §2.2）：一個早上最多一行。
 * - 每窩出生 FINS_DAYS 天：「新的這窩小魚尾鰭開始散開了，看得出誰的尾巴比較大」
 * - 每窩出生 SNAKE_DAYS 天：「{魚名}身上的蛇紋出來了。」（那窩有看得出蛇紋的公魚才說）
 * - 開獎之後的每窩出生 STABILITY_DAYS 天：穩定度卡「這窩 n 尾裡，k 尾是白子紅蛇王，穩定度 X%」
 */
export function takeLineNotes(tanks: TankState[]): Array<{ fishId: number; text: string; stability?: number; done?: boolean }> {
  const s = choiceState(tanks);
  noteLineBroods(tanks, s);
  const now = tanks[0].hours;
  const broods = s.line?.broods ?? [];
  for (const [i, b] of broods.entries()) {
    const age = (now - b.born) / 24;
    const kids = located(tanks).filter(({ fish }) => fish.motherId === b.momId && fish.bornHours !== undefined && Math.abs(fish.bornHours - b.born) < 24 && fish.genome);
    // 開獎那窩開獎卡已經亮過；之後的每窩出生一週說一次有幾尾紅眼睛
    if (!b.albino && age >= ALBINO_DAYS) {
      b.albino = true;
      const red = kids.filter(({ fish }) => phenotype(fish.genome!).albino);
      // 舊存檔早就過了一週的那幾窩不補說
      if (i > 0 && red.length > 0 && age < ALBINO_DAYS + 3) return [{ fishId: red[0].fish.id, text: `新的這窩小魚眼睛看得清楚了：${kids.length} 尾裡有 ${red.length} 尾是紅眼睛的白子。` }];
    }
    // 紅眼睛到蛇紋中間十來天：說一次尾鰭（呼應 C17 挑尾鰭好的那組，tutorial-lines.md），再說一次上色
    if (!b.fins && age >= FINS_DAYS) {
      b.fins = true;
      if (kids.length > 0 && age < FINS_DAYS + 3) return [{ fishId: kids[0].fish.id, text: '新的這窩小魚尾鰭開始散開了，看得出誰的尾巴比較大' }];
    }
    if (!b.color && age >= COLOR_DAYS) {
      b.color = true;
      if (kids.length > 0 && age < COLOR_DAYS + 3) return [{ fishId: kids[0].fish.id, text: '新的這窩小魚身上開始有一點顏色了，再過幾天看得出蛇紋' }];
    }
    if (!b.snake && age >= SNAKE_DAYS) {
      b.snake = true;
      const male = kids.map(({ fish }) => fish).sort((x, y) => Number(!!y.keeper) - Number(!!x.keeper)).find((f) => f.sex === 'male' && phenotype(f.genome!).snake);
      if (male) return [{ fishId: male.id, text: `${callName(male)}身上的蛇紋出來了。` }];
    }
    // 開獎那窩是起點（開獎卡已經說過有幾尾），之後的每窩才出穩定度卡
    if (!b.told && age >= STABILITY_DAYS) {
      b.told = true;
      if (i === 0) continue;
      const pct = stabilityPct(b);
      const prev = broods.slice(0, i).reverse().find((x) => x.gen < b.gen) ?? broods[0];
      const d = pct - stabilityPct(prev);
      const more = d > 0 ? `（比上一代多 ${d}%）` : '';
      const tail = pct < LINE_FIXED_PCT ? '再配一代，穩定度會更高。' : '';
      const fishId = kids[0]?.fish.id ?? b.momId;
      // 品系完成（第一次 ≥ LINE_FIXED_PCT）：取過名才算，取名卡（C18）還沒選的話等選了再說
      if (pct >= LINE_FIXED_PCT && s.lineNamed && !s.lineNamed.done) {
        s.lineNamed.done = { hours: now, stability: pct };
        return [{ fishId, stability: pct, done: true, text: `${s.lineNamed.name}這窩有 ${pct}% 是${DREAM_FISH.name}，品系完成了！指定的客人出價會高一半。` }];
      }
      return [{ fishId, stability: pct, text: `這窩 ${b.n} 尾裡，${b.k} 尾是${DREAM_FISH.name}，穩定度 ${pct}%${more}。${tail}` }];
    }
    if (b.told && !b.sexing && age >= SEXING_DAYS) {
      b.sexing = true;
      const dream = kids.map(({ fish }) => fish).filter((f) => isDreamLook(f.genome!));
      // 舊存檔早就過了的那幾窩不補說
      if (i > 0 && dream.length > 0 && age < SEXING_DAYS + 3) return [{ fishId: dream[0].id, text: `新的這窩${DREAM_FISH.name}越長越大，快可以挑下一代的爸媽了。` }];
    }
  }
  // 取名之前那窩就已經 ≥ LINE_FIXED_PCT：取了名之後的早上說品系完成
  const fixed = s.lineNamed && !s.lineNamed.done ? broods.find((b, i) => i > 0 && b.told && stabilityPct(b) >= LINE_FIXED_PCT) : undefined;
  if (fixed && s.lineNamed) {
    const pct = stabilityPct(fixed);
    s.lineNamed.done = { hours: now, stability: pct };
    const kid = located(tanks).find(({ fish }) => fish.motherId === fixed.momId && fish.bornHours !== undefined && Math.abs(fish.bornHours - fixed.born) < 24);
    return [{ fishId: kid?.fish.id ?? fixed.momId, stability: pct, done: true, text: `${s.lineNamed.name}這窩有 ${pct}% 是${DREAM_FISH.name}，品系完成了！指定的客人出價會高一半。` }];
  }
  return [];
}

/** C18 名字框的預設（還沒有玩家名，用「自家系」）。 */
export const LINE_NAME_SUGGESTED = '自家系';

/** 品系名不能用的字（日後上市場前再接伺服器的字詞檢查）。 */
const LINE_NAME_BANNED = ['幹', '靠北', '操你', '屌', '機掰', '雞掰', '婊', '妓', '屎', '白癡', '智障', '去死', '尼瑪', '你媽', 'fuck', 'shit', 'bitch', 'porn', 'sex'];

/** 品系名能不能用：1～LINE_NAME_MAX 個字、不能是網址或電話、不能有不雅的字；能用回 null。 */
export function lineNameRefusal(name: string): string | null {
  const len = Array.from(name).length;
  if (len === 0) return '先幫品系取個名字';
  if (len > LINE_NAME_MAX) return `名字最多 ${LINE_NAME_MAX} 個字`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name) || /https?:|www\.|\.com|@/i.test(name) || /\d{5,}/.test(name)) return '名字不能放網址、帳號或電話';
  const low = name.toLowerCase();
  if (LINE_NAME_BANNED.some((w) => low.includes(w))) return '這個名字不能用，換一個吧';
  return null;
}

/** 這窩還活著的小魚。 */
function broodKids(tanks: TankState[], b: LineBrood): Array<{ fish: Fish; tank: number }> {
  return located(tanks).filter(({ fish }) => fish.motherId === b.momId && fish.bornHours !== undefined && Math.abs(fish.bornHours - b.born) < 24);
}

/** C18 那窩：開獎之後說過穩定度、第一次 ≥ LINE_NAME_PCT 的那窩。 */
function nameBrood(s: Readonly<ChoiceState>): LineBrood | null {
  return (s.line?.broods ?? []).find((b, i) => i > 0 && b.told && stabilityPct(b) >= LINE_NAME_PCT) ?? null;
}

/**
 * 種魚（midgame.md §7.9）：留種的、配對中的公母、輪流配的母魚、C5 留著的備用、品系候選。
 * 這些魚開始消瘦時早上報告要寫出名字，劇本裡一尾都不能餓死。
 */
export function breederIds(tanks: TankState[]): Set<number> {
  const s = economy(tanks[0]).choices;
  const ids = new Set<number>([...(s?.pair ?? []), ...(s?.mates ?? []), ...(s?.backups ?? []), ...(s?.lineKeep ?? [])]);
  for (const { fish } of located(tanks)) if (fish.keeper) ids.add(fish.id);
  return ids;
}

/** 早上報告叫種魚的名字（midgame.md §7.9）：品系取了名就用品系名，不然用看得出的品系，例如「留種的全紅白子母魚」。 */
export function breederName(tanks: TankState[], fish: Fish): string {
  const s = economy(tanks[0]).choices;
  const sex = fish.sex === 'male' ? '公魚' : '母魚';
  if (s?.lineNamed && s.lineKeep?.includes(fish.id)) return `留種的${s.lineNamed.name}${sex}`;
  return `留種的${fish.genome ? strainName(phenotype(fish.genome)) : FISH_SPECIES[fish.species].name}${sex}`;
}

/** 魚卡、選種卡上的品系名（取過名、這尾是品系某一窩生的白子紅蛇王）；不是回 null。 */
export function lineName(tanks: TankState[], fish: Fish): string | null {
  const s = economy(tanks[0]).choices;
  if (!s?.lineNamed || !fish.genome || !isDreamLook(fish.genome)) return null;
  const mine = (s.line?.broods ?? []).some((b) => fish.motherId === b.momId && fish.bornHours !== undefined && Math.abs(fish.bornHours - b.born) < 24);
  return mine ? s.lineNamed.name : null;
}

/**
 * 品系最新一代要留著配下一代的候選（不賣）：照 C16 的排法，公母各至少 2 尾、一共最多 6 尾。
 * 開獎那窩照 C16 挑過的那幾尾；之後每一代自動留最好的幾尾，等 C17 挑誰配誰。
 */
function lineCandidates(tanks: TankState[], s: Readonly<ChoiceState>): Set<number> {
  if (!s.reveal?.done || lineGen(s) === 0) return new Set();
  const kids = lineGenFish(tanks, s).filter(({ fish }) => fish.alive && fish.genome && !fish.keeper);
  return revealKeep(tanks, s, kids, REVEAL_KEEP[1]).keep;
}

/** C17 推薦配新魚、C19 第一次問的近交係數（strain-fixing.md §5：開獎那窩已經是 0.25，第二代兄妹配 0.44 還推薦）。 */
export const INBREEDING_LIMIT = 0.45;
/** C19 問過之後，近交係數每再多這麼多再問一次。 */
export const INBREEDING_STEP = 0.1;

/** C11 選了分開養：開獎前，以及 C17、C19 換了一對之後到那對生下一窩之前，別尾公魚都搬走。 */
function splitting(s: Readonly<ChoiceState>): boolean {
  return s.picked.C11 === 'split' && (!s.reveal?.done || s.nextGen !== undefined);
}

/** 留種那對有一尾不在了（死了、賣了），而且母魚肚子裡也不是這對的小孩：品系要重挑一對（C17 再問）。 */
function pairLost(tanks: TankState[], s: Readonly<ChoiceState>): boolean {
  if (!s.pair || !s.reveal?.done) return false;
  const alive = (id: number) => located(tanks).find(({ fish }) => fish.id === id && fish.alive)?.fish;
  const mom = alive(s.pair[0]);
  if (mom && alive(s.pair[1])) return false;
  return !(mom && mom.pregnancy > 0 && mom.sire?.id === s.pair[1]);
}

/** 品系最新的一代（開獎那窩是 1）；還沒開獎回 0。 */
function lineGen(s: Readonly<ChoiceState>): number {
  return Math.max(0, ...(s.line?.broods ?? []).map((b) => b.gen));
}

/** 品系最新一代還活著的魚（照那一代每窩的媽媽和出生日）。 */
function lineGenFish(tanks: TankState[], s: Readonly<ChoiceState>): Array<{ fish: Fish; tank: number }> {
  const gen = lineGen(s);
  const broods = (s.line?.broods ?? []).filter((b) => b.gen === gen);
  return located(tanks).filter(({ fish }) => fish.species === 'guppy' && broods.some((b) => fish.motherId === b.momId && fish.bornHours !== undefined && Math.abs(fish.bornHours - b.born) < 24));
}

/** 品系最新一代裡最高的近交係數（C19 看的）；還沒有回 null。 */
function lineInbreeding(tanks: TankState[], s: Readonly<ChoiceState>): number | null {
  const kids = lineGenFish(tanks, s);
  return kids.length > 0 ? Math.max(...kids.map(({ fish }) => fish.inbreeding ?? 0)) : null;
}

/** 這對生的小魚裡（公母都算）夢想魚的比例 %，就是下一代的穩定度。 */
function dreamShare(mother: GuppyGenome, father: GuppyGenome): number {
  const rng = { seed: 97531 };
  let n = 0;
  for (let i = 0; i < DREAM_SAMPLES; i++) if (isDreamLook(cross(rng, mother, father, i % 2 === 0 ? 'male' : 'female'))) n++;
  return Math.round((n / DREAM_SAMPLES) * 100);
}

/** 爸媽有沒有一尾帶 X 蛇紋（母魚任一條 X、公魚那條 X）。 */
const carriesX = (mother: GuppyGenome, father: GuppyGenome) => mother.snakeX.includes(1) || father.snakeX[0] === 1;

/** 這對的小魚的近交係數（照模擬生小魚的算法：同一條血統才算近親）。 */
function pairInbreeding(mom: Fish, dad: Fish): number {
  return childInbreeding(mom.inbreeding ?? 0, dad.inbreeding ?? 0, (dad.lineage ?? dad.id) === (mom.lineage ?? mom.id));
}

/** 近交係數讓尾鰭大約少幾分（genetics.ts 的 cross：每 1.0 少 25 分）。 */
const finDrop = (inbreeding: number) => Math.round(inbreeding * 25);

interface LinePair {
  key: 'sib' | 'back' | 'new';
  mom?: Fish;
  dad?: Fish;
  /** 配新魚：買哪個品系的哪個性別、多少錢。 */
  buy?: { sex: 'male' | 'female'; strain: number; price: number };
  pct: number;
  inbreeding: number;
  /** 爸媽有沒有帶 X 染色體上的蛇紋：都沒帶的話，往下只有公魚有蛇紋，穩定度最多一半。 */
  x: boolean;
  /** 爸媽尾鰭分數的平均（店裡的新魚照店裡的平均）。 */
  tail: number;
}

/** C17 比例差這麼多以內，挑尾鰭好的那組（strain-fixing.md §7）。 */
const TAIL_TIE_PCT = 5;

/** 挑一組：先保住 X 蛇紋，比例最高的那組差 TAIL_TIE_PCT 以內的裡面挑尾鰭好的。 */
function pickPair<T extends LinePair>(list: readonly T[]): T | null {
  const keep = list.some((o) => o.x) ? list.filter((o) => o.x) : list;
  const top = Math.max(...keep.map((o) => o.pct));
  return [...keep].filter((o) => o.pct >= top - TAIL_TIE_PCT).sort((a, b) => b.tail - a.tail || b.pct - a.pct || a.inbreeding - b.inbreeding)[0] ?? null;
}

/**
 * C17、C19 的選項（strain-fixing.md §2.2）：最新一代的候選裡，兄妹配、回配原本的種魚（現在那對）、配店裡的新魚，
 * 各挑夢想魚比例最高的那組。候選公母都看得出來才有（C19 只要有看得出公母的就行）。
 */
function linePairs(tanks: TankState[], s: Readonly<ChoiceState>, anySex = false): { pairs: LinePair[]; cands: Array<{ fish: Fish; tank: number }>; tank: number } | null {
  if (!s.reveal?.done || lineGen(s) === 0) return null;
  // 開獎那窩先照 C16 挑過
  if (!s.revealCullAsked && revealBrood(tanks, s).length > REVEAL_KEEP[1]) return null;
  const cands = lineGenFish(tanks, s).filter(({ fish }) => fish.alive && fish.genome && !fish.listing && sexVisible(fish));
  const males = cands.filter(({ fish }) => fish.sex === 'male').map(({ fish }) => fish);
  const females = cands.filter(({ fish }) => fish.sex === 'female').map(({ fish }) => fish);
  if (anySex ? cands.length === 0 : males.length === 0 || females.length === 0) return null;
  const best = (pairs: Array<[Fish, Fish]>, key: LinePair['key']): LinePair | null =>
    pickPair(pairs.map(([mom, dad]) => ({ key, mom, dad, pct: dreamShare(mom.genome!, dad.genome!), inbreeding: pairInbreeding(mom, dad), x: carriesX(mom.genome!, dad.genome!), tail: (mom.genome!.tail + dad.genome!.tail) / 2 })));
  const pairs: LinePair[] = [];
  const sib = best(females.flatMap((f) => males.map((m) => [f, m] as [Fish, Fish])), 'sib');
  if (sib) pairs.push(sib);
  // 回配原本的種魚：女兒配爸爸、兒子配媽媽（現在那對，還活著、看得出公母）
  const p = pairFish(tanks, s);
  if (p?.mom.genome && p.dad.genome) {
    const back = best([...females.filter((f) => f.id !== p.mom.id).map((f) => [f, p.dad] as [Fish, Fish]), ...males.filter((m) => m.id !== p.dad.id).map((m) => [p.mom, m] as [Fish, Fish])], 'back');
    if (back) pairs.push(back);
  }
  // 配店裡的新魚：候選母魚配紅蛇王公魚，或候選公魚配全紅白子母魚（夢想魚配方的兩個品系），挑比例高的
  // 公魚買帶白子的紅蛇王（跟夢想魚一鍵買同一種，DREAM_MALE）：配回來的下一代才有白子
  const store = (sex: 'male' | 'female') => {
    if (sex === 'male') return { genome: { ...typicalStoreGenome(sex, DREAM_MALE.strain), albino: [0, 1] as [0, 1] }, buy: { sex, strain: DREAM_MALE.strain, price: DREAM_MALE.price } };
    const strain = DREAM_FISH.parents.female;
    return { genome: typicalStoreGenome(sex, strain), buy: { sex, strain, price: GUPPY_STRAIN_PRICES[strain] ?? FISH_PRICES.guppy } };
  };
  const buys = [
    ...females.map((mom) => ({ key: 'new' as const, mom, buy: store('male').buy, pct: dreamShare(mom.genome!, store('male').genome), inbreeding: (mom.inbreeding ?? 0) / 2, x: carriesX(mom.genome!, store('male').genome), tail: (mom.genome!.tail + store('male').genome.tail) / 2 })),
    ...males.map((dad) => ({ key: 'new' as const, dad, buy: store('female').buy, pct: dreamShare(store('female').genome, dad.genome!), inbreeding: (dad.inbreeding ?? 0) / 2, x: carriesX(store('female').genome, dad.genome!), tail: (dad.genome!.tail + store('female').genome.tail) / 2 })),
  ];
  const fresh = pickPair(buys);
  if (fresh) pairs.push(fresh);
  const tank = cands[0].tank;
  return pairs.length >= 2 ? { pairs, cands, tank } : null;
}

/** C17 推薦：近交係數 < INBREEDING_LIMIT 推保得住 X 蛇紋、比例最高的那組，到了改推配新魚（買不起就照比例）。 */
function recommendedPair(o: { pairs: LinePair[] }, coins: number): LinePair {
  // 先保住 X 蛇紋（不然穩定度卡在一半），比例差不多的挑尾鰭好的
  const near = pickPair(o.pairs.filter((x) => x.key !== 'new'));
  const fresh = o.pairs.find((x) => x.key === 'new');
  if (fresh && (!near || near.inbreeding >= INBREEDING_LIMIT) && coins >= fresh.buy!.price) return fresh;
  return near ?? o.pairs[0];
}

/** 照選的那組換成新的一對：要買的先買，兩尾都標留種、搬進繁殖缸，C11～C13 這一代重新問。 */
function takeLinePair(tanks: TankState[], s: ChoiceState, o: LinePair, at: number): string | null {
  const breeding = tanks.findIndex((t) => t.purpose === 'breeding');
  const to = breeding >= 0 ? breeding : at;
  let mom = o.mom;
  let dad = o.dad;
  if (o.buy) {
    if (economy(tanks[0]).coins < o.buy.price) return `錢不夠：要 ${o.buy.price} 元`;
    if (!spend(tanks[0], o.buy.price)) return `錢不夠：要 ${o.buy.price} 元`;
    const f = addFish(tanks[to], 'guppy', { sex: o.buy.sex, strain: o.buy.strain, carriesIch: false, carries: [], pregnant: false, albinoCarrier: o.buy.sex === 'male' });
    if (o.buy.sex === 'male') dad = f;
    else mom = f;
  }
  if (!mom || !dad) return '這組已經配不了了';
  const where = (id: number) => tanks.findIndex((t) => t.fish.some((f) => f.id === id));
  // 原本那對退休（不再留種，名額空出來），新的一對標留種
  for (const id of s.pair ?? []) if (id !== mom.id && id !== dad.id && where(id) >= 0) setKeeper(tanks[where(id)], id, false);
  for (const f of [mom, dad]) {
    const from = where(f.id);
    if (from >= 0 && from !== to) moveFish(tanks[from], tanks[to], f.id);
    if (!f.keeper) setKeeper(tanks[to], f.id, true);
  }
  s.pair = [mom.id, dad.id];
  delete s.mates;
  s.pregAsked = [];
  for (const id of ['C11', 'C12', 'C13'] as const) {
    delete s.picked[id];
    delete s.shown[id];
  }
  s.nextGen = tanks[0].hours;
  return null;
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
    // C14 不管選過沒都照 again 隔幾天再問
    if (id === 'C14' ? !again(id, tanks, s) : id !== 'C5' && s.picked[id] && !again(id, tanks, s)) continue;
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
      // C14 加強版自己管隔幾天再問（again）
      if (id !== 'C14' && last !== undefined && now - last < CHOICE_RESHOW_DAYS * 24) continue;
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
export function chooseOption(tanks: TankState[], id: ChoiceId, key: string, picks: readonly number[] = [], text?: string): string | null {
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
      // 改自動設定（broodSettingCard）：不動這一胎，之後快生的照新設定，或恢復每次都問
      if (key === 'ask') {
        s.sameStreak = 0;
        delete s.broodPickedAt;
        return null;
      }
      if (key.startsWith('auto:')) {
        const to = key.slice(5);
        if (!['grow', 'sell', 'keep'].includes(to)) return '沒有這個選項';
        s.picked.C9 = to;
        s.sameStreak = BROOD_AUTO_AFTER;
        return null;
      }
      // 簡化版的「照上次」
      const repeat = broodRepeat(s);
      const same = key === 'same' && !!s.picked.C9;
      if (same) key = s.picked.C9!;
      if (!['grow', 'sell', 'keep'].includes(key)) return '沒有這個選項';
      const moms = repeat ? broodMoms(tanks, s, BROOD_GROUP_DAYS) : broodMoms(tanks, s, 0).slice(0, 1);
      if (moms.length === 0) return '這一胎已經生了';
      queueBroods(tanks, s, moms, key);
      if (repeat) {
        s.sameStreak = same ? (s.sameStreak ?? 0) + 1 : 0;
        s.broodPickedAt = tanks[0].hours;
      }
      break;
    }
    case 'C10': {
      const b = s.better;
      if (!b || !['swap', 'both', 'keep', 'replace'].includes(key)) return '這尾已經不在了';
      const nu = find(b.fishId);
      const old = find(b.oldId);
      if (!nu || !old) return '這尾已經不在了';
      // 換掉的話先取消原本那尾（名額滿了是離夢想魚最遠的那尾），名額才空得出來
      const out = key === 'swap' ? old : key === 'replace' ? worstKeeper(tanks, s, nu.fish) : null;
      if (key === 'replace' && !out) return '沒有可以換掉的種魚';
      if (out) setKeeper(tanks[out.tank], out.fish.id, false);
      if (key !== 'keep') {
        const why = setKeeper(tanks[nu.tank], nu.fish.id, true);
        if (why) {
          if (out) setKeeper(tanks[out.tank], out.fish.id, true);
          return why;
        }
      }
      // 名額滿了換掉的不是那對的：新的這尾當備用，原本的計畫照走
      if (key === 'swap' || (key === 'replace' && s.pair?.includes(out!.fish.id))) {
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
        const m2 = secondMom(tanks, p.mom, p.dad, !!s.reveal?.done);
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
      if (!['standard', 'live', 'warm', 'both'].includes(key)) return '沒有這個選項';
      const t = tanks[m.tank];
      if ((key === 'warm' || key === 'both') && !t.equipment.heater) return '這缸沒有加熱棒，調不了水溫';
      if (key === 'live' || key === 'both') {
        t.feedPlan = { ...LIVE_FOOD };
        s.pregPlan = m.fish.id;
      }
      if (key === 'warm' || key === 'both') {
        // 1 公配 2 母：第二尾也選調溫時沿用第一次調之前的溫度，兩尾都生完才調回來
        const w = s.warmPlan?.tank === m.tank ? s.warmPlan : undefined;
        s.warmPlan = w ? { ...w, momIds: [...w.momIds, m.fish.id] } : { momIds: [m.fish.id], tank: m.tank, prevC: t.equipment.heater!.targetC };
        setHeaterTarget(t, warmTarget(t));
        // 水溫高、溶氧少：有打氣機就開著
        if (t.equipment.airPump) t.equipment.airPump.on = true;
      }
      (s.pregAsked ??= []).push(m.fish.id);
      break;
    }
    case 'C14': {
      // 再買一缸、換大缸：畫面帶去買缸（這裡只記下來）
      const i = crowdedTank(tanks, s);
      if (key === 'sell' || key === 'auto') {
        const o = i >= 0 && crowdingRatio(tanks[i]) >= CROWD_FULL ? null : bestSellOrder(tanks);
        if (o) {
          if (!fulfillOrder(tanks, o.id)) return orderRefusal(tanks, o.id) ?? '現在交不出這張單';
        } else if (i < 0 || sellCrowd(tanks, i).n === 0) return '現在沒有可以賣的魚';
        s.crowdSells = (s.crowdSells ?? 0) + 1;
        if (key === 'auto') s.crowdAuto = true;
        break;
      }
      // 先多換水只是撐著，不算換了做法（連賣兩次照樣問要不要自動賣）
      if (key !== 'water') s.crowdSells = 0;
      if (key === 'split') {
        if (i < 0) return '現在沒有太擠的缸';
        const m = crowdMales(tanks, s, i);
        if (m.to < 0) return '只有一缸，先買第二缸';
        for (const f of m.fish) moveFish(tanks[i], tanks[m.to], f.id);
        (s.crowdSplit ??= []).push(i);
      } else if (key === 'move') {
        const m = i < 0 ? null : crowdMove(tanks, s, i);
        if (!m) return '別缸也沒有空位了';
        for (const f of m.fish) moveFish(tanks[i], tanks[m.to], f.id);
      } else if (key === 'water') {
        if (i >= 0) waterChange(tanks[i], CROWD_WATER);
        const full = i >= 0 && crowdingRatio(tanks[i]) >= CROWD_FULL;
        s.crowdNext = tanks[0].hours + (full ? CROWD_FULL_REASK_DAYS : CROWD_WATER_DAYS) * 24;
      } else if (key !== 'tank' && key !== 'big') return '沒有這個選項';
      break;
    }
    case 'C18': {
      if (key === 'later') break;
      if (key !== 'name') return '沒有這個選項';
      const b = nameBrood(s);
      if (!b || s.lineNamed) return '品系已經有名字了';
      const name = (text ?? LINE_NAME_SUGGESTED).trim().replace(/\s+/g, ' ');
      const why = lineNameRefusal(name);
      if (why) return why;
      s.lineNamed = { name, hours: tanks[0].hours, stability: stabilityPct(b), n: b.n, k: b.k };
      break;
    }
    case 'C17':
    case 'C19': {
      if (id === 'C19' && key === 'keep') {
        s.c19At = lineInbreeding(tanks, s) ?? INBREEDING_LIMIT;
        break;
      }
      const opts = linePairs(tanks, s, id === 'C19');
      const o = opts?.pairs.find((x) => x.key === key);
      if (!opts || !o) return '這組已經配不了了';
      const why = takeLinePair(tanks, s, o, opts.tank);
      if (why) return why;
      if (id === 'C17') s.c17Gen = lineGen(s);
      else s.c19At = lineInbreeding(tanks, s) ?? INBREEDING_LIMIT;
      break;
    }
    case 'C16': {
      if (!['cull', 'all', 'pick'].includes(key)) return '沒有這個選項';
      if (key === 'cull') {
        const brood = revealBrood(tanks, s);
        const { keep } = revealKeep(tanks, s, brood);
        for (const { fish, tank } of brood) if (!keep.has(fish.id)) sellFish(tanks[tank], fish.id);
      }
      s.revealCullAsked = true;
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

/**
 * 任務卡「新缸先養水」（g37 #428）：直接打開「新缸要怎麼養水？」，不用等早上報告（早上那張沒點的話隔 3 天才再出）。
 * 小魚等著搬，不列「自己等」。沒有要養水的新缸回傳 null。
 */
export function cycleCard(tanks: TankState[]): ChoiceCard | null {
  const card = cardFor('C8', tanks, choiceState(tanks));
  return card && { ...card, options: card.options.filter((o) => o.key !== 'wait') };
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
