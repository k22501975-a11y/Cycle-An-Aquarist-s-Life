import { crisisText, type Crisis } from '../game/crisis';
import { airPumpPrice, breathless, oxygenFix, BLOOM_NOTE, boxBlocked, fryHome, fryNeedHome, fryPrep, newTankCost, cycleMaturity, BELLY_SHOWS, DUE_PREGNANCY, economy, FISH_SPECIES, HUNGRY, isCycled, isJuvenile, isShrimpSpecies, isStarving, orderBoard, price, BIG_WATER_CHANGE, MEASURED_PROBLEM_LEVEL, testWater, pestCount, PLANT_SPECIES, lookalikeLine, needsInsulation, warmMove, suggestedWaterChange, takeGearNote, takeLookalike, tankLabel, usesNursery, waterLook, youngGettingHungry, type FishSpeciesId, type LookalikeCard, type SimEvent, type TankState } from '../sim';
import { addEcho, takeEchoes } from '../sim/choice-echo';
import { takeAwayCrowd, takeChoice, takeCrowdNotes, takeMilestones, takeGrowMilestone, takeBellyNotes, takeLineNotes, takeReveal, choiceState, takeSecondBrood, breedingProgress, callName, breederIds, breederName, type ChoiceCard } from '../sim/choices';
import { deathText, describeEvent, fryEatenText, ichCauseText } from './labels';
import { cheapHeaterStep, crisisTodos, lingering, warmMoveStep, wipedOut } from './status';
import { quietObservation } from './morning-observe';

/**
 * 「過一晚」的早上報告（first-10-minutes.md F2）：睡前拍一張快照，醒來跟現在比，
 * 列出昨晚發生的事。每一條帶 action，畫面點下去就帶玩家去處理。不碰 DOM。
 * 唯一會改狀態的是設備後果那句（G5）：說過的記在缸上，下一晚不重複。
 */

/** 點報告的一條要去哪裡處理（畫面自己決定開哪個面板）。 */
export type ReportAction =
  | 'remove_dead' // 撈死魚
  | 'test_water' // 測水
  | 'water_change' // 換水
  | 'feed' // 餵食
  | 'treat' // 看病、下藥
  | 'equipment' // 設備（加熱棒、停電）
  | 'fish' // 看那條魚（subjectId）
  | 'orders' // 訂單板
  | 'snails' // 螺
  | 'trim' // 修剪水草
  | 'fry_box' // 育幼盒或檢疫盒（把仔魚撈進去）
  | 'nursery' // 把快生的母魚放進育幼盒
  | 'shop_tank' // 我的水缸（買第二缸）
  | 'buy_feeder' // 這缸裝自動餵食器（一天兩次，daily-loop.md §4）
  | 'shop_fish' // 商店的魚頁（魚都死光了，#377：領起步包或重新買魚）
  | 'insulate' // 冬天沒加熱棒：一鍵臨時保溫（#397）
  | 'heater_credit' // 冬天沒錢換加熱棒：跟阿德賒一支（#397）
  | 'move_warm' // 冬天加熱棒弄不到：冷缸的魚搬去有加熱棒的缸（#400）
  | 'buy_heater' // 冬天錢不夠換同款：買撐得住的便宜加熱棒（#404）
  | 'move_fry' // 小魚在被吃、別缸養好水了：一鍵搬過去（#425）
  | 'cycle_tank' // 小魚要搬家、新缸還沒養水：打開「新缸要怎麼養水？」（#428；tank 是新缸）
  | 'buy_tank' // 住不下（C14）選了再買一缸：直接打開 20L 套缸的購買確認（polish-to-9.md §10.2）
  | 'buy_big' // 住不下（C14）選了換大缸：直接打開 90L 套缸的購買確認
  | 'add_air'; // 缺氧：打開打氣機，沒有就買一台裝上（oxygen.ts）

export type ReportKind =
  | 'crisis'
  | 'death'
  | 'wiped' // 魚都死光了（#377）
  | 'oxygen' // 缺氧，魚在水面喘氣（oxygen.ts）
  | 'loan' // 還阿德加熱棒的錢（#397）
  | 'birth'
  | 'eaten'
  | 'grown'
  | 'cycle'
  | 'cycled'
  | 'disease'
  | 'equipment'
  | 'snails'
  | 'algae'
  | 'plant_died'
  | 'hungry'
  | 'orders'
  | 'nursery'
  | 'plant_grew' // 水草長了一點
  | 'fish_relaxed' // 魚放鬆了
  | 'ammonia' // 新缸開始出現氨
  | 'bloom' // 新缸細菌白濁第一次看得出來（整個存檔一次）
  | 'gear' // 開缸挑的設備造成的後果（G5）
  | 'belly' // 母魚肚子變大、出現胎斑（G8：缸裡真的發生的事）
  | 'courtship' // 公魚追母魚、配對成功（G8）
  | 'fry_grew' // 小魚長到 1 公分、游出水草（G8）
  | 'new_leaf' // 水草長出新葉（G8）
  | 'rescued' // 測到氨或亞硝、換了水、讀數降下來（G8）
  | 'lookalike' // 第一窩小魚轉色，長得像誰（G2）
  | 'choice' // 中期的選擇點 C1～C5（design/midgame.md）
  | 'breeding' // 選育進度（midgame.md §2）：有第一窩或留種的魚就每天一行
  | 'reveal' // 自家配的夢想魚那窩出生：開獎卡（midgame.md §6.1 C15，第 81 天）
  | 'milestone' // 種魚長到一個里程碑：肛鰭／胎斑、顯色、可以配（midgame.md §5.3）
  | 'second_brood' // C9 那尾母魚的第二窩生了：跟第一窩比、照選的處理（midgame.md §5.2）
  | 'crowd' // 擠缸（midgame.md §7.1）：快生的那窩會住不下的預告、超過建議量、自動賣／自動搬公魚
  | 'line' // 固定品系（design/strain-fixing.md）：蛇紋出來、每窩的穩定度
  | 'observe' // 平淡早上的小觀察（morning-observe.ts）
  | 'echo' // 選擇的回音（polish-to-9.md §10.0）：選完 3 天內寫出那個選擇的結果
  | 'countdown' // 夢想窩開獎前 3 天（polish-to-9.md §12.1）：報告開頭「開獎倒數 n 天」加母魚肚子特寫
  | 'quiet';

export interface ReportItem {
  kind: ReportKind;
  /** 第幾缸。 */
  tank: number;
  tone: 'bad' | 'warn' | 'good' | 'info';
  text: string;
  action?: ReportAction;
  /** 按鈕上的小字，不用那個動作預設的字時才給（例如消瘦那行的「裝自動餵食器」）。 */
  goLabel?: string;
  /** 有魚開始消瘦：永遠排第一行，不受 3 行上限、不收進鈴鐺（midgame.md §7.9）。 */
  starving?: boolean;
  /** 還沒處理的危機（設備壞了、水溫超出魚能撐的、還沒撈的死魚，#375）：跟消瘦一樣永遠排最前面。 */
  standing?: boolean;
  /** 跟哪條魚有關（action 'fish'、'remove_dead' 用）。 */
  subjectId?: number;
  /** 數量（生了幾尾、死了幾條）。 */
  count?: number;
  /** 跟哪株水草有關（new_leaf 的配圖）。 */
  plantId?: number;
  /** kind 'lookalike' 的比較卡資料：爸爸、媽媽、小魚的外觀和每個特徵跟誰的。 */
  lookalike?: LookalikeCard;
  /** 選擇的回音（polish-to-9.md §10.0）：玩家當初選的那個選項，畫面在那行前面寫「你選了：…」；text 直接寫結果。 */
  echo?: string;
  /** 回音已經因為報告擠不下延後過幾次（#452，見 ECHO_RETRIES）。 */
  echoRetry?: number;
  /** kind 'choice' 的選擇卡（sim/choices.ts）：選項和選種、配對的資料。 */
  choice?: ChoiceCard;
  /** C9 自動照上次的那一行（midgame.md §6.5）：點了展開這張卡改設定。 */
  broodSetting?: ChoiceCard;
  /** 品系完成（strain-fixing.md §5，穩定度第一次 ≥ 75%）：品系名和那窩的穩定度，畫面放演出。 */
  lineDone?: { name: string; stability: number };
  /** kind 'milestone' 的圖卡資料：哪一步、哪尾魚、配對的另一半、C7 養快提前了幾天。 */
  milestone?: Milestone;
  /** kind 'reveal' 的開獎卡：夢想魚叫什麼、每尾小魚帶不帶白子、蛇紋（含隱性）。 */
  reveal?: Reveal;
  /** kind 'second_brood' 的比較卡資料：這窩幾尾、第一窩還有幾尾、挑了幾尾備用、C9 選了什麼。 */
  secondBrood?: { momId: number; count: number; prevKids: number; kept: number; choice: string };
  /** kind 'countdown'（polish-to-9.md §12.1）：還有幾天開獎、懷著夢想窩的那尾母魚；畫面放大數字和她肚子的特寫。 */
  countdown?: { days: number; momId: number };
}

/** 開獎卡的資料（midgame.md §6.1）：每尾小魚的基因預告。 */
export interface Reveal {
  dream: string;
  fry: Array<{ fishId?: number; albino: boolean; snake: boolean }>;
}

/** 成長里程碑（midgame.md §5.3）：sex 肛鰭變尖或出現胎斑、color 公魚顯色、ready 可以配。 */
export interface Milestone {
  /** sex／color／ready（§5.3）；tail／plump／adult 是顯色到可以配之間的成長卡（§6.7）。 */
  step: 'sex' | 'color' | 'ready' | 'tail' | 'plump' | 'adult';
  fishId: number;
  partnerId?: number;
  earlierDays?: number;
}

export interface MorningReport {
  /** 標題，例如「早安，第 3 天」或「半夜出狀況了」。 */
  title: string;
  /** 睡了幾個遊戲小時。 */
  hours: number;
  /** 半路遇到危機停下來。 */
  stopped: boolean;
  /** 越前面越要緊（危機、死亡在最前面）。 */
  items: ReportItem[];
}

interface FishSnap {
  alive: boolean;
  juvenile: boolean;
  lengthCm: number;
  pregnancy: number;
  stress: number;
  colorBoost: number;
}

interface TankSnap {
  tank: TankState;
  events: SimEvent | undefined;
  fish: Map<number, FishSnap>;
  maturity: number;
  cycled: boolean;
  algae: number;
  pests: number;
  orders: Set<number>;
  /** 每株水草的重量（g）。 */
  plants: Map<number, number>;
  /** 測試劑讀到的總氨（mg/L）。 */
  ammonia: number;
  /** 測試劑讀到的亞硝酸（mg/L）。 */
  nitrite: number;
}

export interface Snapshot {
  tanks: TankSnap[];
  coins: number;
  /** 還欠阿德加熱棒的錢（#397）。 */
  heaterLoan?: number;
  /** 有幾筆收入先不扣還款（g33）。 */
  loanWaived?: number;
}

const allFish = (t: TankState) => [...t.fish, ...(t.quarantine?.fish ?? [])];

/** 睡前拍快照。 */
export function snapshot(tanks: TankState[]): Snapshot {
  return {
    coins: economy(tanks[0]).coins,
    heaterLoan: economy(tanks[0]).heaterLoan,
    loanWaived: economy(tanks[0]).loanWaived,
    tanks: tanks.map((t) => ({
      tank: t,
      events: t.events.at(-1),
      fish: new Map(allFish(t).map((f) => [f.id, { alive: f.alive, juvenile: isJuvenile(f), lengthCm: f.lengthCm, pregnancy: f.pregnancy, stress: f.stress, colorBoost: f.colorBoost ?? 0 }])),
      maturity: cycleMaturity(t),
      cycled: isCycled(t),
      algae: t.algae,
      pests: pestCount(t),
      orders: new Set(orderBoard(t).orders.map((o) => o.id)),
      plants: new Map(t.plants.map((p) => [p.id, p.biomassG])),
      ammonia: testWater(t).ammonia,
      nitrite: testWater(t).nitrite,
    })),
  };
}

/** 算「壞事」的（企劃 tutorial-lines.md §7）：死魚、被吃、生病、危機，加上設備壞掉這類紅色的。 */
export const isBadNews = (i: ReportItem) => i.tone === 'bad' || i.kind === 'eaten' || i.kind === 'disease';

const TONE_ORDER: Record<ReportItem['tone'], number> = { bad: 0, warn: 1, good: 2, info: 3 };
/** 半夜的危機最前面，再來是開獎（整局最大的回報，#357：本來排在白點後面要往下捲才看得到）；其他照 tone 排，「魚放鬆了」這種小事排同 tone 的最後。 */
const kindRank = (i: ReportItem): number => (i.kind === 'wiped' ? -1 : i.kind === 'crisis' ? 0 : i.kind === 'reveal' ? 1 : 2);

/** 安靜的一晚那句：缸裡有魚才說魚在睡覺（#377：魚死光了還在說「魚都在水草裡睡覺」）。 */
function quietText(tanks: TankState[]): string {
  return tanks.some((t) => t.fish.some((f) => f.alive)) ? '昨晚很平靜，魚都在水草裡睡覺' : '昨晚很平靜，水草在燈下慢慢長';
}

/**
 * 育幼盒幫不上忙時（盒裡有小魚、母魚又懷孕了，#428）小魚接下來去哪：另一缸養好水就搬過去、有空的新缸就先養水、
 * 只有一缸就買第二缸。tank 是按鈕要切去的缸（搬小魚是這缸，養水是新缸）。
 */
function fryPlan(tanks: TankState[], index: number): { tip: string; action: ReportAction; tank?: number } {
  const home = fryHome(tanks, index);
  if (home !== null) return { tip: `${tankLabel(tanks, home)}養好水了，把小魚搬過去`, action: 'move_fry' };
  const prep = fryPrep(tanks, index);
  if (prep?.kind === 'cycle')
    return prep.started ? { tip: `${tankLabel(tanks, prep.tank)}在養水，養好就叫你搬小魚`, action: 'fish' } : { tip: `${tankLabel(tanks, prep.tank)}先養水，養好就能把小魚搬過去`, action: 'cycle_tank', tank: prep.tank };
  const need = newTankCost(tanks, 'nano20') - economy(tanks[0]).coins;
  if (prep?.kind === 'buy') return prep.afford ? { tip: '買第二缸給小魚住，她就放得進盒子', action: 'shop_tank' } : { tip: `再存 ${need} 魚幣買第二缸給小魚住`, action: 'orders' };
  return { tip: '小魚長到 1.6 cm 會自己回主缸', action: 'fish' };
}

/** 醒來後跟快照比，寫出早上報告。 */
export function morningReport(before: Snapshot, tanks: TankState[], sleptHours: number, crisis: Crisis | null): MorningReport {
  const items: ReportItem[] = [];
  if (crisis) {
    // 半夜死魚停下來的：危機那條就是死亡那條，一樣寫死因、數值、怎麼避免（U4）
    const died = crisis.event?.type === 'fish_died' ? crisis.event : null;
    const text = died ? deathLine(tanks[crisis.tank] ?? tanks[0], died) : crisisText(crisis).replace(/，已經從快轉切回正常速度$/, '，先停下來處理');
    items.push({ kind: 'crisis', tank: crisis.tank, tone: 'bad', text, action: crisisAction(crisis), subjectId: died?.subjectId });
  }
  tanks.forEach((t, index) => {
    const snap = before.tanks.find((s) => s.tank === t);
    const where = tanks.length > 1 ? `${tankLabel(tanks, index)}：` : '';
    const push = (item: Omit<ReportItem, 'tank'> & { tank?: number }) => items.push({ tank: index, ...item, text: where + item.text });
    const events = snap ? t.events.slice(snap.events ? t.events.lastIndexOf(snap.events) + 1 : 0) : [];

    // 死亡：每條都寫死因、當時的數值、下次怎麼避免（U4：死亡必須有原因可循）
    // 同一缸同一種魚同一個死因合成一行（#375：熱死 7 尾不寫 7 行）
    const deaths = new Map<string, SimEvent[]>();
    for (const e of events.filter((x) => x.type === 'fish_died')) {
      if (crisis?.event === e) continue;
      const key = `${allFish(t).find((f) => f.id === e.subjectId)?.species ?? ''}:${e.cause ?? ''}`;
      deaths.set(key, [...(deaths.get(key) ?? []), e]);
    }
    for (const group of deaths.values()) {
      const e = group[0];
      const fish = allFish(t).find((f) => f.id === e.subjectId);
      const text = group.length === 1 ? deathLine(t, e) : deathText(`${group.length} 尾${fish ? FISH_SPECIES[fish.species].name : '魚'}`, e, fish);
      push({ kind: 'death', tone: 'bad', text, action: 'remove_dead', subjectId: e.subjectId, ...(group.length > 1 ? { count: group.length } : {}) });
    }
    // 生病：同一種病合成一行（「3 條魚有白點」），不再一條魚一行（polish-to-9.md G3）。
    // 半夜叫醒的那條也算進來，危機那行只說「有魚生病了」，原因寫在這裡
    for (const sick of groupSick(events)) {
      const e = sick[0];
      const n = new Set(sick.map((x) => x.subjectId)).size;
      const text = n <= 1 ? (describeEvent(t, e)?.text ?? '有魚生病了') : sickText(sick, n);
      push({ kind: 'disease', tone: 'warn', text, action: 'treat', subjectId: e.subjectId, count: n > 1 ? n : undefined });
    }
    // 設備
    for (const e of events) {
      if (crisis?.event === e) continue;
      if (['heater_broke', 'heater_stuck', 'heater_exposed', 'power_out', 'controller_cut'].includes(e.type)) {
        push({ kind: 'equipment', tone: 'bad', text: describeEvent(t, e)?.text ?? '設備出狀況了', action: 'equipment' });
      } else if (e.type === 'plant_died') {
        push({ kind: 'plant_died', tone: 'warn', text: '有一株水草溶光了', action: 'trim' });
      }
    }
    // 出生：一胎一條。夢想魚那窩由開獎卡說，不再說一次「昨晚生了 N 尾」；同一晚別尾母魚生的照說（#357）
    const pending = choiceState(tanks).reveal;
    const dreamMom = pending && !pending.done ? pending.momId : undefined;
    const births = events.filter((x) => x.type === 'fry_born' && x.subjectId !== dreamMom);
    const born = births.reduce((n, e) => n + (e.count ?? 0), 0);
    if (born > 0) {
      const mother = allFish(t).find((f) => f.id === births[0].subjectId);
      const shrimp = !!mother && isShrimpSpecies(mother.species);
      push({ kind: 'birth', tone: 'good', text: `昨晚${shrimp ? '孵出' : '生了'} ${born} ${shrimp ? '隻小蝦' : '尾小魚'}，水草越密越好躲`, action: 'fish', subjectId: births[0].subjectId, count: born });
    }
    // 被吃掉的仔魚（#176）：有就不能寫「一夜平安」，並教玩家怎麼救
    const eaten = events.filter((x) => x.type === 'fry_eaten').reduce((n, e) => n + (e.count ?? 0), 0);
    if (eaten > 0) {
      // 另一缸能收小魚（#425）：叫玩家一鍵搬過去，不叫撈進育幼盒
      const home = fryNeedHome(t) ? fryHome(tanks, index) : null;
      const shrimp = events.filter((x) => x.type === 'fry_eaten').every((e) => isShrimpSpecies((e.cause ?? 'guppy') as FishSpeciesId));
      // 還沒有缸收得了、可是有空的新缸沒養水（#428）：按鈕直接打開養水
      const prep = home === null ? fryPrep(tanks, index) : null;
      const cycle = prep?.kind === 'cycle' && !prep.started ? prep.tank : null;
      push({
        kind: 'eaten',
        tone: 'warn',
        text: `昨晚有 ${fryEatenText(t, eaten, shrimp, home === null ? null : tankLabel(tanks, home), tanks.length > 1)}`,
        action: home !== null ? 'move_fry' : cycle !== null ? 'cycle_tank' : 'fry_box',
        ...(cycle !== null ? { tank: cycle } : {}),
        count: eaten,
      });
    }
    // 育幼盒（#187）：老闆送的、小魚長大自己回主缸
    // 品系那對快生了、照 C15 的選擇自動買了育幼盒（#362）：說一聲錢花到哪
    if (events.some((x) => x.type === 'nursery_gift'))
      push({ kind: 'nursery', tone: 'good', text: '阿德老闆送了一個育幼盒，掛在缸邊。快生的母魚放進去，小魚就不會被吃', action: 'nursery' });
    const released = events.filter((x) => x.type === 'nursery_released').reduce((n, e) => n + (e.count ?? 0), 0);
    if (released > 0) push({ kind: 'nursery', tone: 'good', text: `育幼盒裡 ${released} 尾小魚長到 1.6 cm，回主缸了` });
    if (!snap) return;
    // 長大
    const grown = allFish(t).filter((f) => f.alive && !isJuvenile(f) && snap.fish.get(f.id)?.juvenile);
    if (grown.length > 0) push({ kind: 'grown', tone: 'good', text: `${grown.length} 尾小魚長大了，看得出公母`, action: 'fish', subjectId: grown[0].id, count: grown.length });
    // 缸裡真的發生的事（polish-to-9.md G8）：母魚肚子變大、出現胎斑；公魚追母魚
    // 夢想魚那窩的母魚由懷孕後段的里程碑說（takeBellyNotes）
    const mom = allFish(t).find((f) => {
      const was = snap.fish.get(f.id);
      return f.alive && f.sex === 'female' && f.id !== dreamMom && was && usesNursery(f.species) && bellyStage(f.pregnancy) > bellyStage(was.pregnancy);
    });
    if (mom) {
      const due = bellyStage(mom.pregnancy) === 2;
      const plan = boxBlocked(t) ? fryPlan(tanks, index) : null;
      if (plan)
        // 盒裡還有小魚、母魚放不進去（g37 #428）：先說會怎樣，再說現在能做什麼（搬小魚、新缸養水、買第二缸）
        push({ kind: 'belly', tone: 'warn', text: `${due ? '母魚快生了' : '母魚又懷孕了'}，育幼盒裡還有小魚，她放進去會吃牠們。${plan.tip}`, action: plan.action, ...(plan.tank !== undefined ? { tank: plan.tank } : {}), subjectId: mom.id });
      else
        push(
          due
            ? { kind: 'belly', tone: 'good', text: '母魚肚子後面出現黑色胎斑，快生了', action: t.nurseryBox ? 'nursery' : 'fish', subjectId: mom.id }
            : { kind: 'belly', tone: 'good', text: '母魚的肚子圓起來了，看得出懷孕', action: 'fish', subjectId: mom.id },
        );
    }
    const swimOut = allFish(t).filter((f) => f.alive && (f.generation ?? 0) >= 1 && f.lengthCm >= FRY_SWIMS_OUT_CM && (snap.fish.get(f.id)?.lengthCm ?? FRY_SWIMS_OUT_CM) < FRY_SWIMS_OUT_CM);
    if (swimOut.length > 0 && !isShrimpSpecies(swimOut[0].species))
      push({ kind: 'fry_grew', tone: 'good', text: `${swimOut.length} 尾小魚長到 1 公分，開始游出水草搶飼料了`, action: 'fish', subjectId: swimOut[0].id, count: swimOut.length });
    const mated = events.find((x) => x.type === 'mated');
    if (mated) push({ kind: 'courtship', tone: 'good', text: '公魚整晚追著母魚跑，配對成功了，等下一窩', action: 'fish', subjectId: Number(mated.cause) || mated.subjectId });
    // 你救回來了：測到氨或亞硝、測完換了水，讀數降下來（每缸說一次）
    const test = t.lastTest;
    const level = (r: { ammonia: number; nitrite: number }) => Math.max(r.ammonia, r.nitrite);
    if (!t.rescueNoted && test && level(test.reading) >= MEASURED_PROBLEM_LEVEL && (t.lastWaterChangeHours ?? -1) >= test.hours) {
      const now = testWater(t);
      if (Math.min(level(snap), level(now)) < level(test.reading)) {
        t.rescueNoted = true;
        push({ kind: 'rescued', tone: 'good', text: `換完水，${test.reading.ammonia >= MEASURED_PROBLEM_LEVEL ? '氨' : '亞硝'}讀數降下來了：你救回來了`, action: 'test_water' });
      }
    }
    // 養水
    if (!snap.cycled && isCycled(t)) push({ kind: 'cycled', tone: 'good', text: '水養好了！硝化菌已經長起來，可以開始放魚', action: 'test_water' });
    else if (!isCycled(t)) {
      const now = cycleMaturity(t);
      if (now >= 1) push({ kind: 'cycle', tone: 'info', text: '硝化菌夠了，水裡的氨和亞硝酸還在慢慢降，再等一兩晚', action: 'test_water' });
      else if (pct(now) !== pct(snap.maturity)) push({ kind: 'cycle', tone: 'info', text: `養水進度 ${pct(snap.maturity)} → ${pct(now)}`, action: 'test_water' });
      // 剛開始菌很少，一晚還跳不到下一個百分比
      else if (now > snap.maturity * 1.05) push({ kind: 'cycle', tone: 'info', text: `硝化菌慢慢在長，養水進度 ${pct(now)}。魚的排泄和飼料就是牠們的食物`, action: 'test_water' });
    }
    // 細菌白濁第一次看得出來：說是新缸常見的，玩家才不會以為是生病（企劃 2026-10-21）
    const eco = economy(t);
    if (!eco.bloomNoted && waterLook(t).bloom >= BLOOM_NOTE) {
      eco.bloomNoted = true;
      push({ kind: 'bloom', tone: 'info', text: '水有點白白霧霧的：新缸常見的細菌白濁，水養好就會散', action: 'test_water' });
    }
    // 螺、藻
    const pests = pestCount(t);
    if (pests > snap.pests) push({ kind: 'snails', tone: 'info', text: snap.pests === 0 ? '缸壁上出現第一隻小螺，應該是跟著水草混進來的' : `小螺多了 ${pests - snap.pests} 隻`, action: 'snails', count: pests - snap.pests });
    if (t.algae > snap.algae + 0.05) push({ kind: 'algae', tone: 'warn', text: '玻璃上的藻變多了，光照可能太久或養分太多', action: 'water_change' });
    // 餓
    const living = t.fish.filter((f) => f.alive);
    // 已經餓到在消耗體力的：小魚撐不到一天，平均值還看不出來時就要講清楚（#315）
    const starvingFish = living.filter((f) => !isShrimpSpecies(f.species) && isStarving(f));
    const starving = starvingFish.length;
    // 裝了自動餵食器的缸不再提醒要多餵（daily-loop.md §4），真的餓到消瘦還是要說
    const feeder = !!t.equipment.feeder;
    const twice = !feeder && starving === 0 && living.some((f) => !isShrimpSpecies(f.species) && youngGettingHungry(f));
    // 連 3 天說要多餵、又買得起：提示裝自動餵食器，點了先看商品卡（daily-loop.md §4、§7）。消瘦那天併進消瘦那行、排最前面
    const day = Math.floor(t.hours / 24);
    if (starving > 0 || twice) t.feedWarn = t.feedWarn && t.feedWarn.day === day - 1 ? { day, days: t.feedWarn.days + 1 } : t.feedWarn?.day === day ? t.feedWarn : { day, days: 1 };
    const feederHint = !feeder && (t.feedWarn?.day === day ? t.feedWarn.days : 0) >= FEEDER_HINT_DAYS && economy(tanks[0]).coins >= price('feeder:auto');
    const hint = { kind: 'hungry', tone: 'info', text: `${tanks.length > 1 ? tankLabel(tanks, index) : '這缸'}小魚多，可以裝自動餵食器，一天自動餵兩次（${price('feeder:auto')} 元）`, action: 'buy_feeder' } as const;
    if (starving > 0) {
      // 消瘦永遠排第一行、不收進鈴鐺；種魚在消瘦要寫出名字（midgame.md §7.9）
      const breeders = breederIds(tanks);
      const named = starvingFish.filter((f) => breeders.has(f.id));
      const text = named.length > 0 ? `${[...new Set(named.map((f) => breederName(tanks, f)))].join('、')}開始消瘦了` : `${starving} 尾魚${feederHint ? '' : '餓到'}開始消瘦，今天不餵會餓死`;
      const subject = named.length > 0 ? { subjectId: named[0].id } : {};
      if (feederHint) push({ kind: 'hungry', tone: 'warn', text, action: 'buy_feeder', goLabel: '裝自動餵食器', starving: true, ...subject });
      else push({ kind: 'hungry', tone: 'warn', text, action: 'feed', starving: true, ...subject });
    } else if (!feeder && living.length > 0 && living.reduce((a, f) => a + f.hunger, 0) / living.length > HUNGRY) push({ kind: 'hungry', tone: 'warn', text: '魚在水面游來游去討食，該餵了', action: 'feed' });
    // 小魚兩倍快變餓：一天只餵一次的話，下一餐前就會餓到消耗體力，還沒到要叫醒的程度就在這裡提醒（#193）
    else if (twice) {
      if (feederHint) items.push({ ...hint, tank: index });
      else push({ kind: 'hungry', tone: 'info', text: '小魚長得快、餓得也快，一天餵兩次比較好', action: 'feed' });
    }
    // 新缸症候群（P6）：測試劑讀到的氨昨晚第一次到 0.25，換水就是在解決量得到的問題
    const ammonia = testWater(t).ammonia;
    const ammoniaCrisis = crisis?.reason === 'ammonia' && crisis.tank === index;
    if (!ammoniaCrisis && living.length > 0 && ammonia >= MEASURED_PROBLEM_LEVEL && snap.ammonia < MEASURED_PROBLEM_LEVEL)
      // 換三成讀數掉不下來的話（第 1 天讀 0.25 時）叫玩家換一半，換完再測看得到變化（#237）
      push({ kind: 'ammonia', tone: 'warn', text: `氨 ${ammonia}，水開始髒了，${suggestedWaterChange(t) === BIG_WATER_CHANGE ? '換一半的水' : '換三成水'}`, action: 'water_change' });
    // 缺氧（oxygen.ts）：浮頭累積半天就先說（黃，不出任務卡）；低到開始傷魚是紅的、排最前面，任務卡也會叫
    const gasp = breathless(t);
    if (gasp?.recovering) push({ kind: 'oxygen', tone: 'info', text: `打氣機開了，溶氧 ${gasp.o2.toFixed(1)}，在回升` });
    else if (gasp) {
      const fix = oxygenFix(t);
      const air = fix === 'air_on' ? '打開打氣機' : fix === 'buy_air' ? `加一台打氣機（${airPumpPrice()} 元）` : '';
      const o2 = gasp.o2.toFixed(1);
      const action = fix === 'water' ? 'water_change' : 'add_air';
      if (gasp.harm) push({ kind: 'oxygen', tone: 'bad', text: `溶氧只剩 ${o2}，魚開始缺氧受傷，${air || '先換水'}`, action, standing: true });
      else push({ kind: 'oxygen', tone: 'warn', text: `魚在水面喘氣，溶氧 ${o2}，${air ? `可以${air}或換水` : '先換水'}`, action });
    }
    // 水草長了一點（睡前就種著的那幾株，合計長了 1% 以上才寫；沒照光的晚上不會長）
    let plantsBefore = 0;
    let plantsNow = 0;
    for (const p of t.plants) {
      const was = snap.plants.get(p.id);
      if (was === undefined) continue;
      plantsBefore += was;
      plantsNow += p.biomassG;
    }
    // 水草長出新葉（G8）：一片葉子算插枝重量的 1/LEAF_PER_CUTTING，有一株多長了一片就寫，這晚就不另外寫長了幾 %
    const leaf = t.plants.find((p) => {
      const was = snap.plants.get(p.id);
      const leafG = PLANT_SPECIES[p.species].cuttingMassG / LEAF_PER_CUTTING;
      return was !== undefined && Math.floor(p.biomassG / leafG) > Math.floor(was / leafG);
    });
    // 水草長葉、長大幾乎天天有：算日常（info），不拿來當「有好消息」的開頭（#258）
    if (leaf) push({ kind: 'new_leaf', tone: 'info', text: `${PLANT_SPECIES[leaf.species].name}長出新葉了`, plantId: leaf.id });
    else if (plantsBefore > 0 && plantsNow >= plantsBefore * PLANT_GREW) {
      const grew = Math.round((plantsNow / plantsBefore - 1) * 100);
      push({ kind: 'plant_grew', tone: 'info', text: `水草長了一點（+${grew}%）`, count: grew });
    }
    // 魚放鬆了：睡前睡後都活著的魚，平均壓力降了一截（壓力低就不躲、鰭張開）；發色真的變好才說顏色變亮。
    // 剛放進這缸 2 天內的魚才說「適應新家」；老住戶要昨晚真的緊張過（換缸、生病、水質）才說，不然天天都有這行（#237）
    const both = living.filter((f) => snap.fish.get(f.id)?.alive);
    const newcomers = both.filter((f) => f.arrivedHours !== undefined && t.hours - f.arrivedHours <= SETTLING_HOURS);
    const settling = newcomers.length > 0 ? newcomers : both;
    if (settling.length > 0) {
      const avg = (get: (f: (typeof settling)[number]) => number) => settling.reduce((a, f) => a + get(f), 0) / settling.length;
      const was = avg((f) => snap.fish.get(f.id)!.stress);
      const stressDrop = was - avg((f) => f.stress);
      // 畫面的發色加成以 0.25 為一級（tank-view.ts），有魚升了一級才看得出來
      const level = (x: number) => Math.round(x * 4);
      const brighter = settling.some((f) => level(f.colorBoost ?? 0) > level(snap.fish.get(f.id)!.colorBoost));
      const residentQuiet = t.relaxedNoteHours !== undefined && t.hours - t.relaxedNoteHours < RESIDENT_RELAXED_GAP_HOURS;
      if (stressDrop >= RELAXED_DROP && (newcomers.length > 0 || (was >= WAS_TENSE && !residentQuiet))) {
        if (newcomers.length === 0) t.relaxedNoteHours = t.hours;
        const text = newcomers.length > 0 ? (brighter ? '新來的魚放鬆了，顏色變亮' : '新來的魚慢慢適應新家，放鬆了') : brighter ? '魚不緊張了，顏色也變亮了' : '昨天緊張的魚放鬆了，鰭又張開了';
        push({ kind: 'fish_relaxed', tone: 'good', text, action: 'fish', subjectId: settling[0].id });
      }
    }
    // 開缸挑的設備有後果（G5）：第 3～10 天每天一句，每種設備只說一次
    const gear = takeGearNote(t);
    if (gear) push({ kind: 'gear', tone: 'info', text: gear.text, action: gear.key === 'filter' || gear.key === 'heater' || gear.key === 'air' ? 'equipment' : gear.key === 'substrate' ? 'test_water' : undefined });
    // 訂單
    const fresh = orderBoard(t).orders.filter((o) => !snap.orders.has(o.id)).length;
    if (fresh > 0 && index === 0) push({ kind: 'orders', tone: 'info', text: `阿德那邊來了 ${fresh} 張新訂單`, action: 'orders', count: fresh });
  });
  // 自己繁殖的小魚第一次轉色：長得像誰（G2），整個存檔只出一次
  const look = takeLookalike(tanks);
  if (look) {
    const where = tanks.length > 1 ? `${tankLabel(tanks, look.tank)}：` : '';
    items.push({ kind: 'lookalike', tank: look.tank, tone: 'good', text: where + lookalikeLine(look), action: 'fish', subjectId: look.childId, lookalike: look });
  }
  // 種魚的成長里程碑（midgame.md §5.3）：每到一個就一張有圖的卡
  for (const m of takeMilestones(tanks)) {
    const at = tanks.findIndex((t) => t.fish.some((f) => f.id === m.fishId));
    items.push({ kind: 'milestone', tank: Math.max(0, at), tone: 'good', text: m.text, action: 'fish', subjectId: m.fishId, milestone: { step: m.step, fishId: m.fishId, partnerId: m.partnerId, earlierDays: m.earlierDays } });
  }
  // 開獎（midgame.md §6.1 C15）：夢想魚配方那窩生了，小魚一尾一尾亮出來
  const reveal = takeReveal(tanks);
  if (reveal) {
    const at = tanks.findIndex((t) => t.fish.some((f) => f.id === reveal.momId));
    items.push({ kind: 'reveal', tank: Math.max(0, at), tone: 'good', text: reveal.text, action: 'fish', subjectId: reveal.momId, count: reveal.fry.length, reveal: { dream: reveal.dream, fry: reveal.fry } });
  }
  // C9 第二窩生了（midgame.md §5.2）：照玩家選的處理，和第一窩一起比
  const brood2 = takeSecondBrood(tanks);
  if (brood2) {
    const at = tanks.findIndex((t) => t.fish.some((f) => f.id === brood2.momId));
    const { momId, count, prevKids, kept, choice } = brood2;
    items.push({ kind: 'second_brood', tank: Math.max(0, at), tone: 'good', text: brood2.text, action: 'fish', subjectId: momId, count, secondBrood: { momId, count, prevKids, kept, choice } });
  }
  // 中期的選擇點（design/midgame.md）：一個早上最多一張
  const lastBefore = tanks.map((t) => t.events[t.events.length - 1]);
  const choice = takeChoice(tanks);
  // 留種的窩快生了，takeChoice 裡自動買了育幼盒（#362）：事件是這時候才記的，所以在這裡看
  tanks.forEach((t, index) => {
    const bought = t.events.slice(t.events.lastIndexOf(lastBefore[index]) + 1).find((x) => x.type === 'nursery_bought');
    if (!bought) return;
    const where = tanks.length > 1 ? `${tankLabel(tanks, index)}：` : '';
    items.push({ kind: 'nursery', tank: index, tone: 'info', text: `${where}留種的母魚快生了，花 ${bought.count ?? 150} 元買了一個育幼盒，已經把她放進去，小魚才不會被吃`, action: 'nursery' });
  });
  if (choice) items.push({ kind: 'choice', tank: choice.tank, tone: 'good', text: choice.title, choice, action: CHOICE_FOLLOW[choice.id] });
  // 擠缸（midgame.md §7.1）：超過建議量排第一行；出 C14 的那缸不再重複預告
  for (const n of takeCrowdNotes(tanks, choice?.id === 'C14' ? choice.tank : undefined)) {
    items.push({ kind: 'crowd', tank: n.tank, tone: n.full ? 'bad' : 'warn', text: n.text });
  }
  // 顯色到可以配之間的成長卡（midgame.md §6.7）：當天已經有別的卡就往後挪
  const grow = takeGrowMilestone(tanks, items.some((i) => i.kind === 'choice' || i.kind === 'milestone' || i.kind === 'reveal'));
  if (grow) {
    const at = tanks.findIndex((t) => t.fish.some((f) => f.id === grow.fishId));
    items.push({ kind: 'milestone', tank: Math.max(0, at), tone: 'good', text: grow.text, action: 'fish', subjectId: grow.fishId, milestone: { step: grow.step, fishId: grow.fishId, partnerId: grow.partnerId } });
  }
  // 夢想魚那窩懷孕後段的里程碑、生病拖慢配對（midgame.md §6.4）、C9 自動照上次（§6.5）。
  // 放在 takeChoice 後面：早上的小事（lateHousekeeping）當天記下的，當天就說
  for (const n of takeBellyNotes(tanks)) {
    // 同一尾的一般胎斑那行（上面每缸的「出現黑色胎斑」）讓給里程碑
    const plain = items.findIndex((i) => i.kind === 'belly' && i.subjectId === n.fishId);
    if (plain >= 0) items.splice(plain, 1);
    const at = tanks.findIndex((t) => t.fish.some((f) => f.id === n.fishId));
    items.push({ kind: 'belly', tank: Math.max(0, at), tone: 'good', text: n.text, action: 'fish', subjectId: n.fishId, broodSetting: n.setting });
  }
  // 固定品系（strain-fixing.md）：蛇紋出來、這窩的穩定度
  for (const n of takeLineNotes(tanks)) {
    const at = tanks.findIndex((t) => t.fish.some((f) => f.id === n.fishId));
    const named = n.done ? choiceState(tanks).lineNamed : undefined;
    items.push({ kind: 'line', tank: Math.max(0, at), tone: 'good', text: n.text, action: 'fish', subjectId: n.fishId, ...(named ? { lineDone: { name: named.name, stability: n.stability ?? 0 } } : {}) });
  }
  // 還沒處理的危機（#375）：白天卡住的加熱棒、越來越燙的水、沒撈的死魚，昨晚沒有新事件也每天早上說，直到處理好
  for (const c of crisisTodos(tanks)) {
    // 空缸拔了插頭的壞加熱棒不用每天早上說（#400，g30：40 尾冷死後每天都叫你換）；全家死光時下面「魚都沒了」那行會說
    if (lingering(c) && !tanks[c.tank].fish.some((f) => f.alive)) continue;
    const same = items.filter((i) => i.tank === c.tank);
    const told = c.go === 'remove_dead' ? same.some((i) => i.kind === 'death' || (i.kind === 'crisis' && i.action === 'remove_dead')) : same.some((i) => i.kind === 'equipment' || (i.kind === 'crisis' && i.action === 'equipment'));
    if (told) continue;
    const where = tanks.length > 1 && !/^停電中/.test(c.text) ? `${tankLabel(tanks, c.tank)}：` : '';
    items.push({ kind: c.go === 'remove_dead' ? 'death' : 'equipment', tank: c.tank, tone: 'bad', text: where + c.text, action: c.go ?? 'equipment', standing: true });
  }
  // 冬天加熱棒弄不到（#400、#401，mvp.md §4.4.6）：第一步先把魚搬去有加熱棒的缸
  const movesAll = new Set<number>();
  tanks.forEach((_, index) => {
    // 錢夠買撐得住的便宜加熱棒：這行取代搬魚和保溫（#404）
    const cheap = cheapHeaterStep(tanks, index);
    if (cheap) {
      movesAll.add(index);
      const cold = items.find((i) => i.tank === index && i.action === 'equipment' && /水溫偏低/.test(i.text));
      if (cold) Object.assign(cold, { kind: 'crisis', text: cheap, action: 'buy_heater', goLabel: '買一支' });
      else items.push({ kind: 'crisis', tank: index, tone: 'bad', text: cheap, action: 'buy_heater', goLabel: '買一支', standing: true });
      return;
    }
    const step = warmMoveStep(tanks, index);
    if (!step) return;
    // 只搬得走一部分、留下的要保溫：併成一行，點「搬魚」兩件一起做（g34：同一缸寫了兩行，polish-to-9 §7.3）
    movesAll.add(index);
    const all = warmMove(tanks, index)?.fish.length === tanks[index].fish.filter((f) => f.alive).length;
    const both = !all && needsInsulation(tanks[index]);
    const text = both ? `${step}，其他的先保溫` : step;
    const goLabel = '搬魚';
    const cold = items.find((i) => i.tank === index && i.action === 'equipment' && /水溫偏低/.test(i.text));
    if (cold) Object.assign(cold, { kind: 'crisis', text, action: 'move_warm', goLabel });
    else items.push({ kind: 'crisis', tank: index, tone: 'bad', text, action: 'move_warm', goLabel, standing: true });
  });
  // 冬天沒加熱棒（#397，mvp.md §4.4.6）：第一行叫玩家先保溫，點一下就做好
  tanks.forEach((t, index) => {
    // 要搬魚的缸已經在搬魚那行說了（魚全搬走就不用保溫）
    if (!needsInsulation(t) || movesAll.has(index)) return;
    const where = tanks.length > 1 ? `${tankLabel(tanks, index)}：` : '';
    const text = `${where}水溫偏低（${t.water.tempC.toFixed(1)}°C），先保溫：缸外包毛巾、泡溫水瓶`;
    const cold = items.find((i) => i.tank === index && i.action === 'equipment' && /水溫偏低/.test(i.text));
    if (cold) Object.assign(cold, { kind: 'crisis', text, action: 'insulate', goLabel: '保溫' });
    else items.push({ kind: 'crisis', tank: index, tone: 'bad', text, action: 'insulate', goLabel: '保溫', standing: true });
  });
  // 跟阿德賒的加熱棒（#397）：昨晚有還錢就說還剩多少，還清了也說一聲
  const owed = economy(tanks[0]).heaterLoan ?? 0;
  if ((before.heaterLoan ?? 0) !== owed && before.heaterLoan !== undefined) {
    items.push({ kind: 'loan', tank: 0, tone: owed > 0 ? 'info' : 'good', text: owed > 0 ? `還了阿德 ${before.heaterLoan! - owed} 元加熱棒的錢，還剩 ${owed} 元` : '跟阿德賒的加熱棒錢還清了' });
  } else if (owed > 0 && (economy(tanks[0]).loanWaived ?? 0) > (before.loanWaived ?? 0)) {
    // 手上太少或缸還沒穩，昨晚的收入先不扣（mvp.md §4.4.6 g33）
    items.push({ kind: 'loan', tank: 0, tone: 'info', text: `阿德說不急，等你缸穩了再還（還欠 ${owed} 元）` });
  }
  // 魚都死光了（#377）：每天早上第一行說怎麼了、從哪裡重新開始，直到缸裡又有魚
  const wiped = wipedOut(tanks);
  // 太冷的話先去弄加熱棒（#397）
  const go = wiped?.target === 'equipment' || wiped?.target === 'orders' || wiped?.target === 'heater_credit' ? wiped.target : 'shop_fish';
  const goLabel = { equipment: '去換', orders: '看訂單', heater_credit: '先賒一支', shop_fish: wiped?.claim ? '去領' : '去買魚' }[go];
  if (wiped) items.push({ kind: 'wiped', tank: wiped.tank ?? 0, tone: 'bad', text: wiped.text, action: go, goLabel, standing: true });
  // 選育進度（midgame.md §2）：有第一窩或留種的魚就每天一行，取代一般的小觀察
  const progress = crisis ? null : breedingProgress(tanks);
  if (progress) items.push({ kind: 'breeding', tank: 0, tone: 'good', text: progress });
  // 選擇的回音（polish-to-9.md §10.0）
  const choices = choiceState(tanks);
  for (const e of takeEchoes(tanks, choices, callName)) items.push({ kind: 'echo', tank: e.tank, tone: 'info', text: e.text, echo: e.label, ...(e.retry ? { echoRetry: e.retry } : {}) });
  // 安靜的一晚（沒好事、沒壞事、也沒要留意的）：帶一句缸裡的小變化（#258）
  if (!crisis && !progress && tanks[0] && before.tanks[0] && items.every((i) => i.tone === 'info')) {
    const text = quietObservation(tanks[0], tanks[0], before.tanks[0]);
    if (text) items.push({ kind: 'observe', tank: 0, tone: 'info', text });
  }
  if (items.length === 0) items.push({ kind: 'quiet', tank: 0, tone: 'info', text: quietText(tanks) });
  items.sort((a, b) => kindRank(a) - kindRank(b) || TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || (a.kind === 'fish_relaxed' ? 1 : 0) - (b.kind === 'fish_relaxed' ? 1 : 0));
  const day = Math.floor(tanks[0].hours / 24) + 1;
  const report: MorningReport = { title: crisis ? '半夜出狀況了' : `早安，第 ${day} 天`, hours: sleptHours, stopped: !!crisis, items };
  // 擠不進 3 行的回音隔天早上再出（#452：選完 3 天內一定要看得到，polish-to-9.md §10.0）
  const shown = new Set(slimReport(report).lines);
  for (const i of items) {
    if (i.kind === 'echo' && !shown.has(i) && (i.echoRetry ?? 0) < ECHO_RETRIES) addEcho(choices, { label: i.echo!, tank: i.tank, due: tanks[0].hours, text: i.text, retry: (i.echoRetry ?? 0) + 1 });
  }
  return report;
}

/** 回音擠不進報告最多再延後幾個早上（選完 3 天內一定出，polish-to-9.md §10.0）。 */
export const ECHO_RETRIES = 2;
/** 早上報告一次最多幾行重點（daily-loop.md §2），選擇卡另外一行。 */
export const REPORT_LINES = 3;
/** 選擇卡在報告上只寫這一行，點了才打開（tutorial-lines.md §13）。 */
export const DECISION_LINE = '有一件事要你決定';
/** 第一隻小螺那行（教學會接著講），照樣上報告。 */
const FIRST_PEST = '缸壁上出現第一隻小螺';

/** 缸上的小標記（點了才出一句，tutorial-lines.md §13）：水草長了、小螺多了、新訂單。note 是收進鈴鐺的那句。 */
export interface TankMark {
  kind: 'plant' | 'snail' | 'orders';
  tank: number;
  text: string;
  note: string;
  /** 長新葉的那株（標記放在它上面）。 */
  plantId?: number;
}

/** 畫面真的要列出來的早上報告（daily-loop.md §2）。 */
export interface SlimReport {
  /** 最多 REPORT_LINES 行：要處理的壞消息 → 目標的進度 → 好消息。 */
  lines: ReportItem[];
  /** 今天的選擇卡（報告上只寫「有一件事要你決定 ›」）。 */
  decision: ReportItem | null;
  /** 選擇卡排在最前面（品系取名那天，比照開獎）。 */
  decisionFirst: boolean;
  /** 沒擠進報告的：收進鈴鐺。 */
  rest: ReportItem[];
  /** 改放到缸上小標記的日常小事（也收進鈴鐺）。 */
  marks: TankMark[];
}

/** 不上報告的日常小事（daily-loop.md §2）：水草、新葉、小螺、新訂單、魚放鬆了、小觀察。 */
const isMinor = (i: ReportItem) => ['plant_grew', 'new_leaf', 'orders', 'fish_relaxed', 'observe'].includes(i.kind) || (i.kind === 'snails' && !i.text.includes(FIRST_PEST));
/** 目標的進度：養水、懷孕、轉色、開獎、穩定度、種魚里程碑。 */
const GOAL_KINDS: ReadonlySet<ReportKind> = new Set(['cycle', 'cycled', 'belly', 'courtship', 'lookalike', 'milestone', 'breeding', 'second_brood', 'line', 'grown']);

/**
 * 永遠排在最前面、不占 3 行名額、不收進鈴鐺的（#375、midgame.md §7.9）：半夜的危機、死魚、設備出事、
 * 還沒處理的危機（水溫超出魚能撐的、沒撈的死魚）、魚在消瘦。
 */
export const isPinned = (i: ReportItem): boolean => !!i.starving || !!i.standing || i.kind === 'crisis' || i.kind === 'death' || i.kind === 'equipment';
/** 報告上的順序：半夜的危機、開獎 → 要處理的壞消息 → 目標的進度 → 好消息 → 其他。 */
function lineRank(i: ReportItem, lead = false): number {
  // 魚都死光了（#382）排在所有危機前面：先說從哪裡重新開始
  if (i.kind === 'wiped') return -2;
  // 危機（#375）和消瘦（midgame.md §7.9）永遠排第一行
  if (isPinned(i)) return -1;
  if (i.kind === 'crisis') return 0;
  if (i.kind === 'reveal' || i.kind === 'countdown') return 1;
  // 回音（polish-to-9.md §10.5）：第一行回音排在壞消息後面、目標進度前面（#452：排在目標後面幾乎天天被擠掉），
  // 其他的排在目標後面，放不下就收進鈴鐺、隔天再出
  if (i.kind === 'echo') return lead ? 2.5 : 3.5;
  if (isBadNews(i) || i.tone === 'warn') return 2;
  if (GOAL_KINDS.has(i.kind)) return 3;
  if (i.tone === 'good') return 4;
  return 5;
}

/** 報告每一行的圖示分三類（daily-loop.md §2）：要處理的壞消息、目標的進度、好消息。 */
export function lineGroup(i: ReportItem): 'bad' | 'goal' | 'good' {
  const rank = lineRank(i);
  return rank <= 0 || rank === 2 ? 'bad' : rank === 1 || rank === 3 ? 'goal' : 'good';
}

function markOf(i: ReportItem): TankMark | null {
  const n = i.count ?? 1;
  if (i.kind === 'plant_grew') return { kind: 'plant', tank: i.tank, text: `長了一點（+${n}%）`, note: i.text };
  // 多缸時前面有「缸名：」，標記已經在那一缸上了
  if (i.kind === 'new_leaf') return { kind: 'plant', tank: i.tank, text: i.text.replace(/^[^：]*：/, ''), note: i.text, ...(i.plantId !== undefined ? { plantId: i.plantId } : {}) };
  if (i.kind === 'snails' && !i.text.includes(FIRST_PEST)) return { kind: 'snail', tank: i.tank, text: `多了 ${n} 隻`, note: i.text };
  if (i.kind === 'orders') return { kind: 'orders', tank: i.tank, text: `阿德那邊有 ${n} 張新訂單`, note: i.text };
  return null;
}

/**
 * 早上報告瘦身（daily-loop.md §2）：最多 3 行重點，加最多一張選擇卡（只寫一行，點了才打開）；
 * 水草、小螺、新訂單改放到缸上的小標記，其他擠不下的收進鈴鐺。安靜的早上只寫一行。
 */
export function slimReport(report: MorningReport): SlimReport {
  const decision = report.items.find((i) => i.choice) ?? null;
  const rest = report.items.filter((i) => i !== decision);
  const marks = rest.map(markOf).filter((m): m is TankMark => !!m);
  const main = rest.filter((i) => !isMinor(i));
  const lead = main.find((i) => i.kind === 'echo');
  const rank = (i: ReportItem) => lineRank(i, i === lead);
  const ranked = main.map((item, at) => ({ item, at })).sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at).map((x) => x.item);
  // 危機和消瘦那幾行不佔 3 行的名額（#375、midgame.md §7.9）
  const pinned = ranked.filter(isPinned);
  // 開獎倒數（polish-to-9.md §12.1）接在危機後面當開頭，也不佔 3 行的名額
  const countdown = ranked.filter((i) => i.countdown && !isPinned(i));
  let lines = [...pinned, ...countdown, ...ranked.filter((i) => !isPinned(i) && !countdown.includes(i)).slice(0, REPORT_LINES)];
  // 安靜的早上：一行就好，有小觀察就放小觀察
  if (lines.length === 0 && !decision) lines = [rest.find((i) => i.kind === 'observe' || i.kind === 'quiet') ?? rest.find((i) => i.kind === 'fish_relaxed') ?? { kind: 'quiet', tank: 0, tone: 'info', text: '昨晚很平靜' }];
  const shown = new Set(lines);
  return {
    lines,
    decision,
    decisionFirst: decision?.choice?.id === 'C18',
    rest: rest.filter((i) => !shown.has(i) && !markOf(i)),
    marks,
  };
}

/**
 * 離線回來的報告（midgame.md §7.7）：離開期間有缸超過建議量，第一行寫「你不在的時候{缸名}太擠了」，接著出 C14（節流見 takeAwayCrowd）。
 * 沒擠過、或今天說過了回 null（回來只照舊跳通知）。
 */
export function awayReport(tanks: TankState[], sinceHours: number, awayHours: number): MorningReport | null {
  const { notes, choice } = takeAwayCrowd(tanks, sinceHours);
  if (notes.length === 0) return null;
  const items: ReportItem[] = notes.map((n) => ({ kind: 'crowd', tank: n.tank, tone: 'bad', text: n.text }));
  if (choice) items.push({ kind: 'choice', tank: choice.tank, tone: 'good', text: choice.title, choice, action: CHOICE_FOLLOW[choice.id] });
  return { title: '你回來了', hours: awayHours, stopped: false, items };
}

/** 選了以後要帶玩家去哪裡（C1 放育幼盒、C3 買缸；其他選了就好）。 */
const CHOICE_FOLLOW: Partial<Record<ChoiceCard['id'], ReportAction>> = { C1: 'fry_box', C3: 'shop_tank' };

/** 選了這個選項，要不要帶玩家去做（C1 選留在主缸、C3 都要去買缸）。 */
export function choiceFollowUp(card: ChoiceCard, key: string): ReportAction | undefined {
  if (card.id === 'C1') return key === 'box' ? 'fry_box' : undefined;
  // C14 缸快滿了：再買一缸、換大缸直接打開那個缸的購買確認（polish-to-9.md §10.2）
  if (card.id === 'C14') return key === 'tank' ? 'buy_tank' : key === 'big' ? 'buy_big' : undefined;
  return CHOICE_FOLLOW[card.id];
}

/** 一條死魚的報告文字（魚撈掉了就叫「一條魚」）。 */
function deathLine(t: TankState, e: SimEvent): string {
  const fish = allFish(t).find((f) => f.id === e.subjectId);
  return deathText(fish ? FISH_SPECIES[fish.species].name : '一條魚', e, fish);
}

/** 昨晚的發病事件，依病分組（白點一組、柱狀病一組、鰓吸蟲一組），照第一次出現的順序。 */
function groupSick(events: SimEvent[]): SimEvent[][] {
  const groups = new Map<string, SimEvent[]>();
  for (const e of events) {
    const key = e.type === 'ich_visible' ? 'ich' : e.type === 'disease_visible' ? (e.cause ?? 'disease') : null;
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.values()];
}

/** 好幾條魚發同一種病時的一行字。白點把這一波的原因都寫出來。 */
function sickText(sick: SimEvent[], n: number): string {
  const e = sick[0];
  if (e.type === 'ich_visible') {
    const causes = [...new Set(sick.map(ichCauseText).filter((x) => x))].map((x) => x.replace('。原因：', ''));
    return `${n} 條魚有白點${causes.length ? `。原因：${causes.join('；')}` : ''}`;
  }
  return e.cause === 'columnaris' ? `${n} 條魚嘴巴和身上長出白色棉絮狀的斑：柱狀病，快下抗生素` : `${n} 條魚鰓蓋張開、呼吸很急：水質正常的話是鰓吸蟲，下驅蟲藥`;
}

/** 水草合計長到睡前的幾倍才寫進報告（基本燈下莫絲一整天約長 1.5%，2% 就永遠不會出現）。 */
const PLANT_GREW = 1.01;
/** 同一缸連幾天說要多餵，就提示裝自動餵食器（daily-loop.md §4）。 */
export const FEEDER_HINT_DAYS = 3;
/** 一株插枝有幾片葉子（新葉的重量＝插枝重量 / 這個數；小榕大約一週一片，G8）。 */
const LEAF_PER_CUTTING = 4;
/** 小魚長到這麼長，就會游出水草到水面搶飼料（G8 早上報告的小里程碑）。 */
const FRY_SWIMS_OUT_CM = 1;
const bellyStage = (pregnancy: number) => (pregnancy >= DUE_PREGNANCY ? 2 : pregnancy >= BELLY_SHOWS ? 1 : 0);
/** 魚的平均壓力（0–1）一晚降多少才算「放鬆了」（新魚 0.5，第一天約降到 0.3～0.43）。 */
const RELAXED_DROP = 0.05;
/** 放進這缸多久以內算「新來的」（遊戲小時）。 */
const SETTLING_HOURS = 48;
/** 老住戶睡前平均壓力要到這麼高（換缸、生病、水質不好過）才算昨天緊張過。 */
const WAS_TENSE = 0.25;
/** 老住戶的「放鬆了」最少隔幾個遊戲小時才再說。 */
const RESIDENT_RELAXED_GAP_HOURS = 72;

const pct = (x: number) => `${Math.round(Math.min(1, x) * 100)}%`;

function crisisAction(c: Crisis): ReportAction {
  switch (c.reason) {
    case 'fish_died':
      return 'remove_dead';
    case 'ich_visible':
    case 'disease_visible':
      return 'treat';
    case 'ammonia':
    case 'nitrite':
      return 'water_change';
    case 'starving':
      return 'feed';
    default:
      return 'equipment';
  }
}
