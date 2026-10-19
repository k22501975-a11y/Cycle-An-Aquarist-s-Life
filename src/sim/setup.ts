import { economy, PRICES } from './economy';
import { AIR_PUMPS, FILTERS, HEATERS, LIGHTS, SUBSTRATES, TANKS } from './equipment';
import type { TankState } from './state';

/**
 * 開缸（design/first-10-minutes.md §2.1，F1-a）：新遊戲不再送裝好設備的缸，
 * 玩家拿起始資金自己挑缸、過濾、加熱棒、燈、底沙（打氣可不買），每類 2～3 張卡，卡上寫價錢和取捨。
 * 第一個缸是阿德老闆送的（只挑大小），設備要自己買；「推薦組合」一鍵帶入。
 * 挑便宜或挑錯不擋，只在卡上提醒；之後出事時事件紀錄說得出原因。
 */

export type SetupCategory = 'tank' | 'filter' | 'heater' | 'light' | 'substrate' | 'air';

export interface SetupChoice {
  tank: 'nano20' | 'std40';
  filter: keyof typeof FILTERS;
  heater: keyof typeof HEATERS;
  light: keyof typeof LIGHTS;
  substrate: keyof typeof SUBSTRATES;
  /** 打氣機；'none' 是不買。 */
  air: 'none' | keyof typeof AIR_PUMPS;
}

/** 開缸畫面上玩家選到一半的設備：一開始什麼都沒選（不預選），每一類都選了才能開缸。 */
export type SetupDraft = Partial<SetupChoice>;

/** 一張設備卡（美術與 UI 照這個畫卡片）。 */
export interface SetupOption {
  id: string;
  name: string;
  price: number;
  /** 好處，一句話。 */
  pro: string;
  /** 代價，一句話。 */
  con: string;
  /** 商品圖（public/art/ 底下的路徑）；還沒有圖就不填。 */
  art?: string;
  /** 照目前選的缸，這張是推薦的。 */
  recommended: boolean;
  /** 現在不能選的原因（例如要之後解鎖）；可以選就不填。 */
  locked?: string;
  /** 照目前其他選擇，阿德老闆要提醒的一句（選了還是可以）。 */
  warning?: string;
}

export interface SetupCategoryCards {
  category: SetupCategory;
  title: string;
  options: SetupOption[];
}

export const SETUP_CATEGORIES: { category: SetupCategory; title: string }[] = [
  { category: 'tank', title: '魚缸' },
  { category: 'filter', title: '過濾器' },
  { category: 'heater', title: '加熱棒' },
  { category: 'light', title: '燈' },
  { category: 'substrate', title: '底沙' },
  { category: 'air', title: '打氣機（可不買）' },
];

export const RECOMMENDED_SETUP: SetupChoice = { tank: 'std40', filter: 'hangOn', heater: 'h50', light: 'basic', substrate: 'sand', air: 'none' };

/** 每種缸配多大的加熱棒剛好（台灣冬天室溫約 16～18 度，拉到 25 度）。 */
const HEATER_FOR_TANK: Record<SetupChoice['tank'], SetupChoice['heater']> = { nano20: 'h25', std40: 'h50' };

interface Card {
  id: string;
  name: string;
  pro: string;
  con: string;
  art?: string;
  locked?: string;
}

const TANK_CARDS: Card[] = [
  { id: 'nano20', name: TANKS.nano20.name, art: 'gear/tank-empty.webp', pro: '小巧，配小設備最省錢', con: '水少，水質和水溫變得快，比較難顧' },
  { id: 'std40', name: TANKS.std40.name, art: 'gear/tank-empty.webp', pro: '水量夠穩，新手最好上手', con: '設備要配大一點' },
  { id: 'std90', name: TANKS.std90.name, art: 'gear/tank-empty.webp', pro: '能養更多魚、做大造景', con: '要先養好第一缸', locked: '養好第一缸、賺到第一桶金後可以加購' },
];

const FILTER_CARDS: Card[] = [
  { id: 'sponge', name: FILTERS.sponge.name, art: 'gear/sponge-filter.webp', pro: '最便宜，水流溫和，仔魚吸不進去', con: '濾材少、菌少，只適合小缸少魚' },
  { id: 'hangOn', name: FILTERS.hangOn.name, art: 'gear/hangon-filter.webp', pro: '水流和菌量平衡，換濾材簡單', con: '有一點水流聲' },
  { id: 'canister', name: FILTERS.canister.name, art: 'gear/canister-filter.webp', pro: '濾材最多、菌最多，水最穩', con: '很貴；水面攪動少，魚多要另配打氣' },
];

const HEATER_CARDS: Card[] = [
  { id: 'h25', name: HEATERS.h25.name, art: 'gear/heater.webp', pro: '省電，20L 剛好', con: '40L 冬天寒流時拉不到 25 度' },
  { id: 'h50', name: HEATERS.h50.name, art: 'gear/heater.webp', pro: '40L 剛好，冬天也撐得住', con: '20L 用有點大，故障卡住時升溫快' },
  { id: 'h100', name: HEATERS.h100.name, art: 'gear/heater.webp', pro: '升溫最快，以後換大缸也能用', con: '小缸用太大，故障卡住時水溫衝得很快' },
];

const LIGHT_CARDS: Card[] = [
  { id: 'basic', name: LIGHTS.basic.name, art: 'gear/led-basic.webp', pro: '便宜、不太長藻，榕、莫絲這類陰性草夠用', con: '光不夠，陽性草（矮珍珠、紅蝴蝶）長不好' },
  { id: 'planted', name: LIGHTS.planted.name, art: 'gear/led-planted.webp', pro: '陽性草長得又密又紅', con: '貴、會讓水溫高一點，光強容易長藻，最好配 CO₂' },
];

const SUBSTRATE_CARDS: Card[] = [
  { id: 'sand', name: SUBSTRATES.sand.name, art: 'gear/bag-sand.webp', pro: '水質中性，好清理', con: '沒有養分，水草長得普通' },
  { id: 'soil', name: SUBSTRATES.soil.name, art: 'gear/bag-soil.webp', pro: '水草長得好，前期放出的氨讓菌長得快', con: '養水期氨會高一點，還會慢慢壓低 pH' },
  { id: 'coral', name: SUBSTRATES.coral.name, art: 'gear/bag-coral.webp', pro: '把 KH 和 pH 拉高，水質不容易酸掉', con: '不適合喜歡軟水的魚蝦和水草' },
];

const AIR_CARDS: Card[] = [
  { id: 'none', name: '先不買', pro: '省下來買魚', con: '魚多、天熱或停電時溶氧容易不夠' },
  { id: 'small', name: AIR_PUMPS.small.name, art: 'gear/air-pump.webp', pro: '溶氧更穩，魚多、天熱時保命', con: '多一點電費和氣泡聲' },
];

const CARDS: Record<SetupCategory, Card[]> = {
  tank: TANK_CARDS,
  filter: FILTER_CARDS,
  heater: HEATER_CARDS,
  light: LIGHT_CARDS,
  substrate: SUBSTRATE_CARDS,
  air: AIR_CARDS,
};

/** 第一個缸是阿德送的，只有設備要錢。 */
export function setupOptionPrice(category: SetupCategory, id: string): number {
  if (category === 'tank' || id === 'none') return 0;
  return PRICES[`${category}:${id}`] ?? 0;
}

/** 推薦的選項：加熱棒跟著缸的大小，其他照推薦組合。 */
export function recommendedFor(choice: SetupDraft, category: SetupCategory): string {
  if (category === 'heater') return HEATER_FOR_TANK[choice.tank ?? RECOMMENDED_SETUP.tank];
  return RECOMMENDED_SETUP[category];
}

/** 照目前其他選擇，選這張時阿德老闆要提醒什麼（只提醒，不擋）。 */
function warningFor(choice: SetupDraft, category: SetupCategory, id: string): string | undefined {
  const big = choice.tank === 'std40';
  if (category === 'heater' && big && id === 'h25') return '40L 用 25W，冬天寒流水溫會掉，菌長得慢、魚也容易生病';
  if (category === 'heater' && choice.tank === 'nano20' && id === 'h100') return '20L 用 100W，萬一加熱棒卡住，水溫幾小時就會衝到危險';
  if (category === 'filter' && big && id === 'sponge') return '水妖精顧 40L 有點吃力，魚別放太多';
  if (category === 'filter' && id === 'canister' && choice.air === 'none') return '圓桶水面攪動少，魚多時記得加打氣';
  if (category === 'light' && id === 'planted') return '水草燈不配 CO₂ 很容易長藻，記得多換水、多種草';
  return undefined;
}

/** 每一類的卡片（給開缸畫面用）。locked 的卡畫成灰的、不能點。 */
export function setupCards(choice: SetupDraft = {}): SetupCategoryCards[] {
  return SETUP_CATEGORIES.map(({ category, title }) => ({
    category,
    title,
    options: CARDS[category].map((c) => ({
      id: c.id,
      name: c.name,
      price: setupOptionPrice(category, c.id),
      pro: c.pro,
      con: c.con,
      ...(c.art ? { art: c.art } : {}),
      recommended: recommendedFor(choice, category) === c.id,
      ...(c.locked ? { locked: c.locked } : {}),
      ...(warningFor(choice, category, c.id) ? { warning: warningFor(choice, category, c.id) } : {}),
    })),
  }));
}

/** 這套要花多少錢（還沒選的類不算）。 */
export function setupCost(choice: SetupDraft): number {
  return SETUP_CATEGORIES.reduce((sum, { category }) => {
    const id = choice[category];
    return id === undefined ? sum : sum + setupOptionPrice(category, id);
  }, 0);
}

/** 還沒選的類（標題），照畫面上的順序。 */
export function missingSetup(choice: SetupDraft): string[] {
  return SETUP_CATEGORIES.filter(({ category }) => choice[category] === undefined).map(({ title }) => title);
}

/** 換了缸之後，加熱棒跟著換成適合的（玩家之後還可以自己改）。 */
export function withTank(choice: SetupDraft, tank: SetupChoice['tank']): SetupDraft {
  if (choice.tank === undefined || choice.heater !== HEATER_FOR_TANK[choice.tank]) return { ...choice, tank };
  return { ...choice, tank, heater: HEATER_FOR_TANK[tank] };
}

/** 這個新遊戲還在等玩家開缸（還沒開缸時時間不走）。 */
export function needsSetup(state: TankState): boolean {
  return !!state.economy?.setupPending;
}

/** 設備裝好了、還在等玩家按「開機」（開缸 4 步的最後一步，mvp.md §4.4.4）。 */
export function awaitingPowerOn(state: TankState): boolean {
  return !!state.economy?.powerPending;
}

/**
 * 缸已經開機：時間開始走，第一天的小事、待辦、訂單提示和「開缸」任務都從這時才算（#204）。
 * 開機前（挑設備、開缸演出中）一律不出。
 */
export function tankStarted(state: TankState): boolean {
  return !needsSetup(state) && !awaitingPowerOn(state);
}

/** 開機（開缸最後一步）。已經開過或設備還沒裝就回傳 false。 */
export function powerOn(state: TankState): boolean {
  if (needsSetup(state) || !awaitingPowerOn(state)) return false;
  delete economy(state).powerPending;
  return true;
}

/** 為什麼不能用這套開缸；可以就回傳 null。 */
export function setupRefusal(state: TankState, choice: SetupDraft): string | null {
  if (!needsSetup(state)) return '已經開過缸了';
  const missing = missingSetup(choice);
  if (missing.length > 0) return `還沒選：${missing.join('、')}`;
  for (const { category } of SETUP_CATEGORIES) {
    const card = CARDS[category].find((c) => c.id === choice[category]);
    if (!card) return '有一類還沒選';
    if (card.locked) return card.locked;
  }
  if (economy(state).coins < setupCost(choice)) return '錢不夠，換便宜一點的設備';
  return null;
}

/** 開缸：付錢、裝上設備、鋪好底沙，接著等玩家開機（powerOn）。不行就回傳原因（什麼都不改）。 */
export function applySetup(state: TankState, draft: SetupDraft): string | null {
  const refusal = setupRefusal(state, draft);
  if (refusal) return refusal;
  const choice = draft as SetupChoice;
  const e = economy(state);
  e.coins -= setupCost(choice);
  delete e.setupPending;
  e.powerPending = true;
  const eq = state.equipment;
  eq.tank = TANKS[choice.tank];
  eq.filter = { spec: FILTERS[choice.filter], on: true };
  eq.heater = { spec: HEATERS[choice.heater], targetC: 25, broken: false, heating: false };
  eq.light = { spec: LIGHTS[choice.light], startHour: 10, photoperiodHours: 8 };
  eq.airPump = choice.air === 'none' ? null : { spec: AIR_PUMPS[choice.air], on: true };
  eq.substrate = { spec: SUBSTRATES[choice.substrate], sinceHours: state.hours, buffer: 1 };
  return null;
}
