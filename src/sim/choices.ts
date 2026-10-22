import { DREAM_FISH } from './dream';
import { economy, setKeeper } from './economy';
import { cross, finWords, lookIndex, phenotype, strainName, type GuppyGenome, type GuppyPhenotype } from './genetics';
import { daysToLength, growthStage } from './growth';
import { moveFish, newTankCost } from './household';
import { guppyTraits } from './lookalike';
import { daysToBirth, releaseNursery, rescueFryToNursery, usesNursery } from './nursery';
import { fishMatchesOrder, fulfillOrder, orderBoard, orderSupply, type ShopOrder } from './orders';
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
 * - C5 留種的魚剛好符合 200 元以上的單：交單拿錢，還是留著配種
 * 不管選哪個都能玩下去。只出資料和套用選擇；卡片的樣子由畫面負責（選種卡、配對比較卡交美術）。
 */

export type ChoiceId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
export const CHOICE_IDS: ChoiceId[] = ['C1', 'C2', 'C3', 'C4', 'C5'];

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
}

/** 存在共用錢包上：每張卡上次出現的時間、選了什麼。 */
export interface ChoiceState {
  shown: Partial<Record<ChoiceId, number>>;
  picked: Partial<Record<ChoiceId, string>>;
  /** 第一窩出生的時間（遊戲小時）。 */
  firstBrood?: number;
  /** C4 選定的一對：[母魚, 公魚]。 */
  pair?: [number, number];
  /** C5 問過的訂單（每張只問一次）。 */
  tradeAsked?: number[];
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
/** C5 看的訂單金額門檻。 */
export const TRADE_MIN_COINS = 200;
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

/** C5：符合 TRADE_MIN_COINS 以上的單、又是留種的魚，而且不拿牠就湊不齊。 */
function tradeDilemma(tanks: TankState[]): { order: ShopOrder; fish: Fish; tank: number } | null {
  const keepers = located(tanks).filter(({ fish }) => fish.keeper && bredGuppy(fish));
  for (const o of orderBoard(tanks[0]).orders) {
    if (o.kind !== 'fish' || o.preview || o.late || o.unitPrice * o.count < TRADE_MIN_COINS) continue;
    const supply = orderSupply(tanks, o);
    if (supply >= o.count) continue;
    const hit = keepers.find(({ fish }) => fishMatchesOrder({ ...fish, keeper: undefined }, o));
    if (hit && supply + 1 >= o.count) return { order: o, ...hit };
  }
  return null;
}

/** 沒有這尾魚的話，最好的一對生出夢想魚的機率 %。 */
function bestDreamPct(tanks: TankState[], without?: number): number {
  const all = located(tanks).filter(({ fish }) => fish.id !== without);
  const moms = all.filter(({ fish }) => fish.sex === 'female' && fish.keeper && fish.species === 'guppy' && fish.genome);
  const dads = all.filter(({ fish }) => breederMale(fish));
  let best = 0;
  for (const m of moms) for (const d of dads) best = Math.max(best, pairDream(m.fish.genome!, d.fish.genome!));
  return best;
}

/** 這張卡現在該不該出、出的話卡片資料（不記錄）。 */
function cardFor(id: ChoiceId, tanks: TankState[], s: ChoiceState): ChoiceCard | null {
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
      const d = tradeDilemma(tanks);
      if (!d) return null;
      const coins = d.order.unitPrice * d.order.count;
      const keepPct = bestDreamPct(tanks);
      const sellPct = bestDreamPct(tanks, d.fish.id);
      const name = strainName(phenotype(d.fish.genome!));
      return {
        id,
        tank: d.tank,
        title: `留種的${name}，交單還是留著？`,
        owner: `有客人出 ${coins} 元要這種魚，可是牠也是好種魚。`,
        options: [
          { key: 'sell', label: `交單拿 ${coins} 元`, outcome: keepPct > sellPct ? `夢想魚機率從 ${keepPct}% 掉到 ${sellPct}%` : '夢想魚的機率不變' },
          { key: 'keep', label: '留著配種', outcome: keepPct > 0 ? `夢想魚機率維持 ${keepPct}%，之後的孫代更好` : '留著繼續選育，之後的孫代更好', recommended: keepPct > sellPct },
        ],
        trade: { fishId: d.fish.id, orderId: d.order.id, coins, keepPct, sellPct },
      };
    }
  }
}

/** 已經不用問的卡（例如已經有第二缸）直接記成選過，不再出。 */
function settleImplicit(tanks: TankState[], s: ChoiceState): void {
  if (!s.picked.C3 && tanks.length >= 2) s.picked.C3 = tanks[1].purpose ?? 'had';
  // 小魚都長大了還沒選：不用再問怎麼保護
  if (!s.picked.C1 && s.shown.C1 !== undefined && !cardFor('C1', tanks, s)) s.picked.C1 = 'grown';
}

/** 出過、還沒選、現在還成立的卡（畫面隨時可以拿來再顯示；不記錄）。 */
export function pendingChoice(tanks: TankState[]): ChoiceCard | null {
  const s = choiceState(tanks);
  for (const id of CHOICE_IDS) {
    if (s.shown[id] === undefined || s.picked[id]) continue;
    const card = cardFor(id, tanks, s);
    if (card && (id !== 'C5' || s.tradeAsked?.includes(card.trade!.orderId))) return card;
  }
  return null;
}

/**
 * 早上報告用：拿今天要出的那張卡並記下出現時間。一個早上最多一張：還沒出過的優先，
 * 出過沒選的隔 CHOICE_RESHOW_DAYS 天再出一次。C5 每張訂單只問一次。
 */
export function takeChoice(tanks: TankState[]): ChoiceCard | null {
  const s = choiceState(tanks);
  noteFirstBrood(tanks, s);
  settleImplicit(tanks, s);
  const now = tanks[0].hours;
  for (const id of CHOICE_IDS) {
    if (id !== 'C5' && s.picked[id]) continue;
    const card = cardFor(id, tanks, s);
    if (!card) continue;
    if (id === 'C5') {
      const asked = (s.tradeAsked ??= []);
      if (asked.includes(card.trade!.orderId)) continue;
      asked.push(card.trade!.orderId);
      delete s.picked.C5;
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
        for (const { fish, tank } of chosen) {
          const why = setKeeper(tanks[tank], fish.id, true);
          if (why) return why;
        }
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
      if (key === 'sell') {
        const card = cardFor('C5', tanks, s);
        if (!card?.trade) return '這張單已經不在了';
        const hit = find(card.trade.fishId);
        if (!hit) return '這尾魚不在了';
        setKeeper(tanks[hit.tank], hit.fish.id, false);
        if (fulfillOrder(tanks, card.trade.orderId) <= 0) {
          setKeeper(tanks[hit.tank], hit.fish.id, true);
          return '現在交不出這張單';
        }
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
    const wait = Math.max(daysToMature(mom.fish), daysToMature(dad.fish));
    if (wait > 0) return `留種的那對長到 ${mom.fish.lengthCm.toFixed(1)}、${dad.fish.lengthCm.toFixed(1)} cm，再約 ${wait} 天成熟可以配`;
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
  const s = choiceState(tanks);
  const all = located(tanks);
  const pair = s.pair?.map((id) => all.find(({ fish }) => fish.id === id));
  if (pair?.[0] && pair[1]) {
    const [mom, dad] = pair;
    if (mom.fish.pregnancy > 0.05) return `留種的母魚懷孕了，約 ${Math.max(1, Math.round(daysToBirth(tanks[mom.tank], mom.fish) ?? 1))} 天後生`;
    const wait = Math.max(daysToMature(mom.fish), daysToMature(dad.fish));
    return wait > 0 ? `留種的那對再約 ${wait} 天成熟` : '等留種的母魚肚子變圓';
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
